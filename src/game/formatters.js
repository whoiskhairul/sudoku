import { now } from "./store.js";

export function elapsed(room, player = null) {
  if (!room?.startedAt) return 0;
  if (player) {
    if (Number.isFinite(player.finishedMs)) return Math.max(0, player.finishedMs);
    if (Number.isFinite(player.personalSolvedAt)) return Math.max(0, player.personalSolvedAt);
    if (player.status === "winner" && room.winnerId === player.id) {
      const winnerFinish = room.players?.[player.id]?.finishedMs;
      if (Number.isFinite(winnerFinish)) return Math.max(0, winnerFinish);
    }
  }
  if (room.status === "ended" && (!player || player.status !== "continue")) {
    if (room.winnerId && room.players?.[room.winnerId] && Number.isFinite(room.players[room.winnerId].finishedMs)) {
      return Math.max(0, room.players[room.winnerId].finishedMs);
    }
    const end = room.endedAt || room.pausedAt || now();
    return Math.max(0, end - room.startedAt - (room.totalPausedMs || 0));
  }
  const end = room.pausedAt || now();
  return Math.max(0, end - room.startedAt - (room.totalPausedMs || 0));
}

export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function statusLabel(player) {
  if (player.status === "lost") return "lost the game";
  if (player.status === "continue" && player.mistakes >= 3) return "lost | continue mode";
  if (player.status === "spectating") return "spectating";
  return player.status;
}

// Number of cells that are both filled and match the solution. Wrong entries
// never count as progress, so the toolbar cannot reward guessing.
export function correctCells(board, solution) {
  if (!Array.isArray(board) || !Array.isArray(solution) || board.length !== 81) return 0;
  let total = 0;
  for (let i = 0; i < 81; i += 1) {
    if (board[i] && board[i] === solution[i]) total += 1;
  }
  return total;
}

export function boardProgress(board, solution) {
  return Math.round((correctCells(board, solution) / 81) * 100);
}

const ordinal = (n) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
};

/**
 * Compares a player against the players still in the match.
 * Returns a short label for the sticky status bar, e.g. "2nd · 4 behind".
 */
export function matchStanding(room, playerId) {
  if (!room?.players || !playerId) return { label: "Solo", rank: 1, total: 1, gap: 0 };
  const contenders = Object.values(room.players).filter(
    (p) => p.status !== "lost" && p.status !== "spectating",
  );
  const me = contenders.find((p) => p.id === playerId);
  if (!me) return null;
  if (contenders.length <= 1) return { label: "Solo", rank: 1, total: 1, gap: 0 };

  const scored = contenders
    .map((p) => ({
      id: p.id,
      status: p.status,
      cells: p.status === "winner" ? 81 : correctCells(p.board, room.solution),
    }))
    .sort((a, b) => b.cells - a.cells);

  const mine = scored.find((p) => p.id === playerId);
  const rank = scored.indexOf(mine) + 1;
  const leader = scored[0];
  const gap = Math.max(0, leader.cells - mine.cells);

  if (me.status === "winner") return { label: "Winner", rank, total: scored.length, gap: 0 };
  if (rank === 1) {
    return {
      label: gap === 0 ? "Tied for 1st" : `Leading by ${gap}`,
      rank,
      total: scored.length,
      gap,
    };
  }
  return { label: `${ordinal(rank)} · ${gap} behind`, rank, total: scored.length, gap };
}
