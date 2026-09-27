import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export function validPlaySettings(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 2 && typeof value.music === 'boolean' && typeof value.rumble === 'boolean';
}

export class PlaySettings {
  constructor(path) { this.path = path; this.value = { music: true, rumble: true }; this.queue = Promise.resolve(); }
  async initialize() {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8'));
      if (!validPlaySettings(value)) throw new Error('Invalid play settings.');
      this.value = value;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  get() { return { ...this.value }; }
  async save(value) {
    if (!validPlaySettings(value)) throw new Error('Invalid play settings.');
    const next = { music: value.music, rumble: value.rumble };
    const task = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path + '.tmp', JSON.stringify(next) + '\n', { mode: 0o600 });
      await rename(this.path + '.tmp', this.path);
      this.value = next;
      return this.get();
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
