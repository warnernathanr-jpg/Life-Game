// Small sound effects for the city game, made with the Web Audio API (no sound files): a soft click for buttons, a pop for
// building, a crunch for demolishing and a little rising chime for big moments (land, milestones). On by default; the
// player can switch them off in Settings (remembered on this device).

export type Sfx = "click" | "build" | "demolish" | "fanfare";

const KEY = "lifecity.sfx";
let ctx: AudioContext | null = null;

export function sfxEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSfxEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
}

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  void ctx.resume().catch(() => {});
  return ctx;
}

function tone(c: AudioContext, freq: number, at: number, length: number, peak: number, type: OscillatorType, glideTo?: number) {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + length);
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

function noise(c: AudioContext, at: number, length: number, peak: number, from: number, to: number) {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(to, at + length);
  const g = c.createGain();
  g.gain.setValueAtTime(peak, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(filter);
  filter.connect(g);
  g.connect(c.destination);
  src.start(at);
}

/** Play a sound effect (does nothing when switched off or before the page has had a tap). */
export function playSfx(kind: Sfx) {
  if (!sfxEnabled()) return;
  const c = context();
  if (!c) return;
  const t = c.currentTime + 0.01;
  if (kind === "click") {
    tone(c, 1400, t, 0.05, 0.05, "sine", 900);
  } else if (kind === "build") {
    tone(c, 523.25, t, 0.12, 0.12, "triangle"); // C5
    tone(c, 783.99, t + 0.07, 0.18, 0.1, "triangle"); // G5
    noise(c, t, 0.08, 0.05, 2000, 400);
  } else if (kind === "demolish") {
    noise(c, t, 0.35, 0.18, 1800, 120);
    tone(c, 140, t, 0.25, 0.12, "sine", 60);
  } else {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.08, 0.3, 0.09, "triangle"));
  }
}
