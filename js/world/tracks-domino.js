// 18 TOPPLE RUN, the TOYBOX CUP's domino course: the road is a toy track round the edge of the bedroom rug, and a
// chain of giant dominoes snakes across the rug inside it. GO tips the first one. What the dominoes do is in
// dominoes.js; this is where everything stands.
//
//   the road round the outside is always there
//   RUG RUN, CRANE LANE   two domino lanes that cut a corner each: a maze while the dominoes stand, a ride on the
//                         crest as they fall, flat fast road once they're down
//   TOP EDGE              along the top of a row packed tight: only the RED Blade balances up there
//   BOOK BRIDGE           a gap, until the chain knocks a book flat across it
//   BLUE SPUR             a spur of blue dominoes behind a stack of domino boxes, there in BLUE only
//   SHORT ROW             a low row across a cut: the BLUE Skimmer LIFTs over it, the BOTH Pair smashes through it

import { M } from './shift.js';
import { toyboxEnv } from './toybox.js';
import { layDominoes, Dominoes } from './dominoes.js';

const RAD = Math.PI / 180;

// A lane's line across the rug: a smooth curve from `S` heading `h0` to `E` heading `h1` (degrees, clockwise from
// north on the map: 0 is +z, 90 is +x), swaying `sway` metres either side of it on the way. Points come out about every
// `step` metres as [x, z, y], leaving the two ends for the fork and the merge to round.
function sweep(S, h0, E, h1, sway = 0, y = 0, step = 24) {
  const L = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const m = L * 0.95;
  const d0 = [Math.sin(h0 * RAD) * m, Math.cos(h0 * RAD) * m];
  const d1 = [Math.sin(h1 * RAD) * m, Math.cos(h1 * RAD) * m];
  const at = (u, k) => {
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * S[k] + (u3 - 2 * u2 + u) * d0[k] + (-2 * u3 + 3 * u2) * E[k] + (u3 - u2) * d1[k];
  };
  const n = Math.round((L * 1.12) / step);
  const pts = [];
  for (let k = 1; k < n; k++) {
    const u = k / n;
    const x = at(u, 0);
    const z = at(u, 1);
    // (the way the curve is heading here, for the sway across it)
    const tx = at(u + 0.01, 0) - at(u - 0.01, 0);
    const tz = at(u + 0.01, 1) - at(u - 0.01, 1);
    const tl = Math.hypot(tx, tz);
    const o = sway * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u);
    pts.push([x + (tz / tl) * o, z - (tx / tl) * o, y]);
  }
  return pts;
}

// straight from a to b at height y, with ramps `ramp` metres long up from and down to the road at each end
function deck(a, b, y, ramp, step = 20) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.round(L / step);
  const out = [];
  for (let k = 0; k <= n; k++) {
    const s = (k / n) * L;
    const f = Math.min(1, s / ramp, (L - s) / ramp);
    out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, y * f * f * (3 - 2 * f)]);
  }
  return out;
}

export const TOPPLE_RUN = {
  id: 'domino',
  num: '18',
  name: 'TOPPLE RUN',
  blurb: 'GO tips the first domino. Chase the wave across the rug, or take the road round it.',
  decor: 'domino',
  seed: 1818,
  laps: 3,
  sun: 0,
  skyPiece: 'none',
  dressEnv: toyboxEnv('rug'),
  // the rug lies right under the road
  floorDrop: 0.3,
  lay: layDominoes, // (track.js: before the roads are drawn, and once they are)
  dominoes: (world) => new Dominoes(world),
  noPylons: true,
  routeBoosts: false, // the lanes lay their own pads as the dominoes come down (dominoes.js)
  // the rug's edge, clockwise from the line on its west side: [x, z, y]
  points: [
    [0, -40, 0], [0, 60, 0], [0, 160, 0], [0, 250, 0], [26.4, 313.6, 0], [90, 340, 0], [200, 340, 0], [280, 340, 0],
    [335, 372, 0], [400, 384, 0], [465, 372, 0], [520, 340, 0], [590, 340, 0], [653.6, 313.6, 0], [680, 250, 0],
    [680, 120, 0], [680, -10, 0], [680, -130, 0], [653.6, -193.6, 0], [590, -220, 0], [500, -220, 0], [420, -220, 0],
    [365, -252, 0], [300, -264, 0], [235, -252, 0], [180, -220, 0], [90, -220, 0], [26.4, -193.6, 0], [0, -130, 0],
  ],
  features: (P) => ({
    branches: [
      // b0 RUG RUN: across the north-west corner
      {
        from: P(1, 0.1), to: P(6, 0.5), mask: M.ALL, side: -1, halfWidth: 8, lead: 56, label: 'RUG RUN', sub: 'DOMINO LANE · RIDE THE WAVE',
        via: sweep([21, 126], 0, [184, 319], 90, 34),
        shards: [{ at: 0.3, lat: 0.75 }, { at: 0.55, lat: -0.75 }, { at: 0.8, lat: 0.75 }],
        dominoes: { name: 'A', u0: 0.13, u1: 0.87 },
      },
      // b1 TOP EDGE: straight across the bulge on the north side, along the top of a row packed tight
      {
        from: P(6, 0.85), to: P(11, 0.15), mask: M.ALL, side: -1, halfWidth: 2.4, lead: 26, label: 'TOP EDGE', sub: 'ONLY THE RED BLADE BALANCES',
        via: deck([306, 322], [492, 322], 8, 46),
        rail: { from: 0.2, to: 0.8 },
      },
      // b2 BOOK BRIDGE: across the north-east corner, over a gap that a falling book bridges
      { from: P(11, 0.55), to: P(14, 0.75), mask: M.ALL, side: -1, halfWidth: 7, lift: 7, label: 'BOOK BRIDGE', sub: 'OPEN ONCE THE BOOK IS DOWN', book: true },
      // b3 CRANE LANE: across the south-east corner; the crane at its far end stands it back up
      {
        from: P(15, 0.15), to: P(20, 0.75), mask: M.ALL, side: -1, halfWidth: 8, lead: 56, label: 'CRANE LANE', sub: 'DOMINO LANE · WATCH THE CRANE',
        via: sweep([659, 45], 180, [495, -197], 270, 34),
        shards: [{ at: 0.3, lat: -0.75 }, { at: 0.55, lat: 0.75 }, { at: 0.8, lat: -0.75 }],
        dominoes: { name: 'B', u0: 0.11, u1: 0.89, crane: true },
      },
      // b4 BLUE SPUR: straight across the bulge on the south side, behind the domino boxes (blue lens only)
      { from: P(21, 0.12), to: P(25, 0.3), mask: M.BO, side: -1, halfWidth: 6.5, label: 'BLUE SPUR', cover: false, shards: [{ at: 0.3 }, { at: 0.5 }, { at: 0.7 }], dominoes: { name: 'S', u0: 0.2, u1: 0.8, spur: true } },
      // b5 SHORT ROW: across the south-west corner
      { from: P(25, 0.5), to: P(28, 0.45), mask: M.ALL, side: -1, halfWidth: 6.5, label: 'SHORT ROW', sub: 'BLUE LIFTS OVER · BOTH SMASHES', dominoes: { name: 'R', row: 0.5 } },
    ],
    gaps: [{ path: 'b2', at: 0.42, len: 36, mask: 0, noRails: true, secret: true }],
    boosts: [{ path: 'b0', at: 0.5 }, { path: 'b1', at: 0.3 }, { path: 'b1', at: 0.6 }, { path: 'b3', at: 0.5 }, { at: P(0, 0.35) }, { at: P(3, 0.3), lat: -0.4 }, { at: P(9, 0.0) }, { at: P(14, 0.3), lat: -0.4 }, { at: P(16, 0.5) }, { at: P(19, 0.6), lat: -0.4 }, { at: P(23, 0.0), lat: 0 }, { at: P(27, 0.6), lat: -0.4 }],
    shards: [{ at: P(2, 0.5), n: 3 }, { at: P(8, 0.5), n: 3, lat: 0.3 }, { at: P(12, 0.5), n: 3, lat: -0.3 }, { at: P(16, 0.0), n: 3 }, { at: P(18, 0.5), n: 3, lat: -0.3 }, { at: P(22, 0.5), n: 3 }, { at: P(26, 0.8), n: 3, lat: -0.4 }],
    tips: [
      { at: P(0, 0.6), text: 'DOMINO LANE ON THE LEFT: RIDE IN BEHIND THE WAVE', key: 'both' },
      { at: P(6, 0.4), text: 'TOP EDGE: ONLY THE RED BLADE BALANCES UP THERE', key: 'red' },
    ],
  }),
};
