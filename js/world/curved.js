// Curved courses: a road that really goes round something (the outside and the inside of a sphere, over a rim and
// back), on an engine whose physics only knows a flat world with one up.
//
// The physics never changes: racers, rivals, rails, lens gaps and the camera all still live on the flat course. A
// curved course adds a second shape for the same road, the one that's drawn. Every sample of every path carries a
// frame (where that piece of road is in the drawn world, which way it runs, which way is up off it), and anything
// near that sample is drawn by its frame: a rigid move from the flat world into the drawn one. The frames come from
// rolling the flat road out over the drawn surface (the course's own `curved.lay`), so a bend you steer through on
// the flat road is the same bend on the drawn one.
//
// And the drawn world is moved, every frame, so the piece of it round the viewer's car sits exactly where the flat
// world has it (setRef). So the camera, sparks, pickups, sounds and reflections that work in flat space near the car
// need no changes at all: the world rolls under the car instead. Only things seen from far off are placed by their
// own frame: the road and scenery (built through Path.wpoint), the racers and their trails (curveRacer), and anything
// standing on the course (spot(): a holder that carries flat coordinates into the drawn world at that sample).
//
//   def.curved = { lay(world) }   fills path.frames = { o, t, n } (Float32Array(3 N) each) for every path

import * as THREE from '../../vendor/three.js';

const _o = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _r = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export function layCurved(world) {
  const c = world.def.curved;
  if (!c) return;
  c.lay(world);
  world.curved = c;
  world.group.matrixAutoUpdate = false;
  world._spots = new Map();
}

// The rigid move of sample i of a path, flat world to drawn world, as a position and a rotation.
function frameAt(path, i, pos, quat) {
  i = path.wrap(i);
  const F = path.frames;
  const k = i * 3;
  _t.set(F.t[k], F.t[k + 1], F.t[k + 2]);
  _n.set(F.n[k], F.n[k + 1], F.n[k + 2]);
  _r.crossVectors(_t, _n);
  // drawn basis (right, up, forward) times the flat basis's inverse: flat right is (-thz, 0, thx), forward (thx, 0, thz)
  const thx = path.thx[i];
  const thz = path.thz[i];
  // columns of the rotation: where flat x, y, z go
  const ex = _a.copy(_r).multiplyScalar(-thz).addScaledVector(_t, thx);
  const ez = _b.copy(_r).multiplyScalar(thx).addScaledVector(_t, thz);
  _m.makeBasis(ex, _n, ez);
  quat.setFromRotationMatrix(_m);
  // origin: the drawn place of flat (px, 0, pz)
  pos.set(-path.px[i], 0, -path.pz[i]).applyQuaternion(quat);
  pos.x += F.o[k];
  pos.y += F.o[k + 1];
  pos.z += F.o[k + 2];
}

// The same at a fractional sample (between two frames).
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
function frameAtF(path, fi, pos, quat) {
  let i0 = Math.floor(fi);
  const t = fi - i0;
  if (!path.closed && (i0 < 0 || i0 >= path.N - 1)) return frameAt(path, i0 < 0 ? 0 : path.N - 1, pos, quat);
  frameAt(path, i0, _p0, _q0);
  frameAt(path, i0 + 1, _p1, _q1);
  quat.copy(_q0).slerp(_q1, t);
  // (blend where a point near the car goes, not the origins: they're a long way off and swing with the rotation)
  const x = path.px[path.wrap(i0)] + (path.px[path.wrap(i0 + 1)] - path.px[path.wrap(i0)]) * t;
  const z = path.pz[path.wrap(i0)] + (path.pz[path.wrap(i0 + 1)] - path.pz[path.wrap(i0)]) * t;
  _a.set(x, 0, z).applyQuaternion(_q0).add(_p0);
  _b.set(x, 0, z).applyQuaternion(_q1).add(_p1);
  _a.lerp(_b, t);
  pos.set(-x, 0, -z).applyQuaternion(quat).add(_a);
}

// A holder at sample i of a path: put things in it at their flat coordinates and they stand on the drawn course.
// (On a flat course it's just the world's group.)
export function spot(world, path, i) {
  if (!world.curved) return world.group;
  i = path.wrap(Math.round(i));
  const key = `${path.id}:${i}`;
  let g = world._spots.get(key);
  if (!g) {
    g = new THREE.Group();
    frameAt(path, i, g.position, g.quaternion);
    world.group.add(g);
    world._spots.set(key, g);
  }
  return g;
}

// Which sample of which path a flat point goes by: the road under a racer, or the nearest of the path it was last on.
function fracOn(path, x, y, z, hint) {
  const i = path.nearest(x, z, hint ?? -1, y);
  const along = ((x - path.px[i]) * path.thx[i] + (z - path.pz[i]) * path.thz[i]) / path.ds;
  let fi = i + Math.max(-1, Math.min(1, along));
  if (!path.closed) fi = Math.max(0, Math.min(path.N - 1, fi));
  return fi;
}

// A racer's drawn pose: its flat pose (root.position, root.quaternion as syncVisual left them) moved by the frame of
// the road it's on. Keeps the frame on the racer (r.cv) for its trail and for setRef.
export function curveRacer(r, world) {
  const g = r.gnd;
  const cv = (r.cv ||= { path: null, fi: 0, pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
  if (g.onRoad && g.path?.frames) {
    cv.path = g.path;
    cv.fi = g.f * (g.path.closed ? g.path.N : g.path.N - 1);
  } else {
    const P = r.track?.path?.frames ? r.track.path : world.main;
    cv.fi = fracOn(P, r.pos.x, r.pos.y, r.pos.z, cv.path === P ? Math.round(cv.fi) : r.track?.i);
    cv.path = P;
  }
  frameAtF(cv.path, cv.fi, cv.pos, cv.quat);
  r.root.position.applyQuaternion(cv.quat).add(cv.pos);
  r.root.quaternion.premultiply(cv.quat);
}
// A flat point or direction by a racer's frame (its trail).
export const curvePoint = (r, v) => v.applyQuaternion(r.cv.quat).add(r.cv.pos);
export const curveDir = (r, v) => v.applyQuaternion(r.cv.quat);

// Anything else that moves over the course in flat coordinates (a ghost car): by the nearest frame of the main road.
export function curveObject(world, obj, memo) {
  const m = world.main;
  memo.fi = fracOn(m, obj.position.x, obj.position.y, obj.position.z, memo.fi == null ? -1 : Math.round(memo.fi));
  frameAtF(m, memo.fi, _o, _q);
  obj.position.applyQuaternion(_q).add(_o);
  obj.quaternion.premultiply(_q);
}

// Move the drawn world so the road round this racer (or round sample fi of a path) lies where the flat world has it.
export function setRef(world, r) {
  if (!r.cv?.path) curveRacerFrame(r, world);
  refTo(world, r.cv.pos, r.cv.quat);
}
function curveRacerFrame(r, world) {
  const cv = (r.cv ||= { path: null, fi: 0, pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
  cv.path = r.track?.path?.frames ? r.track.path : world.main;
  cv.fi = fracOn(cv.path, r.pos.x, r.pos.y, r.pos.z, r.track?.i);
  frameAtF(cv.path, cv.fi, cv.pos, cv.quat);
}
export function refAt(world, path, fi) {
  frameAtF(path, fi, _o, _q);
  refTo(world, _o, _q);
}
function refTo(world, pos, quat) {
  const G = world.group;
  G.quaternion.copy(quat).invert();
  G.position.copy(pos).negate().applyQuaternion(G.quaternion);
  G.updateMatrix();
  G.updateMatrixWorld(true);
}

// ------------------------------------------------------------------ rolling a flat path out over a surface
// The pieces a course's `lay` is made of. A frame is { o, t, n }: place, heading, up (unit, at right angles).

export function newFrames(N) {
  return { o: new Float32Array(N * 3), t: new Float32Array(N * 3), n: new Float32Array(N * 3) };
}
export function putFrame(F, i, o, t, n) {
  const k = i * 3;
  F.o[k] = o.x; F.o[k + 1] = o.y; F.o[k + 2] = o.z;
  F.t[k] = t.x; F.t[k + 1] = t.y; F.t[k + 2] = t.z;
  F.n[k] = n.x; F.n[k + 1] = n.y; F.n[k + 2] = n.z;
}

// One step of a path over a sphere about the origin: from sample i to j, the frame (o, t, n) moves by the flat step
// and turns by the flat turn. `sign` +1 rides the outside (up is away from the centre), -1 the inside.
export function rollSphere(path, i, j, o, t, n, radius, sign) {
  let d = Math.atan2(path.thx[j], path.thz[j]) - Math.atan2(path.thx[i], path.thz[i]);
  d = Math.atan2(Math.sin(d), Math.cos(d));
  rollStep(o, t, n, path.px[j] - path.px[i], path.pz[j] - path.pz[i], path.thx[i], path.thz[i], d, radius, sign);
}
// The same for any flat step (dx, dz) taken while heading (thx, thz), turning by d radians (+ left).
export function rollStep(o, t, n, dx, dz, thx, thz, d, radius, sign) {
  const a = dx * thx + dz * thz;
  const c = -dx * thz + dz * thx;
  _r.crossVectors(t, n);
  o.addScaledVector(t, a).addScaledVector(_r, c).setLength(radius);
  // the turn: heading h = atan2(thx, thz), and dT/dh = -right
  t.multiplyScalar(Math.cos(d)).addScaledVector(_r, -Math.sin(d));
  n.copy(o).normalize().multiplyScalar(sign);
  t.addScaledVector(n, -t.dot(n)).normalize();
}

// The drawn place of a flat point by the frame of sample i (Path.toDrawn does the same from the path's side).
export function drawnAt(path, i, v, out = v) {
  i = path.wrap(i);
  const F = path.frames;
  const k = i * 3;
  const dx = v.x - path.px[i];
  const dz = v.z - path.pz[i];
  const a = dx * path.thx[i] + dz * path.thz[i];
  const c = -dx * path.thz[i] + dz * path.thx[i];
  const y = v.y;
  const tx = F.t[k], ty = F.t[k + 1], tz = F.t[k + 2];
  const nx = F.n[k], ny = F.n[k + 1], nz = F.n[k + 2];
  const rx = ty * nz - tz * ny, ry = tz * nx - tx * nz, rz = tx * ny - ty * nx;
  return out.set(F.o[k] + tx * a + nx * y + rx * c, F.o[k + 1] + ty * a + ny * y + ry * c, F.o[k + 2] + tz * a + nz * y + rz * c);
}
export function drawnDir(path, i, v, out = v) {
  i = path.wrap(i);
  const F = path.frames;
  const k = i * 3;
  const a = v.x * path.thx[i] + v.z * path.thz[i];
  const c = -v.x * path.thz[i] + v.z * path.thx[i];
  const y = v.y;
  const tx = F.t[k], ty = F.t[k + 1], tz = F.t[k + 2];
  const nx = F.n[k], ny = F.n[k + 1], nz = F.n[k + 2];
  const rx = ty * nz - tz * ny, ry = tz * nx - tx * nz, rz = tx * ny - ty * nx;
  return out.set(tx * a + nx * y + rx * c, ty * a + ny * y + ry * c, tz * a + nz * y + rz * c);
}
