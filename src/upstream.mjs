import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const root = new URL('../', import.meta.url);
export const revision = '54e8faa7c58ee146e9ce9beac2bc390d36e75871';
export const sources = Object.freeze({
  'randomizer.js': 'afccf5a09ce384c05669d3ef4e5c829220ba1e2806f7f37db52451392d487fed',
  'seedrandom.js': '808271654f6691690a6a1e3d459ba35c74cedea5863f1b1e112b1cfbb946d784',
});
export const sha256 = data => createHash('sha256').update(data).digest('hex');

export function verifySource(name, data) {
  if (!Object.hasOwn(sources, name) || sha256(data) !== sources[name]) {
    throw new Error(`Source différente de la version attendue : ${name}`);
  }
}

export async function readSources() {
  const result = {};
  for (const name of Object.keys(sources)) {
    let data;
    try {
      data = await readFile(new URL(`.cache/bttrandomizer/${name}`, root));
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('Lance d’abord npm run setup.');
      throw error;
    }
    verifySource(name, data);
    result[name] = data.toString('utf8');
  }
  return result;
}
