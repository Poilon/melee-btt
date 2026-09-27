import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ScoreStore} from '../server/store.mjs';
import {RunDetector} from '../server/telemetry.mjs';
import {AutoSubmitter} from '../server/auto-submit.mjs';
const challenge={id:'a'.repeat(64),rules:{targets:10},assignments:{fox:'samus',marth:'mewtwo'}};
const identity={id:'b'.repeat(64),displayName:'Attempts',connectCode:'TT#12345'};
const sample=(extra={})=>({pid:1,major:15,minor:1,frame:124,characterId:2,stageId:59,remaining:10,result:0,seconds:0,timerFrame:0,...extra});
function fixture(){const store=new ScoreStore(':memory:');let now=1700000000000;const detector=new RunDetector(challenge,r=>store.add(r),()=>now++,a=>store.recordAttempt(a));return {store,detector,stats:()=>store.attemptStats(challenge.id,identity.id)};}
const finish=d=>{const s=sample({remaining:0,result:6,frame:724,seconds:10});d.sample(s,identity);d.sample(s,identity);d.sample(s,identity);};

test('starts count once, resets and failures count as aborted, finished runs count once',()=>{
 const {store,detector:d,stats}=fixture();
 try{
  for(let i=0;i<5;i++)d.sample(sample(),identity);
  assert.equal(stats().total,1);assert.equal(stats().active,1);assert.equal(stats().finished,0);
  d.sample(sample({remaining:5,seconds:5,frame:424}),identity);
  d.sample(sample(),identity); // Direct retry, without an observed menu.
  assert.equal(stats().total,2);assert.equal(stats().aborted,1);assert.equal(stats().active,1);
  finish(d);finish(d);d.sample(sample({major:1}),identity);
  assert.equal(stats().total,2);assert.equal(stats().finished,1);assert.equal(stats().active,0);
  assert.equal(store.bestRuns(challenge.id,identity.id).length,1);assert.equal(store.progress(challenge.id,identity.id).fox.runs,1);
  assert.equal(store.runGroups(challenge.id,identity.id)[0].attemptCount,2);assert.equal(store.runGroups(challenge.id,identity.id)[0].finishedCount,1);
  assert.deepEqual(store.characterHistory(challenge.id,identity.id,'fox').map(r=>r.attemptStatus),['finished','aborted']);
  for(const result of [4,7,8]){d.sample(sample(),identity);d.sample(sample({result}),identity);d.sample(sample({result}),identity);}
  assert.equal(stats().total,5);assert.equal(stats().finished,1);assert.equal(stats().aborted,4);
 }finally{store.close();}
});

test('mid-run attachment, stale results and wrong stage do not create attempts; leaving and disconnecting finish tracking',()=>{
 const {store,detector:d,stats}=fixture();
 try{
  d.sample(sample({seconds:4,remaining:5}),identity);finish(d);d.sample(sample({stageId:46}),identity);d.sample(sample(),null);
  assert.equal(stats().total,0);
  d.sample(sample(),identity);d.sample(sample({major:1}),identity);d.sample(sample({major:1}),identity);
  assert.equal(stats().aborted,1);
  d.sample(sample(),identity);d.reset();d.reset();assert.equal(stats().interrupted,1);assert.equal(stats().total,2);
  d.sample(sample(),identity);for(let i=0;i<20;i++)d.sample(sample({seconds:2,frame:244}),identity);
  assert.equal(stats().total,3,'a frozen/paused timer is still the same attempt');
  assert.equal(stats().finished,0);
 }finally{store.close();}
});

test('attempt history is isolated by player, seed and character and incomplete attempts cannot submit',async()=>{
 const {store,detector:d,stats}=fixture();
 try{
  d.sample(sample(),identity);d.sample(sample({major:1}),identity);
  const other={...identity,id:'c'.repeat(64)};
  d.sample(sample(),other);d.reset();
  store.recordAttempt({id:'other-seed',challenge:{...challenge,id:'d'.repeat(64)},identity,character:'fox',stage:'samus',startedAt:new Date().toISOString(),status:'active'});
  d.sample(sample({characterId:9,stageId:53}),identity);d.reset();
  assert.equal(stats().total,2);assert.equal(stats().byCharacter.fox.total,1);assert.equal(stats().byCharacter.marth.total,1);
  const groups=store.runGroups(challenge.id,identity.id);assert.equal(groups.length,2);assert.ok(groups.every(r=>r.frames===null&&r.finishedCount===0));
  assert.equal(store.history(challenge.id,identity.id).length,0);assert.deepEqual(store.bestRuns(challenge.id,identity.id),[]);
  let uploads=0;const sync=new AutoSubmitter({store,challenge,getIdentity:()=>identity,remote:{status:()=>({paired:true}),enqueue:()=>uploads++},replays:{}});
  await sync.sync();assert.equal(uploads,0);
  for(const r of groups)assert.equal(store.run(r.id,identity.id,challenge.id),null);
 }finally{store.close();}
});

test('legacy clears migrate once, interrupted attempts survive restart and paused clears remain excluded from records',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ttrc-attempts-')),path=join(directory,'scores.sqlite');let store;
 try{
  store=new ScoreStore(path);const run={id:'legacy',challenge,identity,character:'fox',stage:'samus',frames:600,startedAt:'2026-09-27T10:00:00Z'};
  store.add(run);store.exclude(run.id,'Paused');store.db.exec('DROP TABLE attempts');store.close();
  store=new ScoreStore(path);assert.equal(store.attemptStats(challenge.id,identity.id).finished,1);assert.deepEqual(store.progress(challenge.id,identity.id),{});
  const active={id:'unfinished',challenge,identity,character:'fox',stage:'samus',status:'active',startedAt:'2026-09-27T11:00:00Z'};
  store.recordAttempt(active);store.recordAttempt(active);store.close();
  store=new ScoreStore(path);store.recoverAttempts();store.recoverAttempts();
  const counts=store.attemptStats(challenge.id,identity.id);assert.equal(counts.total,2);assert.equal(counts.finished,1);assert.equal(counts.interrupted,1);assert.equal(counts.active,0);
  store.add(run);assert.equal(store.attemptStats(challenge.id,identity.id).total,2);
  assert.equal(store.runGroups(challenge.id,identity.id)[0].attemptCount,2);
 }finally{store?.close();await rm(directory,{recursive:true,force:true});}
});
