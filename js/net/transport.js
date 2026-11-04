// Ported from Absurd Combat Racing.
// Network transports for online play. Both expose the same small API:
//   host:   await t.host(code)  -> t.onJoin(id), t.onLeave(id), t.onMessage(id, msg)
//           t.send(id, msg, reliable), t.broadcast(msg, reliable)
//   client: await t.join(code)  -> t.onMessage(null, msg), t.onLeave(null)
//           t.send(null, msg, reliable)
// PeerTransport uses WebRTC data channels brokered by PeerJS. LocalTransport uses a
// BroadcastChannel so several tabs of one browser can play together (dev and automated tests).

const PREFIX = 'retro-shift-';

// ICE servers for WebRTC. Public STUN finds each player's address, which is enough for most
// home networks. Players behind strict NATs also need a TURN relay: set window.RETROSHIFT_ICE
// (for example from a Netlify Function that mints short-lived TURN credentials) and it is used
// in place of this list, with no other code changes.
export async function getIceServers() {
  if (Array.isArray(window.RETROSHIFT_ICE)) return window.RETROSHIFT_ICE;
  if (typeof window.RETROSHIFT_ICE === 'function') {
    try {
      const list = await window.RETROSHIFT_ICE();
      if (Array.isArray(list) && list.length) return list;
    } catch (err) {
      console.warn('RETRO SHIFT: custom ICE lookup failed, using STUN only', err);
    }
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
}

// Room codes avoid look-alike letters (no I/O/0/1).
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRoomCode(n = 4) {
  let s = '';
  for (let i = 0; i < n; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}
export function cleanCode(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

class Base {
  constructor() {
    this.onJoin = () => {};
    this.onLeave = () => {};
    this.onMessage = () => {};
    this.onError = () => {};
    this.closed = false;
  }
}

// ------------------------------------------------------------------ PeerJS / WebRTC
let peerLib = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLib) return peerLib;
  peerLib = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../../vendor/peerjs.min.js', import.meta.url).href;
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS failed to load')));
    s.onerror = () => reject(new Error('Could not load the networking library'));
    document.head.appendChild(s);
  });
  return peerLib;
}

// Options for a self-hosted PeerJS server: ?peerhost=example.com&peerport=443&peerpath=/
function peerServerOptions() {
  const q = new URLSearchParams(location.search);
  const host = q.get('peerhost');
  if (!host) return {};
  return { host, port: +(q.get('peerport') || 443), path: q.get('peerpath') || '/', secure: q.get('peersecure') !== '0' };
}

// A closed browser doesn't always fire the data channel's 'close', so joiners ping and the host
// drops anyone silent for this long.
const PEER_TIMEOUT = 15000;
const PING = '__ping';

export class PeerTransport extends Base {
  constructor() {
    super();
    this.links = new Map(); // id -> { r: reliable conn, u: unreliable conn }
    this.seen = new Map();
  }

  async open(id) {
    const Peer = await loadPeerJS();
    const iceServers = await getIceServers();
    return new Promise((resolve, reject) => {
      const peer = new Peer(id, { ...peerServerOptions(), config: { iceServers }, debug: 1 });
      this.peer = peer;
      const fail = (err) => {
        this.onError(err);
        reject(err);
      };
      peer.once('open', () => {
        peer.off('error', fail);
        peer.on('error', (err) => this.onError(err));
        resolve(peer);
      });
      peer.once('error', fail);
      peer.on('disconnected', () => {
        // Lost the broker; existing data channels keep working. Reconnect for new joiners.
        if (!this.closed) setTimeout(() => !this.closed && peer.reconnect?.(), 1000);
      });
    });
  }

  async host(code) {
    this.role = 'host';
    await this.open(PREFIX + code);
    this.watchdog = setInterval(() => {
      const now = performance.now();
      for (const id of this.links.keys()) if (now - (this.seen.get(id) || 0) > PEER_TIMEOUT) this.drop(id);
    }, 2000);
    this.peer.on('connection', (conn) => {
      const id = conn.metadata?.id || conn.peer;
      const kind = conn.label?.endsWith(':u') ? 'u' : 'r';
      conn.on('open', () => {
        const link = this.links.get(id) || {};
        link[kind] = conn;
        this.links.set(id, link);
        this.seen.set(id, performance.now());
        if (kind !== 'r') return;
        const pc = conn.peerConnection;
        pc?.addEventListener?.('iceconnectionstatechange', () => {
          if ((pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') && this.links.get(id)?.r === conn) this.drop(id);
        });
        this.onJoin(id);
      });
      conn.on('data', (msg) => {
        this.seen.set(id, performance.now());
        if (msg?.t !== PING) this.onMessage(id, msg);
      });
      conn.on('close', () => {
        if (kind !== 'r') return;
        const link = this.links.get(id);
        if (!link || link.r !== conn) return;
        link.u?.close();
        this.links.delete(id);
        this.onLeave(id);
      });
      conn.on('error', () => {});
    });
  }

  async join(code) {
    this.role = 'client';
    await this.open(undefined);
    const target = PREFIX + code;
    const meta = { id: this.peer.id };
    return new Promise((resolve, reject) => {
      const r = this.peer.connect(target, { reliable: true, serialization: 'json', label: `${this.peer.id}:r`, metadata: meta });
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error('No room with that code answered'));
      }, 12000);
      this.peer.on('error', (err) => {
        if (done) return;
        if (err?.type === 'peer-unavailable') {
          done = true;
          clearTimeout(timer);
          reject(new Error('No room with that code'));
        }
      });
      r.on('open', () => {
        const u = this.peer.connect(target, { reliable: false, serialization: 'json', label: `${this.peer.id}:u`, metadata: meta });
        u.on('data', (msg) => this.onMessage(null, msg));
        u.on('error', () => {});
        this.links.set(null, { r, u });
        this.pinger = setInterval(() => this.send(null, { t: PING }), 2000);
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      });
      r.on('data', (msg) => this.onMessage(null, msg));
      r.on('close', () => {
        if (!this.closed) this.onLeave(null);
      });
      r.on('error', () => {});
    });
  }

  send(id, msg, reliable = true) {
    const link = this.links.get(id);
    if (!link) return;
    const c = !reliable && link.u?.open ? link.u : link.r;
    if (c?.open) {
      try {
        c.send(msg);
      } catch {
        // A channel closing mid-send is reported through 'close'.
      }
    }
  }

  broadcast(msg, reliable = true) {
    for (const id of this.links.keys()) this.send(id, msg, reliable);
  }

  kick(id) {
    const link = this.links.get(id);
    link?.r?.close();
    link?.u?.close();
    this.links.delete(id);
  }

  // Host: a joiner went silent or its connection failed.
  drop(id) {
    if (!this.links.has(id)) return;
    this.kick(id);
    this.seen.delete(id);
    this.onLeave(id);
  }

  close() {
    this.closed = true;
    clearInterval(this.watchdog);
    clearInterval(this.pinger);
    for (const link of this.links.values()) {
      link.r?.close();
      link.u?.close();
    }
    this.links.clear();
    this.peer?.destroy();
  }
}

// ------------------------------------------------------------------ BroadcastChannel (same browser)
// Messages are structured-cloned, so they match what JSON over WebRTC delivers. An optional
// artificial delay (?netlag=80, one way, in ms) helps test prediction and interpolation.
export class LocalTransport extends Base {
  constructor() {
    super();
    this.id = Math.random().toString(36).slice(2, 10);
    this.peers = new Set();
    this.lag = +(new URLSearchParams(location.search).get('netlag') || 0);
  }

  channel(code) {
    this.ch = new BroadcastChannel(PREFIX + code);
    this.ch.onmessage = (e) => {
      const m = e.data;
      if (!m || !(m.to === this.id || (m.to === '*' && this.role === 'host'))) return;
      const deliver = () => this.receive(m);
      if (this.lag) setTimeout(deliver, this.lag);
      else deliver();
    };
    this.alive = setInterval(() => this.post(null, { k: 'ping' }), 1000);
  }

  post(to, body) {
    if (this.closed) return;
    const targets = to === null ? [...this.peers] : [to];
    for (const t of targets) this.ch.postMessage({ from: this.id, to: t, ...body });
  }

  receive(m) {
    if (this.closed) return;
    if (m.k === 'hello' && this.role === 'host') {
      if (!this.peers.has(m.from)) {
        this.peers.add(m.from);
        this.post(m.from, { k: 'welcome' });
        this.seen.set(m.from, performance.now());
        this.onJoin(m.from);
      }
      return;
    }
    if (m.k === 'welcome' && this.role === 'client') {
      this.hostId = m.from;
      this.peers.add(m.from);
      this.seen.set(m.from, performance.now());
      this.joined?.();
      return;
    }
    if (!this.peers.has(m.from)) return;
    this.seen.set(m.from, performance.now());
    if (m.k === 'bye') return this.drop(m.from);
    if (m.k === 'msg') this.onMessage(this.role === 'host' ? m.from : null, m.msg);
  }

  drop(id) {
    if (!this.peers.delete(id)) return;
    this.onLeave(this.role === 'host' ? id : null);
  }

  watch() {
    this.seen = new Map();
    this.watchdog = setInterval(() => {
      const now = performance.now();
      for (const [id, t] of this.seen) if (now - t > 20000 && this.peers.has(id)) this.drop(id);
    }, 1000);
  }

  async host(code) {
    this.role = 'host';
    this.watch();
    this.channel(code);
  }

  async join(code) {
    this.role = 'client';
    this.watch();
    this.channel(code);
    await new Promise((resolve, reject) => {
      // Hosts accept hellos addressed to '*'; repeat until one answers.
      const hello = () => this.ch.postMessage({ from: this.id, to: '*', k: 'hello' });
      hello();
      const iv = setInterval(hello, 400);
      const to = setTimeout(() => {
        clearInterval(iv);
        reject(new Error('No room with that code'));
      }, 5000);
      this.joined = () => {
        this.joined = null;
        clearInterval(iv);
        clearTimeout(to);
        resolve();
      };
    });
  }

  send(id, msg) {
    this.post(this.role === 'host' ? id : this.hostId, { k: 'msg', msg });
  }
  broadcast(msg) {
    this.post(null, { k: 'msg', msg });
  }
  kick(id) {
    this.post(id, { k: 'bye' });
    this.peers.delete(id);
  }
  close() {
    if (this.closed) return;
    this.post(null, { k: 'bye' });
    this.closed = true;
    clearInterval(this.alive);
    clearInterval(this.watchdog);
    this.ch?.close();
  }
}

export function createTransport() {
  const q = new URLSearchParams(location.search);
  return q.get('net') === 'local' ? new LocalTransport() : new PeerTransport();
}
