// The art code is mostly canvas calls, which we check by looking at screenshots.
// These tests cover the honest parts, and that every drawing module links.

import test from "node:test";
import assert from "node:assert/strict";

import { hash, shade, easeBack, easeOut, clamp01 } from "../public/js/art.js";
import { quirks, ACCESSORIES, TRAITS } from "../public/js/characters.js";

test("quirks: same id, same quirks", () => {
  for (let id = 0; id < 64; id++) assert.deepEqual(quirks(id), quirks(id));
});

test("quirks: the first 14 horses all get different hats", () => {
  const hats = new Set(Array.from({ length: ACCESSORIES.length }, (_, id) => quirks(id).acc));
  assert.equal(hats.size, ACCESSORIES.length);
});

test("quirks: every horse gets a known hat and trait", () => {
  for (let id = 0; id < 64; id++) {
    const q = quirks(id);
    assert.ok(ACCESSORIES.includes(q.acc), `hat for ${id}`);
    assert.ok(TRAITS.includes(q.trait), `trait for ${id}`);
  }
});

test("hash: in [0, 1), steady, and not all the same", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const h = hash(i);
    assert.ok(h >= 0 && h < 1);
    assert.equal(h, hash(i));
    seen.add(h);
  }
  assert.ok(seen.size > 490);
});

test("shade: lighten goes toward white, darken toward black, strings pass through", () => {
  assert.deepEqual(shade([100, 100, 100], 0), [100, 100, 100]);
  assert.deepEqual(shade([100, 100, 100], 1), [255, 255, 255]);
  assert.deepEqual(shade([100, 100, 100], -1), [0, 0, 0]);
  assert.equal(shade("#abc", 0.5), "#abc");
});

test("easing: clamps, and lands on 1", () => {
  assert.equal(clamp01(-3), 0);
  assert.equal(clamp01(9), 1);
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.equal(easeBack(1), 1);
  assert.ok(Math.max(...Array.from({ length: 50 }, (_, i) => easeBack(i / 49))) > 1, "easeBack overshoots");
});

test("every drawing module links (catches a missing export)", async () => {
  for (const m of ["fx", "screens", "scenery", "racefx", "crowd", "sprites"]) {
    await import(`../public/js/${m}.js`);
  }
});
