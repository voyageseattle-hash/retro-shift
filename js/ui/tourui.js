// The screens for SHIFT TOUR (game/tour.js): the five legs and the finale, a leg's six events, the brief before an
// event, its panel on the HUD (stars instead of medals), and the result with the stars it paid and what they opened.

import { el, Menu } from './ui.js';
import { formatTime, ordinal } from '../core/util.js';
import { LEGS, legEvents, nextTourEvent, MAX_STARS, WIN } from '../game/tour.js';
import { eventBest, tierFor } from '../game/events.js';
import { lensCards } from './eventui.js';
import { getProgress, recordTour, tourStars } from '../game/modes.js';
import { RED, BOTH, BLUE } from '../world/shift.js';

const UNIT = { chain: '× CHAIN', turbo: 'TURBOS', turbo2: 'BIG TURBOS', turbo3: 'PRISM TURBOS', takedown: 'TAKEDOWNS', perfect: 'PERFECT SHIFTS', phase: 'PHASES', route: 'ROUTES' };
export const starRow = (n, of = 3) => `<span class="stars">${'★'.repeat(n)}<i>${'★'.repeat(Math.max(0, of - n))}</i></span>`;
const isPlace = (d) => d.twist?.id === 'place';
const placeOf = (d, beaten) => ordinal((d.rivals || 0) + 1 - beaten);
// a value as the event counts it: a time, a count with its unit, or a place
function show(d, v) {
  if (isPlace(d)) return placeOf(d, v);
  if (d.goal.kind === 'count') return d.goal.stat === 'chain' ? `×${Math.round(v)} CHAIN` : `${Math.round(v)} ${UNIT[d.goal.stat] || ''}`.trim();
  if (d.goal.kind === 'survive') return `${Math.floor(v)}s`;
  return formatTime(v);
}
// (a duel's first star is the win: it says so)
const targets = (d) => d.medals.map((m, k) => `<span>${starRow(k + 1)} <b>${m === WIN ? 'WIN' : show(d, m)}</b></span>`).join('');
const legOpen = (leg, stars = tourStars()) => stars >= LEGS[leg].stars;
const starsOf = (d, p = getProgress()) => p.tour?.[d.id] || 0;
const legStars = (leg, p = getProgress()) => legEvents(leg).reduce((a, d) => a + starsOf(d, p), 0);
const legName = (leg) => (LEGS[leg].name === 'FINALE' ? 'FINALE' : `LEG ${leg + 1} · ${LEGS[leg].name}`);
// (the brief's lens cards are SHIFT SCHOOL's, with the tour's word for a lens that's off)
const cards = (ui, allowed) => lensCards(ui, allowed, 'Switched off for this event.');

// ------------------------------------------------------------------ the tour: five legs and the finale
export function tourMenu(ui, focus = null) {
  ui.clear();
  ui.hideHud();
  ui.app.showAttract(true);
  const p = getProgress();
  const total = tourStars(p);
  const s = el('div', 'screen school tour');
  s.innerHTML = `<h2>SHIFT TOUR</h2><div class="sub">Thirty events across the Grid, each with a twist. Earn up to three stars on each: stars open the next leg, new paint, and the finale.</div>
    <div class="tour-total">${starRow(1, 1)} <b>${total}</b> / ${MAX_STARS}</div>`;
  const wrap = el('div', 'school-wrap');
  const list = el('div', 'list');
  const info = el('div', 'school-info');
  wrap.append(list, info);
  s.appendChild(wrap);
  ui.root.appendChild(s);
  const showLeg = (leg) => {
    const open = legOpen(leg, total);
    const evs = legEvents(leg);
    info.innerHTML = `<h3>${legName(leg)}</h3><p>${LEGS[leg].blurb}</p>
      ${open ? '' : `<div class="tour-need">${starRow(1, 1)} ${LEGS[leg].stars} TO OPEN · YOU HAVE ${total}</div>`}
      <ul class="leg-list${open ? '' : ' shut'}">${evs.map((d) => `<li><span><i class="sd-num">${d.num}</i>${d.title}</span><em>${d.tag}</em>${starRow(starsOf(d, p))}</li>`).join('')}</ul>`;
  };
  const items = LEGS.map((L, leg) => {
    const open = legOpen(leg, total);
    const got = legStars(leg, p);
    const of = legEvents(leg).length * 3;
    return {
      label: `<span class="sd-num">${leg === LEGS.length - 1 ? '★' : leg + 1}</span>${L.name}<i class="leg-count">${open ? `${got}/${of}` : `${starRow(1, 1)} ${L.stars}`}</i>`,
      cls: open ? '' : 'locked',
      onFocus: () => showLeg(leg),
      action: () => {
        if (open) legMenu(ui, leg);
        else ui.app.audio.play('denied');
      },
    };
  });
  items.push({ label: 'BACK', action: () => ui.title(), onFocus: () => (info.innerHTML = '') });
  // start on the newest open leg that still has stars to win
  if (focus == null) {
    focus = 0;
    LEGS.forEach((L, leg) => {
      if (legOpen(leg, total) && legStars(leg, p) < legEvents(leg).length * 3) focus = leg;
    });
  }
  ui.menu = new Menu(ui.app, list, items, { focus, onBack: () => ui.title() });
  ui.menu.nodes.forEach((n) => list.appendChild(n));
}

// ------------------------------------------------------------------ a leg: its six events
export function legMenu(ui, leg, focus = 0) {
  if (!legOpen(leg)) return tourMenu(ui, leg);
  ui.clear();
  ui.hideHud();
  ui.app.showAttract(true);
  const p = getProgress();
  const evs = legEvents(leg);
  const s = el('div', 'screen school tour');
  s.innerHTML = `<h2>${legName(leg)}</h2><div class="sub">${LEGS[leg].blurb}</div>
    <div class="tour-total">${starRow(1, 1)} <b>${legStars(leg, p)}</b> / ${evs.length * 3}</div>`;
  const wrap = el('div', 'school-wrap');
  const list = el('div', 'list');
  const info = el('div', 'school-info');
  wrap.append(list, info);
  s.appendChild(wrap);
  ui.root.appendChild(s);
  const showEvent = (d) => {
    const b = eventBest(d.id);
    info.innerHTML = `<h3>${d.num}. ${d.title}</h3><div class="tour-tag">${d.tag}</div><p>${d.blurb}</p><ul>${d.how.map((h) => `<li>${h}</li>`).join('')}</ul>
      <div class="tour-targets">${targets(d)}</div>
      <div class="school-best">${b ? `BEST <b>${show(d, b.value)}</b> · ${starRow(starsOf(d, p))}` : 'NOT RUN YET'}</div>`;
  };
  const items = evs.map((d) => ({
    label: `<span class="sd-num">${d.num}</span>${d.title}<i class="sd-stars">${starRow(starsOf(d, p))}</i>`,
    onFocus: () => showEvent(d),
    action: () => tourBrief(ui, d),
  }));
  const back = () => tourMenu(ui, leg);
  items.push({ label: 'BACK', action: back, onFocus: () => (info.innerHTML = '') });
  ui.menu = new Menu(ui.app, list, items, { focus, onBack: back });
  ui.menu.nodes.forEach((n) => list.appendChild(n));
}

// ------------------------------------------------------------------ before an event
export function tourBrief(ui, d) {
  ui.clear();
  const s = el('div', 'screen school brief tour');
  const allowed = d.lenses || d.rules?.lens || [RED, BOTH, BLUE];
  s.innerHTML = `<h2>${d.num}. ${d.title}</h2><div class="tour-tag">${d.tag}</div><div class="sub">${d.blurb}</div>
    ${cards(ui, allowed)}
    <ol class="brief-how">${d.how.map((h) => `<li>${h}</li>`).join('')}</ol>
    <div class="tour-targets">${targets(d)}</div>`;
  const list = el('div', 'list row');
  s.appendChild(list);
  ui.root.appendChild(s);
  const back = () => legMenu(ui, d.leg, Math.max(0, legEvents(d.leg).indexOf(d)));
  ui.menu = new Menu(ui.app, list, [{ label: 'GO', action: () => ui.app.startEvent(d) }, { label: 'BACK', action: back }], { onBack: back });
  ui.menu.nodes.forEach((n) => list.appendChild(n));
}

// ------------------------------------------------------------------ on the HUD
// The run's panel, top centre: the event, where you are against the stars, the clock, and the twist's own line.
// For a time it's the stars you'd get if you crossed now, running down as the clock runs.
export function tourHud(ui, race) {
  const ev = race.event;
  if (!ev) return;
  const d = ev.def;
  let box = ui.hudRoot.querySelector('.h-event');
  if (!box) {
    box = el('div', 'h-event tour');
    ui.hudRoot.appendChild(box);
    // a lap count out of 99 means nothing: the runner counts its own (and the panel says the lap where it matters)
    ui.hudRoot.querySelectorAll('.h-lap, .h-place').forEach((n) => (n.style.visibility = 'hidden'));
  }
  const p = race.player;
  let val;
  let tier;
  if (isPlace(d)) {
    const ahead = race.racers.filter((r) => r !== p && r.prog > p.prog).length;
    tier = ev.done ? ev.tier : tierFor(d, (d.rivals || 0) - ahead);
    val = ev.display || '';
  } else if (d.goal.kind === 'count') {
    tier = ev.done ? ev.tier : tierFor(d, ev.value);
    const next = d.medals[Math.min(2, tier)];
    val = d.goal.stat === 'chain' ? `×${Math.round(ev.value)} / ×${next}` : `${Math.round(ev.value)} / ${next}`;
  } else {
    tier = ev.done ? ev.tier : tierFor(d, ev.t);
    val = formatTime(ev.t);
  }
  // a time: the clock you have to beat to keep the stars you're on
  const keep = !isPlace(d) && d.goal.kind !== 'count' && tier > 0 && !ev.done && d.medals[tier - 1] !== WIN ? `<span class="ev-time">${formatTime(d.medals[tier - 1])}</span>` : '';
  const left = d.goal.time && d.goal.kind === 'count' && !ev.done ? `<span class="ev-time">${Math.ceil(Math.max(0, d.goal.time - ev.t))}s</span>` : '';
  const laps = d.laps > 1 && !['place', 'quota'].includes(d.twist?.id) ? `LAP ${Math.min(d.laps, p.lap + 1)}/${d.laps}` : '';
  const note = [ev.note, laps].filter(Boolean).join(' · ');
  const html = `<b>${d.title}</b><span class="ev-val">${val}</span>${keep}${left}${note ? `<span class="ev-note">${note}</span>` : ''}${ev.failed ? '<i class="ev-fail">FAILED</i>' : starRow(tier)}`;
  if (box._html !== html) box.innerHTML = box._html = html;
  box.classList.toggle('warn', !!ev.warn && !ev.done);
}

// ------------------------------------------------------------------ the result
export function tourResults(ui, race) {
  const ev = race.event;
  const d = ev.def;
  const before = tourStars();
  if (!race.opts.autopilot && !ev.failed && ev.tier > 0) recordTour(d.id, ev.tier);
  const after = tourStars();
  ui.hudRoot.hidden = true;
  ui.clear();
  const opened = LEGS.filter((L) => L.stars > before && L.stars <= after);
  const s = el('div', 'screen results event-results tour-results');
  s.innerHTML = `<h2>${d.num}. ${d.title}</h2><div class="tour-tag">${d.tag}</div>
    <div class="medalbox">${ev.failed ? `<div class="bigmedal none">${ev.reason || 'FAILED'}</div>` : `<div class="bigstars${ev.tier ? '' : ' none'}">${ev.tier ? starRow(ev.tier) : 'NO STARS'}</div>`}
      <div class="ev-score">${show(d, ev.value)}${ev.newBest ? ' · NEW BEST' : ''}</div>
      <div class="tour-targets">${targets(d)}</div>
      <div class="tour-total">TOUR ${starRow(1, 1)} <b>${after}</b> / ${MAX_STARS}${after > before ? ` <em>+${after - before}</em>` : ''}</div>
      ${opened.map((L) => `<div class="tour-open">${L.name === 'FINALE' ? 'THE FINALE' : L.name} IS OPEN</div>`).join('')}</div>`;
  ui.unlockBanner(s);
  if (opened.length) ui.app.audio.play('shard');
  const list = el('div', 'list row');
  s.appendChild(list);
  ui.root.appendChild(s);
  const next = nextTourEvent(d.id);
  const nextOk = next && legOpen(next.leg, after);
  const items = [
    { label: 'RETRY', action: () => ui.app.startEvent(d) },
    ...(nextOk ? [{ label: `NEXT · ${next.title}`, action: () => tourBrief(ui, next) }] : []),
    { label: 'SHIFT TOUR', action: () => ui.app.quitEvent() },
  ];
  ui.menu = new Menu(ui.app, list, items, { focus: nextOk && ev.tier > 0 ? 1 : 0, onBack: () => ui.app.quitEvent() });
  ui.menu.nodes.forEach((n) => list.appendChild(n));
}
