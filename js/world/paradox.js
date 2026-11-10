// 14 RELATIVITY ROOM: a nod to the impossible-staircase pictures, where stairs run up the floor, the walls and the
// ceiling of one room, each with its own "down". The course is six stairs, one on each face of a cube room, joined by
// portals (rooms.js does the drawing), and a seventh, blue-only, floating in the middle of the room.
//
// For the physics it's an ordinary loop of road round a hexagonal ring of cells: each cell is one stair, and the road
// crosses from cell to cell (through a portal) at the ring's six spokes.
//
//   cell 0  THE FLOOR    the grid, then a WALL RUN only the red Blade rides
//   cell 1  a wall       a SPIRAL STAIR that climbs two full turns over itself; the RED INNER STAIR cuts inside it,
//                        through its own red portal
//   cell 2  the ceiling  a gentle fall, and the fork for the BLUE MIDDLE STAIR
//   cell 3  a wall       the FULL PIPE, then WATER the Skimmer skims
//   cell 4  a wall       MISSING STEPS (a red bridge, then a blue one), and the blue stair comes back in
//   cell 5  a wall       a SPIRAL STAIR two turns down, and a CORKSCREW home
//   cell 6  the middle   the BLUE MIDDLE STAIR, a long blue-only sweep round the room's centre

import * as THREE from '../../vendor/three.js';
import { M, COLORS } from './shift.js';

const D = Math.PI / 180;
const R = 300; // the road's radius round the ring
const RI = 170; // the inner hexagon (the middle cell)
const RO = 560; // the outer hexagon
const LOOP_R = 70;
export const ROOM_SIZE = 640;

const polar = (r, a, y) => [Math.cos(a * D) * r, Math.sin(a * D) * r, y];

// piecewise-linear heights by angle
function lerpKeys(keys, a) {
  for (let k = 0; k < keys.length - 1; k++) {
    const [a0, h0] = keys[k];
    const [a1, h1] = keys[k + 1];
    if (a >= a0 && a <= a1) return h0 + ((h1 - h0) * (a - a0)) / (a1 - a0 || 1);
  }
  return keys[a < keys[0][0] ? 0 : keys.length - 1][1];
}

// The main loop: arcs of the ring, with a full loop spliced in where the road climbs (or falls) over itself.
function mainPoints() {
  const pts = [];
  const at = {}; // angle (degrees, rounded) -> control point index, for placing features
  const arc = (a0, a1, keys) => {
    for (let a = a0; a < a1 - 1e-6; a += 2.5) {
      at[Math.round(a * 2) / 2] = pts.length;
      pts.push(polar(R, a, lerpKeys(keys, a)));
    }
  };
  // a spiral out from the ring at angle aT: `turns` full left turns (outward) of radius LOOP_R, stacked over each
  // other, the height going h -> h + dh
  const loop = (aT, h, dh, turns = 1) => {
    const T = polar(R, aT, h);
    const t = [-Math.sin(aT * D), Math.cos(aT * D)];
    const o = [Math.cos(aT * D), Math.sin(aT * D)];
    at[`loop${aT}`] = pts.length;
    for (let f = 12; f < 360 * turns; f += 12) {
      const p = f * D;
      const x = T[0] + LOOP_R * (t[0] * Math.sin(p) + o[0] * (1 - Math.cos(p)));
      const z = T[1] + LOOP_R * (t[1] * Math.sin(p) + o[1] * (1 - Math.cos(p)));
      pts.push([x, z, h + (dh * f) / (360 * turns)]);
    }
  };
  arc(12, 90, [[0, 14], [60, 22], [90, 24]]);
  // two whole turns up a spiral staircase on the first wall, and two down on the last
  pts.push(polar(R, 90, 24));
  loop(90, 24, 30, 2);
  arc(90, 314, [[90, 54], [120, 56], [146, 55], [180, 48], [240, 38], [270, 32], [314, 32]]);
  pts.push(polar(R, 314, 32));
  loop(314, 32, -24, 2);
  arc(314, 372, [[314, 8], [327, 8], [354, 12], [360, 14], [372, 15.6]]);
  return { pts, at };
}

function cells() {
  const hexV = (r, a) => [Math.cos(a * D) * r, Math.sin(a * D) * r];
  const out = [];
  // the six faces: physics up turns to `up` (the wall's inward normal), the cell's radial direction to `right`
  const H = ROOM_SIZE / 2;
  const faces = [
    { name: 'ONTO THE FLOOR', up: [0, 1, 0], right: [1, 0, 0] },
    { name: 'UP THE WALL', up: [-1, 0, 0], right: [0, 1, 0] },
    { name: 'ONTO THE CEILING', up: [0, -1, 0], right: [1, 0, 0] },
    { name: 'UP THE WALL', up: [0, 0, -1], right: [1, 0, 0] },
    { name: 'UP THE WALL', up: [1, 0, 0], right: [0, 1, 0] },
    { name: 'UP THE WALL', up: [0, 0, 1], right: [-1, 0, 0] },
  ];
  for (let k = 0; k < 6; k++) {
    const a0 = k * 60;
    const a1 = a0 + 60;
    const f = faces[k];
    out.push({
      poly: [hexV(RI, a0), hexV(RO, a0), hexV(RO, a1), hexV(RI, a1)],
      radial: [Math.cos((a0 + 30) * D), Math.sin((a0 + 30) * D)],
      up: f.up,
      right: f.right,
      at: f.up.map((v) => -v * H),
      name: f.name,
    });
  }
  // the middle: floating in the centre of the room, tipped over
  out.push({
    poly: Array.from({ length: 6 }, (_, q) => hexV(RI, q * 60)),
    centreY: 44,
    at: [0, 0, 0],
    tilt: [0.62, 0.35, 0.48],
    name: 'INTO THE MIDDLE',
  });
  return out;
}

export function paradoxDef() {
  const { pts, at } = mainPoints();
  const A = (deg) => {
    // the control point nearest that angle round the ring
    let best = null;
    let bd = 2;
    for (const [key, k] of Object.entries(at)) {
      const d = Math.abs(Number(key) - deg);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best === null) throw new Error(`paradox: no control point near ${deg}°`);
    return best;
  };
  // the red inner stair: inside the spiral, up the ring at radius 240 and through its own portal. It eases in from
  // the road and back out to it, so the forks aren't hairpins.
  const redR = [[72, 268], [76, 258], [80, 250], [84, 244], ...[88, 92, 96, 100, 104, 108, 112].map((a) => [a, 240]), [116, 244], [120, 250], [124, 258], [128, 266]];
  const red = redR.map(([a, r]) => polar(r, a, 22.5 + ((55.5 - 22.5) * (a - 72)) / 56));
  // the blue middle stair: in from cell 2, round the room's centre, out into cell 4
  const bluePolar = [[245, 154], [200, 157], [160, 160], [125, 166], [100, 178], [84, 195], [78, 212], [80, 229], [92, 244], [118, 256], [155, 262], [200, 267], [245, 272]];
  const blue = bluePolar.map(([r, a], k) => polar(r, a, 54.5 - (22 * k) / (bluePolar.length - 1)));
  const xzy = (p) => [p[0], p[1], p[2]];
  return {
    id: 'relativity',
    num: '14',
    name: 'RELATIVITY ROOM',
    blurb: 'Stairs on every wall, portals between them. Every way is up.',
    decor: 'paradox',
    skyPiece: 'penrose',
    seed: 1111,
    // two long laps: learn the portals on the first, take the lens-only ones on the second
    laps: 2,
    sun: 0,
    floorDrop: 26,
    room: { size: ROOM_SIZE, cells: cells() },
    points: pts,
    features: (P) => ({
      branches: [
        { from: P(A(64)), to: P(A(136)), mask: M.RO, side: 1, label: 'RED INNER STAIR', via: red.map(xzy) },
        { from: P(A(146)), to: P(A(282)), mask: M.BO, side: 1, label: 'BLUE MIDDLE STAIR', via: blue.map(xzy) },
        // the form route (formroutes.js): on the floor, a wall only the Blade rides
        { from: P(A(26)), to: P(A(50)), mask: M.ALL, side: -1, lift: 9, label: 'WALL RUN', sub: 'RED CLINGS · OTHERS FALL', wallrun: { from: 0.28, to: 0.76, bank: 0.95 } },
      ],
      // MISSING STEPS: a red bridge and then a blue one (each lens gets a launcher over the other's)
      gaps: [{ at: P(A(246)), len: 30, mask: M.R, noRails: true }, { at: P(A(256)), len: 30, mask: M.B, noRails: true }],
      pipes: [{ at: P(A(187)), len: 175, ramp: 26 }],
      water: [{ at: P(A(224)), len: 60 }],
      screws: [{ at: P(A(327)), len: 140 }],
      obstacles: [
        { type: 'block', at: P(A(268)), lat: -0.45, mask: M.R, size: 3.4 },
        { type: 'block', at: P(A(270)), lat: 0.45, mask: M.B, size: 3.4 },
        { type: 'block', at: P(A(272.5)), lat: 0, mask: M.R, size: 3 },
      ],
      boosts: [
        { at: P(A(20)) }, { at: P(A(104)), lat: -0.4 }, { at: P(A(170)), mask: M.RO, lat: 0.3 }, { at: P(A(238)) },
        { at: P(A(262)), mask: M.BO, lat: 0.4 }, { at: P(A(322)) }, { path: 'b0', at: 0.5 }, { path: 'b1', at: 0.6 },
      ],
      shards: [{ at: P(A(56)), n: 3 }, { at: P(A(140)), n: 3, lat: -0.4 }, { at: P(A(290)), n: 3, mask: M.B }],
    }),
  };
}

// ------------------------------------------------------------------ scenery
// Under every stretch of road, a stair stringer: treads and risers stepping down its sides, so a climbing road reads
// as a staircase. Round each spiral, a column it winds about. Along the ring, Escher arches over the road.
export function decorParadox(world, L) {
  const room = world.room;
  for (const path of world.paths) {
    const hw = path.halfW;
    const last = path.closed ? path.N : path.N - 1;
    const step = 2;
    for (let i = 0; i + step < last; i += step) {
      const j = path.wrap(i + step);
      if (room) L.region = room.regionOf(path, i);
      if (!path.mask[i] || path.warpK?.[i] > 0 || path.warpK?.[j] > 0) continue;
      const col = path.mask[i] === M.ALL ? null : undefined;
      for (const s of [-1, 1]) {
        const c = col === null ? (s < 0 ? COLORS.red : COLORS.blue) : undefined;
        const a = path.point(i, s * (hw + 0.25), -0.7);
        const b = path.point(j, s * (hw + 0.25), -0.7);
        // tread level with the lower end, riser up to the higher
        const lo = a.y < b.y ? a : b;
        const hi = a.y < b.y ? b : a;
        const mid = (lo === a ? b : a).clone().setY(lo.y);
        L.line(path.mask[i], lo, mid, c);
        L.line(path.mask[i], mid, hi, c);
        // and the stringer's underside, a little below
        if (i % 6 === 0) L.line(path.mask[i], a, a.clone().setY(a.y - 2.2), c);
      }
    }
  }
  L.region = -1;
  // columns at the heart of each spiral, standing on the cell's floor
  const m = world.main;
  for (const aT of [90, 314]) {
    const o = [Math.cos(aT * D), Math.sin(aT * D)];
    const cx = Math.cos(aT * D) * R + o[0] * LOOP_R;
    const cz = Math.sin(aT * D) * R + o[1] * LOOP_R;
    if (room) L.region = room.cellAt(cx, cz).k;
    const top = m.maxY + 22;
    L.cylinder(M.ALL, cx, world.floorY, cz, 14, top - world.floorY, 12, 10, 0xb06aff);
    L.cylinder(M.R, cx, world.floorY, cz, 20, top - world.floorY, 8, 3);
    L.cylinder(M.B, cx, world.floorY, cz, 24, top - world.floorY, 8, 3);
  }
  // arches over the road: half-hexagon doorways, red and blue in turn
  for (let i = 30; i < m.N; i += 55) {
    if (room && room.regionOf(m, i) < 0) continue;
    if (m.warpK?.[i] > 0) continue;
    if (room) L.region = room.regionOf(m, i);
    const c = m.point(i, 0, 0);
    const u = new THREE.Vector3(m.rightX(i), 0, m.rightZ(i));
    const k = Math.floor(i / 55);
    const mask = k % 2 ? M.R : M.B;
    const r = m.halfW + 5;
    let prev = null;
    for (let q = 0; q <= 4; q++) {
      const ang = (q / 4) * Math.PI;
      const p = c.clone().addScaledVector(u, Math.cos(ang) * r).add(new THREE.Vector3(0, Math.sin(ang) * r * 1.1, 0));
      if (prev) {
        L.line(mask, prev, p);
        L.quad(mask, prev, p, p.clone().add(new THREE.Vector3(0, 1.2, 0)), prev.clone().add(new THREE.Vector3(0, 1.2, 0)), null, 0.45);
      }
      prev = p;
    }
  }
  L.region = -1;
}

// The room itself: a cube of neon edges, each face a grid in one world's colour (the face goes ghostly through the
// other lens), and floating flights of stairs, in every orientation, that nobody drives.
export function buildRoomFrame(world) {
  const group = new THREE.Group();
  const H = ROOM_SIZE / 2;
  const bufs = new Map();
  const put = (mask, a, b, col) => {
    let B = bufs.get(mask);
    if (!B) bufs.set(mask, (B = { p: [], c: [] }));
    B.p.push(...a, ...b);
    const c = new THREE.Color(col);
    B.c.push(c.r, c.g, c.b, c.r, c.g, c.b);
  };
  // the edges
  const corners = [];
  for (const x of [-H, H]) for (const y of [-H, H]) for (const z of [-H, H]) corners.push([x, y, z]);
  for (let a = 0; a < 8; a++) {
    for (let b = a + 1; b < 8; b++) {
      const d = corners[a].reduce((s, v, k) => s + (v !== corners[b][k] ? 1 : 0), 0);
      if (d === 1) put(M.ALL, corners[a], corners[b], 0xd8b0ff);
    }
  }
  // the faces' grids
  const faces = [
    [0, -H, M.B], [0, H, M.R], [1, -H, M.R], [1, H, M.B], [2, -H, M.B], [2, H, M.R],
  ];
  const step = 40;
  for (const [ax, at, mask] of faces) {
    const u = (ax + 1) % 3;
    const v = (ax + 2) % 3;
    const col = mask === M.R ? 0xc0204a : 0x1f56b8;
    for (let s = -H; s <= H + 1e-6; s += step) {
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      a[ax] = b[ax] = at;
      a[u] = s;
      a[v] = -H;
      b[u] = s;
      b[v] = H;
      put(mask, a, b, col);
      const c = [0, 0, 0];
      const d = [0, 0, 0];
      c[ax] = d[ax] = at;
      c[v] = s;
      c[u] = -H;
      d[v] = s;
      d[u] = H;
      put(mask, c, d, col);
    }
  }
  // floating flights: ten steps each, axis-aligned in a random one of the six "downs"
  let s = 4242;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let k = 0; k < 16; k++) {
    // somewhere in the shell between the stairs on the walls and the middle
    const c = [0, 0, 0].map(() => (rnd() - 0.5) * H * 1.3);
    if (Math.hypot(...c) < 140) continue;
    const up = axes[Math.floor(rnd() * 6)];
    let fwd = axes[Math.floor(rnd() * 6)];
    if (fwd.some((v, q) => v !== 0 && up[q] !== 0)) fwd = axes[(axes.indexOf(up) + 2) % 6];
    const side = [up[1] * fwd[2] - up[2] * fwd[1], up[2] * fwd[0] - up[0] * fwd[2], up[0] * fwd[1] - up[1] * fwd[0]];
    const mask = k % 2 ? M.R : M.B;
    const col = mask === M.R ? COLORS.red : COLORS.blue;
    const at = (f, h, w) => c.map((v, q) => v + fwd[q] * f + up[q] * h + side[q] * w);
    const W = 5;
    for (let st = 0; st < 10; st++) {
      const f0 = st * 3;
      const h0 = st * 2;
      for (const w of [-W, W]) {
        put(mask, at(f0, h0, w), at(f0, h0 + 2, w), col);
        put(mask, at(f0, h0 + 2, w), at(f0 + 3, h0 + 2, w), col);
      }
      put(mask, at(f0, h0 + 2, -W), at(f0, h0 + 2, W), col);
    }
    put(mask, at(0, -3, -W), at(30, 17, -W), col);
    put(mask, at(0, -3, W), at(30, 17, W), col);
  }
  for (const [mask, B] of bufs) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    const o = new THREE.LineSegments(g, world.layers.materials(mask).line);
    o.frustumCulled = false;
    group.add(o);
  }
  return group;
}
