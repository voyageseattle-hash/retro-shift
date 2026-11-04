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
const NO_INPUT = { throttle: 0, brake: 0, steer: 0, drift: false, item: false, special: false, jump: false, reset: false, look: false };

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
    // Wall coaching: until a player has phased through a few walls, a wall that's solid in their lens is called out
    // (with the button that gets them through) and stays called out until they shift or pass it.
    this.coachLeft = 6 - storage.get('rs.coach.phased', 0);
    this.stats = { phased: 0, crashes: 0, shifts: 0 };
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
        r.speedMul = [0.9, 0.97, 1.02][diff] + (k / field) * 0.03;
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

  respawn(r) {
    const u = r.lastU;
    const sp = this.world.respawnPoint(u, r.mono ? r.mode : BOTH);
    r.reset(sp.pos, sp.yaw);
    if (r.mono) r.energy = Math.max(r.energy, SHIFT.monoCost);
    else r.mode = BOTH;
    r.grounded = true;
    r.invuln = 1.5;
    r.vel.set(Math.sin(sp.yaw), 0, Math.cos(sp.yaw)).multiplyScalar(12);
    if (r.ai) Object.assign(r.ai, { path: this.world.main, _branch: null, turn: 0, pinned: 0, planT: 0 });
    if (r.isPlayer) {
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
    if (this.state === 'race' && !this.solo && !this.split && !p.finished) {
      const place = this.placeOf(p);
      if (this.lastPlace && place > this.lastPlace && this.raceTime > (this.nextComms || 8)) {
        this.comms(this.standings()[place - 2], 'pass');
        this.nextComms = this.raceTime + 18;
      }
      this.lastPlace = place;
    }
    for (const g of this.ghosts) g.update(this.raceTime, p.mode);

    // visuals
    this.app.net?.applyPuppets(this);
    for (const r of this.racers) if (r.puppet ? r.root.visible : r.respawnT <= 0) r.syncVisual(dt);
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
    // player 2 is heard like a rival, from player 1's camera
    A.rivalEngines(this._listener, this.racers, this.split ? p : null);

    // wall coaching
    if (this.state === 'race' && this.coachLeft > 0) for (const pl of this.players) this.coachWalls(pl);
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
            this.emitP(r, 'popup', { text: 'PHASED', color: r.mode === RED ? '#ff4a6a' : r.mode === BLUE ? '#4ab0ff' : '#d8c8ff', small: true });
            this.stats.phased++;
            if (o.type === 'wall' && this.coachLeft > 0) {
              this.coachLeft--;
              storage.set('rs.coach.phased', 6 - this.coachLeft);
            }
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
      if (!this.mono && !this.opts.autopilot && !this.online) {
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

