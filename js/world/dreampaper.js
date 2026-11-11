// The paper pieces of DREAM FOLD's city (dreamcity.js): papercraft towers, paper lanterns, flocks of paper darts.

import * as THREE from '../../vendor/three.js';
import { colorForMask, M } from './shift.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _col = new THREE.Color();

// Lit windows on one face of a tower. The face runs from (px, pz) along the unit vector (ux, uz) for `fw`, between
// heights ya and yb, and looks out along (nx, nz).
function windows(S, mask, px, pz, ux, uz, nx, nz, fw, ya, yb, rng, lit, glow) {
  const cw = 3.4;
  const ch = 4.2;
  const n = Math.floor((fw - 1.4) / cw);
  const rows = Math.floor((yb - ya - 1.6) / ch);
  if (n < 1 || rows < 1) return;
  const m = (fw - n * cw) / 2;
  const base = colorForMask(mask);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < n; c++) {
      if (rng() >= lit) continue;
      // most are a dim pane; now and then one is a room with the light on
      const k = (rng() < 0.12 ? 0.8 : 0.13 + rng() * 0.2) * glow;
      const u0 = m + c * cw + 0.75;
      const u1 = u0 + cw - 1.5;
      const y = ya + 1.4 + r * ch;
      const ox = px + nx * 0.07;
      const oz = pz + nz * 0.07;
      S.quad(mask, _a.set(ox + ux * u0, y, oz + uz * u0), _b.set(ox + ux * u1, y, oz + uz * u1), _c.set(ox + ux * u1, y + 2.4, oz + uz * u1), _d.set(ox + ux * u0, y + 2.4, oz + uz * u0), base, k);
    }
  }
}

// One storey block of a tower: a filled wire box with a belt line or two and windows on all four sides.
function block(S, mask, x, ya, z, w, h, d, rng, col, dim, lit, glow) {
  S.box(mask, x, ya + h / 2, z, w, h, d, 0, col, true);
  const belts = Math.min(3, Math.floor(h / 14));
  for (let k = 1; k <= belts; k++) {
    const y = ya + (h * k) / (belts + 1);
    S.lineXYZ(mask, x - w / 2, y, z - d / 2, x + w / 2, y, z - d / 2, dim);
    S.lineXYZ(mask, x + w / 2, y, z - d / 2, x + w / 2, y, z + d / 2, dim);
    S.lineXYZ(mask, x + w / 2, y, z + d / 2, x - w / 2, y, z + d / 2, dim);
    S.lineXYZ(mask, x - w / 2, y, z + d / 2, x - w / 2, y, z - d / 2, dim);
  }
  if (lit <= 0) return;
  windows(S, mask, x - w / 2, z - d / 2, 1, 0, 0, -1, w, ya, ya + h, rng, lit, glow);
  windows(S, mask, x - w / 2, z + d / 2, 1, 0, 0, 1, w, ya, ya + h, rng, lit, glow);
  windows(S, mask, x - w / 2, z - d / 2, 0, 1, -1, 0, d, ya, ya + h, rng, lit, glow);
  windows(S, mask, x + w / 2, z - d / 2, 0, 1, 1, 0, d, ya, ya + h, rng, lit, glow);
}

// A folded roof over the rectangle (w by d) at height y: a pyramid, or (ridge) a pitched roof along its long side.
function roof(S, mask, x, y, z, w, d, rh, ridge, col) {
  const P = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([px, pz]) => new THREE.Vector3(x + px, y, z + pz));
  if (!ridge) {
    const top = new THREE.Vector3(x, y + rh, z);
    for (let i = 0; i < 4; i++) {
      S.line(mask, P[i], top, col);
      S.fillQuad(mask, P[i], P[(i + 1) % 4], top, top);
    }
    return;
  }
  // (the ridge stops short of the ends, so the end faces lean in like a folded box lid)
  const alongX = w >= d;
  const half = (alongX ? w : d) * 0.3;
  const r0 = new THREE.Vector3(x - (alongX ? half : 0), y + rh, z - (alongX ? 0 : half));
  const r1 = new THREE.Vector3(x + (alongX ? half : 0), y + rh, z + (alongX ? 0 : half));
  S.line(mask, r0, r1, col);
  // corners 0 and 3 are the low-x end, 0 and 1 the low-z end
  const near = alongX ? [r0, r1, r1, r0] : [r0, r0, r1, r1];
  for (let i = 0; i < 4; i++) S.line(mask, P[i], near[i], col);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    if (near[i] === near[j]) S.fillQuad(mask, P[i], P[j], near[i], near[i]);
    else S.fillQuad(mask, P[i], P[j], near[j], near[i]);
  }
}

// A papercraft tower standing on (x, y0, z). S is the batch it's drawn into. o: { top: nothing reaches above this
// height over y0, glow: line strength, lit: how many of its windows are lit }
export function paperTower(S, mask, x, y0, z, w, h, d, rng, o = {}) {
  const glow = o.glow ?? 1;
  const lit = o.lit ?? 0.25;
  const top = o.top ?? 1e9;
  const col = _col.set(colorForMask(mask)).multiplyScalar(glow).getHex();
  const dim = new THREE.Color(colorForMask(mask)).multiplyScalar(glow * 0.34).getHex();
  const style = rng();
  const small = Math.min(w, d);
  if (style < 0.32) {
    // a pitched roof
    const rh = small * (0.35 + rng() * 0.25);
    h = Math.max(5, Math.min(h, top - rh));
    block(S, mask, x, y0, z, w, h, d, rng, col, dim, lit, glow);
    roof(S, mask, x, y0 + h, z, w, d, rh, true, col);
  } else if (style < 0.56) {
    // a pyramid roof
    const rh = small * (0.45 + rng() * 0.4);
    h = Math.max(5, Math.min(h, top - rh));
    block(S, mask, x, y0, z, w, h, d, rng, col, dim, lit, glow);
    roof(S, mask, x, y0 + h, z, w, d, rh, false, col);
  } else if (style < 0.84) {
    // stepped: a base, a narrower tier on it, and a point
    const rh = small * 0.36;
    h = Math.max(8, Math.min(h * 1.12, top - rh));
    const h1 = h * (0.5 + rng() * 0.18);
    const k = 0.58 + rng() * 0.14;
    block(S, mask, x, y0, z, w, h1, d, rng, col, dim, lit, glow);
    block(S, mask, x, y0 + h1, z, w * k, h - h1, d * k, rng, col, dim, lit, glow);
    roof(S, mask, x, y0 + h, z, w * k, d * k, rh, false, col);
  } else {
    // a flat roof with a folded lip and a mast
    const mast = 5 + rng() * 6;
    h = Math.max(5, Math.min(h, top - mast - 1.2));
    block(S, mask, x, y0, z, w, h, d, rng, col, dim, lit, glow);
    S.box(mask, x, y0 + h + 0.6, z, w * 0.8, 1.2, d * 0.8, 0, dim, true);
    const mx = x + (rng() - 0.5) * w * 0.4;
    const mz = z + (rng() - 0.5) * d * 0.4;
    S.lineXYZ(mask, mx, y0 + h + 1.2, mz, mx, y0 + h + 1.2 + mast, mz, col);
    S.lineXYZ(mask, mx - 1.2, y0 + h + 1.2 + mast * 0.7, mz, mx + 1.2, y0 + h + 1.2 + mast * 0.7, mz, col);
  }
}

// Geometry for pieces that move on their own (drawn with the course's materials, so they go with their lens).
class Loose {
  constructor(mask) {
    this.mask = mask;
    this.lp = [];
    this.lc = [];
    this.rp = [];
    this.rc = [];
    this.c = new THREE.Color(colorForMask(mask));
  }
  line(a, b, k = 1) {
    this.lp.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let i = 0; i < 2; i++) this.lc.push(this.c.r * k, this.c.g * k, this.c.b * k);
  }
  tri(a, b, c, k) {
    this.rp.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) this.rc.push(this.c.r * k, this.c.g * k, this.c.b * k);
  }
  build(L) {
    const m = L.materials(this.mask);
    const g = new THREE.Group();
    const geo = (p, c) => {
      const q = new THREE.BufferGeometry();
      q.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      q.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      return q;
    };
    const lines = new THREE.LineSegments(geo(this.lp, this.lc), m.line);
    lines.renderOrder = 2;
    const fills = new THREE.Mesh(geo(this.rp, this.rc), m.ribbon);
    fills.renderOrder = 3;
    g.add(lines, fills);
    g.traverse((o) => (o.frustumCulled = false));
    return g;
  }
}

// Paper lanterns hung in the air at `spots` ([x, y, z]): red ones and blue ones, in a few groups that drift up and
// down out of step with each other.
export function lanterns(world, L, spots, rng) {
  const sets = [M.R, M.B, M.R, M.B].map((mask) => new Loose(mask));
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const [x, y, z] of spots) {
    const S = sets[Math.floor(rng() * sets.length)];
    const s = 1 + rng() * 0.7;
    const r = 1.15 * s;
    const hh = 1.7 * s;
    const top = V(x, y + hh, z);
    const bot = V(x, y - hh, z);
    const ring = [0, 1, 2, 3].map((k) => V(x + Math.cos((k * Math.PI) / 2 + 0.6) * r, y, z + Math.sin((k * Math.PI) / 2 + 0.6) * r));
    for (let k = 0; k < 4; k++) {
      S.line(ring[k], ring[(k + 1) % 4], 0.8);
      S.line(ring[k], top);
      S.line(ring[k], bot);
    }
    // the light inside, and the tail of its string
    S.tri(top, ring[0], bot, 0.42);
    S.tri(top, ring[2], bot, 0.42);
    S.tri(top, ring[1], bot, 0.42);
    S.tri(top, ring[3], bot, 0.42);
    S.line(bot, V(x, y - hh - 2.6 * s, z), 0.5);
  }
  sets.forEach((S, k) => {
    if (!S.lp.length) return;
    const g = S.build(L);
    world.group.add(g);
    world.animated.push((t) => {
      g.position.y = Math.sin(t * 0.55 + k * 1.7) * 1.3;
    });
  });
}

// A flock of paper darts wheeling round (cx, cz) at height y.
export function flock(world, L, mask, cx, y, cz, rng) {
  const S = new Loose(mask);
  const dir = rng() < 0.5 ? 1 : -1;
  const n = 6 + Math.floor(rng() * 4);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng() * 0.5;
    const r = 15 + rng() * 17;
    const s = 1.5 + rng() * 0.9;
    // nose along the way it flies round, banked into the turn
    e.set(0, -a + (dir > 0 ? 0 : Math.PI), dir * 0.35, 'YXZ');
    m.compose(new THREE.Vector3(Math.cos(a) * r, (rng() - 0.5) * 9, Math.sin(a) * r), q.setFromEuler(e), new THREE.Vector3(s, s, s));
    const P = (x, yy, z) => new THREE.Vector3(x, yy, z).applyMatrix4(m);
    const nose = P(0, 0, 2.4);
    const tail = P(0, 0.1, -1.7);
    const wl = P(-1.9, 0.55, -1.7);
    const wr = P(1.9, 0.55, -1.7);
    const keel = P(0, -0.7, -1.5);
    for (const [u, v] of [[nose, wl], [nose, wr], [nose, tail], [wl, tail], [wr, tail], [nose, keel], [keel, tail]]) S.line(u, v);
    S.tri(nose, wl, tail, 0.3);
    S.tri(nose, wr, tail, 0.3);
  }
  const g = S.build(L);
  g.position.set(cx, y, cz);
  world.group.add(g);
  const w = (0.2 + rng() * 0.12) * dir;
  const ph = rng() * 9;
  world.animated.push((t) => {
    g.rotation.y = -t * w + ph;
    g.position.y = y + Math.sin(t * 0.4 + ph) * 2;
  });
}
