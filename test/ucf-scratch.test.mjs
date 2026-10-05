import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {worldRulesHash,worldCourseId,WORLD_RULES_VALIDATION_VERSION} from '../shared/worlds.mjs';
import {inspectReplay} from '../shared/replay.mjs';
import {WorldCapture} from '../desktop/worlds-capture.mjs';
import {createWorlds} from '../cloud/worlds.mjs';
import {withGecko} from './support/replay-with-gecko.mjs';
import {withPause} from './support/replay-with-pause.mjs';
const {SlippiGame}=createRequire(import.meta.url)('@slippi/slippi-js');
const hook=Buffer.from((await readFile(new URL('fixtures/ucf-squatrv.hex',import.meta.url),'utf8')).split('\n').filter(l=>!l.startsWith('#')).join('').replace(/\s/g,''),'hex');
const runtime=Buffer.from(hook);runtime.set(Buffer.from('fff8000000000037','hex'),24);runtime.writeUInt32BE(0x4bff0000,runtime.length-4);
const original=await readFile(new URL('fixtures/BTTDK.slp',import.meta.url));
const originalCodes=Buffer.from(new SlippiGame(original).getGeckoList().contents);
const expectedCodes=Buffer.concat([hook,originalCodes]);
const recorded=withPause(withGecko(original,Buffer.concat([runtime,originalCodes])),0);
function course(){const c={character:'donkey-kong',name:'Regression fixture',stageId:36,stageSha256:'a'.repeat(64),dolSha256:'b'.repeat(64),rulesSha256:worldRulesHash(expectedCodes)};return {...c,id:worldCourseId(c)};}

test('only the exact UCF SquatRv eight-byte scratch slot is mutable',()=>{
 assert.equal(worldRulesHash(hook),'014235f6065f41ac570cf823df159eaef8985da2b590831b3e869d7effee8c3c');
 assert.equal(worldRulesHash(hook),worldRulesHash(runtime));
 for(let i=24;i<32;i++){const changed=Buffer.from(hook);changed[i]=0xff;assert.equal(worldRulesHash(changed),worldRulesHash(hook));}
 for(let i=0;i<hook.length-4;i++){
  if(i>=24&&i<32)continue;
  const changed=Buffer.from(runtime);changed[i]^=1;
  let hash;try{hash=worldRulesHash(changed);}catch{continue;}
  assert.notEqual(hash,worldRulesHash(hook),'Changed protected byte '+i);
 }
 const extra=Buffer.from('0400000038600001','hex');assert.notEqual(worldRulesHash(Buffer.concat([runtime,extra])),worldRulesHash(hook));
 assert.throws(()=>worldRulesHash(runtime.subarray(0,-8)),/Truncated/);
});

test('server accepts runtime scratch data but still rejects paused runs and changed constants',async()=>{
 const c=course(),storeData=new Map(),store={get:async p=>storeData.get(p),put:async(p,v)=>storeData.set(p,v),list:async()=>[]};
 const handle=createWorlds({store,catalog:{format:'ttrc-worlds-v1',courses:[c]},bearer:async()=>({id:'c'.repeat(64),username:'fixture'}),json:(res,status,data)=>Object.assign(res,{status,data})});
 async function submit(bytes){const res={};await handle('worlds/submit',{method:'POST',body:{id:'00000000-0000-0000-0000-000000000011',courseId:c.id,frames:1066,replay:bytes.toString('base64')}},res,new URL('https://test.invalid/api/worlds/submit'));return res;}
 const details=inspectReplay(recorded,{character:'donkey-kong',stage:'donkey-kong'},'');assert.equal(details.pauseFrames,0);assert.equal(details.pauseDetectionAvailable,true);
 assert.equal(worldRulesHash(Buffer.from(new SlippiGame(recorded).getGeckoList().contents)),c.rulesSha256);
 assert.equal((await submit(recorded)).status,202);
 assert.equal((await submit(withPause(withGecko(original,Buffer.concat([runtime,originalCodes])),35))).status,400);
 const changed=Buffer.from(runtime);changed[12]^=1;
 assert.equal((await submit(withPause(withGecko(original,Buffer.concat([changed,originalCodes])),0))).status,400);
});

test('capture automatically recovers version 2 exclusions, preserves replay bytes and retains real exclusions',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ucf-recovery-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'Replays'));const path=join(root,'Replays/saved.slp');await writeFile(path,recorded);
 const c=course(),uploads=[],client={identity:{id:'player'},request:async(_,args)=>uploads.push(args.body)};
 const capture=new WorldCapture({root,course:{courses:[c]},client,scoreCutoff:0});
 const run={id:'00000000-0000-0000-0000-000000000012',status:'finished',playerId:'player',character:c.character,courseId:c.id,frames:1066,startedAt:Date.parse(new SlippiGame(recorded).getMetadata().startAt),excluded:'Different game settings',rulesValidationVersion:2};
 const saved=()=>readFile(join(capture.directory,run.id+'.json'),'utf8').then(JSON.parse);
 await capture.save(run);await capture.sync();assert.equal(uploads.length,1);assert.equal((await saved()).submitted,true);assert.equal((await saved()).excluded,undefined);assert.equal((await saved()).rulesValidationVersion,WORLD_RULES_VALIDATION_VERSION);assert.deepEqual(await readFile(path),recorded);assert.equal(uploads[0].replay,recorded.toString('base64'));
 await capture.sync();assert.equal(uploads.length,1);
 await capture.save({...run,playerId:'other'});await capture.sync();assert.equal(uploads.length,1);
 await writeFile(path,withPause(withGecko(original,Buffer.concat([runtime,originalCodes])),35));await capture.save(run);await capture.sync();assert.equal((await saved()).excluded,'Paused run');assert.equal(uploads.length,1);
 const changed=Buffer.from(runtime);changed[12]^=1;await writeFile(path,withPause(withGecko(original,Buffer.concat([changed,originalCodes])),0));await capture.save(run);await capture.sync();assert.equal((await saved()).excluded,'Different game settings');assert.equal((await saved()).rulesValidationVersion,WORLD_RULES_VALIDATION_VERSION);assert.equal(uploads.length,1);
});
