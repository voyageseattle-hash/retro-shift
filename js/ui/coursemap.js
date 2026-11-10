// Three-quarter course maps: the course seen from the same raised outside angle as the staged course shots
// (elevated, looking down about 30 degrees, turned 35 degrees), instead of flat from straight above.
//
//   'tilt'  a neon line drawing in that view: the road as a glowing ribbon (red, blue, white for both), its shadow and
//           support pylons on a faint ground grid, so climbs, bridges and stacked roads read. The course is drawn once
//           into a cached layer (per lens and size); each map tick only copies that layer and draws the racer dots.
//   'snap'  (the default) the real game render of the course from the same angle, taken once per lens when the race loads (three
//           small renders), with the route and racer dots drawn over it by the same projection, so they sit on the
//           road. Split screen uses 'tilt'. Course cards show the course's portrait (assets/courses/<id>.webp).
//   'flat'  the original top-down line map (minimap.js), still in Settings > MAP.
//
// Courses with their own map (paths[0].globe, paths[0].fold on their branches) keep it in every style.

import { colorForMask, solidIn, M, BOTH, RED, BLUE } from '../world/shift.js';
import { drawPaths } from './minimap.js';

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const AZ = (35 * Math.PI) / 180;
const EL = (30 * Math.PI) / 180;

export const MAP_STYLES = ['flat', 'tilt', 'snap'];

// The view: right and up on screen, and depth (toward you), for a world point.
export function viewBasis(az = AZ, el = EL) {
  const sa = Math.sin(az), ca = Math.cos(az), se = Math.sin(el), ce = Math.cos(el);
  return {
    az, el,
    right: [ca, 0, -sa],
    up: [-sa * se, ce, -ca * se],
    fwd: [sa * ce, se, ca * ce], // from the course toward the eye
  };
}

const dot3 = (a, x, y, z) => a[0] * x + a[1] * y + a[2] * z;

// Fits a course (its paths and the ground under them) into w x h. Returns the projection.
export function fitView(paths, w, h, pad = 8, basis = viewBasis()) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, gy = Infinity;
  for (const p of paths) for (let i = 0; i < p.N; i++) gy = Math.min(gy, p.py[i]);
  for (const p of paths) {
    for (let i = 0; i < p.N; i += 2) {
      for (const y of [p.py[i], gy]) {
        const u = dot3(basis.right, p.px[i], y, p.pz[i]);
        const v = dot3(basis.up, p.px[i], y, p.pz[i]);
        u0 = Math.min(u0, u); u1 = Math.max(u1, u);
        v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
    }
  }
  const s = Math.min((w - pad * 2) / (u1 - u0 || 1), (h - pad * 2) / (v1 - v0 || 1));
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  const P = (x, y, z) => [w / 2 + (dot3(basis.right, x, y, z) - uc) * s, h / 2 - (dot3(basis.up, x, y, z) - vc) * s];
  return { P, s, uc, vc, gy, basis, w, h, depth: (x, y, z) => dot3(basis.fwd, x, y, z) };
}

const lensColOr = (mask, mode) => (mask === M.ALL && mode === RED ? 0xff2a4a : mask === M.ALL && mode === BLUE ? 0x1e8cff : laneColor(mask));

function laneColor(mask) {
  return mask === M.ALL ? 0xd8c8ff : colorForMask(mask);
}

// The static course layer: ground grid, shadows, pylons, then the road back to front.
export function drawTiltCourse(ctx, paths, w, h, mode = 7, opts = {}) {
  const lineW = opts.lineW ?? 3;
  const V = opts.view || fitView(paths, w, h, opts.pad ?? 8);
  const { P, gy, s } = V;
  // the course's footprint on the ground, for the grid
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of paths) for (let i = 0; i < p.N; i += 2) {
    x0 = Math.min(x0, p.px[i]); x1 = Math.max(x1, p.px[i]);
    z0 = Math.min(z0, p.pz[i]); z1 = Math.max(z1, p.pz[i]);
  }
  const span = Math.max(x1 - x0, z1 - z0);
  const step = Math.max(20, Math.round(span / 9 / 10) * 10);
  const m = step;
  x0 -= m; x1 += m; z0 -= m; z1 += m;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // ground grid
  ctx.lineWidth = 1;
  const grid = (ax, bx, az0, bz) => {
    const a = P(ax, gy, az0), b = P(bx, gy, bz);
    ctx.strokeStyle = '#7a3cff';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  };
  ctx.globalAlpha = opts.gridAlpha ?? 0.16;
  if (!opts.roadOnly) for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) grid(x, x, z0, z1);
  if (!opts.roadOnly) for (let z = Math.ceil(z0 / step) * step; z <= z1; z += step) grid(x0, x1, z, z);

  // segments, with what each needs
  const segs = [];
  for (const p of paths) {
    const last = p.closed ? p.N : p.N - 1;
    const st = p.N > 600 ? 3 : 2;
    for (let i = 0; i < last; i += st) {
      const j = p.closed ? (i + st) % p.N : Math.min(p.N - 1, i + st);
      const mask = p.mask[i];
      const on = solidIn(mask, mode);
      if (!on && !p.closed) continue;
      const a = P(p.px[i], p.py[i], p.pz[i]);
      const b = P(p.px[j], p.py[j], p.pz[j]);
      const depth = V.depth((p.px[i] + p.px[j]) / 2, (p.py[i] + p.py[j]) / 2, (p.pz[i] + p.pz[j]) / 2);
      segs.push({ p, i, j, a, b, on, mask, depth, main: p.closed, lift: (p.py[i] - gy) * s });
    }
  }
  // shadows on the ground (only where the road is up off it)
  ctx.globalAlpha = opts.roadOnly ? 0 : 0.35;
  ctx.strokeStyle = '#000000';
  for (const g of segs) {
    if (g.lift < 2) continue;
    const a = P(g.p.px[g.i], gy, g.p.pz[g.i]), b = P(g.p.px[g.j], gy, g.p.pz[g.j]);
    ctx.lineWidth = lineW * 1.6;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  // pylons from the ground up to raised road
  ctx.lineWidth = 1;
  for (const g of segs) {
    if (opts.roadOnly || g.lift < 3 || !g.on || g.i % 16 >= (g.p.N > 600 ? 3 : 2)) continue;
    const a = P(g.p.px[g.i], gy, g.p.pz[g.i]);
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = hex(lensColOr(g.mask, mode));
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(g.a[0], g.a[1]); ctx.stroke();
  }
  // road, back to front, as a ribbon: a dark deck with a red rail on its left and a blue rail on its right (the two
  // worlds the road belongs to), or both rails in one colour for a one-world road and through a single lens
  segs.sort((a, b) => a.depth - b.depth);
  // the shared road is drawn pale (pink and sky rails, or the lens's pale tint) so the one-world routes, drawn in full
  // red or blue, stand out from it the way shortcuts do on the flat map
  const lensCol = mode === RED ? 0xffa0b0 : mode === BLUE ? 0xa0ccff : 0;
  const railCols = (mask) => {
    if (mask === M.ALL) return lensCol ? [lensCol, lensCol] : [0xffa8bc, 0xa8d4ff];
    const c = laneColor(mask);
    return [c, c];
  };
  const edge = (p, i, side, hw) => P(p.px[i] + p.rightX(i) * side * hw, p.py[i], p.pz[i] + p.rightZ(i) * side * hw);
  for (const g of segs) {
    const px = (g.main ? lineW : lineW * 0.75) * 0.9;
    const hw = Math.max(g.p.halfW, px / s);
    const l0 = edge(g.p, g.i, -1, hw), l1 = edge(g.p, g.j, -1, hw), r0 = edge(g.p, g.i, 1, hw), r1 = edge(g.p, g.j, 1, hw);
    ctx.globalAlpha = g.on ? 0.92 : 0.12;
    ctx.fillStyle = '#1a0a2e';
    ctx.strokeStyle = '#1a0a2e';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(l0[0], l0[1]); ctx.lineTo(l1[0], l1[1]); ctx.lineTo(r1[0], r1[1]); ctx.lineTo(r0[0], r0[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    const [cl, cr] = railCols(g.mask);
    ctx.globalAlpha = g.on ? 1 : 0.2;
    ctx.lineWidth = g.main ? 1.3 : 1.1;
    ctx.strokeStyle = hex(cl);
    ctx.beginPath(); ctx.moveTo(l0[0], l0[1]); ctx.lineTo(l1[0], l1[1]); ctx.stroke();
    ctx.strokeStyle = hex(cr);
    ctx.beginPath(); ctx.moveTo(r0[0], r0[1]); ctx.lineTo(r1[0], r1[1]); ctx.stroke();
    g.cols = [cl, cr];
  }
  // neon glow on top (added light), in the mix of the rails' colours
  ctx.globalCompositeOperation = 'lighter';
  for (const g of segs) {
    if (!g.on) continue;
    const [cl] = g.cols;
    ctx.strokeStyle = g.mask === M.ALL ? (lensCol ? hex(lensCol) : '#b070ff') : hex(cl);
    ctx.globalAlpha = g.mask === M.ALL ? 0.07 : 0.16;
    ctx.lineWidth = (g.main ? lineW : lineW * 0.75) * 3.4;
    ctx.beginPath(); ctx.moveTo(g.a[0], g.a[1]); ctx.lineTo(g.b[0], g.b[1]); ctx.stroke();
  }
  ctx.restore();
  return V;
}

// Racer dots in the view, each with a short drop line to the ground so height reads.
export function drawTiltRacers(ctx, V, racers, me) {
  if (!racers) return;
  const { P, gy } = V;
  ctx.save();
  const dot = (r, rad, fill, stroke) => {
    const [x, y] = P(r.pos.x, r.pos.y, r.pos.z);
    const [gx, gyy] = P(r.pos.x, gy, r.pos.z);
    if (gyy - y > 4) {
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = fill;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(gx, gyy); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  };
  for (const r of racers) if (r !== me) dot(r, 3, r.isPlayer ? '#ffffff' : hex(r.color));
  if (me) dot(me, 5, '#ffffff', '#000000');
  ctx.restore();
}

// Uses another map for courses that bring their own (globe, fold).
export const customMap = (paths) => !!(paths[0]?.globe || paths[0]?.fold);

// Real render of the course from the map's angle, one per lens, taken once. Returns { [mode]: canvas, view }.
export function snapCourse(race, renderer, THREE, w, h, dpr = 1) {
  const world = race.world;
  const paths = world.paths;
  const V = fitView(paths, w, h, 6);
  const { basis, s, uc, vc } = V;
  const R = renderer.renderer;
  const cv = R.domElement;
  const W = cv.width, H = cv.height;
  // an orthographic camera looking the map's way, sized so the map's rectangle sits in the middle of the canvas
  const halfH = h / 2 / s;
  const halfW = halfH * (W / H);
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 1, 20000);
  const C = new THREE.Vector3(...basis.right).multiplyScalar(uc).add(new THREE.Vector3(...basis.up).multiplyScalar(vc));
  const F = new THREE.Vector3(...basis.fwd);
  cam.position.copy(C).addScaledVector(F, 6000);
  cam.up.set(...basis.up);
  cam.lookAt(C);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  // only the course itself: hide sky, ground, fog, traffic and racers for the shot
  const hidden = [];
  for (const ob of race.scene.children) if (ob !== world.group && ob.visible) { hidden.push(ob); ob.visible = false; }
  const fog = race.scene.fog, bg = race.scene.background, mirror = renderer.mirror;
  renderer.mirror = false; // the map is never drawn mirrored
  race.scene.fog = null;
  race.scene.background = new THREE.Color(0x07030f);
  const out = { view: V };
  const sh = (h / 2 / s / halfH) * H; // map height in canvas pixels
  const sw = sh * (w / h);
  for (const mode of [BOTH, RED, BLUE]) {
    world.layers.update(0, mode, race.t || 0, true);
    renderer.render(race.scene, [{ camera: cam, x: 0, y: 0, w: 1, h: 1 }], 0.9);
    const c = document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.getContext('2d').drawImage(cv, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    out[mode] = c;
  }
  race.scene.fog = fog;
  race.scene.background = bg;
  renderer.mirror = mirror;
  for (const ob of hidden) ob.visible = true;
  const pm = race.players?.[0]?.mode ?? BOTH;
  world.layers.update(0, pm, race.t || 0, true);
  return out;
}

export const MAP_LABEL = { flat: 'FLAT', tilt: '3/4 NEON', snap: '3/4 LIVE' };
// the map style: ?map=flat|tilt|snap on the address wins, then the setting
export function mapStyle(settings) {
  const q = new URLSearchParams(location.search).get('map');
  if (MAP_STYLES.includes(q)) return q;
  return MAP_STYLES.includes(settings?.map) ? settings.map : 'snap';
}

// The map on a course card: flat, the 3/4 neon drawing, or (snap, the default) the course's portrait shot.
const portraits = new Map();
export function drawCard(cv, paths, style, def) {
  const ctx = cv.getContext('2d');
  const drawn = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (style === 'flat' || customMap(paths)) drawPaths(ctx, paths, cv.width, cv.height, 7, 10, null, 2.5);
    else drawTiltCourse(ctx, paths, cv.width, cv.height, 7, { lineW: 2.2, pad: 6 });
  };
  if (style !== 'snap') return drawn();
  // 'snap': the course's portrait (a crop of its staged outside shot); a course without one gets the drawn map
  let img = portraits.get(def.id);
  if (!img) {
    img = new Image();
    img.src = `assets/courses/${def.id}.webp`;
    portraits.set(def.id, img);
  }
  const put = () => {
    const r = Math.max(cv.width / img.naturalWidth, cv.height / img.naturalHeight);
    const dw = img.naturalWidth * r, dh = img.naturalHeight * r;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
  };
  if (img.complete) return img.naturalWidth ? put() : drawn();
  img.addEventListener('load', put, { once: true });
  img.addEventListener('error', drawn, { once: true });
}
