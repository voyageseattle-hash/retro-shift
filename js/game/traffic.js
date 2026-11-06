// Heavy traffic: slow wireframe cars, vans and trucks driving the course in two lanes at half race pace. Every one
// of them lives in ONE world, red or blue, so in BOTH the road is full and through a single lens half of it is gone
// (a faint ghost you pass straight through). The choice: weave, or shift to clear a world and lose that lens's
// shortcuts. Rear-end one flat out and both cars come apart; a glancing hit throws sparks and a horn.
// Traffic keeps off the grid, the full-width walls, the gaps and the storms (it turns off down a side street at
// the end of each clear stretch and comes back on the next), follows the car in front, and changes lane round the
// blocks in its world. Everyone shares the road: rivals get caught in it too (ai.js reads it like obstacles).

import * as THREE from '../../vendor/three.js';
import { M, BOTH, RED, BLUE, COLORS, solidIn } from '../world/shift.js';
import { Kit, Fleet, TAG, trap, placeOnPath, hitRacer, scratchOf, nearPlayer, tmpV as _v } from './hazards.js';

const _d = new THREE.Vector3();
const GHOST = 0.14; // how much of a vehicle in the other world shows through
const PACE = 64; // m/s: roughly race pace; traffic cruises at a fraction of it
const WRECK_INTO = 20; // closing speed (m/s) that wrecks a rival into the back of a vehicle (the player takes a bit more)

// ------------------------------------------------------------------ the vehicles
// Each one is a boxy silhouette you can tell apart at a glance (a low car, a tall van, a long truck), with the
// lamps every car on a night road has: white headlamps throwing a cone, a pair of red tail lamps, amber markers
// along the big ones, and brake lamps that flare (TAG.brake is black until the vehicle brakes). The lamps are what
// read from the chase cam, so they carry most of the glow; the body lines carry the world's colour.
// A rear lamp cluster: tail lamps either side, a brake flare behind them and a spill of red on the road behind.
function tailLamps(K, x, y, z, w, hw, under) {
  for (const s of [-1, 1]) {
    K.lampGlow(s * x, y, z, w, -1, TAG.tail, 0.75);
    K.glowQuad([s * x - w * 2, y - w, z - 0.02], [s * x + w * 2, y - w, z - 0.02], [s * x + w * 2, y + w, z - 0.02], [s * x - w * 2, y + w, z - 0.02], TAG.brake, 0.6);
  }
  // the lit strip between them, and the brake spill behind
  K.seg([-x + w, y, z], [x - w, y, z], TAG.tail);
  K.glowQuad([-hw, 0.05, z - 0.3], [hw, 0.05, z - 0.3], [hw * 0.7, 0.05, z - under], [-hw * 0.7, 0.05, z - under], TAG.brake, 0.16);
}
function carTpl() {
  const K = new Kit();
  K.loft([trap(-2.2, 0.82, 0.55, 0.3, 0.9), trap(-1.4, 0.9, 0.62, 0.25, 0.95), trap(-0.9, 0.9, 1.2, 0.25, 0.78), trap(0.5, 0.9, 1.2, 0.25, 0.78), trap(1.1, 0.9, 0.68, 0.25, 0.95), trap(2.2, 0.82, 0.5, 0.3, 0.9)]);
  // glass: a belt along the side windows, a split down the screens
  for (const s of [-1, 1]) K.seg([s * 0.79, 0.95, -0.9], [s * 0.79, 0.95, 0.5], TAG.glass);
  K.seg([0, 1.45, 0.5], [0, 0.93, 1.1], TAG.glass);
  K.seg([-0.78, 1.19, 0.8], [0.78, 1.19, 0.8], TAG.glass);
  K.seg([0, 1.45, -0.9], [0, 0.87, -1.4], TAG.glass);
  for (const s of [-1, 1]) {
    K.lampGlow(s * 0.52, 0.6, 2.21, 0.22, 1, TAG.head, 0.7);
    K.cone(s * 0.52, 0.55, 2.2, 10, 1.5, TAG.head, 0.07);
  }
  tailLamps(K, 0.58, 0.68, -2.22, 0.2, 1.0, 3.2);
  K.glowQuad([-1.3, 0.06, -2.5], [1.3, 0.06, -2.5], [1.3, 0.06, 2.5], [-1.3, 0.06, 2.5], TAG.under, 0.14);
  return K.build({ w: 0.95, len: 2.3, h: 1.5 });
}
function vanTpl() {
  const K = new Kit();
  K.loft([trap(-2.6, 0.95, 1.7, 0.3, 0.97), trap(0.6, 1.0, 1.75, 0.28, 0.97), trap(1.5, 1.0, 1.75, 0.28, 0.95), trap(2.1, 0.98, 1.15, 0.3, 0.9), trap(2.6, 0.9, 0.62, 0.32, 0.9)]);
  K.seg([0, 2.03, 1.5], [0, 1.45, 2.1], TAG.glass);
  for (const s of [-1, 1]) {
    K.path([[s * 0.99, 1.1, 0.7], [s * 0.99, 1.1, 1.45], [s * 0.99, 1.8, 1.45], [s * 0.99, 1.8, 0.7]], true, TAG.glass);
    K.seg([s * 1.0, 0.9, -2.6], [s * 1.0, 0.9, 0.6]);
    K.lampGlow(s * 0.6, 0.85, 2.61, 0.22, 1, TAG.head, 0.7);
    K.cone(s * 0.6, 0.8, 2.6, 10.5, 1.6, TAG.head, 0.07);
    // amber markers on the roof corners
    K.lampGlow(s * 0.8, 2.02, 1.2, 0.1, 1, TAG.marker, 0.5);
    K.lampGlow(s * 0.8, 2.02, -2.4, 0.1, -1, TAG.marker, 0.5);
    // the tall tail lamps of a van
    K.seg([s * 0.85, 0.5, -2.61], [s * 0.85, 1.25, -2.61], TAG.tail);
  }
  K.seg([0, 0.3, -2.6], [0, 2.0, -2.6]);
  tailLamps(K, 0.85, 0.85, -2.62, 0.2, 1.1, 3.4);
  K.glowQuad([-1.35, 0.06, -2.9], [1.35, 0.06, -2.9], [1.35, 0.06, 2.9], [-1.35, 0.06, 2.9], TAG.under, 0.14);
  return K.build({ w: 1.05, len: 2.7, h: 2.1 });
}
function truckTpl() {
  const K = new Kit();
  // the cab
  K.loft([trap(2.0, 1.2, 2.3, 0.4, 0.96), trap(3.9, 1.2, 2.3, 0.4, 0.96), trap(4.4, 1.15, 1.3, 0.4, 0.92), trap(4.7, 1.05, 0.7, 0.45, 0.9)]);
  K.seg([0, 2.7, 3.9], [0, 1.7, 4.4], TAG.glass);
  // the trailer, with ribs down its sides and marker lamps along the top
  K.loft([trap(-4.7, 1.3, 2.9, 0.5, 1), trap(1.6, 1.3, 2.9, 0.5, 1)]);
  for (const s of [-1, 1]) {
    K.path([[s * 1.19, 1.5, 3.0], [s * 1.19, 1.5, 3.8], [s * 1.19, 2.4, 3.8], [s * 1.19, 2.4, 3.0]], true, TAG.glass);
    for (const y of [1.4, 2.4]) K.seg([s * 1.3, y, -4.7], [s * 1.3, y, 1.6]);
    for (const z of [-4.2, -2.4, -0.6, 1.2]) K.lampGlow(s * 1.31, 3.35, z, 0.12, s, TAG.marker, 0.45);
    K.lampGlow(s * 0.95, 2.72, 2.1, 0.1, 1, TAG.marker, 0.5);
    K.lampGlow(s * 0.78, 1.0, 4.71, 0.26, 1, TAG.head, 0.75);
    K.cone(s * 0.78, 0.9, 4.7, 12, 1.8, TAG.head, 0.07);
    K.seg([s * 1.05, 0.8, -4.71], [s * 1.05, 1.6, -4.71], TAG.tail);
  }
  tailLamps(K, 1.05, 1.1, -4.72, 0.22, 1.4, 4.2);
  K.glowQuad([-1.7, 0.06, -5.0], [1.7, 0.06, -5.0], [1.7, 0.06, 5.0], [-1.7, 0.06, 5.0], TAG.under, 0.14);
  return K.build({ w: 1.35, len: 4.8, h: 3.4 });
}
const KINDS = {
  car: { tpl: carTpl, cruise: 0.56, horns: ['honk1', 'honk2', 'honk3', 'honk6'] },
  van: { tpl: vanTpl, cruise: 0.5, horns: ['honk4', 'honk5'] },
  truck: { tpl: truckTpl, cruise: 0.42, horns: ['horn'] },
};
let TPL = null;

// Each world's palette by tag: body lines in the world's colour, glass paler; the lamps are a night road's own
// (white heads, red tails, amber markers) whichever world the vehicle is in, so it reads as traffic against a
// city that is already red and blue.
function palette(mask) {
  const red = mask === M.R;
  const body = new THREE.Color(red ? COLORS.red : COLORS.blue);
  const pal = [];
  // (lines are pushed over the bloom threshold, so a car glows like the road does)
  pal[TAG.body] = body.clone().multiplyScalar(1.6);
  pal[TAG.glass] = body.clone().lerp(new THREE.Color(0xffffff), 0.55).multiplyScalar(1.5);
  pal[TAG.head] = new THREE.Color(0xfff4e2).multiplyScalar(2.0);
  pal[TAG.tail] = new THREE.Color(0xff2030).multiplyScalar(2.4);
  pal[TAG.under] = body.clone().multiplyScalar(1.1);
  pal[TAG.marker] = new THREE.Color(0xffa030).multiplyScalar(1.6);
  pal[TAG.brake] = new THREE.Color(0x000000);
  pal.braking = new THREE.Color(0xff3040).multiplyScalar(2.2);
  pal.off = pal[TAG.brake];
  return pal;
}

export class Traffic {
  constructor(race) {
    this.race = race;
    this.group = new THREE.Group();
    this.cars = [];
    this.on = false;
    const def = race.def.traffic;
    // (the course asks for it; online races and the first run keep the roads clear, like storms)
    if (!def || race.tutorial || race.online) return;
    this.on = true;
    TPL ||= { car: KINDS.car.tpl(), van: KINDS.van.tpl(), truck: KINDS.truck.tpl() };
    const w = race.world;
    this.path = w.main;
    this.lane = this.path.halfW * 0.5;
    this.pal = { [M.R]: palette(M.R), [M.B]: palette(M.B) };
    this.zones = this.layZones();
    const n = def.n ?? 18;
    let segs = 0, tris = 0, glows = 0;
    for (let k = 0; k < n; k++) {
      const kind = k % 7 === 0 ? 'truck' : k % 3 === 1 ? 'van' : 'car';
      const tpl = TPL[kind];
      const mask = k % 2 ? M.B : M.R;
      // (mask is what the car is solid for; lens is the world it drives in, for reading the road and the blocks)
      const car = {
        kind, tpl, mask, lens: mask === M.R ? RED : BLUE, path: this.path, type: 'traffic', sweep: 0, w: tpl.w, len: tpl.len, h: tpl.h,
        s: 0, i: 0, lat: 0, lane: 1, speed: 0, v0: PACE * KINDS[kind].cruise * (0.9 + this.rand() * 0.2),
        alpha: 0, fade: 0, gone: 0, zone: null, pos: new THREE.Vector3(), m: new THREE.Matrix4(),
        thx: 0, thz: 1, rx: 1, rz: 0, y: 0, yawOff: 0, wobble: 0, laneCd: 0, hornCd: 2 + k, braking: false,
        pair: k % 4 === 3 ? null : undefined, // every fourth drives beside the one before it
      };
      if (car.pair === null) car.pair = this.cars[k - 1];
      this.cars.push(car);
      segs += tpl.segs;
      tris += tpl.tris;
      glows += tpl.glows;
    }
    this.fleet = new Fleet(segs, tris, glows);
    this.group.add(this.fleet.group);
    this.scratch = {};
    this.stats = { wrecks: 0, smashed: 0 }; // (playtests read these)
    for (const car of this.cars) this.place(car);
    this.render(BOTH);
  }

  rand() {
    return this.race.world.rng();
  }

  // The stretches of the main loop traffic may drive in each world: road that is there in that world, no full-width
  // wall or gate or sweeping block, no storm overhead, and clear of the grid. Each is { i0, n } in samples.
  layZones() {
    const w = this.race.world;
    const P = this.path;
    const N = P.N;
    const masks = [M.R, M.B];
    const bad = { [M.R]: new Uint8Array(N), [M.B]: new Uint8Array(N) };
    const mark = (i, before, after, ms) => {
      for (let q = -Math.ceil(before / P.ds); q <= Math.ceil(after / P.ds); q++) for (const m of ms) bad[m][P.wrap(i + q)] = 1;
    };
    const lens = { [M.R]: RED, [M.B]: BLUE };
    for (let i = 0; i < N; i++) for (const m of masks) if (!solidIn(P.mask[i], lens[m])) mark(i, 24, 24, [m]);
    for (const o of w.obstacles) if (o.path === P && (o.type === 'wall' || o.type === 'gate' || o.sweep)) mark(o.i, 30, 30, masks);
    for (const z of w.storms || []) for (let i = 0; i < N; i++) {
      let u = i / N;
      let a = z.u0, b = z.u1;
      if (a < 0) {
        a += 1;
        b += 1;
        if (u < 0.5) u += 1;
      }
      if (u >= a - 0.01 && u <= b + 0.01) for (const m of masks) bad[m][i] = 1;
    }
    mark(0, 80, 50, masks);
    const zones = { [M.R]: [], [M.B]: [] };
    for (const m of masks) {
      const B = bad[m];
      let start = B.indexOf(1);
      if (start < 0) {
        zones[m].push({ i0: 0, n: N });
        continue;
      }
      let i = start;
      do {
        if (B[i]) {
          i = (i + 1) % N;
          continue;
        }
        let n = 0;
        while (!B[(i + n) % N] && n < N) n++;
        if (n * P.ds >= 110) zones[m].push({ i0: i, n });
        i = (i + n) % N;
      } while (i !== start);
    }
    return zones;
  }

  // Put a vehicle somewhere on a clear stretch of its world: beside its pair if it has one, otherwise at random in
  // a zone, never right on top of another vehicle or near a racer who could hit it as it appears.
  place(car) {
    const P = this.path;
    const zones = this.zones[car.mask];
    car.alpha = 0;
    car.fade = 0;
    car.gone = 0;
    if (!zones.length) return;
    const total = zones.reduce((a, z) => a + z.n, 0);
    const clear = (s, lat) => {
      for (const o of this.cars) {
        if (o === car || o.alpha <= 0 && !o.fade) continue;
        let d = o.s - s;
        if (d > P.N / 2) d -= P.N;
        if (d < -P.N / 2) d += P.N;
        d *= P.ds;
        if (Math.abs(d) < 7 || (Math.abs(d) < 18 && Math.abs(o.lat - lat) < 3)) return false;
      }
      for (const r of this.race.racers) {
        if (r.respawnT > 0 || !solidIn(car.mask, r.mode)) continue;
        const i = r.track?.path === P ? r.track.i : P.nearest(r.pos.x, r.pos.z, -1);
        let d = i - s;
        if (d > P.N / 2) d -= P.N;
        if (d < -P.N / 2) d += P.N;
        if (Math.abs(d) * P.ds < 75) return false;
      }
      return true;
    };
    for (let k = 0; k < 10; k++) {
      let s, lane, zone;
      if (car.pair && car.pair.alpha > 0 && k < 4) {
        zone = car.pair.zone;
        s = car.pair.s + (this.rand() - 0.5) * 6 / P.ds;
        lane = -car.pair.lane;
      } else {
        let pick = this.rand() * total;
        zone = zones.find((z) => (pick -= z.n) <= 0) || zones[zones.length - 1];
        s = zone.i0 + (6 + this.rand() * Math.max(1, zone.n * P.ds - 40)) / P.ds;
        lane = this.rand() < 0.5 ? -1 : 1;
      }
      if (!clear(s, lane * this.lane)) continue;
      car.zone = zone;
      car.s = s;
      car.lane = lane;
      car.lat = lane * this.lane;
      car.speed = car.v0 * 0.9;
      car.fade = 1;
      car.wobble = 0;
      car.yawOff = 0;
      placeOnPath(car, P);
      return;
    }
    car.gone = 0.5; // nowhere clear right now: try again shortly
  }

  // ---------------------------------------------------------------- the AI reads it
  // Live vehicles on path P within [pi - 2, pi + n] samples, shaped like obstacles (ai.js counts them per lane).
  near(P, pi, n) {
    if (!this.on || P !== this.path) return NONE;
    const out = [];
    for (const car of this.cars) {
      if (car.alpha < 0.3) continue;
      let d = car.i - pi;
      if (d < -P.N / 2) d += P.N;
      if (d > P.N / 2) d -= P.N;
      if (d >= -2 && d <= n) out.push(car);
    }
    return out;
  }
  // A vehicle in lens m dead ahead of this racer and slower: how hard to ease off, or null.
  brakeFor(r, m) {
    if (!this.on || r.track?.path !== this.path) return null;
    for (const car of this.cars) {
      if (car.alpha < 0.3 || !solidIn(car.mask, m)) continue;
      const dx = car.pos.x - r.pos.x;
      const dz = car.pos.z - r.pos.z;
      const along = dx * car.thx + dz * car.thz;
      if (along < 0 || along > 12 + r.speed * 0.5) continue;
      if (Math.abs(dx * car.rx + dz * car.rz) > car.w + r.halfW + 0.7) continue;
      const closing = r.speed - car.speed;
      if (closing < 4) continue;
      return { throttle: 0.15, brake: along < 8 + closing * 0.3 ? 0.6 : 0 };
    }
    return null;
  }

  // ---------------------------------------------------------------- per frame
  update(dt, viewer) {
    if (!this.on) return;
    const R = this.race;
    const P = this.path;
    const w = R.world;
    const N = P.N;
    this.t = (this.t || 0) + dt;
    this.viewer = viewer;
    for (const r of R.racers) r.trafCd = Math.max(0, (r.trafCd || 0) - dt);
    for (const car of this.cars) {
      if (car.gone > 0) {
        car.gone -= dt;
        if (car.gone <= 0) this.place(car);
        continue;
      }
      if (car.alpha <= 0 && !car.fade) continue;
      // drawing in, or turning off
      if (car.fade > 0) {
        car.alpha = Math.min(1, car.alpha + dt / 0.5);
        if (car.alpha >= 1) car.fade = 0;
      } else if (car.fade < 0) {
        car.alpha -= dt / 0.4;
        if (car.alpha <= 0) {
          this.place(car);
          continue;
        }
      }
      const wrapD = (d) => (d > N / 2 ? d - N : d < -N / 2 ? d + N : d);
      // the end of this clear stretch: turn off
      if (car.fade === 0 && (((car.s - car.zone.i0) % N) + N) % N > car.zone.n - 14 / P.ds) car.fade = -1;
      // follow whatever's in front (any world: in BOTH they all share the road), rivals and players included
      let aheadD = Infinity;
      let aheadV = 0;
      const other = -car.lane * this.lane;
      let otherFree = car.laneCd <= 0;
      for (const o of this.cars) {
        if (o === car || o.alpha <= 0) continue;
        const d = wrapD(o.s - car.s) * P.ds;
        if (Math.abs(d) < 16 && Math.abs(o.lat - other) < 3) otherFree = false;
        if (d <= 0 || d > 40 || Math.abs(o.lat - car.lat) > o.w + car.w + 0.6) continue;
        if (d < aheadD) {
          aheadD = d;
          aheadV = o.speed;
        }
      }
      for (const r of R.racers) {
        if (r.respawnT > 0 || !solidIn(car.mask, r.mode) || r.track?.path !== P || Math.abs(r.pos.y - car.y) > 3) continue;
        const dx = r.pos.x - car.pos.x;
        const dz = r.pos.z - car.pos.z;
        const along = dx * car.thx + dz * car.thz;
        const dlat = dx * car.rx + dz * car.rz;
        if (Math.abs(along) < 14 && Math.abs(dlat - (other - car.lat)) < 3) otherFree = false;
        if (along <= 0 || along > 30 || Math.abs(dlat) > car.w + r.halfW + 0.5) continue;
        if (along < aheadD) {
          aheadD = along;
          aheadV = r.vel.x * car.thx + r.vel.z * car.thz;
        }
      }
      // blocks in our world over the next 50 m, in our lane and in the other
      let blockHere = 0;
      let blockOther = 0;
      for (const o of w.obstacles) {
        if (o.path !== P || o.broken || !solidIn(o.mask, car.lens)) continue;
        const d = wrapD(o.i - car.s) * P.ds;
        if (d < -4 || d > 50) continue;
        if (Math.abs(o.lat - car.lat) < o.w + car.w + 0.5) blockHere = Math.max(blockHere, 50 - d);
        if (Math.abs(o.lat - other) < o.w + car.w + 0.5) blockOther = 1;
      }
      if (blockHere) {
        if (!blockOther && otherFree) {
          car.lane = -car.lane;
          car.laneCd = 3;
        } else if (blockHere > 25 && car.fade === 0) car.fade = -1; // boxed in: off down a side street
      } else if (aheadD < 24 && aheadV < car.v0 - 5 && otherFree && !blockOther && car.fade === 0) {
        // stuck behind something slow: pull out round it
        car.lane = -car.lane;
        car.laneCd = 4;
      }
      car.laneCd = Math.max(0, car.laneCd - dt);
      let target = car.v0;
      if (aheadD < 12 + car.speed * 0.5) target = Math.min(car.v0, Math.max(0, aheadV - 1));
      car.braking = target < car.speed - 2;
      car.speed += Math.max(-14 * dt, Math.min(7 * dt, target - car.speed));
      car.s += (car.speed * dt) / P.ds;
      // lane position, a wobble after a hit, and the nose pointing where it's going
      const want = car.lane * this.lane;
      const dl = Math.max(-3.5 * dt, Math.min(3.5 * dt, want - car.lat));
      car.wobble = Math.max(0, car.wobble - dt);
      car.lat += dl + Math.sin(this.t * 22) * car.wobble * 0.25 * dt * 10;
      car.yawOff = Math.atan2(dl / Math.max(dt, 1e-3), Math.max(8, car.speed)) * 0.8;
      placeOnPath(car, P);
      car.hornCd = Math.max(0, car.hornCd - dt);
      // racers hit it (only those in its world, and only once it's fully there)
      if (car.alpha > 0.6) {
        for (const r of R.racers) {
          if (r.puppet || r.respawnT > 0 || !solidIn(car.mask, r.mode)) continue;
          const hit = hitRacer(car, r);
          if (hit) this.collide(car, r, hit);
          else if (r.isPlayer && car.hornCd <= 0) {
            // close pass: a horn now and then
            const dx = r.pos.x - car.pos.x;
            const dz = r.pos.z - car.pos.z;
            const along = dx * car.thx + dz * car.thz;
            const dlat = Math.abs(dx * car.rx + dz * car.rz);
            if (Math.abs(along) < 10 && dlat < car.w + 3.5 && Math.random() < 0.35) this.horn(car, 0.9);
            else if (Math.abs(along) < 60 && Math.random() < 0.08) this.horn(car, 0.5);
          }
        }
      }
    }
    this.render(viewer.mode);
  }

  horn(car, vol) {
    car.hornCd = 5 + Math.random() * 6;
    const d = this.race.player.pos.distanceTo(car.pos);
    const v = Math.max(0, 1 - d / 110) * vol;
    if (v > 0.03) {
      const h = KINDS[car.kind].horns;
      this.race.app.audio.play(h[Math.floor(Math.random() * h.length)], v);
    }
  }

  collide(car, r, hit) {
    const R = this.race;
    if (hit.side) {
      // a side swipe: sparks down the flank, a shove, and the driver leans on the horn
      car.wobble = Math.max(car.wobble, 0.5);
      car.lat -= hit.s * 0.15;
      if (hit.into > 3 && r.trafCd <= 0) {
        r.trafCd = 0.35;
        R.scrape(r, hit.into, _d.set(car.rx * hit.s, 0, car.rz * hit.s));
        if (r.isPlayer) {
          R.app.audio.play('scrape');
          R.camOf(r).addShake(Math.min(0.5, 0.15 + hit.into * 0.03));
          R.app.input.rumble(r.pIndex || 0, 0.4, 0.3, 120);
          R.stats.crashes++;
        }
        if (car.hornCd <= 0) this.horn(car, 1);
      }
      return;
    }
    if (hit.into < 3) return;
    const ranInto = hit.s < 0; // we hit its tail (rather than it running into our tail)
    const wreckAt = r.isPlayer ? WRECK_INTO * 1.15 : WRECK_INTO;
    if (ranInto && hit.into > wreckAt) {
      // flat out into the back of it: it comes apart, and so does a good piece of your hull
      if (r.isPlayer) R.emitP(r, 'popup', { text: 'TRAFFIC', color: '#ff4a6a', small: true });
      this.smash(car, r.vel);
      this.stats.wrecks++;
      R.hurt(r, (hit.into - 6) * 1.45);
      r.vel.multiplyScalar(0.55);
      return;
    }
    if (r.trafCd > 0) return;
    r.trafCd = 0.5;
    const hard = hit.into > 9;
    R.scrape(r, hit.into, _d.set(-car.thx * hit.s, 0, -car.thz * hit.s));
    car.wobble = Math.max(car.wobble, hard ? 1 : 0.4);
    car.speed += ranInto ? hit.into * 0.35 : -hit.into * 0.2; // shunted forward, or it brakes hard
    if (hard) r.spinOut(0.6, Math.random() < 0.5 ? -1 : 1);
    if (r.isPlayer) {
      R.app.audio.play(hard ? 'hit' : 'scrape');
      R.camOf(r).addShake(hard ? 0.6 : 0.25);
      R.app.input.rumble(r.pIndex || 0, 0.7, 0.5, 200);
      R.aberr = Math.max(R.aberr || 0, hard ? 0.8 : 0.3);
      R.stats.crashes++;
      if (hard) R.emitP(r, 'popup', { text: 'TRAFFIC', color: '#ff4a6a', small: true });
    } else if (hard && R.near(r)) R.app.audio.play('hit', 0.5);
    this.horn(car, 1);
  }

  // The vehicle comes apart into its own lines and is gone; another takes its place down the road later.
  smash(car, vel) {
    const R = this.race;
    if (nearPlayer(R, car.pos, 260)) {
      const key = `${car.kind}${car.mask}`;
      const sc = (this.scratch[key] ||= scratchOf(car.tpl, this.pal[car.mask][TAG.body]));
      sc.matrix.copy(car.m);
      sc.matrixWorld.copy(car.m);
      _v.set(car.thx * car.speed * 0.6 + vel.x * 0.4, 3, car.thz * car.speed * 0.6 + vel.z * 0.4);
      R.debris.burst(sc, _v, 15, car.y, 1, 2.8);
      R.debris.sparks(car.pos, _d.set(0, 0, 0), 30, 0xffd27a, 24, car.y);
    }
    this.stats.smashed++;
    car.alpha = 0;
    car.fade = 0;
    car.gone = 9 + Math.random() * 6;
  }

  // Draw everything for a viewer looking through this lens (split-screen draws once per view).
  render(mode, viewer = this.viewer) {
    if (!this.on) return;
    const F = this.fleet;
    const shimmer = 0.85 + 0.15 * Math.sin((this.t || 0) * 9);
    const eye = viewer?.pos;
    F.begin();
    for (const car of this.cars) {
      if (car.alpha <= 0.01) continue;
      const seen = solidIn(car.mask, mode);
      let a = car.alpha * (seen ? 1 : GHOST * shimmer);
      if (car.fade > 0 && Math.random() < 0.3) a *= 0.3; // flickers in
      const pal = this.pal[car.mask];
      pal[TAG.brake] = car.braking ? pal.braking : pal.off;
      // far down the road a vehicle is a few pixels of line: its lamps are turned up so it stays a pair of lights
      const glowK = eye ? Math.min(3, Math.max(1, eye.distanceTo(car.pos) / 25)) : 1;
      F.draw(car.tpl, car.m, a, pal, !seen, glowK);
    }
    F.end();
  }
}
const NONE = [];
