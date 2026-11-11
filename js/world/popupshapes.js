// Paper cut-outs for PAGE TURNER's pop-ups (game/popup.js). Each is drawn flat in x (across) and y (up), standing
// on y = 0: { pts: the outline, a closed polygon [[x, y], ...]; segs: inner lines [x0, y0, x1, y1, ...]; w, h }.

const ring = (segs, cx, cy, r, n = 10) => {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const b = ((k + 1) / n) * Math.PI * 2;
    segs.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(b) * r, cy + Math.sin(b) * r);
  }
};
const rect = (segs, x0, y0, x1, y1) => segs.push(x0, y0, x1, y0, x1, y0, x1, y1, x1, y1, x0, y1, x0, y1, x0, y0);
const done = (pts, segs) => {
  let w = 0;
  let h = 0;
  for (const [x, y] of pts) {
    w = Math.max(w, Math.abs(x) * 2);
    h = Math.max(h, y);
  }
  return { pts, segs, w, h };
};

// ---------------------------------------------------------------- the city
export function building(rng, w, h) {
  const a = w / 2;
  const style = Math.floor(rng() * 3);
  let pts;
  const segs = [];
  if (style === 0) {
    // a slab with a mast
    pts = [[-a, 0], [-a, h], [-a * 0.2, h], [-a * 0.2, h + 2], [a * 0.2, h + 2], [a * 0.2, h], [a, h], [a, 0]];
    segs.push(0, h + 2, 0, h + 2 + h * 0.18);
  } else if (style === 1) {
    // setbacks
    pts = [[-a, 0], [-a, h * 0.6], [-a * 0.65, h * 0.6], [-a * 0.65, h * 0.85], [-a * 0.3, h * 0.85], [-a * 0.3, h], [a * 0.3, h], [a * 0.3, h * 0.85], [a * 0.65, h * 0.85], [a * 0.65, h * 0.6], [a, h * 0.6], [a, 0]];
  } else {
    // a pitched roof
    pts = [[-a, 0], [-a, h * 0.8], [0, h], [a, h * 0.8], [a, 0]];
  }
  // windows: floors and a few mullions, inside the lowest block
  const top = style === 0 ? h : style === 1 ? h * 0.6 : h * 0.8;
  const rows = Math.max(2, Math.round(top / 5));
  for (let r = 1; r < rows; r++) segs.push(-a * 0.82, (r / rows) * top, a * 0.82, (r / rows) * top);
  const cols = Math.max(2, Math.round(w / 5));
  for (let c = 1; c < cols; c++) {
    const x = -a + (c / cols) * w;
    segs.push(x, top * 0.08, x, top * 0.92);
  }
  return done(pts, segs);
}

export function clockTower(h) {
  const a = h * 0.11;
  const pts = [[-a, 0], [-a, h * 0.78], [-a * 1.25, h * 0.78], [-a * 1.25, h * 0.82], [0, h], [a * 1.25, h * 0.82], [a * 1.25, h * 0.78], [a, h * 0.78], [a, 0]];
  const segs = [];
  ring(segs, 0, h * 0.66, a * 0.7, 12);
  segs.push(0, h * 0.66, 0, h * 0.66 + a * 0.5, 0, h * 0.66, a * 0.35, h * 0.66);
  for (let r = 1; r < 6; r++) segs.push(-a, (r / 6) * h * 0.55, a, (r / 6) * h * 0.55);
  return done(pts, segs);
}

export function bus(w, h) {
  const a = w / 2;
  const pts = [[-a, 0.35], [-a, h * 0.85], [-a * 0.85, h], [a * 0.85, h], [a, h * 0.85], [a, 0.35]];
  const segs = [];
  rect(segs, -a * 0.8, h * 0.5, a * 0.8, h * 0.88);
  segs.push(0, h * 0.5, 0, h * 0.88, -a, h * 0.38, a, h * 0.38);
  ring(segs, -a * 0.55, 0.42, 0.42, 8);
  ring(segs, a * 0.55, 0.42, 0.42, 8);
  ring(segs, -a * 0.7, h * 0.24, 0.22, 6);
  ring(segs, a * 0.7, h * 0.24, 0.22, 6);
  return done(pts, segs);
}

// An arch the road runs under: a castle gatehouse, a breaking wave, a lava-rock span.
export function arch(kind, w, h, gapW, gapH) {
  const a = w / 2;
  const g = gapW / 2;
  const segs = [];
  // the opening, from the bottom right of it round to the bottom left
  const hole = [[g, 0], [g, gapH * 0.7], [g * 0.6, gapH * 0.95], [0, gapH], [-g * 0.6, gapH * 0.95], [-g, gapH * 0.7], [-g, 0]];
  let top;
  if (kind === 'castle') {
    const t = a * 0.3; // tower width
    top = [[-a, 0], [-a, h], [-a + t * 0.33, h], [-a + t * 0.33, h - 2], [-a + t * 0.66, h - 2], [-a + t * 0.66, h], [-a + t, h], [-a + t, h * 0.72]];
    // the curtain wall's battlements
    const n = 5;
    for (let k = 0; k < n; k++) {
      const x0 = -a + t + ((k + 0.0) / n) * (w - 2 * t);
      const x1 = -a + t + ((k + 0.5) / n) * (w - 2 * t);
      const x2 = -a + t + ((k + 1.0) / n) * (w - 2 * t);
      top.push([x0, h * 0.72 + 2], [x1, h * 0.72 + 2], [x1, h * 0.72], [x2, h * 0.72]);
    }
    top.push([a - t, h], [a - t * 0.66, h], [a - t * 0.66, h - 2], [a - t * 0.33, h - 2], [a - t * 0.33, h], [a, h], [a, 0]);
    // arrow slits, a portcullis and pennants
    for (const s of [-1, 1]) {
      segs.push(s * (a - t / 2), h * 0.45, s * (a - t / 2), h * 0.6);
      segs.push(s * (a - t / 2), h, s * (a - t / 2), h + 7, s * (a - t / 2), h + 7, s * (a - t / 2) + 4, h + 5.5, s * (a - t / 2) + 4, h + 5.5, s * (a - t / 2), h + 4);
    }
    for (let k = -2; k <= 2; k++) segs.push((k / 3) * g, gapH * (1 - 0.06 * k * k), (k / 3) * g, gapH * 0.72);
  } else if (kind === 'wave') {
    top = [[-a, 0], [-a * 0.95, h * 0.35], [-a * 0.7, h * 0.7], [-a * 0.3, h * 0.95], [a * 0.15, h], [a * 0.55, h * 0.86], [a * 0.8, h * 0.6], [a * 0.72, h * 0.42], [a * 0.9, h * 0.5], [a, h * 0.3], [a, 0]];
    for (let k = 0; k < 4; k++) segs.push(-a * 0.75 + k * a * 0.36, h * (0.55 + 0.1 * k), -a * 0.5 + k * a * 0.36, h * (0.7 + 0.07 * k));
    ring(segs, a * 0.6, h * 0.62, h * 0.07, 8);
  } else {
    top = [[-a, 0], [-a * 0.9, h * 0.5], [-a * 0.72, h * 0.62], [-a * 0.55, h * 0.9], [-a * 0.25, h * 0.82], [-a * 0.05, h], [a * 0.3, h * 0.86], [a * 0.5, h * 0.95], [a * 0.78, h * 0.6], [a * 0.9, h * 0.55], [a, 0]];
    for (const s of [-1, 1]) segs.push(s * a * 0.6, h * 0.75, s * a * 0.68, h * 0.3, s * a * 0.68, h * 0.3, s * a * 0.6, h * 0.1);
    segs.push(-a * 0.1, h * 0.92, 0.5, gapH * 1.15);
  }
  return done([...top, ...hole], segs);
}

// ---------------------------------------------------------------- the sea
// A row of crests: slow up the back, sharp down the face.
export function wave(w, h, n = 3, seed = 0) {
  const pts = [[-w / 2, 0]];
  const segs = [];
  const c = w / n;
  for (let k = 0; k < n; k++) {
    const x0 = -w / 2 + k * c;
    const hh = h * (0.82 + 0.18 * Math.sin(k * 2.1 + seed));
    pts.push([x0, hh * 0.4], [x0 + c * 0.45, hh * 0.72], [x0 + c * 0.78, hh], [x0 + c * 0.93, hh * 0.72]);
    // the curl
    segs.push(x0 + c * 0.78, hh, x0 + c * 0.6, hh * 0.86, x0 + c * 0.6, hh * 0.86, x0 + c * 0.68, hh * 0.68);
    segs.push(x0 + c * 0.1, hh * 0.25, x0 + c * 0.5, hh * 0.45);
  }
  pts.push([w / 2, h * 0.4], [w / 2, 0]);
  return done(pts, segs);
}

export function ship(w, h) {
  const a = w / 2;
  const d = h * 0.26; // deck
  const pts = [[-a * 0.78, 0], [-a, d * 1.25], [-a * 0.62, d * 1.25], [-a * 0.6, d], [a * 0.7, d], [a, d * 1.35], [a * 0.74, 0]];
  const segs = [];
  // three masts with two sails each, a pennant and the rigging
  [-0.45, 0.05, 0.5].forEach((m, k) => {
    const x = a * m;
    const top = h * (k === 1 ? 1 : 0.84);
    segs.push(x, d, x, top);
    for (const [y0, y1, sw] of [[d + (top - d) * 0.12, d + (top - d) * 0.5, 0.26], [d + (top - d) * 0.56, d + (top - d) * 0.88, 0.19]]) {
      segs.push(x - a * sw, y0, x + a * sw, y0, x + a * sw, y0, x + a * sw * 0.8, y1, x + a * sw * 0.8, y1, x - a * sw * 0.8, y1, x - a * sw * 0.8, y1, x - a * sw, y0);
    }
    segs.push(x, top, x + a * 0.1, top - h * 0.03, x + a * 0.1, top - h * 0.03, x, top - h * 0.06);
  });
  segs.push(-a, d * 1.25, a * 0.05, h, a * 0.05, h, a, d * 1.35);
  for (let k = 0; k < 5; k++) ring(segs, -a * 0.5 + k * a * 0.25, d * 0.55, d * 0.12, 6);
  return done(pts, segs);
}

export function lighthouse(h) {
  const a = h * 0.1;
  const pts = [[-a, 0], [-a * 0.6, h * 0.78], [-a * 0.85, h * 0.78], [-a * 0.85, h * 0.82], [-a * 0.5, h * 0.82], [-a * 0.5, h * 0.92], [0, h], [a * 0.5, h * 0.92], [a * 0.5, h * 0.82], [a * 0.85, h * 0.82], [a * 0.85, h * 0.78], [a * 0.6, h * 0.78], [a, 0]];
  const segs = [];
  for (let r = 1; r < 5; r++) {
    const y = (r / 5) * h * 0.78;
    const x = a * (1 - 0.4 * (r / 5));
    segs.push(-x, y, x, y - h * 0.05);
  }
  // the beam
  for (const s of [-1, 1]) segs.push(s * a * 0.5, h * 0.87, s * h * 0.42, h * 0.95, s * a * 0.5, h * 0.87, s * h * 0.42, h * 0.8);
  return done(pts, segs);
}

export function fin(h) {
  return done([[-0.7 * h, 0], [-0.25 * h, 0.52 * h], [0.15 * h, h], [0.3 * h, 0.5 * h], [0.45 * h, 0]], [-0.2 * h, 0.3 * h, 0.2 * h, 0.3 * h]);
}

export function whaleTail(h) {
  const pts = [[-h * 0.1, 0], [-h * 0.07, h * 0.55], [-h * 0.5, h * 0.92], [-h * 0.42, h], [-h * 0.12, h * 0.82], [0, h * 0.72], [h * 0.12, h * 0.82], [h * 0.42, h], [h * 0.5, h * 0.92], [h * 0.07, h * 0.55], [h * 0.1, 0]];
  return done(pts, [-h * 0.25, 0.4, -h * 0.4, 1.2, h * 0.25, 0.4, h * 0.4, 1.2]);
}

// A jagged lump: an iceberg, a boulder.
export function crag(rng, w, h) {
  const n = 5 + Math.floor(rng() * 3);
  const pts = [[-w / 2, 0]];
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    pts.push([-w / 2 + u * w + (rng() - 0.5) * (w / n) * 0.6, h * (0.35 + 0.65 * Math.sin(Math.PI * (0.1 + 0.8 * u)) * (0.7 + 0.3 * rng()))]);
  }
  pts.push([w / 2, 0]);
  const segs = [];
  for (let k = 2; k < pts.length - 2; k += 2) segs.push(pts[k][0], pts[k][1], pts[k][0] * 0.7, pts[k][1] * 0.35);
  return done(pts, segs);
}

// ---------------------------------------------------------------- the volcano
export function cone(w, h) {
  const a = w / 2;
  const pts = [[-a, 0], [-a * 0.55, h * 0.5], [-a * 0.2, h], [-a * 0.1, h * 0.9], [0, h * 0.96], [a * 0.1, h * 0.88], [a * 0.2, h], [a * 0.55, h * 0.5], [a, 0]];
  const segs = [];
  // lava running down from the lip, and the strata
  for (const [x, len] of [[-0.12, 0.5], [0.02, 0.7], [0.13, 0.42]]) {
    let px = a * x;
    let py = h * 0.9;
    for (let k = 0; k < 5; k++) {
      const nx = px + a * (x * 0.5 + 0.05 * Math.sin(k * 2.3 + x * 9));
      const ny = py - (h * len) / 5;
      segs.push(px, py, nx, ny);
      px = nx;
      py = ny;
    }
  }
  for (const y of [0.2, 0.42, 0.66]) segs.push(-a * (1 - y * 0.8), h * y, a * (1 - y * 0.8), h * y);
  // the plume
  ring(segs, 0, h * 1.13, h * 0.08, 8);
  ring(segs, h * 0.09, h * 1.24, h * 0.06, 8);
  ring(segs, -h * 0.05, h * 1.33, h * 0.05, 8);
  return done(pts, segs);
}

// A sheet of flame the width of the road.
export function flame(w, h, n = 7) {
  const pts = [[-w / 2, 0]];
  const segs = [];
  for (let k = 0; k < n; k++) {
    const x0 = -w / 2 + (k / n) * w;
    const c = w / n;
    const hh = h * (0.6 + 0.4 * Math.abs(Math.sin(k * 1.7 + 0.5)));
    pts.push([x0 + c * 0.1, hh * 0.35], [x0 + c * 0.42, hh], [x0 + c * 0.62, hh * 0.55], [x0 + c * 0.9, hh * 0.3]);
    segs.push(x0 + c * 0.45, hh * 0.12, x0 + c * 0.45, hh * 0.5);
  }
  pts.push([w / 2, 0]);
  return done(pts, segs);
}

// A bank of steam: scallops.
export function steam(w, h, n = 5) {
  const pts = [[-w / 2, 0]];
  const segs = [];
  for (let k = 0; k < n; k++) {
    const cx = -w / 2 + ((k + 0.5) / n) * w;
    const r = w / n / 2;
    const top = h * (0.7 + 0.3 * Math.abs(Math.cos(k * 1.3)));
    for (let q = 0; q <= 4; q++) {
      const a = Math.PI - (q / 4) * Math.PI;
      pts.push([cx + Math.cos(a) * r * 0.98, top - r + Math.sin(a) * r]);
    }
    ring(segs, cx, top * 0.45, r * 0.45, 7);
  }
  pts.push([w / 2, 0]);
  return done(pts, segs);
}

export function palm(h) {
  const a = h * 0.035;
  const pts = [[-a, 0], [-a * 0.2, h * 0.5], [a * 1.2, h * 0.86], [a * 2.6, h * 0.86], [a * 1.6, h * 0.5], [a, 0]];
  const segs = [];
  const cx = a * 1.9;
  const cy = h * 0.86;
  for (let k = 0; k < 7; k++) {
    const an = (k / 6) * Math.PI;
    const r = h * 0.3;
    const mx = cx + Math.cos(an) * r * 0.6;
    const my = cy + Math.sin(an) * r * 0.75;
    segs.push(cx, cy, mx, my, mx, my, cx + Math.cos(an) * r, cy + Math.sin(an) * r * 0.45 - r * 0.2);
  }
  return done(pts, segs);
}
