// Shared pieces for the road hazards (traffic.js, police.js): wireframe vehicles built from lofts like the racers
// (bodies.js) and drawn in one batch, the storms' strike telegraph (closing rings, a filling disc, turning chevrons)
// and the box-against-racer test in the road frame that every hazard vehicle uses.

import * as THREE from '../../vendor/three.js';

export const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const HULL = 0x07030e;
const _v = new THREE.Vector3();

export function lines(pts, color, opacity = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, opacity, ...ADD }));
  l.frustumCulled = false;
  l.renderOrder = 6;
  return l;
}

// A ring of radius r in the ground plane; jag roughens it (a scorch mark).
export function circle(r, seg, jag = 0) {
  const p = [];
  const rr = (i) => r * (1 + (jag ? (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1 * jag - jag / 2 : 0));
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const r0 = rr(i);
    const r1 = rr((i + 1) % seg);
    p.push(Math.cos(a0) * r0, 0, Math.sin(a0) * r0, Math.cos(a1) * r1, 0, Math.sin(a1) * r1);
  }
  return p;
}

// ------------------------------------------------------------------ vehicle templates
// A template is a few line segments, hull triangles (dark, so the road doesn't show through) and glow triangles
// (light cones and halos). Every segment and glow carries a tag, and the fleet colours tags per vehicle when it
// draws: body lines in the world's colour, glass paler, lamps hot, a light bar flashing.
export const TAG = { body: 0, glass: 1, head: 2, tail: 3, barL: 4, barR: 5, under: 6, marker: 7 };

export const trap = (z, w, h, y0 = 0.25, top = 0.8) => ({ z, pts: [[-w, y0], [w, y0], [w * top, y0 + h], [-w * top, y0 + h]] });

export class Kit {
  constructor() {
    this.L = [];
    this.Lt = [];
    this.T = [];
    this.G = [];
    this.Gt = [];
    this.Ga = [];
  }
  seg(a, b, tag = 0) {
    this.L.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    this.Lt.push(tag);
  }
  path(pts, closed = false, tag = 0) {
    for (let k = 0; k < pts.length - 1; k++) this.seg(pts[k], pts[k + 1], tag);
    if (closed) this.seg(pts[pts.length - 1], pts[0], tag);
  }
  tri(a, b, c) {
    this.T.push(...a, ...b, ...c);
  }
  // rings: [{z, pts:[[x,y]...]}], all with the same vertex count, strung nose to tail
  loft(rings, { hull = true, tag = 0 } = {}) {
    const P = rings.map((r) => r.pts.map(([x, y]) => [x, y, r.z]));
    const n = P[0].length;
    for (const ring of P) this.path(ring, true, tag);
    for (let k = 0; k < P.length - 1; k++) {
      for (let v = 0; v < n; v++) this.seg(P[k][v], P[k + 1][v], tag);
      if (hull) for (let v = 0; v < n; v++) {
        const a = P[k][v], b = P[k][(v + 1) % n], c = P[k + 1][(v + 1) % n], d = P[k + 1][v];
        this.tri(a, b, c);
        this.tri(a, c, d);
      }
    }
    if (hull) for (const ring of [P[0], P[P.length - 1]]) for (let v = 1; v < n - 1; v++) this.tri(ring[0], ring[v], ring[v + 1]);
    return P;
  }
  box(w, h, d, x, y, z, tag = 0, hull = true) {
    return this.loft([trap(z - d, w, h, y, 1), trap(z + d, w, h, y, 1)], { hull, tag });
  }
  // a lamp: a short bar with a tick through it, so it reads as a point of light
  lamp(x, y, z, w, tag) {
    this.seg([x - w, y, z], [x + w, y, z], tag);
    this.seg([x, y - 0.09, z], [x, y + 0.09, z], tag);
  }
  glowTri(a, b, c, tag, alpha) {
    this.G.push(...a, ...b, ...c);
    this.Gt.push(tag);
    this.Ga.push(alpha);
  }
  glowQuad(a, b, c, d, tag, alpha) {
    this.glowTri(a, b, c, tag, alpha);
    this.glowTri(a, c, d, tag, alpha);
  }
  // a headlight's throw on the road: a flat fan from the lamp forward
  cone(x, y, z, len, spread, tag, alpha = 0.07) {
    this.glowTri([x, y, z], [x - spread, 0.05, z + len], [x + spread, 0.05, z + len], tag, alpha);
  }
  build(dims) {
    return {
      L: new Float32Array(this.L), Lt: Uint8Array.from(this.Lt), T: new Float32Array(this.T),
      G: new Float32Array(this.G), Gt: Uint8Array.from(this.Gt), Ga: Float32Array.from(this.Ga),
      segs: this.Lt.length, tris: this.T.length / 9, glows: this.Gt.length, ...dims,
    };
  }
}

// A throwaway copy of a template for Debris.burst: its lines and hull facets become the pieces.
export function scratchOf(tpl, color) {
  const root = new THREE.Group();
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(tpl.L, 3));
  root.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color })));
  if (tpl.T.length) {
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(tpl.T, 3));
    const h = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color }));
    h.userData.hull = true;
    root.add(h);
  }
  root.matrixAutoUpdate = false;
  return root;
}

// ------------------------------------------------------------------ the batch
// Every vehicle of a hazard is drawn by three objects: one LineSegments (vertex colours carry the fade), one dark
// hull mesh and one additive glow mesh. Call begin(), draw() each vehicle, end().
export class Fleet {
  constructor(segs, tris, glows) {
    this.lp = new Float32Array(segs * 6);
    this.lc = new Float32Array(segs * 6);
    this.hp = new Float32Array(tris * 9);
    this.gp = new Float32Array(glows * 9);
    this.gc = new Float32Array(glows * 9);
    const dyn = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', dyn(this.lp, 3));
    lg.setAttribute('color', dyn(this.lc, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, ...ADD }));
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', dyn(this.hp, 3));
    // (the hull sits a hair behind its own edges, like the world's fills do, so the lines on it aren't half lost to it)
    this.hull = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: HULL, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', dyn(this.gp, 3));
    gg.setAttribute('color', dyn(this.gc, 3));
    this.glow = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, ...ADD }));
    for (const o of [this.lines, this.hull, this.glow]) o.frustumCulled = false;
    this.lines.renderOrder = 3;
    this.glow.renderOrder = 2;
    this.group = new THREE.Group();
    this.group.add(this.hull, this.glow, this.lines);
    this.begin();
  }
  begin() {
    this.ns = 0;
    this.nt = 0;
    this.ng = 0;
  }
  // m: the vehicle's world matrix; pal: a THREE.Color per tag; alpha scales every colour (additive, so it fades);
  // ghost draws the lines only (a vehicle in a world the viewer isn't looking at)
  draw(tpl, m, alpha, pal, ghost = false) {
    const e = m.elements;
    const X = (x, y, z) => e[0] * x + e[4] * y + e[8] * z + e[12];
    const Y = (x, y, z) => e[1] * x + e[5] * y + e[9] * z + e[13];
    const Z = (x, y, z) => e[2] * x + e[6] * y + e[10] * z + e[14];
    const L = tpl.L;
    let o = this.ns * 6;
    if (o + L.length > this.lp.length) return;
    for (let s = 0; s < tpl.segs; s++) {
      const c = pal[tpl.Lt[s]];
      const r = c.r * alpha, g = c.g * alpha, b = c.b * alpha;
      for (let v = 0; v < 2; v++) {
        const i = s * 6 + v * 3;
        const x = L[i], y = L[i + 1], z = L[i + 2];
        this.lp[o] = X(x, y, z);
        this.lp[o + 1] = Y(x, y, z);
        this.lp[o + 2] = Z(x, y, z);
        this.lc[o] = r;
        this.lc[o + 1] = g;
        this.lc[o + 2] = b;
        o += 3;
      }
    }
    this.ns += tpl.segs;
    if (ghost) return;
    const T = tpl.T;
    o = this.nt * 9;
    if (o + T.length <= this.hp.length) {
      for (let i = 0; i < T.length; i += 3) {
        const x = T[i], y = T[i + 1], z = T[i + 2];
        this.hp[o++] = X(x, y, z);
        this.hp[o++] = Y(x, y, z);
        this.hp[o++] = Z(x, y, z);
      }
      this.nt += tpl.tris;
    }
    const G = tpl.G;
    o = this.ng * 9;
    if (o + G.length <= this.gp.length) {
      for (let t = 0; t < tpl.glows; t++) {
        const c = pal[tpl.Gt[t]];
        const a = tpl.Ga[t] * alpha;
        for (let v = 0; v < 3; v++) {
          const i = t * 9 + v * 3;
          const x = G[i], y = G[i + 1], z = G[i + 2];
          this.gp[o] = X(x, y, z);
          this.gp[o + 1] = Y(x, y, z);
          this.gp[o + 2] = Z(x, y, z);
          this.gc[o] = c.r * a;
          this.gc[o + 1] = c.g * a;
          this.gc[o + 2] = c.b * a;
          o += 3;
        }
      }
      this.ng += tpl.glows;
    }
  }
  end() {
    const L = this.lines.geometry, H = this.hull.geometry, G = this.glow.geometry;
    L.setDrawRange(0, this.ns * 2);
    H.setDrawRange(0, this.nt * 3);
    G.setDrawRange(0, this.ng * 3);
    L.attributes.position.needsUpdate = L.attributes.color.needsUpdate = true;
    H.attributes.position.needsUpdate = true;
    G.attributes.position.needsUpdate = G.attributes.color.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ on the road
// Where a vehicle driving the path sits: s is a fractional sample index, lat its offset. Fills veh.pos and its
// road frame (thx/thz forward, rx/rz right, up) and the world matrix m.
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _left = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
export function placeOnPath(veh, P) {
  const s = P.closed ? ((veh.s % P.N) + P.N) % P.N : Math.max(0, Math.min(P.N - 1.001, veh.s));
  veh.s = s;
  const i0 = Math.floor(s);
  const t = s - i0;
  veh.i = P.wrap(Math.round(s));
  P.point(i0, veh.lat, 0, _a);
  P.point(i0 + 1, veh.lat, 0, _b);
  veh.pos.copy(_a).lerp(_b, t);
  veh.pos.y += veh.lift || 0;
  const i = veh.i;
  veh.thx = P.thx[i];
  veh.thz = P.thz[i];
  veh.rx = P.rightX(i);
  veh.rz = P.rightZ(i);
  veh.y = veh.pos.y;
  _up.set(P.nx[i], P.ny[i], P.nz[i]);
  _fwd.set(P.tx[i], P.ty[i], P.tz[i]);
  if (veh.yawOff) _fwd.applyAxisAngle(_up, veh.yawOff);
  _fwd.addScaledVector(_up, -_fwd.dot(_up)).normalize();
  _left.crossVectors(_up, _fwd).normalize();
  veh.m.makeBasis(_left, _up, _fwd).setPosition(veh.pos);
  if (veh.roll) veh.m.multiply(_m2.makeRotationZ(veh.roll));
}
const _m2 = new THREE.Matrix4();

// Box-against-racer in the road frame. Returns null if clear; otherwise pushes the racer out of the box and returns
// { side, into }: side is true for a side swipe (into is the sideways speed it was pushed with), false for a nose
// or tail hit (into is the closing speed along the road, positive when the racer was catching the vehicle).
export function hitRacer(veh, r) {
  const t = r.track;
  if (!t || t.path !== veh.path || Math.abs(r.pos.y - veh.y) > 3) return null;
  const dx = r.pos.x - veh.pos.x;
  const dz = r.pos.z - veh.pos.z;
  const along = dx * veh.thx + dz * veh.thz;
  const dlat = dx * veh.rx + dz * veh.rz;
  const penAlong = veh.len + r.halfL - Math.abs(along);
  const penLat = veh.w + r.halfW - Math.abs(dlat);
  if (penAlong <= 0 || penLat <= 0) return null;
  if (penLat < penAlong) {
    const s = Math.sign(dlat) || 1;
    r.pos.x += veh.rx * s * penLat;
    r.pos.z += veh.rz * s * penLat;
    const vn = (r.vel.x * veh.rx + r.vel.z * veh.rz) * s;
    if (vn < 0) {
      r.vel.x -= veh.rx * s * vn * 1.5;
      r.vel.z -= veh.rz * s * vn * 1.5;
    }
    return { side: true, into: Math.max(0, -vn), s };
  }
  const s = Math.sign(along) || -1;
  r.pos.x += veh.thx * s * penAlong;
  r.pos.z += veh.thz * s * penAlong;
  const vt = r.vel.x * veh.thx + r.vel.z * veh.thz;
  // behind it and faster: we ran into it. Ahead of it and slower: it ran into us.
  const into = s < 0 ? vt - veh.speed : veh.speed - vt;
  if (into > 0) {
    const want = veh.speed + s * 2;
    r.vel.x += veh.thx * (want - vt);
    r.vel.z += veh.thz * (want - vt);
  }
  return { side: false, into: Math.max(0, into), s };
}

// ------------------------------------------------------------------ the telegraph
// The storms' warning on the road, then the hit: a shockwave rolls out and a scorch cools. The group sits on the
// spot; call update(t, warn, radius) each frame, dispose() when done() says so.
const RING = 28;
export class Telegraph {
  constructor(color, waveColor, scorchColor, radius) {
    this.fx = new THREE.Group();
    this.warnFx = new THREE.Group();
    this.rings = [0, 1, 2].map(() => lines(circle(1, RING), color));
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color, ...ADD, side: THREE.DoubleSide }));
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.renderOrder = 5;
    const tk = [];
    for (let q = 0; q < 4; q++) {
      const a = (q / 4) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      tk.push(c * 1.3 - sn * 0.25, 0, sn * 1.3 + c * 0.25, c * 1.05, 0, sn * 1.05, c * 1.05, 0, sn * 1.05, c * 1.3 + sn * 0.25, 0, sn * 1.3 - c * 0.25);
    }
    this.ticks = lines(tk, 0xffffff);
    this.warnFx.add(...this.rings, this.disc, this.ticks);
    this.wave = lines(circle(1, 40), waveColor);
    this.wave.visible = false;
    this.scorch = lines(circle(radius * 0.55, 18, 0.4).concat(circle(radius * 0.3, 12, 0.6)), scorchColor);
    this.scorch.visible = false;
    this.fx.add(this.warnFx, this.wave, this.scorch);
    this.radius = radius;
  }
  update(t, warn) {
    const f = Math.min(1, t / warn);
    const w = t < warn;
    this.warnFx.visible = w;
    if (w) {
      const pulse = 0.65 + 0.35 * Math.sin(t * (14 + 26 * f));
      this.rings.forEach((rg, n) => {
        rg.scale.setScalar(this.radius * (1 + (1 - f) * (0.9 + n * 0.5)));
        rg.material.opacity = (0.55 + 0.45 * f) * pulse * (1 - n * 0.2);
      });
      this.disc.scale.setScalar(this.radius * (0.15 + 0.85 * f));
      this.disc.material.opacity = 0.14 + 0.5 * f * f;
      this.ticks.rotation.y = t * (1.5 + 5 * f);
      this.ticks.scale.setScalar(this.radius * (1.25 - 0.25 * f));
      this.ticks.material.opacity = 0.5 + 0.5 * f;
      return;
    }
    const a = t - warn;
    this.wave.visible = a < 0.55;
    this.wave.scale.setScalar(this.radius * (0.4 + a * 7));
    this.wave.material.opacity = Math.max(0, 1 - a / 0.55);
    this.scorch.visible = true;
    this.scorch.material.opacity = Math.max(0, 1 - a / 3.2) * (0.75 + 0.25 * Math.sin(a * 40) * Math.max(0, 1 - a));
  }
  done(t, warn) {
    return t > warn + 3.2;
  }
  dispose() {
    this.fx.traverse((q) => q.geometry?.dispose());
  }
}

// Closest player's squared distance to a point (effects are skipped far from every camera).
export function nearPlayer(race, p, d) {
  return race.players.some((pl) => pl.pos.distanceToSquared(p) < d * d);
}

export { _v as tmpV };
