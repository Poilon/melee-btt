import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const browser = await chromium.connectOverCDP("http://localhost:9333");
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
try {
  const errors = [],
    connections = [];
  const config = JSON.parse(await readFile(".deploy/vercel.json", "utf8"));
  const policy = config.headers[0].headers.find(
    (h) => h.key === "Content-Security-Policy",
  ).value;
  await context.route("http://localhost:4331/", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": policy },
    });
  });
  await context.routeWebSocket(
    "wss://melee-browser-relay.fly.dev/btt-spectate",
    (ws) => {
      connections.push(ws);
      ws.onMessage((raw) => {
        const message = JSON.parse(raw);
        if (message.type === "watch")
          ws.send(JSON.stringify({ type: "offline" }));
        else {
          assert.equal(message.type, "directory");
          ws.send(JSON.stringify({ type: "directory", players: [] }));
        }
      });
    },
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:4331/");
  await page.waitForFunction(
    () => document.querySelector("#live-players-count").textContent === "0",
  );
  assert.match(
    await page.locator("#live-players-status").textContent(),
    /No players/,
  );
  const players = [
    { slug: "alice", displayName: "Alice", fighter: null, status: "waiting" },
    { slug: "poilon", displayName: "Poilon", fighter: 22, status: "playing" },
    {
      slug: "zebra",
      displayName: "<b>Not HTML</b>",
      fighter: 2,
      status: "ended",
    },
  ];
  const send = (list) =>
    connections
      .at(-1)
      .send(JSON.stringify({ type: "directory", players: list }));
  send(players);
  await page.waitForFunction(
    () => document.querySelectorAll("#live-player-rows tr").length === 3,
  );
  await page.getByRole("cell", { name: "Dr. Mario", exact: true }).waitFor();
  assert.equal(await page.locator("#live-player-rows b").count(), 0);
  const link = page.getByRole("link", { name: "Spectate Poilon", exact: true });
  await link.focus();
  send(
    players.map((p) => (p.slug === "poilon" ? { ...p, status: "ended" } : p)),
  );
  await page.waitForFunction(
    () =>
      document.querySelectorAll("#live-player-rows tr")[1].cells[2]
        .textContent === "Run ended",
  );
  assert.equal(await link.evaluate((e) => e === document.activeElement), true);
  await page
    .locator("#live-players")
    .screenshot({ path: ".cache/home-live-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#live-players").scrollIntoViewIfNeeded();
  assert.equal(
    await page
      .locator("#live-players .table-scroll")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
    true,
  );
  await page
    .locator("#live-players")
    .screenshot({ path: ".cache/home-live-mobile.png" });
  send([players[1]]);
  await page.waitForFunction(
    () => document.querySelectorAll("#live-player-rows tr").length === 1,
  );
  connections.at(-1).close();
  await page.waitForFunction(() =>
    document
      .querySelector("#live-players-status")
      .textContent.includes("unavailable"),
  );
  assert.equal(await page.locator("#live-player-rows tr").count(), 0);
  await page.waitForFunction(
    () => document.querySelector("#live-players-count").textContent === "0",
  );
  assert.equal(connections.length, 2);
  send([players[1]]);
  await link.click();
  await page.waitForURL("**/play/spectate.html?user=poilon");
  assert.deepEqual(errors, []);
  console.log(
    "Home live table: desktop/mobile, empty/live/disconnected/reconnect, safe names, retained focus and one-click Spectate passed.",
  );
} finally {
  await context.close();
  await browser.close();
}
