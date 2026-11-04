// Storms: stretches of road where one world turns hostile. A METEOR STORM rains down in the red world, a
// LIGHTNING STORM strikes in the blue world. Each sits over a lens-only route of its own colour, so the choice
// is real: shift to the other lens and the storm isn't there, but neither is the shortcut. Ride your storm's
// lens and you get the shortcut and the meteors. In BOTH you get the storm and no shortcut.
// A strike is telegraphed by a ring on the road a second before it lands, and only racers in a world it exists
// in can be hit (or can see it coming).

import * as THREE from '../../vendor/three.js';
import { BOTH, solidIn } from '../world/shift.js';

const RING = 28;
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Storms {
  constructor(race) {
    this.race = race;
    this.zones = [];
    this.strikes = [];
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
    if (!this.zones.length) return;
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
      const f = Math.min(1, s.t / s.z.warn);
      // the warning ring tightens and brightens as it comes
      s.ring.visible = seen && f < 1;
      s.ring.scale.setScalar(s.z.radius * (1.6 - 0.6 * f));
      s.ring.material.opacity = 0.3 + 0.7 * f * (0.6 + 0.4 * Math.sin(s.t * 30));
      // a meteor is seen falling for its last 0.35 s
      if (s.z.kind === 'meteor') {
        const fall = Math.max(0, (s.t - (s.z.warn - 0.35)) / 0.35);
        s.trail.visible = seen && fall > 0 && fall < 1;
        if (s.trail.visible) {
          const P = s.trail.geometry.getAttribute('position');
          const hx = s.x - s.dir.x * 70 * (1 - fall);
          const hy = s.y + 90 * (1 - fall);
          const hz = s.z0 - s.dir.z * 70 * (1 - fall);
          P.setXYZ(0, hx, hy, hz);
          P.setXYZ(1, hx - s.dir.x * 14, hy + 18, hz - s.dir.z * 14);
          P.needsUpdate = true;
        }
      }
      if (!s.hit && s.t >= s.z.warn) {
        s.hit = true;
        this.land(s, seen);
      }
      if (s.t > s.z.warn + 0.14) {
        this.group.remove(s.ring, s.trail);
        s.ring.geometry.dispose();
        s.trail.geometry.dispose();
        this.strikes.splice(k, 1);
      } else if (s.hit && s.z.kind === 'lightning') s.trail.visible = seen;
    }
  }

  strike(z, x, y, zz) {
    if (this.strikes.length > 24) return;
    const pts = [];
    for (let i = 0; i < RING; i++) {
      const a = (i / RING) * Math.PI * 2;
      const b = ((i + 1) / RING) * Math.PI * 2;
      pts.push(Math.cos(a), 0, Math.sin(a), Math.cos(b), 0, Math.sin(b));
      // a cross-hair in the middle
      if (i % 7 === 0) pts.push(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2, Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const ring = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: z.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.set(x, y + 0.15, zz);
    ring.renderOrder = 5;
    // the meteor's streak, or the bolt: a jagged line from the sky to the spot
    const tp = [];
    if (z.kind === 'lightning') {
      let px = x;
      let py = y + 80;
      let pz = zz;
      while (py > y) {
        const ny = Math.max(y, py - 6 - Math.random() * 8);
        const nx = ny === y ? x : x + (Math.random() - 0.5) * 7;
        const nz = ny === y ? zz : zz + (Math.random() - 0.5) * 7;
        tp.push(px, py, pz, nx, ny, nz);
        px = nx;
        py = ny;
        pz = nz;
      }
    } else tp.push(0, 0, 0, 0, 0, 0);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    const trail = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: z.kind === 'lightning' ? 0xffffff : 0xffc27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    trail.frustumCulled = false;
    trail.visible = false;
    trail.renderOrder = 6;
    this.group.add(ring, trail);
    const a = Math.random() * Math.PI * 2;
    this.strikes.push({ z, x, y, z0: zz, t: 0, ring, trail, hit: false, dir: { x: Math.cos(a), z: Math.sin(a) } });
  }

  land(s, seen) {
    const R = this.race;
    const z = s.z;
    const at = _v.set(s.x, s.y, s.z0);
    const near = R.players.some((p) => p.pos.distanceToSquared(at) < 160 * 160);
    if (seen && near) {
      R.debris.sparks(at, _d.set(0, 0, 0), 46, z.kind === 'lightning' ? 0xbfeaff : 0xffa040, z.kind === 'lightning' ? 22 : 30, s.y);
      R.app.audio.play(z.kind === 'lightning' ? 'strike' : 'meteor');
    }
    for (const r of R.racers) {
      if (r.respawnT > 0 || !solidIn(z.mask, r.mode)) continue;
      const d2 = (r.pos.x - s.x) ** 2 + (r.pos.z - s.z0) ** 2;
      if (Math.abs(r.pos.y - s.y) > 6) continue;
      if (d2 < (z.radius * 0.5) ** 2) {
        // a direct hit wrecks you
        if (r.isPlayer) R.emitP(r, 'popup', { text: z.hit, color: '#' + z.color.toString(16).padStart(6, '0') });
        R.wreck(r, null);
      } else if (d2 < z.radius * z.radius) {
        // caught in the blast: spun out and slowed, sparks and scraps
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
    if (seen && z.kind === 'lightning') for (const p of R.players) if (p.pos.distanceToSquared(at) < 90 * 90) R.camOf(p).addShake(0.25);
  }
}

