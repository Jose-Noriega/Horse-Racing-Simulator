// Horse + jockey characters. Everything is drawn with canvas paths.
// Each horse has a hat or prop and a face quirk set in the roster, so the same horse
// looks the same on the betting screen, in the race and on the podium.
// Coat color is the lane color. That is how you match a bet to a horse.

import { accentOf } from "./horses_data.js";
import { ACCESSORIES, TRAITS } from "./settings.js";
import { INK, PAL, css, shade, hash, inkFill, inkCircle, inkEllipse, inkRect, inkLine, inkStar, inkText } from "./art.js";

export { ACCESSORIES, TRAITS };

// Honest. The hat and face come from the roster, so they follow the horse's name.
export function quirks(horse) {
  return { acc: horse.acc, trait: horse.trait, body: horse.body ?? "horse" };
}

// Coat colors that are very dark need a lighter mane or it vanishes.
function maneColor(coat) {
  const lum = coat[0] * 0.3 + coat[1] * 0.59 + coat[2] * 0.11;
  return lum < 110 ? [235, 225, 200] : shade(coat, -0.5);
}

// --- the head --------------------------------------------------------------
// Head space: origin at the eye, +x toward the nose, +y down. About 30 wide, 28 tall.
// Callers translate + scale before calling. mood: happy, neutral, scared, sad, dizzy.

function headShape(ctx) {
  ctx.beginPath();
  ctx.moveTo(-8, -3);
  ctx.quadraticCurveTo(-8, -10, 0, -10);
  ctx.bezierCurveTo(8, -10, 14, -5, 19, 0);
  ctx.quadraticCurveTo(24, 4, 20.5, 8.5);
  ctx.quadraticCurveTo(17, 11.5, 11, 9.5);
  ctx.quadraticCurveTo(4, 8.5, -1, 6.5);
  ctx.quadraticCurveTo(-8, 5.5, -8, -3);
  ctx.closePath();
}

// Big slanted black almond with a glossy highlight. Much bigger than sunglasses on purpose,
// and it tilts, so the two never read as the same thing.
function alienEye(ctx) {
  ctx.save();
  ctx.translate(3.6, -2.4);
  ctx.rotate(0.55);
  inkEllipse(ctx, 0, 0, 7.2, 4.2, "#0a0a12", 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.ellipse(-2.4, -1.5, 2.2, 0.9, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(2.6, 1.2, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// A robot eye: a dark visor with a red light sweeping across it.
function visorEye(ctx, t) {
  inkRect(ctx, -3.5, -6.4, 13, 6.4, 2, "#1d2433", 1.8);
  const sx = 0.5 + (Math.sin(t * 3) + 1) * 3.2;
  ctx.save();
  ctx.shadowColor = "#ff3b30";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#ff5448";
  ctx.fillRect(sx - 1, -4.8, 2.6, 3.2);
  ctx.restore();
}

// Red glowing eye in a dark socket, with an angry brow.
function glowingEye(ctx) {
  inkCircle(ctx, 3, -3, 3.6, "#1a0e12", 1.8);
  ctx.save();
  ctx.shadowColor = "#ff4020";
  ctx.shadowBlur = 9;
  ctx.fillStyle = "#ff5a3c";
  ctx.beginPath();
  ctx.arc(3, -3, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#ffe9b0";
  ctx.beginPath();
  ctx.arc(3.2, -3.2, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-0.5, -8.6);
  ctx.lineTo(6.4, -5.6);
  ctx.stroke();
}

// A purple and a green spiral arm turning inside a dark socket. For the physics horses.
function vortexEye(ctx, t) {
  inkCircle(ctx, 3, -3, 4, "#120a24", 1.8);
  ctx.save();
  ctx.beginPath();
  ctx.arc(3, -3, 3.6, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(3, -3);
  ctx.rotate(t * 3);
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  for (const [color, offset] of [["#b36bff", 0], ["#4dff9a", Math.PI]]) {
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    for (let a = 0; a <= 5.2; a += 0.25) {
      const r = 0.4 + a * 0.62;
      const px = Math.cos(a + offset) * r;
      const py = Math.sin(a + offset) * r;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function eyes(ctx, trait, mood, t) {
  const goofy = trait === "goofy";
  if (mood === "dizzy") {
    // spiral eye: three arcs
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let a = 0; a < 12; a += 0.3) {
      const r = 0.5 + a * 0.3;
      const px = 3 + Math.cos(a + t * 6) * r;
      const py = -3 + Math.sin(a + t * 6) * r;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    return;
  }
  if (trait === "alien") return alienEye(ctx);
  if (trait === "visor") return visorEye(ctx, t);
  if (trait === "glowing") return glowingEye(ctx);
  if (trait === "vortex") return vortexEye(ctx, t);
  // hollow: a plain black socket, no white, no pupil, no shine. Keeps the brow below
  const hollow = trait === "hollow";
  if (hollow) inkEllipse(ctx, 3, -3, 3.9, 4.6, "#050508", 1.8);
  else inkCircle(ctx, 3, -3, 3.6, "#fff", 1.8);
  let px = 4.2;
  let py = -3;
  let pr = 1.8;
  if (goofy) {
    px = 1.8 + Math.sin(t * 5) * 0.5;
    py = -2.2;
    pr = 2.1;
  }
  if (mood === "scared") pr = 1.1;
  if (mood === "sad") py = -2;
  if (!hollow) {
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px - 0.5, py - 0.6, 0.6, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }
  // brow
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (mood === "happy") {
    ctx.moveTo(0, -8.4);
    ctx.lineTo(6.2, -9);
  } else if (mood === "scared") {
    ctx.moveTo(-0.5, -7);
    ctx.lineTo(6, -9.6);
  } else if (mood === "sad") {
    ctx.moveTo(0, -9.2);
    ctx.lineTo(6, -7.2);
  } else {
    ctx.moveTo(0, -8);
    ctx.lineTo(6.2, -8.2);
  }
  ctx.stroke();
  if (mood === "sad") {
    // one big tear
    ctx.beginPath();
    ctx.ellipse(2.5, 3 + ((t * 6) % 3), 1.1, 1.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#7fd3ff";
    ctx.fill();
  }
}

function mouth(ctx, trait, mood, t) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  if (mood === "scared" || trait === "grin") {
    // open grin with teeth
    ctx.beginPath();
    ctx.moveTo(19.5, 6.8);
    ctx.quadraticCurveTo(15, 10, 10, 7.4);
    ctx.lineTo(19.5, 6.8);
    ctx.closePath();
    ctx.fillStyle = mood === "scared" ? INK : "#fff";
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(19.5, 7);
    ctx.quadraticCurveTo(15, mood === "sad" ? 6 : 9, 11, 7.6);
    ctx.stroke();
  }
  if (trait === "buckteeth") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(15.2, 7.2, 2.6, 3.4);
    ctx.fillRect(17.9, 7, 2.4, 3.2);
    ctx.lineWidth = 1;
    ctx.strokeRect(15.2, 7.2, 2.6, 3.4);
    ctx.strokeRect(17.9, 7, 2.4, 3.2);
  }
  if (trait === "tongue") {
    const wag = Math.sin(t * 9) * 1.2;
    ctx.beginPath();
    ctx.moveTo(15, 8);
    ctx.quadraticCurveTo(14 + wag, 15, 16.5 + wag, 15.5);
    ctx.quadraticCurveTo(19, 14, 18, 8);
    ctx.closePath();
    inkFill(ctx, "#ff6f91", 1.4);
  }
}

function gear(ctx, acc, t) {
  switch (acc) {
    case "sunglasses":
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-1, -4);
      ctx.lineTo(-9, -6);
      ctx.stroke();
      inkEllipse(ctx, 3.2, -3, 5.6, 4.2, "#111", 1.8);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillRect(0.8, -5.4, 2.4, 1.2);
      break;
    case "tophat":
      inkEllipse(ctx, -1, -9.5, 9, 2.6, "#222", 1.8);
      inkRect(ctx, -6, -23, 10, 14, 1.5, "#2a2a2a", 1.8);
      ctx.fillStyle = css(PAL.red);
      ctx.fillRect(-5.2, -13.5, 8.4, 3);
      break;
    case "mustache":
      ctx.beginPath();
      ctx.moveTo(16.5, 5);
      ctx.bezierCurveTo(12, 3, 9, 6, 8.5, 9.5);
      ctx.bezierCurveTo(11, 7.8, 13.5, 8.2, 16.5, 7.2);
      ctx.bezierCurveTo(19.5, 8.2, 22, 7.6, 23.5, 9.8);
      ctx.bezierCurveTo(23, 6, 20.5, 3.6, 16.5, 5);
      ctx.closePath();
      inkFill(ctx, "#4a2c17", 1.4);
      break;
    case "bandana":
      ctx.beginPath();
      ctx.moveTo(-8, -3);
      ctx.quadraticCurveTo(-8, -10, 0, -10);
      ctx.bezierCurveTo(4, -10, 8, -9, 10, -7.5);
      ctx.lineTo(8, -4.4);
      ctx.quadraticCurveTo(0, -6.5, -8, -3);
      ctx.closePath();
      inkFill(ctx, PAL.red, 1.8);
      ctx.fillStyle = "#fff";
      for (const [dx, dy] of [[-3, -7.6], [1, -8.2], [5, -7]]) {
        ctx.beginPath();
        ctx.arc(dx, dy, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      // knot tails
      inkLine(ctx, [[-8, -4], [-12, -1 + Math.sin(t * 8)]], PAL.red, 1.8);
      inkLine(ctx, [[-8, -5], [-13, -4 + Math.sin(t * 8 + 1)]], PAL.red, 1.8);
      break;
    case "helmet":
      ctx.beginPath();
      ctx.arc(0, -6.5, 9.8, Math.PI, 0);
      ctx.closePath();
      inkFill(ctx, "#f4f4f4", 2);
      ctx.fillStyle = css(PAL.blue);
      ctx.fillRect(-1.4, -16.2, 2.8, 9.6);
      break;
    case "partyhat":
      ctx.beginPath();
      ctx.moveTo(-4, -9);
      ctx.lineTo(5, -9.5);
      ctx.lineTo(0.5, -24);
      ctx.closePath();
      inkFill(ctx, PAL.pink, 1.8);
      ctx.strokeStyle = css(PAL.gold);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-2.2, -13.5);
      ctx.lineTo(3.2, -14);
      ctx.moveTo(-0.8, -18);
      ctx.lineTo(2.2, -18.2);
      ctx.stroke();
      inkCircle(ctx, 0.5, -24.5, 2.2, PAL.gold, 1.4);
      break;
    case "monocle":
      ctx.beginPath();
      ctx.arc(3.4, -3, 5, 0, Math.PI * 2);
      ctx.strokeStyle = "#d4a017";
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(3.4, 2);
      ctx.quadraticCurveTo(5, 8, 2, 14);
      ctx.stroke();
      break;
    case "bowtie":
      ctx.save();
      ctx.translate(-3, 7);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-6, -3.6);
      ctx.lineTo(-6, 3.6);
      ctx.closePath();
      ctx.moveTo(0, 0);
      ctx.lineTo(6, -3.6);
      ctx.lineTo(6, 3.6);
      ctx.closePath();
      inkFill(ctx, PAL.pink, 1.6);
      inkCircle(ctx, 0, 0, 1.9, PAL.red, 1.4);
      ctx.restore();
      break;
    case "flower":
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        inkCircle(ctx, -1 + Math.cos(a) * 3.1, -10.5 + Math.sin(a) * 3.1, 2.3, "#fff", 1.2);
      }
      inkCircle(ctx, -1, -10.5, 1.9, PAL.gold, 1.2);
      break;
    case "crown":
      ctx.beginPath();
      ctx.moveTo(-6, -9.5);
      ctx.lineTo(-6.5, -18);
      ctx.lineTo(-3, -14);
      ctx.lineTo(0, -19.5);
      ctx.lineTo(3, -14);
      ctx.lineTo(6.5, -18);
      ctx.lineTo(6, -9.5);
      ctx.closePath();
      inkFill(ctx, PAL.gold, 1.8);
      inkCircle(ctx, 0, -12.5, 1.3, PAL.red, 1);
      break;
    case "propeller": {
      ctx.beginPath();
      ctx.arc(0, -7, 8.4, Math.PI, 0);
      ctx.closePath();
      inkFill(ctx, PAL.blue, 1.8);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -15.4);
      ctx.lineTo(0, -18);
      ctx.stroke();
      const sx = Math.cos(t * 22) * 8;
      inkEllipse(ctx, 0, -18.6, Math.max(0.8, Math.abs(sx)), 1.6, PAL.red, 1.4);
      break;
    }
    case "chef":
      // tall puffy white hat: three puffs, then a band that hides their bottoms
      for (const [px, py, pr] of [[-4.2, -15.5, 4], [4.2, -15.5, 4], [0, -18, 4.6]]) inkCircle(ctx, px, py, pr, "#fff", 1.6);
      inkRect(ctx, -6, -12.6, 12, 3.6, 1.2, "#fff", 1.8);
      ctx.strokeStyle = "rgba(60,50,80,0.35)"; // two pleats on the band
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-2, -12.2);
      ctx.lineTo(-2, -9.4);
      ctx.moveTo(2, -12.2);
      ctx.lineTo(2, -9.4);
      ctx.stroke();
      break;
    case "cowboy":
      inkEllipse(ctx, -1, -9.6, 13, 3.2, "#9a6b3a", 1.8);
      ctx.beginPath();
      ctx.moveTo(-6, -9.6);
      ctx.quadraticCurveTo(-6.5, -19.5, -2.5, -17.5);
      ctx.quadraticCurveTo(0, -15.5, 2.5, -17.5);
      ctx.quadraticCurveTo(5.5, -19.5, 4.5, -9.6);
      ctx.closePath();
      inkFill(ctx, "#b67d44", 1.8);
      ctx.fillStyle = "#5a3a1a";
      ctx.fillRect(-5.6, -12.4, 10, 2);
      break;
    case "headband":
      ctx.beginPath();
      ctx.moveTo(-8, -3.4);
      ctx.quadraticCurveTo(-8, -9.4, -1, -9.8);
      ctx.bezierCurveTo(4, -9.8, 8, -8.4, 10.4, -6.2);
      ctx.lineTo(9, -3.6);
      ctx.quadraticCurveTo(0, -6.6, -8, -3.4);
      ctx.closePath();
      inkFill(ctx, PAL.orange, 1.6);
      inkLine(ctx, [[-8, -4.4], [-12, -3 + Math.sin(t * 7)]], PAL.orange, 1.8);
      break;
    case "beard":
      // one big ginger mass from the cheek to the chin, with a bumpy bottom edge and a few strands
      ctx.beginPath();
      ctx.moveTo(0, 5.5);
      ctx.bezierCurveTo(-0.5, 11, 2, 14.5, 5, 16);
      ctx.quadraticCurveTo(6.5, 21, 10, 18.8);
      ctx.quadraticCurveTo(12.2, 23.5, 15, 19.5);
      ctx.quadraticCurveTo(18.5, 22, 20.4, 16);
      ctx.quadraticCurveTo(23, 12.5, 21.8, 8.8);
      ctx.lineTo(14, 9.2);
      ctx.quadraticCurveTo(6, 8, 0, 5.5);
      ctx.closePath();
      inkFill(ctx, "#c9692a", 1.8);
      ctx.strokeStyle = "rgba(255,196,130,0.6)";
      ctx.lineWidth = 1.1;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const [x1, y1, cx, cy, x2, y2] of [[5.5, 10.5, 4.5, 14, 6.5, 17.5], [10.5, 11, 9.5, 15, 11, 19.5], [15.5, 11, 15.5, 15, 15.5, 20], [19.5, 11.5, 19.8, 14, 19.3, 16.5]]) {
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(cx, cy, x2, y2);
      }
      ctx.stroke();
      break;
    case "wig":
      // powdered white wig: curls on top and rolled curls at the back, with a black bow
      for (const [px, py, pr] of [[-9, 2.5, 2.9], [-9.5, -2.2, 3.3], [-8, -6.4, 3.4]]) inkCircle(ctx, px, py, pr, "#f4f1ea", 1.5);
      for (const [px, py, pr] of [[-5, -11.5, 4], [1.2, -13.8, 4.6], [7.2, -11.2, 3.6]]) inkCircle(ctx, px, py, pr, "#f4f1ea", 1.5);
      inkCircle(ctx, -11.8, -3.6, 1.7, "#2a2230", 1.1);
      break;
    case "clownwig": {
      // big puffs in clown colors, plus a red clown nose so it can't be mistaken for anything else
      const puffColors = ["#ff5fa2", "#ffd23f", "#4dd2ff", "#7dff7a", "#ff7a2f"];
      [[-9, 1.5, 4.2], [-10, -4.5, 4.8], [-6.5, -11, 5], [0, -14, 5.6], [6.5, -11.6, 4.6]].forEach(([px, py, pr], k) => {
        inkCircle(ctx, px, py, pr, puffColors[k], 1.6);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.arc(px - pr * 0.25, py - pr * 0.25, pr * 0.4, 0, Math.PI * 2);
        ctx.fill();
      });
      inkCircle(ctx, 20.4, 3.4, 3, "#ff3b3b", 1.5);
      break;
    }
    case "wizard":
      // wide brim, tall bent cone, a few stars
      inkEllipse(ctx, 0.5, -9.6, 11, 3, "#4b2f8f", 1.8);
      ctx.beginPath();
      ctx.moveTo(-6, -10);
      ctx.quadraticCurveTo(-2.5, -17, 4.5, -25);
      ctx.quadraticCurveTo(4, -17, 6.8, -10);
      ctx.closePath();
      inkFill(ctx, "#5b3fa6", 1.8);
      inkStar(ctx, 0.5, -15, 2.2, "#ffd23f", 0.8);
      inkStar(ctx, 3.6, -20, 1.5, "#ffd23f", 0.6);
      break;
    case "unicorn": {
      // spiral horn on the forehead, tilted forward
      ctx.beginPath();
      ctx.moveTo(2.6, -9.4);
      ctx.lineTo(9, -9.1);
      ctx.lineTo(10.4, -28);
      ctx.closePath();
      inkFill(ctx, "#fff6d8", 1.8);
      ctx.strokeStyle = "#e9a82b";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (const f of [0.22, 0.42, 0.62, 0.8]) {
        ctx.moveTo(2.6 + 7.8 * f, -9.4 - 18.6 * f);
        ctx.lineTo(9 + 1.4 * f, -9.1 - 18.9 * f);
      }
      ctx.stroke();
      break;
    }
    case "antennae": {
      // two wobbly antennae with glowing tips
      const w = Math.sin(t * 5) * 1.2;
      inkLine(ctx, [[1, -9.6], [-1.5 + w, -16], [-3.5 + w, -21.5]], "#9aa4b5", 1.4);
      inkLine(ctx, [[7, -9.6], [9.5 - w, -16], [12 - w, -21.5]], "#9aa4b5", 1.4);
      inkCircle(ctx, -3.5 + w, -22, 2.2, "#ff5a5a", 1.3);
      inkCircle(ctx, 12 - w, -22, 2.2, "#7dffb0", 1.3);
      break;
    }
    case "cyborg": {
      // metal plate over the back of the head. Clipped to the head so it follows the shape
      ctx.save();
      headShape(ctx);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(-9, -11);
      ctx.lineTo(7, -11);
      ctx.lineTo(10, -6);
      ctx.lineTo(3, 0);
      ctx.lineTo(-2, 6);
      ctx.lineTo(-9, 6);
      ctx.closePath();
      inkFill(ctx, "#4a5368", 2);
      ctx.strokeStyle = "rgba(255,255,255,0.28)"; // a shine along the top edge
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-7, -8.5);
      ctx.lineTo(5, -8.5);
      ctx.stroke();
      for (const [rx, ry] of [[-5.5, -6.5], [0, -6.2], [-5.5, 1]]) inkCircle(ctx, rx, ry, 0.95, "#c9d2e0", 0.8);
      ctx.restore();
      ctx.save();
      ctx.shadowColor = "#ff3b30";
      ctx.shadowBlur = 5;
      inkCircle(ctx, -2.5, -2.5, 1.3, "#ff5a5a", 0.8);
      ctx.restore();
      break;
    }
    default:
  }
}

function lashLines(ctx, trait, mood) {
  if (trait !== "lashes" || mood === "dizzy") return;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of [[0.4, -5.6, -1.4, -8], [2.6, -6.4, 2, -9.2], [5, -6, 6, -8.6]]) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
}

// Spots and the cow tail tuft: dark on a light coat, a darker shade on a dark one.
function spotColor(coat) {
  const lum = coat[0] * 0.3 + coat[1] * 0.59 + coat[2] * 0.11;
  return lum > 150 ? [44, 40, 48] : shade(coat, -0.45);
}

// A duck head: round, with a flat orange bill and a little tuft. Same head space as the horse.
function drawDuckHead(ctx, coat, acc, trait, mood, t) {
  inkLine(ctx, [[2, -10.2], [1.4, -12.6], [3.2, -13.6]], shade(coat, -0.1), 1.6); // one small curl
  inkEllipse(ctx, 5, -1, 12, 10.5, coat, 2);
  ctx.fillStyle = css(shade(coat, 0.3));
  ctx.beginPath();
  ctx.ellipse(8, 4, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(13, -1.5);
  ctx.quadraticCurveTo(21, -3, 28, 1.5);
  ctx.quadraticCurveTo(29.5, 4.8, 25.5, 5.6);
  ctx.quadraticCurveTo(18, 6.4, 13, 5);
  ctx.closePath();
  inkFill(ctx, "#ff9d2e", 2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(14.5, 2.6);
  ctx.lineTo(27, 3.6);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(20, 0.3, 1, 0.7, 0.3, 0, Math.PI * 2);
  ctx.fill();
  eyes(ctx, trait, mood, t);
  lashLines(ctx, trait, mood);
  gear(ctx, acc, t);
}

// A cow head: the long horse face with side ears, small horns, a spot and a big pink muzzle.
function drawCowHead(ctx, coat, acc, trait, mood, t) {
  inkEllipse(ctx, -8, -6.5, 5.2, 2.3, shade(coat, -0.2), 1.6, -0.35); // back ear
  inkLine(ctx, [[-1.5, -9.5], [-3.5, -14], [-1, -16.5]], [240, 232, 205], 2.6); // horn
  headShape(ctx);
  inkFill(ctx, coat, 2);
  ctx.save();
  headShape(ctx);
  ctx.clip();
  ctx.fillStyle = css(spotColor(coat));
  ctx.beginPath();
  ctx.ellipse(-3, -2, 5, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  inkEllipse(ctx, 18, 5.2, 6.8, 5.6, [247, 168, 184], 1.8); // muzzle
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(20.6, 3.6, 1, 1.5, 0.4, 0, Math.PI * 2);
  ctx.fill();
  inkEllipse(ctx, -4.5, -9.5, 5.6, 2.6, coat, 1.8, -0.5); // front ear
  eyes(ctx, trait, mood, t);
  lashLines(ctx, trait, mood);
  mouth(ctx, trait, mood, t);
  gear(ctx, acc, t);
}

// The whole head: ears, face, quirk, hat. coat is [r, g, b]. t is seconds for wiggles.
export function drawHead(ctx, coat, acc, trait, mood = "neutral", t = 0, opt = {}) {
  const { charred = false, body = "horse", mane: maneOverride = null } = opt;
  if (!charred && body === "duck") return drawDuckHead(ctx, coat, acc, trait, mood, t);
  if (!charred && body === "cow") return drawCowHead(ctx, coat, acc, trait, mood, t);
  const skin = charred ? [48, 44, 48] : coat;
  const earIn = charred ? "#554" : "#ff9fb8";
  const mane = maneOverride ?? maneColor(coat);
  // mane running down the back of the head and onto the neck, behind everything else.
  // Same spiky look as the neck mane in drawHorse, and the forelock below is its front end.
  // A charred head has none, it burned off
  if (!charred) {
    ctx.beginPath();
    ctx.moveTo(3, -9);
    ctx.lineTo(-1, -13.5);
    ctx.lineTo(-2.5, -10.5);
    ctx.lineTo(-6, -14);
    ctx.lineTo(-6.5, -9);
    ctx.lineTo(-11.5, -10.5);
    ctx.lineTo(-9.5, -5);
    ctx.lineTo(-13.5, -3);
    ctx.lineTo(-9, 0.5);
    ctx.lineTo(-12, 5);
    ctx.lineTo(-6, 5.5);
    ctx.lineTo(-5, 9);
    ctx.lineTo(0, 6);
    ctx.lineTo(2, 2);
    ctx.closePath();
    inkFill(ctx, mane, 1.6);
  }
  // back ear
  ctx.beginPath();
  ctx.moveTo(-6, -8);
  ctx.lineTo(-6.5, -17);
  ctx.lineTo(-0.5, -9.5);
  ctx.closePath();
  inkFill(ctx, shade(skin, -0.2), 1.8);
  headShape(ctx);
  inkFill(ctx, skin, 2);
  // muzzle patch and cheek shade
  ctx.save();
  headShape(ctx);
  ctx.clip();
  ctx.fillStyle = css(shade(skin, 0.35));
  ctx.beginPath();
  ctx.ellipse(18, 6, 6, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(shade(skin, -0.18));
  ctx.beginPath();
  ctx.ellipse(-4, 5, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // front ear
  ctx.beginPath();
  ctx.moveTo(-3, -9);
  ctx.lineTo(-2, -19);
  ctx.lineTo(4, -9.4);
  ctx.closePath();
  inkFill(ctx, skin, 1.8);
  ctx.beginPath();
  ctx.moveTo(-1.8, -10.4);
  ctx.lineTo(-1.5, -16);
  ctx.lineTo(1.6, -10.6);
  ctx.closePath();
  ctx.fillStyle = earIn;
  ctx.fill();
  // forelock tuft, the front end of the mane
  if (!charred) {
    ctx.beginPath();
    ctx.moveTo(-2, -10);
    ctx.quadraticCurveTo(4, -17, 8, -9.5);
    ctx.quadraticCurveTo(3, -11, -2, -10);
    inkFill(ctx, mane, 1.6);
  }
  // nostril
  ctx.beginPath();
  ctx.ellipse(18.4, 3.4, 1.2, 1.8, 0.5, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  eyes(ctx, trait, charred ? "dizzy" : mood, t);
  if (!charred) lashLines(ctx, trait, mood);
  mouth(ctx, trait, mood, t);
  if (charred) {
    // bandage across the nose, soot patches
    ctx.save();
    ctx.translate(13, 0);
    ctx.rotate(-0.5);
    inkRect(ctx, -6, -1.8, 12, 3.6, 1, "#fff", 1.4);
    ctx.strokeStyle = "#e8433a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1, -1.5);
    ctx.lineTo(-1, 1.5);
    ctx.moveTo(2, -1.5);
    ctx.lineTo(2, 1.5);
    ctx.stroke();
    ctx.restore();
    return;
  }
  gear(ctx, acc, t);
}

// --- the portrait ----------------------------------------------------------
// A round frame with the head in it. x, y is the middle. size is the frame diameter.
// Hats are allowed to poke out of the frame. That is on purpose.
export function drawPortrait(ctx, horse, x, y, size, opt = {}) {
  const { mood = "happy", t = 0, ring = INK, bg = "#fff4d6", flip = false } = opt;
  const { acc, trait, body } = quirks(horse);
  const r = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = css(bg);
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  const k = size / 40;
  ctx.scale(flip ? -k : k, k);
  ctx.translate(-6, 3); // head-space center is about (6, -3). nudge so the face fills the frame
  drawHead(ctx, horse.coat, acc, trait, mood, t, { body, mane: horse.mane });
  ctx.restore();
}

// --- the jockey ------------------------------------------------------------
// Drawn in horse space (see drawHorse). face: "grin", "worried", "neutral", "dizzy".
function drawJockey(ctx, accent, lean, face, t, charred) {
  const skin = charred ? "#3a3030" : "#f2c29b";
  const silk = charred ? "#4a4440" : "#ffffff";
  // boot
  inkEllipse(ctx, 0.5, -3.5, 3, 2.2, "#5a3a1a", 1.6);
  // body
  ctx.save();
  ctx.translate(lean * 0.6, -11);
  ctx.rotate(0.35 + lean * 0.04);
  inkEllipse(ctx, 0, 0, 4.6, 6.2, silk, 2);
  if (!charred) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.4, 6, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = css(accent);
    ctx.fillRect(-5, -1.2, 10, 3.2); // sash in the accent color
    ctx.restore();
  }
  ctx.restore();
  // arm to the reins
  const hx = 12 + lean * 0.3;
  inkLine(ctx, [[lean * 1.2 + 1, -14], [hx - 3, -16.5], [hx, -17.5]], silk, 2.4);
  inkCircle(ctx, hx + 0.6, -17.6, 1.7, skin, 1.2);
  // head
  const hxp = lean * 1.4 + 4.6;
  const hyp = -21.4;
  inkCircle(ctx, hxp, hyp, 5, skin, 2);
  // helmet in the accent color with a little brim and a pom. Blown off in a wreck
  if (!charred) {
    ctx.beginPath();
    ctx.arc(hxp, hyp - 0.4, 5.3, Math.PI * 1.02, Math.PI * 1.98);
    ctx.lineTo(hxp + 7.4, hyp - 1.3);
    ctx.closePath();
    inkFill(ctx, accent, 1.8);
    inkCircle(ctx, hxp - 0.4, hyp - 6.2, 1.5, "#fff", 1.1);
  }
  // face
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 1.1;
  if (face === "dizzy") {
    for (const ex of [hxp + 0.4, hxp + 3.4]) {
      ctx.beginPath();
      ctx.moveTo(ex - 0.9, hyp + 0.2);
      ctx.lineTo(ex + 0.9, hyp + 1.9);
      ctx.moveTo(ex + 0.9, hyp + 0.2);
      ctx.lineTo(ex - 0.9, hyp + 1.9);
      ctx.stroke();
    }
  } else {
    for (const ex of [hxp + 0.6, hxp + 3.3]) {
      ctx.beginPath();
      ctx.arc(ex, hyp + 0.9, face === "worried" ? 1.15 : 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.beginPath();
  if (face === "grin") {
    ctx.moveTo(hxp + 0.2, hyp + 3.1);
    ctx.quadraticCurveTo(hxp + 2.4, hyp + 5.4, hxp + 4.5, hyp + 2.9);
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
  } else if (face === "worried") {
    ctx.ellipse(hxp + 2.4, hyp + 3.7, 1.2, 1.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    // sweat drop that jumps
    const jump = (t * 5) % 2;
    ctx.beginPath();
    ctx.ellipse(hxp - 4.4, hyp - 1.6 + jump, 1, 1.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#7fd3ff";
    ctx.fill();
  } else {
    ctx.moveTo(hxp + 0.8, hyp + 3.6);
    ctx.lineTo(hxp + 4, hyp + 3.5);
    ctx.stroke();
  }
}

// --- the whole horse -------------------------------------------------------
// Same legs table as sprites.js so hoof sounds land on drawn steps.
const LEGS = [[9, 0.0], [6, 0.5], [-9, 0.25], [-6, 0.75]];
const SCALE = 0.95;

// x, y is the middle of the horse. heading only picks left or right.
// phase is leg cycles. opt: { mood, face, charred, t }
export function drawHorse(ctx, x, y, heading, horse, phase, running, opt = {}) {
  const { mood = "neutral", face = "neutral", charred = false, t = 0, scale = 1 } = opt;
  const { acc, trait, body } = quirks(horse);
  const kind = charred ? "horse" : body; // a charred duck is just a charred horse
  const dir = Math.cos(heading) >= 0 ? 1 : -1;
  const a = phase * 2 * Math.PI;
  const coat = charred ? [46, 42, 46] : horse.coat;
  const bob = running ? -Math.abs(Math.sin(a)) * 2 : 0;
  const squash = running ? Math.cos(2 * a) * 0.07 : 0; // lowest at each landing, stretched in the air
  const uniform = charred ? [70, 66, 62] : accentOf(horse); // saddle cloth + leg wraps, same color as the rider

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * SCALE * scale, SCALE * scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // shadow blob on the dirt
  ctx.fillStyle = "rgba(60,30,10,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 16, 20, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs. back ones first so the front ones overlap
  const legColor = kind === "duck" ? [240, 146, 44] : shade(coat, -0.18);
  for (const [hipX, off] of [LEGS[2], LEGS[3], LEGS[0], LEGS[1]]) {
    const swing = running ? Math.sin(a + off * 2 * Math.PI) : 0;
    const lift = running ? Math.max(0, Math.cos(a + off * 2 * Math.PI)) * 4.5 : 0;
    const hip = [hipX, 3 + bob];
    const knee = [hipX + swing * 3.5 + (hipX > 0 ? 2 : -1), 9.5 - lift * 0.4];
    const foot = [hipX + swing * 7.5, 15.5 - lift];
    if (charred) {
      // a wreck has no legs, just short stumps (the legs are flying around, see drawHorsePart)
      inkLine(ctx, [hip, [hipX + 0.5, 8 + bob]], legColor, 3.4);
      continue;
    }
    inkLine(ctx, [hip, knee, foot], legColor, 3.4);
    // leg wrap: a short, slightly fatter stretch of the lower leg
    const wrap = (u) => [knee[0] + (foot[0] - knee[0]) * u, knee[1] + (foot[1] - knee[1]) * u];
    inkLine(ctx, [wrap(0.45), wrap(0.85)], uniform, 4.4);
    if (kind === "duck") inkEllipse(ctx, foot[0] + 1.4, foot[1] + 0.9, 3.8, 1.3, legColor, 1.4); // webbed foot
    else inkEllipse(ctx, foot[0] + 0.6, foot[1] + 0.8, 2.6, 1.8, "#3a2a22", 1.4);
  }

  // everything above the legs stretches and squashes together
  ctx.save();
  ctx.translate(0, 12);
  ctx.scale(1 - squash * 0.7, 1 + squash);
  ctx.translate(0, -12);

  // tail
  const mane = horse.mane ?? maneColor(coat);
  const wave = running ? Math.sin(a) * 3 : 0;
  if (charred) {
    // burned off: a wreck has no tail and no mane
  } else if (kind === "duck") {
    // three tail feathers fanned out
    for (const [dx, dy] of [[-8, -6], [-9.5, -2], [-8, 2]]) {
      inkLine(ctx, [[-14, -4 + bob], [-14 + dx, -4 + dy + wave * 0.4 + bob]], shade(coat, -0.12), 3.4);
    }
  } else if (kind === "cow") {
    // thin tail with a dark tuft
    inkLine(ctx, [[-14, -5 + bob], [-19, -2 + wave * 0.4 + bob], [-21, 5 + wave + bob]], shade(coat, -0.2), 1.8);
    inkCircle(ctx, -21, 6 + wave + bob, 2.6, [40, 36, 44], 1.4);
  } else {
    inkLine(ctx, [[-14, -5 + bob], [-21, -9 + wave * 0.5 + bob], [-26, -4 + wave + bob], [-24, 3 + wave + bob]], mane, 4.2);
  }

  // body
  inkEllipse(ctx, 0, -3 + bob, 17, 9, coat, 2.6);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -3 + bob, 16, 8, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = css(shade(coat, 0.3));
  ctx.beginPath();
  ctx.ellipse(-3, -8 + bob, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(shade(coat, -0.2));
  ctx.beginPath();
  ctx.ellipse(2, 5 + bob, 17, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (kind === "cow") {
    // spots, clipped to the body
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -3 + bob, 16, 8, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = css(spotColor(coat));
    for (const [sx, sy, rx, ry] of [[-8, -5, 5, 3.2], [5, 1, 4.5, 3], [-2, 4, 3, 2.2], [11, -6, 2.6, 2]]) {
      ctx.beginPath();
      ctx.ellipse(sx, sy + bob, rx, ry, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (kind === "duck") inkEllipse(ctx, -4, -2 + bob, 8.5, 4.6, shade(coat, -0.12), 1.6, 0.15); // wing

  // neck
  ctx.beginPath();
  ctx.moveTo(4, -10 + bob);
  ctx.lineTo(13, -26 + bob);
  ctx.lineTo(22, -21 + bob);
  ctx.lineTo(22, -11 + bob);
  ctx.lineTo(12, -1 + bob);
  ctx.closePath();
  inkFill(ctx, coat, 2.6);
  // The mane: a crest lying on the neck itself, behind the rider. It sits on the part of the neck
  // the rider does not cover (x 9 and up), with spikes pointing back and up. Ducks and cows have none,
  // and a wreck has its mane burned off.
  if (kind === "horse" && !charred) {
    const along = (u) => [7 + 8.5 * u, -11 - 14.5 * u + bob]; // the crest line, bottom to top
    ctx.beginPath();
    ctx.moveTo(...along(0));
    for (let i = 0; i < 5; i++) {
      const [mx, my] = along((i + 0.5) / 5);
      const sway = Math.sin(a + i) * (running ? 1 : 0);
      ctx.lineTo(mx - 4.4 + sway, my - 2.5); // spike tip, out and back
      ctx.lineTo(...along((i + 1) / 5));
    }
    const [tx, ty] = along(1);
    const [bx, by] = along(0);
    ctx.lineTo(tx + 2.6, ty + 1.5); // inner edge, lying on the neck
    ctx.lineTo(bx + 2.6, by + 1.5);
    ctx.closePath();
    inkFill(ctx, mane, 1.8);
  }

  // saddle cloth under the jockey, clipped to the body so it hugs the back
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -3 + bob, 17, 9, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.roundRect(-10, -12 + bob, 13, 12, 2.5);
  inkFill(ctx, uniform, 1.8);
  ctx.fillStyle = css(shade(uniform, 0.45)); // light trim along the bottom edge
  ctx.fillRect(-10, -2.8 + bob, 13, 2.2);
  ctx.restore();

  // jockey sits on the back
  ctx.save();
  ctx.translate(-1, -2 + bob);
  drawJockey(ctx, accentOf(horse), running ? 3 : 0, charred ? "dizzy" : face, t, charred);
  ctx.restore();

  if (charred) {
    // no head in a wreck. A scorched stump where the neck ends
    inkEllipse(ctx, 17, -22 + bob, 5.6, 2.4, [30, 26, 30], 1.6, 0.5);
  } else {
    // head, tipped down a little when running
    ctx.save();
    ctx.translate(23, -18 + bob);
    ctx.rotate(running ? 0.2 : 0.05);
    ctx.scale(0.62, 0.62);
    drawHead(ctx, coat, acc, trait, mood, t, { charred, body: kind, mane: horse.mane });
    ctx.restore();
  }

  ctx.restore(); // squash group
  ctx.restore();

  if (charred) {
    // smoke curls up from the neck stump, a few puffs rising and fading
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.7 + i / 3) % 1;
      ctx.fillStyle = `rgba(80,76,84,${0.65 * (1 - u)})`;
      ctx.beginPath();
      ctx.arc(x + dir * (18 + Math.sin(u * 6 + i * 2) * 3), y - 26 - u * 24, 2.4 + u * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// One loose piece of a horse, centered on 0,0. Used by the explosion.
// part: "head", "leg", "body", "tail" or "helmet". t spins the dizzy eyes on the head.
export function drawHorsePart(ctx, horse, part, t = 0) {
  const { body } = quirks(horse);
  const coat = horse.coat;
  const accent = accentOf(horse);
  const legColor = body === "duck" ? [240, 146, 44] : shade(coat, -0.18);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  switch (part) {
    case "head":
      drawMiniHead(ctx, horse, 0, 0, 24, "dizzy", t);
      break;
    case "leg":
      inkLine(ctx, [[-6, 0], [6, 0]], legColor, 3.4);
      inkLine(ctx, [[-1, 0], [2.5, 0]], accent, 4.4); // the leg wrap
      if (body === "duck") inkEllipse(ctx, 7.6, 0, 3.2, 1.3, legColor, 1.2);
      else inkEllipse(ctx, 7, 0, 2.4, 1.8, "#3a2a22", 1.2);
      break;
    case "body":
      inkEllipse(ctx, 0, 0, 9, 6, coat, 2.2);
      inkRect(ctx, -3.5, -5, 7, 7, 1.5, accent, 1.4); // a bit of saddle cloth
      break;
    case "tail":
      inkLine(ctx, [[-7, 2], [-2, -3], [3, 2], [8, -2]], horse.mane ?? maneColor(coat), 3.6);
      break;
    case "helmet":
      ctx.beginPath();
      ctx.arc(0, 0, 5, Math.PI, 0);
      ctx.closePath();
      inkFill(ctx, accent, 1.8);
      inkCircle(ctx, 0, -5.6, 1.4, "#fff", 1);
      break;
    default:
  }
}

// Small round face for the finish board and tight spots. Same head, no frame.
export function drawMiniHead(ctx, horse, x, y, size, mood = "happy", t = 0) {
  const { acc, trait, body } = quirks(horse);
  ctx.save();
  ctx.translate(x, y);
  const k = size / 32;
  ctx.scale(k, k);
  ctx.translate(-6, 3);
  drawHead(ctx, horse.coat, acc, trait, mood, t, { body, mane: horse.mane });
  ctx.restore();
}


// --- the bookie ------------------------------------------------------------
// Loud checkered suit, flat cap, mustache. x, y is the middle of his shoulders.
// mood: smug, shock, cash, wink. talking flaps the jaw. look is a point his eyes follow.
export function drawBookie(ctx, x, y, t, mood, talking, look) {
  const shock = mood === "shock";
  const hop = shock ? Math.abs(Math.sin(t * 22)) * 3 : Math.sin(t * 2) * 1.2;
  ctx.save();
  ctx.translate(x, y + hop * 0.4);

  // suit
  ctx.beginPath();
  ctx.moveTo(-40, 44);
  ctx.quadraticCurveTo(-42, 6, -22, -4);
  ctx.lineTo(22, -4);
  ctx.quadraticCurveTo(42, 6, 40, 44);
  ctx.closePath();
  inkFill(ctx, "#b3262e", 3);
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  for (let i = -40; i <= 40; i += 13) {
    ctx.beginPath();
    ctx.moveTo(i, -4);
    ctx.lineTo(i, 44);
    ctx.stroke();
  }
  for (let j = 0; j <= 44; j += 13) {
    ctx.beginPath();
    ctx.moveTo(-42, j);
    ctx.lineTo(42, j);
    ctx.stroke();
  }
  ctx.restore();
  // shirt, tie
  ctx.beginPath();
  ctx.moveTo(-11, -4);
  ctx.lineTo(0, 24);
  ctx.lineTo(11, -4);
  ctx.closePath();
  inkFill(ctx, "#fff", 2.4);
  ctx.beginPath();
  ctx.moveTo(-3.4, 0);
  ctx.lineTo(3.4, 0);
  ctx.lineTo(5.5, 26);
  ctx.lineTo(0, 32);
  ctx.lineTo(-5.5, 26);
  ctx.closePath();
  inkFill(ctx, PAL.green, 2);
  ctx.fillStyle = "#fff";
  for (const py of [8, 15, 22]) {
    ctx.beginPath();
    ctx.arc(0, py, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // head
  const hy = -28 - (shock ? hop * 2 : 0);
  inkCircle(ctx, -27, hy + 4, 6, "#f2b48a", 2.4); // ears
  inkCircle(ctx, 27, hy + 4, 6, "#f2b48a", 2.4);
  inkEllipse(ctx, 0, hy, 27, 25, "#f2b48a", 3);
  // cap, pops up when shocked
  const capUp = shock ? -9 - Math.abs(Math.sin(t * 22)) * 3 : 0;
  ctx.save();
  ctx.translate(0, capUp);
  ctx.beginPath();
  ctx.moveTo(-26, hy - 8);
  ctx.quadraticCurveTo(-24, hy - 34, 0, hy - 32);
  ctx.quadraticCurveTo(24, hy - 34, 26, hy - 8);
  ctx.quadraticCurveTo(0, hy - 14, -26, hy - 8);
  ctx.closePath();
  inkFill(ctx, "#2f6f4f", 3);
  ctx.beginPath();
  ctx.moveTo(8, hy - 10);
  ctx.quadraticCurveTo(34, hy - 8, 38, hy - 3);
  ctx.quadraticCurveTo(20, hy - 2, 8, hy - 7);
  ctx.closePath();
  inkFill(ctx, "#245a40", 2.4);
  ctx.restore();

  // eyes follow the look point
  const lx = look ? Math.max(-1, Math.min(1, (look.x - (x + 0)) / 300)) : 0;
  const ly = look ? Math.max(-1, Math.min(1, (look.y - (y + hy)) / 200)) : 0;
  for (const ex of [-10, 10]) {
    const big = shock ? 9.5 : 7.6;
    inkEllipse(ctx, ex, hy - 3, big, big + 1.5, "#fff", 2.2);
    if (mood === "cash") {
      inkText(ctx, "$", ex, hy - 2.5, 15, "#2e9b3a", { align: "center", sw: 2 });
    } else {
      const pr = shock ? 1.8 : 3.2;
      ctx.beginPath();
      ctx.arc(ex + lx * 3, hy - 3 + ly * 3, pr, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
    }
  }
  // brows. smug = one raised
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (shock) {
    ctx.moveTo(-17, hy - 17);
    ctx.lineTo(-5, hy - 19);
    ctx.moveTo(5, hy - 19);
    ctx.lineTo(17, hy - 17);
  } else {
    ctx.moveTo(-17, hy - 12);
    ctx.lineTo(-4, hy - 12);
    ctx.moveTo(4, hy - 12);
    ctx.lineTo(16, hy - 16);
  }
  ctx.stroke();
  // nose
  inkCircle(ctx, 0, hy + 7, 5.4, "#e89b72", 2.2);
  // mustache
  ctx.beginPath();
  ctx.moveTo(0, hy + 12);
  ctx.bezierCurveTo(-8, hy + 8, -20, hy + 12, -22, hy + 20);
  ctx.bezierCurveTo(-14, hy + 18, -6, hy + 18, 0, hy + 16);
  ctx.bezierCurveTo(6, hy + 18, 14, hy + 18, 22, hy + 20);
  ctx.bezierCurveTo(20, hy + 12, 8, hy + 8, 0, hy + 12);
  ctx.closePath();
  inkFill(ctx, "#3a2418", 2);
  // mouth
  const flap = talking ? Math.abs(Math.sin(t * 14)) * 6 : 0;
  ctx.beginPath();
  if (shock) {
    ctx.ellipse(0, hy + 24, 6, 8 + flap * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#5a1010";
    ctx.fill();
    ctx.stroke();
  } else if (mood === "cash" || talking) {
    ctx.ellipse(0, hy + 22, 8, 2 + flap, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#5a1010";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.moveTo(-8, hy + 22);
    ctx.quadraticCurveTo(0, hy + 27, 10, hy + 20);
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
  if (shock) {
    // flying sweat drops
    for (const [dx, ph] of [[-34, 0], [34, 1.7]]) {
      const k = (t * 3 + ph) % 1;
      ctx.beginPath();
      ctx.ellipse(dx, hy - 10 + k * 18, 2.6, 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#7fd3ff";
      ctx.globalAlpha = 1 - k * 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  // fan of cash in his raised hand
  ctx.save();
  ctx.translate(x + 50, y + 22);
  ctx.rotate(-0.3 + Math.sin(t * 3) * 0.05);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate((i - 1) * 0.28);
    inkRect(ctx, -9, -30, 18, 30, 2, "#6fcf6f", 2);
    inkText(ctx, "$", 0, -15, 14, "#1d6a2a", { align: "center", sw: 0 });
    ctx.restore();
  }
  inkCircle(ctx, 0, 2, 6, "#f2b48a", 2);
  ctx.restore();
}
