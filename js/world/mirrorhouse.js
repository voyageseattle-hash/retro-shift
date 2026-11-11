// 12 MIRROR HOUSE: a hall of mirrors. The walls are glass that shows the road back at you (mirrors.js draws the real
// reflection), so a bend beside a mirror reads as a fork: one arm is road, the other is its reflection, with your
// own twin driving it. Each mirror is silvered in one world: red glass is there in BOTH and RED and gone in BLUE,
// blue glass the other way round. Two of the mirrors hide a road of the other colour that runs on through the frame
// (the looking-glass routes), the INFINITY HALL has glass on both sides, the FUNHOUSE warps everything it shows over
// a rolling floor, and the GLASS DOORS are mirrors across half the road: if you can see yourself coming, it's glass.
//
// The floor plan is a house: straight halls and square corners. It is written as corner points and rounded here, and
// features are placed by where they are on the plan (F(x, z)), not by control point.

import { M } from './shift.js';
import { mirrorDecor } from './mirrors.js';

// [x, z, y] corners of the plan in the order they're driven, each rounded with radius R. The plan is its own mirror
// image about the line x = 0 (the start line and the top hall cross it): a meander up one side and its reflection
// back down the other, four floors of it, each 6 m above the last. The lap is half as long again as most courses'.
const R = 50;
const CORNERS = [
  [340, 0, 0], [-340, 0, 0], [-340, 200, 6], [-100, 200, 6], [-100, 400, 12], [-340, 400, 12], [-340, 600, 18],
  [340, 600, 18], [340, 400, 12], [100, 400, 12], [100, 200, 6], [340, 200, 6],
];
const START = [0, 0];

function plan() {
  const n = CORNERS.length;
  const C = (k) => CORNERS[((k % n) + n) % n];
  const legLen = (k) => Math.hypot(C(k + 1)[0] - C(k)[0], C(k + 1)[1] - C(k)[1]);
  const dir = (k) => [(C(k + 1)[0] - C(k)[0]) / legLen(k), (C(k + 1)[1] - C(k)[1]) / legLen(k)];
  // a point d metres along leg k (from corner k toward k + 1), with the leg's height
  const on = (k, d) => {
    const [dx, dz] = dir(k);
    return [C(k)[0] + dx * d, C(k)[1] + dz * d, C(k)[2] + (C(k + 1)[2] - C(k)[2]) * (d / legLen(k))];
  };
  const straight = (k, d0, d1, out) => {
    const len = d1 - d0;
    // (a point just inside each end: the road is dead straight between them, which the glass needs)
    const ds = [0, Math.min(6, len / 3)];
    for (let s = 6 + 44; s < len - 6 - 20; s += 44) ds.push(s);
    ds.push(Math.max(len - 6, (len * 2) / 3), len);
    for (const s of ds) out.push(on(k, d0 + s));
  };
  // the rounded corner at corner k + 1, from leg k onto leg k + 1 (all the plan's corners are square)
  const arc = (k, out) => {
    const a = on(k, legLen(k) - R);
    const b = on(k + 1, R);
    const [ax, az] = dir(k);
    const [bx, bz] = dir(k + 1);
    const cx = a[0] + bx * R;
    const cz = a[1] + bz * R;
    for (const f of [0.2, 0.4, 0.6, 0.8]) {
      const th = (f * Math.PI) / 2;
      out.push([cx - bx * R * Math.cos(th) + ax * R * Math.sin(th), cz - bz * R * Math.cos(th) + az * R * Math.sin(th), a[2] + (b[2] - a[2]) * f]);
    }
  };
  const pts = [];
  const d0 = Math.hypot(START[0] - C(0)[0], START[1] - C(0)[1]);
  straight(0, d0, legLen(0) - R, pts);
  for (let k = 0; k < n; k++) {
    arc(k, pts);
    if (k + 1 < n) straight(k + 1, R, legLen(k + 1) - R, pts);
  }
  // the last of leg 0, up to a little before the line
  const tail = [];
  straight(0, R, d0 - 12, tail);
  pts.push(...tail);
  return pts.map(([x, z, y]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(y * 100) / 100]);
}

const POINTS = plan();

// Lap fraction of the place on the plan nearest (x, z) (the chain through the control points, like P(k, t) elsewhere).
const F = (() => {
  const P = POINTS;
  const d = [0];
  for (let i = 1; i <= P.length; i++) d.push(d[i - 1] + Math.hypot(P[i % P.length][0] - P[i - 1][0], P[i % P.length][1] - P[i - 1][1]));
  const L = d[P.length];
  return (x, z) => {
    let best = 1e18;
    let at = 0;
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      const b = P[(i + 1) % P.length];
      const ex = b[0] - a[0];
      const ez = b[1] - a[1];
      const l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2));
      const q = (x - a[0] - ex * t) ** 2 + (z - a[1] - ez * t) ** 2;
      if (q < best) {
        best = q;
        at = (d[i] + (d[i + 1] - d[i]) * t) / L;
      }
    }
    return at % 1;
  };
})();

// (side: +1 is the driver's right. Heading up the plan, that is toward -x: the plan is drawn as a mirror shows it.)
const fake = (x, z, side, mask, extra = {}) => ({ from: F(x, z), len: extra.len ?? 178, side, mask, ...extra });
// the two looking-glass lines on the way up; the two on the way down are the same lines turned about the middle
const UP_1 = [[-361, 160, 4.8], [-346, 212, 6], [-290, 240, 6.4], [-215, 258, 6.8], [-160, 266, 7.3], [-134, 277, 7.8], [-121, 291, 8.4]];
const UP_2 = [[-79, 360, 11.2], [-94, 412, 12.3], [-170, 440, 12.6], [-250, 456, 13], [-292, 466, 13.5], [-313, 478, 14.2], [-321, 492, 14.8]];
const turned = (via) => via.map(([x, z, y]) => [-x, 600 - z, 18 - y]);

export const MIRROR_HOUSE = {
  id: 'mirror',
  num: '12',
  name: 'MIRROR HOUSE',
  blurb: 'A hall of mirrors. Half the roads are reflections, and some of the glass hides a way through.',
  decor: 'mirror',
  decorFn: mirrorDecor,
  skyPiece: 'none',
  seed: 1212,
  laps: 2,
  sun: 0,
  halfWidth: 9,
  floorDrop: 14,
  points: POINTS,
  features: () => ({
    branches: [
      // the looking-glass routes: each leaves THROUGH a mirror of the other colour, takes the corner the main road
      // takes on its outside and the next one on its inside, and comes back in. In BOTH there's only glass there.
      // (covers.js leaves them be: the mirror is the cover.)
      { from: F(-340, 72), to: F(-100, 330), mask: M.BO, side: 1, label: 'BLUE LOOKING GLASS', cover: false, via: UP_1 },
      { from: F(-100, 272), to: F(-340, 530), mask: M.RO, side: -1, label: 'RED LOOKING GLASS', cover: false, via: UP_2 },
      { from: F(340, 528), to: F(100, 270), mask: M.BO, side: 1, label: 'BLUE BACKSTAGE', cover: false, via: turned(UP_1) },
      { from: F(100, 328), to: F(340, 70), mask: M.RO, side: -1, label: 'RED BACKSTAGE', cover: false, via: turned(UP_2) },
    ],
    // (mirrors.js) glass along the road's edge. `from` is where the glass starts and `len` how far it runs, straight
    // on from there: where the road bends away from it, the reflection bends the other way, and that's the fork.
    mirrors: [
      // the way up
      fake(-150, 0, 1, M.R, { len: 222 }),
      fake(-340, 57, 1, M.R, { route: 'BLUE LOOKING GLASS' }),
      fake(-283, 200, -1, M.B, { len: 218 }),
      fake(-100, 257, -1, M.B, { route: 'RED LOOKING GLASS' }),
      fake(-157, 400, 1, M.R, { len: 218 }),
      fake(-340, 457, 1, M.B),
      // the INFINITY HALL: glass both sides
      { from: F(-282, 600), len: 250, side: 1, mask: M.R, hall: 1 },
      { from: F(-282, 600), len: 250, side: -1, mask: M.B, hall: 1 },
      // the FUNHOUSE: warped glass standing back from the rails down both sides
      ...[0, 1, 2, 3, 4].flatMap((k) => [
        { from: F(44 + k * 48, 600), len: 38, side: 1, mask: k % 2 ? M.B : M.R, back: 5, warp: 1, bow: k % 2 ? 1 : -1 },
        { from: F(44 + k * 48, 600), len: 38, side: -1, mask: k % 2 ? M.R : M.B, back: 5, warp: 1, bow: k % 2 ? -1 : 1 },
      ]),
      // the way down
      fake(340, 543, 1, M.R, { route: 'BLUE BACKSTAGE' }),
      fake(283, 400, -1, M.R, { len: 218 }),
      fake(100, 343, -1, M.B, { route: 'RED BACKSTAGE' }),
      fake(157, 200, 1, M.B, { len: 218 }),
      fake(340, 143, 1, M.R),
    ],
    // the rolling, tilting floor (mirrors.js)
    funhouse: [{ at: F(30, 600), len: 262 }],
    // the GLASS DOORS: mirrors across half the road
    obstacles: [0, 1, 2, 3].map((k) => ({ type: 'gate', at: F(262 - k * 52, 0), mask: k % 2 ? M.B : M.R, lat: k % 2 ? 1 : -1, mirror: true })),
    boosts: [{ at: F(-70, 0) }, { at: F(-215, 200), lat: 0.3 }, { at: F(-225, 400), lat: -0.3 }, { at: F(-20, 600) }, { at: F(225, 400), lat: 0.3 }, { at: F(215, 200), lat: -0.3 }, { at: F(48, 0) }],
    shards: [
      { at: F(-110, 0), n: 3 }, { at: F(-250, 200), n: 3, lat: 0.4 }, { at: F(-180, 400), n: 3, lat: -0.4 }, { at: F(-200, 600), n: 3 },
      { at: F(120, 600), n: 3, lat: 0.4 }, { at: F(250, 400), n: 3, lat: -0.4 }, { at: F(180, 200), n: 3, lat: 0.4 },
    ],
    // boards on gantries (mirrors.js): the house tells you its rules as you come to them
    boards: [
      { at: F(-52, 0), title: 'MIRRORS AHEAD', sub: 'RED GLASS IS GONE IN BLUE', mask: M.R },
      { at: F(-312, 190), title: 'BLUE GLASS', sub: 'GONE IN RED', mask: M.B },
      { at: F(-318, 596), title: 'INFINITY HALL', sub: 'ONE ROAD IS REAL', mask: M.ALL },
      { at: F(8, 600), title: 'FUNHOUSE', sub: 'THE FLOOR MOVES', mask: M.ALL },
      { at: F(318, 4), title: 'GLASS DOORS', sub: 'SEE YOURSELF? IT’S GLASS', mask: M.ALL },
    ],
  }),
};
