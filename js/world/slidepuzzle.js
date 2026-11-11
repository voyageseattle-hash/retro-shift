// SLIDE FIFTEEN's puzzle, as plain numbers (no drawing here, so tools/slide-design.mjs can run it under node): the
// 4 by 4 board, the road printed on each tile in each colour, the order the tiles slide in, and where everything is
// at any moment of the race. Nothing is random: the board is a function of the race clock, so it can be learned.
//
// Sides are 0 N (+z), 1 E (+x), 2 S (-z), 3 W (-x). A cell is c + 4 r (c along x, r along z). Tile k (1..15) is at
// home in cell k - 1, which reads 1 top left ... 15 and the hole bottom right to someone looking down the board
// toward -z (in this game +x is on your left when you face +z, so that's the way round a picture reads true).

export const TILE = 100; // metres a side
export const SIZE = 4 * TILE;
export const DX = [0, 1, 0, -1];
export const DZ = [1, 0, -1, 0];
export const opp = (s) => (s + 2) % 4;
export const homeCell = (k) => k - 1;
export const cellX = (cell) => (cell % 4) * TILE + TILE / 2;
export const cellZ = (cell) => (cell >> 2) * TILE + TILE / 2;

// The road on each tile: [red, blue], each the two sides it joins. Red runs straight down the third column when
// the puzzle is solved (tiles 3, 7, 11, 15) and blue straight along the third row (9, 10, 11, 12): the picture's
// reward. The rest, and the slide order, were picked by tools/slide-design.mjs so that the best way across
// the board is usually a ride: park on a tile and let it carry you to where its road joins up.
const NS = [0, 2];
const EW = [1, 3];
const NE = [0, 1];
const ES = [1, 2];
const SW = [2, 3];
const NW = [0, 3];
export const KINDS = { NS, EW, NE, ES, SW, NW };
// prettier-ignore
export const ROADS = [
  null,
  /* 1*/ [NW, NE], /* 2*/ [SW, NE], /* 3*/ [NS, EW], /* 4*/ [NS, NW],
  /* 5*/ [NW, NE], /* 6*/ [NE, SW], /* 7*/ [NS, NE], /* 8*/ [NS, NW],
  /* 9*/ [SW, EW], /*10*/ [NE, EW], /*11*/ [NS, EW], /*12*/ [SW, EW],
  /*13*/ [ES, SW], /*14*/ [NE, EW], /*15*/ [NS, SW],
];

// The tiles in the order they slide (each into the hole), ending solved.
// prettier-ignore
export const MOVES = [11, 9, 6, 2, 3, 4, 8, 7, 10, 12, 15, 11, 14, 13, 9, 10, 11, 15];

// And once it's solved: these repeat to the finish, each pair opening the picture by one tile and closing it again.
export const TAIL = [15, 15, 12, 12];

// Timing, in seconds of race clock: move j starts at START + j * PERIOD and takes SLIDE; the tile rattles and its
// arrow lights WARN before it goes.
export const TIMING = { START: 3, PERIOD: 3.6, SLIDE: 1.5, WARN: 1.6 };

// The frame road round the board, as slidefifteen.js lays it: its middle FRAME.D out from the board's edge, corners
// of radius FRAME.RC, and the slip roads into and out of each mouth bending on FRAME.R.
export const FRAME = { D: 30, RC: 44, R: 28, HW: 8, Y: 3.5 };
const LSIDE = SIZE + 2 * (FRAME.D - FRAME.RC) + (Math.PI * FRAME.RC) / 2;
export const LAP = 4 * LSIDE;
// how far round the lap a mouth is (side 3 W is driven first, heading +z, then N, E, S)
export const lapAt = (side, idx) => ((side + 1) % 4) * LSIDE + (side === 3 || side === 0 ? 50 + 100 * idx : SIZE - 50 - 100 * idx) - (FRAME.RC - FRAME.D);

const ease = (f) => f * f * f * (f * (f * 6 - 15) + 10);

// The puzzle with its tables: the cells after each move, worked back from the solved board. Once it's solved it
// doesn't stop: the `tail` moves repeat for as long as the race runs (they come back to the solved board each time
// round), so there's a tile to ride on the last lap too.
export class Puzzle {
  constructor(roads = ROADS, moves = MOVES, timing = TIMING, tail = TAIL) {
    this.roads = roads;
    this.moves = moves;
    this.tail = tail;
    this.T = timing;
    const solved = new Uint8Array(16);
    for (let k = 1; k <= 15; k++) solved[homeCell(k)] = k;
    const slide = (cur, k, j) => {
      const from = cur.indexOf(k);
      const to = cur.indexOf(0);
      const d = Math.abs((to % 4) - (from % 4)) + Math.abs((to >> 2) - (from >> 2));
      if (from < 0 || d !== 1) throw new Error(`slide ${j}: tile ${k} isn't beside the hole`);
      const next = Uint8Array.from(cur);
      next[to] = k;
      next[from] = 0;
      return { step: { k, from, to }, next };
    };
    // undo the moves from the solved board to find where each one starts
    this.states = [solved];
    this.steps = [];
    let cur = solved;
    for (let j = moves.length - 1; j >= 0; j--) {
      const k = moves[j];
      const to = cur.indexOf(k);
      const from = cur.indexOf(0);
      const d = Math.abs((to % 4) - (from % 4)) + Math.abs((to >> 2) - (from >> 2));
      if (d !== 1) throw new Error(`slide ${j}: tile ${k} isn't beside the hole`);
      const prev = Uint8Array.from(cur);
      prev[from] = k;
      prev[to] = 0;
      this.states.unshift(prev);
      this.steps.unshift({ k, from, to });
      cur = prev;
    }
    // the tail, forward from the solved board, and back to it
    this.tailStates = [solved];
    this.tailSteps = [];
    cur = solved;
    tail.forEach((k, j) => {
      const { step, next } = slide(cur, k, `tail ${j}`);
      this.tailSteps.push(step);
      this.tailStates.push(next);
      cur = next;
    });
    if (tail.length && cur.some((k, c) => k !== solved[c])) throw new Error("the tail doesn't end on the solved board");
    // and the board mid-slide: the tile on the move is in neither cell
    const mid = (st, s) => {
      const m = Uint8Array.from(st);
      m[s.from] = 0;
      return m;
    };
    this.mid = this.steps.map((s, j) => mid(this.states[j], s));
    this.tailMid = this.tailSteps.map((s, j) => mid(this.tailStates[j], s));
    this.end = timing.START + (moves.length - 1) * timing.PERIOD + timing.SLIDE;
    this._b = { cells: null, moving: null, f: 0, warn: null, next: null, after: null, done: 0, count: 0, whole: false };
  }

  // Slide number j (0 the first), the board before it, and the board during it: the solving moves, then the tail
  // round and round. null past the end when there's no tail.
  stepAt(j) {
    const n = this.steps.length;
    if (j < n) return this.steps[j];
    return this.tailSteps.length ? this.tailSteps[(j - n) % this.tailSteps.length] : null;
  }
  stateAt(j) {
    const n = this.steps.length;
    if (j <= n) return this.states[j];
    return this.tailSteps.length ? this.tailStates[(j - n) % this.tailSteps.length] : this.states[n];
  }
  midAt(j) {
    const n = this.steps.length;
    return j < n ? this.mid[j] : this.tailMid[(j - n) % this.tailSteps.length];
  }

  // The board at race time t: { cells (tile in each cell, 0 for the hole or for a tile mid-slide), moving (the step
  // under way, or null), f (how far along, eased), warn (the step about to start, or null), next and after (the
  // next two steps to come, whether or not they're close), count (slides finished), whole (the picture is
  // complete and still), done (slides finished toward solving it: steps.length while it's whole) }.
  // The same object every call.
  at(t) {
    const { START, PERIOD, SLIDE, WARN } = this.T;
    const B = this._b;
    const n = this.steps.length;
    const j = Math.floor((t - START) / PERIOD);
    B.moving = B.warn = null;
    B.f = 0;
    B.whole = false;
    const cur = j >= 0 ? this.stepAt(j) : null;
    if (cur && t - START - j * PERIOD < SLIDE) {
      B.moving = cur;
      B.f = ease((t - START - j * PERIOD) / SLIDE);
      B.cells = this.midAt(j);
      B.count = j;
      B.done = Math.min(j, n - 1);
      B.next = this.stepAt(j + 1);
      B.after = this.stepAt(j + 2);
      return B;
    }
    const count = Math.max(0, cur ? j + 1 : Math.min(n, j + 1));
    B.count = count;
    B.cells = this.stateAt(count);
    B.next = this.stepAt(count);
    B.after = this.stepAt(count + 1);
    B.whole = count >= n && B.cells.every((k, c) => k === this.states[n][c]);
    B.done = B.whole ? n : Math.min(count, n - 1);
    if (B.next && START + count * PERIOD - t <= WARN) B.warn = B.next;
    return B;
  }

  // Seconds from t until tile k next sets off (0 while it's sliding; k 0: until anything does, which is when the
  // hole moves). Infinity if it never will.
  nextMove(k, t) {
    const { START, PERIOD, SLIDE } = this.T;
    const j0 = Math.max(0, Math.floor((t - START) / PERIOD));
    for (let j = j0; j < j0 + 40; j++) {
      const s = this.stepAt(j);
      if (!s) return Infinity;
      if (k && s.k !== k) continue;
      const t0 = START + j * PERIOD;
      if (t < t0 + SLIDE) return Math.max(0, t0 - t);
    }
    return Infinity;
  }

  // Where tile k is at time t (x, z of its middle), into out.
  place(k, t, out) {
    const B = this.at(t);
    if (B.moving?.k === k) {
      const { from, to } = B.moving;
      out.x = cellX(from) + (cellX(to) - cellX(from)) * B.f;
      out.z = cellZ(from) + (cellZ(to) - cellZ(from)) * B.f;
      out.moving = true;
      out.busy = true;
      return out;
    }
    const cell = B.cells.indexOf(k);
    out.x = cellX(cell);
    out.z = cellZ(cell);
    out.moving = false;
    out.busy = B.warn?.k === k;
    return out;
  }

  // The other end of tile k's road in a colour (0 red, 1 blue) from the side you come in by, or -1 if it has no
  // end there.
  through(k, colour, side) {
    const [a, b] = this.roads[k][colour];
    return a === side ? b : b === side ? a : -1;
  }

  // Parked on tile k (0: the empty slot) at time t, at the end of its road on `side`: does that end meet a road
  // (or the edge of the board, where there's always a way out) within `within` seconds?
  joins(k, colour, side, t, within = 8) {
    for (let tt = t; tt <= t + within; tt += 0.3) {
      const B = this.at(tt);
      const at = k ? B.cells.indexOf(k) : B.moving ? -1 : B.cells.indexOf(0);
      if (at < 0) continue;
      const c = (at % 4) + DX[side];
      const r = (at >> 2) + DZ[side];
      if (c < 0 || c > 3 || r < 0 || r > 3) return true;
      const k2 = B.cells[c + 4 * r];
      if (k2 ? this.through(k2, colour, opp(side)) >= 0 : colour === 0 && !B.moving) return true;
    }
    return false;
  }

  // Drive in at a mouth (side, and which cell along it) at time t0, in a colour, and see where the road leads:
  // { side, idx, t, length, carried, waited } where and when you come out (carried: slides ridden on the way,
  // waited: seconds spent parked), or null if it never gets you out (a wait of more than `patience` at any one
  // cap). v: speed on a straight; bends are taken slower. The empty slot counts as a tile (k 0) with a red road
  // straight through it either way; it moves whenever anything does.
  ride(side, idx, colour, t0, v = 52, patience = 5.5) {
    let cell = mouthCell(side, idx);
    let B = this.at(t0);
    let k = B.cells[cell];
    if (k ? B.warn?.k === k : colour !== 0 || B.moving) return null;
    let inSide = side;
    let t = t0;
    let length = 0;
    let carried = 0;
    let parked = 0;
    for (let hop = 0; hop < 24; hop++) {
      const out = k ? this.through(k, colour, inSide) : opp(inSide);
      if (out < 0) return null;
      const straight = opp(out) === inSide;
      const len = straight ? TILE : (Math.PI * TILE) / 4;
      length += len;
      t += len / (straight ? v : Math.min(v, 44));
      // at the far end: on, if the next tile's road meets this one; else wait (the tile may carry us meanwhile)
      let waited = 0;
      for (;;) {
        B = this.at(t);
        const at = k ? B.cells.indexOf(k) : B.moving ? -1 : B.cells.indexOf(0);
        if (at >= 0) {
          const c = (at % 4) + DX[out];
          const r = (at >> 2) + DZ[out];
          if (at !== cell) carried++;
          cell = at;
          if (c < 0 || c > 3 || r < 0 || r > 3) return { side: out, idx: out % 2 ? at >> 2 : at % 4, t, length, carried, waited: parked };
          const k2 = B.cells[c + 4 * r];
          if (k2 ? this.through(k2, colour, opp(out)) >= 0 : colour === 0 && !B.moving) {
            k = k2;
            cell = c + 4 * r;
            inSide = opp(out);
            break;
          }
        }
        t += 0.2;
        waited += 0.2;
        parked += 0.2;
        if (waited > patience) return null;
      }
    }
    return null;
  }
}

// Seconds saved by driving in at a mouth at t0 (on the board at t0) instead of staying on the frame, or null if the
// road doesn't get you out, or puts you out behind where you went in. { gain, out } with out as ride() gives it.
export function worth(P, side, idx, colour, t0, v) {
  const out = P.ride(side, idx, colour, t0, v);
  if (!out) return null;
  const slip = FRAME.R + 8;
  let dq = lapAt(out.side, out.idx) + slip - (lapAt(side, idx) - slip);
  dq = ((dq % LAP) + LAP) % LAP;
  if (dq > LAP * 0.6) return null;
  return { gain: dq / 56 - (out.t - t0 + 2.9), out };
}

// The cell behind a mouth: the idx-th along that side (idx is the column for N and S, the row for E and W).
export const mouthCell = (side, idx) => (side === 0 ? idx + 12 : side === 2 ? idx : side === 1 ? 3 + 4 * idx : 4 * idx);
