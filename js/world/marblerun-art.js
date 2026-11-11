// DROP TOWER's art pass: the course should read as a toy marble run from the driver's seat, not as a road in the dark.
//
//   THE ROAD      is snap-together track: a different toy colour every 24 m, a lip and ribs either side like a
//                 channel a marble rolls in, a collar at every joint and stilts down to the bookcase.
//   BESIDE IT     stand the rest of the set, on stilts of their own, close enough to fill the windscreen: zigzag
//                 ramp towers, funnels, lift wheels, xylophone stairs, stacking rings, blocks with marbles on them.
//   OVER IT       marble tracks cross from one side to the other.
//   THE MARBLES   are everywhere, and they roll: down the ramps, round the funnels, over the crossings, down a
//                 spiral round tower A's core. Each one is red or blue, so a lens keeps only its own.
//
// Everything else is neutral toy plastic: through a lens it takes that lens's colour like the road does, so each
// lens still shows one colour. Nothing here collides. The pieces go into the world's line batches (no new draw
// calls); the marbles are two instanced meshes (one red, one blue), moved on the race clock.

import * as THREE from '../../vendor/three.js';
import { M, COLORS } from './shift.js';
import { patchWave } from './fx.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const X = V(1, 0, 0);
const Z = V(0, 0, 1);
const TAU = Math.PI * 2;

const YEL = 0xffd23a;
const GRN = 0x45f08a;
const ORG = 0xff8a2a;
const PNK = 0xff4fd8;
const CYAN = 0x4ad8ff;
const VIO = 0xb04cff;
const WOOD = 0xd9a05a;
const TOY = [YEL, GRN, ORG, PNK, CYAN, VIO];
const toy = (k) => TOY[(((Math.floor(k)) % TOY.length) + TOY.length) % TOY.length];
// a colour turned down (lines add up where the road runs to the horizon, and too much of it burns white)
const dim = (col, k) => new THREE.Color(col).multiplyScalar(k);

// ------------------------------------------------------------------ the marbles
// Glass marbles, red and blue. A marble either sits still or rolls along a line of points and starts again.
class Marbles {
  constructor(world, L) {
    this.world = world;
    this.L = L;
    this.sets = new Map(); // mask -> [{ r, at } | { r, pts, cum, len, speed, phase }]
    this.k = 0;
  }
  // (leave the mask out and the marbles take turns: red, blue, red...)
  mask(mask) {
    return mask ?? (this.k++ % 2 ? M.B : M.R);
  }
  list(mask) {
    let s = this.sets.get(mask);
    if (!s) this.sets.set(mask, (s = []));
    return s;
  }
  still(at, r = 1.2, mask) {
    this.list(this.mask(mask)).push({ r, at });
  }
  // n marbles spaced along the line, rolling at `speed` m/s
  roll(pts, n = 1, speed = 9, r = 1.1, mask) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const len = cum[cum.length - 1];
    for (let k = 0; k < n; k++) this.list(this.mask(mask)).push({ r, pts, cum, len, speed, phase: (k / n) * len });
  }
  build() {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    // glass: dark underneath, bright on top, a hot glint where the lamp catches it
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const glint = V(-0.45, 0.8, 0.4).normalize();
    const n = V(0, 0, 0);
    for (let i = 0; i < pos.count; i++) {
      n.fromBufferAttribute(pos, i).normalize();
      const k = 0.06 + 0.8 * (n.y * 0.5 + 0.5) ** 2 + 2.2 * Math.max(0, n.dot(glint)) ** 6;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const at = V(0, 0, 0);
    for (const [mask, list] of this.sets) {
      const m = this.L.materials(mask);
      // the world's own solid colour, so it goes with its lens; the shift wave has to know where each marble is
      const mat = new THREE.MeshBasicMaterial({ color: m.base, vertexColors: true, transparent: true });
      patchWave(mat, m.per, false);
      const patched = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, r) => {
        patched(sh, r);
        sh.vertexShader = sh.vertexShader.replace('modelMatrix * vec4(transformed, 1.0)', 'modelMatrix * instanceMatrix * vec4(transformed, 1.0)');
      };
      mat.customProgramCacheKey = () => 'marble|wave0';
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      // (each split-screen view has its own lens: take the fade as that view is drawn)
      mesh.onBeforeRender = () => {
        mat.opacity = m.solid.opacity;
      };
      const A = mesh.instanceMatrix.array;
      A.fill(0);
      const put = (k, p, r) => {
        const o = k * 16;
        A[o] = A[o + 5] = A[o + 10] = r;
        A[o + 12] = p.x;
        A[o + 13] = p.y;
        A[o + 14] = p.z;
        A[o + 15] = 1;
      };
      const movers = [];
      list.forEach((b, k) => {
        if (b.pts) movers.push([k, b]);
        else put(k, b.at, b.r);
      });
      this.world.group.add(mesh);
      if (!movers.length) continue;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const move = (t) => {
        for (const [k, b] of movers) {
          const d = (t * b.speed + b.phase) % b.len;
          let i = 1;
          while (i < b.cum.length - 1 && b.cum[i] < d) i++;
          const u = (d - b.cum[i - 1]) / (b.cum[i] - b.cum[i - 1] || 1);
          put(k, at.copy(b.pts[i - 1]).lerp(b.pts[i], u), b.r);
        }
        mesh.instanceMatrix.needsUpdate = true;
      };
      move(0);
      this.world.animated.push(move);
    }
  }
}

// ------------------------------------------------------------------ the set
// The batch, turned down: this pass puts a lot of lines along a road that already glows, and where they pile up
// toward the horizon full-strength colour burns out to white. Dimmer, they stay the colour they are.
const LINE = 0.5;
const GLOW = 0.42;
const _k = new THREE.Color();
function turnedDown(L) {
  const D = Object.create(L);
  D.line = (mask, a, b, color = null) => L.line(mask, a, b, color === null ? null : _k.set(color).multiplyScalar(LINE));
  D.lineXYZ = (mask, ax, ay, az, bx, by, bz, color = null) => L.lineXYZ(mask, ax, ay, az, bx, by, bz, color === null ? null : _k.set(color).multiplyScalar(LINE));
  D.quad = (mask, a, b, c, d, color = null, k = 1) => L.quad(mask, a, b, c, d, color, k * GLOW);
  return D;
}

export function dressDropTower(world, L0, main, T, lay) {
  const L = turnedDown(L0);
  const floor = world.floorY;
  const hw = main.halfW;
  const B = new Marbles(world, L);
  const A = M.ALL;

  // Is there road here, level with y or under it? (a piece stands on a stilt down to the bookcase)
  const clear = (x, z, y, r) => {
    for (const p of world.paths) {
      for (let i = 0; i < p.N; i += 2) {
        if (p.py[i] > y + 26) continue;
        const dx = p.px[i] - x;
        const dz = p.pz[i] - z;
        if (dx * dx + dz * dz < (p.halfW + r) ** 2) return false;
      }
    }
    return true;
  };
  const stilt = (x, y, z, r, col) => y - floor > 3 && L.cylinder(A, x, floor, z, r, y - floor, 4, Math.max(1, Math.round((y - floor) / 16)), dim(col, 0.32));
  // a round plate on a stilt: what a piece beside the road stands on
  const plate = (c, r, col) => {
    L.ring(A, c, X, Z, r, 20, col);
    L.ring(A, c.clone().setY(c.y - 0.8), X, Z, r - 0.5, 20, col);
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * TAU;
      const a1 = ((k + 1) / 10) * TAU;
      L.quad(A, c, V(c.x + Math.cos(a0) * r, c.y, c.z + Math.sin(a0) * r), V(c.x + Math.cos(a1) * r, c.y, c.z + Math.sin(a1) * r), c, col, 0.1);
    }
    stilt(c.x, c.y - 0.8, c.z, 1.3, col);
  };

  // ---- the road: snap-together track
  {
    const sec = Math.max(4, Math.round(24 / main.ds));
    const lift = T.lift;
    const fr = (i, lat, h) => main.point(i, lat, h, V(0, 0, 0));
    for (let i = 0; i < main.N; i++) {
      if (main.hide?.[i] || main.hide?.[main.wrap(i + 1)]) continue; // the tray is its own piece
      const k = Math.floor(i / sec);
      const col = toy(k);
      const soft = dim(col, 0.4);
      const onLift = i >= lift.i0 - 6 && i <= lift.i1 + 8; // (the lift has girders of its own)
      const joint = i % sec === 0;
      for (const s of [-1, 1]) {
        if (!onLift) {
          if (i % 2 === 0) L.line(A, fr(i, s * (hw + 1.9), 2.6), fr(i + 2, s * (hw + 1.9), 2.6), soft);
        }
        if (joint) {
          // the collar where two pieces of track clip together, and a stilt under every other one
          const a = fr(i, s * (hw + 2.3), 2.9);
          const b = fr(i, s * (hw + 2.3), -1.2);
          L.line(A, a, b, col);
          L.line(A, fr(i + 1, s * (hw + 2.3), 2.9), fr(i + 1, s * (hw + 2.3), -1.2), col);
          L.quad(A, a, fr(i + 1, s * (hw + 2.3), 2.9), fr(i + 1, s * (hw + 2.3), -1.2), b, col, 0.16);
          if (k % 2 === 0 && !onLift && clear(b.x, b.z, b.y - 8, -hw + 3)) {
            L.lineXYZ(A, b.x, b.y, b.z, b.x, floor, b.z, soft);
            for (let y = b.y - 10; y > floor + 4; y -= 14) L.ring(A, V(b.x, y, b.z), X, Z, 0.9, 6, soft);
          }
        }
      }
      if (joint) {
        // the seam across the road, and the next piece's colour washing in from it
        L.line(A, fr(i, -hw, 0.06), fr(i, hw, 0.06), soft);
        L.line(A, fr(i, -hw - 2.3, -1.2), fr(i, hw + 2.3, -1.2), soft);
        L.quadFade(A, fr(i, -hw, 0.05), fr(i, hw, 0.05), fr(i + 3, hw, 0.05), fr(i + 3, -hw, 0.05), col, 0.1, 0);
      }
    }
  }

  // ---- beside the road: the rest of the set. Each piece is built in a frame of its own: x away from the road,
  // y up, z the way the road runs.
  const PIECES = {
    // two posts with ramps zigzagging down between them, and marbles rolling down
    zigzag(P, k) {
      const W = 9;
      const top = 19;
      for (const x of [0, W]) for (const z of [-1.5, 1.5]) L.line(A, P(x, 0, z), P(x, top + 1.5, z), toy(k));
      for (const x of [0, W]) for (const y of [top + 1.5, top / 2]) L.line(A, P(x, y, -1.5), P(x, y, 1.5), toy(k));
      const path = [];
      const n = 4;
      for (let q = 0; q < n; q++) {
        const y = top - q * 4.6;
        const [xa, xb] = q % 2 ? [W - 0.4, 0.8] : [0.4, W - 0.8];
        const col = toy(k + q + 1);
        const a0 = P(xa, y, -1.4);
        const a1 = P(xa, y, 1.4);
        const b0 = P(xb, y - 1.7, -1.4);
        const b1 = P(xb, y - 1.7, 1.4);
        L.quad(A, a0, a1, b1, b0, col, 0.3);
        for (const [a, b, h] of [[a0, b0, 0], [a1, b1, 0], [a0, b0, 0.9], [a1, b1, 0.9]]) L.line(A, a.clone().setY(a.y + h), b.clone().setY(b.y + h), col);
        L.line(A, a0, a1, col);
        path.push(P(xa, y + 1.1, 0), P(xb, y - 0.6, 0));
      }
      path.push(P(0.8, 1.1, 0));
      B.roll(path, 3, 8);
    },
    // a funnel on three legs, a marble spiralling down it
    funnel(P, k) {
      const cx = 6;
      const rim = [[15, 6.2], [12.2, 4.6], [9.6, 3], [7.4, 1.5]];
      rim.forEach(([y, r], q) => L.ring(A, P(cx, y, 0), X, Z, r, 20, toy(k + q)));
      for (let q = 0; q < 10; q++) {
        const a = (q / 10) * TAU;
        const c = Math.cos(a);
        const s = Math.sin(a);
        for (let j = 0; j < rim.length - 1; j++) {
          const a0 = P(cx + c * rim[j][1], rim[j][0], s * rim[j][1]);
          const a1 = P(cx + c * rim[j + 1][1], rim[j + 1][0], s * rim[j + 1][1]);
          L.line(A, a0, a1, toy(k + j));
          if (q % 2 === 0) {
            const a2 = (((q + 1) / 10) * TAU);
            L.quad(A, a0, a1, P(cx + Math.cos(a2) * rim[j + 1][1], rim[j + 1][0], Math.sin(a2) * rim[j + 1][1]), P(cx + Math.cos(a2) * rim[j][1], rim[j][0], Math.sin(a2) * rim[j][1]), toy(k + j), 0.22);
          }
        }
        if (q % 3 === 0) L.line(A, P(cx + c * 6.2, 15, s * 6.2), P(cx + c * 4, 0, s * 4), toy(k + 3));
      }
      L.line(A, P(cx, 7.4, 0), P(cx, 3, 0), toy(k));
      const path = [];
      for (let q = 0; q <= 40; q++) {
        const u = q / 40;
        const a = u * 3.2 * TAU;
        const r = 5.4 - 4.4 * u;
        path.push(P(cx + Math.cos(a) * r, 15.4 - 7.6 * u * (0.5 + 0.5 * u), Math.sin(a) * r));
      }
      path.push(P(cx, 1.2, 0));
      B.roll(path, 2, 11);
    },
    // the wheel that lifts marbles back to the top: two rims, spokes, buckets, an A-frame
    wheel(P, k) {
      const cx = 6.5;
      const cy = 10;
      const R = 7.4;
      const col = toy(k);
      const col2 = toy(k + 2);
      for (const z of [-1.3, 1.3]) {
        let prev = null;
        for (let q = 0; q <= 24; q++) {
          const a = (q / 24) * TAU;
          const p = P(cx + Math.cos(a) * R, cy + Math.sin(a) * R, z);
          if (prev) L.line(A, prev, p, col);
          prev = p;
          if (q % 3 === 0 && q < 24) L.line(A, P(cx, cy, z), p, col2);
        }
        L.line(A, P(cx - 5, 0, z * 1.6), P(cx, cy, z * 1.6), ORG);
        L.line(A, P(cx + 5, 0, z * 1.6), P(cx, cy, z * 1.6), ORG);
      }
      L.line(A, P(cx, cy, -2.1), P(cx, cy, 2.1), 0xffffff);
      const path = [];
      for (let q = 0; q <= 24; q++) {
        const a = (q / 24) * TAU;
        const c = Math.cos(a);
        const s = Math.sin(a);
        path.push(P(cx + c * (R - 1.2), cy + s * (R - 1.2), 0));
        if (q % 3 === 0 && q < 24) {
          // a bucket
          const a0 = P(cx + c * (R - 2.4), cy + s * (R - 2.4), -1.3);
          const a1 = P(cx + c * (R - 2.4), cy + s * (R - 2.4), 1.3);
          L.quad(A, a0, a1, P(cx + c * R, cy + s * R, 1.3), P(cx + c * R, cy + s * R, -1.3), toy(k + q / 3), 0.34);
          L.line(A, a0, a1, toy(k + q / 3));
        }
      }
      B.roll(path, 4, 5);
    },
    // xylophone stairs: bars stepping down along the road, a marble hopping from one to the next
    xylo(P, k) {
      const n = 8;
      const path = [];
      const dir = k % 2 ? 1 : -1;
      for (let q = 0; q < n; q++) {
        const z = dir * (-8 + q * 2.3);
        const y = 10.5 - q * 1.05;
        const len = 9 - q * 0.55;
        const col = toy(q);
        const a = P(1, y, z - 0.85);
        const b = P(1 + len, y, z - 0.85);
        const c = P(1 + len, y, z + 0.85);
        const d = P(1, y, z + 0.85);
        L.quad(A, a, b, c, d, col, 0.42);
        for (const [p, q2] of [[a, b], [b, c], [c, d], [d, a]]) L.line(A, p, q2, col);
        path.push(P(4, y + 1.1, z));
        if (q < n - 1) path.push(P(4, y + 2.6, z + dir * 1.15));
      }
      for (const x of [2, 7]) {
        L.line(A, P(x, 9.6, dir * -8.6), P(x, 2.2, dir * 8.6), WOOD);
        for (const z of [-8, 8]) L.line(A, P(x, 0, z), P(x, z * dir < 0 ? 9.6 : 2.2, z), WOOD);
      }
      B.roll(path, 2, 7, 1);
    },
    // stacking rings on a peg
    rings(P, k) {
      const cx = 6;
      L.line(A, P(cx, 0, 0), P(cx, 16.5, 0), 0xffffff);
      for (let q = 0; q < 5; q++) {
        const r = 6.4 - q * 1.05;
        const y = 1.3 + q * 2.7;
        const col = toy(k + q);
        const c0 = P(cx, y - 1, 0);
        const c1 = P(cx, y + 1, 0);
        L.ring(A, c0, X, Z, r, 18, col);
        L.ring(A, c1, X, Z, r, 18, col);
        L.ring(A, P(cx, y, 0), X, Z, r + 0.5, 18, col);
        for (let j = 0; j < 18; j += 2) {
          const a0 = (j / 18) * TAU;
          const a1 = ((j + 1) / 18) * TAU;
          const p = (c, a) => V(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
          L.quad(A, p(c0, a0), p(c0, a1), p(c1, a1), p(c1, a0), col, 0.3);
        }
      }
      B.still(P(cx, 17.6, 0), 1.7);
    },
    // an alphabet block or two, with marbles left on top
    blocks(P, k) {
      const o = P(5.5, 0, 0);
      const yaw = (k * 1.7) % 1.2;
      L.box(A, o.x, o.y + 3, o.z, 6, 6, 6, yaw, toy(k), true);
      L.box(A, o.x, o.y + 3, o.z, 4, 4, 6.1, yaw, toy(k + 2), false);
      L.box(A, o.x, o.y + 3, o.z, 6.1, 4, 4, yaw, toy(k + 2), false);
      const p2 = P(6.5, 8.2, 0.6);
      L.box(A, p2.x, p2.y, p2.z, 4.4, 4.4, 4.4, yaw + 0.5, toy(k + 3), true);
      L.box(A, p2.x, p2.y, p2.z, 2.8, 2.8, 4.5, yaw + 0.5, toy(k + 5), false);
      B.still(P(4, 7.3, -1.5), 1.3);
      B.still(P(3.6, 7.2, 1.6), 1.2);
      B.still(P(6.5, 11.9, 0.6), 1.5);
      B.still(P(1, 1.3, 3.5), 1.3);
      B.still(P(1.6, 1.1, -4), 1.1);
    },
  };
  const ORDER = ['zigzag', 'blocks', 'funnel', 'xylo', 'wheel', 'rings'];

  const step = Math.max(6, Math.round(30 / main.ds));
  const gap = 6; // from the rail to the near edge of a piece
  let slot = 0;
  for (let i = Math.round(step / 2); i < main.N; i += step, slot++) {
    const free = [];
    for (const s of [-1, 1]) {
      const rx = main.rightX(i) * s;
      const rz = main.rightZ(i) * s;
      const y = main.py[i] - 1;
      const cx = main.px[i] + rx * (hw + gap + 5.5);
      const cz = main.pz[i] + rz * (hw + gap + 5.5);
      if (!clear(cx, cz, y, 8.5)) continue;
      free.push(s);
      const ox = main.px[i] + rx * (hw + gap);
      const oz = main.pz[i] + rz * (hw + gap);
      const fx = main.thx[i];
      const fz = main.thz[i];
      const P = (x, h, z) => V(ox + rx * x + fx * z, y + h, oz + rz * x + fz * z);
      const k = slot * 2 + (s > 0 ? 1 : 0);
      plate(V(cx, y, cz), 8.2, toy(k + 1));
      // (no big dark blocks by the tray: tipped toward you, the board already fills that side of the view)
      const kind = ORDER[(slot + (s > 0 ? 3 : 0)) % ORDER.length];
      PIECES[kind === 'blocks' && main.hide?.[i] ? 'rings' : kind](P, k);
    }
    // a marble track over the road, from a post on one side to a post on the other
    if (slot % 3 === 1 && free.length === 2) {
      const j = i + Math.round(step / 2);
      const s = slot % 2 ? 1 : -1;
      const ends = [-s, s].map((q) => main.point(j, q * (hw + gap + 1), 0, V(0, 0, 0)));
      if (ends.every((e) => clear(e.x, e.z, main.py[j], 1))) {
        const f = V(main.thx[j], 0, main.thz[j]);
        const col = toy(slot);
        const path = [];
        let prev = null;
        for (let q = 0; q <= 22; q++) {
          const u = q / 22;
          const c = ends[0].clone().lerp(ends[1], u);
          c.y = main.py[j] + 19 + 6 * (1 - (2 * u - 1) ** 2) - 6 * u;
          const a = c.clone().addScaledVector(f, -1.2);
          const b = c.clone().addScaledVector(f, 1.2);
          if (prev) {
            L.line(A, prev[0], a, col);
            L.line(A, prev[1], b, col);
            if (q % 2) L.quad(A, prev[0], a, b, prev[1], col, 0.2);
          }
          L.line(A, a, b, toy(slot + 2));
          prev = [a, b];
          path.push(c.clone().setY(c.y + 1.1));
        }
        for (const e of ends) for (const dz of [-1.2, 1.2]) L.line(A, e.clone().addScaledVector(f, dz).setY(main.py[j] - 1), e.clone().addScaledVector(f, dz).setY(main.py[j] + (e === ends[0] ? 19 : 13)), col);
        for (const e of ends) stilt(e.x, main.py[j] - 1, e.z, 1.1, col);
        B.roll(path, 3, 10);
      }
    }
  }

  // ---- tower A's core: bands round the column, and a marble track spiralling down it inside the corkscrew
  {
    const ox = lay.OX;
    const top = lay.TOP - 34;
    for (let y = top; y > floor + 6; y -= 11) {
      const col = toy(Math.round(y / 11));
      L.ring(A, V(ox, y, 0), X, Z, 8.2, 16, col);
      L.ring(A, V(ox, y - 2.4, 0), X, Z, 8.2, 16, col);
      for (let q = 0; q < 16; q += 2) {
        const p = (a, yy) => V(ox + Math.cos((a / 16) * TAU) * 8.2, yy, Math.sin((a / 16) * TAU) * 8.2);
        L.quad(A, p(q, y), p(q + 1, y), p(q + 1, y - 2.4), p(q, y - 2.4), col, 0.35);
      }
    }
    const turns = Math.max(2, Math.floor((top - floor - 8) / 13));
    const seg = 28;
    const path = [];
    let prev = null;
    for (let q = 0; q <= turns * seg; q++) {
      const a = (q / seg) * TAU;
      const y = top - (q / seg) * 13;
      const at = (r, h = 0) => V(ox + Math.cos(a) * r, y + h, Math.sin(a) * r);
      const cur = [at(17), at(21.5)];
      const col = toy(Math.floor(q / 7));
      if (prev) {
        L.line(A, prev[0], cur[0], col);
        L.line(A, prev[1], cur[1], col);
        if (q % 2) L.quad(A, prev[0], cur[0], cur[1], prev[1], col, 0.24);
      }
      if (q % 7 === 0) {
        L.line(A, cur[0], cur[1], 0xffffff);
        L.line(A, at(8.2, -1), cur[0], col); // a strut out from the column
      }
      prev = cur;
      path.push(at(19.2, 1.2));
    }
    B.roll(path, Math.round(turns * 2.5), 14, 1.5);
    // glass marbles parked round the bowl's rim (not where the top deck comes in)
    for (let q = 2; q < 22; q++) {
      const a = (q / 24) * TAU;
      B.still(V(ox + Math.cos(a) * 113, lay.TOP + 7.8, Math.sin(a) * 113), 2.3);
    }
  }

  // ---- the lens tubes: bright seams along the plastic, in the tube's own colour, so its hoops read as one tube
  for (const b of world.paths) {
    const d = b.def;
    if (!d?.hatch) continue;
    const hot = d.mask === M.BO ? 0x8fd0ff : COLORS.redHot;
    const r = b.halfW + 1.25;
    for (let j = 8; j < b.N - 10; j++) {
      for (const [deg, every] of [[90, 1], [38, 2], [142, 2]]) {
        if (j % every) continue;
        // (dashes: three samples on, one off, staggered between the seams)
        if ((j + Math.round(deg)) % 4 === 3) continue;
        const a = (deg * Math.PI) / 180;
        const p = (i) => b.point(i, Math.cos(a) * r, -0.5, V(0, 0, 0)).addScaledVector(UP, Math.sin(a) * r);
        L.line(d.mask, p(j), p(j + every), hot);
      }
    }
  }

  B.build();
}
