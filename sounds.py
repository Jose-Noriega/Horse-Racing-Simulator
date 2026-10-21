"""Sound effects.

Hoof hits are real recordings (Kenney Impact Sounds, CC0, in assets/sounds).
Everything else is synthesized: beeps, gunshot, boom.

Two halves. The synth + effects functions are honest: numbers in, a list of
floats out. Sounds is the dishonest edge: it owns the mixer and does nothing
if there's no audio device, so the game still runs on a silent machine.

Mix rules, from reading how games do it:
  - every sound is normalized, then set by one number in settings.MIX
  - reverb is short and gentle, not a long tail on every hit
  - the gun ducks the hooves, then they swell back in
  - hooves vary hit to hit (5 recordings, random jitter) so they don't machine-gun
  - a soft limiter instead of hard clipping
"""

from __future__ import annotations

import math
import os
import random
import time
from array import array

import pygame

import settings

RATE = 22050  # we work at half the mixer rate and double each sample on the way out
ASSETS = os.path.join(os.path.dirname(__file__), "assets", "sounds")


# --- synth (honest) ---------------------------------------------------------


def _n(dur: float) -> int:
    return int(dur * RATE)


def tone(freq: float, dur: float, vol: float = 0.5, decay: float = 6.0) -> list[float]:
    return [
        vol * math.sin(math.tau * freq * i / RATE) * math.exp(-decay * i / RATE)
        for i in range(_n(dur))
    ]


def noise(dur: float, lp: float, rng: random.Random) -> list[float]:
    """White noise through a one-pole low-pass. Smaller lp = darker."""
    out, y = [], 0.0
    for _ in range(_n(dur)):
        y += lp * (rng.uniform(-1, 1) - y)
        out.append(y)
    return out


def mix(*parts: list[float]) -> list[float]:
    out = [0.0] * max(len(p) for p in parts)
    for p in parts:
        for i, v in enumerate(p):
            out[i] += v
    return out


def concat(*parts: list[float]) -> list[float]:
    out: list[float] = []
    for p in parts:
        out.extend(p)
    return out


def peak(x: list[float]) -> float:
    return max((abs(v) for v in x), default=0.0)


def normalize(x: list[float]) -> list[float]:
    p = peak(x)
    return [v / p for v in x] if p else x


def click() -> list[float]:
    return tone(1000, 0.05, 1.0, decay=60)


def tick() -> list[float]:
    return tone(1800, 0.04, 1.0, decay=70)


def coin() -> list[float]:
    return concat(tone(1318, 0.07, 1.0, 20), tone(1760, 0.3, 1.0, 9))


def beep() -> list[float]:
    return tone(440, 0.18, 1.0, decay=8)


def ding() -> list[float]:
    return mix(tone(1046, 0.4, 1.0, decay=8), tone(1568, 0.4, 0.5, decay=10))


def fanfare() -> list[float]:
    steps = [tone(f, 0.16, 1.0, decay=5) for f in (523, 659, 784)]
    return concat(*steps, mix(tone(1046, 0.7, 1.0, decay=3), tone(784, 0.7, 0.6, decay=3)))


def gunshot() -> list[float]:
    """Starter's pistol: a short crack over a low thump. The room makes it a bang off the stands."""
    rng = random.Random(11)
    crack = noise(0.3, 0.5, rng)  # darker than white so it isn't harsh
    return [
        c * 2.8 * math.exp(-60 * i / RATE)
        + 0.8 * math.sin(math.tau * 140 * i / RATE) * math.exp(-30 * i / RATE)
        for i, c in enumerate(crack)
    ]


def boom() -> list[float]:
    rng = random.Random(3)
    rumble = noise(1.3, 0.09, rng)
    out, phase = [], 0.0
    for i, r in enumerate(rumble):
        t = i / RATE
        phase += math.tau * (30 + 50 * math.exp(-5 * t)) / RATE  # thump sweeps down
        out.append(3 * r * math.exp(-3.5 * t) + 0.7 * math.sin(phase) * math.exp(-4 * t))
    return out


def synth_hit() -> list[float]:
    """Stand-in hoof thud if the recordings are missing."""
    rng = random.Random(7)
    return [
        a * 3 * math.exp(-45 * i / RATE)
        + 0.5 * math.sin(math.tau * 85 * i / RATE) * math.exp(-35 * i / RATE)
        for i, a in enumerate(noise(0.12, 0.12, rng))
    ]


# --- room: one echo + a soft diffuse tail ------------------------------------


def room(
    x: list[float], wet: float, tail: float, seed: int = 1,
    echo: float = 0.17, echo_gain: float = 0.22,
) -> list[float]:
    """Delay + reverb for something impulsive.

    Hack: real reverb is a convolution. For a short hit it's close to a burst
    of dark noise that decays, scaled by how loud the hit was. That's what this
    makes. Cheap, and it can't ring metallic like comb filters do.
    One echo tap gives the slapback off the stands.
    """
    rng = random.Random(seed)
    total = len(x) + _n(echo) + _n(tail)
    out = [0.0] * total
    for i, v in enumerate(x):
        out[i] += v
        out[i + _n(echo)] += v * echo_gain
    hum = noise(total / RATE, 0.15, rng)
    predelay, level = _n(0.012), wet * peak(x) * 3.0
    for i in range(predelay, total):
        t = (i - predelay) / RATE
        attack = min(1.0, t / 0.015)  # no click where the tail starts
        out[i] += hum[i] * level * attack * math.exp(-6.9 * t / tail)  # -60 dB at `tail`
    return out


def resample(x: list[float], ratio: float) -> list[float]:
    """ratio > 1 = higher and shorter. Linear interpolation."""
    out = []
    for i in range(int(len(x) / ratio) - 1):
        pos = i * ratio
        j = int(pos)
        f = pos - j
        out.append(x[j] * (1 - f) + x[j + 1] * f)
    return out


# --- mixer (dishonest) ------------------------------------------------------


def _load(path: str, freq: int, channels: int) -> list[float] | None:
    """Read an ogg into mono floats at RATE. None if it isn't there."""
    try:
        raw = array("h")
        raw.frombytes(pygame.mixer.Sound(path).get_raw())
    except (pygame.error, FileNotFoundError):
        return None
    block = (freq // RATE) * channels  # samples per output sample
    return [
        sum(raw[i : i + block]) / (block * 32768.0) for i in range(0, len(raw) - block, block)
    ]


class Sounds:
    NUM_HIT_VARIANTS = 5

    def __init__(self, num_horses: int = 8) -> None:
        self.on = False
        self.muted = False
        self.mix = settings.MIX
        self.sounds: dict[str, pygame.mixer.Sound] = {}
        self.steps: list[list[pygame.mixer.Sound]] = []  # [lane][variant]
        self._duck_at = -1e9
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init()
            freq, fmt, channels = pygame.mixer.get_init()
        except pygame.error:
            return
        # we only write signed 16-bit, at 22050 doubled or 44100
        if fmt != -16 or freq % RATE != 0:
            return
        self._rep = (freq // RATE) * channels
        pygame.mixer.set_num_channels(96)  # every hoof is its own sound. ~50 overlap at full gallop
        m = self.mix

        # name -> (samples, level, room (wet, tail) or None)
        table = {
            "click": (click(), m["ui"] * 0.8, None),
            "tick": (tick(), m["ui"] * 0.6, None),
            "coin": (coin(), m["ui"], None),
            "beep": (beep(), m["ui"], None),
            "ding": (ding(), m["ui"], None),
            "fanfare": (fanfare(), m["ui"], None),
            "gunshot": (gunshot(), m["gunshot"], (m["wet"] * 1.5, 1.1)),
            "boom": (boom(), m["boom"], (m["wet"] * 1.3, 1.4)),
        }
        for name, (samples, level, space) in table.items():
            if space:
                samples = room(samples, *space)
            self.sounds[name] = self._make(normalize(samples), level)

        self._build_steps(num_horses, freq, channels)
        self.on = True

    def _build_steps(self, num_horses: int, freq: int, channels: int) -> None:
        """5 hit variants, each pitched per lane. Room is added once per variant, then pitch-shifted."""
        m = self.mix
        bases = []
        for k in range(self.NUM_HIT_VARIANTS):
            soft = _load(os.path.join(ASSETS, f"impactSoft_medium_{k:03d}.ogg"), freq, channels)
            wood = _load(os.path.join(ASSETS, f"impactWood_light_{k:03d}.ogg"), freq, channels)
            if soft is None:
                hit = synth_hit()
            else:
                # soft thud for weight, a little wood on top for the clop
                hit = mix(normalize(soft), [0.3 * v for v in normalize(wood or [0.0])[: _n(0.15)]])
            bases.append(room(normalize(hit), m["wet"], m["tail_secs"], seed=k))
        for lane in range(num_horses):
            ratio = 0.75 + 0.35 * lane / max(1, num_horses - 1)  # low lane = low thud
            self.steps.append([
                self._make(normalize(resample(b, ratio)), 1.0) for b in bases
            ])

    def _make(self, samples: list[float], level: float) -> pygame.mixer.Sound:
        buf = array("h")
        master = self.mix["master"]
        for s in samples:
            v = int(math.tanh(s * level) * 32767 * master)  # soft limit, not a hard clip
            buf.extend([v] * self._rep)
        return pygame.mixer.Sound(buffer=buf.tobytes())

    def _duck_gain(self) -> float:
        """1.0 normally. Right after a gunshot or boom it drops, then eases back."""
        t = (time.monotonic() - self._duck_at) / self.mix["duck_secs"]
        if t >= 1.0:
            return 1.0
        smooth = t * t * (3 - 2 * t)
        return self.mix["duck"] + (1 - self.mix["duck"]) * smooth

    def play(self, name: str, volume: float = 1.0) -> None:
        if not self.on or self.muted:
            return
        if name in ("gunshot", "boom"):
            self._duck_at = time.monotonic()
        sound = self.sounds[name]
        sound.set_volume(volume)
        sound.play()

    def play_step(self, lane: int, volume: float, pan: float) -> None:
        """One hoof hit. pan is -1 (left) to 1 (right). Dropped if every channel is busy."""
        if not self.on or self.muted:
            return
        chan = pygame.mixer.find_channel()
        if chan is None:
            return
        pan = max(-1.0, min(1.0, pan)) * self.mix["pan_width"]
        angle = (pan + 1) * math.pi / 4  # constant power pan
        vol = volume * self._duck_gain() * random.uniform(0.85, 1.0)
        chan.set_volume(vol * math.cos(angle), vol * math.sin(angle))
        chan.play(random.choice(self.steps[lane % len(self.steps)]))

    def toggle_mute(self) -> None:
        self.muted = not self.muted
        if self.muted:
            pygame.mixer.stop()
