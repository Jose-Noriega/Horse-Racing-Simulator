"""Game-wide constants for the Horse Racing Simulator."""

# Window
SCREEN_WIDTH = 1280
SCREEN_HEIGHT = 720
FPS = 60
TITLE = "Horse Racing Simulator"

# Roster / card
TOTAL_HORSES = 64
HORSES_PER_RACE = 8
RACES_PER_SESSION = 8

# Back-compat alias used by track layout
NUM_HORSES = HORSES_PER_RACE

# Track layout (used once animation is wired up)
TRACK_MARGIN_TOP = 80
TRACK_MARGIN_BOTTOM = 40
TRACK_START_X = 80
TRACK_FINISH_X = SCREEN_WIDTH - 120
LANE_HEIGHT = (SCREEN_HEIGHT - TRACK_MARGIN_TOP - TRACK_MARGIN_BOTTOM) // NUM_HORSES

# Race feel (~1.25 minutes once animation is tuned)
TARGET_RACE_SECONDS = 75.0

# Gaussian noise around average_speed when simulating a race.
# Higher = more upsets / closer to a toss-up field.
SPEED_SIGMA = 12.0
# Softmax temperature for displayed win / parlay probabilities.
# Higher = flatter probabilities (favorites less dominant).
PROB_TEMPERATURE = 10.0

# Colors (R, G, B)
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GRAY = (120, 120, 120)
DARK_GRAY = (40, 40, 40)
LIGHT_GRAY = (200, 200, 200)
GREEN = (34, 139, 34)
RED = (200, 40, 40)
GOLD = (218, 165, 32)
PANEL = (55, 55, 55)

# Lane / display colors (cycled for the 8 starters)
HORSE_COLORS = [
    (220, 50, 50),    # red
    (50, 100, 220),   # blue
    (40, 160, 70),    # green
    (230, 160, 40),   # orange
    (150, 60, 180),   # purple
    (40, 170, 180),   # teal
    (220, 80, 140),   # pink
    (90, 90, 90),     # gray
]

# UI
FONT_SIZE_TITLE = 48
FONT_SIZE_LARGE = 32
FONT_SIZE_MEDIUM = 24
FONT_SIZE_SMALL = 18
