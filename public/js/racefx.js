// The race screen, Flash style: the field, dust, speed lines, the announcer and his
// quips, confetti, photo finish, cartoon explosions, the finish board, the iris wipe.
// The game still runs the race. This file only reads its state and draws.

import * as settings from "./settings.js";
import {
  INK, PAL, BODY, shade, hash, easeOut, easeBack, clamp01, inkText, plainText, fitText, wrapText, bubble, panel, ribbon,
  inkCircle, inkEllipse, inkRect, inkFill, inkStar, burst, puff,
} from "./art.js";
import { drawHorse, drawPortrait } from "./characters.js";
import { drawScenery, drawGags, drawSky } from "./scenery.js";
import { drawCrowd } from "./crowd.js";
import { stridePhase } from "./sprites.js";

const W = settings.SCREEN_WIDTH;
const H = settings.SCREEN_HEIGHT;
const N = settings.HORSES_PER_RACE;
const RACES = settings.RACES_PER_SESSION;
const CONFETTI = [PAL.red, PAL.gold, PAL.blue, PAL.green, PAL.pink, "#ffffff", PAL.orange];
const BOOMS = ["BOOM!", "KA-BLAM!", "POW!", "KABOOM!", "OOPS!"];

const pickOf = (list) => list[Math.floor(Math.random() * list.length)];

function freshRace() {
  return {
    lastState: null,
    say: "",
    sayUntil: 0,
    lastSayAt: -9,
    prio: 0,
    nextMid: 0,
    leader: null,
    finishedCount: 0,
    counted: false,
    winnerId: null,
    winnerAt: -9,
    photoAt: -9,
    flashAt: -9,
    zoomAt: -9,
    showerUntil: 0,
    explodedSeen: new Set(),
    explodedAt: new Map(),
    blastsSeen: new WeakSet(),
    booms: [],
    confetti: [],
    boomCount: 0,
  };
}

function raceArt(g) {
  return (g.art.race ??= freshRace());
}

function say(g, r, text, secs = 2.8, prio = 1) {
  const now = g.time;
  if (now < r.sayUntil && prio < r.prio) return;
  if (now - r.lastSayAt < 1.2 && prio < 3) return;
  r.say = text;
  r.sayUntil = now + secs;
  r.prio = prio;
  r.lastSayAt = now;
}

function confettiBurst(r, x, y, count, spread = 1) {
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4 * spread;
    const sp = 140 + Math.random() * 360;
    r.confetti.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
      w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, color: pickOf(CONFETTI), life: 2.4 + Math.random() * 1.2, age: 0,
    });
  }
}

// Pieces that start above the screen and drift down.
function confettiRain(r, count) {
  for (let i = 0; i < count; i++) {
    r.confetti.push({
      x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 80, vy: 40 + Math.random() * 120, rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 14, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, color: pickOf(CONFETTI), life: 3.2, age: 0,
    });
  }
}

const nameOf = (g, id) => g.field.find((h) => h.id === id)?.name ?? "somebody";

// Called every frame from fx.updateArt for every screen that is not betting.
export function updateRaceFx(g, dt) {
  const r = raceArt(g);
  const now = g.time;
  if (g.state !== r.lastState) {
    const showerUntil = r.showerUntil;
    if (g.state === "setup") {
      const keep = r.confetti;
      Object.assign(r, freshRace(), { confetti: keep });
      say(g, r, pickOf([`Race ${g.raceIndex + 1}! The horses are lining up.`, "Everyone stay calm. The horses are calm. You are not.", "All bets are final. Probably."]), 3.6, 1);
    } else if (g.state === "race") {
      say(g, r, pickOf(["AND THEY'RE OFF!", "THEY'RE RUNNING! WITH THEIR LEGS!"]), 2.4, 3);
      r.nextMid = now + 5;
    } else if (g.state === "results" && r.winnerId !== null) {
      r.showerUntil = now + 1.4;
    } else {
      r.showerUntil = showerUntil;
    }
    r.lastState = g.state;
  }
  if (g.state === "setup" && g.countdown !== null && !r.counted) {
    r.counted = true;
    say(g, r, "Here we go...", 2.4, 2);
  }

  if (g.state === "race") {
    // lead changes
    const lead = g.passOrder[0];
    const lh = g.field.find((h) => h.id === lead);
    if (lead !== undefined && lead !== r.leader && lh && lh.progress > 0.12 && !lh.finished) {
      if (r.leader !== null) say(g, r, pickOf([`${nameOf(g, lead)} takes the lead!`, `${nameOf(g, lead)} pulls ahead!`, `Here comes ${nameOf(g, lead)}!`]), 2.2, 1);
      r.leader = lead;
    }
    // new finishers
    const done = g.field.filter((h) => h.finished && !g.exploded.has(h.id));
    if (done.length > r.finishedCount) {
      if (r.finishedCount === 0) {
        const win = g.field.find((h) => h.place === 1) ?? done[0];
        r.winnerId = win.id;
        r.winnerAt = now;
        r.zoomAt = now;
        confettiBurst(r, 410, win.y, 110);
        say(g, r, `${win.name} WINS!`, 3.2, 3);
      }
      if (r.finishedCount < 2 && done.length >= 2 && g.raceResult && !g.exploded.size) {
        const [a, b] = g.raceResult.ordered;
        if (g.visualFinishTime(b) - g.visualFinishTime(a) < 0.4) {
          r.photoAt = now;
          r.flashAt = now;
          say(g, r, "PHOTO FINISH! Nobody knows anything!", 3.2, 3);
        }
      }
      if (done.length === g.field.length - g.exploded.size && done.length > 1) {
        say(g, r, "And everybody else is also here. Great.", 2.6, 1);
      }
      r.finishedCount = done.length;
    }
    // explosions
    for (const id of g.exploded) {
      if (!r.explodedSeen.has(id)) {
        r.explodedSeen.add(id);
        r.explodedAt.set(id, now);
        say(g, r, pickOf(["OH NO.", "Well. That's not in the brochure.", "Is that... allowed?", "Someone call the horse doctor!"]), 2.8, 3);
      }
    }
    for (const b of g.blasts) {
      if (!r.blastsSeen.has(b)) {
        r.blastsSeen.add(b);
        r.booms.push({ x: b.x, y: b.y, at: now - b.age, text: BOOMS[r.boomCount++ % BOOMS.length], rot: (Math.random() - 0.5) * 0.5 });
      }
    }
    r.booms = r.booms.filter((b) => now - b.at < 1.3);
    // flavor between events
    if (now > r.nextMid && now > r.sayUntil && !g.raceFinished) {
      const last = g.passOrder[g.passOrder.length - 1];
      say(g, r, pickOf(["THAT'S A LOT OF HORSE", "Neck and neck! Mostly neck.", `Somebody check on ${nameOf(g, last)}.`, `${nameOf(g, last)} is in last. Bold strategy.`, "Hooves everywhere!", "I've lost track. Who's winning?"]), 3, 1);
      r.nextMid = now + 5 + Math.random() * 3;
    }
  }

  // confetti physics. A shower from the top on the results screen.
  if (now < r.showerUntil) confettiRain(r, 3);
  for (const c of r.confetti) {
    c.age += dt;
    c.vy += 420 * dt;
    c.vx *= 1 - 1.4 * dt;
    c.vy *= 1 - 0.9 * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.rot += c.vr * dt;
  }
  r.confetti = r.confetti.filter((c) => c.age < c.life && c.y < H + 20);
}

// --- the announcer ---------------------------------------------------------

function drawAnnouncer(c, x, y, t, talking, excited) {
  const bob = Math.sin(t * 3) * 1.2 + (excited ? Math.abs(Math.sin(t * 16)) * 3 : 0);
  c.save();
  c.translate(x, y + bob);
  inkRect(c, -22, 14, 44, 30, 10, "#2c5fb3", 2.6);
  c.beginPath();
  c.moveTo(-6, 14);
  c.lineTo(0, 30);
  c.lineTo(6, 14);
  c.closePath();
  inkFill(c, "#fff", 2);
  c.beginPath();
  c.moveTo(0, 22);
  c.lineTo(-8, 18);
  c.lineTo(-8, 26);
  c.closePath();
  c.moveTo(0, 22);
  c.lineTo(8, 18);
  c.lineTo(8, 26);
  c.closePath();
  inkFill(c, PAL.red, 1.6);
  inkEllipse(c, 0, 0, 19, 18, "#f2c29b", 2.6);
  // big swoopy hair
  c.beginPath();
  c.moveTo(-19, -4);
  c.quadraticCurveTo(-20, -26, 2, -22);
  c.quadraticCurveTo(22, -26, 19, -4);
  c.quadraticCurveTo(8, -14, -19, -4);
  c.closePath();
  inkFill(c, "#e8b030", 2.4);
  // eyes
  for (const ex of [-6, 6]) {
    inkEllipse(c, ex, -2, excited ? 4.6 : 3.8, excited ? 5.6 : 4.4, "#fff", 1.6);
    c.fillStyle = INK;
    c.beginPath();
    c.arc(ex + 1, -1.6, 1.5, 0, Math.PI * 2);
    c.fill();
  }
  // mouth
  c.fillStyle = "#5a1010";
  c.strokeStyle = INK;
  c.lineWidth = 1.6;
  c.beginPath();
  if (talking || excited) c.ellipse(0, 9, 6, 2 + Math.abs(Math.sin(t * 15)) * 5, 0, 0, Math.PI * 2);
  else {
    c.moveTo(-5, 9);
    c.quadraticCurveTo(0, 12, 5, 8);
  }
  if (talking || excited) c.fill();
  c.stroke();
  // headset + mic
  c.strokeStyle = INK;
  c.lineWidth = 4.4;
  c.beginPath();
  c.arc(0, -4, 21, Math.PI * 1.08, Math.PI * 1.92);
  c.stroke();
  c.strokeStyle = "#444";
  c.lineWidth = 2.4;
  c.stroke();
  inkRect(c, -23, -3, 7, 10, 3, "#444", 1.8);
  c.strokeStyle = INK;
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(-20, 6);
  c.quadraticCurveTo(-18, 16, -8, 12);
  c.stroke();
  inkCircle(c, -8, 12, 3, "#666", 1.6);
  c.restore();
}

function drawHud(g, racing) {
  const { ctx } = g;
  const r = raceArt(g);
  const t = g.time;
  ribbon(ctx, 150, 34, 210, 36, `RACE ${g.raceIndex + 1} OF ${RACES}`, 26);

  if (racing) {
    // stopwatch
    ctx.save();
    ctx.translate(1176, 52);
    inkRect(ctx, -5, -40, 10, 8, 2, "#c9c9d8", 2);
    inkCircle(ctx, 0, 0, 30, "#e9e9f4", 3.2);
    inkCircle(ctx, 0, 0, 24, "#fff", 2);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 19, Math.sin(a) * 19);
      ctx.lineTo(Math.cos(a) * 23, Math.sin(a) * 23);
      ctx.stroke();
    }
    if (g.raceFinished) inkText(ctx, "END", 0, 1, 20, PAL.red, { align: "center", sw: 3 });
    else {
      const s = Math.trunc(g.raceElapsed);
      inkText(ctx, `${Math.trunc(s / 60)}:${String(s % 60).padStart(2, "0")}`, 0, 1, 19, INK, { align: "center", sw: 0 });
    }
    ctx.restore();
  }

  // the announcer and what he is yelling
  const live = t < r.sayUntil;
  drawAnnouncer(ctx, 470, 52, t, live && t < r.lastSayAt + 1.8, live && r.prio >= 3);
  if (live) {
    const lines = wrapText(ctx, r.say, 380, 16, 2);
    const bh = 20 + lines.length * 19;
    const pop = easeBack((t - r.lastSayAt) / 0.18);
    ctx.save();
    ctx.translate(510, 52);
    ctx.scale(Math.min(1, pop), Math.min(1, pop));
    ctx.translate(-510, -52);
    bubble(ctx, 504, 44 - bh / 2 + 4, 404, bh, 492, 52, { fill: r.prio >= 3 ? "#fff3a0" : "#fff" });
    lines.forEach((ln, k) => plainText(ctx, ln, 504 + 202, 44 - bh / 2 + 4 + 10 + 9.5 + k * 19, 16, INK, { align: "center" }));
    ctx.restore();
  }
}

// --- the field -------------------------------------------------------------

function rankOf(g, horse) {
  const i = g.passOrder.indexOf(horse.id);
  return i < 0 ? 0 : i;
}

function drawDust(g) {
  const ctx = g.ctx;
  for (const [x, y, , , age] of g.dust) {
    const f = age / 0.6;
    const col = [232, 205, 165].map((a, k) => Math.trunc(a + (settings.DIRT[k] - a) * f * 0.6));
    puff(ctx, x, y, 3 + 6 * f, col, 0.95 * (1 - f * 0.8), true);
  }
}

function speedLines(g, horse) {
  const ctx = g.ctx;
  const dx = Math.cos(horse.heading);
  const dy = Math.sin(horse.heading);
  ctx.save();
  ctx.lineCap = "round";
  for (let k = 0; k < 4; k++) {
    const off = (k - 1.5) * 6;
    const len = 18 + ((g.time * 70 + k * 13) % 22);
    const sx = horse.x - dx * 26 - dy * off;
    const sy = horse.y - 6 - dy * 26 + dx * off;
    ctx.strokeStyle = `rgba(255,255,255,${0.75 - k * 0.12})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - dx * len, sy - dy * len);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawFieldArt(g) {
  const { ctx } = g;
  const t = g.time;
  const r = raceArt(g);
  drawDust(g);
  const racing = g.state === "race";
  for (const horse of [...g.field].sort((a, b) => a.y - b.y)) {
    const hx = Math.trunc(horse.x);
    const hy = Math.trunc(horse.y);
    const boomAt = r.explodedAt.get(horse.id);
    if (g.exploded.has(horse.id)) {
      // skip the blast frames, then show the soot-blackened survivor
      if (boomAt === undefined || t - boomAt < 0.4) continue;
      drawHorse(ctx, hx, hy, horse.heading, horse, 0, false, { charred: true, t });
      inkText(ctx, "DNF", hx, hy - 46, 16, "#ff8a8a", { align: "center", sw: 3.5 });
      continue;
    }
    const rank = rankOf(g, horse);
    let mood = "neutral";
    let face = "neutral";
    if (racing && !horse.finished) {
      if (rank === 0 && horse.progress > 0.05) [mood, face] = ["happy", "grin"];
      else if (rank >= N - 2 && horse.progress > 0.2) [mood, face] = ["scared", "worried"];
    } else if (horse.finished) {
      [mood, face] = horse.place <= 3 ? ["happy", "grin"] : ["sad", "worried"];
    } else if (g.state === "setup") {
      mood = "happy";
    }
    const running = racing && !horse.finished;
    if (running && rank === 0 && horse.progress > 0.05 && horse.progress < 0.98) speedLines(g, horse);
    drawHorse(ctx, hx, hy, horse.heading, horse, stridePhase(horse.progress), running, { mood, face, t });

    let alpha = 1;
    let dy = 0;
    if (g.state === "setup") {
      // one lane after another, sliding down into place
      alpha = easeOut((t - g.stateStart - 0.2 - horse.laneIndex * 0.08) / 0.35);
      dy = Math.trunc((1 - alpha) * -14);
    }
    if (horse.finished && horse.place) {
      // finished horses all stand on the line, so names go in a roll call to their right
      const medal = ["#ffc928", "#d5dbe6", "#d98a4a"][horse.place - 1] ?? "#9fb4d8";
      inkCircle(ctx, hx + 36, hy - 4, 8.5, medal, 2);
      inkText(ctx, String(horse.place), hx + 36, hy - 3.5, 12, INK, { align: "center", sw: 0 });
      inkText(ctx, horse.name, hx + 49, hy - 4, 14, "#fff", { sw: 3.6, font: BODY, bold: true });
    } else {
      inkText(ctx, horse.name, hx, hy - 46 + dy, 14, "#fff", { align: "center", sw: 3.6, alpha, font: BODY, bold: true });
    }
  }
}

// Horses show up on this board as they cross the line. Sits in the infield.
export function drawFinishBoardArt(g) {
  const { ctx } = g;
  const done = g.field.filter((h) => h.finished && !g.exploded.has(h.id)).sort((a, b) => (a.place || 99) - (b.place || 99));
  if (!done.length) return;
  const dnf = g.field.filter((h) => g.exploded.has(h.id)).sort((a, b) => (a.place || 99) - (b.place || 99));
  const rowH = 22;
  const pw = 264;
  const ph = 34 + rowH * g.field.length;
  const px = settings.TRACK_CENTER_X - pw / 2;
  const py = settings.TRACK_CENTER_Y - ph / 2;
  panel(ctx, px, py, pw, ph, { fill: PAL.navy, r: 12, shadow: 5, hi: false });
  inkText(ctx, "FINISH", px + 14, py + 17, 20, PAL.gold, { sw: 3.5 });
  [...done, ...dnf].forEach((horse, i) => {
    const isDnf = g.exploded.has(horse.id);
    const y = py + 36 + i * rowH;
    if (!g.finishSeen.has(horse.id)) g.finishSeen.set(horse.id, g.time);
    const ease = easeOut((g.time - g.finishSeen.get(horse.id)) / 0.4);
    const dx = Math.trunc((1 - ease) * 80);
    ctx.save();
    ctx.globalAlpha = ease;
    if (i === 0 && !isDnf) {
      ctx.beginPath();
      ctx.roundRect(px + 8 + dx, y - 3, pw - 16, rowH, 6);
      ctx.fillStyle = `rgba(255,201,40,${0.55 - 0.25 * ease})`;
      ctx.fill();
    }
    drawPortrait(ctx, horse, px + 21 + dx, y + 8, 18, { mood: isDnf ? "dizzy" : i === 0 ? "happy" : "neutral", t: g.time });
    const label = isDnf ? `DNF ${horse.name}` : `${i + 1}. ${horse.name}`;
    plainText(ctx, fitText(ctx, label, 140, 14), px + 38 + dx, y + 8, 14, isDnf ? "#ff8a8a" : "#fff");
    if (!isDnf) plainText(ctx, `${g.visualFinishTime(horse).toFixed(1)}s`, px + pw - 14 + dx, y + 8, 13, "#c9c4ec", { align: "right", bold: false });
    ctx.restore();
  });
}

// --- explosions ------------------------------------------------------------

export function drawBoomArt(g) {
  const { ctx } = g;
  const r = raceArt(g);
  const now = g.time;
  for (const b of g.blasts) {
    if (b.age <= 0) continue;
    const t = b.age / 0.6;
    if (t < 0.5) {
      // yellow starburst with an ink edge
      const s = 22 + 100 * easeOut(t / 0.5);
      ctx.save();
      ctx.globalAlpha = 1 - t * 1.3;
      burst(ctx, b.x, b.y - 6, s, s * 0.55, 11, t * 3);
      inkFill(ctx, "#ffe14a", 3.5);
      burst(ctx, b.x, b.y - 6, s * 0.55, s * 0.3, 11, -t * 3);
      inkFill(ctx, "#fff7c2", 0);
      ctx.restore();
    }
    const rr = 10 + 120 * (1 - (1 - t) ** 2);
    ctx.beginPath();
    ctx.arc(b.x, b.y - 6, rr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - t)})`;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  // smoke under fire under debris
  for (const kind of ["smoke", "fire", "debris"]) {
    for (const p of g.sparks) {
      if (p.kind !== kind || p.age <= 0) continue;
      const f = p.age / p.life;
      const x = Math.trunc(p.x);
      const y = Math.trunc(p.y);
      if (kind === "smoke") {
        puff(ctx, x, y, p.r * (1 + 1.5 * f) * 0.9, [70, 66, 74], 0.85 * (1 - f), true);
      } else if (kind === "fire") {
        const stops = [[255, 240, 120], [255, 150, 30], [200, 50, 20], [50, 40, 40]];
        const pos = f * (stops.length - 1);
        const i = Math.min(stops.length - 2, Math.trunc(pos));
        const c = stops[i].map((v, k) => Math.trunc(v + (stops[i + 1][k] - v) * (pos - i)));
        inkCircle(ctx, x, y, Math.max(1.5, p.r * (1 - 0.6 * f)), c, 1.6);
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.age * 9);
        inkRect(ctx, -3, -3, Math.max(4, p.r + 2), Math.max(4, p.r + 2), 1, p.color, 1.4);
        ctx.restore();
      }
    }
  }
  // comic lettering
  for (const b of r.booms) {
    const age = now - b.at;
    if (age < 0) continue;
    const pop = easeBack(age / 0.2);
    const fade = 1 - clamp01((age - 0.8) / 0.5);
    ctx.save();
    ctx.translate(b.x, b.y - 40 - age * 22);
    ctx.rotate(b.rot);
    ctx.scale(pop, pop);
    ctx.globalAlpha = fade;
    burst(ctx, 0, 0, 62, 38, 12, age * 1.5);
    inkFill(ctx, PAL.red, 3.5);
    inkText(ctx, b.text, 0, 2, 34, "#ffe14a", { align: "center", sw: 6 });
    ctx.restore();
  }
}

// --- big pop text: 3, 2, 1, GO! -------------------------------------------

export function drawPopArt(g, str, frac) {
  const { ctx } = g;
  const scale = 1 + 0.8 * (1 - easeOut(frac * 3));
  ctx.save();
  ctx.translate(settings.TRACK_CENTER_X, settings.TRACK_CENTER_Y);
  ctx.globalAlpha = Math.max(0, 1 - Math.max(0, frac - 0.6) / 0.4);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.rotate(g.time * 0.6);
  burst(ctx, 0, 0, 190, 130, 16);
  ctx.fillStyle = str === "GO!" ? "rgba(255,70,50,0.6)" : "rgba(255,201,40,0.5)";
  ctx.fill();
  ctx.restore();
  ctx.scale(scale, scale);
  ctx.rotate(Math.sin(g.time * 9) * 0.03);
  inkText(ctx, str, 0, 6, str === "GO!" ? 190 : 230, str === "GO!" ? "#fff" : "#ffd23f", { align: "center", sw: 20, stroke: str === "GO!" ? "#d92b2b" : "#e8433a" });
  inkText(ctx, str, 0, 6, str === "GO!" ? 190 : 230, str === "GO!" ? "#fff" : "#ffd23f", { align: "center", sw: 0 });
  ctx.restore();
}

// --- celebration: confetti, sparkles, photo finish -------------------------

function drawCelebration(g) {
  const { ctx } = g;
  const r = raceArt(g);
  const now = g.time;

  // winner sparkles + name
  const win = g.field.find((h) => h.id === r.winnerId);
  if (win && now - r.winnerAt < 3.6) {
    const age = now - r.winnerAt;
    for (let i = 0; i < 6; i++) {
      const a = age * 3 + (i * Math.PI * 2) / 6;
      inkStar(ctx, win.x + Math.cos(a) * 34, win.y - 14 + Math.sin(a) * 18, 5 + (i % 2) * 2, i % 2 ? PAL.gold : "#fff", 1.4, a * 2);
    }
    const pop = easeBack(age / 0.25);
    const fade = 1 - clamp01((age - 3) / 0.6);
    ctx.save();
    ctx.translate(win.x + 70, win.y - 86);
    ctx.rotate(-0.12);
    ctx.scale(pop, pop);
    ctx.globalAlpha = fade;
    burst(ctx, 0, 0, 52, 34, 10, age * 2);
    inkFill(ctx, PAL.gold, 3.2);
    inkText(ctx, "WINNER!", 0, 2, 26, "#fff", { align: "center", sw: 5, stroke: PAL.red });
    ctx.restore();
  }

  for (const c of r.confetti) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.scale(1, Math.cos(c.rot * 2.2));
    ctx.fillStyle = typeof c.color === "string" ? c.color : `rgb(${c.color.join(",")})`;
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(28,18,38,0.6)";
    ctx.strokeRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.restore();
  }

  // photo finish banner + flash
  const pa = now - r.photoAt;
  if (pa >= 0 && pa < 3.4) {
    const slide = easeOut(pa / 0.3);
    const out = 1 - clamp01((pa - 3) / 0.4);
    ctx.save();
    ctx.translate(W / 2, -60 + (150 + 60) * slide * out);
    ctx.rotate(Math.sin(now * 12) * 0.01);
    ctx.beginPath();
    ctx.roundRect(-210, -34, 420, 68, 8);
    ctx.fillStyle = "#14101f";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = "#fff"; // film strip holes
    for (let k = -9; k <= 9; k++) {
      ctx.fillRect(k * 22 - 4, -31, 8, 6);
      ctx.fillRect(k * 22 - 4, 25, 8, 6);
    }
    inkText(ctx, "PHOTO FINISH!", 0, 2, 40, "#fff", { align: "center", sw: 5, stroke: PAL.red });
    ctx.restore();
  }
  const fa = now - r.flashAt;
  if (fa >= 0 && fa < 0.35) {
    ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - fa / 0.35)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// --- the screens -----------------------------------------------------------

function drawWorld(g) {
  const { ctx } = g;
  drawScenery(g);
  drawCrowd(ctx, g.crowd, g.cheerLevel, g.time);
  drawGags(g);
  g.drawStarter();
  drawFieldArt(g);
  drawBoomArt(g);
  drawFinishBoardArt(g);
  drawSky(g);
}

export function drawRaceScreen(g) {
  const { ctx } = g;
  const r = raceArt(g);
  // Rattle the whole frame for a moment after the first blast.
  let shaking = false;
  if (g.boomTime !== null) {
    const t = (g.time - g.boomTime) / 0.7;
    if (t < 1) {
      const amp = 8 * (1 - t);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(Math.trunc((Math.random() * 2 - 1) * amp), Math.trunc((Math.random() * 2 - 1) * amp));
      shaking = true;
    }
  }
  // a quick punch-in when the winner crosses
  const bump = Math.max(0, 1 - (g.time - r.zoomAt) / 0.6);
  ctx.save();
  const z = 1 + 0.04 * Math.sin(bump * Math.PI) * (bump > 0 ? 1 : 0);
  ctx.translate(settings.TRACK_CENTER_X, settings.TRACK_CENTER_Y);
  ctx.scale(z, z);
  ctx.translate(-settings.TRACK_CENTER_X, -settings.TRACK_CENTER_Y);
  drawWorld(g);
  ctx.restore();

  drawCelebration(g);
  drawHud(g, true);
  const goAge = g.time - g.stateStart;
  if (goAge < 0.6) g.drawPop("GO!", goAge / 0.6);
  inkText(ctx, g.raceFinished ? "Click for results" : "Click to skip", W / 2, H - 9, 14, "#fff", { align: "center", sw: 3.5, font: BODY, bold: true });
  if (shaking) ctx.restore();
}

export function drawSetupArt(g) {
  drawWorld(g);
  drawCelebration(g);
  drawHud(g, false);
  if (g.countdown === null) {
    g.drawButton(g.btnBack);
    g.drawButton(g.btnGo, true);
  } else {
    const n = Math.ceil(g.countdown);
    g.drawPop(String(n), n - g.countdown);
  }
}

// --- the screen change: an iris that opens on the new screen ---------------

export function drawFadeArt(g) {
  const { ctx, canvas } = g;
  if (g.fadeFrom) {
    const t = (g.time - g.fadeStart) / 0.55;
    if (t >= 1) g.fadeFrom = null;
    else {
      const w = canvas.width;
      const h = canvas.height;
      const rad = easeOut(t) * Math.hypot(w, h) * 0.52;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(w / 2, h / 2, rad, 0, Math.PI * 2);
      ctx.clip("evenodd"); // the old screen shows outside the circle
      ctx.drawImage(g.fadeFrom, 0, 0);
      ctx.restore();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, rad, 0, Math.PI * 2);
      ctx.lineWidth = 12 * g.pixelScale;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 5 * g.pixelScale;
      ctx.strokeStyle = "#ffc928";
      ctx.stroke();
      ctx.restore();
    }
  }
  // copy AFTER the fade so a fast second switch fades from what was on screen
  const lc = g.lastFrame.getContext("2d");
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.drawImage(canvas, 0, 0);
}
