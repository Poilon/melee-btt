import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { createCloudHandler } from "../cloud/backend.mjs";
import { BttRecorder } from "../shared/browser-btt-replay.mjs";
function replay({ practice = false, complete = true, ucf = true } = {}) {
  const r = new BttRecorder({
    fighter: 2,
    engine: "a".repeat(64),
    startAt: "2026-10-09T00:00:00.000Z",
  });
  const s = [1, 2, 3, 0, 1, 14, 2, 1, 10, 10, 0, 0, 0, 0, 0, 0, 15, 0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const before = s.slice();
    s[10] = i;
    s[8] = complete && i === 2 ? 0 : 10;
    r.record([1, 0, 0, 128, 128, 128, 128, 0, 0], before, s, practice, ucf);
  }
  return Buffer.from(r.finish({ complete, practice }));
}
function fixture() {
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
  return { rows, request, account };
}
const post = (a, body) => ({ method: "POST", cookie: a.cookie, body });
const payload = (a, bytes = replay()) => ({
  owner: a.id,
  gzip: gzipSync(bytes).toString("base64"),
});
test("browser signup reuses site session; completed runs are idempotent, private, and shareable explicitly", async () => {
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
