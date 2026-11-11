// Course maps: the small live map in the HUD and the preview on each track card. Roads are drawn in their world's
// colour; roads that aren't there in your current lens are drawn faint.

import { colorForMask, solidIn, M } from '../world/shift.js';

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

// Raw path polylines from a track definition, without building the 3D world (for previews).
export function drawPaths(ctx, paths, w, h, mode = 7, pad = 10, racers = null, lineW = 3, me = racers?.find((r) => r.isPlayer)) {
  // a folding course (world/fold.js) is drawn folded, as it stands right now, from the side and a little above
  if (paths[0]?.fold) return drawFolded(ctx, paths, paths[0].fold, w, h, mode, pad, racers, lineW, me);
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of paths) {
    for (let i = 0; i < p.N; i += 2) {
      x0 = Math.min(x0, p.px[i]);
      x1 = Math.max(x1, p.px[i]);
      z0 = Math.min(z0, p.pz[i]);
      z1 = Math.max(z1, p.pz[i]);
    }
  }
  const s = Math.min((w - pad * 2) / (x1 - x0 || 1), (h - pad * 2) / (z1 - z0 || 1));
  const ox = (w - (x1 - x0) * s) / 2;
  const oz = (h - (z1 - z0) * s) / 2;
  // mirror x so the map matches the driver's view from above (+x is to the left when facing +z)
  const X = (x) => w - (ox + (x - x0) * s);
  const Z = (z) => h - (oz + (z - z0) * s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // a course's own figure under its roads (the Hypercube's edges)
  if (paths.extra) {
    ctx.strokeStyle = '#b04cff';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = lineW * 0.35;
    ctx.beginPath();
    for (const [ax, az, bx, bz] of paths.extra) {
      ctx.moveTo(X(ax), Z(az));
      ctx.lineTo(X(bx), Z(bz));
    }
    ctx.stroke();
  }
  for (const p of paths) {
    const last = p.closed ? p.N : p.N - 1;
    for (let i = 0; i < last; i += 2) {
      const j = p.closed ? (i + 2) % p.N : Math.min(p.N - 1, i + 2);
      const mask = p.mask[i];
      const on = solidIn(mask, mode);
      // a route that isn't there in your lens isn't on the map either (the main loop keeps a faint trace)
      if (!on && !p.closed) continue;
      ctx.strokeStyle = hex(mask === M.ALL ? 0xd8c8ff : colorForMask(mask));
      ctx.globalAlpha = on ? 1 : 0.18;
      ctx.lineWidth = (p.closed ? lineW : lineW * 0.75) * (on ? 1 : 0.7);
      ctx.beginPath();
      ctx.moveTo(X(p.px[i]), Z(p.pz[i]));
      ctx.lineTo(X(p.px[j]), Z(p.pz[j]));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  if (racers) {
    for (const r of racers) {
      if (r === me) continue;
      ctx.fillStyle = r.isPlayer ? '#ffffff' : hex(r.color);
      ctx.beginPath();
      ctx.arc(X(r.pos.x), Z(r.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = me;
    if (p) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(p.pos.x), Z(p.pos.z), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  return { X, Z };
}

const _v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, copy(o) { return this.set(o.x, o.y, o.z); } };
const YAW = -0.95;
const PITCH = 0.42;
function drawFolded(ctx, paths, fold, w, h, mode, pad, racers, lineW, me) {
  const cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  // flat (x, y, z) -> through the fold -> turned and tipped toward the viewer: [across, up, depth]
  const proj = (x, y, z) => {
    fold.warp(_v.set(x, y, z), _v);
    const ax = _v.x * cy + _v.z * sy;
    const dz = -_v.x * sy + _v.z * cy;
    return [ax, _v.y * cp + dz * sp, dz];
  };
  // fitted to the folded and the flat course together, so the map holds still while the course bends
  let a0 = Infinity, a1 = -Infinity, u0 = Infinity, u1 = -Infinity;
  const fit = ([a, u]) => {
    a0 = Math.min(a0, a);
    a1 = Math.max(a1, a);
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
  };
  const main = paths[0];
  for (let i = 0; i < main.N; i += 6) {
    fit(proj(main.px[i], main.py[i], main.pz[i]));
    const ax = main.px[i] * cy + main.pz[i] * sy;
    const dz = -main.px[i] * sy + main.pz[i] * cy;
    fit([ax, dz * sp * 0.6]);
  }
  const s = Math.min((w - pad * 2) / (a1 - a0 || 1), (h - pad * 2) / (u1 - u0 || 1));
  const ox = (w - (a1 - a0) * s) / 2;
  const oy = (h - (u1 - u0) * s) / 2;
  const X = (a) => ox + (a - a0) * s;
  const Y = (u) => h - (oy + (u - u0) * s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // far stretches first, so the near side of the fold is drawn over the far side
  const segs = [];
  for (const p of paths) {
    const last = p.closed ? p.N : p.N - 1;
    for (let i = 0; i < last; i += 2) {
      const j = p.closed ? (i + 2) % p.N : Math.min(p.N - 1, i + 2);
      const mask = p.mask[i];
      const on = solidIn(mask, mode);
      if (!on && !p.closed) continue;
      const A = proj(p.px[i], p.py[i], p.pz[i]);
      const B = proj(p.px[j], p.py[j], p.pz[j]);
      segs.push([A[2] + B[2], A, B, mask, on, p.closed]);
    }
  }
  segs.sort((q, r) => r[0] - q[0]);
  const near = segs.length ? segs[segs.length - 1][0] : 0;
  const far = segs.length ? segs[0][0] : 1;
  for (const [d, A, B, mask, on, closed] of segs) {
    ctx.strokeStyle = hex(mask === M.ALL ? 0xd8c8ff : colorForMask(mask));
    // the far side a little fainter and thinner
    const k = 1 - 0.45 * ((d - near) / (far - near || 1));
    ctx.globalAlpha = (on ? 1 : 0.18) * k;
    ctx.lineWidth = (closed ? lineW : lineW * 0.75) * (on ? 1 : 0.7) * (0.75 + 0.25 * k);
    ctx.beginPath();
    ctx.moveTo(X(A[0]), Y(A[1]));
    ctx.lineTo(X(B[0]), Y(B[1]));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const dot = (r, rad, edge) => {
    const [a, u] = proj(r.pos.x, r.pos.y, r.pos.z);
    ctx.beginPath();
    ctx.arc(X(a), Y(u), rad, 0, Math.PI * 2);
    ctx.fill();
    if (edge) ctx.stroke();
  };
  for (const r of racers || []) {
    if (r === me) continue;
    ctx.fillStyle = r.isPlayer ? '#ffffff' : hex(r.color);
    dot(r, 3);
  }
  if (racers && me) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    dot(me, 5, true);
  }
  return { X, Z: Y };
}

export class MiniMap {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
  }
  draw(world, racers, mode, me = racers.find((r) => r.isPlayer)) {
    const { c, ctx } = this;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 180;
    const h = c.clientHeight || 180;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawPaths(ctx, world.paths, w, h, mode, 10, racers, 3, me);
  }
}
