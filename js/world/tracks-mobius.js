// 11 MÖBIUS STRIP: one road with one side. Lap one runs along the top of the strip, the RED side; the half twist at
// the end of the lap turns the road over, and lap two runs along the underside, the BLUE side, hanging beneath lap
// one's road. A second twist brings you back up to the line. (How it's drawn: mobius.js.)
//
// The course is laid out as one lap and turned over to make the other, so lap two is lap one in a mirror with its
// colours swapped: lap one's left-handers are right-handers, its blue wall is a red wall, its red-only cut is a
// blue-only cut, and where the Blade had a wall to run the Skimmer has a gap to glide. A bridge keeps its colour on
// both sides (it's the same piece of the strip), so a red bridge is the easy one on the RED lap and the trap on the
// BLUE lap.

import { M } from './shift.js';

const H = 12; // the two passes of the twist straight ride this far above and below the strip's middle

// Lap one, [x, z]: up from the line, out round the wing, and back up the twist straight. On the map the two laps lie
// side by side like a butterfly's wings, or the ∞ the strip is drawn as.
const WING = [
  [0, 300], [0, 380], [35, 460], [110, 520], [210, 535], [310, 500], [385, 430], [420, 340],
  [400, 250], [330, 200], [300, 130], [350, 60], [420, 0], [440, -90], [400, -180], [320, -240],
  [220, -250], [130, -215], [60, -170], [15, -115], [0, -50], [0, 30], [0, 110], [0, 190],
];
// The road climbs 2H round the wing, from the lower pass of the twist straight to the upper one (it stays level
// while the two laps still lie over each other at each end); the twist, as it's drawn, gives the height back.
const LAP = WING.map(([x, z], k) => [x, z, -H + 2 * H * Math.min(1, Math.max(0, (k - 2) / 15))]);
const N = LAP.length;
// lap two: lap one turned half a turn about the twist straight
const points = [...LAP, ...LAP.map(([x, z, y]) => [-x, z, -y])];

// The other world's colour, for the other side of the strip.
const SWAP = { [M.R]: M.B, [M.B]: M.R, [M.RO]: M.BO, [M.BO]: M.RO };
const swap = (m) => SWAP[m] ?? m;

const block = (at, lat, mask, size = 3) => ({ type: 'block', at, lat, mask, size });

export const MOBIUS = {
  id: 'mobius',
  num: '11',
  name: 'MÖBIUS STRIP',
  blurb: 'One road, one side. Lap the top in RED, the underside in BLUE.',
  decor: 'mobius',
  seed: 1111,
  // twice round the strip to get back where you started: the RED side, then the BLUE side (a lap is half the loop
  // the engine drives). Each lap is half as long again as a lap of the other courses.
  laps: 2,
  lapSplit: 2,
  sun: 0,
  skyPiece: 'none',
  mobius: { z0: 10, z1: 255, H },
  bankFactor: 0, // a flat strip: what one side banks into a bend, the other side would bank out of it
  floorDrop: 44,
  noPylons: true, // under the road is the other lap's world: nothing reaches down to a floor
  noStorms: true,
  points,
  features: (P) => {
    // a feature of lap one at control point k, and the same place on lap two
    const both = (fn) => [fn((k, t) => P(k, t), 1, (m) => m), fn((k, t) => P(k + N, t), -1, swap)];
    const each = (fn) => both(fn).flat();
    const branches = [
      // the cut: straight on where the road kinks in, in this side's lens only (covers.js hides its mouth in the others)
      ...both((p, s, c) => ({ from: p(7, 0.5), to: p(11, 0.5), mask: c(M.RO), side: s, lift: 5, label: c(M.RO) === M.RO ? 'RED CUT' : 'BLUE CUT' })),
      // the form routes, inside the first bend: on the RED side a wall only the Blade rides, and under it on the BLUE
      // side a gap only the Skimmer glides
      { from: P(2, 0.3), to: P(5, 0.2), mask: M.ALL, side: -1, lift: 6, label: 'WALL RUN', sub: 'RED CLINGS · OTHERS FALL', wallrun: { from: 0.28, to: 0.76, bank: 0.95 } },
      { from: P(2 + N, 0.3), to: P(5 + N, 0.2), mask: M.ALL, side: 1, lift: 4, label: 'GLIDE GAP', sub: 'BLUE FLOATS IT', profile: [{ at: 0.5, kind: 'step', drop: 3.5, len: 55, end: 0.82 }] },
      // and the other world's secret on each side: a line inside the far bend that only the other lens has
      ...both((p, s, c) => ({ from: p(13, 0.1), to: p(15, 0.7), mask: c(M.BO), side: -s, lift: 4, label: c(M.BO) === M.BO ? 'BLUE LINE' : 'RED LINE' })),
    ];
    return {
      branches,
      gaps: [
        // a red bridge and a blue bridge, each the same piece of the strip on both sides
        ...each((p) => [{ at: p(12, 0.3), len: 40, mask: M.R, noRails: true }, { at: p(16, 0.4), len: 40, mask: M.B, noRails: true }]),
        { path: 'b3', at: 0.5, len: 48, glide: true, noRails: true },
      ],
      obstacles: [
        // one wall a lap, in the other side's colour: the lens of the side you're on goes through it
        ...both((p, s, c) => ({ type: 'wall', at: p(5, 0.7), mask: c(M.B) })),
        // a few blocks on the way back to the twist
        // (to the sides: the middle stays open for whoever comes off the blue bridge with nothing left to shift on)
        ...each((p, s, c) => [block(p(17, 0.75), 0.6 * s, c(M.R)), block(p(18, 0.1), -0.6 * s, c(M.B)), block(p(18, 0.5), 0.55 * s, c(M.R), 3.4)]),
        // and gates down the twist, a slalom through the corkscrew (or shift through them)
        ...each((p, s, c) => [0, 1, 2, 3].map((k) => ({ type: 'gate', at: p(21, 0.4) + k * 0.009, mask: c(k % 2 ? M.R : M.B), lat: (k % 2 ? 1 : -1) * s }))),
      ],
      boosts: [
        ...each((p, s, c) => [
          { at: p(0, 0.6) },
          { at: p(6, 0.5), lat: -0.4 * s, mask: c(M.RO) },
          { at: p(11, 0.8), lat: 0.35 * s },
          { at: p(15, 0.9), lat: 0.3 * s, mask: c(M.RO) },
          { at: p(19, 0.2), lat: -0.3 * s, mask: c(M.BO) },
          { at: p(20, 0.4) },
          { at: p(23, 0.5), mask: c(M.RO) },
        ]),
        { path: 'b3', at: 0.8 },
      ],
      shards: [
        ...each((p, s, c) => [
          { at: p(1, 0.5), n: 3 },
          { at: p(9, 0.2), lat: 0.4 * s, n: 3 },
          { at: p(13, 0.6), lat: 0.5 * s, n: 3, mask: c(M.B) },
          { at: p(22, 0.6), n: 4, gap: 0.004 },
        ]),
      ],
      // the course says it on its own boards: before each twist, and as each side begins
      signs: [
        { at: P(20, 0.1), title: 'THE TWIST', sub: 'THE ROAD TURNS OVER', mask: M.ALL },
        { at: P(20 + N, 0.1), title: 'THE TWIST', sub: 'THE ROAD TURNS BACK UP', mask: M.ALL },
        { at: P(1, 0.3), title: 'RED SIDE', sub: 'RED IS AT HOME HERE', mask: M.R },
        { at: P(1 + N, 0.3), title: 'BLUE SIDE', sub: 'THE SAME LAP IN A MIRROR', mask: M.B },
      ],
    };
  },
};
