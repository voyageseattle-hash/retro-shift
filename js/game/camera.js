import * as THREE from '../../vendor/three.js';
import { clamp, damp, lerp } from '../core/util.js';

const _d = new THREE.Vector3();
const _l = new THREE.Vector3();
const _w = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Spring-follow chase camera with speed FOV, look-back, trauma shake, kicks, FOV punches
// and cinematic modes.
export class ChaseCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.15, 5000);
    this.pos = new THREE.Vector3(0, 5, -10);
    this.look = new THREE.Vector3();
    // Horizontal offset from the truck. Following the offset (not the world position)
    // keeps the truck the same size on screen at any speed.
    this.rel = new THREE.Vector3(0, 0, -9);
    this.shake = 0;
    this.shakeScale = 1;
    this.heading = 0;
    this.fov = 68;
    this.fovKick = 0;
    this.fovKickVel = 0;
    this.kickOff = new THREE.Vector3();
    this.kickVel = new THREE.Vector3();
    this.roll = 0;
    this.pull = 0;
    this.time = Math.random() * 100;
    this.wasBoosting = false;
    this.mode = 'chase';
    this.orbitT = 0;
    this.cinematic = null;
    // which way is up on screen: the world's, except on a bent road (a pipe wall, a corkscrew), where it's the road's
    this.upV = new THREE.Vector3(0, 1, 0);
    this.bent = 0;
  }

  snap(v) {
    this.heading = v.yaw;
    this.anchor = v.pos.clone();
    this.upV.copy(WORLD_UP);
    this.bent = 0;
    const f = _d.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    const dist = 5.8 * v.scale;
    this.rel.copy(f).multiplyScalar(-dist);
    this.pos.copy(v.pos).add(this.rel);
    this.pos.y += 2.3 * v.scale;
    this.look.copy(v.pos).addScaledVector(f, 6).add(_l.set(0, 1.4, 0));
    this.kickOff.set(0, 0, 0);
    this.kickVel.set(0, 0, 0);
    this.fovKick = this.fovKickVel = 0;
    this.apply(0);
  }

  // Trauma-style shake: amount accumulates, the visible shake is trauma squared.
  addShake(amount) {
    this.shake = Math.min(1.4, this.shake + amount * this.shakeScale);
  }

  // Positional jolt in world space that springs back (hits, landings, boosts).
  kick(dir, amount) {
    this.kickVel.addScaledVector(dir, amount * this.shakeScale);
  }

  // Momentary FOV widening that springs back (boost, mini-turbo, big hits).
  fovPunch(amount) {
    this.fovKickVel += amount * 14;
  }

  update(dt, v, world, lookBack = false) {
    this.time += dt;
    this.springs(dt);
    if (this.cinematic) {
      this.cinematic(dt, this);
      // Keep the follow offset in sync so leaving the cinematic doesn't jump.
      if (v) this.rel.set(this.pos.x - v.pos.x, 0, this.pos.z - v.pos.z);
      this.apply(dt);
      return;
    }
    if (!v.alive) {
      // Orbit the wreck
      this.orbitT += dt * 0.6;
      const r = 12;
      const want = _d.set(v.pos.x + Math.sin(this.orbitT + this.heading) * r, v.pos.y + 6, v.pos.z + Math.cos(this.orbitT + this.heading) * r);
      this.pos.lerp(want, 1 - Math.exp(-3 * dt));
      this.rel.set(this.pos.x - v.pos.x, 0, this.pos.z - v.pos.z);
      this.look.lerp(v.pos, 1 - Math.exp(-6 * dt));
      this.roll = damp(this.roll, 0, 4, dt);
      this.apply(dt);
      return;
    }
    this.orbitT = 0;
    if (v.vis?.on || this.bent > 0) {
      if (this.followBent(dt, v, lookBack)) return;
    }
    // Follow a blend of facing and travel direction so drifts stay framed.
    const hs = Math.hypot(v.vel.x, v.vel.z);
    let target = v.yaw;
    if (hs > 6 && v.speed > 0) {
      const velHeading = Math.atan2(v.vel.x, v.vel.z);
      const w = v.drift.active ? 0.55 : 0.25;
      target = v.yaw + wrapTo(velHeading - v.yaw) * w;
    }
    this.heading += wrapTo(target - this.heading) * (1 - Math.exp(-7 * dt));
    const sp = clamp(Math.abs(v.speed) / (v.phys?.topSpeed || 60), 0, 1.5);
    const boosting = v.boostTime > 0;
    if (boosting && !this.wasBoosting) {
      // Boost kick: the camera gets yanked back and the view widens.
      this.fovPunch(9);
      this.kick(_w.set(-Math.sin(v.yaw), 0.15, -Math.cos(v.yaw)), 5);
    }
    this.wasBoosting = boosting;
    // Boosting lets the truck pull away a little, then the camera catches up.
    this.pull = damp(this.pull, boosting ? 1.3 : 0, boosting ? 3 : 1.5, dt);
    // at speed the camera drops and tucks in close behind, and the view stretches wide
    const dist = (5.6 - sp * 0.5 + this.pull) * v.scale;
    const height = (2.25 - sp * 0.35) * v.scale;
    const dir = lookBack ? -1 : 1;
    const f = _d.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.rel.x = damp(this.rel.x, -f.x * dist * dir, 10, dt);
    this.rel.z = damp(this.rel.z, -f.z * dist * dir, 10, dt);
    // follow a point that tracks the car exactly along its heading but eases sideways, so a rail nudging the car a
    // few centimetres each frame doesn't shake the whole view
    const A = (this.anchor ||= v.pos.clone());
    if (A.distanceToSquared(v.pos) > 400) A.copy(v.pos);
    const dx = v.pos.x - A.x;
    const dz = v.pos.z - A.z;
    const along = dx * f.x + dz * f.z;
    const k = 1 - Math.exp(-16 * dt);
    A.x += f.x * along + (dx - f.x * along) * k;
    A.z += f.z * along + (dz - f.z * along) * k;
    A.y = v.pos.y;
    this.pos.x = A.x + this.rel.x;
    this.pos.z = A.z + this.rel.z;
    const flying = v.form === 'wing';
    const pitch = flying ? v.pitch || 0 : 0;
    if (flying) {
      // Planes: sit behind and slightly above along the flight path, so dives and climbs stay framed.
      this.pos.y = damp(this.pos.y, v.pos.y + height - Math.sin(pitch) * dist * 0.85, 6, dt);
    } else {
      this.pos.y = damp(this.pos.y, v.pos.y + height, v.grounded ? 9 : 3.5, dt);
      // Never let a big drop leave the truck out of frame.
      this.pos.y = clamp(this.pos.y, v.pos.y + height * 0.35, v.pos.y + height * 2.6);
    }
    if (world) {
      const gy = world.heightAt(this.pos.x, this.pos.z, this.pos.y);
      if (this.pos.y < gy + 1.2) this.pos.y = gy + 1.2;
    }
    const lookTarget = _l.copy(A).addScaledVector(f, 6 * dir * v.scale);
    lookTarget.y += 1.4 * v.scale + Math.sin(pitch) * 6 * dir;
    this.look.lerp(lookTarget, 1 - Math.exp(-14 * dt));
    this.fov = damp(this.fov, 62 + sp * 20 + (boosting ? 12 : 0), 3, dt);
    // a constant fine buzz near top speed
    if (sp > 0.8 && v.grounded) this.shake = Math.max(this.shake, Math.min(0.12, (sp - 0.8) * 0.3) * this.shakeScale);
    // Lean into drifts a touch.
    const rollT = flying ? -(v.bank || 0) * 0.18 : v.drift.active && v.grounded ? -v.drift.dir * 0.035 : clamp(-v.yawRate * 0.012, -0.02, 0.02);
    this.roll = damp(this.roll, rollT * this.shakeScale, 5, dt);
    this.apply(dt);
  }

  // On a bent road: sit behind and above the craft in the road's own frame, and turn the view with the road, so a pipe
  // wall or a corkscrew rolls the world round you. Eases back to the world's up as the road straightens out.
  followBent(dt, v, lookBack) {
    const on = !!v.vis?.on;
    this.bent = on ? 1 : Math.max(0, this.bent - dt * 2.5);
    if (!on) {
      if (this.bent <= 0) this.upV.copy(WORLD_UP);
      else this.upV.lerp(WORLD_UP, 1 - Math.exp(-6 * dt)).normalize();
      return false;
    }
    const V = v.vis;
    this.upV.lerp(V.up, 1 - Math.exp(-9 * dt));
    if (this.upV.lengthSq() < 0.01) this.upV.copy(V.up);
    this.upV.normalize();
    const sp = clamp(Math.abs(v.speed) / (v.phys?.topSpeed || 60), 0, 1.5);
    const dir = lookBack ? -1 : 1;
    const dist = (5.6 - sp * 0.5) * v.scale;
    const height = (2.25 - sp * 0.35) * v.scale;
    const want = _w.copy(V.pos).addScaledVector(V.fwd, -dist * dir).addScaledVector(this.upV, height);
    this.pos.lerp(want, 1 - Math.exp(-40 * dt));
    this.rel.set(this.pos.x - v.pos.x, 0, this.pos.z - v.pos.z);
    this.heading = v.yaw;
    const lookTarget = _l.copy(V.pos).addScaledVector(V.fwd, 6 * dir * v.scale).addScaledVector(this.upV, 1.4 * v.scale);
    this.look.lerp(lookTarget, 1 - Math.exp(-30 * dt));
    this.fov = damp(this.fov, 62 + sp * 20 + (v.boostTime > 0 ? 12 : 0), 3, dt);
    this.roll = damp(this.roll, 0, 5, dt);
    this.apply(dt);
    return true;
  }

  springs(dt) {
    // Slightly underdamped springs for kicks and FOV punches, sub-stepped so long frames stay stable.
    while (dt > 1e-5) {
      const h = Math.min(dt, 1 / 60);
      dt -= h;
      this.kickVel.addScaledVector(this.kickOff, -160 * h).multiplyScalar(Math.exp(-15 * h));
      this.kickOff.addScaledVector(this.kickVel, h);
      this.fovKickVel += -this.fovKick * 120 * h;
      this.fovKickVel *= Math.exp(-11 * h);
      this.fovKick += this.fovKickVel * h;
    }
  }

  apply(dt) {
    const c = this.camera;
    c.position.copy(this.pos).add(this.kickOff);
    let rollShake = 0;
    if (this.shake > 0.001) {
      // Smooth layered sine noise rather than white noise, so it reads as a jolt, not jitter.
      const s = this.shake * this.shake;
      const t = this.time * 38;
      c.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3 + 1.7) * 0.5) * s * 0.42;
      c.position.y += (Math.sin(t * 1.3 + 0.6) + Math.sin(t * 2.9 + 2.1) * 0.5) * s * 0.36;
      c.position.z += (Math.sin(t * 0.9 + 2.4) + Math.sin(t * 2.1 + 0.3) * 0.5) * s * 0.42;
      rollShake = Math.sin(t * 0.7 + 4.2) * s * 0.07;
      this.shake = Math.max(0, this.shake - dt * 1.7);
    }
    c.up.copy(this.upV);
    c.lookAt(this.look);
    const roll = this.roll + rollShake;
    if (roll) c.rotateZ(roll);
    const fov = clamp(this.fov + this.fovKick, 30, 110);
    if (Math.abs(c.fov - fov) > 0.05) {
      c.fov = fov;
      c.updateProjectionMatrix();
    }
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}

function wrapTo(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
export { lerp };
