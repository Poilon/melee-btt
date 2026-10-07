import {readFile,writeFile,mkdir,readdir,rename,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {WORLD_CHARACTERS,sha256,worldRulesHash,WORLD_RULES_VALIDATION_VERSION} from '../shared/worlds.mjs';
import {SCORE_SEASON_START} from '../shared/score-season.mjs';
import {inspectReplay,MAX_REPLAY_BYTES} from '../shared/replay.mjs';
const {SlippiGame}=createRequire(import.meta.url)('@slippi/slippi-js');
export class WorldRunDetector{
 constructor(courses,onComplete,now=Date.now,onAttempt=()=>{}){this.courses=courses;this.onComplete=onComplete;this.now=now;this.onAttempt=onAttempt;}
 reset(reason='Capture interrupted',status='interrupted'){if(this.run&&!this.run.saved)this.onAttempt({...this.run,status,reason,finishedAt:this.now(),elapsedFrames:this.last?.frames||0});this.run=null;this.last=null;}
 sample(s,identity){
  // A failed RAM read is not a scene transition. Keep the last coherent sample
  // so that the next one can detect a restart or a completed run.
  if(!s)return;
  const character=WORLD_CHARACTERS.find(c=>c.externalId===s.characterId||(c.externalId===14&&s.characterId===32));
  const course=this.courses.find(c=>c.character===character?.id&&c.stageId+7===s.stageId);
  const frames=s.seconds*60+s.timerFrame;
  if(s.major!==15||s.minor!==1||!course||!identity){this.reset('Left the course or account','aborted');return;}
  if(!Number.isInteger(s.frame)||!Number.isInteger(s.seconds)||!Number.isInteger(s.timerFrame)||s.timerFrame<0||s.timerFrame>=60||!Number.isInteger(s.remaining)||s.remaining<0||s.remaining>10||frames<0||frames>216000)return;
  if(this.run&&(s.pid!==this.run.pid||course.id!==this.run.courseId||identity.id!==this.run.playerId||(this.last&&(s.frame<this.last.frame||frames<this.last.frames||s.remaining>this.last.remaining))))this.reset('Reset or changed run','aborted');
  if([4,7,8].includes(s.result)){this.reset('Run ended without a clear','aborted');return;}
  if(!this.run&&s.result===0&&s.remaining>0){const observedAt=this.now();this.run={id:randomUUID(),pid:s.pid,courseId:course.id,character:course.character,playerId:identity.id,startedAt:observedAt-frames*1000/60,observedAt,saved:false};this.onAttempt({...this.run,status:'active'});}
  if(!this.run)return;
  // Sample() already checks the native frame counter around its reads. Persist
  // the clear immediately; a quick Start+Z may leave no second results sample.
  // Submission still requires the closed replay with the same clear and score.
  if(s.remaining===0&&s.result===6&&frames>0&&!this.run.saved){this.run.saved=true;this.onComplete({...this.run,status:'finished',frames,finishedAt:this.now()});}
  this.last={...s,frames};
 }
}
export class WorldCapture{
 constructor({root,course,client,pid,scoreCutoff=Date.parse(SCORE_SEASON_START)}){this.pid=pid;this.scoreCutoff=scoreCutoff;this.root=root;this.course=course;this.client=client;this.directory=join(root,'.local/world-runs');this.busy=false;this.saves=new Map();this.pendingSaves=new Map();this.replayCache=new Map();this.lastError=null;this.detector=new WorldRunDetector(course.courses||[],run=>this.record(run),Date.now,run=>this.record(run));}
 record(run){this.pendingSaves.set(run.id,run);return this.save(run).then(()=>{if(this.pendingSaves.get(run.id)===run)this.pendingSaves.delete(run.id);if(!this.pendingSaves.size)this.lastError=null;}).catch(e=>{this.lastError='Run could not be saved: '+e.message;});}
 async save(run){
  const snapshot={...run},previous=this.saves.get(run.id)||Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{await mkdir(this.directory,{recursive:true});const path=join(this.directory,run.id+'.json');const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(snapshot),{mode:0o600});await rename(temp,path);});
  this.saves.set(run.id,next);try{await next;}finally{if(this.saves.get(run.id)===next)this.saves.delete(run.id);}
 }
 async heartbeat(running=true){
  await Promise.all([...this.pendingSaves.values()].map(run=>this.record(run)));
  const path=join(this.root,'.local/world-capture.json'),temp=path+'.'+randomUUID()+'.tmp';await mkdir(join(this.root,'.local'),{recursive:true});
  await writeFile(temp,JSON.stringify({running,pid:this.pid,id:this.detector.run?.saved?null:this.detector.run?.id,at:Date.now(),elapsedFrames:this.detector.last?.frames||0,error:this.lastError}));await rename(temp,path);
 }
 async close(){this.detector.reset('Dolphin closed','interrupted');await Promise.allSettled([...this.saves.values()]);await this.heartbeat(false);await this.sync();}
 async sync({retryId}={}){
  if(this.busy||!this.client.identity)return;this.busy=true;
  try{
   await Promise.all([...this.saves.values()]);
   const files=await readdir(this.directory).catch(e=>{if(e.code==='ENOENT')return [];throw e;}),records=[];
   for(const file of files.filter(n=>/^[a-f0-9-]+\.json$/.test(n))){
    try{
     const r=JSON.parse(await readFile(join(this.directory,file),'utf8'));
     if(!r||typeof r!=='object'||file!==r.id+'.json'||!Number.isFinite(r.startedAt)||r.startedAt<this.scoreCutoff)continue;
     records.push(r);
    }catch(e){if(e instanceof SyntaxError||e.code==='ENOENT')continue;throw e;}
   }
   // Check every owner's records when matching. An old submitted run, another
   // account, or a temporarily throttled upload must not donate its replay.
   let pulse={};try{pulse=JSON.parse(await readFile(join(this.root,'.local/world-capture.json'),'utf8'));}catch{}
   const captureRunning=Date.now()-pulse.at<10000&&pulse.running!==false;
   const liveId=captureRunning?pulse.id:null;
   const runs=records.filter(r=>!r.submitted&&r.playerId===this.client.identity.id&&
    (!r.excluded||(r.excluded==='Different game settings'&&(r.rulesValidationVersion||0)<WORLD_RULES_VALIDATION_VERSION))&&
    (!r.lastError||r.id===retryId||Date.now()-(r.lastAttemptAt||0)>30000)&&
    r.id!==liveId&&!(r.status==='active'&&captureRunning)&&!(this.detector.run?.id===r.id&&!this.detector.run.saved));
   if(!runs.length)return;
   const dir=join(this.root,'Replays'),replays=[];
   const names=await readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
   const present=new Set(names);for(const name of this.replayCache.keys())if(!present.has(name))this.replayCache.delete(name);
   for(const name of names.filter(n=>n.toLowerCase().endsWith('.slp'))){
    try{
     const path=join(dir,name),info=await stat(path);if(!info.isFile()||info.size>MAX_REPLAY_BYTES)continue;
     let cached=this.replayCache.get(name);
     if(!cached||cached.size!==info.size||cached.mtime!==info.mtimeMs){
      cached={size:info.size,mtime:info.mtimeMs,value:null};
      this.replayCache.set(name,cached);
      const bytes=await readFile(path),game=new SlippiGame(bytes),settings=game.getSettings(),ended=game.getGameEnd();
      if(!ended||ended.gameEndMethod!==6||!settings)continue;
      const start=Date.parse(game.getMetadata()?.startAt);if(!Number.isFinite(start))continue;
      const character=WORLD_CHARACTERS.find(c=>settings.players.some(p=>p.characterId===c.externalId||(c.externalId===14&&p.characterId===32)))?.id;
      const details=inspectReplay(bytes,{character:character==='sheik'?'zelda':character,stage:character},'');
      // Keep small metadata only. Re-reading and parsing the entire replay
      // archive every tick can itself delay live RAM samples on the JS thread.
      cached.value={path,start,character,details,rulesSha256:worldRulesHash(Buffer.from(game.getGeckoList()?.contents||[]))};
     }
     if(cached.value)replays.push(cached.value);
    }catch(e){
     // Sharing violations / transient reads must retry even without a size
     // change. Incomplete parsed files retry when Dolphin writes more bytes.
     if(e.code)this.replayCache.delete(name);
    }
   }
   const matches=matchWorldReplays(records,replays,this.course.courses||[]);
   for(const run of runs){
    const replay=matches.get(run.id);if(!replay)continue;
    const course=this.course.courses.find(c=>c.id===run.courseId);
    const recovering=run.status&&run.status!=='finished';
    // A replay can repair a missed finish, but cannot establish ownership of an
    // entirely unobserved run or substitute a different level/rules revision.
    if(recovering&&replay.rulesSha256!==course?.rulesSha256)continue;
    run.replaySha256=replay.details.sha256;run.replayName=replay.path.slice(dir.length+1);
    if(recovering){run.status='finished';run.frames=replay.details.lastFrame;run.finishedAt=replay.start+(run.frames+124)*1000/60;run.recoveredFromReplay=true;delete run.reason;}
    run.rulesValidationVersion=WORLD_RULES_VALIDATION_VERSION;
    if(replay.details.pauseFrames>0){run.excluded='Paused run';await this.save(run);continue;}
    if(replay.rulesSha256!==course?.rulesSha256){run.excluded='Different game settings';await this.save(run);continue;}
    delete run.excluded;
    // Link the replay durably before any network wait or app shutdown.
    await this.save(run);
    if(this.client.identity?.id!==run.playerId)continue;
    try{
     const bytes=await readFile(replay.path);if(sha256(bytes)!==run.replaySha256)continue;
     if(this.client.identity?.id!==run.playerId)continue;
     await this.client.request('worlds/submit',{method:'POST',authenticated:true,body:{id:run.id,courseId:run.courseId,frames:run.frames,replay:bytes.toString('base64')}});
     this.client.boardCache?.clear();run.submitted=true;delete run.lastError;
    }catch(e){run.lastError=e.message;run.lastAttemptAt=Date.now();}
    await this.save(run);
   }
  }finally{this.busy=false;}
 }
}

// Both directions must be unique. Timestamp proximity alone is insufficient
// for quick resets: the recorded frame count disambiguates completed attempts.
export function matchWorldReplays(records,replays,courses){
 const unique=[...new Map(replays.map(r=>[r.details.sha256,r])).values()];
 const candidates=records.map(run=>({run,matches:unique.filter(replay=>{
  const course=courses.find(c=>c.id===run.courseId);
  if(!course||replay.character!==run.character||replay.details.stageId!==course.stageId||Math.abs(replay.start-run.startedAt)>3000)return false;
  if(run.replaySha256)return run.replaySha256===replay.details.sha256;
  if(!run.status||run.status==='finished')return run.frames===replay.details.lastFrame;
  return ['active','aborted','interrupted'].includes(run.status)&&replay.details.lastFrame>0;
 })}));
 const result=new Map();
 for(const c of candidates){
  if(c.matches.length!==1)continue;
  const replay=c.matches[0];
  if(candidates.filter(other=>other.matches.includes(replay)).length===1)result.set(c.run.id,replay);
 }
 return result;
}
