// The police chase: once a lap, sirens come up behind you, a getaway coupe tears past with three cruisers on its
// tail, and the chase settles into the field ahead of you so you have to drive through it. Cruisers fire bursts of
// laser shots (each impact telegraphed by closing rings, like the storms), swerve to ram whoever's beside them,
// rivals included, and the getaway driver shoots back: a cruiser that takes too many hits comes apart and tumbles
// off the road. The whole chase is an OVERLAP thing (M.X): it exists in BOTH only, so the one way to dodge it is to
// hold a single lens, draining SHIFT, while that lens's holes in the road wait for you. It leaves the course at a
// set point (straight off the open edge) and is back next lap.

import * as THREE from '../../vendor/three.js';
import { M, BOTH, COLORS, solidIn } from '../world/shift.js';
import { Kit, Fleet, TAG, trap, placeOnPath, hitRacer, scratchOf, nearPlayer, lines, tmpV as _v } from './hazards.js';
import { Telegraph } from './hazards.js';

const _d = new THREE.Vector3();
const _c = new THREE.Color();
const GHOST = 0.14;
const PACE = 64;
const CRUISE = 0.64; // of race pace, once the chase has settled into the field
const SHOT = { warn: 0.72, radius: 3.6, color: 0xff6ab0 };
const LANES = [-0.6, -0.3, 0, 0.3, 0.6];
const GAPS = [13, 25, 37]; // metres each cruiser hangs behind the getaway
const OFFS = [-4.5, 4.5, 0]; // and to the side of its line

// The getaway coupe: low and wide, a wing on struts, hot pink from behind (a wide tail bar and a spill of pink on
// the road) so it reads as the one to follow.
function getawayTpl() {
  const K = new Kit();
  K.loft([trap(-2.3, 0.95, 0.5, 0.28, 0.9), trap(-1.6, 1.0, 0.6, 0.25, 0.95), trap(-1.0, 1.0, 1.05, 0.25, 0.72), trap(0.4, 1.0, 1.05, 0.25, 0.72), trap(1.0, 1.0, 0.6, 0.25, 0.95), trap(2.3, 0.9, 0.4, 0.3, 0.9)]);
  for (const s of [-1, 1]) {
    K.seg([s * 0.86, 0.85, -1.0], [s * 0.86, 0.85, 0.4], TAG.glass);
    // the rear wing on two struts
    K.seg([s * 1.05, 1.15, -2.0], [s * 1.05, 1.15, -1.6], TAG.stripe);
    K.seg([s * 0.9, 0.78, -1.9], [s * 0.9, 1.15, -1.9], TAG.stripe);
    // a racing stripe down each flank
    K.seg([s * 1.0, 0.62, -2.2], [s * 1.0, 0.62, 2.1], TAG.stripe);
    K.lampGlow(s * 0.55, 0.52, 2.31, 0.24, 1, TAG.head, 0.7);
    K.cone(s * 0.55, 0.5, 2.3, 10, 1.5, TAG.head, 0.035);
    K.lampGlow(s * 0.6, 0.6, -2.31, 0.3, -1, TAG.tail, 0.8);
  }
  K.seg([-1.05, 1.15, -1.8], [1.05, 1.15, -1.8], TAG.stripe);
  K.seg([0, 1.3, 0.4], [0, 0.85, 1.0], TAG.glass);
  K.seg([0, 1.3, -1.0], [0, 0.85, -1.6], TAG.glass);
  K.seg([-0.3, 0.6, -2.31], [0.3, 0.6, -2.31], TAG.tail);
  K.glowQuad([-1.3, 0.05, -2.5], [1.3, 0.05, -2.5], [0.9, 0.05, -5.5], [-0.9, 0.05, -5.5], TAG.tail, 0.1);
  K.glowQuad([-1.3, 0.06, -2.6], [1.3, 0.06, -2.6], [1.3, 0.06, 2.6], [-1.3, 0.06, 2.6], TAG.under, 0.14);
  return K.build({ w: 1.05, len: 2.4, h: 1.35 });
}
// A cruiser: white body, a violet livery band down the doors and across the boot, a push bar, and the light bar
// on the roof. The bar is what has to read from behind at speed: each half carries a halo above, a lamp facing
// back, a pillar of light standing up from it and a halo on the road under the car, all flashing with it.
function cruiserTpl() {
  const K = new Kit();
  K.loft([trap(-2.4, 0.88, 0.58, 0.3, 0.9), trap(-1.5, 0.95, 0.66, 0.25, 0.95), trap(-0.9, 0.95, 1.2, 0.25, 0.76), trap(0.6, 0.95, 1.2, 0.25, 0.76), trap(1.2, 0.95, 0.7, 0.25, 0.95), trap(2.4, 0.86, 0.5, 0.3, 0.9)]);
  for (const s of [-1, 1]) {
    K.seg([s * 0.83, 0.95, -0.9], [s * 0.83, 0.95, 0.6], TAG.glass);
    // the livery: a band along the doors, a chevron back from the rear wheel
    K.seg([s * 0.96, 0.72, -1.4], [s * 0.96, 0.72, 1.3], TAG.stripe);
    K.seg([s * 0.96, 0.52, -1.4], [s * 0.96, 0.52, 1.3], TAG.stripe);
    K.seg([s * 0.96, 0.72, -1.4], [s * 0.9, 0.52, -2.0], TAG.stripe);
    K.lampGlow(s * 0.52, 0.6, 2.41, 0.22, 1, TAG.head, 0.6);
    K.cone(s * 0.52, 0.55, 2.4, 10, 1.5, TAG.head, 0.035);
    K.lampGlow(s * 0.55, 0.7, -2.41, 0.22, -1, TAG.tail, 0.3);
    // push bar uprights
    K.seg([s * 0.6, 0.3, 2.55], [s * 0.6, 0.95, 2.55]);
    // the light bar half: its box, a halo above, a lamp facing back, a pillar of light up from it
    const tag = s < 0 ? TAG.barL : TAG.barR;
    K.box(0.36, 0.14, 0.22, s * 0.38, 1.47, -0.15, tag, false);
    K.glowQuad([s * 0.02, 1.76, -0.75], [s * 1.0, 1.76, -0.75], [s * 1.0, 1.76, 0.4], [s * 0.02, 1.76, 0.4], tag, 0.22);
    K.glowQuad([s * 0.02, 1.2, -0.42], [s * 1.05, 1.2, -0.42], [s * 1.05, 2.0, -0.42], [s * 0.02, 2.0, -0.42], tag, 0.26);
    K.glowQuad([s * 0.02, 1.2, 0.1], [s * 1.05, 1.2, 0.1], [s * 1.05, 2.0, 0.1], [s * 0.02, 2.0, 0.1], tag, 0.18);
    K.glowQuad([s * 0.08, 1.5, -0.15], [s * 0.7, 1.5, -0.15], [s * 0.7, 6.5, -0.15], [s * 0.08, 6.5, -0.15], tag, 0.07);
    K.glowQuad([s * 0.39, 1.5, -0.5], [s * 0.39, 1.5, 0.2], [s * 0.39, 6.5, 0.2], [s * 0.39, 6.5, -0.5], tag, 0.07);
    // the road halo for this half's flash
    K.glowQuad([s * 0.1, 0.05, -4.0], [s * 3.2, 0.05, -4.0], [s * 3.2, 0.05, 3.4], [s * 0.1, 0.05, 3.4], TAG.halo, 0.2);
  }
  K.seg([0, 1.45, 0.6], [0, 0.95, 1.2], TAG.glass);
  K.seg([0, 1.45, -0.9], [0, 0.91, -1.5], TAG.glass);
  K.seg([-0.6, 0.5, 2.55], [0.6, 0.5, 2.55]);
  K.seg([-0.6, 0.85, 2.55], [0.6, 0.85, 2.55]);
  // the band across the boot
  K.seg([-0.85, 0.72, -2.3], [0.85, 0.72, -2.3], TAG.stripe);
  K.glowQuad([-1.2, 0.06, -2.6], [1.2, 0.06, -2.6], [1.2, 0.06, 2.6], [-1.2, 0.06, 2.6], TAG.under, 0.08);
  return K.build({ w: 1.0, len: 2.55, h: 1.6 });
}
let TPL = null;

export class Police {
  constructor(race) {
    this.race = race;
    this.group = new THREE.Group();
    this.cars = [];
    this.strikes = [];
    this.bolts = [];
    this.on = false;
    this.state = 'idle';
    const def = race.def.chase;
    if (!def || race.tutorial || race.online) return;
    this.on = true;
    TPL ||= { getaway: getawayTpl(), cruiser: cruiserTpl() };
    this.def = def;
    this.path = race.world.main;
    const white = new THREE.Color(0xffffff);
    const mk = (body, glass, stripe, tail, k) => {
      const pal = [];
      // (the coloured lines are pushed over the bloom threshold like the traffic; white blooms on its own, so the
      // cruiser body is held back and its livery and bar carry the glow)
      pal[TAG.body] = new THREE.Color(body).multiplyScalar(k);
      pal[TAG.glass] = new THREE.Color(glass).multiplyScalar(k * 0.8);
      pal[TAG.stripe] = new THREE.Color(stripe);
      pal[TAG.head] = white.clone().multiplyScalar(1.5);
      pal[TAG.tail] = new THREE.Color(tail).multiplyScalar(1.6);
      pal[TAG.under] = new THREE.Color(body);
      pal[TAG.barL] = new THREE.Color(COLORS.redHot);
      pal[TAG.barR] = new THREE.Color(COLORS.blueHot);
      pal[TAG.marker] = pal[TAG.tail];
      return pal;
    };
    this.pal = {
      getaway: mk(COLORS.pink, 0xffd0f4, new THREE.Color(0xffffff).multiplyScalar(1.6), COLORS.pink, 2.0),
      cruiser: mk(COLORS.white, 0xb8e4ff, new THREE.Color(COLORS.violet).multiplyScalar(2.4), 0xff2030, 0.7),
    };
    this.dim = { L: new THREE.Color(0xff2a4a).multiplyScalar(0.12), R: new THREE.Color(0x1e8cff).multiplyScalar(0.12) };
    this.lit = { L: new THREE.Color(0xff3a5a).multiplyScalar(2.0), R: new THREE.Color(0x3aa0ff).multiplyScalar(2.0) };
    let segs = 0, tris = 0, glows = 0;
    for (let k = 0; k < 4; k++) {
      const kind = k === 0 ? 'getaway' : 'cruiser';
      const tpl = TPL[kind];
      this.cars.push({
        kind, k: k - 1, tpl, path: this.path, mask: M.X, type: 'cruiser', sweep: 0, w: tpl.w, len: tpl.len, h: tpl.h,
        s: 0, i: 0, lat: 0, speed: 0, alpha: 0, lift: 0, liftV: 0, roll: 0, yawOff: 0, life: 'off',
        pos: new THREE.Vector3(), m: new THREE.Matrix4(), thx: 0, thz: 1, rx: 1, rz: 0, y: 0,
        gunT: 0, burst: [], ramT: 0, ramHold: 0, ramAt: null, flinch: 0, flinchDir: 1, hits: 0, offT: 0,
      });
      segs += tpl.segs;
      tris += tpl.tris;
      glows += tpl.glows;
    }
    this.getaway = this.cars[0];
    this.cruisers = this.cars.slice(1);
    this.fleet = new Fleet(segs, tris, glows);
    this.group.add(this.fleet.group);
    this.scratch = {};
    this.prevD = -1;
    this.stats = { shot: 0, near: 0, ram: 0, rear: 0, runs: 0 }; // (playtests read these)
    this.sirenT = 0;
    this.hi = false;
    this.t = 0;
  }

  get active() {
    return this.state !== 'idle';
  }

  // ---------------------------------------------------------------- the AI reads it
  near(P, pi, n) {
    if (!this.active || P !== this.path) return NONE;
    const out = [];
    for (const c of this.cars) {
      if (c.alpha < 0.3 || c.life !== 'run') continue;
      let d = c.i - pi;
      if (d < -P.N / 2) d += P.N;
      if (d > P.N / 2) d -= P.N;
      if (d >= -2 && d <= n) out.push(c);
    }
    return out;
  }
  // Is this racer in the thick of the chase in lens m? (only BOTH has it)
  threat(r, m) {
    if (!this.active || m !== BOTH || r.track?.path !== this.path) return false;
    for (const c of this.cars) {
      if (c.life !== 'run') continue;
      const dx = c.pos.x - r.pos.x;
      const dz = c.pos.z - r.pos.z;
      const along = dx * c.thx + dz * c.thz;
      if (along > -25 && along < 75) return true;
    }
    return false;
  }
  brakeFor(r, m) {
    if (!this.active || !solidIn(M.X, m) || r.track?.path !== this.path) return null;
    for (const c of this.cars) {
      if (c.alpha < 0.3 || c.life !== 'run') continue;
      const dx = c.pos.x - r.pos.x;
      const dz = c.pos.z - r.pos.z;
      const along = dx * c.thx + dz * c.thz;
      if (along < 0 || along > 12 + r.speed * 0.5) continue;
      if (Math.abs(dx * c.rx + dz * c.rz) > c.w + r.halfW + 0.7) continue;
      const closing = r.speed - c.speed;
      if (closing < 4) continue;
      return { throttle: 0.15, brake: along < 8 + closing * 0.3 ? 0.6 : 0 };
    }
    return null;
  }

  // ---------------------------------------------------------------- the set piece
  // Sirens behind the player: the convoy fades in 110 m back, well over race pace, and charges through.
  spawn(p) {
    const P = this.path;
    const pi = p.track?.path === P ? p.track.i : P.nearest(p.pos.x, p.pos.z, -1);
    const v = Math.max(62, p.speed + 24);
    this.state = 'charge';
    this.stats.runs++;
    this.runT = 0;
    this.lost = false;
    this.trigger = p;
    this.cars.forEach((c, k) => {
      c.s = pi - (110 + (k ? GAPS[k - 1] : 0)) / P.ds;
      c.lat = k ? OFFS[k - 1] * 0.6 : 0;
      c.speed = v;
      c.alpha = 0;
      c.lift = c.liftV = c.roll = c.yawOff = 0;
      c.life = 'run';
      c.gunT = 1.2 + k * 0.5;
      c.burst.length = 0;
      c.ramT = 4 + k * 1.5;
      c.ramHold = 0;
      c.hits = 0;
      c.flinch = 0;
      placeOnPath(c, P);
    });
    if (p.isPlayer) this.race.emitP(p, 'popup', { text: 'POLICE CHASE', color: '#b04cff' });
  }

  // The nearest clear line to `want` over the next stretch: round the blocks (everything solid in BOTH), round
  // slower racers unless we mean to hit one, and not on top of the rest of the convoy.
  clearLat(c, want, target = null) {
    const P = this.path;
    const w = this.race.world;
    const hw = P.halfW;
    const cands = [want, ...LANES.map((f) => f * hw).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))];
    const wrapD = (d) => (d > P.N / 2 ? d - P.N : d < -P.N / 2 ? d + P.N : d);
    for (const lat of cands) {
      let ok = true;
      for (const o of w.obstacles) {
        if (o.path !== P || o.broken || !solidIn(o.mask, BOTH)) continue;
        const d = wrapD(o.i - c.s) * P.ds;
        if (d < -3 || d > 55) continue;
        if (Math.abs(o.lat - lat) < o.w + c.w + 0.7) {
          ok = false;
          break;
        }
      }
      if (ok) for (const r of this.race.racers) {
        if (r === target || r.respawnT > 0 || r.mode !== BOTH || r.track?.path !== P) continue;
        const dx = r.pos.x - c.pos.x;
        const dz = r.pos.z - c.pos.z;
        const along = dx * c.thx + dz * c.thz;
        if (along < -2 || along > 36 || r.speed > c.speed + 2) continue;
        if (Math.abs(r.track.lat - lat) < r.halfW + c.w + 0.9) {
          ok = false;
          break;
        }
      }
      if (ok) for (const o of this.cars) {
        if (o === c || o.life !== 'run') continue;
        const d = wrapD(o.s - c.s) * P.ds;
        if (Math.abs(d) < 9 && Math.abs(o.lat - lat) < 2.6 && Math.abs(o.lat - c.lat) >= 2.6) {
          ok = false;
          break;
        }
      }
      if (ok) return lat;
    }
    return want;
  }

  update(dt, viewer) {
    if (!this.on) return;
    const R = this.race;
    const P = this.path;
    const p = R.player;
    this.t += dt;
    this.viewer = viewer;
    for (const r of R.racers) r.copCd = Math.max(0, (r.copCd || 0) - dt);
    // once a lap, as the player crosses the trigger
    if (this.state === 'idle') {
      let d = p.lastU - this.def.at;
      if (d > 0.5) d -= 1;
      if (d < -0.5) d += 1;
      if (this.prevD < 0 && d >= 0 && d < 0.05 && R.state === 'race' && !p.finished && p.respawnT <= 0) this.spawn(p);
      this.prevD = d;
    }
    if (this.state !== 'idle') this.drive(dt);
    this.shots(dt);
    this.siren(dt, p);
    this.render(viewer.mode);
  }

  drive(dt) {
    const R = this.race;
    const P = this.path;
    const hw = P.halfW;
    const G = this.getaway;
    this.runT += dt;
    // the charge is over once the getaway is well past the player who set it off (or it's taken long enough)
    if (this.state === 'charge') {
      const tr = this.trigger;
      const dx = G.pos.x - tr.pos.x;
      const dz = G.pos.z - tr.pos.z;
      if (dx * G.thx + dz * G.thz > 95 || this.runT > 10) this.state = 'run';
    }
    const cruise = PACE * CRUISE;
    // time to leave: the exit point, or it's been long enough
    if (this.state !== 'exit') {
      let d = (G.i / P.N) - this.def.out;
      if (d > 0.5) d -= 1;
      if (d < -0.5) d += 1;
      if ((d >= 0 && d < 0.04) || this.runT > 48) {
        this.state = 'exit';
        this.exitSide = Math.random() < 0.5 ? -1 : 1;
        this.cars.forEach((c, k) => (c.offT = k * 0.35));
      }
    }
    let live = 0;
    for (const c of this.cars) {
      if ((c.life === 'off' || c.life === 'dead') && c.alpha <= 0) continue;
      live++;
      if (c.alpha < 1 && c.life === 'run' && this.state !== 'exit') c.alpha = Math.min(1, c.alpha + dt / 0.5);
      // where it wants to be
      let wantLat;
      let wantV;
      if (c === G) {
        wantV = this.state === 'charge' ? c.speed : cruise + Math.sin(this.runT * 0.9) * 5;
        wantLat = this.clearLat(c, Math.sin(this.runT * 0.75 + 1) * hw * 0.45);
      } else {
        // formation on the getaway, closing up when it's dropped behind
        const gap = GAPS[c.k];
        let d = G.s - c.s;
        if (d < -P.N / 2) d += P.N;
        if (d > P.N / 2) d -= P.N;
        const err = d * P.ds - gap;
        wantV = G.speed + Math.max(-12, Math.min(18, err * 0.7));
        wantLat = G.lat * 0.5 + OFFS[c.k];
        // a ram: swing onto whoever is beside us and hold it there
        c.ramT -= dt;
        c.ramHold -= dt;
        if (c.ramHold <= 0) c.ramAt = null;
        if (c.ramT <= 0 && this.state === 'run' && c.life === 'run') {
          c.ramT = 3.5 + Math.random() * 3;
          for (const r of R.racers) {
            if (r.respawnT > 0 || r.mode !== BOTH || r.track?.path !== P) continue;
            const dx = r.pos.x - c.pos.x;
            const dz = r.pos.z - c.pos.z;
            const along = dx * c.thx + dz * c.thz;
            if (Math.abs(along) < 14 && Math.abs(dx * c.rx + dz * c.rz) < 8) {
              c.ramAt = r;
              c.ramHold = 1.4;
              break;
            }
          }
        }
        if (c.ramAt && c.ramAt.respawnT <= 0 && c.ramAt.mode === BOTH) {
          const r = c.ramAt;
          const dx = r.pos.x - c.pos.x;
          const dz = r.pos.z - c.pos.z;
          wantLat = c.lat + dx * c.rx + dz * c.rz;
          const vr = r.vel.x * c.thx + r.vel.z * c.thz;
          wantV = Math.max(cruise - 10, Math.min(cruise + 26, vr + (dx * c.thx + dz * c.thz) * 0.8));
        } else wantLat = this.clearLat(c, wantLat);
        if (c.flinch > 0) {
          c.flinch -= dt;
          wantLat += c.flinchDir * 2.5;
          wantV -= 6;
        }
      }
      if (c.life === 'dead') {
        wantV = c.speed - 10 * dt;
        wantLat = c.lat + c.flinchDir * 9 * dt;
        c.roll += dt * 3 * c.flinchDir;
        c.yawOff += dt * 1.5 * c.flinchDir;
      }
      // leaving: straight off the open edge, falling and rolling into the void
      if (this.state === 'exit' && c.life !== 'dead') {
        c.offT -= dt;
        if (c.offT <= 0) {
          c.life = 'off';
          wantLat = this.exitSide * (hw + 30);
        }
      }
      if (c.life === 'off' || (c.life === 'dead' && Math.abs(c.lat) > hw + 1)) {
        if (Math.abs(c.lat) > hw + 1.5) {
          c.liftV -= 24 * dt;
          c.lift += c.liftV * dt;
          c.roll += dt * 2.2 * Math.sign(c.lat);
          c.alpha = Math.max(0, c.alpha - dt / 1.1);
        }
      }
      const rate = c.life === 'off' ? 12 : c.ramAt ? 7 : 4.5;
      const dl = Math.max(-rate * dt, Math.min(rate * dt, wantLat - c.lat));
      c.lat += dl;
      if (c.life === 'run') c.yawOff = Math.atan2(dl / Math.max(dt, 1e-3), Math.max(10, c.speed)) * 0.8;
      c.speed += Math.max(-20 * dt, Math.min(16 * dt, wantV - c.speed));
      c.s += (c.speed * dt) / P.ds;
      placeOnPath(c, P);
      // contact with the racers (those in BOTH)
      if (c.alpha > 0.6 && c.life === 'run') for (const r of R.racers) {
        if (r.puppet || r.respawnT > 0 || r.mode !== BOTH) continue;
        const hit = hitRacer(c, r);
        if (hit) this.collide(c, r, hit);
      }
    }
    // the getaway fires back over its shoulder now and then
    this.gbT = (this.gbT || 0) - dt;
    if (this.gbT <= 0 && this.state === 'run' && G.life === 'run') {
      this.gbT = 1.3 + Math.random() * 1.2;
      const up = this.cruisers.filter((c) => c.life === 'run' && c.alpha > 0.6);
      const c = up[Math.floor(Math.random() * up.length)];
      if (c) {
        c.flinch = 0.45;
        c.flinchDir = Math.random() < 0.5 ? -1 : 1;
        c.hits++;
        _v.set(G.pos.x - G.thx * 2.2, G.pos.y + 1, G.pos.z - G.thz * 2.2);
        _d.set(c.pos.x, c.pos.y + 1.2, c.pos.z);
        this.bolt(_v, _d, COLORS.pink, 0.09);
        if (nearPlayer(R, c.pos, 240)) {
          R.debris.sparks(_d, _v.set(0, 0, 0), 10, 0xffb0ff, 12, c.y);
          R.app.audio.play('gun', 0.35 * this.vol(c.pos));
        }
        // one cruiser a lap can take only so much: it comes apart and tumbles off the road
        if (c.hits >= 5 && this.runT > 12 && !this.lost) {
          this.lost = true;
          c.life = 'dead';
          c.flinchDir = Math.random() < 0.5 ? -1 : 1;
          this.shatter(c, 0.45);
        }
      }
    }
    if (!live && this.state === 'exit') {
      this.state = 'idle';
      this.prevD = -1;
    }
  }

  // Volume of something at p for the player: by distance, muffled through a lens (the chase isn't in that world).
  vol(pos) {
    const p = this.race.player;
    return Math.max(0, 1 - p.pos.distanceTo(pos) / 200) * (p.mode === BOTH ? 1 : 0.3);
  }

  collide(c, r, hit) {
    const R = this.race;
    const ram = c.ramAt === r;
    if (hit.side) {
      if (hit.into < 2.5 && !ram) return;
      if (r.copCd > 0) return;
      r.copCd = ram ? 0.6 : 0.3;
      // shoved across the road, but never off an open edge: near the side with no rail the shove only slows you
      const t = r.track;
      const P = t?.path;
      const edge = P && Math.abs(t.lat) > P.halfW - 3 && Math.sign(t.lat) === Math.sign(hit.s) && !(t.lat < 0 ? P.railL[t.i] : P.railR[t.i]);
      const push = edge ? 0 : ram ? 5 : 2.5;
      r.vel.x += c.rx * hit.s * push;
      r.vel.z += c.rz * hit.s * push;
      if (edge) r.vel.multiplyScalar(0.85);
      if (ram) {
        this.stats.ram++;
        r.spinOut(0.55, hit.s);
      }
      R.scrape(r, Math.max(hit.into, ram ? 10 : 4), _d.set(c.rx * hit.s, 0, c.rz * hit.s));
      c.flinch = Math.max(c.flinch, 0.25);
      c.flinchDir = -hit.s;
      if (r.isPlayer) {
        R.app.audio.play('hit');
        R.camOf(r).addShake(ram ? 0.7 : 0.3);
        R.app.input.rumble(r.pIndex || 0, 0.7, 0.5, 220);
        R.stats.crashes++;
        if (ram) R.emitP(r, 'popup', { text: 'RAMMED', color: '#ffffff', small: true });
      }
      return;
    }
    if (hit.into < 3) return;
    const ranInto = hit.s < 0;
    if (ranInto && hit.into > 30 && c.kind === 'cruiser' && c.life === 'run') {
      // straight through the back of a cruiser: it comes apart, and so do you
      c.life = 'dead';
      c.flinchDir = Math.random() < 0.5 ? -1 : 1;
      this.shatter(c, 0.6);
      if (r.isPlayer) R.emitP(r, 'popup', { text: 'CRUISER DOWN', color: '#ffffff', small: true });
      this.stats.rear++;
      R.wreck(r, null);
      return;
    }
    if (ranInto && hit.into > (r.isPlayer ? 25 : 22)) {
      this.stats.rear++;
      R.wreck(r, null);
      c.flinch = 0.5;
      return;
    }
    if (r.copCd > 0) return;
    r.copCd = 0.5;
    const hard = hit.into > 9;
    R.scrape(r, hit.into, _d.set(-c.thx * hit.s, 0, -c.thz * hit.s));
    if (hard) r.spinOut(0.6, Math.random() < 0.5 ? -1 : 1);
    c.flinch = Math.max(c.flinch, hard ? 0.5 : 0.2);
    c.flinchDir = Math.random() < 0.5 ? -1 : 1;
    if (r.isPlayer) {
      R.app.audio.play(hard ? 'hit' : 'scrape');
      R.camOf(r).addShake(hard ? 0.6 : 0.25);
      R.app.input.rumble(r.pIndex || 0, 0.7, 0.5, 200);
      R.stats.crashes++;
      if (hard) R.emitP(r, 'popup', { text: ranInto ? 'CRUISER' : 'RAMMED', color: '#ffffff', small: true });
    }
  }

  // A convoy car breaks into its lines (share of them) and keeps rolling, dying.
  shatter(c, share) {
    const R = this.race;
    if (!nearPlayer(R, c.pos, 260)) return;
    const sc = (this.scratch[c.kind] ||= scratchOf(c.tpl, this.pal[c.kind][TAG.body]));
    sc.matrix.copy(c.m);
    sc.matrixWorld.copy(c.m);
    _v.set(c.thx * c.speed * 0.5, 4, c.thz * c.speed * 0.5);
    R.debris.burst(sc, _v, 14, c.y, share, 2.6);
    R.debris.sparks(c.pos, _d.set(0, 0, 0), 40, 0xffd27a, 26, c.y);
    R.app.audio.play('wreck');
    for (const pl of R.players) R.camOf(pl).addShake(0.5 * this.vol(c.pos));
  }

  // A beam from a to b for a moment: a hot core and a wider glow.
  bolt(a, b, color, life) {
    const core = lines([a.x, a.y, a.z, b.x, b.y, b.z], 0xffffff);
    const glow = lines([a.x + 0.3, a.y, a.z - 0.3, b.x + 0.3, b.y, b.z - 0.3, a.x - 0.3, a.y, a.z + 0.3, b.x - 0.3, b.y, b.z + 0.3], color, 0.6);
    this.group.add(core, glow);
    this.bolts.push({ core, glow, t: life });
  }

  // ---------------------------------------------------------------- the shootout
  shots(dt) {
    const R = this.race;
    const P = this.path;
    for (let k = this.bolts.length - 1; k >= 0; k--) {
      const b = this.bolts[k];
      b.t -= dt;
      b.core.material.opacity = Math.random() < 0.5 ? 1 : 0.5;
      if (b.t <= 0) {
        this.group.remove(b.core, b.glow);
        b.core.geometry.dispose();
        b.glow.geometry.dispose();
        this.bolts.splice(k, 1);
      }
    }
    // (no shooting while they charge past: the shootout starts once the chase has settled in ahead)
    if (this.state === 'run') for (const c of this.cruisers) {
      if (c.life !== 'run' || c.alpha < 0.6) continue;
      // a burst in flight: three shots a beat apart along the target's line
      for (let q = c.burst.length - 1; q >= 0; q--) {
        const b = c.burst[q];
        b.t -= dt;
        if (b.t > 0) continue;
        c.burst.splice(q, 1);
        this.aim(c, b.r, b.n);
      }
      c.gunT -= dt;
      if (c.gunT > 0 || c.burst.length) continue;
      c.gunT = 2.8 + Math.random() * 1.8;
      let best = null;
      let bd = 1e9;
      for (const r of R.racers) {
        if (r.respawnT > 0 || r.mode !== BOTH || r.track?.path !== P || r.finished) continue;
        const dx = r.pos.x - c.pos.x;
        const dz = r.pos.z - c.pos.z;
        const along = dx * c.thx + dz * c.thz;
        if (along < -30 || along > 85) continue;
        const d = Math.abs(along) + (along < 0 ? 20 : 0);
        if (d < bd) {
          bd = d;
          best = r;
        }
      }
      if (best) for (let n = 0; n < 3; n++) c.burst.push({ t: n * 0.14, r: best, n });
    }
    for (let k = this.strikes.length - 1; k >= 0; k--) {
      const s = this.strikes[k];
      s.t += dt;
      s.tele.fx.visible = s.seen;
      s.tele.update(s.t, SHOT.warn);
      // the targeting beam: a thread of light from the cruiser's bar to the spot, firming up as the shot comes
      const c = s.from;
      const lock = !s.hit && c.life === 'run' && c.alpha > 0.5;
      s.beam.visible = lock && s.seen;
      if (lock) {
        const f = s.t / SHOT.warn;
        const P = s.beam.geometry.getAttribute('position');
        P.setXYZ(0, c.pos.x, c.pos.y + 1.6, c.pos.z);
        P.setXYZ(1, s.x, s.y + 0.3, s.z);
        P.needsUpdate = true;
        s.beam.material.opacity = (0.1 + 0.5 * f * f) * (Math.random() < 0.2 ? 0.5 : 1);
      }
      if (!s.hit && s.t >= SHOT.warn) {
        s.hit = true;
        this.land(s);
      }
      if (s.tele.done(s.t, SHOT.warn)) {
        this.group.remove(s.tele.fx, s.beam);
        s.tele.dispose();
        s.beam.geometry.dispose();
        this.strikes.splice(k, 1);
      }
    }
  }

  // Lock on where the target will be when the shot lands, give or take, and mark the spot.
  aim(c, r, n) {
    if (r.respawnT > 0 || this.strikes.length > 24) return;
    const R = this.race;
    // the three shots of a burst walk up the target's line, so holding course finds one of them: a swerve doesn't
    const at = _v.copy(r.pos).addScaledVector(r.vel, SHOT.warn * (0.88 + n * 0.1 + Math.random() * 0.06));
    at.x += (Math.random() - 0.5) * 3;
    at.z += (Math.random() - 0.5) * 3;
    const g = R.world.ground(at.x, r.pos.y + 4, at.z, {}, BOTH);
    const y = g.onRoad ? g.y : r.pos.y;
    const tele = new Telegraph(SHOT.color, 0xffd0e0, 0xff6a8a, SHOT.radius);
    tele.fx.position.set(at.x, y + 0.12, at.z);
    const beam = lines([0, 0, 0, 0, 0, 0], SHOT.color, 0);
    this.group.add(tele.fx, beam);
    this.strikes.push({ x: at.x, y, z: at.z, t: 0, tele, beam, from: c, hit: false, seen: true });
    if (nearPlayer(R, at, 200)) R.app.audio.play('gun', 0.5 * this.vol(c.pos));
  }

  land(s) {
    const R = this.race;
    const c = s.from;
    const at = _v.set(s.x, s.y, s.z);
    if (nearPlayer(R, at, 220)) {
      // the beam from the cruiser's bar to the spot, and the splash
      if (c.life === 'run' && c.alpha > 0.5) this.bolt(_d.set(c.pos.x, c.pos.y + 1.6, c.pos.z), at, SHOT.color, 0.14);
      R.debris.sparks(at, _d.set(0, 0, 0), 36, 0xffa0c0, 22, s.y);
      R.app.audio.play('zap', 0.6 * Math.max(0.2, this.vol(at)));
      for (const pl of R.players) {
        const d = pl.pos.distanceTo(at);
        if (d < 50 && pl.mode === BOTH) R.camOf(pl).addShake(0.35 * (1 - d / 50));
      }
    }
    for (const r of R.racers) {
      if (r.respawnT > 0 || r.mode !== BOTH || Math.abs(r.pos.y - s.y) > 6) continue;
      const d2 = (r.pos.x - s.x) ** 2 + (r.pos.z - s.z) ** 2;
      if (d2 < (SHOT.radius * 0.6) ** 2) {
        if (r.isPlayer) R.emitP(r, 'popup', { text: 'SHOT DOWN', color: '#ff4f7a' });
        this.stats.shot++;
        R.wreck(r, null);
      } else if (d2 < SHOT.radius * SHOT.radius) {
        if (r.spinOut(0.7, Math.random() < 0.5 ? -1 : 1)) r.vel.multiplyScalar(0.65);
        this.stats.near++;
        R.scrape(r, 12, _d.set(r.pos.x - s.x, 0, r.pos.z - s.z).normalize());
        if (r.isPlayer) {
          R.emitP(r, 'popup', { text: 'HIT', color: '#ff4f7a', small: true });
          R.camOf(r).addShake(0.8);
          R.aberr = 1;
        }
      }
    }
  }

  // The wail: two tones swapping, from however far the nearest cruiser is.
  siren(dt, p) {
    const A = this.race.app.audio;
    if (!this.active || !A.ctx || A.ctx.state !== 'running') return;
    this.sirenT -= dt;
    if (this.sirenT > 0) return;
    this.sirenT = 0.46;
    this.hi = !this.hi;
    let best = 1e9;
    for (const c of this.cruisers) if (c.life === 'run' && c.alpha > 0.3) best = Math.min(best, p.pos.distanceTo(c.pos));
    if (best > 320) return;
    const v = Math.max(0, 1 - best / 320) ** 1.4 * (p.mode === BOTH ? 1 : 0.3);
    if (v < 0.02) return;
    const t = A.now();
    const [f0, f1] = this.hi ? [920, 680] : [680, 920];
    A.tone('sawtooth', f0, t, 0.44, 0.055 * v, A.sfxWet, { slideTo: f1, filter: 2600, attack: 0.03 });
    A.tone('square', f0 * 0.5, t, 0.44, 0.025 * v, A.sfxWet, { slideTo: f1 * 0.5, filter: 1400, attack: 0.03 });
  }

  render(mode, viewer = this.viewer) {
    if (!this.on) return;
    const F = this.fleet;
    const seen = solidIn(M.X, mode);
    const shimmer = 0.85 + 0.15 * Math.sin(this.t * 9);
    // the bar's flash: a double strobe each side, red-red then blue-blue
    const beat = Math.floor(this.t * 9);
    const eye = viewer?.pos;
    for (const s of this.strikes) s.seen = seen;
    F.begin();
    for (const c of this.cars) {
      if (c.alpha <= 0.01) continue;
      const pal = this.pal[c.kind];
      if (c.kind === 'cruiser') {
        // the light bar and wig-wag headlights
        const q = (beat + c.k * 2) % 4;
        const left = q < 2;
        const strobe = q % 2 === 0 ? 1 : 0.55;
        pal[TAG.barL] = left ? this.lit.L : this.dim.L;
        pal[TAG.barR] = left ? this.dim.R : this.lit.R;
        pal[TAG.halo] = _c.copy(left ? this.lit.L : this.lit.R).multiplyScalar(0.4 * strobe);
        pal[TAG.head].setScalar(left ? 1.6 : 0.8);
      }
      let a = c.alpha * (seen ? 1 : GHOST * shimmer);
      if (c.life === 'dead' && Math.random() < 0.4) a *= 0.5;
      const glowK = eye ? Math.min(1.5, Math.max(1, eye.distanceTo(c.pos) / 30)) : 1;
      F.draw(c.tpl, c.m, a, pal, !seen, glowK);
    }
    F.end();
  }
}
const NONE = [];
