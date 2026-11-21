// Pre-set race card: RACES_PER_SESSION races x HORSES_PER_RACE roster ids.
// Edit RACE_CARD by hand for a custom card. The default shuffles the roster
// once per page load, then deals it out in order. No horse repeats in a session.

import * as settings from "./settings.js";
import { ROSTER } from "./horses_data.js";

// Fisher-Yates. Takes rand so tests can pass a fixed one.
export function shuffled(items, rand = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function makeRaceCard(rand = Math.random) {
  const ids = shuffled(ROSTER.map((_, id) => id), rand);
  return Array.from({ length: settings.RACES_PER_SESSION }, (_, r) =>
    ids.slice(r * settings.HORSES_PER_RACE, (r + 1) * settings.HORSES_PER_RACE),
  );
}

// Give each horse in a field its own accent color for this race. No repeats.
// Changes the horses in place. Takes rand so tests can pass a fixed one.
export function assignAccents(field, rand = Math.random) {
  if (field.length > settings.ACCENT_COLORS.length) {
    throw new Error(`${field.length} horses but only ${settings.ACCENT_COLORS.length} accent colors`);
  }
  const colors = shuffled(settings.ACCENT_COLORS, rand);
  field.forEach((horse, i) => {
    horse.accent = colors[i];
  });
  return field;
}

export const RACE_CARD = makeRaceCard();

export function validateRaceCard(card = RACE_CARD) {
  if (card.length !== settings.RACES_PER_SESSION) {
    throw new Error(`Race card must have ${settings.RACES_PER_SESSION} races, found ${card.length}`);
  }
  card.forEach((field, r) => {
    if (field.length !== settings.HORSES_PER_RACE) {
      throw new Error(`Race ${r + 1} must have ${settings.HORSES_PER_RACE} horses, found ${field.length}`);
    }
    if (new Set(field).size !== field.length) {
      throw new Error(`Race ${r + 1} has duplicate horse ids: ${field}`);
    }
    for (const id of field) {
      if (!ROSTER[id]) throw new Error(`Race ${r + 1} references unknown horse id ${id}`);
    }
  });
}

export function getRaceFieldIds(raceIndex) {
  if (!(raceIndex >= 0 && raceIndex < settings.RACES_PER_SESSION)) {
    throw new RangeError(`Race index out of range: ${raceIndex}`);
  }
  return [...RACE_CARD[raceIndex]];
}

validateRaceCard();
