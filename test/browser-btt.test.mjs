import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { createCloudHandler } from "../cloud/backend.mjs";
import { BttRecorder, parseBttReplay } from "../shared/browser-btt-replay.mjs";
function replay({
  practice = false,
  complete = true,
  ucf = true,
  fighter = 2,
  engine = "a".repeat(64),
  startAt = "2026-10-09T00:00:00.000Z",
  frames = 2,
  seed = 1234567,
} = {}) {
  const r = new BttRecorder({
    fighter,
    engine,
    startAt,
    seed,
  });
  const s = [1, 2, 3, 0, 1, 14, 2, 1, 10, 10, 0, 0, 0, 0, 0, 0, 15, 0, 0, 0];
  for (let i = 0; i <= frames; i++) {
    const before = s.slice();
    s[10] = i;
    s[8] = complete && i === frames ? 0 : 10;
    r.record([1, 0, 0, 128, 128, 128, 128, 0, 0], before, s, practice, ucf);
  }
  return Buffer.from(r.finish({ complete, practice }));
}
function fixture(now = Date.now) {
  const rows = new Map(),
    versions = new Map();
  const store = {
    get: async (k) => structuredClone(rows.get(k) || null),
    put: async (k, v, overwrite) => {
      if (rows.has(k) && !overwrite) throw Error("exists");
      rows.set(k, structuredClone(v));
      versions.set(k, (versions.get(k) || 0) + 1);
    },
    readVersion: async (k) =>
      rows.has(k)
        ? { value: structuredClone(rows.get(k)), etag: versions.get(k) }
        : null,
    writeVersion: async (k, v, etag) => {
      if (versions.get(k) !== etag) return false;
      rows.set(k, structuredClone(v));
      versions.set(k, etag + 1);
      return true;
    },
    delete: async (k) => rows.delete(k),
    list: async (prefix) =>
      [...rows.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((pathname) => ({ pathname })),
  };
  const origin = "https://test.example";
  const handler = createCloudHandler({
    store,
    origin,
    secret: "test",
    gameAccountsOnly: true,
    now,
    challenge: { id: "test", assignments: {}, rules: {} },
    gecko: "",
  });
  async function request(
    path,
    { method = "GET", body, cookie, requestOrigin = origin } = {},
  ) {
    const result = { headers: {} };
    await handler(
      {
        url: "/api/" + path,
        method,
        body,
        headers: { origin: requestOrigin, ...(cookie ? { cookie } : {}) },
      },
      {
        setHeader: (k, v) => (result.headers[k.toLowerCase()] = v),
        writeHead: (status, h) => {
          result.status = status;
          Object.assign(result.headers, h);
        },
        end: (v) => {
          result.bytes = v;
          try {
            result.data = JSON.parse(v);
          } catch {}
        },
      },
    );
    return result;
  }
  async function account(name) {
    const r = await request("browser-btt/signup", {
      method: "POST",
      body: { username: name, password: "test-password-42" },
    });
    assert.equal(r.status, 200);
    return {
      cookie: r.headers["set-cookie"].split(";")[0],
      id: r.data.profile.id,
    };
  }
  return { rows, request, account, store };
}
const post = (a, body) => ({ method: "POST", cookie: a.cookie, body });
const payload = (a, bytes = replay()) => ({
  owner: a.id,
  gzip: gzipSync(bytes).toString("base64"),
});
test("browser signup reuses site session; completed runs are idempotent and explicit sharing remains available", async () => {
  const f = fixture(),
    a = await f.account("browser_a"),
    b = await f.account("browser_b");
  assert.equal(
    (await f.request("browser-btt/session", { cookie: a.cookie })).data.profile
      .id,
    a.id,
  );
  const saved = await f.request("browser-btt/runs", post(a, payload(a)));
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const id = saved.data.run.id;
  assert.equal(saved.data.run.frames, 2);
  assert.equal(
    (await f.request("browser-btt/runs", post(a, payload(a)))).data.run.id,
    id,
  );
  assert.equal(
    (await f.request("browser-btt/runs", { cookie: a.cookie })).data.runs
      .length,
    1,
  );
  assert.equal(
    (await f.request("browser-btt/runs", { cookie: b.cookie })).data.runs
      .length,
    0,
  );
  assert.equal((await f.request("browser-btt/replay?id=" + id)).status, 401);
  assert.equal(
    (await f.request("browser-btt/replay?id=" + id, { cookie: b.cookie }))
      .status,
    404,
  );
  const download = await f.request("browser-btt/replay?id=" + id, {
    cookie: a.cookie,
  });
  assert.deepEqual(download.bytes, replay());
  assert.equal(
    (await f.request("browser-btt/share", post(b, { id }))).status,
    404,
  );
  const shared = await f.request("browser-btt/share", post(a, { id }));
  assert.equal(shared.status, 200);
  const key = new URL(shared.data.url).searchParams.get("replay");
  assert.deepEqual(
    (await f.request("browser-btt/replay?share=" + key)).bytes,
    replay(),
  );
  assert.equal(
    (await f.request("browser-btt/shared?share=" + key)).data.run.id,
    id,
  );
});
test("reject practice, incomplete, corrupt, wrong-owner and cross-origin score uploads", async () => {
  const f = fixture(),
    a = await f.account("tester");
  for (const bytes of [
    replay({ practice: true }),
    replay({ practice: true, seed: 0xfedcba98 }),
    replay({ seed: 0xfedcba98 }),
    replay({ complete: false }),
    Buffer.from("not a replay"),
  ])
    assert.equal(
      (await f.request("browser-btt/runs", post(a, payload(a, bytes)))).status,
      400,
    );
  assert.equal(
    (
      await f.request(
        "browser-btt/runs",
        post(a, { ...payload(a), owner: "b".repeat(64) }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("browser-btt/runs", {
        ...post(a, payload(a)),
        requestOrigin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.request("browser-btt/runs", { method: "POST", body: payload(a) }))
      .status,
    401,
  );
  assert.equal(
    (await f.request("browser-btt/runs", { cookie: a.cookie })).data.runs
      .length,
    0,
  );
});
test("practice reconstructions preserve uint32 startup seeds without becoming score eligible", () => {
  const parsed = parseBttReplay(replay({ practice: true, seed: 0xfedcba98 }));
  assert.equal(parsed.seed, 0xfedcba98);
  assert.equal(parsed.practice, true);
  assert.throws(() => parseBttReplay(replay({ seed: 0xfedcba98 })), /Invalid replay result/);
});
test("browser account creation keeps CSRF and username uniqueness protections", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.request("browser-btt/signup", {
        method: "POST",
        requestOrigin: "https://evil.example",
        body: { username: "user", password: "password-1234" },
      })
    ).status,
    403,
  );
  await f.account("same_user");
  assert.equal(
    (
      await f.request("browser-btt/signup", {
        method: "POST",
        body: { username: "SAME_USER", password: "password-1234" },
      })
    ).status,
    409,
  );
});

test("eligible UCF-disabled clears keep their replay and account score", async () => {
  const f = fixture(),
    a = await f.account("ucf_off");
  const result = await f.request(
    "browser-btt/runs",
    post(a, payload(a, replay({ ucf: false }))),
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.run.ucf, "off");
  const bytes = (
    await f.request("browser-btt/replay?id=" + result.data.run.id, {
      cookie: a.cookie,
    })
  ).bytes;
  assert.deepEqual(bytes, replay({ ucf: false }));
});

test("checkbox preferences are account-specific and partial changes retain other settings", async () => {
  const f = fixture(),
    a = await f.account("prefs_a"),
    b = await f.account("prefs_b");
  assert.equal((await f.request("browser-btt/preferences")).status, 401);
  assert.equal(
    (
      await f.request(
        "browser-btt/preferences",
        post(a, {
          owner: a.id,
          preferences: { rumble: true, music: false, ucf: true },
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await f.request(
        "browser-btt/preferences",
        post(a, { owner: a.id, preferences: { sound: true } }),
      )
    ).status,
    200,
  );
  assert.deepEqual(
    (await f.request("browser-btt/preferences", { cookie: a.cookie })).data
      .preferences,
    { rumble: true, music: false, ucf: true, sound: true },
  );
  assert.deepEqual(
    (await f.request("browser-btt/preferences", { cookie: b.cookie })).data
      .preferences,
    {},
  );
  assert.equal(
    (
      await f.request(
        "browser-btt/preferences",
        post(a, { owner: a.id, preferences: { rumble: "yes" } }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request(
        "browser-btt/preferences",
        post(a, { owner: b.id, preferences: { sound: true } }),
      )
    ).status,
    409,
  );
});

test("public browser leaderboard includes existing bests, uses ties, and never mixes custom stages or non-best attempts", async () => {
  const f = fixture(),
    a = await f.account("browser_first"),
    b = await f.account("browser_second");
  const run = {
    id: "a".repeat(64),
    fighter: 2,
    frames: 600,
    ucf: "on",
    createdAt: "2026-10-09T00:00:00Z",
    status: "browser-recorded",
    engine: "b".repeat(64),
    bytes: 12345,
  };
  for (const user of [a, b])
    f.rows.set(`browser-btt/index/${user.id}.json`, {
      best: { 2: run },
      runs: [],
    });
  f.rows.set("worlds/runs/something.json", {
    ...run,
    frames: 1,
    displayName: "Custom score must not appear",
  });
  const board = await f.request("browser-btt/leaderboard?fighter=2");
  assert.equal(board.status, 200);
  assert.equal(board.data.scope, "official-browser-btt");
  assert.equal(board.data.total, 2);
  assert.equal(board.data.worldRecord.time, "6.31");
  assert.equal(board.data.worldRecord.holders[0].name, "jenkem66");
  assert.deepEqual(
    board.data.rows.map((r) => r.rank),
    [1, 1],
  );
  assert.deepEqual(
    board.data.rows.map((r) => r.username),
    ["browser_first", "browser_second"],
  );
  assert.ok(
    board.data.rows.every((r) =>
      /^\/play\?replay=[a-f0-9]{64}$/.test(r.replayUrl),
    ),
  );
  for (const field of [
    "userId",
    "id",
    "engine",
    "bytes",
    "connectCode",
    "gzip",
  ])
    assert.equal(field in board.data.rows[0], false);
  assert.equal(
    (await f.request("browser-btt/replay?id=" + run.id)).status,
    401,
  );
  assert.equal(
    (await f.request("browser-btt/leaderboard?fighter=999")).status,
    400,
  );
  assert.equal(
    (await f.request("browser-btt/leaderboard?fighter=2&offset=-1")).status,
    400,
  );
  assert.equal(
    (await f.request("browser-btt/leaderboard?fighter=2&offset=0.5")).status,
    400,
  );
});

test("world records remain visible on an empty or paginated browser board", async () => {
  const f = fixture();
  for (const offset of [0, 100]) {
    const board = (await f.request(`browser-btt/leaderboard?fighter=23&offset=${offset}`)).data;
    assert.equal(board.total, 0);
    assert.deepEqual(board.rows, []);
    assert.equal(board.worldRecord.time, "5.33");
    assert.equal(board.worldRecord.holders.length, 2);
    assert.equal(board.worldRecord.replayUrl, "/play?worldRecord=23");
    assert.match(board.worldRecord.reconstruction.downloadUrl, /^\/world-record-replays\/[a-f0-9]{64}\.slp$/);
  }
});

test("new and existing PB replays are public automatically; superseded attempts require explicit sharing", async () => {
  const f = fixture(),
    a = await f.account("board_owner");
  assert.equal(
    (await f.request("browser-btt/leaderboard?fighter=2")).data.total,
    0,
  );
  const saved = await f.request("browser-btt/runs", post(a, payload(a)));
  let board = await f.request("browser-btt/leaderboard?fighter=2");
  assert.equal(board.data.total, 1);
  assert.equal(board.data.rows[0].frames, 2);
  const automaticKey = new URL(
    board.data.rows[0].replayUrl,
    "https://test.example",
  ).searchParams.get("replay");
  assert.equal(
    (await f.request("browser-btt/shared?share=" + automaticKey)).status,
    200,
  );
  assert.deepEqual(
    (await f.request("browser-btt/replay?share=" + automaticKey)).bytes,
    replay(),
  );
  assert.equal(
    (await f.request("browser-btt/shared?share=" + "f".repeat(64))).status,
    404,
  );
  // A pre-existing index resolves without rewriting or migrating any scores.
  const cold = fixture();
  for (const [key, value] of f.rows) cold.rows.set(key, structuredClone(value));
  assert.deepEqual(
    (await cold.request("browser-btt/replay?share=" + automaticKey)).bytes,
    replay(),
  );
  // Cache snapshots are not authorization: replacing a PB revokes implicit access.
  const index = f.rows.get(`browser-btt/index/${a.id}.json`);
  f.rows.set(`browser-btt/index/${a.id}.json`, { ...index, best: {} });
  assert.equal(
    (await f.request("browser-btt/replay?share=" + automaticKey)).status,
    404,
  );
  f.rows.set(`browser-btt/index/${a.id}.json`, index);
  const shared = await f.request(
    "browser-btt/share",
    post(a, { id: saved.data.run.id }),
  );
  board = await f.request("browser-btt/leaderboard?fighter=2");
  assert.equal(
    board.data.rows[0].replayUrl,
    new URL(shared.data.url).pathname + new URL(shared.data.url).search,
  );
  const key = new URL(shared.data.url).searchParams.get("replay");
  assert.equal(
    (await f.request("browser-btt/shared?share=" + key)).status,
    200,
  );
  assert.deepEqual(
    (await f.request("browser-btt/replay?share=" + key)).bytes,
    replay(),
  );
});

test("total browser leaderboard requires all 25 official stages and counts Zelda/Sheik once", async () => {
  const f = fixture(),
    a = await f.account("total_player"),
    b = await f.account("partial_player");
  const catalog = (await f.request("browser-btt/catalog")).data.characters;
  assert.equal(catalog.length, 26);
  assert.deepEqual(
    catalog.slice(0, 3).map((c) => c.name),
    ["Dr. Mario", "Mario", "Luigi"],
  );
  const best = Object.fromEntries(
    catalog.map((c) => [
      c.fighter,
      {
        id: "a".repeat(64),
        fighter: c.fighter,
        frames: c.fighter === 19 ? 5 : 10,
        status: "browser-recorded",
        createdAt: "2026-10-09T00:00:00Z",
        ucf: "off",
      },
    ]),
  );
  f.rows.set(`browser-btt/index/${a.id}.json`, { best });
  f.rows.set(`browser-btt/index/${b.id}.json`, {
    best: { 18: best[18], 19: best[19] },
  });
  const board = (await f.request("browser-btt/leaderboard?fighter=total")).data;
  assert.equal(board.requiredStages, 25);
  assert.equal(board.total, 1);
  assert.equal(board.rows[0].frames, 245);
  assert.equal(board.rows[0].completed, 25);
  assert.equal(board.inProgress[0].completed, 1);
  assert.equal(board.inProgress[0].frames, null);
  assert.equal(
    (await f.request("browser-btt/leaderboard?fighter=19")).data.total,
    2,
  );
});

test("username display keeps registration case, while login and uniqueness remain case-insensitive", async () => {
  const f = fixture();
  const signup = await f.request("browser-btt/signup", {
    method: "POST",
    body: { username: "MiXeD_Player", password: "test-password-42" },
  });
  assert.equal(signup.status, 200);
  assert.equal(signup.data.profile.displayName, "MiXeD_Player");
  assert.equal(signup.data.profile.slug, "mixed_player");
  const uid = signup.data.profile.id;
  const duplicate = await f.request("browser-btt/signup", {
    method: "POST",
    body: { username: "MIXED_PLAYER", password: "another-password" },
  });
  assert.equal(duplicate.status, 409);
  for (const username of ["mixed_player", "MIXED_PLAYER", "MiXeD_Player"]) {
    const login = await f.request("auth/login", {
      method: "POST",
      body: { username, password: "test-password-42" },
    });
    assert.equal(login.status, 200);
    const session = await f.request("browser-btt/session", {
      cookie: login.headers["set-cookie"].split(";")[0],
    });
    assert.equal(session.data.profile.id, uid);
    assert.equal(session.data.profile.displayName, "MiXeD_Player");
  }
  // A signup interrupted before its profile write can repair the intended case.
  f.rows.delete(`profiles/${uid}.json`);
  const repaired = await f.request("auth/login", {
    method: "POST",
    body: { username: "MIXED_PLAYER", password: "test-password-42" },
  });
  assert.equal(repaired.status, 200);
  assert.equal(f.rows.get(`profiles/${uid}.json`).displayName, "MiXeD_Player");
});

test("live tickets are authenticated, signed for the account, and CSRF protected", async () => {
  const { verify, createPublicKey } = await import("node:crypto");
  const f = fixture(),
    a = await f.account("LivePlayer");
  assert.equal(
    (await f.request("browser-btt/spectate-ticket", { method: "POST" })).status,
    401,
  );
  assert.equal(
    (
      await f.request("browser-btt/spectate-ticket", {
        ...post(a, {}),
        requestOrigin: "https://evil.example",
      })
    ).status,
    403,
  );
  const r = await f.request(
    "browser-btt/spectate-ticket",
    post(a, { slug: "someone_else" }),
  );
  assert.equal(r.status, 200);
  const k = await f.request("browser-btt/spectate-key", {
    requestOrigin: undefined,
  });
  assert.equal(k.status, 200);
  const [payload, sig] = r.data.ticket.split(".");
  assert.ok(
    verify(
      null,
      Buffer.from(payload),
      createPublicKey(k.data.publicKey),
      Buffer.from(sig, "base64url"),
    ),
  );
  const claims = JSON.parse(Buffer.from(payload, "base64url"));
  assert.equal(claims.sub, a.id);
  assert.equal(claims.slug, "liveplayer");
  assert.equal(claims.displayName, "LivePlayer");
  assert.equal(claims.exp - claims.iat, 900);
  assert.equal(r.data.relay, "wss://melee-browser-relay.fly.dev/btt-spectate");
  assert.deepEqual(Object.keys(k.data), ["publicKey"]);
});

test("weekly competition: fresh runs, separate bests, ties, public replay and automatic rollover", async () => {
  const { weeklyRound } = await import("../shared/browser-weekly.mjs");
  let time = Date.parse("2026-10-10T12:00:00+02:00");
  const f = fixture(() => time),
    a = await f.account("WeeklyAlice"),
    b = await f.account("WeeklyBob");
  const round = weeklyRound(1, time),
    options = {
      fighter: 22,
      engine: round.engine,
      startAt: new Date(time).toISOString(),
    };
  const old = await f.request(
    "browser-btt/runs",
    post(
      a,
      payload(
        a,
        replay({ ...options, frames: 1, startAt: "2026-10-09T00:00:00Z" }),
      ),
    ),
  );
  assert.equal(old.status, 200);
  const ticket = async (account) =>
    (await f.request("browser-btt/weekly/entry", post(account, { week: 1 })))
      .data.ticket;
  const ta = await ticket(a),
    tb = await ticket(b);
  const submit = (account, t, opts = {}) =>
    f.request(
      "browser-btt/runs",
      post(account, {
        ...payload(account, replay({ ...options, ...opts })),
        weeklyTicket: t,
      }),
    );
  const first = await submit(a, ta, { frames: 4 });
  assert.equal(first.status, 200);
  assert.equal(first.data.weekly.accepted, true);
  const second = await submit(a, ta, { frames: 3 }),
    tie = await submit(b, tb, { frames: 3 });
  assert.equal(second.data.weekly.accepted, true);
  assert.equal(tie.data.weekly.accepted, true);
  let board = (await f.request("browser-btt/weekly")).data;
  assert.equal(board.total, 2);
  assert.deepEqual(
    board.rows.map((r) => r.rank),
    [1, 1],
  );
  assert.equal(board.rows[0].frames, 3);
  assert.equal(
    f.rows.get(`browser-btt/index/${a.id}.json`).best[22].frames,
    1,
    "All-time best is independent",
  );
  const share = new URL(
    board.rows[0].replayUrl,
    "https://test.example",
  ).searchParams.get("replay");
  assert.equal(
    (await f.request("browser-btt/replay?share=" + share)).status,
    200,
  );
  assert.equal(
    (await submit(a, ta, { frames: 6, startAt: "2026-10-09T00:00:00Z" })).data
      .weekly.accepted,
    false,
  );
  assert.equal(
    (await submit(a, ta, { frames: 7, fighter: 2 })).data.weekly.accepted,
    false,
  );
  assert.equal(
    (await submit(a, ta, { frames: 8, engine: "b".repeat(64) })).data.weekly
      .accepted,
    false,
  );
  assert.equal(
    (await submit(a, tb, { frames: 9 })).data.weekly.accepted,
    false,
  );
  assert.equal(
    (await submit(a, ta + "x", { frames: 10 })).data.weekly.accepted,
    false,
  );
  assert.equal(
    (await submit(a, ta, { frames: 11, practice: true })).status,
    400,
  );
  time = Date.parse(round.endsAt);
  assert.equal(
    (await submit(a, ta, { frames: 12 })).data.weekly.accepted,
    false,
    "Deadline is exclusive",
  );
  board = (await f.request("browser-btt/weekly")).data;
  assert.equal(board.round.number, 2);
  assert.equal(board.round.character.fighter, 8);
  assert.equal(board.total, 0);
  const archive = (await f.request("browser-btt/weekly?week=1")).data;
  assert.equal(archive.round.status, "closed");
  assert.equal(archive.total, 2);
  const retry = await submit(a, ta, { frames: 3 });
  assert.equal(
    retry.data.weekly.accepted,
    true,
    "Idempotent saved entry remains eligible after closure",
  );
  assert.equal(
    (await f.request("browser-btt/weekly?week=1")).data.rows[0].frames,
    3,
  );
  assert.equal(
    (await f.request("browser-btt/replay?share=" + share)).status,
    200,
    "Archive replay remains public",
  );
  assert.equal(
    (await f.request("browser-btt/weekly/entry", post(a, { week: 1 }))).status,
    409,
  );
  assert.equal(
    (
      await f.request("browser-btt/weekly/entry", {
        method: "POST",
        body: { week: 2 },
      })
    ).status,
    401,
  );
});

test("weekly upload retry after storage failure preserves pre-deadline admission and never replaces a faster run", async () => {
  const { weeklyRound } = await import("../shared/browser-weekly.mjs");
  let time = Date.parse("2026-10-11T23:59:00+02:00");
  const f = fixture(() => time),
    a = await f.account("WeeklyRetry"),
    round = weeklyRound(1, time);
  const t = await f.request("browser-btt/weekly/entry", post(a, { week: 1 }));
  const bytes = replay({
    fighter: 22,
    engine: round.engine,
    startAt: new Date(time).toISOString(),
    frames: 6,
  });
  const body = { ...payload(a, bytes), weeklyTicket: t.data.ticket },
    put = f.store.put;
  f.store.put = async (path, ...args) => {
    if (path.startsWith("browser-btt/weekly/"))
      throw Error("temporary failure");
    return put(path, ...args);
  };
  assert.equal(
    (await f.request("browser-btt/runs", post(a, body))).status,
    503,
  );
  time = Date.parse(round.endsAt) + 1000;
  f.store.put = put;
  assert.equal(
    (await f.request("browser-btt/runs", post(a, body))).data.weekly.accepted,
    true,
  );
  assert.equal(
    (await f.request("browser-btt/weekly?week=1")).data.rows[0].frames,
    6,
  );
  assert.equal((await f.request("browser-btt/weekly?week=2")).data.total, 0);
  assert.equal(
    (await f.request("browser-btt/weekly/entry", post(a, { week: "nope" })))
      .status,
    404,
  );
});

test("normal play automatically enters only fresh matching weekly runs, without an entry ticket", async () => {
  const { weeklyRound } = await import("../shared/browser-weekly.mjs");
  let time = Date.parse("2026-10-10T08:10:53Z");
  const f = fixture(() => time),
    a = await f.account("AutoWeekly"),
    r = weeklyRound(1, time);
  const opts = {
    fighter: 22,
    engine: r.engine,
    startAt: "2026-10-10T08:10:35Z",
  };
  const submit = (extra) =>
    f.request(
      "browser-btt/runs",
      post(a, payload(a, replay({ ...opts, ...extra }))),
    );
  const run = await submit({ frames: 804 });
  assert.equal(run.status, 200);
  assert.equal(run.data.weekly.accepted, true);
  assert.equal(run.data.weekly.number, 1);
  const board = (await f.request("browser-btt/weekly")).data;
  assert.equal(board.total, 1);
  assert.equal(board.rows[0].frames, 804);
  for (const extra of [
    { frames: 2, startAt: "2026-10-09T12:00:00Z" },
    { frames: 3, fighter: 2 },
    { frames: 4, engine: "b".repeat(64) },
    { frames: 5, startAt: "2026-10-10T10:00:00Z" },
  ])
    assert.equal((await submit(extra)).data.weekly, null);
  assert.equal((await submit({ frames: 6, practice: true })).status, 400);
  time = Date.parse(r.endsAt);
  assert.equal((await submit({ frames: 7 })).data.weekly, null);
  assert.equal(
    (await f.request("browser-btt/weekly?week=1")).data.rows[0].frames,
    804,
  );
  assert.equal((await f.request("browser-btt/weekly")).data.total, 0);
});
