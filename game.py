"""Main game loop: menu, betting, animated race, results, and card summary."""

from __future__ import annotations

import math
import random
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
from track import draw_oval_track, lane_progress, point_on_lane
from crowd import build_crowd, detect_passes, draw_crowd
from sounds import Sounds
from sprites import draw_horse, draw_starter, footfall_count, stride_phase
from ui import Button, TextBox, short_num


class ScreenState(Enum):
    MENU = auto()
    BETTING = auto()
    SETUP = auto()
    RACE = auto()
    RESULTS = auto()
    SUMMARY = auto()


DNF_COLOR = (220, 90, 90)


class Game:
    """Owns the window, clock, race card progress, bets, and main loop."""

    def __init__(self, secret: bool = False) -> None:
        self.secret = secret  # --secret: last four horses blow up
        # SCALED keeps drawing at 1280x720 and stretches it to the window,
        # letterboxed. It also maps mouse positions back, so no other code cares.
        self.screen = pygame.display.set_mode(
            (settings.SCREEN_WIDTH, settings.SCREEN_HEIGHT),
            pygame.SCALED | pygame.RESIZABLE,
        )
        self.fullscreen = False
        pygame.display.set_caption(settings.TITLE)
        self.clock = pygame.time.Clock()
        self.running = True
        self.state = ScreenState.MENU

        self.race_index = 0
        self.field: list[Horse] = []
        self.pool = BettingPool()
        self.race_result: RaceResult | None = None
        self.session_payouts: dict[int, tuple[str, float]] = {}  # player # -> (name, paid)
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
        # Dust puffs: [x, y, vx, vy, age]
        self.dust: list[list[float]] = []
        # Secret mode explosions
        # Crowd + sound
        self.sounds = Sounds(settings.HORSES_PER_RACE)
        self.shot_time: float | None = None  # _time the starter fired
        self.last_step: dict[int, int] = {}  # horse id -> footfalls already sounded
        self.crowd: list[dict] = []
        self.cheer_until: dict[int, float] = {}  # horse id -> _time its fans stop cheering
        self.cheer_level: dict[int, float] = {}  # horse id -> 0..1, eases toward cheering or not
        self.pass_order: list[int] = []  # horse ids, leader first, for spotting overtakes
        self.last_beep: int | None = None
        self.sound_queue: list[tuple[float, str]] = []  # (_time due, sound name)
        self.finish_sounded: set[int] = set()
        self.last_tick = 0.0
        self.payout_dinged = False
        self.exploded: set[int] = set()  # horse ids that blew up this race
        self.boom_time: float | None = None  # _time of the first blast, for screen shake
        self.blasts: list[dict] = []  # expanding flash + ring
        self.sparks: list[dict] = []  # fire, smoke, debris
        # UI animation clock + screen fade
        self._time = 0.0
        self._drawn_state: ScreenState | None = None
        self._last_frame: pygame.Surface | None = None
        self._fade_from: pygame.Surface | None = None
        self._fade_start = 0.0
        self.countdown: float | None = None  # seconds left before the gun. None = not counting
        self._state_start = 0.0  # _time when the current screen first drew
        self.bet_seen: dict[int, float] = {}  # id(bet) -> _time first drawn
        self.finish_seen: dict[int, float] = {}  # horse id -> _time first drawn on board

        self.title_font = pygame.font.Font(None, settings.FONT_SIZE_TITLE)
        self.countdown_font = pygame.font.Font(None, 220)
        self.large_font = pygame.font.Font(None, settings.FONT_SIZE_LARGE)
        self.medium_font = pygame.font.Font(None, settings.FONT_SIZE_MEDIUM)
        self.small_font = pygame.font.Font(None, settings.FONT_SIZE_SMALL)

        # Shared UI controls (rects updated per screen draw/layout)
        self.btn_start_card = Button(pygame.Rect(0, 0, 260, 52), "Start Race Card")
        self.btn_place_bet = Button(pygame.Rect(520, 248, 150, 40), "Place Bet")
        self.btn_clear_picks = Button(pygame.Rect(680, 248, 150, 40), "Clear Picks")
        self.btn_undo_bet = Button(pygame.Rect(520, 316, 150, 36), "Undo Bet")
        self.btn_start_race = Button(pygame.Rect(680, 316, 150, 36), "Start Race")
        # Setup screen: second action actually starts the race
        cx = settings.SCREEN_WIDTH // 2
        self.btn_go = Button(pygame.Rect(cx + 10, settings.SCREEN_HEIGHT - 80, 180, 48), "Go!")
        self.btn_back = Button(pygame.Rect(cx - 210, settings.SCREEN_HEIGHT - 80, 200, 48), "Back to Bets")
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
            self._time += dt
            self._handle_events()
            self._update(dt)
            self._draw()

    def _handle_events(self) -> None:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
                continue

            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                if self._clicked_something(event.pos):
                    self.sounds.play("click")
                self._handle_click(event.pos)
                continue

            if event.type != pygame.KEYDOWN:
                continue

            if event.key == pygame.K_F9:
                self.sounds.toggle_mute()
                continue

            if event.key == pygame.K_F11 or (
                event.key == pygame.K_RETURN and event.mod & pygame.KMOD_ALT
            ):
                self._toggle_fullscreen()
                continue

            if event.key == pygame.K_ESCAPE:
                # first Esc leaves fullscreen, second one quits
                if self.fullscreen:
                    self._toggle_fullscreen()
                else:
                    self.running = False
                continue

            if self.state == ScreenState.MENU:
                self._handle_menu_key(event)
            elif self.state == ScreenState.BETTING:
                self._handle_betting_key(event)
            elif self.state == ScreenState.SETUP:
                self._handle_setup_key(event)
            elif self.state == ScreenState.RACE:
                self._handle_race_key(event)
            elif self.state == ScreenState.RESULTS:
                self._handle_results_key(event)
            elif self.state == ScreenState.SUMMARY:
                self._handle_summary_key(event)

    def _clicked_something(self, pos: tuple[int, int]) -> bool:
        """True if this click lands on a live button (or a horse row) on the current screen."""
        buttons = {
            ScreenState.MENU: [self.btn_start_card],
            ScreenState.BETTING: [
                self.btn_place_bet, self.btn_clear_picks, self.btn_undo_bet, self.btn_start_race,
            ],
            ScreenState.SETUP: [] if self.countdown is not None else [self.btn_go, self.btn_back],
            ScreenState.RESULTS: [self.btn_next],
            ScreenState.SUMMARY: [self.btn_summary_menu],
        }.get(self.state, [])
        if any(b.hit(pos) for b in buttons):
            return True
        return self.state == ScreenState.BETTING and any(r.collidepoint(pos) for r in self.lane_rects)

    def _toggle_fullscreen(self) -> None:
        pygame.display.toggle_fullscreen()
        self.fullscreen = not self.fullscreen

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
                self._open_setup()
                return
            return

        if self.state == ScreenState.SETUP:
            if self.countdown is not None:
                return
            if self.btn_go.hit(pos):
                self._go()
            elif self.btn_back.hit(pos):
                self.state = ScreenState.BETTING
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
            self.status_message = "Max 3 horses in a parlay."
            return
        self.selected_lanes.append(lane)

    def _handle_menu_key(self, event: pygame.event.Event) -> None:
        if event.key in (pygame.K_RETURN, pygame.K_SPACE):
            self._begin_card()

    def _handle_betting_key(self, event: pygame.event.Event) -> None:
        if event.key == pygame.K_F5:
            self._open_setup()
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

    def _handle_setup_key(self, event: pygame.event.Event) -> None:
        if self.countdown is not None:
            return
        if event.key in (pygame.K_RETURN, pygame.K_SPACE):
            self._go()
        elif event.key == pygame.K_BACKSPACE:
            self.state = ScreenState.BETTING

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
            self.status_message = "Pick a horse first."
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
        label = " > ".join(names)
        kind = "Parlay" if bet.is_parlay else "Win"
        who = format_player(bet.player_number, bet.person_name)
        self.status_message = f"{kind} {who}: {label}  ${short_num(bet.amount)} total"
        self.selected_lanes = []
        self.sounds.play("coin")

    def _undo_bet(self) -> None:
        if self.pool.undo_last():
            self.status_message = "Bet undone."
        else:
            self.status_message = "Nothing to undo."

    def _open_setup(self) -> None:
        """First action: line horses up at the gate. Nothing moves yet."""
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
            x, y, heading = point_on_lane(i, lane_progress(i, 0.0))
            horse.x, horse.y, horse.heading = x, y, heading

        self.race_elapsed = 0.0
        self.race_finished = False
        self.race_hold_timer = 0.0
        self.settlements_applied = False
        self.dust.clear()
        self.finish_seen.clear()
        self.exploded.clear()
        self.blasts.clear()
        self.sparks.clear()
        self.boom_time = None
        self.countdown = None
        self.crowd = build_crowd(
            [h.id for h in self.field], [h.color for h in self.field], random.Random()
        )
        self.cheer_until.clear()
        self.cheer_level.clear()
        self.pass_order = [h.id for h in self.field]
        self.sound_queue.clear()
        self.finish_sounded.clear()
        self.last_step.clear()
        self.shot_time = None
        self.payout_dinged = False
        self.state = ScreenState.SETUP
        self.status_message = ""

    COUNTDOWN_SECONDS = 3.0

    def _go(self) -> None:
        """Second action: 3, 2, 1, then the race runs."""
        if self.countdown is None:
            self.countdown = self.COUNTDOWN_SECONDS
            self.last_beep = None

    def _visual_finish_time(self, horse: Horse) -> float:
        return horse.finish_time * self.race_time_scale

    def _snap_race_to_finish(self) -> None:
        if self.secret and not self.exploded:
            self._explode([h for h in self.field if not h.finished and (h.place or 0) > 4])
        for horse in self.field:
            if horse.id in self.exploded:
                continue
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

    DUST_LIFE = 0.6

    # --- crowd + sound ---

    def _cheer(self, horse_id: int, seconds: float) -> None:
        self.cheer_until[horse_id] = max(self.cheer_until.get(horse_id, 0.0), self._time + seconds)

    def _update_crowd(self, dt: float) -> None:
        for hid, until in self.cheer_until.items():
            target = 1.0 if until > self._time and hid not in self.exploded else 0.0
            level = self.cheer_level.get(hid, 0.0)
            self.cheer_level[hid] = level + (target - level) * min(1.0, dt * 12)

    def _update_sounds(self) -> None:
        due = [s for s in self.sound_queue if s[0] <= self._time]
        self.sound_queue = [s for s in self.sound_queue if s[0] > self._time]
        for _, name in due:
            self.sounds.play(name)

        # payout numbers count up with a tick, then a ding
        if self.state == ScreenState.RESULTS and self.last_payouts and not self.pool_refunded:
            age = self._time - self._state_start
            end = 0.5 + 1.2 + 0.3 * (len(self.last_payouts) - 1)
            if 0.5 < age < end and self._time - self.last_tick > 0.07:
                self.last_tick = self._time
                self.sounds.play("tick")
            elif age >= end and not self.payout_dinged:
                self.payout_dinged = True
                self.sounds.play("ding", 0.7)

    def _race_started(self) -> None:
        self.shot_time = self._time
        self.sounds.play("gunshot")
        for h in self.field:
            self._cheer(h.id, 1.3)

    def _play_footsteps(self) -> None:
        """One thud per hoof per horse, on the frame the drawn foot lands."""
        # Per-hoof level shrinks with the field so the sum stays steady, and the
        # whole gallop swells toward the line (broadcast mixers build it the same way).
        lead = max(h.progress for h in self.field)
        swell = settings.MIX["steps_swell"]
        volume = settings.MIX["steps"] / math.sqrt(len(self.field)) * (1 - swell / 2 + swell * lead)
        for horse in self.field:
            if horse.finished or horse.progress <= 0:
                continue
            steps = footfall_count(horse.progress)
            if steps > self.last_step.get(horse.id, 0):
                self.last_step[horse.id] = steps
                pan = (horse.x - settings.SCREEN_WIDTH / 2) / (settings.SCREEN_WIDTH / 2)
                self.sounds.play_step(horse.lane_index, volume, pan)

    def _check_passes(self) -> None:
        """A horse passing another sends its fans up."""
        progress = {h.id: h.progress for h in self.field}
        self.pass_order, passes = detect_passes(self.pass_order, progress)
        for passer, passed in passes:
            if passed in self.exploded or progress[passer] < 0.03:
                continue
            self._cheer(passer, 1.4)

    def _check_finishes(self) -> None:
        for horse in self.field:
            if not horse.finished or horse.id in self.finish_sounded:
                continue
            self.finish_sounded.add(horse.id)
            if horse.place == 1:
                self.sounds.play("fanfare")
                self._cheer(horse.id, 3.5)
            else:
                self.sounds.play("ding", 0.7)

    STARTER_POS = (380, 470)  # in the infield, just left of the start line

    def _draw_starter(self) -> None:
        age = None if self.shot_time is None else self._time - self.shot_time
        if age is not None:
            # gun stays up a moment after the shot, then comes down
            raise_ = 1.0 - min(1.0, max(0.0, (age - 1.8) / 0.5))
        elif self.countdown is not None:
            # raise it during the last ~1.5 seconds of the count
            raise_ = self._ease_out((1.6 - self.countdown) / 0.6)
        else:
            raise_ = 0.0
        draw_starter(self.screen, *self.STARTER_POS, raise_, age)

    def _draw_crowd(self) -> None:
        draw_crowd(self.screen, self.crowd, self.cheer_level, self._time)

    def _explode(self, horses: list[Horse]) -> None:
        """Blow these horses up. They stop running and stay out of the finish board."""
        if self.boom_time is None:
            self.boom_time = self._time
        for k, horse in enumerate(horses):
            self.sound_queue.append((self._time + 0.12 * k, "boom"))
            self.exploded.add(horse.id)
            horse.finished = True
            self.blasts.append(
                {"x": horse.x, "y": horse.y, "age": -0.12 * k}  # tiny stagger, negative age = waiting
            )
            for _ in range(26):  # fire
                ang = random.uniform(0, math.tau)
                spd = random.uniform(60, 280)
                self.sparks.append({
                    "kind": "fire", "x": horse.x, "y": horse.y - 6,
                    "vx": math.cos(ang) * spd, "vy": math.sin(ang) * spd,
                    "age": -0.12 * k, "life": random.uniform(0.45, 0.9),
                    "r": random.uniform(4, 9), "color": horse.color,
                })
            for _ in range(10):  # smoke
                ang = random.uniform(0, math.tau)
                spd = random.uniform(10, 70)
                self.sparks.append({
                    "kind": "smoke", "x": horse.x, "y": horse.y - 6,
                    "vx": math.cos(ang) * spd, "vy": math.sin(ang) * spd - 30,
                    "age": -0.12 * k, "life": random.uniform(1.0, 1.8),
                    "r": random.uniform(8, 14), "color": horse.color,
                })
            for _ in range(10):  # debris in the horse's own color
                ang = random.uniform(math.pi, math.tau)  # mostly up
                spd = random.uniform(120, 320)
                self.sparks.append({
                    "kind": "debris", "x": horse.x, "y": horse.y - 6,
                    "vx": math.cos(ang) * spd, "vy": math.sin(ang) * spd,
                    "age": -0.12 * k, "life": random.uniform(0.7, 1.2),
                    "r": random.uniform(2, 4), "color": horse.color,
                })

    def _update_boom(self, dt: float) -> None:
        for b in self.blasts:
            b["age"] += dt
        self.blasts = [b for b in self.blasts if b["age"] < 0.6]
        for p in self.sparks:
            p["age"] += dt
            if p["age"] <= 0:
                continue  # still waiting on its stagger
            p["x"] += p["vx"] * dt
            p["y"] += p["vy"] * dt
            p["vx"] *= 0.97
            if p["kind"] == "debris":
                p["vy"] += 500 * dt  # gravity
            elif p["kind"] == "smoke":
                p["vy"] -= 20 * dt  # drifts up
            else:
                p["vy"] *= 0.97
        self.sparks = [p for p in self.sparks if p["age"] < p["life"]]

    def _draw_boom(self) -> None:
        for b in self.blasts:
            if b["age"] <= 0:
                continue
            t = b["age"] / 0.6
            # white flash, quick
            if t < 0.35:
                r = int(14 + 70 * t / 0.35)
                flash = pygame.Surface((r * 2, r * 2), pygame.SRCALPHA)
                pygame.draw.circle(flash, (255, 245, 200, int(230 * (1 - t / 0.35))), (r, r), r)
                self.screen.blit(flash, (int(b["x"]) - r, int(b["y"]) - 6 - r))
            # shockwave ring
            rr = int(10 + 120 * (1 - (1 - t) ** 2))
            ring = pygame.Surface((rr * 2 + 8, rr * 2 + 8), pygame.SRCALPHA)
            pygame.draw.circle(ring, (255, 255, 255, int(160 * (1 - t))), (rr + 4, rr + 4), rr, 3)
            self.screen.blit(ring, (int(b["x"]) - rr - 4, int(b["y"]) - 6 - rr - 4))

        # smoke under fire under debris
        for kind in ("smoke", "fire", "debris"):
            for p in self.sparks:
                if p["kind"] != kind or p["age"] <= 0:
                    continue
                f = p["age"] / p["life"]
                x, y = int(p["x"]), int(p["y"])
                if kind == "smoke":
                    r = int(p["r"] * (1 + 1.5 * f))
                    puff = pygame.Surface((r * 2, r * 2), pygame.SRCALPHA)
                    pygame.draw.circle(puff, (60, 60, 60, int(150 * (1 - f))), (r, r), r)
                    self.screen.blit(puff, (x - r, y - r))
                elif kind == "fire":
                    # yellow -> orange -> red -> dark
                    stops = ((255, 240, 120), (255, 150, 30), (200, 50, 20), (50, 40, 40))
                    pos = f * (len(stops) - 1)
                    i = min(len(stops) - 2, int(pos))
                    c = tuple(int(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * (pos - i)) for k in range(3))
                    pygame.draw.circle(self.screen, c, (x, y), max(1, int(p["r"] * (1 - 0.7 * f))))
                else:
                    pygame.draw.rect(self.screen, p["color"], (x - 2, y - 2, int(p["r"]) + 1, int(p["r"]) + 1))

    def _shake_screen(self) -> None:
        """Rattle the whole frame for a moment after the first blast."""
        if self.boom_time is None:
            return
        t = (self._time - self.boom_time) / 0.7
        if t >= 1.0:
            return
        amp = 8 * (1 - t)
        dx, dy = int(random.uniform(-amp, amp)), int(random.uniform(-amp, amp))
        frame = self.screen.copy()
        self.screen.fill((0, 0, 0))
        self.screen.blit(frame, (dx, dy))

    def _update_dust(self, dt: float) -> None:
        for p in self.dust:
            p[0] += p[2] * dt
            p[1] += p[3] * dt
            p[4] += dt
        self.dust = [p for p in self.dust if p[4] < self.DUST_LIFE]
        for horse in self.field:
            if horse.finished or horse.progress <= 0 or random.random() > dt * 30:
                continue
            # kick up from the back hooves, drift backward + up
            back = -1 if math.cos(horse.heading) >= 0 else 1
            self.dust.append([
                horse.x + back * 12, horse.y + 10,
                back * random.uniform(10, 30), random.uniform(-25, -5), 0.0,
            ])

    def _update(self, dt: float) -> None:
        self._update_crowd(dt)
        self._update_sounds()
        if self.state == ScreenState.SETUP and self.countdown is not None:
            self.countdown -= dt
            n = math.ceil(self.countdown)
            if n > 0 and n != self.last_beep:
                self.last_beep = n
                self.sounds.play("beep")
            if self.countdown <= 0:
                self.countdown = None
                self.state = ScreenState.RACE
                self._race_started()
            return
        if self.state != ScreenState.RACE:
            return
        self._update_dust(dt)
        self._update_boom(dt)

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
                x, y, heading = point_on_lane(
                    horse.lane_index, lane_progress(horse.lane_index, horse.progress)
                )
                horse.x, horse.y, horse.heading = x, y, heading
            self._check_passes()
            self._play_footsteps()
            self._check_finishes()
            if self.secret and not self.exploded:
                crossed = sum(1 for h in self.field if h.finished)
                if crossed >= 4 and crossed < len(self.field):
                    self._explode([h for h in self.field if not h.finished])
                    all_done = True
            if all_done:
                self.race_finished = True
                self.race_hold_timer = 0.0
        else:
            self.race_hold_timer += dt
            # leave time for the blasts to play out
            if self.race_hold_timer >= (2.8 if self.exploded else 1.5):
                self._go_to_results()

    def _draw(self) -> None:
        if self.state != self._drawn_state:
            self._state_start = self._time
            if self._drawn_state is not None:
                self._fade_from = self._last_frame
                self._fade_start = self._time
            self._drawn_state = self.state

        if self.state == ScreenState.MENU:
            self._draw_menu()
        elif self.state == ScreenState.BETTING:
            self._draw_betting()
        elif self.state == ScreenState.SETUP:
            self._draw_setup()
        elif self.state == ScreenState.RACE:
            self._draw_race()
        elif self.state == ScreenState.RESULTS:
            self._draw_results()
        elif self.state == ScreenState.SUMMARY:
            self._draw_summary()

        self._draw_fade()
        pygame.display.flip()

    FADE_SECONDS = 0.3

    @staticmethod
    def _ease_out(t: float) -> float:
        """0..1 in, 0..1 out. Fast start, soft stop."""
        t = min(1.0, max(0.0, t))
        return 1 - (1 - t) ** 3

    def _draw_fade(self) -> None:
        """Cross-fade from the last frame of the previous screen."""
        if self._fade_from is not None:
            t = (self._time - self._fade_start) / self.FADE_SECONDS
            if t >= 1.0:
                self._fade_from = None
            else:
                self._fade_from.set_alpha(int(255 * (1 - t)))
                self.screen.blit(self._fade_from, (0, 0))
        # copy AFTER the fade so a fast second switch fades from what was on screen
        self._last_frame = self.screen.copy()

    def _draw_centered(
        self, font: pygame.font.Font, text: str, color, y: int
    ) -> None:
        surface = font.render(text, True, color)
        rect = surface.get_rect(center=(settings.SCREEN_WIDTH // 2, y))
        self.screen.blit(surface, rect)

    def _draw_button(self, button: Button, pulse: bool = False) -> None:
        over = button.enabled and button.rect.collidepoint(pygame.mouse.get_pos())
        button.draw(
            self.screen,
            self.medium_font,
            bg=(62, 66, 76),
            fg=settings.WHITE,
            border=settings.GOLD,
            hover=over,
            pressed=over and pygame.mouse.get_pressed()[0],
            glow=(0.5 + 0.5 * math.sin(self._time * 4)) if pulse else 0.0,
        )

    def _draw_menu(self) -> None:
        # Soft track-like backdrop
        self.screen.fill((28, 36, 28))
        for i in range(settings.HORSES_PER_RACE):
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
            self.small_font,
            f"{settings.RACES_PER_SESSION} races, {settings.HORSES_PER_RACE} horses each",
            settings.LIGHT_GRAY,
            270,
        )

        self.btn_start_card.rect.center = (
            settings.SCREEN_WIDTH // 2,
            400,
        )
        self._draw_button(self.btn_start_card)

    def _draw_betting(self) -> None:
        self.screen.fill(settings.DARK_GRAY)
        race_num = self.race_index + 1
        self._draw_centered(
            self.large_font,
            f"Race {race_num} of {settings.RACES_PER_SESSION}",
            settings.GOLD,
            36,
        )

        # Field panel
        pygame.draw.rect(self.screen, settings.PANEL, (24, 70, 460, 520), border_radius=8)
        header = self.medium_font.render("Pick finish order", True, settings.WHITE)
        self.screen.blit(header, (40, 84))
        hint = self.small_font.render("1 horse = win, 2-3 = parlay", True, settings.GRAY)
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
            slip = "Parlay: " + " > ".join(pick_names)
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
            self.medium_font.render("Bets", True, settings.WHITE),
            (520, 392),
        )
        bet_y = 418
        if not self.pool.bets:
            self.screen.blit(
                self.small_font.render("(none yet)", True, settings.GRAY),
                (520, bet_y),
            )
        else:
            live = {id(b) for b in self.pool.bets}
            self.bet_seen = {k: v for k, v in self.bet_seen.items() if k in live}
            for bet in self.pool.bets[-8:]:
                horse_names = []
                for hid in bet.horse_ids:
                    horse_names.append(
                        next((h.name for h in self.field if h.id == hid), "?")
                    )
                arrow = " > ".join(horse_names)
                who = format_player(bet.player_number, bet.person_name)
                kind = "P" if bet.is_parlay else "W"
                line = f"{kind} {who} {arrow}  ${short_num(bet.amount)}"
                a = self._ease_out((self._time - self.bet_seen.setdefault(id(bet), self._time)) / 0.3)
                row = self.small_font.render(line, True, settings.LIGHT_GRAY)
                row.set_alpha(int(255 * a))
                self.screen.blit(row, (520 + int((1 - a) * 60), bet_y))
                bet_y += 20

        # Payout panel
        pygame.draw.rect(self.screen, settings.PANEL, (880, 70, 370, 520), border_radius=8)
        self.screen.blit(
            self.medium_font.render("Odds", True, settings.WHITE),
            (900, 84),
        )
        self.screen.blit(
            self.small_font.render(
                f"Total pool: ${short_num(self.pool.total_pool)}", True, settings.GOLD
            ),
            (900, 118),
        )
        self.screen.blit(
            self.small_font.render(
                "If this horse wins", True, settings.GRAY
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
                    example_str = f"  (${short_num(example_wager, 0)}->${short_num(example_wager * odds)})"
                else:
                    example_str = ""
            pygame.draw.circle(self.screen, horse.color, (912, pay_y + 8), 8)
            line = f"{horse.name[:12]:12s} {mult_str}{example_str}"
            self.screen.blit(
                self.small_font.render(line, True, settings.LIGHT_GRAY),
                (928, pay_y),
            )
            extra = f"on 1st: ${short_num(on_h, 0)}" if on_h > 0 else ""
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
        self._draw_crowd()
        self._draw_starter()
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

        self._draw_horses()
        self._draw_boom()
        self._draw_finish_board()
        go_age = self._time - self._state_start
        if go_age < 0.6:
            self._draw_pop("GO!", go_age / 0.6)

        hint = (
            "Click for results"
            if self.race_finished
            else "Click to skip"
        )
        self._draw_centered(
            self.small_font, hint, settings.WHITE, settings.SCREEN_HEIGHT - 9
        )
        self._shake_screen()

    def _draw_horses(self) -> None:
        # Dust goes under the horses. No alpha: color fades into the dirt,
        # which only works because horses only run on dirt.
        for x, y, _, _, age in self.dust:
            f = age / self.DUST_LIFE
            color = tuple(
                int(a + (b - a) * f)
                for a, b in zip((225, 200, 160), settings.DIRT)
            )
            pygame.draw.circle(self.screen, color, (int(x), int(y)), int(2 + 4 * f))

        # Draw backstretch horses first so homestretch reads on top
        def draw_depth(h: Horse) -> float:
            return h.y

        for horse in sorted(self.field, key=draw_depth):
            if horse.id in self.exploded:
                continue
            hx, hy = int(horse.x), int(horse.y)
            running = self.state == ScreenState.RACE and not horse.finished
            draw_horse(
                self.screen, hx, hy, horse.heading, horse.color,
                stride_phase(horse.progress), running,
            )

            label = self.small_font.render(horse.name, True, settings.WHITE)
            dy = 0
            if self.state == ScreenState.SETUP:
                # one lane after another, sliding down into place
                a = self._ease_out((self._time - self._state_start - 0.2 - horse.lane_index * 0.08) / 0.35)
                label.set_alpha(int(255 * a))
                dy = int((1 - a) * -14)
            self.screen.blit(label, (hx - label.get_width() // 2, hy - 34 + dy))
            if horse.finished and horse.place:
                place = self.small_font.render(str(horse.place), True, settings.GOLD)
                self.screen.blit(place, (hx - 4, hy + 16))

    def _draw_finish_board(self) -> None:
        """Horses show up here as they cross the line. Sits in the infield."""
        # place was set up front, and finish time follows place, so this is crossing order
        done = sorted(
            (h for h in self.field if h.finished and h.id not in self.exploded),
            key=lambda h: h.place or 99,
        )
        if not done:
            return
        dnf = sorted((h for h in self.field if h.id in self.exploded), key=lambda h: h.place or 99)
        row_h = 22
        panel = pygame.Rect(0, 0, 260, 30 + row_h * len(self.field))
        panel.center = (settings.TRACK_CENTER_X, settings.TRACK_CENTER_Y)
        pygame.draw.rect(self.screen, settings.PANEL, panel, border_radius=8)
        pygame.draw.rect(self.screen, settings.GOLD, panel, width=2, border_radius=8)
        head = self.small_font.render("Finish", True, settings.GOLD)
        self.screen.blit(head, (panel.x + 12, panel.y + 6))
        for i, horse in enumerate(done + dnf):
            is_dnf = horse.id in self.exploded
            y = panel.y + 30 + i * row_h
            age = self._time - self.finish_seen.setdefault(horse.id, self._time)
            t = min(1.0, age / 0.4)
            ease = 1 - (1 - t) ** 3  # fast start, soft stop
            dx = int((1 - ease) * 80)
            if i == 0 and not is_dnf:
                # winner row: gold bar that fades from bright to a soft glow
                glow = pygame.Surface((panel.width - 16, row_h), pygame.SRCALPHA)
                glow.fill((*settings.GOLD, int(110 - 60 * ease)))
                self.screen.blit(glow, (panel.x + 8 + dx, y - 2))
            pygame.draw.circle(self.screen, horse.color, (panel.x + 18 + dx, y + 8), 6)
            label = f"DNF  {horse.name}" if is_dnf else f"{i + 1}. {horse.name}"
            text = self.small_font.render(label, True, DNF_COLOR if is_dnf else settings.WHITE)
            text.set_alpha(int(255 * ease))
            self.screen.blit(text, (panel.x + 32 + dx, y))
            if is_dnf:
                continue
            secs = self.small_font.render(
                f"{self._visual_finish_time(horse):.1f}s", True, settings.LIGHT_GRAY
            )
            secs.set_alpha(int(255 * ease))
            self.screen.blit(secs, (panel.right - secs.get_width() - 12 + dx, y))

    def _draw_setup(self) -> None:
        draw_oval_track(self.screen)
        self._draw_crowd()
        self._draw_starter()
        title = self.large_font.render(
            f"Race {self.race_index + 1} of {settings.RACES_PER_SESSION}",
            True,
            settings.GOLD,
        )
        self.screen.blit(title, (24, 12))
        self._draw_horses()
        if self.countdown is None:
            self._draw_button(self.btn_back)
            self._draw_button(self.btn_go, pulse=True)
        else:
            self._draw_countdown()

    def _draw_countdown(self) -> None:
        """Big 3, 2, 1. Each number pops in large and shrinks + fades over its second."""
        n = math.ceil(self.countdown)
        frac = n - self.countdown  # 0 at the start of this number, 1 at the end
        self._draw_pop(str(n), frac)

    def _draw_pop(self, text: str, frac: float) -> None:
        surf = self.countdown_font.render(text, True, settings.GOLD)
        scale = 1.0 + 0.8 * (1 - self._ease_out(frac * 3))  # settles in the first third
        surf = pygame.transform.rotozoom(surf, 0, scale)
        surf.set_alpha(int(255 * (1 - max(0.0, frac - 0.6) / 0.4)))
        rect = surf.get_rect(center=(settings.TRACK_CENTER_X, settings.TRACK_CENTER_Y))
        self.screen.blit(surf, rect)

    def _draw_results(self) -> None:
        self.screen.fill(settings.DARK_GRAY)
        race_num = self.race_index + 1
        self._draw_centered(
            self.large_font,
            f"Race {race_num} results",
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
            self.medium_font.render("Order", True, settings.WHITE),
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
            if horse.id in self.exploded:
                line, place_color = f"DNF  {horse.name}    win {100.0 * p_win:.1f}%", DNF_COLOR
            else:
                line = f"{horse.place}. {horse.name}    win {100.0 * p_win:.1f}%"
            text = self.small_font.render(line, True, place_color)
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
                    "No winners. Wagers returned.", True, settings.GRAY
                ),
                (660, sy),
            )
        elif not self.last_payouts:
            self.screen.blit(
                self.small_font.render("No payouts.", True, settings.GRAY),
                (660, sy),
            )
        else:
            age = self._time - self._state_start
            for n, payout in enumerate(self.last_payouts):
                who = format_player(payout.player_number, payout.person_name)
                # count up from $0, one payout after another
                shown = payout.amount * self._ease_out((age - 0.5 - n * 0.3) / 1.2)
                line = f"{who}:  ${short_num(shown)}"
                self.screen.blit(
                    self.small_font.render(line, True, settings.GREEN), (660, sy)
                )
                sy += 26

        # Next button
        last_race = self.race_index + 1 >= settings.RACES_PER_SESSION
        self.btn_next.label = "View Card Summary" if last_race else "Next Race"
        self.btn_next.rect.topleft = (640, 520)
        self._draw_button(self.btn_next)

    def _draw_summary(self) -> None:
        self.screen.fill((28, 32, 40))
        self._draw_centered(
            self.title_font, "Card complete", settings.GOLD, 80
        )

        pygame.draw.rect(
            self.screen, settings.PANEL, (340, 180, 600, 360), border_radius=8
        )
        self.screen.blit(
            self.medium_font.render("Payouts", True, settings.WHITE),
            (370, 200),
        )

        y = 250
        if not self.session_payouts:
            self.screen.blit(
                self.small_font.render(
                    "No payouts.", True, settings.GRAY
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
                line = f"{i}. {who}    ${short_num(paid)}"
                self.screen.blit(
                    self.small_font.render(line, True, settings.GREEN), (370, y)
                )
                y += 28

        self.btn_summary_menu.rect.center = (settings.SCREEN_WIDTH // 2, 600)
        self._draw_button(self.btn_summary_menu)
