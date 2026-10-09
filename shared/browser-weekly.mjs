import { browserBttCatalog } from "./browser-btt-catalog.mjs";
const DAY = 86400000,
  MONDAY = Date.UTC(2026, 9, 12);
export const WEEKLY_LAUNCH = Date.parse("2026-10-10T00:00:00+02:00");
// Append future changes with a new fromWeek; never change an existing week's engine.
export const WEEKLY_ENGINES = [
  {
    fromWeek: 1,
    engine: "a8a3520d917b8ab058a625cd3afde695e6b2e8c16f9d9bfaec579f37cc294264",
  },
];
const paris = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function parts(time) {
  return Object.fromEntries(
    paris
      .formatToParts(time)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
}
function midnight(day) {
  let time = day;
  for (let i = 0; i < 3; i++) {
    const p = parts(time),
      local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    time += day - local;
  }
  return time;
}
export function currentWeek(now) {
  const p = parts(now),
    day = Date.UTC(p.year, p.month - 1, p.day);
  return Math.max(1, 2 + Math.floor((day - MONDAY) / (7 * DAY)));
}
export function weeklyRound(number, now = Date.now()) {
  if (!Number.isSafeInteger(number) || number < 1 || number > 100000)
    throw Error("Invalid competition.");
  const starts =
    number === 1 ? WEEKLY_LAUNCH : midnight(MONDAY + (number - 2) * 7 * DAY);
  const ends = midnight(MONDAY + (number - 1) * 7 * DAY);
  const character = browserBttCatalog[(number - 1) % browserBttCatalog.length];
  const engine = WEEKLY_ENGINES.filter((v) => v.fromWeek <= number).at(
    -1,
  ).engine;
  return {
    number,
    id: `weekly-${number}`,
    character,
    engine,
    startsAt: new Date(starts).toISOString(),
    endsAt: new Date(ends).toISOString(),
    timezone: "Europe/Paris",
    status: now < starts ? "upcoming" : now >= ends ? "closed" : "active",
    playUrl: `/play?weekly=${number}&fighter=${character.fighter}`,
    rules: {
      ucf: "on-or-off",
      cstickAttacks: false,
      takeover: false,
      submission: "received-before-deadline",
      verification: "browser-recorded",
    },
  };
}
