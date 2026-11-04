// Course maps: the small live map in the HUD and the preview on each track card. Roads are drawn in their world's
// colour; roads that aren't there in your current lens are drawn faint.

import { colorForMask, solidIn, M } from '../world/shift.js';

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

// Raw path polylines from a track definition, without building the 3D world (for previews).
export function drawPaths(ctx, paths, w, h, mode = 7, pad = 10, racers = null, lineW = 3) {
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
  for (const p of paths) {
    const last = p.closed ? p.N : p.N - 1;
    for (let i = 0; i < last; i += 2) {
      const j = p.closed ? (i + 2) % p.N : Math.min(p.N - 1, i + 2);
      const mask = p.mask[i];
      const on = solidIn(mask, mode);
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
      if (r.isPlayer) continue;
      ctx.fillStyle = hex(r.color);
      ctx.beginPath();
      ctx.arc(X(r.pos.x), Z(r.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = racers.find((r) => r.isPlayer);
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

export class MiniMap {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
  }
  draw(world, racers, mode) {
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
    drawPaths(ctx, world.paths, w, h, mode, 10, racers, 3);
  }
}
