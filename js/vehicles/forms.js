// Every craft is two vehicles locked together. The red half is the BLADE, a narrow monowheel with a spine and a fin;
// the blue half is the SKIMMER, a low hover deck with a slot down its middle where the wheel docks. Through BOTH you
// drive the pair. Shift to RED and the deck unlatches, splits and falls away, leaving the bike; shift to BLUE and
// the wheel folds down into the deck, leaving the hovercraft. Shift back and they dock again.

import * as THREE from '../../vendor/three.js';
import { BOTH, RED, BLUE, COLORS } from '../world/shift.js';

// What each form does. Read by Racer.update.
export const FORMS = {
  [BOTH]: { halfW: 1.2, cling: 0, glide: 0, water: 1.4 },
  // narrow, and the wheel holds the road over crests and down drops
  [RED]: { halfW: 0.55, cling: 3.2, glide: 0, water: 2.2 },
  // wide and light: a float off anything it leaves at speed, and no drag on water
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

const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };

// Lines and glass for one half: its own materials, so each half fades on its own.
class Half {
  constructor(color, glass) {
    this.L = [];
    this.A = [];
    this.F = [];
    this.lineMat = new THREE.LineBasicMaterial({ color, ...ADD });
    this.accentMat = new THREE.LineBasicMaterial({ color: 0xffffff, ...ADD });
    this.fillMat = new THREE.MeshBasicMaterial({ color: glass, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  }
  seg(arr, a, b) {
    arr.push(...a, ...b);
  }
  loop(arr, pts) {
    for (let i = 0; i < pts.length; i++) this.seg(arr, pts[i], pts[(i + 1) % pts.length]);
  }
  quad(a, b, c, d) {
    this.F.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  build() {
    const g = new THREE.Group();
    const geo = (p) => {
      const q = new THREE.BufferGeometry();
      q.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      return q;
    };
    if (this.F.length) g.add(new THREE.Mesh(geo(this.F), this.fillMat));
    if (this.L.length) g.add(new THREE.LineSegments(geo(this.L), this.lineMat));
    if (this.A.length) g.add(new THREE.LineSegments(geo(this.A), this.accentMat));
    return g;
  }
  setOpacity(k) {
    this.lineMat.opacity = k;
    this.accentMat.opacity = k;
    this.fillMat.opacity = 0.85 * k;
  }
}

// One side of the hover deck (s = -1 left, +1 right): a wedge plan with a slot down the middle, raked sides.
// Returns the fan it carries, if any.
function deckSide(H, v, s) {
  const zf = v.len * 0.5;
  const zb = -v.len * 0.5;
  const slot = 0.42; // the wheel's slot, half width
  const y0 = 0.18;
  const y1 = y0 + v.h;
  const P = (x, y, z) => [x * s, y, z];
  // plan corners: inner edge along the slot, outer edge raked from the tail out to the nose
  const top = [P(slot, y1, zf - 0.7), P(slot + v.nose * 0.6, y1, zf - 0.35), P(slot + v.tail, y1, zb + 0.6), P(slot + v.tail * 0.9, y1, zb), P(slot, y1, zb)];
  const bot = [P(slot, y0, zf - 0.1), P(slot + v.nose, y0, zf), P(slot + v.tail + 0.2, y0, zb + 0.4), P(slot + v.tail + 0.1, y0, zb - 0.1), P(slot, y0, zb - 0.1)];
  H.loop(H.L, top);
  H.loop(H.L, bot);
  for (let i = 0; i < top.length; i++) H.seg(H.L, top[i], bot[i]);
  // glass: the top deck and the outer flank
  H.quad(top[0], top[1], top[2], top[4]);
  H.quad(top[2], top[3], top[4], top[4]);
  H.quad(top[1], bot[1], bot[2], top[2]);
  // a light strip down the outer edge, and the skirt's glow line
  H.seg(H.A, P(slot + v.nose * 0.6 + 0.05, y1 + 0.02, zf - 0.4), P(slot + v.tail - 0.05, y1 + 0.02, zb + 0.65));
  H.seg(H.A, P(slot + v.nose + 0.05, y0 - 0.05, zf), P(slot + v.tail + 0.25, y0 - 0.05, zb + 0.4));
  // the latch that holds the wheel: a short bar across the slot edge
  H.seg(H.A, P(slot, y1 - 0.12, 0.25), P(slot - 0.18, y1 - 0.12, 0.25));
  // fans: a duct on each tail corner, or one big one in the middle (drawn with the right half)
  if (v.fans === 1 && s < 0) return null;
  const fx = v.fans === 2 ? (slot + v.tail * 0.6) * s : 0;
  const R = v.fans === 2 ? 0.34 : 0.5;
  const cz = zb - 0.05;
  const cy = y1 + R - 0.05;
  const ring = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    ring.push([fx + Math.cos(a) * R, cy + Math.sin(a) * R, cz]);
  }
  H.loop(H.L, ring);
  return { x: fx, y: cy, z: cz, r: R };
}

function buildDeck(v, paint) {
  const halves = [];
  const fans = [];
  for (const s of [-1, 1]) {
    const H = new Half(COLORS.blueHot, 0x061633);
    const fan = deckSide(H, v, s);
    H.accentMat.color.set(paint);
    const g = H.build();
    if (fan) {
      // spinning blades inside the duct
      const blades = new THREE.Group();
      blades.position.set(fan.x, fan.y, fan.z);
      const p = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        p.push(0, 0, 0, Math.cos(a) * fan.r * 0.9, Math.sin(a) * fan.r * 0.9, 0);
      }
      const q = new THREE.BufferGeometry();
      q.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      blades.add(new THREE.LineSegments(q, H.accentMat));
      g.add(blades);
      fans.push(blades);
    }
    halves.push({ g, H, s });
  }
  return { halves, fans };
}

// The bike: a wheel with spokes and a tyre, a spine over it with a canopy, forks, and a fin.
function buildBlade(v, paint) {
  const H = new Half(COLORS.redHot, 0x4a0814);
  const r = v.r;
  const cy = r + 0.02;
  const z0 = -1.25;
  const z1 = 1.35;
  const sp = [[0, cy + r * 0.55, z1], [0.22, cy + r * 0.75, 0.4], [0.22, cy + r * 0.8, -0.5], [0, cy + r * 0.5, z0], [-0.22, cy + r * 0.8, -0.5], [-0.22, cy + r * 0.75, 0.4]];
  H.loop(H.L, sp);
  H.seg(H.L, sp[1], sp[4]);
  H.seg(H.L, sp[2], sp[5]);
  H.quad(sp[0], sp[1], sp[2], sp[3]);
  H.quad(sp[0], sp[5], sp[4], sp[3]);
  // canopy
  H.loop(H.A, [[0, cy + r * 0.78, 0.9], [0.16, cy + r * 1.0, 0.35], [0, cy + r * 1.12, -0.1], [-0.16, cy + r * 1.0, 0.35]]);
  // forks down to the axle
  for (const x of [-0.2, 0.2]) {
    H.seg(H.L, [x, cy + r * 0.7, 0.55], [x, cy, 0]);
    H.seg(H.L, [x, cy + r * 0.7, -0.6], [x, cy, 0]);
  }
  // fin
  const fy = cy + r * 0.6;
  if (v.fin === 'tall') H.loop(H.L, [[0, fy, z0 + 0.3], [0, fy + 0.75, z0 - 0.1], [0, fy + 0.7, z0 - 0.35], [0, fy, z0 - 0.05]]);
  else if (v.fin === 'twin') for (const x of [-0.18, 0.18]) H.loop(H.L, [[x, fy, z0 + 0.2], [x * 1.8, fy + 0.5, z0 - 0.15], [x, fy, z0 - 0.05]]);
  else H.loop(H.L, [[0, fy, z0 + 0.5], [0, fy + 0.45, z0 - 0.3], [0, fy, z0 - 0.05]]);
  // tail light
  H.seg(H.A, [-0.16, cy + r * 0.52, z0 - 0.02], [0.16, cy + r * 0.52, z0 - 0.02]);
  H.accentMat.color.set(paint);
  const g = H.build();
  // the wheel spins on its own
  const wheel = new THREE.Group();
  wheel.position.set(0, cy, 0);
  const w = [];
  for (const x of [-0.14, 0.14]) {
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const b = ((i + 1) / 28) * Math.PI * 2;
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
  wheel.add(new THREE.LineSegments(wg, H.lineMat));
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(r, 0.11, 6, 32), H.fillMat);
  tyre.rotation.y = Math.PI / 2;
  wheel.add(tyre);
  g.add(wheel);
  return { g, H, wheel, r };
}

// Builds the pair onto a car model (buildBody's result); the old single hull stays hidden (ghosts still use it).
export function addForms(model, carId, paint) {
  const v = VARIANT[carId] || VARIANT.vector;
  const pair = new THREE.Group();
  const deck = buildDeck(v, paint);
  const blade = buildBlade(v, paint);
  for (const h of deck.halves) pair.add(h.g);
  pair.add(blade.g);
  // lines and glass only, none writing depth: drawn after the road's glass so it can't paint over them
  pair.traverse((o) => (o.renderOrder = 8));
  model.root.add(pair);
  model.body.visible = false;
  model.pair = { group: pair, deck, blade, k: { red: 1, blue: 1 } };
}

// Per frame: each half eases toward being there (1) or not (0) for the current lens, and moves as it goes:
// the deck halves slide apart and drop away, the wheel folds down into the deck.
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
  for (const h of P.deck.halves) {
    h.g.visible = kb > 0.01;
    h.g.position.set(h.s * out * 1.4, -out * 0.6 + (mode === BLUE ? 0.12 + Math.sin(bob * 3) * 0.05 : 0), -out * 0.8);
    h.g.rotation.z = h.s * out * 0.5;
    h.H.setOpacity(kb);
  }
  // the wheel folds down into the slot, squashing flat, as it leaves
  P.blade.g.visible = kr > 0.01;
  P.blade.g.position.y = -(1 - kr) * 0.5;
  P.blade.g.scale.set(1, Math.max(0.05, kr), 1);
  P.blade.H.setOpacity(kr);
  P.blade.wheel.rotation.x += (speed / P.blade.r) * dt;
  for (const f of P.deck.fans) f.rotation.z += (6 + Math.abs(speed) * 0.4) * dt;
}
