// The crowd around the track. Fans wear their horse's color and cheer for it.
// buildCrowd and detectPasses are honest. drawCrowd only draws.

import * as settings from "./settings.js";
import { outerRailRadius, pointOnRadius } from "./track.js";
import { rgb } from "./ui.js";

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

// levels: horse id -> 0..1 cheer. 0 = standing and swaying, 1 = jumping with arms up.
export function drawCrowd(ctx, people, levels, t) {
  ctx.lineCap = "butt";
  for (const p of people) {
    const c = levels[p.fan] ?? 0;
    const phase = p.phase;
    const sway = Math.sin(t * 1.5 + phase) * 0.8 * (1 - c);
    const bob = c * Math.abs(Math.sin(t * 11 + phase)) * 5;
    const bx = Math.trunc(p.x + sway);
    const by = Math.trunc(p.y - bob);
    const wave = Math.sin(t * 14 + phase) * 2.5 * c;
    const handY = Math.trunc(by + 5 - 18 * c);
    const spread = 4 + 2 * c;
    const skin = rgb(p.skin);

    ctx.strokeStyle = skin;
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      const handX = Math.trunc(bx + side * spread + (side > 0 ? wave : -wave));
      ctx.beginPath();
      ctx.moveTo(bx + side * 3, by);
      ctx.lineTo(handX, handY);
      ctx.stroke();
      if (c > 0.3) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(handX, handY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = rgb(p.color);
    ctx.beginPath();
    ctx.roundRect(bx - 3, by - 2, 6, 8, 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(bx, by - 6, 3, 0, Math.PI * 2);
    ctx.fill();
    if (c > 0.3) {
      ctx.fillStyle = "rgb(60,20,20)"; // open mouth
      ctx.beginPath();
      ctx.arc(bx, by - 5, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
