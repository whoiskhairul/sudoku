import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalDateKey,
  createPlayer,
  getPauseVoterIds,
  isFutureDateKey,
  mergeRoomPresence,
  normalizeRoom,
  normalizeStats,
  parseDateKey,
  pendingGets,
  resolvePendingGet,
  toDateKey,
  useGame,
} from "./store.js";
import { elapsed } from "./formatters.js";
import { generateSudoku } from "./sudoku.js";

const makeRoom = (code = "ABC123", overrides = {}) => {
  const { puzzle, solution } = generateSudoku("Easy", 20261031);
  return {
    code,
    difficulty: "Easy",
    ownerId: "p1",
    puzzle,
    solution,
    status: "playing",
    createdAt: 1,
    updatedAt: 1,
    players: {},
    ...overrides,
  };
};

const player = (id, overrides = {}) => ({
  id,
  name: id,
  ready: true,
  connected: true,
  status: "active",
  mistakes: 0,
  progress: 0,
  hintsUsed: 0,
  finishedMs: null,
  personalSolvedAt: null,
  personalSolvedDismissed: false,
  lossPromptDismissed: false,
  lastSeen: 1,
  board: [],
  notes: [],
  ...overrides,
});

test("normalizeStats repairs legacy/malformed stats", () => {
  const stats = normalizeStats({ played: "3", wins: 2, bestTimes: { Easy: "1200", Hard: "oops" } });
  assert.equal(stats.played, 3);
  assert.equal(stats.wins, 2);
  assert.equal(stats.losses, 0);
  assert.deepEqual(stats.bestTimes, { Easy: 1200 });
  assert.deepEqual(normalizeStats(null), {
    played: 0,
    wins: 0,
    losses: 0,
    mistakeHistory: [],
    bestTimes: {},
  });
});

test("normalizeRoom rejects unrepairable rooms", () => {
  assert.equal(normalizeRoom(null), null);
  assert.equal(normalizeRoom({ ...makeRoom(), code: "bad code!" }), null);
  assert.equal(normalizeRoom({ ...makeRoom(), puzzle: [1, 2, 3] }), null);
  const badSolution = new Array(81).fill(0);
  assert.equal(normalizeRoom({ ...makeRoom(), solution: badSolution }), null);
});

test("normalizeRoom fills player defaults without throwing", () => {
  const room = normalizeRoom({
    ...makeRoom(),
    players: { p1: { id: "p1", name: "  ", board: [1, 2], notes: null } },
  });
  assert.ok(room);
  assert.equal(room.players.p1.name, "Player");
  assert.equal(room.players.p1.board.length, 81);
  assert.equal(room.players.p1.notes.length, 81);
  assert.equal(room.players.p1.status, "active");
});

test("mergeRoomPresence keeps the earliest finisher as the only winner", () => {
  const base = makeRoom();
  const current = {
    ...base,
    winnerId: "slow",
    players: {
      slow: player("slow", { status: "winner", finishedMs: 900, lastSeen: 5 }),
      fast: player("fast", { status: "winner", finishedMs: 400, lastSeen: 4 }),
    },
  };
  const incoming = {
    ...base,
    updatedAt: 2,
    winnerId: "fast",
    players: {
      slow: player("slow", { status: "winner", finishedMs: 900, lastSeen: 6 }),
      fast: player("fast", { status: "winner", finishedMs: 400, lastSeen: 5 }),
    },
  };
  const merged = mergeRoomPresence(current, incoming);
  assert.equal(merged.winnerId, "fast");
  assert.equal(merged.players.fast.status, "winner");
  assert.equal(merged.players.slow.status, "continue");
});

test("mergeRoomPresence clears the winner when a new round starts", () => {
  const base = makeRoom();
  const current = {
    ...base,
    status: "ended",
    winnerId: "p1",
    players: { p1: player("p1", { status: "winner", finishedMs: 500 }) },
  };
  const rematch = {
    ...base,
    status: "countdown",
    startedAt: null,
    countdownEndsAt: 123,
    winnerId: null,
    seed: 999,
    updatedAt: 2,
    players: { p1: player("p1", { status: "active", lastSeen: 2 }) },
  };
  const merged = mergeRoomPresence(current, rematch);
  assert.equal(merged.winnerId, null);
  assert.equal(merged.players.p1.status, "active");
});

test("mergeRoomPresence does not let a stale playing snapshot erase a winner", () => {
  const base = makeRoom();
  const current = {
    ...base,
    status: "ended",
    winnerId: "p1",
    players: { p1: player("p1", { status: "winner", finishedMs: 500 }) },
  };
  const stale = {
    ...base,
    status: "playing",
    startedAt: 10,
    winnerId: null,
    updatedAt: 1,
    players: { p1: player("p1", { status: "active", lastSeen: 1 }) },
  };
  const merged = mergeRoomPresence(current, stale);
  assert.equal(merged.winnerId, "p1");
});

test("mergeRoomPresence does not let a stale lobby snapshot erase a winner", () => {
  const base = { ...makeRoom(), seed: 12345 };
  const current = {
    ...base,
    status: "ended",
    winnerId: "p1",
    players: { p1: player("p1", { status: "winner", finishedMs: 500 }) },
  };
  const stale = {
    ...base,
    status: "lobby",
    startedAt: null,
    winnerId: null,
    updatedAt: 2,
    players: { p1: player("p1", { status: "active", lastSeen: 2 }) },
  };
  const merged = mergeRoomPresence(current, stale);
  assert.equal(merged.winnerId, "p1");
});

test("mergeRoomPresence keeps a winner who moved to continue mode", () => {
  const base = makeRoom();
  const current = {
    ...base,
    winnerId: "p1",
    players: { p1: player("p1", { status: "continue", finishedMs: 500 }) },
  };
  const incoming = {
    ...base,
    updatedAt: 2,
    winnerId: "p1",
    players: { p1: player("p1", { status: "continue", finishedMs: 500, lastSeen: 2 }) },
  };
  const merged = mergeRoomPresence(current, incoming);
  assert.equal(merged.winnerId, "p1");
  assert.equal(merged.players.p1.status, "continue");
});

test("mergeRoomPresence rejects room-level state from older rev (#15, #21)", () => {
  const base = makeRoom();
  const current = {
    ...base,
    status: "playing",
    rev: 5,
    startedAt: 100,
    players: { p1: player("p1", { lastSeen: 10 }) },
  };
  const stale = {
    ...base,
    status: "lobby",
    rev: 2,
    startedAt: null,
    players: { p1: player("p1", { lastSeen: 12 }) },
  };
  const merged = mergeRoomPresence(current, stale);
  assert.equal(merged.status, "playing");
  assert.equal(merged.startedAt, 100);
  assert.equal(merged.rev, 5);
  assert.equal(merged.players.p1.lastSeen, 12);
});

test("mergeRoomPresence unions kickedIds and drops kicked players (#21)", () => {
  const base = makeRoom();
  const current = {
    ...base,
    kickedIds: { badGuy: 1 },
    players: { p1: player("p1") },
  };
  const incoming = {
    ...base,
    kickedIds: { troll: 2 },
    players: { p1: player("p1"), badGuy: player("badGuy"), troll: player("troll") },
  };
  const merged = mergeRoomPresence(current, incoming);
  assert.deepEqual(merged.kickedIds, { badGuy: 1, troll: 2 });
  assert.equal(merged.players.badGuy, undefined);
  assert.equal(merged.players.troll, undefined);
  assert.ok(merged.players.p1);
});

test("mergeRoomPresence transfers ownerId when owner leaves (#28)", () => {
  const base = makeRoom();
  const current = {
    ...base,
    ownerId: "p1",
    players: {
      p1: player("p1", { status: "left", lastSeen: 10 }),
      p2: player("p2", { status: "active", lastSeen: Date.now() }),
    },
  };
  const incoming = {
    ...current,
    updatedAt: 2,
  };
  const merged = mergeRoomPresence(current, incoming);
  assert.equal(merged.ownerId, "p2");
});

test("getPauseVoterIds ignores left and spectating players (#22)", () => {
  const ts = Date.now();
  const room = {
    ...makeRoom(),
    players: {
      active1: player("active1", { lastSeen: ts }),
      spectator: player("spectator", { status: "spectating", lastSeen: ts }),
      leftPlayer: player("leftPlayer", { status: "left", lastSeen: ts }),
      offlinePlayer: player("offlinePlayer", { lastSeen: ts - 30000 }),
    },
  };
  const voters = getPauseVoterIds(room, ts);
  assert.deepEqual(voters, ["active1"]);
});

test("resolvePendingGet resolves by reqId and by code (#26)", () => {
  let reqResolved = null;
  pendingGets.set("req-1", { code: "ABC123", resolve: (val) => { reqResolved = val; } });
  assert.ok(resolvePendingGet("req-1", "ABC123", { code: "ABC123" }));
  assert.deepEqual(reqResolved, { code: "ABC123" });
  assert.equal(pendingGets.has("req-1"), false);

  let codeResolved = null;
  pendingGets.set("req-2", { code: "DEF456", resolve: (val) => { codeResolved = val; } });
  assert.ok(resolvePendingGet(null, "DEF456", { code: "DEF456" }));
  assert.deepEqual(codeResolved, { code: "DEF456" });
  assert.equal(pendingGets.has("req-2"), false);
});

test("parseDateKey and canonicalDateKey reject rollovers and normalize keys (#31)", () => {
  // Invalid / rollover dates must fail
  assert.equal(parseDateKey("31-02-2026"), null); // Feb 31 does not exist
  assert.equal(parseDateKey("31-04-2026"), null); // April has 30 days
  assert.equal(parseDateKey("not-a-date"), null);
  assert.equal(parseDateKey("2026-02-31"), null);

  // Valid dates parse correctly
  const d1 = parseDateKey("01-02-2026");
  assert.ok(d1);
  assert.equal(d1.getFullYear(), 2026);
  assert.equal(d1.getMonth(), 1); // Feb
  assert.equal(d1.getDate(), 1);

  // canonicalDateKey maps both DD-MM-YYYY and YYYY-MM-DD to DD-MM-YYYY
  assert.equal(canonicalDateKey("01-02-2026"), "01-02-2026");
  assert.equal(canonicalDateKey("2026-02-01"), "01-02-2026");
  assert.equal(canonicalDateKey("31-02-2026"), toDateKey(new Date())); // falls back to today if unparseable
});

test("elapsed freezes for finished players and respects match end (#41)", () => {
  const startedAt = 10000;
  const totalPausedMs = 500;
  const room = {
    startedAt,
    totalPausedMs,
    pausedAt: null,
    status: "playing",
    players: {
      p1: { id: "p1", status: "active", finishedMs: null, personalSolvedAt: null },
      p2: { id: "p2", status: "winner", finishedMs: 45000, personalSolvedAt: 45000 },
      p3: { id: "p3", status: "continue", finishedMs: null, personalSolvedAt: 60000 },
    },
  };

  // Winner has frozen finish time
  assert.equal(elapsed(room, room.players.p2), 45000);

  // Player with personalSolvedAt has frozen solve time
  assert.equal(elapsed(room, room.players.p3), 60000);

  // Ended room freezes for non-continuing players
  const endedRoom = {
    ...room,
    status: "ended",
    winnerId: "p2",
    players: {
      ...room.players,
      p1: { id: "p1", status: "active", finishedMs: null, personalSolvedAt: null },
    },
  };
  assert.equal(elapsed(endedRoom, endedRoom.players.p1), 45000);
});

test("createPlayer produces standardized player objects (#48)", () => {
  const puzzle = new Array(81).fill(0);
  const p = createPlayer({ id: "p-custom", name: "Alice", puzzle });
  assert.equal(p.id, "p-custom");
  assert.equal(p.name, "Alice");
  assert.equal(p.ready, false);
  assert.equal(p.connected, true);
  assert.equal(p.status, "active");
  assert.equal(p.lossPromptDismissed, false);
  assert.equal(p.personalSolvedDismissed, false);
  assert.equal(p.hintsUsed, 0);
  assert.equal(p.board.length, 81);
  assert.equal(p.notes.length, 81);
});

test("getDailyBoard caches generated boards per date key (#53)", () => {
  const store = useGame.getState();
  const dateKey = "15-08-2026";
  const board1 = store.getDailyBoard(dateKey);
  const board2 = store.getDailyBoard(dateKey);
  // Same reference from cache
  assert.equal(board1, board2);
  assert.equal(board1.dateKey, dateKey);
});

