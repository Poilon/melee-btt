// Operator-only command. Requires private Blob credentials, never an HTTP endpoint.
import {CloudStore} from '../cloud/storage.mjs';
import {normalizeUsername} from '../cloud/password.mjs';
const username = normalizeUsername(process.argv[2]);
const action = process.argv[3];
if (!username || !['grant', 'revoke'].includes(action)) throw new Error('Usage: node --env-file=<private-env> scripts/set_admin.mjs <username> grant|revoke');
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Private Blob credentials required.');
const store = new CloudStore();
const account = await store.get(`usernames/${username}.json`);
const profile = account && await store.get(`profiles/${account.id}.json`);
if (!account?.credential || profile?.slug !== username) throw new Error('Existing password account not found.');
const path = `roles/${account.id}.json`;
if (action === 'grant') await store.put(path, {role: 'admin', grantedAt: new Date().toISOString(), source: 'operator'}, true);
else await store.delete(path);
if (((await store.get(path))?.role === 'admin') !== (action === 'grant')) throw new Error('Role verification failed.');
console.log(`@${username}: ${action === 'grant' ? 'admin' : 'player'} (verified).`);
