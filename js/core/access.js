// Accessibility settings (Settings > Accessibility), read live by the systems they soften:
//   calm    reduced flashing: no white flash on a shift, hits and lightning barely tint the screen, half the
//           speed streaks, no HUD flash (renderer.js, racer.js, speedlines.js, css body.calm)
//   shake   screen shake: 1 full, 0.35 low, 0 off (camera.js shakeScale, set on each race's cameras)
//   shapes  a shape for each world, so they read without telling red from blue: ▲ red, ● blue, ◆ the overlap,
//           on walls and blocks (track.js), lens-only road edges, the lens chips and signs (css body.shapes)
//   keys    the remapped solo keyboard keys (input.js applyKeymap)

import { storage } from './util.js';
import { applyKeymap } from './input.js';

export const ACCESS = { calm: false, shake: 1, shapes: false, keys: {}, ...storage.get('rs.access', {}) };

export function saveAccess() {
  storage.set('rs.access', ACCESS);
  applyAccess();
}

// Apply what lives outside the systems that read ACCESS each frame.
export function applyAccess(race = null) {
  document.body.classList.toggle('calm', !!ACCESS.calm);
  document.body.classList.toggle('shapes', !!ACCESS.shapes);
  applyKeymap(ACCESS.keys);
  if (race) for (const c of race.cams || []) c.shakeScale = ACCESS.shake;
  if (race?.world?.shapeCues) for (const o of race.world.shapeCues) o.visible = !!ACCESS.shapes;
}
