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
    // the corners: a cube in a cube, blue outside and red inside, a little above each one
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
      g.userData = { id, c, inner };
      this.group.add(g);
      this.nodes.push(g);
    }
    this.pos = new Map();
    this.floor = world.floorY;
    this.set([1, 0, 0]);
    world.animated.push((t) => {
      for (const g of this.nodes) g.userData.inner.rotation.y = t * 0.9;
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
    for (const g of this.nodes) g.position.copy(this.pos.get(g.userData.id)).y += 13;
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
  // cubes in cubes adrift around the figure, out of the road's way
  const rng = world.rng;
  for (let k = 0; k < 150; k++) {
    const a = rng() * Math.PI * 2;
    const d = 80 + rng() * 1000;
    const p = V(Math.cos(a) * d, world.floorY + 14 + rng() * 230, Math.sin(a) * d);
    let near = false;
    for (const path of world.paths) for (let q = 0; q < path.N && !near; q += 4) near = Math.hypot(path.px[q] - p.x, path.pz[q] - p.z) < 34;
    if (near) continue;
    const s = 5 + rng() * 13;
    const yaw = rng() * 3;
    const [ma, mb] = k % 2 ? [M.R, M.B] : [M.B, M.R];
    L.box(ma, p.x, p.y, p.z, s, s, s, yaw, null, true);
    L.box(mb, p.x, p.y, p.z, s * 0.45, s * 0.45, s * 0.45, yaw, null, false);
  }
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
