import { formatTime } from "/time.js";
const $ = (id) => document.getElementById(id),
  params = new URLSearchParams(location.search);
let number = params.get("week"),
  offset = 0,
  data,
  base = 0,
  received = 0,
  busy = false,
  controller;
const date = (value) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
function clock() {
  if (!data) return;
  const now = base + performance.now() - received,
    round = data.round;
  const target = Date.parse(
      round.status === "upcoming" ? round.startsAt : round.endsAt,
    ),
    seconds = Math.max(0, Math.ceil((target - now) / 1000));
  $("countdown").textContent =
    round.status === "closed"
      ? "Final results"
      : `${round.status === "upcoming" ? "Starts in " : "Ends in "}${Math.floor(seconds / 86400)}d ${String(Math.floor(seconds / 3600) % 24).padStart(2, "0")}h ${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}m ${String(seconds % 60).padStart(2, "0")}s`;
  if (seconds === 0 && round.status !== "closed" && !busy) {
    offset = 0;
    load();
  }
}
async function load() {
  if (busy) return;
  busy = true;
  $("refresh").disabled = true;
  $("previous").disabled = true;
  $("next").disabled = true;
  try {
    controller?.abort();
    controller = new AbortController();
    const response = await fetch(
      "/api/browser-btt/weekly?" +
        new URLSearchParams({ ...(number ? { week: number } : {}), offset }),
      {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(20000),
        ]),
      },
    );
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Competition unavailable.");
    data = result;
    base = result.serverTime;
    received = performance.now();
    const r = data.round;
    $("title").textContent = `Weekly #${r.number} · ${r.character.name}`;
    $("dates").textContent =
      `${date(r.startsAt)} — ${date(r.endsAt)} · Europe/Paris`;
    $("phase").textContent =
      r.status === "closed"
        ? "ARCHIVED RESULTS"
        : r.status === "upcoming"
          ? "UPCOMING"
          : "LIVE COMPETITION";
    $("board-title").textContent = r.character.name + " · Original Target Test";
    $("portrait").src =
      "/assets/melee/" +
      r.character.slug +
      (r.character.fighter === 19 ? "-portrait.png" : ".webp");
    $("portrait").hidden = false;
    $("enter").hidden = r.status !== "active";
    $("enter").href = r.playUrl;
    $("next-round").textContent =
      `Next up: Weekly #${data.next.number} · ${data.next.character.name} · ${date(data.next.startsAt)} (Paris)`;
    $("rows").replaceChildren(
      ...data.rows.map((record) => {
        const row = document.createElement("tr");
        for (const value of [
          record.rank,
          record.username,
          formatTime(record.frames),
          record.ucf,
        ]) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        }
        const actions = document.createElement("td"),
          watch = document.createElement("a");
        watch.href = record.replayUrl;
        watch.textContent = "Replay";
        actions.append(watch);
        if (r.status === "active") {
          const live = document.createElement("a");
          live.href =
            "/play/spectate.html?user=" +
            encodeURIComponent(record.slug || record.username);
          live.textContent = "Live";
          actions.append(live);
        }
        row.append(actions);
        return row;
      }),
    );
    $("status").textContent = data.total
      ? `${data.total} player${data.total === 1 ? "" : "s"} · Best time per player${r.status === "active" ? " · Updates every 30 seconds" : ""}`
      : r.status === "closed"
        ? "No entries were submitted."
        : r.status === "upcoming"
          ? "This competition has not started yet."
          : "No times yet. Set the first time!";
    $("previous").disabled = offset === 0;
    $("next").disabled = offset + 100 >= data.total;
    $("page-count").textContent = data.total
      ? `${offset + 1}–${Math.min(offset + 100, data.total)} / ${data.total}`
      : "";
    $("older").hidden = !data.previous;
    $("older").href = "/weekly.html?week=" + data.previous;
    $("newer").hidden = !data.following;
    $("newer").href = "/weekly.html?week=" + data.following;
    clock();
  } catch (e) {
    $("status").textContent = e.message + " Use Refresh to retry.";
  } finally {
    busy = false;
    $("refresh").disabled = false;
  }
}
$("refresh").onclick = () => load();
$("previous").onclick = () => {
  offset = Math.max(0, offset - 100);
  load();
};
$("next").onclick = () => {
  offset += 100;
  load();
};
setInterval(clock, 1000);
setInterval(() => {
  if (!document.hidden && data?.round.status !== "closed") load();
}, 30000);
load();
