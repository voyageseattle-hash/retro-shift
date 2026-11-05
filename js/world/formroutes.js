// Routes only one form can take (forms.js): data in tracks.js, laid onto the paths here.
//
//   wall-run  branch { wallrun: { from, to, bank } }: between those fractions of the branch the strip banks up
//             into a wall that only a craft that clings (the Blade) is held on; the others fall off it.
//   glide gap gap { glide: true, len }: a stretch with no road in any world; only the Skimmer's glide crosses it.
//             Lay a 'step' profile on the branch so the far side sits lower, and it's a leap for the others.
//   slit      obstacle { type: 'slit', path, at, gap }: a wall across a route with a gap in the middle only the
//             narrow Blade fits through (FORMS[RED].halfW); ai.js reads the `slit` flag on its two pieces.

import * as THREE from '../../vendor/three.js';
import { M, RED, COLORS } from './shift.js';
import { smoothstep } from '../core/util.js';
import { FORMS } from '../vehicles/forms.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const RED_HOT = new THREE.Color(COLORS.red).lerp(new THREE.Color(0xffffff), 0.3).multiplyScalar(1.6);
const BLUE_HOT = new THREE.Color(COLORS.blue).lerp(new THREE.Color(0xffffff), 0.3).multiplyScalar(1.6);
const WHITE_HOT = new THREE.Color(0xffffff).multiplyScalar(1.5);

export function layFormRoutes(world) {
  for (const path of world.paths) {
    const wr = path.def?.wallrun;
    if (!wr) continue;
    path.cling = new Uint8Array(path.N);
    const side = path.side ?? 1;
    const bank = (wr.bank ?? 0.9) * side; // the high side is the outer one, away from the main road
    const ramp = wr.ramp ?? 0.08;
    for (let i = 0; i < path.N; i++) {
      const u = i / (path.N - 1);
      const k = smoothstep(wr.from, wr.from + ramp, u) * (1 - smoothstep(wr.to - ramp, wr.to, u));
      if (k <= 0) continue;
      path.bank[i] = bank * k;
      if (Math.abs(path.bank[i]) > 0.4) path.cling[i] = 1;
    }
    path.reframe();
    path.wallrun = true;
    markWallRun(world, path, side);
  }
  for (const path of world.paths) if (path.glide) markGlide(world, path);
}

// The wall-run reads as a wall: a hot rail along its top edge, a second line a little below it, and chevrons
// up the bank every few metres pointing the way the Blade is held (red: the form that clings).
function markWallRun(world, path, side) {
  const L = world.layers;
  const hw = path.halfW;
  const mask = M.ALL;
  let prevTop = null;
  let prevLow = null;
  for (let i = 0; i < path.N; i++) {
    const on = path.cling[i] || Math.abs(path.bank[i]) > 0.15;
    if (!on) {
      prevTop = prevLow = null;
      continue;
    }
    const k = Math.min(1, Math.abs(path.bank[i]) / 0.4);
    const top = path.point(i, side * hw, 0.12, new THREE.Vector3());
    const low = path.point(i, side * hw * 0.82, 0.08, new THREE.Vector3());
    if (prevTop) {
      L.line(mask, prevTop, top, RED_HOT.clone().multiplyScalar(0.5 + 0.5 * k));
      L.line(mask, prevLow, low, COLORS.red);
    }
    prevTop = top;
    prevLow = low;
    // a chevron pointing up the bank, every 6 m on the steep part
    if (path.cling[i] && i % Math.max(1, Math.round(6 / path.ds)) === 0) {
      const apex = path.point(i, side * hw * 0.72, 0.1, _a);
      const l0 = path.point(i - 2, side * hw * 0.3, 0.1, _b);
      const l1 = path.point(i + 2, side * hw * 0.3, 0.1, _c);
      L.line(mask, l0, apex, RED_HOT);
      L.line(mask, l1, apex, RED_HOT);
    }
  }
}

// The glide gap: warning stripes across the road at the lip, posts either side of it, a dotted flight line over
// the gap at the height a glide holds, and a lit bar across the far side where the Skimmer lands.
function markGlide(world, path) {
  const L = world.layers;
  const hw = path.halfW;
  const G = path.glide;
  let i0 = G.indexOf(1);
  while (i0 >= 0) {
    let i1 = i0;
    while (i1 < path.N && G[i1]) i1++;
    const mask = path.mask[Math.max(0, i0 - 1)] || M.ALL;
    // the lip: alternating diagonal stripes over the last 10 m of road, in blue and white
    const back = Math.round(10 / path.ds);
    for (let k = 0; k < back; k++) {
      const i = i0 - 1 - k;
      if (i < 0) break;
      const col = k % 2 ? WHITE_HOT : BLUE_HOT;
      for (const s of [-1, 1]) L.line(mask, path.point(i, s * hw * 0.95, 0.1, _a), path.point(i, s * hw * 0.15, 0.1, _b), col);
    }
    const lip = i0 - 1;
    const land = Math.min(path.N - 1, i1);
    const post = (i, col) => {
      for (const s of [-1, 1]) {
        path.point(i, s * hw, 0, _a);
        _b.copy(_a).y += 4;
        L.line(mask, _a, _b, col);
        L.line(mask, _b, _c.copy(_b).addScaledVector(_d.set(path.rightX(i), 0, path.rightZ(i)), -s * 0.8), col);
      }
    };
    post(lip, BLUE_HOT);
    // the landing: a bright bar across the far edge, posts, and chevrons on the road pointing on
    post(land, BLUE_HOT);
    L.line(mask, path.point(land, -hw, 0.12, _a), path.point(land, hw, 0.12, _b), WHITE_HOT);
    L.line(mask, path.point(land, -hw, 0.5, _a), path.point(land, hw, 0.5, _b), BLUE_HOT);
    for (let k = 1; k <= 3; k++) {
      const i = land + Math.round((k * 5) / path.ds);
      if (i >= path.N - 1) break;
      for (const s of [-1, 1]) L.line(mask, path.point(i - 2, s * hw * 0.5, 0.1, _a), path.point(i, 0, 0.1, _b), BLUE_HOT);
    }
    // the flight line: dashes arcing over the gap, blue
    const n = 12;
    for (let k = 0; k < n; k++) {
      const u0 = k / n;
      const u1 = u0 + 0.5 / n;
      const h = (u) => 1.2 + 2.2 * Math.sin(u * Math.PI) - 1.5 * u;
      path.point(lip + Math.round(u0 * (land - lip)), 0, 0, _a).y += h(u0);
      path.point(lip + Math.round(u1 * (land - lip)), 0, 0, _b).y += h(u1);
      L.line(mask, _a, _b, BLUE_HOT.clone().multiplyScalar(0.6));
    }
    i0 = G.indexOf(1, i1);
  }
}

// The slit: two wall pieces with a gap between them.
export function addSlit(world, o) {
  const path = world.pathOf(o);
  const gap = o.gap ?? FORMS[RED].halfW + 0.55;
  const w = (path.halfW + 0.5 - gap) / 2;
  const pieces = [];
  for (const s of [-1, 1]) {
    const ob = world.addObstacle({ type: 'wall', path: o.path, at: o.at, mask: o.mask ?? M.ALL, w, latM: s * (gap + w) });
    ob.slit = gap;
    pieces.push(ob);
  }
  // a bright frame round the gap, so the slit reads from a distance: hot jambs with a ribbon of red glow down
  // each, a lintel, a strip of red light on the road through the gap, and chevrons funnelling in to it
  const L = world.layers;
  const i = path.index(o.at);
  const a = path.point(i, -gap, 0, new THREE.Vector3());
  const b = path.point(i, gap, 0, new THREE.Vector3());
  const h = 4.6;
  const rx = path.rightX(i);
  const rz = path.rightZ(i);
  const fx = path.thx[i];
  const fz = path.thz[i];
  const up = (p, dy) => p.clone().setY(p.y + dy);
  for (const [p, s] of [[a, -1], [b, 1]]) {
    for (const t of [0, 0.12]) L.lineXYZ(M.ALL, p.x + rx * s * t, p.y, p.z + rz * s * t, p.x + rx * s * t, p.y + h, p.z + rz * s * t, RED_HOT);
    // the glow ribbon on the outer face of the jamb, fading away from it
    const o1 = p.clone().addScaledVector(_d.set(rx, 0, rz), s * 0.9);
    L.quadFade(M.ALL, p, up(p, h), up(o1, h), o1, COLORS.red, 0.9, 0);
  }
  L.lineXYZ(M.ALL, a.x, a.y + h, a.z, b.x, b.y + h, b.z, RED_HOT);
  L.lineXYZ(M.ALL, a.x, a.y + h - 0.25, a.z, b.x, b.y + h - 0.25, b.z, COLORS.red);
  // the floor through the gap: red light from 16 m before to 6 m past
  const n0 = Math.max(0, i - Math.round(16 / path.ds));
  const n1 = Math.min(path.N - 1, i + Math.round(6 / path.ds));
  L.quadFade(M.ALL, path.point(n0, -gap, 0.06, new THREE.Vector3()), path.point(n0, gap, 0.06, new THREE.Vector3()), path.point(i, gap, 0.06, new THREE.Vector3()), path.point(i, -gap, 0.06, new THREE.Vector3()), COLORS.red, 0, 0.45);
  L.quadFade(M.ALL, path.point(i, -gap, 0.06, new THREE.Vector3()), path.point(i, gap, 0.06, new THREE.Vector3()), path.point(n1, gap, 0.06, new THREE.Vector3()), path.point(n1, -gap, 0.06, new THREE.Vector3()), COLORS.red, 0.45, 0);
  // chevrons on the road, narrowing in to the gap over 40 m
  for (let k = 1; k <= 5; k++) {
    const j = i - Math.round((k * 8) / path.ds);
    if (j < 2) break;
    const w = gap + (path.halfW - gap) * (k / 5);
    for (const s of [-1, 1]) L.line(M.ALL, path.point(j - 2, s * w, 0.1, _a), path.point(j, s * gap * 0.9, 0.1, _b), k % 2 ? RED_HOT : COLORS.red);
  }
  path.slit = true;
  (world.slits ||= []).push({ path, i, gap, pieces });
}

// Boards on the route itself, right before each feature, saying which form it takes.
export function signFormRoutes(world, addSign) {
  const back = (path, i, metres) => Math.max(0, i - Math.round(metres / path.ds));
  for (const s of world.slits || []) addSign(world, s.path, back(s.path, s.i, 55), 0, 'SLIT', 'ONLY THE RED BLADE FITS', M.ALL);
  for (const path of world.paths) {
    if (path.wallrun) {
      const i0 = path.cling.indexOf(1);
      if (i0 > 0) addSign(world, path, back(path, i0, 45), 0, 'WALL RUN', 'RED CLINGS · OTHERS FALL', M.ALL);
    }
    if (path.glide) {
      const i0 = path.glide.indexOf(1);
      if (i0 > 0) addSign(world, path, back(path, i0, 50), 0, 'GLIDE GAP', 'BLUE FLOATS IT · KEEP YOUR SPEED', M.ALL);
    }
  }
}
