// Course maps: the small live map in the HUD and the preview on each track card. Roads are drawn in their world's
// colour; roads that aren't there in your current lens are drawn faint.

import { colorForMask, solidIn, M } from '../world/shift.js';
import * as THREE from '../../vendor/three.js';
import { drawTiltCourse, drawTiltRacers, snapCourse, customMap } from './coursemap.js';

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

// Raw path polylines from a track definition, without building the 3D world (for previews).
export function drawPaths(ctx, paths, w, h, mode = 7, pad = 10, racers = null, lineW = 3, me = racers?.find((r) => r.isPlayer)) {
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

export class MiniMap {
  constructor(canvas, style = 'flat', live = null) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.style = style;
    this.live = live; // { race, renderer } for 'snap'
    this.layer = null; // the cached course drawing ('tilt') or render ('snap')
    this.key = '';
  }

  // the course layer for this lens and size, built when either changes
  course(world, mode, w, h, dpr) {
    const key = `${this.style}|${mode}|${w}x${h}@${dpr}`;
    if (this.key === key && this.layer) return this.layer;
    if (this.style === 'snap' && this.live) {
      if (!this.snaps || this.snaps.size !== `${w}x${h}@${dpr}`) {
        try {
          this.snaps = snapCourse(this.live.race, this.live.renderer, THREE, w, h, dpr);
          this.snaps.size = `${w}x${h}@${dpr}`;
        } catch (e) {
          console.warn('map snapshot failed, drawing it instead', e);
          this.style = 'tilt';
          return this.course(world, mode, w, h, dpr);
        }
      }
      // the render, a little dimmed, with the route drawn over it so the road reads through buildings and scenery
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const cx = canvas.getContext('2d');
      cx.globalAlpha = 0.8;
      cx.drawImage(this.snaps[mode] || this.snaps[1], 0, 0);
      cx.globalAlpha = 1;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawTiltCourse(cx, world.paths, w, h, mode, { lineW: 2, view: this.snaps.view, roadOnly: true });
      this.layer = { canvas, view: this.snaps.view };
    } else {
      const canvas = this.layer?.canvas?.width === Math.round(w * dpr) ? this.layer.canvas : document.createElement('canvas');
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const cx = canvas.getContext('2d');
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, w, h);
      const view = drawTiltCourse(cx, world.paths, w, h, mode, { lineW: 2.6 });
      this.layer = { canvas, view };
    }
    this.key = key;
    return this.layer;
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
    if (this.style === 'flat' || customMap(world.paths)) return drawPaths(ctx, world.paths, w, h, mode, 10, racers, 3, me);
    // 3/4 view: copy the cached course, then only the racers are drawn each tick
    const L = this.course(world, mode, w, h, dpr);
    ctx.drawImage(L.canvas, 0, 0, w, h);
    drawTiltRacers(ctx, L.view, racers, me);
  }
}
