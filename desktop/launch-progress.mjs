import {spawn} from 'node:child_process';
import {mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

// The helper owns this one window. Its status contains no account or ISO data.
export class LaunchProgress {
 constructor(root,{heading='Getting your game ready',detail='The first launch builds your levels. Later launches reuse them.'}={}){this.root=root;this.heading=heading;this.detail=detail;this.path=join(root,'.local',`launch-${randomUUID()}.json`);this.queue=Promise.resolve();this.child=null;this.closed=false;}
 show(message){
  this.queue=this.queue.then(async()=>{
   if(this.closed)return;
   await mkdir(join(this.root,'.local'),{recursive:true});
   await writeFile(this.path+'.tmp',JSON.stringify({message,heading:this.heading,detail:this.detail}));await rename(this.path+'.tmp',this.path);
   if(message&&!this.child){
    this.child=spawn('powershell.exe',['-NoProfile','-STA','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(this.root,'scripts/launch_progress.ps1'),'-Root',this.root,'-StatusFile',this.path,'-OwnerPid',String(process.pid)],{windowsHide:true,stdio:'ignore'});
    this.child.on('error',()=>{});
   }
  }).catch(()=>{});
  return this.queue;
 }
 async close(){
  this.closed=true;await this.queue;
  if(this.child){this.child.kill();this.child=null;}
  await Promise.all([rm(this.path,{force:true}),rm(this.path+'.tmp',{force:true})]).catch(()=>{});
 }
}
