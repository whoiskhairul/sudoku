import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
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
  getPauseVoterIds,
  isPlayerOnline,
  mergeRoomPresence,
  now,
  pendingGets,
  readJSON,
  themes,
  useGame,
  writeRoom,
} from "./game/store";
import { elapsed, formatTime, statusLabel } from "./game/formatters";

function App() {
  const room = useGame((s) => s.room);
  const theme = useGame((s) => s.theme);
  const player = useGame((s) => s.player);
  const publish = useGame((s) => s.publish);
  const joinRoom = useGame((s) => s.joinRoom);
  const leaveRoom = useGame((s) => s.leaveRoom);
  const setTheme = useGame((s) => s.setTheme);
  const ws = useGame((s) => s.ws);
  const [activeSnack, setActiveSnack] = useState(null);
  const prevRoomRef = React.useRef(null);
  const [urlJoinPending, setUrlJoinPending] = useState(() => Boolean(new URLSearchParams(location.search).get("room")));
  const addSnack = useCallback((text) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setActiveSnack({ id, text });
  }, []);

  useEffect(() => {
    if (!activeSnack) return undefined;
    const timer = setTimeout(() => setActiveSnack(null), 2600);
    return () => clearTimeout(timer);
  }, [activeSnack?.id]);

  useEffect(() => {
    const channel = new BroadcastChannel("sudoku-versus");
    useGame.setState({ channel });
    channel.onmessage = (event) => {
      const current = useGame.getState().room;
      if (!current || event.data.code !== current.code) return;
      if ((event.data.updatedAt || 0) >= (current.updatedAt || 0)) {
        useGame.setState({ room: mergeRoomPresence(current, event.data) });
      }
    };
    const onLocal = (event) => {
      const current = useGame.getState().room;
      if (current?.code === event.detail.code && event.detail.updatedAt >= (current.updatedAt || 0)) {
        useGame.setState({ room: mergeRoomPresence(current, event.detail) });
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
          if (msg?.type === "room") {
            if (msg.code) {
              const pending = pendingGets.get(msg.code.toUpperCase());
              if (pending) {
                pending.resolve(msg.room || null);
                pendingGets.delete(msg.code.toUpperCase());
              }
            }
            if (msg.room) {
              writeRoom(msg.room);
              window.dispatchEvent(new CustomEvent("sv-room-local", { detail: msg.room }));
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
    const code = new URLSearchParams(location.search).get("room");
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
    joinRoom(targetCode, { historyMode: "replace" }).then((ok) => {
      if (cancelled) return;
      const currentCode = new URLSearchParams(location.search).get("room");
      if (!currentCode || currentCode.toUpperCase() !== targetCode) {
        setUrlJoinPending(false);
        return;
      }
      if (ok || ws?.readyState === WebSocket.OPEN) {
        setUrlJoinPending(false);
        return;
      }
      failTimer = setTimeout(() => {
        if (!cancelled) setUrlJoinPending(false);
      }, 2200);
    });
    return () => {
      cancelled = true;
      if (failTimer) clearTimeout(failTimer);
    };
  }, [joinRoom, room?.code, ws]);

  useEffect(() => {
    const onPopState = () => {
      const code = new URLSearchParams(location.search).get("room");
      const currentCode = useGame.getState().room?.code || null;
      if (code) {
        const nextCode = code.toUpperCase();
        if (currentCode !== nextCode) {
          setUrlJoinPending(true);
          useGame.getState().joinRoom(nextCode, { historyMode: "replace" }).finally(() => {
            setUrlJoinPending(false);
          });
        }
        return;
      }
      setUrlJoinPending(false);
      if (currentCode) useGame.getState().leaveRoom({ historyMode: "replace" });
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
      publish({
        ...current,
        players: {
          ...current.players,
          [player.id]: { ...current.players[player.id], connected: true, lastSeen: now() },
        },
      });
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
      if (!useGame.getState().room) return;
      if (event.key.startsWith("Arrow")) {
        const state = useGame.getState();
        const room = state.room;
        const player = state.player;
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
        if (event.key === "ArrowUp") next = Math.max(0, (row - 1) * 9 + col);
        if (event.key === "ArrowDown") next = Math.min(80, (row + 1) * 9 + col);
        if (event.key === "ArrowLeft") next = Math.max(0, row * 9 + (col - 1));
        if (event.key === "ArrowRight") next = Math.min(80, row * 9 + (col + 1));
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
        event.preventDefault();
        useGame.setState({ inputMode: useGame.getState().inputMode === "value" ? "note" : "value" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const cleanup = setInterval(() => {
      const ts = now();
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("sv-room-"));
      keys.forEach((key) => {
        const room = readJSON(key, null);
        if (!room?.players) return;
        const players = Object.values(room.players);
        if (players.length === 0) {
          localStorage.removeItem(key);
          return;
        }
        const everyoneOffline = players.every((p) => !isPlayerOnline(p, ts));
        if (!everyoneOffline) return;
        const latestSeen = Math.max(...players.map((p) => p?.lastSeen || 0));
        if (ts - latestSeen >= EMPTY_ROOM_TTL_MS) localStorage.removeItem(key);
      });
    }, 15000);
    return () => clearInterval(cleanup);
  }, []);

  return (
    <main className={`${themes[theme]} min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors`}>
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <Header onHome={leaveRoom} />
        {room ? <Room /> : urlJoinPending ? <RoomLoading room={{ code: new URLSearchParams(location.search).get("room")?.toUpperCase() || "..." }} /> : <Home />}
        <SnackbarStack item={activeSnack} onClose={() => setActiveSnack(null)} />
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
      <button className="flex items-center gap-3 text-left" onClick={onHome} title="Go home">
        <div className="grid size-11 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accentText)] shadow-glow">
          <Sparkles size={21} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-normal">Sudoku Versus</h1>
          <p className="text-sm text-[var(--muted)]">Real-time competitive Sudoku</p>
        </div>
      </button>
      <div className="flex items-center gap-2">
        <select
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
  return (
    <button
      className="grid size-10 place-items-center rounded-md border border-[var(--line)] bg-[var(--panel)] text-[var(--muted)]"
      onClick={onToggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
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
  const [difficulty, setDifficulty] = useState("Medium");
  const [code, setCode] = useState("");
  const [missing, setMissing] = useState(false);

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
                setMissing(false);
                setCode(event.target.value.toUpperCase());
              }}
              placeholder="ABC123"
            />
            <button
              className="btn-secondary w-full"
              onClick={async () => {
                const ok = await joinRoom(code);
                setMissing(!ok);
              }}
            >
              <LogOut size={18} /> Join Room
            </button>
            {missing && <p className="mt-2 text-sm text-[var(--danger)]">Room code not found on this device.</p>}
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
              <span className="text-[var(--muted)]">{stats.bestTimes[difficulty] ? formatTime(stats.bestTimes[difficulty]) : "..."}</span>
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
            <div
              key={`${mistakes}-${idx}`}
              title={`Match ${idx + 1}: ${mistakes} mistakes`}
              className={mistakes >= 3 ? "w-full rounded-sm bg-[var(--danger)] opacity-90" : "w-full rounded-sm bg-[var(--accent)] opacity-85"}
              style={{ height: `${Math.max(10, mistakes * 14)}px` }}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Bar height = mistakes in each recent match. Red bars indicate 3 or more mistakes.
        </p>
      </div>
    </aside>
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
  const [nameDraft, setNameDraft] = useState(player.name || "");
  const me = room.players?.[player.id];
  const activePlayers = Object.values(room.players || {}).filter((p) => p.status === "active");
  const isLobby = room.status === "lobby";

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
    const repaired = {
      ...room,
      players: {
        ...room.players,
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
          board: [...room.puzzle],
          notes: blankNotes(),
          lastSeen: now(),
        },
      },
    };
    publish(repaired);
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
            <Board />
            <NumberPad />
            <GameTopbar />
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
            <button className="icon-btn" onClick={leaveRoom} title="Leave room">
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
          {Object.values(room.players).map((p) => (
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

function GameTopbar() {
  const room = useGame((s) => s.room);
  const player = useGame((s) => s.player);
  const inputMode = useGame((s) => s.inputMode);
  const setInputMode = useGame((s) => s.setInputMode);
  const togglePause = useGame((s) => s.togglePause);
  const undo = useGame((s) => s.undo);
  const erase = useGame((s) => s.erase);
  const useHint = useGame((s) => s.useHint);
  const toggleRematchVote = useGame((s) => s.toggleRematchVote);
  const [, setTick] = useState(0);
  const me = room.players[player.id];
  const isPaused = Boolean(room.pausedAt);
  const voteMap = isPaused ? (room.resumeRequests || {}) : (room.pauseRequests || {});
  const rematchRequests = room.rematchRequests || {};
  const rematchVoterIds = Object.values(room.players).filter((p) => isPlayerOnline(p)).map((p) => p.id);
  const rematchVotes = rematchVoterIds.filter((id) => rematchRequests[id]).length;
  const votedRematch = Boolean(rematchRequests[player.id]);
  const voted = Boolean(voteMap[player.id]);
  const voteBaseIds = isPaused
    ? ((room.pausedByIds && room.pausedByIds.length > 0)
      ? room.pausedByIds
      : getPauseVoterIds(room))
    : getPauseVoterIds(room);
  const voteCount = voteBaseIds.filter((id) => Boolean(voteMap[id])).length;
  useEffect(() => {
    const interval = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
      <div>
        <p className="text-sm text-[var(--muted)]">Timer</p>
        <p className="text-2xl font-semibold tabular-nums">{formatTime(elapsed(room))}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="icon-btn" onClick={undo} title="Undo">
          <RotateCcw size={18} />
        </button>
        <button className="icon-btn" onClick={erase} title="Erase">
          <Trash2 size={18} />
        </button>
        <button
          className={inputMode === "note" ? "btn-primary" : "btn-secondary"}
          onClick={() => setInputMode(inputMode === "value" ? "note" : "value")}
        >
          <Pencil size={17} /> {inputMode === "note" ? "Notes" : "Values"}
        </button>
        <button className="btn-secondary" onClick={useHint} title="Hint">
          <Lightbulb size={17} /> Hint {Math.max(0, 2 - (me.hintsUsed || 0))}
        </button>
        <button className={voted ? "btn-primary" : "btn-secondary"} onClick={togglePause}>
          {isPaused ? <Play size={17} /> : <Pause size={17} />} {isPaused ? "Resume" : "Pause"} {voteCount}
        </button>
        <button className={votedRematch ? "btn-primary" : "btn-secondary"} onClick={toggleRematchVote}>
          <RotateCcw size={17} /> Rematch {rematchVotes}/{rematchVoterIds.length}
        </button>
      </div>
      <div className="text-right">
        <p className="text-sm text-[var(--muted)]">Mistakes</p>
        <p className="text-2xl font-semibold text-[var(--danger)]">{Math.min(me.mistakes, 3)}/3</p>
      </div>
    </div>
  );
}

function Board() {
  const room = useGame((s) => s.room);
  const player = useGame((s) => s.player);
  const selected = useGame((s) => s.selected);
  const setSelected = useGame((s) => s.setSelected);
  const viewingId = useGame((s) => s.viewingId) || player.id;
  const viewed = room.players[viewingId] || room.players[player.id];
  const me = room.players[player.id];
  const selectedValue = selected === null ? null : viewed.board[selected];
  const paused = Boolean(room.pausedAt);
  const canEdit = viewed.id === player.id && me.status !== "spectating" && me.status !== "lost";

  return (
    <div className="relative mx-auto max-w-[min(92vw,660px)]">
      <div className={`sudoku-grid ${paused ? "blur-md" : ""}`}>
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
          return (
            <button
              key={idx}
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
          </div>
        </div>
      )}
    </div>
  );
}

function NumberPad() {
  const room = useGame((s) => s.room);
  const player = useGame((s) => s.player);
  const pushMove = useGame((s) => s.pushMove);
  const me = room?.players?.[player.id];
  const board = me?.board || [];
  const counts = Array.from({ length: 10 }, (_, n) => board.reduce((total, value) => total + (value === n ? 1 : 0), 0));
  const [flash, setFlash] = useState(null);
  const prevCounts = React.useRef(counts);

  useEffect(() => {
    const newlyCompleted = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((n) => prevCounts.current[n] < 9 && counts[n] >= 9);
    if (newlyCompleted) {
      setFlash(newlyCompleted);
      const timer = setTimeout(() => setFlash(null), 800);
      prevCounts.current = counts;
      return () => clearTimeout(timer);
    }
    prevCounts.current = counts;
    return undefined;
  }, [counts]);

  return (
    <div className="mx-auto grid max-w-[min(92vw,660px)] grid-cols-9 gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <button
          key={n}
          className={[
            "number-btn",
            counts[n] >= 9 ? "number-done" : "",
            flash === n ? "number-flash" : "",
          ].join(" ")}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => pushMove(n)}
          disabled={counts[n] >= 9}
        >
          <span className="text-lg font-semibold leading-none">{n}</span>
          <span className="text-[10px] font-medium opacity-80">{counts[n]}/9</span>
        </button>
      ))}
    </div>
  );
}

function PlayersPanel() {
  const room = useGame((s) => s.room);
  const viewingId = useGame((s) => s.viewingId);
  const setViewingId = useGame((s) => s.setViewingId);
  const players = Object.values(room.players);
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
                  {p.status === "winner" ? <Crown size={16} className="text-[var(--gold)]" /> : <Eye size={16} className="text-[var(--muted)]" />}
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
  const show = room.status === "ended" && me.status !== "continue";
  const lostByMistakes = me.status === "lost" && !me.lossPromptDismissed;

  return (
    <AnimatePresence>
      {(show || lostByMistakes) && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 text-center shadow-2xl"
            initial={{ scale: 0.94, y: 18 }}
            animate={{ scale: 1, y: 0 }}
          >
            <Crown className="mx-auto mb-3 text-[var(--gold)]" size={42} />
            <h2 className="text-2xl font-semibold tracking-normal">
              {me.status === "winner" ? "You won" : lostByMistakes ? "You lost the match" : "Match over"}
            </h2>
            <p className="mt-2 text-[var(--muted)]">
              {lostByMistakes
                ? "You reached 3 mistakes. You can keep solving for yourself or spectate an opponent."
                : winner
                  ? `${winner.name} finished first.`
                  : "You can spectate the remaining active players."}
            </p>
            {lostByMistakes ? (
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
      >
        <motion.div
          className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 text-center shadow-2xl"
          initial={{ scale: 0.92, y: 14 }}
          animate={{ scale: 1, y: 0 }}
        >
          <Check className="mx-auto mb-3 text-[var(--good)]" size={42} />
          <h2 className="text-2xl font-semibold tracking-normal">Board completed</h2>
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

function WinnerChampionOverlay() {
  const room = useGame((s) => s.room);
  const player = useGame((s) => s.player);
  const me = room.players[player.id];
  const [show, setShow] = useState(false);
  const [closedManually, setClosedManually] = useState(false);
  const shownWinRef = React.useRef("");
  useEffect(() => {
    if (room?.winnerId !== player.id) return;
    if (shownWinRef.current === `${room.code}:${room.winnerId}`) return;
    shownWinRef.current = `${room.code}:${room.winnerId}`;
    setClosedManually(false);
    setShow(true);
    const timer = setTimeout(() => setShow(false), 3600);
    return () => clearTimeout(timer);
  }, [room?.code, room?.winnerId, player.id]);
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

function SnackbarStack({ item, onClose }) {
  if (!item) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-xl -translate-x-1/2 flex-col gap-2 px-4">
      <AnimatePresence>
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
            onClick={onClose}
            title="Close notification"
          >
            <X size={14} />
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default App;
