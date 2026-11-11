// How the Möbius strip (course 11) looks. Its one idea is a ribbon with a half twist, and everything here is that
// idea again: the road has a satin finish that shifts colour as it turns, the gates round it are bands with a half
// twist of their own, the corkscrew is rifled like a barrel, lights run the strip's one edge all the way round both
// sides, and out past the course the horizon is a band that turns over three times and the sky holds a great ∞.
// There is no ground: this side's floor would be the other side's ceiling, so both get the same rippling sheet.
//
// (How the strip is drawn turned over: mobius.js. Scenery is laid out on the flat course and bent with it; a piece
// that hangs under the strip is laid out on lap two's lobe, which is where the underside is before it's bent.)

import * as THREE from '../../vendor/three.js';
import { M, COLORS } from './shift.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const TAU = Math.PI * 2;
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// A wire Möbius band: centre c, radius R, half-width w, lying in the plane of e1 and e2. Half of it belongs to the
// red world and half to the blue.
function band(L, c, R, w, e1, e2, seg = 72) {
  const e3 = new THREE.Vector3().crossVectors(e1, e2).normalize();
  const at = (k, s) => {
    const t = (k / seg) * TAU;
    const rad = new THREE.Vector3().addScaledVector(e1, Math.cos(t)).addScaledVector(e2, Math.sin(t));
    const d = rad.clone().multiplyScalar(Math.cos(t / 2)).addScaledVector(e3, Math.sin(t / 2));
    return c.clone().addScaledVector(rad, R).addScaledVector(d, s * w);
  };
  for (let k = 0; k < seg; k++) {
    const mask = k < seg / 2 ? M.R : M.B;
    const a0 = at(k, -1);
    const a1 = at(k + 1, -1);
    const b0 = at(k, 1);
    const b1 = at(k + 1, 1);
    L.line(mask, a0, a1);
    L.line(mask, b0, b1);
    L.line(mask, a0, b0);
    L.line(mask, at(k, 0), at(k + 1, 0));
    L.quad(mask, a0, a1, b1, b0, null, 0.1);
  }
}

export function mobiusDecor(world) {
  const L = world.layers;
  const m = world.main;
  const mob = world.mob;
  const N = m.N;
  const half = N >> 1;
  const hw = m.halfW;
  const right = (i) => V(m.rightX(i), 0, m.rightZ(i));
  const along = (i) => V(m.thx[m.wrap(i)], 0, m.thz[m.wrap(i)]);
  // out on the wing, where the two laps lie apart (near the twist straight they lie one over the other)
  const wing = (i) => mob.kind[i] === 0 && m.px[i] > 45;
  // A point of the drawn course, as a point of the flat one: over the strip it's where it is; under the strip it's
  // on lap two's lobe, half a turn about the straight away. (null: the flat course has something else there.)
  const flat = (p, under) => {
    const q = under ? V(-p.x, -p.y, p.z) : p.clone();
    return mob.kind[mob.near(q.x, q.y, q.z)] === (under ? 1 : 0) ? q : null;
  };
  // the side roads, to keep scenery off them
  const side = [];
  for (const b of world.paths) if (b !== m) for (let j = 0; j < b.N; j += 2) side.push(b.px[j], b.py[j], b.pz[j], b.halfW);
  const free = (p, r = 5) => {
    for (let k = 0; k < side.length; k += 4) {
      const dx = side[k] - p.x;
      const dz = side[k + 2] - p.z;
      if (dx * dx + dz * dz < (side[k + 3] + r) ** 2 && Math.abs(side[k + 1] - p.y) < 16) return false;
    }
    return true;
  };

  // ---------------------------------------------------------------- twist gates
  // A ring round the strip that is itself a band with a half twist: red over the top of the road, blue under it.
  const gate = (i, r, w, a0 = 0, seg = 56) => {
    const c = m.point(i, 0, 0);
    const u = right(i);
    const t = along(i);
    const at = (k, s) => {
      const a = (k / seg) * TAU;
      const dir = V(0, 0, 0).addScaledVector(u, Math.cos(a)).addScaledVector(UP, Math.sin(a));
      const d = dir.clone().multiplyScalar(Math.cos(a / 2 + a0)).addScaledVector(t, Math.sin(a / 2 + a0));
      return c.clone().addScaledVector(dir, r).addScaledVector(d, s * w);
    };
    for (let k = 0; k < seg; k++) {
      const under = k >= seg / 2;
      const mask = under ? M.B : M.R;
      const P = [at(k, -1), at(k + 1, -1), at(k + 1, 1), at(k, 1)].map((p) => flat(p, under));
      if (P.some((p) => !p)) continue;
      L.line(mask, P[0], P[1]);
      L.line(mask, P[3], P[2]);
      if (k % 2 === 0) L.line(mask, P[0], P[3]);
      L.quad(mask, P[0], P[1], P[2], P[3], null, 0.14);
    }
  };
  // (near the straight, and down the twist, a plain ring: an arch over each lap's road, which bend into one)
  const arch = (i, mask, r, width) => L.hoop(mask, m.point(i, 0, 0), right(i), UP, r, width, 36, null, Math.PI, 0);
  let g = 0;
  for (let i = 0; i < half; i++) {
    const twist = mob.kind[i] >= 2;
    const every = twist ? 11 : 58;
    if (i % every !== (twist ? 0 : 20)) continue;
    if (wing(i)) {
      g++;
      gate(i, hw + 7 + (g % 3) * 2.5, 2.2, g % 2 ? 0 : Math.PI / 2);
      // and a slim one inside it, twisted the other way
      if (g % 2) gate(i + 6, hw + 3.5, 1.1, Math.PI / 2, 44);
      continue;
    }
    const r = hw + (twist ? 4.5 : 7);
    arch(i, M.R, r, twist ? 0.9 : 2.2);
    arch(i + half, M.B, r, twist ? 0.9 : 2.2);
  }

  // ---------------------------------------------------------------- the corkscrew, rifled
  // Ten filaments run the length of the twist, five over each pass. Laid straight, they bend into helices: the barrel
  // turns round you as the road turns over.
  for (const [base, mask] of [[0, M.R], [half, M.B]]) {
    let i0 = -1;
    let i1 = -1;
    for (let i = 0; i < half; i++) {
      if (mob.kind[i + base] < 2) continue;
      if (i0 < 0) i0 = i + base;
      i1 = i + base;
    }
    if (i0 < 0) continue;
    const r = hw + 4.5;
    for (let k = 0; k < 5; k++) {
      const a = ((k + 0.5) / 5) * Math.PI;
      const lat = Math.cos(a) * r;
      const h = Math.sin(a) * r;
      for (let i = i0; i < i1; i++) {
        const p = m.point(i, lat, h);
        const q = m.point(i + 1, lat, h);
        L.line(mask, p, q);
        // every other one is a ribbon, standing on its line
        if (k % 2 === 0) L.quad(mask, p, q, m.point(i + 1, lat * 1.09, h * 1.09), m.point(i, lat * 1.09, h * 1.09), null, 0.28);
      }
    }
    // a bell mouth at each end
    for (const [i, d] of [[i0, -1], [i1, 1]]) for (let k = 1; k <= 3; k++) arch(i + d * k * 5, mask, r + k * k * 1.3, 0.8);
  }

  // ---------------------------------------------------------------- stitches
  // A ribbon each side of the road that weaves through the strip's plane: red where it rises over this side, blue
  // where it dips under to the other, and it turns over as it goes. Through a lens it's a row of stitches.
  for (const s of [-1, 1]) {
    for (let i = 0; i < half - 2; i += 2) {
      if (!wing(i) || !wing(i + 2)) continue;
      // (in runs, with gaps between)
      if (Math.sin(i * 0.021 + (s > 0 ? 0 : 2.2)) < -0.15) continue;
      const P = [];
      let under = false;
      for (const j of [i, i + 2]) {
        const ph = j * 0.085 + (s > 0 ? 0 : Math.PI);
        const c = m.point(j, s * (hw + 13), Math.sin(ph) * 7.5);
        const d = right(j).multiplyScalar(Math.cos(ph / 2)).addScaledVector(UP, Math.sin(ph / 2));
        P.push(c.clone().addScaledVector(d, 1.3), c.clone().addScaledVector(d, -1.3));
        if (j === i) under = Math.sin(ph + 0.085) < 0;
      }
      const Q = P.map((p) => flat(p, under));
      if (Q.some((p) => !p) || !free(Q[0], 6) || !free(Q[2], 6)) continue;
      const mask = under ? M.B : M.R;
      L.line(mask, Q[0], Q[2]);
      L.line(mask, Q[1], Q[3]);
      if (i % 4 === 0) L.line(mask, Q[0], Q[1]);
      L.quad(mask, Q[0], Q[2], Q[3], Q[1], null, 0.3);
    }
  }

  // ---------------------------------------------------------------- the strip itself, as sculpture
  // a great band hung over the middle of each lobe, and small ones along the road
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < half; i++) {
    cx += m.px[i];
    cz += m.pz[i];
  }
  cx /= half;
  cz /= half;
  const tilt = V(0, 0.42, 0.91).normalize();
  for (const s of [1, -1]) {
    band(L, V(cx * s, 62, cz), 46, 15, V(s, 0, 0), tilt, 96);
    band(L, V(cx * s, 62, cz), 78, 5, V(0, 0, 1), V(s * 0.9, 0.44, 0).normalize(), 96);
  }
  const rng = world.rng;
  for (let i = 40; i < N; i += 96) {
    if (mob.kind[m.wrap(i)] >= 2) continue;
    const sd = (Math.floor(i / 96) % 2 ? 1 : -1) * (i < half ? 1 : -1);
    const c = m.point(i, sd * (hw + 30 + rng() * 10), 14 + rng() * 10);
    // (keep them off the far side of the twist straight, which is the other lobe's ground)
    if (Math.abs(c.x) < 30) continue;
    const a = rng() * Math.PI;
    band(L, c, 9, 3, V(Math.cos(a), 0, Math.sin(a)), V(0, 1, 0), 40);
  }

  satin(world);
  runners(world);
}

// -------------------------------------------------------------------- the road's finish
// Satin: a sheen laid over the black glass that shifts colour with the angle you see it at, in bands that run the
// length of the ribbon and slide across it as it turns. With both worlds open it runs from red through magenta and
// violet to blue, leaning red along the top of the strip and blue along the underside, and the two meet in violet
// down the twists. Through a lens there is only that lens's colour, so the sheen is light and dark bands of it.
const SATIN = {
  vertexShader: `
    attribute vec3 aN; attribute vec3 aT; attribute vec3 aK;
    varying vec3 vP, vN, vT, vK;
    void main(){
      vP = position; vN = aN; vT = aT; vK = aK;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uTint, uRed, uMag, uBlue; uniform float uTime, uGain;
    varying vec3 vP, vN, vT, vK;
    void main(){
      vec3 N = normalize(vN), T = normalize(vT), R = cross(N, T);
      vec3 E = cameraPosition - vP;
      float dist = length(E);
      E /= dist;
      float f = pow(1.0 - abs(dot(N, E)), 1.5);
      float across = dot(R, E);
      // the film's phase: the angle it's seen at, where across the ribbon, how far along, and a slow swirl
      float ph = 7.0 * f + 4.0 * across + vK.y * 1.4 + vK.z * 0.045 + 0.9 * sin(vK.z * 0.09 + vK.y * 2.3 + uTime * 0.4) - uTime * 0.5;
      float w = 0.5 + 0.5 * sin(ph);
      // which side of the strip: 0 along the top, 1 along the underside, turning over down each twist
      float under = smoothstep(0.43, 0.5, vK.x) - smoothstep(0.93, 1.0, vK.x);
      float k = w * 0.72 + 0.28 * under;
      vec3 both = k < 0.5 ? mix(uRed, uMag, smoothstep(0.08, 0.5, k)) : mix(uMag, uBlue, smoothstep(0.5, 0.92, k));
      float open = smoothstep(0.35, 0.95, min(uTint.r, uTint.b));
      vec3 lens = uTint * (0.12 + 0.88 * w * w) * 1.5;
      vec3 col = mix(lens, both, open);
      // bands of brightness, and satin's one bright stripe, which slides across as the ribbon turns
      float fringe = 0.55 + 0.45 * cos(2.0 * ph + 1.0);
      float c = clamp(2.4 * across + 0.45 * sin(vK.z * 0.03), -0.85, 0.85);
      float stripe = exp(-pow((vK.y - c) / 0.26, 2.0));
      float inten = (0.08 + 0.5 * f) * fringe + 0.26 * stripe * (0.35 + f);
      // the weave: fine threads down the length of the ribbon, lost with distance
      inten *= 1.0 - 0.3 * (0.5 + 0.5 * sin(vK.y * 70.0)) * (1.0 - smoothstep(30.0, 110.0, dist));
      inten *= 1.0 - smoothstep(380.0, 900.0, dist);
      // (nothing on the road's edge lights: they're their own colour)
      inten *= smoothstep(1.0, 0.86, abs(vK.y));
      gl_FragColor = vec4(col * inten * uGain, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

function satin(world) {
  const m = world.main;
  const mob = world.mob;
  const L = world.layers;
  const N = m.N;
  const hw = m.halfW;
  const pos = [];
  const nor = [];
  const tan = [];
  const key = [];
  const p = V(0, 0, 0);
  const q = V(0, 0, 0);
  const o = V(0, 0, 0);
  // one vertex: where it's drawn, the road's up and its way on there, and (lap fraction, across, metres along)
  const vert = (i, lat) => {
    const j = m.wrap(i);
    m.point(j, lat * hw, 0.036, p);
    mob.map(p, o);
    pos.push(o.x, o.y, o.z);
    q.set(m.nx[j], m.ny[j], m.nz[j]).add(p);
    mob.map(q, q).sub(o);
    nor.push(q.x, q.y, q.z);
    q.set(m.thx[j], 0, m.thz[j]).add(p);
    mob.map(q, q).sub(o);
    tan.push(q.x, q.y, q.z);
    key.push(i / N, lat, i * m.ds);
  };
  for (let i = 0; i < N; i++) {
    // (only the strip's own road: a bridge or a hole keeps its own look)
    if (m.mask[i] !== M.ALL) continue;
    for (const [a, b] of [[i, -1], [i + 1, 1], [i + 1, -1], [i, -1], [i, 1], [i + 1, 1]]) vert(a, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aN', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(tan, 3));
  g.setAttribute('aK', new THREE.Float32BufferAttribute(key, 3));
  const mat = new THREE.ShaderMaterial({
    ...SATIN,
    uniforms: {
      uTint: { value: new THREE.Color(1, 1, 1) },
      uRed: { value: new THREE.Color(COLORS.red) },
      uMag: { value: new THREE.Color(0xe030ff) },
      uBlue: { value: new THREE.Color(COLORS.blue) },
      uTime: { value: 0 },
      uGain: { value: 0.8 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // the underside's road lies in the same place, facing the other way: each face shows its own finish
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1.5;
  // each view's own lens (split-screen prepares the layers for a view before it's drawn)
  mesh.onBeforeRender = () => {
    const t = L.level.get('tint');
    if (t) mat.uniforms.uTint.value.copy(t);
  };
  world.animated.push((t) => (mat.uniforms.uTime.value = t));
  // (in the layers' group: already drawn where it belongs, so the per-frame bend leaves it alone)
  L.group.add(mesh);
  world.satin = mesh;
}

// -------------------------------------------------------------------- lights on the edge
// A Möbius strip has one edge. A string of lights runs it: along the top's one side, over in the twist, along the
// underside, and back, red on the red side and blue on the blue.
function runners(world) {
  const m = world.main;
  const mob = world.mob;
  const L = world.layers;
  const N = m.N;
  const half = N >> 1;
  const hw = m.halfW;
  const dart = (color) => {
    const g = new THREE.BufferGeometry();
    const w = 0.28;
    const len = 9;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0, 0, -len, -w, 0, 0, 0, 0, -len, w, 0, 0, 0, w * 2, 0, 0, 0, -len, 0, -w, 0], 3));
    const c = new THREE.Color(color);
    const col = [];
    for (const k of [1, 1, 0.05, 1, 0.05, 1, 1, 0.05, 1]) col.push(c.r * k, c.g * k, c.b * k);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  };
  const geo = [dart(COLORS.redHot), dart(COLORS.blueHot)];
  const mat = [L.materials(M.R).ribbon, L.materials(M.B).ribbon];
  const holder = new THREE.Group();
  const n = 26;
  const list = [];
  for (let k = 0; k < n * 2; k++) {
    const o = new THREE.Mesh(geo[0], mat[0]);
    o.frustumCulled = false;
    o.renderOrder = 3;
    holder.add(o);
    list.push(o);
  }
  const p = V(0, 0, 0);
  const q = V(0, 0, 0);
  const yq = new THREE.Quaternion();
  world.animated.push((t) => {
    for (let k = 0; k < list.length; k++) {
      const s = k < n ? 1 : -1;
      const f = ((k % n) / n) * N + ((t * 150) / m.ds) * 1 + (s > 0 ? 0 : N / (2 * n));
      const i = Math.floor(f) % N;
      const o = list[k];
      // (not over a hole in the road)
      if (!m.mask[i]) {
        o.visible = false;
        continue;
      }
      o.visible = true;
      m.point(i, s * (hw + 0.7), 0.5, p);
      m.point(i + 1, s * (hw + 0.7), 0.5, q);
      p.lerp(q, f - Math.floor(f));
      const blue = i >= half ? 1 : 0;
      o.geometry = geo[blue];
      o.material = mat[blue];
      mob.map(p, o.position);
      yq.setFromAxisAngle(UP, Math.atan2(m.thx[i], m.thz[i]));
      o.quaternion.copy(mob.turn()).multiply(yq);
    }
  });
  L.group.add(holder);
}

// -------------------------------------------------------------------- the space round the course
// No floor, no mountains. A sheet of ripples spreads from two centres (the ∞ again) under the strip and the same
// sheet over it, so each side of the strip has one for its ground and one for its sky; the horizon is a band that
// turns over three times on its way round; stars are all round; and straight up the twist hangs a great ∞.
// Returns what to do each frame.
export function mobiusEnv(env, world) {
  const G = env.group;
  for (const o of [...G.children]) {
    const mt = o.material;
    if (mt === env.gridMat || mt === env.gridMatB || mt === env.mtnMat || mt === env.mtnMatB || (o.isMesh && o.geometry.type === 'PlaneGeometry' && o !== env.sun)) {
      G.remove(o);
      o.geometry.dispose();
    }
  }
  const m = world.main;
  // the middle of the course as it's drawn (lap two's lobe lies under lap one's)
  let cx = 0;
  let cz = 0;
  const half = m.N >> 1;
  for (let i = 0; i < half; i++) {
    cx += m.px[i];
    cz += m.pz[i];
  }
  cx /= half;
  cz /= half;
  const cy = (world.minY + world.maxY) / 2;
  const segs = (pos, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const o = new THREE.LineSegments(g, mat);
    o.frustumCulled = false;
    return o;
  };

  // ripples: the curves a fixed product of distances from two centres (Cassini's ovals): two rings, then an ∞,
  // then one loop that rounds out as it grows
  const a = 250;
  const A = [];
  const B = [];
  const loop = (pts, out) => {
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      const q = pts[(k + 1) % pts.length];
      out.push(p[0], 0, p[1], q[0], 0, q[1]);
    }
  };
  for (let k = 0; k < 26; k++) {
    const b = 70 + k * 52 + (k > 12 ? (k - 12) * (k - 12) * 4 : 0);
    const out = k % 2 ? B : A;
    if (b > a * 1.001) {
      const pts = [];
      for (let j = 0; j < 200; j++) {
        const th = (j / 200) * TAU;
        const r = Math.sqrt(a * a * Math.cos(2 * th) + Math.sqrt(b ** 4 - a ** 4 * Math.sin(2 * th) ** 2));
        pts.push([r * Math.sin(th), r * Math.cos(th)]);
      }
      loop(pts, out);
    } else {
      const tm = 0.5 * Math.asin(Math.min(1, (b / a) ** 2));
      for (const s of [1, -1]) {
        const pts = [];
        for (const sign of [1, -1]) {
          for (let j = 0; j < 48; j++) {
            const th = tm * Math.sin((j / 48 - 0.5) * Math.PI) * sign;
            const r = Math.sqrt(Math.max(0, a * a * Math.cos(2 * th) + sign * Math.sqrt(Math.max(0, b ** 4 - a ** 4 * Math.sin(2 * th) ** 2))));
            pts.push([s * r * Math.sin(th), s * r * Math.cos(th)]);
          }
        }
        loop(pts, out);
      }
    }
  }
  const sheets = [];
  for (const s of [-1, 1]) {
    const sheet = new THREE.Group();
    sheet.add(segs(A, env.gridMat), segs(B, env.gridMatB));
    sheet.position.set(cx, cy + s * 150, cz);
    G.add(sheet);
    sheets.push(sheet);
  }

  // the horizon: a band with three half twists (one side, one edge, like the road)
  const hA = [];
  const hB = [];
  const R = 1500;
  const W = 300;
  const n = 264;
  const at = (k, s, out) => {
    const t = (k / n) * TAU;
    const c = Math.cos(1.5 * t);
    const sn = Math.sin(1.5 * t);
    const r = R + c * s * W;
    out.push(Math.cos(t) * r, sn * s * W, Math.sin(t) * r);
  };
  for (let k = 0; k < n; k++) {
    for (let j = 0; j <= 6; j++) {
      const s = j / 3 - 1;
      at(k, s, hA);
      at(k + 1, s, hA);
    }
    at(k, -1, hB);
    at(k, 1, hB);
  }
  const horizon = new THREE.Group();
  horizon.add(segs(hA, env.mtnMat), segs(hB, env.mtnMatB));
  horizon.position.set(cx, cy, cz);
  G.add(horizon);

  // stars under as well as over
  const under = new THREE.Points(env.stars.geometry, env.stars.material);
  under.scale.y = -1;
  under.frustumCulled = false;
  G.add(under);

  // the ∞: a ribbon with a half twist in it, one loop in each world's colour
  const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false };
  const matA = new THREE.LineBasicMaterial({ color: 0xff2a4a, opacity: 0.9, ...add });
  const matB = new THREE.LineBasicMaterial({ color: 0x1e8cff, opacity: 0.9, ...add });
  const fillA = new THREE.MeshBasicMaterial({ color: 0xff2a4a, opacity: 0.16, side: THREE.DoubleSide, ...add });
  const fillB = new THREE.MeshBasicMaterial({ color: 0x1e8cff, opacity: 0.16, side: THREE.DoubleSide, ...add });
  const sign = new THREE.Group();
  const S = 220;
  const big = 600;
  const wid = 62;
  const pt = (k, s) => {
    const t = (k / S) * TAU;
    const d = 1 + Math.sin(t) ** 2;
    const c = V((big * Math.cos(t)) / d, (big * Math.sin(t) * Math.cos(t)) / d, 70 * Math.sin(t));
    const t2 = ((k + 0.01) / S) * TAU;
    const d2 = 1 + Math.sin(t2) ** 2;
    const tg = V((big * Math.cos(t2)) / d2, (big * Math.sin(t2) * Math.cos(t2)) / d2, 70 * Math.sin(t2)).sub(c).normalize();
    const nrm = V(-tg.y, tg.x, 0).normalize();
    const z = V(0, 0, 1);
    // (the half twist, taken up along the whole loop)
    const w = nrm.multiplyScalar(Math.cos(t / 2)).addScaledVector(z, Math.sin(t / 2));
    return c.addScaledVector(w, s * wid);
  };
  const ln = [[], []];
  const tri = [[], []];
  for (let k = 0; k < S; k++) {
    // the right-hand loop is one world's, the left-hand loop the other's
    const which = Math.cos(((k + 0.5) / S) * TAU) > 0 ? 0 : 1;
    const p0 = pt(k, -1);
    const p1 = pt(k + 1, -1);
    const q0 = pt(k, 1);
    const q1 = pt(k + 1, 1);
    const c0 = pt(k, 0);
    const c1 = pt(k + 1, 0);
    for (const [u, v] of [[p0, p1], [q0, q1], [c0, c1], [p0, q0]]) ln[which].push(u.x, u.y, u.z, v.x, v.y, v.z);
    for (const u of [p0, p1, q1, p0, q1, q0]) tri[which].push(u.x, u.y, u.z);
  }
  const mesh = (pos, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Mesh(g, mat);
  };
  sign.add(segs(ln[0], matA), segs(ln[1], matB), mesh(tri[0], fillA), mesh(tri[1], fillB));
  sign.traverse((o) => {
    o.renderOrder = -2;
    o.frustumCulled = false;
  });
  G.add(sign);
  // dead ahead as you come up the twist straight
  const dir = V(m.thx[0], 0, m.thz[0]).normalize();
  const yaw = Math.atan2(dir.x, dir.z);

  return (dt, t, camera) => {
    const cp = camera.position;
    under.position.copy(cp);
    sheets[0].rotation.y = t * 0.012;
    sheets[1].rotation.y = -t * 0.012;
    horizon.rotation.y = t * 0.006;
    sign.position.copy(cp).addScaledVector(dir, 2000);
    sign.position.y = cy;
    sign.rotation.set(0, yaw + Math.PI + Math.sin(t * 0.11) * 0.3, Math.sin(t * 0.07) * 0.06);
    const k = 0.9 + env.pulse;
    matA.color.copy(env.tint.grid).multiplyScalar(k);
    matB.color.copy(env.tint.gridB).multiplyScalar(k);
    fillA.color.copy(env.tint.grid);
    fillB.color.copy(env.tint.gridB);
  };
}
