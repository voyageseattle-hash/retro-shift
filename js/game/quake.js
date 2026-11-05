// The quake course (Echo Ruins): three acts, one per lap, played out on the course's fault zones (clear stretches
// of the main road picked by world/sites.js).
//
//   Lap 1  QUAKE     tremors roll through every few seconds: the camera rumbles, ripples run down the road, cracks
//                    spread across it, and loose rock tumbles out of the sky onto the fault zones (blocks you can
//                    smash, red or blue, so the lens clears them). Mostly a warning.
//   Lap 2  ERUPTION  the volcanoes off the course go up. The cracks glow orange and lava breaks through them in
//                    pools on the fault zones: through RED or BOTH it drags you down and burns you out in a second;
//                    through BLUE it has cooled to dark crust (it's the red world's), but so have the red routes.
//                    Lava bombs arc in from the craters onto anyone not in blue, telegraphed by rings like meteors.
//   Lap 3  PLATES    when the leader starts the last lap the plates let go: the main road's own heights change under
//          SPLIT     the baked lines (the road's vertices are carried along), so ground(), the rails and the AI all
//                    see the new course. The RIFT zone tilts up into a lip, tears open, and the far plate drops: hold
//                    speed and jump it (BLUE glides furthest). The DROP zone falls onto a lower road: RED clings down
//                    the step, everyone else flies off it. The TILT zone's slab hinges up into a ramp with a cliff
//                    off its end: RED rides down the back, BLUE and BOTH fly.
//
// Off online (tremors are random) and in the tutorial, like the storms.

import * as THREE from '../../vendor/three.js';
import { M, BOTH, RED, BLUE, COLORS, solidIn } from '../world/shift.js';
import { findSites } from '../world/sites.js';
import { boardTexture } from '../world/signs.js';
import { mulberry32, smoothstep, clamp } from '../core/util.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _t0 = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const LAVA = 0xff7a2a;
const LAVA_HOT = 0xffc050;
const CRUST = 0x3a2038;
const RING = 28;
const SIGN_BACK = 90;
const SPLIT_T = 2.6; // seconds a plate takes to move
const EXT = 22; // metres a shape may run on past its zone (a climb back to grade)

function lines(pts, color, opacity = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, opacity, ...ADD }));
  l.frustumCulled = false;
  l.renderOrder = 6;
  return l;
}
function circle(r, seg, jag = 0) {
  const p = [];
  const rr = (i) => r * (1 + (jag ? ((((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1) * jag - jag / 2 : 0));
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const r0 = rr(i);
    const r1 = rr((i + 1) % seg);
    p.push(Math.cos(a0) * r0, 0, Math.sin(a0) * r0, Math.cos(a1) * r1, 0, Math.sin(a1) * r1);
  }
  return p;
}

// ------------------------------------------------------------------ the three plate shapes (metres along a zone -> dy)
// Each returns { dy(s), tilt(s) } for s in metres from the zone start; dy beyond the zone end + EXT is 0.
const SHAPES = {
  // a ramp up to a lip, a gap, and the far plate dropped a step, climbing back to grade
  rift(L) {
    const lip = 30;
    const gap = 10;
    const back = L + EXT;
    const depth = 2.6;
    return {
      gap: [lip, lip + gap],
      dy: (s) => {
        if (s < 4) return 0;
        if (s < lip) return 3.0 * ((s - 4) / (lip - 4)) ** 1.5;
        if (s < lip + gap) return -depth;
        if (s < L - 20) return -depth;
        return -depth * (1 - smoothstep(0, 1, (s - (L - 20)) / (back - (L - 20))));
      },
      tilt: (s) => (s > lip + gap && s < L - 20 ? 0.1 * Math.sin(Math.PI * clamp((s - lip - gap) / (L - 20 - lip - gap), 0, 1)) : 0),
    };
  },
  // the plate falls onto a lower road: a sharp step down, a flat run, and a climb out
  drop(L) {
    const depth = 5;
    const at = 10;
    const down = 9;
    const flat = L - 48;
    return {
      dy: (s) => {
        if (s < at) return 0;
        if (s < at + down) return -depth * (1 - (1 - (s - at) / down) ** 2);
        if (s < at + down + flat) return -depth;
        return -depth * (1 - smoothstep(0, 1, (s - at - down - flat) / (L + EXT - at - down - flat)));
      },
      tilt: () => 0,
    };
  },
  // the slab hinges up into a ramp and leaves a cliff off its end
  tilt(L) {
    const hinge = 8;
    const lip = 38;
    const h = 2.4;
    return {
      dy: (s) => {
        if (s < hinge) return 0;
        if (s < lip) return (h * (s - hinge)) / (lip - hinge);
        if (s < lip + 9) return h * (1 - smoothstep(0, 1, (s - lip) / 9));
        return 0;
      },
      tilt: () => 0,
    };
  },
};

export class Quake {
  constructor(race) {
    this.race = race;
    this.group = new THREE.Group();
    this.on = false;
    this.act = 0;
    this.zones = [];
    this.rubble = [];
    this.bombs = [];
    this.tremor = 0; // seconds into the current tremor, or 0
    this.tremorNext = 4;
    this.tremors = 0;
    if (race.tutorial || race.online || !race.def.quake) return;
    const world = race.world;
    const main = world.main;
    this.rng = mulberry32((race.def.seed || 1) * 17 + 3);
    // the fault zones: up to four clear stretches, well apart; the longest tears, the next drops, the next tilts
    const sites = findSites(world, { minLen: 64, maxCurv: 0.03, clear: 25 });
    const picked = [];
    for (const s of sites) {
      const mid = (s.u0 + s.n / 2 / main.N) % 1;
      if (picked.every((p) => Math.min(Math.abs(p.mid - mid), 1 - Math.abs(p.mid - mid)) > 0.08)) picked.push({ ...s, mid });
      if (picked.length >= 4) break;
    }
    if (!picked.length) return;
    const roles = ['rift', 'drop', 'tilt'];
    picked.forEach((z, k) => (z.role = roles[k] || 'fault'));
    this.zones = picked.sort((a, b) => a.u0 - b.u0);
    this.on = true;
    for (const z of this.zones) this.buildZone(z);
    this.buildVolcanoes();
    // a respawn inside a torn zone could put a car back on the lip at walking pace: send it back to the run-up
    const rp = world.respawnPoint.bind(world);
    world.respawnPoint = (u, mode) => {
      for (const z of this.zones) {
        if (!z.shape || !z.k) continue;
        let d = u - z.u0;
        if (d > 0.5) d -= 1;
        if (d < -0.5) d += 1;
        const m = d * main.length;
        if (m > -20 && m < z.len + EXT) u = (z.u0 - 60 / main.length + 1) % 1;
      }
      return rp(u, mode);
    };
  }

  // ------------------------------------------------------------------ build
  buildZone(z) {
    const W = this.race.world;
    const main = W.main;
    const hw = main.halfW;
    const rng = this.rng;
    z.k = 0;
    z.grow = 0;
    z.cracks = [];
    z.pools = [];
    z.hot = 0;
    // cracks: jagged lines from one edge in toward (or across) the road, drawn a little at a time as tremors come
    const nC = 6 + Math.floor(rng() * 3);
    for (let c = 0; c < nC; c++) {
      const s0 = 6 + rng() * (z.len - 12);
      const side = rng() < 0.5 ? -1 : 1;
      const pts = [];
      let s = s0;
      let lat = side * (hw + 0.3);
      const reach = hw * (0.9 + rng() * 1.3);
      const steps = 8 + Math.floor(rng() * 6);
      // each point: metres along, lateral, and a little height, so the crack's edges stand up out of the road
      let h = 0.04;
      for (let k = 0; k < steps; k++) {
        const ns = s + (rng() - 0.5) * 3.4;
        const nl = lat - side * (reach / steps) * (0.6 + rng() * 0.8);
        const nh = 0.04 + rng() * 0.3;
        pts.push([s, lat, h], [ns, nl, nh]);
        // a fork now and then
        if (rng() < 0.35) pts.push([ns, nl, nh], [ns + (rng() - 0.5) * 4, nl - side * rng() * 2.5, 0.04 + rng() * 0.2]);
        s = ns;
        lat = nl;
        h = nh;
      }
      const mk = (color, opacity) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pts.length * 3), 3));
        geo.setDrawRange(0, 0);
        const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, ...ADD, opacity }));
        l.frustumCulled = false;
        l.renderOrder = 6;
        return l;
      };
      // the crack three times, a hand's width apart: a white core between two violet edges that turn to lava
      const l = mk(0xffffff, 0.95);
      const glow = mk(0xb04cff, 0.6);
      const glow2 = mk(0xb04cff, 0.6);
      this.group.add(l, glow, glow2);
      z.cracks.push({ pts, l, glow, glow2, mat: l.material });
    }
    // ripple: a line across the road every other sample, flat until a tremor runs through it
    const rows = Math.floor(z.n / 3);
    const cols = 12;
    const rp = new Float32Array(rows * cols * 6);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    // per-vertex colour: the lifted part of a line glows, the flat part is dark, so only the wave shows
    rg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(rows * cols * 6), 3));
    const rm = new THREE.LineBasicMaterial({ color: 0xffffff, vertexColors: true, ...ADD, opacity: 0 });
    const rl = new THREE.LineSegments(rg, rm);
    rl.frustumCulled = false;
    rl.renderOrder = 6;
    rl.visible = false;
    this.group.add(rl);
    z.ripple = { rows, cols, geo: rg, mat: rm, l: rl };
    // lava pools: two per zone, one each side of the road, staggered so there's a line through
    const gap = SHAPES[z.role]?.(z.len).gap;
    const safe = (s0, s1) => !gap || s1 < gap[0] - 6 || s0 > gap[1] + 6;
    const want = [[8, 26, -1], [z.len * 0.5, z.len * 0.5 + 20, 1]];
    if (z.role === 'rift') want[1] = [z.len * 0.52, z.len * 0.52 + 18, 1];
    for (const [s0, s1, side] of want) if (safe(s0, s1)) this.buildPool(z, s0, s1, side);
    // the zone's sign, before it
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const Wd = 11;
    const H = (Wd * 200) / 512;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(Wd, H), mat);
    const lift = 6.5;
    board.position.y = lift + H / 2;
    board.rotation.y = Math.PI;
    board.renderOrder = 10;
    const top = lift + H * 0.15;
    const posts = lines([-hw - 0.5, 0, 0, -hw - 0.5, top, 0, hw + 0.5, 0, 0, hw + 0.5, top, 0, -hw - 0.5, top, 0, hw + 0.5, top, 0], 0xff4fd8);
    const sign = new THREE.Group();
    sign.add(board, posts);
    const si = main.wrap(z.i0 - Math.round(SIGN_BACK / main.ds));
    main.point(si, 0, 0, sign.position);
    sign.rotation.y = Math.atan2(main.thx[si], main.thz[si]);
    this.group.add(sign);
    z.sign = { mat, board, posts };
    this.signFor(z);
    // the plate: its shape, its base heights, and the baked road vertices that will ride along
    if (SHAPES[z.role]) {
      z.shape = SHAPES[z.role](z.len);
      const n = z.n + Math.ceil(EXT / main.ds) + 2;
      z.span = n;
      z.base = new Float32Array(n);
      z.baseTb = new Float32Array(n);
      z.dy = new Float32Array(n);
      z.dtb = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const i = main.wrap(z.i0 + k);
        z.base[k] = main.py[i];
        z.baseTb[k] = main.tb[i];
        z.dy[k] = z.shape.dy(k * main.ds);
        z.dtb[k] = z.shape.tilt(k * main.ds);
      }
      this.capture(z);
      // the rift's torn lips: a jagged line across each, and a seam of lava down the bottom of the tear
      if (z.shape.gap) {
        const jag = (n) => Float32Array.from({ length: n }, () => rng() - 0.5);
        z.lips = [0, 1].map((k) => ({ jit: jag(26), l: lines(new Array(24 * 6).fill(0), k ? LAVA_HOT : 0xffffff, 0) }));
        z.seam = { jit: jag(26), l: lines(new Array(24 * 6).fill(0), LAVA, 0) };
        this.group.add(z.lips[0].l, z.lips[1].l, z.seam.l);
      }
    }
  }

  // A lava pool: a dark glass sheet with rippling lines over it and a bright, jagged rim; on one side of the road
  // from s0 to s1 metres into the zone. Hidden until the eruption.
  buildPool(z, s0, s1, side) {
    const main = this.race.world.main;
    const hw = main.halfW;
    const lat0 = side < 0 ? -hw + 0.3 : -hw * 0.1;
    const lat1 = side < 0 ? hw * 0.1 : hw - 0.3;
    const rows = Math.max(4, Math.round((s1 - s0) / 4));
    const cols = 4;
    const rip = new THREE.BufferGeometry();
    rip.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(rows * cols * 6), 3));
    const ripMat = new THREE.LineBasicMaterial({ color: LAVA, ...ADD, opacity: 0 });
    const ripL = new THREE.LineSegments(rip, ripMat);
    const fill = new THREE.BufferGeometry();
    fill.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(rows * 18), 3));
    const fillMat = new THREE.MeshBasicMaterial({ color: 0x4a1408, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const fillM = new THREE.Mesh(fill, fillMat);
    fillM.renderOrder = 4;
    // the rim: a jagged loop
    const rimN = rows * 2 + 8;
    const rim = new THREE.BufferGeometry();
    rim.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(rimN * 6), 3));
    const rimMat = new THREE.LineBasicMaterial({ color: LAVA_HOT, ...ADD, opacity: 0 });
    const rimL = new THREE.LineSegments(rim, rimMat);
    for (const o of [ripL, fillM, rimL]) {
      o.frustumCulled = false;
      o.visible = false;
    }
    const meshes = [ripL, fillM, rimL];
    ripL.renderOrder = 6;
    rimL.renderOrder = 6;
    this.group.add(ripL, fillM, rimL);
    // the rim's jitter, fixed per vertex
    const jit = Float32Array.from({ length: rimN * 2 }, () => (this.rng() - 0.5) * 1.4);
    z.pools.push({ z, s0, s1, lat0, lat1, rows, cols, rip, ripMat, fill, fillMat, rim, rimMat, rimN, jit, meshes, on: 0 });
  }

  // Volcanoes: wire cones on the floor out past the course, one off the far side of each shaped zone.
  buildVolcanoes() {
    const W = this.race.world;
    const main = W.main;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < main.N; i++) {
      cx += main.px[i];
      cz += main.pz[i];
    }
    cx /= main.N;
    cz /= main.N;
    this.volcanoes = [];
    for (const z of this.zones.filter((q) => q.shape).slice(0, 3)) {
      const i = main.wrap(z.i0 + Math.floor(z.n / 2));
      const side = (main.px[i] + main.rightX(i) * 50 - cx) ** 2 + (main.pz[i] + main.rightZ(i) * 50 - cz) ** 2 > (main.px[i] - main.rightX(i) * 50 - cx) ** 2 + (main.pz[i] - main.rightZ(i) * 50 - cz) ** 2 ? 1 : -1;
      const dist = 175 + this.rng() * 50;
      const x = main.px[i] + main.rightX(i) * side * dist;
      const zz = main.pz[i] + main.rightZ(i) * side * dist;
      const y0 = W.floorY;
      const R0 = 72 + this.rng() * 22;
      const H = R0 * 1.0;
      const Rc = R0 * 0.2;
      const p = [];
      const mer = 10;
      for (let k = 0; k < mer; k++) {
        const a = (k / mer) * Math.PI * 2;
        const b = ((k + 1) / mer) * Math.PI * 2;
        // the slope sags a little: two segments per meridian
        const mx = Math.cos(a) * (R0 + Rc) * 0.5 * 0.92;
        const mz = Math.sin(a) * (R0 + Rc) * 0.5 * 0.92;
        p.push(Math.cos(a) * R0, 0, Math.sin(a) * R0, mx, H * 0.45, mz, mx, H * 0.45, mz, Math.cos(a) * Rc, H, Math.sin(a) * Rc);
        p.push(Math.cos(a) * R0, 0, Math.sin(a) * R0, Math.cos(b) * R0, 0, Math.sin(b) * R0);
        const r2 = (R0 + Rc) * 0.5 * 0.92;
        p.push(Math.cos(a) * r2, H * 0.45, Math.sin(a) * r2, Math.cos(b) * r2, H * 0.45, Math.sin(b) * r2);
      }
      const body = lines(p, 0xff3a3a, 0.6);
      body.renderOrder = 2;
      const crater = lines(circle(Rc, 20, 0.15).concat(circle(Rc * 0.6, 14, 0.3), circle(Rc * 1.25, 24, 0.1)), LAVA, 0.35);
      crater.position.y = H;
      const g = new THREE.Group();
      g.position.set(x, y0, zz);
      g.add(body, crater);
      this.group.add(g);
      this.volcanoes.push({ g, body, crater, x, z: zz, top: y0 + H, Rc });
    }
  }

  // Which baked road vertices lie on a plate: every layer vertex near the road along the zone's span, with the
  // sample it belongs to and its lateral offset, so a height or tilt change can carry it along.
  capture(z) {
    const W = this.race.world;
    const main = W.main;
    const hw = main.halfW;
    const n = z.span;
    // the span's samples and a loose bounding box around them
    const S = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let k = 0; k < n; k++) {
      const i = main.wrap(z.i0 + k);
      S.push({ k, x: main.px[i], y: main.py[i], z: main.pz[i], rx: main.rightX(i), rz: main.rightZ(i), tx: main.thx[i], tz: main.thz[i] });
      minX = Math.min(minX, main.px[i]);
      maxX = Math.max(maxX, main.px[i]);
      minZ = Math.min(minZ, main.pz[i]);
      maxZ = Math.max(maxZ, main.pz[i]);
    }
    const pad = hw + 3;
    z.verts = [];
    W.layers.group.traverse((o) => {
      const P = o.geometry?.getAttribute?.('position');
      if (!P) return;
      const list = [];
      for (let v = 0; v < P.count; v++) {
        const x = P.getX(v);
        const y = P.getY(v);
        const zz = P.getZ(v);
        if (x < minX - pad || x > maxX + pad || zz < minZ - pad || zz > maxZ + pad) continue;
        // nearest sample by distance along the road's own frame
        let best = null;
        let bd = Infinity;
        for (const s of S) {
          const dx = x - s.x;
          const dz = zz - s.z;
          const along = dx * s.tx + dz * s.tz;
          if (Math.abs(along) > main.ds * 0.75) continue;
          const lat = dx * s.rx + dz * s.rz;
          const d = Math.abs(along) + Math.abs(lat) * 0.01;
          if (Math.abs(lat) <= hw + 1.2 && Math.abs(y - s.y) < 3.5 && d < bd) {
            bd = d;
            best = { k: s.k, lat };
          }
        }
        if (best) list.push(v, best.k, best.lat, y);
      }
      if (list.length) {
        o.frustumCulled = false;
        z.verts.push({ P, list: Float32Array.from(list) });
      }
    });
  }

  // ------------------------------------------------------------------ per frame
  update(dt, viewer) {
    if (!this.on) return;
    const R = this.race;
    this.t = (this.t || 0) + dt;
    const racing = R.state === 'race';
    // the acts follow the leader's lap
    const lap = Math.max(...R.racers.map((r) => r.lap));
    if (racing && this.act < 1) this.startAct(1);
    if (racing && lap >= 1 && this.act < 2) this.startAct(2);
    if (racing && lap >= 2 && this.act < 3) this.startAct(3);
    // tremors
    if (racing) {
      this.tremorNext -= dt;
      if (this.tremor > 0) {
        this.tremor += dt;
        if (this.tremor > 2.4) this.tremor = 0;
      } else if (this.tremorNext <= 0) {
        this.startTremor();
      }
    }
    const env = this.tremor > 0 ? Math.sin((Math.PI * this.tremor) / 2.4) ** 0.7 : 0;
    this.env = env;
    if (env > 0) for (const p of R.players) R.camOf(p).addShake(env * 1.7 * dt);
    // lens level of the red world for the viewer: the lava's heat
    const lv = R.world.layers.level.get(M.R) ?? 1;
    this.heat = this.act >= 2 ? lv : 0;
    for (const z of this.zones) {
      if (z.shape && z.splitting) this.split(z, dt);
      this.drawZone(z, env, lv, viewer);
    }
    this.updateRubble(dt, viewer);
    if (this.act >= 2) {
      this.lava(dt);
      this.updateVolcanoes(dt);
      this.updateBombs(dt, viewer);
    }
    // dust along the road edges near the player while the ground shakes
    if (env > 0.3 && R.near(R.player) && Math.random() < env * 0.5) {
      const g = R.player.gnd;
      if (g.onRoad) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const P = g.path;
        const i = P.wrap(g.i + Math.floor(Math.random() * 20));
        P.point(i, side * (P.halfW - 0.5), 0.1, _v);
        R.debris.sparks(_v, _d.set(0, 0.6, 0), 2, 0x9a8ab0, 4, _v.y - 0.1);
      }
    }
  }

  startAct(act) {
    const R = this.race;
    this.act = act;
    for (const z of this.zones) this.signFor(z);
    if (act === 1) {
      this.tremorNext = 3;
      return;
    }
    if (act === 2) {
      for (const pl of R.players) {
        R.emitP(pl, 'popup', { text: 'ERUPTION', color: '#ff7a2a' });
        R.camOf(pl).addShake(0.9);
        R.camOf(pl).fovPunch(6);
      }
      R.app.audio.play('meteor');
      R.app.audio.play('quake');
      this.tremor = 0.01;
      this.tremorNext = 11;
      for (const z of this.zones) {
        z.hotStart = this.t;
        for (const c of z.cracks) c.grow = 1;
        z.grow = Math.max(z.grow, 0.75);
      }
    }
    if (act === 3) {
      for (const pl of R.players) {
        R.emitP(pl, 'popup', { text: 'THE PLATES SPLIT', color: '#ff4fd8' });
        R.camOf(pl).addShake(1.3);
        R.camOf(pl).fovPunch(9);
      }
      R.app.audio.play('wreck');
      R.app.audio.play('quake');
      R.aberr = 1.5;
      if (!R.split && !R.online) {
        R.slowLen = 1.1;
        R.slowT = 1.1;
      }
      this.tremor = 0.01;
      this.tremorNext = 14;
      let wait = 0;
      for (const z of this.zones) {
        if (!z.shape) continue;
        z.splitting = { t: -wait, waited: 0 };
        wait += 0.7;
      }
    }
  }

  startTremor() {
    const R = this.race;
    this.tremor = 0.01;
    this.tremors++;
    this.tremorNext = this.act === 1 ? 6 + Math.random() * 4 : 10 + Math.random() * 6;
    const strength = this.act === 1 ? 1 : 0.6;
    R.app.audio.play('quake');
    if (this.tremors === 1) for (const pl of R.players) R.emitP(pl, 'popup', { text: 'QUAKE', color: '#e8dcff' });
    for (const z of this.zones) {
      // cracks spread a little further
      z.grow = Math.min(1, z.grow + 0.3 * strength);
      // and rock comes down on zones with someone coming
      const coming = R.racers.some((r) => {
        let d = z.u0 - r.lastU;
        if (d < 0) d += 1;
        return d * R.world.main.length < 220;
      });
      const n = coming ? 1 + Math.floor(Math.random() * 2) : Math.random() < 0.35 ? 1 : 0;
      for (let k = 0; k < n; k++) this.dropRock(z);
    }
  }

  signFor(z) {
    const act = this.act;
    let title = 'FAULT ZONE';
    let sub = 'QUAKE · LOOSE ROCK';
    let col = 0xe8dcff;
    if (act === 2) {
      title = 'LAVA';
      sub = 'RED WORLD · BLUE COOLS IT';
      col = LAVA;
    } else if (act === 3) {
      col = 0xff4fd8;
      if (z.role === 'rift') [title, sub] = ['RIFT', 'HOLD SPEED · JUMP IT'];
      else if (z.role === 'drop') [title, sub] = ['PLATE DROP', 'RED CLINGS · BLUE GLIDES'];
      else if (z.role === 'tilt') [title, sub] = ['TILTED SLAB', 'RED STAYS DOWN · BLUE FLIES'];
      else [title, sub, col] = ['LAVA', 'RED WORLD · BLUE COOLS IT', LAVA];
    }
    z.sign.mat.map?.dispose();
    z.sign.mat.map = boardTexture(title, sub, col, 0);
    z.sign.mat.needsUpdate = true;
    z.sign.posts.material.color.set(col);
  }

  // Cracks, ripples and pools of a zone, re-laid on the road every frame (the road under them may be moving).
  drawZone(z, env, lv, viewer) {
    const main = this.race.world.main;
    const hw = main.halfW;
    const t = this.t;
    // additive lines stack as they bunch up with distance: a far zone is drawn fainter so it reads, not glares
    main.point(z.i0 + Math.floor(z.n / 2), 0, 0, _v);
    const far = clamp(70 / Math.max(1, viewer.pos.distanceTo(_v) - z.len * 0.5), 0.12, 1);
    z.far = far;
    const at = (s, lat, h, out) => {
      const x = s / main.ds;
      const i = Math.floor(x);
      const f = x - i;
      // (own scratch vectors: callers hold results in _p/_q/_v/_d across calls)
      main.point(z.i0 + i, lat, h, _t0);
      main.point(z.i0 + i + 1, lat, h, _t1);
      return out.copy(_t0).lerp(_t1, f);
    };
    // cracks: drawn as far as they've grown; white in the quake, orange and glowing once the lava is up
    const hot = z.hotStart !== undefined ? clamp((t - z.hotStart) / 2.5, 0, 1) : 0;
    for (const c of z.cracks) {
      const n = c.pts.length;
      const shown = Math.floor((n * z.grow) / 2) * 2;
      for (const g of [c.l, c.glow, c.glow2]) g.geometry.setDrawRange(0, shown);
      if (!shown) continue;
      const P = c.l.geometry.getAttribute('position');
      const G = c.glow.geometry.getAttribute('position');
      const G2 = c.glow2.geometry.getAttribute('position');
      for (let k = 0; k < shown; k++) {
        const [ps, pl, ph] = c.pts[k];
        at(ps, clamp(pl, -hw - 0.3, hw + 0.3), ph, _v);
        P.setXYZ(k, _v.x, _v.y, _v.z);
        at(ps + 0.22, clamp(pl + 0.16, -hw - 0.3, hw + 0.3), ph * 0.6 + 0.03, _v);
        G.setXYZ(k, _v.x, _v.y, _v.z);
        at(ps - 0.22, clamp(pl - 0.16, -hw - 0.3, hw + 0.3), ph * 0.6 + 0.03, _v);
        G2.setXYZ(k, _v.x, _v.y, _v.z);
      }
      P.needsUpdate = G.needsUpdate = G2.needsUpdate = true;
      // a fresh crack flares, then settles; in the eruption the edges glow with the lens's heat
      c.mat.color.set(0xffffff).lerp(_c.set(LAVA_HOT), hot);
      // (kept dim: the glow pass stacks fast at a distance, and a dozen cracks would wash the road out)
      c.mat.opacity = (0.42 + 0.3 * env + 0.18 * hot) * far;
      const go = (hot ? hot * (0.08 + lv * (0.16 + 0.1 * Math.sin(t * 3 + c.pts[0][0]))) : 0.16 + 0.3 * env) * far;
      _c.set(hot ? LAVA : 0xb04cff).lerp(_c2.set(CRUST), hot * (1 - lv));
      for (const g of [c.glow, c.glow2]) {
        g.material.opacity = go;
        g.material.color.copy(_c);
      }
    }
    // ripple: a wave of lifted lines rolling down the zone while a tremor runs
    const r = z.ripple;
    r.l.visible = env > 0.02;
    if (r.l.visible) {
      const P = r.geo.getAttribute('position');
      const C = r.geo.getAttribute('color');
      let q = 0;
      for (let row = 0; row < r.rows; row++) {
        const s = row * 3 * main.ds;
        const wave = Math.max(0, Math.sin(s * 0.2 - t * 10)) ** 2;
        const lift = env * 0.7 * wave;
        for (let c = 0; c < r.cols; c++) {
          const l0 = -hw + (c / r.cols) * hw * 2;
          const l1 = -hw + ((c + 1) / r.cols) * hw * 2;
          const w0 = Math.sin((c / r.cols) * Math.PI);
          const w1 = Math.sin(((c + 1) / r.cols) * Math.PI);
          _c.set(c < r.cols / 2 ? COLORS.red : COLORS.blue).lerp(_c2.set(0xffffff), 0.5).multiplyScalar(wave);
          at(s, l0, 0.05 + lift * (0.4 + 0.6 * w0), _v);
          P.setXYZ(q, _v.x, _v.y, _v.z);
          C.setXYZ(q++, _c.r, _c.g, _c.b);
          at(s, l1, 0.05 + lift * (0.4 + 0.6 * w1), _v);
          P.setXYZ(q, _v.x, _v.y, _v.z);
          C.setXYZ(q++, _c.r, _c.g, _c.b);
        }
      }
      P.needsUpdate = C.needsUpdate = true;
      r.mat.opacity = env * far;
    }
    // pools
    for (const pool of z.pools) this.drawPool(pool, at, lv, far);
    // the rift once it has opened: torn edges along both lips, lava glowing in the bottom of the tear
    if (z.lips && z.k > 0) {
      const [g0, g1] = z.shape.gap;
      const mid = (g0 + g1) / 2;
      const draw = (L, s, h, zig, color) => {
        const P = L.l.geometry.getAttribute('position');
        for (let k = 0; k < 24; k++) {
          const l0 = -hw + (k / 24) * hw * 2;
          const l1 = -hw + ((k + 1) / 24) * hw * 2;
          at(s + L.jit[k] * zig, l0, h + Math.abs(L.jit[(k + 7) % 26]) * 0.5, _p);
          at(s + L.jit[k + 1] * zig, l1, h + Math.abs(L.jit[(k + 8) % 26]) * 0.5, _q);
          P.setXYZ(k * 2, _p.x, _p.y, _p.z);
          P.setXYZ(k * 2 + 1, _q.x, _q.y, _q.z);
        }
        P.needsUpdate = true;
        L.l.material.opacity = z.k * far * color;
      };
      draw(z.lips[0], g0 - 1.2, 0.08, 1.6, 0.9);
      draw(z.lips[1], g1 + 0.6, 0.08, 1.6, 0.8);
      // the seam sits 7 m down in the V, and only glows while the lava is up (act 2 on, it always is)
      draw(z.seam, mid, -6.2, 2.2, (0.35 + 0.35 * Math.sin(t * 2.5)) * (0.3 + 0.7 * lv));
    }
  }

  drawPool(pool, at, lv, far) {
    const t = this.t;
    const on = pool.on;
    const vis = on > 0.01;
    for (const o of pool.meshes) o.visible = vis;
    if (!vis) return;
    // heat: full through RED and BOTH, cooled crust through BLUE
    const heat = lv;
    pool.ripMat.color.set(LAVA).lerp(_c.set(CRUST), 1 - heat);
    pool.ripMat.opacity = on * far * (0.1 + 0.25 * heat) * (0.75 + 0.25 * Math.sin(t * 2.6 + pool.s0));
    pool.rimMat.color.set(LAVA_HOT).lerp(_c.set(0x5a3048), 1 - heat);
    pool.rimMat.opacity = on * far * (0.12 + 0.33 * heat);
    // the sheet is plain glass, not additive: it can be a strong orange without blooming
    pool.fillMat.color.set(0xd04a10).lerp(_c.set(0x0a0408), 1 - heat);
    pool.fillMat.opacity = on * 0.85;
    const P = pool.rip.getAttribute('position');
    const F = pool.fill.getAttribute('position');
    const Rm = pool.rim.getAttribute('position');
    let q = 0;
    let f = 0;
    const len = pool.s1 - pool.s0;
    const bob = (s, l) => 0.07 + heat * (Math.sin(s * 0.9 + t * 2.4) * 0.05 + Math.sin(l * 1.3 - t * 1.9) * 0.05);
    for (let row = 0; row < pool.rows; row++) {
      const s = pool.s0 + (row / (pool.rows - 1)) * len;
      // the pool narrows toward its ends
      const w = Math.sin((row / (pool.rows - 1)) * Math.PI) ** 0.5;
      const mid = (pool.lat0 + pool.lat1) / 2;
      const half = ((pool.lat1 - pool.lat0) / 2) * (0.45 + 0.55 * w);
      for (let c = 0; c < pool.cols; c++) {
        const l0 = mid - half + (c / pool.cols) * half * 2;
        const l1 = mid - half + ((c + 1) / pool.cols) * half * 2;
        at(s, l0, bob(s, l0), _v);
        P.setXYZ(q++, _v.x, _v.y, _v.z);
        at(s, l1, bob(s, l1), _v);
        P.setXYZ(q++, _v.x, _v.y, _v.z);
      }
      if (row < pool.rows - 1) {
        const s2 = pool.s0 + ((row + 1) / (pool.rows - 1)) * len;
        const w2 = Math.sin(((row + 1) / (pool.rows - 1)) * Math.PI) ** 0.5;
        const half2 = ((pool.lat1 - pool.lat0) / 2) * (0.45 + 0.55 * w2);
        at(s, mid - half, 0.045, _p);
        at(s, mid + half, 0.045, _q);
        at(s2, mid - half2, 0.045, _v);
        at(s2, mid + half2, 0.045, _d);
        F.setXYZ(f++, _p.x, _p.y, _p.z);
        F.setXYZ(f++, _q.x, _q.y, _q.z);
        F.setXYZ(f++, _d.x, _d.y, _d.z);
        F.setXYZ(f++, _p.x, _p.y, _p.z);
        F.setXYZ(f++, _d.x, _d.y, _d.z);
        F.setXYZ(f++, _v.x, _v.y, _v.z);
      }
    }
    // the rim: around the outline, jittered, both sides then the ends
    let rq = 0;
    const J = pool.jit;
    const edge = (row, side) => {
      const s = pool.s0 + (row / (pool.rows - 1)) * len;
      const w = Math.sin((row / (pool.rows - 1)) * Math.PI) ** 0.5;
      const mid = (pool.lat0 + pool.lat1) / 2;
      const half = ((pool.lat1 - pool.lat0) / 2) * (0.45 + 0.55 * w);
      return at(s + J[(row * 2 + (side > 0 ? 1 : 0)) % J.length] * 0.6, mid + side * (half + 0.2 + J[(row * 2 + 1) % J.length] * 0.3), 0.08, _v).clone();
    };
    for (const side of [-1, 1]) {
      let prev = edge(0, side);
      for (let row = 1; row < pool.rows; row++) {
        const nx = edge(row, side);
        Rm.setXYZ(rq++, prev.x, prev.y, prev.z);
        Rm.setXYZ(rq++, nx.x, nx.y, nx.z);
        prev = nx;
      }
    }
    while (rq < pool.rimN * 2) {
      Rm.setXYZ(rq, _v.x, _v.y, _v.z);
      rq++;
    }
    P.needsUpdate = F.needsUpdate = Rm.needsUpdate = true;
  }

  // ------------------------------------------------------------------ act 1: loose rock
  dropRock(z) {
    const R = this.race;
    const W = R.world;
    const main = W.main;
    if (this.rubble.length >= 10) this.removeRock(this.rubble[0]);
    const s = 6 + Math.random() * (z.len - 12);
    const i = main.wrap(z.i0 + Math.round(s / main.ds));
    const lat = [-0.62, -0.22, 0.22, 0.62][Math.floor(Math.random() * 4)] * main.halfW;
    const mask = Math.random() < 0.5 ? M.R : M.B;
    const mats = W.layers.materials(mask);
    const r = 0.9 + Math.random() * 0.5;
    const geo = new THREE.IcosahedronGeometry(r, 0);
    const root = new THREE.Group();
    root.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), mats.wire), new THREE.Mesh(geo, mats.fill));
    // a hot seam through it, like the course's blocks
    root.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(r * 0.55)), mats.wire));
    main.point(i, lat, 0, _v);
    root.position.set(_v.x, _v.y + 38, _v.z);
    root.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    // the warning: a ring where it will land
    const ring = lines(circle(1, RING), mask === M.R ? COLORS.red : COLORS.blue);
    ring.position.copy(_v).y += 0.1;
    this.group.add(root, ring);
    const ob = { path: main, i, f: main.frac(i), lat, w: r, len: r, h: r * 1.8, mask, type: 'block', root, sweep: 0, phase: 0, baseLat: lat, rubble: true };
    this.rubble.push({ ob, root, ring, t: 0, fall: 0.95, r, mask, z, s, lat, landed: false, spin: { x: 2 + Math.random() * 3, y: 1 + Math.random() * 3 } });
  }

  removeRock(rk) {
    const W = this.race.world;
    const k = this.rubble.indexOf(rk);
    if (k >= 0) this.rubble.splice(k, 1);
    const o = W.obstacles.indexOf(rk.ob);
    if (o >= 0) W.obstacles.splice(o, 1);
    this.group.remove(rk.root, rk.ring);
    rk.root.traverse((q) => q.geometry?.dispose());
    rk.ring.geometry.dispose();
    // Race.smash will turn this root back on in a while: give it one that isn't in the scene
    rk.ob.root = new THREE.Group();
  }

  updateRubble(dt, viewer) {
    const R = this.race;
    const main = R.world.main;
    for (let k = this.rubble.length - 1; k >= 0; k--) {
      const rk = this.rubble[k];
      rk.t += dt;
      const seen = solidIn(rk.mask, viewer.mode);
      rk.root.visible = seen && !rk.ob.broken;
      main.point(rk.ob.i, rk.lat, 0, _v);
      if (!rk.landed) {
        const f = Math.min(1, rk.t / rk.fall);
        rk.root.position.set(_v.x, _v.y + 38 * (1 - f * f) + rk.r * 0.8, _v.z);
        rk.root.rotation.x += rk.spin.x * dt;
        rk.root.rotation.y += rk.spin.y * dt;
        rk.ring.visible = seen;
        rk.ring.scale.setScalar(rk.r * (1.2 + 2.5 * (1 - f)));
        rk.ring.material.opacity = 0.4 + 0.6 * f;
        if (f >= 1) this.landRock(rk);
        continue;
      }
      // settled: it sits on the road (the road may move under it on lap 3) and the ring fades
      rk.root.position.set(_v.x, _v.y + rk.r * 0.8, _v.z);
      rk.ring.material.opacity = Math.max(0, 1 - (rk.t - rk.fall) / 0.6);
      rk.ring.visible = rk.ring.material.opacity > 0 && seen;
      rk.ring.scale.setScalar(rk.r * (1.2 + (rk.t - rk.fall) * 6));
      // smashed: gone for good
      if (rk.ob.broken) this.removeRock(rk);
    }
  }

  landRock(rk) {
    const R = this.race;
    const main = R.world.main;
    rk.landed = true;
    R.world.obstacles.push(rk.ob);
    const at = rk.root.position;
    const near = R.players.some((p) => p.pos.distanceToSquared(at) < 200 * 200);
    if (near) {
      // dust and a few hot chips
      R.debris.sparks(at, _d.set(0, 0.3, 0), 26, 0x9a8ab0, 9, main.py[rk.ob.i]);
      R.debris.sparks(at, _d.set(0, 0.5, 0), 8, rk.mask === M.R ? 0xff6a7a : 0x6ac8ff, 14, main.py[rk.ob.i]);
      R.app.audio.play('land', 14);
      for (const p of R.players) {
        const d = p.pos.distanceTo(at);
        if (d < 60) R.camOf(p).addShake(0.5 * (1 - d / 60));
      }
    }
    // anyone under it is knocked about (not wrecked: on lap 1 the quake only warns)
    for (const r of R.racers) {
      if (r.respawnT > 0 || !solidIn(rk.mask, r.mode)) continue;
      const d2 = (r.pos.x - at.x) ** 2 + (r.pos.z - at.z) ** 2;
      if (d2 < (rk.r + 1.6) ** 2 && Math.abs(r.pos.y - at.y) < 4) {
        if (r.spinOut(0.7, Math.random() < 0.5 ? -1 : 1)) r.vel.multiplyScalar(0.6);
        R.scrape(r, 12, _d.set(r.pos.x - at.x, 0, r.pos.z - at.z).normalize());
        if (r.isPlayer) {
          R.emitP(r, 'popup', { text: 'ROCKFALL', color: '#e8dcff', small: true });
          R.camOf(r).addShake(0.8);
        }
      }
    }
  }

  // ------------------------------------------------------------------ act 2: lava
  // Is a racer in a pool that is there in its lens? (and the AI's questions: a pool ahead in lens m; a lane cost)
  inPool(r) {
    const tr = r.track;
    if (!tr || tr.path !== this.race.world.main || r.mode === BLUE) return null;
    for (const z of this.zones) for (const pool of z.pools) {
      if (pool.on < 0.5) continue;
      const s = this.sIn(z, tr.i);
      if (s < pool.s0 || s > pool.s1) continue;
      const w = Math.sin(((s - pool.s0) / (pool.s1 - pool.s0)) * Math.PI) ** 0.5;
      const mid = (pool.lat0 + pool.lat1) / 2;
      const half = ((pool.lat1 - pool.lat0) / 2) * (0.45 + 0.55 * w);
      if (tr.lat > mid - half - 0.3 && tr.lat < mid + half + 0.3) return pool;
    }
    return null;
  }
  // metres into zone z of main sample i (negative before it)
  sIn(z, i) {
    const main = this.race.world.main;
    let d = i - z.i0;
    if (d > main.N / 2) d -= main.N;
    if (d < -main.N / 2) d += main.N;
    return d * main.ds;
  }
  // The AI: is there lava within `look` metres ahead that is there in lens m?
  threat(r, m, look = 60) {
    if (this.act < 2 || m === BLUE) return false;
    const tr = r.track;
    if (!tr || tr.path !== this.race.world.main) return false;
    for (const z of this.zones) {
      const s = this.sIn(z, tr.i);
      for (const pool of z.pools) if (pool.on > 0 && pool.s1 > s && pool.s0 < s + look) return true;
    }
    return false;
  }
  // The AI: how many pools the lane at `lat` runs through in the next `look` metres (in lens m).
  laneCost(r, m, lat, look = 60) {
    if (this.act < 2 || m === BLUE) return 0;
    const tr = r.track;
    if (!tr || tr.path !== this.race.world.main) return 0;
    let c = 0;
    for (const z of this.zones) {
      const s = this.sIn(z, tr.i);
      for (const pool of z.pools) {
        if (!(pool.on > 0 && pool.s1 > s && pool.s0 < s + look)) continue;
        const mid = (pool.lat0 + pool.lat1) / 2;
        const half = (pool.lat1 - pool.lat0) / 2;
        if (lat > mid - half - 1 && lat < mid + half + 1) c++;
      }
    }
    return c;
  }

  lava(dt) {
    const R = this.race;
    const main = R.world.main;
    // pools come up over a couple of seconds after the eruption, each with a spit of embers
    for (const z of this.zones) for (const pool of z.pools) {
      if (pool.on < 1) {
        pool.on = Math.min(1, pool.on + dt / 2.2);
        if (pool.on < 0.6 && Math.random() < 0.35 && R.near(R.player)) {
          const s = pool.s0 + Math.random() * (pool.s1 - pool.s0);
          const i = main.wrap(z.i0 + Math.round(s / main.ds));
          main.point(i, pool.lat0 + Math.random() * (pool.lat1 - pool.lat0), 0.1, _v);
          if (R.player.pos.distanceToSquared(_v) < 220 * 220) R.debris.sparks(_v, _d.set(0, 1, 0), 3, LAVA_HOT, 12, _v.y - 0.1);
        }
      }
    }
    for (const r of R.racers) {
      if (r.respawnT > 0 || r.puppet) continue;
      const pool = r.grounded ? this.inPool(r) : null;
      if (!pool) {
        r.lavaT = Math.max(0, (r.lavaT || 0) - dt * 2);
        continue;
      }
      // dragged down and cooking
      r.vel.multiplyScalar(Math.max(0, 1 - 2.4 * dt));
      r.lavaT = (r.lavaT || 0) + dt;
      if (R.near(r) && Math.random() < 0.7) R.debris.sparks(r.pos, _d.set(0, 1.2, 0), 4, Math.random() < 0.5 ? LAVA : LAVA_HOT, 10, r.gnd.y);
      if (r.isPlayer) {
        R.camOf(r).addShake(1.2 * dt);
        if (r.lavaT < dt * 1.5) {
          R.emitP(r, 'popup', { text: 'LAVA · SHIFT TO BLUE', color: '#ff7a2a', small: true });
          R.app.audio.play('scrape');
        }
      }
      if (r.lavaT > 1.0) {
        if (r.isPlayer) R.emitP(r, 'popup', { text: 'BURNED', color: '#ff7a2a' });
        r.lavaT = 0;
        R.wreck(r, null);
      }
    }
    // the volcanoes aim at anyone not in blue, every few seconds
    if (R.state === 'race') {
      const every = this.act >= 3 ? 3.2 : 4.0;
      for (const r of R.racers) {
        if (r.puppet || r.respawnT > 0 || r.finished) continue;
        r.bombT = (r.bombT ?? 1.5 + Math.random() * every) - dt;
        if (r.bombT > 0) continue;
        r.bombT = every * (0.7 + Math.random() * 0.6);
        if (r.mode === BLUE) continue;
        this.launch(r);
      }
    }
  }

  updateVolcanoes(dt) {
    const R = this.race;
    const t = this.t;
    for (const [k, V] of this.volcanoes.entries()) {
      const glow = 0.5 + 0.5 * Math.sin(t * 2.2 + k * 2);
      V.crater.material.opacity = 0.5 + 0.5 * glow;
      V.crater.material.color.set(LAVA).lerp(_c.set(LAVA_HOT), glow);
      V.crater.scale.setScalar(1 + 0.08 * glow);
      V.body.material.opacity = 0.55 + 0.3 * glow;
      // embers out of the crater while anyone's close enough to see them
      const d2 = Math.min(...R.players.map((p) => (p.pos.x - V.x) ** 2 + (p.pos.z - V.z) ** 2));
      if (d2 < 520 * 520 && Math.random() < 0.6) {
        _v.set(V.x + (Math.random() - 0.5) * V.Rc, V.top, V.z + (Math.random() - 0.5) * V.Rc);
        R.debris.sparks(_v, _d.set(0, 3, 0), 3, Math.random() < 0.5 ? LAVA : LAVA_HOT, 20, V.top - 2);
      }
    }
  }

  // A lava bomb: from the nearest crater to where the racer will be, a 1.7 s arc, rings closing on the spot.
  launch(r) {
    const R = this.race;
    if (this.bombs.length > 12 || !this.volcanoes.length) return;
    const T = 1.7;
    const at = _v.copy(r.pos).addScaledVector(r.vel, T * (0.8 + Math.random() * 0.4));
    at.x += (Math.random() - 0.5) * 12;
    at.z += (Math.random() - 0.5) * 12;
    const g = R.world.ground(at.x, r.pos.y + 4, at.z, {}, BOTH);
    const y = g.onRoad ? g.y : r.pos.y;
    let V = this.volcanoes[0];
    for (const q of this.volcanoes) if ((q.x - at.x) ** 2 + (q.z - at.z) ** 2 < (V.x - at.x) ** 2 + (V.z - at.z) ** 2) V = q;
    const fx = new THREE.Group();
    fx.position.set(at.x, y + 0.12, at.z);
    const rings = [0, 1, 2].map(() => lines(circle(1, RING), LAVA));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: LAVA, ...ADD, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2;
    disc.renderOrder = 5;
    const wave = lines(circle(1, 40), LAVA_HOT);
    wave.visible = false;
    const scorch = lines(circle(2.6, 18, 0.4).concat(circle(1.4, 12, 0.6)), LAVA);
    scorch.visible = false;
    fx.add(...rings, disc, wave, scorch);
    const ico = new THREE.IcosahedronGeometry(1.5, 0);
    const rock = new THREE.Group();
    rock.add(new THREE.Mesh(ico, new THREE.MeshBasicMaterial({ color: LAVA, opacity: 0.6, ...ADD })), new THREE.LineSegments(new THREE.EdgesGeometry(ico), new THREE.LineBasicMaterial({ color: 0xfff0c8, ...ADD })));
    const trail = lines(new Array(5 * 6).fill(0), LAVA);
    this.group.add(fx, rock, trail);
    this.bombs.push({ t: 0, T, x: at.x, y, z: at.z, src: V, fx, rings, disc, wave, scorch, rock, trail, hit: false, h: 70 + Math.random() * 40, radius: 5 });
  }

  updateBombs(dt, viewer) {
    const R = this.race;
    const seen = viewer.mode !== BLUE;
    for (let k = this.bombs.length - 1; k >= 0; k--) {
      const b = this.bombs[k];
      b.t += dt;
      b.fx.visible = b.rock.visible = b.trail.visible = seen;
      const f = Math.min(1, b.t / b.T);
      const warn = b.t < b.T;
      for (const rg of b.rings) rg.visible = warn;
      b.disc.visible = warn;
      if (warn) {
        const pulse = 0.65 + 0.35 * Math.sin(b.t * (12 + 24 * f));
        b.rings.forEach((rg, n) => {
          rg.scale.setScalar(b.radius * (1 + (1 - f) * (0.9 + n * 0.5)));
          rg.material.opacity = (0.5 + 0.5 * f) * pulse * (1 - n * 0.2);
        });
        b.disc.scale.setScalar(b.radius * (0.15 + 0.85 * f));
        b.disc.material.opacity = 0.12 + 0.5 * f * f;
        // the arc from the crater
        const u = f;
        const x = b.src.x + (b.x - b.src.x) * u;
        const z = b.src.z + (b.z - b.src.z) * u;
        const y = b.src.top + (b.y - b.src.top) * u + 4 * b.h * u * (1 - u);
        b.rock.position.set(x, y, z);
        b.rock.rotation.x += dt * 6;
        b.rock.rotation.y += dt * 4;
        const P = b.trail.geometry.getAttribute('position');
        for (let i = 0; i < 5; i++) {
          const u0 = Math.max(0, u - i * 0.03);
          const u1 = Math.max(0, u - (i + 1) * 0.03);
          const o = (i - 2) * 0.5;
          P.setXYZ(i * 2, b.src.x + (b.x - b.src.x) * u0 + o, b.src.top + (b.y - b.src.top) * u0 + 4 * b.h * u0 * (1 - u0), b.src.z + (b.z - b.src.z) * u0 - o);
          P.setXYZ(i * 2 + 1, b.src.x + (b.x - b.src.x) * u1 + o, b.src.top + (b.y - b.src.top) * u1 + 4 * b.h * u1 * (1 - u1), b.src.z + (b.z - b.src.z) * u1 - o);
        }
        P.needsUpdate = true;
        if (seen && Math.random() < 0.6 && R.near({ pos: b.rock.position })) R.debris.sparks(b.rock.position, _d.set(0, 0.4, 0), 2, LAVA_HOT, 6, b.y);
      } else {
        b.rock.visible = b.trail.visible = false;
      }
      if (!b.hit && b.t >= b.T) {
        b.hit = true;
        this.landBomb(b, seen);
      }
      if (b.hit) {
        const a = b.t - b.T;
        b.wave.visible = a < 0.55;
        b.wave.scale.setScalar(b.radius * (0.4 + a * 7));
        b.wave.material.opacity = Math.max(0, 1 - a / 0.55);
        b.scorch.visible = true;
        b.scorch.material.opacity = Math.max(0, 1 - a / 4) * (0.7 + 0.3 * Math.sin(a * 30) * Math.max(0, 1 - a));
      }
      if (b.t > b.T + 4) {
        this.group.remove(b.fx, b.rock, b.trail);
        for (const o of [b.fx, b.rock, b.trail]) o.traverse((q) => q.geometry?.dispose());
        this.bombs.splice(k, 1);
      }
    }
  }

  landBomb(b, seen) {
    const R = this.race;
    const at = _v.set(b.x, b.y, b.z);
    const near = R.players.some((p) => p.pos.distanceToSquared(at) < 160 * 160);
    if (seen && near) {
      R.debris.sparks(at, _d.set(0, 0, 0), 60, LAVA_HOT, 30, b.y);
      b.rock.position.set(b.x, b.y + 1, b.z);
      b.rock.visible = true;
      R.debris.burst(b.rock, _d.set(0, 7, 0), 18, b.y, 1, 2.2);
      b.rock.visible = false;
      R.app.audio.play('meteor');
      for (const p of R.players) {
        const d = p.pos.distanceTo(at);
        if (d < 70) {
          R.camOf(p).fovPunch(6);
          R.camOf(p).addShake(0.5 * (1 - d / 70));
        }
      }
    }
    for (const r of R.racers) {
      if (r.respawnT > 0 || r.mode === BLUE) continue;
      const d2 = (r.pos.x - b.x) ** 2 + (r.pos.z - b.z) ** 2;
      if (Math.abs(r.pos.y - b.y) > 6) continue;
      if (d2 < 2.6 ** 2) {
        if (r.isPlayer) R.emitP(r, 'popup', { text: 'LAVA BOMB', color: '#ff7a2a' });
        R.wreck(r, null);
      } else if (d2 < b.radius ** 2) {
        if (r.spinOut(0.8, Math.random() < 0.5 ? -1 : 1)) r.vel.multiplyScalar(0.55);
        R.scrape(r, 14, _d.set(r.pos.x - b.x, 0, r.pos.z - b.z).normalize());
        if (r.isPlayer) {
          R.emitP(r, 'popup', { text: 'LAVA BOMB', color: '#ff7a2a', small: true });
          R.camOf(r).addShake(0.9);
        }
      }
    }
  }

  // ------------------------------------------------------------------ act 3: the plates
  // A zone is clear when nobody is on it or about to be (the road under a car shouldn't drop out from under it).
  clear(z) {
    const main = this.race.world.main;
    return this.race.racers.every((r) => {
      if (r.respawnT > 0) return true;
      let d = r.lastU - z.u0;
      if (d > 0.5) d -= 1;
      if (d < -0.5) d += 1;
      const m = d * main.length;
      return m < -45 || m > z.len + EXT + 10;
    });
  }

  split(z, dt) {
    const R = this.race;
    const main = R.world.main;
    const S = z.splitting;
    if (S.t < 0) {
      // staggered start, and wait for the plate to be clear (not forever)
      S.t += dt;
      if (S.t >= 0) S.t = 0;
      else return;
    }
    if (S.t === 0 && !S.go) {
      S.waited += dt;
      if (!this.clear(z) && S.waited < 9) return;
      S.go = true;
      S.t = 1e-6;
      if (R.near({ pos: main.point(z.i0 + Math.floor(z.n / 2), 0, 0, _v) })) R.app.audio.play('crack');
    }
    S.t += dt;
    const k = smoothstep(0, 1, Math.min(1, S.t / SPLIT_T));
    this.setPlate(z, k);
    // while it moves: the ground shakes, the tear throws the road's own lines and dust
    for (const p of R.players) R.camOf(p).addShake(2.5 * dt * (1 - k * 0.5));
    if (k < 1 && R.near({ pos: main.point(z.i0 + Math.floor(z.n / 2), 0, 0, _v) })) {
      const gap = z.shape.gap;
      for (let q = 0; q < 3; q++) {
        // along the lips and the tear line, scraps of road lines and grey dust
        const s = gap ? gap[Math.random() < 0.5 ? 0 : 1] + (Math.random() - 0.5) * 4 : Math.random() * z.len;
        const i = main.wrap(z.i0 + Math.round(s / main.ds));
        const lat = (Math.random() - 0.5) * 2 * main.halfW;
        main.point(i, lat, 0.2, _p);
        _q.copy(_p);
        _q.x += (Math.random() - 0.5) * 2;
        _q.z += (Math.random() - 0.5) * 2;
        _c.set(Math.random() < 0.5 ? COLORS.red : COLORS.blue);
        R.debris.add(_p, _q, { x: (Math.random() - 0.5) * 6, y: 6 + Math.random() * 8, z: (Math.random() - 0.5) * 6 }, _c, 1.6 + Math.random(), _p.y - 1, 7);
        R.debris.sparks(_p, _d.set(0, 1, 0), 2, 0x9a8ab0, 6, _p.y - 0.2);
      }
    }
    if (k >= 1) {
      z.splitting = null;
      // the gap is open: no road there in any world
      if (z.shape.gap) {
        const [g0, g1] = z.shape.gap;
        for (let s = g0; s < g1; s += main.ds) main.mask[main.wrap(z.i0 + Math.round(s / main.ds))] = 0;
      }
      for (const pl of R.players) R.camOf(pl).addShake(0.6);
      R.app.audio.play('land', 16);
    }
  }

  // Move a plate to fraction k of its shape: the path's heights and bank, and every captured road vertex.
  setPlate(z, k) {
    const main = this.race.world.main;
    z.k = k;
    const gap = z.shape.gap;
    for (let q = 0; q < z.span; q++) {
      const i = main.wrap(z.i0 + q);
      main.py[i] = z.base[q] + z.dy[q] * k;
      main.tb[i] = z.baseTb[q] + z.dtb[q] * k;
    }
    main.reshape([]);
    main.minY = Math.min(main.minY, ...main.py);
    main.maxY = Math.max(main.maxY, ...main.py);
    // the baked lines follow: a height for the plate, and the gap's own strip pulls back into the lips
    const kg = gap ? [Math.round(gap[0] / main.ds), Math.round(gap[1] / main.ds)] : null;
    for (const V of z.verts) {
      const L = V.list;
      const P = V.P;
      for (let q = 0; q < L.length; q += 4) {
        const v = L[q];
        let kk = L[q + 1];
        const lat = L[q + 2];
        const y0 = L[q + 3];
        if (kg && kk >= kg[0] && kk < kg[1]) {
          // inside the gap: the strip sinks to a line down the middle of the tear, so the two lips slope in to
          // meet it (a V-shaped rift), and vanishes as a road
          const a = main.wrap(z.i0 + kk);
          const mid = main.wrap(z.i0 + Math.floor((kg[0] + kg[1]) / 2));
          const x = (main.px[a] + main.rightX(a) * lat) * (1 - k) + (main.px[mid] + main.rightX(mid) * lat) * k;
          const zz = (main.pz[a] + main.rightZ(a) * lat) * (1 - k) + (main.pz[mid] + main.rightZ(mid) * lat) * k;
          P.setX(v, x);
          P.setZ(v, zz);
          P.setY(v, y0 + (z.dy[kg[0] - 1] - 7) * k);
          continue;
        }
        P.setY(v, y0 + z.dy[kk] * k + z.dtb[kk] * k * lat);
      }
      P.needsUpdate = true;
    }
  }
}
