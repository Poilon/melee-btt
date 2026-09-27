import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReplayLibrary } from '../server/replays.mjs';
const bytes=await readFile(new URL('./fixtures/BTTDK.slp',import.meta.url));
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'ttrc-replays-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const replayDir=join(dir,'recordings');await mkdir(replayDir);const calls=[];
 const library=new ReplayLibrary({directory:()=>replayDir,cacheDirectory:join(dir,'private'),challenge:{assignments:{'donkey-kong':'donkey-kong'}},gecko:'0400000000000000',run:async(path,stage)=>calls.push({path,stage,bytes:await readFile(path)})});
 return{dir,replayDir,calls,library};
}
test('complete replays launch from a private snapshot with the recorded stage',async t=>{
 const f=await fixture(t);await writeFile(join(f.replayDir,'record.slp'),bytes);
 const rows=await f.library.list();assert.equal(rows.length,1);assert.equal(rows[0].character,'donkey-kong');assert.equal(rows[0].ready,true);assert.equal(rows[0].path,undefined);
 await f.library.launch(rows[0].id);assert.equal(f.calls.length,1);assert.equal(f.calls[0].stage,36);assert.deepEqual(f.calls[0].bytes,bytes);assert.ok(f.calls[0].path.startsWith(join(f.dir,'private')));
 await rm(join(f.replayDir,'record.slp'));await f.library.launchSaved(rows[0].sha256);assert.equal(f.calls.length,2);
 await writeFile(f.calls[0].path,Buffer.from('tampered'));await assert.rejects(f.library.launchSaved(rows[0].sha256),/changed/);
 await assert.rejects(f.library.launch('../../outside.slp'),/not found/);assert.equal(f.calls.length,2);
});
test('symlinks, truncated or modified recordings cannot bypass replay validation',async t=>{
 const f=await fixture(t);const outside=join(f.dir,'outside.slp');await writeFile(outside,bytes);await symlink(outside,join(f.replayDir,'linked.slp'));assert.equal((await f.library.list()).length,0);
 const path=join(f.replayDir,'record.slp');await writeFile(path,bytes);const [record]=await f.library.list();await writeFile(path,Buffer.from('not a replay'));
 await assert.rejects(f.library.launch(record.id),/complete Target Test/);await assert.rejects(f.library.launchBytes(Buffer.alloc(2*1024*1024+1)),/complete Target Test/);assert.equal(f.calls.length,0);
});

test('automatic matching requires a unique completed attempt with the same course and captured start',async()=>{
 const {matchRunReplays}=await import('../server/replays.mjs');
 const run={id:'one',character:'fox',stage:'samus',frames:704,startedAt:'2026-09-27T08:30:30Z'};
 const replay={ready:true,character:'fox',stage:'samus',lastFrame:704,endMethod:6,startedAt:run.startedAt,sha256:'a'};
 assert.equal(matchRunReplays([run],[replay]).length,1);
 // Real Falcon regression: 947 timer frames, but replay frame ID 912.
 assert.equal(matchRunReplays([{...run,frames:947,startedAt:'2026-09-27T09:14:16.448Z'}],[{...replay,lastFrame:912,startedAt:'2026-09-27T09:14:16Z'}]).length,1);
 for(const change of [{ready:false},{stage:'fox'},{character:'marth'}, {lastFrame:null},{endMethod:7},{startedAt:null},{startedAt:'2026-09-26T08:30:30Z'}])assert.equal(matchRunReplays([run],[{...replay,...change}]).length,0);
 assert.equal(matchRunReplays([run,{...run,id:'two'}],[replay]).length,0);
 assert.equal(matchRunReplays([run],[replay,{...replay,sha256:'b'}]).length,0);
 assert.equal(matchRunReplays([run],[replay,replay]).length,1);
 assert.equal(matchRunReplays([{...run,startedAt:null,createdAt:'2026-09-26T08:30:44Z'}],[replay]).length,0);
});
test('recordings attach automatically after finalization and remain available from the private cache',async t=>{
 const {ScoreStore}=await import('../server/store.mjs');const f=await fixture(t);const store=new ScoreStore(':memory:');t.after(()=>store.close());
 const identity={id:'a'.repeat(64),displayName:'Test',connectCode:'TEST#1'},challenge={id:'test',assignments:{'donkey-kong':'donkey-kong'}};
 f.library.challenge=challenge;
 const id=store.add({challenge,identity,character:'donkey-kong',stage:'donkey-kong',frames:1101,startedAt:'2022-01-09T18:59:18Z'});
 const path=join(f.replayDir,'record.slp');await writeFile(path,bytes.subarray(0,100));await f.library.syncRuns(store);assert.equal(store.replay(id),null);
 await writeFile(path,bytes);await f.library.syncRuns(store);const saved=store.replay(id);assert.ok(saved);assert.equal(store.bestRuns(challenge.id,identity.id)[0].frames,1101);assert.equal(store.bestRuns(challenge.id,identity.id)[0].hasReplay,1);
 await f.library.syncRuns(store);assert.equal(store.unlinkedRuns(challenge.id).length,0);
 await rm(path);assert.deepEqual(await f.library.savedBytes(saved.sha256),bytes);await f.library.launchSaved(saved.sha256);assert.equal(f.calls.length,1);
});

test('paused recording is linked for playback but excluded from personal bests and progress',async t=>{
 const {ScoreStore}=await import('../server/store.mjs'),{withPause}=await import('./support/replay-with-pause.mjs');
 const f=await fixture(t),store=new ScoreStore(':memory:');t.after(()=>store.close());
 const challenge={id:'test',assignments:{'donkey-kong':'donkey-kong'}},identity={id:'a'.repeat(64),displayName:'Test',connectCode:'TT#1'};f.library.challenge=challenge;
 const add=frames=>store.add({challenge,identity,character:'donkey-kong',stage:'donkey-kong',frames,startedAt:'2022-01-09T18:59:18Z'});
 const id=add(1101);await writeFile(join(f.replayDir,'paused.slp'),withPause(bytes));await f.library.syncRuns(store);
 assert.ok(store.replay(id));assert.match(store.run(id,identity.id,challenge.id).exclusionReason,/Paused/);
 assert.deepEqual(store.bestRuns(challenge.id,identity.id),[]);assert.equal(store.personalBest(challenge.id,'donkey-kong',identity.id),null);
 assert.deepEqual(store.progress(challenge.id,identity.id),{});assert.equal(store.stats(challenge.id).completions,0);
 const good=add(1400);assert.equal(store.bestRuns(challenge.id,identity.id)[0].id,good);assert.equal(store.bestRuns(challenge.id,identity.id)[0].attemptCount,2);
 assert.equal(store.characterHistory(challenge.id,identity.id,'donkey-kong').length,2);
 await f.library.launchSaved(store.replay(id).sha256);assert.equal(f.calls.length,1);
});
