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


# Each horse gets its own random speed curve over its race (1.0 = even pace).
# Curves are independent, so horses speed up and fade at different moments
# and pass each other. Final order is untouched: pace_progress is normalized
# so every horse still hits the line at its simulated finish time.
PACE_KNOTS = 10  # fewer knots = longer surges. more knots = twitchy jitter
PACE_SWING = 0.6  # max +/- random wobble at a knot. Higher = more passing.
PACE_TILT = 2.0  # front-runners (fast early, fade) vs closers (slow early, fast late)
START_DRAG = 0.25  # everyone breaks a bit slow from the gate
MAX_KICK = 0.8  # a horse's late surge is random in 0..MAX_KICK, so some close hard


def assign_pace_profiles(
    horses: list[Horse], rng: random.Random | None = None
) -> None:
    """Give each horse a variable-speed profile for the animation.

    Shape = slow start + random-size kick in the last third + front-runner
    or closer tilt + wobble.
    Hack: the shape is cosmetic. pace_progress normalizes it, so the
    finish order still comes from simulate_race.
    """
    rng = random.Random() if rng is None else rng
    for horse in horses:
        kick = rng.uniform(0.0, MAX_KICK)
        style = rng.uniform(-1.0, 1.0)  # -1 front-runner, +1 closer
        horse.pace_speeds = []
        for i in range(PACE_KNOTS):
            t = i / (PACE_KNOTS - 1)
            shape = -START_DRAG * (1 - t) ** 3 + kick * t**3 + PACE_TILT * style * (t - 0.5)
            wobble = rng.uniform(-PACE_SWING, PACE_SWING)
            horse.pace_speeds.append(max(0.4, 1.0 + shape + wobble))


def pace_progress(pace_speeds: list[float], u: float) -> float:
    """
    Fraction of the lap completed at fraction u of this horse's race time.
    Speed varies along the race; the curve is normalized so progress is 1 at u=1.
    """
    if u <= 0:
        return 0.0
    if u >= 1 or not pace_speeds:
        return 1.0
    n = len(pace_speeds)
    if n == 1:
        return min(1.0, u)

    def speed_at(t: float) -> float:
        t = min(1.0, max(0.0, t))
        pos = t * (n - 1)
        i = min(n - 2, int(pos))
        f = pos - i
        return pace_speeds[i] * (1 - f) + pace_speeds[i + 1] * f

    samples = 48
    total = 0.0
    reached = 0.0
    for k in range(samples):
        t0 = k / samples
        t1 = (k + 1) / samples
        mid = speed_at(0.5 * (t0 + t1))
        piece = mid * (t1 - t0)
        total += piece
        if t1 <= u:
            reached += piece
        elif t0 < u:
            reached += mid * (u - t0)
    if total <= 0:
        return min(1.0, u)
    return min(1.0, reached / total)


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
