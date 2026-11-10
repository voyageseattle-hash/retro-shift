// The storm zones a course lays out (game/storms.js runs them). One storm over each course's first lens-only route,
// two on courses with four or more, in that route's colour: meteors in the red world, lightning in the blue.
// Core Circuit, the first course, keeps clear skies.

import { M } from './shift.js';

export const STORMS = {
  meteor: { mask: M.R, color: 0xff6a3a, warn: 1.1, radius: 5, every: 2.1, name: 'METEOR STORM', hit: 'METEOR' },
  lightning: { mask: M.B, color: 0x8ad8ff, warn: 0.85, radius: 4.2, every: 1.8, name: 'LIGHTNING STORM', hit: 'STRUCK' },
};

export function layStorms(world) {
  const w = world;
  if (w.def.id === 'core' || w.def.noStorms) return [];
  const routes = w.paths.filter((p) => p !== w.main && p.def && !p.def.hatch && (p.def.mask === M.RO || p.def.mask === M.BO));
  return routes.slice(0, routes.length >= 4 ? 2 : 1).map((b) => {
    const kind = b.def.mask === M.RO ? 'meteor' : 'lightning';
    // from just before the fork to the merge, or a fifth of a lap at most
    let span = b.def.to - b.def.from;
    if (span < 0) span += 1;
    return { kind, ...STORMS[kind], branch: b, u0: b.def.from - 0.035, u1: b.def.from + Math.min(span + 0.005, 0.2) };
  });
}
