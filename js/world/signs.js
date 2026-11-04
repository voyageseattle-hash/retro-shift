// Overhead warning boards, so the course tells you what's coming instead of the HUD: a sign ahead of every
// one-world wall, every one-world stretch of road and every shortcut you can see in BOTH. Lens-only routes are
// secrets and stay unsigned (covers.js hides them).

import * as THREE from '../../vendor/three.js';
import { M, RED, BLUE, solidIn, colorForMask } from './shift.js';

const hexCss = (c) => `#${c.toString(16).padStart(6, '0')}`;

// Which lenses a road of this mask is there in, or a wall of this mask is gone in.
function lensWords(mask, gone) {
  const red = solidIn(mask, RED) !== gone;
  const blue = solidIn(mask, BLUE) !== gone;
  if (red && blue) return gone ? 'RED OR BLUE' : '';
  return red ? 'RED' : blue ? 'BLUE' : '';
}

export function boardTexture(title, sub, color, arrow) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 200;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const g = cv.getContext('2d');
    const col = hexCss(color);
    g.clearRect(0, 0, 512, 200);
    g.fillStyle = 'rgba(8, 3, 20, 0.88)';
    g.fillRect(0, 0, 512, 200);
    g.strokeStyle = col;
    g.lineWidth = 10;
    g.strokeRect(5, 5, 502, 190);
    // hazard stripe along the bottom
    g.save();
    g.beginPath();
    g.rect(10, 168, 492, 22);
    g.clip();
    g.fillStyle = col;
    for (let x = -40; x < 520; x += 36) {
      g.beginPath();
      g.moveTo(x, 190);
      g.lineTo(x + 18, 190);
      g.lineTo(x + 40, 168);
      g.lineTo(x + 22, 168);
      g.fill();
    }
    g.restore();
    g.fillStyle = col;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = col;
    g.shadowBlur = 14;
    const t = arrow < 0 ? `◀ ${title}` : arrow > 0 ? `${title} ▶` : title;
    let size = 64;
    g.font = `italic ${size}px 'Russo One', 'Chakra Petch', sans-serif`;
    while (g.measureText(t).width > 470 && size > 30) g.font = `italic ${(size -= 4)}px 'Russo One', 'Chakra Petch', sans-serif`;
    g.fillText(t, 256, sub ? 70 : 88);
    if (sub) {
      g.shadowBlur = 0;
      g.fillStyle = '#f2ecff';
      g.font = `700 30px 'Chakra Petch', sans-serif`;
      g.fillText(sub, 256, 134);
    }
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  return tex;
}

// An overhead board on a gantry: over the half of the road the route leaves from (side +1 right, -1 left), or
// over the middle (side 0), facing the oncoming car.
function addSign(world, path, i, side, title, sub, mask, arrow = 0) {
  i = path.wrap(i);
  const color = colorForMask(mask) === colorForMask(M.ALL) ? 0xff4fd8 : colorForMask(mask);
  const W = side ? 9 : 11;
  const H = (W * 200) / 512;
  const lift = 6.5;
  const mid = path.point(i, side * path.halfW * 0.48, 0, new THREE.Vector3());
  const mat = new THREE.MeshBasicMaterial({ map: boardTexture(title, sub, color, arrow), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  board.position.set(mid.x, mid.y + lift + H / 2, mid.z);
  board.rotation.y = Math.atan2(-path.thx[i], -path.thz[i]);
  // after the see-through buildings and road glass, so nothing tints it out
  board.renderOrder = 10;
  world.group.add(board);
  // a red board goes with the red world (gone through the blue lens), a blue one with the blue world
  const red = solidIn(mask, RED) && !solidIn(mask, BLUE);
  const blue = solidIn(mask, BLUE) && !solidIn(mask, RED);
  if (red || blue) world.layers.signs.push({ mat, hideIn: red ? BLUE : RED });
  // the gantry: a post at each edge of the road and a beam across under the board
  const L = world.layers;
  const top = lift + H * 0.15;
  const a = path.point(i, -path.halfW - 0.5, 0, new THREE.Vector3());
  const b = path.point(i, path.halfW + 0.5, 0, new THREE.Vector3());
  L.lineXYZ(M.ALL, a.x, a.y, a.z, a.x, a.y + top, a.z, color);
  L.lineXYZ(M.ALL, b.x, b.y, b.z, b.x, b.y + top, b.z, color);
  L.lineXYZ(M.ALL, a.x, a.y + top, a.z, b.x, b.y + top, b.z, color);
}

export function buildSigns(world) {
  const def = world.def;
  const main = world.main;
  const back = (path, at, metres) => path.index(at) - Math.round(metres / path.ds);
  for (const p of world.paths) {
    const b = p.def;
    // lens-only routes are secrets, hidden behind the other world's billboards and buildings (covers.js)
    if (p === main || !b?.label || b.hatch || b.facade || b.mask === M.RO || b.mask === M.BO) continue;
    const where = lensWords(b.mask ?? M.ALL, false);
    const sub = b.mask === M.RO || b.mask === M.BO ? `${where} LENS ONLY` : where ? `${where} ROAD` : b.mask === M.X ? 'BOTH WORLDS ONLY' : '';
    addSign(world, main, back(main, b.from, 75), p.side, b.label, sub, b.mask ?? M.ALL, p.side);
  }
  for (const o of def.obstacles || []) {
    if (o.type !== 'wall' || o.path) continue;
    const pass = lensWords(o.mask, true);
    if (!pass) continue;
    const name = o.mask === M.X ? 'OVERLAP' : lensWords(o.mask, false) || 'WHITE';
    addSign(world, main, back(main, o.at, 60), 0, `${name} WALL`, `PASSES IN ${pass}`, o.mask);
  }
  for (const g of def.gaps || []) {
    const path = g.path ? world.paths.find((q) => q.id === g.path) : main;
    if (!path || g.secret) continue;
    const there = lensWords(g.mask, false);
    const name = there === 'RED' ? 'RED' : there === 'BLUE' ? 'BLUE' : 'OVERLAP';
    addSign(world, path, back(path, g.at, 60), 0, `${name} BRIDGE`, there === 'RED OR BLUE' || !there ? 'STAY IN BOTH' : `NO ROAD IN ${there === 'RED' ? 'BLUE' : 'RED'}`, g.mask);
  }
}
