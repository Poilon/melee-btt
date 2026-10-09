import { createHmac, timingSafeEqual } from "node:crypto";
import { currentWeek, weeklyRound } from "../shared/browser-weekly.mjs";
export function createWeekly({ store, secret, now, update, once }) {
  const mac = (p) =>
    createHmac("sha256", secret)
      .update("browser-weekly-entry:" + p)
      .digest("base64url");
  const cached = new Map(),
    pending = new Map();
  function entry(uid, number) {
    if (
      !Number.isSafeInteger(number) ||
      number < 1 ||
      number > currentWeek(now()) + 1
    )
      throw Object.assign(Error("Competition not found."), { status: 404 });
    const at = now(),
      round = weeklyRound(number, at);
    if (round.status !== "active")
      throw Object.assign(Error("This weekly competition is not open."), {
        status: 409,
      });
    const payload = Buffer.from(
      JSON.stringify({ uid, week: number, issuedAt: at }),
    ).toString("base64url");
    return { ticket: payload + "." + mac(payload), serverTime: at, round };
  }
  function eligibility(ticket, uid, replay, received) {
    if (!ticket) return null;
    try {
      if (typeof ticket !== "string" || ticket.length > 1024) throw Error();
      const [p, s, ...rest] = ticket.split("."),
        expected = Buffer.from(mac(p)),
        actual = Buffer.from(s || "");
      if (
        rest.length ||
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw Error();
      const claim = JSON.parse(Buffer.from(p, "base64url")),
        round = weeklyRound(claim.week, received),
        start = Date.parse(replay.startAt);
      if (claim.uid !== uid || !Number.isSafeInteger(claim.issuedAt))
        throw Error();
      if (round.status !== "active")
        return {
          accepted: false,
          reason:
            "The weekly deadline has passed. Your personal record is still saved.",
        };
      if (
        claim.issuedAt < Date.parse(round.startsAt) ||
        claim.issuedAt > received ||
        !Number.isFinite(start) ||
        start < claim.issuedAt ||
        start > received + 2000 ||
        start < Date.parse(round.startsAt)
      )
        return {
          accepted: false,
          reason:
            "The attempt must start during this competition. Start a new run from the weekly page.",
        };
      if (
        replay.fighter !== round.character.fighter ||
        replay.engine !== round.engine
      )
        return {
          accepted: false,
          reason:
            "Wrong character or engine version for this weekly competition.",
        };
      return { accepted: true, number: round.number };
    } catch {
      return {
        accepted: false,
        reason: "Invalid weekly entry. Reopen the competition to enter again.",
      };
    }
  }
  async function record(uid, run) {
    if (!run.weekly?.accepted) return;
    const number = run.weekly.number;
    const token = createHmac("sha256", secret)
      .update(`browser-replay:${uid}:${run.id}`)
      .digest("hex");
    // Public entry replays remain watchable in archives, even after a new PB.
    await once(`browser-btt/shares/${token}.json`, { userId: uid, id: run.id });
    await update(`browser-btt/weekly/${number}/players/${uid}.json`, (old) => {
      if (
        old &&
        (old.frames < run.frames ||
          (old.frames === run.frames && old.createdAt <= run.createdAt))
      )
        return old;
      return {
        id: run.id,
        username: run.displayName,
        slug: run.playerSlug,
        frames: run.frames,
        ucf: run.ucf,
        createdAt: run.createdAt,
        replayUrl: `/play?replay=${token}`,
      };
    });
    cached.delete(number);
  }
  async function rows(number) {
    if (cached.has(number) && now() - cached.get(number).at < 15000)
      return cached.get(number).rows;
    if (pending.has(number)) return pending.get(number);
    const promise = (async () => {
      const paths = await store.list(`browser-btt/weekly/${number}/players/`),
        data = [];
      let index = 0;
      await Promise.all(
        Array.from({ length: Math.min(8, paths.length) }, async () => {
          while (index < paths.length) {
            const r = await store.get(paths[index++].pathname);
            if (r) data.push(r);
          }
        }),
      );
      data.sort(
        (a, b) =>
          a.frames - b.frames ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.username.localeCompare(b.username),
      );
      let previous, rank;
      const result = data.map((r, i) => {
        if (r.frames !== previous) rank = i + 1;
        previous = r.frames;
        return { ...r, rank };
      });
      cached.set(number, { at: now(), rows: result });
      if (cached.size > 12) cached.delete(cached.keys().next().value);
      return result;
    })().finally(() => pending.delete(number));
    pending.set(number, promise);
    return promise;
  }
  async function get(number, offset = 0) {
    const at = now(),
      current = currentWeek(at);
    if (
      !Number.isSafeInteger(number) ||
      number < 1 ||
      number > current + 1 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100000
    )
      throw Object.assign(Error("Competition not found."), { status: 404 });
    const round = weeklyRound(number, at),
      all = await rows(number);
    return {
      round,
      current: weeklyRound(current, at),
      next: weeklyRound(current + 1, at),
      serverTime: at,
      total: all.length,
      offset,
      rows: all.slice(offset, offset + 100),
      previous: number > 1 ? number - 1 : null,
      following: number < current ? number + 1 : null,
    };
  }
  return { entry, eligibility, record, get, current: () => currentWeek(now()) };
}
