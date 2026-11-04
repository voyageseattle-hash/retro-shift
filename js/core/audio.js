// Retro Shift's audio: Absurd Combat Racing's engine (engine.js: mix buses, reverb, ping-pong delay, glue compressor
// and limiter, the step sequencer and synth, per-car engines), with the songs split into red and blue bands,
// shift effects of our own, and rival engines placed in 3D around the player.

import { Audio as Engine } from './engine.js';
import { SONGS, COURSE_SONG } from './songs.js';
import { clamp } from './util.js';
import { BOTH, RED, BLUE } from '../world/shift.js';

const WORLD = { [BOTH]: 'both', [RED]: 'red', [BLUE]: 'blue' };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio extends Engine {
  constructor() {
    super();
    this.player = null;
    this.rivals = new Map();
  }

  init() {
    this.unlock();
  }
  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolumes(music, sfx) {
    this.setMusicVolume(music);
    this.setSfxVolume(sfx);
  }

  // ------------------------------------------------------------ music
  playCourse(courseId) {
    this.world = 'both';
    this.playSong(SONGS[COURSE_SONG[courseId]] || SONGS.circuit);
  }
  playTitle() {
    this.world = 'both';
    this.playSong(SONGS.title);
  }
  setMode(mode, instant = false) {
    this.setWorld(WORLD[mode] || 'both', instant ? 0.001 : 0.07);
  }

  // ------------------------------------------------------------ engines
  // The player's engine plays dead centre; rivals get a panner, distance fall-off and a little doppler.
  playerEngine(speed, topSpeed, throttle, boost, slip, on) {
    if (!this.ctx) return;
    if (!this.player) this.player = this.createEngine(1);
    const e = this.player;
    if (!e) return;
    this.updateEngine(e, clamp(Math.abs(speed) / topSpeed, 0, 1.3), on ? throttle : 0, boost ? 1 : 0, slip, on ? 1 : 0);
  }
  // listener: { pos, fwd (unit, xz), vel }, racers: Racer[]
  rivalEngines(listener, racers) {
    if (!this.ctx) return;
    const seen = new Set();
    for (const r of racers) {
      if (r.isPlayer) continue;
      seen.add(r);
      let e = this.rivals.get(r);
      if (!e) {
        e = this.createEngine(0.8 + (r.index % 5) * 0.09);
        if (!e) continue;
        // re-route the engine body through a panner
        const pan = this.ctx.createStereoPanner();
        e.out.disconnect();
        e.out.connect(pan).connect(this.sfx);
        e.pan = pan;
        e.basePitch = e.pitch;
        this.rivals.set(r, e);
      }
      const dx = r.pos.x - listener.pos.x;
      const dz = r.pos.z - listener.pos.z;
      const dy = r.pos.y - listener.pos.y;
      const d = Math.hypot(dx, dy, dz) + 0.001;
      const vol = r.respawnT > 0 ? 0 : clamp(1 - d / 140, 0, 1) ** 2 * 0.9;
      // right of the listener = -fwd.z, fwd.x (our road convention)
      const side = (dx * -listener.fwd.z + dz * listener.fwd.x) / d;
      e.pan.pan.setTargetAtTime(clamp(-side, -0.95, 0.95), this.now(), 0.05);
      // doppler: closing speed raises the pitch
      const rel = ((r.vel.x - listener.vel.x) * -dx + (r.vel.z - listener.vel.z) * -dz) / d;
      e.pitch = e.basePitch * clamp(1 + rel / 340, 0.85, 1.15);
      this.updateEngine(e, clamp(Math.abs(r.speed) / 55, 0, 1.3), r.ctl.throttle, r.boostTime > 0 ? 1 : 0, r.slip || 0, vol);
    }
    for (const [r, e] of this.rivals) if (!seen.has(r)) {
      this.stopEngine(e);
      this.rivals.delete(r);
    }
  }
  stopEngines() {
    this.stopAllEngines();
    this.player = null;
    this.rivals.clear();
  }

  // ------------------------------------------------------------ effects
  // Retro Shift names, mapped onto Absurd Combat Racing's effect library or our own shift sounds.
  play(name, arg) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.now();
    const W = this.sfxWet;
    switch (name) {
      case 'shift': {
        // a filtered whoosh: up into red, down into blue, a chord swell back into both
        const [a, b] = arg === RED ? [500, 4200] : arg === BLUE ? [5000, 300] : [900, 1800];
        this.swell(t, 0.42, 0.5, W, 'bandpass', a, b, 3);
        const base = arg === RED ? 57 : arg === BLUE ? 64 : 60;
        const type = arg === RED ? 'sawtooth' : arg === BLUE ? 'sine' : 'triangle';
        for (const [k, iv] of [0, 7, 12].entries()) this.tone(type, mtof(base + iv), t + k * 0.03, 0.32, 0.07, W, { filter: arg === RED ? 2400 : 5000 });
        this.thump(t, 90, 40, 0.18, 0.25);
        break;
      }
      case 'denied':
        this.tone('square', 110, t, 0.16, 0.12, this.sfxDry, { filter: 900 });
        this.tone('square', 104, t + 0.08, 0.16, 0.1, this.sfxDry, { filter: 900 });
        break;
      case 'phase':
        this.tone('sine', mtof(84), t, 0.22, 0.07, W, { fm: [3.5, 0.6] });
        this.tone('sine', mtof(91), t + 0.05, 0.25, 0.05, W, { fm: [3.5, 0.6] });
        this.swell(t, 0.25, 0.12, W, 'highpass', 3000, 9000);
        break;
      case 'shard':
        this.arp(t, [88, 92, 95, 100], 0.045, 0.1, 'bell');
        break;
      case 'fall':
        this.tone('triangle', 800, t, 0.9, 0.14, W, { slideTo: 60 });
        break;
      case 'turbo':
        super.play(`miniturbo${clamp(arg || 1, 1, 3)}`);
        break;
      case 'wall':
        super.play('crunch');
        super.play('hit');
        break;
      case 'scrape':
        super.play('clank', 0.6);
        break;
      case 'beep':
        super.play(arg ? 'go' : 'beep');
        break;
      case 'ui':
        super.play(arg ? 'uiConfirm' : 'ui', 0.8);
        break;
      case 'land':
        super.play('land', clamp((arg || 6) / 14, 0.2, 1));
        break;
      case 'finish':
        this.stinger(arg === 1 ? 'win' : 'lose');
        super.play('finish');
        break;
      case 'finalLap':
        this.setFinalLap(true);
        break;
      default:
        super.play(name, typeof arg === 'number' ? arg : 1);
    }
  }
}
