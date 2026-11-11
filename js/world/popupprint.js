// PAGE TURNER's print and card (game/popup.js). Two things make a pop-up book read as paper rather than wire:
//
//   THE SCREEN  Colour is printed as a halftone screen: rows of dots, bigger where the ink is heavier, each plate's
//               rows at its own angle. Close up you see the dots; far off they melt into a flat tone.
//   THE CARD    A cut-out is a piece of printed card: a dark sheet with its plate's screen across it, heavier at the
//               foot, and an edge with some thickness to it.
//
// Both are a few lines patched into MeshBasicMaterial. Nothing here adds a draw call.

import * as THREE from '../../vendor/three.js';
import { colorForMask, M } from './shift.js';
import { patchWave } from './fx.js';

// the screen angle of each plate, as printers set them apart so the dots don't beat
const ANGLE = { [M.R]: 1.309, [M.B]: 0.262 };
const angleOf = (mask) => ANGLE[mask] ?? 0.785;

// One screen: `pitch` metres between dots, turned by `angle`. ht(p, tone) is how much ink lands at p (in metres)
// for a tone of 0..1. Past the point where a pixel covers most of a dot it is just the tone.
const screen = (pitch, angle) => `
  float ht(vec2 p, float tone) {
    const float c = ${Math.cos(angle).toFixed(4)};
    const float s = ${Math.sin(angle).toFixed(4)};
    vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) / ${pitch.toFixed(3)};
    float px = max(fwidth(q.x), fwidth(q.y));
    float r = sqrt(clamp(tone, 0.0, 1.0)) * 0.72;
    float d = length(fract(q) - 0.5);
    float aa = clamp(px, 0.02, 0.5);
    float dots = 1.0 - smoothstep(r - aa, r + aa, d);
    return mix(dots, tone, smoothstep(0.35, 0.9, px));
  }`;

const key = (mat, k) => {
  const prev = mat.customProgramCacheKey.call(mat);
  mat.customProgramCacheKey = () => `${prev}|${k}`;
};

// The printing on the page. The canvas keeps line work in its red channel and tone (the washes) in its blue one:
// lines print solid, tone prints through the screen. `size` is the sheet's size in metres (u across, v up).
export function patchPlate(mat, mask, size) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${screen(2.0, angleOf(mask))}`)
      .replace(
        '#include <map_fragment>',
        `{
          vec4 tx = texture2D(map, vMapUv);
          vec2 p = vMapUv * vec2(${size[0].toFixed(1)}, ${size[1].toFixed(1)});
          diffuseColor.rgb *= max(tx.r, 0.7 * ht(p, tx.b));
        }`,
      );
  };
  key(mat, `plate${mask}`);
  return mat;
}

// The card a cut-out is made of, one material per world. Its opacity follows that world's own fill (see follow).
const CARDS = new WeakMap();
export function cardMaterial(layers, mask) {
  let per = CARDS.get(layers);
  if (!per) CARDS.set(layers, (per = new Map()));
  let mat = per.get(mask);
  if (mat) return mat;
  const mats = layers.materials(mask);
  const neutral = mask === M.ALL;
  mat = new THREE.MeshBasicMaterial({ color: colorForMask(mask), transparent: true, opacity: 0.92, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vCard;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCard = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vCard;\n${screen(1.15, angleOf(mask))}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // heavier ink at the foot, thinning up the sheet; a band of solid colour along the bottom edge
          float tone = mix(0.50, 0.16, smoothstep(0.0, 26.0, vCard.y));
          float ink = ht(vCard, tone);
          float foot = 1.0 - smoothstep(0.25, 0.6, vCard.y);
          diffuseColor.rgb *= ${neutral ? '0.02 + 0.10' : '0.05 + 0.34'} * max(ink, foot);
        }`,
      );
  };
  key(mat, `card${mask}`);
  if (mats.per) patchWave(mat, mats.per, false);
  mat.userData.fill = mats.fill;
  per.set(mask, mat);
  return mat;
}

// Every frame (and every split-screen view): the cards fade with their worlds.
export function followCards(layers) {
  const per = CARDS.get(layers);
  if (!per) return;
  const tint = layers.level.get('tint');
  for (const [mask, mat] of per) {
    const f = mat.userData.fill;
    mat.opacity = f.opacity;
    mat.visible = f.visible;
    // a card of both printings takes the lens's colour, like the road and the rails
    if (mask === M.ALL && tint) mat.color.copy(tint);
  }
}

// ------------------------------------------------------------------ card geometry
// What a cut-out adds to its own line work so it reads as card: the same outline again a card's thickness behind,
// joined at the corners; a glue tab folded forward on the paper at its foot; and, for a tall piece, the two paper
// struts that hold it up from behind.
export function cardLines(shape, pos, { tab = true, strut = true, thick = 0.4 } = {}) {
  const n = shape.pts.length;
  for (let k = 0; k < n; k++) {
    const a = shape.pts[k];
    const b = shape.pts[(k + 1) % n];
    if (a[1] <= 0.01 && b[1] <= 0.01) continue; // not along the foot
    pos.push(a[0], a[1], -thick, b[0], b[1], -thick);
    if (a[1] > 0.01) pos.push(a[0], a[1], 0, a[0], a[1], -thick);
  }
  const w = shape.w;
  const h = shape.h;
  if (tab && w > 3) {
    const a = w * 0.36;
    const d = Math.min(2.2, 0.5 + w * 0.06);
    pos.push(-a, 0.03, 0, -a + d * 0.6, 0.03, d, -a + d * 0.6, 0.03, d, a - d * 0.6, 0.03, d, a - d * 0.6, 0.03, d, a, 0.03, 0);
  }
  if (strut && h > 12 && w > 6) {
    for (const s of [-1, 1]) {
      const x = s * w * 0.24;
      const y = h * 0.42;
      const z = -h * 0.3;
      pos.push(x - 0.8, y, 0, x - 0.8, 0.03, z, x + 0.8, y, 0, x + 0.8, 0.03, z, x - 0.8, 0.03, z, x + 0.8, 0.03, z, x - 0.8, y * 0.5, z * 0.5, x + 0.8, y * 0.5, z * 0.5);
    }
  }
}

// ------------------------------------------------------------------ the little pieces
// The small cut-outs that line the road are too many to be a mesh each. A Tuft is all of one world's, on one page
// of one spread, in a single fill and a single set of lines; it stands up as one (the book scales it from the paper).
export class Tuft {
  constructor() {
    this.fp = [];
    this.fu = [];
    this.fi = [];
    this.lp = [];
    this.n = 0;
  }

  // a cut-out standing at (x, y, z), its face turned by yaw
  add(shape, x, y, z, yaw) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const at = (px, py, pz, out) => out.push(x + px * c + pz * s, y + py, z - px * s + pz * c);
    const base = this.fp.length / 3;
    for (const [px, py] of shape.pts) {
      at(px, py, 0, this.fp);
      this.fu.push(px, py);
    }
    const tris = THREE.ShapeUtils.triangulateShape(shape.pts.map(([px, py]) => new THREE.Vector2(px, py)), []);
    for (const t of tris) this.fi.push(base + t[0], base + t[1], base + t[2]);
    const local = [];
    const n = shape.pts.length;
    for (let k = 0; k < n; k++) {
      const a = shape.pts[k];
      const b = shape.pts[(k + 1) % n];
      local.push(a[0], a[1], 0, b[0], b[1], 0);
    }
    for (let k = 0; k < shape.segs.length; k += 4) local.push(shape.segs[k], shape.segs[k + 1], 0, shape.segs[k + 2], shape.segs[k + 3], 0);
    cardLines(shape, local, { strut: false, thick: 0.25 });
    for (let k = 0; k < local.length; k += 3) at(local[k], local[k + 1], local[k + 2], this.lp);
    this.n++;
  }

  build(layers, mask) {
    const group = new THREE.Group();
    if (!this.n) return group;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(this.fp, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(this.fu, 2));
    fg.setIndex(this.fi);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(this.lp, 3));
    const fill = new THREE.Mesh(fg, cardMaterial(layers, mask));
    const lines = new THREE.LineSegments(lg, layers.materials(mask).wire);
    lines.renderOrder = 2;
    fill.frustumCulled = lines.frustumCulled = false;
    group.add(fill, lines);
    return group;
  }
}
