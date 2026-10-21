// Art state and effects for the betting screen: coins, stamps, bookie moods and quips.
// The game never calls into this for logic. It only watches what the game already
// does (status messages, picks, state changes) and reacts.

import { PAL, coin, inkText, easeOut, easeBack, clamp01, puff, inkStar } from "./art.js";

const IDLE_QUIPS = [
  "Hay's cheap. The odds are not.",
  "My cousin's horse? Sure thing.",
  "Pick the one in the hat. Trust me.",
  "Cash only. Or vibes.",
  "I have never lost a coin flip. Ask me about the others.",
  "Every horse is a winner. Technically.",
  "Psst. The gray one looks nervous.",
  "No refunds. (Refunds sometimes.)",
  "Bet big. Cry later.",
];
const CASH_QUIPS = ["KA-CHING!", "Smart money!", "Brave. Very brave.", "I'll hold onto that for you.", "Pleasure doing business!", "Your funeral. Er, good luck!"];

const pick = (art, list) => list[art.quipCount++ % list.length];

// Every message the game sets that is not one of these is a rejected bet.
const OK_MESSAGE = /^(Win|Parlay) |^Bet undone|^Picks cleared/;

function errorQuip(msg) {
  if (/Pick a horse/i.test(msg)) return "Pick a horse, genius.";
  if (/player number/i.test(msg)) return "Who are you? I need a number.";
  if (/wager/i.test(msg)) return "How much? Say a number.";
  if (/Max \d/i.test(msg)) return "Three legs max. This ain't a centipede.";
  if (/Nothing to undo/i.test(msg)) return "Nothing to undo. Relax.";
  if (/different/i.test(msg)) return "Same horse twice? Nice try.";
  return "That's not a bet, that's a doodle.";
}

export function createArt(g) {
  const art = {
    cache: {}, // offscreen layers by name
    coins: [], // flying coins
    stamps: [], // big stamps like NOPE!
    puffs: [], // little smoke puffs
    quipCount: 0,
    say: "",
    sayUntil: 0,
    talkUntil: 0,
    mood: "smug",
    moodUntil: 0,
    nextIdle: 4,
    shakeUntil: 0,
    poolBumpAt: -9,
    lastSel: 0,
    lastState: null,
  };
  g.art = art;
  // Hack: swap statusMessage for a getter/setter so we see every assignment, even a
  // repeat of the same text. Plain value comparison would miss a second identical error.
  let msg = g.statusMessage ?? "";
  Object.defineProperty(g, "statusMessage", {
    configurable: true,
    get: () => msg,
    set: (v) => {
      msg = v;
      if (v) onStatus(g, art, v);
    },
  });
  return art;
}

function say(g, art, text, secs = 3.2, mood = null, moodSecs = 1.2) {
  art.say = text;
  art.sayUntil = g.time + secs;
  art.talkUntil = g.time + Math.min(secs, 1.6);
  if (mood) {
    art.mood = mood;
    art.moodUntil = g.time + moodSecs;
  }
  art.nextIdle = g.time + secs + 4;
}

function onStatus(g, art, msg) {
  if (g.state !== "betting") return;
  if (/^(Win|Parlay) /.test(msg)) {
    spawnCoins(g, art);
    say(g, art, pick(art, CASH_QUIPS), 2.6, "cash", 1.3);
  } else if (/^Bet undone/.test(msg)) {
    puffAt(g, art, g.btnUndoBet.x + g.btnUndoBet.w / 2, g.btnUndoBet.y + 4);
    say(g, art, "Never happened.", 2.2, "wink", 1);
  } else if (/^Picks cleared/.test(msg)) {
    say(g, art, "Fresh slate!", 2, "smug", 1);
  } else if (!OK_MESSAGE.test(msg)) {
    art.shakeUntil = g.time + 0.45;
    art.stamps.push({ text: "NOPE!", x: 680, y: 150, born: g.time, life: 1.3, rot: -0.2 });
    say(g, art, errorQuip(msg), 3, "shock", 1.4);
  }
}

function puffAt(g, art, x, y) {
  for (let i = 0; i < 4; i++) art.puffs.push({ x: x + (i - 1.5) * 9, y, born: g.time + i * 0.04, life: 0.6 });
}

// Coins arc from the Place Bet button to the pool total. A few chips ride along.
function spawnCoins(g, art) {
  const b = g.btnPlaceBet;
  const from = { x: b.x + b.w / 2, y: b.y + 10 };
  const to = { x: 1060, y: 128 };
  for (let i = 0; i < 9; i++) {
    art.coins.push({
      born: g.time + i * 0.05,
      life: 0.75 + (i % 3) * 0.08,
      from: { x: from.x + (i - 4) * 4, y: from.y },
      to: { x: to.x + (i % 3) * 14 - 14, y: to.y },
      h: 90 + (i % 4) * 26,
      chip: i % 4 === 3,
    });
  }
}

// Call once a frame, after the game's own update.
export function updateArt(g, dt) {
  const art = g.art;
  const now = g.time;
  if (g.state !== art.lastState) {
    if (g.state === "betting") {
      say(g, art, `Race ${g.raceIndex + 1}. Step right up!`, 3.4, "smug");
    }
    art.lastState = g.state;
  }
  if (g.state !== "betting") return;

  if (art.mood !== "smug" && now > art.moodUntil) art.mood = "smug";
  if (g.selectedLanes.length !== art.lastSel) {
    if (g.selectedLanes.length === 2 && art.lastSel < 2) say(g, art, "A parlay! Ambitious. I like it.", 3);
    if (g.selectedLanes.length === 3 && art.lastSel < 3) say(g, art, "Three legs. You absolute maniac.", 3);
    art.lastSel = g.selectedLanes.length;
  }
  if (now > art.sayUntil && now > art.nextIdle) {
    say(g, art, pick(art, IDLE_QUIPS), 4.2);
  }
  art.coins = art.coins.filter((c) => now - c.born < c.life + 0.4);
  art.stamps = art.stamps.filter((s) => now - s.born < s.life);
  art.puffs = art.puffs.filter((p) => now - p.born < p.life);
  for (const c of art.coins) {
    if (!c.landed && now - c.born >= c.life) {
      c.landed = true;
      art.poolBumpAt = now;
    }
  }
}

// What the bookie shows right now: the line he is saying, or null if he is quiet.
export function bookieLine(g) {
  const art = g.art;
  return g.time < art.sayUntil ? art.say : null;
}

// Offset to wobble the slip when a bet is rejected. 0 when calm.
export function shakeOffset(g) {
  const left = g.art.shakeUntil - g.time;
  if (left <= 0) return 0;
  return Math.sin(left * 70) * 5 * (left / 0.45);
}

// 0..1 pulse for the pool total right after a coin lands.
export function poolBump(g) {
  return 1 - clamp01((g.time - g.art.poolBumpAt) / 0.35);
}

// Coins, puffs and stamps on top of the betting screen.
export function drawBettingFx(g) {
  const { ctx, art, time: now } = g;
  for (const p of art.puffs) {
    const k = (now - p.born) / p.life;
    if (k < 0 || k > 1) continue;
    puff(ctx, p.x, p.y - k * 18, 7 + k * 8, "#fff", 1 - k);
  }
  for (const c of art.coins) {
    const k = (now - c.born) / c.life;
    if (k < 0) continue;
    if (k > 1) {
      // landing sparkle
      const s = clamp01((k - 1) / 0.4);
      inkStar(ctx, c.to.x, c.to.y, 9 * (1 - s) + 2, PAL.gold, 1.4, k * 4);
      continue;
    }
    const x = c.from.x + (c.to.x - c.from.x) * easeOut(k);
    const y = c.from.y + (c.to.y - c.from.y) * k - Math.sin(k * Math.PI) * c.h;
    if (c.chip) {
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#e8433a";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#1c1226";
      ctx.stroke();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      coin(ctx, x, y, 8, Math.abs(Math.cos(k * 12)) * 0.8 + 0.2);
    }
  }
  for (const s of art.stamps) {
    const age = now - s.born;
    const pop = easeBack(age / 0.18);
    const fade = 1 - clamp01((age - (s.life - 0.4)) / 0.4);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.scale(pop, pop);
    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.roundRect(-70, -30, 140, 60, 8);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#e8433a";
    ctx.stroke();
    inkText(ctx, s.text, 0, 2, 46, "#e8433a", { align: "center", sw: 0 });
    ctx.restore();
  }
}

// Cache an offscreen layer. draw(ctx2) paints in logical 1280x720 units.
// Rebuilt when the canvas backing size changes. Hack: keyed by name only, so two
// different looks need two names.
export function getLayer(g, name, draw) {
  const w = g.canvas.width;
  const h = g.canvas.height;
  const hit = g.art.cache[name];
  if (hit && hit.canvas.width === w && hit.canvas.height === h) return hit.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c2 = canvas.getContext("2d");
  c2.setTransform(g.pixelScale, 0, 0, g.pixelScale, 0, 0);
  draw(c2);
  g.art.cache[name] = { canvas };
  return canvas;
}
