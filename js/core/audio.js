// Everything you hear is synthesized live. The music is split the same way the world is: a RED band (driving saw
// bass and a hard lead) and a BLUE band (pads and a glassy arp) over shared drums. In BOTH you hear the whole song;
// shift to one world and the other band drops away under a low-pass, like hearing it through a wall.

import { clamp } from './util.js';
import { BOTH, RED, BLUE } from '../world/shift.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Chord roots (MIDI) and minor/major flags per song. 16 steps a bar.
const SONGS = [
  { bpm: 112, roots: [45, 41, 48, 43], minor: [1, 0, 0, 0] }, // Am F C G
  { bpm: 118, roots: [40, 36, 43, 38], minor: [1, 0, 0, 0] }, // Em C G D
  { bpm: 124, roots: [38, 46, 41, 45], minor: [1, 0, 0, 0] }, // Dm Bb F A
  { bpm: 108, roots: [42, 38, 45, 40], minor: [1, 0, 0, 0] }, // F#m D A E
  { bpm: 128, roots: [43, 39, 46, 41], minor: [1, 0, 0, 0] }, // Gm Eb Bb F
];

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicVol = 0.55;
    this.sfxVol = 0.8;
    this.mode = BOTH;
    this.playing = false;
    this.song = SONGS[0];
    this.step = 0;
    this.nextT = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = 0.8;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.music = c.createGain();
    this.music.gain.value = this.musicVol;
    this.music.connect(this.master);
    this.sfx = c.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);
    // the two worlds' bands
    const band = () => {
      const g = c.createGain();
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 18000;
      f.Q.value = 0.7;
      g.connect(f).connect(this.music);
      return { g, f };
    };
    this.red = band();
    this.blue = band();
    this.drums = c.createGain();
    this.drums.gain.value = 0.9;
    this.drums.connect(this.music);
    // delay for the blue band
    const dl = c.createDelay(1);
    dl.delayTime.value = 0.32;
    const fb = c.createGain();
    fb.gain.value = 0.35;
    this.blueDelay = dl;
    this.blue.g.connect(dl);
    dl.connect(fb).connect(dl);
    dl.connect(this.blue.f);
    // noise
    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    // engine
    this.engine = this.makeEngine();
    this.setMode(BOTH, true);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setVolumes(music, sfx) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(music, this.ctx.currentTime, 0.05);
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
  }

  // ------------------------------------------------------------ music
  playSong(index) {
    this.song = SONGS[index % SONGS.length];
    if (!this.ctx) return;
    this.playing = true;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
  }
  stopSong() {
    this.playing = false;
  }

  setMode(mode, instant = false) {
    this.mode = mode;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const tc = instant ? 0.001 : 0.06;
    const on = (b, yes) => {
      b.g.gain.setTargetAtTime(yes ? 1 : 0.22, t, tc);
      b.f.frequency.setTargetAtTime(yes ? 18000 : 500, t, tc);
    };
    on(this.red, mode !== BLUE);
    on(this.blue, mode !== RED);
  }

  schedule() {
    if (!this.playing || !this.ctx) return;
    const c = this.ctx;
    const spb = 60 / this.song.bpm / 4;
    while (this.nextT < c.currentTime + 0.12) {
      this.playStep(this.step, this.nextT, spb);
      this.step++;
      this.nextT += spb;
    }
  }

  playStep(step, t, spb) {
    const S = this.song;
    const bar = Math.floor(step / 16) % S.roots.length;
    const s = step % 16;
    const root = S.roots[bar];
    const third = S.minor[bar] ? 3 : 4;
    const chord = [0, third, 7];
    const section = Math.floor(step / 64) % 4; // intro-ish variation
    // drums
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 1 || section > 0) this.hat(t, s % 2 ? 0.05 : 0.025);
    // RED band: driving octave bass + lead stabs
    this.tone(this.red.g, 'sawtooth', mtof(root + (s % 2 ? 12 : 0)), t, spb * 0.9, 0.12, 900 + (s % 4) * 300);
    if (section >= 1 && [0, 3, 6, 10, 12].includes(s)) {
      const n = root + 24 + chord[(s + bar) % 3] + (s === 12 ? 12 : 0);
      this.tone(this.red.g, 'square', mtof(n), t, spb * 1.6, 0.05, 2600);
    }
    // BLUE band: pad on the bar + glass arp
    if (s === 0) for (const k of chord) this.tone(this.blue.g, 'triangle', mtof(root + 12 + k), t, spb * 15, 0.045, 1800, 0.4);
    const arp = [0, 7, 12, third + 12, 19, 12, 7, third + 24];
    if (s % 2 === 0) this.tone(this.blue.g, 'sine', mtof(root + 36 + arp[(s / 2) % 8] - 12), t, spb * 1.5, 0.06, 6000);
  }

  tone(dest, type, freq, t, dur, vol, cutoff = 4000, attack = 0.005) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.3), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  kick(t) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.3);
  }
  noiseHit(dest, t, dur, vol, type, freq, q = 1) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
    return f;
  }
  snare(t) {
    this.noiseHit(this.drums, t, 0.18, 0.35, 'bandpass', 1800, 0.8);
    this.tone(this.drums, 'triangle', 190, t, 0.1, 0.2, 2000);
  }
  hat(t, v) {
    this.noiseHit(this.drums, t, 0.04, v * 2, 'highpass', 8000);
  }

  // ------------------------------------------------------------ engine
  makeEngine() {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    const o2 = c.createOscillator();
    o2.type = 'square';
    o2.detune.value = 7;
    const o3 = c.createOscillator();
    o3.type = 'sine';
    o1.connect(f);
    o2.connect(f);
    o3.connect(g);
    f.connect(g).connect(this.sfx);
    o1.start();
    o2.start();
    o3.start();
    return { g, f, o1, o2, o3 };
  }
  updateEngine(speed, throttle, boost, on) {
    if (!this.ctx) return;
    const e = this.engine;
    const t = this.ctx.currentTime;
    const k = clamp(Math.abs(speed) / 55, 0, 1.5);
    const base = 48 + k * 95 + (boost ? 25 : 0);
    e.o1.frequency.setTargetAtTime(base, t, 0.05);
    e.o2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
    e.o3.frequency.setTargetAtTime(base * 4, t, 0.05);
    e.f.frequency.setTargetAtTime(350 + k * 1400 + throttle * 500, t, 0.05);
    e.g.gain.setTargetAtTime(on ? 0.05 + throttle * 0.05 + k * 0.03 : 0, t, 0.08);
  }

  // ------------------------------------------------------------ effects
  play(name, arg) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const S = this.sfx;
    switch (name) {
      case 'shift': {
        // a filtered whoosh: up into red, down into blue, a chord swell back into both
        const f = this.noiseHit(S, t, 0.45, 0.5, 'bandpass', 600, 4);
        const [a, b] = arg === RED ? [500, 3500] : arg === BLUE ? [4000, 300] : [800, 1600];
        f.frequency.setValueAtTime(a, t);
        f.frequency.exponentialRampToValueAtTime(b, t + 0.35);
        const base = arg === RED ? 57 : arg === BLUE ? 64 : 60;
        this.tone(S, arg === RED ? 'sawtooth' : 'sine', mtof(base), t, 0.3, 0.12, 3000);
        this.tone(S, arg === RED ? 'sawtooth' : 'sine', mtof(base + 7), t + 0.04, 0.3, 0.08, 3000);
        break;
      }
      case 'denied':
        this.tone(S, 'square', 110, t, 0.18, 0.12, 900);
        this.tone(S, 'square', 104, t + 0.08, 0.18, 0.1, 900);
        break;
      case 'boost': {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(900, t + 0.4);
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g).connect(S);
        o.start(t);
        o.stop(t + 0.55);
        this.noiseHit(S, t, 0.5, 0.3, 'highpass', 2000);
        break;
      }
      case 'turbo':
        for (let k = 0; k < (arg || 1); k++) this.tone(S, 'square', mtof(72 + k * 5), t + k * 0.05, 0.15, 0.08, 5000);
        break;
      case 'hit':
        this.noiseHit(S, t, 0.3, 0.7, 'lowpass', 600);
        this.tone(S, 'sine', 70, t, 0.25, 0.4, 400);
        break;
      case 'wall':
        this.noiseHit(S, t, 0.5, 0.9, 'lowpass', 900);
        this.tone(S, 'sawtooth', 60, t, 0.4, 0.3, 500);
        break;
      case 'scrape':
        this.noiseHit(S, t, 0.12, 0.15, 'bandpass', 3000, 2);
        break;
      case 'phase':
        this.tone(S, 'sine', mtof(84), t, 0.25, 0.06, 8000);
        this.tone(S, 'sine', mtof(91), t + 0.05, 0.25, 0.05, 8000);
        break;
      case 'shard':
        this.tone(S, 'triangle', mtof(88), t, 0.2, 0.12, 9000);
        this.tone(S, 'triangle', mtof(95), t + 0.06, 0.3, 0.1, 9000);
        break;
      case 'beep':
        this.tone(S, 'square', arg ? 1320 : 660, t, arg ? 0.5 : 0.18, 0.15, 6000);
        break;
      case 'lap':
        [72, 76, 79, 84].forEach((n, k) => this.tone(S, 'square', mtof(n), t + k * 0.08, 0.2, 0.08, 6000));
        break;
      case 'finish':
        [60, 64, 67, 72, 76, 79, 84].forEach((n, k) => this.tone(S, 'sawtooth', mtof(n), t + k * 0.07, 0.4, 0.07, 5000));
        break;
      case 'fall': {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(800, t);
        o.frequency.exponentialRampToValueAtTime(60, t + 0.9);
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
        o.connect(g).connect(S);
        o.start(t);
        o.stop(t + 1.05);
        break;
      }
      case 'ui':
        this.tone(S, 'square', arg ? 990 : 660, t, 0.06, 0.06, 5000);
        break;
      case 'land':
        this.noiseHit(S, t, 0.15, clamp((arg || 5) / 20, 0.05, 0.4), 'lowpass', 500);
        break;
    }
  }
}
