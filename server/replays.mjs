import { readdir, lstat, readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { inspectReplay, MAX_REPLAY_BYTES } from '../shared/replay.mjs';
const require = createRequire(import.meta.url);
const { SlippiGame } = require('@slippi/slippi-js');
const characterIds = {22:'dr-mario',8:'mario',7:'luigi',5:'bowser',12:'peach',17:'yoshi',1:'donkey-kong',0:'captain-falcon',25:'ganondorf',20:'falco',2:'fox',11:'ness',14:'ice-climbers',32:'ice-climbers',4:'kirby',16:'samus',18:'zelda',6:'link',21:'young-link',24:'pichu',13:'pikachu',15:'jigglypuff',10:'mewtwo',3:'game-and-watch',9:'marth',23:'roy'};
const hash = value => createHash('sha256').update(value).digest('hex');
export class ReplayError extends Error {}
export class ReplayLibrary {
  constructor({directory, cacheDirectory, challenge, gecko, run}) {
    this.directory=directory;this.cacheDirectory=cacheDirectory;this.challenge=challenge;this.gecko=gecko;this.run=run;this.cache=new Map();
  }
  inspect(bytes) {
    try {
      if(!Buffer.isBuffer(bytes)||bytes.length>MAX_REPLAY_BYTES)throw new Error();
      const game=new SlippiGame(bytes);
      const settings=game.getSettings();
      const character=characterIds[settings?.players?.[0]?.characterId];
      if(!character)throw new Error();
      const stage=this.challenge.assignments[character];
      const details=inspectReplay(bytes,{character,stage},this.gecko);
      return {character,stage,stageId:settings.stageId,sha256:details.sha256,startedAt:game.getMetadata()?.startAt||null,lastFrame:details.lastFrame,endMethod:details.gameEndMethod,pauseFrames:details.pauseFrames};
    } catch {throw new ReplayError('Choose a complete Target Test .slp for this challenge (up to 2 MB).');}
  }
  async list() {
    const directory=this.directory();if(!directory)return [];
    let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}
    const files=await Promise.all(entries.filter(e=>e.isFile()&&/\.slp$/i.test(e.name)).map(async e=>({name:e.name,info:await lstat(join(directory,e.name))})));
    const result=[];
    for(const {name,info} of files.sort((a,b)=>b.info.mtimeMs-a.info.mtimeMs).slice(0,50)) {
      const id=hash(directory+'\0'+name),stamp=`${info.mtimeMs}:${info.size}`;
      let row=this.cache.get(id);
      if(row?.stamp!==stamp){
        let meta, error;
        try { if(info.size>MAX_REPLAY_BYTES||!info.isFile())throw new ReplayError('Replay exceeds the 2 MB limit.');meta=this.inspect(await readFile(join(directory,name))); }
        catch(e){error=e instanceof ReplayError?e.message:'Replay is still being recorded. Exit the results screen first.';}
        row={id,name,createdAt:info.mtime.toISOString(),bytes:info.size,ready:Boolean(meta),...meta,error,stamp};this.cache.set(id,row);
      }
      const {stamp:_,...publicRow}=row;result.push(publicRow);
    }
    return result;
  }
  async syncRuns(store) {
    if(this.syncing)return;this.syncing=true;
    try {
      const used=store.linkedReplayHashes();
      const replays=(await this.list()).filter(r=>!used.has(r.sha256));
      const matches=matchRunReplays(store.unlinkedRuns(this.challenge.id),replays);
      for(const {run,replay} of matches){
        try {
          const path=join(this.directory(),replay.name);
          if(!(await lstat(path)).isFile())continue;
          const saved=await this.remember(await readFile(path));
          if(saved.sha256===replay.sha256&&!store.replay(run.id)){
            store.attachReplay(run.id,saved.sha256,replay.name);
            if(saved.pauseFrames>0)store.exclude(run.id,'Paused during the run. Excluded from records and submissions.');
          }
        }catch { /* A file still being finalized will be retried on the next pass. */ }
      }
    }finally{this.syncing=false;}
  }
  async launch(id) {
    if(!/^[a-f0-9]{64}$/.test(id||''))throw new ReplayError('Replay not found.');
    const row=(await this.list()).find(r=>r.id===id);
    if(!row)throw new ReplayError('Replay not found.');
    const path=join(this.directory(),row.name);
    if(!(await lstat(path)).isFile())throw new ReplayError('Replay not found.');
    // Launch a private snapshot so Dolphin never reads a file still being written.
    return this.launchBytes(await readFile(path));
  }
  async remember(bytes) {
    const meta=this.inspect(bytes);
    await mkdir(this.cacheDirectory,{recursive:true});
    const path=join(this.cacheDirectory,meta.sha256+'.slp');
    // Same-content writes are atomic; a unique temp file supports concurrent callers.
    const temporary=path+'.'+randomUUID()+'.tmp';
    await writeFile(temporary,bytes,{mode:0o600});await rename(temporary,path);
    return {...meta,path};
  }
  async savedBytes(sha256) {
    if(!/^[a-f0-9]{64}$/.test(sha256||''))throw new ReplayError('No replay linked to this run.');
    let bytes;
    try{bytes=await readFile(join(this.cacheDirectory,sha256+'.slp'));}catch{throw new ReplayError('Saved replay is missing. Attach the .slp again.');}
    if(hash(bytes)!==sha256)throw new ReplayError('Saved replay changed. Attach the original .slp again.');
    return bytes;
  }
  async launchSaved(sha256) { return this.launchBytes(await this.savedBytes(sha256)); }
  async launchBytes(bytes) {
    if(this.busy)throw new ReplayError('A replay is already opening. Please wait.');
    this.busy=true;
    try {
      const meta=await this.remember(bytes);
      try { await this.run(meta.path,meta.stageId); }catch {throw new ReplayError('Could not open Slippi Playback. Check that Playback Dolphin and the Melee ISO are available.');}
      return {status:'started'};
    }finally{this.busy=false;}
  }
}

// Correlate character/course and the captured attempt's wall-clock start.
// Replay frame IDs and the in-game timer are different counters; association
// never substitutes a replay frame ID for the captured score.
// Ties are deliberately left unresolved; a same-character replay is not enough.
export function matchRunReplays(runs, replays) {
  replays=[...new Map(replays.map(r=>[r.sha256,r])).values()];
  const candidates=runs.map(run=>({run,matches:replays.filter(replay=>{
    if(!replay.ready||!Number.isInteger(replay.lastFrame)||replay.endMethod!==6||replay.character!==run.character||replay.stage!==run.stage)return false;
    const start=Date.parse(replay.startedAt);if(!Number.isFinite(start))return false;
    if(run.startedAt)return Math.abs(start-Date.parse(run.startedAt))<=3000;
    // Keep the stricter fallback only for legacy attempts with no start timestamp.
    if(Math.abs(replay.lastFrame-run.frames)>1)return false;
    // Legacy records lack a captured start. Slippi begins at frame -123; allow
    // clock precision/polling delay but never match a recording from another day.
    const end=start+(replay.lastFrame+124)*1000/60;
    return Math.abs(Date.parse(run.createdAt)-end)<=3000;
  })}));
  return candidates.filter(c=>c.matches.length===1&&candidates.filter(other=>other.matches.some(r=>r.sha256===c.matches[0].sha256)).length===1)
    .map(c=>({run:c.run,replay:c.matches[0]}));
}
