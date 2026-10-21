// The world around the track: grass, stands, rails, infield, signs, critters, sky stuff.
// The still parts are painted once into a cached layer. Only the moving bits are
// drawn every frame (flags, duck, billboard text, cloud shadows, blimp, chicken, gags).

import * as settings from "./settings.js";
import { innerRailRadius, outerRailRadius, laneRadius, startProgress, pointOnRadius, pointOnLane } from "./track.js";
import {
  getLayer, INK, PAL, BODY, shade, hash, easeOut, clamp01, inkFill, inkCircle, inkEllipse, inkRect, inkLine, inkText, plainText, bubble, inkStar, puff, textWidth,
} from "./art.js";
import { byRace, CHICKEN, DUCK, DUCK_EVERY, SPONSORS } from "./words.js";

const W = settings.SCREEN_WIDTH;
const H = settings.SCREEN_HEIGHT;
const CX = settings.TRACK_CENTER_X;
const CY = settings.TRACK_CENTER_Y;
const L = settings.TRACK_STRAIGHT;
const N = settings.HORSES_PER_RACE;

function stadium(c, radius, steps = 120) {
  c.beginPath();
  for (let i = 0; i < steps; i++) {
    const [x, y] = pointOnRadius(radius, i / steps);
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
}

function ring(c, radius, width, color, steps = 120) {
  stadium(c, radius, steps);
  c.lineWidth = width;
  c.strokeStyle = color;
  c.stroke();
}

function tree(c, x, y, s = 1) {
  c.fillStyle = "rgba(20,60,20,0.28)";
  c.beginPath();
  c.ellipse(x + 6 * s, y + 22 * s, 24 * s, 7 * s, 0, 0, Math.PI * 2);
  c.fill();
  inkRect(c, x - 4 * s, y + 2 * s, 8 * s, 22 * s, 2, "#8a5a2b", 2.4);
  for (const [dx, dy, r, col] of [[-12, -4, 15, "#2f9a43"], [12, -2, 14, "#2f9a43"], [0, -16, 17, "#3cb552"]]) {
    inkCircle(c, x + dx * s, y + dy * s, r * s, col, 2.6);
  }
  c.fillStyle = "rgba(255,255,255,0.22)";
  c.beginPath();
  c.arc(x - 4 * s, y - 22 * s, 5 * s, 0, Math.PI * 2);
  c.fill();
}

function bush(c, x, y, s = 1) {
  for (const [dx, r] of [[-9, 8], [9, 8], [0, 11]]) inkCircle(c, x + dx * s, y + (dx ? 4 : 0) * s, r * s, "#3aa24a", 2.2);
}

function flowerBed(c, x, y, w) {
  const cols = ["#ff5fa2", "#ffc928", "#fff", "#ff8a1f", "#8a5cff"];
  for (let i = 0; i < w / 9; i++) {
    const fx = x + i * 9 + hash(i) * 4;
    const fy = y + hash(i + 40) * 10;
    c.strokeStyle = "#2a7a35";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(fx, fy);
    c.lineTo(fx, fy + 8);
    c.stroke();
    inkCircle(c, fx, fy, 3.6, cols[i % cols.length], 1.4);
    c.fillStyle = "#ffe36a";
    c.beginPath();
    c.arc(fx, fy, 1.2, 0, Math.PI * 2);
    c.fill();
  }
}

function pennants(c, x0, x1, y, sag) {
  const cols = [PAL.red, PAL.gold, PAL.blue, PAL.green, PAL.pink];
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.beginPath();
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    const px = x0 + (x1 - x0) * u;
    const py = y + Math.sin(u * Math.PI) * sag;
    if (i) c.lineTo(px, py);
    else c.moveTo(px, py);
  }
  c.stroke();
  const n = Math.floor((x1 - x0) / 26);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const px = x0 + (x1 - x0) * u;
    const py = y + Math.sin(u * Math.PI) * sag;
    c.beginPath();
    c.moveTo(px - 9, py);
    c.lineTo(px + 9, py);
    c.lineTo(px, py + 17);
    c.closePath();
    inkFill(c, cols[i % cols.length], 1.8);
  }
}

// --- the still layer -------------------------------------------------------

function paintTrack(c) {
  const inner = innerRailRadius();
  const outer = outerRailRadius();

  // grass with mowing stripes
  c.fillStyle = PAL.grass;
  c.fillRect(0, 0, W, H);
  c.fillStyle = "rgba(255,255,255,0.07)";
  for (let x = 0; x < W; x += 80) c.fillRect(x, 0, 40, H);
  c.fillStyle = "rgba(20,80,30,0.25)";
  for (let i = 0; i < 260; i++) {
    const gx = hash(i * 2) * W;
    const gy = hash(i * 2 + 1) * H;
    c.fillRect(gx, gy, 2, 5);
    c.fillRect(gx + 3, gy + 2, 2, 4);
  }

  // the margins: trees, bushes, a sign
  for (const [x, y, s] of [[44, 150, 1], [66, 290, 0.9], [38, 410, 1.1], [70, 540, 0.95], [44, 650, 1]]) {
    tree(c, x, y, s);
    tree(c, W - x, y + 18, s);
  }
  for (const [x, y] of [[20, 230], [96, 470], [26, 600]]) {
    bush(c, x, y);
    bush(c, W - x, y);
  }
  pennants(c, 130, W - 130, 6, 14);

  // the stands: a concrete ring with seat rows. Crowd sits on rows 16 and 29.
  ring(c, outer + 25, 38, INK);
  ring(c, outer + 25, 34, "#4b456f");
  ring(c, outer + 16, 12, "#5d5790");
  ring(c, outer + 29, 12, "#5d5790");
  ring(c, outer + 22.5, 2, "rgba(0,0,0,0.4)");
  ring(c, outer + 8, 2.5, INK);

  // dirt, one tinted band per lane so lanes read at a glance
  ring(c, (inner + outer) / 2, outer - inner + 12, INK);
  for (let i = 0; i < N; i++) ring(c, laneRadius(i), settings.TRACK_LANE_WIDTH + 0.6, i % 2 ? "#d4934d" : "#dea35e");
  c.setLineDash([16, 26]);
  for (let i = 0; i < N; i++) ring(c, laneRadius(i), 3, "rgba(255,235,190,0.35)");
  c.setLineDash([]);
  for (let i = 1; i < N; i++) ring(c, inner + i * settings.TRACK_LANE_WIDTH, 1.2, "rgba(120,70,20,0.35)", 90);

  // start ticks. Lanes are staggered so every horse runs the same distance.
  for (let i = 0; i < N; i++) {
    const [x, y, h] = pointOnLane(i, startProgress(i));
    const nx = -Math.sin(h);
    const ny = Math.cos(h);
    c.strokeStyle = "rgba(255,250,235,0.55)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - nx * 8, y - ny * 8);
    c.lineTo(x + nx * 8, y + ny * 8);
    c.stroke();
  }

  // infield: concentric mowing rings
  const infield = inner - 4;
  stadium(c, infield, 100);
  c.fillStyle = "#4cb65a";
  c.fill();
  for (let r = infield - 8, k = 0; r > 6; r -= 12, k++) {
    ring(c, r, 12, k % 2 ? "#4cb65a" : "#58c966", 90);
  }
  stadium(c, infield, 100);
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.stroke();

  // rails: white, with red candy stripes
  for (const r of [inner, outer]) {
    ring(c, r, 8, INK);
    ring(c, r, 4.5, "#fff");
    c.setLineDash([9, 9]);
    ring(c, r, 4.5, PAL.red);
    c.setLineDash([]);
  }

  // finish line: a checker strip and two poles
  const [ix, iy] = pointOnRadius(inner, 0);
  const [ox, oy] = pointOnRadius(outer, 0);
  const len = oy - iy;
  const sq = len / Math.round(len / 9);
  c.save();
  c.beginPath();
  c.rect(ix - 9, iy, 18, len);
  c.clip();
  for (let k = 0; k * sq < len; k++) {
    for (let col = 0; col < 2; col++) {
      c.fillStyle = (k + col) % 2 ? "#fff" : "#1c1226";
      c.fillRect(ix - 9 + col * 9, iy + k * sq, 9, sq + 0.5);
    }
  }
  c.restore();
  c.lineWidth = 2.5;
  c.strokeStyle = INK;
  c.strokeRect(ix - 9, iy, 18, len);
  for (const py of [iy, oy]) {
    inkRect(c, ix - 3, py - 46, 6, 46, 2, "#e9e9f2", 2);
    inkCircle(c, ix, py - 48, 4, PAL.gold, 2);
  }

  // infield props
  // pond
  inkEllipse(c, 440, 346, 66, 32, "#3aa0e8", 3);
  inkEllipse(c, 440, 346, 54, 24, "#63bdf5", 0);
  c.strokeStyle = "rgba(255,255,255,0.7)";
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(430, 338, 18, 6, 0, Math.PI * 1.1, Math.PI * 1.8);
  c.stroke();
  inkEllipse(c, 470, 356, 9, 5, "#2f9a43", 1.6);
  for (const rx of [392, 398, 404]) {
    inkLine(c, [[rx, 372], [rx - 2, 352]], "#3a8a3a", 2);
    inkEllipse(c, rx - 2, 350, 2, 5, "#8a5a2b", 1.2);
  }
  // billboard: frame only. The words change every few seconds (overlay).
  inkRect(c, 866, 372, 8, 40, 1, "#8a5a2b", 2);
  inkRect(c, 946, 372, 8, 40, 1, "#8a5a2b", 2);
  inkRect(c, 806, 306, 200, 72, 8, "#fff4d6", 3.5);
  for (let i = 0; i < 12; i++) {
    inkCircle(c, 812 + i * 16.6, 309, 2.6, "#ffe36a", 1.2);
    inkCircle(c, 812 + i * 16.6, 375, 2.6, "#ffe36a", 1.2);
  }
  flowerBed(c, 520, 490, 230);
  flowerBed(c, 330, 300, 60);
  pennants(c, 340, 940, 292, 12);
  bush(c, 306, 440, 1.2);
  bush(c, 975, 470, 1.2);
  // the starter's little platform
  inkEllipse(c, 380, 472, 26, 8, "#8a5a2b", 2.4);
}

// --- the moving bits -------------------------------------------------------

function cloudShadows(c, t) {
  c.fillStyle = "rgba(10,40,20,0.11)";
  for (let i = 0; i < 4; i++) {
    const x = ((t * (9 + i * 3) + i * 380) % (W + 500)) - 250;
    const y = 130 + i * 150 + Math.sin(t * 0.2 + i) * 14;
    c.beginPath();
    c.ellipse(x, y, 150, 34, 0, 0, Math.PI * 2);
    c.ellipse(x + 70, y - 16, 90, 28, 0, 0, Math.PI * 2);
    c.ellipse(x - 80, y + 10, 80, 24, 0, 0, Math.PI * 2);
    c.fill();
  }
}

function flags(c, t) {
  const [ix, iy] = pointOnRadius(innerRailRadius(), 0);
  const [ox, oy] = pointOnRadius(outerRailRadius(), 0);
  for (const [py, col] of [[iy, PAL.red], [oy, PAL.blue]]) {
    c.beginPath();
    c.moveTo(ix + 3, py - 52);
    for (let k = 0; k <= 8; k++) c.lineTo(ix + 3 + k * 3.5, py - 52 + Math.sin(t * 8 + k * 0.8) * 3 * (k / 8));
    for (let k = 8; k >= 0; k--) c.lineTo(ix + 3 + k * 3.5, py - 40 + Math.sin(t * 8 + k * 0.8) * 3 * (k / 8));
    c.closePath();
    inkFill(c, col, 2);
  }
}

function billboard(c, t) {
  const idx = Math.floor(t / 3.2) % SPONSORS.length;
  const age = (t % 3.2) / 3.2;
  const a = Math.min(1, age * 8, (1 - age) * 8);
  c.save();
  c.globalAlpha = Math.max(0, a);
  inkText(c, SPONSORS[idx][0], 906, 328, SPONSORS[idx][0].length > 14 ? 17 : 21, PAL.red, { align: "center", sw: 3 });
  plainText(c, SPONSORS[idx][1], 906, 356, 10.5, "#4a3b6b", { align: "center" });
  c.restore();
}

function duck(g, c, t) {
  const k = t * 0.5;
  const x = 440 + Math.cos(k) * 30;
  const y = 348 + Math.sin(k) * 9;
  const dir = Math.sin(k) > 0 ? -1 : 1; // moving right when sin is falling... close enough
  c.save();
  c.translate(x, y + Math.sin(t * 4) * 0.8);
  c.scale(dir, 1);
  c.strokeStyle = "rgba(255,255,255,0.7)";
  c.lineWidth = 1.6;
  c.beginPath();
  c.ellipse(0, 6, 14, 3.4, 0, 0, Math.PI * 2);
  c.stroke();
  inkEllipse(c, 0, 0, 9, 6, "#ffd93a", 2);
  inkCircle(c, 7, -7, 4.6, "#ffd93a", 2);
  inkEllipse(c, 12, -6, 3.4, 1.8, "#ff8a1f", 1.4);
  c.fillStyle = INK;
  c.beginPath();
  c.arc(8, -8.4, 1, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // The duck speaks now and then. The line changes with the race, and the duck gets stranger.
  const q = t % DUCK_EVERY;
  if (q < 2.4) {
    const line = byRace(DUCK, g.raceIndex);
    const bw = textWidth(c, line, 11) + 16;
    bubble(c, x - bw / 2, y - 44, bw, 20, x, y - 14, { r: 8, line: 2, shadow: 2 });
    plainText(c, line, x, y - 34, 11, INK, { align: "center" });
  }
}

function blimp(c, t) {
  const cycle = 52;
  const u = (t % cycle) / 20; // crosses in 20 s, then waits
  if (u > 1) return;
  const x = -160 + u * (W + 380);
  const y = 44 + Math.sin(t * 0.9) * 4;
  c.save();
  c.translate(x, y);
  // rope + banner
  inkRect(c, -250, 6, 150, 22, 3, "#fff", 2);
  inkText(c, "BET ON THE ONE IN THE HAT", -175, 18, 10.5, PAL.red, { align: "center", sw: 0, font: BODY });
  c.strokeStyle = INK;
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(-100, 14);
  c.lineTo(-62, 10);
  c.stroke();
  inkEllipse(c, 0, 0, 66, 24, "#9fb4d8", 3);
  c.fillStyle = "rgba(255,255,255,0.35)";
  c.beginPath();
  c.ellipse(-12, -9, 40, 7, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(-60, -4);
  c.lineTo(-84, -20);
  c.lineTo(-80, 0);
  c.lineTo(-84, 20);
  c.lineTo(-60, 6);
  c.closePath();
  inkFill(c, PAL.red, 2.4);
  inkRect(c, -14, 22, 30, 12, 4, "#b9b9d0", 2.2);
  inkCircle(c, -4, 28, 2.2, "#7fd3ff", 1);
  inkCircle(c, 6, 28, 2.2, "#7fd3ff", 1);
  c.restore();
}

// Where the crowd gags stand: progress around the outer stands, row 22 out.
const GAG_SPOTS = { finger: 0.075, vendor: 0.335, mascot: 0.58, fainter: 0.82 };

function gagPos(p) {
  const [x, y] = pointOnRadius(outerRailRadius() + 22, p);
  return [x, y];
}

function foamFinger(c, t) {
  const [x, y] = gagPos(GAG_SPOTS.finger);
  const wave = Math.sin(t * 6) * 0.35;
  c.save();
  c.translate(x, y);
  c.scale(1.5, 1.5);
  inkRect(c, -5, -4, 10, 14, 3, "#f2653a", 1.8);
  inkCircle(c, 0, -10, 5, "#f2c29b", 1.8);
  c.fillStyle = INK;
  c.fillRect(-2.4, -11, 1.5, 2);
  c.fillRect(1, -11, 1.5, 2);
  c.beginPath();
  c.arc(0, -8, 2, 0.1, Math.PI - 0.1);
  c.stroke();
  // giant foam finger
  c.save();
  c.translate(7, -6);
  c.rotate(-0.5 + wave);
  inkRect(c, -2.5, -26, 5, 18, 3, "#fff", 1.6);
  inkRect(c, -6, -8, 12, 12, 3, "#fff", 1.6);
  inkRect(c, -6, -2, 12, 4, 0, PAL.red, 0);
  c.restore();
  inkLine(c, [[3, -3], [7, -6]], "#f2c29b", 2);
  c.restore();
  inkText(c, "#1", x + 14, y - 36 + Math.sin(t * 6) * 1.5, 11, "#fff", { sw: 2.5 });
}

function vendor(c, t) {
  const [x, y] = gagPos(GAG_SPOTS.vendor);
  c.save();
  c.translate(x, y);
  c.scale(1.5, 1.5);
  inkRect(c, -5, -4, 10, 14, 3, "#fff", 1.8);
  inkCircle(c, 0, -10, 5, "#d9a07a", 1.8);
  inkRect(c, -6, -20, 12, 6, 2, "#fff", 1.6); // paper hat
  // tray with hot dogs
  inkRect(c, -13, 0, 26, 4, 1, "#8a5a2b", 1.6);
  for (const dx of [-8, -1, 6]) {
    inkRect(c, dx - 3, -4, 9, 4, 2, "#e8a25a", 1.2);
    c.strokeStyle = PAL.red;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(dx - 2, -2);
    c.lineTo(dx + 5, -2);
    c.stroke();
  }
  c.restore();
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.8 + i / 3) % 1;
    puff(c, x - 8 + i * 8 + Math.sin(k * 6 + i) * 2, y - 12 - k * 22, 3 + k * 2, "#fff", 0.7 * (1 - k), false);
  }
  inkText(c, "HOT DOGS", x, y + 18, 10, PAL.gold, { align: "center", sw: 2.5 });
}

function mascot(c, t) {
  const [x, y] = gagPos(GAG_SPOTS.mascot);
  const hop = Math.abs(Math.sin(t * 5)) * 7;
  c.save();
  c.translate(x, y - hop);
  c.scale(1.6, 1.6);
  inkRect(c, -6, -4, 12, 16, 4, PAL.blue, 1.8);
  inkLine(c, [[-6, 0], [-12, -8 + Math.sin(t * 10) * 4]], "#f2b48a", 2.4);
  inkLine(c, [[6, 0], [12, -8 - Math.sin(t * 10) * 4]], "#f2b48a", 2.4);
  // big horse head costume
  inkEllipse(c, 0, -14, 10, 11, "#c98c52", 2);
  inkEllipse(c, 4, -9, 8, 5.4, "#e3b07a", 1.6);
  inkCircle(c, -2, -17, 3.4, "#fff", 1.4);
  inkCircle(c, -1.4, -17, 1.4, INK, 0);
  for (const ex of [-7, 3]) {
    ctxTri(c, ex, -23, 5, 9, "#c98c52");
  }
  c.restore();
}

function ctxTri(c, x, y, w, h, fill) {
  c.beginPath();
  c.moveTo(x - w, y + h / 2);
  c.lineTo(x, y - h / 2);
  c.lineTo(x + w, y + h / 2);
  c.closePath();
  inkFill(c, fill, 1.6);
}

function fainter(c, t) {
  const [x, y] = gagPos(GAG_SPOTS.fainter);
  const cycle = t % 9;
  const down = cycle > 5.5 && cycle < 8; // tips over for a couple of seconds
  const k = down ? easeOut((cycle - 5.5) / 0.4) : 0;
  c.save();
  c.translate(x, y + 6);
  c.rotate(k * 1.45);
  c.translate(0, -6);
  c.scale(1.5, 1.5);
  inkRect(c, -5, -4, 10, 14, 3, "#8a5cff", 1.8);
  inkCircle(c, 0, -10, 5, "#f2c29b", 1.8);
  c.strokeStyle = INK;
  c.lineWidth = 1.2;
  for (const ex of [-2, 2]) {
    c.beginPath();
    if (down) {
      c.moveTo(ex - 1.2, -11.5);
      c.lineTo(ex + 1.2, -9.5);
      c.moveTo(ex + 1.2, -11.5);
      c.lineTo(ex - 1.2, -9.5);
    } else {
      c.arc(ex, -10.5, 0.8, 0, Math.PI * 2);
    }
    c.stroke();
  }
  c.restore();
  if (down) {
    for (let i = 0; i < 3; i++) {
      const a = t * 3 + (i * Math.PI * 2) / 3;
      inkStar(c, x + Math.cos(a) * 14, y - 22 + Math.sin(a) * 4, 3, PAL.gold, 1);
    }
  }
}

// A chicken that crosses the track during setup, with an opinion.
function chicken(g, c, t) {
  if (g.state !== "setup") return;
  const cycle = 16;
  const u = ((t + 3) % cycle) / 6; // crosses in 6 s, then waits
  if (u > 1) return;
  const inner = innerRailRadius();
  const outer = outerRailRadius();
  const x = 560;
  const y = CY + outer - 6 - u * (outer - inner - 12);
  const hop = Math.abs(Math.sin(t * 9)) * 3;
  c.save();
  c.translate(x, y - hop);
  c.fillStyle = "rgba(60,30,10,0.3)";
  c.beginPath();
  c.ellipse(0, hop + 8, 9, 3, 0, 0, Math.PI * 2);
  c.fill();
  inkLine(c, [[-2, 4], [-2 + Math.sin(t * 18) * 3, 9]], "#ff8a1f", 1.4);
  inkLine(c, [[3, 4], [3 - Math.sin(t * 18) * 3, 9]], "#ff8a1f", 1.4);
  inkEllipse(c, 0, 0, 9, 7, "#fff", 2);
  inkEllipse(c, -2, 1, 5, 3.4, "#e8e8f0", 1);
  inkCircle(c, 0, -9, 4.6, "#fff", 2);
  ctxTri(c, 2, -15, 2, 4, PAL.red);
  ctxTri(c, -1, -15, 2, 5, PAL.red);
  c.beginPath();
  c.moveTo(4, -9);
  c.lineTo(9, -8);
  c.lineTo(4, -7);
  c.closePath();
  inkFill(c, "#ffb02a", 1.2);
  c.fillStyle = INK;
  c.beginPath();
  c.arc(1.6, -10, 1, 0, Math.PI * 2);
  c.fill();
  c.restore();
  if (u > 0.25 && u < 0.75) {
    const line = byRace(CHICKEN, g.raceIndex);
    const bw = textWidth(c, line, 12) + 18;
    bubble(c, x - bw / 2, y - 56, bw, 22, x - 2, y - 20, { r: 8, line: 2, shadow: 2 });
    plainText(c, line, x, y - 45, 12, INK, { align: "center" });
  }
}

// Everything behind the horses. The crowd is drawn by the caller, after this.
export function drawScenery(g) {
  const c = g.ctx;
  const t = g.time;
  c.drawImage(getLayer(g, `track${N}`, paintTrack), 0, 0, W, H);
  cloudShadows(c, t);
  flags(c, t);
  billboard(c, t);
  duck(g, c, t);
  chicken(g, c, t);
}

// Things that stand in front of the crowd and above the horses.
export function drawGags(g) {
  const c = g.ctx;
  const t = g.time;
  foamFinger(c, t);
  vendor(c, t);
  mascot(c, t);
  fainter(c, t);
}

export function drawSky(g) {
  blimp(g.ctx, g.time);
}
