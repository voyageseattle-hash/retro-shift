// Time-trial ghosts, after Absurd Combat Racing's ghost recorder: the player's position, heading and lens sampled 20
// times a second, packed as delta-encoded integers so a whole run fits in a few kilobytes of localStorage.

import * as THREE from '../../vendor/three.js';
import { buildModel } from '../vehicles/racer.js';
import { BOTH, RED, BLUE, COLORS } from '../world/shift.js';
import { storage } from '../core/util.js';

const HZ = 20;
const Q = [20, 20, 20, 100]; // quantisation for x, y, z (5 cm) and yaw (0.01 rad); the lens is stored as-is
const STRIDE = 5;

export class GhostRecorder {
  constructor() {
    this.frames = [];
    this.next = 0;
  }
  sample(t, r) {
    while (t >= this.next) {
      this.frames.push(r.pos.x, r.pos.y, r.pos.z, r.yaw, r.mode);
      this.next += 1 / HZ;
    }
  }
  encode(meta) {
    const d = [];
    const prev = [0, 0, 0, 0, 0];
    for (let k = 0; k < this.frames.length; k += STRIDE) {
      for (let c = 0; c < STRIDE; c++) {
        const v = c < 4 ? Math.round(this.frames[k + c] * Q[c]) : this.frames[k + c];
        d.push(v - prev[c]);
        prev[c] = v;
      }
    }
    return { v: 1, hz: HZ, ...meta, d: d.join(',') };
  }
}

export function decodeGhost(g) {
  if (!g || !g.d) return null;
  const d = typeof g.d === 'string' ? g.d.split(',').map(Number) : g.d;
  const out = new Float32Array(d.length);
  const acc = [0, 0, 0, 0, 0];
  for (let k = 0; k < d.length; k++) {
    const c = k % STRIDE;
    acc[c] += d[k];
    out[k] = c < 4 ? acc[c] / Q[c] : acc[c];
  }
  return { hz: g.hz || HZ, frames: out, n: out.length / STRIDE, time: g.time };
}

export const ghostKey = (trackId, mono) => `rs.ghost${mono ? 'm' : ''}.${trackId}`;
export const loadGhost = (trackId, mono) => storage.get(ghostKey(trackId, mono), null);
export const saveGhost = (trackId, mono, data) => {
  try {
    storage.set(ghostKey(trackId, mono), data);
  } catch {
    /* storage full: keep racing */
  }
};

// A see-through wedge that replays a run.
export class GhostCar {
  constructor(data, color, label) {
    this.g = decodeGhost(data);
    this.label = label;
    this.model = buildModel(color, data?.body || data?.car || 'vector');
    this.root = this.model.root;
    const m = this.model;
    m.lineMat.opacity = 0.55;
    m.accentMat.opacity = 0.25;
    m.glowMat.opacity = 0.12;
    m.flameMat.opacity = 0.4;
    this.root.traverse((o) => {
      if (o.isMesh && (o.material === m.tailMat || o.material === m.hullMat)) o.visible = false; // see-through
    });
    this.pos = new THREE.Vector3();
    this.mode = BOTH;
    this.done = false;
  }
  get ok() {
    return !!this.g && this.g.n > 2;
  }
  update(t, viewerMode) {
    const g = this.g;
    if (!g) return;
    const f = t * g.hz;
    let i = Math.floor(f);
    if (i >= g.n - 1) {
      i = g.n - 2;
      this.done = true;
    }
    const a = f - i;
    const F = g.frames;
    const A = i * STRIDE;
    const B = A + STRIDE;
    this.pos.set(F[A] + (F[B] - F[A]) * a, F[A + 1] + (F[B + 1] - F[A + 1]) * a, F[A + 2] + (F[B + 2] - F[A + 2]) * a);
    let dy = F[B + 3] - F[A + 3];
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    const yaw = F[A + 3] + dy * a;
    this.mode = F[A + 4];
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, yaw, 0);
    this.model.body.position.y = 0.35;
    // the ghost glows the colour of its lens, and fades when it's in a different world from you
    const col = this.mode === RED ? COLORS.red : this.mode === BLUE ? COLORS.blue : 0xffffff;
    this.model.lineMat.color.set(col);
    const same = this.mode === viewerMode || this.mode === BOTH || viewerMode === BOTH;
    this.model.lineMat.opacity = this.done ? 0.15 : same ? 0.6 : 0.22;
    for (const fl of this.model.flames) {
      fl.scale.set(1, 0.8, 1);
      fl.position.z = fl.userData.z0 - 0.64;
    }
    this.animT = (this.animT || 0) + 1 / 60;
    for (const fn of this.model.anim) fn(1 / 60, this.animT, null);
  }
}
