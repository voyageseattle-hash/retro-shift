// Shift tracks: a closed main loop plus open branch paths (shortcuts, bridges, alternate routes). Every stretch of
// road, every obstacle and every pickup is tagged with the lenses it is solid in (see shift.js), so the track a racer
// drives on depends on the world they're looking through. The spline sampling, auto-banking and ground frame come
// from Absurd Combat Racing's TrackWorld; the multi-path, per-lens ground query is new.

import * as THREE from '../../vendor/three.js';
import { clamp, lerp, wrapAngle, mulberry32, smoothstep } from '../core/util.js';
import { M, BOTH, solidIn, colorForMask, COLORS } from './shift.js';
import { Layers } from './layers.js';
import { buildDecor } from './decor.js';
import { buildSigns } from './signs.js';
import { buildCovers } from './covers.js';
import { layStorms } from './storms-def.js';
import { layFormRoutes, addSlit } from './formroutes.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

// ------------------------------------------------------------------ one strip of road
export class Path {
  constructor(id, pts, closed, halfW, opts = {}) {
    this.id = id;
    this.closed = closed;
    this.halfW = halfW;
    const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal', 0.5);
    this.curve = curve;
    const L = curve.getLength();
    const N = Math.max(closed ? 200 : 16, Math.round(L / 2));
    this.N = N;
    this.length = L;
    this.ds = L / (closed ? N : N - 1);
    const F = () => new Float32Array(N);
    Object.assign(this, { px: F(), py: F(), pz: F(), thx: F(), thz: F(), tx: F(), ty: F(), tz: F(), bank: F(), curv: F(), nx: F(), ny: F(), nz: F(), tb: F() });
    this.mask = new Uint8Array(N).fill(M.ALL);
    this.railL = new Uint8Array(N).fill(1);
    this.railR = new Uint8Array(N).fill(1);
    const heading = F();
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const u = closed ? i / N : i / (N - 1);
      curve.getPointAt(u, p);
      curve.getTangentAt(u, t);
      this.px[i] = p.x;
      this.py[i] = p.y;
      this.pz[i] = p.z;
      this.tx[i] = t.x;
      this.ty[i] = t.y;
      this.tz[i] = t.z;
      const hl = Math.hypot(t.x, t.z) || 1;
      this.thx[i] = t.x / hl;
      this.thz[i] = t.z / hl;
      heading[i] = Math.atan2(t.x, t.z);
    }
    const idx = (i) => (closed ? (i + N) % N : clamp(i, 0, N - 1));
    const raw = F();
    for (let i = 0; i < N; i++) raw[i] = wrapAngle(heading[idx(i + 2)] - heading[idx(i - 2)]) / (4 * this.ds);
    const smooth = (src, w) => {
      const out = F();
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let k = -w; k <= w; k++) s += src[idx(i + k)];
        out[i] = s / (2 * w + 1);
      }
      return out;
    };
    this.curv = smooth(raw, 3);
    const bankFactor = opts.bankFactor ?? 6;
    const b0 = F();
    for (let i = 0; i < N; i++) b0[i] = clamp(this.curv[i] * bankFactor, -0.22, 0.22);
    this.bank = smooth(b0, 8);
    for (let i = 0; i < N; i++) {
      const tb = Math.tan(this.bank[i]);
      this.tb[i] = tb;
      // Banked right = (rx, tb, rz) with horizontal right (rx, rz) = (-thz, thx)... (x right when facing +z is -x? see below)
      const rx = -this.thz[i];
      const rz = this.thx[i];
      // normal = right x tangent (so it points up)
      const ax = rx, ay = tb, az = rz;
      const bx = this.tx[i], by = this.ty[i], bz = this.tz[i];
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      if (ny < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const nl = Math.hypot(nx, ny, nz) || 1;
      this.nx[i] = nx / nl;
      this.ny[i] = ny / nl;
      this.nz[i] = nz / nl;
    }
    if (opts.profile?.length) this.reshape(opts.profile);
    this.minY = Math.min(...this.py);
    this.maxY = Math.max(...this.py);
    // Main-loop fraction at each end, for branches (progress and AI).
    this.mainFrom = opts.mainFrom ?? 0;
    this.mainTo = opts.mainTo ?? 1;
  }

  // Drops and crests laid into the road after it's built: heights move, the tangents follow.
  //   drop: { at, kind: 'drop', depth, down, up }: a sharp lip, a steep fall, and a long climb back
  //   crest: { at, kind: 'crest', height, len }: a sharp rise and fall
  //   step: { at, kind: 'step', drop, len, back }: the road falls by `drop` over `len` (level at both ends) and
  //         climbs back over `back` metres before the path ends (open paths: a glide gap's far side sits lower)
  reshape(profile) {
    const N = this.N;
    for (const f of profile) {
      const i0 = this.index(f.at);
      if (f.kind === 'step') {
        const back = f.back ?? 60;
        const n1 = Math.round(f.len / this.ds);
        const iEnd = this.closed ? i0 + Math.round((f.len + 2 * back) / this.ds) : Math.round(N * (f.end ?? 0.85));
        const n2 = Math.round(back / this.ds);
        for (let i = i0; i <= iEnd; i++) {
          const k = i - i0;
          const down = smoothstep(0, 1, Math.min(1, k / n1));
          const up = i > iEnd - n2 ? smoothstep(0, 1, (i - (iEnd - n2)) / n2) : 0;
          this.py[this.wrap(i)] -= f.drop * down * (1 - up);
        }
        continue;
      }
      const span = f.kind === 'drop' ? f.down + f.up : f.len;
      const n = Math.round(span / this.ds);
      for (let k = 0; k <= n; k++) {
        const s = k * this.ds;
        let off = 0;
        if (f.kind === 'drop') {
          if (s < f.down) off = -f.depth * (1 - (1 - s / f.down) ** 2);
          else off = -f.depth * (1 - smoothstep(0, 1, (s - f.down) / f.up));
        } else off = f.height * Math.sin(Math.PI * Math.min(1, s / f.len)) ** 0.8;
        this.py[this.wrap(i0 + k)] += off;
      }
    }
    this.reframe();
  }

  // Tangents from the heights (the horizontal heading is unchanged) and normals from the bank: run again after
  // anything moves the heights or the bank.
  reframe() {
    const N = this.N;
    const ty = new Float32Array(N);
    for (let i = 0; i < N; i++) ty[i] = (this.py[this.wrap(i + 1)] - this.py[this.wrap(i - 1)]) / (2 * this.ds);
    for (let i = 0; i < N; i++) {
      const l = Math.hypot(1, ty[i]);
      this.tx[i] = this.thx[i] / l;
      this.tz[i] = this.thz[i] / l;
      this.ty[i] = ty[i] / l;
      this.tb[i] = Math.tan(this.bank[i]);
      // normal: right (with bank) crossed with the tangent
      const ax = -this.thz[i], ay = this.tb[i], az = this.thx[i];
      const bx = this.tx[i], by = this.ty[i], bz = this.tz[i];
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      if (ny < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const nl = Math.hypot(nx, ny, nz) || 1;
      this.nx[i] = nx / nl;
      this.ny[i] = ny / nl;
      this.nz[i] = nz / nl;
    }
  }

  wrap(i) {
    return this.closed ? ((i % this.N) + this.N) % this.N : clamp(i, 0, this.N - 1);
  }

  // Right-hand direction: with heading h = atan2(tx, tz), right is (-tz, tx)... we use the convention that
  // positive lat is to the driver's RIGHT when facing along the path.
  rightX(i) {
    return -this.thz[this.wrap(i)];
  }
  rightZ(i) {
    return this.thx[this.wrap(i)];
  }

  // Point on the road surface at sample i, lateral offset lat (+ = right), height h above it.
  point(i, lat, h = 0, out = new THREE.Vector3()) {
    i = this.wrap(i);
    const rx = this.rightX(i);
    const rz = this.rightZ(i);
    out.set(this.px[i] + rx * lat, this.py[i] + this.tb[i] * lat, this.pz[i] + rz * lat);
    if (h) out.addScaledVector(_d.set(this.nx[i], this.ny[i], this.nz[i]), h);
    return out;
  }
  pointF(f, lat, h = 0, out = new THREE.Vector3()) {
    const x = f * (this.closed ? this.N : this.N - 1);
    const i = Math.floor(x);
    const t = x - i;
    const a = this.point(i, lat, h, _a);
    const b = this.point(i + 1, lat, h, _b);
    return out.copy(a).lerp(b, t);
  }
  index(f) {
    return this.wrap(Math.round(f * (this.closed ? this.N : this.N - 1)));
  }
  frac(i) {
    return this.closed ? i / this.N : i / (this.N - 1);
  }
  // Main-loop fraction for a sample on this path.
  mainU(i) {
    if (this.closed) return i / this.N;
    let d = this.mainTo - this.mainFrom;
    if (d < 0) d += 1;
    return (this.mainFrom + d * (i / (this.N - 1))) % 1;
  }

  nearest(x, z, hint) {
    const N = this.N;
    const d2 = (i) => {
      const dx = this.px[i] - x;
      const dz = this.pz[i] - z;
      return dx * dx + dz * dz;
    };
    if (hint >= 0 && hint < N) {
      let i = hint;
      let best = d2(i);
      for (let step = 0; step < 64; step++) {
        const a = this.wrap(i + 1);
        const b = this.wrap(i - 1);
        const da = d2(a);
        const db = d2(b);
        if (da < best && da <= db) {
          best = da;
          i = a;
        } else if (db < best) {
          best = db;
          i = b;
        } else break;
      }
      if (best < (this.halfW * 3) ** 2) return i;
    }
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < N; i += 2) {
      const d = d2(i);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    for (let k = -2; k <= 2; k++) {
      const i = this.wrap(bi + k);
      const d = d2(i);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return bi;
  }

  // Road frame under (x, z) near hint: fills out and returns true if (x, z) is over this strip.
  frame(x, z, hint, out) {
    const i = this.nearest(x, z, hint);
    const dx = x - this.px[i];
    const dz = z - this.pz[i];
    const along = dx * this.thx[i] + dz * this.thz[i];
    let i0 = i;
    let i1;
    let t;
    if (along >= 0) {
      i1 = i + 1;
      t = along / this.ds;
    } else {
      i0 = i - 1;
      i1 = i;
      t = 1 + along / this.ds;
    }
    if (!this.closed && (i0 < 0 || i1 > this.N - 1)) return false;
    i0 = this.wrap(i0);
    i1 = this.wrap(i1);
    t = clamp(t, 0, 1);
    const cx = lerp(this.px[i0], this.px[i1], t);
    const cy = lerp(this.py[i0], this.py[i1], t);
    const cz = lerp(this.pz[i0], this.pz[i1], t);
    const rx = lerp(this.rightX(i0), this.rightX(i1), t);
    const rz = lerp(this.rightZ(i0), this.rightZ(i1), t);
    const rl = Math.hypot(rx, rz) || 1;
    const lat = ((x - cx) * rx + (z - cz) * rz) / rl;
    const tb = lerp(this.tb[i0], this.tb[i1], t);
    out.path = this;
    out.i = t < 0.5 ? i0 : i1;
    out.f = (i0 + t) / (this.closed ? this.N : this.N - 1);
    out.lat = lat;
    out.y = cy + tb * lat;
    out.nx = lerp(this.nx[i0], this.nx[i1], t);
    out.ny = lerp(this.ny[i0], this.ny[i1], t);
    out.nz = lerp(this.nz[i0], this.nz[i1], t);
    out.rx = rx / rl;
    out.rz = rz / rl;
    out.mask = this.mask[out.i];
    return true;
  }
}

// ------------------------------------------------------------------ the whole course
export class TrackWorld {
  constructor(def, opts = {}) {
    this.def = def;
    this.type = 'track';
    this.theme = def.theme || {};
    this.halfWidth = def.halfWidth ?? 10;
    this.group = new THREE.Group();
    this.layers = new Layers();
    this.rng = mulberry32(def.seed || 7);
    this.paths = [];
    this.animated = [];
    this.obstacles = [];
    this.pads = [];
    this.shards = [];
    this.buildMain();
    this.buildBranches();
    this.applyGaps();
    layFormRoutes(this);
    this.minY = Math.min(...this.paths.map((p) => p.minY));
    this.maxY = Math.max(...this.paths.map((p) => p.maxY));
    this.floorY = this.minY - (def.floorDrop ?? 26);
    if (opts.preview) return;
    this.buildRoads();
    this.buildFeatures();
    this.buildWater();
    this.buildStart();
    buildDecor(this);
    this.storms = layStorms(this);
    buildSigns(this);
    buildCovers(this);
    this.group.add(this.layers.build());
    this._f = {};
    this._g = { y: -1e4, nx: 0, ny: 1, nz: 0, lat: 0, path: null, i: 0, f: 0, rx: 1, rz: 0, mask: 0, onRoad: false };
  }

  get main() {
    return this.paths[0];
  }
  get length() {
    return this.paths[0].length;
  }

  buildMain() {
    const pts = this.def.points.map(([x, z, y = 0]) => new THREE.Vector3(x, y, z));
    const p = new Path('main', pts, true, this.halfWidth, { bankFactor: this.def.bankFactor, profile: this.def.profile });
    // water: stretches the Skimmer rides over and wheels bog down in
    p.water = new Uint8Array(p.N);
    for (const w of this.def.water || []) {
      const i0 = p.index(w.at);
      for (let k = 0; k < Math.round(w.len / p.ds); k++) p.water[p.wrap(i0 + k)] = 1;
    }
    this.paths.push(p);
  }

  // Branches leave the main road from one side, run their own line (often climbing over it), and merge back.
  buildBranches() {
    const main = this.main;
    for (const [k, b] of (this.def.branches || []).entries()) {
      const side = b.side ?? 1;
      const hw = b.halfWidth ?? this.halfWidth * 0.6;
      const off = this.halfWidth - hw;
      const iA = main.index(b.from);
      const iB = main.index(b.to);
      const A = main.point(iA, off * side, 0, new THREE.Vector3());
      const B = main.point(iB, off * side, 0, new THREE.Vector3());
      const tA = new THREE.Vector3(main.thx[iA], main.ty[iA], main.thz[iA]).normalize();
      const tB = new THREE.Vector3(main.thx[iB], main.ty[iB], main.thz[iB]).normalize();
      const lead = b.lead ?? 30;
      const RA = new THREE.Vector3(main.rightX(iA), 0, main.rightZ(iA)).multiplyScalar(side);
      const RB = new THREE.Vector3(main.rightX(iB), 0, main.rightZ(iB)).multiplyScalar(side);
      // Peel off level with the road until clear of it, then do whatever the branch does, then merge back level.
      const out = this.halfWidth + hw + 3;
      const S = A.clone().addScaledVector(tA, lead).addScaledVector(RA, out - off);
      const E = B.clone().addScaledVector(tB, -lead).addScaledVector(RB, out - off);
      S.y = A.y;
      E.y = B.y;
      const pts = [A.clone().addScaledVector(tA, -4), A, A.clone().addScaledVector(tA, lead * 0.5).addScaledVector(RA, (out - off) * 0.35), S];
      const lift = b.lift ?? 0;
      if (b.via) {
        for (const [x, z, y] of b.via) pts.push(new THREE.Vector3(x, y ?? lerp(A.y, B.y, 0.5) + lift, z));
      } else {
        const n = b.segments ?? 4;
        const dir = E.clone().sub(S).setY(0).normalize();
        for (let s2 = 1; s2 < n; s2++) {
          const u = s2 / n;
          const q = S.clone().lerp(E, u);
          q.y = lerp(S.y, E.y, u) + lift * Math.sin(Math.PI * u);
          if (b.bulge) {
            q.x += -dir.z * b.bulge * Math.sin(Math.PI * u) * side;
            q.z += dir.x * b.bulge * Math.sin(Math.PI * u) * side;
          }
          pts.push(q);
        }
      }
      pts.push(E, B.clone().addScaledVector(tB, -lead * 0.5).addScaledVector(RB, (out - off) * 0.35), B, B.clone().addScaledVector(tB, 4));
      const path = new Path(`b${k}`, pts, false, hw, { bankFactor: 3, mainFrom: b.from, mainTo: b.to, profile: b.profile });
      path.mask.fill(b.mask ?? M.ALL);
      path.def = b;
      path.side = side;
      // No rails where it overlaps the main road (where it leaves and rejoins it); rails everywhere else.
      const fr = {};
      const fr2 = {};
      const open = [];
      let hint = iA;
      for (let i = 0; i < path.N; i++) {
        if (!main.frame(path.px[i], path.pz[i], hint, fr)) continue;
        hint = fr.i;
        const near = Math.abs(fr.lat) < this.halfWidth + hw * 0.6 && Math.abs(fr.y - path.py[i]) < 1.5;
        if (!near) continue;
        // drop only the rail whose edge lies over the main road; the outer edge keeps its rail, or a car running
        // wide at the junction slides off into nothing
        const ex = path.rightX(i) * hw;
        const ez = path.rightZ(i) * hw;
        const latOf = (x, z) => (main.frame(x, z, fr.i, fr2) ? Math.abs(fr2.lat) : 1e9);
        const l = latOf(path.px[i] - ex, path.pz[i] - ez);
        const r = latOf(path.px[i] + ex, path.pz[i] + ez);
        // the edge nearer the road's middle opens; the outer one stays unless it's well inside the road too (a
        // strip laid flush along the road's edge keeps its outer rail, which is the road's edge there)
        open.push([i, l < r ? 'L' : 'R', Math.max(l, r) < this.halfWidth - 0.5]);
      }
      // apply only in runs of 3+ neighbouring samples: a lone sample where the branch brushes the main road's frame
      // would leave a notch in the rail that a craft riding it catches on
      for (let k = 0; k < open.length; k++) {
        const [i, side, both] = open[k];
        const prev = k > 0 && open[k - 1][0] === i - 1;
        const next = k < open.length - 1 && open[k + 1][0] === i + 1;
        const prev2 = k > 1 && open[k - 2][0] === i - 2;
        const next2 = k < open.length - 2 && open[k + 2][0] === i + 2;
        if (!((prev && next) || (prev && prev2) || (next && next2))) continue;
        if (side === 'L') path.railL[i] = 0;
        else path.railR[i] = 0;
        if (both) path.railL[i] = path.railR[i] = 0;
      }
      // And no main rail on that side at the junctions.
      const w = Math.ceil((lead * 1.3) / main.ds);
      for (const i0 of [iA, iB]) {
        for (let k2 = -4; k2 <= w; k2++) {
          const i = main.wrap(i0 === iA ? i0 + k2 : i0 - k2);
          // the gap in the rail is only open in the worlds the branch is in: anyone else still bounces off it
          // (a lens-only fork would otherwise leave a hole in the rail for BOTH to fall through)
          const J = side > 0 ? (main.jR ||= {}) : (main.jL ||= {});
          J[i] = (J[i] || 0) | (b.mask ?? M.ALL);
          if (side > 0) main.railR[i] = 0;
          else main.railL[i] = 0;
        }
      }
      this.paths.push(path);
    }
  }

  // Stretches of the main road that exist in fewer worlds (a red-only bridge over a gap, a blue-only floor...).
  applyGaps() {
    const main = this.main;
    for (const g of this.def.gaps || []) {
      const path = g.path ? this.paths.find((p) => p.id === g.path) : main;
      const i0 = path.index(g.at);
      const n = Math.max(2, Math.round((g.len ?? 40) / path.ds));
      for (let k = 0; k < n; k++) path.mask[path.wrap(i0 + k)] = g.mask ?? 0;
      // a glide gap: no road in any world; the Skimmer floats it (ai.js reads the flag)
      if (g.glide) {
        path.glide ||= new Uint8Array(path.N);
        for (let k = 0; k < n; k++) path.glide[path.wrap(i0 + k)] = 1;
      }
      if (g.noRails) for (let k = 0; k < n; k++) path.railL[path.wrap(i0 + k)] = path.railR[path.wrap(i0 + k)] = 0;
    }
    for (const r of this.def.noRails || []) {
      const i0 = main.index(r.at);
      const n = Math.round((r.len ?? 40) / main.ds);
      for (let k = 0; k < n; k++) {
        if (r.side !== 1) main.railL[main.wrap(i0 + k)] = 0;
        if (r.side !== -1) main.railR[main.wrap(i0 + k)] = 0;
      }
    }
  }

  // ------------------------------------------------------------------ road visuals
  // Water on the road: rows of rippling lines across it, animated, so it reads as a surface the Skimmer rides.
  buildWater() {
    const main = this.main;
    for (const w of this.def.water || []) {
      const i0 = main.index(w.at);
      const n = Math.round(w.len / main.ds);
      const pos = [];
      const rows = Math.max(4, Math.round(n / 1.5));
      const cols = 14;
      for (let r = 0; r < rows; r++) {
        const i = main.wrap(i0 + Math.round((r / rows) * n));
        for (let c = 0; c < cols; c++) {
          const a = main.point(i, -main.halfW + (c / cols) * main.halfW * 2, 0.08, new THREE.Vector3());
          const b = main.point(i, -main.halfW + ((c + 1) / cols) * main.halfW * 2, 0.08, new THREE.Vector3());
          pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
      const g = new THREE.BufferGeometry();
      const P = new THREE.Float32BufferAttribute(pos, 3);
      g.setAttribute('position', P);
      const base = Float32Array.from(pos);
      const mat = new THREE.LineBasicMaterial({ color: 0x4ad8ff, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
      const lines = new THREE.LineSegments(g, mat);
      lines.frustumCulled = false;
      lines.renderOrder = 2;
      this.group.add(lines);
      // a dark, glassy sheet under the ripples
      const L = this.layers;
      for (let k = 0; k < n; k++) {
        const i = main.wrap(i0 + k);
        const j = main.wrap(i + 1);
        L.lineXYZ(M.ALL, ...main.point(i, -main.halfW, 0.06).toArray(), ...main.point(j, -main.halfW, 0.06).toArray(), 0x4ad8ff);
        L.lineXYZ(M.ALL, ...main.point(i, main.halfW, 0.06).toArray(), ...main.point(j, main.halfW, 0.06).toArray(), 0x4ad8ff);
      }
      this.animated.push((t) => {
        for (let q = 0; q < P.count; q++) {
          const x = base[q * 3];
          const z = base[q * 3 + 2];
          P.setY(q, base[q * 3 + 1] + Math.sin(x * 0.7 + t * 3) * 0.06 + Math.sin(z * 0.9 + t * 2.3) * 0.05);
        }
        P.needsUpdate = true;
        mat.opacity = 0.55 + 0.2 * Math.sin(t * 2);
      });
    }
  }

  buildRoads() {
    const L = this.layers;
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (const path of this.paths) {
      const hw = path.halfW;
      const last = path.closed ? path.N : path.N - 1;
      for (let i = 0; i < last; i++) {
        const j = path.wrap(i + 1);
        const mask = path.mask[i];
        if (!mask) continue; // a glide gap: nothing there in any world
        const neutral = mask === M.ALL;
        const lc = neutral ? COLORS.red : colorForMask(mask);
        const rc = neutral ? COLORS.blue : colorForMask(mask);
        // neutral road: red lines on the left half, blue on the right, the two worlds printed over each other
        const mid = neutral ? null : colorForMask(mask);
        const ml = mid ?? COLORS.red;
        const mr = mid ?? COLORS.blue;
        // fill
        L.roadQuad(mask, path.point(i, -hw, -0.02, v[0]), path.point(j, -hw, -0.02, v[1]), path.point(j, hw, -0.02, v[2]), path.point(i, hw, -0.02, v[3]));
        // glowing edges (ribbons a little in from the edge, lying on the road)
        for (const [side, col] of [[-1, lc], [1, rc]]) {
          const a = path.point(i, side * hw, 0.04, new THREE.Vector3());
          const b = path.point(j, side * hw, 0.04, new THREE.Vector3());
          const c = path.point(j, side * (hw - 0.45), 0.04, new THREE.Vector3());
          const d = path.point(i, side * (hw - 0.45), 0.04, new THREE.Vector3());
          L.quad(mask, a, b, c, d, col);
          // the edge light spilling across the wet-black road, like the key art's reflections
          const e = path.point(j, side * (hw - 3.2), 0.035, new THREE.Vector3());
          const f = path.point(i, side * (hw - 3.2), 0.035, new THREE.Vector3());
          L.quadFade(mask, d, c, e, f, col, 0.07, 0);
          // rails
          const rail = side < 0 ? path.railL[i] : path.railR[i];
          if (rail) {
            const ra = path.point(i, side * (hw + 0.2), 1.1, new THREE.Vector3());
            const rb = path.point(j, side * (hw + 0.2), 1.1, new THREE.Vector3());
            const rd = path.point(i, side * (hw + 0.2), 0.75, new THREE.Vector3());
            const rcp = path.point(j, side * (hw + 0.2), 0.75, new THREE.Vector3());
            L.quad(mask, ra, rb, rcp, rd, col, 0.8);
            if (i % 4 === 0) L.line(mask, path.point(i, side * (hw + 0.2), 0, _a), path.point(i, side * (hw + 0.2), 1.1, _b), col);
          }
        }
        // grid: cross ribs and lane lines
        if (i % 2 === 0) L.line(mask, path.point(i, -hw, 0.03, _a), path.point(i, hw, 0.03, _b), (i >> 1) % 2 ? ml : mr);
        for (const f of [-1 / 3, 1 / 3]) L.line(mask, path.point(i, f * hw * 2 * 0.75, 0.03, _a), path.point(j, f * hw * 2 * 0.75, 0.03, _b), f < 0 ? ml : mr);
        for (const f of [-2 / 3, 0, 2 / 3]) if (i % 3 !== 2 && f !== 0) L.line(mask, path.point(i, f * hw, 0.03, _a), path.point(j, f * hw, 0.03, _b), f < 0 ? ml : mr);
        // underside and supports for raised road
        if (i % 2 === 0) {
          L.line(mask, path.point(i, -hw, -0.6, _a), path.point(j, -hw, -0.6, _b), lc);
          L.line(mask, path.point(i, hw, -0.6, _a), path.point(j, hw, -0.6, _b), rc);
        }
        const p = path.point(i, 0, 0, _c);
        if (i % 18 === 0 && p.y - this.floorY > 6 && !this.def.noPylons) {
          const pc = (i / 18) % 2 ? 0x6a1020 : 0x0c3a6a;
          L.lineXYZ(M.ALL, p.x, p.y - 0.6, p.z, p.x, this.floorY, p.z, pc);
          L.lineXYZ(M.ALL, p.x - 1.5, this.floorY, p.z, p.x + 1.5, this.floorY, p.z, pc);
        }
      }
    }
  }

  // A tunnel mouth that is shut in one world: a hexagonal iris filling the whole bore. It collides like a wall
  // (shift to the other world and it's open), and its blades turn slowly so it reads as a mechanism, not a box.
  addDoor(o, path, i, w, len, mask, mats, root) {
    const r = o.r ?? path.halfW + 4.5;
    const cy = o.cy ?? path.halfW * 0.35;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 6), mats.fill);
    disc.rotation.z = Math.PI / 2;
    root.add(disc);
    const rim = [];
    const blades = [];
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2;
      const a1 = ((k + 1) / 6) * Math.PI * 2;
      rim.push(Math.sin(a0) * r, Math.cos(a0) * r, 0, Math.sin(a1) * r, Math.cos(a1) * r, 0);
      // iris blades: from each corner, a curved cut toward a small hexagonal hole in the middle
      for (let s = 0; s < 4; s++) {
        const f0 = s / 4;
        const f1 = (s + 1) / 4;
        const b0 = a0 + f0 * 0.9;
        const b1 = a0 + f1 * 0.9;
        const r0 = r * (1 - f0 * 0.82);
        const r1 = r * (1 - f1 * 0.82);
        blades.push(Math.sin(b0) * r0, Math.cos(b0) * r0, 0.05, Math.sin(b1) * r1, Math.cos(b1) * r1, 0.05);
      }
    }
    const seg = (pos) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return new THREE.LineSegments(g, mats.wire);
    };
    // the blades in three layers a little apart, so the iris has depth and glows like neon tubing
    const iris = new THREE.Group();
    for (const z of [-0.25, 0, 0.25]) {
      const b = seg(blades);
      b.position.z = z;
      iris.add(b);
    }
    root.add(seg(rim), iris);
    // ribbon meshes take vertex colours: paint the lens colour in, scaled by k
    const tint = (geo, k) => {
      const c = new THREE.Color(colorForMask(mask)).multiplyScalar(k);
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let q = 0; q < n; q++) col.set([c.r, c.g, c.b], q * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return geo;
    };
    const glass = new THREE.Mesh(tint(new THREE.CircleGeometry(r * 0.98, 6), 0.1), mats.ribbon);
    glass.rotation.z = Math.PI / 2;
    glass.position.z = 0.1;
    root.add(glass);
    // the frame: a thick glowing hexagon band
    const ring = new THREE.Mesh(tint(new THREE.RingGeometry(r * 0.86, r, 6, 1), 0.9), mats.ribbon);
    ring.rotation.z = Math.PI / 2;
    root.add(ring);
    const p = path.point(i, 0, cy);
    root.position.copy(p);
    root.rotation.y = Math.atan2(path.thx[i], path.thz[i]);
    this.group.add(root);
    const h = 4.2;
    const ob = { path, i, f: path.frac(i), lat: 0, w, len, h, mask, type: 'wall', door: true, root, sweep: 0, phase: 0, baseLat: 0 };
    this.obstacles.push(ob);
    this.animated.push((t) => (iris.rotation.z = t * 0.35));
    return ob;
  }

  // ------------------------------------------------------------------ obstacles, pads, shards
  buildFeatures() {
    const def = this.def;
    for (const o of def.obstacles || []) {
      if (o.type === 'slit') addSlit(this, o);
      else this.addObstacle(o);
    }
    for (const b of def.boosts || []) this.addPad(b);
    for (const s of def.shards || []) {
      const n = s.n ?? 3;
      for (let k = 0; k < n; k++) this.addShard({ ...s, at: s.at + k * (s.gap ?? 0.006) });
    }
    // shards laid along a branch (a long lens-only road refills you on the way)
    for (const p of this.paths) {
      // a lens-only road with no shards of its own gets a few, as a bonus for finding it
      if (p !== this.main && p.def && !p.def.shards && (p.def.mask === M.RO || p.def.mask === M.BO)) {
        const n = Math.max(1, Math.round(p.length / 160));
        p.def.shards = Array.from({ length: n }, (_, k) => ({ at: 0.12 + (0.8 * (k + 0.5)) / n }));
      }
      for (const s of (p !== this.main && p.def?.shards) || []) {
        const n = s.n ?? 1;
        for (let k = 0; k < n; k++) this.addShard({ mask: p.def.mask, ...s, path: p.id, at: s.at + k * (s.gap ?? 0.03) });
      }
    }
  }

  pathOf(o) {
    return o.path ? this.paths.find((p) => p.id === o.path) || this.main : this.main;
  }

  addObstacle(o) {
    const path = this.pathOf(o);
    const i = path.index(o.at);
    const hw = path.halfW;
    const type = o.type || 'block';
    let w; // lateral half-size
    let len; // along half-size
    let h;
    let lat = (o.lat ?? 0) * hw;
    if (type === 'wall') {
      // (a slit's two wall pieces give their own width and offset, in metres)
      w = o.w ?? hw + 0.5;
      len = 1.2;
      h = 4.2;
      lat = o.latM ?? 0;
    } else if (type === 'gate') {
      // half the road blocked, side by sign of lat
      w = hw * 0.5;
      len = 1.2;
      h = 4.2;
      lat = Math.sign(o.lat || 1) * hw * 0.5;
    } else if (type === 'pillar') {
      w = len = o.size ?? 1.6;
      h = 9;
    } else {
      w = len = (o.size ?? 3) / 2;
      h = (o.size ?? 3) * 0.9;
    }
    const mask = o.mask ?? M.R;
    const mats = this.layers.materials(mask);
    const root = new THREE.Group();
    if (o.door) return this.addDoor(o, path, i, w, len, mask, mats, root);
    const geo = new THREE.BoxGeometry(w * 2, h, len * 2);
    const fill = new THREE.Mesh(geo, mats.fill);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mats.wire);
    root.add(fill, edges);
    if (type === 'wall' || type === 'gate') {
      // hazard stripes
      const g2 = new THREE.BufferGeometry();
      const pos = [];
      const n = Math.round(w * 1.2);
      for (let k = 0; k < n; k++) {
        const x = -w + (k + 0.5) * ((2 * w) / n);
        pos.push(x - 0.8, -h / 2, len + 0.02, x + 0.8, h / 2, len + 0.02, x - 0.8, -h / 2, -len - 0.02, x + 0.8, h / 2, -len - 0.02);
      }
      g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      root.add(new THREE.LineSegments(g2, mats.wire));
    } else {
      const inner = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(Math.min(w, h / 2) * 0.7)), mats.wire);
      root.add(inner);
      root.userData.spin = inner;
    }
    const p = path.point(i, lat, h / 2);
    root.position.copy(p);
    root.rotation.y = Math.atan2(path.thx[i], path.thz[i]);
    this.group.add(root);
    const ob = { path, i, f: path.frac(i), lat, w, len, h, mask, type, root, sweep: o.sweep || 0, phase: o.phase || 0, baseLat: lat };
    this.obstacles.push(ob);
    if (ob.sweep || root.userData.spin) this.animated.push((t) => {
      if (root.userData.spin) root.userData.spin.rotation.y = t * 1.5 + ob.i;
      if (ob.sweep) {
        ob.lat = ob.baseLat + Math.sin(t * 1.3 + ob.phase) * ob.sweep * hw;
        path.point(ob.i, ob.lat, ob.h / 2, root.position);
      }
    });
    return ob;
  }

  addPad(b) {
    const path = this.pathOf(b);
    const i = path.index(b.at);
    const lat = (b.lat ?? 0) * path.halfW;
    const mask = b.mask ?? M.ALL;
    const col = mask === M.ALL ? COLORS.pink : colorForMask(mask);
    const L = this.layers;
    const w = 2.4;
    for (let k = 0; k < 3; k++) {
      const i0 = path.wrap(i + k * 2);
      const tip = path.point(i0 + 2, lat, 0.06, new THREE.Vector3());
      const l0 = path.point(i0, lat - w, 0.06, new THREE.Vector3());
      const l1 = path.point(i0 + 1, lat - w, 0.06, new THREE.Vector3());
      const r0 = path.point(i0, lat + w, 0.06, new THREE.Vector3());
      const r1 = path.point(i0 + 1, lat + w, 0.06, new THREE.Vector3());
      const tip2 = path.point(i0 + 1, lat, 0.06, new THREE.Vector3());
      L.quad(mask, l0, tip2, tip, l1, col, 1.2);
      L.quad(mask, r0, tip2, tip, r1, col, 1.2);
    }
    this.pads.push({ path, i, f: path.frac(i), lat, w, len: path.ds * 3.5, mask });
  }

  addShard(s) {
    const path = this.pathOf(s);
    const i = path.index(s.at);
    const lat = (s.lat ?? 0) * path.halfW;
    const mask = s.mask ?? M.ALL;
    const mats = this.layers.materials(mask);
    const g = new THREE.OctahedronGeometry(0.9);
    const root = new THREE.Group();
    root.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), mats.wire));
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), mats.solid);
    root.add(core);
    path.point(i, lat, 1.4, root.position);
    this.group.add(root);
    const sh = { path, i, f: path.frac(i), lat, mask, root, taken: 0, y0: root.position.y };
    this.shards.push(sh);
    this.animated.push((t, dt) => {
      root.rotation.y = t * 2.2 + i;
      root.position.y = sh.y0 + Math.sin(t * 3 + i) * 0.25;
      if (sh.taken > 0) {
        sh.taken -= dt;
        root.visible = sh.taken <= 0;
      }
    });
  }

  buildStart() {
    const m = this.main;
    const L = this.layers;
    const hw = this.halfWidth;
    // checkered strip
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < 10; k++) {
        if ((k + r) % 2) continue;
        const l0 = -hw + (k * 2 * hw) / 10;
        const l1 = -hw + ((k + 1) * 2 * hw) / 10;
        const a = m.point(r, l0, 0.05, new THREE.Vector3());
        const b = m.point(r + 1, l0, 0.05, new THREE.Vector3());
        const c = m.point(r + 1, l1, 0.05, new THREE.Vector3());
        const d = m.point(r, l1, 0.05, new THREE.Vector3());
        L.quad(M.ALL, a, b, c, d, 0xffffff, 0.3);
      }
    }
    // gantry
    const p = m.point(0, 0, 0, new THREE.Vector3());
    const yaw = Math.atan2(m.thx[0], m.thz[0]);
    const right = new THREE.Vector3(m.rightX(0), 0, m.rightZ(0));
    for (const s of [-1, 1]) {
      const q = p.clone().addScaledVector(right, s * (hw + 1.5));
      L.box(M.ALL, q.x, q.y + 5, q.z, 1, 10, 1, yaw, s < 0 ? COLORS.red : COLORS.blue, true);
    }
    const top = p.clone();
    L.box(M.ALL, top.x, top.y + 10.5, top.z, (hw + 2) * 2, 1.6, 1.2, yaw, COLORS.white, true);
  }

  // ------------------------------------------------------------------ queries
  // Ground under (x, y, z) for a racer looking through `mode`. hints is a per-racer object { pathId: index }.
  ground(x, y, z, hints, mode = BOTH) {
    const g = this._g;
    g.y = -1e4;
    g.onRoad = false;
    g.path = null;
    const f = this._f;
    let bestY = -Infinity;
    // Stick to the strip you're already on while it's still under you; only change strips when you drive off its
    // edge (onto a fork), it ends, or a ramp rises out of it under you. Otherwise a fork that starts level with the
    // road would grab you.
    const cur = hints._cur;
    for (const path of this.paths) {
      // cheap bounds reject
      if (y < path.minY - 8 || y > path.maxY + 60) {
        if (!(path.id in hints)) continue;
      }
      if (!path.frame(x, z, hints[path.id] ?? -1, f)) continue;
      hints[path.id] = f.i;
      // a little grace past the edge of the strip you're on: at speed a hard corner can carry you past its rail for
      // a step before the rail pushes you back, and that step shouldn't drop you through the world
      // (a wide craft is still on the road with its middle a little past the edge)
      if (Math.abs(f.lat) > path.halfW + (path.id === cur ? 1.4 : 0.35) + (hints._w || 0)) continue;
      if (!solidIn(f.mask, mode)) continue;
      // a wall-run holds only a craft that clings (the Blade); the others find nothing under them
      if (path.cling?.[f.i] && !hints._cling) continue;
      if (f.y > y + 1.6 || f.y < y - 7) continue;
      // a strip climbing out of the road beneath you (a ramp laid over it) takes you up
      const j = Math.min(path.N - 1, f.i + 3);
      const ramp = !path.closed && path.id !== cur && path.py[j] - path.py[f.i] > 0.25 && f.y > y - 0.6 && Math.abs(f.lat) < path.halfW - 0.5;
      const score = f.y + (path.id === cur ? 2.5 : 0) + (ramp ? 3 : 0);
      if (score > bestY) {
        bestY = score;
        g.y = f.y;
        g.nx = f.nx;
        g.ny = f.ny;
        g.nz = f.nz;
        g.lat = f.lat;
        g.path = path;
        g.i = f.i;
        g.f = f.f;
        g.rx = f.rx;
        g.rz = f.rz;
        g.mask = f.mask;
        g.onRoad = true;
      }
    }
    if (g.onRoad) hints._cur = g.path.id;
    if (!g.onRoad) {
      g.nx = 0;
      g.ny = 1;
      g.nz = 0;
    }
    return g;
  }

  heightAt(x, z, y) {
    const g = this.ground(x, y, z, (this._camHints ||= {}), 7);
    return g.onRoad ? g.y : this.floorY;
  }

  // Keep a racer inside the rails of the strip it's on. Returns the impact speed.
  collideWalls(r, g) {
    if (!g.onRoad) return 0;
    const path = g.path;
    const hw = path.halfW - r.halfW;
    const lat = g.lat;
    if (Math.abs(lat) <= hw) return 0;
    const side = Math.sign(lat);
    const rail = side < 0 ? path.railL[g.i] : path.railR[g.i];
    if (!rail) {
      const open = (side < 0 ? path.jL : path.jR)?.[g.i];
      if (!open || solidIn(open, r.mode)) return 0;
    }
    const push = Math.abs(lat) - hw;
    r.pos.x -= g.rx * side * push;
    r.pos.z -= g.rz * side * push;
    const vn = r.vel.x * g.rx * side + r.vel.z * g.rz * side;
    if (vn > 0) {
      r.vel.x -= g.rx * side * vn * 1.35;
      r.vel.z -= g.rz * side * vn * 1.35;
      // scrape
      r.vel.multiplyScalar(1 - clamp(vn * 0.012, 0, 0.25));
    }
    return Math.max(0, vn);
  }

  // Safe place to put a racer back: on the main road, a little behind where they were, solid in BOTH.
  respawnPoint(mainU, mode = BOTH) {
    const m = this.main;
    let i = m.index(mainU) - Math.round(18 / m.ds);
    for (let k = 0; k < m.N; k++) {
      const j = m.wrap(i - k);
      let ok = true;
      for (let q = -3; q <= 12; q++) if (!solidIn(m.mask[m.wrap(j + q)], mode)) ok = false;
      for (const o of this.obstacles) if (o.path === m && Math.abs(o.i - j) < 10) ok = false;
      if (ok) {
        i = j;
        break;
      }
    }
    const pos = m.point(i, 0, 0.3, new THREE.Vector3());
    return { pos, yaw: Math.atan2(m.thx[i], m.thz[i]), i };
  }

  gridSlot(k) {
    const m = this.main;
    const back = Math.round((10 + Math.floor(k / 2) * 9) / m.ds);
    const i = m.wrap(-back);
    const lat = (k % 2 ? 1 : -1) * this.halfWidth * 0.42;
    return { pos: m.point(i, lat, 0.3, new THREE.Vector3()), yaw: Math.atan2(m.thx[i], m.thz[i]), i };
  }

  update(dt, t, mode) {
    for (const fn of this.animated) fn(t, dt);
    this.layers.update(dt, mode, t);
  }
}

export { smoothstep };
