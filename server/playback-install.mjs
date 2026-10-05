import {readFile,access,rm,mkdir,cp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {downloadVerified} from './onboarding.mjs';
import {windowsPath} from './platform.mjs';
const exec=promisify(execFile);
const pending=new Map();
export async function ensurePlayback(root,{directory='Dolphin/playback',onProgress=()=>{},download=downloadVerified,extract=async(archive,temp)=>{
 await exec('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',await windowsPath(join(root,'scripts/extract_dolphin.ps1')),'-Archive',await windowsPath(archive),'-Destination',await windowsPath(temp)],{timeout:120000,windowsHide:true});
}}={}){
 const target=resolve(root,directory),exe=join(target,'Slippi Dolphin.exe');
 const pin=JSON.parse(await readFile(join(root,'desktop/dependencies.json'),'utf8')).playback;
 try{await access(exe);await access(join(target,'Sys/GameSettings/GALE01r2.ini'));if((await readFile(join(target,'.ttrc-download'),'utf8')).trim()===pin.sha256)return exe;}catch{}
 if(pending.has(target))return pending.get(target);
 const task=(async()=>{
  const archive=join(root,'.local/downloads/playback.zip'),temp=join(root,'.local/downloads/playback-extract');
  onProgress('Downloading the official replay player...');
  let shown=-1;
  await download(pin.url,archive,pin.sha256,progress=>{const percent=Math.floor(progress);if(percent!==shown){shown=percent;onProgress(`Downloading the official replay player... ${percent}%`);}});
  onProgress('Installing the verified replay player...');
  await rm(temp,{recursive:true,force:true});await mkdir(temp,{recursive:true});
  await extract(archive,temp);
  await access(join(temp,'Slippi Dolphin.exe'));
  await access(join(temp,'Sys/GameSettings/GALE01r2.ini'));
  await mkdir(target,{recursive:true});await cp(temp,target,{recursive:true});
  await writeFile(join(target,'.ttrc-download'),pin.sha256);
  await rm(temp,{recursive:true,force:true});await rm(archive,{force:true});
 })();
 pending.set(target,task);
 try{await task;}finally{pending.delete(target);}
 return exe;
}
