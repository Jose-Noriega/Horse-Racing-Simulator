// Horse + starter sprites, drawn with canvas shapes (no image files).
// Side view, flipped to face left or right. Not rotated, so a horse on the
// backstretch runs left instead of upside down.

import { rgb } from "./ui.js";

const SCALE = 0.8;
const STRIDES_PER_RACE = 45; // leg cycles start to finish. tied to distance, so faster horses stride faster
const LEG_COLOR = "rgb(40,30,25)";
const SILK = "rgb(240,240,240)";

// [hip x, phase offset in cycles]. diagonal pairs move together
const LEGS = [
  [9, 0.0],
  [6, 0.5],
  [-9, 0.25],
  [-6, 0.75],
];

export const stridePhase = (progress) => progress * STRIDES_PER_RACE;

// Hooves down so far. Sound uses this so thuds land on the drawn steps.
// A foot touches down when its swing is at the front, phase = 0.25 - offset.
// Our offsets are k/4, so touchdowns fall on every 1/4 cycle, one leg each.
// This only holds while LEGS offsets are k/LEGS.length.
export const footfallCount = (progress) => Math.trunc(stridePhase(progress) * LEGS.length);

function line(ctx, color, width, a, b) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function poly(ctx, fill, outline, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function disc(ctx, fill, p, r) {
  ctx.beginPath();
  ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

// Draw one horse centered on (x, y). phase is in leg cycles.
export function drawHorse(ctx, x, y, heading, color, phase, running) {
  const face = Math.cos(heading) >= 0 ? 1 : -1;
  const t = phase * 2 * Math.PI;
  const pt = (px, py) => [Math.trunc(x + face * px * SCALE), Math.trunc(y + py * SCALE)];
  const bob = running ? -Math.abs(Math.sin(t)) * 2 : 0;
  const body = rgb(color);

  // legs first so the body covers the hips
  ctx.lineCap = "butt";
  for (const [hipX, offset] of LEGS) {
    const swing = running ? Math.sin(t + offset * 2 * Math.PI) : 0;
    const lift = running ? Math.max(0, Math.cos(t + offset * 2 * Math.PI)) * 4 : 0;
    line(ctx, LEG_COLOR, 3, pt(hipX, 4 + bob), pt(hipX + swing * 7, 15 - lift));
  }

  // tail waves with the stride
  const wave = running ? Math.sin(t) * 2 : 0;
  line(ctx, LEG_COLOR, 3, pt(-13, -3 + bob), pt(-22, 3 + wave));

  // body, neck, head
  const c = pt(0, -3 + bob);
  ctx.beginPath();
  ctx.ellipse(c[0], c[1], (30 * SCALE) / 2, (15 * SCALE) / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = LEG_COLOR;
  ctx.lineWidth = 1;
  ctx.stroke();
  poly(ctx, body, null, [pt(8, -8 + bob), pt(14, -20 + bob), pt(19, -17 + bob), pt(13, -3 + bob)]);
  poly(ctx, body, LEG_COLOR, [pt(15, -21 + bob), pt(26, -14 + bob), pt(24, -10 + bob), pt(14, -16 + bob)]);

  // jockey: silks + head. leans forward when running
  const lean = running ? 3 : 0;
  disc(ctx, SILK, pt(1 + lean, -17 + bob), Math.max(2, Math.trunc(5 * SCALE)));
  disc(ctx, LEG_COLOR, pt(1 + lean, -24 + bob), Math.max(2, Math.trunc(3 * SCALE)));
}

// The starter, feet at (x, y). raise 0 = gun down, 1 = gun straight up.
// shotAge is seconds since the shot (null = not fired). Drives recoil, muzzle flash, smoke.
export function drawStarter(ctx, x, y, raise, shotAge) {
  const coat = "rgb(160,35,35)";
  const hat = "rgb(25,25,30)";
  const skin = "rgb(230,190,150)";
  line(ctx, "rgb(30,30,40)", 3, [x - 3, y - 11], [x - 4, y]);
  line(ctx, "rgb(30,30,40)", 3, [x + 3, y - 11], [x + 4, y]);
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.roundRect(x - 6, y - 25, 12, 15, 3);
  ctx.fill();
  disc(ctx, skin, [x, y - 30], 5);
  ctx.fillStyle = hat; // top hat: brim, then crown
  ctx.fillRect(x - 6, y - 35, 12, 2);
  ctx.fillRect(x - 4, y - 42, 8, 8);

  // gun arm: from the right shoulder. angle goes from down-forward to straight up
  const shoulder = [x + 6, y - 23];
  let angle = ((60 - 150 * raise) * Math.PI) / 180; // 60 = down and out, -90 = up
  if (shotAge !== null && shotAge < 0.25) angle -= ((25 * Math.PI) / 180) * (1 - shotAge / 0.25); // recoil
  const hand = [shoulder[0] + Math.cos(angle) * 10, shoulder[1] + Math.sin(angle) * 10];
  const tip = [hand[0] + Math.cos(angle) * 8, hand[1] + Math.sin(angle) * 8];
  line(ctx, coat, 4, shoulder, hand);
  line(ctx, "rgb(20,20,20)", 3, hand, tip); // barrel
  disc(ctx, skin, [Math.trunc(hand[0]), Math.trunc(hand[1])], 2);

  if (shotAge === null) return;
  if (shotAge < 0.09) {
    // muzzle flash
    const r = Math.trunc(9 * (1 - shotAge / 0.09)) + 3;
    disc(ctx, "rgb(255,235,140)", [Math.trunc(tip[0]), Math.trunc(tip[1])], r);
    disc(ctx, "rgb(255,255,255)", [Math.trunc(tip[0]), Math.trunc(tip[1])], Math.max(1, Math.trunc(r / 2)));
  }
  if (shotAge < 1.6) {
    // smoke drifts up and spreads
    for (let k = 0; k < 5; k++) {
      const age = shotAge - 0.04 * k;
      if (age <= 0) continue;
      const f = age / 1.6;
      const r = Math.trunc(3 + 9 * f);
      disc(ctx, `rgba(200,200,200,${(150 * (1 - f)) / 255})`, [Math.trunc(tip[0] + 6 * k * f), Math.trunc(tip[1] - 30 * f - 4 * k)], r);
    }
  }
}
