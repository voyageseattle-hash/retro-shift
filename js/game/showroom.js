// The car select and garage backdrop: your wedge turning slowly on a neon platform, with the lens cycling so you
// can see it in all three worlds.

import * as THREE from '../../vendor/three.js';
import { Racer } from '../vehicles/racer.js';
import { BOTH, RED, BLUE } from '../world/shift.js';

export class Showroom {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07020f);
    this.scene.fog = new THREE.Fog(0x07020f, 14, 60);
    const grid = new THREE.GridHelper(120, 60, 0x8a3cff, 0x3a1470);
    grid.material.transparent = true;
    grid.material.opacity = 0.6;
    this.scene.add(grid);
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide };
    this.rings = [];
    for (const [r, c] of [[3.6, 0xff2a4a], [3.9, 0x1e8cff], [4.6, 0xb04cff]]) {
      const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.06, 64), new THREE.MeshBasicMaterial({ color: c, ...add }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.02;
      this.scene.add(m);
      this.rings.push(m);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.6, 64), new THREE.MeshBasicMaterial({ color: 0x0d0420 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.01;
    this.scene.add(disc);
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
    this.t = 0;
    this.racer = null;
    this.modeT = 0;
    this.mode = BOTH;
    this.offsetY = 0;
  }
  setCar(car, livery) {
    if (this.racer) this.scene.remove(this.racer.root, this.racer.trail.mesh);
    const r = new Racer(car, { livery });
    r.grounded = true;
    r.mode = this.mode;
    this.racer = r;
    this.scene.add(r.root);
  }
  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
  update(dt) {
    this.t += dt;
    this.modeT += dt;
    if (this.modeT > 3) {
      this.modeT = 0;
      this.mode = this.mode === BOTH ? RED : this.mode === RED ? BLUE : BOTH;
    }
    const r = this.racer;
    if (r) {
      r.mode = this.mode;
      r.yaw = this.t * 0.45 + 2.4;
      r.speed = 14;
      r.syncVisual(dt);
      r.root.position.set(0, 0, 0);
    }
    // frame the car in the upper part of the screen, above the menu cards
    const wide = this.camera.aspect > 1.2;
    this.camera.position.set(0, 3.8, wide ? 11 : 14);
    this.camera.lookAt(0, wide ? -0.1 : -1.2, 0);
    this.rings.forEach((m, k) => (m.rotation.z = this.t * (k % 2 ? -0.3 : 0.2)));
  }
}
