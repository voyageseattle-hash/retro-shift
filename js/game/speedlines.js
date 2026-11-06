// Speed streaks: thin lines in a tube around the camera's view that rush past faster and longer the harder you're
// going, tinted by your lens. They start to show a little before half speed, so a fast run reads as fast.

import * as THREE from '../../vendor/three.js';
import { ACCESS } from '../core/access.js';

const N = 140;
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _r = new THREE.Vector3();
const _w = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);

export class SpeedLines {
  constructor() {
    this.pos = new Float32Array(N * 6);
    this.col = new Float32Array(N * 6);
    this.s = Array.from({ length: N }, () => this.seed({}, true));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.tint = new THREE.Color(1, 1, 1);
  }

  // A streak at an angle round the view axis, some way off it, somewhere ahead.
  seed(s, anywhere = false) {
    s.a = Math.random() * Math.PI * 2;
    s.r = 3 + Math.random() * 6;
    s.d = anywhere ? Math.random() * 70 : 50 + Math.random() * 25;
    s.k = 0.5 + Math.random() * 0.5;
    return s;
  }

  // k: 0..1+, how fast (speed over top speed); boost adds on top.
  update(dt, camera, k, color) {
    // lens colour washed toward white, so the streaks read against roads of the same colour
    this.tint.lerp(_w.copy(color).lerp(WHITE, 0.45), 1 - Math.exp(-8 * dt));
    const show = Math.max(0, (k - 0.42) / 0.5) * (ACCESS.calm ? 0.5 : 1);
    this.mesh.visible = show > 0.01;
    if (!this.mesh.visible) return;
    camera.getWorldDirection(_f);
    _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    _r.crossVectors(_f, _u).normalize();
    const cp = camera.position;
    const pos = this.pos;
    const col = this.col;
    const v = 60 + 140 * show;
    const len = 1.5 + 6 * show;
    for (let i = 0; i < N; i++) {
      const s = this.s[i];
      s.d -= v * dt;
      if (s.d < 6) this.seed(s);
      const ox = Math.cos(s.a) * s.r;
      const oy = Math.sin(s.a) * s.r * 0.6;
      const o = i * 6;
      for (let e = 0; e < 2; e++) {
        const d = s.d + e * len * s.k;
        pos[o + e * 3] = cp.x + _f.x * d + _r.x * ox + _u.x * oy;
        pos[o + e * 3 + 1] = cp.y + _f.y * d + _r.y * ox + _u.y * oy;
        pos[o + e * 3 + 2] = cp.z + _f.z * d + _r.z * ox + _u.z * oy;
      }
      // brightest close up, fading into the distance
      const b = show * s.k * Math.min(1, (70 - s.d) / 30) * 0.95;
      col[o] = this.tint.r * b;
      col[o + 1] = this.tint.g * b;
      col[o + 2] = this.tint.b * b;
      col[o + 3] = col[o + 4] = col[o + 5] = 0;
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('color').needsUpdate = true;
  }
}

