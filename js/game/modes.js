// Game modes beyond a single race: the four Grand Prix cups and the two bonus courses, Time Trial and Mono Run medals, staff ghosts, and the
// save file that remembers trophies, medals and what they unlock.

import { storage } from '../core/util.js';
import { M } from '../world/shift.js';
import { TRACKS } from '../world/tracks.js';

export const CUPS = [
  { id: 'signal', name: 'SIGNAL CUP', color: '#ff4fd8', from: 1, tracks: ['core', 'layered', 'tunnels', 'orbital', 'city'] },
  { id: 'static', name: 'STATIC CUP', color: '#1e8cff', from: 6, tracks: ['void', 'helix', 'fractal', 'lattice', 'ruins'] },
  // The third cup: five toys in a kid's bedroom after lights-out (world/toybox.js), easiest first. It opens with a
  // trophy in both cups above. A course slots in by adding a track with one of these ids to tracks.js; until all
  // five are there the cup shows COMING SOON. `from` is the course number of its first course, for the ones not built.
  { id: 'toybox', name: 'TOYBOX CUP', color: '#ffd23a', from: 17, tracks: ['pinball', 'domino', 'popup', 'tiles', 'marblerun'], unlock: 'cup:toybox' },
  // The finale: the five impossible courses, easiest first. It opens with a trophy in the TOYBOX CUP (or, while that
  // cup isn't built yet, with a trophy in the first two).
  { id: 'paradox', name: 'PARADOX CUP', color: '#b04cff', from: 11, tracks: ['mobius', 'mirror', 'dream', 'relativity', 'dyson'], unlock: 'cup:paradox' },
];
// The bonus courses, outside the cups: HYPERCUBE opens with a trophy in the PARADOX CUP, and the secret course
// QUARTER TURN (a twisting cube) with a trophy in all four cups.
export const BONUS = { track: 'tesseract', unlock: 'course:tesseract' };
export const SECRET = { track: 'twistcube', unlock: 'course:twistcube' };
export const BONUSES = [BONUS, SECRET];
export const isBonus = (trackId) => BONUSES.some((b) => b.track === trackId);

const hasTrack = (id) => TRACKS.some((t) => t.id === id);
export const cupById = (id) => CUPS.find((c) => c.id === id);
// Every course of the cup has been built.
export const cupReady = (cup) => cup.tracks.every(hasTrack);
// The unlock a course sits behind (its cup's, or the bonus course's own), or null for a course that's always open.
export function courseLock(trackId) {
  const bonus = BONUSES.find((b) => b.track === trackId);
  if (bonus) return bonus.unlock;
  return CUPS.find((c) => c.tracks.includes(trackId))?.unlock || null;
}
export const courseOpen = (trackId) => isUnlocked(courseLock(trackId));
// Courses you can pick right now, in order.
export const openTracks = () => TRACKS.filter((t) => courseOpen(t.id));
export const POINTS = [10, 7, 5, 3, 2, 1];
export const TROPHY = ['', 'GOLD', 'SILVER', 'BRONZE'];

// Medal targets against the staff ghost.
export const MEDALS = [
  { id: 3, name: 'GOLD', color: '#ffd04a', factor: 1.0 },
  { id: 2, name: 'SILVER', color: '#d8e0f0', factor: 1.07 },
  { id: 1, name: 'BRONZE', color: '#e08a4a', factor: 1.16 },
];
export function medalFor(time, staffTime) {
  if (!staffTime || !isFinite(time)) return 0;
  for (const m of MEDALS) if (time <= staffTime * m.factor) return m.id;
  return 0;
}
export const medalInfo = (id) => MEDALS.find((m) => m.id === id) || null;

// Mono Run never shows the overlap, so road that exists only in the overlap is opened to both lenses.
export function monoDef(def) {
  const fix = (x) => (x.mask === M.X ? { ...x, mask: M.ALL } : x);
  return { ...def, gaps: (def.gaps || []).map(fix), branches: (def.branches || []).map(fix) };
}

// ------------------------------------------------------------------ save file
const KEY = 'rs.progress';
const blank = () => ({ cups: {}, trial: {}, mono: {}, tour: {}, unlocked: [], seen: [] });
export function getProgress() {
  return { ...blank(), ...storage.get(KEY, {}) };
}
export function saveProgress(p) {
  storage.set(KEY, p);
}
// Keep the best result: cups store the best place (lower is better), medals the best medal.
export function recordCup(cupId, place) {
  const p = getProgress();
  if (!p.cups[cupId] || place < p.cups[cupId]) p.cups[cupId] = place;
  saveProgress(p);
  return p;
}
// SHIFT TOUR: the most stars each event has paid (0..3).
export function recordTour(eventId, stars) {
  const p = getProgress();
  if (stars > (p.tour[eventId] || 0)) p.tour[eventId] = stars;
  saveProgress(p);
  return p;
}
export const tourStars = (p = getProgress()) => Object.values(p.tour || {}).reduce((a, b) => a + b, 0);
export function recordMedal(kind, trackId, medal) {
  const p = getProgress();
  const t = kind === 'mono' ? p.mono : p.trial;
  if (medal > (t[trackId] || 0)) t[trackId] = medal;
  saveProgress(p);
  return p;
}

// ------------------------------------------------------------------ staff ghosts (data/staff/*.json)
const staffCache = new Map();
export async function loadStaff(trackId, mono) {
  const key = `${trackId}${mono ? '-mono' : ''}`;
  if (staffCache.has(key)) return staffCache.get(key);
  let data = null;
  try {
    const res = await fetch(new URL(`../../data/staff/${key}.json`, import.meta.url));
    if (res.ok) data = await res.json();
  } catch {
    data = null;
  }
  staffCache.set(key, data);
  return data;
}

// ------------------------------------------------------------------ garage: colours and unlocks
export const COLORWAYS = [
  { id: 'stock', name: 'STOCK', c: null },
  { id: 'pink', name: 'HOT PINK', c: 0xff4fd8 },
  { id: 'red', name: 'RED SHIFT', c: 0xff2a4a },
  { id: 'blue', name: 'BLUE SHIFT', c: 0x1e8cff },
  { id: 'violet', name: 'OVERLAP', c: 0xb04cff },
  { id: 'cyan', name: 'CATHODE', c: 0x6ae0ff },
  { id: 'yellow', name: 'AMBER', c: 0xffd04a },
  { id: 'white', name: 'PHOSPHOR', c: 0xf4f0ff },
  { id: 'acid', name: 'ACID', c: 0x7dff4a, unlock: 'paint:acid' },
  { id: 'sunset', name: 'SUNSET', c: 0xff8a3a, unlock: 'paint:sunset' },
  { id: 'chrome', name: 'CHROME', c: 0xcfd6dd, unlock: 'paint:chrome' },
  { id: 'gold', name: 'GOLD', c: 0xffe08a, unlock: 'paint:gold' },
  { id: 'spectrum', name: 'SPECTRUM', c: 'spectrum', unlock: 'paint:spectrum' },
  { id: 'aurora', name: 'AURORA', c: 0x2affb0, unlock: 'paint:aurora' },
  { id: 'indigo', name: 'INDIGO', c: 0x5a5aff, unlock: 'paint:indigo' },
  { id: 'rose', name: 'ROSE', c: 0xff3a7a, unlock: 'paint:rose' },
];
const medalCount = (p) => Object.values(p.trial).filter(Boolean).length + Object.values(p.mono).filter(Boolean).length;
const golds = (t) => Object.values(t).filter((m) => m >= 3).length;
const cupTop = (p, id, place) => p.cups[id] && p.cups[id] <= place;

const baseCups = (p) => cupTop(p, 'signal', 3) && cupTop(p, 'static', 3);
// The cup before the finale: the TOYBOX CUP once it's built, so nobody is held back by a cup they can't play yet.
const beforeFinale = (p) => baseCups(p) && (!cupReady(cupById('toybox')) || cupTop(p, 'toybox', 3));
const allCups = (p) => CUPS.every((c) => cupTop(p, c.id, 3));

export const UNLOCKS = [
  // Neither opens until its courses are in the game, so the banner never announces something you can't play yet.
  { id: 'cup:toybox', name: 'TOYBOX CUP', hint: 'Take a trophy in the SIGNAL CUP and the STATIC CUP', test: (p) => cupReady(cupById('toybox')) && baseCups(p) },
  { id: 'cup:paradox', name: 'PARADOX CUP', hint: 'Take a trophy in the TOYBOX CUP', test: (p) => cupReady(cupById('paradox')) && beforeFinale(p) },
  { id: 'course:tesseract', name: 'BONUS COURSE', hint: 'Take a trophy in the PARADOX CUP', test: (p) => hasTrack(BONUS.track) && beforeFinale(p) && cupTop(p, 'paradox', 3) },
  { id: 'course:twistcube', name: 'SECRET COURSE', hint: 'Take a trophy in all four cups', test: (p) => hasTrack(SECRET.track) && CUPS.every(cupReady) && allCups(p) },
  { id: 'car:chroma', name: 'CHROMA', hint: 'Take a trophy in the SIGNAL CUP, or earn 15 stars on SHIFT TOUR', test: (p) => cupTop(p, 'signal', 3) || tourStars(p) >= 15 },
  { id: 'car:raster', name: 'RASTER', hint: 'Take a trophy in the STATIC CUP, or earn 35 stars on SHIFT TOUR', test: (p) => cupTop(p, 'static', 3) || tourStars(p) >= 35 },
  { id: 'car:glitch', name: 'GLITCH', hint: 'Earn 5 medals in Time Trial or Mono Run', test: (p) => medalCount(p) >= 5 },
  { id: 'car:dash', name: 'DASH (from LAST LINE)', hint: 'Earn 3 gold medals in Mono Run', test: (p) => golds(p.mono) >= 3 },
  { id: 'car:greatwedge', name: 'GREAT WEDGE (from ABSURD COMBAT RACING)', hint: 'Win gold trophies in both cups', test: (p) => cupTop(p, 'signal', 1) && cupTop(p, 'static', 1) },
  { id: 'paint:acid', name: 'ACID paint', hint: 'Earn 3 medals', test: (p) => medalCount(p) >= 3 },
  { id: 'paint:sunset', name: 'SUNSET paint', hint: 'Take any cup trophy', test: (p) => cupTop(p, 'signal', 3) || cupTop(p, 'static', 3) },
  { id: 'paint:chrome', name: 'CHROME paint', hint: 'Earn 10 medals', test: (p) => medalCount(p) >= 10 },
  { id: 'paint:gold', name: 'GOLD paint', hint: 'Win a gold cup trophy', test: (p) => cupTop(p, 'signal', 1) || cupTop(p, 'static', 1) },
  { id: 'paint:spectrum', name: 'SPECTRUM paint', hint: 'Gold medals on all ten Time Trials', test: (p) => golds(p.trial) >= 10 },
  { id: 'paint:aurora', name: 'AURORA paint', hint: 'Earn 8 stars on SHIFT TOUR', test: (p) => tourStars(p) >= 8 },
  { id: 'paint:indigo', name: 'INDIGO paint', hint: 'Earn 25 stars on SHIFT TOUR', test: (p) => tourStars(p) >= 25 },
  { id: 'paint:rose', name: 'ROSE paint', hint: 'Finish THE LAST SHIFT on the podium', test: (p) => (p.tour?.['tour.6.1'] || 0) > 0 },
];
const STARTERS = ['vector', 'scanline', 'polygon'];
const unlockAll = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('unlockall');

export function isUnlocked(id) {
  if (!id || unlockAll()) return true;
  if (id.startsWith('car:') && STARTERS.includes(id.slice(4))) return true;
  return getProgress().unlocked.includes(id);
}
export const unlockFor = (id) => UNLOCKS.find((u) => u.id === id);

// Newly earned unlocks since the last check (for the results banner and the secret-driver scenes).
export function checkUnlocks() {
  const p = getProgress();
  const fresh = [];
  for (const u of UNLOCKS) {
    if (p.unlocked.includes(u.id) || !u.test(p)) continue;
    p.unlocked.push(u.id);
    fresh.push(u);
  }
  if (fresh.length) saveProgress(p);
  return fresh;
}

// The garage: one livery per car, as colourway ids ('off' allowed for trail and underglow).
export const getGarage = () => storage.get('rs.garage', {});
export function setLivery(carId, livery) {
  const g = getGarage();
  g[carId] = livery;
  storage.set('rs.garage', g);
}
export function liveryFor(carId) {
  const l = getGarage()[carId] || {};
  const col = (id) => (id === 'off' ? 'off' : COLORWAYS.find((c) => c.id === id && isUnlocked(c.unlock))?.c ?? undefined);
  const out = {};
  const paint = col(l.paint);
  if (paint != null) out.paint = paint;
  const trail = col(l.trail);
  if (trail != null) out.trail = trail;
  const glow = col(l.glow);
  if (glow != null) out.glow = glow;
  return out;
}
