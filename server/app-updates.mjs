import {readFile,mkdir,rm,cp,statfs} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {repository,releaseRepositories,verifyUpdate} from '../desktop/update-files.mjs';
import {atomicJSON,dolphinRunning,updateLocked} from '../desktop/update-install.mjs';
import {downloadVerified} from './onboarding.mjs';
const exec=promisify(execFile),archiveName='TTRC-Windows-x64.zip';
export function newerVersion(next,current){
 if(!/^\d+\.\d+\.\d+$/.test(next)||!/^\d+\.\d+\.\d+$/.test(current))return false;
 const a=next.split('.').map(Number),b=current.split('.').map(Number);for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;
}
export function releaseAssets(release,current){
 const version=release.tag_name?.replace(/^v/,'');
 if(release.draft||release.prerelease||!newerVersion(version,current))return null;
 const asset=name=>release.assets?.find(a=>a.name===name&&a.state==='uploaded'&&[...releaseRepositories].some(repo=>a.browser_download_url===`https://github.com/${repo}/releases/download/v${version}/${name}`));
 const archive=asset(archiveName),checksums=asset('SHA256SUMS.txt');
 if(!archive||!checksums||archive.size<=0||archive.size>500_000_000)throw Error('The release download is not ready yet.');
 return {version,archive,checksums};
}
export function archiveChecksum(text){
 const lines=text.trim().split(/\r?\n/).map(line=>line.trim().split(/\s+/));
 const hashes=lines.filter(parts=>parts.length===2&&parts[1]===archiveName&&/^[a-f0-9]{64}$/.test(parts[0]));
 if(hashes.length!==1)throw Error('Missing release checksum.');return hashes[0][0];
}
export class AppUpdates{
 constructor({root,port,instance,canInstall=()=>true,fetcher=fetch,download=downloadVerified,extract,install,running=()=>dolphinRunning(root),enabled=process.platform==='win32'}){
  Object.assign(this,{root,port,instance,canInstall,fetcher,download,running});this.enabled=enabled;
  this.base=join(root,'.local/updates');this.state={supported:false,phase:'idle',currentVersion:null,version:null,progress:0};
  this.extract=extract||((archive,stage)=>exec(join(root,'runtime/python/python.exe'),[join(root,'scripts/extract_update.py'),archive,stage],{windowsHide:true,timeout:120000}));
  this.install=install||(()=>this.spawnInstaller());
 }
 status(){return {...this.state};}
 async initialize(){
  let release;try{release=JSON.parse(await readFile(join(this.root,'release.json'),'utf8'));}catch{return;}
  this.state.currentVersion=release.version;
  this.state.supported=this.enabled&&release.native===true&&releaseRepositories.has(release.repository);if(!this.state.supported)return;
  await mkdir(this.base,{recursive:true});
  try{
   const result=JSON.parse(await readFile(join(this.base,'result.json'),'utf8'));
   if(!result.ok&&newerVersion(result.version,release.version)){this.state.phase='error';this.state.error='Update could not be installed. Your previous version was kept. Click Check for updates to retry.';return;}
  }catch{}
  try{
   const pending=JSON.parse(await readFile(join(this.base,'pending.json'),'utf8'));
   if(newerVersion(pending.version,release.version)){await verifyUpdate(join(this.base,'staged/TTRC'),pending.version);this.state.version=pending.version;this.state.phase='ready';return;}
  }catch{}
 }
 async check(){
  if(!this.state.supported||this.busy||['ready','installing'].includes(this.state.phase))return this.status();
  this.busy=true;this.state.phase='checking';this.state.error=null;
  try{
   const response=await this.fetcher(`https://api.github.com/repos/${repository}/releases/latest`,{headers:{'User-Agent':'TTRC-Updater',Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('Could not check for updates.');
   const release=releaseAssets(await response.json(),this.state.currentVersion);
   if(!release){this.state.phase='current';return this.status();}
   this.state.version=release.version;
   const space=await statfs(this.base);if(space.bavail*space.bsize<1_500_000_000)throw Error('Keep at least 1.5 GB free to install this update.');
   const sums=await this.fetcher(release.checksums.browser_download_url,{signal:AbortSignal.timeout(15000)});if(!sums.ok)throw Error('Could not verify this release.');
   const hash=archiveChecksum(await sums.text());
   if(release.archive.digest&&release.archive.digest!==`sha256:${hash}`)throw Error('Release checksums do not match.');
   this.state.phase='downloading';this.state.progress=0;
   const archive=join(this.base,'release.zip'),stage=join(this.base,'staged');
   await this.download(release.archive.browser_download_url,archive,hash,p=>{this.state.progress=p;},this.fetcher);
   this.state.phase='verifying';await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});
   await this.extract(archive,stage);await verifyUpdate(join(stage,'TTRC'),release.version);
   await atomicJSON(join(this.base,'pending.json'),{version:release.version});await rm(join(this.base,'result.json'),{force:true});
   this.state.phase='ready';this.state.progress=100;
  }catch(error){this.state.phase='error';this.state.error=error.name==='TimeoutError'?'Update check timed out. You can keep playing and try again.':error.message;}
  finally{this.busy=false;}
  return this.status();
 }
 async applyIfIdle(){
  if(this.state.phase!=='ready'||this.applying||!this.canInstall())return false;
  this.applying=true;
  try{
   if(await this.running()||!this.canInstall()||await updateLocked(this.root))return false;
   this.state.phase='installing';await this.install();return true;
  }catch{this.state.phase='error';this.state.error='Update could not start. Click Check for updates to retry.';return false;}
  finally{this.applying=false;}
 }
 async spawnInstaller(){
  const helper=join(this.base,'worker');await mkdir(helper,{recursive:true});
  for(const name of ['update-install.mjs','update-files.mjs'])await cp(join(this.root,'desktop',name),join(helper,name));
  await cp(join(this.root,'runtime/node/node.exe'),join(helper,'node.exe'));
  const child=spawn(join(helper,'node.exe'),[join(helper,'update-install.mjs'),this.root,this.state.version,String(this.port),this.instance],{cwd:helper,detached:true,stdio:'ignore',windowsHide:true});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
  // A worker can fail before stopping the service (for example Dolphin reopened).
  this.workerTimer=setTimeout(async()=>{
   if(this.state.phase!=='installing'||await updateLocked(this.root))return;
   this.state.phase='error';this.state.error='Update postponed. Close Dolphin and click Check for updates to retry.';
  },15000);this.workerTimer.unref();
 }
 start(){if(!this.state.supported)return;if(this.state.phase!=='error')this.check();this.checkTimer=setInterval(()=>this.check(),60*60*1000);this.installTimer=setInterval(()=>this.applyIfIdle().catch(()=>{}),5000);}
 stop(){clearInterval(this.checkTimer);clearInterval(this.installTimer);clearTimeout(this.workerTimer);}
}
