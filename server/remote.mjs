import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const key = token => createHash('sha256').update(token).digest('hex');
export class RemoteSync {
  constructor(directory, origin, fetcher = fetch) {
    this.directory = directory; this.origin = origin; this.fetcher = fetcher; this.pending = 0;
    if (origin) {
      const url = new URL(origin);
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
          !url.hostname.endsWith('.vercel.app')) throw new Error('Le site doit être une URL HTTPS Vercel.');
      this.origin = url.origin;
    }
  }
  async initialize() {
    await mkdir(join(this.directory, 'outbox'), { recursive: true });
    try { const saved = JSON.parse(await readFile(join(this.directory, 'companion.json'), 'utf8'));
      if (saved.origin === this.origin && /^[a-f0-9]{64}$/.test(saved.token)) this.pairing = saved;
    } catch { }
    await this.flush();
  }
  status(identity) { return { available: Boolean(this.origin), autoSubmit: true, paired: Boolean(this.pairing) && (identity === undefined || identity?.id === this.pairing.localPlayerId), pending: this.pending, lastError: this.lastError || null, lastSynced: this.lastSynced || null, competition: this.competition || null }; }
  async savePairing(pairing) {
    const file = join(this.directory, 'companion.json');
    await writeFile(`${file}.tmp`, JSON.stringify(pairing), { mode: 0o600 }); await rename(`${file}.tmp`, file);
    this.pairing = pairing;
  }
  async browserLink(identity) {
    if (!this.pairing || this.pairing.localPlayerId !== identity?.id) throw new Error('Player not linked');
    const response = await this.fetcher(`${this.origin}/api/companion/browser`, { method: 'POST',
      headers: { Authorization: `Bearer ${this.pairing.token}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Sign-in unavailable');
    const { url } = await response.json();
    const parsed = new URL(url);
    if (parsed.origin !== this.origin || parsed.pathname !== '/' || !/^#signin=[a-f0-9]{64}$/.test(parsed.hash)) throw new Error('Invalid sign-in link');
    return url;
  }
  async usePlayer(file) {
    if (this.pairing?.token === file.token && this.pairing.playerId === file.id && this.pairing.displayName === file.displayName && this.pairing.connectCode === file.connectCode) return;
    const response = await this.fetcher(`${this.origin}/api/companion/me`, {
      headers: { Authorization: `Bearer ${file.token}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Invalid player file');
    const result = await response.json();
    if (result.playerId !== file.id || result.displayName !== file.displayName || result.connectCode !== file.connectCode) throw new Error('Player file was modified');
    await this.savePairing({ origin: this.origin, token: file.token, playerId: result.playerId, localPlayerId: file.id, displayName: file.displayName, connectCode: file.connectCode });
  }
  async publicRun(id,playerId,replay=false) {
    if(!/^[a-f0-9-]{36}$/.test(id||'')||!/^[a-f0-9]{64}$/.test(playerId||''))throw new Error('Invalid shared run');
    const response=await this.fetcher(`${this.origin}/api/shared/${replay?'replay':'run'}?id=${id}&playerId=${playerId}`,{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('This run is not public or is no longer available.');
    if(replay){const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>2*1024*1024)throw new Error('Replay too large');return bytes;}
    return response.json();
  }
  async enqueue(run, replay, replayName) {
    if (!this.pairing || run.identity.id !== this.pairing.localPlayerId) throw new Error('Player not connected');
    if (!replay) throw new Error('Attach the .slp replay first');
    const payload = { id: run.id, challengeId: run.challenge.id, geckoSha256: run.challenge.geckoSha256,
      character: run.character, stage: run.stage, frames: run.frames, replay: replay.toString('base64') };
    const file = join(this.directory, 'outbox', `${run.id}.json`);
    await writeFile(`${file}.tmp`, JSON.stringify({ device: key(this.pairing.token), playerId: this.pairing.playerId, payload }), { mode: 0o600 });
    await rename(`${file}.tmp`, file); this.onUpdate?.(run.id, 'queued', '', replayName); await this.flush();
  }
  async refreshReviews() {
    if (!this.pairing || this.reviewing || Date.now() - (this.lastReviewCheck || 0) < 30000) return;
    this.reviewing = true; this.lastReviewCheck = Date.now();
    try {
      const response = await this.fetcher(`${this.origin}/api/submissions/mine`, { headers: { Authorization: `Bearer ${this.pairing.token}` }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return;
      const data = await response.json(); this.competition = data.competition;
      for (const r of data.submissions || []) this.onUpdate?.(r.id, r.current===false&&r.status!=='rejected'?'superseded':r.status, r.reviewNote);
    } catch {} finally { this.reviewing = false; }
  }
  async flush() {
    if (this.flushing || !this.pairing) return;
    this.flushing = true;
    const pairing = this.pairing;
    try {
      const files = (await readdir(join(this.directory, 'outbox'))).filter(name => name.endsWith('.json'));
      this.pending = files.length;
      for (const name of files) {
        const file = join(this.directory, 'outbox', name);
        const event = JSON.parse(await readFile(file, 'utf8'));
        if (event.playerId ? event.playerId !== pairing.playerId : event.device !== key(pairing.token)) { this.pending--; continue; }
        if (!event.payload.replay) { this.pending--; continue; }
        const response = await this.fetcher(`${this.origin}/api/submissions`, { method: 'POST', signal: AbortSignal.timeout(10_000),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pairing.token}` }, body: JSON.stringify(event.payload) });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          this.lastError = detail.error || 'Upload unavailable. Your local record is safe.';
          if ([400,409,410,413].includes(response.status)) { this.onUpdate?.(event.payload.id, 'upload-error', this.lastError); await unlink(file); this.pending--; continue; }
          break;
        }
        this.onUpdate?.(event.payload.id, 'pending', 'Awaiting human review.');
        this.lastError = null; this.lastSynced = new Date().toISOString();
        await unlink(file); this.pending--;
      }
    } catch { this.lastError = 'Offline. Your runs are saved and will be retried.'; }
    finally { this.flushing = false; }
  }
}
