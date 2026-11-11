// Moving platforms: rigid pieces of road that slide (and turn about the vertical) on the race clock and carry whoever
// is standing on them. Built for SLIDE FIFTEEN's sliding tiles (slidefifteen.js) and written to be reused: a course
// makes a rig (a subclass of Platforms), hangs its platforms and their roads on it, and says where each platform is
// at any moment of the race. Everything else is here:
//
//   roads      each platform carries ordinary Paths (track.js), laid out in the platform's own space. When the
//              platform moves, its paths' samples are rewritten in world space, so the ground query, the rails, the
//              camera and the map all see a normal strip of road that happens to have moved.
//   carrying   a craft whose ground is one of a platform's roads moves (and turns) with it.
//   sockets    both ends of every road. Two sockets that meet nose to nose while their platforms are at rest are
//              linked, and a craft drives from one road onto the other. An end with nothing linked to it in your
//              lens is capped with a bumper, so a road that doesn't line up yet holds you instead of dropping you.
//   gates      a fixed road that leaves the main loop (a slip road into a mouth) opens the loop's rail only while
//              its far end is linked, and only for the lenses that road is in.
//   pilot      rivals drive platform roads end to end, wait at a cap, and leave by whatever road joins the loop.
//
// The hooks into the engine are small: TrackWorld makes the rig (def.rig), asks it for the strips to stand on
// (rig.surfaces) and lets it build; Race calls rig.step() once per physics step and rig.hold() after each craft
// moves; RaceAI hands the wheel to rig.pilot() while a rival is on (or heading for) a platform road.
//
// A rig keeps the race deterministic by placing platforms from the race clock alone (pose()), never from who is on
// them: every browser in an online race, and every ghost, sees the same board at the same time.

import * as THREE from '../../vendor/three.js';
import { clamp, wrapAngle } from '../core/util.js';
import { solidIn, COLORS, colorForMask, RED, BLUE } from './shift.js';

const LENSES = [RED, BLUE];
import { Layers } from './layers.js';

// how far short of a capped end a craft is held (its nose stops just inside the edge)
export const CAP = 3;
// sockets this close, facing each other, are joined
const JOIN = 2.2;
// a main-loop rail mask that no lens opens (0 would read as "no fork here: a planned drop")
const SHUT = 8;

const _f = {};
const _f2 = {};
const _p = new THREE.Vector3();

export class Platform {
  constructor(id, x = 0, y = 0, z = 0, yaw = 0) {
    this.id = id;
    this.group = new THREE.Group();
    this.paths = [];
    this.pos = new THREE.Vector3(x, y, z);
    this.yaw = yaw;
    // moving: its roads are joined to nothing. busy: about to move (or moving): gates into it are shut.
    this.moving = false;
    this.busy = false;
  }
}

export class Platforms {
  constructor(world) {
    this.world = world;
    this.platforms = [];
    this.extra = []; // every road that isn't one of the course's own paths: platform roads and fixed slip roads
    this.gates = [];
    this.time = 0;
    this.group = new THREE.Group();
    this._want = { x: 0, y: 0, z: 0, yaw: 0, moving: false, busy: false };
  }

  // The strips a craft can stand on: the course's own, then ours.
  get surfaces() {
    return (this._surfaces ||= [...this.world.paths, ...this.extra]);
  }

  // ------------------------------------------------------------------ building
  // Subclasses make their own Path (track.js imports nothing from here, and they hold the class), then hand it over.
  // A road with a platform is given in the platform's space; one without is a fixed road in world space.
  //   mask: the lenses it's solid in. main: [end, ...] ends (0 start, 1 end) that join the main loop, always open.
  addRoad(path, platform, { mask = 7, main = [] } = {}) {
    path.mask.fill(mask);
    path.extra = true;
    path.twoWay = true; // no wrong way on it (race.js): the same strip is driven either way
    path.platform = platform || null;
    path.oneWay = main.length > 0; // a slip road: the CPU only takes it start to end
    path.kmax = 0;
    for (let i = 2; i < path.N - 2; i++) path.kmax = Math.max(path.kmax, Math.abs(path.curv[i]));
    path.base = {};
    for (const k of ['px', 'py', 'pz', 'thx', 'thz', 'tx', 'tz', 'nx', 'nz']) path.base[k] = Float32Array.from(path[k]);
    path.box = [0, 0, 0, 0];
    path.sockets = [0, 1].map((end) => ({ path, end, x: 0, y: 0, z: 0, dx: 0, dz: 0, links: [], main: main.includes(end) }));
    // (no stretch of the lap is its own: race.js holds a craft's progress while it's on one, and settles it where
    // the craft rejoins the loop)
    path.mainU = () => 0;
    if (platform) platform.paths.push(path);
    this.extra.push(path);
    this._surfaces = null;
    this.place(path);
    return path;
  }

  addPlatform(pl) {
    this.platforms.push(pl);
    pl.group.position.copy(pl.pos);
    pl.group.rotation.y = pl.yaw;
    this.group.add(pl.group);
    return pl;
  }

  // Write a road's samples in world space from its platform's place. (yaw turns a heading h to h + yaw, the way
  // Layers.box turns a box.)
  place(path) {
    const pl = path.platform;
    const B = path.base;
    const N = path.N;
    if (pl) {
      const cs = Math.cos(pl.yaw);
      const sn = Math.sin(pl.yaw);
      const { x, y, z } = pl.pos;
      for (let i = 0; i < N; i++) {
        path.px[i] = x + B.px[i] * cs + B.pz[i] * sn;
        path.pz[i] = z - B.px[i] * sn + B.pz[i] * cs;
        path.py[i] = y + B.py[i];
        path.thx[i] = B.thx[i] * cs + B.thz[i] * sn;
        path.thz[i] = -B.thx[i] * sn + B.thz[i] * cs;
        path.tx[i] = B.tx[i] * cs + B.tz[i] * sn;
        path.tz[i] = -B.tx[i] * sn + B.tz[i] * cs;
        path.nx[i] = B.nx[i] * cs + B.nz[i] * sn;
        path.nz[i] = -B.nx[i] * sn + B.nz[i] * cs;
      }
    }
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < N; i++) {
      x0 = Math.min(x0, path.px[i]);
      x1 = Math.max(x1, path.px[i]);
      z0 = Math.min(z0, path.pz[i]);
      z1 = Math.max(z1, path.pz[i]);
      y0 = Math.min(y0, path.py[i]);
      y1 = Math.max(y1, path.py[i]);
    }
    const m = path.halfW + 6;
    path.box[0] = x0 - m;
    path.box[1] = x1 + m;
    path.box[2] = z0 - m;
    path.box[3] = z1 + m;
    path.minY = y0;
    path.maxY = y1;
    for (const S of path.sockets) {
      const i = S.end ? N - 1 : 0;
      const s = S.end ? 1 : -1;
      S.x = path.px[i];
      S.y = path.py[i];
      S.z = path.pz[i];
      S.dx = path.thx[i] * s;
      S.dz = path.thz[i] * s;
    }
  }

  // A fixed road that leaves or rejoins the main loop: no rail between the two where they lie side by side, and the
  // loop's rail there opens only for the lenses in `open` (a gate keeps that up to date for a road in; a road out
  // is always open to its own lenses). Returns the loop samples it lies along.
  joinMain(path, open) {
    const main = this.world.main;
    const hw = path.halfW;
    const along = [];
    let hint = -1;
    for (let i = 0; i < path.N; i++) {
      if (!main.frame(path.px[i], path.pz[i], hint, _f, path.py[i])) continue;
      hint = _f.i;
      if (!(Math.abs(_f.lat) < main.halfW + hw * 0.6 && Math.abs(_f.y - path.py[i]) < 1.5)) continue;
      // the edge of the slip road that lies over the loop loses its rail; the outer one keeps it unless it's well
      // inside the loop too (as branches do, track.js buildBranches)
      const ex = path.rightX(i) * hw;
      const ez = path.rightZ(i) * hw;
      const latOf = (x, z) => (main.frame(x, z, _f.i, _f2) ? Math.abs(_f2.lat) : 1e9);
      const l = latOf(path.px[i] - ex, path.pz[i] - ez);
      const r = latOf(path.px[i] + ex, path.pz[i] + ez);
      if (l < r) path.railL[i] = 0;
      else path.railR[i] = 0;
      if (Math.max(l, r) < main.halfW - 0.5) path.railL[i] = path.railR[i] = 0;
      const side = _f.lat < 0 ? -1 : 1;
      if (!along.length || along[along.length - 1] !== _f.i) along.push(_f.i);
      path.mainSide = side;
    }
    // a few samples either side, so the opening is as long as the slip road's mouth
    const span = [];
    if (along.length) {
      const a = along[0];
      const b = along[along.length - 1];
      let n = b - a;
      if (n < 0) n += main.N;
      for (let k = -3; k <= n + 3; k++) span.push(main.wrap(a + k));
    }
    const rail = path.mainSide > 0 ? main.railR : main.railL;
    const J = path.mainSide > 0 ? (main.jR ||= {}) : (main.jL ||= {});
    for (const i of span) {
      rail[i] = 0;
      J[i] = open || SHUT;
    }
    path.mainSpan = span;
    return span;
  }

  // A road in from the main loop, shut (to each lens) unless its far end is joined to a road in that lens on a
  // platform that isn't about to move.
  addGate(path, extra = {}) {
    const g = { path, open: 0, i: path.mainSpan?.[3] ?? 0, ...extra };
    this.gates.push(g);
    return g;
  }

  // A layer set of the platform's own (its lines, glow strips and glass, in its own space) that shares the world's
  // materials, so the lenses fade it with everything else. Call its primitives, then seal() it.
  layersFor(pl) {
    const L = new Layers();
    L.mats = this.world.layers.mats;
    L.level = this.world.layers.level;
    (this._subs ||= []).push({ L, pl });
    return L;
  }

  // Draw a road onto a layer set in one colour: glass, glowing edges, lane lines and (where it has them) rails.
  // The road's samples are read as they stand, so draw a platform's roads before anything moves.
  drawRoad(L, path, mask, col = colorForMask(mask), { rails = true, y = 0 } = {}) {
    const hw = path.halfW;
    // a platform's road is drawn in the platform's own space, since its geometry rides in the platform's group
    const pl = path.platform;
    const cs = pl ? Math.cos(pl.yaw) : 1;
    const sn = pl ? Math.sin(pl.yaw) : 0;
    const P = (i, lat, h) => {
      const v = path.point(i, lat, h + y, new THREE.Vector3());
      if (!pl) return v;
      const dx = v.x - pl.pos.x;
      const dz = v.z - pl.pos.z;
      return v.set(dx * cs - dz * sn, v.y - pl.pos.y, dx * sn + dz * cs);
    };
    for (let i = 0; i < path.N - 1; i++) {
      const j = i + 1;
      L.roadQuad(mask, P(i, -hw, -0.02), P(j, -hw, -0.02), P(j, hw, -0.02), P(i, hw, -0.02));
      for (const side of [-1, 1]) {
        const a = P(i, side * hw, 0.04);
        const b = P(j, side * hw, 0.04);
        const c = P(j, side * (hw - 0.45), 0.04);
        const d = P(i, side * (hw - 0.45), 0.04);
        L.quad(mask, a, b, c, d, col);
        L.quadFade(mask, d, c, P(j, side * (hw - 3.2), 0.035), P(i, side * (hw - 3.2), 0.035), col, 0.07, 0);
        if (!rails || !(side < 0 ? path.railL[i] : path.railR[i])) continue;
        let p0 = P(i, side * (hw - 0.5), 0.045);
        let p1 = P(j, side * (hw - 0.5), 0.045);
        for (let s = 1; s <= 3; s++) {
          const an = (s / 3) * Math.PI * 0.5;
          const lat = hw - 0.5 + (1 - Math.cos(an)) * 0.7;
          const h = 0.045 + Math.sin(an) * 0.75;
          const q0 = P(i, side * lat, h);
          const q1 = P(j, side * lat, h);
          L.quad(mask, p0, p1, q1, q0, col, 0.16 + s * 0.1);
          p0 = q0;
          p1 = q1;
        }
        L.quad(mask, P(i, side * (hw + 0.2), 1.1), P(j, side * (hw + 0.2), 1.1), P(j, side * (hw + 0.2), 0.75), P(i, side * (hw + 0.2), 0.75), col, 0.8);
        if (i % 4 === 0) L.line(mask, P(i, side * (hw + 0.2), 0), P(i, side * (hw + 0.2), 1.1), col);
      }
      if (i % 2 === 0) L.line(mask, P(i, -hw, 0.03), P(i, hw, 0.03), col);
      for (const f of [-0.5, 0.5]) L.line(mask, P(i, f * hw, 0.03), P(j, f * hw, 0.03), col);
      if (i % 3 !== 2) L.line(mask, P(i, 0, 0.03), P(j, 0, 0.03), col);
    }
  }

  // After the world's own layers are built: build each platform's, and put our groups in the world.
  finish() {
    const main = this.world.layers;
    for (const { L, pl } of this._subs || []) {
      pl.group.add(L.build());
      main.neutral.push(...L.neutral);
    }
    this._subs = null;
    this.world.group.add(this.group);
    this.relink();
  }

  // ------------------------------------------------------------------ the clock
  // Where a platform is at race time t: fill `out` { x, y, z, yaw, moving, busy }. Subclasses say.
  pose(pl, t, out) {
    out.x = pl.pos.x;
    out.y = pl.pos.y;
    out.z = pl.pos.z;
    out.yaw = pl.yaw;
    out.moving = out.busy = false;
  }

  // One physics step: move every platform to where the clock puts it, carrying the craft on it.
  step(dt, race) {
    if (race.state === 'race' || race.state === 'finished') this.time += dt;
    const W = this._want;
    let changed = false;
    for (const pl of this.platforms) {
      this.pose(pl, this.time, W);
      if (W.moving !== pl.moving || W.busy !== pl.busy) changed = true;
      pl.moving = W.moving;
      pl.busy = W.busy;
      const dx = W.x - pl.pos.x;
      const dy = W.y - pl.pos.y;
      const dz = W.z - pl.pos.z;
      const da = wrapAngle(W.yaw - pl.yaw);
      if (!dx && !dy && !dz && !da) continue;
      const cs = Math.cos(da);
      const sn = Math.sin(da);
      for (const r of race.racers) {
        if (r.puppet || r.respawnT > 0) continue;
        const g = r.gnd;
        // (still carried through a small hop, or the platform would slide out from under it)
        if (g.path?.platform !== pl || !(r.grounded || r.airTime < 0.4)) continue;
        const rx = r.pos.x - pl.pos.x;
        const rz = r.pos.z - pl.pos.z;
        r.pos.x = W.x + rx * cs + rz * sn;
        r.pos.z = W.z - rx * sn + rz * cs;
        r.pos.y += dy;
        if (da) {
          r.yaw = wrapAngle(r.yaw + da);
          const vx = r.vel.x;
          r.vel.x = vx * cs + r.vel.z * sn;
          r.vel.z = -vx * sn + r.vel.z * cs;
        }
        r.rode = pl;
      }
      pl.pos.set(W.x, W.y, W.z);
      pl.yaw = W.yaw;
      pl.group.position.copy(pl.pos);
      pl.group.rotation.y = pl.yaw;
      for (const p of pl.paths) this.place(p);
    }
    if (changed) this.relink();
  }

  // Join every pair of sockets that meet, and set the gates. Run whenever a platform starts or stops.
  relink() {
    const all = [];
    for (const p of this.extra) for (const S of p.sockets) {
      S.links.length = 0;
      if (!S.main && !p.platform?.moving) all.push(S);
    }
    for (let a = 0; a < all.length; a++) {
      const A = all[a];
      for (let b = a + 1; b < all.length; b++) {
        const B = all[b];
        if (A.path === B.path) continue;
        const dx = A.x - B.x;
        const dz = A.z - B.z;
        if (dx * dx + dz * dz > JOIN * JOIN || Math.abs(A.y - B.y) > 1 || A.dx * B.dx + A.dz * B.dz > -0.8) continue;
        A.links.push(B);
        B.links.push(A);
      }
    }
    const main = this.world.main;
    for (const g of this.gates) {
      let open = 0;
      for (const q of g.path.sockets[1].links) if (!q.path.platform?.busy) open |= q.path.mask[0];
      open &= g.path.mask[0];
      g.open = open;
      const J = g.path.mainSide > 0 ? main.jR : main.jL;
      for (const i of g.path.mainSpan) J[i] = open || SHUT;
    }
  }

  // Is this end of a road open to someone in `mode`?
  // (`ahead`: only roads that lead on. A one-way road entered by its far end leads back where it came from.)
  open(S, mode, ahead = false) {
    if (S.main) return true;
    return !!this.beyond(S, mode, ahead);
  }
  // The road a craft in `mode` drives onto through this end: { path, dir } (dir 1: from its start), or null.
  beyond(S, mode, ahead = false) {
    for (const q of S.links) if (solidIn(q.path.mask[0], mode) && !(ahead && q.path.oneWay && q.end)) return q;
    return null;
  }

  // Seconds until a platform next sets off (0 while it's moving, Infinity if it never will). Subclasses say; the
  // CPU uses it to stop short of a joint that's about to part.
  leaves(pl) {
    return pl?.moving ? 0 : Infinity;
  }

  // After a craft has moved: the bumper across an end of its road that's joined to nothing in its lens.
  hold(r, race) {
    const g = r.gnd;
    const P = g.path;
    if (!g.onRoad || !P?.sockets) return;
    const s = g.f * P.length;
    for (const S of P.sockets) {
      const d = S.end ? P.length - s : s;
      if (d > CAP || this.open(S, r.mode)) continue;
      const push = CAP - d;
      r.pos.x -= S.dx * push;
      r.pos.z -= S.dz * push;
      const vn = r.vel.x * S.dx + r.vel.z * S.dz;
      if (vn > 0) {
        r.vel.x -= S.dx * vn * 1.1;
        r.vel.z -= S.dz * vn * 1.1;
        if (vn > 6) race.onWallHit?.(r, vn);
      }
    }
  }

  // Sat still on one of our roads is waiting, not stuck (race.js puts a craft that isn't moving back on the road).
  parked(r) {
    return !!(r.gnd.onRoad && r.gnd.path?.sockets);
  }

  // ------------------------------------------------------------------ rivals
  // Should this rival take the road in at gate g? Subclasses say: return the lens to take it in, or 0.
  plan() {
    return 0;
  }

  // Drive a rival that is on one of our roads, or lined up for a gate. True while we have the wheel.
  pilot(ai, dt) {
    const r = ai.r;
    const w = this.world;
    const g = r.gnd;
    let P = g.onRoad && g.path?.sockets ? g.path : null;
    const ctl = r.ctl;
    const limit = 26 + ai.skill * 16;
    const vFor = (k) => (k > 1e-3 ? Math.sqrt(limit / k) : 1e3);
    if (!P) {
      if (ai.rigOn) {
        // in the air over our road for a moment: hold everything as it is
        if (!g.onRoad && r.airTime < 0.5 && r.respawnT <= 0) return true;
        // back on the loop
        ai.rigOn = false;
        ai.rigTurned = false;
        ai.route = null;
        Object.assign(ai, { path: w.main, _branch: null, planT: 0 });
        ai.decided.clear();
      }
      if (g.path !== w.main || !g.onRoad) {
        ai.route = null;
        return false;
      }
      const m = w.main;
      const dist = (i) => {
        let d = i - g.i;
        if (d < -m.N / 2) d += m.N;
        if (d > m.N / 2) d -= m.N;
        return d * m.ds;
      };
      if (!ai.route) {
        // one look at each gate as it comes up
        for (const G of this.gates) {
          const d = dist(G.i);
          if (d < 70 || d > 130) {
            if (ai.rigSeen === G && (d < -10 || d > 140)) ai.rigSeen = null;
            continue;
          }
          if (ai.rigSeen === G) continue;
          ai.rigSeen = G;
          if (r.finished || r.angryT > 0) continue;
          const lens = this.plan(ai, G, d);
          if (lens && r.canShift(lens) && (r.mono ? true : r.energy > 0.3)) ai.route = { G, lens };
          break;
        }
        return false;
      }
      const { G, lens } = ai.route;
      const d = dist(G.i);
      // past it, or it shut before we got there: carry on round
      // (still on the loop's strip for the first part of the bend, so "past it" is well past the slip road's start)
      if (d < -50 || (d < 30 && d > -4 && !(G.open & lens))) {
        ai.route = null;
        return false;
      }
      if (d > 60) return false;
      // line up on the slip road, in its lens, at a speed its bend can take
      const C = G.path;
      const lat0 = this.latOnMain(C);
      const A = 7 + Math.max(10, r.speed) * 0.45;
      if (d > A) m.point(g.i + Math.round(A / m.ds), lat0, 0, _p);
      else C.point(Math.min(C.N - 1, Math.round((A - d) / C.ds)), 0, 0, _p);
      if (r.mode !== lens && d < Math.max(30, r.speed * 0.9)) {
        if (!r.shiftTo(lens, r.session) && d < 16) {
          ai.route = null;
          return false;
        }
      }
      const vIn = vFor(C.kmax);
      const over = r.speed > Math.sqrt(vIn * vIn + 2 * 22 * Math.max(0, d));
      ctl.throttle = over ? 0 : 1;
      ctl.brake = over ? 1 : 0;
      ctl.drift = false;
      ctl.steer = clamp(-wrapAngle(Math.atan2(_p.x - r.pos.x, _p.z - r.pos.z) - r.yaw) * 2.4, -1, 1);
      return true;
    }

    // ---- on one of our roads: drive to its far end, and on through whatever it's joined to
    ai.rigOn = true;
    let f = g.f;
    let gi = g.i;
    if (P.pair) {
      // Two one-way roads that lie over each other where they meet a platform (a way in and a way out): the ground
      // can name either. Keep to the one we were on; coming off a platform, it's the way out.
      const prev = ai.rigPath;
      const want = prev === P.pair ? prev : prev !== P && !P.sockets[1].main && g.f > 0.5 ? P.pair : null;
      if (want && want.frame(r.pos.x, r.pos.z, -1, _f2, r.pos.y) !== false && Math.abs(_f2.lat) < want.halfW + 1) {
        P = want;
        f = _f2.f;
        gi = _f2.i;
      }
    }
    if (ai.rigPath !== P) {
      ai.rigPath = P;
      // which way: away from the end we came in by (the nearer one), unless we're plainly travelling the other way
      const s0 = f * P.length;
      ai.rigDir = s0 < P.length / 2 ? 1 : -1;
      const along = r.vel.x * P.thx[gi] + r.vel.z * P.thz[gi];
      if (Math.abs(along) > 12 && s0 > 6 && s0 < P.length - 6) ai.rigDir = along > 0 ? 1 : -1;
      if (P.oneWay) ai.rigDir = 1;
      ai.rigWait = 0;
    }
    // knocked out of the lens we came in for (an item, a rival's flip) while the road under us is in both: shift back
    if (ai.route && r.mode !== ai.route.lens && solidIn(P.mask[0], ai.route.lens)) r.shiftTo(ai.route.lens, r.session);
    const dir = ai.rigDir;
    const s = f * P.length;
    const rem = dir > 0 ? P.length - s : s;
    const E = P.sockets[dir > 0 ? 1 : 0];
    let open = this.open(E, r.mode, true);
    if (!open) {
      // knocked into the wrong lens for the road ahead (an item, a rival's flip): shift back to the one that's joined
      for (const L of LENSES) {
        if (L === r.mode || !solidIn(P.mask[0], L) || !this.open(E, L, true)) continue;
        if (r.shiftTo(L, r.session)) open = true;
        break;
      }
    } else if (!E.main) {
      // joined now, but will it still be when we get there? A platform about to leave takes its joint with it.
      let left = this.leaves(P.platform);
      for (const q of E.links) left = Math.min(left, this.leaves(q.path.platform));
      if (left < (rem + 5) / Math.max(r.speed, 12) + 0.15) open = false;
    }
    const A = 6 + Math.max(8, r.speed) * 0.4;
    let vmax = vFor(P.kmax);
    if (!open) {
      // wait at the cap
      const stop = Math.max(0, rem - CAP - 1.5);
      vmax = Math.min(vmax, Math.sqrt(2 * 20 * stop));
      const to = dir > 0 ? Math.min(P.length - CAP - 0.5, s + A) : Math.max(CAP + 0.5, s - A);
      P.pointF(clamp(to / P.length, 0, 1), 0, 0, _p);
    } else if (rem > A) P.pointF(clamp((s + dir * A) / P.length, 0, 1), 0, 0, _p);
    else if (E.main) {
      // out onto the loop
      const m = w.main;
      m.frame(E.x, E.z, r.hints[m.id] ?? -1, _f, E.y);
      m.point(_f.i + Math.round((A - rem + 4) / m.ds), _f.lat, 0, _p);
    } else {
      const Q = this.beyond(E, r.mode, true);
      const qd = Q.end ? -1 : 1;
      const qs = Q.end ? Q.path.length - (A - rem) : A - rem;
      Q.path.pointF(clamp(qs / Q.path.length, 0, 1), 0, 0, _p);
      void qd;
      if (rem < 30) vmax = Math.min(vmax, vFor(Q.path.kmax) + rem * 0.3);
    }
    const err = wrapAngle(Math.atan2(_p.x - r.pos.x, _p.z - r.pos.z) - r.yaw);
    ctl.steer = clamp(-err * 2.4, -1, 1);
    ctl.drift = false;
    const waiting = !open && rem < CAP + 4;
    ctl.throttle = waiting ? (Math.abs(err) > 0.5 ? 0.5 : 0) : r.speed < vmax ? 1 : 0;
    ctl.brake = waiting ? (r.speed > 1 ? 1 : 0) : r.speed > vmax + 4 ? 1 : r.speed > vmax + 1 ? 0.4 : 0;
    // turned round (a hit, a bumper): hover pads pivot on the spot with a little gas
    if (Math.abs(err) > 1.3 && r.speed < 8) {
      ctl.throttle = 0.5;
      ctl.brake = 0;
    }
    // a road that never joins up: give it a while, then take the loop (the race puts the craft back on it)
    ai.rigWait = waiting && Math.abs(r.speed) < 3 ? ai.rigWait + dt : 0;
    if (ai.rigWait > this.patience) {
      ai.rigWait = 0;
      // try the way we came, once; after that the race puts the craft back on the loop
      if (!ai.rigTurned) {
        ai.rigTurned = true;
        ai.rigDir = -dir;
      } else r.session?.onFell?.(r);
    }
    return true;
  }

  // Where across the loop a slip road's start lies.
  latOnMain(C) {
    if (C._lat0 === undefined) {
      const m = this.world.main;
      C._lat0 = m.frame(C.px[0], C.pz[0], -1, _f, C.py[0]) ? _f.lat : 0;
    }
    return C._lat0;
  }
}
Platforms.prototype.patience = 5.5;

export { COLORS };
