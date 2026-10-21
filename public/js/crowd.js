// The crowd around the track. Fans wear their horse's color and cheer for it.
// buildCrowd and detectPasses are honest. drawCrowd only draws.

import * as settings from "./settings.js";
import { outerRailRadius, pointOnRadius } from "./track.js";
import { INK, css, shade, hash, inkHeart, inkStar } from "./art.js";

const ROWS = [16, 29]; // px outside the outer rail. two rows
const SPACING = 10; // px between people along a row
const SKIN = [
  [240, 200, 160],
  [210, 160, 120],
  [160, 110, 75],
  [110, 75, 50],
];

// People on two rings outside the rail. Fans sit in runs of 3-7 so the colors read as blocks.
export function buildCrowd(horseIds, colors, rng = Math.random) {
  const people = [];
  const randInt = (a, b) => a + Math.floor(rng() * (b - a + 1));
  ROWS.forEach((off, row) => {
    const radius = outerRailRadius() + off;
    const length = 2 * settings.TRACK_STRAIGHT + 2 * Math.PI * radius;
    const n = Math.floor(length / SPACING);
    let k = 0;
    let left = 0;
    for (let i = 0; i < n; i++) {
      if (left === 0) {
        k = Math.floor(rng() * horseIds.length);
        left = randInt(3, 7);
      }
      left--;
      const [x, y] = pointOnRadius(radius, (i + 0.5 * row) / n);
      people.push({
        x, y,
        fan: horseIds[k],
        color: colors[k],
        phase: rng() * Math.PI * 2,
        skin: SKIN[Math.floor(rng() * SKIN.length)],
      });
    }
  });
  people.sort((a, b) => a.y - b.y); // far ones first, near ones on top
  return people;
}

// order is horse ids, leader first. progress is id -> lap fraction.
// Returns { order, passes: [[passer, passed], ...] }.
// The margin keeps two horses side by side from trading places every frame.
// One bubble pass per call. Fine at 60fps, it catches up next frame.
export function detectPasses(order, progress, margin = 0.004) {
  order = [...order];
  const passes = [];
  for (let i = 1; i < order.length; i++) {
    const behind = order[i];
    const ahead = order[i - 1];
    if (progress[behind] > progress[ahead] + margin) {
      order[i - 1] = behind;
      order[i] = ahead;
      passes.push([behind, ahead]);
    }
  }
  return { order, passes };
}

// --- drawing ---------------------------------------------------------------
// Idle fans are cached little sprites (one per shirt, skin and hat). Only fans
// whose horse is being cheered get redrawn live, with arms up. That keeps 400
// people cheap.

const spriteCache = new Map();

function variantOf(p) {
  if (p.v === undefined) p.v = Math.floor(hash(Math.floor(p.phase * 1000)) * 5);
  return p.v;
}

// Draws one fan with feet at (0, 0). cheer 0..1. t is seconds, only used when cheering.
function paintPerson(c, color, skin, variant, cheer, t, phase) {
  const wave = Math.sin(t * 14 + phase) * 2.5 * cheer;
  const hand = 5 + 2 * cheer;
  c.lineCap = "round";
  c.lineJoin = "round";
  // arms
  c.strokeStyle = INK;
  for (const side of [-1, 1]) {
    const hx = side * hand + (side > 0 ? wave : -wave);
    const hy = -8 + 5 - 18 * cheer;
    for (const [w, col] of [[3.6, INK], [1.8, css(skin)]]) {
      c.lineWidth = w;
      c.strokeStyle = col;
      c.beginPath();
      c.moveTo(side * 3, -8);
      c.lineTo(hx, hy);
      c.stroke();
    }
    if (cheer > 0.3) {
      c.beginPath();
      c.arc(hx, hy, 2.2, 0, Math.PI * 2);
      c.fillStyle = "#fff";
      c.fill();
      c.lineWidth = 1;
      c.strokeStyle = INK;
      c.stroke();
    }
  }
  // body
  c.beginPath();
  c.roundRect(-3.6, -9, 7.2, 9, 2);
  c.fillStyle = css(color);
  c.fill();
  c.lineWidth = 1.3;
  c.strokeStyle = INK;
  c.stroke();
  // head
  c.beginPath();
  c.arc(0, -13, 3.8, 0, Math.PI * 2);
  c.fillStyle = css(skin);
  c.fill();
  c.stroke();
  // hair or hat
  if (variant === 0) {
    c.beginPath();
    c.arc(0, -14, 3.9, Math.PI, 0);
    c.fillStyle = "#4a2c17";
    c.fill();
    c.stroke();
  } else if (variant === 1) {
    c.beginPath();
    c.arc(0, -14, 4, Math.PI, 0);
    c.fillStyle = css(shade(color, -0.35));
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(1, -14);
    c.lineTo(7, -13);
    c.lineTo(1, -12);
    c.fillStyle = css(shade(color, -0.35));
    c.fill();
    c.stroke();
  } else if (variant === 2) {
    c.beginPath();
    c.ellipse(0, -16, 5.4, 1.3, 0, 0, Math.PI * 2);
    c.fillStyle = "#222";
    c.fill();
    c.stroke();
    c.beginPath();
    c.roundRect(-3, -22, 6, 6, 1);
    c.fill();
    c.stroke();
  } else if (variant === 3) {
    c.beginPath();
    c.arc(0, -15, 4.2, Math.PI * 0.95, Math.PI * 2.05);
    c.fillStyle = "#f2d04a";
    c.fill();
    c.stroke();
  } else {
    c.beginPath();
    c.arc(0, -15.5, 5.6, 0, Math.PI * 2);
    c.fillStyle = "#2a1a14";
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(0, -13, 3.8, 0, Math.PI * 2);
    c.fillStyle = css(skin);
    c.fill();
    c.stroke();
  }
  // face
  c.fillStyle = INK;
  c.beginPath();
  c.arc(-1.4, -13, 0.7, 0, Math.PI * 2);
  c.arc(1.4, -13, 0.7, 0, Math.PI * 2);
  c.fill();
  if (cheer > 0.3) {
    c.fillStyle = "#6a1818"; // open mouth
    c.beginPath();
    c.ellipse(0, -10.6, 1.4, 1.2 + cheer * 0.6, 0, 0, Math.PI * 2);
    c.fill();
  }
}

function sprite(color, skin, variant, ps) {
  const key = `${color}|${skin}|${variant}|${ps}`;
  let s = spriteCache.get(key);
  if (!s) {
    s = document.createElement("canvas");
    s.width = Math.ceil(26 * ps);
    s.height = Math.ceil(34 * ps);
    const c = s.getContext("2d");
    c.setTransform(ps, 0, 0, ps, 13 * ps, 26 * ps);
    paintPerson(c, color, skin, variant, 0, 0, 0);
    spriteCache.set(key, s);
  }
  return s;
}

// levels: horse id -> 0..1 cheer. 0 = standing and swaying, 1 = jumping with arms up.
export function drawCrowd(ctx, people, levels, t) {
  const ps = ctx.getTransform().a; // the page scale, so cached sprites stay sharp
  for (const p of people) {
    const c = levels[p.fan] ?? 0;
    const sway = Math.sin(t * 1.5 + p.phase) * 0.8 * (1 - c);
    const v = variantOf(p);
    // feet sit a bit below the old body-top anchor
    const fx = p.x + sway;
    const fy = p.y + 7;
    if (c < 0.04) {
      ctx.drawImage(sprite(p.color, p.skin, v, ps), fx - 13, fy - 26, 26, 34);
      continue;
    }
    const bob = c * Math.abs(Math.sin(t * 11 + p.phase)) * 5;
    ctx.save();
    ctx.translate(fx, fy - bob);
    paintPerson(ctx, p.color, p.skin, v, c, t, p.phase);
    ctx.restore();
    // some fans throw out stars and hearts
    if (c > 0.6 && p.phase > 5.2) {
      const k = (t * 1.4 + p.phase) % 1;
      const hx = fx + Math.sin(k * 6 + p.phase) * 5;
      const hy = fy - 30 - k * 22;
      ctx.globalAlpha = 1 - k;
      if (p.phase > 5.8) inkHeart(ctx, hx, hy, 3.2, "#ff5fa2", 1.2);
      else inkStar(ctx, hx, hy, 4, "#ffc928", 1.2, k * 5);
      ctx.globalAlpha = 1;
    }
  }
}
