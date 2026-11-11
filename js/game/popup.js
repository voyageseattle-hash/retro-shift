// PAGE TURNER (world/tracks-popup.js): the pop-up book. One road, three spreads, one per lap.
//
//   THE FLIP       At the bottom of the book the road dives into the gutter, up the spine, round a hairpin and
//                  back: the GUTTER ROAD, the slow way. Just before it the lip of the page stands up across the
//                  road on a beat (it twitches first). Reach it while it's up and it flings you clean over the
//                  gutter; catch it just as it snaps up and it's a PERFECT FLIP. Miss it and you drive the gutter.
//   THE PAGE TURN  Every racer reads at their own pace: your page turns as you pass the lip, in the air or not.
//                  The right-hand leaf lifts behind you, swings over the top and comes down on the left page ahead of you. The old spread's pop-ups fold flat under it and
//                  the new spread's stand up: the right page as the leaf uncovers it, the left page as it lands.
//   THE PRINTING   The pictures are printed in red and blue, like an old 3-D comic. Each lens shows one printing
//                  and hides the other, on the paper as well as in the pop-ups.
//   Spread 1  THE CITY     pop-up buildings stand half across the road (red and blue), and pull tabs slide a bus
//                          from one lane to the other on a beat.
//   Spread 2  THE SEA      stretches of the road are under water: BLUE skims it, wheels bog down. Red paper waves
//                          stand up across the road on a beat and red fins cut through the water; blue icebergs
//                          wait where the water ends.
//   Spread 3  THE VOLCANO  sheets of red lava and banks of blue steam fold up across the road turn about, on a
//                          beat: read the next one and pick the lens, or time it in BOTH.
//
// Everything that moves runs on the race clock, the same every race, and twitches before it stands up. The pieces
// are ordinary obstacle records with a `page`: Race.features and the rivals' AI skip the ones that aren't on a
// racer's own page (offPage). Works online and in split-screen (each view keeps its own page).

import * as THREE from '../../vendor/three.js';
import { M, RED, BLUE, COLORS } from '../world/shift.js';
import { BOOK, pageY, SPREADS } from '../world/tracks-popup.js';
import { Path } from '../world/track.js';
import * as S from '../world/popupshapes.js';
import { FORMS } from '../vehicles/forms.js';
import { mulberry32, smoothstep, clamp } from '../core/util.js';

const W = BOOK.W;
const D = BOOK.D;
const PAPER_DROP = 0.8; // the paper lies this far under the road
const PY = (bx) => pageY(bx) - PAPER_DROP;
const TURN = 2.7; // seconds the leaf takes to come over
const SOLID_AFTER = 3.3; // a new page's late pieces go solid for you this long after your page turns
const BEAT = 3.2; // seconds: one stand-and-fold of a flap, one there-and-back of a pull tab
const YELLOW = 0xffd04a;
const LIP_UP = 0.47; // the part of each beat the lip of THE FLIP stands
const LIP_PERFECT = 0.45; // seconds after it snaps up that a catch is a PERFECT FLIP
const G_AIR = 27; // racer.js
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const HALF_PI = Math.PI / 2;

// the race clock, for offPage (set every update)
let NOW = 0;
// Is this obstacle off this racer's page (or folded flat, or not stood up for them yet)? True: it isn't there.
export const offPage = (o, r) => o.page !== undefined && (o.page !== (r.page || 0) || o.down || (o.late && NOW < (r.pageSolidAt || 0)));

const easeOutBack = (x) => {
  const c = 1.9;
  const y = clamp(x, 0, 1) - 1;
  return 1 + (c + 1) * y * y * y + c * y * y;
};

// ------------------------------------------------------------------ the printing
// One canvas per spread per plate (red, blue), covering both pages: left page on the left half.
const CW = 1024;
const CH = Math.round((CW * D) / (2 * W));
const X = (bx) => ((bx + W) / (2 * W)) * CW;
const Y = (bz) => (1 - (bz + D / 2) / D) * CH;
const PX = CW / (2 * W); // pixels per metre

const STORY = [
  ['THE CITY', 'Once upon a bedtime the city stood up out of the page,', 'and every street had a red side and a blue side.'],
  ['THE SEA', 'Turn the page, and the streets were gone under paper waves.', 'Only the blue boats knew the way across.'],
  ['THE VOLCANO', 'Turn it again, and the mountain woke up cross.', 'Red fire, blue steam, and one road between them.'],
];

function drawPrint(idx, plate, paths) {
  const c = document.createElement('canvas');
  c.width = CW;
  c.height = CH;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, CW, CH);
  const rng = mulberry32(1900 + idx * 17 + (plate === 'r' ? 0 : 5));
  const red = plate === 'r';
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const line = (pts, w = 1.5, a = 0.6) => {
    g.globalAlpha = a;
    g.lineWidth = w;
    g.beginPath();
    pts.forEach(([bx, bz], k) => (k ? g.lineTo(X(bx), Y(bz)) : g.moveTo(X(bx), Y(bz))));
    g.stroke();
  };
  const circle = (bx, bz, r, w = 1.5, a = 0.6) => {
    g.globalAlpha = a;
    g.lineWidth = w;
    g.beginPath();
    g.arc(X(bx), Y(bz), r * PX, 0, Math.PI * 2);
    g.stroke();
  };
  // the picture is clipped to the two pages' frames
  g.save();
  g.beginPath();
  for (const s of [-1, 1]) g.rect(X(s > 0 ? 16 : -W + 16), Y(D / 2 - 16), (W - 32) * PX, (D - 32) * PX);
  g.clip();
  if (idx === 0) {
    // THE CITY: blue streets, red blocks
    if (!red) {
      for (let bx = -W; bx <= W; bx += 34) line([[bx + 7, -D / 2], [bx + 7, D / 2]], 1.2, 0.45);
      for (let bz = -D / 2; bz <= D / 2; bz += 34) line([[-W, bz + 9], [W, bz + 9]], 1.2, 0.45);
      line([[-W, -200], [-40, 120], [W, 250]], 3, 0.5);
      for (let k = 0; k < 9; k++) circle(-150 + (rng() - 0.5) * 60, -20 + (rng() - 0.5) * 60, 3 + rng() * 4, 1.2, 0.5);
    } else {
      for (let bx = -W + 12; bx < W; bx += 34) {
        for (let bz = -D / 2 + 14; bz < D / 2; bz += 34) {
          if (rng() < 0.35) continue;
          const w = 10 + rng() * 14;
          const h = 10 + rng() * 14;
          g.globalAlpha = 0.5;
          g.lineWidth = 1.4;
          g.strokeRect(X(bx), Y(bz + h), w * PX, h * PX);
          if (rng() < 0.5) line([[bx, bz], [bx + w, bz + h]], 1, 0.35);
        }
      }
    }
  } else if (idx === 1) {
    // THE SEA: blue swell, red fish and a compass rose
    if (!red) {
      for (let bz = -D / 2 + 10; bz < D / 2; bz += 20) {
        const pts = [];
        for (let bx = -W; bx <= W; bx += 6) pts.push([bx, bz + Math.sin(bx * 0.09 + bz * 0.5) * 3.2]);
        line(pts, 1.3, 0.5);
      }
    } else {
      for (let k = 0; k < 26; k++) {
        const bx = (rng() * 2 - 1) * (W - 30);
        const bz = (rng() - 0.5) * (D - 60);
        const s = 5 + rng() * 6;
        const d = rng() < 0.5 ? -1 : 1;
        line([[bx - s * d, bz], [bx, bz + s * 0.45], [bx + s * d, bz], [bx, bz - s * 0.45], [bx - s * d, bz], [bx - s * 1.5 * d, bz + s * 0.5], [bx - s * 1.5 * d, bz - s * 0.5], [bx - s * d, bz]], 1.3, 0.5);
      }
      for (const [bx, bz] of [[-150, 40], [130, -60]]) {
        circle(bx, bz, 30, 1.5, 0.5);
        circle(bx, bz, 24, 1, 0.4);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const r = k % 2 ? 22 : 40;
          line([[bx, bz], [bx + Math.cos(a) * r, bz + Math.sin(a) * r]], 1.2, 0.5);
        }
      }
    }
  } else {
    // THE VOLCANO: red contours and lava rivers, blue steam and ash
    const craters = [[-140, 20], [120, 70]];
    if (red) {
      for (const [bx, bz] of craters) {
        for (let r = 12; r < 150; r += 13) {
          const pts = [];
          for (let k = 0; k <= 40; k++) {
            const a = (k / 40) * Math.PI * 2;
            const rr = r * (1 + 0.1 * Math.sin(a * 5 + r) + 0.06 * Math.sin(a * 11 + r * 0.3));
            pts.push([bx + Math.cos(a) * rr, bz + Math.sin(a) * rr]);
          }
          line(pts, 1.2, 0.2 + 0.35 * (1 - r / 150));
        }
        for (let k = 0; k < 7; k++) {
          const a = rng() * Math.PI * 2;
          const pts = [];
          for (let r = 8; r < 190; r += 12) pts.push([bx + Math.cos(a + Math.sin(r * 0.05 + k) * 0.25) * r, bz + Math.sin(a + Math.sin(r * 0.05 + k) * 0.25) * r]);
          line(pts, 2.4, 0.55);
        }
      }
    } else {
      for (let k = 0; k < 16; k++) {
        const bx = (rng() * 2 - 1) * (W - 40);
        const bz = (rng() - 0.5) * (D - 80);
        const pts = [];
        for (let q = 0; q < 26; q++) pts.push([bx + Math.cos(q * 0.55) * q * 0.7, bz + Math.sin(q * 0.55) * q * 0.7]);
        line(pts, 1.3, 0.5);
      }
      g.globalAlpha = 0.5;
      for (let k = 0; k < 500; k++) g.fillRect(rng() * CW, rng() * CH, 1.6, 1.6);
    }
  }
  // nothing is printed where the road is cut through the page
  g.globalAlpha = 1;
  g.strokeStyle = '#000';
  for (const p of paths) {
    g.lineWidth = (p.halfW * 2 + 10) * PX;
    g.beginPath();
    for (let i = 0; i < p.N; i += 2) (i ? g.lineTo(X(-p.px[i]), Y(p.pz[i])) : g.moveTo(X(-p.px[i]), Y(p.pz[i])));
    if (p.closed) g.closePath();
    g.stroke();
  }
  g.restore();
  g.strokeStyle = '#fff';
  // each page's frame, its number, and the words (both plates, a hair apart: the fringe of a 3-D comic)
  const off = red ? -1.5 : 1.5;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 12 : -W + 12;
    g.globalAlpha = 0.75;
    g.lineWidth = 2.5;
    g.strokeRect(X(x0) + off, Y(D / 2 - 12), (W - 24) * PX, (D - 24) * PX);
    g.globalAlpha = 0.4;
    g.lineWidth = 1;
    g.strokeRect(X(x0 + 4) + off, Y(D / 2 - 16), (W - 32) * PX, (D - 32) * PX);
    g.globalAlpha = 0.8;
    g.font = 'italic 20px Georgia, serif';
    g.textAlign = 'center';
    g.fillText(String(idx * 2 + (s > 0 ? 2 : 1)), X(s * (W - 34)) + off, Y(-D / 2 + 24));
  }
  const [title, l1, l2] = STORY[idx];
  g.textAlign = 'center';
  g.globalAlpha = 0.9;
  g.font = 'bold 54px Georgia, serif';
  g.fillText(title, X(-150) + off * 2, Y(D / 2 - 62));
  g.globalAlpha = 0.75;
  g.font = 'italic 17px Georgia, serif';
  g.fillText(l1, X(150) + off, Y(D / 2 - 44));
  g.fillText(l2, X(150) + off, Y(D / 2 - 62));
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

// A sheet of paper between bx = x0 and x1 (0 at the spine), in world space or in the leaf's own space.
function sheet(x0, x1, uOf, leaf = false) {
  const nx = 26;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let k = 0; k <= nx; k++) {
    const bx = x0 + ((x1 - x0) * k) / nx;
    for (const bz of [-D / 2, D / 2]) {
      if (leaf) pos.push(bx, pageY(bx), -bz);
      else pos.push(-bx, PY(bx), bz);
      uv.push(uOf(bx), (bz + D / 2) / D);
    }
    if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class PopupBook {
  constructor(race) {
    this.race = race;
    this.group = new THREE.Group();
    this.on = !!race.def.popup;
    if (!this.on) return;
    const world = race.world;
    this.main = world.main;
    this.flipU = race.def.flipAt;
    this.flipI = this.main.index(this.flipU);
    this.rng = mulberry32(race.def.seed || 19);
    this.pieces = []; // every pop-up: { page, left, d, r, h, root, flaps, ob?, kind?, ... }
    this.water = []; // THE SEA's water: { i0, n }
    this.views = [0, 1].map(() => ({ page: 0, from: 0, s: 9, landed: true }));
    this.buildPaper(world);
    this.buildLeaf();
    for (let p = 0; p < 3; p++) this.buildSpread(p, world);
    this.buildWater(world);
    this.buildLip(world);
    for (const r of race.racers || []) r.page = 0;
  }

  // ---------------------------------------------------------------- paper, printing, the turning leaf
  buildPaper(world) {
    this.tex = [0, 1, 2].map((i) => ({ r: drawPrint(i, 'r', world.paths), b: drawPrint(i, 'b', world.paths) }));
    const paper = new THREE.MeshBasicMaterial({ color: 0x0c0818, side: THREE.DoubleSide });
    const plate = (c) => new THREE.MeshBasicMaterial({ color: c, map: this.tex[0].r, side: THREE.DoubleSide, ...ADD });
    const u = (bx) => (bx + W) / (2 * W);
    const mk = (geo, mat, y = 0, order = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.renderOrder = order;
      m.frustumCulled = false;
      return m;
    };
    // the two pages lying open
    this.base = {};
    for (const [key, x0, x1] of [['L', -W, 0], ['R', 0, W]]) {
      const geo = sheet(x0, x1, u);
      const r = plate(COLORS.red);
      const b = plate(COLORS.blue);
      this.group.add(mk(geo, paper), mk(geo, r, 0.06, 1), mk(geo, b, 0.07, 1));
      this.base[key] = { r, b };
    }
    this.paper = paper;
    this.plate = plate;
    this.mk = mk;
  }

  buildLeaf() {
    // In the leaf's own space the page runs out along +x from the hinge; turned round so that is the right page.
    const outer = new THREE.Group();
    outer.position.set(0, PY(0) + 0.3, 0);
    outer.rotation.y = Math.PI;
    const hinge = new THREE.Group();
    outer.add(hinge);
    const geoTop = sheet(0, W, (bx) => 0.5 + bx / (2 * W), true); // the old right page, on its back
    const geoUnder = sheet(0, W, (bx) => 0.5 - bx / (2 * W), true); // the new left page, on its underside
    const top = { r: this.plate(COLORS.red), b: this.plate(COLORS.blue) };
    const under = { r: this.plate(COLORS.red), b: this.plate(COLORS.blue) };
    // the bright edge of the leaf, and a few ruled lines so it reads as a sheet edge-on
    const e = [];
    for (let k = 0; k < 26; k++) {
      const a = (W * k) / 26;
      const b = (W * (k + 1)) / 26;
      for (const z of [-D / 2, D / 2]) e.push(a, pageY(a), z, b, pageY(b), z);
    }
    for (const x of [W, W * 0.66, W * 0.33]) e.push(x, pageY(x), -D / 2, x, pageY(x), D / 2);
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(e, 3));
    const edge = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: new THREE.Color(YELLOW).multiplyScalar(1.5), ...ADD }));
    edge.frustumCulled = false;
    // (a shade lighter than the pages lying flat, so the sheet reads against the dark as it comes over)
    this.leafParts = [this.mk(geoTop, new THREE.MeshBasicMaterial({ color: 0x1c1436, side: THREE.DoubleSide })), this.mk(geoTop, top.r, 0.12, 1), this.mk(geoTop, top.b, 0.14, 1), this.mk(geoUnder, under.r, -0.12, 1), this.mk(geoUnder, under.b, -0.14, 1), edge];
    hinge.add(...this.leafParts);
    this.leaf = { outer, hinge, top, under };
    outer.visible = false;
    this.group.add(outer);
  }

  // ---------------------------------------------------------------- pop-ups
  // Is a spot on the book clear of every road by r metres?
  clear(x, z, r) {
    if (Math.abs(x) > W - 8 || Math.abs(z) > D / 2 - 8) return false;
    for (const path of this.race.world.paths) {
      for (let i = 0; i < path.N; i += 2) {
        const dx = path.px[i] - x;
        const dz = path.pz[i] - z;
        if (dx * dx + dz * dz < (path.halfW + r) ** 2) return false;
      }
    }
    return true;
  }

  // A cut-out standing at world (x, z), turned by yaw (its face square to that heading). opts.layers: more copies
  // behind it, each a little smaller; opts.y: its foot, if not the paper; opts.fall: -1 folds it the other way.
  piece(page, shape, mask, x, z, yaw, opts = {}) {
    const mats = this.race.world.layers.materials(mask);
    const root = new THREE.Group();
    root.position.set(x, opts.y ?? PY(-x), z);
    root.rotation.y = yaw;
    const pos = [];
    const n = shape.pts.length;
    for (let k = 0; k < n; k++) {
      const a = shape.pts[k];
      const b = shape.pts[(k + 1) % n];
      pos.push(a[0], a[1], 0, b[0], b[1], 0);
    }
    for (let k = 0; k < shape.segs.length; k += 4) pos.push(shape.segs[k], shape.segs[k + 1], 0, shape.segs[k + 2], shape.segs[k + 3], 0);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const fg = new THREE.ShapeGeometry(new THREE.Shape(shape.pts.map(([px, py]) => new THREE.Vector2(px, py))));
    const flaps = [];
    const layers = opts.layers ?? 1;
    for (let q = 0; q < layers; q++) {
      const flap = new THREE.Group();
      const lines = new THREE.LineSegments(lg, mats.wire);
      lines.renderOrder = 2;
      flap.add(new THREE.Mesh(fg, mats.fill), lines);
      flap.position.z = -q * (opts.gap ?? 5);
      flap.scale.setScalar(1 - q * 0.16);
      flap.position.x = q * (opts.shift ?? 0);
      root.add(flap);
      flaps.push(flap);
    }
    this.group.add(root);
    const P = { page, left: x > 0, d: Math.min(1, Math.abs(x) / W), r: Math.abs(x), h: shape.h, root, flaps, fall: opts.fall ?? 1, beat: 1, k: -1 };
    this.pieces.push(P);
    return P;
  }

  // The same, beside the main road at sample i: `lat` metres across it, facing down the road.
  roadPiece(page, shape, mask, i, lat, opts = {}) {
    const m = this.main;
    const p = m.point(i, lat, 0, _v);
    return this.piece(page, shape, mask, p.x, p.z, Math.atan2(m.thx[i], m.thz[i]) + (opts.turn ?? 0), { ...opts, y: opts.onRoad ? p.y + 0.06 : undefined });
  }

  // A pop-up you can hit: an obstacle record on the main road with this page on it.
  hazard(page, kind, shape, mask, i, lat, ob, late) {
    const m = this.main;
    const P = this.roadPiece(page, shape, mask, i, lat, { onRoad: true });
    P.kind = kind;
    P.ob = { path: m, i, f: m.frac(i), lat, mask, root: P.root, sweep: 0, phase: 0, baseLat: lat, page, late, down: false, ...ob };
    P.phase = ((i * m.ds) / 150) % 1; // where on the beat it stands, by where on the road it is
    this.race.world.obstacles.push(P.ob);
    return P;
  }

  buildSpread(page, world) {
    const m = this.main;
    const hw = m.halfW;
    const rng = this.rng;
    const Z = world.def.zones;
    const zone = (z) => {
      const i0 = m.index(z[0]);
      let n = m.index(z[1]) - i0;
      if (n < 0) n += m.N;
      return { i0, n, at: (metres) => m.wrap(i0 + Math.round(metres / m.ds)), len: n * m.ds };
    };
    const z1 = zone(Z.z1);
    const z2 = zone(Z.z2);
    const z3 = zone(Z.z3);
    const z4 = zone(Z.z4);
    const z5 = zone(Z.z5);
    const alt = (k) => (k % 2 ? M.B : M.R);
    // what stands at the roadside, and in the middle of each page
    const scenery = [
      () => (rng() < 0.2 ? S.clockTower(26 + rng() * 22) : S.building(rng, 10 + rng() * 12, 14 + rng() * 34)),
      () => (rng() < 0.6 ? S.wave(26 + rng() * 14, 5 + rng() * 5, 3, rng() * 9) : rng() < 0.5 ? S.whaleTail(12 + rng() * 8) : S.ship(22, 18)),
      () => (rng() < 0.45 ? S.crag(rng, 10 + rng() * 14, 9 + rng() * 16) : rng() < 0.6 ? S.palm(16 + rng() * 10) : S.cone(22 + rng() * 14, 14 + rng() * 10)),
    ][page];
    for (let i = 8; i < m.N; i += 17) {
      for (const s of [-1, 1]) {
        if (rng() < 0.25) continue;
        const shape = scenery();
        const lat = s * (hw + 5 + shape.w / 2 + rng() * 10);
        const p = m.point(i, lat, 0, _v);
        if (!this.clear(p.x, p.z, shape.w / 2 + 1)) continue;
        const pick = rng();
        this.roadPiece(page, shape, pick < 0.42 ? M.R : pick < 0.84 ? M.B : M.ALL, i, lat, { layers: rng() < 0.3 ? 2 : 1, gap: 4, shift: 3 });
      }
    }
    // the big pieces: a V of two leaning sheets each, so they read from along the page and from across it
    const big = (shape, mask, bx, bz, layers = 2) => {
      for (const yaw of [0.35, -0.75]) {
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        let ok = true;
        for (let q = -1; q <= 1; q += 0.25) if (!this.clear(-bx + c * q * shape.w * 0.5, bz - s * q * shape.w * 0.5, 3)) ok = false;
        if (ok) this.piece(page, shape, mask, -bx, bz, yaw, { layers, gap: 7, shift: 5 });
      }
    };
    if (page === 0) {
      big(S.building(rng, 34, 86), M.R, -150, 30, 3);
      big(S.building(rng, 26, 64), M.B, -110, -80, 2);
      big(S.clockTower(74), M.B, -60, 90, 1);
      big(S.building(rng, 30, 70), M.B, 120, 110, 3);
      big(S.building(rng, 24, 52), M.R, 95, -130, 2);
      big(S.clockTower(60), M.R, 60, 10, 1);
    } else if (page === 1) {
      big(S.ship(84, 66), M.B, -150, 20, 1);
      big(S.lighthouse(78), M.R, 110, 100, 1);
      big(S.whaleTail(34), M.B, 80, -130, 1);
      big(S.wave(120, 16, 5, 2), M.B, -110, -100, 3);
      big(S.wave(90, 13, 4, 5), M.R, 110, 0, 3);
      big(S.lighthouse(48), M.R, -70, 110, 1);
    } else {
      big(S.cone(150, 92), M.R, -145, 20, 3);
      big(S.cone(96, 58), M.R, 115, 95, 2);
      big(S.crag(rng, 44, 40), M.B, -80, -110, 2);
      big(S.crag(rng, 36, 30), M.B, 85, -125, 2);
      big(S.palm(34), M.B, 55, 20, 1);
    }
    // the arch over the secret blue road: red, so the red printing hides the way through it
    const keep = world.paths.find((p) => p.def?.label === 'BLUE KEEP');
    if (keep) {
      const j = Math.round(keep.N * 0.42);
      const shape = S.arch(['castle', 'wave', 'rock'][page], 62, 40, keep.halfW * 2 + 6, 17);
      this.piece(page, shape, M.R, keep.px[j], keep.pz[j], Math.atan2(keep.thx[j], keep.thz[j]), { layers: 2, gap: 9 });
    }

    // ---- the pieces you can hit
    const gate = (i, side, mask, late) => this.hazard(page, 'gate', S.building(rng, hw, 9 + rng() * 5), mask, i, side * hw * 0.5, { type: 'gate', w: hw * 0.5, len: 1.2, h: 4.2 }, late);
    const tab = (i, mask, phase, late) => {
      const P = this.hazard(page, 'tab', S.bus(4.4, 3.2), mask, i, 0, { type: 'block', w: 2.2, len: 1.3, h: 3 }, late);
      P.phase = phase;
      // the slot the tab slides in, printed across the road
      const a = m.point(i, -hw * 0.75, 0.07, new THREE.Vector3());
      const b = m.point(i, hw * 0.75, 0.07, new THREE.Vector3());
      const t = new THREE.Vector3(m.thx[i], 0, m.thz[i]).multiplyScalar(0.7);
      const g = new THREE.BufferGeometry().setFromPoints([a.clone().add(t), b.clone().add(t), a.clone().sub(t), b.clone().sub(t), a.clone().add(t), a.clone().sub(t), b.clone().add(t), b.clone().sub(t)]);
      P.slot = new THREE.LineSegments(g, world.layers.materials(mask).wire);
      this.group.add(P.slot);
      return P;
    };
    const flap = (kind, i, mask, late) => {
      const shape = kind === 'lava' ? S.flame(hw * 2 + 1, 6.5) : kind === 'steam' ? S.steam(hw * 2 + 1, 6.5) : S.wave(hw * 2 + 1, 6, 4, i);
      const P = this.hazard(page, kind, shape, mask, i, 0, { type: 'wall', w: hw + 0.5, len: 1.2, h: 4.2 }, late);
      P.flap = true;
      return P;
    };
    const finAt = (i, phase, late) => {
      const P = this.hazard(page, 'fin', S.fin(3.2), M.R, i, 0, { type: 'block', w: 1.5, len: 1.4, h: 3, sweep: 0.62 }, late);
      P.phase = phase;
      return P;
    };
    const lump = (i, lat, mask, late) => this.hazard(page, 'lump', S.crag(rng, 5, 4.2), mask, i, lat * hw, { type: 'block', w: 2.2, len: 2.2, h: 3.6 }, late);
    if (page === 0) {
      for (let k = 0; k < 4; k++) gate(z1.at(14 + k * 27), k % 2 ? 1 : -1, alt(k));
      tab(z2.at(z2.len * 0.5), M.R, 0);
      tab(z3.at(z3.len * 0.5), M.B, 0.5);
      tab(z4.at(18), M.R, 0);
      gate(z4.at(52), 1, M.B);
      tab(z4.at(86), M.B, 0.5);
      gate(z4.at(118), -1, M.R);
      tab(z4.at(150), M.R, 0.25);
      for (let k = 0; k < 3; k++) gate(z5.at(16 + k * 30), k % 2 ? -1 : 1, alt(k + 1), true);
    } else if (page === 1) {
      for (let k = 0; k < 3; k++) flap('wave', z1.at(16 + k * 38), M.R);
      this.water.push({ i0: z2.at(4), n: Math.round(52 / m.ds) }, { i0: z4.at(30), n: Math.round(70 / m.ds) }, { i0: z5.at(20), n: Math.round(56 / m.ds), late: true });
      finAt(z2.at(22), 0);
      finAt(z2.at(44), 2);
      lump(z3.at(14), -0.5, M.B);
      lump(z3.at(34), 0.45, M.B);
      lump(z3.at(54), -0.1, M.B);
      flap('wave', z4.at(8), M.R);
      finAt(z4.at(50), 1);
      finAt(z4.at(78), 3.4);
      lump(z4.at(122), 0.5, M.B);
      lump(z4.at(140), -0.4, M.B);
      flap('wave', z4.at(165), M.R);
      finAt(z5.at(36), 0.6, true);
      finAt(z5.at(60), 2.6, true);
    } else {
      flap('lava', z1.at(14), M.R);
      flap('steam', z1.at(52), M.B);
      flap('lava', z1.at(90), M.R);
      lump(z2.at(14), -0.45, M.R);
      lump(z2.at(34), 0.4, M.B);
      lump(z2.at(54), -0.05, M.R);
      flap('steam', z3.at(10), M.B);
      flap('lava', z3.at(48), M.R);
      for (let k = 0; k < 4; k++) flap(k % 2 ? 'steam' : 'lava', z4.at(14 + k * 42), alt(k));
      lump(z5.at(16), 0.45, M.B, true);
      lump(z5.at(40), -0.4, M.R, true);
      flap('lava', z5.at(78), M.R, true);
    }
  }

  // THE SEA's water: ripples across the road, drawn only on that spread.
  buildWater() {
    const m = this.main;
    const pos = [];
    for (const w of this.water) {
      const rows = Math.round((w.n * m.ds) / 2.6);
      for (let r = 0; r <= rows; r++) {
        const i = m.wrap(w.i0 + Math.round((r / rows) * w.n));
        const cols = 10;
        for (let c = 0; c < cols; c++) {
          if ((c + r) % 3 === 0) continue;
          const a = m.point(i, -m.halfW + (c / cols) * m.halfW * 2, 0.09, _v);
          pos.push(a.x, a.y, a.z);
          const b = m.point(i, -m.halfW + ((c + 0.8) / cols) * m.halfW * 2, 0.09, _v);
          pos.push(b.x, b.y, b.z);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.waterMat = new THREE.LineBasicMaterial({ color: 0x4ad8ff, opacity: 0.8, ...ADD });
    this.waterLines = new THREE.LineSegments(g, this.waterMat);
    this.waterLines.frustumCulled = false;
    this.waterLines.renderOrder = 2;
    this.group.add(this.waterLines);
  }

  // THE FLIP: the lip of the page across the road, and the line it throws you along over the gutter.
  buildLip(world) {
    const m = this.main;
    const def = world.def;
    const i0 = m.index(def.lipAt);
    const i1 = m.index(def.landAt);
    const a = m.point(i0, 0, 0, new THREE.Vector3());
    const b = m.point(i1, 0, 0, new THREE.Vector3());
    const pts = [];
    for (let k = -1; k <= 5; k++) pts.push(a.clone().lerp(b, k / 5));
    // and on down the road past the landing, so a long flight is still steered home
    for (const d of [30, 60, 90]) pts.push(m.point(m.wrap(i1 + Math.round(d / m.ds)), 0, 0, new THREE.Vector3()));
    this.chord = new Path('flip', pts, false, m.halfW, {});
    const w = m.halfW - 1;
    const len = 10;
    this.lip = { i0, i1, n: Math.round(len / m.ds), w, to: b, up: false, since: 9, k: 0 };
    const root = new THREE.Group();
    m.point(i0, 0, 0.1, root.position);
    root.rotation.y = Math.atan2(m.thx[i0], m.thz[i0]);
    const flap = new THREE.Group();
    const p = [];
    const seg = (x0, y0, z0, x1, y1, z1) => p.push(x0, y0, z0, x1, y1, z1);
    // the sheet, its curled tip, and chevrons pointing up it
    seg(-w, 0, 0, w, 0, 0);
    for (const x of [-w, w]) {
      seg(x, 0, 0, x, 0, len);
      seg(x, 0, len, x, 0.9, len + 1.6);
      seg(x, 0.9, len + 1.6, x, 2.4, len + 1.9);
    }
    seg(-w, 0, len, w, 0, len);
    seg(-w, 2.4, len + 1.9, w, 2.4, len + 1.9);
    for (let k = 0; k < 3; k++) {
      const z = 1.2 + k * 3;
      seg(-w * 0.7, 0, z, 0, 0, z + 2.2);
      seg(w * 0.7, 0, z, 0, 0, z + 2.2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    this.lipMat = new THREE.LineBasicMaterial({ color: YELLOW, ...ADD });
    const lines = new THREE.LineSegments(g, this.lipMat);
    lines.renderOrder = 3;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, len), new THREE.MeshBasicMaterial({ color: 0x241a05, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    sheet.rotation.x = Math.PI / 2;
    sheet.position.z = len / 2;
    flap.add(sheet, lines);
    root.add(flap);
    this.group.add(root);
    this.lip.flap = flap;
  }

  // The lip is up and this racer is on it: off the page edge and over the gutter.
  catchLip(r, t) {
    const R = this.race;
    const L = this.lip;
    r.flipCd = t + 2.5;
    const dx = L.to.x - r.pos.x;
    const dz = L.to.z - r.pos.z;
    const dist = Math.hypot(dx, dz);
    const fwd = Math.max(r.speed, 68);
    const air = dist / fwd;
    const vy = (G_AIR * air) / 2 + (L.to.y - r.pos.y) / air;
    r.vel.set((dx / dist) * fwd, vy, (dz / dist) * fwd);
    r.grounded = false;
    r.airTime = 0.01;
    // (Race.flyLaunch steers a launched racer along a path: this one is the straight line over the gutter)
    r.launch = { path: this.chord, i: 0, t: air + 0.6, fwd };
    // the same arc for every form (update carries a racer along it: left to itself the Skimmer's glide sails off the page)
    r.flip = { t0: t, air, vy, fwd, x0: r.pos.x, y0: r.pos.y, z0: r.pos.z, dx: dx / dist, dz: dz / dist };
    const perfect = L.since < LIP_PERFECT;
    r.giveBoost(perfect ? 1.5 : 0.8, perfect ? 1.38 : 1.22);
    if (perfect) r.energy = Math.min(1, r.energy + 0.16);
    R.onMove(r, 'launch', { perfect });
    if (R.near(r)) R.debris.sparks(r.pos, _v.set(0, -1, 0), 30, YELLOW, 14, r.pos.y - 0.4);
    if (r.isPlayer) {
      R.emitP(r, 'popup', { text: perfect ? 'PERFECT FLIP' : 'FLIP', color: '#ffd04a' });
      R.app.audio.play('turbo', perfect ? 3 : 2);
      R.camOf(r).fovPunch(perfect ? 14 : 10);
    }
  }

  inWater(r) {
    const tr = r.track;
    if (!tr || tr.path !== this.main) return false;
    for (const w of this.water) {
      let d = tr.i - w.i0;
      if (d < 0) d += this.main.N;
      if (d < w.n && !(w.late && NOW < (r.pageSolidAt || 0))) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- every frame
  update(dt) {
    if (!this.on) return;
    const R = this.race;
    const t = R.raceTime;
    NOW = t;
    // the lip of THE FLIP: up for the first part of every beat, with a twitch before it stands
    const m = this.main;
    const L = this.lip;
    const lp = (t / BEAT + 0.1) % 1;
    L.k = lp < LIP_UP ? smoothstep(0, 0.04, lp) : lp > 0.84 ? 0.1 + 0.05 * Math.sin(t * 46) : 1 - smoothstep(LIP_UP, LIP_UP + 0.07, lp);
    L.up = lp < LIP_UP && L.k > 0.6;
    L.since = lp * BEAT;
    L.flap.rotation.x = -0.5 * easeOutBack(L.k);
    this.lipMat.color.set(YELLOW).multiplyScalar(0.55 + 1.1 * L.k);
    // whose page turns
    for (const r of R.racers) {
      // (progress only counts on the ground, so a racer in the air off THE FLIP is counted from its lip)
      const F = r.flip;
      const flying = F && !r.grounded && r.respawnT <= 0 && t < F.t0 + F.air + 0.4;
      if (F && !flying && t > F.t0 + 0.2) r.flip = null;
      const fl = flying ? 0.03 : 0;
      if (flying) {
        // carried along the arc, and its road search pointed at where it will come down, not at the gutter road
        // under it
        const q = Math.min(t - F.t0, F.air);
        r.pos.set(F.x0 + F.dx * F.fwd * q, F.y0 + F.vy * q - 0.5 * G_AIR * q * q + 0.3, F.z0 + F.dz * F.fwd * q);
        r.vel.set(F.dx * F.fwd, F.vy - G_AIR * q, F.dz * F.fwd);
        r.yaw = Math.atan2(F.dx, F.dz);
        r.hints[m.id] = L.i1;
      }
      else if (!r.puppet && r.grounded && r.respawnT <= 0 && L.up && !(r.flipCd > t) && r.speed > 18 && r.track?.path === m) {
        let d = r.track.i - L.i0;
        if (d < -m.N / 2) d += m.N;
        if (d >= 0 && d <= L.n && Math.abs(r.track.lat) < L.w) this.catchLip(r, t);
      }
      const pg = clamp(Math.floor((r.prog || 0) + fl - this.flipU + 1), 0, 2);
      if (pg > (r.page || 0) && !r.finished) {
        r.page = pg;
        r.pageSolidAt = t + SOLID_AFTER;
        if (r.isPlayer) R.emitP(r, 'popup', { text: `PAGE ${pg + 1} · ${SPREADS[pg].name}`, color: '#ffd04a' });
      }
      // THE SEA: the road is under water in places. The Skimmer rides on it; wheels and hover pads bog down.
      if (r.page === 1 && !r.puppet && r.grounded && r.respawnT <= 0 && this.inWater(r)) {
        const k = Math.max(0, 1 - FORMS[r.mode].water * dt);
        r.vel.x *= k;
        r.vel.z *= k;
      }
    }
    // the moving pieces, on the race clock
    for (const P of this.pieces) {
      const o = P.ob;
      if (!o) continue;
      if (P.flap) {
        // up for the first half of its beat (steam: the second half), with a twitch before it stands
        const ph = (t / BEAT + P.phase + (P.kind === 'steam' ? 0.5 : 0)) % 1;
        const up = ph < 0.5;
        const k = up ? smoothstep(0, 0.045, ph) : ph > 0.86 ? 0.13 + 0.05 * Math.sin(t * 46) : 1 - smoothstep(0.5, 0.58, ph);
        P.beat = k;
        const was = o.down;
        o.down = k < 0.55;
        // anyone it comes up under is let out of it rather than thrown
        if (was && !o.down) {
          for (const r of R.racers) {
            const tr = r.track;
            if (!tr || tr.path !== m || r.page !== o.page) continue;
            let di = tr.i - o.i;
            if (di > m.N / 2) di -= m.N;
            if (di < -m.N / 2) di += m.N;
            if (Math.abs(di * m.ds) < o.len + r.halfL + 1.5) r.inside = o;
          }
        }
      } else if (P.kind === 'tab') {
        // hold, slide, hold, slide back
        const ph = (t / BEAT + P.phase) % 1;
        const s = smoothstep(0.32, 0.5, ph) - smoothstep(0.82, 1, ph);
        o.lat = (s * 2 - 1) * m.halfW * 0.58;
        m.point(o.i, o.lat, 0.06, P.root.position);
      } else if (P.kind === 'fin') {
        o.lat = Math.sin(t * 1.25 + P.phase) * o.sweep * m.halfW;
        m.point(o.i, o.lat, 0.06, P.root.position);
        P.root.rotation.z = Math.cos(t * 1.25 + P.phase) * 0.12;
      }
    }
    // each view's leaf
    R.players.forEach((pl, k) => {
      const v = this.views[k];
      const want = pl.page || 0;
      if (want > v.page && v.s >= 1) {
        v.from = v.page;
        v.page = want;
        v.s = 0;
        v.landed = false;
        R.app.audio.play('whoosh');
      }
      if (v.s < 2) {
        v.s += dt / TURN;
        if (v.s >= 1 && !v.landed) {
          v.landed = true;
          R.app.audio.play('land');
          R.camOf(pl).addShake(0.55);
        }
      }
    });
    if (!R.split) this.apply(this.views[0], R.player.mode);
  }

  // Split-screen: lay the book out for this player's page before their view is drawn.
  render(k, pl) {
    if (this.on) this.apply(this.views[k], pl.mode);
  }

  // Stand everything up (or fold it down) as this view sees it.
  apply(v, mode) {
    const R = this.race;
    const lv = (mask) => R.world.layers.level.get(mask) ?? 1;
    const turning = v.s < 1;
    const theta = Math.PI * smoothstep(0, 1, Math.min(1, v.s)) ** 1.25;
    // the printing
    const red = lv(M.R) * 0.55;
    const blue = lv(M.B) * 0.55;
    const set = (pl, idx) => {
      pl.r.map = this.tex[idx].r;
      pl.b.map = this.tex[idx].b;
      pl.r.opacity = red;
      pl.b.opacity = blue;
      pl.r.visible = red > 0.01;
      pl.b.visible = blue > 0.01;
    };
    set(this.base.R, v.page);
    set(this.base.L, turning ? v.from : v.page);
    const L = this.leaf;
    L.outer.visible = turning;
    if (turning) {
      set(L.top, v.from);
      set(L.under, v.page);
      L.hinge.rotation.z = theta;
      const c = Math.cos(theta);
      const sc = Math.abs(c) < 0.02 ? 0.02 * (c < 0 ? -1 : 1) : c;
      for (const p of this.leafParts) p.scale.y = sc;
    }
    // the book opens: the first spread stands up during the fly-by
    const intro = v.page === 0 && R.state === 'intro' ? R.introT : 99;
    const tanLeaf = theta > HALF_PI ? Math.tan(Math.PI - theta) : Infinity;
    for (const P of this.pieces) {
      let k = 0;
      if (P.page === v.page) {
        if (v.s >= 1.6) k = 1;
        else if (!P.left) {
          const a = 0.1 + 0.35 * (1 - P.d);
          k = smoothstep(a, a + 0.2, v.s);
        } else {
          const a = 0.96 + 0.2 * P.d;
          k = smoothstep(a, a + 0.17, v.s);
        }
        if (intro < 99) k *= smoothstep(0.15 + P.d * 0.7, 0.75 + P.d * 0.7, intro);
      } else if (turning && P.page === v.from) {
        if (!P.left) k = 1 - smoothstep(0, 0.16, v.s);
        else {
          // pressed flat by the leaf coming down on it
          const room = P.r * tanLeaf;
          k = room >= P.h ? 1 : Math.asin(clamp(room / P.h, 0, 1)) / HALF_PI;
        }
      }
      const shown = k > 0.004;
      const here = shown && !P.ob?.broken;
      P.root.visible = here;
      if (P.slot) P.slot.visible = P.page === v.page && k > 0.5;
      if (!here) continue;
      // a flap lies printed on the road between beats; everything else is gone when it's flat
      const kk = easeOutBack(k) * (P.flap ? P.beat : 1);
      const rot = (1 - kk) * HALF_PI * P.fall;
      for (let q = 0; q < P.flaps.length; q++) P.flaps[q].rotation.x = rot * (1 - q * 0.04);
    }
    this.waterLines.visible = v.page === 1 && v.s > 0.5;
    this.waterMat.color.set(mode === RED ? 0xff5a6a : 0x4ad8ff);
    this.waterMat.opacity = 0.55 + 0.25 * Math.sin(R.t * 2.2);
  }
}

const _v = new THREE.Vector3();
