// Every craft is two vehicles locked together. The red half is the BLADE, a narrow enclosed monowheel: a faceted
// fuselage with a nose cowl, a canopy over the wheel housing and a fin. The blue half is the SKIMMER, a low hover
// deck in two halves with a channel down the middle where the Blade docks, flowing flanks and ducted fans in the
// tail. Docked, the Blade's cowl is the car's nose spike, its canopy the cockpit and its fin the tail fin, so the
// pair reads as one car. Shift to RED and the deck unlatches, splits and falls away, leaving the bike; shift to
// BLUE and the Blade folds flat into the channel and a cover slides over it, leaving the hovercraft.

import * as THREE from '../../vendor/three.js';
import { BOTH, RED, BLUE, COLORS } from '../world/shift.js';

// What each form does. Read by Racer.update.
export const FORMS = {
  [BOTH]: { halfW: 1.2, cling: 0, glide: 0, water: 1.4 },
  // narrow, and the wheel holds the road over crests, down drops and up a wall-run
  [RED]: { halfW: 0.55, cling: 3.2, glide: 0, water: 2.2 },
  // wide and light: a real glide off anything it leaves at speed, and no drag on water
  [BLUE]: { halfW: 1.4, cling: 0, glide: 1, water: 0 },
};

// Each craft's pair: deck plan (nose width, tail width, length), deck height, fans, wheel size and spokes, fin.
const VARIANT = {
  vector: { nose: 0.55, tail: 1.25, len: 4.2, h: 0.42, fans: 2, r: 0.62, spokes: 8, fin: 'swept' },
  scanline: { nose: 0.35, tail: 1.1, len: 4.6, h: 0.36, fans: 2, r: 0.66, spokes: 6, fin: 'tall' },
  polygon: { nose: 0.9, tail: 1.3, len: 3.9, h: 0.46, fans: 2, r: 0.58, spokes: 10, fin: 'twin' },
  chroma: { nose: 0.6, tail: 1.35, len: 4.3, h: 0.4, fans: 1, r: 0.62, spokes: 12, fin: 'swept' },
  raster: { nose: 0.45, tail: 1.0, len: 4.8, h: 0.34, fans: 2, r: 0.7, spokes: 6, fin: 'tall' },
  glitch: { nose: 0.8, tail: 1.2, len: 4.0, h: 0.44, fans: 1, r: 0.6, spokes: 8, fin: 'twin' },
  dash: { nose: 0.3, tail: 0.8, len: 4.4, h: 0.3, fans: 1, r: 0.6, spokes: 6, fin: 'swept' },
  greatwedge: { nose: 1.0, tail: 1.45, len: 4.6, h: 0.55, fans: 2, r: 0.7, spokes: 10, fin: 'tall' },
};

const SLOT = 0.42; // the channel's half width
const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
// a fixed key light, front-top-right, so every panel takes its own brightness (there are no lights in the scene)
const LIGHT = new THREE.Vector3(0.35, 0.85, 0.4).normalize();
const _n = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _c = new THREE.Color();

// Lines and glass for one piece: its own materials, so each piece fades on its own.
//   L: lens-coloured lines   R: brighter rim lines (silhouette edges)   A: paint-coloured accents (light strips)
//   F: body glass (flat-shaded, vertex colours)   C: canopy glass (lighter)
class Piece {
  constructor(color, glass, canopy) {
    this.L = [];
    this.R = [];
    this.A = [];
    this.F = [];
    this.FC = [];
    this.C = [];
    this.glass = new THREE.Color(glass);
    this.canopy = new THREE.Color(canopy || glass);
    this.lineMat = new THREE.LineBasicMaterial({ color: _c.set(color).multiplyScalar(1.25).getHex(), ...ADD });
    this.rimMat = new THREE.LineBasicMaterial({ color: _c.set(color).lerp(new THREE.Color(0xffffff), 0.65).getHex(), ...ADD });
    this.accentMat = new THREE.LineBasicMaterial({ color: 0xffffff, ...ADD });
    // the body panels are opaque (a see-through fill double-blends along every triangle edge and reads as a mesh);
    // they only go transparent while a piece fades out
    this.fillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    this.canopyMat = new THREE.MeshBasicMaterial({ color: canopy || glass, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    this.alpha = 1;
  }
  seg(arr, a, b) {
    arr.push(...a, ...b);
  }
  loop(arr, pts) {
    for (let i = 0; i < pts.length; i++) this.seg(arr, pts[i], pts[(i + 1) % pts.length]);
  }
  // a shaded panel: its brightness from how its face meets the key light (one shade for the whole panel, so a
  // bent quad doesn't split into two facets)
  tri(a, b, c, k) {
    this.F.push(...a, ...b, ...c);
    const g = this.glass;
    for (let q = 0; q < 3; q++) this.FC.push(g.r * k, g.g * k, g.b * k);
  }
  shade(a, b, c) {
    _e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_e1, _e2);
    return _n.lengthSq() > 1e-9 ? 0.35 + 0.8 * Math.abs(_n.normalize().dot(LIGHT)) : 0.6;
  }
  quad(a, b, c, d) {
    const k = this.shade(a, c, [b[0] - d[0] + a[0], b[1] - d[1] + a[1], b[2] - d[2] + a[2]]);
    this.tri(a, b, c, k);
    this.tri(a, c, d, k);
  }
  cquad(a, b, c, d) {
    this.C.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  // a flat end face over a ring
  cap(ring) {
    const k = this.shade(ring[0], ring[1], ring[2]);
    for (let v = 1; v < ring.length - 1; v++) this.tri(ring[0], ring[v], ring[v + 1], k);
  }
  // Strings cross-section rings (arrays of [x, y, z], same length) along the piece: a closed ring of lines at each
  // section, lines along the length at each vertex (rim lines for the vertices in `rim`), and shaded panels
  // between sections (none for the segment indices in `open`, canopy glass for those in `canopy`).
  loft(rings, { rim = [], open = [], canopy = [], along = null, ringMat = null } = {}) {
    const n = rings[0].length;
    rings.forEach((ring, k) => {
      const mat = ringMat ? ringMat(k) : this.L;
      if (mat) this.loop(mat, ring);
    });
    for (let k = 0; k < rings.length - 1; k++) {
      const P = rings[k];
      const Q = rings[k + 1];
      for (let v = 0; v < n; v++) {
        if (!along || along.includes(v)) this.seg(rim.includes(v) ? this.R : this.L, P[v], Q[v]);
        if (open.includes(v)) continue;
        const w = (v + 1) % n;
        if (canopy.includes(v)) this.cquad(P[v], P[w], Q[w], Q[v]);
        else this.quad(P[v], P[w], Q[w], Q[v]);
      }
    }
  }
  build() {
    const g = new THREE.Group();
    const geo = (p) => {
      const q = new THREE.BufferGeometry();
      q.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      return q;
    };
    if (this.F.length) {
      const q = geo(this.F);
      q.setAttribute('color', new THREE.Float32BufferAttribute(this.FC, 3));
      g.add(new THREE.Mesh(q, this.fillMat));
    }
    if (this.C.length) g.add(new THREE.Mesh(geo(this.C), this.canopyMat));
    if (this.L.length) g.add(new THREE.LineSegments(geo(this.L), this.lineMat));
    if (this.R.length) g.add(new THREE.LineSegments(geo(this.R), this.rimMat));
    if (this.A.length) g.add(new THREE.LineSegments(geo(this.A), this.accentMat));
    return g;
  }
  setOpacity(k) {
    k *= this.alpha;
    this.lineMat.opacity = k;
    this.rimMat.opacity = k;
    this.accentMat.opacity = k;
    if (this.wheelMat) this.wheelMat.opacity = k;
    const fading = k < 0.995;
    this.fillMat.transparent = fading;
    this.fillMat.depthWrite = !fading;
    this.fillMat.opacity = k;
    this.canopyMat.opacity = 0.6 * k;
  }
}

const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ the Blade
// The bike's belly line along z (the deck's shelf runs just under it where the channel is closed).
function bladeBelly(z) {
  const K = [[2.45, 0.5], [1.75, 0.4], [1.05, 0.26], [0.45, 0.22], [-0.3, 0.22], [-0.95, 0.3], [-1.5, 0.42], [-1.75, 0.55]];
  if (z >= K[0][0]) return K[0][1];
  for (let k = 0; k < K.length - 1; k++) if (z <= K[k][0] && z >= K[k + 1][0]) return lerp(K[k][1], K[k + 1][1], (K[k][0] - z) / (K[k][0] - K[k + 1][0]));
  return K[K.length - 1][1];
}

// A hexagonal fuselage ring: a keel, two chines, a ridge.
function ring(z, w, yb, yt) {
  const y1 = lerp(yb, yt, 0.3);
  const y2 = lerp(yb, yt, 0.64);
  return [[0, yb, z], [w, y1, z], [w, y2, z], [0, yt, z], [-w, y2, z], [-w, y1, z]];
}

// The bike: a faceted fuselage lofted from the nose spike to the tail, tall over the wheel housing, with a canopy
// riding its ridge, the wheel visible through the glass of the housing, and a fin.
function buildBlade(v, paint) {
  const H = new Piece(COLORS.redHot, 0x560a1e, 0xa8203c);
  const r = v.r;
  const top = 2 * r + 0.1; // the housing clears the wheel
  const cy = r + 0.02;
  const Z = [2.45, 1.75, 1.05, 0.45, -0.3, -0.95, -1.5, -1.75];
  const W = [0.04, 0.2, 0.34, 0.4, 0.4, 0.32, 0.16, 0.05];
  const T = [0.58, 0.72, 0.92, top, top + 0.02, top - 0.3, 0.98, 0.78];
  const rings = Z.map((z, k) => ring(z, W[k], bladeBelly(z), T[k]));
  // the top panels between the cowl and the housing are the canopy
  H.loft(rings, { rim: [1, 5], ringMat: (k) => (k === 2 || k === 4 ? H.A : H.L) });
  H.cap(rings[rings.length - 1]);
  // canopy: a glass blister on the ridge, outlined in paint
  const can = [[0, T[2] + 0.01, 1.15], [0.22, lerp(T[2], top, 0.6), 0.7], [0.26, top - 0.02, 0.15], [0.2, top - 0.04, -0.45], [0, top - 0.02, -0.7]];
  const canL = can.map(([x, y, z]) => [-x, y, z]);
  H.loop(H.A, [...can, ...canL.slice(1, -1).reverse()]);
  for (let k = 0; k < can.length - 1; k++) H.cquad(can[k], can[k + 1], canL[k + 1], canL[k]);
  H.seg(H.A, can[1], canL[1]);
  H.seg(H.A, can[3], canL[3]);
  // the axle pin through the housing
  H.seg(H.A, [-0.46, cy, -0.25], [0.46, cy, -0.25]);
  // tail: a light bar, and the exhaust slot under it
  H.seg(H.A, [-0.2, 0.82, -1.68], [0.2, 0.82, -1.68]);
  H.seg(H.A, [-0.12, 0.66, -1.7], [0.12, 0.66, -1.7]);
  // fin
  const fy = T[5] - 0.02;
  const fin = (pts) => {
    H.loop(H.R, pts);
    for (let k = 1; k < pts.length - 1; k++) H.cquad(pts[0], pts[k], pts[k + 1], pts[k + 1]);
  };
  if (v.fin === 'tall') fin([[0, fy, -0.9], [0, fy + 0.72, -1.75], [0, fy + 0.6, -2.0], [0, 0.95, -1.6]]);
  else if (v.fin === 'twin') for (const x of [-0.22, 0.22]) fin([[x, fy, -0.95], [x * 2.2, fy + 0.5, -1.7], [x * 2.0, fy + 0.4, -1.9], [x, 0.98, -1.5]]);
  else fin([[0, fy, -0.75], [0, fy + 0.4, -1.65], [0, fy + 0.3, -2.0], [0, 0.95, -1.6]]);
  H.accentMat.color.set(paint);
  const g = H.build();
  // the wheel spins on its own; drawn after the housing glass so it shows through it
  const wheel = new THREE.Group();
  wheel.position.set(0, cy, -0.25);
  const w = [];
  const N = 28;
  for (const x of [-0.14, 0.14]) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const b = ((i + 1) / N) * Math.PI * 2;
      w.push(x, Math.sin(a) * r, Math.cos(a) * r, x, Math.sin(b) * r, Math.cos(b) * r);
    }
  }
  for (let i = 0; i < v.spokes; i++) {
    const a = (i / v.spokes) * Math.PI * 2;
    w.push(0, 0, 0, 0, Math.sin(a) * r * 0.94, Math.cos(a) * r * 0.94);
    w.push(-0.14, Math.sin(a) * r, Math.cos(a) * r, 0.14, Math.sin(a) * r, Math.cos(a) * r);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(w, 3));
  H.wheelMat = H.lineMat.clone();
  wheel.add(new THREE.LineSegments(wg, H.wheelMat));
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1, 6, 32), new THREE.MeshBasicMaterial({ color: 0x3a0610, transparent: true, opacity: 0.9, depthWrite: false }));
  tyre.rotation.y = Math.PI / 2;
  wheel.add(tyre);
  // the wheel ignores depth, so it shows through the housing's glass
  wheel.traverse((o) => {
    o.renderOrder = 9;
    if (o.material) o.material.depthTest = false;
  });
  g.add(wheel);
  return { g, H, wheel, r, tyreMat: tyre.material };
}

// ------------------------------------------------------------------ the Skimmer
// One side of the deck (s = -1 left, +1 right): a loft of half-sections from the nose tip to the tail. Each
// section is a closed six-point ring: skirt and outer flank (chamfered, with a flare at mid height), the top deck,
// then the inner step down to the shelf along the channel. The channel is open where the wheel sits and closed
// (the shelf meets the middle under the Blade's belly) at the nose and tail, and the top edge rises into a sill
// round the cockpit. Returns the fan duct it carries, if any.
function deckSide(H, v, s) {
  const zf = v.len * 0.5 + 0.15;
  const zb = -v.len * 0.5 + 0.1;
  const y0 = 0.12;
  const P = (x, y, z) => [x * s, y, z];
  const Z = [zf, zf - 0.5, zf - 1.1, zf - 1.7, 0.1, -0.5, -1.1, zb + 0.5, zb];
  const rings = Z.map((z) => {
    const u = (zf - z) / (zf - zb); // 0 at the nose, 1 at the tail
    const plan = u < 0.3 ? lerp(0.1, v.nose, u / 0.3) : lerp(v.nose, v.tail, Math.min(1, (u - 0.3) / 0.55));
    const xo = z === zf ? 0.14 : SLOT + plan;
    const h = v.h * lerp(0.7, 1.05, u);
    const y1 = y0 + h;
    const ym = y0 + h * 0.42;
    const flare = z === zf ? 0.02 : 0.14;
    const open = z < 0.6 && z > -1.25; // the wheel's gap in the channel
    const xi = open ? SLOT : z === zf ? 0.02 : 0.04;
    const yi = open ? y0 + 0.02 : Math.min(y1 - 0.02, bladeBelly(z) - 0.05);
    const cockpit = z < 1.4 && z > -0.8;
    const sill = cockpit ? 0.2 : 0;
    const xs = SLOT + (cockpit ? 0.26 : 0.12);
    return [P(xi, y0, z), P(xo, y0, z), P(xo + flare, ym, z), P(xo - 0.16, y1, z), P(xs, y1 + sill, z), P(xi, yi, z)];
  });
  // the inner faces (shelf step, inner wall) are glass too: they're what you see as the halves slide away.
  // Lines only along the flank edges and at every other section, so the deck reads as panels, not a mesh.
  H.loft(rings, { rim: [2, 3], along: [1, 2, 3, 4], ringMat: (k) => (k % 2 === 0 || k === rings.length - 1 ? H.L : null) });
  H.cap(rings[rings.length - 1]);
  // light strips: along the top edge and the skirt, in the craft's paint
  const strip = (pick, dy) => {
    for (let k = 1; k < rings.length - 1; k++) {
      const a = pick(rings[k]);
      const b = pick(rings[k + 1]);
      H.seg(H.A, [a[0], a[1] + dy, a[2]], [b[0], b[1] + dy, b[2]]);
    }
  };
  strip((rg) => rg[3], 0.02);
  strip((rg) => rg[1], -0.03);
  // the latches that hold the Blade: short bars across the channel edge
  for (const z of [0.9, -0.35]) H.seg(H.A, P(SLOT + 0.02, y0 + v.h * 0.9, z), P(SLOT - 0.2, y0 + v.h * 0.9, z));
  // fans: a duct on each tail corner, or one big one in the middle (drawn with the right half)
  if (v.fans === 1 && s < 0) return null;
  const two = v.fans === 2;
  const fx = two ? (SLOT + v.tail * 0.55) * s : 0;
  const R = two ? 0.36 : 0.5;
  const y1b = y0 + v.h * 1.05;
  const cy = two ? y1b + R * 0.35 : y1b + 0.18;
  const z0 = two ? zb : zb - 0.4;
  const z1 = z0 + 0.6;
  const duct = (z) => {
    const out = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      out.push([fx + Math.cos(a) * R, cy + Math.sin(a) * R, z]);
    }
    return out;
  };
  const d0 = duct(z0);
  const d1 = duct(z1);
  H.loop(H.R, d0);
  H.loop(H.L, d1);
  for (let i = 0; i < 18; i++) {
    if (i % 3 === 0) H.seg(H.L, d0[i], d1[i]);
    H.quad(d0[i], d0[(i + 1) % 18], d1[(i + 1) % 18], d1[i]);
  }
  // a glow ring just inside the mouth, in the paint
  H.loop(H.A, duct(z0 + 0.04).map(([x, y, z]) => [fx + (x - fx) * 0.8, cy + (y - cy) * 0.8, z]));
  return { x: fx, y: cy, z: z0 + 0.1, r: R };
}

function buildDeck(v, paint) {
  const halves = [];
  const fans = [];
  for (const s of [-1, 1]) {
    const H = new Piece(COLORS.blueHot, 0x07203f);
    const fan = deckSide(H, v, s);
    H.accentMat.color.set(paint);
    const g = H.build();
    if (fan) {
      // spinning blades inside the duct
      const blades = new THREE.Group();
      blades.position.set(fan.x, fan.y, fan.z);
      const p = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        p.push(0, 0, 0, Math.cos(a) * fan.r * 0.9, Math.sin(a) * fan.r * 0.9, 0);
      }
      const q = new THREE.BufferGeometry();
      q.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      blades.add(new THREE.LineSegments(q, H.lineMat));
      g.add(blades);
      fans.push(blades);
    }
    halves.push({ g, H, s });
  }
  // the cover that slides over the channel once the Blade has folded into it: a low spine down the middle
  const C = new Piece(COLORS.blueHot, 0x07203f);
  const y1 = 0.12 + v.h * 0.9;
  const Z = [v.len * 0.5 - 0.3, 1.3, 0.6, -0.1, -0.8, -1.4, -v.len * 0.5 + 0.2];
  const rings = Z.map((z) => {
    const hump = 0.4 * Math.max(0, Math.sin(Math.PI * (1.6 - z) / 2.6)) ** 1.2;
    return [[-SLOT, y1, z], [-SLOT * 0.5, y1 + hump, z], [SLOT * 0.5, y1 + hump, z], [SLOT, y1, z]];
  });
  // the hump's top is a canopy pane: the Skimmer's own low cockpit
  C.loft(rings, { rim: [0, 2], open: [3], canopy: [1] });
  for (let k = 0; k < rings.length - 1; k++) C.seg(C.A, [0, rings[k][1][1] + 0.02, rings[k][1][2]], [0, rings[k + 1][1][1] + 0.02, rings[k + 1][1][2]]);
  C.accentMat.color.set(paint);
  const cover = { g: C.build(), H: C };
  return { halves, fans, cover };
}

// Builds the pair onto a car model (buildBody's result); the old single hull is hidden. `alpha` dims the whole
// pair (ghosts).
export function addForms(model, carId, paint, alpha = 1) {
  const v = VARIANT[carId] || VARIANT.vector;
  const pair = new THREE.Group();
  const deck = buildDeck(v, paint);
  const blade = buildBlade(v, paint);
  for (const h of deck.halves) pair.add(h.g);
  pair.add(deck.cover.g);
  pair.add(blade.g);
  // lines and glass only, none writing depth: drawn after the road's glass so it can't paint over them
  pair.traverse((o) => (o.renderOrder = Math.max(8, o.renderOrder)));
  for (const H of [blade.H, deck.cover.H, ...deck.halves.map((h) => h.H)]) H.alpha = alpha;
  blade.tyreMat.opacity *= alpha;
  model.root.add(pair);
  model.body.visible = false;
  model.pair = { group: pair, deck, blade, k: { red: 1, blue: 1 } };
}

// Per frame: each half eases toward being there (1) or not (0) for the current lens, and moves as it goes:
// the deck halves slide apart and drop away, the Blade folds down into the channel and the cover slides over.
export function updateForms(model, mode, dt, speed, bob, body) {
  const P = model.pair;
  if (!P) return;
  const want = { red: mode !== BLUE ? 1 : 0, blue: mode !== RED ? 1 : 0 };
  for (const key of ['red', 'blue']) {
    let k = P.k[key];
    const t = want[key];
    k += (t - k) * (1 - Math.exp(-(t ? 9 : 7) * dt));
    if (Math.abs(t - k) < 0.005) k = t;
    P.k[key] = k;
  }
  const kr = P.k.red;
  const kb = P.k.blue;
  // the whole pair rides the car's bob, roll and drift yaw
  P.group.position.y = body.position.y - 0.35;
  P.group.rotation.copy(body.rotation);
  // deck halves: out and down as they leave; the Skimmer alone floats a little higher
  const out = 1 - kb;
  const float = mode === BLUE ? 0.12 + Math.sin(bob * 3) * 0.05 : 0;
  for (const h of P.deck.halves) {
    h.g.visible = kb > 0.01;
    h.g.position.set(h.s * out * 1.4, -out * 0.6 + float, -out * 0.8);
    h.g.rotation.z = h.s * out * 0.5;
    h.H.setOpacity(kb);
  }
  // the cover slides forward over the channel as the Blade folds
  const cov = kb * (1 - kr);
  const CG = P.deck.cover.g;
  CG.visible = cov > 0.01;
  CG.position.set(0, float, -(1 - cov) * 1.2);
  P.deck.cover.H.setOpacity(cov);
  // the Blade folds down into the channel, squashing flat, as it leaves; alone, it leans into turns like a bike
  const B = P.blade.g;
  B.visible = kr > 0.01;
  B.position.y = -(1 - kr) * 0.5;
  B.scale.set(1, Math.max(0.05, kr), 1);
  B.rotation.z = body.rotation.z * 2.4 * (1 - kb);
  P.blade.H.setOpacity(kr);
  P.blade.tyreMat.opacity = 0.9 * kr * P.blade.H.alpha;
  P.blade.wheel.rotation.x += (speed / P.blade.r) * dt;
  for (const f of P.deck.fans) f.rotation.z += (6 + Math.abs(speed) * 0.4) * dt;
}
