import {mkdtemp,mkdir,writeFile,readFile,cp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {installUpdate} from '../../desktop/update-install.mjs';
import {inventory,repository,verifyUpdate} from '../../desktop/update-files.mjs';
import assert from 'node:assert/strict';
if(process.platform!=='win32'){console.log('Windows updater integration test: skipped on this platform.');process.exit(0);}
const work=await mkdtemp(join(tmpdir(),'TTRC-updater-test-')),root=join(work,'app'),helper=join(work,'worker'),stage=join(root,'.local/updates/staged/TTRC');
const put=async(base,name,value)=>{await mkdir(join(base,name,'..'),{recursive:true});await writeFile(join(base,name),value);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));const port=44317,instance='isolated-updater-test';
const origin=`http://127.0.0.1:${port}`;
const fixture=async(base,version)=>{
 await put(base,'release.json',JSON.stringify({version,repository,native:true}));await put(base,'Slippi Dolphin.exe','test fixture, never executed');await put(base,'server/main.mjs',version);await put(base,'web/app.js',version);
 await mkdir(join(base,'runtime/node'),{recursive:true});await cp(process.execPath,join(base,'runtime/node/node.exe'));
 await put(base,'desktop/native.mjs',`import{createServer}from'node:http';import{readFile}from'node:fs/promises';import{join}from'node:path';const root=process.cwd();const version=JSON.parse(await readFile(join(root,'release.json'),'utf8')).version;const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/api/health'){res.end(JSON.stringify({instance:'${instance}',version,pid:process.pid}));}else if(req.url==='/api/quit'){res.end('{}');server.close(()=>process.exit(0));server.closeIdleConnections();}else{res.statusCode=404;res.end('{}');}});server.listen(${port},'127.0.0.1');`);
 await put(base,'update-manifest.json',JSON.stringify({format:1,version,files:await inventory(base)}));
};
async function health(version){for(let i=0;i<120;i++){try{const r=await fetch(origin+'/api/health').then(r=>r.json());if(r.version===version)return r;}catch{}await pause(250);}throw Error('Companion did not restart on '+version);}
let child;
try{
 await fixture(root,'0.9.0');await fixture(stage,'0.10.0');
 const locked=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$f=[System.IO.File]::Open($env:TTRC_TEST_LOCK,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read); [Console]::WriteLine('locked'); try { Start-Sleep -Seconds 60 } finally { $f.Dispose() }"],{env:{...process.env,TTRC_TEST_LOCK:join(root,'web/app.js')},windowsHide:true,stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{locked.stdout.once('data',resolve);locked.once('error',reject);});
 try{await assert.rejects(installUpdate(root,stage,'0.10.0'));await verifyUpdate(root,'0.9.0');console.log(JSON.stringify({windowsLockedFileRollback:true}));}finally{locked.kill();await pause(500);}
 await rm(stage,{recursive:true,force:true});await fixture(stage,'0.10.0');await mkdir(helper,{recursive:true});for(const name of ['update-install.mjs','update-files.mjs'])await cp(new URL('../../desktop/'+name,import.meta.url),join(helper,name));await cp(process.execPath,join(helper,'node.exe'));
 for(const name of ['.local/scores.sqlite','User/Challenge/user.json','Replays/test.slp','Games/Melee.iso','build/challenge/challenge.json'])await put(root,name,'preserved test data');
 child=spawn(join(root,'runtime/node/node.exe'),[join(root,'desktop/native.mjs'),'--serve'],{cwd:root,stdio:'ignore',windowsHide:true});const old=await health('0.9.0');
 const worker=spawn(join(helper,'node.exe'),[join(helper,'update-install.mjs'),root,'0.10.0',String(port),instance],{cwd:helper,stdio:['ignore','pipe','pipe'],windowsHide:true});let err='';worker.stderr.on('data',d=>err+=d);const exit=await new Promise(r=>worker.once('exit',r));assert.equal(exit,0,err);
 const next=await health('0.10.0');assert.notEqual(old.pid,next.pid);const result=JSON.parse(await readFile(join(root,'.local/updates/result.json'),'utf8'));assert.equal(result.ok,true,JSON.stringify(result));await verifyUpdate(root,'0.10.0');
 for(const name of ['.local/scores.sqlite','User/Challenge/user.json','Replays/test.slp','Games/Melee.iso','build/challenge/challenge.json'])assert.equal(await readFile(join(root,name),'utf8'),'preserved test data');
 console.log(JSON.stringify({windowsWorker:true,oldVersion:old.version,newVersion:next.version,companionRestarted:true,privateFilesPreserved:true}));
}finally{
 await fetch(origin+'/api/quit',{method:'POST'}).catch(()=>{});await pause(1000);child?.kill();await rm(work,{recursive:true,force:true,maxRetries:10,retryDelay:500});
}
