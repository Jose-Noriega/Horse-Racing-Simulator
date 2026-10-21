"""64-horse roster: names and set average speeds.

Edit this file before load to change the stable.
Speeds are abstract units (higher = stronger favorite).
"""

from __future__ import annotations

from horse import HorseBlueprint
import settings

# (name, average_speed) — ids are assigned 0..63 in list order.
_ROSTER_RAW: list[tuple[str, float]] = [
    ("Thunderbolt", 93.0),
    ("Blaze Runner", 92.5),
    ("Night Shadow", 92.0),
    ("Comet Trail", 91.5),
    ("Storm Chaser", 91.0),
    ("Silver Dash", 90.5),
    ("Lucky Strike", 89.0),
    ("Rocket Red", 88.5),
    ("Wind Whisper", 88.0),
    ("Golden Hoof", 87.5),
    ("Iron Gallop", 87.0),
    ("Blue Horizon", 86.5),
    ("Crimson Pace", 86.0),
    ("Dust Devil", 85.5),
    ("Emerald Rush", 85.0),
    ("Frost Fire", 84.5),
    ("Ghost Lane", 84.0),
    ("Harvest Moon", 83.5),
    ("Ivory Flash", 83.0),
    ("Jade Sprinter", 82.5),
    ("Kingpin", 82.0),
    ("Lunar Leap", 81.5),
    ("Maple Fury", 81.0),
    ("Northern Star", 80.5),
    ("Ocean Breeze", 80.0),
    ("Prairie Wind", 79.5),
    ("Quiet Thunder", 79.0),
    ("River Rapid", 78.5),
    ("Sunset Kick", 78.0),
    ("Timber Wolf", 77.5),
    ("Ultra Volt", 77.0),
    ("Velvet Storm", 76.5),
    ("Wild Canyon", 76.0),
    ("Amber Arrow", 75.5),
    ("Bright Spur", 75.0),
    ("Copper Crown", 74.5),
    ("Desert Mirage", 74.0),
    ("Echo Ridge", 73.5),
    ("Flame Dancer", 73.0),
    ("Granite Gate", 72.5),
    ("Honey Badger", 72.0),
    ("Indigo Bolt", 71.5),
    ("Jolly Roger", 71.0),
    ("Knight Watch", 70.5),
    ("Lightning Bug", 70.0),
    ("Mountain Echo", 69.5),
    ("Noble Drift", 69.0),
    ("Outlaw Ace", 68.5),
    ("Pepper Jack", 68.0),
    ("Quicksilver", 67.5),
    ("Raven Wing", 67.0),
    ("Stonewall", 66.5),
    ("True North", 66.0),
    ("Underdog", 65.5),
    ("Violet Rain", 65.0),
    ("Whiskey Bend", 64.5),
    ("Xenon Flash", 64.0),
    ("Yellow Jacket", 63.5),
    ("Zephyr King", 63.0),
    ("Ashen Trail", 62.5),
    ("Boulder Dash", 62.0),
    ("Cinder Path", 61.5),
    ("Driftwood", 61.0),
    ("Early Bird", 60.5),
]


def _build_roster() -> dict[int, HorseBlueprint]:
    if len(_ROSTER_RAW) != settings.TOTAL_HORSES:
        raise ValueError(
            f"Expected {settings.TOTAL_HORSES} horses, found {len(_ROSTER_RAW)}"
        )
    mean = sum(speed for _, speed in _ROSTER_RAW) / len(_ROSTER_RAW)
    k = settings.SPEED_COMPRESSION
    roster: dict[int, HorseBlueprint] = {}
    for horse_id, (name, speed) in enumerate(_ROSTER_RAW):
        roster[horse_id] = HorseBlueprint(
            id=horse_id, name=name, average_speed=mean + (speed - mean) * k
        )
    return roster


ROSTER: dict[int, HorseBlueprint] = _build_roster()


def get_horse(horse_id: int) -> HorseBlueprint:
    return ROSTER[horse_id]


def all_horses() -> list[HorseBlueprint]:
    return [ROSTER[i] for i in range(settings.TOTAL_HORSES)]
