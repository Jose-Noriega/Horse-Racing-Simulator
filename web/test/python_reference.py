"""Dump deterministic outputs of the pygame version's honest code to JSON.

Run from the repo root:  python3 web/test/python_reference.py > web/test/reference.json
test/port.test.js reads the JSON and checks the JS port gives the same numbers.
Random stuff (gauss, pace profiles) can't match across languages, so it isn't here.
"""

import json
import os
import sys

os.environ["PYGAME_HIDE_SUPPORT_PROMPT"] = "1"  # ui.py imports pygame, which prints a banner

sys.path.insert(0, ".")

import settings
from betting import BettingPool
from horse import make_horse
from horses_data import ROSTER, get_horse
from race import order_probability, pace_progress, win_probabilities
from race_card import get_race_field_ids
from ui import short_num

field = [make_horse(get_horse(i), settings.HORSE_COLORS[k]) for k, i in enumerate(get_race_field_ids(0))]
p_win = win_probabilities(field)
order_prob = lambda ids: order_probability(field, ids)

out = {
    "roster_speeds": [ROSTER[i].average_speed for i in range(settings.TOTAL_HORSES)],
    "p_win": {str(k): v for k, v in p_win.items()},
    "order_probs": {
        "0,1": order_probability(field, [0, 1]),
        "3,1,2": order_probability(field, [3, 1, 2]),
        "7,6,5": order_probability(field, [7, 6, 5]),
    },
}

speeds = [1.0, 0.7, 1.3, 0.9, 1.6, 0.5, 1.1, 1.0, 0.8, 1.4]
out["pace"] = {"speeds": speeds, "points": {str(u): pace_progress(speeds, u) for u in (0.0, 0.1, 0.33, 0.5, 0.77, 0.99, 1.0)}}

# A fixed betting scenario. Each step records what the UI would read.
pool = BettingPool()
steps = [
    (1, "Ann", [0], 10.0),
    (2, "Bo", [1], 5.0),
    (3, "Cy", [0, 1], 4.0),
    (1, "", [0], 2.5),  # merges into Ann's first bet
    (4, "Di", [2, 0, 1], 3.0),
]
for n, name, ids, amt in steps:
    pool.add_bet(n, name, ids, amt)
out["bets"] = [
    {"n": b.player_number, "name": b.person_name, "ids": list(b.horse_ids), "amount": b.amount} for b in pool.bets
]
out["total_pool"] = pool.total_pool
out["on_win"] = {str(h.id): pool.amount_on_win(h.id) for h in field}
out["win_mult"] = {str(h.id): pool.displayed_win_multiplier(h.id, p_win, 3.0) for h in field}
out["ticket_mult"] = {
    "0,1": pool.displayed_ticket_multiplier([0, 1], field, p_win),
    "5,4": pool.displayed_ticket_multiplier([5, 4], field, p_win),
    "2,0,1": pool.displayed_ticket_multiplier([2, 0, 1], field, p_win),
}


def settle(finish):
    paid = pool.settle(finish, p_win, order_prob)
    return {
        "settle": [amt for _, amt in paid],
        "hit": pool.any_ticket_hits(finish),
        "players": [[p.player_number, p.person_name, p.amount] for p in pool.payouts_by_player(finish, p_win, order_prob)],
    }


out["settle_win0"] = settle([0, 1, 2, 3, 4, 5, 6, 7])  # win + 2-leg parlay hit
out["settle_parlay3"] = settle([2, 0, 1, 3, 4, 5, 6, 7])  # 3-leg hits
out["settle_none"] = settle([7, 6, 5, 4, 3, 2, 1, 0])  # nobody hits: refund
pool.undo_last()  # drops Di's parlay
out["after_undo"] = [b.amount for b in pool.bets]
pool.undo_last()  # takes 2.5 back off Ann
out["after_undo2"] = [b.amount for b in pool.bets]

import track

out["track"] = {
    "start_progress": [track.start_progress(i) for i in range(settings.HORSES_PER_RACE)],
    "points": {
        f"{lane}@{p}": list(track.point_on_lane(lane, track.lane_progress(lane, p)))
        for lane in (0, 3, 7)
        for p in (0.0, 0.1, 0.3, 0.5, 0.62, 0.8, 0.95, 1.0)
    },
}

out["short_num"] = {str(x): short_num(x) for x in (0, 12.5, 9999.99, 10000, 12500, 999999, 1_200_000, 2e9, -3.456)}

json.dump(out, sys.stdout, indent=1)
