// Design tool for SLIDE FIFTEEN (js/world/slidepuzzle.js): searches for the roads printed on the tiles and the order
// the tiles slide in, so that the best way across the board is to park on a tile and let it carry you, in both colours.
// Prints the ROADS and MOVES tables to paste into slidepuzzle.js, and a timeline of what's on offer.
//   node tools/slide-design.mjs [--secs 60] [--seed 1] [--moves 18] [--show]     (--show: just chart the tables as they stand)
import { Puzzle, KINDS, ROADS, MOVES, TIMING, FRAME, LAP, lapAt, homeCell, worth } from '../js/world/slidepuzzle.js';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const secs = Number(flag('--secs', 40));
const count = Number(flag('--moves', 18));
let seed = Number(flag('--seed', 1));
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];

function gain(P, side, idx, colour, t0) {
  const W = worth(P, side, idx, colour, t0);
  return W && { g: W.gain, carried: W.out.carried };
}

const NAMES = Object.keys(KINDS);
const kindOf = (pair) => NAMES.find((n) => KINDS[n] === pair);
const fixedRed = [3, 7, 11, 15];
const fixedBlue = [9, 10, 11, 12];
const straight = (pair) => pair === KINDS.NS || pair === KINDS.EW;
const MAX_STRAIGHT = 6; // per colour, the four of the solved line among them

// What we want: the best way across is a ride. At most moments, in each colour, there's a mouth whose road only
// gets you out because a tile carries you while you're parked on it, and that beats any road you can simply drive
// through. Which mouth it is keeps changing. Plain drive-through roads are worth a little (so there's rarely
// nothing on offer) but less the better they are, until the puzzle is solved and its two straights are the prize.
function score(P, chart) {
  let drought = 0;
  let worst = 0;
  const sum = [0, 0];
  const prev = [-1, -1];
  const seen = [new Set(), new Set()];
  let rideBest = 0;
  let samples = 0;
  const horizon = P.end + 6;
  for (let t = 4, step = 0; t < horizon; t += 0.4, step++) {
    let any = false;
    const row = [];
    for (const colour of [0, 1]) {
      let drive = 0;
      let ride = 0;
      let rideAt = -1;
      for (let side = 0; side < 4; side++) for (let idx = 0; idx < 4; idx++) {
        const G = gain(P, side, idx, colour, t);
        if (!G || G.g <= 1) continue;
        if (G.carried) {
          if (G.g > ride) {
            ride = G.g;
            rideAt = side * 4 + idx;
          }
        } else drive = Math.max(drive, G.g);
      }
      if (ride || drive) any = true;
      let v = 0;
      if (ride) {
        v += 1.5 + 0.25 * Math.min(ride, 6);
        if (ride > drive) v += 2;
        if (rideAt !== prev[colour]) v += 0.8;
        seen[colour].add(rideAt);
      }
      if (drive) v += t < P.end ? 0.4 - 0.12 * Math.min(drive, 8) : 0.5;
      prev[colour] = rideAt;
      sum[colour] += v;
      samples++;
      if (ride > drive) rideBest++;
      row.push(`${ride ? 'ride ' + ride.toFixed(0) : '      '} ${drive ? 'drive ' + drive.toFixed(0) : '       '}`);
    }
    if (chart && step % 5 === 0) chart.push(`${t.toFixed(0).padStart(3)}s  red ${row[0]}   blue ${row[1]}`);
    drought = any ? 0 : drought + 0.4;
    worst = Math.max(worst, drought);
  }
  // And what a racer actually meets. The chart above is the best mouth anywhere on the board, but a craft only
  // passes one mouth every couple of seconds. So send ten round the frame, a few seconds apart, each taking any
  // mouth worth it as it comes up (as the rivals do), and count what they got: rides, above all.
  const slip = FRAME.R + 8;
  const mouths = [];
  for (let side = 0; side < 4; side++) for (let idx = 0; idx < 4; idx++) mouths.push({ side, idx, q: (((lapAt(side, idx) - slip) % LAP) + LAP) % LAP });
  mouths.sort((a, b) => a.q - b.q);
  let taken = 0;
  let rode = 0;
  const places = new Set();
  const perLap = [0, 0, 0];
  for (let n = 0; n < 10; n++) {
    // (the pack off the line: the first is on the board at the first N mouth about 5.8 s in, the rest strung out
    // behind it, each at its own pace)
    const v = 42 + n * 0.9;
    let q = (((lapAt(0, 0) - slip - v * 4.6) % LAP) + LAP) % LAP;
    let t = n * 0.28;
    let lap = -1;
    const laps = [false, false, false];
    for (let guard = 0; guard < 200 && lap < 3; guard++) {
      const M = mouths.find((m) => m.q > q + 1) || mouths[0];
      let d = M.q - q;
      if (d <= 0) {
        d += LAP;
        lap++;
        if (lap >= 3) break;
      }
      t += d / v;
      q = M.q;
      let best = null;
      for (const colour of [0, 1]) {
        const W = worth(P, M.side, M.idx, colour, t + 1.2);
        if (W && W.gain >= 1.5 && (!best || W.gain > best.gain)) best = W;
      }
      if (!best) continue;
      taken++;
      if (best.out.carried) {
        rode++;
        places.add(M.side * 4 + M.idx);
        if (lap >= 0) laps[lap] = true;
      }
      const q2 = (((lapAt(best.out.side, best.out.idx) + slip) % LAP) + LAP) % LAP;
      if (q2 < q) lap++;
      q = q2;
      t = best.out.t + 1.7;
    }
    laps.forEach((x, i) => x && perLap[i]++);
  }
  const met = 9 * rode + 2 * (taken - rode) + 10 * places.size + 6 * Math.min(...perLap) + 2 * (perLap[0] + perLap[1] + perLap[2]);
  let pen = 0;
  for (const colour of [0, 1]) pen += Math.max(0, P.roads.filter((r) => r && straight(r[colour])).length - MAX_STRAIGHT) * 200;
  // and a puzzle worth watching: scrambled all over to begin with, most of the tiles taking a turn to slide
  const moved = new Set(P.moves).size;
  const astray = P.states[0].filter((k, c) => k && homeCell(k) !== c).length;
  const variety = 4 * (seen[0].size + seen[1].size) + 14 * moved + 8 * astray;
  return { total: 0.25 * (sum[0] + sum[1] + 1.5 * Math.min(sum[0], sum[1])) + met + variety - worst * 12 - pen, rode, taken, perLap, worst, sum, share: rideBest / samples, mouths: seen[0].size + seen[1].size, moved, astray };
}

function randomMoves(n) {
  // walk the hole from the solved board, never straight back; the slides are that walk undone
  const cells = new Uint8Array(16);
  for (let k = 1; k <= 15; k++) cells[homeCell(k)] = k;
  const seq = [];
  let last = 0;
  for (let j = 0; j < n; j++) {
    const hole = cells.indexOf(0);
    const c = hole % 4, r = hole >> 2;
    const opts = [];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || cc > 3 || rr < 0 || rr > 3) continue;
      const k = cells[cc + 4 * rr];
      if (k !== last) opts.push(k);
    }
    const k = pick(opts);
    cells[cells.indexOf(k)] = 0;
    cells[hole] = k;
    seq.push(k);
    last = k;
  }
  return seq.reverse();
}
function randomRoads() {
  const R = [null];
  for (let k = 1; k <= 15; k++) {
    const bend = () => pick(NAMES.slice(2));
    let red = fixedRed.includes(k) ? 'NS' : rnd() < 0.15 ? pick(NAMES) : bend();
    let blue = fixedBlue.includes(k) ? 'EW' : rnd() < 0.15 ? pick(NAMES) : bend();
    while (blue === red) {
      if (fixedBlue.includes(k)) red = pick(NAMES);
      else blue = pick(NAMES);
    }
    R.push([KINDS[red], KINDS[blue]]);
  }
  return R;
}
function mutate(R) {
  const out = R.map((x) => (x ? [...x] : x));
  for (let tries = 0; tries < 20; tries++) {
    const k = 1 + Math.floor(rnd() * 15);
    const colour = rnd() < 0.5 ? 0 : 1;
    if ((colour ? fixedBlue : fixedRed).includes(k)) continue;
    const kind = KINDS[pick(NAMES)];
    if (kind === out[k][1 - colour] || kind === out[k][colour]) continue;
    out[k][colour] = kind;
    return out;
  }
  return out;
}

function show(roads, moves) {
  const P = new Puzzle(roads, moves, TIMING);
  const chart = [];
  const s = score(P, chart);
  console.log(chart.join('\n'));
  console.log(`score ${s.total.toFixed(0)}  longest gap with nothing on offer ${s.worst.toFixed(1)}s  red ${s.sum[0].toFixed(0)} blue ${s.sum[1].toFixed(0)}  a ride is the best crossing ${(s.share * 100).toFixed(0)}% of the time, from ${s.mouths} different mouths; ${s.moved} tiles slide, ${s.astray} start out of place\nten racers took ${s.taken} roads, ${s.rode} of them rides; racers with a ride on lap 1, 2, 3: ${s.perLap.join(', ')}`);
  console.log('export const ROADS = [\n  null,');
  for (let k = 1; k <= 15; k += 4) {
    console.log('  ' + [0, 1, 2, 3].filter((d) => k + d <= 15).map((d) => `/*${String(k + d).padStart(2)}*/ [${kindOf(roads[k + d][0])}, ${kindOf(roads[k + d][1])}],`).join(' '));
  }
  console.log('];');
  console.log(`export const MOVES = [${moves.join(', ')}];`);
  // the scrambled board, as the picture reads (looking toward -z)
  for (let r = 0; r < 4; r++) console.log('  ' + [0, 1, 2, 3].map((c) => String(P.states[0][c + 4 * r] || '·').padStart(2)).join(' '));
}

if (args.includes('--show')) show(ROADS, MOVES);
else {
  const t0 = Date.now();
  let best = null;
  while (Date.now() - t0 < secs * 1000) {
    let roads = randomRoads();
    let moves = randomMoves(count);
    let cur = score(new Puzzle(roads, moves, TIMING)).total;
    for (let it = 0; it < 250 && Date.now() - t0 < secs * 1000; it++) {
      const r2 = rnd() < 0.85 ? mutate(roads) : roads;
      const m2 = r2 === roads ? randomMoves(count) : moves;
      const s = score(new Puzzle(r2, m2, TIMING)).total;
      if (s >= cur) {
        cur = s;
        roads = r2;
        moves = m2;
      }
    }
    if (!best || cur > best.cur) {
      best = { cur, roads, moves };
      console.error(`best so far ${cur.toFixed(0)}`);
    }
  }
  show(best.roads, best.moves);
}
