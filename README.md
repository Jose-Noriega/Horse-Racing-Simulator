# Horse Racing Simulator, web version

Same game as the pygame one in the repo root. Runs in the browser, hosted as a
Cloudflare Worker with static assets. No server code. The race, bets and
payouts all run client side, so the Worker only serves files.

## Run it

    cd web
    npm install
    npm run dev        # http://localhost:8787
    npm test           # JS port vs numbers dumped from the Python version

## Deploy

    npx wrangler login
    npm run deploy     # prints the *.workers.dev url

## Play

Same keys as the desktop game. Click or type. `1`-`8` pick horses (while the
Name box is active), `Tab` moves between boxes, `Enter` places the bet, `Ctrl+Z`
undoes, `F5` starts the race, `F9` mutes, `F11` or `Alt+Enter` goes fullscreen.
Add `?secret` to the url for the exploding-horses mode.

## Edit the game

- Horses: `public/js/roster_raw.js`
- Race card: `public/js/race_card.js`
- Horses per race, races per card, speeds, mix: `public/js/settings.js`

## Layout

Honest code (no DOM, no canvas): `race.js`, `betting.js`, `track.js` geometry,
`crowd.js` build + passes, `horses_data.js`, `race_card.js`. These are
tested against the Python version. If you change the maths in one place, change
it in both, then rerun `python3 web/test/python_reference.py > web/test/reference.json`
from the repo root.

Dishonest edge: `game.js` (state machine + all six screens on one 1280x720
canvas), `sounds.js` (WebAudio), `main.js` (loop).

## Known gaps

- Bets live in memory. A reload loses the card. The browser asks first.
- Text boxes are drawn on the canvas, so no phone keyboard. Desktop only.
- Safari and ogg: if the hoof recordings don't decode, it falls back to a
  synthesized thud.
