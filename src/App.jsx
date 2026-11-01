import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  CalendarDays,
  Check,
  Clipboard,
  Link2,
  Lightbulb,
  Crown,
  LogOut,
  Eye,
  Moon,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  ScanLine,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import React, { useCallback, useEffect, useState } from "react";
import {
  DARK_THEME,
  EMPTY_ROOM_TTL_MS,
  LIGHT_THEME,
  copyText,
  difficulties,
  blankNotes,
  digitIsComplete,
  getPauseVoterIds,
  isPlayerOnline,
  mergeRoomPresence,
  normalizeRoom,
  createPlayer,
  now,
  pendingGets,
  resolvePendingGet,
  readJSON,
  storage,
  toDateKey,
  parseDateKey,
  canonicalDateKey,
  isFutureDateKey,
  themes,
  useGame,
  writeRoom,
} from "./game/store";
import { boardProgress, elapsed, formatTime, matchStanding, statusLabel } from "./game/formatters";

function App() {
  const room = useGame((s) => s.room);
  const mode = useGame((s) => s.mode);
  const theme = useGame((s) => s.theme);
  const player = useGame((s) => s.player);
  const publish = useGame((s) => s.publish);
  const joinRoom = useGame((s) => s.joinRoom);
  const leaveRoom = useGame((s) => s.leaveRoom);
  const openDailyBoard = useGame((s) => s.openDailyBoard);
  const leaveDaily = useGame((s) => s.leaveDaily);
  const setTheme = useGame((s) => s.setTheme);
  const ws = useGame((s) => s.ws);
  const addSnack = useGame((s) => s.addSnack);
  const prevRoomRef = React.useRef(null);
  const [urlJoinPending, setUrlJoinPending] = useState(() => Boolean(new URLSearchParams(location.search).get("room")));

  useEffect(() => {
    const channel = new BroadcastChannel("sudostrike");
    useGame.setState({ channel });
    channel.onmessage = (event) => {
      const data = event.data;
      if (data?.type === "presence") {
        const current = useGame.getState().room;
        if (current && current.code === data.code && current.players?.[data.playerId]) {
          const target = current.players[data.playerId];
          useGame.setState({
            room: {
              ...current,
              players: {
                ...current.players,
                [data.playerId]: {
                  ...target,
                  connected: true,
                  lastSeen: Math.max(target.lastSeen || 0, data.lastSeen || now()),
                },
              },
            },
          });
        }
        return;
      }
      const current = useGame.getState().room;
      const next = normalizeRoom(data);
      if (!current || !next || next.code !== current.code) return;
      if ((next.updatedAt || 0) >= (current.updatedAt || 0)) {
        useGame.setState({ room: mergeRoomPresence(current, next) });
      }
    };
    const onLocal = (event) => {
      const current = useGame.getState().room;
      const next = normalizeRoom(event.detail);
      if (!current || !next || current.code !== next.code) return;
      if ((next.updatedAt || 0) >= (current.updatedAt || 0)) {
        useGame.setState({ room: mergeRoomPresence(current, next) });
      }
    };
    const onSnack = (event) => {
      if (event?.detail?.message) addSnack(event.detail.message);
    };
    window.addEventListener("sv-room-local", onLocal);
    window.addEventListener("sv-snack", onSnack);

    // websocket cross-device sync with auto-reconnect
    let reconnectTimer = null;
    let disposed = false;
    const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrls = [
      `${wsProtocol}//${location.host}/room-ws`,
      `${wsProtocol}//${location.hostname}:5174/room-ws`,
      `${wsProtocol}//${location.hostname}:5174`,
    ];
    const connectWs = (attempt = 0) => {
      if (disposed) return;
      const wsUrl = wsUrls[attempt % wsUrls.length];
      try {
        const ws = new WebSocket(wsUrl);
        let opened = false;
        ws.addEventListener("open", () => useGame.setState({ ws }));
        ws.addEventListener("open", () => {
          opened = true;
        });
        ws.addEventListener("message", (ev) => {
          let msg;
          try {
            msg = JSON.parse(ev.data);
          } catch (e) {
            return;
          }
          if (msg?.type === "presence") {
            const current = useGame.getState().room;
            if (current && current.code === msg.code && current.players?.[msg.playerId]) {
              const target = current.players[msg.playerId];
              useGame.setState({
                room: {
                  ...current,
                  players: {
                    ...current.players,
                    [msg.playerId]: {
                      ...target,
                      connected: true,
                      lastSeen: Math.max(target.lastSeen || 0, msg.lastSeen || now()),
                    },
                  },
                },
              });
            }
            return;
          }
          if (msg?.type === "room") {
            if (msg.reqId || msg.code) {
              resolvePendingGet(msg.reqId, msg.code, msg.room || null);
            }
            if (msg.room) {
              const next = normalizeRoom(msg.room);
              const currentRoom = useGame.getState().room;
              // Stop persisting other people's rooms (#17)
              const isCurrentRoom = currentRoom && currentRoom.code === next?.code;
              const isJoiningRoom = [...pendingGets.values()].some((entry) => entry.code === next?.code);
              if (next && (isCurrentRoom || isJoiningRoom)) {
                writeRoom(next);
                window.dispatchEvent(new CustomEvent("sv-room-local", { detail: next }));
              }
            }
          }
          if (msg?.type === "room:closed") {
            const currentRoom = useGame.getState().room;
            if (currentRoom && currentRoom.code === String(msg.code || "").toUpperCase()) {
              addSnack("Room closed due to inactivity.");
              useGame.getState().leaveRoom({ historyMode: "replace" });
            }
          }
        });
        ws.addEventListener("close", () => {
          if (useGame.getState().ws === ws) useGame.setState({ ws: null });
          if (!disposed) reconnectTimer = setTimeout(() => connectWs(opened ? attempt : attempt + 1), opened ? 1200 : 350);
        });
        ws.addEventListener("error", () => {
          try {
            ws.close();
          } catch (e) {}
        });
      } catch (e) {
        if (!disposed) reconnectTimer = setTimeout(() => connectWs(attempt + 1), 350);
      }
    };
    connectWs();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        useGame.getState().ws?.close();
      } catch (e) {}
      channel.close();
      window.removeEventListener("sv-room-local", onLocal);
      window.removeEventListener("sv-snack", onSnack);
    };
  }, [addSnack]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("room");
    const daily = params.get("daily");
    if (daily && !code) {
      openDailyBoard(decodeURIComponent(daily), { historyMode: "replace" });
      setUrlJoinPending(false);
      return;
    }
    if (!code) {
      setUrlJoinPending(false);
      return;
    }
    const targetCode = code.toUpperCase();
    if (room?.code === targetCode) {
      setUrlJoinPending(false);
      return;
    }
    let cancelled = false;
    let failTimer = null;
    setUrlJoinPending(true);
    joinRoom(targetCode, { historyMode: "replace" }).then((res) => {
      if (cancelled) return;
      const currentCode = new URLSearchParams(location.search).get("room");
      if (!currentCode || currentCode.toUpperCase() !== targetCode) {
        setUrlJoinPending(false);
        return;
      }
      setUrlJoinPending(false);
      if (!res?.ok) {
        const reason = res?.reason;
        if (reason === "not_found") {
          addSnack(`Room ${targetCode} not found.`);
        } else if (reason === "full") {
          addSnack(`Room ${targetCode} is full (maximum 8 players).`);
        } else if (reason === "kicked") {
          addSnack(`You were kicked from room ${targetCode}.`);
        } else {
          addSnack(`Could not connect to room ${targetCode}.`);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [joinRoom, room?.code, addSnack, openDailyBoard]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(location.search);
      const code = params.get("room");
      const daily = params.get("daily");
      const state = useGame.getState();
      const currentCode = state.room?.code || null;
      const currentDaily = state.dailyDateKey || null;
      const currentMode = state.mode;

      if (daily && !code) {
        setUrlJoinPending(false);
        const canonical = canonicalDateKey(decodeURIComponent(daily));
        if (currentMode !== "daily" || currentDaily !== canonical) {
          state.openDailyBoard(canonical, { historyMode: "replace" });
        }
        return;
      }
      if (code) {
        const nextCode = code.toUpperCase();
        if (currentCode !== nextCode) {
          setUrlJoinPending(true);
          state.joinRoom(nextCode, { historyMode: "replace" }).finally(() => {
            setUrlJoinPending(false);
          });
        }
        return;
      }
      setUrlJoinPending(false);
      if (currentCode) state.leaveRoom({ historyMode: "replace" });
      if (currentMode === "daily") state.leaveDaily({ historyMode: "replace" });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!room) return undefined;
    if (room.status === "countdown" && room.countdownEndsAt && now() >= room.countdownEndsAt) {
      publish({
        ...room,
        status: "playing",
        startedAt: now(),
        countdownEndsAt: null,
      });
    }
    const interval = setInterval(() => {
      const state = useGame.getState();
      const current = state.room;
      if (!current?.players[player.id]) return;
      if (current.status === "countdown" && current.countdownEndsAt && now() >= current.countdownEndsAt) {
        state.publish({
          ...current,
          status: "playing",
          startedAt: now(),
          countdownEndsAt: null,
        });
        return;
      }
      state.sendHeartbeat();
    }, 2500);
    return () => clearInterval(interval);
  }, [room?.code, player.id, publish]);

  useEffect(() => {
    if (theme && !themes[theme]) setTheme(LIGHT_THEME);
  }, [theme, setTheme]);

  useEffect(() => {
    if (!room) {
      prevRoomRef.current = null;
      return;
    }
    const prev = prevRoomRef.current;
    if (!prev || prev.code !== room.code) {
      prevRoomRef.current = room;
      return;
    }
    const prevPlayers = prev.players || {};
    const players = room.players || {};
    if (prev.status === "lobby" && room.status === "playing") addSnack("Match started");
    if (prev.status === "ended" && room.status === "countdown") addSnack("Rematch accepted. New board starts in 3 seconds");
    if (!prev.pausedAt && room.pausedAt) addSnack("Game paused");
    if (prev.pausedAt && !room.pausedAt) addSnack("Game resumed");
    if (!prev.winnerId && room.winnerId && players[room.winnerId]) addSnack(`${players[room.winnerId].name} won the race`);
    Object.values(players).forEach((p) => {
      const old = prevPlayers[p.id];
      if (old && !isPlayerOnline(old) && isPlayerOnline(p)) addSnack(`${p.name} reconnected`);
      if (old && isPlayerOnline(old) && !isPlayerOnline(p)) addSnack(`${p.name} went offline`);
      if (old && !old.ready && p.ready && room.status === "lobby") addSnack(`${p.name} is ready`);
      if (old && old.status !== "lost" && p.status === "lost") addSnack(`${p.name} is out`);
      if (old && !old.personalSolvedAt && p.personalSolvedAt && p.status === "continue") addSnack(`${p.name} solved in continue mode`);
    });
    prevRoomRef.current = room;
  }, [room, addSnack]);

  useEffect(() => {
    const onKey = (event) => {
      const tag = (event.target?.tagName || "").toLowerCase();
      const isTypingTarget =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        event.target?.isContentEditable;
      if (isTypingTarget) return;
      const state = useGame.getState();
      const isDaily = state.mode === "daily" && state.dailyBoard;
      if (!state.room && !isDaily) return;
      if (event.key.startsWith("Arrow")) {
        const room = state.room;
        const player = state.player;
        if (isDaily) {
          event.preventDefault();
          const selected = state.dailySelected;
          const base = selected === null ? 0 : selected;
          const row = Math.floor(base / 9);
          const col = base % 9;
          let next = base;
          if (event.key === "ArrowUp") next = row > 0 ? (row - 1) * 9 + col : base;
          if (event.key === "ArrowDown") next = row < 8 ? (row + 1) * 9 + col : base;
          if (event.key === "ArrowLeft") next = col > 0 ? row * 9 + (col - 1) : base;
          if (event.key === "ArrowRight") next = col < 8 ? row * 9 + (col + 1) : base;
          useGame.getState().setDailySelected(next);
          return;
        }
        const viewingId = state.viewingId || player.id;
        const me = room?.players?.[player.id];
        const canNavigate = viewingId === player.id && me && me.status !== "spectating" && me.status !== "lost";
        if (!canNavigate) return;
        event.preventDefault();
        const selected = state.selected;
        const base = selected === null ? 0 : selected;
        const row = Math.floor(base / 9);
        const col = base % 9;
        let next = base;
        if (event.key === "ArrowUp") next = row > 0 ? (row - 1) * 9 + col : base;
        if (event.key === "ArrowDown") next = row < 8 ? (row + 1) * 9 + col : base;
        if (event.key === "ArrowLeft") next = col > 0 ? row * 9 + (col - 1) : base;
        if (event.key === "ArrowRight") next = col < 8 ? row * 9 + (col + 1) : base;
        useGame.getState().setSelected(next);
        return;
      }
      const digitFromKey = /^[1-9]$/.test(event.key)
        ? Number(event.key)
        : (/^(Digit|Numpad)[1-9]$/.test(event.code) ? Number(event.code.slice(-1)) : null);
      if (digitFromKey) {
        useGame.getState().pushMove(digitFromKey);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") useGame.getState().erase();
      if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey)) useGame.getState().undo();
      if (event.code === "Space") {
        if (tag === "button") return;
        event.preventDefault();
        const current = useGame.getState();
        if (current.mode === "daily") {
          useGame.setState({ dailyInputMode: current.dailyInputMode === "value" ? "note" : "value" });
          return;
        }
        useGame.setState({ inputMode: current.inputMode === "value" ? "note" : "value" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const cleanup = setInterval(() => {
      const ts = now();
      const keys = storage.keys().filter((k) => k.startsWith("sv-room-"));
      keys.forEach((key) => {
        const room = normalizeRoom(readJSON(key, null));
        if (!room?.players) return;
        const players = Object.values(room.players);
        if (players.length === 0) {
          storage.remove(key);
          return;
        }
        const everyoneOffline = players.every((p) => !isPlayerOnline(p, ts));
        if (!everyoneOffline) return;
        const latestSeen = Math.max(...players.map((p) => p?.lastSeen || 0));
        if (ts - latestSeen >= EMPTY_ROOM_TTL_MS) storage.remove(key);
      });
    }, 15000);
    return () => clearInterval(cleanup);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 768px)").matches) return;
    let targetId = null;
    if (mode === "daily") targetId = "daily-board-anchor";
    if (room && room.status !== "lobby") targetId = "room-board-anchor";
    if (!targetId) return;
    const timer = setTimeout(() => {
      const target = document.getElementById(targetId);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 140);
    return () => clearTimeout(timer);
  }, [mode, room?.code, room?.status]);

  return (
    <main className={`${themes[theme]} min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors`}>
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <Header onHome={() => {
          if (mode === "daily") {
            leaveDaily();
            return;
          }
          leaveRoom();
        }} />
        {mode === "daily" ? (
          <DailyPlay />
        ) : room ? (
          <Room />
        ) : urlJoinPending ? (
          <RoomLoading room={{ code: new URLSearchParams(location.search).get("room")?.toUpperCase() || "..." }} />
        ) : (
          <Home />
        )}
        <SnackbarStack />
      </div>
    </main>
  );
}

function Header({ onHome }) {
  const theme = useGame((s) => s.theme);
  const setTheme = useGame((s) => s.setTheme);
  const toggleDarkMode = useGame((s) => s.toggleDarkMode);
  const dark = theme === DARK_THEME;
  return (
    <header className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
      <button className="flex items-center gap-3 text-left" onClick={onHome} title="Go home" aria-label="Sudostrike Home">
        <div className="grid size-11 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accentText)] shadow-glow">
          <Sparkles size={21} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-normal">Sudostrike</h1>
          <p className="text-sm text-[var(--muted)]">Real-time competitive Sudoku</p>
        </div>
      </button>
      <div className="flex items-center gap-2">
        <select
          aria-label="Color Theme"
          className="h-10 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none"
          value={theme}
          onChange={(event) => setTheme(event.target.value)}
        >
          {Object.keys(themes).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <ThemeIcon dark={dark} onToggle={toggleDarkMode} />
      </div>
    </header>
  );
}

function ThemeIcon({ dark, onToggle }) {
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      className="grid size-10 place-items-center rounded-md border border-[var(--line)] bg-[var(--panel)] text-[var(--muted)]"
      onClick={onToggle}
      title={label}
      aria-label={label}
    >
      {dark ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}

function Home() {
  const createRoom = useGame((s) => s.createRoom);
  const createSolo = useGame((s) => s.createSolo);
  const joinRoom = useGame((s) => s.joinRoom);
  const stats = useGame((s) => s.stats);
  const openDailyBoard = useGame((s) => s.openDailyBoard);
  const dailyProgress = useGame((s) => s.dailyProgress);
  const getDailyBoard = useGame((s) => s.getDailyBoard);
  const [difficulty, setDifficulty] = useState("Medium");
  const [code, setCode] = useState("");
  const [joinError, setJoinError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const dailyMeta = getDailyBoard(selectedDate);
  const selectedProgress = dailyProgress[selectedDate];
  const selectedDateObj = parseDateKey(selectedDate) || new Date();
  const start = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const firstWeekday = start.getDay();
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  const monthCells = [];
  for (let i = 0; i < firstWeekday; i += 1) monthCells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) monthCells.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
  while (monthCells.length % 7 !== 0) monthCells.push(null);

  return (
    <div className="grid flex-1 gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="flex flex-col justify-center gap-6 py-8">
        <div className="max-w-2xl">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
            <ScanLine size={16} /> Live rooms, shared boards, instant pressure.
          </p>
          <h2 className="text-5xl font-semibold leading-tight tracking-normal sm:text-6xl">
            Race the grid before mistakes catch you.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">
            Create a room, share the code, wait for everyone to ready up, then solve the same puzzle at the same time.
          </p>
        </div>
          <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
            <label className="mb-2 block text-sm font-medium text-[var(--muted)]">Difficulty</label>
            <select
              className="mb-4 h-11 w-full rounded-md border border-[var(--line)] bg-[var(--soft)] px-3 outline-none"
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
            >
              {Object.keys(difficulties).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <button className="btn-primary w-full" onClick={() => createRoom(difficulty)}>
              <Users size={18} /> Create Room
            </button>
            <button className="btn-secondary mt-2 w-full" onClick={() => createSolo(difficulty)}>
              <Play size={18} /> Play Solo
            </button>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
            <label className="mb-2 block text-sm font-medium text-[var(--muted)]">Room Code</label>
            <input
              className="mb-4 h-11 w-full rounded-md border border-[var(--line)] bg-[var(--soft)] px-3 uppercase outline-none"
              value={code}
              onChange={(event) => {
                setJoinError(null);
                setCode(event.target.value.toUpperCase());
              }}
              placeholder="ABC123"
            />
            <button
              className="btn-secondary w-full"
              onClick={async () => {
                const res = await joinRoom(code);
                if (!res?.ok) {
                  setJoinError(res?.reason || "not_found");
                } else {
                  setJoinError(null);
                }
              }}
            >
              <LogOut size={18} /> Join Room
            </button>
            {joinError === "not_found" && (
              <p className="mt-2 text-sm text-[var(--danger)]">Room code not found. Check the code and try again.</p>
            )}
            {joinError === "full" && (
              <p className="mt-2 text-sm text-[var(--danger)]">This room is full (maximum 8 players reached).</p>
            )}
            {joinError === "kicked" && (
              <p className="mt-2 text-sm text-[var(--danger)]">You were kicked from this room.</p>
            )}
            {joinError === "offline" && (
              <p className="mt-2 text-sm text-[var(--danger)]">Could not connect to server. Check your connection.</p>
            )}
            {joinError === "invalid_code" && (
              <p className="mt-2 text-sm text-[var(--danger)]">Please enter a valid room code.</p>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays size={18} className="text-[var(--accent)]" />
            <h3 className="font-semibold">Daily Calendar</h3>
          </div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              className="btn-secondary h-9 px-3"
              aria-label="Previous month"
              onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            >
              Prev
            </button>
            <p className="text-sm font-semibold">
              {monthCursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </p>
            <button
              className="btn-secondary h-9 px-3"
              aria-label="Next month"
              onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            >
              Next
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-[var(--muted)]">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthCells.map((date, idx) => {
              if (!date) return <div key={`empty-${idx}`} className="h-11 rounded-md bg-transparent" />;
              const key = toDateKey(date);
              const status = dailyProgress[key]?.status || "not_started";
              const selected = key === selectedDate;
              const statusClass = status === "solved" ? "bg-[var(--good)]" : status === "in_progress" ? "bg-[var(--accent)]" : "bg-[var(--line)]";
              const readableStatus = status === "solved" ? "solved" : status === "in_progress" ? "in progress" : "not started";
              return (
                <button
                  key={key}
                  disabled={isFutureDateKey(key)}
                  className={`relative h-11 rounded-md border text-sm ${selected ? "border-[var(--accent)] bg-[var(--soft)]" : "border-[var(--line)] bg-[var(--panel)]"} ${status === "solved" ? "ring-1 ring-[var(--good)]/50" : ""}`}
                  onClick={() => setSelectedDate(key)}
                  title={`${key} - ${readableStatus}`}
                  aria-label={`${key}, ${readableStatus}`}
                >
                  <span className={status === "solved" ? "font-semibold text-[var(--good)]" : ""}>{date.getDate()}</span>
                  {status === "solved" && (
                    <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-[var(--good)] text-[var(--accentText)]">
                      <Check size={10} />
                    </span>
                  )}
                  <span className={`absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full ${statusClass}`} />
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <p>
              <span className="text-sm text-[var(--muted)]">Selected</span><br />
              <span className="font-semibold">
                {String(selectedDateObj.getDate()).padStart(2, "0")}-{String(selectedDateObj.getMonth() + 1).padStart(2, "0")}-{selectedDateObj.getFullYear()}
              </span>
              <span className="ml-3 text-sm text-[var(--muted)]">({dailyMeta.difficulty}, {selectedProgress?.status || "not_started"})</span>
            </p>
            <button className="btn-primary" onClick={() => openDailyBoard(selectedDate)} disabled={isFutureDateKey(selectedDate)}>
              <Play size={18} /> Play Day
            </button>
          </div>
        </div>
      </section>
      <StatsPanel stats={stats} />
    </div>
  );
}

function StatsPanel({ stats }) {
  const history = stats.mistakeHistory || [];
  const recent = history.slice(-12);
  const [activeBar, setActiveBar] = useState(null);
  const avgMistakes = history.length
    ? (history.reduce((sum, val) => sum + val, 0) / history.length).toFixed(1)
    : "0.0";
  const cleanRuns = history.filter((m) => m === 0).length;
  const maxMistakes = history.length ? Math.max(...history) : 0;
  return (
    <aside className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="mb-5 flex items-center gap-2">
        <BarChart3 size={19} className="text-[var(--accent)]" />
        <h3 className="text-lg font-semibold">Local Dashboard</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Played" value={stats.played} />
        <Metric label="Wins" value={stats.wins} />
        <Metric label="Losses" value={stats.losses} />
        <Metric label="Win Rate" value={`${stats.played ? Math.round((stats.wins / stats.played) * 100) : 0}%`} />
        <Metric label="Avg Mistakes" value={avgMistakes} />
        <Metric label="Clean Runs" value={cleanRuns} />
      </div>
      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-[var(--muted)]">Best Times</p>
        <div className="space-y-2">
          {Object.keys(difficulties).map((difficulty) => (
            <div key={difficulty} className="flex justify-between border-b border-[var(--line)] py-2 text-sm">
              <span>{difficulty}</span>
              <span className="text-[var(--muted)]">{stats.bestTimes?.[difficulty] ? formatTime(stats.bestTimes[difficulty]) : "..."}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-[var(--muted)]">Mistake History (last 12)</p>
          <p className="text-xs text-[var(--muted)]">Max: {maxMistakes}</p>
        </div>
        <div className="grid grid-cols-12 items-end gap-1 rounded-md border border-[var(--line)] bg-[var(--soft)] p-2">
          {(recent.length ? recent : [0]).map((mistakes, idx) => (
            <button
              key={`${mistakes}-${idx}`}
              type="button"
              className="relative w-full"
              title={`Match ${idx + 1}: ${mistakes} mistakes`}
              onMouseEnter={() => setActiveBar(idx)}
              onMouseLeave={() => setActiveBar((current) => (current === idx ? null : current))}
              onFocus={() => setActiveBar(idx)}
              onBlur={() => setActiveBar((current) => (current === idx ? null : current))}
              onClick={() => setActiveBar((current) => (current === idx ? null : idx))}
            >
              {activeBar === idx && (
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-md border border-[var(--line)] bg-[var(--panel)] px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap">
                  {mistakes}
                </span>
              )}
              <span
                className={mistakes >= 3 ? "block w-full rounded-sm bg-[var(--danger)] opacity-90" : "block w-full rounded-sm bg-[var(--accent)] opacity-85"}
                style={{ height: `${Math.max(10, mistakes * 14)}px` }}
              />
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Bar height = mistakes in each recent match. Red bars indicate 3 or more mistakes.
        </p>
      </div>
    </aside>
  );
}

function DailyPlay() {
  const leaveDaily = useGame((s) => s.leaveDaily);
  const dailyDateKey = useGame((s) => s.dailyDateKey);
  const dailyBoard = useGame((s) => s.dailyBoard);
  const dailyProgress = useGame((s) => s.dailyProgress);
  const dailySelected = useGame((s) => s.dailySelected);
  const setDailySelected = useGame((s) => s.setDailySelected);
  const dailyInputMode = useGame((s) => s.dailyInputMode);
  const setDailyInputMode = useGame((s) => s.setDailyInputMode);
  const pushMove = useGame((s) => s.pushMove);
  const erase = useGame((s) => s.erase);
  const undo = useGame((s) => s.undo);
  const useHint = useGame((s) => s.useHint);
  const dailyPaused = useGame((s) => s.dailyPaused);
  const toggleDailyPause = useGame((s) => s.toggleDailyPause);
  const dailyRematch = useGame((s) => s.dailyRematch);
  const [tick, setTick] = useState(0);
  const dailyStartedAt = useGame((s) => s.dailyStartedAt);

  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!dailyBoard) return null;
  const progress = dailyProgress[dailyDateKey] || {};
  const snapshot = progress.lastBoardSnapshot || { board: [...dailyBoard.puzzle], notes: blankNotes() };
  const board = snapshot.board;
  const notes = snapshot.notes;
  const selectedValue = dailySelected === null ? null : board[dailySelected];
  const elapsedMs =
    (progress.elapsedMs || 0) +
    (!dailyPaused && progress.status !== "solved" && !progress.solvedAt && dailyStartedAt
      ? Math.max(0, now() - dailyStartedAt)
      : 0);
  const counts = Array.from({ length: 10 }, (_, n) => board.reduce((total, value, idx) => total + (value === n && dailyBoard.solution[idx] === n ? 1 : 0), 0));
  const mistakes = progress.mistakes || 0;
  const progressPercent = Math.round((board.filter(Boolean).length / 81) * 100);
  const shareLink = `${window.location.origin}${window.location.pathname}?daily=${encodeURIComponent(dailyDateKey)}`;
  void tick;

  return (
    <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <section className="min-w-0 space-y-4">
        <div className="relative rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 pr-14 sm:p-4 sm:pr-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-start">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Daily Challenge</p>
              <p className="text-xl font-semibold sm:text-2xl">{dailyDateKey}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-[var(--line)] bg-[var(--soft)] px-2 py-1 font-medium">
                  {dailyBoard.difficulty}
                </span>
                <span className="rounded-full border border-[var(--line)] bg-[var(--soft)] px-2 py-1">
                  {progress.status || "not_started"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
              <div className="rounded-md border border-[var(--line)] bg-[var(--soft)] px-3 py-2">
                <p className="text-[var(--muted)]">Progress</p>
                <p className="font-semibold text-[var(--text)]">{progressPercent}%</p>
              </div>
              <div className="rounded-md border border-[var(--line)] bg-[var(--soft)] px-3 py-2">
                <p className="text-[var(--muted)]">Hints Left</p>
                <p className="font-semibold text-[var(--text)]">{Math.max(0, 2 - (progress.hintsUsed || 0))}</p>
              </div>
            </div>
            <button className="icon-btn absolute right-3 top-3 sm:static sm:justify-self-end" onClick={leaveDaily} title="Back home" aria-label="Back home">
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <div id="daily-board-anchor" className="relative mx-auto w-full max-w-[min(92vw,660px)]">
          <div className={`sudoku-grid ${dailyPaused ? "blur-md" : ""}`} role="grid" aria-label="Sudoku board">
            {board.map((value, idx) => {
              const fixed = Boolean(dailyBoard.puzzle[idx]);
              const row = Math.floor(idx / 9);
              const col = idx % 9;
              const sameRow = dailySelected !== null && Math.floor(dailySelected / 9) === row;
              const sameCol = dailySelected !== null && dailySelected % 9 === col;
              const sameBox =
                dailySelected !== null &&
                Math.floor(Math.floor(dailySelected / 9) / 3) === Math.floor(row / 3) &&
                Math.floor((dailySelected % 9) / 3) === Math.floor(col / 3);
              const sameNumber = selectedValue && value === selectedValue;
              const wrongEntry = !fixed && value && value !== dailyBoard.solution[idx];
              const cellLabel = `row ${row + 1} column ${col + 1}${value ? `, ${value}` : ""}${fixed ? ", fixed" : ""}${wrongEntry ? ", incorrect" : ""}`;
              return (
                <button
                  key={idx}
                  role="gridcell"
                  aria-label={cellLabel}
                  aria-selected={idx === dailySelected}
                  tabIndex={idx === (dailySelected ?? 0) ? 0 : -1}
                  className={["cell", fixed ? "fixed" : "", idx === dailySelected ? "selected" : "", sameRow || sameCol || sameBox ? "peer" : "", sameNumber ? "same" : "", wrongEntry ? "wrong" : ""].join(" ")}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setDailySelected(idx)}
                  disabled={dailyPaused}
                >
                  {value ? (
                    <span>{value}</span>
                  ) : (
                    <div className="notes">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                        <span key={n}>{notes[idx]?.includes(n) ? n : ""}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {dailyPaused && (
            <div className="absolute inset-0 grid place-items-center rounded-lg bg-[var(--veil)] text-center backdrop-blur-md">
              <div>
                <Pause className="mx-auto mb-3" size={40} />
                <p className="text-2xl font-semibold">Paused</p>
                <p className="text-sm text-[var(--muted)]">Daily board is hidden until you resume.</p>
              </div>
            </div>
          )}
        </div>
        <div className="mx-auto grid w-full max-w-[min(92vw,660px)] grid-cols-9 gap-1.5 sm:gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
            const done = digitIsComplete(board, dailyBoard.solution, n);
            return (
              <button
                key={n}
                aria-label={`Digit ${n}, ${counts[n]} of 9 placed`}
                className={done ? "number-btn number-done" : "number-btn"}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => pushMove(n)}
                disabled={done || dailyPaused}
              >
                <span className="text-lg font-semibold leading-none">{n}</span>
                <span className="text-[10px] font-medium opacity-80">{counts[n]}/9</span>
              </button>
            );
          })}
        </div>
        <div className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--muted)]">Timer</p>
              <p className="text-2xl font-semibold tabular-nums">{formatTime(elapsedMs)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-[var(--muted)]">Mistakes</p>
              <p className="text-2xl font-semibold text-[var(--danger)]">{Math.min(mistakes, 3)}/3</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button className="icon-btn h-10 w-full sm:h-12 sm:w-12 sm:p-0" onClick={undo} title="Undo" aria-label="Undo">
              <RotateCcw size={18} />
            </button>
            <button className="icon-btn h-10 w-full sm:h-12 sm:w-12 sm:p-0" onClick={erase} title="Erase" aria-label="Erase">
              <Trash2 size={18} />
            </button>
            <button className={dailyInputMode === "note" ? "btn-primary h-10 w-full sm:w-auto" : "btn-secondary h-10 w-full sm:w-auto"} onClick={() => setDailyInputMode(dailyInputMode === "value" ? "note" : "value")}>
              <Pencil size={17} /> {dailyInputMode === "note" ? "Notes" : "Values"}
            </button>
            <button
              className="btn-secondary h-10 w-full disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              onClick={useHint}
              disabled={Math.max(0, 2 - (progress.hintsUsed || 0)) === 0 || dailyPaused || progress.status === "solved"}
              title={`Hint (${Math.max(0, 2 - (progress.hintsUsed || 0))} left)`}
              aria-label={`Hint (${Math.max(0, 2 - (progress.hintsUsed || 0))} left)`}
            >
              <Lightbulb size={17} /> Hint {Math.max(0, 2 - (progress.hintsUsed || 0))}
            </button>
            <button className={dailyPaused ? "btn-primary h-10 w-full sm:w-auto" : "btn-secondary h-10 w-full sm:w-auto"} onClick={toggleDailyPause}>
              {dailyPaused ? <Play size={17} /> : <Pause size={17} />} {dailyPaused ? "Resume" : "Pause"} 1
            </button>
            <button className="btn-secondary h-10 w-full sm:w-auto" onClick={dailyRematch}>
              <RotateCcw size={17} /> Rematch 1/1
            </button>
          </div>
        </div>
      </section>
      <aside className="flex flex-col gap-4">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users size={18} className="text-[var(--accent)]" />
            <h3 className="font-semibold">Progress</h3>
          </div>
          <div className="space-y-3">
            <div className="w-full rounded-md border border-[var(--line)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium">
                  <Eye size={16} className="text-[var(--muted)]" />
                  You
                </span>
                <span className="text-xs text-[var(--muted)]">{progress.status || "not_started"}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--soft)]">
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-[var(--muted)]">
                <span>{progressPercent}% complete</span>
                <span>{Math.min(mistakes, 3)}/3 mistakes</span>
              </div>
            </div>
          </div>
          <button
            className="btn-secondary mt-4 w-full"
            onClick={async () => {
              const ok = await copyText(shareLink);
              window.dispatchEvent(new CustomEvent("sv-snack", { detail: { message: ok ? "Daily link copied" : "Copy failed" } }));
            }}
          >
            <Link2 size={17} /> Copy Daily Link
          </button>
          <div className="mt-4 grid place-items-center rounded-md bg-white p-3">
            <QRCodeSVG value={shareLink} size={128} />
          </div>
        </div>
      </aside>
      <DailyCompletionOverlay />
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-md bg-[var(--soft)] p-4">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Room() {
  const room = useGame((s) => s.room);
  const player = useGame((s) => s.player);
  const setPlayerName = useGame((s) => s.setPlayerName);
  const publish = useGame((s) => s.publish);
  const leaveRoom = useGame((s) => s.leaveRoom);
  const kickPlayer = useGame((s) => s.kickPlayer);
  const inputMode = useGame((s) => s.inputMode);
  const setInputMode = useGame((s) => s.setInputMode);
  const togglePause = useGame((s) => s.togglePause);
  const undo = useGame((s) => s.undo);
  const erase = useGame((s) => s.erase);
  const useHint = useGame((s) => s.useHint);
  const [nameDraft, setNameDraft] = useState(player.name || "");
  const viewingId = useGame((s) => s.viewingId);
  const me = room.players?.[player.id];
  const viewedPlayer = (viewingId && room.players?.[viewingId]) || me;
  const activePlayers = Object.values(room.players || {}).filter((p) => p.status === "active");
  const isLobby = room.status === "lobby";
  const hasOpponents = Object.values(room.players || {}).some((p) => p.id !== player.id);
  const isPaused = Boolean(room.pausedAt);
  const voteMap = isPaused ? (room.resumeRequests || {}) : (room.pauseRequests || {});
  const pauseVoters = getPauseVoterIds(room);
  const voteBaseIds = isPaused
    ? ((room.pausedByIds && room.pausedByIds.length > 0)
      ? room.pausedByIds.filter((id) => pauseVoters.includes(id))
      : pauseVoters)
    : pauseVoters;
  const electorate = voteBaseIds.length > 0 ? voteBaseIds : pauseVoters;
  const voteCount = electorate.filter((id) => Boolean(voteMap[id])).length;
  const hintsLeft = Math.max(0, 2 - (me?.hintsUsed || 0));
  const progressPercent = me ? boardProgress(me.board, room.solution) : 0;
  const standing = me ? matchStanding(room, player.id)?.label || "Solo" : "Solo";
  const boardLocked = !me || isPaused || room.status === "countdown" ||
    me.status === "spectating" || me.status === "lost" || me.status === "winner" ||
    (room.status === "ended" && me.status !== "continue");

  useEffect(() => {
    setNameDraft(player.name || "");
  }, [player.name]);

  useEffect(() => {
    if (room?.kickedIds?.[player.id]) {
      window.dispatchEvent(new CustomEvent("sv-snack", { detail: { message: "You were removed from the room by the owner." } }));
      leaveRoom({ historyMode: "replace" });
      return;
    }
  }, [room?.kickedIds, room, player.id, leaveRoom]);

  useEffect(() => {
    if (!room || room.players?.[player.id]) return;
    if (room.kickedIds?.[player.id]) return;
    // Never publish a "repaired" room built from a malformed relay payload.
    if (!Array.isArray(room.puzzle) || room.puzzle.length !== 81) return;
    if (!Array.isArray(room.solution) || room.solution.length !== 81) return;
    const repaired = normalizeRoom({
      ...room,
      players: {
        ...room.players,
        [player.id]: createPlayer({
          ...player,
          puzzle: room.puzzle,
          ready: false,
          connected: true,
        }),
      },
    });
    if (repaired) publish(repaired);
  }, [room, player, publish]);

  if (!me) {
    return <RoomLoading room={room} />;
  }

  return (
    <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <section className="min-w-0 space-y-4">
        {isLobby ? (
          <Lobby />
        ) : (
          <>
            <CountdownOverlay />
            <SpectatorBanner />
            <MatchStatusBar
              room={room}
              viewedPlayer={viewedPlayer}
              mistakes={Math.min((viewedPlayer || me).mistakes || 0, 3)}
              progress={viewedPlayer ? boardProgress(viewedPlayer.board, room.solution) : progressPercent}
              standing={standing}
              paused={isPaused}
            />
            <Board />
            <NumberPad />
            <GameActionBar
              inputMode={inputMode}
              onToggleNotes={() => setInputMode(inputMode === "value" ? "note" : "value")}
              onUndo={undo}
              onErase={erase}
              onHint={useHint}
              hintsLeft={hintsLeft}
              onPause={togglePause}
              paused={isPaused}
              pauseBadge={voteCount}
              disableBoardActions={boardLocked}
              disableHint={boardLocked || hintsLeft === 0}
              disablePause={me.status === "spectating"}
            />
            <ContinueSolvedDialog />
            <WinnerChampionOverlay />
          </>
        )}
      </section>
      <aside className="flex flex-col gap-4">
        <div className="order-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 lg:order-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--muted)]">Room</p>
              <p className="text-2xl font-semibold tracking-normal">{room.code}</p>
              <p className="text-sm text-[var(--muted)]">{room.difficulty} · {activePlayers.length} active</p>
            </div>
            <button className="icon-btn" onClick={leaveRoom} title="Leave room" aria-label="Leave room">
              <LogOut size={18} />
            </button>
          </div>
          <button
            className="btn-secondary mt-4 w-full"
            onClick={async () => {
              const ok = await copyText(room.code);
              if (!ok) {
                window.dispatchEvent(new CustomEvent("sv-snack", { detail: { message: "Copy failed" } }));
                return;
              }
              window.dispatchEvent(new CustomEvent("sv-snack", { detail: { message: "Room code copied" } }));
            }}
          >
            <Clipboard size={17} /> Copy Code
          </button>
          <button
            className="btn-secondary mt-2 w-full"
            onClick={async () => {
              const ok = await copyText(`${window.location.origin}${window.location.pathname}?room=${room.code}`);
              if (!ok) {
                window.dispatchEvent(new CustomEvent("sv-snack", { detail: { message: "Copy failed" } }));
                return;
              }
              window.dispatchEvent(new CustomEvent("sv-snack", { detail: { message: "Room link copied" } }));
            }}
          >
            <Link2 size={17} /> Copy Room Link
          </button>
          <div className="mt-4 grid place-items-center rounded-md bg-white p-3">
            <QRCodeSVG value={`${window.location.origin}${window.location.pathname}?room=${room.code}`} size={128} />
          </div>
          <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--soft)] p-3">
            <label className="mb-2 block text-xs font-medium text-[var(--muted)]">Display Name</label>
            <div className="flex gap-2">
              <input
                className="h-10 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none"
                value={nameDraft}
                maxLength={24}
                onChange={(event) => setNameDraft(event.target.value)}
              />
              <button className="btn-secondary h-10 px-3" onClick={() => setPlayerName(nameDraft)}>
                Save
              </button>
            </div>
          </div>
          {isLobby && room.ownerId === player.id && (
            <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--soft)] p-3">
              <p className="mb-2 text-xs font-medium text-[var(--muted)]">Owner Controls</p>
              <div className="space-y-2">
                {Object.values(room.players)
                  .filter((p) => p.id !== player.id)
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-[var(--panel)] px-3 py-2">
                      <span className="text-sm">{p.name}</span>
                      <button className="btn-secondary h-9 px-3" onClick={() => kickPlayer(p.id)}>
                        Kick
                      </button>
                    </div>
                  ))}
                {Object.keys(room.players).length <= 1 && (
                  <p className="text-xs text-[var(--muted)]">No other players to remove.</p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="order-1 lg:order-2">
          <PlayersPanel />
        </div>
      </aside>
      <EndDialog />
    </div>
  );
}

function RoomLoading({ room }) {
  return (
    <div className="grid flex-1 place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] p-8 text-center">
      <div>
        <p className="text-sm font-medium text-[var(--muted)]">Joining room {room.code}</p>
        <p className="mt-2 text-2xl font-semibold">Syncing player state…</p>
      </div>
    </div>
  );
}

function Lobby() {
  const room = useGame((s) => s.room);
  const player = useGame((s) => s.player);
  const toggleReady = useGame((s) => s.toggleReady);
  const me = room.players[player.id];
  return (
    <div className="grid min-h-[620px] place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 text-center">
      <div className="max-w-md">
        <Users className="mx-auto mb-4 text-[var(--accent)]" size={40} />
        <h2 className="text-3xl font-semibold tracking-normal">Waiting for ready checks</h2>
        <p className="mt-3 text-[var(--muted)]">
          The shared board unlocks only after every player in the room clicks ready.
        </p>
        <div className="mt-6 grid gap-2">
          {Object.values(room.players).filter((p) => p.status !== "left").map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md bg-[var(--soft)] px-4 py-3">
              <span>{p.name}</span>
              <span className={p.ready ? "text-[var(--good)]" : "text-[var(--muted)]"}>{p.ready ? "Ready" : "Waiting"}</span>
            </div>
          ))}
        </div>
        <button className={me.ready ? "btn-primary mt-5 w-full" : "btn-secondary mt-5 w-full"} onClick={toggleReady}>
          <Check size={18} /> {me.ready ? "Ready" : "Ready Up"}
        </button>
      </div>
    </div>
  );
}

function MatchTimerDisplay({ room, viewedPlayer }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <span className="flex items-center gap-1.5 font-semibold tabular-nums" title="Elapsed time">
      <Timer size={16} className="text-[var(--muted)]" />
      {formatTime(elapsed(room, viewedPlayer))}
    </span>
  );
}

function MatchStatusBar({ room, viewedPlayer, mistakes, progress, standing, paused }) {
  return (
    <div className="sticky top-0 z-30 mb-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 shadow-sm">
      <div className="flex items-center gap-3 text-sm">
        <MatchTimerDisplay room={room} viewedPlayer={viewedPlayer} />
        {typeof mistakes === "number" && (
          <span className="flex items-center gap-1 font-semibold text-[var(--danger)]" title="Mistakes">
            <X size={15} />
            {mistakes}/3
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold">{progress}%</span>
            <span className="truncate text-[var(--muted)]">{standing}</span>
          </div>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--soft)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Board progress"
          >
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        {paused && (
          <span className="rounded-full bg-[var(--soft)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">
            Paused
          </span>
        )}
      </div>
    </div>
  );
}

function ActionButton({ label, icon, badge, active, disabled, onClick, title }) {
  return (
    <button
      className={[
        "flex h-12 flex-col items-center justify-center gap-0.5 rounded-md border text-[10px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? "border-[var(--accent)] bg-[var(--soft)] text-[var(--text)]"
          : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)]",
      ].join(" ")}
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={title || label}
    >
      <span className="relative">
        {icon}
        {typeof badge === "number" && badge > 0 && (
          <span className="absolute -right-2 -top-1 grid min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold leading-4 text-[var(--accentText)]">
            {badge}
          </span>
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}

function GameActionBar({
  inputMode,
  onToggleNotes,
  onUndo,
  onErase,
  onHint,
  hintsLeft,
  onPause,
  paused,
  pauseBadge,
  disableBoardActions,
  disableHint,
  disablePause,
}) {
  return (
    <div className="sticky bottom-0 z-30 mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-sm sm:static">
      <div className="grid grid-cols-5 gap-1.5">
        <ActionButton
          label="Undo"
          icon={<RotateCcw size={18} />}
          onClick={onUndo}
          disabled={disableBoardActions}
        />
        <ActionButton
          label="Erase"
          icon={<Trash2 size={18} />}
          onClick={onErase}
          disabled={disableBoardActions}
        />
        <ActionButton
          label={inputMode === "note" ? "Notes" : "Values"}
          icon={<Pencil size={18} />}
          onClick={onToggleNotes}
          active={inputMode === "note"}
        />
        <ActionButton
          label="Hint"
          icon={<Lightbulb size={18} />}
          badge={hintsLeft}
          onClick={onHint}
          disabled={disableHint}
          title={hintsLeft > 0 ? `Hint (${hintsLeft} left)` : "No hints left"}
        />
        <ActionButton
          label={paused ? "Resume" : "Pause"}
          icon={paused ? <Play size={18} /> : <Pause size={18} />}
          badge={pauseBadge}
          onClick={onPause}
          disabled={disablePause}
          active={paused}
        />
      </div>
    </div>
  );
}

function SpectatorBanner() {
  const room = useGame((s) => s.room);
  const player = useGame((s) => s.player);
  const viewingId = useGame((s) => s.viewingId);
  const resumeOwnBoard = useGame((s) => s.resumeOwnBoard);
  const me = room?.players?.[player.id];
  if (!me || me.status !== "spectating") return null;
  const viewed = room.players[viewingId];
  const watching = !viewed ? "another player" : viewed.id === player.id ? "your board" : viewed.name;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--accent)] bg-[var(--soft)] px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <Eye size={16} className="text-[var(--accent)]" />
        Spectating {watching}
      </span>
      <button className="btn-secondary h-9" onClick={resumeOwnBoard}>
        <Play size={15} /> Back to my board
      </button>
    </div>
  );
}

const Board = React.memo(function Board() {
  const room = useGame((s) => s.room);
  const player = useGame((s) => s.player);
  const selected = useGame((s) => s.selected);
  const setSelected = useGame((s) => s.setSelected);
  const forceResume = useGame((s) => s.forceResume);
  const viewingId = useGame((s) => s.viewingId) || player.id;
  const viewed = room.players[viewingId] || room.players[player.id];
  const me = room.players[player.id];
  const selectedValue = selected === null ? null : viewed.board[selected];
  const paused = Boolean(room.pausedAt);
  const canEdit = viewed.id === player.id && me.status !== "spectating" && me.status !== "lost" && room.winnerId !== player.id;

  return (
    <div id="room-board-anchor" className="relative mx-auto max-w-[min(92vw,660px)]">
      <div className={`sudoku-grid ${paused ? "blur-md" : ""}`} role="grid" aria-label="Sudoku board">
        {viewed.board.map((value, idx) => {
          const fixed = Boolean(room.puzzle[idx]);
          const row = Math.floor(idx / 9);
          const col = idx % 9;
          const sameRow = selected !== null && Math.floor(selected / 9) === row;
          const sameCol = selected !== null && selected % 9 === col;
          const sameBox =
            selected !== null &&
            Math.floor(Math.floor(selected / 9) / 3) === Math.floor(row / 3) &&
            Math.floor((selected % 9) / 3) === Math.floor(col / 3);
          const sameNumber = selectedValue && value === selectedValue;
          const wrongEntry = !fixed && value && value !== room.solution[idx];
          const cellLabel = `row ${row + 1} column ${col + 1}${value ? `, ${value}` : ""}${fixed ? ", fixed" : ""}${wrongEntry ? ", incorrect" : ""}`;
          return (
            <button
              key={idx}
              role="gridcell"
              aria-label={cellLabel}
              aria-selected={idx === selected}
              tabIndex={idx === (selected ?? 0) ? 0 : -1}
              className={[
                "cell",
                fixed ? "fixed" : "",
                idx === selected ? "selected" : "",
                sameRow || sameCol || sameBox ? "peer" : "",
                sameNumber ? "same" : "",
                wrongEntry ? "wrong" : "",
              ].join(" ")}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => canEdit && setSelected(idx)}
              disabled={!canEdit}
            >
              {value ? (
                <span>{value}</span>
              ) : (
                <div className="notes">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <span key={n}>{viewed.notes[idx]?.includes(n) ? n : ""}</span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {paused && (
        <div className="absolute inset-0 grid place-items-center rounded-lg bg-[var(--veil)] text-center backdrop-blur-md">
          <div>
            <Pause className="mx-auto mb-3" size={40} />
            <p className="text-2xl font-semibold">Paused</p>
            <p className="text-sm text-[var(--muted)]">The board is hidden until active players resume.</p>
            {room.ownerId === player.id && (
              <button className="btn-secondary mt-3 text-xs" onClick={forceResume}>
                Host Force Resume
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const NumberPad = React.memo(function NumberPad() {
  const room = useGame((s) => s.room);
  const player = useGame((s) => s.player);
  const viewingId = useGame((s) => s.viewingId);
  const pushMove = useGame((s) => s.pushMove);
  const me = room?.players?.[player.id];
  const board = me?.board;
  // Stable reference: a new array each render used to re-run the effect below,
  // which cleared the flash timer before it could fire.
  const counts = React.useMemo(
    () =>
      Array.from({ length: 10 }, (_, n) =>
        (board || []).reduce(
          (total, value, idx) => total + (value === n && room?.solution?.[idx] === n ? 1 : 0),
          0,
        ),
      ),
    [board],
  );
  const completed = React.useMemo(
    () => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => digitIsComplete(board, room?.solution, n)),
    [board, room?.solution],
  );
  const [flash, setFlash] = useState(null);
  const prevCompleted = React.useRef(completed);

  useEffect(() => {
    const newlyCompleted = completed.findIndex((done, idx) => done && !prevCompleted.current[idx]);
    prevCompleted.current = completed;
    if (newlyCompleted === -1) return undefined;
    setFlash(newlyCompleted + 1);
    const timer = setTimeout(() => setFlash(null), 800);
    return () => clearTimeout(timer);
  }, [completed]);

  if (!me) return null;
  const paused = Boolean(room.pausedAt);
  const canEdit =
    (viewingId || player.id) === player.id &&
    me.status !== "spectating" &&
    me.status !== "lost" &&
    me.status !== "winner" &&
    room.winnerId !== player.id &&
    !paused &&
    room.status !== "countdown" &&
    !(room.status === "ended" && me.status !== "continue");

  return (
    <div className="mx-auto grid max-w-[min(92vw,660px)] grid-cols-9 gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <button
          key={n}
          aria-label={`Digit ${n}, ${counts[n]} of 9 placed`}
          className={[
            "number-btn",
            completed[n - 1] ? "number-done" : "",
            flash === n ? "number-flash" : "",
          ].join(" ")}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => pushMove(n)}
          disabled={!canEdit || completed[n - 1]}
        >
          <span className="text-lg font-semibold leading-none">{n}</span>
          <span className="text-[10px] font-medium opacity-80">{counts[n]}/9</span>
        </button>
      ))}
    </div>
  );
});

function PlayersPanel() {
  const room = useGame((s) => s.room);
  const viewingId = useGame((s) => s.viewingId);
  const setViewingId = useGame((s) => s.setViewingId);
  const [, setPresenceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setPresenceTick((v) => v + 1), 2500);
    return () => clearInterval(interval);
  }, []);
  const players = Object.values(room.players).filter((p) => p.status !== "left");
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users size={18} className="text-[var(--accent)]" />
        <h3 className="font-semibold">Live Progress</h3>
      </div>
      <div className="space-y-3">
        {players.map((p) => {
          const online = isPlayerOnline(p);
          return (
            <button
              key={p.id}
              className={`w-full rounded-md border p-3 text-left transition ${viewingId === p.id ? "border-[var(--accent)] bg-[var(--soft)]" : "border-[var(--line)] bg-transparent"}`}
              onClick={() => setViewingId(p.id)}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium">
                  {p.id === room.winnerId ? <Crown size={16} className="text-[var(--gold)]" /> : <Eye size={16} className="text-[var(--muted)]" />}
                  {p.name}
                </span>
                <span className="flex items-center gap-2">
                  {online ? <Wifi size={16} className="text-[var(--good)]" /> : <WifiOff size={16} className="text-[var(--muted)]" />}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--soft)]">
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${p.progress}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-[var(--muted)]">
                <span>{p.progress}% complete</span>
                <span className={p.status === "lost" || p.mistakes >= 3 ? "text-[var(--danger)]" : ""}>
                  {Math.min(p.mistakes, 3)}/3 mistakes | {statusLabel(p)}
                </span>
              </div>
              {typeof p.finishedMs === "number" && (
                <div className="mt-1 text-xs font-medium text-[var(--accent)]">
                  Finish Time: {formatTime(p.finishedMs)}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EndDialog() {
  const room = useGame((s) => s.room);
  const player = useGame((s) => s.player);
  const continueMode = useGame((s) => s.continueMode);
  const spectateAfterLoss = useGame((s) => s.spectateAfterLoss);
  const toggleRematchVote = useGame((s) => s.toggleRematchVote);
  const me = room.players[player.id];
  const winner = room.winnerId ? room.players[room.winnerId] : null;
  const rematchRequests = room.rematchRequests || {};
  const rematchVoterIds = Object.values(room.players).filter((p) => isPlayerOnline(p)).map((p) => p.id);
  const rematchVotes = rematchVoterIds.filter((id) => rematchRequests[id]).length;
  const votedRematch = Boolean(rematchRequests[player.id]);
  const lostByMistakes = me.status === "lost" && !me.lossPromptDismissed;
  const matchEnded = room.status === "ended";
  const show = (matchEnded && me.status !== "continue" && me.status !== "spectating") || lostByMistakes;
  const offerSpectate = lostByMistakes && !matchEnded;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-dialog-title"
        >
          <motion.div
            className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 text-center shadow-2xl"
            initial={{ scale: 0.94, y: 18 }}
            animate={{ scale: 1, y: 0 }}
          >
            <Crown className="mx-auto mb-3 text-[var(--gold)]" size={42} />
            <h2 id="end-dialog-title" className="text-2xl font-semibold tracking-normal">
              {me.status === "winner" ? "You won" : offerSpectate ? "You lost the match" : "Match over"}
            </h2>
            <p className="mt-2 text-[var(--muted)]">
              {offerSpectate
                ? "You reached 3 mistakes. You can keep solving for yourself or spectate an opponent."
                : winner
                  ? `${winner.name} finished first.`
                  : "You can continue solving for yourself or vote for a rematch."}
            </p>
            {offerSpectate ? (
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button className="btn-primary w-full" onClick={continueMode}>
                  <Play size={18} /> Continue
                </button>
                <button className="btn-secondary w-full" onClick={spectateAfterLoss}>
                  <Eye size={18} /> Spectate
                </button>
              </div>
            ) : (
              <div className="mt-5 grid gap-2">
                <button className="btn-primary w-full" onClick={continueMode}>
                  <Play size={18} /> Continue Mode
                </button>
                <button className={votedRematch ? "btn-primary w-full" : "btn-secondary w-full"} onClick={toggleRematchVote}>
                  <RotateCcw size={18} /> Rematch {rematchVotes}/{rematchVoterIds.length}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ContinueSolvedDialog() {
  const room = useGame((s) => s.room);
  const player = useGame((s) => s.player);
  const publish = useGame((s) => s.publish);
  const me = room.players[player.id];
  const show = Boolean(room.status === "ended" && me.status === "continue" && me.personalSolvedAt && !me.personalSolvedDismissed);
  if (!show) return null;
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="continue-dialog-title"
      >
        <motion.div
          className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 text-center shadow-2xl"
          initial={{ scale: 0.92, y: 14 }}
          animate={{ scale: 1, y: 0 }}
        >
          <Check className="mx-auto mb-3 text-[var(--good)]" size={42} />
          <h2 id="continue-dialog-title" className="text-2xl font-semibold tracking-normal">Board completed</h2>
          <p className="mt-2 text-[var(--muted)]">
            You solved your board in continue mode at {formatTime(me.personalSolvedAt)}.
          </p>
          <button
            className="btn-primary mt-5 w-full"
            onClick={() =>
              publish({
                ...room,
                players: {
                  ...room.players,
                  [player.id]: { ...me, personalSolvedDismissed: true, lastSeen: now() },
                },
              })
            }
          >
            Nice
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function CountdownOverlay() {
  const room = useGame((s) => s.room);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (room.status !== "countdown") return undefined;
    const timer = setInterval(() => setTick((v) => v + 1), 100);
    return () => clearInterval(timer);
  }, [room.status]);
  if (room.status !== "countdown") return null;
  const leftMs = Math.max(0, (room.countdownEndsAt || 0) - now());
  const count = Math.max(1, Math.ceil(leftMs / 1000));
  void tick;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 backdrop-blur-sm">
      <motion.div
        className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-8 py-6 text-center shadow-2xl"
        key={count}
        initial={{ scale: 0.76, opacity: 0.45 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <p className="text-sm text-[var(--muted)]">Game starts in</p>
        <p className="mt-2 text-5xl font-semibold leading-none">{count}</p>
      </motion.div>
    </div>
  );
}

function DailyCompletionOverlay() {
  const mode = useGame((s) => s.mode);
  const dailyDateKey = useGame((s) => s.dailyDateKey);
  const dailyProgress = useGame((s) => s.dailyProgress);
  const [show, setShow] = useState(false);
  const shownRef = React.useRef("");
  const progress = dailyProgress[dailyDateKey] || {};
  useEffect(() => {
    if (mode !== "daily" || progress.status !== "solved" || !dailyDateKey) return;
    const celebrationKey = `${dailyDateKey}:${progress.solvedAt || "solved"}`;
    if (shownRef.current === celebrationKey) return;
    shownRef.current = celebrationKey;
    setShow(true);
    const timer = setTimeout(() => setShow(false), 3600);
    return () => clearTimeout(timer);
  }, [mode, progress.status, progress.solvedAt, dailyDateKey]);
  if (!show) return null;
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[90] overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="absolute inset-0 bg-[var(--veil)]" initial={{ opacity: 0 }} animate={{ opacity: 0.9 }} />
        {Array.from({ length: 28 }).map((_, i) => (
          <motion.span
            key={i}
            className="absolute block h-2 w-2 rounded-full bg-[var(--gold)]"
            initial={{ x: "50vw", y: "42vh", opacity: 0 }}
            animate={{
              x: `calc(50vw + ${Math.cos((i / 28) * Math.PI * 2) * (190 + (i % 5) * 34)}px)`,
              y: `calc(42vh + ${Math.sin((i / 28) * Math.PI * 2) * (160 + (i % 6) * 28)}px)`,
              opacity: [0, 1, 0],
              scale: [0.7, 1.5, 0.8],
            }}
            transition={{ duration: 2.1, ease: "easeOut", delay: 0.08 + (i % 6) * 0.03 }}
          />
        ))}
        <div className="absolute inset-0 grid place-items-center px-4">
          <motion.div className="pointer-events-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 text-center shadow-2xl" initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1.08, rotate: 0 }} transition={{ type: "spring", stiffness: 220, damping: 12 }}>
            <Crown size={96} className="mx-auto text-[var(--gold)] drop-shadow-[0_0_28px_rgba(202,138,4,0.55)]" />
            <p className="mt-3 text-3xl font-semibold">Board Completed</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Daily challenge solved for {dailyDateKey}</p>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function WinnerChampionOverlay() {
  const room = useGame((s) => s.room);
  const player = useGame((s) => s.player);
  const me = room.players[player.id];
  const [show, setShow] = useState(false);
  const [closedManually, setClosedManually] = useState(false);
  const shownWinRef = React.useRef("");
  useEffect(() => {
    if (room?.winnerId !== player.id) return;
    const celebrationKey = `${room.code}:${room.winnerId}:${room.seed || "seed"}`;
    if (shownWinRef.current === celebrationKey) return;
    shownWinRef.current = celebrationKey;
    setClosedManually(false);
    setShow(true);
    const timer = setTimeout(() => setShow(false), 3600);
    return () => clearTimeout(timer);
  }, [room?.code, room?.winnerId, room?.seed, player.id]);
  if (!show || closedManually) return null;
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[90] overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="absolute inset-0 bg-[var(--veil)]" initial={{ opacity: 0 }} animate={{ opacity: 0.9 }} />
        {Array.from({ length: 24 }).map((_, i) => (
          <motion.span
            key={i}
            className="absolute block h-2 w-2 rounded-full bg-[var(--gold)]"
            initial={{ x: "50vw", y: "42vh", opacity: 0 }}
            animate={{
              x: `calc(50vw + ${Math.cos((i / 24) * Math.PI * 2) * (180 + (i % 4) * 36)}px)`,
              y: `calc(42vh + ${Math.sin((i / 24) * Math.PI * 2) * (150 + (i % 5) * 32)}px)`,
              opacity: [0, 1, 0],
              scale: [0.7, 1.4, 0.8],
            }}
            transition={{ duration: 1.9, ease: "easeOut", delay: 0.08 + (i % 6) * 0.03 }}
          />
        ))}
        <div className="absolute inset-0 grid place-items-center">
          <motion.div className="relative pointer-events-auto" initial={{ scale: 0.55, rotate: -10 }} animate={{ scale: 1.12, rotate: 0 }} transition={{ type: "spring", stiffness: 240, damping: 12 }}>
            <button
              className="pointer-events-auto absolute right-4 top-4 grid size-9 place-items-center rounded-md border border-[var(--line)] bg-[var(--panel)]"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setClosedManually(true);
                setShow(false);
              }}
              title="Close"
            >
              <X size={16} />
            </button>
            <Crown size={108} className="mx-auto text-[var(--gold)] drop-shadow-[0_0_28px_rgba(202,138,4,0.55)]" />
            <motion.p className="mt-3 text-center text-4xl font-semibold text-[var(--text)]" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
              Winner
            </motion.p>
            <motion.p className="mt-1 text-center text-sm text-[var(--muted)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
              {me?.name || "Winner"} solved first
            </motion.p>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function SnackbarStack() {
  const snacks = useGame((s) => s.snacks);
  const removeSnack = useGame((s) => s.removeSnack);
  if (!snacks || !snacks.length) return null;
  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-xl -translate-x-1/2 flex-col gap-2 px-4"
    >
      <AnimatePresence>
        {snacks.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            className="pointer-events-auto flex items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm shadow-lg"
          >
            <span>{item.text}</span>
            <button
              className="grid size-7 place-items-center rounded-md border border-[var(--line)] bg-[var(--soft)]"
              onClick={() => removeSnack(item.id)}
              title="Close notification"
              aria-label="Close notification"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default App;
