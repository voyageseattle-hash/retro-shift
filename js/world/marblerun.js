// DROP TOWER (course 21, the last race of the TOYBOX CUP): a tall toy marble run on the bookcase. You race down it
// and the lift carries you back to the top. Every piece does one thing, on the race clock, the same every race:
//
//   LIFT       a chain lift up the tower's side: it carries anything on it at lift speed, so nobody crawls up.
//   FUNNEL     a bowl that winds you inward one and a half times, tighter and faster, and out through the bottom
//              into the corkscrew down the tower's core.
//   SEESAW     a plank on a fulcrum over the road. A steel ball rolls along its side channel and tips it. Near end
//              down: drive up it and off the high end, over the block field below. Near end up: you pass under.
//   CHUTES     tinted clear plastic: a red tube and a blue tube cut the two big bends, each there in its own lens
//              and hidden behind toy blocks in the other. A third, red, leaves the corkscrew behind a cardboard box.
//   SPRING     a giant spring bridges the two towers, a road through its coils. Squeezed, it's a solid deck. On the
//              final lap it stretches on a beat: the coils bunch into three islands with open air between them,
//              which only the Skimmer's glide crosses. The road round the outside is always there.
//   TILT TRAY  a wooden labyrinth board that tips side to side (the knob on its frame turns first) and slides you
//              with it: plank walls to weave (a gap down the painted line that only the Blade fits) and holes.
//   MARBLES    on the final lap the hopper opens: giant glass marbles, red and blue, roll down the funnel and the
//              corkscrew with you. Each is in one world, so a lens goes through it.
//
// Falling through the spring or a hole in the tray is not a respawn: you land on the catch chute under them, a
// narrow road with no pads that runs to the foot of the lift.
//
// The road is an ordinary loop to the engine. The pieces that move change it under the cars: the plank is a strip
// of its own whose heights follow its angle, the spring's gaps are lens masks switched on and off, the tray is the
// main road's bank. world.tower holds them and set() puts them at a moment of the clock (game/droptower.js runs the
// clock in a race; the menu's fly-by runs a quiet one of its own).

import * as THREE from '../../vendor/three.js';
import { M, COLORS } from './shift.js';
import { clamp, smoothstep } from '../core/util.js';
import { addSign } from './signs.js';
import { toyboxEnv } from './toybox.js';
import { dressDropTower } from './marblerun-art.js';

// ------------------------------------------------------------------ the layout
const OX = -60; // tower A's axis (the funnel and the corkscrew wind round it)
const TOP = 110; // the top deck
const BASE = 14; // the foot of the lift
const LIFT_X = OX + 100;
const ROW = -520; // the line the spring and the tray run along, heading west
const ARC = { x: LIFT_X + 90, z: -430, r: 90 }; // the bend from the tray round to the lift

// toy plastic
const YEL = 0xffd23a;
const GRN = 0x45f08a;
const ORG = 0xff8a2a;
const PNK = 0xff4fd8;
const CYAN = 0x4ad8ff;
const WOOD = 0xd9a05a;
const CARD = 0xc79a62;

const ease = (u) => u * u * (3 - 2 * u);

function layout() {
  const pts = [];
  const K = {};
  const add = (x, z, y) => pts.push([x, z, y]) - 1;
  // the top deck: the line, and the run into the bowl
  K.start = add(LIFT_X, -36, TOP);
  add(LIFT_X, -18, TOP);
  // the funnel: one and a half turns inward, radius 100 down to 45
  K.funnel = pts.length;
  for (let k = 0; k <= 36; k++) {
    const u = k / 36;
    const a = u * 3 * Math.PI;
    const R = 100 - 55 * ease(u);
    add(OX + Math.cos(a) * R, Math.sin(a) * R, TOP - 22 * u);
  }
  // the corkscrew: a turn and a quarter down the core, 22 m a turn
  K.screw = pts.length;
  for (let k = 1; k <= 20; k++) {
    const a = 3 * Math.PI + (k / 20) * 2.5 * Math.PI;
    add(OX + Math.cos(a) * 45, Math.sin(a) * 45, TOP - 22 - 28 * (k / 20));
  }
  K.screwEnd = pts.length - 1; // (OX, -45), heading east
  // out along the seesaw straight
  K.s0 = add(OX + 40, -45, 57.8);
  K.s1 = add(OX + 100, -45, 56.4);
  K.s2 = add(OX + 170, -45, 55.4);
  K.s3 = add(200, -42, 54.6);
  // the chutes: two big bends, each cut by a lens tube
  K.c1 = add(280, -40, 54);
  K.c2 = add(380, -60, 53);
  K.c3 = add(450, -130, 52);
  K.c4 = add(440, -230, 51);
  K.c5 = add(370, -290, 50);
  K.c6 = add(330, -360, 49);
  K.c7 = add(380, -430, 48);
  K.c8 = add(480, -440, 47);
  K.c9 = add(580, -400, 46);
  K.c10 = add(640, -320, 45);
  K.c11 = add(720, -290, 44);
  K.c12 = add(780, -350, 43.2);
  K.c13 = add(795, -440, 42.4);
  K.c14 = add(745, -508, 41.6);
  // the fork: the spring goes straight on (north of the road), the road bows round to the south
  K.p1 = add(690, ROW, 41);
  add(640, ROW - 3, 40.3);
  add(590, ROW - 25, 39);
  add(540, ROW - 78, 37);
  add(478, ROW - 86, 35);
  add(428, ROW - 48, 33);
  add(404, ROW - 13, 31.2);
  K.p2 = add(372, ROW, 30);
  // the tray
  K.t0 = add(340, ROW, 29.6);
  K.t1 = add(260, ROW, 28.6);
  K.t2 = add(180, ROW, 27.6);
  // down and round to the foot of the lift
  K.arc = pts.length;
  for (let k = 0; k <= 6; k++) {
    const f = (k / 6) * Math.PI * 0.5;
    add(ARC.x - Math.sin(f) * ARC.r, ARC.z - Math.cos(f) * ARC.r, 27 - (27 - BASE) * ease(k / 6));
  }
  // the lift: level where the catch chute comes in, then a steady climb that eases off over the top
  K.lift = add(LIFT_X, -400, BASE);
  const z0 = -385;
  const z1 = -80;
  const aIn = 30;
  const aOut = 70;
  const slope = (TOP - BASE) / (z1 - z0 - aIn / 2 - aOut / 2);
  const h = (z) => {
    const d = z - z0;
    const L = z1 - z0;
    if (d <= 0) return BASE;
    if (d < aIn) return BASE + (slope * d * d) / (2 * aIn);
    if (d < L - aOut) return BASE + slope * (d - aIn / 2);
    const e = L - d;
    return TOP - (slope * e * e) / (2 * aOut);
  };
  for (let z = z0; z <= z1 + 0.1; z += (z1 - z0) / 14) add(LIFT_X, z, h(z));
  add(LIFT_X, -58, TOP);
  return { pts, K, liftZ: [z0, z1] };
}

function fractions(points) {
  const d = [0];
  for (let i = 1; i <= points.length; i++) {
    const a = points[i - 1];
    const b = points[i % points.length];
    d.push(d[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] || 0) - (a[2] || 0)));
  }
  const L = d[d.length - 1];
  return (k, t = 0) => ((d[k] + (d[k + 1] - d[k]) * t) / L) % 1;
}

const LAY = layout();

export const MARBLERUN = (() => {
  const { pts, K } = LAY;
  const P = fractions(pts);
  const block = (at, lat, mask, size = 3) => ({ type: 'block', at, lat, mask, size });
  // the block field under and past the seesaw: red and blue toy bricks, so a lens clears half of them
  const bricks = [];
  let s = 2121;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const f0 = P(K.s1, 0.35);
  const f1 = P(K.s3, 0.2);
  for (let k = 0; k < 9; k++) bricks.push(block(f0 + ((f1 - f0) * (k + 0.5)) / 9, (r() - 0.5) * 1.5, k % 2 ? M.B : M.R, 2.6 + r() * 1.4));
  const sub = 'A TUBE IN ONE LENS';
  return {
    id: 'marblerun',
    num: '21',
    name: 'DROP TOWER',
    blurb: 'A marble run on the bookcase. Race down it; the lift takes you back up.',
    decor: 'marblerun',
    seed: 2121,
    // two long laps: the first learns the pieces, the second stretches the spring and lets the marbles go
    laps: 2,
    sun: 1,
    bankFactor: 9,
    floorDrop: 16,
    noPylons: true,
    // the bookcase in the TOYBOX CUP's bedroom (toybox.js), and its candy-gloss road
    dressEnv: toyboxEnv('bookcase'),
    skyPiece: 'none',
    routeBoosts: 'light',
    points: pts,
    branches: [
      // the spring between the towers (the gaps open and close in it: world.tower)
      { from: P(K.p1, 0.1), to: P(K.p2, 0.25), mask: M.ALL, side: -1, lift: 0, label: 'SPRING BRIDGE', sub: 'SQUEEZED: A ROAD · STRETCHED: BLUE HOPS IT' },
      // the lens tubes across the two big bends (hatch: this course hides them itself, behind toy blocks)
      { from: P(K.c1, 0.5), to: P(K.c5, 0.1), mask: M.RO, side: -1, lift: 7, label: 'RED TUBE', sub, hatch: true },
      { from: P(K.c8, 0.1), to: P(K.c12, 0.15), mask: M.BO, side: -1, lift: 7, label: 'BLUE TUBE', sub, hatch: true },
      // the secret: out of the corkscrew's last quarter behind a cardboard box, past the seesaw and its bricks
      { from: P(K.screwEnd - 3, 0.2), to: P(K.s3, 0.75), mask: M.RO, side: -1, lift: 0, label: 'SECRET CHUTE', hatch: true, shards: [{ at: 0.3 }, { at: 0.5 }, { at: 0.7 }] },
      // the catch chute, under the spring and the tray: nothing leads onto it, you land on it
      {
        from: P(K.p1, 0.6), to: P(K.lift, 0.35), mask: M.ALL, side: 1, drop: true, halfWidth: 9, label: null,
        via: [
          [640, ROW + 19, 24], [560, ROW + 19, 22.6], [480, ROW + 19, 21.2], [420, ROW + 13, 20], [370, ROW + 4, 19], [320, ROW, 18],
          [230, ROW, 16.4], [150, ROW - 1, 15.2],
          ...[20, 45, 68].map((deg, k) => [ARC.x - Math.sin((deg * Math.PI) / 180) * 110, ARC.z - Math.cos((deg * Math.PI) / 180) * 110, 14.7 - k * 0.3]),
        ],
      },
    ],
    // tinted plastic: a stretch of red tube (gone in blue) and one of blue (gone in red)
    gaps: [{ at: P(K.c6, 0.2), len: 40, mask: M.R, noRails: true }, { at: P(K.c13, 0.1), len: 40, mask: M.B, noRails: true }],
    obstacles: [
      ...bricks,
      { type: 'wall', at: P(K.c3, 0.5), mask: M.B },
      { type: 'wall', at: P(K.c10, 0.4), mask: M.R },
    ],
    boosts: [
      { at: P(K.funnel + 16, 0), lat: 0.3 }, { at: P(K.funnel + 28, 0), lat: 0.3 }, { at: P(K.screw + 10, 0) },
      { at: P(K.c2, 0.6) }, { at: P(K.c7, 0.5) }, { at: P(K.c11, 0.5), mask: M.RO }, { at: P(K.c5, 0.6), mask: M.BO },
      { path: 'b0', at: 0.07 },
    ],
    shards: [
      { at: P(K.funnel + 6, 0), n: 3 }, { at: P(K.screw + 3, 0), n: 3, lat: -0.3 }, { at: P(K.c1, 0.1), n: 4 }, { at: P(K.c4, 0.5), n: 3, mask: M.R },
      { at: P(K.c9, 0.4), n: 3, mask: M.B }, { at: P(K.p1, 0.75), n: 3 }, { at: P(K.arc + 2, 0), n: 3 },
    ],
    tips: [{ at: P(K.start, 0.5), text: 'EVERY PIECE MOVES ON THE CLOCK · WATCH IT BEFORE YOU GET THERE', key: 'both' }],
  };
})();

// ------------------------------------------------------------------ the clock
// Where every moving piece is at race time t. final: the time the final lap began (the spring stretches and the
// marbles roll from then), or -1.
const SEE = { T: 6.4, down: 3.2, tip: 0.8, up: 1.6 }; // near end down, tipping, near end up, tipping back
const SPR = { T: 9, shut: 4.2, move: 0.8, open: 3.2 }; // squeezed, opening, stretched, closing
const TILT = { T: 8, hold: 2.8, move: 1.2, max: 0.12 };
const wrap = (t, T) => ((t % T) + T) % T;
const seeAt = (t) => {
  const p = wrap(t, SEE.T);
  if (p < SEE.down) return 0;
  if (p < SEE.down + SEE.tip) return ease((p - SEE.down) / SEE.tip);
  if (p < SEE.down + SEE.tip + SEE.up) return 1;
  return 1 - ease((p - SEE.down - SEE.tip - SEE.up) / SEE.tip);
};
const springAt = (t) => {
  const p = wrap(t, SPR.T);
  if (p < SPR.shut) return 0;
  if (p < SPR.shut + SPR.move) return ease((p - SPR.shut) / SPR.move);
  if (p < SPR.shut + SPR.move + SPR.open) return 1;
  return 1 - ease((p - SPR.shut - SPR.move - SPR.open) / SPR.move);
};
const tiltAt = (t) => {
  const p = wrap(t, TILT.T);
  if (p < TILT.hold) return 1;
  if (p < TILT.hold + TILT.move) return 1 - 2 * ease((p - TILT.hold) / TILT.move);
  if (p < 2 * TILT.hold + TILT.move) return -1;
  return -1 + 2 * ease((p - 2 * TILT.hold - TILT.move) / TILT.move);
};
// The spring stretches from the first whole beat after the final lap begins (never mid-beat, under a car).
export const springArm = (final) => (final < 0 ? Infinity : Math.ceil(final / SPR.T) * SPR.T);
export function towerState(t, final = -1) {
  const armed = t >= springArm(final);
  return {
    t,
    see: seeAt(t),
    ball: seeAt(t + 0.7), // the ball in the plank's channel runs ahead of the tip
    spring: armed ? springAt(t) : 0,
    shiver: armed ? springAt(t + 0.8) - springAt(t) : 0, // the coils tremble before they move
    tilt: tiltAt(t) * TILT.max,
    knob: tiltAt(t + 0.7), // the knob on the tray's frame turns first
  };
}
// Will the spring be a whole road from race time t0 to t1?
export function springSolid(t0, t1, final) {
  if (t1 < springArm(final)) return true;
  for (let t = t0; t <= t1; t += 0.2) if (t >= springArm(final) && springAt(t) > 0.02) return false;
  return true;
}

// ------------------------------------------------------------------ the pieces, as the physics has them
const PLANK = { x0: OX + 45, x1: OX + 135, z: -45, hw: 6, H: 3.6 };
// the spring's stretched shape, in metres along its moving span: gap, island, gap, island, gap, island, gap
const GAP = 38;
const ISLAND = 24;
const HOOPS = 18;

export function layDropTower(world) {
  if (world.def.id !== 'marblerun') return;
  const main = world.main;
  const Path = main.constructor;
  const near = (x, z, y) => main.nearest(x, z, -1, y);
  const T = (world.tower = { driven: false, draw: [], state: null });

  // the seesaw's plank: a strip of its own over the road, from the low end to the high end
  {
    const n = 10;
    const pts = [];
    const i0 = near(PLANK.x0, PLANK.z, 57);
    const i1 = near(PLANK.x1, PLANK.z, 56);
    for (let k = 0; k <= n; k++) pts.push(new THREE.Vector3(PLANK.x0 + ((PLANK.x1 - PLANK.x0) * k) / n, 60, PLANK.z));
    const p = new Path('seesaw', pts, false, PLANK.hw, { bankFactor: 0, mainFrom: i0 / main.N, mainTo: i1 / main.N });
    p.def = { mask: M.ALL, label: null };
    p.side = 1;
    p.skipDraw = true;
    p.noFork = true; // nobody plans a route over it: it's there or it isn't when you arrive
    const base = new Float32Array(p.N);
    const s = new Float32Array(p.N);
    const fr = {};
    const mid = (PLANK.x0 + PLANK.x1) / 2;
    for (let i = 0; i < p.N; i++) {
      main.frame(p.px[i], p.pz[i], i0, fr, 57);
      base[i] = fr.y;
      s[i] = p.px[i] - mid;
    }
    world.paths.push(p);
    T.plank = { path: p, base, s, i0, i1, tan: PLANK.H / ((PLANK.x1 - PLANK.x0) / 2), pivot: new THREE.Vector3(mid, base[Math.floor(p.N / 2)] + PLANK.H, PLANK.z) };
  }

  // the spring: the middle of the bridge is the part that moves
  {
    const p = world.paths.find((q) => q.def?.label === 'SPRING BRIDGE');
    const span = 4 * GAP + 3 * ISLAND;
    const m0 = (p.length - span) / 2;
    const at = (m) => Math.round(m / p.ds);
    const gaps = [];
    for (let k = 0; k < 4; k++) gaps.push([at(m0 + k * (GAP + ISLAND)), at(m0 + k * (GAP + ISLAND) + GAP)]);
    p.hide = new Uint8Array(p.N);
    for (let i = at(m0); i < at(m0 + span); i++) p.hide[i] = 1;
    T.spring = { path: p, m0, span, gaps, open: false };
  }

  // the tray: the straight along ROW, with a little road either side of it to twist into
  {
    const i0 = near(352, ROW, 29);
    const i1 = near(152, ROW, 27);
    const nb = Math.round(14 / main.ds);
    main.hide = new Uint8Array(main.N);
    for (let i = i0 - nb; i <= i1 + nb; i++) main.hide[i] = 1;
    const bank = Float32Array.from(main.bank);
    // plank walls: each closes one side of the board from the painted line out, leaving the line itself open
    const gates = [];
    const holes = [];
    const len = (i1 - i0) * main.ds;
    [0.2, 0.47, 0.74].forEach((u, k) => {
      const side = k % 2 ? -1 : 1;
      const i = i0 + Math.round((u * len) / main.ds);
      gates.push({ i, side, lat: side * 5.45, w: 4.55 });
      // a hole in the open side's outer lane beside each wall, and one past it on the closed side
      holes.push({ i, lat: -side * 7, r: 2.3 });
      holes.push({ i: i + Math.round(24 / main.ds), lat: side * 6.4, r: 2.3 });
    });
    T.tray = { i0, i1, nb, bank, gates, holes, tilt: 0 };
  }

  // the lift and the marbles' run
  {
    const [z0, z1] = LAY.liftZ;
    T.lift = { i0: near(LIFT_X, z0 + 6, BASE), i1: near(LIFT_X, z1 - 30, TOP - 4) };
    const a = near(LIFT_X, -6, TOP);
    const b = T.plank.i0 - Math.round(20 / main.ds);
    T.run = { i0: a, n: b - a };
  }

  // Put every piece where the clock has it: the plank's heights, the spring's gaps, the tray's bank, then the
  // drawn pieces (T.draw, added by the decor).
  T.set = (s) => {
    T.state = s;
    const pl = T.plank;
    const tan = pl.tan * (1 - 2 * s.see);
    const p = pl.path;
    for (let i = 0; i < p.N; i++) p.py[i] = pl.base[i] + PLANK.H + pl.s[i] * tan + 0.02;
    p.reframe();
    p.minY = Math.min(p.py[0], p.py[p.N - 1]);
    p.maxY = Math.max(p.py[0], p.py[p.N - 1]);
    pl.angle = Math.atan(tan);
    const sp = T.spring;
    // (the deck goes when the coils have started to part, and is back when they have all but closed)
    const open = sp.open ? s.spring > 0.12 : s.spring > 0.3;
    if (open !== sp.open) {
      sp.open = open;
      const q = sp.path;
      for (const [a, b] of sp.gaps) {
        for (let i = a; i < b; i++) {
          q.mask[i] = open ? 0 : M.ALL;
          if (q.glide) q.glide[i] = open ? 1 : 0;
        }
      }
    }
    const tr = T.tray;
    if (s.tilt !== tr.tilt) {
      tr.tilt = s.tilt;
      for (let i = tr.i0 - tr.nb; i <= tr.i1 + tr.nb; i++) main.bank[i] = tr.bank[i] + s.tilt * trayK(tr, i);
      main.reframe();
    }
    for (const fn of T.draw) fn(s);
  };
  T.set(towerState(0));
  // the menu's fly-by and the lobby have no race clock: the pieces keep time on their own there
  world.animated.push((t) => !T.driven && T.set(towerState(t)));
}
// How much of the tray's tilt sample i has: all of it on the board, easing to none over the road either side.
const trayK = (tr, i) => smoothstep(tr.i0 - tr.nb, tr.i0, i) * (1 - smoothstep(tr.i1, tr.i1 + tr.nb, i));
export { trayK, PLANK, TILT, SPR };

// ------------------------------------------------------------------ what you see
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// Line and fill pieces for the parts that move, drawn with the neutral world's materials so each lens tints them.
class Kit {
  constructor() {
    this.lp = [];
    this.lc = [];
    this.fp = [];
    this.c = new THREE.Color();
  }
  line(a, b, color, k = 1) {
    this.lp.push(a.x, a.y, a.z, b.x, b.y, b.z);
    this.c.set(color).multiplyScalar(k);
    this.lc.push(this.c.r, this.c.g, this.c.b, this.c.r, this.c.g, this.c.b);
  }
  xyz(ax, ay, az, bx, by, bz, color, k = 1) {
    this.lp.push(ax, ay, az, bx, by, bz);
    this.c.set(color).multiplyScalar(k);
    this.lc.push(this.c.r, this.c.g, this.c.b, this.c.r, this.c.g, this.c.b);
  }
  quad(a, b, c, d) {
    this.fp.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  }
  box(cx, cy, cz, w, h, d, color, fill = true) {
    const P = [];
    for (const [sx, sy, sz] of [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]) P.push(V(cx + (sx * w) / 2, cy + (sy * h) / 2, cz + (sz * d) / 2));
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) this.line(P[a], P[b], color);
    if (fill) for (const f of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) this.quad(P[f[0]], P[f[1]], P[f[2]], P[f[3]]);
  }
  ring(c, u, v, r, seg, color, k = 1) {
    let prev = null;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const p = c.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
      if (prev) this.line(prev, p, color, k);
      prev = p;
    }
  }
  build(mats, fillMat = mats.fill) {
    const g = new THREE.Group();
    if (this.lp.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(this.lp, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(this.lc, 3));
      const o = new THREE.LineSegments(geo, mats.line);
      o.renderOrder = 2;
      o.frustumCulled = false;
      g.add(o);
    }
    if (this.fp.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(this.fp, 3));
      const o = new THREE.Mesh(geo, fillMat);
      o.renderOrder = 1;
      o.frustumCulled = false;
      g.add(o);
    }
    return g;
  }
}

// DECOR.marblerun (decor.js): the tower itself, and the drawn halves of the moving pieces.
export function buildDropTower(world, L, main) {
  const T = world.tower;
  const mats = L.materials(M.ALL);
  const floor = world.floorY;
  const sign = (i, title, sub2, back = 60) => addSign(world, main, i - Math.round(back / main.ds), 0, title, sub2, M.ALL);

  // ---- tower A: a core column, posts round the corkscrew, the bowl
  L.cylinder(M.ALL, OX, floor, 0, 7, TOP - 30 - floor, 10, 10, YEL);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    L.cylinder(M.ALL, OX + Math.cos(a) * 60, floor, Math.sin(a) * 60, 1.6, TOP - 26 - floor, 6, 6, k % 2 ? ORG : GRN);
  }
  // the bowl: a rim, ribs running down to the drain, and rings between the road's turns
  const bowlY = (R) => TOP - 24 + ((R - 34) / 80) * 30;
  const X = V(1, 0, 0);
  const Z = V(0, 0, 1);
  for (const [R, col] of [[114, YEL], [112, ORG], [34, YEL], [32, ORG]]) L.ring(M.ALL, V(OX, bowlY(R), 0), X, Z, R, 72, col);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    // (the rib stops short of the road where the top deck comes in)
    if (Math.abs(a) < 0.25 || a > Math.PI * 2 - 0.25) continue;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    let prev = null;
    for (let q = 0; q <= 6; q++) {
      const R = 34 + (80 * q) / 6;
      const p = V(OX + c * R, bowlY(R) - 2.4, sn * R);
      if (prev) L.line(M.ALL, prev, p, k % 2 ? GRN : CYAN);
      prev = p;
    }
  }
  // the hopper over the bowl's mouth, where the marbles come from
  {
    const p = main.point(T.run.i0, 0, 0, V(0, 0, 0));
    L.box(M.ALL, p.x, p.y + 17, p.z, 20, 8, 14, 0, PNK, false);
    for (const s of [-1, 1]) L.lineXYZ(M.ALL, p.x + s * 10, p.y + 13, p.z, p.x + s * 4, p.y + 8, p.z, PNK);
    L.lineXYZ(M.ALL, p.x - 4, p.y + 8, p.z, p.x + 4, p.y + 8, p.z, PNK);
    for (const s of [-1, 1]) L.cylinder(M.ALL, p.x + s * 13, p.y, p.z, 0.8, 13, 6, 2, PNK);
    sign(T.run.i0, 'FUNNEL', 'IN AND DOWN · IT ONLY GETS TIGHTER', 40);
  }

  // ---- the lift: side girders on legs, cleats that climb (drawn below), a wheel at each end
  {
    const { i0, i1 } = T.lift;
    const hw = main.halfW + 1.6;
    for (let i = i0; i < i1; i += 2) {
      for (const s of [-1, 1]) {
        const a = main.point(i, s * hw, 2.2, V(0, 0, 0));
        const b = main.point(i + 2, s * hw, 2.2, V(0, 0, 0));
        L.line(M.ALL, a, b, YEL);
        L.line(M.ALL, main.point(i, s * hw, 0.2, V(0, 0, 0)), main.point(i + 2, s * hw, 0.2, V(0, 0, 0)), ORG);
        if ((i - i0) % 6 === 0) L.line(M.ALL, a, main.point(i, s * hw, 0.2, V(0, 0, 0)), YEL);
        if ((i - i0) % 24 === 0) L.cylinder(M.ALL, a.x, floor, a.z, 1.1, a.y - 2 - floor, 6, Math.max(2, Math.round((a.y - floor) / 14)), s < 0 ? GRN : CYAN);
      }
    }
    for (const i of [i0 - 4, i1 + 6]) {
      const c = main.point(i, 0, 0, V(0, 0, 0));
      const u = V(main.thx[i], 0, main.thz[i]);
      for (const s of [-1, 1]) {
        const cc = c.clone().addScaledVector(V(main.rightX(i), 0, main.rightZ(i)), s * (hw + 1));
        L.ring(M.ALL, cc.setY(c.y - 1), u, UP, 5, 20, ORG);
        L.ring(M.ALL, cc, u, UP, 1.2, 8, YEL);
      }
    }
    sign(i0, 'LIFT', 'IT CARRIES YOU · STEER FOR THE PADS', 50);
    // the cleats: bars across the road, climbing with the chain
    const n = 30;
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(n * 12), 3).setUsage(THREE.DynamicDrawUsage);
    const col = new Float32Array(n * 12);
    const c = new THREE.Color();
    for (let k = 0; k < n * 4; k++) c.set(k % 4 < 2 ? YEL : ORG).multiplyScalar(k % 4 < 2 ? 1 : 0.5).toArray(col, k * 3);
    geo.setAttribute('position', pos);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const cleats = new THREE.LineSegments(geo, mats.line);
    cleats.frustumCulled = false;
    cleats.renderOrder = 2;
    world.group.add(cleats);
    const a = V(0, 0, 0);
    const b = V(0, 0, 0);
    const len = (i1 - i0) * main.ds;
    T.draw.push((s) => {
      for (let k = 0; k < n; k++) {
        const f = (i0 + (((k / n + (s.t * 38) / len) % 1) * (i1 - i0))) / main.N;
        main.pointF(f, -main.halfW + 1, 0.12, a);
        main.pointF(f, main.halfW - 1, 0.12, b);
        pos.setXYZ(k * 4, a.x, a.y, a.z);
        pos.setXYZ(k * 4 + 1, b.x, b.y, b.z);
        main.pointF(f + 0.6 / main.length, -main.halfW + 1, 0.12, a);
        main.pointF(f + 0.6 / main.length, main.halfW - 1, 0.12, b);
        pos.setXYZ(k * 4 + 2, a.x, a.y, a.z);
        pos.setXYZ(k * 4 + 3, b.x, b.y, b.z);
      }
      pos.needsUpdate = true;
    });
  }

  // ---- the seesaw: a fulcrum either side of the road with an axle across, and the plank on it
  {
    const pl = T.plank;
    const pv = pl.pivot;
    const roadY = pv.y - PLANK.H;
    for (const s of [-1, 1]) {
      const z = pv.z + s * (main.halfW + 2.2);
      for (const dx of [-5, 5]) L.lineXYZ(M.ALL, pv.x + dx, roadY - 1, z, pv.x, pv.y, z, ORG);
      L.lineXYZ(M.ALL, pv.x - 5, roadY - 1, z, pv.x + 5, roadY - 1, z, ORG);
      L.ring(M.ALL, V(pv.x, pv.y, z), X, UP, 0.9, 10, YEL);
    }
    L.lineXYZ(M.ALL, pv.x, pv.y - 0.25, pv.z - main.halfW - 2.2, pv.x, pv.y - 0.25, pv.z + main.halfW + 2.2, YEL);
    const K = new Kit();
    const hl = (PLANK.x1 - PLANK.x0) / 2;
    const hw = PLANK.hw;
    K.quad(V(-hl, 0, -hw), V(hl, 0, -hw), V(hl, 0, hw), V(-hl, 0, hw));
    for (const s of [-1, 1]) {
      K.xyz(-hl, 0.05, s * hw, hl, 0.05, s * hw, YEL);
      K.xyz(-hl, 0.9, s * (hw + 0.3), hl, 0.9, s * (hw + 0.3), YEL);
      K.xyz(-hl, -0.5, s * hw, hl, -0.5, s * hw, ORG, 0.6);
      for (let x = -hl; x <= hl; x += 9) K.xyz(x, 0.05, s * hw, x, 0.9, s * (hw + 0.3), YEL, 0.7);
    }
    for (let x = -hl; x <= hl + 0.1; x += 4.5) K.xyz(x, 0.04, -hw, x, 0.04, hw, WOOD, 0.55);
    for (const z of [-2, 2]) K.xyz(-hl, 0.04, z, hl, 0.04, z, WOOD, 0.4);
    // chevrons up the plank, and the ball's channel along its left edge
    for (let x = -hl + 6; x < hl; x += 12) for (const s of [-1, 1]) K.xyz(x, 0.06, s * 3.4, x + 3, 0.06, 0, PNK);
    for (const y of [1.3, 2.5]) K.xyz(-hl, y, -hw - 0.9, hl, y, -hw - 0.9, CYAN, 0.8);
    for (let x = -hl; x <= hl + 0.1; x += 10) K.ring(V(x, 1.9, -hw - 0.9), UP, V(0, 0, 1), 0.62, 8, CYAN, 0.6);
    const plank = K.build(mats, mats.road);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshBasicMaterial({ color: 0xf2f6ff }));
    ball.position.set(-hl + 2, 1.9, -hw - 0.9);
    plank.add(ball);
    plank.position.copy(pv);
    world.group.add(plank);
    T.draw.push((s) => {
      plank.rotation.z = pl.angle;
      // the ball sits at the low end; it starts to roll just before the plank goes
      ball.position.x = (hl - 2) * (2 * s.ball - 1) * -1;
    });
    sign(pl.i0, 'SEESAW', 'LOW END DOWN: UP AND OVER · UP: GO UNDER', 70);
  }

  // ---- the spring: hoops with a tread across the bottom of each, sliding as it stretches
  {
    const sp = T.spring;
    const p = sp.path;
    const pitch = sp.span / HOOPS;
    const even = (k) => sp.m0 + (k + 0.5) * pitch;
    // stretched: three hoops packed at each end, four on each island
    const home = [];
    for (let k = 0; k < 3; k++) home.push(sp.m0 - 2 - k * 3.2);
    home.reverse();
    for (let q = 0; q < 3; q++) for (let k = 0; k < 4; k++) home.push(sp.m0 + GAP + q * (GAP + ISLAND) + 3 + k * 6);
    for (let k = 0; k < 3; k++) home.push(sp.m0 + sp.span + 2 + k * 3.2);
    const R = 9.7;
    const lift = 7.2;
    const cols = [PNK, ORG, YEL, GRN, CYAN, 0xb04cff];
    const hoops = [];
    for (let k = 0; k < HOOPS; k++) {
      const Kc = new Kit();
      const col = cols[k % cols.length];
      // the coil: two wires a little apart, leaning like a turn of a spring
      for (const dz of [-0.35, 0.35]) Kc.ring(V(0, lift, dz), V(1, 0, 0), V(0, 1, 0.12).normalize(), R, 30, col, dz < 0 ? 1 : 0.6);
      const g = Kc.build(mats);
      // the tread: half as long when the coils are packed (slat.scale.z)
      const Ks = new Kit();
      const hw = p.halfW;
      const hl = pitch / 2 + 0.15;
      Ks.quad(V(-hw, 0, -hl), V(hw, 0, -hl), V(hw, 0, hl), V(-hw, 0, hl));
      for (const s of [-1, 1]) {
        Ks.xyz(s * hw, 0.05, -hl, s * hw, 0.05, hl, col);
        Ks.xyz(s * (hw - 0.5), 0.05, -hl, s * (hw - 0.5), 0.05, hl, col, 0.5);
        Ks.xyz(-hw, 0.04, s * hl, hw, 0.04, s * hl, col, 0.8);
      }
      Ks.xyz(-hw, 0.04, 0, hw, 0.04, 0, 0xffffff, 0.35);
      const slat = Ks.build(mats, mats.road);
      g.add(slat);
      world.group.add(g);
      hoops.push({ g, slat, even: even(k), home: home[k], seed: k * 1.7 });
    }
    const at = V(0, 0, 0);
    T.draw.push((s) => {
      for (const h of hoops) {
        const m = h.even + (h.home - h.even) * s.spring + Math.sin(s.t * 34 + h.seed) * 0.5 * Math.abs(s.shiver) * 6;
        const f = clamp(m / p.length, 0, 1);
        p.pointF(f, 0, 0.03, at);
        h.g.position.copy(at);
        const i = p.index(f);
        h.g.rotation.y = Math.atan2(p.thx[i], p.thz[i]);
        h.slat.scale.z = 1 - 0.5 * s.spring;
      }
    });
    // the anchor rings at each end of the moving span
    for (const m of [sp.m0 - 14, sp.m0 + sp.span + 14]) {
      const i = Math.round(m / p.ds);
      const c = p.point(i, 0, lift, V(0, 0, 0));
      L.ring(M.ALL, c, V(p.rightX(i), 0, p.rightZ(i)), UP, R + 1.5, 30, YEL);
      L.ring(M.ALL, c, V(p.rightX(i), 0, p.rightZ(i)), UP, R + 2.3, 30, ORG);
    }
  }

  // ---- the tray: a wooden board on a frame, with its walls, its holes and its painted line
  {
    const tr = T.tray;
    const { i0, i1 } = tr;
    const mid = Math.round((i0 + i1) / 2);
    const c = main.point(mid, 0, 0, V(0, 0, 0));
    const hw = main.halfW;
    const loc = (i, lat, h = 0) => main.point(i, lat, h, V(0, 0, 0)).sub(c);
    // (laid out flat: this runs before the first tilt is drawn, and the board is turned as one piece)
    const K = new Kit();
    for (let i = i0; i < i1; i++) {
      K.quad(loc(i, -hw), loc(i + 1, -hw), loc(i + 1, hw), loc(i, hw));
      // floorboards, the rim, and the painted line down the middle with its arrows
      if ((i - i0) % 3 === 0) K.line(loc(i, -hw, 0.03), loc(i, hw, 0.03), WOOD, 0.32);
      for (const s of [-1, 1]) {
        K.line(loc(i, s * hw, 0.04), loc(i + 1, s * hw, 0.04), WOOD);
        K.line(loc(i, s * (hw + 0.4), 1.5), loc(i + 1, s * (hw + 0.4), 1.5), WOOD);
        if ((i - i0) % 5 === 0) K.line(loc(i, s * hw, 0.04), loc(i, s * (hw + 0.4), 1.5), WOOD, 0.7);
        K.line(loc(i, s * 0.9, 0.05), loc(i + 1, s * 0.9, 0.05), 0xffffff, 0.3);
      }
      if ((i - i0) % 2 === 0) K.line(loc(i, 0, 0.05), loc(i + 1, 0, 0.05), PNK);
      if ((i - i0) % 8 === 0) for (const s of [-1, 1]) K.line(loc(i, s * 0.8, 0.05), loc(i + 2, 0, 0.05), PNK, 0.8);
    }
    for (const lat of [-6.6, -3.3, 3.3, 6.6]) for (let i = i0; i < i1; i += 2) K.line(loc(i, lat, 0.03), loc(i + 1, lat, 0.03), WOOD, 0.18);
    const board = K.build(mats, mats.road);
    board.position.copy(c);
    world.group.add(board);
    // holes: a black well with a bright lip
    const well = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (const h of tr.holes) {
      const at = loc(h.i, h.lat, 0.06);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(h.r, 20), well);
      disc.rotation.x = -Math.PI / 2;
      disc.position.copy(at);
      disc.renderOrder = 2;
      board.add(disc);
      const Kh = new Kit();
      for (const [r, k] of [[h.r, 1], [h.r + 0.35, 0.5], [h.r * 0.6, 0.25]]) Kh.ring(at.clone().setY(at.y + 0.02), V(1, 0, 0), V(0, 0, 1), r, 20, ORG, k);
      board.add(Kh.build(mats));
      h.pos = at.clone().add(c);
    }
    // the plank walls (collision: world.obstacles; a hard hit splinters one for a while, like any block)
    for (const g of tr.gates) {
      const Kg = new Kit();
      const h = 3.2;
      Kg.box(0, h / 2, 0, g.w * 2, h, 1.2, WOOD);
      for (const y of [0.8, 1.6, 2.4]) Kg.xyz(-g.w, y, 0.62, g.w, y, 0.62, WOOD, 0.6);
      for (let x = -g.w; x < g.w; x += 1.5) Kg.xyz(x, 0, 0.63, x + 0.7, h, 0.63, YEL, 0.55);
      const root = Kg.build(mats);
      root.position.copy(loc(g.i, g.lat));
      root.rotation.y = Math.atan2(main.rightX(g.i), main.rightZ(g.i));
      board.add(root);
      const ob = { path: main, i: g.i, f: main.frac(g.i), lat: g.lat, w: g.w, len: 0.6, h, mask: M.ALL, type: 'plank', root, sweep: 0, phase: 0, baseLat: g.lat };
      world.obstacles.push(ob);
      g.ob = ob;
    }
    // the frame: a rail each side on legs, the pivots at the ends, and the knob that turns before the board does
    const along = V(main.thx[mid], 0, main.thz[mid]);
    for (const s of [-1, 1]) {
      const a = main.point(i0, s * (hw + 3), -1.4, V(0, 0, 0));
      const b = main.point(i1, s * (hw + 3), -1.4, V(0, 0, 0));
      L.line(M.ALL, a, b, GRN);
      for (const q of [a, b, a.clone().lerp(b, 0.5)]) L.cylinder(M.ALL, q.x, floor, q.z, 1.1, q.y - floor, 6, 3, GRN);
    }
    for (const i of [i0, i1]) L.ring(M.ALL, main.point(i, 0, -1.2, V(0, 0, 0)), V(main.rightX(i), 0, main.rightZ(i)), UP, 1.6, 12, YEL);
    const Kk = new Kit();
    Kk.ring(V(0, 0, 0), V(0, 1, 0), V(0, 0, 1), 4.2, 20, YEL);
    Kk.ring(V(0, 0, 0), V(0, 1, 0), V(0, 0, 1), 3.6, 20, ORG, 0.7);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      Kk.xyz(0, 0, 0, 0, Math.cos(a) * 4.2, Math.sin(a) * 4.2, YEL, 0.8);
      Kk.xyz(0, Math.cos(a) * 4.2, Math.sin(a) * 4.2, 1.4, Math.cos(a) * 4.9, Math.sin(a) * 4.9, PNK);
    }
    const knob = Kk.build(mats);
    knob.position.copy(main.point(i0 - tr.nb - 2, 0, 9.5, V(0, 0, 0)));
    knob.rotation.y = Math.atan2(along.x, along.z) - Math.PI / 2;
    const stem = main.point(i0 - tr.nb - 2, hw + 3, 0, V(0, 0, 0));
    L.lineXYZ(M.ALL, stem.x, stem.y, stem.z, stem.x, stem.y + 9.5, stem.z, YEL);
    L.line(M.ALL, stem.clone().setY(stem.y + 9.5), main.point(i0 - tr.nb - 2, -hw - 3, 9.5, V(0, 0, 0)), YEL);
    const stem2 = main.point(i0 - tr.nb - 2, -hw - 3, 0, V(0, 0, 0));
    L.lineXYZ(M.ALL, stem2.x, stem2.y, stem2.z, stem2.x, stem2.y + 9.5, stem2.z, YEL);
    const spin = new THREE.Group();
    spin.add(knob);
    world.group.add(spin);
    // the mats at each end twist from the road to the board
    const nb = tr.nb;
    const mk = new Kit();
    const mat = { pos: null };
    const rows = [];
    for (const [a, b] of [[i0 - nb, i0], [i1, i1 + nb]]) for (let i = a; i < b; i++) rows.push(i);
    for (let q = 0; q < rows.length; q++) {
      const i = rows[q];
      mk.quad(main.point(i, -hw, 0.02), main.point(i + 1, -hw, 0.02), main.point(i + 1, hw, 0.02), main.point(i, hw, 0.02));
      for (const s of [-1, 1]) mk.line(main.point(i, s * hw, 0.05), main.point(i + 1, s * hw, 0.05), ORG);
      mk.line(main.point(i, -hw, 0.04), main.point(i, hw, 0.04), ORG, 0.45);
    }
    const flaps = mk.build(mats, mats.road);
    world.group.add(flaps);
    const lineP = flaps.children[0].geometry.attributes.position;
    const fillP = flaps.children[1].geometry.attributes.position;
    mat.pos = [lineP, fillP];
    const a = V(0, 0, 0);
    const axis = along.clone();
    T.draw.push((s) => {
      // (the bank lifts the right-hand side: a turn about the way the road runs)
      board.quaternion.setFromAxisAngle(axis, -s.tilt);
      knob.rotation.x = s.knob * 1.9;
      let v = 0;
      let l = 0;
      const put = (P, k, i, lat, h) => {
        main.point(i, lat, h, a);
        P.setXYZ(k, a.x, a.y, a.z);
      };
      for (const i of rows) {
        for (const [di, lat] of [[0, -hw], [1, -hw], [1, hw], [0, -hw], [1, hw], [0, hw]]) put(fillP, v++, i + di, lat, 0.02);
        for (const sd of [-1, 1]) {
          put(lineP, l++, i, sd * hw, 0.05);
          put(lineP, l++, i + 1, sd * hw, 0.05);
        }
        put(lineP, l++, i, -hw, 0.04);
        put(lineP, l++, i, hw, 0.04);
      }
      lineP.needsUpdate = fillP.needsUpdate = true;
    });
    sign(i0 - nb, 'TILT TRAY', 'WATCH THE KNOB · BLUE FLOATS THE HOLES', 70);
  }

  // ---- the lens tubes: hoops of tinted plastic along each, and toy blocks (the other world's) across its mouth
  const fr = {};
  let n = 0;
  for (const b of world.paths) {
    const d = b.def;
    if (!d?.hatch) continue;
    const secret = d.label === 'SECRET CHUTE';
    const cover = d.mask === M.BO ? M.R : M.B;
    let j0 = -1;
    for (let j = 0; j < b.N && j0 < 0; j++) {
      const off = !main.frame(b.px[j], b.pz[j], -1, fr, b.py[j]) || Math.abs(fr.lat) > main.halfW + b.halfW + 1.5 || Math.abs(fr.y - b.py[j]) > 6;
      if (off) j0 = j;
    }
    if (j0 < 0) continue;
    for (let j = j0 + 4; j < b.N - 8; j += 7) {
      const c = b.point(j, 0, -0.5, V(0, 0, 0));
      L.hoop(d.mask, c, V(b.rightX(j), 0, b.rightZ(j)), UP, b.halfW + 1.2, 1.6, 20, null, Math.PI, 0);
    }
    const i = Math.min(b.N - 1, j0 + 3);
    const c = b.point(i, 0, 0, V(0, 0, 0));
    const yaw = Math.atan2(b.thx[i], b.thz[i]);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    if (secret) {
      // a cardboard box on its side, flaps open, in the blue world: through the red lens it isn't there
      L.box(cover, c.x, c.y + 5, c.z, 17, 10, 13, yaw, null, true);
      for (const s of [-1, 1]) {
        const e = V(c.x + rx * s * 8.5 - Math.sin(yaw) * 6.5, c.y + 10, c.z + rz * s * 8.5 - Math.cos(yaw) * 6.5);
        L.line(cover, e, e.clone().add(V(rx * s * 5 - Math.sin(yaw) * 3, 2.5, rz * s * 5 - Math.cos(yaw) * 3)));
        L.line(cover, e.clone().setY(c.y), e.clone().setY(c.y).add(V(rx * s * 5 - Math.sin(yaw) * 3, 0, rz * s * 5 - Math.cos(yaw) * 3)));
      }
      L.box(M.ALL, c.x, c.y + 0.2, c.z, 17.4, 0.3, 13.4, yaw, CARD, false);
    } else {
      // alphabet blocks: a row of four with two on top and one on those
      const size = 4.6;
      const rows = [[-1.5, -0.5, 0.5, 1.5], [-0.5, 0.5], [0]];
      rows.forEach((row, level) => {
        for (const q of row) {
          const x = c.x + rx * q * size;
          const z = c.z + rz * q * size;
          L.box(cover, x, c.y + size / 2 + level * size, z, size - 0.3, size - 0.3, size - 0.3, yaw + (level ? 0.12 * (q || 1) : 0), null, true);
          L.box(cover, x, c.y + size / 2 + level * size, z, size * 0.5, size * 0.5, size - 0.2, yaw + (level ? 0.12 * (q || 1) : 0), null, false);
        }
      });
    }
    n++;
  }
  void n;
  void COLORS;

  // ---- the art pass: snap-together track, the rest of the set beside the road, marbles everywhere
  dressDropTower(world, L, main, T, { OX, TOP });
}
