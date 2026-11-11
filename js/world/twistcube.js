// 22 QUARTER TURN: the secret course. A giant 3 by 3 twisting cube on the bedroom shelf (the TOYBOX CUP's room,
// toybox.js), and the road is printed on it: every face has a roundabout and a pair of lanes off it over each edge,
// and each piece of that road belongs to the cubie it's on and goes where the cubie goes. The race runs round four
// of the faces (top, front, underneath, back), out along one side of the chain and home along the other.
//
// Every few seconds, on the race clock and in the same order every race, a ratchet clicks four times, chevrons run
// along a seam, and that layer of the cube turns a quarter turn, road and all:
//
//   the face you're on turns     its roundabout is a turntable: you're carried round with it, on or back
//   a layer under you swings off  the road goes with it and the next pieces bring theirs: bare track for a moment
//   the pieces line up           a FAST LINE opens straight across a face (yellow), and shuts when they part
//
// A fast line is made of three pieces: the hub on a face's centre and a spoke on the edge sticker either side of it.
// Only some edge stickers carry a spoke, and the turns deal them round the cube, so which faces have a fast line
// changes all race: the front and the underneath have one each way, the back has one across.
//
// The stickers are coloured glass over the road, and they're the lens rule:
//
//   white, yellow, green   there in every lens
//   red                    the red world: gone through the BLUE lens
//   blue                   the blue world: gone through the RED lens
//   violet                 the overlap: there in BOTH only
//
// On glass that isn't there for you, you're down on the bare track under it and slow (nobody falls off this toy). A
// red or blue sticker lights a boost for its own lens.
//
// The physics drives a flat road like every other course. The cube you see is that road wrapped round four faces
// (curved.js): the chain of faces rolls out flat with nothing stretched, so a bend on the flat road is the same bend
// on the cube, and a turning face is a plain turn about its middle in both. The rails are the physics's own and stay
// put; the road's surface and markings are the cube's and move.

import * as THREE from '../../vendor/three.js';
import { M, BOTH, RED, BLUE, solidIn, COLORS } from './shift.js';
import { newFrames, putFrame } from './curved.js';
import { toyboxEnv, TOY_YELLOW } from './toybox.js';

// ------------------------------------------------------------------ the cube's measures
const S = 96; // one sticker
const H = S * 1.5; // half the cube
const RHO = 16; // the rounding of the four edges the road goes over
const A = H - RHO; // half the flat of a face, along the road
const ARC = (Math.PI / 2) * RHO; // the way round one edge
const DC = 2 * A + ARC; // from the middle of one face to the middle of the next, along the road
const R = 84; // the roundabouts
const D = 22; // each lane of the link between two faces, off the middle
// the bend from a roundabout into a lane: its radius is whatever leaves LINK metres of straight over the edge
const LINK = 18;
const ZQ = DC / 2 - LINK / 2;
const RF = (ZQ * ZQ - R * R + D * D) / (2 * (R - D));
const TH = Math.atan2(ZQ, D + RF); // where the bend leaves the roundabout, as an angle up from the face's side
const HALF_W = 11;
const TURN = 2.6; // seconds a layer takes
const WARN = 2.4; // the ratchet before it
const STAND = 70;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const AX = { x: V(1, 0, 0), y: V(0, 1, 0), z: V(0, 0, 1) };

// The four faces the road crosses, in the order the flat road meets them: where the face's middle is, which way the
// road's long axis runs on it, and its outward side.
const FACES = [
  { name: 'U', n: V(0, 1, 0), t: V(0, 0, 1) },
  { name: 'F', n: V(0, 0, 1), t: V(0, -1, 0) },
  { name: 'D', n: V(0, -1, 0), t: V(0, 0, -1) },
  { name: 'B', n: V(0, 0, -1), t: V(0, 1, 0) },
];

// Flat (x, z) to the cube: the place on its skin, the way the flat z axis runs there, and out. Flat x is the cube's x.
const _bp = new THREE.Vector3();
const _bt = new THREE.Vector3();
const _bn = new THREE.Vector3();
function band(z) {
  let s = z + A;
  const k = Math.floor(s / DC);
  const l = s - k * DC;
  const f = FACES[((k % 4) + 4) % 4];
  if (l <= 2 * A) {
    _bp.copy(f.n).multiplyScalar(H).addScaledVector(f.t, l - A);
    _bt.copy(f.t);
    _bn.copy(f.n);
    return (((k % 4) + 4) % 4);
  }
  const a = (l - 2 * A) / RHO;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  _bn.copy(f.n).multiplyScalar(c).addScaledVector(f.t, sn);
  _bt.copy(f.t).multiplyScalar(c).addScaledVector(f.n, -sn);
  _bp.copy(f.n).multiplyScalar(A).addScaledVector(f.t, A).addScaledVector(_bn, RHO);
  return -1; // over an edge
}

// ------------------------------------------------------------------ the flat road
// Round each roundabout the same way (angle up from +x toward +z), out along the +x side, home along the -x side.
function layout() {
  const pts = [];
  const marks = {};
  let len = 0;
  const push = (x, z) => {
    const n = pts.length;
    if (n) {
      const d = Math.hypot(x - pts[n - 1][0], z - pts[n - 1][1]);
      if (d < 0.5) return;
      len += d;
    }
    pts.push([x, z, 0]);
  };
  const mark = (name) => (marks[name] = len);
  const arc = (cx, cz, r, a0, a1, step = 13) => {
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      push(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
    }
  };
  const line = (x, z0, z1, step = 9) => {
    const n = Math.max(1, Math.round(Math.abs(z1 - z0) / step));
    for (let i = 1; i < n; i++) push(x, z0 + ((z1 - z0) * i) / n);
  };
  const START = -Math.PI * 0.42; // the line: on top of the cube, just out of the secret road's far end
  // the top face, from the line round to the way out
  mark('U0');
  arc(0, 0, R, START, TH);
  for (let k = 0; k < 3; k++) {
    const c0 = k * DC;
    const c1 = (k + 1) * DC;
    mark(`out${k}`);
    arc(D + RF, c0 + ZQ, RF, TH + Math.PI, Math.PI); // off the roundabout
    line(D, c0 + ZQ, c1 - ZQ); // over the edge
    mark(`eo${k + 1}`);
    arc(D + RF, c1 - ZQ, RF, Math.PI, Math.PI - TH); // onto the next
    mark(`${FACES[k + 1].name}0`);
    if (k < 2) arc(0, c1, R, -TH, TH);
    else arc(0, c1, R, -TH, Math.PI + TH); // the far end: all the way round
  }
  for (let k = 3; k > 0; k--) {
    const c0 = k * DC;
    const c1 = (k - 1) * DC;
    mark(`in${k}`);
    arc(-D - RF, c0 - ZQ, RF, TH, 0);
    line(-D, c0 - ZQ, c1 + ZQ);
    mark(`eh${k - 1}`);
    arc(-D - RF, c1 + ZQ, RF, 0, -TH);
    mark(`${FACES[k - 1].name}1`);
    if (k > 1) arc(0, c1, R, Math.PI - TH, Math.PI + TH);
    else arc(0, c1, R, Math.PI - TH, Math.PI * 2 + START - 0.12);
  }
  mark('end');
  // close the loop's length
  len += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return { pts, marks, len, START };
}
const LAY = layout();
const lapAt = (m, metres = 0) => (((LAY.marks[m] + metres) / LAY.len) % 1 + 1) % 1;
// the lap fraction at an angle round one of the roundabouts, on the pass that starts at mark `m` from angle a0
const U = (m, metres = 0) => (((LAY.marks[m] + metres) / LAY.len) % 1 + 1) % 1;
const onU = (deg) => {
  // the top face: the first pass runs from START to TH, the second from PI - TH to 2 PI + START
  const a = (deg * Math.PI) / 180;
  if (a >= LAY.START && a <= TH) return U('U0', (a - LAY.START) * R);
  return U('U1', (a - (Math.PI - TH)) * R);
};
const onB = (deg) => U('B0', ((deg * Math.PI) / 180 + TH) * R);
const onMid = (name, deg) => (name.endsWith('0') ? U(name, ((deg * Math.PI) / 180 + TH) * R) : U(name, ((deg * Math.PI) / 180 - (Math.PI - TH)) * R));

// ------------------------------------------------------------------ the fast lines
// Straight across a face where the road goes round: two on the front and two underneath (out and home), and one
// across the back. Each is a real road, there all the time for the physics, but shut (its mouth railed off, and not
// drawn) unless the cube's pieces line up to make it: see SPOKES.
const straight = (x, z0, z1) => {
  const pts = [];
  const n = Math.round(Math.abs(z1 - z0) / 18);
  for (let i = 0; i <= n; i++) pts.push([x, z0 + ((z1 - z0) * i) / n]);
  return pts;
};
const EXPRESS = [
  ...[1, 2].map((f) => ({ face: f, axis: 'v', def: { from: lapAt(`eo${f}`), to: lapAt(`out${f}`, RF * TH), side: 1, lead: 50, halfWidth: 8, pts: straight(D, f * DC - ZQ - 4, f * DC + ZQ + 4) } })),
  { face: 3, axis: 'u', def: { from: onB(14), to: onB(166), side: 1, lead: 30, halfWidth: 8 } },
  ...[2, 1].map((f) => ({ face: f, axis: 'v', def: { from: lapAt(`eh${f}`), to: lapAt(`in${f}`, RF * TH), side: 1, lead: 50, halfWidth: 8, pts: straight(-D, f * DC + ZQ + 4, f * DC - ZQ - 4) } })),
];

// ------------------------------------------------------------------ the stickers
// Each face's colour when the cube is solved, and the lenses a sticker of that colour is there in.
const GREEN = 0x3dffb0;
const STICKERS = [
  { n: V(0, 1, 0), color: COLORS.white, mask: M.ALL }, // top
  { n: V(0, 0, 1), color: COLORS.red, mask: M.R }, // front
  { n: V(0, -1, 0), color: COLORS.violet, mask: M.X }, // underneath
  { n: V(0, 0, -1), color: COLORS.blue, mask: M.B }, // back
  { n: V(-1, 0, 0), color: TOY_YELLOW, mask: M.ALL },
  { n: V(1, 0, 0), color: GREEN, mask: M.ALL },
];

// All six faces, in the stickers' order, each with its own two directions across it (for the four the road is on, v is
// the way the flat road's z runs).
const SIDES = [
  { n: V(0, 1, 0), eu: V(1, 0, 0), ev: V(0, 0, 1) },
  { n: V(0, 0, 1), eu: V(1, 0, 0), ev: V(0, -1, 0) },
  { n: V(0, -1, 0), eu: V(1, 0, 0), ev: V(0, 0, -1) },
  { n: V(0, 0, -1), eu: V(1, 0, 0), ev: V(0, 1, 0) },
  { n: V(-1, 0, 0), eu: V(0, 0, 1), ev: V(0, 1, 0) },
  { n: V(1, 0, 0), eu: V(0, 0, 1), ev: V(0, 1, 0) },
];
// A place on a face, h above it: flat in the middle, and round the cube's edge past A (to the middle of the edge at
// DC / 2, where the next face's own half of the bend takes over).
function faceP(F, u, v, h, out) {
  const au = Math.abs(u);
  const av = Math.abs(v);
  if (av > A || au > A) {
    const overV = av > A;
    const e = overV ? F.ev : F.eu;
    const sg = Math.sign(overV ? v : u);
    const a = ((overV ? av : au) - A) / RHO;
    out.copy(F.n).multiplyScalar(A + Math.cos(a) * (RHO + h)).addScaledVector(e, sg * (A + Math.sin(a) * (RHO + h)));
    return out.addScaledVector(overV ? F.eu : F.ev, overV ? u : v);
  }
  return out.copy(F.n).multiplyScalar(H + h).addScaledVector(F.eu, u).addScaledVector(F.ev, v);
}
// The fast lines' spokes: which of each face's four edge stickers carry one when the cube is solved (by the way out
// from the middle of the face). A fast line is open when the two edge stickers it crosses both have a spoke.
const SPOKES = [['v+', 'u+'], ['v+', 'v-', 'u-'], ['v-', 'u+', 'u-'], ['u+', 'u-', 'v+'], ['u+', 'v-', 'v+'], ['u-', 'v+', 'v-']];

// The turns, as a cube player writes them: a face's letter is a quarter turn clockwise seen from outside, with a '
// for the other way. The song is the same every race; it starts SONG_AT seconds in and plays a turn every SONG_EVERY.
// A clockwise turn of a face the road is on carries you on round its roundabout; a ' turn carries you back.
const SONG = ['U', 'R', 'F', "L'", 'D', 'B', "R'", 'U', "F'", 'L', 'D', "U'", 'B', 'R', 'F', "D'", 'L', 'U', "B'", "R'", 'D', 'F', 'U', "L'"];
const SONG_AT = 9;
const SONG_EVERY = 10;
// (and it picks up: after QUICK turns, about when the leaders start their last lap, they come every SONG_QUICK seconds)
const QUICK = 7;
const SONG_QUICK = 7;
const dueOf = (k) => SONG_AT + Math.min(k, QUICK) * SONG_EVERY + Math.max(0, k - QUICK) * SONG_QUICK;
const LAYER = { U: ['y', 1], D: ['y', -1], F: ['z', 1], B: ['z', -1], R: ['x', 1], L: ['x', -1] };

const ease = (u) => u * u * (3 - 2 * u);
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

class TwistCube {
  constructor(world) {
    this.world = world;
    this.root = new THREE.Group();
    world.group.add(this.root);
    this.cubies = [];
    this.move = null; // the layer turning now
    this.done = 0; // turns of the song played
    this.mono = false;
    this.buildCubies();
    this.buildPads();
    this.findZones();
    this.buildFrame();
    for (const e of this.express) this.setExpress(e, this.expressOpen(e));
    this.refresh();
  }

  // ---------------------------------------------------------------- the frame: rails, and the fast lines
  // The rails don't turn with the cube: they're where the physics has them, always. So are the fast lines' own roads
  // (drawn only while they're open) and the gates across their mouths (drawn only while they're shut).
  buildFrame() {
    const w = this.world;
    const main = w.main;
    const L = w.layers;
    const col = new THREE.Color();
    const kit = () => ({ rp: [], rc: [], lp: [], lc: [], gp: [] });
    const quad = (K, a, b, c, d, color, k = 1) => {
      K.rp.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      col.set(color).multiplyScalar(k);
      for (let i = 0; i < 6; i++) K.rc.push(col.r, col.g, col.b);
    };
    const line = (K, a, b, color) => {
      K.lp.push(a.x, a.y, a.z, b.x, b.y, b.z);
      col.set(color);
      K.lc.push(col.r, col.g, col.b, col.r, col.g, col.b);
    };
    const P = (path, i, lat, y) => path.wpoint(i, lat, y, V(0, 0, 0));
    const rail = (K, path, i, side, color) => {
      const j = path.wrap(i + 1);
      const hw = path.halfW;
      let p0 = P(path, i, side * (hw - 0.5), 0.3);
      let p1 = P(path, j, side * (hw - 0.5), 0.3);
      for (let s = 1; s <= 3; s++) {
        const a = (s / 3) * Math.PI * 0.5;
        const lat = hw - 0.5 + (1 - Math.cos(a)) * 0.7;
        const y = 0.3 + Math.sin(a) * 0.75;
        const q0 = P(path, i, side * lat, y);
        const q1 = P(path, j, side * lat, y);
        quad(K, p0, p1, q1, q0, color, 0.16 + s * 0.1);
        p0 = q0;
        p1 = q1;
      }
      quad(K, P(path, i, side * (hw + 0.2), 1.25), P(path, j, side * (hw + 0.2), 1.25), P(path, j, side * (hw + 0.2), 0.9), P(path, i, side * (hw + 0.2), 0.9), color, 0.8);
      if (i % 4 === 0) line(K, P(path, i, side * (hw + 0.2), 0.1), P(path, i, side * (hw + 0.2), 1.25), color);
    };
    const mesh = (K, parent) => {
      const m = L.materials(M.ALL);
      const add = (arr, colors, mat, order, lines) => {
        if (!arr.length) return;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        if (colors) {
          g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
          this.neutralGeo.push({ g, colors });
        }
        const o = lines ? new THREE.LineSegments(g, mat) : new THREE.Mesh(g, mat);
        o.renderOrder = order;
        o.frustumCulled = false;
        parent.add(o);
      };
      add(K.gp, null, m.road, 1);
      add(K.rp, K.rc, m.ribbon, 3);
      add(K.lp, K.lc, m.line, 2, true);
      return parent;
    };

    // the fast lines, and the stretches of the main road's rail that are their mouths
    this.express = [];
    const mouthOf = new Map();
    for (const [k, E] of EXPRESS.entries()) {
      const path = w.paths[k + 1];
      const e = { ...E, path, mouth: [], open: false, gate: new THREE.Group(), road: new THREE.Group(), glow: 0 };
      const span = Math.ceil(((E.def.lead ?? 30) * 1.3) / main.ds);
      const iA = main.index(E.def.from);
      const iB = main.index(E.def.to);
      for (let k2 = -4; k2 <= span; k2++) for (const i of [main.wrap(iA + k2), main.wrap(iB - k2)]) {
        if (mouthOf.has(i)) continue;
        mouthOf.set(i, e);
        e.mouth.push(i);
      }
      this.express.push(e);
    }
    const frame = kit();
    for (let i = 0; i < main.N; i++) {
      for (const side of [-1, 1]) {
        const e = side > 0 ? mouthOf.get(i) : null;
        if (!(side < 0 ? main.railL[i] : main.railR[i]) && !e) continue;
        if (e) rail((e.gateK ||= kit()), main, i, side, TOY_YELLOW);
        else rail(frame, main, i, side, side < 0 ? COLORS.red : COLORS.blue);
      }
    }
    w.group.add(mesh(frame, new THREE.Group()));
    for (const e of this.express) {
      const p = e.path;
      const K = kit();
      const hw = p.halfW;
      for (let i = 0; i < p.N - 1; i++) {
        const j = i + 1;
        const a = P(p, i, -hw, 0.34), b = P(p, j, -hw, 0.34), c = P(p, j, hw, 0.34), d = P(p, i, hw, 0.34);
        K.gp.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
        for (const side of [-1, 1]) {
          quad(K, P(p, i, side * hw, 0.42), P(p, j, side * hw, 0.42), P(p, j, side * (hw - 0.6), 0.42), P(p, i, side * (hw - 0.6), 0.42), TOY_YELLOW, 0.7);
          if (side < 0 ? p.railL[i] : p.railR[i]) rail(K, p, i, side, TOY_YELLOW);
        }
        // chevrons down the middle, the way it runs
        if (i % 8 === 0 && i < p.N - 2) for (const side of [-1, 1]) quad(K, P(p, i, side * 3.2, 0.42), P(p, j, 0, 0.42), P(p, j + 1, 0, 0.42), P(p, j, side * 3.2, 0.42), TOY_YELLOW, 0.3);
      }
      w.group.add(mesh(K, e.road));
      w.group.add(mesh(e.gateK || kit(), e.gate));
      delete e.gateK;
    }
  }

  // Is a fast line made just now: do the two edge stickers it crosses both carry a spoke?
  expressOpen(e) {
    const F = SIDES[e.face];
    const dir = e.axis === 'v' ? F.ev : F.eu;
    for (const s of [-1, 1]) {
      const st = this.stickerAt(_w.copy(F.n).addScaledVector(dir, s).round(), F.n);
      if (!st?.spoke) return false;
    }
    return true;
  }
  setExpress(e, open) {
    e.open = open;
    for (const i of e.mouth) this.world.main.railR[i] = open ? 0 : 1;
    e.path.def.closed = !open;
    e.gate.visible = !open;
    e.road.visible = open;
  }

  // ---------------------------------------------------------------- what's drawn
  // A cubie is its plates: black plastic under the road, and a pane of coloured glass over it on each outside face.
  buildCubies() {
    const L = this.world.layers;
    const cell = (c) => (c < 0 ? [-H, -S / 2] : c > 0 ? [S / 2, H] : [-S / 2, S / 2]);
    const cellOf = (a) => (a < -S / 2 ? -1 : a > S / 2 ? 1 : 0);
    const col = new THREE.Color();
    const bySlot = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    // one cubie's pieces, sorted by the lenses they're there in
    const kit = () => {
      const B = new Map(); // mask -> { rp, rc, lp, lc, fp, gp }
      const b = (mask) => {
        let o = B.get(mask);
        if (!o) B.set(mask, (o = { rp: [], rc: [], lp: [], lc: [], fp: [], gp: [] }));
        return o;
      };
      const tri = (arr, a, b2, c, d) => arr.push(a.x, a.y, a.z, b2.x, b2.y, b2.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      return {
        B,
        // a glowing quad; k1 (if given) is the strength along the c-d side, for a fade
        quad(mask, a, b2, c, d, color, k = 1, k1 = k) {
          const o = b(mask);
          tri(o.rp, a, b2, c, d);
          col.set(color).multiplyScalar(k);
          const r0 = col.r, g0 = col.g, b0 = col.b;
          col.set(color).multiplyScalar(k1);
          // a b c a c d
          o.rc.push(r0, g0, b0, r0, g0, b0, col.r, col.g, col.b, r0, g0, b0, col.r, col.g, col.b, col.r, col.g, col.b);
        },
        line(mask, a, b2, color, k = 1) {
          const o = b(mask);
          o.lp.push(a.x, a.y, a.z, b2.x, b2.y, b2.z);
          col.set(color).multiplyScalar(k);
          o.lc.push(col.r, col.g, col.b, col.r, col.g, col.b);
        },
        fill: (a, b2, c, d) => tri(b(M.ALL).fp, a, b2, c, d),
        road: (a, b2, c, d) => tri(b(M.ALL).gp, a, b2, c, d),
      };
    };
    for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 1; cy++) for (let cz = -1; cz <= 1; cz++) {
      if (!cx && !cy && !cz) continue;
      const K = kit();
      const cubie = { slot: V(cx, cy, cz), q: new THREE.Quaternion(), group: new THREE.Group(), stickers: [], K };
      bySlot.set(key(cx, cy, cz), cubie);
      const cc = { x: cx, y: cy, z: cz };
      for (const [fi, st] of STICKERS.entries()) {
        const F = SIDES[fi];
        const cu = Math.round(V(cx, cy, cz).dot(F.eu));
        const cv = Math.round(V(cx, cy, cz).dot(F.ev));
        if (Math.round(V(cx, cy, cz).dot(F.n)) !== 1) continue;
        // (an edge sticker may carry a spoke of the fast line: see SPOKES)
        const spoke = (!cu) !== (!cv) && SPOKES[fi].includes(cu ? (cu > 0 ? 'u+' : 'u-') : cv > 0 ? 'v+' : 'v-');
        cubie.stickers.push({ n0: st.n.clone(), mask: st.mask, color: st.color, spoke, hub: !cu && !cv });
        const P = (u, v, h) => faceP(F, u, v, h, V(0, 0, 0));
        const [u0, u1] = cell(cu);
        const [v0, v1] = cell(cv);
        // (every edge of the cube is rounded: a plate stops short of it, and a curved strip joins it to the next)
        const lim = (a) => Math.max(-A, Math.min(A, a));
        const pu0 = lim(u0), pu1 = lim(u1), pv0 = lim(v0), pv1 = lim(v1);
        K.fill(P(pu0, pv0, -0.35), P(pu1, pv0, -0.35), P(pu1, pv1, -0.35), P(pu0, pv1, -0.35));
        // the seams between cubies: a dim line round the cell
        const seam = 0x3a2a55;
        K.line(M.ALL, P(pu0, pv0, 0.02), P(pu1, pv0, 0.02), seam);
        K.line(M.ALL, P(pu1, pv0, 0.02), P(pu1, pv1, 0.02), seam);
        K.line(M.ALL, P(pu1, pv1, 0.02), P(pu0, pv1, 0.02), seam);
        K.line(M.ALL, P(pu0, pv1, 0.02), P(pu0, pv0, 0.02), seam);
        // the sticker: glass with a bright rim, a little in from the cell's edge
        const IN = 5;
        const su0 = pu0 + IN, su1 = pu1 - IN, sv0 = pv0 + IN, sv1 = pv1 - IN;
        const h = 0.22;
        const m = st.mask;
        // (pale glass glows harder than deep glass at the same strength: keep the white, yellow and green panes down)
        const pale = st.mask === M.ALL;
        const RIM = pale ? 0.4 : 0.8;
        K.quad(m, P(su0, sv0, h), P(su1, sv0, h), P(su1, sv1, h), P(su0, sv1, h), st.color, pale ? 0.025 : 0.14);
        const W = 1.6;
        K.quad(m, P(su0, sv0, h), P(su1, sv0, h), P(su1, sv0 + W, h), P(su0, sv0 + W, h), st.color, RIM);
        K.quad(m, P(su0, sv1 - W, h), P(su1, sv1 - W, h), P(su1, sv1, h), P(su0, sv1, h), st.color, RIM);
        K.quad(m, P(su0, sv0, h), P(su0 + W, sv0, h), P(su0 + W, sv1, h), P(su0, sv1, h), st.color, RIM);
        K.quad(m, P(su1 - W, sv0, h), P(su1, sv0, h), P(su1, sv1, h), P(su1 - W, sv1, h), st.color, RIM);
        // a second rim inside it, like a peeling toy sticker
        const J = 7;
        K.line(m, P(su0 + J, sv0 + J, h), P(su1 - J, sv0 + J, h), st.color, 0.6);
        K.line(m, P(su1 - J, sv0 + J, h), P(su1 - J, sv1 - J, h), st.color, 0.6);
        K.line(m, P(su1 - J, sv1 - J, h), P(su0 + J, sv1 - J, h), st.color, 0.6);
        K.line(m, P(su0 + J, sv1 - J, h), P(su0 + J, sv0 + J, h), st.color, 0.6);
        // the fast line's pieces: two lanes from the middle of the cube's face out to its edge (a spoke), or the
        // crossing they meet at (the hub, on every centre)
        const lane = (a0, a1, off, alongU, sign) => {
          const Q = (a, l, hh) => (alongU ? P(a * sign, l, hh) : P(l, a * sign, hh));
          const w = 8;
          K.road(Q(a0, off - w, 0.06), Q(a1, off - w, 0.06), Q(a1, off + w, 0.06), Q(a0, off + w, 0.06));
          for (const e of [-1, 1]) {
            K.quad(M.ALL, Q(a0, off + e * w, 0.26), Q(a1, off + e * w, 0.26), Q(a1, off + e * (w - 0.7), 0.26), Q(a0, off + e * (w - 0.7), 0.26), TOY_YELLOW, 0.55);
          }
          // a dashed middle line
          for (let a = a0 + 4; a < a1 - 6; a += 12) K.quad(M.ALL, Q(a, off - 0.35, 0.27), Q(a + 6, off - 0.35, 0.27), Q(a + 6, off + 0.35, 0.27), Q(a, off + 0.35, 0.27), TOY_YELLOW, 0.3);
        };
        if (spoke) for (const off of [-D, D]) lane(S / 2, ZQ, off, !!cu, cu || cv);
        if (!cu && !cv) for (const off of [-D, D]) for (const alongU of [true, false]) lane(-S / 2, S / 2, off, alongU, 1);
      }
      // the rounded edge between two of its plates
      for (const [a, b2, c] of [['x', 'y', 'z'], ['y', 'z', 'x'], ['z', 'x', 'y']]) {
        if (!cc[a] || !cc[b2]) continue;
        const [c0, c1] = cell(cc[c]).map((x) => Math.max(-A, Math.min(A, x)));
        let prev = null;
        for (let s = 0; s <= 4; s++) {
          const an = (s / 4) * (Math.PI / 2);
          const mk = (cv) => {
            const p = V(0, 0, 0);
            p[a] = cc[a] * (A + Math.cos(an) * (RHO - 0.35));
            p[b2] = cc[b2] * (A + Math.sin(an) * (RHO - 0.35));
            p[c] = cv;
            return p;
          };
          const p = [mk(c0), mk(c1)];
          if (prev) K.fill(prev[0], prev[1], p[1], p[0]);
          prev = p;
        }
      }
      this.cubies.push(cubie);
    }

    // The road, printed on the cube: the same on every face (a roundabout, and a pair of lanes off it over each
    // edge), so whatever way the cube is turned the pieces that arrive carry on the road the last ones left. Each
    // piece of it belongs to the cubie it lies on, and goes where that cubie goes.
    const curves = [];
    {
      const ring = [];
      const n = 96;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        ring.push([Math.cos(a) * R, Math.sin(a) * R]);
      }
      curves.push({ pts: ring, ring: true });
      for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
        const pts = [];
        const na = 13;
        for (let i = 0; i <= na; i++) {
          const a = Math.PI + TH - (TH * i) / na;
          pts.push([D + RF + Math.cos(a) * RF, ZQ + Math.sin(a) * RF]);
        }
        const nl = 2;
        for (let i = 1; i <= nl; i++) pts.push([D, ZQ + ((DC / 2 - ZQ) * i) / nl]);
        const c = Math.cos((k * Math.PI) / 2);
        const sn = Math.sin((k * Math.PI) / 2);
        curves.push({ pts: pts.map(([x, z]) => [s * x * c - z * sn, s * x * sn + z * c]), flip: s < 0 });
      }
    }
    const HW = HALF_W;
    const distTo = (C, x, z) => {
      if (C.ring) return Math.abs(Math.hypot(x, z) - R);
      let best = 1e9;
      for (let i = 0; i < C.pts.length - 1; i++) {
        const [ax, az] = C.pts[i];
        const [bx, bz] = C.pts[i + 1];
        const dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
      }
      return best;
    };
    const covered = (C, x, z) => curves.some((o) => o !== C && distTo(o, x, z) < HW - 0.9);
    const prims = []; // { kind, pts: [[u, v, h]...], color, k, k1 }
    for (const C of curves) {
      const P = C.pts;
      const sec = P.map(([x, z], i) => {
        const a = P[Math.max(0, i - 1)];
        const b = P[Math.min(P.length - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1];
        if (C.ring) {
          tx = -z;
          tz = x;
        }
        const l = Math.hypot(tx, tz) || 1;
        // (the side the red line goes: the left of the way the road runs)
        const f = C.flip ? -1 : 1;
        return { x, z, lx: (-tz / l) * f, lz: (tx / l) * f };
      });
      const at = (s, lat, h) => [s.x + s.lx * lat, s.z + s.lz * lat, h];
      for (let i = 0; i < sec.length - 1; i++) {
        const s0 = sec[i];
        const s1 = sec[i + 1];
        const lats = [-HW, -HW / 2, 0, HW / 2, HW];
        for (let q = 0; q < 4; q++) prims.push({ kind: 'road', pts: [at(s0, lats[q], 0.08), at(s1, lats[q], 0.08), at(s1, lats[q + 1], 0.08), at(s0, lats[q + 1], 0.08)] });
        for (const [side, color] of [[1, COLORS.red], [-1, COLORS.blue]]) {
          const mx = (s0.x + s1.x) / 2 + ((s0.lx + s1.lx) / 2) * side * HW;
          const mz = (s0.z + s1.z) / 2 + ((s0.lz + s1.lz) / 2) * side * HW;
          if (covered(C, mx, mz)) continue;
          const e = (s, lat, h) => at(s, side * lat, h);
          prims.push({ kind: 'quad', pts: [e(s0, HW, 0.3), e(s1, HW, 0.3), e(s1, HW - 0.45, 0.3), e(s0, HW - 0.45, 0.3)], color, k: 1 });
          prims.push({ kind: 'quad', pts: [e(s0, HW - 0.45, 0.29), e(s1, HW - 0.45, 0.29), e(s1, HW - 3.2, 0.29), e(s0, HW - 3.2, 0.29)], color, k: 0.07, k1: 0 });
        }
        // lane lines and ribs
        for (const [f, color] of [[0.5, COLORS.red], [-0.5, COLORS.blue]]) prims.push({ kind: 'line', pts: [at(s0, f * HW, 0.28), at(s1, f * HW, 0.28)], color });
        if (i % 2 === 0) prims.push({ kind: 'line', pts: [at(s0, -HW, 0.28), at(s0, HW, 0.28)], color: (i >> 1) % 2 ? COLORS.red : COLORS.blue });
      }
    }
    const _p = [V(0, 0, 0), V(0, 0, 0), V(0, 0, 0), V(0, 0, 0)];
    for (const F of SIDES) {
      for (const pr of prims) {
        let u = 0, v = 0;
        for (const p of pr.pts) {
          u += p[0];
          v += p[1];
        }
        u /= pr.pts.length;
        v /= pr.pts.length;
        const slot = _v.copy(F.n).addScaledVector(F.eu, cellOf(u)).addScaledVector(F.ev, cellOf(v)).round();
        const K = bySlot.get(key(slot.x, slot.y, slot.z)).K;
        const q = pr.pts.map((p, i) => faceP(F, p[0], p[1], p[2], _p[i]));
        if (pr.kind === 'road') K.road(q[0], q[1], q[2], q[3]);
        else if (pr.kind === 'quad') K.quad(M.ALL, q[0], q[1], q[2], q[3], pr.color, pr.k, pr.k1 ?? pr.k);
        else K.line(M.ALL, q[0], q[1], pr.color);
      }
    }

    // each cubie's pieces, drawn with the course's own materials (so the lenses and the shift wave treat them like
    // everything else)
    this.neutralGeo = [];
    for (const cubie of this.cubies) {
      for (const [mask, o] of cubie.K.B) {
        const m = L.materials(mask);
        const add = (arr, colors, mat, order, lines) => {
          if (!arr.length) return;
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
          if (colors) {
            g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            if (mask === M.ALL) this.neutralGeo.push({ g, colors });
          }
          const mesh = lines ? new THREE.LineSegments(g, mat) : new THREE.Mesh(g, mat);
          mesh.renderOrder = order;
          mesh.frustumCulled = false;
          cubie.group.add(mesh);
        };
        add(o.fp, null, m.fill, 1);
        add(o.gp, null, m.road, 1);
        add(o.rp, o.rc, m.ribbon, 3);
        add(o.lp, o.lc, m.line, 2, true);
      }
      delete cubie.K;
      this.root.add(cubie.group);
    }
  }

  // Lens boosts: chevrons on the road wherever it crosses the middle of a sticker's run, lit red on a red sticker
  // and blue on a blue one, each for its own lens only.
  buildPads() {
    const w = this.world;
    const m = w.main;
    const L = w.layers;
    this.sites = [];
    const add = (at) => {
      const i = m.index(at);
      const pad = { path: m, i, f: m.frac(i), lat: 0, w: 2.6, len: m.ds * 3.5, mask: 0 };
      w.pads.push(pad);
      const meshes = {};
      for (const [mask, color] of [[M.RO, COLORS.red], [M.BO, COLORS.blue]]) {
        const pos = [];
        const colr = [];
        const c = new THREE.Color(color).multiplyScalar(1.2);
        const q = (a, b, c2, d) => {
          pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c2.x, c2.y, c2.z, a.x, a.y, a.z, c2.x, c2.y, c2.z, d.x, d.y, d.z);
          for (let k = 0; k < 6; k++) colr.push(c.r, c.g, c.b);
        };
        for (let k = 0; k < 3; k++) {
          const i0 = m.wrap(i + k * 2);
          const P = (di, la) => m.wpoint(i0 + di, la, 0.24, V(0, 0, 0));
          q(P(0, -pad.w), P(1, 0), P(2, 0), P(1, -pad.w));
          q(P(0, pad.w), P(1, 0), P(2, 0), P(1, pad.w));
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
        const mesh = new THREE.Mesh(g, L.materials(mask).ribbon);
        mesh.renderOrder = 4;
        mesh.frustumCulled = false;
        mesh.visible = false;
        w.group.add(mesh);
        meshes[mask] = mesh;
      }
      this.sites.push({ pad, meshes, x: m.px[i], z: m.pz[i] });
    };
    // two on each pass of the middle faces, three round each end
    for (const a of [-25, 25]) for (const f of ['F0', 'D0']) add(onMid(f, a));
    for (const a of [155, 205]) for (const f of ['F1', 'D1']) add(onMid(f, a));
    for (const a of [45, 95, 145]) add(onB(a));
    for (const a of [-5, 170, 225]) add(onU(a));
  }

  // The stretches of the main road that lie on each roundabout: where a turning face carries you.
  findZones() {
    const m = this.world.main;
    this.zone = new Int8Array(m.N).fill(-1);
    for (let i = 0; i < m.N; i++) {
      const k = Math.round(m.pz[i] / DC);
      if (k < 0 || k > 3) continue;
      if (Math.abs(Math.hypot(m.px[i], m.pz[i] - k * DC) - R) < 1.2) this.zone[i] = k;
    }
  }

  // ---------------------------------------------------------------- the stickers under the road
  // The sticker in a slot (which cubie sits there now, and which of its stickers faces out).
  stickerAt(slot, n) {
    for (const c of this.cubies) {
      if (c.slot.x !== slot.x || c.slot.y !== slot.y || c.slot.z !== slot.z) continue;
      for (const s of c.stickers) if (_v.copy(s.n0).applyQuaternion(c.q).dot(n) > 0.9) return s;
    }
    return null;
  }

  // The lenses the glass over flat (x, z) is there in. Over an edge there's none to be on or off (null); where a
  // turning layer has carried it off round the corner it's there in no lens (0).
  maskAt(x, z) {
    const k = band(z);
    if (k < 0) return null;
    const f = FACES[k];
    let along = z - Math.round(z / DC) * DC;
    let lx = x;
    const mv = this.move;
    if (mv && mv.face === k) {
      // on the turning face itself: the glass that was at this place before the turn began
      const c = Math.cos(-mv.flat);
      const s = Math.sin(-mv.flat);
      [lx, along] = [x * c - along * s, x * s + along * c];
    }
    const cellOf = (a) => (a < -S / 2 ? -1 : a > S / 2 ? 1 : 0);
    _w.copy(f.n).addScaledVector(f.t, cellOf(along));
    _w.x += cellOf(lx);
    _w.round();
    if (mv && mv.face !== k && _w[mv.axis] === mv.side) return 0; // (its glass is off round the corner just now)
    const st = this.stickerAt(_w, f.n);
    if (!st) return null;
    return this.mono && st.mask === M.X ? M.ALL : st.mask;
  }

  // After the cube changes: which boosts are lit.
  refresh() {
    for (const s of this.sites) {
      const m = this.maskAt(s.x, s.z);
      const lens = m === M.R ? M.RO : m === M.B ? M.BO : 0;
      s.pad.mask = lens;
      s.meshes[M.RO].visible = lens === M.RO;
      s.meshes[M.BO].visible = lens === M.BO;
    }
  }

  // ---------------------------------------------------------------- turning
  begin(name) {
    const prime = name.endsWith("'");
    const [axis, side] = LAYER[name[0]];
    const n = AX[axis].clone().multiplyScalar(side);
    // clockwise seen from outside is a turn of -90 degrees about the way out
    const total = (prime ? 1 : -1) * (Math.PI / 2);
    const face = FACES.findIndex((f) => f.n.dot(n) > 0.9);
    this.move = { name, axis, side, n, total, angle: 0, flat: 0, face, t: 0, cubies: this.cubies.filter((c) => c.slot[axis] === side).map((c) => ({ c, q0: c.q.clone() })) };
    // a fast line with a piece in this layer comes apart
    for (const e of this.express) {
      const F = SIDES[e.face];
      const dir = e.axis === 'v' ? F.ev : F.eu;
      if (e.open && (Math.abs(F.n[axis]) > 0.5 || Math.abs(dir[axis]) > 0.5)) this.setExpress(e, false);
    }
    this.refresh();
  }

  // Turn the layer on to where it is `t` seconds into its turn; returns how far the flat road under it turned.
  advance(t) {
    const mv = this.move;
    const a = mv.total * ease(Math.min(1, t / TURN));
    const d = a - mv.angle;
    mv.angle = a;
    mv.t = t;
    // seen in the flat road's own x and z, a turn about the way out runs the other way
    mv.flat = -a;
    _q.setFromAxisAngle(mv.n, a);
    for (const { c, q0 } of mv.cubies) {
      c.q.copy(_q).multiply(q0);
      c.group.quaternion.copy(c.q);
    }
    if (t >= TURN) {
      for (const { c } of mv.cubies) {
        c.slot.applyQuaternion(_q.setFromAxisAngle(mv.n, mv.total)).round();
        // (keep the turns exact: a quarter turn at a time, snapped)
        const e = c.q.toArray().map((x) => Math.round(x * 2) / 2);
        const l = Math.hypot(...e) || 1;
        if (Math.abs(l - 1) < 0.01) c.q.fromArray(e);
        c.q.normalize();
        c.group.quaternion.copy(c.q);
      }
      this.move = null;
      for (const e of this.express) this.setExpress(e, this.expressOpen(e));
      this.refresh();
    }
    return -d;
  }

  // The chevrons that run along the seam of the layer about to turn, pointing the way it will go.
  seamLights(name) {
    const prime = name.endsWith("'");
    const [axis, side] = LAYER[name[0]];
    const n = AX[axis];
    const sign = (prime ? 1 : -1) * side; // the turn's sense about +axis
    const pos = [];
    const [ua, va] = ['x', 'y', 'z'].filter((k) => k !== axis);
    const at = (u, v, out, tip) => {
      const p = V(0, 0, 0);
      p[axis] = side * (S / 2) + tip;
      p[ua] = u;
      p[va] = v;
      return p.addScaledVector(out, 0.6);
    };
    const quad = (a, b, c, d) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    // round the four faces the seam crosses
    for (const [ou, ov] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const out = V(0, 0, 0);
      out[ua] = ou;
      out[va] = ov;
      for (let s = -A + 10; s <= A - 10; s += 20) {
        const u = ou * H + (ou ? 0 : s);
        const v = ov * H + (ov ? 0 : s);
        const p = at(u, v, out, 0);
        // which way this point of the layer moves
        const dir = _v.crossVectors(n, p).multiplyScalar(sign).normalize().clone();
        for (const w of [-1, 1]) {
          const tip = p.clone().addScaledVector(dir, 4);
          const back = p.clone().addScaledVector(dir, -3).addScaledVector(n, w * 5);
          quad(back, tip, tip.clone().addScaledVector(dir, -2.6), back.clone().addScaledVector(dir, -2.6));
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.MeshBasicMaterial({ color: TOY_YELLOW, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.root.add(mesh);
    return mesh;
  }
}

// ------------------------------------------------------------------ the course in a race
// race.js calls def.live(race) once and its update every frame: the song, the carry, and the grooves.
function live(race) {
  const world = race.world;
  const cube = world.cube;
  if (!cube) return null;
  cube.mono = !!race.mono;
  cube.refresh();
  // the cube's own neutral pieces go grey through a lens with the rest of the course's (layers.js), so the lens tint
  // colours them and nothing of the other world's colour is left
  for (const N of cube.neutralGeo) {
    const c = N.colors;
    const out = new Float32Array(c.length);
    for (let i = 0; i < c.length; i += 3) out[i] = out[i + 1] = out[i + 2] = Math.max(c[i], c[i + 1], c[i + 2]) * 0.85 + (0.15 * (c[i] + c[i + 1] + c[i + 2])) / 3;
    (world.layers.neutral ||= []).push({ g: N.g, colour: N.g.getAttribute('color'), grey: new THREE.Float32BufferAttribute(out, 3) });
  }
  cube.neutralGeo = [];
  const m = world.main;
  const fr = {};
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let lights = null;
  let clicks = 0;
  const audio = race.app?.audio;
  const sound = (fn) => {
    if (!audio?.ctx || audio.ctx.state !== 'running') return;
    try {
      fn(audio, audio.now());
    } catch {
      /* a sound is never worth a crash */
    }
  };
  const click = (k) => sound((au, t) => {
    au.tone('square', 1500 + k * 180, t, 0.035, 0.06, au.sfxDry, { filter: 5200 });
    au.noiseHit(t, 0.04, 0.1, au.sfxDry, 'highpass', 3800);
  });
  const whirr = () => sound((au, t) => {
    au.swell(t, TURN, 0.1, au.sfxDry, 'bandpass', 260, 900, 2.2);
    au.tone('sawtooth', 62, t, TURN * 0.95, 0.045, au.sfxDry, { slideTo: 96, filter: 700 });
  });
  const clunk = () => sound((au, t) => {
    au.thump(t, 120, 38, 0.2, 0.3);
    au.noiseHit(t, 0.07, 0.14, au.sfxDry, 'bandpass', 900, 1.2, 300);
  });

  return {
    cube,
    // For the rivals (vehicles/ai.js): how much a lens is worth just here. A single lens over glass of its own colour
    // is the fast way (and lights that colour's boosts); over glass that isn't there in it, it's the groove.
    lensScore(r, mode) {
      if (mode === BOTH || !r.gnd.onRoad || r.gnd.path !== m) return 0;
      let s = 0;
      for (const ahead of [0, 0.35, 0.8]) {
        const i = m.wrap(r.gnd.i + Math.round((ahead * Math.max(20, r.speed)) / m.ds));
        const mask = cube.maskAt(m.px[i], m.pz[i]);
        if (mask == null || mask === M.ALL) continue;
        if (!solidIn(mask, mode)) s += 4;
        else if (ahead) s -= 2.6;
      }
      return s;
    },
    update(dt) {
      const T = race.raceTime;
      const due = dueOf(cube.done); // when the next turn starts
      const name = SONG[cube.done % SONG.length];
      let carried = 0;
      if (race.state === 'race' || race.state === 'finished') {
        if (!cube.move && T >= due - WARN && T < due) {
          // the ratchet: four clicks, and the seam's chevrons running
          if (!lights) {
            lights = cube.seamLights(name);
            clicks = 0;
          }
          const u = (T - (due - WARN)) / WARN;
          const k = Math.floor(u * 4);
          if (k >= clicks) {
            click(clicks);
            clicks = k + 1;
          }
          lights.material.opacity = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(u * Math.PI * 8 - Math.PI / 2));
        }
        if (!cube.move && T >= due) {
          lights ||= cube.seamLights(name);
          cube.begin(name);
          whirr();
        }
        if (cube.move) {
          const mv = cube.move;
          const face = mv.face;
          carried = cube.advance(T - due);
          if (lights) lights.material.opacity = 1 - 0.6 * Math.min(1, (T - due) / TURN);
          if (!cube.move) {
            cube.done++;
            clunk();
            if (lights) {
              cube.root.remove(lights);
              lights.geometry.dispose();
              lights.material.dispose();
              lights = null;
            }
            for (const pl of race.players || []) race.camOf?.(pl)?.addShake(0.25);
          }
          // the turntable: everyone on that face's roundabout, riding the glass, goes round with it
          if (face >= 0 && carried) {
            for (const r of race.racers) {
              if (r.puppet || r.respawnT > 0 || !r.grounded) continue;
              const g = r.gnd;
              if (!g.onRoad || g.path !== m || cube.zone[g.i] !== face) continue;
              const mask = cube.maskAt(r.pos.x, r.pos.z);
              if (mask != null && !solidIn(mask, r.mode)) continue;
              if (!m.frame(r.pos.x, r.pos.z, g.i, fr, r.pos.y)) continue;
              const df = (carried * R) / m.length;
              m.pointF(fr.f, fr.lat, 0, a);
              m.pointF((fr.f + df + 1) % 1, fr.lat, 0, b);
              r.pos.x += b.x - a.x;
              r.pos.z += b.z - a.z;
              // and it turns you, and the way you're going, by the same amount
              const s = Math.sin(-carried);
              const c = Math.cos(-carried);
              r.yaw -= carried;
              const vx = r.vel.x * c + r.vel.z * s;
              r.vel.z = r.vel.z * c - r.vel.x * s;
              r.vel.x = vx;
            }
          }
        }
      }
      // the fast lines: a rival heading for one that has just shut thinks again, and a line's road stays drawn until
      // the last car on it is off
      for (const e of cube.express) {
        if (e.open) continue;
        let busy = false;
        for (const r of race.racers) {
          if (r.ai?._branch === e.path && r.ai.path === m) r.ai._branch = null;
          if (r.gnd.path === e.path && r.gnd.onRoad) busy = true;
        }
        e.road.visible = busy;
      }
      // the grooves: off the glass you're on bare track, and slower
      for (const r of race.racers) {
        if (r.puppet) continue;
        r._qtMul ??= r.speedMul;
        const onMain = r.grounded && r.gnd.onRoad && r.gnd.path === m;
        const mask = onMain ? cube.maskAt(r.pos.x, r.pos.z) : null;
        // (and on a turning face, anywhere but its roundabout, the road has swung out from under you)
        const swung = onMain && cube.move && cube.move.face >= 0 && mask != null && cube.zone[r.gnd.i] !== cube.move.face && Math.round(r.pos.z / DC) === cube.move.face;
        const off = swung || (mask != null && !solidIn(mask, r.mode));
        r.inGroove = off;
        // (glass that's there but not in your lens costs more than glass a turn has taken for a moment)
        r.speedMul = r._qtMul * (!off ? 1 : swung || mask === 0 ? 0.86 : 0.72);
        // (the tell: bare track under you rattles and throws sparks)
        if (off && r.speed > 12 && (r._qtSpark = (r._qtSpark || 0) - dt) <= 0) {
          r._qtSpark = 0.09;
          a.copy(r.pos).setY(r.pos.y + 0.3);
          b.set(-Math.sin(r.yaw), 0.5, -Math.cos(r.yaw));
          race.debris?.sparks(a, b, 2, TOY_YELLOW, 14, r.gnd.y);
          if (r.isPlayer) race.camOf?.(r)?.addShake(0.035);
        }
        if (off) {
          const top = r.phys.topSpeed * r.speedMul;
          if (r.speed > top) r.vel.multiplyScalar(1 - Math.min(0.9, 1.6 * dt));
        }
      }
    },
  };
}

// ------------------------------------------------------------------ what stands still: the core, the stand, the caps
function decor(world, L) {
  // the core the layers turn on: seen between them while one is turning, lit from inside
  const h = H - 26;
  const core = 0x7a3cff;
  L.box(M.ALL, 0, 0, 0, h * 2, h * 2, h * 2, 0, 0x2a1848, true);
  for (const s of [-1, 1]) {
    for (const [ax, u, v] of [['x', 'y', 'z'], ['y', 'x', 'z'], ['z', 'x', 'y']]) {
      // the spindle each face turns on, and a ring of teeth round it
      const c = V(0, 0, 0);
      c[ax] = s * (h + 0.5);
      const eu = V(0, 0, 0);
      eu[u] = 1;
      const ev = V(0, 0, 0);
      ev[v] = 1;
      L.ring(M.ALL, c, eu, ev, 30, 20, core);
      L.ring(M.ALL, c, eu, ev, 62, 28, 0x4a2a8a);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const p0 = c.clone().addScaledVector(eu, Math.cos(a) * 62).addScaledVector(ev, Math.sin(a) * 62);
        const p1 = c.clone().addScaledVector(eu, Math.cos(a) * 74).addScaledVector(ev, Math.sin(a) * 74);
        L.line(M.ALL, p0, p1, k % 2 ? COLORS.red : COLORS.blue);
      }
    }
  }
  // the stand it sits on: a post under the bottom face's middle, and a foot on the shelf
  const y0 = -H - STAND;
  L.cylinder(M.ALL, 0, y0, 0, 22, STAND - 1, 12, 3, TOY_YELLOW);
  for (const r of [60, 110, 118]) L.ring(M.ALL, V(0, y0 + 0.5, 0), AX.x, AX.z, r, 36, r === 110 ? COLORS.red : r === 118 ? COLORS.blue : TOY_YELLOW);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    L.line(M.ALL, V(Math.cos(a) * 22, y0 + 20, Math.sin(a) * 22), V(Math.cos(a) * 110, y0 + 0.5, Math.sin(a) * 110), TOY_YELLOW);
  }
  world.cube = new TwistCube(world);
}

// The bedroom (toybox.js) is built round a flat course. This one isn't flat, so the room is taken out of the flat
// world and stood round the cube instead, the shelf under its stand.
function dress(env, world) {
  const before = new Set(env.group.children);
  const tick = toyboxEnv('shelf')(env, world);
  const room = env.group.children.find((o) => !before.has(o) && o.isGroup);
  if (room) {
    env.group.remove(room);
    room.position.set(0, -H - STAND - world.floorY, 0);
    // (the shelf is long the way the flat road is long: turn it to run along the wall behind the cube)
    room.rotation.y = Math.PI / 2;
    const holder = new THREE.Group();
    // the room is laid out round the middle of the flat road
    room.position.x = 0;
    room.position.z = 0;
    holder.add(room);
    world.group.add(holder);
  }
  return tick;
}

export const TWISTCUBE = {
  id: 'twistcube',
  num: '22',
  name: 'QUARTER TURN',
  blurb: 'A twisting cube with the road printed on it. Every turn carries road and racers round, and deals out new fast lines.',
  decor,
  dressEnv: dress,
  live,
  seed: 2222,
  laps: 3,
  sun: 0,
  skyPiece: 'none',
  space: true,
  fog: [900, 8000],
  noPylons: true,
  halfWidth: HALF_W,
  bankFactor: 3,
  points: LAY.pts,
  curved: {
    lay(world) {
      const o = new THREE.Vector3();
      const t = new THREE.Vector3();
      for (const p of world.paths) {
        p.frames = newFrames(p.N);
        for (let i = 0; i < p.N; i++) {
          band(p.pz[i]);
          o.copy(_bp);
          o.x += p.px[i];
          t.copy(_bt).multiplyScalar(p.thz[i]);
          t.x += p.thx[i];
          putFrame(p.frames, i, o, t.normalize(), _bn);
        }
      }
    },
  },
  branches: EXPRESS.map((e) => e.def),
  noRoads: true, // (the road is printed on the cube's own pieces: see buildCubies)
  noStorms: true, // (a toy on a shelf: no weather over its secret roads)
  shards: [
    { at: onMid('F0', -10), n: 3 }, { at: onMid('D0', -10), n: 3, lat: 0.4 }, { at: onB(60), n: 3, lat: -0.4 },
    { at: onMid('D1', 170), n: 3 }, { at: onMid('F1', 170), n: 3, lat: 0.4 }, { at: onU(200), n: 3, lat: -0.4 },
  ],
  // for tools and tests
  qt: { S, H, R, DC, SONG, dueOf, TURN, LAY, at: (x, z) => (band(z), _bp.clone().setX(x)) },
};
void RED;
void BLUE;
void BOTH;
