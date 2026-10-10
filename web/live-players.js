const relay = "wss://melee-browser-relay.fly.dev/btt-spectate";
const rows = document.getElementById("live-player-rows"),
  status = document.getElementById("live-players-status"),
  count = document.getElementById("live-players-count"),
  characters = new Map(),
  entries = new Map();
let socket,
  retry,
  timeout,
  stopped = false,
  players = [];

function render(list) {
  players = list;
  count.textContent = String(list.length);
  status.textContent = list.length
    ? "Watch a live Target Test in one click."
    : "No players are broadcasting right now. Check back soon.";
  const active = new Set(list.map((p) => p.slug));
  for (const [slug, entry] of entries) {
    if (!active.has(slug)) {
      entry.row.remove();
      entries.delete(slug);
    }
  }
  list.forEach((p, index) => {
    let entry = entries.get(p.slug);
    if (!entry) {
      const row = document.createElement("tr");
      const cells = Array.from({ length: 4 }, () =>
        row.appendChild(document.createElement("td")),
      );
      const link = document.createElement("a");
      link.className = "spectate-link";
      link.textContent = "Spectate →";
      link.href = "/play/spectate.html?user=" + encodeURIComponent(p.slug);
      cells[3].append(link);
      entry = { row, cells, link };
      entries.set(p.slug, entry);
    }
    const { row, cells, link } = entry;
    cells[0].textContent = p.displayName;
    cells[1].textContent =
      p.fighter == null ? "—" : characters.get(p.fighter) || "Target Test";
    cells[2].textContent =
      p.status === "waiting"
        ? "Choosing a character"
        : p.status === "ended"
          ? "Run ended"
          : "Playing";
    cells[2].className = "live-player-state";
    link.setAttribute("aria-label", "Spectate " + p.displayName);
    // Keep existing links focused and clickable while statuses change.
    if (rows.children[index] !== row)
      rows.insertBefore(row, rows.children[index] || null);
  });
}
function unavailable(message) {
  players = [];
  entries.clear();
  rows.replaceChildren();
  count.textContent = "—";
  status.textContent = message;
}
function connect() {
  if (stopped) return;
  clearTimeout(retry);
  unavailable("Connecting to live players…");
  const ws = (socket = new WebSocket(relay));
  timeout = setTimeout(() => ws.close(), 15000);
  ws.onopen = () => ws.send(JSON.stringify({ type: "directory" }));
  ws.onmessage = (event) => {
    if (socket !== ws || stopped) return;
    try {
      const data = JSON.parse(event.data);
      if (data.type !== "directory" || !Array.isArray(data.players))
        throw Error("Invalid directory");
      clearTimeout(timeout);
      render(data.players);
    } catch {
      ws.close();
    }
  };
  ws.onerror = () => ws.close();
  ws.onclose = () => {
    if (socket !== ws) return;
    clearTimeout(timeout);
    if (stopped) return;
    unavailable("Live players are temporarily unavailable. Reconnecting…");
    retry = setTimeout(connect, 3000);
  };
}
fetch("/api/browser-btt/catalog", { signal: AbortSignal.timeout(10000) })
  .then((r) => {
    if (!r.ok) throw Error("Catalog unavailable");
    return r.json();
  })
  .then(({ characters: list }) => {
    for (const c of list) characters.set(c.fighter, c.name);
    if (players.length) render(players);
  })
  .catch(() => {}); // The directory remains usable if character names cannot load.
window.addEventListener("pagehide", () => {
  stopped = true;
  clearTimeout(retry);
  clearTimeout(timeout);
  socket?.close();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    stopped = false;
    connect();
  }
});
connect();
