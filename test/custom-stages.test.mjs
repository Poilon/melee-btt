import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createApp} from '../server/app.mjs';
import {CustomStages,CustomStageError} from '../server/custom-stages.mjs';
import {verifyCourseIso} from '../desktop/custom-stage-native.mjs';
const exec=promisify(execFile);
async function temp(t){const dir=await mkdtemp(join(tmpdir(),'ttrc-course-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('custom stage launches are local, allowlisted, blocked during update, and need no player account',async t=>{
 let calls=0,phase='current';
 const app=createApp({launchCustomStage:async id=>{if(id!=='grassland-1')throw new CustomStageError('Unknown custom stage.');calls++;return {status:'started'};},appUpdates:{status:()=>({phase})}});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const origin=`http://127.0.0.1:${app.address().port}`,url=origin+'/api/custom-stages/grassland-1/launch',headers={Origin:origin,'X-TTRC-Action':'launch'};
 for(const h of [{},{...headers,Origin:'https://foreign.example'}])assert.equal((await fetch(url,{method:'POST',headers:h})).status,403);
 assert.equal(calls,0);assert.deepEqual(await(await fetch(url,{method:'POST',headers})).json(),{status:'started'});assert.equal(calls,1);
 assert.equal((await fetch(origin+'/api/custom-stages/unknown/launch',{method:'POST',headers})).status,409);
 phase='installing';assert.equal((await fetch(url,{method:'POST',headers})).status,409);assert.equal(calls,1);
 const manager=new CustomStages({root:'/unused',getRuntime:()=>null});assert.throws(()=>manager.directory('../User'),CustomStageError);
});
test('native custom helper accepts only a disc containing the expected authored stage',async t=>{
 const dir=await temp(t),path=join(dir,'course.iso'),bytes=Buffer.alloc(0x1000),stage=Buffer.from('authored-stage');
 Buffer.from([71,65,76,69,48,49,0,2]).copy(bytes);
 bytes.writeUInt32BE(0x500,0x424);bytes.writeUInt32BE(64,0x428);
 bytes.writeUInt32BE(0x01000000,0x500);bytes.writeUInt32BE(2,0x508);
 bytes.writeUInt32BE(0,0x50c);bytes.writeUInt32BE(0x700,0x510);bytes.writeUInt32BE(stage.length,0x514);
 bytes.write('GrTFx.dat\0',0x518);stage.copy(bytes,0x700);await writeFile(path,bytes);
 const expected=createHash('sha256').update(stage).digest('hex');await verifyCourseIso(path,expected);
 await verifyCourseIso(path,{'GrTFx.dat':expected});
 await assert.rejects(verifyCourseIso(path,{'GrTFx.dat':expected,'GrTMr.dat':expected}),/Custom stage missing/);
 await assert.rejects(verifyCourseIso(path,{}),/Missing course hashes/);
 bytes[0x700]^=1;await writeFile(path,bytes);await assert.rejects(verifyCourseIso(path,expected),/Wrong custom stage/);
 const detailed=Buffer.concat([bytes.subarray(0,0x700),Buffer.alloc(5*1024*1024,17)]);detailed.writeUInt32BE(5*1024*1024,0x514);await writeFile(path,detailed);const detailedHash=createHash('sha256').update(detailed.subarray(0x700)).digest('hex');await verifyCourseIso(path,detailedHash);
 detailed.writeUInt32BE(9*1024*1024,0x514);await writeFile(path,detailed);await assert.rejects(verifyCourseIso(path,detailedHash),/Invalid stage size/);
});
test('custom profile preserves its own card and keeps challenge credentials and randomizer codes out',async t=>{
 const dir=await temp(t),source=join(dir,'challenge/User'),bundle=join(dir,'custom/Dolphin');
 await mkdir(join(source,'Config'),{recursive:true});await mkdir(join(source,'Challenge'),{recursive:true});
 await writeFile(join(source,'Config/Dolphin.ini'),'[Core]\nSIDevice0 = 12\nMemcardAPath = challenge-card.raw\nSlippiSaveReplays = True\n[General]\nISOPaths = 1\nISOPath0 = F:/other-games\n');
 await writeFile(join(source,'Challenge/user.json'),'SECRET');
 const script=new URL('../scripts/prepare_custom_stage.py',import.meta.url).pathname;
 const args=[script,'--bundle',bundle,'--source-profile',source,'--iso',join(dir,'course.iso')];
 await exec('python3',args);
 const user=join(bundle,'User'),card=join(user,'GC/MemoryCardA.USA.raw');await writeFile(card,'saved native records');
 await exec('python3',args);assert.equal(await readFile(card,'utf8'),'saved native records');
 const config=await readFile(join(user,'Config/Dolphin.ini'),'utf8');assert.match(config,/SIDevice0 = 12/);assert.match(config,/SlippiSaveReplays = False/);assert.doesNotMatch(config,/challenge-card|other-games/);assert.match(config,/ISOPaths = 0/);
 await assert.rejects(access(join(user,'Challenge/user.json')));
 const gecko=await readFile(join(user,'GameSettings/GALE01.ini'),'utf8');assert.match(gecko,/\$Grassland 1/);assert.doesNotMatch(gecko,/\$Target Test Randomizer Challenge/);
 assert.doesNotMatch(gecko,/C21B6598|Sheik stage/);
});

test('character worlds profile boots the authored disc without challenge stage swaps',async t=>{
 const dir=await temp(t),source=join(dir,'main/User'),bundle=join(dir,'worlds/Dolphin');
 await mkdir(join(source,'Config'),{recursive:true});
 await exec('python3',[new URL('../scripts/prepare_custom_stage.py',import.meta.url).pathname,'--bundle',bundle,'--source-profile',source,'--iso',join(dir,'Character Worlds.iso'),'--course-id','character-worlds','--name','Character Worlds']);
 assert.equal(await readFile(join(bundle,'User/.ttrc-custom-stage'),'utf8'),'character-worlds\n');
 const gecko=await readFile(join(bundle,'User/GameSettings/GALE01.ini'),'utf8');
 assert.match(gecko,/\$Character Worlds/);assert.doesNotMatch(gecko,/\$Grassland|Randomizer|Recording\n\[/);
 assert.match(gecko,/C21B6598 00000006/);
 assert.match(gecko.split('[Gecko_Enabled]')[1],/\$Character Worlds: Sheik stage \(hold A\)/);
});
