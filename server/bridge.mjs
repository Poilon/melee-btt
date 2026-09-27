import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { characterForId, stageForId } from './telemetry.mjs';
import { verifyProfileCode } from './profile-code.mjs';
import { windowsPath } from './platform.mjs';

const exec = promisify(execFile);
export class DolphinBridge {
  constructor(root, challenge, detector, getIdentity) {
    this.root = root; this.challenge = challenge; this.detector = detector; this.getIdentity = getIdentity;
    this.state = { status: 'starting', experimental: true };
    this.profile = join(root, 'build/profiles', challenge.id);
  }
  status() {
    if (this.state.status === 'connected' && Date.now() - this.lastSampleAt > 5000) {
      return { status: 'waiting', experimental: true };
    }
    return this.state;
  }
  async start() {
    try {
      // Only observe the prepared profile of this exact challenge.
      const ini = await readFile(join(this.profile, 'GameSettings/GALE01.ini'), 'utf8');
      if (!verifyProfileCode(ini, this.challenge.geckoSha256)) throw new Error('Wrong profile');
      const script = await windowsPath(join(this.root, 'scripts/watch_dolphin.ps1'));
      const profile = await windowsPath(this.profile);
      this.child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Profile', profile, ...(this.nativeExecutable ? ['-Executable', await windowsPath(this.nativeExecutable)] : [])], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      this.child.stderr.resume(); // Never echo process contents into API responses.
      this.lines = createInterface({ input: this.child.stdout });
      this.lines.on('line', line => {
        try {
          const sample = JSON.parse(line);
          this.lastSampleAt = Date.now();
          this.state = { status: sample.status, experimental: true, dolphinRunning: sample.status === 'connected' || sample.dolphinRunning === true,
            inGame: sample.major === 15 && sample.minor === 1,
            character: sample.major === 15 && sample.minor === 1 ? characterForId(sample.characterId) || null : null,
            stage: sample.major === 15 && sample.minor === 1 ? stageForId(sample.stageId) || null : null,
            remaining: sample.remaining, seconds: sample.seconds, timerFrames: sample.seconds * 60 + sample.timerFrame, recording: this.detector.run?.saved ? 'saved' : this.detector.run ? 'armed' : 'idle' };
          if (sample.status === 'connected') this.detector.sample(sample, this.getIdentity());
          else this.detector.reset();
        } catch { this.detector.reset(); }
      });
      this.child.on('error', () => { this.state = { status: 'unavailable', experimental: true }; this.detector.reset(); });
      this.child.on('exit', () => { this.state = { status: 'unavailable', experimental: true }; this.detector.reset(); });
    } catch { this.state = { status: 'unavailable', experimental: true }; }
  }
  stop() { this.lines?.close(); this.child?.kill(); this.detector.reset(); }
}
