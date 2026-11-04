// The red/blue shift, carried over from LAST LINE's 3-D matinee (scene 6-0, `phasedEye` in lastline/js/world/scene.js).
// There, a thing drawn for one eye only was there only while that eye was looking. Here every piece of the world is
// drawn for one or both worlds, and each racer looks through one of three lenses:
//
//   BOTH  both eyes open: the red world and the blue world overlap, so every road AND every obstacle is there.
//   RED   the red world only: blue roads, blue walls and blue shortcuts are gone (ghosts you can drive through).
//   BLUE  the blue world only: red things are gone.
//
// Pieces carry a mask of the lenses they are solid in. Looking through a single lens wears you out (the matinee's
// "winking wears you out"), so RED and BLUE drain SHIFT energy and BOTH recharges it.

export const BOTH = 1;
export const RED = 2;
export const BLUE = 4;
export const MODES = [BOTH, RED, BLUE];
export const MODE_NAME = { [BOTH]: 'BOTH', [RED]: 'RED', [BLUE]: 'BLUE' };

// Masks used in track data.
export const M = {
  ALL: BOTH | RED | BLUE, // neutral (white/violet): always there
  R: BOTH | RED, // the red world: there unless you look through blue
  B: BOTH | BLUE, // the blue world: there unless you look through red
  RO: RED, // red lens only: hidden in the overlap, a secret of the red world
  BO: BLUE, // blue lens only
  X: BOTH, // the overlap only: interference, gone in either single world
};

export const COLORS = {
  red: 0xff2a4a,
  redHot: 0xff6a7a,
  blue: 0x1e8cff,
  blueHot: 0x6ac8ff,
  white: 0xe8dcff,
  violet: 0xb04cff,
  pink: 0xff4fd8,
};

export function colorForMask(mask) {
  switch (mask) {
    case M.R:
    case M.RO:
      return COLORS.red;
    case M.B:
    case M.BO:
      return COLORS.blue;
    case M.X:
      return COLORS.violet;
    default:
      return COLORS.white;
  }
}

// Is a piece with this mask solid for someone looking through this lens?
export const solidIn = (mask, mode) => (mask & mode) !== 0;

// Energy: seconds of single-lens time in a full bar, and the BOTH recharge rate.
export const SHIFT = {
  drain: 1 / 7,
  recharge: 1 / 9,
  shard: 0.3,
  minToShift: 0.12,
  // Mono Run: no BOTH, no drain or recharge; each swap between RED and BLUE costs this much.
  monoCost: 0.16,
};

// The 3 lens tints (UI, fog, ground grid).
export const MODE_TINT = {
  [BOTH]: { fog: 0x0b0418, grid: 0x8a3cff, sun: [0xff3a7a, 0x3a6aff], css: '#b04cff' },
  [RED]: { fog: 0x170309, grid: 0xff2a4a, sun: [0xff2a4a, 0xff8a3a], css: '#ff2a4a' },
  [BLUE]: { fog: 0x020a1a, grid: 0x1e8cff, sun: [0x1e8cff, 0x6ae0ff], css: '#1e8cff' },
};
