// FLIPPER ALLEY's moving parts (the course is world/pinball.js, the table world/pinball-art.js). Everything here runs
// on the race clock, the same every race: nothing is random.
//
//   plunger    pulls back through the countdown and fires the whole grid up the shooter lane at GO
//   flippers   swing every BEAT seconds (the right one half a beat after the left, and only from lap 2). Three lamps
//              on the lane count each swing in. Be on a bat as it swings and you're batted onto the centre ramp.
//   bumpers    in the pit: each one kicks you away from it and on down the lane. Three kicks inside a couple of
//              seconds is a RICOCHET: a long boost and some SHIFT. The Pair holds its line through a kick; the Blade
//              and the Skimmer are turned by it.
//   kickback   lit from lap 2: a kicker on the outlane that fires you on round the apron
//   multiball  lap 3: three steel balls roll down the centre lane against the traffic, one lane each, and drop
//              into the drain. They take most of a hull.
//   backbox    the score display over the top of the table shows the race as a score table

import * as THREE from '../../vendor/three.js';
import { BOTH, M, solidIn } from '../world/shift.js';
import { clamp } from '../core/util.js';

export const BEAT = 2.4;
const HOT = 0.2; // seconds a swinging bat still catches you
const FLIGHT = 0.95;
const BALL_R = 3;
const BALL_SPEED = 27;
const BALL_LANES = [-0.58, 0.58, 0];
const NONE = [];
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

const angLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class Pinball {
  constructor(race) {
    this.R = race;
    this.K = race.world.pinball;
    this.main = race.world.main;
    this.lap = 0;
    this.prev = 0;
    this.started = false;
    this.plungeT = -1;
    this.boxT = 0;
    this.flash = 0;
    const d = race.def.pin;
    const m = this.main;
    this.kickI = m.index(d.kickback);
    const i0 = m.index(d.ballsFrom);
    const i1 = m.index(d.ballsTo);
    this.run = { i0, i1, len: (i0 - i1) * m.ds, tail: 70 };
    this.balls = BALL_LANES.map((f, k) => ({ k, lat: f * m.halfW, i: i0, on: false, pos: new THREE.Vector3(), mask: M.ALL, w: BALL_R, len: BALL_R, type: 'block', sweep: 0 }));
    this.ballT0 = -1;
  }

  // sound, only with the audio running (headless runs have none)
  sfx(fn, at = null) {
    const A = this.R.app.audio;
    if (!A?.ctx || A.ctx.state !== 'running') return;
    if (at && !this.R.players.some((p) => p.pos.distanceToSquared(at) < 220 * 220)) return;
    try {
      fn(A, A.now());
    } catch {
      /* a sound is never worth a crash */
    }
  }

  update(dt) {
    const R = this.R;
    const K = this.K;
    const c = R.raceTime;
    this.flash = Math.max(0, this.flash - dt);
    // a rival that has drifted onto the wire knows it at once (it would shift lens up there and drop off otherwise)
    for (const r of R.racers) {
      if (r.ai && r.grounded && r.track?.path === K.wire && r.ai.path !== K.wire) Object.assign(r.ai, { path: K.wire, _branch: null, planT: 0, targetLat: 0, prefLat: 0 });
      // getting onto the wire is a pull up it: the climb would cost all the speed otherwise
      const onWire = r.grounded && r.track?.path === K.wire;
      if (onWire && !r._wire && r.track.i < 40) {
        r.giveBoost(1.1, 1.3);
        if (!r.ai) R.emitP(r, 'popup', { text: 'WIRE RIDE', color: '#ff5a6e', small: true });
      }
      if (onWire || r.grounded) r._wire = onWire;
    }
    // ---- the table moves on with the leader's lap
    const lap = Math.max(0, ...R.racers.map((r) => r.lap || 0));
    if (lap > this.lap && R.state === 'race') {
      this.lap = lap;
      if (lap === 1) this.call('KICKBACK LIT · RIGHT FLIPPER LIVE', '#ffd23a');
      if (lap === 2) {
        this.ballT0 = c + 1.5;
        this.call('MULTIBALL', '#ffffff');
        this.flash = 2.5;
        this.sfx((A, t) => A.arp(t, [523, 659, 784, 1047, 1319], 0.07, 0.3));
      }
    }
    this.plunger(dt);
    this.flippers(c);
    for (const r of R.racers) {
      if (r.puppet || r.respawnT > 0) {
        r.flip = null;
        continue;
      }
      if (r.flip) this.fly(r, dt);
      else {
        this.onBat(r);
        this.bump(r);
        this.kick(r);
        this.drained(r);
      }
    }
    this.multiball(c, dt);
    this.prev = c;
    this.art(dt, c);
  }

  call(text, color) {
    for (const p of this.R.players) this.R.emitP(p, 'popup', { text, color });
  }

  // ------------------------------------------------------------ the plunger
  plunger(dt) {
    const R = this.R;
    const P = this.K.art?.plunger;
    let pull = 0;
    if (R.state === 'countdown') pull = clamp(1 - R.countdown / 4, 0, 1);
    if (R.state === 'race' && !this.started) {
      this.started = true;
      this.plungeT = 0;
      for (const r of R.racers) if (!r.puppet) r.giveBoost(1.3, 1.5);
      for (const p of R.players) {
        R.emitP(p, 'popup', { text: 'PLUNGE!', color: '#ffd23a' });
        R.camOf(p).fovPunch(10);
        R.camOf(p).addShake(0.5);
      }
      this.sfx((A, t) => {
        A.thump(t, 190, 45, 0.3, 0.7);
        A.noiseHit(t, 0.12, 0.4, A.sfxWet, 'bandpass', 2400, 2);
        A.tone('triangle', 90, t + 0.05, 0.9, 0.25, A.sfxWet, { slideTo: 240, slideTime: 0.5 });
      });
    }
    if (this.plungeT >= 0) this.plungeT += dt;
    if (!P) return;
    // rest behind the grid; back through the countdown; a hard stroke at GO; then away into its housing
    let z = 0;
    if (!this.started) z = -pull * P.pull;
    else if (this.plungeT < 0.1) z = -P.pull + (P.pull + P.stroke) * (this.plungeT / 0.1);
    else z = P.stroke - (P.stroke + P.away) * clamp((this.plungeT - 0.25) / 0.9, 0, 1);
    P.set(z);
  }

  // ------------------------------------------------------------ the flippers
  flippers(c) {
    for (const b of this.K.bats) {
      b.live = this.lap >= b.fromLap && this.R.state !== 'intro' && this.R.state !== 'countdown';
      const ph = b.phase * BEAT;
      const n0 = Math.floor((this.prev - ph) / BEAT);
      const n1 = Math.floor((c - ph) / BEAT);
      b.since = c - ph - n1 * BEAT; // since the last swing
      if (!b.live || n1 < 1) {
        b.since = 99;
        continue;
      }
      if (n1 > n0) {
        b.caught = new Set();
        this.sfx((A, t) => {
          A.noiseHit(t, 0.05, 0.5, A.sfxDry, 'bandpass', 1800, 1.5);
          A.thump(t, 160, 70, 0.12, 0.5);
        }, b.at);
      }
      // the count-in: a tick as each lamp lights
      for (let k = 0; k < 3; k++) {
        const at = BEAT - 0.3 * (3 - k);
        if (b.since >= at && this.prev - ph - n0 * BEAT < at && n0 === n1) this.sfx((A, t) => A.tone('square', 660 + 110 * k, t, 0.05, 0.07, A.sfxWet), b.at);
      }
    }
  }

  onBat(r) {
    const t = r.track;
    if (!t || t.path !== this.K.lane) return;
    for (const b of this.K.bats) {
      // (rivals can't hear the count-in, so the better ones get a little longer on the bat)
      if (!b.live || b.since > HOT + (r.ai ? 0.2 + r.ai.skill * 0.3 : 0) || b.caught?.has(r)) continue;
      if (t.i < b.i0 - 1 || t.i > b.i1 + 1) continue;
      if (!r.grounded && r.pos.y - r.gnd.y > 1.5) continue;
      b.caught.add(r);
      this.launch(r, b);
      return;
    }
  }

  launch(r, b) {
    const R = this.R;
    const ramp = this.K.ramp;
    const iL = this.K.rampIn;
    r.flip = {
      t: 0,
      p0: r.pos.clone(),
      p1: ramp.point(iL, 0, 0.35, new THREE.Vector3()),
      yaw0: r.yaw,
      yaw1: Math.atan2(ramp.thx[iL], ramp.thz[iL]),
      speed: Math.max(54, Math.abs(r.speed)),
      h: 9,
    };
    r.grounded = false;
    r.drift.active = false;
    r.spinTime = 0;
    r.tally && (r.flips = (r.flips || 0) + 1);
    R.onMove(r, 'launch', { flipper: true });
    if (R.near(r)) R.debris.sparks(r.pos, _a.set(0, 1, 0), 34, 0xffffff, 18, r.gnd.y);
    if (r.isPlayer) {
      R.emitP(r, 'popup', { text: 'FLIPPED!', color: '#ffd23a' });
      R.camOf(r).fovPunch(14);
      R.camOf(r).addShake(0.6);
      R.app.input.rumble(r.pIndex || 0, 0.9, 0.7, 220);
      this.sfx((A, t) => A.arp(t + 0.05, [784, 1047, 1568], 0.06, 0.28));
    }
    void b;
  }

  // Through the air on the flipper's arc: the car is carried, and set down on the ramp at speed.
  fly(r, dt) {
    const F = r.flip;
    F.t += dt;
    const u = Math.min(1, F.t / FLIGHT);
    r.pos.lerpVectors(F.p0, F.p1, u);
    r.pos.y += 4 * F.h * u * (1 - u);
    r.vel.subVectors(F.p1, F.p0).multiplyScalar(1 / FLIGHT);
    r.vel.y += (4 * F.h * (1 - 2 * u)) / FLIGHT;
    r.yaw = angLerp(F.yaw0, F.yaw1, Math.min(1, u * 1.6));
    r.yawRate = 0;
    r.grounded = false;
    r.airTime = 0.02;
    r.invuln = Math.max(r.invuln, 0.1);
    if (u < 1) return;
    const ramp = this.K.ramp;
    const i = this.K.rampIn;
    r.flip = null;
    r.pos.copy(F.p1);
    r.yaw = F.yaw1;
    r.vel.set(ramp.tx[i], ramp.ty[i], ramp.tz[i]).multiplyScalar(F.speed);
    r.speed = F.speed;
    for (const k of Object.keys(r.hints)) if (k[0] !== '_') delete r.hints[k];
    r.hints[ramp.id] = i;
    r.hints._cur = ramp.id;
    r.giveBoost(0.9, 1.3);
    if (r.ai) Object.assign(r.ai, { path: ramp, _branch: null, planT: 0, targetLat: 0, prefLat: 0 });
  }

  // ------------------------------------------------------------ the bumpers
  bump(r) {
    const R = this.R;
    const pit = this.K.pit;
    if (r.track?.path !== pit) return;
    for (const b of this.K.bumpers) {
      if (!solidIn(b.mask, r.mode) || (b.cool?.get(r) || 0) > R.t) continue;
      const dx = r.pos.x - b.pos.x;
      const dz = r.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      const reach = b.r + 1.3;
      if (d > reach || Math.abs(r.pos.y - b.pos.y) > 3) continue;
      (b.cool ||= new Map()).set(r, R.t + 0.3);
      _n.set(dx / (d || 1), 0, dz / (d || 1));
      // out of it, with what you brought into it turned round
      r.pos.x += _n.x * (reach - d);
      r.pos.z += _n.z * (reach - d);
      const vn = r.vel.x * _n.x + r.vel.z * _n.z;
      if (vn < 0) r.vel.addScaledVector(_n, -vn * 1.5);
      // the kick: away from the bumper, and on down the lane (never back the way you came)
      const heavy = r.mode === BOTH;
      const j = clamp(b.i + 2, 0, pit.N - 1);
      _a.set(pit.thx[j], 0, pit.thz[j]);
      const back = Math.min(0, _n.dot(_a));
      r.vel.addScaledVector(_n, heavy ? 8 : 17).addScaledVector(_a, 12 - back * (heavy ? 8 : 17));
      const top = r.phys.topSpeed * 1.3;
      const sp = Math.hypot(r.vel.x, r.vel.z);
      if (sp > top) r.vel.multiplyScalar(top / sp);
      // the light forms are turned by it; the Pair holds its nose
      const to = Math.atan2(r.vel.x, r.vel.z);
      r.yaw = angLerp(r.yaw, to, heavy ? 0.15 : 0.55);
      r.yawRate = 0;
      r.giveBoost(0.35, 1.2);
      b.hit = 1;
      // three in a row
      r.bumps = R.t - (r.bumpT ?? -9) < 2.4 ? (r.bumps || 0) + 1 : 1;
      r.bumpT = R.t;
      r.score = (r.score || 0) + 5000;
      const rico = r.bumps === 3;
      if (rico) {
        r.giveBoost(1.7, 1.42);
        r.energy = Math.min(1, r.energy + 0.2);
        r.score += 50000;
        R.onMove(r, 'pad', { ricochet: true });
      }
      if (R.near(r)) R.debris.sparks(_b.copy(b.pos).addScaledVector(_n, b.r).setY(b.pos.y + 1), _n, rico ? 30 : 14, b.color, 16, b.pos.y);
      this.sfx((A, t) => {
        A.thump(t, 220, 90, 0.1, 0.45);
        A.tone('sine', 880 * 2 ** ((r.bumps - 1) / 6), t, 0.18, 0.2, A.sfxWet, { fm: [2.76, 1.2] });
      }, b.pos);
      if (r.isPlayer) {
        R.emitP(r, 'popup', rico ? { text: 'RICOCHET!', color: '#ffd23a' } : { text: `BUMP ×${r.bumps}`, color: '#ffffff', small: true });
        R.camOf(r).addShake(rico ? 0.6 : 0.3);
        if (rico) R.camOf(r).fovPunch(10);
        R.app.input.rumble(r.pIndex || 0, 0.6, 0.4, 100);
      }
    }
  }

  // ------------------------------------------------------------ the kickback (lap 2 on)
  kick(r) {
    if (this.lap < 1 || r.track?.path !== this.main || !r.grounded) return;
    let d = r.track.i - this.kickI;
    if (d < -this.main.N / 2) d += this.main.N;
    if (d < 0 || d > 4 || (r.kickT || 0) > this.R.t) return;
    r.kickT = this.R.t + 3;
    r.giveBoost(1.5, 1.42);
    r.score = (r.score || 0) + 10000;
    if (this.K.art) this.K.art.kickT = 0.4;
    if (r.isPlayer) {
      this.R.emitP(r, 'popup', { text: 'KICKBACK', color: '#ffd23a' });
      this.R.camOf(r).fovPunch(9);
      this.sfx((A, t) => {
        A.thump(t, 200, 60, 0.15, 0.5);
        A.noiseHit(t, 0.06, 0.35, A.sfxWet, 'bandpass', 3000, 2);
      });
    }
  }

  // into the trough: say so once per fall
  drained(r) {
    const on = r.track?.path === this.K.trough && r.grounded;
    if (on && !r.inTrough && r.isPlayer) {
      this.R.emitP(r, 'popup', { text: 'DRAINED · BALL TROUGH', color: '#ff4a6a' });
      this.sfx((A, t) => A.tone('sawtooth', 300, t, 0.5, 0.2, A.sfxWet, { slideTo: 70, slideTime: 0.45, filter: 900 }));
    }
    if (r.grounded) r.inTrough = on;
  }

  // ------------------------------------------------------------ multiball (lap 3)
  multiball(c) {
    const R = this.R;
    const m = this.main;
    const run = this.run;
    const cycle = run.len + run.tail;
    for (const b of this.balls) {
      b.on = false;
      if (this.ballT0 < 0) continue;
      const s0 = (c - this.ballT0) * BALL_SPEED - (b.k * cycle) / 3;
      if (s0 < 0) continue;
      const s = s0 % cycle;
      b.s = s0;
      if (s < run.len) {
        const fi = run.i0 - s / m.ds;
        const i = Math.floor(fi);
        m.point(i, b.lat, BALL_R, _a);
        m.point(i + 1, b.lat, BALL_R, _b);
        b.pos.lerpVectors(_b, _a, 1 - (fi - i));
        b.i = Math.round(fi);
        b.on = true;
        b.sink = 0;
      } else {
        // off the bottom of the lane and into the drain
        const u = (s - run.len) / run.tail;
        m.point(run.i1, b.lat, BALL_R, _a);
        b.pos.lerpVectors(_a, this.K.drainAt, Math.min(1, u * 1.15));
        b.sink = clamp((u - 0.8) / 0.2, 0, 1);
        b.pos.y -= b.sink * 16;
        b.i = -99;
      }
      b.show = true;
    }
    for (const r of R.racers) {
      if (r.puppet || r.respawnT > 0 || r.respawnGrace > 0 || r.flip || r.finished) continue;
      // coming back onto the centre lane (off the ramp, out of the trough, off the flipper lane) you can't have seen
      // what is rolling down it: a moment's grace
      const P = r.track?.path;
      if (P === this.K.trough || P === this.K.ramp || P === this.K.lane) r.ballT = Math.max(r.ballT || 0, R.t + 1.2);
      for (const b of this.balls) {
        if (!b.show || b.sink > 0.3 || (r.ballT || 0) > R.t) continue;
        const dx = r.pos.x - b.pos.x;
        const dz = r.pos.z - b.pos.z;
        if (dx * dx + dz * dz > (BALL_R + 1.2) ** 2 || Math.abs(r.pos.y - (b.pos.y - BALL_R)) > 3.5) continue;
        r.ballT = R.t + 1.2;
        const d = Math.hypot(dx, dz) || 1;
        // thrown aside, with most of the hull gone
        r.pos.x += (dx / d) * (BALL_R + 1.3 - d);
        r.pos.z += (dz / d) * (BALL_R + 1.3 - d);
        if (R.near(r)) R.debris.sparks(r.pos, _a.set(dx / d, 0.5, dz / d), 40, 0xffffff, 22, r.gnd.y);
        this.sfx((A, t) => {
          A.thump(t, 140, 40, 0.3, 0.8);
          A.tone('sine', 1244, t, 0.5, 0.18, A.sfxWet, { fm: [3.5, 2] });
        }, r.pos);
        if (R.hurt(r, 85, null, 'STEEL BALL')) continue;
        if (r.braceT > 0) continue;
        r.vel.multiplyScalar(0.3);
        r.vel.x += (dx / d) * 14;
        r.vel.z += (dz / d) * 14;
        r.spinOut(0.8, dx * this.main.thz[clamp(b.i, 0, this.main.N - 1)] > 0 ? 1 : -1);
      }
    }
  }

  // Balls on this road ahead of sample pi, for a rival to steer round (ai.js, like traffic).
  near(P, pi, n) {
    if (this.ballT0 < 0 || P !== this.main) return NONE;
    const out = [];
    for (const b of this.balls) {
      if (!b.on) continue;
      let d = b.i - pi;
      if (d < -P.N / 2) d += P.N;
      // a ball comes to meet you: the place to be clear of it is where you'll meet, nearer than where it is now, and
      // it needs seeing from further off than something standing still
      if (d >= -2 && d <= n * 1.5) out.push(d > 4 ? { ...b, i: pi + Math.round(d * 0.66) } : b);
    }
    return out;
  }

  // ------------------------------------------------------------ what it all looks like
  art(dt, c) {
    const A = this.K.art;
    if (!A) return;
    const tint = this.R.world.layers.level.get('tint');
    // the bats: up in a blink, held, and back down slowly
    for (const [k, b] of this.K.bats.entries()) {
      const s = b.since ?? 99;
      const up = s < 0.07 ? s / 0.07 : s < 0.22 ? 1 : Math.max(0, 1 - (s - 0.22) / 0.4);
      A.bats[k].swing(up);
      const left = BEAT - s;
      for (let q = 0; q < 3; q++) {
        const lit = b.live && s < 90 && left < 0.3 * (3 - q) + 0.02;
        const m = A.bats[k].lamps[q];
        m.opacity = lit ? 1 : b.live ? 0.12 : 0.03;
        if (tint) m.color.copy(tint);
      }
      A.bats[k].dark(!b.live);
    }
    for (const b of this.K.bumpers) {
      b.hit = Math.max(0, (b.hit || 0) - dt * 4);
      const idle = 0.5 + 0.5 * Math.sin(c * 3 + b.i);
      b.mesh.scale.setScalar(1 + b.hit * 0.25);
      b.cap.scale.setScalar(1 + 0.04 * idle);
      b.cap.position.y = b.capY + b.hit * 0.9;
    }
    for (const b of this.balls) {
      const mesh = A.balls[b.k];
      mesh.visible = !!b.show && this.ballT0 >= 0 && b.sink < 1;
      if (!mesh.visible) continue;
      mesh.position.copy(b.pos);
      mesh.rotation.x = -b.s / BALL_R;
      mesh.rotation.y = A.ballYaw;
    }
    if (A.kick) {
      A.kickT = Math.max(0, (A.kickT || 0) - dt);
      A.kick.visible = this.lap >= 1;
      A.kick.material.opacity = 0.35 + 0.3 * Math.sin(c * 8) + (A.kickT > 0 ? 0.6 : 0);
      if (tint) A.kick.material.color.copy(tint);
    }
    // the backbox, a few times a second
    this.boxT -= dt;
    if (this.boxT <= 0 && A.box) {
      this.boxT = 0.33;
      this.drawBox(A.box, c);
    }
  }

  drawBox(box, c) {
    const R = this.R;
    const g = box.ctx;
    const Wd = box.canvas.width;
    const H = box.canvas.height;
    const p = R.player;
    const lens = p.mode === BOTH ? null : p.mode === 2 ? '#ff2a4a' : '#1e8cff';
    const col = (both) => lens || both;
    g.fillStyle = '#05020c';
    g.fillRect(0, 0, Wd, H);
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.font = "italic 96px 'Russo One', 'Chakra Petch', sans-serif";
    g.shadowBlur = 24;
    g.shadowColor = g.fillStyle = col('#ffd23a');
    const multi = this.ballT0 >= 0;
    const blink = Math.floor(c * 3) % 2 === 0;
    g.fillText(multi && blink ? 'MULTIBALL' : 'FLIPPER ALLEY', Wd / 2, 70);
    g.shadowBlur = 8;
    g.font = "700 40px 'Chakra Petch', sans-serif";
    g.fillStyle = col('#e8dcff');
    const lapNow = Math.min(R.laps, (p.lap || 0) + 1);
    g.fillText(R.state === 'race' || R.state === 'finished' ? `BALL ${lapNow} OF ${R.laps}` : 'PULL THE PLUNGER', Wd / 2, 142);
    const st = R.standings().slice(0, 6);
    g.font = "700 46px 'Chakra Petch', monospace";
    st.forEach((r, k) => {
      const y = 208 + k * 50;
      const score = Math.max(0, Math.round(Math.max(0, r.prog) * 100000 + (r.score || 0))) * 10;
      g.fillStyle = col(r.isPlayer ? '#ffffff' : k % 2 ? '#ff5a7a' : '#5ab0ff');
      g.textAlign = 'left';
      g.fillText(`${k + 1}  ${r.name}`, 90, y);
      g.textAlign = 'right';
      g.fillText(score.toLocaleString('en-US'), Wd - 90, y);
    });
    box.tex.needsUpdate = true;
  }
}
