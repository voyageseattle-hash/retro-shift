// HYPERCUBE: one long lap along the edges of a tesseract.
//
// Stand a cube on one corner and look straight down: its edges draw a hexagon with three spokes to the top corner
// and three to the bottom one. A tesseract seen the same way is a cube inside a cube, joined corner to corner: a
// hexagon inside a hexagon, six connectors between them, and a hub in the middle where the two cubes' top corners
// sit above their bottom ones. Every stretch of road here is one of those 32 edges (with the corners rounded so you
// can drive them); the edges no road uses are drawn as beams, so the whole figure is there around you, and on the
// map.
//
// The lap goes through every corner once, and through the hub twice:
//   1  off the line along an outer edge, in down a connector, and straight on down a spoke into the PIT (the inner
//      cube's bottom corner, dead centre), out up the next spoke and connector
//   2  along an outer edge, in again, and up over the SUMMIT (the inner cube's top corner, right above the pit),
//      and out
//   3  along an outer edge, in, round an inner edge, out, and home
// And it turns. Twice in the lap, on the FOLD LINES halfway along the second and third outer edges, the tesseract
// rotates in the fourth dimension and every height on the course goes with it (game/fold.js): first INSIDE OUT
// (the inner cube swells and the outer one shrinks, so the summit you're about to climb is half as high again),
// then INVERTED (every climb is a fall). The plan never moves.
//
// The inner cube is the red world's and the outer one the blue world's: through a lens you see one 3D cell of the
// hypercube, in BOTH all of it. Each lens also has a road of its own through the hub, beside the main one, that
// goes by way of the OUTER cube's corner instead of the inner's:
//   RED CELL   under the pit, by the outer cube's bottom corner: a longer, deeper dive (the Blade holds a drop)
//   BLUE CELL  round the summit, by the outer cube's top corner: after the first fold that corner is the low one,
//              so it's the gentle way past the swollen summit (the Skimmer flies off a crest)
// and on the way home THE RIM stays on the outer cube for one more edge, banked up into a wall only the Blade rides.

import * as THREE from '../../vendor/three.js';
import { M, COLORS } from './shift.js';
import { boardTexture, addSign } from './signs.js';

const D = Math.PI / 180;
const RO = 640; // the outer hexagon's radius
const RI = 300; // the inner one's
const UO = 44; // the outer cube's corners sit this far above and below the middle (its top corner at 3x)
const UI = 21;
const HW = 10; // half the road's width
const BHW = HW * 0.6; // a branch's
const OUT = HW + BHW + 3; // how far out a branch runs beside the road before it leaves (track.js buildBranches)
const LEAD = 30;
const TWIN = 95; // how far from the middle a lens road passes the hub (the main road passes at 3 * UI)

const pol = (deg, r, h, rad) => ({ x: r * Math.cos(deg * D), z: r * Math.sin(deg * D), h, rad });
const ANG = [90, 30, -30, -90, -150, 150];
const up = (k) => (k % 2 ? -1 : 1);
// the sixteen corners: outer and inner hexagon, and the four at the hub
export const CORNERS = {
  O: ANG.map((a, k) => pol(a, RO, up(k) * UO)),
  I: ANG.map((a, k) => pol(a, RI, up(k) * UI)),
  OT: { x: 0, z: 0, h: 3 * UO, outer: true },
  OB: { x: 0, z: 0, h: -3 * UO, outer: true },
  IT: { x: 0, z: 0, h: 3 * UI },
  IB: { x: 0, z: 0, h: -3 * UI },
};
const { O, I, IT, IB } = CORNERS;
const HUB = { x: 0, z: 0, h: 0 };

// ------------------------------------------------------------------ the fold
// Height of a point of the course in each of the three poses. The plan (x, z) never changes. `outer` marks what
// belongs to the outer cube where the two share the plan: at the hub, where the lens roads and the outer cube's
// own corners are.
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// (the swell is all inside the radius where the lens roads leave and rejoin the main one, so out there every road
// is the outer cube's and they stay level with each other)
const swell = (r) => 1.4 - 0.8 * smooth(RI + 10, RO - 210, r);
export const FOLD = {
  T: 6, // seconds a turn takes
  names: ['', 'INSIDE OUT', 'INVERTED'],
  at: [], // where in the lap each turn starts (filled in below, once the road is laid)
  phases: [
    (x, z, y) => y,
    (x, z, y, outer) => y * (outer ? 0.6 : swell(Math.hypot(x, z))),
    (x, z, y) => -y,
  ],
};
// what the sky's hypercube does while the course folds (game/fold.js sets it, HyperSky reads it)
export const HYPER = { kick: 0 };

// ------------------------------------------------------------------ rounded polylines
// A line through corner points, each corner rounded to its radius, as dense points. Heights run evenly along each
// leg and are then eased, so a corner of the figure is a crest or a dip you can drive and not a kink.
function route(V, closed, step = 20) {
  const n = V.length;
  const C = [];
  for (let i = 0; i < n; i++) {
    const B = V[i];
    if (!closed && (i === 0 || i === n - 1)) {
      C.push({ t: 0, arc: [{ x: B.x, z: B.z, h: B.h }] });
      continue;
    }
    const A = V[(i - 1 + n) % n];
    const N = V[(i + 1) % n];
    const la = Math.hypot(B.x - A.x, B.z - A.z);
    const lb = Math.hypot(N.x - B.x, N.z - B.z);
    const d1 = { x: (B.x - A.x) / la, z: (B.z - A.z) / la };
    const d2 = { x: (N.x - B.x) / lb, z: (N.z - B.z) / lb };
    const cross = d1.x * d2.z - d1.z * d2.x;
    const phi = Math.atan2(Math.abs(cross), d1.x * d2.x + d1.z * d2.z);
    if (phi < 0.03) {
      C.push({ t: 0, arc: [{ x: B.x, z: B.z, h: B.h }] });
      continue;
    }
    const rad = B.rad ?? 50;
    const t = rad * Math.tan(phi / 2);
    const sg = Math.sign(cross);
    const pin = { x: B.x - d1.x * t, z: B.z - d1.z * t };
    const hin = B.h + ((A.h - B.h) * t) / la;
    const hout = B.h + ((N.h - B.h) * t) / lb;
    const cx = pin.x - d1.z * sg * rad;
    const cz = pin.z + d1.x * sg * rad;
    const m = Math.max(2, Math.ceil(phi / (12 * D)));
    const arc = [];
    for (let k = 0; k <= m; k++) {
      const u = k / m;
      const a = sg * phi * u;
      const vx = pin.x - cx;
      const vz = pin.z - cz;
      arc.push({
        x: cx + vx * Math.cos(a) - vz * Math.sin(a),
        z: cz + vx * Math.sin(a) + vz * Math.cos(a),
        h: hin + (hout - hin) * u + (B.h - (hin + hout) / 2) * 0.5 * Math.sin(Math.PI * u),
      });
    }
    C.push({ t, arc });
  }
  const pts = [];
  const mark = []; // per corner: index of its first and last point, and how far its rounding reaches
  for (let i = 0; i < n; i++) {
    const c = C[i];
    const i0 = pts.length;
    pts.push(...c.arc);
    mark.push([i0, pts.length - 1, c.t]);
    if (!closed && i === n - 1) break;
    const d = C[(i + 1) % n];
    const a = c.arc[c.arc.length - 1];
    const b = d.arc[0];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const k = Math.floor(len / step);
    for (let q = 1; q <= k; q++) {
      const u = q / (k + 1);
      pts.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, h: a.h + (b.h - a.h) * u });
    }
  }
  // ease the heights (an open line keeps its ends: they're where it meets the road)
  const N = pts.length;
  for (let pass = 0; pass < 4; pass++) {
    const h = pts.map((p) => p.h);
    for (let i = 0; i < N; i++) {
      if (!closed && (i < 2 || i > N - 3)) continue;
      pts[i].h = (h[(i - 1 + N) % N] + 2 * h[i] + h[(i + 1) % N]) / 4;
    }
  }
  const cum = [0];
  for (let i = 1; i <= N; i++) {
    const a = pts[i - 1];
    const b = pts[i % N];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z, b.h - a.h));
  }
  return { pts, mark, cum, length: closed ? cum[N] : cum[N - 1] };
}

// ------------------------------------------------------------------ the main loop
const mid = (a, b) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, h: (a.h + b.h) / 2 });
const r = (p, rad) => ({ ...p, rad });
const HAIR = 55;
// (the line is halfway along an outer edge, a place whose height no pose changes; so are the two fold lines)
const ORDER = ['S', 'O1', 'I1', 'IB', 'I3', 'O3', 'O2', 'I2', 'IT', 'I4', 'O4', 'O5', 'I5', 'I0', 'O0'];
const MAIN_V = [
  mid(O[0], O[1]), r(O[1], HAIR), I[1], r(IB, 90), I[3], r(O[3], HAIR), r(O[2], HAIR), I[2], r(IT, 90), I[4], r(O[4], HAIR),
  r(O[5], HAIR), r(I[5], 80), r(I[0], 80), r(O[0], HAIR),
];
const MAIN = route(MAIN_V, true);
const NAME = Object.fromEntries(ORDER.map((id, k) => [id, k]));
// lap fraction `d` metres before corner `name` (the true corner, not where its rounding starts), or after it
const before = (name, d) => (MAIN.cum[MAIN.mark[NAME[name]][0]] - (d - MAIN.mark[NAME[name]][2])) / MAIN.length;
const after = (name, d) => ((MAIN.cum[MAIN.mark[NAME[name]][1]] + (d - MAIN.mark[NAME[name]][2])) / MAIN.length) % 1;
FOLD.at = [before('O2', RO / 2), before('O5', RO / 2)];

// a point on the leg from corner A toward corner B, `d` metres along and `lat` to the side (+ = the game's right)
function onLeg(A, B, d, lat = 0) {
  const L = Math.hypot(B.x - A.x, B.z - A.z);
  const tx = (B.x - A.x) / L;
  const tz = (B.z - A.z) / L;
  return { x: A.x + tx * d - tz * lat, z: A.z + tz * d + tx * lat, h: A.h + ((B.h - A.h) * d) / L };
}
const via = (V) => route(V, false, 18).pts.map((p) => [p.x, p.z, p.h]);

// The lens roads through the hub: in beside the main road from outer corner A, round the inside of its turn at the
// hub at height `h`, and out beside it to outer corner B. Both turn right (side +1). They leave and rejoin on the
// road's own grade (grade: true), since the road is climbing or falling at both places.
const T_FORK = 120; // metres past A
const T_JOIN = 160; // metres before B
function twin(A, viaA, B, viaB, h) {
  const start = onLeg(A, HUB, T_FORK + LEAD + 20, OUT);
  const end = onLeg(HUB, B, RO - T_JOIN - LEAD - 9, OUT);
  // the main road's height where each end is
  start.h = onLeg(A, viaA, T_FORK + LEAD + 20).h;
  end.h = onLeg(B, viaB, T_JOIN + LEAD + 9).h;
  const turn = onLeg(A, HUB, RO - OUT * Math.tan(30 * D), OUT);
  return via([start, r({ ...turn, h }, 60), end]);
}

// THE RIM: stays on the outer cube where the road turns in at O5, round the corner and along the outer edge to O0,
// and back onto the road after its hairpin there. On the right all the way (the outside).
const X_FORK = 180; // metres before O5
const X_JOIN = 165; // metres past O0
const rimVia = (() => {
  const start = onLeg(O[4], O[5], RO - X_FORK + LEAD + 20, OUT);
  const end = onLeg(O[0], O[1], X_JOIN - LEAD - 9, OUT);
  const k = OUT / Math.sin(60 * D);
  const c1 = onLeg(O[0], O[5], RO + k);
  const c2 = onLeg(O[5], O[0], RO + k);
  return via([start, r({ ...c1, h: O[5].h }, 90), r({ ...c2, h: O[0].h }, 90), end]);
})();

const block = (at, lat, mask, size = 3) => ({ type: 'block', at, lat, mask, size });
const row = (name, d0, masks, lats, gap = 17) => masks.map((m, k) => block(after(name, d0 + k * gap), lats[k % lats.length], m, 3.3));
const RB = [M.R, M.B, M.R, M.B, M.B, M.R];
const LATS = [-0.5, 0.45, -0.05, 0.55, -0.55, 0.1];

// every edge of the figure in plan, for the map
const EDGES = [];
for (let k = 0; k < 6; k++) {
  const n = (k + 1) % 6;
  EDGES.push([O[k].x, O[k].z, O[n].x, O[n].z], [I[k].x, I[k].z, I[n].x, I[n].z], [O[k].x, O[k].z, 0, 0]);
}

export const TESSERACT = {
  id: 'tesseract',
  num: '16',
  name: 'HYPERCUBE',
  blurb: 'One long lap round a cube inside a cube. Twice on the way it turns in the fourth dimension.',
  decor: 'tesseract',
  skyPiece: 'tesseract',
  seed: 1616,
  laps: 1,
  sun: 0,
  noPylons: true,
  floorDrop: 44,
  fold: FOLD,
  dressEnv: tesseractEnv,
  mapLines: EDGES,
  points: MAIN.pts.map((p) => [p.x, p.z, p.h]),
  branches: [
    { from: after('O1', T_FORK), to: before('O3', T_JOIN), mask: M.RO, side: 1, grade: true, label: 'RED CELL', cell: 'outer', cover: false, via: twin(O[1], I[1], O[3], I[3], -TWIN) },
    { from: after('O2', T_FORK), to: before('O4', T_JOIN), mask: M.BO, side: 1, grade: true, label: 'BLUE CELL', cell: 'outer', cover: false, via: twin(O[2], I[2], O[4], I[4], TWIN) },
    { from: before('O5', X_FORK), to: after('O0', X_JOIN), mask: M.ALL, side: 1, grade: true, label: 'THE RIM', sub: 'WALL RUN · RED CLINGS · OTHERS FALL', via: rimVia, wallrun: { from: 0.3, to: 0.72, bank: 0.95 } },
  ],
  routeBoosts: 'light',
  gaps: [
    // a hole in the road into the pit for the red world, and one on the way to the summit for the blue: each lens
    // has its own road there
    { at: after('O1', 250), len: 40, mask: M.B, noRails: true },
    { at: after('O2', 250), len: 40, mask: M.R, noRails: true },
    { at: after('O4', 180), len: 40, mask: M.R, noRails: true },
    { at: after('I5', 125), len: 36, mask: M.B, noRails: true },
  ],
  obstacles: [
    ...row('IB', 110, RB.slice(0, 5), LATS),
    ...row('O3', 150, RB, LATS.slice(1)),
    { type: 'gate', at: after('O3', 420), mask: M.R, lat: -1 }, { type: 'gate', at: after('O3', 442), mask: M.B, lat: 1 },
    { type: 'gate', at: after('O3', 464), mask: M.R, lat: -1 }, { type: 'gate', at: after('O3', 486), mask: M.B, lat: 1 },
    ...row('IT', 115, [M.B, M.R, M.B, M.R], LATS.slice(2)),
    { type: 'wall', at: after('I0', 150), mask: M.B },
  ],
  boosts: [
    { at: after('S', 40) },
    { at: after('O1', 112), lat: -0.35 },
    { at: after('I1', 30), mask: M.BO, lat: 0.4 },
    { at: after('I3', 70) },
    { at: after('O3', 118), lat: 0.3 },
    { at: after('O3', 520), mask: M.BO, lat: -0.4 },
    { at: after('O2', 112), lat: -0.35 },
    { at: after('I2', 70), mask: M.RO, lat: -0.4 },
    { at: after('I4', 100) },
    { at: after('O4', 118), lat: 0.3 },
    { at: after('O5', 118), mask: M.RO, lat: 0.3 },
    { at: after('I0', 45), mask: M.RO, lat: -0.3 },
    { at: after('O0', 118) },
    { path: 'b2', at: 0.85 },
  ],
  shards: [
    { at: after('S', 130), n: 3 }, { at: after('O1', 258), n: 3, mask: M.B }, { at: after('I3', 170), n: 3, lat: -0.4 },
    { at: after('O3', 275), n: 3, lat: 0.4 }, { at: after('O2', 258), n: 3, mask: M.R }, { at: after('I4', 190), n: 3, lat: 0.4 },
    { at: after('O4', 300), n: 3 }, { at: after('O5', 190), n: 3, lat: -0.4 }, { at: after('I5', 130), n: 3, mask: M.B }, { at: after('O0', 215), n: 3 },
  ],
};

// ------------------------------------------------------------------ the frame
// The edges no road runs along, as beams, and a small cube-in-a-cube turning at every corner. Built to move: the
// fold calls set() with the pose weights and every beam end goes to its corner's new height.
const BEAMS = [
  // the outer cube (the blue world's)
  ['O1', 'O2', M.B], ['O3', 'O4', M.B],
  ['OT', 'O0', M.B], ['OT', 'O2', M.B], ['OT', 'O4', M.B], ['OB', 'O1', M.B], ['OB', 'O3', M.B], ['OB', 'O5', M.B],
  // the inner cube (the red world's)
  ['I0', 'I1', M.R, 15], ['I1', 'I2', M.R, 15], ['I2', 'I3', M.R, 15], ['I3', 'I4', M.R, 15], ['I4', 'I5', M.R, 15], ['IT', 'I0', M.R, 15], ['IB', 'I5', M.R, 15],
  // the edges between them: there only while both worlds are
  ['OT', 'IT', M.X], ['OB', 'IB', M.X],
];
const corner = (id) => (id.length === 2 && id[1] >= '0' && id[1] <= '5' ? CORNERS[id[0]][+id[1]] : CORNERS[id]);
const ALL_CORNERS = [...O.map((c, k) => ['O' + k, c]), ...I.map((c, k) => ['I' + k, c]), ['OT', CORNERS.OT], ['OB', CORNERS.OB], ['IT', IT], ['IB', IB]];
const TIES = 9;
const SEG_PER_BEAM = 4 + TIES * 4;

// The cubes' faces. Seen corner-on a cube shows three faces round its top corner and hides three round its bottom
// one; each is drawn as a membrane of lines that crowd in toward the hub (rhombus inside rhombus, the cube-in-a-cube
// again), blue for the outer cube and red for the inner. Corners in order: the hub one, round the rim, back.
const FACES = [];
for (const [c, mask] of [['O', M.B], ['I', M.R]]) {
  for (const k of [0, 2, 4]) FACES.push([[c + 'T', c + k, c + (k + 1), c + ((k + 2) % 6)], mask]);
  for (const k of [1, 3, 5]) FACES.push([[c + 'B', c + k, c + ((k + 1) % 6), c + ((k + 2) % 6)], mask]);
}
const RUNGS = [0.86, 0.7, 0.56, 0.44, 0.34, 0.26, 0.19, 0.13];
const FACE_CUT = 3; // each line in this many pieces: a folding face isn't flat
const FACE_SEGS = RUNGS.length * 2 * FACE_CUT;
const AXIS_TOP = 620;

class Frame {
  constructor(world) {
    this.group = new THREE.Group();
    this.sets = new Map();
    for (const mask of [M.B, M.R, M.X]) {
      const beams = BEAMS.filter((b) => b[2] === mask);
      const mats = world.layers.materials(mask);
      const lg = new THREE.BufferGeometry();
      // (and a line from each of its hexagon corners down to the floor)
      const feet = mask === M.X ? [] : ALL_CORNERS.filter(([id]) => id[0] === (mask === M.B ? 'O' : 'I') && id[1] <= '5').map(([id]) => id);
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((beams.length * SEG_PER_BEAM + feet.length * 3) * 6), 3).setUsage(THREE.DynamicDrawUsage));
      const lines = new THREE.LineSegments(lg, mats.wire);
      // a ribbon down each beam, crossed, so it glows like the road's edge from any side
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(beams.length * 36), 3).setUsage(THREE.DynamicDrawUsage));
      const col = new Float32Array(beams.length * 36);
      const c = new THREE.Color(mats.base).multiplyScalar(0.3);
      for (let q = 0; q < col.length; q += 3) col.set([c.r, c.g, c.b], q);
      rg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const rib = new THREE.Mesh(rg, mats.ribbon);
      for (const o of [lines, rib]) {
        o.frustumCulled = false;
        o.renderOrder = 2;
        this.group.add(o);
      }
      this.sets.set(mask, { beams, feet, lp: lg.getAttribute('position'), rp: rg.getAttribute('position') });
    }
    // the faces
    this.faces = [];
    for (const mask of [M.B, M.R]) {
      const faces = FACES.filter((f) => f[1] === mask).map((f) => f[0]);
      const mats = world.layers.materials(mask);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faces.length * FACE_SEGS * 6), 3).setUsage(THREE.DynamicDrawUsage));
      const lc = new Float32Array(faces.length * FACE_SEGS * 6);
      const base = new THREE.Color(mats.base);
      // (the rungs nearest the hub are the brightest: the figure glows from its middle)
      for (let f = 0, o = 0; f < faces.length; f++) {
        for (let q = 0; q < RUNGS.length * 2; q++) {
          const k = 0.16 + 0.5 * (Math.floor(q / 2) / (RUNGS.length - 1)) ** 1.5;
          for (let e = 0; e < FACE_CUT * 2; e++, o += 3) lc.set([base.r * k, base.g * k, base.b * k], o);
        }
      }
      lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
      const lines = new THREE.LineSegments(lg, mats.line);
      // and the pane itself: a breath of the cube's colour, so a face reads as glass and not as loose lines
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faces.length * 18), 3).setUsage(THREE.DynamicDrawUsage));
      const pc = new Float32Array(faces.length * 18);
      for (let q = 0; q < pc.length; q += 3) pc.set([base.r * 0.007, base.g * 0.007, base.b * 0.007], q);
      pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
      const panes = new THREE.Mesh(pg, mats.ribbon);
      for (const o of [lines, panes]) {
        o.frustumCulled = false;
        o.renderOrder = 2;
        this.group.add(o);
      }
      this.faces.push({ faces, lp: lg.getAttribute('position'), pp: pg.getAttribute('position') });
    }
    // the axis: the line the hub's four corners sit on, the one direction here that never folds. A white beam from
    // the floor up out of sight, with three squares turning round it far above the summit.
    {
      const N = world.layers.materials(M.ALL);
      const y0 = world.floorY;
      const ap = [];
      for (const [dx, dz] of [[0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) ap.push(dx, y0, dz, dx, AXIS_TOP, dz);
      const ag = new THREE.BufferGeometry();
      ag.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3));
      const axis = new THREE.LineSegments(ag, N.wire);
      const rp = [];
      const rc = [];
      const vc = new THREE.Color(COLORS.violet).multiplyScalar(0.55);
      for (const [dx, dz] of [[1.1, 0], [0, 1.1]]) {
        rp.push(-dx, y0, -dz, dx, y0, dz, dx, AXIS_TOP, dz, -dx, y0, -dz, dx, AXIS_TOP, dz, -dx, AXIS_TOP, -dz);
        for (let q = 0; q < 6; q++) rc.push(vc.r, vc.g, vc.b);
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
      const glow = new THREE.Mesh(rg, N.ribbon);
      this.crown = [];
      for (const [k, size, y, mask] of [[0, 150, 250, M.B], [1, 96, 330, M.R], [2, 60, 395, M.B], [3, 36, 445, M.R]]) {
        const sq = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size * 0.08, size)), world.layers.materials(mask).wire);
        sq.position.y = y;
        sq.userData.w = (k % 2 ? -1 : 1) * (0.1 + k * 0.05);
        this.crown.push(sq);
      }
      for (const o of [axis, glow, ...this.crown]) {
        o.frustumCulled = false;
        o.renderOrder = 2;
        this.group.add(o);
      }
    }
    // the corners: a cube in a cube, blue outside and red inside, a little above each one (the outer cube's own
    // corners are beacons three times the size: nothing drives through those)
    this.nodes = [];
    const big = new THREE.EdgesGeometry(new THREE.BoxGeometry(7, 7, 7));
    const small = new THREE.EdgesGeometry(new THREE.BoxGeometry(3.4, 3.4, 3.4));
    const join = new THREE.BufferGeometry();
    const jp = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) jp.push(sx * 3.5, sy * 3.5, sz * 3.5, sx * 1.7, sy * 1.7, sz * 1.7);
    join.setAttribute('position', new THREE.Float32BufferAttribute(jp, 3));
    for (const [id, c] of ALL_CORNERS) {
      const g = new THREE.Group();
      const inner = new THREE.LineSegments(small, world.layers.materials(M.R).wire);
      g.add(new THREE.LineSegments(big, world.layers.materials(M.B).wire), inner, new THREE.LineSegments(join, world.layers.materials(M.X).wire));
      g.rotation.set(Math.atan(Math.SQRT1_2), 0, Math.PI / 4); // on its corner, like the course
      const big3 = id[0] === 'O';
      g.scale.setScalar(big3 ? 3 : 1);
      g.userData = { id, c, inner, lift: big3 ? 30 : 13 };
      this.group.add(g);
      this.nodes.push(g);
    }
    this.pos = new Map();
    this.floor = world.floorY;
    this.set([1, 0, 0]);
    world.animated.push((t) => {
      for (const g of this.nodes) g.userData.inner.rotation.y = t * 0.9;
      for (const q of this.crown) q.rotation.y = t * q.userData.w;
    });
  }

  // Every corner to its height under pose weights w, and the beams with them.
  set(w) {
    for (const [id, c] of ALL_CORNERS) {
      let y = 0;
      for (let k = 0; k < w.length; k++) if (w[k]) y += w[k] * FOLD.phases[k](c.x, c.z, c.h, c.outer);
      let p = this.pos.get(id);
      if (!p) this.pos.set(id, (p = new THREE.Vector3()));
      p.set(c.x, y, c.z);
    }
    for (const g of this.nodes) g.position.copy(this.pos.get(g.userData.id)).y += g.userData.lift;
    this.setFaces();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const side = new THREE.Vector3();
    const UPV = new THREE.Vector3(0, 1, 0);
    const d = new THREE.Vector3();
    for (const S of this.sets.values()) {
      const lp = S.lp.array;
      const rp = S.rp.array;
      let o = 0;
      let q = 0;
      const seg = (p0, p1) => {
        lp[o++] = p0.x; lp[o++] = p0.y; lp[o++] = p0.z;
        lp[o++] = p1.x; lp[o++] = p1.y; lp[o++] = p1.z;
      };
      const tri = (p0, p1, p2) => {
        for (const p of [p0, p1, p2]) {
          rp[q++] = p.x; rp[q++] = p.y; rp[q++] = p.z;
        }
      };
      for (const [ia, ib, , cut = 5] of S.beams) {
        a.copy(this.pos.get(ia));
        b.copy(this.pos.get(ib));
        d.subVectors(b, a);
        const f = cut / d.length();
        a.addScaledVector(d, f);
        b.addScaledVector(d, -f);
        d.subVectors(b, a);
        // a vertical beam (hub to hub) has no side of its own
        side.crossVectors(d, UPV);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize().multiplyScalar(1.5);
        const upv = new THREE.Vector3().crossVectors(side, d).normalize().multiplyScalar(1.5);
        const c4 = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([s, u]) => new THREE.Vector3().addScaledVector(side, s).addScaledVector(upv, u));
        for (const c of c4) seg(a.clone().add(c), b.clone().add(c));
        for (let k = 0; k < TIES; k++) {
          const m = a.clone().lerp(b, (k + 0.5) / TIES);
          for (let e = 0; e < 4; e++) seg(m.clone().add(c4[e]), m.clone().add(c4[(e + 1) % 4]));
        }
        for (const v of [side, upv]) {
          const p0 = a.clone().add(v);
          const p1 = b.clone().add(v);
          const p2 = b.clone().sub(v);
          const p3 = a.clone().sub(v);
          tri(p0, p1, p2);
          tri(p0, p2, p3);
        }
      }
      for (const id of S.feet) {
        const p = this.pos.get(id);
        for (const [dx, dz] of [[0, 0], [1.2, 0], [0, 1.2]]) seg(a.set(p.x + dx, p.y + 5, p.z + dz), b.set(p.x + dx, this.floor, p.z + dz));
      }
      S.lp.needsUpdate = S.rp.needsUpdate = true;
    }
  }
}

// The faces, to where the corners are now.
Frame.prototype.setFaces = function () {
  const P = (id) => this.pos.get(id);
  const at = (c, u, v, out) => {
    // bilinear over the face: hub corner at (0, 0), the far rim corner at (1, 1)
    const w00 = (1 - u) * (1 - v);
    const w10 = u * (1 - v);
    const w11 = u * v;
    const w01 = (1 - u) * v;
    return out.set(
      c[0].x * w00 + c[1].x * w10 + c[2].x * w11 + c[3].x * w01,
      c[0].y * w00 + c[1].y * w10 + c[2].y * w11 + c[3].y * w01,
      c[0].z * w00 + c[1].z * w10 + c[2].z * w11 + c[3].z * w01,
    );
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const S of this.faces) {
    const lp = S.lp.array;
    const pp = S.pp.array;
    let o = 0;
    let q = 0;
    for (const ids of S.faces) {
      const c = ids.map(P);
      // stop short of the edges: a road or a beam runs along each
      const m = 16 / Math.hypot(c[1].x - c[0].x, c[1].z - c[0].z);
      for (const s of RUNGS) {
        for (const flip of [0, 1]) {
          for (let k = 0; k < FACE_CUT; k++) {
            const t0 = m + ((s - m) * k) / FACE_CUT;
            const t1 = m + ((s - m) * (k + 1)) / FACE_CUT;
            // an L round the hub corner: out along one edge's direction at distance s, then the other
            if (flip) {
              at(c, s, t0, a);
              at(c, s, t1, b);
            } else {
              at(c, t0, s, a);
              at(c, t1, s, b);
            }
            lp[o++] = a.x; lp[o++] = a.y; lp[o++] = a.z;
            lp[o++] = b.x; lp[o++] = b.y; lp[o++] = b.z;
          }
        }
      }
      const R = [at(c, m, m, new THREE.Vector3()), at(c, 1 - m, m, new THREE.Vector3()), at(c, 1 - m, 1 - m, new THREE.Vector3()), at(c, m, 1 - m, new THREE.Vector3())];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        pp[q++] = R[k].x; pp[q++] = R[k].y; pp[q++] = R[k].z;
      }
    }
    S.lp.needsUpdate = S.pp.needsUpdate = true;
  }
};

// ------------------------------------------------------------------ the road's finish
// Iridescent, HYPERCUBE's way: the glass is cut like a floor of cubes seen corner-on (three rhombus facets to each
// hexagon), and each facet is a thin film that turns colour with the angle you see it from, so the paving shifts
// under you as you drive and every corner re-deals it. With both worlds open the film runs red through magenta and
// violet to blue, the two worlds' colours and what lies between them. Through a lens there's only that lens's
// colour, from deep to hot.
const IRI = { uIriTint: { value: new THREE.Color(1, 1, 1) }, uIriBoth: { value: 1 }, uIriT: { value: 0 }, uIriK: { value: 1 } };
function iridescent(world) {
  for (const mask of [M.ALL, M.R, M.B, M.RO, M.BO, M.X]) {
    const mat = world.layers.materials(mask).road;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev?.(sh, r);
      Object.assign(sh.uniforms, IRI);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vIriP;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvIriP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vIriP;\nuniform vec3 uIriTint;\nuniform float uIriBoth;\nuniform float uIriT;\nuniform float uIriK;')
        .replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
          {
            vec3 iv = cameraPosition - vIriP;
            float idist = length(iv);
            float icos = abs(iv.y) / max(idist, 0.001);
            // which facet of which cube
            vec2 ip = vIriP.xz / 4.2;
            const vec2 is = vec2(1.0, 1.7320508);
            vec4 ic = floor(vec4(ip, ip - vec2(0.5, 1.0)) / is.xyxy) + 0.5;
            vec4 ih = vec4(ip - ic.xy * is, ip - (ic.zw + 0.5) * is);
            vec4 ir = dot(ih.xy, ih.xy) < dot(ih.zw, ih.zw) ? vec4(ih.xy, ic.xy) : vec4(ih.zw, ic.zw + 0.5);
            float iang = mod(atan(ir.y, ir.x) - 0.5235988, 6.2831853);
            float facet = floor(iang / 2.0943951);
            // a dark seam where facets meet
            float iw = fract(iang / 2.0943951);
            float seam = smoothstep(0.0, 0.07, min(iw, 1.0 - iw) * length(ir.xy) * 2.0);
            float inear = 1.0 - smoothstep(70.0, 260.0, idist);
            float ph = icos * 1.9 + idist * 0.0035 + uIriT * 0.04 + inear * (facet * 0.31 + dot(ir.zw, vec2(0.083, 0.047)));
            float iu = 0.5 - 0.5 * cos(6.2831853 * ph);
            vec3 film = mix(vec3(1.0, 0.1, 0.24), vec3(0.14, 0.55, 1.25), smoothstep(0.1, 0.9, iu)) + vec3(0.8, 0.1, 0.95) * (4.0 * iu * (1.0 - iu)) * 0.7;
            vec3 lens = uIriTint * (0.4 + 1.1 * iu);
            vec3 icol = mix(lens, film, uIriBoth);
            float fres = pow(1.0 - icos, 3.0);
            float ik = uIriK * (0.05 + 0.36 * fres) * mix(1.0, 0.55 + 0.45 * facet * 0.5, inear) * mix(1.0, seam, inear * 0.8);
            gl_FragColor.rgb += icol * ik;
          }`,
        );
    };
    const key = mat.customProgramCacheKey.call(mat);
    mat.customProgramCacheKey = () => `${key}|iri`;
    mat.needsUpdate = true;
  }
  world.animated.push((t) => {
    const tint = world.layers.level.get('tint');
    IRI.uIriT.value = t;
    if (!tint) return;
    IRI.uIriTint.value.copy(tint);
    const lo = Math.min(tint.r, tint.g, tint.b);
    IRI.uIriBoth.value = Math.min(1, Math.max(0, (lo - 0.35) / 0.6));
  });
}

// A cube on its corner, like the course: twelve edges.
const TILT = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.atan(Math.SQRT1_2), 0, Math.PI / 4));
function cornerCube(L, mask, p, s, yaw = 0, color = null) {
  const R = new THREE.Matrix4().makeRotationY(yaw).multiply(TILT);
  const P = [];
  for (let k = 0; k < 8; k++) P.push(new THREE.Vector3(k & 1 ? s : -s, k & 2 ? s : -s, k & 4 ? s : -s).multiplyScalar(0.5).applyMatrix4(R).add(p));
  for (let k = 0; k < 8; k++) for (const bit of [1, 2, 4]) if (!(k & bit)) L.line(mask, P[k], P[k | bit], color);
}

// ------------------------------------------------------------------ the space around it (game/env.js)
// Everywhere else the floor is a square grid and the horizon a ring of ridges. Here the floor is the grid a floor of
// cubes makes seen corner-on (three directions of line, red, blue and the violet between), ringed with hexagons
// out from the figure, and the horizon is the next cube out: the course's own figure again, a mile across, its
// three top edges meeting over your head. A cube in a cube in a cube.
function tesseractEnv(env, world) {
  for (const o of [...(env.floorGrid || []), ...(env.ridges || [])]) o.visible = false;
  const y = world.floorY;
  const G = new THREE.Group();
  env.group.add(G);
  const seg = (pos, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const o = new THREE.LineSegments(g, mat);
    o.frustumCulled = false;
    G.add(o);
    return o;
  };
  // the floor: lines along the hexagon's three edge directions, through its corners
  const a = RO / 12;
  const h = a * Math.sin(60 * D);
  const far = 2100;
  const n = Math.ceil(far / h);
  const mid3 = new THREE.LineBasicMaterial({ color: 0xb04cff, transparent: true, opacity: 0.5 });
  [env.gridMat, env.gridMatB, mid3].forEach((mat, k) => {
    const dir = k * 60 * D; // the lines run this way
    const cx = Math.cos(dir);
    const cz = Math.sin(dir);
    const pos = [];
    for (let q = -n; q <= n; q++) {
      const ox = -cz * q * h;
      const oz = cx * q * h;
      const half = Math.sqrt(Math.max(0, far * far - (q * h) ** 2));
      pos.push(ox - cx * half, y, oz - cz * half, ox + cx * half, y, oz + cz * half);
    }
    seg(pos, mat);
  });
  // hexagons out from the figure across the floor, each a step fainter
  const ringA = [];
  const ringB = [];
  for (let k = 0; k < 7; k++) {
    const r = RO * (1.25 + k * 0.25);
    for (let q = 0; q < 6; q++) {
      const p0 = pol(ANG[q], r, 0);
      const p1 = pol(ANG[(q + 1) % 6], r, 0);
      for (const d of [0, 1.2, 2.4]) (k % 2 ? ringB : ringA).push(p0.x, y + 0.3 + d * 0, p0.z, p1.x, y + 0.3, p1.z, p0.x * (1 + d / r), y + 0.3, p0.z * (1 + d / r), p1.x * (1 + d / r), y + 0.3, p1.z * (1 + d / r));
    }
  }
  seg(ringA, env.mtnMat);
  seg(ringB, env.mtnMatB);
  // the next cube out
  const R2 = 1750;
  const HI = 520;
  const APEX = 1500;
  const faintA = new THREE.LineBasicMaterial({ color: 0xff2a4a, fog: false, transparent: true, opacity: 0.3, depthWrite: false });
  const faintB = faintA.clone();
  const rim = ANG.map((ang, k) => new THREE.Vector3(R2 * Math.cos(ang * D), y + (k % 2 ? 0 : HI), R2 * Math.sin(ang * D)));
  const apex = new THREE.Vector3(0, y + APEX, 0);
  const edgeA = [];
  const edgeB = [];
  const fat = (out, p, q) => {
    // (three lines a little apart: some weight at this distance)
    for (const d of [0, 7, 14]) out.push(p.x, p.y + d, p.z, q.x, q.y + d, q.z);
  };
  for (let k = 0; k < 6; k++) fat(k % 2 ? edgeA : edgeB, rim[k], rim[(k + 1) % 6]);
  for (const k of [0, 2, 4]) fat(edgeB, rim[k], apex);
  // (the low corners stand on the floor: a stub up from each, so the zigzag has feet)
  for (const k of [1, 3, 5]) fat(edgeA, rim[k], rim[k].clone().setY(y + 90));
  seg(edgeA, env.mtnMat);
  seg(edgeB, env.mtnMatB);
  // its three top faces: lines crowding toward the apex, as on the course's own faces
  const fa = [];
  const fb = [];
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const bil = (c, s, t, out) => out.copy(c[0]).multiplyScalar((1 - s) * (1 - t)).addScaledVector(c[1], s * (1 - t)).addScaledVector(c[2], s * t).addScaledVector(c[3], (1 - s) * t);
  [0, 2, 4].forEach((k, f) => {
    const c = [apex, rim[k], rim[(k + 1) % 6], rim[(k + 2) % 6]];
    for (const s of [0.88, 0.76, 0.64, 0.53, 0.43, 0.34, 0.26, 0.19, 0.13, 0.08]) {
      for (const flip of [0, 1]) {
        for (let q = 0; q < 4; q++) {
          const t0 = (s * q) / 4;
          const t1 = (s * (q + 1)) / 4;
          if (flip) (bil(c, s, t0, v), bil(c, s, t1, w));
          else (bil(c, t0, s, v), bil(c, t1, s, w));
          (f % 2 ^ flip ? fa : fb).push(v.x, v.y, v.z, w.x, w.y, w.z);
        }
      }
    }
  });
  seg(fa, faintA);
  seg(fb, faintB);
  G.traverse((o) => (o.renderOrder = -1));
  const c = new THREE.Color();
  return () => {
    mid3.color.copy(env.gridMat.color).lerp(env.gridMatB.color, 0.5);
    faintA.color.copy(env.tint.grid);
    faintB.color.copy(env.tint.gridB);
    void c;
  };
}

// ------------------------------------------------------------------ scenery (world/decor.js)
export function tesseractDecor(world, L, main) {
  world.floorY = Math.min(world.floorY, -3 * UO - 10); // under the lowest corner of any pose
  world.frame = new Frame(world);
  world.group.add(world.frame.group);
  // gates over the road: a square inside a square joined at the corners, a tesseract's own shadow, the two
  // squares swapping worlds from gate to gate
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);
  const step = Math.round(118 / main.ds);
  for (let i = Math.round(60 / main.ds), k = 0; i < main.N - 10; i += step, k++) {
    if (Math.abs(main.curv[i]) > 0.008) continue;
    const c = main.point(i, 0, 0);
    const u = V(main.rightX(i), 0, main.rightZ(i));
    const sq = (w, y0, y1) => [[-w, y0], [w, y0], [w, y1], [-w, y1]].map(([a, b]) => c.clone().addScaledVector(u, a).addScaledVector(UP, b));
    const A = sq(main.halfW + 6, -1, 17);
    const B = sq(main.halfW + 1.6, 6.5, 12.5);
    const [ma, mb] = k % 2 ? [M.R, M.B] : [M.B, M.R];
    for (let q = 0; q < 4; q++) {
      if (q !== 0) L.line(ma, A[q], A[(q + 1) % 4]);
      L.line(mb, B[q], B[(q + 1) % 4]);
      L.line(M.X, A[q], B[q], COLORS.violet);
    }
    L.quad(mb, B[2], B[3], B[3].clone().add(V(0, -0.7, 0)), B[2].clone().add(V(0, -0.7, 0)), null, 0.5);
    L.quad(ma, A[2], A[3], A[3].clone().add(V(0, -0.9, 0)), A[2].clone().add(V(0, -0.9, 0)), null, 0.45);
  }
  // Nothing here is scattered. Cubes in cubes hang on a lattice (the floor's own, every fourth point, at three
  // heights), all on their corners and all facing the same way, like the atoms of a crystal the course was cut from.
  const rng = world.rng;
  const nearRoad = (x, z, r) => {
    for (const path of world.paths) for (let q = 0; q < path.N; q += 3) if (Math.hypot(path.px[q] - x, path.pz[q] - z) < r + path.halfW) return true;
    return false;
  };
  const A = RO / 3;
  const LEVELS = [world.floorY + 16, 185, 270];
  for (let j = -7; j <= 7; j++) {
    for (let i = -8; i <= 8; i++) {
      const x = (i + j / 2) * A;
      const z = j * A * Math.sin(60 * D);
      const d = Math.hypot(x, z);
      if (d < 60 || d > 1250) continue;
      const lv = (((i - j) % 3) + 3) % 3;
      if (lv === 0 && nearRoad(x, z, 26)) continue;
      const s = lv === 0 ? 15 : 11 + lv * 5;
      const p = V(x, LEVELS[lv] + (lv === 0 ? s * 0.4 : 0), z);
      const [ma, mb] = (i + j) % 2 ? [M.R, M.B] : [M.B, M.R];
      cornerCube(L, ma, p, s);
      cornerCube(L, mb, p, s * 0.45);
      // (the ones on the floor are lit from inside)
      if (lv === 0) cornerCube(L, M.X, p, s * 0.2, 0, COLORS.pink);
    }
  }
  // Out past the figure, stacks: a cube on a cube on a cube, each six tenths of the one under it, turning as they go
  // up. One on each of the floor's rings' corners.
  for (let k = 0; k < 12; k++) {
    const ang = k * 30 + 15;
    const r = k % 2 ? 1130 : 940;
    const x = r * Math.cos(ang * D);
    const z = r * Math.sin(ang * D);
    if (nearRoad(x, z, 70)) continue;
    let s = 84;
    let y0 = world.floorY;
    for (let q = 0; q < 5; q++) {
      const mask = (k + q) % 2 ? M.R : M.B;
      L.box(mask, x, y0 + s / 2, z, s, s, s, ang * D + q * 0.5236, null, true);
      L.box(mask === M.R ? M.B : M.R, x, y0 + s / 2, z, s * 0.5, s * 0.5, s * 0.5, ang * D + q * 0.5236, null, false);
      y0 += s;
      s *= 0.6;
    }
  }
  void rng;
  iridescent(world);
  // one lap, so nothing here is left to find on the next: a board before each lens road, in its lens's colour, and
  // one before each fold line
  for (const p of world.paths) {
    const b = p.def;
    if (b?.cell !== 'outer') continue;
    const blue = b.mask === M.BO;
    addSign(world, main, main.index(b.from) - Math.round(80 / main.ds), p.side, b.label, blue ? 'BLUE LENS · ROUND THE SUMMIT' : 'RED LENS · UNDER THE PIT', blue ? M.B : M.R, p.side);
  }
  FOLD.at.forEach((u, k) => addSign(world, main, main.index(u) - Math.round(150 / main.ds), 0, 'FOLD LINE', `THE TESSERACT TURNS ${FOLD.names[k + 1]}`, M.X));
  // the board over the grid: what this place does
  const i = main.wrap(Math.round(46 / main.ds));
  const W = 13;
  const H = (W * 200) / 512;
  const mat = new THREE.MeshBasicMaterial({ map: boardTexture('THE TESSERACT TURNS', 'TWICE A LAP · THE ROAD GOES WITH IT', 0xff4fd8, 0), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  const p = main.point(i, 0, 0);
  board.position.set(p.x, p.y + 7 + H / 2, p.z);
  board.rotation.y = Math.atan2(-main.thx[i], -main.thz[i]);
  board.renderOrder = 10;
  world.group.add(board);
  const a = main.point(i, -main.halfW - 0.5, 0);
  const b = main.point(i, main.halfW + 0.5, 0);
  for (const q of [a, b]) L.lineXYZ(M.ALL, q.x, q.y, q.z, q.x, q.y + 7.6, q.z, 0xff4fd8);
  L.lineXYZ(M.ALL, a.x, a.y + 7.6, a.z, b.x, b.y + 7.6, b.z, 0xff4fd8);
}

// ------------------------------------------------------------------ the sky (game/skypieces.js)
// A tesseract turning in the fourth dimension, hung at the horizon over the start straight. Its sixteen corners are
// (±1, ±1, ±1, ±1); the eight with w = -1 are the red world's cube and the eight with w = +1 the blue world's, and
// the eight edges along w join them. Turning it in the x-w plane carries each cube through the other: the red one
// swells, flattens to a face and comes back inside out as the blue one shrinks into the middle. Through a lens you
// see one cube alone.
export class HyperSky {
  constructor(matA, matB) {
    this.matA = matA;
    this.matB = matB;
    this.matC = matA.clone();
    this.group = new THREE.Group();
    this.v4 = [];
    for (let k = 0; k < 16; k++) this.v4.push([k & 1 ? 1 : -1, k & 2 ? 1 : -1, k & 4 ? 1 : -1, k & 8 ? 1 : -1]);
    const E = { a: [], b: [], c: [] };
    for (let k = 0; k < 16; k++) {
      for (let bit = 0; bit < 4; bit++) {
        if (k & (1 << bit)) continue;
        const j = k | (1 << bit);
        (bit === 3 ? E.c : k & 8 ? E.b : E.a).push([k, j]);
      }
    }
    this.sets = [];
    for (const [key, mat] of [['a', matA], ['b', matB], ['c', this.matC]]) {
      const edges = E[key];
      // each edge twice, a hair apart: a little weight at this distance
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edges.length * 12), 3).setUsage(THREE.DynamicDrawUsage));
      this.group.add(new THREE.LineSegments(g, mat));
      this.sets.push({ edges, P: g.getAttribute('position') });
    }
    this.p3 = this.v4.map(() => new THREE.Vector3());
    this.a = 0.6;
    this.b = 0;
    this.group.rotation.set(Math.atan(Math.SQRT1_2), 0.3, Math.PI / 4);
    this.spin = 0;
  }

  update(dt, tint) {
    HYPER.kick = Math.max(0, HYPER.kick - dt / FOLD.T);
    this.a += dt * (0.2 + HYPER.kick * 1.4);
    this.b += dt * 0.05;
    this.spin += dt * 0.04;
    const ca = Math.cos(this.a);
    const sa = Math.sin(this.a);
    const cb = Math.cos(this.b);
    const sb = Math.sin(this.b);
    const R = 150;
    const d = 2.7;
    for (let k = 0; k < 16; k++) {
      const [x, y, z, w] = this.v4[k];
      // turn in the x-w plane, and slowly in y-z
      const x1 = x * ca - w * sa;
      const w1 = x * sa + w * ca;
      const y1 = y * cb - z * sb;
      const z1 = y * sb + z * cb;
      const s = (d / (d - w1)) * R;
      this.p3[k].set(x1 * s, y1 * s, z1 * s);
    }
    for (const S of this.sets) {
      const arr = S.P.array;
      let o = 0;
      for (const [i, j] of S.edges) {
        const p = this.p3[i];
        const q = this.p3[j];
        for (const f of [1, 0.985]) {
          arr[o++] = p.x * f; arr[o++] = p.y * f; arr[o++] = p.z * f;
          arr[o++] = q.x * f; arr[o++] = q.y * f; arr[o++] = q.z * f;
        }
      }
      S.P.needsUpdate = true;
    }
    // one cube through a lens: in RED both tints are red, in BLUE both are blue
    const blueness = (c) => Math.min(1, Math.max(0, (c.b - c.r) * 1.6));
    const redLens = 1 - blueness(tint.gridB);
    const blueLens = blueness(tint.grid);
    this.matA.opacity = 0.9 * (1 - blueLens);
    this.matB.opacity = 0.9 * (1 - redLens);
    this.matC.opacity = 0.75 * (1 - Math.max(redLens, blueLens));
    this.matC.color.setRGB(0.69, 0.3, 1).multiplyScalar(0.9 + HYPER.kick);
  }
}
