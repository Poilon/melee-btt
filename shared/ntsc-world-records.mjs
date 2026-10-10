import data from "./ntsc-world-records.json" with { type: "json" };

// A dated snapshot of the community spreadsheet, independent of browser PBs.
// Holder IDs survive username changes. Set accountSlug only after confirming
// the account belongs to that holder; matching display names is not proof.
// replayUrl stays null until a faithful replay is available and verified.
export function ntscWorldRecord(fighter) {
  const total = fighter === "total";
  const record = total
    ? {
        kind: "sum-of-world-records",
        frames: data.records.reduce((sum, r) => sum + r.frames, 0),
        stages: data.records.length,
        holders: [],
        videos: [],
        replayUrl: null,
      }
    : data.records.find((r) => r.stage === (Number(fighter) === 19 ? 18 : Number(fighter)));
  if (!record) return null;
  return {
    ...record,
    kind: record.kind || "world-record",
    holders: record.holders.map((id) => ({ id, ...data.holders[id] })),
    source: data.source,
    retrievedAt: data.retrievedAt,
    region: data.region,
  };
}
