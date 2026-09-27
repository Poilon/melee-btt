// Runs from .local/updates/worker with its own Node binary, outside all replaced files.
import {readFile,writeFile,mkdir,cp,rename,rm,lstat,open} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {allowedPath,fileHash,verifyUpdate} from './update-files.mjs';
const exec=promisify(execFile),delay=ms=>new Promise(r=>setTimeout(r,ms));
const exists=async path=>{try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
export async function atomicJSON(path,value){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(value));await rename(path+'.tmp',path);}
export async function updateLocked(root){
 const path=join(root,'.local/updates/install.lock');let pid;
 try{pid=Number(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return false;throw e;}
 if(!pid)return true;
 try{process.kill(pid,0);return true;}catch(e){if(e.code!=='ESRCH')return true;await rm(path,{force:true});return false;}
}
async function safeDestination(root,name){
 if(name!=='update-manifest.json'&&!allowedPath(name))throw Error('Invalid update destination.');
 let path=root;
 for(const part of name.split('/')){path=join(path,part);if((await exists(path))?.isSymbolicLink())throw Error('Update destination contains a link.');}
 return path;
}
export async function recoverInstall(root){
 const base=join(root,'.local/updates'),journal=join(base,'journal.json');
 let state;try{state=JSON.parse(await readFile(journal,'utf8'));}catch(e){if(e.code==='ENOENT')return false;throw e;}
 if(!state.committed){
  for(const entry of state.entries){
   const target=await safeDestination(root,entry.name);
   if(entry.existed){const backup=join(base,'backup',entry.name);if(await exists(target)&&await fileHash(target)===await fileHash(backup))continue;await mkdir(dirname(target),{recursive:true});await cp(backup,target+'.ttrc-restore');await rename(target+'.ttrc-restore',target);}
   else await rm(target,{force:true});
  }
 }
 await rm(journal,{force:true});return true;
}
export async function prepareUpdate(root,stage,version){
 const manifest=await verifyUpdate(stage,version),base=join(root,'.local/updates');
 if(await exists(join(base,'journal.json')))throw Error('An earlier installation needs recovery.');
 await rm(join(base,'backup'),{recursive:true,force:true});await mkdir(join(base,'backup'),{recursive:true});
 let previous={files:{}};try{previous=JSON.parse(await readFile(join(root,'update-manifest.json'),'utf8'));}catch{}
 const names=new Set([...Object.keys(manifest.files),...Object.keys(previous.files),'update-manifest.json']);
 const entries=[];
 for(const name of names){
  const target=await safeDestination(root,name),info=await exists(target),source=join(stage,name),incoming=name==='update-manifest.json'||Boolean(manifest.files[name]);
  if(info&&!info.isFile())throw Error('Update destination is not a regular file.');
  const expected=incoming?(name==='update-manifest.json'?await fileHash(source):manifest.files[name].sha256):null;
  if(info&&incoming&&await fileHash(target)===expected)continue;
  if(!info&&!incoming)continue;
  entries.push({name,existed:Boolean(info),incoming});
  if(info){const backup=join(base,'backup',name);await mkdir(dirname(backup),{recursive:true});await cp(target,backup);}
 }
 // Replace a changed emulator first: an open executable fails before other app files change.
 entries.sort((a,b)=>a.name==='Slippi Dolphin.exe'?-1:b.name==='Slippi Dolphin.exe'?1:a.name==='release.json'?1:b.name==='release.json'?-1:0);
 return entries;
}
export async function installUpdate(root,stage,version,{beforeWrite=async()=>{},prepared}={}){
 const entries=prepared||await prepareUpdate(root,stage,version),base=join(root,'.local/updates');
 const journal=join(base,'journal.json');await atomicJSON(journal,{entries,committed:false});
 try{
  for(const entry of entries){
   await beforeWrite(entry.name);
   const target=await safeDestination(root,entry.name);
   if(entry.incoming){await mkdir(dirname(target),{recursive:true});await rename(join(stage,entry.name),target);}
   else await rm(target,{force:true});
  }
  await atomicJSON(journal,{entries,committed:true});await rm(journal,{force:true});
 }catch(error){await recoverInstall(root);throw error;}
 return {files:entries.length};
}
export async function dolphinRunning(root){
 const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$p=Get-CimInstance Win32_Process -Filter \"name = 'Slippi Dolphin.exe'\"; @($p | Where-Object { $_.ExecutablePath -eq $env:TTRC_UPDATE_EXE }).Count"],{env:{...process.env,TTRC_UPDATE_EXE:join(root,'Slippi Dolphin.exe')},windowsHide:true,timeout:15000});
 const count=Number(stdout.trim());if(!Number.isInteger(count))throw Error('Could not check Dolphin.');return count>0;
}
async function worker(root,version,port,instance){
 const base=join(root,'.local/updates'),lock=join(base,'install.lock');let ownsLock=false,stopped=false;
 const origin=`http://127.0.0.1:${port}`;
 try{
  const file=await open(lock,'wx');ownsLock=true;await file.writeFile(String(process.pid));await file.close();
  if(await dolphinRunning(root))throw Error('Dolphin reopened. The update will be retried later.');
  const health=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>r.json());
  if(health.instance!==instance)throw Error('Another companion is using this port.');
  // Hash and back up application files while the existing companion is still available.
  const prepared=await prepareUpdate(root,join(base,'staged/TTRC'),version);
  if(await dolphinRunning(root))throw Error('Dolphin reopened. Update postponed.');
  const companionPid=Number(await readFile(join(root,'.local/companion.lock'),'utf8').catch(()=>''));
  const response=await fetch(origin+'/api/quit',{method:'POST',headers:{Origin:origin,'X-TTRC-Action':'quit'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Could not stop the companion.');stopped=true;
  const deadline=Date.now()+45000;
  while(true){
   let listening=true,alive=false;try{await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)});}catch{listening=false;}
   if(companionPid){try{process.kill(companionPid,0);alive=true;}catch(e){if(e.code!=='ESRCH')alive=true;}}
   if(!listening&&!alive)break;
   if(Date.now()>deadline)throw Error('Companion is still closing.');await delay(300);
  }
  // Allow Node and the recording helper to release Windows file handles after closing HTTP.
  await delay(1000);
  if(await dolphinRunning(root))throw Error('Dolphin reopened. Update postponed.');
  await installUpdate(root,join(base,'staged/TTRC'),version,{prepared});
  await atomicJSON(join(base,'result.json'),{ok:true,version,at:new Date().toISOString()});
  await rm(join(base,'pending.json'),{force:true});
 }catch(error){await atomicJSON(join(base,'result.json'),{ok:false,version,message:error.message,at:new Date().toISOString()});}
 finally{
  if(ownsLock)await rm(lock,{force:true});
  if(stopped&&!await exists(join(base,'journal.json'))){const child=spawn(join(root,'runtime/node/node.exe'),[join(root,'desktop/native.mjs'),'--serve'],{cwd:root,detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();}
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root,version,port,instance]=process.argv.slice(2);await worker(resolve(root),version,Number(port),instance);
}
