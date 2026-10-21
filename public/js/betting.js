// Betting pool: player numbers, combined wagers, win bets, and parlays.
//
// All money in a race is paid back out (zero house take). Winning tickets
// share the full pool in proportion to probability-weighted claims, so
// parlays (harder exact-order outcomes) pay more per dollar than win bets.
// Port of betting.py. Keep the two in step, test/betting.test.js checks them.

import { orderProbability } from "./race.js";
import { MAX_PARLAY_LEGS } from "./settings.js";
import { STATUS } from "./words.js"; // the messages live there so the art can read them

const sameIds = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export function isParlay(bet) {
  return bet.horseIds.length > 1;
}

export function formatPlayer(playerNumber, personName) {
  const name = personName.trim();
  return name ? `#${playerNumber} ${name}` : `#${playerNumber}`;
}

export function parlayBonus(nLegs) {
  if (nLegs === 2) return 1.25;
  if (nLegs === 3) return 1.5;
  return 1;
}

// pool = { bets: [], playerNames: Map, undoStack: [] }. The pool is plain data.
export function newPool() {
  return { bets: [], playerNames: new Map(), undoStack: [] };
}

// Between races: bets go, names stay so # + name stay linked.
export function clearPool(pool) {
  pool.bets.length = 0;
  pool.undoStack.length = 0;
}

export function rememberPlayer(pool, playerNumber, personName) {
  const name = personName.trim();
  if (name) pool.playerNames.set(playerNumber, name);
  return pool.playerNames.get(playerNumber) ?? "";
}

// Returns the bet. Throws Error with a message the UI can show.
export function addBet(pool, playerNumber, personName, horseIds, amount) {
  if (!(playerNumber >= 1)) throw new Error(STATUS.zeroPlayer);
  if (!(amount > 0)) throw new Error(STATUS.zeroWager);
  const ids = [...horseIds];
  if (!ids.length || ids.length > MAX_PARLAY_LEGS) {
    throw new Error(STATUS.legs);
  }
  if (new Set(ids).size !== ids.length) throw new Error(STATUS.dupHorse);

  const name = rememberPlayer(pool, playerNumber, personName);

  for (const existing of pool.bets) {
    if (existing.playerNumber === playerNumber && sameIds(existing.horseIds, ids)) {
      existing.amount += amount;
      if (name) existing.personName = name;
      pool.undoStack.push({ playerNumber, horseIds: ids, amount, createdNew: false });
      return existing;
    }
  }
  const bet = { playerNumber, personName: name, horseIds: ids, amount };
  pool.bets.push(bet);
  pool.undoStack.push({ playerNumber, horseIds: ids, amount, createdNew: true });
  return bet;
}

// Reverse the most recent wager (or added amount). False if nothing to undo.
export function undoLast(pool) {
  const action = pool.undoStack.pop();
  if (!action) return false;
  for (let i = 0; i < pool.bets.length; i++) {
    const bet = pool.bets[i];
    if (bet.playerNumber !== action.playerNumber) continue;
    if (!sameIds(bet.horseIds, action.horseIds)) continue;
    if (action.createdNew || bet.amount - action.amount <= 1e-9) pool.bets.splice(i, 1);
    else bet.amount -= action.amount;
    return true;
  }
  return false;
}

export function totalPool(pool) {
  return pool.bets.reduce((s, b) => s + b.amount, 0);
}

// Stake that needs this horse to finish first (win bets + first parlay leg).
export function amountOnWin(pool, horseId) {
  return pool.bets.filter((b) => b.horseIds[0] === horseId).reduce((s, b) => s + b.amount, 0);
}

// How big a share of the pool this ticket deserves if it hits.
export function claimWeight(bet, pWin, orderProb) {
  if (bet.horseIds.length === 1) {
    const p = pWin[bet.horseIds[0]] ?? 0;
    return bet.amount / Math.max(p, 1e-9);
  }
  const p = orderProb(bet.horseIds);
  return (bet.amount * parlayBonus(bet.horseIds.length)) / Math.max(p, 1e-9);
}

export function hits(bet, finishIds) {
  if (finishIds.length < bet.horseIds.length) return false;
  return sameIds(finishIds.slice(0, bet.horseIds.length), bet.horseIds);
}

export function anyTicketHits(pool, finishIds) {
  return pool.bets.some((b) => hits(b, finishIds));
}

// Pay the whole pool to hitting tickets, split by claim weight.
// If nobody hits, refund every stake. Returns [[bet, payout], ...].
export function settle(pool, finishIds, pWin, orderProb) {
  const poolTotal = totalPool(pool);
  if (poolTotal <= 0) return [];

  const winning = pool.bets.filter((b) => hits(b, finishIds));
  if (!winning.length) return pool.bets.map((b) => [b, b.amount]);

  const weights = new Map(winning.map((b) => [b, claimWeight(b, pWin, orderProb)]));
  let totalW = 0;
  for (const w of weights.values()) totalW += w;
  return pool.bets.map((bet) => {
    const w = weights.get(bet);
    return [bet, w !== undefined && totalW > 0 ? poolTotal * (w / totalW) : 0];
  });
}

// Player totals for hitting tickets only (no loss lines).
export function payoutsByPlayer(pool, finishIds, pWin, orderProb) {
  if (!anyTicketHits(pool, finishIds)) return [];
  const grouped = new Map();
  for (const [bet, payout] of settle(pool, finishIds, pWin, orderProb)) {
    if (payout <= 0.005) continue;
    if (!grouped.has(bet.playerNumber)) {
      grouped.set(bet.playerNumber, { playerNumber: bet.playerNumber, personName: bet.personName, amount: 0 });
    }
    const row = grouped.get(bet.playerNumber);
    row.amount += payout;
    if (bet.personName) row.personName = bet.personName;
  }
  return [...grouped.values()].sort((a, b) => b.amount - a.amount || a.playerNumber - b.playerNumber);
}

// Live win-bet multiplier. Always a number when possible, even with no bets on
// this horse yet (a new wager would take the unbacked share, or 1/p_win if empty).
export function displayedWinMultiplier(pool, horseId, pWin = null, probeWager = 1) {
  const wager = probeWager > 0 ? probeWager : 1;
  const onHorse = amountOnWin(pool, horseId);
  const total = totalPool(pool);
  if (onHorse > 0 && total > 0) return total / onHorse;
  if (total > 0) return (total + wager) / wager;
  if (pWin && horseId in pWin) return 1 / Math.max(pWin[horseId], 1e-9);
  return null;
}

// Estimated multiplier for the ticket being built. Win tickets use the live
// pool price. Parlays use order probability times a bonus, scaled into the pool.
export function displayedTicketMultiplier(pool, horseIds, horses, pWin) {
  if (!horseIds.length) return null;
  const ids = [...horseIds];
  if (ids.length === 1) return displayedWinMultiplier(pool, ids[0], pWin);

  const pOrder = orderProbability(horses, ids);
  const fair = parlayBonus(ids.length) / Math.max(pOrder, 1e-9);
  // If this exact order hits, win bets on the first horse also cash.
  const first = ids[0];
  const winMoney = pool.bets
    .filter((b) => sameIds(b.horseIds, [first]))
    .reduce((s, b) => s + b.amount, 0);
  const parlayMoney = pool.bets.filter((b) => sameIds(b.horseIds, ids)).reduce((s, b) => s + b.amount, 0);
  const firstP = Math.max(pWin[first] ?? 0, 1e-9);
  const winClaims = winMoney ? winMoney / firstP : 0;
  const parlayClaims = parlayMoney * fair;
  // A new $1 on this parlay adds `fair` claims.
  const totalClaims = winClaims + parlayClaims + fair;
  if (totalClaims <= 0) return null;
  return (totalPool(pool) + 1) * (fair / totalClaims);
}
