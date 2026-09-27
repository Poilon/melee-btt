import { randomUUID } from 'node:crypto';
import {characterForExternalId} from '../shared/characters.mjs';
import { stages } from '../src/challenge.mjs';

// Melee NTSC 1.02 external character IDs and INTERNAL ground IDs (not the
// external stage IDs used by the Gecko stage-selection table).
const groundIds = [44, 40, 51, 49, 55, 61, 43, 41, 65, 45, 46, 54, 47, 48, 59, 62, 50, 42, 56, 57, 58, 53, 63, 52, 64];
export const characterForId = characterForExternalId;
export const stageForId = id => stages[groundIds.indexOf(id)];

export class RunDetector {
  constructor(challenge, onComplete, now = Date.now, onAttempt = () => {}) { this.challenge = challenge; this.onComplete = onComplete; this.now = now; this.onAttempt=onAttempt; }
  reset(reason='Capture interrupted',status='interrupted') {
    if(this.run&&!this.run.saved)this.onAttempt({...this.run,status,reason,endedAt:new Date(this.now()).toISOString(),elapsedFrames:this.last?.frames||0});
    this.run = null; this.last = null; this.stableFinish = 0;
  }
  sample(s, identity) {
    const character = characterForId(s.characterId);
    const stage = stageForId(s.stageId);
    const inGame = s.major === 15 && s.minor === 1 && character && stage &&
      this.challenge.assignments[character] === stage;
    if (!inGame || !identity || !Number.isInteger(s.frame) || !Number.isInteger(s.remaining) ||
        s.remaining < 0 || s.remaining > this.challenge.rules.targets ||
        !Number.isInteger(s.seconds) || !Number.isInteger(s.timerFrame) ||
        s.seconds < 0 || s.seconds > 3600 || s.timerFrame < 0 || s.timerFrame >= 60) {
      this.reset(!inGame?'Left the course':'Capture interrupted',!inGame?'aborted':'interrupted'); return;
    }
    const frames = s.seconds * 60 + s.timerFrame;
    // New process, character, account, retry, or time reversal invalidates the old attempt.
    if (this.run && (s.pid !== this.run.pid || character !== this.run.character ||
        stage !== this.run.stage || identity.id !== this.run.identity.id ||
        (this.last && (s.frame < this.last.frame || frames < this.last.frames || s.remaining > this.last.remaining)))) {
      this.reset('Reset or changed run','aborted');
    }
    if ([4, 7, 8].includes(s.result)) { this.reset('Run ended without a clear','aborted'); return; }
    // Only arm after seeing a new attempt with all targets before/at timer start.
    // Attaching halfway through a run or on a stale results screen cannot save a score.
    if (!this.run && s.result === 0 && s.remaining === this.challenge.rules.targets && frames <= 6) {
      this.run = { id: randomUUID(), pid: s.pid, challenge:this.challenge, character, stage, identity: { ...identity }, startedAt: new Date(this.now()).toISOString(), saved: false };
      this.onAttempt({...this.run,status:'active'});
    }
    if (!this.run) return;
    if (s.remaining === 0 && s.result === 6 && frames > 0 && frames <= 216000) {
      // The final game timer must be frozen and observed twice, so a partially
      // read transition cannot become a record. No wall-clock timing is used.
      this.stableFinish = this.last?.remaining === 0 && this.last?.frames === frames ? this.stableFinish + 1 : 0;
      if (!this.run.saved && this.stableFinish >= 1) {
        this.run.saved = true;
        this.onComplete({ ...this.run, challenge: this.challenge, frames });
      }
    } else { this.stableFinish = 0; }
    this.last = { ...s, frames };
  }
}
