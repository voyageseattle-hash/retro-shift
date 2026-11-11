// FLIPPER ALLEY's art pass: the inside of the machine, close beside the road. Everything here is scenery (nothing
// collides): lane posts and their rubbers, wire gates over the road, raised plastics, target banks, giant pop bumpers
// and flasher domes over the open playfield, the cabinet's inner walls with their side art and a row of lamps, the
// apron's cards, a sunburst round the backbox, and the playfield's own paint (a harlequin of red and blue diamonds).
//
// Red pieces are the red world's and blue pieces the blue world's, so a lens shows one set and not the other; the
// machine's own metal and its amber lamps are neutral, and through a lens they take that lens's colour like every
// neutral piece.

import * as THREE from '../../vendor/three.js';
import { M, RED, BLUE, colorForMask } from './shift.js';
import { TABLE, SC, V3, tableY } from './pinball.js';

const AMBER = 0xffb43c;
const CHROME = 0xdfe8ff;
const YELLOW = 0xffd23a;
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// How far a point of the table is from the nearest road's edge (and from the cabinet), in metres. World x/z in.
function roomFn(world) {
  const { x1, z0, z1 } = TABLE;
  const taken = [];
  for (const p of world.paths) {
    if (p.id === 'trough') continue; // (under the table)
    for (let i = 0; i < p.N; i += 2) {
      if (p.py[i] - tableY(p.pz[i]) > 14) continue; // (the wire, high overhead)
      taken.push(p.px[i], p.pz[i], p.halfW);
    }
  }
  return (wx, wz) => {
    const x = -wx / SC;
    const z = wz / SC;
    let d = Math.min((x1 - Math.abs(x)) * SC, (z - z0) * SC, (z1 - z) * SC);
    if (z > 540) d = Math.min(d, (1 - Math.hypot(x / x1, (z - 540) / (z1 - 540))) * 160);
    for (let k = 0; k < taken.length && d > 0; k += 3) d = Math.min(d, Math.hypot(wx - taken[k], wz - taken[k + 1]) - taken[k + 2]);
    return d;
  };
}

// ------------------------------------------------------------------ the still scenery, batched with the course
// The table is full of pieces and they're drawn in light that adds up, so at the far end of a straight a hundred of
// them would sum to white. Everything here is drawn through this: the course's batch, with lines at LINE_K of their
// colour and lit faces at FACE_K.
const LINE_K = 0.5;
const FACE_K = 0.42;
const _c = new THREE.Color();
function dimmed(layers) {
  const L = Object.create(layers);
  const dim = (mask, color) => _c.set(color ?? colorForMask(mask)).multiplyScalar(LINE_K).getHex();
  L.line = (mask, a, b, color = null) => layers.line(mask, a, b, dim(mask, color));
  L.lineXYZ = (mask, ax, ay, az, bx, by, bz, color = null) => layers.lineXYZ(mask, ax, ay, az, bx, by, bz, dim(mask, color));
  L.quad = (mask, a, b, c, d, color = null, k = 1) => layers.quad(mask, a, b, c, d, color, k * FACE_K);
  L.quadFade = (mask, a, b, c, d, color, k0, k1) => layers.quadFade(mask, a, b, c, d, color, k0 * FACE_K, k1 * FACE_K);
  return L;
}

export function pinballScenery(world, layers, main) {
  const L = dimmed(layers);
  const room = roomFn(world);
  const { x0, x1, z0, z1 } = TABLE;
  const P = (x, z, h = 0) => V3(x, z, h);
  const lamps = (world.pinballLamps = []); // where the chase lamps go (pinballSceneryArt makes them)

  // a flat ring of light lying on (or over) the playfield
  const annulus = (mask, c, r0, r1, seg, k, color = null) => {
    for (let q = 0; q < seg; q++) {
      const a0 = (q / seg) * Math.PI * 2;
      const a1 = ((q + 1) / seg) * Math.PI * 2;
      const a = v(c.x + Math.cos(a0) * r0, c.y, c.z + Math.sin(a0) * r0);
      const b = v(c.x + Math.cos(a1) * r0, c.y, c.z + Math.sin(a1) * r0);
      const cc = v(c.x + Math.cos(a1) * r1, c.y, c.z + Math.sin(a1) * r1);
      const d = v(c.x + Math.cos(a0) * r1, c.y, c.z + Math.sin(a0) * r1);
      L.quad(mask, a, b, cc, d, color, k);
    }
  };
  // a round wall, dark so what's behind it doesn't show through
  const drum = (mask, c, r0, r1, h, seg) => {
    for (let q = 0; q < seg; q++) {
      const a0 = (q / seg) * Math.PI * 2;
      const a1 = ((q + 1) / seg) * Math.PI * 2;
      L.fillQuad(mask, v(c.x + Math.cos(a0) * r0, c.y, c.z + Math.sin(a0) * r0), v(c.x + Math.cos(a1) * r0, c.y, c.z + Math.sin(a1) * r0), v(c.x + Math.cos(a1) * r1, c.y + h, c.z + Math.sin(a1) * r1), v(c.x + Math.cos(a0) * r1, c.y + h, c.z + Math.sin(a0) * r1));
    }
  };
  // a small amber lamp: a diamond of light
  const lamp = (c, r = 0.8) => {
    const top = v(c.x, c.y + r * 1.4, c.z);
    const bot = v(c.x, c.y - r * 1.4, c.z);
    const E = [v(c.x + r, c.y, c.z), v(c.x, c.y, c.z + r), v(c.x - r, c.y, c.z), v(c.x, c.y, c.z - r)];
    for (let q = 0; q < 4; q++) {
      const e0 = E[q];
      const e1 = E[(q + 1) % 4];
      L.line(M.ALL, top, e0, AMBER);
      L.line(M.ALL, bot, e0, AMBER);
      L.quad(M.ALL, top, e0, e1, e1, AMBER, 0.55);
      L.quad(M.ALL, bot, e0, e1, e1, AMBER, 0.55);
    }
  };

  // ---- a giant pop bumper: skirt, body, a wide lit cap. `capMask` is whose world its cap is in.
  const bumper = (c, r, capMask) => {
    const h = r * 0.95;
    const rb = r * 0.6;
    annulus(capMask, v(c.x, c.y + 0.1, c.z), r * 1.02, r * 1.3, 20, 0.28);
    L.ring(capMask, v(c.x, c.y + 0.1, c.z), X, Z, r * 1.3, 20);
    drum(M.ALL, c, rb * 1.12, rb, h, 12);
    L.cylinder(M.ALL, c.x, c.y, c.z, rb, h, 12, 2, CHROME);
    L.ring(M.ALL, c, X, Z, rb * 1.12, 12, CHROME);
    // the cap: a dark disc with a lit rim and a star on top
    const top = v(c.x, c.y + h, c.z);
    const lid = v(c.x, c.y + h + r * 0.16, c.z);
    drum(capMask, top, r * 0.9, r, r * 0.16, 16);
    for (let q = 0; q < 16; q++) {
      const a0 = (q / 16) * Math.PI * 2;
      const a1 = ((q + 1) / 16) * Math.PI * 2;
      const e0 = v(lid.x + Math.cos(a0) * r, lid.y, lid.z + Math.sin(a0) * r);
      const e1 = v(lid.x + Math.cos(a1) * r, lid.y, lid.z + Math.sin(a1) * r);
      L.fillQuad(capMask, lid, e0, e1, lid);
      L.quad(capMask, lid, e0, e1, lid, null, q % 2 ? 0.34 : 0.14);
      L.line(capMask, e0, e1);
      if (q % 2 === 0) L.line(capMask, lid, e0);
    }
    L.ring(capMask, top, X, Z, r * 0.9, 16);
    annulus(capMask, v(c.x, c.y + h - 0.05, c.z), rb, r * 0.9, 16, 0.2); // the cap's light on its own underside
    lamp(v(c.x, lid.y + 1.3, c.z), 0.9);
  };

  // ---- a flasher dome on a stalk: an amber dome (the warm lamp of the table), a red or blue collar under it
  const flasher = (c, r, mask) => {
    const h = r * 1.9;
    L.cylinder(M.ALL, c.x, c.y, c.z, r * 0.22, h, 6, 1, CHROME);
    annulus(mask, v(c.x, c.y + 0.1, c.z), r * 0.4, r * 0.9, 12, 0.22);
    const base = v(c.x, c.y + h, c.z);
    drum(mask, base, r * 0.55, r, r * 0.25, 12);
    L.ring(mask, base, X, Z, r * 0.55, 12);
    L.ring(mask, v(base.x, base.y + r * 0.25, base.z), X, Z, r, 12);
    // the dome: three hoops of latitude and six ribs
    const dome = (lat) => [Math.cos(lat) * r * 0.94, base.y + r * 0.25 + Math.sin(lat) * r * 0.94];
    for (let q = 0; q < 12; q++) {
      const a0 = (q / 12) * Math.PI * 2;
      const a1 = ((q + 1) / 12) * Math.PI * 2;
      for (let s = 0; s < 3; s++) {
        const [r0, y0] = dome((s / 3) * (Math.PI / 2));
        const [r1, y1] = dome(((s + 1) / 3) * (Math.PI / 2));
        const a = v(c.x + Math.cos(a0) * r0, y0, c.z + Math.sin(a0) * r0);
        const b = v(c.x + Math.cos(a1) * r0, y0, c.z + Math.sin(a1) * r0);
        const cc = v(c.x + Math.cos(a1) * r1, y1, c.z + Math.sin(a1) * r1);
        const d = v(c.x + Math.cos(a0) * r1, y1, c.z + Math.sin(a0) * r1);
        L.quad(M.ALL, a, b, cc, d, AMBER, 0.3 - s * 0.06);
        L.line(M.ALL, a, b, AMBER);
        if (q % 2 === 0) L.line(M.ALL, a, d, AMBER);
      }
    }
    // its light on the playfield
    annulus(M.ALL, v(c.x, c.y + 0.12, c.z), r * 0.9, r * 2.2, 12, 0.07, AMBER);
  };

  // ---- over the open playfield: giant bumpers and flasher domes, the biggest where there's most room
  const spots = [];
  for (let x = x0 + 14; x < x1 - 10; x += 9) {
    for (let z = z0 + 14; z < z1 - 10; z += 9) {
      if (Math.hypot(x - 20, z - 468) < 70) continue; // (the pit and its own bumpers)
      const c = P(x, z, -0.5);
      const d = room(c.x, c.z);
      if (d >= 6) spots.push({ c, d });
    }
  }
  spots.sort((a, b) => b.d - a.d);
  const placed = [];
  for (const s of spots) {
    const r = Math.min(11, s.d - 2.2) * 0.8;
    if (placed.some((q) => Math.hypot(q.c.x - s.c.x, q.c.z - s.c.z) < (q.r + r) * 1.3 + 7)) continue;
    placed.push({ c: s.c, r });
    if (placed.length > 44) break;
  }
  placed.forEach(({ c, r }, k) => {
    // (which world by where it stands, so the two colours are mixed over the whole table)
    const mask = (Math.round(c.x / 30) + Math.round(c.z / 30)) % 2 ? M.R : M.B;
    if (k % 3 === 2 || r < 4.2) flasher(c, Math.min(r, 6.5), mask);
    else bumper(c, r, mask);
  });

  // ---- along the road, every dozen metres
  const hw = main.halfW;
  const step = Math.max(1, Math.round(12 / main.ds));
  const clearAt = (i, lat, need = 1.2) => {
    const p = main.point(i, lat, 0, new THREE.Vector3());
    return room(p.x, p.z) >= need;
  };
  let lastPost = [null, null];
  for (let i = step, n = 1; i < main.N - step; i += step, n++) {
    // lane posts both sides, a rubber ring on each, a rubber strung from post to post, a lamp on every other
    for (const s of [-1, 1]) {
      const k = s < 0 ? 0 : 1;
      const lat = s * (hw + 2.4);
      if (!clearAt(i, lat)) {
        lastPost[k] = null;
        continue;
      }
      const mask = (n + k) % 2 ? M.R : M.B;
      const base = main.point(i, lat, -0.4, new THREE.Vector3());
      const top = v(base.x, base.y + 5.2, base.z);
      drum(M.ALL, base, 0.6, 0.6, 5.2, 5);
      L.cylinder(M.ALL, base.x, base.y, base.z, 0.6, 5.2, 5, 1, CHROME);
      for (const y of [1.6, 2.1]) L.ring(mask, v(base.x, base.y + y, base.z), X, Z, 1.15, 10);
      annulus(mask, v(base.x, base.y + 1.85, base.z), 0.5, 1.15, 10, 0.5);
      if (n % 2) lamp(v(top.x, top.y + 1.1, top.z), 0.7);
      else L.ring(M.ALL, top, X, Z, 0.8, 6, CHROME);
      const prev = lastPost[k];
      if (prev && prev.n === n - 1) {
        // the rubber sags a little between its posts
        const a = v(prev.x, prev.y + 1.85, prev.z);
        const b = v(base.x, base.y + 1.85, base.z);
        const m0 = a.clone().lerp(b, 0.5);
        m0.y -= 0.35;
        L.line(M.ALL, a, m0, 0xffffff);
        L.line(M.ALL, m0, b, 0xffffff);
      }
      lastPost[k] = { x: base.x, y: base.y, z: base.z, n };
    }

    // a wire gate over the road: two steel posts, a bar, a wire flap hung from it and a lamp either end
    if (n % 6 === 0 && clearAt(i, hw + 3.4) && clearAt(i, -(hw + 3.4))) {
      const mask = (n / 6) % 2 ? M.R : M.B;
      const H = 10.5;
      const ends = [-1, 1].map((s) => main.point(i, s * (hw + 3.4), -0.4, new THREE.Vector3()));
      const yTop = Math.max(ends[0].y, ends[1].y) + H;
      const tops = ends.map((e) => v(e.x, yTop, e.z));
      for (let q = 0; q < 2; q++) {
        drum(M.ALL, ends[q], 0.9, 0.9, yTop - ends[q].y, 6);
        L.cylinder(M.ALL, ends[q].x, ends[q].y, ends[q].z, 0.9, yTop - ends[q].y, 6, 3, CHROME);
        lamp(v(tops[q].x, yTop + 1.6, tops[q].z), 1.1);
        // a lit collar on each post
        L.cylinder(mask, ends[q].x, ends[q].y + 3, ends[q].z, 1.1, 1.4, 8, 1);
      }
      L.line(M.ALL, tops[0], tops[1], CHROME);
      L.line(M.ALL, v(tops[0].x, yTop - 0.7, tops[0].z), v(tops[1].x, yTop - 0.7, tops[1].z), CHROME);
      // the flap: a wire frame hung over the middle of the road, with a lit plate in it
      const at = (u, drop) => tops[0].clone().lerp(tops[1], u).setY(yTop - drop);
      const F = [at(0.3, 0.7), at(0.7, 0.7), at(0.7, 4.2), at(0.3, 4.2)];
      for (let q = 0; q < 4; q++) L.line(mask, F[q], F[(q + 1) % 4]);
      L.quad(mask, F[0], F[1], F[2], F[3], null, 0.3);
      L.line(mask, at(0.3, 2.45), at(0.7, 2.45));
      const G = [at(0.36, 1.2), at(0.64, 1.2), at(0.64, 3.7), at(0.36, 3.7)];
      for (let q = 0; q < 4; q++) L.line(mask, G[q], G[(q + 1) % 4]);
      // and a band of its light on the road's shoulders
      for (const s of [-1, 1]) {
        const a = main.point(i - 1, s * (hw + 0.6), 0.05, new THREE.Vector3());
        const b = main.point(i + 1, s * (hw + 0.6), 0.05, new THREE.Vector3());
        const c = main.point(i + 1, s * (hw + 5.5), -0.4, new THREE.Vector3());
        const d = main.point(i - 1, s * (hw + 5.5), -0.4, new THREE.Vector3());
        L.quad(mask, a, b, c, d, null, 0.22);
      }
    }

    // a raised plastic on one side, a bank of standup targets on the other
    if (n % 6 === 3) {
      const side = ((n - 3) / 6) % 2 ? 1 : -1;
      const pm = ((n - 3) / 6) % 4 < 2 ? M.R : M.B;
      const len = Math.max(2, Math.round(16 / main.ds));
      if (clearAt(i, side * (hw + 6), 3) && clearAt(i + len, side * (hw + 6), 3) && clearAt(i + (len >> 1), side * (hw + 9), 1)) {
        const Hp = 7.4;
        const q = (ii, lat, hh) => main.point(ii, side * lat, hh, new THREE.Vector3());
        // (a plastic is flat: all at one height)
        const y = Math.max(q(i, hw + 2, 0).y, q(i + len, hw + 2, 0).y) + Hp;
        const C = [q(i, hw + 1.6, 0), q(i + len, hw + 1.6, 0), q(i + len, hw + 10.5, 0), q(i + (len >> 1), hw + 13, 0), q(i, hw + 8, 0)];
        const Cy = C.map((p) => v(p.x, y, p.z));
        const mid = Cy.reduce((a, p) => a.add(p), v(0, 0, 0)).multiplyScalar(1 / Cy.length);
        for (let k = 0; k < Cy.length; k++) {
          const a = Cy[k];
          const b = Cy[(k + 1) % Cy.length];
          L.line(pm, a, b);
          L.quad(pm, a, b, mid, mid, null, k % 2 ? 0.26 : 0.16);
          L.fillQuad(pm, a, b, mid, mid);
          // an inner outline, the print on it
          L.line(pm, a.clone().lerp(mid, 0.3), b.clone().lerp(mid, 0.3));
          if (k !== 3) L.lineXYZ(M.ALL, a.x, y, a.z, a.x, C[k].y - 0.4, a.z, CHROME); // its posts
        }
        // a star printed in the middle
        for (let k = 0; k < 5; k++) {
          const a0 = (k / 5) * Math.PI * 2;
          const a1 = ((k + 2) / 5) * Math.PI * 2;
          L.line(pm, v(mid.x + Math.cos(a0) * 2.4, y + 0.05, mid.z + Math.sin(a0) * 2.4), v(mid.x + Math.cos(a1) * 2.4, y + 0.05, mid.z + Math.sin(a1) * 2.4), 0xffffff);
        }
        // its colour falling on the playfield under it
        const U = C.map((p) => v(p.x, p.y - 0.42, p.z));
        const um = U.reduce((a, p) => a.add(p), v(0, 0, 0)).multiplyScalar(1 / U.length);
        for (let k = 0; k < U.length; k++) L.quad(pm, U[k], U[(k + 1) % U.length], um, um, null, 0.1);
      }
      // the target bank: four plates standing along the road, facing it
      const o = -side;
      const tm = pm === M.R ? M.B : M.R;
      const gap = Math.max(1, Math.round(4.2 / main.ds));
      if (clearAt(i, o * (hw + 6.5), 2.5) && clearAt(i + gap * 4, o * (hw + 6.5), 2.5)) {
        for (let k = 0; k < 4; k++) {
          const i0 = i + k * gap;
          const a = main.point(i0, o * (hw + 5.4), -0.4, new THREE.Vector3());
          const b = a.clone().lerp(main.point(i0 + gap, o * (hw + 5.4), -0.4, new THREE.Vector3()), 0.72);
          const yb = Math.max(a.y, b.y);
          const hh = 4.6 + (k % 2) * 1.2;
          const a1 = v(a.x, yb + hh, a.z);
          const b1 = v(b.x, yb + hh, b.z);
          const mk = k % 2 ? tm : M.ALL;
          const col = k % 2 ? null : YELLOW;
          L.fillQuad(mk, a, b, b1, a1);
          L.quad(mk, a, b, b1, a1, col, 0.2);
          for (const [p, q2] of [[a, b], [b, b1], [b1, a1], [a1, a]]) L.line(mk, p, q2, col);
          // a bullseye on its face
          const c = a.clone().lerp(b1, 0.5);
          const along = b.clone().sub(a).setY(0).normalize();
          L.ring(mk, c, along, UP, 1.15, 10, col);
          L.ring(mk, c, along, UP, 0.5, 6, col);
          // and the bracket behind it
          const back = main.point(i0, o * (hw + 7.4), -0.4, new THREE.Vector3()).lerp(main.point(i0 + gap, o * (hw + 7.4), -0.4, new THREE.Vector3()), 0.36);
          L.line(M.ALL, a1.clone().lerp(b1, 0.5), back, CHROME);
        }
      }
    }
  }

  // ---- the cabinet's inner walls: dark boards above the rails, a red or blue bolt of side art on each, a steel
  // trim and a row of lamps along the top, and the lamps' glow down the board and out over the playfield
  const WALL0 = 7; // (the rail's top)
  const WALL1 = 26;
  const board = (ax, az, bx, bz, k, lo = WALL0) => {
    const a = P(ax, az, lo);
    const b = P(bx, bz, lo);
    const a1 = P(ax, az, WALL1);
    const b1 = P(bx, bz, WALL1);
    a1.y = b1.y = Math.max(a1.y, b1.y);
    L.fillQuad(M.ALL, a, b, b1, a1);
    L.line(M.ALL, a1, b1, CHROME);
    L.line(M.ALL, a, a1, 0x3a2a66);
    // the lamps' glow down the board
    const am = a.clone().lerp(a1, 0.45);
    const bm = b.clone().lerp(b1, 0.45);
    L.quadFade(M.ALL, a1, b1, bm, am, AMBER, 0.2, 0);
    // side art: a zigzag bolt, and a row of pennants under the trim
    const mask = k % 2 ? M.R : M.B;
    const at = (u, w) => a.clone().lerp(b, u).lerp(a1.clone().lerp(b1, u), w);
    const Zg = [at(0.08, 0.2), at(0.36, 0.62), at(0.5, 0.36), at(0.92, 0.78)];
    for (let q = 0; q < 3; q++) {
      L.line(mask, Zg[q], Zg[q + 1]);
      const lift = v(0, 2.6, 0);
      L.line(mask, Zg[q].clone().add(lift), Zg[q + 1].clone().add(lift));
      L.quad(mask, Zg[q], Zg[q + 1], Zg[q + 1].clone().add(lift), Zg[q].clone().add(lift), null, 0.32);
    }
    const other = mask === M.R ? M.B : M.R;
    for (let q = 0; q < 4; q++) {
      const u0 = (q + 0.1) / 4;
      const u1 = (q + 0.9) / 4;
      const tip = at((u0 + u1) / 2, 0.78);
      L.quad(other, at(u0, 0.96), at(u1, 0.96), tip, tip, null, 0.26);
      L.line(other, at(u0, 0.96), tip);
      L.line(other, at(u1, 0.96), tip);
    }
    lamps.push(a1.clone().lerp(b1, 0.25).add(v(0, 1.2, 0)), a1.clone().lerp(b1, 0.75).add(v(0, 1.2, 0)));
  };
  let k = 0;
  for (let z = z0; z < 540; z += 40, k++) {
    const zb = Math.min(540, z + 40);
    board(x0, z, x0, zb, k);
    board(x1, z, x1, zb, k + 1);
    // the glow out over the playfield, from the foot of each wall
    for (const [xw, s] of [[x0, 1], [x1, -1]]) L.quadFade(M.ALL, P(xw, z, -0.42), P(xw, zb, -0.42), P(xw + s * 20, zb, -0.42), P(xw + s * 20, z, -0.42), AMBER, 0.12, 0);
  }
  {
    // round the top arch (its wall is three metres taller)
    let prev = null;
    for (let q = 0; q <= 24; q++) {
      const a = (q / 24) * Math.PI;
      const p = [Math.cos(a) * x1, 540 + Math.sin(a) * (z1 - 540)];
      if (prev) board(prev[0], prev[1], p[0], p[1], q, WALL0 + 3);
      prev = p;
    }
  }
  // the lock bar's end of the cabinet: a low board, so the room still shows over it from the grid
  for (let x = x0; x < x1; x += 58) {
    const xb = Math.min(x1, x + 58);
    const a = P(x, z0, WALL0);
    const b = P(xb, z0, WALL0);
    const a1 = P(x, z0, 13);
    const b1 = P(xb, z0, 13);
    L.fillQuad(M.ALL, a, b, b1, a1);
    L.line(M.ALL, a1, b1, CHROME);
    L.quadFade(M.ALL, a1, b1, b, a, AMBER, 0.14, 0);
    lamps.push(a1.clone().lerp(b1, 0.5).add(v(0, 1.2, 0)));
  }

  // ---- the apron: the two cards standing at the lock bar end, lines of print on each
  for (const [sx, mask] of [[-1, M.R], [1, M.B]]) {
    let best = null;
    for (let x = 40; x <= 205; x += 8) {
      for (let z = z0 + 10; z <= 60; z += 6) {
        const c = P(sx * x, z);
        const d = room(c.x, c.z);
        if (!best || d > best.d) best = { x: sx * x, z, d };
      }
    }
    if (!best || best.d < 7) continue;
    const w = Math.min(16, best.d * 1.3) / SC;
    const hh = Math.min(11, best.d * 0.9);
    const lean = 3 / SC; // (leaning back, up the table)
    const a = P(best.x - w / 2, best.z - 2, -0.4);
    const b = P(best.x + w / 2, best.z - 2, -0.4);
    const a1 = P(best.x - w / 2, best.z - 2 - lean, hh);
    const b1 = P(best.x + w / 2, best.z - 2 - lean, hh);
    L.fillQuad(mask, a, b, b1, a1);
    L.quad(mask, a, b, b1, a1, null, 0.14);
    for (const [p, q] of [[a, b], [b, b1], [b1, a1], [a1, a]]) L.line(mask, p, q);
    const at = (u, w2) => a.clone().lerp(b, u).lerp(a1.clone().lerp(b1, u), w2);
    L.quad(mask, at(0.1, 0.78), at(0.9, 0.78), at(0.9, 0.9), at(0.1, 0.9), null, 0.5); // the heading
    for (let q = 0; q < 5; q++) L.line(mask, at(0.1, 0.66 - q * 0.12), at(q % 2 ? 0.7 : 0.9, 0.66 - q * 0.12), 0xffffff);
    // its props
    L.line(M.ALL, a1, P(best.x - w / 2, best.z - 2 - lean * 2.4, -0.4), CHROME);
    L.line(M.ALL, b1, P(best.x + w / 2, best.z - 2 - lean * 2.4, -0.4), CHROME);
  }

  // ---- the backbox: a sunburst round it, red and blue rays in turn, and lamps round its frame
  {
    const bw = 330 * SC + 8;
    const c = P(0, z1 + 26, 10);
    c.y += 62;
    const rx = bw / 2 + 6;
    const ry = 66 + 6;
    const edge = (a, kk) => {
      // (out from a rounded box: the ray starts on the frame and runs out along its own angle)
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const t = 1 / Math.max(Math.abs(cs) / rx, Math.abs(sn) / ry);
      return v(c.x + cs * t * kk, c.y + sn * t * kk, c.z);
    };
    const RAYS = 28;
    for (let q = 0; q < RAYS; q++) {
      const a0 = ((q + 0.18) / RAYS) * Math.PI * 2;
      const a1 = ((q + 0.82) / RAYS) * Math.PI * 2;
      const am = ((q + 0.5) / RAYS) * Math.PI * 2;
      if (Math.sin(am) < -0.55) continue; // (the playfield's in front of the lower ones)
      const mask = q % 2 ? M.R : M.B;
      const len = q % 4 < 2 ? 1.5 : 1.3;
      const a = edge(a0, 1.03);
      const b = edge(a1, 1.03);
      const tip = edge(am, len);
      L.quad(mask, a, b, tip, tip, null, 0.3);
      L.line(mask, a, tip);
      L.line(mask, b, tip);
    }
    for (let q = 0; q < 44; q++) {
      const u = q / 44;
      // round the frame's four sides
      const per = u * 4;
      const sde = Math.floor(per);
      const f = per - sde;
      const px = sde === 0 ? -rx + f * 2 * rx : sde === 1 ? rx : sde === 2 ? rx - f * 2 * rx : -rx;
      const py = sde === 0 ? ry : sde === 1 ? ry - f * 2 * ry : sde === 2 ? -ry : -ry + f * 2 * ry;
      lamps.push(v(c.x + px, c.y + py, c.z - 8.5));
    }
  }
}

// ------------------------------------------------------------------ the playfield's paint, and the chase lamps
// `sheet` is the playfield's dark sheet (pinball-art.js makes it).
export function pinballSceneryArt(world, sheet) {
  const L = world.layers;
  const G = world.group;
  const N = L.materials(M.ALL);

  // THE PLAYFIELD'S PAINT: a harlequin of diamonds, red and blue in turn, that turns to a sunburst of rays round the
  // bumper pit. It's kept dim (the roads and the lit inserts sit on it). The neutral ribbon's colour is the lens tint
  // each view is drawn with: white with both worlds open, the lens's colour through a lens, where the paint goes to
  // two shades of that one colour so nothing of the other world is left in it.
  {
    const pit = V3(20, 468);
    const U = { uPfTint: { value: N.ribbon.color }, uPfPit: { value: new THREE.Vector2(pit.x, pit.z) } };
    const mat = sheet.material;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPfP;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvPfP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPfP;\nuniform vec3 uPfTint;\nuniform vec2 uPfPit;')
        .replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
          {
            vec2 p = vPfP.xz;
            vec2 q = vec2(p.x + p.y * 0.62, p.x - p.y * 0.62) / 15.0;
            vec2 id = floor(q);
            vec2 f = fract(q) - 0.5;
            float chk = mod(id.x + id.y, 2.0);
            float e = max(abs(f.x), abs(f.y));
            float grout = smoothstep(0.455, 0.49, e);
            float inner = 1.0 - smoothstep(0.1, 0.46, e);
            // far away the diamonds are smaller than a pixel: let them go to their average
            float keep = clamp(1.0 - max(fwidth(q.x), fwidth(q.y)) * 1.6, 0.0, 1.0);
            vec2 d = p - uPfPit;
            float r = length(d);
            float ray = step(0.5, fract(atan(d.y, d.x) * 14.0 / 6.2831853));
            float burst = 1.0 - smoothstep(70.0, 130.0, r);
            float ringk = smoothstep(3.0, 0.0, abs(r - 100.0)) * 0.5;
            float cell = mix(0.5, mix(chk, ray, burst), keep);
            float lens = clamp((1.0 - min(uPfTint.r, min(uPfTint.g, uPfTint.b))) / 0.8, 0.0, 1.0);
            vec3 both = mix(vec3(1.0, 0.1, 0.24), vec3(0.08, 0.42, 1.0), cell);
            vec3 mono = uPfTint * (0.35 + 0.9 * cell);
            vec3 c = mix(both, mono, lens);
            gl_FragColor.rgb += 2.6 * c * (0.02 + 0.045 * inner * keep + (grout * (1.0 - burst) + ringk) * 0.05 * keep);
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'pinball-playfield';
    mat.needsUpdate = true;
  }

  // THE CHASE LAMPS: the amber lamps along the cabinet's walls and round the backbox, lit one in three and stepping
  // along. Amber with both worlds open; through a lens they're that lens's colour.
  const pts = world.pinballLamps || [];
  if (pts.length) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr;
    cx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const amber = new THREE.Color(AMBER);
    const mats = [0, 1, 2].map((ph) => {
      const g = new THREE.BufferGeometry().setFromPoints(pts.filter((_, i) => i % 3 === ph));
      const m = new THREE.PointsMaterial({ map: tex, color: amber.clone(), size: 3.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const o = new THREE.Points(g, m);
      o.renderOrder = 4;
      G.add(o);
      return m;
    });
    const update = L.update.bind(L);
    L.update = (dt, mode, time = 0, instant = false) => {
      update(dt, mode, time, instant);
      const lens = mode === RED || mode === BLUE;
      const beat = Math.floor(time * 5) % 3;
      for (let ph = 0; ph < 3; ph++) {
        mats[ph].color.copy(lens ? N.ribbon.color : amber);
        mats[ph].opacity = ph === beat ? 0.8 : 0.15;
      }
    };
  }
}
