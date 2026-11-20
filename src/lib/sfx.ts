// Sound effects for the city game, made with the Web Audio API (no sound files). They're soft and musical, in the same key
// as the background music (C major pentatonic): a wooden tap for buttons, a marimba "pling" for building, a gentle "poof"
// for demolishing and a little music-box chime for big moments (land, milestones, the first building). On by default; the
// player can switch them off in Settings (remembered on this device).

export type Sfx = "click" | "build" | "demolish" | "fanfare";

const KEY = "lifecity.sfx";
const VOLUME = 0.7; // overall level (each sound is already quiet)
let ctx: AudioContext | null = null;
let out: GainNode | null = null;

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

/** Output: master volume → a soft low-pass → speakers, plus a short room echo so sounds don't feel dry. */
function output(): { c: AudioContext; dest: AudioNode } | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = VOLUME;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 5000;
    const echo = ctx.createDelay(0.5);
    echo.delayTime.value = 0.13;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    out.connect(tone);
    tone.connect(ctx.destination);
    tone.connect(echo);
    echo.connect(feedback);
    feedback.connect(echo);
    echo.connect(wet);
    wet.connect(ctx.destination);
  }
  void ctx.resume().catch(() => {});
  return { c: ctx, dest: out! };
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** A plucked, wooden/marimba-like note: a sine with a quieter overtone four times higher that dies away faster. */
function mallet(c: AudioContext, dest: AudioNode, freq: number, at: number, peak: number, length = 0.5) {
  for (const [mult, amp, len] of [[1, 1, length], [4, 0.25, length * 0.25]] as const) {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak * amp, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(g);
    g.connect(dest);
    osc.start(at);
    osc.stop(at + len + 0.02);
  }
}

/** A bell-like note (music box): a sine with inharmonic partials and a long, gentle fade. */
function bell(c: AudioContext, dest: AudioNode, freq: number, at: number, peak: number) {
  for (const [mult, amp, len] of [[1, 1, 1.2], [2.76, 0.3, 0.5], [5.4, 0.12, 0.25]] as const) {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak * amp, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(g);
    g.connect(dest);
    osc.start(at);
    osc.stop(at + len + 0.02);
  }
}

/** A soft breath of filtered noise that swells and fades (a "poof"). */
function poof(c: AudioContext, dest: AudioNode, at: number, peak: number) {
  const length = 0.45;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(900, at);
  filter.frequency.exponentialRampToValueAtTime(250, at + length);
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(at);
}

/** Play a sound effect (does nothing when switched off, or before the page has had a tap). */
export function playSfx(kind: Sfx, delay = 0) {
  if (!sfxEnabled()) return;
  const o = output();
  if (!o) return;
  const { c, dest } = o;
  const t = c.currentTime + 0.01 + delay;
  if (kind === "click") {
    // A small wooden tap.
    mallet(c, dest, midi(79), t, 0.05, 0.09); // G5
  } else if (kind === "build") {
    // Marimba "pling": two quick rising notes.
    mallet(c, dest, midi(72), t, 0.12); // C5
    mallet(c, dest, midi(79), t + 0.08, 0.12, 0.7); // G5
  } else if (kind === "demolish") {
    // A soft poof with a low falling note under it.
    poof(c, dest, t, 0.12);
    mallet(c, dest, midi(55), t, 0.08, 0.35); // G3
    mallet(c, dest, midi(48), t + 0.09, 0.07, 0.45); // C3
  } else {
    // Music-box chime: C E G C rising.
    [72, 76, 79, 84].forEach((n, i) => bell(c, dest, midi(n), t + i * 0.11, 0.07));
  }
}
