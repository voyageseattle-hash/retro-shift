// SLIDE FIFTEEN's art pass: what makes the course read, from behind the car, as a giant sliding puzzle lying on a
// bed. slidefifteen.js is the board, the frame and the roads; this file is everything printed on them and standing
// round them.
//
//   on the board   every tile is a thick slab of toy plastic with its number printed across it and on the toy
//                  blocks standing on its corners (they ride with the tile, so a slide is something you see from
//                  anywhere), a raised kerb round its edge so the seams between tiles show from the road, and a
//                  deep tray under it all. The empty slot is a lit pit with a shaft of light standing in it.
//   at the mouths  an arch over each mouth in the frame, and under it a lamp in a lens's colour that's lit only
//                  while that mouth is open to that lens: you can read the board's ways in from down the straight.
//   on the bed     the things a puzzle gets left among: pillows against a slatted headboard, a teddy bear sat at
//                  one corner, the puzzle's box lid, the tile that was never in the box (16), alphabet blocks,
//                  marbles and crayons, and a string of warm bulbs along the frame's outer rail.
//
// Colour: red and blue stay the two worlds. Yellow, amber and cream are the neutrals, and everything neutral is
// drawn through the world's own layers or through tintMat below, so a lens turns it that lens's colour and
// nothing of the other colour is left on screen.
//
// Cost: the scenery goes into the world's batches (no new draw calls), a tile's dressing into that tile's own
// batches, and the printed pieces are two textures: one picture of the solved board that every tile's face is cut
// from, and one sheet of stickers. One extra mesh a tile.

import * as THREE from '../../vendor/three.js';
import { TILE, SIZE, FRAME, DX, DZ, cellX, cellZ } from './slidepuzzle.js';
import { M, RED, BLUE, COLORS } from './shift.js';
import { TOY_YELLOW } from './toybox.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const { HW } = FRAME;
export const DEPTH = -8; // the tray's floor: the tiles are slabs this thick
const AMBER = 0xffa23a;
const CREAM = 0xfff0c4;
const ORANGE = 0xff8a3a;
const WOOD = 0xc8862a;
const DIM = 0x8a6c14;
const FONT = '"Arial Black", "Arial Rounded MT Bold", "Helvetica Neue", Impact, sans-serif';

// ------------------------------------------------------------------ printed pieces
// Textured quads, gathered into one mesh.
class Quads {
  constructor() {
    this.p = [];
    this.uv = [];
  }
  // a, b along the bottom (left to right as it's read), c, d back along the top; rect [u0, v0, u1, v1]
  quad(a, b, c, d, [u0, v0, u1, v1]) {
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  }
  // flat on the ground, reading true to someone looking down the board toward -z
  flat(x, y, z, w, h, rect) {
    this.quad(V(x - w / 2, y, z + h / 2), V(x + w / 2, y, z + h / 2), V(x + w / 2, y, z - h / 2), V(x - w / 2, y, z - h / 2), rect);
  }
  mesh(mat, order = 3) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = order;
    return m;
  }
}

// A printed, glowing material: full colour with both worlds open, the lens's colour alone through a lens.
function tintMat(tex, U, k) {
  const u = { uSaTint: U.tint, uSaBoth: U.both, uSaK: k };
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSaTint;\nuniform float uSaBoth;\nuniform float uSaK;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ float sl = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)); diffuseColor.rgb = mix(uSaTint * sl, diffuseColor.rgb, uSaBoth) * uSaK; }');
  };
  m.customProgramCacheKey = () => 'slideart';
  return m;
}

function canvasTex(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const q = i % 2 ? r * 0.45 : r;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  ctx.closePath();
}

// The sticker sheet: 8 by 8 cells. Numbers 1 to 16 as toy-block faces, letters and shapes, the box lid's label.
const INKS = ['#ffd23a', '#ff9a2e', '#fff0c4', '#ffe08a'];
function makeSheet() {
  const S = 2048;
  const C = S / 8;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const face = (i, text, ink, shape, a = 1) => {
    ctx.globalAlpha = a;
    const x = (i % 8) * C;
    const y = (i >> 3) * C;
    ctx.fillStyle = 'rgba(255,190,60,0.07)';
    rr(ctx, x + 14, y + 14, C - 28, C - 28, 30);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.lineWidth = 3;
    rr(ctx, x + 34, y + 34, C - 68, C - 68, 18);
    ctx.stroke();
    if (shape === 'star') {
      starPath(ctx, x + C / 2, y + C / 2 + 6, 72);
      ctx.fillStyle = ink;
      ctx.fill();
    } else if (shape === 'heart') {
      ctx.fillStyle = ink;
      ctx.beginPath();
      const hx = x + C / 2;
      const hy = y + C / 2 + 50;
      ctx.moveTo(hx, hy);
      ctx.bezierCurveTo(hx - 110, hy - 70, hx - 60, hy - 150, hx, hy - 96);
      ctx.bezierCurveTo(hx + 60, hy - 150, hx + 110, hy - 70, hx, hy);
      ctx.fill();
    } else {
      ctx.font = `900 ${text.length > 1 ? 118 : 150}px ${FONT}`;
      ctx.fillStyle = ink;
      ctx.fillText(text, x + C / 2, y + C / 2 + 8);
    }
  };
  // (16 is only ever seen big, on the spare tile: printed fainter, so it doesn't flare)
  for (let k = 1; k <= 16; k++) face(k - 1, String(k), INKS[k % 2 ? 0 : 2], null, k === 16 ? 0.45 : 1);
  'ABCXYZ'.split('').forEach((ch, i) => face(16 + i, ch, INKS[(i % 3) + 1]));
  face(22, '', INKS[0], 'star');
  face(23, '', INKS[1], 'heart');
  // the lid's label: rows 3 and 4, the full width
  const ly = 3 * C;
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = INKS[0];
  ctx.lineWidth = 14;
  rr(ctx, 20, ly + 20, S - 40, 2 * C - 40, 60);
  ctx.stroke();
  ctx.font = `900 250px ${FONT}`;
  ctx.fillStyle = INKS[2];
  ctx.fillText('SLIDE', 520, ly + C + 10);
  ctx.fillStyle = INKS[0];
  ctx.fillText('FIFTEEN', 1430, ly + C + 10, 1080);
  const rect = (col, row, w = 1, h = 1) => [col / 8, 1 - (row + h) / 8, (col + w) / 8, 1 - row / 8];
  return {
    tex: canvasTex(c),
    num: (k) => rect((k - 1) % 8, (k - 1) >> 3),
    glyph: (i) => rect(i % 8, 2),
    star: rect(6, 2),
    label: rect(0, 3, 8, 2),
  };
}

// The picture of the solved board, 4 by 4 cells: each tile's face is its cell of this. A slab of printed plastic:
// a bright bevel, a halftone fade in from its edges, its number huge across it and small at each corner (each one
// turned to read from its own side), and its piece of the studio's mark over the top.
function makeFaces() {
  const S = 2048;
  const C = S / 4;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (let cell = 0; cell < 15; cell++) {
    const x = (cell % 4) * C;
    const y = (cell >> 2) * C;
    const warm = ((cell % 4) + (cell >> 2)) % 2 === 0;
    const ink = warm ? '#ffd23a' : '#ffb04a';
    ctx.fillStyle = warm ? 'rgb(26,17,3)' : 'rgb(15,9,5)';
    rr(ctx, x + 8, y + 8, C - 16, C - 16, 34);
    ctx.fill();
    // halftone, biggest at the edge
    ctx.fillStyle = warm ? 'rgba(255,170,40,0.09)' : 'rgba(255,120,50,0.05)';
    for (let i = 0; i < 22; i++) for (let j = 0; j < 22; j++) {
      const px = 28 + i * 21.7 + (j % 2 ? 10.8 : 0);
      const py = 28 + j * 21.7;
      const d = Math.min(px, py, C - px, C - py);
      const r = 8 * (1 - d / 110);
      if (r < 0.8 || px > C - 20) continue;
      ctx.beginPath();
      ctx.arc(x + px, y + py, r, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = 11;
    rr(ctx, x + 15, y + 15, C - 30, C - 30, 30);
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 4;
    rr(ctx, x + 40, y + 40, C - 80, C - 80, 16);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const n = String(cell + 1);
    ctx.font = `900 ${n.length > 1 ? 250 : 330}px ${FONT}`;
    ctx.fillStyle = warm ? 'rgba(255,210,58,0.07)' : 'rgba(255,150,60,0.07)';
    ctx.fillText(n, x + C / 2, y + C / 2 + 14);
    ctx.lineWidth = 6;
    ctx.globalAlpha = 0.7;
    ctx.strokeText(n, x + C / 2, y + C / 2 + 14);
    ctx.globalAlpha = 1;
    ctx.font = `900 58px ${FONT}`;
    ctx.fillStyle = '#fff0c4';
    for (let q = 0; q < 4; q++) {
      ctx.save();
      ctx.translate(x + C / 2, y + C / 2);
      ctx.rotate((q * Math.PI) / 2);
      ctx.fillText(n, -C / 2 + 84, -C / 2 + 86);
      ctx.restore();
    }
  }
  const tex = canvasTex(c);
  // the mark across the whole board, letterboxed as it's wider than tall
  const img = new Image();
  img.onload = () => {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8;
    const h = S * 0.795;
    ctx.save();
    ctx.beginPath();
    for (let cell = 0; cell < 15; cell++) ctx.rect((cell % 4) * C + 22, (cell >> 2) * C + 22, C - 44, C - 44);
    ctx.clip();
    // (the art is white lines: stamp it through toy yellow)
    const t = document.createElement('canvas');
    t.width = S;
    t.height = Math.round(h);
    const tc = t.getContext('2d');
    tc.drawImage(img, 0, 0, t.width, t.height);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = '#ffd23a';
    tc.fillRect(0, 0, t.width, t.height);
    ctx.drawImage(t, 0, (S - h) / 2);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    tex.needsUpdate = true;
  };
  img.src = 'assets/splash/ff-lines.webp';
  return tex;
}

// ------------------------------------------------------------------ solid shapes, drawn into a layer set
// The four upright faces of a box turned by yaw (as Layers.box turns it): where each one's middle is, the way it
// faces, and which way is right to someone reading it.
function boxFaces(cx, cz, w, d, yaw) {
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const X = [cs, -sn];
  const Z = [sn, cs];
  return [
    { n: X, half: w / 2, span: d },
    { n: Z, half: d / 2, span: w },
    { n: [-X[0], -X[1]], half: w / 2, span: d },
    { n: [-Z[0], -Z[1]], half: d / 2, span: w },
  ].map((f) => ({ ...f, r: [f.n[1], -f.n[0]], x: cx + f.n[0] * f.half, z: cz + f.n[1] * f.half }));
}

// A toy block: a cube with a dark body, an inset border on every face, and either a sticker on each face (give
// `rect`) or a diamond drawn on it.
function toyBlock(L, Q, mask, cx, y0, cz, s, yaw, col, rect) {
  const cy = y0 + s / 2;
  L.box(mask, cx, cy, cz, s, s, s, yaw, col, true);
  const e = 0.12;
  for (const f of boxFaces(cx, cz, s, s, yaw)) {
    const P = (u, v) => V(f.x + f.n[0] * e + f.r[0] * u * s, cy + v * s, f.z + f.n[1] * e + f.r[1] * u * s);
    const c = [P(-0.4, -0.4), P(0.4, -0.4), P(0.4, 0.4), P(-0.4, 0.4)];
    for (let i = 0; i < 4; i++) L.line(mask, c[i], c[(i + 1) % 4], col);
    L.quad(mask, P(-0.5, 0.42), P(0.5, 0.42), P(0.5, 0.5), P(-0.5, 0.5), col, 0.35);
    if (rect && Q) Q.quad(P(-0.36, -0.36), P(0.36, -0.36), P(0.36, 0.36), P(-0.36, 0.36), rect);
    else {
      const d = [P(0, -0.3), P(0.3, 0), P(0, 0.3), P(-0.3, 0)];
      for (let i = 0; i < 4; i++) L.line(mask, d[i], d[(i + 1) % 4], col);
      L.quad(mask, d[0], d[1], d[2], d[3], col, 0.22);
    }
  }
  // the top: a border, and its sticker lying flat
  const T = (u, v) => V(cx + (u * Math.cos(yaw) + v * Math.sin(yaw)) * s, y0 + s + e, cz + (-u * Math.sin(yaw) + v * Math.cos(yaw)) * s);
  const t = [T(-0.4, -0.4), T(0.4, -0.4), T(0.4, 0.4), T(-0.4, 0.4)];
  for (let i = 0; i < 4; i++) L.line(mask, t[i], t[(i + 1) % 4], col);
  if (rect && Q) Q.quad(T(-0.36, 0.36), T(0.36, 0.36), T(0.36, -0.36), T(-0.36, -0.36), rect);
}

// A wire ball or egg with a dark body: centre c, radii rx, ry, rz, turned by yaw.
function ellipsoid(L, mask, c, rx, ry, rz, col, { lat = 6, lon = 12, yaw = 0, fill = true } = {}) {
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const P = (i, j) => {
    const th = (Math.PI * i) / lat;
    const ph = (TAU * j) / lon;
    const x = Math.sin(th) * Math.cos(ph) * rx;
    const z = Math.sin(th) * Math.sin(ph) * rz;
    return V(c.x + x * cs + z * sn, c.y + Math.cos(th) * ry, c.z - x * sn + z * cs);
  };
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
    const a = P(i, j);
    const b = P(i + 1, j);
    const d = P(i, j + 1);
    L.line(mask, a, b, col);
    if (i > 0) L.line(mask, a, d, col);
    if (fill) L.fillQuad(mask, a, b, P(i + 1, j + 1), d);
  }
}

// A pillow: a plump cushion hx by hz and h high, its seam piped in a world's colour.
function pillow(L, cx, y0, cz, hx, hz, h, yaw, pipe) {
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const nu = 16;
  const nv = 8;
  const P = (i, j, lift = 1) => {
    const u = (i / nu) * 2 - 1;
    const v = (j / nv) * 2 - 1;
    // (pinched corners: the sides pull in a little toward each corner)
    const x = hx * u * (1 - 0.07 * v * v);
    const z = hz * v * (1 - 0.07 * u * u);
    const y = h * (0.16 + 0.84 * Math.sqrt(Math.max(0, (1 - u ** 4) * (1 - v ** 4)))) * lift;
    return V(cx + x * cs + z * sn, y0 + y, cz - x * sn + z * cs);
  };
  const col = 0xc9b27a;
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    if (i < nu) L.line(M.ALL, P(i, j), P(i + 1, j), col);
    if (j < nv) L.line(M.ALL, P(i, j), P(i, j + 1), col);
    if (i < nu && j < nv) L.fillQuad(M.ALL, P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
  }
  // the seam round its edge, and its sides down to the quilt
  const edge = [];
  for (let i = 0; i <= nu; i++) edge.push([i, 0]);
  for (let j = 1; j <= nv; j++) edge.push([nu, j]);
  for (let i = nu - 1; i >= 0; i--) edge.push([i, nv]);
  for (let j = nv - 1; j >= 0; j--) edge.push([0, j]);
  for (let k = 0; k + 1 < edge.length; k++) {
    const a = P(...edge[k]);
    const b = P(...edge[k + 1]);
    const a0 = a.clone().setY(y0);
    const b0 = b.clone().setY(y0);
    L.fillQuad(M.ALL, a, b, b0, a0);
    L.line(pipe, a, b);
    L.quad(pipe, a, b, b.clone().setY(b.y - 1.6), a.clone().setY(a.y - 1.6), null, 0.5);
    L.line(M.ALL, a0, b0, col);
  }
  // a button in the middle, and the creases running out from it
  const mid = P(nu / 2, nv / 2);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    L.line(pipe, mid, V(mid.x + Math.cos(a) * 6, mid.y - 0.4, mid.z + Math.sin(a) * 6));
  }
}

// A crayon lying on the quilt: a six-sided stick with a paper wrapper and a point.
function crayon(L, mask, x, y, z, len, r, yaw) {
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  const P = (s, k, rad = r) => {
    const a = (k / 6) * TAU + Math.PI / 6;
    const o = Math.cos(a) * rad;
    return V(x + dx * s + dz * o, y + r * 0.87 + Math.sin(a) * rad, z + dz * s - dx * o);
  };
  const stops = [-len / 2, -len * 0.3, len * 0.26, len * 0.36];
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i + 1 < stops.length; i++) {
      L.line(mask, P(stops[i], k), P(stops[i + 1], k));
      L.fillQuad(mask, P(stops[i], k), P(stops[i + 1], k), P(stops[i + 1], k + 1), P(stops[i], k + 1));
    }
    for (const s of stops) L.line(mask, P(s, k), P(s, k + 1));
    // the wrapper: a band of light between the middle two stops
    L.quad(mask, P(stops[1], k), P(stops[2], k), P(stops[2], k + 1), P(stops[1], k + 1), null, 0.1);
    L.line(mask, P(stops[3], k), P(len / 2, k, 0.4));
    L.fillQuad(mask, P(stops[3], k), P(len / 2, k, 0.4), P(len / 2, k + 1, 0.4), P(stops[3], k + 1));
  }
}

// A string of bulbs sagging between two points.
const BULBS = [0xffc45a, CREAM, ORANGE];
function bulbString(L, a, b, sag, n, size, k0 = 0) {
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    const p = a.clone().lerp(b, f);
    p.y -= sag * 4 * f * (1 - f);
    L.line(M.ALL, prev, p, DIM);
    if (i < n) {
      const col = BULBS[(k0 + i) % 3];
      const top = p.y - size * 0.3;
      const bot = p.y - size * 1.7;
      L.quad(M.ALL, V(p.x - size * 0.5, top, p.z), V(p.x + size * 0.5, top, p.z), V(p.x + size * 0.5, bot, p.z), V(p.x - size * 0.5, bot, p.z), col, 1);
      L.quad(M.ALL, V(p.x, top, p.z - size * 0.5), V(p.x, top, p.z + size * 0.5), V(p.x, bot, p.z + size * 0.5), V(p.x, bot, p.z - size * 0.5), col, 1);
    }
    prev = p;
  }
}

// ------------------------------------------------------------------ the art, as the rig uses it
export class SlideArt {
  constructor(rig) {
    this.rig = rig;
    this.U = { tint: { value: new THREE.Color(1, 1, 1) }, both: { value: 1 } };
    this.kFace = { value: 0.8 };
    this.sheet = makeSheet();
    this.stickers = tintMat(this.sheet.tex, this.U, { value: 0.7 });
    this.faces = tintMat(makeFaces(), this.U, this.kFace);
  }

  // ---- a tile: its printed face, kerbs, sides, and the blocks and studs on its corners (all in the tile's space)
  tile(pl, L) {
    const k = pl.k;
    const h = TILE / 2 - 1;
    const y0 = -0.14;
    // the face: its cell of the solved picture
    const home = k - 1;
    const g = new THREE.PlaneGeometry(2 * h, 2 * h);
    g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute('uv');
    const pos = g.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, ((home % 4) + (pos.getX(i) + h) / (2 * h)) / 4, 1 - ((home >> 2) + (pos.getZ(i) + h) / (2 * h)) / 4);
    const face = new THREE.Mesh(g, this.faces);
    face.position.y = y0 + 0.05;
    face.renderOrder = 2;
    pl.group.add(face);

    // which sides a road leaves by, and which corners a bend wraps round
    const roads = this.rig.puzzle.roads[k];
    const used = new Set(roads.flat());
    const bends = new Set(roads.filter(([a, b]) => (a + 2) % 4 !== b).map(([a, b]) => `${DX[a] + DX[b]},${DZ[a] + DZ[b]}`));

    // a raised kerb round the edge, open where a road crosses it: the seams between tiles, seen from the road
    for (let s = 0; s < 4; s++) {
      const ox = DX[s];
      const oz = DZ[s];
      const tx = DZ[s];
      const tz = DX[s];
      const gap = HW + 3.2;
      for (const [s0, s1] of used.has(s) ? [[-h, -gap], [gap, h]] : [[-h, h]]) {
        const P = (t, inn, y) => V(ox * (h - inn) + tx * t, y, oz * (h - inn) + tz * t);
        L.quad(M.ALL, P(s0, 0, y0), P(s1, 0, y0), P(s1, 0, y0 + 1.3), P(s0, 0, y0 + 1.3), TOY_YELLOW, 0.05);
        L.quad(M.ALL, P(s0, 0, y0 + 1.3), P(s1, 0, y0 + 1.3), P(s1, 1.1, y0 + 1.3), P(s0, 1.1, y0 + 1.3), TOY_YELLOW, 0.08);
        L.fillQuad(M.ALL, P(s0, 1.1, y0 + 1.3), P(s1, 1.1, y0 + 1.3), P(s1, 1.1, y0), P(s0, 1.1, y0));
        L.line(M.ALL, P(s0, 1.1, y0 + 1.3), P(s1, 1.1, y0 + 1.3), TOY_YELLOW);
        // (the kerb's ends at a gap: a post either side of the road, like a gate in the seam)
        if (used.has(s)) {
          const e = s0 < 0 ? s1 : s0;
          L.line(M.ALL, P(e, 0, y0), P(e, 0, y0 + 1.3), TOY_YELLOW);
          L.line(M.ALL, P(e, 1.1, y0), P(e, 1.1, y0 + 1.3), TOY_YELLOW);
        }
      }
      // the slab's side, down into the tray: bands and ribs, so it reads as a thick block where the slot shows it
      for (const y of [-2.7, -5.3]) L.line(M.ALL, V(ox * h + tx * -h, y, oz * h + tz * -h), V(ox * h + tx * h, y, oz * h + tz * h), DIM);
      for (let t = -h + 14; t < h; t += 14) L.line(M.ALL, V(ox * h + tx * t, y0, oz * h + tz * t), V(ox * h + tx * t, DEPTH + 0.1, oz * h + tz * t), DIM);
    }

    // the corners: a number block (with a smaller one on top) on two that no bend wraps round, a stud on the rest
    const Q = new Quads();
    const corners = [[1, 1], [-1, -1], [1, -1], [-1, 1]].filter(([sx, sz]) => !bends.has(`${sx},${sz}`));
    const blocks = corners.slice(0, 2);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
      const x = sx * 36;
      const z = sz * 36;
      const n = blocks.findIndex(([a, b]) => a === sx && b === sz);
      if (n < 0) {
        L.cylinder(M.ALL, x, y0, z, 3.2, 1.8, 10, 1, TOY_YELLOW);
        const c = V(x, y0 + 1.8, z);
        L.ring(M.ALL, c, V(1, 0, 0), V(0, 0, 1), 1.6, 8, DIM);
        continue;
      }
      const yaw = ((k * 37 + n * 61) % 50) / 50 - 0.5;
      const s = n ? 11 : 14;
      toyBlock(L, Q, M.ALL, x, y0, z, s, yaw * 0.7, TOY_YELLOW, this.sheet.num(k));
      if (!n) toyBlock(L, Q, M.ALL, x, y0 + s, z, 8.5, yaw * 0.7 + 0.6, AMBER, this.sheet.star);
    }
    const m = Q.mesh(this.stickers);
    if (m) pl.group.add(m);
  }

  // ---- the board: the deep tray's floor with each cell's number printed in it (the empty slot shows whose home
  // it's over), the shaft of light that stands in the slot, and the arches over the mouths
  board(L, mouths) {
    const rig = this.rig;
    const Q = (this.Q = new Quads());
    const y = DEPTH;
    for (let cell = 0; cell < 16; cell++) {
      const x = cellX(cell);
      const z = cellZ(cell);
      Q.flat(x, y + 0.12, z, 56, 56, cell < 15 ? this.sheet.num(cell + 1) : this.sheet.star);
      // a ring of light round the cell's floor
      const c = [V(x - 44, y + 0.1, z - 44), V(x + 44, y + 0.1, z - 44), V(x + 44, y + 0.1, z + 44), V(x - 44, y + 0.1, z + 44)];
      for (let i = 0; i < 4; i++) L.line(M.ALL, c[i], c[(i + 1) % 4], TOY_YELLOW);
    }

    // the light in the slot: two nested curtains fading upward, and dust turning in it
    const shaft = (this.shaft = new THREE.Group());
    const pos = [];
    const col = [];
    for (const [half, top, k] of [[47, 110, 0.085], [30, 190, 0.07]]) {
      const c = [[-half, -half], [half, -half], [half, half], [-half, half]];
      for (let i = 0; i < 4; i++) {
        const [ax, az] = c[i];
        const [bx, bz] = c[(i + 1) % 4];
        pos.push(ax, y, az, bx, y, bz, bx, top, bz, ax, y, az, bx, top, bz, ax, top, az);
        col.push(k, k, k, k, k, k, 0, 0, 0, k, k, k, 0, 0, 0, 0, 0, 0);
      }
    }
    // (and the slot's floor, lit)
    pos.push(-48, y + 0.2, -48, 48, y + 0.2, -48, 48, y + 0.2, 48, -48, y + 0.2, -48, 48, y + 0.2, 48, -48, y + 0.2, 48);
    for (let i = 0; i < 6; i++) col.push(0.05, 0.05, 0.05);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.shaftMat = new THREE.MeshBasicMaterial({ color: TOY_YELLOW, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const curtain = new THREE.Mesh(sg, this.shaftMat);
    curtain.renderOrder = 4;
    shaft.add(curtain);
    const dp = [];
    let s = 99;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      const a = rnd() * TAU;
      const r = 6 + rnd() * 36;
      dp.push(Math.cos(a) * r, y + rnd() * 130, Math.sin(a) * r);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    this.dustMat = new THREE.PointsMaterial({ color: TOY_YELLOW, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dust = new THREE.Points(dg, this.dustMat);
    shaft.add(this.dust);
    rig.group.add(shaft);

    // an arch over each mouth, in the frame's yellow; its lamps are the gate's own, one set a lens
    this.lamps = [];
    for (const { gate, mx, mz, ox, oz, tx, tz } of mouths) {
      const yaw = tx ? 0 : Math.PI / 2;
      const reach = HW + 2.6;
      const px = mx + ox * 1.2;
      const pz = mz + oz * 1.2;
      const top = 12;
      for (const sd of [-1, 1]) {
        L.box(M.ALL, px + tx * sd * reach, (top + DEPTH) / 2, pz + tz * sd * reach, 1.9, top - DEPTH, 1.9, yaw, TOY_YELLOW, true);
        // a ball on top of the post
        ellipsoid(L, M.ALL, V(px + tx * sd * reach, top + 1.5, pz + tz * sd * reach), 1.7, 1.7, 1.7, AMBER, { lat: 4, lon: 6, fill: false });
      }
      L.box(M.ALL, px, top - 1.1, pz, 2 * reach + 1.9, 2.2, 1.9, yaw, TOY_YELLOW, true);
      const P = (t, yy, f) => V(px + tx * t + ox * f, yy, pz + tz * t + oz * f);
      for (const f of [-1, 1]) L.quad(M.ALL, P(-reach, top - 0.2, f), P(reach, top - 0.2, f), P(reach, top - 0.6, f), P(-reach, top - 0.6, f), TOY_YELLOW, 0.45);
      const set = {};
      for (const [lens, mask, c] of [[RED, M.RO, COLORS.red], [BLUE, M.BO, COLORS.blue]]) {
        const holder = { group: new THREE.Group() };
        const G = rig.layersFor(holder);
        for (const f of [-1.02, 1.02]) {
          // a bar of light under the lintel, and three arrows pointing down into the mouth
          G.quad(mask, P(-reach + 1, top - 2.3, f), P(reach - 1, top - 2.3, f), P(reach - 1, top - 3.7, f), P(-reach + 1, top - 3.7, f), c, 1);
          for (const a of [-5.6, 0, 5.6]) {
            G.quad(mask, P(a - 2.6, top - 4.5, f), P(a, top - 6.6, f), P(a, top - 8, f), P(a - 2.6, top - 5.9, f), c, 1);
            G.quad(mask, P(a + 2.6, top - 4.5, f), P(a, top - 6.6, f), P(a, top - 8, f), P(a + 2.6, top - 5.9, f), c, 1);
          }
        }
        // a curtain of light hanging in the doorway, gone by the time it reaches a car's height, and its glow down
        // the posts' inner faces: an open mouth is a lit doorway, a shut one a dark arch
        G.quadFade(mask, P(-reach + 1, top - 2.3, 0), P(reach - 1, top - 2.3, 0), P(reach - 1, 2.2, 0), P(-reach + 1, 2.2, 0), c, 0.34, 0);
        for (const sd of [-1, 1]) G.quadFade(mask, P(sd * (reach - 1), top - 2.4, -0.9), P(sd * (reach - 1), top - 2.4, 0.9), P(sd * (reach - 1), 0.5, 0.9), P(sd * (reach - 1), 0.5, -0.9), c, 0.6, 0);
        rig.group.add(holder.group);
        set[lens] = holder.group;
      }
      this.lamps.push({ gate, set });
    }
  }

  // ---- the frame's outer rail: posts, and a string of warm bulbs from one to the next, all the way round
  rail(L) {
    const main = this.rig.world.main;
    const lat = main.halfW + 2.3;
    const every = Math.max(8, Math.round(main.N / 66));
    let prev = null;
    let first = null;
    let n = 0;
    for (let i = 0; i < main.N; i += every, n++) {
      const foot = main.point(i, lat, 0);
      const top = main.point(i, lat, 6.4);
      L.line(M.ALL, foot, top, TOY_YELLOW);
      L.line(M.ALL, main.point(i, lat - 0.5, 0), main.point(i, lat - 0.25, 6.4), DIM);
      L.quad(M.ALL, main.point(i, lat - 0.5, 6.4), main.point(i, lat + 0.5, 6.4), main.point(i, lat + 0.5, 7.2), main.point(i, lat - 0.5, 7.2), TOY_YELLOW, 0.8);
      if (prev) bulbString(L, prev, top, 1.7, 6, 0.42, n);
      else first = top;
      prev = top;
    }
    bulbString(L, prev, first, 1.7, 6, 0.42, n);
  }

  // ---- the bed: what the puzzle was left among. Everything stands on the quilt (y), outside the frame.
  bed(L) {
    const w = this.rig.world;
    const y = w.floorY + 0.05;
    const Q = this.Q;
    const lo = -FRAME.D - w.main.halfW; // the road's outer edge
    const hi = SIZE + FRAME.D + w.main.halfW;
    const edge = SIZE / 2 + (SIZE / 2 + FRAME.D) + 110; // the bed's edge, as toybox.js lays it (course extent + 110)
    const E = SIZE / 2 + (edge - SIZE / 2); // the +x and +z edges
    const W = SIZE - E; // the -x and -z edges
    let s = 2020;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

    // --- the headboard, along the +x edge (the wall end of the bed): posts, slats, an arched top rail
    {
      const x = E - 7;
      const z0 = W + 6;
      const z1 = E - 6;
      const rise = (z) => 150 + 46 * Math.sin(((z - z0) / (z1 - z0)) * Math.PI);
      for (const z of [z0, (z0 + z1) / 2, z1]) {
        const top = y + rise(z) + 22;
        L.box(M.ALL, x, (y + top) / 2, z, 16, top - y, 16, 0, WOOD, true);
        ellipsoid(L, M.ALL, V(x, top + 9, z), 11, 11, 11, AMBER, { lat: 5, lon: 8 });
      }
      const n = 30;
      for (let i = 0; i < n; i++) {
        const a = z0 + ((z1 - z0) * (i + 0.18)) / n;
        const b = z0 + ((z1 - z0) * (i + 0.82)) / n;
        const ta = y + rise(a);
        const tb = y + rise(b);
        const A = V(x, y + 30, a);
        const B = V(x, y + 30, b);
        L.fillQuad(M.ALL, A, B, V(x, tb, b), V(x, ta, a));
        L.line(M.ALL, A, V(x, ta, a), WOOD);
        L.line(M.ALL, B, V(x, tb, b), WOOD);
        L.quadFade(M.ALL, A, B, V(x - 0.2, y + 62, b), V(x - 0.2, y + 62, a), WOOD, 0.1, 0);
        // a heart cut out of every third slat (drawn, not cut)
        if (i % 3 === 1) {
          const c = V(x - 0.4, y + 104, (a + b) / 2);
          L.ring(M.ALL, c, V(0, 0, 1), V(0, 1, 0), 4.2, 10, AMBER);
        }
      }
      // the rails, top and bottom
      let pa = null;
      for (let i = 0; i <= 40; i++) {
        const z = z0 + ((z1 - z0) * i) / 40;
        const p = V(x - 1, y + rise(z), z);
        if (pa) {
          L.line(M.ALL, pa, p, TOY_YELLOW);
          L.quad(M.ALL, pa, p, p.clone().setY(p.y + 9), pa.clone().setY(pa.y + 9), WOOD, 0.2);
          L.line(M.ALL, pa.clone().setY(pa.y + 9), p.clone().setY(p.y + 9), TOY_YELLOW);
          L.fillQuad(M.ALL, pa, p, p.clone().setY(p.y + 9), pa.clone().setY(pa.y + 9));
        }
        pa = p;
      }
      L.fillQuad(M.ALL, V(x, y, z0), V(x, y, z1), V(x, y + 30, z1), V(x, y + 30, z0));
      L.line(M.ALL, V(x - 1, y + 30, z0), V(x - 1, y + 30, z1), WOOD);
      L.line(M.ALL, V(x - 1, y + 20, z0), V(x - 1, y + 20, z1), WOOD);
    }

    // --- two pillows against it, one piped in each world's colour
    pillow(L, hi + 52, y, 82, 36, 112, 44, 0.05, M.R);
    pillow(L, hi + 50, y, 322, 36, 108, 48, -0.07, M.B);

    // --- the teddy bear, sat at the corner where the S side meets the W side, looking over the board
    {
      const bx = W + 62;
      const bz = W + 62;
      const u = 1.3;
      const yaw = Math.PI / 4; // facing the board's middle (+x, +z)
      const cs = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const T = (x, yy, z) => V(bx + (x * cs + z * sn) * u, y + yy * u, bz + (-x * sn + z * cs) * u);
      const ball = (x, yy, z, rx, ry, rz, col, o = {}) => ellipsoid(L, M.ALL, T(x, yy, z), rx * u, ry * u, rz * u, col, { yaw, ...o });
      ball(0, 33, 0, 29, 34, 25, AMBER, { lat: 8, lon: 14 });
      ball(0, 84, 2, 22, 20, 20, AMBER, { lat: 7, lon: 14 });
      ball(0, 78, 20, 9.5, 7.5, 7, CREAM, { lat: 4, lon: 8 });
      for (const sx of [-1, 1]) {
        ball(sx * 17, 102, 0, 8, 8, 4, AMBER, { lat: 4, lon: 8 });
        ball(sx * 33, 46, 8, 9, 21, 10, AMBER, { lat: 5, lon: 8 });
        ball(sx * 18, 9, 30, 11, 10, 21, AMBER, { lat: 5, lon: 8 });
        // a foot pad, an inner ear, an eye
        L.ring(M.ALL, T(sx * 18, 9, 51.4), V(cs, 0, -sn), V(0, 1, 0), 6.5 * u, 12, CREAM);
        L.ring(M.ALL, T(sx * 17, 102, 4.2), V(cs, 0, -sn), V(0, 1, 0), 4.4 * u, 10, CREAM);
        const e = T(sx * 8.5, 89, 20.6);
        L.quad(M.ALL, e.clone().add(V(-1.6, -1.6, 0)), e.clone().add(V(1.6, -1.6, 0)), e.clone().add(V(1.6, 1.6, 0)), e.clone().add(V(-1.6, 1.6, 0)), CREAM, 1);
        L.quad(M.ALL, e.clone().add(V(0, -1.6, -1.6)), e.clone().add(V(0, -1.6, 1.6)), e.clone().add(V(0, 1.6, 1.6)), e.clone().add(V(0, 1.6, -1.6)), CREAM, 1);
      }
      // its belly patch, its nose and its smile
      L.ring(M.ALL, T(0, 30, 25.6), V(cs, 0, -sn), V(0, 1, 0), 15 * u, 16, CREAM);
      L.ring(M.ALL, T(0, 30, 25.8), V(cs, 0, -sn), V(0, 1, 0), 9 * u, 12, CREAM);
      const nose = [T(-3.4, 82, 27.2), T(3.4, 82, 27.2), T(0, 78.4, 27.6)];
      L.quad(M.ALL, nose[0], nose[1], nose[2], nose[2], TOY_YELLOW, 1);
      let pm = null;
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * (1.15 + (0.7 * i) / 8);
        const p = T(Math.cos(a) * 5.2, 77.6 + Math.sin(a) * 3.4, 27.2 - Math.abs(Math.cos(a)) * 1.6);
        if (pm) L.line(M.ALL, pm, p, TOY_YELLOW);
        pm = p;
      }
      // a bow tie, half in each world
      for (const [sx, mask] of [[-1, M.R], [1, M.B]]) {
        const a = T(0, 64, 21.5);
        const b = T(sx * 15, 70.5, 20.5);
        const c = T(sx * 15, 57.5, 20.5);
        L.line(mask, a, b);
        L.line(mask, b, c);
        L.line(mask, c, a);
        L.quad(mask, a, b, c, c, null, 0.5);
      }
    }

    // --- the puzzle's box lid, propped up beyond the S side at the +x end, facing back up the E side
    {
      const x0 = hi - 86;
      const x1 = E - 12;
      const zb = lo - 52;
      const lean = 40;
      const tall = 112;
      const P = (u, v, off = 0) => V(x0 + (x1 - x0) * u, y + tall * v, zb - lean * v + off);
      L.fillQuad(M.ALL, P(0, 0), P(1, 0), P(1, 1), P(0, 1));
      const c = [P(0, 0, 0.3), P(1, 0, 0.3), P(1, 1, 0.3), P(0, 1, 0.3)];
      for (let i = 0; i < 4; i++) {
        L.line(M.ALL, c[i], c[(i + 1) % 4], TOY_YELLOW);
        // the lid's rim, coming toward you
        L.line(M.ALL, c[i], c[i].clone().add(V(0, 3, 9)), TOY_YELLOW);
        L.line(M.ALL, c[i].clone().add(V(0, 3, 9)), c[(i + 1) % 4].clone().add(V(0, 3, 9)), DIM);
      }
      L.quad(M.ALL, P(0, 0.955, 0.3), P(1, 0.955, 0.3), P(1, 1, 0.3), P(0, 1, 0.3), TOY_YELLOW, 0.5);
      // the label across its top, and under it the puzzle as the box shows it: fifteen squares and a gap
      Q.quad(P(0.06, 0.66, 0.5), P(0.94, 0.66, 0.5), P(0.94, 0.93, 0.5), P(0.06, 0.93, 0.5), this.sheet.label);
      const u0 = 0.3;
      const cw = 0.1;
      const ch = 0.135;
      for (let cell = 0; cell < 15; cell++) {
        const cu = u0 + (cell % 4) * cw;
        const cv = 0.6 - ((cell >> 2) + 1) * ch;
        const mask = cell % 4 === 2 ? M.R : cell >> 2 === 2 ? M.B : M.ALL; // (the red column and the blue row of the solved board)
        const q = [P(cu + 0.008, cv + 0.01, 0.5), P(cu + cw - 0.008, cv + 0.01, 0.5), P(cu + cw - 0.008, cv + ch - 0.01, 0.5), P(cu + 0.008, cv + ch - 0.01, 0.5)];
        for (let i = 0; i < 4; i++) L.line(mask, q[i], q[(i + 1) % 4], mask === M.ALL ? TOY_YELLOW : null);
        L.quad(mask, q[0], q[1], q[2], q[3], mask === M.ALL ? TOY_YELLOW : null, 0.16);
      }
      // (a prop behind it)
      L.line(M.ALL, P(0.2, 0.8), V(x0 + (x1 - x0) * 0.2, y, zb - lean - 30), DIM);
      L.line(M.ALL, P(0.8, 0.8), V(x0 + (x1 - x0) * 0.8, y, zb - lean - 30), DIM);
    }

    // --- the sixteenth tile, the one that was never in the box: propped beside the W side, past the start line
    {
      const x0 = lo - 74;
      const x1 = lo - 20;
      const z0 = 292;
      const P = (u, v, off = 0) => V(x0 + (x1 - x0) * u, y + 50 * v + off * 0.4, z0 + 20 * v - off);
      L.fillQuad(M.ALL, P(0, 0), P(1, 0), P(1, 1), P(0, 1));
      const c = [P(0, 0, 0.3), P(1, 0, 0.3), P(1, 1, 0.3), P(0, 1, 0.3)];
      const b = c.map((p) => p.clone().add(V(0, -2.2, 5.2)));
      for (let i = 0; i < 4; i++) {
        L.line(M.ALL, c[i], c[(i + 1) % 4], TOY_YELLOW);
        L.line(M.ALL, b[i], b[(i + 1) % 4], DIM);
        L.line(M.ALL, c[i], b[i], TOY_YELLOW);
        L.fillQuad(M.ALL, c[i], c[(i + 1) % 4], b[(i + 1) % 4], b[i]);
      }
      Q.quad(P(0.9, 0.1, 0.5), P(0.1, 0.1, 0.5), P(0.1, 0.9, 0.5), P(0.9, 0.9, 0.5), this.sheet.num(16));
      toyBlock(L, Q, M.B, (x0 + x1) / 2 + 6, y, z0 + 34, 26, 0.3, null, null);
    }

    // --- alphabet blocks: a tall stack at the corner the W side runs at, and more along the N, S and W sides
    const stack = (x, z, sizes, k) => {
      let yy = y;
      let yaw = rnd() * 1.2;
      sizes.forEach((sz, i) => {
        const kind = (k + i) % 3;
        const mask = kind === 0 ? M.ALL : kind === 1 ? M.R : M.B;
        const col = kind === 0 ? [TOY_YELLOW, AMBER, CREAM][(k + i) % 3] : null;
        toyBlock(L, Q, mask, x, yy, z, sz, yaw, col, kind === 0 ? this.sheet.glyph((k * 3 + i) % 8) : null);
        yy += sz;
        yaw += 0.35 + rnd() * 0.5;
      });
    };
    stack(W + 58, E - 58, [44, 36, 30, 24], 0);
    stack(W + 112, E - 44, [34, 26], 1);
    stack(W + 40, E - 118, [30], 2);
    let k = 3;
    for (let x = 60; x < SIZE - 10; x += 62 + rnd() * 26) stack(x, hi + 34 + rnd() * 44, rnd() < 0.45 ? [30 + rnd() * 8, 22 + rnd() * 6] : [26 + rnd() * 12], k++); // N
    for (let x = 40; x < SIZE - 110; x += 62 + rnd() * 26) stack(x, lo - 34 - rnd() * 44, rnd() < 0.45 ? [30 + rnd() * 8, 22 + rnd() * 6] : [26 + rnd() * 12], k++); // S
    for (let z = 20; z < 250; z += 66 + rnd() * 24) stack(lo - 36 - rnd() * 40, z, rnd() < 0.45 ? [30 + rnd() * 8, 22 + rnd() * 6] : [26 + rnd() * 12], k++); // W

    // --- marbles and crayons close in by the frame's foot
    for (let i = 0; i < 26; i++) {
      const side = i % 3; // N, S, W (the pillows have the E side)
      const t = rnd();
      const off = 9 + rnd() * 16;
      const [x, z] = side === 0 ? [20 + t * 380, hi + off] : side === 1 ? [20 + t * 330, lo - off] : [lo - off, 10 + t * 380];
      const mask = i % 2 ? M.R : M.B;
      if (i % 4 === 3) crayon(L, mask, x, y, z, 52 + rnd() * 26, 4.2, rnd() * TAU);
      else {
        const r = 6 + rnd() * 7;
        ellipsoid(L, mask, V(x, y + r, z), r, r, r, null, { lat: 5, lon: 10, yaw: rnd() * 3 });
        // the swirl inside it
        const c = V(x, y + r, z);
        L.ring(i % 2 ? M.B : M.R, c, V(Math.cos(i), 0.5, Math.sin(i)).normalize(), V(0, 1, 0), r * 0.55, 12);
      }
    }
  }

  // The printed pieces that don't ride a tile, as one mesh.
  finish() {
    const m = this.Q.mesh(this.stickers);
    if (m) {
      m.frustumCulled = false;
      this.rig.group.add(m);
    }
  }

  // Every frame. tint: the lens's tint (white with both worlds open); col: yellow, or the lens's colour.
  update(t, B, tint, both, col, solved) {
    if (tint) this.U.tint.value.copy(tint);
    this.U.both.value = both;
    this.kFace.value = solved ? 1.2 + 0.15 * Math.sin(t * 2) : 0.8;
    // the slot: where no tile is, sliding the other way while a tile slides in
    let x;
    let z;
    if (B.moving) {
      const { from, to } = B.moving;
      x = cellX(to) + (cellX(from) - cellX(to)) * B.f;
      z = cellZ(to) + (cellZ(from) - cellZ(to)) * B.f;
    } else {
      const cell = B.cells.indexOf(0);
      x = cellX(cell);
      z = cellZ(cell);
    }
    this.shaft.position.set(x, 0, z);
    this.shaftMat.color.copy(col).multiplyScalar(solved ? 1.25 + 0.25 * Math.sin(t * 2) : 1);
    this.dustMat.color.copy(col);
    this.dust.rotation.y = t * 0.12;
    this.dust.position.y = Math.sin(t * 0.5) * 4;
    for (const { gate, set } of this.lamps) {
      set[RED].visible = !!(gate.open & RED);
      set[BLUE].visible = !!(gate.open & BLUE);
    }
  }
}
