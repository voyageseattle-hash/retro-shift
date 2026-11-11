// The DYSON SPHERE road as a flat walk (dyson-shape.js): straights, bends, the two rims and the dives.
// The numbers are in D. tools/dyson-solve.mjs moves them until the walk closes, flat and rolled out over the shell,
// and the strands of road keep clear of each other; paste what it prints back in here.
const DEG = Math.PI / 180;

export const D = {
  grid: 147.5464, out1: 16.1055, out2: 107.0383, out3: 9.9086, out4: 120.9325, in1: 94.0495, in2: 58.376, in3: 103.0045, in4: 97.6141, in5: 53.6432, in6: 465.5874, in7: 64.3533, in8: 57.8564, in9: 114.0426, in10: 63.9284, in11: 129.9918, in11b: 94.5935, in12: 48.1323, in13: 66.7171, home1: 61.8688, home3: 40.7276, dive1h: 170, dive1span: 0.80087, dive2h: 200, dive2span: 1.11791, dive3h: 120, dive3span: 0.56764,
};
// (bends are in degrees, + left; the last one home is whatever is left of a full turn)
export const BENDS = ['out1', 'out3', 'in2', 'in5', 'in7', 'in10', 'in12'];

export function segments(d = D) {
  const home2 = 360 - BENDS.reduce((s, k) => s + d[k], 0);
  return [
    // the dark side: off the line, a long bend over the horizon to the first opening
    { name: 'grid', len: d.grid },
    { name: 'out1', turn: d.out1 * DEG, r: 420 },
    { name: 'out2', len: d.out2 },
    { name: 'out3', turn: d.out3 * DEG, r: 420 },
    { name: 'out4', len: d.out4 },
    { name: 'rimIn', kind: 'rim', lead: 34 },
    // inside, under the star
    { name: 'in1', len: d.in1 },
    { name: 'in2', turn: d.in2 * DEG, r: 240 },
    { name: 'in3', len: d.in3 },
    { name: 'dive1', kind: 'dive', h: d.dive1h, span: d.dive1span, lead: 34 },
    { name: 'in4', len: d.in4 },
    { name: 'in5', turn: d.in5 * DEG, r: 220 },
    { name: 'in6', len: d.in6 },
    { name: 'in7', turn: d.in7 * DEG, r: 250 },
    { name: 'in8', len: d.in8 },
    { name: 'dive2', kind: 'dive', h: d.dive2h, span: d.dive2span, lead: 34 },
    { name: 'in9', len: d.in9 },
    { name: 'in10', turn: d.in10 * DEG, r: 230 },
    { name: 'in11', len: d.in11 },
    { name: 'dive3', kind: 'dive', h: d.dive3h, span: d.dive3span, lead: 34 },
    { name: 'in11b', len: d.in11b },
    { name: 'in12', turn: d.in12 * DEG, r: 240 },
    { name: 'in13', len: d.in13 },
    { name: 'rimOut', kind: 'rim', lead: 34 },
    // and out into the dark again, round to the line
    { name: 'home1', len: d.home1 },
    { name: 'home2', turn: home2 * DEG, r: 300 },
    { name: 'home3', len: d.home3 },
  ];
}
