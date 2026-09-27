import {readFile,writeFile,mkdir,stat,rename,rm,readdir,cp,access} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pythonExecutable,windowsPath,localPath} from './platform.mjs';
const exec=promisify(execFile);
const ISO_MD5='0e63d4223b01d9aba596259dc155a174';
const ISO_SIZE=1459978240;
export async function verifyIso(path){
 const info=await stat(path);
 if(!info.isFile()||info.size!==ISO_SIZE)throw new Error('Use the original Melee USA 1.02 ISO (1.36 GB), without mods.');
 const hash=createHash('md5');for await(const chunk of createReadStream(path))hash.update(chunk);
 if(hash.digest('hex')!==ISO_MD5)throw new Error('This file is not an original Melee USA 1.02 ISO. Choose another file.');
}
export async function downloadVerified(url,destination,expectedHash,onProgress=()=>{},fetcher=fetch){
 const response=await fetcher(url,{signal:AbortSignal.timeout(180000)});
 if(!response.ok||!response.body)throw new Error('Download failed. Check your connection and try again.');
 const hash=createHash('sha256');let bytes=0;const total=Number(response.headers.get('content-length'));
 await mkdir(dirname(destination),{recursive:true});
 const temporary=destination+'.part';
 try{
  const meter=new Transform({transform(chunk,encoding,done){bytes+=chunk.length;hash.update(chunk);onProgress(total?Math.min(99,Math.round(bytes/total*100)):0);done(null,chunk);}});
  await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(temporary));
  if(hash.digest('hex')!==expectedHash)throw new Error('Download verification failed. Please retry.');
  await rename(temporary,destination);onProgress(100);
 }catch(error){await rm(temporary,{force:true});throw error;}
}
async function findExecutable(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,entry.name);
  if(entry.isFile()&&entry.name==='Slippi Dolphin.exe')return path;
  if(entry.isDirectory()){const found=await findExecutable(path);if(found)return found;}
 }
}
export class Onboarding{
 constructor({root,challengeDir,onReady}){this.root=root;this.challengeDir=challengeDir;this.onReady=onReady;this.state={ready:false,busy:false,isoReady:false,step:'iso',message:'Choose your Melee ISO to get started.',progress:0};}
 get(){return {...this.state};}
 async initialize(runtime){
  if(runtime?.profile&&runtime?.dolphin){try{await access(runtime.dolphin);if(runtime.iso&&!runtime.native)await access(runtime.iso);await access(join(runtime.profile,'GameSettings/GALE01.ini'));this.state={...this.state,ready:true,isoReady:true,step:'ready',message:'Ready to play.'};return;}catch{}}
  await mkdir(join(this.root,'Games'),{recursive:true});
  try{await verifyIso(join(this.root,'Games/Melee.iso'));this.state.isoReady=true;this.state.step='install';this.state.message='ISO verified. Set up Dolphin to continue.';}catch{}
 }
 async chooseIso(){
  if(this.state.busy)return this.get();
  this.state={...this.state,busy:true,message:'Choose your ISO in the file picker.',error:null};
  try{
   const script=await windowsPath(join(this.root,'scripts/select_iso.ps1'));
   const result=await exec('powershell.exe',['-NoProfile','-STA','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{timeout:300000,windowsHide:false});
   if(!result.stdout.trim()){this.state.message='No file selected. Choose your ISO when you are ready.';this.state.busy=false;return this.get();}
   const source=await localPath(result.stdout.trim().replace(/^\uFEFF/,''));
   this.state.message='Checking your ISO…';await verifyIso(source);
   const destination=join(this.root,'Games/Melee.iso');
   if(resolve(source)!==resolve(destination)){
    this.state.message='Copying your ISO into Games/Melee.iso…';
    const temporary=destination+'.part';
    try{await pipeline(createReadStream(source),createWriteStream(temporary));await verifyIso(temporary);await rename(temporary,destination);}catch(error){await rm(temporary,{force:true});throw error;}
   }
   this.state={...this.state,isoReady:true,step:'install',message:'ISO verified. Ready to set up Dolphin.'};
  }catch(error){this.state.error=error.message.includes('original Melee')||error.message.includes('Choose another')?error.message:'Could not import the ISO. You can put it in Games/Melee.iso and click Set up Dolphin.';}
  finally{this.state.busy=false;}
  return this.get();
 }
 start(){if(this.state.busy||this.state.ready)return this.get();this.state={...this.state,busy:true,error:null,step:'install',progress:0};this.install().catch(error=>{console.error('Setup failed:',error.message);this.state={...this.state,busy:false,error:error.message.startsWith('Use the original')||error.message.startsWith('This file')?error.message:'Setup could not finish. Check your connection and free disk space, then retry.',message:'Setup paused. Your files are kept for the next attempt.'};});return this.get();}
 async install(){
  this.state.message='Checking Games/Melee.iso…';
  const iso=join(this.root,'Games/Melee.iso');
  try{await verifyIso(iso);}catch(error){if(error.code==='ENOENT')throw new Error('Use the original Melee USA 1.02 ISO: choose it above, or put it in Games/Melee.iso.');throw error;}
  this.state.isoReady=true;
  const dependencies=JSON.parse(await readFile(join(this.root,'desktop/dependencies.json'),'utf8'));
  for(const kind of ['netplay','playback']){
   const destination=join(this.root,'Dolphin',kind),marker=join(destination,'.ttrc-download');
   try{if((await readFile(marker,'utf8')).trim()===dependencies[kind].sha256){await access(join(destination,'Slippi Dolphin.exe'));continue;}}catch{}
   this.state.message=`Downloading Dolphin ${kind==='netplay'?'for playing':'for replays'}…`;this.state.progress=0;
   const archive=join(this.root,'.local/downloads',kind+'.zip');
   await downloadVerified(dependencies[kind].url,archive,dependencies[kind].sha256,value=>{this.state.progress=value;});
   this.state.message='Extracting Dolphin…';const temporary=join(this.root,'.local/downloads',kind+'-extract');
   await rm(temporary,{recursive:true,force:true});await mkdir(temporary,{recursive:true});
   await exec('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',await windowsPath(join(this.root,'scripts/extract_dolphin.ps1')),'-Archive',await windowsPath(archive),'-Destination',await windowsPath(temporary)],{timeout:120000,windowsHide:true});
   const executable=await findExecutable(temporary);if(!executable)throw new Error('Dolphin archive is incomplete.');
   await mkdir(destination,{recursive:true});await cp(dirname(executable),destination,{recursive:true});await writeFile(marker,dependencies[kind].sha256);
   await rm(temporary,{recursive:true,force:true});await rm(archive,{force:true});
  }
  this.state.message='Preparing Target Test and replay recording…';
  const dolphin=join(this.root,'Dolphin/netplay/Slippi Dolphin.exe');
  await exec(pythonExecutable(this.root),[join(this.root,'scripts/prepare_dolphin.py'),'--challenge',this.challengeDir,'--iso',iso,'--dolphin',dolphin,'--record-replays'],{timeout:120000,windowsHide:true});
  const runtime=JSON.parse(await readFile(join(this.challengeDir,'runtime.json'),'utf8'));
  await this.onReady(runtime);
  this.state={ready:true,busy:false,isoReady:true,step:'ready',message:'Ready to play. Import your player file to save and submit records.',progress:100};
 }
 async openGames(){await exec('explorer.exe',[await windowsPath(join(this.root,'Games'))]).catch(e=>{if(e.code!==1)throw e;});return {ok:true};}
}
