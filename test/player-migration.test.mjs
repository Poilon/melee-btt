import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restoreProfilePlayer, readPlayer, savePlayer } from '../server/player.mjs';
const origin='https://test.vercel.app';
const file={format:'target-test-player-v1',origin,id:'a'.repeat(64),token:'b'.repeat(64),displayName:'Player',connectCode:'TT#12345'};
test('replay profile restores the existing challenge player after cloud verification',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ttrc-migrate-'));
 try {
  const old=join(dir,'standard/user.json'),next=join(dir,'replay/Challenge/user.json');await savePlayer(old,file);
  let verified=0;
  const result=await restoreProfilePlayer(next,old,origin,async value=>{assert.deepEqual(value,file);verified++;assert.equal(await readPlayer(next,origin),null);});
  assert.deepEqual(result,file);assert.equal(verified,1);assert.deepEqual(await readPlayer(next,origin),file);assert.deepEqual(await readPlayer(old,origin),file);
  const other={...file,id:'c'.repeat(64)};await savePlayer(next,other);
  assert.deepEqual(await restoreProfilePlayer(next,old,origin,async()=>{}),other);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('unverified or invalid player files cannot silently replace the replay profile',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ttrc-migrate-'));
 try {
  const old=join(dir,'old.json'),next=join(dir,'new.json');await savePlayer(old,file);
  await assert.rejects(restoreProfilePlayer(next,old,origin,async()=>{throw new Error('Offline or rejected');}));
  await assert.rejects(access(next));
  await writeFile(next,'invalid');
  assert.equal(await restoreProfilePlayer(next,old,origin,async()=>{throw new Error('Must not verify');}),null);
 }finally{await rm(dir,{recursive:true,force:true});}
});
