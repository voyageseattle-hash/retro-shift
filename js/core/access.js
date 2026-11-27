// Accessibility settings (Settings > Accessibility), read live by the systems they soften:
//   calm    reduced flashing: no white flash on a shift, hits and lightning barely tint the screen, half the
//           speed streaks, no HUD flash (renderer.js, racer.js, speedlines.js, css body.calm)
//   shake   screen shake: 1 full, 0.35 low, 0 off (camera.js shakeScale, set on each race's cameras)
//   shapes  a shape for each world, so they read without telling red from blue: ▲ red, ● blue, ◆ the overlap,
//           on walls and blocks (track.js), lens-only road edges, the lens chips and signs (css body.shapes)
//   keys    the remapped solo keyboard keys (input.js applyKeymap)
//   view    'classic' or 'comfort': COMFORT is the same world, easier on the eyes over a long session. The road and
//           walls get a dim solid fill to rest the eye on, lines are softer and steadier (no shimmer), the road grid
//           is thinned, distant lines fade out sooner, and the glow, film grain and lens wash are turned down. The
//           colours stay full neon and the lenses hide exactly what they did. (layers.js, track.js, env.js,
//           renderer.js, race.js; takes effect from the next race)

import { storage } from './util.js';
import { applyKeymap } from './input.js';

export const ACCESS = { calm: false, shake: 1, shapes: false, keys: {}, view: 'classic', ...storage.get('rs.access', {}) };
export const comfort = () => ACCESS.view === 'comfort';

export function saveAccess() {
  storage.set('rs.access', ACCESS);
  applyAccess();
}

// Apply what lives outside the systems that read ACCESS each frame.
export function applyAccess(race = null) {
  document.body.classList.toggle('calm', !!ACCESS.calm);
  document.body.classList.toggle('shapes', !!ACCESS.shapes);
  document.body.classList.toggle('comfort', comfort());
  applyKeymap(ACCESS.keys);
  if (race) for (const c of race.cams || []) c.shakeScale = ACCESS.shake;
  if (race?.world?.shapeCues) for (const o of race.world.shapeCues) o.visible = !!ACCESS.shapes;
}
