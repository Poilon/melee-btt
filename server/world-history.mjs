// Companion projection of the authored-stage recorder. Never writes old seed scores.
import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {WORLD_CHARACTERS,isHash,sha256} from '../shared/worlds.mjs';
import {SCORE_SEASON_START} from '../shared/score-season.mjs';
import {MAX_REPLAY_BYTES} from '../shared/replay.mjs';
import {WorldsClient} from '../desktop/worlds-online.mjs';
import {WorldCapture} from '../desktop/worlds-capture.mjs';
import {createWorldPlayback} from '../desktop/worlds-playback.mjs';
import {ReplayError} from './replays.mjs';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const counts=()=>({total:0,finished:0,aborted:0,interrupted:0,active:0});
export class WorldHistory{
 constructor({root,bundle=join(root,'.local/custom-stages/character-worlds/Dolphin'),openReplay,fetcher=fetch,now=Date.now,cutoff=Date.parse(SCORE_SEASON_START)}){Object.assign(this,{root,bundle,openReplay,fetcher,now,cutoff});this.replayCache=new Map();}
 async context(){
  let text;try{text=await readFile(join(this.bundle,'course.json'),'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(text!==this.contextText){
   const course={...JSON.parse(text),accountFile:join(this.root,'.local/account.json')};
   const client=new WorldsClient({root:this.bundle,course,fetcher:this.fetcher});
   this.current={course,client,capture:new WorldCapture({root:this.bundle,course,client}),play:this.openReplay||createWorldPlayback(this.bundle,course,0)};this.contextText=text;
  }
  return this.current;
 }
 async replayIndex(){
  const directory=join(this.bundle,'Replays'),index=new Map(),names=await readdir(directory).catch(()=>[]),present=new Set(names);
  for(const name of this.replayCache.keys())if(!present.has(name))this.replayCache.delete(name);
  for(const name of names.filter(n=>n.toLowerCase().endsWith('.slp'))){
   try{
    const path=join(directory,name),info=await stat(path);if(!info.isFile()||info.size>MAX_REPLAY_BYTES)continue;
    let cached=this.replayCache.get(name);
    if(!cached||cached.size!==info.size||cached.mtime!==info.mtimeMs){cached={size:info.size,mtime:info.mtimeMs,digest:sha256(await readFile(path))};this.replayCache.set(name,cached);}
    index.set(cached.digest,path);
   }catch{/* Recording still flushing or was removed. */}
  }
  return index;
 }
 async records(playerId){
  const context=await this.context();if(!isHash(playerId)||!context)return [];
  const directory=join(this.bundle,'.local/world-runs'),names=await readdir(directory).catch(()=>[]),rows=[];
  let pulse={};try{pulse=JSON.parse(await readFile(join(this.bundle,'.local/world-capture.json'),'utf8'));}catch{}
  const courses=new Map((context.course.courses||[]).map(c=>[c.id,c]));
  for(const name of names){
   if(!name.endsWith('.json')||!uuid.test(name.slice(0,-5)))continue;
   try{
    const run=JSON.parse(await readFile(join(directory,name),'utf8'));
    if(run.id!==name.slice(0,-5)||run.playerId!==playerId||!Number.isFinite(run.startedAt)||run.startedAt<this.cutoff||courses.get(run.courseId)?.character!==run.character)continue;
    let status=run.status||'finished';if(!['finished','active','aborted','interrupted'].includes(status))continue;
    if(status==='finished'&&(!Number.isInteger(run.frames)||run.frames<1||run.frames>216000))continue;
    const live=pulse.id===run.id&&this.now()-pulse.at<10000;
    if(status==='active'&&!live&&this.now()-run.startedAt>10000)status='interrupted';
    rows.push({id:run.id,courseId:run.courseId,character:run.character,stage:run.character,frames:status==='finished'?run.frames:null,createdAt:new Date(run.finishedAt||run.startedAt).toISOString(),attemptStatus:status,elapsedFrames:live?pulse.elapsedFrames:run.elapsedFrames||0,abortReason:run.reason||(status==='interrupted'?'Game stopped before the result was captured':''),submissionStatus:run.submitted?'submitted':run.lastError?'upload-error':'local',reviewNote:run.lastError||'',exclusionReason:run.excluded||null,replaySha256:run.replaySha256,source:'worlds'});
   }catch{/* One partial or corrupt file must not hide other records. */}
  }
  const index=await this.replayIndex();
  return rows.map(r=>({...r,hasReplay:Boolean(index.has(r.replaySha256))})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
 }
 async snapshot(playerId,character='fox'){
  const rows=await this.records(playerId),attempts={...counts(),byCharacter:{}},bestRuns=[];
  for(const r of rows){const c=attempts.byCharacter[r.character]??=counts();c.total++;c[r.attemptStatus]++;attempts.total++;attempts[r.attemptStatus]++;}
  for(const character of WORLD_CHARACTERS){
   const group=rows.filter(r=>r.character===character.id);if(!group.length)continue;
   const clears=group.filter(r=>r.attemptStatus==='finished'),valid=clears.filter(r=>!r.exclusionReason).sort((a,b)=>a.frames-b.frames||a.createdAt.localeCompare(b.createdAt));
   const best=valid[0]||clears[0]||group[0];bestRuns.push({...best,attemptCount:group.length,finishedCount:clears.length});
  }
  let pulse={};try{pulse=JSON.parse(await readFile(join(this.bundle,'.local/world-capture.json'),'utf8'));}catch{}
  const running=pulse.running!==false&&this.now()-pulse.at<10000;
  const progress=Object.fromEntries(bestRuns.filter(r=>r.attemptStatus==='finished'&&!r.exclusionReason).map(r=>[r.character,{runs:r.finishedCount,best:r.frames}]));
  return {scope:'worlds',totalCharacters:26,progress,personalBest:progress[character]?{frames:progress[character].best}:null,worldCapture:{status:running?'connected':'waiting',dolphinRunning:running,error:pulse.error||null},history:rows.filter(r=>r.attemptStatus==='finished'),bestRuns,attempts,stats:{completions:attempts.finished,players:rows.length?1:0,characters:bestRuns.length}};
 }
 async history(playerId,character,offset=0){return (await this.records(playerId)).filter(r=>r.character===character).slice(offset,offset+50);}
 async launch(id,playerId){
  const run=(await this.records(playerId)).find(r=>r.id===id);if(!run)throw new ReplayError('Run not found for this account and level version.');
  const path=(await this.replayIndex()).get(run.replaySha256);if(!path)throw new ReplayError('The matching replay is not available yet. Exit the results screen and wait a moment.');
  if(sha256(await readFile(path))!==run.replaySha256)throw new ReplayError('Replay changed. Refresh the history.');
  const ctx=await this.context();await ctx.play(path,ctx.course.courses.find(c=>c.id===run.courseId));return {status:'started'};
 }
 async sync(retryId){const ctx=await this.context();if(!ctx)return;await ctx.client.load();await ctx.capture.sync({retryId});}
 async retry(id,playerId){
  const run=(await this.records(playerId)).find(r=>r.id===id);if(!run||run.attemptStatus!=='finished')throw new ReplayError('Finished run not found for this account.');
  if(run.exclusionReason)throw new ReplayError(run.exclusionReason);
  const ctx=await this.context();await ctx.client.load();if(ctx.client.identity?.id!==playerId)throw new ReplayError('Account changed. Refresh the companion.');
  await ctx.capture.sync({retryId:id});return {ok:true};
 }
}
