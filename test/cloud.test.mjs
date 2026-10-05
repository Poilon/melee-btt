import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCloudHandler } from '../cloud/backend.mjs';
import { parsePlayer, playerIdentity, readPlayer, savePlayer } from '../server/player.mjs';
import { RemoteSync } from '../server/remote.mjs';
import { requestOrigin } from '../cloud/origins.mjs';
import { WorldsClient, WORLDS_ORIGIN } from '../desktop/worlds-online.mjs';

const origin = 'https://test.vercel.app';
const replay = await readFile(new URL('./fixtures/BTTDK.slp', import.meta.url));
const reviewerKey = 'd'.repeat(64);
const challenge = { id: 'test-seed', geckoSha256: 'test-code', rules: { seed: 42 }, assignments: { fox: 'samus', marth: 'mewtwo', 'donkey-kong': 'donkey-kong' } };

test('domain migration keeps browser login and saved sessions compatible with released Dolphin clients', async()=>{
 const canonical='https://melee-btt.com';
 for(const clientOrigin of [WORLDS_ORIGIN,canonical,'https://www.melee-btt.com']){
  const root=await mkdtemp(join(tmpdir(),'btt-domain-login-'));
  const routed=requestOrigin(new URL(clientOrigin).host,canonical);
  const {request}=fixture({origin:routed,gameAccountsOnly:true,allowLegacySignup:false});
  let opened;
  const fetcher=async(url,options)=>{
   assert.equal(new URL(url).origin,clientOrigin);
   const result=await request(new URL(url).pathname.slice(5),{method:options.method,headers:options.headers,body:options.body?JSON.parse(options.body):undefined});
   return Response.json(result.data,{status:result.status});
  };
  const client=new WorldsClient({root,course:{},origin:clientOrigin,fetcher,openBrowser:async url=>{opened=new URL(url);}});
  const query=op=>client.handle({op,address:0x81000000,sequence:op});
  try{
   const start=await query(7);
   assert.equal(Buffer.from(start.bytes,'base64').readUInt32BE(0),0);
   assert.equal(opened.origin,clientOrigin);
   const fragment=new URLSearchParams(opened.hash.slice(1));
   const browser={id:fragment.get('request'),browserSecret:fragment.get('key')};
   const signup=await request('auth/signup',{method:'POST',headers:{origin:clientOrigin},body:{...browser,username:'domain_player',password:'domain-test-password-42'}});
   assert.equal(signup.status,200);
   const approved=await request('game/connect/approve',{method:'POST',headers:{origin:clientOrigin,cookie:signup.headers['set-cookie'].split(';')[0]},body:browser});
   assert.equal(approved.status,200);
   const connected=await query(8);
   assert.equal(Buffer.from(connected.bytes,'base64').readUInt32BE(4),1);
   assert.equal(client.identity.origin,clientOrigin);
   const restarted=new WorldsClient({root,course:{},origin:clientOrigin,fetcher});await restarted.load();
   assert.equal(restarted.identity.slug,'domain_player');
  }finally{await client.cancelLogin();await rm(root,{recursive:true,force:true});}
 }
});

test('request origin routing never trusts unknown or lookalike hosts',()=>{
 const canonical='https://melee-btt.com';
 for(const host of [undefined,'evil.test','melee-btt.com.evil.test','target-test-randomizer-challenge.vercel.app.evil.test','melee-btt.com@evil.test'])assert.equal(requestOrigin(host,canonical),canonical);
 assert.equal(requestOrigin('preview.test','https://preview.test'),'https://preview.test');
});
function fixture(options = {}) {
  const rows = new Map(), versions = new Map();
  const store = {
    async get(path) { return rows.get(path)?.value ?? null; },
    async put(path, value, overwrite = false) { if (!overwrite && rows.has(path)) throw new Error('Exists'); rows.set(path, { value, uploadedAt: new Date() }); versions.set(path, (versions.get(path) || 0) + 1); },
    async readVersion(path) { return rows.has(path) ? {value: structuredClone(rows.get(path).value), etag: versions.get(path)} : null; },
    async writeVersion(path, value, etag) { if (versions.get(path) !== etag) return false; await this.put(path, value, true); return true; },
    async delete(path) { rows.delete(path); },
    async list(prefix) { return [...rows].filter(([p]) => p.startsWith(prefix)).map(([pathname, r]) => ({ pathname, uploadedAt: r.uploadedAt })); },
  };
  const handler = createCloudHandler({ store, challenge, gecko: 'CODE', origin, secret: 'test-secret', reviewerKey, allowLegacySignup: true, ...options,
  });
  async function request(path, { method = 'GET', headers = {}, body } = {}) {
    const result = { headers: {}, status: 200 };
    const res = {
      setHeader(k, v) { result.headers[k.toLowerCase()] = v; },
      writeHead(status, headers = {}) { result.status = status; for (const [k, v] of Object.entries(headers)) this.setHeader(k, v); },
      end(value) { result.text = value || ''; try { result.data = JSON.parse(value); } catch {} },
    };
    await handler({ url: `/api/${path}`, method, headers, body }, res);
    return result;
  }
  return { request, rows };
}

test('player files create real independent profiles, authenticate runs and support one-time browser sign-in', async () => {
  const { request, rows } = fixture();
  assert.equal((await request('players/create', { method: 'POST', body: { displayName: 'Player' } })).status, 403);
  assert.equal((await request('players/create', { method: 'POST', headers: { origin }, body: { displayName: '   ' } })).status, 400);
  const created = await request('players/create', { method: 'POST', headers: { origin }, body: { displayName: 'Player' } });
  assert.equal(created.status, 200);
  const file = created.data.playerFile;
  assert.equal(file.format, 'target-test-player-v1');
  const cookie = created.headers['set-cookie'].split(';')[0];
  assert.match(created.headers['set-cookie'], /HttpOnly; Secure; SameSite=Lax/);
  const second = await request('players/create', { method: 'POST', headers: { origin }, body: { displayName: 'Player' } });
  assert.notEqual(second.data.playerFile.id, file.id); // Names cannot claim someone else's account.
  const run = { id: randomUUID(), challengeId: challenge.id, geckoSha256: challenge.geckoSha256, character: 'donkey-kong', stage: 'donkey-kong', frames: 1234, replay: replay.toString('base64') };
  assert.equal((await request('submissions', { method: 'POST', body: run })).status, 401);
  const headers = { authorization: `Bearer ${file.token}` };
  assert.equal((await request('submissions', { method: 'POST', headers, body: { ...run, stage: 'fox' } })).status, 400);
  assert.equal((await request('submissions', { method: 'POST', headers, body: run })).status, 202);
  assert.equal((await request('submissions', { method: 'POST', headers, body: run })).status, 202);
  assert.equal((await request('submissions', { method: 'POST', headers, body: { ...run, frames: 100 } })).status, 409);
  const publicBoard = (await request('dashboard?character=donkey-kong')).data;
  assert.equal(publicBoard.identity, null); assert.equal(publicBoard.history.length, 0);
  assert.equal(publicBoard.stats.completions, 1); assert.deepEqual(publicBoard.leaderboard, []);
  const privateBoard = (await request('dashboard?character=donkey-kong', { headers: { cookie } })).data;
  assert.equal(privateBoard.identity.displayName, 'Player'); assert.equal(privateBoard.personalBest.frames, 1234);
  assert.deepEqual(privateBoard.progress['donkey-kong'], { best: 1234, runs: 1 });
  assert.equal((await request('dashboard?character=marth')).data.leaderboard.length, 0);
  assert.equal((await request('dashboard?character=constructor')).status, 400);
  assert.ok(!JSON.stringify([...rows]).includes(file.token));
  assert.ok(!JSON.stringify(privateBoard).includes(file.token));
  const link = await request('companion/browser', { method: 'POST', headers });
  const ticket = new URL(link.data.url).hash.slice(8);
  const signin = await request('auth/companion', { method: 'POST', headers: { origin }, body: { ticket } });
  assert.equal(signin.status, 200);
  assert.notEqual((await request('auth/companion', { method: 'POST', headers: { origin }, body: { ticket } })).status, 200);
  const downloaded = await request('players/download', { method: 'POST', headers: { cookie, origin } });
  assert.equal(downloaded.data.playerFile.id, file.id);
  assert.notEqual(downloaded.data.playerFile.token, file.token);
  await request('auth/logout', { method: 'POST', headers: { cookie, origin } });
  assert.equal((await request('dashboard?character=donkey-kong', { headers: { cookie } })).data.auth.account, null);
  assert.equal((await request('players/download', { method: 'POST', headers: { cookie, origin } })).status, 401);
});

test('expired sign-in tickets and device keys fail, and signup limits persist', async () => {
  const { request, rows } = fixture();
  const created = await request('players/create', { method: 'POST', headers: { origin }, body: { displayName: 'Player' } });
  const headers = { authorization: `Bearer ${created.data.playerFile.token}` };
  const link = await request('companion/browser', { method: 'POST', headers });
  for (const [path, row] of rows) if (path.startsWith('tickets/')) row.value.expires = 0;
  assert.equal((await request('auth/companion', { method: 'POST', headers: { origin }, body: { ticket: new URL(link.data.url).hash.slice(8) } })).status, 401);
  for (const [path, row] of rows) if (path.startsWith('devices/')) row.value.expires = 0;
  assert.equal((await request('companion/me', { headers })).status, 401);
  for (let i = 0; i < 9; i++) assert.equal((await request('players/create', { method: 'POST', headers: { origin }, body: { displayName: 'Player' } })).status, 200);
  assert.equal((await request('players/create', { method: 'POST', headers: { origin }, body: { displayName: 'Player' } })).status, 429);
});

test('own player file imports without Slippi, excludes credentials and retries durable runs after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ttrc-sync-'));
  try {
    const requests = []; let online = false;
    const file = { format: 'target-test-player-v1', origin, id: 'b'.repeat(64), token: 'a'.repeat(64), displayName: 'Player', connectCode: 'TT#12345' };
    const fetcher = async (url, init) => {
      requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
      if (url.endsWith('/me')) return Response.json({ playerId: file.id, displayName: file.displayName, connectCode: file.connectCode });
      return Response.json({ ok: online }, { status: online ? 202 : 503 });
    };
    const sync = new RemoteSync(directory, origin, fetcher); await sync.initialize();
    assert.throws(() => parsePlayer({ uid: 'slippi', playKey: 'not-our-file' }, origin));
    assert.throws(() => parsePlayer({ ...file, origin: 'https://evil.test' }, origin));
    const parsed = parsePlayer({ ...file, unwanted: 'PRIVATE_EXTRA' }, origin);
    assert.equal(parsed.unwanted, undefined);
    await sync.usePlayer(parsed);
    await savePlayer(join(directory, 'Dolphin/user.json'), parsed);
    assert.deepEqual(await readPlayer(join(directory, 'Dolphin/user.json'), origin), parsed);
    const identity = playerIdentity(parsed);
    assert.ok(!JSON.stringify(identity).includes(file.token));
    const run = { id: randomUUID(), identity, challenge, character: 'donkey-kong', stage: 'donkey-kong', frames: 1234, replay: replay.toString('base64') };
    await sync.enqueue(run, replay, 'test.slp'); assert.equal(sync.status().pending, 1);
    assert.ok(!JSON.stringify(requests).includes(file.token));
    online = true;
    const restarted = new RemoteSync(directory, origin, fetcher); await restarted.initialize();
    assert.equal(restarted.status().pending, 0);
    assert.deepEqual(await readdir(join(directory, 'outbox')), []);
    const count = requests.length;
    await assert.rejects(restarted.enqueue({ ...run, id: randomUUID(), identity: { ...identity, id: 'another-player' } }, replay));
    assert.equal(requests.length, count);
    await assert.rejects(restarted.usePlayer({ ...file, token: 'c'.repeat(64), displayName: 'Imposter' }));
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('participants are alphabetical; rankings, times and replays stay sealed until closure', async () => {
  const { request } = fixture();
  const signup = name => request('players/create', { method: 'POST', headers: { origin }, body: { displayName: name } });
  const a = await signup('Alice'), b = await signup('Bob');
  const token = a.data.playerFile.token, playerId = a.data.playerFile.id;
  const cookie = a.headers['set-cookie'].split(';')[0];
  const headers = { authorization: `Bearer ${token}` };
  const admin = { authorization: `Bearer ${reviewerKey}`, origin };
  const run = { id: randomUUID(), challengeId: challenge.id, geckoSha256: challenge.geckoSha256,
    character: 'donkey-kong', stage: 'donkey-kong', frames: 1234, replay: replay.toString('base64') };
  assert.equal((await request('runs', { method: 'POST', headers, body: run })).status, 410);
  assert.equal((await request('submissions', { method: 'POST', headers, body: { ...run, replay: Buffer.from('fake.slp').toString('base64') } })).status, 400);
  assert.equal((await request('submissions', { method: 'POST', headers, body: run })).status, 202);
  const evidenceUrl = `review/replay?id=${run.id}&playerId=${playerId}`;
  assert.equal((await request(evidenceUrl)).status, 401);
  assert.equal((await request(evidenceUrl, { headers })).status, 401);
  assert.equal((await request('review/queue', { headers: { cookie } })).status, 401);
  assert.deepEqual((await request(evidenceUrl, { headers: admin })).text, replay);
  const approve = { id: run.id, playerId, status: 'approved', note: 'Playback checked' };
  assert.equal((await request('review/decision', { method: 'POST', headers: { origin, cookie }, body: approve })).status, 401);
  assert.equal((await request('review/decision', { method: 'POST', headers: admin, body: approve })).status, 200);
  assert.equal((await request('review/decision', { method: 'POST', headers: admin, body: approve })).status, 409);
  const mine = (await request('submissions/mine', { headers })).data;
  assert.equal(mine.submissions[0].status, 'approved');
  // Even a faster submitted run remains hidden until reveal.
  const bob = { ...run, id: randomUUID(), frames: 1000 };
  const bobHeaders = { authorization: `Bearer ${b.data.playerFile.token}` };
  assert.equal((await request('submissions', { method: 'POST', headers: bobHeaders, body: bob })).status, 202);
  for (const reader of [{}, { cookie: b.headers['set-cookie'].split(';')[0] }]) {
    const board = (await request('dashboard?character=donkey-kong', { headers: reader })).data;
    assert.deepEqual(board.leaderboard, []);
    assert.deepEqual(board.participants.map(p=>p.displayName), ['Alice','Bob']);
    assert.equal(board.competition.timesRevealed, false);
    assert.ok(!JSON.stringify(board).includes('1234')); // Not merely hidden with CSS.
    for(const p of board.participants)assert.deepEqual(Object.keys(p).sort(), ['playerId','displayName','connectCode'].sort());
  }
  assert.equal((await request('dashboard?character=donkey-kong', { headers: { cookie } })).data.personalBest.frames, 1234);
  await request('review/decision', { method: 'POST', headers: admin, body: { id: bob.id, playerId: b.data.playerFile.id, status: 'rejected', note: 'Wrong time' } });
  assert.equal((await request('dashboard?character=donkey-kong')).data.stats.completions, 1);
  assert.deepEqual((await request('dashboard?character=fox')).data.participants.map(p=>p.displayName), ['Alice']);
  assert.equal((await request('review/close', { method: 'POST', headers: admin, body: { challengeId: challenge.id } })).status, 400);
  assert.equal((await request('review/close', { method: 'POST', headers: admin, body: { challengeId: challenge.id, confirm: 'REVEAL' } })).status, 200);
  const closed = (await request('dashboard?character=donkey-kong')).data;
  assert.equal(closed.competition.timesRevealed, true); assert.equal(closed.leaderboard[0].frames, 1234); assert.equal(closed.leaderboard[0].rank, 1);
  assert.equal((await request('submissions', { method: 'POST', headers, body: { ...run, id: randomUUID() } })).status, 409);
});

test('reviewer session is protected, expires, and an optional deadline closes submission', async () => {
  let clock = Date.now();
  const { request } = fixture({ now: () => clock, endsAt: new Date(clock + 5000).toISOString() });
  assert.equal((await request('review/login', { method: 'POST', body: { key: reviewerKey } })).status, 403);
  assert.equal((await request('review/login', { method: 'POST', headers: { origin }, body: { key: 'wrong' } })).status, 401);
  const login = await request('review/login', { method: 'POST', headers: { origin }, body: { key: reviewerKey } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  assert.match(login.headers['set-cookie'], /HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await request('review/queue', { headers: { cookie } })).status, 200);
  clock += 5001;
  assert.equal((await request('dashboard')).data.competition.phase, 'closed');
  clock += 3600000;
  assert.equal((await request('review/queue', { headers: { cookie } })).status, 401);
});

test('the website returns all own submitted runs across characters without exposing another player’s history',async()=>{
  const {request,rows}=fixture();
  const created=await request('players/create',{method:'POST',headers:{origin},body:{displayName:'Full history'}});
  const playerId=created.data.playerFile.id,cookie=created.headers['set-cookie'].split(';')[0];
  for(let i=0;i<62;i++){
    const id=randomUUID(),character=i<60?'fox':'marth';
    rows.set(`submissions/${challenge.id}/${playerId}/${id}.json`,{value:{id,playerId,displayName:'Full history',connectCode:'TT#1',character,stage:challenge.assignments[character],frames:i===0?600:1200+i,createdAt:new Date(1700000000000+i*1000).toISOString(),replay:{secret:'private-evidence'}}});
  }
  rows.set(`submissions/${challenge.id}/other/other.json`,{value:{id:'other',playerId:'other',displayName:'Other',connectCode:'TT#2',character:'fox',stage:'samus',frames:499,createdAt:new Date().toISOString()}});
  for(const character of ['fox','marth']){
    const board=(await request(`dashboard?character=${character}`,{headers:{cookie}})).data;
    assert.equal(board.history.length,62);assert.equal(board.history.at(-1).frames,600);
    assert.equal(board.history.filter(r=>r.character==='marth').length,2);
    assert.ok(!board.history.some(r=>r.id==='other'||r.replay));
    assert.equal(board.progress.fox.best,600);assert.deepEqual(board.leaderboard,[]);
  }
  const anonymous=(await request('dashboard')).data;
  assert.deepEqual(anonymous.history,[]);assert.deepEqual(anonymous.leaderboard,[]);assert.ok(!JSON.stringify(anonymous).includes('private-evidence'));
});

test('paused replays cannot enter the submission queue even through the public API',async()=>{
 const {withPause}=await import('./support/replay-with-pause.mjs');const {request,rows}=fixture();
 const created=await request('players/create',{method:'POST',headers:{origin},body:{displayName:'Paused run'}});
 const response=await request('submissions',{method:'POST',headers:{authorization:`Bearer ${created.data.playerFile.token}`},body:{id:randomUUID(),challengeId:challenge.id,geckoSha256:challenge.geckoSha256,character:'donkey-kong',stage:'donkey-kong',frames:1101,replay:withPause(replay).toString('base64')}});
 assert.equal(response.status,400);assert.match(response.data.error,/pause/);assert.ok(![...rows.keys()].some(key=>key.startsWith('submissions/')||key.startsWith('evidence/')));
});

test('new records replace current submissions without inheriting disclosure or leaking private evidence',async()=>{
 const {request}=fixture(),admin={origin,authorization:`Bearer ${reviewerKey}`};
 const created=await request('players/create',{method:'POST',headers:{origin},body:{displayName:'Owner'}});
 const other=await request('players/create',{method:'POST',headers:{origin},body:{displayName:'Other'}});
 const playerId=created.data.playerFile.id,cookie=created.headers['set-cookie'].split(';')[0],otherCookie=other.headers['set-cookie'].split(';')[0];
 const headers={authorization:`Bearer ${created.data.playerFile.token}`};
 const payload=frames=>({id:randomUUID(),challengeId:challenge.id,geckoSha256:challenge.geckoSha256,character:'donkey-kong',stage:'donkey-kong',frames,replay:replay.toString('base64')});
 const old=payload(1600),best=payload(1300),middle=payload(1500);
 const submit=body=>request('submissions',{method:'POST',headers,body});
 const disclose=(id,isPublic=true,h={origin,cookie})=>request('submissions/disclose',{method:'POST',headers:h,body:{id,public:isPublic}});
 const evidence=id=>`shared/replay?id=${id}&playerId=${playerId}`;
 await submit(old);assert.equal((await request(evidence(old.id))).status,404);
 assert.equal((await disclose(old.id,true,{origin})).status,401);
 assert.equal((await disclose(old.id,true,{cookie})).status,403);
 assert.equal((await disclose(old.id,true,{origin,cookie:otherCookie})).status,404);
 assert.equal((await disclose(old.id)).status,200);assert.deepEqual((await request(evidence(old.id))).text,replay);
 await Promise.all([submit(best),submit(middle)]);await submit(old);
 const mine=(await request('dashboard',{headers:{cookie}})).data;
 assert.equal(mine.history.length,3);assert.deepEqual(mine.history.filter(r=>r.current).map(r=>r.id),[best.id]);
 assert.equal(mine.history.find(r=>r.id===best.id).disclosed,false);
 const queue=(await request('review/queue',{headers:admin})).data;
 assert.deepEqual(queue.submissions.map(r=>r.id),[best.id]);
 for(const reader of [{},{cookie:otherCookie}]){
  const board=(await request('dashboard',{headers:reader})).data;
  assert.deepEqual(board.leaderboard,[]);assert.deepEqual(board.history,[]);assert.equal(board.personalBest,null);
  assert.deepEqual(board.sharedRuns.map(r=>r.id),[old.id]);assert.equal(board.sharedRuns[0].frames,1600);
  assert.equal(board.sharedRuns[0].replay,undefined);assert.equal(board.sharedRuns[0].reviewNote,undefined);
  assert.ok(!JSON.stringify(board).includes(best.id));assert.ok(!JSON.stringify(board).includes(middle.id));
 }
 assert.equal((await request(evidence(best.id))).status,404);
 assert.equal((await request(`shared/run?id=${best.id}&playerId=${playerId}`)).status,404);
 assert.equal((await disclose(old.id,false)).status,200);
 assert.equal((await request(evidence(old.id))).status,404);
 assert.deepEqual((await request('dashboard')).data.sharedRuns,[]);
 assert.equal((await disclose(best.id)).status,200);
 assert.equal((await request(`shared/run?id=${best.id}&playerId=${playerId}`)).data.run.frames,1300);
 assert.deepEqual((await request(evidence(best.id))).text,replay);
});

test('submitted bests are included at reveal without approval and can be excluded afterwards',async()=>{
 const {request}=fixture(),admin={origin,authorization:`Bearer ${reviewerKey}`};
 const player=await request('players/create',{method:'POST',headers:{origin},body:{displayName:'Direct submit'}});
 const headers={authorization:`Bearer ${player.data.playerFile.token}`},playerId=player.data.playerFile.id;
 const bytes=await readFile(new URL('./fixtures/BTTDK.slp',import.meta.url));
 const run={id:randomUUID(),challengeId:challenge.id,geckoSha256:challenge.geckoSha256,character:'donkey-kong',stage:'donkey-kong',frames:1234,replay:bytes.toString('base64')};
 const upload=await request('submissions',{method:'POST',headers,body:run});
 assert.equal(upload.status,202);assert.equal(upload.data.status,'submitted');
 const better={...run,id:randomUUID(),frames:1100};await request('submissions',{method:'POST',headers,body:better});
 const open=(await request('dashboard?character=donkey-kong')).data;assert.deepEqual(open.leaderboard,[]);assert.equal(open.participants.length,1);assert.equal(open.stats.completions,1);
 const mine=(await request('submissions/mine',{headers})).data;assert.equal(mine.submissions.find(r=>r.id===better.id).status,'submitted');
 await request('review/close',{method:'POST',headers:admin,body:{challengeId:challenge.id,confirm:'REVEAL'}});
 const revealed=(await request('dashboard?character=donkey-kong')).data;assert.equal(revealed.leaderboard[0].frames,1100);
 assert.equal((await request('review/decision',{method:'POST',headers:admin,body:{id:better.id,playerId,status:'rejected',note:'Invalid time'}})).status,200);
 const corrected=(await request('dashboard?character=donkey-kong')).data;assert.equal(corrected.leaderboard[0].frames,1234);assert.equal(corrected.stats.completions,1);
});

test('admin access belongs to the signed-in account, cannot be self-assigned and is revoked immediately', async () => {
  const {request, rows} = fixture();
  const signup = async username => {
    const result = await request('auth/signup', {method:'POST', headers:{origin}, body:{username,password:'Test password 123',admin:true,role:'admin'}});
    assert.equal(result.status,200);
    return {id:result.data.profile.id,cookie:result.headers['set-cookie'].split(';')[0]};
  };
  const owner = await signup('organizer'), player = await signup('ordinary_player');
  const headers = {origin,cookie:owner.cookie};
  assert.equal((await request('dashboard',{headers})).data.auth.account.admin,false);
  assert.equal((await request('review/queue',{headers})).status,401);
  rows.set(`roles/${owner.id}.json`,{value:{role:'admin'}});
  assert.equal((await request('dashboard',{headers})).data.auth.account.admin,true);
  assert.equal((await request('review/queue',{headers})).status,200);
  const id=randomUUID(), record={id,playerId:player.id,displayName:'ordinary_player',connectCode:'TT#1',character:'fox',stage:'samus',frames:1531,createdAt:new Date().toISOString(),replay:{sha256:'evidence'}};
  rows.set(`submissions/${challenge.id}/${player.id}/${id}.json`,{value:record});
  rows.set(`evidence/${challenge.id}/${player.id}/${id}.json`,{value:{base64:replay.toString('base64')}});
  const evidence=`review/replay?id=${id}&playerId=${player.id}`;
  assert.deepEqual((await request(evidence,{headers})).text,replay);
  for(const h of [{},{origin,cookie:player.cookie},{origin,authorization:`Bearer ${'a'.repeat(64)}`}]) {
    assert.equal((await request(evidence,{headers:h})).status,401);
    assert.equal((await request('review/queue',{headers:h})).status,401);
    assert.notEqual((await request('review/close',{method:'POST',headers:h,body:{challengeId:challenge.id,confirm:'REVEAL'}})).status,200);
    assert.notEqual((await request('review/schedule',{method:'POST',headers:h,body:{challengeId:challenge.id,endsAt:null}})).status,200);
  }
  assert.equal((await request('review/decision',{method:'POST',headers,body:{id,playerId:player.id,status:'rejected',note:'Invalid clear'}})).status,200);
  assert.equal((await request('review/queue',{headers})).data.submissions[0].status,'rejected');
  assert.equal((await request('review/schedule',{method:'POST',headers:{cookie:owner.cookie},body:{challengeId:challenge.id,endsAt:null}})).status,403);
  assert.equal((await request('review/schedule',{method:'POST',headers:{...headers,origin:'https://evil.test'},body:{challengeId:challenge.id,endsAt:null}})).status,403);
  rows.delete(`roles/${owner.id}.json`);
  assert.equal((await request('review/queue',{headers})).status,401);
  assert.equal((await request(evidence,{headers})).status,401);
  assert.equal((await request('dashboard',{headers})).data.auth.account.admin,false);
});

test('scheduled reveal persists, closes submissions at the exact deadline, and cannot be reopened',async()=>{
  let clock=Date.now();const {request,rows}=fixture({now:()=>clock});
  const headers={origin,authorization:`Bearer ${reviewerKey}`};
  const schedule=endsAt=>request('review/schedule',{method:'POST',headers,body:{challengeId:challenge.id,endsAt}});
  for(const invalid of ['yesterday','',false,{},new Date(clock-1000).toISOString()])assert.equal((await schedule(invalid)).status,400);
  const end=new Date(clock+60000).toISOString();
  assert.equal((await schedule(end)).data.competition.endsAt,end);
  assert.equal((await request('dashboard')).data.competition.endsAt,end);
  assert.equal((await schedule(null)).data.competition.endsAt,null);
  assert.equal((await schedule(end)).status,200);
  const created=await request('players/create',{method:'POST',headers:{origin},body:{displayName:'At deadline'}});
  const playerId=created.data.playerFile.id,device={authorization:`Bearer ${created.data.playerFile.token}`};
  const run={id:randomUUID(),challengeId:challenge.id,geckoSha256:challenge.geckoSha256,character:'donkey-kong',stage:'donkey-kong',frames:1234,replay:replay.toString('base64')};
  assert.equal((await request('submissions',{method:'POST',headers:device,body:run})).status,202);
  clock+=59999;assert.equal((await request('dashboard')).data.competition.timesRevealed,false);
  clock+=1;const board=(await request('dashboard?character=donkey-kong')).data;
  assert.equal(board.competition.timesRevealed,true);assert.equal(board.leaderboard[0].frames,1234);
  assert.equal((await request('submissions',{method:'POST',headers:device,body:{...run,id:randomUUID()}})).status,409);
  assert.equal((await schedule(null)).status,409);
  assert.equal((await schedule(new Date(clock+60000).toISOString())).status,409);
  assert.equal((await request(`shared/replay?id=${run.id}&playerId=${playerId}`)).status,200);
  assert.equal(rows.get(`challenges/${challenge.id}/lifecycle.json`).value.endsAt,end);
});

test('a concurrent schedule update cannot undo manual reveal; legacy closures remain closed',async()=>{
  const {request,rows}=fixture();const headers={origin,authorization:`Bearer ${reviewerKey}`};
  await Promise.all([
    request('review/close',{method:'POST',headers,body:{challengeId:challenge.id,confirm:'REVEAL'}}),
    request('review/schedule',{method:'POST',headers,body:{challengeId:challenge.id,endsAt:new Date(Date.now()+60000).toISOString()}}),
  ]);
  assert.equal((await request('dashboard')).data.competition.phase,'closed');
  assert.equal((await request('review/schedule',{method:'POST',headers,body:{challengeId:challenge.id,endsAt:null}})).status,409);
  rows.delete(`challenges/${challenge.id}/lifecycle.json`);
  const at=new Date(Date.now()-60000).toISOString();rows.set(`challenges/${challenge.id}/closed.json`,{value:{at}});
  assert.equal((await request('dashboard')).data.competition.closedAt,at);
  assert.equal((await request('review/schedule',{method:'POST',headers,body:{challengeId:challenge.id,endsAt:null}})).status,409);
});

test('score-only disclosure never exposes replay bytes, and reveal publishes current final replays',async()=>{
 const {request}=fixture();
 const owner=await request('players/create',{method:'POST',headers:{origin},body:{displayName:'Score only'}});
 const device={authorization:`Bearer ${owner.data.playerFile.token}`},playerId=owner.data.playerFile.id;
 const ownHistory=async()=>(await request('dashboard',{headers:{cookie:owner.headers['set-cookie'].split(';')[0]}})).data.history[0];
 const run={id:randomUUID(),challengeId:challenge.id,geckoSha256:challenge.geckoSha256,character:'donkey-kong',stage:'donkey-kong',frames:1234,replay:replay.toString('base64')};
 await request('submissions',{method:'POST',headers:device,body:run});
 assert.equal((await ownHistory()).disclosureKind,'private');
 const share=kind=>request('submissions/disclose',{method:'POST',headers:{...device,origin},body:{id:run.id,public:true,kind}});
 const evidence=`shared/replay?id=${run.id}&playerId=${playerId}`;
 assert.equal((await share('score')).status,200);
 assert.equal((await ownHistory()).disclosureKind,'score');
 assert.equal((await request('dashboard')).data.sharedRuns[0].hasReplay,false);assert.equal((await request(evidence)).status,404);
 assert.equal((await share('replay')).status,200);assert.equal((await request(evidence)).status,200);
 assert.equal((await ownHistory()).disclosureKind,'replay');
 assert.equal((await share('score')).status,200);assert.equal((await request(evidence)).status,404);
 await request('review/close',{method:'POST',headers:{origin,authorization:`Bearer ${reviewerKey}`},body:{challengeId:challenge.id,confirm:'REVEAL'}});
 assert.equal((await request(evidence)).status,200);assert.equal((await request('dashboard')).data.sharedRuns[0].hasReplay,true);
});

test('reveal publishes overall points and THS only for players with every character',async()=>{
 const {request,rows}=fixture();
 for(const [playerId,times]of [['a'.repeat(64),[100,200,300]],['b'.repeat(64),[110,210,290]],['c'.repeat(64),[90]]]){
  for(const [i,frames]of times.entries()){
   const id=randomUUID(),character=Object.keys(challenge.assignments)[i];
   rows.set(`submissions/${challenge.id}/${playerId}/${id}.json`,{value:{id,playerId,displayName:playerId[0],connectCode:'TT#1',character,stage:challenge.assignments[character],frames,createdAt:new Date().toISOString(),replay:{sha256:'fixture'}}});
  }
 }
 assert.deepEqual((await request('dashboard')).data.overallLeaderboard,[]);
 await request('review/close',{method:'POST',headers:{origin,authorization:`Bearer ${reviewerKey}`},body:{challengeId:challenge.id,confirm:'REVEAL'}});
 const board=(await request('dashboard')).data;
 assert.deepEqual(board.overallLeaderboard.map(r=>r.totalPoints),[39,34.5,10]);
 assert.deepEqual(board.overallLeaderboard.map(r=>r.thsFrames),[600,610,null]);
 assert.equal(board.leaderboard[0].points,10);
});

test('game accounts reuse unique usernames and password checks without browser cookies',async()=>{
 const {request,rows}=fixture({gameAccountsOnly:true,allowLegacySignup:false});
 const post=body=>({method:'POST',body});
 assert.equal((await request('auth/signup',{...post({username:'native_player',password:'test-password-123'}),headers:{origin}})).status,410);
 const signup=await request('game/signup',post({username:'native_player',password:'test-password-123'}));
 assert.equal(signup.status,200);assert.equal(signup.headers['set-cookie'],undefined);
 const file=signup.data.playerFile;assert.equal(file.slug,'native_player');
 assert.equal((await request('companion/me',{headers:{authorization:`Bearer ${file.token}`}})).data.playerId,file.id);
 assert.equal((await request('game/signup',post({username:'NATIVE_PLAYER',password:'different-pass-123'}))).status,409);
 assert.equal((await request('game/login',post({username:'native_player',password:'wrong-pass-123'}))).status,401);
 const login=await request('game/login',post({username:'NATIVE_PLAYER',password:'test-password-123'}));
 assert.equal(login.status,200);assert.equal(login.data.playerFile.id,file.id);assert.notEqual(login.data.playerFile.token,file.token);
 assert.equal((await request('game/login',{...post({username:'native_player',password:'test-password-123'}),headers:{origin:'https://evil.test'}})).status,403);
 assert.ok(!JSON.stringify([...rows]).includes(file.token));assert.ok(!JSON.stringify([...rows]).includes('test-password-123'));
 const username=rows.get('usernames/native_player.json');username.value.credential.revision='changed';
 assert.equal((await request('companion/me',{headers:{authorization:`Bearer ${file.token}`}})).status,401);
});

test('game login accepts an existing website account instead of reserving its name again',async()=>{
 const {request}=fixture();
 const credentials={username:'existing_player',password:'a-good-password-123'};
 const old=await request('auth/signup',{method:'POST',headers:{origin},body:credentials});
 assert.equal(old.status,200);
 const login=await request('game/login',{method:'POST',body:credentials});
 assert.equal(login.status,200);assert.equal(login.data.playerFile.id,old.data.profile.id);
});

test('browser game login binds the browser and Dolphin without a visible code',async()=>{
 const {request,rows}=fixture({gameAccountsOnly:true,allowLegacySignup:false});
 const post=(body,headers={})=>({method:'POST',body,headers});
 const started=await request('game/connect/start',post({}));assert.equal(started.status,200);
 const device=started.data,link=new URL(device.url),parts=new URLSearchParams(link.hash.slice(1));
 const browser={id:parts.get('request'),browserSecret:parts.get('key')};
 assert.equal(link.pathname,'/login.html');assert.equal(link.search,'');assert.ok(!device.url.includes(device.deviceSecret));assert.equal(device.code,undefined);
 assert.equal((await request('game/connect/poll',post({id:device.id,deviceSecret:browser.browserSecret}))).status,403);
 assert.equal((await request('game/connect/info',post(browser))).status,403);
 assert.equal((await request('game/connect/info',post(browser,{origin:'https://evil.test'}))).status,403);
 assert.equal((await request('game/connect/info',post(browser,{origin}))).data.profile,null);
 assert.equal((await request('game/connect/approve',post(browser,{origin}))).status,401);
 assert.equal((await request('companion/connect/info?id='+device.id)).status,410);
 assert.equal((await request('companion/connect/poll',post({id:device.id,deviceSecret:device.deviceSecret}))).status,410);
 const bad=await request('auth/signup',post({...browser,browserSecret:'f'.repeat(64),username:'browser_player',password:'browser-password-123'},{origin}));assert.equal(bad.status,410);
 const signup=await request('auth/signup',post({...browser,username:'browser_player',password:'browser-password-123'},{origin}));assert.equal(signup.status,200);
 const cookie=signup.headers['set-cookie'].split(';')[0];
 assert.equal((await request('game/connect/info',post(browser,{origin,cookie}))).data.profile.slug,'browser_player');
 const poll=()=>request('game/connect/poll',post({id:device.id,deviceSecret:device.deviceSecret}));
 assert.equal((await poll()).data.status,'pending');
 assert.equal((await request('game/connect/approve',post(browser,{origin,cookie}))).status,200);
 const connected=await poll();assert.equal(connected.data.status,'connected');
 const file=connected.data.playerFile;assert.equal(file.id,signup.data.profile.id);
 assert.equal((await request('companion/me',{headers:{authorization:`Bearer ${file.token}`}})).status,200);
 assert.equal((await poll()).data.playerFile.token,file.token);
 assert.ok(!JSON.stringify([...rows]).includes(browser.browserSecret));assert.ok(!JSON.stringify([...rows]).includes(device.deviceSecret));
 await request('game/connect/cancel',post({id:device.id,deviceSecret:device.deviceSecret}));
 assert.equal((await poll()).status,410);
 assert.equal((await request('game/connect/approve',post(browser,{origin,cookie}))).status,410);
 // Consuming the pairing request keeps the acquired game session usable.
 assert.equal((await request('companion/me',{headers:{authorization:`Bearer ${file.token}`}})).status,200);
});

test('expired browser links cannot create accounts or connect a game',async()=>{
 let clock=Date.now();const {request}=fixture({gameAccountsOnly:true,now:()=>clock});
 const post=(body,headers={})=>({method:'POST',body,headers});
 const device=(await request('game/connect/start',post({}))).data;
 const parts=new URLSearchParams(new URL(device.url).hash.slice(1)),browser={id:device.id,browserSecret:parts.get('key')};
 clock+=600001;
 assert.equal((await request('game/connect/info',post(browser,{origin}))).status,410);
 assert.equal((await request('game/connect/poll',post({id:device.id,deviceSecret:device.deviceSecret}))).status,410);
 assert.equal((await request('auth/signup',post({...browser,username:'expired_player',password:'browser-password-123'},{origin}))).status,410);
});
