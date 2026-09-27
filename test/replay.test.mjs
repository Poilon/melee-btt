import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectReplay, MAX_REPLAY_BYTES } from '../shared/replay.mjs';
const replay = await readFile(new URL('./fixtures/BTTDK.slp', import.meta.url));
const run = { character: 'donkey-kong', stage: 'donkey-kong' };
test('real upstream Target Test replay parses, but still requires human verification', () => {
  const summary = inspectReplay(replay, run, '0400000000000000');
  assert.equal(summary.version, '3.9.1'); assert.equal(summary.stageId, 36);
  assert.equal(summary.lastFrame, 1066); assert.equal(summary.requiresHumanReview, true);
  assert.equal(summary.embeddedCodeMatches, false); assert.equal(summary.bytes, replay.length);
});
test('renamed files, truncated recordings, oversized replays and wrong courses fail', () => {
  for (const bytes of [Buffer.from('not a replay'), replay.subarray(0, 200), Buffer.alloc(MAX_REPLAY_BYTES + 1)]) {
    assert.throws(() => inspectReplay(bytes, run, ''));
  }
  assert.throws(() => inspectReplay(replay, { character: 'fox', stage: 'samus' }, ''), /character/);
});

test('scene counters detect paused frames without treating old replay formats as verified pause-free',async()=>{
  const {withPause}=await import('./support/replay-with-pause.mjs');
  assert.equal(inspectReplay(replay,run,'').pauseDetectionAvailable,false);
  const paused=inspectReplay(withPause(replay),run,'');assert.equal(paused.pauseDetectionAvailable,true);assert.equal(paused.pauseFrames,35);
  assert.equal(inspectReplay(withPause(replay,0),run,'').pauseFrames,0);
});
