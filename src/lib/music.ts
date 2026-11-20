// Calm background music for the full-screen city, made with the Web Audio API (no music files): soft pad chords, a
// gentle bass and a light plucked melody on a major pentatonic scale, with a little echo for space. Each loop picks
// slightly different melody notes, so it never repeats exactly. Browsers only allow sound after a tap, so start() must
// be called from one (or after the page has had one).

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextBar = 0; // audio time of the next bar to schedule
let bar = 0;

const BAR = 3.2; // seconds per bar (4 beats at 75 bpm)
const BEAT = BAR / 4;
const VOLUME = 0.16;

// I – vi – IV – V in C major, then I – iii – IV – V (frequencies of the chord tones, octave 3–4).
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = [
  [48, 55, 60, 64], // C
  [45, 52, 57, 60], // Am
  [41, 48, 53, 57], // F
  [43, 50, 55, 59], // G
  [48, 55, 60, 64], // C
  [40, 47, 52, 55], // Em
  [41, 48, 53, 57], // F
  [43, 50, 55, 62], // G
];
const SCALE = [72, 74, 76, 79, 81, 84, 86, 88]; // C major pentatonic, octaves 5–6

function context(): Ctx | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Output chain: master volume → soft low-pass, plus a quiet echo. */
function buildChain(c: Ctx): GainNode {
  const out = c.createGain();
  out.gain.value = 0;
  const tone = c.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 3200;
  const delay = c.createDelay(1);
  delay.delayTime.value = BEAT * 0.75;
  const feedback = c.createGain();
  feedback.gain.value = 0.28;
  const wet = c.createGain();
  wet.gain.value = 0.25;
  out.connect(tone);
  tone.connect(c.destination);
  tone.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(c.destination);
  return out;
}

function note(c: Ctx, dest: AudioNode, freq: number, at: number, length: number, peak: number, type: OscillatorType, attack: number) {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(g);
  g.connect(dest);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

function scheduleBar(c: Ctx, dest: AudioNode, at: number, index: number) {
  const chord = CHORDS[index % CHORDS.length];
  // Pad: the chord's upper three tones, slow swell across the bar.
  for (const n of chord.slice(1)) note(c, dest, midi(n), at, BAR * 1.1, 0.07, "triangle", BAR * 0.4);
  // Bass: the root on beats 1 and 3.
  note(c, dest, midi(chord[0] - 12), at, BEAT * 1.8, 0.16, "sine", 0.02);
  note(c, dest, midi(chord[0] - 12), at + BEAT * 2, BEAT * 1.8, 0.12, "sine", 0.02);
  // Melody: a few plucked notes on eighth notes, leaning on chord tones.
  const chordPcs = new Set(chord.map((n) => n % 12));
  for (let step = 0; step < 8; step++) {
    if (Math.random() > (step % 2 === 0 ? 0.55 : 0.2)) continue;
    const pool = SCALE.filter((n) => (step % 4 === 0 ? chordPcs.has(n % 12) : true));
    const n = pool[Math.floor(Math.random() * pool.length)];
    note(c, dest, midi(n), at + step * (BEAT / 2), BEAT * 1.6, 0.06, "sine", 0.01);
  }
}

/** Start the music (fades in). Call from a tap the first time. */
export function startMusic() {
  const c = context();
  if (!c) return;
  void c.resume().catch(() => {});
  if (!master) master = buildChain(c);
  master.gain.cancelScheduledValues(c.currentTime);
  master.gain.setValueAtTime(master.gain.value, c.currentTime);
  master.gain.linearRampToValueAtTime(VOLUME, c.currentTime + 2);
  if (timer) return;
  nextBar = c.currentTime + 0.1;
  // Keep about one bar scheduled ahead.
  const tick = () => {
    if (!master) return;
    while (nextBar < c.currentTime + BAR) {
      scheduleBar(c, master, nextBar, bar++);
      nextBar += BAR;
    }
  };
  tick();
  timer = setInterval(tick, 500);
}

/** Stop the music (fades out). */
export function stopMusic() {
  const c = ctx;
  if (timer) clearInterval(timer);
  timer = null;
  if (!c || !master) return;
  master.gain.cancelScheduledValues(c.currentTime);
  master.gain.setValueAtTime(master.gain.value, c.currentTime);
  master.gain.linearRampToValueAtTime(0, c.currentTime + 0.8);
}

/** True while sound can play without a tap. */
export function musicAllowed(): boolean {
  return ctx?.state === "running";
}
