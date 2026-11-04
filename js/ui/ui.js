// Menus and the race HUD, all DOM over the WebGL canvas. Menus work with keyboard, gamepad, mouse and touch.

import { TRACKS } from '../world/tracks.js';
import { TrackWorld } from '../world/track.js';
import { CARS } from '../vehicles/racer.js';
import { drawPaths, MiniMap } from './minimap.js';
import { BOTH, RED, BLUE, MODE_NAME } from '../world/shift.js';
import { formatTime, ordinal, storage } from '../core/util.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

export const LOGO = `<div class="logo"><span class="retro">RETRO</span><span class="shift">SHIFT</span></div>`;

// ------------------------------------------------------------------ generic focusable list
class Menu {
  constructor(app, root, items, opts = {}) {
    this.app = app;
    this.root = root;
    this.items = items;
    this.focus = opts.focus ?? 0;
    this.cols = opts.cols ?? 1;
    this.onBack = opts.onBack;
    this.nodes = items.map((it, k) => {
      const n = it.node || el('button', `item ${it.cls || ''}`, it.label);
      n.addEventListener('mouseenter', () => this.setFocus(k));
      n.addEventListener('click', () => {
        this.setFocus(k);
        this.activate();
      });
      return n;
    });
    this.setFocus(this.focus);
  }
  setFocus(k) {
    if (k !== this.focus) this.app.audio.play('ui', 0);
    this.focus = (k + this.items.length) % this.items.length;
    this.nodes.forEach((n, i) => n.classList.toggle('focus', i === this.focus));
    this.items[this.focus].onFocus?.();
  }
  activate() {
    this.app.audio.init();
    this.app.audio.play('ui', 1);
    this.items[this.focus].action?.();
  }
  update() {
    const I = this.app.input;
    const c = this.cols;
    if (I.menu('down')) this.setFocus(this.focus + c);
    if (I.menu('up')) this.setFocus(this.focus - c);
    if (c > 1 && I.menu('right')) this.setFocus(this.focus + 1);
    if (c > 1 && I.menu('left')) this.setFocus(this.focus - 1);
    if (c === 1 && (I.menu('left') || I.menu('right'))) this.items[this.focus].cycle?.(I.menu('right') ? 1 : -1);
    if (I.menu('confirm')) this.activate();
    else if (I.menu('back') && this.onBack) {
      this.app.audio.play('ui', 0);
      this.onBack();
    }
  }
}

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.hudRoot = document.getElementById('hud');
    this.menu = null;
    this.settings = storage.get('rs.settings', { music: 0.55, sfx: 0.8, difficulty: 1, laps: 0, quality: 'auto' });
    this.choice = { track: storage.get('rs.lastTrack', 'core'), car: storage.get('rs.lastCar', 'vector'), mode: 'race' };
    this.previews = new Map();
  }

  clear() {
    this.root.innerHTML = '';
    this.root.className = '';
    this.menu = null;
  }
  update() {
    this.menu?.update();
  }

  // ------------------------------------------------------------------ title
  title() {
    this.clear();
    this.hideHud();
    this.app.showAttract(true);
    const s = el('div', 'screen title');
    s.innerHTML = `${LOGO}<div class="tagline">/// DUAL WORLD RACING ///</div>
      <div class="lens-row"><span class="chip both">BOTH WORLDS</span><span class="chip red">RED ONLY</span><span class="chip blue">BLUE ONLY</span></div>`;
    const list = el('div', 'list');
    const items = [
      { label: 'RACE', action: () => ((this.choice.mode = 'race'), this.trackSelect()) },
      { label: 'TIME TRIAL', action: () => ((this.choice.mode = 'trial'), this.trackSelect()) },
      { label: 'HOW TO PLAY', action: () => this.howTo() },
      { label: 'SETTINGS', action: () => this.settingsScreen() },
    ];
    s.appendChild(list);
    s.appendChild(el('div', 'foot', 'Made for GitHub Game Off 2026 · a Forbidden Fruit Productions game · every line and every sound generated live'));
    this.root.appendChild(s);
    this.menu = new Menu(this.app, list, items);
    this.menu.nodes.forEach((n) => list.appendChild(n));
  }

  howTo() {
    this.clear();
    const s = el('div', 'screen howto');
    const g = (a) => `<kbd>${a}</kbd>`;
    s.innerHTML = `<h2>HOW TO PLAY</h2>
      <div class="cols">
        <div class="card both"><h3>BOTH WORLDS</h3><p>Red and blue overlap. Every road is there, and so is every wall. Your SHIFT bar refills.</p></div>
        <div class="card red"><h3>RED ONLY</h3><p>Blue roads, blue walls and blue shortcuts vanish. Drive straight through blue walls. Drains SHIFT.</p></div>
        <div class="card blue"><h3>BLUE ONLY</h3><p>Red things vanish instead. Look for blue-only cuts. Drains SHIFT.</p></div>
      </div>
      <p class="rule">Watch the road: if the strip under you is the colour you shifted away from, it's gone. Grab white shards for SHIFT, phase through walls for a little more.</p>
      <table class="keys">
        <tr><td>Drive</td><td>${g('W')} ${g('A')} ${g('S')} ${g('D')} / arrows</td><td>RT · LT · stick</td></tr>
        <tr><td>Drift (hold, release for turbo)</td><td>${g('SPACE')} / ${g('SHIFT')}</td><td>X / □</td></tr>
        <tr><td>Shift to RED</td><td>${g('Q')} or ${g('1')}</td><td>LB / L1</td></tr>
        <tr><td>Shift to BLUE</td><td>${g('E')} or ${g('3')}</td><td>RB / R1</td></tr>
        <tr><td>Back to BOTH (or press your lens again)</td><td>${g('F')} or ${g('2')}</td><td>Y / △</td></tr>
        <tr><td>Look back · Reset</td><td>${g('C')} · ${g('R')}</td><td>RS · VIEW</td></tr>
      </table>`;
    const list = el('div', 'list row');
    s.appendChild(list);
    this.root.appendChild(s);
    this.menu = new Menu(this.app, list, [{ label: 'BACK', action: () => this.title() }], { onBack: () => this.title() });
    this.menu.nodes.forEach((n) => list.appendChild(n));
  }

  settingsScreen() {
    this.clear();
    const S = this.settings;
    const s = el('div', 'screen settings');
    s.innerHTML = '<h2>SETTINGS</h2>';
    const list = el('div', 'list');
    const pct = (v) => `${Math.round(v * 100)}%`;
    const diffs = ['EASY', 'NORMAL', 'HARD'];
    const quals = ['auto', 'high', 'medium', 'low'];
    const save = () => {
      storage.set('rs.settings', S);
      this.app.applySettings(S);
    };
    const items = [
      { label: '', cycle: (d) => ((S.music = Math.max(0, Math.min(1, S.music + d * 0.1))), save(), refresh()), action: () => items[0].cycle(1) },
      { label: '', cycle: (d) => ((S.sfx = Math.max(0, Math.min(1, S.sfx + d * 0.1))), save(), refresh()), action: () => items[1].cycle(1) },
      { label: '', cycle: (d) => ((S.difficulty = (S.difficulty + d + 3) % 3), save(), refresh()), action: () => items[2].cycle(1) },
      { label: '', cycle: (d) => ((S.quality = quals[(quals.indexOf(S.quality) + d + quals.length) % quals.length]), save(), refresh()), action: () => items[3].cycle(1) },
      { label: 'BACK', action: () => this.title() },
    ];
    s.appendChild(list);
    this.root.appendChild(s);
    this.menu = new Menu(this.app, list, items, { onBack: () => this.title() });
    const refresh = () => {
      const labels = [`MUSIC ◀ ${pct(S.music)} ▶`, `EFFECTS ◀ ${pct(S.sfx)} ▶`, `RIVALS ◀ ${diffs[S.difficulty]} ▶`, `GRAPHICS ◀ ${S.quality.toUpperCase()} ▶`];
      labels.forEach((l, k) => (this.menu.nodes[k].innerHTML = l));
    };
    refresh();
    this.menu.nodes.forEach((n) => list.appendChild(n));
  }

  // ------------------------------------------------------------------ track select
  preview(def) {
    if (this.previews.has(def.id)) return this.previews.get(def.id);
    const w = new TrackWorld(def, { preview: true });
    this.previews.set(def.id, w);
    return w;
  }

  trackSelect() {
    this.clear();
    this.app.showAttract(true);
    const s = el('div', 'screen tracks');
    s.innerHTML = `<h2>${this.choice.mode === 'trial' ? 'TIME TRIAL' : 'RACE'} · SELECT A COURSE</h2>`;
    const grid = el('div', 'grid');
    const items = TRACKS.map((def) => {
      const best = storage.get(`rs.best.${def.id}`, null);
      const card = el('button', 'item tcard');
      const cv = el('canvas', 'tmap');
      cv.width = 220;
      cv.height = 130;
      card.innerHTML = `<div class="tnum">${def.num}</div>`;
      card.appendChild(cv);
      card.appendChild(el('div', 'tname', def.name));
      card.appendChild(el('div', 'tblurb', def.blurb));
      card.appendChild(el('div', 'tbest', best ? `BEST ${formatTime(best.time)}` : '&nbsp;'));
      requestAnimationFrame(() => {
        const ctx = cv.getContext('2d');
        drawPaths(ctx, this.preview(def).paths, cv.width, cv.height, 7, 10, null, 2.5);
      });
      return {
        node: card,
        action: () => {
          this.choice.track = def.id;
          storage.set('rs.lastTrack', def.id);
          this.carSelect();
        },
      };
    });
    s.appendChild(grid);
    this.root.appendChild(s);
    const focus = Math.max(0, TRACKS.findIndex((t) => t.id === this.choice.track));
    this.menu = new Menu(this.app, grid, items, { cols: 5, focus, onBack: () => this.title() });
    this.menu.nodes.forEach((n) => grid.appendChild(n));
  }

  // ------------------------------------------------------------------ car select
  carSelect() {
    this.clear();
    const s = el('div', 'screen cars');
    s.innerHTML = '<h2>SELECT A WEDGE</h2>';
    const grid = el('div', 'grid cars-grid');
    const bars = (v) => '<i class="on"></i>'.repeat(v) + '<i></i>'.repeat(5 - v);
    const items = CARS.map((car) => {
      const n = el('button', 'item ccard');
      n.style.setProperty('--c', hex(car.color));
      n.innerHTML = `<svg viewBox="-30 -20 60 40" class="wedge"><polygon points="-14,10 14,10 17,-2 7,-12 -7,-12 -17,-2" /><polyline points="-10,6 10,6 9,-4 -9,-4 -10,6" /></svg>
        <div class="cname">${car.name}</div>
        <div class="stat"><span>SPEED</span><b>${bars(car.stats.speed)}</b></div>
        <div class="stat"><span>ACCEL</span><b>${bars(car.stats.accel)}</b></div>
        <div class="stat"><span>HANDLING</span><b>${bars(car.stats.handling)}</b></div>`;
      return {
        node: n,
        action: () => {
          this.choice.car = car.id;
          storage.set('rs.lastCar', car.id);
          this.app.startRace();
        },
      };
    });
    s.appendChild(grid);
    this.root.appendChild(s);
    const focus = Math.max(0, CARS.findIndex((c) => c.id === this.choice.car));
    this.menu = new Menu(this.app, grid, items, { cols: 3, focus, onBack: () => this.trackSelect() });
    this.menu.nodes.forEach((n) => grid.appendChild(n));
  }

  // ------------------------------------------------------------------ pause & results
  pause() {
    this.clear();
    const s = el('div', 'screen pause');
    s.innerHTML = '<h2>PAUSED</h2>';
    const list = el('div', 'list');
    s.appendChild(list);
    this.root.appendChild(s);
    this.menu = new Menu(this.app, list, [
      { label: 'RESUME', action: () => this.app.resume() },
      { label: 'RESTART', action: () => this.app.startRace() },
      { label: 'QUIT TO MENU', action: () => this.app.quit() },
    ], { onBack: () => this.app.resume() });
    this.menu.nodes.forEach((n) => list.appendChild(n));
  }

  results(race) {
    this.clear();
    const p = race.player;
    const place = race.placeOf(p);
    const s = el('div', 'screen results');
    const rows = race
      .standings()
      .map((r, k) => `<tr class="${r.isPlayer ? 'me' : ''}"><td>${ordinal(k + 1)}</td><td style="color:${hex(r.color)}">${r.name}</td><td>${r.finished ? formatTime(r.finishTime) : '--'}</td></tr>`)
      .join('');
    const trial = race.opts.rivals === 0;
    s.innerHTML = `<h2>${trial ? 'TIME TRIAL' : place === 1 ? 'YOU WIN' : `${ordinal(place)} PLACE`}</h2>
      <div class="rgrid">
        <table class="standings">${rows}</table>
        <div class="rstats">
          <div><span>TIME</span><b>${formatTime(p.finishTime)}</b></div>
          <div><span>BEST LAP</span><b>${formatTime(p.bestLap)}</b></div>
          <div><span>SHIFTS</span><b>${race.stats.shifts}</b></div>
          <div><span>PHASED</span><b>${race.stats.phased}</b></div>
          <div><span>CRASHES</span><b>${race.stats.crashes}</b></div>
          ${race.newRecord ? '<div class="record">NEW COURSE RECORD</div>' : ''}
        </div>
      </div>`;
    const list = el('div', 'list row');
    s.appendChild(list);
    this.root.appendChild(s);
    const idx = TRACKS.findIndex((t) => t.id === race.def.id);
    const items = [
      {
        label: 'NEXT COURSE',
        action: () => {
          this.choice.track = TRACKS[(idx + 1) % TRACKS.length].id;
          storage.set('rs.lastTrack', this.choice.track);
          this.app.startRace();
        },
      },
      { label: 'RETRY', action: () => this.app.startRace() },
      { label: 'MENU', action: () => this.app.quit() },
    ];
    this.menu = new Menu(this.app, list, items, { cols: 3 });
    this.menu.nodes.forEach((n) => list.appendChild(n));
  }

  // ------------------------------------------------------------------ HUD
  buildHud(race) {
    const H = this.hudRoot;
    H.innerHTML = `
      <div class="h-tl"><div class="h-place"><b>1</b><sup>ST</sup><small>/6</small></div><div class="h-lap">LAP <b>1</b>/3</div><div class="h-time">0:00.00</div></div>
      <div class="h-tr"><div class="h-course"></div><div class="h-best"></div></div>
      <canvas class="h-map"></canvas>
      <div class="h-speed"><b>0</b><small>KM/H</small><div class="h-drift"></div></div>
      <div class="h-lens">
        <div class="h-chips">
          <span class="chip red" data-m="2"><kbd></kbd>RED</span>
          <span class="chip both" data-m="1"><kbd></kbd>BOTH</span>
          <span class="chip blue" data-m="4"><kbd></kbd>BLUE</span>
        </div>
        <div class="h-energy"><i></i><span>SHIFT</span></div>
      </div>
      <div class="h-center"></div>
      <div class="h-tip"></div>
      <div class="h-count"></div>
      <div class="h-wrong">WRONG WAY</div>
      <div class="h-flash"></div>
      <button class="h-pause" aria-label="Pause">❚❚</button>`;
    H.hidden = false;
    const q = (s) => H.querySelector(s);
    this.h = {
      place: q('.h-place b'),
      placeSup: q('.h-place sup'),
      placeOf: q('.h-place small'),
      lap: q('.h-lap'),
      time: q('.h-time'),
      course: q('.h-course'),
      best: q('.h-best'),
      speed: q('.h-speed b'),
      drift: q('.h-drift'),
      chips: [...H.querySelectorAll('.h-chips .chip')],
      energy: q('.h-energy i'),
      energyBox: q('.h-energy'),
      center: q('.h-center'),
      tip: q('.h-tip'),
      count: q('.h-count'),
      wrong: q('.h-wrong'),
      flash: q('.h-flash'),
    };
    q('.h-pause').addEventListener('click', () => this.app.pause());
    this.map = new MiniMap(q('.h-map'));
    this.h.course.textContent = `${race.def.num} ${race.def.name}`;
    const best = storage.get(`rs.best.${race.def.id}`, null);
    this.h.best.textContent = best ? `RECORD ${formatTime(best.time)}` : '';
    this.mapT = 0;
    this.lastPlace = 0;
    this.lastTipT = 0;
  }
  hideHud() {
    this.hudRoot.hidden = true;
    this.hudRoot.innerHTML = '';
    this.h = null;
  }

  popup(text, color, small = false) {
    if (!this.h) return;
    const n = el('div', `pop ${small ? 'small' : ''}`, text);
    n.style.color = color;
    this.h.center.appendChild(n);
    while (this.h.center.children.length > 3) this.h.center.firstChild.remove();
    setTimeout(() => n.remove(), 1300);
  }

  updateHud(race, dt) {
    const h = this.h;
    if (!h) return;
    const p = race.player;
    const I = this.app.input;
    for (const e of race.events) {
      switch (e.type) {
        case 'shift': {
          h.flash.className = `h-flash on m${e.mode}`;
          void h.flash.offsetWidth;
          h.flash.className = `h-flash go m${e.mode}`;
          if (e.forced) this.popup('SHIFT EMPTY', '#ffffff', true);
          break;
        }
        case 'denied':
          h.energyBox.classList.remove('deny');
          void h.energyBox.offsetWidth;
          h.energyBox.classList.add('deny');
          break;
        case 'popup':
          this.popup(e.text, e.color, e.small);
          break;
        case 'lap':
          this.popup(`LAP ${e.lap} · ${formatTime(e.time)}`, '#ffffff');
          break;
        case 'count':
          h.count.textContent = e.n > 0 ? e.n : 'GO!';
          h.count.className = `h-count on n${Math.max(0, e.n)}`;
          if (e.n <= 0) setTimeout(() => (h.count.className = 'h-count'), 700);
          break;
        case 'tip': {
          const glyph = { red: I.glyph('red'), blue: I.glyph('blue'), both: I.glyph('both') }[e.key] || '';
          h.tip.innerHTML = `${e.text}${glyph ? ` <kbd>${glyph}</kbd>` : ''}`;
          h.tip.className = `h-tip on k-${e.key}`;
          clearTimeout(this.tipTimer);
          this.tipTimer = setTimeout(() => (h.tip.className = 'h-tip'), 3200);
          break;
        }
        case 'finish':
          this.popup(race.opts.rivals === 0 ? 'FINISH' : `${ordinal(e.place)} PLACE`, '#ff4fd8');
          break;
      }
    }
    race.events.length = 0;
    const place = race.placeOf(p);
    const n = race.racers.length;
    const ord = ordinal(place);
    h.place.textContent = place;
    h.placeSup.textContent = ord.slice(String(place).length);
    h.placeOf.textContent = `/${n}`;
    h.lap.innerHTML = `LAP <b>${Math.min(race.laps, p.lap + 1)}</b>/${race.laps}`;
    h.time.textContent = formatTime(p.finished ? p.finishTime : race.raceTime);
    h.speed.textContent = Math.round(Math.abs(p.speed) * 3.6);
    h.drift.className = `h-drift l${p.drift.active ? p.drift.level : 0}`;
    for (const c of h.chips) {
      const m = +c.dataset.m;
      c.classList.toggle('active', m === p.mode);
      const k = c.querySelector('kbd');
      const g = m === RED ? I.glyph('red') : m === BLUE ? I.glyph('blue') : I.glyph('both');
      if (k.textContent !== g) k.textContent = g;
    }
    h.energy.style.width = `${(p.energy * 100).toFixed(1)}%`;
    h.energyBox.className = `h-energy m${p.mode}${p.energy < 0.25 ? ' low' : ''}${h.energyBox.classList.contains('deny') ? ' deny' : ''}`;
    h.wrong.classList.toggle('on', (p.wrongWay || 0) > 1.2 && race.state === 'race');
    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 1 / 20;
      this.map.draw(race.world, race.racers, p.mode);
    }
    document.body.dataset.mode = MODE_NAME[p.mode];
  }
}

export { BOTH };
