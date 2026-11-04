// A shift racer: the driving model is Absurd Combat Racing's truck physics (vehicles/vehicle.js: throttle curve,
// drift with three mini-turbo levels, lateral grip, slope gravity, suspension and ground snap), with the combat
// stripped out and a lens added. Each racer looks through its own lens, so the ground it finds, the rails that hold
// it and the obstacles that hit it all depend on its world.

import * as THREE from '../../vendor/three.js';
import { clamp, damp, sign } from '../core/util.js';
import { BOTH, RED, BLUE, SHIFT, solidIn, COLORS } from '../world/shift.js';
import { buildBody, Trail } from './bodies.js';

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
  // secret drivers from the studio's other games
  { id: 'dash', name: 'DASH', color: 0xf4f0ff, stats: { speed: 4, accel: 5, handling: 5 }, secret: true, from: 'LAST LINE', mass: 0.8 },
  { id: 'greatwedge', name: 'GREAT WEDGE', color: 0xcfd6dd, stats: { speed: 5, accel: 4, handling: 3 }, secret: true, from: 'ABSURD COMBAT RACING', driver: 'Captain Finn Razorback', mass: 1.8 },
];

// Absurd Combat Racing's star-stats-to-physics, nudged faster: these are hover wedges, not trucks.
export function physicsFor(stats) {
  return {
    topSpeed: 44 + stats.speed * 2.4,
    accel: 18 + stats.accel * 3.2,
    steer: 1.6 + stats.handling * 0.16,
    grip: 5.6 + stats.handling * 0.9,
  };
}

// The models live in bodies.js; buildModel keeps the old call shape for ghosts and previews.
export function buildModel(color, bodyId = 'vector', glow) {
  return buildBody(bodyId, color, glow);
}

// Paint, trail and underglow colours (the garage). 'spectrum' cycles through the hues.
export function resolveLivery(car, livery) {
  livery ||= {};
  const paint = livery.paint ?? car.color;
  return { paint, trail: livery.trail ?? (paint === 'spectrum' ? 0xff4fd8 : paint), glow: livery.glow ?? paint };
}
const hexOf = (c) => (c === 'spectrum' ? 0xff4fd8 : c === 'off' ? 0x000000 : c);

export class Racer {
  constructor(car, opts = {}) {
    this.car = car;
    this.name = opts.name || car.name;
    this.phys = physicsFor(car.stats);
    this.color = car.color;
    this.isPlayer = !!opts.isPlayer;
    this.index = opts.index ?? 0;
    this.livery = resolveLivery(car, opts.livery);
    this.model = buildBody(car.body || car.id, hexOf(this.livery.paint), hexOf(this.livery.glow));
    this.root = this.model.root;
    this.mass = car.mass || 1;
    this.trail = new Trail(hexOf(this.livery.trail));
    this.trailOn = this.livery.trail !== 'off';
    if (this.livery.glow === 'off') this.model.glow.visible = false;
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
    if (this.mono) return mode !== BOTH && this.energy >= SHIFT.monoCost;
    return mode === BOTH || this.energy >= SHIFT.minToShift;
  }
  // Player input: pressing the lens you're already in goes back to BOTH. In Mono Run the BOTH button swaps lenses.
  setMode(mode, session) {
    if (this.mono) {
      if (mode === BOTH) mode = this.mode === RED ? BLUE : RED;
      if (mode === this.mode) return false;
    } else if (mode === this.mode) mode = BOTH;
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
    if (this.mono) this.energy -= SHIFT.monoCost;
    session?.onShift?.(this, prev, mode);
    return true;
  }
  updateEnergy(dt, session) {
    this.shiftT = Math.max(0, this.shiftT - dt);
    if (this.mono) return;
    // A road that only exists in your lens holds the lens for you: SHIFT doesn't drain on it (or in a short hop
    // off it), so a secret route is a reward to find, not a bar to ration.
    if (this.gnd.onRoad && !solidIn(this.gnd.mask, BOTH)) this.lensRoadT = 0.6;
    else this.lensRoadT = Math.max(0, (this.lensRoadT || 0) - dt);
    if (this.mode === BOTH) this.energy = Math.min(1, this.energy + SHIFT.recharge * dt);
    else if (this.lensRoadT > 0 && solidIn(this.gnd.mask, this.mode)) {
      // held by the road
    } else {
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

  // ------------------------------------------------------------ physics (from Absurd Combat Racing's Vehicle.update)
  update(dt, world, session) {
    const P = this.phys;
    const ctl = this.ctl;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitCd = Math.max(0, (this.hitCd || 0) - dt);
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
    const flash = this.shiftT > 0 ? 1 + this.shiftT * 4 : 1;
    m.lineMat.color.multiplyScalar(flash);
    // the hull reflects the worlds you can see: red left and blue right in both, one colour through a single lens
    if (m.hullMat.uniforms) {
      const U = m.hullMat.uniforms;
      U.uL.value.set(this.mode === BLUE ? COLORS.blue : COLORS.red);
      U.uR.value.set(this.mode === RED ? COLORS.red : COLORS.blue);
      U.uFlash.value = Math.max(0, this.shiftT || 0) * 2;
      if (this.livery?.paint === 'spectrum') U.uPaint.value.copy(m.accentMat.color);
    }
    const thrust = clamp(Math.abs(this.speed) / this.phys.topSpeed, 0, 1.4) + (this.boostTime > 0 ? 0.8 : 0);
    for (const f of m.flames) {
      f.scale.set(1, 0.3 + thrust * (0.8 + Math.random() * 0.4), 1);
      f.position.z = f.userData.z0 - f.scale.y * 0.8;
    }
    this.animT = (this.animT || 0) + dt;
    for (const fn of m.anim) fn(dt, this.animT, this);
    const L = this.livery;
    if (L.paint === 'spectrum') {
      m.accentMat.color.setHSL((this.animT * 0.15) % 1, 1, 0.6);
      m.accentLineMat.color.copy(m.accentMat.color);
      if (L.glow === 'spectrum') m.glowMat.color.copy(m.accentMat.color);
    }
    const base = L.trail === 'spectrum' || (L.trail === undefined && L.paint === 'spectrum') ? m.accentMat.color.getHex() : hexOf(L.trail);
    m.flameMat.color.set(this.boostTime > 0 ? 0xff4fd8 : this.drift.level >= 2 ? 0xff8a3a : 0x8ac8ff); // blue-white exhaust; the trail carries the livery
    if (this.trailOn) {
      this.trail.setColor(this.boostTime > 0 ? 0xff4fd8 : base);
      const yaw = this.yaw;
      _v.set(this.pos.x - Math.sin(yaw) * 2.1, this.pos.y + 0.45, this.pos.z - Math.cos(yaw) * 2.1);
      this.trail.update(dt, _v, -Math.cos(yaw), Math.sin(yaw), clamp(Math.abs(this.speed) / this.phys.topSpeed, 0, 1) + (this.boostTime > 0 ? 0.4 : 0), this.grounded || this.airTime < 0.5);
    }
    m.glowMat.opacity = 0.34 + (this.drift.active ? 0.2 : 0);
    // spinning out after a hit
    if (this.invuln > 0) root.visible = Math.floor(this.invuln * 14) % 2 === 0 || this.invuln < 0.2;
    else root.visible = true;
  }
}

export { solidIn };
