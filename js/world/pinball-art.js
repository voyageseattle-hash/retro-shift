// FLIPPER ALLEY's table: the playfield and its printing, the cabinet and backbox, and the parts game/pinball.js
// moves (flipper bats, pop bumpers, steel balls, the plunger). The printing is in two colours, red and blue, so each
// lens shows one printing and hides the other; the moving parts take their colours from the lens materials too.

import * as THREE from '../../vendor/three.js';
import { M, COLORS } from './shift.js';
import { TABLE, SC, V3, tableY } from './pinball.js';

const YELLOW = 0xffd23a;
const CHROME = 0xdfe8ff;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// ------------------------------------------------------------------ the still parts, batched with the course
export function pinballDecor(world, L, main) {
  const K = world.pinball;
  const { x0, x1, z0, z1 } = TABLE;
  const P = (x, z, h = 0) => V3(x, z, h);
  const wall = (ax, az, bx, bz, h, color, mask = M.ALL, k = 0.22) => {
    const a = P(ax, az, -0.6);
    const b = P(bx, bz, -0.6);
    const c = P(bx, bz, h);
    const d = P(ax, az, h);
    L.quad(mask, a, b, c, d, color, k);
    L.line(mask, d, c, color);
    L.line(mask, a, b, color);
  };

  const ringAt = (x, z, r, mask, color = null, seg = 40) => L.ring(mask, P(x, z, -0.5), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, SC * 0.07, 1).normalize(), r * SC, seg, color);
  // ---- the playfield's printing: a faint grid, so the table's surface reads at speed
  for (let x = x0 + 16; x < x1; x += 32) L.line(M.ALL, P(x, z0, -0.55), P(x, z1, -0.55), 0x1c1038);
  for (let z = z0 + 14; z < z1; z += 32) L.line(M.ALL, P(x0, z, -0.55), P(x1, z, -0.55), 0x1c1038);
  // inserts beside the road: arrows on its left printed red, on its right printed blue
  for (let i = 8; i < main.N; i += 14) {
    for (const s of [-1, 1]) {
      const mask = s < 0 ? M.R : M.B;
      const lat = s * (main.halfW + 4.5);
      const tip = main.point(i + 3, lat, -0.5, new THREE.Vector3());
      const l = main.point(i, lat - 1.8, -0.5, new THREE.Vector3());
      const r = main.point(i, lat + 1.8, -0.5, new THREE.Vector3());
      L.quad(mask, l, tip, tip, r, null, 0.5);
      L.line(mask, l, tip);
      L.line(mask, r, tip);
    }
  }
  // rings and a starburst printed in the bumper pit, and a target printed at the drain
  for (const [r, mask] of [[26, M.R], [40, M.B], [58, M.R]]) ringAt(20, 468, r, mask);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    L.line(k % 2 ? M.R : M.B, P(20 + Math.cos(a) * 62, 468 + Math.sin(a) * 62, -0.5), P(20 + Math.cos(a) * 76, 468 + Math.sin(a) * 76, -0.5));
  }

  // ---- the lit inserts: a field of round lights over every open piece of playfield, red and blue in turn, each as
  // big as the room it has (so the open middle carries the big ones and the gaps between lanes the small ones)
  const taken = [];
  for (const p of world.paths) {
    if (p.id === 'trough') continue; // (under the table)
    for (let i = 0; i < p.N; i += 2) {
      if (p.py[i] - tableY(p.pz[i]) > 14) continue; // (the wire, high overhead)
      taken.push(p.px[i], p.pz[i], p.halfW);
    }
  }
  // how far table point (x, z) is from the nearest road's edge, in metres
  const room = (x, z) => {
    const wx = -x * SC;
    const wz = z * SC;
    let d = Math.min((x1 - Math.abs(x)) * SC, (z - z0) * SC);
    if (z > 540) d = Math.min(d, (1 - Math.hypot(x / x1, (z - 540) / (z1 - 540))) * 160);
    for (let k = 0; k < taken.length && d > 0; k += 3) d = Math.min(d, Math.hypot(wx - taken[k], wz - taken[k + 1]) - taken[k + 2]);
    return d;
  };
  const disc = (x, z, r, mask, k = 0.3, seg = 12) => {
    const c = P(x, z, -0.45);
    let prev = null;
    for (let q = 0; q <= seg; q++) {
      const a = (q / seg) * Math.PI * 2;
      const e = P(x + (Math.cos(a) * r) / SC, z + (Math.sin(a) * r) / SC, -0.45);
      if (prev) {
        L.quad(mask, c, prev, e, c, null, k);
        L.line(mask, prev, e);
      }
      prev = e;
    }
  };
  let row = 0;
  for (let z = z0 + 30; z < z1 - 10; z += 27, row++) {
    let col = 0;
    for (let x = x0 + 24 + (row % 2) * 16; x < x1 - 16; x += 32, col++) {
      if (Math.hypot(x - 20, z - 468) < 80) continue; // (the pit has its own printing)
      const d = room(x, z);
      if (d < 5.5) continue;
      const r = Math.min(8.5, d - 3);
      const mask = (row + col) % 2 ? M.R : M.B;
      disc(x, z, r, mask, r > 6 ? 0.34 : 0.22, r > 6 ? 14 : 8);
      if (r > 6) ringAt(x, z, (r + 1.6) / SC, mask === M.R ? M.B : M.R, null, 16);
    }
  }

  // ---- the slingshots: a rubber triangle on posts each side above the flippers, where there's room for one
  for (const [sx, mask] of [[-1, M.R], [1, M.B]]) {
    let best = null;
    for (let x = 30; x <= 150; x += 6) for (let z = 140; z <= 300; z += 6) {
      const d = room(sx * x, z);
      if (!best || d > best.d) best = { x: sx * x, z, d };
    }
    if (!best || best.d < 12) continue;
    const r = Math.min(26, best.d - 4) / SC;
    const pts = [[best.x - sx * r * 0.55, best.z - r * 0.8], [best.x + sx * r * 0.5, best.z - r * 0.55], [best.x - sx * r * 0.45, best.z + r]];
    const lo = pts.map(([x, z]) => P(x, z, -0.4));
    const hi = pts.map(([x, z]) => P(x, z, 2.6));
    const mid = P((pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3, 2.6);
    for (let k = 0; k < 3; k++) {
      const n = (k + 1) % 3;
      L.line(M.ALL, hi[k], hi[n], 0xffffff); // the rubber
      L.quad(M.ALL, lo[k], lo[n], hi[n], hi[k], 0xffffff, 0.08);
      L.quad(mask, hi[k], hi[n], mid, mid, null, 0.45); // the lit plastic on top
      L.line(mask, hi[k], mid);
      L.cylinder(M.ALL, lo[k].x, lo[k].y, lo[k].z, 0.9, 3.4, 6, 2, CHROME);
    }
  }

  // ---- the cabinet: side rails, the top arch's wall, the apron and lock bar
  const RAIL = 7;
  for (let z = z0; z < z1; z += 40) {
    const zb = Math.min(z1, z + 40);
    wall(x0, z, x0, zb, RAIL, YELLOW);
    wall(x1, z, x1, zb, RAIL, YELLOW);
  }
  wall(x0, z0, x1, z0, RAIL, YELLOW);
  // the back wall follows the arch
  let prev = null;
  for (let k = 0; k <= 24; k++) {
    const a = (k / 24) * Math.PI;
    const p = [Math.cos(a) * x1, 540 + Math.sin(a) * (z1 - 540)];
    if (prev) wall(prev[0], prev[1], p[0], p[1], RAIL + 3, YELLOW, M.ALL, 0.16);
    prev = p;
  }
  // the cabinet's body under the playfield, and its legs down to the desk
  const body = 24;
  const corner = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corner[k];
    const [bx, bz] = corner[(k + 1) % 4];
    const a = P(ax, az, -0.6);
    const b = P(bx, bz, -0.6);
    const c = P(bx, bz, -body);
    const d = P(ax, az, -body);
    L.fillQuad(M.ALL, a, b, c, d);
    L.line(M.ALL, d, c, YELLOW);
    L.line(M.ALL, a, d, YELLOW);
    // the side art: a red bolt and a blue one
    for (let q = 0; q < 6; q++) {
      const u0 = (q + 0.15) / 6;
      const u1 = (q + 0.85) / 6;
      const m0 = a.clone().lerp(b, u0);
      const m1 = a.clone().lerp(b, u1);
      m0.y -= body * (q % 2 ? 0.25 : 0.75);
      m1.y -= body * (q % 2 ? 0.75 : 0.25);
      L.line(q % 2 ? M.R : M.B, m0, m1);
    }
    const leg = P(ax * 0.96, az < 100 ? az + 14 : az - 14, -body);
    L.box(M.ALL, leg.x, (leg.y + world.floorY) / 2, leg.z, 9, leg.y - world.floorY, 9, 0, CHROME, true);
  }

  // ---- the wall between the shooter lane and the table
  for (let z = 150; z < 470; z += 40) wall(168, z, 168, Math.min(470, z + 40), 4, CHROME, M.ALL, 0.14);

  // ---- the drain: its rim, and arrows pointing into it
  const D = K.drain;
  const lane = K.lane;
  for (const s of [-1, 1]) L.line(M.ALL, lane.point(D.i0 + 1, s * 13, -0.4, _a), lane.point(D.i1 - 1, s * 13, -0.4, _b), COLORS.red);
  for (const i of [D.i0 + 1, D.i1 - 1]) L.line(M.ALL, lane.point(i, -13, -0.4, _a), lane.point(i, 13, -0.4, _b), COLORS.red);

  // ---- the centre ramp: clear plastic walls, hoops, and posts down to the playfield
  const ramp = K.ramp;
  for (let i = 0; i < ramp.N - 1; i++) {
    const lift = ramp.py[i] - tableY(ramp.pz[i]);
    if (lift < 1.2) continue;
    for (const s of [-1, 1]) {
      const a = ramp.point(i, s * (ramp.halfW + 0.3), 1.1, new THREE.Vector3());
      const b = ramp.point(i + 1, s * (ramp.halfW + 0.3), 1.1, new THREE.Vector3());
      const c = ramp.point(i + 1, s * (ramp.halfW + 0.3), 3.4, new THREE.Vector3());
      const d = ramp.point(i, s * (ramp.halfW + 0.3), 3.4, new THREE.Vector3());
      L.quad(M.ALL, a, b, c, d, COLORS.pink, 0.1);
      L.line(M.ALL, d, c, COLORS.pink);
    }
    if (i % 12 === 6) {
      const c = ramp.point(i, 0, 0, new THREE.Vector3());
      L.hoop(M.ALL, c, new THREE.Vector3(ramp.rightX(i), 0, ramp.rightZ(i)), UP, ramp.halfW + 1.2, 0.8, 20, COLORS.pink, Math.PI, 0);
      for (const s of [-1, 1]) {
        const q = ramp.point(i, s * ramp.halfW, -0.6, new THREE.Vector3());
        L.lineXYZ(M.ALL, q.x, q.y, q.z, q.x, tableY(q.z) - 0.5, q.z, CHROME);
      }
    }
  }
  // its mouth: a flared catch over the drain
  for (const s of [-1, 1]) {
    const a = ramp.point(0, s * ramp.halfW, 0, new THREE.Vector3());
    const b = ramp.point(0, s * (ramp.halfW + 7), 4.5, new THREE.Vector3());
    const c = ramp.point(8, s * ramp.halfW, 3.4, new THREE.Vector3());
    L.quad(M.ALL, a, b, c, c, COLORS.pink, 0.2);
    L.line(M.ALL, a, b, COLORS.pink);
    L.line(M.ALL, b, c, COLORS.pink);
  }

  // ---- the wire ramp: a wireform (two steel wires and hoops round it)
  const wire = K.wire;
  for (let i = 0; i < wire.N - 1; i++) {
    if (wire.py[i] - tableY(wire.pz[i]) < 2) continue;
    for (const s of [-1, 1]) L.line(M.ALL, wire.point(i, s * 2.9, 1.6, _a), wire.point(i + 1, s * 2.9, 1.6, _b), CHROME);
    if (i % 6 === 0) {
      const c = wire.point(i, 0, 0.4, new THREE.Vector3());
      L.ring(M.ALL, c, new THREE.Vector3(wire.rightX(i), 0, wire.rightZ(i)), UP, 3.1, 14, CHROME);
    }
    if (i % 30 === 15) {
      const q = wire.point(i, 0, -0.6, new THREE.Vector3());
      L.lineXYZ(M.ALL, q.x, q.y, q.z, q.x, tableY(q.z) - 0.5, q.z, CHROME);
    }
  }

  // ---- the upper deck: red plastic over the secret lane. It's there in BOTH and RED; BLUE takes it away and the
  // lane is under it.
  const sec = K.secret;
  const fr = {};
  let first = -1;
  for (let i = 0; i < sec.N - 1; i += 2) {
    const off = !main.frame(sec.px[i], sec.pz[i], -1, fr, sec.py[i]) || Math.abs(fr.lat) > main.halfW + sec.halfW + 1.5;
    if (!off) continue;
    if (first < 0) first = i;
    const w = sec.halfW + 1.5;
    const a = sec.point(i, -w, 5, new THREE.Vector3());
    const b = sec.point(i + 2, -w, 5, new THREE.Vector3());
    const c = sec.point(i + 2, w, 5, new THREE.Vector3());
    const d = sec.point(i, w, 5, new THREE.Vector3());
    L.quad(M.R, a, b, c, d, null, 0.16);
    L.fillQuad(M.R, a, b, c, d);
    L.line(M.R, a, b);
    L.line(M.R, d, c);
    if (i % 8 === 0) L.line(M.R, a, d);
    // skirts down to the playfield
    for (const [p, q, s] of [[a, b, -1], [d, c, 1]]) {
      const p0 = sec.point(i, s * w, -0.5, new THREE.Vector3());
      const q0 = sec.point(i + 2, s * w, -0.5, new THREE.Vector3());
      L.quad(M.R, p0, q0, q, p, null, 0.1);
    }
  }
  // the panel across its mouth: a red plastic with a star on it
  if (first >= 0) {
    const i = first;
    const w = sec.halfW + 1.5;
    const a = sec.point(i, -w, -0.5, new THREE.Vector3());
    const b = sec.point(i, w, -0.5, new THREE.Vector3());
    const c = sec.point(i, w, 5, new THREE.Vector3());
    const d = sec.point(i, -w, 5, new THREE.Vector3());
    L.quad(M.R, a, b, c, d, null, 0.4);
    L.fillQuad(M.R, a, b, c, d);
    for (const [p, q] of [[a, c], [b, d], [a, b], [c, d]]) L.line(M.R, p, q);
  }

  // ---- the backbox's frame, over the top of the table
  const bw = 330;
  const bz = z1 + 26;
  const base = P(0, bz, 10);
  L.box(M.ALL, base.x, base.y + 62, base.z, bw * SC + 8, 132, 14, 0, YELLOW, false);
  L.box(M.ALL, base.x, base.y - 8, base.z, bw * SC * 0.5, 16, 10, 0, YELLOW, true);
  for (let k = 0; k < 18; k++) {
    // marquee bulbs along the top, printed red and blue in turn
    const p = base.clone();
    p.x += (k - 8.5) * ((bw * SC) / 18);
    p.y += 130;
    p.z -= 8;
    L.ring(k % 2 ? M.R : M.B, p, new THREE.Vector3(1, 0, 0), UP, 2.2, 8);
  }
}

// ------------------------------------------------------------------ the parts that move, and the playfield itself
export function buildPinballArt(world) {
  const K = world.pinball;
  const L = world.layers;
  const G = world.group;
  const N = L.materials(M.ALL);
  const RM = L.materials(M.R);
  const BM = L.materials(M.B);
  const art = (K.art = {});
  const wireOf = (geo, mat) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat);

  // ---- the playfield: a dark sheet under the roads, with slots cut for the drain and where the trough comes up
  {
    const { x0, x1, z0, z1 } = TABLE;
    const shape = new THREE.Shape([[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => new THREE.Vector2(-x * SC, z * SC)));
    const strip = (path, i0, i1, w) => {
      const pts = [];
      for (let i = i0; i <= i1; i += 2) pts.push(path.point(i, -w, 0, new THREE.Vector3()));
      for (let i = i1; i >= i0; i -= 2) pts.push(path.point(i, w, 0, new THREE.Vector3()));
      return new THREE.Path(pts.map((p) => new THREE.Vector2(p.x, p.z)));
    };
    const D = K.drain;
    shape.holes.push(strip(K.lane, D.i0 + 1, D.i1 - 1, 12));
    const tr = K.trough;
    let t0 = 0;
    while (t0 < tr.N && tableY(tr.pz[t0]) - tr.py[t0] > 9) t0++;
    let t1 = tr.N - 1;
    while (t1 > t0 && tableY(tr.pz[t1]) - tr.py[t1] < 0.75) t1--;
    if (t1 - t0 > 4) shape.holes.push(strip(tr, t0, t1, tr.halfW + 1));
    const geo = new THREE.ShapeGeometry(shape);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getY(i);
      pos.setXYZ(i, x, tableY(z) - 0.7, z);
    }
    geo.computeBoundingSphere();
    const sheet = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x070312, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
    sheet.renderOrder = 0;
    G.add(sheet);
    K.drainAt = K.lane.point(Math.round((D.i0 + D.i1) / 2), 0, 0, new THREE.Vector3());
    K.drainAt.y = tableY(K.drainAt.z);
  }

  // ---- the flipper bats: a tapered slab lying in the lane, hinged at its wide end
  art.bats = K.bats.map((b) => {
    const lane = K.lane;
    const iPiv = b.side < 0 ? b.i0 : b.i1;
    const iTip = b.side < 0 ? b.i1 : b.i0;
    const piv = lane.point(iPiv, 0, 0.1, new THREE.Vector3());
    const tip = lane.point(iTip, 0, 0.1, new THREE.Vector3());
    const len = piv.distanceTo(tip);
    const dir = tip.clone().sub(piv).normalize();
    const outer = new THREE.Group();
    outer.position.copy(piv);
    // local +z along the bat, +y up off the lane
    const right = new THREE.Vector3().crossVectors(UP, dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    outer.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, dir));
    const inner = new THREE.Group();
    outer.add(inner);
    // outline: a 5.2 m round at the hinge narrowing to 2.4 m at the tip
    const r0 = 5.2;
    const r1 = 2.4;
    const out = [];
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI / 2 + (k / 10) * Math.PI;
      out.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0));
    }
    for (let k = 0; k <= 10; k++) {
      const a = -Math.PI / 2 + (k / 10) * Math.PI;
      out.push(new THREE.Vector2(len + Math.cos(a) * r1, Math.sin(a) * r1));
    }
    const slab = new THREE.ExtrudeGeometry(new THREE.Shape(out), { depth: 0.5, bevelEnabled: false });
    // (the shape lies in x/y: turn it to lie along +z, flat)
    slab.rotateX(Math.PI / 2);
    slab.rotateY(-Math.PI / 2);
    slab.translate(0, 0.55, 0);
    const bodyMat = N.fill.clone();
    bodyMat.color.set(0x1a1830);
    inner.add(new THREE.Mesh(slab, bodyMat));
    inner.add(wireOf(slab, N.wire));
    // the rubber: red on the left bat, blue on the right, a band round the slab's edge
    const band = wireOf(slab.clone().scale(1.04, 1.6, 1.01), (b.side < 0 ? RM : BM).wire);
    band.position.y = -0.2;
    inner.add(band);
    // the hinge post
    inner.add(wireOf(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 10), N.wire));
    G.add(outer);
    b.at = piv;
    // which way round carries this bat's tip up the table
    const sgn = right.z > 0 ? 1 : -1;
    // the count-in lamps: three chevrons across the lane before the bat
    const lamps = [];
    for (let q = 0; q < 3; q++) {
      const i = b.side < 0 ? b.i0 - 14 + q * 4 : b.i0 - 12 + q * 3;
      const pts = [];
      for (const s of [-1, 1]) {
        const tipP = lane.point(i + 2, 0, 0.12, new THREE.Vector3());
        const e0 = lane.point(i, s * 4.6, 0.12, new THREE.Vector3());
        const e1 = lane.point(i - 1, s * 4.6, 0.12, new THREE.Vector3());
        const t1 = lane.point(i + 1, 0, 0.12, new THREE.Vector3());
        pts.push(e0, tipP, t1, e0, t1, e1);
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      if (b.side < 0) G.add(mesh);
      lamps.push(mat);
    }
    return {
      lamps,
      swing: (u) => (inner.rotation.y = sgn * u * 0.85),
      dark: (off) => (bodyMat.opacity = off ? 0.35 : 0.9),
    };
  });

  // ---- the pop bumpers, down the pit: red caps to the left, blue to the right, a white one last
  {
    const pit = K.pit;
    const spots = [[0.3, -4.6, M.R], [0.41, 4.6, M.B], [0.52, -4.6, M.R], [0.63, 4.6, M.B], [0.74, -4.4, M.ALL]];
    K.bumpers = spots.map(([f, lat, mask]) => {
      const i = Math.round(f * (pit.N - 1));
      const pos = pit.point(i, lat, 0, new THREE.Vector3());
      const mats = L.materials(mask);
      const r = 4.2;
      const mesh = new THREE.Group();
      mesh.position.copy(pos);
      const bodyG = new THREE.CylinderGeometry(r * 0.72, r * 0.9, 3, 14, 1, true);
      bodyG.translate(0, 1.5, 0);
      mesh.add(wireOf(bodyG, N.wire));
      const skirt = new THREE.Mesh(new THREE.RingGeometry(r * 0.9, r * 1.25, 20), mats.ribbon);
      // (the ribbon material takes vertex colours)
      const sc = new THREE.Color(mats.base).multiplyScalar(0.5);
      skirt.geometry.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: skirt.geometry.attributes.position.count }, () => [sc.r, sc.g, sc.b]).flat(), 3));
      skirt.rotation.x = -Math.PI / 2;
      skirt.position.y = 0.15;
      mesh.add(skirt);
      const cap = new THREE.Group();
      const capG = new THREE.CylinderGeometry(r, r * 0.86, 0.9, 16);
      cap.add(new THREE.Mesh(capG, mats.fill), wireOf(capG, mats.wire));
      const star = new THREE.Mesh(new THREE.CircleGeometry(r * 0.7, 8), mats.solid);
      star.rotation.x = -Math.PI / 2;
      star.position.y = 0.5;
      cap.add(star);
      // a ring of lamps round the cap
      const lamps = new THREE.TorusGeometry(r * 1.02, 0.16, 4, 20);
      lamps.rotateX(Math.PI / 2);
      cap.add(new THREE.Mesh(lamps, mats.solid));
      cap.position.y = 3.5;
      mesh.add(cap);
      G.add(mesh);
      // under the table: its coil
      const coil = wireOf(new THREE.CylinderGeometry(1.2, 1.2, 5, 8), N.wire);
      coil.position.set(pos.x, pos.y - 4, pos.z);
      G.add(coil);
      return { i, pos, r, mask, mesh, cap, capY: 3.5, color: mats.base };
    });
  }

  // ---- the steel balls
  {
    const core = new THREE.SphereGeometry(2.96, 20, 14);
    const cage = new THREE.IcosahedronGeometry(3, 1);
    const dark = new THREE.MeshBasicMaterial({ color: 0x0b0c14 });
    art.balls = [0, 1, 2].map(() => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(core, dark), wireOf(cage, N.wire));
      // a band of each world's light round it, as the table shows in the steel
      const ring = (mat, tilt) => {
        const m = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 32 }, (_, k) => new THREE.Vector3(Math.cos((k / 32) * Math.PI * 2) * 3.05, 0, Math.sin((k / 32) * Math.PI * 2) * 3.05))), mat);
        m.rotation.z = tilt;
        return m;
      };
      g.add(ring(RM.wire, 0.5), ring(BM.wire, -0.5));
      g.visible = false;
      G.add(g);
      return g;
    });
    const m = world.main;
    const i = m.index(world.def.pin.ballsFrom);
    art.ballYaw = Math.atan2(-m.thx[i], -m.thz[i]);
  }

  // ---- the plunger: a rod up the shooter lane with a spring round it, its tip behind the grid
  {
    const m = world.main;
    const back = Math.round(34 / m.ds);
    const tipAt = m.point(m.wrap(-back), 0, 1.3, new THREE.Vector3());
    const i = m.wrap(-back);
    const g = new THREE.Group();
    g.position.copy(tipAt);
    const dir = new THREE.Vector3(m.tx[i], m.ty[i], m.tz[i]).normalize();
    const right = new THREE.Vector3().crossVectors(UP, dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, dir));
    const mov = new THREE.Group();
    g.add(mov);
    const tipG = new THREE.CylinderGeometry(2.6, 2.6, 2, 14);
    tipG.rotateX(Math.PI / 2);
    mov.add(new THREE.Mesh(tipG, N.fill), wireOf(tipG, N.wire));
    const rubber = wireOf(new THREE.CylinderGeometry(2.9, 2.9, 0.7, 14).rotateX(Math.PI / 2), RM.wire);
    rubber.position.z = 1.1;
    mov.add(rubber);
    const rodG = new THREE.CylinderGeometry(0.7, 0.7, 60, 6);
    rodG.rotateX(Math.PI / 2);
    rodG.translate(0, 0, -31);
    mov.add(wireOf(rodG, N.wire));
    // the spring: a helix whose far end is fixed, so it squeezes as the rod comes back
    const pts = [];
    const turns = 12;
    for (let k = 0; k <= turns * 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 1.7, Math.sin(a) * 1.7, -(k / (turns * 16))));
    }
    const spring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), BM.wire);
    g.add(spring);
    const REST = 30;
    G.add(g);
    art.plunger = {
      pull: 14,
      stroke: 7,
      away: 36,
      set: (z) => {
        mov.position.z = z;
        // from the back of the tip to the housing
        spring.position.z = z - 1;
        spring.scale.z = Math.max(4, REST + z);
        g.visible = z > -34;
      },
    };
    art.plunger.set(0);
  }

  // ---- the kickback: chevrons across the outlane, lit from lap 2
  {
    const m = world.main;
    const i0 = m.index(world.def.pin.kickback);
    const pts = [];
    for (let q = 0; q < 3; q++) {
      const i = i0 + q * 3;
      for (const s of [-1, 1]) {
        const tip = m.point(i + 3, 0, 0.1, new THREE.Vector3());
        const e0 = m.point(i, s * 7.5, 0.1, new THREE.Vector3());
        const e1 = m.point(i - 1.5, s * 7.5, 0.1, new THREE.Vector3());
        const t1 = m.point(i + 1.5, 0, 0.1, new THREE.Vector3());
        pts.push(e0, tip, t1, e0, t1, e1);
      }
    }
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    art.kick = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(pts), mat);
    art.kick.renderOrder = 4;
    art.kick.frustumCulled = false;
    art.kick.visible = false;
    G.add(art.kick);
  }

  // ---- the backbox display
  {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#05020c';
    ctx.fillRect(0, 0, 1024, 512);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const w = 330 * SC;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
    const base = V3(0, TABLE.z1 + 26, 10);
    mesh.position.set(base.x, base.y + 62, base.z - 7.5);
    mesh.rotation.y = Math.PI;
    G.add(mesh);
    art.box = { canvas, ctx, tex };
  }
}
