import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createCloudHandler } from '../cloud/backend.mjs';
import { checkPassword, hashPassword } from '../cloud/password.mjs';
import { CompanionAccount } from '../server/account.mjs';

const origin = 'https://test.vercel.app', password = 'A long test password 42';
const hash = value => createHash('sha256').update(value).digest('hex');
const post = (cookie, body) => ({ method: 'POST', cookie, body });
function fixture(options = {}) {
  const rows = new Map(), versions = new Map(); let clock = Date.now();
  const store = { get: async key => structuredClone(rows.get(key) || null),
    put: async (key, value, overwrite) => { if (!overwrite && rows.has(key)) throw Error('exists'); rows.set(key, structuredClone(value)); versions.set(key, (versions.get(key) || 0) + 1); },
    delete: async key => rows.delete(key), list: async prefix => [...rows.keys()].filter(k => k.startsWith(prefix)).map(pathname => ({ pathname })),
    readVersion: async key => rows.has(key) ? { value: structuredClone(rows.get(key)), etag: versions.get(key) } : null,
    writeVersion: async (key, value, etag) => { if (versions.get(key) !== etag) return false; rows.set(key, structuredClone(value)); versions.set(key, (etag || 0) + 1); return true; },
  };
  const handler = createCloudHandler({ store, challenge: { id: 'seed', assignments: { fox: 'samus' }, rules: {} }, gecko: 'code', origin, secret: 'test-secret', now: () => clock, ...options });
  async function request(path, { method = 'GET', cookie, body, headers = {} } = {}) {
    const result = { status: 200, headers: {} };
    await handler({ url: `/api/${path}`, method, headers: { origin, ...(cookie ? { cookie } : {}), ...headers }, body }, {
      setHeader: (k, v) => { result.headers[k.toLowerCase()] = v; },
      writeHead: (status, values) => { result.status = status; Object.assign(result.headers, Object.fromEntries(Object.entries(values || {}).map(([k,v]) => [k.toLowerCase(),v]))); },
      end: value => { try { result.data = JSON.parse(value); } catch {} },
    });
    return result;
  }
  async function account(username = 'player', legacyCookie) {
    const created = await request('auth/signup', post(legacyCookie, { username, password }));
    assert.equal(created.status, 200, JSON.stringify(created.data));
    return { cookie: created.headers['set-cookie'].split(';')[0], username: username.toLowerCase(), id: created.data.profile.id };
  }
  return { request, account, rows, advance: ms => { clock += ms; } };
}

test('username/password signup signs in immediately without email and survives later login', async () => {
  const f = fixture(), a = await f.account('Player');
  const board = (await f.request('dashboard', { cookie: a.cookie })).data;
  assert.equal(board.auth.account.provider, 'password'); assert.equal(board.identity.slug, 'player');
  assert.match(a.cookie, /^ttrc_session=/);
  await f.request('auth/logout', post(a.cookie));
  assert.equal((await f.request('dashboard', { cookie: a.cookie })).data.auth.account, null);
  const signed = await f.request('auth/login', post(null, { username: 'PLAYER', password }));
  assert.equal(signed.status, 200); assert.match(signed.headers['set-cookie'], /HttpOnly; Secure; SameSite=Lax/);
  const cookie = signed.headers['set-cookie'].split(';')[0];
  assert.equal((await f.request('dashboard', { cookie })).data.identity.id, a.id);
  assert.ok(!JSON.stringify([...f.rows]).includes(password));
  assert.ok(!JSON.stringify(board).includes('credential')); assert.ok(!JSON.stringify(board).includes(f.rows.get('usernames/player.json').credential.password.key));
});

test('concurrent registrations cannot steal the same username, including different capitalization', async () => {
  const f = fixture();
  const results = await Promise.all(['Poilon','poilon'].map(username => f.request('auth/signup', post(null, { username, password }))));
  assert.deepEqual(results.map(r => r.status).sort(), [200,409]);
  const winner = results.find(r => r.status === 200).data.profile.id;
  assert.equal((await f.request('players/profile?slug=poilon')).data.profile.id, winner);
  assert.equal((await f.request('auth/signup', post(null, { username: 'POILON', password: 'Different password' }))).status, 409);
  assert.equal((await f.request('auth/login', post(null, { username: 'poilon', password: 'Different password' }))).status, 401);
  const claim = f.rows.get('usernames/poilon.json');
  assert.equal(await checkPassword(password, claim.credential.password), true);
  const publicProfile = (await f.request('players/profile?slug=poilon')).data;
  assert.deepEqual(Object.keys(publicProfile), ['profile']); assert.ok(!JSON.stringify(publicProfile).includes('credential'));
});

test('existing authenticated profiles keep records and reserved slugs when adding a password', async () => {
  const f = fixture(), id = 'b'.repeat(64), value = randomBytes(32).toString('hex');
  f.rows.set(`profiles/${id}.json`, { id, displayName: 'Original', connectCode: 'TT#12345', slug: 'original' });
  f.rows.set('usernames/original.json', { id });
  f.rows.set(`chosen-usernames/${id}.json`, { slug: 'original' });
  f.rows.set(`sessions/${hash(value)}.json`, { id, provider: 'google', expires: Date.now()+100000 });
  const oldCookie = `ttrc_session=${value}`;
  assert.equal((await f.request('auth/signup', post(null, { username: 'original', password }))).status, 409);
  assert.equal((await f.request('auth/signup', post(oldCookie, { username: 'another', password }))).status, 409);
  const linked = await f.account('original', oldCookie); assert.equal(linked.id, id);
  assert.equal(f.rows.get(`profiles/${id}.json`).displayName, 'Original');
  assert.equal((await f.request('dashboard', { cookie: oldCookie })).data.auth.account.provider, 'password');
  assert.equal((await f.request('auth/signup', post(linked.cookie, { username: 'extra', password }))).status, 409);
});

test('invalid usernames/passwords and CSRF fail; login does not reveal whether an account exists', async () => {
  const f = fixture();
  for (const username of ['ab','admin','../player','a@example.com','space name']) assert.equal((await f.request('auth/signup', post(null, { username, password }))).status, 400);
  assert.equal((await f.request('auth/signup', post(null, { username: 'valid_name', password: 'short' }))).status, 400);
  assert.equal((await f.request('auth/signup', { ...post(null, { username: 'valid_name', password }), headers: { origin: 'https://evil.test' } })).status, 403);
  const a = await f.account();
  const wrong = await f.request('auth/login', post(null, { username: a.username, password: 'wrong' }));
  const missing = await f.request('auth/login', post(null, { username: 'missing', password: 'wrong' }));
  assert.equal(wrong.status, 401); assert.deepEqual(wrong.data, missing.data);
  assert.equal((await f.request('players/create', post(null, { displayName: 'anonymous' }))).status, 410);
  assert.equal((await f.request('auth/forgot', post(null, { email: 'a@example.com' }))).status, 404);
});

test('password checks are rate limited and scrypt uses a separate salt for each password', async () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) assert.equal((await f.request('auth/login', post(null, { username: 'missing', password: 'wrong' }))).status, 401);
  assert.equal((await f.request('auth/login', post(null, { username: 'missing', password: 'wrong' }))).status, 429);
  const a = await hashPassword(password), b = await hashPassword(password);
  assert.notEqual(a.salt, b.salt); assert.notEqual(a.key, b.key);
  assert.equal(await checkPassword(password, a), true); assert.equal(await checkPassword('wrong', a), false);
});

test('companion requires account consent and the private device secret; cancellation prevents a late login', async () => {
  const f = fixture(), a = await f.account('desktop');
  let accepted, release, delayed = false;
  const account = new CompanionAccount({ origin, accept: async file => { accepted = file; }, signOut: async () => { accepted = null; },
    fetcher: async (url, init) => { const result = await f.request(new URL(url).pathname.slice(5), post(null, JSON.parse(init.body))); if (delayed && url.endsWith('/poll')) await new Promise(r => { release = r; }); return Response.json(result.data, { status: result.status }); } });
  const pending = await account.start(); assert.equal(pending.deviceSecret, undefined);
  const browserFor = pending => {const fragment=new URLSearchParams(new URL(pending.url).hash.slice(1));return {id:fragment.get('request'),browserSecret:fragment.get('key')};};
  const browser=browserFor(pending),id=browser.id;
  assert.equal(pending.code,undefined);
  assert.equal((await f.request('game/connect/approve', post(null, browser))).status,401);
  assert.equal((await f.request('game/connect/poll', post(null, {id,deviceSecret:'wrong'}))).status,403);
  assert.equal((await f.request('game/connect/approve', post(a.cookie, {...browser,browserSecret:'wrong'}))).status,410);
  await f.request('game/connect/approve',post(a.cookie,browser));
  delayed = true; const polling = account.poll(); while (!release) await new Promise(r => setImmediate(r));
  account.cancel(); release(); await polling; assert.equal(accepted, undefined);
  delayed = false; const next = await account.start();
  await f.request('game/connect/approve',post(a.cookie,browserFor(next)));
  await account.poll(); assert.equal(accepted.id, a.id); assert.deepEqual(account.status(), { status: 'connected' });
  assert.ok(!JSON.stringify([...f.rows]).includes(accepted.token));
  const me = await f.request('companion/me', { headers: { authorization: `Bearer ${accepted.token}` } }); assert.equal(me.status, 200);
  f.advance(600001); assert.equal((await f.request(`companion/connect/info?id=${id}`)).status, 410);
  await account.logout(); assert.equal(accepted, null);
});
