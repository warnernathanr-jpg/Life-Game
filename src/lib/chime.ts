// A short chime made with the Web Audio API (no sound file). Browsers, iPhones especially, only allow
// sound after the user has tapped something, so call unlockAudio() from a tap (e.g. the Start button).

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Call from a tap: lets the page play the chime later without another tap. */
export function unlockAudio() {
  const c = context();
  if (!c) return;
  void c.resume().catch(() => {});
  // A silent blip completes the unlock on iOS.
  const buffer = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(c.destination);
  src.start(0);
}

/** True once sound can play without a tap. */
export function audioUnlocked(): boolean {
  return ctx?.state === "running";
}

/** Three rising bell-like notes, played twice. */
export function playChime() {
  const c = context();
  if (!c) return;
  void c.resume().catch(() => {});
  const notes = [880, 1108.73, 1318.51]; // A5, C#6, E6
  const start = c.currentTime + 0.05;
  for (let round = 0; round < 2; round++) {
    notes.forEach((freq, i) => {
      const t = start + round * 1.1 + i * 0.18;
      for (const [mult, level] of [[1, 0.28], [2, 0.06]] as const) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = "sine";
        osc.frequency.value = freq * mult;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(level, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + 1);
      }
    });
  }
}
