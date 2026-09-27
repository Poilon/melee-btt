import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inventory,verifyUpdate,allowedPath,repository} from '../desktop/update-files.mjs';
import {installUpdate,recoverInstall,atomicJSON} from '../desktop/update-install.mjs';
import {AppUpdates,newerVersion,releaseAssets,archiveChecksum} from '../server/app-updates.mjs';
import {createApp} from '../server/app.mjs';
async function temp(t){const path=await mkdtemp(join(tmpdir(),'ttrc-update-'));t.after(()=>rm(path,{recursive:true,force:true}));return path;}
async function put(root,path,value){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),value);}
async function fixture(root,version){
 for(const name of ['Slippi Dolphin.exe','desktop/native.mjs','server/main.mjs','runtime/node/node.exe','web/app.js'])await put(root,name,`${name} ${version}`);
 await put(root,'release.json',JSON.stringify({version,repository,native:true}));
 await put(root,'update-manifest.json',JSON.stringify({format:1,version,files:await inventory(root)}));
}
const metadata=version=>({tag_name:`v${version}`,draft:false,prerelease:false,assets:['TTRC-Windows-x64.zip','SHA256SUMS.txt'].map(name=>({name,state:'uploaded',size:100,browser_download_url:`https://github.com/${repository}/releases/download/v${version}/${name}`}))});
test('updates select newer stable releases with exact official assets and a single checksum',()=>{
 assert.equal(newerVersion('0.10.0','0.9.9'),true);for(const v of ['0.9.0','0.8.99','0.10.0-rc.1','nope'])assert.equal(newerVersion(v,'0.9.0'),false);
 assert.equal(releaseAssets(metadata('0.9.0'),'0.9.0'),null);assert.equal(releaseAssets({...metadata('0.10.0'),prerelease:true},'0.9.0'),null);
 assert.equal(releaseAssets(metadata('0.10.0'),'0.9.0').version,'0.10.0');
 const bad=metadata('0.10.0');bad.assets[0].browser_download_url='https://example.org/update.zip';assert.throws(()=>releaseAssets(bad,'0.9.0'));
 assert.equal(archiveChecksum('a'.repeat(64)+'  TTRC-Windows-x64.zip\n'),'a'.repeat(64));assert.throws(()=>archiveChecksum('bad  TTRC-Windows-x64.zip'));
});
test('installation preserves player files, challenge, settings, ISO and replay; removes only obsolete managed files',async t=>{
 const base=await temp(t),root=join(base,'installed'),stage=join(base,'stage');await fixture(root,'0.9.0');await put(root,'server/obsolete.mjs','old');await put(root,'update-manifest.json',JSON.stringify({format:1,version:'0.9.0',files:await inventory(root)}));await fixture(stage,'0.10.0');
 const protectedFiles=['.local/scores.sqlite','.local/play-settings.json','User/Challenge/user.json','User/Config/Dolphin.ini','Games/Melee.iso','Replays/test.slp','build/challenge/challenge.json','build/challenge/runtime.json'];
 for(const name of protectedFiles)await put(root,name,'keep me');
 await installUpdate(root,stage,'0.10.0');assert.equal(JSON.parse(await readFile(join(root,'release.json'))).version,'0.10.0');
 for(const name of protectedFiles)assert.equal(await readFile(join(root,name),'utf8'),'keep me');
 await assert.rejects(readFile(join(root,'server/obsolete.mjs')),{code:'ENOENT'});
});
test('failed installation rolls back all changed files and interrupted transactions recover',async t=>{
 const base=await temp(t),root=join(base,'installed'),stage=join(base,'stage');await fixture(root,'0.9.0');await fixture(stage,'0.10.0');
 let writes=0;await assert.rejects(installUpdate(root,stage,'0.10.0',{beforeWrite:async()=>{if(++writes===3)throw Error('File locked');}}),/File locked/);
 await verifyUpdate(root,'0.9.0');
 await put(root,'.local/updates/backup/web/app.js','original');await put(root,'web/app.js','half installed');
 await atomicJSON(join(root,'.local/updates/journal.json'),{entries:[{name:'web/app.js',existed:true}],committed:false});
 assert.equal(await recoverInstall(root),true);assert.equal(await readFile(join(root,'web/app.js'),'utf8'),'original');assert.equal(await recoverInstall(root),false);
});
test('tampered, incomplete, traversal and linked updates never install',async t=>{
 const base=await temp(t),root=join(base,'installed'),stage=join(base,'stage');await fixture(root,'0.9.0');await fixture(stage,'0.10.0');
 for(const path of ['../server/a','/server/a','server/../../User/a','User/a','.local/a','build/challenge/code.txt','server/a:ads','server/a\\..\\x','server/a.'])assert.equal(allowedPath(path),false);
 await put(stage,'web/app.js','tampered');await assert.rejects(installUpdate(root,stage,'0.10.0'),/verification/);await verifyUpdate(root,'0.9.0');
 await fixture(stage,'0.10.0');await rm(join(root,'web'),{recursive:true});await mkdir(join(base,'outside'));await symlink(join(base,'outside'),join(root,'web'));await assert.rejects(installUpdate(root,stage,'0.10.0'),/link/);
});
test('background downloads survive restart, defer while Dolphin runs, and install once when idle',async t=>{
 const base=await temp(t),root=join(base,'installed'),payload=join(base,'payload');await fixture(root,'0.9.0');await fixture(payload,'0.10.0');let running=true,installs=0,downloads=0;
 const options={root,enabled:true,port:4317,instance:'test',running:async()=>running,install:async()=>{installs++;},fetcher:async url=>url.endsWith('/latest')?Response.json(metadata('0.10.0')):new Response('a'.repeat(64)+'  TTRC-Windows-x64.zip'),download:async()=>{downloads++;},extract:async(_,stage)=>cp(payload,join(stage,'TTRC'),{recursive:true})};
 const manager=new AppUpdates(options);await manager.initialize();await Promise.all([manager.check(),manager.check()]);assert.equal(downloads,1);assert.equal(manager.status().phase,'ready');assert.equal(await manager.applyIfIdle(),false);assert.equal(installs,0);
 const restarted=new AppUpdates(options);await restarted.initialize();assert.equal(restarted.status().phase,'ready');running=false;await Promise.all([restarted.applyIfIdle(),restarted.applyIfIdle()]);assert.equal(installs,1);assert.equal(restarted.status().phase,'installing');
});
test('offline or corrupt downloads leave the installed app intact and can be retried',async t=>{
 const root=await temp(t);await fixture(root,'0.9.0');let offline=true;
 const manager=new AppUpdates({root,enabled:true,fetcher:async()=>{if(offline)throw Error('Offline');return Response.json(metadata('0.9.0'));}});
 await manager.initialize();await manager.check();assert.equal(manager.status().phase,'error');await verifyUpdate(root,'0.9.0');offline=false;await manager.check();assert.equal(manager.status().phase,'current');
 const corrupt=new AppUpdates({root,enabled:true,fetcher:async url=>url.endsWith('/latest')?Response.json(metadata('0.10.0')):new Response('a'.repeat(64)+'  TTRC-Windows-x64.zip'),download:async()=>{throw Error('Download verification failed');}});
 await corrupt.initialize();await corrupt.check();assert.equal(corrupt.status().phase,'error');await verifyUpdate(root,'0.9.0');
});
test('update API rejects foreign origins and blocks actions during installation',async t=>{
 let checks=0,phase='current';const server=createApp({appUpdates:{status:()=>({supported:true,phase}),check:()=>{checks++;}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin=`http://127.0.0.1:${server.address().port}`;
 for(const headers of [{},{Origin:'https://example.com','X-TTRC-Action':'update'}])assert.equal((await fetch(origin+'/api/app-update/check',{method:'POST',headers})).status,403);
 assert.equal(checks,0);assert.equal((await fetch(origin+'/api/app-update/check',{method:'POST',headers:{Origin:origin,'X-TTRC-Action':'update'}})).status,202);assert.equal(checks,1);
 phase='installing';assert.equal((await fetch(origin+'/api/launch',{method:'POST',headers:{Origin:origin,'X-TTRC-Action':'launch'}})).status,409);
});

test('ZIP extraction rejects traversal, duplicate Windows names and symlinks before writing',async t=>{
 const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');const exec=promisify(execFile),base=await temp(t),archive=join(base,'input.zip'),destination=join(base,'out');
 const extractor=new URL('../scripts/extract_update.py',import.meta.url).pathname;
 const cases=[['TTRC/../escape','TTRC/web/app.js'],['TTRC/web/App.js','TTRC/web/app.js'],['TTRC/web/link']];
 for(const [index,names]of cases.entries()){
  await exec('python3',['-c',`import zipfile,sys,json\nz=zipfile.ZipFile(sys.argv[1],'w')\nfor name in json.loads(sys.argv[2]):\n i=zipfile.ZipInfo(name)\n i.external_attr=${index===2?'0o120777 << 16':'0o100644 << 16'}\n z.writestr(i,'test')\nz.close()`,archive,JSON.stringify(names)]);
  await assert.rejects(exec('python3',[extractor,archive,destination]));await assert.rejects(readFile(join(destination,'TTRC/web/app.js')),{code:'ENOENT'});
 }
});
