// Rival portraits: each driver is their racing helmet, lit and rendered in three.js once (glossy shell, a mirrored
// visor reflecting a red-and-blue neon room, glowing livery, bloom), then kept as an image for the RADIO box, the
// cup cards and anywhere else a driver needs a face.

import * as THREE from '../../vendor/three.js';

const SIZE = 320;
const cache = new Map();
let kit = null;

// The shared rig: renderer, bloom, a neon room to reflect, lights, camera.
function rig() {
  if (kit) return kit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // the room the helmets reflect: black, with a red strip down the left, a blue strip down the right and a soft
  // white panel overhead (the game's two worlds, on the visor)
  const room = new THREE.Scene();
  room.background = new THREE.Color(0x05020a);
  const strip = (color, x, y, z, w, h, ry = 0, k = 1.7) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    room.add(m);
  };
  strip(0xff2a4a, -4, 0.5, 1, 0.25, 7, Math.PI / 2);
  strip(0xff2a4a, -3, 0.5, -3, 0.5, 7, Math.PI / 3);
  strip(0x1e8cff, 4, 0.5, 1, 0.25, 7, -Math.PI / 2);
  strip(0x1e8cff, 3, 0.5, -3, 0.5, 7, -Math.PI / 3);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.6) }));
  top.position.set(0, 4, 1);
  top.rotation.x = Math.PI / 2;
  room.add(top);
  strip(0xb04cff, 0, -2.5, 4, 6, 0.3, 0, 2);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(room, 0.02).texture;
  pm.dispose();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  const composer = new THREE.EffectComposer(renderer);
  const scene = new THREE.Scene();
  composer.addPass(new THREE.RenderPass(scene, camera));
  composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(SIZE, SIZE), 0.5, 0.4, 0.92));
  composer.addPass(new THREE.OutputPass());
  kit = { renderer, composer, scene, camera, env };
  return kit;
}

// A helmet shell from a sphere: the back drawn out, the chin pushed forward and squared, the bottom cut open.
function shapeVec(v, o = {}) {
  if (v.z < 0) v.z *= o.back ?? 1.14;
  // taller, narrowing toward the crown, with a squared chin bar pushed out under the visor
  if (v.y > 0) v.y *= 1.08;
  if (v.y < -0.15) v.y = -0.15 + (v.y + 0.15) * 0.82;
  if (v.z > 0 && v.y < 0.05) v.z += (0.05 - v.y) * (o.chin ?? 0.3);
  if (v.z > 0.3 && v.y < -0.3) v.x *= 0.88;
  v.y = Math.max(v.y, -0.74);
  v.x *= (o.wide ?? 0.9) - Math.max(0, v.y) * 0.06;
  return v;
}
function shape(geo, o = {}) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let k = 0; k < p.count; k++) {
    shapeVec(v.fromBufferAttribute(p, k), o);
    p.setXYZ(k, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
// a point on the shell at sphere angles (phi round the Y axis, theta down from the top), radius r
const onShell = (phi, theta, r, o) => shapeVec(new THREE.Vector3(-Math.cos(phi) * Math.sin(theta) * r, Math.cos(theta) * r, Math.sin(phi) * Math.sin(theta) * r), o);

const shellMat = (color, o = {}) =>
  new THREE.MeshPhysicalMaterial({ color, metalness: o.metal ?? 0.15, roughness: o.rough ?? 0.38, clearcoat: o.coat ?? 0.6, clearcoatRoughness: 0.18, flatShading: !!o.flat, envMapIntensity: o.env ?? 0.7 });
const visorMat = (tint, o = {}) =>
  new THREE.MeshPhysicalMaterial({ color: tint, metalness: 1, roughness: o.rough ?? 0.04, iridescence: o.irid ?? 0, iridescenceIOR: 1.6, envMapIntensity: 2.4, flatShading: !!o.flat, emissive: new THREE.Color(tint).multiplyScalar(0.12) });
const glow = (color, k = 2.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });

// the visor: a slice of a slightly bigger sphere across the front, shaped like the shell, in a glowing gasket
// (o.frame: its colour; false for none)
function visor(mat, o = {}) {
  const w = o.w ?? 0.98;
  const top = o.top ?? 1.05;
  const h = o.h ?? 0.62;
  const g = new THREE.SphereGeometry(1.035, o.seg ?? 64, o.seg ? Math.ceil(o.seg / 2) : 32, Math.PI / 2 - w, w * 2, top, h);
  const m = new THREE.Mesh(shape(g, o), mat);
  if (o.frame === false) return m;
  // the gasket: a tube round the visor's edge, its corners rounded
  const pts = [];
  const n = 24;
  const edge = (a0, t0, a1, t1) => {
    for (let k = 0; k < n; k++) pts.push(onShell(a0 + ((a1 - a0) * k) / n, t0 + ((t1 - t0) * k) / n, 1.045, o));
  };
  const p0 = Math.PI / 2 - w;
  const p1 = Math.PI / 2 + w;
  edge(p0, top, p1, top);
  edge(p1, top, p1, top + h);
  edge(p1, top + h, p0, top + h);
  edge(p0, top + h, p0, top);
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.2);
  const G = new THREE.Group();
  G.add(m, new THREE.Mesh(new THREE.TubeGeometry(curve, 200, o.frameR ?? 0.016, 8, true), o.frameMat || glow(o.frame ?? 0xf4f0ff, 1.5)));
  return G;
}
// the visor pivots, one each side: a dark disc with a lit ring
function pivots(G, color, o = {}) {
  for (const s of [-1, 1]) {
    const p = onShell(Math.PI / 2 + s * 1.25, 1.42, 1.0, o);
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.08, 32), shellMat(0x14101c, { metal: 0.8, rough: 0.3 }));
    d.position.copy(p);
    d.lookAt(p.clone().multiplyScalar(2));
    d.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 32), glow(color, 1.6));
    ring.position.copy(p).multiplyScalar(1.045);
    ring.lookAt(p.clone().multiplyScalar(2));
    G.add(d, ring);
  }
}
// the rubber trim round the bottom of a lid
function trim(o = {}) {
  const pts = [];
  for (let k = 0; k < 64; k++) pts.push(onShell((k / 64) * Math.PI * 2, 2.35, 1.0, o).setY(-0.7));
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 128, 0.07, 8, true), shellMat(0x0a0810, { metal: 0.2, rough: 0.6 }));
}
// a band painted round the shell: a latitude ring of a sphere, turned to run where it's wanted
function band(mat, { r = 1.012, at = Math.PI / 2, w = 0.06, rot = [0, 0, Math.PI / 2], arc = Math.PI * 2, start = 0, o = {} } = {}) {
  const g = new THREE.SphereGeometry(r, 96, 4, start, arc, at - w / 2, w);
  const m = new THREE.Mesh(g, mat);
  m.rotation.set(...rot);
  m.updateMatrix();
  g.applyMatrix4(m.matrix);
  m.rotation.set(0, 0, 0);
  shape(g, o);
  return m;
}

const BUILD = {
  // VEX: a classic full-face lid, pink with twin white centre stripes and a gold mirror visor. Old-school.
  vector(c) {
    const G = new THREE.Group();
    G.add(new THREE.Mesh(shape(new THREE.SphereGeometry(1, 96, 64)), shellMat(c)));
    G.add(visor(visorMat(0xd9a640), { frame: 0xffd27a }), trim());
    pivots(G, 0xffd27a);
    const w = shellMat(0xf4f0ff, { rough: 0.3 });
    G.add(band(w, { at: Math.PI / 2 - 0.09, w: 0.07, arc: Math.PI * 1.25, start: -Math.PI * 0.62 }));
    G.add(band(w, { at: Math.PI / 2 + 0.09, w: 0.07, arc: Math.PI * 1.25, start: -Math.PI * 0.62 }));
    // chin vents
    for (const x of [-0.12, 0, 0.12]) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.05), glow(0xff4fd8, 1.6));
      v.position.set(x, -0.5, 1.03);
      v.rotation.x = -0.35;
      G.add(v);
    }
    return G;
  },
  // LINA SCAN: a long-tail aero lid, built for speed: red, a white slash down each side, a spoiler fin out the back.
  scanline(c) {
    const G = new THREE.Group();
    const o = { back: 1.35 };
    G.add(new THREE.Mesh(shape(new THREE.SphereGeometry(1, 96, 64), o), shellMat(c, { rough: 0.15 })));
    G.add(visor(visorMat(0xff7a5a, { rough: 0.02 }), { ...o, h: 0.5, top: 1.12, frame: 0xffffff }), trim(o));
    pivots(G, 0xffffff, o);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 32), shellMat(c, { rough: 0.15 }));
    tail.rotation.x = -Math.PI / 2 - 0.2;
    tail.position.set(0, 0.12, -1.45);
    tail.scale.set(1, 1, 0.5);
    G.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.32), shellMat(0x1a0408, { metal: 0.8, rough: 0.3 }));
    fin.position.set(0, 0.42, -1.22);
    fin.rotation.x = 0.25;
    G.add(fin);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const b = band(glow(0xffffff, 1.4 - k * 0.3), { at: Math.PI / 2, w: 0.035, arc: 1.1 - k * 0.2, start: -0.2, rot: [0.5 + k * 0.17, s > 0 ? 0 : Math.PI, 0], o });
        G.add(b);
      }
    }
    return G;
  },
  // POLLY GONE: a faceted lid, cut like a gem, blue, with a grid-ruled visor and every edge lit.
  polygon(c) {
    const G = new THREE.Group();
    const geo = shape(new THREE.IcosahedronGeometry(1, 2));
    G.add(new THREE.Mesh(geo, shellMat(c, { flat: true, rough: 0.18 })));
    G.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 8), new THREE.LineBasicMaterial({ color: new THREE.Color(0x9ad0ff).multiplyScalar(1.4), toneMapped: false })));
    const v = visor(visorMat(0x3a90ff, { flat: true }), { seg: 14, w: 0.95, frame: 0x6ae0ff });
    G.add(v);
    // the HUD ruled across the visor
    const lines = [];
    for (let k = 0; k < 5; k++) {
      const y = 0.06 + k * 0.08;
      lines.push(new THREE.Vector3(-0.55, y, 0.98 - Math.abs(y - 0.2) * 0.3), new THREE.Vector3(0.55, y, 0.98 - Math.abs(y - 0.2) * 0.3));
    }
    G.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: new THREE.Color(0x6ae0ff).multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.6 })));
    return G;
  },
  // KROMA: mirror chrome, an iridescent visor, a mohawk of light down the crown and a star on each cheek.
  chroma(c) {
    const G = new THREE.Group();
    G.add(new THREE.Mesh(shape(new THREE.SphereGeometry(1, 96, 64)), shellMat(0x8a5ad0, { metal: 0.9, rough: 0.2, env: 0.6 })));
    G.add(visor(visorMat(0xffffff, { irid: 1, rough: 0.02 }), { frame: 0xff4fd8 }), trim());
    pivots(G, 0xff4fd8);
    for (let k = 0; k < 9; k++) {
      const a = -0.35 + k * 0.28;
      const h = 0.28 - Math.abs(k - 3) * 0.025;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, h, 4), glow(k % 2 ? 0xff4fd8 : c, 2));
      f.position.set(0, Math.cos(a) * (1.05 + h / 2), Math.sin(a) * (1.05 + h / 2) * (a < 0 ? 1.14 : 1));
      f.rotation.x = a;
      G.add(f);
    }
    const star = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 0.06 : 0.15;
      const a = (k / 10) * Math.PI * 2;
      star[k ? 'lineTo' : 'moveTo'](Math.sin(a) * r, Math.cos(a) * r);
    }
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(star), glow(c, 2.4));
      m.position.set(s * 0.86, -0.18, 0.42);
      m.rotation.y = s * 1.1;
      G.add(m);
    }
    return G;
  },
  // RAZ: a boxy lid with an LED visor that shows pixel eyes.
  raster(c) {
    const G = new THREE.Group();
    const box = new THREE.Mesh(new THREE.RoundedBoxGeometry(1.75, 1.6, 1.9, 6, 0.42), shellMat(c, { rough: 0.25 }));
    box.position.y = 0.05;
    G.add(box);
    const panel = new THREE.Mesh(new THREE.RoundedBoxGeometry(1.45, 0.62, 0.1, 3, 0.05), visorMat(0x081218, { rough: 0.15 }));
    panel.position.set(0, 0.16, 0.93);
    G.add(panel);
    const px = glow(0x6ae0ff, 2.6);
    const dot = (x, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.02), px);
      m.position.set(x * 0.085, 0.16 + y * 0.085, 0.99);
      G.add(m);
    };
    for (const cx of [-3.5, 2.5]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(cx + dx, dy - 0.5);
    for (let x = -1; x <= 1; x++) dot(x, -2.5);
    // ear blocks and a stub antenna
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.5), shellMat(0x0c2a36, { metal: 0.7 }));
      e.position.set(s * 0.92, 0, 0);
      G.add(e);
    }
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5), shellMat(0x0c2a36));
    ant.position.set(0.5, 1.05, -0.3);
    G.add(ant);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07), glow(0xff4fd8, 3));
    tip.position.set(0.5, 1.32, -0.3);
    G.add(tip);
    return G;
  },
  // GL1TCH: a lid that came back wrong: sliced into bands that don't line up, a red eye and a blue eye.
  glitch(c) {
    const G = new THREE.Group();
    const cuts = [-0.8, -0.3, -0.05, 0.25, 0.55, 1.1];
    const offs = [0.04, -0.09, 0.13, -0.05, 0.02];
    for (let k = 0; k < cuts.length - 1; k++) {
      const t0 = Math.acos(Math.min(1, cuts[k + 1]));
      const t1 = Math.acos(Math.max(-1, cuts[k]));
      const g = shape(new THREE.SphereGeometry(1, 96, 24, 0, Math.PI * 2, t0, t1 - t0));
      const m = new THREE.Mesh(g, shellMat(k % 2 ? c : 0x2a2410, { rough: 0.2, metal: 0.5 }));
      m.position.x = offs[k];
      G.add(m);
    }
    const l = visor(visorMat(0xff2a4a), { w: 0.49, frame: 0xff4a6a });
    l.position.x = -0.05;
    l.rotation.y = -0.49;
    const r = visor(visorMat(0x1e8cff), { w: 0.49, frame: 0x4ab0ff });
    r.position.set(0.09, -0.04, 0);
    r.rotation.y = 0.49;
    G.add(l, r);
    for (const [x, col] of [[-0.3, 0xff2a4a], [0.32, 0x1e8cff]]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), glow(col, 3));
      e.position.set(x, 0.2, 0.98);
      G.add(e);
    }
    // a crack of light
    const crack = [[-0.1, 0.95, 0.4], [0.05, 0.7, 0.75], [-0.05, 0.5, 0.88], [0.08, 0.32, 0.96]].map((p) => new THREE.Vector3(...p));
    G.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(crack), new THREE.LineBasicMaterial({ color: new THREE.Color(0xffd04a).multiplyScalar(2), toneMapped: false })));
    return G;
  },
  // DASH (from LAST LINE): no helmet. A hollow ink head, a red headband, its tails streaming.
  dash() {
    const G = new THREE.Group();
    const ink = glow(0xf4f0ff, 1.5);
    G.add(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.045, 12, 96), ink));
    const red = glow(0xff2a4a, 2.2);
    const bandC = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.09, 8, 64, Math.PI * 0.9), red);
    bandC.rotation.z = Math.PI * 0.05;
    bandC.position.y = 0.05;
    bandC.scale.y = 0.35;
    G.add(bandC);
    for (const [k, y] of [[0, 0.2], [1, 0.05]]) {
      const pts = [];
      for (let q = 0; q <= 12; q++) pts.push(new THREE.Vector3(-0.95 - q * 0.12, y + Math.sin(q * 0.7 + k) * 0.08 - q * 0.02, -q * 0.02));
      G.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.035, 6), red));
    }
    for (const x of [-0.24, 0.24]) {
      const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.14, 4, 8), ink);
      e.position.set(x, -0.08, 0.05);
      G.add(e);
    }
    G.rotation.y = 0.45;
    return G;
  },
  // Captain Finn Razorback (from ABSURD COMBAT RACING): a steel shark lid, dorsal fin and all, teeth on the chin.
  greatwedge(c) {
    const G = new THREE.Group();
    G.add(new THREE.Mesh(shape(new THREE.SphereGeometry(1, 96, 64), { back: 1.3, chin: 0.4 }), shellMat(0x8a96a4, { metal: 0.85, rough: 0.28 })));
    G.add(visor(visorMat(0x203040), { w: 0.85, h: 0.3, top: 1.2, back: 1.3, chin: 0.4, frame: 0x6ae0ff }), trim({ back: 1.3 }));
    pivots(G, 0x6ae0ff, { back: 1.3, chin: 0.4 });
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.quadraticCurveTo(0.1, 0.4, -0.35, 0.75);
    fin.quadraticCurveTo(-0.45, 0.35, -0.7, 0);
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02 });
    const f = new THREE.Mesh(fg, shellMat(0x6a7684, { metal: 0.85, rough: 0.3 }));
    f.rotation.y = Math.PI / 2;
    f.position.set(-0.03, 0.88, 0.1);
    G.add(f);
    const tooth = shellMat(0xf4f4f0, { rough: 0.4, metal: 0 });
    for (let k = -4; k <= 4; k++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 6), tooth);
      const a = k * 0.13;
      t.position.set(Math.sin(a) * 0.98, -0.3, Math.cos(a) * 1.08);
      t.rotation.x = Math.PI;
      G.add(t);
    }
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.03), glow(0x6ae0ff, 1.8));
        g.position.set(s * 0.86, -0.25, -0.05 - k * 0.14);
        g.rotation.z = s * 0.25;
        G.add(g);
      }
    }
    return G;
  },
};

// The backdrop: the driver's colour glowing behind them, a floor grid, red on one side and blue on the other.
function backdrop(scene, color) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const c = new THREE.Color(color);
  const css = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
  const grad = g.createRadialGradient(128, 110, 10, 128, 128, 180);
  grad.addColorStop(0, css);
  grad.addColorStop(0.45, 'rgba(20,6,30,1)');
  grad.addColorStop(1, '#030106');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0x3a3a3a }));
  bg.position.set(0, 0.3, -3);
  scene.add(bg);
  const pts = [];
  const cols = [];
  const R = new THREE.Color(0xff2a4a);
  const B = new THREE.Color(0x1e8cff);
  for (let k = -8; k <= 8; k++) {
    const col = k < 0 ? R : B;
    pts.push(k * 0.5, -1.25, -3, k * 1.2, -1.25, 3);
    cols.push(col.r, col.g, col.b, col.r, col.g, col.b);
  }
  for (let k = 0; k < 7; k++) {
    const z = -3 + k * 0.9;
    pts.push(-6, -1.25, z, 0, -1.25, z, 0, -1.25, z, 6, -1.25, z);
    cols.push(R.r, R.g, R.b, R.r, R.g, R.b, B.r, B.g, B.b, B.r, B.g, B.b);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  lg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45 })));
}

// A data URL of the driver's portrait (rendered the first time it's asked for, then cached).
export function helmetPortrait(id, color) {
  const key = `${id}:${color}`;
  if (cache.has(key)) return cache.get(key);
  let url = null;
  try {
    const { renderer, composer, scene, camera, env } = rig();
    scene.clear();
    scene.environment = env;
    scene.background = new THREE.Color(0x030106);
    backdrop(scene, color);
    const key1 = new THREE.DirectionalLight(0xffffff, 1.6);
    key1.position.set(-2, 3, 4);
    const rimR = new THREE.DirectionalLight(0xff2a4a, 3.5);
    rimR.position.set(-4, 1, -3);
    const rimB = new THREE.DirectionalLight(0x1e8cff, 3.5);
    rimB.position.set(4, 1, -3);
    scene.add(key1, rimR, rimB, new THREE.AmbientLight(0x4a3a6a, 0.6));
    const helmet = (BUILD[id] || BUILD.vector)(color);
    helmet.rotation.y += 0.62;
    helmet.position.y = 0.05;
    scene.add(helmet);
    camera.position.set(0.6, 0.7, 6.2);
    camera.lookAt(0, -0.02, 0);
    composer.render();
    url = renderer.domElement.toDataURL('image/png');
    scene.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) for (const m of [].concat(o.material)) {
        m.map?.dispose();
        m.dispose();
      }
    });
    scene.clear();
  } catch (e) {
    console.warn('helmet portrait failed', e);
  }
  cache.set(key, url);
  return url;
}

// Render every driver's portrait ahead of time, a frame or so apart, so the first radio call doesn't hitch.
export function warmHelmets(list) {
  let k = 0;
  const next = () => {
    if (k >= list.length) return;
    const [id, color] = list[k++];
    helmetPortrait(id, color);
    if (window.requestIdleCallback) requestIdleCallback(next, { timeout: 300 });
    else setTimeout(next, 30);
  };
  next();
}
