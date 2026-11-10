// Scenery for the ten concept courses, all neon wireframe. Scenery doesn't collide, but it is still drawn for a
// world (red, blue, or both), so a shift changes the skyline as well as the road.

import * as THREE from '../../vendor/three.js';
import { M, COLORS, RED, solidIn } from './shift.js';
import { buildDropTower } from './marblerun.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

export function buildDecor(world) {
  const kind = world.def.decor || 'core';
  const fn = DECOR[kind] || DECOR.core;
  fn(world, world.layers, world.main, world.rng);
}

// Positions beside the main road: every `step` samples, at distance `d` to one side.
function beside(main, step, d, cb, start = 0) {
  for (let i = start; i < main.N; i += step) {
    for (const s of [-1, 1]) {
      const lat = s * (main.halfW + d);
      const p = main.point(i, lat, 0, new THREE.Vector3());
      cb(p, i, s);
    }
  }
}

// Too close to any road? (so scenery never sits on a road)
function clear(world, p, r) {
  for (const path of world.paths) {
    for (let i = 0; i < path.N; i += 3) {
      const dx = path.px[i] - p.x;
      const dz = path.pz[i] - p.z;
      if (dx * dx + dz * dz < (path.halfW + r) ** 2 && Math.abs(path.py[i] - p.y) < 40) return false;
    }
  }
  return true;
}

const alt = (i, s) => ((i + (s > 0 ? 1 : 0)) % 2 ? M.R : M.B);

// Arches spanning the road at sample i.
function arch(L, main, i, mask, r, width = 2.2, color = null, arc = Math.PI, a0 = 0) {
  const c = main.point(i, 0, 0, new THREE.Vector3());
  const u = V(main.rightX(i), 0, main.rightZ(i));
  L.hoop(mask, c, u, UP, r, width, 36, color, arc, a0);
}

const DECOR = {
  // 21 DROP TOWER: the marble run and its moving pieces (marblerun.js)
  marblerun: buildDropTower,

  // 01 CORE CIRCUIT: big red and blue arches, a skyline at the edges.
  core(world, L, main, rng) {
    for (let i = 20; i < main.N; i += 70) {
      const k = Math.floor(i / 70);
      arch(L, main, i, k % 2 ? M.R : M.B, main.halfW + 6 + (k % 3) * 3, 2.2);
      arch(L, main, i + 6, k % 2 ? M.B : M.R, main.halfW + 2.5, 1.2);
    }
    beside(main, 9, 22, (p, i, s) => {
      const q = p.clone().add(V((rng() - 0.5) * 30, 0, (rng() - 0.5) * 30));
      q.y = world.floorY;
      if (!clear(world, q, 10)) return;
      const h = 20 + rng() * 70;
      L.tower(alt(i, s), q.x, q.y, q.z, 8 + rng() * 8, h, 8 + rng() * 8, rng() * 3);
    });
  },

  // 02 LAYERED GRID: gantries and overpass frames at several heights.
  layered(world, L, main, rng) {
    for (let i = 10; i < main.N; i += 40) {
      const p = main.point(i, 0, 0);
      const yaw = Math.atan2(main.thx[i], main.thz[i]);
      const mask = (i / 40) % 2 < 1 ? M.R : M.B;
      const w = (main.halfW + 6) * 2;
      for (const s of [-1, 1]) {
        const q = main.point(i, s * (main.halfW + 3), 0);
        L.box(mask, q.x, (q.y + world.floorY) / 2 + 8, q.z, 1.6, q.y - world.floorY + 16, 1.6, yaw, null, true);
      }
      L.box(mask, p.x, p.y + 16, p.z, w, 1.6, 3, yaw, null, true);
      L.box(mask === M.R ? M.B : M.R, p.x, p.y + 24, p.z, w * 0.7, 1.2, 2, yaw + 0.5, null, false);
    }
    beside(main, 11, 30, (p, i, s) => {
      p.y = world.floorY;
      if (!clear(world, p, 14)) return;
      L.tower(alt(i, s), p.x, p.y, p.z, 10, 30 + rng() * 60, 10, 0);
    });
  },

  // 03 SHIFT TUNNELS: hexagon rings around the road, red and blue rotated against each other.
  tunnels(world, L, main) {
    const hex = (i, mask, r, rot) => {
      const c = main.point(i, 0, main.halfW * 0.35);
      const u = V(main.rightX(i), 0, main.rightZ(i));
      const n = 6;
      const P = [];
      for (let k = 0; k <= n; k++) {
        const a = rot + (k / n) * Math.PI * 2;
        P.push(c.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(UP, Math.sin(a) * r));
      }
      for (let k = 0; k < n; k++) {
        L.line(mask, P[k], P[k + 1]);
        const d = P[k].clone().lerp(c, -0.12);
        const e = P[k + 1].clone().lerp(c, -0.12);
        // kept dim: seen end-on down a tunnel these stack up additively into a white-out
        L.quad(mask, P[k], P[k + 1], e, d, null, 0.26);
      }
      return P;
    };
    let prevR = null;
    let prevB = null;
    for (let i = 0; i < main.N; i += 5) {
      // (not round a full pipe: that's its own tube, warp.js)
      const inTunnel = Math.sin((i / main.N) * Math.PI * 2 * 3) > -0.3 && !(main.warpK?.[i] > 0 || main.warpK?.[main.wrap(i + 2)] > 0);
      if (!inTunnel) {
        prevR = prevB = null;
        continue;
      }
      const R = hex(i, M.R, main.halfW + 4.5, 0);
      const B = hex(i + 2, M.B, main.halfW + 3.5, Math.PI / 6);
      if (prevR) for (let k = 0; k < 6; k++) L.line(M.R, prevR[k], R[k]);
      if (prevB) for (let k = 0; k < 6; k++) L.line(M.B, prevB[k], B[k]);
      prevR = R;
      prevB = B;
    }
    // Secret bores: where a red-only branch leaves through the tunnel wall, a blue iris hatch seals it in the other
    // worlds. Easy to miss, never needed; shift to RED as you pass and it opens.
    for (const b of world.paths) {
      if (!b.def?.hatch) continue;
      let j = 0;
      const fr = {};
      for (; j < b.N; j++) {
        if (!main.frame(b.px[j], b.pz[j], -1, fr)) break;
        if (Math.abs(fr.lat) > main.halfW + 3) break;
      }
      world.addObstacle({ type: 'wall', door: true, path: b.id, at: b.frac(Math.min(b.N - 1, j)), mask: M.B, r: b.halfW + 1.8, cy: b.halfW * 0.45 });
      // and the bore itself: a twisting red-only hex tube, a tunnel you only see through the red lens
      let prev = null;
      for (let k = j + 3, n = 0; k < b.N - 6; k += 3, n++) {
        const c = b.point(k, 0, b.halfW * 0.35);
        const u = V(b.rightX(k), 0, b.rightZ(k));
        const r = b.halfW + 2.5;
        const rot = n * 0.09;
        const P = [];
        for (let q = 0; q <= 6; q++) {
          const a = rot + (q / 6) * Math.PI * 2;
          P.push(c.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(UP, Math.sin(a) * r));
        }
        for (let q = 0; q < 6; q++) {
          L.line(M.RO, P[q], P[q + 1]);
          // a flange on every other ring, dim like the main tunnel's so the stack doesn't white out
          if (n % 2 === 0) L.quad(M.RO, P[q], P[q + 1], P[q + 1].clone().lerp(c, -0.12), P[q].clone().lerp(c, -0.12), null, 0.3);
        }
        if (prev) for (let q = 0; q < 6; q++) L.line(M.RO, prev[q], P[q]);
        prev = P;
      }
    }
  },

  // 04 ORBITAL LOOPS: giant loops off to the side, a planet, floating cubes.
  orbital(world, L, main, rng) {
    for (let i = 30; i < main.N; i += 110) {
      const s = (i / 110) % 2 < 1 ? 1 : -1;
      const c = main.point(i, s * (main.halfW + 46), 38);
      const u = V(main.thx[i], 0, main.thz[i]);
      L.hoop(s > 0 ? M.R : M.B, c, u, UP, 36, 6, 48);
      L.hoop(s > 0 ? M.B : M.R, c.clone().add(V(0, 0, 0)), V(main.rightX(i), 0, main.rightZ(i)), UP, 28, 3, 40);
    }
    const ctr = V(0, 0, 0);
    for (let i = 0; i < main.N; i++) ctr.add(V(main.px[i], 0, main.pz[i]));
    ctr.multiplyScalar(1 / main.N);
    const planet = V(ctr.x + 420, 160, ctr.z - 520);
    for (let k = 0; k < 10; k++) L.ring(M.B, planet, V(1, 0, 0), V(0, Math.cos((k / 10) * Math.PI), Math.sin((k / 10) * Math.PI)), 120, 48);
    L.ring(M.R, planet, V(1, 0, 0), V(0, 0.25, 1).normalize(), 210, 64);
    for (let k = 0; k < 40; k++) {
      const p = V(ctr.x + (rng() - 0.5) * 900, world.maxY + 20 + rng() * 120, ctr.z + (rng() - 0.5) * 900);
      L.box(k % 2 ? M.R : M.B, p.x, p.y, p.z, 8, 8, 8, rng() * 3, null, true);
    }
  },

  // 05 GRID CITY: dense neon towers right up to the road, sky bridges.
  city(world, L, main, rng) {
    // A row of buildings that exists in the red world exactly where the blue world has a ramp: in RED they're a
    // block of rooftops, in BLUE their roofs are the road. (Branches with a facade mask.)
    for (const b of world.paths) {
      if (!b.def?.facade) continue;
      const step = 4;
      for (let j = 4; j < b.N - 4; j += step) {
        const p = b.point(j, 0, 0);
        const h = p.y - world.floorY - 0.4;
        if (h < 4) continue;
        const yaw = Math.atan2(b.thx[j], b.thz[j]);
        L.tower(b.def.facade, p.x, world.floorY, p.z, b.halfW * 2 - 0.6, h, b.ds * step - 0.4, yaw);
      }
    }
    beside(main, 4, 6, (p, i, s) => {
      const q = p.clone().add(V((rng() - 0.5) * 6, 0, (rng() - 0.5) * 6));
      q.y = world.floorY;
      if (!clear(world, q, 6)) return;
      const h = p.y - world.floorY + 12 + rng() * 80;
      L.tower(alt(i, s), q.x, q.y, q.z, 6 + rng() * 6, h, 6 + rng() * 6, Math.atan2(main.thx[i], main.thz[i]));
    });
    beside(main, 7, 40, (p, i, s) => {
      p.y = world.floorY;
      if (!clear(world, p, 18)) return;
      L.tower(alt(i + 1, s), p.x, p.y, p.z, 14, 60 + rng() * 120, 14, rng());
    });
    for (let i = 15; i < main.N; i += 55) {
      const a = main.point(i, -(main.halfW + 9), 22);
      const b = main.point(i, main.halfW + 9, 22);
      const m = (i / 55) % 2 < 1 ? M.R : M.B;
      const mid = a.clone().lerp(b, 0.5);
      L.box(m, mid.x, mid.y, mid.z, a.distanceTo(b), 2, 4, Math.atan2(main.thx[i], main.thz[i]), null, true);
    }
  },

  // 06 VOID FIELD: floating cubes everywhere, a black hole ring.
  void(world, L, main, rng) {
    for (let k = 0; k < 160; k++) {
      const i = Math.floor(rng() * main.N);
      const s = rng() < 0.5 ? -1 : 1;
      const p = main.point(i, s * (main.halfW + 8 + rng() * 80), 6 + rng() * 60);
      const sz = 2 + rng() * 10;
      L.box(k % 2 ? M.R : M.B, p.x, p.y, p.z, sz, sz, sz, rng() * 3, null, true);
    }
    const c = main.point(Math.floor(main.N * 0.3), 140, 90);
    for (let k = 0; k < 6; k++) L.ring(k % 2 ? M.R : M.B, c, V(1, 0, 0), V(0, 0.3, 1).normalize(), 30 + k * 9, 60);
  },

  // 07 HELIX ASCENT: a central glowing column, spiral ribbons around it.
  helix(world, L, main) {
    const ctr = world.def.helixCenter ? V(world.def.helixCenter[0], 0, world.def.helixCenter[1]) : V(0, 0, 0);
    const top = world.maxY + 30;
    L.cylinder(M.ALL, ctr.x, world.floorY, ctr.z, 16, top - world.floorY, 12, 16, 0x6ac8ff);
    L.cylinder(M.B, ctr.x, world.floorY, ctr.z, 22, top - world.floorY, 16, 8);
    for (const [mask, r, ph] of [[M.R, 40, 0], [M.B, 48, Math.PI]]) {
      let prev = null;
      for (let k = 0; k <= 240; k++) {
        const a = ph + (k / 240) * Math.PI * 8;
        const y = world.floorY + (k / 240) * (top - world.floorY);
        const p = V(ctr.x + Math.cos(a) * r, y, ctr.z + Math.sin(a) * r);
        if (prev) {
          L.line(mask, prev, p);
          L.quad(mask, prev, p, p.clone().add(V(0, 2, 0)), prev.clone().add(V(0, 2, 0)), null, 0.4);
        }
        prev = p;
      }
    }
  },

  // 08 FRACTAL ROUTE: nested square frames that repeat down the road.
  fractal(world, L, main) {
    for (let i = 0; i < main.N; i += 9) {
      const c = main.point(i, 0, main.halfW * 0.6);
      const u = V(main.rightX(i), 0, main.rightZ(i));
      const k = Math.floor(i / 9);
      for (let n = 0; n < 3; n++) {
        const r = main.halfW + 3 + n * 5;
        const mask = (k + n) % 2 ? M.R : M.B;
        const P = [[-1, -0.4], [1, -0.4], [1, 1], [-1, 1]].map(([a, b]) => c.clone().addScaledVector(u, a * r).addScaledVector(UP, b * r));
        for (let q = 0; q < 4; q++) L.line(mask, P[q], P[(q + 1) % 4]);
        if (n === 0) L.quad(mask, P[2], P[3], P[3].clone().add(V(0, -0.8, 0)), P[2].clone().add(V(0, -0.8, 0)), null, 0.6);
      }
    }
  },

  // 09 SHIFT LATTICE: a web of beams over the course.
  lattice(world, L, main, rng) {
    const pts = [];
    for (let i = 0; i < main.N; i += 14) {
      for (const s of [-1, 1]) pts.push(main.point(i, s * (main.halfW + 10 + rng() * 20), 18 + rng() * 30));
    }
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k];
      for (let q = 1; q <= 3; q++) {
        const b = pts[(k + q * 2 + 1) % pts.length];
        if (a.distanceTo(b) > 90) continue;
        L.line(k % 2 ? M.R : M.B, a, b);
      }
      L.box(k % 2 ? M.R : M.B, a.x, a.y, a.z, 3, 3, 3, 0, null, true);
      L.lineXYZ(M.ALL, a.x, a.y, a.z, a.x, world.floorY, a.z, 0x3a2a6a);
    }
  },

  // 10 ECHO RUINS: broken arches and pillars, remnants of a bigger structure.
  ruins(world, L, main, rng) {
    for (let i = 25; i < main.N; i += 60) {
      const k = Math.floor(i / 60);
      const arc = Math.PI * (0.45 + rng() * 0.45);
      arch(L, main, i, k % 2 ? M.R : M.B, main.halfW + 8 + rng() * 8, 3, null, arc, rng() * (Math.PI - arc));
    }
    beside(main, 10, 14, (p, i, s) => {
      p.y = world.floorY;
      if (!clear(world, p, 8)) return;
      const h = 10 + rng() * 40;
      L.box(alt(i, s), p.x, p.y + h / 2, p.z, 4, h, 4, rng(), null, true);
      if (rng() < 0.5) L.box(alt(i + 1, s), p.x + 3, p.y + 2, p.z + 2, 6, 3, 3, rng() * 2, null, true);
    });
    const c = main.point(Math.floor(main.N * 0.6), -160, 60);
    L.hoop(M.B, c, V(1, 0, 0), UP, 90, 10, 64, null, Math.PI * 1.4, -0.2);
    L.hoop(M.R, c, V(1, 0, 0), UP, 60, 6, 48, null, Math.PI * 1.2, 0.3);
  },
};

export const DECOR_KINDS = Object.keys(DECOR);
void COLORS;
