import { create } from "zustand";
import {
  cellPeers,
  difficulties,
  digitIsComplete,
  generateSudoku,
  isSolvedBoard,
} from "./sudoku.js";
import { applyMove } from "./engine.js";
import { isAudioMuted, playSound, setAudioMuted, vibrate } from "../audio/sound.js";
import { readJSON, storage, warnStorageUnavailable, writeJSON } from "../persist/storage.js";

export { difficulties, digitIsComplete } from "./sudoku.js";
export { applyMove } from "./engine.js";
export { isAudioMuted, playSound, setAudioMuted, vibrate } from "../audio/sound.js";
export { readJSON, storage, warnStorageUnavailable, writeJSON } from "../persist/storage.js";

export const pendingGets = new Map();

export const resolvePendingGet = (reqId, code, room) => {
  if (reqId && pendingGets.has(reqId)) {
    const entry = pendingGets.get(reqId);
    if (entry.timer) clearTimeout(entry.timer);
    pendingGets.delete(reqId);
    entry.resolve(room);
    return true;
  }
  const targetCode = String(code || "").toUpperCase();
  for (const [id, entry] of pendingGets.entries()) {
    if (entry.code === targetCode) {
      if (entry.timer) clearTimeout(entry.timer);
      pendingGets.delete(id);
      entry.resolve(room);
      return true;
    }
  }
  return false;
};

const DAILY_PROGRESS_KEY = "sv-daily-progress-v1";
const DAILY_SEED_SALT = 104729;

export const themes = {
  Nordic: "theme-nordic",
  Cyberpunk: "theme-cyberpunk",
  Pastel: "theme-pastel",
  Sepia: "theme-sepia",
};

export const blankNotes = () => Array.from({ length: 81 }, () => []);
export const now = () => Date.now();
export const toDateKey = (date = new Date()) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

export const parseDateKey = (dateKey) => {
  const raw = String(dateKey || "").trim();
  const parts = raw.split("-").map((p) => Number(p));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  let day, month, year;
  if (raw.split("-")[0].length === 4) {
    // YYYY-MM-DD
    [year, month, day] = parts;
  } else {
    // DD-MM-YYYY
    [day, month, year] = parts;
  }
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  // Strict match: prevent JavaScript date overflow/rollover (e.g. Feb 31 -> Mar 3) (#31)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
};

export const canonicalDateKey = (dateKey) => {
  const date = parseDateKey(dateKey);
  return date ? toDateKey(date) : toDateKey(new Date());
};

export const isPastDateKey = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return false;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return date.getTime() < todayStart.getTime();
};

export const isFutureDateKey = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return true;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return date.getTime() > todayStart.getTime();
};

export const isTodayOrPastDateKey = (dateKey) => !isFutureDateKey(dateKey);

export const dailyDifficultyForDate = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return "Medium";
  const rotation = ["Easy", "Medium", "Hard", "Expert", "Master", "Extreme", "Hard"];
  return rotation[date.getDay()];
};

export const seedFromDateKey = (dateKey) => {
  const canonical = canonicalDateKey(dateKey);
  let hash = DAILY_SEED_SALT;
  for (let i = 0; i < canonical.length; i += 1) {
    hash = (hash * 31 + canonical.charCodeAt(i)) % 2147483647;
  }
  return hash;
};

const ONLINE_GRACE_MS = 15000;
export const EMPTY_ROOM_TTL_MS = 180000;
export const DARK_THEME = "Cyberpunk";
export const LIGHT_THEME = "Nordic";
export const isPlayerOnline = (player, ts = now()) => ts - (player?.lastSeen || 0) < ONLINE_GRACE_MS;
export const getPauseVoterIds = (room, ts = now()) =>
  Object.values(room?.players || {})
    .filter((p) => isPlayerOnline(p, ts) && p.connected !== false && p.status !== "left" && p.status !== "spectating")
    .map((p) => p.id);

/**
 * Unified URL synchronization for browser history (#40)
 */
export const syncUrl = ({ room = null, daily = null } = {}, { push = false } = {}) => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (room) {
    url.searchParams.set("room", room);
    url.searchParams.delete("daily");
  } else if (daily) {
    url.searchParams.set("daily", daily);
    url.searchParams.delete("room");
  } else {
    url.searchParams.delete("room");
    url.searchParams.delete("daily");
  }
  const next = url.toString();
  const current = window.location.href;
  if (current === next) return;
  const method = push ? "pushState" : "replaceState";
  window.history[method]({}, "", next);
};

export const syncRoomUrl = (code, mode = "replace") => {
  syncUrl({ room: code || null }, { push: mode === "push" });
};

export const syncDailyUrl = (dateKey, mode = "replace") => {
  syncUrl({ daily: dateKey ? canonicalDateKey(dateKey) : null }, { push: mode === "push" });
};
export const mergeRoomPresence = (currentRoom, nextRoom) => {
  if (!currentRoom || !nextRoom || currentRoom.code !== nextRoom.code) return nextRoom;
  const currentRev = Number(currentRoom.rev) || 1;
  const incomingRev = Number(nextRoom.rev) || 0;
  const currentPlayers = currentRoom.players || {};
  const incomingPlayers = nextRoom.players || {};
  const kickedIds = { ...(currentRoom.kickedIds || {}), ...(nextRoom.kickedIds || {}) };
  const mergedPlayers = {};
  const playerIds = new Set([...Object.keys(currentPlayers), ...Object.keys(incomingPlayers)]);
  playerIds.forEach((id) => {
    if (kickedIds[id]) return;
    const prev = currentPlayers[id];
    const incoming = incomingPlayers[id];
    if (!prev && incoming) {
      mergedPlayers[id] = incoming;
      return;
    }
    if (prev && !incoming) {
      if (nextRoom?.kickedIds?.[id]) return;
      mergedPlayers[id] = prev;
      return;
    }
    if (!prev || !incoming) return;
    const prevSeen = prev.lastSeen || 0;
    const incomingSeen = incoming.lastSeen || 0;
    if (incomingSeen > prevSeen) {
      mergedPlayers[id] = incoming;
      return;
    }
    if (incomingSeen < prevSeen) {
      mergedPlayers[id] = prev;
      return;
    }
    mergedPlayers[id] = incoming;
  });

  // Two clients can both claim a win in the same broadcast window. Keep the
  // fastest finish and demote the other claimant so the UI never shows two winners.
  // A new round (different puzzle seed) explicitly clears the winner. Requiring
  // a different seed stops a stale lobby snapshot from erasing a finished match.
  const newRound =
    !nextRoom.winnerId &&
    (nextRoom.status === "countdown" || nextRoom.status === "lobby") &&
    !nextRoom.startedAt &&
    nextRoom.seed &&
    nextRoom.seed !== currentRoom.seed;

  // Stale revision protection: do not let older revision overwrite room-level state (#21)
  let base;
  if (incomingRev < currentRev) {
    base = currentRoom;
  } else if (!newRound && currentRoom.status === "ended" && nextRoom.status !== "ended") {
    // Finished match cannot be downgraded to playing/lobby with same seed
    base = currentRoom;
  } else {
    base = nextRoom;
  }

  const winnerId = newRound
    ? null
    : resolveWinnerId(currentRoom.winnerId, nextRoom.winnerId, mergedPlayers);
  if (winnerId) {
    Object.entries(mergedPlayers).forEach(([id, player]) => {
      if (id === winnerId) {
        if (player.status !== "continue") mergedPlayers[id] = { ...player, status: "winner" };
      } else if (player.status === "winner") {
        mergedPlayers[id] = { ...player, status: "continue" };
      }
    });
  }

  // Preserve roomToken and monotonic revision (#15, #19, #21)
  const roomToken = currentRoom.roomToken || nextRoom.roomToken || null;
  const rev = Math.max(currentRev, incomingRev);

  // Transfer ownerId if owner is left/kicked (#28)
  let ownerId = base.ownerId;
  if (!mergedPlayers[ownerId] || mergedPlayers[ownerId].status === "left") {
    const nextOwner = Object.values(mergedPlayers).find(
      (p) => p.status !== "left" && isPlayerOnline(p)
    );
    ownerId = nextOwner ? nextOwner.id : ownerId;
  }

  const endedAt = newRound
    ? null
    : (nextRoom.endedAt || currentRoom.endedAt || (base.status === "ended" ? now() : null));

  return {
    ...base,
    code: currentRoom.code,
    rev,
    roomToken,
    ownerId,
    players: mergedPlayers,
    kickedIds,
    winnerId,
    endedAt,
  };
};

const resolveWinnerId = (a, b, players) => {
  if (!a) return b || null;
  if (!b) return a;
  if (a === b) return a;
  const finish = (id) =>
    Number.isFinite(players[id]?.finishedMs) ? players[id].finishedMs : Number.POSITIVE_INFINITY;
  return finish(a) <= finish(b) ? a : b;
};

const roomElapsed = (room) =>
  room?.startedAt ? Math.max(0, now() - room.startedAt - (room.totalPausedMs || 0)) : 0;

/**
 * Shared end-of-board resolution for normal moves and hints.
 * Returns the room/player fields to publish and records stats exactly once.
 */
const finalizeRoomBoard = ({ room, me, playerId, board, mistakes, status, stats, saveStats }) => {
  const bestTimes = stats.bestTimes || {};
  let winnerId = room.winnerId || null;
  let roomStatus = room.status;
  let endedAt = room.endedAt || null;
  let nextStatus = status;
  let personalSolvedAt = me.personalSolvedAt ?? null;
  let personalSolvedDismissed = me.personalSolvedDismissed ?? false;
  const solved = isSolvedBoard(board, room.solution);

  if (!winnerId && solved && mistakes <= 2) {
    winnerId = playerId;
    roomStatus = "ended";
    endedAt = now();
    nextStatus = "winner";
    const elapsed = roomElapsed(room);
    personalSolvedAt = elapsed;
    personalSolvedDismissed = true;
    const best = bestTimes[room.difficulty];
    saveStats({
      played: stats.played + 1,
      wins: stats.wins + 1,
      mistakeHistory: [...stats.mistakeHistory.slice(-19), mistakes],
      bestTimes: {
        ...bestTimes,
        [room.difficulty]: Number.isFinite(best) ? Math.min(best, elapsed) : elapsed,
      },
    });
  } else if (nextStatus === "lost" && me.status !== "lost") {
    saveStats({
      played: stats.played + 1,
      losses: stats.losses + 1,
      mistakeHistory: [...stats.mistakeHistory.slice(-19), mistakes],
    });
  } else if (solved && nextStatus === "continue" && !personalSolvedAt) {
    personalSolvedAt = roomElapsed(room);
    personalSolvedDismissed = false;
  }

  const finishedMs =
    nextStatus === "winner"
      ? roomElapsed(room)
      : (solved ? (me.finishedMs ?? personalSolvedAt ?? roomElapsed(room)) : (me.finishedMs ?? null));

  return { winnerId, roomStatus, endedAt, status: nextStatus, personalSolvedAt, personalSolvedDismissed, finishedMs };
};

export const copyText = async (text) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}
  try {
    const temp = document.createElement("textarea");
    temp.value = text;
    temp.setAttribute("readonly", "true");
    temp.style.position = "fixed";
    temp.style.opacity = "0";
    document.body.appendChild(temp);
    temp.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(temp);
    return ok;
  } catch (e) {
    return false;
  }
};

export const createPlayer = ({
  id,
  name,
  puzzle,
  board = null,
  notes = null,
  ready = false,
  connected = true,
  status = "active",
  mistakes = 0,
  progress = 0,
  hintsUsed = 0,
  finishedMs = null,
  personalSolvedAt = null,
  personalSolvedDismissed = false,
  lossPromptDismissed = false,
  lastSeen = now(),
  ...rest
} = {}) => ({
  id: id || "p1",
  name: name && String(name).trim() ? String(name).trim() : "Player",
  ready: Boolean(ready),
  connected: Boolean(connected),
  status: status || "active",
  mistakes: typeof mistakes === "number" ? mistakes : 0,
  progress: typeof progress === "number" ? progress : 0,
  hintsUsed: typeof hintsUsed === "number" ? hintsUsed : 0,
  finishedMs: finishedMs ?? null,
  personalSolvedAt: personalSolvedAt ?? null,
  personalSolvedDismissed: Boolean(personalSolvedDismissed),
  lossPromptDismissed: Boolean(lossPromptDismissed),
  board: Array.isArray(board) && board.length === 81 ? [...board] : (Array.isArray(puzzle) ? [...puzzle] : new Array(81).fill(0)),
  notes: Array.isArray(notes) && notes.length === 81 ? notes.map((n) => [...n]) : blankNotes(),
  lastSeen: typeof lastSeen === "number" ? lastSeen : now(),
  ...rest,
});

export const getOnlineVoterIds = (room, ts = now()) => getPauseVoterIds(room, ts);

const defaultStats = {
  played: 0,
  wins: 0,
  losses: 0,
  mistakeHistory: [],
  bestTimes: {},
};

const toFiniteNumber = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toCellValue = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 9 ? parsed : 0;
};

export const normalizeStats = (raw) => {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const bestTimes = {};
  if (source.bestTimes && typeof source.bestTimes === "object" && !Array.isArray(source.bestTimes)) {
    Object.entries(source.bestTimes).forEach(([difficulty, value]) => {
      const ms = toFiniteNumber(value);
      if (ms !== null && ms >= 0) bestTimes[difficulty] = ms;
    });
  }
  const mistakeHistory = Array.isArray(source.mistakeHistory)
    ? source.mistakeHistory
        .map((value) => toFiniteNumber(value))
        .filter((value) => value !== null && value >= 0)
        .slice(-50)
    : [];
  return {
    played: Math.max(0, Math.floor(toFiniteNumber(source.played, 0))),
    wins: Math.max(0, Math.floor(toFiniteNumber(source.wins, 0))),
    losses: Math.max(0, Math.floor(toFiniteNumber(source.losses, 0))),
    mistakeHistory,
    bestTimes,
  };
};

const normalizeNotes = (raw) => {
  if (!Array.isArray(raw) || raw.length !== 81) return blankNotes();
  return raw.map((cell) => {
    if (!Array.isArray(cell)) return [];
    return [...new Set(cell.map((value) => toFiniteNumber(value)).filter((value) => value >= 1 && value <= 9))].sort(
      (a, b) => a - b,
    );
  });
};

export const normalizePlayer = (raw, puzzle) => {
  if (!raw || typeof raw !== "object" || !raw.id) return null;
  const board =
    Array.isArray(raw.board) && raw.board.length === 81
      ? raw.board.map(toCellValue)
      : (Array.isArray(puzzle) ? [...puzzle] : new Array(81).fill(0));
  return createPlayer({
    ...raw,
    id: String(raw.id),
    name: String(raw.name || "Player").trim().slice(0, 24) || "Player",
    ready: Boolean(raw.ready),
    connected: raw.connected !== false,
    status: typeof raw.status === "string" ? raw.status : "active",
    mistakes: Math.max(0, Math.floor(toFiniteNumber(raw.mistakes, 0))),
    progress: Math.min(100, Math.max(0, Math.round(toFiniteNumber(raw.progress, 0)))),
    hintsUsed: Math.max(0, Math.floor(toFiniteNumber(raw.hintsUsed, 0))),
    finishedMs: toFiniteNumber(raw.finishedMs),
    personalSolvedAt: toFiniteNumber(raw.personalSolvedAt),
    personalSolvedDismissed: Boolean(raw.personalSolvedDismissed),
    lossPromptDismissed: Boolean(raw.lossPromptDismissed),
    lastSeen: toFiniteNumber(raw.lastSeen, 0),
    board,
    notes: normalizeNotes(raw.notes),
  });
};

const normalizeFlagMap = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (value) next[key] = value;
  });
  return next;
};

export const normalizeRoom = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const code = typeof raw.code === "string" ? raw.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{1,12}$/.test(code)) return null;
  const puzzle = Array.isArray(raw.puzzle) && raw.puzzle.length === 81 ? raw.puzzle.map(toCellValue) : null;
  const solution =
    Array.isArray(raw.solution) && raw.solution.length === 81 ? raw.solution.map(toCellValue) : null;
  if (!puzzle || !solution || solution.some((value) => value < 1 || value > 9)) return null;

  const players = {};
  Object.values(raw.players && typeof raw.players === "object" ? raw.players : {}).forEach((entry) => {
    const player = normalizePlayer(entry, puzzle);
    if (player) players[player.id] = player;
  });

  return {
    ...raw,
    code,
    puzzle,
    solution,
    players,
    rev: Math.max(1, toFiniteNumber(raw.rev, 1)),
    roomToken: typeof raw.roomToken === "string" ? raw.roomToken : null,
    difficulty: difficulties[raw.difficulty] ? raw.difficulty : "Medium",
    status: typeof raw.status === "string" ? raw.status : "lobby",
    ownerId: typeof raw.ownerId === "string" ? raw.ownerId : null,
    createdAt: toFiniteNumber(raw.createdAt, 0),
    updatedAt: toFiniteNumber(raw.updatedAt, 0),
    startedAt: toFiniteNumber(raw.startedAt),
    endedAt: toFiniteNumber(raw.endedAt),
    countdownEndsAt: toFiniteNumber(raw.countdownEndsAt),
    totalPausedMs: Math.max(0, toFiniteNumber(raw.totalPausedMs, 0)),
    pausedAt: toFiniteNumber(raw.pausedAt),
    winnerId: typeof raw.winnerId === "string" ? raw.winnerId : null,
    pausedByIds: Array.isArray(raw.pausedByIds)
      ? raw.pausedByIds.filter((id) => typeof id === "string")
      : [],
    pauseRequests: normalizeFlagMap(raw.pauseRequests),
    resumeRequests: normalizeFlagMap(raw.resumeRequests),
    rematchRequests: normalizeFlagMap(raw.rematchRequests),
    kickedIds: raw.kickedIds && typeof raw.kickedIds === "object" ? { ...raw.kickedIds } : {},
  };
};

const normalizeDailyProgress = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next = {};
  Object.entries(raw).forEach(([key, entry]) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const canonicalKey = canonicalDateKey(key);
    const snapshot = entry.lastBoardSnapshot;
    const board =
      snapshot && Array.isArray(snapshot.board) && snapshot.board.length === 81
        ? snapshot.board.map(toCellValue)
        : null;
    const isSolved = entry.status === "solved" || Boolean(entry.solvedAt);
    next[canonicalKey] = {
      ...entry,
      status: isSolved
        ? "solved"
        : ["not_started", "in_progress"].includes(entry.status)
          ? entry.status
          : "not_started",
      elapsedMs: Math.max(0, toFiniteNumber(entry.elapsedMs, 0)),
      mistakes: Math.max(0, Math.floor(toFiniteNumber(entry.mistakes, 0))),
      hintsUsed: Math.max(0, Math.floor(toFiniteNumber(entry.hintsUsed, 0))),
      pausedAt: toFiniteNumber(entry.pausedAt, null),
      totalPausedMs: Math.max(0, toFiniteNumber(entry.totalPausedMs, 0)),
      solvedAt: toFiniteNumber(entry.solvedAt, null),
      lastBoardSnapshot: board ? { board, notes: normalizeNotes(snapshot.notes) } : undefined,
    };
  });
  return next;
};

const readDailyProgress = () => normalizeDailyProgress(readJSON(DAILY_PROGRESS_KEY, {}));
const writeDailyProgress = (progress) =>
  storage.set(DAILY_PROGRESS_KEY, JSON.stringify(progress));

export const writeRoom = (room) => {
  storage.set(`sv-room-${room.code}`, JSON.stringify(room));
  window.dispatchEvent(new CustomEvent("sv-room-local", { detail: room }));
};

const newPlayer = () => {
  const existing = readJSON("sv-player", null);
  if (existing?.id) return existing;

  const genUUID = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    try {
      if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
        return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20, 12)}`;
      }
    } catch (e) {}
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const player = {
    id: genUUID(),
    name: `Player ${Math.floor(Math.random() * 900 + 100)}`,
  };
  storage.set("sv-player", JSON.stringify(player));
  return player;
};

const dailyBoardCache = new Map();

export const useGame = create((set, get) => ({
  player: newPlayer(),
  room: null,
  selected: null,
  inputMode: "value",
  theme: storage.get("sv-theme") || "Nordic",
  ws: null,
  viewingId: null,
  mode: "home",
  dailyDateKey: toDateKey(),
  dailyBoard: null,
  dailySelected: null,
  dailyInputMode: "value",
  dailyHistory: [],
  dailyStartedAt: null,
  dailyElapsedMs: 0,
  dailyPaused: false,
  dailyProgress: readDailyProgress(),
  history: [],
  stats: normalizeStats(readJSON("sv-stats", defaultStats)),
  snacks: [],
  addSnack: (message) => {
    if (!message) return;
    const text = typeof message === "string" ? message : message?.message || String(message);
    const id = `${now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({
      snacks: [...state.snacks.slice(-4), { id, text }],
    }));
    setTimeout(() => {
      get().removeSnack(id);
    }, 3500);
  },
  removeSnack: (id) =>
    set((state) => ({
      snacks: state.snacks.filter((s) => s.id !== id),
    })),
  sendHeartbeat: () => {
    const { room, player, ws, channel } = get();
    if (!room?.code || !room.players?.[player.id]) return;
    const ts = now();
    const me = room.players[player.id];
    const updatedMe = { ...me, connected: true, lastSeen: ts };
    set({
      room: {
        ...room,
        players: {
          ...room.players,
          [player.id]: updatedMe,
        },
      },
    });
    const presenceMsg = { type: "presence", code: room.code, playerId: player.id, lastSeen: ts };
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(presenceMsg));
      }
    } catch (e) {}
    try {
      channel?.postMessage(presenceMsg);
    } catch (e) {}
  },
  setTheme: (theme) => {
    storage.set("sv-theme", theme);
    set({ theme });
  },
  toggleDarkMode: () => {
    const current = get().theme;
    const next = current === DARK_THEME ? LIGHT_THEME : DARK_THEME;
    storage.set("sv-theme", next);
    set({ theme: next });
  },
  setPlayerName: (name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    const player = { ...get().player, name: trimmed.slice(0, 24) };
    storage.set("sv-player", JSON.stringify(player));
    const room = get().room;
    set({ player });
    if (room?.players?.[player.id]) {
      get().publish({
        ...room,
        players: {
          ...room.players,
          [player.id]: { ...room.players[player.id], name: player.name, lastSeen: now() },
        },
      });
    }
  },
  saveStats: (patch) =>
    set((state) => {
      const stats = normalizeStats({ ...state.stats, ...patch });
      storage.set("sv-stats", JSON.stringify(stats));
      return { stats };
    }),
  publish: (room) => {
    const currentRoom = get().room;
    const nextRev = Math.max(Number(room.rev) || 0, Number(currentRoom?.rev) || 0) + 1;
    const next = mergeRoomPresence(currentRoom, { ...room, rev: nextRev, updatedAt: now() });
    writeRoom(next);
    get().channel?.postMessage(next);
    // also publish to server via websocket when available
    try {
      const ws = get().ws;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "publish", room: next }));
    } catch (e) {}
    syncRoomUrl(next.code);
    set({ room: next });
  },
  createRoom: (difficulty) => {
    const puzzle = generateSudoku(difficulty);
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const player = get().player;
    const ws = get().ws;
    const room = {
      code,
      difficulty,
      ownerId: player.id,
      ...puzzle,
      status: "lobby",
      rev: 1,
      roomToken:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${now()}-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: now(),
      startedAt: null,
      totalPausedMs: 0,
      pausedAt: null,
      pauseRequests: {},
      resumeRequests: {},
      pausedByIds: [],
      winnerId: null,
      players: {
        [player.id]: createPlayer({
          ...player,
          puzzle: puzzle.puzzle,
        }),
      },
      rematchRequests: {},
    };
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "subscribe", code }));
      } catch (e) {}
    }
    get().publish(room);
    set({ mode: "room", viewingId: player.id, selected: null, history: [] });
    syncRoomUrl(code, "push");
  },
  createSolo: (difficulty) => {
    get().createRoom(difficulty);
    const room = get().room;
    if (!room) return;
    const player = get().player;
    const players = {
      ...room.players,
      [player.id]: { ...room.players[player.id], ready: true, connected: true },
    };
    const started = { ...room, players, status: "playing", startedAt: now() };
    get().publish(started);
    set({ mode: "room", viewingId: player.id, selected: null, history: [] });
    syncRoomUrl(room.code, "push");
  },
  joinRoom: async (code, options = {}) => {
    const historyMode = options.historyMode || "push";
    const key = String(code || "").trim().toUpperCase();
    if (!key || !/^[A-Z0-9]{4,12}$/.test(key)) {
      return { ok: false, reason: "invalid_code" };
    }

    const player = get().player;
    const ws = get().ws;

    // Wait briefly if WebSocket is in CONNECTING state (#26)
    if (ws && ws.readyState === WebSocket.CONNECTING) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1500);
        const onOpen = () => {
          clearTimeout(timer);
          cleanup();
          resolve();
        };
        const onClose = () => {
          clearTimeout(timer);
          cleanup();
          resolve();
        };
        const cleanup = () => {
          ws.removeEventListener("open", onOpen);
          ws.removeEventListener("close", onClose);
        };
        ws.addEventListener("open", onOpen);
        ws.addEventListener("close", onClose);
      });
    }

    // Prefer server via websocket when open (#26)
    let roomData = null;
    let queriedServer = false;

    if (ws && ws.readyState === WebSocket.OPEN) {
      queriedServer = true;
      const reqId = `${now()}-${Math.random().toString(36).slice(2, 7)}`;
      roomData = await new Promise((resolve) => {
        const timer = setTimeout(() => {
          pendingGets.delete(reqId);
          resolve(null);
        }, 4000);
        pendingGets.set(reqId, { code: key, resolve, timer });
        try {
          ws.send(JSON.stringify({ type: "get", code: key, reqId }));
        } catch (e) {
          clearTimeout(timer);
          pendingGets.delete(reqId);
          resolve(null);
        }
      });
    }

    // Fall back to local storage only if offline/server unreached (#26)
    let found = normalizeRoom(roomData);
    if (!found && !queriedServer) {
      found = normalizeRoom(readJSON(`sv-room-${key}`, null));
    }

    if (!found) {
      return { ok: false, reason: queriedServer ? "not_found" : "offline" };
    }

    // Check if player was kicked (#28)
    if (found.kickedIds?.[player.id]) {
      return { ok: false, reason: "kicked" };
    }

    // Check player cap (#28)
    const existingPlayer = found.players?.[player.id];
    const onlinePlayersCount = Object.values(found.players || {}).filter(
      (p) => p.id !== player.id && p.status !== "left" && isPlayerOnline(p),
    ).length;
    if (!existingPlayer && onlinePlayersCount >= 8) {
      return { ok: false, reason: "full" };
    }

    // Mid-match join: if match is in progress, join as spectator until rematch (#28)
    const midMatch = found.status === "playing" || found.status === "countdown";
    const joinStatus = existingPlayer
      ? existingPlayer.status === "left"
        ? midMatch
          ? "spectating"
          : "active"
        : existingPlayer.status
      : midMatch
        ? "spectating"
        : "active";

    const room = {
      ...found,
      players: {
        ...found.players,
        [player.id]: createPlayer({
          ...(existingPlayer || player),
          ready: false,
          connected: true,
          status: joinStatus,
          puzzle: found.puzzle,
          board: existingPlayer?.board,
          notes: existingPlayer?.notes,
        }),
      },
    };

    // Subscribe socket to room (#16)
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "subscribe", code: key }));
      } catch (e) {}
    }

    get().publish(room);
    set({ mode: "room", viewingId: player.id, selected: null, history: [] });
    syncRoomUrl(key, historyMode);
    return { ok: true, room };
  },
  leaveRoom: (options = {}) => {
    const historyMode = options.historyMode || "push";
    const { room, player, publish, ws } = get();
    if (room?.players?.[player.id]) {
      const players = { ...room.players };
      // Set status to left (#28)
      players[player.id] = {
        ...players[player.id],
        connected: false,
        ready: false,
        status: "left",
        lastSeen: now(),
      };

      // Clean up votes (#28)
      const pauseRequests = { ...(room.pauseRequests || {}) };
      const resumeRequests = { ...(room.resumeRequests || {}) };
      const rematchRequests = { ...(room.rematchRequests || {}) };
      delete pauseRequests[player.id];
      delete resumeRequests[player.id];
      delete rematchRequests[player.id];
      const pausedByIds = (room.pausedByIds || []).filter((id) => id !== player.id);

      // Transfer ownerId if owner is leaving (#28)
      let ownerId = room.ownerId;
      if (ownerId === player.id) {
        const nextOwner = Object.values(players).find(
          (p) => p.id !== player.id && p.status !== "left" && isPlayerOnline(p),
        );
        ownerId = nextOwner ? nextOwner.id : null;
      }

      // If countdown was in progress and fewer than 2 active players remain, return to lobby (#28)
      const activePlayersCount = Object.values(players).filter(
        (p) => p.status !== "left" && isPlayerOnline(p),
      ).length;
      const shouldAbortCountdown = room.status === "countdown" && activePlayersCount < 2;

      const nextRoom = {
        ...room,
        ownerId,
        players,
        pauseRequests,
        resumeRequests,
        rematchRequests,
        pausedByIds,
        status: shouldAbortCountdown ? "lobby" : room.status,
        countdownEndsAt: shouldAbortCountdown ? null : room.countdownEndsAt,
        startedAt: shouldAbortCountdown ? null : room.startedAt,
      };

      publish(nextRoom);
    }

    // Unsubscribe socket from this room (#16)
    if (room?.code && ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "unsubscribe", code: room.code }));
      } catch (e) {}
    }

    syncRoomUrl(null, historyMode);
    set({ mode: "home", room: null, selected: null, viewingId: null, history: [] });
  },
  toggleReady: () => {
    const { room, player, publish } = get();
    const me = room?.players?.[player.id];
    if (!room || !me) return;
    const players = { ...room.players, [player.id]: { ...me, ready: !me.ready, lastSeen: now() } };
    const activePlayers = Object.values(players).filter(
      (p) => isPlayerOnline(p) && p.status !== "left" && p.status !== "spectating",
    );
    const allReady = activePlayers.length > 0 && activePlayers.every((p) => p.ready);
    const canStart = allReady && activePlayers.length >= 2;
    if (allReady && !canStart) {
      window.dispatchEvent(
        new CustomEvent("sv-snack", { detail: { message: "At least 2 players are needed to start room play." } }),
      );
    }
    publish({
      ...room,
      players,
      status: canStart ? "countdown" : room.status === "countdown" ? "lobby" : room.status,
      countdownEndsAt: canStart ? now() + 3000 : null,
      startedAt: canStart ? null : room.startedAt,
      rematchRequests: {},
    });
  },
  getDailyBoard: (dateKey) => {
    const key = canonicalDateKey(dateKey);
    if (dailyBoardCache.has(key)) return dailyBoardCache.get(key);
    const difficulty = dailyDifficultyForDate(key);
    const seed = seedFromDateKey(key);
    const generated = generateSudoku(difficulty, seed);
    const board = { dateKey: key, difficulty, ...generated };
    dailyBoardCache.set(key, board);
    return board;
  },
  updateDailyProgress: (dateKey, patch) =>
    set((state) => {
      const key = canonicalDateKey(dateKey);
      const current = state.dailyProgress[key] || {
        status: "not_started",
        difficulty: dailyDifficultyForDate(key),
      };
      const next = { ...current, ...patch };
      const dailyProgress = { ...state.dailyProgress, [key]: next };
      writeDailyProgress(dailyProgress);
      return { dailyProgress };
    }),
  markDailySolved: (dateKey, summary) => {
    const key = canonicalDateKey(dateKey);
    get().updateDailyProgress(key, {
      status: "solved",
      solvedAt: now(),
      ...summary,
    });
  },
  openDailyBoard: (dateKey, options = {}) => {
    const historyMode = options.historyMode || "push";
    const canonicalKey = canonicalDateKey(dateKey);
    if (!isTodayOrPastDateKey(canonicalKey)) return;
    const board = get().getDailyBoard(canonicalKey);
    const progress = get().dailyProgress[board.dateKey];
    const snapshot = progress?.lastBoardSnapshot;
    const notes = snapshot?.notes?.length === 81 ? snapshot.notes.map((n) => [...n]) : blankNotes();
    const boardValues = snapshot?.board?.length === 81 ? [...snapshot.board] : [...board.puzzle];
    const isPaused = Boolean(progress?.pausedAt);
    const isSolved = progress?.status === "solved" || Boolean(progress?.solvedAt);

    // Derive status (#32): only "in_progress" if actual moves/notes have been made
    const hasUserMoves =
      boardValues.some((v, idx) => v !== 0 && v !== board.puzzle[idx]) ||
      notes.some((n) => n.length > 0);
    const derivedStatus = isSolved ? "solved" : hasUserMoves ? "in_progress" : "not_started";

    set({
      mode: "daily",
      room: null,
      selected: null,
      history: [],
      dailyDateKey: board.dateKey,
      dailyBoard: board,
      dailySelected: null,
      dailyInputMode: "value",
      dailyHistory: [],
      dailyStartedAt: isSolved || isPaused ? null : now(),
      dailyElapsedMs: progress?.elapsedMs || 0,
      dailyPaused: isPaused,
    });

    // Do NOT write the snapshot as an open side effect (#32)
    // Only update progress status if it diverged
    if (progress && progress.status !== derivedStatus) {
      get().updateDailyProgress(board.dateKey, { status: derivedStatus });
    }

    syncUrl({ daily: board.dateKey }, { push: historyMode === "push" });
  },
  setDailySelected: (dailySelected) => set({ dailySelected }),
  setDailyInputMode: (dailyInputMode) => set({ dailyInputMode }),
  toggleDailyPause: () => {
    const { dailyBoard, dailyDateKey, dailyProgress, dailyPaused, dailyStartedAt, dailyElapsedMs } = get();
    if (!dailyBoard) return;
    const progress = dailyProgress[dailyDateKey] || {};
    if (progress.status === "solved" || Boolean(progress.solvedAt)) return;

    const nextPaused = !dailyPaused;
    if (nextPaused) {
      // Transition to paused: stop clock and save accrued time (#34)
      const pausedAt = now();
      const sessionMs = dailyStartedAt ? Math.max(0, pausedAt - dailyStartedAt) : 0;
      const elapsedMs = (progress.elapsedMs || dailyElapsedMs || 0) + sessionMs;
      get().updateDailyProgress(dailyDateKey, {
        pausedAt,
        elapsedMs,
      });
      set({
        dailyPaused: true,
        dailyElapsedMs: elapsedMs,
        dailyStartedAt: null,
      });
    } else {
      // Resume from pause: track total pause duration (#34)
      const pausedAt = progress.pausedAt || now();
      const pauseDuration = Math.max(0, now() - pausedAt);
      const totalPausedMs = (progress.totalPausedMs || 0) + pauseDuration;
      get().updateDailyProgress(dailyDateKey, {
        pausedAt: null,
        totalPausedMs,
      });
      set({
        dailyPaused: false,
        dailyStartedAt: now(),
      });
    }
  },
  dailyRematch: () => {
    const { dailyBoard, dailyDateKey } = get();
    if (!dailyBoard) return;
    set({
      dailySelected: null,
      dailyHistory: [],
      dailyStartedAt: now(),
      dailyElapsedMs: 0,
      dailyPaused: false,
    });
    get().updateDailyProgress(dailyDateKey, {
      status: "not_started",
      startedAt: now(),
      solvedAt: null,
      pausedAt: null,
      totalPausedMs: 0,
      elapsedMs: 0,
      mistakes: 0,
      hintsUsed: 0,
      lastBoardSnapshot: { board: [...dailyBoard.puzzle], notes: blankNotes() },
    });
  },
  leaveDaily: (options = {}) => {
    const historyMode = options.historyMode || "push";
    const { dailyBoard, dailyDateKey, dailyPaused, dailyStartedAt, dailyProgress } = get();
    if (dailyBoard && !dailyPaused) {
      const progress = dailyProgress[dailyDateKey];
      if (progress && progress.status !== "solved" && !progress.solvedAt && dailyStartedAt) {
        const sessionMs = Math.max(0, now() - dailyStartedAt);
        get().updateDailyProgress(dailyDateKey, {
          elapsedMs: (progress.elapsedMs || 0) + sessionMs,
        });
      }
    }
    syncUrl({}, { push: historyMode === "push" });
    set({
      mode: "home",
      dailyBoard: null,
      dailySelected: null,
      dailyInputMode: "value",
      dailyHistory: [],
      dailyStartedAt: null,
      dailyElapsedMs: 0,
      dailyPaused: false,
    });
  },
  setSelected: (selected) => set({ selected }),
  setInputMode: (inputMode) => set({ inputMode }),
  setViewingId: (viewingId) => {
    const state = get();
    const room = state.room;
    const player = state.player;
    const me = room?.players?.[player.id];
    const target = room?.players?.[viewingId];
    if (!me || !target) return;
    if (me.id === viewingId) return set({ viewingId });
    if (
      room.status === "ended" ||
      me.status === "spectating" ||
      me.status === "lost" ||
      (me.status === "continue" && me.mistakes >= 3)
    ) {
      return set({ viewingId });
    }
  },
  togglePause: () => {
    const { room, player, publish } = get();
    const me = room?.players?.[player.id];
    if (!room || !me || room.status === "ended") return;
    const voterIds = getPauseVoterIds(room);
    if (voterIds.length === 0) return;
    const isPaused = Boolean(room.pausedAt);
    if (!isPaused) {
      const requests = { ...room.pauseRequests };
      requests[player.id] = !requests[player.id];
      const shouldPause = voterIds.every((id) => requests[id]);
      publish({
        ...room,
        pauseRequests: shouldPause ? {} : requests,
        resumeRequests: shouldPause ? {} : room.resumeRequests || {},
        pausedByIds: shouldPause ? voterIds : room.pausedByIds || [],
        pausedAt: shouldPause ? now() : null,
        totalPausedMs: room.totalPausedMs,
      });
      return;
    }
    // Recompute electorate from currently-online players among pausedByIds (#22)
    const validPausedByIds =
      room.pausedByIds && room.pausedByIds.length > 0
        ? room.pausedByIds.filter((id) => voterIds.includes(id))
        : voterIds;
    const electorate = validPausedByIds.length > 0 ? validPausedByIds : voterIds;
    const resumeRequests = { ...(room.resumeRequests || {}) };
    resumeRequests[player.id] = !resumeRequests[player.id];
    const shouldResume = electorate.length > 0 && electorate.every((id) => resumeRequests[id]);
    publish({
      ...room,
      pauseRequests: shouldResume ? {} : room.pauseRequests || {},
      resumeRequests: shouldResume ? {} : resumeRequests,
      pausedByIds: shouldResume ? [] : electorate,
      pausedAt: shouldResume ? null : room.pausedAt,
      totalPausedMs: shouldResume ? (room.totalPausedMs || 0) + (now() - room.pausedAt) : room.totalPausedMs,
    });
  },
  forceResume: () => {
    const { room, player, publish } = get();
    if (!room || !room.pausedAt || room.ownerId !== player.id) return;
    publish({
      ...room,
      pauseRequests: {},
      resumeRequests: {},
      pausedByIds: [],
      pausedAt: null,
      totalPausedMs: (room.totalPausedMs || 0) + (now() - room.pausedAt),
    });
  },
  continueMode: () => {
    const { room, player, publish } = get();
    if (!room?.players?.[player.id]) return;
    publish({
      ...room,
      players: {
        ...room.players,
        [player.id]: { ...room.players[player.id], status: "continue", lossPromptDismissed: true },
      },
    });
    set({ viewingId: player.id });
  },
  spectateAfterLoss: () => {
    const { room, player, publish } = get();
    if (!room?.players?.[player.id]) return;
    const target = Object.values(room.players).find(
      (p) => p.id !== player.id && (p.status === "active" || p.status === "continue"),
    );
    // Nobody left to watch: stay on the own board instead of an empty spectator view.
    if (!target) {
      get().continueMode();
      return;
    }
    publish({
      ...room,
      players: {
        ...room.players,
        [player.id]: { ...room.players[player.id], status: "spectating", lossPromptDismissed: true },
      },
    });
    set({ viewingId: target.id });
  },
  resumeOwnBoard: () => {
    const { room, player, publish } = get();
    const me = room?.players?.[player.id];
    if (!room || !me || me.status !== "spectating") return;
    publish({
      ...room,
      players: {
        ...room.players,
        [player.id]: { ...me, status: "continue", lossPromptDismissed: true },
      },
    });
    set({ viewingId: player.id });
  },
  useHint: () => {
    if (get().mode === "daily" && get().dailyBoard) {
      const {
        dailyBoard,
        dailySelected,
        dailyDateKey,
        dailyProgress,
        dailyStartedAt,
        dailyElapsedMs,
        dailyPaused,
        dailyHistory,
      } = get();
      if (dailySelected === null || dailyPaused) return;
      const progress = dailyProgress[dailyDateKey] || {};
      if (progress.status === "solved" || Boolean(progress.solvedAt)) return;
      if ((progress.hintsUsed || 0) >= 2) {
        get().addSnack("You already used 2 hints on this board.");
        return;
      }
      const snapshot = progress.lastBoardSnapshot || { board: [...dailyBoard.puzzle], notes: blankNotes() };
      const res = applyMove(
        { board: snapshot.board, notes: snapshot.notes, mistakes: progress.mistakes || 0 },
        { type: "hint", cell: dailySelected },
        dailyBoard.puzzle,
        dailyBoard.solution
      );
      if (!res.changed) return;

      const sessionMs = dailyStartedAt ? Math.max(0, now() - dailyStartedAt) : 0;
      const elapsedMs = (progress.elapsedMs || dailyElapsedMs || 0) + sessionMs;
      get().updateDailyProgress(dailyDateKey, {
        status: res.isSolved ? "solved" : "in_progress",
        solvedAt: res.isSolved ? now() : progress.solvedAt || null,
        elapsedMs,
        hintsUsed: (progress.hintsUsed || 0) + 1,
        lastBoardSnapshot: { board: res.board, notes: res.notes },
      });
      set({
        dailyHistory: [...dailyHistory, res.snapshot].slice(-120),
        dailyStartedAt: res.isSolved ? null : now(),
        dailyElapsedMs: elapsedMs,
      });
      return;
    }
    const { room, player, selected, publish, history, saveStats } = get();
    const me = room?.players?.[player.id];
    if (!room || !me) return;
    if (selected === null || room.pausedAt) return;
    if (me.status === "spectating" || me.status === "lost") return;
    if (room.winnerId === player.id) return;
    if (get().viewingId && get().viewingId !== player.id) return;
    if (room.status === "countdown") return;
    if (room.status === "ended" && me.status !== "continue") return;
    if ((me.hintsUsed || 0) >= 2) {
      get().addSnack("You already used 2 hints on this board.");
      return;
    }
    if (me.board[selected] === room.solution[selected]) {
      get().addSnack("Selected cell is already correct.");
      return;
    }

    const res = applyMove(
      { board: me.board, notes: me.notes, mistakes: me.mistakes },
      { type: "hint", cell: selected },
      room.puzzle,
      room.solution
    );
    if (!res.changed) return;

    const progress = Math.round((res.board.filter(Boolean).length / 81) * 100);
    const final = finalizeRoomBoard({
      room,
      me,
      playerId: player.id,
      board: res.board,
      mistakes: me.mistakes,
      status: me.status,
      stats: get().stats,
      saveStats,
    });
    publish({
      ...room,
      status: final.roomStatus,
      winnerId: final.winnerId,
      endedAt: final.endedAt,
      players: {
        ...room.players,
        [player.id]: {
          ...me,
          board: res.board,
          notes: res.notes,
          hintsUsed: (me.hintsUsed || 0) + 1,
          progress,
          status: final.status,
          finishedMs: final.finishedMs,
          personalSolvedAt: final.personalSolvedAt,
          personalSolvedDismissed: final.personalSolvedDismissed,
          lastSeen: now(),
        },
      },
    });
    set({ history: [...history, res.snapshot].slice(-120) });
  },
  toggleRematchVote: () => {
    const { room, player, publish } = get();
    const me = room?.players?.[player.id];
    if (!room || !me) return;
    const voterIds = Object.values(room.players || {})
      .filter((p) => p.status !== "left" && isPlayerOnline(p))
      .map((p) => p.id);
    if (voterIds.length === 0) return;
    const rematchRequests = { ...(room.rematchRequests || {}) };
    rematchRequests[player.id] = !rematchRequests[player.id];
    const unanimous = voterIds.every((id) => rematchRequests[id]);
    if (!unanimous) {
      publish({ ...room, rematchRequests });
      return;
    }
    const puzzle = generateSudoku(room.difficulty);
    const players = Object.fromEntries(
      Object.entries(room.players).map(([id, p]) => [
        id,
        createPlayer({
          ...p,
          ready: false,
          status: p.status === "left" ? "left" : "active",
          mistakes: 0,
          progress: 0,
          finishedMs: null,
          personalSolvedAt: null,
          personalSolvedDismissed: false,
          lossPromptDismissed: true,
          hintsUsed: 0,
          puzzle: puzzle.puzzle,
        }),
      ]),
    );
    publish({
      ...room,
      ...puzzle,
      status: "countdown",
      countdownEndsAt: now() + 3000,
      startedAt: null,
      totalPausedMs: 0,
      pausedAt: null,
      pauseRequests: {},
      resumeRequests: {},
      pausedByIds: [],
      winnerId: null,
      endedAt: null,
      players,
      rematchRequests: {},
    });
    set({ history: [], selected: null, viewingId: player.id });
  },
  kickPlayer: (targetId) => {
    const { room, player, publish } = get();
    if (!room || !targetId || targetId === player.id) return;
    if (room.ownerId !== player.id) return;
    if (!room.players?.[targetId]) return;
    const players = { ...room.players };
    delete players[targetId];
    const pauseRequests = { ...(room.pauseRequests || {}) };
    const resumeRequests = { ...(room.resumeRequests || {}) };
    const rematchRequests = { ...(room.rematchRequests || {}) };
    delete pauseRequests[targetId];
    delete resumeRequests[targetId];
    delete rematchRequests[targetId];
    const pausedByIds = (room.pausedByIds || []).filter((id) => id !== targetId);
    const kickedIds = { ...(room.kickedIds || {}), [targetId]: now() };
    const activePlayers = Object.values(players).filter((p) => p.status !== "left" && isPlayerOnline(p));
    const canContinueCountdown = activePlayers.length >= 2;
    publish({
      ...room,
      players,
      pauseRequests,
      resumeRequests,
      rematchRequests,
      pausedByIds,
      kickedIds,
      status: room.status === "countdown" && !canContinueCountdown ? "lobby" : room.status,
      countdownEndsAt: room.status === "countdown" && !canContinueCountdown ? null : room.countdownEndsAt,
      startedAt: room.status === "countdown" && !canContinueCountdown ? null : room.startedAt,
    });
  },
  pushMove: (digit) => {
    if (get().mode === "daily" && get().dailyBoard) {
      const {
        dailyBoard,
        dailySelected,
        dailyInputMode,
        dailyHistory,
        dailyProgress,
        dailyDateKey,
        dailyStartedAt,
        dailyElapsedMs,
        dailyPaused,
      } = get();
      if (dailySelected === null || dailyPaused) return;
      const progress = dailyProgress[dailyDateKey] || {};
      if (progress.status === "solved" || Boolean(progress.solvedAt)) return;
      const snapshot = progress.lastBoardSnapshot || { board: [...dailyBoard.puzzle], notes: blankNotes() };

      const res = applyMove(
        { board: snapshot.board, notes: snapshot.notes, mistakes: progress.mistakes || 0 },
        { type: "digit", cell: dailySelected, digit, inputMode: dailyInputMode },
        dailyBoard.puzzle,
        dailyBoard.solution,
      );
      if (!res.changed) return;

      const elapsedMs = (progress.elapsedMs || dailyElapsedMs || 0) + Math.max(0, now() - (dailyStartedAt || now()));
      const patch = {
        status: res.isSolved ? "solved" : "in_progress",
        mistakes: res.mistakes,
        elapsedMs,
        lastBoardSnapshot: { board: res.board, notes: res.notes },
      };
      if (res.isSolved) patch.solvedAt = now();
      get().updateDailyProgress(dailyDateKey, patch);
      set({
        dailyHistory: [...dailyHistory, res.snapshot].slice(-120),
        dailyStartedAt: res.isSolved ? null : now(),
        dailyElapsedMs: elapsedMs,
      });
      return;
    }
    const { room, player, selected, inputMode, publish, history, saveStats } = get();
    const me = room?.players?.[player.id];
    if (!room || !me || selected === null || room.pausedAt || me.status === "spectating" || me.status === "lost") return;
    if (room.winnerId === player.id) return;
    if (room.status === "countdown") return;
    if (get().viewingId && get().viewingId !== player.id) return;
    if (room.status === "ended" && me.status !== "continue") return;

    const res = applyMove(
      { board: me.board, notes: me.notes, mistakes: me.mistakes },
      { type: "digit", cell: selected, digit, inputMode },
      room.puzzle,
      room.solution,
    );
    if (!res.changed) return;

    if (inputMode === "value") {
      if (res.isCorrect) {
        playSound(880, 150);
        vibrate([10, 5, 10]);
      } else {
        playSound(220, 200);
        vibrate([30, 10, 30]);
      }
    }

    const nextStatus = res.mistakes >= 3 ? "lost" : me.status;
    const progress = Math.round((res.board.filter(Boolean).length / 81) * 100);
    const final = finalizeRoomBoard({
      room,
      me,
      playerId: player.id,
      board: res.board,
      mistakes: res.mistakes,
      status: nextStatus,
      stats: get().stats,
      saveStats,
    });

    publish({
      ...room,
      status: final.roomStatus,
      winnerId: final.winnerId,
      endedAt: final.endedAt,
      players: {
        ...room.players,
        [player.id]: {
          ...me,
          board: res.board,
          notes: res.notes,
          mistakes: res.mistakes,
          progress,
          status: final.status,
          finishedMs: final.finishedMs,
          personalSolvedAt: final.personalSolvedAt,
          personalSolvedDismissed: final.personalSolvedDismissed,
          lossPromptDismissed: final.status === "lost" ? false : me.lossPromptDismissed,
          lastSeen: now(),
        },
      },
    });
    set({ history: [...history, res.snapshot].slice(-120) });
  },
  erase: () => {
    if (get().mode === "daily" && get().dailyBoard) {
      const { dailyProgress, dailyDateKey, dailySelected, dailyHistory, dailyStartedAt, dailyElapsedMs, dailyPaused, dailyBoard } = get();
      if (dailyPaused) return;
      const progress = dailyProgress[dailyDateKey];
      if (!progress || progress.status === "solved" || Boolean(progress.solvedAt) || dailySelected === null) return;
      const snapshot = progress.lastBoardSnapshot;
      if (!snapshot) return;

      const res = applyMove(
        { board: snapshot.board, notes: snapshot.notes },
        { type: "erase", cell: dailySelected },
        dailyBoard.puzzle,
        dailyBoard.solution,
      );
      if (!res.changed) return;

      const elapsedMs = (progress.elapsedMs || dailyElapsedMs || 0) + Math.max(0, now() - (dailyStartedAt || now()));
      const hasMoves = res.board.some((val, idx) => !dailyBoard.puzzle[idx] && (val !== 0 || (res.notes[idx] && res.notes[idx].length > 0)));
      get().updateDailyProgress(dailyDateKey, {
        status: hasMoves ? "in_progress" : "not_started",
        elapsedMs,
        lastBoardSnapshot: { board: res.board, notes: res.notes },
      });
      set({ dailyHistory: [...dailyHistory, res.snapshot].slice(-120), dailyStartedAt: now(), dailyElapsedMs: elapsedMs });
      return;
    }
    const { room, player, selected, publish, history } = get();
    const me = room?.players?.[player.id];
    if (!room || !me || selected === null || room.puzzle[selected] || room.pausedAt || me.status === "spectating" || me.status === "lost") return;
    if (room.status === "countdown" || me.status === "winner" || room.winnerId === player.id) return;
    if (room.status === "ended" && me.status !== "continue") return;
    if (get().viewingId && get().viewingId !== player.id) return;

    const res = applyMove(
      { board: me.board, notes: me.notes },
      { type: "erase", cell: selected },
      room.puzzle,
      room.solution,
    );
    if (!res.changed) return;

    publish({
      ...room,
      players: {
        ...room.players,
        [player.id]: {
          ...me,
          board: res.board,
          notes: res.notes,
          progress: Math.round((res.board.filter(Boolean).length / 81) * 100),
          lastSeen: now(),
        },
      },
    });
    set({ history: [...history, res.snapshot].slice(-120) });
  },
  undo: () => {
    if (get().mode === "daily" && get().dailyBoard) {
      const { dailyHistory, dailyDateKey, dailyPaused, dailyProgress } = get();
      if (dailyPaused || dailyProgress[dailyDateKey]?.status === "solved" || Boolean(dailyProgress[dailyDateKey]?.solvedAt)) return;
      const last = dailyHistory.at(-1);
      if (!last) return;
      const hasMoves = last.board.some((val, idx) => !get().dailyBoard.puzzle[idx] && (val !== 0 || (last.notes[idx] && last.notes[idx].length > 0)));
      get().updateDailyProgress(dailyDateKey, {
        status: hasMoves ? "in_progress" : "not_started",
        lastBoardSnapshot: { board: last.board, notes: last.notes },
      });
      set({ dailyHistory: dailyHistory.slice(0, -1) });
      return;
    }
    const { room, player, publish, history } = get();
    const me = room?.players?.[player.id];
    if (!room || !me) return;
    if (room.pausedAt || me.status === "spectating" || me.status === "lost" || me.status === "winner" || room.winnerId === player.id) return;
    if (room.status === "countdown") return;
    if (room.status === "ended" && me.status !== "continue") return;
    if (get().viewingId && get().viewingId !== player.id) return;
    const last = history.at(-1);
    if (!last) return;
    publish({
      ...room,
      players: {
        ...room.players,
        [player.id]: {
          ...me,
          board: last.board,
          notes: last.notes,
          progress: Math.round((last.board.filter(Boolean).length / 81) * 100),
          lastSeen: now(),
        },
      },
    });
    set({ history: history.slice(0, -1) });
  },
}));

