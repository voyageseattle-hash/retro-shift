// Online races for up to 8 people, modelled on Absurd Combat Racing's netcode: one player's browser hosts, everyone
// else joins with a four-letter room code, and empty grid slots are filled with AI rivals.
//
// Retro Shift keeps it lighter: each browser drives its own craft with full local physics (so steering, drifting and
// shifting feel exactly like offline) and streams its state; the host runs the AI and relays everyone's state to
// everyone at 30 Hz. Other racers are drawn ~100 ms in the past, interpolated between updates. The host owns the race
// start and the shards (so two people can't take the same one); each browser times its own laps and finish.

import { createTransport, makeRoomCode, cleanCode } from './transport.js';
import { RaceAI } from '../vehicles/ai.js';
import { CARS } from '../vehicles/racer.js';
import { TRACKS } from '../world/tracks.js';
import { storage } from '../core/util.js';

export const MAX_PLAYERS = 8;
// a race grid is topped up with AI rivals to six (more if more people came); a LENS TAG room to eight
const FIELD = { race: 6, tag: 8 };
const SEND_RATE = 30;
const ALT_PAINT = [0x6aff9a, 0xff9a3a, 0xf4f0ff, 0xff6ad8];
const INTERP = 0.1;
const PROTOCOL = 2;

// One racer's state, packed into a short array.
// (twist: the Blade is mid-SWITCHBACK, so its half turn of yaw is drawn as the spin, not smeared sideways)
const F = { grounded: 1, drift: 2, boost: 4, hidden: 8, finished: 16, twist: 32 };
function pack(r) {
  const q = (v, k = 100) => Math.round(v * k) / k;
  const flags = (r.grounded ? F.grounded : 0) | (r.drift.active ? F.drift : 0) | (r.boostTime > 0 ? F.boost : 0) | (r.respawnT > 0 ? F.hidden : 0) | (r.finished ? F.finished : 0) | (r.twistT > 0 ? F.twist : 0);
  return [q(r.pos.x), q(r.pos.y), q(r.pos.z), q(r.yaw, 1000), q(r.vel.x), q(r.vel.y), q(r.vel.z), q(r.speed), r.mode, flags, q(r.prog, 10000), r.lap, r.finished ? q(r.finishTime, 1000) : 0, isFinite(r.bestLap) ? q(r.bestLap, 1000) : 0, r.drift.dir, r.drift.level, q(r.up.x), q(r.up.z), q(r.energy)];
}

export const playerName = () => storage.get('rs.netName', `SHIFTER ${Math.floor(10 + Math.random() * 90)}`);
export const setPlayerName = (n) => storage.set('rs.netName', String(n || '').toUpperCase().slice(0, 12) || playerName());

export class Online {
  constructor(app) {
    this.app = app;
    this.t = null;
    this.role = null; // 'host' | 'client'
    this.code = '';
    this.players = []; // lobby: { slot, id, name, car, livery }
    this.course = 'core';
    this.mode = 'race'; // 'race' or 'tag' (LENS TAG, game/tag.js)
    this.mySlot = 0;
    this.buffers = new Map(); // slot -> [{ at, d }]
    this.latest = new Map(); // host: slot -> packed state from that client
    this.sendT = 0;
    this.onChange = () => {};
    this.onError = () => {};
  }
  get active() {
    return !!this.t;
  }
  get isHost() {
    return this.role === 'host';
  }
  me() {
    return this.players.find((p) => p.slot === this.mySlot);
  }

  // ------------------------------------------------------------------ rooms
  async host(profile) {
    this.reset();
    this.t = createTransport();
    this.role = 'host';
    this.code = makeRoomCode(4);
    this.wire();
    await this.t.host(this.code);
    this.mySlot = 0;
    this.players = [{ slot: 0, id: null, ...profile }];
    this.course = this.app.ui.choice.track || 'core';
    this.changed();
  }
  async join(code, profile) {
    this.reset();
    this.t = createTransport();
    this.role = 'client';
    this.code = cleanCode(code);
    this.wire();
    this.profile = profile;
    await this.t.join(this.code);
    this.t.send(null, { t: 'hello', v: PROTOCOL, ...profile });
  }
  wire() {
    const t = this.t;
    t.onError = (e) => this.onError(e);
    if (this.role === 'host') {
      t.onJoin = () => {};
      t.onLeave = (id) => this.hostLeave(id);
      t.onMessage = (id, m) => this.hostMessage(id, m);
    } else {
      t.onLeave = () => this.hostLost();
      t.onMessage = (_, m) => this.clientMessage(m);
    }
  }
  leave() {
    this.close();
    this.app.netLeft?.();
  }
  close() {
    try {
      this.t?.close();
    } catch {
      /* already closed */
    }
    this.reset();
  }
  reset() {
    this.t = null;
    this.role = null;
    this.players = [];
    this.buffers.clear();
    this.latest.clear();
    this.racing = false;
    this.ready = new Set();
  }
  changed() {
    if (this.isHost) this.t.broadcast({ t: 'lobby', players: this.players, course: this.course, mode: this.mode, code: this.code });
    this.onChange();
  }

  // ------------------------------------------------------------------ host side
  hostMessage(id, m) {
    if (!m || typeof m !== 'object') return;
    const p = this.players.find((x) => x.id === id);
    switch (m.t) {
      case 'hello': {
        if (m.v !== PROTOCOL) return this.t.send(id, { t: 'refused', why: 'Different game version' });
        if (p) return;
        if (this.racing) return this.t.send(id, { t: 'refused', why: 'That race has already started' });
        const used = new Set(this.players.map((x) => x.slot));
        let slot = 0;
        while (used.has(slot)) slot++;
        if (slot >= MAX_PLAYERS) return this.t.send(id, { t: 'refused', why: 'That room is full' });
        this.players.push({ slot, id, name: String(m.name || 'SHIFTER').slice(0, 12), car: validCar(m.car), livery: m.livery || null });
        this.players.sort((a, b) => a.slot - b.slot);
        this.t.send(id, { t: 'welcome', slot });
        this.changed();
        break;
      }
      case 'car':
        if (p && !this.racing) {
          p.car = validCar(m.car);
          p.livery = m.livery || null;
          this.changed();
        }
        break;
      case 'st':
        if (p) {
          this.latest.set(p.slot, m.d);
          this.push(p.slot, m.d);
        }
        break;
      case 'ready':
        if (p) this.ready.add(p.slot);
        this.maybeGo();
        break;
      case 'shard':
        this.takeShard(m.i);
        break;
    }
  }
  // LENS TAG's own messages (the host owns the tag: who's IT, the scores, the end), handed to the round
  tagMessage(m) {
    if (m.t === 'tag' || m.t === 'tagsc' || m.t === 'tagend') {
      this.app.race?.tag?.onNet(m);
      return true;
    }
    return false;
  }
  hostLeave(id) {
    const p = this.players.find((x) => x.id === id);
    if (!p) return;
    this.players = this.players.filter((x) => x !== p);
    // mid-race, their craft carries on under AI control
    const race = this.app.race;
    const r = race?.online && race.racers.find((x) => x.slot === p.slot);
    if (r) {
      r.puppet = false;
      r.human = false;
      r.ai = new RaceAI(r, race.world, 0.8);
      r.name = `${r.name} (AI)`;
      this.buffers.delete(p.slot);
      this.latest.delete(p.slot);
    }
    this.changed();
  }
  setCourse(id) {
    if (!this.isHost) return;
    this.course = id;
    this.changed();
  }
  setMode(mode) {
    if (!this.isHost) return;
    this.mode = mode === 'tag' ? 'tag' : 'race';
    this.changed();
  }
  setCar(car, livery) {
    const me = this.me();
    if (me) {
      me.car = car;
      me.livery = livery;
    }
    if (this.isHost) this.changed();
    else {
      this.t.send(null, { t: 'car', car, livery });
      this.onChange();
    }
  }
  // Host: the grid, humans first then AI rivals in unused craft, and everyone builds the same race from it.
  start() {
    if (!this.isHost) return;
    const slots = this.players.map((p) => ({ slot: p.slot, human: true, name: p.name, car: p.car, livery: p.livery }));
    const taken = new Set(slots.map((s) => s.car));
    const pool = CARS.filter((c) => !c.secret && !taken.has(c.id));
    const field = Math.max(slots.length, FIELD[this.mode] || 6);
    for (let s = 0, k = 0; slots.length < field; s++) {
      if (slots.some((x) => x.slot === s)) continue;
      const n = k++;
      const car = (pool[n % pool.length] || CARS[0]).id;
      // (a second lap of the pool, in a big room: the same craft in another paint, so the two can be told apart)
      slots.push({ slot: s, human: false, car, livery: n >= pool.length ? { paint: ALT_PAINT[n % ALT_PAINT.length] } : null });
    }
    // humans at the back of the grid, like the offline player
    slots.sort((a, b) => (a.human === b.human ? a.slot - b.slot : a.human ? 1 : -1));
    const cfg = { course: this.course, mode: this.mode, slots, seed: Math.random() };
    this.t.broadcast({ t: 'start', cfg });
    this.begin(cfg);
    this.goTimer = setTimeout(() => this.go(), 9000);
  }
  maybeGo() {
    if (!this.isHost || !this.racing || this.wentGo) return;
    const humans = this.players.filter((p) => p.slot !== this.mySlot);
    if (humans.every((p) => this.ready.has(p.slot))) this.go();
  }
  go() {
    if (!this.racing || this.wentGo) return;
    this.wentGo = true;
    clearTimeout(this.goTimer);
    this.t.broadcast({ t: 'go' });
    if (this.app.race) this.app.race.netGo = true;
  }
  takeShard(i) {
    const sh = this.app.race?.world.shards[i];
    if (!sh) return;
    sh.taken = 5;
    sh.root.visible = false;
    this.t.broadcast({ t: 'taken', i });
  }
  backToLobby() {
    if (!this.isHost) return;
    this.t.broadcast({ t: 'lobby-return' });
    this.toLobby();
  }

  // ------------------------------------------------------------------ client side
  clientMessage(m) {
    if (!m || typeof m !== 'object') return;
    if (this.tagMessage(m)) return;
    switch (m.t) {
      case 'welcome':
        this.mySlot = m.slot;
        break;
      case 'refused':
        this.onError(new Error(m.why || 'The host refused'));
        this.close();
        this.app.netLeft?.(m.why);
        break;
      case 'lobby':
        this.players = m.players;
        this.course = m.course;
        this.mode = m.mode || 'race';
        this.code = m.code;
        this.onChange();
        break;
      case 'start':
        this.begin(m.cfg);
        this.t.send(null, { t: 'ready' });
        break;
      case 'go':
        if (this.app.race) this.app.race.netGo = true;
        break;
      case 'snap':
        for (const [slot, d] of m.r) if (slot !== this.mySlot) this.push(slot, d);
        break;
      case 'taken': {
        const sh = this.app.race?.world.shards[m.i];
        if (sh) {
          sh.taken = 5;
          sh.root.visible = false;
        }
        break;
      }
      case 'lobby-return':
        this.toLobby();
        break;
    }
  }
  hostLost() {
    if (!this.t) return;
    this.close();
    this.app.netLeft?.('The host left the room');
  }

  // ------------------------------------------------------------------ racing
  begin(cfg) {
    this.racing = true;
    this.wentGo = false;
    this.ready = new Set();
    this.buffers.clear();
    this.latest.clear();
    this.app.startOnline(cfg, this.mySlot, this.isHost);
  }
  toLobby() {
    this.racing = false;
    this.app.onlineLobby();
  }
  shard(i) {
    if (this.isHost) this.takeShard(i);
    else this.t?.send(null, { t: 'shard', i });
  }
  push(slot, d) {
    let b = this.buffers.get(slot);
    if (!b) this.buffers.set(slot, (b = []));
    b.push({ at: performance.now() / 1000, d });
    if (b.length > 30) b.shift();
  }
  // Called every frame after the race steps: send our state, and on the host relay everyone's.
  tick(dt, race) {
    if (!this.t || !race?.online) return;
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 1 / SEND_RATE;
    if (this.isHost) {
      const r = [];
      for (const x of race.racers) {
        if (!x.puppet) r.push([x.slot, pack(x)]);
        else if (this.latest.has(x.slot)) r.push([x.slot, this.latest.get(x.slot)]);
      }
      this.t.broadcast({ t: 'snap', r }, false);
    } else {
      this.t.send(null, { t: 'st', d: pack(race.player) }, false);
    }
  }
  // Draw every puppet where its owner had it INTERP seconds ago.
  applyPuppets(race) {
    if (!race.online) return;
    const now = performance.now() / 1000 - INTERP;
    for (const r of race.racers) {
      if (!r.puppet) continue;
      const b = this.buffers.get(r.slot);
      if (!b || !b.length) continue;
      let i = b.length - 1;
      while (i > 0 && b[i - 1].at > now) i--;
      const B = b[i];
      const A = b[i - 1] || B;
      let k = A === B ? 1 : (now - A.at) / (B.at - A.at);
      const ext = Math.min(0.25, Math.max(0, now - B.at)); // a little extrapolation when updates are late
      k = Math.max(0, Math.min(1, k));
      const a = A.d;
      const d = B.d;
      const L = (j) => a[j] + (d[j] - a[j]) * k;
      r.pos.set(L(0) + d[4] * ext, L(1) + d[5] * ext, L(2) + d[6] * ext);
      let dy = d[3] - a[3];
      if (dy > Math.PI) dy -= Math.PI * 2;
      if (dy < -Math.PI) dy += Math.PI * 2;
      const flags = d[9];
      // a SWITCHBACK between the two updates: jump to the new facing and play the spin, rather than turn through it
      if (flags & F.twist && Math.abs(dy) > 2) {
        r.yaw = d[3];
        if (!(r.twistT > 0)) r.switchback(true);
      } else r.yaw = a[3] + dy * k;
      r.vel.set(d[4], d[5], d[6]);
      r.speed = d[7];
      if (r.mode !== d[8]) r.shiftT = 0.35;
      r.mode = d[8];
      r.grounded = !!(flags & F.grounded);
      r.drift.active = !!(flags & F.drift);
      r.drift.dir = d[14];
      r.drift.level = d[15];
      r.boostTime = flags & F.boost ? 0.1 : 0;
      r.root.visible = !(flags & F.hidden);
      r.respawnT = flags & F.hidden ? 0.1 : 0;
      r.prog = d[10];
      r.lap = d[11];
      if (flags & F.finished && !r.finished) {
        r.finished = true;
        r.finishTime = d[12];
      }
      r.bestLap = d[13] || Infinity;
      r.energy = d[18];
      const ny = Math.sqrt(Math.max(0, 1 - d[16] * d[16] - d[17] * d[17]));
      r.gnd.nx = d[16];
      r.gnd.ny = ny;
      r.gnd.nz = d[17];
    }
  }
}

const validCar = (id) => (CARS.some((c) => c.id === id) ? id : 'vector');
export const courseName = (id) => TRACKS.find((t) => t.id === id)?.name || id;
