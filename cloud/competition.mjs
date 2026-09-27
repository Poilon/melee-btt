import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { inspectReplay, MAX_REPLAY_BYTES } from '../shared/replay.mjs';
import { isAdmin } from './admin.mjs';
import { createLifecycle } from './lifecycle.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const cookieValue = (req, name) => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1);
export function createCompetition({ store, challenge, gecko, origin, reviewerKey, endsAt, challengeManager, bearer, session, json, now = Date.now }) {
  let cache;
  const send = (res, status, value) => { json(res, status, value); return true; };
  const parseBody = async req => {
    const max = 3 * 1024 * 1024;
    if (req.body !== undefined) { if (JSON.stringify(req.body).length > max) throw new Error('Request too large.'); return typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    let text = ''; for await (const chunk of req) { text += chunk; if (text.length > max) throw new Error('Request too large.'); }
    return JSON.parse(text || '{}');
  };
  const lifecycle = createLifecycle({store, challengeId: challenge.id, endsAt, now});
  const phase = lifecycle.phase;
  const list = async () => {
    if (cache?.expires > now()) return cache.rows;
    const files = await store.list(`submissions/${challenge.id}/`);
    const rows = (await Promise.all(files.map(async f => {
      const r = await store.get(f.pathname);
      if (!r) return null;
      const decision = await store.get(`reviews/${challenge.id}/${r.playerId}/${r.id}.json`);
      return { ...r, status: decision?.status || 'submitted', reviewNote: decision?.note || '', reviewedAt: decision?.at || null };
    }))).filter(Boolean);
    // Deterministic selection makes delayed retries and simultaneous uploads safe.
    const current=new Set(),ordered=[...rows].filter(r=>r.status!=='rejected').sort((a,b)=>a.frames-b.frames||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
    const winners=new Set();for(const r of ordered){const key=`${r.playerId}:${r.character}`;if(!current.has(key)){current.add(key);winners.add(`${r.playerId}:${r.id}`);}}
    for(const r of rows)r.current=winners.has(`${r.playerId}:${r.id}`);
    cache = { rows, expires: now() + 15000 }; return rows;
  };
  const publicRecord = r => ({id:r.id,playerId:r.playerId,displayName:r.displayName,connectCode:r.connectCode,character:r.character,stage:r.stage,frames:r.frames,createdAt:r.createdAt,status:r.status});
  const disclosures = async () => {
    const files=await store.list(`disclosures/${challenge.id}/`);
    const entries=await Promise.all(files.map(f=>store.get(f.pathname)));
    return new Map(entries.filter(r=>r?.public).map(r=>[`${r.playerId}:${r.id}`,r]));
  };
  const shared = async () => {
    const visible=await disclosures();
    const state=await phase();
    return (await list()).filter(r=>visible.has(`${r.playerId}:${r.id}`)||(state.timesRevealed&&r.current&&r.status!=='rejected')).map(r=>({...publicRecord(r),hasReplay:Boolean((state.timesRevealed&&r.current&&r.status!=='rejected')||(visible.has(`${r.playerId}:${r.id}`)&&visible.get(`${r.playerId}:${r.id}`).kind!=='score')),disclosedAt:visible.get(`${r.playerId}:${r.id}`)?.at||state.closedAt})).sort((a,b)=>b.disclosedAt.localeCompare(a.disclosedAt)||a.id.localeCompare(b.id));
  };
  const reviewer = async req => {
    const account = await session(req);
    if (await isAdmin(store, account)) return {reviewer: account.id, account: true};
    const authorization = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (reviewerKey && authorization && timingSafeEqual(Buffer.from(hash(authorization)), Buffer.from(hash(reviewerKey)))) return { reviewer: hash(reviewerKey) };
    const token = cookieValue(req, 'ttrc_review');
    if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
    const reviewSession = await store.get(`review-sessions/${hash(token)}.json`);
    return reviewSession?.expires > now() ? reviewSession : null;
  };
  const handle = async (path, req, res) => {
    if (path === 'runs' && req.method === 'POST') return send(res, 410, { error: 'Attach a .slp replay and submit the run from the companion.' });
    if (path === 'submissions' && req.method === 'POST') {
      const device = await bearer(req);
      if (!device) return send(res, 401, { error: 'Import your player file first.' });
      if ((await phase()).phase !== 'open') return send(res, 409, { error: 'This challenge is closed. New submissions are not accepted.' });
      let input, bytes, replay;
      try {
        input = await parseBody(req);
        if (!uuid.test(input.id || '') || input.challengeId !== challenge.id || input.geckoSha256 !== challenge.geckoSha256 ||
            !Object.hasOwn(challenge.assignments, input.character) || challenge.assignments[input.character] !== input.stage ||
            !Number.isInteger(input.frames) || input.frames < 1 || input.frames > 216000 ||
            typeof input.replay !== 'string' || input.replay.length > Math.ceil(MAX_REPLAY_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.replay)) throw new Error('Invalid submission.');
        bytes = Buffer.from(input.replay, 'base64');
        replay = inspectReplay(bytes, input, gecko);
        if(replay.pauseFrames>0)throw new Error('Replay contains a pause. Paused runs cannot be submitted.');
      } catch (error) { return send(res, 400, { error: error.message?.startsWith('Replay') || error.message?.startsWith('This replay') || error.message?.startsWith('Not a Slippi') ? error.message : 'Invalid or incompatible .slp replay.' }); }
      const recordPath = `submissions/${challenge.id}/${device.id}/${input.id}.json`;
      const evidencePath = `evidence/${challenge.id}/${device.id}/${input.id}.json`;
      const digest = hash(JSON.stringify([challenge.id, input.character, input.stage, input.frames, replay.sha256]));
      // This fixed immutable claim prevents reusing a run ID for a new time or different replay.
      const claimPath = `submission-claims/${challenge.id}/${device.id}/${input.id}.json`;
      try { await store.put(claimPath, { digest }); } catch {
        if ((await store.get(claimPath))?.digest !== digest) return send(res, 409, { error: 'This run was already submitted with different evidence.' });
      }
      if (!await store.get(evidencePath)) {
        try { await store.put(evidencePath, { base64: bytes.toString('base64'), sha256: replay.sha256 }); }
        catch { if ((await store.get(evidencePath))?.sha256 !== replay.sha256) throw new Error('Evidence storage failed'); }
      }
      const record = { id: input.id, playerId: device.id, displayName: device.displayName, connectCode: device.connectCode,
        character: input.character, stage: input.stage, frames: input.frames, createdAt: new Date(now()).toISOString(), replay, digest };
      try { await store.put(recordPath, record); } catch { if ((await store.get(recordPath))?.digest !== digest) throw new Error('Submission storage failed'); }
      cache = null;
      return send(res, 202, { ok: true, status: 'submitted', id: input.id });
    }
    if(path==='submissions/disclose'&&req.method==='POST'){
      const user=await session(req)||await bearer(req);if(!user)return send(res,401,{error:'Sign in to disclose your own run.'});
      const input=await parseBody(req);
      if(!uuid.test(input.id||'')||typeof input.public!=='boolean'||(input.kind!==undefined&&!['score','replay'].includes(input.kind)))return send(res,400,{error:'Invalid disclosure request.'});
      const record=await store.get(`submissions/${challenge.id}/${user.id}/${input.id}.json`);
      if(!record)return send(res,404,{error:'Run not found.'});
      if((!input.public||input.kind==='score')&&(await phase()).timesRevealed&&(await list()).some(r=>r.id===input.id&&r.playerId===user.id&&r.current&&r.status!=='rejected'))return send(res,409,{error:'This final record and its replay are already public after reveal.'});
      await store.put(`disclosures/${challenge.id}/${user.id}/${input.id}.json`,{id:input.id,playerId:user.id,public:input.public,kind:input.kind||'replay',at:new Date(now()).toISOString()},true);
      return send(res,200,{ok:true,public:input.public});
    }
    if(['shared/run','shared/replay'].includes(path)&&req.method==='GET'){
      const url=new URL(req.url,origin),id=url.searchParams.get('id'),playerId=url.searchParams.get('playerId');
      if(!uuid.test(id||'')||!/^[a-f0-9]{64}$/.test(playerId||''))return send(res,404,{error:'Public run not found.'});
      // Read the permission directly on every request, including replay downloads.
      const visible=await store.get(`disclosures/${challenge.id}/${playerId}/${id}.json`);
      const record=(await list()).find(r=>r.id===id&&r.playerId===playerId);
      const finalPublic=(await phase()).timesRevealed&&record?.current&&record.status!=='rejected';
      if(!visible?.public&&!finalPublic)return send(res,404,{error:'Public run not found.'});
      const hasReplay=Boolean(finalPublic||(visible?.public&&visible.kind!=='score'));
      if(path==='shared/run'){
        if(!record)return send(res,404,{error:'Public run not found.'});
        return send(res,200,{challengeId:challenge.id,run:{...publicRecord(record),hasReplay}});
      }
      if(!hasReplay)return send(res,404,{error:'This replay is private. Only the score was shared.'});
      const evidence=await store.get(`evidence/${challenge.id}/${playerId}/${id}.json`);
      if(!evidence)return send(res,404,{error:'Public replay not found.'});
      res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${id}.slp"`});res.end(Buffer.from(evidence.base64,'base64'));return true;
    }
    if (path === 'submissions/mine' && req.method === 'GET') {
      const device = await bearer(req);
      if (!device) return send(res, 401, { error: 'Player not connected.' });
      const visible=await disclosures();
      const mine = (await list()).filter(r => r.playerId === device.id).map(r => ({ id: r.id, status: r.status, current:r.current, reviewNote: r.reviewNote, reviewedAt: r.reviewedAt,disclosure:visible.has(`${r.playerId}:${r.id}`)?visible.get(`${r.playerId}:${r.id}`).kind||'replay':'private' }));
      return send(res, 200, { submissions: mine, competition: await phase() });
    }
    if (path === 'review/login' && req.method === 'POST') {
      const input = await parseBody(req);
      if (!reviewerKey || typeof input.key !== 'string' || !timingSafeEqual(Buffer.from(hash(input.key)), Buffer.from(hash(reviewerKey)))) return send(res, 401, { error: 'Reviewer key not accepted.' });
      const token = randomBytes(32).toString('hex');
      await store.put(`review-sessions/${hash(token)}.json`, { reviewer: hash(reviewerKey), expires: now() + 3600000 });
      res.setHeader('Set-Cookie', `ttrc_review=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`);
      return send(res, 200, { ok: true });
    }
    if (path.startsWith('review/')) {
      const user = await reviewer(req);
      if (!user) return send(res, 401, { error: 'Sign in with an admin account to manage this challenge.' });
      if(path==='review/generate'&&req.method==='POST'){
        if(!challengeManager)return send(res,503,{error:'Challenge generation unavailable here.'});
        const input=await parseBody(req);
        try{return send(res,201,await challengeManager.regenerate(input,user.reviewer));}
        catch(error){if(error.status)return send(res,error.status,{error:error.message});throw error;}
      }
      if (path === 'review/queue' && req.method === 'GET') return send(res, 200, { challenge, competition: await phase(), submissions: (await list()).filter(r=>r.current||r.status==='rejected') });
      if (path === 'review/replay' && req.method === 'GET') {
        const url = new URL(req.url, origin), id = url.searchParams.get('id'), playerId = url.searchParams.get('playerId');
        if (!uuid.test(id || '') || !/^[a-f0-9]{64}$/.test(playerId || '')) return send(res, 400, { error: 'Invalid submission ID.' });
        const value = await store.get(`evidence/${challenge.id}/${playerId}/${id}.json`);
        if (!value) return send(res, 404, { error: 'Replay not found.' });
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${id}.slp"` }); res.end(Buffer.from(value.base64, 'base64')); return true;
      }
      if (path === 'review/decision' && req.method === 'POST') {
        const input = await parseBody(req);
        if (!uuid.test(input.id || '') || !/^[a-f0-9]{64}$/.test(input.playerId || '') || !['approved','rejected'].includes(input.status) || typeof input.note !== 'string' || input.note.length > 500) return send(res, 400, { error: 'Invalid review decision.' });
        const record = await store.get(`submissions/${challenge.id}/${input.playerId}/${input.id}.json`);
        if (!record) return send(res, 404, { error: 'Submission not found.' });
        try { await store.put(`reviews/${challenge.id}/${input.playerId}/${input.id}.json`, { status: input.status, note: input.note.trim(), reviewer: user.reviewer, at: new Date(now()).toISOString(), evidenceSha256: record.replay.sha256 }); }
        catch { return send(res, 409, { error: 'This submission has already been reviewed.' }); }
        cache = null; return send(res, 200, { ok: true });
      }
      if (path === 'review/close' && req.method === 'POST') {
        const input = await parseBody(req);
        if (input.challengeId !== challenge.id || input.confirm !== 'REVEAL') return send(res, 400, { error: 'Confirm the current challenge before revealing times.' });
        try { return send(res, 200, { competition: await lifecycle.close(user.reviewer) }); }
        catch (error) { if (error.status) return send(res, error.status, {error: error.message}); throw error; }
      }
      if (path === 'review/schedule' && req.method === 'POST') {
        const input = await parseBody(req);
        if (input.challengeId !== challenge.id || !Object.hasOwn(input, 'endsAt')) return send(res, 400, {error: 'Choose a deadline for the current challenge.'});
        try { return send(res, 200, {competition: await lifecycle.schedule(input.endsAt, user.reviewer)}); }
        catch (error) { if (error.status) return send(res, error.status, {error: error.message}); throw error; }
      }
      if (path === 'review/logout' && req.method === 'POST') {
        const token = cookieValue(req, 'ttrc_review');
        if (token) await store.delete(`review-sessions/${hash(token)}.json`);
        res.setHeader('Set-Cookie', 'ttrc_review=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
        return send(res, 200, { ok: true });
      }
    }
    return false;
  };
  return { handle, list, phase, disclosures, shared };
}
