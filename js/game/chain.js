// SHIFT CHAIN and PERFECT SHIFT: the lens as a skill you string together.
//
// Every lens move (phasing a wall, a lens-only road, a wall-run, a glide, a slit, a lens pad, a launcher, a
// takedown) is a link. Links inside a few seconds of each other build a chain, and the chain's multiplier pays out
// on every link: SHIFT back, and from x2 a boost that grows with it. A road that holds your lens holds the chain too
// (a lens road, a wall-run, a glide, a launcher's flight), so a long secret route never breaks it. A crash, a wreck or
// a fall breaks it; letting the window run out just ends it.
//
// A shift just before a lens feature (a wall, a lens pad, a launcher, the lip of a lens road) is a PERFECT SHIFT: a
// bigger boost, a flash and a kick in the pad. Close is still good (CLOSE PHASE); early just gets you through.
//
// Race.onMove(r, kind, data) is where every move lands (game/events.js listens there too); kinds: perfect, phase,
// lensRoute, wallRun, glide, slit, pad, launch, takedown, drift, shard.

import { BOTH, RED } from '../world/shift.js';

export const CHAIN = {
  window: 4.5, // seconds to the next link before the chain lets go
  max: 8, // the multiplier tops out here
  repeat: 0.9, // the same move again this soon only keeps the chain alive (a block field is one link, not six)
};
// how soon before the feature the shift has to land
export const TIMING = { perfect: 0.24, close: 0.55 };

const TIMED = new Set(['PERFECT SHIFT', 'CLOSE PHASE', 'TAKEDOWN']);

export function newChain() {
  return { n: 0, t: 0, label: '', at: -9, best: 0, chains: 0 };
}

// What a move is worth to the chain: the name it shows as a link, or null for a move that only keeps it alive.
function linkOf(kind, d) {
  // (a feature hit with a PERFECT SHIFT reports the PERFECT first; that's the link)
  if (d.perfect) return null;
  switch (kind) {
    case 'perfect':
      return 'PERFECT SHIFT';
    case 'phase':
      return d.close ? 'CLOSE PHASE' : 'PHASE';
    case 'lensRoute':
      return d.mask === RED ? 'RED ROUTE' : 'BLUE ROUTE';
    case 'wallRun':
      return 'WALL RUN';
    case 'glide':
      return 'GLIDE';
    case 'slit':
      return 'SLIT';
    case 'pad':
      return d.lens ? 'LENS PAD' : null;
    case 'launch':
      return 'LAUNCH';
    case 'takedown':
      return 'TAKEDOWN';
    default:
      return null;
  }
}

// Called from Race.onMove. Returns the chain's length after the move.
export function chainMove(race, r, kind, d) {
  const c = (r.chain ||= newChain());
  const label = linkOf(kind, d);
  if (!label) {
    // drifts, shards, plain pads and the second half of a PERFECT keep a running chain going
    if (c.n > 0) c.t = CHAIN.window;
    return c.n;
  }
  c.t = CHAIN.window;
  // (a timed shift can't be repeated without shifting again, and a takedown is a takedown)
  if (label === c.label && race.t - c.at < CHAIN.repeat && !TIMED.has(label)) return c.n;
  c.n++;
  c.label = label;
  c.at = race.t;
  c.best = Math.max(c.best, c.n);
  if (c.n === 3) c.chains++;
  const m = Math.min(c.n, CHAIN.max);
  // the payout, for the people driving (the rivals' pace is tuned without it)
  if (r.isPlayer) {
    r.energy = Math.min(1, r.energy + 0.02 * m);
    if (m >= 2) r.giveBoost(0.25 + 0.07 * m, 1.1 + 0.025 * m);
    race.emitP(r, 'chain', { n: c.n, m, label });
    const A = race.app.audio;
    A.play('chain', m);
    // the announcer calls the big ones
    const call = { 3: 'chain3', 5: 'chain5', 8: 'chain8' }[c.n];
    if (call && race.t - (r.calledT ?? -9) > 2.5) {
      r.calledT = race.t;
      A.announce(call, 0.1, 0.9, true);
    }
  }
  return c.n;
}

// The window runs down, except on a road that holds your lens, in a glide, or in a launcher's flight.
export function chainTick(race, r, dt) {
  const c = r.chain;
  if (!c || c.n === 0) return;
  if (r.lensRoadT > 0 || r.gliding || r.launch) return;
  c.t -= dt;
  if (c.t <= 0) chainEnd(race, r, false);
}

// A crash, a wreck or a fall: the chain breaks (keeping a short one isn't worth a word).
export function chainEnd(race, r, broke = true) {
  const c = r.chain;
  if (!c || c.n === 0) return;
  const n = c.n;
  c.n = 0;
  c.t = 0;
  c.label = '';
  if (!r.isPlayer) return;
  race.emitP(r, 'chainEnd', { n, broke });
  if (n >= 2) race.app.audio.play(broke ? 'chainBreak' : 'chainEnd', n);
}

// How well the last shift was timed for a lens feature reached right now: 'perfect', 'close' or null. A shift pays
// once: the first feature it meets uses it up.
export function shiftTiming(race, r) {
  const dt = race.t - (r.lastShiftT ?? -9);
  if (dt > TIMING.close) return null;
  r.lastShiftT = -9;
  return dt <= TIMING.perfect ? 'perfect' : 'close';
}

// The PERFECT SHIFT payoff on top of the feature's own: a flash at the edge of the view, a kick in the pad, a punch
// of the camera, and now and then the announcer.
export function perfectFx(race, r) {
  if (!r.isPlayer) return;
  race.emitP(r, 'perfect', { mode: r.mode });
  race.emitP(r, 'popup', { text: 'PERFECT SHIFT', color: '#ffffff' });
  race.app.audio.play('perfect', r.mode);
  race.app.input.rumble(r.pIndex || 0, 0.45, 0.9, 170);
  race.camOf(r).fovPunch(11);
  race.camOf(r).addShake(0.2);
  race.aberr = Math.max(race.aberr || 0, 0.8);
  // (the call is a treat: the first one, then now and then; and when this shift makes the chain x3, x5 or x8, the
  // chain gets the call instead)
  const milestone = [3, 5, 8].includes((r.chain?.n || 0) + 1);
  if (!milestone && race.t - (r.perfectCallT ?? -99) > 12 && (!r.perfectCalled || Math.random() < 0.4) && race.app.audio.announce('perfect', 0.05, 0.9, true) > 0) {
    r.perfectCallT = race.t;
    r.perfectCalled = true;
  }
}

// What the results screen tells: one per racer.
export function newTally() {
  return { perfect: 0, close: 0, phased: 0, routes: 0, wallRuns: 0, glides: 0, slits: 0, takedowns: 0, lens: { [BOTH]: 0, 2: 0, 4: 0 } };
}
