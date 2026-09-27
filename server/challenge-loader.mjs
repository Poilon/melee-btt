import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateChallenge, validateGecko } from '../src/challenge.mjs';
import { sha256 } from '../src/upstream.mjs';

export async function loadChallenge(root, directory) {
  const manifestBytes = await readFile(join(directory, 'challenge.json'));
  const stored = JSON.parse(manifestBytes), code = await readFile(join(directory, 'code.txt'), 'utf8');
  let release;
  try { release = JSON.parse(await readFile(join(root, 'release.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (release) {
    // Release snapshots are built from the verified generator. The distributable
    // does not need to ship its upstream sources or require a development setup.
    if (sha256(manifestBytes) !== release.challengeSha256 || sha256(code) !== release.geckoSha256 || stored.geckoSha256 !== release.geckoSha256) throw new Error('Challenge files do not match this release. Extract a fresh download.');
    validateGecko(code);
    return { manifest: stored, gecko: code };
  }
  const generated = await generateChallenge(stored.rules);
  if (stored.id !== generated.manifest.id || code !== generated.gecko || JSON.stringify(stored.assignments) !== JSON.stringify(generated.manifest.assignments)) throw new Error('Challenge files do not match the generator.');
  return generated;
}
