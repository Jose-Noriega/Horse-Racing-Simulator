// The six screens, drawn Flash style. Each function takes the game and only draws.
// The game still owns every rule, rect and key. Hit boxes here match game.js.

import * as settings from "./settings.js";
import { amountOnWin, displayedTicketMultiplier, displayedWinMultiplier, formatPlayer, isParlay, totalPool } from "./betting.js";
import { shortNum } from "./ui.js";
import {
  INK, PAL, BODY, DISPLAY, css, hash, easeOut, easeBack, clamp01,
  getLayer, panel, candyButton, ribbon, wobbleText, burst, puff, inkHeart, inkEllipse, inkLine, inkText, plainText, fitText, wrapText, bubble, marquee, inkRect, inkCircle, inkStar, inkFill, textWidth,
} from "./art.js";
import { drawPortrait, drawBookie, drawHorse, makeDemoHorse } from "./characters.js";
import { shakeOffset, poolBump, drawBettingFx } from "./fx.js";
import { BADGES, CORNER_TITLE, DNF_NOTE, isMistake, NO_BETS, NO_BETS_BUBBLE, PICK_HINT, PLATES, REFUND_BUBBLE, SUMMARY_NONE } from "./words.js";

const W = settings.SCREEN_WIDTH;
const H = settings.SCREEN_HEIGHT;
const N = settings.HORSES_PER_RACE;
const BADGE = BADGES[Math.floor(Math.random() * BADGES.length)]; // the menu burst, picked once per page load
const RACES = settings.RACES_PER_SESSION;

const BUTTON_KIND = {
  "Place Bet": "green",
  "Clear Picks": "red",
  "Undo Bet": "blue",
  "Start Race": "gold",
  "Go!": "gold",
  "Back to Bets": "blue",
  "Next Race": "gold",
  "View Card Summary": "gold",
  "Back to Menu": "blue",
  "Start Race Card": "gold",
};

// Replaces Game.drawButton. Hover and press come from the mouse like before.
export function drawButtonArt(g, btn, pulse = false) {
  const over = btn.enabled && btn.hit(g.mouse);
  if (over) g.hoverButton = true;
  candyButton(g.ctx, btn.x, btn.y, btn.w, btn.h, btn.label, {
    kind: BUTTON_KIND[btn.label] ?? "blue",
    enabled: btn.enabled,
    over,
    pressed: over && g.mouse.down,
    pulse: pulse ? 0.5 + 0.5 * Math.sin(g.time * 4) : 0,
    size: btn.h >= 44 ? 24 : 19,
  });
}

// Plain rect with a hit test. Same shape as the game's TextBox, so game.js can use it.
function hitRect(x, y, w, h) {
  return { x, y, w, h, hit: (p) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h };
}

// --- backdrops (cached) ----------------------------------------------------

function paintBetBackdrop(c) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#35206b");
  g.addColorStop(1, "#1a1233");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // diagonal stripes
  c.save();
  c.fillStyle = "rgba(255,255,255,0.045)";
  for (let x = -H; x < W; x += 70) {
    c.beginPath();
    c.moveTo(x, H);
    c.lineTo(x + 30, H);
    c.lineTo(x + 30 + H, 0);
    c.lineTo(x + H, 0);
    c.fill();
  }
  c.restore();
  // doodles: stars and horseshoes scattered. Same hash, same spots, every time.
  for (let i = 0; i < 46; i++) {
    const x = hash(i * 3) * W;
    const y = hash(i * 3 + 1) * H;
    c.save();
    c.globalAlpha = 0.12 + hash(i * 3 + 2) * 0.1;
    c.translate(x, y);
    c.rotate(hash(i + 99) * 6.28);
    if (i % 3 === 0) {
      c.strokeStyle = "#ffc928";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(0, 0, 11, Math.PI * 0.15, Math.PI * 0.85, true);
      c.stroke();
    } else {
      inkStar(c, 0, 0, 6 + hash(i) * 6, "#ffffff", 0);
    }
    c.restore();
  }
  const v = c.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 760);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.45)");
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
}

// The wooden counter along the bottom. Drawn after the bookie so he stands behind it.
// Left edges for the brass plates. Right-aligned to the screen edge with a gap,
// so a longer label pushes the others left.
function plateXs(labels) {
  const w = (l) => l.length * 7.6 + 16;
  let x = 1278;
  const out = [];
  for (let k = labels.length - 1; k >= 0; k--) {
    x -= w(labels[k]);
    out[k] = [k === 0 ? 40 : x, labels[k]];
    x -= 8;
  }
  return out;
}

function paintCounter(c) {
  const top = 676;
  const wood = c.createLinearGradient(0, top, 0, H);
  wood.addColorStop(0, "#c8803c");
  wood.addColorStop(1, "#8e5624");
  c.fillStyle = wood;
  c.fillRect(0, top, W, H - top);
  c.strokeStyle = "rgba(60,30,10,0.45)";
  c.lineWidth = 2;
  for (let x = 90; x < W; x += 170) {
    c.beginPath();
    c.moveTo(x, top);
    c.lineTo(x, H);
    c.stroke();
  }
  c.fillStyle = "#e6a15a"; // the bright top lip
  c.fillRect(0, top, W, 6);
  c.strokeStyle = INK;
  c.lineWidth = 3.5;
  c.beginPath();
  c.moveTo(0, top);
  c.lineTo(W, top);
  c.stroke();
  // chalkboard for the status line
  c.beginPath();
  c.roundRect(334, 681, 612, 34, 6);
  c.fillStyle = "#24402e";
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = "#7a4a1e";
  c.stroke();
  c.lineWidth = 2;
  c.strokeStyle = INK;
  c.stroke();
  // brass plates
  /* for (const [x, label] of plateXs(PLATES)) {
    c.beginPath();
    c.roundRect(x, 690, label.length * 7.6 + 16, 20, 4);
    c.fillStyle = "#e9c46a";
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = INK;
    c.stroke();
    c.fillStyle = "#4a3410";
    c.font = `bold 11px ${BODY}`;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(label, x + 8, 700.5);
  } */
}

// --- betting ---------------------------------------------------------------

function drawBox(g, box, text, active, hint) {
  const ctx = g.ctx;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 8);
  ctx.fillStyle = "#fff";
  ctx.fill();
  if (active) {
    ctx.save();
    ctx.shadowColor = css(PAL.gold);
    ctx.shadowBlur = 10;
    ctx.lineWidth = 4;
    ctx.strokeStyle = css(PAL.orange);
    ctx.stroke();
    ctx.restore();
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x + 3, box.y, box.w - 6, box.h);
  ctx.clip();
  if (text) {
    const cursor = active && Math.floor(g.time * 2) % 2 === 0 ? "|" : "";
    const shown = text + cursor;
    // keep the end of the text visible when it is too long
    const over = textWidth(ctx, shown, 17) - (box.w - 18);
    plainText(ctx, shown, box.x + 9 - Math.max(0, over), box.y + box.h / 2 + 1, 17, INK);
  } else {
    plainText(ctx, hint + (active && Math.floor(g.time * 2) % 2 === 0 ? "|" : ""), box.x + 9, box.y + box.h / 2 + 1, 15, "#a89fb8", { bold: false });
  }
  ctx.restore();
}

export function drawBettingScreen(g) {
  const { ctx } = g;
  const t = g.time;
  ctx.drawImage(getLayer(g, "betbg", paintBetBackdrop), 0, 0, W, H);
  ribbon(ctx, W / 2, 34, 300, 40, `RACE ${g.raceIndex + 1} OF ${RACES}`);

  // ---- left: the field
  const fieldH = Math.max(520, 62 + N * 54 + 8);
  panel(ctx, 24, 70, 460, fieldH, { fill: PAL.navy });
  inkText(ctx, "PICK FINISH ORDER", 40, 90, 24, PAL.gold, { sw: 4 });
  plainText(ctx, "1 horse = win, 2-3 = parlay", 40, 116, 13, "#b9b4d8", { bold: false });

  g.laneRects = [];
  const maxP = Math.max(...g.field.map((h) => g.winProbs[h.id] ?? 0), 1e-9);
  let y = 132;
  g.field.forEach((horse, i) => {
    const rect = hitRect(40, y, 420, 48);
    g.laneRects.push(rect);
    const pickIdx = g.selectedLanes.indexOf(i);
    const picked = pickIdx >= 0;
    const hover = rect.hit(g.mouse);
    const lift = hover && !picked ? -1.5 : 0;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y + lift, rect.w, rect.h, 10);
    ctx.fillStyle = picked ? css(PAL.gold) : hover ? "#4a4d92" : css(PAL.navy2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    const cy = rect.y + rect.h / 2 + lift;
    drawPortrait(ctx, horse, rect.x + 28, cy, 38, { mood: picked ? "happy" : "neutral", t });
    const ink = picked ? INK : "#fff";
    const sub = picked ? "#5a4210" : "#c9c4ec";
    plainText(ctx, fitText(ctx, `${picked ? pickIdx + 1 : i + 1}. ${horse.name}`, 270, 17), rect.x + 56, cy - 9, 17, ink);
    const p = g.winProbs[horse.id] ?? 0;
    plainText(ctx, `Win chance ${(100 * p).toFixed(1)}%`, rect.x + 56, cy + 11, 13, sub);
    // little bar in the horse's lane color
    const bx = rect.x + 180;
    const bw = 150;
    ctx.beginPath();
    ctx.roundRect(bx, cy + 6, bw, 10, 5);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(bx, cy + 6, Math.max(8, (p / maxP) * bw), 10, 5);
    ctx.fillStyle = css(horse.color);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (picked) {
      inkStar(ctx, rect.x + rect.w - 24, cy, 17, PAL.red, 2.4, -Math.PI / 2 + Math.sin(t * 3) * 0.15);
      inkText(ctx, String(pickIdx + 1), rect.x + rect.w - 24, cy + 1, 17, "#fff", { align: "center", sw: 3 });
    }
    y += 54;
  });

  // ---- middle: the betting slip (shakes when a bet is rejected)
  const sx = shakeOffset(g);
  ctx.save();
  ctx.translate(sx, 0);
  panel(ctx, 500, 70, 360, 310, { fill: PAL.cream, hi: false });
  // ticket notches on the sides
  ctx.fillStyle = "#2b1d55";
  for (const [nx, ny] of [[500, 200], [860, 200]]) {
    ctx.beginPath();
    ctx.arc(nx, ny, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = "rgba(28,18,38,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(512, 200);
  ctx.lineTo(848, 200);
  ctx.stroke();
  ctx.restore();
  inkText(ctx, "* BETTING SLIP *", 680, 81, 16, PAL.navy, { align: "center", sw: 0 });
  plainText(ctx, "PLAYER #", 520, 98, 12, "#6a5f86");
  plainText(ctx, "NAME", 620, 98, 12, "#6a5f86");
  plainText(ctx, "WAGER $", 520, 158, 12, "#6a5f86");
  drawBox(g, g.playerBox, g.playerText, g.activeField === "player", "#");
  drawBox(g, g.nameBox, g.nameText, g.activeField === "name", "name");
  drawBox(g, g.wagerBox, g.wagerText, g.activeField === "wager", "10");

  // what is on the slip right now: tag + little faces
  const picks = g.selectedLanes.map((i) => g.field[i]).filter(Boolean);
  const tag = picks.length > 1 ? "PARLAY" : "WIN";
  if (!picks.length) {
    plainText(ctx, PICK_HINT, 520, 220, 14, "#9a90b4", { bold: false });
  } else {
    const tw = textWidth(ctx, tag, 14, DISPLAY, false) + 16;
    ctx.beginPath();
    ctx.roundRect(520, 209, tw, 22, 6);
    inkFill(ctx, picks.length > 1 ? PAL.plum : PAL.green, 2.4);
    inkText(ctx, tag, 520 + tw / 2, 220, 14, "#fff", { align: "center", sw: 2.5 });
    const room = 845 - (520 + tw + 8);
    const each = room / picks.length;
    picks.forEach((h, k) => {
      const px = 520 + tw + 8 + k * each;
      drawPortrait(ctx, h, px + 11, 220, 22, { mood: "happy", t });
      const label = k < picks.length - 1 ? `${h.name} >` : h.name;
      plainText(ctx, fitText(ctx, label, each - 28, 12.5), px + 26, 220, 12.5, INK);
    });
  }
  if (g.selectedLanes.length >= 2) {
    const mult = displayedTicketMultiplier(g.pool, g.selectedLanes.map((i) => g.field[i].id), g.field, g.winProbs);
    if (mult) plainText(ctx, `Est. parlay ${mult.toFixed(2)}x`, 520, 241, 12.5, "#6a2a9c");
  }

  g.btnUndoBet.enabled = g.pool.undoStack.length > 0;
  for (const b of [g.btnPlaceBet, g.btnClearPicks, g.btnUndoBet, g.btnStartRace]) drawButtonArt(g, b);
  ctx.restore();

  // ---- the bets pad
  panel(ctx, 500, 388, 360, 202, { fill: PAL.paper, hi: false, r: 10 });
  ctx.fillStyle = "#2b1d55";
  for (let k = 0; k < 14; k++) {
    ctx.beginPath();
    ctx.arc(516 + k * 25.5, 392, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(60,90,200,0.28)";
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 9; k++) {
    ctx.beginPath();
    ctx.moveTo(510, 424 + k * 19);
    ctx.lineTo(850, 424 + k * 19);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(220,60,60,0.45)";
  ctx.beginPath();
  ctx.moveTo(538, 402);
  ctx.lineTo(538, 586);
  ctx.stroke();
  inkText(ctx, "BETS", 516, 410, 20, PAL.red, { sw: 3.5 });
  const total = g.pool.bets.length;
  if (total > 8) plainText(ctx, `(+${total - 8} earlier)`, 846, 410, 12, "#7a6a30", { align: "right" });
  if (!total) {
    plainText(ctx, NO_BETS, 548, 438, 15, "#8a7a40", { bold: false });
  } else {
    const live = new Set(g.pool.bets);
    for (const k of g.betSeen.keys()) if (!live.has(k)) g.betSeen.delete(k);
    ctx.save();
    ctx.beginPath();
    ctx.rect(504, 398, 352, 188);
    ctx.clip(); // rows slide in from the right, and used to run under the tote board
    g.pool.bets.slice(-8).forEach((bet, i) => {
      if (!g.betSeen.has(bet)) g.betSeen.set(bet, t);
      const a = easeOut((t - g.betSeen.get(bet)) / 0.3);
      const cy = 434 + i * 19;
      const dx = Math.trunc((1 - a) * 30);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(dx, 0);
      const par = isParlay(bet);
      ctx.beginPath();
      ctx.roundRect(512, cy - 8, 20, 16, 4);
      inkFill(ctx, par ? PAL.plum : PAL.green, 2);
      inkText(ctx, par ? "P" : "W", 522, cy + 0.5, 12, "#fff", { align: "center", sw: 2 });
      const names = bet.horseIds.map((hid) => g.field.find((h) => h.id === hid)?.name ?? "?");
      plainText(ctx, fitText(ctx, formatPlayer(bet.playerNumber, bet.personName), 96, 13.5), 544, cy, 13.5, INK);
      plainText(ctx, fitText(ctx, names.join(" > "), 128, 13), 644, cy, 13, "#3a2f66");
      plainText(ctx, `$${shortNum(bet.amount)}`, 846, cy, 13.5, "#1d6a2a", { align: "right" });
      ctx.restore();
    });
    ctx.restore(); // the pad clip
  }

  // ---- right: the tote board
  const boardH = Math.max(520, 106 + N * 42 + 12);
  panel(ctx, 880, 70, 370, boardH, { fill: "#16101f" });
  marquee(ctx, 888, 78, 354, boardH - 16, t);
  inkText(ctx, "TOTE BOARD", 1065, 98, 28, PAL.gold, { align: "center", sw: 5 });
  // the pool, big and amber, bumps when a coin lands
  const bump = poolBump(g);
  ctx.save();
  ctx.translate(1065, 127);
  ctx.scale(1 + bump * 0.12, 1 + bump * 0.12);
  ctx.beginPath();
  ctx.roundRect(-150, -17, 300, 34, 8);
  ctx.fillStyle = "#050308";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = bump > 0 ? "#fff3a0" : css(PAL.orange);
  ctx.stroke();
  inkText(ctx, "POOL", -138, 1, 15, "#ff9c2a", { sw: 0 });
  inkText(ctx, `$${shortNum(totalPool(g.pool))}`, 138, 1, 26, bump > 0 ? "#fff3a0" : "#ffb62e", { align: "right", sw: 0 });
  ctx.restore();
  plainText(ctx, "Estimated payout if this horse wins; odds can move", 900, 154, 11.5, "#b9a36a", { bold: false });

  const w = parseFloat(g.wagerText);
  const example = Number.isNaN(w) ? 0 : w;
  let py = 176;
  for (const horse of g.field) {
    const onH = amountOnWin(g.pool, horse.id);
    const odds = displayedWinMultiplier(g.pool, horse.id, g.winProbs);
    ctx.beginPath();
    ctx.roundRect(898, py - 2, 336, 38, 8);
    ctx.fillStyle = "#241a35";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#3d2f58";
    ctx.stroke();
    drawPortrait(ctx, horse, 919, py + 17, 28, { mood: "neutral", t });
    plainText(ctx, fitText(ctx, horse.name, 118, 14.5), 940, py + 9, 14.5, "#fff");
    const ex = odds !== null && example > 0 ? `($${shortNum(example, 0)}->$${shortNum(example * odds)})` : "";
    plainText(ctx, fitText(ctx, ex, 120, 11.5), 940, py + 26, 11.5, "#8fdc9a", { bold: false });
    inkText(ctx, odds === null ? "—" : `${odds.toFixed(2)}x`, 1224, py + 13, 25, "#ffb62e", { align: "right", sw: 0 });
    if (onH > 0) plainText(ctx, `on 1st: $${shortNum(onH, 0)}`, 1224, py + 29, 11, "#8fb8ff", { align: "right", bold: false });
    py += 42;
  }

  // ---- bottom: the bookie behind his counter
  ctx.save();
  ctx.translate(96, 676); // scale him up from the counter line so he stays behind it
  ctx.scale(1.2, 1.2);
  ctx.translate(-96, -676);
  drawBookie(ctx, 96, 642, t, g.art.mood, false, g.mouse);
  ctx.restore();
  ctx.drawImage(getLayer(g, "counter", paintCounter), 0, 0, W, H);
  if (g.statusMessage) {
    const err = isMistake(g.statusMessage);
    plainText(ctx, fitText(ctx, g.statusMessage, 584, 15.5), W / 2 + 4, 698, 15.5, err ? "#ff9d9d" : "#f2f2e4", { align: "center" });
  }
  drawBettingFx(g);
}

// --- menu ------------------------------------------------------------------

function hill(c, baseY, amp, seed, color) {
  c.beginPath();
  c.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) {
    c.lineTo(x, baseY + Math.sin(x * 0.006 + seed) * amp + Math.sin(x * 0.017 + seed * 2) * amp * 0.4);
  }
  c.lineTo(W, H);
  c.closePath();
  inkFill(c, color, 3);
}

function paintMenuBg(c) {
  const sky = c.createLinearGradient(0, 0, 0, 470);
  sky.addColorStop(0, "#4fb8f5");
  sky.addColorStop(1, "#d9f5ff");
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  hill(c, 400, 38, 1.2, "#9be07f");
  hill(c, 448, 30, 3.4, "#74cb65");
  // the dirt strip the horses run on
  const dirt = c.createLinearGradient(0, 505, 0, H);
  dirt.addColorStop(0, "#e2a964");
  dirt.addColorStop(1, "#bf7f3f");
  c.fillStyle = dirt;
  c.fillRect(0, 505, W, H - 505);
  c.strokeStyle = INK;
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(0, 505);
  c.lineTo(W, 505);
  c.stroke();
  c.setLineDash([14, 12]);
  c.strokeStyle = "rgba(255,244,214,0.5)";
  c.lineWidth = 3;
  for (const y of [586, 650]) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  c.setLineDash([]);
  // rail posts
  for (let x = 20; x < W; x += 64) {
    inkRect(c, x - 4, 478, 8, 30, 2, "#fff", 2.4);
    inkCircle(c, x, 476, 4.4, PAL.red, 2);
  }
  c.strokeStyle = INK;
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(0, 490);
  c.lineTo(W, 490);
  c.stroke();
  c.strokeStyle = "#fff";
  c.lineWidth = 3.4;
  c.stroke();
}

function sun(c, x, y, t) {
  burst(c, x, y, 96, 66, 14, t * 0.3);
  inkFill(c, "#ffd93a", 3.4);
  inkCircle(c, x, y, 50, "#ffe65c", 3.4);
  // sunglasses
  inkRect(c, x - 40, y - 16, 32, 20, 8, "#14101f", 2.4);
  inkRect(c, x + 8, y - 16, 32, 20, 8, "#14101f", 2.4);
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x - 8, y - 8);
  c.lineTo(x + 8, y - 8);
  c.stroke();
  c.fillStyle = "rgba(255,255,255,0.7)";
  c.fillRect(x - 34, y - 12, 8, 3);
  c.fillRect(x + 14, y - 12, 8, 3);
  c.beginPath();
  c.arc(x, y + 8, 22, 0.2, Math.PI - 0.2);
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.stroke();
}

function cloud(c, x, y, s) {
  // one path for the whole cloud so there are no outlines between the lumps
  c.beginPath();
  for (const [dx, dy, r] of [[0, 0, 34], [40, 8, 26], [-38, 10, 24], [18, -16, 24], [-16, -14, 22]]) {
    c.moveTo(x + (dx + r) * s, y + dy * s);
    c.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
  }
  c.lineWidth = 3.4;
  c.lineJoin = "round";
  c.strokeStyle = INK;
  c.stroke();
  c.fillStyle = "#fff";
  c.fill();
}

function glove(c, x, y, rot) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  inkRect(c, 14, -12, 20, 24, 4, PAL.red, 2.4); // cuff
  inkRect(c, -34, -6, 50, 14, 7, "#fff", 2.6); // finger
  inkEllipse(c, 16, 0, 16, 17, "#fff", 2.6);
  inkRect(c, -6, 6, 20, 12, 6, "#fff", 2.4);
  c.restore();
}

export function drawMenuScreen(g) {
  const { ctx: c } = g;
  const t = g.time;
  c.drawImage(getLayer(g, "menubg", paintMenuBg), 0, 0, W, H);
  // rays behind the logo
  c.save();
  c.translate(W / 2, 190);
  c.rotate(t * 0.08);
  burst(c, 0, 0, 760, 40, 18);
  c.fillStyle = "rgba(255,255,255,0.2)";
  c.fill();
  c.restore();
  sun(c, 1110, 128, t);
  for (const [x0, y0, s, sp] of [[0, 70, 1, 14], [380, 160, 0.8, 9], [820, 60, 0.7, 11], [1000, 230, 1, 7], [180, 280, 0.6, 12]]) {
    cloud(c, ((x0 + t * sp) % (W + 300)) - 150, y0 + Math.sin(t * 0.5 + x0) * 4, s);
  }

  // horses running past on three lanes, bigger toward the front
  const lanes = [{ y: 548, s: 1.05, v: 150, n: 3 }, { y: 612, s: 1.3, v: 195, n: 3 }, { y: 682, s: 1.6, v: 240, n: 3 }];
  lanes.forEach((ln, li) => {
    for (let k = 0; k < ln.n; k++) {
      const span = W + 360;
      const x = ((t * ln.v + (k * span) / ln.n + li * 170) % span) - 180;
      const id = (li * 3 + k) % settings.TOTAL_HORSES;
      const horse = { id, color: settings.HORSE_COLORS[id % settings.HORSE_COLORS.length] };
      for (let d = 0; d < 3; d++) puff(c, x - 40 * ln.s - d * 14, ln.y + 14 - d * 3, (7 + d * 2) * ln.s * 0.8, [236, 208, 168], 0.7 - d * 0.18, true);
      drawHorse(c, x, ln.y, 0, horse, x / (36 * ln.s), true, { mood: "happy", face: "grin", t, scale: ln.s });
    }
  });

  // the logo
  wobbleText(c, "HORSE RACING", W / 2, 158, 124, t, [PAL.gold, "#fff", PAL.pink, "#9be7ff"], { sw: 16, amp: 7, tilt: 0.07 });
  ribbon(c, W / 2, 262, 380, 58, "SIMULATOR", 46, PAL.blue);
  // badge
  c.save();
  c.translate(1000, 332);
  c.rotate(-0.25 + Math.sin(t * 2) * 0.04);
  burst(c, 0, 0, 74, 54, 13, t * 0.4);
  inkFill(c, PAL.red, 3.2);
  inkText(c, BADGE[0], 0, -14, 17, "#fff", { align: "center", sw: 3.5 });
  inkText(c, BADGE[1], 0, 9, BADGE[1].length > 11 ? 17 : 22, PAL.gold, { align: "center", sw: 4 });
  c.restore();
  // plank sign
  const sign = `${RACES} races, ${N} horses each`;
  const sw = textWidth(c, sign, 18) + 40;
  c.beginPath();
  c.roundRect(W / 2 - sw / 2, 318, sw, 38, 8);
  inkFill(c, "#c98c4a", 3.2);
  plainText(c, sign, W / 2, 338, 18, "#3a220e", { align: "center" });

  g.btnStartCard.w = 300;
  g.btnStartCard.h = 64;
  g.btnStartCard.centerAt(W / 2, 424);
  g.drawButton(g.btnStartCard, true);
  glove(c, 840 + Math.sin(t * 6) * 8, 434, Math.PI);
  inkText(c, "or press Enter", W / 2, 474, 15, "#fff", { align: "center", sw: 3.5, font: BODY, bold: true });
  inkText(c, "F9 mute   F fullscreen", 12, H - 12, 13, "#fff", { sw: 3.2, font: BODY, bold: true });
  if (g.secret) inkCircle(c, W - 16, H - 16, 5, "#8a1c1c", 2); // faint tell that secret mode is on
}

// --- results ---------------------------------------------------------------

function crown(c, x, y, s) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.beginPath();
  c.moveTo(-14, 0);
  c.lineTo(-17, -17);
  c.lineTo(-8, -9);
  c.lineTo(0, -22);
  c.lineTo(8, -9);
  c.lineTo(17, -17);
  c.lineTo(14, 0);
  c.closePath();
  inkFill(c, PAL.gold, 2.6);
  inkCircle(c, 0, -6, 2.4, PAL.red, 1.4);
  c.restore();
}

function podiumStep(c, cx, top, w, base, color, num, name, win, t) {
  c.beginPath();
  c.roundRect(cx - w / 2, top, w, base - top, 8);
  c.fillStyle = "rgba(10,5,25,0.4)";
  c.save();
  c.translate(5, 5);
  c.fill();
  c.restore();
  c.beginPath();
  c.roundRect(cx - w / 2, top, w, base - top, 8);
  inkFill(c, color, 3.5);
  c.beginPath();
  c.roundRect(cx - w / 2 + 5, top + 5, w - 10, 12, 4);
  c.fillStyle = "rgba(255,255,255,0.3)";
  c.fill();
  inkText(c, String(num), cx, top + 32, 38, "#fff", { align: "center", sw: 6 });
  plainText(c, fitText(c, name, w - 14, 14.5), cx, top + 55, 14.5, "#fff", { align: "center" });
  plainText(c, win, cx, top + 71, 12, "#fff", { align: "center", bold: false });
}

function raincloud(c, x, y, t) {
  puff(c, x, y, 24, "#7d86a8", 1, true);
  puff(c, x + 26, y + 5, 17, "#7d86a8", 1, true);
  c.strokeStyle = "#7fd3ff";
  c.lineWidth = 2.4;
  c.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const k = (t * 1.6 + i / 6) % 1;
    c.globalAlpha = 1 - k;
    c.beginPath();
    c.moveTo(x - 18 + i * 9, y + 18 + k * 40);
    c.lineTo(x - 20 + i * 9, y + 26 + k * 40);
    c.stroke();
  }
  c.globalAlpha = 1;
}

export function drawResultsScreen(g) {
  const { ctx: c } = g;
  const t = g.time;
  c.drawImage(getLayer(g, "betbg", paintBetBackdrop), 0, 0, W, H);
  ribbon(c, W / 2, 34, 340, 40, `RACE ${g.raceIndex + 1} RESULTS`, 30);
  if (!g.raceResult) {
    inkText(c, "No result yet.", W / 2, 200, 30, "#fff", { align: "center" });
    return;
  }
  const ordered = g.raceResult.ordered;
  const age = t - g.stateStart;
  const pct = (h) => `win ${(100 * (g.winProbs[h.id] ?? 0)).toFixed(1)}%`;

  // podium
  panel(c, 40, 76, 560, 296, { fill: PAL.navy });
  c.save();
  c.beginPath();
  c.roundRect(43, 79, 554, 290, 12);
  c.clip();
  c.translate(320, 250);
  c.rotate(t * 0.15);
  burst(c, 0, 0, 380, 30, 16);
  c.fillStyle = "rgba(255,201,40,0.13)";
  c.fill();
  c.restore();
  const steps = [
    { h: ordered[1], cx: 175, top: 268, w: 150, col: "#8c97b8", n: 2, size: 80 },
    { h: ordered[0], cx: 320, top: 240, w: 150, col: "#e6a91e", n: 1, size: 96 },
    { h: ordered[2], cx: 465, top: 282, w: 150, col: "#c27a3f", n: 3, size: 80 },
  ];
  for (const s of steps) {
    if (!s.h) continue;
    const rise = easeOut((age - 0.1 * (4 - s.n)) / 0.45); // steps pop up 3, 2, 1
    c.save();
    c.translate(0, (1 - rise) * 120);
    podiumStep(c, s.cx, s.top, s.w, 362, s.col, s.n, s.h.name, pct(s.h), t);
    const bob = s.n === 1 ? Math.abs(Math.sin(t * 4)) * 5 : Math.abs(Math.sin(t * 3 + s.n)) * 2;
    drawPortrait(c, s.h, s.cx, s.top - s.size / 2 - 4 - bob, s.size, { mood: s.n === 3 ? "neutral" : "happy", t });
    if (s.n === 1) crown(c, s.cx - 2, s.top - s.size - 6 - bob, 1.6);
    c.restore();
  }

  // the loser's corner
  panel(c, 40, 388, 560, 176, { fill: "#2c3250" });
  inkText(c, CORNER_TITLE, 58, 407, 20, "#9fb4d8", { sw: 3.5 });
  raincloud(c, 548, 406, t);
  const rest = ordered.slice(3);
  rest.forEach((h, i) => {
    const col = Math.floor(i / 3);
    const row = i % 3;
    const x = 58 + col * 270;
    const y = 446 + row * 38;
    const dnf = g.exploded.has(h.id);
    drawPortrait(c, h, x + 16, y, 30, { mood: dnf ? "dizzy" : "sad", t });
    const line = dnf ? `DNF  ${h.name}` : `${h.place}. ${h.name}`;
    plainText(c, fitText(c, line, 200, 15), x + 38, y - 7, 15, dnf ? "#ff8a8a" : "#e8ecff");
    plainText(c, dnf ? DNF_NOTE : pct(h), x + 38, y + 10, 12, "#9fb4d8", { bold: false });
  });

  // receipt
  panel(c, 640, 80, 580, 400, { fill: "#fffdf2", hi: false, r: 6 });
  for (const [rx, ry, rot] of [[660, 78, -0.3], [1196, 80, 0.35]]) {
    c.save();
    c.translate(rx, ry);
    c.rotate(rot);
    c.fillStyle = "rgba(255,230,120,0.8)";
    c.fillRect(-22, -8, 44, 16);
    c.restore();
  }
  inkText(c, "PAYOUTS", 664, 112, 34, PAL.navy, { sw: 0 });
  plainText(c, `RECEIPT #${String(1000 + g.raceIndex * 7 + 1)}`, 1196, 104, 12, "#8a7fa8", { align: "right" });
  c.setLineDash([6, 6]);
  c.strokeStyle = "rgba(28,18,38,0.45)";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(660, 136);
  c.lineTo(1200, 136);
  c.stroke();
  c.setLineDash([]);
  inkStar(c, 672, 160, 11, PAL.gold, 2);
  plainText(c, `Winner: ${g.raceResult.ordered[0].name}`, 692, 160, 19, "#5a3a00");

  if (g.poolRefunded || !g.lastPayouts.length) {
    // the sad gag: a crying horse and a one-liner
    const refund = g.poolRefunded;
    drawPortrait(c, ordered[ordered.length - 1], 760, 320, 130, { mood: "sad", t, bg: "#fff4d6" });
    bubble(c, 850, 262, 320, refund ? 94 : 70, 826, 300);
    const lines = refund ? REFUND_BUBBLE : NO_BETS_BUBBLE;
    lines.forEach((ln, i) => plainText(c, ln, 1010, 288 + i * 22, i === 0 ? 20 : 15.5, i === 0 ? "#b0262c" : INK, { align: "center" }));
  } else {
    const rows = g.lastPayouts;
    const maxRows = 10;
    rows.slice(0, maxRows).forEach((p, n) => {
      const y = 200 + n * 27;
      const shown = p.amount * easeOut((age - 0.5 - n * 0.3) / 1.2);
      const who = fitText(c, formatPlayer(p.playerNumber, p.personName), 300, 19);
      plainText(c, who, 664, y, 19, "#2a2150");
      const wdt = textWidth(c, who, 19);
      c.setLineDash([2, 5]);
      c.strokeStyle = "rgba(28,18,38,0.35)";
      c.beginPath();
      c.moveTo(664 + wdt + 8, y + 7);
      c.lineTo(1020, y + 7);
      c.stroke();
      c.setLineDash([]);
      plainText(c, `$${shortNum(shown)}`, 1196, y, 21, "#1d7a2a", { align: "right" });
    });
    if (rows.length > maxRows) plainText(c, `+${rows.length - maxRows} more winners`, 664, 200 + maxRows * 27, 14, "#8a7fa8", { bold: false });
    if (age > 0.5) {
      c.save();
      c.translate(1112, 158);
      c.rotate(0.2 + Math.sin(t * 3) * 0.05);
      const pop = easeBack((age - 0.5) / 0.25);
      c.scale(pop, pop);
      burst(c, 0, 0, 38, 26, 10, t);
      inkFill(c, PAL.green, 3);
      inkText(c, "KA-CHING!", 0, 1, 13, "#fff", { align: "center", sw: 3.2 });
      c.restore();
    }
  }

  g.btnNext.label = g.raceIndex + 1 >= RACES ? "View Card Summary" : "Next Race";
  g.btnNext.x = 640;
  g.btnNext.y = 520;
  g.drawButton(g.btnNext, age > 2.5);
}

// --- summary ---------------------------------------------------------------

function paintNightBg(c) {
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0e0b2b");
  sky.addColorStop(1, "#3b2a77");
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    c.globalAlpha = 0.3 + hash(i + 7) * 0.6;
    inkStar(c, hash(i) * W, hash(i + 300) * H * 0.8, 1.5 + hash(i + 50) * 2.5, "#fff", 0);
  }
  c.globalAlpha = 1;
  c.fillStyle = "#18123d"; // skyline of grandstands
  for (let x = 0; x < W; x += 48) {
    const h = 40 + hash(x) * 50;
    c.fillRect(x, H - h, 44, h);
  }
}

function fireworks(c, t) {
  const cols = ["#ff5fa2", "#ffc928", "#7fd3ff", "#8ae66a", "#ff8a1f", "#c48bff"];
  for (let k = 0; k < 7; k++) {
    const period = 2.6;
    const tt = t + k * 0.55;
    const n = Math.floor(tt / period);
    const u = (tt % period) / period;
    if (u > 0.8) continue;
    const x = 120 + hash(n * 7 + k) * (W - 240);
    const y = 90 + hash(n * 11 + k + 5) * 230;
    const col = cols[(n + k) % cols.length];
    if (u < 0.22) {
      // the rocket going up
      const ry = H - (H - y) * (u / 0.22);
      c.fillStyle = "#fff";
      c.fillRect(x - 1.5, ry, 3, 14);
      continue;
    }
    const e = (u - 0.22) / 0.58;
    const r = 120 * (1 - (1 - e) ** 2);
    c.globalAlpha = 1 - e;
    c.fillStyle = col;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const rr = r * (i % 2 ? 0.8 : 1);
      c.beginPath();
      c.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr + e * e * 30, 4.4 * (1 - e * 0.5), 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(x + Math.cos(a) * rr * 0.55, y + Math.sin(a) * rr * 0.55 + e * e * 30, 2.6 * (1 - e * 0.5), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }
}

function trophy(c, x, y, s, t) {
  c.save();
  c.translate(x, y + Math.sin(t * 2) * 4);
  c.scale(s, s);
  inkRect(c, -34, 70, 68, 16, 4, "#6b3f1f", 2.8);
  inkRect(c, -22, 54, 44, 18, 3, "#8a5a2b", 2.8);
  c.beginPath();
  c.moveTo(-8, 54);
  c.lineTo(-6, 34);
  c.lineTo(6, 34);
  c.lineTo(8, 54);
  c.closePath();
  inkFill(c, "#e6a91e", 2.8);
  for (const sd of [-1, 1]) {
    c.beginPath();
    c.arc(sd * 40, -22, 20, sd > 0 ? -Math.PI / 2 : Math.PI / 2, sd > 0 ? Math.PI / 2 : Math.PI * 1.5, false);
    c.lineWidth = 12;
    c.strokeStyle = INK;
    c.stroke();
    c.lineWidth = 6;
    c.strokeStyle = "#ffc928";
    c.stroke();
  }
  c.beginPath();
  c.moveTo(-42, -60);
  c.lineTo(42, -60);
  c.bezierCurveTo(42, -10, 24, 34, 0, 36);
  c.bezierCurveTo(-24, 34, -42, -10, -42, -60);
  c.closePath();
  inkFill(c, "#ffd93a", 3.4);
  c.fillStyle = "rgba(255,255,255,0.5)";
  c.beginPath();
  c.ellipse(-22, -28, 6, 22, 0.1, 0, Math.PI * 2);
  c.fill();
  inkStar(c, 0, -22, 18, PAL.red, 2.4);
  c.restore();
  for (let i = 0; i < 5; i++) {
    const a = t * 2 + i * 1.3;
    c.globalAlpha = 0.5 + 0.5 * Math.sin(a * 2);
    inkStar(c, x + Math.cos(a) * 90 * s * 0.6, y - 20 + Math.sin(a * 1.3) * 80 * s * 0.6, 5 + (i % 2) * 3, "#fff", 1.2, a);
  }
  c.globalAlpha = 1;
}

export function drawSummaryScreen(g) {
  const { ctx: c } = g;
  const t = g.time;
  c.drawImage(getLayer(g, "nightbg", paintNightBg), 0, 0, W, H);
  fireworks(c, t);
  wobbleText(c, "CARD COMPLETE!", W / 2, 84, 74, t, [PAL.gold, "#fff", PAL.pink, "#9be7ff"], { sw: 12, amp: 5 });
  trophy(c, 170, 360, 1.7, t);

  panel(c, 340, 160, 600, 380, { fill: PAL.navy });
  inkText(c, "FINAL PAYOUTS", 370, 190, 26, PAL.gold, { sw: 4 });
  let y = 232;
  if (!g.sessionPayouts.size) {
    drawPortrait(c, { id: 5, color: settings.HORSE_COLORS[0] }, 470, 330, 110, { mood: "sad", t });
    plainText(c, "No payouts.", 560, 320, 22, "#e8ecff");
    plainText(c, SUMMARY_NONE, 560, 350, 14, "#9fb4d8", { bold: false });
  } else {
    const ranked = [...g.sessionPayouts].sort((a, b) => b[1][1] - a[1][1]);
    const maxRows = 8;
    ranked.slice(0, maxRows).forEach(([number, [name, paid]], i) => {
      const cy = y + i * 36;
      if (i === 0) {
        c.beginPath();
        c.roundRect(356, cy - 16, 568, 32, 8);
        c.fillStyle = "rgba(255,201,40,0.25)";
        c.fill();
      }
      const medal = ["#ffc928", "#d5dbe6", "#d98a4a"][i] ?? "#4a4d92";
      inkCircle(c, 384, cy, 12, medal, 2.2);
      inkText(c, String(i + 1), 384, cy + 0.5, 14, i < 3 ? INK : "#fff", { align: "center", sw: 0 });
      plainText(c, fitText(c, formatPlayer(number, name), 330, 20), 408, cy, 20, "#fff");
      inkText(c, `$${shortNum(paid)}`, 908, cy, 24, "#8ae66a", { align: "right", sw: 3 });
    });
    if (ranked.length > maxRows) plainText(c, `+${ranked.length - maxRows} more`, 408, y + maxRows * 36, 14, "#9fb4d8", { bold: false });
  }
  g.btnSummaryMenu.centerAt(W / 2, 600);
  g.drawButton(g.btnSummaryMenu, true);
}
