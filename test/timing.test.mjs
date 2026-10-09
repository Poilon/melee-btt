import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime } from '../web/time.js';
import { RunDetector } from '../server/telemetry.mjs';

test('displayed hundredths match Melee, including the observed 704-frame Fox clear', () => {
  for (const [frames, text] of [[0,'00:00.00'],[34,'00:00.57'],[59,'00:00.99'],[60,'00:01.00'],[704,'00:11.73'],[811,'00:13.52'],[839,'00:13.99'],[840,'00:14.00'],[1234,'00:20.57'],[3600,'01:00.00']]) assert.equal(formatTime(frames), text);
});

test('observed Fox result is saved only after a fresh attempt with a player', () => {
  const challenge = { id: 'a'.repeat(64), rules: { targets: 10 }, assignments: { fox: 'samus' } };
  const identity = { id: 'b'.repeat(64), displayName: 'Fixture', connectCode: 'TT#12345' };
  const runs = []; const detector = new RunDetector(challenge, r => runs.push(r));
  const initial = { pid: 33860, major: 15, minor: 1, frame: 124, characterId: 2, stageId: 59, remaining: 10, result: 0, seconds: 0, timerFrame: 0 };
  const finish = { ...initial, frame: 828, remaining: 0, result: 6, seconds: 11, timerFrame: 44 };
  detector.sample(finish, identity); detector.sample(finish, identity); assert.equal(runs.length, 0);
  detector.sample(initial, null); detector.sample(finish, null); detector.sample(finish, null); assert.equal(runs.length, 0);
  detector.sample(initial, identity); detector.sample(finish, identity); detector.sample(finish, identity);
  assert.equal(runs.length, 1); assert.equal(runs[0].frames, 704);
  detector.sample({ ...finish, minor: 0 }, identity); assert.equal(runs.length, 1);
});

test('Zelda and Sheik count as one course and transforming does not discard a clear',()=>{
 const challenge={id:'a'.repeat(64),rules:{targets:10},assignments:{zelda:'fox'}};
 const identity={id:'b'.repeat(64),displayName:'Fixture',connectCode:'TT#1'};
 for(const [start,finish] of [[19,19],[18,19],[19,18]]){
  const saved=[],detector=new RunDetector(challenge,run=>saved.push(run));
  const initial={pid:1,major:15,minor:1,frame:124,characterId:start,stageId:46,remaining:10,result:0,seconds:0,timerFrame:0};
  detector.sample(initial,identity);
  const end={...initial,frame:1200,characterId:finish,remaining:0,result:6,seconds:17,timerFrame:5};
  detector.sample(end,identity);detector.sample(end,identity);
  assert.equal(saved.length,1);assert.equal(saved[0].character,'zelda');assert.equal(saved[0].stage,'fox');assert.equal(saved[0].frames,1025);
 }
});
