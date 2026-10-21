import test from "node:test";
import assert from "node:assert/strict";

import { Music, SCREEN_TRACKS } from "../public/js/music.js";
import { preloadMenuTrack } from "../public/js/music.js";
import { preloadSoundAssets } from "../public/js/sounds.js";

class AudioParamMock {
  value = 0;
  events = [];

  cancelScheduledValues(time) {
    this.events.push(["cancel", time]);
  }
  setValueAtTime(value, time) {
    this.value = value;
    this.events.push(["set", value, time]);
  }
  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.events.push(["ramp", value, time]);
  }
}

class AudioContextMock {
  currentTime = 10;
  sources = [];

  createGain() {
    return { gain: new AudioParamMock(), connect(destination) { return destination; } };
  }
  createBufferSource() {
    const source = {
      connect(destination) { return destination; },
      start() { this.started = true; },
      stop(time) { this.stoppedAt = time; },
    };
    this.sources.push(source);
    return source;
  }
  async decodeAudioData() {
    return { duration: 30 };
  }
}

test("screen music maps every game screen to its named MP3", () => {
  assert.deepEqual(Object.keys(SCREEN_TRACKS), ["menu", "betting", "setup", "race", "results", "summary"]);
  for (const [screen, filename] of Object.entries(SCREEN_TRACKS)) {
    assert.equal(filename, screen === "setup" ? "race.mp3" : `${screen}.mp3`);
  }
  assert.equal(SCREEN_TRACKS.setup, SCREEN_TRACKS.race);
});

test("startup preloads sound assets and reports progress", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  const progress = [];
  globalThis.fetch = async (url) => {
    requested.push(url);
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  try {
    await Promise.all([
      preloadSoundAssets((loaded, total) => progress.push([loaded, total])),
      preloadMenuTrack(),
    ]);
    assert.equal(requested.length, 22);
    assert.equal(progress.length, 21);
    assert.deepEqual(progress.at(-1), [21, 21]);
    assert.equal(requested.filter((url) => new URL(url).pathname.includes("/assets/sounds/")).length, 21);
    assert.ok(requested.some((url) => new URL(url).pathname.endsWith("/assets/music/menu.mp3")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("screen changes loop and crossfade tracks, and mute ramps music down/up", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
  try {
    const ctx = new AudioContextMock();
    const music = new Music(ctx, {});
    music.setScreen("menu");
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(ctx.sources.length, 1);
    assert.equal(ctx.sources[0].loop, true);
    assert.equal(ctx.sources[0].started, true);
    const menuVoice = [...music.voices][0];
    assert.deepEqual(menuVoice.gain.gain.events.at(-1), ["ramp", 1, 12.5]);

    music.setScreen("betting");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(ctx.sources.length, 2);
    assert.equal(ctx.sources[0].stoppedAt, 12.55);
    assert.deepEqual(menuVoice.gain.gain.events.at(-1), ["ramp", 0, 12.5]);

    const bettingVoice = [...music.voices].find((voice) => voice.url.includes("betting.mp3"));
    music.setMuted(true);
    assert.deepEqual(bettingVoice.gain.gain.events.at(-1), ["ramp", 0, 10.15]);
    music.setMuted(false);
    assert.deepEqual(bettingVoice.gain.gain.events.at(-1), ["ramp", 1, 10.15]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
