"""Horse sprites, drawn with pygame shapes (no image files).

Side view, flipped to face left or right. Not rotated, so a horse on the
backstretch runs left instead of upside down.
"""

from __future__ import annotations

import math

import pygame

SCALE = 0.8
STRIDES_PER_RACE = 45  # leg cycles from start to finish. tied to distance, so faster horses stride faster
LEG_COLOR = (40, 30, 25)
SILK = (240, 240, 240)

# (hip x, phase offset in cycles). diagonal pairs move together, like a trot/gallop
LEGS = ((9, 0.0), (6, 0.5), (-9, 0.25), (-6, 0.75))


def stride_phase(progress: float) -> float:
    return progress * STRIDES_PER_RACE


def footfall_count(progress: float) -> int:
    """Hooves down so far. Sound uses this so thuds land on the drawn steps.

    A foot touches down when its swing is at the front, which is
    phase = 0.25 - offset. Our offsets are k/4, so touchdowns fall on every
    1/4 cycle, one leg each. This only holds while LEGS offsets are k/len(LEGS).
    """
    return int(stride_phase(progress) * len(LEGS))


def draw_horse(
    surface: pygame.Surface,
    x: float,
    y: float,
    heading: float,
    color: tuple[int, int, int],
    phase: float,
    running: bool,
) -> None:
    """Draw one horse centered on (x, y). phase is in leg cycles."""
    face = 1 if math.cos(heading) >= 0 else -1
    t = phase * 2 * math.pi

    def pt(px: float, py: float) -> tuple[int, int]:
        return (int(x + face * px * SCALE), int(y + py * SCALE))

    bob = -abs(math.sin(t)) * 2 if running else 0

    # legs first so the body covers the hips
    for hip_x, offset in LEGS:
        swing = math.sin(t + offset * 2 * math.pi) if running else 0
        lift = max(0.0, math.cos(t + offset * 2 * math.pi)) * 4 if running else 0
        hip = pt(hip_x, 4 + bob)
        foot = pt(hip_x + swing * 7, 15 - lift)
        pygame.draw.line(surface, LEG_COLOR, hip, foot, 3)

    # tail waves with the stride
    wave = math.sin(t) * 2 if running else 0
    pygame.draw.line(surface, LEG_COLOR, pt(-13, -3 + bob), pt(-22, 3 + wave), 3)

    # body, neck, head
    body = pygame.Rect(0, 0, int(30 * SCALE), int(15 * SCALE))
    body.center = pt(0, -3 + bob)
    pygame.draw.ellipse(surface, color, body)
    pygame.draw.ellipse(surface, LEG_COLOR, body, 1)
    neck = [pt(8, -8 + bob), pt(14, -20 + bob), pt(19, -17 + bob), pt(13, -3 + bob)]
    pygame.draw.polygon(surface, color, neck)
    head = [pt(15, -21 + bob), pt(26, -14 + bob), pt(24, -10 + bob), pt(14, -16 + bob)]
    pygame.draw.polygon(surface, color, head)
    pygame.draw.polygon(surface, LEG_COLOR, head, 1)

    # jockey: silks + head. leans forward when running
    lean = 3 if running else 0
    pygame.draw.circle(surface, SILK, pt(1 + lean, -17 + bob), max(2, int(5 * SCALE)))
    pygame.draw.circle(surface, LEG_COLOR, pt(1 + lean, -24 + bob), max(2, int(3 * SCALE)))


def draw_starter(
    surface: pygame.Surface, x: int, y: int, raise_: float, shot_age: float | None
) -> None:
    """The starter, feet at (x, y). raise_ 0 = gun down, 1 = gun straight up.

    shot_age is seconds since the shot (None = not fired). Drives recoil,
    muzzle flash and a smoke trail.
    """
    coat, hat, skin = (160, 35, 35), (25, 25, 30), (230, 190, 150)
    pygame.draw.line(surface, (30, 30, 40), (x - 3, y - 11), (x - 4, y), 3)  # legs
    pygame.draw.line(surface, (30, 30, 40), (x + 3, y - 11), (x + 4, y), 3)
    pygame.draw.rect(surface, coat, (x - 6, y - 25, 12, 15), border_radius=3)  # coat
    pygame.draw.circle(surface, skin, (x, y - 30), 5)  # head
    pygame.draw.rect(surface, hat, (x - 6, y - 35, 12, 2))  # top hat: brim, then crown
    pygame.draw.rect(surface, hat, (x - 4, y - 42, 8, 8))

    # gun arm: from the right shoulder, angle goes from pointing down-forward to straight up
    shoulder = (x + 6, y - 23)
    angle = math.radians(60 - 150 * raise_)  # 60 = down and out, -90 = up
    if shot_age is not None and shot_age < 0.25:
        angle -= math.radians(25) * (1 - shot_age / 0.25)  # recoil kicks it back
    hand = (shoulder[0] + math.cos(angle) * 10, shoulder[1] + math.sin(angle) * 10)
    tip = (hand[0] + math.cos(angle) * 8, hand[1] + math.sin(angle) * 8)
    pygame.draw.line(surface, coat, shoulder, hand, 4)
    pygame.draw.line(surface, (20, 20, 20), hand, tip, 3)  # barrel
    pygame.draw.circle(surface, skin, (int(hand[0]), int(hand[1])), 2)

    if shot_age is None:
        return
    if shot_age < 0.09:  # muzzle flash
        r = int(9 * (1 - shot_age / 0.09)) + 3
        pygame.draw.circle(surface, (255, 235, 140), (int(tip[0]), int(tip[1])), r)
        pygame.draw.circle(surface, (255, 255, 255), (int(tip[0]), int(tip[1])), max(1, r // 2))
    if shot_age < 1.6:  # smoke drifts up and spreads
        for k in range(5):
            age = shot_age - 0.04 * k
            if age <= 0:
                continue
            f = age / 1.6
            r = int(3 + 9 * f)
            puff = pygame.Surface((r * 2, r * 2), pygame.SRCALPHA)
            pygame.draw.circle(puff, (200, 200, 200, int(150 * (1 - f))), (r, r), r)
            surface.blit(puff, (int(tip[0] + 6 * k * f) - r, int(tip[1] - 30 * f - 4 * k) - r))
