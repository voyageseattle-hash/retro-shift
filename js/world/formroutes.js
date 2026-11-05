// Routes only one form can take (forms.js): data in tracks.js, laid onto the paths here.
//
//   wall-run  branch { wallrun: { from, to, bank } }: between those fractions of the branch the strip banks up
//             into a wall that only a craft that clings (the Blade) is held on; the others fall off it.
//   glide gap gap { glide: true, len }: a stretch with no road in any world; only the Skimmer's glide crosses it.
//             Lay a 'step' profile on the branch so the far side sits lower, and it's a leap for the others.
//   slit      obstacle { type: 'slit', path, at, gap }: a wall across a route with a gap in the middle only the
//             narrow Blade fits through (FORMS[RED].halfW); ai.js reads the `slit` flag on its two pieces.

import * as THREE from '../../vendor/three.js';
import { M, RED } from './shift.js';
import { smoothstep } from '../core/util.js';
import { FORMS } from '../vehicles/forms.js';

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
  }
}

// The slit: two wall pieces with a gap between them.
export function addSlit(world, o) {
  const path = world.pathOf(o);
  const gap = o.gap ?? FORMS[RED].halfW + 0.45;
  const w = (path.halfW + 0.5 - gap) / 2;
  const pieces = [];
  for (const s of [-1, 1]) {
    const ob = world.addObstacle({ type: 'wall', path: o.path, at: o.at, mask: o.mask ?? M.ALL, w, latM: s * (gap + w) });
    ob.slit = gap;
    pieces.push(ob);
  }
  // a bright frame round the gap, so the slit reads from a distance
  const L = world.layers;
  const i = path.index(o.at);
  const col = 0xff2a4a;
  const a = path.point(i, -gap, 0, new THREE.Vector3());
  const b = path.point(i, gap, 0, new THREE.Vector3());
  const h = 4.2;
  for (const t of [0, 0.06]) {
    L.lineXYZ(M.ALL, a.x - t, a.y, a.z, a.x - t, a.y + h, a.z, col);
    L.lineXYZ(M.ALL, b.x + t, b.y, b.z, b.x + t, b.y + h, b.z, col);
  }
  L.lineXYZ(M.ALL, a.x, a.y + h, a.z, b.x, b.y + h, b.z, col);
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
