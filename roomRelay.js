import { WebSocketServer, WebSocket } from "ws";

const ONLINE_GRACE_MS = 15000;
const EMPTY_ROOM_TTL_MS = 180000;

const rooms = new Map();
let cleanupStarted = false;

function isPlayerOnline(player, ts = Date.now()) {
  return ts - (player?.lastSeen || 0) < ONLINE_GRACE_MS;
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

function mergeRooms(existingRoom, incomingRoom) {
  if (!existingRoom || existingRoom.code !== incomingRoom.code) return incomingRoom;
  const base = (incomingRoom.updatedAt || 0) >= (existingRoom.updatedAt || 0) ? incomingRoom : existingRoom;
  const existingPlayers = existingRoom.players || {};
  const incomingPlayers = incomingRoom.players || {};
  const players = {};
  const playerIds = new Set([...Object.keys(existingPlayers), ...Object.keys(incomingPlayers)]);

  playerIds.forEach((id) => {
    const existing = existingPlayers[id];
    const incoming = incomingPlayers[id];
    if (!existing && incoming) {
      players[id] = incoming;
      return;
    }
    if (existing && !incoming) {
      players[id] = existing;
      return;
    }
    if (!existing || !incoming) return;
    players[id] = (incoming.lastSeen || 0) >= (existing.lastSeen || 0) ? incoming : existing;
  });

  return { ...base, players };
}

function publishRoom(wss, room) {
  const code = room.code.toUpperCase();
  const existing = rooms.get(code);
  const mergedRoom = mergeRooms(existing?.room, room);
  const ts = Date.now();
  const everyoneOffline = roomAllDisconnected(mergedRoom, ts);
  rooms.set(code, {
    room: mergedRoom,
    allDisconnectedSince: everyoneOffline ? (existing?.allDisconnectedSince || ts) : null,
  });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) send(client, { type: "room", room: mergedRoom });
  }
}

function startCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
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
      if (ts - since >= EMPTY_ROOM_TTL_MS) rooms.delete(code);
    }
  }, 10000);
}

export function attachRoomRelay(server, { path = "/room-ws", log = console.log } = {}) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname !== path) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    const addr = req?.socket?.remoteAddress || "unknown";
    log(`Room relay client connected from ${addr}`);
    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(typeof data === "string" ? data : data.toString());
      } catch (e) {
        console.warn("Invalid JSON from client", e);
        return;
      }
      if (msg?.type === "publish" && msg.room?.code) {
        publishRoom(wss, msg.room);
      }
      if (msg?.type === "get" && msg.code) {
        const code = msg.code.toUpperCase();
        const room = rooms.get(code)?.room || null;
        send(ws, { type: "room", room, code });
      }
    });
    ws.on("close", () => log(`Room relay client disconnected ${addr}`));
    ws.on("error", (err) => console.warn("Room relay WS error", err));
  });

  startCleanup();
  return wss;
}
