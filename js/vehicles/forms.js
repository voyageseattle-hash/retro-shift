// Every craft is two vehicles locked together. The red half is the BLADE, a narrow enclosed monowheel: a faceted
// fuselage with a nose cowl, a canopy over the wheel housing, a shouldered tail with a lamp bar and a fin. The
// blue half is the SKIMMER, a low hover deck in two halves with a channel down the middle where the Blade docks,
// flowing flanks, a rear wing and ducted fans sunk into the tail. Docked, the Blade's cowl is the car's nose
// spike, its canopy the cockpit, its tail lamp the middle of the car's tail bar and its fin the tail fin, so the
// pair reads as one car. Shift to RED and the deck unlatches, splits and falls away, leaving the bike; shift to
// BLUE and the Blade folds flat into the channel and a cover slides over it, leaving the hovercraft.
//
// Line weight is brightness: the silhouette (R) is near white, panel edges (L) are the lens colour, details (D)
// are dim, so the car reads at chase-cam distance as a shape first and a drawing second.

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

// Each craft's pair: deck plan (nose width, tail width, length), deck height, fans, wheel size and spokes, fin,
// rear wing (low: a low wing on tall endplates; high: a high wing on pylons; pylon: a mid wing on twin pylons).
// kit: each craft's signature pieces (deckKit / bladeKit), so the eight read apart at a glance and in every form
const VARIANT = {
  vector: { nose: 0.55, tail: 1.25, len: 4.2, h: 0.42, fans: 2, r: 0.62, spokes: 8, fin: 'swept', wing: 'low', kit: 'canard' },
  scanline: { nose: 0.35, tail: 1.1, len: 4.6, h: 0.36, fans: 2, r: 0.66, spokes: 6, fin: 'tall', wing: 'high', kit: 'needle' },
  polygon: { nose: 0.9, tail: 1.3, len: 3.9, h: 0.46, fans: 2, r: 0.58, spokes: 10, fin: 'twin', wing: 'pylon', kit: 'outrigger' },
  chroma: { nose: 0.6, tail: 1.35, len: 4.3, h: 0.4, fans: 1, r: 0.62, spokes: 12, fin: 'swept', wing: 'low', kit: 'halo' },
  raster: { nose: 0.45, tail: 1.0, len: 4.8, h: 0.34, fans: 2, r: 0.7, spokes: 6, fin: 'tall', wing: 'high', kit: 'pixel' },
  glitch: { nose: 0.8, tail: 1.2, len: 4.0, h: 0.44, fans: 1, r: 0.6, spokes: 8, fin: 'twin', wing: 'pylon', kit: 'shards' },
  dash: { nose: 0.3, tail: 0.8, len: 4.4, h: 0.3, fans: 1, r: 0.6, spokes: 6, fin: 'swept', wing: 'low', kit: 'pencil' },
  greatwedge: { nose: 1.0, tail: 1.45, len: 4.6, h: 0.55, fans: 2, r: 0.7, spokes: 10, fin: 'tall', wing: 'high', kit: 'shark' },
};

// the Blade's FLIP: how long the model takes to twist round to its new facing (the physics turns at once)
export const FLIP_TIME = 0.38;
const HUB = new THREE.Vector3(0, 0.66, -0.25);

const SLOT = 0.42; // the channel's half width
const DECK_Y = 0.12; // the skirt's height
const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
// a fixed key light, front-top-right, so every panel takes its own brightness (there are no lights in the scene)
const LIGHT = new THREE.Vector3(0.35, 0.85, 0.4).normalize();
const _n = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _c = new THREE.Color();
const TAU = Math.PI * 2;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Lines and glass for one piece: its own materials, so each piece fades on its own.
//   R: rim lines (the silhouette, near white)   L: lens-coloured panel edges   D: dim details
//   A: paint-coloured accents (light strips)     A2: dim paint (minor lights)
//   E: lamps (filled, paint-and-white)            G: fan cores (filled, brighten with speed)
//   F: body glass (flat-shaded, vertex colours)  C: canopy glass (lighter)
class Piece {
  constructor(color, glass, canopy) {
    this.R = [];
    this.L = [];
    this.D = [];
    this.A = [];
    this.A2 = [];
    this.E = [];
    this.G = [];
    this.F = [];
    this.FC = [];
    this.C = [];
    this.glass = new THREE.Color(glass);
    this.canopy = new THREE.Color(canopy || glass);
    this.rim = _c.set(color).lerp(new THREE.Color(0xffffff), 0.62).getHex();
    this.rimMat = new THREE.LineBasicMaterial({ color: this.rim, ...ADD });
    this.lineMat = new THREE.LineBasicMaterial({ color: _c.set(color).multiplyScalar(0.75).getHex(), ...ADD });
    this.detailMat = new THREE.LineBasicMaterial({ color: _c.set(color).multiplyScalar(0.38).getHex(), ...ADD });
    this.accentMat = new THREE.LineBasicMaterial({ color: 0xffffff, ...ADD });
    this.accent2Mat = new THREE.LineBasicMaterial({ color: 0x808080, ...ADD });
    this.emitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, ...ADD });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, ...ADD });
    this.glowK = 1; // the fan cores brighten with speed
    // the body panels are opaque (a see-through fill double-blends along every triangle edge and reads as a mesh);
    // they only go transparent while a piece fades out
    this.fillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    this.canopyMat = new THREE.MeshBasicMaterial({ color: canopy || glass, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    this.alpha = 1;
  }
  // `hot` is how far the lamps go from the paint toward white
  setPaint(paint, hot = 0.45) {
    this.accentMat.color.set(paint);
    this.accent2Mat.color.set(paint).multiplyScalar(0.45);
    this.emitMat.color.set(paint).lerp(new THREE.Color(0xffffff), hot);
    this.glowMat.color.set(paint).lerp(new THREE.Color(0xffffff), 0.3);
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
  quad(a, b, c, d, k = null) {
    if (k === null) k = this.shade(a, c, [b[0] - d[0] + a[0], b[1] - d[1] + a[1], b[2] - d[2] + a[2]]);
    this.tri(a, b, c, k);
    this.tri(a, c, d, k);
  }
  cquad(a, b, c, d) {
    this.C.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  // a lit panel (a lamp, or a fan core when `glow`)
  lamp(pts, glow = false) {
    const arr = glow ? this.G : this.E;
    for (let v = 1; v < pts.length - 1; v++) arr.push(...pts[0], ...pts[v], ...pts[v + 1]);
  }
  // a flat end face over a ring
  cap(ring, k = null) {
    if (k === null) k = this.shade(ring[0], ring[1], ring[2]);
    for (let v = 1; v < ring.length - 1; v++) this.tri(ring[0], ring[v], ring[v + 1], k);
  }
  // a flat face over `outer` with the hole `inner` cut out of it (both loops in one plane, the hole inside the
  // face): the two loops are zipped together by angle round the hole's centre
  annulus(outer, inner) {
    let cx = 0;
    let cy = 0;
    for (const p of inner) {
      cx += p[0] / inner.length;
      cy += p[1] / inner.length;
    }
    const ang = (p) => Math.atan2(p[1] - cy, p[0] - cx);
    const O = [...outer].sort((a, b) => ang(a) - ang(b));
    const I = [...inner].sort((a, b) => ang(a) - ang(b));
    const n = O.length;
    const m = I.length;
    const aO = (i) => (i < n ? ang(O[i]) : ang(O[0]) + TAU);
    const aI = (i) => (i < m ? ang(I[i]) : ang(I[0]) + TAU);
    const k = this.shade(outer[0], outer[1], outer[2]);
    let io = 0;
    let ii = 0;
    while (io < n || ii < m) {
      if (ii >= m || (io < n && aO(io + 1) <= aI(ii + 1))) {
        this.tri(O[io % n], I[ii % m], O[(io + 1) % n], k);
        io++;
      } else {
        this.tri(O[io % n], I[ii % m], I[(ii + 1) % m], k);
        ii++;
      }
    }
  }
  // Strings cross-section rings (arrays of [x, y, z], same length) along the piece: a closed ring of lines at each
  // section (ringMat(k) picks the array, null for none), lines along the length at each vertex (lineOf(v) picks
  // the array, null for none) and shaded panels between sections (none for the segment indices in `open`,
  // canopy glass for those in `canopy`).
  loft(rings, { lineOf = () => this.L, ringMat = () => this.L, open = [], canopy = [] } = {}) {
    const n = rings[0].length;
    rings.forEach((ring, k) => {
      const mat = ringMat(k);
      if (mat) this.loop(mat, ring);
    });
    for (let k = 0; k < rings.length - 1; k++) {
      const P = rings[k];
      const Q = rings[k + 1];
      for (let v = 0; v < n; v++) {
        const mat = lineOf(v);
        if (mat) this.seg(mat, P[v], Q[v]);
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
    // the lamps draw after the wheel (which ignores depth) so the tyre can't paint over the Blade's tail bar
    for (const [arr, mat] of [[this.E, this.emitMat], [this.G, this.glowMat]]) {
      if (!arr.length) continue;
      const m = new THREE.Mesh(geo(arr), mat);
      m.renderOrder = 10;
      g.add(m);
    }
    for (const [arr, mat] of [[this.D, this.detailMat], [this.L, this.lineMat], [this.R, this.rimMat], [this.A2, this.accent2Mat], [this.A, this.accentMat]]) {
      if (arr.length) g.add(new THREE.LineSegments(geo(arr), mat));
    }
    return g;
  }
  setOpacity(k) {
    k *= this.alpha;
    this.rimMat.opacity = k;
    this.lineMat.opacity = k;
    this.detailMat.opacity = k;
    this.accentMat.opacity = k;
    this.accent2Mat.opacity = k;
    this.emitMat.opacity = k;
    this.glowMat.opacity = k * this.glowK;
    if (this.wheelMat) this.wheelMat.opacity = k;
    const fading = k < 0.995;
    this.fillMat.transparent = fading;
    this.fillMat.depthWrite = !fading;
    this.fillMat.opacity = k;
    this.canopyMat.opacity = 0.6 * k;
  }
}

// a ring of n points round (x, y) in the plane z
function circle(x, y, z, r, n = 18) {
  const out = [];
  for (let i = 0; i < n; i++) out.push([x + Math.cos((i / n) * TAU) * r, y + Math.sin((i / n) * TAU) * r, z]);
  return out;
}

// ------------------------------------------------------------------ the deck's profile (shared by both halves)
const deckFront = (v) => v.len * 0.5 + 0.15;
const deckBack = (v) => -v.len * 0.5 + 0.1;
// The deck's top: low at the nose, rising to the tail (where the fans and the wing sit).
function deckTop(v, z) {
  const u = clamp01((deckFront(v) - z) / (deckFront(v) - deckBack(v)));
  return DECK_Y + v.h * lerp(0.7, 1.3, u);
}

// ------------------------------------------------------------------ the Blade
// The bike's belly line along z (the deck's shelf runs just under it where the channel is closed).
function bladeBelly(z) {
  const K = [[2.45, 0.5], [1.75, 0.4], [1.05, 0.26], [0.45, 0.22], [-0.3, 0.22], [-0.95, 0.3], [-1.5, 0.42], [-1.75, 0.55]];
  if (z >= K[0][0]) return K[0][1];
  for (let k = 0; k < K.length - 1; k++) if (z <= K[k][0] && z >= K[k + 1][0]) return lerp(K[k][1], K[k + 1][1], (K[k][0] - z) / (K[k][0] - K[k + 1][0]));
  return K[K.length - 1][1];
}

// A hexagonal fuselage ring: a keel, two lower chines (wl out), two upper chines (wu out), a ridge.
function ring(z, wl, wu, yb, yt) {
  const y1 = lerp(yb, yt, 0.3);
  const y2 = lerp(yb, yt, 0.64);
  return [[0, yb, z], [wl, y1, z], [wu, y2, z], [0, yt, z], [-wu, y2, z], [-wl, y1, z]];
}

// The bike: a faceted fuselage lofted from the nose spike to the tail, tall over the wheel housing, with a canopy
// riding its ridge, the wheel visible through the glass of the housing, shoulders flaring out over the deck
// behind the housing into a wide tail with a lamp bar and twin exhausts, and a fin.
function buildBlade(v, paint) {
  const H = new Piece(COLORS.redHot, 0x560a1e, 0xa8203c);
  const r = v.r;
  const top = 2 * r + 0.1; // the housing clears the wheel
  const cy = r + 0.02;
  // the tail rides clear of the deck's tail, which is taller on the big craft
  const lift = Math.max(0, deckTop(v, -1.75) + 0.28 - 0.9);
  const Z = [2.45, 1.75, 1.05, 0.45, -0.3, -0.95, -1.5, -1.75];
  const WL = [0.04, 0.2, 0.34, 0.4, 0.4, 0.36, 0.3, 0.2]; // inside the channel
  const WU = [0.04, 0.2, 0.34, 0.42, 0.44, 0.48, 0.44, 0.3]; // the shoulders, over the deck
  const T = [0.58, 0.72, 0.92, top, top + 0.02, top - 0.3, 1.14 + lift, 1.0 + lift];
  const rings = Z.map((z, k) => ring(z, WL[k], WU[k], bladeBelly(z), T[k]));
  // the shoulders are the silhouette, the lower chines and the ridge panel edges, the keel a detail; paint rings
  // mark the cowl and the housing, the tail cap's outline is the silhouette from behind
  const along = [H.D, H.L, H.R, H.L, H.R, H.L];
  H.loft(rings, { lineOf: (i) => along[i], ringMat: (k) => (k === 2 || k === 4 ? H.A : k === 0 ? null : k === Z.length - 1 ? H.R : H.D) });
  const tail = rings[rings.length - 1];
  H.cap(tail);
  // the tail: winglets out from the shoulders, a lit bar across the top of the tail cap and the winglets (docked,
  // it fills the gap between the wing halves' bars), and twin exhaust rings under it
  const zt = Z[Z.length - 1] - 0.012;
  const ly = tail[2][1];
  const lw = tail[2][0];
  const ww = lw + 0.16;
  for (const s of [-1, 1]) {
    const w = [[s * lw, ly + 0.02, zt + 0.012], [s * ww, ly + 0.03, zt + 0.012], [s * ww, ly - 0.03, zt + 0.1], [s * lw, ly - 0.05, zt + 0.25]];
    H.quad(...w);
    H.loop(H.R, w);
  }
  H.lamp([[-ww, ly + 0.02, zt], [ww, ly + 0.02, zt], [ww - 0.02, ly - 0.04, zt], [-ww + 0.02, ly - 0.04, zt]]);
  H.seg(H.A, [-ww, ly + 0.02, zt], [ww, ly + 0.02, zt]);
  const ey = lerp(tail[0][1], ly, 0.45);
  for (const x of [-0.11, 0.11]) H.loop(H.A2, circle(x, ey, zt, 0.055, 8));
  // canopy: a glass blister on the ridge, outlined in paint
  const can = [[0, T[2] + 0.01, 1.15], [0.22, lerp(T[2], top, 0.6), 0.7], [0.26, top - 0.02, 0.15], [0.2, top - 0.04, -0.45], [0, top - 0.02, -0.7]];
  const canL = can.map(([x, y, z]) => [-x, y, z]);
  H.loop(H.A, [...can, ...canL.slice(1, -1).reverse()]);
  for (let k = 0; k < can.length - 1; k++) H.cquad(can[k], can[k + 1], canL[k + 1], canL[k]);
  H.seg(H.A2, can[1], canL[1]);
  H.seg(H.A2, can[3], canL[3]);
  // the axle pin through the housing
  H.seg(H.A2, [-0.46, cy, -0.25], [0.46, cy, -0.25]);
  // fin
  const fy = T[5] - 0.02;
  const fin = (pts) => {
    H.loop(H.R, pts);
    for (let k = 1; k < pts.length - 1; k++) H.cquad(pts[0], pts[k], pts[k + 1], pts[k + 1]);
  };
  const fb = T[6] - 0.08; // where the fin's trailing edge meets the tail
  if (v.fin === 'tall') fin([[0, fy, -0.9], [0, fy + 0.72, -1.75], [0, fy + 0.6, -2.0], [0, fb, -1.6]]);
  else if (v.fin === 'twin') for (const x of [-0.22, 0.22]) fin([[x, fy, -0.95], [x * 2.2, fy + 0.5, -1.7], [x * 2.0, fy + 0.4, -1.9], [x * 1.6, fb, -1.5]]);
  else fin([[0, fy, -0.75], [0, fy + 0.4, -1.65], [0, fy + 0.3, -2.0], [0, fb, -1.6]]);
  bladeKit(H, v, T, top);
  H.setPaint(paint, 0.65);
  const g = H.build();
  // the wheel spins on its own; drawn after the housing glass so it shows through it
  const wheel = new THREE.Group();
  wheel.position.set(0, cy, -0.25);
  const w = [];
  const N = 28;
  for (const x of [-0.14, 0.14]) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const b = ((i + 1) / N) * TAU;
      w.push(x, Math.sin(a) * r, Math.cos(a) * r, x, Math.sin(b) * r, Math.cos(b) * r);
    }
  }
  for (let i = 0; i < v.spokes; i++) {
    const a = (i / v.spokes) * TAU;
    w.push(0, 0, 0, 0, Math.sin(a) * r * 0.94, Math.cos(a) * r * 0.94);
    w.push(-0.14, Math.sin(a) * r, Math.cos(a) * r, 0.14, Math.sin(a) * r, Math.cos(a) * r);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(w, 3));
  H.wheelMat = H.lineMat.clone();
  H.wheelMat.color.set(COLORS.redHot);
  wheel.add(new THREE.LineSegments(wg, H.wheelMat));
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1, 6, 32), new THREE.MeshBasicMaterial({ color: 0x3a0610, transparent: true, opacity: 0.9, depthWrite: false }));
  tyre.rotation.y = Math.PI / 2;
  wheel.add(tyre);
  // the wheel ignores depth, so it shows through the housing's glass (the group's own order stays put: a group's
  // order would sort its contents after the lamps, and the tyre would paint over the tail bar)
  wheel.traverse((o) => {
    if (!o.material) return;
    o.renderOrder = 9;
    o.material.depthTest = false;
  });
  g.add(wheel);
  return { g, H, wheel, r, tyreMat: tyre.material };
}

// ------------------------------------------------------------------ the Skimmer
// One side of the deck (s = -1 left, +1 right): a loft of half-sections from the nose tip to the tail. Each
// section is a closed six-point ring: skirt and outer flank (chamfered, with a flare at mid height), the top deck,
// then the inner step down to the shelf along the channel. The channel is open where the wheel sits and closed
// (the shelf meets the middle under the Blade's belly) at the nose and tail, and the top edge rises into a sill
// round the cockpit. The tail face carries a fan duct (or, with one fan, the right half carries a centre pod
// behind the Blade's tail) and half of the rear wing. Returns the fan's blades' place, if any.
function deckSide(H, v, s) {
  const zf = deckFront(v);
  const zb = deckBack(v);
  const y0 = DECK_Y;
  const P = (x, y, z) => [x * s, y, z];
  const Z = [zf, zf - 0.5, zf - 1.1, zf - 1.7, 0.1, -0.5, -1.1, zb + 0.5, zb];
  const rings = Z.map((z) => {
    const u = (zf - z) / (zf - zb); // 0 at the nose, 1 at the tail
    const plan = u < 0.3 ? lerp(0.1, v.nose, u / 0.3) : lerp(v.nose, v.tail, Math.min(1, (u - 0.3) / 0.55));
    const xo = z === zf ? 0.14 : SLOT + plan;
    const y1 = deckTop(v, z);
    const ym = y0 + (y1 - y0) * 0.42;
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
  // The flare and the top edge are the silhouette, the sill a panel edge, the skirt a detail; section rings only
  // at the nose and the tail (silhouette) and dimly at every other station, so the deck reads as panels.
  const along = [null, H.D, H.R, H.R, H.L, null];
  H.loft(rings, { lineOf: (i) => along[i], ringMat: (k) => (k === 0 || k === rings.length - 1 ? H.R : k % 2 === 0 ? H.D : null) });
  // light strips: along the top edge in the craft's paint, dimmer along the skirt
  const strip = (pick, dy, arr) => {
    for (let k = 1; k < rings.length - 1; k++) {
      const a = pick(rings[k]);
      const b = pick(rings[k + 1]);
      H.seg(arr, [a[0], a[1] + dy, a[2]], [b[0], b[1] + dy, b[2]]);
    }
  };
  strip((rg) => rg[3], 0.02, H.A);
  strip((rg) => rg[1], -0.03, H.A2);
  // the latches that hold the Blade: short bars across the channel edge
  for (const z of [0.9, -0.35]) H.seg(H.A2, P(SLOT + 0.02, deckTop(v, z) - 0.02, z), P(SLOT - 0.2, deckTop(v, z) - 0.02, z));
  // the tail face, with the fan duct sunk into it on the two-fan craft
  const tail = rings[rings.length - 1];
  const yt = deckTop(v, zb);
  let fan = null;
  if (v.fans === 2) {
    fan = { x: (SLOT + v.tail * 0.5) * s, y: y0 + (yt - y0) * 0.5, r: Math.min(0.27, (yt - y0) * 0.42), z: zb };
    H.annulus(tail, circle(fan.x, fan.y, zb, fan.r));
    duct(H, fan, zb, zb + 0.55);
  } else {
    H.cap(tail);
    // one big fan: a pod on the centreline behind the Blade's tail, carried by the right half
    if (s > 0) {
      const R = 0.3 + (v.h - 0.3) * 0.8; // sized to the deck, so the low Dash isn't all pod
      fan = { x: 0, y: yt - 0.08, r: R, z: zb - R };
      const m0 = circle(0, fan.y, fan.z, fan.r);
      const m1 = circle(0, fan.y, zb + 0.2, fan.r);
      H.loop(H.R, m0);
      for (let i = 0; i < m0.length; i++) {
        if (i % 3 === 0) H.seg(H.D, m0[i], m1[i]);
        H.quad(m0[i], m0[(i + 1) % m0.length], m1[(i + 1) % m0.length], m1[i]);
      }
      duct(H, { ...fan, r: fan.r * 0.9 }, fan.z, zb + 0.15, true);
    }
  }
  wing(H, v, s, zb);
  deckKit(H, v, s, rings);
  return fan;
}

// A closed box of panels, edged in `arr`: centre, half sizes. sweep leans its top back along z.
function box(H, [cx, cy, cz], [hx, hy, hz], arr, sweep = 0) {
  const p = (x, y, z) => [cx + x, cy + y, cz + z + (y > 0 ? -sweep : 0)];
  const b = [p(-hx, -hy, hz), p(hx, -hy, hz), p(hx, -hy, -hz), p(-hx, -hy, -hz)];
  const t = [p(-hx, hy, hz), p(hx, hy, hz), p(hx, hy, -hz), p(-hx, hy, -hz)];
  for (let k = 0; k < 4; k++) H.quad(b[k], b[(k + 1) % 4], t[(k + 1) % 4], t[k]);
  H.quad(...t);
  H.loop(arr, t);
  for (let k = 0; k < 4; k++) H.seg(arr, b[k], t[k]);
}

// The Skimmer half's signature pieces (s: which side).
function deckKit(H, v, s, rings) {
  const P = (x, y, z) => [x * s, y, z];
  const zf = deckFront(v);
  const zb = deckBack(v);
  const outer = (z) => SLOT + (z > zf - 1.2 ? lerp(0.1, v.nose, (zf - z) / 1.2) : lerp(v.nose, v.tail, Math.min(1, (zf - 1.2 - z) / (zf - zb - 1.2))));
  switch (v.kit) {
    case 'canard': {
      // VECTOR: swept canards off the nose, each with a lit endplate
      const z = zf - 0.75;
      const x0 = outer(z) - 0.05;
      const y = deckTop(v, z) - 0.06;
      const w = [P(x0, y, z + 0.3), P(x0 + 0.62, y + 0.06, z - 0.1), P(x0 + 0.62, y + 0.06, z - 0.42), P(x0, y, z - 0.3)];
      H.quad(...w);
      H.loop(H.R, w);
      const e = [P(x0 + 0.62, y - 0.12, z - 0.05), P(x0 + 0.62, y + 0.2, z - 0.15), P(x0 + 0.62, y + 0.2, z - 0.45), P(x0 + 0.62, y - 0.12, z - 0.45)];
      H.lamp(e);
      H.loop(H.A, e);
      break;
    }
    case 'needle': {
      // SCANLINE: a long knife-edge strake down each flank, running out past the tail
      const a = rings[3][3];
      const b = rings[rings.length - 1][3];
      const st = [[a[0], a[1], a[2]], [b[0] + 0.12 * s, b[1] + 0.22, zb - 0.5], [b[0] + 0.12 * s, b[1] + 0.02, zb - 0.5], [a[0], a[1] - 0.02, a[2]]];
      H.quad(...st);
      H.loop(H.R, st);
      H.seg(H.A, st[0], st[1]);
      break;
    }
    case 'outrigger': {
      // POLYGON: an outrigger pod on a pair of struts off each flank (a trimaran), its own fan glowing at the back
      const x = SLOT + v.tail + 0.42;
      const y = DECK_Y + 0.22;
      const Zs = [1.25, 0.95, -0.6, zb + 0.15];
      const R = [0.04, 0.17, 0.2, 0.17];
      const pod = Zs.map((z, k) => circle(x * s, y, z, R[k], 6));
      for (let k = 0; k < pod.length - 1; k++) for (let i = 0; i < 6; i++) {
        H.quad(pod[k][i], pod[k][(i + 1) % 6], pod[k + 1][(i + 1) % 6], pod[k + 1][i]);
        if (i % 2 === 0) H.seg(k === 1 ? H.R : H.L, pod[k][i], pod[k + 1][i]);
      }
      H.loop(H.R, pod[pod.length - 1]);
      H.lamp(circle(x * s, y, zb + 0.14, 0.12, 6), true);
      for (const z of [0.4, -1.0]) {
        const xi = outer(z) - 0.1;
        const st = [P(xi, deckTop(v, z) - 0.12, z + 0.12), P(x - 0.12, y + 0.08, z + 0.1), P(x - 0.12, y + 0.08, z - 0.1), P(xi, deckTop(v, z) - 0.12, z - 0.12)];
        H.quad(...st);
        H.loop(H.L, st);
      }
      break;
    }
    case 'halo': {
      // CHROMA: a sweeping fender arc of light over each flank
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const z = lerp(1.5, -1.5, k / 10);
        pts.push(P(outer(z) - 0.05, deckTop(v, z) + 0.06 + Math.sin((k / 10) * Math.PI) * 0.32, z));
      }
      for (let k = 0; k < pts.length - 1; k++) {
        H.seg(H.A, pts[k], pts[k + 1]);
        const a = pts[k];
        const b = pts[k + 1];
        H.quad(a, b, [b[0], b[1] - 0.05, b[2]], [a[0], a[1] - 0.05, a[2]]);
      }
      break;
    }
    case 'pixel': {
      // RASTER: three stepped block fins up each flank, tallest at the back
      for (let k = 0; k < 3; k++) {
        const z = -0.2 - k * 0.55;
        const x = outer(z) - 0.22;
        box(H, P(x, deckTop(v, z) + 0.08 + k * 0.08, z), [0.09, 0.08 + k * 0.08, 0.2], k === 2 ? H.R : H.L);
        H.lamp([P(x - 0.09, deckTop(v, z) + 0.17 + k * 0.16, z + 0.205), P(x + 0.09, deckTop(v, z) + 0.17 + k * 0.16, z + 0.205), P(x + 0.09, deckTop(v, z) + 0.1 + k * 0.16, z + 0.205), P(x - 0.09, deckTop(v, z) + 0.1 + k * 0.16, z + 0.205)]);
      }
      break;
    }
    case 'shards': {
      // GLITCH: pieces of the flank that came loose and float a hand's width off it, lit along their edges
      const at = [[1.1, 0.24, 0.32], [0.1, 0.32, 0.28], [-0.9, 0.2, 0.36]];
      for (const [z, dy, dx] of at) {
        const x = outer(z) + dx * (s > 0 ? 1 : 0.6);
        const y = deckTop(v, z) * 0.6 + dy;
        const q = [P(x, y + 0.18, z + 0.28), P(x + 0.08, y + 0.2, z - 0.24), P(x + 0.04, y - 0.12, z - 0.3), P(x - 0.04, y - 0.16, z + 0.2)];
        H.quad(...q);
        H.loop(s > 0 ? H.A : H.R, q);
      }
      break;
    }
    case 'shark': {
      // GREAT WEDGE: teeth along the nose, and three lit gill slits down each flank
      const z0 = zf - 0.15;
      for (let k = 0; k < 4; k++) {
        const z = z0 - k * 0.22;
        const x = lerp(0.12, outer(z), 0.85);
        const y = DECK_Y + 0.02;
        const t = [P(x - 0.06, y + 0.02, z + 0.05), P(x + 0.06, y + 0.02, z - 0.05), P(x + 0.06, y - 0.16, z)];
        H.lamp(t);
        H.loop(H.R, t);
      }
      for (let k = 0; k < 3; k++) {
        const z = 0.9 - k * 0.22;
        const x = outer(z) + 0.1;
        const y = DECK_Y + (deckTop(v, z) - DECK_Y) * 0.45;
        H.lamp([P(x, y + 0.14, z), P(x, y + 0.14, z - 0.05), P(x, y - 0.1, z - 0.09), P(x, y - 0.1, z - 0.04)]);
      }
      break;
    }
  }
}

// The Blade's signature pieces. T: the fuselage's ridge heights; top: the housing's top.
function bladeKit(H, v, T, top) {
  switch (v.kit) {
    case 'canard': {
      // a roll hoop behind the canopy
      const hoop = [];
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI * (k / 8);
        hoop.push([Math.cos(a) * 0.5, top - 0.25 + Math.sin(a) * 0.42, -0.8]);
      }
      for (let k = 0; k < hoop.length - 1; k++) {
        H.seg(H.R, hoop[k], hoop[k + 1]);
        H.quad(hoop[k], hoop[k + 1], [hoop[k + 1][0], hoop[k + 1][1], -0.92], [hoop[k][0], hoop[k][1], -0.92]);
      }
      break;
    }
    case 'needle': {
      // a long lance of a nose, lit at the tip
      const base = [[0, 0.5, 2.4], [0.08, 0.56, 2.4], [0, 0.62, 2.4], [-0.08, 0.56, 2.4]];
      const tip = [0, 0.55, 3.45];
      for (let k = 0; k < 4; k++) {
        H.tri(base[k], base[(k + 1) % 4], tip, 0.8);
        H.seg(k % 2 ? H.R : H.L, base[k], tip);
      }
      H.lamp([[0, 0.53, 3.3], [0.03, 0.55, 3.45], [0, 0.57, 3.3]]);
      break;
    }
    case 'outrigger': {
      // a pair of ram intakes either side of the cowl
      for (const x of [-0.36, 0.36]) box(H, [x, 0.62, 1.3], [0.07, 0.07, 0.3], H.L);
      break;
    }
    case 'halo': {
      // a halo of light standing over the wheel housing
      const pts = [];
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        pts.push([Math.cos(a) * 0.62, top + 0.35 + Math.sin(a) * 0.62 * 0.35, -0.25 + Math.sin(a) * 0.62]);
      }
      for (let k = 0; k < pts.length - 1; k++) H.seg(H.A, pts[k], pts[k + 1]);
      for (const x of [-0.3, 0.3]) H.seg(H.L, [x, top - 0.05, -0.25], [x * 1.9, top + 0.3, -0.25]);
      break;
    }
    case 'pixel': {
      // a block tail, a grid of square lamps across it
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        if ((i + j) % 2) continue;
        const x = -0.18 + i * 0.18;
        const y = T[6] - 0.02 - j * 0.12;
        H.lamp([[x - 0.06, y, -1.77], [x + 0.06, y, -1.77], [x + 0.06, y - 0.1, -1.77], [x - 0.06, y - 0.1, -1.77]]);
      }
      box(H, [0, top + 0.06, -0.55], [0.12, 0.06, 0.12], H.L);
      break;
    }
    case 'shards': {
      // a broken-off fin, floating just above where it should be
      const q = [[0.05, top + 0.25, -0.5], [0.12, top + 0.75, -1.2], [0.08, top + 0.62, -1.5], [0.02, top + 0.2, -1.0]];
      H.loop(H.A, q);
      H.cquad(...q);
      break;
    }
    case 'pencil': {
      // DASH: a sharpened pencil tip of a nose: a bare-wood cone, a graphite point
      const ring6 = circle(0, 0.55, 2.4, 0.16, 6);
      const tip = [0, 0.55, 3.15];
      for (let k = 0; k < 6; k++) {
        H.tri(ring6[k], ring6[(k + 1) % 6], tip, 0.9);
        H.seg(H.L, ring6[k], tip);
      }
      H.loop(H.R, ring6);
      const g6 = circle(0, 0.55, 2.95, 0.045, 6);
      for (let k = 0; k < 6; k++) H.lamp([g6[k], g6[(k + 1) % 6], tip]);
      break;
    }
    case 'shark': {
      // a great dorsal fin
      const f = [[0, top - 0.05, -0.1], [0, top + 1.05, -0.95], [0, top + 0.95, -1.25], [0, top - 0.1, -1.0]];
      H.loop(H.R, f);
      H.quad(...f, 0.7);
      break;
    }
  }
}

// The inside of a fan duct: a tube from the mouth at z0 forward to a back plate at z1, with longitudinal lines,
// and a glow ring deep in it that brightens with speed. `pod` keeps the mouth ring off (the pod's own outline is
// its rim).
function duct(H, fan, z0, z1, pod = false) {
  const m0 = circle(fan.x, fan.y, z0, fan.r);
  const m1 = circle(fan.x, fan.y, z1, fan.r * 0.9);
  const n = m0.length;
  if (!pod) H.loop(H.L, circle(fan.x, fan.y, z0 - 0.012, fan.r));
  for (let i = 0; i < n; i++) {
    if (i % 3 === 0) H.seg(H.D, m0[i], m1[i]);
    H.quad(m0[i], m0[(i + 1) % n], m1[(i + 1) % n], m1[i], 0.3);
  }
  H.cap(m1, 0.2);
  // the core: a lit disc deep enough to sit in shadow, shallow enough to show from the chase camera, ringed dimly
  H.lamp(circle(fan.x, fan.y, lerp(z0, z1, 0.35), fan.r * (pod ? 0.42 : 0.52)), true);
  H.loop(H.A2, circle(fan.x, fan.y, lerp(z0, z1, 0.3), fan.r * 0.78));
}

// Half of the rear wing, on the tail of one deck half: a flat plane from the sill out to the flank, a lamp bar
// along its trailing edge, and the endplate or pylons that hold it up. Docked, the two halves and the Blade's
// tail lamp between them read as one wide tail bar.
function wing(H, v, s, zb) {
  const P = (x, y, z) => [x * s, y, z];
  const y1 = deckTop(v, zb);
  const xi = SLOT + 0.12;
  const xo = SLOT + v.tail - 0.08;
  const style = v.wing || 'low';
  const wh = style === 'high' ? 0.36 : style === 'pylon' ? 0.26 : 0.18;
  const z0 = zb + 0.02;
  const z1 = zb + 0.4;
  const yw = y1 + wh;
  const plane = [P(xi, yw, z1), P(xo, yw, z1), P(xo, yw + 0.03, z0), P(xi, yw + 0.03, z0)];
  H.quad(...plane);
  H.loop(H.R, plane);
  H.lamp([P(xi + 0.04, yw + 0.035, z0 - 0.012), P(xo - 0.04, yw + 0.035, z0 - 0.012), P(xo - 0.04, yw - 0.01, z0 - 0.012), P(xi + 0.04, yw - 0.01, z0 - 0.012)]);
  // a swept blade from the deck top up to the wing, at x
  const pylon = (x, arr) => {
    const pts = [P(x, y1 - 0.01, z1 + 0.25), P(x, y1 - 0.01, z0 + 0.04), P(x, yw, z0 + 0.04), P(x, yw, z1 - 0.02)];
    H.quad(...pts);
    H.loop(arr, pts);
  };
  if (style === 'low') {
    // tall endplates: the car's rear corners
    const e = [P(xo, yw + 0.1, z1 + 0.15), P(xo, yw + 0.12, z0 - 0.04), P(xo, y1 - 0.02, z0 - 0.04), P(xo, y1 - 0.02, z1 + 0.35)];
    H.quad(...e);
    H.loop(H.R, e);
    pylon(xi + 0.02, H.L);
  } else if (style === 'high') {
    const e = [P(xo, yw + 0.1, z1 + 0.12), P(xo, yw + 0.12, z0 - 0.04), P(xo, yw - 0.14, z0 - 0.04), P(xo, yw - 0.12, z1 + 0.12)];
    H.quad(...e);
    H.loop(H.R, e);
    pylon(xi + 0.02, H.L);
    pylon(xo - 0.2, H.L);
  } else {
    pylon(xi + 0.05, H.R);
    pylon(lerp(xi, xo, 0.72), H.R);
  }
}

function buildDeck(v, paint) {
  const halves = [];
  const fans = [];
  for (const s of [-1, 1]) {
    const H = new Piece(COLORS.blueHot, 0x07203f);
    const fan = deckSide(H, v, s);
    H.setPaint(paint);
    const g = H.build();
    if (fan) {
      // spinning blades just inside the mouth
      const blades = new THREE.Group();
      blades.position.set(fan.x, fan.y, fan.z + 0.08);
      const p = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
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
  // the cover that slides over the channel once the Blade has folded into it: a low spine down the middle,
  // following the deck's top
  const C = new Piece(COLORS.blueHot, 0x07203f);
  const Z = [v.len * 0.5 - 0.3, 1.3, 0.6, -0.1, -0.8, -1.4, -v.len * 0.5 + 0.2];
  const rings = Z.map((z) => {
    const y1 = deckTop(v, z) - 0.03;
    const hump = 0.4 * Math.max(0, Math.sin((Math.PI * (1.6 - z)) / 2.6)) ** 1.2;
    return [[-SLOT, y1, z], [-SLOT * 0.5, y1 + hump, z], [SLOT * 0.5, y1 + hump, z], [SLOT, y1, z]];
  });
  // the hump's top is a canopy pane: the Skimmer's own low cockpit, its edges the silhouette
  const along = [C.L, C.R, C.R, C.L];
  C.loft(rings, { lineOf: (i) => along[i], ringMat: (k) => (k === 0 || k === rings.length - 1 ? C.L : k % 2 ? null : C.D), open: [3], canopy: [1] });
  for (let k = 0; k < rings.length - 1; k++) C.seg(C.A, [0, rings[k][1][1] + 0.02, rings[k][1][2]], [0, rings[k + 1][1][1] + 0.02, rings[k + 1][1][2]]);
  C.setPaint(paint);
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
// `flip` (the Blade FLIPping): k from 0 to 1 through the twist, dir the way it rolls.
export function updateForms(model, mode, dt, speed, bob, body, flip = null) {
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
  // deck halves: out and down as they leave, staying bright most of the way so the split reads; the Skimmer
  // alone floats a little higher, and its fans glow harder the faster it goes
  const out = 1 - kb;
  const float = mode === BLUE ? 0.12 + Math.sin(bob * 3) * 0.05 : 0;
  const glow = 0.25 + 0.6 * Math.min(1, Math.abs(speed) / 50);
  for (const h of P.deck.halves) {
    h.g.visible = kb > 0.01;
    h.g.position.set(h.s * out * 1.4, -out * 0.6 + float, -out * 0.8);
    h.g.rotation.z = h.s * out * 0.5;
    h.H.glowK = glow;
    h.H.setOpacity(Math.min(1, kb * 1.6));
    h.H.rimMat.color.set(h.H.rim).lerp(_c.set(0xffffff), out * 0.8);
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
  B.position.set(0, -(1 - kr) * 0.5, 0);
  B.scale.set(1, Math.max(0.05, kr), 1);
  B.rotation.order = 'YZX';
  B.rotation.y = 0;
  B.rotation.z = body.rotation.z * 2.4 * (1 - kb);
  if (flip) {
    // a Möbius half twist round the wheel: the nose swings round to where the tail was (the model starts at the old
    // facing, half a turn back from the new one) while the whole bike rolls once over, like a band twisting, and
    // hops clear of the road at the middle of it so the roll never sinks into it
    const e = flip.k < 0.5 ? 2 * flip.k * flip.k : 1 - 2 * (1 - flip.k) * (1 - flip.k);
    B.rotation.y = -Math.PI * (1 - e) * flip.dir;
    B.rotation.z += TAU * e * flip.dir;
    B.position.y += Math.sin(Math.PI * flip.k) * 0.5;
    // turning round the wheel's hub, not the group's origin on the road
    _e1.copy(HUB).applyEuler(B.rotation);
    B.position.x += HUB.x - _e1.x;
    B.position.y += HUB.y - _e1.y;
    B.position.z += HUB.z - _e1.z;
  }
  P.blade.H.setOpacity(kr);
  P.blade.tyreMat.opacity = 0.9 * kr * P.blade.H.alpha;
  P.blade.wheel.rotation.x += (speed / P.blade.r) * dt;
  for (const f of P.deck.fans) f.rotation.z += (6 + Math.abs(speed) * 0.4) * dt;
}
