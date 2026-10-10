import test from "node:test";
import assert from "node:assert/strict";
import data from "../shared/ntsc-world-records.json" with { type: "json" };
import { ntscWorldRecord } from "../shared/ntsc-world-records.mjs";
import { browserBttCatalog } from "../shared/browser-btt-catalog.mjs";
import { formatSeconds } from "../web/time.js";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseBttReplay } from "../shared/browser-btt-replay.mjs";

test("NTSC snapshot covers all 25 courses, preserves source times and holder proofs", () => {
  assert.equal(data.records.length, 25);
  assert.equal(new Set(data.records.map(r => r.stage)).size, 25);
  for (const fighter of browserBttCatalog) {
    const record = ntscWorldRecord(fighter.fighter);
    assert.equal(record.stage, fighter.stage);
    assert.equal(record.region, "NTSC");
    assert.equal(record.time, formatSeconds(record.frames));
    if (!record.reconstruction)
      assert.equal(record.replayUrl, null, "unverified reconstructions must not be offered as WR replays");
    assert.ok(record.holders.length);
    for (const holder of record.holders) {
      assert.equal(holder.accountSlug, null, "do not claim an account by matching names");
      const proof = record.videos.find(v => v.player === holder.name);
      assert.ok(proof);
      assert.ok(["www.youtube.com", "youtu.be"].includes(new URL(proof.url).hostname));
    }
  }
  assert.equal(ntscWorldRecord(999), null);
});

test("published WR reconstructions are checksum-pinned, complete practice replays with matching times", async () => {
  for (const record of data.records.filter(r => r.reconstruction)) {
    const replay = record.reconstruction;
    assert.equal(replay.downloadUrl, `/world-record-replays/${replay.sha256}.slp`);
    const bytes = await readFile(new URL(`../web${replay.downloadUrl}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), replay.sha256);
    const parsed = parseBttReplay(bytes);
    assert.equal(parsed.complete, true);
    assert.equal(parsed.practice, true);
    assert.equal(parsed.frames, record.frames);
    assert.equal(parsed.fighter, record.stage);
    assert.equal(parsed.engine, replay.engine);
    const evidence = JSON.parse(await readFile(new URL(`../web${replay.evidenceUrl}`, import.meta.url)));
    assert.equal(evidence.sha256, replay.sha256);
    assert.equal(evidence.kind, "video-reconstruction");
    assert.equal(evidence.verification.reconstructedTargetTransitions.at(-1).remaining, 0);
  }
});

test("NTSC reference preserves ties, shared stage, and a distinct sum of records", () => {
  assert.equal(ntscWorldRecord(22).time, "12.87");
  assert.equal(ntscWorldRecord(22).holders[0].name, "Samplay");
  assert.deepEqual(ntscWorldRecord(23).holders.map(h => h.name), ["Judge9", "Mario 64 Master"]);
  assert.equal(ntscWorldRecord(23).videos.length, 2);
  assert.deepEqual(ntscWorldRecord(18), ntscWorldRecord(19));
  const total = ntscWorldRecord("total");
  assert.equal(total.kind, "sum-of-world-records");
  assert.equal(total.frames, 10505);
  assert.equal(total.stages, 25);
  assert.deepEqual(total.holders, []);
});
