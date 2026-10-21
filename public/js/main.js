// Entry point. Starts the game loop.
// Add ?secret to the URL to make the last horses blow up.

import { Game } from "./game.js";
import { preloadSoundAssets } from "./sounds.js";
import { preloadMenuTrack } from "./music.js";

const loading = document.getElementById("loading");
const loadingLabel = document.getElementById("loading-label");
const loadingProgress = document.getElementById("loading-progress");
const totalAssets = 22;
let loadedAssets = 0;
await new Promise((resolve) => requestAnimationFrame(resolve));
const updateProgress = () => {
  loadingProgress.max = totalAssets;
  loadingProgress.value = ++loadedAssets;
  loadingLabel.textContent = `Loading... ${loadedAssets}/${totalAssets}`;
};
await Promise.all([
  preloadSoundAssets(updateProgress),
  preloadMenuTrack().then(updateProgress),
]);
loading.hidden = true;

const canvas = document.getElementById("game");
const game = new Game(canvas, { secret: new URLSearchParams(location.search).has("secret") });
window.game = game; // handy in the console: watch it work
game.sounds.setMusicScreen(game.state);
const startOverlay = document.getElementById("start-overlay");
startOverlay.hidden = false;
document.getElementById("start-button").addEventListener("click", () => {
  game.sounds.unlock();
  startOverlay.hidden = true;
});

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
