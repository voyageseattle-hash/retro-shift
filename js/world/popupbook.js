// The book PAGE TURNER is raced on (tracks-popup.js), as far as it never moves: the edges of the two open pages, the
// stacks of pages under them, the spine and the cover board, lying on the bedroom floor. The paper, the printing, the
// pop-ups and the turning leaf are game/popup.js.

import * as THREE from '../../vendor/three.js';
import { M } from './shift.js';
import { BOOK, pageY } from './tracks-popup.js';

const PAPER = 0xffe6a8;
const YELLOW = 0xffd04a;

export function buildBook(world) {
  const L = world.layers;
  const { W, D } = BOOK;
  const floor = world.floorY;
  const V = (bx, y, bz) => new THREE.Vector3(-bx, y, bz);
  const dim = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
  // the leaves: the top one's edge bright, the stack under it fainter, fanned out a little toward the fore-edge
  const leaves = 7;
  for (const s of [-1, 1]) {
    for (let q = 0; q < leaves; q++) {
      const drop = 0.8 + q * 1.15;
      const fan = q * 0.9;
      const col = dim(PAPER, q ? 0.32 : 1);
      const y = (bx) => Math.max(floor + 1.6, pageY(bx) - drop);
      for (const bz of [-D / 2 - fan * 0.4, D / 2 + fan * 0.4]) {
        for (let k = 0; k < 24; k++) {
          const a = (s * (W + fan) * k) / 24;
          const b = (s * (W + fan) * (k + 1)) / 24;
          L.line(M.ALL, V(a, y(a), bz), V(b, y(b), bz), col);
        }
      }
      const x = s * (W + fan);
      L.line(M.ALL, V(x, y(x), -D / 2 - fan * 0.4), V(x, y(x), D / 2 + fan * 0.4), col);
    }
  }
  // the spine, down in the gutter
  L.line(M.ALL, V(0, pageY(0) - 0.75, -D / 2), V(0, pageY(0) - 0.75, D / 2), YELLOW);
  // the cover board, a little bigger than the pages, flat on the floor
  const cw = W + 16;
  const cd = D / 2 + 12;
  for (const y of [floor + 0.1, floor + 1.5]) {
    const c = [V(-cw, y, -cd), V(cw, y, -cd), V(cw, y, cd), V(-cw, y, cd)];
    for (let k = 0; k < 4; k++) L.line(M.ALL, c[k], c[(k + 1) % 4], YELLOW);
  }
  for (const [bx, bz] of [[-cw, -cd], [cw, -cd], [cw, cd], [-cw, cd]]) L.line(M.ALL, V(bx, floor + 0.1, bz), V(bx, floor + 1.5, bz), YELLOW);
  L.fillQuad(M.ALL, V(-cw, floor + 1.5, -cd), V(cw, floor + 1.5, -cd), V(cw, floor + 1.5, cd), V(-cw, floor + 1.5, cd));
  dieCut(world);
}

// The road is die-cut through every page: the cut edge of the paper runs along both sides of it, a bright lip and
// the thickness of the sheet under it, so the page reads as card right beside the car.
function dieCut(world) {
  const L = world.layers;
  const lip = new THREE.Color(PAPER).multiplyScalar(0.6).getHex();
  const under = new THREE.Color(PAPER).multiplyScalar(0.2).getHex();
  const CUT = 5; // how far outside the road the paper is cut (as the printing is, game/popup.js)
  const inOther = (path, x, z) => {
    for (const q of world.paths) {
      if (q === path) continue;
      const r2 = (q.halfW + CUT - 0.5) ** 2;
      for (let j = 0; j < q.N; j += 2) {
        const dx = q.px[j] - x;
        const dz = q.pz[j] - z;
        if (dx * dx + dz * dz < r2) return true;
      }
    }
    return false;
  };
  const y = (x) => pageY(-x) - 0.8 + 0.05;
  const a = new THREE.Vector3();
  for (const path of world.paths) {
    for (const s of [-1, 1]) {
      let prev = null;
      const end = path.closed ? path.N : path.N - 1;
      for (let i = 0; i <= end; i += 2) {
        const k = path.closed ? i % path.N : Math.min(i, path.N - 1);
        path.point(k, s * (path.halfW + CUT), 0, a);
        const here = Math.abs(a.x) < BOOK.W - 2 && Math.abs(a.z) < BOOK.D / 2 - 2 && !inOther(path, a.x, a.z) ? { x: a.x, z: a.z } : null;
        if (prev && here) {
          L.lineXYZ(M.ALL, prev.x, y(prev.x), prev.z, here.x, y(here.x), here.z, lip);
          L.lineXYZ(M.ALL, prev.x, y(prev.x) - 0.45, prev.z, here.x, y(here.x) - 0.45, here.z, under);
          if ((i / 2) % 4 === 0) L.lineXYZ(M.ALL, here.x, y(here.x), here.z, here.x, y(here.x) - 0.45, here.z, under);
        }
        prev = here;
      }
    }
  }
}
