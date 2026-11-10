// 14 RELATIVITY ROOM: a nod to the impossible-staircase pictures, where stairs run up the floor, the walls and the
// ceiling of one room, each with its own "down". The course is six stairs, one on each face of a cube room, joined by
// portals (rooms.js does the drawing), and a seventh, blue-only, floating in the middle of the room.
//
// For the physics it's an ordinary loop of road round a hexagonal ring of cells: each cell is one stair, and the road
// crosses from cell to cell (through a portal) at the ring's six spokes.
//
//   THE FLOOR      the grid, then a WALL RUN only the red Blade rides
//   a flying stair across the room
//   a wall         a SPIRAL STAIR that climbs two full turns over itself; the RED INNER STAIR cuts inside it and
//                  out through its own red portal
//   a flying stair the fork for the BLUE MIDDLE STAIR
//   the ceiling    the FULL PIPE, then WATER the Skimmer skims
//   a flying stair MISSING STEPS (a red bridge, then a blue one)
//   a wall         blocks, and the blue stair comes back in
//   a wall         a SPIRAL STAIR two turns down, and a CORKSCREW home
//   the middle     two cells tipped different ways: the BLUE MIDDLE STAIR sweeps through both

import * as THREE from '../../vendor/three.js';
import { M, COLORS, RED, BLUE } from './shift.js';

const D = Math.PI / 180;
const R = 300; // the road's radius round the ring
const RI = 170; // the inner hexagon (the middle cell)
const RO = 560; // the outer hexagon
const LOOP_R = 70;
export const ROOM_SIZE = 520;
// the stairwell's frame: a box round everything, [centre], [size]
const FRAME = { c: [-70, 30, 40], d: [460, 400, 620] };

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

// The cells, by the angles the ring is cut at. The room is a tight STAIRWELL that bends the way the road does: a
// floor stair, a ceiling stair hung just overhead and running the other way (so rivals come at you upside down, just
// out of reach), a stair up each wall beside them, and FLYING STAIRS that cross the well at angles of their own. The
// middle of the ring is two more cells, tipped different ways, that the blue stair winds through.
//
// A stair is placed by where its stretch of road's midpoint goes: at ring angle phi along the well, `out` metres
// toward the outside of the bend and `lift` metres up.
const CUTS = [356, 56, 76, 142, 184, 236, 262, 300];
const wellAt = (phi, out = 0, lift = 0) => [-R + (R + out) * Math.cos(phi * D), lift, (R + out) * Math.sin(phi * D)];
function cells() {
  const V = (r, a) => [Math.cos(a * D) * r, Math.sin(a * D) * r];
  const rad = (phi) => [Math.cos(phi * D), 0, Math.sin(phi * D)];
  const neg = (v) => v.map((x) => -x);
  // y: the road's height at the middle of the stretch
  const floor = (name, phi, lift, y) => ({ name, up: [0, 1, 0], right: rad(phi), at: wellAt(phi, 0, lift), y });
  const ceil = (name, phi, lift, y) => ({ name, up: [0, -1, 0], right: rad(phi), at: wellAt(phi, 0, lift), y });
  // a wall stair: on the outside of the bend (side 1) or the inside (-1), its spiral standing up (1) or hanging (-1)
  const wall = (name, phi, side, spiral, out, lift, y) => ({ name, up: side > 0 ? neg(rad(phi)) : rad(phi), right: [0, spiral, 0], at: wellAt(phi, out, lift), y });
  // a flying stair: turned by `tilt` about the middle of its stretch of road
  const fly = (at, tilt, y) => ({ name: 'ACROSS THE WELL', at, tilt, y });
  const kinds = [
    floor('ONTO THE FLOOR', 0, 0, 17.5),
    fly(wellAt(36, -4, 62), [0.9, 0.3, 1.9], 22.4),
    wall('UP THE WALL', -6, 1, 1, 34, 6, 55.5),
    fly(wellAt(-24, 4, 74), [-0.5, 1.2, 2.6], 51.5),
    ceil('ONTO THE CEILING', -4, 38, 43),
    fly(wellAt(26, 84, 14), [1.5, -0.6, 0.4], 36.2),
    wall('UP THE WALL', 20, -1, 1, -42, 20, 32),
    wall('UP THE WALL', 12, 1, -1, 26, -46, 8),
  ];
  const out = [];
  for (let k = 0; k < CUTS.length; k++) {
    const a0 = CUTS[k];
    let a1 = CUTS[(k + 1) % CUTS.length];
    if (a1 < a0) a1 += 360;
    const mid = (a0 + a1) / 2;
    const c = kinds[k];
    out.push({
      ...c,
      poly: [V(RI, a0), V(RO, a0), V(RO, a1), V(RI, a1)],
      radial: [Math.cos(mid * D), Math.sin(mid * D)],
      origin: polar(R, mid, c.y),
    });
  }
  // the middle, cut in two along the line from 30° to 210°: each half floats over the well tipped its own way
  const edge = (th, a0, a1) => V((RI * Math.cos(((a1 - a0) / 2) * D)) / Math.cos((th - (a0 + a1) / 2) * D), th);
  const p30 = edge(30, -4, 56);
  const p210 = edge(210, 184, 236);
  out.push({ poly: [p30, V(RI, 56), V(RI, 76), V(RI, 142), V(RI, 184), p210], centreY: 44, at: wellAt(-34, -30, 86), tilt: [0.62, 0.35, 0.48], name: 'INTO THE MIDDLE' });
  out.push({ poly: [p210, V(RI, 236), V(RI, 262), V(RI, 300), V(RI, 356), p30], centreY: 44, at: wellAt(52, -20, 80), tilt: [-0.75, 1.3, -0.5], name: 'THROUGH THE MIDDLE' });
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
  // the red inner stair: inside the spiral, up the ring at radius 240, and out through its own red portal onto the
  // flying stair beyond. It eases in from the road and back out to it, so the forks aren't hairpins.
  const redR = [[86, 268], [90, 258], [94, 250], [98, 244], ...[102, 106, 110, 114, 118, 122, 126, 130].map((a) => [a, 240]), [134, 244], [138, 250], [142, 258], [146, 266]];
  const red = redR.map(([a, r]) => polar(r, a, 23 + ((54.5 - 23) * (a - 86)) / 60));
  // the blue middle stair: in off a flying stair, round the room's centre through both halves of the middle, and out
  // onto a wall
  const bluePolar = [[245, 168], [200, 170], [160, 172], [125, 176], [100, 186], [84, 200], [78, 214], [80, 230], [92, 246], [118, 258], [155, 266], [200, 270], [245, 274]];
  const blue = bluePolar.map(([r, a], k) => polar(r, a, 52 - (21 * k) / (bluePolar.length - 1)));
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
        { from: P(A(78)), to: P(A(155)), mask: M.RO, side: 1, label: 'RED INNER STAIR', via: red.map(xzy) },
        { from: P(A(160)), to: P(A(284)), mask: M.BO, side: 1, label: 'BLUE MIDDLE STAIR', via: blue.map(xzy) },
        // the form route (formroutes.js): on the floor, a wall only the Blade rides
        { from: P(A(26)), to: P(A(50)), mask: M.ALL, side: -1, lift: 9, label: 'WALL RUN', sub: 'RED CLINGS · OTHERS FALL', wallrun: { from: 0.28, to: 0.76, bank: 0.95 } },
      ],
      // MISSING STEPS: a red bridge and then a blue one (each lens gets a launcher over the other's)
      gaps: [{ at: P(A(246)), len: 30, mask: M.R, noRails: true }, { at: P(A(256)), len: 30, mask: M.B, noRails: true }],
      pipes: [{ at: P(A(187)), len: 175, ramp: 26 }],
      water: [{ at: P(A(222)), len: 60 }],
      screws: [{ at: P(A(325)), len: 140 }],
      obstacles: [
        { type: 'block', at: P(A(268)), lat: -0.45, mask: M.R, size: 3.4 },
        { type: 'block', at: P(A(270)), lat: 0.45, mask: M.B, size: 3.4 },
        { type: 'block', at: P(A(272.5)), lat: 0, mask: M.R, size: 3 },
      ],
      boosts: [
        { at: P(A(20)) }, { at: P(A(104)), lat: -0.4 }, { at: P(A(176)), mask: M.RO, lat: -0.3 }, { at: P(A(241)) },
        { at: P(A(266)), mask: M.BO, lat: 0.4 }, { at: P(A(322)) }, { path: 'b0', at: 0.5 }, { path: 'b1', at: 0.6 },
      ],
      shards: [{ at: P(A(62)), n: 3 }, { at: P(A(66)), n: 3, lat: -0.4, mask: M.R }, { at: P(A(290)), n: 3, mask: M.B }],
    }),
  };
}

// ------------------------------------------------------------------ scenery
// The room's own look: lamp-lit architecture. Red and blue are still the two worlds; everything that belongs to both
// (door frames, lanterns, columns) is GOLD, which no other course uses, and through a lens it goes that lens's colour
// like every neutral piece.
const GOLD = 0xffc24a;

// THE ROAD'S FINISH: mother-of-pearl laid in tumbling blocks, the three-rhombus tiling that reads as cubes lit from
// whichever side you decide is up. Each rhombus takes a different step of the sheen, and the sheen slides with the
// angle you see it at, so a stair overhead (seen flat on) and the one under you (seen along it) are never the same
// colour. With both worlds open it runs red through violet to blue. Through a lens (and on a road that belongs to one
// world) it only runs from dark to bright in that one colour, so nothing of the other world is left in it.
const IRI_T = { value: 0 };
const LINE_K = 0.7;
const TINT_R = new THREE.Color(1, 0.2, 0.28);
const TINT_B = new THREE.Color(0.18, 0.52, 1);
function patchIridescent(mat, u) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uIriTint;\nuniform float uIriMono;\nuniform float uIriT;')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        {
          vec3 iN = normalize(cross(dFdx(vWetP), dFdy(vWetP)));
          float ndv = abs(dot(iN, normalize(cameraPosition - vWetP)));
          // tumbling blocks: the nearest hexagon's centre, then which third of it
          vec2 ip = vWetP.xz / 5.0;
          const vec2 ir = vec2(1.0, 1.7320508);
          vec2 ia = mod(ip, ir) - ir * 0.5;
          vec2 ib = mod(ip - ir * 0.5, ir) - ir * 0.5;
          vec2 ig = dot(ia, ia) < dot(ib, ib) ? ia : ib;
          float ang = mod(atan(ig.y, ig.x) - 1.5707963 + 6.2831853, 6.2831853);
          float sec = floor(ang / 2.0943951);
          float sa = mod(ang, 2.0943951);
          float seam = min(sa, 2.0943951 - sa) * length(ig);
          float hexd = 0.5 - max(abs(ig.x), abs(ig.x) * 0.5 + abs(ig.y) * 0.8660254);
          float grout = 1.0 - smoothstep(0.0, 0.03, min(seam, hexd));
          float face = sec < 0.5 ? 1.0 : (sec < 1.5 ? 0.6 : 0.3);
          float glance = pow(1.0 - ndv, 1.5);
          float ph = sec * 0.19 + glance * 1.25 + vWetP.y * 0.013 + dot(iN.xz, vec2(0.45, 0.3)) + uIriT * 0.02;
          float t = abs(fract(ph) * 2.0 - 1.0);
          vec3 c0 = vec3(1.0, 0.13, 0.26), c1 = vec3(1.0, 0.25, 0.8), c2 = vec3(0.55, 0.28, 1.0), c3 = vec3(0.1, 0.5, 1.0), c4 = vec3(0.25, 0.8, 1.0);
          vec3 both = t < 0.25 ? mix(c0, c1, t * 4.0) : t < 0.5 ? mix(c1, c2, t * 4.0 - 1.0) : t < 0.75 ? mix(c2, c3, t * 4.0 - 2.0) : mix(c3, c4, t * 4.0 - 3.0);
          vec3 mono = uIriTint * (0.3 + 1.1 * t);
          vec3 ic = mix(both, mono, uIriMono);
          gl_FragColor.rgb += ic * ((0.1 + 0.3 * glance) * face + grout * 0.09);
        }`,
      );
  };
  const key = mat.customProgramCacheKey.call(mat);
  mat.customProgramCacheKey = () => `${key}|iri`;
}
function iridescentRoads(world) {
  const L = world.layers;
  let neutral = null;
  for (const mask of [M.ALL, M.R, M.B, M.RO, M.BO, M.X]) {
    const u = { uIriTint: { value: new THREE.Color(mask === M.ALL ? 0xffffff : mask === M.X ? 0xb04cff : mask & RED ? TINT_R : TINT_B) }, uIriMono: { value: mask === M.ALL ? 0 : 1 }, uIriT: IRI_T };
    patchIridescent(L.materials(mask).road, u);
    if (mask === M.ALL) neutral = u;
  }
  // the neutral road follows the lens each view is drawn for
  const update = L.update.bind(L);
  L.update = (dt, mode, time = 0, instant = false) => {
    update(dt, mode, time, instant);
    const lens = mode === RED || mode === BLUE;
    if (lens) neutral.uIriTint.value.copy(mode === RED ? TINT_R : TINT_B);
    const k = instant || !dt || L.views ? 1 : 1 - Math.exp(-10 * dt);
    neutral.uIriMono.value += ((lens ? 1 : 0) - neutral.uIriMono.value) * k;
    IRI_T.value = time;
    // (the well shows five or six stairs at once, all of them lines: a little under full brightness keeps the far
    // ones from adding up to white)
    for (const [mask, m] of L.mats) {
      if (mask === M.ALL) m.line.color.multiplyScalar(LINE_K);
      else m.line.color.setScalar(LINE_K);
    }
  };
}

// Under every road, down each side: flights of steps, six down and six back up, so from the side or from underneath
// (which is how you see every stair but your own) the road is a staircase. Along the ring, round arches on columns
// with a lantern hung in each. Round each spiral, the column it winds about.
export function decorParadox(world, L) {
  const room = world.room;
  iridescentRoads(world);
  const FLIGHT = 6;
  const RISE = 0.85;
  const WIDE = 1.9;
  for (const path of world.paths) {
    const hw = path.halfW;
    const last = path.closed ? path.N : path.N - 1;
    const tread = Math.max(1, Math.round(3 / path.ds));
    const depth = (n) => {
      const s = ((n % (2 * FLIGHT)) + 2 * FLIGHT) % (2 * FLIGHT);
      return 0.7 + RISE * (s < FLIGHT ? s + 1 : 2 * FLIGHT - s);
    };
    for (let i = 0, n = 0; i + tread <= last; i += tread, n++) {
      const j = path.wrap(i + tread);
      const mask = path.mask[i];
      let bad = !mask;
      for (let q = 0; q <= tread; q++) if (path.mask[path.wrap(i + q)] !== mask || path.warpK?.[path.wrap(i + q)] > 0) bad = true;
      if (bad) continue;
      if (room) {
        const ra = room.regionOf(path, i);
        L.region = ra === room.regionOf(path, path.wrap(j - 1)) ? ra : -1;
      }
      const d0 = depth(n);
      const d1 = depth(n + 1);
      for (const s of [-1, 1]) {
        const c = mask === M.ALL ? (s < 0 ? COLORS.red : COLORS.blue) : undefined;
        const lo = s * (hw + 0.25);
        const li = s * (hw - WIDE);
        const aT = path.point(i, lo, -0.6);
        const bT = path.point(j, lo, -0.6);
        const aO = path.point(i, lo, -d0);
        const bO = path.point(j, lo, -d0);
        const aI = path.point(i, li, -d0);
        const bI = path.point(j, li, -d0);
        const cO = path.point(j, lo, -d1);
        const cI = path.point(j, li, -d1);
        L.fillQuad(mask, aT, bT, bO, aO); // the flight's side
        L.fillQuad(mask, aO, bO, bI, aI); // the tread, from underneath
        L.fillQuad(mask, bO, cO, cI, bI); // the riser
        L.line(mask, aO, bO, c);
        L.line(mask, bO, cO, c);
        L.line(mask, bO, bI, c);
        L.line(mask, cO, cI, c);
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
    L.cylinder(M.ALL, cx, world.floorY, cz, 14, top - world.floorY, 12, 10, GOLD);
    // capitals, top and bottom
    for (const y of [world.floorY, top - 5]) L.cylinder(M.ALL, cx, y, cz, 18, 5, 12, 1, GOLD);
    L.cylinder(M.R, cx, world.floorY, cz, 20, top - world.floorY, 8, 3);
    L.cylinder(M.B, cx, world.floorY, cz, 24, top - world.floorY, 8, 3);
  }
  // arches over the road: a round arch on two columns, red and blue in turn, a gold lantern hung from its crown
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 30; i < m.N; i += 55) {
    if (room && room.regionOf(m, i) < 0) continue;
    if (m.warpK?.[i] > 0) continue;
    if (room) L.region = room.regionOf(m, i);
    const c = m.point(i, 0, 0);
    const u = new THREE.Vector3(m.rightX(i), 0, m.rightZ(i));
    const w = new THREE.Vector3(m.thx[i], 0, m.thz[i]);
    const k = Math.floor(i / 55);
    const mask = k % 2 ? M.R : M.B;
    const r = m.halfW + 4;
    const COL = 6; // the columns' height, to where the arch springs
    const at = (x, y, z) => c.clone().addScaledVector(u, x).addScaledVector(up, y).addScaledVector(w, z);
    const ring = (z, rr) => {
      const pts = [at(-rr, -3, z), at(-rr, COL, z)];
      for (let q = 1; q < 10; q++) pts.push(at(-Math.cos((q / 10) * Math.PI) * rr, COL + Math.sin((q / 10) * Math.PI) * rr * 0.62, z));
      pts.push(at(rr, COL, z), at(rr, -3, z));
      return pts;
    };
    const F = ring(-0.9, r);
    const B = ring(0.9, r);
    const O = ring(0, r + 1.8);
    for (let q = 0; q < F.length - 1; q++) {
      L.line(mask, F[q], F[q + 1]);
      L.line(mask, B[q], B[q + 1]);
      L.line(mask, O[q], O[q + 1]);
      L.quad(mask, F[q], F[q + 1], B[q + 1], B[q], null, 0.3);
      if (q % 2 === 0) L.line(mask, F[q], O[q]);
    }
    // capitals and feet
    for (const sx of [-1, 1]) for (const y of [-3, COL]) L.box(mask, c.x + u.x * sx * (r + 0.6), c.y + y, c.z + u.z * sx * (r + 0.6), 3.2, 0.9, 3.2, Math.atan2(u.x, u.z));
    // the lantern
    const top = at(0, COL + r * 0.62, 0);
    const lc = at(0, COL + r * 0.62 - 3.4, 0);
    L.line(M.ALL, top, lc.clone().addScaledVector(up, 1.3), GOLD);
    const P = [lc.clone().addScaledVector(up, 1.3), lc.clone().addScaledVector(up, -1.3), lc.clone().addScaledVector(u, 0.9), lc.clone().addScaledVector(u, -0.9), lc.clone().addScaledVector(w, 0.9), lc.clone().addScaledVector(w, -0.9)];
    const eq = [2, 4, 3, 5];
    for (let q = 0; q < 4; q++) {
      const e0 = P[eq[q]];
      const e1 = P[eq[(q + 1) % 4]];
      L.line(M.ALL, e0, e1, GOLD);
      L.line(M.ALL, P[0], e0, GOLD);
      L.line(M.ALL, P[1], e0, GOLD);
      L.quad(M.ALL, P[0], e0, e1, e1, GOLD, 0.5);
      L.quad(M.ALL, P[1], e0, e1, e1, GOLD, 0.5);
    }
  }
  L.region = -1;
}

// The room itself: a box of neon edges whose six walls are arcades, each wall in one world's colour (it's gone through
// the other lens) with its arches standing whichever way that wall thinks is up; and floating flights of stairs, in
// every orientation, that nobody drives but the red people and the blue people walking them.
export function buildRoomFrame(world) {
  const group = new THREE.Group();
  const bufs = new Map();
  const buf = (mask) => {
    let B = bufs.get(mask);
    if (!B) bufs.set(mask, (B = { p: [], c: [], rp: [], rc: [] }));
    return B;
  };
  const _col = new THREE.Color();
  const put = (mask, a, b, col) => {
    const B = buf(mask);
    B.p.push(...a, ...b);
    _col.set(col);
    B.c.push(_col.r, _col.g, _col.b, _col.r, _col.g, _col.b);
  };
  const ribbon = (mask, a, b, c, d, col, k) => {
    const B = buf(mask);
    B.rp.push(...a, ...b, ...c, ...a, ...c, ...d);
    _col.set(col).multiplyScalar(k);
    for (let q = 0; q < 6; q++) B.rc.push(_col.r, _col.g, _col.b);
  };
  const Hd = FRAME.d.map((v) => v / 2);
  const C = FRAME.c;
  // the edges
  const corners = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([C[0] + x * Hd[0], C[1] + y * Hd[1], C[2] + z * Hd[2]]);
  for (let a = 0; a < 8; a++) {
    for (let b = a + 1; b < 8; b++) {
      const d = corners[a].reduce((n, v, k) => n + (v !== corners[b][k] ? 1 : 0), 0);
      if (d === 1) put(M.ALL, corners[a], corners[b], GOLD);
    }
  }
  // the walls: rows of arched bays
  let fk = 0;
  for (const ax of [0, 1, 2]) {
    for (const sg of [-1, 1]) {
      const mask = fk % 2 ? M.R : M.B;
      // across the bays (p) and up them (q): each wall picks its own up
      const others = [0, 1, 2].filter((v) => v !== ax);
      const p = others[fk % 3 === 1 ? 1 : 0];
      const q = 3 - ax - p;
      const flip = fk % 4 < 2 ? 1 : -1;
      fk++;
      const col = mask === M.R ? 0xc0204a : 0x1f56b8;
      const dim = mask === M.R ? 0x70142c : 0x12346e;
      const np = Math.round((2 * Hd[p]) / 46);
      const nq = Math.round((2 * Hd[q]) / 72);
      const bw = (2 * Hd[p]) / np;
      const bh = (2 * Hd[q]) / nq;
      const P = (x, y) => {
        const v = [0, 0, 0];
        v[ax] = C[ax] + sg * Hd[ax];
        v[p] = C[p] - Hd[p] + x;
        v[q] = C[q] + flip * (-Hd[q] + y);
        return v;
      };
      for (let b = 0; b <= np; b++) put(mask, P(b * bw, 0), P(b * bw, 2 * Hd[q]), dim);
      for (let row = 0; row <= nq; row++) put(mask, P(0, row * bh), P(2 * Hd[p], row * bh), col);
      for (let row = 0; row < nq; row++) {
        for (let b = 0; b < np; b++) {
          const x0 = b * bw + 7;
          const x1 = (b + 1) * bw - 7;
          const y0 = row * bh;
          const ys = y0 + bh * 0.52;
          const rr = (x1 - x0) / 2;
          put(mask, P(x0, y0), P(x0, ys), col);
          put(mask, P(x1, y0), P(x1, ys), col);
          let prev = P(x0, ys);
          for (let s = 1; s <= 6; s++) {
            const a = (s / 6) * Math.PI;
            const nx = P(x0 + rr - Math.cos(a) * rr, ys + Math.sin(a) * rr);
            put(mask, prev, nx, col);
            prev = nx;
          }
          // a sill across the foot of every other bay
          if ((b + row) % 2) put(mask, P(x0, y0 + 6), P(x1, y0 + 6), dim);
        }
      }
    }
  }
  // floating flights: steps, a landing with a doorway, and someone walking them, in a random one of the six "downs"
  let s = 4242;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let k = 0; k < 48; k++) {
    // somewhere in the shell between the stairs on the walls and the middle
    const c = [0, 1, 2].map((q) => C[q] + (rnd() - 0.5) * FRAME.d[q] * 0.9);
    const steps = 8 + Math.floor(rnd() * 22);
    const up = axes[Math.floor(rnd() * 6)];
    let fwd = axes[Math.floor(rnd() * 6)];
    if (fwd.some((v, q) => v !== 0 && up[q] !== 0)) fwd = axes[(axes.indexOf(up) + 2) % 6];
    const side = [up[1] * fwd[2] - up[2] * fwd[1], up[2] * fwd[0] - up[0] * fwd[2], up[0] * fwd[1] - up[1] * fwd[0]];
    const mask = k % 2 ? M.R : M.B;
    const col = mask === M.R ? COLORS.red : COLORS.blue;
    const at = (f, h, w) => c.map((v, q) => v + fwd[q] * f + up[q] * h + side[q] * w);
    const W = 5;
    for (let st = 0; st < steps; st++) {
      const f0 = st * 3;
      const h0 = st * 2;
      for (const w of [-W, W]) {
        put(mask, at(f0, h0, w), at(f0, h0 + 2, w), col);
        put(mask, at(f0, h0 + 2, w), at(f0 + 3, h0 + 2, w), col);
      }
      put(mask, at(f0, h0 + 2, -W), at(f0, h0 + 2, W), col);
      // the tread, faintly lit, so a flight has a body
      ribbon(mask, at(f0, h0 + 2, -W), at(f0 + 3, h0 + 2, -W), at(f0 + 3, h0 + 2, W), at(f0, h0 + 2, W), col, st % 2 ? 0.1 : 0.05);
    }
    put(mask, at(0, -3, -W), at(steps * 3, steps * 2 - 3, -W), col);
    put(mask, at(0, -3, W), at(steps * 3, steps * 2 - 3, W), col);
    // a handrail up one side
    put(mask, at(0, 5.5, W), at(steps * 3, steps * 2 + 5.5, W), col);
    for (let st = 0; st <= steps; st += 3) put(mask, at(st * 3, st * 2, W), at(st * 3, st * 2 + 5.5, W), col);
    // a landing at the top, with a doorway arch on it
    const f1 = steps * 3;
    const h1 = steps * 2;
    put(mask, at(f1, h1, -W), at(f1 + 9, h1, -W), col);
    put(mask, at(f1, h1, W), at(f1 + 9, h1, W), col);
    put(mask, at(f1 + 9, h1, -W), at(f1 + 9, h1, W), col);
    put(mask, at(f1 + 9, h1, -W), at(f1 + 9, h1 + 9, -W), col);
    put(mask, at(f1 + 9, h1, W), at(f1 + 9, h1 + 9, W), col);
    let prev = at(f1 + 9, h1 + 9, -W);
    for (let q = 1; q <= 6; q++) {
      const a = (q / 6) * Math.PI;
      const nx = at(f1 + 9, h1 + 9 + Math.sin(a) * W * 0.8, -Math.cos(a) * W);
      put(mask, prev, nx, col);
      prev = nx;
    }
    // the walkers: faceless, mid-stride, each sure which way is down
    const walkers = 1 + Math.floor(rnd() * 3);
    for (let n = 0; n < walkers; n++) {
      const st = Math.floor(rnd() * steps);
      const lat = (rnd() - 0.5) * W * 1.2;
      const S = 2.1;
      const g = (f, h) => at(st * 3 + 1.5 + f * S, st * 2 + 2 + h * S, lat);
      const hot = mask === M.R ? COLORS.redHot : COLORS.blueHot;
      put(mask, g(0, 1.5), g(-0.5, 0), hot);
      put(mask, g(0, 1.5), g(0.45, 0.75), hot);
      put(mask, g(0.45, 0.75), g(0.5, 0), hot);
      put(mask, g(0, 1.5), g(0.05, 2.6), hot);
      put(mask, g(0.05, 2.45), g(0.5, 1.75), hot);
      put(mask, g(0.05, 2.45), g(-0.4, 1.8), hot);
      for (let q = 0; q < 6; q++) {
        const a0 = (q / 6) * Math.PI * 2;
        const a1 = ((q + 1) / 6) * Math.PI * 2;
        put(mask, g(0.05 + Math.cos(a0) * 0.3, 2.95 + Math.sin(a0) * 0.3), g(0.05 + Math.cos(a1) * 0.3, 2.95 + Math.sin(a1) * 0.3), hot);
      }
    }
  }
  const L = world.layers;
  for (const [mask, B] of bufs) {
    const mats = L.materials(mask);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    // (gold is neutral: through a lens it switches to grey, which the lens tint colours, like the layers' own)
    if (mask === M.ALL && L.neutral) {
      const grey = new Float32Array(B.c.length);
      for (let i = 0; i < grey.length; i += 3) grey[i] = grey[i + 1] = grey[i + 2] = Math.max(B.c[i], B.c[i + 1], B.c[i + 2]);
      L.neutral.push({ g, colour: g.getAttribute('color'), grey: new THREE.Float32BufferAttribute(grey, 3) });
    }
    const o = new THREE.LineSegments(g, mats.line);
    o.frustumCulled = false;
    group.add(o);
    if (B.rp.length) {
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(B.rp, 3));
      rg.setAttribute('color', new THREE.Float32BufferAttribute(B.rc, 3));
      const r = new THREE.Mesh(rg, mats.ribbon);
      r.frustumCulled = false;
      group.add(r);
    }
  }
  return group;
}
