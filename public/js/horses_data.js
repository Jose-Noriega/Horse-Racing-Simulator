// 64-horse roster. Speeds are squeezed toward the mean at load, so odds match.

import * as settings from "./settings.js";
import { ROSTER_RAW } from "./roster_raw.js";

function buildRoster() {
  if (ROSTER_RAW.length !== settings.TOTAL_HORSES) {
    throw new Error(`Expected ${settings.TOTAL_HORSES} horses, found ${ROSTER_RAW.length}`);
  }
  const mean = ROSTER_RAW.reduce((s, [, speed]) => s + speed, 0) / ROSTER_RAW.length;
  const k = settings.SPEED_COMPRESSION;
  return ROSTER_RAW.map(([name, speed], id) => ({
    id,
    name,
    averageSpeed: mean + (speed - mean) * k,
  }));
}

export const ROSTER = buildRoster();

export function getHorse(id) {
  return ROSTER[id];
}

// A starter: roster entry + display color + race-time fields.
export function makeHorse(blueprint, color) {
  return {
    ...blueprint,
    color,
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
