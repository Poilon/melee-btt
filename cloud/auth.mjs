import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashPassword, checkPassword, validPassword, normalizeUsername, currentCredential } from './password.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
const validToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const reserved = new Set(['admin', 'administrator', 'api', 'support', 'ttrc', 'slippi', 'moderator', 'me', 'login', 'players']);
export const publicProfile = p => ({ id: p.id, displayName: p.displayName, connectCode: p.connectCode, ...(p.slug ? { slug: p.slug } : {}) });
const profileFor = (id, username, old) => ({ id, slug: username, displayName: old?.displayName || username,
  connectCode: old?.connectCode || `TT#${String(parseInt(id.slice(0, 8), 16) % 100000).padStart(5, '0')}` });

export function createAuth({ store, origin, secret, session, body, cookie, json, now, gameAccountsOnly = false }) {
  async function reserve(path, value) {
    try { await store.put(path, value); return value; }
    catch (error) { const existing = await store.get(path); if (!existing) throw error; return existing; }
  }
  async function limited(req, scope = 'connect', limit = 20, window = 3600000, subject) {
    const ip = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const bucket = hash(`${secret}:${scope}:${subject || ip}:${Math.floor(now() / window)}`);
    for (let i = 0; i < limit; i++) {
      const marker = random();
      if ((await reserve(`auth-limits/${bucket}/${i}.json`, { marker })).marker === marker) return false;
    }
    return true;
  }
  async function login(res, account, username) {
    const token = random();
    await store.put(`sessions/${hash(token)}.json`, { id: account.id, provider: 'password', username, revision: account.credential.revision, expires: now() + 30 * 86400000 });
    res.setHeader('Set-Cookie', cookie('ttrc_session', token, 30 * 86400));
  }
  async function gameLogin(res,account,username){
    const profile=await store.get(`profiles/${account.id}.json`),token=random();
    await store.put(`devices/${hash(token)}.json`,{...profile,username,provider:'password',revision:account.credential.revision,expires:now()+365*86400000});
    return json(res,200,{playerFile:{format:'target-test-player-v1',origin,...publicProfile(profile),token}}),true;
  }
  async function deviceRequest(id) {
    if (!validToken(id)) return null;
    const request = await store.get(`connect/${id}.json`);
    return request?.expires > now() ? request : null;
  }
  async function browserRequest(input) {
    const request = await deviceRequest(input.id);
    return request?.kind === 'game' && validToken(input.browserSecret) && equal(hash(input.browserSecret), request.browserHash) ? request : null;
  }
  return async (path, req, res, url) => {
    if (req.method === 'POST' && path === 'game/connect/start') {
      if (!secret) return json(res,503,{error:'Sign-in unavailable. Try again later.'}),true;
      if (await limited(req,'game-connect')) return json(res,429,{error:'Too many attempts. Try again later.'}),true;
      const id=random(),deviceSecret=random(),browserSecret=random(),expires=now()+600000;
      await store.put(`connect/${id}.json`,{kind:'game',secretHash:hash(deviceSecret),browserHash:hash(browserSecret),expires});
      return json(res,200,{id,deviceSecret,expires,url:`${origin}/login.html#request=${id}&key=${browserSecret}`}),true;
    }
    if (req.method === 'POST' && ['game/connect/info','game/connect/approve'].includes(path)) {
      const input=await body(req),request=await browserRequest(input);
      if (!request) return json(res,410,{error:'This connection expired. Select Log in in Dolphin again.'}),true;
      const user=await session(req),profile=user&&await store.get(`profiles/${user.id}.json`);
      if (path==='game/connect/info') return json(res,200,{profile:profile?.slug?publicProfile(profile):null,expires:request.expires}),true;
      if (user?.provider!=='password'||!profile?.slug) return json(res,401,{error:'Sign in to continue.'}),true;
      const approved=await reserve(`connect-approved/${input.id}.json`,{id:user.id,revision:user.revision,username:user.username});
      if (approved.id!==user.id) return json(res,409,{error:'This connection already belongs to another account. Select Log in in Dolphin again.'}),true;
      return json(res,200,{ok:true}),true;
    }
    if (req.method === 'POST' && ['game/connect/poll','game/connect/cancel'].includes(path)) {
      const input=await body(req),request=await deviceRequest(input.id);
      if (request?.kind!=='game') return json(res,410,{error:'Connection expired. Select Log in again.'}),true;
      if (!validToken(input.deviceSecret)||!equal(hash(input.deviceSecret),request.secretHash)) return json(res,403,{error:'Invalid connection.'}),true;
      if(path==='game/connect/cancel'){
        await store.delete(`connect/${input.id}.json`);await store.delete(`connect-approved/${input.id}.json`);
        return json(res,200,{ok:true}),true;
      }
      const approved=await store.get(`connect-approved/${input.id}.json`);
      if(!approved)return json(res,200,{status:'pending'}),true;
      if(!await currentCredential(store,approved))return json(res,410,{error:'Account changed. Select Log in again.'}),true;
      const profile=await store.get(`profiles/${approved.id}.json`);
      if(!profile?.slug)return json(res,410,{error:'Account unavailable. Select Log in again.'}),true;
      const token=createHmac('sha256',secret).update(`game-device:${input.id}:${approved.id}`).digest('hex');
      await reserve(`devices/${hash(token)}.json`,{...publicProfile(profile),provider:'password',username:approved.username,revision:approved.revision,expires:request.expires+365*86400000});
      return json(res,200,{status:'connected',playerFile:{format:'target-test-player-v1',origin,...publicProfile(profile),token}}),true;
    }
    const browserAccount=path==='browser-btt/signup';
    if(browserAccount)path='auth/signup';
    const inGame=['game/signup','game/login'].includes(path);
    if(inGame)path=path.replace('game/','auth/');
    if (req.method === 'POST' && ['auth/signup', 'auth/login'].includes(path)) {
      if (!secret) return json(res, 503, { error: 'Sign-in unavailable. Please try again later.' }), true;
      if (await limited(req, path, 30, 900000)) return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' }), true;
      const input = await body(req), username = normalizeUsername(input.username);
      if(gameAccountsOnly&&!inGame&&!browserAccount&&path==='auth/signup'&&!await browserRequest(input))return json(res,410,{error:'Start account creation with Log in in Custom Melee BTT Dolphin.'}),true;
      if (path === 'auth/login') {
        if (username && await limited(req, 'login-name', 20, 900000, username)) return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' }), true;
        const account = username ? await store.get(`usernames/${username}.json`) : null;
        if (!await checkPassword(input.password, account?.credential?.password)) return json(res, 401, { error: 'Username or password is incorrect.' }), true;
        // A retry can repair the public profile after an interrupted registration.
        const old = await store.get(`profiles/${account.id}.json`);
        if (!old?.slug) await store.put(`profiles/${account.id}.json`, profileFor(account.id, username, old || { displayName: account.displayName || username }), true);
        if(inGame)return gameLogin(res,account,username);
        await login(res, account, username);
        return json(res, 200, { ok: true }), true;
      }
      if (!username || reserved.has(username)) return json(res, 400, { error: 'Use 3–24 letters, numbers or underscores. This username may be reserved.' }), true;
      if (!validPassword(input.password)) return json(res, 400, { error: 'Use a password of 8–128 characters.' }), true;
      const user = inGame ? null : await session(req);
      if (user?.provider === 'password') return json(res, 409, { error: 'You already have an account. Sign out to create another.' }), true;
      const old = user ? await store.get(`profiles/${user.id}.json`) : null;
      if (old?.slug && old.slug !== username) return json(res, 409, { error: `Use your existing username: ${old.slug}.` }), true;
      const accountPath = `usernames/${username}.json`, previous = await store.readVersion(accountPath);
      if (previous && (previous.value.id !== user?.id || previous.value.credential)) return json(res, 409, { error: 'This username is taken. Choose another.' }), true;
      const id = user?.id || random(), revision = random();
      const account = { id, displayName: old?.displayName || input.username.trim(), credential: { password: await hashPassword(input.password), revision } };
      if (previous) {
        if (!await store.writeVersion(accountPath, account, previous.etag)) return json(res, 409, { error: 'This username was just registered. Sign in instead.' }), true;
      } else {
        const claimed = await reserve(accountPath, account);
        if (claimed.credential?.revision !== revision) return json(res, 409, { error: 'This username is taken. Choose another.' }), true;
      }
      const chosen = await reserve(`chosen-usernames/${id}.json`, { slug: username });
      if (chosen.slug !== username) {
        if (!previous) await store.delete(accountPath);
        return json(res, 409, { error: `Use your existing username: ${chosen.slug}.` }), true;
      }
      const profile = profileFor(id, username, old || { displayName: account.displayName });
      await store.put(`profiles/${id}.json`, profile, true);
      if(inGame)return gameLogin(res,account,username);
      await login(res, account, username);
      return json(res, 200, { ok: true, profile: publicProfile(profile) }), true;
    }
    if (req.method === 'POST' && path === 'players/username') return json(res, 410, { error: 'Choose your username when creating your account.' }), true;
    if (req.method === 'GET' && path === 'players/profile') {
      const slug = normalizeUsername(url.searchParams.get('slug'));
      const claim = slug ? await store.get(`usernames/${slug}.json`) : null;
      const profile = claim ? await store.get(`profiles/${claim.id}.json`) : null;
      if (!profile || profile.slug !== slug) return json(res, 404, { error: 'Player not found.' }), true;
      return json(res, 200, { profile: publicProfile(profile) }), true;
    }
    if (req.method === 'POST' && path === 'companion/connect/start') {
      if (!secret) return json(res, 503, { error: 'Sign-in is not configured yet. Please try again later.' }), true;
      if (await limited(req)) return json(res, 429, { error: 'Too many sign-in attempts. Try again later.' }), true;
      const id = random(), deviceSecret = random(), code = randomBytes(4).toString('hex').toUpperCase();
      const expires = now() + 600000;
      await store.put(`connect/${id}.json`, { secretHash: hash(deviceSecret), code, expires });
      return json(res, 200, { id, deviceSecret, code, expires, url: `${origin}/?connect=${id}#profil` }), true;
    }
    if (req.method === 'GET' && path === 'companion/connect/info') {
      const request = await deviceRequest(url.searchParams.get('id'));
      if (!request || request.kind==='game') return json(res, 410, { error: 'Connection expired. Start again from your companion.' }), true;
      return json(res, 200, { code: request.code, expires: request.expires }), true;
    }
    if (req.method === 'POST' && path === 'companion/connect/approve') {
      const user = await session(req), input = await body(req);
      if (user?.provider !== 'password') return json(res, 401, { error: 'Sign in or add a password to your existing profile first.' }), true;
      const profile = await store.get(`profiles/${user.id}.json`);
      if (!profile?.slug) return json(res, 409, { error: 'Finish creating your account first.' }), true;
      const request = await deviceRequest(input.id);
      if (!request || request.kind==='game') return json(res, 410, { error: 'Connection expired. Start again from your companion.' }), true;
      if (input.code !== request.code) return json(res, 400, { error: 'Connection code does not match.' }), true;
      const approved = await reserve(`connect-approved/${input.id}.json`, { id: user.id, revision: user.revision, username: user.username });
      if (approved.id !== user.id) return json(res, 409, { error: 'This companion request was already approved.' }), true;
      return json(res, 200, { ok: true }), true;
    }
    if (req.method === 'POST' && path === 'companion/connect/poll') {
      const input = await body(req), request = await deviceRequest(input.id);
      if (!request || request.kind==='game') return json(res, 410, { error: 'Connection expired. Sign in again.' }), true;
      if (!validToken(input.deviceSecret) || !equal(hash(input.deviceSecret), request.secretHash)) return json(res, 403, { error: 'Invalid connection.' }), true;
      const approved = await store.get(`connect-approved/${input.id}.json`);
      if (!approved) return json(res, 200, { status: 'pending' }), true;
      if (!await currentCredential(store, approved)) return json(res, 410, { error: 'Account credentials changed. Sign in again.' }), true;
      const profile = await store.get(`profiles/${approved.id}.json`);
      if (!profile?.slug) return json(res, 409, { error: 'Finish creating your account first.' }), true;
      const token = createHmac('sha256', secret).update(`device:${input.id}:${approved.id}`).digest('hex');
      await reserve(`devices/${hash(token)}.json`, { ...publicProfile(profile), username: approved.username, revision: approved.revision, expires: request.expires + 365 * 86400000 });
      return json(res, 200, { status: 'connected', playerFile: { format: 'target-test-player-v1', origin, ...publicProfile(profile), token } }), true;
    }
    return false;
  };
}
