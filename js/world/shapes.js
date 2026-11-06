// Shape cues (Settings > Accessibility > World shapes): each world gets a shape as well as a colour, so the two
// read apart without telling red from blue. ▲ the red world, ● the blue world, ◆ the overlap. They sit on the faces
// of walls, gates and blocks, and every 14 m along both edges of road that some lens doesn't have. Built hidden;
// access.js shows them. They use each world's own wire material, so they come and go with the lens like the rest.

import * as THREE from '../../vendor/three.js';
import { M, RED, BLUE, BOTH } from './shift.js';

// which shape a mask gets: null for things in every world
export function shapeOf(mask) {
  if (mask === M.ALL) return null;
  const r = !!(mask & RED);
  const b = !!(mask & BLUE);
  if (r && !b) return 'tri';
  if (b && !r) return 'ring';
  if (mask === M.X || (mask & BOTH && !r && !b)) return 'dia';
  return null;
}

// a shape's outline as segments in its own plane (x right, y up), radius s, pushed into out
function outline(kind, s, out) {
  const pts = [];
  if (kind === 'tri') for (let k = 0; k < 3; k++) pts.push([Math.sin((k * 2 * Math.PI) / 3) * s, Math.cos((k * 2 * Math.PI) / 3) * s]);
  else if (kind === 'dia') pts.push([0, s], [s * 0.7, 0], [0, -s], [-s * 0.7, 0]);
  else for (let k = 0; k < 12; k++) pts.push([Math.sin((k * Math.PI) / 6) * s, Math.cos((k * Math.PI) / 6) * s]);
  for (let k = 0; k < pts.length; k++) out.push(pts[k], pts[(k + 1) % pts.length]);
  return out;
}

export function buildShapeCues(world) {
  const cues = (world.shapeCues = []);
  const L = world.layers;
  // walls, gates, blocks: the shape on the front and back faces (and the sides of a block)
  for (const o of world.obstacles) {
    const kind = shapeOf(o.mask);
    if (!kind || !o.root) continue;
    const s = Math.min(o.w, o.h / 2) * 0.8;
    // (drawn twice, a little apart, so it reads bold against the hazard stripes)
    const segs = outline(kind, s * 0.86, outline(kind, s, []));
    const pos = [];
    const faces = [[0, o.len + 0.06, 0], [0, -o.len - 0.06, 0]];
    if (o.type === 'block') faces.push([o.w + 0.06, 0, Math.PI / 2], [-o.w - 0.06, 0, Math.PI / 2]);
    for (const [fx, fz, rot] of faces) {
      for (const [x, y] of segs) {
        const c = Math.cos(rot);
        const sn = Math.sin(rot);
        pos.push(fx + x * c, y, fz - x * sn);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const seg = new THREE.LineSegments(g, L.materials(o.mask).wire);
    seg.visible = false;
    o.root.add(seg);
    cues.push(seg);
  }
  // road some lens doesn't have: a small upright shape on each edge every 14 m
  for (const path of world.paths) {
    const step = Math.max(1, Math.round(14 / path.ds));
    const byMask = new Map();
    for (let i = 0; i < path.N; i += step) {
      const mask = path.mask[i];
      const kind = shapeOf(mask);
      if (!kind) continue;
      const list = byMask.get(mask) || byMask.set(mask, []).get(mask);
      const segs = outline(kind, 0.7, []);
      const rx = path.rightX(i);
      const rz = path.rightZ(i);
      for (const side of [-1, 1]) {
        const p = path.point(i, side * (path.halfW - 0.4), 1.1, new THREE.Vector3());
        for (const [x, y] of segs) list.push(p.x + rx * x, p.y + y, p.z + rz * x);
      }
    }
    for (const [mask, pos] of byMask) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const seg = new THREE.LineSegments(g, L.materials(mask).wire);
      seg.visible = false;
      seg.frustumCulled = false;
      world.group.add(seg);
      cues.push(seg);
    }
  }
}
