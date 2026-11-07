// SHIFT TOUR: thirty events across the ten courses, five legs of six, and a finale. Each event is a def for the
// event runner (events.js) with a twist: a lens locked out, a form route you have to take, a storm, the police, a
// rival to beat head to head, a speed you can't drop under, a quota of takedowns, drift turbos or chain links.
// The runner's three medal tiers are the event's stars. Stars open the next leg, and paint and cars (modes.js).
//
// Times are tuned against the autopilot (the AI at full skill, which never drifts) driving the event: three stars
// about 3% over its time, two stars about 15% over, one star about 40% over. Counts were tried with the autopilot
// taught a habit (drifting every bend, ramming, phasing a field): one star is what a careful first run gets, three is
// a run that means it, and none asks for everything a lap has.

import { trackById } from '../world/tracks.js';
import { BOTH, RED, BLUE, solidIn } from '../world/shift.js';
import { registerTwist } from './events.js';
import { driverOf } from './story.js';
import { ordinal } from '../core/util.js';

const wrap = (u) => ((u % 1) + 1) % 1;
const branch = (id, label) => trackById(id).branches.find((b) => b.label === label);
// a strip from just before a route's fork to just after it rejoins
const around = (id, label, before = 0.03, after = 0.02) => {
  const b = branch(id, label);
  return { from: wrap(b.from - before), to: wrap(b.to + after) };
};
const KMH = (k) => k / 3.6; // the runner's speeds are metres a second
// a duel's first star is the win itself, whatever the clock says
export const WIN = 600;

// ------------------------------------------------------------------ twists
// The longest chain this run (the HUD shows the one running now).
registerTwist('chainBest', {
  update(race, ev) {
    const n = race.player.chain?.n || 0;
    if (n > (ev.counts.chain || 0)) ev.counts.chain = n;
    // (the panel shows the best; the one running now, when it's a fresh one under it)
    ev.note = n > 1 && n < ev.counts.chain ? `NOW ×${n}` : '';
  },
});

// The world a route belongs to: RED or BLUE for a road only one lens drives or a form route, BOTH for one open to all.
function routeLens(ai, b) {
  const form = ai.formOf(b);
  if (form) return form;
  for (let i = 0; i < b.N; i++) if (!solidIn(b.mask[i], BOTH)) return solidIn(b.mask[i], RED) ? RED : BLUE;
  return BOTH;
}

// One rival, the same finish line: get there first. (The rival starts a length ahead, like a grid slot.) skill is
// how cleanly the rival drives, pace a share of its top speed (on top of the RIVALS setting's), and routes the ones
// it takes: 'none' (VEX drives the Grid like it never split), or one world's, every time it can hold the lens.
registerTwist('duel', {
  start(race, ev) {
    const p = race.player;
    ev.rival = race.racers.find((r) => r !== p) || null;
    if (!ev.rival) return;
    const tw = ev.def.twist;
    const ai = ev.rival.ai;
    if (ai) {
      ai.skill = tw.skill ?? 0.9;
      const lens = { red: RED, blue: BLUE }[tw.routes];
      if (tw.routes) ai.wantsBranch = (b) => !!lens && routeLens(ai, b) === lens && ai.canTakeBranch(b);
    }
    ev.rival.speedMul *= tw.pace ?? 1;
    ev.rivalName = driverOf(ev.rival.car.id)?.name || ev.rival.name;
  },
  update(race, ev) {
    const r = ev.rival;
    if (!r) return;
    const p = race.player;
    const laps = ev.def.laps ?? 1;
    const lapLen = race.world.main.length || 1000;
    const gap = Math.round((p.prog - r.prog) * lapLen);
    ev.note = gap >= 0 ? `${gap} M AHEAD OF ${ev.rivalName}` : `${-gap} M BEHIND ${ev.rivalName}`;
    if (r.lap >= laps) {
      ev.reason = `${ev.rivalName} WON`;
      return 'fail';
    }
  },
});

// A finishing place: the count is the rivals behind you, and only at the line (so a lead mid-race can't end it).
registerTwist('place', {
  start(race, ev) {
    // (an event can set how well every rival drives: the finale's drive at their best)
    const skill = ev.def.twist.skill;
    if (skill) for (const r of race.racers) if (r !== race.player && r.ai) r.ai.skill = skill;
  },
  update(race, ev) {
    const p = race.player;
    const rivals = race.racers.filter((r) => r !== p);
    const ahead = rivals.filter((r) => r.prog > p.prog).length;
    const laps = ev.def.laps ?? 1;
    ev.display = `${ordinal(ahead + 1)}`;
    ev.note = `LAP ${Math.min(laps, p.lap + 1)}/${laps}`;
    if (p.lap >= laps) ev.counts.beaten = rivals.length - ahead;
  },
});

// Drift turbos fired from the RED stage or the PRISM stage (a tap of drift fires a BLUE one, and that's not a show).
registerTwist('drift2', {
  start(race, ev) {
    const turbo = race.onMiniTurbo.bind(race);
    race.onMiniTurbo = (r, lvl) => {
      turbo(r, lvl);
      if (r === race.player && lvl >= 2 && !ev.done) ev.bump('turbo2');
    };
  },
});

// SHIFT never runs out (FULL SPECTRUM, RED SHIFT): the lens rule does the rest.
registerTwist('endless', {
  update(race) {
    race.player.energy = 1;
  },
});

// A speed floor (the rule is the runner's minSpeed): the HUD warns as you drop, and a crash buys a few seconds.
registerTwist('floor', {
  update(race, ev, dt) {
    const p = race.player;
    const floor = ev.def.rules.minSpeed;
    if (p.respawnT > 0 || p.spinTime > 0) ev.graceT = 3;
    ev.graceT = Math.max(0, (ev.graceT || 0) - dt);
    if (ev.graceT > 0) ev.slowT = 0;
    const under = p.speed < floor && ev.t > 3;
    ev.note = ev.graceT > 0 ? 'GET BACK UP TO SPEED' : under ? `UNDER ${Math.round(floor * 3.6)}!` : `FLOOR ${Math.round(floor * 3.6)} KM/H`;
    ev.warn = under && ev.graceT <= 0;
  },
});

// The race around you, for an event with rivals that isn't about the place: just say where you are.
const packNote = (race, ev) => {
  const p = race.player;
  const ahead = race.racers.filter((r) => r !== p && r.prog > p.prog).length;
  const laps = ev.def.laps ?? 1;
  ev.note = `${ordinal(ahead + 1)} · LAP ${Math.min(laps, p.lap + 1)}/${laps}`;
};
// A takedown quota: the rivals' hulls are worn (race.js: no grace hit, no patching up), so every hit you land
// stays landed and the hits add up to a takedown.
registerTwist('quota', {
  start(race) {
    for (const r of race.racers) if (r !== race.player) r.worn = true;
  },
  update: packNote,
});

// ------------------------------------------------------------------ the legs
export const LEGS = [
  { name: 'FIRST LIGHT', stars: 0, color: '#ff4fd8', blurb: 'Six events on the first courses of the split. Each one bends a single rule.' },
  { name: 'SIGNAL', stars: 4, color: '#ff2a4a', blurb: 'The rivals start paying attention: a duel, the traffic, and your first takedowns.' },
  { name: 'INTERFERENCE', stars: 10, color: '#1e8cff', blurb: 'The courses fight back: storms, road works, and a wall only the Blade can ride.' },
  { name: 'STATIC', stars: 18, color: '#6ae0ff', blurb: 'The police, two storms at once, and a pack of rivals with nothing to lose.' },
  { name: 'THE SEAM', stars: 27, color: '#ffd04a', blurb: 'The hardest of every twist, on the courses where the split runs deepest.' },
  { name: 'FINALE', stars: 40, color: '#ffffff', blurb: 'One race. The last shift.' },
];

const lap = (extra = {}) => ({ laps: 1, start: { u: 0, speed: 25, mode: BOTH, energy: 1 }, ...extra });
const strip = (s, extra = {}) => ({ strip: s, start: { speed: 30, mode: BOTH, energy: 1 }, ...extra });

// ------------------------------------------------------------------ the events
const EVENTS = [
  // ---- FIRST LIGHT
  [
    {
      title: 'LINK UP',
      tag: 'CHAIN',
      blurb: 'Phase a wall, take a route, hit a lens pad: each move inside a few seconds of the last adds a link. Build the longest SHIFT CHAIN you can in one lap.',
      how: ['Walls, lens routes, glides, wall runs and lens pads are all links.', 'A road only your lens can see holds the chain for you.', 'A crash breaks it.'],
      course: 'core',
      ...lap(),
      goal: { kind: 'count', stat: 'chain' },
      twist: { id: 'chainBest' },
      medals: [2, 3, 5],
    },
    {
      title: 'RED LOCK',
      tag: 'LENS LOCK',
      blurb: 'BLUE is switched off. One lap of Orbital Loops with the Blade and the Pair alone.',
      how: ['Blue walls and blue blocks fall away in RED.', 'THE SLIT and the RED-ONLY ORBIT are open to you.', 'BOTH refills SHIFT for the next red stretch.'],
      course: 'orbital',
      ...lap(),
      goal: { kind: 'time' },
      rules: { lens: [BOTH, RED], maxFalls: 4 },
      lenses: [RED, BOTH],
      medals: [59, 48.5, 43.5],
    },
    {
      title: 'THE NEEDLE',
      tag: 'FORM TRIAL',
      blurb: 'Thread the RED Blade through THE SLIT in Shift Tunnels. The run only counts through the gap.',
      how: ['Take the route to THE SLIT.', 'Shift to RED: the deck halves fall away and the Blade fits.', 'Hold the middle line through the gap.'],
      course: 'tunnels',
      ...strip(around('tunnels', 'THE SLIT', 0.03, 0.02)),
      goal: { kind: 'reach', time: 40 },
      rules: { need: 'route.slit', maxFalls: 3 },
      medals: [10, 8.2, 7.3],
    },
    {
      title: 'METEOR LANE',
      tag: 'STORM CHASER',
      blurb: 'A meteor storm hangs over the RED OVERPASS on Layered Grid. Take the overpass anyway and dodge what falls.',
      how: ['Shift to RED before the fork: the overpass is only there in RED.', 'Rings on the road mark where a meteor will land: steer out of them.', 'A hit costs hull and speed, not the run.'],
      course: 'layered',
      ...strip(around('layered', 'RED OVERPASS', 0.03, 0.02)),
      hazards: true,
      goal: { kind: 'reach', time: 40 },
      rules: { need: 'lensRoute', maxFalls: 3 },
      medals: [13, 10.6, 9.5],
    },
    {
      title: 'FLOOR IT',
      tag: 'SPEED FLOOR',
      blurb: 'Keep a whole lap of Core Circuit above 110 KM/H. Drop under it for more than two seconds and the run is over.',
      how: ['RED is the fastest form: use it on the straights.', 'Drift the tight corners instead of braking.', 'After a crash you get a few seconds to get back up to speed.'],
      course: 'core',
      ...lap({ start: { u: 0, speed: 34, mode: BOTH, energy: 1 } }),
      goal: { kind: 'time' },
      rules: { minSpeed: KMH(110) },
      twist: { id: 'floor' },
      medals: [35, 27, 24],
    },
    {
      title: 'SLIDE SHOW',
      tag: 'DRIFT ZONE',
      blurb: 'Score drift turbos round Layered Grid, and only the big ones count: hold each drift until its sparks turn RED.',
      how: ['Hold DRIFT and steer into the corner: the sparks go BLUE, then RED, then PRISM.', 'Let go on RED or PRISM to score it.', 'BLUE charges a drift faster.'],
      course: 'layered',
      ...lap(),
      goal: { kind: 'count', stat: 'turbo2' },
      twist: { id: 'drift2' },
      medals: [3, 6, 9],
    },
  ],
  // ---- SIGNAL
  [
    {
      title: 'VEX’S LINE',
      tag: 'DUEL',
      blurb: 'VEX raced the Grid before it split and still drives it like it never did: no lens roads, no shortcuts. One lap of Core Circuit: beat VEX to the line.',
      how: ['VEX takes no shortcuts. You can.', 'The BLUE SHORTCUT and the GLIDE GAP are yours.', 'Lose the race and the run is over.'],
      course: 'core',
      laps: 1,
      start: { u: 0, speed: 0, mode: BOTH, energy: 1 },
      rivals: 1,
      rivalCars: ['vector'],
      goal: { kind: 'time' },
      twist: { id: 'duel', skill: 0.8, routes: 'none' },
      medals: [WIN, 27.5, 24.5],
    },
    {
      title: 'RUSH HOUR',
      tag: 'HEAVY TRAFFIC',
      blurb: 'Grid City at rush hour. One lap through the traffic.',
      how: ['Every car lives in one world: shift and half of them turn to ghosts.', 'The RED SKYBRIDGE and the BLUE FLYOVER skip the worst of it.', 'Rear-ending a truck costs hull.'],
      course: 'city',
      ...lap(),
      hazards: true,
      goal: { kind: 'time' },
      medals: [44, 36.5, 32.5],
    },
    {
      title: 'BLUE LOCK',
      tag: 'LENS LOCK',
      blurb: 'RED is switched off. One lap of Layered Grid with the Skimmer and the Pair alone.',
      how: ['Red walls and red blocks fall away in BLUE.', 'The BLUE-ONLY CUT and the GLIDE GAP are open to you.', 'BOTH refills SHIFT for the next blue stretch.'],
      course: 'layered',
      ...lap(),
      goal: { kind: 'time' },
      rules: { lens: [BOTH, BLUE], maxFalls: 4 },
      lenses: [BOTH, BLUE],
      medals: [50, 41, 36.5],
    },
    {
      title: 'KNOCKOUT',
      tag: 'TAKEDOWN QUOTA',
      blurb: 'Five rivals, two laps of Orbital Loops, and a gate of prisms every lap. Take them down.',
      how: ['Ram a rival hard from behind, or run one through with the Blade’s LANCE.', 'Their hulls are worn: no hit patches up, so the hits add up to a takedown.', 'Drive through a prism gate to roll a SEAM CHARGE, then fire it.'],
      course: 'orbital',
      laps: 2,
      start: { u: 0, speed: 20, mode: BOTH, energy: 1 },
      rivals: 5,
      charges: true,
      goal: { kind: 'count', stat: 'takedown' },
      twist: { id: 'quota' },
      medals: [1, 2, 3],
    },
    {
      title: 'FULL SPECTRUM',
      tag: 'NO BOTH',
      blurb: 'BOTH is gone, but SHIFT never runs out. One lap of Grid City in RED and BLUE alone.',
      how: ['Every wall is one shift away.', 'Swap lenses to swap forms: the Blade for speed, the Skimmer for grip.', 'Your lens button does nothing on its own here: press the other one.'],
      course: 'city',
      ...lap({ start: { u: 0, speed: 25, mode: RED, energy: 1 } }),
      goal: { kind: 'time' },
      rules: { lens: [RED, BLUE], maxFalls: 4 },
      lenses: [RED, BLUE],
      twist: { id: 'endless' },
      medals: [52, 42.5, 38],
    },
    {
      title: 'FORM TOUR',
      tag: 'FORM TRIAL',
      blurb: 'Core Circuit has a GLIDE GAP for the Skimmer and a WALL RUN for the Blade. Take every form route you can in two laps.',
      how: ['The GLIDE GAP: BLUE, and keep your speed off the lip.', 'The WALL RUN: RED, and keep the throttle down.', 'A route counts once you’re out the far end.'],
      course: 'core',
      laps: 2,
      start: { u: 0, speed: 25, mode: BOTH, energy: 1 },
      goal: { kind: 'count', stat: 'route' },
      medals: [2, 3, 4],
    },
  ],
  // ---- INTERFERENCE
  [
    {
      title: 'WALL RIDER',
      tag: 'FORM TRIAL',
      blurb: 'Ride Helix Ascent’s wall run on the run home. Only the RED Blade clings to it.',
      how: ['Shift to RED before the wall: only the Blade holds on.', 'Keep the throttle down. Speed keeps you up there.', 'A boost waits on the way out.'],
      course: 'helix',
      ...strip(around('helix', 'WALL RUN', 0.03, 0.02)),
      goal: { kind: 'reach', time: 40 },
      rules: { need: 'route.wallRun', maxFalls: 3 },
      medals: [7.3, 6, 5.4],
    },
    {
      title: 'LIGHTNING ROD',
      tag: 'STORM CHASER',
      blurb: 'A lightning storm sits over Helix Ascent’s BLUE DROP. Take the drop anyway.',
      how: ['Shift to BLUE before the fork: the drop is only there in BLUE.', 'Rings on the road mark where a bolt will land: steer out of them.', 'The drop holds BLUE for you, with no SHIFT drain.'],
      course: 'helix',
      ...strip(around('helix', 'BLUE DROP', 0.03, 0.02)),
      hazards: true,
      goal: { kind: 'reach', time: 50 },
      rules: { need: 'lensRoute', maxFalls: 3 },
      medals: [20, 13, 11.5],
    },
    {
      title: 'NIGHT SHIFT',
      tag: 'ROAD WORKS',
      blurb: 'The road crew is out on Fractal Route, and it moves to a new stretch every lap. Two laps.',
      how: ['RED clears the blue barriers: the left lane is yours.', 'BLUE clears the red cones and the digger: the right lane is yours.', 'The sign before the works says which is which.'],
      course: 'fractal',
      laps: 2,
      start: { u: 0, speed: 25, mode: BOTH, energy: 1 },
      hazards: true,
      goal: { kind: 'time' },
      medals: [120, 100, 89],
    },
    {
      title: 'PHASE DANCER',
      tag: 'PHASE',
      blurb: 'Void Field’s block fields are full of red and blue blocks. Phase through as many as you can in one lap.',
      how: ['A red block is gone in BLUE, a blue block in RED.', 'Shift at the last moment for a CLOSE PHASE.', 'In BOTH every block is solid.'],
      course: 'void',
      ...lap(),
      goal: { kind: 'count', stat: 'phase' },
      medals: [3, 6, 10],
    },
    {
      title: 'LINA’S RED LINE',
      tag: 'DUEL',
      blurb: 'LINA SCAN lives in the red world because it has fewer brakes. One lap of Shift Lattice, head to head.',
      how: ['LINA rides the red strands.', 'The blue ones can be faster, if you can hold them.', 'Lose the race and the run is over.'],
      course: 'lattice',
      laps: 1,
      start: { u: 0, speed: 0, mode: BOTH, energy: 1 },
      rivals: 1,
      rivalCars: ['scanline'],
      goal: { kind: 'time' },
      twist: { id: 'duel', skill: 0.8, pace: 0.88, routes: 'red' },
      medals: [WIN, 27.5, 26.5],
    },
    {
      title: 'HIGH WIRE',
      tag: 'SPEED FLOOR',
      blurb: 'Keep a whole lap of Shift Lattice above 150 KM/H.',
      how: ['The strands are fast: stay on them.', 'Drift through the bends rather than lift.', 'After a crash you get a few seconds to get back up to speed.'],
      course: 'lattice',
      ...lap({ start: { u: 0, speed: 46, mode: BOTH, energy: 1 } }),
      goal: { kind: 'time' },
      rules: { minSpeed: KMH(150) },
      twist: { id: 'floor' },
      medals: [43, 33, 29.5],
    },
  ],
  // ---- STATIC
  [
    {
      title: 'THE GETAWAY',
      tag: 'PURSUIT',
      blurb: 'The police chase tears through Void Field every lap, and you have to drive through it. Two laps.',
      how: ['The chase is only there in BOTH: hold RED or BLUE to slip through it.', 'Cruisers mark their shots with rings on the road.', 'A single lens drains SHIFT, so time it.'],
      course: 'void',
      laps: 2,
      start: { u: 0, speed: 25, mode: BOTH, energy: 1 },
      hazards: true,
      goal: { kind: 'time' },
      medals: [88, 72, 64.5],
    },
    {
      title: 'DOUBLE FRONT',
      tag: 'STORM CHASER',
      blurb: 'Two storms over Shift Lattice: meteors on the RED STRAND, lightning on the BLUE. One lap, through one of them.',
      how: ['Pick a strand at the fork: RED for the meteors, BLUE for the lightning.', 'Steer out of the rings.', 'The run only counts if you take a strand.'],
      course: 'lattice',
      ...lap(),
      hazards: true,
      goal: { kind: 'time' },
      rules: { need: 'lensRoute', maxFalls: 4 },
      medals: [43, 35.5, 31.5],
    },
    {
      title: 'PRISM DRIFT',
      tag: 'DRIFT ZONE',
      blurb: 'Hold a drift all the way to its third stage, the PRISM turbo. Score as many as you can in a lap of Fractal Route.',
      how: ['A long drift goes red, then blue, then prism.', 'BLUE charges faster.', 'Let go on the prism for the biggest boost in the game.'],
      course: 'fractal',
      ...lap(),
      goal: { kind: 'count', stat: 'turbo3' },
      medals: [2, 4, 6],
    },
    {
      title: 'CHAIN GANG',
      tag: 'CHAIN',
      blurb: 'Shift Lattice is all routes: four strands and two wires. Build the longest chain you can in one lap.',
      how: ['A road only your lens can see holds the chain for you.', 'Lens pads at a fork are links.', 'A crash breaks it.'],
      course: 'lattice',
      ...lap(),
      goal: { kind: 'count', stat: 'chain' },
      twist: { id: 'chainBest' },
      medals: [2, 3, 5],
    },
    {
      title: 'GRIDLOCK',
      tag: 'TAKEDOWN QUOTA',
      blurb: 'Two laps of Grid City in traffic, with five rivals. Take them down: the traffic is on your side.',
      how: ['A rival stuck behind a truck is a sitting target: ram them hard.', 'Their hulls are worn: every knock stays, and the traffic softens them up for you.', 'Shift to clear a lane of traffic for yourself.'],
      course: 'city',
      laps: 2,
      start: { u: 0, speed: 20, mode: BOTH, energy: 1 },
      rivals: 5,
      charges: true,
      hazards: true,
      goal: { kind: 'count', stat: 'takedown' },
      twist: { id: 'quota' },
      medals: [1, 2, 3],
    },
    {
      title: 'RED SHIFT',
      tag: 'LENS LOCK',
      blurb: 'Nothing but RED: the Blade, the red world, and SHIFT that never runs out. One lap of Orbital Loops.',
      how: ['Blue walls and blue blocks are ghosts to you.', 'Red blocks are not: steer round them.', 'The RED-ONLY ORBIT is the fast way round.'],
      course: 'orbital',
      ...lap({ start: { u: 0, speed: 25, mode: RED, energy: 1 } }),
      goal: { kind: 'time' },
      rules: { lens: [RED], maxFalls: 4 },
      lenses: [RED],
      twist: { id: 'endless' },
      medals: [58, 47.5, 42.5],
    },
  ],
  // ---- THE SEAM
  [
    {
      title: 'TREMOR',
      tag: 'QUAKE',
      blurb: 'Echo Ruins is shaking itself apart. One lap through the quake.',
      how: ['Fallen rock is red or blue: the other lens clears it.', 'Ripples down the road mean a tremor: hold your line.', 'Cracks spread where the next lap’s lava will be.'],
      course: 'ruins',
      ...lap(),
      hazards: true,
      goal: { kind: 'time' },
      medals: [47, 39, 35],
    },
    {
      title: 'POLLY’S GAMBIT',
      tag: 'DUEL',
      blurb: 'POLLY GONE has timed every corner of Echo Ruins. One lap, head to head.',
      how: ['POLLY rides the blue world: grip, glides and the BLUE ECHO.', 'The RED ECHO and the wall run are faster, if you can hold them.', 'Lose the race and the run is over.'],
      course: 'ruins',
      laps: 1,
      start: { u: 0, speed: 0, mode: BOTH, energy: 1 },
      rivals: 1,
      rivalCars: ['polygon'],
      goal: { kind: 'time' },
      twist: { id: 'duel', skill: 0.85, pace: 0.96, routes: 'blue' },
      medals: [WIN, 35.5, 33.5],
    },
    {
      title: 'SOUND BARRIER',
      tag: 'SPEED FLOOR',
      blurb: 'Keep a whole lap of Orbital Loops above 170 KM/H.',
      how: ['RED is the fastest form.', 'Drift the loops instead of braking.', 'After a crash you get a few seconds to get back up to speed.'],
      course: 'orbital',
      ...lap({ start: { u: 0, speed: 52, mode: BOTH, energy: 1 } }),
      goal: { kind: 'time' },
      rules: { minSpeed: KMH(170) },
      twist: { id: 'floor' },
      medals: [40, 31, 27.5],
    },
    {
      title: 'MAX CHAIN',
      tag: 'CHAIN',
      blurb: 'Echo Ruins has a glide gap, a wall run and an echo in each world. Chain them all. ×8 is the most a chain can pay.',
      how: ['Plan the lap: which route, which form, where.', 'A road only your lens can see holds the chain.', 'A crash breaks it.'],
      course: 'ruins',
      ...lap(),
      goal: { kind: 'count', stat: 'chain' },
      twist: { id: 'chainBest' },
      medals: [3, 4, 6],
    },
    {
      title: 'MOST WANTED',
      tag: 'PURSUIT',
      blurb: 'Five rivals and the police, two laps of Void Field. Finish on the podium.',
      how: ['The chase is BOTH only: a single lens slips through it.', 'The cruisers ram rivals too.', 'Three stars is a win.'],
      course: 'void',
      laps: 2,
      start: { u: 0, speed: 20, mode: BOTH, energy: 1 },
      rivals: 5,
      hazards: true,
      goal: { kind: 'count', stat: 'beaten' },
      twist: { id: 'place', skill: 0.8 },
      medals: [3, 4, 5],
    },
    {
      title: 'PERFECT PITCH',
      tag: 'PERFECT SHIFT',
      blurb: 'Shift in the last few metres before a wall, a lens pad or a launcher for a PERFECT SHIFT. Land as many as you can in two laps of Shift Tunnels.',
      how: ['Leave the shift as late as you dare.', 'A PERFECT SHIFT pays a big boost and a chain link.', 'A little early is a CLOSE PHASE; too late is a crash.'],
      course: 'tunnels',
      laps: 2,
      start: { u: 0, speed: 25, mode: BOTH, energy: 1 },
      goal: { kind: 'count', stat: 'perfect' },
      medals: [1, 3, 5],
    },
  ],
  // ---- FINALE
  [
    {
      title: 'THE LAST SHIFT',
      tag: 'FINALE',
      blurb: 'Three laps of Echo Ruins as it comes apart: the quake, the lava, then the plates. Five rivals at their best. Win it.',
      how: ['Lap 2’s lava is the red world’s: BLUE walks on the crust.', 'Lap 3 moves the road under you.', 'Three stars is a win.'],
      course: 'ruins',
      laps: 3,
      start: { u: 0, speed: 0, mode: BOTH, energy: 1 },
      rivals: 5,
      charges: true,
      hazards: true,
      goal: { kind: 'count', stat: 'beaten' },
      twist: { id: 'place', skill: 1 },
      medals: [3, 4, 5],
    },
  ],
];

// ids and numbers: tour.<leg>.<n>, numbered 1..31 through the tour
export const TOUR = [];
EVENTS.forEach((list, leg) =>
  list.forEach((d, k) => {
    TOUR.push({ ...d, id: `tour.${leg + 1}.${k + 1}`, leg, num: TOUR.length + 1, tour: true, rules: d.rules || {} });
  }),
);
export const tourEvent = (id) => TOUR.find((d) => d.id === id) || null;
export const legEvents = (leg) => TOUR.filter((d) => d.leg === leg);
export const MAX_STARS = TOUR.length * 3;
// the next event in the tour (the next leg's first once a leg is done), or null at the end
export const nextTourEvent = (id) => TOUR[TOUR.findIndex((d) => d.id === id) + 1] || null;
export { BOTH, RED, BLUE };
