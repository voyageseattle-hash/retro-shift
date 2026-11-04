// Synth voices for the soundtrack and effects: drums, basses, leads, pads and a formant voice.
// Every voice takes the Audio instance (for its context and shared buffers), a start time and a
// destination node, so the same code runs live and in an OfflineAudioContext for previews.

export const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ------------------------------------------------------------ node helpers
function osc(A, type, f, t, stop) {
  const o = A.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.start(t);
  o.stop(stop);
  return o;
}
function amp(A, v = 0) {
  const g = A.ctx.createGain();
  g.gain.value = v;
  return g;
}
function filt(A, type, f, q = 0.7) {
  const b = A.ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}
function shaper(A, curve) {
  const s = A.ctx.createWaveShaper();
  s.curve = A.curves[curve];
  s.oversample = curve === 'fuzz' ? '2x' : 'none';
  return s;
}
function buf(A, name, t, dest, vol, rate = 1, stop, offset = 0) {
  const s = A.ctx.createBufferSource();
  s.buffer = A.buffers[name];
  s.playbackRate.value = rate;
  const g = amp(A, vol);
  s.connect(g).connect(dest);
  s.start(t, offset);
  if (stop) s.stop(stop);
  return { s, g };
}
function noise(A, t, stop, rate = 1) {
  const s = A.ctx.createBufferSource();
  s.buffer = A.buffers.noise;
  s.loop = true;
  s.playbackRate.value = rate;
  s.start(t, Math.random() * 1.5);
  s.stop(stop);
  return s;
}
// Attack / decay-to-sustain / release envelope. Returns the time the voice is silent.
function adsr(p, t, a, peak, d, sus, dur, r) {
  p.cancelScheduledValues(t);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(peak * sus, t + a, Math.max(0.001, d / 3));
  const off = Math.max(t + a, t + dur);
  p.setTargetAtTime(0, off, Math.max(0.002, r / 4));
  return off + r * 1.4 + 0.02;
}
// Short percussive envelope.
function perc(p, t, peak, decay, attack = 0.001) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setTargetAtTime(0, t + attack, decay / 4);
  return t + attack + decay * 1.3 + 0.02;
}
function vibrato(A, o, f, t, stop, depth = 0.012, rate = 5.6, delay = 0.16) {
  const l = osc(A, 'sine', rate, t, stop);
  const g = amp(A, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0, t + delay);
  g.gain.linearRampToValueAtTime(f * depth, t + delay + 0.25);
  l.connect(g);
  for (const x of [].concat(o)) g.connect(x.frequency);
}
// Pitch from the previous note (portamento) or straight to the note.
function pitch(o, f, t, from, glide = 0.06) {
  if (from) {
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(f, t + glide);
  } else o.frequency.setValueAtTime(f, t);
}

// ------------------------------------------------------------ JS-rendered sample buffers
// Cymbals, claps and the reverb impulse are cheaper as buffers than as oscillator banks.
function onePoleHP(d, sr, fc) {
  const rc = 1 / (2 * Math.PI * fc);
  const a = rc / (rc + 1 / sr);
  let px = 0;
  let py = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    py = a * (py + x - px);
    px = x;
    d[i] = py;
  }
}
function onePoleLP(d, sr, fc) {
  const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) d[i] = y += a * (d[i] - y);
}
function bandpass(d, sr, f, q) {
  const w = (2 * Math.PI * f) / sr;
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  const b0 = al / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - al) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    d[i] = y;
  }
}
function normalize(d, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
}
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
function metallic(d, sr, mul, noiseMix) {
  const ph = METAL.map(() => Math.random());
  const inc = METAL.map((f) => (f * mul) / sr);
  for (let i = 0; i < d.length; i++) {
    let s = 0;
    for (let k = 0; k < 6; k++) {
      ph[k] = (ph[k] + inc[k]) % 1;
      s += ph[k] < 0.5 ? 1 : -1;
    }
    d[i] = s / 6 + (Math.random() * 2 - 1) * noiseMix;
  }
}

export function buildBuffers(ctx) {
  const sr = ctx.sampleRate;
  const make = (dur, fn, ch = 1) => {
    const b = ctx.createBuffer(ch, Math.ceil(dur * sr), sr);
    for (let c = 0; c < ch; c++) fn(b.getChannelData(c), c);
    return b;
  };
  const B = {};
  B.noise = make(2, (d) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  });
  const cymbal = (dur, mul, noiseMix, hp, tau, lp) =>
    make(dur, (d) => {
      metallic(d, sr, mul, noiseMix);
      onePoleHP(d, sr, hp);
      onePoleHP(d, sr, hp);
      if (lp) onePoleLP(d, sr, lp);
      for (let i = 0; i < d.length; i++) d[i] *= Math.exp(-i / sr / tau) * Math.min(1, i / (sr * 0.0006));
      normalize(d, 0.8);
    });
  B.hat = cymbal(0.12, 1.6, 0.35, 7000, 0.022);
  B.ohat = cymbal(0.5, 1.6, 0.4, 6500, 0.14);
  B.crash = cymbal(2.6, 1.25, 0.8, 3500, 0.7, 12000);
  B.ride = cymbal(1.4, 2.1, 0.25, 4500, 0.35, 11000);
  B.rcrash = make(1.6, (d) => {
    const src = B.crash.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = src[d.length - 1 - i] * Math.pow(i / d.length, 1.5);
  });
  B.shaker = make(0.14, (d) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    onePoleHP(d, sr, 5500);
    for (let i = 0; i < d.length; i++) {
      const tt = i / sr;
      d[i] *= Math.min(1, tt / 0.012) * Math.exp(-Math.max(0, tt - 0.012) / 0.035);
    }
    normalize(d, 0.7);
  });
  B.clap = make(0.45, (d) => {
    for (let i = 0; i < d.length; i++) {
      const tt = i / sr;
      let e = 0;
      for (const o of [0, 0.011, 0.022, 0.031]) if (tt >= o) e = Math.max(e, Math.exp(-(tt - o) / 0.006));
      if (tt >= 0.031) e = Math.max(e, 0.55 * Math.exp(-(tt - 0.031) / 0.09));
      d[i] = (Math.random() * 2 - 1) * e;
    }
    bandpass(d, sr, 1150, 1.1);
    normalize(d, 0.9);
  });
  // Stereo plate-ish impulse: decorrelated noise with damping that darkens as it decays.
  const impulse = (dur, tau, pre) =>
    make(
      dur,
      (d) => {
        const p0 = Math.floor(pre * sr);
        for (let i = p0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-(i - p0) / sr / tau);
        onePoleLP(d, sr, 7000);
        let y = 0;
        for (let i = 0; i < d.length; i++) {
          const a = 0.9 - 0.75 * (i / d.length);
          y += a * (d[i] - y);
          d[i] = y;
        }
        normalize(d, 0.5);
      },
      2,
    );
  B.verbLong = impulse(2.1, 0.5, 0.018);
  B.verbShort = impulse(1.1, 0.2, 0.006);
  return B;
}

export function buildCurves() {
  const mk = (k, asym = 0) => {
    const c = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      const x = (i / 2047) * 2 - 1;
      c[i] = Math.tanh(x * k + asym) - Math.tanh(asym);
    }
    return c;
  };
  return { soft: mk(1.6), warm: mk(2.6, 0.1), drive: mk(5), fuzz: mk(12, 0.2), crush: mk(24) };
}

// ------------------------------------------------------------ drums
// Each drum: (A, t, vel, dest, opts) -> sound. opts.style picks a variant from the song kit.
export const DRUMS = {
  kick(A, t, v, out, o = {}) {
    const style = o.style || 'punch';
    const P = {
      punch: { f0: 170, f1: 48, bend: 0.055, decay: 0.34, click: 0.5, curve: 'warm' },
      hard: { f0: 230, f1: 50, bend: 0.045, decay: 0.3, click: 0.7, curve: 'drive' },
      boom: { f0: 130, f1: 38, bend: 0.1, decay: 0.8, click: 0.3, curve: 'soft' },
      soft: { f0: 120, f1: 50, bend: 0.06, decay: 0.24, click: 0.15, curve: 'soft' },
      gabber: { f0: 260, f1: 55, bend: 0.04, decay: 0.26, click: 0.9, curve: 'fuzz' },
    }[style];
    const end = t + P.decay * 1.6 + 0.05;
    const s = osc(A, 'sine', P.f0, t, end);
    s.frequency.exponentialRampToValueAtTime(P.f1 * 1.3, t + P.bend);
    s.frequency.exponentialRampToValueAtTime(P.f1, t + P.bend + 0.12);
    const g = amp(A);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.002);
    g.gain.setValueAtTime(v, t + 0.03);
    g.gain.setTargetAtTime(0, t + 0.03, P.decay / 3.5);
    const sh = shaper(A, P.curve);
    s.connect(g).connect(sh).connect(out);
    const n = noise(A, t, t + 0.03, 1.5);
    const nf = filt(A, 'highpass', 2200);
    const ng = amp(A);
    perc(ng.gain, t, v * P.click * 0.5, 0.012);
    n.connect(nf).connect(ng).connect(out);
  },
  snare(A, t, v, out, o = {}) {
    const style = o.style || 'tight';
    const P = {
      tight: { body: 190, decay: 0.17, tone: 0.5, hp: 1500, lp: 9000 },
      fat: { body: 170, decay: 0.28, tone: 0.65, hp: 900, lp: 7000 },
      crack: { body: 240, decay: 0.14, tone: 0.35, hp: 2400, lp: 12000 },
    }[style];
    const end = t + P.decay * 1.5 + 0.05;
    for (const [f, k] of [
      [P.body, 1],
      [P.body * 1.72, 0.45],
    ]) {
      const s = osc(A, 'triangle', f * 1.25, t, end);
      s.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      const g = amp(A);
      perc(g.gain, t, v * P.tone * k, 0.09);
      s.connect(g).connect(out);
    }
    const n = noise(A, t, end);
    const hp = filt(A, 'highpass', P.hp);
    const lp = filt(A, 'lowpass', P.lp);
    const g = amp(A);
    perc(g.gain, t, v * 0.75, P.decay);
    n.connect(hp).connect(lp).connect(g).connect(out);
  },
  rim(A, t, v, out) {
    const s = osc(A, 'triangle', 1700, t, t + 0.06);
    const g = amp(A);
    perc(g.gain, t, v * 0.5, 0.025);
    s.connect(g).connect(out);
    const n = noise(A, t, t + 0.04);
    const f = filt(A, 'bandpass', 2600, 4);
    const ng = amp(A);
    perc(ng.gain, t, v * 0.6, 0.02);
    n.connect(f).connect(ng).connect(out);
  },
  clap(A, t, v, out) {
    buf(A, 'clap', t, out, v * 0.9, 0.96 + Math.random() * 0.08);
  },
  hat(A, t, v, out) {
    buf(A, 'hat', t, out, v * 0.42, 0.95 + Math.random() * 0.1);
  },
  ohat(A, t, v, out, o = {}) {
    const { g, s } = buf(A, 'ohat', t, out, v * 0.36, 1);
    if (o.len) {
      g.gain.setValueAtTime(v * 0.36, t + o.len);
      g.gain.setTargetAtTime(0, t + o.len, 0.02);
      s.stop(t + o.len + 0.2);
    }
  },
  ride(A, t, v, out) {
    buf(A, 'ride', t, out, v * 0.3, 1);
  },
  crash(A, t, v, out) {
    buf(A, 'crash', t, out, v * 0.5, 0.97 + Math.random() * 0.06);
  },
  rcrash(A, t, v, out) {
    // Reverse cymbal that swells into t.
    const d = A.buffers.rcrash.duration;
    const now = A.now();
    buf(A, 'rcrash', Math.max(now, t - d), out, v * 0.55, 1, undefined, Math.max(0, now - (t - d)));
  },
  shaker(A, t, v, out) {
    buf(A, 'shaker', t, out, v * 0.35, 0.9 + Math.random() * 0.2);
  },
  tom(A, t, v, out, o = {}) {
    const f = mtof(o.note || 45);
    const s = osc(A, 'sine', f * 1.7, t, t + 0.5);
    s.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const g = amp(A);
    perc(g.gain, t, v * 0.9, 0.32);
    s.connect(g).connect(shaper(A, 'soft')).connect(out);
    const n = noise(A, t, t + 0.05);
    const nf = filt(A, 'lowpass', 1800);
    const ng = amp(A);
    perc(ng.gain, t, v * 0.2, 0.03);
    n.connect(nf).connect(ng).connect(out);
  },
  conga(A, t, v, out, o = {}) {
    const f = mtof(o.note || 62);
    const s = osc(A, 'sine', f * 1.35, t, t + 0.3);
    s.frequency.exponentialRampToValueAtTime(f, t + 0.025);
    const g = amp(A);
    perc(g.gain, t, v * 0.55, o.slap ? 0.07 : 0.18);
    s.connect(g).connect(out);
    const n = noise(A, t, t + 0.03);
    const nf = filt(A, 'bandpass', o.slap ? 3000 : 1500, 1.4);
    const ng = amp(A);
    perc(ng.gain, t, v * (o.slap ? 0.5 : 0.15), 0.02);
    n.connect(nf).connect(ng).connect(out);
  },
  cowbell(A, t, v, out) {
    const bp = filt(A, 'bandpass', 2640, 1.2);
    const g = amp(A);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * 0.3, t + 0.001);
    g.gain.setTargetAtTime(v * 0.08, t + 0.001, 0.012);
    g.gain.setTargetAtTime(0, t + 0.04, 0.06);
    for (const f of [587, 845]) osc(A, 'square', f, t, t + 0.4).connect(bp);
    bp.connect(g).connect(out);
  },
  // Industrial metal strike: inharmonic FM partials.
  anvil(A, t, v, out, o = {}) {
    const f = mtof(o.note || 69);
    for (const [r, k, d] of [
      [1, 1, 0.5],
      [2.76, 0.6, 0.3],
      [5.4, 0.4, 0.18],
      [8.93, 0.25, 0.1],
    ]) {
      const s = osc(A, 'sine', f * r, t, t + d * 1.6);
      const g = amp(A);
      perc(g.gain, t, v * 0.22 * k, d);
      s.connect(g).connect(out);
    }
    const n = noise(A, t, t + 0.05);
    const nf = filt(A, 'highpass', 3000);
    const ng = amp(A);
    perc(ng.gain, t, v * 0.4, 0.02);
    n.connect(nf).connect(ng).connect(out);
  },
  // Cinematic sub hit.
  boom(A, t, v, out) {
    const s = osc(A, 'sine', 90, t, t + 2);
    s.frequency.exponentialRampToValueAtTime(30, t + 1.2);
    const g = amp(A);
    perc(g.gain, t, v * 1.1, 1.3, 0.004);
    s.connect(g).connect(shaper(A, 'warm')).connect(out);
    const n = noise(A, t, t + 1.2);
    const nf = filt(A, 'lowpass', 400);
    nf.frequency.setTargetAtTime(80, t, 0.3);
    const ng = amp(A);
    perc(ng.gain, t, v * 0.8, 0.9);
    n.connect(nf).connect(ng).connect(out);
    DRUMS.crash(A, t, v * 0.6, out);
  },
  // Heartbeat thump for the low-health layer.
  heart(A, t, v, out) {
    for (const [dt, k] of [
      [0, 1],
      [0.16, 0.7],
    ]) {
      const s = osc(A, 'sine', 70, t + dt, t + dt + 0.4);
      s.frequency.exponentialRampToValueAtTime(38, t + dt + 0.12);
      const g = amp(A);
      perc(g.gain, t + dt, v * k, 0.22, 0.006);
      s.connect(g).connect(out);
    }
  },
};

// ------------------------------------------------------------ pitched instruments
// (A, t, midi, dur, vel, dest, o) where o.from is the previous pitch for slides.
export const INST = {
  // Diddy-Kong-style bright pulse lead with delayed vibrato.
  pulse(A, t, n, dur, v, out, o = {}) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.006, v * 0.2, 0.25, 0.75, dur, 0.09);
    const a = osc(A, 'square', f, t, end);
    const b = osc(A, 'sawtooth', f, t, end);
    b.detune.value = 8;
    pitch(a, f, t, o.from && mtof(o.from));
    pitch(b, f, t, o.from && mtof(o.from));
    vibrato(A, [a, b], f, t, end);
    const lp = filt(A, 'lowpass', 3600, 0.8);
    const bg = amp(A, 0.5);
    a.connect(lp);
    b.connect(bg).connect(lp);
    lp.connect(g).connect(out);
  },
  // Stacked detuned saws, split across the stereo field.
  supersaw(A, t, n, dur, v, out, o = {}) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.01, v * 0.16, 0.3, 0.8, dur, 0.18);
    const lp = filt(A, 'lowpass', 1200, 0.9);
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.linearRampToValueAtTime(o.bright || 5200, t + 0.03);
    lp.frequency.setTargetAtTime(o.bright ? o.bright * 0.7 : 3400, t + 0.03, 0.2);
    const oscs = [];
    for (const [pan, dets] of [
      [-0.7, [-17, 7]],
      [0.7, [-6, 18]],
    ]) {
      const p = A.ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(lp);
      for (const det of dets) {
        const s = osc(A, 'sawtooth', f, t, end);
        s.detune.value = det;
        pitch(s, f, t, o.from && mtof(o.from));
        s.connect(p);
        oscs.push(s);
      }
    }
    const c = osc(A, 'sawtooth', f, t, end);
    pitch(c, f, t, o.from && mtof(o.from));
    c.connect(lp);
    oscs.push(c);
    vibrato(A, oscs, f, t, end, 0.006, 5, 0.3);
    lp.connect(g).connect(out);
  },
  // Surf-guitar pluck: bright saw snapped shut by a resonant filter.
  twang(A, t, n, dur, v, out, o = {}) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.003, v * 0.28, 0.5, 0.45, dur, 0.12);
    const s = osc(A, 'sawtooth', f, t, end);
    const s2 = osc(A, 'square', f * 2, t, end);
    pitch(s, f, t, o.from && mtof(o.from), 0.05);
    pitch(s2, f * 2, t, o.from && mtof(o.from) * 2, 0.05);
    vibrato(A, [s, s2], f, t, end, 0.014, 6.2, 0.2);
    const lp = filt(A, 'lowpass', 5200, 5);
    lp.frequency.setValueAtTime(5200, t);
    lp.frequency.setTargetAtTime(1300, t, 0.09);
    const g2 = amp(A, 0.25);
    s.connect(lp);
    s2.connect(g2).connect(lp);
    lp.connect(shaper(A, 'soft')).connect(g).connect(out);
  },
  // Synth brass with a filter swell.
  brass(A, t, n, dur, v, out, o = {}) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.025, v * 0.2, 0.2, 0.8, dur, 0.12);
    const lp = filt(A, 'lowpass', 400, 1.5);
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(3000, t + 0.05);
    lp.frequency.setTargetAtTime(1700, t + 0.05, 0.15);
    const oscs = [-7, 7].map((d) => {
      const s = osc(A, 'sawtooth', f, t, end);
      s.detune.value = d;
      pitch(s, f, t, o.from && mtof(o.from));
      s.connect(lp);
      return s;
    });
    vibrato(A, oscs, f, t, end, 0.008, 5.2, 0.25);
    lp.connect(g).connect(out);
  },
  // FM bell / glockenspiel.
  bell(A, t, n, dur, v, out) {
    const f = mtof(n);
    const end = t + 1.8;
    const c = osc(A, 'sine', f, t, end);
    const m = osc(A, 'sine', f * 3.5, t, end);
    const mi = amp(A);
    mi.gain.setValueAtTime(f * 3, t);
    mi.gain.setTargetAtTime(f * 0.2, t, 0.15);
    m.connect(mi).connect(c.frequency);
    const g = amp(A);
    perc(g.gain, t, v * 0.22, 1.3, 0.002);
    c.connect(g).connect(out);
  },
  // Steel pan: FM with a strong octave partial, quick bloom.
  steel(A, t, n, dur, v, out) {
    const f = mtof(n);
    const end = t + Math.max(0.9, dur + 0.4);
    const c = osc(A, 'sine', f, t, end);
    const m = osc(A, 'sine', f, t, end);
    const mi = amp(A);
    mi.gain.setValueAtTime(f * 1.8, t);
    mi.gain.setTargetAtTime(f * 0.35, t, 0.05);
    m.connect(mi).connect(c.frequency);
    const h = osc(A, 'sine', f * 2.01, t, end);
    const hg = amp(A);
    perc(hg.gain, t, v * 0.07, 0.35, 0.004);
    h.connect(hg).connect(out);
    const g = amp(A);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * 0.24, t + 0.004);
    g.gain.setTargetAtTime(v * 0.1, t + 0.004, 0.08);
    g.gain.setTargetAtTime(0, t + Math.max(0.1, dur), 0.12);
    c.connect(g).connect(out);
  },
  marimba(A, t, n, dur, v, out) {
    const f = mtof(n);
    const end = t + 0.7;
    const a = osc(A, 'sine', f, t, end);
    const b = osc(A, 'sine', f * 3.98, t, end);
    const ga = amp(A);
    perc(ga.gain, t, v * 0.3, 0.42, 0.002);
    const gb = amp(A);
    perc(gb.gain, t, v * 0.08, 0.07, 0.001);
    a.connect(ga).connect(out);
    b.connect(gb).connect(out);
  },
  // Drawbar organ with a rotary-speaker wobble.
  organ(A, t, n, dur, v, out) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.006, v * 0.09, 0.05, 1, dur, 0.06);
    const trem = osc(A, 'sine', 6.4, t, end);
    const tg = amp(A, v * 0.02);
    trem.connect(tg).connect(g.gain);
    for (const [r, k] of [
      [0.5, 0.6],
      [1, 1],
      [2, 0.7],
      [3, 0.5],
    ]) {
      const s = osc(A, 'sine', f * r, t, end);
      const sg = amp(A, k);
      s.connect(sg).connect(g);
    }
    const ck = noise(A, t, t + 0.02, 2);
    const cg = amp(A);
    perc(cg.gain, t, v * 0.05, 0.008);
    ck.connect(cg).connect(out);
    g.connect(out);
  },
  // Rave hoover: wide detuned saws that bend up into the note.
  hoover(A, t, n, dur, v, out, o = {}) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.02, v * 0.13, 0.3, 0.85, dur, 0.15);
    const lp = filt(A, 'lowpass', 2600, 1.2);
    const from = o.from ? mtof(o.from) : f * 0.75;
    const oscs = [];
    for (const [det, pan, mul] of [
      [-28, -0.8, 1],
      [0, 0, 1],
      [26, 0.8, 1],
      [0, 0, 0.5],
    ]) {
      const s = osc(A, 'sawtooth', f * mul, t, end);
      s.detune.value = det;
      pitch(s, f * mul, t, from * mul, 0.09);
      const p = A.ctx.createStereoPanner();
      p.pan.value = pan;
      s.connect(p).connect(lp);
      oscs.push(s);
    }
    vibrato(A, oscs, f, t, end, 0.01, 4.5, 0.2);
    lp.connect(shaper(A, 'warm')).connect(g).connect(out);
  },
  // Talkbox-ish lead: a saw sung through moving vowel formants.
  talk(A, t, n, dur, v, out, o = {}) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.01, v * 0.5, 0.2, 0.8, dur, 0.08);
    const s = osc(A, 'sawtooth', f, t, end);
    pitch(s, f, t, o.from && mtof(o.from), 0.05);
    vibrato(A, s, f, t, end, 0.01, 5.5, 0.2);
    const sum = amp(A, 1);
    for (const [a, b, q, k] of [
      [320, 780, 7, 1],
      [800, 1250, 9, 0.7],
      [2400, 2600, 11, 0.3],
    ]) {
      const bp = filt(A, 'bandpass', a, q);
      bp.frequency.setValueAtTime(a, t);
      bp.frequency.linearRampToValueAtTime(b, t + Math.min(0.12, dur * 0.6));
      const kg = amp(A, k);
      s.connect(bp).connect(kg).connect(sum);
    }
    sum.connect(g).connect(out);
  },
  // Short pluck for arpeggios.
  pluck(A, t, n, dur, v, out) {
    const f = mtof(n);
    const g = amp(A);
    const end = perc(g.gain, t, v * 0.2, 0.22, 0.002);
    const s = osc(A, 'sawtooth', f, t, end);
    const q = osc(A, 'square', f * 1.003, t, end);
    const lp = filt(A, 'lowpass', 4000, 3);
    lp.frequency.setValueAtTime(4000, t);
    lp.frequency.setTargetAtTime(700, t, 0.05);
    const qg = amp(A, 0.5);
    s.connect(lp);
    q.connect(qg).connect(lp);
    lp.connect(g).connect(out);
  },
  // Distorted power chord (root, fifth, octave) through a cabinet filter.
  guitar(A, t, n, dur, v, out, o = {}) {
    const f = mtof(n);
    const g = amp(A);
    const mute = o.mute || dur < 0.14;
    const end = adsr(g.gain, t, 0.003, v * 0.16, mute ? 0.08 : 0.6, mute ? 0.25 : 0.7, dur, 0.06);
    const pre = amp(A, 1);
    for (const [r, d] of [
      [1, -8],
      [1.4983, 6],
      [2, 4],
    ]) {
      const s = osc(A, 'sawtooth', f * r, t, end);
      s.detune.value = d;
      s.connect(pre);
    }
    const hp = filt(A, 'highpass', 90);
    const cab = filt(A, 'lowpass', mute ? 1500 : 3400, 1.1);
    const mid = filt(A, 'peaking', 700);
    mid.gain.value = -5;
    pre.connect(hp).connect(shaper(A, 'fuzz')).connect(mid).connect(cab).connect(g).connect(out);
  },
  // Formant choir 'aah'.
  choir(A, t, n, dur, v, out) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.3, v * 0.5, 0.4, 0.9, dur, 0.5);
    const sum = amp(A, 1);
    const oscs = [-9, 10].map((d) => {
      const s = osc(A, 'sawtooth', f, t, end);
      s.detune.value = d;
      s.connect(sum);
      return s;
    });
    vibrato(A, oscs, f, t, end, 0.007, 4.8, 0.3);
    const mix = amp(A, 1);
    for (const [ff, q, k] of [
      [720, 6, 1],
      [1150, 8, 0.6],
      [2700, 10, 0.25],
    ]) {
      const bp = filt(A, 'bandpass', ff, q);
      const kg = amp(A, k);
      sum.connect(bp).connect(kg).connect(mix);
    }
    mix.connect(g).connect(out);
  },
  // Warm analog pad.
  pad(A, t, n, dur, v, out, o = {}) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, o.attack ?? 0.18, v * 0.06, 0.6, 0.8, dur, 0.4);
    const lp = filt(A, 'lowpass', o.cut || 1600, 0.8);
    for (const d of [-12, 12]) {
      const s = osc(A, 'sawtooth', f, t, end);
      s.detune.value = d + (Math.random() - 0.5) * 6;
      s.connect(lp);
    }
    lp.connect(g).connect(out);
  },
  // House/organ stab: short chord hit with a snapping filter.
  stab(A, t, n, dur, v, out) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.003, v * 0.1, 0.12, 0.35, Math.min(dur, 0.2), 0.08);
    const lp = filt(A, 'lowpass', 3800, 2);
    lp.frequency.setValueAtTime(3800, t);
    lp.frequency.setTargetAtTime(900, t, 0.06);
    for (const d of [-8, 8]) {
      const s = osc(A, 'sawtooth', f, t, end);
      s.detune.value = d;
      s.connect(lp);
    }
    const sq = osc(A, 'square', f * 2, t, end);
    const sg = amp(A, 0.3);
    sq.connect(sg).connect(lp);
    lp.connect(g).connect(out);
  },

  // ---------- basses ----------
  sub(A, t, n, dur, v, out) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.005, v * 0.55, 0.2, 0.85, dur, 0.05);
    osc(A, 'sine', f, t, end).connect(g).connect(out);
  },
  bass(A, t, n, dur, v, out, o = {}) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.004, v * 0.3, 0.2, 0.7, dur, 0.05);
    const lp = filt(A, 'lowpass', 400, 3);
    lp.frequency.setValueAtTime(o.cut ? o.cut * 3 : 2400, t);
    lp.frequency.setTargetAtTime(o.cut || 520, t, 0.05);
    const s = osc(A, 'sawtooth', f, t, end);
    const s2 = osc(A, 'sawtooth', f, t, end);
    s2.detune.value = 9;
    pitch(s, f, t, o.from && mtof(o.from));
    pitch(s2, f, t, o.from && mtof(o.from));
    s.connect(lp);
    s2.connect(lp);
    lp.connect(g).connect(out);
    const sub = osc(A, 'sine', f, t, end);
    pitch(sub, f, t, o.from && mtof(o.from));
    const sg = amp(A, 0.9);
    sub.connect(sg).connect(g);
  },
  reese(A, t, n, dur, v, out, o = {}) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.008, v * 0.26, 0.3, 0.85, dur, 0.08);
    const lp = filt(A, 'lowpass', o.cut || 750, 1.5);
    for (const d of [-13, 13]) {
      const s = osc(A, 'sawtooth', f, t, end);
      s.detune.value = d;
      pitch(s, f, t, o.from && mtof(o.from));
      s.connect(lp);
    }
    const sub = osc(A, 'sine', f, t, end);
    pitch(sub, f, t, o.from && mtof(o.from));
    const sg = amp(A, 1.1);
    sub.connect(sg).connect(g);
    lp.connect(shaper(A, 'warm')).connect(g).connect(out);
  },
  // Funky slap: bright pop that closes instantly.
  slap(A, t, n, dur, v, out) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.002, v * 0.34, 0.12, 0.5, dur, 0.04);
    const lp = filt(A, 'lowpass', 3000, 4);
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.setTargetAtTime(380, t, 0.035);
    const s = osc(A, 'sawtooth', f, t, end);
    const q = osc(A, 'square', f, t, end);
    const qg = amp(A, 0.6);
    s.connect(lp);
    q.connect(qg).connect(lp);
    const sub = osc(A, 'sine', f, t, end);
    const sg = amp(A, 0.8);
    sub.connect(sg).connect(g);
    lp.connect(g).connect(out);
  },
  // TB-303-style acid line: resonant filter, accent and slide.
  acid(A, t, n, dur, v, out, o = {}) {
    const f = mtof(n);
    const g = amp(A);
    const acc = o.accent ? 1.4 : 1;
    const end = adsr(g.gain, t, 0.003, v * 0.22 * acc, 0.15, 0.7, o.slideOut ? dur + 0.03 : dur * 0.8, 0.03);
    const cut = o.cut || 500;
    const lp = filt(A, 'lowpass', cut, 13);
    lp.frequency.setValueAtTime(cut + (o.accent ? 3200 : 1700), t);
    lp.frequency.setTargetAtTime(cut, t, o.accent ? 0.08 : 0.05);
    const s = osc(A, 'sawtooth', f, t, end);
    pitch(s, f, t, o.slide && o.from && mtof(o.from), 0.06);
    const sub = osc(A, 'square', f / 2, t, end);
    pitch(sub, f / 2, t, o.slide && o.from && mtof(o.from) / 2, 0.06);
    const sg = amp(A, 0.25);
    s.connect(lp);
    sub.connect(sg).connect(lp);
    lp.connect(shaper(A, 'drive')).connect(g).connect(out);
  },
  // Galloping pick bass.
  pick(A, t, n, dur, v, out) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.002, v * 0.34, 0.14, 0.4, dur, 0.04);
    const lp = filt(A, 'lowpass', 2200, 2);
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.setTargetAtTime(450, t, 0.04);
    osc(A, 'sawtooth', f, t, end).connect(lp);
    const sub = osc(A, 'sine', f, t, end);
    const sg = amp(A, 0.7);
    sub.connect(sg).connect(g);
    lp.connect(g).connect(out);
  },
  // FM growl bass for the boss.
  growl(A, t, n, dur, v, out, o = {}) {
    const f = mtof(n);
    const g = amp(A);
    const end = adsr(g.gain, t, 0.004, v * 0.24, 0.2, 0.8, dur, 0.05);
    const c = osc(A, 'sawtooth', f, t, end);
    const m = osc(A, 'sine', f * 2, t, end);
    const mi = amp(A);
    mi.gain.setValueAtTime(f * 2.5, t);
    mi.gain.setTargetAtTime(f * 0.6, t, 0.08);
    m.connect(mi).connect(c.frequency);
    const lp = filt(A, 'lowpass', o.cut || 1400, 2);
    const sub = osc(A, 'sine', f, t, end);
    const sg = amp(A, 1);
    c.connect(lp).connect(shaper(A, 'drive')).connect(g).connect(out);
    sub.connect(sg).connect(g);
  },
};

// ------------------------------------------------------------ one-shot FX voices (used by songs)
export const FX = {
  // Noise riser over `dur` seconds.
  riser(A, t, dur, v, out) {
    const n = noise(A, t, t + dur + 0.1);
    const bp = filt(A, 'bandpass', 300, 1.5);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = amp(A);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v * 0.35, t + dur);
    g.gain.setTargetAtTime(0, t + dur, 0.02);
    n.connect(bp).connect(g).connect(out);
    const s = osc(A, 'sawtooth', 110, t, t + dur + 0.1);
    s.frequency.exponentialRampToValueAtTime(880, t + dur);
    const lp = filt(A, 'lowpass', 600);
    lp.frequency.exponentialRampToValueAtTime(4000, t + dur);
    const sg = amp(A);
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(v * 0.06, t + dur);
    sg.gain.setTargetAtTime(0, t + dur, 0.02);
    s.connect(lp).connect(sg).connect(out);
  },
  // Falling noise sweep after a drop.
  down(A, t, dur, v, out) {
    const n = noise(A, t, t + dur + 0.1);
    const bp = filt(A, 'bandpass', 5000, 1);
    bp.frequency.exponentialRampToValueAtTime(200, t + dur);
    const g = amp(A);
    perc(g.gain, t, v * 0.3, dur);
    n.connect(bp).connect(g).connect(out);
  },
};

// ------------------------------------------------------------ formant voice (driver barks)
// Gibberish in the spirit of kart racer character voices, sung through three formant filters.
export const VOWELS = {
  a: [800, 1250, 2600],
  e: [450, 1900, 2600],
  i: [300, 2300, 3000],
  o: [480, 820, 2600],
  u: [330, 700, 2450],
  ae: [660, 1720, 2410],
};
export function syllable(A, t, s, voice, out) {
  // s: { v: vowel, v2: glide-to vowel, c: consonant ('h','w','y','g','b','r','s',''), f0, f1 (end pitch), dur, vol }
  const f0 = s.f0 * voice.f0;
  const f1 = (s.f1 ?? s.f0) * voice.f0;
  const dur = s.dur * voice.rate;
  const end = t + dur + 0.12;
  const src = osc(A, voice.wave || 'sawtooth', f0, t, end);
  src.frequency.setValueAtTime(f0, t);
  src.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (voice.vib) vibrato(A, src, f0, t, end, 0.03, 7, 0.04);
  const pre = amp(A, 1);
  src.connect(pre);
  if (voice.growl) {
    // Subharmonic rasp.
    const r = osc(A, 'square', f0 / 2, t, end);
    r.frequency.exponentialRampToValueAtTime(f1 / 2, t + dur);
    const rg = amp(A, voice.growl * 0.5);
    r.connect(rg).connect(pre);
  }
  const V0 = VOWELS[s.c === 'w' ? 'u' : s.c === 'y' ? 'i' : s.v];
  const V1 = VOWELS[s.v];
  const V2 = VOWELS[s.v2 || s.v];
  const sum = amp(A, 1);
  for (let k = 0; k < 3; k++) {
    const bp = filt(A, 'bandpass', V0[k] * voice.form, [6, 9, 12][k]);
    bp.frequency.setValueAtTime(V0[k] * voice.form, t);
    bp.frequency.linearRampToValueAtTime(V1[k] * voice.form, t + Math.min(0.06, dur * 0.4));
    bp.frequency.linearRampToValueAtTime(V2[k] * voice.form, t + dur);
    const kg = amp(A, [1.4, 0.8, 0.35][k]);
    pre.connect(bp).connect(kg).connect(sum);
  }
  const g = amp(A);
  const peak = (s.vol ?? 1) * 0.9;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + (s.c === 'b' || s.c === 'g' ? 0.004 : 0.02));
  g.gain.setValueAtTime(peak, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  sum.connect(shaper(A, voice.growl ? 'drive' : 'warm')).connect(g).connect(out);
  // Consonant noise.
  if (s.c === 'h' || s.c === 's' || s.c === 'g' || s.c === 'b') {
    const n = noise(A, t - 0.005, t + 0.08);
    const nf = filt(A, s.c === 's' ? 'highpass' : 'bandpass', s.c === 's' ? 4500 : V1[1] * voice.form, s.c === 's' ? 0.7 : 2);
    const ng = amp(A);
    perc(ng.gain, t - 0.005, s.c === 's' ? 0.25 : 0.18, s.c === 's' ? 0.07 : 0.03);
    n.connect(nf).connect(ng).connect(out);
  }
}

// ------------------------------------------------------------ voice lifetime
// Each note gets a private output that is disconnected once the note has rung out, so finished
// voices leave the graph straight away instead of waiting for garbage collection.
function voiceOut(A, out, t, until) {
  const g = A.ctx.createGain();
  g.connect(out);
  const k = A.ctx.createConstantSource();
  k.offset.value = 0;
  k.connect(g.gain);
  k.start(t);
  k.stop(until);
  k.onended = () => {
    g.disconnect();
    k.disconnect();
  };
  return g;
}
for (const [name, fn] of Object.entries(INST)) INST[name] = (A, t, n, dur, v, out, o) => fn(A, t, n, dur, v, voiceOut(A, out, t, t + dur + 2.2), o);
for (const [name, fn] of Object.entries(DRUMS)) DRUMS[name] = (A, t, v, out, o) => fn(A, t, v, voiceOut(A, out, Math.max(A.now(), t - 2), t + 3.2), o);
for (const [name, fn] of Object.entries(FX)) FX[name] = (A, t, dur, v, out) => fn(A, t, dur, v, voiceOut(A, out, t, t + dur + 1));
