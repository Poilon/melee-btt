import test from "node:test";
import assert from "node:assert/strict";
import data from "../shared/ntsc-world-records.json" with { type: "json" };
import { ntscWorldRecord } from "../shared/ntsc-world-records.mjs";
import { browserBttCatalog } from "../shared/browser-btt-catalog.mjs";
import { formatSeconds } from "../web/time.js";

test("NTSC snapshot covers all 25 courses, preserves source times and holder proofs", () => {
  assert.equal(data.records.length, 25);
  assert.equal(new Set(data.records.map(r => r.stage)).size, 25);
  for (const fighter of browserBttCatalog) {
    const record = ntscWorldRecord(fighter.fighter);
    assert.equal(record.stage, fighter.stage);
    assert.equal(record.region, "NTSC");
    assert.equal(record.time, formatSeconds(record.frames));
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
