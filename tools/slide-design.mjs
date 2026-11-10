// Design tool for SLIDE FIFTEEN (js/world/slidepuzzle.js): searches for the roads printed on the tiles and the order
// the tiles slide in, so that through the whole race there's a way across the board worth taking, in both colours.
// Prints the ROADS and MOVES tables to paste into slidepuzzle.js, and a timeline of what's on offer.
//   node tools/slide-design.mjs [--secs 60] [--seed 1] [--show]     (--show: just chart the tables as they stand)
import { Puzzle, KINDS, ROADS, MOVES, TIMING, homeCell, worth } from '../js/world/slidepuzzle.js';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const secs = Number(flag('--secs', 40));
let seed = Number(flag('--seed', 1));
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];

function gain(P, side, idx, colour, t0) {
  const W = worth(P, side, idx, colour, t0);
  return W && { g: W.gain, carried: W.out.carried, bends: W.out.length % 100 > 1 };
}

const NAMES = Object.keys(KINDS);
const kindOf = (pair) => NAMES.find((n) => KINDS[n] === pair);
const fixedRed = [3, 7, 11, 15];
const fixedBlue = [9, 10, 11, 12];
const straight = (pair) => pair === KINDS.NS || pair === KINDS.EW;
const MAX_STRAIGHT = 6; // per colour, the four of the solved line among them

// What we want: at any moment one or two ways across in each colour (not none, not every mouth), that change as the
// tiles slide, some of them with bends and some that ride a slide.
function score(P, chart) {
  let drought = 0;
  let worst = 0;
  const sum = [0, 0];
  const prev = [0, 0];
  for (let t = 4, step = 0; t < 96; t += 0.4, step++) {
    let any = false;
    const row = [];
    for (const colour of [0, 1]) {
      let best = 0;
      let n = 0;
      let bits = 0;
      let extra = 0;
      for (let side = 0; side < 4; side++) for (let idx = 0; idx < 4; idx++) {
        const G = gain(P, side, idx, colour, t);
        if (!G || G.g <= 1) continue;
        n++;
        bits |= 1 << (side * 4 + idx);
        best = Math.max(best, G.g);
        if (G.carried) extra = Math.max(extra, 1.2);
        else if (G.bends) extra = Math.max(extra, 0.6);
      }
      if (n) any = true;
      sum[colour] += [0, 1, 1.3, 1, 0.6, 0.3][Math.min(n, 5)] + 0.2 * Math.min(best, 5) + extra + (bits !== prev[colour] && bits ? 0.8 : 0);
      prev[colour] = bits;
      row.push(n ? `${n}x${best.toFixed(0)}${extra > 1 ? '*' : extra ? '~' : ' '}` : ' .   ');
    }
    if (chart && step % 5 === 0) chart.push(`${t.toFixed(0).padStart(3)}s  red ${row[0].padEnd(6)} blue ${row[1]}`);
    drought = any ? 0 : drought + 0.4;
    worst = Math.max(worst, drought);
  }
  let pen = 0;
  for (const colour of [0, 1]) pen += Math.max(0, P.roads.filter((r) => r && straight(r[colour])).length - MAX_STRAIGHT) * 200;
  return { total: sum[0] + sum[1] + 1.5 * Math.min(sum[0], sum[1]) - worst * 12 - pen, worst, sum };
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
  console.log(`score ${s.total.toFixed(0)}  longest gap with nothing on offer ${s.worst.toFixed(1)}s  red ${s.sum[0].toFixed(0)} blue ${s.sum[1].toFixed(0)}`);
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
    let moves = randomMoves(16);
    let cur = score(new Puzzle(roads, moves, TIMING)).total;
    for (let it = 0; it < 250 && Date.now() - t0 < secs * 1000; it++) {
      const r2 = rnd() < 0.85 ? mutate(roads) : roads;
      const m2 = r2 === roads ? randomMoves(16) : moves;
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
