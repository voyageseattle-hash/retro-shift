// A shift racer: the driving model is WEDGEWRECK RALLY's truck physics (vehicles/vehicle.js: throttle curve,
// drift with three mini-turbo levels, lateral grip, slope gravity, suspension and ground snap), with the combat
// stripped out and a lens added. Each racer looks through its own lens, so the ground it finds, the rails that hold
// it and the obstacles that hit it all depend on its world.

import * as THREE from '../../vendor/three.js';
import { clamp, damp, sign } from '../core/util.js';
import { BOTH, RED, BLUE, SHIFT, solidIn, COLORS } from '../world/shift.js';

const G_AIR = 27;
const G_SLOPE = 14;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _left = new THREE.Vector3();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();

export const CARS = [
  { id: 'vector', name: 'VECTOR', color: 0xff4fd8, stats: { speed: 4, accel: 4, handling: 4 } },
  { id: 'scanline', name: 'SCANLINE', color: 0xff2a4a, stats: { speed: 5, accel: 3, handling: 3 } },
  { id: 'polygon', name: 'POLYGON', color: 0x1e8cff, stats: { speed: 3, accel: 5, handling: 5 } },
  { id: 'chroma', name: 'CHROMA', color: 0xb04cff, stats: { speed: 4, accel: 5, handling: 3 } },
  { id: 'raster', name: 'RASTER', color: 0x6ae0ff, stats: { speed: 5, accel: 4, handling: 2 } },
  { id: 'glitch', name: 'GLITCH', color: 0xffd04a, stats: { speed: 3, accel: 4, handling: 5 } },
];

// WEDGEWRECK's star-stats-to-physics, nudged faster: these are hover wedges, not trucks.
export function physicsFor(stats) {
  return {
    topSpeed: 44 + stats.speed * 2.4,
    accel: 18 + stats.accel * 3.2,
    steer: 1.6 + stats.handling * 0.16,
    grip: 5.6 + stats.handling * 0.9,
  };
}

// The concept-sheet car: a low wireframe wedge with two tail lights and twin thrusters.
function buildModel(color) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shape = [
    // x, y, z  (z forward)
    [-1.15, 0.25, -1.9], [1.15, 0.25, -1.9], [1.3, 0.25, 0.6], [0.55, 0.25, 2.2], [-0.55, 0.25, 2.2], [-1.3, 0.25, 0.6],
    [-0.8, 0.85, -1.6], [0.8, 0.85, -1.6], [0.7, 0.75, 0.2], [-0.7, 0.75, 0.2],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const E = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [6, 7], [7, 8], [8, 9], [9, 6], [0, 6], [1, 7], [2, 8], [5, 9], [3, 8], [4, 9]];
  const pos = [];
  for (const [a, b] of E) pos.push(shape[a].x, shape[a].y, shape[a].z, shape[b].x, shape[b].y, shape[b].z);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(lg, lineMat);
  body.add(lines);
  // dark solid hull so the car occludes the road
  const tris = [0, 1, 7, 0, 7, 6, 1, 2, 8, 1, 8, 7, 5, 0, 6, 5, 6, 9, 6, 7, 8, 6, 8, 9, 9, 8, 3, 9, 3, 4, 5, 9, 4, 2, 3, 8, 0, 5, 2, 0, 2, 1, 5, 4, 3, 5, 3, 2];
  const hp = [];
  for (const k of tris) hp.push(shape[k].x, shape[k].y, shape[k].z);
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
  const hullMat = new THREE.MeshBasicMaterial({ color: 0x07030e, side: THREE.DoubleSide });
  body.add(new THREE.Mesh(hg, hullMat));
  // accent ribbon along the nose
  const accentMat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ag = new THREE.BufferGeometry();
  ag.setAttribute('position', new THREE.Float32BufferAttribute([-1.3, 0.27, 0.6, 1.3, 0.27, 0.6, 0.55, 0.27, 2.2, -1.3, 0.27, 0.6, 0.55, 0.27, 2.2, -0.55, 0.27, 2.2], 3));
  const accent = new THREE.Mesh(ag, accentMat);
  accent.scale.set(1, 1, 1);
  body.add(accent);
  // tail lights + thrusters
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a4a });
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.06), tailMat);
    t.position.set(s * 0.72, 0.55, -1.93);
    body.add(t);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x8ac8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 8), flameMat);
    f.rotation.x = -Math.PI / 2;
    f.position.set(s * 0.45, 0.4, -2.6);
    body.add(f);
    flames.push(f);
  }
  // underglow
  const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 4.4), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  root.add(glow);
  return { root, body, lineMat, accentMat, flameMat, glowMat, flames, tailMat };
}

export class Racer {
  constructor(car, opts = {}) {
    this.car = car;
    this.name = opts.name || car.name;
    this.phys = physicsFor(car.stats);
    this.color = car.color;
    this.isPlayer = !!opts.isPlayer;
    this.index = opts.index ?? 0;
    this.model = buildModel(car.color);
    this.root = this.model.root;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.gnd = { y: 0, nx: 0, ny: 1, nz: 0, lat: 0, path: null, i: 0, f: 0, rx: 1, rz: 0, mask: 7, onRoad: true };
    this.ctl = { throttle: 0, brake: 0, steer: 0, drift: false, item: false, special: false, jump: false, reset: false };
    this.hints = {};
    this.halfW = 1.2;
    this.halfL = 2.1;
    this.radius = 1.4;
    this.scale = 1;
    this.alive = true;
    this.mode = BOTH;
    this.energy = 1;
    this.shiftT = 0;
    this.speedMul = opts.speedMul ?? 1;
    this.accelMul = 1;
    this.drift = { active: false, dir: 0, charge: 0, level: 0 };
    this.reset(new THREE.Vector3(), 0);
  }

  reset(pos, yaw) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.yawRate = 0;
    this.speed = 0;
    this.grounded = false;
    this.airTime = 0;
    this.boostTime = 0;
    this.boostPower = 1;
    this.spinTime = 0;
    this.spinDir = 1;
    this.invuln = 0;
    this.suspension = 0;
    this.suspVel = 0;
    this.bodyRoll = 0;
    this.slip = 0;
    this.drift.active = false;
    this.drift.level = 0;
    this.drift.charge = 0;
    this.hints = {};
    this.controlLocked = false;
    this.up.set(0, 1, 0);
  }

  forwardVec(out) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  // ------------------------------------------------------------ the lens
  canShift(mode) {
    return mode === BOTH || this.energy >= SHIFT.minToShift;
  }
  // Player input: pressing the lens you're already in goes back to BOTH.
  setMode(mode, session) {
    if (mode === this.mode) mode = BOTH;
    return this.shiftTo(mode, session);
  }
  shiftTo(mode, session) {
    if (mode === this.mode) return false;
    if (!this.canShift(mode)) {
      session?.onShiftDenied?.(this);
      return false;
    }
    const prev = this.mode;
    this.mode = mode;
    this.shiftT = 0.35;
    session?.onShift?.(this, prev, mode);
    return true;
  }
  updateEnergy(dt, session) {
    this.shiftT = Math.max(0, this.shiftT - dt);
    if (this.mode === BOTH) this.energy = Math.min(1, this.energy + SHIFT.recharge * dt);
    else {
      this.energy -= SHIFT.drain * dt;
      if (this.energy <= 0) {
        this.energy = 0;
        const prev = this.mode;
        this.mode = BOTH;
        this.shiftT = 0.35;
        session?.onShift?.(this, prev, BOTH, true);
      }
    }
  }

  giveBoost(time, power) {
    this.boostTime = Math.max(this.boostTime, time);
    this.boostPower = Math.max(this.boostTime > time ? this.boostPower : 1, power);
  }
  spinOut(time = 1, dir = 1) {
    if (this.invuln > 0) return false;
    this.spinTime = time;
    this.spinDir = dir;
    this.drift.active = false;
    this.invuln = time + 0.6;
    return true;
  }

  // ------------------------------------------------------------ physics (from WEDGEWRECK's Vehicle.update)
  update(dt, world, session) {
    const P = this.phys;
    const ctl = this.ctl;
    this.invuln = Math.max(0, this.invuln - dt);
    this.boostTime = Math.max(0, this.boostTime - dt);
    this.spinTime = Math.max(0, this.spinTime - dt);
    this.updateEnergy(dt, session);

    let throttle = this.controlLocked ? 0 : ctl.throttle;
    let brake = this.controlLocked ? 0 : ctl.brake;
    let steer = this.controlLocked ? 0 : ctl.steer;
    if (this.spinTime > 0) {
      steer = 0;
      throttle *= 0.2;
    }

    const g = world.ground(this.pos.x, this.pos.y, this.pos.z, this.hints, this.mode);
    this.copyGround(g);
    const n = _up.set(g.nx, g.ny, g.nz);
    const fwdH = this.forwardVec(_v);
    const fwd = _fwd;
    if (this.grounded) fwd.copy(fwdH).addScaledVector(n, -fwdH.dot(n)).normalize();
    else fwd.copy(fwdH);
    const right = _right.crossVectors(fwd, this.grounded ? n : WORLD_UP).normalize();

    let vF = this.vel.dot(fwd);
    let vR = this.vel.dot(right);
    const vN = this.grounded ? this.vel.dot(n) : 0;

    if (this.grounded) {
      const boosting = this.boostTime > 0;
      const top = P.topSpeed * this.speedMul * (boosting ? this.boostPower : 1);
      if (throttle > 0 && vF < top) {
        const k = 1 - Math.pow(clamp(vF / top, 0, 1), 2);
        vF += P.accel * this.accelMul * throttle * (0.25 + 0.75 * k) * dt * (vF < 0 ? 2.5 : 1);
      }
      if (boosting) vF += (top - vF) * 3 * dt;
      if (brake > 0) {
        if (vF > 0.8) vF -= 42 * brake * dt;
        else vF = Math.max(vF - 18 * brake * dt, -15);
      }
      if (vF > top) vF += (top - vF) * 1.4 * dt;
      vF -= vF * (throttle > 0 ? 0.04 : 0.35) * dt;
      if (throttle === 0 && brake === 0 && Math.abs(vF) < 0.6) vF *= 0.9;

      const d = this.drift;
      if (!d.active && ctl.drift && Math.abs(steer) > 0.3 && vF > 14 && this.spinTime <= 0) {
        d.active = true;
        d.dir = sign(steer);
        d.charge = 0;
        d.level = 0;
        this.suspVel += 2.2;
      }
      if (d.active) {
        const along = steer * d.dir;
        d.charge += dt * (0.75 + 0.55 * Math.max(0, along));
        const lvl = d.charge > 2.7 ? 3 : d.charge > 1.7 ? 2 : d.charge > 0.8 ? 1 : 0;
        if (lvl > d.level) session?.onDriftLevel?.(this, lvl);
        d.level = lvl;
        if (!ctl.drift || vF < 9) {
          if (d.level > 0 && vF >= 9) {
            this.giveBoost([0, 0.65, 1.05, 1.55][d.level], 1.28);
            session?.onMiniTurbo?.(this, d.level);
          }
          d.active = false;
          d.level = 0;
          d.charge = 0;
        }
      }

      const grip = P.grip * (d.active ? 0.3 : 1) * (this.spinTime > 0 ? 0.12 : 1);
      vR *= Math.exp(-grip * dt);
      this.slip = clamp(Math.abs(vR) / 8 + (d.active ? 0.5 : 0), 0, 1);

      const speedK = clamp(Math.abs(vF) / 7, 0, 1);
      const highK = 1 - 0.4 * clamp(Math.abs(vF) / P.topSpeed, 0, 1);
      let target = -steer * P.steer * speedK * highK * (vF < -0.5 ? -1 : 1);
      if (d.active) target = -(d.dir * P.steer * 0.62 + steer * P.steer * 0.42) * speedK;
      if (this.spinTime > 0) target = this.spinDir * 9;
      this.yawRate = damp(this.yawRate, target, this.spinTime > 0 ? 20 : 11, dt);

      this.vel.copy(fwd).multiplyScalar(vF).addScaledVector(right, vR).addScaledVector(n, vN);
      _v2.set(0, -G_SLOPE, 0);
      _v2.addScaledVector(n, -_v2.dot(n));
      this.vel.addScaledVector(_v2, dt);
    } else {
      this.slip = 0;
      this.yawRate = damp(this.yawRate, -steer * 0.9, 3, dt);
      this.vel.y -= G_AIR * dt;
      this.vel.x *= 1 - 0.05 * dt;
      this.vel.z *= 1 - 0.05 * dt;
      if (this.drift.active && this.airTime > 0.6) this.drift.active = false;
    }
    this.yaw += this.yawRate * dt;
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;

    this.pos.addScaledVector(this.vel, dt);

    const g2 = world.ground(this.pos.x, this.pos.y, this.pos.z, this.hints, this.mode);
    this.copyGround(g2);
    if (this.pos.y < world.floorY + 2 || this.airTime > 4) {
      session?.onFell?.(this);
      return;
    }
    if (g2.onRoad) {
      const nn = _up.set(g2.nx, g2.ny, g2.nz);
      const h = this.pos.y - g2.y;
      const vIntoN = this.vel.dot(nn);
      if (h <= 0.02) {
        if (!this.grounded) this.onLand(-vIntoN, session);
        this.pos.y = g2.y;
        if (vIntoN < 0) this.vel.addScaledVector(nn, -vIntoN);
        this.grounded = true;
        this.airTime = 0;
      } else if (this.grounded && h < 0.45 && vIntoN < 1.2) {
        this.pos.y = g2.y;
        if (vIntoN > 0) this.vel.addScaledVector(nn, -vIntoN);
        this.grounded = true;
      } else {
        if (this.grounded) this.airTime = 0;
        this.grounded = false;
        this.airTime += dt;
      }
      const impact = world.collideWalls(this, g2);
      if (impact > 4) session?.onWallHit?.(this, impact);
      if (this.grounded && g2.path) {
        this.lastSafe = { path: g2.path, i: g2.i };
      }
    } else {
      if (this.grounded) this.airTime = 0;
      this.grounded = false;
      this.airTime += dt;
    }
    this.speed = this.vel.dot(this.forwardVec(_v));
  }

  copyGround(g) {
    const o = this.gnd;
    o.y = g.y;
    o.nx = g.nx;
    o.ny = g.ny;
    o.nz = g.nz;
    o.lat = g.lat;
    o.path = g.path;
    o.i = g.i;
    o.f = g.f;
    o.rx = g.rx;
    o.rz = g.rz;
    o.mask = g.mask;
    o.onRoad = g.onRoad;
    if (g.onRoad) {
      this.track = { path: g.path, i: g.i, f: g.f, lat: g.lat };
    }
  }

  onLand(impact, session) {
    this.suspVel -= Math.min(6, impact * 0.35);
    session?.onLand?.(this, impact);
  }

  // ------------------------------------------------------------ visuals
  syncVisual(dt) {
    const root = this.root;
    root.position.copy(this.pos);
    this.suspVel += (-this.suspension * 90 - this.suspVel * 9) * dt;
    this.suspension = clamp(this.suspension + this.suspVel * dt, -0.25, 0.25);
    const target = _v2;
    if (this.grounded) target.set(this.gnd.nx, this.gnd.ny, this.gnd.nz);
    else {
      target.set(0, 1, 0);
      const hs = Math.hypot(this.vel.x, this.vel.z) + 1;
      const pitch = clamp(this.vel.y / hs, -0.5, 0.5) * 0.5;
      _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-pitch);
      target.add(_v).normalize();
    }
    if (dt > 0) this.up.lerp(target, 1 - Math.exp(-(this.grounded ? 14 : 3) * dt)).normalize();
    const fwd = this.forwardVec(_fwd);
    fwd.addScaledVector(this.up, -fwd.dot(this.up)).normalize();
    const left = _left.crossVectors(this.up, fwd).normalize();
    _m.makeBasis(left, this.up, fwd);
    root.quaternion.setFromRotationMatrix(_m);
    const body = this.model.body;
    const rollT = this.grounded ? clamp(-this.yawRate * this.speed * 0.006, -0.14, 0.14) : 0;
    this.bodyRoll = damp(this.bodyRoll, rollT, 8, dt || 0.016);
    // Hover: float above the road with a little bob.
    this.bob = (this.bob || this.index) + dt;
    body.position.y = 0.35 + this.suspension * 0.6 + Math.sin(this.bob * 4) * 0.05;
    body.rotation.set(0, this.drift.active ? this.drift.dir * -0.28 : 0, this.bodyRoll);
    // lens colour: the wedge glows the colour of the world it's in
    const m = this.model;
    const col = this.mode === RED ? COLORS.red : this.mode === BLUE ? COLORS.blue : 0xffffff;
    m.lineMat.color.set(col);
    m.glowMat.color.set(this.mode === BOTH ? this.color : col);
    const flash = this.shiftT > 0 ? 1 + this.shiftT * 4 : 1;
    m.lineMat.color.multiplyScalar(flash);
    const thrust = clamp(Math.abs(this.speed) / this.phys.topSpeed, 0, 1.4) + (this.boostTime > 0 ? 0.8 : 0);
    for (const f of m.flames) {
      f.scale.set(1, 0.3 + thrust * (0.8 + Math.random() * 0.4), 1);
      f.position.z = -2.0 - f.scale.y * 0.8;
    }
    m.flameMat.color.set(this.boostTime > 0 ? 0xff4fd8 : this.drift.level >= 2 ? 0xff8a3a : 0x8ac8ff);
    m.glowMat.opacity = 0.25 + (this.drift.active ? 0.25 : 0);
    // spinning out after a hit
    if (this.invuln > 0) root.visible = Math.floor(this.invuln * 14) % 2 === 0 || this.invuln < 0.2;
    else root.visible = true;
  }
}

export { solidIn };
