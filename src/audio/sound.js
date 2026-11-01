let audioCtx = null;
let isMuted = false;

try {
  if (typeof localStorage !== "undefined") {
    isMuted = localStorage.getItem("sv-muted") === "1";
  }
} catch (e) {}

export const isAudioMuted = () => isMuted;

export const setAudioMuted = (muted) => {
  isMuted = Boolean(muted);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("sv-muted", isMuted ? "1" : "0");
    }
  } catch (e) {}
};

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

if (typeof window !== "undefined") {
  const unlock = () => {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true, passive: true });
}

export function playSound(frequency, duration = 100, type = "sine") {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = type;
    const startTime = ctx.currentTime;
    gain.gain.setValueAtTime(0.3, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration / 1000);
    osc.start(startTime);
    osc.stop(startTime + duration / 1000);
  } catch (e) {}
}

export function vibrate(pattern) {
  if (isMuted) return;
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch (e) {}
}

