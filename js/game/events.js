// The event runner: a short challenge on a course or a strip of one, with a goal, a clock, a way to fail and three
// medal tiers. SHIFT SCHOOL's drills (school.js) and SHIFT TOUR's events (tour.js) are both just defs for it.
//
// def: {
//   id, title, blurb,
//   course,                       a track id (tracks.js)
//   laps: 1,                      for a lap goal; or
//   strip: { from: u, to: u },    a stretch of the main loop (u: 0..1 of the lap). The run ends on crossing `to`.
//   start: { u, lat, speed, mode, energy },   where the craft starts (lat: -1..1 of the road), how fast, in which lens
//   rivals: 0..5,                 rivals start round you
//   hazards: false,               the course's traffic, police, works, quake and storms (off unless true)
//   charges: false,               SEAM CHARGES from the prism gates
//   goal: { kind, stat, target, time },
//       'reach'    get to the strip's end / the flag. value: seconds (lower wins). Fails after goal.time if set.
//       'time'     the same over laps.
//       'count'    count `stat` until goal.time runs out, the strip ends or the laps are done. value: the count
//                  (higher wins). Ends early on gold.
//       'survive'  stay in one piece. value: seconds survived (higher wins); the run ends at gold.
//   rules: { lens: [modes allowed], minSpeed, maxFalls, need: stat },   need: the run only counts if `stat` is 1+ at the end
//   medals: [bronze, silver, gold],
//   twist: { id, ...params },     a handler from TWISTS: start(race, ev), update(race, ev, dt) -> 'fail' | void, end(race, ev)
// }
//
// stats a count goal can name: any kind race.onMove(r, kind, data) reports for the player (phase, lensRoute, wallRun,
// glide, slit, pad, takedown, perfect, drift, shard), any field of race.stats (shifts, phased, crashes, wrecks,
// takedowns), and the runner's own: 'route' (any form route driven end to end), 'route.slit', 'route.glide',
// 'route.wallRun', 'charge' (SEAM CHARGES fired), 'turbo' (drift turbos), 'turbo3' (PRISM turbos), 'falls', 'hull' (hull left, 0..100).

import * as THREE from '../../vendor/three.js';
import { storage, clamp } from '../core/util.js';
import { BOTH, RED, BLUE } from '../world/shift.js';
import { trackById } from '../world/tracks.js';
import { RaceAI } from '../vehicles/ai.js';

export const TWISTS = {};
export function registerTwist(id, handler) {
  TWISTS[id] = handler;
}

const HIGHER = { count: true, survive: true };
const NEED = { 'route.slit': 'TAKE THE SLIT', 'route.glide': 'TAKE THE GLIDE GAP', 'route.wallRun': 'TAKE THE WALL RUN', route: 'TAKE THE FORM ROUTE' };
const KEY = (id) => `rs.event.${id}`;
export const eventBest = (id) => storage.get(KEY(id), null); // { value, tier }

// The course def an event runs on: hazards stripped unless the event wants them.
export function eventCourse(def) {
  const base = trackById(def.course);
  if (def.hazards) return base;
  const { chase, traffic, works, quake, storms, ...rest } = base;
  return { ...rest, noStorms: true };
}

// The tier a value earns: 0 none, 1 bronze, 2 silver, 3 gold.
export function tierFor(def, value) {
  const hi = HIGHER[def.goal.kind];
  let t = 0;
  def.medals.forEach((m, k) => {
    if (hi ? value >= m : value <= m) t = k + 1;
  });
  return t;
}

const _v = new THREE.Vector3();

export class EventRun {
  constructor(race, def) {
    this.race = race;
    this.def = def;
    this.goal = def.goal;
    this.rules = def.rules || {};
    this.t = 0; // seconds since GO
    this.counts = {};
    this.falls = 0;
    this.slowT = 0;
    this.failed = false;
    this.done = false;
    this.value = 0;
    this.tier = 0;
    this.reason = '';
    this.started = false;
    race.event = this;
    const p = race.player;
    this.place(p, def.start || {});
    this.placeRivals(def.start || {});
    // straight to the countdown: no fly-by
    race.introT = 9;
    // (the prism gates are only laid in a race with rivals, so a charges event needs some)
    if (!def.charges) race.items.on = false;
    const use = race.items.use.bind(race.items);
    race.items.use = (r) => {
      if (r === p && r.item) this.bump('charge');
      use(r);
    };
    // the runner counts laps itself, so the race never calls its own finish (no course records, no ghosts)
    race.laps = 99;
    // the lens rules: a lens the event doesn't allow can't be shifted to
    const lens = this.rules.lens;
    if (lens) {
      const can = p.canShift.bind(p);
      p.canShift = (m) => lens.includes(m) && can(m);
    }
    // listen to the race: falls, moves, drift turbos
    const fell = race.onFell.bind(race);
    race.onFell = (r) => {
      if (r === p && r.respawnT <= 0 && !this.done) {
        this.falls++;
        this.bump('falls');
      }
      fell(r);
    };
    const move = race.onMove?.bind(race);
    race.onMove = (r, kind, data) => {
      move?.(r, kind, data);
      if (r === p) this.bump(kind);
    };
    const turbo = race.onMiniTurbo.bind(race);
    race.onMiniTurbo = (r, lvl) => {
      turbo(r, lvl);
      if (r === p) {
        this.bump('turbo');
        if (lvl === 3) this.bump('turbo3');
      }
    };
    this.routeOn = null;
    TWISTS[def.twist?.id]?.start?.(race, this);
  }

  place(r, s) {
    const W = this.race.world;
    const m = W.main;
    const u = s.u ?? this.def.strip?.from ?? 0;
    const i = m.index(u);
    const pos = m.point(i, (s.lat ?? 0) * m.halfW * 0.8, 0.3, new THREE.Vector3());
    r.reset(pos, Math.atan2(m.thx[i], m.thz[i]));
    r.hints[m.id] = i;
    r.hints._cur = m.id;
    r.grounded = true;
    r.lastU = m.mainU(i);
    r.prog = r.lastU;
    r.lap = 0;
    if (s.mode !== undefined) r.mode = s.mode;
    if (s.energy !== undefined) r.energy = s.energy;
    if (r === this.race.player) {
      this.startProg = r.prog;
      this.race.cam.snap(r);
      this.race.app.audio.setMode(r.mode, true);
      this.race.env.setMode(r.mode);
    }
  }

  placeRivals(s) {
    const R = this.race;
    const u0 = s.u ?? this.def.strip?.from ?? 0;
    let k = 0;
    for (const r of R.racers) {
      if (r === R.player) continue;
      // a staggered pack just ahead of you, alternating sides
      this.place(r, { u: (u0 + 0.004 + k * 0.003) % 1, lat: k % 2 ? 0.5 : -0.5 });
      k++;
    }
  }

  bump(stat, n = 1) {
    this.counts[stat] = (this.counts[stat] || 0) + n;
  }

  stat(name) {
    const R = this.race;
    if (name === 'hull') return Math.round(R.player.hp);
    if (name in this.counts) return this.counts[name];
    if (name in R.stats) return R.stats[name];
    return 0;
  }

  // metres-worth of the strip still to go, as a fraction of the lap
  stripLeft() {
    const S = this.def.strip;
    if (!S) return Infinity;
    const len = (S.to - S.from + 1) % 1 || 1;
    return len - (this.race.player.prog - this.startProg);
  }

  update(dt) {
    const R = this.race;
    if (this.done) return;
    const p = R.player;
    if (R.state !== 'race') return;
    if (!this.started) {
      this.started = true;
      const sp = this.def.start?.speed;
      if (sp) p.vel.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)).multiplyScalar(sp);
    }
    this.t += dt;
    this.watchRoutes(p);
    // the rules
    const r = this.rules;
    if (r.maxFalls !== undefined && this.falls > r.maxFalls) return this.end(false, 'TOO MANY FALLS');
    if (r.minSpeed && this.t > 3 && p.respawnT <= 0) {
      this.slowT = p.speed < r.minSpeed ? this.slowT + dt : 0;
      if (this.slowT > 2.5) return this.end(false, 'TOO SLOW');
    }
    if (TWISTS[this.def.twist?.id]?.update?.(R, this, dt) === 'fail') return this.end(false, this.reason || 'FAILED');
    const G = this.goal;
    const atEnd = this.def.strip ? this.stripLeft() <= 0 : p.lap >= (this.def.laps ?? 1);
    const gold = this.def.medals[2];
    switch (G.kind) {
      case 'reach':
      case 'time':
        this.value = this.t;
        if (atEnd && r.need && !this.stat(r.need)) return this.end(false, NEED[r.need] || 'MISSED IT');
        if (atEnd) return this.end(true);
        if (G.time && this.t > G.time) return this.end(false, 'OUT OF TIME');
        break;
      case 'count':
        this.value = this.stat(G.stat);
        if (this.value >= gold || atEnd || (G.time && this.t >= G.time)) return this.end(true);
        break;
      case 'survive':
        this.value = this.t;
        if (p.hp <= 0 || this.stat('wrecks') > 0) return this.end(true, 'WRECKED');
        if (this.t >= gold || atEnd) return this.end(true);
        break;
    }
  }

  // A form route driven end to end: on a branch with a wall run, glide gap or slit, from its first fifth to its last
  watchRoutes(p) {
    const tr = p.track;
    const P = tr?.path;
    if (!P || P.closed || !(P.wallrun || P.glide || P.slit)) {
      if (this.routeOn && P?.closed) this.routeOn = null;
      return;
    }
    if (tr.i < P.N * 0.2) this.routeOn = P;
    else if (this.routeOn === P && tr.i > P.N * 0.85 && p.grounded) {
      this.routeOn = null;
      this.bump('route');
      this.bump(P.wallrun ? 'route.wallRun' : P.glide ? 'route.glide' : 'route.slit');
    }
  }

  end(ok, reason = '') {
    if (this.done) return;
    const R = this.race;
    const p = R.player;
    this.done = true;
    this.failed = !ok;
    this.reason = reason;
    if (this.goal.kind === 'count') this.value = this.stat(this.goal.stat);
    this.tier = ok ? tierFor(this.def, this.value) : 0;
    TWISTS[this.def.twist?.id]?.end?.(R, this);
    const best = eventBest(this.def.id);
    const hi = HIGHER[this.goal.kind];
    this.newBest = ok && (!best || (hi ? this.value > best.value : this.value < best.value));
    if (this.newBest && !R.opts.autopilot) storage.set(KEY(this.def.id), { value: this.value, tier: Math.max(this.tier, best?.tier || 0) });
    else if (best && this.tier > best.tier && !R.opts.autopilot) storage.set(KEY(this.def.id), { ...best, tier: this.tier });
    // the run ends here: the AI takes the craft on, and the results come up
    p.finished = true;
    p.finishTime = R.raceTime;
    if (!p.ai) p.ai = new RaceAI(p, R.world, 0.6);
    R.state = 'finished';
    R.app.audio.play('finish', this.tier > 0 ? 1 : 0);
    if (this.tier === 3) R.app.audio.announce('gold', 0.4);
    R.emitP(p, 'popup', { text: this.failed ? reason || 'FAILED' : ['DONE', 'BRONZE', 'SILVER', 'GOLD'][this.tier], color: ['#d8c8ff', '#e08a4a', '#d8e0f0', '#ffd04a'][this.tier] });
  }

  // What the HUD shows: { title, goal, value, target, timeLeft, tier, failed }
  hud() {
    const G = this.goal;
    const hi = HIGHER[G.kind];
    // the next medal still to earn (or gold when it's held)
    const tier = this.done ? this.tier : tierFor(this.def, this.value);
    const nextT = hi ? Math.min(2, tier) : null;
    const target = hi ? this.def.medals[nextT] : this.def.medals[2];
    let timeLeft = null;
    if (G.time) timeLeft = Math.max(0, G.time - this.t);
    else if (G.kind === 'survive') timeLeft = Math.max(0, this.def.medals[2] - this.t);
    return { title: this.def.title, goal: this.def.blurb, value: this.value, target, timeLeft, tier, failed: this.failed, kind: G.kind };
  }
}

export const LENS_NAME = { [BOTH]: 'BOTH', [RED]: 'RED', [BLUE]: 'BLUE' };
export { clamp };
