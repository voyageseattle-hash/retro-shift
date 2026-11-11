// DREAM FOLD's sky: a mobile. A red paper moon, a blue paper moon and a scatter of paper stars, each hung on a thread
// that runs up out of sight, all swaying a little. The red moon and the red stars are the red world's and go out
// through the blue lens; the blue ones go out through red; the white stars take the lens's colour.
//
// Like the other courses' sky pieces it sits "at infinity": it follows the camera, and it doesn't fold. The piece
// that keeps it there (and tells the road's finish, dreamfoil.js, which lens this view is drawn through) is a mesh
// that is drawn first in every view, so split-screen gets each player's own sky.

import * as THREE from '../../vendor/three.js';
import { COLORS, M } from './shift.js';

const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false };

function geo(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

// A crescent of radius R cut from paper, in the xy plane: its outline, the creases across it, a thread, and its face.
function crescent(R, lines, fills, at, yaw, threadTo) {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(at);
  const out = [];
  const inn = [];
  // the inner edge is a second circle, set off to one side
  const ir = R * 0.84;
  const ix = R * 0.4;
  const iy = R * 0.1;
  // where the two circles cross
  const dd = Math.hypot(ix, iy);
  const base = Math.atan2(iy, ix);
  const ao = Math.acos((dd * dd + R * R - ir * ir) / (2 * dd * R));
  const ai = Math.acos((dd * dd + ir * ir - R * R) / (2 * dd * ir));
  const N = 36;
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    const a = base + ao + u * (Math.PI * 2 - 2 * ao);
    out.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0).applyMatrix4(m));
    const b = base + Math.PI - ai + u * 2 * ai;
    inn.push(new THREE.Vector3(ix + Math.cos(b) * ir, iy + Math.sin(b) * ir, 0).applyMatrix4(m));
  }
  const L = (p, q) => lines.push(p.x, p.y, p.z, q.x, q.y, q.z);
  let top = out[0];
  for (let k = 0; k < N; k++) {
    L(out[k], out[k + 1]);
    L(inn[k], inn[k + 1]);
    // creased like a paper fan
    if (k % 3 === 0 && k) L(out[k], inn[k]);
    fills.push(out[k].x, out[k].y, out[k].z, out[k + 1].x, out[k + 1].y, out[k + 1].z, inn[k + 1].x, inn[k + 1].y, inn[k + 1].z);
    fills.push(out[k].x, out[k].y, out[k].z, inn[k + 1].x, inn[k + 1].y, inn[k + 1].z, inn[k].x, inn[k].y, inn[k].z);
    if (out[k + 1].y > top.y) top = out[k + 1];
  }
  lines.push(top.x, top.y, top.z, top.x, threadTo, top.z);
}

// A four-pointed paper star of radius r facing the middle.
function star(r, lines, fills, at, yaw, spin, threadTo) {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(at);
  const P = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + spin;
    const rr = k % 2 ? r * 0.36 : r;
    P.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0).applyMatrix4(m));
  }
  const c = at;
  let top = P[0];
  for (let k = 0; k < 8; k++) {
    const p = P[k];
    const q = P[(k + 1) % 8];
    lines.push(p.x, p.y, p.z, q.x, q.y, q.z);
    if (k % 2 === 0) lines.push(c.x, c.y, c.z, p.x, p.y, p.z);
    fills.push(c.x, c.y, c.z, p.x, p.y, p.z, q.x, q.y, q.z);
    if (p.y > top.y) top = p;
  }
  lines.push(top.x, top.y, top.z, top.x, threadTo, top.z);
}

// Returns the lens state of the view being drawn: { red, blue } are 1 through that lens and 0 otherwise (eased), and
// onView is a list of functions called with it before each view is drawn.
export function hangSky(world, L, rng) {
  const lens = { red: 0, blue: 0, onView: [] };
  const sky = new THREE.Group();
  const y0 = world.floorY;
  const D = 1900;
  const TOP = 2600;
  const sets = {};
  for (const [k, hex] of [['r', COLORS.red], ['b', COLORS.blue], ['w', COLORS.white]]) {
    const S = (sets[k] = { lines: [], fills: [], hex });
    S.line = new THREE.LineBasicMaterial({ color: hex, opacity: 0.9, ...add });
    S.fill = new THREE.MeshBasicMaterial({ color: hex, opacity: 0.16, side: THREE.DoubleSide, ...add });
    S.line.userData.noFold = S.fill.userData.noFold = true;
  }
  const place = (az, h, dist = D) => new THREE.Vector3(Math.sin(az) * dist, h, Math.cos(az) * dist);
  // the two moons hang to the south, either side of the way home (the start straight runs north, into the fold)
  const yaw0 = Math.atan2(world.main.thx[0], world.main.thz[0]);
  crescent(250, sets.r.lines, sets.r.fills, place(yaw0 + Math.PI + 0.42, 470), yaw0 + 0.42, TOP);
  crescent(165, sets.b.lines, sets.b.fills, place(yaw0 + Math.PI - 0.5, 640), yaw0 - 0.5 + Math.PI, TOP);
  // and stars all round
  const n = 30;
  for (let k = 0; k < n; k++) {
    const az = (k / n) * Math.PI * 2 + rng() * 0.15;
    // (not on top of the moons)
    const south = Math.abs(((az - yaw0 - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (south < 0.85 && rng() < 0.8) continue;
    const S = [sets.r, sets.b, sets.w][k % 3];
    star(16 + rng() ** 2 * 44, S.lines, S.fills, place(az, 260 + rng() * 900, D * (0.85 + rng() * 0.3)), az + Math.PI, rng() * 0.5, TOP);
  }
  const parts = [];
  for (const S of Object.values(sets)) {
    const a = new THREE.LineSegments(geo(S.lines), S.line);
    const b = new THREE.Mesh(geo(S.fills), S.fill);
    for (const o of [a, b]) {
      o.renderOrder = -2;
      o.frustumCulled = false;
      sky.add(o);
      parts.push(o);
    }
  }
  // the piece that's drawn first in every view
  const first = new THREE.Mesh(geo([0, 0, 0, 0, 0, 0, 0, 0, 0]), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  first.renderOrder = -50;
  first.frustumCulled = false;
  sky.add(first);
  const white = new THREE.Color(COLORS.white);
  first.onBeforeRender = (renderer, scene, camera) => {
    sky.position.set(camera.position.x, y0, camera.position.z);
    sky.updateMatrixWorld(true);
    // which lens this view is drawn through, from the tint the course's neutral pieces carry (layers.js): white
    // with both worlds open, (1, 0.2, 0.28) through red, (0.18, 0.52, 1) through blue
    const tint = L.level.get('tint');
    const blue = tint ? Math.min(1, Math.max(0, (1 - tint.r) / 0.82)) : 0;
    const red = tint ? Math.min(1, Math.max(0, (1 - tint.g - 0.48 * blue) / 0.8)) : 0;
    lens.red = red;
    lens.blue = blue;
    sets.r.line.opacity = 0.9 * (1 - blue);
    sets.r.fill.opacity = 0.16 * (1 - blue);
    sets.b.line.opacity = 0.9 * (1 - red);
    sets.b.fill.opacity = 0.16 * (1 - red);
    sets.r.line.visible = sets.r.fill.visible = blue < 0.98;
    sets.b.line.visible = sets.b.fill.visible = red < 0.98;
    if (tint) {
      sets.w.line.color.copy(white).multiply(tint);
      sets.w.fill.color.copy(white).multiply(tint);
    }
    // the night air is thicker here than on the other courses: the far city fades back instead of stacking up into
    // a glare
    if (scene.fog?.isFog) {
      scene.fog.near = 90;
      scene.fog.far = 900;
    }
    // Through a lens every neutral line on the course (the road's grid, the rails, the sheet's creases) is drawn in
    // the lens's colour at full strength, which is bright enough to bloom: fine on an open course, but here a lens
    // stands the whole city up in front of you and the glow of all of it at once is a haze over the picture. So
    // through a lens this course's neutral lines are drawn a step down, under the bloom: crisp, not glowing.
    const one = Math.max(red, blue);
    const neutral = L.mats.get(M.ALL);
    if (neutral && tint) neutral.line.color.copy(tint).multiplyScalar(1 - 0.3 * one);
    for (const fn of lens.onView) fn(lens);
  };
  world.group.add(sky);
  // a mobile sways
  world.animated.push((t) => {
    sky.rotation.y = Math.sin(t * 0.07) * 0.03;
    sky.rotation.z = Math.sin(t * 0.11) * 0.012;
  });
  return lens;
}
