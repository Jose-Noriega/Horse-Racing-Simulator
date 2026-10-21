// Race simulation: average speeds + Gaussian noise -> finish order.
// Honest code. Plain values in, plain values out. rng is a () => [0, 1) function.

import * as settings from "./settings.js";

export function gauss(mean, sigma, rng = Math.random) {
  // Box-Muller. 1 - rng() keeps log() away from 0.
  const u = 1 - rng();
  const v = rng();
  return mean + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function speedWeight(speed, tau = settings.PROB_TEMPERATURE) {
  return Math.exp(speed / tau);
}

// P(horse wins) from relative average speeds (Plackett-Luce / softmax). Map of id -> p.
export function winProbabilities(horses) {
  const weights = horses.map((h) => speedWeight(h.averageSpeed));
  const total = weights.reduce((a, b) => a + b, 0);
  const out = {};
  horses.forEach((h, i) => {
    out[h.id] = total > 0 ? weights[i] / total : 1 / Math.max(horses.length, 1);
  });
  return out;
}

// P(these horses finish in exactly this order for the first N places).
export function orderProbability(horses, orderedIds) {
  const remaining = new Map(horses.map((h) => [h.id, speedWeight(h.averageSpeed)]));
  let p = 1;
  for (const id of orderedIds) {
    if (!remaining.has(id)) return 0;
    let total = 0;
    for (const w of remaining.values()) total += w;
    if (total <= 0) return 0;
    p *= remaining.get(id) / total;
    remaining.delete(id);
  }
  return p;
}

// Each horse gets its own random speed curve over its race (1.0 = even pace).
// Curves are independent, so horses surge, fade, and pass each other.
// Hack: the shape is cosmetic. paceProgress normalizes it, so the finish
// order still comes from simulateRace.
export const PACE_KNOTS = 10; // fewer knots = longer surges. more = twitchy jitter
export const PACE_SWING = 0.6; // max +/- random wobble at a knot. Higher = more passing
export const PACE_TILT = 2.0; // front-runners (fast early, fade) vs closers
export const START_DRAG = 0.25; // everyone breaks a bit slow from the gate
export const MAX_KICK = 0.8; // late surge is random in 0..MAX_KICK

export function assignPaceProfiles(horses, rng = Math.random) {
  const uniform = (a, b) => a + (b - a) * rng();
  for (const horse of horses) {
    const kick = uniform(0, MAX_KICK);
    const style = uniform(-1, 1); // -1 front-runner, +1 closer
    horse.paceSpeeds = [];
    for (let i = 0; i < PACE_KNOTS; i++) {
      const t = i / (PACE_KNOTS - 1);
      const shape = -START_DRAG * (1 - t) ** 3 + kick * t ** 3 + PACE_TILT * style * (t - 0.5);
      const wobble = uniform(-PACE_SWING, PACE_SWING);
      horse.paceSpeeds.push(Math.max(0.4, 1 + shape + wobble));
    }
  }
}

// Fraction of the lap done at fraction u of this horse's race time.
// Speed varies along the race, normalized so progress is 1 at u = 1.
export function paceProgress(paceSpeeds, u) {
  if (u <= 0) return 0;
  if (u >= 1 || !paceSpeeds.length) return 1;
  const n = paceSpeeds.length;
  if (n === 1) return Math.min(1, u);

  const speedAt = (t) => {
    t = Math.min(1, Math.max(0, t));
    const pos = t * (n - 1);
    const i = Math.min(n - 2, Math.floor(pos));
    const f = pos - i;
    return paceSpeeds[i] * (1 - f) + paceSpeeds[i + 1] * f;
  };

  const samples = 48;
  let total = 0;
  let reached = 0;
  for (let k = 0; k < samples; k++) {
    const t0 = k / samples;
    const t1 = (k + 1) / samples;
    const mid = speedAt(0.5 * (t0 + t1));
    const piece = mid * (t1 - t0);
    total += piece;
    if (t1 <= u) reached += piece;
    else if (t0 < u) reached += mid * (u - t0);
  }
  if (total <= 0) return Math.min(1, u);
  return Math.min(1, reached / total);
}

// Sample each horse's speed from Normal(average, sigma), turn it into a finish
// time, rank them. Sets sampledSpeed / finishTime / place on each horse.
// Returns { ordered, finishTimes } with ordered[0] = 1st place.
export function simulateRace(horses, { distance = 1000, sigma = settings.SPEED_SIGMA, rng = Math.random } = {}) {
  for (const horse of horses) {
    horse.progress = 0;
    horse.finished = false;
    horse.place = null;
    horse.sampledSpeed = Math.max(1, gauss(horse.averageSpeed, sigma, rng));
    horse.finishTime = distance / horse.sampledSpeed;
  }
  const ordered = [...horses].sort((a, b) => a.finishTime - b.finishTime);
  ordered.forEach((h, i) => (h.place = i + 1));
  const finishTimes = Object.fromEntries(horses.map((h) => [h.id, h.finishTime]));
  return { ordered, finishTimes };
}
