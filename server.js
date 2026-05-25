/* Simple WebSocket room relay for Sudoku Versus
   - Run with: node server.js
   - Listens on port 5174 by default
   - Accepts JSON messages: {type: 'publish', room}, {type: 'get', code}
   - Broadcasts {type: 'room', room} when a room is published
   - Serves LiveKit voice tokens at /voice-token when LiveKit env vars are set
*/

import { createServer } from "http";
import { AccessToken } from "livekit-server-sdk";
import WebSocket, { WebSocketServer } from "ws";

const PORT = process.env.PORT || 5174;
const LIVEKIT_URL = process.env.LIVEKIT_URL || "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";
const ONLINE_GRACE_MS = 6000;
const EMPTY_ROOM_TTL_MS = 180000;

const rooms = new Map();

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== "/voice-token") {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    res.writeHead(503);
    res.end(JSON.stringify({ error: "livekit_not_configured", hint: "Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET env vars" }));
    return;
  }

  const room = (url.searchParams.get("room") || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 64);
  const identity = (url.searchParams.get("identity") || "").replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 128);
  const name = (url.searchParams.get("name") || "Player").slice(0, 64);

  if (!room || !identity) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "missing_room_or_identity" }));
    return;
  }

  try {
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name,
      ttl: "2h",
    });
    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    res.writeHead(200);
    res.end(JSON.stringify({ token: await token.toJwt(), url: LIVEKIT_URL }));
  } catch (e) {
    console.error("Failed to mint LiveKit token", e);
    res.writeHead(500);
    res.end(JSON.stringify({ error: "token_error", details: e.message }));
  }
});

const wss = new WebSocketServer({ server });

function isPlayerOnline(player, ts = Date.now()) {
  return Boolean(player?.connected) && ts - (player?.lastSeen || 0) < ONLINE_GRACE_MS;
}

function roomAllDisconnected(room, ts = Date.now()) {
  const players = Object.values(room?.players || {});
  if (players.length === 0) return true;
  return players.every((p) => !isPlayerOnline(p, ts));
}

function send(ws, msg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch (e) {
    // ignore send errors
  }
}

wss.on("connection", (ws, req) => {
  const addr = req?.socket?.remoteAddress || "unknown";
  console.log(`Client connected from ${addr}`);
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(typeof data === "string" ? data : data.toString());
    } catch (e) {
      console.warn("Invalid JSON from client", e);
      return;
    }
    if (msg?.type === "publish" && msg.room?.code) {
      const code = msg.room.code.toUpperCase();
      const existing = rooms.get(code);
      const ts = Date.now();
      const everyoneOffline = roomAllDisconnected(msg.room, ts);
      rooms.set(code, {
        room: msg.room,
        allDisconnectedSince: everyoneOffline ? (existing?.allDisconnectedSince || ts) : null,
      });
      // broadcast to all clients
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) send(client, { type: "room", room: msg.room });
      }
      console.log(`Published room ${code} (players=${Object.keys(msg.room.players || {}).length})`);
    }
    if (msg?.type === "get" && msg.code) {
      const code = msg.code.toUpperCase();
      const room = rooms.get(code)?.room || null;
      send(ws, { type: "room", room, code });
      console.log(`GET request for ${code} -> ${room ? "found" : "not found"}`);
    }
  });
  ws.on("close", () => console.log(`Client disconnected ${addr}`));
  ws.on("error", (err) => console.warn("WS error", err));
});

process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

setInterval(() => {
  const ts = Date.now();
  for (const [code, entry] of rooms.entries()) {
    if (!entry?.room) {
      rooms.delete(code);
      continue;
    }
    const everyoneOffline = roomAllDisconnected(entry.room, ts);
    if (!everyoneOffline) {
      if (entry.allDisconnectedSince) rooms.set(code, { ...entry, allDisconnectedSince: null });
      continue;
    }
    const since = entry.allDisconnectedSince || ts;
    if (!entry.allDisconnectedSince) {
      rooms.set(code, { ...entry, allDisconnectedSince: since });
      continue;
    }
    if (ts - since >= EMPTY_ROOM_TTL_MS) {
      rooms.delete(code);
      console.log(`Auto-cleaned room ${code} after 180s of all players offline`);
    }
  }
}, 10000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Room server listening on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket relay available at ws://0.0.0.0:${PORT}`);
  console.log(LIVEKIT_URL ? "LiveKit voice token endpoint enabled" : "LiveKit voice token endpoint disabled (missing LIVEKIT_URL)");
});
