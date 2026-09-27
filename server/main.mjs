import { mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadEnvFile } from 'node:process';
import { loadChallenge } from './challenge-loader.mjs';
import { pythonExecutable, windowsPath, bundledPlayback } from './platform.mjs';
import { ensurePlayback } from './playback-install.mjs';
import { Onboarding } from './onboarding.mjs';
import { parsePlayer, playerIdentity, readPlayer, savePlayer, restoreProfilePlayer } from './player.mjs';
import { ScoreStore } from './store.mjs';
import { RunDetector } from './telemetry.mjs';
import { DolphinBridge } from './bridge.mjs';
import { createApp } from './app.mjs';
import { CompanionAccount } from './account.mjs';
import { RemoteSync } from './remote.mjs';
import { AutoSubmitter } from './auto-submit.mjs';
import { ReplayLibrary } from './replays.mjs';
import { PlaySettings } from './play-settings.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try { loadEnvFile(join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const port = Number(process.env.PORT || 4317);
const challengeDir = resolve(process.env.TTRC_CHALLENGE_DIR || join(root, 'build/challenge'));
const generated = await loadChallenge(root, challengeDir);
const stored = generated.manifest, code = generated.gecko;
await mkdir(join(root, '.local'), { recursive: true });
const playSettings = new PlaySettings(join(root, '.local/play-settings.json'));
await playSettings.initialize();
const store = new ScoreStore(process.env.TTRC_DB || join(root, '.local/scores.sqlite'));
const siteOrigin = process.env.TTRC_SITE_URL || 'https://target-test-randomizer-challenge.vercel.app';
const remote = new RemoteSync(join(root, '.local'), siteOrigin);
remote.onUpdate = (id, status, note, replayName) => store.setSubmission(id, status, note, replayName);
await remote.initialize();
let runtime;
try { runtime = JSON.parse(await readFile(join(challengeDir, 'runtime.json'), 'utf8')); } catch {}
// Keep our credential separate from Slippi Dolphin's own account file.
const profilePlayerPath = rt => rt?.recording ? join(rt.profile, 'Challenge', 'user.json') : join(rt?.profile || join(root, 'build/profiles', stored.id), 'user.json');
let playerPath = profilePlayerPath(runtime);
let identity = null;
const signedOutPath = join(root, '.local/signed-out');
let signedOut = await access(signedOutPath).then(() => true, () => false);
let playerQueue = Promise.resolve();
function withPlayerLock(fn) { const next = playerQueue.then(fn); playerQueue = next.catch(() => {}); return next; }
async function refreshPlayer() { return withPlayerLock(async () => {
  if (signedOut) { identity = null; return; }
  try {
    const previous = runtime?.recording ? join(root, 'build/profiles', stored.id, 'user.json') : null;
    const file = await restoreProfilePlayer(playerPath, previous, siteOrigin, file => remote.usePlayer(file));
    identity = file ? playerIdentity(file) : null;
  } catch { identity = null; }
}); }
await refreshPlayer();
const refreshIdentity = setInterval(refreshPlayer, 5000);
const syncTimer = setInterval(async () => { await remote.flush(); await remote.refreshReviews(); }, 15_000);
const detector = new RunDetector(generated.manifest, run => {
  store.add(run); // A completed replay is required before automatic submission.
});
const bridge = new DolphinBridge(root, generated.manifest, detector, () => identity);
if (runtime?.profile) bridge.profile = runtime.profile;
if (runtime?.native) bridge.nativeExecutable = runtime.dolphin;
const exec = promisify(execFile);
const replays = new ReplayLibrary({ directory: () => runtime?.replays, cacheDirectory: join(root, '.local/playback/replays'), challenge: generated.manifest, gecko: generated.gecko,
  run: async (file, stage) => {if(runtime?.native)await ensurePlayback(root);return exec(pythonExecutable(root), [join(root, 'scripts/launch_replay.py'), '--challenge', challengeDir, '--replay', file, '--stage', String(stage), ...bundledPlayback(root), ...(runtime?.iso ? ['--iso', runtime.iso] : [])], { timeout: 30000, windowsHide: true });},
});
const autoSubmit = new AutoSubmitter({store,replays,remote,challenge:generated.manifest,gecko:generated.gecko,getIdentity:()=>identity});
async function syncRecordings(){
  // Dolphin records the ISO selected through its native Open dialog.
  if(runtime?.native){try{const next=JSON.parse(await readFile(join(challengeDir,'runtime.json'),'utf8'));if(next.native&&next.profile===runtime.profile)runtime.iso=next.iso;}catch{}}
  await replays.syncRuns(store);await autoSubmit.sync();
}
await syncRecordings().catch(()=>{});
const replayTimer=setInterval(()=>{syncRecordings().catch(()=>{});},2000);
let launching = false;
const onboarding = new Onboarding({ root, challengeDir, onReady: async next => {
  const player = await readPlayer(playerPath, siteOrigin);
  runtime = next; playerPath = profilePlayerPath(next);
  if (player) await savePlayer(playerPath, player);
  bridge.stop(); bridge.profile = next.profile; await bridge.start();
} });
await onboarding.initialize(runtime);
const acceptPlayer = value => withPlayerLock(async () => {
  const file = parsePlayer(value, siteOrigin);
  await remote.usePlayer(file); await savePlayer(playerPath, file);
  await rm(signedOutPath, { force: true }); signedOut = false;
  identity = playerIdentity(file); detector.reset();
});
const account = new CompanionAccount({ origin: siteOrigin, accept: acceptPlayer, signOut: () => withPlayerLock(async () => {
  await writeFile(signedOutPath, 'signed out\n', { mode: 0o600 });
  signedOut = true; identity = null; detector.reset();
  await rm(playerPath, { force: true });
  await remote.clearPairing();
}) });
const accountTimer = setInterval(() => { account.poll().catch(() => {}); }, 3000);
const server = createApp({
  ...generated, challenge: generated.manifest, store, remote, replays, onboarding, account,
  getPlaySettings: () => playSettings.get(),
  savePlaySettings: async value => {
    if (launching) throw new Error('Dolphin is starting.');
    return playSettings.save(value);
  },
  getIdentity: async () => identity,
  importPlayer: acceptPlayer,
  getCapture: () => ({ ...bridge.status(), native: Boolean(runtime?.native), replayEnabled: Boolean(runtime?.recording) }),
  openReplays: async () => {
    if (!runtime?.replays) throw new Error('Prepare the replay profile first');
    const path = await windowsPath(runtime.replays);
    // Explorer commonly returns 1 after handing off to an existing window.
    await exec('explorer.exe', [path]).catch(error => { if (error.code !== 1) throw error; });
    return { ok: true };
  },
  prepareRecorder: async () => {
    if(runtime?.native)return {message:'Replay recording is already enabled in TTRC Dolphin.'};
    await playSettings.queue;
    await exec(pythonExecutable(root), [join(root, 'scripts/prepare_dolphin.py'), '--challenge', challengeDir, '--record-replays', ...(runtime?.recording && runtime?.dolphin ? ['--dolphin', runtime.dolphin] : [])], { timeout: 30000 });
    const next = JSON.parse(await readFile(join(challengeDir, 'runtime.json'), 'utf8'));
    const player = await readPlayer(playerPath, siteOrigin);
    playerPath = profilePlayerPath(next);
    if (player) await savePlayer(playerPath, player);
    runtime = next;
    return { message: 'Replay profile prepared. Close the currently running Dolphin, then click Launch Dolphin. Replays are saved in the Replays folder next to Dolphin’s executable.' };
  },
  reviewerProxy: async (path, query, method, body) => {
    const key = (await readFile(join(root, '.local/reviewer.key'), 'utf8')).trim();
    const response = await fetch(`${siteOrigin}/api/${path}${query}`, { method,
      headers: { Authorization: `Bearer ${key}`, Origin: siteOrigin, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body } : {}), signal: AbortSignal.timeout(30000) });
    return response;
  },
  launch: async () => {
    if(runtime?.native)return {status:'already-running'};
    if (bridge.status().status === 'connected') return { status: 'already-running' };
    if (launching) return { status: 'starting' };
    launching = true;
    try {
      await playSettings.queue;
      await exec(pythonExecutable(root), [join(root, 'scripts/prepare_dolphin.py'), '--challenge', challengeDir, ...(runtime?.recording ? ['--record-replays'] : []), ...(runtime?.dolphin ? ['--dolphin', runtime.dolphin] : []), ...(runtime?.iso ? ['--iso', runtime.iso] : []), '--launch'], { timeout: 30_000 });
      runtime = JSON.parse(await readFile(join(challengeDir, 'runtime.json'), 'utf8'));
      playerPath = profilePlayerPath(runtime);
      bridge.stop();
      if (runtime?.profile) bridge.profile = runtime.profile;
      await bridge.start();
      return { status: 'started' };
    } finally { launching = false; }
  },
});
server.listen(port, '127.0.0.1', async () => {
  console.log(`Target Test Randomizer Challenge : http://localhost:${port}`);
  console.log(`Seed ${stored.rules.seed} — sign in through the companion to save records.`);
  await bridge.start();
});
function shutdown() {
  clearInterval(accountTimer); clearInterval(refreshIdentity); clearInterval(syncTimer); clearInterval(replayTimer); bridge.stop();
  server.close(() => { store.close(); process.exit(0); });
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
