// Checks on the sound synth. No audio device needed. These are plain numbers in, numbers out.
// The goal is to catch the things that sound bad: clicks at the ends, NaNs, wrong loudness order.
// Whether it sounds GOOD still takes ears.

import test from "node:test";
import assert from "node:assert/strict";

import { MIX, MIX_DB } from "../public/js/settings.js";
import {
  RATE, arp, chip, crush, fadeEdges, library, peak, peakDb, setLoudness, shortTermDb, synthHit,
} from "../public/js/synth.js";

const lib = library(MIX.wet);
const names = Object.keys(lib);
const leveled = Object.fromEntries(names.map((name) => [name, setLoudness(lib[name], MIX_DB[name])]));

test("every sound has a level and every level has a sound", () => {
  assert.deepEqual([...names].sort(), Object.keys(MIX_DB).filter((k) => k !== "step" && k !== "cheer").sort());
});

test("no NaN or infinity, sensible length", () => {
  for (const name of names) {
    const x = lib[name];
    assert.ok(x.every(Number.isFinite), `${name} has NaN`);
    const secs = x.length / RATE;
    assert.ok(secs > 0.02 && secs < 3.5, `${name} is ${secs.toFixed(2)} s`);
  }
});

test("starts and ends at ~zero so there is no click", () => {
  for (const name of names) {
    const x = leveled[name];
    const p = peak(x);
    assert.ok(Math.abs(x[0]) < 0.02 * p, `${name} starts at ${x[0]}`);
    assert.ok(Math.abs(x[x.length - 1]) < 0.02 * p, `${name} ends at ${x[x.length - 1]}`);
  }
});

test("leveling: peak under the ceiling, never louder than the target", () => {
  for (const name of names) {
    const x = leveled[name];
    assert.ok(peakDb(x) <= -3 + 0.01, `${name} peaks at ${peakDb(x).toFixed(1)} dBFS`);
    assert.ok(shortTermDb(x) <= MIX_DB[name] + 0.1, `${name} is ${shortTermDb(x).toFixed(1)} dB, target ${MIX_DB[name]}`);
  }
});

test("the loudness order is the design: gun and boom > fanfare > money > UI", () => {
  const st = (name) => shortTermDb(leveled[name]);
  // The gun and boom were 11 dB above the fanfare and that was too loud, so the
  // margin is small now. They still have to be on top. Raise it if the mix changes.
  assert.ok(st("gunshot") > st("fanfare") + 1.5, "gun above fanfare");
  assert.ok(st("boom") > st("fanfare") + 1.5, "boom above fanfare");
  for (const quiet of ["register", "coin", "beepLast", "beep", "ding", "gate", "pick", "undo", "click", "tick", "swish"]) {
    assert.ok(st("fanfare") > st(quiet), `fanfare should be above ${quiet}`);
  }
  assert.ok(st("coin") > st("click") + 6, "coin above click");
  assert.ok(st("click") > st("tick"), "click above tick");
});

test("sounds are the same every run", () => {
  const again = library(MIX.wet);
  for (const name of names) assert.deepEqual(again[name], lib[name], name);
});

test("no sound has a spiky peak far above its body", () => {
  // crest factor, peak minus loudest-100ms. Fast-decaying clanks run higher, so the limit is loose.
  for (const name of names) {
    const x = leveled[name];
    const crest = peakDb(x) - shortTermDb(x);
    assert.ok(crest < 16, `${name} crest ${crest.toFixed(1)} dB`);
  }
});

test("chip: slides pitch, decays, right length", () => {
  const x = chip({ shape: "square", f0: 400, f1: 800, dur: 0.1, decay: 10 });
  assert.equal(x.length, Math.trunc(0.1 * RATE));
  const crossings = (a) => a.reduce((c, v, i) => c + (i && Math.sign(v) !== Math.sign(a[i - 1]) ? 1 : 0), 0);
  const half = x.length >> 1;
  assert.ok(crossings(x.slice(half)) > crossings(x.slice(0, half)), "second half is higher");
  assert.ok(peak(x.slice(half)) < peak(x.slice(0, half)), "second half is quieter");
});

test("arp: notes one after another", () => {
  const x = arp([440, 550, 660], 0.05, { shape: "tri" });
  assert.equal(x.length, 3 * Math.trunc(0.05 * RATE));
});

test("crush: holds samples, fewer levels", () => {
  const x = Float32Array.from({ length: 200 }, (_, i) => Math.sin(i / 7));
  const y = crush(x, 4, 4);
  assert.ok(new Set(y).size <= 2 ** 4 + 1);
  assert.equal(y[1], y[0]);
  assert.equal(y[3], y[0]);
});

test("fadeEdges: zero at both ends", () => {
  const x = fadeEdges(new Float32Array(1000).fill(1));
  assert.equal(x[0], 0);
  assert.equal(x[999], 0);
  assert.equal(x[500], 1);
});

test("synthHit (the hoof fallback) is finite and decays", () => {
  const x = synthHit();
  assert.ok(x.every(Number.isFinite));
  assert.ok(peak(x.slice(x.length >> 1)) < peak(x) * 0.2);
});
