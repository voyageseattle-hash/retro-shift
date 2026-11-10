// The shape of the DYSON SPHERE course (dyson.js): a shell round a star, with the road on the outside of the shell,
// over the rim of an opening, round the inside under the star, and out over the rim of another.
//
// The road is laid out flat first, as a list of straights and turns (a turtle walk), because the physics drives the
// flat road. Then the flat road is rolled out over the shell (curved.js): turns stay turns, and a straight is free to
// go wherever a straight line on the surface goes. That freedom is what the big pieces are made of. Each is a stretch
// of dead-straight flat road drawn along a curve in the plane through the star:
//
//   rim    over the lip of an opening: up the collar, over the top, down the throat, and out underneath heading back
//          the way you came, on the other side of the shell
//   dive   off the inside of the shell on a long arc toward the star and back down
//   crest  the same on the outside: a hump out into space
//
// The flat walk has to close, and so does the rolled one (the lap ends where it began on the shell too). SOLVED below
// holds the numbers that make both close; tools/dyson-solve.mjs finds them again if the walk changes.

import * as THREE from '../../vendor/three.js';
import { newFrames, putFrame, rollSphere, rollStep, drawnAt, drawnDir } from './curved.js';

export const R = 640; // the shell
export const DECK = 5; // the road rides this far off it, either side
export const STAR = 215; // the star's radius
const TUBE = 36; // the collar round an opening: a ring of this radius, bedded in the shell
const FILLET = 50; // the ramp up onto it
export const UC = 64; // from the opening's middle to the collar's
export const COLLAR = { TUBE, FILLET, UC };

const DEG = Math.PI / 180;

// ------------------------------------------------------------------ profiles
// A profile is a curve in the plane of (the way you're heading, up off the road) as you come onto it, from (0, 0)
// heading +x. Kept as a table by distance along it.
function table(pts) {
  const n = pts.length;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { pts, s, L: s[n - 1] };
}
// place and heading at distance d along a table
function along(tab, d, out) {
  const { pts, s } = tab;
  const n = pts.length;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid] <= d) lo = mid;
    else hi = mid;
  }
  const u = Math.max(0, Math.min(1, (d - s[lo]) / (s[hi] - s[lo] || 1)));
  out.x = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * u;
  out.y = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * u;
  // heading: between the chords either side, so it turns smoothly
  const dir = (k) => {
    const a = Math.max(0, Math.min(n - 2, k));
    const l = s[a + 1] - s[a] || 1;
    return [(pts[a + 1][0] - pts[a][0]) / l, (pts[a + 1][1] - pts[a][1]) / l];
  };
  const [ax, ay] = dir(u < 0.5 ? lo - 1 : lo);
  const [bx, by] = dir(u < 0.5 ? lo : lo + 1);
  const w = u < 0.5 ? u + 0.5 : u - 0.5;
  const tx = ax + (bx - ax) * w;
  const ty = ay + (by - ay) * w;
  const l = Math.hypot(tx, ty) || 1;
  out.tx = tx / l;
  out.ty = ty / l;
  return out;
}

function arc(out, cx, cy, r, a0, a1, step = 0.5) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step));
  for (let k = out.length ? 1 : 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
}
// the angle from a to b going the way `sign` turns (+1 anticlockwise)
function sweep(a, b, sign) {
  let d = b - a;
  while (sign > 0 && d < 0) d += Math.PI * 2;
  while (sign < 0 && d > 0) d -= Math.PI * 2;
  return a + d;
}

// The rim, in the plane through the star and the opening's middle: x away from the opening, y out along its axis.
// Three arcs, each touching the next: a ramp up off the outer deck, the collar (over its top, down the throat, back
// up underneath), and a ramp down onto the inner deck.
const RIM = (() => {
  const gt = UC / R;
  const a = R + DECK + FILLET;
  const b = R - DECK - FILLET;
  const d1 = Math.acos((a * a + R * R - (TUBE + FILLET) ** 2) / (2 * a * R));
  const d2 = Math.acos((b * b + R * R - (TUBE + FILLET) ** 2) / (2 * b * R));
  const G1 = gt + d1;
  const G2 = gt + d2;
  const at = (r, g) => [r * Math.sin(g), r * Math.cos(g)];
  const P1 = at(R + DECK, G1);
  const F1 = at(a, G1);
  const C = at(R, gt);
  const F2 = at(b, G2);
  const P2 = at(R - DECK, G2);
  const ang = (p, c) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const pts = [];
  let a0 = ang(P1, F1);
  arc(pts, F1[0], F1[1], FILLET, a0, sweep(a0, ang(C, F1), -1));
  a0 = ang(F1, C);
  arc(pts, C[0], C[1], TUBE, a0, sweep(a0, ang(F2, C), 1));
  a0 = ang(C, F2);
  arc(pts, F2[0], F2[1], FILLET, a0, sweep(a0, ang(P2, F2), -1));
  return { pts, G1, G2, P1, P2, gt, C };
})();

// going in (outside to inside) or coming out, as a profile from where you come onto it
function rimProfile(inward) {
  const { pts, G1, G2, P1, P2 } = RIM;
  const G = inward ? G1 : G2;
  const P = inward ? P1 : P2;
  const tx = -Math.cos(G);
  const ty = Math.sin(G); // heading for the opening
  const s = inward ? 1 : -1;
  const nx = s * Math.sin(G);
  const ny = s * Math.cos(G); // up off the road: away from the star outside, toward it inside
  const src = inward ? pts : pts.slice().reverse();
  return table(src.map(([x, y]) => [(x - P[0]) * tx + (y - P[1]) * ty, (x - P[0]) * nx + (y - P[1]) * ny]));
}
// How far round the shell from where the rim starts to the middle of its opening (for the scenery).
export const RIM_PTS = RIM.pts;
export const RIM_REACH = { in: RIM.G1, out: RIM.G2 };

// A dive (inside) or a crest (outside): the road leaves the deck, swings `h` metres up off it over `span` radians
// round the shell, and comes back down onto it.
function humpProfile(sign, h, span, ramp = 0.42) {
  const r0 = R + sign * DECK;
  const pts = [];
  const n = Math.ceil((span * r0) / 0.5);
  const ease = (q) => q * q * q * (q * (q * 6 - 15) + 10);
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const f = u * span;
    // up over the first part, level along the top, down over the last
    const lift = u < ramp ? ease(u / ramp) : u > 1 - ramp ? ease((1 - u) / ramp) : 1;
    // (up off the road is away from the star outside and toward it inside)
    const r = r0 + sign * h * lift;
    pts.push([r * Math.sin(f), sign * (r * Math.cos(f) - r0)]);
  }
  return table(pts);
}

function profileFor(seg, sign) {
  if (seg.kind === 'rim') return rimProfile(sign > 0);
  return humpProfile(sign, seg.h, seg.span, seg.ramp);
}
// its length, for laying the flat walk out
export function profileLength(seg, sign) {
  return profileFor(seg, sign).L;
}

// ------------------------------------------------------------------ the flat walk
// segs: { len } a straight; { turn (radians, + left), r } a bend; { kind: 'rim' | 'dive' | 'crest', ... } a straight
// as long as its profile. Returns the control points, where each segment starts (metres), and how far it missed
// closing by.
export function walk(segs) {
  let x = 0;
  let z = 0;
  let h = 0;
  let d = 0;
  let sign = 1;
  const pts = [];
  const marks = [];
  const put = () => pts.push([x, z, 0]);
  const STEP = 26;
  for (const s of segs) {
    const mark = { seg: s, d0: d, sign };
    marks.push(mark);
    if (s.turn !== undefined) {
      const L = Math.abs(s.turn) * s.r;
      const n = Math.max(2, Math.round(L / STEP));
      const da = s.turn / n;
      for (let k = 0; k < n; k++) {
        put();
        // an exact chord of the arc
        const c = 2 * s.r * Math.sin(Math.abs(da) / 2);
        x += Math.sin(h + da / 2) * c;
        z += Math.cos(h + da / 2) * c;
        h += da;
      }
      d += L;
    } else {
      const L = s.kind ? profileLength(s, sign) + (s.lead ?? 0) * 2 : s.len;
      mark.lead = s.kind ? s.lead ?? 0 : 0;
      // where its profile starts, exactly
      if (s.kind) mark.entry = { x: x + Math.sin(h) * mark.lead, z: z + Math.cos(h) * mark.lead, thx: Math.sin(h), thz: Math.cos(h) };
      const n = Math.max(1, Math.round(L / STEP));
      for (let k = 0; k < n; k++) {
        put();
        x += (Math.sin(h) * L) / n;
        z += (Math.cos(h) * L) / n;
      }
      d += L;
      if (s.kind === 'rim') sign = -sign;
    }
    mark.d1 = d;
  }
  return { pts, marks, length: d, miss: [x, z, h - Math.PI * 2] };
}

// ------------------------------------------------------------------ rolling it out
const _o = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _v = new THREE.Vector3();
const _p = {};

// The main road: over the shell by turns, along each profile where the walk has one. `marks` are the walk's, `total`
// its length. Returns how far the rolled road missed closing by: [along, across, heading].
export function rollMain(path, marks, total) {
  const N = path.N;
  const F = (path.frames = newFrames(N));
  const ahead = (e, i) => (path.px[i] - e.x) * e.thx + (path.pz[i] - e.z) * e.thz;
  const patches = marks
    .filter((m) => m.seg.kind)
    .map((m) => {
      // the first sample on the profile
      let i0 = Math.max(1, path.index((m.d0 + m.lead) / total) - 8);
      while (ahead(m.entry, i0) < 0) i0++;
      return { i0, seg: m.seg, e: m.entry };
    })
    .sort((a, b) => a.i0 - b.i0);
  // start on the outside, anywhere: on top, heading +z
  const o = _o.set(0, R + DECK, 0);
  const t = _t.set(0, 0, 1);
  const n = _n.set(0, 1, 0);
  let sign = 1;
  let radius = R + DECK;
  let cur = null;
  let next = 0;
  const turned = (thx, thz, i) => {
    const d = Math.atan2(path.thx[i], path.thz[i]) - Math.atan2(thx, thz);
    return Math.atan2(Math.sin(d), Math.cos(d));
  };
  // sample i by the profile it's on; returns how far past the profile's end it is
  const inPatch = (i) => {
    const e = cur.e;
    const dx = path.px[i] - e.x;
    const dz = path.pz[i] - e.z;
    const a = dx * e.thx + dz * e.thz;
    const c = -dx * e.thz + dz * e.thx;
    const q = along(cur.tab, Math.min(a, cur.tab.L), _p);
    o.copy(cur.o).addScaledVector(cur.t, q.x).addScaledVector(cur.n, q.y).addScaledVector(cur.w, c);
    t.copy(cur.t).multiplyScalar(q.tx).addScaledVector(cur.n, q.ty);
    n.copy(cur.t).multiplyScalar(-q.ty).addScaledVector(cur.n, q.tx);
    const d = turned(e.thx, e.thz, i);
    t.multiplyScalar(Math.cos(d)).addScaledVector(cur.w, -Math.sin(d));
    return a - cur.tab.L;
  };
  // off the end of a profile and back onto the shell, `over` metres on
  const leave = (over) => {
    o.addScaledVector(t, over);
    sign = Math.sign(n.dot(o)) || 1;
    radius = R + sign * DECK;
    o.setLength(radius);
    n.copy(o).normalize().multiplyScalar(sign);
    t.addScaledVector(n, -t.dot(n)).normalize();
    cur = null;
  };
  for (let i = 0; i < N; i++) {
    if (cur) {
      const over = inPatch(i);
      if (over > 0) leave(over);
    } else if (next < patches.length && patches[next].i0 === i) {
      // over the shell as far as the profile's start, then onto it
      const P = patches[next++];
      const e = P.e;
      const j = i - 1;
      rollStep(o, t, n, e.x - path.px[j], e.z - path.pz[j], path.thx[j], path.thz[j], -turned(e.thx, e.thz, j), radius, sign);
      cur = { e, tab: profileFor(P.seg, sign), o: o.clone(), t: t.clone(), n: n.clone(), w: new THREE.Vector3().crossVectors(t, n) };
      inPatch(i);
    } else if (i > 0) rollSphere(path, i - 1, i, o, t, n, radius, sign);
    putFrame(F, i, o, t, n);
  }
  // and round to the start again
  rollSphere(path, N - 1, 0, o, t, n, radius, sign);
  const o0 = _v.set(F.o[0], F.o[1], F.o[2]);
  const t0 = new THREE.Vector3(F.t[0], F.t[1], F.t[2]);
  const n0 = new THREE.Vector3(F.n[0], F.n[1], F.n[2]);
  const r0 = new THREE.Vector3().crossVectors(t0, n0);
  const dp = o.clone().sub(o0);
  const miss = [dp.dot(t0), dp.dot(r0), Math.atan2(-t.dot(r0), t.dot(t0)), sign > 0 ? 0 : 1];
  path.frameMiss = miss;
  return miss;
}

// A branch: rolled out over the shell from where it leaves the main road, and again backwards from where it
// rejoins, and the two blended along it (they differ by a metre or two: the shell isn't flat, so the same flat road
// rolled from either end doesn't quite meet itself). Branches keep to one side of the shell and clear of the rims.
export function rollBranch(main, path) {
  const N = path.N;
  const F = (path.frames = newFrames(N));
  const run = (from, to, mainU) => {
    const step = to > from ? 1 : -1;
    const im = main.nearest(path.px[from], path.pz[from], main.index(mainU));
    const o = drawnAt(main, im, new THREE.Vector3(path.px[from], 0, path.pz[from]));
    const sign = Math.sign(o.dot(new THREE.Vector3(main.frames.n[im * 3], main.frames.n[im * 3 + 1], main.frames.n[im * 3 + 2]))) || 1;
    const radius = R + sign * DECK;
    o.setLength(radius);
    const n = o.clone().normalize().multiplyScalar(sign);
    const t = drawnDir(main, im, new THREE.Vector3(path.thx[from], 0, path.thz[from]));
    t.addScaledVector(n, -t.dot(n)).normalize();
    const out = [];
    for (let i = from; ; i += step) {
      out[i] = [o.clone(), t.clone(), n.clone()];
      if (i === to) break;
      rollSphere(path, i, i + step, o, t, n, radius, sign);
    }
    return { out, sign, radius };
  };
  const A = run(0, N - 1, path.mainFrom);
  const B = run(N - 1, 0, path.mainTo);
  if (A.sign !== B.sign) console.warn(`dyson: branch ${path.id} leaves and rejoins on different sides of the shell`);
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const w = u < 0.15 ? 0 : u > 0.85 ? 1 : (() => { const q = (u - 0.15) / 0.7; return q * q * (3 - 2 * q); })();
    const o = A.out[i][0].lerp(B.out[i][0], w).setLength(A.radius);
    const n = o.clone().normalize().multiplyScalar(A.sign);
    const t = A.out[i][1].lerp(B.out[i][1], w);
    t.addScaledVector(n, -t.dot(n)).normalize();
    putFrame(F, i, o, t, n);
  }
}
