import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { generateKeyPair, SignJWT } from 'jose';
import { createCloudHandler } from '../cloud/backend.mjs';
import { googleProvider } from '../cloud/auth.mjs';
import { CompanionAccount } from '../server/account.mjs';

const origin = 'https://test.vercel.app';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(options = {}) {
  const rows = new Map(); let clock = Date.now();
  const store = { get: async key => rows.get(key) || null,
    put: async (key, value, overwrite) => { if (!overwrite && rows.has(key)) throw Error('exists'); rows.set(key, structuredClone(value)); },
    delete: async key => rows.delete(key), list: async prefix => [...rows.keys()].filter(k => k.startsWith(prefix)).map(pathname => ({ pathname })) };
  const google = { configured: true, authorize: p => `https://accounts.google.com/test?${new URLSearchParams(p)}`, exchange: async code => code };
  const handler = createCloudHandler({ store, challenge: { id: 'seed', assignments: { fox: 'samus' }, rules: {} }, gecko: 'code', origin, secret: 'test-secret', google, now: () => clock, ...options });
  async function request(path, { method = 'GET', cookie, body, headers = {} } = {}) {
    const result = { status: 200, headers: {} };
    await handler({ url: `/api/${path}`, method, headers: { origin, ...(cookie ? { cookie } : {}), ...headers }, body }, {
      setHeader: (k, v) => { result.headers[k.toLowerCase()] = v; },
      writeHead: (status, values) => { result.status = status; Object.assign(result.headers, Object.fromEntries(Object.entries(values || {}).map(([k,v]) => [k.toLowerCase(),v]))); },
      end: value => { try { result.data = JSON.parse(value); } catch {} },
    });
    return result;
  }
  async function login(subject = 'subject-one', legacyCookie) {
    const start = await request('auth/google/start', { cookie: legacyCookie });
    const state = new URL(start.headers.location).searchParams.get('state');
    const callback = await request(`auth/google/callback?state=${state}&code=${subject}`, { cookie: start.headers['set-cookie'].split(';')[0] });
    assert.equal(callback.headers.location, '/#profil');
    const cookie = callback.headers['set-cookie'].find(c => c.startsWith('ttrc_session=')).split(';')[0];
    return { cookie, id: (await request('dashboard', { cookie })).data.player.id };
  }
  return { request, login, rows, advance: ms => { clock += ms; } };
}
const post = (cookie, body) => ({ method: 'POST', cookie, body });

test('Google sessions survive re-login; usernames are unique, case-insensitive and immutable', async () => {
  const f = fixture(), a = await f.login(), b = await f.login('subject-two');
  assert.equal((await f.request('players/create', post(null, { displayName: 'anonymous' }))).status, 410);
  assert.equal((await f.request('players/username', post(null, { username: 'poilon' }))).status, 401);
  const claims = await Promise.all([f.request('players/username', post(a.cookie, { username: 'Poilon' })), f.request('players/username', post(b.cookie, { username: 'poilon' }))]);
  assert.deepEqual(claims.map(r => r.status).sort(), [200,409]);
  const winner = claims[0].status === 200 ? a : b;
  const result = await f.request('dashboard', { cookie: winner.cookie });
  assert.equal(result.data.identity.slug, 'poilon');
  assert.equal(result.data.auth.needsUsername, false);
  assert.ok(!JSON.stringify(result).includes('subject-one'));
  assert.equal((await f.request('players/username', post(winner.cookie, { username: 'another' }))).status, 409);
  const profile = (await f.request('players/profile?slug=poilon')).data;
  assert.deepEqual(Object.keys(profile), ['profile']);
  assert.ok(!JSON.stringify(profile).includes('frames'));
  const again = await f.login(); assert.equal(again.id, a.id);
  await f.request('auth/logout', post(again.cookie));
  assert.equal((await f.request('dashboard', { cookie: again.cookie })).data.auth.account, null);
});

test('OAuth rejects missing state, changed state, replay and failed exchanges without signing in', async () => {
  const f = fixture();
  assert.match((await f.request('auth/google/callback?code=attacker')).headers.location, /authError/);
  const start = await f.request('auth/google/start?connect=' + 'a'.repeat(64));
  const params = new URL(start.headers.location).searchParams, cookie = start.headers['set-cookie'].split(';')[0];
  assert.ok(params.get('nonce')); assert.ok(params.get('verifier'));
  assert.match((await f.request('auth/google/callback?code=attacker&state=wrong', { cookie })).headers.location, /authError/);
  const path = `auth/google/callback?code=subject&state=${params.get('state')}`;
  const ok = await f.request(path, { cookie }); assert.match(ok.headers.location, /connect=aaaa/);
  assert.match((await f.request(path, { cookie })).headers.location, /authError/);
  assert.equal([...f.rows.keys()].filter(k => k.startsWith('sessions/')).length, 1);
  const unavailable = fixture({ google: { configured: false } });
  assert.equal((await unavailable.request('auth/google/start')).headers.location, '/?authError=configuration#profil');
  assert.equal((await unavailable.request('companion/connect/start', post())).status, 503);
});

test('legacy records keep their player ID when linked; another Google identity cannot take the profile', async () => {
  const f = fixture(), id = 'b'.repeat(64), token = randomBytes(32).toString('hex');
  f.rows.set(`profiles/${id}.json`, { id, displayName: 'Original', connectCode: 'TT#12345' });
  f.rows.set(`sessions/${hash(token)}.json`, { id, expires: Date.now()+100000 });
  const oldCookie = `ttrc_session=${token}`;
  const linked = await f.login('original-google', oldCookie); assert.equal(linked.id, id);
  await f.request('players/username', post(linked.cookie, { username: 'original' }));
  assert.equal(f.rows.get(`profiles/${id}.json`).displayName, 'Original');
  assert.equal((await f.login('original-google')).id, id);
  const start = await f.request('auth/google/start', { cookie: oldCookie });
  const state = new URL(start.headers.location).searchParams.get('state');
  assert.match((await f.request(`auth/google/callback?state=${state}&code=imposter`, { cookie: start.headers['set-cookie'].split(';')[0] })).headers.location, /authError/);
});

test('device approval needs Google, consent and matching code; credentials require the private device secret', async () => {
  const f = fixture(), player = await f.login();
  const device = (await f.request('companion/connect/start', post())).data;
  const poll = body => f.request('companion/connect/poll', post(null, body));
  assert.equal((await poll({ id: device.id, deviceSecret: 'wrong' })).status, 403);
  assert.equal((await poll(device)).data.status, 'pending');
  assert.equal((await f.request('companion/connect/approve', post(null, device))).status, 401);
  assert.equal((await f.request('companion/connect/approve', post(player.cookie, device))).status, 409);
  await f.request('players/username', post(player.cookie, { username: 'paired' }));
  assert.equal((await f.request('companion/connect/approve', post(player.cookie, { ...device, code: 'WRONG' }))).status, 400);
  assert.equal((await f.request('companion/connect/approve', post(player.cookie, device))).status, 200);
  const result = (await poll(device)).data;
  assert.equal(result.playerFile.id, player.id); assert.equal(result.playerFile.slug, 'paired');
  assert.equal((await poll(device)).data.playerFile.token, result.playerFile.token);
  assert.ok(!JSON.stringify([...f.rows]).includes(result.playerFile.token));
  assert.ok(!JSON.stringify([...f.rows]).includes(device.deviceSecret));
  const info = await f.request(`companion/connect/info?id=${device.id}`);
  assert.deepEqual(Object.keys(info.data).sort(), ['code','expires']);
  const b = await f.login('other-google'); await f.request('players/username', post(b.cookie, { username: 'other' }));
  assert.equal((await f.request('companion/connect/approve', post(b.cookie, device))).status, 409);
  f.advance(600001); assert.equal((await poll(device)).status, 410);
});

test('Google ID tokens require valid signature, issuer, audience, expiry, nonce and authorized party', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const wrong = await generateKeyPair('RS256');
  let claims, signingKey = privateKey;
  const provider = googleProvider({ clientId: 'client-id', clientSecret: 'private', origin, keys: publicKey,
    fetcher: async (url, init) => {
      assert.equal(new URLSearchParams(init.body).get('code_verifier'), 'verifier');
      return Response.json({ id_token: await new SignJWT(claims).setProtectedHeader({ alg: 'RS256' }).sign(signingKey) });
    } });
  const base = { sub: 'google-subject', iss: 'https://accounts.google.com', aud: 'client-id', nonce: 'nonce', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+300 };
  claims = base; assert.equal(await provider.exchange('code', { nonce: 'nonce', verifier: 'verifier' }), 'google-subject');
  for (const invalid of [{ iss: 'attacker' }, { aud: 'other' }, { nonce: 'other' }, { exp: 1 }, { azp: 'other' }, { sub: '' }]) {
    claims = { ...base, ...invalid }; await assert.rejects(provider.exchange('code', { nonce: 'nonce', verifier: 'verifier' }));
  }
  claims = base; signingKey = wrong.privateKey; await assert.rejects(provider.exchange('code', { nonce: 'nonce', verifier: 'verifier' }));
});

test('companion keeps credentials out of the UI and cancels outstanding login before accepting it', async () => {
  const f = fixture(), player = await f.login();
  await f.request('players/username', post(player.cookie, { username: 'desktop' }));
  let accepted, release, delayed = false;
  const account = new CompanionAccount({ origin, accept: async file => { accepted = file; }, signOut: async () => { accepted = null; },
    fetcher: async (url, init) => { const result = await f.request(new URL(url).pathname.slice(5), post(null, JSON.parse(init.body))); if (delayed) await new Promise(r => { release = r; }); return Response.json(result.data, { status: result.status }); } });
  const pending = await account.start(); assert.equal(pending.deviceSecret, undefined); assert.equal(pending.token, undefined);
  const id = new URL(pending.url).searchParams.get('connect');
  await f.request('companion/connect/approve', post(player.cookie, { id, code: pending.code }));
  delayed = true; const polling = account.poll(); while (!release) await new Promise(r => setImmediate(r));
  account.cancel(); release(); await polling; assert.equal(accepted, undefined);
  delayed = false; const next = await account.start();
  await f.request('companion/connect/approve', post(player.cookie, { id: new URL(next.url).searchParams.get('connect'), code: next.code }));
  await account.poll(); assert.equal(accepted.id, player.id); assert.deepEqual(account.status(), { status: 'connected' });
  await account.logout(); assert.equal(accepted, null);
});
