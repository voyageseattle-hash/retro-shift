// Style demos for choosing Retro Shift's own sound (not used in game yet). Same song format as songs.js.
const R = (bars) => '.'.repeat(16 * bars);
const bars = (...b) => b.join(' | ');
const rep = (bar, n, last = null) => Array(n).fill(bar).map((b, i) => (i === n - 1 && last ? last : b)).join('|');
const song = (def) => ({ hotTempo: 1.06, loop: 0, ...def });

// ------------------------------------------------------------------ 1. DRIVE-IN MATINEE
// The red/blue glasses came from 1950s 3-D movies, so: a surf-rock band on the red side, a sci-fi theremin, vibes and
// combo organ on the blue side.
const matinee = song({
  name: 'Drive-In Matinee',
  bpm: 152,
  tonic: 64,
  delayBeats: 0.5,
  kit: { kick: 'punch', snare: 'tight' },
  mix: {
    kick: { drum: 'kick', vol: 0.55 },
    snare: { drum: 'snare', vol: 1.4, verb: 0.3 },
    ride: { drum: 'ride', vol: 1.3, pan: 0.3 },
    tom: { drum: 'tom', vol: 0.45, verb: 0.3 },
    crash: { drum: 'crash', vol: 0.7, pan: -0.25, verb: 0.3 },
    lead: { inst: 'surf', mode: 'notes', vol: 1.2, verb: 0.5, delay: 0.22, pan: -0.15, world: 'red' },
    rhythm: { inst: 'guitar', mode: 'chord', rootOnly: true, oct: 3, vol: 1.2, pan: 0.4, world: 'red' },
    bass: { inst: 'upright', mode: 'bass', oct: 2, vol: 0.9, world: 'red' },
    theremin: { inst: 'theremin', mode: 'notes', vol: 0.7, verb: 0.55, delay: 0.25, pan: 0.15, world: 'blue' },
    organ: { inst: 'organ', mode: 'chord', oct: 4, vol: 0.6, pan: -0.35, verb: 0.2, world: 'blue' },
    vibes: { inst: 'vibes', mode: 'arp', oct: 5, vol: 0.9, pan: 0.4, verb: 0.4, world: 'blue' },
  },
  parts: {
    A: {
      bars: 8,
      chords: 'Em C Am B7',
      crash: true,
      tracks: {
        lead: bars(
          'e5 . g5 . b5 - - . a5 . g5 . f#5 . g5 .', 'e5 - - - - - . . c6 c6 c6 c6 b5 b5 b5 b5',
          'a5 . c6 . e6 - - . d6 . c6 . b5 . c6 .', 'b5 b5 b5 b5 b5 b5 b5 b5 a5 a5 g5 g5 f#5 f#5 d#5 d#5',
          'e5 . g5 . b5 . . . e6 . d6 . b5 . g5 .', 'e6 - - - - - . . g6 g6 g6 g6 e6 e6 e6 e6',
          'c6 . e6 . a6 - - . g6 . e6 . c6 . a5 .', 'b5 - - - - - - - f#5 - - - d#5 - - -',
        ),
        theremin: bars(
          'b5 - - - - - - - - - - - g5 - - -', 'g5 - - - - - - - e5 - - - - - - -',
          'e6 - - - - - - - - - - - c6 - - -', 'd#6 - - - - - - - - - - - f#6 - - -',
          'g6 - - - - - - - - - - - e6 - - -', 'e6 - - - - - - - g6 - - - - - - -',
          'a6 - - - - - - - e6 - - - - - - -', 'f#6 - - - - - - - d#6 - - - - - - -',
        ),
        rhythm: '..x...x...x...x.',
        bass: 'x...5...o...5...',
        organ: '..x...x...x...x.',
        vibes: '0...2...1...3...',
        kick: 'x.......x.x.....',
        snare: rep('....x.......x...', 8, '....x...x.x.xxxx'),
        ride: 'x.x.x.x.x.x.x.x.',
        tom: R(7) + '|........h.m.l.l.',
      },
    },
    B: {
      bars: 8,
      chords: 'C D Em Em C D B7 B7',
      crash: true,
      tracks: {
        lead: bars(
          'c5 . c5 . e5 . g5 . c6 - - - . . . .', 'd5 . d5 . f#5 . a5 . d6 - - - . . . .',
          'e5 . e5 . g5 . b5 . e6 e6 e6 e6 d6 d6 b5 b5', 'e6 - - - - - - - . . . . . . . .',
          'c5 . c5 . e5 . g5 . c6 - - - . . . .', 'd5 . d5 . f#5 . a5 . d6 - - - . . . .',
          'b4 . b4 . d#5 . f#5 . b5 - - - a5 - - -', 'b5 b5 b5 b5 a5 a5 a5 a5 f#5 f#5 f#5 f#5 d#5 d#5 d#5 d#5',
        ),
        theremin: bars(
          'e6 - - - - - - - g6 - - - - - - -', 'f#6 - - - - - - - a6 - - - - - - -',
          'b6 - - - - - - - - - - - g6 - - -', 'e6 - - - - - - - - - - - - - - -',
          'g6 - - - - - - - e6 - - - c6 - - -', 'd6 - - - - - - - f#6 - - - a6 - - -',
          'a6 - - - - - - - f#6 - - - d#6 - - -', 'b5 - - - - - - - - - - - - - - -',
        ),
        bass: 'x...3...5...3...',
        organ: 'x---------------',
        vibes: '0.1.2.3.2.1.0.1.',
        kick: 'x...x...x...x...',
        snare: rep('....x.......x...', 8, 'x.x.x.x.xxxxxxxx'),
        ride: 'x.x.x.x.x.x.x.x.',
      },
    },
  },
  form: ['A', 'B', 'A'],
});

// ------------------------------------------------------------------ 2. ANAGLYPH CHIP
// A handheld console from an alternate 1995 with a red screen and a blue one: narrow, buzzy pulse waves on the red
// side, round squares and a triangle on the blue side, noise drums in both.
const chip = song({
  name: 'Anaglyph Chip',
  bpm: 150,
  tonic: 62,
  delayBeats: 0.75,
  kit: { kick: 'chip', snare: 'chip', hat: 'chip' },
  mix: {
    kick: { drum: 'kick', vol: 2.2 },
    snare: { drum: 'snare', vol: 1.7 },
    hat: { drum: 'hat', vol: 1.5, pan: 0.15 },
    lead: { inst: 'chip', duty: 0.25, mode: 'notes', vol: 2.4, delay: 0.12, pan: -0.1, world: 'red' },
    rarp: { inst: 'chip', duty: 0.125, mode: 'arp', oct: 5, vol: 1.1, pan: -0.35, world: 'red' },
    pbass: { inst: 'chip', duty: 0.125, mode: 'bass', oct: 2, vol: 1.0, world: 'red' },
    counter: { inst: 'chip', duty: 0.5, mode: 'notes', vol: 1.0, delay: 0.25, pan: 0.2, world: 'blue' },
    barp: { inst: 'chip', duty: 0.5, mode: 'arp', oct: 5, vol: 0.55, pan: 0.4, delay: 0.2, world: 'blue' },
    tbass: { inst: 'chiptri', mode: 'bass', oct: 3, vol: 0.55, world: 'blue' },
  },
  parts: {
    A: {
      bars: 8,
      chords: 'Dm Bb C A',
      tracks: {
        lead: bars(
          'a5 - - . a5 . g5 a5 - - . f5 - - d5 -', 'f5 - - . f5 . e5 f5 - - . d5 - - bb4 -',
          'e5 - - . g5 . c6 - - - . bb5 - a5 g5 -', 'a5 - - - - - - - c#6 - e6 - a6 - - -',
          'a5 - - . a5 . g5 a5 - - . f5 - - d5 -', 'f5 - - . f5 . e5 f5 - - . bb5 - - d6 -',
          'c6 - - . e6 . g6 - - - . e6 - c6 e6 -', 'a6 - - - - - - - . . . . . . . .',
        ),
        counter: bars(
          'f5 - - - - - - - d5 - - - - - - -', 'd5 - - - - - - - f5 - - - - - - -',
          'e5 - - - - - - - g5 - - - - - - -', 'e5 - - - - - - - c#5 - - - - - - -',
          'f5 - - - - - - - a5 - - - - - - -', 'bb5 - - - - - - - f5 - - - - - - -',
          'g5 - - - - - - - e5 - - - - - - -', 'c#5 - - - - - - - e5 - - - - - - -',
        ),
        pbass: 'x.x.o.x.x.x.o.x.',
        tbass: 'x-------5-------',
        barp: '0120120120120120',
        kick: 'x.....x...x.....',
        snare: rep('....x.......x...', 8, '....x.......xxxx'),
        hat: 'x.x.x.x.x.x.x.x.',
      },
    },
    B: {
      bars: 8,
      chords: 'Gm C F A Gm C F A',
      tracks: {
        counter: bars(
          'd6 - - - bb5 - - - g5 - - - bb5 - d6 -', 'e6 - - - c6 - - - g5 - - - c6 - e6 -',
          'f6 - - - - - - - e6 - - - c6 - - -', 'c#6 - - - - - - - e6 - - - a6 - - -',
          'g6 - - - f6 - - - d6 - - - bb5 - - -', 'g6 - - - e6 - - - c6 - - - bb5 - - -',
          'a5 - - - c6 - - - f6 - - - a6 - - -', 'g6 - - - - - - - e6 - - - c#6 - - -',
        ),
        rarp: '0123012301230123',
        pbass: 'x.x.o.x.x.x.o.x.',
        tbass: 'x---5---x---5---',
        kick: 'x...x...x...x...',
        snare: rep('....x.......x...', 8, 'x.x.xxxxxxxxxxxx'),
        hat: 'xxxxxxxxxxxxxxxx',
      },
    },
  },
  form: ['A', 'B', 'A'],
});

// ------------------------------------------------------------------ 3. COIN-OP FUNK
// A 90s arcade cabinet: overdriven lead guitar, slap bass and brass stabs on the red side, FM electric piano and bells
// on the blue side, over a funky breakbeat.
const coinop = song({
  name: 'Coin-Op Funk',
  bpm: 132,
  tonic: 59,
  swing: 0.06,
  delayBeats: 0.75,
  kit: { kick: 'punch', snare: 'crack' },
  mix: {
    kick: { drum: 'kick', vol: 0.6 },
    snare: { drum: 'snare', vol: 1.1, verb: 0.2 },
    hat: { drum: 'hat', vol: 1.5, pan: 0.25 },
    ohat: { drum: 'ohat', vol: 0.9, pan: 0.3 },
    crash: { drum: 'crash', vol: 0.7, pan: -0.25, verb: 0.25 },
    lead: { inst: 'lguitar', mode: 'notes', vol: 1.1, delay: 0.18, verb: 0.2, pan: -0.15, world: 'red' },
    bass: { inst: 'slap', mode: 'bass', oct: 2, vol: 0.65, world: 'red' },
    horns: { inst: 'brass', mode: 'chord', oct: 4, vol: 1.4, pan: -0.3, verb: 0.2, world: 'red' },
    keys: { inst: 'epiano', mode: 'chord', oct: 4, vol: 1.1, verb: 0.25, world: 'blue' },
    melody: { inst: 'epiano', mode: 'notes', vol: 1.4, delay: 0.25, verb: 0.3, pan: 0.2, world: 'blue' },
    bells: { inst: 'bell', mode: 'arp', oct: 6, vol: 0.6, pan: 0.4, delay: 0.3, verb: 0.3, world: 'blue' },
  },
  parts: {
    A: {
      bars: 8,
      chords: 'Bm7 Gmaj7 A F#m7',
      crash: true,
      tracks: {
        lead: bars(
          'f#5 - - - - - d5 - f#5 - a5 - b5 - - -', 'a5 - - - f#5 - - - d5 - - - . . b4 d5',
          'e5 - - - - - c#5 - e5 - a5 - c#6 - - -', 'b5 - a5 - - - f#5 - - - e5 - f#5 - - -',
          'f#5 - - - - - d5 - f#5 - a5 - d6 - - -', 'c#6 - - - b5 - - - a5 - - - f#5 - - -',
          'e5 - - - a5 - - - c#6 - - - e6 - - -', 'f#6 - - - - - - - . . . . . . . .',
        ),
        melody: bars(
          'd6 - - - - - - - c#6 - - - - - - -', 'b5 - - - - - - - f#5 - - - - - - -',
          'c#6 - - - - - - - e6 - - - - - - -', 'a5 - - - - - - - c#6 - - - - - - -',
          'd6 - - - - - - - f#6 - - - - - - -', 'f#6 - - - - - - - d6 - - - - - - -',
          'e6 - - - - - - - c#6 - - - - - - -', 'c#6 - - - - - - - . . . . . . . .',
        ),
        keys: '..x..x....x..x..',
        bass: 'x..x..o.x.x..o..',
        kick: 'x.....x...x..x..',
        snare: rep('....x..o.o..x...', 8, '....x..o.o..xxXX'),
        hat: 'xoxoxoxoxoxoxoxo',
        ohat: '..............x.',
      },
    },
    B: {
      bars: 8,
      chords: 'Em7 F#m7 Gmaj7 A Em7 F#m7 Gmaj7 A7',
      crash: true,
      tracks: {
        melody: bars(
          'g5 - - - b5 - - - d6 - - - e6 - - -', 'a5 - - - c#6 - - - e6 - - - f#6 - - -',
          'f#6 - - - - - - - d6 - - - b5 - - -', 'c#6 - - - - - - - e6 - - - - - - -',
          'g6 - - - f#6 - - - e6 - - - d6 - - -', 'c#6 - - - - - - - e6 - - - f#6 - - -',
          'g6 - - - - - - - f#6 - - - d6 - - -', 'e6 - - - - - - - c#6 - - - - - - -',
        ),
        lead: bars(
          R(1).split('').join(' '), R(1).split('').join(' '), R(1).split('').join(' '), '. . . . . . . . a5 - b5 - c#6 - e6 -',
          R(1).split('').join(' '), R(1).split('').join(' '), R(1).split('').join(' '), '. . . . . . . . g5 - a5 - c#6 - e6 -',
        ),
        horns: 'x..x..x...x.x...',
        bells: '0.2.1.3.2.4.3.1.',
        keys: 'x---------------',
        bass: 'x..x..o.x.x..o..',
        kick: 'x.....x...x..x..',
        snare: rep('....x..o.o..x...', 8, 'x.x.x.xxXxXxXXXX'),
        hat: 'xoxoxoxoxoxoxoxo',
        ohat: '..x...x...x...x.',
      },
    },
  },
  form: ['A', 'B', 'A'],
});

export const DEMOS = { matinee, chip, coinop };
