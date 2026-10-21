// Stadium oval geometry (honest) and drawing. Port of track.py.

import * as settings from "./settings.js";
import { rgb } from "./ui.js";

// Lane 0 is the rail. Fractional indices are used for inner/outer rails.
export function laneRadius(laneIndex) {
  return settings.TRACK_INNER_RADIUS + (laneIndex + 0.5) * settings.TRACK_LANE_WIDTH;
}

export const innerRailRadius = () => settings.TRACK_INNER_RADIUS;
export const outerRailRadius = () =>
  settings.TRACK_INNER_RADIUS + settings.HORSES_PER_RACE * settings.TRACK_LANE_WIDTH;

export function laneLength(laneIndex) {
  return 2 * settings.TRACK_STRAIGHT + 2 * Math.PI * laneRadius(laneIndex);
}

// Lap fraction where this lane starts so every horse runs the inner lane's
// distance. Outer lanes start further around the oval (a stagger).
export function startProgress(laneIndex) {
  return 1 - laneLength(0) / laneLength(laneIndex);
}

// Lap fraction on this lane after raceFraction (0..1) of the race.
export function laneProgress(laneIndex, raceFraction) {
  const p0 = startProgress(laneIndex);
  return p0 + raceFraction * (1 - p0);
}

// Position and heading (radians, canvas coords, y down) for progress in [0, 1].
// 0 / 1 is the finish line at the start of the homestretch (bottom, running right).
// Path is counterclockwise on screen.
export function pointOnRadius(radius, progress) {
  progress = ((progress % 1) + 1) % 1;
  const L = settings.TRACK_STRAIGHT;
  const cx = settings.TRACK_CENTER_X;
  const cy = settings.TRACK_CENTER_Y;
  const arc = Math.PI * radius;
  let dist = progress * (2 * L + 2 * arc);

  // Homestretch: bottom, left -> right
  if (dist <= L) return [cx - L / 2 + dist, cy + radius, 0];
  dist -= L;

  // Right bend: bottom -> top through the east
  if (dist <= arc) {
    const ang = Math.PI / 2 - (dist / arc) * Math.PI;
    return [cx + L / 2 + radius * Math.cos(ang), cy + radius * Math.sin(ang), ang - Math.PI / 2];
  }
  dist -= arc;

  // Backstretch: top, right -> left
  if (dist <= L) return [cx + L / 2 - dist, cy - radius, Math.PI];
  dist -= L;

  // Left bend: top -> bottom through the west
  const frac = arc ? Math.min(1, Math.max(0, dist / arc)) : 0;
  const ang = -Math.PI / 2 - frac * Math.PI;
  return [cx - L / 2 + radius * Math.cos(ang), cy + radius * Math.sin(ang), ang - Math.PI / 2];
}

export const pointOnLane = (laneIndex, progress) => pointOnRadius(laneRadius(laneIndex), progress);

function stadiumPath(ctx, radius, steps) {
  ctx.beginPath();
  for (let i = 0; i < steps; i++) {
    const [x, y] = pointOnRadius(radius, i / steps);
    if (i === 0) ctx.moveTo(Math.trunc(x), Math.trunc(y));
    else ctx.lineTo(Math.trunc(x), Math.trunc(y));
  }
  ctx.closePath();
}

function fillStadium(ctx, color, radius, steps) {
  stadiumPath(ctx, radius, steps);
  ctx.fillStyle = rgb(color);
  ctx.fill();
}

function strokeStadium(ctx, color, radius, steps, width) {
  stadiumPath(ctx, radius, steps);
  ctx.strokeStyle = rgb(color);
  ctx.lineWidth = width;
  ctx.stroke();
}

export function drawOvalTrack(ctx) {
  ctx.fillStyle = rgb(settings.INFIELD);
  ctx.fillRect(0, 0, settings.SCREEN_WIDTH, settings.SCREEN_HEIGHT);

  fillStadium(ctx, settings.DIRT_DARK, outerRailRadius() + 6, 120);
  fillStadium(ctx, settings.DIRT, outerRailRadius(), 120);
  fillStadium(ctx, settings.INFIELD, innerRailRadius() - 4, 96);

  strokeStadium(ctx, settings.RAIL, innerRailRadius(), 96, 3);
  strokeStadium(ctx, settings.RAIL, outerRailRadius(), 120, 3);

  // Subtle lane lines
  for (let i = 1; i < settings.HORSES_PER_RACE; i++) {
    strokeStadium(ctx, [180, 150, 100], settings.TRACK_INNER_RADIUS + i * settings.TRACK_LANE_WIDTH, 80, 1);
  }

  // Finish line across the homestretch
  const [ix, iy] = pointOnRadius(innerRailRadius(), 0);
  const [ox, oy] = pointOnRadius(outerRailRadius(), 0);
  ctx.lineWidth = 6;
  for (let stripe = 0; stripe < 8; stripe++) {
    const t0 = stripe / 8;
    const t1 = (stripe + 1) / 8;
    ctx.strokeStyle = rgb(stripe % 2 === 0 ? settings.WHITE : settings.BLACK);
    ctx.beginPath();
    ctx.moveTo(ix + (ox - ix) * t0, iy + (oy - iy) * t0);
    ctx.lineTo(ix + (ox - ix) * t1, iy + (oy - iy) * t1);
    ctx.stroke();
  }
}
