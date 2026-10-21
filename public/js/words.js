// All the words in the game, in one place. Edit the text here.
// Pure code. A context goes in and a line (or null) comes out. No canvas, no DOM,
// no clock. rng is a () => [0, 1) function so tests can pin it.
//
// Three running bits grow over the card, picked by race number:
//   gerald  (announcer): a man in the stands who ends up somewhere else
//   the goose (bookie): something at his home that gets out
//   the duck and the chicken: the same, smaller
// Dialogue is rare on purpose. Most events get no line at all. The numbers for how
// rare are the *_CHANCE and *_GAP constants below.

import { TOTAL_HORSES } from "./settings.js";

// --- small helpers -----------------------------------------------------------

// One entry per race. A card longer than the list keeps the last one.
export const byRace = (list, raceIndex) => list[Math.min(Math.max(raceIndex, 0), list.length - 1)];

// "{n} wins" + { n: "Colin" } -> "Colin wins"
export const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

// Pick from a pool, never one of the last few picks. memory is a plain object
// the caller keeps. key says which pool. A pool of 1 just returns its one line.
export function pickFresh(memory, key, pool, rng = Math.random) {
  const recent = (memory[key] ??= []);
  const keep = Math.min(2, pool.length - 1);
  const fresh = pool.map((_, i) => i).filter((i) => !recent.includes(i));
  const i = fresh[Math.floor(rng() * fresh.length)] ?? 0;
  recent.push(i);
  while (recent.length > keep) recent.shift();
  return pool[i];
}

// --- how rare ----------------------------------------------------------------

export const ANNOUNCER_GAP = 8; // seconds between announcer lines, unless it is a big moment
export const BET_LINE_CHANCE = 0.5; // a special bet gets a bookie line this often
export const UNDO_LINE_CHANCE = 0.5;
export const LONGSHOT_LINE_CHANCE = 0.4; // "has been through a lot" before a race
export const DUCK_EVERY = 40; // seconds between duck lines

// --- the announcer -------------------------------------------------------------

// One per race, said while the horses line up.
export const GERALD = [
  "there is a man in the stands named gerald. he is fine.",
  "gerald has moved closer to the track. he is fine.",
  "gerald is not fine. he is in the pond. the duck knows.",
  "gerald has been asked to leave the pond. he is on the track.",
  "we are no longer talking about gerald.",
  "gerald is back. he has a sandwich. it is not for you.",
  "i can see gerald in every seat.",
  "gerald is the goose. the man was never gerald. i'm sorry.",
];

export const BOOMS = ["BOOM!", "WHOOPS", "OOPS!", "NO."];

const MID_LINES = [
  "{last} is in last and i'm so proud of them.",
  "there is a pigeon on the track. he's fine. he's working.",
];
const PHOTO_LINES = [
  "photo finish. we are looking at the photo. the photo is of a horse.",
  "photo finish. both horses are being very brave.",
];
const EXPLODE_LINES = [
  "oh. {n} is a cloud now.",
  "a horse has exploded. please stay seated. the horse has not.",
];

export const lineupLine = ({ raceIndex }) => byRace(GERALD, raceIndex);

// Said as the countdown starts. Usually nothing.
export function countdownLine({ poolEmpty, longshotName }, rng = Math.random) {
  if (poolEmpty) return "nobody has bet. the horses are doing this on their own.";
  if (longshotName && rng() < LONGSHOT_LINE_CHANCE) return fill("{n} has been through a lot.", { n: longshotName });
  return null;
}

// Only race 1. After that the gun is enough.
export const startLine = ({ raceIndex }) => (raceIndex === 0 ? "THEY'RE RUNNING! WITH THEIR LEGS!" : null);

// Only when the horse with the worst chance goes in front.
export const leadLine = ({ leaderName, leaderIsLongshot }) =>
  leaderIsLongshot ? fill("{n} is winning and has no idea.", { n: leaderName }) : null;

// At most once a race. If the favorite is last, that is the line.
export function midLine({ lastName, favName, favIsLast }, rng = Math.random, memory = {}) {
  if (favIsLast) return fill("{n} is last. {n} is the favorite. i have no notes.", { n: favName });
  return fill(pickFresh(memory, "mid", MID_LINES, rng), { last: lastName });
}

// The winner is always announced. A longshot gets a little more.
export function winnerLine({ name, pct, isLongshot }) {
  if (isLongshot) return fill("{n} wins. {p} percent. it's a bad day for the number.", { n: name, p: pct });
  return fill("{n} WINS!", { n: name });
}

export const photoLine = (rng = Math.random, memory = {}) => pickFresh(memory, "photo", PHOTO_LINES, rng);
export const lastPlaceLine = ({ favName }) => fill("{n} finished last. it's okay buddy.", { n: favName });
export const explodeLine = ({ name }, rng = Math.random, memory = {}) =>
  fill(pickFresh(memory, "boom", EXPLODE_LINES, rng), { n: name });

// --- the bookie ----------------------------------------------------------------

// One fragment when each race opens. His situation at home gets worse.
export const GOOSE = [
  "welcome. window 3. i've been here since before the window.",
  "my brother sends me postcards. they're all of the same field.",
  "i have a goose at home. it has my keys.",
  "the goose has learned to drive. i'm not saying it's bad.",
  "i got a letter. it was from the goose. very polite.",
  "i saw the goose on the news. it did well.",
  "the goose is coming here. i don't know when.",
  "the goose is at window 2. window 2 has never been open.",
];
const REFUND_LINE = "everyone got their money back. it felt wrong. like a cold spoon.";

// What the bookie says when a race opens. One line, or two when the last race was
// a refund (the goose fragment follows the refund line).
export function openingLines({ raceIndex, lastRefund }) {
  const goose = byRace(GOOSE, raceIndex);
  return lastRefund && raceIndex > 0 ? [REFUND_LINE, goose] : [goose];
}

// A line for a bet that stands out. Most bets get none.
// bet: { amount, horseIds, horseName (win bets only), winProbs: id -> chance, isFirst }
export function betLine(bet, rng = Math.random) {
  const ids = Object.keys(bet.winProbs).map(Number);
  const favId = ids.reduce((a, b) => (bet.winProbs[a] >= bet.winProbs[b] ? a : b));
  const longId = ids.reduce((a, b) => (bet.winProbs[a] <= bet.winProbs[b] ? a : b));
  const single = bet.horseIds.length === 1 ? bet.horseIds[0] : null;
  let line = null;
  if (single !== null && single === favId) line = "{h}. i know that one. it's afraid of buckets.";
  else if (single !== null && single === longId) line = "{h}. they'll be so happy you picked them.";
  else if (bet.amount <= 1) line = "one dollar. good. that's a good amount.";
  else if (bet.amount >= 100) line = "that's a lot. i'll put it somewhere safe.";
  else if (bet.isFirst) line = "i've written that on my arm.";
  if (line === null || rng() >= BET_LINE_CHANCE) return null;
  return fill(line, { h: bet.horseName ?? "" });
}

export function undoLine(streak, rng = Math.random) {
  if (streak >= 3) return "i'm just going to stand here.";
  return rng() < UNDO_LINE_CHANCE ? "okay. it was never there." : null;
}

// Only a few mistakes get the bookie's voice. The others get the stamp and the
// chalkboard. repeat is how many times in a row this same mistake has happened.
export function errorLine(kind, repeat) {
  if (repeat > 0 && repeat % 3 === 0) return "ok.";
  if (kind === "legs") return "three. that's the most. i didn't make this rule. i found it.";
  if (kind === "nothingToUndo") return "there's nothing to undo. you have to do something first.";
  return null;
}

// --- the chalkboard (the status line) ------------------------------------------

// The game and betting.js set these as the status message. statusKind() turns a
// message back into its key, so the art can tell a mistake from good news.
export const STATUS = {
  noField: "there is no field. nobody is here.",
  noPick: "no horse. horses are on the left.",
  noPlayer: "i need a number. any number. the top box.",
  badWager: "that is not an amount.",
  legs: "three horses is the most. i found the rule here.", // test/words.test.js checks MAX_PARLAY_LEGS is still 3
  zeroWager: "more than zero please. zero is a hole.",
  zeroPlayer: "player zero is not a person.",
  dupHorse: "a horse can only finish once. i think.",
  nothingToUndo: "nothing to undo.",
  cleared: "picks cleared. they didn't say anything.",
  undone: "bet undone. it's fine. it was never there.",
};

const GOOD = new Set(["bet", "undone", "cleared"]);

// "bet" for a placed bet ("Win #1 Ann: ..."), a STATUS key, or "other".
export function statusKind(msg) {
  if (/^(Win|Parlay) /.test(msg)) return "bet";
  return Object.keys(STATUS).find((k) => STATUS[k] === msg) ?? "other";
}

// Anything that is not good news is a rejected bet.
export const isMistake = (msg) => !GOOD.has(statusKind(msg));

// --- scenery ---------------------------------------------------------------------

// [name, tagline]. An ad for something that makes no sense, played straight.
export const SPONSORS = [
  ["CALL 555-0143", "ASK FOR GERALD"],
  ["CHAIRS", "WE HAVE THE CHAIRS"],
  ["RICHARD'S ROOM", "A ROOM. BY RICHARD."],
  ["WE BUY HATS", "ANY HAT. ANY CONDITION."],
  ["THE LAKE", "COME BACK TO THE LAKE"],
  ["TALL DOOR CO.", "TALLER THAN YOU'D THINK"],
];

export const DUCK = [
  "quack",
  "quack.",
  "gerald was here",
  "i saw what you did",
  "the pond has rules",
  "i am not a duck",
  "i know your name",
  "(the duck stares)",
];

export const CHICKEN = [
  "bawk",
  "just passing",
  "is this the way",
  "i forgot why i came",
  "i don't want to be here",
  "tell my mom",
  "i see it now",
  "bye",
];

// --- screens ---------------------------------------------------------------------

// The burst on the menu. One is picked each time the page loads.
export const BADGES = [
  ["NOW WITH", `${TOTAL_HORSES} HORSES!`],
  ["THERE ARE", "HORSES"],
  ["CONTAINS", "ONE (1) HORSE"],
];

export const PLATES = ["WINDOW 3", "NO REFUNDS*", "*ASK THE GOOSE"];
export const PICK_HINT = "pick a horse. there are horses.";
export const NO_BETS = "(nothing)";
export const REFUND_BUBBLE = ["No winners.", "Wagers returned.", "Nobody is sure what happened."];
export const NO_BETS_BUBBLE = ["No bets.", "The horses did that for free."];
export const CORNER_TITLE = "ALSO HERE";
export const DNF_NOTE = "is a cloud now";
export const SUMMARY_NONE = "the goose is pleased."; // sits under a "No payouts." heading
