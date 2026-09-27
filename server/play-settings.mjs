import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import {validPlaySettings,defaultPlaySettings,normalizePlaySettings} from '../shared/play-settings.mjs';
export {validPlaySettings};

export class PlaySettings {
  constructor(path) { this.path = path; this.value = defaultPlaySettings(); this.queue = Promise.resolve(); }
  async initialize() {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8'));
      if (!validPlaySettings(value)) throw new Error('Invalid play settings.');
      this.value = normalizePlaySettings(value);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  get() { return structuredClone(this.value); }
  async save(value) {
    if (!validPlaySettings(value)) throw new Error('Invalid play settings.');
    const input = structuredClone(value);
    const task = this.queue.then(async () => {
      const next = normalizePlaySettings(input,this.value);
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
