// The space around the course: black sky, an endless floor grid, wireframe ridges and a few stars. With both worlds
// open the grid and ridges are printed twice, red one way and blue the other; a single lens makes them all its colour.

import * as THREE from '../../vendor/three.js';
import { MODE_TINT, BOTH } from '../world/shift.js';
import { damp } from '../core/util.js';

const SUN_SHADER = {
  uniforms: { uTop: { value: new THREE.Color(0xff3a7a) }, uBot: { value: new THREE.Color(0x3a6aff) }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform vec3 uTop, uBot; uniform float uTime; varying vec2 vUv;
    void main(){
      vec2 p = vUv - 0.5; float r = length(p);
      if (r > 0.5) discard;
      float y = vUv.y;
      // stripes widen toward the bottom and scroll slowly
      float band = step(0.5, fract((y * 16.0) - uTime * 0.2));
      float cut = y < 0.55 ? mix(1.0, band, smoothstep(0.55, 0.15, y) * 0.9 + 0.1) : 1.0;
      if (cut < 0.5) discard;
      vec3 c = mix(uBot, uTop, smoothstep(0.0, 1.0, y));
      float glow = smoothstep(0.5, 0.3, r);
      gl_FragColor = vec4(c * (0.6 + 0.8 * glow), 1.0);
    }`,
};

export class Environment {
  constructor(world) {
    this.group = new THREE.Group();
    const y = world.floorY;
    // centre of the course
    const m = world.main;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < m.N; i++) {
      cx += m.px[i];
      cz += m.pz[i];
    }
    cx /= m.N;
    cz /= m.N;
    this.center = new THREE.Vector3(cx, y, cz);
    // floor grid
    const size = 4000;
    const step = 24;
    const posA = [];
    const posB = [];
    for (let k = -size / 2; k <= size / 2; k += step) {
      posA.push(k, 0, -size / 2, k, 0, size / 2);
      posB.push(-size / 2, 0, k, size / 2, 0, k);
    }
    const lines = (pos, mat) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return new THREE.LineSegments(g, mat);
    };
    this.gridMat = new THREE.LineBasicMaterial({ color: 0xff2a4a, transparent: true, opacity: 0.32 });
    this.gridMatB = new THREE.LineBasicMaterial({ color: 0x1e8cff, transparent: true, opacity: 0.32 });
    for (const [pos, mat] of [[posA, this.gridMat], [posB, this.gridMatB]]) {
      const g = lines(pos, mat);
      g.position.set(Math.round(cx / step) * step, y, Math.round(cz / step) * step);
      this.group.add(g);
    }
    // dark floor under the grid so the void reads as ground
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: 0x030108 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, y - 0.2, cz);
    this.group.add(floor);
    // sun (kept for tracks that ask for one with def.sunVisible; the concept look is a black sky)
    this.sunMat = new THREE.ShaderMaterial({ ...SUN_SHADER, uniforms: THREE.UniformsUtils.clone(SUN_SHADER.uniforms), fog: false, depthWrite: false });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.sunMat);
    this.sun.scale.setScalar(700);
    this.sun.renderOrder = -2;
    this.sun.visible = !!world.def.sunVisible;
    this.group.add(this.sun);
    const sunDirs = [new THREE.Vector3(0, 0.14, 1), new THREE.Vector3(1, 0.14, 0.2), new THREE.Vector3(-0.6, 0.14, -1)];
    this.sunDir = sunDirs[(world.def.sun ?? 0) % 3].normalize();
    // mountains: a ring of jagged wire ridges
    const mp = [];
    const mpB = [];
    const R = 1700;
    const n = 96;
    let s = world.def.seed || 1;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const peaks = [];
    for (let k = 0; k < n; k++) peaks.push(40 + rnd() * 190 * (0.4 + 0.6 * Math.abs(Math.sin(k * 0.21))));
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = ((k + 1) / n) * Math.PI * 2;
      const p0 = [Math.cos(a0) * R, peaks[k], Math.sin(a0) * R];
      const p1 = [Math.cos(a1) * R, peaks[(k + 1) % n], Math.sin(a1) * R];
      // alternate ridges belong to the red and the blue world
      const o = k % 2 ? mpB : mp;
      o.push(...p0, ...p1);
      o.push(...p0, Math.cos(a0) * R * 0.94, 0, Math.sin(a0) * R * 0.94);
      o.push(...p0, Math.cos(a0 + 0.03) * R * 1.05, 0, Math.sin(a0 + 0.03) * R * 1.05);
    }
    this.mtnMat = new THREE.LineBasicMaterial({ color: 0xff2a4a, fog: false, transparent: true, opacity: 0.45 });
    this.mtnMatB = new THREE.LineBasicMaterial({ color: 0x1e8cff, fog: false, transparent: true, opacity: 0.45 });
    for (const [pos, mat] of [[mp, this.mtnMat], [mpB, this.mtnMatB]]) {
      const g = lines(pos, mat);
      g.position.set(cx, y, cz);
      this.group.add(g);
    }
    // stars
    const sp = [];
    for (let k = 0; k < 1400; k++) {
      const u = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const r2 = Math.sqrt(1 - u * u);
      if (u < 0.05) continue;
      sp.push(Math.cos(a) * r2 * 2400, u * 2400, Math.sin(a) * r2 * 2400);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x8a8aa0, size: 1.5, sizeAttenuation: false, fog: false }));
    this.group.add(this.stars);
    this.fog = new THREE.Fog(0x020103, 180, 1100);
    this.bg = new THREE.Color(0x000000);
    this.tint = { grid: new THREE.Color(0xff2a4a), gridB: new THREE.Color(0x1e8cff), fog: new THREE.Color(0x020103), top: new THREE.Color(0xff3a7a), bot: new THREE.Color(0x3a6aff) };
    this.mode = BOTH;
    this.pulse = 0;
  }

  // Split-screen: the sky and grid tint follow each player's own lens.
  useView(k) {
    this.views ||= [];
    this.views[this.view ?? 0] = { mode: this.mode, pulse: this.pulse, tint: this.tint };
    const v = this.views[k] || { mode: this.mode, pulse: 0, tint: Object.fromEntries(Object.entries(this.tint).map(([n, c]) => [n, c.clone()])) };
    this.mode = v.mode;
    this.pulse = v.pulse;
    this.tint = v.tint;
    this.view = k;
  }

  setMode(mode) {
    this.mode = mode;
    this.pulse = 1;
  }

  update(dt, t, camera) {
    const T = MODE_TINT[this.mode];
    const k = 1 - Math.exp(-6 * dt);
    this.tint.grid.lerp(_c.set(T.grid), k);
    this.tint.gridB.lerp(_c.set(T.gridB), k);
    this.tint.fog.lerp(_c.set(T.fog), k);
    this.tint.top.lerp(_c.set(T.sun[0]), k);
    this.tint.bot.lerp(_c.set(T.sun[1]), k);
    this.pulse = damp(this.pulse, 0, 3, dt);
    this.gridMat.color.copy(this.tint.grid).multiplyScalar(0.7 + this.pulse * 1.5);
    this.gridMatB.color.copy(this.tint.gridB).multiplyScalar(0.7 + this.pulse * 1.5);
    this.mtnMat.color.copy(this.tint.grid);
    this.mtnMatB.color.copy(this.tint.gridB);
    this.fog.color.copy(this.tint.fog);
    this.bg.copy(this.tint.fog).multiplyScalar(0.3);
    this.sunMat.uniforms.uTop.value.copy(this.tint.top);
    this.sunMat.uniforms.uBot.value.copy(this.tint.bot);
    this.sunMat.uniforms.uTime.value = t;
    // the sun and the stars stay on the horizon wherever the camera goes
    const cp = camera.position;
    this.sun.position.copy(cp).addScaledVector(this.sunDir, 2000);
    this.sun.position.y = this.center.y + 2000 * this.sunDir.y + 120;
    this.sun.lookAt(cp.x, this.sun.position.y, cp.z);
    this.stars.position.copy(cp);
  }
}

const _c = new THREE.Color();
