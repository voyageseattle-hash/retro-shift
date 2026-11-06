// Storms: stretches of road where one world turns hostile. A METEOR STORM rains down in the red world, a
// LIGHTNING STORM strikes in the blue world. Each sits over a lens-only route of its own colour, so the choice
// is real: shift to the other lens and the storm isn't there, but neither is the shortcut. Ride your storm's
// lens and you get the shortcut and the meteors. In BOTH you get the storm and no shortcut.
// A strike is telegraphed by closing rings on the road a second before it lands, and only racers in a world it
// exists in can be hit (or can see it coming). Meteors are glowing wireframe rocks on a fiery trail that shatter
// into lines; lightning is a forked bolt that cracks three times with a white flash. Both leave a shockwave and a
// cooling scorch.

import * as THREE from '../../vendor/three.js';
import { BOTH, solidIn } from '../world/shift.js';

const RING = 28;
const TAIL = 7; // lines in a meteor's trail
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

function lines(pts, color, opacity = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, opacity, ...ADD }));
  l.frustumCulled = false;
  l.renderOrder = 6;
  return l;
}

// A ring of radius r in the ground plane; jag roughens it (a scorch mark).
function circle(r, seg, jag = 0) {
  const p = [];
  const rr = (i) => r * (1 + (jag ? (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1 * jag - jag / 2 : 0));
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const r0 = rr(i);
    const r1 = rr((i + 1) % seg);
    p.push(Math.cos(a0) * r0, 0, Math.sin(a0) * r0, Math.cos(a1) * r1, 0, Math.sin(a1) * r1);
  }
  return p;
}

export class Storms {
  constructor(race) {
    this.race = race;
    this.zones = [];
    this.strikes = [];
    this.flash = 0;
    this.group = new THREE.Group();
    // (the world lays the zones out, and signs them; online races keep clear skies, since strikes are random)
    if (race.tutorial || race.online) return;
    this.zones = race.world.storms || [];
  }

  inZone(z, r) {
    if (r.track?.path === z.branch) return true;
    let u = r.lastU;
    let a = z.u0;
    let b = z.u1;
    if (a < 0) {
      a += 1;
      b += 1;
      if (u < 0.5) u += 1;
    }
    return u >= a && u <= b;
  }

  // Is this racer driving through a storm that exists in lens m? (the AI asks)
  threat(r, m) {
    for (const z of this.zones) if (solidIn(z.mask, m) && this.inZone(z, r)) return true;
    return false;
  }

  update(dt, viewer) {
    const R = this.race;
    this.flash = Math.max(0, this.flash - dt * 5) || 0;
    if (!this.zones.length && !this.strikes.length) return;
    // aim new strikes at the racers in the storm who can be hit by it
    if (R.state === 'race') {
      for (const z of this.zones) {
        for (const r of R.racers) {
          if (r.puppet || r.respawnT > 0 || r.finished || !this.inZone(z, r)) continue;
          r.stormT = (r.stormT ?? Math.random() * z.every) - dt;
          if (r.stormT > 0) continue;
          r.stormT = z.every * (0.7 + Math.random() * 0.6);
          if (!solidIn(z.mask, r.mode)) continue;
          // where it'll be when the strike lands, give or take a lane
          const at = _v.copy(r.pos).addScaledVector(r.vel, z.warn * (0.85 + Math.random() * 0.3));
          at.x += (Math.random() - 0.5) * 9;
          at.z += (Math.random() - 0.5) * 9;
          const g = R.world.ground(at.x, r.pos.y + 4, at.z, {}, BOTH);
          this.strike(z, at.x, g.onRoad ? g.y : r.pos.y, at.z);
        }
      }
    }
    for (let k = this.strikes.length - 1; k >= 0; k--) {
      const s = this.strikes[k];
      s.t += dt;
      const seen = solidIn(s.z.mask, viewer.mode);
      s.fx.visible = seen;
      const W = s.z.warn;
      const f = Math.min(1, s.t / W);
      // the warning: rings closing in, a disc filling, ticks turning, faster and brighter as it comes
      const warn = s.t < W;
      s.warnFx.visible = warn;
      if (warn) {
        const pulse = 0.65 + 0.35 * Math.sin(s.t * (14 + 26 * f));
        s.rings.forEach((rg, n) => {
          rg.scale.setScalar(s.z.radius * (1 + (1 - f) * (0.9 + n * 0.5)));
          rg.material.opacity = (0.55 + 0.45 * f) * pulse * (1 - n * 0.2);
        });
        s.disc.scale.setScalar(s.z.radius * (0.15 + 0.85 * f));
        s.disc.material.opacity = 0.14 + 0.5 * f * f;
        s.ticks.rotation.y = s.t * (1.5 + 5 * f);
        s.ticks.scale.setScalar(s.z.radius * (1.25 - 0.25 * f));
        s.ticks.material.opacity = 0.5 + 0.5 * f;
      }
      if (s.z.kind === 'meteor') this.meteor(s, dt, seen);
      else this.bolt(s);
      if (!s.hit && s.t >= W) {
        s.hit = true;
        this.land(s, seen);
      }
      // after the hit: the shockwave rolls out and the scorch cools
      if (s.hit) {
        const a = s.t - W;
        s.wave.visible = a < 0.55;
        s.wave.scale.setScalar(s.z.radius * (0.4 + a * 7));
        s.wave.material.opacity = Math.max(0, 1 - a / 0.55);
        s.scorch.visible = true;
        s.scorch.material.opacity = Math.max(0, 1 - a / 3.2) * (0.75 + 0.25 * Math.sin(a * 40) * Math.max(0, 1 - a));
      }
      if (s.t > W + 3.2) {
        this.group.remove(s.fx, ...(s.extra || []));
        for (const o of [s.fx, ...(s.extra || [])]) o.traverse((q) => q.geometry?.dispose());
        this.strikes.splice(k, 1);
      }
    }
  }

  // A meteor: a glowing wireframe rock coming down over the last 0.6 s on a fiery trail.
  meteor(s, dt, seen) {
    const fall = Math.max(0, (s.t - (s.z.warn - 0.6)) / 0.6);
    const on = seen && !s.hit && fall > 0;
    s.rock.visible = s.tail.visible = on;
    if (!on) return;
    const k = 1 - fall;
    const hx = s.x - s.dir.x * 80 * k;
    const hy = s.y + 110 * k;
    const hz = s.z0 - s.dir.z * 80 * k;
    s.rock.position.set(hx, hy, hz);
    s.rock.rotation.x += dt * 7;
    s.rock.rotation.y += dt * 5;
    // the trail: a fan of lines back up the way it came
    const P = s.tail.geometry.getAttribute('position');
    for (let i = 0; i < TAIL; i++) {
      const o = (i / (TAIL - 1) - 0.5) * 1.6;
      const ox = -s.dir.z * o;
      const oz = s.dir.x * o;
      const len = 14 + 16 * (1 - Math.abs(o));
      P.setXYZ(i * 2, hx + ox * 0.6, hy, hz + oz * 0.6);
      P.setXYZ(i * 2 + 1, hx - s.dir.x * len * 0.8 + ox, hy + len, hz - s.dir.z * len * 0.8 + oz);
    }
    P.needsUpdate = true;
    // embers shed off it as it falls
    if (Math.random() < 0.8) this.race.debris.sparks(_v.set(hx, hy, hz), _d.set(s.dir.x * 0.3, 0.5, s.dir.z * 0.3), 3, 0xff8a3a, 8, s.y);
  }

  // Lightning: a faint leader flickers down first, then the forked bolt cracks three times and is gone.
  bolt(s) {
    const W = s.z.warn;
    const leader = s.t > W * 0.55 && s.t < W;
    const a = s.t - W;
    const lit = a >= 0 && a < 0.3 && Math.floor(a / 0.06) % 2 === 0;
    s.boltFx.visible = leader || lit;
    s.boltCore.material.opacity = lit ? 1 : 0.25 * Math.random();
    s.boltGlow.material.opacity = lit ? 0.55 : 0.08;
  }

  strike(z, x, y, zz) {
    if (this.strikes.length > 24) return;
    const fx = new THREE.Group();
    fx.position.set(x, y + 0.12, zz);
    // warning: three rings, a filling disc, four chevron ticks
    const warnFx = new THREE.Group();
    const rings = [0, 1, 2].map(() => lines(circle(1, RING), z.color));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: z.color, ...ADD, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2;
    disc.renderOrder = 5;
    const tk = [];
    for (let q = 0; q < 4; q++) {
      const a = (q / 4) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      // a chevron pointing in
      tk.push(c * 1.3 - sn * 0.25, 0, sn * 1.3 + c * 0.25, c * 1.05, 0, sn * 1.05, c * 1.05, 0, sn * 1.05, c * 1.3 + sn * 0.25, 0, sn * 1.3 - c * 0.25);
    }
    const ticks = lines(tk, 0xffffff);
    warnFx.add(...rings, disc, ticks);
    // aftermath: a shockwave ring and a scorch that cools
    const wave = lines(circle(1, 40), z.kind === 'meteor' ? 0xffc27a : 0xd8f4ff);
    wave.visible = false;
    const scorch = lines(circle(z.radius * 0.55, 18, 0.4).concat(circle(z.radius * 0.3, 12, 0.6)), z.kind === 'meteor' ? 0xff5a2a : 0x8ad8ff);
    scorch.visible = false;
    fx.add(warnFx, wave, scorch);
    const a = Math.random() * Math.PI * 2;
    const s = { z, x, y, z0: zz, t: 0, fx, warnFx, rings, disc, ticks, wave, scorch, hit: false, dir: { x: Math.cos(a), z: Math.sin(a) } };
    if (z.kind === 'meteor') {
      // the rock and its trail live in world space (it falls from far off); the rest sits on the spot
      s.rock = new THREE.Group();
      const ico = new THREE.IcosahedronGeometry(1.8, 0);
      const core = new THREE.Mesh(ico, new THREE.MeshBasicMaterial({ color: 0xff7a2a, opacity: 0.55, ...ADD }));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(ico), new THREE.LineBasicMaterial({ color: 0xfff0c8, ...ADD }));
      s.rock.add(core, edges);
      s.rock.visible = false;
      s.tail = lines(new Array(TAIL * 6).fill(0), 0xff9a4a);
      s.tail.visible = false;
      s.extra = [s.rock, s.tail];
      this.group.add(s.rock, s.tail);
    } else {
      // a forked bolt from 90 m up: the main channel and its branches, drawn twice (a hot core and a wider glow)
      const core = [];
      const branch = (px, py, pz, toY, spread, depth) => {
        while (py > toY) {
          const ny = Math.max(toY, py - 5 - Math.random() * 7);
          const last = ny === toY && depth === 0;
          const nx = last ? 0 : px + (Math.random() - 0.5) * spread;
          const nz = last ? 0 : pz + (Math.random() - 0.5) * spread;
          core.push(px, py, pz, nx, ny, nz);
          if (depth === 0 && Math.random() < 0.22 && ny > 12) branch(nx, ny, nz, ny - 10 - Math.random() * 18, spread * 1.6, 1);
          px = nx;
          py = ny;
          pz = nz;
        }
      };
      branch((Math.random() - 0.5) * 14, 90, (Math.random() - 0.5) * 14, 0, 8, 0);
      const glow = [];
      for (const o of [-0.35, 0.35]) for (let i = 0; i < core.length; i += 3) glow.push(core[i] + o, core[i + 1], core[i + 2] - o);
      s.boltFx = new THREE.Group();
      s.boltCore = lines(core, 0xffffff);
      s.boltGlow = lines(glow, 0x8ad8ff, 0.5);
      s.boltFx.add(s.boltCore, s.boltGlow);
      s.boltFx.visible = false;
      fx.add(s.boltFx);
    }
    this.group.add(fx);
    this.strikes.push(s);
  }

  land(s, seen) {
    const R = this.race;
    const z = s.z;
    const at = _v.set(s.x, s.y, s.z0);
    const near = R.players.some((p) => p.pos.distanceToSquared(at) < 160 * 160);
    if (seen && near) {
      const meteor = z.kind === 'meteor';
      R.debris.sparks(at, _d.set(0, 0, 0), meteor ? 70 : 50, meteor ? 0xffa040 : 0xbfeaff, meteor ? 34 : 24, s.y);
      // the rock breaks into its own lines across the road
      if (meteor) {
        s.rock.position.set(s.x, s.y + 1, s.z0);
        s.rock.visible = true;
        R.debris.burst(s.rock, _d.set(s.dir.x * 12, 6, s.dir.z * 12), 20, s.y, 1, 2.4);
        s.rock.visible = false;
      }
      R.app.audio.play(meteor ? 'meteor' : 'strike');
      const d = R.player.pos.distanceTo(_v.set(s.x, s.y, s.z0));
      if (d < 70) {
        R.camOf(R.player).fovPunch(meteor ? 6 : 4);
        R.camOf(R.player).addShake((meteor ? 0.45 : 0.3) * (1 - d / 70));
      }
      if (!meteor) this.flash = Math.max(this.flash, Math.max(0.25, 1 - d / 120));
    }
    for (const r of R.racers) {
      if (r.respawnT > 0 || !solidIn(z.mask, r.mode)) continue;
      const d2 = (r.pos.x - s.x) ** 2 + (r.pos.z - s.z0) ** 2;
      if (Math.abs(r.pos.y - s.y) > 6) continue;
      if (d2 < (z.radius * 0.5) ** 2) {
        // a direct hit tears a big piece out of the hull (and finishes a hurt one)
        if (r.isPlayer) R.emitP(r, 'popup', { text: z.hit, color: '#' + z.color.toString(16).padStart(6, '0') });
        if (!R.hurt(r, 55) && r.spinOut(1, Math.random() < 0.5 ? -1 : 1)) r.vel.multiplyScalar(0.45);
      } else if (d2 < z.radius * z.radius) {
        // caught in the blast: a scorch on the hull, spun out and slowed, sparks and scraps
        if (R.hurt(r, 14)) continue;
        if (r.spinOut(0.8, Math.random() < 0.5 ? -1 : 1)) r.vel.multiplyScalar(0.55);
        R.scrape(r, 14, _d.set(r.pos.x - s.x, 0, r.pos.z - s.z0).normalize());
        if (r.isPlayer) {
          R.emitP(r, 'popup', { text: z.hit, color: '#' + z.color.toString(16).padStart(6, '0'), small: true });
          R.camOf(r).addShake(0.9);
        }
      } else if (r.isPlayer && d2 < (z.radius * 2.4) ** 2) {
        R.camOf(r).addShake(0.5);
        if (z.kind === 'lightning') R.aberr = 1.2;
      }
    }
  }
}
