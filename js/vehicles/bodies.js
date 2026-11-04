// The wedges, as wireframes. Each body is built from lofts (cross-section rings strung along the car), boxes and a
// few loose lines, so every car keeps the concept sheet's look while reading as its own shape from the chase camera:
// lines take the colour of the lens you're in, accents take your paint, and a dark hull hides the road behind.
// Two secret drivers come from the studio's other games: Dash from LAST LINE surfing a pencil, and Absurd Combat Racing
// RALLY's GREAT WEDGE, a shark-finned monster truck.

import * as THREE from '../../vendor/three.js';

const HULL = 0x07030e;

// ------------------------------------------------------------------ geometry helpers
const trap = (z, w, h, y0 = 0.25, top = 0.8, x = 0) => ({ z, pts: [[x - w, y0], [x + w, y0], [x + w * top, y0 + h], [x - w * top, y0 + h]] });
const poly = (z, n, r, cy, sy = 1, x = 0, a0 = Math.PI / n) => ({
  z,
  pts: Array.from({ length: n }, (_, k) => {
    const a = a0 + (k / n) * Math.PI * 2;
    return [x + Math.cos(a) * r, cy + Math.sin(a) * r * sy];
  }),
});

class Kit {
  constructor() {
    this.L = []; // lens-coloured lines
    this.A = []; // paint-coloured lines
    this.AT = []; // paint-coloured fills
    this.H = []; // hull triangles
    this.B = []; // headband (fixed red) lines
  }
  seg(arr, a, b) {
    arr.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
  path(arr, pts, closed = false) {
    for (let k = 0; k < pts.length - 1; k++) this.seg(arr, pts[k], pts[k + 1]);
    if (closed) this.seg(arr, pts[pts.length - 1], pts[0]);
  }
  tri(arr, a, b, c) {
    arr.push(...a, ...b, ...c);
  }
  // rings: [{z, pts:[[x,y]...]}], all with the same vertex count
  loft(rings, { accentRings = [], accentTop = [], hull = true, lines = this.L } = {}) {
    const P = rings.map((r) => r.pts.map(([x, y]) => [x, y, r.z]));
    const n = P[0].length;
    P.forEach((ring, k) => this.path(accentRings.includes(k) ? this.A : lines, ring, true));
    for (let k = 0; k < P.length - 1; k++) {
      for (let v = 0; v < n; v++) this.seg(lines, P[k][v], P[k + 1][v]);
      if (hull) {
        for (let v = 0; v < n; v++) {
          const a = P[k][v], b = P[k][(v + 1) % n], c = P[k + 1][(v + 1) % n], d = P[k + 1][v];
          this.tri(this.H, a, b, c);
          this.tri(this.H, a, c, d);
        }
      }
      if (accentTop.includes(k)) {
        // the roof panel between ring k and k+1 (the last two vertices of a trapezoid ring)
        const a = P[k][2], b = P[k][3], c = P[k + 1][3], d = P[k + 1][2];
        const lift = (p) => [p[0], p[1] + 0.02, p[2]];
        this.tri(this.AT, lift(a), lift(b), lift(c));
        this.tri(this.AT, lift(a), lift(c), lift(d));
      }
    }
    if (hull) for (const ring of [P[0], P[P.length - 1]]) for (let v = 1; v < n - 1; v++) this.tri(this.H, ring[0], ring[v], ring[v + 1]);
    return P;
  }
  box(w, h, d, x, y, z, accent = false) {
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
    const p = g.attributes.position.array;
    const arr = accent ? this.A : this.L;
    for (let k = 0; k < p.length; k += 3) arr.push(p[k] + x, p[k + 1] + y, p[k + 2] + z);
    const hg = new THREE.BoxGeometry(w * 0.98, h * 0.98, d * 0.98).toNonIndexed();
    const hp = hg.attributes.position.array;
    for (let k = 0; k < hp.length; k += 3) this.H.push(hp[k] + x, hp[k + 1] + y, hp[k + 2] + z);
  }
  circle(arr, c, r, plane = 'yz', n = 16) {
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const u = Math.cos(a) * r, v = Math.sin(a) * r;
      pts.push(plane === 'yz' ? [c[0], c[1] + v, c[2] + u] : plane === 'xy' ? [c[0] + u, c[1] + v, c[2]] : [c[0] + u, c[1], c[2] + v]);
    }
    this.path(arr, pts, true);
  }
}

const lineGeo = (arr) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return g;
};

// ------------------------------------------------------------------ the bodies
// Each returns { thrusters: [[x,y,z]], tails: [[x,y,z]], glow: [w,l], parts?(model) } after drawing into the kit.
export const BODIES = {
  // The concept-sheet wedge.
  vector(K) {
    K.loft([trap(-1.9, 1.15, 0.6, 0.25, 0.7), trap(0.4, 1.3, 0.5, 0.25, 0.55), trap(2.25, 0.55, 0.05, 0.25, 1)], { accentTop: [1] });
    return { thrusters: [[-0.45, 0.4, -2.0], [0.45, 0.4, -2.0]], tails: [[-0.72, 0.55, -1.93], [0.72, 0.55, -1.93]], glow: [2.8, 4.4] };
  },
  // A long low dart with a tall fin and scan lines down its flanks.
  scanline(K) {
    const R = [trap(-2.3, 0.9, 0.5, 0.25, 0.75), trap(-0.6, 1.15, 0.45, 0.25, 0.6), trap(1.2, 0.75, 0.28, 0.25, 0.6), trap(3.0, 0.14, 0.04, 0.28, 1)];
    K.loft(R, { accentTop: [2] });
    for (const t of [0.3, 0.62]) {
      for (const [a, b] of [[1, 2], [0, 3]]) {
        const pts = R.slice(0, 3).map((r) => [r.pts[a][0] + (r.pts[b][0] - r.pts[a][0]) * t, r.pts[a][1] + (r.pts[b][1] - r.pts[a][1]) * t, r.z]);
        K.path(K.A, pts);
      }
    }
    const fin = [[0, 0.72, -2.2], [0, 1.75, -2.65], [0, 0.66, -0.9]];
    K.path(K.A, fin, true);
    K.tri(K.AT, ...fin);
    return { thrusters: [[-0.35, 0.45, -2.35], [0.35, 0.45, -2.35]], tails: [[-0.55, 0.58, -2.33], [0.55, 0.58, -2.33]], glow: [2.4, 5.4] };
  },
  // A faceted hexagonal pod: short, tall and chunky.
  polygon(K) {
    K.loft([poly(-1.7, 6, 0.75, 0.78, 0.55), poly(-0.7, 6, 1.25, 0.78, 0.5), poly(0.8, 6, 1.2, 0.74, 0.48), poly(1.9, 6, 0.55, 0.6, 0.5), poly(2.35, 6, 0.12, 0.55, 0.5)], { accentRings: [1, 2] });
    return { thrusters: [[-0.42, 0.7, -1.75], [0.42, 0.7, -1.75]], tails: [[0, 1.05, -1.72]], glow: [2.8, 4.0] };
  },
  // Twin pontoons with a cockpit slung between them.
  chroma(K) {
    for (const s of [-1, 1]) {
      const x = s * 1.0;
      K.loft([trap(-2.0, 0.34, 0.42, 0.22, 0.8, x), trap(1.0, 0.36, 0.38, 0.22, 0.75, x), trap(2.35, 0.1, 0.06, 0.26, 1, x)], { accentTop: [0] });
    }
    K.loft([trap(-1.1, 0.5, 0.48, 0.5, 0.65), trap(0.8, 0.42, 0.42, 0.5, 0.55), trap(1.7, 0.12, 0.08, 0.55, 1)]);
    for (const z of [-1.3, 0.5]) {
      K.seg(K.A, [-0.66, 0.62, z], [-0.5, 0.75, z]);
      K.seg(K.A, [0.66, 0.62, z], [0.5, 0.75, z]);
      K.seg(K.L, [-0.66, 0.5, z], [0.66, 0.5, z]);
    }
    return { thrusters: [[-1.0, 0.42, -2.05], [1.0, 0.42, -2.05]], tails: [[-1.0, 0.55, -2.02], [1.0, 0.55, -2.02]], glow: [3.2, 4.4] };
  },
  // Stair-stepped voxels: a car drawn on a pixel grid.
  raster(K) {
    K.box(2.5, 0.36, 4.0, 0, 0.43, 0);
    K.box(1.9, 0.34, 2.6, 0, 0.78, -0.55);
    K.box(1.2, 0.3, 1.3, 0, 1.1, -0.95, true);
    K.box(0.9, 0.26, 0.5, 0, 0.38, 2.25);
    for (const s of [-1, 1]) K.box(0.36, 0.36, 0.36, s * 1.45, 0.43, -1.6, true);
    return { thrusters: [[-0.5, 0.5, -2.0], [0.5, 0.5, -2.0]], tails: [[-0.85, 0.8, -1.86], [0.85, 0.8, -1.86]], glow: [2.8, 4.4] };
  },
  // A wedge sliced into three, its slices slipping out of register.
  glitch(K, parts) {
    const slices = [];
    const spans = [[-1.9, -0.55, 1.15, 1.25, 0.6, 0.55], [-0.55, 0.9, 1.25, 1.1, 0.55, 0.42], [0.9, 2.25, 1.1, 0.55, 0.42, 0.05]];
    for (const [z0, z1, w0, w1, h0, h1] of spans) {
      const k = new Kit();
      k.loft([trap(z0, w0, h0, 0.25, 0.7), trap(z1, w1, h1, 0.25, 0.65)], { accentTop: [0] });
      slices.push(k);
    }
    parts.slices = slices;
    for (const [x, y, z, s] of [[1.7, 0.9, 0.2, 0.3], [-1.6, 1.1, -0.9, 0.24], [0.4, 1.4, -1.5, 0.2]]) {
      const tri = [[x - s, y, z], [x + s, y + s * 0.4, z + s], [x, y + s * 1.2, z - s * 0.5]];
      parts.shards ||= [];
      parts.shards.push(tri);
    }
    return { thrusters: [[-0.45, 0.4, -2.0], [0.45, 0.4, -2.0]], tails: [[-0.72, 0.55, -1.93], [0.72, 0.55, -1.93]], glow: [2.8, 4.4] };
  },

  // SECRET: Dash, LAST LINE's stick-figure hero, surfing a pencil (the Kid's line got him out of the finale too).
  dash(K, parts) {
    K.loft([poly(-1.9, 6, 0.38, 0.42, 1, 0, 0), poly(-1.55, 6, 0.38, 0.42, 1, 0, 0), poly(-1.35, 6, 0.38, 0.42, 1, 0, 0), poly(1.45, 6, 0.38, 0.42, 1, 0, 0), poly(2.05, 6, 0.12, 0.42, 1, 0, 0), poly(2.3, 6, 0.02, 0.42, 1, 0, 0)], { accentRings: [0, 1, 2] });
    // the figure, riding square to the camera so the chase view reads him: wide stance, arms out for balance
    const L = K.L;
    const head = [0, 2.6, 0.12];
    K.circle(L, head, 0.3, 'xy', 18);
    K.circle(L, head, 0.3, 'yz', 18);
    const neck = [0, 2.27, 0.1], hip = [0, 1.48, 0];
    K.path(L, [neck, hip]);
    for (const sx of [-1, 1]) {
      K.path(L, [hip, [sx * 0.34, 1.08, 0.08], [sx * 0.5, 0.8, 0]]);
      K.path(L, [[0, 2.1, 0.08], [sx * 0.5, 1.95, 0.12], [sx * 0.95, 2.12, 0.05]]);
    }
    // the headband: a ring and two tails that stream out behind
    K.circle(K.B, [0, 2.68, 0.12], 0.31, 'xz', 14);
    parts.ribbons = [[0.07, 2.68, -0.18], [-0.07, 2.65, -0.18]];
    return { thrusters: [[-0.16, 0.3, -1.95], [0.16, 0.3, -1.95]], tails: [], glow: [1.4, 4.6] };
  },

  // SECRET: Absurd Combat Racing's GREAT WEDGE: stainless shark truck, Captain Finn Razorback at the wheel.
  greatwedge(K, parts) {
    K.loft([trap(-2.0, 1.15, 0.75, 0.95, 0.75), trap(0.1, 1.25, 0.7, 0.95, 0.6), trap(2.35, 0.75, 0.22, 0.95, 0.9)], { accentTop: [0] });
    // chassis rails down to the axles
    for (const s of [-1, 1]) {
      K.seg(K.L, [s * 0.9, 0.95, -1.35], [s * 0.9, 0.62, -1.35]);
      K.seg(K.L, [s * 0.9, 0.95, 1.35], [s * 0.9, 0.62, 1.35]);
    }
    K.seg(K.L, [-1.0, 0.62, -1.35], [1.0, 0.62, -1.35]);
    K.seg(K.L, [-1.0, 0.62, 1.35], [1.0, 0.62, 1.35]);
    // dorsal fin
    const fin = [[0, 1.68, -0.4], [0, 2.75, -1.25], [0, 1.68, -1.6]];
    K.path(K.A, fin, true);
    K.tri(K.AT, ...fin);
    // teeth across the nose, and an eye each side
    const teeth = [];
    for (let k = 0; k <= 8; k++) teeth.push([-0.62 + k * 0.155, k % 2 ? 1.0 : 1.2, 2.36]);
    K.path(K.A, teeth);
    for (const s of [-1, 1]) K.circle(K.A, [s * 1.0, 1.42, 1.25], 0.12, 'yz', 10);
    parts.wheels = [[-1.25, -1.35], [1.25, -1.35], [-1.25, 1.35], [1.25, 1.35]];
    return { thrusters: [[-0.55, 1.35, -2.05], [0.55, 1.35, -2.05]], tails: [[-0.8, 1.45, -2.02], [0.8, 1.45, -2.02]], glow: [3.2, 4.8] };
  },
};

// ------------------------------------------------------------------ assembly
// A soft rounded pool of light for the underglow, shared by every car.
let _glowTex = null;
function glowTexture() {
  if (_glowTex || typeof document === 'undefined') return _glowTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 64, 2, 32, 64, 31);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.setTransform(1, 0, 0, 2, 0, -64); // stretch the circle into an oval along the car
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}
export function buildBody(bodyId, paint, glowColor) {
  const K = new Kit();
  const parts = {};
  const spec = (BODIES[bodyId] || BODIES.vector)(K, parts);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, ...add });
  const accentLineMat = new THREE.LineBasicMaterial({ color: paint, ...add });
  const accentMat = new THREE.MeshBasicMaterial({ color: paint, side: THREE.DoubleSide, opacity: 0.3, ...add });
  const hullMat = new THREE.MeshBasicMaterial({ color: HULL, side: THREE.DoubleSide });
  const mk = (kit, into) => {
    if (kit.L.length) into.add(new THREE.LineSegments(lineGeo(kit.L), lineMat));
    if (kit.A.length) into.add(new THREE.LineSegments(lineGeo(kit.A), accentLineMat));
    if (kit.AT.length) into.add(new THREE.Mesh(lineGeo(kit.AT), accentMat));
    if (kit.H.length) {
      const h = new THREE.Mesh(lineGeo(kit.H), hullMat);
      h.userData.hull = true;
      into.add(h);
    }
  };
  mk(K, body);
  const model = { root, body, lineMat, accentLineMat, accentMat, hullMat, flames: [], anim: [] };
  if (K.B.length) {
    model.bandMat = new THREE.LineBasicMaterial({ color: 0xff2a4a, ...add });
    body.add(new THREE.LineSegments(lineGeo(K.B), model.bandMat));
  }
  // glitch: slices that slip sideways now and then, and shards that flicker around the car
  if (parts.slices) {
    const groups = parts.slices.map((k) => {
      const g = new THREE.Group();
      mk(k, g);
      body.add(g);
      return g;
    });
    const sh = new Kit();
    for (const t of parts.shards) {
      sh.path(sh.A, t, true);
      sh.tri(sh.AT, ...t);
    }
    const shardGroup = new THREE.Group();
    mk(sh, shardGroup);
    body.add(shardGroup);
    let next = 0;
    model.anim.push((dt, t) => {
      if (t < next) return;
      const burst = Math.random() < 0.35;
      next = t + (burst ? 0.06 : 0.25 + Math.random() * 0.6);
      groups.forEach((g, k) => (g.position.x = burst ? (Math.random() - 0.5) * 0.35 * (k + 1) * 0.6 : 0));
      shardGroup.visible = Math.random() < 0.8;
      shardGroup.position.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2, 0);
    });
  }
  // Dash's headband tails, streaming back and waving with speed
  if (parts.ribbons) {
    const n = 6;
    const arr = new Float32Array(parts.ribbons.length * (n - 1) * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    body.add(new THREE.LineSegments(g, model.bandMat));
    model.anim.push((dt, t, r) => {
      const sp = Math.min(1, Math.abs(r?.speed || 0) / 40);
      let o = 0;
      parts.ribbons.forEach(([x, y, z], q) => {
        let prev = [x, y, z];
        for (let k = 1; k < n; k++) {
          const f = k / (n - 1);
          const cur = [x + Math.sin(t * 11 + k * 1.3 + q * 2) * 0.08 * f * (0.4 + sp), y - f * (0.45 - sp * 0.35) + Math.sin(t * 9 + k + q) * 0.05 * f, z - f * (0.35 + sp * 0.6)];
          arr.set(prev, o);
          arr.set(cur, o + 3);
          o += 6;
          prev = cur;
        }
      });
      g.attributes.position.needsUpdate = true;
    });
  }
  // GREAT WEDGE's monster wheels: two rims, spokes and treads, spinning with speed
  if (parts.wheels) {
    const wk = new Kit();
    const R = 0.62;
    for (const dx of [-0.17, 0.17]) wk.circle(wk.L, [dx, 0, 0], R, 'yz', 14);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const y = Math.sin(a) * R, z = Math.cos(a) * R;
      wk.seg(wk.L, [-0.17, y, z], [0.17, y, z]);
      if (k % 2 === 0) wk.seg(wk.A, [0.18, 0, 0], [0.18, y * 0.6, z * 0.6]);
    }
    const wheels = parts.wheels.map(([x, z]) => {
      const g = new THREE.Group();
      mk(wk, g);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.96, R * 0.96, 0.3, 14), hullMat);
      disc.rotation.z = Math.PI / 2;
      g.add(disc);
      g.position.set(x, 0.62 - 0.35, z);
      body.add(g);
      return g;
    });
    model.anim.push((dt, t, r) => {
      const w = ((r?.speed || 0) / R) * dt;
      for (const g of wheels) g.rotation.x += w;
    });
  }
  // tail lights, thrusters and underglow
  model.tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a4a });
  for (const [x, y, z] of spec.tails) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.06), model.tailMat);
    t.position.set(x, y, z);
    body.add(t);
  }
  model.flameMat = new THREE.MeshBasicMaterial({ color: 0x8ac8ff, ...add });
  for (const [x, y, z] of spec.thrusters) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 8), model.flameMat);
    f.rotation.x = -Math.PI / 2;
    f.position.set(x, y, z - 0.6);
    f.userData.z0 = z;
    body.add(f);
    model.flames.push(f);
  }
  model.glowMat = new THREE.MeshBasicMaterial({ color: glowColor ?? paint, opacity: 0.35, map: glowTexture(), ...add });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(spec.glow[0], spec.glow[1]), model.glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  root.add(glow);
  model.glow = glow;
  model.spec = spec;
  return model;
}

// A light streak behind the car: a ribbon through recent thruster positions, fading out at the tail.
// Twin exhaust streaks, one from each thruster, white-hot at the nozzle and fading to the trail colour.
export class Trail {
  constructor(color, n = 18, sep = 0.55) {
    this.n = n;
    this.sep = sep;
    this.pts = [];
    const g = new THREE.BufferGeometry();
    const V = n * 2 * 2;
    this.pos = new Float32Array(V * 3);
    this.col = new Float32Array(V * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const idx = [];
    for (let st = 0; st < 2; st++) {
      const base = st * n * 2;
      for (let k = 0; k < n - 1; k++) {
        const a = base + k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    g.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.color = new THREE.Color(color);
    this.acc = 0;
  }
  setColor(c) {
    this.color.set(c);
  }
  // p: world position at the tail, rx/rz: the car's right vector, power 0..1 (speed), on: draw at all
  update(dt, p, rx, rz, power, on) {
    this.acc += dt;
    if (this.acc > 1 / 40 || !this.pts.length) {
      this.acc = 0;
      this.pts.unshift({ x: p.x, y: p.y, z: p.z, rx, rz, w: 0.05 + power * 0.07, on });
      if (this.pts.length > this.n) this.pts.pop();
    } else {
      Object.assign(this.pts[0], { x: p.x, y: p.y, z: p.z, rx, rz });
    }
    const P = this.pos, C = this.col, c = this.color;
    for (let st = 0; st < 2; st++) {
      const off = st ? this.sep : -this.sep;
      for (let k = 0; k < this.n; k++) {
        const q = this.pts[Math.min(k, this.pts.length - 1)];
        const u = k / (this.n - 1);
        const f = (1 - u) ** 1.4 * (q.on ? 0.85 : 0) * Math.min(1, power * 1.4);
        const hot = Math.max(0, 1 - u * 4); // white-hot right behind the nozzle
        const w = q.w * (1 - u * 0.6);
        for (let s = 0; s < 2; s++) {
          const o = ((st * this.n + k) * 2 + s) * 3;
          const side = off + (s ? w : -w);
          P[o] = q.x + q.rx * side;
          P[o + 1] = q.y;
          P[o + 2] = q.z + q.rz * side;
          C[o] = (c.r + (1 - c.r) * hot * 0.7) * f;
          C[o + 1] = (c.g + (1 - c.g) * hot * 0.7) * f;
          C[o + 2] = (c.b + (1 - c.b) * hot * 0.7) * f;
        }
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}
