// Main game: menu, betting, animated race, results, and card summary.
// Port of game.py. Same screens, same numbers, same layout (1280x720 logical).
// The canvas is scaled to fit the window. Mouse positions are mapped back to
// logical pixels, so nothing else cares about the real size.

import * as settings from "./settings.js";
import {
  newPool, clearPool, addBet, undoLast, formatPlayer, isParlay, totalPool, amountOnWin,
  displayedWinMultiplier, displayedTicketMultiplier, anyTicketHits, payoutsByPlayer,
} from "./betting.js";
import { getHorse, makeHorse } from "./horses_data.js";
import { assignPaceProfiles, orderProbability, paceProgress, simulateRace, winProbabilities } from "./race.js";
import { getRaceFieldIds } from "./race_card.js";
import { drawOvalTrack, laneProgress, pointOnLane } from "./track.js";
import { buildCrowd, detectPasses, drawCrowd } from "./crowd.js";
import { Sounds } from "./sounds.js";
import { drawHorse, drawStarter, footfallCount, stridePhase } from "./sprites.js";
import { rgb, shortNum } from "./ui.js";
import { createArt, updateArt } from "./fx.js";
import { drawBettingScreen, drawButtonArt } from "./screens.js";

const { SCREEN_WIDTH: W, SCREEN_HEIGHT: H, HORSES_PER_RACE: N, RACES_PER_SESSION: RACES } = settings;

const DNF_COLOR = [220, 90, 90];
const FORM_FIELDS = ["player", "name", "wager"];
const COUNTDOWN_SECONDS = 3.0;
const FADE_SECONDS = 0.3;
const DUST_LIFE = 0.6;
const STARTER_POS = [380, 470]; // in the infield, just left of the start line

// pygame's default font is smaller than its point size says. This scale makes a
// browser font land at about the same size on screen.
const FONT_SCALE = 0.78;
const FONT = { title: 48, large: 32, medium: 24, small: 18, countdown: 220 };

const easeOut = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3; // fast start, soft stop
const rand = (a, b) => a + (b - a) * Math.random();

class Button {
  constructor(x, y, w, h, label) {
    Object.assign(this, { x, y, w, h, label, enabled: true });
  }
  hit(p) {
    return this.enabled && p.x >= this.x && p.x < this.x + this.w && p.y >= this.y && p.y < this.y + this.h;
  }
  centerAt(cx, cy) {
    this.x = cx - this.w / 2;
    this.y = cy - this.h / 2;
  }
}

class TextBox {
  constructor(x, y, w, h) {
    Object.assign(this, { x, y, w, h });
  }
  hit(p) {
    return p.x >= this.x && p.x < this.x + this.w && p.y >= this.y && p.y < this.y + this.h;
  }
}

export class Game {
  constructor(canvas, { secret = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.secret = secret; // ?secret or type "boom" on the menu: horses after 4th blow up
    this.secretKeys = ""; // last few letters typed on the menu
    this.sounds = new Sounds(N);

    // The canvas never draws straight to a mirror of itself. lastFrame is the
    // previous screen's final image, for the cross-fade.
    this.lastFrame = document.createElement("canvas");
    this.fadeFrom = null;
    this.fadeStart = 0;
    this.drawnState = null;
    this.stateStart = 0;
    this.resize();

    this.mouse = { x: -1, y: -1, down: false };
    this.cursorPointer = false;

    this.state = "menu"; // menu | betting | setup | race | results | summary
    this.time = 0;
    this.raceIndex = 0;
    this.field = [];
    this.pool = newPool();
    this.raceResult = null; // { ordered, finishTimes }
    this.sessionPayouts = new Map(); // player # -> [name, paid]
    this.lastPayouts = [];
    this.poolRefunded = false;
    this.winProbs = {};

    this.activeField = "player";
    this.playerText = "";
    this.nameText = "";
    this.wagerText = "10";
    this.selectedLanes = [];
    this.statusMessage = "";

    // Race animation
    this.raceElapsed = 0;
    this.raceTimeScale = 1;
    this.raceFinished = false;
    this.raceHoldTimer = 0;
    this.settlementsApplied = false;
    this.dust = []; // [x, y, vx, vy, age]
    this.countdown = null; // seconds left before the gun. null = not counting
    this.lastBeep = null;

    // Crowd + sound
    this.shotTime = null;
    this.lastStep = new Map(); // horse id -> footfalls already sounded
    this.crowd = [];
    this.cheerUntil = new Map(); // horse id -> time its fans stop cheering
    this.cheerLevel = {}; // horse id -> 0..1, eases toward cheering or not
    this.passOrder = []; // horse ids, leader first, for spotting overtakes
    this.soundQueue = []; // [time due, sound name]
    this.finishSounded = new Set();
    this.lastTick = 0;
    this.payoutDinged = false;

    // Secret mode
    this.exploded = new Set();
    this.boomTime = null;
    this.blasts = [];
    this.sparks = [];

    this.betSeen = new Map(); // bet object -> time first drawn
    this.finishSeen = new Map(); // horse id -> time first drawn on board

    // Buttons and boxes. Positions are for the 1280x720 layout.
    this.btnStartCard = new Button(0, 0, 260, 52, "Start Race Card");
    this.btnPlaceBet = new Button(520, 248, 150, 40, "Place Bet");
    this.btnClearPicks = new Button(680, 248, 150, 40, "Clear Picks");
    this.btnUndoBet = new Button(520, 316, 150, 36, "Undo Bet");
    this.btnStartRace = new Button(680, 316, 150, 36, "Start Race");
    this.btnGo = new Button(W / 2 + 10, H - 80, 180, 48, "Go!");
    this.btnBack = new Button(W / 2 - 210, H - 80, 200, 48, "Back to Bets");
    this.btnNext = new Button(0, 0, 220, 44, "Next Race");
    this.btnSummaryMenu = new Button(0, 0, 240, 48, "Back to Menu");
    this.playerBox = new TextBox(520, 108, 90, 36);
    this.nameBox = new TextBox(620, 108, 190, 36);
    this.wagerBox = new TextBox(520, 168, 160, 36);
    this.laneRects = [];

    createArt(this); // art.js side: watches statusMessage, drives coins and the bookie
    this.loadCurrentField();
    this.bindEvents();
  }

  // --- window + input -----------------------------------------------------

  // Backing store matches the on-screen size x pixel ratio so it stays sharp.
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const box = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round((box.width || W) * dpr));
    const h = Math.max(1, Math.round((box.height || H) * dpr));
    for (const c of [this.canvas, this.lastFrame]) {
      c.width = w;
      c.height = h;
    }
    this.pixelScale = w / W;
    this.fadeFrom = null;
  }

  // Event position -> logical 1280x720 pixels.
  toLogical(e) {
    const box = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * W, y: ((e.clientY - box.top) / box.height) * H };
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("fullscreenchange", () => this.resize());
    this.canvas.addEventListener("pointermove", (e) => Object.assign(this.mouse, this.toLogical(e)));
    this.canvas.addEventListener("pointerleave", () => Object.assign(this.mouse, { x: -1, y: -1, down: false }));
    window.addEventListener("pointerup", () => (this.mouse.down = false));
    this.canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      Object.assign(this.mouse, this.toLogical(e), { down: true });
      this.sounds.unlock();
      const pos = this.toLogical(e);
      if (this.clickedSomething(pos)) this.sounds.play("click");
      this.handleClick(pos);
    });
    window.addEventListener("keydown", (e) => this.handleKey(e));
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else this.canvas.parentElement.requestFullscreen?.();
  }

  // True if this click lands on a live button (or a horse row) on the current screen.
  clickedSomething(pos) {
    const buttons = {
      menu: [this.btnStartCard],
      betting: [this.btnPlaceBet, this.btnClearPicks, this.btnUndoBet, this.btnStartRace],
      setup: this.countdown !== null ? [] : [this.btnGo, this.btnBack],
      results: [this.btnNext],
      summary: [this.btnSummaryMenu],
    }[this.state] ?? [];
    if (buttons.some((b) => b.hit(pos))) return true;
    return this.state === "betting" && this.laneRects.some((r) => r.hit(pos));
  }

  handleClick(pos) {
    switch (this.state) {
      case "menu":
        if (this.btnStartCard.hit(pos)) this.beginCard();
        return;
      case "betting": {
        const lane = this.laneRects.findIndex((r) => r.hit(pos));
        if (lane >= 0) return this.toggleOrAddPick(lane);
        for (const [name, box] of [["player", this.playerBox], ["name", this.nameBox], ["wager", this.wagerBox]]) {
          if (box.hit(pos)) {
            this.activeField = name;
            return;
          }
        }
        if (this.btnPlaceBet.hit(pos)) this.placeBet();
        else if (this.btnClearPicks.hit(pos)) {
          this.selectedLanes = [];
          this.statusMessage = "Picks cleared.";
        } else if (this.btnUndoBet.hit(pos)) this.undoBet();
        else if (this.btnStartRace.hit(pos)) this.openSetup();
        return;
      }
      case "setup":
        if (this.countdown !== null) return;
        if (this.btnGo.hit(pos)) this.go();
        else if (this.btnBack.hit(pos)) this.state = "betting";
        return;
      case "race":
        this.handleRaceSkip(); // click skips / finishes race view
        return;
      case "results":
        if (this.btnNext.hit(pos)) this.advanceFromResults();
        return;
      case "summary":
        if (this.btnSummaryMenu.hit(pos)) this.state = "menu";
    }
  }

  handleKey(e) {
    this.sounds.unlock();
    if (e.key === "F9") {
      e.preventDefault();
      this.sounds.toggleMute();
      return;
    }
    if (e.key === "F11" || (e.key === "Enter" && e.altKey)) {
      e.preventDefault();
      this.toggleFullscreen();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Z is the only shortcut we own. Leave the rest (reload, devtools) to the browser.
      if (e.key.toLowerCase() === "z" && this.state === "betting") {
        e.preventDefault();
        this.undoBet();
      }
      return;
    }
    // Hidden toggle: type "boom" on the menu. Same as ?secret in the url.
    if (this.state === "menu" && e.key.length === 1) {
      this.secretKeys = (this.secretKeys + e.key.toLowerCase()).slice(-4);
      if (this.secretKeys === "boom") {
        this.secretKeys = "";
        this.secret = !this.secret;
        this.sounds.play("boom");
      }
    }
    // Plain F too. F11 is the "Show Desktop" key on a Mac, so it never gets here.
    // Not on the betting screen, where the Name box types letters.
    if (e.key.toLowerCase() === "f" && this.state !== "betting") {
      this.toggleFullscreen();
      return;
    }
    const go = e.key === "Enter" || e.key === " ";
    switch (this.state) {
      case "menu":
        if (go) {
          e.preventDefault();
          this.beginCard();
        }
        break;
      case "betting":
        this.handleBettingKey(e);
        break;
      case "setup":
        if (this.countdown !== null) break;
        if (go) {
          e.preventDefault();
          this.go();
        } else if (e.key === "Backspace") this.state = "betting";
        break;
      case "race":
        if (go) {
          e.preventDefault();
          this.handleRaceSkip();
        }
        break;
      case "results":
        if (go || e.key.toLowerCase() === "n") {
          e.preventDefault();
          this.advanceFromResults();
        }
        break;
      case "summary":
        if (go) {
          e.preventDefault();
          this.state = "menu";
        }
    }
  }

  handleBettingKey(e) {
    const key = e.key;
    if (key === "F5") {
      e.preventDefault(); // F5 starts the race here, like the desktop game
      this.openSetup();
      return;
    }
    if (key === "Tab") {
      e.preventDefault();
      const idx = FORM_FIELDS.indexOf(this.activeField);
      this.activeField = FORM_FIELDS[(idx + (e.shiftKey ? FORM_FIELDS.length - 1 : 1)) % FORM_FIELDS.length];
      return;
    }
    if (key === "Enter") {
      this.placeBet();
      return;
    }
    if (key === " ") e.preventDefault(); // no page scroll

    if (key === "Backspace") {
      if (this.activeField === "player") {
        this.playerText = this.playerText.slice(0, -1);
        this.autofillNameFromPlayer();
      } else if (this.activeField === "name") this.nameText = this.nameText.slice(0, -1);
      else this.wagerText = this.wagerText.slice(0, -1);
      return;
    }

    const char = key.length === 1 ? key : "";
    if (this.activeField === "player") {
      if (/\d/.test(char) && this.playerText.length < 4) {
        this.playerText += char;
        this.autofillNameFromPlayer();
      }
      return;
    }
    if (this.activeField === "wager") {
      if (/[\d.]/.test(char) && this.wagerText.length < 10) this.wagerText += char;
      return;
    }
    // Name field. Same as the desktop game: 1-N pick horses here, they don't type.
    if (/^[1-9]$/.test(char) && Number(char) <= N) {
      this.toggleOrAddPick(Number(char) - 1);
      return;
    }
    if (char && this.nameText.length < 20) this.nameText += char;
  }

  autofillNameFromPlayer() {
    const number = parseInt(this.playerText, 10);
    if (Number.isNaN(number)) return;
    const known = this.pool.playerNames.get(number);
    if (known !== undefined) this.nameText = known;
  }

  // --- flow ---------------------------------------------------------------

  loadCurrentField() {
    this.field = getRaceFieldIds(this.raceIndex).map((id, i) =>
      makeHorse(getHorse(id), settings.HORSE_COLORS[i % settings.HORSE_COLORS.length]),
    );
    this.field.forEach((h, lane) => {
      h.laneIndex = lane;
    });
    clearPool(this.pool);
    this.raceResult = null;
    this.lastPayouts = [];
    this.poolRefunded = false;
    this.selectedLanes = [];
    this.winProbs = winProbabilities(this.field);
    this.statusMessage = "";
    this.raceElapsed = 0;
    this.raceFinished = false;
    this.raceHoldTimer = 0;
    this.settlementsApplied = false;
    this.laneRects = [];
  }

  beginCard() {
    this.raceIndex = 0;
    this.sessionPayouts.clear();
    this.pool.playerNames.clear();
    this.loadCurrentField();
    this.state = "betting";
  }

  toggleOrAddPick(lane) {
    const idx = this.selectedLanes.indexOf(lane);
    if (idx >= 0) {
      // Clicking an already-picked horse drops it and later legs.
      this.selectedLanes = this.selectedLanes.slice(0, idx);
      return;
    }
    if (this.selectedLanes.length >= settings.MAX_PARLAY_LEGS) {
      this.statusMessage = `Max ${settings.MAX_PARLAY_LEGS} horses in a parlay.`;
      return;
    }
    this.selectedLanes.push(lane);
  }

  placeBet() {
    if (!this.field.length) return void (this.statusMessage = "No field loaded.");
    if (!this.selectedLanes.length) return void (this.statusMessage = "Pick a horse first.");
    const playerNumber = parseInt(this.playerText, 10);
    if (Number.isNaN(playerNumber)) return void (this.statusMessage = "Enter a player number.");
    const amount = parseFloat(this.wagerText);
    if (Number.isNaN(amount)) return void (this.statusMessage = "Enter a valid wager amount.");
    const horseIds = this.selectedLanes.map((i) => this.field[i].id);
    const names = this.selectedLanes.map((i) => this.field[i].name);
    let bet;
    try {
      bet = addBet(this.pool, playerNumber, this.nameText, horseIds, amount);
    } catch (err) {
      this.statusMessage = err.message;
      return;
    }
    const kind = isParlay(bet) ? "Parlay" : "Win";
    const who = formatPlayer(bet.playerNumber, bet.personName);
    this.statusMessage = `${kind} ${who}: ${names.join(" > ")}  $${shortNum(bet.amount)} total`;
    this.selectedLanes = [];
    this.sounds.play("coin");
  }

  undoBet() {
    this.statusMessage = undoLast(this.pool) ? "Bet undone." : "Nothing to undo.";
  }

  // First action: line horses up at the gate. Nothing moves yet.
  openSetup() {
    if (!this.field.length) this.loadCurrentField();
    this.raceResult = simulateRace(this.field);
    const winnerTime = this.raceResult.ordered[0].finishTime;
    this.raceTimeScale = settings.TARGET_RACE_SECONDS / Math.max(winnerTime, 0.001);
    assignPaceProfiles(this.field);

    this.field.forEach((horse, i) => {
      horse.laneIndex = i;
      horse.progress = 0;
      horse.finished = false;
      [horse.x, horse.y, horse.heading] = pointOnLane(i, laneProgress(i, 0));
    });

    this.raceElapsed = 0;
    this.raceFinished = false;
    this.raceHoldTimer = 0;
    this.settlementsApplied = false;
    this.dust = [];
    this.finishSeen.clear();
    this.exploded.clear();
    this.blasts = [];
    this.sparks = [];
    this.boomTime = null;
    this.countdown = null;
    this.crowd = buildCrowd(this.field.map((h) => h.id), this.field.map((h) => h.color));
    this.cheerUntil.clear();
    this.cheerLevel = {};
    this.passOrder = this.field.map((h) => h.id);
    this.soundQueue = [];
    this.finishSounded.clear();
    this.lastStep.clear();
    this.shotTime = null;
    this.payoutDinged = false;
    this.state = "setup";
    this.statusMessage = "";
  }

  // Second action: 3, 2, 1, then the race runs.
  go() {
    if (this.countdown === null) {
      this.countdown = COUNTDOWN_SECONDS;
      this.lastBeep = null;
    }
  }

  visualFinishTime(horse) {
    return horse.finishTime * this.raceTimeScale;
  }

  handleRaceSkip() {
    if (!this.raceFinished) this.snapRaceToFinish();
    else this.goToResults();
  }

  snapRaceToFinish() {
    if (this.secret && !this.exploded.size) {
      this.explode(this.field.filter((h) => !h.finished && (h.place || 0) > 4));
    }
    for (const horse of this.field) {
      if (this.exploded.has(horse.id)) continue;
      horse.progress = 1;
      horse.finished = true;
      [horse.x, horse.y, horse.heading] = pointOnLane(horse.laneIndex, 1);
    }
    this.raceFinished = true;
    this.raceHoldTimer = 0;
    if (this.raceResult) {
      const last = this.raceResult.ordered[this.raceResult.ordered.length - 1];
      this.raceElapsed = this.visualFinishTime(last);
    }
  }

  goToResults() {
    this.applySettlements();
    this.state = "results";
  }

  advanceFromResults() {
    if (this.raceIndex + 1 < RACES) {
      this.raceIndex++;
      this.loadCurrentField();
      this.state = "betting";
    } else this.state = "summary";
  }

  applySettlements() {
    if (!this.raceResult || this.settlementsApplied) return;
    const finishIds = this.raceResult.ordered.map((h) => h.id);
    this.poolRefunded = this.pool.bets.length > 0 && !anyTicketHits(this.pool, finishIds);
    this.lastPayouts = payoutsByPlayer(this.pool, finishIds, this.winProbs, (ids) => orderProbability(this.field, ids));
    for (const payout of this.lastPayouts) {
      const [prevName, prevAmt] = this.sessionPayouts.get(payout.playerNumber) ?? ["", 0];
      this.sessionPayouts.set(payout.playerNumber, [payout.personName || prevName, prevAmt + payout.amount]);
    }
    this.settlementsApplied = true;
  }

  // --- crowd + sound ------------------------------------------------------

  cheer(horseId, seconds) {
    this.cheerUntil.set(horseId, Math.max(this.cheerUntil.get(horseId) ?? 0, this.time + seconds));
  }

  updateCrowd(dt) {
    for (const [hid, until] of this.cheerUntil) {
      const target = until > this.time && !this.exploded.has(hid) ? 1 : 0;
      const level = this.cheerLevel[hid] ?? 0;
      this.cheerLevel[hid] = level + (target - level) * Math.min(1, dt * 12);
    }
  }

  updateSounds() {
    const due = this.soundQueue.filter((s) => s[0] <= this.time);
    this.soundQueue = this.soundQueue.filter((s) => s[0] > this.time);
    for (const [, name] of due) this.sounds.play(name);

    // payout numbers count up with a tick, then a ding
    if (this.state === "results" && this.lastPayouts.length && !this.poolRefunded) {
      const age = this.time - this.stateStart;
      const end = 0.5 + 1.2 + 0.3 * (this.lastPayouts.length - 1);
      if (age > 0.5 && age < end && this.time - this.lastTick > 0.07) {
        this.lastTick = this.time;
        this.sounds.play("tick");
      } else if (age >= end && !this.payoutDinged) {
        this.payoutDinged = true;
        this.sounds.play("ding", 0.7);
      }
    }
  }

  raceStarted() {
    this.shotTime = this.time;
    this.sounds.play("gunshot");
    for (const h of this.field) this.cheer(h.id, 1.3);
  }

  // One thud per hoof per horse, on the frame the drawn foot lands.
  // Per-hoof level shrinks with the field so the sum stays steady, and the whole
  // gallop swells toward the line (broadcast mixers build it the same way).
  playFootsteps() {
    const lead = Math.max(...this.field.map((h) => h.progress));
    const swell = settings.MIX.steps_swell;
    const volume = (settings.MIX.steps / Math.sqrt(this.field.length)) * (1 - swell / 2 + swell * lead);
    for (const horse of this.field) {
      if (horse.finished || horse.progress <= 0) continue;
      const steps = footfallCount(horse.progress);
      if (steps > (this.lastStep.get(horse.id) ?? 0)) {
        this.lastStep.set(horse.id, steps);
        this.sounds.playStep(horse.laneIndex, volume, (horse.x - W / 2) / (W / 2));
      }
    }
  }

  // A horse passing another sends its fans up.
  checkPasses() {
    const progress = Object.fromEntries(this.field.map((h) => [h.id, h.progress]));
    const { order, passes } = detectPasses(this.passOrder, progress);
    this.passOrder = order;
    for (const [passer, passed] of passes) {
      if (this.exploded.has(passed) || progress[passer] < 0.03) continue;
      this.cheer(passer, 1.4);
    }
  }

  checkFinishes() {
    for (const horse of this.field) {
      if (!horse.finished || this.finishSounded.has(horse.id)) continue;
      this.finishSounded.add(horse.id);
      if (horse.place === 1) {
        this.sounds.play("fanfare");
        this.cheer(horse.id, 3.5);
      } else this.sounds.play("ding", 0.7);
    }
  }

  // --- secret mode: blow things up ---------------------------------------

  // Blow these horses up. They stop running and stay out of the finish board.
  explode(horses) {
    if (this.boomTime === null) this.boomTime = this.time;
    horses.forEach((horse, k) => {
      const wait = -0.12 * k; // tiny stagger, negative age = waiting
      this.soundQueue.push([this.time + 0.12 * k, "boom"]);
      this.exploded.add(horse.id);
      horse.finished = true;
      this.blasts.push({ x: horse.x, y: horse.y, age: wait });
      const burst = (count, kind, speed, life, radius, angle, vyBias = 0) => {
        for (let i = 0; i < count; i++) {
          const ang = rand(...angle);
          const spd = rand(...speed);
          this.sparks.push({
            kind, x: horse.x, y: horse.y - 6,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd + vyBias,
            age: wait, life: rand(...life), r: rand(...radius), color: horse.color,
          });
        }
      };
      burst(26, "fire", [60, 280], [0.45, 0.9], [4, 9], [0, Math.PI * 2]);
      burst(10, "smoke", [10, 70], [1.0, 1.8], [8, 14], [0, Math.PI * 2], -30);
      burst(10, "debris", [120, 320], [0.7, 1.2], [2, 4], [Math.PI, Math.PI * 2]); // mostly up
    });
  }

  updateBoom(dt) {
    for (const b of this.blasts) b.age += dt;
    this.blasts = this.blasts.filter((b) => b.age < 0.6);
    for (const p of this.sparks) {
      p.age += dt;
      if (p.age <= 0) continue; // still waiting on its stagger
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97;
      if (p.kind === "debris") p.vy += 500 * dt; // gravity
      else if (p.kind === "smoke") p.vy -= 20 * dt; // drifts up
      else p.vy *= 0.97;
    }
    this.sparks = this.sparks.filter((p) => p.age < p.life);
  }

  updateDust(dt) {
    for (const p of this.dust) {
      p[0] += p[2] * dt;
      p[1] += p[3] * dt;
      p[4] += dt;
    }
    this.dust = this.dust.filter((p) => p[4] < DUST_LIFE);
    for (const horse of this.field) {
      if (horse.finished || horse.progress <= 0 || Math.random() > dt * 30) continue;
      // kick up from the back hooves, drift backward + up
      const back = Math.cos(horse.heading) >= 0 ? -1 : 1;
      this.dust.push([horse.x + back * 12, horse.y + 10, back * rand(10, 30), rand(-25, -5), 0]);
    }
  }

  // --- update + draw loop -------------------------------------------------

  frame(dt) {
    this.time += dt;
    this.update(dt);
    updateArt(this, dt);
    this.draw();
  }

  update(dt) {
    this.updateCrowd(dt);
    this.updateSounds();
    if (this.state === "setup" && this.countdown !== null) {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n > 0 && n !== this.lastBeep) {
        this.lastBeep = n;
        this.sounds.play("beep");
      }
      if (this.countdown <= 0) {
        this.countdown = null;
        this.state = "race";
        this.raceStarted();
      }
      return;
    }
    if (this.state !== "race") return;
    this.updateDust(dt);
    this.updateBoom(dt);

    if (!this.raceFinished) {
      this.raceElapsed += dt;
      let allDone = true;
      for (const horse of this.field) {
        const visualT = this.visualFinishTime(horse);
        const u = visualT <= 0 ? 1 : Math.min(1, this.raceElapsed / visualT);
        horse.progress = paceProgress(horse.paceSpeeds, u);
        if (horse.progress >= 1) {
          horse.progress = 1;
          horse.finished = true;
        } else allDone = false;
        [horse.x, horse.y, horse.heading] = pointOnLane(horse.laneIndex, laneProgress(horse.laneIndex, horse.progress));
      }
      this.checkPasses();
      this.playFootsteps();
      this.checkFinishes();
      if (this.secret && !this.exploded.size) {
        const crossed = this.field.filter((h) => h.finished).length;
        if (crossed >= 4 && crossed < this.field.length) {
          this.explode(this.field.filter((h) => !h.finished));
          allDone = true;
        }
      }
      if (allDone) {
        this.raceFinished = true;
        this.raceHoldTimer = 0;
      }
    } else {
      this.raceHoldTimer += dt;
      // leave time for the blasts to play out
      if (this.raceHoldTimer >= (this.exploded.size ? 2.8 : 1.5)) this.goToResults();
    }
  }

  draw() {
    const { ctx, canvas } = this;
    if (this.state !== this.drawnState) {
      this.stateStart = this.time;
      if (this.drawnState !== null) {
        this.fadeFrom = document.createElement("canvas");
        this.fadeFrom.width = this.lastFrame.width;
        this.fadeFrom.height = this.lastFrame.height;
        this.fadeFrom.getContext("2d").drawImage(this.lastFrame, 0, 0);
        this.fadeStart = this.time;
      }
      this.drawnState = this.state;
    }

    ctx.setTransform(this.pixelScale, 0, 0, this.pixelScale, 0, 0);
    ctx.globalAlpha = 1;
    this.hoverButton = false;
    switch (this.state) {
      case "menu": this.drawMenu(); break;
      case "betting": this.drawBetting(); break;
      case "setup": this.drawSetup(); break;
      case "race": this.drawRace(); break;
      case "results": this.drawResults(); break;
      case "summary": this.drawSummary(); break;
    }
    this.drawFade();
    const wantPointer = this.hoverButton || (this.state === "betting" && this.laneRects.some((r) => r.hit(this.mouse)));
    if (wantPointer !== this.cursorPointer) {
      this.cursorPointer = wantPointer;
      canvas.style.cursor = wantPointer ? "pointer" : "default";
    }
  }

  // Cross-fade from the last frame of the previous screen.
  drawFade() {
    const { ctx } = this;
    if (this.fadeFrom) {
      const t = (this.time - this.fadeStart) / FADE_SECONDS;
      if (t >= 1) this.fadeFrom = null;
      else {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1 - t;
        ctx.drawImage(this.fadeFrom, 0, 0);
        ctx.restore();
      }
    }
    // copy AFTER the fade so a fast second switch fades from what was on screen
    const lc = this.lastFrame.getContext("2d");
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.drawImage(this.canvas, 0, 0);
  }

  // --- drawing helpers ----------------------------------------------------

  setFont(size, bold = true) {
    this.ctx.font = `${bold ? "600 " : ""}${Math.round(size * FONT_SCALE)}px "Helvetica Neue", Arial, sans-serif`;
  }

  // Draw text with its top-left at (x, y), like pygame's blit of a rendered surface.
  text(str, x, y, size, color, { align = "left", alpha = 1 } = {}) {
    const { ctx } = this;
    this.setFont(size);
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgb(color);
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }

  centered(str, size, color, cy) {
    const { ctx } = this;
    this.setFont(size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = rgb(color);
    ctx.fillText(str, W / 2, cy);
  }

  textWidth(str, size) {
    this.setFont(size);
    return this.ctx.measureText(str).width;
  }

  rrect(x, y, w, h, r, fill, stroke = null, lineWidth = 2) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) {
      ctx.fillStyle = rgb(fill);
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = rgb(stroke);
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  disc(x, y, r, color) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = rgb(color);
    ctx.fill();
  }

  fill(color) {
    this.ctx.fillStyle = rgb(color);
    this.ctx.fillRect(0, 0, W, H);
  }

  // Soft "neomorphic" button: raised slab with a light and a dark shadow.
  // Pressed = sunk in. Hack: real neomorphism wants the button to match its
  // background. Ours is a dark slate that reads OK on our dark screens.
  drawButton(btn, pulse = false) {
    drawButtonArt(this, btn, pulse);
  }

  drawTextBox(box, str, active) {
    const { ctx } = this;
    this.rrect(box.x, box.y, box.w, box.h, 4, [35, 35, 35], active ? settings.GOLD : settings.GRAY);
    const cursor = active && Math.floor(this.time * 2) % 2 === 0 ? "|" : "";
    this.setFont(FONT.small);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = rgb(settings.WHITE);
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x + 2, box.y, box.w - 4, box.h);
    ctx.clip();
    ctx.fillText(str + cursor, box.x + 8, box.y + box.h / 2);
    ctx.restore();
  }

  // --- screens ------------------------------------------------------------

  drawMenu() {
    // Soft track-like backdrop
    this.fill([28, 36, 28]);
    for (let i = 0; i < N; i++) {
      const shade = 40 + (i % 2) * 8;
      this.ctx.fillStyle = rgb([shade, shade + 10, shade]);
      this.ctx.fillRect(0, 120 + i * 60, W, 60);
    }
    this.ctx.fillStyle = rgb(settings.GOLD);
    this.ctx.fillRect(W - 140, 120, 8, N * 60);

    this.centered(settings.TITLE, FONT.title, settings.GOLD, 200);
    this.centered(`${RACES} races, ${N} horses each`, FONT.small, settings.LIGHT_GRAY, 270);
    this.centered("Enter or click to start", FONT.small, settings.GRAY, 330);

    this.btnStartCard.centerAt(W / 2, 400);
    this.drawButton(this.btnStartCard);
    this.centered("F9 mute   F fullscreen", FONT.small, settings.GRAY, H - 30);
    if (this.secret) this.disc(W - 16, H - 16, 4, [120, 30, 30]); // faint tell that secret mode is on
  }

  drawBetting() {
    drawBettingScreen(this);
  }

  drawStarter() {
    const age = this.shotTime === null ? null : this.time - this.shotTime;
    let raise = 0;
    if (age !== null) {
      // gun stays up a moment after the shot, then comes down
      raise = 1 - Math.min(1, Math.max(0, (age - 1.8) / 0.5));
    } else if (this.countdown !== null) {
      // raise it during the last ~1.5 seconds of the count
      raise = easeOut((1.6 - this.countdown) / 0.6);
    }
    drawStarter(this.ctx, STARTER_POS[0], STARTER_POS[1], raise, age);
  }

  drawRace() {
    const { ctx } = this;
    // Rattle the whole frame for a moment after the first blast.
    let shaking = false;
    if (this.boomTime !== null) {
      const t = (this.time - this.boomTime) / 0.7;
      if (t < 1) {
        const amp = 8 * (1 - t);
        this.fill([0, 0, 0]);
        ctx.save();
        ctx.translate(Math.trunc(rand(-amp, amp)), Math.trunc(rand(-amp, amp)));
        shaking = true;
      }
    }

    drawOvalTrack(ctx);
    drawCrowd(ctx, this.crowd, this.cheerLevel, this.time);
    this.drawStarter();
    this.text(`Race ${this.raceIndex + 1} of ${RACES}`, 24, 12, FONT.large, settings.GOLD);

    let timer = "FINISH!";
    if (!this.raceFinished) {
      const s = Math.trunc(this.raceElapsed);
      timer = `${Math.trunc(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
    this.text(timer, W - 140, 16, FONT.medium, settings.WHITE);

    this.drawHorses();
    this.drawBoom();
    this.drawFinishBoard();
    const goAge = this.time - this.stateStart;
    if (goAge < 0.6) this.drawPop("GO!", goAge / 0.6);

    this.centered(this.raceFinished ? "Click for results" : "Click to skip", FONT.small, settings.WHITE, H - 9);
    if (shaking) ctx.restore();
  }

  drawBoom() {
    const { ctx } = this;
    for (const b of this.blasts) {
      if (b.age <= 0) continue;
      const t = b.age / 0.6;
      if (t < 0.35) {
        // white flash, quick
        const r = Math.trunc(14 + (70 * t) / 0.35);
        ctx.beginPath();
        ctx.arc(b.x, b.y - 6, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,245,200,${(230 * (1 - t / 0.35)) / 255})`;
        ctx.fill();
      }
      // shockwave ring
      const rr = Math.trunc(10 + 120 * (1 - (1 - t) ** 2));
      ctx.beginPath();
      ctx.arc(b.x, b.y - 6, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${(160 * (1 - t)) / 255})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // smoke under fire under debris
    for (const kind of ["smoke", "fire", "debris"]) {
      for (const p of this.sparks) {
        if (p.kind !== kind || p.age <= 0) continue;
        const f = p.age / p.life;
        const x = Math.trunc(p.x);
        const y = Math.trunc(p.y);
        if (kind === "smoke") {
          ctx.beginPath();
          ctx.arc(x, y, Math.trunc(p.r * (1 + 1.5 * f)), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(60,60,60,${(150 * (1 - f)) / 255})`;
          ctx.fill();
        } else if (kind === "fire") {
          // yellow -> orange -> red -> dark
          const stops = [[255, 240, 120], [255, 150, 30], [200, 50, 20], [50, 40, 40]];
          const pos = f * (stops.length - 1);
          const i = Math.min(stops.length - 2, Math.trunc(pos));
          const c = stops[i].map((v, k) => Math.trunc(v + (stops[i + 1][k] - v) * (pos - i)));
          this.disc(x, y, Math.max(1, Math.trunc(p.r * (1 - 0.7 * f))), c);
        } else {
          ctx.fillStyle = rgb(p.color);
          ctx.fillRect(x - 2, y - 2, Math.trunc(p.r) + 1, Math.trunc(p.r) + 1);
        }
      }
    }
  }

  drawHorses() {
    const { ctx } = this;
    // Dust goes under the horses. Color fades into the dirt.
    for (const [x, y, , , age] of this.dust) {
      const f = age / DUST_LIFE;
      const c = [225, 200, 160].map((a, k) => Math.trunc(a + (settings.DIRT[k] - a) * f));
      this.disc(Math.trunc(x), Math.trunc(y), Math.trunc(2 + 4 * f), c);
    }

    // Draw backstretch horses first so homestretch reads on top
    for (const horse of [...this.field].sort((a, b) => a.y - b.y)) {
      if (this.exploded.has(horse.id)) continue;
      const hx = Math.trunc(horse.x);
      const hy = Math.trunc(horse.y);
      const running = this.state === "race" && !horse.finished;
      drawHorse(ctx, hx, hy, horse.heading, horse.color, stridePhase(horse.progress), running);

      let alpha = 1;
      let dy = 0;
      if (this.state === "setup") {
        // one lane after another, sliding down into place
        alpha = easeOut((this.time - this.stateStart - 0.2 - horse.laneIndex * 0.08) / 0.35);
        dy = Math.trunc((1 - alpha) * -14);
      }
      this.text(horse.name, hx, hy - 34 + dy, FONT.small, settings.WHITE, { align: "center", alpha });
      if (horse.finished && horse.place) this.text(String(horse.place), hx, hy + 16, FONT.small, settings.GOLD, { align: "center" });
    }
  }

  // Horses show up here as they cross the line. Sits in the infield.
  drawFinishBoard() {
    // place was set up front, and finish time follows place, so this is crossing order
    const done = this.field.filter((h) => h.finished && !this.exploded.has(h.id)).sort((a, b) => (a.place || 99) - (b.place || 99));
    if (!done.length) return;
    const dnf = this.field.filter((h) => this.exploded.has(h.id)).sort((a, b) => (a.place || 99) - (b.place || 99));
    const rowH = 22;
    const pw = 260;
    const ph = 30 + rowH * this.field.length;
    const px = settings.TRACK_CENTER_X - pw / 2;
    const py = settings.TRACK_CENTER_Y - ph / 2;
    this.rrect(px, py, pw, ph, 8, settings.PANEL);
    this.rrect(px, py, pw, ph, 8, null, settings.GOLD);
    this.text("Finish", px + 12, py + 6, FONT.small, settings.GOLD);
    [...done, ...dnf].forEach((horse, i) => {
      const isDnf = this.exploded.has(horse.id);
      const y = py + 30 + i * rowH;
      if (!this.finishSeen.has(horse.id)) this.finishSeen.set(horse.id, this.time);
      const ease = easeOut((this.time - this.finishSeen.get(horse.id)) / 0.4);
      const dx = Math.trunc((1 - ease) * 80);
      if (i === 0 && !isDnf) {
        // winner row: gold bar that fades from bright to a soft glow
        this.ctx.fillStyle = rgb(settings.GOLD, (110 - 60 * ease) / 255);
        this.ctx.fillRect(px + 8 + dx, y - 2, pw - 16, rowH);
      }
      this.disc(px + 18 + dx, y + 8, 6, horse.color);
      const label = isDnf ? `DNF  ${horse.name}` : `${i + 1}. ${horse.name}`;
      this.text(label, px + 32 + dx, y, FONT.small, isDnf ? DNF_COLOR : settings.WHITE, { alpha: ease });
      if (!isDnf) {
        this.text(`${this.visualFinishTime(horse).toFixed(1)}s`, px + pw - 12 + dx, y, FONT.small, settings.LIGHT_GRAY, { align: "right", alpha: ease });
      }
    });
  }

  drawSetup() {
    drawOvalTrack(this.ctx);
    drawCrowd(this.ctx, this.crowd, this.cheerLevel, this.time);
    this.drawStarter();
    this.text(`Race ${this.raceIndex + 1} of ${RACES}`, 24, 12, FONT.large, settings.GOLD);
    this.drawHorses();
    if (this.countdown === null) {
      this.drawButton(this.btnBack);
      this.drawButton(this.btnGo, true);
    } else {
      // Big 3, 2, 1. Each number pops in large and shrinks + fades over its second.
      const n = Math.ceil(this.countdown);
      this.drawPop(String(n), n - this.countdown);
    }
  }

  drawPop(str, frac) {
    const { ctx } = this;
    const scale = 1 + 0.8 * (1 - easeOut(frac * 3)); // settles in the first third
    ctx.save();
    ctx.translate(settings.TRACK_CENTER_X, settings.TRACK_CENTER_Y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, frac - 0.6) / 0.4);
    this.setFont(FONT.countdown);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = rgb(settings.GOLD);
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  drawResults() {
    this.fill(settings.DARK_GRAY);
    this.centered(`Race ${this.raceIndex + 1} results`, FONT.large, settings.GOLD, 36);
    if (!this.raceResult) {
      this.centered("No result yet.", FONT.medium, settings.LIGHT_GRAY, 200);
      return;
    }

    // Finish order panel
    this.rrect(40, 80, 560, Math.max(480, 60 + N * 50 + 10), 8, settings.PANEL);
    this.text("Order", 60, 96, FONT.medium, settings.WHITE);
    let y = 140;
    for (const horse of this.raceResult.ordered) {
      this.rrect(60, y, 500, 42, 6, horse.place === 1 ? [90, 75, 30] : [48, 48, 48]);
      this.disc(82, y + 21, 12, horse.color);
      const pWin = (100 * (this.winProbs[horse.id] ?? 0)).toFixed(1);
      let line = `${horse.place}. ${horse.name}    win ${pWin}%`;
      let color = horse.place === 1 ? settings.GOLD : settings.WHITE;
      if (this.exploded.has(horse.id)) {
        line = `DNF  ${horse.name}    win ${pWin}%`;
        color = DNF_COLOR;
      }
      this.text(line, 108, y + 12, FONT.small, color);
      y += 50;
    }

    // Payouts panel
    this.rrect(640, 80, 580, 400, 8, settings.PANEL);
    this.text("Payouts", 660, 96, FONT.medium, settings.WHITE);
    this.text(`Winner: ${this.raceResult.ordered[0].name}`, 660, 130, FONT.small, settings.GOLD);
    let sy = 170;
    if (this.poolRefunded) this.text("No winners. Wagers returned.", 660, sy, FONT.small, settings.GRAY);
    else if (!this.lastPayouts.length) this.text("No payouts.", 660, sy, FONT.small, settings.GRAY);
    else {
      const age = this.time - this.stateStart;
      this.lastPayouts.forEach((payout, i) => {
        // count up from $0, one payout after another
        const shown = payout.amount * easeOut((age - 0.5 - i * 0.3) / 1.2);
        this.text(`${formatPlayer(payout.playerNumber, payout.personName)}:  $${shortNum(shown)}`, 660, sy, FONT.small, settings.GREEN);
        sy += 26;
      });
    }

    this.btnNext.label = this.raceIndex + 1 >= RACES ? "View Card Summary" : "Next Race";
    this.btnNext.x = 640;
    this.btnNext.y = 520;
    this.drawButton(this.btnNext);
  }

  drawSummary() {
    this.fill([28, 32, 40]);
    this.centered("Card complete", FONT.title, settings.GOLD, 80);
    this.rrect(340, 180, 600, 360, 8, settings.PANEL);
    this.text("Payouts", 370, 200, FONT.medium, settings.WHITE);

    let y = 250;
    if (!this.sessionPayouts.size) this.text("No payouts.", 370, y, FONT.small, settings.GRAY);
    else {
      const ranked = [...this.sessionPayouts].sort((a, b) => b[1][1] - a[1][1]);
      ranked.forEach(([number, [name, paid]], i) => {
        this.text(`${i + 1}. ${formatPlayer(number, name)}    $${shortNum(paid)}`, 370, y, FONT.small, settings.GREEN);
        y += 28;
      });
    }
    this.btnSummaryMenu.centerAt(W / 2, 600);
    this.drawButton(this.btnSummaryMenu);
  }
}
