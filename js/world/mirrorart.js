// MIRROR HOUSE, the look of the place. The house stands under a neon big top: striped canopy overhead, a mirror ball
// hung from its peak throwing beams, marquee bulbs chasing round every doorway and along the top of every mirror, and
// a floor of harlequin tiles with a pearl finish (the colour of each tile slides as you move, like oil on glass).
//
// The pieces that move (floor, bulbs, ball) have their own shaders, so they follow the lens themselves: `uLens` is
// how much of BOTH, RED and BLUE the viewer is looking through. A piece of the red world is gone in BLUE and the
// other way round; a piece of neither is pearl in BOTH and all one colour through a lens, like everything else.

import * as THREE from '../../vendor/three.js';
import { M, BOTH, RED, BLUE, colorForMask } from './shift.js';
import { ACCESS } from '../core/access.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const LENS = { value: new THREE.Vector3(1, 0, 0) };
const TIME = { value: 0 };
const CALM = { value: 0 };
const PX = { value: 720 }; // height of the picture in pixels (bulbs are sized by it)

const CLIP_V = '#include <clipping_planes_pars_vertex>';
const CLIP_F = '#include <clipping_planes_pars_fragment>';

// the lens's own colours for a piece of neither world, and what's left of a red or a blue piece
const LENS_GLSL = `
  uniform vec3 uLens;
  const vec3 RED_C = vec3(1.0, 0.165, 0.29);
  const vec3 BLUE_C = vec3(0.118, 0.55, 1.0);
  // kind: 0 the red world, 1 the blue world, 2 neither
  vec4 lensColour(float kind) {
    if (kind < 0.5) return vec4(RED_C, 1.0 - uLens.z);
    if (kind < 1.5) return vec4(BLUE_C, 1.0 - uLens.y);
    return vec4(vec3(1.0, 0.92, 1.0) * uLens.x + vec3(1.0, 0.45, 0.5) * uLens.y + vec3(0.45, 0.75, 1.0) * uLens.z, 1.0);
  }`;

// ------------------------------------------------------------------ the floor
// A sheet lying on every road. The tiles are diamonds laid on the road's own length and width, so they follow the
// bends. Each tile is a thin film: its colour comes from how flat you're looking across it and how far off it is,
// so bands of colour ride along with the car while every tile keeps a shade of its own.
const TILE = 2.4;
const FLOOR_VERT = `
  attribute vec3 aVis;
  attribute vec2 aRoad;
  uniform vec3 uLens;
  varying vec3 vP;
  varying vec2 vRoad;
  varying float vVis;
  ${CLIP_V}
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vP = wp.xyz;
    vRoad = aRoad;
    vVis = dot(aVis, uLens);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }`;
const FLOOR_FRAG = `
  uniform vec3 uLens;
  uniform float uTime, uCalm;
  varying vec3 vP;
  varying vec2 vRoad;
  varying float vVis;
  ${CLIP_F}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // a walk there and back along a run of colours, so the film never jumps
  vec3 run4(float ph, vec3 a, vec3 b, vec3 c, vec3 d) {
    float t = abs(fract(ph) * 2.0 - 1.0) * 3.0;
    return t < 1.0 ? mix(a, b, t) : t < 2.0 ? mix(b, c, t - 1.0) : mix(c, d, t - 2.0);
  }
  vec3 run5(float ph, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e) {
    float t = abs(fract(ph) * 2.0 - 1.0) * 4.0;
    return t < 1.0 ? mix(a, b, t) : t < 2.0 ? mix(b, c, t - 1.0) : t < 3.0 ? mix(c, d, t - 2.0) : mix(d, e, t - 3.0);
  }
  void main() {
    #include <clipping_planes_fragment>
    if (vVis < 0.01) discard;
    vec3 toCam = cameraPosition - vP;
    float d = length(toCam);
    vec3 view = toCam / d;
    float ndv = clamp(abs(view.y), 0.0, 1.0);
    vec2 q = vec2(vRoad.x + vRoad.y, vRoad.x - vRoad.y) / ${TILE.toFixed(1)};
    vec2 cell = floor(q);
    vec2 f = fract(q);
    vec2 w = fwidth(q);
    // (far off the tiles are smaller than a pixel: they melt into one even sheet instead of shimmering)
    float melt = clamp(max(w.x, w.y) * 1.6, 0.0, 1.0);
    float h = hash(cell);
    float dark = mod(cell.x + cell.y, 2.0);
    float tile = mix(mix(1.0, 0.16, dark), 0.5, melt);
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float bevel = (1.0 - smoothstep(0.0, 0.03 + max(w.x, w.y), edge)) * (1.0 - melt);
    // the film
    float ph = (h - 0.5) * 0.55 * (1.0 - melt) + (1.0 - ndv) * 1.3 + log2(d + 4.0) * 0.42 + view.x * 0.35 + view.z * 0.25 + vRoad.y * 0.0035 + uTime * 0.015;
    vec3 both = run5(ph, vec3(1.0, 0.13, 0.26), vec3(1.0, 0.3, 0.8), vec3(0.62, 0.3, 1.0), vec3(0.1, 0.5, 1.0), vec3(0.2, 0.62, 1.0));
    vec3 red = run4(ph, vec3(0.5, 0.0, 0.05), vec3(1.0, 0.13, 0.26), vec3(1.0, 0.42, 0.36), vec3(1.0, 0.56, 0.48));
    vec3 blue = run4(ph, vec3(0.0, 0.12, 0.55), vec3(0.1, 0.5, 1.0), vec3(0.35, 0.78, 1.0), vec3(0.58, 0.88, 1.0));
    vec3 col = both * uLens.x + red * uLens.y + blue * uLens.z;
    vec3 pearl = vec3(1.0, 0.9, 1.0) * uLens.x + vec3(1.0, 0.7, 0.66) * uLens.y + vec3(0.7, 0.9, 1.0) * uLens.z;
    // a glint off a tile now and then as its film comes round
    float glint = pow(max(0.0, sin(h * 61.0 + uTime * 0.7 + dot(cameraPosition.xz, vec2(0.13, 0.11)))), 40.0) * (1.0 - dark) * (1.0 - melt) * (1.0 - 0.7 * uCalm);
    float fres = 0.3 + 0.7 * pow(1.0 - ndv, 2.0);
    float far = 1.0 - smoothstep(110.0, 420.0, d);
    vec3 outc = col * (tile * 0.2 + bevel * 0.16) * fres + pearl * glint * 0.3;
    gl_FragColor = vec4(outc * far * vVis, 1.0);
  }`;

function buildFloor(world) {
  const pos = [];
  const vis = [];
  const road = [];
  const a = V(0, 0, 0);
  const b = V(0, 0, 0);
  const c = V(0, 0, 0);
  const d = V(0, 0, 0);
  for (const path of world.paths) {
    const hw = path.halfW - 0.5;
    const last = path.closed ? path.N : path.N - 1;
    // (a closed road's tiles meet themselves where the lap comes round)
    const len = path.N * path.ds;
    const k = path.closed ? (Math.max(1, Math.round(len / (2 * TILE))) * 2 * TILE) / len : 1;
    for (let i = 0; i < last; i++) {
      const mask = path.mask[i];
      if (!mask) continue;
      const j = path.wrap(i + 1);
      path.wpoint(i, -hw, 0.03, a);
      path.wpoint(j, -hw, 0.03, b);
      path.wpoint(j, hw, 0.03, c);
      path.wpoint(i, hw, 0.03, d);
      const s0 = i * path.ds * k;
      const s1 = (i + 1) * path.ds * k;
      const R = [[-hw, s0], [-hw, s1], [hw, s1], [hw, s0]];
      const P = [a, b, c, d];
      for (const q of [0, 1, 2, 0, 2, 3]) {
        pos.push(P[q].x, P[q].y, P[q].z);
        road.push(R[q][0], R[q][1]);
        vis.push(mask & BOTH ? 1 : 0, mask & RED ? 1 : 0, mask & BLUE ? 1 : 0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aVis', new THREE.Float32BufferAttribute(vis, 3));
  g.setAttribute('aRoad', new THREE.Float32BufferAttribute(road, 2));
  const mat = new THREE.ShaderMaterial({
    vertexShader: FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    uniforms: { uLens: LENS, uTime: TIME, uCalm: CALM },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    clipping: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

// ------------------------------------------------------------------ marquee bulbs
// Points of light in runs; every fourth one is lit and the lit one walks along the run.
const BULB_VERT = `
  attribute float aKind;
  attribute float aSeq;
  uniform float uPx;
  varying float vKind;
  varying float vSeq;
  varying float vFade;
  ${CLIP_V}
  void main() {
    vKind = aKind;
    vSeq = aSeq;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float dist = -mvPosition.z;
    gl_PointSize = clamp(uPx * 0.62 / max(dist, 0.1), 1.6, 26.0);
    vFade = exp(-dist / 420.0);
    #include <clipping_planes_vertex>
  }`;
const BULB_FRAG = `
  uniform float uTime, uCalm;
  varying float vKind;
  varying float vSeq;
  varying float vFade;
  ${LENS_GLSL}
  ${CLIP_F}
  void main() {
    #include <clipping_planes_fragment>
    vec4 lc = lensColour(vKind);
    if (lc.a < 0.01) discard;
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float lit = smoothstep(0.55, 0.75, fract(vSeq * 0.25 - uTime * 1.6));
    float on = mix(0.3 + 0.7 * lit, 0.65, uCalm);
    float core = smoothstep(0.55, 0.0, r);
    float halo = (1.0 - r) * (1.0 - r);
    // (a white-hot heart only with both worlds open: through a lens the bulb is all the lens's colour)
    vec3 col = lc.rgb * (halo * 0.5 + core * 0.9) + mix(lc.rgb, vec3(1.0), 0.15 + 0.85 * uLens.x) * core * core * 0.5 * on;
    gl_FragColor = vec4(col * on * vFade * lc.a, 1.0);
  }`;

const KIND = (mask) => (mask === M.R || mask === M.RO ? 0 : mask === M.B || mask === M.BO ? 1 : 2);

class Bulbs {
  constructor() {
    this.pos = [];
    this.kind = [];
    this.seq = [];
    this.n = 0;
  }
  // a run of bulbs from a to b, about `gap` apart
  run(a, b, mask, gap = 1.3) {
    const n = Math.max(1, Math.round(a.distanceTo(b) / gap));
    for (let k = 0; k <= n; k++) {
      this.pos.push(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, a.z + ((b.z - a.z) * k) / n);
      this.kind.push(KIND(mask));
      this.seq.push(this.n++);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.kind, 1));
    g.setAttribute('aSeq', new THREE.Float32BufferAttribute(this.seq, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: BULB_VERT,
      fragmentShader: BULB_FRAG,
      uniforms: { uLens: LENS, uTime: TIME, uCalm: CALM, uPx: PX },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      clipping: true,
      fog: false,
    });
    const o = new THREE.Points(g, mat);
    o.frustumCulled = false;
    o.renderOrder = 4;
    return o;
  }
}

// ------------------------------------------------------------------ the mirror ball
const BALL_VERT = `
  attribute float aKind;
  attribute float aSeed;
  attribute float aT;
  varying float vKind;
  varying float vSeed;
  varying float vT;
  ${CLIP_V}
  void main() {
    vKind = aKind;
    vSeed = aSeed;
    vT = aT;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }`;
// (aT < 0: a facet of the ball. aT 0..1: along a beam, from the ball outward.)
const BALL_FRAG = `
  uniform float uTime, uCalm;
  varying float vKind;
  varying float vSeed;
  varying float vT;
  ${LENS_GLSL}
  ${CLIP_F}
  void main() {
    #include <clipping_planes_fragment>
    vec4 lc = lensColour(vKind);
    if (lc.a < 0.01) discard;
    vec3 col;
    if (vT < 0.0) {
      float flash = pow(max(0.0, sin(vSeed * 6.2832 + uTime * (0.5 + vSeed * 1.4))), 26.0) * (1.0 - 0.75 * uCalm);
      col = lc.rgb * (0.16 + 0.2 * vSeed) + mix(lc.rgb, vec3(1.0), 0.15 + 0.45 * uLens.x) * flash * 1.5;
    } else {
      col = lc.rgb * 0.2 * pow(1.0 - vT, 1.6);
    }
    gl_FragColor = vec4(col * lc.a, 1.0);
  }`;

function buildBall(c, r) {
  const pos = [];
  const kind = [];
  const seed = [];
  const at = [];
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const LAT = 13;
  const P = (ph, th, rr) => [Math.sin(ph) * Math.cos(th) * rr, Math.cos(ph) * rr, Math.sin(ph) * Math.sin(th) * rr];
  for (let i = 0; i < LAT; i++) {
    const p0 = ((i + 0.07) / LAT) * Math.PI;
    const p1 = ((i + 0.93) / LAT) * Math.PI;
    const n = Math.max(6, Math.round(Math.sin(((i + 0.5) / LAT) * Math.PI) * 30));
    for (let k = 0; k < n; k++) {
      const t0 = ((k + 0.07) / n) * Math.PI * 2;
      const t1 = ((k + 0.93) / n) * Math.PI * 2;
      const q = [P(p0, t0, r), P(p0, t1, r), P(p1, t1, r), P(p1, t0, r)];
      const kd = rnd() < 0.22 ? 2 : (i + k) % 2;
      const sd = rnd();
      for (const j of [0, 1, 2, 0, 2, 3]) {
        pos.push(...q[j]);
        kind.push(kd);
        seed.push(sd);
        at.push(-1);
      }
    }
  }
  // beams: thin blades of light out of the ball, mostly downward, two crossed sheets each
  const BEAMS = 18;
  for (let k = 0; k < BEAMS; k++) {
    const th = (k / BEAMS) * Math.PI * 2 + rnd() * 0.2;
    const ph = Math.PI * (0.5 + 0.06 + rnd() * 0.3);
    const len = 330 + rnd() * 260;
    const dir = V(...P(ph, th, 1));
    const u = V(-Math.sin(th), 0, Math.cos(th));
    const v = dir.clone().cross(u).normalize();
    const a = dir.clone().multiplyScalar(r * 0.98);
    const b = dir.clone().multiplyScalar(len);
    const wide = 5 + rnd() * 7;
    for (const side of [u, v]) {
      const e0 = b.clone().addScaledVector(side, wide);
      const e1 = b.clone().addScaledVector(side, -wide);
      for (const [p, t] of [[a, 0], [e0, 1], [e1, 1]]) {
        pos.push(p.x, p.y, p.z);
        kind.push(k % 2);
        seed.push(0);
        at.push(t);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: BALL_VERT,
    fragmentShader: BALL_FRAG,
    uniforms: { uLens: LENS, uTime: TIME, uCalm: CALM },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    clipping: true,
    fog: false,
  });
  const ball = new THREE.Group();
  const lights = new THREE.Mesh(g, mat);
  lights.frustumCulled = false;
  lights.renderOrder = 3;
  // a black heart, so the far side's facets and the canopy behind don't show through
  const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.97, 28, 14), new THREE.MeshBasicMaterial({ color: 0x030108, fog: false }));
  ball.add(core, lights);
  ball.position.copy(c);
  return ball;
}

// ------------------------------------------------------------------ putting it up
export class HouseArt {
  constructor(world) {
    this.group = new THREE.Group();
    this.bulbs = new Bulbs();
    this.lens = LENS.value.set(1, 0, 0);
    world.group.add(this.group);
  }

  // (after the scenery has strung its bulbs)
  finish(world, ballAt, ballR) {
    this.group.add(buildFloor(world), this.bulbs.build());
    this.ball = buildBall(ballAt, ballR);
    this.group.add(this.ball);
  }

  // Once a view, before it's drawn: follow the viewer's lens. (instant: a split-screen view, no fade between the two.)
  update(dt, t, mode, instant, px) {
    const k = instant ? 1 : 1 - Math.exp(-12 * dt);
    const L = this.lens;
    L.x += ((mode === BOTH ? 1 : 0) - L.x) * k;
    L.y += ((mode === RED ? 1 : 0) - L.y) * k;
    L.z += ((mode === BLUE ? 1 : 0) - L.z) * k;
    TIME.value = t;
    CALM.value = ACCESS.calm ? 1 : 0;
    if (px) PX.value = px;
    if (this.ball) this.ball.rotation.y = t * (ACCESS.calm ? 0.03 : 0.11);
  }
}

// The big top: a striped canopy from a peak over the middle of the house out to a ring of poles, red gores and blue
// gores by turns, so a lens takes every other stripe out of the sky. Returns where the mirror ball hangs.
export function bigTop(world, L, main) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < main.N; i++) {
    x0 = Math.min(x0, main.px[i]);
    x1 = Math.max(x1, main.px[i]);
    z0 = Math.min(z0, main.pz[i]);
    z1 = Math.max(z1, main.pz[i]);
  }
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const rx = (x1 - x0) / 2 + 190;
  const rz = (z1 - z0) / 2 + 190;
  const eave = world.maxY + 46;
  const peak = world.maxY + 250;
  const GORES = 72;
  const SEG = 9;
  // the canopy's line from the peak (f = 0) out to the eave (f = 1): steep at the pole, flattening as it goes
  const at = (k, f) => {
    const a = (k / GORES) * Math.PI * 2;
    const r = 0.03 + 0.97 * f;
    return V(cx + Math.cos(a) * rx * r, eave + (peak - eave) * Math.pow(1 - f, 2.3), cz + Math.sin(a) * rz * r);
  };
  for (let k = 0; k < GORES; k++) {
    const mask = k % 2 ? M.R : M.B;
    const col = colorForMask(mask);
    for (let s = 0; s < SEG; s++) {
      const f0 = s / SEG;
      const f1 = (s + 1) / SEG;
      const a = at(k, f0);
      const b = at(k, f1);
      const c = at(k + 1, f1);
      const d = at(k + 1, f0);
      L.line(mask, a, b);
      // the cloth: a faint sheet, lighter toward the eave where it's near enough to see by
      L.quad(mask, a, b, c, d, col, 0.016 + 0.026 * f1);
      // hoops round the canopy
      if (s === 2 || s === 5) L.line(mask, b, c);
    }
    // the eave: a scalloped valance and a pole down to the ground
    const e0 = at(k, 1);
    const e1 = at(k + 1, 1);
    const mid = e0.clone().lerp(e1, 0.5);
    mid.y -= 13;
    L.line(mask, e0, mid);
    L.line(mask, mid, e1);
    L.quad(mask, e0, e1, mid, mid, col, 0.1);
    L.lineXYZ(mask, e0.x, e0.y, e0.z, e0.x, world.floorY, e0.z);
    // guy lines out from every other pole
    if (k % 4 === 0) L.lineXYZ(mask, e0.x, e0.y, e0.z, cx + (e0.x - cx) * 1.16, world.floorY, cz + (e0.z - cz) * 1.16);
  }
  // the king pole's cap, and the rope the ball hangs on
  const ball = V(cx, world.maxY + 132, cz);
  L.lineXYZ(M.ALL, cx, peak, cz, cx, ball.y, cz, 0x9a8ac0);
  return ball;
}
