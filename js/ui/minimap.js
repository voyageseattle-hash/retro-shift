// Course maps: the small live map in the HUD and the preview on each track card. Roads are drawn in their world's
// colour; roads that aren't there in your current lens are drawn faint.

import { colorForMask, solidIn, M } from '../world/shift.js';
import * as THREE from '../../vendor/three.js';
import { drawTiltCourse, drawTiltRacers, snapCourse, customMap } from './coursemap.js';

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

// Raw path polylines from a track definition, without building the 3D world (for previews).
export function drawPaths(ctx, paths, w, h, mode = 7, pad = 10, racers = null, lineW = 3, me = racers?.find((r) => r.isPlayer)) {
  if (paths[0]?.globe) return drawGlobe(ctx, paths, w, h, mode, pad, racers, lineW, me);
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

// A course that goes round a sphere (curved.js; the main path carries `globe`: { R, star, holes: [{ axis, r }] }):
// the sphere seen from outside with its openings toward you and the star showing through, the road on the outside
// in the usual colours and the road on the inside, seen through the shell, in the star's.
function drawGlobe(ctx, paths, w, h, mode, pad, racers, lineW, me) {
  const G = paths[0].globe;
  const [a, b] = [G.holes[0].axis, G.holes[G.holes.length - 1].axis];
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  let up = norm(cross([a.x, a.y, a.z], [b.x, b.y, b.z]));
  const mid = norm([a.x + b.x, a.y + b.y, a.z + b.z]);
  const v = norm([mid[0] + up[0] * 0.45, mid[1] + up[1] * 0.45, mid[2] + up[2] * 0.45]);
  const right = norm(cross(up, v));
  up = cross(v, right);
  const s = (Math.min(w, h) / 2 - pad) / (G.R * 1.04);
  const X = (p) => w / 2 + dot(p, right) * s;
  const Y = (p) => h / 2 - dot(p, up) * s;
  const rad = G.R * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // the star, and its light on the inside of the shell
  const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, rad);
  glow.addColorStop(0, 'rgba(255,214,130,0.95)');
  glow.addColorStop((G.star / G.R) * 0.9, 'rgba(255,120,150,0.8)');
  glow.addColorStop(Math.min(0.6, (G.star / G.R) * 1.5), 'rgba(150,70,220,0.22)');
  glow.addColorStop(1, 'rgba(60,40,140,0.12)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, rad, 0, Math.PI * 2);
  ctx.fill();
  // the shell: its outline and a few great circles
  ctx.strokeStyle = '#8f7cff';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, rad, 0, Math.PI * 2);
  ctx.stroke();
  const ring = (axis, r, alpha, width, color) => {
    // a circle on the shell round `axis` (unit), of radius r; only the half that faces you
    const e1 = norm(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const e2 = cross(axis, e1);
    const sn = Math.min(1, r / G.R);
    const cs = Math.sqrt(1 - sn * sn);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    let pen = false;
    ctx.beginPath();
    for (let k = 0; k <= 48; k++) {
      const t = (k / 48) * Math.PI * 2;
      const p = [0, 1, 2].map((j) => G.R * (axis[j] * cs + (e1[j] * Math.cos(t) + e2[j] * Math.sin(t)) * sn));
      const front = dot(p, v) > 0;
      ctx.globalAlpha = alpha;
      if (front && pen) ctx.lineTo(X(p), Y(p));
      else if (front) ctx.moveTo(X(p), Y(p));
      pen = front;
    }
    ctx.stroke();
  };
  ring(up, G.R, 0.22, 1, '#8f7cff');
  ring(right, G.R, 0.22, 1, '#8f7cff');
  ring(norm([up[0] + right[0], up[1] + right[1], up[2] + right[2]]), G.R, 0.16, 1, '#8f7cff');
  ring(norm([up[0] - right[0], up[1] - right[1], up[2] - right[2]]), G.R, 0.16, 1, '#8f7cff');
  // the road, inside first (seen through the shell), then the outside over it
  const P = (p, i) => [p.frames.o[i * 3], p.frames.o[i * 3 + 1], p.frames.o[i * 3 + 2]];
  for (const pass of [0, 1]) {
    for (const p of paths) {
      const last = p.closed ? p.N : p.N - 1;
      for (let i = 0; i < last; i += 2) {
        const j = p.closed ? (i + 2) % p.N : Math.min(p.N - 1, i + 2);
        const q0 = P(p, i);
        const q1 = P(p, j);
        const out = Math.hypot(q0[0], q0[1], q0[2]) > G.R;
        if (out !== (pass === 1)) continue;
        const mask = p.mask[i];
        const on = solidIn(mask, mode);
        if (!on && !p.closed) continue;
        const near = dot(q0, v) > 0;
        ctx.strokeStyle = mask !== M.ALL ? hex(colorForMask(mask)) : out ? '#f4ecff' : '#ffb054';
        ctx.globalAlpha = (on ? 1 : 0.2) * (out ? (near ? 1 : 0.16) : near ? 0.95 : 0.5);
        ctx.lineWidth = (p.closed ? lineW : lineW * 0.75) * (out && near ? 1 : 0.7);
        ctx.beginPath();
        ctx.moveTo(X(q0), Y(q0));
        ctx.lineTo(X(q1), Y(q1));
        ctx.stroke();
      }
    }
    // the openings, between the two
    if (pass === 0) for (const hole of G.holes) ring([hole.axis.x, hole.axis.y, hole.axis.z], hole.r, 1, Math.max(1.5, lineW * 0.6), '#7fe9ff');
  }
  ctx.globalAlpha = 1;
  if (racers) {
    const dotAt = (r, size, fill, edge) => {
      const p = [r.root.position.x, r.root.position.y, r.root.position.z];
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(X(p), Y(p), size, 0, Math.PI * 2);
      ctx.fill();
      if (edge) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };
    for (const r of racers) if (r !== me) dotAt(r, 3, r.isPlayer ? '#ffffff' : hex(r.color));
    if (me) dotAt(me, 5, '#ffffff', true);
  }
  return { X: (x) => x, Z: (z) => z };
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
    // (a course with moving platforms shows their roads too, where they are right now)
    if (world.rig) return drawPaths(ctx, world.rig.surfaces, w, h, mode, 10, racers, 3, me);
    if (this.style === 'flat' || customMap(world.paths)) return drawPaths(ctx, world.paths, w, h, mode, 10, racers, 3, me);
    // 3/4 view: copy the cached course, then only the racers are drawn each tick
    const L = this.course(world, mode, w, h, dpr);
    ctx.drawImage(L.canvas, 0, 0, w, h);
    drawTiltRacers(ctx, L.view, racers, me);
  }
}
