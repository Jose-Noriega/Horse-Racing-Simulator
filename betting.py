"""Betting pool: player numbers, combined wagers, win bets, and parlays.

All money in a race is paid back out (zero house take). Winning tickets
share the full pool in proportion to probability-weighted claims, so
parlays (harder exact-order outcomes) pay more per dollar than win bets.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from horse import Horse
from race import order_probability


OrderProbFn = Callable[[list[int]], float]


@dataclass
class Bet:
    player_number: int
    person_name: str
    horse_ids: tuple[int, ...]
    amount: float

    @property
    def is_parlay(self) -> bool:
        return len(self.horse_ids) > 1


@dataclass
class PlayerPayout:
    player_number: int
    person_name: str
    amount: float


@dataclass
class BettingPool:
    """Tracks wagers for the current race and exposes live payout info."""

    bets: list[Bet] = field(default_factory=list)
    player_names: dict[int, str] = field(default_factory=dict)

    def clear(self) -> None:
        self.bets.clear()
        # Keep player_names across races so # + name stay linked.

    def remember_player(self, player_number: int, person_name: str) -> str:
        name = person_name.strip()
        if name:
            self.player_names[player_number] = name
        return self.player_names.get(player_number, "")

    def add_bet(
        self,
        player_number: int,
        person_name: str,
        horse_ids: list[int] | tuple[int, ...],
        amount: float,
    ) -> Bet:
        if player_number < 1:
            raise ValueError("Player number must be 1 or greater")
        if amount <= 0:
            raise ValueError("Wager must be positive")
        ids = tuple(horse_ids)
        if not ids or len(ids) > 3:
            raise ValueError("Pick 1 horse to win, or 2–3 horses in finish order")
        if len(set(ids)) != len(ids):
            raise ValueError("Parlay legs must be different horses")

        name = self.remember_player(player_number, person_name)

        for existing in self.bets:
            if existing.player_number == player_number and existing.horse_ids == ids:
                existing.amount += amount
                if name:
                    existing.person_name = name
                return existing

        bet = Bet(
            player_number=player_number,
            person_name=name,
            horse_ids=ids,
            amount=amount,
        )
        self.bets.append(bet)
        return bet

    @property
    def total_pool(self) -> float:
        return sum(b.amount for b in self.bets)

    def amount_on_win(self, horse_id: int) -> float:
        """Stake that needs this horse to finish first (win bets + first parlay leg)."""
        return sum(b.amount for b in self.bets if b.horse_ids and b.horse_ids[0] == horse_id)

    def _parlay_bonus(self, n_legs: int) -> float:
        if n_legs == 2:
            return 1.25
        if n_legs == 3:
            return 1.5
        return 1.0

    def claim_weight(
        self, bet: Bet, p_win: dict[int, float], order_prob: OrderProbFn
    ) -> float:
        """How large a share of the pool this ticket deserves if it hits."""
        if len(bet.horse_ids) == 1:
            p = p_win.get(bet.horse_ids[0], 0.0)
            return bet.amount / max(p, 1e-9)
        p = order_prob(list(bet.horse_ids))
        return bet.amount * self._parlay_bonus(len(bet.horse_ids)) / max(p, 1e-9)

    def _hits(self, bet: Bet, finish_ids: list[int]) -> bool:
        if len(finish_ids) < len(bet.horse_ids):
            return False
        return finish_ids[: len(bet.horse_ids)] == list(bet.horse_ids)

    def settle(
        self,
        finish_ids: list[int],
        p_win: dict[int, float],
        order_prob: OrderProbFn,
    ) -> list[tuple[Bet, float]]:
        """
        Pay the entire pool to hitting tickets, proportional to claim weights.
        If nobody hits, refund every bettor their stake (money in = money out).
        """
        pool = self.total_pool
        if pool <= 0:
            return []

        hitting = [b for b in self.bets if self._hits(b, finish_ids)]
        if not hitting:
            return [(b, b.amount) for b in self.bets]

        weights = {id(b): self.claim_weight(b, p_win, order_prob) for b in hitting}
        total_w = sum(weights.values())
        settled: list[tuple[Bet, float]] = []
        for bet in self.bets:
            if bet in hitting and total_w > 0:
                payout = pool * (weights[id(bet)] / total_w)
            else:
                payout = 0.0
            settled.append((bet, payout))
        return settled

    def any_ticket_hits(self, finish_ids: list[int]) -> bool:
        return any(self._hits(b, finish_ids) for b in self.bets)

    def payouts_by_player(
        self,
        finish_ids: list[int],
        p_win: dict[int, float],
        order_prob: OrderProbFn,
    ) -> list[PlayerPayout]:
        """Player totals for hitting tickets only (no loss lines)."""
        if not self.any_ticket_hits(finish_ids):
            return []
        grouped: dict[int, PlayerPayout] = {}
        for bet, payout in self.settle(finish_ids, p_win, order_prob):
            if payout <= 0.005:
                continue
            if bet.player_number not in grouped:
                grouped[bet.player_number] = PlayerPayout(
                    player_number=bet.player_number,
                    person_name=bet.person_name,
                    amount=0.0,
                )
            grouped[bet.player_number].amount += payout
            if bet.person_name:
                grouped[bet.player_number].person_name = bet.person_name
        return sorted(grouped.values(), key=lambda p: (-p.amount, p.player_number))

    def displayed_win_multiplier(self, horse_id: int) -> float | None:
        """
        Live win-bet multiplier. Parlay stakes whose first leg is this horse
        count toward it, so parlays move the posted horse price.
        """
        on_horse = self.amount_on_win(horse_id)
        if on_horse <= 0 or self.total_pool <= 0:
            return None
        return self.total_pool / on_horse

    def displayed_ticket_multiplier(
        self,
        horse_ids: list[int],
        horses: list[Horse],
        p_win: dict[int, float],
    ) -> float | None:
        """
        Estimated multiplier for the ticket being built.
        Win tickets use the live pool price; parlays use order probability
        times a bonus, then scale into the current pool.
        """
        if not horse_ids or self.total_pool <= 0:
            return None
        ids = list(horse_ids)
        if len(ids) == 1:
            return self.displayed_win_multiplier(ids[0])

        p_order = order_probability(horses, ids)
        fair = self._parlay_bonus(len(ids)) / max(p_order, 1e-9)
        # If this exact order hits, win bets on the first horse also cash.
        first = ids[0]
        win_money = sum(
            b.amount for b in self.bets if b.horse_ids == (first,)
        )
        parlay_money = sum(
            b.amount for b in self.bets if list(b.horse_ids) == ids
        )
        first_p = max(p_win.get(first, 0.0), 1e-9)
        win_claims = (win_money / first_p) if win_money else 0.0
        parlay_claims = parlay_money * fair
        # A new $1 on this parlay would add `fair` claims.
        total_claims = win_claims + parlay_claims + fair
        if total_claims <= 0:
            return None
        return (self.total_pool + 1.0) * (fair / total_claims)


def format_player(player_number: int, person_name: str) -> str:
    name = person_name.strip()
    if name:
        return f"#{player_number} {name}"
    return f"#{player_number}"
