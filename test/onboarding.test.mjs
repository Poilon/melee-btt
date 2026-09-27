import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {downloadVerified,verifyIso,Onboarding} from '../server/onboarding.mjs';

test('setup downloads require the pinned digest and never replace a verified file with corrupt bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ttrc-download-')),destination=join(dir,'dolphin.zip');
 try{
  await writeFile(destination,'old');
  const data=Buffer.from('official fixture'),digest=createHash('sha256').update(data).digest('hex');
  await assert.rejects(downloadVerified('https://example.test/file',destination,digest,()=>{},async()=>new Response('corrupt')),/verification/);
  assert.equal(await readFile(destination,'utf8'),'old');await assert.rejects(access(destination+'.part'));
  await downloadVerified('https://example.test/file',destination,digest,()=>{},async()=>new Response(data));
  assert.equal(await readFile(destination,'utf8'),'official fixture');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('first launch stays in setup, rejects a renamed fake ISO and permits retry',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ttrc-onboard-'));
 try{
  const setup=new Onboarding({root,challengeDir:join(root,'challenge'),onReady:async()=>{throw new Error('Should not prepare an invalid ISO');}});
  await setup.initialize();assert.equal(setup.get().ready,false);assert.equal(setup.get().isoReady,false);
  await writeFile(join(root,'Games/Melee.iso'),'not a game');await assert.rejects(verifyIso(join(root,'Games/Melee.iso')),/original Melee/);
  assert.equal(setup.start().busy,true);
  for(let i=0;i<30&&setup.get().busy;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(setup.get().ready,false);assert.equal(setup.get().busy,false);assert.match(setup.get().error,/original Melee/);
  assert.equal(setup.start().busy,true);
  for(let i=0;i<30&&setup.get().busy;i++)await new Promise(r=>setTimeout(r,10));
 }finally{await rm(root,{recursive:true,force:true});}
});
