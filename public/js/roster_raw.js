// ============================================================================
//  THE ROSTER: 65 horses
// ============================================================================
//
// One line per horse. A line looks like this:
//
//   ["Doom", 92.75, "black", "sunglasses", "tongue", "front runner"],
//     name   speed  coat     hat           face      running style
//
// Everything about a horse lives on its own line. Move a line, and the horse
// keeps its coat, hat, face and running style. Only its id changes (an id is
// just the line number, counting from 0), and players never see ids.
//
// Each race, the game shuffles the whole roster and deals horses out.
// So the order of this list does not decide who races whom.
//
// Every word in quotes below must match the lists in this comment exactly,
// spelling and capitals included. A typo stops the game from loading, and
// the error names the horse and the bad word.
//
// ----------------------------------------------------------------------------
//  1. NAME
// ----------------------------------------------------------------------------
//   Any text, 3 to 40 letters. Must be different from every other horse.
//   Short names show best. Long ones shrink to fit, then get cut with "...".
//
// ----------------------------------------------------------------------------
//  2. SPEED
// ----------------------------------------------------------------------------
//   A number. Higher is faster. Roughly 65 to 100 is the useful range.
//   It sets the horse's chance to win, and that chance sets the odds.
//   Only the gaps between horses matter, not the numbers themselves.
//
//   The game pulls every speed toward the roster average first
//   (SPEED_COMPRESSION in settings.js, now 0.7), so the odds stay fun.
//   After that, a 10 point gap in speed is worth about 2x in win weight.
//   A 100 and a 90 in the same race: the 100 is roughly twice as likely
//   to win as the 90.
//
// ----------------------------------------------------------------------------
//  3. COAT: the horse's body color
// ----------------------------------------------------------------------------
//   The colors are defined in COAT_COLORS in settings.js. Add a new one there
//   and it is ready to use here.
//
//   Real coats:
//     "bay"          warm brown
//     "dark bay"     deep brown
//     "chestnut"     red brown
//     "liver"        very dark red brown
//     "black"        near black (the mane turns light so it still shows)
//     "grey"         medium grey
//     "dapple grey"  darker blue grey
//     "white"        near white
//     "palomino"     golden yellow
//     "buckskin"     tan gold
//     "dun"          sandy tan
//     "cream"        pale cream
//     "roan"         dusty rose brown
//     "blue roan"    slate blue grey
//     "champagne"    pale tan
//     "sorrel"       bright copper
//   Silly coats:
//     "mint"         pale green
//     "lavender"     soft purple
//     "gold"         bright gold
//     "bubblegum"    pink
//   Not from nature:
//     "steel"            metal blue grey. Robots wear this
//     "alien green"      bright green
//   One with its own mane:
//     "flaxen chestnut"  red brown body with a pale cream mane and tail. This is
//                        Epona's coat from the Zelda games. Normal coats get an
//                        automatic mane (light on a dark coat, dark on a light
//                        one). To give a coat its own mane, add it to MANE_COLORS
//                        in settings.js
//
//   The coat is only the horse. The rider's color is a different thing.
//   Riders get a fresh color every race (ACCENT_COLORS in settings.js), and
//   no two horses in one race share it. That color is the horse's color on
//   the bet screen, and it is what the crowd wears. You don't set it here.
//
// ----------------------------------------------------------------------------
//  4. HAT: what sits on the horse's head
// ----------------------------------------------------------------------------
//   "sunglasses"   dark shades
//   "tophat"       tall black hat
//   "mustache"     big curled mustache
//   "bandana"      cloth tied around the head, tails flapping
//   "helmet"       a small round helmet
//   "partyhat"     pointy party cone
//   "monocle"      one round lens on a chain
//   "bowtie"       pink bow tie at the neck
//   "flower"       white flower with a gold middle
//   "crown"        gold crown with a red jewel
//   "propeller"    beanie with a spinning propeller
//   "chef"         tall puffy white chef hat
//   "cowboy"       tan cowboy hat
//   "headband"     orange sweatband with a trailing tail
//   Beard and wigs:
//   "beard"        big ginger beard from the cheek to the chin, with a bumpy bottom
//   "wig"          white powdered wig with curls and a little black bow
//   "clownwig"     big puffs in rainbow clown colors, plus a red clown nose
//   Fantasy and machine:
//   "wizard"       tall purple pointed hat with stars
//   "unicorn"      a spiral horn on the forehead
//   "antennae"     two wobbling antennae with a red and a green tip
//   "cyborg"       a metal plate over the back of the head, with a red light
//   "none"         no hat at all. For plain, wild-looking horses
//
//   Two horses can wear the same hat. There are 22 hats and 65 horses. The fantasy and machine ones are on purpose rare.
//
// ----------------------------------------------------------------------------
//  5. FACE: the horse's expression
// ----------------------------------------------------------------------------
//   "tongue"       tongue hanging out and wagging
//   "goofy"        big eyes that wander side to side
//   "buckteeth"    two big front teeth
//   "lashes"       long eyelashes
//   "grin"         wide open grin with teeth
//   "none"         a plain face
//   "glowing"      red glowing eyes and an angry brow. Spooky
//   "alien"        one huge slanted black eye with a shine
//   "visor"        a dark robot visor with a red light that sweeps back and forth
//   "hollow"       completely black empty eyes. No white, no pupil. Very rare, very scary
//   "vortex"       a purple and a green spiral turning in a dark eye. For the physics horses
//
//   The face is the horse's resting look. In a race the mood still changes it
//   (happy, scared, dizzy and so on), but the quirk stays.
//
// ----------------------------------------------------------------------------
//  6. RUNNING STYLE: how the horse paces itself
// ----------------------------------------------------------------------------
//   Style never changes who is faster overall. Speed (2) decides the finish
//   order. Style decides how the race looks: who leads early, who charges at
//   the end, who gets passed. Each race a horse's pace still wobbles a bit.
//
//   The numbers are in PACE_STYLES in settings.js:
//     style      -1 = fast start, fades late.   +1 = slow start, strong finish.
//     lateKick   extra burst in the last stretch. 0 = none. 0.8 = a lot.
//
//   "front runner"  style -0.9  kick 0.10   bolts out front, then tires
//   "pace setter"   style -0.6  kick 0.25   leads for most of the race
//   "stalker"       style -0.3  kick 0.50   sits just behind, then challenges
//   "steady"        style  0.0  kick 0.35   even pace the whole way
//   "late mover"    style +0.3  kick 0.70   speeds up through the middle
//   "closer"        style +0.6  kick 0.45   waits at the back, then comes on
//   "deep closer"   style +0.9  kick 0.80   last off the line, first to the wire
//   "plodder"       style +0.2  kick 0.15   slow all the way, no big finish
//
// ----------------------------------------------------------------------------
//  7. BODY (optional, goes last, most horses leave it off)
// ----------------------------------------------------------------------------
//   ["The Goose", 69.0, "white", "bowtie", "goofy", "deep closer", "duck"],
//
//   Leave it off and the horse is a horse. Otherwise the head changes and a few
//   details are added. The legs, rider, saddle cloth and race color stay the same.
//   "duck"   round head, flat orange bill, orange legs and webbed feet, a wing and
//            three tail feathers. No mane. Looks best on a yellow, white or grey coat.
//   "cow"    side ears, small horns, a big pink muzzle, spots (dark on a light coat,
//            darker on a dark coat) and a thin tail with a tuft. No mane.
//   More are easy to add. See BODIES in settings.js and drawHead in characters.js.
//
// ----------------------------------------------------------------------------
//  The list
// ----------------------------------------------------------------------------
//   Keep the commas and quotes. Spaces are only there to line things up.
//   Add a horse by adding a line. If you change how many horses there are,
//   also check TOTAL_HORSES in settings.js and the roster count in
//   test/words.test.js.
//
export const ROSTER_RAW = [
  ["Doom",                            100.0, "black",           "none",       "hollow",    "front runner"],
  ["horse of suspicion and distrust",  99.8, "dapple grey",     "monocle",    "none",      "stalker"],
  ["Horsey McHorseface",               99.5, "bay",             "wig",        "grin",      "pace setter"],
  ["Kevin Costner",                    99.0, "buckskin",        "cowboy",     "none",      "steady"],
  ["Panopticon",                       98.5, "blue roan",       "wizard",     "goofy",     "stalker"],
  ["Friday",                           98.0, "palomino",        "partyhat",   "grin",      "late mover"],
  ["The Old Colonel",                  97.5, "grey",            "wig",        "buckteeth", "steady"],
  ["Duke Of Carpet",                   97.0, "sorrel",          "wig",        "grin",      "pace setter"],
  ["Static Void",                      96.5, "black",           "cyborg",     "vortex",    "deep closer"],
  ["Infinite Jest",                    96.0, "bubblegum",       "clownwig",   "tongue",    "pace setter"],
  ["Xorse",                            95.5, "gold",            "sunglasses", "grin",      "front runner"],
  ["Nucleophilic Attack",              95.0, "mint",            "helmet",     "vortex",    "front runner"],
  ["Passing Wind",                     94.5, "cream",           "propeller",  "goofy",     "late mover"],
  ["Andromeda",                        94.0, "lavender",        "unicorn",    "vortex",    "pace setter"],
  ["Shutthefrontdoor",                 93.5, "dark bay",        "beard",      "none",      "stalker"],
  ["RMS Titanic",                      93.0, "grey",            "bowtie",     "lashes",    "plodder"],
  ["One in a Krillion",                92.5, "bubblegum",       "bandana",    "lashes",    "steady"],
  ["Nazgûl",                           92.0, "black",           "helmet",     "glowing",   "front runner"],
  ["Inside A Cup",                     91.5, "chestnut",        "chef",       "grin",      "steady"],
  ["Left Shoe",                        91.0, "dun",             "headband",   "goofy",     "plodder"],
  ["Beige Flash",                      90.5, "cream",           "headband",   "lashes",    "front runner"],
  ["Ceiling Fan",                      90.0, "white",           "propeller",  "tongue",    "late mover"],
  ["Tile 62",                          89.5, "champagne",       "mustache",   "buckteeth", "stalker"],
  ["Xenobiotic",                       89.0, "alien green",     "antennae",   "alien",     "deep closer"],
  ["Megalopolis",                      88.5, "dapple grey",     "tophat",     "buckteeth", "pace setter"],
  ["It Followed Me",                   88.0, "liver",           "bandana",    "goofy",     "stalker"],
  ["Who Let Him In",                   87.5, "chestnut",        "partyhat",   "grin",      "pace setter"],
  ["The Abyss",                        87.0, "liver",           "helmet",     "hollow",    "deep closer"],
  ["Lowkenuine",                       86.5, "roan",            "beard",      "lashes",    "steady"],
  ["Wavefunction",                     86.0, "blue roan",       "wizard",     "vortex",    "late mover"],
  ["Door Is Open",                     85.5, "palomino",        "flower",     "grin",      "closer"],
  ["Don't Look Up",                    85.0, "bubblegum",       "flower",     "goofy",     "deep closer"],
  ["Uh, Horses",                       84.5, "cream",           "clownwig",   "lashes",    "plodder"],
  ["horse_final_v2",                   84.0, "steel",           "cyborg",     "visor",     "closer"],
  ["IMG_4471",                         83.5, "steel",           "antennae",   "visor",     "stalker"],
  ["untitled (2)",                     83.0, "steel",           "antennae",   "visor",     "late mover"],
  ["Horsw",                            82.5, "bay",             "bowtie",     "goofy",     "stalker"],
  ["Dark Matter",                      82.0, "black",           "none",       "vortex",    "deep closer"],
  ["copy of horse",                    81.5, "steel",           "cyborg",     "visor",     "stalker"],
  ["Gregory",                          81.0, "chestnut",        "wizard",     "grin",      "closer"],
  ["final FINAL",                      80.5, "dun",             "crown",      "buckteeth", "closer"],
  ["Wet Bread",                        80.0, "buckskin",        "chef",       "tongue",    "plodder"],
  ["Eleven Frogs",                     79.5, "mint",            "chef",       "tongue",    "late mover"],
  ["Soup Again",                       79.0, "gold",            "chef",       "tongue",    "closer"],
  ["Toenail",                          78.5, "champagne",       "monocle",    "buckteeth", "closer"],
  ["Epona",                            78.0, "flaxen chestnut", "none",       "none",      "front runner"],
  ["Ten Thousand Dollars",             77.5, "gold",            "tophat",     "grin",      "steady"],
  ["Warm Gravy",                       77.0, "sorrel",          "chef",       "tongue",    "deep closer"],
  ["slug",                             76.5, "roan",            "propeller",  "tongue",    "plodder"],
  ["Unforgettable",                    76.0, "white",           "unicorn",    "lashes",    "steady"],
  ["Please Stay",                      75.5, "lavender",        "flower",     "lashes",    "closer"],
  ["Her Majesty",                      75.0, "white",           "crown",      "lashes",    "pace setter"],
  ["Fourteen Dads",                    74.5, "dark bay",        "mustache",   "grin",      "steady"],
  ["Who Is He",                        74.0, "alien green",     "none",       "alien",     "late mover"],
  ["Mud",                              73.5, "liver",           "beard",      "tongue",    "plodder"],
  ["Bodacious",                        73.0, "liver",           "cowboy",     "tongue",    "front runner", "cow"],
  ["Closed Fridays",                   72.5, "dapple grey",     "crown",      "lashes",    "plodder"],
  ["Please Feed Me",                   72.0, "dark bay",        "bandana",    "tongue",    "deep closer"],
  ["Four Pigeons",                     71.5, "grey",            "none",       "none",      "pace setter",  "duck"],
  ["gjhgfhj",                          71.0, "lavender",        "clownwig",   "goofy",     "closer"],
  ["Horse (Real)",                     70.5, "white",           "none",       "none",      "steady",       "cow"],
  ["Hell Hath No Fury",                70.0, "sorrel",          "cowboy",     "glowing",   "front runner"],
  ["Dog (Horse)",                      69.5, "dun",             "bandana",    "tongue",    "late mover"],
  ["The Goose",                        69.0, "white",           "bowtie",     "goofy",     "deep closer",  "duck"],
  ["Colin",                            68.5, "blue roan",       "cowboy",     "grin",      "plodder"],
];
