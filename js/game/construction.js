// Road works: a crew that sets up on a different stretch of the course every lap. Blue barriers shut the left
// lane and a blue tower crane swings its load across the middle; red cones and a red digger shut the right lane.
// In BOTH the whole road is closed but for a slit down the middle under the swinging load, so the choice is the
// lens: RED and the barriers are gone (the left lane is yours), BLUE and the digger is gone (the right lane is).
// Barriers and the digger are blocks (Race.smash breaks them), cones knock over at a touch. A sign a little
// before the zone says which lens opens which lane, and moves with the crew.
// Everything is drawn with the world's own lens materials (layers.materials), so each piece fades with its world.
// Off online (the crew's moves are local) and in the tutorial.

import * as THREE from '../../vendor/three.js';
import { M, BLUE } from '../world/shift.js';
import { findSites } from '../world/sites.js';
import { boardTexture } from '../world/signs.js';
import { mulberry32 } from '../core/util.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const SIGN_BACK = 70; // metres before the zone its sign stands
const MOVE_WAIT = 9; // seconds the crew will wait for the zone to clear before moving anyway

// A LineSegments from a flat list of points (pairs), in the given material.
function seg(pts, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, mat);
  l.frustumCulled = false;
  return l;
}
// The same in the layer's vertex-coloured line material, so a line can run hotter than the world's plain wire
// (hazard stripes, the reflective band on a cone) and still fade with its world.
function segHot(pts, mats, color) {
  const l = seg(pts, mats.line);
  const c = new THREE.Color(color);
  l.geometry.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: pts.length / 3 }, () => [c.r, c.g, c.b]).flat(), 3));
  return l;
}
// Lamp materials per world: a hot version of the world's solid, and amber for beacons (shared by every lamp)
const LAMP = new Map();
function lampMats(mats) {
  let m = LAMP.get(mats.mask);
  if (!m) {
    const hot = new THREE.Color(mats.base).lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(1.8);
    m = { hot: new THREE.MeshBasicMaterial({ color: hot, ...ADD }), amber: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa030).multiplyScalar(1.8), ...ADD }) };
    LAMP.set(mats.mask, m);
  }
  return m;
}
const WHITE_HOT = new THREE.Color(0xffffff).multiplyScalar(1.7);
// Wire box edges centred at (cx, cy, cz), pushed onto pts.
function boxEdges(pts, cx, cy, cz, w, h, d) {
  const c = [];
  for (const [sx, sy, sz] of [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]) c.push([cx + (sx * w) / 2, cy + (sy * h) / 2, cz + (sz * d) / 2]);
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) pts.push(...c[a], ...c[b]);
}
function ring(pts, cx, cy, cz, r, n = 12) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r, cx + Math.cos(b) * r, cy, cz + Math.sin(b) * r);
  }
}
function fillBox(w, h, d, mat, cx = 0, cy = 0, cz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(cx, cy, cz);
  return m;
}

// ---- the pieces, built in a local frame: +z along the road, +x to the driver's right, origin on the road
function cone(mats) {
  const p = [];
  ring(p, 0, 0.02, 0, 0.42, 10);
  ring(p, 0, 0.5, 0, 0.26, 10);
  ring(p, 0, 0.98, 0, 0.09, 8);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    p.push(Math.cos(a) * 0.42, 0.02, Math.sin(a) * 0.42, Math.cos(a) * 0.09, 0.98, Math.sin(a) * 0.09);
  }
  // the square foot
  for (const [a, b] of [[[-0.5, -0.5], [0.5, -0.5]], [[0.5, -0.5], [0.5, 0.5]], [[0.5, 0.5], [-0.5, 0.5]], [[-0.5, 0.5], [-0.5, -0.5]]]) p.push(a[0], 0.01, a[1], b[0], 0.01, b[1]);
  const g = new THREE.Group();
  g.add(seg(p, mats.wire));
  // the reflective band: two white rings a hand apart round the middle
  const band = [];
  ring(band, 0, 0.56, 0, 0.245, 10);
  ring(band, 0, 0.7, 0, 0.2, 10);
  g.add(segHot(band, mats, WHITE_HOT));
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.98, 8), mats.fill);
  f.position.y = 0.49;
  g.add(f);
  return g;
}

// A jersey barrier: a stepped trapezoid in profile, hazard stripes down both faces, a lamp on top that pulses.
function barrier(mats) {
  const L = 0.95; // half length (along local z)
  const prof = [[-0.42, 0], [0.42, 0], [0.34, 0.22], [0.17, 0.95], [-0.17, 0.95], [-0.34, 0.22]];
  const p = [];
  for (const z of [-L, L]) for (let k = 0; k < prof.length; k++) {
    const a = prof[k];
    const b = prof[(k + 1) % prof.length];
    p.push(a[0], a[1], z, b[0], b[1], z);
  }
  for (const [x, y] of prof) p.push(x, y, -L, x, y, L);
  // stripes: white diagonals on each face, leaning the same way so they read as hazard chevrons from the road
  const st = [];
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const z0 = -L + 0.1 + k * 0.45;
    st.push(s * 0.33, 0.24, z0, s * 0.2, 0.9, z0 + 0.3);
    st.push(s * 0.33, 0.24, z0 + 0.12, s * 0.2, 0.9, z0 + 0.42);
  }
  const g = new THREE.Group();
  g.add(seg(p, mats.wire), segHot(st, mats, WHITE_HOT));
  const f = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.95, L * 2), mats.fill);
  f.position.y = 0.475;
  g.add(f);
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), lampMats(mats).hot);
  lamp.position.y = 1.12;
  g.add(lamp);
  g.userData.lamp = lamp;
  return g;
}

// A tracked digger: two tracks, a slewing body with a cab, and a boom and stick that dig in a slow loop.
function digger(mats) {
  const g = new THREE.Group();
  const p = [];
  for (const x of [-1.15, 1.15]) {
    boxEdges(p, x, 0.45, 0, 0.8, 0.9, 4.4);
    for (let k = -4; k <= 4; k++) p.push(x - 0.4, 0.9, k * 0.5, x + 0.4, 0.9, k * 0.5);
  }
  g.add(seg(p, mats.wire));
  const upper = new THREE.Group();
  upper.position.y = 1.0;
  const u = [];
  boxEdges(u, 0, 0.75, -0.4, 2.6, 1.5, 2.8); // the house
  boxEdges(u, -0.75, 1.0, 1.2, 1.0, 1.3, 1.2); // the cab, front left
  u.push(-1.25, 1.65, 1.8, -0.25, 1.65, 1.8, -1.25, 0.35, 1.8, -1.25, 1.65, 1.8); // cab window frame
  u.push(-1.25, 0.35, 1.8, -0.25, 1.65, 1.8); // and its diagonal
  u.push(0.9, 1.5, -1.7, 0.9, 2.2, -1.7); // exhaust stack
  upper.add(seg(u, mats.wire));
  upper.add(fillBox(2.6, 1.5, 2.8, mats.fill, 0, 0.75, -0.4));
  upper.add(fillBox(1.0, 1.3, 1.2, mats.fill, -0.75, 1.0, 1.2));
  // the beacon on the cab roof
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), lampMats(mats).amber);
  beacon.position.set(-0.75, 1.8, 1.2);
  upper.add(beacon);
  // boom: a tapered box 3.4 long, hinged at the front of the house; stick 2.8 long hinged at its end; bucket
  const boom = new THREE.Group();
  boom.position.set(0.5, 1.3, 0.9);
  const b = [];
  boxEdges(b, 0, 0, 1.7, 0.5, 0.6, 3.4);
  boom.add(seg(b, mats.wire));
  const stick = new THREE.Group();
  stick.position.set(0, 0, 3.4);
  const s = [];
  boxEdges(s, 0, 0, 1.4, 0.36, 0.42, 2.8);
  stick.add(seg(s, mats.wire));
  const bucket = new THREE.Group();
  bucket.position.set(0, 0, 2.8);
  const k = [];
  // an open scoop: a box missing its front, teeth along the lip
  boxEdges(k, 0, -0.45, 0.3, 1.1, 0.9, 0.9);
  for (let q = -2; q <= 2; q++) k.push(q * 0.25, -0.9, 0.75, q * 0.25, -1.1, 0.95);
  bucket.add(seg(k, mats.wire));
  bucket.add(fillBox(1.1, 0.9, 0.9, mats.fill, 0, -0.45, 0.3));
  stick.add(bucket);
  boom.add(stick);
  upper.add(boom);
  g.add(upper);
  g.userData = { upper, boom, stick, bucket, beacon };
  return g;
}

// A tower crane: a lattice mast beside the road, a jib out over it, a counterweight, and a hook with a crate
// swinging under the trolley. The cable and crate move each frame (see Construction.animate).
function crane(mats, height, reach, tx) {
  const g = new THREE.Group();
  const p = [];
  const half = 1.1;
  // mast: four legs and X-bracing every 2.4 m
  for (const [x, z] of [[-half, -half], [half, -half], [half, half], [-half, half]]) p.push(x, 0, z, x, height, z);
  for (let y = 0; y < height - 0.1; y += 2.4) {
    const y1 = Math.min(height, y + 2.4);
    for (const [a, b] of [[[-half, -half], [half, -half]], [[half, -half], [half, half]], [[half, half], [-half, half]], [[-half, half], [-half, -half]]]) {
      p.push(a[0], y1, a[1], b[0], y1, b[1]);
      p.push(a[0], y, a[1], b[0], y1, b[1]);
      p.push(a[0], y1, a[1], b[0], y, b[1]);
    }
  }
  g.add(seg(p, mats.wire));
  // the slewing top: jib toward +x (over the road), counter-jib back, an apex with tie lines
  const top = new THREE.Group();
  top.position.y = height;
  const j = [];
  const jw = 0.7;
  const jh = 1.1;
  for (const z of [-jw, jw]) {
    j.push(-6, 0, z, reach, 0, z);
    j.push(-6, jh, z, reach - 1.5, jh, z);
  }
  for (let x = -6; x <= reach; x += 2.5) {
    const x1 = Math.min(reach - 1.5, x + 2.5);
    for (const z of [-jw, jw]) j.push(x, 0, z, x1, jh, z);
    j.push(x, jh, -jw, x, jh, jw, x, 0, -jw, x, 0, jw);
  }
  j.push(reach - 1.5, 0, -jw, reach, 0, -jw, reach - 1.5, 0, jw, reach, 0, jw, reach - 1.5, jh, -jw, reach, 0, -jw, reach - 1.5, jh, jw, reach, 0, jw);
  // apex and ties
  const ax = 0;
  const ay = jh + 4.5;
  j.push(-half, jh, -half, ax, ay, 0, half, jh, -half, ax, ay, 0, half, jh, half, ax, ay, 0, -half, jh, half, ax, ay, 0);
  j.push(ax, ay, 0, reach - 2, jh, 0, ax, ay, 0, -5.5, jh, 0);
  // counterweight: a slab hanging off the back
  boxEdges(j, -5, -0.6, 0, 1.6, 1.4, 2.2);
  // the trolley under the jib
  boxEdges(j, tx, -0.35, 0, 1.2, 0.5, 1.0);
  top.add(seg(j, mats.wire));
  top.add(fillBox(1.6, 1.4, 2.2, mats.fill, -5, -0.6, 0));
  // aviation lamps: on the apex and the jib tip, red, blinking out of step
  const lamps = [[ax, ay + 0.3, 0], [reach - 0.3, 0.2, 0]].map(([x, y, z]) => {
    const l = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), lampMats(mats).amber);
    l.position.set(x, y, z);
    top.add(l);
    return l;
  });
  g.add(top);
  // the cable (two lines from the trolley) and the crate, positioned each frame
  const cable = seg(new Array(12).fill(0), mats.wire);
  const crate = new THREE.Group();
  const c = [];
  boxEdges(c, 0, 0, 0, 2, 2, 2);
  // an X on each side, and the sling up from the corners
  for (const s of [-1, 1]) {
    c.push(s, -1, -1, s, 1, 1, s, -1, 1, s, 1, -1);
    c.push(-1, -1, s, 1, 1, s, -1, 1, s, 1, -1, s);
  }
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) c.push(x, 1, z, 0, 2.4, 0);
  crate.add(seg(c, mats.wire));
  crate.add(fillBox(2, 2, 2, mats.fill));
  g.add(cable, crate);
  g.userData = { top, cable, crate, tx, height, cableLen: height - 2.2 - 1.0, lamps };
  return g;
}

// A spoil heap: a low tumble of wire rocks.
function spoil(mats) {
  const g = new THREE.Group();
  for (const [x, z, r] of [[0, 0, 1.0], [0.9, 0.6, 0.6], [-0.8, 0.5, 0.7], [0.2, -0.9, 0.5]]) {
    const geo = new THREE.IcosahedronGeometry(r, 0);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mats.wire);
    e.position.set(x, r * 0.7, z);
    e.rotation.set(x, z, r);
    g.add(e);
    const f = new THREE.Mesh(geo, mats.fill);
    f.position.copy(e.position);
    f.rotation.copy(e.rotation);
    g.add(f);
  }
  return g;
}

export class Construction {
  constructor(race) {
    this.race = race;
    this.group = new THREE.Group();
    this.pieces = []; // { root, s, lat, yaw, ob?, cone? }
    this.on = false;
    if (race.tutorial || race.online || !race.def.works) return;
    const world = race.world;
    const sites = findSites(world, { minLen: 72 });
    if (!sites.length) return;
    // the crew's rota: the sites in a seeded order, one per lap
    const rng = mulberry32((race.def.seed || 1) * 31 + 7);
    this.sites = sites.slice(0, 4).sort(() => rng() - 0.5);
    this.on = true;
    this.lap = 0;
    this.build();
    this.place(this.sites[0]);
    this.moveT = 0;
    this.pending = null;
  }

  // Every piece once, at the origin; place() carries them to a site.
  build() {
    const W = this.race.world;
    const hw = W.halfWidth;
    const R = W.layers.materials(M.R);
    const B = W.layers.materials(M.B);
    const add = (root, s, lat, yaw = 0, ob = null) => {
      this.group.add(root);
      const piece = { root, s, lat, yaw, ob };
      if (ob) {
        // the record Race.features and the AI read; path/i/f are filled in by place()
        piece.ob = { path: W.main, i: 0, f: 0, lat, w: ob.w, len: ob.len, h: ob.h, mask: ob.mask, type: 'block', root, sweep: ob.sweep || 0, phase: 0, baseLat: lat, works: true };
        W.obstacles.push(piece.ob);
      }
      this.pieces.push(piece);
      return piece;
    };
    // cones: a taper in from each edge, red (the right lane's closure), and a few down the right lane's inner edge
    for (let k = 0; k < 5; k++) add(cone(R), 4 + k * 2.2, hw * (0.92 - k * 0.15)).cone = true;
    for (let k = 0; k < 4; k++) add(cone(R), 18 + k * 7, hw * 0.3).cone = true;
    // blue barriers: two across the left lane, then a line down its inner edge
    const bar = { w: 0.95, len: 0.42, h: 0.95, mask: M.B };
    add(barrier(B), 13, -hw * 0.76, Math.PI / 2, { ...bar });
    add(barrier(B), 13, -hw * 0.5, Math.PI / 2, { ...bar });
    for (let k = 0; k < 6; k++) add(barrier(B), 17 + k * 4.2, -hw * 0.3, 0, { w: 0.42, len: 0.95, h: 0.95, mask: M.B });
    // the digger, in the right lane, its tracks along the road
    this.digger = add(digger(R), 30, hw * 0.62, 0, { w: 1.6, len: 2.3, h: 2.6, mask: M.R });
    add(spoil(R), 40, hw * 0.6, 0.6, { w: 1.3, len: 1.3, h: 1.6, mask: M.R });
    // the crane, off the left edge, its jib across the road and its crate swinging through the middle
    this.crane = add(crane(B, 17, hw + 4 + hw * 0.75, hw + 4), 27, -hw - 4, 0, { w: 1.1, len: 1.1, h: 2.4, mask: M.B, sweep: 0.42 });
    // the sign: a board on its own gantry, pink like the course's neutral boards
    const mat = new THREE.MeshBasicMaterial({ map: boardTexture('ROAD WORKS AHEAD', 'RED OPENS LEFT · BLUE OPENS RIGHT', 0xff4fd8, 0), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const sign = new THREE.Group();
    const Wd = 11;
    const H = (Wd * 200) / 512;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(Wd, H), mat);
    const lift = 6.5;
    board.position.y = lift + H / 2;
    board.rotation.y = Math.PI;
    board.renderOrder = 10;
    const top = lift + H * 0.15;
    const posts = seg([-hw - 0.5, 0, 0, -hw - 0.5, top, 0, hw + 0.5, 0, 0, hw + 0.5, top, 0, -hw - 0.5, top, 0, hw + 0.5, top, 0], new THREE.LineBasicMaterial({ color: 0xff4fd8, ...ADD }));
    sign.add(board, posts);
    this.sign = add(sign, -SIGN_BACK, 0);
  }

  // Carry the crew to a site: every piece to its spot on the road there.
  place(site) {
    const main = this.race.world.main;
    this.site = site;
    for (const p of this.pieces) {
      const i = main.wrap(site.i0 + Math.round(p.s / main.ds));
      main.point(i, p.lat, 0, p.root.position);
      p.root.rotation.set(0, Math.atan2(main.thx[i], main.thz[i]) + p.yaw, 0);
      p.root.visible = true;
      p.root.scale.setScalar(1);
      p.knocked = false;
      if (p.ob) {
        p.ob.i = i;
        p.ob.f = main.frac(i);
        p.ob.lat = p.ob.baseLat;
        p.ob.broken = false;
      }
    }
  }

  // Is a racer anywhere near the zone (sign to spoil heap, with a margin)?
  near(site, r) {
    const main = this.race.world.main;
    let d = r.lastU - site.u0;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    const m = d * main.length;
    return m > -SIGN_BACK - 30 && m < site.len + 30;
  }

  update(dt) {
    if (!this.on) return;
    const R = this.race;
    this.t = (this.t || 0) + dt;
    this.animate(dt);
    this.cones();
    if (R.state !== 'race') return;
    // the leader starts a new lap: the crew packs up and sets up at the next site, once the road there is clear
    const lap = Math.max(...R.racers.map((r) => r.lap));
    if (lap > this.lap) {
      this.lap = lap;
      this.pending = this.sites[lap % this.sites.length];
      this.moveT = 0;
    }
    if (this.pending && this.pending !== this.site) {
      this.moveT += dt;
      const busy = R.racers.some((r) => r.respawnT <= 0 && (this.near(this.site, r) || this.near(this.pending, r)));
      if (!busy || this.moveT > MOVE_WAIT) this.move(this.pending);
    }
  }

  // Pack up: the pieces come apart into lines where they stand, and are set up again at the new site.
  move(site) {
    const R = this.race;
    const main = R.world.main;
    for (const p of this.pieces) {
      if (p.root.visible && !p.knocked && R.near({ pos: p.root.position })) R.debris.burst(p.root, _v.set(0, 3, 0), 4, p.root.position.y, 0.35, 1.8);
    }
    this.place(site);
    this.pending = null;
    // a flash of sparks where each piece lands, and a thud, if anyone can see it
    for (const p of this.pieces) if (p.ob && R.near({ pos: p.root.position })) R.debris.sparks(p.root.position, _d.set(0, 0, 0), 10, 0xffffff, 8, main.py[p.ob.i]);
    const d = Math.min(...R.players.map((pl) => pl.pos.distanceTo(this.digger.root.position)));
    if (d < 200) R.app.audio.play('smash');
    for (const pl of R.players) R.emitP(pl, 'popup', { text: 'ROAD WORKS MOVED', color: '#ff4fd8', small: true });
  }

  animate(dt) {
    const t = this.t;
    const main = this.race.world.main;
    // lamps pulse, out of step
    for (const p of this.pieces) {
      const lamp = p.root.userData.lamp;
      if (lamp) lamp.scale.setScalar(0.6 + 0.6 * Math.max(0, Math.sin(t * 5 + p.s)));
    }
    // the digger slews, lifts and digs
    const D = this.digger.root.userData;
    D.upper.rotation.y = Math.sin(t * 0.45) * 0.7;
    D.boom.rotation.x = -(0.55 + 0.3 * Math.sin(t * 0.9));
    D.stick.rotation.x = 0.9 + 0.45 * Math.sin(t * 0.9 + 1.2);
    D.bucket.rotation.x = 0.4 + 0.5 * Math.sin(t * 0.9 + 2.2);
    D.beacon.rotation.y = t * 6;
    D.beacon.scale.setScalar(0.7 + 0.5 * Math.max(0, Math.sin(t * 6)));
    // the crane: slow slew of the whole top, the crate swinging across the road under the trolley
    const C = this.crane;
    const U = C.root.userData;
    U.top.rotation.y = Math.sin(t * 0.2) * 0.08;
    U.lamps.forEach((l, k) => l.scale.setScalar(0.5 + 0.7 * Math.max(0, Math.sin(t * 2.5 + k * 1.6))));
    const swing = Math.sin(t * 1.7) * 0.3;
    const L = U.cableLen;
    // trolley in the crane's frame (+x toward the road), crate hangs and swings along the road's lateral axis,
    // which in the crane's frame (yaw 0 at place) is its +x
    const tx = U.tx * Math.cos(U.top.rotation.y);
    const tz = -U.tx * Math.sin(U.top.rotation.y);
    const cx = tx + Math.sin(swing) * L;
    const cy = U.height - 0.35 - Math.cos(swing) * L;
    U.crate.position.set(cx, cy, tz);
    U.crate.rotation.z = -swing;
    const P = U.cable.geometry.getAttribute('position');
    for (const [k, dz] of [[0, -0.35], [1, 0.35]]) {
      P.setXYZ(k * 2, tx, U.height - 0.6, tz + dz);
      P.setXYZ(k * 2 + 1, cx, cy + 2.4, tz + dz);
    }
    P.needsUpdate = true;
    // and the crate's block record follows it (the crane sits at lat -hw-4, its +x is the road's +lat)
    if (C.ob) C.ob.lat = C.lat + cx;
  }

  // Cones knock over at a touch: a scrap of lines, a nudge, and a small shake.
  cones() {
    const R = this.race;
    const main = R.world.main;
    for (const r of R.racers) {
      const tr = r.track;
      if (!tr || tr.path !== main || r.respawnT > 0) continue;
      // cones are red: through the blue lens they aren't there
      if (r.mode === BLUE) continue;
      for (const p of this.pieces) {
        if (!p.cone || p.knocked) continue;
        const i = main.wrap(this.site.i0 + Math.round(p.s / main.ds));
        let di = tr.i - i;
        if (di > main.N / 2) di -= main.N;
        if (di < -main.N / 2) di += main.N;
        if (Math.abs(di * main.ds) > 1.6 + r.halfL || Math.abs(tr.lat - p.lat) > 0.5 + r.halfW) continue;
        p.knocked = true;
        p.root.visible = false;
        if (R.near(r)) {
          R.debris.burst(p.root, _v.copy(r.vel).multiplyScalar(0.6).setY(5), 8, main.py[i], 1, 2.2);
          R.debris.sparks(p.root.position, _d.copy(r.vel).normalize(), 8, 0xff6a5a, 10, main.py[i]);
        }
        r.vel.multiplyScalar(0.985);
        if (r.isPlayer) {
          R.app.audio.play('scrape');
          R.camOf(r).addShake(0.12);
          R.emitP(r, 'popup', { text: 'CONE', color: '#ff6a5a', small: true });
        }
      }
    }
  }
}
