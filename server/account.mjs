// The same browser approval flow as Dolphin; no code to copy or separate account.
export class CompanionAccount {
  constructor({ origin, accept, signOut, fetcher = fetch, now = Date.now }) {
    Object.assign(this, { origin, accept, signOut, fetcher, now });
    this.state = { status: 'idle' };
    this.generation = 0;
  }
  status() { return { ...this.state }; }
  async request(path, body) {
    const response = await this.fetcher(`${this.origin}/api/game/connect/${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(12000) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Sign-in unavailable. Try again.');
    return value;
  }
  async start() {
    if (this.committing) throw new Error('Finishing sign-in. Please wait.');
    if (this.state.status === 'pending' && this.state.expires > this.now()) return this.status();
    const generation = ++this.generation;
    const result = await this.request('start');
    const url = new URL(result.url);
    const fragment=new URLSearchParams(url.hash.slice(1));
    if (url.origin !== this.origin || url.pathname !== '/login.html' || url.search || url.username || url.password || !/^[a-f0-9]{64}$/.test(result.id) || !/^[a-f0-9]{64}$/.test(result.deviceSecret) || fragment.get('request') !== result.id || !/^[a-f0-9]{64}$/.test(fragment.get('key')) || !Number.isFinite(result.expires)) throw new Error('Invalid sign-in response.');
    if (generation !== this.generation) return this.status();
    this.pending = { id: result.id, deviceSecret: result.deviceSecret };
    this.state = { status: 'pending', url: result.url, expires: result.expires };
    return this.status();
  }
  async poll() {
    if (!this.pending || this.polling) return;
    if (this.state.expires <= this.now()) { this.pending = null; this.state = { status: 'expired', error: 'Sign-in expired. Please try again.' }; return; }
    this.polling = true;
    const generation = this.generation;
    try {
      const result = await this.request('poll', this.pending);
      if (generation !== this.generation) return;
      if (result.status === 'connected') {
        // Cancellation/account switching is disabled during the local credential commit.
        this.committing = true;
        await this.accept(result.playerFile);
        await this.request('cancel',this.pending).catch(()=>{});
        this.pending = null; this.state = { status: 'connected' };
      } else if (result.status === 'pending') delete this.state.error;
      else throw new Error('Invalid sign-in response.');
    } catch (error) { if (generation === this.generation) this.state.error = error.message; }
    finally { this.polling = false; this.committing = false; }
  }
  cancel() {
    if (this.committing) throw new Error('Finishing sign-in. Please wait.');
    const pending=this.pending;
    this.generation++; this.pending = null; this.state = { status: 'idle' };
    if(pending)this.request('cancel',pending).catch(()=>{});
    return this.status();
  }
  async logout() { this.cancel(); await this.signOut(); return this.status(); }
}
