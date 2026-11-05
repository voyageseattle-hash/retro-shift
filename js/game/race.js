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
import { Debris } from './wreck.js';
import { SpeedLines } from './speedlines.js';
import { Storms } from './storms.js';
import { Reflection } from './reflect.js';
import { Construction } from './construction.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _c = new THREE.Color();
const _s = new THREE.Vector2();
// closing speeds (m/s) that wreck a car: into a wall or block, and a car rammed by another
const WRECK_SPEED = 30;
const TAKEDOWN_SPEED = 14;
const NO_INPUT = { throttle: 0, brake: 0, steer: 0, drift: false, item: false, special: false, jump: false, reset: false, look: false };

export class Race {
  constructor(app, def, opts = {}) {
    this.app = app;
    this.kind = opts.kind || (opts.rivals === 0 ? 'trial' : 'race');
    this.mono = this.kind === 'mono';
    this.tutorial = this.kind === 'tutorial';
    this.solo = this.kind === 'trial' || this.mono || this.tutorial;
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
    // Wall coaching on the first run: a wall that's solid in your lens is called out (with the button that gets you
    // through) until you shift or pass it. Everywhere else the roadside signs do that job.
    this.coachLeft = this.tutorial ? 99 : 0;
    this.lesson = 0;
    this.stats = { phased: 0, crashes: 0, shifts: 0, wrecks: 0, takedowns: 0 };
    this.debris = new Debris();
    this.scene.add(this.debris.mesh);
    this.speedLines = new SpeedLines();
    this.scene.add(this.speedLines.mesh);
    this.storms = new Storms(this);
    this.reflection = new Reflection();
    this.scene.add(this.storms.group);
    // the course hazards that change lap by lap: road works (Fractal Route)
    this.works = new Construction(this);
    this.scene.add(this.works.group);
    this.slowT = 0;
    // player + rivals. Online, the host's slot list decides the grid: each slot is a person or an AI rival, and every
    // browser simulates only its own racers (the host also runs the AI); everyone else is a puppet fed by the network.
    this.online = opts.online || null;
    this.split = !!opts.split;
    const playerCar = CARS.find((c) => c.id === opts.car) || CARS[0];
    const field = this.online ? this.online.slots.length - 1 : opts.rivals ?? 5;
    const others = CARS.filter((c) => c !== playerCar && !c.secret);
    const others2 = this.split ? others.filter((c) => c.id !== opts.car2) : others;
    const diff = opts.difficulty ?? 1; // 0 easy, 1 normal, 2 hard
    for (let k = 0; k <= field; k++) {
      const S = this.online?.slots[k];
      // offline, the player starts at the back of the grid (in split-screen, player 2 just ahead of player 1)
      const pIndex = S ? (S.slot === this.online.mySlot ? 0 : -1) : k === field ? 0 : this.split && k === field - 1 ? 1 : -1;
      const isPlayer = pIndex >= 0;
      const pCar = pIndex === 1 ? CARS.find((c) => c.id === opts.car2) || CARS[1] : playerCar;
      const car = S ? CARS.find((c) => c.id === S.car) || CARS[0] : isPlayer ? pCar : others2[k % others2.length];
      const name = isPlayer ? (this.split ? `P${pIndex + 1}` : 'YOU') : S?.human ? S.name : car.name;
      const r = new Racer(car, { isPlayer, index: k, name, livery: isPlayer ? (pIndex === 1 ? opts.livery2 : opts.livery) : S?.livery || null });
      if (isPlayer) r.pIndex = pIndex;
      r.session = this;
      if (S) {
        r.slot = S.slot;
        r.human = !!S.human;
        // puppets: other people's racers, and (on a joiner's screen) the host's AI
        r.puppet = !isPlayer && (S.human || !this.online.isHost);
      }
      if (this.mono) {
        r.mono = true;
        r.mode = RED;
      }
      const slot = this.world.gridSlot(field - k);
      r.reset(slot.pos, slot.yaw);
      r.hints[this.world.main.id] = slot.i;
      r.hints._cur = this.world.main.id;
      r.grounded = true;
      r.lastU = this.world.main.mainU(slot.i);
      r.prog = r.lastU > 0.5 ? r.lastU - 1 : r.lastU;
      r.lap = 0;
      r.bestLap = Infinity;
      r.lapStart = 0;
      r.finished = false;
      r.respawnT = 0;
      if (!isPlayer && !r.puppet) {
        const skill = clamp([0.55, 0.75, 0.92][diff] + (k / field) * 0.1 + rand(-0.05, 0.05), 0.3, 1);
        r.ai = new RaceAI(r, this.world, skill);
        // (a step up from the car's own pace: rivals mostly ride BOTH, which is the slow lens)
        r.speedMul = [0.93, 1.0, 1.05][diff] + (k / field) * 0.03;
      } else if (isPlayer) {
        if (pIndex === 0) this.player = r;
        this.players ||= [];
        this.players[pIndex] = r;
        // headless staff runs: the AI drives the player's car flat out
        if (opts.autopilot) r.ai = new RaceAI(r, this.world, 1);
      }
      this.scene.add(r.root, r.trail.mesh);
      this.racers.push(r);
    }
    this.cams = [this.cam];
    if (this.split) {
      const c2 = new ChaseCamera();
      c2.camera.far = 6000;
      c2.camera.updateProjectionMatrix();
      this.cams.push(c2);
    }
    this.players.forEach((p, k) => this.cams[k].snap(p));
    // the lens-shift wave starts from the player's car (split-screen fades each view instead)
    this.world.layers.waveAt = this.split ? null : this.player.pos;
    this.events = [];
    this.lastMode = BOTH;
    // ghosts: your best run and the staff run
    this.ghosts = [];
    if (this.solo && !this.tutorial) {
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
    const d = r && !r.human && driverOf(r.car.id);
    if (!d) return;
    const text = Array.isArray(d[kind]) ? pick(d[kind]) : d[kind];
    if (!text) return;
    const msg = { id: r.car.id, name: d.name, car: r.car.name, color: r.color, text, kind };
    this.emit('comms', msg);
    return msg;
  }

  camOf(r) {
    return this.cams[r.pIndex || 0] || this.cam;
  }
  emitP(r, type, data = {}) {
    this.emit(type, { ...data, pi: r.pIndex || 0 });
  }
  // A player's lens changed: their view's sky and grid follow it, and the music follows the lens (in split-screen,
  // only when both players agree; otherwise it plays both worlds).
  lensChanged(r) {
    const k = r.pIndex || 0;
    if (this.split) this.env.useView(k);
    this.env.setMode(r.mode);
    if (this.split) this.env.useView(0);
    const modes = new Set(this.players.map((p) => p.mode));
    this.app.audio.setMode(modes.size === 1 ? r.mode : BOTH);
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  // ------------------------------------------------------------ session hooks (called by racers)
  onShift(r, prev, mode, forced) {
    if (!forced) r.lastShiftT = this.t;
    if (r.isPlayer) {
      this.app.audio.play('shift', mode);
      this.lensChanged(r);
      this.camOf(r).fovPunch(mode === BOTH ? 3 : 6);
      this.camOf(r).addShake(0.15);
      this.aberr = 1;
      this.stats.shifts++;
      this.emitP(r, 'shift', { mode, forced });
    }
  }
  onShiftDenied(r) {
    if (r.isPlayer) {
      this.app.audio.play('denied');
      this.emitP(r, 'denied');
    }
  }
  onDriftLevel(r, lvl) {
    if (r.isPlayer) this.emitP(r, 'drift', { lvl });
  }
  onMiniTurbo(r, lvl) {
    if (r.isPlayer) {
      this.app.audio.play('turbo', lvl);
      this.emitP(r, 'popup', { text: ['', 'TURBO', 'SUPER TURBO', 'ULTRA TURBO'][lvl], color: '#ff4fd8' });
    }
  }
  onWallHit(r, impact) {
    if (impact > 6 && this.near(r)) this.debris.sparks(r.pos, _v.copy(r.vel).multiplyScalar(-0.03), Math.min(24, impact), 0xffd27a, 14, r.gnd.y);
    if (r.isPlayer && impact > 6) {
      this.app.audio.play('scrape');
      this.camOf(r).addShake(Math.min(0.4, impact * 0.02));
      this.app.input.rumble(0, 0.3, 0.2, 80);
    }
  }
  onLand(r, impact) {
    if (r.isPlayer && impact > 6) {
      this.app.audio.play('land', impact);
      this.camOf(r).addShake(Math.min(0.5, impact * 0.025));
    }
  }
  onFell(r) {
    if (r.respawnT > 0) return;
    r.falls = (r.falls || 0) + 1;
    r.respawnT = 1.1;
    r.root.visible = false;
    if (r.isPlayer) {
      this.app.audio.play('fall');
      this.emitP(r, 'popup', { text: r.mode === BOTH ? 'FELL' : `NO ROAD IN ${MODE_NAME[r.mode]}`, color: '#ff4a6a' });
    }
  }

  // A respawned car traces its lines back in over half a second; its hull fills in once the frame is mostly there.
  drawIn(r, dt) {
    r.drawIn = Math.min(1, r.drawIn + dt / 0.55);
    const f = r.drawIn;
    const done = f >= 1;
    r.root.traverse((o) => {
      if (o.isLineSegments && o.geometry?.getAttribute('position')) {
        const n = o.geometry.getAttribute('position').count;
        o.geometry.setDrawRange(0, done ? Infinity : Math.ceil((n * f * f) / 2) * 2);
      } else if (o.isMesh && o.userData.hull) o.visible = done || f > 0.65;
    });
    if (done) r.drawIn = undefined;
  }

  // Is this racer close enough to the camera for its debris to be worth drawing?
  near(r) {
    return this.players.some((p) => p.pos.distanceToSquared(r.pos) < 260 * 260);
  }

  // The car comes apart into its own lines and respawns a moment later.
  wreck(r, by) {
    if (r.respawnT > 0 || r.finished || (r.invuln > 0 && !by)) return;
    if (this.near(r)) {
      this.debris.burst(r.root, r.vel, 16, r.gnd.y);
      this.debris.sparks(r.pos, _v.set(0, 0, 0), 40, 0xffd27a, 26, r.gnd.y);
    }
    r.wrecks = (r.wrecks || 0) + 1;
    r.respawnT = 1.8;
    r.root.visible = false;
    r.drift.active = false;
    r.vel.set(0, 0, 0);
    r.speed = 0;
    if (r.isPlayer) {
      this.stats.wrecks++;
      this.emitP(r, 'popup', { text: 'WRECKED', color: '#ff4a6a' });
      this.app.input.rumble(r.pIndex || 0, 1, 1, 500);
      this.aberr = 1.5;
    }
    if (by?.isPlayer) {
      this.stats.takedowns++;
      by.takedowns = (by.takedowns || 0) + 1;
      this.emitP(by, 'popup', { text: 'TAKEDOWN', color: '#ffd04a' });
      this.app.input.rumble(by.pIndex || 0, 0.8, 0.8, 300);
    }
    const seen = r.isPlayer || by?.isPlayer || this.players.some((p) => p.pos.distanceToSquared(r.pos) < 60 * 60);
    if (seen) {
      this.app.audio.play('wreck');
      for (const p of this.players) {
        const cam = this.camOf(p);
        cam.addShake(p === r ? 1.2 : 0.7);
        cam.fovPunch(p === r ? 12 : 7);
      }
      // a beat of slow motion, solo screens only (online and split-screen keep real time)
      if (!this.online && !this.split) {
        this.slowLen = r.isPlayer ? 0.9 : 0.7;
        this.slowT = this.slowLen;
      }
    }
  }

  // A block (not a wall) breaks into its lines and is gone for a while.
  smash(o, r) {
    if (o.broken || o.type === 'wall') return;
    o.broken = true;
    if (this.near(r)) this.debris.burst(o.root, _v.copy(r.vel).multiplyScalar(0.8), 12, o.path.py[o.i], 1, 3);
    o.root.visible = false;
    if (r.isPlayer) {
      this.emitP(r, 'popup', { text: 'SMASHED', color: '#ffffff', small: true });
      this.app.audio.play('smash');
    }
    setTimeout(() => {
      o.broken = false;
      o.root.visible = true;
    }, 20000);
  }

  // A glancing hit: sparks, and a few lines torn off the car.
  scrape(r, into, dir) {
    if (!this.near(r)) return;
    this.debris.sparks(r.pos, dir.multiplyScalar(0.6), Math.round(10 + into), 0xffd27a, 16, r.gnd.y);
    if (into > 8) this.debris.burst(r.root, _a.copy(dir).multiplyScalar(into * 0.4).add(r.vel), 6, r.gnd.y, Math.min(0.18, into * 0.008), 1.6);
  }

  respawn(r) {
    const u = r.lastU;
    const sp = this.world.respawnPoint(u, r.mono ? r.mode : BOTH);
    r.reset(sp.pos, sp.yaw);
    // start the road search at the respawn sample: on a stacked course (Helix) the nearest sample with no hint can
    // be a loop above or below, and you'd fall straight back out
    r.hints[this.world.main.id] = sp.i;
    r.hints._cur = this.world.main.id;
    if (r.mono) r.energy = Math.max(r.energy, SHIFT.monoCost);
    else r.mode = BOTH;
    r.grounded = true;
    r.wrongWay = 0;
    r.invuln = 1.5;
    r.vel.set(Math.sin(sp.yaw), 0, Math.cos(sp.yaw)).multiplyScalar(12);
    if (r.ai) Object.assign(r.ai, { path: this.world.main, _branch: null, turn: 0, pinned: 0, planT: 0 });
    // the car draws itself back in, line by line, with a flash where it lands
    r.drawIn = 0;
    if (this.near(r)) this.debris.sparks(r.pos, _v.set(0, 0, 0), 28, 0xffffff, 12, r.pos.y - 0.3);
    if (r.isPlayer) {
      this.app.audio.play('phase');
      this.lensChanged(r);
      this.cam.snap(r);
    }
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    this.t += dt;
    const input = this.app.input;
    const p = this.player;
    // player controls (two sets in split-screen)
    const C = this.players.map((pl, k) => (this.app.paused ? NO_INPUT : input.controls(k)));
    this.players.forEach((pl, k) => {
      const c = C[k];
      pl.ctl.throttle = c.throttle;
      pl.ctl.brake = c.brake;
      pl.ctl.steer = c.steer;
      pl.ctl.drift = c.drift;
      if (this.state !== 'race' || pl.finished) return;
      if (c.item) pl.setMode(RED, this);
      if (c.special) pl.setMode(BLUE, this);
      if (c.jump) {
        if (pl.mono) pl.setMode(BOTH, this);
        else if (pl.mode !== BOTH) pl.shiftTo(BOTH, this);
      }
      if (c.reset && pl.respawnT <= 0 && !pl.resetHeld) {
        pl.resetHeld = true;
        this.onFell(pl);
      }
      if (!c.reset) pl.resetHeld = false;
    });
    if (this.state === 'intro') {
      if (this.introT < 0.5 && this.introT + dt >= 0.5 && !this.solo) this.comms(pick(this.racers.filter((r) => !r.isPlayer && !r.human)), 'pre');
      this.introT += dt;
      for (const r of this.racers) r.controlLocked = true;
      if (this.online ? this.netGo : this.introT > 2.2 || input.menu('confirm')) {
        this.state = 'countdown';
        this.lastBeep = 4;
      }
    } else if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastBeep) {
        this.lastBeep = n;
        this.app.audio.play('beep', n <= 0);
        this.app.audio.announce(['go', 'one', 'two', 'three'][n] || '');
        this.emit('count', { n });
      }
      if (this.countdown <= 0) {
        this.state = 'race';
        for (const r of this.racers) r.controlLocked = false;
        // rocket start: on the gas right at GO
        this.players.forEach((pl, k) => C[k].throttle > 0 && this.countdown > -0.3 && pl.giveBoost(0.9, 1.25));
      }
    }
    // a wreck or a takedown slows the whole race for a beat (real time keeps running for the camera)
    const sim = this.slowT > 0 ? dt * (0.25 + 0.75 * Math.max(0, 1 - this.slowT / this.slowLen) ** 2) : dt;
    this.slowT = Math.max(0, this.slowT - dt);
    if (this.state === 'race' || this.state === 'finished') this.raceTime += sim;

    // fixed sub-steps
    let left = Math.min(sim, 0.1);
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 120);
      left -= h;
      this.step(h);
    }

    if (this.recorder && this.state === 'race' && !p.finished) this.recorder.sample(this.raceTime, p);
    // rivals talk when they get past you (not too often)
    if (this.state === 'race' && !this.solo && !this.split && !p.finished) {
      const place = this.placeOf(p);
      if (this.lastPlace && place > this.lastPlace && this.raceTime > (this.nextComms || 8)) {
        this.comms(this.standings()[place - 2], 'pass');
        this.nextComms = this.raceTime + 18;
      }
      this.lastPlace = place;
    }
    for (const g of this.ghosts) g.update(this.raceTime, p.mode);
    this.debris.update(sim);
    this.storms.update(sim, p);
    this.works.update(sim);

    // visuals
    this.app.net?.applyPuppets(this);
    for (const r of this.racers) if (r.puppet ? r.root.visible : r.respawnT <= 0) r.syncVisual(dt);
    for (const r of this.racers) if (r.drawIn !== undefined && r.respawnT <= 0) this.drawIn(r, dt);
    if (this.split) {
      // the obstacles move once; each view then fades the worlds for its own player's lens (see views())
      for (const fn of this.world.animated) fn(this.t, dt);
      this.players.forEach((pl, k) => {
        this.world.layers.useView(k);
        this.world.layers.update(dt, pl.mode, this.t);
      });
    } else this.world.update(dt, this.t, p.mode);
    this.players.forEach((pl, k) => {
      const cam = this.cams[k];
      if (this.state === 'intro') {
        // fly-by
        const a = this.introT * 0.5 + k * 1.4;
        cam.cinematic = (dtc, CC) => {
          CC.pos.set(pl.pos.x + Math.sin(a + pl.yaw) * (24 - this.introT * 6), pl.pos.y + 8 - this.introT * 2, pl.pos.z + Math.cos(a + pl.yaw) * (24 - this.introT * 6));
          CC.look.copy(pl.pos);
        };
      } else if (cam.cinematic && !cam.held) {
        // (a held cinematic, cam.held, is a shot someone else is directing: trailer and replay cameras)
        cam.cinematic = null;
        cam.snap(pl);
      }
      cam.update(dt, pl, this.world, C[k].look);
    });
    this.dtLast = dt;
    if (!this.split) this.env.update(dt, this.t, this.cam.camera);
    if (!this.split) {
      const k = (p.respawnT > 0 || !p.grounded ? 0 : Math.abs(p.speed) / p.phys.topSpeed) + (p.boostTime > 0 ? 0.3 : 0);
      this.speedLines.update(dt, this.cam.camera, k, _c.set(p.mode === RED ? 0xff4a6a : p.mode === BLUE ? 0x4ab0ff : 0xe8dcff));
    } else this.speedLines.mesh.visible = false;
    this.aberr = Math.max(0, (this.aberr || 0) - dt * 3);
    this.app.renderer.setGrade('neon', this.aberr * 1.6 + (p.boostTime > 0 ? 0.3 : 0), this.storms.flash || 0);
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
    // player 2 is heard like a rival, from player 1's camera
    A.rivalEngines(this._listener, this.racers, this.split ? p : null);

    // wall coaching
    if (this.state === 'race' && this.coachLeft > 0) for (const pl of this.players) this.coachWalls(pl);
    if (this.tutorial && this.state === 'race') this.coachLessons(p, dt);
    // tips (first run only)
    for (const tip of (this.tutorial && this.def.tips) || []) {
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

  // The lens that phases through a wall of this mask, as a tip: { text, key }. Null if no lens does.
  throughWay(mask) {
    const red = !solidIn(mask, RED);
    const blue = !solidIn(mask, BLUE);
    if (!red && !blue) return null;
    const colour = red && blue ? 'WHITE' : red ? 'BLUE' : 'RED';
    const to = red && !blue ? 'RED' : 'BLUE';
    if (this.mono) return { text: `${colour} WALL: SWAP TO ${to}`, key: 'both' };
    return { text: `${colour} WALL: SHIFT TO ${to}`, key: to === 'RED' ? 'red' : 'blue' };
  }

  // First run: gas, steer, back to BOTH, drift, one at a time. Wall tips take the tip line while a wall is ahead.
  coachLessons(p, dt) {
    if (p.finished || p.coachWall) return;
    this.lessonT = (this.lessonT || 0) + dt;
    const say = (text, key, hold = 0) => {
      this.emitP(p, 'tip', { text, key, hold });
      this.lessonT = 0;
      this.lesson++;
    };
    switch (this.lesson) {
      case 0:
        return say('HOLD THE GAS', 'gas');
      case 1:
        if (p.speed > 12) say('STEER', 'steer', 2.5);
        return;
      case 2:
        // after the first wall you phase through
        if (this.stats.phased > 0 && this.lessonT > 0.6) say('SHIFT DRAINS AS YOU HOLD IT · BOTH REFILLS IT', 'both', 3.5);
        return;
      case 3:
        if (this.stats.phased > 1 && this.lessonT > 0.6) say('HOLD DRIFT THROUGH TURNS · LET GO FOR A TURBO', 'drift', 4);
        return;
      case 4:
        if (this.lessonT > 6) say('RED IS THE FAST LENS · BLUE GRIPS AND DRIFTS', 'red', 4);
        return;
    }
  }

  coachWalls(r) {
    const tr = r.track;
    if (!tr || r.finished) return;
    const P = tr.path;
    let near = null;
    let nearD = 1e9;
    for (const o of this.world.obstacles) {
      if (o.type !== 'wall' || o.path !== P) continue;
      let di = o.i - tr.i;
      if (P.closed) {
        if (di > P.N / 2) di -= P.N;
        if (di < -P.N / 2) di += P.N;
      }
      const ahead = di * P.ds;
      if (ahead > 0 && ahead < 90 && ahead < nearD) {
        near = o;
        nearD = ahead;
      }
    }
    const solid = near && solidIn(near.mask, r.mode) && this.throughWay(near.mask);
    if (solid && r.coachWall !== near) {
      r.coachWall = near;
      this.emitP(r, 'tip', { ...this.throughWay(near.mask), hold: 0 });
    } else if (!solid && r.coachWall) {
      r.coachWall = null;
      this.emitP(r, 'tipoff');
    }
  }

  // Before each frame is drawn: the wet-road reflection (one view, high quality only).
  beforeRender(renderer) {
    const gl = renderer.renderer;
    const on = !this.split && renderer.quality === 'high';
    const size = gl.getDrawingBufferSize(_s);
    const p = this.player;
    this.reflection.render(gl, this.scene, this.cam.camera, p.gnd?.y ?? p.pos.y, on ? 0.2 : 0, size.x, size.y, this.t);
  }

  // What to draw: one full-screen view, or two stacked views (player 1 on top), each prepared for its own lens.
  views() {
    if (!this.split) return [{ camera: this.cam.camera, x: 0, y: 0, w: 1, h: 1 }];
    return this.players.map((pl, k) => ({
      camera: this.cams[k].camera,
      x: 0,
      y: k === 0 ? 0.5 : 0,
      w: 1,
      h: 0.5,
      before: () => {
        this.world.layers.useView(k);
        this.world.layers.update(0, pl.mode, this.t);
        this.env.useView(k);
        this.env.update(this.dtLast || 0, this.t, this.cams[k].camera);
      },
    }));
  }
  setAspect(a) {
    for (const c of this.cams) c.setAspect(this.split ? a * 2 : a);
  }

  step(dt) {
    const w = this.world;
    for (const r of this.racers) {
      if (r.puppet) continue;
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
      if (r.finished && r.isPlayer && !r.ai) {
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
      this.progress(r, dt);
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
      if (o.path !== P || o.broken) continue;
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
          // shifted at the last moment: a CLOSE PHASE throws you through it with a boost and some SHIFT back
          const close = this.t - (r.lastShiftT ?? -9) < 0.45 && o.type === 'wall';
          if (close) {
            r.giveBoost(0.9, 1.3);
            r.energy = Math.min(1, r.energy + 0.12);
            if (r.isPlayer) {
              this.emitP(r, 'popup', { text: 'CLOSE PHASE', color: '#ffffff' });
              this.app.audio.play('turbo', 2);
              this.camOf(r).fovPunch(8);
              this.stats.close = (this.stats.close || 0) + 1;
            }
          }
          if (r.isPlayer) {
            this.app.audio.play('phase');
            this.emitP(r, 'popup', { text: 'PHASED', color: r.mode === RED ? '#ff4a6a' : r.mode === BLUE ? '#4ab0ff' : '#d8c8ff', small: true });
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
        if (r.isPlayer && vn < -2) this.app.audio.play('scrape');
      } else {
        const s = Math.sign(along) || -1;
        r.pos.x += tx * s * penAlong;
        r.pos.z += tz * s * penAlong;
        const vt = r.vel.x * tx + r.vel.z * tz;
        const into = vt * s < 0 ? Math.abs(vt) : 0;
        if (into > 0) {
          r.vel.x -= tx * vt * 1.3;
          r.vel.z -= tz * vt * 1.3;
        }
        // Pressing against a wall touches it every frame: only a fresh impact crashes, shakes and rumbles.
        if (into < 3 || r.hitCd > 0) continue;
        r.hitCd = 0.5;
        // flat out into it: the car comes apart
        if (into > WRECK_SPEED) {
          this.wreck(r, null);
          if (o.type !== 'wall') this.smash(o, r);
          continue;
        }
        // a block hit hard enough breaks; anything you hit throws sparks and scraps
        if (o.type !== 'wall' && into > 14) this.smash(o, r);
        this.scrape(r, into, _v.set(-tx * s, 0, -tz * s));
        const hard = into > 12;
        if (hard) r.spinOut(o.type === 'wall' ? 0.9 : 0.6, Math.random() < 0.5 ? -1 : 1);
        if (r.isPlayer) {
          this.app.audio.play(o.type === 'wall' ? 'wall' : 'hit');
          this.camOf(r).addShake(o.type === 'wall' ? 0.9 : 0.5);
          this.app.input.rumble(0, 0.8, 0.6, 250);
          this.aberr = 1;
          this.stats.crashes++;
          if (hard) this.emitP(r, 'popup', { text: 'CRASH', color: '#ff4a6a' });
          const way = o.type === 'wall' && this.throughWay(o.mask);
          if (way) this.emitP(r, 'tip', { ...way, text: `${way.text} TO PHASE THROUGH`, hold: 3 });
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
        this.camOf(r).fovPunch(8);
      }
    }
    for (const sh of w.shards) {
      if (sh.taken > 0 || !solidIn(sh.mask, r.mode)) continue;
      if (sh.root.position.distanceToSquared(r.pos) > 3.2 * 3.2) continue;
      sh.taken = 5;
      sh.root.visible = false;
      if (this.online) this.app.net?.shard(w.shards.indexOf(sh));
      r.energy = Math.min(1, r.energy + SHIFT.shard);
      if (r.isPlayer) {
        this.app.audio.play('shard');
        this.emitP(r, 'popup', { text: '+SHIFT', color: '#ffffff', small: true });
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
        if (A.puppet && B.puppet) continue;
        // a puppet is moved by its own browser, so only our side of the bump moves here
        let wa = B.mass / (A.mass + B.mass);
        let wb = 1 - wa;
        if (A.puppet) [wa, wb] = [0, 1];
        if (B.puppet) [wa, wb] = [1, 0];
        const pen = min - d;
        A.pos.addScaledVector(_v, -pen * wa);
        B.pos.addScaledVector(_v, pen * wb);
        const rel = (B.vel.x - A.vel.x) * _v.x + (B.vel.z - A.vel.z) * _v.z;
        if (rel < 0) {
          A.vel.addScaledVector(_v, rel * 1.2 * wa);
          B.vel.addScaledVector(_v, -rel * 1.2 * wb);
          if ((A.isPlayer || B.isPlayer) && rel < -4) {
            this.app.audio.play('hit');
            this.camOf(A.isPlayer ? A : B).addShake(0.2);
          }
          if (rel < -4 && this.near(A)) this.debris.sparks(_a.copy(A.pos).lerp(B.pos, 0.5).setY(A.pos.y + 0.5), _v, Math.round(-rel), 0xffffff, 10, A.gnd.y);
          // Rammed: the car that got hit from behind (or T-boned) comes apart. Online it's left alone: each
          // browser owns its own car.
          // (not in the first seconds off the grid, where the whole field is nose to tail)
          if (rel < -TAKEDOWN_SPEED && this.state === 'race' && this.raceTime > 4 && !this.online) {
            // the one moving slower along the hit is the one being hit
            const va = A.vel.x * _v.x + A.vel.z * _v.z;
            const vb = B.vel.x * _v.x + B.vel.z * _v.z;
            const victim = va > vb ? B : A;
            const by = victim === A ? B : A;
            // you're tougher than the field: it takes a harder hit to wreck the player
            if (!victim.isPlayer || rel < -TAKEDOWN_SPEED * 1.5) this.wreck(victim, by);
          }
        }
      }
    }
  }

  progress(r, dt) {
    const tr = r.track;
    if (!tr || !r.grounded) return;
    // Wrong way: moving back down the road, or sat facing back down it. (Progress along the loop can't tell: at
    // driving speed the road sample under you only changes every few steps.)
    const P = tr.path;
    const along = r.vel.x * P.thx[tr.i] + r.vel.z * P.thz[tr.i];
    const facing = Math.sin(r.yaw) * P.thx[tr.i] + Math.cos(r.yaw) * P.thz[tr.i];
    if (along < -2 || (along <= 2 && facing < -0.3)) r.wrongWay = Math.min(2, (r.wrongWay || 0) + dt);
    else if (along > 2) r.wrongWay = Math.max(0, (r.wrongWay || 0) - dt * 3);
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
    const lap = Math.floor(r.prog);
    if (lap > r.lap && !r.finished) {
      const lt = this.raceTime - r.lapStart;
      r.bestLap = Math.min(r.bestLap, lt);
      r.lapStart = this.raceTime;
      r.lap = lap;
      if (r.lap >= this.laps) this.finish(r);
      else if (r.isPlayer) {
        this.emitP(r, 'lap', { lap: r.lap + 1, time: lt });
        this.app.audio.play('lap');
        if (r.lap === this.laps - 1) {
          this.emitP(r, 'popup', { text: 'FINAL LAP', color: '#ff4fd8' });
          this.app.audio.play('finalLap');
          this.app.audio.announce('final', 0.25);
        } else if (r.lap === 1) this.app.audio.announce('lap2', 0.25);
      }
    }
  }

  finish(r) {
    r.finished = true;
    r.finishTime = this.raceTime;
    this.finishOrder.push(r);
    // after the flag the AI takes your craft round on a cool-down lap
    if (r.isPlayer && !r.ai && !r.puppet) r.ai = new RaceAI(r, this.world, 0.6);
    if (r.isPlayer && this.split) {
      // split-screen: the race ends when both players are home
      this.emitP(r, 'finish', { place: this.placeOf(r) });
      this.app.audio.play('finish', this.placeOf(r) <= 3 ? 1 : 0);
      if (this.players.every((pl) => pl.finished)) {
        this.state = 'finished';
        const [a, b] = this.players;
        this.app.audio.announce(this.placeOf(a) < this.placeOf(b) ? 'p1wins' : 'p2wins', 0.5);
      }
    } else if (r.isPlayer) {
      this.state = 'finished';
      this.app.audio.play('finish', this.solo || this.placeOf(r) <= 3 ? 1 : 0);
      if (!this.solo) this.app.audio.announce(['winner', 'second', 'third'][this.placeOf(r) - 1] || 'over', 0.45);
      if (this.recorder) {
        // a ghost is saved only when it beats the one you've got
        const old = loadGhost(this.def.id, this.mono);
        this.newGhost = !old || r.finishTime < old.time;
        this.app.audio.announce(this.newGhost ? 'record' : 'over', 0.45);
        this.ghostData = this.recorder.encode({ time: r.finishTime, car: r.car.id, track: this.def.id, mono: this.mono });
        if (this.newGhost && !this.opts.autopilot) saveGhost(this.def.id, this.mono, this.ghostData);
        this.medal = medalFor(r.finishTime, this.staffTime);
        if (!this.opts.autopilot) recordMedal(this.kind, this.def.id, this.medal);
      }
      if (!this.mono && !this.tutorial && !this.opts.autopilot && !this.online) {
        const key = `rs.best.${this.def.id}`;
        const best = storage.get(key, null);
        this.newRecord = !best || r.finishTime < best.time;
        if (this.newRecord) storage.set(key, { time: r.finishTime, lap: r.bestLap, car: r.car.id });
        const lkey = `rs.lap.${this.def.id}`;
        const bl = storage.get(lkey, null);
        if (!bl || r.bestLap < bl) storage.set(lkey, r.bestLap);
      } else if (this.mono) this.newRecord = this.newGhost;
      this.emitP(r, 'finish', { place: this.placeOf(r) });
      if (!this.solo && !this.online) {
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
    const done = this.racers.filter((r) => r.finished).sort((a, b) => a.finishTime - b.finishTime);
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

