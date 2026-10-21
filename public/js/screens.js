// The six screens, drawn Flash style. Each function takes the game and only draws.
// The game still owns every rule, rect and key. Hit boxes here match game.js.

import * as settings from "./settings.js";
import { amountOnWin, displayedTicketMultiplier, displayedWinMultiplier, formatPlayer, isParlay, totalPool } from "./betting.js";
import { shortNum } from "./ui.js";
import {
  INK, PAL, BODY, DISPLAY, css, hash, easeOut, easeBack, clamp01,
  panel, candyButton, inkText, plainText, fitText, wrapText, bubble, marquee, inkRect, inkCircle, inkStar, inkFill, textWidth,
} from "./art.js";
import { drawPortrait, drawBookie, quirks } from "./characters.js";
import { getLayer, bookieLine, shakeOffset, poolBump, drawBettingFx } from "./fx.js";

const W = settings.SCREEN_WIDTH;
const H = settings.SCREEN_HEIGHT;
const N = settings.HORSES_PER_RACE;
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
  for (const [x, label] of [[40, "WINDOW 3"], [1080, "NO REFUNDS*"], [1190, "*SOMETIMES"]]) {
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
  }
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

function drawRibbon(ctx, cx, cy, w, h, text) {
  ctx.fillStyle = css(PAL.red);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * (w / 2 - 8), cy - h / 2 + 8);
    ctx.lineTo(cx + s * (w / 2 + 34), cy - h / 2 + 8);
    ctx.lineTo(cx + s * (w / 2 + 20), cy + 2 + 8);
    ctx.lineTo(cx + s * (w / 2 + 34), cy + h / 2 + 8);
    ctx.lineTo(cx + s * (w / 2 - 8), cy + h / 2 + 8);
    ctx.closePath();
    inkFill(ctx, "#a5262c", 3);
  }
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 6);
  inkFill(ctx, PAL.red, 3.5);
  ctx.beginPath();
  ctx.roundRect(cx - w / 2 + 5, cy - h / 2 + 5, w - 10, h - 10, 3);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  inkText(ctx, text, cx, cy + 1, 30, "#fff", { align: "center", sw: 5 });
}

export function drawBettingScreen(g) {
  const { ctx } = g;
  const t = g.time;
  ctx.drawImage(getLayer(g, "betbg", paintBetBackdrop), 0, 0, W, H);
  drawRibbon(ctx, W / 2, 34, 300, 40, `RACE ${g.raceIndex + 1} OF ${RACES}`);

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
    plainText(ctx, "Pick a horse from the list", 520, 220, 14, "#9a90b4", { bold: false });
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
    plainText(ctx, "(none yet)", 548, 438, 15, "#8a7a40", { bold: false });
  } else {
    const live = new Set(g.pool.bets);
    for (const k of g.betSeen.keys()) if (!live.has(k)) g.betSeen.delete(k);
    g.pool.bets.slice(-8).forEach((bet, i) => {
      if (!g.betSeen.has(bet)) g.betSeen.set(bet, t);
      const a = easeOut((t - g.betSeen.get(bet)) / 0.3);
      const cy = 434 + i * 19;
      const dx = Math.trunc((1 - a) * 60);
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
  plainText(ctx, "If this horse wins", 900, 154, 12.5, "#b9a36a", { bold: false });

  const w = parseFloat(g.wagerText);
  const example = Number.isNaN(w) ? 0 : w;
  let py = 176;
  for (const horse of g.field) {
    const onH = amountOnWin(g.pool, horse.id);
    const odds = displayedWinMultiplier(g.pool, horse.id, g.winProbs, example > 0 ? example : 1);
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
  const line = bookieLine(g);
  const talking = g.time < g.art.talkUntil;
  ctx.save();
  ctx.translate(96, 676); // scale him up from the counter line so he stays behind it
  ctx.scale(1.2, 1.2);
  ctx.translate(-96, -676);
  drawBookie(ctx, 96, 642, t, g.art.mood, talking, g.mouse);
  ctx.restore();
  ctx.drawImage(getLayer(g, "counter", paintCounter), 0, 0, W, H);
  if (line) {
    const lines = wrapText(ctx, line, 430, 16, 2);
    const bh = 22 + lines.length * 19;
    const by = 622 - bh / 2;
    bubble(ctx, 184, by, 470, bh, 140, 606);
    lines.forEach((ln, k) => plainText(ctx, ln, 180 + 235, by + 11 + 9.5 + k * 19, 16, INK, { align: "center" }));
  }
  if (g.statusMessage) {
    const err = !/^(Win|Parlay) |^Bet undone|^Picks cleared/.test(g.statusMessage);
    plainText(ctx, fitText(ctx, g.statusMessage, 584, 15.5), W / 2 + 4, 698, 15.5, err ? "#ff9d9d" : "#f2f2e4", { align: "center" });
  }
  drawBettingFx(g);
}
