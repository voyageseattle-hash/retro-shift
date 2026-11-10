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
}
