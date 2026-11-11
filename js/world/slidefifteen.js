// 20 SLIDE FIFTEEN (TOYBOX CUP): a giant sliding-tile puzzle on the bed. The lap is the puzzle's raised frame, a
// road that's always there. Inside it, fifteen tiles slide one at a time into the empty slot, each carrying a red road
// and a blue road printed at different angles, and anyone standing on a tile goes with it. Sixteen mouths in the
// frame lead onto the board: a mouth's rail drops, for your lens, while the tile behind it has a road of your colour
// facing it. Where the roads line up there's a way across that skips a side of the frame; where they don't yet, a
// bumper holds you on your tile until a slide brings the next road round. The slides run on the race clock in a
// fixed order (slidepuzzle.js) and solve the puzzle as the race goes on: the last one lands as the leaders start
// lap 3, the picture is whole, and a red road runs straight down the board and a blue one straight across it.
//
// The empty slot is where each form has a way of its own. Under it is a red crossroads (RED and BOTH: the Pair car's
// way onto the board, where it can shove the tile that goes next and make it go now). Narrow lanes peel off that
// crossroads into the two deep cracks down the middle of the board, between the tiles, which only the Blade fits
// and which run out under the board's edge onto the frame. And a cushion of blue air crosses the slot east to west
// for the Skimmer.
//
// The moving-platform machinery (roads that move, carrying, sockets, caps, gates, the rivals' driving) is
// platforms.js; this file is the board, the frame, the slip roads and the look.

import * as THREE from '../../vendor/three.js';
import { Path } from './track.js';
import { Platforms, Platform, CAP } from './platforms.js';
import { Puzzle, worth, KINDS, TILE, SIZE, FRAME, DX, DZ, cellX, cellZ, homeCell, mouthCell } from './slidepuzzle.js';
import { M, RED, BLUE, BOTH, COLORS } from './shift.js';
import { toyboxEnv, TOY_YELLOW } from './toybox.js';

const { D, RC, R, HW, Y: FY } = FRAME;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const YELLOW = new THREE.Color(TOY_YELLOW);

// The frame: a rounded square round the board, driven W side first (heading +z), then N, E and S, the board always
// on the left. [x, z, y] points, the start line half way up the W side.
function framePoints() {
  const pts = [];
  const lo = -D;
  const hi = SIZE + D;
  const arc = (cx, cz, a0) => {
    for (let k = 1; k < 6; k++) {
      const a = a0 - (k / 6) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * RC, cz + Math.sin(a) * RC, FY]);
    }
  };
  const run = (x0, z0, x1, z1) => {
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 40);
    for (let k = 0; k <= n; k++) pts.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n, FY]);
  };
  run(lo, 200, lo, hi - RC);
  arc(lo + RC, hi - RC, Math.PI);
  run(lo + RC, hi, hi - RC, hi);
  arc(hi - RC, hi - RC, Math.PI / 2);
  run(hi, hi - RC, hi, lo + RC);
  arc(hi - RC, lo + RC, 0);
  run(hi - RC, lo, lo + RC, lo);
  arc(lo + RC, lo + RC, -Math.PI / 2);
  run(lo, lo + RC, lo, 160);
  return pts;
}

export function slideFifteenDef() {
  return {
    id: 'tiles',
    num: '20',
    name: 'SLIDE FIFTEEN',
    blurb: 'A sliding puzzle on the bed. Park on the tile with the arrows and ride it to your road.',
    decor: 'none',
    skyPiece: 'none',
    dressEnv: toyboxEnv('bed'),
    seed: 2020,
    laps: 3,
    sun: 0,
    floorDrop: 22,
    noPylons: true,
    points: framePoints(),
    rig: (world) => new SlideFifteen(world),
    features: (P) => ({
      // the frame is the plain way round: a pad out of each corner, in a lens's colour turn about (hidden in BOTH)
      boosts: [{ at: P(0, 0.2) }, { at: P(9, 0.6), mask: M.RO }, { at: P(24, 0.6), mask: M.BO }, { at: P(39, 0.6), mask: M.RO }, { at: P(54, 0.6), mask: M.BO }],
      tips: [{ at: P(1, 0), text: 'SHIFT TO RED OR BLUE: WHERE A MOUTH IN THE RAIL IS OPEN, A TILE ROAD CROSSES THE BOARD', key: 'red' }],
    }),
  };
}

// the outward normal of each side (0 N, 1 E, 2 S, 3 W) and the way the frame is driven along it
const OUT = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const RUN = [[1, 0], [0, -1], [-1, 0], [0, 1]];
// the middle of a mouth, on the board's edge
const mouthAt = (side, idx) => {
  const cell = mouthCell(side, idx);
  return [cellX(cell) + (DX[side] * TILE) / 2, cellZ(cell) + (DZ[side] * TILE) / 2];
};

// seven-segment digits, for the numbers on the tiles: segments as [x0, y0, x1, y1] in a 1 by 2 box
const SEG = { a: [0, 2, 1, 2], b: [1, 2, 1, 1], c: [1, 1, 1, 0], d: [0, 0, 1, 0], e: [0, 1, 0, 0], f: [0, 2, 0, 1], g: [0, 1, 1, 1] };
const DIGIT = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abfgcd'];

export class SlideFifteen extends Platforms {
  constructor(world) {
    super(world);
    this.puzzle = new Puzzle();
    this.tiles = [];
    this._pl = {};
    const start = this.puzzle.states[0];
    for (let k = 1; k <= 15; k++) {
      const cell = start.indexOf(k);
      const pl = new Platform(`t${k}`, cellX(cell), 0, cellZ(cell));
      pl.k = k;
      this.puzzle.roads[k].forEach((kind, colour) => {
        const path = new Path(`t${k}${colour ? 'b' : 'r'}`, tileRoad(kind), false, HW, { bankFactor: 0 });
        this.addRoad(path, pl, { mask: colour ? M.BO : M.RO });
        Object.assign(path, { kind, colour });
      });
      this.tiles[k] = this.addPlatform(pl);
    }
    // the empty slot. It's wherever the hole is, so it moves (the other way) every time a tile does, and carries
    // whoever is in it. Three things live there:
    //   a red road under the board, crossing it both ways: the red world's, so RED and BOTH can drive it (it's the
    //     Pair car's way onto the board);
    //   a cushion of blue air across it east to west, which only the Skimmer can ride (a humped road, in truth);
    //   four narrow red lanes that peel off the under-road and run down into the cracks between the tiles (below).
    const at0 = start.indexOf(0);
    const hole = new Platform('hole', cellX(at0), 0, cellZ(at0));
    hole.k = 0;
    const under = ['NS', 'EW'].map((name) => {
      const path = new Path(`h${name.toLowerCase()}`, tileRoad(KINDS[name], UNDER), false, HW, { bankFactor: 0 });
      this.addRoad(path, hole, { mask: M.R });
      Object.assign(path, { kind: KINDS[name], colour: 0 });
      for (let i = 0; i < path.N; i++) {
        const u = i * path.ds - path.length / 2;
        // (where the two cross there are no rails: it's a junction)
        if (Math.abs(u) < HW + 1.5) path.railL[i] = path.railR[i] = 0;
      }
      return path;
    });
    under[0].cross = under[1];
    under[1].cross = under[0];
    const air = new Path('hair', tileRoad(KINDS.EW, -HUMP), false, HW, { bankFactor: 0 });
    this.addRoad(air, hole, { mask: M.BO });
    Object.assign(air, { kind: KINDS.EW, colour: 1 });
    this.air = air;
    // the peel-offs: out of the junction along the under-road, then a quarter turn to the cell's edge, to end on the
    // crack line pointing down it. One for each edge; an edge that isn't on a crack has a bumper at the end of its.
    this.peels = [1, 3, 0, 2].map((side) => {
      const ew = side % 2 === 1;
      const sg = side === 1 || side === 0 ? 1 : -1;
      const pts = [];
      const h = TILE / 2;
      const put = (a, b) => pts.push(ew ? V(sg * a, -UNDER, -b) : V(b, -UNDER, sg * a));
      put(2, 0);
      put(9, 0);
      for (let k = 0; k <= 8; k++) {
        const t = (k / 8) * (Math.PI / 2);
        put(h - TURN + TURN * Math.sin(t), TURN * (1 - Math.cos(t)));
      }
      // (wider than the crack it feeds, and it draws a craft to its middle as it goes: a funnel)
      const path = new Path(`hp${side}`, pts, false, PEELW, { bankFactor: 0 });
      this.addRoad(path, hole, { mask: M.RO });
      path.oneWay = true;
      path.railL.fill(0);
      path.railR.fill(0);
      path.groove = (f) => 0.16 * THREE.MathUtils.smoothstep(f, 0.3, 0.8);
      path.live = false;
      return path;
    });
    // where a peel-off crosses the under-road's edge, the rail has a gap (fenced, in hold(), to anyone the peel-off
    // isn't for)
    const f = {};
    for (const path of under) {
      path.gapL = new Array(path.N).fill(null);
      path.gapR = new Array(path.N).fill(null);
      for (let i = 0; i < path.N; i++) for (const sd of [-1, 1]) {
        const x = path.px[i] + path.rightX(i) * HW * sd;
        const z = path.pz[i] + path.rightZ(i) * HW * sd;
        for (const peel of this.peels) {
          if (!peel.frame(x, z, -1, f, path.py[i]) || Math.abs(f.lat) > PEELW - 0.8 || f.f < 0.2) continue;
          (sd < 0 ? path.gapL : path.gapR)[i] = peel;
          (sd < 0 ? path.railL : path.railR)[i] = 0;
        }
      }
    }
    this.hole = this.addPlatform(hole);
    // The cracks: the two deep ones, down the board's centre lines, under the level of the tiles. Fixed roads, RED
    // only (the Blade's: narrow enough for nothing else), each one way: the north-south crack runs south and comes
    // up onto the frame on the S side, the east-west one runs east and comes up on the E side. The only way in is
    // from the empty slot, when it's beside a crack: each stretch starts where a peel-off ends.
    this.cracks = [];
    const mid = SIZE / 2;
    for (const [id, at, side] of [['cs', (u) => V(mid, -UNDER, SIZE - u), 2], ['ce', (u) => V(u, -UNDER, mid), 1]]) {
      const stops = [0, 1, 2, 3].map((n) => TILE / 2 + TURN + n * TILE);
      for (let n = 0; n < 3; n++) {
        const pts = [];
        for (let k = 0; k <= 8; k++) pts.push(at(stops[n] + ((stops[n + 1] - stops[n]) * k) / 8));
        const path = new Path(`${id}${n}`, pts, false, CRACK, { bankFactor: 0 });
        this.addRoad(path, null, { mask: M.RO });
        path.oneWay = true;
        path.groove = () => 0.12;
        this.cracks.push(path);
      }
      // the last stretch: out from under the board, round and up onto the frame
      const [ox, oz] = OUT[side];
      const [tx, tz] = RUN[side];
      const mx = mid + (ox * SIZE) / 2;
      const mz = mid + (oz * SIZE) / 2;
      const pts = [at(stops[3]), at((stops[3] + SIZE) / 2)];
      const RX = D - this.world.main.halfW + CRACK; // (so its inner edge ends flush with the frame's)
      for (let k = 0; k <= 9; k++) {
        const a = (1 - k / 9) * (Math.PI / 2);
        const rise = THREE.MathUtils.smoothstep(k / 9, 0.05, 0.7);
        pts.push(V(mx + tx * RX * (1 - Math.sin(a)) + ox * RX * Math.cos(a), -UNDER + (FY + UNDER) * rise, mz + tz * RX * (1 - Math.sin(a)) + oz * RX * Math.cos(a)));
      }
      for (const d of [5, 10]) pts.push(V(mx + ox * RX + tx * (RX + d), FY, mz + oz * RX + tz * (RX + d)));
      const up = new Path(`${id}3`, pts, false, CRACK, { bankFactor: 0 });
      this.addRoad(up, null, { mask: M.RO, main: [1] });
      // (the frame's rail stays shut there to anyone on the frame: the lane comes up through it)
      this.joinMain(up, 0);
      up.groove = () => 0.08;
      this.cracks.push(up);
    }
    // the slip roads: into each mouth off the frame, and back out onto it
    this.slips = [];
    for (let side = 0; side < 4; side++) for (let idx = 0; idx < 4; idx++) {
      const inn = new Path(`in${side}${idx}`, this.slipPoints(side, idx, true), false, HW, { bankFactor: 0 });
      this.addRoad(inn, null, { mask: M.ALL, main: [0] });
      this.joinMain(inn, 0);
      const gate = this.addGate(inn, { side, idx });
      const out = new Path(`out${side}${idx}`, this.slipPoints(side, idx, false), false, HW, { bankFactor: 0 });
      this.addRoad(out, null, { mask: M.ALL, main: [1] });
      this.joinMain(out, M.ALL);
      inn.pair = out;
      out.pair = inn;
      this.slips.push({ inn, out, gate });
    }
    this.sound = { warn: null, count: 0, solved: false };
  }

  // A slip road at a mouth: a quarter turn of radius R between the frame (running beside it, its inner edge flush
  // with the frame's) and the board's edge, dropping from the frame's height to the tiles'.
  slipPoints(side, idx, inward) {
    const [mx, mz] = mouthAt(side, idx);
    const [ox, oz] = OUT[side];
    const [tx, tz] = RUN[side];
    const main = this.world.main;
    const f = {};
    const pts = [];
    const push = (x, z, drop) => {
      const y = main.frame(x, z, -1, f, FY) && Math.abs(f.lat) < main.halfW + 2 ? f.y : FY;
      pts.push(V(x, y * (1 - drop), z));
    };
    // from the frame end: a short run beside the frame, the bend, and a nub over the board's edge
    const s = inward ? -1 : 1; // which side of the mouth the frame end is, along the run
    for (const d of [10, 5]) push(mx + ox * R + tx * s * (R + d), mz + oz * R + tz * s * (R + d), 0);
    for (let k = 0; k <= 9; k++) {
      const a = (k / 9) * (Math.PI / 2);
      const drop = THREE.MathUtils.smoothstep(k / 9, 0.08, 0.92);
      push(mx + tx * s * R * (1 - Math.sin(a)) + ox * R * Math.cos(a), mz + tz * s * R * (1 - Math.sin(a)) + oz * R * Math.cos(a), drop);
    }
    pts.push(V(mx - ox * 0.6, 0, mz - oz * 0.6));
    return inward ? pts : pts.reverse();
  }

  // Where a tile is: the puzzle says, from the clock.
  pose(pl, t, out) {
    if (!pl.k) {
      // the hole: where no tile is, swapping places with the tile on the move
      const B = this.puzzle.at(t);
      const from = B.moving ? B.moving.to : B.cells.indexOf(0);
      const to = B.moving ? B.moving.from : from;
      out.x = cellX(from) + (cellX(to) - cellX(from)) * B.f;
      out.y = 0;
      out.z = cellZ(from) + (cellZ(to) - cellZ(from)) * B.f;
      out.yaw = 0;
      out.moving = out.busy = !!B.moving;
      return;
    }
    this.puzzle.place(pl.k, t, (this._pl ||= {}));
    out.x = this._pl.x;
    out.y = 0;
    out.z = this._pl.z;
    out.yaw = 0;
    out.moving = this._pl.moving;
    out.busy = this._pl.busy;
  }

  leaves(pl) {
    return pl ? this.puzzle.nextMove(pl.k, this.time) : Infinity;
  }

  joins(P, end, mode) {
    const pl = P.platform;
    if (!pl || !P.kind || (mode !== RED && mode !== BLUE)) return true;
    return this.puzzle.joins(pl.k, P.colour, P.kind[end], this.time);
  }

  // The gates, and two things of our own: which peel-offs lead into a crack just now, and the Pair car's way in.
  // With both worlds open a mouth is open while the empty slot is behind it (the under-road is the red world's, and
  // solid to the car), and while a tile with its arrows showing is (the one that goes next, or the one after): the
  // car can't drive onto that tile, but it can drive up to it and shove (hold(), below).
  relink() {
    super.relink();
    for (const peel of this.peels || []) peel.live = peel.sockets[1].links.length > 0;
    if (!this.puzzle) return;
    const B = this.puzzle.at(this.time);
    const main = this.world.main;
    for (const g of this.gates) {
      const k = B.cells[mouthCell(g.side, g.idx)];
      if (B.moving || !k || (B.next?.k !== k && B.after?.k !== k)) continue;
      g.open |= BOTH;
      const J = g.path.mainSide > 0 ? main.jR : main.jL;
      for (const i of g.path.mainSpan) J[i] = g.open;
    }
  }

  hold(r, race) {
    const g = r.gnd;
    const P = g.path;
    if (g.onRoad && P?.sockets) {
      if (r.mode === BOTH && !race.online && !r.puppet) this.ram(r, race, P);
      const side = g.lat < 0 ? -1 : 1;
      // a crack is a groove: it draws the wheel to its middle
      if (P.groove) {
        const k = P.groove(g.f);
        r.pos.x -= g.rx * g.lat * k;
        r.pos.z -= g.rz * g.lat * k;
        const vl = r.vel.x * g.rx + r.vel.z * g.rz;
        r.vel.x -= g.rx * vl * k;
        r.vel.z -= g.rz * vl * k;
      }
      // the gap in the under-road's rail is the Blade's, and only while its peel-off leads somewhere
      const peel = (side < 0 ? P.gapL : P.gapR)?.[g.i];
      if (peel && !(r.mode === RED && peel.live)) {
        const over = Math.abs(g.lat) - (P.halfW - 1.3);
        if (over > 0) {
          r.pos.x -= g.rx * side * over;
          r.pos.z -= g.rz * side * over;
          const vl = (r.vel.x * g.rx + r.vel.z * g.rz) * side;
          if (vl > 0) {
            r.vel.x -= g.rx * side * vl * 1.1;
            r.vel.z -= g.rz * side * vl * 1.1;
            if (vl > 6) race.onWallHit?.(r, vl);
          }
        }
      }
    }
    super.hold(r, race);
  }

  // Steering for an open mouth, or for a peel-off that leads into a crack: the assist lets you.
  assistOff(r, tr, steer) {
    if (Math.abs(steer) < 0.3) return false;
    const P = tr.path;
    const side = steer < 0 ? -1 : 1;
    if (P === this.world.main) {
      for (const g of this.gates) {
        if (!(g.open & r.mode) || g.path.mainSide !== side) continue;
        let d = tr.i - g.path.mainSpan[0];
        if (d < -P.N / 2) d += P.N;
        if (d > -12 && d < g.path.mainSpan.length) return true;
      }
      return false;
    }
    const gaps = side < 0 ? P.gapL : P.gapR;
    if (!gaps || r.mode !== RED) return false;
    for (let i = Math.max(0, tr.i - 8); i <= Math.min(P.N - 1, tr.i + 8); i++) if (gaps[i]?.live) return true;
    return false;
  }

  // The Pair car's shove: run it into the bumper in front of a tile with its arrows showing and the next slide goes
  // now (that tile's, if its arrows are the bright ones; the one before it, if they're faint: shove again). The
  // clock jumps to the slide, for everyone. (Not online: every browser keeps its own
  // clock, and they have to agree.)
  ram(r, race, P) {
    const s = r.gnd.f * P.length;
    for (const S of P.sockets) {
      const d = S.end ? P.length - s : s;
      if (S.main || d > CAP + 1 || this.open(S, BOTH)) continue;
      if (r.vel.x * S.dx + r.vel.z * S.dz < 9) continue;
      const B = this.puzzle.at(this.time);
      if (B.moving || !B.next) continue;
      const c = Math.floor((S.x + (S.dx * TILE) / 2) / TILE);
      const w = Math.floor((S.z + (S.dz * TILE) / 2) / TILE);
      const k = c < 0 || c > 3 || w < 0 || w > 3 ? 0 : B.cells[c + 4 * w];
      if (!k || (B.next.k !== k && B.after?.k !== k)) continue;
      const wait = this.puzzle.nextMove(0, this.time);
      if (!(wait > 0.05) || !isFinite(wait)) continue;
      this.time += wait;
      this.shoves = (this.shoves || 0) + 1;
      r.energy = Math.min(1, r.energy + 0.15);
      race.app?.audio?.play('smash');
      if (r.isPlayer) race.emitP?.(r, 'popup', { text: 'SHOVE · +SHIFT', color: '#d8c8ff', small: true });
      return;
    }
  }

  step(dt, race) {
    super.step(dt, race);
    // the tells you can hear: a rattle before a tile goes, a clack as it lands, a chime when the picture is whole
    const B = this.puzzle.at(this.time);
    const S = this.sound;
    const A = race.app?.audio;
    if (B.warn && S.warn !== B.warn) A?.play('rattle');
    S.warn = B.warn;
    if (!B.moving && B.count > S.count) {
      A?.play('clack');
      if (B.whole && !S.solved) {
        S.solved = true;
        A?.play('perfect');
        for (const p of race.players || []) race.emitP?.(p, 'popup', { text: 'PUZZLE SOLVED', color: '#ffd23a' });
      }
    }
    if (!B.moving) S.count = B.count;
  }

  // A rival coming up on a mouth: drive in if the road gets it out further round, sooner than the frame would.
  plan(ai, G, d) {
    const r = ai.r;
    if (r.session?.state !== 'race') return 0;
    const t0 = this.time + d / Math.max(30, r.speed) + 1.4;
    let best = 0;
    let lens = 0;
    // (the mouth has to still be open when we reach it: not if its tile is about to go)
    // (arrival is a guess, so it has to hold for a while either side)
    const cell = mouthCell(G.side, G.idx);
    const k = this.puzzle.at(t0).cells[cell];
    for (let t = t0 - 1.6; t <= t0 + 1; t += 0.4) {
      const B = this.puzzle.at(t);
      // (no tile there means the hole and its red road, unless something is mid-slide)
      if (B.cells[cell] !== k || (k ? B.warn?.k === k : B.moving)) return 0;
    }
    for (const colour of [0, 1]) {
      const W = worth(this.puzzle, G.side, G.idx, colour, t0, 46 + ai.skill * 8);
      if (W && W.gain > best) {
        best = W.gain;
        lens = colour ? BLUE : RED;
      }
    }
    if (best < 1.2 || Math.random() > 0.4 + ai.skill * 0.55) return 0;
    return lens;
  }

  // ------------------------------------------------------------------ the look
  build() {
    const w = this.world;
    const L = w.layers;
    const main = w.main;
    const hw = main.halfW;
    const yellow = TOY_YELLOW;
    this.buildHole();
    // the slip roads, printed once in each colour
    for (const { inn, out } of this.slips) for (const p of [inn, out]) {
      this.drawRoad(L, p, M.RO, COLORS.red);
      this.drawRoad(L, p, M.BO, COLORS.blue);
    }
    // the tray: its floor under the tiles, the cells marked on it, and a rim round the board between the mouths
    const ty = -1.6;
    L.fillQuad(M.ALL, V(-1, ty, -1), V(SIZE + 1, ty, -1), V(SIZE + 1, ty, SIZE + 1), V(-1, ty, SIZE + 1));
    for (let k = 0; k <= 4; k++) {
      L.lineXYZ(M.ALL, k * TILE, ty + 0.05, 0, k * TILE, ty + 0.05, SIZE, 0x6a5310);
      L.lineXYZ(M.ALL, 0, ty + 0.05, k * TILE, SIZE, ty + 0.05, k * TILE, 0x6a5310);
    }
    for (let side = 0; side < 4; side++) {
      const [ox, oz] = OUT[side];
      const [tx, tz] = RUN[side];
      const cx = SIZE / 2 + (ox * SIZE) / 2;
      const cz = SIZE / 2 + (oz * SIZE) / 2;
      // (the rim runs between the mouths: each mouth is a road's width plus its rails)
      const cuts = [-200, -150 - HW - 1.5, -150 + HW + 1.5, -50 - HW - 1.5, -50 + HW + 1.5, 50 - HW - 1.5, 50 + HW + 1.5, 150 - HW - 1.5, 150 + HW + 1.5, 200];
      // (and a door in the middle of the S and E sides, where a crack lane comes out under the rim)
      if (side === 1 || side === 2) cuts.splice(5, 0, -CRACK - 1, CRACK + 1);
      for (let k = 0; k < cuts.length; k += 2) {
        const a = V(cx + tx * cuts[k] + ox * 1.2, 0, cz + tz * cuts[k] + oz * 1.2);
        const b = V(cx + tx * cuts[k + 1] + ox * 1.2, 0, cz + tz * cuts[k + 1] + oz * 1.2);
        for (const h of [1.4, 0.2]) L.line(M.ALL, a.clone().setY(h), b.clone().setY(h), yellow);
        L.quad(M.ALL, a.clone().setY(1.4), b.clone().setY(1.4), b.clone().setY(1.0), a.clone().setY(1.0), yellow, 0.5);
        L.line(M.ALL, a.clone().setY(1.4), a.clone().setY(ty), yellow);
        L.line(M.ALL, b.clone().setY(1.4), b.clone().setY(ty), yellow);
        L.fillQuad(M.ALL, a.clone().setY(1.4), b.clone().setY(1.4), b.clone().setY(ty), a.clone().setY(ty));
      }
    }
    // the frame's body: the puzzle is a box standing on the quilt, the road its top
    const fy = w.floorY;
    for (let i = 0; i < main.N; i += 3) {
      const j = main.wrap(i + 3);
      for (const [lat, base] of [[hw + 0.6, fy], [-(hw + 0.6), ty]]) {
        const a = main.point(i, lat, -0.6);
        const b = main.point(j, lat, -0.6);
        L.fillQuad(M.ALL, a, b, b.clone().setY(base), a.clone().setY(base));
        L.line(M.ALL, a.clone().setY(base), b.clone().setY(base), yellow);
        if (i % 12 === 0) L.line(M.ALL, a, a.clone().setY(base), 0x8a6c14);
      }
    }
    // a rail across each mouth that's there only while the mouth is shut: in each lens's colour through a lens,
    // violet with both worlds open (the red one stops short of where a crack lane comes up through it)
    for (const { inn, gate } of this.slips) {
      gate.bars = {};
      for (const [lens, mask, col] of [[RED, M.RO, COLORS.red], [BLUE, M.BO, COLORS.blue], [BOTH, M.X, VIOLET]]) {
        const holder = { group: new THREE.Group() };
        this.railAlong(this.layersFor(holder), lens === RED ? inn.mainSpan.filter((i) => !this.crossed.has(i)) : inn.mainSpan, mask, col);
        this.group.add(holder.group);
        gate.bars[lens] = holder.group;
      }
    }
    for (let k = 1; k <= 15; k++) this.buildTile(this.tiles[k]);
    w.animated.push((t) => this.animate(t));
  }

  // A stretch of the frame's inner rail, as track.js draws it.
  railAlong(L, span, mask, col) {
    const main = this.world.main;
    const hw = main.halfW;
    const P = (i, lat, h) => main.point(i, -lat, h, new THREE.Vector3());
    for (let k = 0; k < span.length - 1; k++) {
      const i = span[k];
      const j = span[k + 1];
      if (j !== main.wrap(i + 1)) continue;
      let p0 = P(i, hw - 0.5, 0.045);
      let p1 = P(j, hw - 0.5, 0.045);
      for (let s = 1; s <= 3; s++) {
        const a = (s / 3) * Math.PI * 0.5;
        const lat = hw - 0.5 + (1 - Math.cos(a)) * 0.7;
        const h = 0.045 + Math.sin(a) * 0.75;
        const q0 = P(i, lat, h);
        const q1 = P(j, lat, h);
        L.quad(mask, p0, p1, q1, q0, col, 0.16 + s * 0.1);
        p0 = q0;
        p1 = q1;
      }
      L.quad(mask, P(i, hw + 0.2, 1.1), P(j, hw + 0.2, 1.1), P(j, hw + 0.2, 0.75), P(i, hw + 0.2, 0.75), col, 0.8);
      if (i % 4 === 0) L.line(mask, P(i, hw + 0.2, 0), P(i, hw + 0.2, 1.1), col);
    }
  }

  // What's in the empty slot, the cracks, and what the Pair car sees.
  buildHole() {
    const w = this.world;
    const W = w.layers;
    const main = w.main;
    const pl = this.hole;
    const L = this.layersFor(pl);
    const red = COLORS.red;
    // a road's points in its platform's own space (the hole never turns)
    const at = (path) => (i, lat, h) => {
      const v = path.point(i, lat, h, new THREE.Vector3());
      return path.platform ? v.sub(path.platform.pos) : v;
    };
    // a narrow lane down the middle of a road: glass, two bright edges, chevrons the way it runs
    const lane = (LL, path, mask, col, half) => {
      const P = at(path);
      for (let i = 0; i < path.N - 1; i++) {
        const j = i + 1;
        LL.roadQuad(mask, P(i, -half, -0.02), P(j, -half, -0.02), P(j, half, -0.02), P(i, half, -0.02));
        for (const sd of [-1, 1]) LL.quad(mask, P(i, sd * half, 0.04), P(j, sd * half, 0.04), P(j, sd * (half - 0.3), 0.04), P(i, sd * (half - 0.3), 0.04), col);
        LL.quad(mask, P(i, -half, 0.03), P(j, -half, 0.03), P(j, half, 0.03), P(i, half, 0.03), col, 0.22);
        if (i % 3 === 0) for (const sd of [-1, 1]) LL.line(mask, P(i, sd * half * 0.7, 0.05), P(j, 0, 0.05), col);
      }
    };
    // a piece of rail along one edge of a road
    const rail = (LL, path, i, sd, mask, col) => {
      const P = at(path);
      const hw = path.halfW;
      const j = i + 1;
      LL.quad(mask, P(i, sd * (hw + 0.2), 1.1), P(j, sd * (hw + 0.2), 1.1), P(j, sd * (hw + 0.2), 0.75), P(i, sd * (hw + 0.2), 0.75), col, 0.8);
      LL.quad(mask, P(i, sd * (hw - 0.5), 0.045), P(j, sd * (hw - 0.5), 0.045), P(j, sd * (hw + 0.2), 0.75), P(i, sd * (hw + 0.2), 0.75), col, 0.3);
      if (i % 2 === 0) LL.line(mask, P(i, sd * (hw + 0.2), 0), P(i, sd * (hw + 0.2), 1.1), col);
    };
    // the under-road: the red world's, so it's there in RED and with both open
    const [ns, ew] = pl.paths;
    for (const p of [ns, ew]) this.drawRoad(L, p, M.R, red);
    const y = -UNDER - 0.05;
    const h = HW + 1.5;
    L.quad(M.R, V(-h, y, -h), V(h, y, -h), V(h, y, h), V(-h, y, h), red, 0.22);
    // the peel-offs: each drawn (as narrow as the crack it leads to) only while it leads into one; otherwise the
    // gap it leaves by has a rail across it. With both worlds open the gap is always railed.
    for (const peel of this.peels) {
      const lit = { group: new THREE.Group() };
      lane(this.layersFor(lit), peel, M.RO, red, 1.2);
      const bar = { group: new THREE.Group() };
      const BL = this.layersFor(bar);
      for (const p of [ns, ew]) for (let i = 0; i < p.N - 1; i++) for (const sd of [-1, 1]) {
        if ((sd < 0 ? p.gapL : p.gapR)[i] !== peel) continue;
        rail(BL, p, i, sd, M.RO, red);
        rail(L, p, i, sd, M.X, red);
      }
      pl.group.add(lit.group, bar.group);
      peel.lane = lit.group;
      peel.bar = bar.group;
    }
    // the Skimmer's cushion of air, east to west: no road to see, only the air itself. Bars of blue light hanging
    // over the gap, and the jets under them.
    const air = { group: new THREE.Group() };
    const AL = this.layersFor(air);
    const A = at(this.air);
    const blue = COLORS.blue;
    for (let i = 1; i < this.air.N - 1; i++) {
      const j = i + 1;
      for (const sd of [-1, 1]) AL.quad(M.BO, A(i, sd * HW, 0.02), A(j, sd * HW, 0.02), A(j, sd * (HW - 0.35), 0.02), A(i, sd * (HW - 0.35), 0.02), blue, i % 2 ? 0.75 : 0.2);
      if (i % 2) continue;
      AL.quad(M.BO, A(i, -HW + 1, 0), A(i, HW - 1, 0), A(i, HW - 1, -0.02).add(V(0.7, 0, 0)), A(i, -HW + 1, -0.02).add(V(0.7, 0, 0)), blue, 0.4);
      AL.quadFade(M.BO, A(i, -HW + 1, 0), A(i, HW - 1, 0), A(i, HW - 2.5, -1.6), A(i, -HW + 2.5, -1.6), blue, 0.16, 0);
      for (const lat of [-5, 0, 5]) AL.line(M.BO, A(i, lat, 0), V(A(i, lat, 0).x, -UNDER, A(i, lat, 0).z), blue);
    }
    pl.group.add(air.group);
    this.puffs = air.group;
    // the cracks: fixed, in the world's own layers, each stretch a narrow red lane; the last one has its rails
    for (const c of this.cracks) {
      lane(W, c, M.RO, red, c.mainSpan ? 1.4 : 0.9); // (between the tiles there's a metre either side to see it by)
      if (!c.mainSpan) continue;
      for (let i = 0; i < c.N - 1; i++) for (const sd of [-1, 1]) if ((sd < 0 ? c.railL : c.railR)[i]) rail(W, c, i, sd, M.RO, red);
    }
    // where a crack lane comes up through the frame's rail: the rail is whole to the blue world and to both, and
    // to the red world too but for the stretch the lane crosses (the mouths' own rails cover the rest)
    const taken = new Set();
    for (const { inn, out } of this.slips) for (const i of [...inn.mainSpan, ...out.mainSpan]) taken.add(i);
    this.crossed = new Set();
    const f = {};
    for (const c of this.cracks) {
      if (!c.mainSpan) continue;
      for (const i of c.mainSpan) {
        const e = main.point(i, c.mainSide * main.halfW, 0);
        if (c.frame(e.x, e.z, -1, f, e.y) && Math.abs(f.lat) < CRACK + 0.8) this.crossed.add(i);
      }
      const free = c.mainSpan.filter((i) => !taken.has(i));
      this.railAlong(W, free, M.B, COLORS.blue);
      this.railAlong(W, free.filter((i) => !this.crossed.has(i)), M.RO, red);
    }
    // the slip roads again for the Pair car, in the overlap's violet
    for (const { inn, out } of this.slips) for (const p of [inn, out]) this.drawRoad(W, p, M.X, VIOLET);
  }

  buildTile(pl) {
    const L = this.layersFor(pl);
    const h = TILE / 2 - 1;
    const y0 = -0.14;
    // the slab: black gloss, a yellow bevel, its sides down into the tray
    L.fillQuad(M.ALL, V(-h, y0, -h), V(h, y0, -h), V(h, y0, h), V(-h, y0, h));
    const ring = (r, y, col) => {
      const c = [V(-r, y, -r), V(r, y, -r), V(r, y, r), V(-r, y, r)];
      for (let i = 0; i < 4; i++) L.line(M.ALL, c[i], c[(i + 1) % 4], col);
      return c;
    };
    const top = ring(h, y0 + 0.04, TOY_YELLOW);
    const inner = ring(h - 2.2, y0 + 0.04, 0x8a6c14);
    const foot = ring(h, -1.5, 0x8a6c14);
    for (let i = 0; i < 4; i++) {
      L.line(M.ALL, top[i], foot[i], TOY_YELLOW);
      L.quad(M.ALL, top[i], top[(i + 1) % 4], inner[(i + 1) % 4], inner[i], TOY_YELLOW, 0.14);
      L.fillQuad(M.ALL, top[i], top[(i + 1) % 4], foot[(i + 1) % 4], foot[i]);
    }
    // its number, top left as the picture reads (looking toward -z: +x is right, -z is up)
    const digits = String(pl.k);
    const s = 5;
    digits.split('').forEach((ch, n) => {
      const x0 = -h + 7 + n * s * 1.6;
      const z0 = -h + 7;
      for (const seg of DIGIT[+ch]) {
        const [ax, ay, bx, by] = SEG[seg];
        const a = V(x0 + ax * s, y0 + 0.06, z0 + (2 - ay) * s);
        const b = V(x0 + bx * s, y0 + 0.06, z0 + (2 - by) * s);
        L.line(M.ALL, a, b, TOY_YELLOW);
        // (a fat stroke, so it reads from the frame)
        const nx = (b.z - a.z) / s;
        const nz = -(b.x - a.x) / s;
        L.quad(M.ALL, a.clone().add(V(nx * 0.3, 0, nz * 0.3)), b.clone().add(V(nx * 0.3, 0, nz * 0.3)), b.clone().add(V(-nx * 0.3, 0, -nz * 0.3)), a.clone().add(V(-nx * 0.3, 0, -nz * 0.3)), TOY_YELLOW, 0.8);
      }
    });
    // its two roads
    this.drawRoad(L, pl.paths[0], M.RO, COLORS.red);
    this.drawRoad(L, pl.paths[1], M.BO, COLORS.blue);
    // its piece of the picture: the studio's mark, cut in sixteen (the sixteenth is the hole)
    const home = homeCell(pl.k);
    const g = new THREE.PlaneGeometry(2 * h, 2 * h);
    g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute('uv');
    const pos = g.getAttribute('position');
    for (let i = 0; i < uv.count; i++) {
      // across the picture: u with +x, v up toward -z; the art is wider than tall, so it's letterboxed
      const u = ((home % 4) + (pos.getX(i) + h) / (2 * h)) / 4;
      const v = 1 - ((home >> 2) + (pos.getZ(i) + h) / (2 * h)) / 4;
      uv.setXY(i, u, 0.5 + (v - 0.5) / 0.795);
    }
    const pic = new THREE.Mesh(g, this.pictureMat());
    pic.position.y = y0 + 0.05;
    pic.renderOrder = 2;
    pl.group.add(pic);
    // the arrows that light before it slides: one set for each way it can go
    pl.arrows = [0, 1, 2, 3].map((dir) => {
      const posn = [];
      const fx = DX[dir];
      const fz = DZ[dir];
      for (let k = -1; k <= 1; k++) {
        const cx = fx * k * 14;
        const cz = fz * k * 14;
        // a chevron: two fat strokes meeting at a point
        for (const sd of [-1, 1]) {
          const ax = cx - fx * 6 + -fz * sd * 13;
          const az = cz - fz * 6 + fx * sd * 13;
          const bx = cx + fx * 6;
          const bz = cz + fz * 6;
          posn.push(ax, 0, az, bx, 0, bz, bx - fx * 5, 0, bz - fz * 5, ax, 0, az, bx - fx * 5, 0, bz - fz * 5, ax - fx * 5, 0, az - fz * 5);
        }
      }
      const ag = new THREE.BufferGeometry();
      ag.setAttribute('position', new THREE.Float32BufferAttribute(posn, 3));
      const m = new THREE.Mesh(ag, this.arrowMat());
      m.position.y = 1.6;
      m.visible = false;
      m.renderOrder = 4;
      pl.group.add(m);
      return m;
    });
  }

  pictureMat() {
    if (!this._pic) {
      const tex = new THREE.TextureLoader().load('assets/splash/ff-lines.webp');
      tex.colorSpace = THREE.SRGBColorSpace;
      this._pic = new THREE.MeshBasicMaterial({ map: tex, color: TOY_YELLOW, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    }
    return this._pic;
  }
  arrowMat() {
    this._arrowDim ||= new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    return (this._arrow ||= new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  }

  // Every frame: the tells you can see. The tile about to slide rattles and its arrow flashes; a mouth's rail is
  // up while it's shut; the picture glows once it's whole.
  animate(t) {
    const B = this.puzzle.at(this.time);
    const tint = this.world.layers.level.get('tint');
    // yellow with both worlds open, the lens's colour through a lens
    const col = (this._col ||= new THREE.Color());
    if (tint) {
      const both = Math.min(1, Math.max(0, (Math.min(tint.r, tint.g, tint.b) - 0.35) / 0.6));
      col.copy(tint).lerp(YELLOW, both);
    } else col.copy(YELLOW);
    const solved = B.done >= this.puzzle.steps.length && !B.moving;
    this._pic.color.copy(col);
    this._pic.opacity = solved ? 0.75 + 0.15 * Math.sin(t * 2) : 0.42;
    this._arrow.color.copy(col);
    // the arrows: lit steady on the tile that goes next, flashing once it rattles, and faint on the one after
    // that, so there's time to get onto a tile before it leaves
    const step = B.moving || B.next;
    const then = B.moving ? B.next : B.after;
    const way = (st) => [0, 1, 2, 3].find((d) => st.to - st.from === DX[d] + 4 * DZ[d]);
    this._arrowDim.color.copy(col);
    for (let k = 1; k <= 15; k++) {
      const pl = this.tiles[k];
      const mine = step && step.k === k;
      const later = !mine && then && then.k === k;
      const dir = mine ? way(step) : later ? way(then) : -1;
      const lit = !mine || B.moving || !B.warn || Math.floor(t * 7) % 2 === 0;
      pl.arrows.forEach((m, d) => {
        m.visible = d === dir && lit;
        m.material = later ? this._arrowDim : this._arrow;
      });
      pl.group.position.copy(pl.pos);
      if (mine && B.warn) {
        // the rattle (the look only: the road under a craft stays put)
        pl.group.position.x += Math.sin(t * 61) * 0.22;
        pl.group.position.z += Math.sin(t * 47 + 1) * 0.22;
        pl.group.position.y += Math.abs(Math.sin(t * 38)) * 0.18;
      }
    }
    for (const g of this.gates) {
      g.bars[RED].visible = !(g.open & RED);
      g.bars[BLUE].visible = !(g.open & BLUE);
      g.bars[BOTH].visible = !(g.open & BOTH);
    }
    for (const peel of this.peels) {
      peel.lane.visible = peel.live;
      peel.bar.visible = !peel.live;
    }
    this.puffs.position.y = Math.sin(t * 3.1) * 0.12;
  }
}

// The road across a tile between two of its sides, in the tile's own space: straight between opposite sides, a
// quarter circle round the corner between neighbours. It runs a little past the tile's edge at each end, so two
// roads that meet overlap.
// (dip: a straight road that drops under the board in the middle, for the empty slot)
const UNDER = 1.3;
const HUMP = 2.4; // how high the Skimmer's air cushion carries it over the middle of the empty slot
const CRACK = 2; // half the width of a crack lane
const PEELW = 8; // and of a peel-off, where it leaves the under-road
const TURN = 44; // the radius a peel-off turns on, from the under-road to the crack
const VIOLET = 0xb070ff; // what's there only with both worlds open
function tileRoad([a, b], dip = 0) {
  const h = TILE / 2;
  const pts = [];
  const nub = 0.6;
  if ((a + 2) % 4 === b) {
    const n = dip ? 20 : 8;
    for (let k = 0; k <= n; k++) {
      const s = -h - nub + ((2 * h + 2 * nub) * k) / n;
      const u = Math.min(1, Math.max(0, (h - Math.abs(s)) / 26));
      pts.push(V(-DX[a] * s, -dip * u * u * (3 - 2 * u), -DZ[a] * s));
    }
    return pts;
  }
  // the corner the two sides share
  const cx = (DX[a] + DX[b]) * h;
  const cz = (DZ[a] + DZ[b]) * h;
  pts.push(V(DX[a] * (h + nub), 0, DZ[a] * (h + nub)));
  const n = 9;
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * (Math.PI / 2);
    // from side a's middle (the corner less b's half) round to side b's
    pts.push(V(cx - DX[b] * h * Math.cos(t) - DX[a] * h * Math.sin(t), 0, cz - DZ[b] * h * Math.cos(t) - DZ[a] * h * Math.sin(t)));
  }
  pts.push(V(DX[b] * (h + nub), 0, DZ[b] * (h + nub)));
  return pts;
}
