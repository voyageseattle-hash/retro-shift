// 15 DYSON SPHERE: a shell built round a star. One long lap: off the line on the dark outside of the shell, over the
// rim of an opening and down its throat, a whole orbit of the inside under the star (with three dives off the shell
// toward it), and out over the rim of a second opening to the line.
//
// The physics drives a flat road like every other course; the road you see is that road rolled out over the shell
// (curved.js, dyson-shape.js). The layout is the walk in dyson-walk.js.

import * as THREE from '../../vendor/three.js';
import { M, COLORS, RED, BLUE } from './shift.js';
import { walk, rollMain, rollBranch, R, DECK, STAR, UC, COLLAR, RIM_PTS } from './dyson-shape.js';
import { segments } from './dyson-walk.js';
import { drawnDir } from './curved.js';

const W = walk(segments());
const mark = (name) => W.marks.find((m) => m.seg.name === name);
// the lap fraction `t` of the way through a named piece of the walk
const U = (name, t = 0) => {
  const m = mark(name);
  return ((m.d0 + (m.d1 - m.d0) * t) / W.length) % 1;
};

const wall = (at, mask) => ({ type: 'wall', at, mask });
const gate = (at, mask, lat) => ({ type: 'gate', at, mask, lat });
const block = (at, lat, mask, size = 3) => ({ type: 'block', at, lat, mask, size });

export const DYSON = {
  id: 'dyson',
  num: '15',
  name: 'DYSON SPHERE',
  blurb: 'One lap of a shell round a star: the dark outside, over the rim, and an orbit of the inside.',
  decor: dysonDecor,
  seed: 1515,
  laps: 1,
  sun: 0,
  skyPiece: 'none',
  space: true, // no ground, no horizon: the course brings its own sky (env.js)
  fog: [700, 7000],
  noPylons: true,
  points: W.pts,
  curved: {
    lay(world) {
      const miss = rollMain(world.main, W.marks, W.length);
      if (Math.hypot(miss[0], miss[1]) > 0.5) console.warn('dyson: the rolled road misses closing by', miss);
      for (const p of world.paths) if (p !== world.main) rollBranch(world.main, p);
      // for the course map (minimap.js): the sphere, its star and its openings
      world.main.globe = { R, star: STAR, holes: openings(world.main).map((o) => ({ axis: o.axis, r: UC })) };
    },
  },
  walk: W,
  branches: [
    // inside the first bend after the first dive: a red-only line cut across it
    { from: U('in4', 0.25), to: U('in6', 0.12), mask: M.RO, side: -1, lift: 9, label: 'RED CHORD', signed: true },
    // and a blue-only one across the bend before the second
    { from: U('in6', 0.86), to: U('in8', 0.35), mask: M.BO, side: -1, lift: 9, label: 'BLUE CHORD', signed: true },
  ],
  gaps: [
    { at: U('in6', 0.42), len: 44, mask: M.R, noRails: true },
    { at: U('in11b', 0.15), len: 40, mask: M.B, noRails: true },
  ],
  obstacles: [
    wall(U('in6', 0.2), M.B),
    gate(U('in6', 0.62), M.R, -1), gate(U('in6', 0.66), M.B, 1), gate(U('in6', 0.7), M.R, -1), gate(U('in6', 0.74), M.B, 1),
    block(U('in10', 0.3), 0.5, M.R), block(U('in10', 0.45), -0.4, M.B), block(U('in10', 0.6), 0.3, M.R), block(U('in10', 0.75), -0.5, M.B),
    wall(U('in11', 0.5), M.R),
  ],
  boosts: [
    { at: U('grid', 0.5) }, { at: U('out2', 0.3) }, { at: U('out4', 0.2) },
    { at: U('in1', 0.3) }, { at: U('dive1', 0.03) }, { at: U('dive1', 0.5) },
    { at: U('in6', 0.05) }, { at: U('dive2', 0.03) }, { at: U('dive2', 0.5) },
    { at: U('dive3', 0.04) }, { at: U('in13', 0.2) }, { at: U('home1', 0.5) },
  ],
  shards: [
    { at: U('out1', 0.4), n: 3 }, { at: U('in2', 0.3), n: 3, lat: -0.4 }, { at: U('dive1', 0.3), n: 4, gap: 0.004 },
    { at: U('in5', 0.5), n: 3, lat: -0.4 }, { at: U('in7', 0.4), n: 3, lat: -0.4 }, { at: U('dive2', 0.3), n: 4, gap: 0.004 },
    { at: U('in9', 0.2), n: 3 }, { at: U('in12', 0.4), n: 3, lat: -0.3 }, { at: U('home2', 0.3), n: 3 },
  ],
};

// ------------------------------------------------------------------ scenery
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// where each opening is: the middle of its throat, as a direction from the star
function openings(main) {
  const F = main.frames;
  const out = [];
  for (const m of W.marks) {
    if (m.seg.kind !== 'rim') continue;
    const i0 = main.index(m.d0 / W.length);
    const i1 = main.index(m.d1 / W.length);
    const mid = (i0 + i1) >> 1;
    let best = mid;
    const rad = (i) => Math.hypot(F.o[i * 3], F.o[i * 3 + 1], F.o[i * 3 + 2]);
    for (let i = mid - 25; i <= mid + 25; i++) if (Math.abs(rad(i) - R) < Math.abs(rad(best) - R)) best = i;
    const c = V(F.o[best * 3], F.o[best * 3 + 1], F.o[best * 3 + 2]);
    const n = V(F.n[best * 3], F.n[best * 3 + 1], F.n[best * 3 + 2]);
    out.push({ axis: c.addScaledVector(n, UC - COLLAR.TUBE).normalize(), i: best, i0, i1 });
  }
  return out;
}

// the edges and faces of an icosphere of frequency f, as unit vectors
function geodesic(f) {
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

const STAR_SHADER = {
  uniforms: { uTop: { value: new THREE.Color(0xff3a7a) }, uBot: { value: new THREE.Color(0x3a6aff) }, uTime: { value: 0 } },
  vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
    void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uTop, uBot; uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
    void main(){
      float y = normalize(vP).y * 0.5 + 0.5;
      // the drive-in sun: bands that widen toward the bottom and crawl
      float band = step(0.5, fract(y * 15.0 - uTime * 0.12));
      float cut = y < 0.6 ? mix(1.0, band, smoothstep(0.6, 0.15, y) * 0.85 + 0.1) : 1.0;
      vec3 c = mix(uBot, uTop, smoothstep(0.1, 0.9, y));
      float rim = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.0);
      gl_FragColor = vec4(c * (0.25 + 0.9 * cut) + c * rim * 0.9, 1.0);
    }`,
};

function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.32)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.08)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}

function dysonDecor(world, L, main, rng) {
  const ops = openings(main);
  const nearOpening = (p, reach) => ops.some((o) => Math.acos(Math.min(1, p.dot(o.axis))) * R < reach);

  // ---- the shell: a geodesic frame, with collector panels lit here and there (red world's and blue world's)
  const tris = geodesic(12);
  const seen = new Set();
  const key = (a, b) => {
    const k = (p) => `${Math.round(p.x * 500)},${Math.round(p.y * 500)},${Math.round(p.z * 500)}`;
    const ka = k(a);
    const kb = k(b);
    return ka < kb ? ka + kb : kb + ka;
  };
  const hole = UC + 6;
  for (const T of tris) {
    const mid = T[0].clone().add(T[1]).add(T[2]).normalize();
    if (nearOpening(mid, hole + 40)) continue;
    for (let e = 0; e < 3; e++) {
      const a = T[e];
      const b = T[(e + 1) % 3];
      const k = key(a, b);
      if (seen.has(k)) continue;
      seen.add(k);
      L.line(M.ALL, a.clone().multiplyScalar(R), b.clone().multiplyScalar(R), 0x4a3a8a);
    }
    const q = rng();
    if (q < 0.16) {
      const mask = q < 0.08 ? M.R : M.B;
      const P = T.map((p) => p.clone().lerp(mid, 0.12).multiplyScalar(R - 0.5));
      L.quad(mask, P[0], P[1], P[2], P[2], null, 0.1 + rng() * 0.12);
      for (let e = 0; e < 3; e++) L.line(mask, P[e], P[(e + 1) % 3]);
      // a collector's beam, up to the star
      if (rng() < 0.3) L.line(mask, mid.clone().multiplyScalar(R - 1), mid.clone().multiplyScalar(STAR * 1.02), mask === M.R ? 0x7a1428 : 0x0e3f7a);
    }
  }

  // ---- the collars round the openings: the rim's own profile, swept round the opening's axis
  for (const [n, o] of ops.entries()) {
    const a = o.axis;
    const e1 = V(1, 0, 0).addScaledVector(a, -a.x).normalize();
    if (e1.lengthSq() < 0.5) e1.set(0, 1, 0).addScaledVector(a, -a.y).normalize();
    const e2 = V(0, 0, 0).crossVectors(a, e1);
    const at = (k, f) => {
      const [x, y] = RIM_PTS[k];
      return V(0, 0, 0).addScaledVector(a, y).addScaledVector(e1, x * Math.cos(f)).addScaledVector(e2, x * Math.sin(f));
    };
    const K = RIM_PTS.length;
    const SEG = 48;
    const rings = 18;
    for (let q = 0; q <= rings; q++) {
      const k = Math.round((q / rings) * (K - 1));
      const lit = q === Math.round(rings / 2);
      for (let s = 0; s < SEG; s++) {
        const p0 = at(k, (s / SEG) * Math.PI * 2);
        const p1 = at(k, ((s + 1) / SEG) * Math.PI * 2);
        L.line(M.ALL, p0, p1, lit ? 0xffffff : q % 2 ? COLORS.red : COLORS.blue);
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
    // a band of light round the throat
    const kT = Math.round(K / 2);
    for (let s = 0; s < SEG; s++) {
      const f0 = (s / SEG) * Math.PI * 2;
      const f1 = ((s + 1) / SEG) * Math.PI * 2;
      L.quad(M.ALL, at(kT - 12, f0), at(kT - 12, f1), at(kT + 12, f1), at(kT + 12, f0), 0xb04cff, 0.22);
    }
  }

  // ---- the star
  const mat = new THREE.ShaderMaterial({ ...STAR_SHADER, uniforms: THREE.UniformsUtils.clone(STAR_SHADER.uniforms), fog: false });
  const star = new THREE.Mesh(new THREE.SphereGeometry(STAR, 48, 32), mat);
  world.group.add(star);
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7ab0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.85 });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(STAR * 5.2);
  glow.renderOrder = -1;
  world.group.add(glow);
  // rings of fire round it: the red world's and the blue world's
  for (let k = 0; k < 6; k++) {
    const u = V(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    const v = V(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(u).normalize();
    L.ring(k % 2 ? M.R : M.B, V(0, 0, 0), u, v, STAR * (1.12 + 0.09 * k), 96);
    L.ring(k % 2 ? M.R : M.B, V(0, 0, 0), u, v, STAR * (1.14 + 0.09 * k), 96);
  }
  const TOP = { [RED]: 0xff2a4a, [BLUE]: 0x6ae0ff };
  const BOT = { [RED]: 0xff8a3a, [BLUE]: 0x1e8cff };
  const cT = new THREE.Color();
  const cB = new THREE.Color();
  world.animated.push((t, dt) => {
    const mode = world.layers.lastMode;
    cT.set(TOP[mode] ?? 0xff3a7a);
    cB.set(BOT[mode] ?? 0x3a6aff);
    const k = 1 - Math.exp(-6 * (dt || 0.016));
    mat.uniforms.uTop.value.lerp(cT, k);
    mat.uniforms.uBot.value.lerp(cB, k);
    mat.uniforms.uTime.value = t;
    glowMat.color.copy(mat.uniforms.uTop.value).lerp(mat.uniforms.uBot.value, 0.35);
    star.rotation.y = t * 0.02;
  });

  // ---- space outside: stars, thick along one band
  const sp = [];
  for (let k = 0; k < 3200; k++) {
    const d = V(rng() - 0.5, (rng() - 0.5) * (k % 3 ? 1 : 0.18), rng() - 0.5).normalize().multiplyScalar(4300);
    sp.push(d.x, d.y, d.z);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xb8b8d8, size: 1.6, sizeAttenuation: false, fog: false }));
  stars.frustumCulled = false;
  world.group.add(stars);

  // ---- along the road: hoops, so the way on reads over the short horizon outside and up the bowl inside
  const F = main.frames;
  const outside = (i) => Math.hypot(F.o[i * 3], F.o[i * 3 + 1], F.o[i * 3 + 2]) > R + DECK - 1;
  const onShell = (i) => Math.abs(Math.hypot(F.o[i * 3], F.o[i * 3 + 1], F.o[i * 3 + 2]) - R) < DECK + 1.5;
  let n = 0;
  for (let i = 30; i < main.N; i += 45) {
    if (!onShell(i) && n % 2) {
      n++;
      continue;
    }
    const c = main.wpoint(i, 0, 0, V(0, 0, 0));
    const u = drawnDir(main, i, V(main.rightX(i), 0, main.rightZ(i)));
    const up = V(F.n[i * 3], F.n[i * 3 + 1], F.n[i * 3 + 2]);
    const mask = n++ % 2 ? M.R : M.B;
    L.hoop(mask, c, u, up, main.halfW + (outside(i) ? 5 : 8), outside(i) ? 2 : 2.6, 36, null, Math.PI, 0);
  }
}
