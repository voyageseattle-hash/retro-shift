// 17 FLIPPER ALLEY: a lap of a giant pinball table, the first course of the TOYBOX CUP. The grid sits in the shooter
// lane and the plunger fires it up the table; the road runs over the top arch and its rollover lanes, down the left
// orbit, round the apron under the flippers, back up the middle past the drop targets, round the bumper pit and down
// the inner lane to the shooter lane again.
//
// The table is written the way you'd look at one, standing at the flipper end: x to the right, z up the table.
// The engine's +x is to the driver's LEFT when facing +z, so everything is mirrored on the way in (W below).
//
// Routes:
//   INLANE       off the left orbit, straight at the left flipper. The flippers swing on a steady beat (game/pinball.js):
//                be on one as it swings and it bats you up the CENTRE RAMP, the shortcut to the bumper pit. Miss the
//                beat and the lane runs out at the drain: the Skimmer floats it, anyone else drops into the BALL TROUGH,
//                a slow road under the table that comes back up on the centre lane (no respawn).
//   BUMPER PIT   straight across the pit while the road goes round it. Every bumper kicks; three kicks in a row is a
//                RICOCHET and a burst of speed. Red caps are gone in BLUE, blue caps in RED. The Pair is heavy enough
//                to hold its line through the kicks; the Blade and the Skimmer are thrown about.
//   WIRE RAMP    a single steel wireform high over the top of the table that only the Blade can balance on.
//   SECRET LANE  a blue-only lane across the top of the playfield, under the red plastic of the upper deck: in RED and
//                BOTH all you see is the plastic.
//
// The moving parts, the bumpers and the lap-by-lap table (kickback and the second flipper on lap 2, multiball on
// lap 3) are in game/pinball.js; the table itself is drawn in pinball-art.js.

import * as THREE from '../../vendor/three.js';
import { M } from './shift.js';
import { toyboxEnv } from './toybox.js';
import { pinballDecor, buildPinballArt } from './pinball-art.js';

// the playfield's slope: metres up per metre up the table
export const SLOPE = 0.07;
export const tableY = (z) => 4 + SLOPE * z;
// table coordinates to world coordinates (mirrored in x)
// (and the whole table is drawn at SC of its written size: the lap came out long)
export const SC = 0.9;
export const W = (x, z, lift = 0) => [-x * SC, z * SC, tableY(z * SC) + lift];
export const V3 = (x, z, lift = 0) => new THREE.Vector3(-x * SC, tableY(z * SC) + lift, z * SC);

// The main road, in table coordinates [x, z].
const MAIN = [
  [200, 200], [200, 330], [200, 460], [190, 560], [145, 645], [55, 690], [-55, 690], [-145, 645], // shooter lane, top arch
  [-190, 560], [-200, 450], [-200, 340], [-192, 240], // left orbit
  [-160, 150], [-110, 80], [-40, 45], [40, 45], [92, 78], // outlane and apron, under the flippers
  [104, 145], [84, 205], [38, 252], [-15, 295], [-62, 342], // centre lane
  [-92, 405], [-85, 480], [-40, 535], [35, 548], [95, 515], // round the bumper pit
  [128, 450], [136, 360], [136, 270], [136, 190], // inner lane
  [136, 124], [145.4, 101.4], [168, 92], [190.6, 101.4], [200, 124], // the hairpin into the shooter lane
];

// Where things are on the table (game/pinball.js and pinball-art.js read these).
export const TABLE = {
  x0: -232, x1: 232, z0: -14, z1: 728,
  // the flipper lane: [x, z] along it; each bat from its pivot to its tip, and the drain between the tips
  lane: [[-122, 130], [-86, 112], [-50, 102], [-12, 98], [38, 104], [72, 118]],
  batL: { pivot: [-50, 102], tip: [-12, 98] },
  batR: { pivot: [72, 118], tip: [38, 104] },
  // how far the left bat's lane climbs to its lip (the drain is a leap from it)
  lip: 3.5,
  ramp: [[6, 132, 7], [-4, 172, 11.5], [-18, 224, 13], [-37, 270, 8]],
  trough: [[-34, 100, -14], [20, 100, -14], [78, 100, -14], [112, 112, -13], [124, 150, -10.5], [122, 196, -5.5]],
  pit: [[-22, 440], [30, 450], [84, 430]],
  wire: [[150, 588, 13], [60, 630, 17], [-60, 630, 17], [-150, 588, 13]],
  secret: [[142, 540], [62, 598], [-62, 598], [-142, 540]],
};

export const PINBALL = {
  id: 'pinball',
  num: '17',
  name: 'FLIPPER ALLEY',
  blurb: 'A lap of a giant pinball table. Catch the flipper’s beat, ride the bumpers, mind the drain.',
  decor: 'pinball',
  decorFn: pinballDecor,
  seed: 1717,
  laps: 3,
  sun: 0,
  skyPiece: 'none',
  dressEnv: toyboxEnv('desk'), // the table stands on the desk in the TOYBOX bedroom
  noPylons: true,
  floorDrop: 70,
  points: MAIN.map(([x, z]) => W(x, z)),
  features: (P) => ({
    routeBoosts: 'light',
    branches: [
      // b0: the flipper lane (the drain is cut and the lip raised in layPinball, where the lane's real length is known)
      { from: P(11, 0.55), to: P(17, 0.55), mask: M.ALL, side: -1, halfWidth: 7, lead: 26, label: 'FLIPPER LANE', sub: 'CATCH THE BEAT · BLUE FLOATS THE DRAIN', via: TABLE.lane.map(([x, z]) => W(x, z)), pin: 'lane' },
      // b1: the bumper pit
      { from: P(21, 0.45), to: P(27, 0.75), mask: M.ALL, side: 1, halfWidth: 9, label: 'BUMPER PIT', sub: 'THREE KICKS FOR A RICOCHET', via: TABLE.pit.map(([x, z]) => W(x, z)), pin: 'pit' },
      // b2: the wire ramp, for the Blade
      { from: P(2, 0.35), to: P(8, 0.75), mask: M.ALL, side: -1, halfWidth: 3.2, label: 'WIRE RAMP', sub: 'ONLY THE RED BLADE BALANCES', via: TABLE.wire.map(([x, z, h]) => W(x, z, h)), pin: 'wire' },
      // b3: the secret lane under the upper deck, blue only (hatch: it brings its own cover, the deck, and no storm)
      { from: P(1, 0.8), to: P(9, 0.55), mask: M.BO, side: -1, halfWidth: 6, label: 'SECRET LANE', hatch: true, via: TABLE.secret.map(([x, z]) => W(x, z)), pin: 'secret', shards: [{ at: 0.3 }, { at: 0.5 }, { at: 0.7 }] },
    ],
    obstacles: [
      // the drop targets, lens walls: a red bank across the centre lane (clear of where the flipper lane and the
      // trough come back in, so nobody rejoins straight into it) and a blue bank across the left orbit (well below where the blue-only secret lane comes back in). One at a
      // time: two close together ask for a lens change faster than a rival can make it.
      { type: 'wall', at: P(19, 0.2), mask: M.R },
      { type: 'wall', at: P(11, 0.0), mask: M.B },
      // standup targets down the left orbit: one each side, far enough apart that the middle is always open
      { type: 'block', at: P(9, 0.25), lat: -0.62, mask: M.R, size: 3 },
      { type: 'block', at: P(10, 0.4), lat: 0.62, mask: M.B, size: 3 },
    ],
    boosts: [
      { at: P(0, 0.45) },
      // the rollover lanes over the top arch: lit red or blue, a boost only in that lens
      { at: P(4, 0.75), lat: -0.6, mask: M.RO }, { at: P(4, 0.75), lat: 0, mask: M.BO }, { at: P(4, 0.75), lat: 0.6, mask: M.RO },
      { at: P(5, 0.55), lat: -0.6, mask: M.BO }, { at: P(5, 0.55), lat: 0, mask: M.RO }, { at: P(5, 0.55), lat: 0.6, mask: M.BO },
      { at: P(9, 0.85) },
      { at: P(14, 0.4), lat: 0.3 },
      { at: P(23, 0.5), lat: -0.3 },
      { at: P(29, 0.2) },
    ],
    shards: [{ at: P(3, 0.3), n: 3 }, { at: P(15, 0.3), n: 3, lat: -0.3 }, { at: P(25, 0.2), n: 3 }, { at: P(30, 0.3), n: 3, mask: M.R }],
    tips: [
      { at: P(10, 0.6), text: 'FLIPPER LANE ON THE LEFT: BE ON THE FLIPPER WHEN IT SWINGS', key: 'both' },
      { at: P(20, 0.9), text: 'BUMPER PIT ON THE RIGHT: THREE KICKS IN A ROW IS A RICOCHET', key: 'both' },
    ],
    // where the lap-by-lap pieces sit (game/pinball.js)
    pin: { kickback: P(12, 0.45), ballsFrom: P(20, 0.15), ballsTo: P(17, 0.2) },
  }),
};

// ------------------------------------------------------------------ laying the table's own roads
// Runs after the branches are built (track.js): cuts the drain, raises the left flipper's lip, makes the wire ramp
// hold only the Blade, and adds the two roads that don't fork off the main one (the centre ramp, which you're batted
// onto, and the ball trough, which you fall into).
export function layPinball(world) {
  if (world.def.id !== 'pinball') return;
  const main = world.main;
  const Path = main.constructor;
  const by = (pin) => world.paths.find((p) => p.def?.pin === pin);
  const lane = by('lane');
  const nearest = (path, x, z) => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < path.N; i++) {
      const d = (path.px[i] + x * SC) ** 2 + (path.pz[i] - z * SC) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return bi;
  };
  const pin = (world.pinball = { world, lane, pit: by('pit'), wire: by('wire'), secret: by('secret') });

  // ---- the flipper lane: the left bat's stretch climbs to a lip, the drain is a gap, the right bat is where you land
  const iPivL = nearest(lane, ...TABLE.batL.pivot);
  const iLip = nearest(lane, ...TABLE.batL.tip);
  const iLand = nearest(lane, ...TABLE.batR.tip);
  const iPivR = nearest(lane, ...TABLE.batR.pivot);
  const rise = Math.round(46 / lane.ds);
  for (let i = iLip - rise; i <= iLip; i++) {
    const u = (i - (iLip - rise)) / rise;
    lane.py[i] += TABLE.lip * u * u * (3 - 2 * u);
  }
  // (the last sample of road is the lip; from the next the lane is at table height again)
  lane.reframe();
  lane.minY = Math.min(...lane.py);
  lane.maxY = Math.max(...lane.py);
  lane.glide = new Uint8Array(lane.N);
  for (let i = iLip + 1; i < iLand; i++) {
    lane.mask[i] = 0;
    lane.glide[i] = 1;
    lane.railL[i] = lane.railR[i] = 0;
  }
  pin.bats = [
    { side: -1, i0: iPivL, i1: iLip, fromLap: 0, phase: 0 },
    { side: 1, i0: iLand, i1: iPivR, fromLap: 1, phase: 0.5 },
  ];
  pin.drain = { i0: iLip, i1: iLand };

  // ---- the wire ramp: only a craft that clings stays on it (ai.js reads `wallrun` as a route for the Blade)
  const wire = pin.wire;
  wire.cling = new Uint8Array(wire.N).fill(1);
  wire.wallrun = true;
  wire.thin = true; // ai.js holds the middle of it
  wire.aiTake = 0.45; // and sends fewer rivals up it at once
  wire.bank.fill(0);
  wire.reframe();

  // ---- the centre ramp: from the air over the drain to the centre lane's left side, just below the pit
  const hwR = 6.5;
  const iB = main.index(world.def.pin.rampTo ?? rampTo(main));
  const rampPts = TABLE.ramp.map(([x, z, h]) => V3(x, z, h));
  rampPts.push(...mergePoints(main, iB, -1, hwR));
  const ramp = new Path('ramp', rampPts, false, hwR, { bankFactor: 2, mainFrom: lane.mainU(iLip), mainTo: main.frac(iB) });
  ramp.noFork = true;
  ramp.side = -1;
  openMerge(main, ramp, iB, -1);
  world.paths.push(ramp);
  pin.ramp = ramp;
  // where a flip sets you down on it
  pin.rampIn = Math.round(26 / ramp.ds);

  // ---- the ball trough: under the drain, round under the table and up onto the centre lane's right side
  const hwT = 8;
  const iT = main.index(world.def.pin.troughTo ?? troughTo(main));
  const troughPts = TABLE.trough.map(([x, z, h]) => V3(x, z, h));
  troughPts.push(...mergePoints(main, iT, 1, hwT));
  const trough = new Path('trough', troughPts, false, hwT, { bankFactor: 2, mainFrom: lane.mainU(iLip), mainTo: main.frac(iT) });
  trough.noFork = true;
  trough.side = 1;
  openMerge(main, trough, iT, 1);
  world.paths.push(trough);
  pin.trough = trough;
}

// main-loop fractions of the two merges, from where they are on the table
const fracAt = (main, x, z) => {
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < main.N; i++) {
    const d = (main.px[i] + x * SC) ** 2 + (main.pz[i] - z * SC) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return main.frac(bi);
};
const rampTo = (main) => fracAt(main, -58, 338);
const troughTo = (main) => fracAt(main, 58, 232);

// The last points of a road that merges onto the main road at sample iB from one side, as track.js lays a branch's
// end: in beside the road, then across onto its edge lane.
function mergePoints(main, iB, side, hw, lead = 30) {
  const off = main.halfW - hw;
  const B = main.point(iB, off * side, 0, new THREE.Vector3());
  const tB = new THREE.Vector3(main.thx[iB], main.ty[iB], main.thz[iB]).normalize();
  const RB = new THREE.Vector3(main.rightX(iB), 0, main.rightZ(iB)).multiplyScalar(side);
  const out = main.halfW + hw + 3;
  const E = B.clone().addScaledVector(tB, -lead).addScaledVector(RB, out - off);
  const midB = B.clone().addScaledVector(tB, -lead * 0.5).addScaledVector(RB, (out - off) * 0.35);
  E.y = B.y;
  return [E, midB, B, B.clone().addScaledVector(tB, 4)];
}

// Rails off where the merging road lies over the main one, and the main road's rail opened beside it.
function openMerge(main, path, iB, side) {
  const fr = {};
  const hw = path.halfW;
  let hint = iB;
  for (let i = Math.floor(path.N * 0.5); i < path.N; i++) {
    if (!main.frame(path.px[i], path.pz[i], hint, fr)) continue;
    hint = fr.i;
    if (Math.abs(fr.lat) > main.halfW + hw * 0.6 || Math.abs(fr.y - path.py[i]) > 1.5) continue;
    // the edge toward the main road's middle opens; both where the whole strip is inside it
    if (side < 0) path.railR[i] = 0;
    else path.railL[i] = 0;
    if (Math.abs(fr.lat) + hw < main.halfW - 0.5) path.railL[i] = path.railR[i] = 0;
  }
  const w = Math.ceil((30 * 1.3) / main.ds);
  for (let k = -4; k <= w; k++) {
    const i = main.wrap(iB - k);
    const J = side > 0 ? (main.jR ||= {}) : (main.jL ||= {});
    J[i] = (J[i] || 0) | M.ALL;
    if (side > 0) main.railR[i] = 0;
    else main.railL[i] = 0;
  }
}

// Runs once everything else is built (track.js): the table, drawn round the roads.
export function buildPinball(world) {
  if (world.def.id !== 'pinball') return;
  buildPinballArt(world);
}
