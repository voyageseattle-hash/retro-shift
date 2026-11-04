// Wet roads: each frame the scene is drawn again, at half size, from the camera mirrored in the road under the car.
// The road's glass (layers' road material, world/fx.js) samples that picture where each bit of road would see it,
// with a ripple, so the neon above shines back off the tarmac. Only the high quality preset pays for the pass.

import * as THREE from '../../vendor/three.js';
import { REFL } from '../world/fx.js';

const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Reflection {
  constructor() {
    this.rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
    this.cam = new THREE.PerspectiveCamera();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    REFL.uRefl.value = this.rt.texture;
    this.y = 0;
  }

  // y0: the road height under the car. strength 0 turns it off.
  render(gl, scene, camera, y0, strength, w, h, time) {
    REFL.uTime.value = time;
    REFL.uReflK.value = strength;
    if (strength <= 0) return;
    const rw = Math.max(2, Math.floor(w / 2));
    const rh = Math.max(2, Math.floor(h / 2));
    if (this.rt.width !== rw || this.rt.height !== rh) this.rt.setSize(rw, rh);
    // ease the plane toward the road under the car, so hills don't make the reflection jump
    this.y += (y0 - this.y) * 0.25;
    const y = this.y;
    // mirror the camera's position, aim and up in the plane y = y0
    camera.updateMatrixWorld();
    _p.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(_d);
    _t.copy(_p).add(_d);
    const C = this.cam;
    C.fov = camera.fov;
    C.aspect = camera.aspect;
    C.near = camera.near;
    C.far = camera.far;
    C.position.set(_p.x, 2 * y - _p.y, _p.z);
    C.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    C.up.y = -C.up.y;
    C.lookAt(_t.x, 2 * y - _t.y, _t.z);
    C.updateProjectionMatrix();
    C.updateMatrixWorld();
    REFL.uReflM.value.copy(BIAS).multiply(C.projectionMatrix).multiply(C.matrixWorldInverse);
    // draw only what's above the road, without the road itself catching its own reflection
    this.plane.constant = -(y - 0.05);
    const k = REFL.uReflK.value;
    REFL.uReflK.value = 0;
    const prevTarget = gl.getRenderTarget();
    const prevClip = gl.clippingPlanes;
    gl.getClearColor(this.clear ||= new THREE.Color());
    const prevAlpha = gl.getClearAlpha();
    gl.clippingPlanes = [this.plane];
    gl.setRenderTarget(this.rt);
    gl.setClearColor(0x000000, 1);
    gl.clear();
    gl.render(scene, C);
    gl.setRenderTarget(prevTarget);
    gl.clippingPlanes = prevClip;
    gl.setClearColor(this.clear, prevAlpha);
    REFL.uReflK.value = k;
  }
}
