// Started by our native Dolphin build, never by a shell script.
import {readFile,writeFile,mkdir,appendFile,rename,cp,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {verifyIso} from '../server/onboarding.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),exec=promisify(execFile);
const runtimePath=join(root,'build/challenge/runtime.json');
await mkdir(join(root,'.local'),{recursive:true});
async function writeRuntime(value){await writeFile(runtimePath+'.tmp',JSON.stringify(value));await rename(runtimePath+'.tmp',runtimePath);}
try {
 if(process.argv.includes('--prepare')){
  // Do not silently connect this installation to a different companion.
  await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(Number(process.env.PORT||4317),'127.0.0.1',()=>probe.close(resolve));});
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
 }else if(process.argv.includes('--iso')){
  const iso=resolve(process.argv[process.argv.indexOf('--iso')+1]);
  await verifyIso(iso);
  const runtime=JSON.parse(await readFile(runtimePath,'utf8'));
  await writeRuntime({...runtime,iso});
 }else if(process.argv.includes('--serve')){
  const parent=Number(process.argv[process.argv.indexOf('--parent')+1]);
  if(!Number.isSafeInteger(parent)||parent<1)throw new Error('Missing Dolphin process');
  // Keep the service alive for this Dolphin session only. No autostart or install.
  const timer=setInterval(()=>{try{process.kill(parent,0);}catch{clearInterval(timer);process.emit('SIGTERM');}},1000);
  await import('../server/main.mjs');
 }else throw new Error('Unknown native action');
}catch(error){
 await appendFile(join(root,'.local/startup.log'),`${new Date().toISOString()} ${error.stack||error}\n`);
 process.exit(1);
}
