// The screens for events (events.js): the SHIFT SCHOOL list, a small status panel during a run, and the result.
// (The panel is a stand-in until the HUD pass draws race.event.hud() itself.)

import { el, Menu } from './ui.js';
import { formatTime } from '../core/util.js';
import { SCHOOL, nextDrill } from '../game/school.js';
import { eventBest } from '../game/events.js';

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
  s.innerHTML = '<h2>SHIFT SCHOOL</h2><div class="sub">Six short drills, one for each thing a course asks of you. Earn gold in all six and you are ready for anything.</div>';
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
      action: () => ui.app.startEvent(d),
    };
  });
  items.push({ label: 'BACK', action: () => ui.title(), onFocus: () => (info.innerHTML = '') });
  ui.menu = new Menu(ui.app, list, items, { focus, onBack: () => ui.title() });
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
  const html = `<b>${h.title}</b><span class="ev-val">${val}</span>${h.timeLeft != null ? `<span class="ev-time">${Math.ceil(h.timeLeft)}s</span>` : ''}<i style="color:${t.color}">${h.failed ? 'FAILED' : h.kind === 'count' || h.kind === 'survive' ? t.name : `GOLD ${fmt(h.kind, h.target)}`}</i>`;
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
    ...(next && !ev.failed ? [{ label: `NEXT · ${next.title}`, action: () => ui.app.startEvent(next) }] : []),
    { label: school ? 'SHIFT SCHOOL' : 'BACK', action: () => ui.app.quitEvent() },
  ];
  ui.menu = new Menu(ui.app, list, items, { focus: next && ev.tier > 0 ? 1 : 0, onBack: () => ui.app.quitEvent() });
  ui.menu.nodes.forEach((n) => list.appendChild(n));
}
