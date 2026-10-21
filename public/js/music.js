// Screen music loops. Add one MP3 per screen under public/assets/music.
export const SCREEN_TRACKS = {
  menu: "menu.mp3",
  betting: "betting.mp3",
  setup: "race.mp3",
  race: "race.mp3",
  results: "results.mp3",
  summary: "summary.mp3",
};

const MUSIC_DIR = new URL("../assets/music/", import.meta.url);
const CROSSFADE_SECONDS = 2.5;
let menuTrackData;

export async function preloadMenuTrack() {
  try {
    menuTrackData ??= fetch(new URL(SCREEN_TRACKS.menu, MUSIC_DIR)).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    });
    await menuTrackData;
  } catch (error) {
    console.warn(`Music track unavailable (${SCREEN_TRACKS.menu}):`, error);
  }
}

export class Music {
  constructor(ctx, bus) {
    this.ctx = ctx;
    this.bus = bus;
    this.loads = new Map();
    this.failed = new Set();
    this.voices = new Set();
    this.screen = null;
    this.muted = false;
  }

  setScreen(screen) {
    this.screen = screen;
    const filename = SCREEN_TRACKS[screen];
    if (!filename) return;

    const url = new URL(filename, MUSIC_DIR).href;
    const existing = [...this.voices].find((voice) => voice.url === url && !voice.retiring);
    if (existing) {
      this.crossfadeTo(existing);
      return;
    }
    if (this.failed.has(url)) return;

    this.load(url).then((buffer) => {
      if (this.screen !== screen) return;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(this.bus);
      const voice = { url, source, gain, retiring: false };
      this.voices.add(voice);
      source.onended = () => this.voices.delete(voice);
      source.start();
      this.crossfadeTo(voice);
    }).catch((error) => {
      this.failed.add(url);
      console.warn(`Music track unavailable (${filename}):`, error);
      if (this.screen === screen) this.fadeOut();
    });
  }

  load(url) {
    if (!this.loads.has(url)) {
      const data = url === new URL(SCREEN_TRACKS.menu, MUSIC_DIR).href
        ? (menuTrackData ?? fetch(url).then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.arrayBuffer();
        }))
        : fetch(url).then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.arrayBuffer();
        });
      this.loads.set(url, data.then((encoded) => this.ctx.decodeAudioData(encoded.slice(0))));
    }
    return this.loads.get(url);
  }

  ramp(gain, value, now, duration = CROSSFADE_SECONDS) {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(value, now + duration);
  }

  crossfadeTo(target) {
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      const isTarget = voice === target;
      this.ramp(voice.gain, isTarget && !this.muted ? 1 : 0, now);
      if (!isTarget && !voice.retiring) {
        voice.retiring = true;
        voice.source.stop(now + CROSSFADE_SECONDS + 0.05);
      }
    }
  }

  fadeOut() {
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      this.ramp(voice.gain, 0, now);
      if (!voice.retiring) {
        voice.retiring = true;
        voice.source.stop(now + CROSSFADE_SECONDS + 0.05);
      }
    }
  }

  setMuted(muted) {
    this.muted = muted;
    const filename = SCREEN_TRACKS[this.screen];
    const targetUrl = filename ? new URL(filename, MUSIC_DIR).href : null;
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      this.ramp(voice.gain, !muted && !voice.retiring && voice.url === targetUrl ? 1 : 0, now, 0.15);
    }
  }
}
