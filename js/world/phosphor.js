// The SIGNAL CUP's road finish: phosphor. The first cup is the clean signal, so its five roads glow like a CRT
// tube, with faint scanlines that roll away from you toward the horizon and burn brighter the faster you go. It is
// the quietest of the three cups' finishes (STATIC's grain is noisier, PARADOX's iridescence stranger), so the
// road stays the easiest to read.
//
// Each course has its own take on the tube:
//   01 CORE CIRCUIT   RASTER      plain scanlines, red and blue phosphor rows by turns, a soft glow down the middle
//   02 LAYERED GRID   INTERLACE   two fields, and each deck draws the other field; low decks run red, high decks
//                                 blue, and a slow hum bar rolls up the road like an old set's
//   03 SHIFT TUNNELS  VECTOR      no raster: beams trace the lanes and leave phosphor trails that fade behind them
//   04 ORBITAL LOOPS  SCOPE       an oscilloscope's red and blue traces braid down the road into loops
//   05 GRID CITY      DOT MASK    the road is a screen: a shadow mask of red and blue dots, with chase lights
//
// With both worlds open the finish is red, blue and the violet between. Through a lens it is that lens's colour
// only, and road that belongs to a world fades and redraws with it (the shift wave too), like the road itself.
// It is one additive pass over the road with no texture reads; on LOW graphics the fine pattern is dropped.

import * as THREE from '../../vendor/three.js';
import { M, COLORS } from './shift.js';
import { WAVE } from './fx.js';

const STYLE = { core: 0, layered: 1, tunnels: 2, orbital: 3, city: 4 };

// Shared by every phosphor material: 1 for the full pattern, 0 on LOW graphics (race.js sets it each frame).
export const PHOSPHOR = { uDetail: { value: 1 } };

const VERT = `
  attribute vec3 aK;
  varying vec3 vP, vK;
  void main(){
    vP = position; vK = aK;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FRAG = (style) => `
  #define STYLE ${style}
  uniform vec3 uTint, uRed, uBlue, uVio, uWaveC, uWaveEdge;
  uniform float uTime, uSpeed, uLevel, uFrom, uTo, uWaveR, uDetail, uGain, uH0, uH1, uHW;
  varying vec3 vP, vK;
  const float TAU = 6.2831853;
  // a thin bright line once per unit of x, softened toward its average where it gets finer than a pixel
  float lines(float x, float sharp){
    float w = fwidth(x);
    float l = pow(0.5 + 0.5 * cos(TAU * x), sharp);
    return mix(l, 0.6 / sqrt(sharp), smoothstep(0.25, 0.7, w));
  }
  void main(){
    if (uLevel * max(uFrom, uTo) < 0.003) discard;
    float along = vK.x, lat = vK.y, m = vK.z;
    float dist = distance(vP, cameraPosition);
    float spd = clamp(uSpeed, 0.0, 1.4);
    // the rows roll away from you, faster with speed
    float roll = uTime * (5.0 + 34.0 * spd);
    float mid = 1.0 - lat * lat;
    // k: 0 red .. 1 blue for the pattern's colour with both worlds open, b its brightness; g: the tube's even glow
    // under it, in the violet between (so the base never blocks out in one world's colour)
    float k = 0.5, b = 0.0, g = 0.05 + 0.08 * mid;

  #if STYLE == 0
    // RASTER: even rows across the road, red and blue phosphor by turns, and the tube's glow down the middle
    float ph = (along - roll) / 1.1;
    float row = mod(floor(ph + 0.5), 2.0);
    float s = lines(ph, 16.0);
    k = row;
    g += 0.05 * mid;
    b = s * (0.30 + 0.25 * mid) * uDetail;
  #elif STYLE == 1
    // INTERLACE: two fields; each deck draws the other one, and the deck's height sets its colour
    float deck = floor((vP.y - uH0) / 7.0);
    float ph = (along - roll) / 1.3 + 0.5 * mod(deck, 2.0);
    float s = lines(ph * 0.5, 10.0);
    float hum = exp(-pow(fract((along - uTime * 22.0) / 140.0) - 0.5, 2.0) * 90.0);
    k = clamp((vP.y - uH0) / max(1.0, uH1 - uH0), 0.0, 1.0);
    k = mix(k, 1.0 - k, step(0.5, fract(ph * 0.5 + 0.25)) * 0.35);
    g += 0.16 * hum;
    b = s * 0.42 * uDetail;
  #elif STYLE == 2
    // VECTOR: three beams trace the lanes, each a run of comets with phosphor tails that decay behind them
    float lane = lat * 3.0;
    float li = floor(lane + 0.5);
    float beam = exp(-pow((lane - li) / 0.05, 2.0)) * step(abs(li), 1.0);
    float head = fract((along - uTime * (24.0 + 55.0 * spd) - li * 37.0) / 46.0);
    float tail = exp(-(1.0 - head) * 11.0);
    float flash = smoothstep(0.985, 1.0, head);
    k = 0.5 + 0.5 * li;
    // the faintest raster under it, so the floor still reads in the dark of a tunnel
    float sc = lines((along - roll * 0.6) / 2.4, 6.0);
    g = 0.035 + 0.04 * mid + sc * 0.07 * uDetail;
    b = beam * (0.12 + 0.8 * tail + 1.1 * flash) * mix(0.5, 1.0, uDetail);
  #elif STYLE == 3
    // SCOPE: an oscilloscope's two traces weave down the road, red and blue at different rates, so they braid into
    // loops like the course's own (violet where they cross), with a halo of afterglow round each
    float amp = uHW * 0.55;
    float ya = amp * sin((along - roll * 0.8) / 3.0);
    float yb = amp * sin((along - roll * 0.8) / 4.5 + 1.7);
    float w = max(0.1, fwidth(m) * 1.2);
    float ta = exp(-pow((m - ya) / w, 2.0)) * 0.1 / w + 0.2 * exp(-pow((m - ya) / 1.6, 2.0));
    float tb = exp(-pow((m - yb) / w, 2.0)) * 0.1 / w + 0.2 * exp(-pow((m - yb) / 1.6, 2.0));
    float sc = lines((along - roll) / 1.4, 12.0);
    g += sc * 0.1 * uDetail;
    k = tb / max(ta + tb, 1e-4);
    b = (ta + tb) * 0.55 * mix(0.6, 1.0, uDetail);
  #else
    // DOT MASK: a shadow mask of round dots, red and blue columns by turns, and chase lights rolling up the road
    vec2 cell = vec2(along / 0.7, m / 0.7);
    vec2 f = fract(cell) - 0.5;
    float col = mod(floor(cell.y), 2.0);
    float dotf = 1.0 - smoothstep(0.12, 0.26, length(f));
    float wd = fwidth(cell.x) + fwidth(cell.y);
    dotf = mix(dotf, 0.16, smoothstep(0.35, 0.9, wd));
    float chase = 0.25 + 0.75 * pow(0.5 + 0.5 * cos(TAU * (along - roll * 1.4) / 18.0), 6.0);
    k = col;
    b = dotf * chase * 0.9 * uDetail + (1.0 - uDetail) * 0.08 * chase;
  #endif

    // with both worlds open: red .. violet .. blue; through a lens, that lens's colour only
    vec3 both = k < 0.5 ? mix(uRed, uVio, smoothstep(0.0, 0.5, k)) : mix(uVio, uBlue, smoothstep(0.5, 1.0, k));
    float open = smoothstep(0.35, 0.95, min(uTint.r, uTint.b));
    vec3 c = mix(uTint * 1.25, both, open);
    vec3 cg = mix(uTint * 1.25, uVio, open);
    // brighter with speed, gone by the far distance, and kept off the edge lights (they're their own colour)
    float fade = (0.35 + 0.85 * spd) * uGain * (1.0 - smoothstep(220.0, 640.0, dist)) * smoothstep(1.0, 0.86, abs(lat));
    b *= fade;
    g *= fade;
    // this road's world fading (or the shift wave redrawing it)
    float wdist = distance(vP, uWaveC);
    float inside = 1.0 - smoothstep(uWaveR - 3.0, uWaveR, wdist);
    float lv = mix(uFrom, uTo, inside) * uLevel;
    if (lv < 0.003 || b + g < 0.001) discard;
    gl_FragColor = vec4((c * b + cg * g) * lv, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// Where each pane reads the viewer's speed from: how fast its camera moves through race time (one estimate per
// camera per frame; a paused race holds it).
const _cam = new WeakMap();
function cameraSpeed(cam, now) {
  let s = _cam.get(cam);
  if (!s) _cam.set(cam, (s = { p: cam.position.clone(), t: now, v: 0 }));
  const dt = now - s.t;
  if (dt < 0) s.t = now;
  else if (dt > 0.004) {
    const v = s.p.distanceTo(cam.position) / dt;
    // (a jump: a respawn or a camera cut, not speed)
    if (dt < 0.5 && v < 220) s.v += (v - s.v) * (1 - Math.exp(-dt * 4));
    s.p.copy(cam.position);
    s.t = now;
  }
  return s.v;
}

export function buildPhosphor(world) {
  const style = STYLE[world.def.id];
  if (style === undefined || globalThis.location?.search.includes('nophosphor')) return;
  const L = world.layers;
  const m = world.main;
  // one mesh per world the road belongs to, so each fades with its own world
  const by = new Map();
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (const path of world.paths) {
    const hw = path.halfW;
    const last = path.closed ? path.N : path.N - 1;
    for (let i = 0; i < last; i++) {
      const mask = path.mask[i];
      // (a gap has no road; water has its own look)
      if (!mask || path.water?.[i]) continue;
      const j = path.wrap(i + 1);
      let B = by.get(mask);
      if (!B) by.set(mask, (B = { pos: [], key: [] }));
      const s0 = i * path.ds;
      const s1 = (i + 1) * path.ds;
      path.wpoint(i, -hw, 0.01, v[0]);
      path.wpoint(j, -hw, 0.01, v[1]);
      path.wpoint(j, hw, 0.01, v[2]);
      path.wpoint(i, hw, 0.01, v[3]);
      const K = [[s0, -1], [s1, -1], [s1, 1], [s0, 1]];
      for (const q of [0, 1, 2, 0, 2, 3]) {
        B.pos.push(v[q].x, v[q].y, v[q].z);
        B.key.push(K[q][0], K[q][1], K[q][1] * hw);
      }
    }
  }
  const ONE = { value: 1 };
  for (const [mask, B] of by) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('aK', new THREE.Float32BufferAttribute(B.key, 3));
    g.computeBoundingSphere();
    const per = mask === M.ALL ? null : L.materials(mask).per;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG(style),
      uniforms: {
        ...WAVE,
        ...PHOSPHOR,
        uFrom: per?.uFrom ?? ONE,
        uTo: per?.uTo ?? ONE,
        uLevel: { value: 1 },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uRed: { value: new THREE.Color(COLORS.red) },
        uBlue: { value: new THREE.Color(COLORS.blue) },
        uVio: { value: new THREE.Color(style === 4 ? COLORS.pink : COLORS.violet) },
        uTime: { value: 0 },
        uSpeed: { value: 0 },
        uGain: { value: 0.28 },
        uH0: { value: world.minY },
        uH1: { value: world.maxY },
        uHW: { value: world.halfWidth },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 1.5;
    // each view's own lens, fade and speed (split-screen prepares the layers for a view before it's drawn)
    mesh.onBeforeRender = (r, s, cam) => {
      const U = mat.uniforms;
      const t = L.level.get('tint');
      if (t) U.uTint.value.copy(t);
      U.uLevel.value = L.wave && per ? 1 : (L.level.get(mask) ?? 1);
      U.uSpeed.value = cameraSpeed(cam, U.uTime.value) / 62;
    };
    world.animated.push((t) => (mat.uniforms.uTime.value = t));
    L.group.add(mesh);
  }
}
