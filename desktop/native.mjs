// Shared entry point for native Dolphin and the independent companion launcher.
import {readFile,writeFile,mkdir,appendFile,rename,cp,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {companionRunning,checkCompanionPort,claimCompanion} from '../server/companion-instance.mjs';
import {updateLocked,recoverInstall} from './update-install.mjs';
import {verifyIso} from '../server/onboarding.mjs';
import {loadChallenge} from '../server/challenge-loader.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),exec=promisify(execFile);
const runtimePath=join(root,'build/challenge/runtime.json'),port=Number(process.env.PORT||4317);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await mkdir(join(root,'.local'),{recursive:true});
async function writeRuntime(value){await writeFile(runtimePath+'.tmp',JSON.stringify(value));await rename(runtimePath+'.tmp',runtimePath);}
async function ensureCompanion(){
 if(await companionRunning(root,port))return;
 const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--serve'],{cwd:root,detached:true,stdio:'ignore',windowsHide:true});
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
 const deadline=Date.now()+100000;
 while(!await companionRunning(root,port)){if(Date.now()>deadline)throw new Error('Companion did not start. See .local/startup.log.');await delay(300);}
}
async function playPublishedWorlds(){
 await ensureCompanion();
 const {CustomStages}=await import('../server/custom-stages.mjs');
 const runtime=JSON.parse(await readFile(runtimePath,'utf8'));
 const worlds=new CustomStages({root,getRuntime:()=>runtime});
 const result=await worlds.launch('character-worlds');
 if(!['started','already-running'].includes(result.status))throw Error('TTRC did not launch.');
 // Native startup recognizes this successful handoff and closes the ISO picker.
 process.exitCode=2;
}
try {
 if(await updateLocked(root)){
  if(!process.argv.includes('--open'))throw Error('TTRC is installing an update. Try again in a moment.');
  const deadline=Date.now()+100000;while(await updateLocked(root)){if(Date.now()>deadline)throw Error('Update is still installing.');await delay(500);}
 }
 await recoverInstall(root);
 if(process.argv.includes('--prepare')){
  // Do not silently connect this installation to a different companion.
  await checkCompanionPort(root,port);
  await loadChallenge(root,join(root,'build/challenge'));
  const dolphin=join(root,'Slippi Dolphin.exe'),profile=join(root,'User');
  let previous={};try{previous=JSON.parse(await readFile(runtimePath,'utf8'));}catch{}
  await exec(join(root,'runtime/python/python.exe'),[join(root,'scripts/prepare_dolphin.py'),'--record-replays','--dolphin',dolphin,'--portable','--configure-only','--controller-config',join(profile,'Config')],{windowsHide:true,timeout:90000});
  await writeFile(join(root,'portable.txt'),'');
  // Upgrade the player's own v0.1 profile without overwriting an imported player.
  if(previous.recording&&!previous.native&&previous.profile){
   const player=join(profile,'Challenge/user.json');
   let exists=false;try{await access(player);exists=true;}catch{}
   if(!exists){try{await mkdir(join(profile,'Challenge'),{recursive:true});await cp(join(previous.profile,'Challenge/user.json'),player,{errorOnExist:true,force:false});}catch(error){if(error.code!=='ENOENT')throw error;}}
  }
  await writeRuntime({profile,dolphin,replays:join(root,'Replays'),recording:true,native:true,iso:previous.iso||null});
  if(previous.iso&&process.argv.includes('--play'))await playPublishedWorlds();
 }else if(process.argv.includes('--iso')){
  const iso=resolve(process.argv[process.argv.indexOf('--iso')+1]);
  await verifyIso(iso);
  const runtime=JSON.parse(await readFile(runtimePath,'utf8'));
  await writeRuntime({...runtime,iso});
  if(process.argv.includes('--play'))await playPublishedWorlds();
 }else if(process.argv.includes('--open')){
  await ensureCompanion();
  await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process 'http://localhost:${port}'`],{windowsHide:true});
 }else if(process.argv.includes('--serve')){
  if(await companionRunning(root,port)){
   const origin=`http://127.0.0.1:${port}`;
   await fetch(origin+'/api/app-update/check',{method:'POST',headers:{Origin:origin,'X-TTRC-Action':'update'},signal:AbortSignal.timeout(3000)}).catch(()=>{});
   process.exit(0);
  }
  const release=await claimCompanion(root);
  if(!release)process.exit(0);
  try{
   await checkCompanionPort(root,port);
   // A fresh install needs its profile before the companion can observe Dolphin.
   let prepared=false;try{const runtime=JSON.parse(await readFile(runtimePath,'utf8'));prepared=runtime.native&&runtime.profile===join(root,'User');}catch{}
   if(!prepared)await exec(process.execPath,[fileURLToPath(import.meta.url),'--prepare'],{windowsHide:true,timeout:95000});
   globalThis.ttrcReleaseCompanion=release;
   await import('../server/main.mjs');
  }catch(error){await release();throw error;}
 }else throw new Error('Unknown native action');
}catch(error){
 await appendFile(join(root,'.local/startup.log'),`${new Date().toISOString()} ${error.stack||error}\n`);
 process.exit(1);
}
