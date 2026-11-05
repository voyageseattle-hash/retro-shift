// Where on a course a hazard can set up: clear, nearly straight stretches of the main road, away from the start
// line, the walls and block fields, the bridges and the forks. The construction crew (game/construction.js) and
// the quake's fault zones (game/quake.js) both pick their ground from this list, so they never sit on top of a
// feature the course already has.

import { M } from './shift.js';

// Stretches of the main loop at least minLen metres long, longest first: [{ i0, n, u0, u1, len }] in samples and
// main-loop fractions. clear metres either side of every feature are kept free.
export function findSites(world, { minLen = 60, clear = 40, maxCurv = 0.012 } = {}) {
  const m = world.main;
  const N = m.N;
  const free = new Uint8Array(N).fill(1);
  const block = (i, metres) => {
    const k = Math.ceil(metres / m.ds);
    for (let q = -k; q <= k; q++) free[m.wrap(i + q)] = 0;
  };
  // the grid and the line
  block(0, 90);
  for (let i = 0; i < N; i++) {
    if (Math.abs(m.curv[i]) > maxCurv || !m.railL[i] || !m.railR[i]) free[i] = 0;
    // a one-world bridge (and a little either side of it)
    if (m.mask[i] !== M.ALL) block(i, 14);
    // a strip laid over the road (a fork leaving, a branch merging) counts as the road's business too
    if (m.jL?.[i] || m.jR?.[i]) free[i] = 0;
  }
  for (const o of world.obstacles) if (o.path === m) block(o.i, clear);
  for (const p of world.pads) if (p.path === m) block(p.i, clear * 0.5);
  for (const s of world.shards) if (s.path === m) block(s.i, 10);
  for (const p of world.paths) {
    if (p === m) continue;
    block(m.index(p.mainFrom), clear + 30);
    block(m.index(p.mainTo), clear + 30);
  }
  for (const z of world.storms || []) {
    const a = m.index((z.u0 + 1) % 1);
    const n = Math.round((((z.u1 - z.u0 + 1) % 1) * m.length) / m.ds);
    for (let q = 0; q < n; q++) free[m.wrap(a + q)] = 0;
  }
  // a water stretch or a drop/crest is a form test of its own: leave it be
  for (let i = 0; i < N; i++) if (m.water?.[i]) block(i, 20);
  for (const f of world.def.profile || []) block(m.index(f.at), (f.kind === 'drop' ? f.down + f.up : f.len) + clear);
  // runs of free samples (around the seam too)
  const runs = [];
  let start = -1;
  for (let k = 0; k <= N; k++) {
    const i = k % N;
    if (free[i] && start < 0) start = k;
    if ((!free[i] || k === N) && start >= 0) {
      const n = k - start;
      if (n * m.ds >= minLen) runs.push({ i0: m.wrap(start), n, len: n * m.ds });
      start = -1;
    }
  }
  runs.sort((a, b) => b.len - a.len);
  for (const r of runs) {
    r.u0 = r.i0 / N;
    r.u1 = ((r.i0 + r.n) % N) / N;
  }
  return runs;
}

// Metres from main-loop fraction a forward to b.
export function along(world, a, b) {
  let d = b - a;
  if (d < 0) d += 1;
  return d * world.main.length;
}
