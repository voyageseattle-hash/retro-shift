// Ported from Absurd Combat Racing. Retro Shift adds world gates: a mix channel tagged world: 'red' or 'blue' runs
// through a gate that drops it behind a low-pass when the player shifts into the other world (setWorld).
//
// WebAudio engine: mix buses, the step-sequenced soundtrack (songs.js), punchy procedural sound
// effects, per-truck engines, gibberish driver barks, and a manifest for swapping in audio files.
//
// Mix: songs -> music bus (duck/danger filter, volume) ┐
//      effects -> sfx bus (+ short room reverb)        ├-> glue compressor -> limiter -> out
//      shared long reverb and ping-pong delay sends ----┘

import { clamp } from './util.js';
import { SONGS, STINGERS } from './songs.js';
import { compile } from './sequencer.js';
import { DRUMS, INST, FX, buildBuffers, buildCurves, syllable, mtof } from './synth.js';

export { SONGS, STINGERS };

const LOOKAHEAD = 0.14;
const WORLD_OFF_GAIN = 0.16;
const WORLD_OFF_CUT = 420;

// Driver voices: pitch, formant scale, syllable length and colour.
const VOICES = {
  shark: { f0: 0.62, form: 0.88, rate: 1.15, growl: 0.45 },
  teeth: { f0: 0.95, form: 1.06, rate: 0.95, wave: 'square' },
  cardboard: { f0: 1.45, form: 1.16, rate: 0.78 },
  butter: { f0: 1.7, form: 1.24, rate: 1.0, vib: true },
  disco: { f0: 0.88, form: 1.0, rate: 1.0, vib: true },
  ice: { f0: 0.74, form: 0.94, rate: 1.3 },
  prism: { f0: 1.28, form: 1.12, rate: 0.88, vib: true },
  wagon: { f0: 1.15, form: 1.2, rate: 0.82, vib: true },
  sam: { f0: 0.68, form: 0.9, rate: 1.05, growl: 0.35 },
  boss: { f0: 0.45, form: 0.8, rate: 1.45, growl: 0.8 },
  heli: { f0: 0.55, form: 0.86, rate: 0.9, growl: 0.65, wave: 'square' },
};

export class Audio {
  // Pass an (Offline)AudioContext to build immediately, e.g. for rendering previews.
  constructor(ctx = null) {
    this.ctx = null;
    this.musicVolume = 0.55;
    this.sfxVolume = 0.8;
    this.song = null;
    this.pendingSong = null;
    this.engines = [];
    this.throttle = new Map();
    this.flags = { hot: false, danger: false, pause: false, drop: false };
    this.manifest = null;
    this.manifestBase = '';
    this.files = new Map();
    this.clock = null;
    this.songToken = 0;
    if (ctx) this.build(ctx);
  }

  // Must be called from a user gesture.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.build(new AC({ latencyHint: 'interactive' }));
    this.preloadFiles();
    if (this.pendingSong) {
      const s = this.pendingSong;
      this.pendingSong = null;
      this.playSong(s);
    }
  }

  build(ctx) {
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.buffers = buildBuffers(ctx);
    this.curves = buildCurves();
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.glue = ctx.createDynamicsCompressor();
    this.glue.threshold.value = -16;
    this.glue.knee.value = 8;
    this.glue.ratio.value = 2.5;
    this.glue.attack.value = 0.01;
    this.glue.release.value = 0.2;
    this.master = g(0.95);
    this.glue.connect(this.limiter).connect(this.master).connect(ctx.destination);

    // Music bus.
    this.musicIn = g(1);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.8;
    this.music = g(this.musicVolume);
    this.musicIn.connect(this.musicFilter).connect(this.music).connect(this.glue);

    // Long reverb for the music.
    this.verbIn = g(1);
    const verb = ctx.createConvolver();
    verb.buffer = this.buffers.verbLong;
    const verbHP = ctx.createBiquadFilter();
    verbHP.type = 'highpass';
    verbHP.frequency.value = 220;
    this.verbIn.connect(verbHP).connect(verb).connect(g(0.8)).connect(this.musicIn);

    // Ping-pong delay for the music.
    this.delayIn = g(1);
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    this.delayL = dl;
    this.delayR = dr;
    const fb = g(0.38);
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 3800;
    const pl = ctx.createStereoPanner();
    pl.pan.value = -0.75;
    const pr = ctx.createStereoPanner();
    pr.pan.value = 0.75;
    const dOut = g(0.7);
    this.delayIn.connect(damp).connect(dl);
    dl.connect(dr);
    dr.connect(fb).connect(dl);
    dl.connect(pl).connect(dOut);
    dr.connect(pr).connect(dOut);
    dOut.connect(this.musicIn);
    this.setDelayTime(0.36);

    // Effects bus: dry, roomy and dirty entry points.
    this.sfx = g(this.sfxVolume);
    this.sfx.connect(this.glue);
    this.sfxDry = g(1);
    this.sfxDry.connect(this.sfx);
    const room = ctx.createConvolver();
    room.buffer = this.buffers.verbShort;
    this.roomIn = g(1);
    this.roomIn.connect(room).connect(g(0.9)).connect(this.sfx);
    this.sfxWet = g(1);
    this.sfxWet.connect(this.sfx);
    this.sfxWet.connect(g(0.35)).connect(this.roomIn);
    const dirt = ctx.createWaveShaper();
    dirt.curve = this.curves.warm;
    dirt.oversample = '2x';
    this.sfxDirty = g(1);
    this.sfxDirty.connect(dirt).connect(this.sfxWet);
    this.voiceBus = g(0.9);
    this.voiceBus.connect(this.sfxDry);
    this.voiceBus.connect(g(0.25)).connect(this.roomIn);
    // Kept for older callers.
    this.noise = this.buffers.noise;
  }

  now() {
    return this.clock ?? this.ctx.currentTime;
  }

  setDelayTime(sec) {
    const t = this.now();
    this.delayL.delayTime.setTargetAtTime(sec, t, 0.05);
    this.delayR.delayTime.setTargetAtTime(sec, t, 0.05);
  }
  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.music) this.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }
  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.sfx) this.sfx.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }
  duckMusic(on) {
    this.flags.pause = on;
    this.updateMusicFilter();
  }
  // Pause and specials sweep the music down; low health keeps it slightly muffled.
  updateMusicFilter() {
    if (!this.ctx) return;
    const f = this.flags.pause ? 700 : this.flags.danger ? 3800 : 20000;
    this.musicFilter.frequency.setTargetAtTime(f, this.now(), 0.15);
  }

  // ------------------------------------------------------------ manifest (drop-in audio files)
  // assets/audio/audio.json maps music slots, stingers, sound effects and barks to files.
  async loadManifest(url = 'assets/audio/audio.json') {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return;
      this.manifest = await res.json();
      this.manifestBase = new URL(url, location.href).href.replace(/[^/]*$/, '');
      this.preloadFiles();
      // A custom track for whatever is already playing takes over once it loads.
      const cur = this.song?.def || this.pendingSong;
      if (cur && this.entry('music', cur.id)) {
        this.song = null;
        this.playSong(cur);
      }
    } catch (e) {
      console.warn('Audio manifest not loaded', e);
    }
  }
  entry(group, key) {
    const e = this.manifest?.[group]?.[key];
    if (!e) return null;
    if (typeof e === 'string' || Array.isArray(e)) return { file: e };
    return e.file ? e : null;
  }
  fileList(e) {
    const list = [];
    for (const k of ['file', 'hot', 'danger']) if (e[k]) list.push(...[].concat(e[k]));
    return list;
  }
  preloadFiles() {
    if (!this.ctx || !this.manifest) return;
    for (const group of ['music', 'stingers', 'sfx']) {
      for (const key of Object.keys(this.manifest[group] || {})) {
        const e = this.entry(group, key);
        if (e) for (const f of this.fileList(e)) this.loadFile(f);
      }
    }
    for (const v of Object.values(this.manifest.voices || {})) {
      for (const list of Object.values(v || {})) for (const f of [].concat(list || [])) this.loadFile(f);
    }
  }
  loadFile(path) {
    if (!path || !this.ctx) return Promise.resolve(null);
    if (!this.files.has(path)) {
      const p = fetch(new URL(path, this.manifestBase || location.href))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${path}`))))
        .then((ab) => new Promise((ok, bad) => this.ctx.decodeAudioData(ab, ok, bad)))
        .then((b) => {
          p.buffer = b;
          return b;
        })
        .catch((e) => {
          console.warn('Audio file failed', path, e);
          return null;
        });
      this.files.set(path, p);
    }
    return this.files.get(path);
  }
  fileBuffer(path) {
    return this.files.get(path)?.buffer || null;
  }
  playBuffer(b, t, vol, out, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    s.connect(g).connect(out);
    s.start(t);
    return { s, g };
  }

  // ------------------------------------------------------------ music
  playSong(def) {
    if (!def) return this.stopSong();
    if (!this.ctx) {
      this.pendingSong = def;
      return;
    }
    if (this.song && this.song.def === def && !this.song.ending) return;
    this.stopSong();
    this.songToken++;
    this.flags.hot = false;
    this.flags.danger = false;
    this.updateMusicFilter();
    const t = this.now() + 0.08;
    const out = this.ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(def.gain ?? 1, t, 0.05);
    out.connect(this.musicIn);
    const custom = this.entry('music', def.id);
    if (custom) return this.playFileSong(def, custom, out, t);
    const pump = this.ctx.createGain();
    pump.connect(out);
    this.song = this.makeSeq(def, out, pump, t, 0);
    this.setDelayTime(((def.delayBeats || 0.75) * 60) / def.bpm);
    if (!this.offline) this.song.timer = setInterval(() => this.schedule(this.song), 25);
    this.schedule(this.song);
  }
  makeSeq(def, out, pump, t, transpose) {
    return { def, c: compile(def), fi: 0, s: 0, bar: 0, grid: t, out, pump, chans: {}, gates: [], transpose, timer: 0 };
  }
  stopSong() {
    const s = this.song;
    if (!s) return;
    clearInterval(s.timer);
    const t = this.now();
    s.out.gain.cancelScheduledValues(t);
    s.out.gain.setTargetAtTime(0, t, 0.18);
    if (s.sources) for (const src of s.sources) src.stop(t + 1.2);
    if (!this.offline) setTimeout(() => s.out.disconnect(), 1600);
    this.song = null;
  }
  stepDur(song) {
    const hot = this.flags.hot && !song.stinger ? song.def.hotTempo || 1 : 1;
    return 60 / (song.def.bpm * hot) / 4;
  }
  schedule(song, until = this.now() + LOOKAHEAD) {
    if (!song || song.done) return;
    while (song.grid < until && !song.done) {
      const sd = this.stepDur(song);
      const t = song.grid + (song.s % 2 ? (song.def.swing || 0) * sd : 0);
      this.playStep(song, t, sd);
      song.grid += sd;
      this.advance(song);
    }
  }
  advance(song) {
    const part = song.c.form[song.fi];
    song.s++;
    if (song.s % 16 === 0) song.bar++;
    if (song.s >= part.len) {
      song.s = 0;
      song.fi++;
      if (song.fi >= song.c.form.length) {
        if (song.def.loop === undefined) song.done = true;
        else song.fi = song.def.loop;
      }
    }
  }
  playStep(song, t, sd) {
    const part = song.c.form[song.fi];
    const s = song.s;
    const { hot, danger } = this.flags;
    const mix = song.def.mix;
    for (const ev of part.steps[s]) {
      if (ev.cond === 'hot' && !hot) continue;
      if (ev.cond === 'cool' && hot) continue;
      if (ev.cond === 'danger' && !danger) continue;
      this.trigger(song, ev, t, sd);
    }
    if (s === 0 && part.crash && mix.crash) DRUMS.crash(this, t, 0.9, this.channel(song, 'crash').in);
    // Reverse cymbal into the next section.
    const nextFi = song.fi + 1 < song.c.form.length ? song.fi + 1 : song.def.loop;
    const next = nextFi === undefined ? null : song.c.form[nextFi];
    if (next?.crash && mix.crash && s === part.len - 16) DRUMS.rcrash(this, t + 16 * sd, 0.7, this.channel(song, 'crash').in);
    if (song.stinger) return;
    // Final lap: 16th ghost hats on top of whatever the song has.
    if (hot && mix.hat && !part.steps[s].some((e) => e.ch === 'hat')) DRUMS.hat(this, t, 0.28, this.channel(song, 'hat').in);
    // Low health: heartbeat.
    if (danger && s % 8 === 0) DRUMS.heart(this, t, s % 16 === 0 ? 0.9 : 0.6, song.out);
  }
  trigger(song, ev, t, sd) {
    const m = song.def.mix[ev.ch];
    const dest = this.channel(song, ev.ch).in;
    if (m.drum) {
      const style = m.style || song.def.kit?.[m.drum];
      DRUMS[m.drum](this, t, ev.vel, dest, { style, note: ev.note, slap: ev.slap, len: ev.len * sd });
      if (m.drum === 'kick') this.pump(song, t);
      return;
    }
    if (ev.fx) {
      const dur = ev.len * sd;
      if (ev.fx === 'R') FX.riser(this, t, dur, ev.vel, dest);
      else if (ev.fx === 'D') FX.down(this, t, Math.max(dur, 1), ev.vel, dest);
      else if (ev.fx === 'B') DRUMS.boom(this, t, ev.vel, dest);
      else if (ev.fx === 'V') DRUMS.rcrash(this, t, ev.vel, dest);
      return;
    }
    const inst = INST[m.inst];
    let cut = m.cut;
    if (m.cutSweep) {
      const [lo, hi, bars] = m.cutSweep;
      cut = lo + (hi - lo) * (0.5 - 0.5 * Math.cos((2 * Math.PI * (song.bar + (song.s % 16) / 16)) / bars));
    }
    const tr = song.transpose;
    const dur = ev.len * sd * (ev.slide ? 1.05 : 0.92);
    for (const n of ev.notes) {
      inst(this, t, n + tr, dur, ev.vel, dest, {
        from: ev.slide && ev.from !== null ? ev.from + tr : null,
        slide: ev.slide,
        accent: ev.accent,
        cut,
      });
    }
  }
  // Sidechain: every kick ducks the pumped channels.
  pump(song, t) {
    const p = song.pump?.gain;
    if (!p) return;
    const depth = song.def.pumpDepth ?? 0.55;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(1 - depth, t, 0.004);
    p.setTargetAtTime(1, t + 0.05, 0.08);
  }
  channel(song, name) {
    if (song.chans[name]) return song.chans[name];
    const m = song.def.mix[name];
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = m.vol ?? 1;
    let node = g;
    if (m.world) {
      const wg = ctx.createGain();
      const wf = ctx.createBiquadFilter();
      wf.type = 'lowpass';
      wf.Q.value = 0.9;
      const on = this.worldOn(m.world);
      wg.gain.value = on ? 1 : WORLD_OFF_GAIN;
      wf.frequency.value = on ? 20000 : WORLD_OFF_CUT;
      g.connect(wf).connect(wg);
      node = wg;
      song.gates.push({ world: m.world, g: wg, f: wf });
    }
    if (m.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = m.pan;
      node.connect(p);
      node = p;
    }
    node.connect(m.pump ? song.pump : song.out);
    for (const [amt, bus] of [
      [m.verb, this.verbIn],
      [m.delay, this.delayIn],
    ]) {
      if (!amt) continue;
      const s = ctx.createGain();
      s.gain.value = amt;
      node.connect(s).connect(bus);
    }
    return (song.chans[name] = { in: g });
  }

  // Custom audio file for a slot: loops the main file, with optional hot/danger stems layered in sync.
  playFileSong(def, e, out, t) {
    const token = this.songToken;
    const song = { def, file: e, out, sources: [], stems: {}, timer: 0 };
    this.song = song;
    Promise.all([e.file, e.hot, e.danger].map((f) => (f ? this.loadFile([].concat(f)[0]) : null))).then(([main, hot, danger]) => {
      if (this.songToken !== token || !main) return;
      const t0 = Math.max(t, this.now() + 0.05);
      const start = (b, vol) => {
        const src = this.ctx.createBufferSource();
        src.buffer = b;
        src.loop = e.loop !== false;
        if (e.loopStart) src.loopStart = e.loopStart;
        if (e.loopEnd) src.loopEnd = e.loopEnd;
        const g = this.ctx.createGain();
        g.gain.value = vol;
        src.connect(g).connect(out);
        src.start(t0);
        song.sources.push(src);
        return g;
      };
      start(main, e.gain ?? 1);
      if (hot) song.stems.hot = start(hot, this.flags.hot ? e.gain ?? 1 : 0);
      if (danger) song.stems.danger = start(danger, this.flags.danger ? e.gain ?? 1 : 0);
    });
  }
  updateStems() {
    const s = this.song;
    if (!s?.file) return;
    const t = this.now();
    for (const k of ['hot', 'danger']) s.stems[k]?.gain.setTargetAtTime(this.flags[k] ? s.file.gain ?? 1 : 0, t, 0.3);
  }

  // ---------- worlds ----------
  // 'both', 'red' or 'blue': the other world's channels sink behind a wall.
  worldOn(w) {
    return !this.world || this.world === 'both' || this.world === w;
  }
  setWorld(world, glide = 0.07) {
    this.world = world;
    if (!this.ctx || !this.song?.gates) return;
    const t = this.now();
    for (const gt of this.song.gates) {
      const on = this.worldOn(gt.world);
      gt.g.gain.setTargetAtTime(on ? 1 : WORLD_OFF_GAIN, t, glide);
      gt.f.frequency.setTargetAtTime(on ? 20000 : WORLD_OFF_CUT, t, glide);
    }
  }

  // ---------- intensity ----------
  // Final lap (or the boss's last stand): faster, busier, with a brass stinger on the way in.
  setFinalLap(on, sting = true) {
    if (this.flags.hot === on) return;
    this.flags.hot = on;
    if (on && sting) this.stinger('finalLap');
    this.updateStems();
  }
  // Pass the player's health 0..1 every frame; hysteresis stops it flickering.
  setHealth(h01) {
    const on = this.flags.danger ? h01 < 0.36 : h01 < 0.26 && h01 > 0;
    if (on === this.flags.danger) return;
    this.flags.danger = on;
    this.updateMusicFilter();
    this.updateStems();
  }

  // ---------- stingers ----------
  // finalLap plays over the music; win and lose replace it, then `then` (a song) starts after.
  stinger(name, then = null) {
    if (!this.ctx) return;
    const def = STINGERS[name];
    const t = this.now() + 0.05;
    const custom = this.entry('stingers', name);
    let dur = 0;
    const over = name === 'finalLap';
    if (!over) {
      this.stopSong();
      this.flags.hot = this.flags.danger = false;
      this.updateMusicFilter();
    }
    const token = ++this.songToken;
    if (over && this.song) {
      // Dip the song under the stinger.
      const g = this.song.out.gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(0.35, t, 0.03);
      g.setTargetAtTime(this.song.def.gain ?? 1, t + 1.2, 0.25);
    }
    if (custom) {
      const b = this.fileBuffer([].concat(custom.file)[0]);
      if (b) {
        this.playBuffer(b, t, custom.gain ?? 1, this.musicIn);
        dur = b.duration;
      }
    } else {
      const out = this.ctx.createGain();
      out.connect(this.musicIn);
      let tr = 0;
      if (over && this.song?.def?.tonic) {
        tr = (((this.song.def.tonic - def.tonic) % 12) + 12) % 12;
        if (tr > 6) tr -= 12;
      }
      const seq = this.makeSeq(def, out, out, t, tr);
      seq.stinger = true;
      this.schedule(seq, Infinity);
      dur = seq.grid - t;
      if (!this.offline) setTimeout(() => out.disconnect(), (dur + 4) * 1000);
    }
    if (then && !this.offline) {
      setTimeout(() => {
        if (this.songToken === token) this.playSong(then);
      }, (dur + 0.6) * 1000);
    }
    return dur;
  }

  // ------------------------------------------------------------ sound effects
  // vol scales by distance; key rate-limits rapid repeats of the same sound from one source.
  play(name, vol = 1, key) {
    if (!this.ctx || (!this.offline && this.ctx.state !== 'running') || vol < 0.02) return;
    const t = this.now();
    const rl = key || name;
    const lim = { gun: 0.05, hit: 0.05, clank: 0.08, spark: 0.06, pickup: 0.05, land: 0.12, shieldHit: 0.08 }[name];
    if (lim) {
      const last = this.throttle.get(rl) ?? -1;
      if (t - last < lim) return;
      this.throttle.set(rl, t);
    }
    const custom = this.entry('sfx', name);
    if (custom) {
      const files = [].concat(custom.file);
      const b = this.fileBuffer(files[Math.floor(Math.random() * files.length)]);
      if (b) {
        const pv = custom.pitchVar ?? 0.04;
        this.playBuffer(b, t, vol * (custom.gain ?? 1), this.sfxWet, 1 + (Math.random() * 2 - 1) * pv);
        return;
      }
    }
    this.sound(name, t, vol);
  }

  // Low-level helpers, kept compatible with the original engine.
  tone(type, freq, t, dur, vol, dest, opts = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + (opts.slideTime || dur));
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    const a = opts.attack || 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    let node = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filterType || 'lowpass';
      f.frequency.setValueAtTime(opts.filter, t);
      if (opts.filterTo) f.frequency.exponentialRampToValueAtTime(opts.filterTo, t + dur);
      f.Q.value = opts.q || 1;
      node.connect(f);
      node = f;
    }
    if (opts.fm) {
      // opts.fm = [ratio, index]: quick metallic/bell colour.
      const m = ctx.createOscillator();
      m.frequency.setValueAtTime(freq * opts.fm[0], t);
      if (opts.slideTo) m.frequency.exponentialRampToValueAtTime(opts.slideTo * opts.fm[0], t + (opts.slideTime || dur));
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(freq * opts.fm[1], t);
      mg.gain.setTargetAtTime(0, t, dur / 3);
      m.connect(mg).connect(o.frequency);
      m.start(t);
      m.stop(t + a + dur + 0.05);
    }
    node.connect(g).connect(dest);
    o.start(t);
    o.stop(t + a + dur + 0.05);
    o.onended = () => g.disconnect();
    return g;
  }
  noiseHit(t, dur, vol, dest, type = 'bandpass', freq = 1000, q = 1, freqTo) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.buffers.noise;
    s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.002 + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    s.onended = () => g.disconnect();
  }
  // Swelling noise: rises in over `dur` (whooshes, jets).
  swell(t, dur, vol, dest, type, f0, f1, q = 1) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.buffers.noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
    s.onended = () => g.disconnect();
  }
  // Low punch that sits under impacts.
  thump(t, f0, f1, dur, vol, dest = this.sfxDry) {
    this.tone('sine', f0, t, dur, vol, dest, { slideTo: f1, slideTime: dur * 0.6 });
  }
  debris(t, n, spread, vol) {
    for (let i = 0; i < n; i++) {
      const dt = 0.08 + Math.random() * spread;
      if (Math.random() < 0.5) this.noiseHit(t + dt, 0.04, vol * (0.5 + Math.random() * 0.5), this.sfxWet, 'bandpass', 1500 + Math.random() * 4000, 3);
      else this.tone('sine', 700 + Math.random() * 2200, t + dt, 0.12, vol * 0.4, this.sfxWet, { fm: [2.76, 1.5] });
    }
  }
  // Short melodic figure for pickups and fanfares.
  arp(t, notes, step, vol, inst = 'bell', dest = this.sfxWet, len = 0.12) {
    notes.forEach((n, i) => INST[inst](this, t + i * step, n, len, vol, dest));
  }

  sound(name, t, v) {
    const dry = this.sfxDry;
    const wet = this.sfxWet;
    const dirty = this.sfxDirty;
    const r = (a, b) => a + Math.random() * (b - a);
    switch (name) {
      // ---------- weapons ----------
      case 'gun': {
        const p = r(0.9, 1.1);
        this.noiseHit(t, 0.03, 0.55 * v, dry, 'highpass', 2500 * p);
        this.noiseHit(t, 0.08, 0.4 * v, dirty, 'bandpass', 1100 * p, 1.1, 350);
        this.thump(t, 170 * p, 60, 0.07, 0.5 * v);
        this.tone('square', 2600 * p, t, 0.012, 0.05 * v, dry);
        break;
      }
      case 'hit': {
        const f = r(1700, 2600);
        this.tone('sine', f, t, 0.09, 0.14 * v, wet, { fm: [2.76, 1.2], slideTo: f * 0.8 });
        this.noiseHit(t, 0.03, 0.2 * v, dry, 'highpass', 4500);
        this.thump(t, 220, 90, 0.05, 0.2 * v);
        break;
      }
      case 'clank': {
        for (const f of [320, 457, 713, 1011, 1480]) this.tone('sine', f * r(0.9, 1.1), t, r(0.2, 0.45), 0.07 * v, wet);
        this.noiseHit(t, 0.07, 0.35 * v, dirty, 'bandpass', 1800, 1.5);
        this.thump(t, 110, 50, 0.12, 0.45 * v);
        break;
      }
      case 'spark':
        for (let i = 0; i < 4; i++) this.noiseHit(t + r(0, 0.1), 0.02, 0.12 * v, dry, 'highpass', r(5000, 9000));
        break;
      case 'missile':
        this.noiseHit(t, 0.06, 0.5 * v, dirty, 'lowpass', 1200);
        this.thump(t, 140, 60, 0.1, 0.4 * v);
        this.swell(t, 0.8, 0.4 * v, wet, 'bandpass', 500, 3200, 1.2);
        this.tone('sawtooth', 160, t, 0.6, 0.1 * v, wet, { slideTo: 520, filter: 1200, filterTo: 3000 });
        break;
      case 'explosion':
        this.noiseHit(t, 0.06, 0.8 * v, dirty, 'highpass', 1800);
        this.noiseHit(t, 1.2, 0.9 * v, dirty, 'lowpass', 3000, 0.7, 110);
        this.thump(t, 130, 32, 0.9, 1.0 * v);
        this.noiseHit(t + 0.02, 0.3, 0.35 * v, wet, 'bandpass', 2500, 0.6, 400);
        this.debris(t, 5, 0.5, 0.18 * v);
        break;
      case 'bigExplosion':
        this.noiseHit(t, 0.08, 1.0 * v, dirty, 'highpass', 1500);
        this.noiseHit(t, 2.4, 1.0 * v, dirty, 'lowpass', 2200, 0.7, 50);
        this.thump(t, 110, 24, 1.6, 1.15 * v);
        this.tone('sawtooth', 70, t, 1.0, 0.22 * v, dirty, { slideTo: 28, filter: 400 });
        this.swell(t + 0.05, 1.4, 0.3 * v, wet, 'bandpass', 3000, 300, 0.7);
        this.debris(t, 10, 1.1, 0.22 * v);
        break;
      case 'wreck':
        this.sound('bigExplosion', t, v);
        this.sound('clank', t + 0.02, v * 0.8);
        this.sound('clank', t + r(0.25, 0.45), v * 0.4);
        // Tyre bouncing away.
        for (let i = 0; i < 3; i++) this.thump(t + 0.5 + i * 0.28 * (1 - i * 0.2), 90, 55, 0.1, 0.25 * v * (1 - i * 0.3));
        break;
      case 'mine':
        this.tone('square', 1320, t, 0.05, 0.1 * v, wet, { filter: 3000 });
        this.tone('square', 1760, t + 0.09, 0.05, 0.1 * v, wet, { filter: 3000 });
        this.thump(t, 200, 80, 0.08, 0.3 * v);
        break;
      case 'drop':
        this.thump(t, 240, 70, 0.18, 0.45 * v);
        this.noiseHit(t, 0.08, 0.25 * v, dry, 'lowpass', 800);
        this.tone('sine', 900, t, 0.06, 0.05 * v, wet, { fm: [3.5, 1] });
        break;
      case 'oil':
        this.noiseHit(t, 0.35, 0.35 * v, wet, 'bandpass', 700, 3, 180);
        for (let i = 0; i < 4; i++) this.tone('sine', r(300, 700), t + r(0.05, 0.3), 0.07, 0.15 * v, wet, { slideTo: r(700, 1200) });
        this.thump(t, 150, 60, 0.15, 0.3 * v);
        break;
      case 'flame':
        this.swell(t, 0.35, 0.35 * v, dirty, 'lowpass', 500, 1400, 0.5);
        this.noiseHit(t, 0.05, 0.2 * v, dry, 'highpass', 3000);
        break;
      case 'zap': {
        for (let i = 0; i < 8; i++) this.noiseHit(t + i * r(0.02, 0.04), 0.035, 0.3 * v, wet, 'bandpass', r(1800, 6000), 5);
        this.tone('sawtooth', 58, t, 0.4, 0.18 * v, dirty, { filter: 2400, fm: [1.02, 4] });
        this.tone('sine', 1200, t, 0.3, 0.08 * v, wet, { slideTo: 300, fm: [0.047, 12] });
        break;
      }
      case 'shield':
        [0, 4, 7, 12].forEach((iv, i) => INST.bell(this, t + i * 0.035, 76 + iv, 0.4, 0.6 * v, wet));
        this.tone('sine', 220, t, 0.8, 0.12 * v, wet, { slideTo: 330, attack: 0.05, fm: [2, 0.5] });
        this.swell(t, 0.5, 0.12 * v, wet, 'highpass', 3000, 9000);
        break;
      case 'shieldHit':
        this.tone('sine', 1500, t, 0.25, 0.2 * v, wet, { slideTo: 800, fm: [1.41, 1] });
        this.noiseHit(t, 0.05, 0.18 * v, dry, 'highpass', 6000);
        break;
      case 'freeze':
        for (let i = 0; i < 10; i++) this.tone('sine', r(2000, 5200), t + i * 0.025, 0.25, 0.05 * v, wet, { fm: [3.1, 0.6] });
        this.swell(t, 0.7, 0.3 * v, wet, 'highpass', 9000, 3000);
        this.noiseHit(t + 0.15, 0.08, 0.35 * v, dry, 'bandpass', 3500, 4);
        this.thump(t, 400, 180, 0.2, 0.2 * v, wet);
        break;
      case 'repair':
        for (let i = 0; i < 5; i++) this.noiseHit(t + i * 0.045, 0.02, 0.2 * v, dry, 'bandpass', 3200, 6);
        this.arp(t + 0.22, [67, 72, 76, 79], 0.06, 0.8 * v, 'pulse', wet, 0.1);
        break;

      // ---------- driving ----------
      case 'boost':
        this.thump(t, 130, 45, 0.18, 0.7 * v);
        this.swell(t, 0.9, 0.5 * v, wet, 'bandpass', 350, 3400, 1.4);
        this.tone('sawtooth', 110, t, 0.8, 0.14 * v, wet, { slideTo: 440, filter: 1200, filterTo: 5000 });
        this.noiseHit(t, 0.05, 0.3 * v, dry, 'highpass', 4000);
        break;
      case 'miniturbo':
      case 'miniturbo1':
      case 'miniturbo2':
      case 'miniturbo3': {
        const lvl = Number(name.slice(-1)) || 1;
        const base = [0, 69, 73, 76][lvl];
        this.noiseHit(t, 0.03, 0.35 * v, dry, 'bandpass', 1600, 2);
        this.thump(t, 150, 55, 0.12, 0.5 * v);
        this.swell(t, 0.3 + lvl * 0.1, 0.4 * v, wet, 'bandpass', 800, 3500 + lvl * 800, 2);
        this.tone('square', mtof(base), t, 0.18, 0.07 * v, wet, { slideTo: mtof(base + 12), filter: 3000 });
        if (lvl === 3) this.arp(t + 0.05, [88, 92, 95], 0.04, 0.5 * v);
        break;
      }
      case 'drift1':
      case 'drift2':
      case 'drift3': {
        const lvl = Number(name.slice(-1));
        const n = [0, [76, 80], [79, 83], [83, 87, 90]][lvl];
        this.arp(t, n, 0.045, 0.45 * v, 'pulse', wet, 0.06);
        this.noiseHit(t, 0.05, 0.1 * v, dry, 'highpass', 7000);
        break;
      }
      case 'backfire':
        this.noiseHit(t, 0.05, 0.5 * v, dirty, 'bandpass', r(300, 600), 1.5);
        this.thump(t, 110, 50, 0.08, 0.45 * v, wet);
        break;
      case 'land':
        this.thump(t, 100, 40, 0.18, 0.55 * v);
        this.noiseHit(t, 0.1, 0.25 * v, dry, 'lowpass', 600);
        this.tone('square', r(260, 340), t + 0.03, 0.08, 0.04 * v, dry, { filter: 700, slideTo: 200 });
        break;
      case 'splash':
        this.noiseHit(t, 0.9, 0.55 * v, wet, 'lowpass', 3500, 0.8, 250);
        for (let i = 0; i < 6; i++) this.tone('sine', r(250, 600), t + r(0.1, 0.6), 0.06, 0.1 * v, wet, { slideTo: r(600, 1100) });
        this.thump(t, 90, 40, 0.3, 0.4 * v);
        break;
      case 'jump':
        // Hydraulic kick: a spring boing over a burst of air.
        this.thump(t, 70, 160, 0.16, 0.5 * v);
        this.tone('square', 180, t, 0.22, 0.07 * v, wet, { filter: 1400, slideTo: 620 });
        this.noiseHit(t, 0.25, 0.3 * v, dry, 'bandpass', 900, 0.8, 2600);
        break;
      case 'quake':
        this.thump(t, 120, 30, 0.5, 0.9 * v);
        this.noiseHit(t, 0.4, 0.45 * v, dirty, 'lowpass', 900, 0.7, 120);
        this.debris(t + 0.05, 5, 0.3, 0.3 * v);
        break;
      case 'crunch':
        // Sheet metal folding under a truck.
        this.thump(t, 140, 40, 0.3, 0.8 * v);
        for (const f of [210, 333, 517, 790]) this.tone('sawtooth', f * r(0.92, 1.08), t, r(0.12, 0.25), 0.05 * v, dirty, { filter: 1800, slideTo: f * 0.6 });
        this.noiseHit(t, 0.18, 0.5 * v, dirty, 'bandpass', 1400, 1.2, 500);
        this.debris(t + 0.08, 4, 0.25, 0.25 * v);
        break;
      // ---------- stage hazards ----------
      case 'bell':
        // Level-crossing bell: a bright struck tone.
        this.tone('sine', 1320, t, 0.35, 0.16 * v, wet, { fm: [2.4, 2.2] });
        this.tone('sine', 660, t, 0.25, 0.08 * v, wet);
        break;
      case 'trainHorn':
        // Three-chime air horn, slightly detuned.
        for (const f of [277, 349, 415]) {
          this.tone('sawtooth', f, t, 1.4, 0.07 * v, wet, { filter: 1600, attack: 0.08 });
          this.tone('sawtooth', f * 1.006, t, 1.4, 0.05 * v, wet, { filter: 1600, attack: 0.08 });
        }
        break;
      case 'rumble':
        this.noiseHit(t, 2.2, 0.35 * v, dry, 'lowpass', 180, 0.7, 90);
        this.thump(t, 55, 40, 1.4, 0.35 * v);
        break;
      case 'crackle':
        for (let i = 0; i < 8; i++) this.noiseHit(t + i * 0.13 + r(0, 0.05), 0.03, 0.18 * v, dry, 'highpass', r(4000, 8000));
        this.swell(t, 1.2, 0.1 * v, wet, 'bandpass', 2000, 6000, 3);
        break;
      case 'thunder':
        this.noiseHit(t, 0.08, 0.7 * v, dry, 'highpass', 3000);
        this.thump(t, 90, 30, 0.6, 0.9 * v);
        this.noiseHit(t + 0.05, 2.4, 0.6 * v, wet, 'lowpass', 900, 0.6, 80);
        break;
      case 'thunderFar':
        this.noiseHit(t + 0.4, 2.8, 0.35 * v, wet, 'lowpass', 300, 0.6, 60);
        break;
      case 'erupt':
        this.thump(t, 80, 30, 0.6, 0.8 * v);
        this.noiseHit(t, 1.4, 0.55 * v, dirty, 'bandpass', 600, 0.6, 200);
        this.noiseHit(t + 0.1, 1.2, 0.25 * v, wet, 'highpass', 3000, 0.8, 1500);
        break;
      case 'hum':
        this.tone('sawtooth', 60, t, 1.6, 0.12 * v, wet, { filter: 500, attack: 0.3 });
        this.tone('square', 120.5, t, 1.6, 0.05 * v, wet, { filter: 900, attack: 0.3 });
        break;
      case 'bolt':
        // Metallic ting.
        this.tone('sine', r(2300, 2500), t, 0.12, 0.12 * v, wet, { fm: [3.5, 1.4] });
        this.tone('triangle', 1250, t, 0.06, 0.08 * v, dry);
        break;
      case 'announce1':
      case 'announce2':
      case 'announce3':
      case 'announce4': {
        // Orchestra-hit stabs, one more (and higher) for each level of the call-out.
        const lvl = +name.slice(8);
        for (let i = 0; i < lvl; i++) {
          const tt = t + i * 0.12;
          const root = 196 * Math.pow(2, (i * 3) / 12);
          for (const m of [1, 1.26, 1.5, 2]) this.tone('sawtooth', root * m, tt, 0.22, 0.06 * v, wet, { filter: 3200, attack: 0.005 });
          this.noiseHit(tt, 0.12, 0.25 * v, wet, 'bandpass', 2400, 0.8);
          this.thump(tt, 120, 50, 0.16, 0.45 * v);
        }
        break;
      }
      case 'honk1':
      case 'honk2':
      case 'honk3':
      case 'honk4':
      case 'honk5':
      case 'honk6': {
        // Six truck horns: two-tone chords at different pitches, one a three-note la cucaracha.
        const k = +name.slice(4);
        const base = [0, 330, 262, 392, 220, 294, 349][k];
        const iv = [0, 1.26, 1.335, 1.19, 1.5, 1.26, 1.122][k];
        if (k === 4) {
          [1, 1, 1.335].forEach((m, i) => this.tone('square', base * m, t + i * 0.11, 0.1, 0.09 * v, wet, { filter: 2200 }));
          break;
        }
        this.tone('sawtooth', base, t, 0.36, 0.13 * v, wet, { filter: 2000, attack: 0.015 });
        this.tone('sawtooth', base * iv, t, 0.36, 0.11 * v, wet, { filter: 2000, attack: 0.015 });
        this.tone('square', base * 0.5, t, 0.36, 0.06 * v, dry, { filter: 900, attack: 0.015 });
        break;
      }
      case 'horn':
        this.tone('sawtooth', 185, t, 0.8, 0.22 * v, wet, { filter: 1500, attack: 0.03 });
        this.tone('sawtooth', 233, t, 0.8, 0.18 * v, wet, { filter: 1500, attack: 0.03 });
        this.tone('sawtooth', 92, t, 0.8, 0.2 * v, wet, { filter: 600, attack: 0.03 });
        break;

      // ---------- specials ----------
      case 'shark':
        // Two-note predator ostinato, then the dive.
        [40, 41, 40, 41, 40, 41].forEach((n, i) => INST.bass(this, t + i * 0.13, n, 0.1, 0.7 * v, wet));
        this.swell(t + 0.2, 0.7, 0.35 * v, wet, 'bandpass', 600, 2400, 2);
        this.noiseHit(t + 0.75, 0.5, 0.35 * v, wet, 'lowpass', 2500, 0.8, 300);
        break;
      case 'chomp':
        for (const dt of [0, 0.12]) {
          this.noiseHit(t + dt, 0.05, 0.5 * v, dirty, 'bandpass', 1500, 3);
          this.tone('square', 150, t + dt, 0.1, 0.25 * v, dirty, { slideTo: 60, filter: 900 });
          this.tone('sine', 2600, t + dt + 0.04, 0.03, 0.12 * v, dry, { fm: [2.76, 1] });
        }
        this.thump(t, 120, 50, 0.2, 0.6 * v);
        break;
      case 'box':
        this.thump(t, 170, 70, 0.2, 0.55 * v);
        this.noiseHit(t, 0.1, 0.3 * v, dry, 'lowpass', 900);
        this.swell(t + 0.05, 0.25, 0.25 * v, dry, 'bandpass', 2000, 6000, 3);
        break;
      case 'squish':
        this.tone('sine', 480, t, 0.3, 0.3 * v, wet, { slideTo: 110 });
        this.noiseHit(t, 0.25, 0.2 * v, wet, 'lowpass', 800, 4, 200);
        for (let i = 0; i < 3; i++) this.tone('sine', r(300, 500), t + 0.1 + i * 0.07, 0.05, 0.12 * v, wet, { slideTo: r(700, 1000) });
        break;
      case 'bass': {
        // DJ Voltage drops the bass: sub drop plus a wobble.
        this.thump(t, 160, 30, 1.2, 1.1 * v);
        this.noiseHit(t, 0.1, 0.8 * v, dirty, 'lowpass', 1500);
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 55;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 8;
        lp.frequency.value = 300;
        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(6, t);
        lfo.frequency.linearRampToValueAtTime(2, t + 0.9);
        const lg = ctx.createGain();
        lg.gain.value = 700;
        lfo.connect(lg).connect(lp.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.3 * v, t + 0.02);
        g.gain.setTargetAtTime(0, t + 0.7, 0.1);
        o.connect(lp).connect(g).connect(dirty);
        for (const n of [o, lfo]) {
          n.start(t);
          n.stop(t + 1.3);
        }
        break;
      }
      case 'charge': {
        // Cavalry bugle call (G C E G, E G), a whinny and a stampede of hooves.
        [67, 72, 76, 79, 76, 79].forEach((n, i) => INST.brass(this, t + [0, 0.1, 0.2, 0.3, 0.48, 0.58][i], n, i === 5 ? 0.5 : 0.12, 0.9 * v, wet));
        for (let i = 0; i < 7; i++) {
          const f = 900 - i * 70 + (i % 2 ? 120 : 0);
          this.tone('sawtooth', f, t + 0.1 + i * 0.07, 0.07, 0.08 * v, wet, { slideTo: f * 0.8, filter: 2600, q: 4 });
        }
        for (let i = 0; i < 10; i++) this.thump(t + 0.05 + i * 0.11 + (i % 2) * 0.03, 110, 45, 0.08, 0.35 * v);
        this.noiseHit(t, 1.1, 0.18 * v, dirty, 'lowpass', 700, 0.8, 200);
        break;
      }
      case 'mosh': {
        // MOSH PIT: a distorted power-chord riff from the roof speakers and side-pipe backfires.
        [0, 0.16, 0.24, 0.48].forEach((dt, i) => {
          const root = i === 3 ? 98 : 82.4;
          for (const k of [1, 1.5, 2]) this.tone('sawtooth', root * k, t + dt, i === 3 ? 0.5 : 0.12, 0.09 * v, dirty, { filter: 1800, q: 2 });
          this.thump(t + dt, 130, 45, 0.12, 0.5 * v);
        });
        for (let i = 0; i < 5; i++) this.noiseHit(t + 0.05 + i * 0.13 + r(0, 0.04), 0.06, 0.4 * v, dirty, 'lowpass', 1200, 1, 300);
        DRUMS.crash(this, t + 0.48, 0.6 * v, wet);
        break;
      }
      case 'unlock':
        // Secret unlocked: rising brass fanfare with a cymbal swell.
        [60, 64, 67, 72].forEach((n, i) => INST.brass(this, t + i * 0.12, n, 0.14, 1.0 * v, wet));
        [72, 76, 79, 84].forEach((n) => INST.brass(this, t + 0.55, n, 1.1, 0.9 * v, wet));
        this.arp(t + 0.55, [84, 88, 91, 96, 100, 103, 108], 0.05, 0.6 * v, 'bell', wet);
        this.swell(t, 0.6, 0.12 * v, wet, 'highpass', 3000, 9000);
        DRUMS.crash(this, t + 0.55, 0.8 * v, wet);
        this.thump(t + 0.55, 150, 40, 0.4, 1.0 * v);
        break;
      case 'spectrum':
      case 'refract':
      case 'prism':
        for (let i = 0; i < 7; i++) INST.bell(this, t + i * 0.03, 84 + [0, 4, 7, 11, 14, 16, 19][i], 0.3, 0.45 * v, wet);
        this.swell(t, 0.6, 0.25 * v, wet, 'bandpass', 1500, 9000, 3);
        break;

      // ---------- pickups and progress ----------
      case 'pickup':
        this.tone('sine', 520, t, 0.1, 0.25 * v, wet, { slideTo: 1040 });
        this.arp(t + 0.06, [88, 95], 0.05, 0.7 * v);
        break;
      case 'levelup':
        this.arp(t, [72, 76, 79, 84], 0.045, 0.7 * v, 'pulse', wet, 0.07);
        this.arp(t + 0.18, [91, 96], 0.05, 0.6 * v);
        break;
      case 'coin':
        INST.pulse(this, t, 83, 0.06, 0.8 * v, wet);
        INST.pulse(this, t + 0.07, 88, 0.25, 0.8 * v, wet);
        INST.bell(this, t + 0.07, 100, 0.2, 0.35 * v, wet);
        break;
      case 'core':
        this.arp(t, [72, 76, 79, 84, 88, 91, 96], 0.06, 0.8 * v, 'bell', wet);
        [60, 64, 67, 72].forEach((n) => INST.pad(this, t, n, 1.1, 1.6 * v, wet, { attack: 0.1, cut: 2400 }));
        this.swell(t, 1.2, 0.1 * v, wet, 'highpass', 5000, 10000);
        break;
      case 'beep':
        INST.pulse(this, t, 69, 0.16, 1.1 * v, wet);
        INST.bell(this, t, 81, 0.2, 0.4 * v, wet);
        break;
      case 'go':
        [69, 76, 81].forEach((n) => INST.brass(this, t, n, 0.5, 1.2 * v, wet));
        INST.bell(this, t, 93, 0.3, 0.5 * v, wet);
        this.thump(t, 140, 45, 0.25, 0.8 * v);
        DRUMS.crash(this, t, 0.6 * v, wet);
        break;
      case 'lap':
        this.arp(t, [79, 83, 86], 0.07, 0.7 * v, 'pulse', wet, 0.1);
        INST.bell(this, t + 0.21, 91, 0.3, 0.5 * v, wet);
        break;
      case 'finish':
        this.arp(t, [72, 76, 79, 84], 0.09, 0.8 * v, 'pulse', wet, 0.12);
        [72, 76, 79, 84].forEach((n) => INST.brass(this, t + 0.36, n, 0.7, 1.0 * v, wet));
        this.arp(t + 0.36, [96, 100, 103, 108], 0.04, 0.4 * v);
        DRUMS.crash(this, t + 0.36, 0.6 * v, wet);
        this.thump(t + 0.36, 140, 45, 0.25, 0.8 * v);
        break;
      case 'lose':
        [67, 66, 65, 60].forEach((n, i) => INST.brass(this, t + i * 0.2, n, 0.22, 0.9 * v, wet));
        break;

      // ---------- menus ----------
      case 'ui':
        this.tone('square', 1760, t, 0.018, 0.09 * v, dry, { filter: 5000 });
        this.tone('sine', 880, t, 0.05, 0.24 * v, wet);
        break;
      case 'uiConfirm':
        INST.pulse(this, t, 76, 0.05, 0.6 * v, wet);
        INST.pulse(this, t + 0.055, 83, 0.1, 0.6 * v, wet);
        INST.bell(this, t + 0.055, 95, 0.2, 0.25 * v, wet);
        break;
      case 'uiBack':
        this.tone('square', 440, t, 0.09, 0.07 * v, wet, { slideTo: 200, filter: 2000 });
        this.thump(t, 160, 80, 0.06, 0.2 * v);
        break;
    }
  }

  // ------------------------------------------------------------ driver barks
  // type: taunt | hurt | win | lose | special. Rate-limited so barks never pile up.
  bark(voiceId, type, vol = 1) {
    if (!this.ctx || (!this.offline && this.ctx.state !== 'running') || vol < 0.05) return;
    const t = this.now();
    const lastAny = this.throttle.get('bark') ?? -9;
    const lastMe = this.throttle.get(`bark-${voiceId}`) ?? -9;
    if (t - lastAny < 0.9 || t - lastMe < 2.2) return;
    this.throttle.set('bark', t);
    this.throttle.set(`bark-${voiceId}`, t);
    const files = this.manifest?.voices?.[voiceId]?.[type];
    if (files && [].concat(files).length) {
      const list = [].concat(files);
      const b = this.fileBuffer(list[Math.floor(Math.random() * list.length)]);
      if (b) return void this.playBuffer(b, t, vol, this.voiceBus);
    }
    this.barkSynth(VOICES[voiceId] || VOICES.disco, type, t, vol);
  }
  barkSynth(voice, type, t, vol) {
    const r = (a, b) => a + Math.random() * (b - a);
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const gib = (n, pitch) =>
      Array.from({ length: n }, () => ({ c: pick(['b', 'g', 'w', 'y', '', 'h']), v: pick(['a', 'e', 'i', 'o', 'u', 'ae']), f0: pitch * r(0.9, 1.15), dur: r(0.06, 0.09), vol: 0.8 }));
    const P = 170;
    let seq;
    switch (type) {
      case 'taunt':
        seq = [...gib(2, P * 1.05), { c: 'h', v: 'a', f0: P * 1.2, dur: 0.09 }, { c: 'h', v: 'a', f0: P * 1.3, dur: 0.09 }, { c: 'h', v: 'a', v2: 'o', f0: P * 1.45, f1: P * 1.0, dur: 0.2 }];
        break;
      case 'hurt':
        seq = [{ c: '', v: 'a', v2: 'u', f0: P * 1.6, f1: P * 0.9, dur: 0.22, vol: 1 }];
        break;
      case 'win':
        seq = [{ c: 'w', v: 'a', f0: P * 1.1, f1: P * 1.25, dur: 0.14 }, { c: 'h', v: 'u', f0: P * 1.4, f1: P * 1.95, dur: 0.32, vol: 1 }];
        break;
      case 'lose':
        seq = [{ c: '', v: 'a', v2: 'o', f0: P * 1.2, f1: P * 0.7, dur: 0.5 }];
        break;
      case 'special':
        seq = [...gib(2, P * 1.1), { c: 'y', v: 'a', f0: P * 1.3, f1: P * 1.55, dur: 0.22, vol: 1 }];
        break;
      default:
        seq = gib(4, P);
    }
    let at = t;
    for (const s of seq) {
      syllable(this, at, { ...s, vol: (s.vol ?? 0.85) * vol }, voice, this.voiceBus);
      at += s.dur * voice.rate + 0.025;
    }
  }

  // ------------------------------------------------------------ engine
  // An electric cyber-truck: growling motor with a throb, inverter whine, wind and tyre squeal.
  createEngine(pitch = 1) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const t = this.now();
    const g = (v) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    const out = g(0);
    const am = g(0.75);
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.curves.drive;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    lp.Q.value = 2.5;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    const o3 = ctx.createOscillator();
    o3.type = 'sine';
    const g1 = g(0.25);
    const g2 = g(0.16);
    const g3 = g(0.55);
    o1.connect(g1).connect(shaper);
    o2.connect(g2).connect(shaper);
    shaper.connect(lp);
    o3.connect(g3).connect(lp);
    // Firing-order throb.
    const throb = ctx.createOscillator();
    throb.type = 'triangle';
    const tg = g(0.25);
    throb.connect(tg).connect(am.gain);
    lp.connect(am).connect(out).connect(this.sfx);
    // Inverter whine.
    const whine = ctx.createOscillator();
    whine.type = 'sine';
    const wg = g(0);
    whine.connect(wg).connect(this.sfx);
    // Wind.
    const wind = ctx.createBufferSource();
    wind.buffer = this.buffers.noise;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 700;
    const windG = g(0);
    wind.connect(wf).connect(windG).connect(this.sfx);
    // Tyre screech.
    const sq = ctx.createBufferSource();
    sq.buffer = this.buffers.noise;
    sq.loop = true;
    const sqf = ctx.createBiquadFilter();
    sqf.type = 'bandpass';
    sqf.frequency.value = 1800;
    sqf.Q.value = 7;
    const sqg = g(0);
    sq.connect(sqf).connect(sqg).connect(this.sfx);
    for (const o of [o1, o2, o3, throb, whine, wind, sq]) o.start(t);
    const eng = { o1, o2, o3, throb, whine, wind, sq, lp, out, wg, windG, sqg, sqf, pitch, stopped: false, lastThrottle: 0, popT: 0 };
    this.engines.push(eng);
    return eng;
  }
  updateEngine(eng, speed01, throttle, boost, slip, volume = 1) {
    if (!eng || !this.ctx || eng.stopped) return;
    const t = this.now();
    const rpm = 0.25 + speed01 * 0.75 + throttle * 0.08;
    // Fake gear shifts give the pitch a saw-tooth ramp as speed rises.
    const gear = Math.min(3, Math.floor(speed01 * 4));
    const within = speed01 * 4 - gear;
    const base = (38 + gear * 7 + within * 34 + boost * 22) * eng.pitch * (0.9 + rpm * 0.2);
    eng.o1.frequency.setTargetAtTime(base, t, 0.05);
    eng.o2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
    eng.o3.frequency.setTargetAtTime(base * 0.25, t, 0.05);
    eng.throb.frequency.setTargetAtTime(base * 0.25, t, 0.05);
    eng.whine.frequency.setTargetAtTime(300 + speed01 * 2400 * eng.pitch + boost * 900, t, 0.08);
    eng.wg.gain.setTargetAtTime((0.008 + speed01 * 0.02 + boost * 0.035) * volume, t, 0.1);
    eng.lp.frequency.setTargetAtTime(420 + throttle * 1000 + speed01 * 1400 + boost * 1800, t, 0.08);
    eng.out.gain.setTargetAtTime((0.1 + throttle * 0.08 + boost * 0.06) * volume, t, 0.08);
    eng.windG.gain.setTargetAtTime(speed01 * speed01 * 0.07 * volume, t, 0.2);
    eng.sqg.gain.setTargetAtTime(clamp(slip, 0, 1) * 0.12 * volume, t, 0.05);
    eng.sqf.frequency.setTargetAtTime(1400 + speed01 * 900, t, 0.1);
    // Lifting off at speed pops the exhaust.
    if (eng.lastThrottle > 0.7 && throttle < 0.2 && speed01 > 0.45 && t - eng.popT > 0.8) {
      eng.popT = t;
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const at = t + 0.05 + i * (0.07 + Math.random() * 0.06);
        this.sound('backfire', at, 0.5 * volume);
      }
    }
    eng.lastThrottle = throttle;
  }
  stopEngine(eng) {
    if (!eng || eng.stopped || !this.ctx) return;
    eng.stopped = true;
    const t = this.now();
    for (const gg of [eng.out, eng.sqg, eng.wg, eng.windG]) gg.gain.setTargetAtTime(0, t, 0.05);
    for (const o of [eng.o1, eng.o2, eng.o3, eng.throb, eng.whine, eng.wind, eng.sq]) o.stop(t + 0.3);
    this.engines = this.engines.filter((e) => e !== eng);
  }
  stopAllEngines() {
    for (const e of [...this.engines]) this.stopEngine(e);
  }
}
