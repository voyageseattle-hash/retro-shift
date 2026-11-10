// Finds the numbers that close the DYSON SPHERE road (js/world/dyson-walk.js): the flat walk has to end where it
// began, so does the same road rolled out over the shell, and no two strands of it may run into each other or
// through an opening. Prints D to paste into dyson-walk.js.
//   node tools/dyson-solve.mjs [--search 200] [--svg out.svg] [--report]
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE = await import(join(root, 'vendor/three.js'));
const { Path } = await import(join(root, 'js/world/track.js'));
const { walk, rollMain, R } = await import(join(root, 'js/world/dyson-shape.js'));
const { segments, D, BENDS } = await import(join(root, 'js/world/dyson-walk.js'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

// what the closing solve may move (lengths in metres, bends in degrees)
const FREE = (arg('--free', 'out2,in6,in11,home3,in12,out1,out3,in2,in5,in7,in10')).split(',');
// what the search for clear road may move as well
const LOOSE = ['grid', 'out4', 'in1', 'in3', 'in4', 'in8', 'in9', 'in13', 'home1', 'dive1span', 'dive2span', 'dive3span', 'in11b', 'out2', 'in6', 'in11', 'home3', 'in12', 'out1', 'out3', 'in2', 'in5', 'in7', 'in10'];
const MAXSPAN = 1.45;
const MIN = { dive1span: 0.8, dive2span: 0.8, grid: 120, out2: 60, out4: 60, in1: 50, in3: 50, in4: 50, in6: 250, in8: 50, in9: 50, in11: 60, in11b: 60, dive3span: 0.35, in13: 50, home1: 60, home3: 25 };
const scale = (k) => (k.endsWith('span') ? 0.1 : BENDS.includes(k) ? 6 : 60);

export function build(d) {
  const W = walk(segments(d));
  const path = new Path('main', W.pts.map(([x, z, y]) => new THREE.Vector3(x, y, z)), true, 10, {});
  const miss = rollMain(path, W.marks, W.length);
  return { W, path, miss };
}
function residual(d) {
  const { W, miss } = build(d);
  return [W.miss[0], W.miss[1], miss[0], miss[1], miss[2] * 300, miss[3] * 1e4];
}
const norm = (r) => Math.hypot(...r);

// Levenberg-Marquardt on the FREE numbers, taking the smallest change that closes the road
function close(d0) {
  let d = { ...d0 };
  let r = residual(d);
  let lam = 1e-2;
  for (let it = 0; it < 60 && norm(r) > 1e-4; it++) {
    const n = FREE.length;
    const J = FREE.map((k) => {
      const q = { ...d, [k]: d[k] + 0.5 * (scale(k) / 60) };
      const rq = residual(q);
      return rq.map((v, i) => (v - r[i]) / (0.5 * (scale(k) / 60)));
    });
    const A = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J[a].reduce((s, v, i) => s + v * J[b][i], 0) + (a === b ? lam / scale(FREE[a]) ** 2 : 0)));
    const g = Array.from({ length: n }, (_, a) => -J[a].reduce((s, v, i) => s + v * r[i], 0));
    for (let a = 0; a < n; a++) {
      let piv = a;
      for (let b = a + 1; b < n; b++) if (Math.abs(A[b][a]) > Math.abs(A[piv][a])) piv = b;
      [A[a], A[piv]] = [A[piv], A[a]];
      [g[a], g[piv]] = [g[piv], g[a]];
      for (let b = a + 1; b < n; b++) {
        const f = A[b][a] / A[a][a];
        for (let c = a; c < n; c++) A[b][c] -= f * A[a][c];
        g[b] -= f * g[a];
      }
    }
    const dp = new Array(n).fill(0);
    for (let a = n - 1; a >= 0; a--) dp[a] = (g[a] - A[a].slice(a + 1).reduce((s, v, c) => s + v * dp[a + 1 + c], 0)) / A[a][a];
    const big = Math.max(...dp.map((v, k) => Math.abs(v) / scale(FREE[k])));
    const sc = big > 1 ? 1 / big : 1;
    const q = { ...d };
    FREE.forEach((k, a) => (q[k] += dp[a] * sc));
    const rq = residual(q);
    if (norm(rq) < norm(r)) {
      d = q;
      r = rq;
      lam = Math.max(1e-7, lam * 0.4);
    } else lam *= 6;
  }
  return { d, err: norm(r) };
}

// How well the strands keep clear: the nearest two pieces of road on the same side of the shell come, and the
// nearest any road comes to an opening that isn't its own.
function clearance(B) {
  const { W, path } = B;
  const F = path.frames;
  const N = path.N;
  const rad = (i) => Math.hypot(F.o[i * 3], F.o[i * 3 + 1], F.o[i * 3 + 2]);
  const name = (i) => { const dd = (i / N) * W.length; return W.marks.find((m) => dd >= m.d0 && dd < m.d1)?.seg.name; };
  let road = { d: 1e9 };
  const side = new Int8Array(N);
  for (let i = 0; i < N; i++) side[i] = rad(i) > R ? 1 : -1;
  for (let i = 0; i < N; i += 3) for (let j = i + 90; j < N; j += 3) {
    if (N - j + i < 90 || side[i] !== side[j]) continue;
    const dd = Math.hypot(F.o[i * 3] - F.o[j * 3], F.o[i * 3 + 1] - F.o[j * 3 + 1], F.o[i * 3 + 2] - F.o[j * 3 + 2]);
    if (dd < road.d) road = { d: dd, a: name(i), b: name(j) };
  }
  let open = { d: 1e9 };
  for (const m of W.marks.filter((q) => q.seg.kind === 'rim')) {
    const i0 = path.index(m.d0 / W.length);
    const i1 = path.index(m.d1 / W.length);
    let best = i0;
    for (let i = i0; i <= i1; i++) if (Math.abs(rad(i) - R) < Math.abs(rad(best) - R) && Math.abs(i - (i0 + i1) / 2) < 30) best = i;
    // the opening's middle: straight across the throat from its deepest point
    const c = new THREE.Vector3(F.o[best * 3], F.o[best * 3 + 1], F.o[best * 3 + 2]);
    const nn = new THREE.Vector3(F.n[best * 3], F.n[best * 3 + 1], F.n[best * 3 + 2]);
    const axis = c.clone().addScaledVector(nn, 28).normalize();
    m.axis = axis;
    for (let i = 0; i < N; i += 2) {
      if (i > i0 - 70 && i < i1 + 70) continue;
      const o = new THREE.Vector3(F.o[i * 3], F.o[i * 3 + 1], F.o[i * 3 + 2]);
      // (a dive passing high over an opening is clear of it)
      const dd = Math.acos(Math.min(1, o.clone().normalize().dot(axis))) * R + Math.max(0, Math.abs(rad(i) - R) - 60);
      if (dd < open.d) open = { d: dd, a: m.seg.name, b: name(i) };
    }
  }
  return { road, open };
}
function score(d) {
  for (const k in MIN) if (d[k] < MIN[k]) return { s: -1e9 };
  for (const k of BENDS) if (d[k] < 8 || d[k] > 110) return { s: -1e9 };
  const home2 = 360 - BENDS.reduce((s, k) => s + d[k], 0);
  if (home2 < 8 || home2 > 110) return { s: -1e9 };
  if (d.dive1span > MAXSPAN || d.dive2span > MAXSPAN || d.dive3span > 0.9) return { s: -1e9 };
  const B = build(d);
  if (B.W.length > 7200) return { s: -1e9 };
  const c = clearance(B);
  return { s: Math.min(c.road.d / 70, c.open.d / 200, 1.2) - Math.max(0, B.W.length - 6000) / 4000, c, B };
}

const D0 = { ...D };
for (const kv of (arg('--set', '') || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); D0[k] = +v; }
if (process.argv.includes('--scan')) {
  for (let a = -24; a <= 24; a += 8) for (let b = -24; b <= 24; b += 8) {
    const q = { ...D0, in2: D0.in2 + a, in10: D0.in10 - a, in5: D0.in5 + b, in12: D0.in12 - b };
    const c = close(q);
    const s = c.err < 1e-3 ? score(c.d) : null;
    console.log(a, b, c.err < 1e-3 ? (s.c ? `road ${s.c.road.d.toFixed(0)} ${s.c.road.a}/${s.c.road.b} open ${s.c.open.d.toFixed(0)} ${s.c.open.a}/${s.c.open.b} len ${s.B.W.length.toFixed(0)}` : 'out of bounds') : 'no close');
  }
  process.exit(0);
}
let { d, err } = close(D0);
console.log('closed to', err.toExponential(2));
let best = { d, ...score(d) };
console.log('clear road', best.c?.road, 'openings', best.c?.open, 'score', best.s.toFixed(3));
const tries = Number(arg('--search', 0));
let seed = Number(arg('--seed', 12345));
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
// Walk the numbers along directions that leave the road closed (a random push with the part that would open it
// taken out), keeping whatever leaves the strands clearer.
function nullStep(d0, push) {
  const r0 = residual(d0).slice(0, 5);
  const J = LOOSE.map((k) => {
    const h = 0.5 * (scale(k) / 60);
    const rq = residual({ ...d0, [k]: d0[k] + h }).slice(0, 5);
    return rq.map((v, i) => (v - r0[i]) / h);
  }); // J[k][i]
  const n = LOOSE.length;
  // (J J^T) y = J push ; push -= J^T y
  const A = Array.from({ length: 5 }, (_, a) => Array.from({ length: 5 }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0) + (a === b ? 1e-9 : 0)));
  const g = Array.from({ length: 5 }, (_, a) => J.reduce((s, row, k) => s + row[a] * push[k], 0));
  for (let a = 0; a < 5; a++) {
    for (let b = a + 1; b < 5; b++) {
      const f = A[b][a] / A[a][a];
      for (let c = a; c < 5; c++) A[b][c] -= f * A[a][c];
      g[b] -= f * g[a];
    }
  }
  const y = new Array(5).fill(0);
  for (let a = 4; a >= 0; a--) y[a] = (g[a] - A[a].slice(a + 1).reduce((s, v, c) => s + v * y[a + 1 + c], 0)) / A[a][a];
  const q = { ...d0 };
  for (let k = 0; k < n; k++) q[LOOSE[k]] += push[k] - J[k].reduce((s, v, i) => s + v * y[i], 0);
  return q;
}
let amp = 0.5;
for (let k = 0; k < tries && best.s < 0.98; k++) {
  const push = LOOSE.map((key) => rnd() * scale(key) * amp * (Math.abs(rnd()) < 0.5 ? 1 : 0));
  const c = close(nullStep(best.d, push));
  if (c.err > 1e-3) { amp = Math.max(0.05, amp * 0.9); continue; }
  const s = score(c.d);
  if (s.s > best.s) {
    best = { d: c.d, ...s };
    amp = Math.min(1.5, amp * 1.3);
    console.log(k, 'score', s.s.toFixed(3), 'road', s.c.road.d.toFixed(0), s.c.road.a, s.c.road.b, 'opening', s.c.open.d.toFixed(0), s.c.open.a, s.c.open.b, 'length', s.B.W.length.toFixed(0));
  } else amp = Math.max(0.05, amp * 0.93);
}
d = best.d;
const { W, path, miss } = build(d);
console.log('flat miss', W.miss.map((v) => v.toFixed(4)), 'rolled miss', miss.map((v) => v.toFixed(5)), 'length', W.length.toFixed(0), 'samples', path.N);
console.log('export const D = {\n  ' + Object.keys(D).map((k) => `${k}: ${+d[k].toFixed(k.endsWith('span') ? 5 : 4)}`).join(', ') + ',\n};');
if (process.argv.includes('--report')) for (const m of W.marks) console.log(`  ${m.seg.name.padEnd(8)} ${m.d0.toFixed(0).padStart(5)} to ${m.d1.toFixed(0).padStart(5)}  ${(m.d0 / W.length).toFixed(4)}`);

const svg = arg('--svg');
if (svg) {
  const F = path.frames;
  const views = [[0, 2, 1], [0, 1, 2], [2, 1, 0]]; // which axes across, up, toward you
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="2100" height="1100" viewBox="0 0 2100 1100" style="background:#000" font-family="sans-serif" font-size="13">`;
  views.forEach(([ax, ay, az], v) => {
    const cx = 350 + v * 700, cy = 350, k = 0.5;
    s += `<circle cx="${cx}" cy="${cy}" r="${R * k}" fill="none" stroke="#444"/>`;
    for (const front of [false, true]) {
      let dd = '';
      let pen = false;
      for (let i = 0; i <= path.N; i++) {
        const j = (i % path.N) * 3;
        const o = [F.o[j], F.o[j + 1], F.o[j + 2]];
        const inside = Math.hypot(...o) < R;
        const vis = o[az] > 0 === front;
        if (!vis) { pen = false; continue; }
        dd += `${pen ? 'L' : 'M'}${(cx + o[ax] * k).toFixed(1)} ${(cy - o[ay] * k).toFixed(1)}`;
        pen = true;
        if (i % 40 === 0) s += `<circle cx="${cx + o[ax] * k}" cy="${cy - o[ay] * k}" r="2.5" fill="${inside ? '#fa0' : '#0af'}" opacity="${front ? 1 : 0.35}"/>`;
      }
      s += `<path d="${dd}" fill="none" stroke="#fff" stroke-width="1.5" opacity="${front ? 1 : 0.3}"/>`;
    }
    for (const m of W.marks) {
      const j = path.index(((m.d0 + m.d1) / 2) / W.length) * 3;
      s += `<text x="${cx + F.o[j + ax] * k + 4}" y="${cy - F.o[j + ay] * k}" fill="${F.o[j + az] > 0 ? '#8f8' : '#585'}">${m.seg.name}</text>`;
    }
    s += `<circle cx="${cx + F.o[ax] * k}" cy="${cy - F.o[ay] * k}" r="6" fill="#0f0"/>`;
  });
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (let i = 0; i < path.N; i++) { minx = Math.min(minx, path.px[i]); maxx = Math.max(maxx, path.px[i]); minz = Math.min(minz, path.pz[i]); maxz = Math.max(maxz, path.pz[i]); }
  const k = Math.min(1900 / (maxx - minx), 330 / (maxz - minz));
  let dd = '';
  for (let i = 0; i <= path.N; i++) dd += `${i ? 'L' : 'M'}${(50 + (path.px[i % path.N] - minx) * k).toFixed(1)} ${(1090 - (path.pz[i % path.N] - minz) * k).toFixed(1)}`;
  s += `<path d="${dd}" fill="none" stroke="#0f8" stroke-width="2"/></svg>`;
  writeFileSync(svg, s);
}
