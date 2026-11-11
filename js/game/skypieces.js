// One set piece in each course's sky, far enough away to sit "at infinity" (it follows the camera like the sun).
// Each is drawn in the two worlds' colours and recolours with the lens: a ringed planet over Orbital Loops, a black
// hole over the Void Field, a nebula and a broken moon over Echo Ruins, a giant turning solid over Fractal and Lattice.
// Core, Layered, City, Helix and Tunnels keep the striped retro sun (env.js).

import * as THREE from '../../vendor/three.js';
import { HyperSky } from '../world/tesseract.js';

export const SKY_PIECE = {
  core: 'sun',
  layered: 'sun',
  tunnels: 'sun',
  city: 'sun',
  helix: 'sun',
  orbital: 'planet',
  void: 'blackhole',
  ruins: 'nebula',
  fractal: 'solid',
  lattice: 'solid',
};

const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false };

function segs(pos, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.LineSegments(g, mat);
}

// Latitude/longitude wire sphere, with a black core so it hides the stars behind it.
function wireSphere(r, matA, matB, lat = 9, lon = 18, cut = null) {
  const g = new THREE.Group();
  const a = [];
  const b = [];
  const keep = (th) => !cut || th < cut[0] || th > cut[1];
  for (let i = 1; i < lat; i++) {
    const ph = (i / lat) * Math.PI;
    const y = Math.cos(ph) * r;
    const rr = Math.sin(ph) * r;
    for (let k = 0; k < 48; k++) {
      const t0 = (k / 48) * Math.PI * 2;
      const t1 = ((k + 1) / 48) * Math.PI * 2;
      if (!keep(t0)) continue;
      (i % 2 ? a : b).push(Math.cos(t0) * rr, y, Math.sin(t0) * rr, Math.cos(t1) * rr, y, Math.sin(t1) * rr);
    }
  }
  for (let k = 0; k < lon; k++) {
    const th = (k / lon) * Math.PI * 2;
    if (!keep(th)) continue;
    for (let i = 0; i < 24; i++) {
      const p0 = (i / 24) * Math.PI;
      const p1 = ((i + 1) / 24) * Math.PI;
      (k % 2 ? a : b).push(Math.sin(p0) * Math.cos(th) * r, Math.cos(p0) * r, Math.sin(p0) * Math.sin(th) * r, Math.sin(p1) * Math.cos(th) * r, Math.cos(p1) * r, Math.sin(p1) * Math.sin(th) * r);
    }
  }
  g.add(segs(a, matA), segs(b, matB));
  const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.985, 32, 16, cut ? cut[1] : 0, cut ? Math.PI * 2 - (cut[1] - cut[0]) : Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0x010003, fog: false }));
  g.add(core);
  return g;
}

function ringLines(r0, r1, n, matA, matB, seg = 96) {
  const a = [];
  const b = [];
  for (let j = 0; j < n; j++) {
    const r = r0 + ((r1 - r0) * j) / Math.max(1, n - 1);
    for (let k = 0; k < seg; k++) {
      const t0 = (k / seg) * Math.PI * 2;
      const t1 = ((k + 1) / seg) * Math.PI * 2;
      (j % 2 ? b : a).push(Math.cos(t0) * r, 0, Math.sin(t0) * r, Math.cos(t1) * r, 0, Math.sin(t1) * r);
    }
  }
  const g = new THREE.Group();
  g.add(segs(a, matA), segs(b, matB));
  return g;
}

function cloudTexture(seed = 3) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 90; k++) {
    const px = 128 + (rnd() - 0.5) * 170;
    const py = 128 + (rnd() - 0.5) * 110;
    const r = 18 + rnd() * 60;
    const gr = x.createRadialGradient(px, py, 0, px, py, r);
    const red = px < 128 ? 1 : rnd() * 0.4;
    gr.addColorStop(0, `rgba(${Math.round(255 * red)},${Math.round(40 + rnd() * 40)},${Math.round(255 * (1 - red * 0.8))},0.09)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SkyPiece {
  constructor(kind, dir) {
    this.kind = kind;
    this.group = new THREE.Group();
    this.matA = new THREE.LineBasicMaterial({ color: 0xff2a4a, opacity: 0.85, ...add });
    this.matB = new THREE.LineBasicMaterial({ color: 0x1e8cff, opacity: 0.85, ...add });
    this.dir = dir.clone().setY(dir.y + 0.06).normalize();
    this.spin = [];
    const G = this.group;
    if (kind === 'planet') {
      const p = wireSphere(260, this.matA, this.matB, 10, 20);
      const ring = ringLines(330, 470, 7, this.matA, this.matB);
      ring.rotation.set(0.35, 0, 0.25);
      p.add(ring);
      p.rotation.z = 0.2;
      G.add(p);
      this.spin.push([p, 0.02]);
      const moon = wireSphere(55, this.matB, this.matA, 6, 10);
      moon.position.set(-520, 210, 80);
      G.add(moon);
      this.spin.push([moon, -0.06]);
    } else if (kind === 'blackhole') {
      const disk = ringLines(170, 520, 22, this.matA, this.matB, 128);
      disk.rotation.set(1.25, 0, 0.18);
      G.add(disk);
      this.spin.push([disk, 0.12, 'y']);
      // the lensed back of the disk, arching over the hole
      const halo = ringLines(160, 230, 4, this.matB, this.matA, 96);
      halo.rotation.set(0.12, 0, 0);
      G.add(halo);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(150, 48), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
      G.add(hole);
      this.hole = hole;
      const glow = new THREE.Mesh(new THREE.RingGeometry(150, 175, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.9, ...add }));
      G.add(glow);
      this.glow = glow;
      this.glowMat = glow.material;
    } else if (kind === 'nebula') {
      const neb = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1100), new THREE.MeshBasicMaterial({ map: cloudTexture(7), opacity: 0.9, ...add }));
      G.add(neb);
      this.billboards = [neb];
      const moon = wireSphere(170, this.matA, this.matB, 9, 18, [0.6, 1.5]);
      moon.position.set(260, 90, 60);
      moon.rotation.set(0.3, 0.8, 0.2);
      G.add(moon);
      this.spin.push([moon, 0.015]);
      // the chunk that broke off
      const chunk = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(38, 0)), this.matB);
      chunk.position.set(470, 160, 120);
      G.add(chunk);
      this.spin.push([chunk, 0.2]);
    } else if (kind === 'solid') {
      const outer = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(360, 1)), this.matA);
      const inner = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.DodecahedronGeometry(200, 0)), this.matB);
      const core = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(90, 0)), this.matA);
      G.add(outer, inner, core);
      this.spin.push([outer, 0.03], [inner, -0.05], [core, 0.11]);
    } else if (kind === 'tesseract') {
      // a hypercube turning in the fourth dimension (world/tesseract.js)
      this.hyper = new HyperSky(this.matA, this.matB);
      G.add(this.hyper.group);
    }
    G.scale.setScalar(1.6);
    G.renderOrder = -2;
    G.traverse((o) => {
      o.renderOrder = -2;
      o.frustumCulled = false;
    });
  }

  update(dt, t, camPos, centerY, tint, pulse) {
    const G = this.group;
    G.position.copy(camPos).addScaledVector(this.dir, 2000);
    G.position.y = centerY + 2000 * this.dir.y + 160;
    for (const [o, w, ax] of this.spin) o.rotation[ax || 'y'] += w * dt;
    this.matA.color.copy(tint.grid).multiplyScalar(0.9 + pulse);
    this.matB.color.copy(tint.gridB).multiplyScalar(0.9 + pulse);
    if (this.hole) {
      this.hole.lookAt(camPos);
      this.glowMat.color.copy(tint.grid).lerp(tint.gridB, 0.5 + 0.5 * Math.sin(t * 0.7)).multiplyScalar(1.4);
      this.glow.lookAt(camPos);
    }
    if (this.billboards) for (const b of this.billboards) b.lookAt(camPos);
    this.hyper?.update(dt, tint);
  }
}
