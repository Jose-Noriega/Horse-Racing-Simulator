// Removing a bet from the BETS pad, and undoing that removal.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { newPool, addBet, removeBet, undoLast, totalPool } from "../public/js/betting.js";

test("removeBet takes the whole ticket off the pool", () => {
  const pool = newPool();
  addBet(pool, 1, "Ann", [3], 10);
  const b = addBet(pool, 2, "Bo", [5, 1], 5);
  addBet(pool, 2, "", [5, 1], 7); // tops up the same ticket
  addBet(pool, 3, "Cy", [2], 4);
  assert.equal(removeBet(pool, b), true);
  assert.equal(pool.bets.length, 2);
  assert.equal(totalPool(pool), 14);
  assert.equal(removeBet(pool, b), false); // already gone
});

test("undo after remove puts the ticket back in place with its amount", () => {
  const pool = newPool();
  addBet(pool, 1, "Ann", [3], 10);
  const b = addBet(pool, 2, "Bo", [5, 1], 5);
  addBet(pool, 2, "", [5, 1], 7);
  addBet(pool, 3, "Cy", [2], 4);
  removeBet(pool, b);
  assert.equal(undoLast(pool), true);
  assert.deepEqual(pool.bets.map((x) => x.playerNumber), [1, 2, 3]);
  assert.equal(pool.bets[1].amount, 12);
  // and the old history works again: the next undos peel off Cy, then the $7 top-up
  undoLast(pool);
  undoLast(pool);
  assert.equal(pool.bets[1].amount, 5);
  assert.equal(totalPool(pool), 15);
});

test("while a ticket is removed, undo skips its add entries", () => {
  const pool = newPool();
  addBet(pool, 1, "Ann", [3], 10);
  const b = addBet(pool, 2, "Bo", [4], 5);
  const c = addBet(pool, 3, "Cy", [6], 2);
  removeBet(pool, b);
  removeBet(pool, c);
  // history: Ann's add, remove Bo, remove Cy. Undo goes newest first.
  undoLast(pool); // Cy back
  undoLast(pool); // Bo back, with his old history
  assert.deepEqual(pool.bets.map((x) => x.playerNumber), [1, 2, 3]);
  undoLast(pool); // then the original adds, newest first: Cy
  assert.deepEqual(pool.bets.map((x) => x.playerNumber), [1, 2]);
  undoLast(pool);
  undoLast(pool);
  assert.equal(pool.bets.length, 0);
  assert.equal(undoLast(pool), false);
});
