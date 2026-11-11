// The look of DYSON SPHERE (dyson.js): a machine built round a star.
//
// Its own colours: the two worlds' red and blue, plus STARLIGHT GOLD, which no other course has. Gold is this
// course's neutral: the star's core, the shell's ribs, the light that leaks out of the openings. Through a lens the
// gold goes with the other world (everything here takes its colours from PAL, which follows the viewer's lens).
//
//   outside  the dark side: plated hull with a few lit ports, radiator fins glowing over the short horizon, and a
//            shaft of starlight standing out of each opening so you can see where the road is going
//   inside   a bowl of collector cells, red world's and blue world's, glinting under the star; a swarm of mirrors
//            in orbit between you and it; the star itself, banded like the drive-in sun but alive
//   the road an iridescent solar film: dull oil-slick on the dark side, blazing where it mirrors the star

import * as THREE from '../../vendor/three.js';
import { M, RED, BLUE } from './shift.js';
import { R, DECK, STAR, RIM_PTS, RIM_REACH } from './dyson-shape.js';
import { drawnDir } from './curved.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);
export const GOLD = 0xffc46a;

// ------------------------------------------------------------------ the lens palette
// what each lens makes of the course's colours; lv: how much of the red world's / blue world's light is left
const LOOK = {
  both: { warm: C(0xff2a4a), cool: C(0x1e8cff), gold: C(GOLD), line: C(0x5a3cc0), hot: C(0xfff0c8), top: C(0xff3a7a), bot: C(0x3a6aff), i0: C(0xff2a4a), i1: C(GOLD), i2: C(0x1e8cff), wl: 1, cl: 1 },
  [RED]: { warm: C(0xff2a4a), cool: C(0xff2a4a), gold: C(0xff5a48), line: C(0xa01a30), hot: C(0xff8a70), top: C(0xff2a4a), bot: C(0xff7a3a), i0: C(0xff2a4a), i1: C(0xff7a3a), i2: C(0xff3a70), wl: 1, cl: 0 },
  [BLUE]: { warm: C(0x1e8cff), cool: C(0x1e8cff), gold: C(0x5ab4ff), line: C(0x1a4ab0), hot: C(0x8adcff), top: C(0x6ae0ff), bot: C(0x1e8cff), i0: C(0x1e8cff), i1: C(0x5ae0ff), i2: C(0x4a48ff), wl: 0, cl: 1 },
};
const COLOUR_KEYS = ['warm', 'cool', 'gold', 'line', 'hot', 'top', 'bot', 'i0', 'i1', 'i2'];

function makePalette() {
  const P = { uTime: { value: 0 }, uWl: { value: 1 }, uCl: { value: 1 } };
  for (const k of COLOUR_KEYS) P[k] = { value: LOOK.both[k].clone() };
  P.follow = (mode, dt, t) => {
    const T = LOOK[mode] ?? LOOK.both;
    const a = 1 - Math.exp(-7 * (dt || 0.016));
    for (const k of COLOUR_KEYS) P[k].value.lerp(T[k], a);
    P.uWl.value += (T.wl - P.uWl.value) * a;
    P.uCl.value += (T.cl - P.uCl.value) * a;
    P.uTime.value = t;
  };
  return P;
}

// ------------------------------------------------------------------ shapes
// the faces of an icosphere of frequency f, as unit vectors
export function geodesic(f) {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((a) => V(...a).normalize());
  const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const tris = [];
  for (const [a, b, c] of faces) {
    const P = (i, j) => V(0, 0, 0).addScaledVector(v[a], (f - i - j) / f).addScaledVector(v[b], i / f).addScaledVector(v[c], j / f).normalize();
    for (let i = 0; i < f; i++) {
      for (let j = 0; j < f - i; j++) {
        tris.push([P(i, j), P(i + 1, j), P(i, j + 1)]);
        if (i + j < f - 1) tris.push([P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]);
      }
    }
  }
  return tris;
}

// The collar's own skin: the road's rim profile (x from the opening's axis, y along it), set DECK under the road.
function collarProfile() {
  const K = RIM_PTS.length;
  const out = [];
  let sign = 0;
  for (let k = 0; k < K; k++) {
    const a = RIM_PTS[Math.max(0, k - 1)];
    const b = RIM_PTS[Math.min(K - 1, k + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l;
    const ny = (b[0] - a[0]) / l;
    // (under the road is toward the shell at the start, where the road rides outside it)
    if (!sign) sign = Math.hypot(RIM_PTS[0][0] + nx * DECK, RIM_PTS[0][1] + ny * DECK) < Math.hypot(...RIM_PTS[0]) ? 1 : -1;
    out.push([RIM_PTS[k][0] + sign * nx * DECK, RIM_PTS[k][1] + sign * ny * DECK]);
  }
  return out;
}

function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  return new THREE.CanvasTexture(cv);
}

// ------------------------------------------------------------------ shaders
const NOISE = `
  float h13(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float vn(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

// The shell, one mesh seen from both sides. Each geodesic panel is cut into cells by its barycentric coordinates.
const SHELL = {
  vertexShader: `attribute vec3 aB; attribute vec3 aRnd; attribute vec3 aFn;
    varying vec3 vB; varying vec3 vRnd; varying vec3 vFn; varying vec3 vW; varying vec3 vDir; varying vec3 vStar;
    void main(){ vB = aB; vRnd = aRnd; vDir = normalize(position);
      vFn = normalize(mat3(modelMatrix) * aFn);
      vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vStar = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 warm, cool, gold, line; uniform float uWl, uCl, uTime, uCut; uniform vec3 uAx0, uAx1;
    varying vec3 vB; varying vec3 vRnd; varying vec3 vFn; varying vec3 vW; varying vec3 vDir; varying vec3 vStar;
    ${NOISE}
    // distance to the nearest cell edge (in cells), the cell's id, and a line of constant width on screen
    float cells(float n, out vec3 id, out float ln, float thick){
      vec3 g = vB * n; vec3 f = fract(g); id = floor(g);
      float flip = step(1.5, f.x + f.y + f.z); id.x += flip * 0.37;
      vec3 e = mix(f, 1.0 - f, flip);
      float d = min(e.x, min(e.y, e.z));
      float w = max(fwidth(g.x), max(fwidth(g.y), fwidth(g.z)));
      ln = (1.0 - smoothstep(thick * w, (thick + 1.2) * w, d)) * clamp(0.22 / w, 0.0, 1.0);
      return d; }
    void main(){
      vec3 dir = normalize(vDir);
      float a0 = acos(clamp(dot(dir, uAx0), -1.0, 1.0)); float a1 = acos(clamp(dot(dir, uAx1), -1.0, 1.0));
      float ao = min(a0, a1);
      if (ao < uCut) discard;
      vec3 v = normalize(cameraPosition - vW);
      bool outside = dot(vFn, v) > 0.0;
      vec3 rq = floor(vRnd * 255.0 + 0.5) / 255.0; // (a face's numbers, exactly: interpolation leaves dust in them)
      vec3 id1, id4, id16; float l1, l4, l16;
      cells(1.0, id1, l1, 1.6);
      float d4 = cells(4.0, id4, l4, 0.7);
      vec3 col;
      if (!outside) {
        // ---- the lit side: collector cells, the red world's and the blue world's, on gold ribs
        float r = h13(id4 + rq * 19.0);
        float r2 = h13(id4.zxy + rq * 7.0);
        // lit in fields: whole districts of the bowl are working, others are dark
        float field = smoothstep(0.35, 0.7, vn(dir * 5.0 + 3.0));
        float lit = smoothstep(0.75 - 0.5 * field, 1.0, r);
        float pulse = 0.65 + 0.35 * sin(uTime * (0.4 + 1.8 * r2) + r * 40.0);
        vec3 cell = r2 < 0.5 ? warm * uWl : cool * uCl;
        float inset = smoothstep(0.03, 0.3, d4);
        col = vec3(0.004, 0.003, 0.012) + gold * 0.004;
        col += cell * (0.012 + 0.2 * lit * pulse) * (0.3 + 0.7 * inset);
        // each cell is a mirror a little off true: some of them catch the star for you as you pass
        vec3 n = normalize(-vFn + (vec3(r, r2, h13(id4.yzx + rq)) - 0.5) * 0.9);
        vec3 l = normalize(vStar - vW);
        float sp = pow(max(dot(reflect(-l, n), v), 0.0), 28.0);
        col += mix(gold, cell, 0.35) * sp * 0.35;
        // power running along the seams toward the openings
        float flow = pow(0.5 + 0.5 * sin(a0 * 46.0 + uTime * 1.3), 10.0) + pow(0.5 + 0.5 * sin(a1 * 46.0 + uTime * 1.3), 10.0);
        col += gold * l4 * (0.006 + 0.07 * flow) + gold * l1 * 0.03;
        // the star's haze over the far side of the bowl
        col += gold * 0.006 * smoothstep(250.0, 1300.0, distance(cameraPosition, vW));
        col += gold * 0.12 * exp(-(ao - uCut) * 640.0 / 45.0);
      } else {
        // ---- the dark side: plated hull, lit ports, and starlight leaking round the openings
        cells(16.0, id16, l16, 0.5);
        float d16 = cells(16.0, id16, l16, 0.5);
        float r = h13(id16 + rq * 23.0);
        float port = step(0.94, r) * smoothstep(0.12, 0.22, d16);
        float r2 = h13(id16.yzx + rq * 5.0);
        vec3 pc = r2 < 0.4 ? warm * uWl : r2 < 0.8 ? cool * uCl : gold;
        float plate = 0.6 + 0.8 * h13(id4 + rq * 3.0);
        col = vec3(0.003, 0.002, 0.008) * plate;
        col += line * (l16 * 0.02 + l4 * 0.06 + l1 * 0.15);
        col += pc * port * (0.3 + 0.15 * sin(uTime * 2.0 + r * 60.0));
        float leak = exp(-(ao - uCut) * 640.0 / 70.0);
        col += gold * leak * (0.04 + 0.2 * l4 + 0.12 * l16);
        // the limb: a thin skin of light on the horizon, so the hull's curve reads against space
        col += line * 0.12 * pow(1.0 - max(dot(v, vFn), 0.0), 5.0);
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const STAR_SHADER = {
  vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
    void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 top, bot, hot; uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
    ${NOISE}
    void main(){
      vec3 p = normalize(vP);
      // the drive-in sun's bands, wrapped round a ball and boiling
      float n = vn(p * 3.0 + vec3(0.0, uTime * 0.05, 0.0)) * 0.6 + vn(p * 7.0 - vec3(uTime * 0.07, 0.0, 0.0)) * 0.4;
      float g = vn(p * 26.0 + vec3(uTime * 0.2));
      float y = p.y * 0.5 + 0.5 + (n - 0.5) * 0.07;
      // (the two worlds' colours in turn, band by band, with the star's own gold in the seams)
      float q = y * 11.0 - uTime * 0.04;
      float band = smoothstep(0.25, 0.6, abs(fract(q) - 0.5) * 2.0);
      float which = mod(floor(q + 0.5), 2.0);
      vec3 c = mix(bot, top, which) * (0.75 + 0.5 * g);
      c = mix(hot * 0.5, c, band);
      float f = max(dot(normalize(vN), normalize(vV)), 0.0);
      c = mix(c, hot, (0.06 + pow(f, 2.0) * 0.4) * (0.5 + 0.6 * n));
      c += mix(top, hot, 0.4) * pow(1.0 - f, 2.5) * 0.6;
      gl_FragColor = vec4(c * 0.52, 1.0);
    }`,
};

// starlight standing out of an opening
const SHAFT = {
  vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 gold, hot; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      float f = abs(dot(normalize(vN), normalize(vV)));
      float along = 1.0 - vUv.y;
      float streak = 0.7 + 0.3 * sin(vUv.x * 6.2832 * 14.0 + sin(vUv.y * 9.0 - uTime * 0.6) * 2.0);
      float k = pow(f, 1.6) * pow(along, 1.7) * streak;
      gl_FragColor = vec4(mix(gold, hot, along * along) * k * 0.1, 1.0);
    }`,
};

// the sky outside: a painted map (r: the red world's cloud, g: the blue world's, b: dust)
const SKY = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D map; uniform vec3 warm, cool, line; uniform float uWl, uCl; varying vec2 vUv;
    void main(){ vec3 m = texture2D(map, vUv).rgb;
      gl_FragColor = vec4(warm * m.r * uWl * 0.07 + cool * m.g * uCl * 0.07 + line * m.b * 0.06, 1.0); }`,
};

// ------------------------------------------------------------------ the road's finish
// SOLAR FILM. The road's black glass takes a thin-film sheen whose colour turns with the angle you see it at and with
// where the star is: on the dark side there is only the film's own slow oil-slick, inside it blazes where it mirrors
// the star. A road of one world keeps to that world's colours; the shared road follows the viewer's lens.
function solarFilm(mat, set) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    Object.assign(sh.uniforms, set);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFilmP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFilmP = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFilmP;\nuniform vec3 uI0;\nuniform vec3 uI1;\nuniform vec3 uI2;\nuniform vec3 uFilmStar;\nuniform float uFilmT;')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        {
          vec3 fv = normalize(cameraPosition - vWetP);
          vec3 fn = normalize(cross(dFdx(vWetP), dFdy(vWetP)));
          if (dot(fn, fv) < 0.0) fn = -fn;
          float fc = dot(fn, fv);
          vec3 fl = normalize(uFilmStar - vWetP);
          float lit = smoothstep(-0.15, 0.35, dot(fn, fl));
          float mir = max(dot(reflect(-fl, fn), fv), 0.0);
          // the film's thickness wanders along the road
          float th = sin(vFilmP.x * 0.043 + sin(vFilmP.z * 0.029) * 1.7) + sin(vFilmP.y * 0.037 + vFilmP.z * 0.051 + uFilmT * 0.12);
          float ph = fc * 2.6 + th * 0.33 + mir * 0.9 * lit;
          vec3 w = 0.5 + 0.5 * cos(6.2832 * (ph + vec3(0.0, 0.3333, 0.6667)));
          w = w * w; w /= (w.x + w.y + w.z);
          vec3 film = uI0 * w.x + uI1 * w.y + uI2 * w.z;
          float fres = pow(1.0 - fc, 1.5);
          float k = (0.03 + 0.3 * fres) * (0.3 + 0.7 * lit);
          float glint = pow(mir, 18.0) * lit;
          gl_FragColor.rgb += film * k + uI1 * glint * 0.25;
          gl_FragColor.a = max(gl_FragColor.a, min(1.0, k * 2.0 + glint));
        }`,
      );
  };
  const prevKey = mat.customProgramCacheKey.call(mat);
  mat.customProgramCacheKey = () => `${prevKey}|solarfilm`;
}

// ------------------------------------------------------------------ the scenery
// ops: the openings ({ axis }), from dyson.js
export function dysonArt(world, L, main, rng, ops) {
  const PAL = makePalette();
  const G = world.group;
  const F = main.frames;
  const u = (...keys) => Object.fromEntries(keys.map((k) => [k, PAL[k]]));
  const cut = Math.min(RIM_REACH.in, RIM_REACH.out) - 0.004;
  const radius = (i) => Math.hypot(F.o[i * 3], F.o[i * 3 + 1], F.o[i * 3 + 2]);
  const isOutside = (i) => radius(i) > R + DECK - 1;
  const onShell = (i) => Math.abs(radius(i) - R) < DECK + 1.5;
  const fromOpening = (p) => Math.min(...ops.map((o) => Math.acos(Math.max(-1, Math.min(1, p.dot(o.axis) / p.length()))))) * R;

  // ---- the shell
  const tris = geodesic(12);
  {
    const pos = [];
    const bary = [];
    const rnd = [];
    const fn = [];
    const seen = new Set();
    const key = (a, b) => {
      const k = (p) => `${Math.round(p.x * 500)},${Math.round(p.y * 500)},${Math.round(p.z * 500)}`;
      const ka = k(a);
      const kb = k(b);
      return ka < kb ? ka + kb : kb + ka;
    };
    for (const T of tris) {
      const mid = T[0].clone().add(T[1]).add(T[2]).normalize();
      const n = V(0, 0, 0).crossVectors(T[1].clone().sub(T[0]), T[2].clone().sub(T[0])).normalize();
      if (n.dot(mid) < 0) n.negate();
      const q = [rng(), rng(), rng()];
      for (let e = 0; e < 3; e++) {
        pos.push(T[e].x * R, T[e].y * R, T[e].z * R);
        bary.push(e === 0 ? 1 : 0, e === 1 ? 1 : 0, e === 2 ? 1 : 0);
        rnd.push(...q);
        fn.push(n.x, n.y, n.z);
      }
      if (fromOpening(mid) < cut * R + 30) continue;
      // the frame: gold ribs inside, where the star lights them; a dim outline on the hull
      for (let e = 0; e < 3; e++) {
        const a = T[e];
        const b = T[(e + 1) % 3];
        const k = key(a, b);
        if (seen.has(k)) continue;
        seen.add(k);
        L.line(M.ALL, a.clone().multiplyScalar(R - 1.2), b.clone().multiplyScalar(R - 1.2), 0x241a0a);
        L.line(M.ALL, a.clone().multiplyScalar(R + 1.2), b.clone().multiplyScalar(R + 1.2), 0x16113a);
      }
      // a collector's beam, up to the star: the red world's or the blue world's
      const b = rng();
      if (b < 0.045) {
        const mask = b < 0.0225 ? M.R : M.B;
        const P = T.map((p) => p.clone().lerp(mid, 0.3).multiplyScalar(R - 1.5));
        for (let e = 0; e < 3; e++) L.line(mask, P[e], P[(e + 1) % 3]);
        L.quad(mask, P[0], P[1], P[2], P[2], null, 0.3);
        L.line(mask, mid.clone().multiplyScalar(R - 2), mid.clone().multiplyScalar(STAR * 1.02), mask === M.R ? 0x7a1428 : 0x0e3f7a);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aB', new THREE.Float32BufferAttribute(bary, 3));
    g.setAttribute('aRnd', new THREE.Float32BufferAttribute(rnd, 3));
    g.setAttribute('aFn', new THREE.Float32BufferAttribute(fn, 3));
    const mat = new THREE.ShaderMaterial({
      ...SHELL,
      uniforms: { ...u('warm', 'cool', 'gold', 'line', 'uWl', 'uCl', 'uTime'), uCut: { value: cut }, uAx0: { value: ops[0].axis }, uAx1: { value: (ops[1] ?? ops[0]).axis } },
      side: THREE.DoubleSide,
      fog: false,
    });
    const shell = new THREE.Mesh(g, mat);
    shell.frustumCulled = false;
    shell.renderOrder = -1;
    G.add(shell);
  }

  // ---- the collars round the openings: a dark skin under the road, ringed, with the star's light in the throat
  const prof = collarProfile();
  const K = prof.length;
  const collarMat = new THREE.ShaderMaterial({
    uniforms: u('gold', 'line'),
    vertexShader: `attribute float aK; varying float vK; void main(){ vK = aK; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 gold, line; varying float vK;
      void main(){ float t = exp(-pow((vK - 0.5) / 0.2, 2.0)); gl_FragColor = vec4(vec3(0.008, 0.006, 0.02) + line * 0.015 + gold * t * 0.07, 1.0); }`,
    side: THREE.DoubleSide,
    fog: false,
  });
  for (const [n, o] of ops.entries()) {
    const a = o.axis;
    const e1 = V(1, 0, 0).addScaledVector(a, -a.x).normalize();
    if (e1.lengthSq() < 0.5) e1.set(0, 1, 0).addScaledVector(a, -a.y).normalize();
    const e2 = V(0, 0, 0).crossVectors(a, e1);
    const at = (k, f, out = V(0, 0, 0)) => {
      const [x, y] = prof[k];
      return out.set(0, 0, 0).addScaledVector(a, y).addScaledVector(e1, x * Math.cos(f)).addScaledVector(e2, x * Math.sin(f));
    };
    const SEG = 48;
    // the skin
    const pos = [];
    const ks = [];
    const idx = [];
    const KS = 40;
    for (let q = 0; q <= KS; q++) {
      const k = Math.round((q / KS) * (K - 1));
      for (let s = 0; s <= SEG; s++) {
        const p = at(k, (s / SEG) * Math.PI * 2);
        pos.push(p.x, p.y, p.z);
        ks.push(q / KS);
        if (q < KS && s < SEG) {
          const i0 = q * (SEG + 1) + s;
          idx.push(i0, i0 + 1, i0 + SEG + 1, i0 + 1, i0 + SEG + 2, i0 + SEG + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aK', new THREE.Float32BufferAttribute(ks, 1));
    g.setIndex(idx);
    const skin = new THREE.Mesh(g, collarMat);
    skin.frustumCulled = false;
    skin.renderOrder = -1;
    G.add(skin);
    // rings round it: gold through the throat, the two worlds' colours either side
    const rings = 18;
    for (let q = 0; q <= rings; q++) {
      const k = Math.round((q / rings) * (K - 1));
      const mid = Math.abs(q - rings / 2);
      for (let s = 0; s < SEG; s++) {
        const p0 = at(k, (s / SEG) * Math.PI * 2);
        const p1 = at(k, ((s + 1) / SEG) * Math.PI * 2);
        if (mid <= 2) L.line(M.ALL, p0, p1, mid < 1 ? 0xfff0c8 : GOLD);
        else L.line(q % 2 ? M.R : M.B, p0, p1);
      }
    }
    for (let s = 0; s < SEG; s += 2) {
      const f = (s / SEG) * Math.PI * 2;
      const mask = (s / 2 + n) % 2 ? M.R : M.B;
      for (let q = 0; q < rings; q++) {
        const k0 = Math.round((q / rings) * (K - 1));
        const k1 = Math.round(((q + 1) / rings) * (K - 1));
        L.line(mask, at(k0, f), at(k1, f));
      }
    }
    // the shaft of starlight out of the opening, and guide rings up it: you see it over the horizon from the dark side
    const throat = Math.min(...prof.map((p) => p[0]));
    const LEN = 1700;
    const cone = new THREE.CylinderGeometry((throat * (R + LEN)) / R, throat * 0.9, LEN, 40, 1, true);
    cone.translate(0, LEN / 2 + R - 30, 0);
    const shaft = new THREE.Mesh(cone, new THREE.ShaderMaterial({ ...SHAFT, uniforms: u('gold', 'hot', 'uTime'), side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    shaft.quaternion.setFromUnitVectors(V(0, 1, 0), a);
    shaft.frustumCulled = false;
    shaft.renderOrder = 4;
    G.add(shaft);
    for (const [h, m] of [[70, M.ALL], [150, n ? M.R : M.B], [250, M.ALL], [380, n ? M.B : M.R], [540, M.ALL]]) {
      const r = (throat * (R + h)) / R + 10 + h * 0.03;
      L.ring(m, a.clone().multiplyScalar(R + h), e1, e2, r, 64, m === M.ALL ? GOLD : null);
      L.ring(m, a.clone().multiplyScalar(R + h + 3), e1, e2, r, 64, m === M.ALL ? GOLD : null);
    }
  }

  // ---- the star
  const starMat = new THREE.ShaderMaterial({ ...STAR_SHADER, uniforms: u('top', 'bot', 'hot', 'uTime'), fog: false });
  const star = new THREE.Mesh(new THREE.SphereGeometry(STAR, 64, 40), starMat);
  G.add(star);
  const glowTex = canvasTexture(256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.32)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.08)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  });
  const sprite = (map, color, size, opacity) => {
    const m = new THREE.SpriteMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(size);
    s.renderOrder = 0;
    G.add(s);
    return m;
  };
  const glowMat = sprite(glowTex, 0xff7ab0, STAR * 5.4, 0.3);
  // the corona's streamers
  const rayTex = canvasTexture(512, 512, (g) => {
    let s = 77;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.translate(256, 256);
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 90; k++) {
      const a = rnd() * Math.PI * 2;
      const len = 150 + rnd() * 105;
      const w = 0.012 + rnd() * 0.05;
      const grd = g.createRadialGradient(0, 0, 60, 0, 0, len);
      grd.addColorStop(0, `rgba(255,255,255,${0.1 + rnd() * 0.16})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, len, a - w, a + w);
      g.closePath();
      g.fill();
    }
  });
  const rayMat = sprite(rayTex, 0xffffff, STAR * 6.4, 0.12);
  const rayMat2 = sprite(rayTex, 0xffffff, STAR * 5.0, 0.08);
  // prominences: loops of fire off its face, the red world's and the blue world's
  for (let k = 0; k < 14; k++) {
    const d = V(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    const t = V(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(d).normalize();
    const r = 26 + rng() * 60;
    const lift = 0.7 + rng() * 0.9;
    const mask = k % 2 ? M.R : M.B;
    for (const s of [1, 0.84, 0.68]) {
      let prev = null;
      for (let q = 0; q <= 24; q++) {
        const a = (q / 24) * Math.PI;
        const p = d.clone().multiplyScalar(STAR * 0.99 + Math.sin(a) * r * s * lift).addScaledVector(t, Math.cos(a) * r * s);
        if (prev) L.line(mask, prev, p);
        prev = p;
      }
    }
  }

  // ---- the swarm: rings of mirrors in orbit between the shell and the star, each face-on to it
  const swarm = [];
  for (let k = 0; k < 4; k++) {
    const ring = new THREE.Group();
    ring.quaternion.setFromUnitVectors(V(0, 1, 0), V(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize());
    const rr = STAR * (1.3 + 0.17 * k);
    const count = 34 + k * 8;
    for (const mask of [M.R, M.B]) {
      const lp = [];
      const rp = [];
      const mats = L.materials(mask);
      const col = C(mats.base).multiplyScalar(0.22);
      for (let q = mask === M.R ? 0 : 1; q < count; q += 2) {
        const a = (q / count) * Math.PI * 2 + (rng() - 0.5) * 0.05;
        const d = V(Math.cos(a), (rng() - 0.5) * 0.06, Math.sin(a)).normalize();
        const t = V(-Math.sin(a), 0, Math.cos(a));
        const up = V(0, 0, 0).crossVectors(d, t).normalize();
        const s = 7 + rng() * 7;
        const c = d.clone().multiplyScalar(rr + (rng() - 0.5) * 14);
        const P = [c.clone().addScaledVector(t, s), c.clone().addScaledVector(up, s * 1.5), c.clone().addScaledVector(t, -s), c.clone().addScaledVector(up, -s * 1.5)];
        for (let e = 0; e < 4; e++) lp.push(P[e].x, P[e].y, P[e].z, P[(e + 1) % 4].x, P[(e + 1) % 4].y, P[(e + 1) % 4].z);
        lp.push(P[0].x, P[0].y, P[0].z, P[2].x, P[2].y, P[2].z);
        for (const e of [0, 1, 2, 0, 2, 3]) rp.push(P[e].x, P[e].y, P[e].z);
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      const lines = new THREE.LineSegments(lg, mats.wire);
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      const cols = new Float32Array(rp.length);
      for (let q = 0; q < cols.length; q += 3) cols.set([col.r, col.g, col.b], q);
      rg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const faces = new THREE.Mesh(rg, mats.ribbon);
      for (const o of [lines, faces]) {
        o.frustumCulled = false;
        o.renderOrder = 2;
        ring.add(o);
      }
    }
    const orbit = new THREE.Group();
    orbit.add(ring);
    G.add(orbit);
    swarm.push([ring, (k % 2 ? -1 : 1) * (0.05 - 0.008 * k)]);
  }

  // ---- space outside: a painted sky and stars, thick along one band
  const skyTex = canvasTexture(1024, 512, (g, w, h) => {
    let s = 4242;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 420; k++) {
      const x = rnd() * w;
      const band = h / 2 + Math.sin((x / w) * Math.PI * 4) * 46;
      const y = band + (rnd() - 0.5) * (rnd() < 0.75 ? 150 : 380);
      const r = 14 + rnd() * 70;
      const side = 0.5 + 0.5 * Math.sin((x / w) * Math.PI * 2 * 3 + 1 + (y / h) * 4);
      const dust = rnd() < 0.3;
      const col = dust ? [0, 0, 255] : rnd() < side ? [255, 0, 40] : [0, 255, 40];
      for (const dx of [-w, 0, w]) {
        const grd = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
        grd.addColorStop(0, `rgba(${col},${0.05 + rnd() * 0.07})`);
        grd.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = grd;
        g.fillRect(x + dx - r, y - r, r * 2, r * 2);
      }
    }
  });
  skyTex.wrapS = THREE.RepeatWrapping;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4400, 48, 24), new THREE.ShaderMaterial({ ...SKY, uniforms: { map: { value: skyTex }, ...u('warm', 'cool', 'line', 'uWl', 'uCl') }, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -3;
  sky.frustumCulled = false;
  G.add(sky);
  const sp = [];
  for (let k = 0; k < 3600; k++) {
    const d = V(rng() - 0.5, (rng() - 0.5) * (k % 3 ? 1 : 0.18), rng() - 0.5).normalize().multiplyScalar(4300);
    sp.push(d.x, d.y, d.z);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starsMat = new THREE.PointsMaterial({ color: 0xb8b8d8, size: 1.6, sizeAttenuation: false, fog: false });
  const stars = new THREE.Points(sg, starsMat);
  stars.frustumCulled = false;
  stars.renderOrder = -2;
  G.add(stars);

  // ---- the dark side: radiator fins and masts standing off the hull, so there is a skyline over the short horizon
  const outRoad = [];
  for (let i = 0; i < main.N; i += 4) if (isOutside(i)) outRoad.push(V(F.o[i * 3], F.o[i * 3 + 1], F.o[i * 3 + 2]));
  const clearOfRoad = (p, d) => outRoad.every((q) => q.distanceToSquared(p) > d * d);
  let nf = 0;
  for (let i = 0; i < main.N; i += 8) {
    if (!isOutside(i) || !onShell(i)) continue;
    for (const side of [-1, 1]) {
      const lat = side * (main.halfW + 34 + rng() * rng() * 330);
      const p = main.wpoint(i, lat, 0, V(0, 0, 0)).setLength(R);
      if (!clearOfRoad(p, main.halfW + 16) || fromOpening(p) < cut * R + 60) continue;
      const up = p.clone().normalize();
      const fwd = drawnDir(main, i, V(main.thx[i], 0, main.thz[i]));
      fwd.addScaledVector(up, -fwd.dot(up)).normalize();
      const rt = V(0, 0, 0).crossVectors(up, fwd).normalize();
      const far = Math.abs(lat) / 350;
      const kind = rng();
      if (kind < 0.72) {
        // a bank of radiator fins, edge-on to the road, hot at the root
        const mask = nf++ % 2 ? M.R : M.B;
        const h = 14 + rng() * 26 + far * 60;
        const w = 10 + rng() * 14 + far * 16;
        const fins = 2 + Math.floor(rng() * 3);
        for (let f = 0; f < fins; f++) {
          const base = p.clone().addScaledVector(fwd, (f - (fins - 1) / 2) * 7);
          const a = base.clone().addScaledVector(rt, -w / 2);
          const b = base.clone().addScaledVector(rt, w / 2);
          const hh = h * (1 - 0.12 * Math.abs(f - (fins - 1) / 2));
          const c = b.clone().addScaledVector(up, hh);
          const d = a.clone().addScaledVector(up, hh * 0.82);
          L.line(mask, a, d);
          L.line(mask, b, c);
          L.line(mask, d, c);
          L.quadFade(mask, a, b, c, d, L.materials(mask).base, 0.02, 0.0);
          for (const t of [0.33, 0.66]) L.line(mask, a.clone().lerp(d, t), b.clone().lerp(c, t));
        }
      } else {
        // a mast, gold, with a lamp
        const h = 40 + rng() * 50 + far * 50;
        const top = p.clone().addScaledVector(up, h);
        L.line(M.ALL, p, top, GOLD);
        for (const t of [0.5, 0.75]) {
          const c = p.clone().addScaledVector(up, h * t);
          const s = 6 * (1.2 - t);
          L.line(M.ALL, c.clone().addScaledVector(rt, -s), c.clone().addScaledVector(rt, s), GOLD);
          L.line(M.ALL, c.clone().addScaledVector(fwd, -s), c.clone().addScaledVector(fwd, s), GOLD);
        }
        L.quad(M.ALL, top.clone().addScaledVector(rt, -1.6), top.clone().addScaledVector(up, 2.4), top.clone().addScaledVector(rt, 1.6), top.clone().addScaledVector(up, -2.4), 0xfff0c8, 1);
      }
    }
  }

  // ---- along the road: hoops, so the way on reads over the short horizon outside and up the bowl inside;
  //      and where a dive leaves the shell, stays down to it
  let n = 0;
  for (let i = 30; i < main.N; i += 45) {
    if (!onShell(i) && n % 2) {
      n++;
      continue;
    }
    const c = main.wpoint(i, 0, 0, V(0, 0, 0));
    const rt = drawnDir(main, i, V(main.rightX(i), 0, main.rightZ(i)));
    const up = V(F.n[i * 3], F.n[i * 3 + 1], F.n[i * 3 + 2]);
    const mask = n++ % 2 ? M.R : M.B;
    L.hoop(mask, c, rt, up, main.halfW + (isOutside(i) ? 5 : 8), isOutside(i) ? 2 : 2.6, 36, null, Math.PI, 0);
  }
  for (let i = 0; i < main.N; i += 9) {
    if (onShell(i) || isOutside(i) || radius(i) > R - DECK - 8) continue;
    if (fromOpening(V(F.o[i * 3], F.o[i * 3 + 1], F.o[i * 3 + 2])) < cut * R + 40) continue;
    for (const side of [-1, 1]) {
      const a = main.wpoint(i, side * main.halfW, -0.3, V(0, 0, 0));
      const out = a.clone().normalize();
      const rt = drawnDir(main, i, V(main.rightX(i), 0, main.rightZ(i)));
      const b = out.clone().addScaledVector(rt, side * 0.1).setLength(R - 1.5);
      L.line(M.ALL, a, b, 0x8a6a34);
    }
  }

  // ---- the road's finish
  const filmShared = { uFilmStar: { value: V(0, 0, 0) }, uFilmT: PAL.uTime };
  const filmSet = (look) => (look ? { uI0: { value: look.i0 }, uI1: { value: look.i1 }, uI2: { value: look.i2 }, ...filmShared } : { uI0: PAL.i0, uI1: PAL.i1, uI2: PAL.i2, ...filmShared });
  for (const [mask, look] of [[M.ALL, null], [M.X, null], [M.R, LOOK[RED]], [M.RO, LOOK[RED]], [M.B, LOOK[BLUE]], [M.BO, LOOK[BLUE]]]) solarFilm(L.materials(mask).road, filmSet(look));

  const starsBoth = C(0xb8b8d8);
  world.animated.push((t, dt) => {
    const mode = world.layers.lastMode;
    PAL.follow(mode, dt, t);
    glowMat.color.copy(PAL.top.value).lerp(PAL.bot.value, 0.35).lerp(PAL.hot.value, 0.35);
    rayMat.color.copy(PAL.hot.value);
    rayMat2.color.copy(PAL.top.value).lerp(PAL.bot.value, 0.5);
    rayMat.rotation = t * 0.012;
    rayMat2.rotation = -t * 0.02;
    starsMat.color.copy(mode === RED || mode === BLUE ? PAL.hot.value : starsBoth);
    star.rotation.y = t * 0.02;
    for (const [ring, w] of swarm) ring.rotation.y = t * w;
    G.updateMatrixWorld();
    filmShared.uFilmStar.value.setFromMatrixPosition(G.matrixWorld);
  });
}
