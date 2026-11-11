// 19 PAGE TURNER (TOYBOX CUP): a giant pop-up storybook lying open on the bedroom floor. The road is die-cut through
// every page, so the lap is the same line each time, but each lap is another spread: the leaf turns as you jump the
// gutter at the bottom of the book, the old scene folds flat and the next one stands up (game/popup.js).
//
// Laid out in book coordinates, as a reader at the bottom of the book sees it: bx to the reader's right, bz up the
// page, the spine at bx = 0. (A driver heading up the page has -x on their right, so world x = -bx.) The pages rise
// away from the spine like a real open book and dip into the gutter between them.

import { M } from './shift.js';
import { toyboxEnv } from './toybox.js';

export const BOOK = { W: 340, D: 600, H: 9, G: 45 };
// height of the paper at bx (the road sits a little proud of it)
export const pageY = (bx) => BOOK.H * (1 - Math.exp(-((bx / BOOK.G) ** 2)));
const at = (bx, bz) => [-bx, bz, pageY(bx)];

// The spreads, in lap order.
export const SPREADS = [
  { id: 'city', name: 'THE CITY' },
  { id: 'sea', name: 'THE SEA' },
  { id: 'volcano', name: 'THE VOLCANO' },
];

export const popupDef = {
  id: 'popup',
  num: '19',
  name: 'PAGE TURNER',
  blurb: 'A pop-up storybook. Jump the gutter and the page turns: city, sea, volcano.',
  decor: 'popup',
  seed: 1919,
  laps: 3,
  sun: 1,
  skyPiece: 'none',
  dressEnv: toyboxEnv('floor'), // the TOYBOX CUP's bedroom and candy-gloss road (toybox.js): the book lies on the floorboards
  floorDrop: 13,
  routeBoosts: 'light',
  popup: true, // the book, its three spreads and the page turn (game/popup.js)
  // clockwise as the reader sees it: up the left page, across the top of the spine, down the right page, and back
  // across the bottom of the spine, where THE FLIP throws you over the gutter and the page turns under you
  points: [
    at(-270, -90), at(-270, 60), at(-250, 175), at(-170, 232), at(-85, 215), at(-40, 204), at(0, 200), at(40, 204),
    at(85, 215), at(175, 235), at(262, 180), at(275, 70), at(210, -10), at(215, -100), at(255, -180), at(190, -238),
    at(95, -228), at(42, -220), at(0, -216), at(-42, -220), at(-95, -228), at(-195, -238), at(-262, -185),
  ],
  features: (P) => ({
    // where a racer's page turns: just past the lip of THE FLIP
    flipAt: P(16, 0.5),
    branches: [
      // a folded paper wall inside the first corner: only the Blade climbs it
      { from: P(1, 0.45), to: P(3, 0.5), mask: M.ALL, side: 1, lift: 9, label: 'PAPER WALL', sub: 'RED CLINGS · OTHERS FALL', wallrun: { from: 0.28, to: 0.76, bank: 0.95 } },
      // off the top of one pop-up onto the next: only the Skimmer glides it
      { from: P(8, 0.5), to: P(10, 0.6), mask: M.ALL, side: 1, lift: 5, label: 'POP-UP HOP', sub: 'BLUE FLOATS IT', profile: [{ at: 0.5, kind: 'step', drop: 3.5, len: 55, end: 0.82 }] },
      // the secret behind the big pop-up on the right page (a castle, a galleon, a rock arch): printed in blue only,
      // straight past the kink the road takes round it
      { from: P(11, 0.25), to: P(14, 0.1), mask: M.BO, side: -1, lift: 6, label: 'BLUE KEEP' },
      // a pull tab: a heavy cardboard strip that's only there with both printings laid over each other
      { from: P(14, 0.35), to: P(15, 0.75), mask: M.X, side: 1, lift: 0, bulge: -14, label: 'PULL TAB' },
      // the red printing's ribbon over the inside of the last corner
      { from: P(20, 0.7), to: P(22, 0.55), mask: M.RO, side: 1, lift: 8, label: 'RED RIBBON' },
    ],
    gaps: [
      { at: P(9, 0.3), len: 36, mask: M.R, noRails: true },
      { at: P(11, 0.55), len: 36, mask: M.B, noRails: true },
      { path: 'b1', at: 0.5, len: 50, glide: true, noRails: true },
    ],
    // THE FLIP: the curled lip of the page, there in every lens. It throws you clean over the gutter.
    launchers: [{ at: P(16, 0.28), mask: M.ALL, over: 104 }],
    obstacles: [],
    boosts: [{ at: P(0, 0.45) }, { at: P(7, 0.6) }, { at: P(10, 0.75), mask: M.BO }, { at: P(19, 0.9) }, { at: P(22, 0.4), mask: M.RO }, { path: 'b0', at: 0.86 }, { path: 'b1', at: 0.8 }, { path: 'b3', at: 0.45, mask: M.X }],
    shards: [{ at: P(0, 0.75), n: 3 }, { at: P(6, 0.6), n: 3, lat: 0.4 }, { at: P(13, 0.6), n: 3, lat: -0.4 }, { at: P(20, 0.1), n: 3 }],
    tips: [{ at: P(15, 0.6), text: 'THE FLIP: JUMP THE GUTTER AND THE PAGE TURNS', key: 'both' }],
    // Where each spread's moving parts stand (game/popup.js), as fractions of the lap: clear main road between the
    // routes. zone = [from, to].
    zones: {
      z1: [P(3, 0.62), P(4, 0.85)],
      z2: [P(7, 0.35), P(8, 0.4)],
      z3: [P(10, 0.8), P(11, 0.2)],
      z4: [P(12, 0.35), P(13, 0.9)],
      // (you land out of THE FLIP a little before this one, while the new page is still standing up: its pieces go
      // solid for you a few seconds after your page turns)
      z5: [P(21, 0.3), P(22, 0.45)],
    },
  }),
};
