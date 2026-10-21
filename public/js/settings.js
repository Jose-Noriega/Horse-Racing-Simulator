// Game-wide constants. Port of settings.py.

export const SCREEN_WIDTH = 1280;
export const SCREEN_HEIGHT = 720;
export const TITLE = "Horse Racing Simulator";

// Roster / card
export const TOTAL_HORSES = 64;
export const HORSES_PER_RACE = 8;
export const RACES_PER_SESSION = 8;
export const MAX_PARLAY_LEGS = 3;

// Oval (stadium) track. One lap, counterclockwise.
export const TRACK_CENTER_X = SCREEN_WIDTH / 2;
export const TRACK_CENTER_Y = 400;
export const TRACK_STRAIGHT = 460;
export const TRACK_INNER_RADIUS = 118;
export const TRACK_LANE_WIDTH = 18;

export const DIRT = [166, 124, 72];
export const DIRT_DARK = [140, 102, 58];
export const INFIELD = [46, 92, 46];
export const RAIL = [230, 230, 230];

// Winner's visual time. Everyone else scales from it.
export const TARGET_RACE_SECONDS = 30.0;

// Gaussian noise around average_speed when simulating a race.
export const SPEED_SIGMA = 10.0;
// Squeeze every horse's average speed toward the roster mean. 1.0 = as written.
export const SPEED_COMPRESSION = 0.7;
// Softmax temperature for win / parlay probabilities. Higher = flatter.
export const PROB_TEMPERATURE = 10.0;

// Colors. Plain [r, g, b] arrays. Use rgb() in ui.js to turn one into a css string.
export const BLACK = [0, 0, 0];
export const WHITE = [255, 255, 255];
export const GRAY = [120, 120, 120];
export const DARK_GRAY = [40, 40, 40];
export const LIGHT_GRAY = [200, 200, 200];
export const GREEN = [34, 139, 34];
export const RED = [200, 40, 40];
export const GOLD = [218, 165, 32];
export const PANEL = [55, 55, 55];

// Cycled for the starters. 6 horses per race just uses the first 6.
export const HORSE_COLORS = [
  [220, 50, 50],
  [50, 100, 220],
  [40, 160, 70],
  [230, 160, 40],
  [150, 60, 180],
  [40, 170, 180],
  [220, 80, 140],
  [90, 90, 90],
];

// Sound mix. Tweak by ear.
// Peak level of each sound on its own, in dBFS (0 = as loud as it gets).
// The order is the point: the gun and the boom are the loudest events. Then the
// fanfare. Then the tones. UI ticks are barely there. Short tones around 1-2 kHz
// sound louder than a thud at the same peak, so they sit well below the gun.
// A limiter on the master catches anything that stacks up.
export const MIX_DB = {
  click: -28,
  tick: -34,
  coin: -22,
  beep: -18,
  ding: -22,
  fanfare: -16,
  gunshot: -6,
  boom: -8,
  step: -14, // one hoof, before the per-field scaling below
};
export const MIX = {
  master: 0.9, // 0..1 after the limiter's input
  steps: 1.0, // whole field. each hoof gets this / sqrt(number of horses)
  steps_swell: 0.35, // hooves get this much louder from the gate to the line
  duck: 0.3, // hooves drop to this when the gun or a boom goes off...
  duck_secs: 1.2, // ...and climb back over this long
  pan_width: 0.7, // 1.0 = hard left/right
  wet: 0.3, // reverb level on hooves. gun and boom are a bit wetter
  tail_secs: 0.45, // hoof reverb length. gun and boom run longer
};
