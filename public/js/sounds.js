// Sound playback. The sounds themselves are made in synth.js (honest code).
// This file is the dishonest edge. It owns the AudioContext and does nothing if
// audio isn't there, so the game still runs on a silent machine.
//
// Hoof hits are real recordings (Kenney Impact Sounds, CC0, in assets/sounds).
// Everything else is synthesized in an early-Flash-game style.
//
// Mix rules:
//   - every sound is leveled to one loudness number in settings.MIX_DB
//   - everything goes through one master bus and a limiter
//   - reverb is short and gentle, not a long tail on every hit
//   - the gun ducks the hooves, then they swell back in
//   - hooves vary hit to hit (5 recordings, random jitter) so they don't machine-gun
//
// Browsers only start audio after a user gesture. Call sounds.unlock() from a
// click or keydown. Until it finishes, play() does nothing.

import { MIX, MIX_DB } from "./settings.js";
import { RATE, library, mix, normalize, resample, room, scale, setLoudness, synthHit } from "./synth.js";

const MAX_VOICES = 96; // every hoof is its own sound. ~50 overlap at full gallop
const NUM_HIT_VARIANTS = 5;
const SOUND_DIR = "assets/sounds/";
// Real crowd recordings, see CREDITS.txt. 4.5 to 7.5 s each, cut from full cheers
// so each one swells up and dies away on its own.
const CHEERS_BIG = ["cheer_big1.mp3", "cheer_big2.mp3", "cheer_big3.mp3", "cheer_big4.mp3"];
const CHEERS_MED = ["cheer_med1.mp3", "cheer_med2.mp3", "cheer_med3.mp3", "cheer_med4.mp3", "cheer_med5.mp3"];

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
    this.buffers = {}; // name -> AudioBuffer
    this.cheers = { big: [], med: [] }; // recordings, see CHEERS_* above
    this.lastCheer = {}; // kind -> index of the one played last, so it isn't repeated
    this.bedBuffers = []; // the crowd loops under the race
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

    // Everything goes through one bus: master level, then a limiter, so a pile-up
    // of hooves + gun + cheers can't clip or spike.
    this.bus = this.ctx.createGain();
    this.bus.gain.value = MIX.master;
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6; // dB
    this.limiter.knee.value = 3;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.bus.connect(this.limiter).connect(this.ctx.destination);

    for (const [name, samples] of Object.entries(library(MIX.wet))) {
      this.buffers[name] = this.make(setLoudness(samples, MIX_DB[name]));
    }
    // The crowd is a real recording. Two tries at synthesizing it sounded bad.
    // If the file won't load there is simply no cheer.
    // Several different cheers so it never repeats the same one. "big" is for the
    // gun and the winner, "med" for overtakes.
    for (const [kind, files, db] of [
      ["big", CHEERS_BIG, MIX_DB.cheerBig],
      ["med", CHEERS_MED, MIX_DB.cheer],
    ]) {
      for (const file of files) {
        const x = await loadMono(this.ctx, file);
        if (x) this.cheers[kind].push(this.make(setLoudness(x, db)));
      }
    }
    // Two loops under the race with different lengths (17.5 s and 7.2 s), so the
    // pair takes ages to line up again and you can't hear the repeat. Each loop's
    // end crossfades into its start.
    for (const [file, db] of [["crowd_bed_long.wav", MIX_DB.bed], ["crowd_bed_short.wav", MIX_DB.bedAlt]]) {
      const x = await loadMono(this.ctx, file);
      if (x) this.bedBuffers.push(this.make(setLoudness(x, db)));
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
        hit = mix(normalize(soft), wood ? scale(normalize(wood).slice(0, Math.trunc(0.15 * RATE)), 0.3) : new Float32Array(1));
      }
      bases.push(room(normalize(hit), MIX.wet, MIX.tail_secs, k));
    }
    for (let lane = 0; lane < this.numHorses; lane++) {
      const ratio = 0.75 + (0.35 * lane) / Math.max(1, this.numHorses - 1); // low lane = low thud
      this.steps.push(bases.map((b) => this.make(setLoudness(resample(b, ratio), MIX_DB.step))));
    }
  }

  // Leveled samples -> AudioBuffer.
  make(samples) {
    const buf = this.ctx.createBuffer(1, samples.length, RATE);
    buf.getChannelData(0).set(samples);
    return buf;
  }

  // 1.0 normally. Right after a gunshot or boom it drops, then eases back.
  duckGain() {
    const t = (performance.now() / 1000 - this.duckAt) / MIX.duck_secs;
    if (t >= 1) return 1;
    const smooth = t * t * (3 - 2 * t);
    return MIX.duck + (1 - MIX.duck) * smooth;
  }

  voice(buffer, volume, pan = 0, rate = 1) {
    if (this.active.size >= MAX_VOICES) return; // dropped if every voice is busy
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
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

  // rate > 1 plays it higher (and shorter). The game uses that to step a blip up a scale.
  play(name, volume = 1, rate = 1) {
    if (!this.on || this.muted) return;
    if (name === "gunshot" || name === "boom") this.duckAt = performance.now() / 1000;
    if (name === "cheer") return this.playCheer("med", volume);
    if (name === "cheerBig") return this.playCheer("big", volume);
    this.voice(this.buffers[name], volume, 0, rate);
  }

  // One cheer from the pool. Never the same one twice in a row, and each play is a
  // little different: pitch (and so length), loudness and where it sits left to right.
  // Returns how long it runs in seconds, 0 if nothing played.
  playCheer(kind, volume = 1) {
    const pool = this.cheers[kind];
    if (!this.on || this.muted || !pool.length) return 0;
    let i = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && i === this.lastCheer[kind]) i = (i + 1) % pool.length;
    this.lastCheer[kind] = i;
    const rate = 0.94 + 0.12 * Math.random();
    this.voice(pool[i], volume * (0.85 + 0.3 * Math.random()), (Math.random() * 2 - 1) * 0.3, rate);
    return pool[i].duration / rate;
  }

  // The crowd bed. A quiet loop under the whole race. The swells (the "cheer"
  // sound) sit on top of it. The game calls setBed every frame with 0..1.
  startBed() {
    if (!this.on || !this.bedBuffers.length || this.bed) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0; // fades up from silence, no pop
    gain.connect(this.bus);
    const sources = this.bedBuffers.map((buffer) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(gain);
      // start each loop at a random spot so no two races open the same way
      src.start(0, Math.random() * buffer.duration);
      return src;
    });
    this.bed = { sources, gain };
    this.bedLevel = 0;
  }

  setBed(level) {
    this.bedLevel = level;
    if (this.bed) this.bed.gain.gain.setTargetAtTime(this.muted ? 0 : level, this.ctx.currentTime, 0.3);
  }

  stopBed(secs = 0.8) {
    if (!this.bed) return;
    const { sources, gain } = this.bed;
    this.bed = null;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, secs / 4);
    for (const src of sources) src.stop(this.ctx.currentTime + secs + 0.3);
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
    else this.play("mute"); // a blip so you can tell it came back on
    this.setBed(this.bedLevel ?? 0); // the bed is not in `active`, so mute it here
    return this.muted;
  }
}
