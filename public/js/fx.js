// Art state and effects for the betting screen: coins, stamps and the bookie.
// The game never calls into this for logic. It only watches what the game already
// does (status messages, picks, state changes) and reacts.
// What the bookie says lives in words.js. He talks rarely on purpose.

import { PAL, coin, inkText, easeOut, easeBack, clamp01, puff, inkStar } from "./art.js";
import { updateRaceFx } from "./racefx.js";
import { betLine, errorLine, isMistake, openingLines, statusKind, undoLine } from "./words.js";

export function createArt(g) {
  const art = {
    cache: {}, // offscreen layers by name
    coins: [], // flying coins
    stamps: [], // big stamps like NOPE!
    puffs: [], // little smoke puffs
    say: "",
    sayUntil: 0,
    talkUntil: 0,
    queue: [], // lines waiting for the current one to finish
    mood: "smug",
    moodUntil: 0,
    undoStreak: 0, // undos in a row
    errKind: null, // the last mistake, and how many times in a row
    errCount: 0,
    lastRefund: false, // was the race we just left a refund
    shakeUntil: 0,
    poolBumpAt: -9,
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
  if (mood) setMood(g, art, mood, moodSecs);
}

// A face with no words. Most events are only this.
function setMood(g, art, mood, secs) {
  art.mood = mood;
  art.moodUntil = g.time + secs;
}

// The bet that was just placed, as plain values for betLine.
function describeBet(g) {
  const last = g.pool.undoStack[g.pool.undoStack.length - 1];
  if (!last) return null;
  const single = last.horseIds.length === 1 ? g.field.find((h) => h.id === last.horseIds[0]) : null;
  return {
    amount: last.amount,
    horseIds: last.horseIds,
    horseName: single?.name,
    winProbs: g.winProbs,
    isFirst: g.pool.undoStack.length === 1,
  };
}

function onStatus(g, art, msg) {
  if (g.state !== "betting") return;
  const kind = statusKind(msg);
  if (kind === "bet") {
    spawnCoins(g, art);
    art.undoStreak = 0;
    art.errKind = null;
    const bet = describeBet(g);
    const line = bet && betLine(bet);
    if (line) say(g, art, line, 3, "cash", 1.3);
    else setMood(g, art, "cash", 1.3);
  } else if (kind === "undone") {
    puffAt(g, art, g.btnUndoBet.x + g.btnUndoBet.w / 2, g.btnUndoBet.y + 4);
    art.undoStreak++;
    const line = undoLine(art.undoStreak);
    if (line) say(g, art, line, 2.6, "wink", 1);
    else setMood(g, art, "wink", 1);
  } else if (kind === "cleared") {
    art.undoStreak = 0;
  } else if (isMistake(msg)) {
    art.shakeUntil = g.time + 0.45;
    art.stamps.push({ text: "NOPE!", x: 680, y: 150, born: g.time, life: 1.3, rot: -0.2 });
    art.errCount = kind === art.errKind ? art.errCount + 1 : 1;
    art.errKind = kind;
    const line = errorLine(kind, art.errCount);
    if (line) say(g, art, line, 3, "shock", 1.4);
    else setMood(g, art, "shock", 1.4);
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
  if (g.state === "results") art.lastRefund = g.poolRefunded; // the game clears it when the next race loads
  if (g.state !== art.lastState) {
    // A race opens (from the menu or from results, not from "Back to Bets"). One line,
    // or two after a refund. The second waits for the first.
    if (g.state === "betting" && (art.lastState === "menu" || art.lastState === "results")) {
      const [first, ...rest] = openingLines({ raceIndex: g.raceIndex, lastRefund: art.lastRefund });
      say(g, art, first, 3.8, "smug");
      art.queue = rest;
    }
    art.lastState = g.state;
  }
  if (g.state !== "betting") {
    updateRaceFx(g, dt);
    return;
  }

  if (art.mood !== "smug" && now > art.moodUntil) art.mood = "smug";
  if (art.queue.length && now > art.sayUntil) say(g, art, art.queue.shift(), 3.8);
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
