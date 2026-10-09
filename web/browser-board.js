// Keep existing companion sign-in and archived challenge bookmarks working.
const legacy = new URLSearchParams(location.search);
if (legacy.has("event"))
  location.replace("/custom-stages.html" + location.search + location.hash);
else if (
  location.hash.startsWith("#signin=") ||
  ["character", "challenge", "connect"].some((key) => legacy.has(key)) ||
  ["#profil", "#old-challenges", "#parcours", "#records-legacy"].includes(
    location.hash,
  )
)
  location.replace("/legacy-challenge.html" + location.search + location.hash);
const $ = (id) => document.getElementById(id);
let catalog = [],
  selected,
  offset = 0,
  request = 0,
  total = 0,
  controller;
const cache = new Map();
const totalCourse = { fighter: "total", slug: "total", name: "Total time" };
const time = (frames) =>
  `${Math.floor(frames / 3600)}:${String(Math.floor(frames / 60) % 60).padStart(2, "0")}.${String(Math.floor(((frames % 60) * 100) / 60)).padStart(2, "0")}`;
async function json(url, signal) {
  const response = await fetch(url, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || "Could not load browser records.");
  return data;
}
function controls(busy) {
  $("refresh").disabled = busy;
  $("previous").disabled = busy || offset === 0;
  $("next").disabled = busy || offset + 100 >= total;
  $("rows").setAttribute("aria-busy", String(busy));
}
function loading() {
  $("rows").replaceChildren(
    ...Array.from({ length: 5 }, () => {
      const row = document.createElement("tr");
      row.className = "skeleton";
      row.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 5; i++) row.append(document.createElement("td"));
      return row;
    }),
  );
}
async function show(character, from = 0, force = false) {
  const seq = ++request;
  controller?.abort();
  controller = new AbortController();
  const isTotal = character.fighter === "total";
  selected = character;
  offset = from;
  controls(true);
  loading();
  $("status").textContent = "Loading browser records…";
  $("page-count").textContent = "";
  $("character-name").textContent = isTotal
    ? "ALL OFFICIAL STAGES"
    : "OFFICIAL TARGET TEST";
  $("level-name").textContent = character.name;
  $("detail-heading").textContent = isTotal ? "Completed" : "Replay";
  $("settings-heading").textContent = isTotal ? "" : "UCF";
  $("play-character").href = isTotal
    ? "/play"
    : `/play?fighter=${character.fighter}`;
  $("play-character").textContent = isTotal
    ? "Play in browser →"
    : `Play ${character.name} →`;
  for (const button of $("characters").children)
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.id === String(character.fighter)),
    );
  history.replaceState(null, "", "#" + character.slug);
  try {
    const key = `${character.fighter}:${offset}`,
      old = cache.get(key);
    const board =
      !force && old && Date.now() - old.at < 15000
        ? old.board
        : await json(
            `/api/browser-btt/leaderboard?fighter=${character.fighter}&offset=${offset}`,
            controller.signal,
          );
    if (seq !== request) return;
    cache.set(key, { board, at: Date.now() });
    total = board.total;
    const displayed =
      isTotal && offset === 0
        ? [...board.rows, ...board.inProgress]
        : board.rows;
    $("rows").replaceChildren(
      ...displayed.map((record) => {
        const row = document.createElement("tr");
        for (const value of [
          record.rank ?? "—",
          record.username,
          record.frames === null ? "—" : time(record.frames),
          isTotal
            ? ""
            : { on: "On", off: "Off", mixed: "Mixed" }[record.ucf] || "—",
        ]) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        }
        const cell = document.createElement("td");
        if (isTotal)
          cell.textContent = `${record.completed} / ${board.requiredStages}`;
        else if (record.replayUrl) {
          const links = document.createElement("div");
          links.className = "replay-links";
          const watch = document.createElement("a");
          watch.textContent = "Watch";
          watch.href = record.replayUrl;
          watch.setAttribute("aria-label", `Watch ${record.username}'s replay`);
          const download = document.createElement("a");
          download.textContent = ".slp ↓";
          download.download = "";
          download.href =
            "/api/browser-btt/replay?share=" +
            new URL(record.replayUrl, location.origin).searchParams.get(
              "replay",
            );
          download.setAttribute(
            "aria-label",
            `Download ${record.username}'s replay`,
          );
          links.append(watch, download);
          cell.append(links);
        } else {
          cell.textContent = "Not shared";
          cell.className = "replay-private";
        }
        row.append(cell);
        return row;
      }),
    );
    $("status").textContent = isTotal
      ? `Sum of best times across ${board.requiredStages} stages. Zelda / Sheik count once, using the faster clear. Complete every stage to rank.`
      : total
        ? `${total} player${total === 1 ? "" : "s"} · Best browser time per player${character.fighter === 19 ? " · Zelda’s stage" : ""}`
        : "No saved browser records yet. Be the first to clear this stage.";
    $("page-count").textContent = total
      ? `${offset + 1}–${Math.min(offset + 100, total)} of ${total}`
      : "";
  } catch (error) {
    if (seq !== request) return;
    $("rows").replaceChildren();
    total = 0;
    $("status").textContent =
      error.name === "TimeoutError"
        ? "The server took too long. Try Refresh."
        : error.message;
  } finally {
    if (seq === request) controls(false);
  }
}
async function load() {
  controls(true);
  try {
    const data = await json("/api/browser-btt/catalog");
    catalog = data.characters;
    $("characters").replaceChildren(
      ...[totalCourse, ...catalog].map((character) => {
        const button = document.createElement("button");
        button.className = "character";
        button.dataset.id = String(character.fighter);
        button.setAttribute("aria-pressed", "false");
        const img = document.createElement("img");
        img.src =
          character.fighter === "total"
            ? "/target.svg"
            : `/assets/melee/${character.slug}-portrait.${character.slug === "sheik" ? "png" : "webp"}`;
        img.alt = "";
        const name = document.createElement("span");
        name.textContent = character.name;
        button.append(img, name);
        button.onclick = () => show(character);
        return button;
      }),
    );
    await show(
      location.hash === "#total"
        ? totalCourse
        : catalog.find((c) => location.hash === "#" + c.slug) || catalog[0],
    );
  } catch {
    $("status").textContent = "Could not load the leaderboard. Try Refresh.";
    controls(false);
  }
}
$("refresh").onclick = () => (selected ? show(selected, offset, true) : load());
$("previous").onclick = () => show(selected, Math.max(0, offset - 100));
$("next").onclick = () => show(selected, offset + 100);
await load();
