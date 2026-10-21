"""Pre-set race card: RACES_PER_SESSION races × HORSES_PER_RACE horse ids.

Edit RACE_CARD before game load. Each race lists roster ids (0–63).
The default card takes the roster in order, no repeats.
"""

from __future__ import annotations

import settings
from horses_data import ROSTER


# One row per race. Built from settings so changing HORSES_PER_RACE just works.
# Race r gets roster ids [r*N, r*N + N). Edit by hand for a custom card.
# Needs RACES_PER_SESSION * HORSES_PER_RACE <= TOTAL_HORSES (validate checks ids).
RACE_CARD: list[list[int]] = [
    list(range(r * settings.HORSES_PER_RACE, (r + 1) * settings.HORSES_PER_RACE))
    for r in range(settings.RACES_PER_SESSION)
]


def validate_race_card(card: list[list[int]] | None = None) -> None:
    """Raise ValueError if the card is invalid."""
    card = RACE_CARD if card is None else card

    if len(card) != settings.RACES_PER_SESSION:
        raise ValueError(
            f"Race card must have {settings.RACES_PER_SESSION} races, "
            f"found {len(card)}"
        )

    for race_index, field in enumerate(card):
        if len(field) != settings.HORSES_PER_RACE:
            raise ValueError(
                f"Race {race_index + 1} must have {settings.HORSES_PER_RACE} "
                f"horses, found {len(field)}"
            )
        if len(set(field)) != len(field):
            raise ValueError(f"Race {race_index + 1} has duplicate horse ids: {field}")
        for horse_id in field:
            if horse_id not in ROSTER:
                raise ValueError(
                    f"Race {race_index + 1} references unknown horse id {horse_id}"
                )


def get_race_field_ids(race_index: int) -> list[int]:
    """Return horse ids for a 0-based race index."""
    validate_race_card()
    if not 0 <= race_index < settings.RACES_PER_SESSION:
        raise IndexError(f"Race index out of range: {race_index}")
    return list(RACE_CARD[race_index])


# Validate at import so bad cards fail early.
validate_race_card()
