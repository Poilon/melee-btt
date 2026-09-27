import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHostedHandler} from '../cloud/challenges.mjs';
import {generateChallenge} from '../src/challenge.mjs';
import {OnlineChallenge,verifyChallengePackage,saveChallengePackage} from '../server/online-challenge.mjs';
import {loadChallenge} from '../server/challenge-loader.mjs';
const fallback=await generateChallenge({seed:20260990,moving:true});
function fixture(){
 const rows=new Map(),versions=new Map();
 const store={
  async get(p){return structuredClone(rows.get(p)??null);},
  async put(p,v,overwrite=false){if(rows.has(p)&&!overwrite)throw Error('Exists');rows.set(p,structuredClone(v));versions.set(p,(versions.get(p)||0)+1);},
  async readVersion(p){return rows.has(p)?{value:await this.get(p),etag:versions.get(p)}:null;},
  async writeVersion(p,v,etag){if(versions.get(p)!==etag)return false;await this.put(p,v,true);return true;},
  async list(prefix){return [...rows.keys()].filter(p=>p.startsWith(prefix)).map(pathname=>({pathname}));},async delete(p){rows.delete(p);},
 };
 const id='a'.repeat(64),token='b'.repeat(64),origin='https://test.vercel.app';
 rows.set(`sessions/${createHash('sha256').update(token).digest('hex')}.json`,{id,provider:'password',expires:Date.now()+60000});rows.set(`roles/${id}.json`,{role:'admin'});
 const handler=createHostedHandler({store,fallback,generate:generateChallenge,origin,secret:'test-only'});
 async function request(path,{method='GET',body,admin=false}={}){
  const result={};const res={setHeader(){},writeHead(status){result.status=status;},end(text){result.body=JSON.parse(text);}};
  await handler({url:'/api/'+path,method,body,headers:{origin,...(admin?{cookie:`ttrc_session=${token}`}:{})}},res);return result;
 }
 return {request,store,rows};
}
test('only an admin can replace a closed seed; archives survive and old seeds cannot be reopened',async()=>{
 const {request,rows}=fixture();const challengeId=fallback.manifest.id;
 const publish=seed=>request('review/generate',{method:'POST',admin:true,body:{challengeId,seed,confirm:'NEW CHALLENGE'}});
 assert.equal((await request('review/generate',{method:'POST',body:{challengeId,confirm:'NEW CHALLENGE'}})).status,401);
 assert.equal((await publish(20261012)).status,409);
 await request('review/close',{method:'POST',admin:true,body:{challengeId,confirm:'REVEAL'}});
 for(const seed of [0,-1,1.5,'42',20260990])assert.equal((await publish(seed)).status,400);
 assert.equal((await request('review/generate',{method:'POST',admin:true,body:{challengeId,seed:20261012}})).status,400);
 const result=await publish(20261012);assert.equal(result.status,201);
 const next=result.body.challenge;assert.notEqual(next.id,challengeId);assert.equal(next.rules.moving,true);assert.equal(Object.keys(next.assignments).length,25);
 assert.equal((await request('challenge/current')).body.manifest.id,next.id);
 const board=await request('dashboard');assert.equal(board.body.challenge.id,next.id);assert.equal(board.body.competition.phase,'open');assert.equal(board.body.competition.endsAt,null);
 const archive=await request('dashboard?challenge='+challengeId);assert.equal(archive.body.challenge.id,challengeId);assert.equal(archive.body.competition.phase,'closed');
 assert.equal((await request('challenge/package?challenge='+challengeId)).body.gecko,fallback.gecko);
 assert.equal((await request('challenges')).body.challenges.length,2);
 assert.equal((await publish(20261013)).status,409);
 assert.ok(rows.has(`challenges/${challengeId}/closed.json`));
});
test('concurrent generation activates only one new seed',async()=>{
 const {request}=fixture(),challengeId=fallback.manifest.id;
 await request('review/close',{method:'POST',admin:true,body:{challengeId,confirm:'REVEAL'}});
 const results=await Promise.all([20261012,20261013].map(seed=>request('review/generate',{method:'POST',admin:true,body:{challengeId,seed,confirm:'NEW CHALLENGE'}})));
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 assert.equal((await request('challenges')).body.challenges.length,2);
 assert.equal((await request('challenge/current')).body.manifest.id,results.find(r=>r.status===201).body.challenge.id);
});
test('personal challenge archives contain only participated, revealed challenges with final standings and dates',async()=>{
 const {request,store}=fixture(),challengeId=fallback.manifest.id,playerId='a'.repeat(64),otherId='c'.repeat(64);
 const record=(id,playerId,character,frames)=>({id,playerId,displayName:playerId==='a'.repeat(64)?'Player':'Other',connectCode:'TT#1',character,stage:fallback.manifest.assignments[character],frames,createdAt:'2026-09-26T15:00:00.000Z'});
 await store.put(`submissions/${challengeId}/${playerId}/one.json`,record('one',playerId,'fox',600));
 await store.put(`submissions/${challengeId}/${otherId}/two.json`,record('two',otherId,'fox',700));
 assert.equal((await request('challenges/mine')).status,401);
 assert.deepEqual((await request('challenges/mine',{admin:true})).body.challenges,[],'open challenge stays out of archives');
 await request('review/close',{method:'POST',admin:true,body:{challengeId,confirm:'REVEAL'}});
 let archives=(await request('challenges/mine',{admin:true})).body.challenges;
 assert.equal(archives.length,1,'closed current challenge is already archived');
 assert.equal(archives[0].you.playerId,playerId);assert.equal(archives[0].you.rank,1);assert.equal(archives[0].you.totalPoints,10);assert.equal(archives[0].you.thsFrames,null);
 assert.equal(archives[0].leaderboard.length,2);assert.equal(archives[0].startedAt,null,'unknown legacy start dates are not invented');
 assert.ok(Number.isFinite(Date.parse(archives[0].endedAt)));
 const endedAt=archives[0].endedAt;
 const generated=await request('review/generate',{method:'POST',admin:true,body:{challengeId,seed:20261012,confirm:'NEW CHALLENGE'}});
 const next=generated.body.challenge;
 await store.put(`submissions/${next.id}/${otherId}/three.json`,record('three',otherId,'fox',700));
 await request('review/close',{method:'POST',admin:true,body:{challengeId:next.id,confirm:'REVEAL'}});
 archives=(await request('challenges/mine',{admin:true})).body.challenges;
 assert.equal(archives.length,1,'another player’s challenge is excluded');assert.equal(archives[0].endedAt,endedAt);
 await store.put(`submissions/${next.id}/${playerId}/four.json`,record('four',playerId,'fox',600));
 archives=(await request('challenges/mine',{admin:true})).body.challenges;
 assert.equal(archives.length,2);
 assert.equal(archives.find(c=>c.id===next.id).startedAt,generated.body.publishedAt);
 await store.put(`reviews/${next.id}/${playerId}/four.json`,{status:'rejected'});
 assert.equal((await request('challenges/mine',{admin:true})).body.challenges.length,1,'excluded runs do not qualify');
});
test('companion verifies online challenges, repairs interrupted writes and retains the bundled seed offline',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ttrc-online-'));
 try{
  const online=new OnlineChallenge('https://test.vercel.app','old-id',async()=>Response.json(fallback));
  await online.check();assert.equal(online.status().available,true);
  const verified=await online.prepare();assert.equal(verified.manifest.id,fallback.manifest.id);
  await saveChallengePackage(directory,verified);
  await writeFile(join(directory,'challenge.json'),'interrupted');
  const restored=await loadChallenge(directory,directory);assert.equal(restored.manifest.id,verified.manifest.id);
  assert.equal(JSON.parse(await readFile(join(directory,'challenge.json'),'utf8')).id,verified.manifest.id);
  await assert.rejects(verifyChallengePackage({...fallback,gecko:fallback.gecko+'04000000 00000000\n'}));
  await assert.rejects(verifyChallengePackage({...fallback,manifest:{...fallback.manifest,assignments:{}}}));
  const offline=new OnlineChallenge('https://test.vercel.app',verified.manifest.id,async()=>{throw Error('Offline');});await offline.check();assert.equal(offline.status().available,false);assert.match(offline.status().error,/local challenge/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
