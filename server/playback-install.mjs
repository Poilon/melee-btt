import {readFile,access,rm,mkdir,cp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {downloadVerified} from './onboarding.mjs';
import {windowsPath} from './platform.mjs';
const exec=promisify(execFile);
let pending;
export async function ensurePlayback(root){
 const target=join(root,'Dolphin/playback'),exe=join(target,'Slippi Dolphin.exe');
 const pin=JSON.parse(await readFile(join(root,'desktop/dependencies.json'),'utf8')).playback;
 try{await access(exe);await access(join(target,'Sys/GameSettings/GALE01r2.ini'));if((await readFile(join(target,'.ttrc-download'),'utf8')).trim()===pin.sha256)return;}catch{}
 if(pending)return pending;
 pending=(async()=>{
  const archive=join(root,'.local/downloads/playback.zip'),temp=join(root,'.local/downloads/playback-extract');
  await downloadVerified(pin.url,archive,pin.sha256);
  await rm(temp,{recursive:true,force:true});await mkdir(temp,{recursive:true});
  await exec('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',await windowsPath(join(root,'scripts/extract_dolphin.ps1')),'-Archive',await windowsPath(archive),'-Destination',await windowsPath(temp)],{timeout:120000,windowsHide:true});
  await access(join(temp,'Slippi Dolphin.exe'));
  await mkdir(target,{recursive:true});await cp(temp,target,{recursive:true});
  await writeFile(join(target,'.ttrc-download'),pin.sha256);
  await rm(temp,{recursive:true,force:true});await rm(archive,{force:true});
 })();
 try{await pending;}finally{pending=null;}
}
