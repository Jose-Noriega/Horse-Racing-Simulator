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
// How loud each sound is on its own, in dBFS. The number is the loudest 100 ms of
// the sound (RMS), not the peak. A square-wave blip and a thud with the same peak
// are not equally loud, so peak would have lied. A peak ceiling of -3 dBFS still
// applies (see synth.setLoudness) so a short crack isn't shoved into the limiter.
// The order is the point.
//   gun + boom > fanfare > money + countdown > race effects > UI blips > UI ticks
// Hooves are a bed under all of it. A limiter on the master catches pile-ups.
export const MIX_DB = {
  // events you should jump at
  gunshot: -21, // was -12, too loud
  boom: -22, // was -13, too loud
  fanfare: -24,
  // money + countdown
  register: -26,
  coin: -27,
  beepLast: -26,
  beep: -29,
  sad: -27,
  // race effects
  ding: -29,
  gate: -30,
  photo: -31,
  debris: -31,
  cheer: -30, // the swell. a recording. was -34, raised now that a bed sits under it
  bed: -35, // the constant crowd under the race. a recording loop. the game rides it 0.5 to 1. was -38, sat under the hooves
  // UI
  error: -28,
  pick: -33,
  undo: -33,
  clear: -33,
  mute: -31,
  swish: -36,
  click: -36,
  tick: -40,
  step: -40, // one hoof, before the per-field scaling below
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
