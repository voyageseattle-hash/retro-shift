// Mirrors (MIRROR HOUSE). A mirror here is real glass: each frame the scene is drawn again from the camera's twin
// behind the glass, and the pane shows that picture where each bit of it would see it (the same idea as the wet road
// in game/reflect.js, stood on its side). So the road, the scenery, your own car and every rival are all in it, in
// the lens you're looking through, and a road that bends away beside a mirror reads as a fork with one false arm.
//
//   glass along the road   def.mirrors: { from, len, side, mask, back?, warp?, route? }. It starts at `from` on the
//                          road's edge and runs `len` metres straight on. Where the road lies along it (flush) the
//                          rail isn't drawn, so road and reflection meet without a seam; the glass still holds you
//                          like a rail. `back` stands it off behind the rail instead (the funhouse's warped panels).
//   glass doors            def.obstacles: { type: 'gate', mirror: true }: a mirror across half the road.
//
// A mirror is silvered in one world (its mask): red glass is there in BOTH and RED, and in BLUE it's gone, frame and
// all, with whatever is behind it showing: nothing, or a blue-only road running on through the frame.
//
// Only the nearest few mirrors in view are drawn live (each costs a pass over the scene); the rest are dark glass
// until you come up to them.

import * as THREE from '../../vendor/three.js';
import { M, RED, BLUE, solidIn, colorForMask, COLORS } from './shift.js';
import { smoothstep, damp, clamp } from '../core/util.js';
import { addSign } from './signs.js';
import { REFL } from './fx.js';
import { HouseArt, bigTop } from './mirrorart.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const GAP = 0.12; // the glass stands this far outside the road's edge
const FLUSH = 0.4; // the road's edge is "along the glass" while it's within this of it

const dim = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();

// ------------------------------------------------------------------ before the road is drawn
// The funhouse floor, and where each mirror stands: its line, the road samples beside it, and which of them lie
// flush along it (those lose their drawn rail until buildMirrors puts the rail data back).
export function layMirrors(world) {
  const def = world.def;
  const main = world.main;
  for (const f of def.funhouse || []) {
    const i0 = main.index(f.at);
    const n = Math.round(f.len / main.ds);
    for (let k = 0; k <= n; k++) {
      const i = main.wrap(i0 + k);
      const s = k * main.ds;
      const env = smoothstep(0, 30, s) * (1 - smoothstep(f.len - 30, f.len, s));
      // a slow roll and a slower tilt, out of step with each other: gentle enough to hold a car at full speed
      main.py[i] += env * 0.55 * Math.sin((s / 78) * Math.PI * 2);
      main.bank[i] += env * 0.13 * Math.sin((s / 112) * Math.PI * 2 + 1);
    }
    main.reframe();
    main.minY = Math.min(...main.py);
    main.maxY = Math.max(...main.py);
  }
  if (!def.mirrors?.length) return;
  const lay = (world.mirrorLay = { sides: [], saved: [] });
  for (const m of def.mirrors) {
    const path = main;
    const side = m.side;
    const edge = path.halfW + GAP + (m.back || 0);
    const i0 = path.index(m.from);
    // its line is the road's edge a little further on (16 to 40 m), where a hall that has just left a corner has
    // settled dead straight, carried back to the start
    const e0 = path.point(i0 + Math.round(16 / path.ds), side * edge, 0, new THREE.Vector3());
    const e1 = path.point(i0 + Math.round(40 / path.ds), side * edge, 0, new THREE.Vector3());
    const a = e1.clone().sub(e0).setY(0).normalize();
    const p0 = path.point(i0, side * edge, 0, _v);
    const O = e0.clone().addScaledVector(a, (p0.x - e0.x) * a.x + (p0.z - e0.z) * a.z).setY(p0.y);
    const n = new THREE.Vector3(-a.z, 0, a.x).multiplyScalar(-side).normalize(); // toward the road
    // the strip of glass, by the road samples it runs beside: s metres along it, the road's height there
    const strip = [];
    let last = -1;
    for (let k = 0; k < path.N / 2; k++) {
      const i = path.wrap(i0 + k);
      const e = path.point(i, side * edge, 0, _v);
      const s = (e.x - O.x) * a.x + (e.z - O.z) * a.z;
      // (the road has turned away: from here the glass carries straight on by itself)
      if (s > m.len || s < last + path.ds * 0.25) break;
      const dev = (e.x - O.x) * n.x + (e.z - O.z) * n.z;
      strip.push({ i, s, y: e.y, flush: !m.back && Math.abs(dev) < FLUSH });
      last = s;
    }
    for (let s = last + 2; s < m.len; s += 2) strip.push({ i: -1, s, y: strip[strip.length - 1].y, flush: false });
    strip.push({ i: -1, s: m.len, y: strip[strip.length - 1].y, flush: false });
    const rail = side < 0 ? path.railL : path.railR;
    const had = new Uint8Array(path.N);
    for (const q of strip) {
      if (!q.flush) continue;
      had[q.i] = rail[q.i];
      lay.saved.push([rail, q.i, rail[q.i]]);
      rail[q.i] = 0;
    }
    lay.sides.push({ m, path, side, O, a, n, strip, had });
  }
}

// A rail along the road's edge from sample i to j, as buildRoads draws it (the lip rising into a bumper).
function drawRail(L, path, i, j, side, mask, col) {
  const hw = path.halfW;
  let p0 = path.point(i, side * (hw - 0.5), 0.045, new THREE.Vector3());
  let p1 = path.point(j, side * (hw - 0.5), 0.045, new THREE.Vector3());
  for (let s = 1; s <= 3; s++) {
    const a = (s / 3) * Math.PI * 0.5;
    const lat = hw - 0.5 + (1 - Math.cos(a)) * 0.7;
    const y = 0.045 + Math.sin(a) * 0.75;
    const q0 = path.point(i, side * lat, y, new THREE.Vector3());
    const q1 = path.point(j, side * lat, y, new THREE.Vector3());
    L.quad(mask, p0, p1, q1, q0, col, 0.16 + s * 0.1);
    p0 = q0;
    p1 = q1;
  }
  L.quad(mask, path.point(i, side * (hw + 0.2), 1.1, _a).clone(), path.point(j, side * (hw + 0.2), 1.1, _b).clone(), path.point(j, side * (hw + 0.2), 0.75, _c).clone(), path.point(i, side * (hw + 0.2), 0.75, _d).clone(), col, 0.8);
  if (i % 4 === 0) L.line(mask, path.point(i, side * (hw + 0.2), 0, _a), path.point(i, side * (hw + 0.2), 1.1, _b), col);
}

// ------------------------------------------------------------------ the glass
const PANE_VERT = `
  attribute vec2 pl;
  uniform mat4 uTexM;
  varying vec4 vUv;
  varying vec2 vPl;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vUv = uTexM * wp;
    vPl = pl;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const PANE_FRAG = `
  uniform sampler2D uTex;
  uniform float uOn, uLive, uPass, uTime, uWarp, uLen, uH, uCrack;
  uniform vec3 uTint;
  uniform vec2 uHit;
  varying vec4 vUv;
  varying vec2 vPl;
  void main() {
    if (uOn < 0.02) discard;
    vec2 uv = vUv.xy / vUv.w;
    // funhouse glass: the picture swells and pinches along the panel and breathes
    if (uWarp != 0.0) {
      float u = vPl.x / uLen - 0.5;
      float v = vPl.y / uH - 0.5;
      float breathe = 0.75 + 0.25 * sin(uTime * 1.1 + uLen);
      uv.x += uWarp * 0.11 * breathe * sin(u * 6.2832) * (1.0 - 1.6 * v * v);
      uv.y += abs(uWarp) * 0.07 * breathe * sin(v * 3.1416 + uTime * 0.7) * cos(u * 3.1416);
      uv.x += 0.012 * sin(vPl.y * 2.4 + uTime * 2.0);
    }
    // where a car has just hit it, the picture jumps along the cracks
    float hd = distance(vPl, uHit);
    float ang = atan(vPl.y - uHit.y, vPl.x - uHit.x);
    float ray = pow(abs(sin(ang * 5.5 + sin(hd * 1.7) * 0.6)), 28.0);
    float web = pow(abs(sin(hd * 2.6 + sin(ang * 9.0) * 0.5)), 30.0) * step(hd, 5.0);
    float crack = uCrack * max(ray, web) * exp(-hd * 0.22);
    uv += crack * 0.03;
    uv = clamp(uv, 0.002, 0.998);
    vec3 refl = texture2D(uTex, uv).rgb;
    // the glass itself: thin glints lying across it, and the frame's light along the top and ends
    float g = smoothstep(0.992, 1.0, sin((vPl.x + vPl.y * 0.8) * 0.5));
    float e = min(min(vPl.x, uLen - vPl.x), uH - vPl.y);
    float rim = exp(-e * 2.2);
    vec3 dull = uTint * (0.006 + 0.05 * g);
    vec3 col = mix(dull, refl * 0.95, uLive * (1.0 - uPass)) + uTint * (rim * 0.22 + g * 0.02) + vec3(1.0) * crack * 0.9;
    gl_FragColor = vec4(col, uOn);
  }`;

// A pane in the plane through O (direction a along it, normal n toward the viewer): `strip` is [{ s, y }] along its
// foot, h its height. Returns the mesh, drawn in world coordinates.
function makePane(plane, O, a, strip, h, mask, warp) {
  const pos = [];
  const pl = [];
  const s0 = strip[0].s;
  const len = strip[strip.length - 1].s - s0;
  const P = (q, up) => [O.x + a.x * q.s, q.y - 0.12 + up, O.z + a.z * q.s];
  // wound so the front faces along n
  const flip = _v.crossVectors(a, UP).dot(plane.n) < 0;
  for (let k = 0; k < strip.length - 1; k++) {
    const q0 = strip[k];
    const q1 = strip[k + 1];
    const A = [P(q0, 0), [q0.s - s0, 0]];
    const B = [P(q1, 0), [q1.s - s0, 0]];
    const C = [P(q1, h), [q1.s - s0, h]];
    const D = [P(q0, h), [q0.s - s0, h]];
    for (const [p, uv] of flip ? [A, C, B, A, D, C] : [A, B, C, A, C, D]) {
      pos.push(...p);
      pl.push(...uv);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('pl', new THREE.Float32BufferAttribute(pl, 2));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    vertexShader: PANE_VERT,
    fragmentShader: PANE_FRAG,
    uniforms: {
      uTex: plane.uTex,
      uTexM: plane.uTexM,
      uLive: plane.uLive,
      uOn: { value: 1 },
      uTime: TIME,
      uPass: PASS,
      uWarp: { value: warp || 0 },
      uLen: { value: len },
      uH: { value: h },
      uTint: { value: new THREE.Color(colorForMask(mask)) },
      uHit: { value: new THREE.Vector2(-99, -99) },
      uCrack: { value: 0 },
    },
    transparent: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = -1;
  return { mesh, mat, mask, level: 1, box: g.boundingBox.clone(), O: O.clone().addScaledVector(a, s0), a: a.clone(), len, h, y0: strip[0].y, plane };
}

const TIME = { value: 0 };
// 1 while a mirror's own picture is being drawn: the other mirrors in it are dark glass (their pictures are made
// for the main camera, not for this one's twin)
const PASS = { value: 0 };
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

// ------------------------------------------------------------------ after the rest of the course is built
export function buildMirrors(world) {
  const def = world.def;
  const lay = world.mirrorLay;
  const L = world.layers;
  const main = world.main;
  for (const b of def.boards || []) addSign(world, main, main.index(b.at), 0, b.title, b.sub, b.mask ?? M.ALL);
  const doors = (def.obstacles || []).filter((o) => o.mirror);
  if (!lay && !doors.length) return;
  for (const [arr, i, v] of lay?.saved || []) arr[i] = v;

  const planes = new Map();
  const planeFor = (O, n) => {
    const key = `${n.x.toFixed(3)},${n.z.toFixed(3)},${(n.x * O.x + n.z * O.z).toFixed(1)}`;
    let p = planes.get(key);
    if (!p) {
      p = { O: O.clone(), n: n.clone(), panes: [], uTex: { value: null }, uTexM: { value: new THREE.Matrix4() }, uLive: { value: 0 }, live: 0, rt: null, cam: new THREE.PerspectiveCamera() };
      p.clip = new THREE.Plane().setFromNormalAndCoplanarPoint(n, _v.copy(O).addScaledVector(n, 0.03));
      planes.set(key, p);
    }
    return p;
  };

  for (const S of lay?.sides || []) {
    const { m, path, side, O, a, n, strip } = S;
    const h = m.h ?? 9;
    const mask = m.mask;
    const col = colorForMask(mask);
    const plane = planeFor(O, n);
    const pane = makePane(plane, O, a, strip, h, mask, (m.warp || 0) * (m.bow || 1));
    pane.side = S;
    plane.panes.push(pane);
    const at = (q, up) => new THREE.Vector3(O.x + a.x * q.s - n.x * 0.02, q.y - 0.12 + up, O.z + a.z * q.s - n.z * 0.02);
    // the frame: a beam along the top, a post at each end, and the seams between the sheets of glass
    for (let k = 0; k < strip.length - 1; k++) L.quad(mask, at(strip[k], h), at(strip[k + 1], h), at(strip[k + 1], h + 0.4), at(strip[k], h + 0.4), col, 0.9);
    for (const q of [strip[0], strip[strip.length - 1]]) {
      const w = { ...q, s: q.s + (q === strip[0] ? 0.35 : -0.35) };
      L.quad(mask, at(q, 0), at(w, 0), at(w, h + 0.4), at(q, h + 0.4), col, 0.9);
    }
    let seam = 12;
    for (const q of strip) {
      if (q.s < seam || q.s > m.len - 6) continue;
      seam += 12;
      L.line(mask, at(q, 0.1), at(q, h), dim(col, 0.3));
    }
    // (a panel that stands back from the road has feet down to the floor it stands over)
    if (m.back) for (const q of [strip[0], strip[strip.length - 1]]) L.line(mask, at(q, 0), at(q, world.floorY - q.y), dim(col, 0.5));
    // a looking-glass mirror: a keystone in the hidden road's colour over the place it goes through, there in BOTH
    const route = m.route && world.paths.find((p) => p.def?.label === m.route);
    if (route) {
      const fr = {};
      let j = 0;
      for (; j < route.N; j++) if (!path.frame(route.px[j], route.pz[j], -1, fr) || Math.abs(fr.lat) > path.halfW) break;
      const s = (route.px[j] - O.x) * a.x + (route.pz[j] - O.z) * a.z;
      const q = strip.reduce((p, c) => (Math.abs(c.s - s) < Math.abs(p.s - s) ? c : p));
      const rc = colorForMask(route.def.mask);
      const c = at(q, h + 1.5);
      const e = (ds, dy) => new THREE.Vector3(c.x + a.x * ds, c.y + dy, c.z + a.z * ds);
      L.quad(M.X, e(-0.9, 0), e(0, 1.1), e(0.9, 0), e(0, -1.1), rc, 1.3);
      L.line(M.X, e(0, -1.1), at(q, h + 0.4), rc);
    }
    // with the mirror gone (the other lens) the edge it stood on has a rail of that lens's own, except across the
    // mouth of a road that goes through
    const off = mask === M.R ? M.BO : M.RO;
    const lens = mask === M.R ? BLUE : RED;
    const J = side < 0 ? path.jL : path.jR;
    for (let k = 0; k < strip.length - 1; k++) {
      const q = strip[k];
      if (!q.flush || !strip[k + 1].flush) continue;
      if (!S.had[q.i] && solidIn(J?.[q.i] || 0, lens)) continue;
      drawRail(L, path, q.i, strip[k + 1].i, side, off, colorForMask(off));
    }
  }

  // glass doors: the gate's own box is put away and a pane stands across its front
  for (const o of doors) {
    const i = main.index(o.at);
    const ob = world.obstacles.find((q) => q.path === main && q.i === i && q.type === 'gate' && Math.sign(q.lat) === Math.sign(o.lat || 1));
    if (!ob) continue;
    // (its lines stay in the group, unseen: a door that's smashed still bursts into them)
    for (const ch of ob.root.children) ch.visible = false;
    ob.mirror = true;
    const t = new THREE.Vector3(main.thx[i], 0, main.thz[i]);
    const r = new THREE.Vector3(main.rightX(i), 0, main.rightZ(i));
    const c = main.point(i, ob.lat, 0, new THREE.Vector3());
    const h = 5.4;
    const n = t.clone().negate();
    const O = c.clone().addScaledVector(t, -ob.len - 0.05).addScaledVector(r, -ob.w);
    const plane = planeFor(O, n);
    const pane = makePane(plane, O, r, [{ s: 0, y: c.y + 0.12 }, { s: ob.w * 2, y: c.y + 0.12 }], h, ob.mask, 0);
    pane.ob = ob;
    plane.panes.push(pane);
    const yaw = Math.atan2(t.x, t.z);
    const col = colorForMask(ob.mask);
    L.box(ob.mask, c.x, c.y + h / 2, c.z, ob.w * 2, h, ob.len * 2, yaw, col, true);
    for (const s of [-1, 1]) {
      const p = c.clone().addScaledVector(r, s * ob.w).addScaledVector(t, -ob.len - 0.08);
      const q = p.clone().addScaledVector(r, -s * 0.3);
      L.quad(ob.mask, p, q, q.clone().setY(q.y + h), p.clone().setY(p.y + h), col, 0.9);
    }
    const p = O.clone().addScaledVector(t, -0.03);
    const q = p.clone().addScaledVector(r, ob.w * 2);
    L.quad(ob.mask, p.clone().setY(p.y + h - 0.3), q.clone().setY(q.y + h - 0.3), q.clone().setY(q.y + h), p.clone().setY(p.y + h), col, 0.9);
    // door furniture, standing just proud of the glass so it's in front of its own reflection: the seam between the
    // two leaves, a push bar on each, a transom and a kick rail, and marquee bulbs round the frame
    const F = (s, y) => p.clone().addScaledVector(r, s).addScaledVector(t, -0.04).setY(p.y + y);
    const W = ob.w * 2;
    const soft = dim(col, 0.55);
    L.line(ob.mask, F(W / 2, 0.1), F(W / 2, h - 0.3), col);
    L.line(ob.mask, F(0.3, h - 1.1), F(W - 0.3, h - 1.1), soft);
    L.line(ob.mask, F(0.3, 0.55), F(W - 0.3, 0.55), soft);
    for (const s of [-1, 1]) {
      const x0 = W / 2 + s * 0.35;
      const x1 = W / 2 + s * 1.5;
      L.quad(ob.mask, F(x0, 1.1), F(x1, 1.1), F(x1, 1.26), F(x0, 1.26), col, 1);
      L.line(ob.mask, F(x0, 1.18), F(x0, 0.9), soft);
      // a lozenge of bevelled glass in each leaf
      const cx = W / 2 + s * W * 0.25;
      const loz = [F(cx - 0.7, 3), F(cx, 4), F(cx + 0.7, 3), F(cx, 2)];
      for (let k = 0; k < 4; k++) L.line(ob.mask, loz[k], loz[(k + 1) % 4], soft);
    }
    const bulbs = world.mirrorArt?.bulbs;
    if (bulbs) {
      bulbs.run(F(0, 0.6), F(0, h + 0.3), ob.mask, 0.9);
      bulbs.run(F(0, h + 0.3), F(W, h + 0.3), ob.mask, 0.9);
      bulbs.run(F(W, h + 0.3), F(W, 0.6), ob.mask, 0.9);
    }
  }

  world.mirrorArt?.finish(world, world.mirrorArt.ballAt, 30);
  world.mirrors = new MirrorSet(world, [...planes.values()]);
}

// ------------------------------------------------------------------ drawing them
const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _rot = new THREE.Matrix4();
const _cp = new THREE.Vector3();
const _look = new THREE.Vector3();
const _size = new THREE.Vector2();
const _clear = new THREE.Color();
const BUDGET = { high: { n: 3, scale: 0.6 }, medium: { n: 2, scale: 0.5 }, low: { n: 1, scale: 0.4 } };
const REACH = 300; // metres: further mirrors stay dark glass

export class MirrorSet {
  constructor(world, planes) {
    this.world = world;
    this.planes = planes;
    this.group = new THREE.Group();
    for (const p of planes) for (const q of p.panes) this.group.add(q.mesh);
    world.group.add(this.group);
    this.last = 0;
    this.blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    this.blank.needsUpdate = true;
    for (const p of planes) p.uTex.value = this.blank;
  }

  // The glass along the edge of the main road at sample i on that side (+1 the driver's right), if any.
  paneAt(i, side) {
    if (!this.flush) {
      this.flush = new Map();
      for (const p of this.planes) for (const q of p.panes) for (const s of q.side?.strip || []) if (s.flush) this.flush.set(`${s.i}:${q.side.side < 0 ? 0 : 1}`, q);
    }
    return this.flush.get(`${i}:${side < 0 ? 0 : 1}`) || null;
  }

  // Once a step: a car run up against a mirror cracks it where it touches (and the player hears it).
  update(race) {
    const main = this.world.main;
    for (const r of race.racers) {
      const t = r.track;
      if (!t || t.path !== main || r.respawnT > 0 || Math.abs(r.speed) < 14) continue;
      const side = Math.sign(t.lat);
      if (Math.abs(t.lat) < main.halfW - r.halfW - 0.12) continue;
      const q = this.paneAt(t.i, side);
      if (!q || q.level < 0.5 || race.t < (r.glassT || 0)) continue;
      r.glassT = race.t + 0.9;
      this.crack(q, r.pos, Math.abs(r.speed) / 60);
      if (r.isPlayer) race.app.audio.play('smash');
    }
  }

  // A car has hit the glass at this place: it cracks there, and the cracks close up again.
  crack(pane, pos, strength = 1) {
    const s = (pos.x - pane.O.x) * pane.a.x + (pos.z - pane.O.z) * pane.a.z;
    pane.mat.uniforms.uHit.value.set(s, clamp(pos.y - pane.y0 + 0.8, 0.3, pane.h));
    pane.mat.uniforms.uCrack.value = Math.max(pane.mat.uniforms.uCrack.value, clamp(strength, 0.3, 1));
  }

  // Before the frame is drawn: fade each pane for the lens, then draw the nearest mirrors in view.
  //   o.quality 'high' | 'medium' | 'low', o.instant (a split-screen view: no fading between the two players' lenses)
  render(gl, scene, camera, mode, o = {}) {
    const now = performance.now();
    const dt = this.last ? clamp((now - this.last) / 1000, 0, 0.1) : 0;
    this.last = now;
    TIME.value = o.t ?? now / 1000;
    gl.getDrawingBufferSize(_size);
    this.world.mirrorArt?.update(dt, TIME.value, mode, o.instant, _size.y);
    for (const p of this.planes) {
      for (const q of p.panes) {
        const want = solidIn(q.mask, mode) && !q.ob?.broken ? 1 : 0;
        q.level = o.instant ? want : damp(q.level, want, 14, dt);
        if (q.level < 0.02) q.level = 0;
        q.mesh.visible = q.level > 0;
        q.mat.uniforms.uOn.value = q.level;
        const U = q.mat.uniforms.uCrack;
        if (U.value > 0) U.value = Math.max(0, U.value - dt * 0.45);
      }
    }
    const budget = BUDGET[o.quality] || BUDGET.high;
    camera.updateMatrixWorld();
    _cp.setFromMatrixPosition(camera.matrixWorld);
    _frustum.setFromProjectionMatrix(_pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const seen = [];
    for (const p of this.planes) {
      p.want = 0;
      if (_v.subVectors(_cp, p.O).dot(p.n) < 0.3) continue;
      let near = Infinity;
      for (const q of p.panes) if (q.level > 0 && _frustum.intersectsBox(q.box)) near = Math.min(near, q.box.distanceToPoint(_cp));
      if (near < REACH) seen.push([near, p]);
    }
    seen.sort((x, y) => x[0] - y[0]);
    for (const [, p] of seen.slice(0, budget.n)) p.want = 1;
    gl.getDrawingBufferSize(_size);
    const w = Math.max(2, Math.floor(_size.x * budget.scale * (o.split ? 0.5 : 1)));
    const h = Math.max(2, Math.floor(_size.y * budget.scale * (o.split ? 0.5 : 1)));
    for (const p of this.planes) {
      if (p.want) this.pass(gl, scene, camera, p, w, h);
      // (a mirror that's no longer drawn goes dark at once: its picture is from where the camera was)
      p.live = p.want ? damp(p.live, 1, 9, dt || 0.016) : 0;
      if (o.instant) p.live = p.want;
      p.uLive.value = p.live;
    }
  }

  // One mirror's picture: the scene from the camera's twin behind the glass, with nothing behind the glass drawn.
  pass(gl, scene, camera, p, w, h) {
    if (!p.rt) {
      p.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
      p.uTex.value = p.rt.texture;
    } else if (p.rt.width !== w || p.rt.height !== h) p.rt.setSize(w, h);
    const C = p.cam;
    _rot.extractRotation(camera.matrixWorld);
    C.position.subVectors(p.O, _cp).reflect(p.n).negate().add(p.O);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_cp);
    _v.subVectors(p.O, _look).reflect(p.n).negate().add(p.O);
    C.up.set(0, 1, 0).applyMatrix4(_rot).reflect(p.n);
    C.lookAt(_v);
    C.near = camera.near;
    C.far = camera.far;
    C.updateMatrixWorld();
    C.projectionMatrix.copy(camera.projectionMatrix);
    C.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    p.uTexM.value.copy(BIAS).multiply(C.projectionMatrix).multiply(C.matrixWorldInverse);
    // (the wet road's own reflection belongs to the main view: off while this is drawn)
    const wet = REFL.uReflK.value;
    REFL.uReflK.value = 0;
    const shown = p.panes.map((q) => q.mesh.visible);
    for (const q of p.panes) q.mesh.visible = false;
    const prevTarget = gl.getRenderTarget();
    const prevClip = gl.clippingPlanes;
    gl.getClearColor(_clear);
    const prevAlpha = gl.getClearAlpha();
    gl.clippingPlanes = [p.clip];
    PASS.value = 1;
    gl.setRenderTarget(p.rt);
    gl.setClearColor(0x000000, 1);
    gl.clear();
    gl.render(scene, C);
    PASS.value = 0;
    gl.setRenderTarget(prevTarget);
    gl.clippingPlanes = prevClip;
    gl.setClearColor(_clear, prevAlpha);
    p.panes.forEach((q, k) => (q.mesh.visible = shown[k]));
    REFL.uReflK.value = wet;
  }

  dispose() {
    for (const p of this.planes) p.rt?.dispose();
    this.blank.dispose();
  }
}

// ------------------------------------------------------------------ the house
// Scenery: the halls' walls and doorways, the big top over the house (mirrorart.js) and broken glass hanging in it.
export function mirrorDecor(world, L, main, rng) {
  const hw = main.halfW;
  // the halls' walls: dark panels behind the rails, red world and blue world by turns, so both worlds together
  // close the hall in and a single lens opens every other panel onto the dark outside. None where there's glass, a
  // way off the road, or the funhouse (whose glass stands free).
  const open = [new Uint8Array(main.N), new Uint8Array(main.N)]; // [left, right]
  for (const S of world.mirrorLay?.sides || []) {
    const i0 = S.strip[0].i;
    const n = Math.ceil((S.m.len + (S.m.back ? 0 : 30)) / main.ds);
    for (let k = -2; k <= n; k++) open[S.side < 0 ? 0 : 1][main.wrap(i0 + k)] = 1;
  }
  for (const f of world.def.funhouse || []) {
    const i0 = main.index(f.at);
    for (let k = -4; k <= Math.round(f.len / main.ds) + 4; k++) open[0][main.wrap(i0 + k)] = open[1][main.wrap(i0 + k)] = 1;
  }
  for (const [J, o] of [[main.jL, open[0]], [main.jR, open[1]]]) for (const i in J || {}) for (let k = -4; k <= 4; k++) o[main.wrap(+i + k)] = 1;
  const others = world.paths.filter((p) => p !== main);
  const nearOther = (p) => others.some((b) => { for (let j = 0; j < b.N; j += 2) if ((b.px[j] - p.x) ** 2 + (b.pz[j] - p.z) ** 2 < (b.halfW + 3) ** 2 && Math.abs(b.py[j] - p.y) < 12) return true; return false; });
  const PANEL = 6; // samples
  const WALL_H = 8.5;
  for (let i = 0, k = 0; i + PANEL <= main.N; i += PANEL, k++) {
    for (const side of [-1, 1]) {
      const o = open[side < 0 ? 0 : 1];
      let free = true;
      for (let q = 0; q <= PANEL; q++) if (o[main.wrap(i + q)]) free = false;
      if (!free) continue;
      const a = main.point(i, side * (hw + 1.3), -0.4, new THREE.Vector3());
      const b = main.point(i + PANEL, side * (hw + 1.3), -0.4, new THREE.Vector3());
      if (nearOther(a) || nearOther(b)) continue;
      // (a sheet's width short of the next, so the panels read as panels)
      b.lerp(a, 0.05);
      const mask = (k + (side > 0 ? 1 : 0)) % 2 ? M.R : M.B;
      const A = a.clone().setY(a.y + WALL_H);
      const B = b.clone().setY(b.y + WALL_H);
      L.fillQuad(mask, a, b, B, A);
      for (const [p, q] of [[a, b], [b, B], [B, A], [A, a]]) L.line(mask, p, q, dim(colorForMask(mask), 0.55));
      const up = (p, d) => p.clone().setY(p.y + d);
      L.quad(mask, up(A, -0.5), up(B, -0.5), B, A, null, 0.75);
      L.quad(mask, up(a, 2.2), up(b, 2.2), up(b, 2.35), up(a, 2.35), null, 0.3);
      // a harlequin lattice over the panel: two tall diamonds, each with a lit lozenge at its heart
      const y0 = 2.6;
      const y1 = WALL_H - 0.8;
      const lc = dim(colorForMask(mask), 0.4);
      for (let c = 0; c < 2; c++) {
        const l = a.clone().lerp(b, c / 2);
        const m = a.clone().lerp(b, (c + 0.5) / 2);
        const r = a.clone().lerp(b, (c + 1) / 2);
        const ym = (y0 + y1) / 2;
        L.line(mask, up(l, ym), up(m, y1), lc);
        L.line(mask, up(m, y1), up(r, ym), lc);
        L.line(mask, up(r, ym), up(m, y0), lc);
        L.line(mask, up(m, y0), up(l, ym), lc);
        const e = (f, y) => up(l.clone().lerp(r, f), y);
        L.quad(mask, e(0.38, ym), e(0.5, ym + 1.1), e(0.62, ym), e(0.5, ym - 1.1), null, 0.22);
      }
    }
  }
  // doorways: a proscenium over the road every so often, red and blue by turns: square posts and a beam, an arch
  // inside them strung with marquee bulbs, and a diamond for a keystone
  const art = (world.mirrorArt = new HouseArt(world));
  for (let i = 30, k = 0; i < main.N; i += 64, k++) {
    const mask = k % 2 ? M.R : M.B;
    const a = main.point(i, -(hw + 1.6), 0, new THREE.Vector3());
    const b = main.point(i, hw + 1.6, 0, new THREE.Vector3());
    const top = Math.max(a.y, b.y) + 11.5;
    const A = a.clone().setY(top);
    const B = b.clone().setY(top);
    const up = (p, d) => p.clone().setY(p.y + d);
    const t = new THREE.Vector3(main.thx[i], 0, main.thz[i]).multiplyScalar(0.5);
    for (const [p, q] of [[a, A], [b, B]]) {
      L.quad(mask, p.clone().sub(t), p.clone().add(t), q.clone().add(t), q.clone().sub(t), null, 0.55);
      L.line(mask, p, q);
    }
    L.quad(mask, A, B, up(B, 0.9), up(A, 0.9), null, 0.8);
    L.line(mask, A, B);
    L.line(mask, up(A, 0.9), up(B, 0.9));
    // the arch: springs from 6 m up the posts to just under the beam
    const SPRING = 6;
    const arch = [];
    for (let q = 0; q <= 14; q++) {
      const th = (q / 14) * Math.PI;
      const p = a.clone().lerp(b, 0.5 - 0.5 * Math.cos(th));
      arch.push(p.setY(p.y + SPRING + Math.sin(th) * (top - SPRING - 0.5 - Math.max(a.y, b.y))));
    }
    for (let q = 0; q < 14; q++) {
      L.line(mask, arch[q], arch[q + 1]);
      // the spandrel between arch and beam: a faint sheet of the doorway's colour
      const f0 = q / 14;
      const f1 = (q + 1) / 14;
      const c0 = A.clone().lerp(B, 0.5 - 0.5 * Math.cos(f0 * Math.PI));
      const c1 = A.clone().lerp(B, 0.5 - 0.5 * Math.cos(f1 * Math.PI));
      L.quad(mask, arch[q], arch[q + 1], c1, c0, null, 0.1);
      art.bulbs.run(arch[q], arch[q + 1], mask, 1.25);
    }
    art.bulbs.run(up(a, 1.4), up(a, SPRING), mask, 1.25);
    art.bulbs.run(up(b, 1.4), up(b, SPRING), mask, 1.25);
    const key = A.clone().lerp(B, 0.5);
    const r = new THREE.Vector3(main.rightX(i), 0, main.rightZ(i));
    L.quad(M.ALL, key.clone().addScaledVector(r, -0.8).setY(top + 0.45), up(key, 1.6), key.clone().addScaledVector(r, 0.8).setY(top + 0.45), up(key, -0.7), COLORS.white, 0.45);
  }
  // marquee bulbs along the top of every mirror, in the mirror's colour: they go out with the glass
  for (const S of world.mirrorLay?.sides || []) {
    const { m, O, a, n, strip } = S;
    const h = (m.h ?? 9) + 0.85;
    const at = (q) => new THREE.Vector3(O.x + a.x * q.s + n.x * 0.15, q.y - 0.12 + h, O.z + a.z * q.s + n.z * 0.15);
    let from = strip[0];
    for (const q of strip) {
      if (q.s - from.s < 8 && q !== strip[strip.length - 1]) continue;
      art.bulbs.run(at(from), at(q), m.mask, 1.6);
      from = q;
    }
  }
  // the big top overhead, and the mirror ball hung from its peak
  art.ballAt = bigTop(world, L, main);
  // broken glass hanging under the canopy: tilted frames, each with a faint sheet in it
  const ctr = new THREE.Vector3();
  for (let i = 0; i < main.N; i++) ctr.add(_v.set(main.px[i], 0, main.pz[i]));
  ctr.multiplyScalar(1 / main.N);
  for (let k = 0; k < 80; k++) {
    const ang = rng() * Math.PI * 2;
    const rad = 60 + rng() * 520;
    const c = new THREE.Vector3(ctr.x + Math.cos(ang) * rad, world.maxY + 14 + rng() * 60 * (1.6 - rad / 580), ctr.z + Math.sin(ang) * rad * 0.95);
    // (not over the road, where it would hang in the mirrors' way)
    let clear = true;
    for (let i = 0; i < main.N && clear; i += 6) if ((main.px[i] - c.x) ** 2 + (main.pz[i] - c.z) ** 2 < 40 * 40 && c.y - main.py[i] < 40) clear = false;
    if (!clear) continue;
    const w = 5 + rng() * 16;
    const h = 5 + rng() * 22;
    const u = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.5, rng() - 0.5).normalize();
    const v = new THREE.Vector3(rng() - 0.5, 1.2, rng() - 0.5).normalize();
    v.addScaledVector(u, -v.dot(u)).normalize();
    // a shard: a quad with one corner knocked off
    const cut = 0.25 + rng() * 0.5;
    const P = [[-1, -1], [1, -1], [1, 1 - cut * 2], [1 - cut * 1.2, 1], [-1, 1]].map(([x, y]) => c.clone().addScaledVector(u, (x * w) / 2).addScaledVector(v, (y * h) / 2));
    const mask = k % 2 ? M.R : M.B;
    for (let q = 0; q < P.length; q++) L.line(mask, P[q], P[(q + 1) % P.length]);
    L.quad(mask, P[0], P[1], P[2], P[4], null, 0.07);
    L.quad(mask, P[2], P[3], P[4], P[4], null, 0.07);
  }
  void COLORS;
}
