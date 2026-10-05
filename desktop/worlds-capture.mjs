import {readFile,writeFile,mkdir,readdir,rename,stat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {WORLD_CHARACTERS,sha256,worldRulesHash} from '../shared/worlds.mjs';
import {SCORE_SEASON_START} from '../shared/score-season.mjs';
import {inspectReplay,MAX_REPLAY_BYTES} from '../shared/replay.mjs';
const {SlippiGame}=createRequire(import.meta.url)('@slippi/slippi-js');
export class WorldRunDetector{
 constructor(courses,onComplete,now=Date.now){this.courses=courses;this.onComplete=onComplete;this.now=now;}
 reset(){this.run=null;this.last=null;this.stable=0;}
 sample(s,identity){
  const character=WORLD_CHARACTERS.find(c=>c.externalId===s.characterId||(c.externalId===14&&s.characterId===32));
  const course=this.courses.find(c=>c.character===character?.id&&c.stageId+7===s.stageId);
  const frames=s.seconds*60+s.timerFrame;
  if(s.major!==15||s.minor!==1||!course||!identity||!Number.isInteger(s.frame)||!Number.isInteger(s.seconds)||!Number.isInteger(s.timerFrame)||s.timerFrame<0||s.timerFrame>=60||!Number.isInteger(s.remaining)||s.remaining<0||s.remaining>10||frames<0||frames>216000){this.reset();return;}
  if(this.run&&(s.pid!==this.run.pid||course.id!==this.run.courseId||identity.id!==this.run.playerId||(this.last&&(s.frame<this.last.frame||frames<this.last.frames||s.remaining>this.last.remaining))))this.reset();
  if([4,7,8].includes(s.result)){this.reset();return;}
  if(!this.run&&s.result===0&&s.remaining===10&&frames<=6)this.run={id:randomUUID(),pid:s.pid,courseId:course.id,character:course.character,playerId:identity.id,startedAt:this.now(),saved:false};
  if(!this.run)return;
  if(s.remaining===0&&s.result===6&&frames>0){this.stable=this.last?.remaining===0&&this.last?.frames===frames?this.stable+1:0;if(!this.run.saved&&this.stable>=1){this.run.saved=true;this.onComplete({...this.run,frames,finishedAt:this.now()});}}else this.stable=0;
  this.last={...s,frames};
 }
}
export class WorldCapture{
 constructor({root,course,client,scoreCutoff=Date.parse(SCORE_SEASON_START)}){this.scoreCutoff=scoreCutoff;this.root=root;this.course=course;this.client=client;this.directory=join(root,'.local/world-runs');this.busy=false;this.detector=new WorldRunDetector(course.courses||[],run=>this.save(run).catch(()=>{}));}
 async save(run){await mkdir(this.directory,{recursive:true});const path=join(this.directory,run.id+'.json');const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(run),{mode:0o600});await rename(temp,path);}
 async sync(){
  if(this.busy||!this.client.identity)return;this.busy=true;
  try{
   const files=await readdir(this.directory).catch(()=>[]),runs=[];
   for(const file of files.filter(n=>/^[a-f0-9-]+\.json$/.test(n))){const r=JSON.parse(await readFile(join(this.directory,file),'utf8'));if(r.startedAt<this.scoreCutoff){await unlink(join(this.directory,file));continue;}if(!r.submitted&&(!r.excluded||(r.excluded==='Different game settings'&&r.rulesValidationVersion!==2))&&r.playerId===this.client.identity.id&&(!r.lastError||Date.now()-(r.lastAttemptAt||0)>30000))runs.push(r);}
   if(!runs.length)return;
   const dir=join(this.root,'Replays'),replays=[];
   const names=await readdir(dir).catch(()=>[]);
   for(const name of names.filter(n=>n.toLowerCase().endsWith('.slp'))){
    const path=join(dir,name),info=await stat(path);if(!info.isFile()||info.size>MAX_REPLAY_BYTES)continue;
    try{
     const bytes=await readFile(path),game=new SlippiGame(bytes),settings=game.getSettings(),ended=game.getGameEnd();
     if(!ended||ended.gameEndMethod!==6||!settings)continue;
     const start=Date.parse(game.getMetadata()?.startAt);if(!Number.isFinite(start))continue;
     const character=WORLD_CHARACTERS.find(c=>settings.players.some(p=>p.characterId===c.externalId||(c.externalId===14&&p.characterId===32)))?.id;
     if(!runs.some(r=>r.character===character&&Math.abs(r.startedAt-start)<=3000))continue;
     const details=inspectReplay(bytes,{character:character==='sheik'?'zelda':character,stage:character},'');
     replays.push({path,bytes,start,character,details,rulesSha256:worldRulesHash(Buffer.from(game.getGeckoList()?.contents||[]))});
    }catch{ /* Recording may still be flushing. Retry after it closes. */ }
   }
   for(const run of runs){
    const matches=replays.filter(r=>r.character===run.character&&Math.abs(r.start-run.startedAt)<=3000);
    if(matches.length!==1||runs.filter(r=>r.character===run.character&&Math.abs(matches[0].start-r.startedAt)<=3000).length!==1)continue;
    const replay=matches[0],course=this.course.courses.find(c=>c.id===run.courseId);
    if(replay.details.pauseFrames>0){run.excluded='Paused run';await this.save(run);continue;}
    if(replay.rulesSha256!==course?.rulesSha256){run.excluded='Different game settings';run.rulesValidationVersion=2;await this.save(run);continue;}
    delete run.excluded;
    // Identity is checked again after asynchronous disk reads; never upload another player's run.
    if(this.client.identity?.id!==run.playerId)continue;
    try{
     await this.client.request('worlds/submit',{method:'POST',authenticated:true,body:{id:run.id,courseId:run.courseId,frames:run.frames,replay:replay.bytes.toString('base64')}});
     this.client.boardCache?.clear();run.submitted=true;run.replaySha256=replay.details.sha256;delete run.lastError;
    }catch(e){run.lastError=e.message;run.lastAttemptAt=Date.now();}
    await this.save(run);
   }
  }finally{this.busy=false;}
 }
}
