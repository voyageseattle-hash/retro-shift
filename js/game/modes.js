// Game modes beyond a single race: the two Grand Prix cups, Time Trial and Mono Run medals, staff ghosts, and the
// save file that remembers trophies, medals and what they unlock.

import { storage } from '../core/util.js';
import { M } from '../world/shift.js';

export const CUPS = [
  { id: 'signal', name: 'SIGNAL CUP', color: '#ff4fd8', tracks: ['core', 'layered', 'tunnels', 'orbital', 'city'] },
  { id: 'static', name: 'STATIC CUP', color: '#1e8cff', tracks: ['void', 'helix', 'fractal', 'lattice', 'ruins'] },
];
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
const blank = () => ({ cups: {}, trial: {}, mono: {}, unlocked: [], seen: [] });
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
];
const medalCount = (p) => Object.values(p.trial).filter(Boolean).length + Object.values(p.mono).filter(Boolean).length;
const golds = (t) => Object.values(t).filter((m) => m >= 3).length;
const cupTop = (p, id, place) => p.cups[id] && p.cups[id] <= place;

export const UNLOCKS = [
  { id: 'car:chroma', name: 'CHROMA', hint: 'Take a trophy in the SIGNAL CUP', test: (p) => cupTop(p, 'signal', 3) },
  { id: 'car:raster', name: 'RASTER', hint: 'Take a trophy in the STATIC CUP', test: (p) => cupTop(p, 'static', 3) },
  { id: 'car:glitch', name: 'GLITCH', hint: 'Earn 5 medals in Time Trial or Mono Run', test: (p) => medalCount(p) >= 5 },
  { id: 'car:dash', name: 'DASH (from LAST LINE)', hint: 'Earn 3 gold medals in Mono Run', test: (p) => golds(p.mono) >= 3 },
  { id: 'car:greatwedge', name: 'GREAT WEDGE (from WEDGEWRECK RALLY)', hint: 'Win gold trophies in both cups', test: (p) => cupTop(p, 'signal', 1) && cupTop(p, 'static', 1) },
  { id: 'paint:acid', name: 'ACID paint', hint: 'Earn 3 medals', test: (p) => medalCount(p) >= 3 },
  { id: 'paint:sunset', name: 'SUNSET paint', hint: 'Take any cup trophy', test: (p) => cupTop(p, 'signal', 3) || cupTop(p, 'static', 3) },
  { id: 'paint:chrome', name: 'CHROME paint', hint: 'Earn 10 medals', test: (p) => medalCount(p) >= 10 },
  { id: 'paint:gold', name: 'GOLD paint', hint: 'Win a gold cup trophy', test: (p) => cupTop(p, 'signal', 1) || cupTop(p, 'static', 1) },
  { id: 'paint:spectrum', name: 'SPECTRUM paint', hint: 'Gold medals on all ten Time Trials', test: (p) => golds(p.trial) >= 10 },
];
const STARTERS = ['vector', 'scanline', 'polygon'];
const unlockAll = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('unlockall');

export function isUnlocked(id) {
  if (!id || unlockAll()) return true;
  if (id.startsWith('car:') && STARTERS.includes(id.slice(4))) return true;
  return getProgress().unlocked.includes(id);
}
export const unlockFor = (id) => UNLOCKS.find((u) => u.id === id);

// Newly earned unlocks since the last check (names, for the results banner).
export function checkUnlocks() {
  const p = getProgress();
  const fresh = [];
  for (const u of UNLOCKS) {
    if (p.unlocked.includes(u.id) || !u.test(p)) continue;
    p.unlocked.push(u.id);
    fresh.push(u.name);
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
