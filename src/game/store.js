import { create } from "zustand";

export const pendingGets = new Map();

export const difficulties = {
  Easy: 34,
  Medium: 42,
  Hard: 48,
  Expert: 53,
  Master: 57,
  Extreme: 61,
};

export const themes = {
  Nordic: "theme-nordic",
  Cyberpunk: "theme-cyberpunk",
  Pastel: "theme-pastel",
  Sepia: "theme-sepia",
};

export const blankNotes = () => Array.from({ length: 81 }, () => []);
export const now = () => Date.now();
const ONLINE_GRACE_MS = 15000;
export const EMPTY_ROOM_TTL_MS = 180000;
export const DARK_THEME = "Cyberpunk";
export const LIGHT_THEME = "Nordic";
export const isPlayerOnline = (player, ts = now()) => ts - (player?.lastSeen || 0) < ONLINE_GRACE_MS;
export const getPauseVoterIds = (room, ts = now()) =>
  Object.values(room?.players || {})
    .filter((p) => isPlayerOnline(p, ts))
    .map((p) => p.id);
const syncRoomUrl = (code, mode = "replace") => {
  if (typeof window === "undefined") return;
  const base = `${window.location.origin}${window.location.pathname}`;
  const next = code ? `${base}?room=${encodeURIComponent(code)}` : base;
  const current = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  if (current === next) return;
  const method = mode === "push" ? "pushState" : "replaceState";
  window.history[method]({}, "", next);
};
export const mergeRoomPresence = (currentRoom, nextRoom) => {
  if (!currentRoom || !nextRoom || currentRoom.code !== nextRoom.code) return nextRoom;
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
    mergedPlayers[id] = prev.connected && !incoming.connected ? { ...incoming, connected: true } : incoming;
  });
  return { ...nextRoom, players: mergedPlayers };
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

const playSound = (frequency, duration = 100, type = "sine") => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = type;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration / 1000);
  } catch (e) {}
};

const vibrate = (pattern) => {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) {}
};
const cellPeers = (idx) => {
  const row = Math.floor(idx / 9);
  const col = idx % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  const peers = new Set();
  for (let i = 0; i < 9; i += 1) {
    peers.add(row * 9 + i);
    peers.add(i * 9 + col);
  }
  for (let r = boxRow; r < boxRow + 3; r += 1) {
    for (let c = boxCol; c < boxCol + 3; c += 1) peers.add(r * 9 + c);
  }
  peers.delete(idx);
  return [...peers];
};

function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function shuffled(items, rand) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function generateSudoku(difficulty, seed = now()) {
  const rand = seeded(seed % 233280);
  const pattern = (r, c) => (r * 3 + Math.floor(r / 3) + c) % 9;
  const rows = shuffled([0, 1, 2], rand).flatMap((g) =>
    shuffled([0, 1, 2], rand).map((r) => g * 3 + r),
  );
  const cols = shuffled([0, 1, 2], rand).flatMap((g) =>
    shuffled([0, 1, 2], rand).map((c) => g * 3 + c),
  );
  const nums = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], rand);
  const solution = rows.flatMap((r) => cols.map((c) => nums[pattern(r, c)]));
  const puzzle = [...solution];
  shuffled([...Array(81).keys()], rand)
    .slice(0, difficulties[difficulty])
    .forEach((idx) => {
      puzzle[idx] = 0;
    });
  return { puzzle, solution, seed };
}

const defaultStats = {
  played: 0,
  wins: 0,
  losses: 0,
  mistakeHistory: [],
  bestTimes: {},
};

export const readJSON = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

export const writeRoom = (room) => {
  localStorage.setItem(`sv-room-${room.code}`, JSON.stringify(room));
  window.dispatchEvent(new CustomEvent("sv-room-local", { detail: room }));
};

const newPlayer = () => {
  const existing = readJSON("sv-player", null);
  if (existing) return existing;
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
  localStorage.setItem("sv-player", JSON.stringify(player));
  return player;
};

export const useGame = create((set, get) => ({
  player: newPlayer(),
  room: null,
  selected: null,
  inputMode: "value",
  theme: localStorage.getItem("sv-theme") || "Nordic",
  ws: null,
  viewingId: null,
  history: [],
  stats: readJSON("sv-stats", defaultStats),
  setTheme: (theme) => {
    localStorage.setItem("sv-theme", theme);
    set({ theme });
  },
  toggleDarkMode: () => {
    const current = get().theme;
    const next = current === DARK_THEME ? LIGHT_THEME : DARK_THEME;
    localStorage.setItem("sv-theme", next);
    set({ theme: next });
  },
  setPlayerName: (name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    const player = { ...get().player, name: trimmed.slice(0, 24) };
    localStorage.setItem("sv-player", JSON.stringify(player));
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
      const stats = { ...state.stats, ...patch };
      localStorage.setItem("sv-stats", JSON.stringify(stats));
      return { stats };
    }),
  publish: (room) => {
    const next = mergeRoomPresence(get().room, { ...room, updatedAt: now() });
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
  countPlaced: (board, digit) => board.reduce((count, value) => count + (value === digit ? 1 : 0), 0),
  createRoom: (difficulty) => {
    const puzzle = generateSudoku(difficulty);
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const player = get().player;
    const room = {
      code,
      difficulty,
      ownerId: player.id,
      ...puzzle,
      status: "lobby",
      createdAt: now(),
      startedAt: null,
      totalPausedMs: 0,
      pausedAt: null,
      pauseRequests: {},
      resumeRequests: {},
      pausedByIds: [],
      winnerId: null,
      players: {
        [player.id]: {
          ...player,
          ready: false,
          connected: true,
          status: "active",
          mistakes: 0,
          progress: 0,
          finishedMs: null,
          personalSolvedAt: null,
          personalSolvedDismissed: false,
          hintsUsed: 0,
          board: [...puzzle.puzzle],
          notes: blankNotes(),
          lastSeen: now(),
        },
      },
      rematchRequests: {},
    };
    get().publish(room);
    set({ viewingId: player.id, selected: null, history: [] });
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
    set({ viewingId: player.id, selected: null, history: [] });
    syncRoomUrl(room.code, "push");
  },
  joinRoom: async (code, options = {}) => {
    const historyMode = options.historyMode || "push";
    const key = code.toUpperCase();
    const found = readJSON(`sv-room-${key}`, null);
    if (found) {
      const player = get().player;
      const room = {
        ...found,
        players: {
          ...found.players,
          [player.id]: found.players[player.id] || {
            ...player,
            ready: false,
            connected: true,
            status: "active",
            mistakes: 0,
            progress: 0,
            finishedMs: null,
            personalSolvedAt: null,
            personalSolvedDismissed: false,
            hintsUsed: 0,
            board: [...found.puzzle],
            notes: blankNotes(),
            lastSeen: now(),
          },
        },
      };
      get().publish(room);
      set({ viewingId: player.id, selected: null, history: [] });
      syncRoomUrl(key, historyMode);
      return true;
    }

    // Try server via websocket if available
    const ws = get().ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    return await new Promise((resolve) => {
      pendingGets.set(key, { resolve });
      try {
        ws.send(JSON.stringify({ type: "get", code: key }));
      } catch (e) {
        pendingGets.delete(key);
        resolve(false);
      }
      // timeout
      setTimeout(() => {
        if (pendingGets.has(key)) {
          pendingGets.delete(key);
          resolve(false);
        }
      }, 4000);
    }).then((roomData) => {
      if (!roomData) return false;
      const player = get().player;
      const room = {
        ...roomData,
        players: {
          ...roomData.players,
          [player.id]: roomData.players[player.id] || {
            ...player,
            ready: false,
            connected: true,
            status: "active",
            mistakes: 0,
            progress: 0,
            finishedMs: null,
            personalSolvedAt: null,
            personalSolvedDismissed: false,
            hintsUsed: 0,
            board: [...roomData.puzzle],
            notes: blankNotes(),
            lastSeen: now(),
          },
        },
      };
      get().publish(room);
      set({ viewingId: player.id, selected: null, history: [] });
      syncRoomUrl(key, historyMode);
      return true;
    });
  },
  leaveRoom: (options = {}) => {
    const historyMode = options.historyMode || "push";
    const { room, player, publish } = get();
    if (room?.players[player.id]) {
      publish({
        ...room,
        players: {
          ...room.players,
          [player.id]: { ...room.players[player.id], connected: false, lastSeen: now() },
        },
      });
    }
    syncRoomUrl(null, historyMode);
    set({ room: null, selected: null, viewingId: null, history: [] });
  },
  toggleReady: () => {
    const { room, player, publish } = get();
    const me = room?.players?.[player.id];
    if (!room || !me) return;
    const playerCount = Object.keys(room.players || {}).length;
    const players = { ...room.players, [player.id]: { ...me, ready: !me.ready } };
    const allReady = Object.values(players).length > 0 && Object.values(players).every((p) => p.ready);
    const canStart = allReady && playerCount >= 2;
    if (allReady && !canStart) {
      window.dispatchEvent(
        new CustomEvent("sv-snack", { detail: { message: "At least 2 players are needed to start room play." } }),
      );
    }
    publish({
      ...room,
      players,
      status: canStart ? "countdown" : "lobby",
      countdownEndsAt: canStart ? now() + 3000 : null,
      startedAt: canStart ? null : room.startedAt,
      rematchRequests: {},
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
    const pausedByIds = (room.pausedByIds && room.pausedByIds.length > 0)
      ? room.pausedByIds
      : voterIds;
    const resumeRequests = { ...(room.resumeRequests || {}) };
    resumeRequests[player.id] = !resumeRequests[player.id];
    const shouldResume = pausedByIds.length > 0 && pausedByIds.every((id) => resumeRequests[id]);
    publish({
      ...room,
      pauseRequests: shouldResume ? {} : room.pauseRequests || {},
      resumeRequests: shouldResume ? {} : resumeRequests,
      pausedByIds: shouldResume ? [] : pausedByIds,
      pausedAt: shouldResume ? null : room.pausedAt,
      totalPausedMs: shouldResume ? room.totalPausedMs + (now() - room.pausedAt) : room.totalPausedMs,
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
    const targetId = Object.values(room.players).find((p) => p.id !== player.id && p.status === "active")?.id || player.id;
    publish({
      ...room,
      players: {
        ...room.players,
        [player.id]: { ...room.players[player.id], status: "continue", lossPromptDismissed: true },
      },
    });
    set({ viewingId: targetId });
  },
  useHint: () => {
    const { room, player, selected, publish, history } = get();
    const me = room?.players?.[player.id];
    if (!room || !me) return;
    if (selected === null || room.puzzle[selected] || room.pausedAt) return;
    if (me.status === "spectating" || me.status === "lost") return;
    if (get().viewingId && get().viewingId !== player.id) return;
    if (room.status === "countdown") return;
    if (room.status === "ended" && me.status !== "continue") return;
    if ((me.hintsUsed || 0) >= 2) {
      window.dispatchEvent(new CustomEvent("sv-snack", { detail: { message: "You already used 2 hints on this board." } }));
      return;
    }
    if (me.board[selected] === room.solution[selected]) {
      window.dispatchEvent(new CustomEvent("sv-snack", { detail: { message: "Selected cell is already correct." } }));
      return;
    }

    const snapshot = {
      board: [...me.board],
      notes: me.notes.map((n) => [...n]),
    };
    const board = [...me.board];
    const notes = me.notes.map((n) => [...n]);
    const digit = room.solution[selected];
    board[selected] = digit;
    notes[selected] = [];
    cellPeers(selected).forEach((idx) => {
      notes[idx] = notes[idx].filter((n) => n !== digit);
    });
    const progress = Math.round((board.filter(Boolean).length / 81) * 100);
    publish({
      ...room,
      players: {
        ...room.players,
        [player.id]: {
          ...me,
          board,
          notes,
          hintsUsed: (me.hintsUsed || 0) + 1,
          progress,
          lastSeen: now(),
        },
      },
    });
    set({ history: [...history, snapshot].slice(-120) });
  },
  toggleRematchVote: () => {
    const { room, player, publish } = get();
    const me = room?.players?.[player.id];
    if (!room || !me) return;
    const voterIds = Object.values(room.players || {})
      .filter((p) => isPlayerOnline(p))
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
        {
          ...p,
          ready: false,
          status: "active",
          mistakes: 0,
          progress: 0,
          finishedMs: null,
          personalSolvedAt: null,
          personalSolvedDismissed: false,
          lossPromptDismissed: true,
          hintsUsed: 0,
          board: [...puzzle.puzzle],
          notes: blankNotes(),
          lastSeen: now(),
        },
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
    const kickedIds = { ...(room.kickedIds || {}), [targetId]: now() };
    const canContinueCountdown = Object.values(players).length >= 2;
    publish({
      ...room,
      players,
      pauseRequests,
      resumeRequests,
      rematchRequests,
      kickedIds,
      status: room.status === "countdown" && !canContinueCountdown ? "lobby" : room.status,
      countdownEndsAt: room.status === "countdown" && !canContinueCountdown ? null : room.countdownEndsAt,
      startedAt: room.status === "countdown" && !canContinueCountdown ? null : room.startedAt,
    });
  },
  pushMove: (digit) => {
    const { room, player, selected, inputMode, publish, history, saveStats, countPlaced } = get();
    const me = room?.players?.[player.id];
    if (!room || !me || selected === null || room.puzzle[selected] || room.pausedAt || me.status === "spectating" || me.status === "lost") return;
    if (room.status === "countdown") return;
    if (get().viewingId && get().viewingId !== player.id) return;
    if (inputMode === "value" && countPlaced(me.board, digit) >= 9) return;
    if (room.status === "ended" && me.status !== "continue") return;
    if (inputMode === "value" && me.board[selected] === digit) return;

    const snapshot = {
      board: [...me.board],
      notes: me.notes.map((n) => [...n]),
    };
    const notes = me.notes.map((n) => [...n]);
    const board = [...me.board];
    let mistakes = me.mistakes;
    let status = me.status;

    if (inputMode === "note") {
      if (board[selected]) return;
      notes[selected] = notes[selected].includes(digit)
        ? notes[selected].filter((n) => n !== digit)
        : [...notes[selected], digit].sort();
    } else if (room.solution[selected] === digit) {
      board[selected] = digit;
      notes[selected] = [];
      cellPeers(selected).forEach((idx) => {
        notes[idx] = notes[idx].filter((n) => n !== digit);
      });
      playSound(880, 150);
      vibrate([10, 5, 10]);
    } else {
      board[selected] = digit;
      notes[selected] = [];
      mistakes += 1;
      if (mistakes >= 3) status = "lost";
      playSound(220, 200);
      vibrate([30, 10, 30]);
    }

    const progress = Math.round((board.filter(Boolean).length / 81) * 100);
    let winnerId = room.winnerId;
    let roomStatus = room.status;
    const solved = board.every((value, idx) => value === room.solution[idx]);
    let personalSolvedAt = me.personalSolvedAt ?? null;
    let personalSolvedDismissed = me.personalSolvedDismissed ?? false;
    if (!winnerId && solved && mistakes <= 2) {
      winnerId = player.id;
      roomStatus = "ended";
      status = "winner";
      const elapsed = now() - room.startedAt - room.totalPausedMs;
      personalSolvedAt = elapsed;
      personalSolvedDismissed = true;
      const best = get().stats.bestTimes[room.difficulty];
      saveStats({
        played: get().stats.played + 1,
        wins: get().stats.wins + 1,
        mistakeHistory: [...get().stats.mistakeHistory.slice(-19), mistakes],
        bestTimes: { ...get().stats.bestTimes, [room.difficulty]: best ? Math.min(best, elapsed) : elapsed },
      });
    } else if (status === "lost" && me.status !== "lost") {
      saveStats({
        played: get().stats.played + 1,
        losses: get().stats.losses + 1,
        mistakeHistory: [...get().stats.mistakeHistory.slice(-19), mistakes],
      });
    } else if (solved && status === "continue" && !personalSolvedAt) {
      personalSolvedAt = room.startedAt ? now() - room.startedAt - room.totalPausedMs : 0;
      personalSolvedDismissed = false;
    }

    const finishedMs =
      status === "winner" && room.startedAt
        ? now() - room.startedAt - room.totalPausedMs
        : me.finishedMs ?? null;
    publish({
      ...room,
      status: roomStatus,
      winnerId,
      players: {
        ...room.players,
        [player.id]: {
          ...me,
          board,
          notes,
          mistakes,
          progress,
          status,
          finishedMs,
          personalSolvedAt,
          personalSolvedDismissed,
          lossPromptDismissed: status === "lost" ? false : me.lossPromptDismissed,
          lastSeen: now(),
        },
      },
    });
    set({ history: [...history, snapshot].slice(-120) });
  },
  erase: () => {
    const { room, player, selected, publish, history } = get();
    const me = room?.players?.[player.id];
    if (!room || !me || selected === null || room.puzzle[selected] || room.pausedAt || me.status === "spectating" || me.status === "lost") return;
    if (get().viewingId && get().viewingId !== player.id) return;
    const snapshot = {
      board: [...me.board],
      notes: me.notes.map((n) => [...n]),
    };
    const board = [...me.board];
    const notes = me.notes.map((n) => [...n]);
    board[selected] = 0;
    notes[selected] = [];
    publish({
      ...room,
      players: { ...room.players, [player.id]: { ...me, board, notes, progress: Math.round((board.filter(Boolean).length / 81) * 100) } },
    });
    set({ history: [...history, snapshot].slice(-120) });
  },
  undo: () => {
    const { room, player, publish, history } = get();
    const me = room?.players?.[player.id];
    if (!room || !me) return;
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
        },
      },
    });
    set({ history: history.slice(0, -1) });
  },
}));

