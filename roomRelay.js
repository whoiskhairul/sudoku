import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const ONLINE_GRACE_MS = 15000;
const EMPTY_ROOM_TTL_MS = 180000;
const MAX_PAYLOAD_BYTES = 131072; // 128 KB limit (#18)
const RATE_LIMIT_WINDOW_MS = 1000;
const MAX_MESSAGES_PER_SEC = 30; // Per-socket rate limit (#18)
const MAX_ROOMS = 500; // Room capacity cap (#18)
const MAX_PLAYERS_PER_ROOM = 8; // Max players per room (#28)
const CODE_REGEX = /^[A-Z0-9]{4,12}$/i;

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
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  } catch (e) {
    // ignore send errors
  }
}

function isAllowedOrigin(origin, host) {
  if (!origin) return true; // non-browser clients or same-origin without Origin header
  try {
    const originUrl = new URL(origin);
    const hostClean = (host || "").split(":")[0].toLowerCase();
    const originHost = originUrl.hostname.toLowerCase();
    if (originHost === hostClean) return true;
    if (originHost === "localhost" || originHost === "127.0.0.1") return true;
    if (process.env.ALLOWED_ORIGINS) {
      const allowed = process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim().toLowerCase());
      if (allowed.includes(originUrl.origin.toLowerCase()) || allowed.includes(originHost)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isNewRound(existingRoom, incomingRoom) {
  return (
    !incomingRoom.winnerId &&
    (incomingRoom.status === "countdown" || incomingRoom.status === "lobby") &&
    !incomingRoom.startedAt &&
    Boolean(incomingRoom.seed) &&
    incomingRoom.seed !== existingRoom.seed
  );
}

function resolveWinnerId(a, b, players) {
  if (!a) return b || null;
  if (!b) return a;
  if (a === b) return a;
  const finish = (id) =>
    Number.isFinite(players[id]?.finishedMs) ? players[id].finishedMs : Number.POSITIVE_INFINITY;
  return finish(a) <= finish(b) ? a : b;
}

/**
 * Merges an incoming room snapshot with existing state:
 * - Rejects older room-level revisions (#15, #21)
 * - Unions kickedIds server-side (#21)
 * - Merges players by lastSeen (#21)
 * - Resolves winners deterministically (#5, #21)
 * - Increments monotonic revision (#21)
 */
export function mergeRooms(existingRoom, incomingRoom) {
  if (!existingRoom || existingRoom.code !== incomingRoom.code) {
    const rev = Math.max(1, Number(incomingRoom.rev) || 1);
    const roomToken = incomingRoom.roomToken || randomUUID();
    return { ...incomingRoom, rev, roomToken, updatedAt: Date.now() };
  }

  const existingRev = Number(existingRoom.rev) || 1;
  const incomingRev = Number(incomingRoom.rev) || 0;

  // Union kickedIds server-side (#21)
  const kickedIds = {
    ...(existingRoom.kickedIds || {}),
    ...(incomingRoom.kickedIds || {}),
  };

  // Merge players by lastSeen and exclude kicked IDs
  const existingPlayers = existingRoom.players || {};
  const incomingPlayers = incomingRoom.players || {};
  const mergedPlayers = {};
  const allPlayerIds = new Set([...Object.keys(existingPlayers), ...Object.keys(incomingPlayers)]);

  for (const id of allPlayerIds) {
    if (kickedIds[id]) continue;
    const prev = existingPlayers[id];
    const next = incomingPlayers[id];
    if (!prev && next) {
      mergedPlayers[id] = next;
    } else if (prev && !next) {
      mergedPlayers[id] = prev;
    } else if (prev && next) {
      mergedPlayers[id] = (next.lastSeen || 0) >= (prev.lastSeen || 0) ? next : prev;
    }
  }

  // Base selection: reject stale room-level base when incoming revision is older (#21)
  const newRound = isNewRound(existingRoom, incomingRoom);
  let base;
  if (incomingRev < existingRev) {
    base = existingRoom;
  } else if (!newRound && existingRoom.status === "ended" && incomingRoom.status !== "ended") {
    // Match finished: do not downgrade ended room unless seed changed for a rematch
    base = existingRoom;
  } else {
    base = incomingRoom;
  }

  // Deterministic winner resolution (#5, #21)
  const winnerId = newRound
    ? null
    : resolveWinnerId(existingRoom.winnerId, incomingRoom.winnerId, mergedPlayers);

  if (winnerId) {
    Object.entries(mergedPlayers).forEach(([id, player]) => {
      if (id === winnerId) {
        if (player.status !== "continue") mergedPlayers[id] = { ...player, status: "winner" };
      } else if (player.status === "winner") {
        mergedPlayers[id] = { ...player, status: "continue" };
      }
    });
  }

  const roomToken = existingRoom.roomToken || incomingRoom.roomToken || randomUUID();
  const nextRev = Math.max(existingRev, incomingRev) + 1;

  return {
    ...base,
    code: existingRoom.code,
    rev: nextRev,
    roomToken,
    players: mergedPlayers,
    kickedIds,
    winnerId,
    updatedAt: Date.now(),
  };
}

function subscribeSocket(ws, code) {
  if (!ws.subscribedCodes) ws.subscribedCodes = new Set();
  ws.subscribedCodes.add(code);

  const entry = rooms.get(code);
  if (entry) {
    entry.subscribers.add(ws);
  }
}

function unsubscribeSocket(ws, code) {
  ws.subscribedCodes?.delete(code);
  const entry = rooms.get(code);
  if (entry) {
    entry.subscribers.delete(ws);
  }
}

function removeSocketFromAllRooms(ws) {
  if (!ws.subscribedCodes) return;
  for (const code of ws.subscribedCodes) {
    const entry = rooms.get(code);
    if (entry) {
      entry.subscribers.delete(ws);
    }
  }
  ws.subscribedCodes.clear();
}

/**
 * Broadcasts a room update ONLY to subscribed sockets (#16).
 */
function publishRoom(ws, room) {
  const code = String(room.code || "").toUpperCase();
  const existing = rooms.get(code);

  // Authenticate / Authorize room publication (#19)
  if (existing?.room?.roomToken) {
    if (!room.roomToken || room.roomToken !== existing.room.roomToken) {
      send(ws, { type: "error", error: "unauthorized", code, message: "Invalid room token" });
      return;
    }
  }

  // Check room capacity limit (#18)
  if (!existing && rooms.size >= MAX_ROOMS) {
    // Attempt to evict oldest disconnected room
    const ts = Date.now();
    let oldestCode = null;
    let oldestTime = ts;
    for (const [c, e] of rooms.entries()) {
      if (e.allDisconnectedSince && e.allDisconnectedSince < oldestTime) {
        oldestTime = e.allDisconnectedSince;
        oldestCode = c;
      }
    }
    if (oldestCode) {
      rooms.delete(oldestCode);
    } else {
      send(ws, { type: "error", error: "server_full", message: "Server room limit reached" });
      return;
    }
  }

  const mergedRoom = mergeRooms(existing?.room, room);
  const ts = Date.now();
  const everyoneOffline = roomAllDisconnected(mergedRoom, ts);

  const subscribers = existing?.subscribers || new Set();
  subscribers.add(ws);
  subscribeSocket(ws, code);

  rooms.set(code, {
    room: mergedRoom,
    subscribers,
    allDisconnectedSince: everyoneOffline ? (existing?.allDisconnectedSince || ts) : null,
  });

  // Scoped broadcast: send only to room participants (#16)
  for (const client of subscribers) {
    if (client.readyState === WebSocket.OPEN) {
      send(client, { type: "room", room: mergedRoom });
    }
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
        if (entry.allDisconnectedSince) entry.allDisconnectedSince = null;
        continue;
      }
      const since = entry.allDisconnectedSince || ts;
      if (!entry.allDisconnectedSince) {
        entry.allDisconnectedSince = since;
        continue;
      }
      if (ts - since >= EMPTY_ROOM_TTL_MS) {
        // Emit room:closed to remaining subscribers (#16)
        for (const client of entry.subscribers) {
          if (client.readyState === WebSocket.OPEN) {
            send(client, { type: "room:closed", code });
          }
          client.subscribedCodes?.delete(code);
        }
        rooms.delete(code);
      }
    }
  }, 10000);
}

function validatePublishRoom(room) {
  if (!room || typeof room !== "object") return false;
  if (!room.code || typeof room.code !== "string" || !CODE_REGEX.test(room.code)) return false;
  if (!room.players || typeof room.players !== "object" || Array.isArray(room.players)) return false;
  if (Object.keys(room.players).length > MAX_PLAYERS_PER_ROOM) return false;
  if (room.puzzle && (!Array.isArray(room.puzzle) || room.puzzle.length !== 81)) return false;
  if (room.solution && (!Array.isArray(room.solution) || room.solution.length !== 81)) return false;
  return true;
}

export function attachRoomRelay(server, { path = "/room-ws", log = console.log } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname !== path) return;

    // Origin allowlist check on upgrade to prevent WebSocket hijacking (#19)
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin, req.headers.host)) {
      log(`Rejected WS upgrade from untrusted origin: ${origin}`);
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    const addr = req?.socket?.remoteAddress || "unknown";
    ws.subscribedCodes = new Set();
    ws.messageCount = 0;
    ws.windowStart = Date.now();
    ws.isAlive = true;

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    log(`Room relay client connected from ${addr}`);

    ws.on("message", (data) => {
      // Payload size check (#18)
      if (data.length > MAX_PAYLOAD_BYTES) {
        send(ws, { type: "error", error: "payload_too_large", message: "Message exceeds 128KB limit" });
        return;
      }

      // Per-socket rate limit check (#18)
      const now = Date.now();
      if (now - ws.windowStart > RATE_LIMIT_WINDOW_MS) {
        ws.windowStart = now;
        ws.messageCount = 1;
      } else {
        ws.messageCount += 1;
        if (ws.messageCount > MAX_MESSAGES_PER_SEC) {
          send(ws, { type: "error", error: "rate_limited", message: "Too many messages, slow down" });
          return;
        }
      }

      let msg;
      try {
        msg = JSON.parse(typeof data === "string" ? data : data.toString());
      } catch (e) {
        send(ws, { type: "error", error: "invalid_json" });
        return;
      }

      if (!msg || typeof msg !== "object" || !msg.type) {
        send(ws, { type: "error", error: "missing_type" });
        return;
      }

      // Handle message types (#16, #18, #19, #26)
      switch (msg.type) {
        case "publish": {
          if (!validatePublishRoom(msg.room)) {
            send(ws, { type: "error", error: "invalid_room_schema" });
            return;
          }
          publishRoom(ws, msg.room);
          break;
        }
        case "presence": {
          const code = String(msg.code || "").toUpperCase();
          const playerId = msg.playerId;
          const lastSeen = typeof msg.lastSeen === "number" ? msg.lastSeen : Date.now();
          if (!code || !playerId) break;
          const entry = rooms.get(code);
          if (entry?.room?.players?.[playerId]) {
            entry.room.players[playerId].lastSeen = lastSeen;
            entry.room.players[playerId].connected = true;
            // Broadcast compact presence to other subscribers without whole-snapshot broadcast (#52)
            for (const client of entry.subscribers) {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                send(client, { type: "presence", code, playerId, lastSeen });
              }
            }
          }
          break;
        }
        case "get": {
          const code = String(msg.code || "").toUpperCase();
          const reqId = msg.reqId || null;
          if (!CODE_REGEX.test(code)) {
            send(ws, { type: "room", room: null, code, reqId, error: "invalid_code" });
            return;
          }
          subscribeSocket(ws, code);
          const entry = rooms.get(code);
          const room = entry?.room || null;
          send(ws, { type: "room", room, code, reqId });
          break;
        }
        case "subscribe": {
          const code = String(msg.code || "").toUpperCase();
          if (CODE_REGEX.test(code)) {
            subscribeSocket(ws, code);
          }
          break;
        }
        case "unsubscribe": {
          const code = String(msg.code || "").toUpperCase();
          if (code) {
            unsubscribeSocket(ws, code);
          }
          break;
        }
        case "ping": {
          send(ws, { type: "pong" });
          break;
        }
        default: {
          send(ws, { type: "error", error: "unknown_message_type", message: `Unknown type ${msg.type}` });
          break;
        }
      }
    });

    ws.on("close", () => {
      removeSocketFromAllRooms(ws);
      log(`Room relay client disconnected ${addr}`);
    });

    ws.on("error", (err) => {
      removeSocketFromAllRooms(ws);
      console.warn("Room relay WS error", err);
    });
  });

  startCleanup();
  return wss;
}
