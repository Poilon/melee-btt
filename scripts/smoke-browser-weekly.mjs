import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.connectOverCDP("http://localhost:9333"),
  context = await browser.newContext(),
  p = await context.newPage(),
  errors = [];
p.on("pageerror", (e) => errors.push(e.message));
try {
  await context.route(/\/adapter-bridge\.mjs$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export class AdapterBridge{constructor(){}connect(){}postMessage(){}terminate(){}}",
    }),
  );
  await context.route(/\/btt\.mjs$/, async (route) => {
    const r = await route.fetch();
    await route.fulfill({
      response: r,
      body: (await r.text()).replace(
        "const transport = new ReplayTransport();",
        "globalThis.weeklyTest={library,weekly};\nconst transport = new ReplayTransport();",
      ),
    });
  });
  await p.goto("http://localhost:4331/weekly.html");
  await p.waitForFunction(() =>
    document.querySelector("#title").textContent.includes("Weekly #"),
  );
  const title = await p.locator("#title").textContent();
  await p.locator("#enter").click();
  await p.waitForFunction(
    () => !document.querySelector("#play").disabled,
    null,
    { timeout: 30000 },
  );
  assert.ok(await p.locator("#weekly-banner").isVisible());
  assert.ok(await p.locator("#fighter").isDisabled());
  await p.locator("#play").click();
  await p.waitForFunction(() => !!document.querySelector("dialog[open]"));
  const signup = await p.evaluate(async () => {
    const r = await fetch("/api/browser-btt/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "WeeklySmoke",
        password: "local-test-password-42",
      }),
    });
    return r.status;
  });
  assert.equal(signup, 200);
  await p.reload();
  await p.waitForFunction(() => !document.querySelector("#play").disabled);
  await p.locator("#play").click();
  await p.waitForFunction(() => globalThis.meleeDebug?.frame > 155, null, {
    timeout: 90000,
  });
  const round = await p.evaluate(() => weeklyTest.weekly.round);
  assert.equal(
    await p.locator("#fighter").inputValue(),
    String(round.character.fighter),
  );
  assert.match(p.url(), /weekly=/);
  await p.locator("#restart").click();
  await p.waitForFunction(() => meleeDebug.frame < 100);
  await p.waitForFunction(() => meleeDebug.frame > 160);
  assert.ok(await p.locator("#fighter").isDisabled());
  // Exercise the production IndexedDB/compression/upload flow with a synthetic
  // completed replay in this in-memory fixture, never against production.
  await p.evaluate(async () => {
    const { BttRecorder } = await import("/play/shared/btt-replay.mjs"),
      { weekly, library } = weeklyTest;
    const recorder = new BttRecorder({
      fighter: weekly.round.character.fighter,
      engine: weekly.round.engine,
      startAt: weekly.startAt(),
    });
    const state = [
      1, 2, 3, 0, 1, 14, 2, 1, 10, 10, 0, 0, 0, 0, 0, 0, 15, 0, 0, 0,
    ];
    for (let i = 0; i < 4; i++) {
      const before = state.slice();
      state[10] = i;
      state[8] = i === 3 ? 0 : 10;
      recorder.record(
        [1, 0, 0, 128, 128, 128, 128, 0, 0],
        before,
        state,
        false,
        true,
      );
    }
    await library.save(recorder.finish({ complete: true }), {
      weeklyTicket: weekly.ticket,
    });
  });
  await p.waitForFunction(() =>
    document
      .querySelector("#weekly-save-status")
      .textContent.includes("Entered Weekly"),
  );
  const status = await p.locator("#weekly-save-status").textContent();
  const board = await context.newPage();
  await board.goto("http://localhost:4331/weekly.html");
  await board.waitForFunction(() =>
    document.querySelector("#rows").textContent.includes("WeeklySmoke"),
  );
  assert.equal(await board.locator("#rows tr").count(), 1);
  assert.match(await board.locator("#rows").textContent(), /00:00.05/);
  const replay = await board.locator("#rows a").first().getAttribute("href"),
    token = new URL(replay, "http://localhost:4331").searchParams.get("replay");
  const download = await context.request.get(
    "http://localhost:4331/api/browser-btt/replay?share=" + token,
  );
  assert.equal(download.status(), 200);
  await board.screenshot({ path: ".cache/weekly-smoke.png", fullPage: true });
  const hasOverflow = await board.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(hasOverflow, false);
  await board.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await board.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  console.log(
    JSON.stringify({ title, status, publicReplay: download.status(), errors }),
  );
  assert.deepEqual(errors, []);
} finally {
  await context.close();
  await browser.close();
}
