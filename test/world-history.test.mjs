import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {WorldHistory} from '../server/world-history.mjs';
import {WorldRunDetector,WorldCapture} from '../desktop/worlds-capture.mjs';
import {sha256} from '../shared/worlds.mjs';
const now=1800000000000,playerId='a'.repeat(64),courseId='b'.repeat(64);
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'btt-world-history-')),bundle=join(root,'bundle');t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(bundle,'.local/world-runs'),{recursive:true});await mkdir(join(bundle,'Replays'));
 await writeFile(join(bundle,'course.json'),JSON.stringify({courses:[{id:courseId,character:'sheik'}]}));
 const bytes=Buffer.from('isolated replay fixture');await writeFile(join(bundle,'Replays/test.slp'),bytes);
 const calls=[],history=new WorldHistory({root,bundle,now:()=>now,openReplay:async(...args)=>calls.push(args)});
 const put=async(overrides={})=>{const run={id:randomUUID(),playerId,courseId,character:'sheik',frames:1000,startedAt:now-20000,finishedAt:now-19000,submitted:true,replaySha256:sha256(bytes),...overrides};await writeFile(join(bundle,'.local/world-runs',run.id+'.json'),JSON.stringify(run));return run;};
 return {root,bundle,history,put,calls};
}
test('authored history recovers existing clears, chooses the valid best, separates accounts/revisions and paginates',async t=>{
 const {history,put,bundle}=await fixture(t);
 const best=await put({frames:600}),slower=await put({frames:1200}),paused=await put({frames:100,excluded:'Paused run'});
 await put({status:'aborted',frames:undefined,reason:'Restarted'});await put({playerId:'c'.repeat(64)});await put({courseId:'d'.repeat(64)});await put({startedAt:100});
 await writeFile(join(bundle,'.local/world-runs',randomUUID()+'.json'),'partial');
 const s=await history.snapshot(playerId);assert.equal(s.scope,'worlds');assert.equal(s.attempts.total,4);assert.equal(s.attempts.finished,3);assert.equal(s.attempts.aborted,1);assert.equal(s.history.length,3);
 assert.equal(s.bestRuns[0].id,best.id);assert.equal(s.bestRuns[0].hasReplay,true);assert.equal(s.bestRuns[0].submissionStatus,'submitted');
 assert.equal((await history.history(playerId,'sheik',2)).length,2);assert.equal((await history.snapshot(null)).attempts.total,0);
});
test('world replay launch uses matching authored course, refuses another player and missing or changed evidence',async t=>{
 const {history,put,bundle,calls}=await fixture(t),run=await put();
 await history.launch(run.id,playerId);assert.equal(calls.length,1);assert.equal(calls[0][1].id,courseId);
 await assert.rejects(history.launch(run.id,'c'.repeat(64)),/not found/);
 await writeFile(join(bundle,'Replays/test.slp'),'changed evidence');assert.equal((await history.snapshot(playerId)).bestRuns[0].hasReplay,false);
 await assert.rejects(history.launch(run.id,playerId),/not available/);
});
test('live attempt heartbeat expires to interrupted rather than remaining active after a crash',async t=>{
 const {history,put,bundle}=await fixture(t),run=await put({status:'active',frames:undefined});
 await writeFile(join(bundle,'.local/world-capture.json'),JSON.stringify({id:run.id,at:now,elapsedFrames:77}));
 assert.equal((await history.snapshot(playerId)).attempts.active,1);
 history.now=()=>now+11000;const s=await history.snapshot(playerId);assert.equal(s.attempts.active,0);assert.equal(s.attempts.interrupted,1);
});
test('world attempts record starts, resets, deaths and interruption exactly once; clears stay finished',()=>{
 const attempts=[],clears=[],detector=new WorldRunDetector([{id:courseId,character:'donkey-kong',stageId:36}],r=>clears.push(r),()=>now,r=>attempts.push(r));
 const s={pid:1,major:15,minor:1,characterId:1,stageId:43,frame:1,seconds:0,timerFrame:0,remaining:10,result:0},identity={id:playerId};
 detector.sample(s,identity);detector.sample({...s,frame:99,seconds:1,remaining:4},identity);detector.sample(s,identity);
 assert.deepEqual(attempts.map(r=>r.status),['active','aborted','active']);assert.notEqual(attempts[0].id,attempts[2].id);
 detector.sample({...s,result:7},identity);detector.sample({...s,result:7},identity);assert.equal(attempts.length,4);
 detector.sample(s,identity);for(let i=0;i<3;i++)detector.sample({...s,frame:100+i,remaining:0,result:6,seconds:2},identity);detector.reset();assert.equal(clears.length,1);assert.equal(clears[0].status,'finished');assert.equal(attempts.length,5);
 detector.sample(s,identity);detector.reset();assert.equal(attempts.at(-1).status,'interrupted');
});
test('queued writes cannot overwrite a finished attempt with its initial active record',async t=>{
 const {root,bundle}=await fixture(t),client={identity:{id:playerId},request:async()=>{throw Error('Active attempts cannot submit');}},capture=new WorldCapture({root:bundle,course:{courses:[]},client});
 const run={id:randomUUID(),playerId,courseId,character:'sheik',startedAt:now};
 await Promise.all([capture.save({...run,status:'active'}),capture.save({...run,status:'finished',frames:100})]);
 const saved=JSON.parse(await readFile(join(capture.directory,run.id+'.json'),'utf8'));assert.equal(saved.status,'finished');
 await capture.save({...run,status:'active'});await capture.sync();assert.equal(JSON.parse(await readFile(join(capture.directory,run.id+'.json'),'utf8')).status,'active');
});
