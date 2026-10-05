import {readFile,writeFile,mkdir,rename,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {WorldCapture} from './worlds-capture.mjs';
import {WORLD_CHARACTERS,sha256,isHash} from '../shared/worlds.mjs';
export const WORLDS_ORIGIN='https://target-test-randomizer-challenge.vercel.app';
const string=(b,start,size)=>b.toString('ascii',start,start+size).split('\0')[0];
export function parseMailbox(value){
 if(typeof value!=='string')return null;
 const colon=value.indexOf(':'),address=Number(value.slice(0,colon)),b=Buffer.from(value.slice(colon+1),'base64');
 if(!Number.isInteger(address)||address<0x804e0000||address>0x817ffc00||b.length!==860||b.readUInt32BE(0)!==0x5454524f||b.readUInt32BE(4)!==1)return null;
 const read=o=>b.readUInt32BE(o);
 return {address,sequence:read(64),ack:read(256),op:read(68),character:read(72),offset:read(76),row:read(80),username:string(b,84,28),password:string(b,112,132)};
}
export function encodeReply({signedIn=false,identity='',error='',rows=[],total=0,status=0,title=''}){
 const b=Buffer.alloc(596),text=(offset,value,size)=>b.write(String(value).replace(/[^\x20-\x7e]/g,'?').slice(0,size-1),offset,'ascii');
 b.writeUInt32BE(status,0);b.writeUInt32BE(signedIn?1:0,4);b.writeUInt32BE(Math.min(rows.length,10),8);b.writeUInt32BE(total,12);
 text(16,error,128);text(144,identity,28);text(172,title,64);
 rows.slice(0,10).forEach((r,i)=>{const at=236+i*36;text(at,r.username,28);b.writeUInt32BE(r.frames,at+28);b.writeUInt32BE(r.rank,at+32);});
 return b.toString('base64');
}
async function atomic(path,value){await mkdir(join(path,'..'),{recursive:true});const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,path);}
async function openBrowser(url){
 await promisify(execFile)('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,timeout:15000});
}
export class WorldsClient{
 constructor({root,course,fetcher=fetch,origin=WORLDS_ORIGIN,playReplay,openBrowser:launchBrowser=openBrowser}){this.root=root;this.course=course;this.fetcher=fetcher;this.origin=origin;this.playReplay=playReplay;this.openBrowser=launchBrowser;this.pendingLogin=null;this.identity=null;this.board=null;this.boardCache=new Map();this.sessionFile=join(root,'.local/worlds-account.json');}
 async request(path,{method='GET',body,authenticated=false,signal}={}){
  const res=await this.fetcher(this.origin+'/api/'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(authenticated&&this.identity?{Authorization:`Bearer ${this.identity.token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000),redirect:'error'});
  if(!res.ok){const data=await res.json().catch(()=>({}));throw Error(data.error||'Server unavailable. Try again.');}return res;
 }
 async load(){
  try{const saved=JSON.parse(await readFile(this.sessionFile,'utf8'));if(saved.origin===this.origin&&isHash(saved.token)&&isHash(saved.id))this.identity=saved;}catch{}
 }
 async cancelLogin(){
  const pending=this.pendingLogin;this.pendingLogin=null;
  if(pending)await this.request('game/connect/cancel',{method:'POST',body:{id:pending.id,deviceSecret:pending.deviceSecret}}).catch(()=>{});
 }
 async saveIdentity(playerFile){
  if(playerFile?.origin!==this.origin||!isHash(playerFile.token)||!isHash(playerFile.id))throw Error('Invalid account response.');
  await atomic(this.sessionFile,playerFile);this.identity=playerFile;
 }
 async handle(q,{signal}={}){
  let error='',status=0;
  try{
   if(q.op===1||q.op===2){
    const {playerFile}=await(await this.request('game/'+(q.op===1?'login':'signup'),{method:'POST',body:{username:q.username,password:q.password}})).json();
    await this.saveIdentity(playerFile);
   }else if(q.op===7){
    await this.cancelLogin();
    const pending=await(await this.request('game/connect/start',{method:'POST',body:{}})).json();
    const url=new URL(pending.url),fragment=new URLSearchParams(url.hash.slice(1));
    if(url.origin!==this.origin||url.pathname!=='/login.html'||url.search||url.username||url.password||!isHash(pending.id)||!isHash(pending.deviceSecret)||fragment.get('request')!==pending.id||!isHash(fragment.get('key'))||!Number.isFinite(pending.expires))throw Error('Invalid sign-in response.');
    this.pendingLogin=pending;
    try{await this.openBrowser(url.href);}catch{await this.cancelLogin();throw Error('Browser did not open. Press A to retry.');}
   }else if(q.op===8){
    const pending=this.pendingLogin;
    if(!pending||pending.expires<=Date.now()){await this.cancelLogin();throw Error('Sign-in expired. Press A to try again.');}
    const result=await(await this.request('game/connect/poll',{method:'POST',body:{id:pending.id,deviceSecret:pending.deviceSecret}})).json();
    if(this.pendingLogin!==pending)throw Error('Sign-in cancelled.');
    if(result.status==='connected'){await this.saveIdentity(result.playerFile);await this.cancelLogin();}
    else if(result.status!=='pending')throw Error('Invalid sign-in response.');
   }else if(q.op===9){await this.cancelLogin();this.identity=null;await rm(this.sessionFile,{force:true});
   }else if(q.op===5){this.identity=null;await rm(this.sessionFile,{force:true});}
   else if(q.op===6){
    if(this.identity){try{await this.request('companion/me',{authenticated:true});}catch(e){if(/expired|not found|sign in/i.test(e.message)){this.identity=null;await rm(this.sessionFile,{force:true});}throw e;}}
   }else if(q.op===3){
    this.board=null;
    const isTotal=q.character===WORLD_CHARACTERS.length;
    const character=WORLD_CHARACTERS[q.character];
    const local=this.course.courses?.find(c=>c.character===character?.id);
    if(!isTotal&&(!local||!isHash(local.id)))throw Error('Practice level - no online records.');
    if(!Number.isInteger(q.offset)||q.offset<0||q.offset>100000)throw Error('Invalid page.');
    const key=`${q.character}:${q.offset}`,cached=this.boardCache.get(key);
    let board;
    if(!q.row&&cached&&Date.now()-cached.at<15000)board=cached.board;
    else{
     board=await(await this.request(isTotal?`worlds/total?offset=${q.offset}`:`worlds/leaderboard?course=${local.id}&offset=${q.offset}`,{signal})).json();
     signal?.throwIfAborted();
     if(!Array.isArray(board.rows)||!Number.isInteger(board.total))throw Error('Invalid leaderboard.');
     if(isTotal){
      const ids=new Set(this.course.courses?.map(c=>c.id));
      if(board.kind!=='total'||!Array.isArray(board.courseIds)||ids.size!==board.courseIds.length||board.courseIds.some(id=>!ids.has(id)))throw Error('Update your levels to view Total time.');
     }else if(board.course?.id!==local.id)throw Error('Invalid leaderboard.');
     this.boardCache.set(key,{at:Date.now(),board});
    }
    signal?.throwIfAborted();
    this.board={...board,rows:board.rows.slice(0,10),offset:q.offset,character:q.character};
   }else if(q.op===4){
    const board=this.board,row=board?.rows[q.row];
    if(!row||board.kind==='total'||board.character!==q.character||board.offset!==q.offset)throw Error('Refresh this leaderboard first.');
    if(!this.playReplay)throw Error('Replay player is not installed.');
    const res=await this.request(`worlds/replay?course=${board.course.id}&player=${row.playerId}&id=${row.id}`);
    const size=Number(res.headers.get('content-length'));if(size>2*1024*1024)throw Error('Replay is too large.');
    const parts=[];let total=0;for await(const chunk of res.body){total+=chunk.length;if(total>2*1024*1024)throw Error('Replay is too large.');parts.push(chunk);}
    const bytes=Buffer.concat(parts),digest=sha256(bytes);
    if(res.headers.get('x-ttrc-course')!==board.course.id||res.headers.get('x-ttrc-sha256')!==digest)throw Error('Replay version does not match.');
    const path=join(this.root,'Replays','Online',digest+'.slp');await mkdir(join(path,'..'),{recursive:true});await writeFile(path,bytes);
    await this.playReplay(path,board.course);error='Replay opened. Close it to return.';
   }else throw Error('Unknown menu action.');
  }catch(e){if(signal?.aborted)throw e;status=1;error=e.message==='fetch failed'||e.name==='TimeoutError'?'Connection failed. Try again.':e.message;}
  return {address:q.address,sequence:q.sequence,bytes:encodeReply({signedIn:Boolean(this.identity),identity:this.identity?.slug||this.identity?.displayName||'',error,status,rows:this.board?.rows||[],total:this.board?.total||0,title:this.board?.kind==='total'?'Total time':this.board?.course?.name||''})};
 }
}
export async function serveWorlds({root,course,pid,playReplay,onSample,client:providedClient}){
 if(process.platform!=='win32'||!Number.isInteger(pid)||pid<1)throw Error('TTRC Dolphin process required.');
 const client=providedClient||new WorldsClient({root,course,playReplay});await client.load();
 const capture=providedClient?null:new WorldCapture({root,course,client});
 const timer=capture?setInterval(()=>capture.sync().catch(()=>{}),1500):null;
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'scripts/watch_online.ps1'),'-Root',root,'-DolphinPid',String(pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stderr.resume();const lines=createInterface({input:child.stdout});let current='',active=null;
 lines.on('line',line=>{
  let message;try{message=JSON.parse(line);}catch{return;}
  if(message.sample){onSample?.(message.sample,client.identity);capture?.detector.sample(message.sample,client.identity);}else capture?.detector.reset();
  const q=parseMailbox(message.mailbox);
  if(!q||q.sequence===q.ack||!q.sequence)return;
  const key=q.address+':'+q.sequence;if(key===current)return;
  // Navigation may replace a pending read immediately. Account writes and replay
  // launches remain serialized; only the latest selection can receive a reply.
  if(active){if(active.op!==3)return;active.controller.abort();}
  current=key;const task={op:q.op,controller:new AbortController()};active=task;
  client.handle(q,{signal:task.controller.signal}).then(reply=>{
   if(current===key&&!task.controller.signal.aborted&&!child.stdin.destroyed)child.stdin.write(JSON.stringify(reply)+'\n');
  }).catch(()=>{}).finally(()=>{q.password='';if(active===task)active=null;});
 });
 try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{active?.controller.abort();clearInterval(timer);lines.close();child.stdin.end();}
}
