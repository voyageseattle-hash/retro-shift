// 20 SLIDE FIFTEEN (TOYBOX CUP): a giant sliding-tile puzzle on the bed. The lap is the puzzle's raised frame, a
// road that's always there. Inside it, fifteen tiles slide one at a time into the empty slot, each carrying a red road
// and a blue road printed at different angles, and anyone standing on a tile goes with it. Sixteen mouths in the
// frame lead onto the board: a mouth's rail drops, for your lens, while the tile behind it has a road of your colour
// facing it. Where the roads line up there's a way across that skips a side of the frame; where they don't yet, a
// bumper holds you on your tile until a slide brings the next road round. The slides run on the race clock in a
// fixed order (slidepuzzle.js) and solve the puzzle as the race goes on: the last one lands as the leaders start
// lap 3, the picture is whole, and a red road runs straight down the board and a blue one straight across it.
//
// The moving-platform machinery (roads that move, carrying, sockets, caps, gates, the rivals' driving) is
// platforms.js; this file is the board, the frame, the slip roads and the look.

import * as THREE from '../../vendor/three.js';
import { Path } from './track.js';
import { Platforms, Platform } from './platforms.js';
import { Puzzle, worth, KINDS, TILE, SIZE, FRAME, DX, DZ, cellX, cellZ, homeCell, mouthCell } from './slidepuzzle.js';
import { M, RED, BLUE, COLORS } from './shift.js';
import { toyboxEnv, TOY_YELLOW } from './toybox.js';

const { D, RC, R, HW, Y: FY } = FRAME;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const LENS_ROAD = RED | BLUE; // a slip road: there in either lens, never in BOTH
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
    // the empty slot: a red road under the board, crossing it both ways, there in RED only. It's wherever the hole
    // is, so it moves (the other way) every time a tile does, and carries whoever is down there with it.
    const at0 = start.indexOf(0);
    const hole = new Platform('hole', cellX(at0), 0, cellZ(at0));
    hole.k = 0;
    const under = ['NS', 'EW'].map((name) => {
      const path = new Path(`h${name.toLowerCase()}`, tileRoad(KINDS[name], UNDER), false, HW, { bankFactor: 0 });
      this.addRoad(path, hole, { mask: M.RO });
      Object.assign(path, { kind: KINDS[name], colour: 0 });
      // (where the two cross there are no rails: it's a junction)
      for (let i = 0; i < path.N; i++) if (Math.abs(i * path.ds - path.length / 2) < HW + 1.5) path.railL[i] = path.railR[i] = 0;
      return path;
    });
    under[0].cross = under[1];
    under[1].cross = under[0];
    this.hole = this.addPlatform(hole);
    // the slip roads: into each mouth off the frame, and back out onto it
    this.slips = [];
    for (let side = 0; side < 4; side++) for (let idx = 0; idx < 4; idx++) {
      const inn = new Path(`in${side}${idx}`, this.slipPoints(side, idx, true), false, HW, { bankFactor: 0 });
      this.addRoad(inn, null, { mask: LENS_ROAD, main: [0] });
      this.joinMain(inn, 0);
      const gate = this.addGate(inn, { side, idx });
      const out = new Path(`out${side}${idx}`, this.slipPoints(side, idx, false), false, HW, { bankFactor: 0 });
      this.addRoad(out, null, { mask: LENS_ROAD, main: [1] });
      this.joinMain(out, LENS_ROAD);
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
    if (!pl || (mode !== RED && mode !== BLUE)) return true;
    return this.puzzle.joins(pl.k, P.colour, P.kind[end], this.time);
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
    for (const colour of k ? [0, 1] : [0]) {
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
    // with both worlds open every mouth is shut: the rail runs unbroken (drawn here, for the overlap only)
    for (const { inn, out, gate } of this.slips) {
      for (const p of [inn, out]) this.railAlong(L, p.mainSpan, M.X, COLORS.red);
      // and through a lens, a rail in that lens's colour that's there only while the mouth is shut to it
      gate.bars = {};
      for (const [lens, mask, col] of [[RED, M.RO, COLORS.red], [BLUE, M.BO, COLORS.blue]]) {
        const holder = { group: new THREE.Group() };
        this.railAlong(this.layersFor(holder), inn.mainSpan, mask, col);
        this.group.add(holder.group);
        gate.bars[lens] = holder.group;
      }
    }
    for (let k = 1; k <= 15; k++) this.buildTile(this.tiles[k]);
    this.buildHole();
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

  // The empty slot's road: red only, dipping under the level of the tiles, with a red floor light under the junction.
  buildHole() {
    const pl = this.hole;
    const L = this.layersFor(pl);
    for (const p of pl.paths) this.drawRoad(L, p, M.RO, COLORS.red);
    const y = -UNDER - 0.05;
    const h = HW + 1.5;
    L.quad(M.RO, V(-h, y, -h), V(h, y, -h), V(h, y, h), V(-h, y, h), COLORS.red, 0.22);
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
    }
  }
}

// The road across a tile between two of its sides, in the tile's own space: straight between opposite sides, a
// quarter circle round the corner between neighbours. It runs a little past the tile's edge at each end, so two
// roads that meet overlap.
// (dip: a straight road that drops under the board in the middle, for the empty slot)
const UNDER = 1.3;
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
