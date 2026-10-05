import {readdir,readFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {SCORE_SEASON_START} from '../shared/score-season.mjs';
// Runs and queued uploads only. Accounts, settings, ISO files and .slp evidence stay intact.
export async function clearOldScores(root,store){
 store.clearScoresBefore(SCORE_SEASON_START);
 const cutoff=Date.parse(SCORE_SEASON_START);
 async function files(directory){try{return await readdir(directory,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}}
 const outbox=join(root,'.local/outbox');
 for(const entry of await files(outbox)){
  if(!entry.isFile()||!entry.name.endsWith('.json'))continue;
  const path=join(outbox,entry.name);let event;try{event=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error instanceof SyntaxError)continue;throw error;}
  const run=store.db.prepare('SELECT id FROM runs WHERE id=?').get(event.payload?.id??'');
  if(!run)await unlink(path);
 }
 for(const directory of [join(root,'.local/world-runs'),join(root,'.local/custom-stages/character-worlds/Dolphin/.local/world-runs')]){
  for(const entry of await files(directory)){
   if(!entry.isFile()||!/^[a-f0-9-]+\.json$/.test(entry.name))continue;
   const path=join(directory,entry.name);let run;try{run=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error instanceof SyntaxError)continue;throw error;}
   if(Number.isFinite(run.startedAt)&&run.startedAt<cutoff)await unlink(path);
  }
 }
}
