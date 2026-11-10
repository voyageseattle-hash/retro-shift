// The TOYBOX CUP's shared look. Every course of the cup is a toy in one kid's bedroom after lights-out, lit by a
// blacklight so everything glows, and you are small enough to race it. A course joins in with one line in its def:
//
//   dressEnv: toyboxEnv('desk'),
//
// and gets the room around it (the piece of furniture it sits on, the floor far below, the walls, glow stars on the
// ceiling, the lava lamp, the sleeping cat, the other toys of the cup in the distance) and the cup's road finish,
// candy gloss. Where each course sits is in SPOTS below.

import * as THREE from '../../vendor/three.js';
import { M, BOTH } from './shift.js';

const TAU = Math.PI * 2;
export const TOY_YELLOW = 0xffd23a;

// Where a course sits. `drop` is how far below the course's own floor the bedroom floor lies, `top` is the pattern
// on the surface the course stands on, `at` is where that piece of furniture stands in the room (so the walls, the
// lamp and the cat are in the same places from every course), and `toy` is the little glowing figure the other
// courses see on it from across the room.
export const SPOTS = {
  desk: { name: 'the desk', drop: 620, top: 'planks', at: [-900, -700], toy: 'table' }, // FLIPPER ALLEY
  rug: { name: 'the rug', drop: 0, top: 'rug', at: [0, 0], toy: 'dominoes' }, // TOPPLE RUN
  floor: { name: 'the floorboards', drop: 0, top: 'planks', at: [650, 780], toy: 'book' }, // PAGE TURNER
  bed: { name: 'the bed', drop: 380, top: 'quilt', at: [900, -520], toy: 'tiles' }, // SLIDE FIFTEEN
  bookcase: { name: 'the bookcase', drop: 1150, top: 'planks', at: [-1000, 620], toy: 'tower' }, // DROP TOWER
  shelf: { name: 'the shelf', drop: 900, top: 'planks', at: [0, -1150], toy: 'cube' }, // QUARTER TURN
};
const ROOM = { half: 1500, height: 2300 };

// ------------------------------------------------------------------ line helpers
// Everything in the room is drawn in two sets of lines, one for each world, so a lens turns the whole room its colour.
class Pen {
  constructor() {
    this.a = [];
    this.b = [];
    this.k = 0;
  }
  // one line; `w` picks the world (0 red, 1 blue), or leave it out to alternate
  seg(x0, y0, z0, x1, y1, z1, w = this.k++ % 2) {
    (w ? this.b : this.a).push(x0, y0, z0, x1, y1, z1);
  }
  // a closed loop through points [[x, y, z], ...]
  loop(pts, w = this.k++ % 2) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      this.seg(p[0], p[1], p[2], q[0], q[1], q[2], w);
    }
  }
  path(pts, w = this.k++ % 2) {
    for (let i = 0; i + 1 < pts.length; i++) this.seg(...pts[i], ...pts[i + 1], w);
  }
  // a wire box from (x0, y0, z0) to (x1, y1, z1)
  box(x0, y0, z0, x1, y1, z1, w = this.k++ % 2) {
    const X = [x0, x1];
    const Y = [y0, y1];
    const Z = [z0, z1];
    for (const i of [0, 1]) for (const j of [0, 1]) {
      this.seg(x0, Y[i], Z[j], x1, Y[i], Z[j], w);
      this.seg(X[i], y0, Z[j], X[i], y1, Z[j], w);
      this.seg(X[i], Y[j], z0, X[i], Y[j], z1, w);
    }
  }
  // a flat ring of radius r round (x, y, z), squashed by sz along z
  ring(x, y, z, r, sz = 1, w = this.k++ % 2, n = 28) {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([x + Math.cos((i / n) * TAU) * r, y, z + Math.sin((i / n) * TAU) * r * sz]);
    this.loop(pts, w);
  }
  add(group, matA, matB) {
    const out = [];
    for (const [pos, mat] of [[this.a, matA], [this.b, matB]]) {
      if (!pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const o = new THREE.LineSegments(g, mat);
      o.frustumCulled = false;
      group.add(o);
      out.push(o);
    }
    return out;
  }
}

// a rounded rectangle, half sizes hx and hz, corner radius r
function roundRect(hx, hz, r, y, n = 6) {
  const pts = [];
  const corners = [[hx - r, hz - r, 0], [-(hx - r), hz - r, 1], [-(hx - r), -(hz - r), 2], [hx - r, -(hz - r), 3]];
  for (const [cx, cz, q] of corners) for (let i = 0; i <= n; i++) {
    const a = (q + i / n) * (Math.PI / 2);
    pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
  }
  return pts;
}

// ------------------------------------------------------------------ the surface the course stands on
function surface(pen, kind, hx, hz, y) {
  if (kind === 'rug') {
    // a braided oval rug: rounded rings out from the middle, red and blue turn about
    for (let k = 1; k <= 14; k++) {
      const f = k / 14;
      pen.loop(roundRect(hx * f, hz * f, Math.min(hx, hz) * f * 0.8, y), k % 2);
    }
    // the fringe
    for (let x = -hx * 0.55; x <= hx * 0.55; x += 22) for (const s of [-1, 1]) pen.seg(x, y, s * hz, x, y, s * (hz + 30));
    return;
  }
  if (kind === 'quilt') {
    // a quilt: diamonds, one diagonal to each world, and a stitched hem
    const step = 60;
    const n = Math.ceil((hx + hz) / step);
    for (let k = -n; k <= n; k++) {
      const c = k * step;
      // x + z = c and x - z = c, clipped to the bed
      for (const [w, sgn] of [[0, 1], [1, -1]]) {
        const x0 = Math.max(-hx, sgn > 0 ? c - hz : c - hz);
        const x1 = Math.min(hx, c + hz);
        if (x1 <= x0) continue;
        pen.seg(x0, y, sgn * (c - x0), x1, y, sgn * (c - x1), w);
      }
    }
    pen.loop(roundRect(hx, hz, 60, y), 0);
    pen.loop(roundRect(hx - 14, hz - 14, 50, y), 1);
    return;
  }
  // planks: long boards with staggered ends
  const board = 48;
  let row = 0;
  for (let z = -hz; z <= hz + 0.1; z += board, row++) {
    pen.seg(-hx, y, z, hx, y, z, 0);
    for (let x = -hx + ((row * 137) % 260); x < hx; x += 260) if (z + board <= hz) pen.seg(x, y, z, x, y, z + board, 1);
  }
  pen.loop([[-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz]], 0);
}

// ------------------------------------------------------------------ the other toys, seen from across the room
// Each is drawn about 150 across with its foot at (x, y, z).
const TOYS = {
  // the pinball table: a tilted box with two flippers and a backbox
  table(pen, x, y, z) {
    const s = 80;
    pen.loop([[x - s, y + 20, z - s * 1.6], [x + s, y + 20, z - s * 1.6], [x + s, y + 70, z + s * 1.6], [x - s, y + 70, z + s * 1.6]], 0);
    pen.box(x - s, y + 70, z + s * 1.6, x + s, y + 190, z + s * 1.9, 1);
    for (const sx of [-1, 1]) {
      pen.seg(x + sx * s, y, z - s * 1.6, x + sx * s, y + 20, z - s * 1.6, 1);
      pen.seg(x + sx * s, y, z + s * 1.6, x + sx * s, y + 70, z + s * 1.6, 1);
      pen.seg(x + sx * 50, y + 30, z - s, x + sx * 8, y + 26, z - s * 1.25, sx > 0 ? 0 : 1);
    }
    for (const [bx, bz] of [[-30, 40], [30, 40], [0, 85]]) pen.ring(x + bx, y + 52 + bz * 0.15, z + bz, 16);
  },
  // a row of dominoes, the last few falling
  dominoes(pen, x, y, z) {
    for (let k = 0; k < 9; k++) {
      const lean = k > 5 ? (k - 5) * 0.42 : 0;
      const px = x - 160 + k * 40;
      const h = 70;
      const tx = px + Math.sin(lean) * h;
      const ty = y + Math.cos(lean) * h;
      for (const dz of [-18, 18]) pen.seg(px, y, z + dz, tx, ty, z + dz, k % 2);
      pen.seg(px, y, z - 18, px, y, z + 18, k % 2);
      pen.seg(tx, ty, z - 18, tx, ty, z + 18, k % 2);
    }
  },
  // an open pop-up book: two pages and a castle standing out of the fold
  book(pen, x, y, z) {
    for (const s of [-1, 1]) pen.loop([[x, y + 6, z - 90], [x + s * 150, y + 34, z - 90], [x + s * 150, y + 34, z + 90], [x, y + 6, z + 90]], s > 0 ? 0 : 1);
    pen.path([[x - 60, y + 14, z], [x - 60, y + 110, z], [x - 30, y + 110, z], [x - 30, y + 80, z], [x + 30, y + 80, z], [x + 30, y + 110, z], [x + 60, y + 110, z], [x + 60, y + 14, z]], 0);
    pen.path([[x, y + 80, z], [x, y + 150, z], [x + 26, y + 138, z], [x, y + 128, z]], 1);
  },
  // the sliding-tile puzzle: a 4 by 4 board with one square missing
  tiles(pen, x, y, z) {
    const s = 38;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      if (i === 3 && j === 3) continue;
      const px = x + (i - 2) * s;
      const pz = z + (j - 2) * s;
      pen.loop([[px + 3, y + 12, pz + 3], [px + s - 3, y + 12, pz + 3], [px + s - 3, y + 12, pz + s - 3], [px + 3, y + 12, pz + s - 3]], (i + j) % 2);
    }
    pen.box(x - 2 * s - 8, y, z - 2 * s - 8, x + 2 * s + 8, y + 12, z + 2 * s + 8, 0);
  },
  // the marble run: two towers, chutes zigzagging down, a spring between them
  tower(pen, x, y, z) {
    for (const [tx, w] of [[-70, 0], [70, 1]]) {
      for (const dx of [-22, 22]) for (const dz of [-22, 22]) pen.seg(x + tx + dx, y, z + dz, x + tx + dx, y + 300, z + dz, w);
      for (let h = 40; h <= 300; h += 52) pen.loop([[x + tx - 22, y + h, z - 22], [x + tx + 22, y + h, z - 22], [x + tx + 22, y + h, z + 22], [x + tx - 22, y + h, z + 22]], w);
    }
    for (let k = 0; k < 5; k++) pen.seg(x + (k % 2 ? 70 : -70), y + 280 - k * 52, z + 24, x + (k % 2 ? -70 : 70), y + 250 - k * 52, z + 24, k % 2);
    const coil = [];
    for (let i = 0; i <= 60; i++) coil.push([x - 48 + (i / 60) * 96, y + 300 + Math.sin((i / 60) * TAU * 6) * 14, z + Math.cos((i / 60) * TAU * 6) * 14]);
    pen.path(coil, 0);
  },
  // the twisting cube: a 3 by 3 cube with its top layer part-way through a turn
  cube(pen, x, y, z) {
    const s = 60;
    pen.box(x - s, y, z - s, x + s, y + s * 1.33, z + s, 0);
    for (const f of [-1 / 3, 1 / 3]) {
      pen.loop([[x - s, y, z + f * s], [x + s, y, z + f * s], [x + s, y + s * 1.33, z + f * s], [x - s, y + s * 1.33, z + f * s]], 0);
      pen.loop([[x + f * s, y, z - s], [x + f * s, y, z + s], [x + f * s, y + s * 1.33, z + s], [x + f * s, y + s * 1.33, z - s]], 0);
    }
    pen.loop([[x - s, y + s * 0.67, z - s], [x + s, y + s * 0.67, z - s], [x + s, y + s * 0.67, z + s], [x - s, y + s * 0.67, z + s]], 0);
    // the top layer, turned an eighth
    const c = Math.cos(0.5) * s * 1.02;
    const d = Math.sin(0.5) * s * 1.02;
    const top = [[c - d, 0, c + d], [-c - d, 0, c - d], [-c + d, 0, -c - d], [c + d, 0, -c + d]];
    for (const h of [s * 1.37, s * 2.04]) pen.loop(top.map(([px, , pz]) => [x + px, y + h, z + pz]), 1);
    for (const [px, , pz] of top) pen.seg(x + px, y + s * 1.37, z + pz, x + px, y + s * 2.04, z + pz, 1);
  },
};

// A piece of furniture as a wire box on legs with its toy on top, foot on the bedroom floor at fy.
function furniture(pen, spot, x, z, fy) {
  const S = SPOTS[spot];
  const h = S.drop;
  const [hx, hz] = spot === 'bed' ? [330, 240] : spot === 'bookcase' ? [150, 90] : spot === 'shelf' ? [330, 70] : [300, 190];
  if (spot === 'desk') {
    pen.box(x - hx, fy + h - 34, z - hz, x + hx, fy + h, z + hz, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pen.seg(x + sx * (hx - 16), fy, z + sz * (hz - 16), x + sx * (hx - 16), fy + h - 34, z + sz * (hz - 16), 1);
    pen.box(x + hx - 150, fy + h - 250, z - hz, x + hx, fy + h - 34, z + hz, 1); // the drawers
    pen.seg(x + hx - 150, fy + h - 140, z + hz, x + hx, fy + h - 140, z + hz, 1);
  } else if (spot === 'bed') {
    pen.box(x - hx, fy + 150, z - hz, x + hx, fy + h, z + hz, 1); // the mattress
    pen.box(x - hx, fy + 60, z - hz, x + hx, fy + 150, z + hz, 0);
    pen.loop([[x - hx, fy, z - hz], [x - hx, fy + h + 260, z - hz], [x - hx, fy + h + 260, z + hz], [x - hx, fy, z + hz]], 0); // the headboard
    pen.box(x - hx + 30, fy + h, z - 130, x - hx + 150, fy + h + 50, z + 130, 1); // the pillow
  } else if (spot === 'bookcase') {
    pen.box(x - hx, fy, z - hz, x + hx, fy + h, z + hz, 0);
    for (let s = 1; s < 5; s++) {
      const sy = fy + (h * s) / 5;
      pen.loop([[x - hx, sy, z - hz], [x + hx, sy, z - hz], [x + hx, sy, z + hz], [x - hx, sy, z + hz]], 1);
      // a few books leaning on each shelf
      for (let b = 0; b < 6; b++) pen.seg(x - hx + 24 + b * 34, sy, z + hz, x - hx + 24 + b * 34 + ((b * 7 + s) % 3 === 0 ? 14 : 0), sy + 130 + ((b * 13 + s * 5) % 4) * 18, z + hz, (b + s) % 2);
    }
  } else if (spot === 'shelf') {
    pen.box(x - hx, fy + h - 20, z - hz, x + hx, fy + h, z + hz, 0);
    for (const sx of [-1, 1]) pen.path([[x + sx * (hx - 60), fy + h - 20, z + hz], [x + sx * (hx - 60), fy + h - 170, z - hz], [x + sx * (hx - 60), fy + h - 20, z - hz]], 1); // brackets
  }
  TOYS[S.toy](pen, x, fy + h, z);
}

// ------------------------------------------------------------------ the room
function room(pen, far, fy, C) {
  const R = ROOM.half;
  const top = fy + ROOM.height;
  // corners, skirting board, picture rail, ceiling
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) far.seg(sx * R, fy, sz * R, sx * R, top, sz * R, 0);
  for (const h of [0, 70, ROOM.height * 0.78, ROOM.height]) far.loop([[-R, fy + h, -R], [R, fy + h, -R], [R, fy + h, R], [-R, fy + h, R]], h === 70 || h === ROOM.height ? 1 : 0);
  // wallpaper: thin stripes up to the picture rail
  for (let k = -R + 150; k < R; k += 300) for (const s of [-1, 1]) {
    far.seg(k, fy + 70, s * R, k, fy + ROOM.height * 0.78, s * R, 1);
    far.seg(s * R, fy + 70, k, s * R, fy + ROOM.height * 0.78, k, 1);
  }
  // the door on the +x wall, ajar, the hall light a bright line under it
  far.loop([[R, fy, 380], [R, fy + 1150, 380], [R, fy + 1150, 900], [R, fy, 900]], 0);
  far.loop([[R, fy, 380], [R, fy + 1150, 380], [R - 130, fy + 1150, 880], [R - 130, fy, 880]], 1);
  far.ring(R - 100, fy + 560, 800, 18, 1, 0);
  // the window on the -z wall: four panes and curtains
  const [wx0, wx1, wy0, wy1] = [-520, 180, fy + 900, fy + 1750];
  far.loop([[wx0, wy0, -R], [wx1, wy0, -R], [wx1, wy1, -R], [wx0, wy1, -R]], 1);
  far.seg((wx0 + wx1) / 2, wy0, -R, (wx0 + wx1) / 2, wy1, -R, 1);
  far.seg(wx0, (wy0 + wy1) / 2, -R, wx1, (wy0 + wy1) / 2, -R, 1);
  for (const [cx, s] of [[wx0, -1], [wx1, 1]]) for (let k = 0; k < 6; k++) far.path([[cx + s * k * 30, wy1 + 60, -R + 8], [cx + s * (k * 30 + 16), (wy0 + wy1) / 2, -R + 8], [cx + s * k * 34, wy0 - 80, -R + 8]], 0);
  far.seg(wx0 - 200, wy1 + 60, -R + 8, wx1 + 200, wy1 + 60, -R + 8, 0);
  // the floorboards of the room, running the long way, under everything
  for (let z = -R; z <= R; z += 150) pen.seg(-R, fy, z, R, fy, z, 0);
  for (let z = -R, row = 0; z < R; z += 150, row++) for (let x = -R + ((row * 410) % 900); x < R; x += 900) pen.seg(x, fy, z, x, fy, z + 150, 1);
  // the rug in the middle of the room (TOPPLE RUN's home), unless the course is standing on it
  if (C !== 'rug') for (let k = 3; k <= 9; k++) far.loop(roundRect(70 * k, 50 * k, 40 * k, fy + 1), k % 2);
}

// The sleeping cat, curled up: rings for the body, a head with two ears, and a tail that sweeps (the returned group).
function cat(group, matA, matB, x, fy, z, s) {
  const pen = new Pen();
  for (let k = 0; k < 7; k++) {
    const f = k / 6;
    pen.ring(0, 18 + f * 150, 0, 300 * Math.sin(Math.PI * (0.18 + 0.72 * (1 - f))) , 0.72, k % 2, 36);
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    pen.seg(Math.cos(a) * 288, 18, Math.sin(a) * 207, Math.cos(a) * 150, 168, Math.sin(a) * 108, k % 2);
  }
  // head, tucked in at the front
  const [hx, hy, hz] = [210, 120, 170];
  for (const r of [70, 50]) pen.ring(hx, hy + (r === 70 ? 0 : 46), hz, r, 0.9, 0, 20);
  for (const e of [-1, 1]) pen.path([[hx + e * 52, hy + 40, hz - 10], [hx + e * 44, hy + 118, hz], [hx + e * 8, hy + 62, hz + 6]], 1);
  // closed eyes
  for (const e of [-1, 1]) pen.path([[hx + e * 36 - 12, hy + 8, hz + 62], [hx + e * 36, hy + 2, hz + 64], [hx + e * 36 + 12, hy + 8, hz + 62]], 1);
  const body = new THREE.Group();
  pen.add(body, matA, matB);
  // the tail, hinged where it leaves the body
  const tail = new THREE.Group();
  const tp = new Pen();
  for (const off of [-16, 16]) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const f = i / 14;
      pts.push([-f * 330, 26 + Math.sin(f * Math.PI) * 30, off * (1 - f * 0.7) + Math.sin(f * 2.4) * 120]);
    }
    tp.path(pts, off > 0 ? 0 : 1);
  }
  tp.add(tail, matA, matB);
  tail.position.set(-250, 0, 60);
  body.add(tail);
  body.position.set(x, fy, z);
  body.scale.setScalar(s);
  group.add(body);
  return { body, tail };
}

// The lava lamp: a metal base and cap, a glass bottle between, and blobs that rise and sink inside it.
function lavaLamp(group, matA, matB, x, fy, z) {
  const pen = new Pen();
  const prof = [[95, 0], [70, 150], [48, 190], [78, 240], [100, 420], [70, 760], [46, 840], [40, 930], [26, 950]]; // radius, height
  for (const [r, h] of prof) pen.ring(0, h, 0, r, 1, h < 200 || h > 800 ? 0 : 1, 24);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    pen.path(prof.map(([r, h]) => [Math.cos(a) * r, h, Math.sin(a) * r]), k % 2);
  }
  const g = new THREE.Group();
  pen.add(g, matA, matB);
  // the wax: soft additive blobs
  const blobs = [];
  const geo = new THREE.SphereGeometry(1, 14, 10);
  for (let k = 0; k < 7; k++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const b = new THREE.Mesh(geo, mat);
    b.userData = { r: 26 + ((k * 37) % 30), ph: k * 1.7, sp: 0.05 + ((k * 13) % 7) * 0.012, k };
    g.add(b);
    blobs.push(b);
  }
  g.position.set(x, fy, z);
  group.add(g);
  return { g, blobs };
}

// A five-point glow star lying on the ceiling.
function star(pen, x, y, z, r, rot, w) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * TAU;
    const rr = i % 2 ? r * 0.42 : r;
    pts.push([x + Math.cos(a) * rr, y, z + Math.sin(a) * rr]);
  }
  pen.loop(pts, w);
}

// ------------------------------------------------------------------ the hook
// dressEnv for a TOYBOX course: `spot` is a key of SPOTS. Options: gloss (false to leave the road finish alone).
export function toyboxEnv(spot = 'desk', opts = {}) {
  return (env, world) => {
    const S = SPOTS[spot] || SPOTS.desk;
    // no grid, no mountains, no stars in space, no sun: this is a room
    for (const o of [...(env.floorGrid || []), ...(env.ridges || [])]) o.visible = false;
    env.stars.visible = false;
    env.sun.visible = false;
    const y = world.floorY;
    let fy = y - S.drop; // the bedroom floor (set properly once the room's scale is known)
    // the dark floor plane goes down to the bedroom floor with it
    const plane = env.group.children.find((o) => o.isMesh && o.geometry?.type === 'PlaneGeometry' && o !== env.sun);

    const G = new THREE.Group();
    G.position.set(env.center.x, 0, env.center.z);
    env.group.add(G);
    // how big the course is, so the furniture top reaches a little past it
    const m = world.main;
    let hx = 0;
    let hz = 0;
    for (let i = 0; i < m.N; i++) {
      hx = Math.max(hx, Math.abs(m.px[i] - env.center.x));
      hz = Math.max(hz, Math.abs(m.pz[i] - env.center.z));
    }
    hx += 110;
    hz += 110;
    const scale = Math.min(1.7, Math.max(1, Math.max(hx, hz) / 320)); // (any bigger and the far wall is past the camera's reach)
    fy = y - S.drop * scale;
    if (plane) plane.position.y = fy - 0.4;

    // near things take the fog (the two floor-grid materials); far things don't (the two ridge materials)
    const near = new Pen();
    surface(near, S.top, hx, hz, y + 0.05);
    if (S.drop) {
      // the edge of the furniture: a lip and its sides falling away to the floor
      near.loop([[-hx, y - 26, -hz], [hx, y - 26, -hz], [hx, y - 26, hz], [-hx, y - 26, hz]], 1);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        near.seg(sx * hx, y, sz * hz, sx * hx, y - 26, sz * hz, 1);
        near.seg(sx * (hx - 40), y - 26, sz * (hz - 40), sx * (hx - 40), fy, sz * (hz - 40), 0);
      }
    }
    near.add(G, env.gridMat, env.gridMatB);

    // The room stands still while the course sits at its own spot in it. A course is far bigger than a toy, so the
    // room is scaled up round it, and for a very big course its spot slides in toward the middle of the room until
    // the walls clear the course. R is the room: floor at 0, its middle where the room's middle is seen from here.
    const k = scale;
    const slide = (a, h) => (a ? a * Math.min(1, Math.max(0, (ROOM.half * k - h - 250) / (Math.abs(a) * k))) : 0);
    const at = [slide(S.at[0], hx), slide(S.at[1], hz)];
    const R = new THREE.Group();
    R.position.set(-at[0] * k, fy, -at[1] * k);
    R.scale.setScalar(k);
    G.add(R);
    // is a thing at room position (x, z) clear of the course?
    const clear = (x, z, pad = 320) => Math.abs((x - at[0]) * k) > hx + pad * k || Math.abs((z - at[1]) * k) > hz + pad * k;
    const far = new Pen();
    const floorPen = new Pen();
    room(floorPen, far, 0, clear(0, 0, 500) ? spot : 'rug');
    for (const [name, o] of Object.entries(SPOTS)) {
      if (name === spot || !clear(o.at[0], o.at[1])) continue;
      if (o.drop) furniture(far, name, o.at[0], o.at[1], 0);
      else TOYS[o.toy](far, o.at[0], 0, o.at[1]);
    }
    floorPen.add(R, env.gridMat, env.gridMatB);
    far.add(R, env.mtnMat, env.mtnMatB);

    // glow stars stuck to the ceiling, and a crescent moon in the window: toy yellow, or the lens's colour
    const glow = new THREE.LineBasicMaterial({ color: TOY_YELLOW, fog: false, transparent: true, opacity: 0.9, depthWrite: false });
    const sp = new Pen();
    let s = (world.def.seed || 7) * 31 + 5;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) star(sp, (rnd() * 2 - 1) * ROOM.half * 0.94, ROOM.height - 2, (rnd() * 2 - 1) * ROOM.half * 0.94, 16 + rnd() * 34, rnd() * TAU, 0);
    const moon = [];
    for (let i = 0; i <= 24; i++) {
      const a = -1.9 + (i / 24) * 3.8;
      moon.push([-330 + Math.cos(a) * 130, 1420 + Math.sin(a) * 130, -ROOM.half - 40]);
    }
    for (let i = 24; i >= 0; i--) {
      const a = -1.9 + (i / 24) * 3.8;
      moon.push([-330 - 70 + Math.cos(a) * 150 * 0.86, 1420 + Math.sin(a) * 130, -ROOM.half - 40]);
    }
    sp.loop(moon, 0);
    sp.add(R, glow, glow);

    const onBed = spot !== 'bed' && clear(SPOTS.bed.at[0], SPOTS.bed.at[1]);
    const kitty = onBed ? cat(R, env.mtnMat, env.mtnMatB, 1060, SPOTS.bed.drop + 2, -470, 0.5) : cat(R, env.mtnMat, env.mtnMatB, 1150, 0, 1050, 0.9); // on the foot of the bed, or on the floor by the door
    const lamp = lavaLamp(R, env.mtnMat, env.mtnMatB, -1250, 0, -1250); // on the floor in the corner

    // dust in the lamplight: it hangs in the air round the course and drifts
    const dp = [];
    for (let k = 0; k < 420; k++) dp.push((rnd() * 2 - 1) * (hx + 200), y + 4 + rnd() * 260, (rnd() * 2 - 1) * (hz + 200));
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: TOY_YELLOW, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    dust.frustumCulled = false;
    G.add(dust);

    if (opts.gloss !== false) candyGloss(world);

    const yellow = new THREE.Color(TOY_YELLOW);
    const c = new THREE.Color();
    return (dt, t) => {
      // through a lens the yellow goes with everything else to that lens's colour
      c.copy(env.mode === BOTH ? yellow : env.tint.grid);
      glow.color.lerp(c, 1 - Math.exp(-6 * dt));
      dust.material.color.copy(glow.color);
      dust.position.set(Math.sin(t * 0.07) * 14, Math.sin(t * 0.11) * 6, Math.cos(t * 0.05) * 14);
      // the cat breathes, and its tail sweeps slowly across the floor
      kitty.body.scale.y = kitty.body.scale.x * (1 + Math.sin(t * 0.9) * 0.025);
      kitty.tail.rotation.y = Math.sin(t * 0.45) * 0.5 + Math.sin(t * 1.3) * 0.06;
      for (const b of lamp.blobs) {
        const u = b.userData;
        const f = 0.5 + 0.5 * Math.sin(t * u.sp * TAU + u.ph); // 0 at the bottom, 1 at the top
        const r = u.r * (1 + 0.25 * Math.sin(t * 0.7 + u.ph));
        b.position.set(Math.sin(u.ph * 3 + t * 0.2) * 24, 260 + f * 500, Math.cos(u.ph * 2 + t * 0.17) * 24);
        b.scale.set(r, r * (1.15 + 0.3 * Math.cos(t * u.sp * TAU + u.ph)), r);
        b.material.color.copy(u.k % 2 ? env.tint.gridB : env.tint.grid).lerp(glow.color, 0.25);
      }
    };
  };
}

// ------------------------------------------------------------------ the road's finish
// Candy gloss, the TOYBOX CUP's finish (SIGNAL is phosphor, STATIC is static grain, PARADOX is iridescent): the road
// is wet-look toy plastic. A hard bright highlight from the lamp slides along it as you drive, a softer sheen comes
// up at glancing angles, and a fine metal flake in the plastic glints as each fleck catches the light. With both
// worlds open the gloss is warm (toy yellow into white); through a lens it's that lens's colour only.
const GLOSS = { uCgTint: { value: new THREE.Color(1, 1, 1) }, uCgBoth: { value: 1 }, uCgK: { value: 1 }, uCgL: { value: new THREE.Vector3(-0.5, 0.62, -0.6).normalize() } };
export function candyGloss(world) {
  if (world.candyGloss) return;
  world.candyGloss = true;
  for (const mask of [M.ALL, M.R, M.B, M.RO, M.BO, M.X]) {
    const mat = world.layers.materials(mask).road;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev?.(sh, r);
      Object.assign(sh.uniforms, GLOSS);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCgP;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCgP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCgP;\nuniform vec3 uCgTint;\nuniform float uCgBoth;\nuniform float uCgK;\nuniform vec3 uCgL;')
        .replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
          {
            vec3 cv = cameraPosition - vCgP;
            float cd = length(cv);
            cv /= max(cd, 0.001);
            float ccos = abs(cv.y);
            // the lamp's reflection in a flat, wet surface
            vec3 crf = reflect(-cv, vec3(0.0, 1.0, 0.0));
            float cl = max(dot(crf, uCgL), 0.0);
            float hot = pow(cl, 140.0) * 1.2 + pow(cl, 14.0) * 0.1;
            // sheen at glancing angles, like looking along a toy car's bonnet
            float fres = pow(clamp(1.0 - ccos, 0.0, 1.0), 3.0);
            // metal flake: each fleck in the plastic has its own tilt, and glints when it catches the lamp
            vec2 cq = vCgP.xz * 4.5;
            vec2 ci = floor(cq);
            vec2 ch = fract(sin(vec2(dot(ci, vec2(127.1, 311.7)), dot(ci, vec2(269.5, 183.3)))) * 43758.5453);
            vec3 cn = normalize(vec3((ch.x - 0.5) * 0.9, 1.0, (ch.y - 0.5) * 0.9));
            float flake = pow(max(dot(reflect(-cv, cn), uCgL), 0.0), 60.0);
            vec2 cf = fract(cq) - 0.5;
            flake *= step(0.55, fract(ch.x * 7.31 + ch.y * 3.17)) * smoothstep(0.38, 0.08, length(cf)) * (1.0 - smoothstep(30.0, 130.0, cd));
            vec3 warm = mix(vec3(1.0, 0.72, 0.14), vec3(1.0, 0.96, 0.82), clamp(hot, 0.0, 1.0));
            vec3 lens = uCgTint * (0.7 + 0.6 * clamp(hot, 0.0, 1.0));
            vec3 ccol = mix(lens, warm, uCgBoth);
            gl_FragColor.rgb += ccol * uCgK * (hot * 0.16 + fres * 0.1 + flake * 0.4);
          }`,
        );
    };
    const key = mat.customProgramCacheKey.call(mat);
    mat.customProgramCacheKey = () => `${key}|candy`;
    mat.needsUpdate = true;
  }
  world.animated.push(() => {
    const tint = world.layers.level.get('tint');
    if (!tint) return;
    GLOSS.uCgTint.value.copy(tint);
    const lo = Math.min(tint.r, tint.g, tint.b);
    GLOSS.uCgBoth.value = Math.min(1, Math.max(0, (lo - 0.35) / 0.6));
  });
}
