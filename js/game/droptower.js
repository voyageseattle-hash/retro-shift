// DROP TOWER's race clock (world/marblerun.js has the pieces): every moving part is put where race time says it is,
// the same every race, so it can be learned like the road and stays in step online and in split-screen.
//
//   every lap    the seesaw rocks, the tray tips, the lift carries
//   final lap    the spring stretches on a beat (from the first whole beat after the leader starts the lap), and the
//                hopper lets the marbles go: giant glass balls, red and blue, rolling down the funnel and the
//                corkscrew at a little under race pace
//
// It also does what the pieces do to a car: the lift's pull, the tray's slide and its holes, a marble's hit.

import * as THREE from '../../vendor/three.js';
import { M, BLUE, solidIn } from '../world/shift.js';
import { towerState, springArm, springSolid, trayK } from '../world/marblerun.js';
import { hitRacer } from './hazards.js';
import { FORMS } from '../vehicles/forms.js';

const LIFT_V = 62; // m/s the chain carries you at
const SLIDE = 36; // m/s of sideways slide per unit of tilt (sin)
const MARBLES = 5;
const MARBLE_V = 46;
const MARBLE_R = 3;
const NONE = [];
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

export class DropTower {
  constructor(race) {
    this.race = race;
    const T = (this.T = race.world.tower);
    T.driven = true;
    this.group = new THREE.Group();
    this.final = -1;
    const main = race.world.main;
    // the spring's gaps are glide gaps while they're open (ai.js reads the flag), but the bridge is an ordinary
    // road to plan for: whether to take it is the spring's call
    const sp = T.spring.path;
    sp.glide = new Uint8Array(sp.N);
    sp._form = null;
    sp.shut = (r) => this.springShut(r);
    // the marbles: one run of the funnel and the corkscrew, evenly spaced
    this.runLen = T.run.n * main.ds;
    this.gap = this.runLen / MARBLES;
    this.marbles = [];
    const ico = new THREE.IcosahedronGeometry(MARBLE_R, 1);
    const edges = new THREE.EdgesGeometry(ico);
    const swirl = new THREE.EdgesGeometry(new THREE.OctahedronGeometry(MARBLE_R * 0.55));
    for (let k = 0; k < MARBLES; k++) {
      const mask = k % 2 ? M.B : M.R;
      const mats = race.world.layers.materials(mask);
      const root = new THREE.Group();
      const ball = new THREE.Group();
      ball.add(new THREE.Mesh(ico, mats.fill), new THREE.LineSegments(edges, mats.wire), new THREE.LineSegments(swirl, mats.wire));
      root.add(ball);
      root.visible = false;
      this.group.add(root);
      this.marbles.push({ k, mask, root, ball, on: false, path: main, i: 0, lat: 0, w: MARBLE_R - 0.5, len: MARBLE_R - 0.5, h: MARBLE_R * 2, type: 'block', sweep: 0, speed: MARBLE_V, pos: new THREE.Vector3(), y: 0, thx: 0, thz: 1, rx: 1, rz: 0, s: 0 });
    }
    T.set(towerState(0, -1));
  }

  // ---------------------------------------------------------------- the clock
  update(dt, viewer) {
    const R = this.race;
    const T = this.T;
    const t = R.raceTime;
    if (this.final < 0 && R.laps > 1 && R.state === 'race' && R.racers.some((r) => r.lap >= R.laps - 1)) {
      this.final = t;
      if (!R.solo || viewer.lap >= R.laps - 1) R.emit('popup', { text: 'MARBLES AWAY', color: '#ffd23a' });
      R.app.audio.play('quake', 0.5);
    }
    const before = T.state;
    const s = towerState(t, this.final);
    T.set(s);
    // what you hear: the spring's ratchet as it goes, the seesaw landing, the knob
    const near = (p, d) => viewer.pos.distanceToSquared(p) < d * d;
    if (before && R.state === 'race') {
      if ((s.see > 0.98) !== (before.see > 0.98) || (s.see < 0.02) !== (before.see < 0.02)) {
        if ((s.see > 0.98 || s.see < 0.02) && near(T.plank.pivot, 160)) R.app.audio.play('land', 7);
      }
      const sp = T.spring.path;
      if (Math.abs(s.shiver) > 0.01 && Math.floor(t * 8) !== Math.floor((t - dt) * 8) && near(sp.point(Math.floor(sp.N / 2), 0, 0, _v), 260)) R.app.audio.play('ui', 0.5);
      if (Math.abs(s.knob - before.knob) > 1e-4 && Math.floor(t * 6) !== Math.floor((t - dt) * 6) && near(R.world.main.point(T.tray.i0, 0, 0, _v), 200)) R.app.audio.play('ui', 0.35);
    }
    this.roll(t, dt, viewer);
  }

  // The marbles: marble k is (t - final - k * spacing) * speed metres down the run, round and round.
  roll(t, dt, viewer) {
    const R = this.race;
    const main = R.world.main;
    const T = this.T;
    for (const m of this.marbles) {
      const age = this.final < 0 ? -1 : t - this.final - 1 - (m.k * this.gap) / MARBLE_V;
      m.on = age >= 0;
      m.root.visible = m.on;
      if (!m.on) continue;
      const s = (age * MARBLE_V) % this.runLen;
      if (s < m.s && viewer.pos.distanceToSquared(main.point(T.run.i0, 0, 0, _v)) < 200 * 200) R.app.audio.play('land', 9);
      m.s = s;
      const fi = T.run.i0 + s / main.ds;
      m.i = main.wrap(Math.round(fi));
      // a slow weave across the road, each marble on its own phase
      m.lat = Math.sin(s / 70 + m.k * 2.1) * main.halfW * 0.55;
      main.pointF(fi / main.N, m.lat, 0, m.pos);
      m.y = m.pos.y;
      m.thx = main.thx[m.i];
      m.thz = main.thz[m.i];
      m.rx = main.rightX(m.i);
      m.rz = main.rightZ(m.i);
      // it drops out of the hopper, and sinks into the catcher at the end of the run
      const drop = Math.max(0, 1 - age * 1.6) * 14 * (s < 40 ? 1 : 0);
      const sink = Math.max(0, (s - (this.runLen - 18)) / 18);
      m.root.position.copy(m.pos).setY(m.pos.y + MARBLE_R + 0.2 + drop - sink * MARBLE_R * 2.4);
      m.root.scale.setScalar(1 - sink * 0.6);
      m.live = drop < 2 && sink < 0.5;
      // rolling: about the axis across the road
      _d.set(m.rx, 0, m.rz);
      m.ball.rotateOnWorldAxis(_d, (MARBLE_V * dt) / MARBLE_R);
    }
  }

  // ---------------------------------------------------------------- what the pieces do to a car (every sub-step)
  step(r, dt) {
    const tr = r.track;
    if (!tr || r.respawnT > 0) return;
    const R = this.race;
    const T = this.T;
    const main = R.world.main;
    if (tr.path !== main) return;
    const i = tr.i;
    // the lift: carried up at chain speed (faster is your own doing)
    if (r.grounded && i >= T.lift.i0 && i <= T.lift.i1) {
      const along = r.vel.x * main.tx[i] + r.vel.y * main.ty[i] + r.vel.z * main.tz[i];
      if (along < LIFT_V) {
        const k = Math.min(LIFT_V - along, 70 * dt);
        r.vel.x += main.tx[i] * k;
        r.vel.y += main.ty[i] * k;
        r.vel.z += main.tz[i] * k;
      }
      if (r.isPlayer && Math.floor(R.t * 7) !== Math.floor((R.t - dt) * 7)) R.app.audio.play('ui', 0.3);
    }
    // the tray: the board's tilt slides you toward its low side, and a hole is a hole unless you float
    const t = T.tray;
    if (r.grounded && i >= t.i0 - t.nb && i <= t.i1 + t.nb) {
      const v = -SLIDE * Math.sin(t.tilt * trayK(t, i)) * (r.ai ? 0.5 : 1);
      r.pos.x += r.gnd.rx * v * dt;
      r.pos.z += r.gnd.rz * v * dt;
      if (!FORMS[r.mode]?.glide) {
        for (const h of t.holes) {
          const along = (i - h.i) * main.ds;
          const dl = tr.lat - h.lat;
          if (along * along + dl * dl > (h.r - 0.3) ** 2) continue;
          // through the board: below the reach of the road above, and falling (the catch chute is under it)
          r.pos.y -= 1.9;
          r.grounded = false;
          r.airTime = 0.02;
          r.vel.y = Math.min(r.vel.y, -6);
          r.vel.x *= 0.8;
          r.vel.z *= 0.8;
          r.drift.active = false;
          if (r.isPlayer) {
            R.emitP(r, 'popup', { text: 'IN THE HOLE', color: '#ff8a2a' });
            R.app.audio.play('fall');
            R.camOf(r).addShake(0.4);
          }
          break;
        }
      }
    }
    // the marbles
    if (this.final >= 0 && !(r.respawnGrace > 0) && !(r.beamT > 0)) {
      for (const m of this.marbles) {
        if (!m.on || !m.live || !solidIn(m.mask, r.mode)) continue;
        const hit = hitRacer(m, r);
        if (!hit || hit.into < 3 || (r.marbleCd || 0) > R.t) continue;
        r.marbleCd = R.t + 0.5;
        const hard = hit.into > 9;
        R.hurt(r, hit.into * (hit.side ? 1.2 : 1.6), null, hard ? 'MARBLE' : null);
        if (r.respawnT > 0) return;
        if (hard) r.spinOut(0.7, hit.side ? hit.s : Math.random() < 0.5 ? -1 : 1);
        _d.set(hit.side ? m.rx * hit.s : -m.thx, 0, hit.side ? m.rz * hit.s : -m.thz);
        R.scrape(r, hit.into, _d);
        if (r.isPlayer) {
          R.app.audio.play(hard ? 'hit' : 'scrape');
          R.camOf(r).addShake(hard ? 0.7 : 0.3);
          R.app.input.rumble(r.pIndex || 0, 0.8, 0.6, 220);
          R.stats.crashes++;
        }
      }
    }
  }

  // ---------------------------------------------------------------- the rivals read it
  // The spring is shut to a car that would be on it while it's open, unless it can cross as the Skimmer.
  springShut(r) {
    const R = this.race;
    if (this.final < 0) return false;
    const sp = this.T.spring;
    const v = Math.max(35, r.speed);
    const t = R.raceTime;
    const t0 = t + (90 + sp.m0) / v;
    const t1 = t + (90 + sp.m0 + sp.span) / v;
    if (t1 < springArm(this.final) || springSolid(t0 - 0.4, t1 + 0.4, this.final)) return false;
    return r.mono ? r.mode !== BLUE : r.energy < 0.6;
  }
  // The marbles, shaped like obstacles for ai.js (each in its own world).
  near(P, pi, n) {
    if (this.final < 0 || P !== this.race.world.main) return NONE;
    const out = [];
    for (const m of this.marbles) {
      if (!m.on || !m.live) continue;
      let d = m.i - pi;
      if (d < -P.N / 2) d += P.N;
      if (d > P.N / 2) d -= P.N;
      if (d >= -2 && d <= n) out.push(m);
    }
    return out;
  }
  // The tray's holes: a lane with one in the next stretch costs (not to a car that floats).
  laneCost(r, mode, lat) {
    const tr = r.track;
    const t = this.T.tray;
    if (!tr || tr.path !== this.race.world.main || FORMS[mode]?.glide) return 0;
    const i = tr.i;
    if (i < t.i0 - 40 || i > t.i1) return 0;
    let c = 0;
    for (const h of t.holes) {
      const d = (h.i - i) * tr.path.ds;
      if (d > -3 && d < 60 && Math.abs(lat - h.lat) < h.r + 1.6) c += 1;
    }
    return c;
  }
}
