// Rival drivers. Steering and braking follow Absurd Combat Racing's RaceAI idea (aim at a point down the road, ease off where
// the curvature is high), plus the new part: each rival reads the road ahead in all three worlds and picks the lens
// that keeps road under it and walls out of its way, and decides at every fork whether a shortcut is worth the
// SHIFT energy.

import { clamp, wrapAngle, rand } from '../core/util.js';
import { BOTH, RED, BLUE, MODES, solidIn, SHIFT } from '../world/shift.js';
import { FORMS } from './forms.js';
import { offPage } from '../game/popup.js';

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
    // on a moving platform's road, or lined up for one: the rig drives (world/platforms.js)
    if (w.rig?.pilot(this, dt)) return;
    const path = this.path;
    const i = this.where();
    const t = r.track;
    // Did we end up on a different strip (fell to a lower one, missed a fork, a branch ended)?
    this.planT = (this.planT || 0) + dt;
    if (t && t.path === path) this.planT = 0;
    // A branch that starts flush with the main road reads as "main" under the wheels until it climbs away; we are
    // still on it as long as we sit inside its strip at its height.
    if (t && t.path !== path && !path.closed && path.frame(r.pos.x, r.pos.z, i, _f) && Math.abs(_f.lat) < path.halfW + 1 && Math.abs(_f.y - r.pos.y) < 2.5) this.planT = 0;
    // (a lens-only road under the wheels is adopted at once: read as the road we meant to be on, it looked solid in
    // every lens, and a rival that had drifted up BLUE ROOFTOPS shifted back to BOTH and dropped through it)
    const lensOnly = t && r.gnd?.onRoad && r.gnd.path === t.path && !solidIn(r.gnd.mask, BOTH);
    if (t && t.path !== path && (this.planT > 1.5 || (lensOnly && this.planT > 0.2))) {
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
        // (noFork: a strip nothing leads onto, DROP TOWER's catch chute and seesaw plank)
        // (noFork: a road you don't drive onto from this one, like FLIPPER ALLEY's centre ramp)
        if (b.closed || b.noFork) continue;
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
    let rideAhead = false;
    for (let k = -1; k < n; k++) {
      const j = P.closed ? P.wrap(pi + k) : Math.min(P.N - 1, pi + k);
      const mk = P.mask[j];
      if (P.leap?.[j]) rideAhead = true;
      if (P.warpKind?.[j] === 1 && P.warpK[j] > 0.9) rideAhead = true;
      for (const m of MODES) {
        // a glide gap is road enough for the form that glides; a wall-run only for the one that clings
        if (!solidIn(mk, m) && !(P.glide?.[j] && FORMS[m].glide)) ok[m] = false;
        // (a corkscrew has a launcher in front of it for the forms that can't ride it: they jump it)
        if (P.cling?.[j] && !FORMS[m].cling && !(P.leap?.[j] && solidIn(P.leap[j], m))) ok[m] = false;
      }
    }
    const obs = [];
    for (const o of w.obstacles) {
      // (a pop-up on another page of the book isn't there for this racer: game/popup.js)
      if (o.path !== P || (o.page !== undefined && offPage(o, r))) continue;
      let d = o.i - pi;
      if (P.closed && d < -P.N / 2) d += P.N;
      if (d < -2 || d > n) continue;
      obs.push(o);
    }
    // traffic and the police convoy read like obstacles (each in its own world), see game/traffic.js, game/police.js
    for (const o of r.session?.traffic?.near(P, pi, n) || []) obs.push(o);
    for (const o of r.session?.police?.near(P, pi, n) || []) obs.push(o);
    for (const o of r.session?.tower?.near(P, pi, n) || []) obs.push(o); // DROP TOWER's marbles
    for (const o of r.session?.pinball?.near(P, pi, n) || []) obs.push(o);
    // For each world, the best single lane through everything solid in it.
    const LANES = [-0.65, -0.35, 0, 0.35, 0.65].map((f) => f * P.halfW);
    // Obstacles inside the reaction distance can't be dodged by a lane change any more, so they are checked
    // against the lane we are in now: the only way past those is the lens.
    const curLat = r.track ? r.track.lat : 0;
    const react = 4 + r.speed * 0.4;
    const hits = (m, lat, lane = false) => {
      let c = 0;
      for (const o of obs) {
        if (!solidIn(o.mask, m)) continue;
        let d = o.i - pi;
        if (P.closed && d < -P.N / 2) d += P.N;
        const at = !lane && d * P.ds < react ? curLat : lat;
        if (o.slit) {
          // a slit's pieces are walls with a gap between them: a wall to any form too wide for the gap, and a
          // line to hold for the one that fits (a small correction is still on until the last few metres)
          const hw = FORMS[m].halfW;
          if (hw >= o.slit - 0.05) c += 10;
          else if (Math.abs((!lane && d * P.ds < react * 0.35 ? curLat : lat) - o.lat) < o.w + hw + 0.12) c += 1;
        } else if (o.type === 'wall') c += 10;
        else if (Math.abs(at - o.lat) < o.w + r.halfW + 0.8 + Math.abs(o.sweep || 0) * P.halfW) c += 1;
      }
      return c;
    };
    // Pinned against something: go to whichever lens it doesn't exist in.
    this.pinned = r.speed < 4 && !r.mono ? (this.pinned || 0) + dt : 0;
    for (const m of MODES) blocked[m] = Math.min(...LANES.map((lat) => hits(m, lat)));
    // energy needed to hold a single lens to the end of the look-ahead
    const secs = look / speed;
    const afford = r.mono ? r.energy >= SHIFT.monoCost : r.energy - SHIFT.drain * secs * 0.6 > 0.02;
    // heading for a lens-only branch: keep the meter for it, and give the branch up if it can no longer be held
    const saving = !r.mono && this._branch && this.path === w.main && (this.singleLen(this._branch) > 0 || this.formOf(this._branch));
    if (saving && !this.canTakeBranch(this._branch)) {
      let d = w.main.index(this._branch.mainFrom) - pi;
      if (d < -w.main.N / 2) d += w.main.N;
      if (d * w.main.ds > 8) this._branch = null;
    }
    const score = (m) => {
      if (r.mono) {
        if (m === BOTH || !ok[m]) return 1e6;
        return blocked[m] * 10 + (m === r.mode ? 0 : afford ? 4 : 1e5) + (r.session?.live?.lensScore?.(r, m) || 0);
      }
      if (!ok[m]) return 1e6;
      // never let go of the road under the wheels while the plan is still about another one
      if (t && t.path !== P && r.gnd?.onRoad && !solidIn(r.gnd.mask, m)) return 1e6;
      let s = blocked[m] * 10;
      if (m !== BOTH) s += afford ? 3 : 200;
      if (m !== BOTH && saving) s += 6;
      if (m === r.mode) s -= 1.5;
      // a corkscrew ahead: the Blade rides it, which is the show; most rivals go for it if they can hold RED
      if (rideAhead && m === RED && afford && this.skill > 0.45) s -= 4;
      // a storm in this lens: worth dodging, unless it's the one guarding the shortcut we're going for
      if (r.session?.storms?.threat(r, m) && !(saving && m !== BOTH)) s += 5;
      // lava ahead in this lens (the quake course): blue cools it
      if (r.session?.quake?.threat(r, m)) s += 6;
      // the police chase is only in BOTH: worth a lens to get through it
      if (r.session?.police?.threat(r, m)) s += 5;
      // LENS TAG (game/tag.js): the lens this CPU wants for the hunt
      if (r.session?.tag) s += r.session.tag.lensBias(r, m);
      // a course's own machinery has a say (QUARTER TURN: which lens the glass ahead is there in)
      s += r.session?.live?.lensScore?.(r, m) || 0;
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
      if (this.pinned > 0.6) {
        const front = obs.filter((o) => { let d = o.i - pi; if (P.closed && d < -P.N / 2) d += P.N; return d >= -1 && d * P.ds < 6 + o.len + o.w; });
        const free = MODES.find((m) => ok[m] && front.every((o) => !solidIn(o.mask, m)));
        if (free !== undefined) best = free;
      }
      this.wantMode = best;

    }
    // A lens is held for a moment once chosen: where the scores sit close (the police chase, lava, a storm over a
    // shortcut) a rival would otherwise flick between lenses several times a second, its forms splitting and
    // docking in a blur. Only a road that is gone in the lens we're in, or a wall across it, overrides the hold.
    this.modeHold = Math.max(0, this.modeHold - dt);
    if (this.wantMode !== r.mode && (this.modeHold <= 0 || !ok[r.mode] || blocked[r.mode] >= 10) && r.canShift(this.wantMode)) {
      if (r.shiftTo(this.wantMode, r.session)) this.modeHold = 0.7;
    }

    // ---- pick a lane clear of whatever is solid in our lens
    if (!(this._branch && this.path === w.main)) {
      const hw = P.halfW;
      let bestLat = this.prefLat;
      let bestCost = Infinity;
      for (const lat of LANES) {
        let c = Math.abs(lat - (r.track ? r.track.lat : 0)) * 0.05 + Math.abs(lat - this.prefLat) * 0.02;
        c += hits(this.wantMode, lat, true) * 10;
        c += (r.session?.quake?.laneCost(r, this.wantMode, lat) || 0) * 6;
        c += (r.session?.tower?.laneCost(r, this.wantMode, lat) || 0) * 6;
        // a route with a slit: get on the middle line early, so there's no last-moment swerve to thread it
        if (P.slit || P.thin) c += Math.abs(lat) * 0.4;
        for (const p of w.pads) if (p.path === P && solidIn(p.mask, this.wantMode) && Math.abs(p.i - pi) < n && Math.abs(lat - p.lat) < 2) c -= 0.6;
        if (c < bestCost) {
          bestCost = c;
          bestLat = lat;
        }
      }
      this.targetLat = bestLat;
    }
    // taunted: for a few seconds, go after whoever honked (line up on them when they're close ahead, and push)
    if (r.angryT > 0) {
      r.angryT -= dt;
      const o = r.angryAt;
      if (o && o.track?.path === P && o.respawnT <= 0) {
        let di = o.track.i - pi;
        if (P.closed) di = ((di % P.N) + P.N + P.N / 2) % P.N - P.N / 2;
        if (di > 0 && di * P.ds < 40) this.targetLat = clamp(o.track.lat, -P.halfW + 2, P.halfW - 2);
      }
      if (r.angryT <= 0) r.angryAt = null;
    }
    // LENS TAG: line up on IT, or away from whoever's after it
    r.session?.tag?.steerAI(r, this, P, pi);

    // ---- steer at a point down the road
    const aheadN = Math.ceil((7 + speed * 0.45) / P.ds);
    const ja = P.closed ? P.wrap(pi + aheadN) : Math.min(P.N - 1, pi + aheadN);
    // a full pipe in RED: up the wall and along the roof, where its pads and shards are (a side picked each time in)
    if (P.warpKind?.[ja] === 1 && r.mode === RED && this.skill > 0.45) {
      if (!this.pipeSide) this.pipeSide = Math.random() < 0.5 ? -1 : 1;
      if (P.warpK[ja] > 0.9) this.targetLat = this.pipeSide * P.ext[ja] * 0.93;
    } else if (!P.warpKind?.[pi]) this.pipeSide = 0;
    const tp = P.point(ja, this.targetLat, 0);
    const dx = tp.x - r.pos.x;
    const dz = tp.z - r.pos.z;
    const want = Math.atan2(dx, dz);
    const err = wrapAngle(want - r.yaw);
    this.mistake = Math.max(0, this.mistake - dt);
    if (Math.random() < (1 - this.skill) * dt * 0.4) this.mistake = 0.4;
    ctl.steer = clamp(-err * 2.4, -1, 1) * (this.mistake > 0 ? 0.3 : 1);
    // threading a slit: the aim-point steering settles too slowly at speed to be sure of the gap, so hold the
    // line with the lateral error and its rate as well (positive steer carries the car toward positive lat)
    // (and a road barely wider than the craft, like FLIPPER ALLEY's wire: aiming down the road would cut every bend)
    if ((P.slit || P.thin) && this.formOf(P) === r.mode) {
      const latV = r.vel.x * P.rightX(pi) + r.vel.z * P.rightZ(pi);
      ctl.steer = clamp(-err * 2.4 + (this.targetLat - curLat) * 0.2 - latV * 0.12, -1, 1);
    }
    // ---- throttle and brakes from the curvature ahead
    let kmax = 0;
    for (let k = 2; k < Math.ceil(look / P.ds); k += 2) {
      const j = P.closed ? P.wrap(pi + k) : Math.min(P.N - 1, pi + k);
      // no rail to lean on: treat the bend as tighter, and stay off the open edge
      const open = !P.railL[j] || !P.railR[j];
      kmax = Math.max(kmax, Math.abs(P.curv[j]) * (open ? 1.7 : 1));
      if (open && k * P.ds < 30) this.targetLat = clamp(this.targetLat, -P.halfW * 0.35, P.halfW * 0.35);
    }
    const lat = r.speed * r.speed * kmax;
    const limit = 26 + this.skill * 16;
    ctl.throttle = lat > limit ? 0.35 : 1;
    ctl.brake = lat > limit * 1.45 && r.speed > 22 ? 0.5 : 0;
    ctl.drift = false;
    if (this.tagThrottle != null) ctl.throttle = Math.min(ctl.throttle, this.tagThrottle);
    // traffic or a cruiser dead ahead in our lens and slower: ease off (the hazard says how hard)
    const hz = r.session?.traffic?.brakeFor(r, this.wantMode) || r.session?.police?.brakeFor(r, this.wantMode);
    if (hz) {
      ctl.throttle = Math.min(ctl.throttle, hz.throttle);
      ctl.brake = Math.max(ctl.brake, hz.brake);
    }
    // stuck facing the wrong way: a three-point turn, reversing with the wheel one way, then driving out
    if (this.turn > 0) {
      this.turn -= dt;
      // never reverse toward an open edge: near one, just drive out at full lock toward the middle
      const edge = r.track && Math.abs(r.track.lat) > P.halfW * 0.6;
      const rev = this.turn > 0.6 && !edge;
      if (edge) this.turnDir = clamp(-err * 9, -1, 1) || 1;
      ctl.throttle = rev ? 0 : 1;
      ctl.brake = rev ? 1 : 0;
      ctl.steer = rev ? -this.turnDir : this.turnDir;
    } else if (Math.abs(err) > 1.4 && r.speed < 6) {
      this.turn = 1.5;
      this.turnDir = Math.sign(-err) || 1;
    } else if (Math.abs(err) > 2 && r.speed > 6 && r.track) {
      // driving back down the road at speed (spun round by a hit, then lined up backwards by a rail): the aim point
      // is behind us, and the short way round to it can be into the rail, which lines us up backwards again, so a
      // rival would grind down the rail at full throttle until it dropped into a gap. Brake, and swing round
      // through the middle of the road instead.
      const along = r.vel.x * P.thx[pi] + r.vel.z * P.thz[pi];
      if (along < -2) {
        // (facing back down the road, negative steer turns the nose toward +lat)
        ctl.steer = r.track.lat < 0 ? -1 : 1;
        ctl.throttle = r.speed > 16 ? 0 : 0.6;
        ctl.brake = r.speed > 16 ? 1 : 0;
      }
    }
  }

  // Metres of a branch that only one lens can drive.
  singleLen(b) {
    if (b._single === undefined) {
      let n = 0;
      for (let i = 0; i < b.N; i++) if (!solidIn(b.mask[i], BOTH)) n++;
      b._single = n * b.ds;
    }
    return b._single;
  }

  // The form a route needs (formroutes.js): RED for a wall-run or a slit, BLUE for a glide gap, else null.
  formOf(b) {
    if (b._form === undefined) {
      const slit = this.world.slits?.some((s) => s.path === b);
      b._form = b.wallrun || slit ? RED : b.glide ? BLUE : null;
    }
    return b._form;
  }

  // Can we hold a lens all the way along it? Running dry halfway over a lens-only road drops you through it.
  canTakeBranch(b) {
    const r = this.r;
    const form = this.formOf(b);
    if (form) {
      // a form route drains on the way in (and a slit or glide gap all the way): keep a good half bar for it
      if (r.mono) return r.mode === form || r.energy >= SHIFT.monoCost * 2;
      return r.energy >= 0.45;
    }
    const len = this.singleLen(b);
    if (!len) return true;
    if (r.mono) {
      const m = b.mask[Math.floor(b.N / 2)];
      return solidIn(m, r.mode) || r.energy >= SHIFT.monoCost * 2;
    }
    // a lens-only road doesn't drain SHIFT (see Racer.updateEnergy): we only need enough to shift in and hold the
    // lens up to the fork
    return r.energy >= SHIFT.minToShift + 0.15;
  }

  wantsBranch(b) {
    // a route that says it's shut to this car right now (DROP TOWER's spring, stretched)
    if (b.shut?.(this.r)) return false;
    if (b.def?.closed) return false; // (a road that's shut just now: QUARTER TURN's fast lines)
    if (!this.canTakeBranch(b)) return false;
    if (b.def?.must) return true; // (the road past it is shut: QUARTER TURN's gaps)
    // (TOPPLE RUN: whether a lane is a maze, a wave or flat road right now)
    const keen = this.world.dominoes?.branchChance(b, this.r);
    if (keen != null) return Math.random() < keen;
    // (aiTake: a route too thin for a crowd asks for fewer takers)
    return Math.random() < (0.35 + this.skill * 0.5) * (b.aiTake ?? 1);
  }
}

const _f = {};
