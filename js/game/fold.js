// The fold: a course whose heights change pose by pose (HYPERCUBE, world/tesseract.js). The course's def carries
// `fold: { T, names, phases, at }`, each phase a function (x, z, y, outer) -> y that says how high a point of the
// built course sits in that pose (outer: the point is on a branch marked cell: 'outer'). When the leader reaches
// each of `at` (fractions of the race; with no `at`, each new lap) the course turns to the next pose over T seconds: every road's heights move (so ground(), the rails, the AI and respawns all see the new course), and
// everything drawn on or beside a road rides with it, as the quake's plates carry their baked lines (game/quake.js).
// Only heights move. The plan stays as built, so forks, rails and hints stay good.
//
// What rides, and how:
//   - a baked vertex over a road (the road itself, rails, pads, launchers, gantries, gates: up to 45 m above it and
//     16 m out from its edge) moves by as much as the road under it does
//   - a baked vertex under a road (a cover building's wall, a post) is stretched between the floor and the road
//   - shards, obstacles and SEAM CHARGE prisms are put back on their road; any other object standing on the course
//     (a sign board) moves with the nearest road
//   - a racer on the ground is carried with the road under them

import { smoothstep } from '../core/util.js';
import { HYPER } from '../world/tesseract.js';

const OVER = 45;
const UNDER = 2.5;
const REACH = 16;
const CELL = 30;

export class Fold {
  constructor(race) {
    this.race = race;
    this.on = false;
    const F = race.def.fold;
    if (!F || race.tutorial) return;
    this.on = true;
    this.F = F;
    this.phase = 0;
    this.from = 0;
    this.k = 1;
    const W = race.world;
    this.floor = W.floorY;
    // every road sample, numbered across the paths: its height in each pose, and now
    this.off = [];
    let n = 0;
    for (const p of W.paths) {
      this.off.push(n);
      n += p.N;
    }
    this.n = n;
    this.Y = F.phases.map(() => new Float32Array(n));
    this.cur = new Float32Array(n);
    this.prev = new Float32Array(n);
    let lo = Infinity;
    let hi = -Infinity;
    W.paths.forEach((p, q) => {
      let plo = Infinity;
      let phi = -Infinity;
      for (let i = 0; i < p.N; i++) {
        for (let k = 0; k < F.phases.length; k++) {
          const y = F.phases[k](p.px[i], p.pz[i], p.py[i], p.def?.cell === 'outer');
          this.Y[k][this.off[q] + i] = y;
          plo = Math.min(plo, y);
          phi = Math.max(phi, y);
        }
      }
      // the bounds ground() rejects on have to hold in every pose
      p.minY = plo;
      p.maxY = phi;
      lo = Math.min(lo, plo);
      hi = Math.max(hi, phi);
    });
    W.minY = lo;
    W.maxY = hi;
    this.cur.set(this.Y[0]);
    this.prev.set(this.Y[0]);
  }

  // Tie everything that stands on the course to the road sample it stands on. Run once, at the first update, when
  // the race has laid out all it's going to.
  capture() {
    const W = this.race.world;
    const base = this.Y[0];
    // the samples, in a grid over the plan
    const grid = new Map();
    const S = [];
    W.paths.forEach((p, q) => {
      for (let i = 0; i < p.N; i++) {
        const s = this.off[q] + i;
        S.push(p.px[i], p.pz[i], p.halfW);
        const key = Math.floor(p.px[i] / CELL) * 4096 + Math.floor(p.pz[i] / CELL);
        let c = grid.get(key);
        if (!c) grid.set(key, (c = []));
        c.push(s);
      }
    });
    // the sample a point belongs to: over a road if it can be, else under one. [sample, under?] or null.
    const find = (x, y, z) => {
      const gx = Math.floor(x / CELL);
      const gz = Math.floor(z / CELL);
      let best = -1;
      let bs = Infinity;
      let under = -1;
      let us = Infinity;
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const c = grid.get((gx + a) * 4096 + gz + b);
          if (!c) continue;
          for (const s of c) {
            const dx = S[s * 3] - x;
            const dz = S[s * 3 + 1] - z;
            const d = Math.hypot(dx, dz);
            if (d > S[s * 3 + 2] + REACH) continue;
            const dy = y - base[s];
            if (dy >= -UNDER && dy <= OVER) {
              const sc = d + Math.abs(dy) * 2;
              if (sc < bs) {
                bs = sc;
                best = s;
              }
            } else if (dy < -UNDER && d < us) {
              us = d;
              under = s;
            }
          }
        }
      }
      return best >= 0 ? [best, 0] : under >= 0 ? [under, 1] : null;
    };
    this.geoms = [];
    W.layers.group.traverse((o) => {
      const P = o.geometry?.getAttribute?.('position');
      if (!P) return;
      const arr = P.array;
      const vs = [];
      const ss = [];
      const y0 = [];
      const rel = [];
      for (let v = 0; v < P.count; v++) {
        const y = arr[v * 3 + 1];
        const hit = find(arr[v * 3], y, arr[v * 3 + 2]);
        if (!hit) continue;
        vs.push(v);
        ss.push(hit[0]);
        y0.push(y);
        rel.push(hit[1] ? Math.max(0, (y - this.floor) / Math.max(1, base[hit[0]] - this.floor)) : -1);
      }
      if (!vs.length) return;
      o.frustumCulled = false;
      this.geoms.push({ P, vs: Int32Array.from(vs), ss: Int32Array.from(ss), y0: Float32Array.from(y0), rel: Float32Array.from(rel) });
    });
    // loose objects on the course: anything that isn't the batch, the frame, a shard or an obstacle (those are put
    // back on their road by name)
    const known = new Set([W.layers.group, W.frame?.group, ...W.shards.map((s) => s.root), ...W.obstacles.map((o) => o.root)]);
    this.loose = [];
    for (const o of W.group.children) {
      if (known.has(o) || (o.position.x === 0 && o.position.y === 0 && o.position.z === 0)) continue;
      const hit = find(o.position.x, o.position.y, o.position.z);
      if (hit && !hit[1]) this.loose.push({ o, s: hit[0], y0: o.position.y });
    }
    this.captured = true;
  }

  update(dt) {
    if (!this.on) return;
    const R = this.race;
    if (!this.captured) this.capture();
    // the pose follows the leader: a turn at each of `at` (fractions of the whole race), or one a lap
    const lead = Math.max(0, ...R.racers.map((r) => (this.F.at ? (r.prog || 0) / R.laps : r.lap || 0)));
    const lap = Math.min(this.F.phases.length - 1, this.F.at ? this.F.at.filter((u) => lead >= u).length : Math.floor(lead));
    if (lap > this.phase && this.k >= 1) {
      this.from = this.phase;
      this.phase = lap;
      this.k = 0;
      HYPER.kick = 1;
      for (const pl of R.players) {
        R.emitP(pl, 'popup', { text: this.F.names[lap] || 'THE COURSE TURNS', color: '#b04cff' });
        R.camOf(pl).addShake(0.5);
        R.camOf(pl).fovPunch(5);
      }
      R.app.audio.play('quake');
    }
    if (this.k >= 1) return;
    this.k = Math.min(1, this.k + dt / this.F.T);
    const e = smoothstep(0, 1, this.k);
    const w = this.F.phases.map((_, q) => (q === this.phase ? e : q === this.from ? 1 - e : 0));
    this.apply(w);
  }

  // The whole course to the pose with weights w.
  apply(w) {
    const R = this.race;
    const W = R.world;
    const cur = this.cur;
    this.prev.set(cur);
    cur.fill(0);
    for (let k = 0; k < w.length; k++) {
      if (!w[k]) continue;
      const Y = this.Y[k];
      for (let s = 0; s < this.n; s++) cur[s] += Y[s] * w[k];
    }
    W.paths.forEach((p, q) => {
      p.py.set(cur.subarray(this.off[q], this.off[q] + p.N));
      p.reframe();
    });
    const base = this.Y[0];
    const floor = this.floor;
    for (const G of this.geoms) {
      const arr = G.P.array;
      for (let q = 0; q < G.vs.length; q++) {
        const s = G.ss[q];
        arr[G.vs[q] * 3 + 1] = G.rel[q] < 0 ? G.y0[q] + cur[s] - base[s] : floor + G.rel[q] * (cur[s] - floor);
      }
      G.P.needsUpdate = true;
    }
    for (const sh of W.shards) {
      sh.path.point(sh.i, sh.lat, 1.4, sh.at);
      sh.y0 = sh.path.wpoint(sh.i, sh.lat, 1.4, sh.root.position).y;
    }
    for (const ob of W.obstacles) if (ob.root && !ob.door) ob.path.point(ob.i, ob.lat, ob.h / 2, ob.root.position);
    for (const g of R.items?.gates || []) {
      const y = g.path.point(g.i, g.lat, 1.6).y;
      g.root.position.y += y - g.y0;
      g.y0 = y;
    }
    for (const L of this.loose) L.o.position.y = L.y0 + cur[L.s] - base[L.s];
    W.frame?.set(w);
    // whoever is on the road goes with it
    for (const r of R.racers) {
      const g = r.gnd;
      if (!r.grounded || !g?.onRoad || !g.path) continue;
      const q = W.paths.indexOf(g.path);
      if (q < 0) continue;
      const s = this.off[q] + g.i;
      r.pos.y += cur[s] - this.prev[s];
    }
  }
}
