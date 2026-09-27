import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { request } from 'node:http';
import { createHash } from 'node:crypto';
const publicIdentity = value => ({ id: createHash('sha256').update(value.uid).digest('hex'), displayName: value.displayName, connectCode: value.connectCode, source: 'challenge', verified: false });
import { ScoreStore } from '../server/store.mjs';
import { RunDetector } from '../server/telemetry.mjs';
import { createApp } from '../server/app.mjs';

const identity = publicIdentity({ uid: 'fixture-user', displayName: 'Test Player', connectCode: 'TEST#1' });
const challenge = { id: 'a'.repeat(64), rules: { targets: 10 }, assignments: { fox: 'samus', marth: 'mewtwo' } };
const sample = changes => ({ pid: 1, major: 15, minor: 1, frame: 124, characterId: 2, stageId: 59,
  remaining: 10, result: 0, seconds: 0, timerFrame: 0, ...changes });
function finish(detector, frames = 605) {
  const final = sample({ remaining: 0, result: 6, frame: frames + 124, seconds: Math.floor(frames / 60), timerFrame: frames % 60 });
  detector.sample(final, identity); detector.sample(final, identity); detector.sample(final, identity);
}

test('records persist, keep only each player’s best on the board and isolate seed/character', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ttrc-scores-'));
  let store;
  try {
    const path = join(dir, 'scores.sqlite'); store = new ScoreStore(path);
    const add = (frames, extra = {}) => store.add({ challenge, identity, character: 'fox', stage: 'samus', frames, ...extra });
    add(600, { id: 'first' }); add(600, { id: 'first' }); // Retransmission must not duplicate.
    for (let i = 0; i < 55; i++) add(700 + i);
    const other = publicIdentity({ uid: 'other', displayName: 'Other', connectCode: 'OTHR#2' });
    add(600, { identity: other });
    add(400, { challenge: { ...challenge, id: 'b'.repeat(64) } });
    add(300, { character: 'marth', stage: 'mewtwo' });
    assert.throws(() => add(-1)); assert.throws(() => add(3.4)); assert.throws(() => add(500, { stage: 'fox' }));
    store.close(); store = new ScoreStore(path);
    const board = store.leaderboard(challenge.id, 'fox');
    assert.equal(board.length, 2); assert.deepEqual(board.map(r => r.rank), [1, 1]);
    assert.equal(store.stats(challenge.id).completions, 58);
    assert.equal(store.history(challenge.id, identity.id).length, 50);
    assert.equal(store.personalBest(challenge.id, 'fox', identity.id).frames, 600);
    assert.equal(store.leaderboard(challenge.id, 'marth')[0].frames, 300);
    const groups=store.bestRuns(challenge.id,identity.id);
    assert.equal(groups.length,2);assert.equal(groups[0].id,'first');assert.equal(groups[0].attemptCount,56);
    const first=store.characterHistory(challenge.id,identity.id,'fox'),older=store.characterHistory(challenge.id,identity.id,'fox',50);
    assert.equal(first.length,50);assert.equal(older.length,6);assert.equal(older.at(-1).id,'first');
    assert.equal(new Set([...first,...older].map(r=>r.id)).size,56);

  } finally { store?.close(); await rm(dir, { recursive: true, force: true }); }
});

test('capture saves one frozen successful result per attempt, with exact game frames', () => {
  const runs = []; const detector = new RunDetector(challenge, run => runs.push(run),()=>1700000000000);
  detector.sample(sample(), identity);
  detector.sample(sample({ frame: 424, remaining: 5, seconds: 5 }), identity);
  finish(detector);
  assert.equal(runs[0].startedAt,'2023-11-14T22:13:20.000Z');
  assert.equal(runs.length, 1); assert.equal(runs[0].frames, 605); assert.equal(runs[0].stage, 'samus');
  detector.sample(sample(), identity); finish(detector, 590);
  assert.equal(runs.length, 2); assert.notEqual(runs[0].id, runs[1].id);
});

test('capture rejects mid-run attachment, stale results, wrong stages, failure and time reversal', () => {
  for (const sequence of [
    [], [sample({ remaining: 5, seconds: 4, frame: 364 })],
    [sample({ stageId: 46 })], [sample(), sample({ result: 4 })],
    [sample(), sample({ seconds: 8, frame: 604, remaining: 5 }), sample({ seconds: 4, frame: 364, remaining: 4 })],
    [sample(), sample({ major: 1 })], [sample(), sample({ pid: 2, seconds: 5, remaining: 3 })],
  ]) {
    const runs = []; const detector = new RunDetector(challenge, run => runs.push(run));
    for (const s of sequence) detector.sample(s, identity);
    finish(detector); assert.equal(runs.length, 0);
  }
});

async function fixture(t) {
  const store = new ScoreStore(':memory:');
  let launches = 0, playbacks = 0, imported = null;
  const server = createApp({ challenge, gecko: 'GECKO', store, getIdentity: async () => identity,
    importPlayer: async value => { imported = value; },
    replays: { launch: async()=>{ playbacks++; return { status:'started' }; } },
    getCapture: () => ({ status: 'waiting' }), launch: async () => { launches++; return { status: 'started' }; } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://localhost:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); });
  return { base, get playbacks() { return playbacks; }, get imported() { return imported; }, get launches() { return launches; } };
}

test('local API blocks foreign origins and arbitrary score writes; serves actual current seed', async t => {
  const f = await fixture(t);
  const get = await fetch(`${f.base}/api/dashboard?character=fox`);
  const body = await get.json();
  assert.equal(body.challenge.id, challenge.id); assert.equal(body.auth.mode, 'player-file');
  assert.deepEqual(body.leaderboard, []);
  assert.equal((await fetch(`${f.base}/api/dashboard?character=bad`)).status, 400);
  assert.equal((await fetch(`${f.base}/api/dashboard`, { headers: { Origin: 'https://evil.test' } })).status, 403);
  const rebindingStatus = await new Promise((resolve, reject) => {
    const req = request(`${f.base}/api/dashboard`, { headers: { Host: 'evil.test' } }, res => {
      res.resume(); resolve(res.statusCode);
    }); req.on('error', reject); req.end();
  });
  assert.equal(rebindingStatus, 403);
  assert.equal((await fetch(`${f.base}/api/replays/launch`, { method:'POST', body:'{}' })).status,403);
  assert.equal((await fetch(`${f.base}/api/replays/launch`, { method:'POST', headers:{Origin:'https://evil.test','X-TTRC-Action':'launch'}, body:'{}' })).status,403);
  assert.equal(f.playbacks,0);
  assert.equal((await fetch(`${f.base}/api/replays/launch`, { method:'POST', headers:{Origin:f.base,'X-TTRC-Action':'launch'}, body:'{}' })).status,200);
  assert.equal(f.playbacks,1);
  assert.equal((await fetch(`${f.base}/api/scores`, { method: 'POST', body: '{}' })).status, 404);
  assert.equal((await fetch(`${f.base}/api/launch`, { method: 'POST' })).status, 403);
  const launch = await fetch(`${f.base}/api/launch`, { method: 'POST', headers: { Origin: f.base, 'X-TTRC-Action': 'launch' } });
  assert.equal(launch.status, 200); assert.equal(f.launches, 1);
  const blockedImport = await fetch(`${f.base}/api/player/import`, { method: 'POST', body: '{}' });
  assert.equal(blockedImport.status, 403);
  const imported = await fetch(`${f.base}/api/player/import`, { method: 'POST', headers: { Origin: f.base, 'X-TTRC-Action': 'profile' }, body: '{"test":true}' });
  assert.equal(imported.status, 200); assert.deepEqual(f.imported, { test: true });
});


test('run playback links are private to the player and survive deleting the original replay', async t => {
  const { ReplayLibrary } = await import('../server/replays.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'ttrc-run-playback-'));
  const store = new ScoreStore(':memory:');
  const current = { ...challenge, assignments: { ...challenge.assignments, 'donkey-kong': 'donkey-kong' } };
  let launches = 0; const uploads=[];
  const library = new ReplayLibrary({ directory: () => null, cacheDirectory: directory, challenge: current, gecko:'0400000000000000', run: async()=>{launches++;} });
  const id = store.add({ challenge:current, identity, character:'donkey-kong', stage:'donkey-kong', frames:1190 });
  const other = store.add({ challenge:current, identity:{...identity,id:'d'.repeat(64)}, character:'donkey-kong', stage:'donkey-kong', frames:1190 });
  const server = createApp({ challenge:current, gecko:'0400000000000000', store, replays:library, remote:{enqueue:async(run,bytes,name)=>uploads.push({run,bytes,name})}, getIdentity:async()=>identity, getCapture:()=>({status:'waiting'}) });
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://localhost:${server.address().port}`;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();await rm(directory,{recursive:true,force:true});});
  const bytes = await readFile(new URL('./fixtures/BTTDK.slp',import.meta.url));
  const post=(path,body,headers={Origin:base,'X-TTRC-Action':'launch'})=>fetch(base+'/api/runs/replay/'+path,{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await post('link',{id,replay:bytes.toString('base64')},{})).status,403);
  assert.equal((await post('link',{id:other,replay:bytes.toString('base64')})).status,404);
  assert.equal((await post('link',{id,replay:'ZmFrZQ=='})).status,400);
  assert.equal((await post('launch',{id})).status,404);
  const submit=(runId,headers={Origin:base,'X-TTRC-Action':'submit'})=>fetch(base+'/api/submissions',{method:'POST',headers,body:JSON.stringify({id:runId})});
  assert.equal((await submit(id,{})).status,403);
  assert.equal((await submit(other)).status,404);
  assert.equal((await submit(id)).status,409);assert.equal(uploads.length,0);
  assert.equal((await post('link',{id,replay:bytes.toString('base64'),name:'record.slp'})).status,200);
  assert.equal((await submit(id)).status,202);assert.equal(uploads.length,1);
  assert.deepEqual(uploads[0].bytes,bytes);assert.equal(uploads[0].run.id,id);assert.equal(uploads[0].name,'record.slp');
  assert.equal((await fetch(base+'/api/runs?character=donkey-kong')).status,200);
  assert.equal((await (await fetch(base+'/api/runs?character=donkey-kong')).json()).runs.length,1);
  assert.equal((await fetch(base+'/api/runs?character=donkey-kong&offset=-1')).status,400);

  assert.equal(store.history(current.id,identity.id)[0].hasReplay,1);
  assert.equal((await post('launch',{id:other})).status,404);
  assert.equal((await post('launch',{id})).status,200);assert.equal(launches,1);
  store.exclude(id,'Paused during the run.');assert.equal((await submit(id)).status,409);assert.equal(uploads.length,1);
});
