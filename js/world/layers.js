// Neon wireframe geometry, batched by shift mask. Every mask (neutral, red world, blue world, ...) gets one set of
// materials, so a lens change only has to fade a handful of materials: pieces solid in the racer's lens glow,
// pieces that aren't fade to ghosts you can see through (and drive through).

import * as THREE from '../../vendor/three.js';
import { colorForMask, solidIn, RED, BLUE, M } from './shift.js';
import { damp } from '../core/util.js';
import { WAVE, patchWave, patchWet } from './fx.js';

const _c = new THREE.Color();
const NEUTRAL = M.ALL;
const TINT_BOTH = new THREE.Color(1, 1, 1);
const TINT_RED = new THREE.Color(1, 0.2, 0.28);
const TINT_BLUE = new THREE.Color(0.18, 0.52, 1);

class Builder {
  constructor() {
    this.lp = []; // line positions
    this.lc = []; // line colours
    this.rp = []; // ribbon (glow strip) triangles
    this.rc = [];
    this.fp = []; // dark fill triangles
    this.gp = []; // road surface triangles (wet glass)
  }
}

export class Layers {
  constructor() {
    this.builders = new Map();
    this.mats = new Map();
    this.group = new THREE.Group();
    this.level = new Map(); // mask -> current solidity 0..1
    this.signs = []; // { mat, hideIn }: a board that goes with its colour's world
    this.waveAt = null; // where a shift wave starts (the viewer's car); no wave without it
    this.wave = null;
    // The Escher room (rooms.js) draws each stair on its own wall, so pieces are batched by the cell they're in as well
    // as by world: -1 is any cell (drawn with every cell, the clipping planes keep what's in each).
    this.region = -1;
  }

  // (p: the piece's first point. With no cell set, `auto` (rooms.js) works the cell out from it.)
  b(mask, p) {
    const region = this.region < 0 && this.auto && p ? this.auto(p) : this.region;
    const key = region < 0 ? mask : `${mask}@${region}`;
    let b = this.builders.get(key);
    if (!b) {
      this.builders.set(key, (b = new Builder()));
      b.mask = mask;
      b.region = region;
    }
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
      // Tinted glass: coloured pieces get a rich see-through tint, neutral ones (mostly road) stay wet black.
      // (colours are linear here: 0.05 reads as about a quarter brightness on screen, 0.006 as near black)
      fill: new THREE.MeshBasicMaterial({ color: _c.set(base).multiplyScalar(mask === 7 ? 0.006 : 0.05).getHex(), transparent: true, opacity: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
      solid: new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 1 }),
      wire: new THREE.LineBasicMaterial({ color: base, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }),
    };
    // the road's own glass: the fill, plus the wet reflection
    m.road = patchWet(m.fill.clone());
    // every world but the neutral one redraws behind the shift wave
    if (mask !== NEUTRAL) {
      m.per = { uFrom: { value: 1 }, uTo: { value: 1 } };
      for (const k of ['line', 'ribbon', 'wire', 'fill', 'solid', 'road']) patchWave(m[k], m.per, k === 'line' || k === 'wire');
    }
    this.mats.set(mask, m);
    this.level.set(mask, 1);
    return m;
  }

  // --------------------------------------------------------------- primitives
  line(mask, a, b, color = null) {
    const B = this.b(mask, a);
    B.lp.push(a.x, a.y, a.z, b.x, b.y, b.z);
    _c.set(color ?? colorForMask(mask));
    B.lc.push(_c.r, _c.g, _c.b, _c.r, _c.g, _c.b);
  }
  lineXYZ(mask, ax, ay, az, bx, by, bz, color = null) {
    const B = this.b(mask, this.auto ? { x: ax, y: ay, z: az } : null);
    B.lp.push(ax, ay, az, bx, by, bz);
    _c.set(color ?? colorForMask(mask));
    B.lc.push(_c.r, _c.g, _c.b, _c.r, _c.g, _c.b);
  }
  // A quad as a glowing ribbon: a, b, c, d in order around the edge.
  quad(mask, a, b, c, d, color = null, k = 1) {
    const B = this.b(mask, a);
    B.rp.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    _c.set(color ?? colorForMask(mask)).multiplyScalar(k);
    for (let i = 0; i < 6; i++) B.rc.push(_c.r, _c.g, _c.b);
  }
  // Ribbon quad that fades across: colour k0 along edge a-b, k1 along d-c (a spill of light onto the road).
  quadFade(mask, a, b, c, d, color, k0, k1) {
    const B = this.b(mask, a);
    B.rp.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    _c.set(color);
    const r = _c.r, g = _c.g, bl = _c.b;
    for (const k of [k0, k0, k1, k0, k1, k1]) B.rc.push(r * k, g * k, bl * k);
  }
  fillQuad(mask, a, b, c, d) {
    const B = this.b(mask, a);
    B.fp.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  }
  // A piece of road surface: dark glass that shows the wet reflection.
  roadQuad(mask, a, b, c, d) {
    const B = this.b(mask, a);
    B.gp.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
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
    // Neutral pieces carry red and blue accents (rails, lane edges). Through a lens they switch to a grey copy of
    // their colours that the lens tint then colours, so nothing of the other world's colour is left on screen.
    const grey = (c) => {
      const out = new Float32Array(c.length);
      for (let i = 0; i < c.length; i += 3) out[i] = out[i + 1] = out[i + 2] = Math.max(c[i], c[i + 1], c[i + 2]) * 0.85 + 0.15 * (c[i] + c[i + 1] + c[i + 2]) / 3;
      return new THREE.Float32BufferAttribute(out, 3);
    };
    this.neutral = [];
    for (const B of this.builders.values()) {
      const mask = B.mask;
      const m = this.materials(mask);
      // a course that's drawn bent (mobius.js) bends every vertex here, once
      if (this.bend) for (const a of [B.lp, B.rp, B.fp, B.gp]) this.bend(a);
      const tag = (o) => (o.userData.region = B.region);
      if (B.lp.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(B.lp, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(B.lc, 3));
        if (mask === NEUTRAL) this.neutral.push({ g, colour: g.getAttribute('color'), grey: grey(B.lc) });
        const o = new THREE.LineSegments(g, m.line);
        o.frustumCulled = false;
        o.renderOrder = 2;
        tag(o);
        this.group.add(o);
      }
      if (B.rp.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(B.rp, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(B.rc, 3));
        if (mask === NEUTRAL) this.neutral.push({ g, colour: g.getAttribute('color'), grey: grey(B.rc) });
        const o = new THREE.Mesh(g, m.ribbon);
        o.frustumCulled = false;
        o.renderOrder = 3;
        tag(o);
        this.group.add(o);
      }
      if (B.fp.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(B.fp, 3));
        g.computeBoundingSphere();
        const o = new THREE.Mesh(g, m.fill);
        o.renderOrder = 1;
        tag(o);
        this.group.add(o);
      }
      if (B.gp.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(B.gp, 3));
        g.computeBoundingSphere();
        const o = new THREE.Mesh(g, m.road);
        o.renderOrder = 1;
        tag(o);
        this.group.add(o);
      }
    }
    this.builders.clear();
    return this.group;
  }

  // Fade every mask toward solid or ghost for the viewer's lens. Returns nothing; call every frame.
  // Split-screen: each player sees their own lens, so each view keeps its own fade levels.
  useView(k) {
    this.views ||= [];
    this.views[this.view ?? 0] = this.level;
    this.level ||= new Map();
    this.level = this.views[k] || new Map(this.level);
    this.view = k;
  }

  update(dt, mode, time = 0, instant = false) {
    // Through a single lens the other world is gone completely, and what's left (the neutral road, rails and pads)
    // takes that lens's colour, so the view is all red or all blue. BOTH shows both worlds and hides the lens-only
    // secrets.
    const T = mode === RED ? TINT_RED : mode === BLUE ? TINT_BLUE : TINT_BOTH;
    this.mode = mode; // (the lens this view is drawn for: rooms.js shuts lens-only portals in the others)
    // (kept in the level map, so each split-screen view has its own)
    let tint = this.level.get('tint');
    if (!tint || tint.view !== this.view) {
      tint = tint ? tint.clone() : new THREE.Color(1, 1, 1);
      tint.view = this.view;
      this.level.set('tint', tint);
    }
    if (instant) tint.copy(T);
    else tint.lerp(T, 1 - Math.exp(-10 * dt));
    const lens = mode === RED || mode === BLUE;
    for (const N of this.neutral || []) {
      const want = lens ? N.grey : N.colour;
      if (N.g.getAttribute('color') !== want) N.g.setAttribute('color', want);
    }
    // A lens change starts a wave from the car (one view only: split-screen views fade as before).
    const waving = !this.views && this.waveAt && !instant;
    if (waving && this.lastMode !== undefined && mode !== this.lastMode) {
      if (this.wave) this.endWave();
      this.wave = { R: 0, mode };
      WAVE.uWaveC.value.copy(this.waveAt);
      WAVE.uWaveEdge.value.copy(T).multiplyScalar(0.7);
      for (const [mask, m] of this.mats) {
        if (!m.per) continue;
        m.per.uFrom.value = this.level.get(mask) ?? 1;
        m.per.uTo.value = solidIn(mask, mode) ? 1 : 0;
        this.level.set(mask, m.per.uTo.value);
      }
    }
    this.lastMode = mode;
    if (this.wave) {
      // fast at first, faster as it goes: the near world turns over at once, the horizon a beat later
      this.wave.R += dt * (160 + this.wave.R * 2.6);
      WAVE.uWaveR.value = this.wave.R;
      WAVE.uWaveEdge.value.multiplyScalar(Math.exp(-1.4 * dt));
      if (this.wave.R > 2500) this.endWave();
    }
    for (const [mask, m] of this.mats) {
      const want = solidIn(mask, mode) ? 1 : 0;
      let lv = this.level.get(mask);
      if (this.wave && m.per) {
        // the shader does the fading either side of the ring; keep both sides drawn while it passes
        const shimmer = mask === RED || mask === BLUE ? 0.85 + 0.15 * Math.sin(time * 9) : 1;
        const on = m.per.uFrom.value > 0 || m.per.uTo.value > 0;
        m.line.opacity = m.ribbon.opacity = m.wire.opacity = shimmer;
        m.fill.opacity = m.road.opacity = 0.9;
        m.solid.opacity = 1;
        m.line.visible = m.ribbon.visible = m.wire.visible = m.solid.visible = m.fill.visible = m.road.visible = on;
        continue;
      }
      lv = instant ? want : damp(lv, want, want ? 14 : 12, dt);
      if (lv < 0.003) lv = 0;
      this.level.set(mask, lv);
      // Single-lens-only pieces shimmer: they are a secret of that world.
      const shimmer = mask === RED || mask === BLUE ? 0.85 + 0.15 * Math.sin(time * 9) : 1;
      const on = lv > 0;
      m.line.opacity = lv * shimmer;
      m.ribbon.opacity = lv * shimmer;
      m.wire.opacity = lv * shimmer;
      m.fill.opacity = m.road.opacity = 0.9 * lv;
      m.solid.opacity = lv;
      m.line.visible = m.ribbon.visible = m.wire.visible = m.solid.visible = on;
      m.fill.visible = m.road.visible = lv > 0.02;
      if (mask === NEUTRAL) {
        m.line.color.copy(tint);
        m.ribbon.color.copy(tint);
        m.wire.color.copy(tint);
        m.solid.color.set(m.base).multiply(tint);
      }
    }
    for (const S of this.signs) {
      // (boards go with their world; under a wave they flip as the ring reaches them)
      if (this.wave && S.at) {
        const want = mode === S.hideIn ? 0 : 1;
        if (S.at.distanceTo(WAVE.uWaveC.value) < this.wave.R) {
          S.mat.opacity = want;
          S.mat.visible = want > 0;
          this.level.set(`sign${S.hideIn}`, want);
        }
        continue;
      }
      const key = `sign${S.hideIn}`;
      const want = mode === S.hideIn ? 0 : 1;
      let lv = this.level.get(key) ?? 1;
      lv = instant ? want : damp(lv, want, 12, dt);
      this.level.set(key, lv);
      S.mat.opacity = lv;
      S.mat.visible = lv > 0.01;
    }
  }

  // The ring has passed the horizon: everything is the new lens.
  endWave() {
    for (const m of this.mats.values()) if (m.per) m.per.uFrom.value = m.per.uTo.value = 1;
    WAVE.uWaveR.value = 1e7;
    this.wave = null;
  }
}
