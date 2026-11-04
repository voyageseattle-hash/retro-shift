// Retro Shift's audio: Absurd Combat Racing's engine (engine.js: mix buses, reverb, ping-pong delay, glue compressor
// and limiter, the step sequencer and synth, per-car engines), with the songs split into red and blue bands,
// shift effects of our own, and rival engines placed in 3D around the player.

import { Audio as Engine } from './engine.js';
import { SONGS, COURSE_SONG } from './songs.js';
import { clamp } from './util.js';
import { syllable } from './synth.js';
import { BOTH, RED, BLUE } from '../world/shift.js';

const WORLD = { [BOTH]: 'both', [RED]: 'red', [BLUE]: 'blue' };
// Radio voices for the rival drivers and the two secret guests: pitch, formant scale, pace and colour.
const RADIO_VOICES = {
  vector: { f0: 0.72, form: 0.92, rate: 1.1 }, // VEX: low and unhurried
  scanline: { f0: 1.3, form: 1.12, rate: 0.7, cons: ['b', 'g', 'y', 'w', ''] }, // LINA SCAN: fast and bright
  polygon: { f0: 1.12, form: 1.05, rate: 0.9, wave: 'square', cons: ['g', 'b', 'h', ''] }, // POLLY GONE: precise
  chroma: { f0: 1.22, form: 1.16, rate: 1.0, vib: true, cons: ['w', 'y', 'h', 'r', ''] }, // KROMA: theatrical
  raster: { f0: 1.6, form: 1.2, rate: 0.78, wave: 'square' }, // RAZ: chiptune kid
  glitch: { f0: 0.95, form: 1.0, rate: 0.85, wave: 'square', glitch: true }, // GL1TCH: comes through wrong
  dash: { f0: 1.02, form: 1.04, rate: 0.9 }, // DASH: plucky
  greatwedge: { f0: 0.6, form: 0.86, rate: 1.15, growl: 0.45 }, // Captain Finn Razorback
};
const ANNOUNCER = ['title', 'three', 'two', 'one', 'go', 'lap2', 'final', 'winner', 'second', 'third', 'over', 'record', 'gold', 'champion', 'p1wins', 'p2wins', 'ready', 'grandprix', 'timetrial', 'monorun', 'twoplayer', 'online', 'shift', 'unlocked'];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio extends Engine {
  constructor(ctx = null) {
    super(ctx);
    this.player = null;
    this.rivals = new Map();
  }

  init() {
    this.unlock();
    this.loadVoice();
  }

  // ------------------------------------------------------------ announcer
  // One arcade announcer for the whole game: recorded once offline, then aged like a 90s cabinet (pitched down,
  // band-limited, a little bit-crushed, slapback hall) and kept as small files in audio/voice/.
  loadVoice() {
    if (!this.ctx || this.voice) return;
    this.voice = new Map();
    for (const id of ANNOUNCER) {
      fetch(`audio/voice/${id}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .then((b) => this.ctx.decodeAudioData(b))
        .then((buf) => this.voice.set(id, buf))
        .catch(() => {});
    }
  }
  // Play an announcer line; returns its length in seconds (0 if it isn't loaded yet).
  announce(id, delay = 0, vol = 1) {
    const buf = this.voice?.get(id);
    if (!buf || !this.ctx || this.announcerOff) return 0;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 1.15 * vol;
    src.connect(g);
    g.connect(this.sfxDry || this.sfx);
    if (this.roomIn) {
      const w = this.ctx.createGain();
      w.gain.value = 0.18;
      g.connect(w).connect(this.roomIn);
    }
    src.start(t);
    // the music ducks under the voice
    if (this.music) {
      const mg = this.music.gain;
      mg.cancelScheduledValues(t);
      mg.setTargetAtTime(this.musicVolume * 0.4, t, 0.03);
      mg.setTargetAtTime(this.musicVolume, t + buf.duration - 0.35, 0.3);
    }
    return buf.duration;
  }
  // The title shout: an engine winding up, a whoosh, and the announcer over the top.
  titleShout(delay = 0.15) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const out = this.sfxDry || this.sfx;
    // engine rev: two detuned saws through a sweeping low-pass, pitch climbing then dropping off
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.12);
    g.gain.setValueAtTime(0.32, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.7);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.85);
    f.frequency.exponentialRampToValueAtTime(500, t + 1.6);
    for (const det of [0, 7]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det * 3;
      o.frequency.setValueAtTime(38, t);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.8);
      o.frequency.exponentialRampToValueAtTime(95, t + 0.95);
      o.frequency.exponentialRampToValueAtTime(150, t + 1.25);
      o.frequency.exponentialRampToValueAtTime(60, t + 1.7);
      o.connect(f);
      o.start(t);
      o.stop(t + 1.8);
    }
    f.connect(g).connect(out);
    // whoosh as the logo lands
    this.swell?.(t + 0.6, 0.5, 0.35, out, 'bandpass', 400, 5000, 1.2);
    this.announce('title', delay + 0.55, 1.2);
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
  // self: the racer whose engine plays centre (defaults to skipping every player)
  rivalEngines(listener, racers, self = null) {
    if (!this.ctx) return;
    const seen = new Set();
    for (const r of racers) {
      if (self ? r === self : r.isPlayer) continue;
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

  // ------------------------------------------------------------ radio voices
  // Each rival mumbles in gibberish (Absurd Combat Racing's formant voices) through a radio: a key-up click and a
  // little static, a band-limited, slightly crunchy voice, the music dipping under it, and a click off.
  radioBus() {
    if (this._radio) return this._radio;
    const ctx = this.ctx;
    const inp = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 420;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 1600;
    peak.gain.value = 6;
    const crush = ctx.createWaveShaper();
    crush.curve = this.curves.warm;
    const out = ctx.createGain();
    out.gain.value = 1.3;
    inp.connect(hp).connect(lp).connect(peak).connect(crush).connect(out).connect(this.sfxDry);
    this._radio = inp;
    return inp;
  }
  // text sets the length; returns how long the transmission lasts
  radio(voiceId, text = '', mood = 'talk', at0 = null) {
    if (!this.ctx || (!this.offline && this.ctx.state !== 'running')) return 0;
    const v = RADIO_VOICES[voiceId] || RADIO_VOICES.vector;
    const bus = this.radioBus();
    const t = (at0 ?? this.now()) + 0.02;
    const r = (a, b) => a + Math.random() * (b - a);
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    // key up
    this.tone('square', 2100, t, 0.025, 0.06, bus);
    this.swell(t, 0.16, 0.18, bus, 'bandpass', 3000, 1400, 1.5);
    const words = Math.max(2, Math.min(9, Math.round(text.split(/\s+/).length * 0.8)));
    const P = 175;
    let at = t + 0.12;
    for (let w = 0; w < words; w++) {
      const syl = 1 + (Math.random() < 0.45 ? 1 : 0);
      for (let k = 0; k < syl; k++) {
        const last = w === words - 1 && k === syl - 1;
        // questions and exclamations bend the last syllable
        const bend = last ? (text.endsWith('?') ? 1.35 : text.endsWith('!') ? 1.2 : mood === 'lose' ? 0.7 : 0.88) : 1;
        let f0 = P * r(0.92, 1.12) * (v.lift || 1);
        if (v.glitch && Math.random() < 0.3) f0 *= pick([0.5, 1.8, 2.4]);
        const dur = r(0.06, 0.1) * (last ? 1.7 : 1);
        syllable(this, at, { c: pick(v.cons || ['b', 'g', 'w', 'y', '', 'h', 'r']), v: pick(['a', 'e', 'i', 'o', 'u', 'ae']), f0, f1: f0 * bend, dur, vol: 0.9 }, v, bus);
        at += dur * v.rate + 0.02;
        // GL1TCH stutters
        if (v.glitch && Math.random() < 0.25) {
          syllable(this, at, { c: '', v: 'i', f0: f0 * 1.5, dur: 0.035, vol: 0.7 }, v, bus);
          at += 0.05;
        }
      }
      at += r(0.04, 0.09) * v.rate;
    }
    // key off: a tail of static and a click
    this.swell(at, 0.1, 0.12, bus, 'bandpass', 1800, 2800, 1.5);
    this.tone('square', 1500, at + 0.08, 0.02, 0.05, bus);
    // dip the music under the voice
    if (this.music) {
      const g = this.music.gain;
      const vol = this.musicVolume;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(vol * 0.45, t, 0.05);
      g.setTargetAtTime(vol, at + 0.1, 0.25);
    }
    return at - t + 0.15;
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
