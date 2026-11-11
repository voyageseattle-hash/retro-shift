// A shift racer: the driving model is Absurd Combat Racing's truck physics (vehicles/vehicle.js: throttle curve,
// drift with three mini-turbo levels, lateral grip, slope gravity, suspension and ground snap), with the combat
// stripped out and a lens added. Each racer looks through its own lens, so the ground it finds, the rails that hold
// it and the obstacles that hit it all depend on its world.

import * as THREE from '../../vendor/three.js';
import { clamp, damp, sign } from '../core/util.js';
import { BOTH, RED, BLUE, SHIFT, LENS, solidIn, COLORS } from '../world/shift.js';
import { buildBody, Trail } from './bodies.js';
import { FORMS, SKIM, addForms, updateForms } from './forms.js';
import { bendRacer, lensHeld, PIPE, SCREW } from '../world/warp.js';
import { curveRacer, curvePoint, curveDir } from '../world/curved.js';
import { DRIFT_COLORS } from '../game/feel.js';
import { ACCESS } from '../core/access.js';

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
    topSpeed: 58 + stats.speed * 3,
    accel: 24 + stats.accel * 4.2,
    steer: 1.6 + stats.handling * 0.16,
    grip: 6.6 + stats.handling * 1,
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
    addForms(this.model, car.body || car.id, hexOf(this.livery.paint));
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
    this.hp = 100; // the hull (race.js HULL)
    this.hurtCd = 0;
    // charges (game/items.js): a held one survives a respawn, the effects don't
    this.cellT = this.empT = this.flipT = 0;
    this.hoverT = this.hopT = this.lanceT = this.braceT = 0;
    if (this.beamT > 0) this.setBeam(false);
    this.beamT = 0;
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
    // flipped or stalled by a rival's charge: the lens is held for you
    // (and up a pipe wall or through a corkscrew the Blade can't let go)
    if (!this.canShift(mode) || this.flipT > 0 || this.empT > 0 || lensHeld(this)) {
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
  // A rival's charge moves your lens for you (FLIP, EMP): no SHIFT check, no cost.
  forceMode(mode, session) {
    if (mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;
    this.shiftT = 0.35;
    session?.onShift?.(this, prev, mode, true);
  }
  // LIGHTSPEED: the craft stretches into a streak of light
  setBeam(on) {
    const b = this.model.body;
    if (on) b.scale.set(0.55, 0.45, 2.6);
    else b.scale.set(1, 1, 1);
  }
  updateEnergy(dt, session) {
    this.shiftT = Math.max(0, this.shiftT - dt);
    if (this.mono) return;
    // A road that only exists in your lens holds the lens for you: SHIFT doesn't drain on it (or in a short hop
    // off it), so a secret route is a reward to find, not a bar to ration.
    // (a wall-run holds RED the same way: only the Blade can ride it)
    const held = this.gnd.onRoad && (!solidIn(this.gnd.mask, BOTH) || (this.gnd.path?.cling?.[this.gnd.i] && this.mode === RED));
    if (held) this.lensRoadT = 0.6;
    else this.lensRoadT = Math.max(0, (this.lensRoadT || 0) - dt);
    if (this.mode === BOTH) this.energy = Math.min(1, this.energy + SHIFT.recharge * dt);
    else if (this.cellT > 0 || this.flipT > 0) {
      // a LENS CELL pays for the lens; a FLIP holds you in one for free
    } else if (this.lensRoadT > 0 && solidIn(this.gnd.mask, this.mode)) {
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

    let throttle = this.controlLocked || this.empT > 0 ? 0 : ctl.throttle;
    let brake = this.controlLocked ? 0 : ctl.brake;
    let steer = this.controlLocked ? 0 : ctl.steer;
    if (this.spinTime > 0) {
      steer = 0;
      throttle *= 0.2;
    }

    const g = world.ground(this.pos.x, this.pos.y, this.pos.z, this.hints, this.mode);
    this.copyGround(g);
    // the lens's form: its width (walls, rails, slits), how it holds the road, gliding, water
    const F = FORMS[this.mode] || FORMS[BOTH];
    this.halfW = F.halfW;
    this.hints._w = Math.max(0, F.halfW - 1.2);
    // a wall-run only holds a craft that clings (track.js ground skips it for the others)
    this.hints._cling = F.cling > 0 ? 1 : 0;
    const n = _up.set(g.nx, g.ny, g.nz);
    const fwdH = this.forwardVec(_v);
    const fwd = _fwd;
    if (this.grounded) fwd.copy(fwdH).addScaledVector(n, -fwdH.dot(n)).normalize();
    else fwd.copy(fwdH);
    const right = _right.crossVectors(fwd, this.grounded ? n : WORLD_UP).normalize();

    let vF = this.vel.dot(fwd);
    let vR = this.vel.dot(right);
    const vN = this.grounded ? this.vel.dot(n) : 0;

    this.gliding = false;
    if (this.grounded) {
      const boosting = this.boostTime > 0;
      const lens = LENS[this.mode] || LENS[BOTH];
      const top = P.topSpeed * this.speedMul * lens.top * (boosting ? this.boostPower : 1) * (this.cellT > 0 && this.mode !== BOTH ? 1.06 : 1);
      if (throttle > 0 && vF < top) {
        const k = 1 - Math.pow(clamp(vF / top, 0, 1), 2);
        vF += P.accel * this.accelMul * lens.accel * throttle * (0.25 + 0.75 * k) * dt * (vF < 0 ? 2.5 : 1);
      }
      if (boosting) vF += (top - vF) * 3 * dt;
      if (brake > 0) {
        if (vF > 0.8) vF -= 42 * brake * dt;
        else vF = Math.max(vF - 18 * brake * dt, -15);
      }
      if (vF > top) vF += (top - vF) * 1.4 * dt;
      vF -= vF * (throttle > 0 ? 0.04 : 0.35) * dt;
      if (throttle === 0 && brake === 0 && Math.abs(vF) < 0.6) vF *= 0.9;
      // water: wheels and hover pads bog down in it; the Skimmer rides on top
      if (g.path?.water?.[g.i]) vF -= vF * F.water * dt;

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
        d.charge += dt * (0.75 + 0.55 * Math.max(0, along)) * lens.drift;
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

      const grip = P.grip * lens.grip * (d.active ? 0.3 : 1) * (this.spinTime > 0 ? 0.12 : 1);
      vR *= Math.exp(-grip * dt);
      this.slip = clamp(Math.abs(vR) / 8 + (d.active ? 0.5 : 0), 0, 1);

      // hover pads can pivot a craft that's on the gas with no speed (nose into a rail), so it never sits stuck there
      const speedK = Math.max(clamp(Math.abs(vF) / 7, 0, 1), throttle > 0 ? 0.45 : 0);
      const highK = 1 - 0.4 * clamp(Math.abs(vF) / P.topSpeed, 0, 1);
      let target = -steer * P.steer * speedK * highK * (vF < -0.5 ? -1 : 1);
      if (d.active) target = -(d.dir * P.steer * 0.62 + steer * P.steer * 0.42) * speedK;
      if (this.spinTime > 0) target = this.spinDir * 9;
      this.yawRate = damp(this.yawRate, target, this.spinTime > 0 ? 20 : 11, dt);

      this.vel.copy(fwd).multiplyScalar(vF).addScaledVector(right, vR).addScaledVector(n, vN);
      _v2.set(0, -G_SLOPE, 0);
      _v2.addScaledVector(n, -_v2.dot(n));
      this.vel.addScaledVector(_v2, dt);
      this.bentGravity(g, dt);
    } else {
      this.slip = 0;
      // the Skimmer glides: once it has really left the road at speed its pads carry it, sinking no faster than a
      // few metres a second for a second and a half, and it steers in the air. Enough to cross a glide gap the
      // others drop into, and to float the far side of a drop while the Blade clings down it.
      // (only over a real drop: skimming a downhill road with the road just underneath is driving, not gliding)
      // the Skimmer's LIFT (SKIM in forms.js): a HOVER holds it over the road, a JUMP is a short heavy hop
      const hovering = this.hoverT > 0 && this.mode === BLUE && !this.controlLocked;
      const hopping = this.hopT > 0;
      if (this.hoverT > 0) this.hoverT -= dt;
      if (this.hopT > 0) this.hopT -= dt;
      const high = !this.gnd.onRoad || this.pos.y - this.gnd.y > 2;
      const gliding = !hovering && !hopping && F.glide && high && this.airTime > 0.08 && this.airTime < 1.6 && this.speed > 25 && !this.controlLocked;
      // (race.js counts a long glide as a lens move for the SHIFT CHAIN)
      this.gliding = gliding;
      this.yawRate = damp(this.yawRate, -steer * (gliding || hovering ? 1.6 : 0.9), 3, dt);
      if (hovering) {
        // ride a cushion SKIM.hoverH over the road; over a hole, hold the height of the road it left
        if (this.gnd.onRoad) this.hoverBase = this.gnd.y;
        const base = this.hoverBase ?? this.pos.y - SKIM.hoverH;
        const want = clamp((base + SKIM.hoverH - this.pos.y) * 5, -5, 9);
        this.vel.y = damp(this.vel.y, want, 8, dt);
      } else if (gliding) {
        this.vel.y -= G_AIR * (this.vel.y > 0 ? 0.55 : 0.22) * dt;
        this.vel.y = Math.max(this.vel.y, -3.5);
      } else this.vel.y -= G_AIR * (hopping ? SKIM.hopG : 1) * dt;
      if (gliding || hovering) {
        // turn the travel with the nose, so steering in the air bends the glide
        let hs = Math.hypot(this.vel.x, this.vel.z);
        // the hover's fans keep pushing on the gas, so a hover from a crawl doesn't just hang there
        if (hovering && throttle > 0) hs = Math.min(hs + P.accel * 0.35 * throttle * dt, Math.max(hs, P.topSpeed * this.speedMul * (LENS[BLUE]?.top ?? 1)));
        this.vel.x = Math.sin(this.yaw) * hs;
        this.vel.z = Math.cos(this.yaw) * hs;
      } else {
        this.vel.x *= 1 - 0.05 * dt;
        this.vel.z *= 1 - 0.05 * dt;
      }
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
      // hover pads hold the road harder the faster you go, so a crest at full speed doesn't throw you off it
      const stick = Math.max(0, this.vel.length() - 45);
      if (h <= 0.02) {
        if (!this.grounded) {
          this.onLand(-vIntoN, session);
          this.hoverT = this.hopT = 0;
        }
        this.pos.y = g2.y;
        if (vIntoN < 0) this.vel.addScaledVector(nn, -vIntoN);
        this.grounded = true;
        this.airTime = 0;
      } else if (this.grounded && h < 0.45 + stick * 0.008 + F.cling && (F.cling > 0 || vIntoN < 1.2 + stick * 0.05)) {
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
      if (g2.path.warpK?.[g2.i] > 0 && this.bentRoad(g2, session)) return;
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

  // A pipe wall pulls you back down it (round the tube that's the strip's middle) unless you're going fast enough
  // to stick: the Blade sticks at racing speed, everyone else only goes a little way up. (The flat physics knows no
  // up but the world's, so the bend's gravity is put back here.)
  bentGravity(g, dt) {
    const P = g.path;
    if (!P?.warpK || !(P.warpK[g.i] > 0) || P.warpKind[g.i] !== PIPE) return;
    const k = P.warpK[g.i];
    const Re = P.warpR[g.i] / k;
    const th = g.lat / Re;
    const v2 = this.vel.lengthSq();
    // (toward the mouths the tube opens out and the grip goes with it, so the Blade slides back down to the road)
    const stick = FORMS[this.mode]?.cling ? clamp(v2 / (Re * G_AIR * 1.4), 0, 0.92) * k * k * k : 0;
    const pull = G_AIR * Math.sin(th) * (1 - stick);
    this.vel.x -= g.rx * pull * dt;
    this.vel.z -= g.rz * pull * dt;
  }

  // Round the top of a pipe and out the other side; off a corkscrew too slow to stay on it upside down.
  bentRoad(g, session) {
    const P = g.path;
    if (P.warpKind[g.i] === PIPE) {
      const e = P.ext[g.i];
      if (P.warpK[g.i] > 0.97 && Math.abs(g.lat) > e) {
        const s = Math.sign(g.lat);
        this.pos.x -= g.rx * s * 2 * e;
        this.pos.z -= g.rz * s * 2 * e;
        this.hints[P.id] = g.i;
      }
      // the Blade upside down and crawling: it drops off the ceiling (back down onto the floor)
      const th = (g.lat * P.warpK[g.i]) / P.warpR[g.i];
      if (Math.cos(th) < -0.2 && Math.abs(this.speed) < 13 && this.grounded) {
        const s = Math.sign(g.lat);
        const back = g.lat - s * (P.halfW * 0.4);
        this.pos.x -= g.rx * back;
        this.pos.z -= g.rz * back;
        this.vel.multiplyScalar(0.5);
        session?.onPeel?.(this);
      }
      return false;
    }
    if (P.warpKind[g.i] === SCREW && P.cling?.[g.i] && this.grounded) {
      const a = P.roll[g.i];
      if (Math.cos(a) < -0.3 && Math.abs(this.speed) < 18) {
        session?.onFell?.(this);
        return true;
      }
    }
    return false;
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
    // on a bent road (warp.js) the craft is drawn where the bend puts it, standing on the bent surface
    const V = (this.vis ||= { on: false, pos: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3() });
    V.on = bendRacer(this, V);
    root.position.copy(V.on ? V.pos : this.pos);
    this.suspVel += (-this.suspension * 90 - this.suspVel * 9) * dt;
    this.suspension = clamp(this.suspension + this.suspVel * dt, -0.25, 0.25);
    const target = _v2;
    if (V.on) target.copy(V.up);
    else if (this.grounded) target.set(this.gnd.nx, this.gnd.ny, this.gnd.nz);
    else {
      target.set(0, 1, 0);
      const hs = Math.hypot(this.vel.x, this.vel.z) + 1;
      const pitch = clamp(this.vel.y / hs, -0.5, 0.5) * 0.5;
      _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-pitch);
      target.add(_v).normalize();
    }
    if (dt > 0) this.up.lerp(target, 1 - Math.exp(-(V.on ? 30 : this.grounded ? 14 : 3) * dt)).normalize();
    // (half way round a pipe a lerp can pass through zero: snap)
    if (V.on && this.up.dot(V.up) < 0.2) this.up.copy(V.up);
    const fwd = V.on ? _fwd.copy(V.fwd) : this.forwardVec(_fwd);
    fwd.addScaledVector(this.up, -fwd.dot(this.up)).normalize();
    const left = _left.crossVectors(this.up, fwd).normalize();
    _m.makeBasis(left, this.up, fwd);
    root.quaternion.setFromRotationMatrix(_m);
    // a curved course (curved.js): the same pose, carried from the flat world into the drawn one
    const curved = this.session?.world?.curved ? this.session.world : null;
    if (curved) curveRacer(this, curved);
    const body = this.model.body;
    const rollT = this.grounded ? clamp(-this.yawRate * this.speed * 0.006, -0.14, 0.14) : 0;
    this.bodyRoll = damp(this.bodyRoll, rollT, 8, dt || 0.016);
    // Hover: float above the road with a little bob.
    this.bob = (this.bob || this.index) + dt;
    body.position.y = 0.35 + this.suspension * 0.6 + Math.sin(this.bob * 4) * 0.05;
    body.rotation.set(0, this.drift.active ? this.drift.dir * -0.28 : 0, this.bodyRoll);
    updateForms(this.model, this.mode, dt, this.speed, this.bob, body);
    // lens colour: the wedge glows the colour of the world it's in
    const m = this.model;
    const col = this.mode === RED ? COLORS.red : this.mode === BLUE ? COLORS.blue : 0xffffff;
    m.lineMat.color.set(col);
    const flash = this.shiftT > 0 ? 1 + this.shiftT * (ACCESS.calm ? 0.6 : 4) : 1;
    m.lineMat.color.multiplyScalar(flash);
    // the hull reflects the worlds you can see: red left and blue right in both, one colour through a single lens
    if (m.hullMat.uniforms) {
      const U = m.hullMat.uniforms;
      U.uL.value.set(this.mode === BLUE ? COLORS.blue : COLORS.red);
      U.uR.value.set(this.mode === RED ? COLORS.red : COLORS.blue);
      U.uFlash.value = Math.max(0, this.shiftT || 0) * (ACCESS.calm ? 0.3 : 2);
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
    // blue-white exhaust (the trail carries the livery); a drift's stage colours it BLUE, RED, then flickering PRISM,
    // and a turbo burns in the colour of the stage that fired it
    const dl = this.drift.active ? this.drift.level : 0;
    if (dl) this.turboCol = DRIFT_COLORS[dl];
    else if (this.boostTime <= 0) this.turboCol = 0;
    const fc = dl === 3 && Math.floor(this.animT * 30) % 3 === 0 ? 0xffffff : dl ? DRIFT_COLORS[dl] : this.boostTime > 0 ? this.turboCol || 0xff4fd8 : 0x8ac8ff;
    m.flameMat.color.set(fc);
    if (this.trailOn) {
      this.trail.setColor(this.boostTime > 0 ? this.turboCol || 0xff4fd8 : base);
      const yaw = this.yaw;
      if (V.on) _v.copy(V.pos).addScaledVector(V.fwd, -2.1).addScaledVector(V.up, 0.45);
      else _v.set(this.pos.x - Math.sin(yaw) * 2.1, this.pos.y + 0.45, this.pos.z - Math.cos(yaw) * 2.1);
      if (curved) {
        curvePoint(this, _v);
        curveDir(this, _left.set(-Math.cos(yaw), 0, Math.sin(yaw)));
        this.trail.update(dt, _v, _left.x, _left.z, clamp(Math.abs(this.speed) / this.phys.topSpeed, 0, 1) + (this.boostTime > 0 ? 0.4 : 0), this.grounded || this.airTime < 0.5, _left.y);
      } else this.trail.update(dt, _v, -Math.cos(yaw), Math.sin(yaw), clamp(Math.abs(this.speed) / this.phys.topSpeed, 0, 1) + (this.boostTime > 0 ? 0.4 : 0), this.grounded || this.airTime < 0.5);
    }
    m.glowMat.opacity = 0.34 + (this.drift.active ? 0.12 + 0.08 * this.drift.level : 0);
    // spinning out after a hit
    if (this.invuln > 0 && this.drawIn === undefined) root.visible = Math.floor(this.invuln * 14) % 2 === 0 || this.invuln < 0.2;
    else root.visible = true;
  }
}

export { solidIn };
