// SEAM CHARGES: the race's items. Prisms hang over the road in gates of four; drive through one and a charge rolls
// into your slot, and the fire button (○ / B, X on the keyboard) lets it go. They're built from the shift: they
// bend the worlds, the lenses and the light, not shells and bananas.
//
//   LENS CELL   six seconds of free lens: RED or BLUE costs no SHIFT, and the lens is a notch stronger
//   EMP         a ring of static: every car near you loses power and drops to BOTH for a moment
//   FLIP        everyone else is thrown into the opposite world and held there (their walls are yours to dodge)
//   LIGHTSPEED  you become a beam of light: far faster, through everything, and the light wall you leave burns
//   SEAM WALL   drop a block behind you that's solid in your lens's world (and gone in the other)
//   PATCH       half your hull back
//
// Which charge you roll depends on your place: the leader rolls the defensive ones, the back of the field the big
// ones. Rivals use theirs with a few simple rules. (Not in time trials, Mono Run or online.)

import * as THREE from '../../vendor/three.js';
import { BOTH, RED, BLUE, M, solidIn } from '../world/shift.js';
import { FORMS } from '../vehicles/forms.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();

export const ITEMS = {
  cell: { name: 'LENS CELL', color: '#ffffff', tip: 'FREE LENS · 6s' },
  emp: { name: 'EMP', color: '#6ae0ff', tip: 'STALLS CARS NEAR YOU' },
  flip: { name: 'FLIP', color: '#ff4fd8', tip: 'EVERYONE ELSE TO THE OTHER WORLD' },
  beam: { name: 'LIGHTSPEED', color: '#fff6a8', tip: 'BECOME LIGHT' },
  wall: { name: 'SEAM WALL', color: '#ff8a3a', tip: 'DROPS BEHIND YOU' },
  patch: { name: 'PATCH', color: '#7aff9a', tip: '+50 HULL' },
};
const IDS = Object.keys(ITEMS);
// odds by place, front (0) to back (1)
const ODDS = {
  cell: [3, 3],
  emp: [1, 3],
  flip: [0.5, 2.5],
  beam: [0.2, 3],
  wall: [3, 0.5],
  patch: [2.5, 1.5],
};
const ROLL = 1.1; // seconds the slot spins
const EMP_R = 42;
const FLIP_T = 3.5;
const BEAM_T = 2.6;

export class Items {
  constructor(race) {
    this.race = race;
    this.on = !race.solo && !race.online;
    this.group = new THREE.Group();
    this.gates = [];
    this.fx = [];
    this.walls = [];
    this.beams = [];
    if (!this.on) return;
    this.buildGates();
  }

  // Three or four gates of prisms on the main road, spread around the lap, clear of walls, fields and lens gaps.
  buildGates() {
    const w = this.race.world;
    const m = w.main;
    const near = (u, list, d) => list.some((x) => Math.abs(((x - u + 1.5) % 1) - 0.5) < d);
    const obs = w.obstacles.filter((o) => o.path === m).map((o) => o.i / m.N);
    const shards = w.shards.filter((s) => s.path === m).map((s) => s.i / m.N);
    const want = m.length > 2200 ? 4 : 3;
    const us = [];
    for (let k = 0; k < 40 && us.length < want; k++) {
      const u = (0.14 + (us.length + (k % 7) * 0.13) / want) % 1;
      if (near(u, obs, 0.03) || near(u, shards, 0.02) || near(u, us, 0.6 / want)) continue;
      if ([-0.01, 0, 0.01].some((d) => m.mask[m.index((u + d + 1) % 1)] !== M.ALL)) continue;
      us.push(u);
    }
    const geo = new THREE.OctahedronGeometry(1.1, 0);
    const edges = new THREE.EdgesGeometry(geo);
    for (const u of us) {
      const i = m.index(u);
      for (const f of [-0.6, -0.2, 0.2, 0.6]) {
        const lat = f * m.halfW;
        const root = new THREE.Group();
        // half red, half blue: the seam in a crystal
        const red = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff2a4a, transparent: true, opacity: 0.95 }));
        const blue = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x1e8cff, transparent: true, opacity: 0.95 }));
        blue.scale.setScalar(0.72);
        blue.rotation.y = Math.PI / 4;
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshBasicMaterial({ color: 0xf4ecff }));
        root.add(red, blue, core);
        m.point(i, lat, 1.6, root.position);
        this.group.add(root);
        this.gates.push({ root, red, blue, i, lat, path: m, y0: root.position.y, taken: 0 });
      }
    }
  }

  roll(r) {
    const R = this.race;
    const n = R.racers.length;
    const back = n > 1 ? (R.placeOf(r) - 1) / (n - 1) : 0.5;
    let total = 0;
    const ws = IDS.map((id) => {
      const [a, b] = ODDS[id];
      let wgt = a + (b - a) * back;
      if (id === 'patch' && r.hp > 80) wgt *= 0.25;
      total += wgt;
      return wgt;
    });
    let x = Math.random() * total;
    for (let k = 0; k < IDS.length; k++) if ((x -= ws[k]) <= 0) return IDS[k];
    return 'cell';
  }

  update(dt) {
    if (!this.on) return;
    const R = this.race;
    const t = R.t;
    for (const g of this.gates) {
      g.root.rotation.y = t * 1.7 + g.lat;
      g.blue.rotation.x = t * 2.3;
      g.root.position.y = g.y0 + Math.sin(t * 2.6 + g.lat) * 0.3;
      if (g.taken > 0) {
        g.taken -= dt;
        g.root.visible = g.taken <= 0;
        if (g.root.visible) g.root.scale.setScalar(0.2);
      } else if (g.root.scale.x < 1) g.root.scale.setScalar(Math.min(1, g.root.scale.x + dt * 3));
    }
    for (const r of R.racers) {
      if (r.puppet || r.respawnT > 0) continue;
      this.racerTimers(r, dt);
      if (R.state !== 'race' || r.finished) continue;
      // pick up
      if (!r.item && !(r.rollT > 0)) {
        for (const g of this.gates) {
          if (g.taken > 0 || g.root.position.distanceToSquared(r.pos) > 4.2 * 4.2) continue;
          g.taken = 3;
          g.root.visible = false;
          r.rollT = ROLL;
          r.rolled = this.roll(r);
          if (r.isPlayer) {
            R.app.audio.play('shard');
            R.emitP(r, 'item', { roll: true });
          }
          if (R.near(r)) R.debris.sparks(g.root.position, _v.set(0, 0.3, 0), 14, 0xf4ecff, 10, r.gnd.y);
          break;
        }
      }
      if (r.rollT > 0) {
        r.rollT -= dt;
        if (r.rollT <= 0) {
          r.item = r.rolled;
          r.itemHeld = 0;
          if (r.isPlayer) R.emitP(r, 'item', { id: r.item });
        }
      }
      if (r.item) {
        r.itemHeld += dt;
        if (r.ai && this.aiWants(r)) this.use(r);
      }
    }
    this.updateFx(dt);
  }

  // per-racer effects ticking down
  racerTimers(r, dt) {
    if (r.cellT > 0) r.cellT -= dt;
    if (r.empT > 0) {
      r.empT -= dt;
      r.ctl.throttle = 0;
      r.ctl.drift = false;
      if (r.mode !== BOTH && !r.mono && this.roadAhead(r, BOTH)) r.forceMode(BOTH, this.race);
      if (Math.random() < 0.3 && this.race.near(r)) this.race.debris.sparks(r.pos, _v.set(0, 1, 0), 2, 0x6ae0ff, 6, r.gnd.y);
    }
    if (r.flipT > 0) {
      r.flipT -= dt;
      // a FLIP never drops you out of the world: where the road ahead isn't there in that lens, it lets go
      if (!this.roadAhead(r, r.flipMode)) r.flipT = 0;
      if (r.mode !== r.flipMode) r.forceMode(r.flipMode, this.race);
      r.energy = Math.max(r.energy, 0.2);
      if (r.flipT <= 0 && r.isPlayer) this.race.emitP(r, 'popup', { text: 'FREE', color: '#ffffff', small: true });
    }
    if (r.beamT > 0) {
      r.beamT -= dt;
      r.giveBoost(0.25, 1.75);
      // the road carries you: steer gently down its middle
      const tr = r.track;
      if (tr) {
        const P = tr.path;
        const j = P.wrap(tr.i + 6);
        const want = Math.atan2(P.thx[j], P.thz[j]) - (tr.lat / P.halfW) * 0.35;
        let d = want - r.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        r.yaw += d * Math.min(1, dt * 8);
        r.yawRate *= 0.8;
      }
      // the light wall: a ribbon of points left behind, each burning for a couple of seconds
      r.beamTrail.push({ x: r.pos.x, y: r.pos.y, z: r.pos.z, t: 2.2 });
      if (r.beamT <= 0) {
        r.beamT = 0;
        r.setBeam?.(false);
      }
    }
    if (r.beamTrail?.length) {
      for (const p of r.beamTrail) p.t -= dt;
      while (r.beamTrail.length && r.beamTrail[0].t <= 0) r.beamTrail.shift();
      this.burn(r);
    }
  }

  // Is there road in this lens under the racer and for the next second or so of driving?
  roadAhead(r, mode) {
    const tr = r.track;
    if (!tr || !r.grounded) return true;
    const P = tr.path;
    const n = Math.ceil((Math.max(10, r.speed) * 1.1) / P.ds);
    for (let k = 0; k <= n; k++) {
      const j = P.closed ? P.wrap(tr.i + k) : Math.min(P.N - 1, tr.i + k);
      if (!solidIn(P.mask[j], mode)) return false;
      // (a wall run holds only the form that clings: a FLIP or an EMP there would drop you off the wall)
      if (P.cling?.[j] && !FORMS[mode].cling) return false;
    }
    return true;
  }

  // Anyone else crossing a light wall is burned and thrown.
  burn(owner) {
    const R = this.race;
    const T = owner.beamTrail;
    for (const r of R.racers) {
      if (r === owner || r.respawnT > 0 || r.beamT > 0 || (r.burnCd || 0) > R.t) continue;
      for (let k = 0; k < T.length - 4; k += 2) {
        const p = T[k];
        if ((r.pos.x - p.x) ** 2 + (r.pos.z - p.z) ** 2 < 1.6 * 1.6 && Math.abs(r.pos.y - p.y) < 2) {
          r.burnCd = R.t + 1;
          if (!R.hurt(r, 26, owner, 'LIGHT WALL') && r.spinOut(0.8, Math.random() < 0.5 ? -1 : 1)) r.vel.multiplyScalar(0.6);
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ using one
  use(r) {
    const R = this.race;
    const id = r.item;
    if (!id) return;
    r.item = null;
    const name = ITEMS[id].name;
    if (r.isPlayer) R.emitP(r, 'item', { id: null, used: id });
    switch (id) {
      case 'cell': {
        r.cellT = 6;
        r.energy = Math.max(r.energy, 0.5);
        if (r.mode === BOTH) r.shiftTo(r.ai?.lensPref?.() || RED, R);
        if (r.isPlayer) R.emitP(r, 'popup', { text: 'LENS CELL · FREE LENS', color: '#ffffff' });
        break;
      }
      case 'emp': {
        this.ring(r.pos, 0x6ae0ff, EMP_R);
        let hit = 0;
        for (const o of R.racers) {
          if (o === r || o.respawnT > 0 || o.beamT > 0 || o.finished) continue;
          if (o.pos.distanceToSquared(r.pos) > EMP_R * EMP_R) continue;
          o.empT = 1.5;
          hit++;
          if (o.isPlayer) R.emitP(o, 'popup', { text: 'EMP · NO POWER', color: '#6ae0ff' });
        }
        if (r.isPlayer) R.emitP(r, 'popup', { text: hit ? `EMP · ${hit} STALLED` : 'EMP', color: '#6ae0ff' });
        if (R.players.some((p) => p.pos.distanceToSquared(r.pos) < 120 * 120)) R.app.audio.play('wall');
        break;
      }
      case 'flip': {
        // everyone else into the world opposite yours (from BOTH: the one fewer of them are in)
        let to = r.mode === RED ? BLUE : r.mode === BLUE ? RED : null;
        if (!to) {
          const reds = R.racers.filter((o) => o.mode === RED).length;
          const blues = R.racers.filter((o) => o.mode === BLUE).length;
          to = reds > blues ? BLUE : blues > reds ? RED : Math.random() < 0.5 ? RED : BLUE;
        }
        for (const o of R.racers) {
          if (o === r || o.respawnT > 0 || o.beamT > 0 || o.finished || o.mono || !this.roadAhead(o, to)) continue;
          o.flipT = FLIP_T;
          o.flipMode = to;
          o.forceMode(to, R);
          if (o.isPlayer) R.emitP(o, 'popup', { text: `FLIPPED · LOCKED IN ${to === RED ? 'RED' : 'BLUE'}`, color: to === RED ? '#ff4a6a' : '#4ab0ff' });
        }
        if (r.isPlayer) R.emitP(r, 'popup', { text: `FLIP · ALL TO ${to === RED ? 'RED' : 'BLUE'}`, color: '#ff4fd8' });
        for (const p of R.players) if (p !== r) R.camOf(p).fovPunch(10);
        break;
      }
      case 'beam': {
        r.beamT = BEAM_T;
        r.beamTrail = r.beamTrail || [];
        r.spinTime = 0;
        r.setBeam?.(true);
        if (r.isPlayer) {
          R.emitP(r, 'popup', { text: 'LIGHTSPEED', color: '#fff6a8' });
          R.app.audio.play('turbo', 3);
          R.camOf(r).fovPunch(18);
        }
        break;
      }
      case 'wall': {
        this.dropWall(r);
        if (r.isPlayer) R.emitP(r, 'popup', { text: 'SEAM WALL', color: '#ff8a3a', small: true });
        break;
      }
      case 'patch': {
        r.hp = Math.min(100, r.hp + 50);
        if (R.near(r)) R.debris.sparks(r.pos, _v.set(0, 1, 0), 24, 0x7aff9a, 8, r.gnd.y);
        if (r.isPlayer) R.emitP(r, 'popup', { text: 'PATCHED · +50 HULL', color: '#7aff9a' });
        break;
      }
    }
    if (!r.isPlayer && R.players.some((p) => p.pos.distanceToSquared(r.pos) < 90 * 90) && id !== 'patch' && id !== 'cell') {
      for (const p of R.players) R.emitP(p, 'popup', { text: `${r.name} · ${name}`, color: ITEMS[id].color, small: true });
    }
  }

  // A cube behind you, solid in your lens's world. In BOTH it's in a world picked at random.
  dropWall(r) {
    const R = this.race;
    const tr = r.track;
    if (!tr) return;
    const w = R.world;
    const P = tr.path;
    const i = P.wrap(tr.i - Math.round(9 / P.ds));
    const mask = r.mode === RED ? M.R : r.mode === BLUE ? M.B : Math.random() < 0.5 ? M.R : M.B;
    const before = w.obstacles.length;
    w.addObstacle({ path: P.id === 'main' ? undefined : P.id, at: P.frac(i), lat: tr.lat / P.halfW, size: 3.4, mask, type: 'block' });
    const ob = w.obstacles[before];
    if (!ob) return;
    ob.dropped = true;
    ob.root.scale.setScalar(0.1);
    this.walls.push({ ob, t: 14 });
  }

  // An expanding ring on the road (the EMP).
  ring(at, color, radius) {
    const pts = [];
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true }));
    line.position.copy(at).setY(at.y + 0.6);
    const line2 = line.clone();
    line2.material = line.material;
    line2.position.y += 1.2;
    this.group.add(line, line2);
    this.fx.push({ objs: [line, line2], t: 0, len: 0.55, radius });
  }

  updateFx(dt) {
    const R = this.race;
    for (let k = this.fx.length - 1; k >= 0; k--) {
      const f = this.fx[k];
      f.t += dt;
      const s = Math.max(0.01, (f.t / f.len) ** 0.6 * f.radius);
      for (const o of f.objs) {
        o.scale.set(s, 1, s);
        o.material.opacity = Math.max(0, 1 - f.t / f.len);
      }
      if (f.t >= f.len) {
        for (const o of f.objs) {
          this.group.remove(o);
          o.geometry.dispose();
        }
        f.objs[0].material.dispose();
        this.fx.splice(k, 1);
      }
    }
    for (let k = this.walls.length - 1; k >= 0; k--) {
      const W = this.walls[k];
      W.t -= dt;
      const s = W.t < 0.4 ? Math.max(0.01, W.t / 0.4) : Math.min(1, W.ob.root.scale.x + dt * 4);
      W.ob.root.scale.setScalar(s);
      if (W.t <= 0 || W.ob.broken) {
        const obs = R.world.obstacles;
        const at = obs.indexOf(W.ob);
        if (at >= 0) obs.splice(at, 1);
        W.ob.root.removeFromParent();
        this.walls.splice(k, 1);
      }
    }
    // light walls: one line per beam trail, rebuilt each frame (short lists)
    for (const r of R.racers) {
      const T = r.beamTrail;
      if (!T) continue;
      if (!r.beamLine) {
        r.beamLine = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xfff6a8, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        r.beamLine.frustumCulled = false;
        this.group.add(r.beamLine);
      }
      const pos = [];
      for (let k = 0; k + 1 < T.length; k++) {
        const a = T[k];
        const b = T[k + 1];
        const ha = 1.6 * Math.min(1, a.t);
        const hb = 1.6 * Math.min(1, b.t);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y + hb, b.z, a.x, a.y, a.z, b.x, b.y + hb, b.z, a.x, a.y + ha, a.z);
      }
      r.beamLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      r.beamLine.visible = pos.length > 0;
    }
  }

  // ------------------------------------------------------------ rivals
  aiWants(r) {
    const R = this.race;
    if (r.itemHeld < 0.8) return false;
    const others = R.racers.filter((o) => o !== r && o.respawnT <= 0 && !o.finished);
    const ahead = (o) => {
      _a.subVectors(o.pos, r.pos);
      return _a.x * Math.sin(r.yaw) + _a.z * Math.cos(r.yaw);
    };
    switch (r.item) {
      case 'patch':
        return r.hp < 55 || r.itemHeld > 20;
      case 'cell':
        return r.mode !== BOTH || r.itemHeld > 6;
      case 'beam': {
        const tr = r.track;
        return !!tr && r.grounded && r.itemHeld > 1.5;
      }
      case 'emp':
        return others.some((o) => o.pos.distanceToSquared(r.pos) < (EMP_R * 0.7) ** 2) || r.itemHeld > 25;
      case 'flip':
        return others.some((o) => { const d = ahead(o); return d > 5 && d < 120; }) && Math.random() < 0.02;
      case 'wall':
        return others.some((o) => { const d = ahead(o); return d < -6 && d > -50; }) || r.itemHeld > 18;
    }
    return false;
  }

  dispose() {
    for (const r of this.race.racers) {
      if (r.beamLine) {
        r.beamLine.geometry.dispose();
        r.beamLine.material.dispose();
      }
    }
  }
}
