// Checks the betting, race, and card code. Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";

import * as settings from "../public/js/settings.js";
import { ROSTER, getHorse, makeHorse } from "../public/js/horses_data.js";
import { getRaceFieldIds, validateRaceCard, assignAccents } from "../public/js/race_card.js";
import { winProbabilities, orderProbability, paceProgress, assignPaceProfiles, simulateRace } from "../public/js/race.js";
import * as betting from "../public/js/betting.js";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

// Horses 0-4. The live card is shuffled, so don't use it here.
const field = [0, 1, 2, 3, 4].map((id) => makeHorse(getHorse(id)));
const pWin = winProbabilities(field);
const orderProb = (ids) => orderProbability(field, ids);

test("coats and pace tendencies stay with roster identities", () => {
  for (const horse of ROSTER) {
    assert.deepEqual(makeHorse(horse).coat, horse.coat);
    assert.ok(horse.coat);
    assert.ok(horse.paceStyle >= -1 && horse.paceStyle <= 1);
    assert.ok(horse.lateKick >= 0 && horse.lateKick <= 0.8);
  }
  });

test("race-to-race pace variation preserves each horse's style", () => {
  const horse = makeHorse(getHorse(6));
  const style = horse.paceStyle;
  const lateKick = horse.lateKick;
  assignPaceProfiles([horse], () => 0.25);
  const firstRace = [...horse.paceSpeeds];
  assignPaceProfiles([horse], () => 0.75);
  assert.notDeepEqual(horse.paceSpeeds, firstRace, "race-day pace still varies");
  assert.equal(horse.paceStyle, style);
  assert.equal(horse.lateKick, lateKick);
});

// A small fixed set of bets
function buildPool() {
  const pool = betting.newPool();
  betting.addBet(pool, 1, "Ann", [0], 10);
  betting.addBet(pool, 2, "Bo", [1], 5);
  betting.addBet(pool, 3, "Cy", [0, 1], 4);
  betting.addBet(pool, 1, "", [0], 2.5);
  betting.addBet(pool, 4, "Di", [2, 0, 1], 3);
  return pool;
}

test("win odds come from real bets only and never promise more than the pool", () => {
  const pool = betting.newPool();
  assert.equal(betting.displayedWinMultiplier(pool, 0), null, "no bets, no odds");

  betting.addBet(pool, 1, "Ann", [0], 10);
  close(betting.displayedWinMultiplier(pool, 0), 1, "one bet on a horse in an empty pool pays 1x");

  betting.addBet(pool, 2, "Bo", [1], 10);
  close(betting.displayedWinMultiplier(pool, 0), 2, "money on another horse raises the payout");
  close(betting.displayedWinMultiplier(pool, 1), 2, "and the other horse");
  const shown = betting.displayedWinMultiplier(pool, 0) * 10;
  const paid = betting.settle(pool, [0, 1, 2, 3, 4], pWin, orderProb)[0][1];
  close(shown, paid, "shown payout equals real payout for plain win bets");
});

test("settlement: payouts add up to the pool, and a miss refunds", () => {
  const pool = buildPool();
  const wins0 = betting.payoutsByPlayer(pool, [0, 1, 2, 3, 4], pWin, orderProb);
  close(wins0.reduce((s, p) => s + p.amount, 0), betting.totalPool(pool), "money in = money out");
  assert.ok(!betting.anyTicketHits(pool, [4, 3, 2, 1, 0]));
  const refunds = betting.settle(pool, [4, 3, 2, 1, 0], pWin, orderProb);
  refunds.forEach(([bet, amt]) => close(amt, bet.amount, "refund is the stake"));
});

test("undo takes off the last bet", () => {
  const pool = buildPool();
  betting.undoLast(pool);
  assert.deepEqual(pool.bets.map((b) => b.amount), [12.5, 5, 4]);
  betting.undoLast(pool);
  assert.deepEqual(pool.bets.map((b) => b.amount), [10, 5, 4]);
});

test("bad bets throw", () => {
  const pool = betting.newPool();
  assert.throws(() => betting.addBet(pool, 0, "", [0], 1));
  assert.throws(() => betting.addBet(pool, 1, "", [0], 0));
  assert.throws(() => betting.addBet(pool, 1, "", [], 1));
  assert.throws(() => betting.addBet(pool, 1, "", [0, 0], 1));
  assert.throws(() => betting.addBet(pool, 1, "", [0, 1, 2, 3], 1));
});

test("simulateRace: seeded, ordered, favorites win more", () => {
  let seed = 1;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32); // LCG, good enough here
  let wins = 0;
  const runs = 2000;
  for (let i = 0; i < runs; i++) {
    const { ordered } = simulateRace(field, { rng });
    assert.deepEqual(ordered.map((h) => h.place), field.map((_, i) => i + 1));
    if (ordered[0].id === 0) wins++;
  }
  // horse 0 is the favorite. Its sampled win rate should sit near the softmax number (loose, they are different models).
  assert.ok(wins / runs > 1 / field.length, `favorite won ${wins}/${runs}`);
});

test("pace profiles: every curve reaches 1 and never goes backwards", () => {
  assignPaceProfiles(field);
  for (const h of field) {
    let last = 0;
    for (let u = 0; u <= 1.0001; u += 0.05) {
      const p = paceProgress(h.paceSpeeds, Math.min(u, 1));
      assert.ok(p >= last - 1e-12);
      last = p;
    }
    assert.equal(last, 1);
  }
});

test("race card validation", () => {
  validateRaceCard();
  assert.throws(() => validateRaceCard([[0, 0, 1, 2, 3, 4, 5, 6]]));
});

// House take is zero, so winners can never be paid more than was bet.
test("random bets: payouts never exceed the pool", () => {
  let seed = 7;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const pick = (n) => Math.floor(rng() * n);
  for (let trial = 0; trial < 3000; trial++) {
    const pool = betting.newPool();
    const nBets = 1 + pick(12);
    for (let i = 0; i < nBets; i++) {
      const legs = 1 + pick(3);
      const ids = [0, 1, 2, 3, 4].sort(() => rng() - 0.5).slice(0, legs);
      betting.addBet(pool, 1 + pick(4), "", ids, 0.5 + pick(40) / 2);
      if (rng() < 0.2) betting.undoLast(pool);
    }
    const finish = [0, 1, 2, 3, 4].sort(() => rng() - 0.5);
    const total = betting.totalPool(pool);
    const paid = betting.settle(pool, finish, pWin, orderProb).reduce((s, [, amt]) => s + amt, 0);
    const byPlayer = betting.payoutsByPlayer(pool, finish, pWin, orderProb).reduce((s, p) => s + p.amount, 0);
    assert.ok(paid <= total + 1e-9, `trial ${trial}: paid ${paid} > pool ${total}`);
    assert.ok(byPlayer <= total + 1e-9, `trial ${trial}: by player ${byPlayer} > pool ${total}`);
    if (pool.bets.length) close(paid, total, `trial ${trial}: all of the pool goes out`);
  }
});

test("player results: stake, paid, net, losers included", () => {
  const pool = betting.newPool();
  betting.addBet(pool, 1, "Ann", [0], 10);
  betting.addBet(pool, 2, "Bo", [1], 5);
  betting.addBet(pool, 1, "", [2], 4); // Ann has a second, losing bet
  const rows = betting.playerResults(pool, [0, 1, 2, 3, 4], pWin, orderProb);
  const ann = rows.find((r) => r.playerNumber === 1);
  const bo = rows.find((r) => r.playerNumber === 2);
  close(ann.staked, 14, "Ann staked both bets");
  close(ann.paid, 19, "Ann's win bet takes the whole $19 pool");
  close(ann.net, 5, "Ann net");
  assert.equal(ann.personName, "Ann");
  close(bo.net, -5, "Bo lost his $5");
  close(rows.reduce((s, r) => s + r.net, 0), 0, "nets cancel out: zero house take");
  assert.equal(rows[0].playerNumber, 1, "biggest winner first");
  // nobody hits: everyone is refunded
  for (const r of betting.playerResults(pool, [4, 3, 2, 1, 0], pWin, orderProb)) close(r.net, 0, "refund nets 0");
});

test("accents: every horse in a race gets its own, and a horse's coat never changes", () => {
  assert.ok(settings.ACCENT_COLORS.length >= settings.HORSES_PER_RACE);
  assert.equal(new Set(settings.ACCENT_COLORS.map(String)).size, settings.ACCENT_COLORS.length, "accent list has a repeat");
  for (let trial = 0; trial < 200; trial++) {
    const race = ROSTER.slice(trial % 20, (trial % 20) + settings.HORSES_PER_RACE).map(makeHorse);
    const coats = race.map((h) => String(h.coat));
    assignAccents(race);
    assert.equal(new Set(race.map((h) => String(h.accent))).size, race.length, "two horses share an accent");
    race.forEach((h, i) => assert.equal(String(h.coat), coats[i], "assigning accents moved a coat"));
  }
  // a full 12-horse field uses every color once, and it is not always the same order
  const twelve = () => assignAccents(Array.from({ length: 12 }, (_, i) => makeHorse(getHorse(i))));
  const a = twelve().map((h) => String(h.accent)), b = twelve().map((h) => String(h.accent));
  assert.equal(new Set(a).size, 12);
  assert.notDeepEqual(a, b, "accents should be shuffled");
  assert.throws(() => assignAccents(Array.from({ length: 13 }, (_, i) => makeHorse(getHorse(i)))));
});
