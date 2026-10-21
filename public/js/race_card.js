// Pre-set race card: RACES_PER_SESSION races x HORSES_PER_RACE roster ids.
// Edit RACE_CARD by hand for a custom card. The default takes the roster in order.

import * as settings from "./settings.js";
import { ROSTER } from "./horses_data.js";

export const RACE_CARD = Array.from({ length: settings.RACES_PER_SESSION }, (_, r) =>
  Array.from({ length: settings.HORSES_PER_RACE }, (_, i) => r * settings.HORSES_PER_RACE + i),
);

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
