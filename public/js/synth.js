// Sound synthesis. Honest code: numbers in, a Float32Array out. No audio context.
// sounds.js plays what this makes.
//
// The target is an early-internet Flash game. Square and triangle waves, quick
// pitch slides, a little bit-crush. Short and punchy, never shrill.
//
// Chips are made at 22.05k on purpose. Naive square waves alias a little at that
// rate, which is the crunch we want. A one-pole low-pass takes the sting off.

export const RATE = 22050;

const n = (secs) => Math.trunc(secs * RATE);

// Seeded rng so the noisy sounds are the same every run. mulberry32.
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- small tools ------------------------------------------------------------

// Linear fade at both ends, in place. A sound that stops while it's still loud
// ends in a click.
export function fadeEdges(x, inSecs = 0.003, outSecs = 0.015) {
  const a = Math.min(x.length, n(inSecs));
  const b = Math.min(x.length, n(outSecs));
  for (let i = 0; i < a; i++) x[i] *= i / a;
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= i / b;
  return x;
}

export function peak(x) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m;
}

export function normalize(x) {
  const p = peak(x);
  return p ? x.map((v) => v / p) : x;
}

export const scale = (x, k) => x.map((v) => v * k);

export function mix(...parts) {
  const out = new Float32Array(Math.max(...parts.map((p) => p.length)));
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
}

export function concat(...parts) {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export const silence = (secs) => new Float32Array(n(secs));

// One-pole low-pass. a near 0 = dark, 1 = no change.
export function lowpass(x, a) {
  const out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    out[i] = y;
  }
  return out;
}

// Bit-crush: hold every `hold` samples (rate reduction) and, if bits > 0, round to
// 2^bits levels. This is the lo-fi grit.
export function crush(x, hold = 2, bits = 0) {
  const out = new Float32Array(x.length);
  const levels = bits > 0 ? 2 ** (bits - 1) : 0;
  let held = 0;
  for (let i = 0; i < x.length; i++) {
    if (i % hold === 0) held = levels ? Math.round(x[i] * levels) / levels : x[i];
    out[i] = held;
  }
  return out;
}

// Shape the loudness over time. fn gets 0..1 along the sound and returns a gain.
export function envelope(x, fn) {
  return x.map((v, i) => v * fn(i / Math.max(1, x.length - 1)));
}

// ratio > 1 = higher and shorter. Linear interpolation.
export function resample(x, ratio) {
  const out = new Float32Array(Math.max(0, Math.trunc(x.length / ratio) - 1));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const j = Math.trunc(pos);
    const f = pos - j;
    out[i] = x[j] * (1 - f) + x[j + 1] * f;
  }
  return out;
}

// --- sources ----------------------------------------------------------------

// phase is 0..1 around the cycle
function wave(shape, phase, duty) {
  switch (shape) {
    case "square":
      return phase < duty ? 1 : -1;
    case "tri":
      return 1 - 4 * Math.abs(phase - 0.5);
    case "saw":
      return 2 * phase - 1;
    default:
      return Math.sin(2 * Math.PI * phase);
  }
}

// One chip note. f0 slides to f1 over the note. decay is the exp rate per second.
// vib = [hz, depth in hz] wobbles the pitch.
export function chip({ shape = "square", f0, f1 = f0, dur, decay = 6, duty = 0.5, vol = 1, vib = null }) {
  const out = new Float32Array(n(dur));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    let f = f0 + ((f1 - f0) * i) / out.length;
    if (vib) f += vib[1] * Math.sin(2 * Math.PI * vib[0] * t);
    phase = (phase + f / RATE) % 1;
    out[i] = vol * wave(shape, phase, duty) * Math.exp(-decay * t);
  }
  // square and saw have lots of top end. Soften them. Sine and triangle are fine.
  const soft = shape === "square" || shape === "saw" ? lowpass(out, 0.55) : out;
  return fadeEdges(soft);
}

// Notes one after another. Each note is the same options as chip with its own f0.
export const arp = (freqs, dur, opts = {}) => concat(...freqs.map((f0) => chip({ ...opts, f0, dur })));

// White noise through a one-pole low-pass. Smaller lp = darker.
export function noise(dur, lp, rng) {
  const out = new Float32Array(n(dur));
  let y = 0;
  for (let i = 0; i < out.length; i++) {
    y += lp * (rng() * 2 - 1 - y);
    out[i] = y;
  }
  return out;
}

// A short noise burst that dies fast. Clicks, shutters, the start of a clank.
const puff = (dur, lp, decay, seed) =>
  fadeEdges(noise(dur, lp, seededRng(seed)).map((v, i) => v * Math.exp((-decay * i) / RATE)), 0.001, 0.004);

// --- room: one echo + a soft diffuse tail ------------------------------------

// Delay + reverb for something impulsive.
// Hack: real reverb is a convolution. For a short hit it's close to a burst
// of dark noise that decays, scaled by how loud the hit was. Cheap, and it
// can't ring metallic like comb filters do. One echo tap gives the slapback off the stands.
export function room(x, wet, tail, seed = 1, echo = 0.17, echoGain = 0.22) {
  const total = x.length + n(echo) + n(tail);
  const out = new Float32Array(total);
  for (let i = 0; i < x.length; i++) {
    out[i] += x[i];
    out[i + n(echo)] += x[i] * echoGain;
  }
  const hum = noise(total / RATE, 0.15, seededRng(seed));
  const predelay = n(0.012);
  const level = wet * peak(x) * 3;
  for (let i = predelay; i < Math.min(total, hum.length); i++) {
    const t = (i - predelay) / RATE;
    const attack = Math.min(1, t / 0.015); // no click where the tail starts
    out[i] += hum[i] * level * attack * Math.exp((-6.9 * t) / tail); // -60 dB at `tail`
  }
  return fadeEdges(out, 0, 0.02);
}

// --- loudness ----------------------------------------------------------------

// Loudest 100 ms stretch, as RMS in dBFS. Peak alone lies: a square wave and a
// thud with the same peak sound very different. About 100 ms is how long the ear
// adds up energy, so this is a better "how loud is it" number.
export function shortTermDb(x) {
  const win = Math.min(x.length, n(0.1));
  const step = Math.max(1, n(0.01));
  let best = 0;
  let sum = 0;
  for (let i = 0; i < win; i++) sum += x[i] * x[i];
  best = sum;
  for (let i = step; i + win <= x.length; i += step) {
    sum = 0;
    for (let k = i; k < i + win; k++) sum += x[k] * x[k];
    best = Math.max(best, sum);
  }
  return 10 * Math.log10(Math.max(best / win, 1e-12));
}

export const peakDb = (x) => 20 * Math.log10(Math.max(peak(x), 1e-6));

// Scale a sound so its loudest 100 ms sits at targetDb. Then hold the peak under
// ceilingDb, so a short crack (loud peak, little energy) isn't pushed into the limiter.
export function setLoudness(x, targetDb, ceilingDb = -3) {
  const p = peak(x);
  if (!p) return x;
  const toTarget = 10 ** ((targetDb - shortTermDb(x)) / 20);
  const toCeiling = 10 ** (ceilingDb / 20) / p;
  return scale(x, Math.min(toTarget, toCeiling));
}

// --- the sounds ---------------------------------------------------------------

// Starter's pistol: a short crack over a low thump, crushed for grit.
// The room makes it a bang off the stands.
function gunshot() {
  const crack = noise(0.3, 0.5, seededRng(11)); // darker than white so it isn't harsh
  const raw = crack.map(
    (c, i) =>
      c * 2.8 * Math.exp((-60 * i) / RATE) + 0.8 * Math.sin((2 * Math.PI * 140 * i) / RATE) * Math.exp((-30 * i) / RATE),
  );
  return fadeEdges(crush(raw, 2));
}

function boom() {
  const rumble = noise(1.3, 0.09, seededRng(3));
  const out = new Float32Array(rumble.length);
  let phase = 0;
  for (let i = 0; i < rumble.length; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * (30 + 50 * Math.exp(-5 * t))) / RATE; // thump sweeps down
    out[i] = 3 * rumble[i] * Math.exp(-3.5 * t) + 0.7 * Math.sin(phase) * Math.exp(-4 * t);
  }
  return fadeEdges(crush(out, 3));
}

// Bits of wreckage landing after a boom. Sparse little pitch-dropping pops.
function debris() {
  const rng = seededRng(5);
  const out = new Float32Array(n(0.8));
  for (let k = 0; k < 22; k++) {
    const at = n(rng() * 0.6);
    const f0 = 500 + rng() * 700;
    // many soft pops beat a few loud ones, so the peak stays near the body
    const pop = chip({ shape: "tri", f0, f1: f0 * 0.4, dur: 0.04, decay: 50, vol: 0.5 * Math.exp(-3 * (at / out.length)) });
    for (let i = 0; i < pop.length && at + i < out.length; i++) out[at + i] += pop[i];
  }
  return out;
}

// Stand-in hoof thud if the recordings are missing or won't decode.
export function synthHit() {
  const a = noise(0.12, 0.12, seededRng(7));
  return a.map(
    (v, i) => v * 3 * Math.exp((-45 * i) / RATE) + 0.5 * Math.sin((2 * Math.PI * 85 * i) / RATE) * Math.exp((-35 * i) / RATE),
  );
}

// A crowd "ahh". Dark noise that swells and fades.
const cheer = () => envelope(noise(0.7, 0.22, seededRng(21)), (t) => Math.sin(Math.PI * t) ** 1.5);

// Everything the game plays, by name. Raw samples, not leveled. [samples, room?].
// room is [wet scale, tail seconds]. wet scale multiplies the hoof wet level.
const RAW = {
  // UI
  click: [chip({ f0: 1500, f1: 800, dur: 0.035, decay: 45, duty: 0.25 })],
  tick: [chip({ shape: "tri", f0: 1300, dur: 0.03, decay: 60 })],
  pick: [chip({ shape: "tri", f0: 700, dur: 0.06, decay: 30 })], // game.js raises the pitch per parlay leg
  undo: [chip({ f0: 700, f1: 350, dur: 0.09, decay: 14 })],
  clear: [arp([880, 660, 440], 0.045, { shape: "tri", decay: 12 })],
  error: [crush(concat(chip({ f0: 160, dur: 0.08, decay: 6 }), silence(0.03), chip({ f0: 130, dur: 0.14, decay: 6 })), 2)],
  mute: [arp([880, 1320], 0.05, { shape: "tri", decay: 20 })],
  swish: [envelope(noise(0.22, 0.25, seededRng(31)), (t) => Math.sin(Math.PI * t) ** 2)],
  // money
  coin: [concat(chip({ f0: 988, dur: 0.06, decay: 6 }), chip({ f0: 1319, dur: 0.32, decay: 9 }))],
  register: [
    mix(
      scale(puff(0.03, 0.6, 120, 41), 0.5),
      concat(silence(0.04), chip({ f0: 2093, dur: 0.07, decay: 6 }), chip({ f0: 2637, dur: 0.4, decay: 7 })),
    ),
  ],
  // race
  gate: [
    mix(
      scale(puff(0.04, 0.5, 100, 51), 0.3),
      chip({ shape: "sine", f0: 410, dur: 0.2, decay: 22, vol: 0.5 }),
      chip({ shape: "sine", f0: 683, dur: 0.2, decay: 28, vol: 0.35 }),
      chip({ shape: "sine", f0: 1130, dur: 0.14, decay: 35, vol: 0.2 }),
    ),
  ],
  beep: [chip({ shape: "tri", f0: 523, dur: 0.12, decay: 8 })],
  beepLast: [mix(chip({ f0: 784, dur: 0.22, decay: 6 }), chip({ shape: "tri", f0: 1568, dur: 0.22, decay: 10, vol: 0.4 }))],
  gunshot: [gunshot(), [1.5, 1.1]],
  cheer: [cheer()],
  ding: [mix(chip({ shape: "tri", f0: 1046, dur: 0.3, decay: 9 }), chip({ shape: "sine", f0: 2092, dur: 0.3, decay: 14, vol: 0.25 }))],
  fanfare: [
    concat(
      arp([523, 659, 784, 1046], 0.08, { decay: 4 }),
      mix(
        chip({ f0: 1046, dur: 0.5, decay: 4, vol: 0.6 }),
        chip({ shape: "tri", f0: 784, dur: 0.5, decay: 4 }),
        chip({ shape: "tri", f0: 523, dur: 0.5, decay: 4, vol: 0.8 }),
      ),
    ),
  ],
  photo: [concat(scale(puff(0.02, 0.7, 150, 61), 0.35), silence(0.05), scale(puff(0.02, 0.7, 150, 62), 0.35), chip({ shape: "tri", f0: 2000, dur: 0.04, decay: 40, vol: 0.5 }))],
  sad: [
    concat(
      arp([311, 294, 277], 0.2, { shape: "tri", decay: 3 }),
      chip({ shape: "tri", f0: 262, f1: 196, dur: 0.6, decay: 2, vib: [7, 6] }),
    ),
  ],
  // secret mode
  boom: [boom(), [1.3, 1.4]],
  debris: [debris()],
};

// name -> finished samples (room added), still at whatever level they came out.
// wet is the hoof wet level from settings.
export function library(wet) {
  const out = {};
  for (const [name, [samples, space]] of Object.entries(RAW)) {
    out[name] = space ? room(normalize(samples), wet * space[0], space[1]) : samples;
  }
  return out;
}
