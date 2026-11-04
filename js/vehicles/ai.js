// Rival drivers. Steering and braking follow WEDGEWRECK's RaceAI idea (aim at a point down the road, ease off where
// the curvature is high), plus the new part: each rival reads the road ahead in all three worlds and picks the lens
// that keeps road under it and walls out of its way, and decides at every fork whether a shortcut is worth the
// SHIFT energy.

import { clamp, wrapAngle, rand } from '../core/util.js';
import { BOTH, RED, BLUE, MODES, solidIn, SHIFT } from '../world/shift.js';

export class RaceAI {
  constructor(racer, world, skill = 0.8) {
    this.r = racer;
    this.world = world;
    this.skill = skill;
    this.path = world.main;
    this.targetLat = rand(-0.3, 0.3) * world.halfWidth;
    this.prefLat = this.targetLat;
    this.decided = new Set();
    this.modeHold = 0;
    this.think = 0;
    this.wantMode = BOTH;
    this.mistake = 0;
  }

  // Where the racer is on the path it is following.
  where() {
    const t = this.r.track;
    if (t && t.path === this.path) return t.i;
    const f = {};
    this.path.frame(this.r.pos.x, this.r.pos.z, this.r.hints[this.path.id] ?? -1, f);
    return f.i ?? 0;
  }

  update(dt) {
    const r = this.r;
    const w = this.world;
    const ctl = r.ctl;
    const path = this.path;
    const i = this.where();
    const t = r.track;
    // Did we end up on a different strip (fell to a lower one, missed a fork, a branch ended)?
    this.planT = (this.planT || 0) + dt;
    if (t && t.path === path) this.planT = 0;
    if (t && t.path !== path && this.planT > 1.5) {
      this.path = t.path;
      this._branch = null;
      this.planT = 0;
    }
    if (!this.path.closed && i >= this.path.N - 4) {
      this.path = w.main;
      this._branch = null;
      this.prefLat = rand(-0.3, 0.3) * w.halfWidth;
    }

    // ---- forks: decide once per approach
    if (this.path === w.main) {
      for (const b of w.paths) {
        if (b.closed) continue;
        const iFrom = w.main.index(b.mainFrom);
        let d = iFrom - i;
        if (d < -w.main.N / 2) d += w.main.N;
        const key = b.id;
        if (d > 0 && d * w.main.ds < 90) {
          if (!this.decided.has(key)) {
            this.decided.add(key);
            b._take = this.wantsBranch(b);
            this._branch = b._take ? b : null;
          }
          if (this._branch === b) {
            this.targetLat = b.side * (w.halfWidth - 2);
            if (d * w.main.ds < 4) {
              this.path = b;
              this.planT = 0;
              this.targetLat = 0;
              this.prefLat = 0;
            }
          }
        } else if (d < -20) this.decided.delete(key);
      }
    }

    // ---- read the road ahead in each world
    const P = this.path;
    const pi = this.where();
    const speed = Math.max(10, r.speed);
    const look = 18 + speed * 1.5;
    const n = Math.ceil(look / P.ds);
    const ok = { [BOTH]: true, [RED]: true, [BLUE]: true };
    const blocked = { [BOTH]: 0, [RED]: 0, [BLUE]: 0 };
    const near = Math.ceil(12 / P.ds);
    for (let k = -1; k < n; k++) {
      const j = P.closed ? P.wrap(pi + k) : Math.min(P.N - 1, pi + k);
      const mk = P.mask[j];
      for (const m of MODES) if (!solidIn(mk, m)) ok[m] = false;
    }
    const obs = [];
    for (const o of w.obstacles) {
      if (o.path !== P) continue;
      let d = o.i - pi;
      if (P.closed && d < -P.N / 2) d += P.N;
      if (d < -2 || d > n) continue;
      obs.push(o);
    }
    // For each world, the best single lane through everything solid in it.
    const LANES = [-0.65, -0.35, 0, 0.35, 0.65].map((f) => f * P.halfW);
    const hits = (m, lat) => {
      let c = 0;
      for (const o of obs) {
        if (!solidIn(o.mask, m)) continue;
        if (o.type === 'wall') c += 10;
        else if (Math.abs(lat - o.lat) < o.w + r.halfW + 0.8 + Math.abs(o.sweep || 0) * P.halfW) c += 1;
      }
      return c;
    };
    for (const m of MODES) blocked[m] = Math.min(...LANES.map((lat) => hits(m, lat)));
    // energy needed to hold a single lens to the end of the look-ahead
    const secs = look / speed;
    const afford = r.mono ? r.energy >= SHIFT.monoCost : r.energy - SHIFT.drain * secs * 0.6 > 0.02;
    const score = (m) => {
      if (r.mono) {
        if (m === BOTH || !ok[m]) return 1e6;
        return blocked[m] * 10 + (m === r.mode ? 0 : afford ? 4 : 1e5);
      }
      if (!ok[m]) return 1e6;
      let s = blocked[m] * 10;
      if (m !== BOTH) s += afford ? 3 : 200;
      if (m === r.mode) s -= 1.5;
      return s;
    };
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.12 + (1 - this.skill) * 0.35;
      let best = r.mono ? r.mode : BOTH;
      let bs = score(best);
      for (const m of MODES) {
        const s = score(m);
        if (s < bs) {
          bs = s;
          best = m;
        }
      }
      // weaker drivers sometimes hesitate
      if (Math.random() > this.skill * 1.1 && best !== r.mode) best = r.mode;
      this.wantMode = best;
    }
    if (this.wantMode !== r.mode && r.canShift(this.wantMode)) r.shiftTo(this.wantMode, r.session);

    // ---- pick a lane clear of whatever is solid in our lens
    if (!(this._branch && this.path === w.main)) {
      const hw = P.halfW;
      let bestLat = this.prefLat;
      let bestCost = Infinity;
      for (const lat of LANES) {
        let c = Math.abs(lat - (r.track ? r.track.lat : 0)) * 0.05 + Math.abs(lat - this.prefLat) * 0.02;
        c += hits(this.wantMode, lat) * 10;
        for (const p of w.pads) if (p.path === P && solidIn(p.mask, this.wantMode) && Math.abs(p.i - pi) < n && Math.abs(lat - p.lat) < 2) c -= 0.6;
        if (c < bestCost) {
          bestCost = c;
          bestLat = lat;
        }
      }
      this.targetLat = bestLat;
    }

    // ---- steer at a point down the road
    const aheadN = Math.ceil((7 + speed * 0.45) / P.ds);
    const ja = P.closed ? P.wrap(pi + aheadN) : Math.min(P.N - 1, pi + aheadN);
    const tp = P.point(ja, this.targetLat, 0);
    const dx = tp.x - r.pos.x;
    const dz = tp.z - r.pos.z;
    const want = Math.atan2(dx, dz);
    const err = wrapAngle(want - r.yaw);
    this.mistake = Math.max(0, this.mistake - dt);
    if (Math.random() < (1 - this.skill) * dt * 0.4) this.mistake = 0.4;
    ctl.steer = clamp(-err * 2.4, -1, 1) * (this.mistake > 0 ? 0.3 : 1);
    // ---- throttle and brakes from the curvature ahead
    let kmax = 0;
    for (let k = 2; k < Math.ceil(look / P.ds); k += 2) {
      const j = P.closed ? P.wrap(pi + k) : Math.min(P.N - 1, pi + k);
      kmax = Math.max(kmax, Math.abs(P.curv[j]));
    }
    const lat = r.speed * r.speed * kmax;
    const limit = 26 + this.skill * 16;
    ctl.throttle = lat > limit ? 0.35 : 1;
    ctl.brake = lat > limit * 1.45 && r.speed > 22 ? 0.5 : 0;
    ctl.drift = false;
    if (Math.abs(err) > 1.4 && r.speed < 6) {
      // stuck facing the wrong way: back up
      ctl.throttle = 0;
      ctl.brake = 1;
      ctl.steer = -ctl.steer;
    }
  }

  wantsBranch(b) {
    const r = this.r;
    // Which lenses can drive it?
    const needSingle = !solidIn(b.mask[Math.floor(b.N / 2)], BOTH);
    if (r.mono) {
      const m = b.mask[Math.floor(b.N / 2)];
      if (!solidIn(m, r.mode) && r.energy < SHIFT.monoCost * 2) return false;
    } else if (needSingle) {
      const secs = b.length / Math.max(25, r.phys.topSpeed * 0.85);
      if (r.energy < SHIFT.drain * secs + 0.15) return false;
    }
    return Math.random() < 0.35 + this.skill * 0.5;
  }
}
