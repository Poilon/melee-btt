import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
// Use the SDK's explicit CJS build: its .esm.js files have no package type and
// serverless loaders do not all apply Node's local syntax detection.
const require = createRequire(import.meta.url);
const { SlippiGame, GameMode, Stage } = require('@slippi/slippi-js');

export const MAX_REPLAY_BYTES = 2 * 1024 * 1024;
const enumName = value => value.replaceAll('-', '_').toUpperCase();
export function inspectReplay(bytes, run, gecko) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 16 || bytes.length > MAX_REPLAY_BYTES) throw new Error('Replay must be a .slp file under 2 MB.');
  // UBJSON object containing the typed raw event array. Reject arbitrary renamed files.
  if (!bytes.subarray(0, 11).equals(Buffer.from([0x7b,0x55,3,0x72,0x61,0x77,0x5b,0x24,0x55,0x23,0x6c]))) throw new Error('Not a Slippi replay.');
  const rawLength = bytes.readUInt32BE(11);
  if (!rawLength || 15 + rawLength > bytes.length) throw new Error('Replay is incomplete. Stop recording before submitting.');
  const game = new SlippiGame(bytes);
  const settings = game.getSettings();
  if (settings?.gameMode !== GameMode.TARGET_TEST) throw new Error('This replay is not a Target Test run.');
  const characterIds = { 'dr-mario': 22, mario:8, luigi:7, bowser:5, peach:12, yoshi:17, 'donkey-kong':1, 'captain-falcon':0, ganondorf:25, falco:20, fox:2, ness:11, 'ice-climbers':14, kirby:4, samus:16, zelda:18, link:6, 'young-link':21, pichu:24, pikachu:13, jigglypuff:15, mewtwo:10, 'game-and-watch':3, marth:9, roy:23 };
  if (!settings.players.some(p => p.characterId === characterIds[run.character])) throw new Error('Replay character does not match this run.');
  const expectedStage = Stage[`TARGET_TEST_${enumName(run.stage)}`];
  const originalStage = Stage[`TARGET_TEST_${enumName(run.character)}`];
  if (![expectedStage, originalStage].filter(Number.isInteger).includes(settings.stageId)) throw new Error('Replay stage does not match this course.');
  const end = game.getGameEnd();
  const latest = game.getLatestFrame();
  if (!end || !latest || !Number.isInteger(latest.frame)) throw new Error('Replay has no complete game ending.');
  const list = game.getGeckoList();
  const expectedCode = Buffer.from(gecko.replace(/\s/g, ''), 'hex');
  const embeddedCodeMatches = Boolean(expectedCode.length && list?.contents && Buffer.from(list.contents).includes(expectedCode));
  return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    ...replayPauses(game.getFrames()),
    version: settings.slpVersion || null, stageId: settings.stageId, lastFrame: latest.frame,
    gameEndMethod: end.gameEndMethod, embeddedCodeMatches,
    // Structural checks are not proof of a clear, exact timing, ownership, or an unmodified game.
    requiresHumanReview: true };
}

// Slippi SPEC: sceneFrameCounter continues during pause; frame IDs do not.
// https://github.com/project-slippi/slippi-wiki/blob/master/SPEC.md#frame-start
export function replayPauses(frames) {
  const ordered=Object.values(frames).sort((a,b)=>a.frame-b.frame);
  let previous, pauseFrames=0, pauseDetectionAvailable=ordered.length>1;
  for(const frame of ordered){
    const counter=frame.start?.sceneFrameCounter;
    if(!Number.isInteger(counter)){pauseDetectionAvailable=false;previous=null;continue;}
    if(previous){const skipped=counter-previous.counter-(frame.frame-previous.frame);if(skipped>0)pauseFrames+=skipped;}
    previous={counter,frame:frame.frame};
  }
  return {pauseFrames,pauseDetectionAvailable};
}
