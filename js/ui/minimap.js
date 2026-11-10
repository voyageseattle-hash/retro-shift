// Course maps: the small live map in the HUD and the preview on each track card. Roads are drawn in their world's
// colour; roads that aren't there in your current lens are drawn faint.

import { colorForMask, solidIn, M } from '../world/shift.js';
import * as THREE from '../../vendor/three.js';
import { MAP_STYLES, drawTiltCourse, drawTiltRacers, snapCourse, customMap } from './coursemap.js';

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
