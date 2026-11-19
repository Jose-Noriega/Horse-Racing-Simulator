// Crowd stress test. Open the game with ?sim (or ?sim=250) and every race's
// betting screen opens with that many players' bets already in the pool.
// Every horse is picked at random, weighted by its win chance. The crowd mix
// (who bets twice, three times, or a parlay) is MIX below.
// You still click through every screen yourself: Start Race, Go, results, payouts.
// Run window.simFill() in the console to add another round of bets to the current race.

import { addBet } from "./betting.js";
import { MAX_PARLAY_LEGS } from "./settings.js";

const FIRST = ["Ann", "Bo", "Cy", "Dee", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jo", "Kai", "Lu", "Max", "Nia", "Oz", "Pia",
  "Quin", "Rae", "Sal", "Tia", "Uma", "Vic", "Wes", "Xan", "Yara", "Zed"];
const AMOUNTS = [5, 5, 10, 10, 10, 20, 20, 25, 50, 100];

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

// Weighted draw from the horses not yet picked.
function pickHorse(field, winProbs, exclude) {
  const options = field.filter((h) => !exclude.includes(h.id));
  const total = options.reduce((s, h) => s + winProbs[h.id], 0);
  let r = Math.random() * total;
  for (const h of options) {
    r -= winProbs[h.id];
    if (r <= 0) return h.id;
  }
  return options[options.length - 1].id;
}

// What each share of the crowd does at the window (out of 100, scaled to the crowd size):
// 30 bet twice and 20 bet three times, every bet a win bet on a different horse.
// 10 make one 3-horse parlay. The rest place one win bet.
const MIX = [
  { share: 0.3, tickets: 2, legs: 1 },
  { share: 0.2, tickets: 3, legs: 1 },
  { share: 0.1, tickets: 1, legs: Math.min(3, MAX_PARLAY_LEGS) },
];

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function fillPool(game, players) {
  // Hand out roles at random each race, so a different 30 bet twice every time.
  const roles = [];
  for (const m of MIX) for (let k = 0; k < Math.round(players * m.share); k++) roles.push(m);
  while (roles.length < players) roles.push({ tickets: 1, legs: 1 });
  shuffle(roles).length = players; // rounding can overshoot on a tiny crowd
  // Players come up to the window in random order and place all their tickets in one go.
  const order = shuffle(Array.from({ length: players }, (_, i) => i + 1));
  order.forEach((n, k) => {
    const { tickets, legs } = roles[k];
    // A name the first time a number shows up. After that the game remembers it.
    const name = game.pool.playerNames.has(n) ? "" : `${FIRST[(n - 1) % FIRST.length]} ${Math.ceil(n / FIRST.length)}`;
    const used = []; // this player's horses so far: no horse twice
    for (let t = 0; t < tickets; t++) {
      const ids = [];
      while (ids.length < legs) ids.push(pickHorse(game.field, game.winProbs, [...used, ...ids]));
      used.push(...ids);
      addBet(game.pool, n, t === 0 ? name : "", ids, pickOne(AMOUNTS));
    }
  });
  game.betScroll = 0;
  game.statusMessage = `Sim: ${players} players, ${game.pool.bets.length} tickets`;
}

export function installSim(game, players) {
  const load = game.loadCurrentField.bind(game);
  game.loadCurrentField = () => {
    load();
    if (game.state !== "menu") fillPool(game, players);
  };
  // beginCard loads the field while still on the menu, so fill when it switches to betting.
  const begin = game.beginCard.bind(game);
  game.beginCard = () => {
    begin();
    fillPool(game, players);
  };
  window.simFill = () => fillPool(game, players);
  console.log(`Sim mode: ${players} players per race. simFill() adds another round.`);
}
