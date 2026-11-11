// The STATIC CUP's road finish: static grain. The signal breaking up. The black glass of the road crawls with fine
// TV snow, and grains of it catch and sparkle in the lens's colour: red and blue grains printed over each other with
// both worlds open, only the lens's own colour through a lens. Where a secret route peels off (a branch hidden in one
// world or the overlap), the picture tears now and then: a thin strip of sheared, brighter static across the road,
// in the colour of the world that route lives in, leaning to the side it leaves from. A hint, not a sign.
//
// One additive sheet over the neutral road (lens-only roads keep their own look), drawn in one call; the grain is
// all in the shader. Each course takes the static its own way (TAKES below). Kept gentle for the photosensitivity
// warning: grains fade in and out rather than blink, they're sparse and small, the average brightness of the road
// never changes, and the reduced-flashing setting slows it all down and softens the tears.
//
// The SIGNAL CUP's phosphor finish (phosphor.js) and the PARADOX CUP's iridescent ones (per course) are its siblings.

import * as THREE from '../../vendor/three.js';
import { M, COLORS } from './shift.js';
import { ACCESS } from '../core/access.js';

// The five STATIC CUP courses (game/modes.js CUPS) and how each takes the static.
//   void     dead channel: coarse snow that drifts across the open field in slow banks
//   helix    a double helix of static: a red strand and a blue strand twisting down the road, rolling on as you climb
//   fractal  block static: a mosaic of squares, each one breaking up at its own scale, re-cut every few seconds
//   lattice  static on the wire: grain gathers on a diagonal lattice across the road, and sparks run along it
//   ruins    a worn tape: grain eaten away in patches, a ghost echo of every grain, a slow rolling hold bar
const TAKES = {
  void: { style: 0, gain: 1.0 },
  helix: { style: 1, gain: 0.95 },
  fractal: { style: 2, gain: 0.9 },
  lattice: { style: 3, gain: 0.95 },
  ruins: { style: 4, gain: 1.0 },
};

// How far ahead of a secret route's mouth the road starts to tear, and how far past it.
const TEAR_LEAD = 110;
const TEAR_TAIL = 18;

const GRAIN = {
  vertexShader: `
    attribute vec2 aK; attribute vec2 aH;
    varying vec3 vP; varying vec2 vK; varying vec2 vH;
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vP = wp.xyz; vK = aK; vH = aH;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: `
    uniform vec3 uTint, uRed, uBlue, uVio;
    uniform float uTime, uGain, uCalm, uOpen, uLensR, uLensB, uHW;
    varying vec3 vP; varying vec2 vK; varying vec2 vH;

    float h12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + 1.0), f.x), f.y);
    }

    // One grain per cell of a grid laid on the road (c in cells). Each grain swells and fades on its own beat (never
    // a hard blink), and at the start of each beat decides afresh whether it lights, so the pattern crawls. Returns
    // (brightness, a pick for its colour).
    // (sq: 0 a round dot, 1 a hard-edged square tile)
    vec2 grain(vec2 c, float dens, float seed, float sq){
      vec2 id = floor(c);
      float r = h13(vec3(id, seed));
      float w = mix(0.9, 2.2, h13(vec3(id, seed + 5.0))) * mix(1.0, 0.35, uCalm);
      float ph = uTime * w + r * 7.0;
      float beat = floor(ph);
      float on = step(1.0 - dens, h13(vec3(id, beat + seed * 3.0)));
      float env = pow(sin(3.14159 * fract(ph)), 6.0);
      vec2 q = fract(c) - 0.5 + (vec2(h13(vec3(id, beat + 9.0)), h13(vec3(id, beat + 13.0))) - 0.5) * 0.4;
      float dot1 = 1.0 - smoothstep(0.12, 0.42, length(q));
      vec2 tq = abs(fract(c) - 0.5);
      float tile = 1.0 - smoothstep(0.38, 0.47, max(tq.x, tq.y));
      return vec2(on * env * mix(dot1, tile, sq), h13(vec3(id, beat + 21.0)));
    }

    // a grain's colour: with both worlds open, red or blue (and now and then white); through a lens, the lens
    vec3 tone(float pick){
      vec3 both = pick < 0.47 ? uRed : pick < 0.94 ? uBlue : vec3(0.9, 0.85, 1.0);
      return mix(uTint * 1.4, both, uOpen);
    }

    void main(){
      float s = vK.x, x = vK.y;
      float dist = distance(cameraPosition, vP);
      vec3 col = vec3(0.0);
      // fine snow under it all: tiny cells that change every few frames, near the car only (lost into haze further out)
      vec2 sc = vec2(s, x) / 0.14;
      float fw = max(fwidth(sc.x), fwidth(sc.y));
      float snowK = (1.0 - smoothstep(0.35, 0.9, fw)) * (1.0 - smoothstep(15.0, 45.0, dist));
      float frame = floor(uTime * mix(18.0, 4.0, uCalm));
      float snow = h13(vec3(floor(sc), frame));
      col += mix(uTint * 0.9, vec3(0.75, 0.7, 0.9), uOpen) * pow(snow, 10.0) * 0.03 * snowK;

      // the sparkling grains, in each course's own pattern
      float cell = 0.38;
      vec2 c = vec2(s, x) / cell;
      float dens = 0.07;
      float k = 1.0;
      vec2 g;
      vec3 gc;
      // the pattern itself, as a faint glow of its colour in the glass, so each course's take reads from a distance
      float st = 0.0;
      vec3 stc = uTint;
#if STYLE == 0
      // VOID FIELD: dead channel. Coarser snow sliding sideways across the field, in slow banks that come and go.
      cell = 0.5;
      c = vec2(s, x + uTime * mix(0.7, 0.25, uCalm)) / cell;
      float bank = smoothstep(0.32, 0.78, vnoise(vec2(s / 34.0 + uTime * 0.04, x / 14.0 - uTime * 0.07)));
      dens = 0.04 + 0.16 * bank;
      k = 0.55 + 0.65 * bank;
      g = grain(c, dens, 1.0, 0.0);
      gc = tone(g.y);
      st = bank;
      stc = mix(uTint, vnoise(vec2(s / 50.0, x / 20.0) + 30.0 + uTime * 0.03) > 0.5 ? uRed : uBlue, uOpen);
#elif STYLE == 1
      // HELIX ASCENT: two strands of static twisting along the road, red and blue, half a turn apart.
      float tw = s * 6.2832 / 26.0 + (x / uHW) * 3.14159 - uTime * mix(0.9, 0.35, uCalm);
      float sr = pow(0.5 + 0.5 * cos(tw), 5.0);
      float sb = pow(0.5 + 0.5 * cos(tw + 3.14159), 5.0);
      dens = 0.02 + 0.34 * max(sr, sb);
      g = grain(c, dens, 2.0, 0.0);
      vec3 strand = sr > sb ? uRed : uBlue;
      gc = mix(uTint * 1.4 * (sr > sb ? 1.0 : 0.75), strand, uOpen);
      k = 0.6 + 0.6 * max(sr, sb);
      st = 1.3 * max(sr, sb);
      stc = gc;
#elif STYLE == 2
      // FRACTAL ROUTE: block static. Squares of road 3 m across, each broken up at its own scale (3 m, 1.5 m, 0.75 m,
      // 0.38 m), re-cut every few seconds; now and then a whole square fills in.
      vec2 B = floor(vec2(s, x) / 3.0);
      float epoch = floor(uTime * mix(0.35, 0.15, uCalm) + h12(B));
      float lv = floor(h13(vec3(B, epoch)) * 4.0);
      float sz = 3.0 / pow(2.0, lv + 1.0);
      cell = max(sz, 0.375);
      c = vec2(s, x) / cell;
      float lit = step(0.9, h13(vec3(B, epoch + 40.0)));
      dens = 0.05 + 0.22 * lit + 0.03 * lv;
      // (the big scales glow as tiles, the small ones as grains)
      g = grain(c, dens, 3.0 + lv, step(lv, 1.5));
      k = 0.55 + 0.4 * lit;
      gc = tone(g.y);
      // the squares' own outline, faint, and a lit square glows whole
      vec2 bq = abs(fract(vec2(s, x) / 3.0) - 0.5);
      float edge = smoothstep(0.43, 0.49, max(bq.x, bq.y));
      st = lit * 0.9 + edge * 0.35 * step(0.5, h13(vec3(B, epoch + 70.0)));
      stc = tone(h13(vec3(B, epoch + 90.0)));
#elif STYLE == 3
      // SHIFT LATTICE: static on the wire. Grain gathers along two sets of diagonal threads across the road, and a
      // spark of brighter static runs along each thread now and then, the way current runs along a wire.
      float u1 = (s + x) / 7.0, u2 = (s - x) / 7.0;
      float d1 = abs(fract(u1) - 0.5) * 7.0 * 0.7071;
      float d2 = abs(fract(u2) - 0.5) * 7.0 * 0.7071;
      float th1 = 1.0 - smoothstep(0.1, 0.55, d1);
      float th2 = 1.0 - smoothstep(0.1, 0.55, d2);
      float sp1 = pow(fract((s - x) / 30.0 - uTime * mix(0.5, 0.2, uCalm) + h12(vec2(floor(u1), 1.0))), 14.0);
      float sp2 = pow(fract((s + x) / 30.0 - uTime * mix(0.43, 0.17, uCalm) + h12(vec2(floor(u2), 2.0))), 14.0);
      float thread = max(th1, th2);
      dens = 0.01 + 0.36 * thread + 0.4 * max(th1 * sp1, th2 * sp2);
      g = grain(c, dens, 4.0, 0.0);
      k = 0.5 + 0.5 * thread + 1.2 * max(th1 * sp1, th2 * sp2);
      // threads one way carry red, the other blue, with both worlds open
      gc = mix(uTint * 1.4, th1 > th2 ? uRed : uBlue, uOpen);
      st = thread * 0.45 + 1.6 * max(th1 * sp1, th2 * sp2);
      stc = gc;
#else
      // ECHO RUINS: a worn tape. Grain eaten away in patches, every grain with a fainter echo a little behind it,
      // and a slow bar of brighter static rolling along the road like a picture losing its hold.
      float wear = smoothstep(0.3, 0.56, vnoise(vec2(s / 9.0, x / 5.0)));
      float bar = exp(-pow((fract(s / 90.0 - uTime * mix(0.09, 0.04, uCalm)) - 0.5) * 18.0, 2.0));
      dens = (0.05 + 0.1 * bar) * wear;
      g = grain(c, dens, 5.0, 0.0);
      if (dens > 0.002) {
        vec2 echo = grain(c - vec2(1.6, 0.0), dens, 5.0, 0.0);
        g.x = max(g.x, echo.x * 0.4);
      }
      k = (0.6 + 0.8 * bar) * (0.4 + 0.6 * wear);
      gc = tone(g.y);
      st = 1.5 * bar * (0.3 + 0.7 * wear);
      stc = mix(uTint, (uRed + uBlue) * 0.55, uOpen);
#endif
      // grains smaller than a pixel or two would shimmer: they fade into an even haze of their own colour instead
      float gw = max(fwidth(c.x), fwidth(c.y));
      float sharp = 1.0 - smoothstep(0.25, 0.7, gw);
      float haze = dens * 0.22;
      col += gc * mix(haze, g.x, sharp) * k * 0.5;
      col += stc * st * 0.06 * (1.0 - smoothstep(120.0, 320.0, dist));

      // a tear where a secret route is near
      float near = vH.x;
      if (near > 0.002) {
        float code = floor(abs(vH.y) + 0.5);
        float side = sign(vH.y);
        float vis = code > 2.5 ? 1.0 : code > 1.5 ? uOpen + (1.0 - uOpen) * uLensB : uOpen + (1.0 - uOpen) * uLensR;
        vec3 rc = code > 2.5 ? uVio : code > 1.5 ? uBlue : uRed;
        vec3 tc = mix(uTint * 1.5, rc, uOpen);
        float slab = floor(s / 6.0);
        float per = mix(1.7, 3.0, uCalm);
        float off = h12(vec2(slab, 3.0));
        float win = floor(uTime / per + off);
        float ph = fract(uTime / per + off) * per;
        float fire = step(1.0 - 0.28 * near, h12(vec2(slab, win)));
        float life = mix(0.16, 0.45, uCalm);
        // (test hook: define TEAR_TEST on the material to hold every tear open, for screenshots)
#ifdef TEAR_TEST
        fire = 1.0; ph = life * 0.3;
#endif
        float env = fire * smoothstep(0.0, mix(0.02, 0.12, uCalm), ph) * (1.0 - smoothstep(life * 0.5, life, ph));
        if (env > 0.0) {
          float y0 = slab * 6.0 + 1.0 + 3.5 * h12(vec2(slab, win + 7.0));
          float band = step(y0, s) * step(s, y0 + 1.1);
          float row = floor((s - y0) / 0.22);
          float shear = (h12(vec2(row, win)) - 0.5) * uHW * 0.9 + side * uHW * 0.25;
          float seg = step(0.42, fract((x + shear) / (1.5 + 2.5 * h12(vec2(row, win + 1.0)))));
          float lean = 0.35 + 0.65 * smoothstep(-uHW, uHW, x * side);
          float fine = 0.6 + 0.4 * h13(vec3(floor(vec2(s, x) / 0.12), floor(uTime * 24.0)));
          float tk = band * seg * lean * fine * env * vis * near * mix(0.75, 0.4, uCalm);
          tk *= 1.0 - smoothstep(260.0, 420.0, dist);
          col += tc * tk;
        }
      }

      col *= uGain * (1.0 - smoothstep(320.0, 760.0, dist));
      // (keep off the road's edge lights: they're their own colour)
      col *= smoothstep(1.0, 0.9, abs(x) / uHW);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

const CODE = { [M.RO]: 1, [M.BO]: 2, [M.X]: 3 };

export function buildGrain(world) {
  const take = TAKES[world.def.id];
  if (!take) return;
  const L = world.layers;
  const main = world.main;
  const hwMain = main.halfW;
  // where the road tears: on the main road, ahead of the mouth of each branch hidden in a world or the overlap
  const near = new Float32Array(main.N);
  const code = new Float32Array(main.N);
  for (const p of world.paths) {
    const c = CODE[p.def?.mask];
    if (!p.def || !c) continue;
    const i0 = main.index(p.def.from);
    const lead = Math.round(TEAR_LEAD / main.ds);
    const tail = Math.round(TEAR_TAIL / main.ds);
    for (let k = -lead; k <= tail; k++) {
      const i = main.wrap(i0 + k);
      const v = k <= 0 ? Math.pow(1 + k / lead, 1.5) : 1 - k / (tail + 1);
      if (v > near[i]) {
        near[i] = v;
        code[i] = c * (p.side ?? 1);
      }
    }
  }
  const pos = [];
  const key = [];
  const hint = [];
  const a = new THREE.Vector3();
  for (const path of world.paths) {
    const hw = path.halfW;
    const last = path.closed ? path.N : path.N - 1;
    const isMain = path === main;
    for (let i = 0; i < last; i++) {
      // (only the neutral road: a lens-only stretch keeps its own look)
      if (path.mask[i] !== M.ALL) continue;
      const j = path.wrap(i + 1);
      // across the road in strips, more where a pipe or corkscrew bends it
      const bent = path.warpK?.[i] > 0 || path.warpK?.[j] > 0;
      const cols = bent ? 12 : 4;
      const vert = (ii, si, f) => {
        const lat = (f * 2 - 1) * hw;
        path.wpoint(ii, lat, 0.012, a);
        pos.push(a.x, a.y, a.z);
        key.push(si * path.ds, lat);
        const w = isMain ? path.wrap(ii) : -1;
        hint.push(w >= 0 ? near[w] : 0, w >= 0 ? code[w] : 0);
      };
      for (let q = 0; q < cols; q++) {
        const f0 = q / cols;
        const f1 = (q + 1) / cols;
        // (metres along keep counting past the seam of a closed loop, so the grain doesn't jump there)
        for (const [ii, f] of [[i, f0], [i + 1, f0], [i + 1, f1], [i, f0], [i + 1, f1], [i, f1]]) vert(ii, ii, f);
      }
    }
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aK', new THREE.Float32BufferAttribute(key, 2));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hint, 2));
  const U = {
    uTint: { value: new THREE.Color(1, 1, 1) },
    uRed: { value: new THREE.Color(COLORS.red) },
    uBlue: { value: new THREE.Color(COLORS.blue) },
    uVio: { value: new THREE.Color(COLORS.violet) },
    uTime: { value: 0 },
    uGain: { value: take.gain },
    uCalm: { value: 0 },
    uOpen: { value: 1 },
    uLensR: { value: 0 },
    uLensB: { value: 0 },
    uHW: { value: hwMain },
  };
  const mat = new THREE.ShaderMaterial({
    ...GRAIN,
    defines: { STYLE: take.style },
    uniforms: U,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  // over the road's glass, under its lines and lights
  mesh.renderOrder = 1.5;
  // each view's own lens (split-screen prepares the layers for a view before it's drawn)
  mesh.onBeforeRender = () => {
    const t = L.level.get('tint');
    if (t) U.uTint.value.copy(t);
    const T = U.uTint.value;
    U.uOpen.value = smoothstep(0.35, 0.95, Math.min(T.r, T.b));
    U.uLensR.value = T.r > T.b ? 1 : 0;
    U.uLensB.value = T.b > T.r ? 1 : 0;
    U.uCalm.value = ACCESS.calm ? 1 : 0;
  };
  // (the clock runs on, but wrapped, so the shader's float time stays precise on a long session)
  world.animated.push((t) => (U.uTime.value = t % 3600));
  // in the layers' group, so the quake on Echo Ruins moves it with the road it lies on
  L.group.add(mesh);
  world.grain = mesh;
}

function smoothstep(a, b, v) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
