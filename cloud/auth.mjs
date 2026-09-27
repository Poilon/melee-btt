import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { EncryptJWT, jwtDecrypt, jwtVerify, createRemoteJWKSet } from 'jose';

const hash = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
const validToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const readCookie = (req, name) => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1);
const publicProfile = p => ({ id: p.id, displayName: p.displayName, connectCode: p.connectCode, ...(p.slug ? { slug: p.slug } : {}) });
export { publicProfile };

// The Google subject is the identity key. Email addresses and Google names are never stored.
export function googleProvider({ clientId, clientSecret, origin, fetcher = fetch, keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')) }) {
  const redirectUri = `${origin}/api/auth/google/callback`;
  return {
    configured: Boolean(clientId && clientSecret),
    authorize({ state, nonce, verifier }) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid', state, nonce,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
      return url.href;
    },
    async exchange(code, { nonce, verifier }) {
      const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId,
          client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }) });
      if (!response.ok) throw new Error('Google exchange failed');
      const { id_token: token } = await response.json();
      const { payload } = await jwtVerify(token, keys, { algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: clientId,
        requiredClaims: ['sub', 'exp', 'iat', 'nonce'], maxTokenAge: '10m' });
      if (!equal(payload.nonce, nonce) || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 || (payload.azp && payload.azp !== clientId)) throw new Error('Invalid Google identity');
      return payload.sub;
    },
  };
}

export function createAuth({ store, origin, secret, google, session, body, cookie, json, now }) {
  const key = createHash('sha256').update(`ttrc-oauth:${secret}`).digest();
  const redirect = (res, location) => { res.writeHead(303, { Location: location }); res.end(); };
  // An existing reservation is only accepted when it belongs to this exact identity.
  async function reserve(path, value) {
    try { await store.put(path, value); return value; }
    catch (error) { const existing = await store.get(path); if (!existing) throw error; return existing; }
  }
  async function login(res, id) {
    const token = random();
    await store.put(`sessions/${hash(token)}.json`, { id, provider: 'google', expires: now() + 30 * 86400_000 });
    res.setHeader('Set-Cookie', [cookie('ttrc_oauth', '', 0), cookie('ttrc_session', token, 30 * 86400)]);
  }
  async function limited(req) {
    const ip = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const bucket = hash(`${secret}:connect:${ip}:${Math.floor(now() / 3600000)}`);
    for (let i = 0; i < 20; i++) {
      const marker = random();
      if ((await reserve(`connect-limits/${bucket}/${i}.json`, { marker })).marker === marker) return false;
    }
    return true;
  }
  async function deviceRequest(id) {
    if (!validToken(id)) return null;
    const request = await store.get(`connect/${id}.json`);
    return request?.expires > now() ? request : null;
  }
  return async (path, req, res, url) => {
    if (req.method === 'GET' && path === 'auth/google/start') {
      if (!google.configured) return redirect(res, '/?authError=configuration#profil'), true;
      const connect = url.searchParams.get('connect');
      const user = await session(req);
      // Linking requires possession of the old profile's session; never merge by a public name.
      const state = random(), nonce = random(), verifier = random();
      const encrypted = await new EncryptJWT({ state, nonce, verifier, legacyId: user?.id || null, connect: validToken(connect) ? connect : null })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuedAt().setExpirationTime('10m').encrypt(key);
      res.setHeader('Set-Cookie', cookie('ttrc_oauth', encrypted, 600));
      return redirect(res, google.authorize({ state, nonce, verifier })), true;
    }
    if (req.method === 'GET' && path === 'auth/google/callback') {
      let pending;
      try {
        ({ payload: pending } = await jwtDecrypt(readCookie(req, 'ttrc_oauth') || '', key, { keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] }));
        if (!equal(pending.state, url.searchParams.get('state')) || !url.searchParams.get('code') || url.searchParams.has('error')) throw new Error('Invalid callback');
        const subject = await google.exchange(url.searchParams.get('code'), pending);
        const used = random();
        if ((await reserve(`oauth-used/${hash(pending.state)}.json`, { used, at: now() })).used !== used) throw new Error('Replayed callback');
        const googleKey = hash(`google:${subject}`), mappingPath = `google-identities/${googleKey}.json`;
        const existing = await store.get(mappingPath);
        if (existing && pending.legacyId && existing.id !== pending.legacyId) throw new Error('Account already linked');
        const id = existing?.id || pending.legacyId || random();
        const owner = await reserve(`google-owners/${id}.json`, { googleKey });
        if (owner.googleKey !== googleKey) throw new Error('Profile already linked');
        const mapping = await reserve(mappingPath, { id });
        if (mapping.id !== id) throw new Error('Account already linked');
        await login(res, id);
        redirect(res, pending.connect ? `/?connect=${pending.connect}#profil` : '/#profil');
      } catch {
        res.setHeader('Set-Cookie', cookie('ttrc_oauth', '', 0));
        // Keep the existing account signed in; never replace it on a failed link.
        redirect(res, `/?authError=signin${pending?.connect && validToken(pending.connect) ? `&connect=${pending.connect}` : ''}#profil`);
      }
      return true;
    }
    if (req.method === 'POST' && path === 'players/username') {
      const user = await session(req);
      if (user?.provider !== 'google') return json(res, 401, { error: 'Continue with Google first.' }), true;
      const input = await body(req), slug = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
      if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(slug) || ['admin','administrator','api','support','ttrc','google','slippi','moderator','me','login','players'].includes(slug)) {
        return json(res, 400, { error: 'Use 3–24 letters, numbers or underscores. This name may be reserved.' }), true;
      }
      const old = await store.get(`profiles/${user.id}.json`);
      if (old?.slug && old.slug !== slug) return json(res, 409, { error: 'Your username is already set.' }), true;
      const claim = await reserve(`usernames/${slug}.json`, { id: user.id });
      if (claim.id !== user.id) return json(res, 409, { error: 'This username is taken. Choose another.' }), true;
      const chosen = await reserve(`chosen-usernames/${user.id}.json`, { slug });
      if (chosen.slug !== slug) {
        // Release only our own unused reservation; the permanent choice cannot change.
        await store.delete(`usernames/${slug}.json`);
        return json(res, 409, { error: `Your username is already @${chosen.slug}.` }), true;
      }
      // Preserve a legacy display name/code so older companions keep authenticating.
      const profile = { id: user.id, displayName: old?.displayName || slug,
        connectCode: old?.connectCode || `TT#${String(parseInt(user.id.slice(0, 8), 16) % 100000).padStart(5, '0')}`, slug };
      await store.put(`profiles/${user.id}.json`, profile, true);
      return json(res, 200, { profile: publicProfile(profile) }), true;
    }
    if (req.method === 'GET' && path === 'players/profile') {
      const slug = url.searchParams.get('slug') || '';
      const claim = /^[a-z0-9][a-z0-9_]{2,23}$/.test(slug) ? await store.get(`usernames/${slug}.json`) : null;
      const profile = claim ? await store.get(`profiles/${claim.id}.json`) : null;
      if (!profile || profile.slug !== slug) return json(res, 404, { error: 'Player not found.' }), true;
      return json(res, 200, { profile: publicProfile(profile) }), true;
    }
    if (req.method === 'POST' && path === 'companion/connect/start') {
      if (!google.configured) return json(res, 503, { error: 'Google sign-in is not configured yet. Please try again later.' }), true;
      if (await limited(req)) return json(res, 429, { error: 'Too many sign-in attempts. Try again later.' }), true;
      const id = random(), deviceSecret = random(), code = randomBytes(4).toString('hex').toUpperCase();
      const expires = now() + 600000;
      await store.put(`connect/${id}.json`, { secretHash: hash(deviceSecret), code, expires });
      return json(res, 200, { id, deviceSecret, code, expires, url: `${origin}/?connect=${id}#profil` }), true;
    }
    if (req.method === 'GET' && path === 'companion/connect/info') {
      const request = await deviceRequest(url.searchParams.get('id'));
      if (!request) return json(res, 410, { error: 'Connection expired. Start again from your companion.' }), true;
      return json(res, 200, { code: request.code, expires: request.expires }), true;
    }
    if (req.method === 'POST' && path === 'companion/connect/approve') {
      const user = await session(req), input = await body(req);
      if (user?.provider !== 'google') return json(res, 401, { error: 'Continue with Google first.' }), true;
      const profile = await store.get(`profiles/${user.id}.json`);
      if (!profile?.slug) return json(res, 409, { error: 'Choose your username first.' }), true;
      const request = await deviceRequest(input.id);
      if (!request) return json(res, 410, { error: 'Connection expired. Start again from your companion.' }), true;
      if (input.code !== request.code) return json(res, 400, { error: 'Connection code does not match.' }), true;
      const approved = await reserve(`connect-approved/${input.id}.json`, { id: user.id });
      if (approved.id !== user.id) return json(res, 409, { error: 'This companion request was already approved.' }), true;
      return json(res, 200, { ok: true }), true;
    }
    if (req.method === 'POST' && path === 'companion/connect/poll') {
      const input = await body(req), request = await deviceRequest(input.id);
      if (!request) return json(res, 410, { error: 'Connection expired. Sign in again.' }), true;
      if (!validToken(input.deviceSecret) || !equal(hash(input.deviceSecret), request.secretHash)) return json(res, 403, { error: 'Invalid connection.' }), true;
      const approved = await store.get(`connect-approved/${input.id}.json`);
      if (!approved) return json(res, 200, { status: 'pending' }), true;
      const profile = await store.get(`profiles/${approved.id}.json`);
      if (!profile?.slug) return json(res, 409, { error: 'Choose your username first.' }), true;
      // Stable for retries after a lost response. Neither approval URL nor browser receives this token.
      const token = createHmac('sha256', secret).update(`device:${input.id}:${approved.id}`).digest('hex');
      await reserve(`devices/${hash(token)}.json`, { ...publicProfile(profile), expires: request.expires + 365 * 86400000 });
      return json(res, 200, { status: 'connected', playerFile: { format: 'target-test-player-v1', origin, ...publicProfile(profile), token } }), true;
    }
    return false;
  };
}
