// Scenery for DREAM FOLD: a street-level city laid out on a grid under and around the raised road, so that when the
// course folds (fold.js) there is a whole city to curl up into the sky.
//
// Along the road the towers are fixed. Away from it the city is cut into districts, each a square of towers that is
// one piece and can move: on the last lap the districts slide into the empty lots beside them, then lift off
// the ground and turn, slowly, like the glass in a kaleidoscope. A district only ever moves through ground
// that no road crosses, so nothing drifts over the track.

import * as THREE from '../../vendor/three.js';
import { M, COLORS } from './shift.js';
import { Layers } from './layers.js';
import { damp, smoothstep } from '../core/util.js';

const CELL = 80; // a district's lot
const REACH = 34; // a district's towers stay inside this circle, so it can turn where it stands
const STEP = 24; // street grid

export function buildDreamCity(world, L, main, rng) {
  const y0 = world.floorY;
  // every road sample, bucketed, for "is there road near here"
  const B = 40;
  const hash = new Map();
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of world.paths) {
    for (let i = 0; i < p.N; i++) {
      const k = `${Math.floor(p.px[i] / B)},${Math.floor(p.pz[i] / B)}`;
      let a = hash.get(k);
      if (!a) hash.set(k, (a = []));
      a.push(p.px[i], p.pz[i], p.halfW);
      x0 = Math.min(x0, p.px[i]);
      x1 = Math.max(x1, p.px[i]);
      z0 = Math.min(z0, p.pz[i]);
      z1 = Math.max(z1, p.pz[i]);
    }
  }
  // how far (x, z) is from the nearest road's edge, up to `far`
  const roadGap = (x, z, far) => {
    let best = far;
    const n = Math.ceil((far + 14) / B);
    const cx = Math.floor(x / B);
    const cz = Math.floor(z / B);
    for (let ix = cx - n; ix <= cx + n; ix++) {
      for (let iz = cz - n; iz <= cz + n; iz++) {
        const a = hash.get(`${ix},${iz}`);
        if (!a) continue;
        for (let q = 0; q < a.length; q += 3) best = Math.min(best, Math.hypot(a[q] - x, a[q + 1] - z) - a[q + 2]);
      }
    }
    return best;
  };

  // the city's ground: the lots round the course, snapped to the street grid
  const snap = (v, up) => (up ? Math.ceil : Math.floor)(v / CELL) * CELL;
  const X0 = snap(x0 - 150, false);
  const X1 = snap(x1 + 150, true);
  // (south to north it's the fold's own ground, so the ring BLUE rolls it into closes on itself)
  const Z0 = world.fold?.z0 ?? snap(z0 - 130, false);
  const Z1 = world.fold?.z1 ?? snap(z1 + 110, true);
  // nothing may reach the line the city curls round
  const TOP = (world.fold?.r ?? 110) - (main.minY - y0) - 20;

  // ------------------------------------------------------------------ the ground
  // dark glass tiles and a street grid, in pieces short enough to bend
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let x = X0; x < X1; x += STEP) {
    for (let z = Z0; z < Z1; z += STEP) {
      L.fillQuad(M.ALL, a.set(x, y0, z), b.set(x, y0, z + STEP), c.set(x + STEP, y0, z + STEP), d.set(x + STEP, y0, z));
    }
  }
  const dimR = new THREE.Color(COLORS.red).multiplyScalar(0.42);
  const dimB = new THREE.Color(COLORS.blue).multiplyScalar(0.42);
  for (let x = X0; x <= X1; x += STEP) {
    for (let z = Z0; z < Z1; z += STEP / 2) L.lineXYZ(M.ALL, x, y0 + 0.06, z, x, y0 + 0.06, z + STEP / 2, dimR);
  }
  for (let z = Z0; z <= Z1; z += STEP) {
    for (let x = X0; x < X1; x += STEP) L.lineXYZ(M.ALL, x, y0 + 0.06, z, x + STEP, y0 + 0.06, z, dimB);
  }

  // ------------------------------------------------------------------ lots
  // a lot is free when no road comes near the circle a district turns in; the others get fixed towers where there's room
  const nx = Math.round((X1 - X0) / CELL);
  const nz = Math.round((Z1 - Z0) / CELL);
  const lot = (ix, iz) => ({ ix, iz, x: X0 + (ix + 0.5) * CELL, z: Z0 + (iz + 0.5) * CELL });
  const free = new Map();
  const key = (ix, iz) => `${ix},${iz}`;
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const q = lot(ix, iz);
      if (roadGap(q.x, q.z, REACH + 8) >= REACH + 8) free.set(key(ix, iz), q);
    }
  }
  // (two free lots side by side: the ground between them is free too)
  const open = (p, q) => roadGap((p.x + q.x) / 2, (p.z + q.z) / 2, REACH + 8) >= REACH + 8;

  const tone = (ix, iz) => ((ix + iz) % 2 ? M.R : M.B);
  const height = () => Math.min(TOP, 14 + rng() ** 1.6 * 50);

  // fixed towers in the lots the road runs through
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      if (free.has(key(ix, iz))) continue;
      const q = lot(ix, iz);
      for (const [ox, oz] of [[-20, -20], [20, -20], [-20, 20], [20, 20]]) {
        const w = 12 + rng() * 12;
        const dd = 12 + rng() * 12;
        const x = q.x + ox + (rng() - 0.5) * 8;
        const z = q.z + oz + (rng() - 0.5) * 8;
        // low beside the road and taller behind, so the street is a valley you can see the fold from
        const gap = roadGap(x, z, 70);
        if (gap < Math.hypot(w, dd) / 2 + 3.5) continue;
        const h = Math.min(height(), 7 + gap * 0.75);
        L.tower(rng() < 0.5 ? M.R : M.B, x, y0, z, w, h, dd, 0);
      }
    }
  }

  // ------------------------------------------------------------------ districts
  // three lots in four start with a district on them; the rest are the empty lots districts slide into
  const lots = [...free.values()];
  const districts = [];
  const taken = new Set();
  for (const q of lots) {
    if (rng() < 0.24) continue;
    taken.add(key(q.ix, q.iz));
    // (built by its own batch, drawn with the course's materials, so it fades with the lens like everything else)
    const sub = new Layers();
    L.materials(M.R);
    L.materials(M.B);
    sub.mats = L.mats;
    const mask = tone(q.ix, q.iz);
    const other = mask === M.R ? M.B : M.R;
    const n = rng() < 0.3 ? 1 : 2;
    const pitch = n === 1 ? 0 : 15.5;
    for (let ax = 0; ax < n; ax++) {
      for (let az = 0; az < n; az++) {
        const w = n === 1 ? 34 + rng() * 10 : 11 + rng() * 6.5;
        const dd = n === 1 ? 34 + rng() * 10 : 11 + rng() * 6.5;
        const h = Math.min(TOP - 14, n === 1 ? 30 + rng() * 22 : height());
        // mostly the district's own world, with a tower of the other one in it now and then
        sub.tower(rng() < 0.2 ? other : mask, (ax * 2 - n + 1) * pitch, 0, (az * 2 - n + 1) * pitch, w, h, dd, 0);
      }
    }
    // a plinth, so a district that has lifted off reads as a slab of city, not loose towers
    sub.box(mask, 0, -0.6, 0, REACH * 1.9, 1.2, REACH * 1.9, 0, null, true);
    const g = sub.build();
    g.position.set(q.x, y0, q.z);
    world.group.add(g);
    const D = { g, lots: [q, q], seed: rng(), spin: rng() < 0.5 ? 1 : -1, x: q.x, z: q.z, y: 0, rot: 0, tilt: 0, hop: 0 };
    districts.push(D);
  }
  // where each district goes on the last lap: into an empty lot beside it, if one is left
  for (const lap of [1]) {
    const used = new Set(districts.map((D) => key(D.lots[lap - 1].ix, D.lots[lap - 1].iz)));
    for (const D of districts) {
      const from = D.lots[lap - 1];
      D.lots[lap] = from;
      const order = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => rng() - 0.5);
      for (const [dx, dz] of order) {
        const to = free.get(key(from.ix + dx, from.iz + dz));
        if (!to || used.has(key(to.ix, to.iz)) || !open(from, to)) continue;
        used.add(key(to.ix, to.iz));
        D.lots[lap] = to;
        break;
      }
    }
  }

  // ------------------------------------------------------------------ between laps
  let lapSeen = 0;
  let since = 99;
  world.animated.push((t, dt) => {
    const lap = Math.min(1, world.fold?.lap ?? 0);
    if (lap !== lapSeen) {
      lapSeen = lap;
      since = 0;
    }
    since += dt;
    for (const D of districts) {
      const to = D.lots[lap];
      // they don't all go at once: the move runs out across the city over a couple of seconds
      const go = since > D.seed * 1.6;
      if (go) {
        D.x = damp(D.x, to.x, 1.5, dt);
        D.z = damp(D.z, to.z, 1.5, dt);
      }
      const away = Math.hypot(to.x - D.x, to.z - D.z);
      // a district on the move rides a little above the street; on the last lap they all float, and turn
      const kal = lap === 1 && go && away < 6 ? 1 : 0;
      const yT = smoothstep(0.5, 12, away) * 5 + kal * (5 + D.seed * 9 + Math.sin(t * 0.5 + D.seed * 40) * 1.5);
      D.y = damp(D.y, yT, 1.6, dt);
      D.rot = kal ? D.rot + dt * 0.11 * D.spin : damp(D.rot, 0, 1.2, dt);
      D.tilt = damp(D.tilt, kal * 0.1 * Math.sin(t * 0.33 + D.seed * 17), 1.5, dt);
      D.g.position.set(D.x, y0 + D.y, D.z);
      D.g.rotation.set(D.tilt, D.rot, D.tilt * 0.6 * D.spin);
    }
  });
}
