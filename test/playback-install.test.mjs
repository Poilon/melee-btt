import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {ensurePlayback} from '../server/playback-install.mjs';
import {downloadVerified} from '../server/onboarding.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'btt-playback-install-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const bytes=Buffer.from('official playback fixture'),sha256=createHash('sha256').update(bytes).digest('hex');
 await mkdir(join(root,'desktop'));await writeFile(join(root,'desktop/dependencies.json'),JSON.stringify({playback:{url:'https://official.test/playback.zip',sha256}}));
 let downloads=0,extractions=0,bad=false,incomplete=false;const progress=[];
 const options={directory:'Playback',onProgress:message=>progress.push(message),download:async(url,path,digest,onProgress)=>{
  downloads++;assert.equal(digest,sha256);
  return downloadVerified(url,path,digest,onProgress,async()=>new Response(bad?'corrupted':bytes));
 },extract:async(archive,dir)=>{
  extractions++;assert.deepEqual(await readFile(archive),bytes);
  await writeFile(join(dir,'Slippi Dolphin.exe'),'test executable');
  if(!incomplete){await mkdir(join(dir,'Sys/GameSettings'),{recursive:true});await writeFile(join(dir,'Sys/GameSettings/GALE01r2.ini'),'playback codes');}
 }};
 return {root,options,sha256,progress,get downloads(){return downloads;},get extractions(){return extractions;},set bad(value){bad=value;},set incomplete(value){incomplete=value;}};
}
test('fresh game installs the pinned replay player once, then reuses it offline',async t=>{
 const f=await fixture(t);
 await Promise.all([ensurePlayback(f.root,f.options),ensurePlayback(f.root,f.options)]);
 assert.equal(f.downloads,1);assert.equal(f.extractions,1);
 assert.equal(await readFile(join(f.root,'Playback/.ttrc-download'),'utf8'),f.sha256);
 assert.match(f.progress.join('\n'),/Downloading.*Installing/s);
 await ensurePlayback(f.root,{...f.options,download:()=>{throw Error('Must work offline');}});
 await rm(join(f.root,'Playback/Slippi Dolphin.exe'));
 await ensurePlayback(f.root,f.options);assert.equal(f.downloads,2);
});
test('corrupt or incomplete playback downloads stay uninstalled and can be retried',async t=>{
 const f=await fixture(t);f.bad=true;
 await assert.rejects(ensurePlayback(f.root,f.options),/verification failed/);assert.equal(f.extractions,0);
 await assert.rejects(access(join(f.root,'Playback/.ttrc-download')));
 f.bad=false;f.incomplete=true;
 await assert.rejects(ensurePlayback(f.root,f.options),/ENOENT/);
 await assert.rejects(access(join(f.root,'Playback/.ttrc-download')));
 f.incomplete=false;await ensurePlayback(f.root,f.options);
 assert.equal(f.downloads,3);await access(join(f.root,'Playback/Slippi Dolphin.exe'));
});
