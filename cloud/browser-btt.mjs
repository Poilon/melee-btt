import { createHash, createHmac } from "node:crypto";
import { gunzipSync } from "node:zlib";
import {
  parseBttReplay,
  MAX_REPLAY_BYTES,
} from "../shared/browser-btt-replay.mjs";
import { createBrowserLeaderboard } from "./browser-leaderboard.mjs";
import { browserBttCatalog } from "../shared/browser-btt-catalog.mjs";
import { createWeekly } from "./browser-weekly.mjs";
import { spectateSigner } from "./btt-spectate.mjs";
import { publicProfile } from "./auth.mjs";
const validId = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const digest = (x) => createHash("sha256").update(x).digest("hex");
const error = (message, status = 400) =>
  Object.assign(Error(message), { status });
async function input(req) {
  let value = req.body;
  if (value === undefined) {
    let chunks = [],
      size = 0;
    for await (const c of req) {
      const b = Buffer.from(c);
      size += b.length;
      if (size > 4 * 1024 * 1024)
        throw error("Replay upload is too large.", 413);
      chunks.push(b);
    }
    value = Buffer.concat(chunks).toString("utf8");
  }
  if (typeof value === "string") {
    if (value.length > 4 * 1024 * 1024)
      throw error("Replay upload is too large.", 413);
    try {
      value = JSON.parse(value);
    } catch {
      throw error("Invalid request.");
    }
  }
  if (!value || typeof value !== "object") throw error("Invalid request.");
  return value;
}
export function createBrowserBtt({
  store,
  session,
  json,
  origin,
  secret,
  now,
}) {
  const spectate = spectateSigner(secret);
  const leaderboard = createBrowserLeaderboard({ store, secret, now });
  const rowPath = (uid, id) => `browser-btt/runs/${uid}/${id}.json`;
  const replayPath = (uid, id) => `browser-btt/replays/${uid}/${id}.json`;
  async function once(path, value) {
    try {
      await store.put(path, value);
    } catch (e) {
      if (!(await store.get(path))) throw e;
    }
  }
  async function update(path, change) {
    for (let i = 0; i < 8; i++) {
      const previous = await store.readVersion(path),
        value = change(previous?.value);
      if (previous) {
        if (await store.writeVersion(path, value, previous.etag)) return value;
      } else {
        try {
          await store.put(path, value);
          return value;
        } catch (e) {
          if (!(await store.get(path))) throw e;
        }
      }
    }
    throw error(
      "Your account is busy saving another run. This replay will be retried.",
      503,
    );
  }
  const weekly = createWeekly({ store, secret, now, update, once });
  async function indexRun(uid, run) {
    await update(`browser-btt/index/${uid}.json`, (old) => {
      const runs = [run, ...(old?.runs || []).filter((r) => r.id !== run.id)]
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
        )
        .slice(0, 100);
      const best = { ...(old?.best || {}) };
      if (!best[run.fighter] || run.frames < best[run.fighter].frames)
        best[run.fighter] = run;
      return { runs, best };
    });
    leaderboard.invalidate();
    await weekly.record(uid, run);
  }
  async function userFor(req) {
    const u = await session(req);
    if (!u) throw error("Sign in to save or view your runs.", 401);
    return u;
  }
  return async (path, req, res, url) => {
    if (!path.startsWith("browser-btt/")) return false;
    try {
      if (path === "browser-btt/weekly" && req.method === "GET") {
        json(
          res,
          200,
          await weekly.get(
            Number(url.searchParams.get("week") || weekly.current()),
            Number(url.searchParams.get("offset") || 0),
          ),
        );
        return true;
      }
      if (path === "browser-btt/weekly/entry" && req.method === "POST") {
        const u = await userFor(req),
          data = await input(req);
        json(res, 200, weekly.entry(u.id, Number(data.week)));
        return true;
      }
      if (path === "browser-btt/spectate-key" && req.method === "GET") {
        json(res, 200, { publicKey: spectate.publicKey });
        return true;
      }
      if (path === "browser-btt/spectate-ticket" && req.method === "POST") {
        const u = await userFor(req),
          p = await store.get(`profiles/${u.id}.json`);
        if (!p?.slug)
          throw error("Choose your username before allowing spectators.", 409);
        json(res, 200, spectate.ticket(publicProfile(p), now()));
        return true;
      }
      if (path === "browser-btt/catalog" && req.method === "GET") {
        json(res, 200, {
          characters: browserBttCatalog,
          scope: "official-browser-btt",
        });
        return true;
      }
      if (path === "browser-btt/leaderboard" && req.method === "GET") {
        const fighter = url.searchParams.get("fighter") || "22";
        const offset = Number(url.searchParams.get("offset") || 0);
        if (
          fighter !== "total" &&
          !browserBttCatalog.some((c) => String(c.fighter) === fighter)
        )
          throw error("Unknown character.");
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
          throw error("Invalid leaderboard page.");
        json(res, 200, await leaderboard.get(fighter, offset));
        return true;
      }
      if (path === "browser-btt/session" && req.method === "GET") {
        const u = await session(req),
          p = u && (await store.get(`profiles/${u.id}.json`));
        json(res, 200, { profile: p ? publicProfile(p) : null });
        return true;
      }
      if (
        path === "browser-btt/preferences" &&
        ["GET", "POST"].includes(req.method)
      ) {
        const u = await userFor(req),
          key = `browser-btt/preferences/${u.id}.json`;
        if (req.method === "GET") {
          json(res, 200, { preferences: (await store.get(key)) || {} });
        } else {
          const data = await input(req);
          if (data.owner !== u.id)
            throw error("Account changed. Reload your settings.", 409);
          const patch = data.preferences;
          if (!patch || typeof patch !== "object" || Array.isArray(patch))
            throw error("Invalid preferences.");
          const allowed = new Set([
            "sound",
            "music",
            "rumble",
            "ucf",
            "cstick",
          ]);
          if (
            !Object.keys(patch).length ||
            Object.entries(patch).some(
              ([k, v]) => !allowed.has(k) || typeof v !== "boolean",
            )
          )
            throw error("Invalid preferences.");
          const preferences = await update(key, (old) => ({
            ...old,
            ...patch,
          }));
          json(res, 200, { preferences });
        }
        return true;
      }
      if (path === "browser-btt/runs" && req.method === "GET") {
        const u = await userFor(req);
        const index = await store.get(`browser-btt/index/${u.id}.json`);
        json(res, 200, index || { runs: [], best: {} });
        return true;
      }
      if (path === "browser-btt/runs" && req.method === "POST") {
        const u = await userFor(req),
          data = await input(req);
        if (data.owner !== u.id)
          throw error(
            "Account changed. Sign in to the account that recorded this run.",
            409,
          );
        if (
          typeof data.gzip !== "string" ||
          data.gzip.length > 4 * 1024 * 1024 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(data.gzip)
        )
          throw error("Invalid replay upload.", 413);
        let bytes, replay;
        try {
          bytes = gunzipSync(Buffer.from(data.gzip, "base64"), {
            maxOutputLength: MAX_REPLAY_BYTES,
          });
          replay = parseBttReplay(bytes);
        } catch (e) {
          throw error(e.message || "Invalid replay.");
        }
        if (!replay.complete || replay.practice)
          throw error(
            "Only completed attempts with official controls can save a score.",
          );
        const receivedAt = now();
        const id = digest(bytes),
          existing = await store.get(rowPath(u.id, id));
        if (existing) {
          await indexRun(u.id, existing);
          json(res, 200, {
            run: existing,
            ...(data.weeklyTicket && !existing.weekly
              ? {
                  weekly: {
                    accepted: false,
                    reason:
                      "This replay was already saved outside the weekly competition. Start a new attempt.",
                  },
                }
              : { weekly: existing.weekly }),
          });
          return true;
        }
        // Constant-cost counter instead of one storage read per earlier upload.
        const hour = Math.floor(now() / 3600000);
        await update(`browser-btt/limits/${u.id}/${hour}.json`, (old) => {
          if ((old?.count || 0) >= 600)
            throw error(
              "Uploads are temporarily rate limited. Your local replay will be retried automatically.",
              429,
            );
          return { count: (old?.count || 0) + 1 };
        });
        const p = await store.get(`profiles/${u.id}.json`);
        const run = {
          id,
          fighter: replay.fighter,
          frames: replay.frames,
          engine: replay.engine,
          ucf:
            replay.version === 1 || replay.ucfEnabled.every(Boolean)
              ? "on"
              : replay.ucfEnabled.some(Boolean)
                ? "mixed"
                : "off",
          createdAt: new Date(receivedAt).toISOString(),
          weekly: weekly.eligibility(
            data.weeklyTicket,
            u.id,
            replay,
            receivedAt,
          ),
          displayName: p?.displayName || u.username,
          playerSlug: p?.slug || u.username,
          status: "browser-recorded",
          bytes: bytes.length,
        };
        await once(replayPath(u.id, id), { gzip: data.gzip });
        await once(rowPath(u.id, id), run);
        const saved = await store.get(rowPath(u.id, id));
        await indexRun(u.id, saved);
        json(res, 200, { run: saved, weekly: saved.weekly });
        return true;
      }
      if (path === "browser-btt/share" && req.method === "POST") {
        const u = await userFor(req),
          data = await input(req);
        if (!validId(data.id)) throw error("Replay not found.", 404);
        const run = await store.get(rowPath(u.id, data.id));
        if (!run) throw error("Replay not found.", 404);
        if (!secret) throw error("Sharing is temporarily unavailable.", 503);
        const key = createHmac("sha256", secret)
          .update(`browser-replay:${u.id}:${data.id}`)
          .digest("hex");
        await once(`browser-btt/shares/${key}.json`, {
          userId: u.id,
          id: run.id,
        });
        leaderboard.invalidate();
        json(res, 200, { url: `${origin}/play?replay=${key}` });
        return true;
      }
      if (
        ["browser-btt/replay", "browser-btt/shared"].includes(path) &&
        req.method === "GET"
      ) {
        let uid, id;
        const key = url.searchParams.get("share");
        if (key) {
          if (!validId(key)) throw error("Replay not found.", 404);
          const share =
            (await store.get(`browser-btt/shares/${key}.json`)) ||
            (await leaderboard.resolveReplay(key));
          if (!share) throw error("Replay not found.", 404);
          uid = share.userId;
          id = share.id;
        } else {
          const u = await userFor(req);
          uid = u.id;
          id = url.searchParams.get("id");
        }
        if (!validId(id)) throw error("Replay not found.", 404);
        const run = await store.get(rowPath(uid, id));
        if (!run) throw error("Replay not found.", 404);
        if (path === "browser-btt/shared") {
          json(res, 200, { run });
          return true;
        }
        const saved = await store.get(replayPath(uid, id));
        if (!saved) throw error("Replay file not found.", 404);
        const bytes = gunzipSync(Buffer.from(saved.gzip, "base64"), {
          maxOutputLength: MAX_REPLAY_BYTES,
        });
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="BTT-${run.fighter}-${run.frames}-${id.slice(0, 8)}.slp"`,
          "Content-Length": bytes.length,
        });
        res.end(bytes);
        return true;
      }
      json(res, 404, { error: "Resource not found." });
      return true;
    } catch (e) {
      json(res, e.status || 503, {
        error: e.status
          ? e.message
          : "Could not save or load your replay. Please try again.",
      });
      return true;
    }
  };
}
