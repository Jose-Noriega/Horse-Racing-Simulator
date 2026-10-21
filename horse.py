"""Horse data model."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Horse:
    """A horse from the 64-horse roster, optionally prepared for a race."""

    id: int
    name: str
    average_speed: float
    color: tuple[int, int, int] = (200, 200, 200)

    # Race-time fields (reset when a race starts)
    lane_index: int = 0
    lane_y: float = 0.0
    x: float = 0.0
    y: float = 0.0
    heading: float = 0.0
    progress: float = 0.0
    pace_speeds: list[float] = field(default_factory=list)
    sampled_speed: float = 0.0
    finish_time: float = 0.0
    finished: bool = False
    place: int | None = None

    def reset_race_state(self) -> None:
        # Keep lane_index / lane_y — those are field assignment, not race outcome.
        self.x = 0.0
        self.y = 0.0
        self.heading = 0.0
        self.progress = 0.0
        self.sampled_speed = 0.0
        self.finish_time = 0.0
        self.finished = False
        self.place = None


@dataclass
class HorseBlueprint:
    """Static roster entry before display color / race state are applied."""

    id: int
    name: str
    average_speed: float


def make_horse(blueprint: HorseBlueprint, color: tuple[int, int, int]) -> Horse:
    return Horse(
        id=blueprint.id,
        name=blueprint.name,
        average_speed=blueprint.average_speed,
        color=color,
    )
