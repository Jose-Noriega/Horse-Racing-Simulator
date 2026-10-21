// Entry point. Starts the game loop.
// Add ?secret to the URL to make the last horses blow up.

import { Game } from "./game.js";

const canvas = document.getElementById("game");
const game = new Game(canvas, { secret: new URLSearchParams(location.search).has("secret") });
window.game = game; // handy in the console: watch it work

// A reload mid-card throws away every bet. Ask first. (Hack: no saved state yet.)
window.addEventListener("beforeunload", (e) => {
  if (game.state === "menu" || game.state === "summary") return;
  e.preventDefault();
  e.returnValue = ""; // some browsers only honor this form
});

let last = performance.now();
function loop(now) {
  // Clamp dt. A backgrounded tab would otherwise jump the race straight to the finish.
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
