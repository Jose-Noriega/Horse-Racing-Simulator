// Checks on the words. No canvas. These are pure functions, so no mocks.
// What they catch: a line that repeats, an undefined showing on screen, a status
// message the art can't read, a roster with two of the same name.

import test from "node:test";
import assert from "node:assert/strict";

import { MAX_PARLAY_LEGS } from "../public/js/settings.js";
import { ROSTER } from "../public/js/horses_data.js";
import * as w from "../public/js/words.js";

// a rng that walks a fixed list, so a test can say exactly what happens
const seq = (...xs) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

test("pickFresh never repeats the last picks", () => {
  const pool = ["a", "b", "c", "d"];
  const mem = {};
  let last = null;
  let beforeLast = null;
  for (let i = 0; i < 400; i++) {
    const got = w.pickFresh(mem, "k", pool);
    assert.notEqual(got, last, "same line twice in a row");
    assert.notEqual(got, beforeLast, "same line two picks ago");
    beforeLast = last;
    last = got;
  }
});

test("pickFresh works on a pool of one and a pool of two", () => {
  assert.equal(w.pickFresh({}, "k", ["only"]), "only");
  const mem = {};
  const a = w.pickFresh(mem, "k", ["x", "y"]);
  const b = w.pickFresh(mem, "k", ["x", "y"]);
  assert.notEqual(a, b);
});

test("byRace picks by race and keeps the last one past the end", () => {
  assert.equal(w.byRace(["a", "b", "c"], 0), "a");
  assert.equal(w.byRace(["a", "b", "c"], 2), "c");
  assert.equal(w.byRace(["a", "b", "c"], 9), "c");
  assert.equal(w.byRace(["a", "b", "c"], -1), "a");
});

test("fill replaces every slot and leaves nothing undefined", () => {
  assert.equal(w.fill("{n} and {n}, {x}", { n: "Colin" }), "Colin and Colin, ");
  assert.equal(w.fill("no slots", {}), "no slots");
});

test("one gerald line, one goose line, one duck line, one chicken line for every race", () => {
  for (const list of [w.GERALD, w.GOOSE, w.DUCK, w.CHICKEN]) {
    assert.equal(list.length, 8, "a list per race of the default card");
    assert.equal(new Set(list).size, list.length, "no duplicates");
    for (const line of list) assert.ok(typeof line === "string" && line.length > 0);
  }
});

test("the bookie's goose gets further along each race", () => {
  assert.match(w.GOOSE[2], /goose/);
  assert.match(w.GOOSE[7], /window 2/);
  assert.match(w.GERALD[7], /goose/);
});

test("no line carries a stray slot or an undefined", () => {
  const lines = [
    ...w.GERALD, ...w.GOOSE, ...w.DUCK, ...w.CHICKEN, ...Object.values(w.STATUS),
    ...w.SPONSORS.flat(), ...w.BADGES.flat(), ...w.PLATES, ...w.REFUND_BUBBLE, ...w.NO_BETS_BUBBLE,
    w.PICK_HINT, w.NO_BETS, w.CORNER_TITLE, w.DNF_NOTE, w.SUMMARY_NONE, ...w.BOOMS,
  ];
  for (const line of lines) {
    assert.ok(!/undefined|null|\[object/.test(line), line);
    assert.ok(!/\{\w+\}/.test(line), `unfilled slot: ${line}`);
  }
});

test("announcer: lineup is always a line, the others are rare", () => {
  for (let r = 0; r < 10; r++) assert.ok(w.lineupLine({ raceIndex: r }).length > 0);
  assert.equal(w.startLine({ raceIndex: 0 }), "THEY'RE RUNNING! WITH THEIR LEGS!");
  assert.equal(w.startLine({ raceIndex: 1 }), null);
  assert.match(w.countdownLine({ poolEmpty: true, longshotName: "Colin" }), /nobody has bet/);
  assert.equal(w.countdownLine({ poolEmpty: false, longshotName: "Colin" }, seq(0.9)), null);
  assert.equal(w.countdownLine({ poolEmpty: false, longshotName: "Colin" }, seq(0.1)), "Colin has been through a lot.");
  assert.equal(w.countdownLine({ poolEmpty: false, longshotName: null }, seq(0.1)), null);
});

test("announcer: lead change only speaks for a longshot", () => {
  assert.equal(w.leadLine({ leaderName: "Dave", leaderIsLongshot: false }), null);
  assert.equal(w.leadLine({ leaderName: "Colin", leaderIsLongshot: true }), "Colin is winning and has no idea.");
});

test("announcer: mid-race line names the right horse", () => {
  assert.match(w.midLine({ lastName: "Colin", favName: "Dave", favIsLast: true }), /Dave is last/);
  const mem = {};
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(w.midLine({ lastName: "Colin", favName: "Dave", favIsLast: false }, Math.random, mem));
  assert.ok(seen.size === 2);
  for (const line of seen) assert.ok(!line.includes("Dave"));
});

test("announcer: winner is always named, a longshot gets the percent", () => {
  assert.equal(w.winnerLine({ name: "Colin", pct: "9.8", isLongshot: false }), "Colin WINS!");
  assert.match(w.winnerLine({ name: "Colin", pct: "9.8", isLongshot: true }), /Colin wins\. 9\.8 percent/);
});

test("announcer: photo, last place and explosion lines are filled", () => {
  assert.match(w.photoLine(), /photo finish/);
  assert.equal(w.lastPlaceLine({ favName: "Dave" }), "Dave finished last. it's okay buddy.");
  assert.ok(w.explodeLine({ name: "Colin" }).length > 0);
  const lines = new Set();
  for (let i = 0; i < 20; i++) lines.add(w.explodeLine({ name: "Colin" }, Math.random, {}));
  assert.ok([...lines].some((l) => l.includes("Colin")));
});

test("bookie: opening lines are the goose, plus the refund line after a refund", () => {
  assert.deepEqual(w.openingLines({ raceIndex: 2, lastRefund: false }), [w.GOOSE[2]]);
  const after = w.openingLines({ raceIndex: 3, lastRefund: true });
  assert.equal(after.length, 2);
  assert.match(after[0], /cold spoon/);
  assert.equal(after[1], w.GOOSE[3]);
  assert.equal(w.openingLines({ raceIndex: 0, lastRefund: true }).length, 1, "no refund before race 1");
});

const probs = { 1: 0.3, 2: 0.2, 3: 0.1 };

test("bookie: a special bet gets a line half the time, an ordinary bet never", () => {
  const fav = { amount: 10, horseIds: [1], horseName: "Dave", winProbs: probs, isFirst: false };
  assert.equal(w.betLine(fav, seq(0.1)), "Dave. i know that one. it's afraid of buckets.");
  assert.equal(w.betLine(fav, seq(0.9)), null, "the dice said stay quiet");
  const long = { ...fav, horseIds: [3], horseName: "Colin" };
  assert.equal(w.betLine(long, seq(0.1)), "Colin. they'll be so happy you picked them.");
  const ordinary = { ...fav, horseIds: [2], horseName: "Brian, Wet" };
  for (let i = 0; i < 50; i++) assert.equal(w.betLine(ordinary), null);
});

test("bookie: the money lines, in priority order", () => {
  const mid = { amount: 10, horseIds: [2], horseName: "x", winProbs: probs, isFirst: false };
  assert.match(w.betLine({ ...mid, amount: 1 }, seq(0)), /one dollar/);
  assert.match(w.betLine({ ...mid, amount: 250 }, seq(0)), /a lot/);
  assert.match(w.betLine({ ...mid, isFirst: true }, seq(0)), /written that on my arm/);
  // a parlay has no single horse, so only the money lines apply
  assert.match(w.betLine({ ...mid, horseIds: [1, 2], amount: 1 }, seq(0)), /one dollar/);
  assert.equal(w.betLine({ ...mid, horseIds: [1, 2] }, seq(0)), null);
  // favorite beats a $1 bet
  assert.match(w.betLine({ ...mid, horseIds: [1], horseName: "Dave", amount: 1 }, seq(0)), /afraid of buckets/);
});

test("bookie: undo and error lines", () => {
  assert.equal(w.undoLine(3), "i'm just going to stand here.");
  assert.equal(w.undoLine(1, seq(0.1)), "okay. it was never there.");
  assert.equal(w.undoLine(1, seq(0.9)), null);
  assert.match(w.errorLine("legs", 1), /three/);
  assert.match(w.errorLine("nothingToUndo", 2), /nothing to undo/);
  assert.equal(w.errorLine("noPick", 1), null, "most mistakes get no bookie line");
  assert.equal(w.errorLine("noPick", 3), "ok.");
  assert.equal(w.errorLine("legs", 6), "ok.");
});

test("status messages round trip, and the good news is not a mistake", () => {
  for (const [key, msg] of Object.entries(w.STATUS)) assert.equal(w.statusKind(msg), key);
  assert.equal(w.statusKind("Win #1 Ann: Dave  $10.00 total"), "bet");
  assert.equal(w.statusKind("Parlay #2: A > B  $5.00 total"), "bet");
  assert.equal(w.statusKind("something we never wrote"), "other");
  assert.equal(w.isMistake(w.STATUS.cleared), false);
  assert.equal(w.isMistake(w.STATUS.undone), false);
  assert.equal(w.isMistake("Win #1 Ann: Dave  $10.00 total"), false);
  assert.equal(w.isMistake(w.STATUS.noPick), true);
  assert.equal(w.isMistake("something we never wrote"), true);
});

test("the chalkboard's 'three' is still right", () => {
  assert.equal(MAX_PARLAY_LEGS, 3);
});

test("the roster: 64 unique, short names", () => {
  assert.equal(ROSTER.length, 64);
  assert.equal(new Set(ROSTER.map((h) => h.name)).size, 64, "two horses share a name");
  for (const h of ROSTER) assert.ok(h.name.length >= 3 && h.name.length <= 17, h.name);
});

test("billboards: a name and a tagline each, sized for the board", () => {
  for (const [name, tag] of w.SPONSORS) {
    assert.ok(name.length <= 16, name);
    assert.ok(tag.length <= 30, tag);
  }
});
