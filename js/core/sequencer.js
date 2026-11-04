// Compiles the song text in songs.js into per-step events the audio engine can schedule.

const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const NOTE_RE = /^([a-g])(#|b)?(-?\d)([!~]*)$/;
const CHORD_RE = /^([A-G])(#|b)?(.*)$/;
const QUAL = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  7: [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  m9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  5: [0, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
};

export function noteNum(tok) {
  const m = NOTE_RE.exec(tok);
  if (!m) return null;
  const pc = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return { n: (Number(m[3]) + 1) * 12 + pc, accent: m[4].includes('!'), slide: m[4].includes('~') };
}

export function parseChord(name) {
  const m = CHORD_RE.exec(name);
  if (!m) throw new Error(`Bad chord ${name}`);
  const pc = (PC[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const iv = QUAL[m[3]];
  if (!iv) throw new Error(`Unknown chord quality ${name}`);
  return { name, pc, iv };
}

// Close voicing of a chord within the octave starting a little below C of `oct`.
function voiced(ch, oct) {
  const lo = (oct + 1) * 12 - 2;
  const fold = (x) => lo + ((((x - lo) % 12) + 12) % 12);
  const tones = ch.iv.map((i) => (i >= 12 ? fold(ch.pc + i) + 12 : fold(ch.pc + i)));
  return [...new Set(tones)].sort((a, b) => a - b);
}
function rootIn(ch, oct) {
  const lo = (oct + 1) * 12 - 2;
  return lo + ((((ch.pc - lo) % 12) + 12) % 12);
}

const DRUM_VEL = { X: 1.1, x: 0.85, o: 0.45, h: 0.85, m: 0.85, l: 0.9, s: 0.8 };
const TOM_NOTE = { h: 52, m: 47, l: 42 };
const CONGA_NOTE = { h: 64, m: 60, l: 57, s: 64, x: 60, X: 60, o: 60 };

function charTokens(src) {
  return (src || '').replace(/[\s|]/g, '').split('');
}
function noteTokens(src) {
  return (src || '').split(/\s+/).filter((t) => t && t !== '|');
}

// Returns events { s, len, notes?, vel, ... } for one channel across a part.
function parseTrack(mix, src, len, chordAt) {
  const mode = mix.drum ? 'drum' : mix.mode;
  const tr = mix.transpose || 0;
  const out = [];
  if (mode === 'notes') {
    const toks = noteTokens(src);
    if (!toks.length) return out;
    let prev = null;
    for (let s = 0; s < len; s++) {
      const tok = toks[s % toks.length];
      if (tok === '-' || tok === '.') continue;
      const nn = noteNum(tok);
      if (!nn) throw new Error(`Bad note ${tok}`);
      let l = 1;
      while (s + l < len && toks[(s + l) % toks.length] === '-') l++;
      out.push({ s, len: l, notes: [nn.n + tr], vel: nn.accent ? 1 : 0.85, accent: nn.accent, slide: nn.slide, from: prev === null ? null : prev + tr });
      prev = nn.n;
    }
    return out;
  }
  const toks = charTokens(src);
  if (!toks.length) return out;
  for (let s = 0; s < len; s++) {
    const c = toks[s % toks.length];
    if (c === '.' || c === '-') continue;
    let l = 1;
    while (s + l < len && toks[(s + l) % toks.length] === '-') l++;
    const ch = chordAt(Math.floor(s / 16));
    if (mode === 'drum') {
      const vel = DRUM_VEL[c] ?? 0.85;
      const ev = { s, len: l, vel, c };
      if (mix.drum === 'tom') ev.note = TOM_NOTE[c] ?? 47;
      if (mix.drum === 'conga') {
        ev.note = CONGA_NOTE[c];
        ev.slap = c === 's';
      }
      out.push(ev);
    } else if (mode === 'bass') {
      const root = rootIn(ch, mix.oct ?? 2);
      const iv = { x: 0, o: 12, 5: 7, 3: ch.iv[1], 7: ch.iv[3] ?? 10, 4: 5, 2: 2 }[c];
      if (iv === undefined) throw new Error(`Bad bass char ${c}`);
      out.push({ s, len: l, notes: [root + iv + tr], vel: 0.85 });
    } else if (mode === 'arp') {
      const tones = voiced(ch, mix.oct ?? 4);
      const i = Number(c);
      if (Number.isNaN(i)) throw new Error(`Bad arp char ${c}`);
      out.push({ s, len: l, notes: [tones[i % tones.length] + 12 * Math.floor(i / tones.length) + tr], vel: 0.8 });
    } else if (mode === 'chord') {
      const notes = mix.rootOnly ? [rootIn(ch, mix.oct ?? 3) + tr] : voiced(ch, mix.oct ?? 4).map((n) => n + tr);
      out.push({ s, len: mix.len || l, notes, vel: c === 'X' ? 1 : 0.85 });
    } else if (mode === 'fx') {
      out.push({ s, len: l, fx: c, vel: 0.9 });
    }
  }
  return out;
}

export function compile(def) {
  if (def._compiled) return def._compiled;
  const parts = {};
  for (const [pname, part] of Object.entries(def.parts)) {
    const len = part.bars * 16;
    const steps = Array.from({ length: len }, () => []);
    const chords = part.chords.split(/\s+/).map(parseChord);
    const chordAt = (bar) => chords[bar % chords.length];
    for (const [key, val] of Object.entries(part.tracks)) {
      const [name, cond] = key.split('!');
      const mix = def.mix[name];
      if (!mix) throw new Error(`${def.name}: no channel ${name}`);
      const src = mix.copy ? part.tracks[mix.copy] : val;
      for (const ev of parseTrack(mix, src, len, chordAt)) {
        ev.ch = name;
        ev.cond = cond || null;
        steps[ev.s].push(ev);
      }
    }
    parts[pname] = { name: pname, len, steps, crash: !!part.crash };
  }
  def._compiled = { parts, form: def.form.map((n) => parts[n]) };
  return def._compiled;
}

// Seconds from the start of the form to its end (one pass, no loop).
export function formSeconds(def) {
  const c = compile(def);
  const steps = c.form.reduce((a, p) => a + p.len, 0);
  return (steps * 60) / def.bpm / 4;
}
