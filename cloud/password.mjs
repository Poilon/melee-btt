import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const validPassword = value => typeof value === 'string' && value.length >= 8 && value.length <= 128;
export const normalizeUsername = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_]{2,23}$/.test(value.trim().toLowerCase()) ? value.trim().toLowerCase() : null;
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return { algorithm: 'scrypt', salt, key: (await derive(password, salt, 64, options)).toString('hex') };
}
export async function checkPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const usable = stored?.algorithm === 'scrypt' && /^[a-f0-9]{32}$/.test(stored.salt || '') && /^[a-f0-9]{128}$/.test(stored.key || '');
  const actual = await derive(password, usable ? stored.salt : '0'.repeat(32), 64, options);
  return timingSafeEqual(actual, Buffer.from(usable ? stored.key : '0'.repeat(128), 'hex')) && usable;
}

// Legacy player credentials remain usable when a password is added to their profile.
export async function currentCredential(store, data) {
  if (!data) return null;
  const profile = data.username ? null : await store.get(`profiles/${data.id}.json`);
  const username = data.username || profile?.slug;
  const account = username ? await store.get(`usernames/${username}.json`) : null;
  if (!account?.credential) return data.revision ? null : data;
  if (account.id !== data.id || (data.revision && data.revision !== account.credential.revision) || (!data.revision && account.credential.revokedLegacy)) return null;
  return { ...data, username, provider: 'password', revision: account.credential.revision };
}
