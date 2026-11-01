import assert from "node:assert/strict";
import test from "node:test";
import { mergeRooms } from "../../roomRelay.js";

const makeRoom = (code = "XYZ789", overrides = {}) => ({
  code,
  difficulty: "Medium",
  ownerId: "p1",
  status: "playing",
  rev: 1,
  roomToken: "token-secret-123",
  puzzle: new Array(81).fill(0),
  solution: new Array(81).fill(1),
  players: {},
  ...overrides,
});

test("relay mergeRooms increments monotonic rev (#15, #21)", () => {
  const existing = makeRoom("XYZ789", { rev: 3 });
  const incoming = makeRoom("XYZ789", { rev: 3, players: { p1: { id: "p1", lastSeen: 10 } } });
  const merged = mergeRooms(existing, incoming);
  assert.equal(merged.rev, 4);
  assert.equal(merged.roomToken, "token-secret-123");
  assert.ok(merged.players.p1);
});

test("relay mergeRooms rejects stale base from older rev (#21)", () => {
  const existing = makeRoom("XYZ789", { rev: 5, status: "playing", startedAt: 500 });
  const stale = makeRoom("XYZ789", { rev: 2, status: "lobby", startedAt: null });
  const merged = mergeRooms(existing, stale);
  assert.equal(merged.status, "playing");
  assert.equal(merged.startedAt, 500);
  assert.equal(merged.rev, 6);
});

test("relay mergeRooms unions kickedIds server-side (#21)", () => {
  const existing = makeRoom("XYZ789", { kickedIds: { cheater: 100 } });
  const incoming = makeRoom("XYZ789", {
    kickedIds: { spammer: 200 },
    players: { cheater: { id: "cheater" }, spammer: { id: "spammer" }, valid: { id: "valid" } },
  });
  const merged = mergeRooms(existing, incoming);
  assert.deepEqual(merged.kickedIds, { cheater: 100, spammer: 200 });
  assert.equal(merged.players.cheater, undefined);
  assert.equal(merged.players.spammer, undefined);
  assert.ok(merged.players.valid);
});

test("relay mergeRooms preserves winner when non-winner publishes (#21)", () => {
  const existing = makeRoom("XYZ789", {
    status: "ended",
    winnerId: "p1",
    players: { p1: { id: "p1", status: "winner", finishedMs: 1200 } },
  });
  const incoming = makeRoom("XYZ789", {
    status: "playing",
    winnerId: null,
    players: { p2: { id: "p2", status: "active", progress: 50 } },
  });
  const merged = mergeRooms(existing, incoming);
  assert.equal(merged.status, "ended");
  assert.equal(merged.winnerId, "p1");
});

