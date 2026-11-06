// Bent road: the FULL PIPE, where the road curls up into a tube the Blade can ride up the walls, across the ceiling
// and all the way round, and the CORKSCREW, where the road rolls a whole turn around a line above it.
//
// Physics never leaves the flat strip: a racer still drives (lat, h) on a road that, to the engine, lies flat (a pipe's
// strip is just wider for a craft that clings). Only how it looks is bent: the road is drawn bent, and a racer on it is
// drawn, and followed by the camera, at the bent place with the bent up (Path.bend). Gravity round the bend is put back
// by hand in racer.js (the pull down a pipe wall, peeling off a corkscrew too slow).
//
//   def.pipes:  [{ at, len, r, ramp }]   main-road fraction, metres, tube radius (default halfW), metres to form
//   def.screws: [{ at, len, rc, dir }]   main-road fraction, metres, height of the roll's axis, roll direction
//
// A pipe is for everyone (the floor is road for every form, the walls hold only the Blade). A corkscrew holds only the
// Blade (path.cling); everyone else takes the launcher laid in front of it and flies through the middle of the roll.

import * as THREE from '../../vendor/three.js';
import { M, RED, COLORS } from './shift.js';
import { smoothstep } from '../core/util.js';

export const PIPE = 1;
export const SCREW = 2;

const RED_HOT = new THREE.Color(COLORS.red).lerp(new THREE.Color(0xffffff), 0.35).multiplyScalar(1.5);
const BLUE_HOT = new THREE.Color(COLORS.blue).lerp(new THREE.Color(0xffffff), 0.35).multiplyScalar(1.5);

export function layWarps(world) {
  const def = world.def;
  world.warps = [];
  world.warpLaunchers = [];
  for (const w of def.pipes || []) addWarp(world, { ...w, kind: PIPE });
  for (const w of def.screws || []) addWarp(world, { ...w, kind: SCREW });
}

function addWarp(world, w) {
  const path = w.path ? world.paths.find((p) => p.id === w.path) : world.main;
  const N = path.N;
  path.warpK ||= new Float32Array(N);
  path.warpKind ||= new Uint8Array(N);
  path.warpR ||= new Float32Array(N);
  path.roll ||= new Float32Array(N);
  path.ext ||= new Float32Array(N);
  const i0 = path.index(w.at);
  const n = Math.max(8, Math.round(w.len / path.ds));
  const hw = path.halfW;
  if (w.kind === PIPE) {
    const R = w.r ?? hw;
    const ramp = Math.max(3, Math.round((w.ramp ?? 22) / path.ds));
    for (let k = 0; k <= n; k++) {
      const i = path.wrap(i0 + k);
      const kk = smoothstep(0, ramp, k) * (1 - smoothstep(n - ramp, n, k));
      path.warpK[i] = kk;
      path.warpKind[i] = PIPE;
      path.warpR[i] = R;
      // how far across the strip reaches: the road's own width, flaring up into the whole way round the tube
      path.ext[i] = hw + (Math.PI * R - hw) * kk;
      path.bank[i] = 0;
    }
    world.warps.push({ kind: PIPE, path, i0, n, R, ramp });
  } else {
    const rc = w.rc ?? hw * 1.1;
    const dir = w.dir ?? 1;
    path.cling ||= new Uint8Array(N);
    path.leap ||= new Uint8Array(N);
    for (let k = 0; k <= n; k++) {
      const i = path.wrap(i0 + k);
      const s = k / n;
      // a whole turn, easing in and out, so the road leaves and lands level
      const roll = dir * (Math.PI * 2 * s - Math.sin(Math.PI * 2 * s));
      path.warpK[i] = 1;
      path.warpKind[i] = SCREW;
      path.warpR[i] = rc;
      path.roll[i] = roll;
      path.ext[i] = hw;
      path.bank[i] = 0;
      // past the first lean only the Blade is held on; everyone else jumps it (ai.js reads leap)
      if (Math.abs(roll) > 0.3 && Math.abs(roll) < Math.PI * 2 - 0.3) {
        path.cling[i] = 1;
        path.leap[i] = M.B;
      }
    }
    // the way over for the forms that can't ride it: a launcher in BOTH and BLUE, just before the roll lifts
    let a = 0;
    while (a < n && !path.cling[path.wrap(i0 + a)]) a++;
    let b = n;
    while (b > a && !path.cling[path.wrap(i0 + b)]) b--;
    const lead = 14;
    world.warpLaunchers.push({ path: path === world.main ? undefined : path.id, at: path.frac(path.wrap(i0 + a - Math.round(lead / path.ds))), mask: M.B, over: (b - a) * path.ds + lead + 10 });
    world.warps.push({ kind: SCREW, path, i0, n, rc, dir, a, b });
  }
  path.reframe();
}

// ------------------------------------------------------------------ how it looks
// The tube walls and ceiling past the road's own width, rings round it, and lines along it; the corkscrew's road is
// drawn by buildRoads itself (through Path.wpoint), this adds the hoop it rolls around and the warning chevrons.
export function buildWarps(world) {
  const L = world.layers;
  for (const W of world.warps) {
    const P = W.path;
    if (W.kind === PIPE) buildPipe(world, L, P, W);
    else buildScrew(world, L, P, W);
  }
}

function buildPipe(world, L, P, W) {
  const hw = P.halfW;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  // the wall bands: strips across the tube from the road's edge round to the ceiling's middle, both sides
  const BANDS = 10;
  for (let k = 0; k < W.n; k++) {
    const i = P.wrap(W.i0 + k);
    const j = P.wrap(i + 1);
    if (P.warpK[i] < 0.02 && P.warpK[j] < 0.02) continue;
    const ei = P.ext[i];
    const ej = P.ext[j];
    for (const side of [-1, 1]) {
      for (let q = 0; q < BANDS; q++) {
        const l0i = side * (hw + ((ei - hw) * q) / BANDS);
        const l1i = side * (hw + ((ei - hw) * (q + 1)) / BANDS);
        const l0j = side * (hw + ((ej - hw) * q) / BANDS);
        const l1j = side * (hw + ((ej - hw) * (q + 1)) / BANDS);
        P.wpoint(i, l0i, -0.02, a);
        P.wpoint(j, l0j, -0.02, b);
        P.wpoint(j, l1j, -0.02, c);
        P.wpoint(i, l1i, -0.02, d);
        L.roadQuad(M.ALL, a, b, c, d);
      }
    }
    // rings round the tube every few metres: red down the left wall, blue down the right, white across the top
    if (k % 3 === 0) {
      const steps = 28;
      let prev = null;
      for (let q = 0; q <= steps; q++) {
        const lat = -ei + (2 * ei * q) / steps;
        const p = P.wpoint(i, lat, 0.03, new THREE.Vector3());
        if (prev && Math.abs(lat) > hw - 0.5) {
          const top = Math.abs(lat) > ei * 0.72;
          L.line(M.ALL, prev, p, top ? 0x9a88ff : lat < 0 ? COLORS.red : COLORS.blue);
        }
        prev = p;
      }
    }
    // lines along the tube
    for (const f of [0.18, 0.36, 0.54, 0.72, 0.9]) {
      for (const side of [-1, 1]) {
        P.wpoint(i, side * (hw + (ei - hw) * f), 0.03, a);
        P.wpoint(j, side * (hw + (ej - hw) * f), 0.03, b);
        L.line(M.ALL, a, b, f > 0.7 ? 0x9a88ff : side < 0 ? COLORS.red : COLORS.blue);
      }
    }
    // the ceiling's racing line: hot red chevrons, there only in RED, pointing the way the Blade goes
    if (P.warpK[i] > 0.97 && k % 4 === 0) {
      const top = P.ext[i];
      for (const side of [-1, 1]) {
        const lat = side * top * 0.97;
        const apex = P.wpoint(i + 2, lat, 0.06, new THREE.Vector3());
        const l0 = P.wpoint(i, lat - 2.2, 0.06, new THREE.Vector3());
        const l1 = P.wpoint(i, lat + 2.2, 0.06, new THREE.Vector3());
        L.line(M.RO, l0, apex, RED_HOT);
        L.line(M.RO, l1, apex, RED_HOT);
      }
    }
  }
  // a thick glowing hoop at each mouth, so the tube reads as a tube from far off
  for (const k of [W.ramp, W.n - W.ramp]) {
    const i = P.wrap(W.i0 + k);
    const e = P.ext[i];
    for (const h of [0.05, -0.6]) {
      let prev = null;
      for (let q = 0; q <= 40; q++) {
        const p = P.wpoint(i, -e + (2 * e * q) / 40, h, new THREE.Vector3());
        if (prev) {
          const p2 = P.wpoint(i + 1, -e + (2 * e * q) / 40, h, new THREE.Vector3());
          const p1 = P.wpoint(i + 1, -e + (2 * e * (q - 1)) / 40, h, new THREE.Vector3());
          L.quad(M.ALL, prev, p, p2, p1, q < 20 ? COLORS.red : COLORS.blue, 1.1);
        }
        prev = p;
      }
    }
  }
}

function buildScrew(world, L, P, W) {
  const hw = P.halfW;
  // the axis it rolls round: a dotted line of light through the middle, the line the jumpers fly
  for (let k = W.a; k < W.b; k += 2) {
    const i = P.wrap(W.i0 + k);
    const j = P.wrap(i + 1);
    const a = P.point(i, 0, P.warpR[i]);
    const b = P.point(j, 0, P.warpR[j]);
    L.line(M.B, a, b, BLUE_HOT);
  }
  // red chevrons on the road through the roll (the Blade's way), pointing along it
  for (let k = W.a; k < W.b; k += 3) {
    const i = P.wrap(W.i0 + k);
    const apex = P.wpoint(i + 2, 0, 0.08, new THREE.Vector3());
    for (const s of [-1, 1]) L.line(M.R, P.wpoint(i, s * hw * 0.6, 0.08, new THREE.Vector3()), apex, RED_HOT);
  }
  // rings round the roll at each end
  for (const k of [W.a, W.b]) {
    const i = P.wrap(W.i0 + k);
    const c = P.point(i, 0, P.warpR[i]);
    const u = new THREE.Vector3(P.rightX(i), 0, P.rightZ(i));
    const up = new THREE.Vector3(P.nx[i], P.ny[i], P.nz[i]);
    L.ring(M.ALL, c, u, up, P.warpR[i] + hw * 0.4, 40, 0x9a88ff);
    L.ring(M.ALL, c, u, up, P.warpR[i] + hw * 0.4 + 0.6, 40, RED_HOT);
  }
}

// ------------------------------------------------------------------ for racers
// Whether a racer is drawn bent, and where: fills out { pos, up, fwd, right } and returns true. A pipe bends anyone on
// it; a corkscrew only the craft that clings to it (the others are jumping it, in the flat world).
const _t = new THREE.Vector3();
const _r = new THREE.Vector3();
const _f = new THREE.Vector3();
export function bendRacer(r, out) {
  const g = r.gnd;
  const P = g.onRoad ? g.path : r.track?.path;
  if (!P?.warpK) return false;
  const h = r.pos.y - (g.onRoad ? g.y : -1e9);
  if (!g.onRoad || h > 5) return false;
  const i = g.i;
  if (!(P.warpK[i] > 0)) return false;
  if (P.warpKind[i] === SCREW && !(r.hints._cling && r.mode === RED)) return false;
  const fi = g.f * (P.closed ? P.N : P.N - 1);
  P.bend(fi, g.lat, Math.max(0, h), out.pos, out.up, out.right);
  // the facing, bent: its part along the road stays along the road, its part across the road follows the bend
  const i0 = Math.floor(fi);
  _t.set(P.tx[P.wrap(i0)], P.ty[P.wrap(i0)], P.tz[P.wrap(i0)]).normalize();
  _r.set(P.rightX(i0), 0, P.rightZ(i0));
  _f.set(Math.sin(r.yaw), 0, Math.cos(r.yaw));
  const along = _f.x * P.thx[P.wrap(i0)] + _f.z * P.thz[P.wrap(i0)];
  const across = _f.dot(_r);
  out.fwd.copy(_t).multiplyScalar(along).addScaledVector(out.right, across);
  out.fwd.addScaledVector(out.up, -out.fwd.dot(out.up)).normalize();
  return true;
}

// Is the lens locked while you're up a pipe wall or rolling through a corkscrew (shifting out of RED there would drop
// you off the ceiling)?
export function lensHeld(r) {
  const g = r.gnd;
  if (!g.onRoad || !g.path?.warpK || r.mode !== RED) return false;
  const P = g.path;
  if (!(P.warpK[g.i] > 0)) return false;
  if (P.warpKind[g.i] === SCREW) return !!P.cling?.[g.i];
  return Math.abs(g.lat) > P.halfW - 1.5;
}

export { RED };
