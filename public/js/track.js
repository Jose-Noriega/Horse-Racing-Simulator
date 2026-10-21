// Stadium oval geometry. Honest code. The track is drawn in scenery.js.

import * as settings from "./settings.js";

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
