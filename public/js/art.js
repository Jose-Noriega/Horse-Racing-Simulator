// Flash-era drawing kit: thick ink outlines, candy colors, hard drop shadows.
// Only drawing helpers live here. No game state. Every function takes ctx first.
// Colors in this game are [r, g, b] arrays. Helpers take an array or a css string.

export const INK = "#1c1226";
export const DISPLAY = 'Impact, "Arial Narrow Bold", "Arial Black", sans-serif';
export const BODY = '"Trebuchet MS", Verdana, "Helvetica Neue", Arial, sans-serif';

export const PAL = {
  cream: "#fff4d6",
  paper: "#ffe98a",
  navy: "#2a2c5c",
  navy2: "#3a3d7c",
  plum: "#4b2c7a",
  teal: "#2bb3a3",
  pink: "#ff5fa2",
  gold: "#ffc928",
  orange: "#ff8a1f",
  red: "#e8433a",
  green: "#46c24f",
  blue: "#3b8bff",
  sky: "#7fd3ff",
  grass: "#58c65a",
  grassDark: "#3da64a",
  dirt: "#d99a55",
  dirtDark: "#b97a3d",
};

export const css = (c) => (typeof c === "string" ? c : `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`);

// k > 0 lightens toward white, k < 0 darkens toward black. Returns an [r, g, b] array.
export function shade(c, k) {
  if (typeof c === "string") return c; // css strings pass through, no shading
  return c.map((v) => (k >= 0 ? v + (255 - v) * k : v * (1 + k)));
}

// Cheap stable noise: integer in, [0, 1) out. Same input, same answer, every frame.
export function hash(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;
// Overshoots then settles. Good for pop-in. t in 0..1
export const easeBack = (t) => {
  t = clamp01(t);
  const c = 1.9;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

// Fill the current path, then ink it.
export function inkFill(ctx, fill, width = 2.4) {
  if (fill) {
    ctx.fillStyle = css(fill);
    ctx.fill();
  }
  if (!(width > 0)) return; // lineWidth 0 is ignored by canvas, so skip the stroke on purpose
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.stroke();
}

export function inkCircle(ctx, x, y, r, fill, width = 2.2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  inkFill(ctx, fill, width);
}

export function inkEllipse(ctx, x, y, rx, ry, fill, width = 2.2, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  inkFill(ctx, fill, width);
}

export function inkRect(ctx, x, y, w, h, r, fill, width = 2.4) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  inkFill(ctx, fill, width);
}

// A thick two-layer line: ink underneath, color on top. Used for legs, arms, tails.
export function inkLine(ctx, pts, color, width) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [w, c] of [[width + 3.4, INK], [width, css(color)]]) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
  }
}

export function star(ctx, x, y, outer, inner, points = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i * Math.PI) / points;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

export function inkStar(ctx, x, y, outer, fill, width = 2, rot = -Math.PI / 2) {
  star(ctx, x, y, outer, outer * 0.45, 5, rot);
  inkFill(ctx, fill, width);
}

// Spiky comic starburst. spikes alternate long and short. wobble animates the points.
export function burst(ctx, x, y, outer, inner, spikes, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i * Math.PI) / spikes;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

export function inkHeart(ctx, x, y, s, fill, width = 2) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.8, y - s * 1.2, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.8, y - s * 1.2, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
  ctx.closePath();
  inkFill(ctx, fill, width);
}

// Text with an ink outline. size is real px. baseline defaults to middle.
export function inkText(ctx, str, x, y, size, fill = "#fff", opt = {}) {
  const { align = "left", baseline = "middle", font = DISPLAY, sw = Math.max(2.2, size * 0.17), alpha = 1, stroke = INK, bold = false } = opt;
  ctx.save();
  ctx.font = `${bold ? "bold " : ""}${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.globalAlpha = alpha;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  if (sw > 0) {
    ctx.lineWidth = sw;
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = css(fill);
  ctx.fillText(str, x, y);
  ctx.restore();
}

// Plain body text, no outline. For text on paper and light boxes.
export function plainText(ctx, str, x, y, size, fill, opt = {}) {
  const { align = "left", baseline = "middle", font = BODY, bold = true, alpha = 1 } = opt;
  ctx.save();
  ctx.font = `${bold ? "bold " : ""}${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = css(fill);
  ctx.fillText(str, x, y);
  ctx.restore();
}

export function textWidth(ctx, str, size, font = BODY, bold = true) {
  ctx.save();
  ctx.font = `${bold ? "bold " : ""}${size}px ${font}`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

// Cut a string so it fits maxW, with "..." on the end. Hack: measures one char at a time.
export function fitText(ctx, str, maxW, size, font = BODY, bold = true) {
  if (textWidth(ctx, str, size, font, bold) <= maxW) return str;
  let s = str;
  while (s.length > 1 && textWidth(ctx, s + "...", size, font, bold) > maxW) s = s.slice(0, -1);
  return s + "...";
}

// Split a string into at most maxLines lines that fit maxW. The last line gets "..." if cut.
export function wrapText(ctx, str, maxW, size, maxLines = 2, font = BODY, bold = true) {
  const words = str.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (textWidth(ctx, next, size, font, bold) <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = fitText(ctx, lines[maxLines - 1] + "...", maxW, size, font, bold);
  }
  return lines.map((l) => fitText(ctx, l, maxW, size, font, bold));
}

// Letters that bob, tilt and cycle color. cx, cy is the middle of the whole line.
export function wobbleText(ctx, str, cx, cy, size, t, colors, opt = {}) {
  const { amp = size * 0.08, speed = 3, tilt = 0.08, sw = size * 0.16, font = DISPLAY } = opt;
  ctx.save();
  ctx.font = `${size}px ${font}`;
  const widths = [...str].map((ch) => ctx.measureText(ch).width + size * 0.02);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = cx - total / 2;
  [...str].forEach((ch, i) => {
    const w = widths[i];
    const ph = t * speed + i * 0.7;
    ctx.save();
    ctx.translate(x + w / 2, cy + Math.sin(ph) * amp);
    ctx.rotate(Math.sin(ph * 0.9 + 1) * tilt);
    const s = 1 + Math.sin(ph * 1.3) * 0.05;
    ctx.scale(s, s);
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = sw;
    ctx.strokeStyle = INK;
    ctx.strokeText(ch, 0, 0);
    ctx.fillStyle = css(colors[i % colors.length]);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    x += w;
  });
  ctx.restore();
}

// Chunky panel: hard drop shadow, ink outline, inner highlight.
export function panel(ctx, x, y, w, h, opt = {}) {
  const { fill = PAL.navy, r = 14, shadow = 6, hi = true, line = 3.5 } = opt;
  if (shadow) {
    ctx.fillStyle = "rgba(10,5,25,0.5)";
    ctx.beginPath();
    ctx.roundRect(x + shadow, y + shadow, w, h, r);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  inkFill(ctx, fill, line);
  if (hi) {
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 4, w - 8, h - 8, Math.max(2, r - 4));
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// Candy button. kind picks the color. over / pressed come from the mouse.
const BUTTON_COLORS = {
  gold: [255, 201, 40],
  green: [70, 194, 79],
  red: [232, 67, 58],
  blue: [59, 139, 255],
  pink: [255, 95, 162],
  grey: [120, 124, 140],
};
export function candyButton(ctx, x, y, w, h, label, opt = {}) {
  const { kind = "blue", enabled = true, over = false, pressed = false, pulse = 0, size = 24 } = opt;
  let base = enabled ? BUTTON_COLORS[kind] : BUTTON_COLORS.grey;
  if (enabled && over) base = shade(base, 0.12);
  const dy = pressed ? 3 : 0;
  const lift = pressed ? 2 : 5;
  const r = Math.min(16, h / 2.2);

  ctx.fillStyle = "rgba(10,5,25,0.5)"; // hard shadow under the slab
  ctx.beginPath();
  ctx.roundRect(x + 2, y + lift + dy, w, h, r);
  ctx.fill();

  if (pulse > 0 && enabled) {
    ctx.save();
    ctx.shadowColor = css(PAL.gold);
    ctx.shadowBlur = 10 + pulse * 18;
    ctx.beginPath();
    ctx.roundRect(x, y + dy, w, h, r);
    ctx.fillStyle = css(base);
    ctx.fill();
    ctx.restore();
  }

  const g = ctx.createLinearGradient(0, y + dy, 0, y + dy + h);
  g.addColorStop(0, css(shade(base, 0.35)));
  g.addColorStop(0.5, css(base));
  g.addColorStop(1, css(shade(base, -0.28)));
  ctx.beginPath();
  ctx.roundRect(x, y + dy, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.stroke();

  // gloss on the top half
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 4, y + dy + 3, w - 8, h * 0.42, r - 3);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fill();
  ctx.restore();

  inkText(ctx, label, x + w / 2, y + dy + h / 2 + 1, size, enabled ? "#fff" : "#c9c9d4", { align: "center", sw: 4.5 });
}

// Speech bubble with a tail. (tx, ty) is where the tail points.
export function bubble(ctx, x, y, w, h, tx, ty, opt = {}) {
  const { fill = "#fff", r = 14, line = 3, shadow = 4 } = opt;
  const left = tx < x - 4; // target is off to the side: tail comes out of the left edge
  const path = () => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    // tail: a wedge from the nearest edge toward the target
    if (left) {
      const cy = Math.min(y + h - r - 4, Math.max(y + r + 4, ty));
      ctx.moveTo(x, cy - 9);
      ctx.lineTo(tx, ty);
      ctx.lineTo(x, cy + 9);
      return;
    }
    const cx = Math.min(x + w - r - 8, Math.max(x + r + 8, tx));
    const below = ty > y + h / 2;
    const ey = below ? y + h : y;
    ctx.moveTo(cx - 9, ey);
    ctx.lineTo(tx, ty);
    ctx.lineTo(cx + 9, ey);
  };
  if (shadow) {
    ctx.save();
    ctx.translate(shadow, shadow);
    path();
    ctx.fillStyle = "rgba(10,5,25,0.35)";
    ctx.fill();
    ctx.restore();
  }
  path();
  ctx.fillStyle = css(fill);
  ctx.fill();
  ctx.lineWidth = line;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.stroke();
  // cover the seam where the tail joins the box
  ctx.beginPath();
  if (left) {
    const cy = Math.min(y + h - r - 4, Math.max(y + r + 4, ty));
    ctx.moveTo(x + line / 2, cy - 8);
    ctx.lineTo(x + line / 2, cy + 8);
  } else {
    const cx = Math.min(x + w - r - 8, Math.max(x + r + 8, tx));
    const below = ty > y + h / 2;
    const ey = below ? y + h : y;
    ctx.moveTo(cx - 8, ey + (below ? -line / 2 : line / 2));
    ctx.lineTo(cx + 8, ey + (below ? -line / 2 : line / 2));
  }
  ctx.strokeStyle = css(fill);
  ctx.lineWidth = line + 1;
  ctx.stroke();
}

// Lightbulbs around a rectangle. They chase. n bulbs per side step, t in seconds.
export function marquee(ctx, x, y, w, h, t, step = 22) {
  const pts = [];
  for (let px = x + 8; px <= x + w - 8; px += step) pts.push([px, y + 2]);
  for (let py = y + 8; py <= y + h - 8; py += step) pts.push([x + w - 2, py]);
  for (let px = x + w - 8; px >= x + 8; px -= step) pts.push([px, y + h - 2]);
  for (let py = y + h - 8; py >= y + 8; py -= step) pts.push([x + 2, py]);
  pts.forEach(([px, py], i) => {
    const on = (Math.floor(t * 6) + i) % 3 === 0;
    ctx.beginPath();
    ctx.arc(px, py, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = on ? "#fff3a0" : "#8a6b1d";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  });
}

export function coin(ctx, x, y, r, squash = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(squash, 1);
  inkCircle(ctx, 0, 0, r, PAL.gold, 2);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.strokeStyle = "#b8860b";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = "#b8860b";
  ctx.font = `bold ${r * 1.1}px ${BODY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", 0, 1);
  ctx.restore();
}

// A little cartoon cloud puff. Used for dust and smoke.
// Hack: stroke first, then fill. The fill hides the inner arcs so only the outline
// of the whole blob shows.
export function puff(ctx, x, y, r, fill, alpha = 1, outline = true) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x - r * 0.55, y + r * 0.15, r * 0.7, 0, Math.PI * 2);
  ctx.moveTo(x + r * 0.55 + r * 0.7, y + r * 0.15);
  ctx.arc(x + r * 0.55, y + r * 0.15, r * 0.7, 0, Math.PI * 2);
  ctx.moveTo(x + r * 0.85, y - r * 0.25);
  ctx.arc(x, y - r * 0.25, r * 0.85, 0, Math.PI * 2);
  if (outline) {
    ctx.lineWidth = 3.2;
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  ctx.fillStyle = css(fill);
  ctx.fill();
  ctx.restore();
}

// Cache an offscreen layer. draw(ctx2) paints in logical 1280x720 units.
// Rebuilt when the canvas backing size changes. Hack: keyed by name only, so two
// different looks need two names.
export function getLayer(g, name, draw) {
  const w = g.canvas.width;
  const h = g.canvas.height;
  const hit = g.art.cache[name];
  if (hit && hit.canvas.width === w && hit.canvas.height === h) return hit.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c2 = canvas.getContext("2d");
  c2.setTransform(g.pixelScale, 0, 0, g.pixelScale, 0, 0);
  draw(c2);
  g.art.cache[name] = { canvas };
  return canvas;
}

// A red ribbon banner with swallowtail ends. cx, cy is the middle.
export function ribbon(ctx, cx, cy, w, h, text, size = 30, fill = PAL.red) {
  ctx.fillStyle = css(fill);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * (w / 2 - 8), cy - h / 2 + 8);
    ctx.lineTo(cx + s * (w / 2 + 34), cy - h / 2 + 8);
    ctx.lineTo(cx + s * (w / 2 + 20), cy + 2 + 8);
    ctx.lineTo(cx + s * (w / 2 + 34), cy + h / 2 + 8);
    ctx.lineTo(cx + s * (w / 2 - 8), cy + h / 2 + 8);
    ctx.closePath();
    inkFill(ctx, shade(fill, -0.3), 3);
  }
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 6);
  inkFill(ctx, fill, 3.5);
  ctx.beginPath();
  ctx.roundRect(cx - w / 2 + 5, cy - h / 2 + 5, w - 10, h - 10, 3);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  inkText(ctx, text, cx, cy + 1, size, "#fff", { align: "center", sw: 5 });
}
