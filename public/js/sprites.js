// Stride timing (the sound code reads it) and the starter. The horses themselves
// are in characters.js.

import { INK, PAL, inkFill, inkCircle, inkEllipse, inkRect, inkLine, puff } from "./art.js";

const STRIDES_PER_RACE = 45; // leg cycles start to finish. tied to distance, so faster horses stride faster
const LEG_COUNT = 4;

export const stridePhase = (progress) => progress * STRIDES_PER_RACE;

// Hooves down so far. Sound uses this so thuds land on the drawn steps.
// A foot touches down when its swing is at the front, phase = 0.25 - offset.
// Our offsets are k/4, so touchdowns fall on every 1/4 cycle, one leg each.
// This only holds while the leg offsets in characters.js are k/LEG_COUNT.
export const footfallCount = (progress) => Math.trunc(stridePhase(progress) * LEG_COUNT);

// The starter, feet at (x, y). raise 0 = gun down, 1 = gun straight up.
// shotAge is seconds since the shot (null = not fired). Drives recoil,
// muzzle flash and a smoke trail.
export function drawStarter(ctx, x, y, raise, shotAge) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.45, 1.45); // drawn in small units with the feet at 0, 0

  const coat = "#d6303a";
  const skin = "#f2c29b";
  inkLine(ctx, [[-3, -11], [-4, -1]], "#2a2a44", 3);
  inkLine(ctx, [[3, -11], [4, -1]], "#2a2a44", 3);
  inkEllipse(ctx, -4.5, 0, 3.6, 1.8, INK, 0);
  inkEllipse(ctx, 4.5, 0, 3.6, 1.8, INK, 0);
  ctx.beginPath();
  ctx.roundRect(-7, -26, 14, 17, 4);
  inkFill(ctx, coat, 2.2);
  for (const by of [-22, -17, -12]) inkCircle(ctx, 0, by, 1.2, PAL.gold, 0.8);
  // head, big mustache, top hat
  inkCircle(ctx, 0, -32, 6, skin, 2.2);
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.bezierCurveTo(-3, -32, -8, -30, -9, -27);
  ctx.bezierCurveTo(-5, -28, -2, -28, 0, -28);
  ctx.bezierCurveTo(2, -28, 5, -28, 9, -27);
  ctx.bezierCurveTo(8, -30, 3, -32, 0, -30);
  ctx.closePath();
  inkFill(ctx, "#2a1a14", 1.2);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(-2.2, -34, 0.9, 0, Math.PI * 2);
  ctx.arc(2.2, -34, 0.9, 0, Math.PI * 2);
  ctx.fill();
  inkEllipse(ctx, 0, -37.5, 9, 2.2, "#1e1e26", 1.6);
  inkRect(ctx, -5.5, -47, 11, 10, 1.5, "#1e1e26", 1.6);
  ctx.fillStyle = css2(PAL.red);
  ctx.fillRect(-5, -40.5, 10, 2.4);

  // gun arm: from the right shoulder. angle goes from down-forward to straight up
  const shoulder = [6, -23];
  let angle = ((60 - 150 * raise) * Math.PI) / 180; // 60 = down and out, -90 = up
  if (shotAge !== null && shotAge < 0.25) angle -= ((25 * Math.PI) / 180) * (1 - shotAge / 0.25); // recoil
  const hand = [shoulder[0] + Math.cos(angle) * 10, shoulder[1] + Math.sin(angle) * 10];
  const tip = [hand[0] + Math.cos(angle) * 9, hand[1] + Math.sin(angle) * 9];
  inkLine(ctx, [shoulder, hand], coat, 3.6);
  inkLine(ctx, [hand, tip], "#3a3a48", 3);
  inkCircle(ctx, hand[0], hand[1], 2.4, "#fff", 1.4);

  if (shotAge !== null) {
    if (shotAge < 0.09) {
      // muzzle flash
      const r = 9 * (1 - shotAge / 0.09) + 4;
      inkCircle(ctx, tip[0], tip[1], r, "#ffe14a", 1.6);
      inkCircle(ctx, tip[0], tip[1], Math.max(1, r / 2), "#fff", 0);
    }
    if (shotAge < 1.6) {
      // smoke drifts up and spreads
      for (let k = 0; k < 5; k++) {
        const age = shotAge - 0.04 * k;
        if (age <= 0) continue;
        const f = age / 1.6;
        puff(ctx, tip[0] + 6 * k * f, tip[1] - 30 * f - 4 * k, 4 + 9 * f, [230, 230, 236], 0.9 * (1 - f), true);
      }
    }
  }
  ctx.restore();
}

const css2 = (c) => (typeof c === "string" ? c : `rgb(${c[0]},${c[1]},${c[2]})`);
