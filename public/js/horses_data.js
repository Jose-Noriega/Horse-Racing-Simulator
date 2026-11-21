// 65-horse roster. Speeds are squeezed toward the mean at load, so odds match.

import * as settings from "./settings.js";
import { ROSTER_RAW } from "./roster_raw.js";

// Takes the raw list so a test can shuffle it. Throws on a bad coat, hat, face or style name.
export function buildRoster(raw = ROSTER_RAW) {
  const mean = raw.reduce((s, [, speed]) => s + speed, 0) / raw.length;
  const k = settings.SPEED_COMPRESSION;
  return raw.map(([name, speed, coatName, acc, trait, paceName], id) => {
    if (!settings.COAT_COLORS[coatName]) throw new Error(`${name}: unknown coat "${coatName}"`);
    if (!settings.ACCESSORIES.includes(acc)) throw new Error(`${name}: unknown hat "${acc}"`);
    if (!settings.TRAITS.includes(trait)) throw new Error(`${name}: unknown face "${trait}"`);
    const pace = settings.PACE_STYLES[paceName];
    if (!pace) throw new Error(`${name}: unknown running style "${paceName}"`);
    return {
      id,
      name,
      averageSpeed: mean + (speed - mean) * k,
      coat: settings.COAT_COLORS[coatName],
      coatName,
      acc,
      trait,
      paceName,
      paceStyle: pace.style,
      lateKick: pace.lateKick,
    };
  });
}

export const ROSTER = buildRoster();

export function getHorse(id) {
  return ROSTER[id];
}

// The rider / bet-screen color. Set per race by assignAccents (race_card.js).
// Horses drawn outside a race (menus, summary) have none, so fall back to a steady one.
export function accentOf(horse) {
  return horse.accent ?? settings.ACCENT_COLORS[horse.id % settings.ACCENT_COLORS.length];
}

// A starter: roster entry + race-time fields.
export function makeHorse(blueprint) {
  return {
    ...blueprint,
    accent: null,
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
