import { now } from "./store";

export function elapsed(room) {
  if (!room.startedAt) return 0;
  const end = room.pausedAt || now();
  return Math.max(0, end - room.startedAt - room.totalPausedMs);
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
