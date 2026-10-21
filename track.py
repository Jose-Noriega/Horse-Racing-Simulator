"""Stadium oval geometry: lanes, progress, and drawing."""

from __future__ import annotations

import math

import pygame

import settings


def lane_radius(lane_index: float) -> float:
    """Lane 0 is the rail. Fractional indices are used for inner/outer rails."""
    return settings.TRACK_INNER_RADIUS + (lane_index + 0.5) * settings.TRACK_LANE_WIDTH


def inner_rail_radius() -> float:
    return settings.TRACK_INNER_RADIUS


def outer_rail_radius() -> float:
    return settings.TRACK_INNER_RADIUS + settings.HORSES_PER_RACE * settings.TRACK_LANE_WIDTH


def lane_length(lane_index: float) -> float:
    r = lane_radius(lane_index)
    return 2 * settings.TRACK_STRAIGHT + 2 * math.pi * r


def point_on_radius(radius: float, progress: float) -> tuple[float, float, float]:
    """
    Position and heading (radians, pygame coords) for progress in [0, 1].
    0 / 1 is the finish line at the start of the homestretch (bottom, running right).
    Path is counterclockwise on screen.
    """
    progress = progress % 1.0
    if progress < 0:
        progress += 1.0
    L = settings.TRACK_STRAIGHT
    cx = settings.TRACK_CENTER_X
    cy = settings.TRACK_CENTER_Y
    perimeter = 2 * L + 2 * math.pi * radius
    dist = progress * perimeter

    # Homestretch: bottom, left → right
    if dist <= L:
        x = cx - L / 2 + dist
        y = cy + radius
        return x, y, 0.0
    dist -= L

    # Right bend: bottom → top through the east (counterclockwise)
    arc = math.pi * radius
    if dist <= arc:
        frac = dist / arc
        # From +pi/2 (down) to -pi/2 (up), decreasing
        ang = math.pi / 2 - frac * math.pi
        x = cx + L / 2 + radius * math.cos(ang)
        y = cy + radius * math.sin(ang)
        heading = ang - math.pi / 2
        return x, y, heading
    dist -= arc

    # Backstretch: top, right → left
    if dist <= L:
        x = cx + L / 2 - dist
        y = cy - radius
        return x, y, math.pi
    dist -= L

    # Left bend: top → bottom through the west
    frac = dist / arc if arc else 0.0
    frac = min(1.0, max(0.0, frac))
    ang = -math.pi / 2 - frac * math.pi
    x = cx - L / 2 + radius * math.cos(ang)
    y = cy + radius * math.sin(ang)
    heading = ang - math.pi / 2
    return x, y, heading


def point_on_lane(lane_index: float, progress: float) -> tuple[float, float, float]:
    return point_on_radius(lane_radius(lane_index), progress)


def _stadium_polygon(radius: float, steps: int = 96) -> list[tuple[int, int]]:
    pts: list[tuple[int, int]] = []
    for i in range(steps):
        x, y, _ = point_on_radius(radius, i / steps)
        pts.append((int(x), int(y)))
    return pts


def draw_oval_track(surface: pygame.Surface) -> None:
    surface.fill(settings.INFIELD)

    outer = _stadium_polygon(outer_rail_radius() + 6, 120)
    pygame.draw.polygon(surface, settings.DIRT_DARK, outer)
    dirt = _stadium_polygon(outer_rail_radius(), 120)
    pygame.draw.polygon(surface, settings.DIRT, dirt)
    infield = _stadium_polygon(inner_rail_radius() - 4, 96)
    pygame.draw.polygon(surface, settings.INFIELD, infield)

    pygame.draw.polygon(surface, settings.RAIL, _stadium_polygon(inner_rail_radius(), 96), width=3)
    pygame.draw.polygon(surface, settings.RAIL, _stadium_polygon(outer_rail_radius(), 120), width=3)

    # Subtle lane lines
    for i in range(1, settings.HORSES_PER_RACE):
        r = settings.TRACK_INNER_RADIUS + i * settings.TRACK_LANE_WIDTH
        pygame.draw.polygon(surface, (180, 150, 100), _stadium_polygon(r, 80), width=1)

    # Finish line across the homestretch
    inner = point_on_radius(inner_rail_radius(), 0.0)
    outer_pt = point_on_radius(outer_rail_radius(), 0.0)
    for stripe in range(8):
        t0 = stripe / 8
        t1 = (stripe + 1) / 8
        x0 = inner[0] + (outer_pt[0] - inner[0]) * t0
        y0 = inner[1] + (outer_pt[1] - inner[1]) * t0
        x1 = inner[0] + (outer_pt[0] - inner[0]) * t1
        y1 = inner[1] + (outer_pt[1] - inner[1]) * t1
        color = settings.WHITE if stripe % 2 == 0 else settings.BLACK
        pygame.draw.line(surface, color, (x0, y0), (x1, y1), 6)
