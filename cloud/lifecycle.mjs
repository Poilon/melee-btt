export function createLifecycle({store, challengeId, endsAt, now}) {
  const path = `challenges/${challengeId}/lifecycle.json`;
  const fallbackDeadline = endsAt && Number.isFinite(Date.parse(endsAt)) ? new Date(endsAt).toISOString() : null;
  async function snapshot() {
    const saved = await store.readVersion(path);
    // Preserve challenges closed before lifecycle settings existed.
    const legacy = await store.get(`challenges/${challengeId}/closed.json`);
    return {saved, value: {...(saved?.value || {endsAt: fallbackDeadline}), ...(legacy ? {closedAt: legacy.at} : {})}};
  }
  function describe(value) {
    const closedAt = value.closedAt || (value.endsAt && now() >= Date.parse(value.endsAt) ? value.endsAt : null);
    return {phase: closedAt ? 'closed' : 'open', timesRevealed: Boolean(closedAt), endsAt: value.endsAt || null, closedAt};
  }
  async function change(reviewer, update) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const {saved, value} = await snapshot();
      const state = describe(value);
      const next = update(value, state);
      if (!next) return state;
      const record = {...next, updatedBy: reviewer, updatedAt: new Date(now()).toISOString()};
      if (saved) {
        if (await store.writeVersion(path, record, saved.etag)) return describe(record);
      } else {
        try { await store.put(path, record); return describe(record); }
        catch (error) { if (!await store.get(path)) throw error; }
      }
    }
    throw Object.assign(new Error('Challenge settings changed. Refresh and try again.'), {status: 409});
  }
  return {
    phase: async () => describe((await snapshot()).value),
    schedule: (deadline, reviewer) => change(reviewer, (value, state) => {
      if (state.timesRevealed) throw Object.assign(new Error('This challenge is closed. Revealed results cannot be made private again.'), {status: 409});
      if (deadline !== null && (typeof deadline !== 'string' || !Number.isFinite(Date.parse(deadline)) || Date.parse(deadline) <= now())) {
        throw Object.assign(new Error('Choose a future date, or remove the deadline.'), {status: 400});
      }
      return {...value, endsAt: deadline === null ? null : new Date(deadline).toISOString()};
    }),
    close: reviewer => change(reviewer, (value, state) => state.timesRevealed ? null : {...value, closedAt: new Date(now()).toISOString()}),
  };
}
