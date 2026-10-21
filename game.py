"""Main game loop: menu, betting, animated race, results, and card summary."""

from __future__ import annotations

import math
from enum import Enum, auto

import pygame

import settings
from betting import BettingPool, format_player
from horse import Horse, make_horse
from horses_data import get_horse
from race import (
    RaceResult,
    assign_pace_profiles,
    order_probability,
    pace_progress,
    simulate_race,
    win_probabilities,
)
from race_card import get_race_field_ids
from track import draw_oval_track, point_on_lane
from ui import Button, TextBox


class ScreenState(Enum):
    MENU = auto()
    BETTING = auto()
    RACE = auto()
    RESULTS = auto()
    SUMMARY = auto()


STATE_LABELS = {
    ScreenState.MENU: "MENU",
    ScreenState.BETTING: "BETTING",
    ScreenState.RACE: "RACE",
    ScreenState.RESULTS: "RESULTS",
    ScreenState.SUMMARY: "SUMMARY",
}


class Game:
    """Owns the window, clock, race card progress, bets, and main loop."""

    def __init__(self) -> None:
        self.screen = pygame.display.set_mode(
            (settings.SCREEN_WIDTH, settings.SCREEN_HEIGHT)
        )
        pygame.display.set_caption(settings.TITLE)
        self.clock = pygame.time.Clock()
        self.running = True
        self.state = ScreenState.MENU

        self.race_index = 0
        self.field: list[Horse] = []
        self.pool = BettingPool()
        self.race_result: RaceResult | None = None
        self.session_payouts: dict[int, tuple[str, float]] = {}  # player # → (name, paid)
        self.last_payouts: list = []
        self.pool_refunded = False
        self.win_probs: dict[int, float] = {}

        self.active_field = "player"
        self.player_text = ""
        self.name_text = ""
        self.wager_text = "10"
        self.selected_lanes: list[int] = []
        self.status_message = ""

        # Race animation
        self.race_elapsed = 0.0
        self.race_time_scale = 1.0
        self.race_finished = False
        self.race_hold_timer = 0.0
        self.settlements_applied = False
        self.HORSE_RADIUS = 10

        self.title_font = pygame.font.Font(None, settings.FONT_SIZE_TITLE)
        self.large_font = pygame.font.Font(None, settings.FONT_SIZE_LARGE)
        self.medium_font = pygame.font.Font(None, settings.FONT_SIZE_MEDIUM)
        self.small_font = pygame.font.Font(None, settings.FONT_SIZE_SMALL)

        # Shared UI controls (rects updated per screen draw/layout)
        self.btn_start_card = Button(pygame.Rect(0, 0, 260, 52), "Start Race Card")
        self.btn_place_bet = Button(pygame.Rect(520, 248, 150, 40), "Place Bet")
        self.btn_clear_picks = Button(pygame.Rect(680, 248, 150, 40), "Clear Picks")
        self.btn_undo_bet = Button(pygame.Rect(520, 344, 150, 36), "Undo Bet")
        self.btn_start_race = Button(pygame.Rect(680, 344, 150, 36), "Start Race")
        self.btn_next = Button(pygame.Rect(0, 0, 220, 44), "Next Race")
        self.btn_summary_menu = Button(pygame.Rect(0, 0, 240, 48), "Back to Menu")

        self.player_box = TextBox(pygame.Rect(520, 108, 90, 36))
        self.name_box = TextBox(pygame.Rect(620, 108, 190, 36))
        self.wager_box = TextBox(pygame.Rect(520, 168, 160, 36))
        self.lane_rects: list[pygame.Rect] = []

        self._load_current_field()
        self._sync_text_box_active()

    def _sync_text_box_active(self) -> None:
        self.player_box.active = self.active_field == "player"
        self.name_box.active = self.active_field == "name"
        self.wager_box.active = self.active_field == "wager"

    FORM_FIELDS = ("player", "name", "wager")

    def _load_current_field(self) -> None:
        field_ids = get_race_field_ids(self.race_index)
        self.field = [
            make_horse(
                get_horse(hid),
                settings.HORSE_COLORS[i % len(settings.HORSE_COLORS)],
            )
            for i, hid in enumerate(field_ids)
        ]
        for lane, horse in enumerate(self.field):
            horse.lane_index = lane
            horse.lane_y = (
                settings.TRACK_MARGIN_TOP
                + lane * settings.LANE_HEIGHT
                + settings.LANE_HEIGHT / 2
            )
            horse.x = float(settings.TRACK_START_X)
        self.pool.clear()
        self.race_result = None
        self.last_payouts = []
        self.pool_refunded = False
        self.selected_lanes = []
        self.win_probs = win_probabilities(self.field)
        self.status_message = ""
        self.race_elapsed = 0.0
        self.race_finished = False
        self.race_hold_timer = 0.0
        self.settlements_applied = False
        self.lane_rects = []

    def run(self) -> None:
        while self.running:
            dt = self.clock.tick(settings.FPS) / 1000.0
            self._handle_events()
            self._update(dt)
            self._draw()

    def _handle_events(self) -> None:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
                continue

            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                self._handle_click(event.pos)
                continue

            if event.type != pygame.KEYDOWN:
                continue

            if event.key == pygame.K_ESCAPE:
                self.running = False
                continue

            if self.state == ScreenState.MENU:
                self._handle_menu_key(event)
            elif self.state == ScreenState.BETTING:
                self._handle_betting_key(event)
            elif self.state == ScreenState.RACE:
                self._handle_race_key(event)
            elif self.state == ScreenState.RESULTS:
                self._handle_results_key(event)
            elif self.state == ScreenState.SUMMARY:
                self._handle_summary_key(event)

    def _handle_click(self, pos: tuple[int, int]) -> None:
        if self.state == ScreenState.MENU:
            if self.btn_start_card.hit(pos):
                self._begin_card()
            return

        if self.state == ScreenState.BETTING:
            for i, rect in enumerate(self.lane_rects):
                if rect.collidepoint(pos):
                    self._toggle_or_add_pick(i)
                    return
            if self.player_box.hit(pos):
                self.active_field = "player"
                self._sync_text_box_active()
                return
            if self.name_box.hit(pos):
                self.active_field = "name"
                self._sync_text_box_active()
                return
            if self.wager_box.hit(pos):
                self.active_field = "wager"
                self._sync_text_box_active()
                return
            if self.btn_place_bet.hit(pos):
                self._place_bet()
                return
            if self.btn_clear_picks.hit(pos):
                self.selected_lanes = []
                self.status_message = "Picks cleared."
                return
            if self.btn_undo_bet.hit(pos):
                self._undo_bet()
                return
            if self.btn_start_race.hit(pos):
                self._start_race()
                return
            return

        if self.state == ScreenState.RESULTS:
            if self.btn_next.hit(pos):
                self._advance_from_results()
            return

        if self.state == ScreenState.SUMMARY:
            if self.btn_summary_menu.hit(pos):
                self.state = ScreenState.MENU
            return

        if self.state == ScreenState.RACE:
            # Click skips / finishes race view
            self._handle_race_skip()

    def _begin_card(self) -> None:
        self.race_index = 0
        self.session_payouts.clear()
        self.pool.player_names.clear()
        self._load_current_field()
        self.state = ScreenState.BETTING

    def _toggle_or_add_pick(self, lane: int) -> None:
        if lane in self.selected_lanes:
            # Clicking an already-picked horse drops it and later legs.
            idx = self.selected_lanes.index(lane)
            self.selected_lanes = self.selected_lanes[:idx]
            return
        if len(self.selected_lanes) >= 3:
            self.status_message = "Parlays can have at most 3 horses."
            return
        self.selected_lanes.append(lane)

    def _handle_menu_key(self, event: pygame.event.Event) -> None:
        if event.key in (pygame.K_RETURN, pygame.K_SPACE):
            self._begin_card()

    def _handle_betting_key(self, event: pygame.event.Event) -> None:
        if event.key == pygame.K_F5:
            self._start_race()
            return
        if event.key == pygame.K_z and (pygame.key.get_mods() & pygame.KMOD_CTRL):
            self._undo_bet()
            return

        if event.key == pygame.K_TAB:
            idx = self.FORM_FIELDS.index(self.active_field)
            self.active_field = self.FORM_FIELDS[(idx + 1) % len(self.FORM_FIELDS)]
            self._sync_text_box_active()
            return

        if event.key == pygame.K_RETURN:
            self._place_bet()
            return

        if event.key == pygame.K_BACKSPACE:
            if self.active_field == "player":
                self.player_text = self.player_text[:-1]
                self._autofill_name_from_player()
            elif self.active_field == "name":
                self.name_text = self.name_text[:-1]
            else:
                self.wager_text = self.wager_text[:-1]
            return

        if self.active_field == "player":
            char = event.unicode
            if char and char.isdigit() and len(self.player_text) < 4:
                self.player_text += char
                self._autofill_name_from_player()
            return

        if self.active_field == "wager":
            char = event.unicode
            if char and (char.isdigit() or char == "."):
                if len(self.wager_text) < 10:
                    self.wager_text += char
            return

        if pygame.K_1 <= event.key <= pygame.K_8:
            self._toggle_or_add_pick(event.key - pygame.K_1)
            return

        char = event.unicode
        if not char:
            return
        if self.active_field == "name" and char.isprintable() and len(self.name_text) < 20:
            self.name_text += char

    def _autofill_name_from_player(self) -> None:
        try:
            number = int(self.player_text)
        except ValueError:
            return
        known = self.pool.player_names.get(number)
        if known is not None:
            self.name_text = known

    def _handle_race_key(self, event: pygame.event.Event) -> None:
        if event.key in (pygame.K_RETURN, pygame.K_SPACE):
            self._handle_race_skip()

    def _handle_race_skip(self) -> None:
        if not self.race_finished:
            self._snap_race_to_finish()
        else:
            self._go_to_results()

    def _handle_results_key(self, event: pygame.event.Event) -> None:
        if event.key in (pygame.K_RETURN, pygame.K_SPACE, pygame.K_n):
            self._advance_from_results()

    def _handle_summary_key(self, event: pygame.event.Event) -> None:
        if event.key in (pygame.K_RETURN, pygame.K_SPACE):
            self.state = ScreenState.MENU

    def _advance_from_results(self) -> None:
        if self.race_index + 1 < settings.RACES_PER_SESSION:
            self.race_index += 1
            self._load_current_field()
            self.state = ScreenState.BETTING
        else:
            self.state = ScreenState.SUMMARY

    def _place_bet(self) -> None:
        if not self.field:
            self.status_message = "No field loaded."
            return
        if not self.selected_lanes:
            self.status_message = "Pick at least one horse (click in finish order for a parlay)."
            return
        try:
            player_number = int(self.player_text)
        except ValueError:
            self.status_message = "Enter a player number."
            return
        try:
            amount = float(self.wager_text)
        except ValueError:
            self.status_message = "Enter a valid wager amount."
            return
        horse_ids = [self.field[i].id for i in self.selected_lanes]
        names = [self.field[i].name for i in self.selected_lanes]
        try:
            bet = self.pool.add_bet(player_number, self.name_text, horse_ids, amount)
        except ValueError as exc:
            self.status_message = str(exc)
            return
        label = " → ".join(names)
        kind = "Parlay" if bet.is_parlay else "Win"
        who = format_player(bet.player_number, bet.person_name)
        self.status_message = f"{kind} {who}: {label}  ${bet.amount:.2f} total"
        self.selected_lanes = []

    def _undo_bet(self) -> None:
        if self.pool.undo_last():
            self.status_message = "Last wager undone."
        else:
            self.status_message = "Nothing to undo."

    def _start_race(self) -> None:
        if not self.field:
            self._load_current_field()

        self.race_result = simulate_race(self.field)
        winner_time = self.race_result.ordered_horses[0].finish_time
        self.race_time_scale = settings.TARGET_RACE_SECONDS / max(winner_time, 0.001)
        assign_pace_profiles(self.field)

        for i, horse in enumerate(self.field):
            horse.lane_index = i
            horse.progress = 0.0
            horse.finished = False
            x, y, heading = point_on_lane(i, 0.0)
            horse.x, horse.y, horse.heading = x, y, heading

        self.race_elapsed = 0.0
        self.race_finished = False
        self.race_hold_timer = 0.0
        self.settlements_applied = False
        self.state = ScreenState.RACE
        self.status_message = ""

    def _visual_finish_time(self, horse: Horse) -> float:
        return horse.finish_time * self.race_time_scale

    def _snap_race_to_finish(self) -> None:
        for horse in self.field:
            horse.progress = 1.0
            horse.finished = True
            x, y, heading = point_on_lane(horse.lane_index, 1.0)
            horse.x, horse.y, horse.heading = x, y, heading
        self.race_finished = True
        self.race_hold_timer = 0.0
        if self.race_result:
            last = self.race_result.ordered_horses[-1]
            self.race_elapsed = self._visual_finish_time(last)

    def _go_to_results(self) -> None:
        self._apply_settlements()
        self.state = ScreenState.RESULTS

    def _apply_settlements(self) -> None:
        if self.race_result is None or self.settlements_applied:
            return
        finish_ids = [h.id for h in self.race_result.ordered_horses]
        self.pool_refunded = bool(self.pool.bets) and not self.pool.any_ticket_hits(
            finish_ids
        )
        self.last_payouts = self.pool.payouts_by_player(
            finish_ids,
            self.win_probs,
            lambda ids: order_probability(self.field, ids),
        )
        for payout in self.last_payouts:
            prev_name, prev_amt = self.session_payouts.get(
                payout.player_number, ("", 0.0)
            )
            name = payout.person_name or prev_name
            self.session_payouts[payout.player_number] = (
                name,
                prev_amt + payout.amount,
            )
        self.settlements_applied = True

    def _update(self, dt: float) -> None:
        if self.state != ScreenState.RACE:
            return

        if not self.race_finished:
            self.race_elapsed += dt
            all_done = True
            for horse in self.field:
                visual_t = self._visual_finish_time(horse)
                if visual_t <= 0:
                    u = 1.0
                else:
                    u = min(1.0, self.race_elapsed / visual_t)
                horse.progress = pace_progress(horse.pace_speeds, u)
                if horse.progress >= 1.0:
                    horse.progress = 1.0
                    horse.finished = True
                else:
                    all_done = False
                x, y, heading = point_on_lane(horse.lane_index, horse.progress)
                horse.x, horse.y, horse.heading = x, y, heading
            if all_done:
                self.race_finished = True
                self.race_hold_timer = 0.0
        else:
            self.race_hold_timer += dt
            if self.race_hold_timer >= 1.5:
                self._go_to_results()

    def _draw(self) -> None:
        if self.state == ScreenState.MENU:
            self._draw_menu()
        elif self.state == ScreenState.BETTING:
            self._draw_betting()
        elif self.state == ScreenState.RACE:
            self._draw_race()
        elif self.state == ScreenState.RESULTS:
            self._draw_results()
        elif self.state == ScreenState.SUMMARY:
            self._draw_summary()

        self._draw_state_overlay()
        pygame.display.flip()

    def _draw_centered(
        self, font: pygame.font.Font, text: str, color, y: int
    ) -> None:
        surface = font.render(text, True, color)
        rect = surface.get_rect(center=(settings.SCREEN_WIDTH // 2, y))
        self.screen.blit(surface, rect)

    def _draw_button(self, button: Button) -> None:
        button.draw(
            self.screen,
            self.medium_font,
            bg=(70, 110, 70),
            fg=settings.WHITE,
            border=settings.GOLD,
            disabled_bg=(60, 60, 60),
        )

    def _draw_menu(self) -> None:
        # Soft track-like backdrop
        self.screen.fill((28, 36, 28))
        for i in range(8):
            y = 120 + i * 60
            shade = 40 + (i % 2) * 8
            pygame.draw.rect(
                self.screen,
                (shade, shade + 10, shade),
                (0, y, settings.SCREEN_WIDTH, 60),
            )
        pygame.draw.rect(
            self.screen,
            settings.GOLD,
            (settings.SCREEN_WIDTH - 140, 120, 8, 480),
        )

        self._draw_centered(
            self.title_font, settings.TITLE, settings.GOLD, 200
        )
        self._draw_centered(
            self.medium_font,
            "Party race night · set the card · take bets · watch them run",
            settings.LIGHT_GRAY,
            260,
        )
        self._draw_centered(
            self.small_font,
            f"{settings.TOTAL_HORSES} horse stable  ·  "
            f"{settings.RACES_PER_SESSION} races  ·  "
            f"{settings.HORSES_PER_RACE} per race",
            settings.GRAY,
            300,
        )

        self.btn_start_card.rect.center = (
            settings.SCREEN_WIDTH // 2,
            400,
        )
        self._draw_button(self.btn_start_card)
        self._draw_centered(
            self.small_font,
            "Click the button or press Enter",
            settings.LIGHT_GRAY,
            460,
        )

    def _draw_betting(self) -> None:
        self.screen.fill(settings.DARK_GRAY)
        race_num = self.race_index + 1
        self._draw_centered(
            self.large_font,
            f"Race {race_num} of {settings.RACES_PER_SESSION} — Betting Window",
            settings.GOLD,
            36,
        )

        # Field panel
        pygame.draw.rect(self.screen, settings.PANEL, (24, 70, 460, 520), border_radius=8)
        header = self.medium_font.render("Field — click in finish order", True, settings.WHITE)
        self.screen.blit(header, (40, 84))
        hint = self.small_font.render("1 horse = win  ·  2–3 = parlay", True, settings.GRAY)
        self.screen.blit(hint, (40, 108))

        self.lane_rects = []
        y = 132
        for i, horse in enumerate(self.field):
            rect = pygame.Rect(40, y, 420, 48)
            self.lane_rects.append(rect)
            pick_rank = (
                self.selected_lanes.index(i) + 1
                if i in self.selected_lanes
                else None
            )
            bg = (75, 75, 55) if pick_rank else (48, 48, 48)
            pygame.draw.rect(self.screen, bg, rect, border_radius=6)
            if pick_rank:
                pygame.draw.rect(self.screen, settings.GOLD, rect, width=2, border_radius=6)
            pygame.draw.circle(self.screen, horse.color, (rect.x + 24, rect.centery), 12)
            prefix = f"{pick_rank}. " if pick_rank else f"{i + 1}. "
            line1 = self.small_font.render(
                f"{prefix}{horse.name}", True, settings.WHITE
            )
            p_win = self.win_probs.get(horse.id, 0.0)
            line2 = self.small_font.render(
                f"Win chance {100.0 * p_win:.1f}%", True, settings.LIGHT_GRAY
            )
            self.screen.blit(line1, (rect.x + 48, rect.y + 8))
            self.screen.blit(line2, (rect.x + 48, rect.y + 26))
            y += 54

        # Bet form panel
        pygame.draw.rect(self.screen, settings.PANEL, (500, 70, 360, 310), border_radius=8)
        self.screen.blit(
            self.medium_font.render("Place a bet", True, settings.WHITE),
            (520, 80),
        )
        self.screen.blit(self.small_font.render("Player #", True, settings.GRAY), (520, 92))
        self.screen.blit(self.small_font.render("Name", True, settings.GRAY), (620, 92))
        self.player_box.draw(
            self.screen,
            self.small_font,
            self.player_text,
            fg=settings.WHITE,
            bg=(35, 35, 35),
            border=settings.GRAY,
            active_border=settings.GOLD,
        )
        self.name_box.draw(
            self.screen,
            self.small_font,
            self.name_text,
            fg=settings.WHITE,
            bg=(35, 35, 35),
            border=settings.GRAY,
            active_border=settings.GOLD,
        )
        self.screen.blit(self.small_font.render("Wager $", True, settings.GRAY), (520, 152))
        self.wager_box.draw(
            self.screen,
            self.small_font,
            self.wager_text,
            fg=settings.WHITE,
            bg=(35, 35, 35),
            border=settings.GRAY,
            active_border=settings.GOLD,
        )
        pick_names = [
            self.field[i].name for i in self.selected_lanes if i < len(self.field)
        ]
        if not pick_names:
            slip = "Picks: (none)"
        elif len(pick_names) == 1:
            slip = f"Win: {pick_names[0]}"
        else:
            slip = "Parlay: " + " → ".join(pick_names)
        self.screen.blit(
            self.small_font.render(slip, True, settings.GOLD),
            (520, 210),
        )
        if len(self.selected_lanes) >= 2:
            ticket_mult = self.pool.displayed_ticket_multiplier(
                [self.field[i].id for i in self.selected_lanes],
                self.field,
                self.win_probs,
            )
            if ticket_mult:
                self.screen.blit(
                    self.small_font.render(
                        f"Est. parlay {ticket_mult:.2f}x", True, settings.LIGHT_GRAY
                    ),
                    (520, 228),
                )
        self._draw_button(self.btn_place_bet)
        self._draw_button(self.btn_clear_picks)
        self.btn_undo_bet.enabled = bool(self.pool.undo_stack)
        self._draw_button(self.btn_undo_bet)
        self._draw_button(self.btn_start_race)

        self.screen.blit(
            self.medium_font.render("Bets this race  (Ctrl+Z undo)", True, settings.WHITE),
            (520, 392),
        )
        bet_y = 418
        if not self.pool.bets:
            self.screen.blit(
                self.small_font.render("(none yet)", True, settings.GRAY),
                (520, bet_y),
            )
        else:
            for bet in self.pool.bets[-8:]:
                horse_names = []
                for hid in bet.horse_ids:
                    horse_names.append(
                        next((h.name for h in self.field if h.id == hid), "?")
                    )
                arrow = " → ".join(horse_names)
                who = format_player(bet.player_number, bet.person_name)
                kind = "P" if bet.is_parlay else "W"
                line = f"{kind} {who} {arrow}  ${bet.amount:.2f}"
                self.screen.blit(
                    self.small_font.render(line, True, settings.LIGHT_GRAY),
                    (520, bet_y),
                )
                bet_y += 20

        # Payout panel
        pygame.draw.rect(self.screen, settings.PANEL, (880, 70, 370, 520), border_radius=8)
        self.screen.blit(
            self.medium_font.render("Payout multipliers", True, settings.WHITE),
            (900, 84),
        )
        self.screen.blit(
            self.small_font.render(
                f"Total pool: ${self.pool.total_pool:.2f}", True, settings.GOLD
            ),
            (900, 118),
        )
        self.screen.blit(
            self.small_font.render(
                "Win bet: if this horse finishes 1st", True, settings.GRAY
            ),
            (900, 148),
        )
        pay_y = 176
        try:
            example_wager = float(self.wager_text) if self.wager_text else 0.0
        except ValueError:
            example_wager = 0.0
        for horse in self.field:
            on_h = self.pool.amount_on_win(horse.id)
            odds = self.pool.displayed_win_multiplier(
                horse.id, self.win_probs, example_wager if example_wager > 0 else 1.0
            )
            if odds is None:
                mult_str = "—"
                example_str = ""
            else:
                mult_str = f"{odds:.2f}x"
                if example_wager > 0:
                    example_str = f"  (${example_wager:.0f}→${example_wager * odds:.2f})"
                else:
                    example_str = ""
            pygame.draw.circle(self.screen, horse.color, (912, pay_y + 8), 8)
            line = f"{horse.name[:12]:12s} {mult_str}{example_str}"
            self.screen.blit(
                self.small_font.render(line, True, settings.LIGHT_GRAY),
                (928, pay_y),
            )
            extra = f"on 1st: ${on_h:.0f}" if on_h > 0 else ""
            if extra:
                self.screen.blit(
                    self.small_font.render(extra, True, settings.GRAY),
                    (928, pay_y + 16),
                )
            pay_y += 42

        if self.status_message:
            self._draw_centered(
                self.small_font,
                self.status_message,
                settings.GREEN,
                settings.SCREEN_HEIGHT - 28,
            )

    def _draw_race(self) -> None:
        draw_oval_track(self.screen)
        race_num = self.race_index + 1

        title = self.large_font.render(
            f"Race {race_num} of {settings.RACES_PER_SESSION}", True, settings.GOLD
        )
        self.screen.blit(title, (24, 12))

        if self.race_finished:
            timer_text = "FINISH!"
        else:
            mins = int(self.race_elapsed) // 60
            secs = int(self.race_elapsed) % 60
            timer_text = f"{mins}:{secs:02d}"
        self.screen.blit(
            self.medium_font.render(timer_text, True, settings.WHITE),
            (settings.SCREEN_WIDTH - 140, 16),
        )

        # Draw backstretch horses first so homestretch reads on top
        def draw_depth(h: Horse) -> float:
            return h.y

        for horse in sorted(self.field, key=draw_depth):
            hx, hy = int(horse.x), int(horse.y)
            pygame.draw.circle(self.screen, horse.color, (hx, hy), self.HORSE_RADIUS)
            pygame.draw.circle(self.screen, settings.BLACK, (hx, hy), self.HORSE_RADIUS, 1)
            # Nose in the direction of travel
            nose = (
                hx + int(math.cos(horse.heading) * (self.HORSE_RADIUS + 8)),
                hy + int(math.sin(horse.heading) * (self.HORSE_RADIUS + 8)),
            )
            pygame.draw.line(self.screen, horse.color, (hx, hy), nose, 3)

            label = self.small_font.render(horse.name, True, settings.WHITE)
            self.screen.blit(label, (hx - label.get_width() // 2, hy - 28))
            if horse.finished and horse.place:
                place = self.small_font.render(str(horse.place), True, settings.GOLD)
                self.screen.blit(place, (hx - 4, hy + 12))

        hint = (
            "Click or Enter for results"
            if self.race_finished
            else "Click or Enter to skip to finish"
        )
        self._draw_centered(
            self.small_font, hint, settings.WHITE, settings.SCREEN_HEIGHT - 18
        )

    def _draw_results(self) -> None:
        self.screen.fill(settings.DARK_GRAY)
        race_num = self.race_index + 1
        self._draw_centered(
            self.large_font,
            f"Official Results — Race {race_num}",
            settings.GOLD,
            36,
        )

        if self.race_result is None:
            self._draw_centered(
                self.medium_font, "No result yet.", settings.LIGHT_GRAY, 200
            )
            return

        # Finish order panel
        pygame.draw.rect(self.screen, settings.PANEL, (40, 80, 560, 480), border_radius=8)
        self.screen.blit(
            self.medium_font.render("Finishing order", True, settings.WHITE),
            (60, 96),
        )
        y = 140
        for horse in self.race_result.ordered_horses:
            row = pygame.Rect(60, y, 500, 42)
            bg = (90, 75, 30) if horse.place == 1 else (48, 48, 48)
            pygame.draw.rect(self.screen, bg, row, border_radius=6)
            pygame.draw.circle(self.screen, horse.color, (row.x + 22, row.centery), 12)
            place_color = settings.GOLD if horse.place == 1 else settings.WHITE
            p_win = self.win_probs.get(horse.id, 0.0)
            text = self.small_font.render(
                f"{horse.place}. {horse.name}    win {100.0 * p_win:.1f}%",
                True,
                place_color,
            )
            self.screen.blit(text, (row.x + 48, row.y + 12))
            y += 50

        # Payouts panel
        pygame.draw.rect(self.screen, settings.PANEL, (640, 80, 580, 400), border_radius=8)
        self.screen.blit(
            self.medium_font.render("Payouts", True, settings.WHITE),
            (660, 96),
        )
        winner = self.race_result.ordered_horses[0]
        self.screen.blit(
            self.small_font.render(f"Winner: {winner.name}", True, settings.GOLD),
            (660, 130),
        )

        sy = 170
        if self.pool_refunded:
            self.screen.blit(
                self.small_font.render(
                    "No winning tickets. All wagers returned.", True, settings.GRAY
                ),
                (660, sy),
            )
        elif not self.last_payouts:
            self.screen.blit(
                self.small_font.render("No payouts this race.", True, settings.GRAY),
                (660, sy),
            )
        else:
            for payout in self.last_payouts:
                who = format_player(payout.player_number, payout.person_name)
                line = f"{who}:  ${payout.amount:.2f}"
                self.screen.blit(
                    self.small_font.render(line, True, settings.GREEN), (660, sy)
                )
                sy += 26

        # Next button
        last_race = self.race_index + 1 >= settings.RACES_PER_SESSION
        self.btn_next.label = "View Card Summary" if last_race else "Next Race"
        self.btn_next.rect.topleft = (640, 520)
        self._draw_button(self.btn_next)
        self._draw_centered(
            self.small_font,
            "Click the button or press Enter",
            settings.GRAY,
            settings.SCREEN_HEIGHT - 28,
        )

    def _draw_summary(self) -> None:
        self.screen.fill((28, 32, 40))
        self._draw_centered(
            self.title_font, "Race Card Complete", settings.GOLD, 80
        )
        self._draw_centered(
            self.medium_font,
            f"All {settings.RACES_PER_SESSION} races are in the books",
            settings.LIGHT_GRAY,
            140,
        )

        pygame.draw.rect(
            self.screen, settings.PANEL, (340, 180, 600, 360), border_radius=8
        )
        self.screen.blit(
            self.medium_font.render("Session payouts", True, settings.WHITE),
            (370, 200),
        )

        y = 250
        if not self.session_payouts:
            self.screen.blit(
                self.small_font.render(
                    "No payouts this card.", True, settings.GRAY
                ),
                (370, y),
            )
        else:
            ranked = sorted(
                self.session_payouts.items(),
                key=lambda kv: kv[1][1],
                reverse=True,
            )
            for i, (number, (name, paid)) in enumerate(ranked, start=1):
                who = format_player(number, name)
                line = f"{i}. {who}    ${paid:.2f}"
                self.screen.blit(
                    self.small_font.render(line, True, settings.GREEN), (370, y)
                )
                y += 28

        self.btn_summary_menu.rect.center = (settings.SCREEN_WIDTH // 2, 600)
        self._draw_button(self.btn_summary_menu)

    def _draw_state_overlay(self) -> None:
        label = STATE_LABELS[self.state]
        state_text = self.small_font.render(f"State: {label}", True, settings.WHITE)
        self.screen.blit(state_text, (20, 8))
