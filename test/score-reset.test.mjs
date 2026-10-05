import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {ScoreStore} from '../server/store.mjs';import {clearOldScores} from '../server/score-reset.mjs';import {SCORE_SEASON_START} from '../shared/score-season.mjs';
test('season reset clears old scores and queues for every player, preserves new attempts and private files, and is repeatable',async()=>{
 const root=await mkdtemp(join(tmpdir(),'btt-score-reset-')),store=new ScoreStore(':memory:'),start=Date.parse(SCORE_SEASON_START);
 const put=async(name,value)=>{await mkdir(join(root,name,'..'),{recursive:true});await writeFile(join(root,name),value);};
 try{
  for(const [id,at,player]of [['old',start-1000,'one'],['other',start-2000,'two'],['fresh',start+1000,'one']]){
   const time=new Date(at).toISOString();store.db.prepare('INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,'challenge',player,player,'TEST#1','fox','fox',120,time,'test');
   store.db.prepare('INSERT INTO attempts VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,'challenge',player,'fox','fox',time,time,'finished',120,'');
   store.db.prepare('INSERT INTO run_capture VALUES (?,?)').run(id,time);store.attachReplay(id,'a'.repeat(64),'keep.slp');store.setSubmission(id,'queued');
   await put('.local/outbox/'+id+'.json',JSON.stringify({payload:{id}}));
  }
  for(const directory of ['.local/world-runs','.local/custom-stages/character-worlds/Dolphin/.local/world-runs']){
   await put(directory+'/aaaa.json',JSON.stringify({startedAt:start-1000}));await put(directory+'/bbbb.json',JSON.stringify({startedAt:start+1000}));
  }
  const protectedFiles=['.local/worlds-account.json','.local/companion.json','.local/play-settings.json','User/player.json','Replays/keep.slp','Games/Melee.iso'];
  for(const file of protectedFiles)await put(file,'keep');
  await clearOldScores(root,store);await clearOldScores(root,store);
  assert.deepEqual(store.db.prepare('SELECT id FROM runs').all().map(r=>r.id),['fresh']);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n,1);
  assert.ok(store.replay('fresh'));assert.equal(store.replay('old'),null);await assert.rejects(access(join(root,'.local/outbox/old.json')));
  await access(join(root,'.local/outbox/fresh.json'));
  for(const directory of ['.local/world-runs','.local/custom-stages/character-worlds/Dolphin/.local/world-runs']){await assert.rejects(access(join(root,directory+'/aaaa.json')));await access(join(root,directory+'/bbbb.json'));}
  for(const file of protectedFiles)assert.equal(await readFile(join(root,file),'utf8'),'keep');
 }finally{store.close();await rm(root,{recursive:true,force:true});}
});
