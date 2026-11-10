// LENS TAG's screens (game/tag.js): the brief and the pick between solo and split-screen, the panel on the HUD
// (the clock, who's IT, the scores, and what your lens can tell you about IT), and the result.

import { el, Menu } from './ui.js';
import { ordinal } from '../core/util.js';
import { BOTH, RED, BLUE } from '../world/shift.js';
import { TAG } from '../game/tag.js';

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const LENS_CLS = { [BOTH]: 'both', [RED]: 'red', [BLUE]: 'blue' };
const LENS_WORD = { [BOTH]: 'BOTH', [RED]: 'RED', [BLUE]: 'BLUE' };

// ------------------------------------------------------------------ the brief
export function tagMenu(ui) {
  ui.clear();
  ui.hideHud();
  ui.app.showAttract(true);
  const s = el('div', 'screen school brief tag-brief');
  s.innerHTML = `<h2>LENS TAG</h2><div class="tour-tag">BATTLE · PRISM BOWL · ${clock(TAG.round)}</div>
    <div class="sub">One craft is IT and scores for every second it keeps the tag. IT hides in a lens: only that lens can see it.</div>
    <div class="lens-cards">
      <div class="lens-card red"><b>SAME LENS</b><p>IT in plain sight, under its beacon. Touch it to take the tag.</p></div>
      <div class="lens-card both"><b>BOTH</b><p>Sees IT's shimmer from anywhere, in IT's colour. Can't tag: IT phases through you.</p></div>
      <div class="lens-card blue"><b>OTHER LENS</b><p>IT isn't there at all: no car, no beacon, not on the map.</p></div>
    </div>
    <ol class="brief-how">
      <li>Look in BOTH, strike in a lens. A LANCE in RED lunges the last few metres.</li>
      <li>IT can shift too, and drains SHIFT like anyone: empty, it drops into BOTH where everyone sees it.</li>
      <li>IT in BOTH can be tagged from either lens. IT runs a touch slower than the hunters.</li>
      <li>A new IT can't be tagged for a moment, and you can't tag straight back. The last ${TAG.double} seconds score double.</li>
    </ol>`;
  const list = el('div', 'list row');
  s.appendChild(list);
  ui.root.appendChild(s);
  const go = (split) => {
    ui.choice.mode = 'tag';
    ui.choice.tagSplit = split;
    ui.app.audio.announce(split ? 'twoplayer' : 'ready');
    ui.carSelect();
  };
  ui.menu = new Menu(ui.app, list, [
    { label: 'SOLO · 5 CPUS', action: () => go(false) },
    { label: '2 PLAYER · 4 CPUS', action: () => go(true) },
    { label: 'BACK', action: () => ui.title() },
  ], { onBack: () => ui.title() });
  ui.menu.nodes.forEach((n) => list.appendChild(n));
}

// ------------------------------------------------------------------ on the HUD
// Per view: the clock and the scoreboard top centre, and under it what this player knows about IT: YOU'RE IT, IT
// in sight with an arrow and a distance, IT's shimmer (colour only, through BOTH), or nothing.
export function tagHud(ui, race) {
  const T = race.tag;
  if (!T || !ui.hs?.length) return;
  race.players.forEach((p, k) => {
    const h = ui.hs[k];
    if (!h) return;
    if (!h.tagBox) {
      h.tagBox = el('div', 'h-tag');
      h.root.appendChild(h.tagBox);
      // no laps and no places in a battle
      h.root.querySelectorAll('.h-lap, .h-place, .h-time, .h-best').forEach((n) => (n.style.visibility = 'hidden'));
    }
    const it = T.it;
    const st = T.standings();
    const top = st.slice(0, race.split ? 3 : 6);
    if (!top.includes(p)) top[top.length - 1] = p;
    const rows = top
      .map((r) => `<li class="${r === p ? 'me' : ''}${r === it ? ' it' : ''}"><i style="color:${hex(r.color)}">${r === it ? '◆' : '·'}</i><span>${r.name}</span><b>${Math.floor(T.score.get(r))}</b></li>`)
      .join('');
    const R = T.readout(p);
    let sig = '';
    let cls = 'h-tag';
    if (R.role === 'it') {
      sig = `<em class="you">YOU'RE IT${R.safe ? ' · SAFE' : ''}</em><small>HIDE IN A LENS · DON'T LET THEM MATCH IT</small>`;
      cls += ' am-it';
    } else if (R.role === 'hunt') {
      const name = it ? it.name : '';
      if (R.sight === 'none') sig = `<em class="lost">${name} · HIDDEN</em><small>NOT IN YOUR LENS · LOOK IN BOTH</small>`;
      else {
        const arrow = Math.abs(R.ang) < 0.5 ? '▲' : Math.abs(R.ang) > 2.6 ? '▼' : R.ang > 0 ? '▶' : '◀';
        const where = `${arrow} ${Math.round(R.dist)} M`;
        if (R.sight === 'shimmer') sig = `<em class="shimmer ${LENS_CLS[R.lens]}">${name} · SHIMMER</em><small>${where} · SHIFT ${LENS_WORD[R.lens]} TO TAG</small>`;
        else sig = `<em class="${LENS_CLS[R.lens]}">${name} · IN SIGHT</em><small>${where}${R.canTag ? ' · TOUCH TO TAG' : ' · BOTH CAN’T TAG'}</small>`;
      }
    }
    if (T.left <= TAG.double && !T.over) cls += ' double';
    const html = `<div class="tg-clock">${clock(Math.ceil(T.left))}${T.left <= TAG.double && !T.over ? '<u>×2</u>' : ''}</div><ol>${rows}</ol><div class="tg-sig">${sig}</div>`;
    if (h.tagBox._html !== html) h.tagBox.innerHTML = h.tagBox._html = html;
    if (h.tagBox.className !== cls) h.tagBox.className = cls;
  });
}

// ------------------------------------------------------------------ the result
export function tagResults(ui, race) {
  const T = race.tag;
  ui.hudRoot.hidden = true;
  ui.clear();
  const st = T.standings();
  const rows = st
    .map((r, k) => `<tr class="${r.isPlayer ? 'me' : ''}"><td>${ordinal(k + 1)}</td><td style="color:${hex(r.color)}">${r.name}</td><td>${Math.floor(T.score.get(r))} PTS</td><td>${T.tags.get(r)} TAG${T.tags.get(r) === 1 ? "" : "S"}</td></tr>`)
    .join('');
  const head = race.split ? race.players.map((pl) => `${pl.name} ${ordinal(st.indexOf(pl) + 1)}`).join(' · ') : st[0] === race.player ? 'TAG CHAMPION' : `${ordinal(st.indexOf(race.player) + 1)} PLACE`;
  const s = el('div', 'screen results tag-results');
  s.innerHTML = `<h2>${head}</h2><div class="tour-tag">LENS TAG · ${race.def.name}</div>
    <div class="rgrid"><table class="standings wide">${rows}</table></div>`;
  const list = el('div', 'list row');
  s.appendChild(list);
  ui.root.appendChild(s);
  ui.menu = new Menu(ui.app, list, [
    { label: 'RETRY', action: () => ui.app.startTag() },
    { label: 'LENS TAG', action: () => (ui.app.quit(), ui.app.openTag()) },
    { label: 'MENU', action: () => ui.app.quit() },
  ], { onBack: () => ui.app.quit() });
  ui.menu.nodes.forEach((n) => list.appendChild(n));
}
