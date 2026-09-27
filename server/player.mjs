import { readFile, writeFile, mkdir, rename, access } from 'node:fs/promises';
import { dirname } from 'node:path';

export function parsePlayer(value, origin) {
  if (!value || value.format !== 'target-test-player-v1' || value.origin !== origin ||
      !/^[a-f0-9]{64}$/.test(value.id || '') || !/^[a-f0-9]{64}$/.test(value.token || '') ||
      typeof value.displayName !== 'string' || !value.displayName.trim() || value.displayName.length > 24 ||
      /[\u0000-\u001f\u007f]/.test(value.displayName) || !/^TT#[0-9]{5}$/.test(value.connectCode || '')) throw new Error('Invalid challenge player file');
  return { format: value.format, origin, id: value.id, displayName: value.displayName, connectCode: value.connectCode, token: value.token, ...(/^[a-z0-9][a-z0-9_]{2,23}$/.test(value.slug || '') ? { slug: value.slug } : {}) };
}
export const playerIdentity = file => ({ id: file.id, displayName: file.displayName, connectCode: file.connectCode, source: 'challenge', verified: false, ...(file.slug ? { slug: file.slug } : {}) });
export async function readPlayer(path, origin) {
  try { const text = await readFile(path, 'utf8'); if (text.length > 4096) return null; return parsePlayer(JSON.parse(text.replace(/^\uFEFF/, '')), origin); } catch { return null; }
}
export async function savePlayer(path, file) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(file, null, 2) + '\n', { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}

// Moving from the standard profile to the replay profile must retain the player
// already imported for this challenge. Verify with the site before copying a key.
export async function restoreProfilePlayer(destination, previous, origin, verify) {
  const current = await readPlayer(destination, origin);
  if (current) { await verify(current); return current; }
  // Never silently replace an existing invalid file or another player's file.
  try { await access(destination); return null; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!previous || previous === destination) return null;
  const legacy = await readPlayer(previous, origin);
  if (!legacy) return null;
  await verify(legacy);
  await savePlayer(destination, legacy);
  return legacy;
}
