import { createHmac } from "node:crypto";
import { browserBttCatalog } from "../shared/browser-btt-catalog.mjs";
const fighters = new Set(browserBttCatalog.map((c) => c.fighter));
const stages = new Map(browserBttCatalog.map((c) => [c.fighter, c.stage]));
const requiredStages = new Set(stages.values()).size;
const byTime = (a, b) =>
  a.frames - b.frames ||
  a.createdAt.localeCompare(b.createdAt) ||
  a.username.localeCompare(b.username);
const ranked = (rows) => {
  let previous, rank;
  return rows.sort(byTime).map((row, i) => {
    if (row.frames !== previous) rank = i + 1;
    previous = row.frames;
    return { ...row, rank };
  });
};
// Read existing per-user best indexes, including records saved before this
// leaderboard existed. Only current personal bests become public automatically.
export function createBrowserLeaderboard({ store, secret, now }) {
  let cached,
    pending,
    generation = 0;
  const invalidate = () => {
    cached = null;
    generation++;
  };
  async function build() {
    const indexes = await store.list("browser-btt/index/");
    const publicBests = new Map();
    const perFighter = Object.fromEntries([...fighters].map((id) => [id, []]));
    const totals = [],
      inProgress = [];
    // Bound storage concurrency instead of issuing a request per user at once.
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(indexes.length, 8) }, async () => {
        while (cursor < indexes.length) {
          const entry = indexes[cursor++];
          const uid = entry.pathname.match(
            /^browser-btt\/index\/([a-f0-9]{64})\.json$/,
          )?.[1];
          if (!uid) continue;
          const [index, profile] = await Promise.all([
            store.get(entry.pathname),
            store.get(`profiles/${uid}.json`),
          ]);
          if (!profile) continue;
          const bestStages = new Map();
          for (const [fighterKey, run] of Object.entries(index?.best || {})) {
            const fighter = Number(fighterKey);
            if (
              !fighters.has(fighter) ||
              run.fighter !== fighter ||
              run.status !== "browser-recorded" ||
              !/^[a-f0-9]{64}$/.test(run.id) ||
              !Number.isSafeInteger(run.frames) ||
              run.frames < 0 ||
              typeof run.createdAt !== "string"
            )
              continue;
            const token =
              secret &&
              createHmac("sha256", secret)
                .update(`browser-replay:${uid}:${run.id}`)
                .digest("hex");
            if (token)
              publicBests.set(token, { userId: uid, id: run.id, fighter });
            const row = {
              username: profile.displayName || run.displayName,
              fighter,
              frames: run.frames,
              ucf: run.ucf,
              createdAt: run.createdAt,
              // Official browser personal bests are automatically watchable.
              replayUrl: token ? `/play?replay=${token}` : null,
            };
            perFighter[fighter].push(row);
            const stage = stages.get(fighter),
              previous = bestStages.get(stage);
            if (!previous || run.frames < previous.frames)
              bestStages.set(stage, row);
          }
          if (bestStages.size) {
            const runs = [...bestStages.values()],
              complete = bestStages.size === requiredStages;
            const row = {
              username: profile.displayName,
              completed: bestStages.size,
              frames: complete
                ? runs.reduce((sum, r) => sum + r.frames, 0)
                : null,
              createdAt: runs
                .map((r) => r.createdAt)
                .sort()
                .at(-1),
            };
            (complete ? totals : inProgress).push(row);
          }
        }
      }),
    );
    for (const id of fighters) perFighter[id] = ranked(perFighter[id]);
    inProgress.sort(
      (a, b) =>
        b.completed - a.completed || a.username.localeCompare(b.username),
    );
    return { perFighter, totals: ranked(totals), inProgress, publicBests };
  }
  async function snapshot() {
    if (cached && now() - cached.at < 15000) return cached.value;
    if (!pending) {
      const version = generation;
      pending = build()
        .then((value) => {
          if (version === generation) cached = { at: now(), value };
          return value;
        })
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  }
  return {
    invalidate,
    async resolveReplay(token) {
      const candidate = (await snapshot()).publicBests.get(token);
      if (!candidate) return null;
      // Recheck the live index: a superseded best is private unless its owner
      // explicitly shared it. The board cache never grants replay access.
      const index = await store.get(
        `browser-btt/index/${candidate.userId}.json`,
      );
      return index?.best?.[candidate.fighter]?.id === candidate.id
        ? candidate
        : null;
    },
    async get(fighter, offset = 0) {
      const data = await snapshot(),
        total = fighter === "total";
      const rows = total ? data.totals : data.perFighter[fighter];
      return {
        rows: rows.slice(offset, offset + 100),
        total: rows.length,
        offset,
        ...(total
          ? {
              requiredStages,
              inProgress: offset === 0 ? data.inProgress.slice(0, 100) : [],
            }
          : {}),
        scope: "official-browser-btt",
        verification: "browser-recorded",
      };
    },
  };
}
