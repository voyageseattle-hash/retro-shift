// Covers for the lens-only routes. A blue-only shortcut is hidden in the red world: in BOTH and RED a billboard
// stands across its mouth and a row of red buildings fills the ground it runs over, so all you see is skyline.
// Shift to BLUE and the red world goes, taking the cover with it, and the road is there. A red-only route gets
// blue cover the same way. (Grid City's rooftops and the Shift Tunnels hatch have their own.)

import * as THREE from '../../vendor/three.js';
import { M, RED, BLUE, colorForMask } from './shift.js';
import { boardTexture } from './signs.js';

const TEASE = ['NOTHING TO SEE HERE', 'NO ROAD AHEAD', 'DEAD END', 'KEEP TO THE ROAD', 'ROAD CLOSED', 'PRIVATE PROPERTY'];
// what a hidden bridge passes for where it crosses the road: overhead traffic signs
const GANTRY = [['NEXT EXIT', 'NONE'], ['LANES MERGE', 'KEEP RIGHT'], ['SPEED LIMIT', 'NONE'], ['NO EXIT', 'KEEP DRIVING'], ['ALL LANES', 'STRAIGHT ON'], ['EXIT CLOSED', 'NO DETOUR']];

// Is (x, z) at height y clear of every road but `skip`?
function offRoads(world, skip, x, z, y, r) {
  for (const path of world.paths) {
    if (path === skip) continue;
    for (let i = 0; i < path.N; i += 2) {
      const dx = path.px[i] - x;
      const dz = path.pz[i] - z;
      if (dx * dx + dz * dz < (path.halfW + r) ** 2 && path.py[i] > world.floorY && Math.abs(path.py[i] - y) < 60) return false;
    }
  }
  return true;
}

export function buildCovers(world) {
  const main = world.main;
  const L = world.layers;
  let n = 0;
  for (const b of world.paths) {
    const d = b.def;
    if (b === main || !d || d.hatch || d.facade || (d.mask !== M.RO && d.mask !== M.BO)) continue;
    const cover = d.mask === M.BO ? M.R : M.B; // the other world's colour, there in BOTH and that lens
    const lens = d.mask === M.BO ? BLUE : RED; // the lens that takes it away
    const fr = {};
    // where the route has peeled clear of the main road
    let j0 = -1;
    let j1 = -1;
    for (let j = 0; j < b.N; j++) {
      const clearOf = !main.frame(b.px[j], b.pz[j], -1, fr, b.py[j]) || Math.abs(fr.lat) > main.halfW + b.halfW + 1.5 || Math.abs(fr.y - b.py[j]) > 6;
      if (clearOf && j0 < 0) j0 = j;
      if (clearOf) j1 = j;
    }
    if (j0 < 0) continue;

    // the billboard across the mouth, facing the oncoming car, with posts down to the floor
    const i = Math.min(b.N - 1, j0 + 2);
    const W = b.halfW * 2 + 4;
    const H = (W * 200) / 512;
    const c = b.point(i, 0, 0, new THREE.Vector3());
    const yaw = Math.atan2(b.thx[i], b.thz[i]);
    const tex = boardTexture(TEASE[(n + (world.def.seed || 0)) % TEASE.length], '', colorForMask(cover), 0);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    board.position.set(c.x, c.y + 1.2 + H / 2, c.z);
    board.rotation.y = yaw + Math.PI;
    board.renderOrder = 10;
    world.group.add(board);
    L.signs.push({ mat, hideIn: lens, at: board.position });
    L.box(cover, c.x, c.y + 1.2 + H / 2, c.z, W, H, 0.6, yaw, null, true);
    const ux = Math.cos(yaw);
    const uz = -Math.sin(yaw);
    // (a strip with another world under it, mobius.js, has no floor to stand posts and buildings on)
    const floats = !!world.mob;
    for (const s of floats ? [] : [-1, 1]) {
      const px = c.x + ux * s * (W / 2 - 0.4);
      const pz = c.z + uz * s * (W / 2 - 0.4);
      L.tower(cover, px, world.floorY, pz, 0.8, c.y + 1.2 - world.floorY, 0.8, yaw);
    }

    // buildings over the ground it runs across: their roofs carry the road in its own lens
    const step = 4;
    for (let j = j0 + 6; j <= j1 - 2 && !floats; j += step) {
      const p = b.point(j, 0, 0, new THREE.Vector3());
      const h = p.y - world.floorY - 0.4;
      if (h < 4) continue;
      if (!offRoads(world, b, p.x, p.z, p.y, b.halfW + 1)) continue;
      const ty = Math.atan2(b.thx[j], b.thz[j]);
      L.tower(cover, p.x, world.floorY, p.z, b.halfW * 2 + 1, h, b.ds * step - 0.4, ty);
    }
    // where it crosses over a road, it passes for an overhead sign gantry spanning that road at the bridge's height
    let run = [];
    const flush = () => {
      if (run.length >= 2) gantry(world, b, run[Math.floor(run.length / 2)], cover, lens, n + run[0].j);
      run = [];
    };
    for (const path of world.paths) {
      if (path === b) continue;
      const fq = {};
      for (let j = 0; j < b.N; j += 2) {
        const over = path.frame(b.px[j], b.pz[j], -1, fq) && Math.abs(fq.lat) < path.halfW + 1 && b.py[j] - fq.y > 4 && b.py[j] - fq.y < 40;
        if (over) run.push({ j, path, i: fq.i, y: fq.y });
        else flush();
      }
      flush();
    }
    n++;
  }
}

// An overhead gantry across `on.path` where the hidden route passes over it: a girder at the bridge's height on two
// posts beside the road, and a sign board hung under it facing the traffic. Gone in the route's own lens, where
// the bridge itself is there instead.
function gantry(world, b, on, cover, lens, seed) {
  const L = world.layers;
  const p = on.path;
  const i = on.i;
  const top = b.py[on.j] - 0.6;
  const span = p.halfW + 2.5;
  const a = p.point(i, -span, 0, new THREE.Vector3());
  const c = p.point(i, span, 0, new THREE.Vector3());
  // posts and girder
  for (const q of [a, c]) L.tower(cover, q.x, q.y, q.z, 0.9, top - q.y, 0.9, Math.atan2(p.thx[i], p.thz[i]));
  const mid = a.clone().lerp(c, 0.5);
  const yaw = Math.atan2(p.thx[i], p.thz[i]);
  L.box(cover, mid.x, top - 0.6, mid.z, span * 2, 1.2, 1.4, yaw, null, true);
  // the board, facing the traffic
  const [t1, t2] = GANTRY[seed % GANTRY.length];
  // hung clear of the cars (4.5 m of headroom), shrunk to fit under a low bridge, left off under a very low one
  let W = Math.min(p.halfW * 1.4, 14);
  let H = (W * 200) / 512;
  const room = top - 1.2 - (mid.y + 4.5);
  if (room < 1.6) return;
  if (H > room) {
    H = room;
    W = (H * 512) / 200;
  }
  const mat = new THREE.MeshBasicMaterial({ map: boardTexture(t1, t2, colorForMask(cover), 0), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  board.position.set(mid.x, top - 1.2 - H / 2, mid.z);
  board.rotation.y = yaw + Math.PI;
  board.renderOrder = 10;
  world.group.add(board);
  L.signs.push({ mat, hideIn: lens, at: board.position });
  L.box(cover, mid.x, top - 1.2 - H / 2, mid.z, W + 0.4, H + 0.4, 0.3, yaw, null, false);
}
