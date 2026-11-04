// RETRO SHIFT: a dual-world neon racer for GitHub Game Off 2026.
// Racing engine from Absurd Combat Racing, the red/blue lens from LAST LINE's 3-D matinee.

import * as THREE from '../vendor/three.js';
import { Renderer } from './core/renderer.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { storage } from './core/util.js';
import { UI } from './ui/ui.js';
import { Race } from './game/race.js';
import { TrackWorld } from './world/track.js';
import { Environment } from './game/env.js';
import { trackById, TRACKS } from './world/tracks.js';
import { BOTH, RED, BLUE } from './world/shift.js';
import { CUPS, POINTS, loadStaff, recordCup, checkUnlocks, liveryFor } from './game/modes.js';
import { Showroom } from './game/showroom.js';
import { Online } from './net/online.js';

class App {
  constructor() {
    this.stage = document.getElementById('stage');
    this.renderer = new Renderer(this.stage);
    this.input = new Input();
    this.audio = new Audio();
    this.ui = new UI(this);
    this.net = new Online(this);
    this.race = null;
    this.paused = false;
    this.attract = null;
    this.applySettings(this.ui.settings);
    this.renderer.onResize.push(() => this.onResize());
    this.last = performance.now();
    this.setupTouch();
    const wake = () => {
      const first = !this.audio.ctx;
      this.audio.init();
      if (first && !this.race) this.audio.playTitle();
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.race && !this.race.online && !this.paused && this.race.state !== 'finished') this.pause();
    });
    const params = new URLSearchParams(location.search);
    if (params.get('track')) {
      this.ui.choice.track = params.get('track');
      this.ui.choice.mode = params.get('mode') || (params.get('trial') ? 'trial' : 'race');
      if (params.get('car')) this.ui.choice.car = params.get('car');
      this.autopilot = params.has('staff');
      this.startRace();
    } else this.ui.title();
    document.getElementById('loader')?.remove();
    requestAnimationFrame((t) => this.frame(t));
  }

  applySettings(S) {
    this.audio.setVolumes(S.music, S.sfx);
    if (S.quality === 'auto') this.renderer.autoQuality = true;
    else {
      this.renderer.autoQuality = false;
      if (this.renderer.quality !== S.quality) this.renderer.setQuality(S.quality);
    }
  }

  onResize() {
    const a = this.renderer.width / this.renderer.height;
    if (this.race) this.race.cam.setAspect(a);
    this.showroom?.setAspect(a);
    if (this.attract) {
      this.attract.camera.aspect = a;
      this.attract.camera.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------------ title backdrop: a slow orbit over a course
  // car select and garage: the turntable replaces the course orbit
  showCar(car, livery) {
    if (!this.showroom) {
      this.showroom = new Showroom();
      this.showroom.setAspect(this.renderer.width / this.renderer.height);
    }
    this.showroom.setCar(car, livery);
  }
  hideCar() {
    this.showroom = null;
  }
  // Unlocks earned since this race started (kept so a rebuilt results screen still shows them).
  checkUnlocks() {
    this.recentUnlocks = [...(this.recentUnlocks || []), ...checkUnlocks()];
    return this.recentUnlocks;
  }

  showAttract(on) {
    this.showroom = null;
    if (!on) {
      this.attract = null;
      return;
    }
    if (this.attract) return;
    const def = trackById(this.ui.choice.track) || TRACKS[0];
    const world = new TrackWorld(def);
    const env = new Environment(world);
    const scene = new THREE.Scene();
    scene.add(env.group, world.group);
    scene.fog = env.fog;
    scene.background = env.bg;
    const camera = new THREE.PerspectiveCamera(55, this.renderer.width / this.renderer.height, 0.5, 6000);
    this.attract = { def, world, env, scene, camera, t: 0, mode: BOTH, next: 3 };
  }

  updateAttract(dt) {
    const A = this.attract;
    A.t += dt;
    A.next -= dt;
    if (A.next <= 0) {
      A.next = 2.6;
      A.mode = A.mode === BOTH ? RED : A.mode === RED ? BLUE : BOTH;
      A.env.setMode(A.mode);
    }
    const m = A.world.main;
    const f = (A.t * 0.012) % 1;
    const i = m.index(f);
    const p = m.point(i, 0, 0);
    const j = m.wrap(i + 30);
    const q = m.point(j, 0, 0);
    A.camera.position.set(p.x + m.rightX(i) * 30, p.y + 22, p.z + m.rightZ(i) * 30);
    A.camera.lookAt(q.x, q.y + 2, q.z);
    A.world.update(dt, A.t, A.mode);
    A.env.update(dt, A.t, A.camera);
    this.renderer.setGrade('neon', 0, 0);
    this.renderer.render(A.scene, [{ camera: A.camera, x: 0, y: 0, w: 1, h: 1 }], 0.85);
  }

  // ------------------------------------------------------------------ race flow
  async startRace() {
    this.audio.init();
    const c = this.ui.choice;
    if (c.mode !== 'gp') this.gp = null;
    if (this.gp) c.track = this.gp.cup.tracks[this.gp.round];
    const def = trackById(c.track);
    const solo = c.mode === 'trial' || c.mode === 'mono';
    const staff = solo && !this.autopilot ? await loadStaff(def.id, c.mode === 'mono') : null;
    if (this.race) this.race.dispose();
    this.audio.stopEngines();
    this.audio.duckMusic(false);
    this.showAttract(false);
    this.hideCar();
    this.recentUnlocks = [];
    this.ui.clear();
    this.race = new Race(this, def, {
      kind: c.mode,
      car: c.car,
      livery: liveryFor(c.car),
      rivals: solo ? 0 : 5,
      difficulty: this.ui.settings.difficulty,
      staff,
      autopilot: this.autopilot,
    });
    this.race.cam.setAspect(this.renderer.width / this.renderer.height);
    this.ui.buildHud(this.race);
    this.paused = false;
    this.resultsShown = false;
    document.body.classList.add('racing');
  }
  // ------------------------------------------------------------------ Grand Prix: five races, points carried over
  startGP(cupId) {
    const cup = CUPS.find((c) => c.id === cupId) || CUPS[0];
    this.gp = { cup, round: 0, points: {}, colors: {}, awarded: -1 };
    this.ui.choice.mode = 'gp';
    this.ui.gpIntro(cup.id, () => this.startRace());
  }
  gpAward(race) {
    const gp = this.gp;
    const added = new Map();
    race.standings().forEach((r, k) => {
      const pts = POINTS[k] || 0;
      added.set(r.name, pts);
      gp.colors[r.name] = r.color;
      if (gp.awarded !== gp.round) gp.points[r.name] = (gp.points[r.name] || 0) + pts;
    });
    gp.awarded = gp.round;
    return added;
  }
  nextGP() {
    this.gp.round++;
    this.startRace();
  }
  // Final place in the cup (ties go to the player), saved to the trophy case.
  finishGP() {
    const gp = this.gp;
    const me = gp.points.YOU || 0;
    const rank = 1 + Object.entries(gp.points).filter(([n, p]) => n !== 'YOU' && p > me).length;
    if (!gp.recorded) {
      gp.recorded = true;
      recordCup(gp.cup.id, rank);
    }
    return rank;
  }

  pause() {
    if (!this.race || this.paused) return;
    this.paused = true;
    // an online race keeps running under the menu
    if (!this.race.online) {
      this.audio.stopEngines();
      this.audio.duckMusic(true);
    }
    this.ui.pause();
  }

  // ------------------------------------------------------------------ online
  startOnline(cfg, mySlot, isHost) {
    this.audio.init();
    const def = trackById(cfg.course);
    const me = cfg.slots.find((s) => s.slot === mySlot);
    if (this.race) this.race.dispose();
    this.audio.stopEngines();
    this.audio.duckMusic(false);
    this.showAttract(false);
    this.hideCar();
    this.recentUnlocks = [];
    this.ui.clear();
    this.ui.choice.track = def.id;
    this.race = new Race(this, def, { kind: 'online', car: me?.car, livery: me?.livery, online: { slots: cfg.slots, mySlot, isHost } });
    this.race.cam.setAspect(this.renderer.width / this.renderer.height);
    this.ui.buildHud(this.race);
    this.paused = false;
    this.resultsShown = false;
    document.body.classList.add('racing');
  }
  endRace() {
    if (this.race) this.race.dispose();
    this.race = null;
    this.paused = false;
    this.audio.stopEngines();
    this.audio.duckMusic(false);
    this.audio.setMode(BOTH, true);
    document.body.classList.remove('racing');
    delete document.body.dataset.mode;
  }
  onlineLobby() {
    const was = !!this.race;
    this.endRace();
    if (was) this.audio.playTitle();
    this.ui.lobby();
  }
  netLeft(why) {
    const was = !!this.race;
    this.endRace();
    if (was) this.audio.playTitle();
    this.ui.onlineMenu(why);
  }
  resume() {
    this.paused = false;
    this.audio.duckMusic(false);
    this.ui.clear();
  }
  quit() {
    this.gp = null;
    if (this.net.active) this.net.close();
    if (this.race) this.race.dispose();
    this.race = null;
    this.paused = false;
    this.audio.stopEngines();
    this.audio.duckMusic(false);
    this.audio.setMode(BOTH, true);
    this.audio.playTitle();
    document.body.classList.remove('racing');
    delete document.body.dataset.mode;
    this.ui.title();
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.input.update();
    this.renderer.trackFrame(dt);
    if (this.race) {
      if (!this.paused && this.input.menu('pause') && this.race.state !== 'finished') this.pause();
      else if (this.paused) this.ui.update();
      if (!this.paused || this.race.online) {
        this.race.update(dt);
        this.net.tick(dt, this.race);
        this.ui.updateHud(this.race, dt);
        if (this.race.state === 'finished') {
          this.race.finishT = (this.race.finishT || 0) + dt;
          if (this.race.finishT > 2.5 && !this.resultsShown) {
            this.resultsShown = true;
            this.ui.results(this.race);
          }
          if (this.resultsShown) this.ui.update();
        }
      }
      this.renderer.render(this.race.scene, [{ camera: this.race.cam.camera, x: 0, y: 0, w: 1, h: 1 }], 0.85);
    } else {
      this.ui.update();
      if (this.showroom) {
        this.showroom.update(dt);
        this.renderer.setGrade('neon', 0, 0);
        this.renderer.render(this.showroom.scene, [{ camera: this.showroom.camera, x: 0, y: 0, w: 1, h: 1 }], 0.85);
      } else if (this.attract) this.updateAttract(dt);
    }
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  // Test hook: run the race faster than real time (headless playtests), then draw one frame.
  simulate(sec, dt = 1 / 60) {
    if (!this.race) return;
    for (let t = 0; t < sec; t += dt) {
      this.race.update(dt);
      this.ui.updateHud(this.race, dt);
    }
    this.renderer.render(this.race.scene, [{ camera: this.race.cam.camera, x: 0, y: 0, w: 1, h: 1 }], 0.85);
  }

  // ------------------------------------------------------------------ touch: steer on the left, pedals and lenses on the right
  setupTouch() {
    const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
    if (!isTouch) return;
    const T = document.getElementById('touch');
    T.hidden = false;
    T.innerHTML = `
      <div class="t-steer"><button data-k="left">◀</button><button data-k="right">▶</button></div>
      <div class="t-right">
        <div class="t-lens"><button data-k="red" class="red">RED</button><button data-k="both" class="both">BOTH</button><button data-k="blue" class="blue">BLUE</button></div>
        <div class="t-pedals"><button data-k="drift">DRIFT</button><button data-k="brake">BRAKE</button><button data-k="gas" class="gas">GAS</button></div>
      </div>`;
    const t = this.input.touch;
    const held = new Map();
    const apply = () => {
      const ks = new Set(held.values());
      t.active = true;
      t.steer = (ks.has('right') ? 1 : 0) - (ks.has('left') ? 1 : 0);
      t.throttle = ks.has('gas') ? 1 : 0;
      t.brake = ks.has('brake') ? 1 : 0;
      t.drift = ks.has('drift');
    };
    T.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      this.audio.init();
      this.input.lastDevice = 'touch';
      const k = b.dataset.k;
      if (k === 'red') this.input.touchEdge('item');
      else if (k === 'blue') this.input.touchEdge('special');
      else if (k === 'both') this.input.touchEdge('jump');
      else held.set(e.pointerId, k);
      b.classList.add('down');
      apply();
    });
    const up = (e) => {
      held.delete(e.pointerId);
      T.querySelectorAll('.down').forEach((b) => b.classList.remove('down'));
      apply();
    };
    T.addEventListener('pointerup', up);
    T.addEventListener('pointercancel', up);
    // the menus are tap-driven already
    void storage;
  }
}

window.app = new App();
