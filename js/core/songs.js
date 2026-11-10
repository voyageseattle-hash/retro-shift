// The RETRO SHIFT soundtrack, in Absurd Combat Racing's song format (see sequencer.js for the track syntax).
//
// Every song is written as two bands over one rhythm section:
//   world: 'red'   the driving half: lead guitar, chugs, power chords
//   world: 'blue'  the floating half: theremin, pads, arps, choir
// In BOTH you hear the whole song. Shift to RED and the blue band sinks behind a wall; shift to BLUE and the red
// band does. Drums are in both worlds. Tracks ending !hot only play on the final lap.

const R = (bars) => '.'.repeat(16 * bars);
const RN = (bars) => Array(16 * bars).fill('.').join(' ');
const bars = (...b) => b.join(' | ');

const DRUMS = {
  kick: { drum: 'kick', vol: 0.62 },
  snare: { drum: 'snare', vol: 1.5, verb: 0.22 },
  clap: { drum: 'clap', vol: 1.2, verb: 0.3, pan: 0.05 },
  hat: { drum: 'hat', vol: 1.8, pan: 0.22 },
  ohat: { drum: 'ohat', vol: 1.4, pan: 0.28 },
  crash: { drum: 'crash', vol: 0.8, pan: -0.25, verb: 0.25 },
  tom: { drum: 'tom', vol: 0.35, verb: 0.3 },
  fx: { mode: 'fx', vol: 0.8, verb: 0.35 },
};

// The racer band. The engine room plays in every lens: four-on-the-floor and a gated 16th-note EBM bass.
//   red   lead guitar (or surf guitar), palm-muted chugs, power chords
//   blue  theremin, pumped saw pads, a plucked arpeggio, a low choir
const BAND = (o = {}) => ({
  ...DRUMS,
  bass: { inst: o.bass || 'bass', mode: 'bass', oct: 2, vol: o.bassVol || 0.3, pump: true, cut: o.bassCut || 1000 },
  lead: { inst: o.lead || 'lguitar', mode: 'notes', vol: o.leadVol || (o.lead === 'surf' ? 1.6 : 0.95), delay: 0.2, verb: 0.22, pan: -0.1, world: 'red' },
  stab: { inst: 'guitar', mode: 'chord', rootOnly: true, oct: 3, vol: 1.6, pan: -0.4, world: 'red' },
  gtr: { inst: 'guitar', mode: 'chord', rootOnly: true, oct: 3, vol: 0.8, pan: 0.4, world: 'red' },
  pad: { inst: 'pad', mode: 'chord', oct: 4, vol: 0.85, pump: true, verb: 0.35, world: 'blue' },
  arp: { inst: o.arp || 'pluck', mode: 'arp', oct: 5, vol: o.arp === 'bell' ? 0.9 : 0.8, pan: 0.4, delay: 0.3, verb: 0.25, world: 'blue' },
  bells: { inst: 'theremin', mode: 'notes', vol: 0.6, pan: 0.15, delay: 0.25, verb: 0.5, world: 'blue' },
  choir: { inst: 'choir', mode: 'chord', oct: 4, vol: 0.35, verb: 0.5, world: 'blue' },
  ...(o.extra || {}),
});

// Standard groove pieces.
const G = {
  four: 'x...x...x...x...',
  back: '....x.......x...',
  half: '........x.......',
  off: '..x...x...x...x.',
  eights: 'x.x.x.x.x.x.x.x.',
  sixteen: 'xoxoxoxoxoxoxoxo',
  ebm: '.xxx.xxx.xxx.xox',
  ebmB: '.xxx.xxx.xxx.xxx',
  chug: 'x.x.x.x.x.x.xx.x',
  octBass: 'x.o.x.o.x.o.x.oo',
  driveBass: 'xxoxxxoxxxoxxxox',
  roll: R(3) + '|h.h.m.m.l.l.lll.',
  rise: R(3) + '|R---------------',
  rise8: R(7) + '|R---------------',
};
// One pattern bar repeated for n bars, optionally ending on a different bar (a fill).
const rep = (bar, n, last = null) => Array(n).fill(bar).map((b, i) => (i === n - 1 && last ? last : b)).join('|');
// Snare fills for the last bar of a section, light to heavy.
const FILL = {
  light: '....x.......xoxx',
  mid: '....x...x.x.xxXX',
  big: 'x.x.x.x.xxxxXXXX',
};

function song(def) {
  return { delayBeats: 0.75, hotTempo: 1.06, loop: 1, ...def };
}

// The race songs build lap by lap. Track keys ending !l2 come in from lap 2 on; !hot only on the final lap (which
// also speeds the song up and adds ghost hats).
//   A        the red lead's hook over the blue band's counter-melody (each lens keeps a tune to follow)
//   B        the blue bells take the tune, the red lead holds a counter-line
//   A2       the hook again, lifted: arps and open hats in from the start
//   C        the bridge: new chords, the drums drop out, both bands play one melody, then a snare build back into B
function race(o) {
  const A = {
    bars: 8,
    chords: o.chords.A,
    crash: true,
    tracks: {
      lead: o.lead,
      bells: o.counter,
      bass: o.bassA || G.ebm,
      kick: o.kickA || G.four,
      snare: rep(o.snareA || G.back, 8, FILL.light),
      hat: G.sixteen,
      stab: o.chugA ?? G.chug,
      'ohat!l2': G.off,
      'clap!l2': o.snareA || G.back,
      pad: 'x---------------',
      'arp!l2': o.arpA || '0.2.4.2.0.2.4.2.',
      'gtr!hot': 'x..x..x...x.x...',
      ...(o.extraA || {}),
    },
  };
  const B = {
    bars: 8,
    chords: o.chords.B,
    crash: true,
    tracks: {
      bells: o.tune,
      lead: o.redB,
      choir: 'x---------------',
      arp: o.arpB || '0.1.2.3.2.1.2.3.',
      stab: o.stabB || 'x..x..x...x.x...',
      bass: o.bassB || G.ebmB,
      kick: G.four,
      snare: rep(G.back, 8, FILL.mid),
      clap: G.back,
      hat: G.sixteen,
      'ohat!l2': G.off,
      tom: R(7) + '|h.h.m.m.l.l.lll.',
      ...(o.extraB || {}),
    },
  };
  const A2 = {
    ...A,
    tracks: {
      ...A.tracks,
      lead: o.lead2 || o.lead,
      arp: o.arpA || '0.2.4.2.0.2.4.2.',
      ohat: G.off,
      hat: G.sixteen,
      snare: rep(o.snareA || G.back, 8, FILL.big),
      fx: G.rise8,
    },
  };
  delete A2.tracks['arp!l2'];
  delete A2.tracks['ohat!l2'];
  const C = {
    bars: 8,
    chords: o.chords.C,
    tracks: {
      lead: o.bridge,
      bells: o.bridge,
      pad: 'x---------------',
      choir: 'x---------------',
      arp: '0.1.2.3.4.3.2.1.',
      kick: rep('x...............', 4) + '|' + rep(G.four, 4),
      bass: rep('x-------x-------', 4) + '|' + rep(o.bassA || G.ebm, 4),
      hat: rep(G.off, 4) + '|' + rep(G.sixteen, 4),
      snare: R(4) + '|' + rep('....x.......x...', 2) + '|....x...x...x.x.|' + FILL.big,
      fx: G.rise8,
    },
  };
  return song({
    name: o.name,
    bpm: o.bpm,
    swing: o.swing,
    tonic: o.tonic,
    kit: o.kit,
    mix: BAND(o.band),
    parts: { intro: o.intro, A, B, A2, C, break: o.brk },
    form: ['intro', 'A', 'B', 'A2', 'C', 'B', 'break'],
  });
}

// The second course of each pair gets its own take on the song: another key, tempo, lead voice and kit.
function remix(base, o) {
  const { _compiled, ...b } = base;
  return song({ ...b, ...o, tonic: base.tonic + (o.transpose || 0), mix: o.band ? BAND(o.band) : b.mix });
}

export const SONGS = {
  // ------------------------------------------------------------------ main theme / 01
  drive: race({
    name: 'Shift Drive',
    bpm: 142,
    tonic: 64,
    kit: { kick: 'punch', snare: 'crack' },
    band: {},
    chords: { A: 'Em C G D', B: 'C D Em Em C D B B', C: 'Am Am C C Am Am B B' },
    intro: {
      bars: 4,
      chords: 'Em C G D',
      tracks: {
        bass: G.ebm,
        arp: '0123012301230123',
        stab: R(2) + '|x.x.x.x.x.x.xx.x|x.x.x.x.x.x.xx.x',
        kick: R(2) + '|' + G.four + '|' + G.four,
        hat: G.sixteen,
        lead: bars(RN(1), RN(1), RN(1), 'e6 e6 e6 e6 d6 d6 d6 d6 b5 b5 b5 b5 a5 a5 a5 a5'),
        fx: G.rise,
      },
    },
    // the hook: up the E minor chord in a 2-3-3 kick, and an answer that climbs to the top of the neck
    lead: bars(
      'e5 - b5 - e6 - - d6 - - b5 - d6 - e6 -', 'g6 - - - e6 - - - c6 - - - b5 - c6 -',
      'd6 - b5 - d6 - - g6 - - f#6 - d6 - b5 -', 'a5 - - - - - - - f#5 - a5 - d6 - f#6 -',
      'e5 - b5 - e6 - - d6 - - b5 - d6 - e6 -', 'g6 - - - a6 - - - b6 - - - a6 - g6 -',
      'b6 - - - - - g6 - d6 - - - g6 - a6 -', 'f#6 - - - - - - - - - - - . . . .',
    ),
    counter: bars(
      'b5 - - - - - - - g5 - - - - - - -', 'e6 - - - - - - - g6 - - - - - - -',
      'd6 - - - - - - - b5 - - - - - - -', 'a5 - - - - - - - d6 - - - - - - -',
      'e6 - - - - - - - b6 - - - - - - -', 'g6 - - - - - - - e6 - - - - - - -',
      'g6 - - - - - - - d6 - - - - - - -', 'f#6 - - - - - - - a6 - - - - - - -',
    ),
    arpA: '0123012301230123',
    tune: bars(
      'g5 - - - c6 - - - e6 - - - d6 - c6 -', 'a5 - - - d6 - - - f#6 - - - e6 - d6 -',
      'g6 - - - - - - - f#6 - - - e6 - - -', 'b5 - - - - - - - - - - - . . . .',
      'g5 - - - c6 - - - e6 - - - g6 - - -', 'a6 - - - - - - - f#6 - - - d6 - - -',
      'd#6 - - - f#6 - - - b6 - - - a6 - - -', 'f#6 - - - - - - - d#6 - - - - - - -',
    ),
    redB: bars(
      'c5 - - - - - - - e5 - - - g5 - - -', 'd5 - - - - - - - f#5 - - - a5 - - -',
      'b5 - - - - - - - - - - - - - - -', 'b5 - a5 - g5 - e5 - g5 - a5 - b5 - d6 -',
      'e6 - - - - - - - c6 - - - g5 - - -', 'f#6 - - - - - - - d6 - - - a5 - - -',
      'f#6 - - - - - - - d#6 - - - b5 - - -', 'b5 b5 b5 b5 a5 a5 a5 a5 f#5 f#5 f#5 f#5 d#5 d#5 d#5 d#5',
    ),
    bridge: bars(
      'e6 - - - - - - - c6 - - - a5 - - -', 'b5 - - - c6 - - - - - - - . . . .',
      'g6 - - - - - - - e6 - - - c6 - - -', 'd6 - - - e6 - - - - - - - . . . .',
      'a6 - - - - - - - e6 - - - c6 - - -', 'b5 - - - c6 - - - e6 - - - a6 - - -',
      'f#6 - - - - - - - d#6 - - - b5 - - -', 'b6 - - - - - - - - - - - - - - -',
    ),
    brk: {
      bars: 4,
      chords: 'Em C Am B',
      tracks: { pad: 'x---------------', arp: '0123012301230123', kick: 'x.......x.......', bass: 'x-------x-------', fx: G.rise },
    },
  }),

  // ------------------------------------------------------------------ 05: the drive-in stage
  // Neon Grid City plays the matinee: surf guitar and theremin over the same engine room, a little slower.
  neon: race({
    name: 'Neon Matinee',
    bpm: 128,
    tonic: 64,
    kit: { kick: 'punch', snare: 'crack' },
    band: { lead: 'surf', arp: 'pluck' },
    chords: { A: 'Em C Am B7', B: 'C D Em Em C D B7 B7', C: 'Am Am Em Em C C B7 B7' },
    bassA: '.xxx.xxx.xoo.xxx',
    chugA: '..x...x...x..x..',
    intro: {
      bars: 4,
      chords: 'Em C Am B7',
      tracks: {
        bass: R(2) + '|.xxx.xxx.xoo.xxx|.xxx.xxx.xoo.xxx',
        bells: bars('b5 - - - - - - - - - - - g5 - - -', 'g5 - - - - - - - e5 - - - - - - -', 'e6 - - - - - - - - - - - c6 - - -', 'd#6 - - - - - - - - - - - f#6 - - -'),
        kick: R(2) + '|' + G.four + '|' + G.four,
        hat: G.off,
        fx: G.rise,
      },
    },
    lead: bars(
      'e5 . g5 . b5 - - . a5 . g5 . f#5 . g5 .', 'e5 - - - - - . . c6 c6 c6 c6 b5 b5 b5 b5',
      'a5 . c6 . e6 - - . d6 . c6 . b5 . c6 .', 'b5 b5 b5 b5 b5 b5 b5 b5 a5 a5 g5 g5 f#5 f#5 d#5 d#5',
      'e5 . g5 . b5 . . . e6 . d6 . b5 . g5 .', 'e6 - - - - - . . g6 g6 g6 g6 e6 e6 e6 e6',
      'c6 . e6 . a6 - - . g6 . e6 . c6 . a5 .', 'b5 - - - - - - - f#5 - - - d#5 - - -',
    ),
    counter: bars(
      'b5 - - - - - - - - - - - g5 - - -', 'g5 - - - - - - - e5 - - - - - - -',
      'e6 - - - - - - - - - - - c6 - - -', 'd#6 - - - - - - - - - - - f#6 - - -',
      'g6 - - - - - - - - - - - e6 - - -', 'e6 - - - - - - - g6 - - - - - - -',
      'a6 - - - - - - - e6 - - - - - - -', 'f#6 - - - - - - - d#6 - - - - - - -',
    ),
    arpA: '0123012301230123',
    tune: bars(
      'e6 - - - - - - - g6 - - - - - - -', 'f#6 - - - - - - - a6 - - - - - - -',
      'b6 - - - - - - - - - - - g6 - - -', 'e6 - - - - - - - - - - - - - - -',
      'g6 - - - - - - - e6 - - - c6 - - -', 'd6 - - - - - - - f#6 - - - a6 - - -',
      'a6 - - - - - - - f#6 - - - d#6 - - -', 'b5 - - - - - - - - - - - - - - -',
    ),
    redB: bars(
      'c5 . c5 . e5 . g5 . c6 - - - . . . .', 'd5 . d5 . f#5 . a5 . d6 - - - . . . .',
      'e5 . e5 . g5 . b5 . e6 e6 e6 e6 d6 d6 b5 b5', 'e6 - - - - - - - . . . . . . . .',
      'c5 . c5 . e5 . g5 . c6 - - - . . . .', 'd5 . d5 . f#5 . a5 . d6 - - - . . . .',
      'b4 . b4 . d#5 . f#5 . b5 - - - a5 - - -', 'b5 b5 b5 b5 a5 a5 a5 a5 f#5 f#5 f#5 f#5 d#5 d#5 d#5 d#5',
    ),
    stabB: 'x..x..x...x.x...',
    bridge: bars(
      'c6 - - - - - - - e6 - - - - - - -', 'a6 - - - - - - - g6 - - - e6 - - -',
      'g6 - - - - - - - b5 - - - - - - -', 'e6 - - - - - - - - - - - . . . .',
      'e6 - - - - - - - g6 - - - c7 - - -', 'b6 - - - - - - - g6 - - - e6 - - -',
      'd#6 - - - - - - - f#6 - - - a6 - - -', 'b6 - - - - - - - - - - - - - - -',
    ),
    brk: {
      bars: 4,
      chords: 'Em C Am B7',
      tracks: { pad: 'x---------------', bells: bars('e6 - - - - - - - - - - - b5 - - -', 'c6 - - - - - - - - - - - . . . .', 'a5 - - - c6 - - - e6 - - - . . . .', 'd#6 - - - - - - - f#6 - - - - - - -'), kick: 'x.......x.......', fx: G.rise },
    },
  }),

  // ------------------------------------------------------------------ 02
  circuit: race({
    name: 'Core Circuit',
    bpm: 138,
    tonic: 57,
    kit: { kick: 'punch', snare: 'crack' },
    band: { arp: 'bell' },
    chords: { A: 'Am F C G', B: 'F G Am Am F G C E', C: 'Dm F Am G Dm F E E' },
    intro: {
      bars: 4,
      chords: 'Am F C G',
      tracks: { arp: '0.1.2.3.4.3.2.1.', kick: R(2) + '|' + G.four + '|' + G.four, bass: R(2) + '|x.......x.......|x.......x...x.x.', hat: G.off, fx: G.rise },
    },
    // a 3-3-2 hook that climbs, then answers itself an octave up
    lead: bars(
      'e5 - . a5 - . c6 - b5 - . a5 - . e5 -', 'f5 - . a5 - . c6 - e6 - - - d6 - c6 -',
      'g5 - . c6 - . e6 - d6 - . c6 - . g5 -', 'd6 - - - b5 - - - g5 - - - a5 - b5 -',
      'c6 - . e6 - . a6 - g6 - . e6 - . c6 -', 'a5 - . c6 - . f6 - e6 - . c6 - . a5 -',
      'g5 - . c6 - . e6 - g6 - - - e6 - d6 -', 'd6 - - - - - - - b5 - - - g5 - - -',
    ),
    lead2: bars(
      'e5 - . a5 - . c6 - b5 - . a5 - . e5 -', 'f5 - . a5 - . c6 - e6 - - - d6 - c6 -',
      'g5 - . c6 - . e6 - d6 - . c6 - . g5 -', 'd6 - - - b5 - - - g5 - - - a5 - b5 -',
      'c6 - . e6 - . a6 - g6 - . e6 - . c6 -', 'a5 - . c6 - . f6 - e6 - . c6 - . a5 -',
      'e6 - d6 - c6 - b5 - c6 - d6 - e6 - g6 -', 'b6 - - - - - - - d7 - - - - - - -',
    ),
    counter: bars(
      'e6 - - - - - - - c6 - - - b5 - - -', 'c6 - - - - - - - a5 - - - c6 - - -',
      'g6 - - - - - - - e6 - - - c6 - - -', 'd6 - - - b5 - - - g5 - - - . . . .',
      'e6 - - - - - - - a6 - - - g6 - - -', 'f6 - - - - - - - e6 - - - c6 - - -',
      'e6 - - - - - - - g6 - - - c7 - - -', 'b6 - - - - - - - . . . . . . . .',
    ),
    tune: bars(
      'c6 - - . a5 - - . f5 - a5 - c6 - - .', 'd6 - - . b5 - - . g5 - b5 - d6 - - .',
      'e6 - - - c6 - - - a5 - - - c6 - e6 -', 'a6 - - - - - - - . . . . e6 . a6 .',
      'c6 - - . a5 - - . f5 - a5 - c6 - - .', 'd6 - - . b5 - - . g5 - b5 - d6 - - .',
      'e6 - - - g6 - - - c7 - - - g6 - e6 -', 'g#6 - - - - - - - b6 - - - g#6 - - -',
    ),
    redB: bars(
      'c5 - - - - - - - - - - - a4 - c5 -', 'd5 - - - - - - - - - - - b4 - d5 -',
      'e5 - - - - - - - - - - - - - - -', 'e5 - - . e5 . g5 . a5 - - - . . . .',
      'c5 - - - - - - - - - - - a4 - c5 -', 'd5 - - - - - - - - - - - b4 - d5 -',
      'e5 - - - - - - - g5 - - - - - - -', 'g#5 - - - - - - - b5 - - - - - - -',
    ),
    bridge: bars(
      'f5 - - - e5 - - - d5 - - - a5 - - -', 'c6 - - - - - - - a5 - - - f5 - - -',
      'e5 - - - - - - - - - - - c6 - b5 -', 'b5 - - - - - - - d6 - - - - - - -',
      'f6 - - - e6 - - - d6 - - - a5 - - -', 'c6 - - - - - - - f6 - - - a6 - - -',
      'g#6 - - - - - - - e6 - - - b5 - - -', 'b5 - - - - - - - - - - - - - - -',
    ),
    brk: {
      bars: 4,
      chords: 'Am F C E',
      tracks: { pad: 'x---------------', arp: '0.2.4.2.5.4.2.1.', kick: 'x.......x.......', bass: 'x-------x-------', fx: G.rise },
    },
  }),

  // ------------------------------------------------------------------ 03 / 04
  tunnel: race({
    name: 'Tunnel Vision',
    bpm: 140,
    tonic: 62,
    kit: { kick: 'punch', snare: 'crack' },
    band: { bass: 'acid', bassCut: 700, bassVol: 0.65 },
    chords: { A: 'Dm Bb F C', B: 'Bb C Dm Dm Bb C A A', C: 'Gm Gm Bb Bb Gm Gm A A' },
    bassA: '.xxx.xxx.xox.xxx',
    intro: {
      bars: 4,
      chords: 'Dm Dm Bb C',
      tracks: { bass: G.driveBass, hat: G.sixteen, kick: R(2) + '|' + G.four + '|' + G.four, fx: G.rise },
    },
    lead: bars(
      'd5 - - - - - f5 - a5 - - - g5 - f5 -', 'bb4 - - - - - d5 - f5 - - - e5 - d5 -',
      'c5 - - - f5 - - - a5 - c6 - a5 - f5 -', 'e5 - - - - - - - g5 - - - c6 - - -',
      'd5 - - - - - f5 - a5 - - - g5 - f5 -', 'bb4 - - - - - d5 - f5 - - - bb5 - a5 -',
      'a5 - - - c6 - - - f6 - - - e6 - c6 -', 'd6 - - - - - - - . . . . . . . .',
    ),
    // sonar pings in the dark
    counter: bars(
      'd6 . . a5 . . f6 . . d6 . . a5 . . .', 'd6 . . bb5 . . f6 . . d6 . . bb5 . . .',
      'c6 . . a5 . . f6 . . c6 . . a5 . . .', 'c6 . . g5 . . e6 . . c6 . . g6 . . .',
    ),
    arpA: '0.2.4.6.4.2.0.2.',
    tune: bars(
      'f5 . bb5 . d6 . f6 - - . e6 . d6 . c6 .', 'e5 . g5 . c6 . e6 - - . d6 . c6 . bb5 .',
      'a5 - - - d6 - - - f6 - - - a6 - - -', 'f6 - - - e6 - - - d6 - - - a5 - - -',
      'f5 . bb5 . d6 . f6 - - . e6 . d6 . c6 .', 'e5 . g5 . c6 . e6 - - . g6 . e6 . c6 .',
      'c#6 - - - e6 - - - a6 - - - g6 - e6 -', 'a6 - - - - - - - . . . . . . . .',
    ),
    redB: bars(
      'f5 - - - - - - - - - - - - - - -', 'g5 - - - - - - - - - - - e5 - - -',
      'a5 - - - - - - - - - - - - - - -', 'a5 - - - g5 - - - f5 - - - e5 - - -',
      'd5 - - - - - - - - - - - - - - -', 'e5 - - - - - - - g5 - - - - - - -',
      'c#5 - - - - - - - e5 - - - - - - -', 'e5 - - - - - - - - - - - - - - -',
    ),
    extraB: { stab: '', gtr: 'x..x..x...x.x...' },
    bridge: bars(
      'g5 - - - - - - - - - - - - - - -', 'bb5 - - - - - - - a5 - - - g5 - - -',
      'f5 - - - - - - - - - - - d5 - - -', 'f5 - - - g5 - - - a5 - - - bb5 - - -',
      'd6 - - - - - - - - - - - c6 - bb5 -', 'a5 - - - - - - - bb5 - - - g5 - - -',
      'a5 - - - - - - - c#6 - - - e6 - - -', 'a6 - - - - - - - - - - - - - - -',
    ),
    brk: {
      bars: 4,
      chords: 'Dm Bb Gm A',
      tracks: { pad: 'x---------------', arp: '0.1.2.3.4.3.2.1.', kick: 'x.......x.......', bass: G.driveBass, fx: G.rise },
    },
  }),

  // ------------------------------------------------------------------ 05 / 06
  grid: race({
    name: 'Neon Grid',
    bpm: 134,
    swing: 0.02,
    tonic: 64,
    kit: { kick: 'punch', snare: 'crack' },
    band: { bassCut: 800 },
    chords: { A: 'Em C G D', B: 'C D Em Em C D B B', C: 'Am Am Em Em Am Am B B' },
    bassA: 'x.xx.xxx.xxx.xox',
    kickA: 'x...x...x...x..x',
    arpA: '0123432101234321',
    intro: {
      bars: 4,
      chords: 'Em C G D',
      tracks: { arp: '0123432101234321', pad: 'x---------------', hat: R(2) + '|' + G.eights + '|' + G.eights, fx: G.rise },
    },
    lead: bars(
      'e5 - - . b5 - - . e6 - d6 - b5 - g5 -', 'c6 - - - b5 - g5 - e5 - - - . . . .',
      'd5 - - . g5 - - . b5 - a5 - g5 - d5 -', 'f#5 - - - a5 - - - d6 - - - . . . .',
      'e5 - - . b5 - - . e6 - d6 - b5 - g5 -', 'c6 - - - e6 - g6 - e6 - - - . . . .',
      'd6 - - - b5 - - - g5 - - - b5 - d6 -', 'e6 - - - - - - - . . . . . . . .',
    ),
    lead2: bars(
      'e5 - - . b5 - - . e6 - d6 - b5 - g5 -', 'c6 - - - b5 - g5 - e5 - - - g5 - b5 -',
      'd5 - - . g5 - - . b5 - a5 - g5 - d5 -', 'f#5 - - - a5 - - - d6 - - - f#6 - a6 -',
      'b6 - - . g6 - - . e6 - d6 - b5 - g5 -', 'c6 - - - e6 - g6 - c7 - - - b6 - g6 -',
      'b6 - - - g6 - - - d6 - - - g6 - b6 -', 'a6 - - - - - - - . . . . . . . .',
    ),
    counter: bars(
      'g6 - - - - - - - - - - - f#6 - - -', 'e6 - - - - - - - - - - - - - - -',
      'd6 - - - - - - - - - - - b5 - - -', 'a5 - - - - - - - - - - - - - - -',
      'g6 - - - - - - - b6 - - - - - - -', 'c7 - - - - - - - g6 - - - - - - -',
      'b6 - - - - - - - g6 - - - d6 - - -', 'f#6 - - - - - - - . . . . . . . .',
    ),
    tune: bars(
      'g5 - - . c6 - - . e6 - - . g6 - - .', 'a5 - - . d6 - - . f#6 - - . a6 - - .',
      'b6 - - - g6 - - - e6 - - - b5 - - -', 'e6 - - - - - - - . . . . . . . .',
      'g5 - - . c6 - - . e6 - - . g6 - - .', 'a5 - - . d6 - - . f#6 - - . a6 - - .',
      'b6 - - - a6 - - - f#6 - - - d#6 - - -', 'b5 - - - - - - - . . . . . . . .',
    ),
    redB: bars(
      'e5 - - - - - - - g5 - - - - - - -', 'f#5 - - - - - - - a5 - - - - - - -',
      'b5 - - - - - - - - - - - - - - -', 'b5 - - . b5 . a5 . g5 - - - e5 - - -',
      'e5 - - - - - - - g5 - - - - - - -', 'f#5 - - - - - - - a5 - - - - - - -',
      'f#5 - - - - - - - a5 - - - - - - -', 'd#5 - - - - - - - f#5 - - - - - - -',
    ),
    bridge: bars(
      'c6 - - - b5 - - - a5 - - - e5 - - -', 'a5 - - - - - - - - - - - . . . .',
      'b5 - - - a5 - - - g5 - - - e5 - - -', 'g5 - - - - - - - - - - - . . . .',
      'c6 - - - e6 - - - a6 - - - g6 - - -', 'e6 - - - - - - - c6 - - - a5 - - -',
      'b5 - - - d#6 - - - f#6 - - - a6 - - -', 'b6 - - - - - - - - - - - - - - -',
    ),
    brk: {
      bars: 4,
      chords: 'Em C Am B',
      tracks: { pad: 'x---------------', arp: '0.2.4.2.5.4.2.1.', kick: 'x.......x.......', bass: 'x-------x-------', fx: G.rise },
    },
  }),

  // ------------------------------------------------------------------ 07 / 08
  helix: race({
    name: 'Helix',
    bpm: 144,
    tonic: 66,
    kit: { kick: 'punch', snare: 'crack' },
    band: { lead: 'surf', arp: 'bell' },
    chords: { A: 'F#m D A E', B: 'D E F#m F#m D E C# C#', C: 'Bm Bm D D Bm Bm C# C#' },
    intro: {
      bars: 4,
      chords: 'F#m D A E',
      tracks: { arp: '0.2.4.6.4.2.0.2.', hat: G.sixteen, kick: R(2) + '|' + G.four + '|' + G.four, fx: G.rise },
    },
    // a figure that turns back on itself and climbs, like the course
    lead: bars(
      'c#6 - b5 - c#6 - e6 - - - c#6 - b5 - a5 -', 'f#5 - - - a5 - - - d6 - - - - - . .',
      'c#6 - b5 - c#6 - e6 - - - c#6 - b5 - a5 -', 'g#5 - - - b5 - - - e6 - - - - - . .',
      'c#6 - b5 - c#6 - f#6 - - - e6 - c#6 - a5 -', 'f#6 - - - e6 - - - d6 - - - a5 - - -',
      'e6 - - - c#6 - - - a5 - - - c#6 - e6 -', 'g#6 - - - - - - - b6 - - - - - . .',
    ),
    lead2: bars(
      'c#6 - b5 - c#6 - e6 - - - c#6 - b5 - a5 -', 'f#5 - - - a5 - - - d6 - - - f#6 - a6 -',
      'c#6 - b5 - c#6 - e6 - - - c#6 - b5 - a5 -', 'g#5 - - - b5 - - - e6 - - - g#6 - b6 -',
      'c#7 - b6 - c#7 - f#6 - - - e6 - c#6 - a5 -', 'f#6 - - - e6 - - - d6 - - - a5 - - -',
      'e6 - - - c#6 - - - a5 - - - c#6 - e6 -', 'g#6 - - - - - - - b6 - - - - - . .',
    ),
    counter: bars(
      'a6 - - - - - - - - - - - f#6 - - -', 'f#6 - - - - - - - - - - - - - - -',
      'e6 - - - - - - - - - - - c#6 - - -', 'e6 - - - - - - - g#6 - - - - - - -',
      'a6 - - - - - - - c#7 - - - - - - -', 'a6 - - - - - - - f#6 - - - - - - -',
      'e6 - - - - - - - a6 - - - - - - -', 'b6 - - - - - - - - - - - - - - -',
    ),
    arpA: '0.2.4.6.4.2.0.2.',
    extraA: { 'gtr!hot': '', 'stab!hot': '..x...x...x...x.' },
    tune: bars(
      'a5 - - - d6 - - - f#6 - - - a6 - - -', 'b5 - - - e6 - - - g#6 - - - b6 - - -',
      'c#7 - - - a6 - - - f#6 - - - c#6 - - -', 'f#6 - - - - - - - . . . . . . . .',
      'a5 - - - d6 - - - f#6 - - - a6 - - -', 'b5 - - - e6 - - - g#6 - - - b6 - - -',
      'c#7 - - - g#6 - - - f6 - - - c#6 - - -', 'c#6 - - - - - - - . . . . . . . .',
    ),
    redB: bars(
      'f#5 - - - - - - - a5 - - - - - - -', 'g#5 - - - - - - - b5 - - - - - - -',
      'a5 - - - - - - - - - - - - - - -', 'a5 - - . a5 . c#6 . b5 - - - a5 - - -',
      'f#5 - - - - - - - a5 - - - - - - -', 'g#5 - - - - - - - b5 - - - - - - -',
      'g#5 - - - - - - - - - - - f5 - - -', 'f5 - - - - - - - g#5 - - - - - - -',
    ),
    stabB: '',
    extraB: { gtr: 'x..x..x...x.x...' },
    bridge: bars(
      'd6 - - - - - - - c#6 - - - b5 - - -', 'f#5 - - - - - - - - - - - . . . .',
      'a5 - - - - - - - b5 - - - d6 - - -', 'f#6 - - - - - - - - - - - . . . .',
      'd6 - - - - - - - e6 - - - f#6 - - -', 'b6 - - - - - - - a6 - - - f#6 - - -',
      'f6 - - - - - - - g#6 - - - c#7 - - -', 'c#7 - - - - - - - - - - - - - - -',
    ),
    brk: {
      bars: 4,
      chords: 'F#m D Bm C#',
      tracks: { pad: 'x---------------', bells: bars('f#5 - - - a5 - - - c#6 - - - . . . .', 'd6 - - - - - - - . . . . . . . .', 'b5 - - - d6 - - - f#6 - - - . . . .', 'f6 - - - - - - - . . . . . . . .'), fx: G.rise },
    },
  }),

  // ------------------------------------------------------------------ 09 / 10
  ruins: race({
    name: 'Echo Ruins',
    bpm: 128,
    tonic: 55,
    kit: { kick: 'punch', snare: 'fat' },
    band: { bassCut: 800 },
    chords: { A: 'Gm Eb Bb F', B: 'Eb F Gm Gm Eb F D D', C: 'Cm Cm Gm Gm Ab Ab D D' },
    // half-time verses, four-on-the-floor choruses
    kickA: 'x.........x.....',
    snareA: G.half,
    bassA: 'x.....x...x.....',
    intro: {
      bars: 4,
      chords: 'Gm Eb Bb F',
      tracks: { choir: 'x---------------', bells: bars('d5 - - - g5 - - - bb5 - - - . . . .', 'g5 - - - - - - - . . . . . . . .', 'f5 - - - bb5 - - - d6 - - - . . . .', 'c6 - - - - - - - . . . . . . . .'), fx: G.rise },
    },
    lead: bars(
      'g5 - - - - - d5 - g5 - bb5 - a5 - g5 -', 'eb5 - - - - - - - g5 - - - bb5 - - -',
      'f5 - - - - - d5 - f5 - bb5 - c6 - d6 -', 'c6 - - - - - - - a5 - - - f5 - - -',
      'g5 - - - - - d5 - g5 - bb5 - a5 - g5 -', 'eb5 - - - - - - - g5 - - - eb6 - - -',
      'd6 - - - c6 - - - bb5 - - - a5 - f5 -', 'g5 - - - - - - - . . . . . . . .',
    ),
    counter: bars(
      'bb5 - - - - - - - d6 - - - - - - -', 'g5 - - - - - - - bb5 - - - - - - -',
      'd6 - - - - - - - f6 - - - - - - -', 'c6 - - - - - - - a5 - - - - - - -',
      'd6 - - - - - - - g6 - - - - - - -', 'bb6 - - - - - - - g6 - - - - - - -',
      'f6 - - - - - - - d6 - - - - - - -', 'c6 - - - - - - - . . . . . . . .',
    ),
    tune: bars(
      'bb5 - - . g5 - - . eb5 - g5 - bb5 - - .', 'c6 - - . a5 - - . f5 - a5 - c6 - - .',
      'd6 - - - bb5 - - - g5 - - - bb5 - d6 -', 'g6 - - - - - - - . . . . . . . .',
      'bb5 - - . g5 - - . eb5 - g5 - bb5 - - .', 'c6 - - . a5 - - . f5 - a5 - c6 - - .',
      'f#6 - - - d6 - - - a5 - - - c6 - f#6 -', 'd6 - - - - - - - . . . . . . . .',
    ),
    redB: bars(
      'g5 - - - - - - - bb5 - - - - - - -', 'a5 - - - - - - - c6 - - - - - - -',
      'bb5 - - - - - - - - - - - - - - -', 'bb5 - - . bb5 . a5 . g5 - - - d5 - - -',
      'g5 - - - - - - - bb5 - - - - - - -', 'a5 - - - - - - - c6 - - - - - - -',
      'f#5 - - - - - - - a5 - - - - - - -', 'a5 - - - - - - - - - - - - - - -',
    ),
    bridge: bars(
      'g5 - - - - - - - eb6 - - - - - - -', 'd6 - - - c6 - - - - - - - . . . .',
      'bb5 - - - - - - - d6 - - - - - - -', 'g6 - - - - - - - - - - - . . . .',
      'c6 - - - - - - - eb6 - - - - - - -', 'ab6 - - - - - - - g6 - - - eb6 - - -',
      'f#6 - - - - - - - a6 - - - - - - -', 'd7 - - - - - - - - - - - - - - -',
    ),
    brk: {
      bars: 4,
      chords: 'Gm Eb Cm D',
      tracks: { pad: 'x---------------', arp: '0.2.4.2.5.4.2.1.', kick: 'x.......x.......', fx: G.rise },
    },
  }),
};

// The title plays the main theme; some courses play another take on a song from elsewhere in the game.
Object.assign(SONGS, {
  title: remix(SONGS.drive, { name: 'Retro Shift (Main Theme)' }),
  tunnelB: remix(SONGS.tunnel, { name: 'Tunnel Vision (Orbit Mix)', transpose: -2, bpm: 142, kit: { kick: 'punch', snare: 'crack' }, band: { bass: 'acid', bassCut: 900, bassVol: 0.65, arp: 'bell' } }),
  helixB: remix(SONGS.helix, { name: 'Helix (Fractal Mix)', transpose: -1, bpm: 146, kit: { kick: 'punch', snare: 'crack' }, band: { bass: 'acid', bassCut: 800, bassVol: 0.65 } }),
  ruinsB: remix(SONGS.ruins, { name: 'Echo Ruins (Lattice Mix)', transpose: 2, bpm: 132, kit: { kick: 'punch', snare: 'crack' }, band: { lead: 'surf', arp: 'bell' } }),
});

// Which song plays on which course.
export const COURSE_SONG = {
  core: 'drive',
  layered: 'circuit',
  tunnels: 'tunnel',
  orbital: 'tunnelB',
  city: 'neon',
  void: 'grid',
  helix: 'helix',
  fractal: 'helixB',
  lattice: 'ruinsB',
  ruins: 'ruins',
  marblerun: 'helixB',
};

const STING_MIX = {
  ...DRUMS,
  brass: { inst: 'supersaw', mode: 'notes', vol: 0.8, verb: 0.3 },
  saw: { inst: 'pulse', mode: 'notes', vol: 0.4, verb: 0.3, copy: 'brass', transpose: 12 },
  pad: { inst: 'pad', mode: 'chord', oct: 4, vol: 1, verb: 0.4 },
  bells: { inst: 'bell', mode: 'arp', oct: 5, vol: 0.6, verb: 0.4, pan: 0.3 },
  sub: { inst: 'sub', mode: 'notes', vol: 0.9 },
};

export const STINGERS = {
  win: {
    name: 'Win',
    bpm: 128,
    tonic: 57,
    mix: STING_MIX,
    parts: {
      a: {
        bars: 2,
        chords: 'A A',
        tracks: {
          brass: 'e4 . e4 . a4 . c#5 - - . b4 . c#5 . e5 . | a5 - - - - - - - - - - - - - - -',
          saw: '',
          pad: R(1) + '|x---------------',
          bells: R(1) + '|0123456789......',
          sub: RN(1) + ' | a1 - - - - - - - - - - - - - - -',
          kick: 'x...x...x...x...|x...............',
          snare: '....x.......x.xx|x...............',
          tom: '........h.h.m.l.|................',
          crash: R(1) + '|x...............',
        },
      },
    },
    form: ['a'],
  },
  lose: {
    name: 'Lose',
    bpm: 96,
    tonic: 57,
    mix: STING_MIX,
    parts: {
      a: {
        bars: 2,
        chords: 'Am Fm',
        tracks: {
          brass: 'e5 - - - d#5 - - - d5 - - - c#5 - - - | c5 - - - - - - - - - - - . . . .',
          pad: R(1) + '|x-----------....',
          sub: 'a1 - - - - - - - - - - - - - - - | f1 - - - - - - - - - - - . . . .',
          tom: 'l...............|l...............',
        },
      },
    },
    form: ['a'],
  },
  finalLap: {
    name: 'Final Lap',
    bpm: 150,
    tonic: 57,
    mix: STING_MIX,
    parts: {
      a: {
        bars: 1,
        chords: 'A5',
        tracks: {
          brass: 'a4 . a4 . a4 . e5 - - - - - - - . .',
          saw: '',
          tom: 'h.m.l...........',
          crash: '......x.........',
          kick: '......x.........',
        },
      },
    },
    form: ['a'],
  },
};
