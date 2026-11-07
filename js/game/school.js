// SHIFT SCHOOL: seven one-minute drills, one per thing the game asks of you, each run by the event runner
// (events.js) on a stretch of a real course, with bronze, silver and gold.
//
// The strips are worked out from each course's own features, so moving a wall or a route in tracks.js carries
// the drill with it. They're short on purpose, so a retry is instant. Gold is about 10% off a staff run (the AI
// at full skill: walls 6.4s, lens route 7.5s, slit 7.5s, glide 7.0s), silver 25%, bronze 50%.

import { trackById } from '../world/tracks.js';
import { BOTH, RED, BLUE } from '../world/shift.js';
import { registerTwist } from './events.js';
import { LENS_COACH } from './feel.js';

// THREE FORMS: hold each lens for a moment before the strip ends. The HUD ticks them off as you go.
const HOLD = 1;
const FORM_NAME = { [RED]: 'RED BLADE', [BLUE]: 'BLUE SKIMMER', [BOTH]: 'BOTH PAIR' };
registerTwist('threeForms', {
  start(race, ev) {
    ev.held = { [RED]: 0, [BLUE]: 0, [BOTH]: 0 };
    ev.got = new Set();
    ev.left = race.player.mode; // the lens you start in only counts once you've come back to it
  },
  update(race, ev, dt) {
    const p = race.player;
    if (p.mode !== ev.left) ev.left = null;
    if (ev.left == null && !ev.got.has(p.mode)) {
      ev.held[p.mode] += dt;
      if (ev.held[p.mode] >= HOLD) {
        ev.got.add(p.mode);
        race.app.audio.play('driftStage', ev.got.size);
        race.emitP(p, 'popup', { text: `${FORM_NAME[p.mode]} ✓ ${ev.got.size}/3`, color: LENS_COACH[p.mode].color });
      }
    }
    ev.note = [RED, BOTH, BLUE].map((m) => `<span style="color:${LENS_COACH[m].color};opacity:${ev.got.has(m) ? 1 : 0.35}">${ev.got.has(m) ? '■' : '□'} ${['', 'BOTH', 'RED', '', 'BLUE'][m]}</span>`).join(' ');
    if (ev.stripLeft() <= 0 && ev.got.size < 3) {
      ev.reason = 'TRY ALL THREE';
      return 'fail';
    }
  },
});

const core = trackById('core');
const city = trackById('city');
const branch = (t, label) => t.branches.find((b) => b.label === label);
const walls = core.obstacles.filter((o) => o.type === 'wall').map((o) => o.at);
const wrap = (u) => ((u % 1) + 1) % 1;

const blueCut = branch(core, 'BLUE SHORTCUT');
const glide = branch(core, 'GLIDE GAP');
const slit = branch(city, 'THE SLIT');

export const SCHOOL = [
  {
    id: 'school.forms',
    num: 1,
    title: 'THREE FORMS',
    blurb: 'Every lens turns you into a different craft. Try each one before the end of the stretch.',
    how: ['Hold RED: the BLADE. The fastest, and it clings to the road.', 'Hold BLUE: the SKIMMER. It grips, skims water and glides.', 'Press both for BOTH: the pair. Steady, and it refills SHIFT.'],
    course: 'core',
    strip: { from: 0.975, to: 0.135 },
    start: { speed: 30, mode: BOTH, energy: 1 },
    goal: { kind: 'reach', time: 25 },
    rules: { maxFalls: 2 },
    twist: { id: 'threeForms' },
    lenses: [RED, BOTH, BLUE],
    medals: [8.5, 6.5, 5.2],
  },
  {
    id: 'school.walls',
    num: 2,
    title: 'LENS WALLS',
    blurb: 'A wall glows the colour of its world. Look through the other lens and it is gone.',
    how: ['A RED wall: shift to BLUE.', 'A BLUE wall: shift to RED.', 'Shift right before it for a CLOSE PHASE boost.'],
    course: 'core',
    strip: { from: wrap(walls[0] - 0.06), to: wrap(walls[1] + 0.03) },
    start: { speed: 30, mode: BOTH, energy: 1 },
    goal: { kind: 'reach', time: 25 },
    rules: { maxFalls: 2 },
    medals: [9.5, 8, 7],
  },
  {
    id: 'school.route',
    num: 3,
    title: 'LENS ROUTE',
    blurb: 'Some roads exist in one lens only. Hold BLUE and the shortcut on the right is there.',
    how: ['Shift to BLUE before the fork.', 'A road only your lens can see holds the lens for you: no SHIFT drain.', 'Drop back to BOTH when you rejoin.'],
    course: 'core',
    strip: { from: wrap(blueCut.from - 0.03), to: wrap(blueCut.to + 0.02) },
    start: { speed: 30, mode: BOTH, energy: 1 },
    goal: { kind: 'reach', time: 25 },
    // only the lenses this drill is about: one less thing to think about
    rules: { maxFalls: 2, lens: [BOTH, BLUE] },
    medals: [11, 9.2, 8.1],
  },
  {
    id: 'school.slit',
    num: 4,
    title: 'THE SLIT',
    blurb: 'A wall with a gap only the narrow RED Blade fits. Line up early and hold the middle.',
    how: ['Take the left route past the blue bridge.', 'Shift to RED: the deck halves fall away and the Blade fits.', 'Hold the middle line through the gap.'],
    course: 'city',
    strip: { from: wrap(slit.from - 0.025), to: wrap(slit.to + 0.02) },
    start: { speed: 30, mode: BOTH, energy: 1 },
    goal: { kind: 'reach', time: 25 },
    // the run only counts through the form route
    rules: { maxFalls: 2, need: 'route.slit', lens: [BOTH, RED] },
    medals: [11, 9.2, 8.1],
  },
  {
    id: 'school.glide',
    num: 5,
    title: 'THE GLIDE GAP',
    blurb: 'A stretch with no road in any world. Only the BLUE Skimmer floats across it.',
    how: ['Take the left route.', 'Shift to BLUE before the lip and keep your speed up.', 'Steer in the air to land straight.'],
    course: 'core',
    strip: { from: wrap(glide.from - 0.025), to: wrap(glide.to + 0.02) },
    start: { speed: 30, mode: BOTH, energy: 1 },
    goal: { kind: 'reach', time: 25 },
    // the run only counts through the form route
    // (no lens rule: the strip opens on a blue wall, which takes RED)
    rules: { maxFalls: 2, need: 'route.glide' },
    medals: [10.5, 8.6, 7.5],
  },
  {
    id: 'school.charges',
    num: 6,
    title: 'CHARGES',
    blurb: 'Drive through a gate of prisms to roll a SEAM CHARGE, then fire it.',
    how: ['Prism gates sit across the road: drive through one.', 'Fire with the CHARGE button once it lands.', 'EMP the pack, FLIP them into the other world, or burn past as LIGHTSPEED.'],
    course: 'core',
    laps: 2,
    start: { u: 0.0, speed: 20, mode: BOTH, energy: 1 },
    rivals: 3,
    charges: true,
    goal: { kind: 'count', stat: 'charge', time: 60 },
    rules: {},
    medals: [1, 2, 3],
  },
  {
    id: 'school.hull',
    num: 7,
    title: 'THE HULL',
    blurb: 'The police are out on Void Field. A hit takes hull, not your race. Stay in one piece for a minute.',
    how: ['Each hit takes a share of the ten hull cells.', 'A few quiet seconds patch it up, faster in BOTH.', 'Dodge, phase through what you can, and keep moving.'],
    course: 'void',
    laps: 3,
    start: { u: 0.0, speed: 25, mode: BOTH, energy: 1 },
    hazards: true,
    goal: { kind: 'survive' },
    rules: {},
    medals: [25, 45, 60],
  },
];

export const schoolDrill = (id) => SCHOOL.find((d) => d.id === id) || null;
export const nextDrill = (id) => SCHOOL[SCHOOL.findIndex((d) => d.id === id) + 1] || null;
export { RED, BLUE };
