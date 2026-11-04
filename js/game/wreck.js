// Wrecks, scraps and sparks. Everything on screen is neon line segments, so a car (or a block) that breaks comes
// apart into its own lines: each edge becomes a piece that tumbles, bounces on the road and fades out. One
// batched LineSegments draws every piece in the race.

import * as THREE from '../../vendor/three.js';

const CAP = 5000; // pieces alive at once
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Color();
const _m = new THREE.Matrix4();

export class Debris {
  constructor() {
    this.pos = new Float32Array(CAP * 6);
    this.col = new Float32Array(CAP * 6);
    this.p = []; // live pieces
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  // One piece: a segment from a to b (world space) thrown with velocity v, landing on floorY.
  add(a, b, v, color, life, floorY, spin = 6) {
    if (this.p.length >= CAP) this.p.shift();
    const ax = Math.random() - 0.5;
    const ay = Math.random() - 0.5;
    const az = Math.random() - 0.5;
    const al = Math.hypot(ax, ay, az) || 1;
    this.p.push({
      cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, cz: (a.z + b.z) / 2,
      hx: (b.x - a.x) / 2, hy: (b.y - a.y) / 2, hz: (b.z - a.z) / 2,
      vx: v.x, vy: v.y, vz: v.z,
      kx: ax / al, ky: ay / al, kz: az / al, w: (Math.random() * 2 - 1) * spin,
      r: color.r, g: color.g, b: color.b,
      life, max: life, floor: floorY,
    });
  }

  // Break an object's lines (and its hull's facet edges) into pieces flung out from its centre.
  // share: fraction of its edges that come off (1 = the whole thing, 0.1 = a few scraps).
  burst(obj, vel, power, floorY, share = 1, life = 2.6) {
    obj.updateMatrixWorld(true);
    const centre = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
    obj.traverse((o) => {
      if (!o.visible && o !== obj) return;
      const geo = o.geometry;
      const P = geo?.getAttribute?.('position');
      if (!P) return;
      const lines = o.isLineSegments;
      const hull = o.isMesh && o.userData.hull;
      if (!lines && !hull) return;
      const mc = o.material?.color;
      _c.copy(mc || _c.set(0xffffff));
      if (hull) _c.lerp(new THREE.Color(0xffffff), 0.35);
      const colour = _c.clone();
      _m.copy(o.matrixWorld);
      const edge = (i, j) => {
        if (Math.random() > share) return;
        _a.fromBufferAttribute(P, i).applyMatrix4(_m);
        _b.fromBufferAttribute(P, j).applyMatrix4(_m);
        const mx = (_a.x + _b.x) / 2 - centre.x;
        const my = (_a.y + _b.y) / 2 - centre.y;
        const mz = (_a.z + _b.z) / 2 - centre.z;
        const ml = Math.hypot(mx, my, mz) || 1;
        const kick = power * (0.4 + Math.random() * 0.8);
        const v = { x: vel.x * 0.55 + (mx / ml) * kick, y: vel.y * 0.3 + Math.abs(my / ml) * kick * 0.6 + Math.random() * power * 0.5, z: vel.z * 0.55 + (mz / ml) * kick };
        this.add(_a, _b, v, colour, life * (0.6 + Math.random() * 0.6), floorY);
      };
      if (lines) for (let i = 0; i + 1 < P.count; i += 2) edge(i, i + 1);
      else for (let i = 0; i + 2 < P.count; i += 3) edge(i, i + 1 + Math.floor(Math.random() * 2));
    });
  }

  // Hot streaks off a hit or a scrape.
  sparks(at, dir, n, color = 0xffd27a, speed = 18, floorY = at.y - 1) {
    _c.set(color);
    for (let k = 0; k < n; k++) {
      const s = speed * (0.4 + Math.random());
      const v = { x: dir.x * s + (Math.random() - 0.5) * speed, y: Math.random() * speed * 0.6, z: dir.z * s + (Math.random() - 0.5) * speed };
      const l = 0.03 + Math.random() * 0.03;
      _a.set(at.x, at.y, at.z);
      _b.set(at.x + v.x * l, at.y + v.y * l, at.z + v.z * l);
      this.add(_a, _b, v, _c, 0.25 + Math.random() * 0.3, floorY, 0);
    }
  }

  update(dt) {
    const P = this.p;
    const pos = this.pos;
    const col = this.col;
    let n = 0;
    for (let k = 0; k < P.length; k++) {
      const q = P[k];
      q.life -= dt;
      if (q.life <= 0) continue;
      q.vy -= 26 * dt;
      const drag = Math.exp(-0.6 * dt);
      q.vx *= drag;
      q.vz *= drag;
      q.cx += q.vx * dt;
      q.cy += q.vy * dt;
      q.cz += q.vz * dt;
      if (q.cy < q.floor + 0.05) {
        // bounce and skid on the road
        q.cy = q.floor + 0.05;
        if (q.vy < 0) q.vy *= -0.35;
        q.vx *= 0.8;
        q.vz *= 0.8;
        q.w *= 0.7;
      }
      if (q.w) {
        // tumble: rotate the half-vector about the piece's own axis
        const t = q.w * dt;
        const c = Math.cos(t);
        const s = Math.sin(t);
        const { kx, ky, kz, hx, hy, hz } = q;
        const d = kx * hx + ky * hy + kz * hz;
        q.hx = hx * c + (ky * hz - kz * hy) * s + kx * d * (1 - c);
        q.hy = hy * c + (kz * hx - kx * hz) * s + ky * d * (1 - c);
        q.hz = hz * c + (kx * hy - ky * hx) * s + kz * d * (1 - c);
      }
      P[n++] = q;
      const o = (n - 1) * 6;
      pos[o] = q.cx - q.hx;
      pos[o + 1] = q.cy - q.hy;
      pos[o + 2] = q.cz - q.hz;
      pos[o + 3] = q.cx + q.hx;
      pos[o + 4] = q.cy + q.hy;
      pos[o + 5] = q.cz + q.hz;
      // full glow, then a flicker out over the last half second
      const f = q.life > 0.5 ? 1 : q.life / 0.5;
      const fade = f * (q.life < 0.5 && Math.random() < 0.15 ? 0.3 : 1);
      col[o] = col[o + 3] = q.r * fade;
      col[o + 1] = col[o + 4] = q.g * fade;
      col[o + 2] = col[o + 5] = q.b * fade;
    }
    P.length = n;
    this.geo.setDrawRange(0, n * 2);
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('color').needsUpdate = true;
  }

  clear() {
    this.p.length = 0;
    this.geo.setDrawRange(0, 0);
  }
}
