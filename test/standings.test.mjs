import test from 'node:test';
import assert from 'node:assert/strict';
import {overallStandings,characterPoints,thsPoints} from '../shared/standings.mjs';
import {stages} from '../src/challenge.mjs';
const assignments=Object.fromEntries(stages.map(c=>[c,c]));
const record=(playerId,character,frames)=>({playerId,character,frames,displayName:playerId,connectCode:'TT#1',status:'submitted',current:true});
test('character and THS points follow the specified scales and never go negative',()=>{
 assert.deepEqual(Array.from({length:8},(_,i)=>characterPoints(i+1)),[10,7,5,3,1,0,0,0]);
 assert.deepEqual(Array.from({length:8},(_,i)=>thsPoints(i+1)),[15,12.5,10,7.5,5,2.5,0,0]);
 const runs=Array.from({length:8},(_,i)=>stages.map(c=>record(`p${i}`,c,600+i))).flat();
 const result=overallStandings(runs,assignments);
 assert.deepEqual(result.map(r=>r.totalPoints),[265,187.5,135,82.5,30,2.5,0,0]);
 assert.deepEqual(result.map(r=>r.thsRank),[1,2,3,4,5,6,7,8]);
 assert.equal(result[0].thsFrames,15000);assert.equal(result[0].completed,25);
});
test('THS requires every character; duplicates, rejected and replaced runs do not qualify',()=>{
 const runs=stages.slice(0,24).map(c=>record('partial',c,60));
 runs.push(record('partial',stages[0],70),{...record('partial',stages[24],60),status:'rejected'},{...record('partial',stages[24],50),current:false});
 const [p]=overallStandings(runs,assignments);assert.equal(p.completed,24);assert.equal(p.thsFrames,null);assert.equal(p.thsRank,null);assert.equal(p.thsPoints,0);assert.equal(p.characterPoints,240);
});
test('ties share competition places and points for characters, THS and the overall board',()=>{
 const runs=stages.flatMap(c=>[record('alice',c,600),record('bob',c,600),record('carol',c,650)]);
 const [a,b,c]=overallStandings(runs,assignments);
 assert.deepEqual([a.rank,b.rank,c.rank],[1,1,3]);assert.deepEqual([a.thsRank,b.thsRank,c.thsRank],[1,1,3]);
 assert.equal(a.totalPoints,265);assert.equal(b.totalPoints,265);assert.equal(c.totalPoints,135);
 assert.equal(c.courses[0].rank,3);assert.equal(c.courses[0].points,5);
});
