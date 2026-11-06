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
  // The studio card's sting: a bright detuned chord stab that rings out into the room.
  // The studio card's sound, timed to its picture (css #splash): an old set thunks on and its flyback whines, mains
  // hum under everything, the red outline zaps in on the left and the blue on the right, the snake hisses up out of the
  // dark as the logo flickers in, a sub boom and a dark E minor chord as it lands, and the cracks in the apple beat
  // like a slow heart. A bell rings for PRESENTS.
  splashIntro(delay = 0.05) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const dry = this.sfxDry || this.sfx;
    const room = this.roomIn || dry;
    const pan = (v, dest) => {
      const p = ctx.createStereoPanner();
      p.pan.value = v;
      p.connect(dest);
      return p;
    };
    const hold = (node, t0, t1, peak, a = 0.05, r = 0.4) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + a);
      g.gain.setValueAtTime(peak, t1 - r);
      g.gain.linearRampToValueAtTime(0, t1);
      node.connect(g);
      return g;
    };
    // power on: relay click, a dropping thunk, the tube's degauss "boing", the 15.7 kHz flyback
    this.noiseHit(t, 0.02, 0.5, dry, 'highpass', 3000, 0.7);
    this.thump(t + 0.01, 90, 32, 0.5, 0.75);
    this.tone('sine', 52, t + 0.02, 0.9, 0.25, dry, { slideTo: 44, attack: 0.01 });
    this.tone('triangle', 110, t + 0.05, 0.6, 0.06, room, { slideTo: 70, filter: 400 });
    const fly = ctx.createOscillator();
    fly.frequency.value = 15734;
    hold(fly, t + 0.05, t + 4.4, 0.01, 0.3, 1).connect(dry);
    fly.start(t);
    fly.stop(t + 4.5);
    // mains hum with a little buzz
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 60;
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 260;
    hum.connect(hf);
    hold(hf, t, t + 4.5, 0.035, 0.25, 1.2).connect(dry);
    hum.start(t);
    hum.stop(t + 4.6);
    // the outline traced in red (left) then blue (right): a buzzing zap sweeping up as the line draws down the logo
    for (const [t0, p, f0, det] of [[0.45, -0.7, 180, 0], [0.7, 0.7, 186, 14]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(f0, t + t0);
      o.frequency.exponentialRampToValueAtTime(f0 * 4, t + t0 + 1.1);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 6;
      f.frequency.setValueAtTime(700, t + t0);
      f.frequency.exponentialRampToValueAtTime(4200, t + t0 + 1.1);
      const am = ctx.createOscillator();
      am.type = 'square';
      am.frequency.value = 30;
      const amg = ctx.createGain();
      amg.gain.value = 0.35;
      o.connect(f);
      const g = hold(f, t + t0, t + t0 + 1.15, 0.09, 0.02, 0.25);
      am.connect(amg).connect(g.gain);
      g.connect(pan(p, dry));
      g.connect(pan(p, room));
      for (const x of [o, am]) {
        x.start(t + t0);
        x.stop(t + t0 + 1.2);
      }
      this.noiseHit(t + t0 + 1.1, 0.12, 0.18, pan(p, room), 'bandpass', 5000, 2);
    }
    // the snake: a long hiss that tightens, gated by the logo's flicker
    const hs = ctx.createBufferSource();
    hs.buffer = this.buffers.noise;
    hs.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.Q.value = 1.4;
    hp.frequency.setValueAtTime(2600, t + 1.2);
    hp.frequency.exponentialRampToValueAtTime(7500, t + 2.6);
    const hg = ctx.createGain();
    const T = t + 1.25;
    hg.gain.setValueAtTime(0, T);
    hg.gain.linearRampToValueAtTime(0.22, T + 0.17);
    hg.gain.linearRampToValueAtTime(0.05, T + 0.25);
    hg.gain.linearRampToValueAtTime(0.3, T + 0.42);
    hg.gain.exponentialRampToValueAtTime(0.0005, T + 1.7);
    hs.connect(hp).connect(hg);
    hg.connect(pan(-0.25, dry));
    hg.connect(room);
    hs.start(T);
    hs.stop(T + 1.8);
    // landing: sub boom, a low tom and the chord, red voices left and blue voices right
    const L = t + 1.67;
    this.thump(L, 70, 28, 1.6, 0.9);
    this.noiseHit(L, 0.35, 0.25, room, 'lowpass', 900, 0.7, 120);
    [[40, -0.4], [47, 0.4], [52, -0.6], [55, 0.6], [59, -0.3], [66, 0.3], [71, 0]].forEach(([m, p], k) => {
      const f = mtof(m);
      const dest = pan(p, k > 4 ? room : dry);
      this.tone('sawtooth', f, L + k * 0.025, 2.6, 0.035, dest, { attack: 0.06, filter: 2400, filterTo: 300, detune: k % 2 ? 7 : -7 });
      this.tone('sine', f, L + k * 0.025, 3, 0.05, room, { attack: 0.2 });
    });
    // the apple's heartbeat on each pulse of the cracks
    for (const b of [3.25, 5.65]) {
      this.thump(t + b, 58, 34, 0.3, 0.45);
      this.thump(t + b + 0.24, 52, 30, 0.35, 0.3);
    }
    // PRESENTS
    this.tone('sine', mtof(83), t + 2.75, 1.6, 0.05, room, { fm: [3.5, 2] });
    this.tone('sine', mtof(76), t + 2.78, 1.8, 0.04, room, { fm: [2, 1] });
  }
  // The press that leaves the card: a short tape-stop swish into the title.
  splashSting() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    this.swell(t, 0.5, 0.12, this.roomIn || this.sfxDry, 'bandpass', 600, 5000, 1.2);
    this.tone('sawtooth', mtof(52), t, 0.45, 0.05, this.sfxDry, { slideTo: mtof(40), filter: 1800, filterTo: 200 });
  }
  // The title shout: a V8 cranked, caught, idling with a lumpy cam, blipped twice and wound all the way out,
  // with the announcer landing on top of the scream.
  titleShout(delay = 0.15) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const out = this.sfxDry || this.sfx;
    // rpm script: [time, rpm]
    const RPM = [[0, 0], [0.75, 0], [0.82, 1400], [1.0, 1100], [1.2, 850], [1.7, 900], [1.85, 4200], [2.15, 1500], [2.4, 950],
      [2.55, 5600], [2.85, 1800], [3.0, 1300], [3.75, 8200], [3.95, 6100], [4.6, 8800], [5.0, 8600], [5.8, 1600], [6.6, 900]];
    const fire = (r) => (r / 60) * 4; // V8 firing frequency
    const end = t + 6.8;
    // --- starter motor: a whining whirr and the engine's compression chugging against it
    const sw = ctx.createOscillator();
    sw.type = 'sawtooth';
    sw.frequency.setValueAtTime(260, t);
    sw.frequency.linearRampToValueAtTime(330, t + 0.7);
    const swg = ctx.createGain();
    swg.gain.setValueAtTime(0, t);
    swg.gain.linearRampToValueAtTime(0.05, t + 0.05);
    swg.gain.setValueAtTime(0.05, t + 0.75);
    swg.gain.linearRampToValueAtTime(0, t + 0.85);
    const chug = ctx.createOscillator();
    chug.type = 'square';
    chug.frequency.setValueAtTime(7, t);
    chug.frequency.linearRampToValueAtTime(10, t + 0.75);
    const chugAmt = ctx.createGain();
    chugAmt.gain.value = 0.04;
    chug.connect(chugAmt).connect(swg.gain);
    const swf = ctx.createBiquadFilter();
    swf.type = 'bandpass';
    swf.frequency.value = 900;
    swf.Q.value = 1.2;
    sw.connect(swf).connect(swg).connect(out);
    // --- the engine: a narrow pulse train at the firing rate (rich in harmonics), a half-rate lope, cycle jitter
    const N = 24;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for (let k = 1; k < N; k++) im[k] = (Math.sin(k * 0.35) / k) * (k % 2 ? 1 : 0.7);
    const wave = ctx.createPeriodicWave(re, im);
    const body = ctx.createOscillator();
    body.setPeriodicWave(wave);
    const lope = ctx.createOscillator();
    lope.type = 'triangle';
    const jit = ctx.createBufferSource();
    const jb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const jd = jb.getChannelData(0);
    let v = 0;
    for (let i = 0; i < jd.length; i++) jd[i] = v = v * 0.995 + (Math.random() - 0.5) * 0.1;
    jit.buffer = jb;
    jit.loop = true;
    const jitAmt = ctx.createGain();
    jitAmt.gain.value = 120;
    jit.connect(jitAmt).connect(body.detune);
    jit.connect(jitAmt).connect(lope.detune);
    const prev = { r: 0 };
    for (const [dt, r] of RPM) {
      const at = t + dt;
      const f = Math.max(1, fire(r));
      if (dt === 0) {
        body.frequency.setValueAtTime(f, at);
        lope.frequency.setValueAtTime(f / 2, at);
      } else {
        body.frequency.linearRampToValueAtTime(f, at);
        lope.frequency.linearRampToValueAtTime(f / 2, at);
      }
      prev.r = r;
    }
    const mixG = ctx.createGain();
    const bodyG = ctx.createGain();
    bodyG.gain.value = 0.9;
    const lopeG = ctx.createGain();
    lopeG.gain.value = 0.45;
    body.connect(bodyG).connect(mixG);
    lope.connect(lopeG).connect(mixG);
    // intake/exhaust roar: noise that opens up with the revs
    const nz = ctx.createBufferSource();
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    nz.buffer = nb;
    nz.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.Q.value = 0.9;
    const ng = ctx.createGain();
    nz.connect(nf).connect(ng).connect(mixG);
    // grit, then the exhaust's resonances and a low-pass that follows the revs
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 3.2) * 0.9;
    }
    shaper.curve = curve;
    const res1 = ctx.createBiquadFilter();
    res1.type = 'peaking';
    res1.frequency.value = 110;
    res1.Q.value = 1.4;
    res1.gain.value = 7;
    const res2 = ctx.createBiquadFilter();
    res2.type = 'peaking';
    res2.frequency.value = 520;
    res2.Q.value = 2;
    res2.gain.value = 5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2.2;
    const eg = ctx.createGain();
    // throttle: how hard it's working sets level, brightness and roar
    eg.gain.setValueAtTime(0, t);
    lp.frequency.setValueAtTime(400, t);
    nf.frequency.setValueAtTime(600, t);
    ng.gain.setValueAtTime(0, t);
    let lastR = 0;
    for (const [dt, r] of RPM) {
      const at = t + dt;
      const on = r > lastR + 200; // revving up = throttle open
      const lvl = r <= 0 ? 0 : 0.16 + Math.min(1, r / 8800) * 0.22 + (on ? 0.06 : 0);
      eg.gain.linearRampToValueAtTime(lvl, at);
      lp.frequency.linearRampToValueAtTime(500 + r * (on ? 0.85 : 0.45), at);
      nf.frequency.linearRampToValueAtTime(700 + r * 0.5, at);
      ng.gain.linearRampToValueAtTime(r <= 0 ? 0 : 0.03 + (on ? 0.12 : 0.03) * (r / 8800), at);
      lastR = r;
    }
    eg.gain.linearRampToValueAtTime(0, end);
    // the engine ducks hard under the announcer, then swells back as the voice's echoes tail off
    const duck = ctx.createGain();
    duck.gain.setValueAtTime(1, t);
    duck.gain.setValueAtTime(1, t + 3.5);
    duck.gain.linearRampToValueAtTime(0.28, t + 3.62);
    duck.gain.setValueAtTime(0.28, t + 4.9);
    duck.gain.linearRampToValueAtTime(0.6, t + 5.6);
    mixG.connect(shaper).connect(res1).connect(res2).connect(lp).connect(eg).connect(duck).connect(out);
    if (this.roomIn) {
      const w = ctx.createGain();
      w.gain.value = 0.25;
      duck.connect(w).connect(this.roomIn);
    }
    for (const n of [sw, chug, body, lope, jit, nz]) {
      n.start(t);
      n.stop(end + 0.1);
    }
    // a backfire pop as it drops off the first blip
    this.swell?.(t + 2.2, 0.08, 0.3, out, 'lowpass', 900, 200, 0.8);
    // the whoosh as the logo slams in, and the announcer on top of the scream
    this.swell?.(t + 3.3, 0.6, 0.3, out, 'bandpass', 300, 5000, 1.2);
    this.announce('title', delay + 3.55, 1.9);
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
    this.flags.hot = false;
    this.flags.lap = 1;
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
      const vol = r.respawnT > 0 ? 0 : clamp(1 - d / 140, 0, 1) ** 2 * 0.6;
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
    out.gain.value = 0.85; // a notch under the music: the rivals chatter, they don't shout over the race
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
    // The sounds a player can set off many times a second (shifting, grinding a rail, mashing a shift with no
    // energy) are rate-limited, so they read as one event and not a buzz.
    const lim = { shift: 0.07, scrape: 0.22, wall: 0.25, denied: 0.35, smash: 0.08, phase: 0.12, shard: 0.04, chain: 0.08, perfect: 0.15 }[name];
    if (lim) {
      const last = this.throttle.get(`rs-${name}`) ?? -1;
      if (t - last < lim) return;
      this.throttle.set(`rs-${name}`, t);
    }
    switch (name) {
      case 'shift': {
        // a filtered whoosh: up into red, down into blue, a chord swell back into both. It's the button players
        // press most, so it's short and soft, and never quite the same twice.
        const [a, b] = arg === RED ? [600, 3400] : arg === BLUE ? [4200, 380] : [900, 1700];
        const j = 0.94 + Math.random() * 0.12;
        this.swell(t, 0.3, 0.26, W, 'bandpass', a * j, b * j, 1.6);
        const base = arg === RED ? 57 : arg === BLUE ? 64 : 60;
        const type = arg === RED ? 'sawtooth' : arg === BLUE ? 'sine' : 'triangle';
        for (const [k, iv] of [0, 7, 12].entries()) this.tone(type, mtof(base + iv) * j, t + k * 0.025, 0.22, 0.04, W, { filter: arg === RED ? 1800 : 4000 });
        this.thump(t, 90, 40, 0.14, 0.16);
        break;
      }
      case 'denied':
        this.tone('square', 110, t, 0.12, 0.07, this.sfxDry, { filter: 700 });
        this.tone('square', 104, t + 0.07, 0.12, 0.06, this.sfxDry, { filter: 700 });
        break;
      case 'phase':
        this.tone('sine', mtof(84), t, 0.22, 0.07, W, { fm: [3.5, 0.6] });
        this.tone('sine', mtof(91), t + 0.05, 0.25, 0.05, W, { fm: [3.5, 0.6] });
        this.swell(t, 0.25, 0.12, W, 'highpass', 3000, 9000);
        break;
      case 'shard':
        this.arp(t, [88, 92, 95, 100], 0.045, 0.1, 'bell');
        break;
      case 'chain': {
        // a SHIFT CHAIN link: a soft bell pair climbing an E minor pentatonic ladder with the multiplier
        const m = clamp(arg || 1, 1, 8);
        const n = [76, 79, 81, 83, 86, 88, 91, 93][m - 1];
        this.arp(t, [n, n + 7], 0.04, 0.05 + m * 0.004, 'vibes');
        break;
      }
      case 'perfect': {
        // PERFECT SHIFT: a bright zing up into the lens, a quick sparkle, and the big turbo under it
        const up = arg === BLUE ? 1.12 : arg === RED ? 0.9 : 1;
        this.tone('sine', 700 * up, t, 0.16, 0.06, W, { slideTo: 2600 * up, slideTime: 0.12, fm: [2, 0.4] });
        this.arp(t + 0.06, [88, 95, 100], 0.03, 0.06, 'bell');
        this.thump(t, 140, 50, 0.12, 0.2);
        super.play('miniturbo3');
        break;
      }
      case 'chainEnd':
        // the chain lets go: two soft notes back down
        this.arp(t, [83, 76], 0.07, 0.04, 'vibes');
        break;
      case 'chainBreak':
        // broken by a crash: a short dull drop
        this.tone('triangle', 330, t, 0.2, 0.05, this.sfxDry, { slideTo: 120, filter: 1200 });
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
      case 'scrape': {
        // grinding along a rail: a short gritty rasp with a few sparks (it used to ring a metal clank 12 times a second)
        const f = 900 + Math.random() * 700;
        this.noiseHit(t, 0.16, 0.16, this.sfxDirty, 'bandpass', f, 1.4, f * 0.6);
        this.noiseHit(t, 0.05, 0.07, this.sfxDry, 'highpass', 5000);
        this.thump(t, 120, 60, 0.06, 0.18);
        break;
      }
      case 'wreck':
        // the crash, then the car's lines raining down like glass
        super.play('wreck');
        this.thump(t, 110, 30, 0.5, 0.5);
        this.arp(t + 0.08, [96, 91, 99, 88, 94], 0.035, 0.06, 'bell');
        break;
      case 'meteor':
        super.play('explosion', 0.8);
        break;
      case 'strike':
        super.play('thunder', 0.9);
        super.play('bolt');
        break;
      case 'quake':
        // the ground rolling: a long low thump under a slow filtered rumble
        this.thump(t, 52, 24, 1.8, 0.6);
        this.swell(t, 2.2, 0.28, W, 'lowpass', 420, 110, 0.9);
        break;
      case 'crack':
        // a plate letting go: a snap and a falling groan
        super.play('crunch');
        this.tone('sawtooth', 180, t, 1.1, 0.12, W, { slideTo: 36, filter: 700 });
        this.thump(t + 0.05, 70, 26, 1.2, 0.7);
        break;
      case 'smash':
        super.play('crunch');
        super.play('spark');
        this.arp(t, [93, 88, 96], 0.03, 0.05, 'bell');
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
      case 'lap':
        super.play('lap');
        this.setLap(Math.max(2, this.flags.lap));
        break;
      case 'finalLap':
        this.setFinalLap(true);
        break;
      default:
        super.play(name, typeof arg === 'number' ? arg : 1);
    }
  }
}
