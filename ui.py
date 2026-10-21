"""Simple UI helpers: clickable buttons and text field hit-boxes."""

from __future__ import annotations

from dataclasses import dataclass

import pygame


def short_num(x: float, decimals: int = 2) -> str:
    """12.5 -> '12.50', 12_500 -> '12.5K', 1_200_000 -> '1.2M'.

    Under 10K we show the full number so small bets stay exact.
    """
    sign = "-" if x < 0 else ""
    x = abs(x)
    # (cutoff, divisor, suffix). cutoffs sit just under the divisor
    # so 999,999 shows 1M, not 1000K. K starts at 10K so 1,234.50 stays exact.
    for cutoff, size, suffix in (
        (0.99995e12, 1e12, "T"),
        (0.99995e9, 1e9, "B"),
        (0.99995e6, 1e6, "M"),
        (1e4, 1e3, "K"),
    ):
        if x >= cutoff:
            text = f"{x / size:.1f}".removesuffix(".0")  # "2M" not "2.0M"
            return f"{sign}{text}{suffix}"
    return f"{sign}{x:.{decimals}f}"


@dataclass
class Button:
    rect: pygame.Rect
    label: str
    enabled: bool = True

    def draw(
        self,
        surface: pygame.Surface,
        font: pygame.font.Font,
        *,
        bg: tuple[int, int, int],
        fg: tuple[int, int, int],
        border: tuple[int, int, int],
        disabled_bg: tuple[int, int, int] | None = None,
        hover: bool = False,
        pressed: bool = False,
        glow: float = 0.0,
    ) -> None:
        """Soft "neomorphic" button: raised slab with a light and a dark shadow.

        Pressed = sunk in. bg is the face color. border is the accent
        (hover text + glow). Hack: real neomorphism wants the button to match
        its background. Ours is a dark slate that reads OK on our dark screens.
        """
        enabled = self.enabled
        face = bg if enabled else (disabled_bg or (52, 54, 60))
        if enabled and hover:
            face = tuple(min(255, c + 8) for c in face)
        if enabled and pressed:
            face = tuple(max(0, c - 14) for c in face)
        r = 14
        w, h = self.rect.size
        pad = 14
        layer = pygame.Surface((w + 2 * pad, h + 2 * pad), pygame.SRCALPHA)
        body = pygame.Rect(pad, pad, w, h)

        if enabled and not pressed:
            # soft shadows: stacked rounded rects with falling alpha
            for i in range(6, 0, -1):
                spread = pygame.Rect(body).inflate(i * 2, i * 2)
                dark = spread.move(4, 4)
                light = spread.move(-3, -3)
                pygame.draw.rect(layer, (0, 0, 0, 10), dark, border_radius=r + i)
                pygame.draw.rect(layer, (255, 255, 255, 5), light, border_radius=r + i)

        if glow > 0 and enabled:
            for i in range(1, 7):
                alpha = int(glow * 70 / i)
                pygame.draw.rect(
                    layer, (*border, alpha), body.inflate(i * 3, i * 3),
                    width=2, border_radius=r + i,
                )

        # face: vertical gradient, flipped when sunk in
        top, bottom = (tuple(min(255, c + 12) for c in face), tuple(max(0, c - 12) for c in face))
        if pressed and enabled:
            top, bottom = bottom, top
        grad = pygame.Surface((w, h), pygame.SRCALPHA)
        for y in range(h):
            t = y / max(1, h - 1)
            color = tuple(int(top[k] + (bottom[k] - top[k]) * t) for k in range(3))
            pygame.draw.line(grad, (*color, 255), (0, y), (w, y))
        mask = pygame.Surface((w, h), pygame.SRCALPHA)
        pygame.draw.rect(mask, (255, 255, 255, 255), mask.get_rect(), border_radius=r)
        grad.blit(mask, (0, 0), special_flags=pygame.BLEND_RGBA_MULT)
        layer.blit(grad, body.topleft)

        if enabled and pressed:
            # inner edge: dark on top-left, light on bottom-right
            pygame.draw.rect(layer, (0, 0, 0, 70), body, width=2, border_radius=r)
            pygame.draw.line(layer, (255, 255, 255, 40), (body.x + r, body.bottom - 1), (body.right - r, body.bottom - 1))

        surface.blit(layer, (self.rect.x - pad, self.rect.y - pad))

        text_color = (140, 140, 140) if not enabled else (border if hover else fg)
        text = font.render(self.label, True, text_color)
        text_rect = text.get_rect(center=self.rect.center)
        if pressed and enabled:
            text_rect.move_ip(1, 1)
        surface.blit(text, text_rect)

    def hit(self, pos: tuple[int, int]) -> bool:
        return self.enabled and self.rect.collidepoint(pos)


@dataclass
class TextBox:
    rect: pygame.Rect
    active: bool = False

    def hit(self, pos: tuple[int, int]) -> bool:
        return self.rect.collidepoint(pos)

    def draw(
        self,
        surface: pygame.Surface,
        font: pygame.font.Font,
        text: str,
        *,
        fg: tuple[int, int, int],
        bg: tuple[int, int, int],
        border: tuple[int, int, int],
        active_border: tuple[int, int, int],
    ) -> None:
        pygame.draw.rect(surface, bg, self.rect, border_radius=4)
        edge = active_border if self.active else border
        pygame.draw.rect(surface, edge, self.rect, width=2, border_radius=4)
        display = text + ("|" if self.active else "")
        label = font.render(display, True, fg)
        surface.blit(label, (self.rect.x + 8, self.rect.y + (self.rect.height - label.get_height()) // 2))
