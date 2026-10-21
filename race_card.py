"""Pre-set race card: 8 races × 8 horse ids.

Edit RACE_CARD before game load. Each race lists 8 roster ids (0–63).
This default card uses each of the 64 horses exactly once.
"""

from __future__ import annotations

import settings
from horses_data import ROSTER


# One row per race; values are horse ids from horses_data.ROSTER.
RACE_CARD: list[list[int]] = [
    [0, 1, 2, 3, 4, 5, 6, 7],
    [8, 9, 10, 11, 12, 13, 14, 15],
    [16, 17, 18, 19, 20, 21, 22, 23],
    [24, 25, 26, 27, 28, 29, 30, 31],
    [32, 33, 34, 35, 36, 37, 38, 39],
    [40, 41, 42, 43, 44, 45, 46, 47],
    [48, 49, 50, 51, 52, 53, 54, 55],
    [56, 57, 58, 59, 60, 61, 62, 63],
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
