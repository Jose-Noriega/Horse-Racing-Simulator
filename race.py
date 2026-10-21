"""Race simulation: average speeds + Gaussian noise → finish order."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

import settings
from horse import Horse


@dataclass
class RaceResult:
    """Outcome of one simulated race."""

    ordered_horses: list[Horse]  # index 0 = 1st place
    finish_times: dict[int, float]  # horse id → finish time


def _speed_weight(speed: float, tau: float | None = None) -> float:
    tau = settings.PROB_TEMPERATURE if tau is None else tau
    return math.exp(speed / tau)


def win_probabilities(horses: list[Horse]) -> dict[int, float]:
    """P(horse wins) from relative average speeds (Plackett–Luce / softmax)."""
    weights = {h.id: _speed_weight(h.average_speed) for h in horses}
    total = sum(weights.values())
    if total <= 0:
        n = max(len(horses), 1)
        return {h.id: 1.0 / n for h in horses}
    return {hid: w / total for hid, w in weights.items()}


def order_probability(horses: list[Horse], ordered_ids: list[int]) -> float:
    """
    P(these horses finish in this exact order for the first N places).
    Uses sequential Plackett–Luce on the same speed weights as win_probabilities.
    """
    remaining = {h.id: _speed_weight(h.average_speed) for h in horses}
    p = 1.0
    for horse_id in ordered_ids:
        if horse_id not in remaining:
            return 0.0
        total = sum(remaining.values())
        if total <= 0:
            return 0.0
        p *= remaining[horse_id] / total
        del remaining[horse_id]
    return p


def simulate_race(
    horses: list[Horse],
    *,
    distance: float = 1000.0,
    sigma: float | None = None,
    rng: random.Random | None = None,
) -> RaceResult:
    """
    Sample each horse's speed from Normal(average_speed, sigma),
    convert to finish times, and rank 1st–8th.
    """
    if len(horses) != settings.HORSES_PER_RACE:
        raise ValueError(
            f"Expected {settings.HORSES_PER_RACE} horses, got {len(horses)}"
        )

    sigma = settings.SPEED_SIGMA if sigma is None else sigma
    rng = random.Random() if rng is None else rng

    for horse in horses:
        horse.reset_race_state()
        sampled = rng.gauss(horse.average_speed, sigma)
        horse.sampled_speed = max(1.0, sampled)
        horse.finish_time = distance / horse.sampled_speed

    ordered = sorted(horses, key=lambda h: h.finish_time)
    for place, horse in enumerate(ordered, start=1):
        horse.place = place

    finish_times = {h.id: h.finish_time for h in horses}
    return RaceResult(ordered_horses=ordered, finish_times=finish_times)


def print_race_result(result: RaceResult) -> None:
    print("Finishing order:")
    for horse in result.ordered_horses:
        print(
            f"  {horse.place}. {horse.name:16s}  "
            f"avg={horse.average_speed:5.1f}  "
            f"sampled={horse.sampled_speed:5.1f}  "
            f"time={horse.finish_time:6.2f}"
        )


if __name__ == "__main__":
    from horse import make_horse
    from horses_data import get_horse
    from race_card import get_race_field_ids

    field_ids = get_race_field_ids(0)
    starters = [
        make_horse(get_horse(hid), settings.HORSE_COLORS[i])
        for i, hid in enumerate(field_ids)
    ]
    probs = win_probabilities(starters)
    print("Win probabilities (Race 1):")
    for horse in starters:
        print(f"  {horse.name:16s}  {100.0 * probs[horse.id]:5.1f}%")
    outcome = simulate_race(starters, rng=random.Random(42))
    print("Console test — Race 1 (seed=42)")
    print_race_result(outcome)
