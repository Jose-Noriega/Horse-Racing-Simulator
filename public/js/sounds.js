// Sound effects. Port of sounds.py.
//
// Hoof hits are real recordings (Kenney Impact Sounds, CC0, in assets/sounds).
// Everything else is synthesized: beeps, gunshot, boom.
//
// Two halves. The synth + room functions are honest: numbers in, a
// Float32Array out. Sounds is the dishonest edge. It owns the AudioContext and
// does nothing if audio isn't there, so the game still runs on a silent machine.
//
// Mix rules, same as the pygame version:
//   - every sound is normalized, then set by one number in settings.MIX
//   - reverb is short and gentle, not a long tail on every hit
//   - the gun ducks the hooves, then they swell back in
//   - hooves vary hit to hit (5 recordings, random jitter) so they don't machine-gun
//   - a soft limiter (tanh) instead of hard clipping
//
// Browsers only start audio after a user gesture. Call sounds.unlock() from a
// click or keydown. Until it finishes, play() does nothing.

import { MIX, MIX_DB } from "./settings.js";

const dbToGain = (db) => 10 ** (db / 20);

const RATE = 22050; // everything is made at 22.05k. the browser resamples on playback
const MAX_VOICES = 96; // every hoof is its own sound. ~50 overlap at full gallop
const NUM_HIT_VARIANTS = 5;
const SOUND_DIR = "assets/sounds/";

// --- synth (honest) ---------------------------------------------------------

const n = (dur) => Math.trunc(dur * RATE);

// Seeded rng so the gunshot sounds the same every run. mulberry32.
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

// Linear fade at both ends, in place. A sound that stops while it's still loud
// ends in a click. Several of ours did (a 0.18 s beep is still at 24% when it
// stops), and that was part of what made them jarring.
export function fadeEdges(x, inSecs = 0.003, outSecs = 0.015) {
  const a = Math.min(x.length, n(inSecs));
  const b = Math.min(x.length, n(outSecs));
  for (let i = 0; i < a; i++) x[i] *= i / a;
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= i / b;
  return x;
}

export function tone(freq, dur, vol = 0.5, decay = 6) {
  const out = new Float32Array(n(dur));
  for (let i = 0; i < out.length; i++) {
    out[i] = vol * Math.sin((2 * Math.PI * freq * i) / RATE) * Math.exp((-decay * i) / RATE);
  }
  return fadeEdges(out);
}

// White noise through a one-pole low-pass. Smaller lp = darker.
function noiseSamples(count, lp, rng) {
  const out = new Float32Array(count);
  let y = 0;
  for (let i = 0; i < count; i++) {
    y += lp * (rng() * 2 - 1 - y);
    out[i] = y;
  }
  return out;
}
export const noise = (dur, lp, rng) => noiseSamples(n(dur), lp, rng);

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

export function peak(x) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m;
}

export function normalize(x) {
  const p = peak(x);
  return p ? x.map((v) => v / p) : x;
}

const scale = (x, k) => x.map((v) => v * k);

export const click = () => tone(1000, 0.05, 1, 60);
export const tick = () => tone(1800, 0.04, 1, 70);
export const coin = () => concat(tone(1318, 0.07, 1, 20), tone(1760, 0.3, 1, 9));
export const beep = () => tone(440, 0.18, 1, 8);
export const ding = () => mix(tone(1046, 0.4, 1, 8), tone(1568, 0.4, 0.5, 10));
export const fanfare = () =>
  concat(...[523, 659, 784].map((f) => tone(f, 0.16, 1, 5)), mix(tone(1046, 0.7, 1, 3), tone(784, 0.7, 0.6, 3)));

// Starter's pistol: a short crack over a low thump. The room makes it a bang off the stands.
export function gunshot() {
  const crack = noise(0.3, 0.5, seededRng(11)); // darker than white so it isn't harsh
  return crack.map(
    (c, i) =>
      c * 2.8 * Math.exp((-60 * i) / RATE) + 0.8 * Math.sin((2 * Math.PI * 140 * i) / RATE) * Math.exp((-30 * i) / RATE),
  );
}

export function boom() {
  const rumble = noise(1.3, 0.09, seededRng(3));
  const out = new Float32Array(rumble.length);
  let phase = 0;
  for (let i = 0; i < rumble.length; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * (30 + 50 * Math.exp(-5 * t))) / RATE; // thump sweeps down
    out[i] = 3 * rumble[i] * Math.exp(-3.5 * t) + 0.7 * Math.sin(phase) * Math.exp(-4 * t);
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

// --- room: one echo + a soft diffuse tail ------------------------------------

// Delay + reverb for something impulsive.
// Hack: real reverb is a convolution. For a short hit it's close to a burst
// of dark noise that decays, scaled by how loud the hit was. That's what this
// makes. Cheap, and it can't ring metallic like comb filters do.
// One echo tap gives the slapback off the stands.
export function room(x, wet, tail, seed = 1, echo = 0.17, echoGain = 0.22) {
  const total = x.length + n(echo) + n(tail);
  const out = new Float32Array(total);
  for (let i = 0; i < x.length; i++) {
    out[i] += x[i];
    out[i + n(echo)] += x[i] * echoGain;
  }
  const hum = noiseSamples(total, 0.15, seededRng(seed));
  const predelay = n(0.012);
  const level = wet * peak(x) * 3;
  for (let i = predelay; i < total; i++) {
    const t = (i - predelay) / RATE;
    const attack = Math.min(1, t / 0.015); // no click where the tail starts
    out[i] += hum[i] * level * attack * Math.exp((-6.9 * t) / tail); // -60 dB at `tail`
  }
  return out;
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

// --- mixer (dishonest) ------------------------------------------------------

// Fetch + decode an ogg to mono floats at RATE. null if it isn't there or won't decode
// (Safari ogg support varies).
async function loadMono(ctx, name) {
  try {
    const res = await fetch(SOUND_DIR + name);
    if (!res.ok) return null;
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / buf.numberOfChannels;
    }
    return resample(mono, buf.sampleRate / RATE);
  } catch {
    return null;
  }
}

export class Sounds {
  constructor(numHorses = 8) {
    this.numHorses = numHorses;
    this.on = false;
    this.muted = false;
    this.ctx = null;
    this.buffers = {}; // name -> { buffer, volume }
    this.steps = []; // [lane][variant] -> AudioBuffer
    this.active = new Set(); // playing sources, so mute can stop them
    this.duckAt = -1e9;
    this.starting = null;
  }

  // Call from a click / keydown. Safe to call every time.
  unlock() {
    if (this.starting) return this.starting;
    this.starting = this.init().catch((e) => console.warn("audio off:", e));
    return this.starting;
  }

  async init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const m = MIX;

    // Everything goes through one bus: master level, then a limiter, so a pile-up
    // of hooves + gun + cheers can't clip or spike.
    this.bus = this.ctx.createGain();
    this.bus.gain.value = m.master;
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6; // dB
    this.limiter.knee.value = 3;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.bus.connect(this.limiter).connect(this.ctx.destination);

    // name -> [samples, room [wet, tail] or null]. Level comes from MIX_DB.
    const table = {
      click: [click(), null],
      tick: [tick(), null],
      coin: [coin(), null],
      beep: [beep(), null],
      ding: [ding(), null],
      fanfare: [fanfare(), null],
      gunshot: [gunshot(), [m.wet * 1.5, 1.1]],
      boom: [boom(), [m.wet * 1.3, 1.4]],
    };
    for (const [name, [samples, space]] of Object.entries(table)) {
      this.buffers[name] = { buffer: this.make(normalize(space ? room(samples, ...space) : samples), MIX_DB[name]), volume: 1 };
    }
    await this.buildSteps();
    this.on = true;
  }

  // 5 hit variants, each pitched per lane. Room is added once per variant, then pitch-shifted.
  async buildSteps() {
    const bases = [];
    for (let k = 0; k < NUM_HIT_VARIANTS; k++) {
      const id = String(k).padStart(3, "0");
      const [soft, wood] = await Promise.all([
        loadMono(this.ctx, `impactSoft_medium_${id}.ogg`),
        loadMono(this.ctx, `impactWood_light_${id}.ogg`),
      ]);
      let hit;
      if (!soft) hit = synthHit();
      else {
        // soft thud for weight, a little wood on top for the clop
        hit = mix(normalize(soft), wood ? scale(normalize(wood).slice(0, n(0.15)), 0.3) : new Float32Array(1));
      }
      bases.push(room(normalize(hit), MIX.wet, MIX.tail_secs, k));
    }
    for (let lane = 0; lane < this.numHorses; lane++) {
      const ratio = 0.75 + (0.35 * lane) / Math.max(1, this.numHorses - 1); // low lane = low thud
      this.steps.push(bases.map((b) => this.make(normalize(resample(b, ratio)), MIX_DB.step)));
    }
  }

  // Normalized samples -> AudioBuffer whose peak is peakDb (dBFS).
  make(samples, peakDb) {
    const buf = this.ctx.createBuffer(1, samples.length, RATE);
    const gain = dbToGain(peakDb);
    const out = buf.getChannelData(0);
    for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
    return buf;
  }

  // 1.0 normally. Right after a gunshot or boom it drops, then eases back.
  duckGain() {
    const t = (performance.now() / 1000 - this.duckAt) / MIX.duck_secs;
    if (t >= 1) return 1;
    const smooth = t * t * (3 - 2 * t);
    return MIX.duck + (1 - MIX.duck) * smooth;
  }

  voice(buffer, volume, pan = 0) {
    if (this.active.size >= MAX_VOICES) return; // dropped if every voice is busy
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      gain.connect(p).connect(this.bus);
    } else {
      gain.connect(this.bus);
    }
    this.active.add(src);
    src.onended = () => this.active.delete(src);
    src.start();
  }

  play(name, volume = 1) {
    if (!this.on || this.muted) return;
    if (name === "gunshot" || name === "boom") this.duckAt = performance.now() / 1000;
    this.voice(this.buffers[name].buffer, volume);
  }

  // One hoof hit. pan is -1 (left) to 1 (right).
  playStep(lane, volume, pan) {
    if (!this.on || this.muted) return;
    pan = Math.max(-1, Math.min(1, pan)) * MIX.pan_width;
    const vol = volume * this.duckGain() * (0.85 + 0.15 * Math.random());
    const variants = this.steps[lane % this.steps.length];
    this.voice(variants[Math.floor(Math.random() * variants.length)], vol, pan);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) for (const s of this.active) s.stop();
    return this.muted;
  }
}
