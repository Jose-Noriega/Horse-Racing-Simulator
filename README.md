# Horse Racing Simulator

A party game. 64 horses, 8 races, 8 horses each. Take names and bets between
races, watch the field run, settle payouts.

Runs in the browser. Hosted as a Cloudflare Worker with static assets. No
server code. The race, bets and payouts all run client side, so the Worker only
serves files.

## Run it

    npm install
    npm run dev        # http://localhost:8787
    npm test

## Deploy

    npx wrangler login
    npm run deploy     # prints the *.workers.dev url

A push to `main` deploys on its own through `.github/workflows/deploy.yml`.
It needs two repo secrets: `CLOUDFLARE_API_TOKEN` (use the "Edit Cloudflare
Workers" token template) and `CLOUDFLARE_ACCOUNT_ID`. Tests run first. A failing
test blocks the deploy.

## Play

Click or type. `1`-`8` pick horses (while the Name box is active), `Tab` moves
between boxes, `Enter` places the bet, `Ctrl+Z` undoes, `F5` starts the race,
`F9` mutes. `F` (any screen but betting), `F11` or `Alt+Enter` goes fullscreen.
On a Mac, F11 is taken by the system, so use `F` or `Option+Enter`.
Exploding-horses mode: type `boom` on the menu screen to toggle it (a faint red
dot shows while it's on), or add `?secret` to the url.

## Edit the game

- Sounds: made in `public/js/synth.js`, levels in `MIX_DB` in `settings.js`.
  Open `/sounds.html` (on the dev server) to click through every sound.

- Horses: `public/js/roster_raw.js`
- Race card: `public/js/race_card.js`
- Horses per race, races per card, speeds, sound mix: `public/js/settings.js`

## Layout

Honest code (no DOM, no canvas): `race.js`, `betting.js`, `track.js` geometry,
`crowd.js` build + passes, `horses_data.js`, `race_card.js`. These are tested.
`test/reference.json` is numbers frozen from the original pygame version, so the
port is checked against it. That Python code is in git history at `6d61b31`.

Dishonest edge: `game.js` (state machine, input, race timing), `sounds.js`
(WebAudio), `main.js` (loop).

The look is all canvas code, no image files. `game.js` only calls into it:
- `art.js` the Flash-style kit (ink outlines, panels, buttons, bubbles, text)
- `characters.js` horses, portraits, the bookie. Each horse gets a hat and a face quirk from its id
- `screens.js` menu, betting, results, summary
- `racefx.js` race and setup screens, announcer quips, confetti, explosions, iris wipe
- `scenery.js` the track and the world around it (cached), crowd gags, blimp
- `fx.js` coins, stamps and the bookie's moods on the betting screen
- `crowd.js` the fans (cached sprites), `sprites.js` stride timing and the starter

Design notes are in `BUILD_PLAN.txt`. What's next is in `TASKS.txt`.

## Known gaps

- Bets live in memory. A reload loses the card. The browser asks first.
- Text boxes are drawn on the canvas, so no phone keyboard. Desktop only.
- Safari and ogg: if the hoof recordings don't decode, it falls back to a
  synthesized thud. Only tested in Chromium.

Hoof sounds are Kenney Impact Sounds (CC0). The crowd is real recordings: most of
it is "Free Crowd Cheering Sounds" by Gregor Quendel (CC BY 4.0,
https://www.gregorquendel.com), plus two CC0 clips from Freesound by
SoundsExciting and stomachache. See `public/assets/sounds/CREDITS.txt`.
