// One race: the course, six racers, the chase camera, laps and places, and everything the shift touches (walls you
// phase through, bridges that vanish, shards that refill the lens).

import * as THREE from '../../vendor/three.js';
import { TrackWorld } from '../world/track.js';
import { Racer, CARS } from '../vehicles/racer.js';
import { SKIM } from '../vehicles/forms.js';
import { RaceAI } from '../vehicles/ai.js';
import { ChaseCamera } from './camera.js';
import { Environment } from './env.js';
import { BOTH, RED, BLUE, SHIFT, solidIn, MODE_NAME } from '../world/shift.js';
import { clamp, rand, storage } from '../core/util.js';
import { GhostRecorder, GhostCar, loadGhost, saveGhost } from './ghost.js';
import { monoDef, medalFor, recordMedal } from './modes.js';
import { driverOf, pick } from './story.js';
import { Debris } from './wreck.js';
import { setRef, curveObject } from '../world/curved.js';
import { SpeedLines } from './speedlines.js';
import { Feel } from './feel.js';
import { Storms } from './storms.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Items, ITEMS } from './items.js';
import { Reflection } from './reflect.js';
import { Construction } from './construction.js';
import { Quake } from './quake.js';
import { Fold } from './fold.js';
import { PopupBook, offPage } from './popup.js';
import { chainMove, chainTick, chainEnd, shiftTiming, perfectFx, newChain, newTally } from './chain.js';
import { PIPE } from '../world/warp.js';
import { buildRoomFrame } from '../world/paradox.js';
import { disposeTree } from '../core/renderer.js';
import { PHOSPHOR } from '../world/phosphor.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _c = new THREE.Color();
const _s = new THREE.Vector2();
// closing speeds (m/s) where a hit starts to hurt: into a wall or block, and a car rammed by another
const HURT_SPEED = 6;
const TAKEDOWN_SPEED = 14;
// the hull: a hit takes a share of it, and a car only comes apart when it runs out
export const HULL = 100;
const HULL_FLOOR = 60; // a hull above this survives any one hit (it's left hanging by a thread instead)
const HULL_REPAIR = { wait: 2.5, rate: 3, both: 7 }; // hp/s once it's gone a while without a hit; BOTH patches it faster
// each car's horn (core/engine.js's horn library)
const HORNS = { vector: 'honk1', scanline: 'honk2', polygon: 'honk3', chroma: 'honk6', raster: 'honk4', glitch: 'honk5', dash: 'bell', greatwedge: 'shark' };
const G_AIR_RACE = 27; // racer.js G_AIR
// recharge time of each form's move (seconds)
const FORM_CD = { lift: 5, lance: 6, brace: 8 };
const NO_INPUT = { throttle: 0, brake: 0, steer: 0, drift: false, item: false, special: false, jump: false, reset: false, look: false };

export class Race {
  constructor(app, def, opts = {}) {
    this.app = app;
    this.kind = opts.kind || (opts.rivals === 0 ? 'trial' : 'race');
    this.mono = this.kind === 'mono';
    this.tutorial = this.kind === 'tutorial';
    // an event (events.js: SHIFT SCHOOL drills, SHIFT TOUR events) is solo unless it brings rivals
    this.isEvent = this.kind === 'event';
    this.solo = this.kind === 'trial' || this.mono || this.tutorial || (this.isEvent && !opts.rivals);
    if (this.mono) def = monoDef(def);
    this.def = def;
    this.opts = opts;
    this.laps = opts.laps ?? def.laps ?? 3;
    this.scene = new THREE.Scene();
    this.world = new TrackWorld(def);
    this.env = new Environment(this.world);
    this.scene.add(this.env.group, this.world.group);
    // the Möbius strip is drawn turned over (world/mobius.js): the scene is bent before each frame and put back after
    this.mob = this.world.mob || null;
    // a lap can be a part of the loop the engine drives (the Möbius strip's two sides are one loop)
    this.lapSplit = def.lapSplit || 1;
    this.scene.fog = this.env.fog;
    this.scene.background = this.env.bg;
    // the Escher room (world/rooms.js): its walls, and the passes that draw each stair on its own wall
    if (this.world.room) {
      this.roomFrame = buildRoomFrame(this.world);
      this.scene.add(this.roomFrame);
      this.world.room.attach(this.scene, this.env, this.roomFrame);
    }
    this.cam = new ChaseCamera();
    this.cam.camera.far = 6000;
    this.cam.camera.updateProjectionMatrix();
    this.t = 0;
    this.raceTime = 0;
    this.state = 'intro'; // intro, countdown, race, finished
    this.countdown = 3.999;
    this.introT = 0;
    // skipping the fly-by takes a fresh press (see the intro in update)
    this.skipArmed = false;
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
    if (this.mob) for (const o of [this.env.group, this.world.layers.group, this.speedLines.mesh]) this.mob.skip.add(o);
    this.feel = new Feel(this); // drift stages, surface rumble, pass-bys (feel.js)
    this.storms = new Storms(this);
    this.traffic = new Traffic(this);
    this.police = new Police(this);
    this.reflection = new Reflection();
    this.scene.add(this.storms.group, this.traffic.group, this.police.group);
    // the course hazards that change lap by lap: road works (Fractal Route), the quake (Echo Ruins)
    this.works = new Construction(this);
    this.quake = new Quake(this);
    this.scene.add(this.works.group, this.quake.group);
    this.fold = new Fold(this); // a course that changes pose lap by lap (HYPERCUBE)
    // the pop-up book (PAGE TURNER): a spread per lap
    this.book = new PopupBook(this);
    this.scene.add(this.book.group);
    this.slowT = 0;
    this.slowLen = 0.9; // (so a slow-motion beat never divides by nothing)
    // player + rivals. Online, the host's slot list decides the grid: each slot is a person or an AI rival, and every
    // browser simulates only its own racers (the host also runs the AI); everyone else is a puppet fed by the network.
    this.online = opts.online || null;
    this.split = !!opts.split;
    const playerCar = CARS.find((c) => c.id === opts.car) || CARS[0];
    const field = this.online ? this.online.slots.length - 1 : opts.rivals ?? 5;
    const others = CARS.filter((c) => c !== playerCar && !c.secret);
    const others2 = this.split ? others.filter((c) => c.id !== opts.car2) : others;
    const diff = opts.difficulty ?? 1; // 0 easy, 1 normal, 2 hard
    this.assist = !!opts.assist; // steering assist (steerAssist)
    for (let k = 0; k <= field; k++) {
      const S = this.online?.slots[k];
      // offline, the player starts at the back of the grid (in split-screen, player 2 just ahead of player 1)
      const pIndex = S ? (S.slot === this.online.mySlot ? 0 : -1) : k === field ? 0 : this.split && k === field - 1 ? 1 : -1;
      const isPlayer = pIndex >= 0;
      const pCar = pIndex === 1 ? CARS.find((c) => c.id === opts.car2) || CARS[1] : playerCar;
      // (an event can name its rivals' cars: a SHIFT TOUR duel is against one driver in particular)
      const wanted = !S && !isPlayer && opts.rivalCars?.[k] && CARS.find((c) => c.id === opts.rivalCars[k]);
      const car = S ? CARS.find((c) => c.id === S.car) || CARS[0] : isPlayer ? pCar : wanted || others2[k % others2.length];
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
      // the SHIFT CHAIN, and the moves the results screen tells (game/chain.js)
      r.chain = newChain();
      r.tally = newTally();
      // best time through each third of the lap, for the results screen. The first lap's clock starts at GO, so its
      // first sector does too (the grid counts as sector 1), and a lap's three sectors add up to the lap.
      r.sectors = [Infinity, Infinity, Infinity];
      r.sec = Math.max(0, Math.floor(r.prog * this.lapSplit * 3));
      r.secStart = 0;
      r.secFull = true;
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
      // (on a curved course racers and trails are drawn in the drawn world, which is moved under the viewer: curved.js)
      (this.world.curved ? this.world.group : this.scene).add(r.root, r.trail.mesh);
      this.racers.push(r);
    }
    this.cams = [this.cam];
    if (this.split) {
      const c2 = new ChaseCamera();
      c2.camera.far = 6000;
      c2.camera.updateProjectionMatrix();
      this.cams.push(c2);
    }
    if (this.mob) for (const c of this.cams) c.mob = this.mob;
    // a fold course (world/fold.js) carries each camera through its fold
    for (const c of this.cams) c.fold = this.world.fold;
    this.players.forEach((p, k) => this.cams[k].snap(p));
    this.items = new Items(this);
    this.scene.add(this.items.group);
    // the lens-shift wave starts from the player's car (split-screen fades each view instead)
    this.world.layers.waveAt = this.split ? null : this.mob ? (this.wavePos = this.mob.map(this.player.pos, new THREE.Vector3())) : this.player.pos;
    this.events = [];
    this.lastMode = BOTH;
    // ghosts: your best run and the staff run
    this.ghosts = [];
    if (this.solo && !this.tutorial && !this.isEvent) {
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
    (this.world.curved ? this.world.group : this.scene).add(g.root);
    this.ghosts.push(g);
  }

  // A rival gets on the radio in a moment (one call waits at a time, and not too often).
  radioSoon(r, kind, delay) {
    if (this.radioLater || this.t - (this.radioT ?? -99) < 9) return;
    this.radioLater = { r, kind, t: this.t + delay };
  }
  // A rival gets on the radio.
  comms(r, kind) {
    const d = r && !r.human && driverOf(r.car.id);
    if (!d) return;
    const text = Array.isArray(d[kind]) ? pick(d[kind]) : d[kind];
    if (!text) return;
    const msg = { id: r.car.id, name: d.name, car: r.car.name, color: r.color, text, kind };
    this.emit('comms', msg);
    this.radioT = this.t;
    return msg;
  }

  // Each form's own move (Y / △, Z): the Skimmer LIFTs (one tap HOVERs over the road, a quick second tap JUMPs high
  // over a wall or a block), the Blade LANCEs forward and runs straight through whoever's in front, the pair BRACEs
  // behind a shield that sends a hit back at whoever threw it. One move, then a few seconds to recharge.
  formMove(r) {
    if (this.state !== 'race' || r.finished || r.respawnT > 0 || r.empT > 0) return false;
    const near = this.near(r);
    // the second tap of a LIFT, while its hover is still young: JUMP (the hover's recharge already running)
    if (r.mode === BLUE && r.hoverT > 0 && !r.hopT && this.t - (r.hoverAt ?? -9) < SKIM.doubleTap) {
      const base = r.gnd.onRoad ? r.gnd.y : (r.hoverBase ?? r.pos.y);
      const g = 27 * SKIM.hopG;
      r.vel.y = Math.sqrt(2 * g * Math.max(0.5, SKIM.hopH - Math.max(0, r.pos.y - base)));
      r.hoverT = 0;
      r.hopT = 1.6;
      if (near) this.debris.sparks(r.pos, _a.set(0, -1, 0), 34, 0x9ad8ff, 16, base);
      if (r.isPlayer) {
        this.emitP(r, 'popup', { text: 'JUMP', color: '#4ab0ff', small: true });
        this.app.audio.play('turbo', 2);
        this.camOf(r).fovPunch(6);
      }
      return true;
    }
    if ((r.formCd || 0) > 0) return false;
    if (r.mode === BLUE) {
      // (a moment off a crest still counts as on the road)
      if (!r.grounded && r.airTime > 0.25) return false;
      r.vel.addScaledVector(_v.set(r.gnd.nx, r.gnd.ny, r.gnd.nz), 5);
      r.grounded = false;
      r.airTime = 0.01;
      r.hoverT = SKIM.hoverT;
      r.hoverAt = this.t;
      r.hoverBase = r.gnd.onRoad ? r.gnd.y : r.pos.y;
      r.hopT = 0;
      r.formCd = FORM_CD.lift;
      if (near) this.debris.sparks(r.pos, _a.set(0, -1, 0), 26, 0x4ab0ff, 12, r.gnd.y);
      if (r.isPlayer) {
        this.emitP(r, 'popup', { text: 'HOVER', color: '#4ab0ff', small: true });
        this.app.audio.play('boost');
      }
    } else if (r.mode === RED) {
      r.lanceT = 0.7;
      r.giveBoost(0.7, 1.45);
      r.formCd = FORM_CD.lance;
      if (r.isPlayer) {
        this.emitP(r, 'popup', { text: 'LANCE', color: '#ff4a6a', small: true });
        this.app.audio.play('turbo', 2);
        this.camOf(r).fovPunch(10);
      }
    } else {
      r.braceT = 2.6;
      r.formCd = FORM_CD.brace;
      if (r.isPlayer) {
        this.emitP(r, 'popup', { text: 'BRACE', color: '#d8c8ff', small: true });
        this.app.audio.play('phase');
      }
    }
    return true;
  }

  // In the air off a launcher the flight follows the road under it (bending with a curve, drawn back to the middle),
  // so the landing is on the road beyond the hole and never off its side.
  flyLaunch(r, dt) {
    const L = r.launch;
    L.t -= dt;
    if (L.t <= 0 || (r.grounded && L.t < 0.3)) {
      r.launch = null;
      return;
    }
    if (r.grounded) return;
    const P = L.path;
    const f = (r._lf ||= {});
    if (!P.frame(r.pos.x, r.pos.z, L.i, f)) return;
    L.i = f.i;
    const j = P.wrap(f.i + 2);
    const tx = P.thx[j];
    const tz = P.thz[j];
    const hs = Math.max(L.fwd, Math.hypot(r.vel.x, r.vel.z));
    // along the road, plus a pull back toward its middle
    const pull = clamp(-f.lat * 0.9, -12, 12);
    r.vel.x = tx * hs + P.rightX(f.i) * pull;
    r.vel.z = tz * hs + P.rightZ(f.i) * pull;
    let d = Math.atan2(tx, tz) - r.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    r.yaw += d * Math.min(1, dt * 6);
  }

  // the form moves ticking, and how they look
  formTick(r, dt) {
    if (r.formCd > 0) r.formCd -= dt;
    if (r.lanceT > 0) {
      r.lanceT -= dt;
      if (this.near(r) && Math.random() < 0.7) this.debris.sparks(_v.copy(r.pos).setY(r.pos.y + 0.5), _a.set(Math.sin(r.yaw), 0, Math.cos(r.yaw)), 3, 0xff4a6a, 30, r.gnd.y);
    }
    if (r.braceT > 0) r.braceT -= dt;
    // the shield: a violet lattice bubble, flickering out at the end
    if (r.braceT > 0 && !r.shield) {
      r.shield = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.7, 1)), new THREE.LineBasicMaterial({ color: 0xd8c8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.scene.add(r.shield);
    }
    if (r.shield) {
      r.shield.visible = r.braceT > 0 && (r.braceT > 0.5 || Math.floor(r.braceT * 16) % 2 === 0);
      if (r.shield.visible) {
        r.shield.position.copy(r.pos).setY(r.pos.y + 0.6);
        r.shield.rotation.y += dt * 1.5;
        r.shield.scale.set(1, 0.6, 1.25);
      }
    }
  }

  // Rivals use their form's move by a few simple rules.
  formAI(r) {
    // a LIFT's second tap, a beat after the first: the rival JUMPs the block it saw
    if (r.aiHopAt && this.t >= r.aiHopAt) {
      r.aiHopAt = 0;
      this.formMove(r);
    }
    if ((r.formCd || 0) > 0 || this.state !== 'race' || r.finished) return;
    r.formThink = (r.formThink || 0) - 1;
    if (r.formThink > 0) return;
    r.formThink = 15;
    if (Math.random() > (r.ai?.skill ?? 0.7)) return;
    const tr = r.track;
    if (!tr) return;
    const P = tr.path;
    const ahead = (o) => {
      _a.subVectors(o.pos, r.pos);
      return { d: _a.x * Math.sin(r.yaw) + _a.z * Math.cos(r.yaw), s: Math.abs(_a.x * Math.cos(r.yaw) - _a.z * Math.sin(r.yaw)) };
    };
    if (r.mode === BLUE && r.grounded && r.speed > 30) {
      for (const o of this.world.obstacles) {
        if (o.path !== P || o.broken || !solidIn(o.mask, BLUE) || o.type === 'wall' || o.door || offPage(o, r)) continue;
        let di = o.i - tr.i;
        if (P.closed) di = ((di % P.N) + P.N + P.N / 2) % P.N - P.N / 2;
        const d = di * P.ds;
        if (d > 10 && d < 10 + r.speed * 0.45 && Math.abs(o.lat - tr.lat) < o.w + 1.5) {
          // a low block: a hover clears it; a tall one wants the jump
          if (this.formMove(r) && o.h + 1 > SKIM.hoverH) r.aiHopAt = this.t + 0.15;
          return;
        }
      }
    } else if (r.mode === RED) {
      if (this.racers.some((o) => o !== r && o.respawnT <= 0 && (({ d, s }) => d > 3 && d < 16 && s < 2.5)(ahead(o)))) this.formMove(r);
    } else if (r.mode === BOTH) {
      if (this.racers.some((o) => o !== r && o.respawnT <= 0 && o.pos.distanceToSquared(r.pos) < 9 * 9) && (r.hp < 75 || Math.random() < 0.3)) this.formMove(r);
    }
  }

  // The horn (L3 / H). Every car has its own. Honk at a rival close by and it's a taunt: they get on the radio, and
  // for a few seconds they come after you (they drive harder and ram), but a taunt that lands right after you've
  // passed them is worth a little SHIFT.
  honk(r) {
    if ((r.hornCd || 0) > this.t) return;
    r.hornCd = this.t + 0.6;
    const near = this.players.some((p) => p.pos.distanceToSquared(r.pos) < 110 * 110);
    if (near) this.app.audio.play(HORNS[r.car.id] || 'honk1', r.isPlayer ? 0.9 : 0.6);
    if (!r.isPlayer || this.state !== 'race' || this.solo) return;
    let best = null;
    let bd = 45 * 45;
    for (const o of this.racers) {
      if (o === r || !o.ai || o.respawnT > 0 || o.finished) continue;
      const d = o.pos.distanceToSquared(r.pos);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (!best || (best.tauntCd || 0) > this.t) return;
    best.tauntCd = this.t + 8;
    best.angryT = 5;
    best.angryAt = r;
    this.comms(best, 'taunted');
    const passed = this.placeOf(r) < this.placeOf(best) && this.raceTime - (r.passT?.[best.index] ?? -9) < 3;
    if (passed) {
      r.energy = Math.min(1, r.energy + 0.1);
      this.emitP(r, 'popup', { text: 'TAUNT · +SHIFT', color: '#ffd04a', small: true });
    } else this.emitP(r, 'popup', { text: 'TAUNTED', color: '#ffd04a', small: true });
    // they honk back
    setTimeout(() => this.racers.includes(best) && this.honk(best), 450);
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
  // Every lens move lands here (the kinds are listed in game/chain.js): the tally for the results screen, then the
  // SHIFT CHAIN. Returns the chain's length. (An event, game/events.js, listens in by wrapping it.)
  onMove(r, kind, data = {}) {
    const t = r.tally;
    if (t) {
      if (kind === 'perfect') t.perfect++;
      else if (kind === 'phase') {
        t.phased++;
        if (data.close) t.close++;
      } else if (kind === 'lensRoute') t.routes++;
      else if (kind === 'wallRun') t.wallRuns++;
      else if (kind === 'glide') t.glides++;
      else if (kind === 'slit') t.slits++;
      else if (kind === 'takedown') t.takedowns++;
    }
    return chainMove(this, r, kind, data);
  }

  // The lens moves that happen on the road rather than at something on it, each counted once as it starts: onto a
  // road that's only there in your lens, up a wall-run (or high round a pipe) as the Blade, a long glide as the
  // Skimmer. Then the chain's window, and the lens-time tally.
  moves(r, dt) {
    const g = r.gnd;
    const P = g.path;
    const on = r.grounded && g.onRoad;
    // a lens road: there in your lens, not in BOTH (a little hysteresis, for the seam where a fork meets the road)
    const lens = on && !solidIn(g.mask, BOTH);
    if (lens) {
      r.offLensT = 0;
      if (!r.onLens) {
        r.onLens = true;
        // off a road there in every lens straight onto one that isn't (a lens bridge's lip, a fork's mouth): the
        // shift's timing counts. (Landing on one from a launcher's flight doesn't.)
        const tm = this.t - (r.bothRoadT ?? -9) < 0.25 ? shiftTiming(this, r) : null;
        if (tm === 'perfect') {
          r.giveBoost(0.9, 1.3);
          r.energy = Math.min(1, r.energy + 0.1);
          perfectFx(this, r);
          this.onMove(r, 'perfect', { on: 'road' });
        }
        this.onMove(r, 'lensRoute', { mask: g.mask, path: P.id, perfect: tm === 'perfect' });
      }
    } else if (on) {
      r.offLensT = (r.offLensT || 0) + dt;
      if (r.offLensT > 0.4) r.onLens = false;
      r.bothRoadT = this.t;
    }
    // a wall-run, or a pipe wall past the steep part, in RED
    const wall = on && r.mode === RED && P && (P.cling?.[g.i] || (P.warpKind?.[g.i] === PIPE && Math.abs((g.lat * P.warpK[g.i]) / P.warpR[g.i]) > 0.9));
    if (wall) {
      r.offWallT = 0;
      if (!r.onWall) {
        r.onWall = true;
        this.onMove(r, 'wallRun', { pipe: !P.cling?.[g.i] });
      }
    } else if ((r.offWallT = (r.offWallT || 0) + dt) > 0.4) r.onWall = false;
    // a glide that's really a glide (racer.js sets r.gliding)
    if (r.gliding) {
      r.glideT = (r.glideT || 0) + dt;
      if (r.glideT > 0.35 && !r.glided) {
        r.glided = true;
        this.onMove(r, 'glide', { gap: !!P?.glide?.[g.i] });
      }
    } else if (r.grounded) {
      r.glideT = 0;
      r.glided = false;
    }
    chainTick(this, r, dt);
    if (this.state === 'race' && !r.finished) r.tally.lens[r.mode] += dt;
  }

  onDriftLevel(r, lvl) {
    if (r.isPlayer) this.emitP(r, 'drift', { lvl });
  }
  onMiniTurbo(r, lvl) {
    // a long drift charges SHIFT as well as the turbo
    if (lvl >= 2) r.energy = Math.min(1, r.energy + (lvl === 3 ? 0.12 : 0.06));
    this.onMove(r, 'drift', { lvl });
    if (r.isPlayer) {
      this.app.audio.play('turbo', lvl);
      this.emitP(r, 'popup', { text: ['', 'TURBO', 'SUPER TURBO', 'ULTRA TURBO'][lvl], color: '#ff4fd8' });
    }
  }
  onWallHit(r, impact) {
    // the rails are bumpers: a glancing scrape costs nothing, a square hit a little hull, and they never finish a car
    if (impact > 16 && r.hp > 12) this.hurt(r, Math.min((impact - 16) * 0.6, r.hp - 10));
    if (impact > 6 && this.near(r)) this.debris.sparks(r.pos, _v.copy(r.vel).multiplyScalar(-0.03), Math.min(24, impact), 0xffd27a, 14, r.gnd.y);
    // a scrape along the rail touches it frame after frame: only a fresh knock shakes the view and the pad
    if (r.isPlayer && impact > 6 && this.t - (r.railT ?? -9) > 0.35) {
      this.app.audio.play('scrape');
      if (impact > 10) this.camOf(r).addShake(Math.min(0.3, impact * 0.012));
      this.app.input.rumble(0, 0.3, 0.2, 80);
    }
    if (impact > 6) r.railT = this.t;
  }
  onLand(r, impact) {
    if (r.isPlayer && impact > 6) {
      this.app.audio.play('land', impact);
      this.camOf(r).addShake(Math.min(0.5, impact * 0.025));
    }
  }
  onFell(r) {
    if (r.respawnT > 0) return;
    chainEnd(this, r);
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

  // A hit takes hull. Returns true if it was the last of it (the car comes apart). by: who rammed you; text: the popup.
  // A healthy car always survives one hit: it's left hanging by a thread, smoking, with the next hit the last.
  hurt(r, dmg, by = null, text = null, steady = false) {
    if (r.respawnT > 0 || r.finished || dmg <= 0 || r.beamT > 0) return false;
    // braced: the shield takes it (and a rammer gets it back)
    if (r.braceT > 0) {
      if (by && by !== r && !(by.braceT > 0)) this.hurt(by, dmg * 0.6, r, 'BOUNCED OFF A BRACE');
      if (this.near(r)) this.debris.sparks(r.pos, _a.set(0, 1, 0), 10, 0xd8c8ff, 12, r.gnd.y);
      return false;
    }
    if (r.invuln > 0 && !by) return false;
    // heavier hulls take hits better (GREAT WEDGE is a tank); you're a little tougher than the field
    dmg *= Math.sqrt(1 / (r.mass || 1)) * (r.isPlayer ? 0.85 : 1);
    if (!steady && r.hurtCd > 0) dmg *= 0.35; // two touches in the same crash count as one
    const before = r.hp;
    // (a worn hull, a SHIFT TOUR takedown quota's rivals, gets no such grace)
    if (before > HULL_FLOOR && dmg >= before && !r.worn) dmg = before - 6 - Math.random() * 4;
    r.hp = before - dmg;
    r.lastHurtT = this.t;
    if (!steady) r.hurtCd = 0.35;
    if (r.hp <= 0) {
      r.hp = 0;
      this.wreck(r, by);
      return true;
    }
    if (by?.isPlayer && dmg > 8) this.emitP(by, 'popup', { text: `HIT · ${Math.round(dmg)}`, color: '#ffd04a', small: true });
    if (r.isPlayer) {
      if (text) this.emitP(r, 'popup', { text, color: '#ff4a6a', small: dmg < 30 });
      if (before > 30 && r.hp <= 30) {
        this.emitP(r, 'popup', { text: 'HULL CRITICAL', color: '#ff4a6a' });
        this.app.audio.play('fall');
      }
      if (!steady) {
        this.app.input.rumble(r.pIndex || 0, Math.min(1, dmg / 40), Math.min(1, dmg / 50), 120 + dmg * 4);
        this.camOf(r).addShake(Math.min(0.9, 0.15 + dmg * 0.012));
        this.aberr = Math.max(this.aberr || 0, Math.min(1.2, dmg / 40));
      }
      this.emitP(r, 'hurt', { dmg });
    }
    // the hit shows: a few lines off the hull, more the worse it is
    if (!steady && dmg > 12 && this.near(r)) this.debris.burst(r.root, _a.copy(r.vel).multiplyScalar(0.6), 5 + dmg * 0.1, r.gnd.y, Math.min(0.22, dmg * 0.004), 1.8);
    return false;
  }

  // A hull left alone patches itself up, faster in BOTH; a hurt hull trails smoke and sparks so you can see it.
  hull(r, dt) {
    if (r.hurtCd > 0) r.hurtCd -= dt;
    if (r.hp < HULL && !r.worn && this.t - (r.lastHurtT ?? -99) > HULL_REPAIR.wait) r.hp = Math.min(HULL, r.hp + (r.mode === BOTH ? HULL_REPAIR.both : HULL_REPAIR.rate) * dt);
    if (r.hp < 65 && this.near(r)) {
      const bad = 1 - r.hp / 65;
      r.smokeT = (r.smokeT || 0) - dt;
      if (r.smokeT <= 0) {
        r.smokeT = 0.16 - bad * 0.12;
        _a.set(-Math.sin(r.yaw), 0.4, -Math.cos(r.yaw));
        this.debris.sparks(_v.copy(r.pos).setY(r.pos.y + 0.7), _a, 1 + Math.round(bad * 3), r.hp < 30 ? (Math.random() < 0.5 ? 0xff5a2a : 0xffd27a) : 0x9a8aa8, 5 + bad * 6, r.gnd.y);
      }
    }
  }

  // The car comes apart into its own lines and respawns a moment later.
  wreck(r, by) {
    if (r.respawnT > 0 || r.finished || (r.invuln > 0 && !by)) return;
    if (this.near(r)) {
      this.debris.burst(r.root, r.vel, 16, r.gnd.y);
      this.debris.sparks(r.pos, _v.set(0, 0, 0), 40, 0xffd27a, 26, r.gnd.y);
    }
    r.wrecks = (r.wrecks || 0) + 1;
    chainEnd(this, r);
    if (by && by !== r) this.onMove(by, 'takedown', { victim: r.index });
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
      // the announcer calls your first takedown, then now and then (a chain call just made gets the floor), and the
      // driver you took out has something to say about it once they're back
      if (this.t - (by.takedownCallT ?? -99) > 14 && (!by.takedownCalled || Math.random() < 0.5) && this.app.audio.announce('takedown', 0.15, 0.9, true) > 0) {
        by.takedownCallT = this.t;
        by.takedownCalled = true;
      }
      this.radioSoon(r, 'downed', 1.4);
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
    r.hp = HULL;
    // start the road search at the respawn sample: on a stacked course (Helix) the nearest sample with no hint can
    // be a loop above or below, and you'd fall straight back out
    r.hints[this.world.main.id] = sp.i;
    r.hints._cur = this.world.main.id;
    if (r.mono) r.energy = Math.max(r.energy, SHIFT.monoCost);
    else {
      r.mode = BOTH;
      // a lens wall or a lens-only gap soon after the respawn point: never send you at it with an empty meter, or a
      // fall there just loops
      if (sp.lensAhead) r.energy = Math.max(r.energy, 0.4);
    }
    r.grounded = true;
    r.wrongWay = 0;
    r.invuln = 1.5;
    // traffic and the police convoy pass through you while you blink back in
    r.respawnGrace = 1.5;
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

  // STEERING ASSIST (settings, on by default): a hand on the wheel for newer drivers. With no steering it straightens
  // you up along the road; near a rail it eases off steering into it and draws you back off it, so a race isn't
  // spent bouncing wall to wall. Hands-off in a drift, in the air, and on a bent road (a pipe wall is the point).
  steerAssist(r, steer, drift) {
    const tr = r.track;
    if (!tr || !r.grounded || drift || r.drift.active || r.speed < 8) return steer;
    const P = tr.path;
    if (P.warpK?.[tr.i] > 0) return steer;
    const j = P.wrap(tr.i + Math.round((6 + r.speed * 0.25) / P.ds));
    let err = r.yaw - Math.atan2(P.thx[j], P.thz[j]);
    err = Math.atan2(Math.sin(err), Math.cos(err));
    if (Math.abs(err) > 1.2) return steer; // turned round: leave it to them
    // (positive steer turns toward +lat, and lowers yaw)
    const hands = 1 - Math.min(1, Math.abs(steer));
    let s = steer + clamp(err * 1.6, -0.45, 0.45) * hands;
    // never point too far across the road at speed: a beginner holding full lock at 200 km/h is the bounce wall to
    // wall. (err < 0: heading toward +lat, which positive steer turns toward)
    const maxDev = 0.2 + 0.5 * (1 - clamp(r.speed / 55, 0, 1));
    const over = Math.abs(err) - maxDev;
    if (over > 0) {
      const head = -Math.sign(err);
      if (Math.sign(s) === head) s *= Math.max(0, 1 - over * 10);
      s -= head * Math.min(0.8, over * 5);
    }
    // where you'll be in half a second: heading for the rail, ease off and steer away before you hit it
    const latV = r.vel.x * P.rightX(tr.i) + r.vel.z * P.rightZ(tr.i);
    const pred = tr.lat + latV * 0.5;
    const edge = Math.abs(pred) - (P.halfW - 3);
    if (edge > 0) {
      const toward = Math.sign(pred);
      const k = Math.min(1, edge / 3);
      if (Math.sign(s) === toward) s *= 1 - 0.9 * k;
      s -= toward * k * (0.3 + clamp((latV * toward) / 10, 0, 0.7));
    }
    return clamp(s, -1, 1);
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    this.t += dt;
    this.mob?.undo();
    if (this.radioLater && this.t >= this.radioLater.t) {
      const q = this.radioLater;
      this.radioLater = null;
      if (this.state === 'race') this.comms(q.r, q.kind);
    }
    const input = this.app.input;
    const p = this.player;
    // player controls (two sets in split-screen)
    const C = this.players.map((pl, k) => (this.app.paused ? NO_INPUT : input.controls(k)));
    this.players.forEach((pl, k) => {
      const c = C[k];
      pl.ctl.throttle = c.throttle;
      pl.ctl.brake = c.brake;
      pl.ctl.steer = this.assist ? this.steerAssist(pl, c.steer, c.drift) : c.steer;
      pl.ctl.drift = c.drift;
      if (this.state !== 'race' || pl.finished) return;
      if (c.fire && !pl.fireHeld) this.items.use(pl);
      if (c.horn) this.honk(pl);
      if (c.form) this.formMove(pl);
      pl.fireHeld = c.fire;
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
      // a rival gets on the radio, and the fly-by opens on their car while they talk
      if (this.introT === 0 && !this.solo) this.introSpeaker = pick(this.racers.filter((r) => !r.isPlayer && !r.human && driverOf(r.car.id)));
      if (this.introT < 0.35 && this.introT + dt >= 0.35 && this.introSpeaker) this.comms(this.introSpeaker, 'pre');
      this.introT += dt;
      for (const r of this.racers) r.controlLocked = true;
      // the press that started this race (RETRY, NEXT COURSE) must not skip its fly-by too: a skip needs the
      // confirm key let go since the intro began, then pressed again, and not in the first moments
      if (!input.menuHeld('confirm')) this.skipArmed = true;
      const skip = this.skipArmed && this.introT > 0.4 && input.menu('confirm');
      if (this.online ? this.netGo : this.introT > (this.introSpeaker ? 3 : 2.2) || skip) {
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
    this.event?.update(sim); // the event runner (events.js), when this race is an event
    // rivals talk when they get past you (not too often)
    if (this.state === 'race' && !this.solo && !this.split && !p.finished) {
      const place = this.placeOf(p);
      if (this.lastPlace && place < this.lastPlace) {
        // you just passed someone: a taunt in the next few seconds lands
        const behind = this.standings()[place];
        if (behind) (p.passT ||= {})[behind.index] = this.raceTime;
      }
      if (this.lastPlace && place > this.lastPlace && this.raceTime > (this.nextComms || 8)) {
        this.comms(this.standings()[place - 2], 'pass');
        this.nextComms = this.raceTime + 18;
      }
      this.lastPlace = place;
    }
    for (const g of this.ghosts) {
      g.update(this.raceTime, p.mode);
      if (this.world.curved) curveObject(this.world, g.root, g);
    }
    this.debris.update(sim);
    this.storms.update(sim, p);
    this.works.update(sim);
    this.quake.update(sim, p);
    this.fold.update(sim);
    this.book.update(sim);
    this.traffic.update(sim, p);
    this.police.update(sim, p);
    this.world.mirrors?.update(this);
    this.items.update(sim);

    // visuals
    this.app.net?.applyPuppets(this);
    for (const r of this.racers) if (r.puppet ? r.root.visible : r.respawnT <= 0) r.syncVisual(dt);
    for (const r of this.racers) if (r.drawIn !== undefined && r.respawnT <= 0) this.drawIn(r, dt);
    this.world.fold?.follow(this, dt);
    if (this.world.curved) setRef(this.world, p);
    if (this.split) {
      // the obstacles move once; each view then fades the worlds for its own player's lens (see views())
      for (const fn of this.world.animated) fn(this.t, dt);
      this.players.forEach((pl, k) => {
        this.world.fold?.useView(k, pl);
        this.world.fold?.update(dt, this.t, pl.mode);
        this.world.layers.useView(k);
        this.world.layers.update(dt, pl.mode, this.t);
      });
    } else {
      if (this.wavePos) this.mob.map(p.pos, this.wavePos);
      this.world.update(dt, this.t, p.mode);
    }
    this.players.forEach((pl, k) => {
      const cam = this.cams[k];
      if (this.state === 'intro') {
        // fly-by: a close orbit of the rival on the radio, then around to your own car
        const sp = this.introSpeaker && !this.split && this.introT < 1.5 ? this.introSpeaker : null;
        const tgt = sp || pl;
        const t = sp ? this.introT : this.introT - (this.introSpeaker && !this.split ? 1.5 : 0);
        const a = t * 0.5 + k * 1.4 + (sp ? 2.2 : 0);
        const far = sp ? 10 - t * 2 : 24 - t * 6;
        cam.cinematic = (dtc, CC) => {
          CC.pos.set(tgt.pos.x + Math.sin(a + tgt.yaw) * far, tgt.pos.y + (sp ? 2.6 : 8 - t * 2), tgt.pos.z + Math.cos(a + tgt.yaw) * far);
          CC.look.copy(tgt.pos);
          if (sp) CC.look.y += 0.8;
        };
      } else if (cam.cinematic && !cam.held) {
        // (a held cinematic, cam.held, is a shot someone else is directing: trailer and replay cameras)
        cam.cinematic = null;
        cam.snap(pl);
      }
      cam.update(dt, pl, this.world, C[k].look);
    });
    this.dtLast = dt;
    this.feel.update(dt);
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
    this._listener.pos.copy(this.mob ? this.cam.pos : cam.userData.flat || cam.position);
    this._listener.fwd.x = _v.x / fl;
    this._listener.fwd.z = _v.z / fl;
    if (this.mob) {
      // (heard in the flat course, where the cars are)
      this._listener.fwd.x = Math.sin(this.cam.heading);
      this._listener.fwd.z = Math.cos(this.cam.heading);
    }
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
    if (this.coachDrop(p)) return;
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

  // The forms, on the first course's drop: a call before it, and what the form you were in made of it after.
  // Returns true while it has the tip line.
  coachDrop(p) {
    const drop = this.def.profile?.find((f) => f.kind === 'drop');
    if (!drop || p.lap > 1 || this.dropLesson === 3) return false;
    let d = drop.at - p.lastU;
    if (d < -0.5) d += 1;
    if (!this.dropLesson && d > 0 && d < 0.08) {
      this.dropLesson = 1;
      this.emitP(p, 'tip', { text: 'DROP AHEAD · RED CLINGS DOWN IT · BLUE GLIDES OVER IT', key: 'both', hold: 4 });
      return true;
    }
    if (this.dropLesson === 1 && d < 0.004) {
      this.dropLesson = 2;
      this.dropMode = p.mode;
    }
    if (this.dropLesson === 2 && d < -0.03) {
      this.dropLesson = 3;
      const m = this.dropMode;
      const text = m === RED ? 'THE BLADE CLUNG TO THE DROP AND PICKED UP SPEED' : m === BLUE ? 'THE SKIMMER GLIDED THE DROP · EACH FORM READS THE ROAD ITS OWN WAY' : 'THE PAIR JUMPED IT · NEXT LAP TRY RED TO CLING OR BLUE TO GLIDE';
      this.emitP(p, 'tip', { text, key: m === RED ? 'red' : m === BLUE ? 'blue' : 'both', hold: 4.5 });
      this.lessonT = 0;
      return true;
    }
    return this.dropLesson === 1 || this.dropLesson === 2;
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
    const on = !this.split && renderer.quality === 'high' && !this.world.room;
    PHOSPHOR.uDetail.value = renderer.quality === 'low' ? 0 : 1;
    const size = gl.getDrawingBufferSize(_s);
    const p = this.player;
    // (no wet-road mirror on a road that's drawn turned over or folded)
    this.reflection.render(gl, this.scene, this.cam.camera, p.gnd?.y ?? p.pos.y, on && !this.mob && !this.world.fold ? 0.2 : 0, size.x, size.y, this.t);
    this.mob?.apply(this.scene);
    // the mirrors (world/mirrors.js): one view here; split-screen draws them per view (views())
    if (!this.split) this.world.mirrors?.render(gl, this.scene, this.cam.camera, p.mode, { quality: renderer.quality, t: this.t });
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
        this.world.fold?.useView(k, pl);
        if (this.world.curved) setRef(this.world, pl);
        this.world.layers.useView(k);
        this.world.layers.update(0, pl.mode, this.t);
        this.env.useView(k);
        this.env.update(this.dtLast || 0, this.t, this.cams[k].camera);
        this.traffic.render(pl.mode, pl);
        this.police.render(pl.mode, pl);
        this.world.mirrors?.render(this.app.renderer.renderer, this.scene, this.cams[k].camera, pl.mode, { quality: this.app.renderer.quality, t: this.t, instant: true, split: true });
        this.book.render(k, pl);
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
      if (r.respawnGrace > 0) r.respawnGrace -= dt;
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
      this.hull(r, dt);
      if (r.launch) this.flyLaunch(r, dt);
      this.formTick(r, dt);
      if (r.ai) this.formAI(r);
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
      this.moves(r, dt);
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
      if (o.path !== P || o.broken || r.beamT > 0 || offPage(o, r)) continue;
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
      // through a slit's gap: only the Blade fits (formroutes.js); its two pieces count as one
      if (o.slit && r.mode === RED && Math.abs(along) < o.len + r.halfL && Math.abs(tr.lat) < o.slit) {
        const key = `${P.id}:${o.i}`;
        if (r.slitKey !== key || this.t - r.slitT > 3) this.onMove(r, 'slit', {});
        r.slitKey = key;
        r.slitT = this.t;
      }
      const dlat = tr.lat - o.lat;
      if (Math.abs(dlat) > o.w + r.halfW) continue;
      if (r.pos.y - P.py[o.i] > o.h + 1) {
        // the Skimmer LIFTed clean over something solid in its lens: HOP OVER, a link in the SHIFT CHAIN
        if ((r.hopT > 0 || r.hoverT > 0) && r.hopOver !== o && solidIn(o.mask, r.mode)) {
          r.hopOver = o;
          this.onMove(r, 'hop', { type: o.type });
          if (r.isPlayer) this.app.audio.play('phase');
        }
        continue;
      }
      if (!solidIn(o.mask, r.mode)) {
        // phased straight through it
        if (r.inside !== o) {
          r.inside = o;
          r.energy = Math.min(1, r.energy + 0.04);
          // shifted at the last moment: a PERFECT SHIFT, or a CLOSE PHASE, throws you through it with a boost and
          // some SHIFT back (a lens wall: blocks are just phased)
          const tm = o.type === 'wall' ? shiftTiming(this, r) : null;
          if (tm === 'perfect') {
            r.giveBoost(1.2, 1.38);
            r.energy = Math.min(1, r.energy + 0.16);
            perfectFx(this, r);
            this.onMove(r, 'perfect', { on: 'wall' });
          } else if (tm === 'close') {
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
            if (!tm) this.emitP(r, 'popup', { text: 'PHASED', color: r.mode === RED ? '#ff4a6a' : r.mode === BLUE ? '#4ab0ff' : '#d8c8ff', small: true });
            this.stats.phased++;
          }
          this.onMove(r, 'phase', { close: tm === 'close', perfect: tm === 'perfect', type: o.type });
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
        // the hit takes hull (a block that gives way takes less of it); only a hull with nothing left comes apart
        const smashes = o.type !== 'wall' && into > 14;
        if (this.hurt(r, (into - HURT_SPEED) * (smashes ? 0.9 : 1.45), null, into > 24 ? 'HULL HIT' : null)) {
          if (smashes) this.smash(o, r);
          continue;
        }
        // a block hit hard enough breaks; anything you hit throws sparks and scraps
        if (smashes) this.smash(o, r);
        this.scrape(r, into, _v.set(-tx * s, 0, -tz * s));
        const hard = into > 12;
        if (hard) {
          r.spinOut(o.type === 'wall' ? 0.9 : 0.6, Math.random() < 0.5 ? -1 : 1);
          chainEnd(this, r);
        }
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
      // a pad there only in one lens, on a road that's there in all of them: shift onto it at the last moment for a
      // PERFECT. (A pad on a road only one lens can see is the road's colour and you're on it anyway: a boost that
      // keeps a running chain going, not a link of its own, or a long blue road would build a x5 by itself.)
      const lens = !solidIn(pad.mask, BOTH) && solidIn(P.mask[pad.i], BOTH);
      const tm = lens ? shiftTiming(this, r) : null;
      if (tm === 'perfect') {
        r.giveBoost(1.6, 1.4);
        perfectFx(this, r);
        this.onMove(r, 'perfect', { on: 'pad' });
      } else r.giveBoost(1.2, 1.32);
      if (r.isPlayer) {
        this.app.audio.play('boost');
        this.camOf(r).fovPunch(8);
      }
      this.onMove(r, 'pad', { lens, perfect: tm === 'perfect' });
    }
    // a launcher in your lens: up and over (at least fast enough, and high enough, to clear what it was built for)
    for (const L of w.launchers) {
      if (L.path !== P || !solidIn(L.mask, r.mode) || !r.grounded) continue;
      let di = tr.i - L.i;
      if (P.closed && di < -P.N / 2) di += P.N;
      if (di < 3 || di * P.ds > L.len + 1) continue;
      if (Math.abs(tr.lat - L.lat) > L.w + 0.5) continue;
      if ((r.launchCd || 0) > this.t) continue;
      r.launchCd = this.t + 1.5;
      const fwd = Math.max(r.speed, 52);
      const air = (L.over + 8) / fwd;
      const vy = clamp((G_AIR_RACE * air) / 2, 9, 22);
      _v.set(Math.sin(r.yaw), 0, Math.cos(r.yaw));
      r.vel.copy(_v).multiplyScalar(fwd).setY(vy);
      r.grounded = false;
      r.airTime = 0.01;
      r.launch = { path: P, i: tr.i, t: air + 0.6, fwd };
      // a launcher is only there in one lens: shift onto it at the last moment for a PERFECT
      const tm = !solidIn(L.mask, BOTH) ? shiftTiming(this, r) : null;
      if (tm === 'perfect') {
        r.giveBoost(1.0, 1.3);
        perfectFx(this, r);
        this.onMove(r, 'perfect', { on: 'launch' });
      } else r.giveBoost(0.6, 1.2);
      this.onMove(r, 'launch', { perfect: tm === 'perfect' });
      if (this.near(r)) this.debris.sparks(r.pos, _a.set(0, -1, 0), 30, r.mode === RED ? 0xff4a6a : 0x4ab0ff, 14, r.gnd.y);
      if (r.isPlayer) {
        this.emitP(r, 'popup', { text: 'LAUNCH', color: r.mode === RED ? '#ff4a6a' : '#4ab0ff' });
        this.app.audio.play('turbo', 3);
        this.camOf(r).fovPunch(12);
      }
    }
    for (const sh of w.shards) {
      if (sh.taken > 0 || !solidIn(sh.mask, r.mode)) continue;
      if ((sh.at || sh.root.position).distanceToSquared(r.pos) > 4 * 4) continue;
      sh.taken = 2.5; // back quickly: six racers share them
      sh.root.visible = false;
      if (this.online) this.app.net?.shard(w.shards.indexOf(sh));
      r.energy = Math.min(1, r.energy + SHIFT.shard);
      if (r.isPlayer) {
        this.app.audio.play('shard');
        this.emitP(r, 'popup', { text: '+SHIFT', color: '#ffffff', small: true });
      }
      this.onMove(r, 'shard', { lens: !solidIn(sh.mask, BOTH) });
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
        if (A.beamT > 0 || B.beamT > 0) continue; // light passes through
        if (!(A.mode & B.mode) && A.mode !== BOTH && B.mode !== BOTH) continue;
        _v.subVectors(B.pos, A.pos);
        if (Math.abs(_v.y) > 2) continue;
        _v.y = 0;
        const d = _v.length();
        const min = A.radius + B.radius;
        if (d > min || d < 1e-4) continue;
        // LENS TAG: a touch can pass the tag, and IT phases through a hunter who's only seeing its shimmer
        if (this.tag?.contact(A, B)) continue;
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
          // a LANCE runs straight through: whoever it hits takes a big piece of hull and spins
          for (const [L, V] of [[A, B], [B, A]]) {
            if (!(L.lanceT > 0) || (V.lancedBy === L && V.lancedT > this.t)) continue;
            V.lancedBy = L;
            V.lancedT = this.t + 1;
            if (!this.hurt(V, 30, L, 'LANCED') && V.spinOut(0.9, Math.random() < 0.5 ? -1 : 1)) V.vel.multiplyScalar(0.6);
            if (L.isPlayer) this.camOf(L).addShake(0.5);
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
            // the one rammed takes hull, the rammer a little; a car worn down by hits is the one that comes apart
            this.hurt(victim, (-rel - TAKEDOWN_SPEED * 0.5) * 2.6, by, 'RAMMED');
            if (!(by.lanceT > 0)) this.hurt(by, (-rel - TAKEDOWN_SPEED) * 0.5);
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
    // sectors: a third of the lap driven whole, start to end, counts toward its best
    const sec = Math.max(0, Math.floor(r.prog * this.lapSplit * 3));
    if (sec !== r.sec && !r.finished) {
      if (sec === r.sec + 1 && r.secFull) {
        const k = ((r.sec % 3) + 3) % 3;
        r.sectors[k] = Math.min(r.sectors[k], this.raceTime - r.secStart);
      }
      r.secFull = sec === r.sec + 1 && this.state === 'race';
      r.sec = sec;
      r.secStart = this.raceTime;
    }
    const lap = Math.floor(r.prog * this.lapSplit);
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
          // and the rival just ahead (or just behind) gets on the radio about it, once a race
          if (!this.finalRadio && !this.solo) {
            this.finalRadio = true;
            const st = this.standings();
            const i = st.indexOf(r);
            const near = [st[i - 1], st[i + 1]].find((o) => o && !o.human && !o.isPlayer && !o.finished);
            if (near) this.radioSoon(near, 'final', 1.7);
          }
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

  // Everything the race put on the GPU: the course, the cars, the hazards, the sign boards' canvas textures and the
  // wet-road reflection target. (Geometry alone left ~140 geometries and ~20 textures behind per race.)
  dispose() {
    disposeTree(this.scene);
    this.reflection.dispose();
    this.world.mirrors?.dispose();
  }
}

