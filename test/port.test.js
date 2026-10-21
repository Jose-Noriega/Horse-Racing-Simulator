// Checks the code against numbers frozen from the original Python version.
// reference.json came from the pygame code (git 6d61b31). That code is gone, so
// if the math changes on purpose, update the expected numbers by hand.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import * as settings from "../public/js/settings.js";
import { ROSTER, getHorse, makeHorse } from "../public/js/horses_data.js";
import { getRaceFieldIds, validateRaceCard } from "../public/js/race_card.js";
import { winProbabilities, orderProbability, paceProgress, assignPaceProfiles, simulateRace } from "../public/js/race.js";
import * as betting from "../public/js/betting.js";
import { startProgress, laneProgress, pointOnLane } from "../public/js/track.js";
import { shortNum } from "../public/js/ui.js";

const ref = JSON.parse(readFileSync(new URL("./reference.json", import.meta.url)));
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

const field = getRaceFieldIds(0).map((id, k) => makeHorse(getHorse(id), settings.HORSE_COLORS[k]));
const pWin = winProbabilities(field);
const orderProb = (ids) => orderProbability(field, ids);

test("roster speeds match", () => {
  ref.roster_speeds.forEach((s, i) => close(ROSTER[i].averageSpeed, s, `horse ${i}`));
});

test("win + order probabilities match", () => {
  for (const [k, v] of Object.entries(ref.p_win)) close(pWin[k], v, `p_win ${k}`);
  for (const [k, v] of Object.entries(ref.order_probs)) close(orderProb(k.split(",").map(Number)), v, `order ${k}`);
});

test("pace progress matches", () => {
  for (const [u, v] of Object.entries(ref.pace.points)) close(paceProgress(ref.pace.speeds, Number(u)), v, `pace ${u}`);
});

// The scenario the reference numbers were made from
function buildPool() {
  const pool = betting.newPool();
  betting.addBet(pool, 1, "Ann", [0], 10);
  betting.addBet(pool, 2, "Bo", [1], 5);
  betting.addBet(pool, 3, "Cy", [0, 1], 4);
  betting.addBet(pool, 1, "", [0], 2.5);
  betting.addBet(pool, 4, "Di", [2, 0, 1], 3);
  return pool;
}

test("bets, pool, and parlay multipliers match", () => {
  const pool = buildPool();
  assert.deepEqual(
    pool.bets.map((b) => ({ n: b.playerNumber, name: b.personName, ids: b.horseIds, amount: b.amount })),
    ref.bets,
  );
  close(betting.totalPool(pool), ref.total_pool, "pool");
  for (const h of field) {
    close(betting.amountOnWin(pool, h.id), ref.on_win[h.id], `on win ${h.id}`);
  }
  for (const [k, v] of Object.entries(ref.ticket_mult)) {
    close(betting.displayedTicketMultiplier(pool, k.split(",").map(Number), field, pWin), v, `ticket ${k}`);
  }
});

test("win odds start at fair odds and move continuously with the tote pool", () => {
  const pool = betting.newPool();
  const horseId = field[0].id;
  const openingOdds = betting.displayedWinMultiplier(pool, horseId, pWin);
  close(openingOdds, 1 / pWin[horseId], "opening fair odds");

  betting.addBet(pool, 1, "Ann", [horseId], 20);
  const backedOdds = betting.displayedWinMultiplier(pool, horseId, pWin);
  assert.ok(backedOdds < openingOdds, "more money on a horse lowers its estimated payout");

  betting.addBet(pool, 2, "Bo", [field[1].id], 20);
  const laterOdds = betting.displayedWinMultiplier(pool, horseId, pWin);
  assert.ok(laterOdds > backedOdds, "money on another horse raises its estimated payout");
  assert.ok(laterOdds < openingOdds, "the opening estimate fades gradually as bets grow");
});

test("settlement matches, incl. refund when nobody hits", () => {
  const pool = buildPool();
  const cases = {
    settle_win0: [0, 1, 2, 3, 4, 5, 6, 7],
    settle_parlay3: [2, 0, 1, 3, 4, 5, 6, 7],
    settle_none: [7, 6, 5, 4, 3, 2, 1, 0],
  };
  for (const [key, finish] of Object.entries(cases)) {
    const want = ref[key];
    betting.settle(pool, finish, pWin, orderProb).forEach(([, amt], i) => close(amt, want.settle[i], `${key} bet ${i}`));
    assert.equal(betting.anyTicketHits(pool, finish), want.hit, key);
    const players = betting.payoutsByPlayer(pool, finish, pWin, orderProb);
    assert.equal(players.length, want.players.length, `${key} players`);
    players.forEach((p, i) => {
      assert.equal(p.playerNumber, want.players[i][0]);
      assert.equal(p.personName, want.players[i][1]);
      close(p.amount, want.players[i][2], `${key} payout ${i}`);
    });
  }
  // zero house take: payouts sum to the pool
  const total = betting.payoutsByPlayer(pool, cases.settle_win0, pWin, orderProb).reduce((s, p) => s + p.amount, 0);
  close(total, betting.totalPool(pool), "money in = money out");
});

test("undo matches", () => {
  const pool = buildPool();
  betting.undoLast(pool);
  assert.deepEqual(pool.bets.map((b) => b.amount), ref.after_undo);
  betting.undoLast(pool);
  assert.deepEqual(pool.bets.map((b) => b.amount), ref.after_undo2);
});

test("bad bets throw", () => {
  const pool = betting.newPool();
  assert.throws(() => betting.addBet(pool, 0, "", [0], 1));
  assert.throws(() => betting.addBet(pool, 1, "", [0], 0));
  assert.throws(() => betting.addBet(pool, 1, "", [], 1));
  assert.throws(() => betting.addBet(pool, 1, "", [0, 0], 1));
  assert.throws(() => betting.addBet(pool, 1, "", [0, 1, 2, 3], 1));
});

test("track geometry matches", () => {
  ref.track.start_progress.forEach((v, i) => close(startProgress(i), v, `start ${i}`));
  for (const [key, want] of Object.entries(ref.track.points)) {
    const [lane, p] = key.split("@").map(Number);
    const got = pointOnLane(lane, laneProgress(lane, p));
    want.forEach((v, k) => close(got[k], v, `${key}[${k}]`));
  }
});

test("shortNum matches", () => {
  for (const [x, want] of Object.entries(ref.short_num)) assert.equal(shortNum(Number(x)), want, x);
});

test("simulateRace: seeded, ordered, favorites win more", () => {
  let seed = 1;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32); // LCG, good enough here
  let wins = 0;
  const runs = 2000;
  for (let i = 0; i < runs; i++) {
    const { ordered } = simulateRace(field, { rng });
    assert.deepEqual(ordered.map((h) => h.place), [1, 2, 3, 4, 5, 6, 7, 8]);
    if (ordered[0].id === 0) wins++;
  }
  // horse 0 is the favorite. Its sampled win rate should sit near the softmax number (loose, they are different models).
  assert.ok(wins / runs > 1 / 8, `favorite won ${wins}/${runs}`);
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
