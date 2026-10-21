"""Simple UI helpers: clickable buttons and text field hit-boxes."""

from __future__ import annotations

from dataclasses import dataclass

import pygame


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
    ) -> None:
        fill = bg if self.enabled else (disabled_bg or (70, 70, 70))
        text_color = fg if self.enabled else (140, 140, 140)
        pygame.draw.rect(surface, fill, self.rect, border_radius=6)
        pygame.draw.rect(surface, border, self.rect, width=2, border_radius=6)
        text = font.render(self.label, True, text_color)
        text_rect = text.get_rect(center=self.rect.center)
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
