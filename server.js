/* Room relay + static production server for Sudoku Versus.
   - Run with: node server.js
   - Serves dist/ when present
   - WebSocket room relay is available at /room-ws
*/

import { createReadStream, existsSync } from "fs";
import { createServer } from "http";
import { extname, join, resolve } from "path";
import { attachRoomRelay } from "./roomRelay.js";

const PORT = process.env.PORT || 5174;
const DIST_DIR = resolve("dist");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(join(DIST_DIR, requested));
  const fallback = resolve(join(DIST_DIR, "index.html"));
  const target = filePath.startsWith(DIST_DIR) && existsSync(filePath) ? filePath : fallback;

  if (!existsSync(target)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  res.writeHead(200, { "Content-Type": mimeTypes[extname(target)] || "application/octet-stream" });
  createReadStream(target).pipe(res);
});

attachRoomRelay(server, { path: "/room-ws" });

process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Sudoku Versus server listening on http://0.0.0.0:${PORT}`);
  console.log(`Room relay websocket available at ws://0.0.0.0:${PORT}/room-ws`);
});
