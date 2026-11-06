// The feel layer: everything that tells your hands and ears how fast you're going and what's under you, without
// changing the physics. One Feel per race; race.js calls update() once a frame after the cameras move.
//
//   drift stages   a drift charges through three colours, the way a turbo builds: BLUE, then RED, then PRISM
//                  (the two worlds together). Each stage throws sparks off the rear pads in its colour, pings
//                  (engine.js drift1..3), widens the view a touch and gives the pad a tick. Letting go fires the
//                  turbo in that stage's colour.
//   surface rumble the pad reads the road: a faint hum at speed on clean road, a rumble-strip patter riding the
//                  edge, a heavy slosh in water (a light one for the Skimmer, which rides on it), a high buzz up a
//                  wall-run or a pipe wall, a drop-out in the air and a thump on landing.
//   pass-bys       a rival going past close at a real difference in speed whooshes by.
//
// Reads racer state only (drift, boostTime, grounded, gnd), so it never fights race.js's own events.

import * as THREE from '../../vendor/three.js';
import { clamp } from '../core/util.js';
import { RED, BLUE } from '../world/shift.js';

// the drift stages' colours (index = drift level); 3 alternates between its two
export const DRIFT_COLORS = [0xb8c4e8, 0x4ab0ff, 0xff4a6a, 0xff4fd8];
const PRISM_ALT = 0xffffff;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _f = new THREE.Vector3();

export class Feel {
  constructor(race) {
    this.race = race;
    this.st = new Map(); // racer -> { level, active, grounded, airTime, sparkT, edgeT, rumbleT }
    this.t = 0;
    this.passCd = 0;
  }

  stateOf(r) {
    let s = this.st.get(r);
    if (!s) this.st.set(r, (s = { level: 0, active: false, grounded: true, air: 0, sparkT: 0, edge: 0, prevRel: new Map() }));
    return s;
  }

  update(dt) {
    const R = this.race;
    if (!dt || R.app.paused) return;
    this.t += dt;
    this.passCd = Math.max(0, this.passCd - dt);
    for (const r of R.racers) {
      if (r.puppet || r.respawnT > 0 || !r.alive) continue;
      const s = this.stateOf(r);
      const near = R.near(r);
      if (near) this.driftFx(r, s, dt);
      if (r.isPlayer) this.playerFx(r, s, dt);
      s.level = r.drift.active ? r.drift.level : 0;
      s.active = r.drift.active;
      s.grounded = r.grounded;
      s.air = r.grounded ? 0 : r.airTime;
    }
    if (R.state === 'race' && !R.split) this.passBys(R.player, dt);
  }

  // Sparks off the rear pads while drifting, in the stage's colour; a burst and a lunge when the turbo fires.
  driftFx(r, s, dt) {
    const R = this.race;
    const d = r.drift;
    const fwd = _f.set(Math.sin(r.yaw), 0, Math.cos(r.yaw));
    const rx = fwd.z;
    const rz = -fwd.x;
    const rear = (side, out) => out.set(r.pos.x - fwd.x * 1.7 + rx * side * 0.95, r.gnd.y + 0.15, r.pos.z - fwd.z * 1.7 + rz * side * 0.95);
    if (d.active && r.grounded) {
      const lvl = d.level;
      // a little dust at level 0, a real fountain by PRISM
      const rate = [10, 28, 40, 56][lvl];
      s.sparkT += dt * rate;
      while (s.sparkT >= 1) {
        s.sparkT -= 1;
        // the outside pad throws most of it (the drift swings the tail out)
        const side = Math.random() < 0.7 ? d.dir : -d.dir;
        rear(side, _a);
        _b.set(-fwd.x * 0.6 + rx * side * 0.5, 0, -fwd.z * 0.6 + rz * side * 0.5);
        const col = lvl === 3 && Math.random() < 0.4 ? PRISM_ALT : DRIFT_COLORS[lvl];
        R.debris.sparks(_a, _b, 1, col, lvl ? 10 + lvl * 3 : 6, r.gnd.y);
      }
      if (lvl > s.level && s.active) {
        // a new stage: a ring of sparks off both pads
        for (const side of [-1, 1]) R.debris.sparks(rear(side, _a), _b.set(rx * side, 0, rz * side), 6 + lvl * 3, DRIFT_COLORS[lvl], 14, r.gnd.y);
        if (r.isPlayer) this.stageUp(r, lvl);
      }
    } else s.sparkT = 0;
    // the turbo just fired: a jet of the stage's colour out the back
    if (s.active && !d.active && s.level > 0 && r.boostTime > 0) {
      const col = DRIFT_COLORS[s.level];
      for (const side of [-1, 1]) R.debris.sparks(rear(side, _a), _b.set(-fwd.x, 0.1, -fwd.z), 8 + s.level * 6, col, 22, r.gnd.y);
      if (r.isPlayer) {
        const cam = R.camOf(r);
        // the car lunges away from the camera, then it catches up
        cam.kick(_b.set(-fwd.x, 0.05, -fwd.z), 2 + s.level * 1.5);
        R.app.input.rumble(r.pIndex || 0, 0.35 + s.level * 0.15, 0.5, 140 + s.level * 60);
      }
    }
  }

  stageUp(r, lvl) {
    const R = this.race;
    R.app.audio.play('driftStage', lvl);
    R.camOf(r).fovPunch(1 + lvl * 0.8);
    R.app.input.rumble(r.pIndex || 0, 0.1 * lvl, 0.35 + 0.15 * lvl, 70);
  }

  // The pad reads the surface under you, and a landing lands.
  playerFx(r, s, dt) {
    const R = this.race;
    const pad = r.pIndex || 0;
    const input = R.app.input;
    const sp = clamp(Math.abs(r.speed) / (r.phys.topSpeed || 60), 0, 1.4);
    if (r.grounded && !s.grounded && s.air > 0.35) {
      // a landing after real air: the harder the fall the bigger the thump, and the camera dips into it
      const k = clamp((s.air - 0.3) / 1.2, 0, 1);
      input.rumble(pad, 0.35 + 0.6 * k, 0.3 + 0.4 * k, 110 + 160 * k);
      R.camOf(r).kick(_b.set(0, -1, 0), 1.5 + 4 * k);
      if (R.near(r)) R.debris.sparks(_a.set(r.pos.x, r.gnd.y + 0.1, r.pos.z), _b.set(0, 0, 0), Math.round(6 + 14 * k), r.mode === RED ? 0xff4a6a : r.mode === BLUE ? 0x4ab0ff : 0xd8c8ff, 10, r.gnd.y);
      return;
    }
    if (!r.grounded || R.state !== 'race' || r.finished) return;
    const g = r.gnd;
    const P = g.path;
    let strong = 0;
    let weak = sp > 0.45 ? 0.03 + 0.09 * (sp - 0.45) : 0; // clean road: a faint hum that rises with speed
    if (P) {
      if (P.water?.[g.i]) {
        // the Skimmer rides it; everything else bogs down in it
        const blue = r.mode === BLUE;
        const slosh = 0.5 + 0.5 * Math.sin(this.t * (blue ? 9 : 5));
        strong = blue ? 0.05 : 0.22 + 0.15 * slosh;
        weak = blue ? 0.12 + 0.06 * slosh : 0.2;
      } else if (P.cling?.[g.i] || P.warpK?.[g.i] > 0.3) {
        weak = 0.18 + 0.12 * sp; // up a wall: a tight high buzz
      } else {
        // riding the edge: a rumble-strip patter, its beat set by speed (a strip every 3 m)
        const edge = clamp((Math.abs(g.lat) - (P.halfW - 1.4)) / 1.0, 0, 1);
        if (edge > 0 && sp > 0.15) {
          s.edge += (Math.abs(r.speed) * dt) / 3;
          const on = s.edge % 1 < 0.5;
          strong = Math.max(strong, on ? 0.18 + 0.14 * edge : 0.04);
          weak = Math.max(weak, on ? 0.12 : 0.05);
        }
      }
    }
    if (r.drift.active) weak = Math.max(weak, 0.06 + 0.07 * r.drift.level * (0.75 + 0.25 * Math.sin(this.t * 40)));
    if (r.boostTime > 0) strong = Math.max(strong, 0.14);
    if (strong > 0.01 || weak > 0.01) input.rumble(pad, strong, weak, 60);
  }

  // A rival going past within a few metres, at a real difference in speed, whooshes by on the side it passes.
  passBys(p, dt) {
    if (!p || p.respawnT > 0) return;
    const R = this.race;
    const s = this.stateOf(p);
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    for (const r of R.racers) {
      if (r === p || r.respawnT > 0) continue;
      const dx = r.pos.x - p.pos.x;
      const dz = r.pos.z - p.pos.z;
      const dy = r.pos.y - p.pos.y;
      if (dx * dx + dz * dz > 900 || Math.abs(dy) > 4) {
        s.prevRel.delete(r);
        continue;
      }
      const along = dx * fx + dz * fz;
      const side = dx * fz - dz * fx;
      const prev = s.prevRel.get(r);
      s.prevRel.set(r, along);
      if (prev === undefined || Math.sign(prev) === Math.sign(along) || Math.abs(side) > 6) continue;
      const rel = Math.abs((r.vel.x - p.vel.x) * fx + (r.vel.z - p.vel.z) * fz);
      if (rel < 6 || this.passCd > 0) continue;
      this.passCd = 0.25;
      R.app.audio.play('whoosh', { pan: clamp(-side / 5, -1, 1), v: clamp(rel / 30, 0.35, 1) });
    }
  }
}
