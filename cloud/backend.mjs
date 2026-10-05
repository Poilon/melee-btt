import { createAuth, publicProfile } from './auth.mjs';
import { currentCredential } from './password.mjs';
import { createWorlds } from './worlds.mjs';
import { createCompetition } from './competition.mjs';
import { isAdmin } from './admin.mjs';
import {overallStandings,characterPoints} from '../shared/standings.mjs';
import { createHash, randomBytes } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
const cookieValue = (req, name) => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1);
export function createCloudHandler({ store, challenge, gecko, origin, secret, reviewerKey, endsAt, challengeManager, now = Date.now, allowLegacySignup = false, gameAccountsOnly = false, worldsCatalog, worldsChallenges }) {
  const cookie = (name, value, seconds) => `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${seconds}`;
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  const session = async req => {
    const token = cookieValue(req, 'ttrc_session');
    if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
    const data = await store.get(`sessions/${hash(token)}.json`);
    return data?.expires > now() ? currentCredential(store, data) : null;
  };
  const bearer = async req => {
    const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) return null;
    const data = await store.get(`devices/${hash(token)}.json`);
    return data?.expires > now() ? currentCredential(store, data) : null;
  };
  const body = async req => {
    if (req.body !== undefined) {
      const value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (JSON.stringify(value).length > 16_384) throw new Error('Body too large');
      return value;
    }
    let data = '';
    for await (const chunk of req) { data += chunk; if (data.length > 16_384) throw new Error('Body too large'); }
    return JSON.parse(data || '{}');
  };
  const auth = createAuth({ store, origin, secret, session, body, cookie, json, now, gameAccountsOnly });
  const worlds = createWorlds({store,catalog:worldsCatalog,challenges:worldsChallenges,bearer,json,now});
  const competition = createCompetition({ store, challenge, gecko, origin, reviewerKey, endsAt, challengeManager, bearer, session, json, now });

  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(req.url, origin);
      const path = url.searchParams.get('route') || url.pathname.replace(/^\/api\/?/, '');
      if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: 'Origin not allowed.' });
      if (req.method === 'POST' && !['worlds/submit','game/login','game/signup','game/connect/start','game/connect/poll','game/connect/cancel','companion/browser', 'companion/connect/start', 'companion/connect/poll', 'runs', 'submissions'].includes(path) && req.headers.origin !== origin) {
        return json(res, 403, { error: 'Action not allowed.' });
      }
      if (await auth(path, req, res, url)) return;
      if (await worlds(path, req, res, url)) return;
      if (await competition.handle(path, req, res)) return;
      if(req.method==='GET'&&path==='challenges/mine'){
        const user=await session(req);
        if(!user)return json(res,401,{error:'Sign in to see your old challenges.'});
        const archives=[];
        for(const metadata of (await challengeManager?.list()||[]).filter(c=>c.closed)){
          if(!(await store.list(`submissions/${metadata.id}/${user.id}/`)).length)continue;
          const pack=await challengeManager.get(metadata.id);
          const rows=await createCompetition({store,challenge:pack.manifest,gecko:pack.gecko,now}).list();
          const standings=overallStandings(rows,pack.manifest.assignments);
          if(!standings.some(p=>p.playerId===user.id))continue;
          const leaderboard=standings.map(({courses,...player})=>player);
          archives.push({...metadata,leaderboard,you:leaderboard.find(p=>p.playerId===user.id)});
        }
        archives.sort((a,b)=>b.endedAt.localeCompare(a.endedAt)||a.id.localeCompare(b.id));
        return json(res,200,{challenges:archives});
      }
      if (req.method === 'GET' && path === 'dashboard') {
        const character = url.searchParams.get('character') || 'fox';
        if (!Object.hasOwn(challenge.assignments, character)) return json(res, 400, { error: 'Unknown character.' });
        const user = await session(req);
        const profile = user ? await store.get(`profiles/${user.id}.json`) : null;
        const identity = profile ? { ...publicProfile(profile), verified: false, source: 'companion' } : null;
        const rows = await competition.list();
        const phase = await competition.phase();
        const disclosed=await competition.disclosures(), sharedRuns=await competition.shared();
        const boardRows = rows.filter(r => r.current && r.character === character && r.status !== 'rejected').sort((a, b) => a.frames - b.frames || a.createdAt.localeCompare(b.createdAt));
        const seen = new Set(); const best = boardRows.filter(r => seen.has(r.playerId) ? false : (seen.add(r.playerId), true));
        let lastFrames, rank = 0;
        const leaders = phase.timesRevealed ? best.slice(0, 100).map((r, index) => {
          if (r.frames !== lastFrames) { rank = index + 1; lastFrames = r.frames; }
          return { rank, points:characterPoints(rank), playerId: r.playerId, displayName: r.displayName, connectCode: r.connectCode,
            createdAt: r.createdAt, status: r.status, frames: r.frames };
        }) : [];
        // Sealed participation is challenge-wide and alphabetic, never ordered by performance.
        const entrants = rows.filter(r => r.status !== 'rejected');
        const participants = [...new Map(entrants.map(r => [r.playerId, {playerId:r.playerId, displayName:r.displayName, connectCode:r.connectCode}])).values()]
          .sort((a,b) => a.displayName.localeCompare(b.displayName, 'en') || a.playerId.localeCompare(b.playerId));
        const mine = user ? rows.filter(r => r.playerId === user.id) : [];
        const personalBest = mine.filter(r => r.character === character).sort((a, b) => a.frames - b.frames)[0];
        return json(res, 200, { challenge, competition: phase, scope: 'public', identity, player: user ? { id: user.id } : null,
          auth: { mode: 'password', gameAccountsOnly, configured: Boolean(secret), account: user ? { name: profile?.displayName || '', provider: user.provider || 'legacy', linked: Boolean(profile), admin: await isAdmin(store, user) } : null },
          capture: { status: 'remote', experimental: true },
          overallLeaderboard:phase.timesRevealed?overallStandings(rows.filter(r=>r.current),challenge.assignments):[],
          leaderboard: leaders, participants, sharedRuns, stats: { completions: rows.filter(r => r.current && r.status !== 'rejected').length, players: participants.length, characters: new Set(rows.filter(r => r.current && r.status !== 'rejected').map(r => r.character)).size },
          history: mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).map(r => ({ id: r.id, character: r.character, stage: r.stage, frames: r.frames, createdAt: r.createdAt, status: r.status, current:r.current, disclosed:disclosed.has(`${r.playerId}:${r.id}`), disclosureKind:disclosed.has(`${r.playerId}:${r.id}`)?disclosed.get(`${r.playerId}:${r.id}`).kind||'replay':'private', reviewNote: r.reviewNote })),
          progress: Object.fromEntries(Object.keys(challenge.assignments).map(character => {
            const attempts = mine.filter(r => r.character === character);
            return [character, { runs: attempts.length, best: attempts.length ? Math.min(...attempts.map(r => r.frames)) : null }];
          })),
          personalBest: personalBest ? { frames: personalBest.frames } : null, character,
        });
      }
      if (req.method === 'GET' && path === 'challenge/code') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="Custom-Melee-BTT-${challenge.rules.seed}.txt"` });
        return res.end(gecko);
      }
      if (req.method === 'POST' && path === 'auth/logout') {
        const token = cookieValue(req, 'ttrc_session');
        if (/^[a-f0-9]{64}$/.test(token || '')) await store.delete(`sessions/${hash(token)}.json`);
        res.setHeader('Set-Cookie', cookie('ttrc_session', '', 0));
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && ['players/create', 'players/download'].includes(path)) {
        if (!allowLegacySignup) return json(res, 410, { error: 'Sign in with your username and password. Player file downloads are no longer used.' });
        let profile;
        if (path === 'players/create') {
          const input = await body(req);
          const name = typeof input.displayName === 'string' ? input.displayName.trim() : '';
          if (!name || name.length > 24 || /[\u0000-\u001f\u007f]/u.test(name)) return json(res, 400, { error: 'Choose a name between 1 and 24 characters.' });
          // Persist the limit across serverless instances. Store a hash, never an IP address.
          const ip = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
          const bucket = hash(`${secret}:${ip}:${Math.floor(Date.now() / 3600_000)}`);
          let reserved = false;
          for (let slot = 0; slot < 10; slot++) {
            try { await store.put(`signup-limits/${bucket}/${slot}.json`, { at: Date.now() }); reserved = true; break; } catch { }
          }
          if (!reserved) return json(res, 429, { error: 'Too many new profiles. Try again in an hour.' });
          const id = hash(random());
          profile = { id, displayName: name, connectCode: `TT#${String(parseInt(id.slice(0, 8), 16) % 100000).padStart(5, '0')}` };
          await store.put(`profiles/${id}.json`, profile);
        } else {
          const user = await session(req);
          if (!user) return json(res, 401, { error: 'Open the website from your companion to download your player file again.' });
          profile = await store.get(`profiles/${user.id}.json`);
          if (!profile) return json(res, 404, { error: 'Profile not found.' });
        }
        const token = random();
        await store.put(`devices/${hash(token)}.json`, { ...profile, expires: Date.now() + 365 * 86400_000 });
        const sessionToken = random();
        await store.put(`sessions/${hash(sessionToken)}.json`, { id: profile.id, name: profile.displayName, expires: Date.now() + 30 * 86400_000 });
        res.setHeader('Set-Cookie', cookie('ttrc_session', sessionToken, 30 * 86400));
        return json(res, 200, { playerFile: { format: 'target-test-player-v1', origin, ...profile, token } });
      }
      if (req.method === 'GET' && path === 'companion/me') {
        const device = await bearer(req);
        if (!device) return json(res, 401, { error: 'Player key expired or not found.' });
        return json(res, 200, { playerId: device.id, displayName: device.displayName, connectCode: device.connectCode });
      }
      if (req.method === 'POST' && path === 'companion/browser') {
        const device = await bearer(req);
        if (!device) return json(res, 401, { error: 'Open your companion to sign in.' });
        const ticket = random();
        await store.put(`tickets/${hash(ticket)}.json`, { id: device.id, name: device.displayName, provider: device.provider || 'legacy', username: device.username, revision: device.revision, expires: Date.now() + 60_000 });
        // Fragment stays out of HTTP logs and is removed by the browser before redemption.
        return json(res, 200, { url: `${origin}/#signin=${ticket}` });
      }
      if (req.method === 'POST' && path === 'auth/companion') {
        const input = await body(req);
        if (!/^[a-f0-9]{64}$/.test(input.ticket || '')) return json(res, 400, { error: 'Invalid sign-in link.' });
        const key = hash(input.ticket);
        const ticket = await store.get(`tickets/${key}.json`);
        if (!ticket || ticket.expires <= Date.now()) return json(res, 401, { error: 'Sign-in link expired. Open the website from your companion again.' });
        try { await store.put(`tickets-used/${key}.json`, { at: Date.now() }); }
        catch { return json(res, 409, { error: 'Sign-in link already used.' }); }
        const token = random();
        await store.put(`sessions/${hash(token)}.json`, { id: ticket.id, name: ticket.name, provider: ticket.provider, username: ticket.username, revision: ticket.revision, expires: Date.now() + 30 * 86400_000 });
        await store.delete(`tickets/${key}.json`);
        res.setHeader('Set-Cookie', cookie('ttrc_session', token, 30 * 86400));
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'Resource not found.' });
    } catch { return json(res, 503, { error: 'Service temporarily unavailable.' }); }
  };
}
