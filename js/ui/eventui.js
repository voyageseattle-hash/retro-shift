// The screens for events (events.js): the SHIFT SCHOOL list, a small status panel during a run, and the result.
// (The panel is a stand-in until the HUD pass draws race.event.hud() itself.)

import { el, Menu } from './ui.js';
import { formatTime } from '../core/util.js';
import { SCHOOL, nextDrill } from '../game/school.js';
import { eventBest } from '../game/events.js';
import { BOTH, RED, BLUE } from '../world/shift.js';

const TIER = [
  { name: 'NO MEDAL', color: '#8a7aa8' },
  { name: 'BRONZE', color: '#e08a4a' },
  { name: 'SILVER', color: '#d8e0f0' },
  { name: 'GOLD', color: '#ffd04a' },
];
const fmt = (kind, v) => (kind === 'count' ? String(Math.round(v)) : kind === 'survive' ? `${Math.floor(v)}s` : formatTime(v));
const medalLine = (d) => d.medals.map((m, k) => `<span style="color:${TIER[k + 1].color}">${TIER[k + 1].name} <b>${fmt(d.goal.kind, m)}</b></span>`).join('');

// The drill list: one row per drill with its best medal, and what it teaches on focus.
export function schoolMenu(ui, focus = 0) {
  ui.clear();
  ui.hideHud();
  ui.app.showAttract(true);
  const s = el('div', 'screen school');
  s.innerHTML = '<h2>SHIFT SCHOOL</h2><div class="sub">Seven short drills, one for each thing a course asks of you. Start with THREE FORMS. Earn gold in all seven and you are ready for anything.</div>';
  const wrap = el('div', 'school-wrap');
  const list = el('div', 'list');
  const info = el('div', 'school-info');
  wrap.append(list, info);
  s.appendChild(wrap);
  ui.root.appendChild(s);
  const show = (d) => {
    const b = eventBest(d.id);
    info.innerHTML = `<h3>${d.num}. ${d.title}</h3><p>${d.blurb}</p><ul>${d.how.map((h) => `<li>${h}</li>`).join('')}</ul>
      <div class="school-medals">${medalLine(d)}</div>
      <div class="school-best">${b ? `BEST <b>${fmt(d.goal.kind, b.value)}</b> · <span style="color:${TIER[b.tier].color}">${TIER[b.tier].name}</span>` : 'NOT RUN YET'}</div>`;
  };
  const items = SCHOOL.map((d) => {
    const b = eventBest(d.id);
    const t = TIER[b?.tier || 0];
    return {
      label: `<span class="sd-num">${d.num}</span>${d.title}<i class="sd-medal" style="--mc:${t.color}" title="${t.name}">${b?.tier ? '●' : '○'}</i>`,
      onFocus: () => show(d),
      action: () => drillBrief(ui, d),
    };
  });
  items.push({ label: 'BACK', action: () => ui.title(), onFocus: () => (info.innerHTML = '') });
  ui.menu = new Menu(ui.app, list, items, { focus, onBack: () => ui.title() });
  ui.menu.nodes.forEach((n) => list.appendChild(n));
}

// The three lenses as cards: which form each one is, its button, and whether this drill uses it.
const LENSES = [
  { m: RED, cls: 'red', name: 'RED', form: 'THE BLADE', job: 'Fastest. Clings to the road, fits a slit, rides a wall run.', key: 'red' },
  { m: BOTH, cls: 'both', name: 'BOTH', form: 'THE PAIR', job: 'Steady. Sees both worlds and refills SHIFT.', key: 'both' },
  { m: BLUE, cls: 'blue', name: 'BLUE', form: 'THE SKIMMER', job: 'Grips. Skims water and glides a gap.', key: 'blue' },
];
export function lensCards(ui, allowed = [RED, BOTH, BLUE]) {
  return `<div class="lens-cards">${LENSES.map(
    (l) => `<div class="lens-card ${l.cls}${allowed.includes(l.m) ? '' : ' off'}"><b>${l.name}</b><span class="lc-form">${l.form}</span><span class="lc-key">${ui.app.input.glyph(l.key)}</span><p>${allowed.includes(l.m) ? l.job : 'Not in this drill.'}</p></div>`,
  ).join('')}</div>`;
}

// Before a drill: what it teaches, the steps, and the lenses it uses (a drill only lets you shift to those).
export function drillBrief(ui, d) {
  ui.clear();
  const s = el('div', 'screen school brief');
  const allowed = d.lenses || d.rules?.lens || [RED, BOTH, BLUE];
  s.innerHTML = `<h2>${d.num}. ${d.title}</h2><div class="sub">${d.blurb}</div>
    ${lensCards(ui, allowed)}
    <ol class="brief-how">${d.how.map((h) => `<li>${h}</li>`).join('')}</ol>`;
  const list = el('div', 'list row');
  s.appendChild(list);
  ui.root.appendChild(s);
  const back = () => schoolMenu(ui, Math.max(0, SCHOOL.indexOf(d)));
  ui.menu = new Menu(ui.app, list, [{ label: 'GO', action: () => ui.app.startEvent(d) }, { label: 'BACK', action: back }], { onBack: back });
  ui.menu.nodes.forEach((n) => list.appendChild(n));
}

// The run's status, top centre: title, goal, value against the next medal, and the clock if there is one.
export function eventHud(ui, race) {
  const ev = race.event;
  if (!ev) return;
  let box = ui.hudRoot.querySelector('.h-event');
  if (!box) {
    box = el('div', 'h-event');
    ui.hudRoot.appendChild(box);
    // a lap count means nothing here: the runner counts its own
    ui.hudRoot.querySelectorAll('.h-lap, .h-place').forEach((n) => (n.style.visibility = 'hidden'));
  }
  const h = ev.hud();
  const t = TIER[h.tier];
  const val = h.kind === 'count' ? `${Math.round(h.value)} / ${fmt('count', h.target)}` : fmt(h.kind, h.value);
  const html = `<b>${h.title}</b><span class="ev-val">${val}</span>${h.timeLeft != null ? `<span class="ev-time">${Math.ceil(h.timeLeft)}s</span>` : ''}${h.note ? `<span class="ev-note">${h.note}</span>` : ''}<i style="color:${t.color}">${h.failed ? 'FAILED' : h.kind === 'count' || h.kind === 'survive' ? t.name : `GOLD ${fmt(h.kind, h.target)}`}</i>`;
  if (box._html !== html) box.innerHTML = box._html = html;
}

// The result: the medal, the value against all three, and RETRY / NEXT / BACK.
export function eventResults(ui, race) {
  const ev = race.event;
  const d = ev.def;
  ui.hudRoot.hidden = true;
  ui.clear();
  const t = TIER[ev.tier];
  const s = el('div', 'screen results event-results');
  s.innerHTML = `<h2>${d.title}</h2>
    <div class="medalbox">${ev.failed ? `<div class="bigmedal none">${ev.reason || 'FAILED'}</div>` : `<div class="bigmedal${ev.tier ? '' : ' none'}" style="--mc:${t.color}">${t.name}</div>`}
      <div class="ev-score">${fmt(d.goal.kind, ev.value)}${ev.newBest ? ' · NEW BEST' : ''}</div>
      <div class="targets">${medalLine(d)}</div></div>`;
  const list = el('div', 'list row');
  s.appendChild(list);
  ui.root.appendChild(s);
  const school = d.id.startsWith('school.');
  const next = school ? nextDrill(d.id) : null;
  const items = [
    { label: 'RETRY', action: () => ui.app.startEvent(d) },
    ...(next && !ev.failed ? [{ label: `NEXT · ${next.title}`, action: () => drillBrief(ui, next) }] : []),
    { label: school ? 'SHIFT SCHOOL' : 'BACK', action: () => ui.app.quitEvent() },
  ];
  ui.menu = new Menu(ui.app, list, items, { focus: next && ev.tier > 0 ? 1 : 0, onBack: () => ui.app.quitEvent() });
  ui.menu.nodes.forEach((n) => list.appendChild(n));
}
