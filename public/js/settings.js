// Game-wide constants. Port of settings.py.

export const SCREEN_WIDTH = 1280;
export const SCREEN_HEIGHT = 720;
export const TITLE = "Horse Racing Simulator";

// Roster / card
export const TOTAL_HORSES = 65; // must match the roster length, a test checks
export const HORSES_PER_RACE = 5;
export const RACES_PER_SESSION = 5;
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

// Coat colors by name. The roster (roster_raw.js) says which coat each horse wears.
// Real coats first, then a few silly ones for the silly horses.
export const COAT_COLORS = {
  bay: [150, 90, 50],
  "dark bay": [105, 62, 40],
  chestnut: [180, 90, 40],
  liver: [92, 52, 40],
  black: [48, 44, 52],
  grey: [150, 156, 166],
  "dapple grey": [122, 128, 140],
  white: [238, 236, 232],
  palomino: [225, 180, 100],
  buckskin: [200, 150, 82],
  dun: [190, 160, 118],
  cream: [236, 218, 180],
  roan: [172, 116, 104],
  "blue roan": [96, 108, 128],
  champagne: [214, 184, 150],
  sorrel: [200, 110, 60],
  "flaxen chestnut": [172, 82, 40], // chestnut with a pale mane and tail (see MANE_COLORS)
  // not from nature
  steel: [150, 166, 182], // robots
  "alien green": [118, 205, 96],
  // silly
  mint: [150, 210, 175],
  lavender: [178, 150, 210],
  gold: [235, 190, 60],
  "bubblegum": [240, 160, 190],
};

// Running styles. style: -1 fast early and fades, +1 slow early and finishes strong.
// lateKick: extra speed in the last stretch. Same numbers the game always used.
export const PACE_STYLES = {
  "front runner": { style: -0.9, lateKick: 0.1 },
  "pace setter": { style: -0.6, lateKick: 0.25 },
  stalker: { style: -0.3, lateKick: 0.5 },
  steady: { style: 0, lateKick: 0.35 },
  "late mover": { style: 0.3, lateKick: 0.7 },
  closer: { style: 0.6, lateKick: 0.45 },
  "deep closer": { style: 0.9, lateKick: 0.8 },
  plodder: { style: 0.2, lateKick: 0.15 },
};

// Coats that do not get the automatic mane (dark body = light mane, light body = dark mane).
// Keyed by coat name. Anything not listed here uses the automatic one.
export const MANE_COLORS = {
  "flaxen chestnut": [246, 238, 218],
};

// Body styles. "horse" is the default and the roster leaves it off. The others swap the head
// and add a few details (spots, a wing, a different tail). Legs, rider and saddle cloth stay.
export const BODIES = ["horse", "duck", "cow"];

// Hats and props, and face quirks. Roster entries pick from these by name.
export const ACCESSORIES = [
  "sunglasses", "tophat", "mustache", "bandana", "helmet", "partyhat", "monocle",
  "bowtie", "flower", "crown", "propeller", "chef", "cowboy", "headband",
  "wizard", "unicorn", "antennae", "cyborg",
  "beard", "wig", "clownwig",
  "none", // no hat at all. For plain, wild-looking horses
];
export const TRAITS = ["tongue", "goofy", "buckteeth", "lashes", "grin", "none", "glowing", "alien", "visor", "hollow", "vortex"];

// Rider / outfit colors. Dealt out fresh each race, no two horses in a race share one.
// Also the horse's color on the bet screen and its fans in the crowd.
// Need at least HORSES_PER_RACE of these. Keep them far apart so they read at a glance.
export const ACCENT_COLORS = [
  [220, 50, 50], // red
  [240, 130, 40], // orange
  [240, 205, 50], // yellow
  [140, 205, 60], // lime
  [40, 160, 70], // green
  [40, 170, 160], // teal
  [70, 170, 235], // sky
  [50, 90, 220], // blue
  [140, 70, 190], // purple
  [210, 60, 160], // magenta
  [245, 140, 170], // pink
  [140, 30, 60], // maroon
];

// Sound mix. Tweak by ear.
// How loud each sound is on its own, in dBFS. The number is the loudest 100 ms of
// the sound (RMS), not the peak. A square-wave blip and a thud with the same peak
// are not equally loud, so peak would have lied. A peak ceiling of -3 dBFS still
// applies (see synth.setLoudness) so a short crack isn't shoved into the limiter.
// The order is the point.
//   fanfare > money + countdown, with gunshot and boom below the fanfare
// Hooves are a bed under all of it. A limiter on the master catches pile-ups.
export const MIX_DB = {
  // events you should jump at
  gunshot: -30, // was -12, too loud
  boom: -35, // was -13, too loud
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
  cheer: -30, // a medium swell on an overtake. a recording
  cheerBig: -26, // the big one at the gun and for the winner. a recording. still under the gun at -21
  bed: -35, // the constant crowd under the race. a 17.5 s recording loop. the game rides it 0.5 to 1
  bedAlt: -40, // a second, shorter loop (7.2 s) under the first, so the repeat is hard to hear
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
