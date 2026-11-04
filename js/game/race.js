// One race: the course, six racers, the chase camera, laps and places, and everything the shift touches (walls you
// phase through, bridges that vanish, shards that refill the lens).

import * as THREE from '../../vendor/three.js';
import { TrackWorld } from '../world/track.js';
import { Racer, CARS } from '../vehicles/racer.js';
import { RaceAI } from '../vehicles/ai.js';
import { ChaseCamera } from './camera.js';
import { Environment } from './env.js';
import { BOTH, RED, BLUE, SHIFT, solidIn, MODE_NAME } from '../world/shift.js';
import { clamp, rand, storage } from '../core/util.js';
import { GhostRecorder, GhostCar, loadGhost, saveGhost } from './ghost.js';
import { monoDef, medalFor, recordMedal } from './modes.js';
import { driverOf, pick } from './story.js';

const _v = new THREE.Vector3();

export class Race {
  constructor(app, def, opts = {}) {
    this.app = app;
    this.kind = opts.kind || (opts.rivals === 0 ? 'trial' : 'race');
    this.mono = this.kind === 'mono';
    this.solo = this.kind === 'trial' || this.mono;
    if (this.mono) def = monoDef(def);
    this.def = def;
    this.opts = opts;
    this.laps = opts.laps ?? def.laps ?? 3;
    this.scene = new THREE.Scene();
    this.world = new TrackWorld(def);
    this.env = new Environment(this.world);
    this.scene.add(this.env.group, this.world.group);
    this.scene.fog = this.env.fog;
    this.scene.background = this.env.bg;
    this.cam = new ChaseCamera();
    this.cam.camera.far = 6000;
    this.cam.camera.updateProjectionMatrix();
    this.t = 0;
    this.raceTime = 0;
    this.state = 'intro'; // intro, countdown, race, finished
    this.countdown = 3.999;
    this.introT = 0;
    this.racers = [];
    this.finishOrder = [];
    this.tipShown = new Set();
    this.stats = { phased: 0, crashes: 0, shifts: 0 };
    // player + rivals
    const playerCar = CARS.find((c) => c.id === opts.car) || CARS[0];
    const field = opts.rivals ?? 5;
    const others = CARS.filter((c) => c !== playerCar && !c.secret);
    const diff = opts.difficulty ?? 1; // 0 easy, 1 normal, 2 hard
    for (let k = 0; k <= field; k++) {
      const isPlayer = k === field; // player starts at the back of the grid
      const car = isPlayer ? playerCar : others[k % others.length];
      const r = new Racer(car, { isPlayer, index: k, name: isPlayer ? 'YOU' : car.name, livery: isPlayer ? opts.livery : null });
      r.session = this;
      if (this.mono) {
        r.mono = true;
        r.mode = RED;
      }
      const slot = this.world.gridSlot(field - k);
      r.reset(slot.pos, slot.yaw);
      r.grounded = true;
      r.lastU = this.world.main.mainU(slot.i);
      r.prog = r.lastU > 0.5 ? r.lastU - 1 : r.lastU;
      r.lap = 0;
      r.bestLap = Infinity;
      r.lapStart = 0;
      r.finished = false;
      r.respawnT = 0;
      if (!isPlayer) {
        const skill = clamp([0.55, 0.75, 0.92][diff] + (k / field) * 0.1 + rand(-0.05, 0.05), 0.3, 1);
        r.ai = new RaceAI(r, this.world, skill);
        r.speedMul = [0.9, 0.97, 1.02][diff] + (k / field) * 0.03;
      } else {
        this.player = r;
        // headless staff runs: the AI drives the player's car flat out
        if (opts.autopilot) r.ai = new RaceAI(r, this.world, 1);
      }
      this.scene.add(r.root, r.trail.mesh);
      this.racers.push(r);
    }
    this.cam.snap(this.player);
    this.events = [];
    this.lastMode = BOTH;
    // ghosts: your best run and the staff run
    this.ghosts = [];
    if (this.solo) {
      this.recorder = new GhostRecorder();
      const mine = loadGhost(def.id, this.mono);
      if (mine && opts.showGhost !== false) this.addGhost(mine, 0xffffff, 'BEST');
      if (opts.staff) this.addGhost(opts.staff, 0xffd04a, 'STAFF');
    }
    this.staffTime = opts.staff?.time || 0;
    const m0 = this.player.mode;
    app.audio.playCourse(def.id);
    app.audio.setMode(m0, true);
    this.env.setMode(m0);
    this.world.update(0, 0, m0);
  }

  addGhost(data, color, label) {
    const g = new GhostCar(data, color, label);
    if (!g.ok) return;
    g.update(0, this.player.mode);
    this.scene.add(g.root);
    this.ghosts.push(g);
  }

  // A rival gets on the radio.
  comms(r, kind) {
    const d = r && driverOf(r.car.id);
    if (!d) return;
    const text = Array.isArray(d[kind]) ? pick(d[kind]) : d[kind];
    if (!text) return;
    const msg = { id: r.car.id, name: d.name, car: r.car.name, color: r.color, text, kind };
    this.emit('comms', msg);
    return msg;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  // ------------------------------------------------------------ session hooks (called by racers)
  onShift(r, prev, mode, forced) {
    if (r.isPlayer) {
      this.app.audio.play('shift', mode);
      this.app.audio.setMode(mode);
      this.env.setMode(mode);
      this.cam.fovPunch(mode === BOTH ? 3 : 6);
      this.cam.addShake(0.15);
      this.aberr = 1;
      this.stats.shifts++;
      this.emit('shift', { mode, forced });
    }
  }
  onShiftDenied(r) {
    if (r.isPlayer) {
      this.app.audio.play('denied');
      this.emit('denied');
    }
  }
  onDriftLevel(r, lvl) {
    if (r.isPlayer) this.emit('drift', { lvl });
  }
  onMiniTurbo(r, lvl) {
    if (r.isPlayer) {
      this.app.audio.play('turbo', lvl);
      this.emit('popup', { text: ['', 'TURBO', 'SUPER TURBO', 'ULTRA TURBO'][lvl], color: '#ff4fd8' });
    }
  }
  onWallHit(r, impact) {
    if (r.isPlayer && impact > 6) {
      this.app.audio.play('scrape');
      this.cam.addShake(Math.min(0.4, impact * 0.02));
      this.app.input.rumble(0, 0.3, 0.2, 80);
    }
  }
  onLand(r, impact) {
    if (r.isPlayer && impact > 6) {
      this.app.audio.play('land', impact);
      this.cam.addShake(Math.min(0.5, impact * 0.025));
    }
  }
  onFell(r) {
    if (r.respawnT > 0) return;
    r.falls = (r.falls || 0) + 1;
    r.respawnT = 1.1;
    r.root.visible = false;
    if (r.isPlayer) {
      this.app.audio.play('fall');
      this.emit('popup', { text: r.mode === BOTH ? 'FELL' : `NO ROAD IN ${MODE_NAME[r.mode]}`, color: '#ff4a6a' });
    }
  }

  respawn(r) {
    const u = r.lastU;
    const sp = this.world.respawnPoint(u, r.mono ? r.mode : BOTH);
    r.reset(sp.pos, sp.yaw);
    if (r.mono) r.energy = Math.max(r.energy, SHIFT.monoCost);
    else r.mode = BOTH;
    r.grounded = true;
    r.invuln = 1.5;
    r.vel.set(Math.sin(sp.yaw), 0, Math.cos(sp.yaw)).multiplyScalar(12);
    if (r.ai) r.ai.path = this.world.main;
    if (r.isPlayer) {
      this.app.audio.setMode(r.mode);
      this.env.setMode(r.mode);
      this.cam.snap(r);
    }
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    this.t += dt;
    const input = this.app.input;
    const p = this.player;
    // player controls
    const c = input.controls(0);
    p.ctl.throttle = c.throttle;
    p.ctl.brake = c.brake;
    p.ctl.steer = c.steer;
    p.ctl.drift = c.drift;
    if (this.state === 'race' && !p.finished) {
      if (c.item) p.setMode(RED, this);
      if (c.special) p.setMode(BLUE, this);
      if (c.jump) {
        if (p.mono) p.setMode(BOTH, this);
        else if (p.mode !== BOTH) p.shiftTo(BOTH, this);
      }
      if (c.reset && p.respawnT <= 0 && !this.resetHeld) {
        this.resetHeld = true;
        this.onFell(p);
      }
      if (!c.reset) this.resetHeld = false;
    }
    if (this.state === 'intro') {
      if (this.introT < 0.5 && this.introT + dt >= 0.5 && !this.solo) this.comms(pick(this.racers.filter((r) => !r.isPlayer)), 'pre');
      this.introT += dt;
      for (const r of this.racers) r.controlLocked = true;
      if (this.introT > 2.2 || input.menu('confirm')) {
        this.state = 'countdown';
        this.lastBeep = 4;
      }
    } else if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastBeep) {
        this.lastBeep = n;
        this.app.audio.play('beep', n <= 0);
        this.emit('count', { n });
      }
      if (this.countdown <= 0) {
        this.state = 'race';
        for (const r of this.racers) r.controlLocked = false;
        // rocket start: on the gas right at GO
        if (c.throttle > 0 && this.countdown > -0.3) p.giveBoost(0.9, 1.25);
      }
    }
    if (this.state === 'race' || this.state === 'finished') this.raceTime += dt;

    // fixed sub-steps
    let left = Math.min(dt, 0.1);
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 120);
      left -= h;
      this.step(h);
    }

    if (this.recorder && this.state === 'race' && !p.finished) this.recorder.sample(this.raceTime, p);
    // rivals talk when they get past you (not too often)
    if (this.state === 'race' && !this.solo && !p.finished) {
      const place = this.placeOf(p);
      if (this.lastPlace && place > this.lastPlace && this.raceTime > (this.nextComms || 8)) {
        this.comms(this.standings()[place - 2], 'pass');
        this.nextComms = this.raceTime + 18;
      }
      this.lastPlace = place;
    }
    for (const g of this.ghosts) g.update(this.raceTime, p.mode);

    // visuals
    for (const r of this.racers) if (r.respawnT <= 0) r.syncVisual(dt);
    this.world.update(dt, this.t, p.mode);
    const look = c.look;
    if (this.state === 'intro') {
      // fly-by
      const a = this.introT * 0.5;
      const cam = this.cam;
      cam.cinematic = (dtc, C) => {
        C.pos.set(p.pos.x + Math.sin(a + p.yaw) * (24 - this.introT * 6), p.pos.y + 8 - this.introT * 2, p.pos.z + Math.cos(a + p.yaw) * (24 - this.introT * 6));
        C.look.copy(p.pos);
      };
    } else if (this.cam.cinematic) {
      this.cam.cinematic = null;
      this.cam.snap(p);
    }
    this.cam.update(dt, p, this.world, look);
    this.env.update(dt, this.t, this.cam.camera);
    this.aberr = Math.max(0, (this.aberr || 0) - dt * 3);
    this.app.renderer.setGrade('neon', this.aberr * 1.6 + (p.boostTime > 0 ? 0.3 : 0), 0);
    const A = this.app.audio;
    A.playerEngine(p.speed, p.phys.topSpeed, p.ctl.throttle, p.boostTime > 0, p.slip || 0, p.respawnT <= 0);
    const cam = this.cam.camera;
    cam.getWorldDirection(_v);
    const fl = Math.hypot(_v.x, _v.z) || 1;
    this._listener ||= { pos: new THREE.Vector3(), fwd: { x: 0, z: 1 }, vel: p.vel };
    this._listener.pos.copy(cam.position);
    this._listener.fwd.x = _v.x / fl;
    this._listener.fwd.z = _v.z / fl;
    this._listener.vel = p.vel;
    A.rivalEngines(this._listener, this.racers);

    // tips (tutorial track)
    for (const tip of this.def.tips || []) {
      const key = tip.at;
      if (this.tipShown.has(key) || p.lap > 1) continue;
      let d = tip.at - p.lastU;
      if (d < -0.5) d += 1;
      if (d > 0 && d < 0.03) {
        this.tipShown.add(key);
        this.emit('tip', { text: tip.text, key: tip.key });
      }
    }
  }

  step(dt) {
    const w = this.world;
    for (const r of this.racers) {
      if (r.respawnT > 0) {
        r.respawnT -= dt;
        if (r.respawnT <= 0) this.respawn(r);
        continue;
      }
      if (r.ai) {
        if (r.finished) {
          r.ai.update(dt);
          r.ctl.throttle *= 0.6;
        } else if (this.state === 'race') r.ai.update(dt);
      }
      if (r.finished && r.isPlayer) {
        // autopilot after the flag
        r.ctl.throttle = 0.3;
        r.ctl.steer = 0;
        r.ctl.drift = false;
      }
      r.update(dt, w, this);
      if (r.respawnT > 0) continue;
      // wedged against something: put rivals back on the road (the player has RESET)
      if (this.state === 'race' && !r.finished && Math.abs(r.speed) < 3) {
        r.stuckT = (r.stuckT || 0) + dt;
        if (r.stuckT > (r.isPlayer ? 6 : 2.5)) {
          r.stuckT = 0;
          this.onFell(r);
          continue;
        }
      } else r.stuckT = 0;
      this.features(r, dt);
      this.progress(r);
    }
    this.bump();
  }

  // obstacles, pads, shards
  features(r) {
    const w = this.world;
    const tr = r.track;
    if (!tr) return;
    const P = tr.path;
    for (const o of w.obstacles) {
      if (o.path !== P) continue;
      let di = tr.i - o.i;
      if (P.closed) {
        if (di > P.N / 2) di -= P.N;
        if (di < -P.N / 2) di += P.N;
      }
      const along = di * P.ds;
      if (Math.abs(along) > o.len + r.halfL + 1) {
        if (r.inside === o) r.inside = null;
        continue;
      }
      const dlat = tr.lat - o.lat;
      if (Math.abs(dlat) > o.w + r.halfW) continue;
      if (r.pos.y - P.py[o.i] > o.h + 1) continue;
      if (!solidIn(o.mask, r.mode)) {
        // phased straight through it
        if (r.inside !== o) {
          r.inside = o;
          r.energy = Math.min(1, r.energy + 0.04);
          if (r.isPlayer) {
            this.app.audio.play('phase');
            this.emit('popup', { text: 'PHASED', color: r.mode === RED ? '#ff4a6a' : r.mode === BLUE ? '#4ab0ff' : '#d8c8ff', small: true });
            this.stats.phased++;
          }
        }
        continue;
      }
      if (r.inside === o) continue; // shifted back while inside it: let them out
      // solid hit
      const tx = P.thx[o.i];
      const tz = P.thz[o.i];
      const penLat = o.w + r.halfW - Math.abs(dlat);
      const penAlong = o.len + r.halfL - Math.abs(along);
      if (o.type !== 'wall' && penLat < penAlong) {
        const s = Math.sign(dlat) || 1;
        r.pos.x += P.rightX(o.i) * s * penLat;
        r.pos.z += P.rightZ(o.i) * s * penLat;
        const vn = r.vel.x * P.rightX(o.i) * s + r.vel.z * P.rightZ(o.i) * s;
        if (vn < 0) {
          r.vel.x -= P.rightX(o.i) * s * vn * 1.4;
          r.vel.z -= P.rightZ(o.i) * s * vn * 1.4;
        }
        r.vel.multiplyScalar(0.94);
        if (r.isPlayer) this.app.audio.play('scrape');
      } else {
        const s = Math.sign(along) || -1;
        r.pos.x += tx * s * penAlong;
        r.pos.z += tz * s * penAlong;
        const vt = r.vel.x * tx + r.vel.z * tz;
        if (vt * s < 0) {
          r.vel.x -= tx * vt * 1.3;
          r.vel.z -= tz * vt * 1.3;
        }
        const hard = Math.abs(vt) > 12;
        if (hard) r.spinOut(o.type === 'wall' ? 0.9 : 0.6, Math.random() < 0.5 ? -1 : 1);
        if (r.isPlayer) {
          this.app.audio.play(o.type === 'wall' ? 'wall' : 'hit');
          this.cam.addShake(o.type === 'wall' ? 0.9 : 0.5);
          this.app.input.rumble(0, 0.8, 0.6, 250);
          this.aberr = 1;
          this.stats.crashes++;
          if (hard) this.emit('popup', { text: 'CRASH', color: '#ff4a6a' });
        }
      }
    }
    for (const pad of w.pads) {
      if (pad.path !== P || !solidIn(pad.mask, r.mode)) continue;
      let di = tr.i - pad.i;
      if (P.closed && di < -P.N / 2) di += P.N;
      if (di < 0 || di * P.ds > pad.len) continue;
      if (Math.abs(tr.lat - pad.lat) > pad.w + 0.5) continue;
      if (r.padCool > this.t) continue;
      r.padCool = this.t + 0.6;
      r.giveBoost(1.2, 1.32);
      if (r.isPlayer) {
        this.app.audio.play('boost');
        this.cam.fovPunch(8);
      }
    }
    for (const sh of w.shards) {
      if (sh.taken > 0 || !solidIn(sh.mask, r.mode)) continue;
      if (sh.root.position.distanceToSquared(r.pos) > 3.2 * 3.2) continue;
      sh.taken = 5;
      sh.root.visible = false;
      r.energy = Math.min(1, r.energy + SHIFT.shard);
      if (r.isPlayer) {
        this.app.audio.play('shard');
        this.emit('popup', { text: '+SHIFT', color: '#ffffff', small: true });
      }
    }
  }

  // Racers in different worlds pass through each other; anyone sharing a world bumps.
  bump() {
    const R = this.racers;
    for (let a = 0; a < R.length; a++) {
      const A = R[a];
      if (A.respawnT > 0) continue;
      for (let b = a + 1; b < R.length; b++) {
        const B = R[b];
        if (B.respawnT > 0) continue;
        if (!(A.mode & B.mode) && A.mode !== BOTH && B.mode !== BOTH) continue;
        _v.subVectors(B.pos, A.pos);
        if (Math.abs(_v.y) > 2) continue;
        _v.y = 0;
        const d = _v.length();
        const min = A.radius + B.radius;
        if (d > min || d < 1e-4) continue;
        _v.multiplyScalar(1 / d);
        // heavier cars shove lighter ones (GREAT WEDGE weighs as much as two wedges)
        const wa = B.mass / (A.mass + B.mass);
        const wb = 1 - wa;
        const pen = min - d;
        A.pos.addScaledVector(_v, -pen * wa);
        B.pos.addScaledVector(_v, pen * wb);
        const rel = (B.vel.x - A.vel.x) * _v.x + (B.vel.z - A.vel.z) * _v.z;
        if (rel < 0) {
          A.vel.addScaledVector(_v, rel * 1.2 * wa);
          B.vel.addScaledVector(_v, -rel * 1.2 * wb);
          if ((A.isPlayer || B.isPlayer) && rel < -4) {
            this.app.audio.play('hit');
            this.cam.addShake(0.2);
          }
        }
      }
    }
  }

  progress(r) {
    const tr = r.track;
    if (!tr || !r.grounded) return;
    if (tr.path !== r.lastPath) {
      if (!tr.path.closed) r.branchUses = (r.branchUses || 0) + 1;
      r.lastPath = tr.path;
    }
    const u = tr.path.mainU(tr.i);
    let du = u - r.lastU;
    if (du > 0.5) du -= 1;
    if (du < -0.5) du += 1;
    // a branch maps linearly onto the main loop; reject teleport-sized jumps (falls onto a lower strip)
    if (Math.abs(du) > 0.15) {
      r.lastU = u;
      return;
    }
    r.prog += du;
    r.lastU = u;
    r.wrongWay = (r.wrongWay || 0) + (du < -1e-5 ? 1 / 120 : -1 / 60);
    r.wrongWay = clamp(r.wrongWay, 0, 3);
    const lap = Math.floor(r.prog);
    if (lap > r.lap && !r.finished) {
      const lt = this.raceTime - r.lapStart;
      r.bestLap = Math.min(r.bestLap, lt);
      r.lapStart = this.raceTime;
      r.lap = lap;
      if (r.lap >= this.laps) this.finish(r);
      else if (r.isPlayer) {
        this.emit('lap', { lap: r.lap + 1, time: lt });
        this.app.audio.play('lap');
        if (r.lap === this.laps - 1) {
          this.emit('popup', { text: 'FINAL LAP', color: '#ff4fd8' });
          this.app.audio.play('finalLap');
        }
      }
    }
  }

  finish(r) {
    r.finished = true;
    r.finishTime = this.raceTime;
    this.finishOrder.push(r);
    if (r.isPlayer) {
      this.state = 'finished';
      this.app.audio.play('finish', this.solo || this.finishOrder.length <= 3 ? 1 : 0);
      if (this.recorder) {
        // a ghost is saved only when it beats the one you've got
        const old = loadGhost(this.def.id, this.mono);
        this.newGhost = !old || r.finishTime < old.time;
        this.ghostData = this.recorder.encode({ time: r.finishTime, car: r.car.id, track: this.def.id, mono: this.mono });
        if (this.newGhost && !this.opts.autopilot) saveGhost(this.def.id, this.mono, this.ghostData);
        this.medal = medalFor(r.finishTime, this.staffTime);
        if (!this.opts.autopilot) recordMedal(this.kind, this.def.id, this.medal);
      }
      if (!this.mono && !this.opts.autopilot) {
        const key = `rs.best.${this.def.id}`;
        const best = storage.get(key, null);
        this.newRecord = !best || r.finishTime < best.time;
        if (this.newRecord) storage.set(key, { time: r.finishTime, lap: r.bestLap, car: r.car.id });
        const lkey = `rs.lap.${this.def.id}`;
        const bl = storage.get(lkey, null);
        if (!bl || r.bestLap < bl) storage.set(lkey, r.bestLap);
      } else if (this.mono) this.newRecord = this.newGhost;
      this.emit('finish', { place: this.finishOrder.length });
      if (!this.solo) {
        const st = this.standings();
        const winner = st[0];
        // the winner gloats, or if you won, whoever came second sulks
        this.quote = winner.isPlayer ? this.comms(st[1], 'lose') : this.comms(winner, 'win');
        this.events.pop();
      }
    }
  }

  // Standings: finished racers by finish order, the rest by progress.
  standings() {
    const done = this.finishOrder.slice();
    const rest = this.racers.filter((r) => !r.finished).sort((a, b) => b.prog - a.prog);
    return done.concat(rest);
  }
  placeOf(r) {
    return this.standings().indexOf(r) + 1;
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}

