// Covers for the lens-only routes. A blue-only shortcut is hidden in the red world: in BOTH and RED a billboard
// stands across its mouth and a row of red buildings fills the ground it runs over, so all you see is skyline.
// Shift to BLUE and the red world goes, taking the cover with it, and the road is there. A red-only route gets
// blue cover the same way. (Grid City's rooftops and the Shift Tunnels hatch have their own.)

import * as THREE from '../../vendor/three.js';
import { M, RED, BLUE, colorForMask } from './shift.js';
import { boardTexture } from './signs.js';

const TEASE = ['NOTHING TO SEE HERE', 'NO ROAD AHEAD', 'DEAD END', 'KEEP TO THE ROAD', 'ROAD CLOSED', 'PRIVATE PROPERTY'];

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
      const clearOf = !main.frame(b.px[j], b.pz[j], -1, fr) || Math.abs(fr.lat) > main.halfW + b.halfW + 1.5 || Math.abs(fr.y - b.py[j]) > 6;
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
    L.signs.push({ mat, hideIn: lens });
    L.box(cover, c.x, c.y + 1.2 + H / 2, c.z, W, H, 0.6, yaw, null, true);
    const ux = Math.cos(yaw);
    const uz = -Math.sin(yaw);
    for (const s of [-1, 1]) {
      const px = c.x + ux * s * (W / 2 - 0.4);
      const pz = c.z + uz * s * (W / 2 - 0.4);
      L.tower(cover, px, world.floorY, pz, 0.8, c.y + 1.2 - world.floorY, 0.8, yaw);
    }

    // buildings over the ground it runs across: their roofs carry the road in its own lens
    const step = 4;
    for (let j = j0 + 6; j <= j1 - 2; j += step) {
      const p = b.point(j, 0, 0, new THREE.Vector3());
      const h = p.y - world.floorY - 0.4;
      if (h < 4) continue;
      if (!offRoads(world, b, p.x, p.z, p.y, b.halfW + 1)) continue;
      const ty = Math.atan2(b.thx[j], b.thz[j]);
      L.tower(cover, p.x, world.floorY, p.z, b.halfW * 2 + 1, h, b.ds * step - 0.4, ty);
    }
    n++;
  }
}
