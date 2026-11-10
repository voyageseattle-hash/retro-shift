// 15 DYSON SPHERE: a shell built round a star. One long lap: off the line on the dark outside of the shell, over the
// rim of an opening and down its throat, a whole orbit of the inside under the star (with three dives off the shell
// toward it), and out over the rim of a second opening to the line.
//
// The physics drives a flat road like every other course; the road you see is that road rolled out over the shell
// (curved.js, dyson-shape.js). The layout is the walk in dyson-walk.js.

import * as THREE from '../../vendor/three.js';
import { M } from './shift.js';
import { walk, rollMain, rollBranch, R, STAR, UC, COLLAR } from './dyson-shape.js';
import { segments } from './dyson-walk.js';
import { dysonArt } from './dyson-art.js';

const W = walk(segments());
const mark = (name) => W.marks.find((m) => m.seg.name === name);
// the lap fraction `t` of the way through a named piece of the walk
const U = (name, t = 0) => {
  const m = mark(name);
  return ((m.d0 + (m.d1 - m.d0) * t) / W.length) % 1;
};

const wall = (at, mask) => ({ type: 'wall', at, mask });
const gate = (at, mask, lat) => ({ type: 'gate', at, mask, lat });
const block = (at, lat, mask, size = 3) => ({ type: 'block', at, lat, mask, size });

export const DYSON = {
  id: 'dyson',
  num: '15',
  name: 'DYSON SPHERE',
  blurb: 'One lap of a shell round a star: the dark outside, over the rim, and an orbit of the inside.',
  decor: (world, L, main, rng) => dysonArt(world, L, main, rng, openings(main)),
  seed: 1515,
  laps: 1,
  sun: 0,
  skyPiece: 'none',
  space: true, // no ground, no horizon: the course brings its own sky (env.js)
  fog: [700, 7000],
  noPylons: true,
  points: W.pts,
  curved: {
    lay(world) {
      const miss = rollMain(world.main, W.marks, W.length);
      if (Math.hypot(miss[0], miss[1]) > 0.5) console.warn('dyson: the rolled road misses closing by', miss);
      for (const p of world.paths) if (p !== world.main) rollBranch(world.main, p);
      // for the course map (minimap.js): the sphere, its star and its openings
      world.main.globe = { R, star: STAR, holes: openings(world.main).map((o) => ({ axis: o.axis, r: UC })) };
    },
  },
  walk: W,
  branches: [
    // inside the first bend after the first dive: a red-only line cut across it
    { from: U('in4', 0.25), to: U('in6', 0.12), mask: M.RO, side: -1, lift: 9, label: 'RED CHORD', signed: true },
    // and a blue-only one across the bend before the second
    { from: U('in6', 0.86), to: U('in8', 0.35), mask: M.BO, side: -1, lift: 9, label: 'BLUE CHORD', signed: true },
  ],
  gaps: [
    { at: U('in6', 0.42), len: 44, mask: M.R, noRails: true },
    { at: U('in11b', 0.15), len: 40, mask: M.B, noRails: true },
  ],
  obstacles: [
    wall(U('in6', 0.2), M.B),
    gate(U('in6', 0.62), M.R, -1), gate(U('in6', 0.66), M.B, 1), gate(U('in6', 0.7), M.R, -1), gate(U('in6', 0.74), M.B, 1),
    block(U('in10', 0.3), 0.5, M.R), block(U('in10', 0.45), -0.4, M.B), block(U('in10', 0.6), 0.3, M.R), block(U('in10', 0.75), -0.5, M.B),
    wall(U('in11', 0.5), M.R),
  ],
  boosts: [
    { at: U('grid', 0.5) }, { at: U('out2', 0.3) }, { at: U('out4', 0.2) },
    { at: U('in1', 0.3) }, { at: U('dive1', 0.03) }, { at: U('dive1', 0.5) },
    { at: U('in6', 0.05) }, { at: U('dive2', 0.03) }, { at: U('dive2', 0.5) },
    { at: U('dive3', 0.04) }, { at: U('in13', 0.2) }, { at: U('home1', 0.5) },
  ],
  shards: [
    { at: U('out1', 0.4), n: 3 }, { at: U('in2', 0.3), n: 3, lat: -0.4 }, { at: U('dive1', 0.3), n: 4, gap: 0.004 },
    { at: U('in5', 0.5), n: 3, lat: -0.4 }, { at: U('in7', 0.4), n: 3, lat: -0.4 }, { at: U('dive2', 0.3), n: 4, gap: 0.004 },
    { at: U('in9', 0.2), n: 3 }, { at: U('in12', 0.4), n: 3, lat: -0.3 }, { at: U('home2', 0.3), n: 3 },
  ],
};

// ------------------------------------------------------------------ scenery
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// where each opening is: the middle of its throat, as a direction from the star
function openings(main) {
  const F = main.frames;
  const out = [];
  for (const m of W.marks) {
    if (m.seg.kind !== 'rim') continue;
    const i0 = main.index(m.d0 / W.length);
    const i1 = main.index(m.d1 / W.length);
    const mid = (i0 + i1) >> 1;
    let best = mid;
    const rad = (i) => Math.hypot(F.o[i * 3], F.o[i * 3 + 1], F.o[i * 3 + 2]);
    for (let i = mid - 25; i <= mid + 25; i++) if (Math.abs(rad(i) - R) < Math.abs(rad(best) - R)) best = i;
    const c = V(F.o[best * 3], F.o[best * 3 + 1], F.o[best * 3 + 2]);
    const n = V(F.n[best * 3], F.n[best * 3 + 1], F.n[best * 3 + 2]);
    out.push({ axis: c.addScaledVector(n, UC - COLLAR.TUBE).normalize(), i: best, i0, i1 });
  }
  return out;
}
