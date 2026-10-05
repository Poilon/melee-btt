import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWorlds} from '../cloud/worlds.mjs';
import {worldCourseId,sha256} from '../shared/worlds.mjs';
import {SCORE_SEASON_START} from '../shared/score-season.mjs';
const challenge=JSON.parse(await readFile(new URL('../cloud/worlds-first-challenge.json',import.meta.url)));
test('first challenge pins 26 authored stages and exact Paris deadline',()=>{
 assert.equal(challenge.courses.length,26);assert.equal(new Set(challenge.courses.map(c=>c.character)).size,26);
 assert.equal(challenge.startsAt,SCORE_SEASON_START);
 assert.equal(Date.parse(challenge.endsAt),Date.parse('2026-12-31T23:59:59+01:00'));
 for(const course of challenge.courses)assert.equal(course.id,worldCourseId(course));
});
test('challenge excludes old and late runs, keeps pinned revisions and replays after catalog changes',async()=>{
 const course=challenge.courses[0],current={...course,stageSha256:'a'.repeat(64)};current.id=worldCourseId(current);
 const start=Date.parse(challenge.startsAt),end=Date.parse(challenge.endsAt),player='b'.repeat(64),bytes=Buffer.from('fixture replay');
 const data=new Map();
 const put=(n,courseId,frames,createdAt,startedAt=createdAt)=>{
  const id=`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`,key=`${courseId}/${player}/${id}.json`;
  data.set('worlds/records/'+key,{id,courseId,playerId:player,username:'player',frames,createdAt:new Date(createdAt).toISOString(),startedAt:new Date(startedAt).toISOString(),replay:{sha256:sha256(bytes)}});
  data.set('worlds/replays/'+key,{base64:bytes.toString('base64')});return id;
 };
 put(1,course.id,50,start-1000);const accepted=put(2,course.id,100,start+10000);put(3,course.id,1,end);const late=put(4,course.id,2,end+1000);put(5,course.id,3,start+20000,start-1000);put(6,current.id,4,start+10000);
 const handler=createWorlds({catalog:{format:'ttrc-worlds-v1',courses:[current]},challenges:[challenge],now:()=>end+2000,bearer:async()=>null,store:{async list(prefix){return [...data.keys()].filter(k=>k.startsWith(prefix)).map(pathname=>({pathname}));},async get(k){return data.get(k);}},json:(r,s,d)=>{r.status=s;r.data=d;}});
 async function request(path){const res={writeHead(status){this.status=status;},end(bytes){this.bytes=bytes;}},url=new URL('https://test/api/worlds/'+path);await handler(url.pathname.slice(5),{method:'GET',headers:{}},res,url);return res;}
 assert.equal((await request('catalog?event=first-challenge')).data.challenge.phase,'closed');
 assert.equal((await request('catalog?event=first-challenge')).data.courses[0].id,course.id);
 const board=(await request(`leaderboard?event=first-challenge&course=${course.id}`)).data;
 assert.equal(board.rows.length,1);assert.equal(board.rows[0].frames,100);
 assert.equal((await request(`leaderboard?course=${current.id}`)).data.rows[0].frames,4);
 const total=(await request('total?event=first-challenge')).data;assert.equal(total.requiredCharacters,26);assert.equal(total.rows.length,0);assert.equal(total.inProgress[0].completed,1);
 assert.equal((await request(`replay?event=first-challenge&course=${course.id}&player=${player}&id=${accepted}`)).status,200);
 assert.equal((await request(`replay?event=first-challenge&course=${course.id}&player=${player}&id=${late}`)).status,404);
 assert.equal((await request('catalog?event=unknown')).status,404);
});
