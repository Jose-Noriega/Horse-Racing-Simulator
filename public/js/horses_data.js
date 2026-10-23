// 64-horse roster. Speeds are squeezed toward the mean at load, so odds match.

import * as settings from "./settings.js";
import { ROSTER_RAW } from "./roster_raw.js";

const PACE_TENDENCIES = [
  { style: -0.9, lateKick: 0.1 },
  { style: -0.6, lateKick: 0.25 },
  { style: -0.3, lateKick: 0.5 },
  { style: 0, lateKick: 0.35 },
  { style: 0.3, lateKick: 0.7 },
  { style: 0.6, lateKick: 0.45 },
  { style: 0.9, lateKick: 0.8 },
  { style: 0.2, lateKick: 0.15 },
];

function buildRoster() {
  const mean = ROSTER_RAW.reduce((s, [, speed]) => s + speed, 0) / ROSTER_RAW.length;
  const k = settings.SPEED_COMPRESSION;
  return ROSTER_RAW.map(([name, speed], id) => {
    const pace = PACE_TENDENCIES[id % PACE_TENDENCIES.length];
    return {
      id,
      name,
      averageSpeed: mean + (speed - mean) * k,
      color: settings.HORSE_COLORS[id % settings.HORSE_COLORS.length],
      paceStyle: pace.style,
      lateKick: pace.lateKick,
    };
  });
}

export const ROSTER = buildRoster();

export function getHorse(id) {
  return ROSTER[id];
}

// A starter: roster entry + race-time fields.
export function makeHorse(blueprint) {
  return {
    ...blueprint,
    laneIndex: 0,
    x: 0,
    y: 0,
    heading: 0,
    progress: 0,
    paceSpeeds: [],
    sampledSpeed: 0,
    finishTime: 0,
    finished: false,
    place: null,
  };
}
