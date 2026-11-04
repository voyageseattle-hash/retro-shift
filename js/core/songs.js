// The RETRO SHIFT soundtrack, in WEDGEWRECK RALLY's song format (see sequencer.js for the track syntax).
//
// Every song is written as two bands over one rhythm section:
//   world: 'red'   the driving half: bass, saw leads, guitar stabs
//   world: 'blue'  the floating half: pads, glass arps, bells, choir
// In BOTH you hear the whole song. Shift to RED and the blue band sinks behind a wall; shift to BLUE and the red
// band does. Drums are in both worlds. Tracks ending !hot only play on the final lap.

const R = (bars) => '.'.repeat(16 * bars);
const RN = (bars) => Array(16 * bars).fill('.').join(' ');
const bars = (...b) => b.join(' | ');

const DRUMS = {
  kick: { drum: 'kick', vol: 1 },
  snare: { drum: 'snare', vol: 0.8, verb: 0.22 },
  clap: { drum: 'clap', vol: 0.5, verb: 0.3, pan: 0.05 },
  hat: { drum: 'hat', vol: 0.5, pan: 0.22 },
  ohat: { drum: 'ohat', vol: 0.45, pan: 0.28 },
  crash: { drum: 'crash', vol: 0.42, pan: -0.25, verb: 0.25 },
  tom: { drum: 'tom', vol: 0.55, verb: 0.3 },
  fx: { mode: 'fx', vol: 0.8, verb: 0.35 },
};

// A shared synthwave band, red and blue halves.
const BAND = (o = {}) => ({
  ...DRUMS,
  bass: { inst: o.bass || 'bass', mode: 'bass', oct: 2, vol: 0.95, pump: true, cut: o.bassCut || 700, world: 'red' },
  lead: { inst: o.lead || 'supersaw', mode: 'notes', vol: 0.62, delay: 0.24, verb: 0.2, world: 'red', bright: 4200 },
  stab: { inst: 'stab', mode: 'chord', oct: 4, vol: 0.45, pan: -0.3, world: 'red' },
  gtr: { inst: 'guitar', mode: 'chord', rootOnly: true, oct: 3, vol: 0.5, pan: 0.35, world: 'red' },
  pad: { inst: 'pad', mode: 'chord', oct: 4, vol: 0.95, pump: true, verb: 0.35, world: 'blue' },
  arp: { inst: o.arp || 'bell', mode: 'arp', oct: 5, vol: 0.45, pan: 0.35, delay: 0.3, verb: 0.3, world: 'blue' },
  bells: { inst: 'bell', mode: 'notes', vol: 0.7, pan: -0.3, delay: 0.3, verb: 0.4, world: 'blue' },
  choir: { inst: 'choir', mode: 'chord', oct: 4, vol: 0.5, verb: 0.5, world: 'blue' },
  ...(o.extra || {}),
});

// Standard groove pieces.
const G = {
  four: 'x...x...x...x...',
  back: '....x.......x...',
  off: '..x...x...x...x.',
  eights: 'x.x.x.x.x.x.x.x.',
  sixteen: 'xoxoxoxoxoxoxoxo',
  octBass: 'x.o.x.o.x.o.x.oo',
  driveBass: 'xxoxxxoxxxoxxxox',
  roll: R(3) + '|h.h.m.m.l.l.lll.',
  rise: R(3) + '|R---------------',
};

function song(def) {
  return { delayBeats: 0.75, hotTempo: 1.06, loop: 1, ...def };
}

export const SONGS = {
  // ------------------------------------------------------------------ title
  title: song({
    name: 'Retro Shift (Main Theme)',
    bpm: 112,
    tonic: 57,
    kit: { kick: 'punch', snare: 'fat' },
    mix: BAND(),
    parts: {
      intro: {
        bars: 4,
        chords: 'Am F C G',
        tracks: { pad: 'x---------------', arp: '0.2.4.2.5.4.2.1.', hat: G.off, fx: G.rise },
      },
      A: {
        bars: 8,
        chords: 'Am F C G',
        crash: true,
        tracks: {
          lead: bars(
            'a4 - - . e5 - - . a5 - g5 - e5 - - .', 'f5 - - - e5 - c5 - - - . . c5 . d5 .',
            'e5 - - . g5 - - . c6 - b5 - g5 - - .', 'b5 - - - a5 - g5 - - - . . g5 . a5 .',
            'a4 - - . e5 - - . a5 - g5 - e5 - - .', 'f5 - - - a5 - c6 - - - . . c6 . d6 .',
            'e6 - - - d6 - - - c6 - - - b5 - g5 -', 'a5 - - - - - - - . . . . . . . .',
          ),
          bass: G.octBass,
          kick: G.four,
          snare: G.back,
          hat: G.eights,
          pad: 'x---------------',
          arp: '0.2.4.2.0.2.4.2.',
        },
      },
      B: {
        bars: 4,
        chords: 'Am F C G',
        tracks: { bells: bars('e5 . a5 . c6 . e6 - - . d6 . c6 . b5 .', 'a5 - - - c6 - - - f5 - - - . . . .', 'g5 . c6 . e6 . g6 - - . f6 . e6 . d6 .', 'b5 - - - d6 - - - g5 - - - . . . .'), pad: 'x---------------', kick: 'x.......x.......', hat: G.off, fx: G.rise },
      },
    },
    form: ['intro', 'A', 'B'],
  }),

  // ------------------------------------------------------------------ 01 / 02
  circuit: song({
    name: 'Core Circuit',
    bpm: 118,
    tonic: 57,
    kit: { kick: 'punch', snare: 'fat' },
    mix: BAND(),
    parts: {
      intro: {
        bars: 4,
        chords: 'Am F C G',
        tracks: { arp: '0.1.2.3.4.3.2.1.', kick: R(2) + '|' + G.four + '|' + G.four, bass: R(2) + '|x.......x.......|x.......x...x.x.', hat: G.off, fx: G.rise },
      },
      A: {
        bars: 8,
        chords: 'Am F C G',
        crash: true,
        tracks: {
          lead: bars(
            'a5 . a5 . e5 . a5 . c6 - b5 - a5 - e5 -', 'f5 . f5 . c5 . f5 . a5 - g5 - f5 - c5 -',
            'g5 . g5 . e5 . g5 . c6 - d6 - e6 - c6 -', 'd6 - - - b5 - - - g5 - - - d5 - g5 -',
            'a5 . a5 . e5 . a5 . c6 - b5 - a5 - e5 -', 'f5 . f5 . c5 . f5 . a5 - c6 - f6 - e6 -',
            'e6 - d6 - c6 - b5 - c6 - d6 - e6 - g6 -', 'a6 - - - - - - - e6 - - - - - - -',
          ),
          bass: G.octBass,
          kick: G.four,
          snare: G.back,
          hat: G.eights,
          ohat: '..............x.',
          pad: 'x---------------',
          'gtr!hot': 'x..x..x...x.x...',
          tom: R(7) + '|' + G.roll.split('|')[1],
        },
      },
      B: {
        bars: 8,
        chords: 'F G Am Am F G C E',
        crash: true,
        tracks: {
          bells: bars(
            'c6 - - . a5 - - . f5 - a5 - c6 - - .', 'd6 - - . b5 - - . g5 - b5 - d6 - - .',
            'e6 - - - c6 - - - a5 - - - c6 - e6 -', 'a6 - - - - - - - . . . . e6 . a6 .',
            'c6 - - . a5 - - . f5 - a5 - c6 - - .', 'd6 - - . b5 - - . g5 - b5 - d6 - - .',
            'e6 - - - g6 - - - c7 - - - g6 - e6 -', 'g#6 - - - - - - - b6 - - - g#6 - - -',
          ),
          choir: 'x---------------',
          arp: '0.1.2.3.2.1.2.3.',
          stab: 'x..x..x...x.x...',
          bass: 'x.x.x.x.x.x.x.xo',
          kick: G.four,
          snare: G.back,
          clap: G.back,
          hat: G.sixteen,
          tom: G.roll,
        },
      },
      break: {
        bars: 4,
        chords: 'Am F C E',
        tracks: { pad: 'x---------------', arp: '0.2.4.2.5.4.2.1.', kick: 'x.......x.......', bass: 'x-------x-------', fx: G.rise },
      },
    },
    form: ['intro', 'A', 'B', 'A', 'break'],
  }),

  // ------------------------------------------------------------------ 03 / 04
  tunnel: song({
    name: 'Tunnel Vision',
    bpm: 124,
    tonic: 62,
    kit: { kick: 'punch', snare: 'fat' },
    mix: BAND({ bass: 'acid', bassCut: 900, lead: 'hoover' }),
    parts: {
      intro: {
        bars: 4,
        chords: 'Dm Dm Bb C',
        tracks: { bass: G.driveBass, hat: G.sixteen, kick: R(2) + '|' + G.four + '|' + G.four, fx: G.rise },
      },
      A: {
        bars: 8,
        chords: 'Dm Bb F C',
        crash: true,
        tracks: {
          lead: bars(
            'd5 - - - - - f5 - a5 - - - g5 - f5 -', 'bb4 - - - - - d5 - f5 - - - e5 - d5 -',
            'c5 - - - f5 - - - a5 - c6 - a5 - f5 -', 'e5 - - - - - - - g5 - - - c6 - - -',
            'd5 - - - - - f5 - a5 - - - g5 - f5 -', 'bb4 - - - - - d5 - f5 - - - bb5 - a5 -',
            'a5 - - - c6 - - - f6 - - - e6 - c6 -', 'd6 - - - - - - - . . . . . . . .',
          ),
          bass: G.driveBass,
          kick: G.four,
          snare: G.back,
          hat: G.sixteen,
          pad: 'x---------------',
          arp: '0.2.4.6.4.2.0.2.',
          'stab!hot': '..x...x...x...x.',
        },
      },
      B: {
        bars: 8,
        chords: 'Bb C Dm Dm Bb C A A',
        crash: true,
        tracks: {
          bells: bars(
            'f5 . bb5 . d6 . f6 - - . e6 . d6 . c6 .', 'e5 . g5 . c6 . e6 - - . d6 . c6 . bb5 .',
            'a5 - - - d6 - - - f6 - - - a6 - - -', 'f6 - - - e6 - - - d6 - - - a5 - - -',
            'f5 . bb5 . d6 . f6 - - . e6 . d6 . c6 .', 'e5 . g5 . c6 . e6 - - . g6 . e6 . c6 .',
            'c#6 - - - e6 - - - a6 - - - g6 - e6 -', 'a6 - - - - - - - . . . . . . . .',
          ),
          choir: 'x---------------',
          gtr: 'x..x..x...x.x...',
          bass: 'x.x.x.x.x.x.x.xo',
          kick: G.four,
          snare: G.back,
          clap: G.back,
          hat: G.sixteen,
          tom: G.roll,
        },
      },
      break: {
        bars: 4,
        chords: 'Dm Bb Gm A',
        tracks: { pad: 'x---------------', arp: '0.1.2.3.4.3.2.1.', kick: 'x.......x.......', fx: G.rise },
      },
    },
    form: ['intro', 'A', 'B', 'A', 'break'],
  }),

  // ------------------------------------------------------------------ 05 / 06
  grid: song({
    name: 'Neon Grid',
    bpm: 120,
    swing: 0.04,
    tonic: 64,
    kit: { kick: 'punch', snare: 'fat' },
    mix: BAND({ bass: 'reese', bassCut: 800, arp: 'pluck' }),
    parts: {
      intro: {
        bars: 4,
        chords: 'Em C G D',
        tracks: { arp: '0123432101234321', pad: 'x---------------', fx: G.rise },
      },
      A: {
        bars: 8,
        chords: 'Em C G D',
        crash: true,
        tracks: {
          lead: bars(
            'e5 - - . b5 - - . e6 - d6 - b5 - g5 -', 'c6 - - - b5 - g5 - e5 - - - . . . .',
            'd5 - - . g5 - - . b5 - a5 - g5 - d5 -', 'f#5 - - - a5 - - - d6 - - - . . . .',
            'e5 - - . b5 - - . e6 - d6 - b5 - g5 -', 'c6 - - - e6 - g6 - e6 - - - . . . .',
            'd6 - - - b5 - - - g5 - - - b5 - d6 -', 'e6 - - - - - - - . . . . . . . .',
          ),
          bass: 'x...x.x.x...x.o.',
          kick: 'x...x...x...x..x',
          snare: G.back,
          hat: G.eights,
          ohat: G.off,
          arp: '0123432101234321',
          'gtr!hot': 'x..x..x...x.x...',
        },
      },
      B: {
        bars: 8,
        chords: 'C D Em Em C D B B',
        crash: true,
        tracks: {
          bells: bars(
            'g5 - - . c6 - - . e6 - - . g6 - - .', 'a5 - - . d6 - - . f#6 - - . a6 - - .',
            'b6 - - - g6 - - - e6 - - - b5 - - -', 'e6 - - - - - - - . . . . . . . .',
            'g5 - - . c6 - - . e6 - - . g6 - - .', 'a5 - - . d6 - - . f#6 - - . a6 - - .',
            'b6 - - - a6 - - - f#6 - - - d#6 - - -', 'b5 - - - - - - - . . . . . . . .',
          ),
          choir: 'x---------------',
          stab: 'x..x..x...x.x...',
          bass: 'x.x.x.x.x.x.x.xo',
          kick: G.four,
          snare: G.back,
          clap: G.back,
          hat: G.sixteen,
          tom: G.roll,
        },
      },
      break: {
        bars: 4,
        chords: 'Em C Am B',
        tracks: { pad: 'x---------------', arp: '0.2.4.2.5.4.2.1.', kick: 'x.......x.......', bass: 'x-------x-------', fx: G.rise },
      },
    },
    form: ['intro', 'A', 'B', 'A', 'break'],
  }),

  // ------------------------------------------------------------------ 07 / 08
  helix: song({
    name: 'Helix',
    bpm: 128,
    tonic: 66,
    kit: { kick: 'punch', snare: 'fat' },
    mix: BAND({ bass: 'bass', lead: 'pulse' }),
    parts: {
      intro: {
        bars: 4,
        chords: 'F#m D A E',
        tracks: { arp: '0.2.4.6.4.2.0.2.', hat: G.sixteen, kick: R(2) + '|' + G.four + '|' + G.four, fx: G.rise },
      },
      A: {
        bars: 8,
        chords: 'F#m D A E',
        crash: true,
        tracks: {
          lead: bars(
            'f#5 . a5 . c#6 . f#6 . e6 . c#6 . a5 . c#6 .', 'd6 . a5 . f#5 . a5 . d6 - - - . . . .',
            'e5 . a5 . c#6 . e6 . d6 . c#6 . a5 . c#6 .', 'b5 . g#5 . e5 . g#5 . b5 - - - . . . .',
            'f#5 . a5 . c#6 . f#6 . e6 . c#6 . a5 . c#6 .', 'd6 . a5 . f#5 . a5 . d6 . e6 . f#6 . a6 .',
            'e6 - - - c#6 - - - a5 - - - c#6 - e6 -', 'f#6 - - - - - - - . . . . . . . .',
          ),
          bass: G.octBass,
          kick: G.four,
          snare: G.back,
          hat: G.sixteen,
          pad: 'x---------------',
          'stab!hot': '..x...x...x...x.',
        },
      },
      B: {
        bars: 8,
        chords: 'D E F#m F#m D E C# C#',
        crash: true,
        tracks: {
          bells: bars(
            'a5 - - - d6 - - - f#6 - - - a6 - - -', 'b5 - - - e6 - - - g#6 - - - b6 - - -',
            'c#7 - - - a6 - - - f#6 - - - c#6 - - -', 'f#6 - - - - - - - . . . . . . . .',
            'a5 - - - d6 - - - f#6 - - - a6 - - -', 'b5 - - - e6 - - - g#6 - - - b6 - - -',
            'c#7 - - - g#6 - - - f6 - - - c#6 - - -', 'c#6 - - - - - - - . . . . . . . .',
          ),
          choir: 'x---------------',
          arp: '0.1.2.3.2.1.2.3.',
          gtr: 'x..x..x...x.x...',
          bass: 'x.x.x.x.x.x.x.xo',
          kick: G.four,
          snare: G.back,
          clap: G.back,
          hat: G.sixteen,
          tom: G.roll,
        },
      },
      break: {
        bars: 4,
        chords: 'F#m D Bm C#',
        tracks: { pad: 'x---------------', bells: bars('f#5 - - - a5 - - - c#6 - - - . . . .', 'd6 - - - - - - - . . . . . . . .', 'b5 - - - d6 - - - f#6 - - - . . . .', 'f6 - - - - - - - . . . . . . . .'), fx: G.rise },
      },
    },
    form: ['intro', 'A', 'B', 'A', 'break'],
  }),

  // ------------------------------------------------------------------ 09 / 10
  ruins: song({
    name: 'Echo Ruins',
    bpm: 110,
    tonic: 55,
    kit: { kick: 'punch', snare: 'fat' },
    mix: BAND({ bass: 'reese', bassCut: 650, lead: 'supersaw' }),
    parts: {
      intro: {
        bars: 4,
        chords: 'Gm Eb Bb F',
        tracks: { choir: 'x---------------', bells: bars('d5 - - - g5 - - - bb5 - - - . . . .', 'g5 - - - - - - - . . . . . . . .', 'f5 - - - bb5 - - - d6 - - - . . . .', 'c6 - - - - - - - . . . . . . . .'), fx: G.rise },
      },
      A: {
        bars: 8,
        chords: 'Gm Eb Bb F',
        crash: true,
        tracks: {
          lead: bars(
            'g5 - - - - - d5 - g5 - bb5 - a5 - g5 -', 'eb5 - - - - - - - g5 - - - bb5 - - -',
            'f5 - - - - - d5 - f5 - bb5 - c6 - d6 -', 'c6 - - - - - - - a5 - - - f5 - - -',
            'g5 - - - - - d5 - g5 - bb5 - a5 - g5 -', 'eb5 - - - - - - - g5 - - - eb6 - - -',
            'd6 - - - c6 - - - bb5 - - - a5 - f5 -', 'g5 - - - - - - - . . . . . . . .',
          ),
          bass: 'x.....x...x.....',
          kick: 'x.....x...x.....',
          snare: G.back,
          hat: G.eights,
          pad: 'x---------------',
          arp: '0.2.4.2.0.2.4.2.',
          'gtr!hot': 'x..x..x...x.x...',
        },
      },
      B: {
        bars: 8,
        chords: 'Eb F Gm Gm Eb F D D',
        crash: true,
        tracks: {
          bells: bars(
            'bb5 - - . g5 - - . eb5 - g5 - bb5 - - .', 'c6 - - . a5 - - . f5 - a5 - c6 - - .',
            'd6 - - - bb5 - - - g5 - - - bb5 - d6 -', 'g6 - - - - - - - . . . . . . . .',
            'bb5 - - . g5 - - . eb5 - g5 - bb5 - - .', 'c6 - - . a5 - - . f5 - a5 - c6 - - .',
            'f#6 - - - d6 - - - a5 - - - c6 - f#6 -', 'd6 - - - - - - - . . . . . . . .',
          ),
          choir: 'x---------------',
          stab: 'x..x..x...x.x...',
          bass: 'x.x.x.x.x.x.x.xo',
          kick: G.four,
          snare: G.back,
          clap: G.back,
          hat: G.sixteen,
          tom: G.roll,
        },
      },
      break: {
        bars: 4,
        chords: 'Gm Eb Cm D',
        tracks: { pad: 'x---------------', arp: '0.2.4.2.5.4.2.1.', kick: 'x.......x.......', fx: G.rise },
      },
    },
    form: ['intro', 'A', 'B', 'A', 'break'],
  }),
};

// Which song plays on which course.
export const COURSE_SONG = {
  core: 'circuit',
  layered: 'circuit',
  tunnels: 'tunnel',
  orbital: 'tunnel',
  city: 'grid',
  void: 'grid',
  helix: 'helix',
  fractal: 'helix',
  lattice: 'ruins',
  ruins: 'ruins',
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
