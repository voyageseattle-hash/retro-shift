// The ten courses from the Retro Shift concept sheets. Each one is a closed main loop (x, z, y control points) plus
// branches, gaps, walls, obstacle fields, boost pads and SHIFT shards, every piece tagged with the worlds it's
// solid in (shift.js): M.R red world, M.B blue world, M.RO / M.BO a single lens only, M.X the overlap only.
//
// Features are placed with P(k, t): the fraction of the lap at control point k (plus t of the way to k + 1).

import { M } from './shift.js';
import { DYSON } from './dyson.js';

function fractions(points) {
  const d = [0];
  for (let i = 1; i <= points.length; i++) {
    const a = points[i - 1];
    const b = points[i % points.length];
    d.push(d[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] || 0) - (a[2] || 0)));
  }
  const L = d[d.length - 1];
  return (k, t = 0) => {
    const i = ((k % points.length) + points.length) % points.length;
    return ((d[i] + (d[i + 1] - d[i]) * t) / L) % 1;
  };
}

// Small builders for repeated patterns.
const wall = (at, mask) => ({ type: 'wall', at, mask });
const gate = (at, mask, lat) => ({ type: 'gate', at, mask, lat });
const block = (at, lat, mask, size = 3) => ({ type: 'block', at, lat, mask, size });
function field(at, len, n, seed, masks = [M.R, M.B]) {
  const out = [];
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < n; k++) out.push(block(at + (len * (k + 0.5)) / n, (r() - 0.5) * 1.5, masks[k % masks.length], 2.4 + r() * 1.6));
  return out;
}
function chicane(at, step, n, maskA = M.R, maskB = M.B) {
  const out = [];
  for (let k = 0; k < n; k++) out.push(gate(at + k * step, k % 2 ? maskB : maskA, k % 2 ? 1 : -1));
  return out;
}

function make(def) {
  const P = fractions(def.points);
  const f = def.features(P);
  return { ...def, ...f, features: undefined };
}

export const TRACKS = [
  // ------------------------------------------------------------------ 01
  make({
    id: 'core',
    num: '01',
    name: 'CORE CIRCUIT',
    blurb: 'Clean, classic, and fast. Learn the shift.',
    decor: 'core',
    seed: 11,
    laps: 3,
    sun: 0,
    points: [
      [0, 0, 0], [0, 200, 0], [20, 320, 2], [110, 390, 6], [240, 380, 8], [320, 300, 8], [300, 190, 6], [230, 150, 4],
      [230, 70, 2], [320, 10, 4], [350, -120, 8], [270, -230, 6], [120, -250, 2], [20, -150, 0],
    ],
    features: (P) => ({
      branches: [
        { from: P(5, 0.2), to: P(9, 0.1), mask: M.BO, side: 1, lift: 7, label: 'BLUE SHORTCUT' },
        // the form routes (formroutes.js): a gap only the Skimmer glides, and a wall only the Blade rides
        { from: P(1, 0.55), to: P(4, 0.15), mask: M.ALL, side: -1, lift: 2, label: 'GLIDE GAP', sub: 'BLUE FLOATS IT', profile: [{ at: 0.5, kind: 'step', drop: 3.5, len: 55, end: 0.82 }] },
        { from: P(10, 0.8), to: P(13, 0.6), mask: M.ALL, side: -1, lift: 9, label: 'WALL RUN', sub: 'RED CLINGS · OTHERS FALL', wallrun: { from: 0.28, to: 0.78, bank: 0.95 } },
      ],
      profile: [{ at: P(7, 0.15), kind: 'drop', depth: 9, down: 24, up: 115 }],
      gaps: [{ at: P(10, 0.3), len: 46, mask: M.R, noRails: true }, { path: 'b1', at: 0.5, len: 50, glide: true, noRails: true }],
      obstacles: [wall(P(1, 0.45), M.B), wall(P(3, 0.3), M.R), ...field(P(11, 0.1), 0.05, 6, 3)],
      boosts: [{ at: P(0, 0.5), lat: 0 }, { at: P(7, 0.6), lat: -0.4 }, { at: P(12, 0.2), lat: 0.4, mask: M.RO }, { at: P(13, 0.4), mask: M.RO }, { path: 'b1', at: 0.8 }],
      shards: [{ at: P(1, 0.15), lat: 0, n: 3 }, { at: P(6, 0.3), lat: -0.4, n: 3 }, { at: P(12, 0.6), lat: 0, n: 3, mask: M.B }],
      tips: [
        { at: P(1, 0.25), text: 'GLIDE GAP ON THE LEFT: ONLY THE BLUE SKIMMER FLOATS IT', key: 'blue' },
        { at: P(5, 0.0), text: 'A BLUE-ONLY SHORTCUT ON THE RIGHT: SHIFT TO BLUE', key: 'blue' },
        { at: P(10, 0.1), text: 'RED BRIDGE: DON’T BE IN BLUE', key: 'both' },
        { at: P(10, 0.5), text: 'WALL RUN ON THE LEFT: ONLY THE RED BLADE RIDES IT', key: 'red' },
      ],
    }),
  }),

  // ------------------------------------------------------------------ 02
  make({
    id: 'layered',
    num: '02',
    name: 'LAYERED GRID',
    blurb: 'Multi-level tracks with overlapping routes and hidden cuts.',
    decor: 'layered',
    seed: 22,
    laps: 3,
    sun: 1,
    points: [
      [0, 0, 0], [0, 180, 6], [60, 300, 16], [180, 330, 22], [300, 280, 22], [330, 160, 16], [260, 60, 8], [140, 40, 2],
      [60, -40, 0], [80, -170, 6], [200, -230, 14], [330, -200, 18], [380, -80, 12], [300, -20, 6], [160, -100, 2], [40, -120, 0],
    ],
    features: (P) => ({
      branches: [
        { from: P(1, 0.6), to: P(5, 0.3), mask: M.RO, side: 1, lift: 18, label: 'RED OVERPASS' },
        { from: P(9, 0.2), to: P(13, 0.2), mask: M.BO, side: -1, lift: 10, label: 'BLUE-ONLY CUT' },
        // the form routes (formroutes.js): off the top deck, a gap only the Skimmer glides; down the far side, a wall
        // only the Blade rides
        { from: P(2, 0.3), to: P(4, 0.7), mask: M.ALL, side: -1, lift: 4, label: 'GLIDE GAP', sub: 'BLUE FLOATS IT', profile: [{ at: 0.5, kind: 'step', drop: 3.5, len: 55, end: 0.82 }] },
        { from: P(10, 0.3), to: P(12, 0.8), mask: M.ALL, side: 1, lift: 8, label: 'WALL RUN', sub: 'RED CLINGS · OTHERS FALL', wallrun: { from: 0.28, to: 0.76, bank: 0.95 } },
      ],
      gaps: [{ at: P(6, 0.2), len: 40, mask: M.B, noRails: true }, { path: 'b2', at: 0.5, len: 48, glide: true, noRails: true }],
      obstacles: [...chicane(P(3, 0.1), 0.012, 4), wall(P(7, 0.5), M.R), ...field(P(10, 0.2), 0.06, 8, 7)],
      boosts: [{ at: P(0, 0.4) }, { at: P(8, 0.5), lat: 0.5, mask: M.BO }, { at: P(12, 0.3), mask: M.RO, lat: -0.4 }, { at: P(14, 0.3), mask: M.RO }, { path: 'b2', at: 0.8 }, { path: 'b3', at: 0.85 }],
      shards: [{ at: P(2, 0.2), n: 3 }, { at: P(8, 0.2), lat: -0.4, n: 3 }, { at: P(15, 0.2), n: 3, mask: M.R }],
    }),
  }),

  // ------------------------------------------------------------------ 03
  make({
    id: 'tunnels',
    num: '03',
    name: 'SHIFT TUNNELS',
    blurb: 'Geometric tunnels that reconfigure between worlds.',
    decor: 'tunnels',
    seed: 33,
    laps: 3,
    sun: 2,
    points: [
      [0, 0, 0], [30, 220, 0], [-20, 420, 4], [80, 560, 10], [240, 580, 12], [360, 470, 8], [330, 300, 4], [400, 160, 2],
      [380, -40, 6], [260, -140, 8], [100, -170, 4], [20, -100, 0],
    ],
    features: (P) => ({
      branches: [
        { from: P(5, 0.4), to: P(8, 0.3), mask: M.RO, side: -1, lift: 4, bulge: -20, label: 'RED BORE' },
        // the secret one: red-only, behind a hatch, around the block field
        // (leaves from inside the third tunnel, skips the overlap-only gap and the block field)
        { from: 830 / 1007, to: 960 / 1007, mask: M.RO, side: 1, lift: 3, label: 'SECRET BORE', hatch: true, shards: [{ at: 0.3 }, { at: 0.55 }, { at: 0.8 }] },
        // the form routes (formroutes.js): outside the tunnels past both lens gaps, a gap only the Skimmer glides; and
        // a narrow line past the blue wall through a slit only the Blade fits
        { from: P(2, 0.1), to: P(4, 0.3), mask: M.ALL, side: -1, lift: 5, label: 'GLIDE GAP', sub: 'BLUE FLOATS IT', profile: [{ at: 0.5, kind: 'step', drop: 3.5, len: 55, end: 0.82 }] },
        { from: P(6, 0.3), to: P(8, 0.0), mask: M.ALL, side: 1, lift: 3, label: 'THE SLIT', sub: 'ONLY THE RED BLADE FITS' },
      ],
      // the FULL PIPE (warp.js): the road curls up into a tube; the Blade rides its walls and roof, past the floor's boost
      pipes: [{ at: P(1, 0.04), len: 175, ramp: 26 }],
      gaps: [
        { at: P(2, 0.3), len: 34, mask: M.R, noRails: true },
        { at: P(3, 0.5), len: 34, mask: M.B, noRails: true },
        { at: P(9, 0.4), len: 30, mask: M.X, noRails: true },
        { path: 'b2', at: 0.5, len: 48, glide: true, noRails: true },
      ],
      obstacles: [...chicane(P(0, 0.4), 0.01, 6), wall(P(6, 0.2), M.B), ...field(P(10, 0.1), 0.05, 6, 11), { type: 'slit', path: 'b3', at: 0.5 }],
      boosts: [{ at: P(1, 0.6) }, { at: P(7, 0.2), mask: M.BO }, { at: P(11, 0.3) }, { at: P(6, 0.7), mask: M.BO }, { at: P(1, 0.45), lat: 2.95, mask: M.RO }, { at: P(1, 0.45), lat: -2.95, mask: M.RO }, { path: 'b2', at: 0.8 }, { path: 'b3', at: 0.72 }],
      shards: [{ at: P(1, 0.1), n: 4 }, { at: P(5, 0.1), n: 3, lat: 0.4 }, { at: P(8, 0.6), n: 3, mask: M.B }, { at: P(1, 0.25), lat: 2.2, n: 3, gap: 0.004, mask: M.RO }, { at: P(1, 0.3), lat: -2.6, n: 3, gap: 0.004, mask: M.RO }],
      tips: [{ at: P(0, 0.85), text: 'FULL PIPE AHEAD: THE RED BLADE RIDES THE WALLS AND ROOF', key: 'red' }],
    }),
  }),

  // ------------------------------------------------------------------ 04
  make({
    id: 'orbital',
    num: '04',
    name: 'ORBITAL LOOPS',
    blurb: 'Large, open spaces with intertwined loops.',
    decor: 'orbital',
    seed: 44,
    laps: 3,
    sun: 1,
    points: [
      [0, 0, 10], [0, 220, 18], [-120, 360, 30], [-260, 300, 38], [-280, 140, 30], [-160, 80, 22], [-60, 160, 30], [-80, 300, 44],
      [60, 420, 50], [260, 380, 40], [330, 220, 28], [260, 60, 20], [300, -120, 16], [160, -240, 12], [20, -160, 10],
    ],
    features: (P) => ({
      branches: [
        { from: P(1, 0.5), to: P(8, 0.2), mask: M.BO, side: 1, lift: 14, label: 'BLUE SKYWAY' },
        { from: P(10, 0.5), to: P(13, 0.3), mask: M.RO, side: 1, lift: 6, bulge: 30, label: 'RED-ONLY ORBIT' },
        // the form routes (formroutes.js): a leap between the outer loops only the Skimmer glides, and a narrow line
        // inside the last bend through a slit only the Blade fits
        { from: P(8, 0.2), to: P(10, 0.2), mask: M.ALL, side: -1, lift: 6, label: 'GLIDE GAP', sub: 'BLUE FLOATS IT', profile: [{ at: 0.5, kind: 'step', drop: 3.5, len: 55, end: 0.82 }] },
        { from: P(11, 0.7), to: P(13, 0.7), mask: M.ALL, side: -1, lift: 3, label: 'THE SLIT', sub: 'ONLY THE RED BLADE FITS' },
      ],
      gaps: [{ at: P(5, 0.0), len: 50, mask: M.R, noRails: true }, { at: P(11, 0.3), len: 40, mask: M.B, noRails: true }, { path: 'b2', at: 0.5, len: 52, glide: true, noRails: true }],
      obstacles: [{ type: 'slit', path: 'b3', at: 0.5 }, wall(P(3, 0.3), M.B), ...field(P(8, 0.4), 0.06, 7, 19), block(P(14, 0.3), -0.5, M.R, 4), block(P(14, 0.35), 0.5, M.B, 4)],
      boosts: [{ at: P(0, 0.3) }, { at: P(6, 0.5) }, { at: P(9, 0.5), mask: M.RO }, { at: P(12, 0.5), mask: M.BO }, { path: 'b2', at: 0.8 }, { path: 'b3', at: 0.72 }],
      shards: [{ at: P(2, 0.2), n: 3 }, { at: P(7, 0.3), n: 3 }, { at: P(13, 0.5), n: 3, mask: M.B }],
    }),
  }),

  // ------------------------------------------------------------------ 05
  make({
    id: 'city',
    num: '05',
    name: 'GRID CITY',
    blurb: 'A dense neon metropolis with shifting infrastructure.',
    decor: 'city',
    seed: 55,
    laps: 3,
    sun: 0,
    halfWidth: 9,
    points: [
      [0, 0, 0], [0, 160, 0], [10, 200, 0], [120, 210, 4], [160, 220, 4], [170, 340, 8], [180, 380, 8], [300, 390, 8],
      [340, 380, 6], [350, 240, 4], [360, 200, 4], [470, 190, 2], [500, 170, 2], [500, 20, 0], [480, -20, 0], [340, -30, 4],
      [300, -40, 4], [290, -160, 8], [270, -200, 8], [120, -200, 4], [80, -190, 2], [20, -140, 0],
    ],
    features: (P) => ({
      branches: [
        { from: P(1, 0.4), to: P(8, 0.45), mask: M.RO, side: 1, lift: 16, label: 'RED SKYBRIDGE' },
        { from: P(12, 0.25), to: P(16, 0.5), mask: M.BO, side: 1, lift: 12, label: 'BLUE FLYOVER' },
        { from: P(5, 0.6), to: P(7, 0.6), mask: M.BO, side: -1, lift: 14, label: 'BLUE ROOFTOPS', facade: M.R, shards: [{ at: 0.36 }, { at: 0.64 }] },
        // the form route (formroutes.js): the red line past the blue bridge, through a slit only the Blade fits
        { from: P(16, 0.7), to: P(21, 0.2), mask: M.ALL, side: -1, lift: 3, label: 'THE SLIT', sub: 'ONLY THE RED BLADE FITS' },
      ],
      gaps: [{ at: P(9, 0.2), len: 36, mask: M.R, noRails: true }, { at: P(19, 0.1), len: 36, mask: M.B, noRails: true }],
      profile: [{ at: P(12, 0.45), kind: 'crest', height: 3, len: 70 }],
      water: [{ at: P(10, 0.35), len: 60 }],
      obstacles: [
        ...field(P(3, 0.1), 0.03, 6, 23), wall(P(5, 0.4), M.B), ...chicane(P(13, 0.2), 0.012, 4),
        { type: 'block', at: P(15, 0.5), lat: 0, mask: M.R, size: 4, sweep: 0.6 },
        { type: 'block', at: P(16, 0.5), lat: 0, mask: M.B, size: 4, sweep: 0.6, phase: 2 },
        { type: 'slit', path: 'b3', at: 0.5 },
      ],
      boosts: [{ at: P(0, 0.4) }, { at: P(10, 0.5), lat: 0.4 }, { at: P(18, 0.6), mask: M.BO }, { at: P(20, 0.5), mask: M.BO }, { path: 'b3', at: 0.72 }],
      shards: [{ at: P(2, 0.4), n: 3 }, { at: P(11, 0.4), n: 3 }, { at: P(16, 0.1), n: 3, mask: M.R }],
      // heavy traffic (game/traffic.js) all round the loop, signed just past the line
      traffic: { n: 18, at: P(0, 0.6) },
    }),
  }),

  // ------------------------------------------------------------------ 06
  make({
    id: 'void',
    num: '06',
    name: 'VOID FIELD',
    blurb: 'A surreal, open track through shifting geometric fields.',
    decor: 'void',
    seed: 66,
    laps: 3,
    sun: 2,
    halfWidth: 12,
    // no fences out here: the road's edges curl up into a lip that holds you on
    edge: 'lip',
    points: [
      [0, 0, 20], [-60, 220, 26], [40, 420, 34], [240, 480, 30], [400, 380, 22], [380, 200, 30], [460, 40, 40], [380, -140, 30],
      [200, -200, 22], [100, -100, 18],
    ],
    features: (P) => ({
      branches: [
        { from: P(3, 0.6), to: P(6, 0.5), mask: M.X, side: -1, lift: 0, bulge: -40, label: 'OVERLAP RIDGE' },
        // the form routes (formroutes.js): across the open field, a gap only the Skimmer glides; on the way home, a
        // wall only the Blade rides
        { from: P(4, 0.2), to: P(5, 0.7), mask: M.ALL, side: 1, lift: 3, label: 'GLIDE GAP', sub: 'BLUE FLOATS IT',
          // (the field climbs here, so the far side is set well down)
          profile: [{ at: 0.5, kind: 'step', drop: 6, len: 55, end: 0.82 }] },
        { from: P(7, 0.75), to: P(9, 0.5), mask: M.ALL, side: -1, lift: 9, label: 'WALL RUN', sub: 'RED CLINGS · OTHERS FALL', wallrun: { from: 0.28, to: 0.76, bank: 0.95 } },
      ],
      gaps: [
        { at: P(1, 0.1), len: 40, mask: M.R, noRails: true },
        { at: P(1, 0.6), len: 40, mask: M.B, noRails: true },
        { at: P(7, 0.3), len: 60, mask: M.RO, noRails: true },
        { path: 'b1', at: 0.5, len: 50, glide: true, noRails: true },
      ],
      obstacles: [...field(P(2, 0.2), 0.1, 12, 31), ...field(P(5, 0.1), 0.09, 10, 37), ...field(P(8, 0.4), 0.05, 6, 41)],
      boosts: [{ at: P(0, 0.4) }, { at: P(4, 0.3), mask: M.BO }, { at: P(6, 0.2), mask: M.RO }, { path: 'b1', at: 0.8 }, { path: 'b2', at: 0.85 }],
      shards: [{ at: P(0, 0.7), n: 3 }, { at: P(4, 0.6), n: 4 }, { at: P(6, 0.9), n: 3, mask: M.R }],
      // the police chase (game/police.js): set off as you cross `at`, off the edge at `out`, signed at `sign`
      chase: { at: P(0, 0.1), out: P(6, 0.75), sign: P(0, 0.5) },
    }),
  }),

  // ------------------------------------------------------------------ 07
  make({
    id: 'helix',
    num: '07',
    name: 'HELIX ASCENT',
    blurb: 'A vertical race through intertwining spirals of the two worlds.',
    decor: 'helix',
    seed: 77,
    laps: 2,
    sun: 1,
    helixCenter: [0, 0],
    points: (() => {
      const pts = [];
      // climb: two turns around the column, radius 80
      const turns = 2;
      const n = 16;
      for (let k = 0; k <= turns * n; k++) {
        const a = Math.PI - (k / n) * Math.PI * 2;
        pts.push([Math.cos(a) * 80, Math.sin(a) * 80, 2 + (k / (turns * n)) * 60]);
      }
      // drop: a long sweeping descent out and back around
      pts.push([-160, 60, 56], [-300, 120, 44], [-420, 20, 30], [-380, -180, 16], [-220, -220, 6], [-120, -120, 2]);
      return pts.map(([x, z, y]) => [x, z, y]);
    })(),
    features: (P) => ({
      routeBoosts: 'light', // a hard course: just a pad at the mouth of each route
      // the BLUE DROP: off the outside of the spiral's top, a long blue-only fall across the loop, and a hairpin at
      // the bottom that feeds into the road from the inside. (A straight chord from the spiral to the far corner met
      // the road with a near-180° hook at each end, where rivals stalled and fell through.) The via line is a
      // left turn, a straight and a 25 m left hairpin, [x, z, y].
      branches: [{
        from: P(30, 0.5), to: P(36, 0.2), mask: M.BO, side: 1, label: 'BLUE DROP',
        via: [
          [-113.2, -5.4, 58.8], [-129.4, 2.9, 57.0], [-147.6, 4.1, 54.6], [-164.8, -2.0, 51.7], [-181.9, -12.4, 48.3],
          [-194.7, -20.2, 45.5], [-211.9, -30.6, 41.6], [-229.0, -40.9, 37.6], [-241.8, -48.7, 34.7], [-259.0, -59.1, 30.8],
          [-271.8, -66.9, 28.0], [-289.0, -77.3, 24.4], [-306.1, -87.6, 21.2], [-318.9, -95.4, 19.1], [-336.1, -105.8, 16.7],
          [-348.9, -113.6, 15.2], [-363.5, -122.3, 13.8], [-373.5, -130.5, 13.2], [-377.0, -146.5, 13.0],
        ],
      },
      // the form route (formroutes.js): on the run home, a wall only the Blade rides. (A slit and then a wall run on
      // the climb both stalled rivals: they reach it short of SHIFT and speed, so the climb keeps its corkscrew instead.)
      { from: P(37, 0.0), to: P(38, 0.9), mask: M.ALL, side: 1, lift: 8, label: 'WALL RUN', sub: 'RED CLINGS · OTHERS FALL', wallrun: { from: 0.28, to: 0.76, bank: 0.95 } },
      ],
      gaps: [
        { at: P(6, 0), len: 30, mask: M.R, noRails: false },
        { at: P(14, 0), len: 30, mask: M.B, noRails: false },
        { at: P(22, 0), len: 30, mask: M.R, noRails: false },
        { at: P(37, 0.3), len: 40, mask: M.B, noRails: true },
      ],
      obstacles: [
        block(P(3, 0.5), 0.5, M.R), block(P(4, 0.5), -0.5, M.B), wall(P(10, 0.5), M.B),
        block(P(26, 0.2), 0.5, M.B), block(P(27, 0.2), -0.5, M.R),
      ],
      // the CORKSCREW (warp.js): the road rolls a full turn; the Blade rides it upside down, BOTH and BLUE launch through it
      screws: [{ at: P(34, 0.2), len: 140 }],
      boosts: [{ at: P(1, 0.5) }, { at: P(12, 0.5) }, { at: P(24, 0.5) }, { at: P(34, 0.05), mask: M.RO }, { at: P(18, 0.5), mask: M.BO }, { at: P(35, 0.5), mask: M.BO }, { path: 'b1', at: 0.85 }],
      tips: [{ at: P(33, 0.7), text: 'CORKSCREW: RED RIDES IT UPSIDE DOWN · BOTH AND BLUE TAKE THE LAUNCHER', key: 'red' }],
      shards: [{ at: P(8, 0.2), n: 3 }, { at: P(20, 0.2), n: 3 }, { at: P(36, 0.6), n: 3, mask: M.R }],
    }),
  }),

  // ------------------------------------------------------------------ 08
  make({
    id: 'fractal',
    num: '08',
    name: 'FRACTAL ROUTE',
    blurb: 'A mind-bending track of repeating, shifting structures.',
    decor: 'fractal',
    seed: 88,
    works: true, // the road works crew (game/construction.js)
    laps: 3,
    sun: 0,
    points: [
      [0, 0, 0], [0, 150, 0], [80, 230, 4], [200, 230, 8], [280, 150, 8], [280, 30, 6], [360, -50, 4], [480, -50, 6],
      [560, 30, 10], [560, 160, 12], [480, 240, 10], [440, 330, 8], [480, 420, 10], [380, 480, 12], [240, 440, 10], [140, 380, 6],
      [-60, 360, 4], [-160, 240, 2], [-140, 80, 0], [-80, -40, 0],
    ],
    features: (P) => ({
      routeBoosts: 'light', // a hard course: just a pad at the mouth of each route
      branches: [
        { from: P(1, 0.3), to: P(5, 0.7), mask: M.RO, side: 1, lift: 8, label: 'RED FOLD' },
        { from: P(9, 0.2), to: P(14, 0.4), mask: M.BO, side: -1, lift: 10, label: 'BLUE FOLD' },
        // the form routes (formroutes.js): a narrow line past the blue gap through a slit only the Blade fits, and a
        // wall over the red gap that only the Blade rides; the Skimmer gets the water on the run home
        { from: P(5, 0.9), to: P(8, 0.3), mask: M.ALL, side: 1, lift: 3, label: 'THE SLIT', sub: 'ONLY THE RED BLADE FITS' },
        { from: P(15, 0.2), to: P(18, 0.2), mask: M.ALL, side: 1, lift: 9, label: 'WALL RUN', sub: 'RED CLINGS · OTHERS FALL', wallrun: { from: 0.28, to: 0.76, bank: 0.95 } },
      ],
      water: [{ at: P(18, 0.55), len: 60 }],
      gaps: [{ at: P(6, 0.4), len: 30, mask: M.B, noRails: true }, { at: P(16, 0.3), len: 30, mask: M.R, noRails: true }],
      obstacles: [
        ...chicane(P(3, 0.0), 0.008, 5), wall(P(7, 0.3), M.R), ...chicane(P(11, 0.2), 0.008, 5, M.B, M.R),
        ...field(P(17, 0.1), 0.04, 6, 51),
        { type: 'slit', path: 'b2', at: 0.5 },
      ],
      boosts: [{ at: P(0, 0.5) }, { at: P(8, 0.4) }, { at: P(15, 0.5), mask: M.BO }, { at: P(18, 0.5) }, { at: P(7, 0.7), mask: M.RO }, { path: 'b2', at: 0.72 }, { path: 'b3', at: 0.85 }],
      shards: [{ at: P(2, 0.3), n: 3 }, { at: P(10, 0.2), n: 3 }, { at: P(16, 0.8), n: 3 }],
    }),
  }),

  // ------------------------------------------------------------------ 09
  make({
    id: 'lattice',
    num: '09',
    name: 'SHIFT LATTICE',
    blurb: 'A complex web of split paths that reward smart world switching.',
    decor: 'lattice',
    seed: 99,
    laps: 3,
    sun: 2,
    points: [
      [0, 0, 4], [0, 200, 8], [100, 320, 14], [260, 340, 18], [380, 260, 14], [400, 100, 10], [320, -20, 8], [400, -160, 12],
      [300, -300, 16], [120, -300, 10], [20, -180, 6],
    ],
    features: (P) => ({
      branches: [
        { from: P(0, 0.5), to: P(3, 0.2), mask: M.RO, side: -1, lift: 10, bulge: 10, label: 'RED STRAND' },
        { from: P(1, 0.1), to: P(4, 0.0), mask: M.BO, side: 1, lift: 20, bulge: -30, label: 'BLUE STRAND' },
        { from: P(5, 0.2), to: P(8, 0.3), mask: M.BO, side: 1, lift: 6, label: 'BLUE-ONLY WIRE' },
        { from: P(7, 0.6), to: P(10, 0.4), mask: M.RO, side: -1, lift: 12, label: 'RED-ONLY WIRE' },
        // the form routes (formroutes.js): a wall past the red gap only the Blade rides, and a gap past the blue one
        // only the Skimmer glides
        { from: P(4, 0.3), to: P(6, 0.5), mask: M.ALL, side: -1, lift: 9, label: 'WALL RUN', sub: 'RED CLINGS · OTHERS FALL', wallrun: { from: 0.28, to: 0.76, bank: 0.95 } },
        { from: P(8, 0.6), to: P(10, 0.5), mask: M.ALL, side: 1, lift: 5, label: 'GLIDE GAP', sub: 'BLUE FLOATS IT', profile: [{ at: 0.5, kind: 'step', drop: 3.5, len: 55, end: 0.82 }] },
      ],
      gaps: [{ at: P(2, 0.4), len: 40, mask: M.X, noRails: true }, { at: P(6, 0.2), len: 40, mask: M.R, noRails: true }, { at: P(9, 0.2), len: 40, mask: M.B, noRails: true }, { path: 'b5', at: 0.5, len: 48, glide: true, noRails: true }],
      obstacles: [...field(P(3, 0.4), 0.04, 6, 61), wall(P(5, 0.6), M.B), ...chicane(P(10, 0.2), 0.01, 3)],
      boosts: [{ at: P(0, 0.2) }, { at: P(4, 0.4), mask: M.RO }, { at: P(7, 0.3), mask: M.BO }, { at: P(8, 0.6), mask: M.BO }, { path: 'b4', at: 0.85 }, { path: 'b5', at: 0.8 }],
      shards: [{ at: P(1, 0.6), n: 3 }, { at: P(5, 0.0), n: 3 }, { at: P(9, 0.6), n: 3 }],
    }),
  }),

  // ------------------------------------------------------------------ 10
  make({
    id: 'ruins',
    num: '10',
    name: 'ECHO RUINS',
    blurb: 'The remnants of a larger structure, with alternate paths across worlds.',
    decor: 'ruins',
    seed: 1010,
    quake: true, // the three-act quake (game/quake.js)
    laps: 3,
    sun: 1,
    points: [
      [0, 0, 6], [-20, 200, 10], [60, 380, 18], [220, 460, 24], [400, 420, 20], [480, 260, 14], [420, 100, 10], [500, -60, 14],
      [420, -240, 20], [240, -320, 16], [80, -260, 10], [40, -120, 6],
    ],
    features: (P) => ({
      branches: [
        { from: P(1, 0.3), to: P(4, 0.3), mask: M.BO, side: 1, lift: 0, bulge: -60, label: 'BLUE ECHO' },
        { from: P(6, 0.5), to: P(9, 0.4), mask: M.RO, side: 1, lift: 14, bulge: -40, label: 'RED ECHO' },
        // the form routes (formroutes.js): across the first red gap, a gap only the Skimmer glides; over the third, a
        // broken wall only the Blade rides
        { from: P(2, 0.4), to: P(3, 0.8), mask: M.ALL, side: -1, lift: 5, label: 'GLIDE GAP', sub: 'BLUE FLOATS IT', profile: [{ at: 0.5, kind: 'step', drop: 3.5, len: 55, end: 0.82 }] },
        { from: P(7, 0.6), to: P(9, 0.0), mask: M.ALL, side: -1, lift: 9, label: 'WALL RUN', sub: 'RED CLINGS · OTHERS FALL', wallrun: { from: 0.28, to: 0.76, bank: 0.95 } },
      ],
      gaps: [
        { at: P(2, 0.6), len: 40, mask: M.R, noRails: true },
        { at: P(5, 0.3), len: 40, mask: M.B, noRails: true },
        { at: P(8, 0.4), len: 40, mask: M.R, noRails: true },
        { at: P(10, 0.5), len: 34, mask: M.X, noRails: true },
        { path: 'b2', at: 0.5, len: 48, glide: true, noRails: true },
      ],
      obstacles: [wall(P(1, 0.1), M.R), ...field(P(3, 0.3), 0.05, 8, 71), ...chicane(P(7, 0.5), 0.01, 4)],
      boosts: [{ at: P(0, 0.5) }, { at: P(4, 0.6), mask: M.RO }, { at: P(9, 0.7), mask: M.BO }, { at: P(6, 0.2), mask: M.RO }, { at: P(11, 0.3), mask: M.RO }, { path: 'b2', at: 0.8 }, { path: 'b3', at: 0.85 }],
      shards: [{ at: P(1, 0.6), n: 3 }, { at: P(5, 0.7), n: 3 }, { at: P(10, 0.1), n: 3 }],
    }),
  }),
  // ------------------------------------------------------------------ 15 (its own file: dyson.js)
  DYSON,
];

export const trackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
