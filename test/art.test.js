// The art code is mostly canvas calls, which we check by looking at screenshots.
// These tests cover the honest parts, and that every drawing module links.

import test from "node:test";
import assert from "node:assert/strict";

import { hash, shade, easeBack, easeOut, clamp01 } from "../public/js/art.js";
import { quirks, ACCESSORIES, TRAITS } from "../public/js/characters.js";
import { ROSTER, buildRoster } from "../public/js/horses_data.js";
import { ROSTER_RAW } from "../public/js/roster_raw.js";
import { COAT_COLORS, PACE_STYLES } from "../public/js/settings.js";

test("every horse has a known coat, hat and face", () => {
  for (const h of ROSTER) {
    assert.ok(COAT_COLORS[h.coatName], `coat for ${h.name}`);
    assert.ok(ACCESSORIES.includes(quirks(h).acc), `hat for ${h.name}`);
    assert.ok(TRAITS.includes(quirks(h).trait), `face for ${h.name}`);
  }
});

test("the roster uses a good spread of running styles", () => {
  assert.equal(new Set(ROSTER.map((h) => h.paceName)).size, Object.keys(PACE_STYLES).length, "some style is never used");
});

test("the roster uses a good spread of coats and hats", () => {
  assert.ok(new Set(ROSTER.map((h) => h.coatName)).size >= 15, "too few coats in use");
  assert.equal(new Set(ROSTER.map((h) => h.acc)).size, ACCESSORIES.length, "some hat is never used");
});

test("coat, hat, face and running style follow the name when the roster order changes", () => {
  const byName = (list) => Object.fromEntries(list.map((h) => [h.name, [h.coatName, h.acc, h.trait, h.paceName, h.paceStyle, h.lateKick]]));
  const flipped = buildRoster([...ROSTER_RAW].reverse());
  assert.deepEqual(byName(flipped), byName(ROSTER));
});

test("a typo in the roster fails loudly", () => {
  assert.throws(() => buildRoster([["Oops", 90, "plaid", "tophat", "grin"]]), /unknown coat/);
  assert.throws(() => buildRoster([["Oops", 90, "bay", "fez", "grin"]]), /unknown hat/);
  assert.throws(() => buildRoster([["Oops", 90, "bay", "tophat", "frown"]]), /unknown face/);
  assert.throws(() => buildRoster([["Oops", 90, "bay", "tophat", "grin", "sprinter"]]), /unknown running style/);
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
