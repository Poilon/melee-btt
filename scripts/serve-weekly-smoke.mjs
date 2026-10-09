// Ephemeral local accounts/scores only. Build .deploy before running this fixture.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createCloudHandler } from "../cloud/backend.mjs";
const rows = new Map(),
  versions = new Map();
const store = {
  get: async (k) => structuredClone(rows.get(k) || null),
  put: async (k, v, overwrite) => {
    if (rows.has(k) && !overwrite) throw Error("exists");
    rows.set(k, structuredClone(v));
    versions.set(k, (versions.get(k) || 0) + 1);
  },
  readVersion: async (k) =>
    rows.has(k)
      ? { value: structuredClone(rows.get(k)), etag: versions.get(k) }
      : null,
  writeVersion: async (k, v, e) => {
    if (versions.get(k) !== e) return false;
    rows.set(k, structuredClone(v));
    versions.set(k, e + 1);
    return true;
  },
  delete: async (k) => rows.delete(k),
  list: async (prefix) =>
    [...rows.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((pathname) => ({ pathname })),
};
const handler = createCloudHandler({
  store,
  origin: "http://localhost:4331",
  secret: "weekly-smoke-test-only",
  gameAccountsOnly: true,
  challenge: { id: "test", assignments: {}, rules: {} },
  gecko: "",
});
const root = resolve(".deploy/public");
createServer(async (req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  if (req.url.startsWith("/api/")) {
    await handler(req, res);
    return;
  }
  try {
    let path = decodeURIComponent(
      new URL(req.url, "http://localhost:4331").pathname,
    );
    if (path === "/play" || path.endsWith("/")) path += "/index.html";
    const file = resolve(root, "." + path);
    if (!file.startsWith(root + sep)) throw Error();
    const type =
      {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".png": "image/png",
      }[extname(file)] || "application/octet-stream";
    const bytes = await readFile(file);
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(4331, "127.0.0.1", () =>
  console.log("Ephemeral weekly smoke server: http://localhost:4331"),
);
