// The Möbius strip (course 11). The strip has one side, so its "top" and its "underside" are one road twice as long:
// lap one runs along the top, a half twist turns the road over, lap two runs along the underside, hanging under lap
// one's road, and a second half twist brings you back up to the line.
//
// The engine never learns any of that. To the physics the course is an ordinary loop of two lobes side by side: lap
// one's lobe, and lap two's lobe, which is lap one's turned half a turn about the twist straight (so it's lap one in a
// mirror). Both laps run up the same straight, one 2H above the other. Only how it's drawn is bent: everything is
// drawn through map(), which leaves lap one's lobe where it is, turns lap two's lobe half a turn about the straight
// (which lays it against the underside of lap one's road, upside down), and along the straight turns the road
// smoothly from one to the other. That turn is the twist you drive.
//
//   def.mobius: { z0, z1, H }   the straight lies along x = 0; it twists between z0 and z1; the two passes ride at
//                               y = +H (the end of lap one) and y = -H (the end of lap two)
//
// What's drawn through it: every vertex the course batches (layers.js build), every object in the scene that stands
// somewhere (a racer, a wall, a shard, a sign board: moved and turned as a whole), every loose line buffer (trails,
// sparks), and the camera. What's below a road is the other lap's world, so nothing on this course reaches down to
// a floor.

import * as THREE from '../../vendor/three.js';

const IDENT = 0; // drawn where it is
const FLIP = 1; // drawn half a turn about the straight
const TWIST_P = 2; // on the straight, the upper pass (the end of lap one): turning over
const TWIST_Q = 3; // on the straight, the lower pass (the end of lap two): turning back up

const CELL = 40;
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const dsm = (t) => (t <= 0 || t >= 1 ? 0 : 6 * t * (1 - t));

export class Mobius {
  constructor(world, cfg) {
    this.z0 = cfg.z0;
    this.z1 = cfg.z1;
    this.H = cfg.H;
    const m = (this.main = world.main);
    const N = m.N;
    const half = N >> 1;
    // what each sample of the loop is: a lap's lobe is drawn one way, and past its twist the other
    this.kind = new Uint8Array(N);
    for (const lap of [0, 1]) {
      const base = lap ? FLIP : IDENT;
      let past = false;
      for (let k = 0; k < half + (lap ? N - 2 * half : 0); k++) {
        const i = lap * half + k;
        const onA = Math.abs(m.px[i]) < 1.5 && m.pz[i] > this.z0 && m.pz[i] < this.z1;
        if (onA) {
          this.kind[i] = lap ? TWIST_Q : TWIST_P;
          past = true;
        } else this.kind[i] = past ? (base === IDENT ? FLIP : IDENT) : base;
      }
    }
    // a grid over the road's samples, to find the stretch of road a point belongs to
    this.grid = new Map();
    for (let i = 0; i < N; i++) {
      const key = this.cell(m.px[i], m.pz[i]);
      let c = this.grid.get(key);
      if (!c) this.grid.set(key, (c = []));
      c.push(i);
    }
    this.rho = 0; // the turn about the straight at the last point mapped
    this.pitch = 0; // and the road's dive there (the twist drops 2H as it turns)
    this.saved = [];
    this.buffers = [];
    this.skip = new Set();
  }

  cell(x, z) {
    return Math.floor(x / CELL) * 4096 + Math.floor(z / CELL);
  }

  // The road sample a point belongs to: the nearest, but a road well above the point is not its road (on the straight
  // the two passes lie one over the other, and what stands on the lower one is under the upper one).
  near(x, y, z) {
    const m = this.main;
    let best = -1;
    let bd = Infinity;
    const score = (i) => {
      const dx = m.px[i] - x;
      const dz = m.pz[i] - z;
      const dy = y - m.py[i];
      const pen = dy < -3 ? dy * dy * 36 : dy * dy * 0.36;
      const d = dx * dx + dz * dz + pen;
      if (d < bd) {
        bd = d;
        best = i;
      }
    };
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const c = this.grid.get((cx + a) * 4096 + cz + b);
        if (c) for (let k = 0; k < c.length; k++) score(c[k]);
      }
    }
    if (best < 0) for (let i = 0; i < m.N; i += 3) score(i);
    return best;
  }

  // Where a point of the flat course is drawn. Sets this.rho and this.pitch for whoever wants the frame too.
  mapXYZ(x, y, z, out) {
    const k = this.kind[this.near(x, y, z)];
    this.pitch = 0;
    if (k === IDENT) {
      this.rho = 0;
      return out.set(x, y, z);
    }
    if (k === FLIP) {
      this.rho = Math.PI;
      return out.set(-x, -y, z);
    }
    const u = (z - this.z0) / (this.z1 - this.z0);
    const t = sm(u);
    const lvl = k === TWIST_P ? this.H : -this.H;
    const rho = (k === TWIST_P ? 0 : Math.PI) + Math.PI * t;
    const c = Math.cos(rho);
    const s = Math.sin(rho);
    const dy = y - lvl;
    this.rho = rho;
    this.pitch = Math.atan((-2 * this.H * dsm(u)) / (this.z1 - this.z0));
    return out.set(x * c - dy * s, this.H * (1 - 2 * t) + x * s + dy * c, z);
  }
  map(v, out = v) {
    return this.mapXYZ(v.x, v.y, v.z, out);
  }
  // The turn that goes with the last point mapped: about the straight, then down the dive.
  turn(q = _q) {
    q.setFromAxisAngle(Z, this.rho);
    if (this.pitch) q.premultiply(_v2q(-this.pitch));
    return q;
  }

  // Every vertex of a flat xyz array, in place (layers.js build).
  mapArray(a, n = a.length) {
    for (let i = 0; i + 2 < n; i += 3) {
      this.mapXYZ(a[i], a[i + 1], a[i + 2], _v);
      a[i] = _v.x;
      a[i + 1] = _v.y;
      a[i + 2] = _v.z;
    }
  }

  // The camera: where it stands and what it looks at are mapped, and its up turns with the road under it.
  camera(cam, look, up) {
    this.map(look, _look);
    const q = this.turn(_q2);
    this.map(cam.position);
    cam.up.copy(up).applyQuaternion(q);
    cam.lookAt(_look);
  }

  // ------------------------------------------------------------------ the scene, each frame
  // Before a frame is drawn: everything in the scene is put where it's drawn. undo() puts it all back, so the race
  // goes on running in the flat course.
  apply(scene) {
    this.undo();
    this.walk(scene);
  }
  walk(o) {
    if (this.skip.has(o) || o.isCamera) return;
    const p = o.position;
    const q = o.quaternion;
    const still = p.x === 0 && p.y === 0 && p.z === 0 && q.x === 0 && q.y === 0 && q.z === 0;
    if (!still) {
      // something that stands somewhere: moved and turned whole
      if (!o.visible) return;
      this.saved.push(o, p.x, p.y, p.z, q.x, q.y, q.z, q.w);
      this.map(p);
      q.premultiply(this.turn());
      return;
    }
    const P = o.geometry?.getAttribute?.('position');
    if (P && o.visible && !P.isInterleavedBufferAttribute && !this.buffers.includes(P)) {
      // loose lines and ribbons drawn where they lie (trails, sparks): vertex by vertex
      const r = o.geometry.drawRange;
      const n = Math.min(P.count, o.geometry.index ? P.count : r.start + r.count) * 3;
      if (!P.mobKeep || P.mobKeep.length < n) P.mobKeep = new Float32Array(Math.max(n, P.array.length));
      P.mobKeep.set(P.array.subarray(0, n));
      P.mobN = n;
      this.mapArray(P.array, n);
      P.needsUpdate = true;
      this.buffers.push(P);
    }
    for (const c of o.children) this.walk(c);
  }
  undo() {
    const S = this.saved;
    for (let k = 0; k < S.length; k += 8) {
      const o = S[k];
      o.position.set(S[k + 1], S[k + 2], S[k + 3]);
      o.quaternion.set(S[k + 4], S[k + 5], S[k + 6], S[k + 7]);
    }
    S.length = 0;
    for (const P of this.buffers) {
      P.array.set(P.mobKeep.subarray(0, P.mobN));
      P.needsUpdate = true;
    }
    this.buffers.length = 0;
  }
}

const _look = new THREE.Vector3();
const _q2 = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
function _v2q(a) {
  return _qp.setFromAxisAngle(X, a);
}

// ------------------------------------------------------------------ scenery
// Laid out on the flat course like any other scenery and bent with it: an arch over lap one's road and the arch over
// lap two's at the same place close into a ring round the strip, red over the top and blue underneath, and down the
// twist the rings turn with the road. Nothing stands on a floor.
const UP = new THREE.Vector3(0, 1, 0);

// A wire Möbius band: centre c, radius R, half-width w, lying in the plane of e1 and e2. Half of it belongs to the
// red world and half to the blue.
function band(L, c, R, w, e1, e2, seg = 72) {
  const e3 = new THREE.Vector3().crossVectors(e1, e2).normalize();
  const at = (k, s) => {
    const t = (k / seg) * Math.PI * 2;
    const rad = new THREE.Vector3().addScaledVector(e1, Math.cos(t)).addScaledVector(e2, Math.sin(t));
    const d = rad.clone().multiplyScalar(Math.cos(t / 2)).addScaledVector(e3, Math.sin(t / 2));
    return c.clone().addScaledVector(rad, R).addScaledVector(d, s * w);
  };
  for (let k = 0; k < seg; k++) {
    const mask = k < seg / 2 ? 3 : 5; // M.R, M.B
    const a0 = at(k, -1);
    const a1 = at(k + 1, -1);
    const b0 = at(k, 1);
    const b1 = at(k + 1, 1);
    L.line(mask, a0, a1);
    L.line(mask, b0, b1);
    L.line(mask, a0, b0);
    L.line(mask, at(k, 0), at(k + 1, 0));
    L.quad(mask, a0, a1, b1, b0, null, 0.1);
  }
}

export function mobiusDecor(world) {
  const L = world.layers;
  const m = world.main;
  const mob = world.mob;
  const N = m.N;
  const half = N >> 1;
  const R_MASK = 3; // M.R
  const B_MASK = 5; // M.B
  const arch = (i, mask, r, width, color = null) => {
    const c = m.point(i, 0, 0, new THREE.Vector3());
    const u = new THREE.Vector3(m.rightX(i), 0, m.rightZ(i));
    L.hoop(mask, c, u, UP, r, width, 36, color, Math.PI, 0);
  };
  for (let i = 0; i < half; i++) {
    const twist = mob.kind[i] >= 2;
    const every = twist ? 11 : 58;
    if (i % every !== (twist ? 0 : 20)) continue;
    const r = m.halfW + (twist ? 4.5 : 6 + ((i / every) % 3) * 3);
    // the top half of the ring over lap one, the bottom half over lap two
    arch(i, R_MASK, r, twist ? 1.2 : 2.2);
    arch(i + half, B_MASK, r, twist ? 1.2 : 2.2);
    if (!twist) {
      arch(i + 5, B_MASK, m.halfW + 2.5, 1.1);
      arch(i + 5 + half, R_MASK, m.halfW + 2.5, 1.1);
    }
  }
  // the strip itself, as sculpture: a great band hung over the middle of each lobe, and small ones along the road
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < half; i++) {
    cx += m.px[i];
    cz += m.pz[i];
  }
  cx /= half;
  cz /= half;
  const tilt = new THREE.Vector3(0, 0.42, 0.91).normalize();
  for (const s of [1, -1]) band(L, new THREE.Vector3(cx * s, 62, cz), 46, 15, new THREE.Vector3(s, 0, 0), tilt);
  const rng = world.rng;
  for (let i = 40; i < N; i += 96) {
    if (mob.kind[m.wrap(i)] >= 2) continue;
    const side = (Math.floor(i / 96) % 2 ? 1 : -1) * (i < half ? 1 : -1);
    const c = m.point(i, side * (m.halfW + 26 + rng() * 10), 12 + rng() * 10, new THREE.Vector3());
    // (keep them off the far side of the twist straight, which is the other lobe's ground)
    if (Math.abs(c.x) < 30) continue;
    const a = rng() * Math.PI;
    band(L, c, 9, 3, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), new THREE.Vector3(0, 1, 0), 40);
  }
}
