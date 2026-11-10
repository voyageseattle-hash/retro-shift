// 22 QUARTER TURN: the secret course. A giant 3 by 3 twisting cube on the bedroom shelf (the TOYBOX CUP's room,
// toybox.js). The road is the cube's own track: a roundabout on each of four faces (top, front, underneath, back),
// joined over the cube's edges, out along one side of the chain and home along the other. Laid over the road are the
// cube's stickers, big panes of coloured glass, and the stickers are the lens rule:
//
//   white, yellow, green   there in every lens
//   red                    the red world: gone through the BLUE lens
//   blue                   the blue world: gone through the RED lens
//   violet                 the overlap: there in BOTH only
//
// On a sticker that's there for you, you ride the glass. On one that isn't, you're down in the bare groove under it
// and slow (nobody falls off this toy). A red or blue sticker lights a boost for its own lens.
//
// Every few seconds, on the race clock and in the same order every race, a ratchet clicks four times, chevrons run
// along a seam, and that layer of the cube turns a quarter turn. Its stickers go with it, so the colours on your road
// change; and if it's the face you're on, the roundabout is a turntable and carries you round with it (as long as
// you're on the glass).
//
// The physics drives a flat road like every other course. The cube you see is that road wrapped round four faces
// (curved.js): the chain of faces rolls out flat with nothing stretched, so a bend on the flat road is the same bend
// on the cube, and a turning face is a plain turn about its middle in both.

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
    this.refresh();
  }

  // ---------------------------------------------------------------- what's drawn
  // A cubie is its plates: black plastic under the road, and a pane of coloured glass over it on each outside face.
  buildCubies() {
    const L = this.world.layers;
    const cell = (c) => (c < 0 ? [-H, -S / 2] : c > 0 ? [S / 2, H] : [-S / 2, S / 2]);
    for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 1; cy++) for (let cz = -1; cz <= 1; cz++) {
      if (!cx && !cy && !cz) continue;
      const B = new Map(); // mask -> { rp, rc, lp, lc, fp }
      const b = (mask) => {
        let o = B.get(mask);
        if (!o) B.set(mask, (o = { rp: [], rc: [], lp: [], lc: [], fp: [] }));
        return o;
      };
      const col = new THREE.Color();
      const quad = (mask, a, b2, c, d, color, k) => {
        const o = b(mask);
        o.rp.push(a.x, a.y, a.z, b2.x, b2.y, b2.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
        col.set(color).multiplyScalar(k);
        for (let i = 0; i < 6; i++) o.rc.push(col.r, col.g, col.b);
      };
      const line = (mask, a, b2, color, k = 1) => {
        const o = b(mask);
        o.lp.push(a.x, a.y, a.z, b2.x, b2.y, b2.z);
        col.set(color).multiplyScalar(k);
        o.lc.push(col.r, col.g, col.b, col.r, col.g, col.b);
      };
      const fill = (a, b2, c, d) => b(M.ALL).fp.push(a.x, a.y, a.z, b2.x, b2.y, b2.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      const cubie = { slot: V(cx, cy, cz), q: new THREE.Quaternion(), group: new THREE.Group(), stickers: [] };
      const cc = { x: cx, y: cy, z: cz };
      for (const st of STICKERS) {
        const ax = st.n.x ? 'x' : st.n.y ? 'y' : 'z';
        if (cc[ax] !== st.n[ax]) continue;
        cubie.stickers.push({ n0: st.n.clone(), mask: st.mask, color: st.color });
        // the two directions across this face
        const [ua, va] = ['x', 'y', 'z'].filter((k) => k !== ax);
        const [u0, u1] = cell(cc[ua]);
        const [v0, v1] = cell(cc[va]);
        // (the edges the road goes over are rounded: the plate stops short of them, and a curved strip joins it on)
        const round = (k) => k !== 'x' && ax !== 'x';
        const lim = (k, a) => (round(k) ? Math.max(-A, Math.min(A, a)) : a);
        const P = (u, v, h) => {
          const p = V(0, 0, 0);
          p[ax] = st.n[ax] * (H + h);
          p[ua] = u;
          p[va] = v;
          return p;
        };
        const pu0 = lim(ua, u0), pu1 = lim(ua, u1), pv0 = lim(va, v0), pv1 = lim(va, v1);
        fill(P(pu0, pv0, -0.35), P(pu1, pv0, -0.35), P(pu1, pv1, -0.35), P(pu0, pv1, -0.35));
        // the seams between cubies: a dim line round the cell
        const seam = 0x3a2a55;
        line(M.ALL, P(pu0, pv0, 0.02), P(pu1, pv0, 0.02), seam);
        line(M.ALL, P(pu1, pv0, 0.02), P(pu1, pv1, 0.02), seam);
        line(M.ALL, P(pu1, pv1, 0.02), P(pu0, pv1, 0.02), seam);
        line(M.ALL, P(pu0, pv1, 0.02), P(pu0, pv0, 0.02), seam);
        // the sticker: glass with a bright rim, a little in from the cell's edge
        const IN = 5;
        const su0 = Math.max(pu0, u0) + IN, su1 = Math.min(pu1, u1) - IN, sv0 = Math.max(pv0, v0) + IN, sv1 = Math.min(pv1, v1) - IN;
        const h = 0.16;
        const m = st.mask;
        // (pale glass glows harder than deep glass at the same strength: keep the white, yellow and green panes down)
        const pale = st.mask === M.ALL;
        const RIM = pale ? 0.5 : 0.8;
        quad(m, P(su0, sv0, h), P(su1, sv0, h), P(su1, sv1, h), P(su0, sv1, h), st.color, pale ? 0.05 : 0.16);
        const W = 1.6;
        quad(m, P(su0, sv0, h), P(su1, sv0, h), P(su1, sv0 + W, h), P(su0, sv0 + W, h), st.color, RIM);
        quad(m, P(su0, sv1 - W, h), P(su1, sv1 - W, h), P(su1, sv1, h), P(su0, sv1, h), st.color, RIM);
        quad(m, P(su0, sv0, h), P(su0 + W, sv0, h), P(su0 + W, sv1, h), P(su0, sv1, h), st.color, RIM);
        quad(m, P(su1 - W, sv0, h), P(su1, sv0, h), P(su1, sv1, h), P(su1 - W, sv1, h), st.color, RIM);
        // a second rim inside it, and the corners cut, like a peeling toy sticker
        const J = 7;
        line(m, P(su0 + J, sv0 + J, h), P(su1 - J, sv0 + J, h), st.color, 0.6);
        line(m, P(su1 - J, sv0 + J, h), P(su1 - J, sv1 - J, h), st.color, 0.6);
        line(m, P(su1 - J, sv1 - J, h), P(su0 + J, sv1 - J, h), st.color, 0.6);
        line(m, P(su0 + J, sv1 - J, h), P(su0 + J, sv0 + J, h), st.color, 0.6);
      }
      // the rounded edge between two of its plates (only the four edges that run along x)
      if (cy && cz) {
        const [x0, x1] = cell(cx);
        let prev = null;
        for (let s = 0; s <= 4; s++) {
          const a = (s / 4) * (Math.PI / 2);
          const y = cy * (A + Math.cos(a) * (RHO - 0.35));
          const z = cz * (A + Math.sin(a) * (RHO - 0.35));
          const p = [V(x0, y, z), V(x1, y, z)];
          if (prev) fill(prev[0], prev[1], p[1], p[0]);
          prev = p;
        }
      }
      for (const [mask, o] of B) {
        const m = L.materials(mask);
        if (o.fp.length) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(o.fp, 3));
          const mesh = new THREE.Mesh(g, m.fill);
          mesh.renderOrder = 1;
          mesh.frustumCulled = false;
          cubie.group.add(mesh);
        }
        if (o.rp.length) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(o.rp, 3));
          g.setAttribute('color', new THREE.Float32BufferAttribute(o.rc, 3));
          const mesh = new THREE.Mesh(g, m.ribbon);
          mesh.renderOrder = 3;
          mesh.frustumCulled = false;
          cubie.group.add(mesh);
        }
        if (o.lp.length) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(o.lp, 3));
          g.setAttribute('color', new THREE.Float32BufferAttribute(o.lc, 3));
          const mesh = new THREE.LineSegments(g, m.line);
          mesh.renderOrder = 2;
          mesh.frustumCulled = false;
          cubie.group.add(mesh);
        }
      }
      this.root.add(cubie.group);
      this.cubies.push(cubie);
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

  // The lenses the glass over flat (x, z) is there in. Over an edge, and under a layer that's turning, there's none:
  // that's bare track, the same for everyone (null).
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
    if (mv && mv.face !== k && _w[mv.axis] === mv.side) return null;
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
      // the grooves: off the glass you're on bare track, and slower
      for (const r of race.racers) {
        if (r.puppet) continue;
        r._qtMul ??= r.speedMul;
        const mask = r.grounded && r.gnd.onRoad && r.gnd.path === m ? cube.maskAt(r.pos.x, r.pos.z) : null;
        const off = mask != null && !solidIn(mask, r.mode);
        r.inGroove = off;
        r.speedMul = r._qtMul * (off ? 0.72 : 1);
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
  // The centre caps. The top one is the maker's badge, a part of the red world: through the BLUE lens it's gone, and
  // the road under it shows. The back one is its twin in blue, over the red road.
  const cap = (f, mask, color) => {
    const c = f.n.clone().multiplyScalar(H + 7);
    const eu = AX.x;
    const ev = f.t;
    for (const r of [40, 34, 12]) L.ring(mask, c, eu, ev, r, 28, color);
    // a Q and a T, for QUARTER TURN, and a quarter-turn arrow round them
    const P = (x, y) => c.clone().addScaledVector(eu, x).addScaledVector(ev, y);
    let prev = null;
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI * 0.75 + (k / 12) * Math.PI * 1.5;
      const p = P(Math.cos(a) * 26, Math.sin(a) * 26);
      if (prev) L.line(mask, prev, p, color);
      prev = p;
    }
    L.line(mask, prev, prev.clone().addScaledVector(eu, 7), color);
    L.line(mask, prev, prev.clone().addScaledVector(ev, -7), color);
    L.line(mask, P(-8, 0), P(8, 0), color);
    L.line(mask, P(0, 8), P(0, -8), color);
    // the cap's skirt, down to the face
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const p = P(Math.cos(a) * 40, Math.sin(a) * 40);
      L.line(mask, p, p.clone().addScaledVector(f.n, -7), color);
      const q = P(Math.cos(a + 0.45) * 40, Math.sin(a + 0.45) * 40);
      L.quad(mask, p, q, c, c, color, 0.09);
    }
  };
  cap(FACES[0], M.R, COLORS.red);
  cap(FACES[3], M.B, COLORS.blue);

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
  blurb: 'A twisting cube. Every layer that turns moves the colours under you, and a turning face takes you with it.',
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
  branches: [
    // the secret roads, straight across a roundabout under its centre cap: blue on top, red round the back
    { from: onU(134), to: onU(263), mask: M.BO, side: 1, lead: 30, label: 'UNDER THE CAP' },
    { from: onB(20), to: onB(170), mask: M.RO, side: 1, lead: 30, label: 'CORE LINE' },
  ],
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
