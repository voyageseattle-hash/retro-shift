// LENS TAG: a battle mode. No laps and no finish line: one craft is IT, and IT scores a point for every second it
// keeps the tag. Everyone else hunts it.
//
// The lens is the whole game:
//   - IT is in plain sight only to someone in IT's own lens. To the other single lens it isn't there at all (no car,
//     no beacon, no dot on the map), and it passes straight through them. IT in BOTH is in plain sight to everyone.
//   - A hunter in BOTH sees IT's SHIMMER from anywhere: a flickering beacon in IT's colour, which says where IT is
//     and which lens it's hiding in. That's what BOTH is for, and it costs: a hunter in BOTH can't take the tag, and
//     IT phases through them.
//   - So you look in BOTH and strike in a lens: touch IT while you're in IT's lens (or while IT is in BOTH) and the
//     tag is yours. A LANCE (RED's form move) is the lunge that closes the last few metres.
//   - IT drains SHIFT like anyone, so it can't hide forever: an empty meter drops it into BOTH, in plain sight.
//
// After a tag the new IT has a moment where it can't be tagged, and the one who lost it can't take it straight
// back. IT runs a touch slower than the hunters. The last stretch of the round scores double.

import * as THREE from '../../vendor/three.js';
import { BOTH, RED, BLUE, M, COLORS, MODE_NAME } from '../world/shift.js';
import { RaceAI } from '../vehicles/ai.js';
import { clamp } from '../core/util.js';

export const TAG = {
  round: 150, // seconds
  double: 20, // the last seconds score double
  safe: 2.2, // a new IT can't be tagged for this long
  noBack: 4, // the one who lost it can't take it straight back
  start: 3, // the first IT's head start
  itSpeed: 0.88, // IT's top speed, as a share of its own
  surge: 0.2,
  reach: 1.2, // a tag lands this far past touching (a swipe counts)
  lanceReach: 4, // and this far in a LANCE // a hunter far behind IT: up to this much more top speed
};

// The arena: a short, wide loop where the field keeps running into each other, with one hideout road for each
// lens (a RED overpass and a BLUE cut: only that lens can drive it, so IT can hole up where half the field can't
// follow). No walls, no gaps, no storms: the hunt is the hazard.
const ARENA_POINTS = [
  [0, 0, 0], [0, 140, 0], [40, 230, 3], [130, 262, 6], [222, 222, 6], [252, 130, 4], [212, 58, 2],
  [222, -22, 2], [262, -112, 4], [222, -202, 6], [122, -232, 4], [32, -182, 2], [0, -90, 0],
];
function fractions(points) {
  const d = [0];
  for (let i = 1; i <= points.length; i++) {
    const a = points[i - 1];
    const b = points[i % points.length];
    d.push(d[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] || 0) - (a[2] || 0)));
  }
  const L = d[d.length - 1];
  return (k, t = 0) => ((d[k] + (d[k + 1] - d[k]) * t) / L) % 1;
}
const P = fractions(ARENA_POINTS);
export const ARENA = {
  id: 'prism',
  num: 'LT',
  name: 'PRISM BOWL',
  blurb: 'A wide neon bowl with a hideout for each lens.',
  decor: 'void',
  seed: 77,
  laps: 99,
  sun: 1,
  halfWidth: 14,
  noStorms: true,
  points: ARENA_POINTS,
  branches: [
    { from: P(2, 0.2), to: P(5, 0.3), mask: M.RO, side: 1, lift: 8, label: 'RED HIDEOUT' },
    { from: P(8, 0.1), to: P(11, 0.4), mask: M.BO, side: -1, lift: 5, label: 'BLUE HIDEOUT' },
  ],
  gaps: [],
  obstacles: [],
  boosts: [{ at: P(0, 0.5) }, { at: P(6, 0.5), lat: 0.4 }, { at: P(9, 0.6), lat: -0.4 }, { path: 'b0', at: 0.6 }, { path: 'b1', at: 0.6 }],
  shards: [{ at: P(1, 0.3), n: 3 }, { at: P(5, 0.7), lat: -0.4, n: 3 }, { at: P(7, 0.5), lat: 0.4, n: 3 }, { at: P(11, 0.8), n: 3 }],
};

const COL = { [BOTH]: 0xffd04a, [RED]: COLORS.red, [BLUE]: COLORS.blue };
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();

// What someone looking through `viewer` sees of IT in `it`: 'full', 'shimmer' or 'none'.
export function sightOf(viewer, it) {
  if (it === BOTH || viewer === it) return 'full';
  if (viewer === BOTH) return 'shimmer';
  return 'none';
}
// Can a hunter in `hunter` take the tag off IT in `it`?
const canTag = (hunter, it) => hunter !== BOTH && (it === BOTH || it === hunter);
const other = (m) => (m === RED ? BLUE : RED);

export class LensTag {
  constructor(race) {
    this.race = race;
    race.tag = this;
    this.t = 0; // seconds of round played
    this.score = new Map(race.racers.map((r) => [r, 0]));
    this.tags = new Map(race.racers.map((r) => [r, 0]));
    this.it = null;
    this.lastIt = null;
    this.noBackT = 0;
    this.over = false;
    this.doubled = false;
    // no SEAM CHARGES (the prism gates stay hidden), and the race's own lap and radio business stays out of it
    race.items.on = false;
    race.items.group.visible = false;
    race.nextComms = Infinity;
    race.app.audio.playCourse('void');
    for (const r of race.racers) r.baseSpeedMul = r.speedMul;
    // a big room runs the same craft twice: the second one gets a number, and the paint it was given
    const seen = new Map();
    for (const r of race.racers) {
      const n = (seen.get(r.name) || 0) + 1;
      seen.set(r.name, n);
      if (n > 1) r.name = `${r.name} ${n}`;
      if (typeof r.livery?.paint === 'number') r.color = r.livery.paint;
    }
    this.buildBeacon();
    if (race.def === ARENA || race.def.id === ARENA.id) this.buildArena();
    this.waves = [];
    // listen in on the race (as the event runner does): the round after each frame's sim, and each view drawn with
    // IT hidden from a lens that can't see it. (Race.bump calls contact() itself.)
    const update = race.update.bind(race);
    race.update = (dt) => {
      update(dt);
      this.update(dt);
    };
    const before = race.beforeRender.bind(race);
    race.beforeRender = (renderer) => {
      this.afterVisuals();
      before(renderer);
    };
    const views = race.views.bind(race);
    race.views = () =>
      views().map((v, k) => {
        if (!race.split) return v;
        const b = v.before;
        return { ...v, before: () => (this.render(k), b?.()) };
      });
  }

  // The beacon over IT: a tall column of light, a spinning crown, and a ring on the road round the car. Drawn for
  // each view by render(): bright in a lens that sees IT, a flicker for BOTH, nothing at all for the other lens.
  buildBeacon() {
    const g = (this.beacon = new THREE.Group());
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false };
    this.pillarMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.3, side: THREE.DoubleSide, ...add });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 90, 10, 1, true), this.pillarMat);
    pillar.position.y = 46;
    this.pillar = pillar;
    this.crownMat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.9, ...add });
    const crown = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(1.3, 0)), this.crownMat);
    crown.position.y = 4.2;
    crown.scale.set(1, 1.5, 1);
    this.crown = crown;
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.55, side: THREE.DoubleSide, ...add });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.7, 40), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.ring = ring;
    g.add(pillar, crown, ring);
    this.race.scene.add(g);
  }

  // The PRISM BOWL's own look: a giant glass prism turning over the infield, splitting a white beam into a red one
  // and a blue one across the bowl; rings of light on the infield floor under it; and a rim of tall prism pylons round
  // the outside of the road, red and blue in turn, so the bowl reads as an arena from anywhere on it. All neutral:
  // nothing here says which lens IT is in.
  buildArena() {
    const race = this.race;
    const m = race.world.main;
    const g = (this.arena = new THREE.Group());
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
    // the infield's middle
    let cx = 0;
    let cz = 0;
    let cy = Infinity;
    for (let i = 0; i < m.N; i++) {
      cx += m.px[i];
      cz += m.pz[i];
      cy = Math.min(cy, m.py[i]);
    }
    cx /= m.N;
    cz /= m.N;
    const C = new THREE.Vector3(cx, cy, cz);
    // the prism: a tall triangular glass column, its edges lit, slowly turning
    const prism = new THREE.Group();
    const geo = new THREE.CylinderGeometry(28, 28, 90, 3, 1);
    prism.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8a4ad8, opacity: 0.22, side: THREE.DoubleSide, ...add })));
    this.prismEdge = new THREE.LineBasicMaterial({ color: 0xf4ecff, opacity: 0.95, ...add });
    prism.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.prismEdge));
    // an inner prism the other way up, red and blue
    const inner = new THREE.CylinderGeometry(16, 16, 66, 3, 1);
    const ir = new THREE.LineSegments(new THREE.EdgesGeometry(inner), new THREE.LineBasicMaterial({ color: COLORS.red, opacity: 0.8, ...add }));
    const ib = new THREE.LineSegments(new THREE.EdgesGeometry(inner), new THREE.LineBasicMaterial({ color: COLORS.blue, opacity: 0.8, ...add }));
    ir.rotation.y = Math.PI / 3;
    ib.scale.setScalar(1.12);
    prism.add(ir, ib);
    this.prismInner = [ir, ib];
    prism.position.set(cx, cy + 82, cz);
    prism.rotation.z = 0.12;
    this.prism = prism;
    g.add(prism);
    // the white beam coming down into it, and the split beams going out the other side, sweeping round the bowl
    const beam = (color, len, w, op) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.4, w, len, 8, 1, true), new THREE.MeshBasicMaterial({ color, opacity: op, side: THREE.DoubleSide, fog: false, ...add }));
      b.geometry.translate(0, len / 2, 0);
      return b;
    };
    const white = beam(0xffffff, 400, 2.2, 0.22);
    white.position.set(cx, cy + 110, cz);
    g.add(white);
    this.beams = [];
    for (const [col, k] of [[COLORS.red, 0], [COLORS.blue, 1]]) {
      const b = beam(col, 300, 4, 0.24);
      const pivot = new THREE.Group();
      pivot.position.set(cx, cy + 64, cz);
      b.rotation.z = Math.PI / 2 + 0.24; // out sideways and a little down, over the road
      pivot.add(b);
      pivot.userData.k = k;
      g.add(pivot);
      this.beams.push(pivot);
    }
    // rings of light on the infield floor
    this.rings = [];
    for (let k = 0; k < 4; k++) {
      const r = 20 + k * 16;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.8, 72), new THREE.MeshBasicMaterial({ color: k % 2 ? COLORS.blue : COLORS.red, opacity: 0.5, side: THREE.DoubleSide, ...add }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cx, cy + 0.2, cz);
      g.add(ring);
      this.rings.push(ring);
    }
    // the rim: a prism pylon every so often, outside the rail
    const pyl = new THREE.CylinderGeometry(1.6, 2.4, 1, 3, 1);
    pyl.translate(0, 0.5, 0);
    const pylE = new THREE.EdgesGeometry(pyl);
    const mats = [COLORS.red, COLORS.blue].map((c) => ({
      line: new THREE.LineBasicMaterial({ color: c, opacity: 0.9, ...add }),
      fill: new THREE.MeshBasicMaterial({ color: c, opacity: 0.12, side: THREE.DoubleSide, ...add }),
      cap: new THREE.MeshBasicMaterial({ color: c, opacity: 0.85, ...add }),
    }));
    const capG = new THREE.OctahedronGeometry(1.6, 0);
    const step = Math.max(1, Math.round(44 / m.ds));
    const P = new THREE.Vector3();
    this.caps = [];
    for (let i = 0, n = 0; i < m.N; i += step, n++) {
      // outward: whichever side of the road is further from the infield's middle
      const a = m.point(i, m.halfW + 7, 0, new THREE.Vector3());
      const b = m.point(i, -m.halfW - 7, 0, new THREE.Vector3());
      P.copy(a.distanceToSquared(C) > b.distanceToSquared(C) ? a : b);
      const h = 18 + (n % 3) * 7;
      const M = mats[n % 2];
      const fill = new THREE.Mesh(pyl, M.fill);
      const line = new THREE.LineSegments(pylE, M.line);
      for (const o of [fill, line]) {
        o.position.set(P.x, P.y - 6, P.z);
        o.scale.set(1, h + 6, 1);
        o.rotation.y = n * 0.7;
        g.add(o);
      }
      const cap = new THREE.Mesh(capG, M.cap);
      cap.position.set(P.x, P.y + h + 2, P.z);
      cap.userData.y = cap.position.y;
      cap.userData.n = n;
      g.add(cap);
      this.caps.push(cap);
    }
    race.scene.add(g);
  }
  // The arena turning, and the tag shockwaves spreading (each frame, from update)
  animate(dt) {
    const t = this.race.t;
    if (this.prism) {
      this.prism.rotation.y = t * 0.18;
      this.prismInner[0].rotation.y = -t * 0.5;
      this.prismInner[1].rotation.y = t * 0.35;
      for (const p of this.beams) p.rotation.y = t * 0.22 + p.userData.k * Math.PI;
      this.rings.forEach((r, k) => (r.material.opacity = 0.3 + 0.25 * Math.sin(t * 2 - k * 0.9)));
      for (const c of this.caps) {
        c.rotation.y = t * 1.5 + c.userData.n;
        c.position.y = c.userData.y + Math.sin(t * 2 + c.userData.n) * 0.6;
      }
      // the prism flares as the tag changes hands
      this.flare = Math.max(0, (this.flare || 0) - dt * 1.5);
      this.prismEdge.opacity = 0.7 + 0.3 * Math.sin(t * 3) * 0.5 + this.flare;
      this.prism.scale.setScalar(1 + this.flare * 0.08);
    }
    for (let k = this.waves.length - 1; k >= 0; k--) {
      const w = this.waves[k];
      w.t += dt;
      const f = w.t / 0.9;
      if (f >= 1) {
        this.race.scene.remove(w.mesh);
        w.mesh.geometry.dispose();
        w.mesh.material.dispose();
        this.waves.splice(k, 1);
        continue;
      }
      w.mesh.scale.setScalar(1 + f * (w.big ? 16 : 10));
      w.mesh.material.opacity = (1 - f) ** 1.5 * 0.9;
    }
  }
  // A tag's shockwave: two rings, one in each colour, out across the road from where it happened
  wave(at, y) {
    for (const [col, big] of [[COLORS.red, false], [COLORS.blue, true]]) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(1.4, 2, 48), new THREE.MeshBasicMaterial({ color: col, opacity: 0.9, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(at.x, y + 0.3, at.z);
      this.race.scene.add(mesh);
      this.waves.push({ mesh, t: 0, big });
    }
  }

  // Seconds left in the round.
  get left() {
    return Math.max(0, TAG.round - this.t);
  }
  // Distance along the loop from a to b (metres, -L/2..L/2): positive when b is ahead.
  along(a, b) {
    const L = this.race.world.main.length;
    let d = (((b.prog - a.prog) % 1) + 1) % 1;
    if (d > 0.5) d -= 1;
    return d * L;
  }

  // Online the host owns the round (who's IT, the scores, the end) and tells everyone; each browser still draws the
  // tag for itself, and only moves its own craft (the spin, the surge).
  get authority() {
    return !this.race.online || this.race.online.isHost;
  }
  send(m, reliable = true) {
    if (this.race.online?.isHost) this.race.app.net.t?.broadcast(m, reliable);
  }
  onNet(m) {
    const race = this.race;
    const bySlot = (s) => race.racers.find((r) => r.slot === s);
    const scores = (list) => {
      for (const [slot, sc, tg] of list || []) {
        const r = bySlot(slot);
        if (r) {
          this.score.set(r, sc);
          this.tags.set(r, tg);
        }
      }
    };
    if (m.t === 'tag') {
      const r = bySlot(m.it);
      if (r && r !== this.it) this.give(r, m.how || null);
    } else if (m.t === 'tagsc') {
      scores(m.s);
      this.t = m.tt;
    } else if (m.t === 'tagend') {
      scores(m.s);
      if (m.tt != null) this.t = m.tt;
      if (!this.over) this.end();
    }
  }
  packScores() {
    return this.race.racers.map((r) => [r.slot, Math.round(this.score.get(r) * 100) / 100, this.tags.get(r)]);
  }

  give(r, how = null) {
    const race = this.race;
    const old = this.it;
    this.send({ t: 'tag', it: r.slot, how });
    this.it = r;
    r.tagSafeT = how ? TAG.safe : TAG.start;
    if (old) {
      this.lastIt = old;
      this.noBackT = this.t + TAG.noBack;
    }
    if (!how) return;
    this.tags.set(r, this.tags.get(r) + 1);
    this.flare = 1;
    // the tag is ripped off the old IT: it spins out, sheds lines in both colours, and the new IT surges away
    if (old) {
      if (!old.puppet) old.spinOut(0.8, Math.random() < 0.5 ? -1 : 1);
      if (race.near(old)) {
        race.debris.burst(old.root, _a.copy(old.vel).multiplyScalar(0.5), 8, old.gnd.y, 0.2, 1.8);
        _v.copy(old.pos).lerp(r.pos, 0.5).setY(old.pos.y + 0.6);
        race.debris.sparks(_v, _a.set(0, 1, 0), 30, COL[old.mode], 22, old.gnd.y);
        race.debris.sparks(_v, _a.set(0, 1, 0), 30, COL[r.mode], 22, old.gnd.y);
        this.wave(_v, old.gnd.y);
      }
    }
    if (!r.puppet) r.giveBoost(1, 1.3);
    const seen = race.players.some((p) => p === r || p === old || p.pos.distanceToSquared(r.pos) < 80 * 80);
    if (seen) race.app.audio.play('wreck');
    for (const p of race.players) {
      const cam = race.camOf(p);
      if (p === r || p === old) {
        cam.addShake(0.8);
        cam.fovPunch(10);
        race.app.input.rumble(p.pIndex || 0, 0.8, 0.8, 300);
      }
      if (p === r) race.emitP(p, 'popup', { text: "YOU'RE IT · HIDE", color: '#ffd04a' });
      else if (p === old) race.emitP(p, 'popup', { text: 'TAGGED', color: '#ff4a6a' });
      else race.emitP(p, 'popup', { text: `${r.name} IS IT`, color: '#ffd04a', small: true });
    }
    race.aberr = Math.max(race.aberr || 0, 0.8);
    // a beat of slow motion when you're in it (one screen only)
    if ((r.isPlayer || old?.isPlayer) && !race.split && !race.online) {
      race.slowLen = 0.6;
      race.slowT = 0.6;
    }
  }

  // Two racers overlap (Race.bump). Returns true when they pass through each other instead of bumping.
  contact(A, B) {
    const it = this.it;
    if (!it || (A !== it && B !== it)) return false;
    const H = A === it ? B : A;
    // a hunter in BOTH only sees IT's shimmer: IT is out of phase with them
    if (H.mode === BOTH && it.mode !== BOTH) return true;
    if (!this.authority) return false;
    if (this.over || this.race.state !== 'race' || it.tagSafeT > 0 || H.respawnT > 0) return false;
    if (H === this.lastIt && this.t < this.noBackT) return false;
    if (canTag(H.mode, it.mode)) this.give(H, 'touch');
    return false;
  }
  // A swipe that just misses still lands, and a LANCE reaches further.
  reachCheck() {
    const it = this.it;
    // (online the host judges reach on what it sees, so it's a little more generous: everyone else is drawn ~0.1 s
    // in the past)
    const slack = this.race.online ? 0.8 : 0;
    if (!this.authority || this.over || this.race.state !== 'race' || it.tagSafeT > 0 || it.respawnT > 0) return;
    for (const H of this.race.racers) {
      if (H === it || H.respawnT > 0 || !canTag(H.mode, it.mode)) continue;
      if (H === this.lastIt && this.t < this.noBackT) continue;
      _v.subVectors(it.pos, H.pos);
      if (Math.abs(_v.y) > 2.5) continue;
      const reach = H.radius + it.radius + slack + (H.lanceT > 0 || (H.puppet && H.mode === RED && H.speed > it.speed + 8) ? TAG.lanceReach : TAG.reach);
      if (_v.x * _v.x + _v.z * _v.z < reach * reach) return this.give(H, H.lanceT > 0 ? 'lance' : 'touch');
    }
  }

  // Who's drawn on a player's map: IT only where that player could see it.
  mapRacers(p) {
    const it = this.it;
    if (!it || p === it || sightOf(p.mode, it.mode) !== 'none') return this.race.racers;
    return this.race.racers.filter((r) => r !== it);
  }

  update(dt) {
    const race = this.race;
    this.animate(dt);
    for (const r of race.racers) r.wrongWay = 0; // a battle: drive whichever way you like
    if (race.state === 'race' && !this.it && this.authority) {
      // the first IT: the CPU furthest up the grid, with a head start
      const cpus = race.racers.filter((r) => !r.isPlayer && !r.human);
      this.give(cpus.sort((a, b) => b.prog - a.prog)[0] || race.racers[0]);
      if (!this.it.puppet) this.it.giveBoost(2, 1.35);
    }
    if (this.it && !this.announced) {
      this.announced = true;
      for (const p of race.players) race.emitP(p, 'popup', { text: p === this.it ? "YOU'RE IT · HIDE" : `${this.it.name} IS IT · HUNT`, color: '#ffd04a' });
    }
    if (!this.it || this.over) return;
    const it = this.it;
    if (race.state === 'race') {
      this.t += dt;
      if (it.tagSafeT > 0) it.tagSafeT -= dt;
      const rate = this.left <= TAG.double ? 2 : 1;
      if (it.respawnT <= 0) this.score.set(it, this.score.get(it) + dt * rate);
      if (!this.doubled && this.left <= TAG.double) {
        this.doubled = true;
        race.app.audio.play('finalLap');
        for (const p of race.players) race.emitP(p, 'popup', { text: 'DOUBLE TIME', color: '#ff4fd8' });
      }
      this.reachCheck();
      this.scT = (this.scT || 0) - dt;
      if (this.scT <= 0 && this.race.online?.isHost) {
        this.scT = 0.5;
        this.send({ t: 'tagsc', tt: this.t, s: this.packScores() }, false);
      }
      if (this.left <= 0 && this.authority) this.end();
    }
    // IT runs a touch slower, and a hunter far behind it gets a surge to close back in (so the hunt never strings out
    // round the loop)
    for (const r of race.racers) {
      // (measured forward round the loop: a hunter IT has just passed has the furthest to go, and gets the most)
      const L = race.world.main.length;
      const gap = ((((it.prog - r.prog) % 1) + 1) % 1) * L;
      const behind = r === it || gap > L - 60 ? 0 : clamp((gap - 40) / 300, 0, 1);
      r.speedMul = (r.baseSpeedMul ?? 1) * (r === it ? TAG.itSpeed : 1 + TAG.surge * behind);
    }
    for (const r of race.racers) if (r.ai && !r.finished) this.think(r, dt);
  }

  end() {
    const race = this.race;
    this.over = true;
    this.send({ t: 'tagend', tt: this.t, s: this.packScores() });
    race.state = 'finished';
    for (const r of race.racers) {
      r.finished = true;
      r.finishTime = race.raceTime;
      if (r.isPlayer && !r.ai) r.ai = new RaceAI(r, race.world, 0.6);
    }
    const st = this.standings();
    race.app.audio.play('finish', 1);
    if (race.split) race.app.audio.announce(st.indexOf(race.players[0]) < st.indexOf(race.players[1]) ? 'p1wins' : 'p2wins', 0.5);
    else race.app.audio.announce(st[0] === race.player ? 'winner' : 'over', 0.45);
    for (const p of race.players) race.emitP(p, 'popup', { text: st[0] === p ? 'TAG CHAMPION' : 'TIME', color: '#ff4fd8' });
  }

  standings() {
    return [...this.race.racers].sort((a, b) => this.score.get(b) - this.score.get(a));
  }

  // ------------------------------------------------------------ the CPUs
  // Each CPU's wanted lens (read by RaceAI's lens score through lensBias) and its line and throttle (steerAI).
  think(r, dt) {
    const it = this.it;
    r.tagThink = (r.tagThink || 0) - dt;
    if (r.tagThink > 0) return;
    const skill = r.ai.skill;
    r.tagThink = 0.15 + (1 - skill) * 0.3;
    if (r === it) {
      // IT: keep out of the lens of whoever's closing in; recharge in BOTH when nobody's near
      let threat = null;
      let td = 22 + skill * 18;
      let near = 0;
      for (const h of this.race.racers) {
        if (h === it || h.respawnT > 0) continue;
        const d = h.pos.distanceTo(it.pos);
        if (d < 80) near++;
        if (h.mode !== BOTH && d < td) {
          td = d;
          threat = h;
        }
      }
      r.tagThreat = threat;
      // a juke: out of the closing hunter's lens (not every time, and not again straight away)
      if (threat && this.t > (r.jukeT ?? -9) && Math.random() < 0.35 + skill * 0.45) {
        r.jukeT = this.t + 2.5 - skill;
        r.tagWant = it.energy > 0.12 ? other(threat.mode) : BOTH;
      } else if (threat) r.tagWant = it.mode;
      else if (!near && it.energy < 0.55) r.tagWant = BOTH;
      else if (it.mode === BOTH && near && it.energy > 0.4) r.tagWant = Math.random() < 0.5 ? RED : BLUE;
      else r.tagWant = it.mode;
      return;
    }
    // a hunter: remember the lens IT was last seen in
    const sight = sightOf(r.mode, it.mode);
    if (sight !== 'none') {
      r.tagSeen = it.mode;
      r.tagSeenT = this.t;
    }
    // (lost it: back to BOTH to find the shimmer, after a beat to react)
    const known = this.t - (r.tagSeenT ?? -99) < 0.6 - skill * 0.3 ? r.tagSeen : null;
    const d = Math.abs(this.along(r, it));
    const close = d < 70 + skill * 40 && it.tagSafeT <= 0 && !(r === this.lastIt && this.t < this.noBackT);
    if (!close || known == null) r.tagWant = BOTH; // look for it (and refill)
    else r.tagWant = known === BOTH ? RED : known;
  }
  lensBias(r, m) {
    return r.tagWant === m ? -12 : 0;
  }
  // Called from RaceAI before it steers: line up on IT (or away from the hunter closing in).
  steerAI(r, ai, P, pi) {
    ai.tagThrottle = null;
    const it = this.it;
    if (!it || this.over || this.race.state !== 'race' || ai._branch || r.track?.path !== P) return;
    if (r === it) {
      const h = r.tagThreat;
      if (h?.track?.path === P && Math.abs(this.along(r, h)) < 30) ai.targetLat = clamp(h.track.lat > 0 ? -P.halfW * 0.7 : P.halfW * 0.7, -P.halfW + 2, P.halfW - 2);
      return;
    }
    if (it.respawnT > 0 || it.track?.path !== P) return;
    const d = this.along(r, it);
    // IT ahead: line up on it. IT just behind: ease off and sit in its line.
    if (d > 0 && d < 70) ai.targetLat = clamp(it.track.lat, -P.halfW + 2, P.halfW - 2);
    else if (d < 0 && d > -45 && r.tagWant !== BOTH) {
      ai.targetLat = clamp(it.track.lat, -P.halfW + 2, P.halfW - 2);
      ai.tagThrottle = 0.45;
    }
  }

  // ------------------------------------------------------------ drawing, per view
  // After the racers' visuals are set for the frame: note what each one would show, then draw the main view.
  afterVisuals() {
    for (const r of this.race.racers) {
      r.tagVis = r.root.visible;
      r.tagTrail = r.trail.mesh.visible;
    }
    if (!this.race.split) this.render(0);
  }
  // One view: IT drawn (or not) for that view's player, and the beacon to match.
  render(k) {
    const race = this.race;
    const p = race.players[k] || race.player;
    const it = this.it;
    for (const r of race.racers) {
      if (r.tagVis === undefined) continue;
      r.root.visible = r.tagVis;
      r.trail.mesh.visible = r.tagTrail;
    }
    if (!it || it.respawnT > 0 || this.over) {
      this.beacon.visible = false;
      return;
    }
    const mine = p === it;
    const sight = mine ? 'full' : sightOf(p.mode, it.mode);
    if (sight !== 'full') {
      it.root.visible = false;
      it.trail.mesh.visible = false;
    }
    const b = this.beacon;
    b.visible = sight !== 'none';
    if (!b.visible) return;
    b.position.copy(it.root.position);
    const c = COL[it.mode];
    const t = race.t;
    const safe = it.tagSafeT > 0 ? 0.55 + 0.45 * Math.sin(t * 30) : 1;
    // the shimmer: a broken flicker, so BOTH can tell where and which colour, but never mistake it for the car
    const flick = sight === 'shimmer' ? (Math.sin(t * 23) > -0.3 ? 0.55 + 0.25 * Math.sin(t * 7.3) : 0.1) : 1;
    this.pillarMat.color.setHex(c);
    this.crownMat.color.setHex(c);
    this.ringMat.color.setHex(c);
    // (your own column would stand in front of the chase camera all round: you get the crown and the ring)
    this.pillar.visible = !mine;
    this.pillarMat.opacity = 0.3 * flick * safe;
    this.crownMat.opacity = Math.min(1, 0.95 * flick * safe * (sight === 'shimmer' ? 1.8 : 1));
    this.ring.visible = sight === 'full';
    this.ringMat.opacity = 0.5 * safe * (0.75 + 0.25 * Math.sin(t * 6));
    this.ring.scale.setScalar(1 + 0.08 * Math.sin(t * 6));
    this.crown.rotation.y = t * 2.2;
    this.crown.position.y = 4.2 + Math.sin(t * 3) * 0.3;
    // seen through BOTH the crown floats higher, out of the traffic, and bigger
    if (sight === 'shimmer') this.crown.position.y += 3;
    this.crown.scale.set(sight === 'shimmer' ? 1.8 : 1, sight === 'shimmer' ? 2.6 : 1.5, sight === 'shimmer' ? 1.8 : 1);
  }

  // For the HUD: what a player can tell about IT right now.
  readout(p) {
    const it = this.it;
    if (!it) return { role: 'wait' };
    if (p === it) return { role: 'it', safe: it.tagSafeT > 0 };
    const sight = it.respawnT > 0 ? 'none' : sightOf(p.mode, it.mode);
    const out = { role: 'hunt', sight, lens: sight === 'none' ? null : it.mode, canTag: canTag(p.mode, it.mode) && sight === 'full' };
    if (sight !== 'none') {
      const cam = this.race.camOf(p).camera;
      _v.subVectors(it.pos, cam.position);
      out.dist = _v.length();
      cam.getWorldDirection(_a);
      const fwd = _v.x * _a.x + _v.z * _a.z;
      const right = _v.x * -_a.z + _v.z * _a.x;
      out.ang = Math.atan2(right, fwd); // 0 straight ahead, + to the right
    }
    return out;
  }
}

export { MODE_NAME };
