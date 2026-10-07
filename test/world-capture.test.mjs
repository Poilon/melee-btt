import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {WorldCapture,WorldRunDetector,matchWorldReplays} from '../desktop/worlds-capture.mjs';
import {worldRulesHash} from '../shared/worlds.mjs';
const {SlippiGame}=createRequire(import.meta.url)('@slippi/slippi-js');
const bytes=await readFile(new URL('fixtures/BTTDK.slp',import.meta.url));
const game=new SlippiGame(bytes),start=Date.parse(game.getMetadata().startAt);
const course={id:'dk',character:'donkey-kong',stageId:36,rulesSha256:worldRulesHash(Buffer.from(game.getGeckoList().contents))};
const sample={pid:1,major:15,minor:1,characterId:1,stageId:43,frame:1,seconds:0,timerFrame:0,remaining:10,result:0};

test('late polling, missing RAM reads and a one-sample result still save exactly one clear',()=>{
 const attempts=[],clears=[],detector=new WorldRunDetector([course],r=>clears.push(r),()=>start+2000,r=>attempts.push(r));
 detector.sample({...sample,frame:120,seconds:2,remaining:9},{id:'player'});
 assert.equal(attempts.length,1);assert.equal(attempts[0].startedAt,start);
 detector.sample(null,{id:'player'});
 detector.sample({...sample,timerFrame:99},{id:'player'});
 detector.sample({...sample,frame:1066,seconds:17,timerFrame:46,remaining:0,result:6},{id:'player'});
 detector.sample(sample,{id:'player'}); // Start + Z immediately.
 assert.equal(clears.length,1);assert.equal(clears[0].frames,1066);
 assert.equal(attempts.filter(r=>r.status==='active').length,2);
 assert.equal(attempts.filter(r=>r.status==='aborted').length,0);
});

test('an account change during a run cannot attribute the former account clear to the new account',()=>{
 const clears=[],detector=new WorldRunDetector([course],r=>clears.push(r));
 detector.sample(sample,{id:'first'});
 detector.sample({...sample,frame:100,seconds:1,remaining:0,result:6},{id:'second'});
 assert.equal(clears.length,0);
});

function recorded(overrides={}){return {id:randomUUID(),playerId:'player',courseId:'dk',character:'donkey-kong',status:'finished',startedAt:start,frames:1066,...overrides};}
function evidence(overrides={}){return {start,character:'donkey-kong',details:{sha256:'digest',stageId:36,lastFrame:1066},...overrides};}

test('score and stage disambiguate nearby attempts; copied files do not create false ambiguity',()=>{
 const a=recorded(),b=recorded({startedAt:start+1500,frames:50});
 const first=evidence(),second=evidence({start:start+1500,details:{sha256:'other',stageId:36,lastFrame:50}});
 const matches=matchWorldReplays([a,b],[first,{...first},second],[course]);
 assert.equal(matches.get(a.id).details.sha256,'digest');assert.equal(matches.get(b.id),second);
 assert.equal(matchWorldReplays([a],[evidence({details:{...first.details,stageId:40}})],[course]).size,0);
});

test('submitted, other-account and equal-time attempts prevent another run taking their replay',()=>{
 const a=recorded(),b=recorded({playerId:'other',submitted:true});
 assert.equal(matchWorldReplays([a,b],[evidence()],[course]).size,0);
 assert.equal(matchWorldReplays([a],[evidence(),evidence({details:{sha256:'different',stageId:36,lastFrame:1066}})],[course]).size,0);
});

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'btt-capture-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'Replays'));await writeFile(join(root,'Replays/run.slp'),bytes);
 const calls=[],client={identity:{id:'player'},request:async(...args)=>calls.push(args)};
 const capture=new WorldCapture({root,course:{courses:[course]},client,scoreCutoff:0});
 const saved=async run=>JSON.parse(await readFile(join(capture.directory,run.id+'.json'),'utf8'));
 return {root,client,capture,calls,saved};
}

test('an incomplete record does not block other saves and replay links persist before a network wait',async t=>{
 const {capture,client,saved}=await fixture(t),run=recorded();
 await capture.save(run);await writeFile(join(capture.directory,randomUUID()+'.json'),'{broken');
 await writeFile(join(capture.directory,randomUUID()+'.json'),'null');
 client.request=async()=>{const linked=await saved(run);assert.ok(linked.replaySha256);assert.equal(linked.submitted,undefined);throw Error('Offline');};
 await capture.sync();let result=await saved(run);assert.equal(result.lastError,'Offline');assert.ok(result.replaySha256);
 client.request=async()=>{};await capture.sync({retryId:run.id});result=await saved(run);assert.equal(result.submitted,true);assert.equal(result.lastError,undefined);
});

test('a closed valid replay repairs a missed finish after restart without creating a duplicate',async t=>{
 const {capture,calls,saved}=await fixture(t),run=recorded({status:'interrupted',frames:undefined,reason:'Dolphin closed'});
 await capture.save(run);await capture.sync();const result=await saved(run);
 assert.equal(result.status,'finished');assert.equal(result.frames,1066);assert.equal(result.recoveredFromReplay,true);assert.equal(result.submitted,true);
 assert.equal(result.reason,undefined);assert.equal(calls.length,1);await capture.sync();assert.equal(calls.length,1);
});

test('recovery requires an observed owner and the same rules; live runs are not rewritten',async t=>{
 const {root,capture,calls,saved}=await fixture(t);
 await capture.sync();assert.equal(calls.length,0); // Orphan replay has no owner.
 const run=recorded({status:'active',frames:undefined});await capture.save(run);
 await writeFile(join(root,'.local/world-capture.json'),JSON.stringify({id:run.id,at:Date.now(),running:true}));
 await capture.sync();assert.equal((await saved(run)).status,'active');assert.equal(calls.length,0);
 await rm(join(root,'.local/world-capture.json'));capture.course={courses:[{...course,rulesSha256:'wrong'}]};
 await capture.sync();assert.equal((await saved(run)).status,'active');assert.equal(calls.length,0);
});

test('partial replays are retried when Dolphin finishes writing them',async t=>{
 const {root,capture,calls,saved}=await fixture(t),run=recorded();await capture.save(run);
 await writeFile(join(root,'Replays/run.slp'),bytes.subarray(0,100));await capture.sync();assert.equal(calls.length,0);
 await writeFile(join(root,'Replays/run.slp'),bytes);await capture.sync();assert.equal((await saved(run)).submitted,true);
});

test('an unchanged archive is parsed once, retains metadata only and invalidates changed evidence',async t=>{
 const {root,capture,client,calls}=await fixture(t),run=recorded();await capture.save(run);
 client.request=async()=>{throw Error('Offline');};await capture.sync();
 const indexed=capture.replayCache.get('run.slp');assert.ok(indexed.value.details);assert.equal(indexed.value.bytes,undefined);
 await capture.sync({retryId:run.id});assert.equal(capture.replayCache.get('run.slp'),indexed);
 await writeFile(join(root,'Replays/run.slp'),'truncated');client.request=async()=>calls.push('unexpected');
 await capture.sync({retryId:run.id});assert.notEqual(capture.replayCache.get('run.slp'),indexed);assert.equal(calls.length,0);
});

test('capture retries failed disk writes, reports the error and preserves the latest finished state',async t=>{
 const {root,capture,saved}=await fixture(t),run=recorded(),original=capture.save.bind(capture);
 capture.save=async()=>{throw Error('Disk unavailable');};
 await capture.record({...run,status:'active'});await capture.record(run);await capture.heartbeat();
 const pulse=JSON.parse(await readFile(join(root,'.local/world-capture.json'),'utf8'));assert.match(pulse.error,/Disk unavailable/);
 capture.save=original;await capture.heartbeat();assert.equal((await saved(run)).status,'finished');assert.equal(capture.pendingSaves.size,0);
 assert.equal(JSON.parse(await readFile(join(root,'.local/world-capture.json'),'utf8')).error,null);
});

test('closing the recorder flushes the last replay and old records are retained untouched',async t=>{
 const {capture,saved,calls}=await fixture(t),run=recorded(),old=recorded({startedAt:start-100000});
 await capture.save(run);await capture.save(old);capture.scoreCutoff=start-1000;
 await capture.close();assert.equal((await saved(run)).submitted,true);assert.equal((await saved(old)).submitted,undefined);assert.equal(calls.length,1);
 assert.equal((await saved(run)).replaySha256,createHash('sha256').update(bytes).digest('hex'));
});
