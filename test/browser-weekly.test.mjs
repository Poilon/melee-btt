import test from "node:test";
import assert from "node:assert/strict";
import {
  currentWeek,
  weeklyRound,
  WEEKLY_LAUNCH,
} from "../shared/browser-weekly.mjs";
test("weekly calendar: opening round, Monday boundary, winter and summer Paris time", () => {
  assert.equal(weeklyRound(1, WEEKLY_LAUNCH - 1).status, "upcoming");
  assert.equal(weeklyRound(1, WEEKLY_LAUNCH).status, "active");
  assert.equal(currentWeek(Date.parse("2026-10-11T23:59:59+02:00")), 1);
  assert.equal(currentWeek(Date.parse("2026-10-12T00:00:00+02:00")), 2);
  assert.equal(weeklyRound(2).startsAt, "2026-10-11T22:00:00.000Z");
  assert.equal(weeklyRound(3).endsAt, "2026-10-25T23:00:00.000Z");
  assert.equal(
    (Date.parse(weeklyRound(3).endsAt) - Date.parse(weeklyRound(3).startsAt)) /
      3600000,
    169,
  );
  const spring = weeklyRound(currentWeek(Date.parse("2027-03-23T12:00:00Z")));
  assert.equal(
    (Date.parse(spring.endsAt) - Date.parse(spring.startsAt)) / 3600000,
    167,
  );
  assert.equal(
    weeklyRound(27).character.fighter,
    weeklyRound(1).character.fighter,
  );
  assert.throws(() => weeklyRound(NaN));
  assert.throws(() => weeklyRound(0));
});
