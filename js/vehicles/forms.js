// The craft's three forms. BOTH is the car itself; through the RED lens it folds into the BLADE, a tall monowheel
// that clings to the road and fits through slits; through BLUE it spreads into the SKIMMER, a low hovercraft that
// glides off drops and skims over water. Both are wireframes in the car's own paint, and a shift morphs between
// them (the old form squashes away as the new one springs up).

import * as THREE from '../../vendor/three.js';
import { BOTH, RED, BLUE } from '../world/shift.js';

// What each form does. Read by Racer.update.
export const FORMS = {
  [BOTH]: { halfW: 1.2, cling: 0, glide: 0, water: 1.4 },
  // narrow, and the wheel holds the road over crests and down drops
  [RED]: { halfW: 0.55, cling: 3.2, glide: 0, water: 2.2 },
  // wide and light: a long float off anything it leaves at speed, and no drag on water
  [BLUE]: { halfW: 1.5, cling: 0, glide: 1, water: 0 },
};

const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };

function segs(pts) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}
function ring(out, cx, cy, cz, r, axis, n = 28, a0 = 0, a1 = Math.PI * 2) {
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const b = a0 + ((a1 - a0) * (i + 1)) / n;
    const P = (t) => (axis === 'x' ? [cx, cy + Math.sin(t) * r, cz + Math.cos(t) * r] : [cx + Math.cos(t) * r, cy, cz + Math.sin(t) * r]);
    out.push(...P(a), ...P(b));
  }
}

// The BLADE: a big wheel with spokes, a thin pod hung inside it, a tail fin and a light bar.
function blade(lineMat, accentLineMat, accentMat) {
  const g = new THREE.Group();
  const wheel = new THREE.Group();
  wheel.position.set(0, 1.05, 0.1);
  const w = [];
  ring(w, -0.18, 0, 0, 1.05, 'x');
  ring(w, 0.18, 0, 0, 1.05, 'x');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    w.push(-0.18, Math.sin(a) * 1.05, Math.cos(a) * 1.05, 0.18, Math.sin(a) * 1.05, Math.cos(a) * 1.05);
    if (i % 2 === 0) w.push(0, 0, 0, 0, Math.sin(a) * 1.0, Math.cos(a) * 1.0);
  }
  wheel.add(new THREE.LineSegments(segs(w), accentLineMat));
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.09, 6, 32), accentMat);
  tyre.rotation.y = Math.PI / 2;
  wheel.add(tyre);
  g.add(wheel);
  // the pod: a narrow wedge hung on the axle, with a canopy
  const p = [];
  const box = (x0, y0, z0, x1, y1, z1) => {
    const V = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) p.push(...V[a], ...V[b]);
  };
  box(-0.22, 0.75, -0.7, 0.22, 1.15, 0.9);
  p.push(-0.22, 1.15, 0.9, 0, 1.45, 0.3, 0.22, 1.15, 0.9, 0, 1.45, 0.3, 0, 1.45, 0.3, 0, 1.25, -0.6);
  // tail fin
  p.push(0, 1.15, -0.7, 0, 1.9, -1.35, 0, 1.9, -1.35, 0, 1.2, -1.5, 0, 1.2, -1.5, 0, 0.9, -0.9);
  g.add(new THREE.LineSegments(segs(p), lineMat));
  g.userData.wheel = wheel;
  return g;
}

// The SKIMMER: a wide, flat hexagonal skirt, a low deck, two ducted fans at the back and a rippling skirt edge.
function skimmer(lineMat, accentLineMat, accentMat) {
  const g = new THREE.Group();
  const p = [];
  const hex = (y, sx, sz) => {
    const V = [[0, 2.3], [1.6, 1.2], [1.6, -1.6], [0, -2.1], [-1.6, -1.6], [-1.6, 1.2]].map(([x, z]) => [x * sx, y, z * sz]);
    for (let i = 0; i < 6; i++) p.push(...V[i], ...V[(i + 1) % 6]);
    return V;
  };
  const lo = hex(0.15, 1, 1);
  const hi = hex(0.5, 0.78, 0.82);
  for (let i = 0; i < 6; i++) p.push(...lo[i], ...hi[i]);
  // cockpit bump
  p.push(-0.45, 0.5, 0.9, 0, 0.85, 0.2, 0.45, 0.5, 0.9, 0, 0.85, 0.2, 0, 0.85, 0.2, 0, 0.6, -0.7);
  g.add(new THREE.LineSegments(segs(p), lineMat));
  const fans = [];
  for (const x of [-0.85, 0.85]) {
    const f = new THREE.Group();
    f.position.set(x, 0.85, -1.5);
    const r = [];
    ring(r, 0, 0, 0, 0.38, 'z');
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      r.push(0, 0, 0, Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36);
    }
    // a duct facing back: the ring stands upright
    const duct = new THREE.LineSegments(segs(r), accentLineMat);
    duct.rotation.x = Math.PI / 2;
    f.add(duct);
    g.add(f);
    fans.push(duct);
  }
  // the skirt's glow
  const skirtMat = accentMat.clone();
  skirtMat.opacity = 0.14;
  const skirt = new THREE.Mesh(new THREE.CircleGeometry(1.9, 6), skirtMat);
  skirt.rotation.x = -Math.PI / 2;
  skirt.rotation.z = Math.PI / 6;
  skirt.scale.set(1, 1.15, 1);
  skirt.position.y = 0.12;
  g.add(skirt);
  g.userData.fans = fans;
  return g;
}

// Adds the two extra forms to a car model (buildBody's result).
export function addForms(model) {
  const accentMat = model.accentMat.clone();
  accentMat.opacity = 0.35;
  model.forms = {
    [BOTH]: model.body,
    [RED]: blade(model.lineMat, model.accentLineMat, accentMat),
    [BLUE]: skimmer(model.lineMat, model.accentLineMat, accentMat),
  };
  model.formAccent = accentMat;
  for (const m of [RED, BLUE]) {
    // all lines and glass, no depth of their own: drawn after the road's glass so it can't paint over them
    model.forms[m].traverse((o) => (o.renderOrder = 8));
    model.forms[m].visible = false;
    model.root.add(model.forms[m]);
  }
  model.formK = { [BOTH]: 1, [RED]: 0, [BLUE]: 0 };
}

// Per frame: grow the current form in, squash the others out; spin the wheel and the fans.
export function updateForms(model, mode, dt, speed, bob, body) {
  if (!model.forms) return;
  for (const m of [BOTH, RED, BLUE]) {
    const want = m === mode ? 1 : 0;
    let k = model.formK[m];
    k += (want - k) * (1 - Math.exp(-(want ? 16 : 22) * dt));
    if (Math.abs(want - k) < 0.01) k = want;
    model.formK[m] = k;
    const g = model.forms[m];
    g.visible = k > 0.02;
    if (!g.visible) continue;
    // the incoming form overshoots a touch as it springs up
    const s = k < 1 ? k * (1 + 0.25 * Math.sin(k * Math.PI)) : 1;
    if (m === BOTH) g.scale.set(s, s, 1);
    else {
      g.scale.set(m === RED ? 1 : s, m === RED ? s : 1, m === RED ? 1 : s * 0.9 + 0.1);
      g.position.y = m === BLUE ? 0.2 + Math.sin(bob * 3) * 0.08 : 0;
      g.rotation.copy(body.rotation);
    }
  }
  const w = model.forms[RED].userData.wheel;
  if (w) w.rotation.x += (speed / 1.05) * dt;
  for (const f of model.forms[BLUE].userData.fans || []) f.rotation.z += (6 + Math.abs(speed) * 0.4) * dt;
}
