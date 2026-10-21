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

## Play

Click or type. `1`-`8` pick horses (while the Name box is active), `Tab` moves
between boxes, `Enter` places the bet, `Ctrl+Z` undoes, `F5` starts the race,
`F9` mutes, `F11` or `Alt+Enter` goes fullscreen.
Add `?secret` to the url for the exploding-horses mode.

## Edit the game

- Horses: `public/js/roster_raw.js`
- Race card: `public/js/race_card.js`
- Horses per race, races per card, speeds, sound mix: `public/js/settings.js`

## Layout

Honest code (no DOM, no canvas): `race.js`, `betting.js`, `track.js` geometry,
`crowd.js` build + passes, `horses_data.js`, `race_card.js`. These are tested.
`test/reference.json` is numbers frozen from the original pygame version, so the
port is checked against it. That Python code is in git history at `6d61b31`.

Dishonest edge: `game.js` (state machine + all six screens on one 1280x720
canvas), `sounds.js` (WebAudio), `main.js` (loop).

Design notes are in `BUILD_PLAN.txt`. What's next is in `TASKS.txt`.

## Known gaps

- Bets live in memory. A reload loses the card. The browser asks first.
- Text boxes are drawn on the canvas, so no phone keyboard. Desktop only.
- Safari and ogg: if the hoof recordings don't decode, it falls back to a
  synthesized thud. Only tested in Chromium.

Hoof sounds are Kenney Impact Sounds (CC0). See
`public/assets/sounds/KENNEY_LICENSE.txt`.
