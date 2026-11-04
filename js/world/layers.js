// Neon wireframe geometry, batched by shift mask. Every mask (neutral, red world, blue world, ...) gets one set of
// materials, so a lens change only has to fade a handful of materials: pieces solid in the racer's lens glow,
// pieces that aren't fade to ghosts you can see through (and drive through).

import * as THREE from '../../vendor/three.js';
import { colorForMask, solidIn } from './shift.js';
import { damp } from '../core/util.js';

const _c = new THREE.Color();

class Builder {
  constructor() {
    this.lp = []; // line positions
    this.lc = []; // line colours
    this.rp = []; // ribbon (glow strip) triangles
    this.rc = [];
    this.fp = []; // dark fill triangles
  }
}

export class Layers {
  constructor() {
    this.builders = new Map();
    this.mats = new Map();
    this.group = new THREE.Group();
    this.level = new Map(); // mask -> current solidity 0..1
  }

  b(mask) {
    let b = this.builders.get(mask);
    if (!b) this.builders.set(mask, (b = new Builder()));
    return b;
  }

  // Materials for a mask, shared by meshes built outside the batch (obstacles, shards, sweepers).
  materials(mask) {
    let m = this.mats.get(mask);
    if (m) return m;
    const base = colorForMask(mask);
    m = {
      mask,
      base,
      line: new THREE.LineBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }),
      ribbon: new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      fill: new THREE.MeshBasicMaterial({ color: _c.set(base).multiplyScalar(0.07).getHex(), transparent: true, opacity: 0.82, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
      solid: new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 1 }),
      wire: new THREE.LineBasicMaterial({ color: base, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }),
    };
    this.mats.set(mask, m);
    this.level.set(mask, 1);
    return m;
  }

  // --------------------------------------------------------------- primitives
  line(mask, a, b, color = null) {
    const B = this.b(mask);
    B.lp.push(a.x, a.y, a.z, b.x, b.y, b.z);
    _c.set(color ?? colorForMask(mask));
    B.lc.push(_c.r, _c.g, _c.b, _c.r, _c.g, _c.b);
  }
  lineXYZ(mask, ax, ay, az, bx, by, bz, color = null) {
    const B = this.b(mask);
    B.lp.push(ax, ay, az, bx, by, bz);
    _c.set(color ?? colorForMask(mask));
    B.lc.push(_c.r, _c.g, _c.b, _c.r, _c.g, _c.b);
  }
  // A quad as a glowing ribbon: a, b, c, d in order around the edge.
  quad(mask, a, b, c, d, color = null, k = 1) {
    const B = this.b(mask);
    B.rp.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    _c.set(color ?? colorForMask(mask)).multiplyScalar(k);
    for (let i = 0; i < 6; i++) B.rc.push(_c.r, _c.g, _c.b);
  }
  fillQuad(mask, a, b, c, d) {
    const B = this.b(mask);
    B.fp.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  }

  // Wire box, rotated by yaw about its centre.
  box(mask, cx, cy, cz, w, h, d, yaw = 0, color = null, fill = false) {
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const P = [];
    for (const [sx, sy, sz] of [
      [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1],
      [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1],
    ]) {
      const x = (sx * w) / 2;
      const z = (sz * d) / 2;
      P.push(new THREE.Vector3(cx + x * cs + z * sn, cy + (sy * h) / 2, cz - x * sn + z * cs));
    }
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [a, b] of E) this.line(mask, P[a], P[b], color);
    if (fill) {
      for (const f of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) this.fillQuad(mask, P[f[0]], P[f[1]], P[f[2]], P[f[3]]);
    }
  }

  // Ring of radius r around centre, in the plane spanned by unit vectors u and v.
  ring(mask, c, u, v, r, seg = 32, color = null) {
    let prev = null;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const p = new THREE.Vector3().copy(c).addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
      if (prev) this.line(mask, prev, p, color);
      prev = p;
    }
  }

  // A thick neon arch / loop: two rings joined by struts, with a ribbon on the inner face.
  hoop(mask, c, u, v, r, width, seg = 40, color = null, arc = Math.PI * 2, a0 = 0) {
    const w = new THREE.Vector3().crossVectors(u, v).normalize();
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * arc;
      const dir = new THREE.Vector3().addScaledVector(u, Math.cos(a)).addScaledVector(v, Math.sin(a));
      const p0 = new THREE.Vector3().copy(c).addScaledVector(dir, r).addScaledVector(w, -width / 2);
      const p1 = new THREE.Vector3().copy(c).addScaledVector(dir, r).addScaledVector(w, width / 2);
      const q0 = new THREE.Vector3().copy(c).addScaledVector(dir, r + width * 0.35).addScaledVector(w, -width / 2);
      const q1 = new THREE.Vector3().copy(c).addScaledVector(dir, r + width * 0.35).addScaledVector(w, width / 2);
      pts.push([p0, p1, q0, q1]);
    }
    for (let i = 0; i < pts.length; i++) {
      const [p0, p1, q0, q1] = pts[i];
      if (i % 2 === 0) {
        this.line(mask, p0, p1, color);
        this.line(mask, q0, q1, color);
        this.line(mask, p0, q0, color);
      }
      if (i > 0) {
        const [a0_, a1, b0, b1] = pts[i - 1];
        this.line(mask, a0_, p0, color);
        this.line(mask, a1, p1, color);
        this.line(mask, b0, q0, color);
        this.line(mask, b1, q1, color);
        this.quad(mask, a0_, p0, p1, a1, color, 0.35);
      }
    }
  }

  // Wire cylinder (tower, pillar).
  cylinder(mask, cx, y0, cz, r, h, seg = 8, rings = 4, color = null) {
    const up = new THREE.Vector3(0, 1, 0);
    const X = new THREE.Vector3(1, 0, 0);
    const Z = new THREE.Vector3(0, 0, 1);
    for (let k = 0; k <= rings; k++) this.ring(mask, new THREE.Vector3(cx, y0 + (h * k) / rings, cz), X, Z, r, seg, color);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      this.lineXYZ(mask, cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r, cx + Math.cos(a) * r, y0 + h, cz + Math.sin(a) * r, color);
    }
    void up;
  }

  // Neon skyscraper: a wire box with window floors.
  tower(mask, cx, y0, cz, w, h, d, yaw = 0, color = null) {
    this.box(mask, cx, y0 + h / 2, cz, w, h, d, yaw, color, true);
    const floors = Math.max(2, Math.floor(h / 6));
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    for (let f = 1; f < floors; f++) {
      const y = y0 + (h * f) / floors;
      const P = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => new THREE.Vector3(cx + x * cs + z * sn, y, cz - x * sn + z * cs));
      for (let i = 0; i < 4; i++) this.line(mask, P[i], P[(i + 1) % 4], color);
    }
  }

  // --------------------------------------------------------------- finish
  build() {
    for (const [mask, B] of this.builders) {
      const m = this.materials(mask);
      if (B.lp.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(B.lp, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(B.lc, 3));
        const o = new THREE.LineSegments(g, m.line);
        o.frustumCulled = false;
        o.renderOrder = 2;
        this.group.add(o);
      }
      if (B.rp.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(B.rp, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(B.rc, 3));
        const o = new THREE.Mesh(g, m.ribbon);
        o.frustumCulled = false;
        o.renderOrder = 3;
        this.group.add(o);
      }
      if (B.fp.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(B.fp, 3));
        g.computeBoundingSphere();
        const o = new THREE.Mesh(g, m.fill);
        o.renderOrder = 1;
        this.group.add(o);
      }
    }
    this.builders.clear();
    return this.group;
  }

  // Fade every mask toward solid or ghost for the viewer's lens. Returns nothing; call every frame.
  update(dt, mode, time = 0, instant = false) {
    for (const [mask, m] of this.mats) {
      const want = solidIn(mask, mode) ? 1 : 0;
      let lv = this.level.get(mask);
      lv = instant ? want : damp(lv, want, want ? 14 : 9, dt);
      this.level.set(mask, lv);
      // Single-lens-only pieces shimmer: they are a secret of that world.
      const shimmer = mask === 2 || mask === 4 ? 0.85 + 0.15 * Math.sin(time * 9) : 1;
      const ghost = 0.07 + 0.03 * Math.sin(time * 3 + mask);
      const a = ghost + (1 - ghost) * lv;
      m.line.opacity = a * shimmer;
      m.ribbon.opacity = (0.05 + 0.95 * lv) * shimmer;
      m.wire.opacity = a * shimmer;
      m.fill.opacity = 0.82 * lv;
      m.fill.visible = lv > 0.02;
      m.solid.opacity = 0.1 + 0.9 * lv;
    }
  }
}
