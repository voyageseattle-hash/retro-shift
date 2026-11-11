// TOPPLE RUN's art pass: everything here stands still and nothing here is in anyone's way (dominoes.js has the
// dominoes that fall; toybox.js has the bedroom). It's what makes the course a rug with toys left out on it:
//
//   the rug        a braided border woven along both sides of the road, and a warm pile glow off the road's edge
//   the road       laid out as a line of giant domino tiles: a bar across, and pips counting down either side of it
//   fairy lights   a string of coloured bulbs on pencil posts round the outside
//   block arches   gateways of wooden blocks over the road
//   toys           alphabet blocks, crayons, marbles, a ring stacker, heaps of spare dominoes, all the way round the
//                  outside, and a few giants further out (a beach ball, a tower of blocks) so the room reads as huge
//
// Red and blue pieces go with their worlds, so a lens takes the other colour's toys away; the warm ones (yellow, pink,
// teal) are neutral and take the lens's colour. It's all in the course's batched scenery: no draw calls of its own.

import * as THREE from '../../vendor/three.js';
import { M } from './shift.js';
import { TOY_YELLOW } from './toybox.js';

const TAU = Math.PI * 2;
const PINK = 0xff7ab8;
const TEAL = 0x58e0c8;
const AMBER = 0xffa23a;
const WOOD = 0xffc27a;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0);
const Y = V(0, 1, 0);
const Z = V(0, 0, 1);

// Letters for the blocks, as strokes in a unit square.
const O8 = [[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3], [0.3, 0]];
const GLYPH = {
  T: [[[0, 1], [1, 1]], [[0.5, 1], [0.5, 0]]],
  O: [O8],
  P: [[[0, 0], [0, 1], [0.7, 1], [1, 0.8], [1, 0.62], [0.7, 0.45], [0, 0.45]]],
  L: [[[0, 1], [0, 0], [1, 0]]],
  E: [[[1, 1], [0, 1], [0, 0], [1, 0]], [[0, 0.5], [0.7, 0.5]]],
  S: [[[1, 0.85], [0.7, 1], [0.3, 1], [0, 0.82], [0, 0.62], [1, 0.38], [1, 0.18], [0.7, 0], [0.3, 0], [0, 0.15]]],
  H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
  I: [[[0.5, 0], [0.5, 1]], [[0.2, 1], [0.8, 1]], [[0.2, 0], [0.8, 0]]],
  F: [[[0, 0], [0, 1], [1, 1]], [[0, 0.5], [0.7, 0.5]]],
  A: [[[0, 0], [0.5, 1], [1, 0]], [[0.2, 0.4], [0.8, 0.4]]],
  B: [[[0, 0], [0, 1], [0.7, 1], [0.92, 0.78], [0.7, 0.52], [0, 0.52]], [[0.7, 0.52], [1, 0.27], [0.7, 0], [0, 0]]],
  C: [[[1, 0.8], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3], [0.3, 0], [0.7, 0], [1, 0.2]]],
  R: [[[0, 0], [0, 1], [0.7, 1], [1, 0.8], [1, 0.62], [0.7, 0.45], [0, 0.45]], [[0.5, 0.45], [1, 0]]],
  U: [[[0, 1], [0, 0.25], [0.3, 0], [0.7, 0], [1, 0.25], [1, 1]]],
  N: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
  X: [[[0, 0], [1, 1]], [[0, 1], [1, 0]]],
  '★': [[[0.5, 1], [0.62, 0.62], [1, 0.62], [0.69, 0.4], [0.81, 0], [0.5, 0.25], [0.19, 0], [0.31, 0.4], [0, 0.62], [0.38, 0.62], [0.5, 1]]],
};
const LETTERS = 'ABCRSTUNXEHO★';

export function dominoArt(world, L) {
  const main = world.main;
  const N = main.N;
  const ds = main.ds;
  const hw = main.halfW;
  const rugY = world.floorY + 0.05;
  let seed = 181818;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const idx = (s) => Math.round(s / ds);
  // forward along the road at sample i, and a yaw that lines a box's long side up with it
  const fwd = (i) => [main.rightZ(i), -main.rightX(i)];
  const yawAt = (i) => {
    const [fx, fz] = fwd(i);
    return Math.atan2(fx, fz);
  };
  // is (x, z) clear of every road by r metres?
  const clear = (x, z, r) => {
    for (const p of world.paths) {
      const lim = (p.halfW + r) ** 2;
      for (let i = 0; i < p.N; i += 2) {
        const dx = p.px[i] - x;
        const dz = p.pz[i] - z;
        if (dx * dx + dz * dz < lim) return false;
      }
    }
    return true;
  };
  const worldOf = (k) => (k % 2 ? M.R : M.B);

  // ---------------------------------------------------------------- the pieces
  // an alphabet block: a cube with a raised frame and a letter on each side and on top
  const block = (mask, x, y0, z, s, yaw, ch, colour = null) => {
    L.box(mask, x, y0 + s / 2, z, s, s, s, yaw, colour, true);
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const strokes = GLYPH[ch] || GLYPH.O;
    const h = s / 2 + 0.06;
    // faces: [normal, right] in the block's own axes; the fifth is the lid
    for (const [n, r, top] of [[[0, 1], [1, 0]], [[0, -1], [-1, 0]], [[1, 0], [0, -1]], [[-1, 0], [0, 1]], [null, [1, 0], true]]) {
      const at = (u, v, out) => {
        // u, v in 0..1 across the face
        const a = (u - 0.5) * s;
        const b = (v - 0.5) * s;
        const lx = top ? a : n[0] * h + r[0] * a;
        const lz = top ? -b : n[1] * h + r[1] * a;
        const ly = top ? h : b;
        return out.set(x + lx * cs + lz * sn, y0 + s / 2 + ly, z - lx * sn + lz * cs);
      };
      const run = (pts, k0 = 0, k1 = 1) => {
        for (let q = 0; q + 1 < pts.length; q++) L.line(mask, at(k0 + pts[q][0] * (k1 - k0), k0 + pts[q][1] * (k1 - k0), _a), at(k0 + pts[q + 1][0] * (k1 - k0), k0 + pts[q + 1][1] * (k1 - k0), _b), colour);
      };
      run([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], 0.1, 0.9);
      for (const st of strokes) run(st, 0.27, 0.73);
    }
  };

  // a marble: three hoops and a twist of colour inside
  const ball = (x, y0, z, r, bands = false) => {
    const c = V(x, y0 + r, z);
    if (bands) {
      // a beach ball: six panels, red and blue turn about, and a cap at each pole
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI;
        L.ring(worldOf(k), c, V(Math.cos(a), 0, Math.sin(a)), Y, r, 28);
      }
      for (const f of [-0.92, 0.92]) L.ring(M.ALL, V(x, y0 + r + f * r, z), X, Z, r * Math.sqrt(1 - f * f), 14, TOY_YELLOW);
      L.ring(M.ALL, c, X, Z, r, 32, TOY_YELLOW);
      return;
    }
    const k = Math.round(rnd() * 8);
    L.ring(worldOf(k), c, X, Y, r, 18);
    L.ring(worldOf(k), c, Z, Y, r, 18);
    L.ring(worldOf(k), c, X, Z, r, 18);
    // the cat's-eye twist
    let prev = null;
    for (let q = 0; q <= 12; q++) {
      const u = q / 12 - 0.5;
      const a = u * 5;
      const p = V(x + Math.cos(a) * r * 0.35, y0 + r + u * r * 1.5, z + Math.sin(a) * r * 0.35);
      if (prev) L.line(worldOf(k + 1), prev, p);
      prev = p;
    }
  };

  // a crayon lying on the rug: a six-sided stick, a paper wrapper, a cone for a tip
  const crayon = (mask, x, z, len, r, yaw, colour = null) => {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const y = rugY + r * 0.87;
    const at = (s, a, rr, out) => out.set(x + fx * s + fz * Math.cos(a) * rr, y + Math.sin(a) * rr, z + fz * s - fx * Math.cos(a) * rr);
    const stops = [-len / 2, -len * 0.32, len * 0.2, len * 0.36];
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * TAU;
      const a1 = ((k + 1) / 6) * TAU;
      for (const s of stops) L.line(mask, at(s, a0, r, _a), at(s, a1, r, _b), colour);
      L.line(mask, at(-len / 2, a0, r, _a), at(len * 0.36, a0, r, _b), colour);
      L.line(mask, at(len * 0.36, a0, r, _a), at(len / 2, a0, r * 0.12, _b), colour);
      // (the wrapper: a band of glow round the middle)
      L.quad(mask, at(-len * 0.32, a0, r, _a).clone(), at(-len * 0.32, a1, r, _b).clone(), at(len * 0.2, a1, r, _c).clone(), at(len * 0.2, a0, r, _d).clone(), colour, 0.07);
    }
  };

  // a ring stacker: a post and five fat rings, biggest at the bottom
  const stacker = (x, z, s) => {
    L.cylinder(M.ALL, x, rugY, z, 5.2 * s, 0.8 * s, 12, 1, WOOD);
    L.lineXYZ(M.ALL, x, rugY, z, x, rugY + 15 * s, z, WOOD);
    for (let k = 0; k < 5; k++) {
      const r = (4.6 - k * 0.7) * s;
      const y = rugY + (1.2 + k * 2.5) * s;
      const mask = worldOf(k);
      for (const [dy, rr] of [[0, r * 0.82], [1.1 * s, r], [2.2 * s, r * 0.82]]) L.ring(mask, V(x, y + dy, z), X, Z, rr, 16);
      for (let q = 0; q < 8; q++) {
        const a = (q / 8) * TAU;
        L.lineXYZ(mask, x + Math.cos(a) * r * 0.82, y, z + Math.sin(a) * r * 0.82, x + Math.cos(a) * r, y + 1.1 * s, z + Math.sin(a) * r);
        L.lineXYZ(mask, x + Math.cos(a) * r, y + 1.1 * s, z + Math.sin(a) * r, x + Math.cos(a) * r * 0.82, y + 2.2 * s, z + Math.sin(a) * r * 0.82);
      }
    }
    L.ring(M.ALL, V(x, rugY + 15.6 * s, z), X, Y, 0.9 * s, 8, TOY_YELLOW);
  };

  // spare dominoes: a few lying in a criss-cross stack, pips up, and one left standing beside them
  const heap = (x, z, yaw, n) => {
    for (let k = 0; k < n; k++) {
      const a = yaw + k * 0.55;
      const y = rugY + 0.5 + k * 1.0;
      const mask = worldOf(k);
      L.box(mask, x, y, z, 5, 0.9, 7.6, a, null, true);
      // pips on the one on top
      if (k === n - 1) {
        for (const [pa, pb] of [[-1.3, 2], [1.3, 2], [0, -1.9], [-1.3, -3], [1.3, -0.8]]) {
          const px = x + pa * Math.cos(a) + pb * Math.sin(a);
          const pz = z - pa * Math.sin(a) + pb * Math.cos(a);
          disc(mask, px, y + 0.5, pz, 0.5, null, 0.9);
        }
        L.lineXYZ(mask, x - 2.1 * Math.cos(a), y + 0.5, z + 2.1 * Math.sin(a), x + 2.1 * Math.cos(a), y + 0.5, z - 2.1 * Math.sin(a));
      }
    }
    L.box(worldOf(n), x + Math.cos(yaw) * 8, rugY + 3.8, z - Math.sin(yaw) * 8, 5, 7.6, 0.9, yaw + 0.5, null, true);
  };

  // a flat dot of glow (two squares, one turned: near enough to round)
  function disc(mask, x, y, z, r, colour, k) {
    const q = r * 0.74;
    L.quad(mask, V(x - q, y, z - q), V(x + q, y, z - q), V(x + q, y, z + q), V(x - q, y, z + q), colour, k * 0.6);
    L.quad(mask, V(x - r, y, z), V(x, y, z - r), V(x + r, y, z), V(x, y, z + r), colour, k * 0.6);
  }

  // ---------------------------------------------------------------- the rug beside the road
  // A braided border along both edges: two yellow cords with a red and a blue zigzag plaited between them, and a
  // soft warm glow off the road's edge, like lamplight caught in the pile.
  const seg = Math.max(1, Math.round(4 / ds));
  for (const side of [1, -1]) {
    const in0 = hw + 3.5;
    const in1 = hw + 11;
    let k = 0;
    for (let i = 0; i < N; i += seg, k++) {
      const j = i + seg;
      const a0 = main.point(i, side * in0, 0.04, V(0, 0, 0));
      const a1 = main.point(j, side * in0, 0.04, V(0, 0, 0));
      const b0 = main.point(i, side * in1, 0.04, V(0, 0, 0));
      const b1 = main.point(j, side * in1, 0.04, V(0, 0, 0));
      a0.y = a1.y = b0.y = b1.y = rugY + 0.03;
      L.line(M.ALL, a0, a1, TOY_YELLOW);
      L.line(M.ALL, b0, b1, TOY_YELLOW);
      // the plait: red goes out as blue comes in, and they cross in the middle of every stitch
      L.line(M.R, k % 2 ? b0 : a0, k % 2 ? a1 : b1);
      L.line(M.B, k % 2 ? a0 : b0, k % 2 ? b1 : a1);
      // lamplight in the pile
      const e0 = main.point(i, side * (hw + 0.6), 0, V(0, 0, 0));
      const e1 = main.point(j, side * (hw + 0.6), 0, V(0, 0, 0));
      const f0 = main.point(i, side * (hw + 20), 0, V(0, 0, 0));
      const f1 = main.point(j, side * (hw + 20), 0, V(0, 0, 0));
      e0.y = e1.y = f0.y = f1.y = rugY + 0.02;
      L.quadFade(M.ALL, e0, e1, f1, f0, AMBER, 0.04, 0);
    }
    // tufts along the outer cord: short strands, every other one red or blue
    for (let i = 0, q = 0; i < N; i += Math.max(1, Math.round(2 / ds)), q++) {
      const p = main.point(i, side * in1, 0, _a);
      const o = main.point(i, side * (in1 + 2.2 + (q % 3) * 0.5), 0, _b);
      L.lineXYZ(worldOf(q), p.x, rugY + 0.03, p.z, o.x, rugY + 0.03, o.z);
    }
  }

  // ---------------------------------------------------------------- the road, as a line of domino tiles
  // Each tile is 64 m long: a double seam at each end, a bar across the middle, and pips either side of the bar,
  // counting down from the double six as the lap goes round.
  const TILE = 64;
  const tiles = Math.floor((N * ds) / TILE);
  const tl = (N * ds) / tiles;
  const across = (s, w, k, colour) => {
    const i = idx(s);
    const [fx, fz] = fwd(i);
    const a = main.point(i, -hw + 0.8, 0.07, V(0, 0, 0));
    const b = main.point(i, hw - 0.8, 0.07, V(0, 0, 0));
    L.quad(M.ALL, a, b, V(b.x + fx * w, b.y, b.z + fz * w), V(a.x + fx * w, a.y, a.z + fz * w), colour, k);
  };
  const PIPS = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
  for (let t = 0; t < tiles; t++) {
    const s0 = t * tl;
    across(s0 - 0.9, 0.35, 0.13, 0xffffff);
    across(s0 + 0.55, 0.35, 0.13, 0xffffff);
    across(s0 + tl / 2 - 0.5, 1, 0.18, TOY_YELLOW);
    const halves = [6 - (t % 6), 6 - (Math.floor(t / 6) % 6)];
    for (const [h, n] of halves.entries()) {
      const sc = s0 + tl / 2 + (h ? 1 : -1) * 13;
      for (const g of PIPS[n]) {
        const i = idx(sc + (Math.floor(g / 3) - 1) * 6.5);
        const p = main.point(i, ((g % 3) - 1) * hw * 0.52, 0.07, _a);
        disc(M.ALL, p.x, p.y, p.z, 1.25, 0xffffff, 0.11);
        L.ring(M.ALL, V(p.x, p.y, p.z), X, Z, 1.55, 10, TOY_YELLOW);
      }
    }
  }

  // ---------------------------------------------------------------- fairy lights round the outside
  // Pencils stood on end for posts, a string sagging between them, a bulb at every dip.
  const BULBS = [TOY_YELLOW, PINK, TEAL, AMBER];
  const postGap = idx(46);
  const posts = [];
  for (let i = 0; i < N - postGap / 2; i += postGap) {
    const p = main.point(i, hw + 15.5, 0, V(0, 0, 0));
    if (!clear(p.x, p.z, 4)) {
      posts.push(null);
      continue;
    }
    p.y = rugY;
    posts.push(p);
    const k = posts.length;
    // the pencil: a six-sided shaft, a sharpened point up top
    const mask = worldOf(k);
    for (let q = 0; q < 6; q++) {
      const a0 = (q / 6) * TAU;
      const a1 = ((q + 1) / 6) * TAU;
      const x0 = p.x + Math.cos(a0) * 0.9;
      const z0 = p.z + Math.sin(a0) * 0.9;
      L.lineXYZ(mask, x0, rugY, z0, x0, rugY + 11.4, z0);
      L.lineXYZ(mask, x0, rugY + 11.4, z0, p.x, rugY + 14, p.z);
      for (const y of [rugY, rugY + 1.6, rugY + 11.4]) L.lineXYZ(mask, x0, y, z0, p.x + Math.cos(a1) * 0.9, y, p.z + Math.sin(a1) * 0.9);
    }
  }
  let bulb = 0;
  for (let k = 0; k < posts.length; k++) {
    const a = posts[k];
    const b = posts[(k + 1) % posts.length];
    if (!a || !b) continue;
    let prev = null;
    for (let q = 0; q <= 8; q++) {
      const u = q / 8;
      const p = V(a.x + (b.x - a.x) * u, rugY + 13.4 - 4.6 * Math.sin(u * Math.PI), a.z + (b.z - a.z) * u);
      if (prev) L.line(M.ALL, prev, p, WOOD);
      prev = p;
      if (q === 0 || q === 8) continue;
      const c = BULBS[bulb++ % BULBS.length];
      // a bulb: a little lantern of two crossed diamonds hanging under the string
      const y = p.y - 0.9;
      L.quad(M.ALL, V(p.x, y + 0.75, p.z), V(p.x + 0.55, y, p.z), V(p.x, y - 0.75, p.z), V(p.x - 0.55, y, p.z), c, 0.7);
      L.quad(M.ALL, V(p.x, y + 0.75, p.z), V(p.x, y, p.z + 0.55), V(p.x, y - 0.75, p.z), V(p.x, y, p.z - 0.55), c, 0.7);
      // and its pool of light on the rug
      disc(M.ALL, p.x, rugY + 0.04, p.z, 3.2, c, 0.06);
    }
  }

  // ---------------------------------------------------------------- gateways of wooden blocks over the road
  const gate = (s, word) => {
    const i = idx(s);
    const yaw = yawAt(i);
    const out = main.point(i, hw + 6.5, 0, V(0, 0, 0));
    const inn = main.point(i, -(hw + 6.5), 0, V(0, 0, 0));
    if (!clear(out.x, out.z, 3.2) || !clear(inn.x, inn.z, 3.2)) return false;
    const B = 6.4;
    let n = 0;
    for (const p of [out, inn]) {
      for (let k = 0; k < 3; k++) block(worldOf(n + k), p.x, rugY + k * B, p.z, B, yaw + (k === 1 ? 0.12 : -0.05), word[(n + k) % word.length]);
      n += 3;
    }
    // the lintel: a long yellow plank across the top, and a roof block in the middle of it
    const mid = main.point(i, 0, 0, V(0, 0, 0));
    const span = hw * 2 + 13 + B;
    L.box(M.ALL, mid.x, rugY + 3 * B + 1.1, mid.z, span, 2.2, B * 0.9, yaw, TOY_YELLOW, true);
    const rx = main.rightX(i);
    const rz = main.rightZ(i);
    const [fx, fz] = fwd(i);
    const top = rugY + 3 * B + 2.2;
    for (const f of [-1, 1]) {
      const e = B * 0.45 * f;
      const a = V(mid.x - rx * 7 + fx * e, top, mid.z - rz * 7 + fz * e);
      const b = V(mid.x + rx * 7 + fx * e, top, mid.z + rz * 7 + fz * e);
      const c = V(mid.x + fx * e, top + 5.5, mid.z + fz * e);
      L.line(M.ALL, a, c, PINK);
      L.line(M.ALL, b, c, PINK);
      L.line(M.ALL, a, b, PINK);
    }
    L.lineXYZ(M.ALL, mid.x - fx * B * 0.45, top + 5.5, mid.z - fz * B * 0.45, mid.x + fx * B * 0.45, top + 5.5, mid.z + fz * B * 0.45, PINK);
    // warm light down from the lintel onto the road
    const g0 = main.point(i, -hw, 0.06, V(0, 0, 0));
    const g1 = main.point(i, hw, 0.06, V(0, 0, 0));
    for (const f of [-1, 1]) L.quadFade(M.ALL, g0, g1, V(g1.x + fx * 16 * f, g1.y, g1.z + fz * 16 * f), V(g0.x + fx * 16 * f, g0.y, g0.z + fz * 16 * f), AMBER, 0.08, 0);
    return true;
  };
  const lap = N * ds;
  const words = ['TOP', 'PLE', 'RUN', 'SHIFT', 'RED', 'BLUE'];
  let made = 0;
  for (let k = 0; k < 14 && made < 6; k++) {
    // (try a spot, then nudge along until the pillars are clear of the lanes' forks)
    for (let nudge = 0; nudge < 60; nudge += 20) {
      if (gate(lap * ((k + 0.42) / 14) + nudge, words[made % words.length])) {
        made++;
        break;
      }
    }
  }

  // ---------------------------------------------------------------- toys left out round the outside
  let k = 0;
  for (let s = 18; s < lap - 10; s += 21 + rnd() * 13, k++) {
    const i = idx(s);
    const lat = hw + 25 + rnd() * 34;
    const p = main.point(i, lat, 0, V(0, 0, 0));
    if (!clear(p.x, p.z, 16)) continue;
    const yaw = yawAt(i) + (rnd() - 0.5) * 1.6;
    const pick = k % 7;
    if (pick === 0 || pick === 4) {
      // alphabet blocks, one on its own or a little tower
      const sz = 8 + rnd() * 5;
      const n = 1 + Math.floor(rnd() * 3);
      let y = rugY;
      let w = sz;
      for (let q = 0; q < n; q++) {
        const warm = (k + q) % 5 === 0;
        block(warm ? M.ALL : worldOf(k + q), p.x + (rnd() - 0.5) * q * 1.6, y, p.z + (rnd() - 0.5) * q * 1.6, w, yaw + q * 0.45, LETTERS[Math.floor(rnd() * LETTERS.length)], warm ? [TOY_YELLOW, PINK, TEAL][(k + q) % 3] : null);
        y += w;
        w *= 0.82;
      }
    } else if (pick === 1) {
      const warm = k % 3 === 0;
      crayon(warm ? M.ALL : worldOf(k), p.x, p.z, 26 + rnd() * 12, 2.3, yaw, warm ? [TEAL, PINK, AMBER][k % 3] : null);
      if (rnd() < 0.6) crayon(worldOf(k + 1), p.x + Math.cos(yaw) * 7, p.z - Math.sin(yaw) * 7, 22 + rnd() * 8, 2.3, yaw + 0.5);
    } else if (pick === 2 || pick === 5) {
      // a spill of marbles
      const n = 2 + Math.floor(rnd() * 3);
      for (let q = 0; q < n; q++) ball(p.x + (rnd() - 0.5) * 22, rugY, p.z + (rnd() - 0.5) * 22, 2.4 + rnd() * 2.6);
    } else if (pick === 3) {
      stacker(p.x, p.z, 1.5 + rnd() * 0.7);
    } else {
      heap(p.x, p.z, yaw, 3 + Math.floor(rnd() * 3));
    }
  }

  // ---------------------------------------------------------------- and a few giants, so the room is a big room
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < N; i++) {
    cx += main.px[i] / N;
    cz += main.pz[i] / N;
  }
  const giants = [
    [0.06, 86, 'ball', 30],
    [0.2, 96, 'tower', 26, 'TOY'],
    [0.36, 80, 'ball', 22],
    [0.47, 100, 'tower', 30, 'BOX'],
    [0.63, 84, 'crayons'],
    [0.74, 92, 'tower', 24, 'CUP'],
    [0.9, 90, 'stacker', 5.2],
  ];
  for (const [u, lat, kind, size, word] of giants) {
    const i = idx(lap * u);
    const p = main.point(i, hw + lat, 0, V(0, 0, 0));
    if (!clear(p.x, p.z, 40)) continue;
    const yaw = Math.atan2(cx - p.x, cz - p.z);
    if (kind === 'ball') ball(p.x, rugY, p.z, size, true);
    else if (kind === 'tower') {
      let y = rugY;
      for (let q = 0; q < 3; q++) {
        const sz = size * (1 - q * 0.14);
        block(q === 1 ? M.ALL : worldOf(q / 2 + (u > 0.4 ? 1 : 0)), p.x, y, p.z, sz, yaw + (q - 1) * 0.3, word[q], q === 1 ? TOY_YELLOW : null);
        y += sz;
      }
    } else if (kind === 'crayons') {
      crayon(M.R, p.x, p.z, 90, 7, yaw + 1.2);
      crayon(M.B, p.x + 26, p.z + 12, 80, 7, yaw + 1.7);
      crayon(M.ALL, p.x - 18, p.z + 30, 70, 7, yaw + 0.8, TEAL);
    } else stacker(p.x, p.z, size);
  }
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
