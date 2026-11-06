// SHIFT SCHOOL: six one-minute drills, one per thing the game asks of you, each run by the event runner
// (events.js) on a stretch of a real course, with bronze, silver and gold.
//
// The strips are worked out from each course's own features, so moving a wall or a route in tracks.js carries
// the drill with it. They're short on purpose, so a retry is instant. Gold is about 10% off a staff run (the AI
// at full skill: walls 6.4s, lens route 7.5s, slit 7.5s, glide 7.0s), silver 25%, bronze 50%.

import { trackById } from '../world/tracks.js';
import { BOTH, RED, BLUE } from '../world/shift.js';

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
    id: 'school.walls',
    num: 1,
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
    num: 2,
    title: 'LENS ROUTE',
    blurb: 'Some roads exist in one lens only. Hold BLUE and the shortcut on the right is there.',
    how: ['Shift to BLUE before the fork.', 'A road only your lens can see holds the lens for you: no SHIFT drain.', 'Drop back to BOTH when you rejoin.'],
    course: 'core',
    strip: { from: wrap(blueCut.from - 0.03), to: wrap(blueCut.to + 0.02) },
    start: { speed: 30, mode: BOTH, energy: 1 },
    goal: { kind: 'reach', time: 25 },
    rules: { maxFalls: 2 },
    medals: [11, 9.2, 8.1],
  },
  {
    id: 'school.slit',
    num: 3,
    title: 'THE SLIT',
    blurb: 'A wall with a gap only the narrow RED Blade fits. Line up early and hold the middle.',
    how: ['Take the left route past the blue bridge.', 'Shift to RED: the deck halves fall away and the Blade fits.', 'Hold the middle line through the gap.'],
    course: 'city',
    strip: { from: wrap(slit.from - 0.025), to: wrap(slit.to + 0.02) },
    start: { speed: 30, mode: BOTH, energy: 1 },
    goal: { kind: 'reach', time: 25 },
    // the run only counts through the form route
    rules: { maxFalls: 2, need: 'route.slit' },
    medals: [11, 9.2, 8.1],
  },
  {
    id: 'school.glide',
    num: 4,
    title: 'THE GLIDE GAP',
    blurb: 'A stretch with no road in any world. Only the BLUE Skimmer floats across it.',
    how: ['Take the left route.', 'Shift to BLUE before the lip and keep your speed up.', 'Steer in the air to land straight.'],
    course: 'core',
    strip: { from: wrap(glide.from - 0.025), to: wrap(glide.to + 0.02) },
    start: { speed: 30, mode: BOTH, energy: 1 },
    goal: { kind: 'reach', time: 25 },
    // the run only counts through the form route
    rules: { maxFalls: 2, need: 'route.glide' },
    medals: [10.5, 8.6, 7.5],
  },
  {
    id: 'school.charges',
    num: 5,
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
    num: 6,
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
