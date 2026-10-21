"""The crowd around the track. Fans wear their horse's color and cheer for it.

build_crowd and detect_passes are honest (plain values in, out).
draw_crowd only draws.
"""

from __future__ import annotations

import math
import random

import pygame

import settings
from track import outer_rail_radius, point_on_radius

ROWS = (16, 29)  # px outside the outer rail. two rows
SPACING = 10  # px between people along a row
SKIN = [(240, 200, 160), (210, 160, 120), (160, 110, 75), (110, 75, 50)]


def build_crowd(
    horse_ids: list[int], colors: list[tuple[int, int, int]], rng: random.Random
) -> list[dict]:
    """People on two rings outside the rail. Fans sit in runs of 3-7 so the colors read as blocks."""
    people: list[dict] = []
    for row, off in enumerate(ROWS):
        radius = outer_rail_radius() + off
        length = 2 * settings.TRACK_STRAIGHT + 2 * math.pi * radius
        n = int(length / SPACING)
        k, left = 0, 0
        for i in range(n):
            if left == 0:
                k = rng.randrange(len(horse_ids))
                left = rng.randint(3, 7)
            left -= 1
            x, y, _ = point_on_radius(radius, (i + 0.5 * row) / n)
            people.append({
                "x": x, "y": y, "fan": horse_ids[k], "color": colors[k],
                "phase": rng.uniform(0, math.tau), "skin": rng.choice(SKIN),
            })
    people.sort(key=lambda p: p["y"])  # far ones first, near ones on top
    return people


def detect_passes(
    order: list[int], progress: dict[int, float], margin: float = 0.004
) -> tuple[list[int], list[tuple[int, int]]]:
    """order is horse ids, leader first. Returns the new order and (passer, passed) pairs.

    The margin keeps two horses side by side from trading places every frame.
    One bubble pass per call. Fine at 60fps, it catches up next frame.
    """
    order = list(order)
    passes = []
    for i in range(1, len(order)):
        behind, ahead = order[i], order[i - 1]
        if progress[behind] > progress[ahead] + margin:
            order[i - 1], order[i] = behind, ahead
            passes.append((behind, ahead))
    return order, passes


def draw_crowd(
    surface: pygame.Surface, people: list[dict], levels: dict[int, float], t: float
) -> None:
    """levels: horse id -> 0..1 cheer. 0 = standing and swaying, 1 = jumping with arms up."""
    for p in people:
        c = levels.get(p["fan"], 0.0)
        phase = p["phase"]
        sway = math.sin(t * 1.5 + phase) * 0.8 * (1 - c)
        bob = c * abs(math.sin(t * 11 + phase)) * 5
        bx, by = int(p["x"] + sway), int(p["y"] - bob)
        wave = math.sin(t * 14 + phase) * 2.5 * c
        hand_y = int(by + 5 - 18 * c)
        spread = 4 + 2 * c
        for side in (-1, 1):
            hand_x = int(bx + side * spread + (wave if side > 0 else -wave))
            pygame.draw.line(surface, p["skin"], (bx + side * 3, by), (hand_x, hand_y), 2)
            if c > 0.3:
                pygame.draw.circle(surface, (255, 255, 255), (hand_x, hand_y), 2)
        pygame.draw.rect(surface, p["color"], (bx - 3, by - 2, 6, 8), border_radius=2)
        pygame.draw.circle(surface, p["skin"], (bx, by - 6), 3)
        if c > 0.3:
            pygame.draw.circle(surface, (60, 20, 20), (bx, by - 5), 1)  # open mouth
