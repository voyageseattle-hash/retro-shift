// TOPPLE RUN's dominoes (tracks-domino.js says where everything stands; this is what it does).
//
// One chain of giant dominoes runs right round the rug: beside the grid, down RUG RUN, along the north side to the
// book, down CRANE LANE, through the BLUE SPUR and back to the grid. GO tips the first one and the wave runs the whole
// way round at about race pace. Every domino's angle is worked out from the race clock alone, so the wave is the same
// in every race, for every player and on every machine.
//
//   on a lane    two chains stand interleaved, red pips and blue pips, each snaking across the lane. A lens sees and
//                hits only its own colour (a slalom); BOTH has both to deal with, and knocks flat what it hits.
//   the wave     dominoes fall forward and lie flat. Behind the front there's a tailwind that draws you up to it,
//                and right behind it is the crest: a boost that holds you at the wave's own speed, SHIFT trickling
//                back, and a slingshot off the end of the lane.
//   the book     stands beside the gap in BOOK BRIDGE until the wave reaches it, then falls across it.
//   the crane    stands CRANE LANE back up later in the race, then tips it from the far end, toward you.
//   SHORT ROW    low slabs right across a cut: the Pair goes through them, the Skimmer LIFTs over, the Blade doesn't.
//   the planks   one stretch of RUG RUN has no road of its own: the dominoes there are as wide as the lane, and once
//                they are down they are the road.
//   the toy cars the end of the chain shunts a queue of toy cars on a ramp beside the grid. The front one rolls off
//                into the start straight, crosses it and runs off the far side; another follows every so often, with
//                a bell and a rock on its springs first. Red car, blue car, turn about: the other lens goes through.
//
// Coming off the road here drops you onto the rug, and the rug puts you straight back on the road, slower.

import * as THREE from '../../vendor/three.js';
import { M, RED, BLUE, BOTH, solidIn, colorForMask } from './shift.js';
import { TOY_YELLOW } from './toybox.js';
import { dominoArt } from './domino-art.js';
import { chainEnd } from '../game/chain.js';
import { clamp, lerp } from '../core/util.js';

const H = 7.6; // a domino: height, width, thickness
const W = 5;
const T = 0.9;
const STEP = 3.6; // between neighbours along a lane (red, blue, red...)
const TF = 0.36; // seconds to fall
const TR = 0.9; // seconds to be stood back up
const FLAT = Math.PI / 2;
const SOLID = 0.35; // a domino leaning further than this is no longer in your way
const CREST = 40; // metres behind the front that count as the crest
const WIND = 150; // and how far back the tailwind reaches
const HOLD = 30; // nobody gets closer to the front than this
const PIPS = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];

// the chain between the lanes, as lines across the rug [x, z]: `from`/`to` name the lane end it starts or stops at
const LINKS = {
  C0: { pts: [[46, -56], [46, 96], [40, 140]], to: 'A' },
  C1: { from: 'A', pts: [[205, 297], [545, 297]], to: 'book' },
  C2: { from: 'book', pts: [[628, 196], [641, 110], [650, 40]], to: 'B' },
  C3: { from: 'B', pts: [[480, -168], [410, -176]], to: 'S' },
  C4: { from: 'S', pts: [[150, -176], [128, -150], [114, -118]], to: [107, -93] },
};
// the wave's way round, and how fast it runs each stretch (m/s)
const ORDER = [['C0', 80], ['A', 74], ['C1', 48], ['book', 0], ['C2', 58], ['B', 74], ['C3', 58], ['S', 70], ['C4', 58]];
// the crane: CRANE LANE is stood back up from RISE0 seconds, held, then tipped from the far end; again every EVERY
const CRANE = { rise0: 72, riseV: 62, hold: 23, fallV: 74, every: 58, times: 12 };

// the toy cars: a deck and a ramp beside the grid ([x, z]: the top of the ramp, its foot, where a car meets the road)
const GARAGE = { top: [64, -74], foot: [49, -68], enter: [11, -52], deckY: 6, slot: 9, cars: 5, every: 39, v: 38 };
const PLANK = 7.2; // between the planks (they're H long, so they overlap a little when they're down)

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Color();

const byLabel = (world, name) => world.paths.find((p) => p.def?.dominoes?.name === name);

// where a lane is at `s` metres along it
function laneAt(path, s) {
  const x = clamp(s / path.ds, 0, path.N - 1.001);
  const i = Math.floor(x);
  const t = x - i;
  const fx = lerp(path.thx[i], path.thx[i + 1], t);
  const fz = lerp(path.thz[i], path.thz[i + 1], t);
  const fl = Math.hypot(fx, fz) || 1;
  return { x: lerp(path.px[i], path.px[i + 1], t), y: lerp(path.py[i], path.py[i + 1], t), z: lerp(path.pz[i], path.pz[i + 1], t), fx: fx / fl, fz: fz / fl, i: Math.round(x) };
}

// ------------------------------------------------------------------ before the roads are drawn
export function layDominoes(world) {
  // the rug is right under the road: you're off the course when you touch it, not two metres above it
  world.fallY = world.floorY - 2.5;
  for (const path of world.paths) {
    const d = path.def;
    if (!d) continue;
    if (d.rail) {
      // TOP EDGE: the top of a packed row, no wider than a tile is thick to anything but the Blade
      path.cling = new Uint8Array(path.N);
      for (let i = Math.round(d.rail.from * path.N); i < Math.round(d.rail.to * path.N); i++) {
        path.cling[i] = 1;
        path.railL[i] = path.railR[i] = 0;
      }
      path._form = RED; // (ai.js: the form this route takes)
    }
    const pg = (world.def.gaps || []).find((q) => q.path === path.id && q.planks);
    if (pg) {
      // the planks: no road is drawn here (track.js: a gap), and the fallen dominoes are it (Dominoes puts the road back)
      const i0 = path.index(pg.at);
      const n = Math.max(2, Math.round(pg.len / path.ds));
      path.plankGap = { i0, i1: Math.min(path.N - 1, i0 + n - 1), s0: i0 * path.ds, s1: (i0 + n) * path.ds };
    }
    if (d.book) {
      // BOOK BRIDGE: where the gap is, for the book to open
      const g = (world.def.gaps || []).find((q) => q.path === path.id && !q.planks);
      const i0 = path.index(g.at);
      const n = Math.max(2, Math.round(g.len / path.ds));
      path.bookGap = { i0, i1: Math.min(path.N - 1, i0 + n - 1), open: false };
    }
  }
}

// ------------------------------------------------------------------ scenery that stands still
export function dominoDecor(world, L) {
  const rugY = world.floorY + 0.05;
  for (const path of world.paths) {
    const d = path.def;
    if (!d) continue;
    if (d.rail) {
      // the row TOP EDGE runs along: packed tight under the edge, and a staircase of them under each ramp
      for (let s = 4; s < path.length - 4; s += 1.15) {
        const f = laneAt(path, s);
        const h = f.y - rugY - 0.12;
        if (h < 0.9) continue;
        const k = Math.round(s / 1.15);
        L.box(k % 2 ? M.R : M.B, f.x, rugY + h / 2, f.z, W, h, T, Math.atan2(f.fx, f.fz), null, k % 3 === 0);
      }
    }
    if (d.book) {
      // the road climbs over stacks of books either side of the gap
      const g = path.bookGap;
      for (let s = 10; s < path.length - 10; s += 13) {
        const f = laneAt(path, s);
        if (f.i > g.i0 - 4 && f.i < g.i1 + 4) continue;
        const top = f.y - 0.3;
        if (top - rugY < 1.2) continue;
        const n = Math.max(1, Math.round((top - rugY) / 2.4));
        for (let k = 0; k < n; k++) {
          const y0 = rugY + ((top - rugY) * k) / n;
          const y1 = rugY + ((top - rugY) * (k + 1)) / n;
          const yaw = Math.atan2(f.fx, f.fz) + Math.sin(s * 1.7 + k * 2.3) * 0.16;
          L.box(M.ALL, f.x, (y0 + y1) / 2, f.z, path.halfW * 2 + 3 - (k % 2) * 1.5, y1 - y0 - 0.12, 11.5, yaw, [TOY_YELLOW, 0xff7ab8, 0x58e0c8][(k + Math.round(s / 13)) % 3], k === n - 1);
        }
      }
    }
    if (d.dominoes?.spur) {
      // the stack of domino boxes over the mouth of the BLUE SPUR: red world, so the blue lens takes it away
      for (const [u, w, h, lat] of [[0.1, 15, 8, 0], [0.145, 13, 6, 1.5], [0.19, 14, 9, -1], [0.12, 9, 4.5, 0.5]]) {
        const f = laneAt(path, u * path.length);
        const up = u === 0.12 ? 8 : 0;
        const x = f.x - f.fz * lat;
        const z = f.z + f.fx * lat;
        const yaw = Math.atan2(f.fx, f.fz) + lat * 0.07;
        L.box(M.R, x, f.y + up + h / 2, z, w, h, 9, yaw, null, true);
        // (a row of pips on the lid, so it reads as a box of dominoes)
        for (let k = -1; k <= 1; k++) L.ring(M.R, _a.set(x + f.fx * k * 2.6, f.y + up + h + 0.05, z + f.fz * k * 2.6), _b.set(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.8, 8);
      }
    }
    if (d.dominoes?.crane) {
      // the crane's tower, at the far end of its lane (the jib is live: Dominoes)
      const c = craneSpot(world, path);
      const top = c.y + CRANE_H;
      for (let k = 0; k < 6; k++) {
        const y0 = c.y + (CRANE_H * k) / 6;
        const y1 = c.y + (CRANE_H * (k + 1)) / 6;
        L.box(M.ALL, c.x, (y0 + y1) / 2, c.z, 3.4, y1 - y0, 3.4, 0.4, TOY_YELLOW);
        L.lineXYZ(M.ALL, c.x - 1.6, y0, c.z - 1.2, c.x + 1.6, y1, c.z + 1.2, TOY_YELLOW);
      }
      L.box(M.ALL, c.x, c.y + 0.5, c.z, 9, 1, 9, 0.4, TOY_YELLOW, true);
      L.box(M.ALL, c.x, top + 1.2, c.z, 4.6, 2.4, 4.6, 0.4, 0xff7ab8, true);
    }
  }
  // the toy cars' deck and ramp (the cars are live: Dominoes)
  {
    const G = GARAGE;
    const dx = G.foot[0] - G.top[0];
    const dz = G.foot[1] - G.top[1];
    const l = Math.hypot(dx, dz);
    const ux = dx / l;
    const uz = dz / l;
    const back = G.slot * (G.cars - 1) + 7;
    const hw = 3.4;
    // (a plank from a to b at heights ya, yb: its edges, rungs across it, and a block under each end)
    const plank = (ax, az, ya, bx, bz, yb, col) => {
      const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 4));
      for (const sd of [-1, 1]) L.lineXYZ(M.ALL, ax - uz * hw * sd, ya, az + ux * hw * sd, bx - uz * hw * sd, yb, bz + ux * hw * sd, col);
      for (let k = 0; k <= n; k++) {
        const x = lerp(ax, bx, k / n);
        const z = lerp(az, bz, k / n);
        const y = lerp(ya, yb, k / n);
        L.lineXYZ(M.ALL, x - uz * hw, y, z + ux * hw, x + uz * hw, y, z - ux * hw, col);
      }
    };
    plank(G.top[0] - ux * back, G.top[1] - uz * back, rugY + G.deckY, G.top[0], G.top[1], rugY + G.deckY, TOY_YELLOW);
    plank(G.top[0], G.top[1], rugY + G.deckY, G.foot[0], G.foot[1], rugY + 0.05, 0xff7ab8);
    for (let d = 0; d <= back; d += 11) {
      const x = G.top[0] - ux * d;
      const z = G.top[1] - uz * d;
      L.box(M.ALL, x, rugY + (G.deckY - 0.3) / 2, z, 5, G.deckY - 0.3, 5, Math.atan2(ux, uz), [0x58e0c8, TOY_YELLOW, 0xff7ab8][Math.round(d / 11) % 3], true);
    }
    // the bell on its post at the top of the ramp
    const px = G.top[0] - uz * (hw + 1.5);
    const pz = G.top[1] + ux * (hw + 1.5);
    L.lineXYZ(M.ALL, px, rugY, pz, px, rugY + G.deckY + 5, pz, TOY_YELLOW);
    L.ring(M.ALL, new THREE.Vector3(px, rugY + G.deckY + 5.8, pz), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 0.9, 10, TOY_YELLOW);
    L.ring(M.ALL, new THREE.Vector3(px, rugY + G.deckY + 5.8, pz), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), 0.9, 10, TOY_YELLOW);
  }
  // spare dominoes left standing in a spiral in the middle of the rug
  const m = world.main;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < m.N; i++) {
    cx += m.px[i] / m.N;
    cz += m.pz[i] / m.N;
  }
  for (let k = 0; k < 54; k++) {
    const a = k * 0.42;
    const r = 26 + k * 2.1;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    L.box(k % 2 ? M.R : M.B, x, rugY + H / 2, z, W, H, T, -a, null, k % 2 === 0);
  }
  // the rug's border, the tiles on the road, the fairy lights and the toys left out round it (domino-art.js)
  dominoArt(world, L);
}

const CRANE_H = 30;
function craneSpot(world, path) {
  const f = laneAt(path, path.length * (path.def.dominoes.u1 + 0.02));
  const side = path.side || 1; // (the inside of the rug)
  return { x: f.x - f.fz * side * (path.halfW + 11), y: world.floorY + 0.05, z: f.z + f.fx * side * (path.halfW + 11) };
}

// ------------------------------------------------------------------ the live part
// One batch of dominoes that share a mask: lines, pips and glass, rewritten for the ones that are moving.
class Batch {
  constructor(world, mask, list) {
    this.list = list;
    const n = list.length;
    const mats = world.layers.materials(mask);
    this.lp = new Float32Array(n * 26 * 3);
    this.rp = new Float32Array(n * 72 * 3);
    this.fp = new Float32Array(n * 8 * 3);
    const lc = new Float32Array(n * 26 * 3);
    const rc = new Float32Array(n * 72 * 3);
    const idx = [];
    list.forEach((d, k) => {
      d.batch = this;
      d.slot = k;
      _c.set(d.colour ?? colorForMask(mask));
      for (let q = 0; q < 26; q++) lc.set([_c.r, _c.g, _c.b], (k * 26 + q) * 3);
      if (d.plank) _c.multiplyScalar(0.55); // (a road of them: glowing, not glaring)
      else _c.lerp(new THREE.Color(0xffffff), 0.45);
      for (let q = 0; q < 72; q++) rc.set([_c.r, _c.g, _c.b], (k * 72 + q) * 3);
      for (const [a, b, c, e] of [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]) idx.push(k * 8 + a, k * 8 + b, k * 8 + c, k * 8 + a, k * 8 + c, k * 8 + e);
    });
    const geo = (pos, col) => {
      const g = new THREE.BufferGeometry();
      const at = new THREE.BufferAttribute(pos, 3);
      at.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', at);
      if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    };
    this.lg = geo(this.lp, lc);
    this.rg = geo(this.rp, rc);
    this.fg = geo(this.fp);
    this.fg.setIndex(idx);
    const lines = new THREE.LineSegments(this.lg, mats.line);
    lines.renderOrder = 2;
    const pips = new THREE.Mesh(this.rg, mats.ribbon);
    pips.renderOrder = 3;
    const glass = new THREE.Mesh(this.fg, mats.fill);
    glass.renderOrder = 1;
    for (const o of [lines, pips, glass]) {
      o.frustumCulled = false;
      world.group.add(o);
    }
    this.dirty = true;
  }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.lg.attributes.position.needsUpdate = true;
    this.rg.attributes.position.needsUpdate = true;
    this.fg.attributes.position.needsUpdate = true;
  }
}

const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

// Draw domino d leaning `ang` the way `dir` (+1 forward along its run, -1 back).
function write(d, ang, dir) {
  const B = d.batch;
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  // it presses into the road as it lands, so a fallen one is a tile you drive over, not a step
  const q = d.keep ? 1 : 1 - 0.86 * clamp((ang - 1.05) / (FLAT - 1.05), 0, 1);
  const ch = (dir * d.t) / 2;
  const rx = -d.fz;
  const rz = d.fx;
  // a point of the slab: a across, b up, c along (from its middle)
  const P = (a, b, c, out, o) => {
    const c2 = (c - ch) * dir * q;
    const F = ch + dir * (c2 * cs + b * sn);
    out[o] = d.x + rx * a + d.fx * F;
    out[o + 1] = d.y + (-c2 * sn + b * cs);
    out[o + 2] = d.z + rz * a + d.fz * F;
  };
  const fo = d.slot * 24;
  if (d.gone) {
    B.fp.fill(0, fo, fo + 24);
    B.lp.fill(0, d.slot * 78, d.slot * 78 + 78);
    B.rp.fill(0, d.slot * 216, d.slot * 216 + 216);
    B.dirty = true;
    return;
  }
  let k = 0;
  for (const a of [-d.w / 2, d.w / 2]) for (const b of [0, d.h]) for (const c of [-d.t / 2, d.t / 2]) P(a, b, c, B.fp, fo + 3 * k++);
  let lo = d.slot * 78;
  for (const [i, j] of EDGES) {
    for (const v of [i, j]) {
      B.lp[lo++] = B.fp[fo + v * 3];
      B.lp[lo++] = B.fp[fo + v * 3 + 1];
      B.lp[lo++] = B.fp[fo + v * 3 + 2];
    }
  }
  // the face that ends up on top (and faces whoever is coming while it stands): the bar across it and the pips
  const c = -dir * (d.t / 2 + 0.04);
  P(-d.w * 0.42, d.h / 2, c, B.lp, lo);
  P(d.w * 0.42, d.h / 2, c, B.lp, lo + 3);
  let ro = d.slot * 216;
  const e = Math.min(d.w * 0.075, 0.5);
  for (const [n, mid] of [[d.pips[0], 0.75], [d.pips[1], 0.25]]) {
    for (const g of PIPS[n]) {
      const a = ((g % 3) - 1) * d.w * 0.27;
      const b = d.h * (mid + (Math.floor(g / 3) - 1) * 0.14);
      for (const [da, db] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
        P(a + da * e, b + db * e, c, B.rp, ro);
        ro += 3;
      }
    }
  }
  B.rp.fill(0, ro, d.slot * 216 + 216);
  B.dirty = true;
}

export class Dominoes {
  constructor(world) {
    this.world = world;
    this.runs = {};
    this.all = [];
    this.lastT = 0;
    this.clackT = 0;
    const rugY = world.floorY + 0.05;
    let n = 0;
    const add = (run, o) => {
      const d = { run, k: run.list.length, w: W, h: H, t: T, ang: -1, dir: 1, knock: -1, knockDir: 1, pips: [1 + ((n * 7 + 3) % 6), 1 + ((n * 5 + 1) % 6)], ...o };
      n++;
      run.list.push(d);
      this.all.push(d);
      return d;
    };
    const newRun = (name, o = {}) => (this.runs[name] = { name, list: [], phases: [], len: 0, max: FLAT, ...o });

    // ---- the lanes: two chains interleaved, each snaking the other way across the lane
    for (const path of world.paths) {
      const D = path.def?.dominoes;
      if (!D) continue;
      const run = newRun(D.name, { path });
      path._dom = run;
      if (D.row != null) {
        // SHORT ROW: low slabs side by side right across the lane
        const f = laneAt(path, D.row * path.length);
        const cnt = 4;
        const w = (path.halfW * 2) / cnt;
        for (let k = 0; k < cnt; k++) {
          const lat = -path.halfW + w * (k + 0.5);
          add(run, { s: 0, ps: D.row * path.length, x: f.x - f.fz * lat, y: f.y, z: f.z + f.fx * lat, fx: f.fx, fz: f.fz, lat, i: f.i, mask: M.ALL, colour: TOY_YELLOW, w: w - 0.25, h: 2.2, t: 0.6, slab: true, pips: [0, 0] });
        }
        continue;
      }
      const s0 = D.u0 * path.length;
      const s1 = D.u1 * path.length;
      const amp = 2.4;
      let k = 0;
      const pg = path.plankGap;
      const pn = pg ? Math.ceil((pg.s1 - pg.s0) / PLANK) : 0;
      for (let s = s0; s <= s1; s += D.spur ? STEP * 1.6 : STEP, k++) {
        if (pg && s > pg.s0 - 4.5 && s < pg.s0 + pn * PLANK + 0.5) continue; // (the planks' stretch)
        const f = laneAt(path, s);
        const red = k % 2 === 0;
        const mask = D.spur ? M.BO : red ? M.R : M.B;
        // red keeps to the left half and blue to the right, each swaying into the middle: a lens always has a clear
        // run down the far side from its own colour, and a tighter line through the sway for the brave
        const sway = Math.sin(((s - s0) / 112) * Math.PI * 2);
        const lat = D.spur ? -2.2 + 1.6 * sway : (red ? -1 : 1) * (2 - amp * sway);
        add(run, { s: s - s0, ps: s, x: f.x - f.fz * lat, y: f.y, z: f.z + f.fx * lat, fx: f.fx, fz: f.fz, lat, i: f.i, mask });
      }
      // the planks: as wide as the lane, toy yellow and pink turn about, there in every lens
      for (let j = 0; j < pn; j++) {
        const s = pg.s0 + j * PLANK;
        const f = laneAt(path, s);
        add(run, { s: s - s0, ps: s, x: f.x, y: f.y, z: f.z, fx: f.fx, fz: f.fz, lat: 0, i: f.i, mask: M.ALL, colour: j % 2 ? 0xff7ab8 : TOY_YELLOW, w: path.halfW * 2 - 0.3, plank: true });
      }
      if (pg) {
        run.list.sort((a, b) => a.ps - b.ps);
        run.list.forEach((d, q) => (d.k = q));
        for (let i = pg.i0; i <= pg.i1; i++) path.mask[i] = M.ALL;
      }
      run.s0 = s0;
      run.len = s1 - s0;
    }
    // (what a lane's obstacles look like to the rivals: ai.js steers round them, race.js leaves them to us)
    for (const d of this.all) {
      d.ob = { path: d.run.path, i: d.i, f: d.run.path.frac(d.i), lat: d.lat, w: d.w / 2, len: d.t / 2, h: d.h, mask: d.mask, type: 'block', sweep: 0, baseLat: d.lat, broken: true, domino: d };
      world.obstacles.push(d.ob);
    }

    // ---- the book, standing on the stack beside its gap
    const bp = world.paths.find((p) => p.bookGap);
    if (bp) {
      const g = bp.bookGap;
      const mid = Math.round((g.i0 + g.i1) / 2);
      const side = bp.side || 1; // it stands on the inside of the rug and falls outward across the lane
      let top = -1e9;
      for (let i = g.i0; i <= g.i1; i++) top = Math.max(top, bp.py[i]);
      const rx = bp.rightX(mid) * side;
      const rz = bp.rightZ(mid) * side;
      const thick = 1.3;
      const run = newRun('book', { path: bp, book: true });
      // (as a domino: its "forward" is across the lane, and it keeps its thickness when it lands)
      add(run, { s: 0, x: bp.px[mid] + rx * (bp.halfW + 0.6 + thick / 2), y: top - thick - 0.03, z: bp.pz[mid] + rz * (bp.halfW + 0.6 + thick / 2), fx: -rx, fz: -rz, mask: M.ALL, colour: TOY_YELLOW, w: (g.i1 - g.i0 + 2) * bp.ds, h: bp.halfW * 2 + 1.2, t: thick, keep: true, pips: [5, 0] });
      run.fallT = 0.95;
    }

    // ---- the chain between the lanes (scenery: it stands on the rug and nothing hits it)
    const ends = (name, last) => {
      if (Array.isArray(name)) return name;
      const run = this.runs[name];
      const d = run.book ? run.list[0] : run.list[last ? run.list.length - 1 : 0];
      return [d.x - (run.book ? 0 : d.fx * (last ? -6 : 6)), d.z - (run.book ? 0 : d.fz * (last ? -6 : 6))];
    };
    const onRoad = (x, z) => {
      for (const p of world.paths) {
        for (let i = 0; i < p.N; i += 2) {
          const dx = p.px[i] - x;
          const dz = p.pz[i] - z;
          if (dx * dx + dz * dz < (p.halfW + 3) ** 2) return true;
        }
      }
      return false;
    };
    for (const [name, L] of Object.entries(LINKS)) {
      const pts = [...(L.from ? [ends(L.from, true)] : []), ...L.pts, ends(L.to, false)];
      const run = newRun(name, { max: FLAT - 0.2 });
      let s = 0;
      let next = 0;
      for (let q = 0; q + 1 < pts.length; q++) {
        const [x0, z0] = pts[q];
        const [x1, z1] = pts[q + 1];
        const len = Math.hypot(x1 - x0, z1 - z0);
        for (; next <= s + len; next += 4.6) {
          const u = (next - s) / len;
          const x = lerp(x0, x1, u);
          const z = lerp(z0, z1, u);
          if (onRoad(x, z)) continue;
          add(run, { s: next, x, y: rugY, z, fx: (x1 - x0) / len, fz: (z1 - z0) / len, mask: run.list.length % 2 ? M.B : M.R });
        }
        s += len;
      }
      run.len = s;
    }

    // ---- the clock: GO tips the first one, and the wave goes round
    let t = 0;
    for (const [name, v] of ORDER) {
      const run = this.runs[name];
      if (!run) continue;
      if (run.book) {
        run.phases.push({ kind: 'fall', dir: 1, t0: t, v: 1e6 });
        run.openAt = t + run.fallT * 0.8;
        t += 0.35;
        continue;
      }
      run.phases.push({ kind: 'fall', dir: 1, t0: t, v });
      t += run.len / v + 0.06;
    }
    this.lapT = t;
    this.garage(world, t + 0.15);
    const B = this.runs.B;
    if (B) {
      for (let k = 0; k < CRANE.times; k++) {
        const r0 = CRANE.rise0 + k * CRANE.every;
        B.phases.push({ kind: 'rise', dir: -1, t0: r0, v: CRANE.riseV });
        B.phases.push({ kind: 'fall', dir: -1, t0: r0 + B.len / CRANE.riseV + TR + CRANE.hold, v: CRANE.fallV });
      }
      // the crane's jib and cable
      this.crane = { ...craneSpot(world, B.path), tip: new THREE.Vector3(), aim: new THREE.Vector3() };
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 2 * 3), 3));
      this.crane.geo = g;
      const o = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: TOY_YELLOW, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
      o.frustumCulled = false;
      o.renderOrder = 2;
      world.group.add(o);
      const last = B.list[B.list.length - 1];
      this.crane.rest = new THREE.Vector3(last.x, last.y + H + 9, last.z);
      this.crane.tip.copy(this.crane.rest);
    }

    // ---- drawing
    const groups = new Map();
    for (const d of this.all) {
      if (!groups.has(d.mask)) groups.set(d.mask, []);
      groups.get(d.mask).push(d);
    }
    this.batches = [...groups].map(([mask, list]) => new Batch(world, mask, list));
    this.update(null, 0);
  }

  // When the front of phase ph reaches domino d.
  arrive(ph, d) {
    return ph.t0 + (ph.dir > 0 ? d.s : d.run.len - d.s) / ph.v;
  }

  // Domino d at race time t: how far over it is, which way, and whether it's standing in the road.
  state(d, t, out) {
    let kind = null;
    let at = 0;
    let dir = 1;
    let next = 1e9;
    for (const ph of d.run.phases) {
      const a = this.arrive(ph, d);
      if (a <= t) {
        kind = ph.kind;
        at = a;
        if (ph.kind === 'fall') dir = ph.dir;
      } else if (ph.kind === 'fall') {
        next = Math.min(next, a);
      }
    }
    let fallT = d.run.fallT || TF;
    if (d.knock >= 0) {
      if (kind === 'rise' && d.knock < at) {
        d.knock = -1; // stood back up since
        d.gone = false;
      } else if (kind !== 'fall' || d.knock < at) {
        kind = 'fall';
        at = d.knock;
        dir = d.knockDir;
        fallT = 0.28;
      }
    }
    let ang = 0;
    let solid = true;
    if (kind === 'fall') {
      const p = clamp((t - at) / fallT, 0, 1);
      ang = d.run.max * p ** 2.2;
      solid = ang < SOLID;
    } else if (kind === 'rise') {
      const p = clamp((t - at) / TR, 0, 1);
      ang = d.run.max * (1 - p * p * (3 - 2 * p));
      solid = p >= 1;
    }
    // about to go: it wobbles (the tell)
    if (kind !== 'fall' && next - t < 0.7) ang += 0.05 * Math.sin(t * 38 + d.k * 1.7) * (1 - (next - t) / 0.7);
    out.ang = ang;
    out.dir = dir;
    out.solid = solid && !d.gone;
    out.back = kind === 'fall' && dir < 0 && d.knock < 0;
    return out;
  }

  // Where the front of a forward wave is on a lane right now (metres along the path), or null.
  front(run, t) {
    for (const ph of run.phases) {
      if (ph.kind !== 'fall' || ph.dir < 0) continue;
      const s = (t - ph.t0) * ph.v;
      if (s >= -ph.v * 0.1 && s <= run.len + 30) return { s: run.s0 + s, v: ph.v, done: s > run.len };
    }
    return null;
  }

  // How much of a lane is standing in the road at time t (0..1).
  standing(run, t) {
    let n = 0;
    const st = (this._st ||= {});
    for (let k = 0; k < run.list.length; k += 4) if (this.state(run.list[k], t, st).solid) n++;
    return n / Math.ceil(run.list.length / 4);
  }

  update(race, dt) {
    const t = race ? race.raceTime : 0;
    if (t < this.lastT - 0.05) for (const d of this.all) {
      d.knock = -1;
      d.gone = false;
      d.ang = -1;
    }
    this.lastT = t;
    const st = (this._st ||= {});
    let loud = 0;
    const ear = race?.player?.pos;
    for (const d of this.all) {
      this.state(d, t, st);
      if (d.ob) d.ob.mask = st.solid ? d.mask : 0;
      if (st.ang === d.ang && st.dir === d.dir && !d.redraw) continue;
      const was = d.ang;
      d.redraw = false;
      d.ang = st.ang;
      d.dir = st.dir;
      write(d, st.ang, st.dir);
      // it lands: a clack, heard from where you are; one coming back at you can land on you
      if (was >= 0 && was < 1.25 && st.ang >= 1.25) {
        if (ear) loud = Math.max(loud, (d.run.book ? 2 : 1) * clamp(1 - Math.hypot(d.x - ear.x, d.z - ear.z) / 240, 0, 1));
        if (st.back && d.ob && race) this.landOn(race, d);
      }
    }
    for (const b of this.batches) b.flush();
    if (loud > 0.03 && race) {
      if (loud > 1) race.app.audio.play('land', 14);
      race.app.audio.play('clack', Math.min(1, loud));
    }
    // the book opens its bridge
    const book = this.runs.book;
    if (book) {
      const g = book.path.bookGap;
      const open = t >= book.openAt;
      if (open !== g.open) {
        g.open = open;
        for (let i = g.i0; i <= g.i1; i++) book.path.mask[i] = open ? M.ALL : 0;
      }
    }
    if (this.crane) this.swing(t, dt || 0);
    this.roll(race, t);
    if (!race) return;
    // rivals: back to BOTH for the SHORT ROW (the Pair is the one that goes through it)
    const R = this.runs.R;
    if (R) {
      for (const r of race.racers) {
        if (!r.ai || r.mono || r.mode === BOTH || r.track?.path !== R.path) continue;
        const ahead = R.list[0].ps - r.track.i * R.path.ds;
        if (ahead > 0 && ahead < 70 && R.list.some((d) => !d.gone)) r.shiftTo(BOTH, race);
      }
      // and the row is set up again once everyone has gone
      for (const d of R.list) {
        if (d.knock < 0 || t - d.knock < 9) continue;
        if (race.racers.some((r) => (r.pos.x - d.x) ** 2 + (r.pos.z - d.z) ** 2 < 70 * 70)) continue;
        d.knock = -1;
        d.gone = false;
        d.redraw = true;
      }
    }
  }

  // ---- the toy cars
  // Build the queue on the deck. t0: when the end of the chain shunts it and the front car goes.
  garage(world, t0) {
    const G = GARAGE;
    const main = world.main;
    const rugY = world.floorY + 0.05;
    const f = {};
    main.frame(G.enter[0], G.enter[1], -1, f);
    const ux = (G.top[0] - G.foot[0]) / Math.hypot(G.top[0] - G.foot[0], G.top[1] - G.foot[1]);
    const uz = (G.top[1] - G.foot[1]) / Math.hypot(G.top[0] - G.foot[0], G.top[1] - G.foot[1]);
    const seg = (x0, y0, z0, x1, y1, z1) => [x0, y0, z0, x1, y1, z1];
    const box = (x0, y0, z0, x1, y1, z1) => {
      const o = [];
      for (const [a, b] of [[y0, z0], [y0, z1], [y1, z0], [y1, z1]]) o.push(...seg(x0, a, b, x1, a, b));
      for (const [a, b] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]]) o.push(...seg(a, y0, b, a, y1, b));
      for (const [a, b] of [[x0, y0], [x0, y1], [x1, y0], [x1, y1]]) o.push(...seg(a, b, z0, a, b, z1));
      return o;
    };
    const lines = [...box(-2.1, 0.7, -4.5, 2.1, 2.3, 4.5), ...box(-1.7, 2.3, -2.4, 1.7, 3.7, 1.4)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let q = 0; q < 8; q++) {
        const a0 = (q / 8) * Math.PI * 2;
        const a1 = ((q + 1) / 8) * Math.PI * 2;
        lines.push(sx * 2.25, 1.1 + Math.sin(a0) * 1.1, sz * 2.9 + Math.cos(a0) * 1.1, sx * 2.25, 1.1 + Math.sin(a1) * 1.1, sz * 2.9 + Math.cos(a1) * 1.1);
      }
    }
    // (the wind-up key in its back, and its headlights)
    lines.push(0, 1.6, -4.5, 0, 1.6, -5.6, 0, 0.9, -5.6, 0, 2.3, -5.6, 0, 0.9, -5.6, 0, 0.9, -6.3, 0, 2.3, -5.6, 0, 2.3, -6.3);
    lines.push(...box(-1.7, 1.2, 4.5, -0.9, 1.9, 4.56), ...box(0.9, 1.2, 4.5, 1.7, 1.9, 4.56));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const body = new THREE.BoxGeometry(4.2, 1.6, 9).translate(0, 1.5, 0);
    const cab = new THREE.BoxGeometry(3.4, 1.4, 3.8).translate(0, 3, -0.5);
    this.cars = [];
    for (let k = 0; k < G.cars; k++) {
      const mask = k % 2 ? M.B : M.R;
      const mats = world.layers.materials(mask);
      const root = new THREE.Group();
      root.rotation.order = 'YXZ';
      const wire = new THREE.LineSegments(geo, mats.wire);
      wire.renderOrder = 2;
      root.add(wire, new THREE.Mesh(body, mats.fill), new THREE.Mesh(cab, mats.fill));
      world.group.add(root);
      // its way to the road: along the deck to the top of the ramp, down it, across the rug
      const way = [[G.top[0] + ux * G.slot * k, rugY + G.deckY, G.top[1] + uz * G.slot * k], [G.top[0], rugY + G.deckY, G.top[1]], [G.foot[0], rugY, G.foot[1]], [G.enter[0], main.py[f.i], G.enter[1]]];
      let len = 0;
      for (let q = 0; q + 1 < way.length; q++) len += Math.hypot(way[q + 1][0] - way[q][0], way[q + 1][2] - way[q][2]);
      const dur = len / G.v + 0.8;
      const ob = { path: main, i: f.i, f: main.frac(f.i), lat: f.lat, w: 2.2, len: 4.5, h: 3.7, mask: 0, type: 'block', sweep: 0, baseLat: f.lat, broken: true, toyCar: k };
      world.obstacles.push(ob);
      this.cars.push({ k, mask, root, way, len, dur, t0: t0 + k * G.every, slow: 4 + 0.4 * k, i0: f.i, lat0: f.lat, ob, x: 0, y: 0, z: 0, hx: 0, hz: 1, v: 0, on: false, rang: false });
    }
    this.roll(null, 0);
  }

  // Where every toy car is at race time t.
  roll(race, t) {
    const G = GARAGE;
    const main = this.world.main;
    const rugY = this.world.floorY + 0.05;
    const sm = (x) => {
      x = clamp(x, 0, 1);
      return x * x * (3 - 2 * x);
    };
    for (const c of this.cars || []) {
      const tau = t - c.t0;
      let pitch = 0;
      const at = (d, out) => {
        // (d metres along its way to the road)
        let q = 0;
        for (; q + 2 < c.way.length; q++) {
          const l = Math.hypot(c.way[q + 1][0] - c.way[q][0], c.way[q + 1][2] - c.way[q][2]);
          if (d <= l) break;
          d -= l;
        }
        const a = c.way[q];
        const b = c.way[q + 1];
        const l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
        const u = clamp(d / l, 0, 1);
        out.set(lerp(a[0], b[0], u), lerp(a[1], b[1], q === 2 ? Math.max(0, (u - 0.9) / 0.1) : u), lerp(a[2], b[2], u));
        c.hx = (b[0] - a[0]) / l;
        c.hz = (b[2] - a[2]) / l;
        return q === 1 ? Math.atan2(a[1] - b[1], l) : 0;
      };
      c.on = false;
      if (tau < 0) {
        // waiting on the deck; in its last second it rocks on its springs (the tell), and the bell goes
        at(0, _a);
        const shunt = t - this.cars[0].t0;
        if (c.k && shunt > 0 && shunt < 0.5) _a.addScaledVector(_b.set(c.hx, 0, c.hz), 0.7 * Math.sin((shunt / 0.5) * Math.PI));
        if (tau > -1.1) pitch = 0.07 * Math.sin(t * 34) * (1 + tau / 1.1 > 0 ? 1 : 0);
        if (c.k && tau > -1.1 && !c.rang && race) {
          const ear = race.player?.pos;
          if (ear && ear.distanceToSquared(_a) < 420 * 420) race.app.audio.play('toybell', clamp(1.2 - ear.distanceTo(_a) / 420, 0.15, 1));
        }
        c.rang = tau > -1.1;
        c.v = 0;
      } else if (tau < c.dur) {
        // off the deck and down the ramp, getting up to speed
        const left = c.dur - tau;
        const k2 = (G.v * c.dur - c.len) / (c.dur * c.dur);
        pitch = at(c.len - G.v * left + k2 * left * left, _a);
        c.v = G.v - 2 * k2 * left;
      } else {
        // on the road: across it from the inside to the outside as it runs down the straight, slowing, and off the
        // far side to stop on the rug
        const tt = Math.min(tau - c.dur, G.v / c.slow);
        const dr = G.v * tt - 0.5 * c.slow * tt * tt;
        const latAt = (q) => c.lat0 + (4 - c.lat0) * sm(q / 1.8) + 13 * sm((q - 3.4) / 2.2);
        const lat = latAt(tt);
        const x = c.i0 + dr / main.ds;
        const i = Math.floor(x);
        main.point(i, lat, 0, _a).lerp(main.point(i + 1, lat, 0, _b), x - i);
        const off = clamp((Math.abs(lat) - main.halfW) / 2, 0, 1);
        _a.y = lerp(_a.y, rugY, off);
        const j = main.wrap(i);
        const side = (latAt(tt + 0.05) - lat) / 0.05 / Math.max(6, G.v - c.slow * tt);
        c.hx = main.thx[j] + main.rightX(j) * side;
        c.hz = main.thz[j] + main.rightZ(j) * side;
        const hl = Math.hypot(c.hx, c.hz) || 1;
        c.hx /= hl;
        c.hz /= hl;
        c.v = G.v - c.slow * tt;
        c.on = Math.abs(lat) < main.halfW + 1.5;
        c.ob.i = main.wrap(Math.round(x));
        c.ob.f = main.frac(c.ob.i);
        c.ob.lat = c.ob.baseLat = lat;
        // it bumps up onto the road: a knock, heard from where you are
        if (race && !c.landed) {
          const ear = race.player?.pos;
          if (ear && ear.distanceToSquared(_a) < 260 * 260) race.app.audio.play('land', 9);
        }
        c.landed = true;
      }
      if (tau < c.dur) c.landed = false;
      c.ob.mask = c.on ? c.mask : 0;
      c.x = _a.x;
      c.y = _a.y;
      c.z = _a.z;
      c.root.position.copy(_a);
      c.root.rotation.set(pitch, Math.atan2(c.hx, c.hz), 0);
    }
  }

  // A racer on the main road against the toy cars: solid in its lens it's a slow car to run into the back of.
  carHit(race, r) {
    for (const c of this.cars || []) {
      if (!c.on || r.beamT > 0 || r.pos.y - c.y > 3.9) continue;
      const dx = r.pos.x - c.x;
      const dz = r.pos.z - c.z;
      const along = dx * c.hx + dz * c.hz;
      const side = -dx * c.hz + dz * c.hx;
      const penA = 4.6 + r.halfL - Math.abs(along);
      const penS = 2.2 + r.halfW - Math.abs(side);
      if (penA <= 0 || penS <= 0) {
        if (r.inCar === c) r.inCar = null;
        continue;
      }
      const t = race.raceTime;
      if (!solidIn(c.mask, r.mode)) {
        // the other lens: straight through it
        if (r.inCar !== c) {
          r.inCar = c;
          r.energy = Math.min(1, r.energy + 0.04);
          race.onMove(r, 'phase', { type: 'toycar' });
          if (r.isPlayer) {
            race.app.audio.play('phase');
            race.emitP(r, 'popup', { text: 'PHASED', color: r.mode === RED ? '#ff4a6a' : '#4ab0ff', small: true });
          }
        }
        continue;
      }
      if (r.inCar === c) continue; // shifted back while inside it: let them out
      // push out the short way: off its side, or back off its tail
      if (penS < penA) {
        const sg = side < 0 ? -1 : 1;
        r.pos.x += -c.hz * sg * penS;
        r.pos.z += c.hx * sg * penS;
        const vn = (r.vel.x * -c.hz + r.vel.z * c.hx) * sg;
        if (vn < 0) {
          r.vel.x -= -c.hz * sg * vn * 1.3;
          r.vel.z -= c.hx * sg * vn * 1.3;
        }
      } else {
        const sg = along < 0 ? -1 : 1;
        r.pos.x += c.hx * sg * penA;
        r.pos.z += c.hz * sg * penA;
      }
      if ((r.carT ?? -9) > t - 0.8) continue;
      r.carT = t;
      r.carHits = (r.carHits || 0) + 1;
      // and it costs speed: down to about the car's own
      const sp = Math.hypot(r.vel.x, r.vel.z);
      const cap = Math.max(18, c.v * 0.9);
      if (sp > cap && penS >= penA) {
        r.vel.x *= cap / sp;
        r.vel.z *= cap / sp;
      } else {
        r.vel.x *= 0.85;
        r.vel.z *= 0.85;
      }
      chainEnd(race, r);
      if (!r.mono && r.hp > 30) race.hurt(r, penS >= penA ? 8 : 3, null, null);
      if (race.near(r)) race.debris.sparks(r.pos, _a.set(c.hx, 0.5, c.hz), 16, colorForMask(c.mask), 16, c.y);
      if (r.isPlayer) {
        race.app.audio.play('wall');
        race.emitP(r, 'popup', { text: 'HIT THE TOY CAR', color: '#ff4a6a', small: true });
        race.camOf(r).addShake(0.4);
      }
    }
  }

  // The crane's jib follows whichever domino it is standing up.
  swing(t, dt) {
    const C = this.crane;
    const B = this.runs.B;
    let target = null;
    for (const ph of B.phases) {
      if (ph.kind !== 'rise') continue;
      const s = B.len - (t - ph.t0) * ph.v;
      if (t >= ph.t0 - 1.5 && s > -ph.v * TR) {
        const d = B.list[clamp(Math.round(Math.max(0, s) / STEP), 0, B.list.length - 1)];
        target = C.aim.set(d.x, d.y + H + 2 + (t < ph.t0 ? 7 : 0), d.z);
        break;
      }
    }
    C.tip.lerp(target || C.rest, 1 - Math.exp(-(target ? 9 : 2) * dt));
    const top = C.y + CRANE_H + 2.4;
    const P = C.geo.attributes.position.array;
    const dx = C.tip.x - C.x;
    const dz = C.tip.z - C.z;
    const l = Math.hypot(dx, dz) || 1;
    const jx = C.x + dx;
    const jz = C.z + dz;
    const bx = C.x - (dx / l) * 9;
    const bz = C.z - (dz / l) * 9;
    const segs = [
      [C.x, top, C.z, jx, top + 3, jz], // jib
      [C.x, top + 8, C.z, jx, top + 3, jz], // its stay
      [C.x, top, C.z, C.x, top + 8, C.z], // mast head
      [C.x, top, C.z, bx, top, bz], // counter-jib
      [C.x, top + 8, C.z, bx, top, bz],
      [jx, top + 3, jz, C.tip.x, C.tip.y, C.tip.z], // cable
      [C.tip.x - 1.2, C.tip.y, C.tip.z, C.tip.x + 1.2, C.tip.y, C.tip.z], // hook
      [C.tip.x, C.tip.y, C.tip.z - 1.2, C.tip.x, C.tip.y, C.tip.z + 1.2],
    ];
    segs.forEach((s, k) => P.set(s, k * 6));
    C.geo.attributes.position.needsUpdate = true;
  }

  // A domino tipped back toward the traffic has landed: anyone under it, in a lens it's solid in, is bowled over.
  landOn(race, d) {
    for (const r of race.racers) {
      if (r.respawnT > 0 || r.puppet || r.track?.path !== d.run.path || r.pos.y - d.y > 2.5) continue;
      const dx = r.pos.x - d.x;
      const dz = r.pos.z - d.z;
      const along = -(dx * d.fx + dz * d.fz); // (it fell back down the lane)
      const lat = -dx * d.fz + dz * d.fx;
      if (along < -1 || along > d.h + 1 || Math.abs(lat) > d.w / 2 + r.halfW) continue;
      if ((r.bowlT ?? -9) > race.raceTime - 1.2) continue;
      r.bowlT = race.raceTime;
      if (!solidIn(d.mask, r.mode)) {
        race.onMove(r, 'phase', { type: 'domino' });
        if (r.isPlayer) {
          race.app.audio.play('phase');
          race.emitP(r, 'popup', { text: 'PHASED', color: r.mode === RED ? '#ff4a6a' : '#4ab0ff', small: true });
        }
        continue;
      }
      r.vel.multiplyScalar(0.5);
      r.bowls = (r.bowls || 0) + 1;
      chainEnd(race, r);
      race.hurt(r, 10, null, 'BOWLED OVER');
      if (race.near(r)) race.debris.sparks(r.pos, _a.set(-d.fx, 0.6, -d.fz), 22, colorForMask(d.mask), 16, d.y);
      if (r.isPlayer) race.app.audio.play('smash');
    }
  }

  // One racer, every physics step: the dominoes it runs into, the crest, and the rug.
  racer(race, r, dt) {
    if (r.respawnT > 0 || r.puppet) return;
    const w = this.world;
    if (!r.gnd.onRoad && r.pos.y < w.floorY + 0.15) return this.rug(race, r);
    const tr = r.track;
    if (r.gnd.onRoad && tr?.path === w.main) this.carHit(race, r);
    const run = r.gnd.onRoad && tr ? tr.path._dom : null;
    if (!run) {
      if (r.onCrest) this.leave(race, r);
      return;
    }
    const t = race.raceTime;
    const P = run.path;
    const sR = tr.i * P.ds;
    // ---- standing dominoes
    let lo = 0;
    let hi = run.list.length - 1;
    if (run.len) {
      // (the first one within reach, by where they stand along the lane)
      let a = 0;
      let b = run.list.length;
      while (a < b) {
        const m = (a + b) >> 1;
        if (run.list[m].ps < sR - 9) a = m + 1;
        else b = m;
      }
      lo = a;
      hi = Math.min(hi, a + 8);
    }
    for (let k = lo; k <= hi; k++) {
      const d = run.list[k];
      if (!d.ob.mask || d.knock >= 0 || r.beamT > 0) continue;
      const dx = r.pos.x - d.x;
      const dz = r.pos.z - d.z;
      const along = dx * d.fx + dz * d.fz;
      if (Math.abs(along) > d.t / 2 + r.halfL) continue;
      if (Math.abs(-dx * d.fz + dz * d.fx) > d.w / 2 + r.halfW) continue;
      if (r.pos.y - d.y > d.h + 0.4) {
        // over the top of it (the Skimmer's LIFT over the SHORT ROW)
        if (d.slab && (r.overT ?? -9) < t - 2) {
          r.overT = t;
          race.onMove(r, 'glide', {});
          if (r.isPlayer) race.emitP(r, 'popup', { text: 'CLEARED', color: '#4ab0ff', small: true });
        }
        continue;
      }
      if (!solidIn(d.mask, r.mode)) continue;
      this.knock(race, r, d, t);
    }
    // ---- the wave
    const F = run.len ? this.front(run, t) : null;
    const gap = F ? F.s - sR : 1e9;
    if (F && !F.done && r.grounded && gap > 0 && gap < WIND) {
      // the tailwind draws you up to the front; the crest holds you there
      r.giveBoost(0.2, 1.12 + 0.2 * (1 - gap / WIND));
      if (gap < CREST) {
        r.energy = Math.min(1, r.energy + 0.06 * dt);
        if (r.onCrest !== run) {
          r.onCrest = run;
          r.crestT = 0;
          race.onMove(r, 'crest', {});
          if (r.isPlayer) {
            race.emitP(r, 'popup', { text: 'ON THE CREST', color: '#ffd23a' });
            race.app.audio.play('turbo', 1);
          }
        }
        r.crestT += dt;
        if (gap < HOLD) {
          const sp = Math.hypot(r.vel.x, r.vel.z);
          const cap = F.v * (0.8 + 0.2 * clamp((gap - 18) / (HOLD - 18), 0, 1));
          if (sp > cap) {
            r.vel.x *= cap / sp;
            r.vel.z *= cap / sp;
          }
        }
      } else if (r.onCrest === run) r.onCrest = null;
    } else if (r.onCrest === run) {
      if (F?.done || !F) this.leave(race, r);
      else r.onCrest = null;
    }
  }

  // Off the end of the lane with the wave: the slingshot.
  leave(race, r) {
    const rode = r.crestT > 0.8;
    r.onCrest = null;
    r.crestT = 0;
    if (!rode) return;
    r.giveBoost(1.7, 1.34);
    r.slings = (r.slings || 0) + 1;
    r.energy = Math.min(1, r.energy + 0.12);
    race.onMove(r, 'pad', {});
    if (r.isPlayer) {
      race.emitP(r, 'popup', { text: 'SLINGSHOT', color: '#ffd23a' });
      race.app.audio.play('turbo', 3);
      race.camOf(r).fovPunch?.(9);
    }
  }

  // A racer has run into a standing domino: it goes over. The Pair barely feels it; a lens that hits its own colour does.
  knock(race, r, d, t) {
    const fwd = r.vel.x * d.fx + r.vel.z * d.fz;
    d.knock = t;
    r.knocks = (r.knocks || 0) + 1;
    d.knockDir = fwd < 0 ? -1 : 1;
    const sp = Math.hypot(r.vel.x, r.vel.z);
    const pair = r.mode === BOTH;
    const keep = d.slab ? (pair ? 0.93 : r.mono ? 0.8 : 0.6) : pair ? 0.965 : 0.8;
    const floor = pair ? 30 : 20;
    if (sp > floor) {
      const k = Math.max(keep, floor / sp);
      r.vel.x *= k;
      r.vel.z *= k;
    }
    if (!pair) {
      chainEnd(race, r);
      // (never the hit that wrecks you, and Mono Run, which has no BOTH to go through them in, keeps its hull)
      if (!r.mono && r.hp > 30) race.hurt(r, d.slab ? 6 : 3, null, null);
    }
    const near = race.near(r);
    if (d.slab) {
      // the slab comes apart and flies
      d.gone = true;
      d.redraw = true;
      if (near) {
        const fo = d.slot * 24;
        const fp = d.batch.fp;
        const col = new THREE.Color(d.colour);
        for (const [i, j] of EDGES) {
          _a.fromArray(fp, fo + i * 3);
          _b.fromArray(fp, fo + j * 3);
          race.debris.add(_a, _b, { x: r.vel.x * 0.7 + (Math.random() - 0.5) * 14, y: 6 + Math.random() * 12, z: r.vel.z * 0.7 + (Math.random() - 0.5) * 14 }, col, 1.6 + Math.random() * 1.4, d.y);
        }
      }
    }
    if (near) race.debris.sparks(_a.set(d.x, d.y + 1, d.z), _b.set(d.fx * d.knockDir, 0.5, d.fz * d.knockDir), pair ? 14 : 8, d.colour ?? colorForMask(d.mask), 18, d.y);
    if (r.isPlayer) {
      race.app.audio.play(pair ? 'smash' : 'wall');
      if ((r.knockPop ?? -9) < t - 1.2) {
        r.knockPop = t;
        race.emitP(r, 'popup', { text: pair ? 'SMASHED' : 'CLIPPED A DOMINO', color: pair ? '#ffffff' : '#ff4a6a', small: true });
      }
      if (!pair) race.camOf(r).addShake(0.35);
    }
  }

  // Onto the rug: straight back on the road beside where you came off, at a crawl. No wreck, no wait.
  rug(race, r) {
    const m = this.world.main;
    const i = m.wrap(m.index(r.lastU) + 5);
    const far = r.pos.distanceToSquared(m.point(i, 0, 0.3, _a)) > 90 * 90;
    r.pos.copy(_a);
    r.yaw = Math.atan2(m.thx[i], m.thz[i]);
    r.yawRate = 0;
    r.vel.set(m.thx[i], 0, m.thz[i]).multiplyScalar(26);
    r.speed = 26;
    r.boostTime = 0;
    r.spinTime = 0;
    r.drift.active = false;
    r.airTime = 0;
    r.hints = { [m.id]: i, _cur: m.id };
    r.onCrest = null;
    r.invuln = Math.max(r.invuln, 1);
    r.rugs = (r.rugs || 0) + 1;
    chainEnd(race, r);
    if (r.ai) Object.assign(r.ai, { path: m, _branch: null, turn: 0, pinned: 0, planT: 0 });
    if (race.near(r)) race.debris.sparks(r.pos, _b.set(0, 1, 0), 16, TOY_YELLOW, 10, r.pos.y - 0.3);
    if (r.isPlayer) {
      race.app.audio.play('land', 10);
      race.emitP(r, 'popup', { text: 'OFF THE ROAD', color: '#ffd23a', small: true });
      if (far) race.camOf(r).snap(r);
    }
  }

  // ai.js asks before a fork: how keen should a rival be on this branch right now? (null: no opinion)
  branchChance(b, r) {
    const race = r.session;
    const t = (race?.raceTime ?? 0) + 1.4; // about when it would get there
    if (b.bookGap) return t + 1.2 >= this.runs.book.openAt ? 0.75 : 0;
    const run = b._dom;
    if (!run) return null;
    const skill = r.ai?.skill ?? 0.7;
    if (!run.len) return 0.55; // the SHORT ROW
    if (b.def.dominoes.spur) return null;
    const F = this.front(run, t + 0.8);
    if (F && !F.done) return 0.9; // the wave is on it: ride it
    const up = this.standing(run, t + 1.5);
    if (up < 0.1) return 0.9; // flat road
    // a maze: the brave go in. Not when it's about to be tipped back at them.
    const back = run.phases.some((ph) => ph.kind === 'fall' && ph.dir < 0 && ph.t0 > t - 1 && ph.t0 < t + 7);
    return back ? 0.12 : 0.15 + skill * 0.3;
  }
}
