import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {generateChallenge,stages,normalizeRules,validateGecko} from '../src/challenge.mjs';
import {motionPosition,safeMotionSegment,validMotionPoint,segmentDistance} from '../src/target-motion.mjs';
import routine from '../src/gecko/target-motion.json' with {type:'json'};

test('motion challenges are reproducible, preserve static challenge identity and isolate records',async()=>{
 const legacy=await generateChallenge({seed:20260989});
 assert.equal(legacy.manifest.id,'e00d93767b5d1062f6d2620e3f1d54d9ebbfc6935c3bf066a064f08d93978f8c');
 const rules={seed:20260990,moving:true},a=await generateChallenge(rules),b=await generateChallenge(rules);
 assert.deepEqual(a,b);assert.notEqual(a.manifest.id,(await generateChallenge({...rules,moving:false})).manifest.id);
 assert.notDeepEqual(a.manifest.motion,(await generateChallenge({...rules,seed:20260991})).manifest.motion);
 assert.throws(()=>normalizeRules({...rules,moving:'true'}));validateGecko(a.gecko);
 assert.equal(Object.keys(a.manifest.motion.courses).length,25);
 assert.match(a.gecko,/C22D85D8/);
});

test('each seed chooses its own static/moving/teleport counts, always totaling ten with a static majority',async()=>{
 const mixes=new Set();let allStatic=false,allMovingRemainder=false,allTeleportRemainder=false;
 for(const seed of [1,2,3,20260990,20260991]){
  const {manifest,gecko}=await generateChallenge({seed,moving:true});validateGecko(gecko);
  for(const stage of stages){
   const ts=manifest.motion.courses[stage],counts={static:0,moving:0,teleport:0};
   assert.equal(ts.length,10);
   for(let i=0;i<ts.length;i++)for(let j=i+1;j<ts.length;j++)assert.ok(segmentDistance(ts[i].anchor,ts[i].destination,ts[j].anchor,ts[j].destination)>=6);
   for(const t of ts){counts[t.kind]++;if(t.kind!=='static'){assert.ok(t.legFrames>=120);assert.notDeepEqual(t.anchor,t.destination);}}
   assert.ok(counts.static>=6&&counts.static<=10);assert.ok(counts.moving<=4&&counts.teleport<=4);
   assert.equal(counts.static+counts.moving+counts.teleport,10);
   mixes.add(JSON.stringify(counts));allStatic ||= counts.static===10;allMovingRemainder ||= counts.moving===4;allTeleportRemainder ||= counts.teleport===4;
  }
 }
 assert.ok(mixes.size>=10);assert.ok(allStatic&&allMovingRemainder&&allTeleportRemainder);
});

test('movement is absolute game time: delay, endpoints, reverse, reset and arbitrary replay seeks',()=>{
 const t={kind:'moving',anchor:{x:12,y:34},destination:{x:36,y:10},startDelayFrames:60,legFrames:180};
 assert.deepEqual(motionPosition(t,0),t.anchor);assert.deepEqual(motionPosition(t,60),t.anchor);
 assert.deepEqual(motionPosition(t,150),{x:24,y:22});assert.deepEqual(motionPosition(t,240),t.destination);
 assert.deepEqual(motionPosition(t,330),{x:24,y:22});assert.deepEqual(motionPosition(t,420),t.anchor);
 const expected=motionPosition(t,30000);motionPosition(t,1);assert.deepEqual(motionPosition(t,30000),expected);
 assert.deepEqual(motionPosition({...t,kind:'teleport'},239),t.anchor);
 assert.deepEqual(motionPosition({...t,kind:'teleport'},240),t.destination);
 assert.deepEqual(motionPosition({...t,kind:'teleport'},419),t.destination);
 assert.deepEqual(motionPosition({...t,kind:'teleport'},420),t.anchor);
 assert.deepEqual(motionPosition({...t,kind:'static'},100000),t.anchor);
 assert.throws(()=>motionPosition(t,-1));assert.throws(()=>motionPosition(t,NaN));
});

test('path checks cannot jump across thin exclusions; exceptions never override fighter exclusions',()=>{
 const g={bounds:{x1:-100,y1:-100,x2:100,y2:100},mismatch:[],exceptions:[],excluded:[[[0.001,-10],[0.002,10]]]};
 assert.equal(safeMotionSegment({x:-10,y:0},{x:10,y:0},g),false);
 assert.equal(safeMotionSegment({x:-10,y:11},{x:10,y:11},g),true);
 assert.equal(safeMotionSegment({x:-10,y:11},{x:101,y:11},g),false);
 const exception=[[0,-20],[1,20]],allowed={...g,exceptions:[exception]};
 assert.equal(safeMotionSegment({x:-10,y:0},{x:10,y:0},allowed),true);
 assert.equal(validMotionPoint({x:0.0015,y:0},{...allowed,mismatch:g.excluded}),false);
 assert.equal(safeMotionSegment({x:-10,y:0},{x:10,y:0},{...g,excluded:[[[-1,-1],[0,2],[1,-1]]]}),false);
});

test('compiled PowerPC hook matches its checked-in assembly and retains the displaced instruction',async()=>{
 const source=await readFile(new URL('../src/gecko/target-motion.s',import.meta.url));
 assert.equal(createHash('sha256').update(source).digest('hex'),routine.sourceSha256);
 assert.equal(routine.words.at(-1),routine.original);assert.equal(routine.hook,'C22D85D8');
});
