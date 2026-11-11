// Menus and the race HUD, all DOM over the WebGL canvas. Menus work with keyboard, gamepad, mouse and touch.

import { drawPortrait } from './portraits.js';
import { helmetPortrait, warmHelmets } from './helmets.js';
import { ITEMS } from '../game/items.js';
import { CHAIN } from '../game/chain.js';
import { ITEM_ICONS } from './itemicons.js';
const ITEM_IDS = Object.keys(ITEMS);
import { TRACKS } from '../world/tracks.js';
import { TrackWorld } from '../world/track.js';
import { CARS } from '../vehicles/racer.js';
import { drawPaths, MiniMap } from './minimap.js';
import { BOTH, RED, BLUE, MODE_NAME } from '../world/shift.js';
import { SPLIT_GLYPHS } from '../core/input.js';
import { formatTime, ordinal, storage } from '../core/util.js';
import { CUPS, BONUS, cupReady, courseOpen, courseLock, openTracks, POINTS, TROPHY, getProgress, saveProgress as saveProgressUI, medalInfo, isUnlocked, unlockFor, COLORWAYS, getGarage, setLivery, liveryFor } from '../game/modes.js';
import { loadGhost } from '../game/ghost.js';
import { playerName, setPlayerName, courseName, MAX_PLAYERS } from '../net/online.js';
import { PREMISE, CUP_STORY, SECRET_SCENES, DRIVERS } from '../game/story.js';
import { accessScreen } from './access.js';

export const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

export const MODE_TITLE = { race: 'SINGLE RACE', trial: 'TIME TRIAL', mono: 'MONO RUN', gp: 'GRAND PRIX', split: '2 PLAYER' };
export const LOGO = `<div class="logo"><span class="retro">RETRO</span><span class="shift">SHIFT</span></div>`;

// ------------------------------------------------------------------ generic focusable list
export class Menu {
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
    if (document.activeElement?.tagName === 'INPUT') return;
    // in a single-row menu the arrows left and right walk the row, so up and down turn a ◀ ▶ item (the lobby's course)
    const row = c > 1 && this.items.length <= c && this.items[this.focus].cycle;
    if (I.menu('down')) row ? this.items[this.focus].cycle(1) : this.setFocus(this.focus + c);
    if (I.menu('up')) row ? this.items[this.focus].cycle(-1) : this.setFocus(this.focus - c);
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
    this.choice = { track: storage.get('rs.lastTrack', 'core'), car: storage.get('rs.lastCar', 'vector'), mode: 'race', cup: 'signal' };
    this.previews = new Map();
    this.sceneQueue = [];
    this.scenesShown = new Set();
    this.netAttempt = 0;
  }

  clear() {
    this.screenWas = this.root.querySelector('.screen.lobby') ? 'lobby' : null;
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
      { label: 'GRAND PRIX', action: () => ((this.choice.mode = 'gp'), this.app.audio.announce('grandprix'), this.cupSelect()) },
      { label: 'SHIFT TOUR', action: () => this.app.openTour() },
      { label: 'SINGLE RACE', action: () => ((this.choice.mode = 'race'), this.app.audio.announce('ready'), this.trackSelect()) },
      { label: 'TIME TRIAL', action: () => ((this.choice.mode = 'trial'), this.app.audio.announce('timetrial'), this.trackSelect()) },
      { label: 'MONO RUN', action: () => ((this.choice.mode = 'mono'), this.app.audio.announce('monorun'), this.trackSelect()) },
      { label: '2 PLAYER', action: () => ((this.choice.mode = 'split'), this.app.audio.announce('twoplayer'), this.trackSelect()) },
      { label: 'ONLINE', action: () => (this.app.audio.announce('online'), this.onlineMenu()) },
      { label: 'GARAGE', action: () => this.garage() },
      { label: 'FIRST RUN', action: () => this.app.startTutorial() },
      { label: 'SHIFT SCHOOL', action: () => this.app.openSchool() },
      { label: 'HOW TO PLAY', action: () => this.howTo() },
      { label: 'SETTINGS', action: () => this.settingsScreen() },
    ];
    s.appendChild(list);
    s.appendChild(el('div', 'foot', 'Made for GitHub Game Off 2026 · a Forbidden Fruit Productions game · every line drawn and every note played live'));
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
        <div class="card both"><h3>BOTH WORLDS</h3><p>The safe lens. Everything's there and your SHIFT bar refills, but you're a step slower.</p></div>
        <div class="card red"><h3>RED ONLY</h3><p>The BLADE: the deck drops away and you ride the bike. Raw speed with a loose back end, and the wheel clings to the road: it holds a drop or a crest and accelerates down it, fits through a SLIT and rides a WALL RUN. The blue world is gone, red-only shortcuts appear. Drains SHIFT.</p></div>
        <div class="card blue"><h3>BLUE ONLY</h3><p>The SKIMMER: the bike folds away and you fly the hover deck. Grip in corners, drifts charge their turbo faster, it skims water, and at speed it glides off a drop or across a GLIDE GAP. The red world is gone, blue-only routes appear. Drains SHIFT.</p></div>
      </div>
      <p class="rule"><b>TWO MACHINES IN ONE</b>: every craft is a red Blade docked in a blue Skimmer, and BOTH drives the pair, which jumps what the Blade clings to and the Skimmer glides. The boards before a drop, a crest, water, a slit, a wall run or a glide gap say which form reads it; pick the form, take the route, and watch your SHIFT.</p>
      <p class="rule">Shift into a wall at the last moment for a CLOSE PHASE boost. A road that only your lens can see doesn't drain SHIFT. Watch the road: if the strip under you is the colour you shifted away from, it's gone. Grab white shards for SHIFT, phase through walls for a little more.</p>
      <p class="rule"><b>HULL</b>: hits take hull (the cells under SHIFT), they don't wreck you; only an empty hull comes apart, and it patches itself up between hits, faster in BOTH. <b>SEAM CHARGES</b>: drive through a prism gate to roll one, fire it with your CHARGE button: LENS CELL, EMP, FLIP, LIGHTSPEED, SEAM WALL or PATCH. <b>FORM MOVES</b>: the Skimmer LIFTs (tap to HOVER over traffic and low blocks, double-tap to JUMP a wall), the Blade LANCEs through a rival, the pair BRACEs behind a shield. <b>LAUNCHERS</b>: a hole in one lens is a ramp in the other. Honk at a rival to taunt them, if you can take the heat.</p>
      <p class="rule"><b>STORMS</b>: meteors fall in the red world, lightning strikes in the blue. Dodge the rings, or shift to the other lens, where the storm isn't, and lose that lens's shortcuts.</p>
      <p class="rule"><b>ROAD WORKS</b> on Fractal Route move to a new stretch every lap: blue barriers shut the left lane, a red digger shuts the right, and the crane's load swings over the slit between. RED opens the left lane, BLUE the right. <b>ECHO RUINS</b> shakes itself apart over three laps: a quake, then lava (BLUE cools it, RED and BOTH burn), then the plates split and the road you learned is gone. Hold speed for the rift; RED clings down the drop and the slab, BLUE glides.</p>
      <p class="rule"><b>HEAVY TRAFFIC</b> (Grid City): every car on the road is in one world. Weave through it in BOTH, or shift to a lens to clear half the road and give up that lens's routes. Rear-end one flat out and it comes apart, and so does a good piece of your hull. <b>POLICE CHASE</b> (Void Field): once a lap a getaway car and three cruisers tear through the field. Cruisers ram and fire lasers, each shot marked by rings a beat before it lands. The chase only exists in BOTH: hold a lens to drive straight through it, and mind that lens's holes in the road.</p>
      <p class="rule"><b>MONO RUN</b> takes BOTH away: your BOTH button swaps RED and BLUE, each swap costs SHIFT, and nothing refills it but shards and phasing.</p>
      <table class="keys">
        <tr><td>Drive</td><td>${g('W')} ${g('A')} ${g('S')} ${g('D')} / arrows</td><td>RT · LT · stick</td></tr>
        <tr><td>Drift (hold, release for turbo)</td><td>${g('SPACE')}</td><td>X / □</td></tr>
        <tr><td>Shift to RED</td><td>${g('LEFT SHIFT')} or ${g('Q')}</td><td>LB / L1</td></tr>
        <tr><td>Shift to BLUE</td><td>${g('RIGHT SHIFT')} or ${g('E')}</td><td>RB / R1</td></tr>
        <tr><td>Back to BOTH (or press your lens again)</td><td>${g('BOTH SHIFTS')} or ${g('F')}</td><td>Y / △</td></tr>
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
      { label: '', cycle: () => ((S.assist = S.assist === false), save(), refresh()), action: () => items[4].cycle(1) },
      { label: 'ACCESSIBILITY', action: () => accessScreen(this) },
      { label: 'BACK', action: () => this.title() },
    ];
    s.appendChild(list);
    this.root.appendChild(s);
    this.menu = new Menu(this.app, list, items, { onBack: () => this.title() });
    const refresh = () => {
      const labels = [`MUSIC ◀ ${pct(S.music)} ▶`, `EFFECTS ◀ ${pct(S.sfx)} ▶`, `RIVALS ◀ ${diffs[S.difficulty]} ▶`, `GRAPHICS ◀ ${S.quality.toUpperCase()} ▶`, `STEERING ◀ ${S.assist === false ? 'FULL CONTROL' : 'ASSIST'} ▶`];
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
    const mode = this.choice.mode;
    const prog = getProgress();
    s.innerHTML = `<h2>${MODE_TITLE[mode]} · SELECT A COURSE</h2>${mode === 'mono' ? '<div class="sub">Never both worlds. Your BOTH button swaps RED and BLUE, every swap costs SHIFT, and only shards and phasing refill it.</div>' : ''}`;
    const grid = el('div', 'grid');
    const items = TRACKS.map((def) => {
      if (!courseOpen(def.id)) {
        const card = el('button', 'item tcard locked');
        const bonus = def.id === BONUS.track;
        card.innerHTML = `<div class="tnum">${def.num}</div><div class="tmap tlock">LOCKED</div><div class="tname">${bonus ? '???' : def.name}</div>
          <div class="tblurb">${bonus ? 'BONUS COURSE · ' : ''}${unlockFor(courseLock(def.id))?.hint || ''}</div><div class="tbest">&nbsp;</div>`;
        return { node: card, action: () => {} };
      }
      const best = mode === 'mono' ? loadGhost(def.id, true) : storage.get(`rs.best.${def.id}`, null);
      const medal = medalInfo((mode === 'mono' ? prog.mono : prog.trial)[def.id] || 0);
      const card = el('button', 'item tcard');
      const cv = el('canvas', 'tmap');
      cv.width = 220;
      cv.height = 130;
      card.innerHTML = `<div class="tnum">${def.num}</div>`;
      card.appendChild(cv);
      card.appendChild(el('div', 'tname', def.name));
      card.appendChild(el('div', 'tblurb', def.blurb));
      const medalTag = medal && mode !== 'race' ? ` <span class="medal" style="--mc:${medal.color}">${medal.name}</span>` : '';
      card.appendChild(el('div', 'tbest', best ? `BEST ${formatTime(best.time)}${medalTag}` : '&nbsp;'));
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
    const focus = Math.max(0, TRACKS.findIndex((t) => t.id === this.choice.track && courseOpen(t.id)));
    this.menu = new Menu(this.app, grid, items, { cols: 5, focus, onBack: () => this.title() });
    this.menu.nodes.forEach((n) => grid.appendChild(n));
  }

  // ------------------------------------------------------------------ car select
  carCard(car) {
    const open = isUnlocked(`car:${car.id}`);
    const n = el('button', `item ccard ${open ? '' : 'locked'} ${car.secret ? 'secret' : ''}`);
    n.style.setProperty('--c', hex(car.color));
    const bars = (v) => '<i class="on"></i>'.repeat(v) + '<i></i>'.repeat(5 - v);
    const u = unlockFor(`car:${car.id}`);
    if (!open && car.secret) {
      n.innerHTML = `<div class="cname">???</div><div class="cfrom">SECRET DRIVER</div><div class="chint">${u?.hint || ''}</div>`;
    } else {
      n.innerHTML = `<div class="cname">${car.name}</div>${car.from ? `<div class="cfrom">from ${car.from}</div>` : ''}
        <div class="stat"><span>SPEED</span><b>${bars(car.stats.speed)}</b></div>
        <div class="stat"><span>ACCEL</span><b>${bars(car.stats.accel)}</b></div>
        <div class="stat"><span>HANDLING</span><b>${bars(car.stats.handling)}</b></div>
        ${open ? '' : `<div class="chint">LOCKED · ${u?.hint || ''}</div>`}`;
    }
    return { n, open };
  }

  carSelect(who = 1) {
    this.clear();
    const s = el('div', 'screen cars');
    const split = this.choice.mode === 'split';
    s.innerHTML = `<h2>${split ? `PLAYER ${who} · ` : ''}SELECT A CRAFT</h2>${split ? `<div class="sub">${who === 1 ? 'Player 1 drives with W A S D, shifts with Q · F · E, drifts with SPACE.' : 'Player 2 drives with the arrows, shifts with , . /, drifts with RIGHT SHIFT. Gamepads work too.'}</div>` : ''}<div class="stage-gap"></div>`;
    const grid = el('div', 'grid cars-grid');
    const items = CARS.map((car) => {
      const { n, open } = this.carCard(car);
      return {
        node: n,
        onFocus: () => (open || !car.secret ? this.app.showCar(car, liveryFor(car.id)) : this.app.hideCar()),
        action: () => {
          if (!open) return this.app.audio.play('denied');
          if (split && who === 2) {
            this.choice.car2 = car.id;
            storage.set('rs.lastCar2', car.id);
            return this.app.startRace();
          }
          this.choice.car = car.id;
          storage.set('rs.lastCar', car.id);
          if (split) return this.carSelect(2);
          if (this.choice.mode === 'online') {
            this.app.net.setCar(car.id, liveryFor(car.id));
            return this.lobby();
          }
          if (this.choice.mode === 'gp') this.app.startGP(this.choice.cup);
          else this.app.startRace();
        },
      };
    });
    s.appendChild(grid);
    this.root.appendChild(s);
    const cur = who === 2 ? this.choice.car2 || storage.get('rs.lastCar2', 'scanline') : this.choice.car;
    const focus = Math.max(0, CARS.findIndex((c) => c.id === cur));
    this.menu = new Menu(this.app, grid, items, { cols: 4, focus, onBack: () => (who === 2 ? this.carSelect(1) : this.choice.mode === 'online' ? this.lobby() : this.choice.mode === 'gp' ? this.cupSelect() : this.trackSelect()) });
    this.menu.nodes.forEach((n) => grid.appendChild(n));
  }

  // ------------------------------------------------------------------ online: host or join a room, then the lobby
  onlineMenu(msg) {
    this.clear();
    this.hideHud();
    this.app.showAttract(true);
    this.choice.mode = 'online';
    const net = this.app.net;
    const s = el('div', 'screen online');
    s.innerHTML = `<h2>ONLINE</h2><div class="sub">Up to ${MAX_PLAYERS} racers. One of you hosts and shares the room code; empty places on the grid go to AI rivals.</div>
      ${msg ? `<div class="net-msg">${msg}</div>` : ''}
      <label class="field"><span>YOUR NAME</span><input class="net-name" maxlength="12" spellcheck="false" autocomplete="off"></label>`;
    const nameIn = s.querySelector('.net-name');
    nameIn.value = playerName();
    nameIn.addEventListener('change', () => setPlayerName(nameIn.value));
    const list = el('div', 'list');
    const code = el('div', 'join-row');
    code.innerHTML = '<input class="net-code" maxlength="4" placeholder="CODE" spellcheck="false" autocomplete="off">';
    const codeIn = code.querySelector('input');
    const status = el('div', 'net-status');
    const profile = () => {
      setPlayerName(nameIn.value);
      return { name: playerName(), car: this.choice.car, livery: liveryFor(this.choice.car) };
    };
    const fail = (e) => {
      status.textContent = e?.message || 'Could not connect';
      status.classList.add('bad');
    };
    // A failed attempt only tears down the connection if it is still the latest one: a join that times out
    // after the player has gone on to host would otherwise close their new room under them.
    const attempt = () => ++this.netAttempt;
    const hostIt = async () => {
      const my = attempt();
      status.textContent = 'Opening a room...';
      status.classList.remove('bad');
      try {
        await net.host(profile());
        this.lobby();
      } catch (e) {
        if (my !== this.netAttempt) return;
        net.close();
        fail(e);
      }
    };
    const joinIt = async () => {
      const c = codeIn.value.trim();
      if (c.length < 4) {
        codeIn.focus();
        return fail(new Error('Type the 4-letter room code first'));
      }
      const my = attempt();
      status.textContent = `Looking for room ${c.toUpperCase()}...`;
      status.classList.remove('bad');
      try {
        await net.join(c, profile());
        if (my === this.netAttempt) this.lobby();
      } catch (e) {
        if (my !== this.netAttempt) return;
        net.close();
        fail(e);
      }
    };
    codeIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinIt();
      if (e.key === 'Escape') codeIn.blur();
    });
    nameIn.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === 'Escape') && nameIn.blur());
    const items = [
      { label: 'HOST A ROOM', action: hostIt },
      { label: 'JOIN A ROOM', action: () => (codeIn.value.trim().length >= 4 ? joinIt() : codeIn.focus()) },
      { label: 'BACK', action: () => this.title() },
    ];
    s.appendChild(code);
    s.appendChild(list);
    s.appendChild(status);
    this.root.appendChild(s);
    this.menu = new Menu(this.app, list, items, { onBack: () => this.title() });
    this.menu.nodes.forEach((n) => list.appendChild(n));
  }

  lobby() {
    this.clear();
    this.hideHud();
    this.app.showAttract(true);
    this.choice.mode = 'online';
    const net = this.app.net;
    if (!net.active) return this.onlineMenu();
    const s = el('div', 'screen lobby');
    const host = net.isHost;
    const rows = Array.from({ length: MAX_PLAYERS }, (_, k) => {
      const p = net.players[k];
      if (!p) return `<tr class="empty"><td>${k + 1}</td><td>AI RIVAL</td><td></td></tr>`;
      const car = CARS.find((c) => c.id === p.car) || CARS[0];
      return `<tr class="${p.slot === net.mySlot ? 'me' : ''}"><td>${k + 1}</td><td>${p.name}${p.slot === 0 ? ' <small>HOST</small>' : ''}</td><td style="color:${hex(car.color)}">${car.name}</td></tr>`;
    }).join('');
    s.innerHTML = `<h2>ROOM <span class="code">${net.code}</span></h2>
      <div class="sub">${host ? 'Share the code. Friends pick ONLINE, then JOIN A ROOM.' : 'Waiting for the host to start the race.'}</div>
      <div class="rgrid"><table class="standings lobby-table">${rows}</table>
      <div class="lobby-course"><span>COURSE</span><b>${courseName(net.course)}</b><canvas width="220" height="130"></canvas></div></div>`;
    const cv = s.querySelector('canvas');
    const def = TRACKS.find((t) => t.id === net.course);
    if (def) requestAnimationFrame(() => drawPaths(cv.getContext('2d'), this.preview(def).paths, cv.width, cv.height, 7, 10, null, 2.5));
    const list = el('div', 'list row');
    const cycleCourse = (d) => {
      const open = openTracks();
      const i = Math.max(0, open.findIndex((t) => t.id === net.course));
      net.setCourse(open[(i + d + open.length) % open.length].id);
    };
    const items = [
      ...(host ? [{ label: 'START RACE', action: () => net.start() }, { label: '◀ COURSE ▶', action: () => cycleCourse(1), cycle: cycleCourse }] : []),
      { label: 'CHANGE CRAFT', action: () => this.carSelect() },
      { label: 'LEAVE ROOM', action: () => (net.close(), this.onlineMenu()) },
    ];
    s.appendChild(list);
    this.root.appendChild(s);
    const keep = this.menu?.focus;
    this.menu = new Menu(this.app, list, items, { cols: items.length, onBack: () => (net.close(), this.onlineMenu()) });
    if (this.screenWas === 'lobby' && keep != null && keep < items.length) this.menu.setFocus(keep);
    this.menu.nodes.forEach((n) => list.appendChild(n));
    this.screenWas = 'lobby';
    net.onChange = () => {
      if (this.screenWas === 'lobby' && !this.app.race && this.root.querySelector('.screen.lobby')) {
        const f = this.menu?.focus;
        this.lobby();
        if (f != null && f < this.menu.items.length) this.menu.setFocus(f);
      }
    };
  }

  onlineResults(race) {
    this.clear();
    const net = this.app.net;
    const p = race.player;
    const place = race.placeOf(p);
    const s = el('div', 'screen results');
    s.innerHTML = `<h2>${place === 1 ? 'YOU WIN' : `${ordinal(place)} PLACE`}</h2><div class="rgrid"><table class="standings"></table>
      ${this.raceStory(race, p)}</div>
      <div class="sub">${net.isHost ? '' : 'The host will bring everyone back to the lobby.'}</div>`;
    const table = s.querySelector('table');
    const draw = () => {
      table.innerHTML = race
        .standings()
        .map((r, k) => `<tr class="${r.isPlayer ? 'me' : ''}"><td>${ordinal(k + 1)}</td><td style="color:${hex(r.color)}">${r.name}</td><td>${r.finished ? formatTime(r.finishTime) : 'RACING'}</td></tr>`)
        .join('');
    };
    draw();
    clearInterval(this.resultsTimer);
    this.resultsTimer = setInterval(() => (this.app.race === race ? draw() : clearInterval(this.resultsTimer)), 1000);
    const list = el('div', 'list row');
    s.appendChild(list);
    this.root.appendChild(s);
    const items = [...(net.isHost ? [{ label: 'BACK TO LOBBY', action: () => net.backToLobby() }] : []), { label: 'LEAVE ROOM', action: () => (net.close(), this.app.netLeft()) }];
    this.menu = new Menu(this.app, list, items, { cols: items.length });
    this.menu.nodes.forEach((n) => list.appendChild(n));
  }

  // ------------------------------------------------------------------ garage: paint, trail, underglow per car
  garage() {
    this.clear();
    const s = el('div', 'screen garage');
    s.innerHTML = '<h2>GARAGE</h2><div class="stage-gap"></div>';
    const list = el('div', 'list garage-list');
    const cars = CARS.filter((c) => isUnlocked(`car:${c.id}`));
    let ci = Math.max(0, cars.findIndex((c) => c.id === this.choice.car));
    const opts = (withOff) => COLORWAYS.filter((c) => isUnlocked(c.unlock)).map((c) => c.id).concat(withOff ? ['off'] : []);
    const locked = COLORWAYS.filter((c) => !isUnlocked(c.unlock)).length;
    const name = (id) => (id === 'off' ? 'OFF' : COLORWAYS.find((c) => c.id === id)?.name || 'STOCK');
    const swatch = (id, car) => {
      const c = id === 'off' ? null : COLORWAYS.find((x) => x.id === id)?.c ?? car.color;
      return c === 'spectrum' ? '<i class="sw spectrum"></i>' : c == null ? '<i class="sw off"></i>' : `<i class="sw" style="background:${hex(c)}"></i>`;
    };
    const cur = () => ({ paint: 'stock', trail: 'stock', glow: 'stock', ...(getGarage()[cars[ci].id] || {}) });
    const show = () => this.app.showCar(cars[ci], liveryFor(cars[ci].id));
    const change = (key, d, withOff) => {
      const L = cur();
      const o = opts(withOff);
      L[key] = o[(o.indexOf(L[key]) + d + o.length) % o.length];
      setLivery(cars[ci].id, L);
      show();
      refresh();
    };
    const items = [
      { label: '', cycle: (d) => ((ci = (ci + d + cars.length) % cars.length), show(), refresh()), action: () => items[0].cycle(1) },
      { label: '', cycle: (d) => change('paint', d, false), action: () => change('paint', 1, false) },
      { label: '', cycle: (d) => change('trail', d, true), action: () => change('trail', 1, true) },
      { label: '', cycle: (d) => change('glow', d, true), action: () => change('glow', 1, true) },
      { label: 'DONE', action: () => ((this.choice.car = cars[ci].id), storage.set('rs.lastCar', cars[ci].id), this.title()) },
    ];
    s.appendChild(list);
    s.appendChild(el('div', 'foot2', locked ? `${locked} more colours to unlock in the Grand Prix, Time Trial and Mono Run` : 'Every colour unlocked'));
    this.root.appendChild(s);
    this.menu = new Menu(this.app, list, items, { onBack: () => items[4].action() });
    const refresh = () => {
      const L = cur();
      const car = cars[ci];
      const labels = [
        `<span>CRAFT</span> ◀ ${car.name} ▶`,
        `<span>PAINT</span> ◀ ${swatch(L.paint, car)} ${name(L.paint)} ▶`,
        `<span>TRAIL</span> ◀ ${swatch(L.trail, car)} ${name(L.trail)} ▶`,
        `<span>UNDERGLOW</span> ◀ ${swatch(L.glow, car)} ${name(L.glow)} ▶`,
      ];
      labels.forEach((l, k) => (this.menu.nodes[k].innerHTML = l));
    };
    refresh();
    show();
    this.menu.nodes.forEach((n) => list.appendChild(n));
  }

  // ------------------------------------------------------------------ pause & results
  pause() {
    this.clear();
    const s = el('div', 'screen pause');
    s.innerHTML = '<h2>PAUSED</h2>';
    const list = el('div', 'list');
    s.appendChild(list);
    this.root.appendChild(s);
    const gp = this.app.race?.kind === 'gp';
    if (this.app.race?.online) {
      s.querySelector('h2').textContent = 'MENU · STILL RACING';
      this.menu = new Menu(this.app, list, [
        { label: 'RESUME', action: () => this.app.resume() },
        ...(this.app.net.isHost ? [{ label: 'END RACE · BACK TO LOBBY', action: () => this.app.net.backToLobby() }] : []),
        { label: 'LEAVE ROOM', action: () => (this.app.net.close(), this.app.netLeft()) },
      ], { onBack: () => this.app.resume() });
      this.menu.nodes.forEach((n) => list.appendChild(n));
      return;
    }
    this.menu = new Menu(this.app, list, [
      { label: 'RESUME', action: () => this.app.resume() },
      ...(gp ? [] : [{ label: 'RESTART', action: () => this.app.startRace() }]),
      { label: gp ? 'QUIT GRAND PRIX' : this.app.race?.tutorial ? 'SKIP TO MENU' : 'QUIT TO MENU', action: () => this.app.quit() },
    ], { onBack: () => this.app.resume() });
    this.menu.nodes.forEach((n) => list.appendChild(n));
  }

  results(race) {
    this.hudRoot.hidden = true;
    if (race.online) return this.onlineResults(race);
    if (race.kind === 'gp') return this.gpResults(race);
    this.clear();
    const p = race.player;
    const place = race.placeOf(p);
    const s = el('div', 'screen results');
    const rows = race
      .standings()
      .map((r, k) => `<tr class="${r.isPlayer ? 'me' : ''}"><td>${ordinal(k + 1)}</td><td style="color:${hex(r.color)}">${r.name}</td><td>${r.finished ? formatTime(r.finishTime) : '--'}</td></tr>`)
      .join('');
    const solo = race.solo;
    const medal = medalInfo(race.medal || 0);
    const left = solo
      ? `<div class="medalbox">${medal ? `<div class="bigmedal" style="--mc:${medal.color}">${medal.name}</div>` : '<div class="bigmedal none">NO MEDAL</div>'}
          ${race.staffTime ? `<div class="targets">${[3, 2, 1].map((id) => { const m = medalInfo(id); return `<div style="color:${m.color}">${m.name} <b>${formatTime(race.staffTime * m.factor)}</b></div>`; }).join('')}</div>` : ''}</div>`
      : `<table class="standings">${rows}</table>`;
    const head = race.split ? race.players.map((pl) => `${pl.name} ${ordinal(race.placeOf(pl))}`).join(' · ') : solo ? MODE_TITLE[race.kind] : place === 1 ? 'YOU WIN' : `${ordinal(place)} PLACE`;
    s.innerHTML = `<h2>${head}</h2>${this.quoteHtml(race)}
      <div class="rgrid">
        ${left}
        ${race.players.map((pl) => this.raceStory(race, pl, race.newRecord && pl === p ? (solo ? 'NEW BEST · GHOST SAVED' : 'NEW COURSE RECORD') : '')).join('')}
      </div>`;
    this.unlockBanner(s);
    const list = el('div', 'list row');
    s.appendChild(list);
    this.root.appendChild(s);
    const open = openTracks();
    const idx = open.findIndex((t) => t.id === race.def.id);
    const items = [
      { label: 'RETRY', action: () => this.afterScenes(() => this.app.startRace()) },
      {
        label: 'NEXT COURSE',
        action: () =>
          this.afterScenes(() => {
            this.choice.track = open[(idx + 1) % open.length].id;
            storage.set('rs.lastTrack', this.choice.track);
            this.app.startRace();
          }),
      },
      { label: 'MENU', action: () => this.afterScenes(() => this.app.quit()) },
    ];
    this.menu = new Menu(this.app, list, items, { cols: 3 });
    this.menu.nodes.forEach((n) => list.appendChild(n));
  }

  // ------------------------------------------------------------------ story cards
  // A full-screen card of a few lines that appear one after another, then CONTINUE.
  storyCard({ title, sub, lines, cls = '', car }, done) {
    this.clear();
    if (car) this.app.showCar(car, liveryFor(car.id));
    const s = el('div', `screen story ${cls}`);
    s.innerHTML = `${title ? `<h2>${title}</h2>` : ''}${sub ? `<div class="story-sub">${sub}</div>` : ''}`;
    const box = el('div', 'story-lines');
    lines.forEach((l, k) => {
      const p = el('p', '', l);
      p.style.animationDelay = `${0.25 + k * 0.9}s`;
      box.appendChild(p);
    });
    s.appendChild(box);
    const list = el('div', 'list row');
    s.appendChild(list);
    this.root.appendChild(s);
    this.menu = new Menu(this.app, list, [{ label: 'CONTINUE', action: done }], { onBack: done });
    this.menu.nodes.forEach((n) => list.appendChild(n));
  }
  // End of the first run.
  tutorialDone() {
    this.hideHud();
    this.storyCard(
      {
        title: 'YOU’RE READY',
        lines: [
          'Red walls vanish through the blue lens. Blue walls vanish through the red.',
          'Hold a lens and SHIFT drains. BOTH fills it back up.',
          'RED is the Blade: it clings to drops and crests, fits a slit, rides a wall run. BLUE is the Skimmer: it skims water and glides a gap.',
          'Every course hides shortcuts and boost pads that only one lens can see. Watch for the signs.',
          'Grand Prix is waiting. New to the three forms? SHIFT SCHOOL has a one-minute drill for each. HOW TO PLAY has every button.',
        ],
      },
      () => this.app.quit(),
    );
  }
  // Run any secret-driver arrival scenes that are waiting, then carry on.
  afterScenes(fn) {
    const id = this.sceneQueue.shift();
    if (!id) return fn();
    this.scenesShown.add(id);
    const sc = SECRET_SCENES[id];
    this.app.audio.play('finish', 1);
    this.app.audio.announce('unlocked', 0.2);
    this.storyCard({ title: sc.title, sub: sc.from, lines: sc.lines, cls: 'secret', car: CARS.find((c) => c.id === id) }, () => this.afterScenes(fn));
    // the guest speaks as their quoted lines appear
    let free = 0;
    sc.lines.forEach((l, k) => {
      if (!l.includes('“')) return;
      const at = Math.max((0.45 + k * 0.9) * 1000, free);
      free = at + 2600;
      setTimeout(() => this.app.audio.radio(id, l), at);
    });
  }
  // The cup intro (and, the first time ever, the premise) before race one of a Grand Prix.
  gpIntro(cupId, go) {
    const prog = getProgress();
    const st = CUP_STORY[cupId];
    const rivals = CARS.filter((c) => !c.secret && c.id !== this.choice.car).slice(0, 5);
    const roster = `<div class="roster">${rivals.map((c) => `<span style="color:${hex(c.color)}"><b>${DRIVERS[c.id].name}</b> ${c.name}</span>`).join('')}</div>`;
    const cup = () => this.storyCard({ title: st.intro[0], lines: [...st.intro.slice(1), roster], cls: 'cup' }, go);
    if (prog.seen.includes('premise')) return cup();
    prog.seen.push('premise');
    saveProgressUI(prog);
    this.storyCard({ title: 'RETRO SHIFT', lines: PREMISE, cls: 'premise' }, cup);
  }

  // ------------------------------------------------------------------ Grand Prix
  cupSelect() {
    this.clear();
    this.app.showAttract(true);
    const prog = getProgress();
    const s = el('div', 'screen cups');
    s.innerHTML = `<h2>GRAND PRIX · SELECT A CUP</h2><div class="sub">Five courses, six racers. Points for every place: ${POINTS.join(' · ')}.</div>`;
    const grid = el('div', 'grid cups-grid');
    const items = CUPS.map((cup) => {
      const n = el('button', 'item cupcard');
      n.style.setProperty('--c', cup.color);
      const best = prog.cups[cup.id];
      const open = isUnlocked(cup.unlock);
      const ready = cupReady(cup);
      const first = TRACKS.findIndex((t) => t.id === CUPS[0].tracks[0]);
      const row = (id, k) => {
        const d = TRACKS.find((t) => t.id === id);
        // a course that isn't built yet still gets its number, counted on from the cups before it
        const num = d?.num || String(first + 1 + CUPS.slice(0, CUPS.indexOf(cup)).reduce((a, c) => a + c.tracks.length, 0) + k).padStart(2, '0');
        return `<li><span>${num}</span>${d && (open || !cup.unlock) ? d.name : '???'}</li>`;
      };
      const status = !ready ? 'COMING SOON' : !open ? `LOCKED · ${unlockFor(cup.unlock)?.hint || ''}` : best && best <= 3 ? `${TROPHY[best]} TROPHY` : best ? `BEST ${ordinal(best)}` : 'NOT WON YET';
      if (!ready || !open) n.classList.add('locked');
      n.innerHTML = `<div class="cupname">${cup.name}</div>
        <ol>${cup.tracks.map(row).join('')}</ol>
        <div class="trophy ${ready && open && best && best <= 3 ? `t${best}` : ''}">${status}</div>`;
      return { node: n, action: () => (ready && open ? ((this.choice.cup = cup.id), this.carSelect()) : {}) };
    });
    s.appendChild(grid);
    this.root.appendChild(s);
    const focus = Math.max(0, CUPS.findIndex((c) => c.id === this.choice.cup));
    this.menu = new Menu(this.app, grid, items, { cols: CUPS.length, focus, onBack: () => this.title() });
    this.menu.nodes.forEach((n) => grid.appendChild(n));
  }

  // How your race went, for the results screens: the times (and the best through each third of the lap), how long you
  // spent in each lens, your best SHIFT CHAIN, and the lens moves that made it.
  raceStory(race, p, record = '') {
    const t = p.tally || {};
    const L = t.lens || {};
    const lr = L[RED] || 0;
    const lb = L[BOTH] || 0;
    const lu = L[BLUE] || 0;
    const tot = lr + lb + lu || 1;
    const pc = (v) => Math.round((v / tot) * 100);
    const st = race.split ? null : race.stats;
    const sec = (p.sectors || []).map((v, k) => `<div><span>S${k + 1}</span><b>${Number.isFinite(v) ? formatTime(v) : '--'}</b></div>`).join('');
    const tile = (label, v, cls = '') => `<div class="${cls}"><b>${v}</b><span>${label}</span></div>`;
    const forms = [
      [t.wallRuns, 'WALL RUNS'],
      [t.glides, 'GLIDES'],
      [t.slits, 'SLITS'],
    ].filter(([v]) => v > 0);
    const tiles = [
      tile('BEST CHAIN', p.chain?.best ? `×${Math.min(p.chain.best, CHAIN.max)}` : '--', 'big'),
      tile('PERFECT', t.perfect || 0, t.perfect ? 'hot' : ''),
      tile('CLOSE PHASES', t.close || 0),
      tile('PHASED', t.phased || 0),
      tile('LENS ROUTES', t.routes || 0),
      ...forms.map(([v, l]) => tile(l, v)),
      tile('TAKEDOWNS', t.takedowns || 0),
      ...(st ? [tile('SHIFTS', st.shifts), tile('CRASHES', st.crashes)] : []),
      ...(st?.wrecks ? [tile('WRECKED', st.wrecks)] : []),
    ].join('');
    return `<div class="rstory">
      ${race.split ? `<div class="rs-who">${p.name}</div>` : ''}
      <div class="rs-times"><div><span>TIME</span><b>${p.finished ? formatTime(p.finishTime) : '--'}</b></div><div><span>BEST LAP</span><b>${Number.isFinite(p.bestLap) ? formatTime(p.bestLap) : '--'}</b></div></div>
      <div class="rs-sec">${sec}</div>
      <div class="rs-lens" title="Time in each lens"><i class="red" style="flex:${lr}"></i><i class="both" style="flex:${lb}"></i><i class="blue" style="flex:${lu}"></i></div>
      <div class="rs-lensk"><span class="red">RED ${pc(lr)}%</span><span class="both">BOTH ${pc(lb)}%</span><span class="blue">BLUE ${pc(lu)}%</span></div>
      <div class="rs-tiles">${tiles}</div>
      ${p.chain?.chains ? `<div class="rs-note">${p.chain.chains} CHAIN${p.chain.chains > 1 ? 'S' : ''} OF ×3 OR MORE</div>` : ''}
      ${record ? `<div class="record">${record}</div>` : ''}
    </div>`;
  }

  quoteHtml(race) {
    const q = race.quote;
    if (q && !race.quotePlayed) {
      race.quotePlayed = true;
      setTimeout(() => this.app.audio.radio(q.id, q.text, q.kind), 500);
    }
    return q ? `<div class="quote"><b style="color:${hex(q.color)}">${q.name}</b> “${q.text}”</div>` : '';
  }

  gpTable(gp, raceRows) {
    const tot = Object.entries(gp.points).sort((a, b) => b[1] - a[1]);
    return tot
      .map(([name, pts], k) => {
        const add = raceRows?.get(name);
        return `<tr class="${name === 'YOU' ? 'me' : ''}"><td>${ordinal(k + 1)}</td><td style="color:${hex(gp.colors[name])}">${name}</td><td class="add">${add != null ? `+${add}` : ''}</td><td><b>${pts}</b></td></tr>`;
      })
      .join('');
  }

  gpResults(race) {
    this.clear();
    const gp = this.app.gp;
    const added = this.app.gpAward(race);
    const place = race.placeOf(race.player);
    const last = gp.round >= gp.cup.tracks.length - 1;
    const s = el('div', 'screen results');
    const rows = race
      .standings()
      .map((r, k) => `<tr class="${r.isPlayer ? 'me' : ''}"><td>${ordinal(k + 1)}</td><td style="color:${hex(r.color)}">${r.name}</td><td>${r.finished ? formatTime(r.finishTime) : '--'}</td></tr>`)
      .join('');
    s.innerHTML = `<h2>${gp.cup.name} · RACE ${gp.round + 1}/${gp.cup.tracks.length} · ${ordinal(place)}</h2>${this.quoteHtml(race)}
      <div class="rgrid">
        <table class="standings">${rows}</table>
        <table class="standings gp"><tr class="hd"><td></td><td>CUP</td><td>RACE</td><td>PTS</td></tr>${this.gpTable(gp, added)}</table>
        ${this.raceStory(race, race.player)}
      </div>`;
    const list = el('div', 'list row');
    s.appendChild(list);
    this.root.appendChild(s);
    const items = [
      last ? { label: 'CUP RESULTS', action: () => this.cupResults() } : { label: 'NEXT RACE', action: () => this.app.nextGP() },
      { label: 'QUIT GRAND PRIX', action: () => this.app.quit() },
    ];
    this.menu = new Menu(this.app, list, items, { cols: 2 });
    this.menu.nodes.forEach((n) => list.appendChild(n));
  }

  cupResults() {
    this.clear();
    const gp = this.app.gp;
    const rank = this.app.finishGP();
    const s = el('div', 'screen results cupresults');
    const tr = rank <= 3 ? TROPHY[rank] : '';
    s.innerHTML = `<h2>${gp.cup.name}</h2>
      <div class="cuptrophy ${tr ? `t${rank}` : 'none'}">${tr ? `${tr} TROPHY` : `${ordinal(rank)} OVERALL`}</div>
      <table class="standings gp wide">${this.gpTable(gp)}</table>`;
    this.app.audio.announce(rank === 1 ? 'champion' : rank <= 3 ? ['', '', 'second', 'third'][rank] : 'over', 0.3);
    this.unlockBanner(s);
    const list = el('div', 'list row');
    s.appendChild(list);
    this.root.appendChild(s);
    const st = CUP_STORY[gp.cup.id];
    const end = rank === 1 ? st.win : rank <= 3 ? st.podium : st.lose;
    const finish = () => this.storyCard({ title: end[0], lines: end.slice(1), cls: 'cup' }, () => this.afterScenes(() => this.app.quit()));
    this.menu = new Menu(this.app, list, [{ label: 'CONTINUE', action: finish }]);
    this.menu.nodes.forEach((n) => list.appendChild(n));
  }

  // Anything a result just unlocked (filled in by the garage's unlock check).
  unlockBanner(s) {
    const fresh = this.app.checkUnlocks?.() || [];
    if (!fresh.length) return;
    s.appendChild(el('div', 'unlocks', `<b>UNLOCKED</b> ${fresh.map((u) => `<span>${u.name}</span>`).join('')}`));
    this.app.audio.play('shard');
    for (const u of fresh) {
      const id = u.id.slice(4);
      if (u.id.startsWith('car:') && SECRET_SCENES[id] && !this.sceneQueue.includes(id) && !this.scenesShown.has(id)) this.sceneQueue.push(id);
    }
  }

  // ------------------------------------------------------------------ HUD
  buildHud(race) {
    // render the rivals' helmets now, between frames, so the first radio call doesn't stall a frame
    warmHelmets(race.racers.filter((r) => !r.isPlayer && !r.human).map((r) => [r.car.id, r.color]));
    const H = this.hudRoot;
    const n = race.split ? 2 : 1;
    const view = `
      <div class="h-tl"><div class="h-place"><b>1</b><sup>ST</sup><small>/6</small></div><div class="h-lap">LAP <b>1</b>/3</div><div class="h-time">0:00.00</div></div>
      <div class="h-tr"><div class="h-course"></div><div class="h-best"></div></div>
      <canvas class="h-map"></canvas>
      <div class="h-speed"><b>0</b><small>KM/H</small><div class="h-drift"></div></div>
      <div class="h-chain"><div class="ch-row"><b class="ch-x"></b><span class="ch-word">CHAIN</span></div><small class="ch-link"></small><i class="ch-bar"><u></u></i></div>
      <div class="h-dash">
        <div class="h-item"><div class="h-item-tx"><b></b><small></small></div><div class="h-item-ic"></div><kbd></kbd></div>
        <div class="h-lens">
          <div class="h-chips">
            <span class="chip red" data-m="2"><kbd></kbd>RED</span>
            <span class="chip both" data-m="1"><kbd></kbd>BOTH</span>
            <span class="chip blue" data-m="4"><kbd></kbd>BLUE</span>
          </div>
          <div class="h-energy"><i></i><span>SHIFT</span></div>
          <div class="h-hull">${'<i></i>'.repeat(10)}<span>HULL</span></div>
        </div>
        <div class="h-form"><b></b><div class="h-form-ring"><kbd></kbd></div></div>
      </div>
      <div class="h-center"></div>
      <div class="h-tip"></div>
      <div class="h-controls"></div>
      <div class="h-comms"><img class="h-helmet h-face-img" alt="" hidden><canvas class="h-face" width="144" height="144"></canvas><div><i><u></u></i><b></b><span></span></div></div>
      <div class="h-count"></div>
      <div class="h-wrong">WRONG WAY<small>TURN AROUND</small></div>
      <div class="h-flash"></div>`;
    H.innerHTML = Array.from({ length: n }, (_, k) => `<div class="hud-view v${k}">${n > 1 ? `<div class="h-who">P${k + 1}</div>` : ''}${view}</div>`).join('') + '<button class="h-pause" aria-label="Pause">❚❚</button>';
    H.classList.toggle('split', n > 1);
    H.hidden = false;
    H.querySelector('.h-pause').addEventListener('click', () => this.app.pause());
    // on a phone the dash's charge slot fires the charge and its form badge does the form move
    if (document.body.classList.contains('touch')) {
      const I = this.app.input;
      for (const v of H.querySelectorAll('.hud-view')) {
        const item = v.querySelector('.h-item');
        const fire = (on) => (e) => {
          e.preventDefault();
          I.lastDevice = 'touch';
          I.touch.active = true;
          I.touch.fire = on;
          // (a quick tap can start and end between two frames: the press itself always counts)
          if (on) I.touchEdge('fire');
        };
        item.addEventListener('pointerdown', fire(true));
        for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) item.addEventListener(ev, fire(false));
        v.querySelector('.h-form').addEventListener('pointerdown', (e) => {
          e.preventDefault();
          I.lastDevice = 'touch';
          I.touch.active = true;
          I.touchEdge('form');
        });
      }
    }
    const best = race.mono ? loadGhost(race.def.id, true) : storage.get(`rs.best.${race.def.id}`, null);
    const bits = [];
    if (race.tutorial) bits.push('FIRST RUN · ESC TO SKIP');
    if (race.kind === 'gp') bits.push(`${this.app.gp.cup.name} · RACE ${this.app.gp.round + 1}/${this.app.gp.cup.tracks.length}`);
    if (best) bits.push(`RECORD ${formatTime(best.time)}`);
    if (race.staffTime) bits.push(`<span style="color:#ffd04a">STAFF ${formatTime(race.staffTime)}</span>`);
    this.hs = [...H.querySelectorAll('.hud-view')].map((V) => {
      const q = (sel) => V.querySelector(sel);
      const h = {
        root: V,
        place: q('.h-place b'),
        placeSup: q('.h-place sup'),
        placeOf: q('.h-place small'),
        lap: q('.h-lap'),
        time: q('.h-time'),
        course: q('.h-course'),
        best: q('.h-best'),
        speed: q('.h-speed b'),
        drift: q('.h-drift'),
        chips: [...V.querySelectorAll('.h-chips .chip')],
        energy: q('.h-energy i'),
        energyBox: q('.h-energy'),
        hull: q('.h-hull'),
        form: q('.h-form'),
        formKey: q('.h-form kbd'),
        formName: q('.h-form b'),
        formRing: q('.h-form-ring'),
        chain: q('.h-chain'),
        chainX: q('.ch-x'),
        chainLink: q('.ch-link'),
        chainBar: q('.ch-bar u'),
        item: q('.h-item'),
        itemKey: q('.h-item kbd'),
        itemName: q('.h-item b'),
        itemTip: q('.h-item small'),
        itemIcon: q('.h-item-ic'),
        hullCells: [...V.querySelectorAll('.h-hull i')],
        center: q('.h-center'),
        tip: q('.h-tip'),
        controls: q('.h-controls'),
        comms: q('.h-comms'),
        count: q('.h-count'),
        wrong: q('.h-wrong'),
        flash: q('.h-flash'),
        map: new MiniMap(q('.h-map')),
      };
      h.course.textContent = `${race.def.num} ${race.def.name}`;
      h.best.innerHTML = bits.join('<br>');
      if (race.mono) {
        const both = V.querySelector('.chip.both');
        both.lastChild.textContent = 'SWAP';
        both.classList.add('swap');
      }
      return h;
    });
    this.h = this.hs[0];
    this.mapT = 0;
    this.lastPlace = 0;
    this.lastTipT = 0;
  }
  hideHud() {
    this.hudRoot.hidden = true;
    this.hudRoot.innerHTML = '';
    this.hudRoot.classList.remove('split');
    this.h = null;
    this.hs = [];
  }

  popup(text, color, small = false, h = this.h) {
    if (!h) return;
    const n = el('div', `pop ${small ? 'small' : ''}`, text);
    n.style.color = color;
    h.center.appendChild(n);
    while (h.center.children.length > 3) h.center.firstChild.remove();
    setTimeout(() => n.remove(), 1300);
  }

  // In split-screen each player's keyboard keys differ; with a pad, its own glyphs.
  lensGlyph(race, k, key) {
    const I = this.app.input;
    if (race.split && I.lastDevice !== 'gamepad') return SPLIT_GLYPHS[k][key];
    return I.glyph(key);
  }

  updateHud(race, dt) {
    if (!this.h) return;
    for (const e of race.events) {
      // events for one player go to that player's view; race-wide ones (countdown, radio) to every view
      const targets = e.pi != null ? [this.hs[e.pi]].filter(Boolean) : this.hs;
      for (const h of targets) this.hudEvent(race, h, e, this.hs.indexOf(h), targets.length > 1 && h !== targets[0]);
    }
    race.events.length = 0;
    this.mapT -= dt;
    const drawMap = this.mapT <= 0;
    if (drawMap) this.mapT = 1 / 20;
    race.players.forEach((p, k) => this.hudView(race, this.hs[k], p, k, drawMap));
    document.body.dataset.mode = MODE_NAME[race.player.mode];
  }

  hudEvent(race, h, e, k, echo) {
    switch (e.type) {
      case 'hurt':
        h.flash.className = 'h-flash on hurt';
        void h.flash.offsetWidth;
        h.flash.className = 'h-flash go hurt';
        h.hull.classList.remove('hit');
        void h.hull.offsetWidth;
        h.hull.classList.add('hit');
        break;
      case 'shift': {
        h.flash.className = `h-flash on m${e.mode}`;
        void h.flash.offsetWidth;
        h.flash.className = `h-flash go m${e.mode}`;
        if (e.forced) this.popup('SHIFT EMPTY', '#ffffff', true, h);
        break;
      }
      case 'chain':
        h.chain.classList.remove('bump');
        void h.chain.offsetWidth;
        h.chain.classList.add('bump');
        break;
      case 'chainEnd':
        h.chainOut = { n: e.n, broke: e.broke, t: race.t };
        break;
      case 'perfect':
        // a white rim with the lens's colour in it, over the shift's own flash
        h.flash.className = `h-flash on perfect m${e.mode}`;
        void h.flash.offsetWidth;
        h.flash.className = `h-flash go perfect m${e.mode}`;
        break;
      case 'denied':
        h.energyBox.classList.remove('deny');
        void h.energyBox.offsetWidth;
        h.energyBox.classList.add('deny');
        break;
      case 'popup':
        this.popup(e.text, e.color, e.small, h);
        break;
      case 'lap':
        this.popup(`LAP ${e.lap} · ${formatTime(e.time)}`, '#ffffff', false, h);
        break;
      case 'count':
        h.count.textContent = e.n > 0 ? e.n : 'GO!';
        h.count.className = `h-count on n${Math.max(0, e.n)}`;
        if (e.n <= 0) setTimeout(() => (h.count.className = 'h-count'), 700);
        break;
      case 'tip': {
        const glyph = this.lensGlyph(race, k, e.key) || '';
        h.tip.innerHTML = `${e.text}${glyph ? ` <kbd>${glyph}</kbd>` : ''}`;
        h.tip.className = `h-tip on k-${e.key}`;
        clearTimeout(h.tipTimer);
        // hold 0: stays up until a 'tipoff'
        if (e.hold !== 0) h.tipTimer = setTimeout(() => (h.tip.className = 'h-tip'), (e.hold || 3.2) * 1000);
        break;
      }
      case 'tipoff':
        clearTimeout(h.tipTimer);
        h.tip.className = 'h-tip';
        break;
      case 'comms': {
        const c = h.comms;
        c.querySelector('b').textContent = `${e.name} · ${e.car}`;
        // their face, lip-flapping for as long as the line takes to say
        // their helmet (a line drawing if the portrait couldn't be rendered), lit up while they talk
        const face = c.querySelector('.h-face');
        const img = c.querySelector('.h-helmet');
        const url = helmetPortrait(e.id, e.color);
        clearInterval(h.faceTimer);
        clearTimeout(h.talkTimer);
        if (url) {
          img.src = url;
          img.hidden = false;
          face.hidden = true;
        } else {
          img.hidden = true;
          face.hidden = false;
          drawPortrait(face, e.id, e.color, 0, 0);
        }
        c.classList.add('talking');
        h.talkTimer = setTimeout(() => c.classList.remove('talking'), Math.min(3600, 500 + e.text.length * 52));
        c.querySelector('b').style.color = hex(e.color);
        c.querySelector('span').textContent = e.text;
        c.style.setProperty('--c', hex(e.color));
        c.classList.add('on');
        if (!echo) this.app.audio.radio(e.id, e.text, e.kind === 'lose' ? 'lose' : 'talk');
        clearTimeout(h.commsTimer);
        h.commsTimer = setTimeout(() => {
          c.classList.remove('on');
          clearInterval(h.faceTimer);
        }, 4200);
        break;
      }
      case 'finish':
        this.popup(race.solo ? 'FINISH' : `${ordinal(e.place)} PLACE`, '#ff4fd8', false, h);
        break;
    }
  }

  hudView(race, h, p, k, drawMap) {
    if (!h) return;
    const place = race.placeOf(p);
    const n = race.racers.length;
    const ord = ordinal(place);
    // (every write below dirties layout and style, so a value that hasn't changed is left alone)
    const set = (node, key, v) => {
      if (h[`_${key}`] === v) return;
      h[`_${key}`] = v;
      if (key === 'lap') node.innerHTML = v;
      else if (key.endsWith('Cls')) node.className = v;
      else node.textContent = v;
    };
    set(h.place, 'place', String(place));
    set(h.placeSup, 'placeSup', ord.slice(String(place).length));
    set(h.placeOf, 'placeOf', `/${n}`);
    set(h.lap, 'lap', `LAP <b>${Math.min(race.laps, p.lap + 1)}</b>/${race.laps}`);
    set(h.time, 'time', formatTime(p.finished ? p.finishTime : race.raceTime));
    set(h.speed, 'speed', String(Math.round(Math.abs(p.speed) * 3.6)));
    set(h.drift, 'driftCls', `h-drift l${p.drift.active ? p.drift.level : 0}`);
    for (const c of h.chips) {
      const m = +c.dataset.m;
      c.classList.toggle('active', m === p.mode);
      const kb = c.querySelector('kbd');
      const g = this.lensGlyph(race, k, m === RED ? 'red' : m === BLUE ? 'blue' : 'both');
      if (kb.textContent !== g) kb.textContent = g;
    }
    const width = `${(p.energy * 100).toFixed(1)}%`;
    if (h._width !== width) h.energy.style.width = h._width = width;
    set(h.energyBox, 'energyCls', `h-energy m${p.mode}${p.energy < 0.25 ? ' low' : ''}${h.energyBox.classList.contains('deny') ? ' deny' : ''}`);
    // the form's move: its name in the lens colour, and a ring round its button that fills as it recharges
    {
      const name = p.mode === BLUE ? 'LIFT' : p.mode === RED ? 'LANCE' : 'BRACE';
      set(h.formName, 'formName', name);
      set(h.formKey, 'formKey', this.lensGlyph(race, k, 'form'));
      const cd = Math.max(0, p.formCd || 0);
      const full = { LIFT: 5, LANCE: 6, BRACE: 8 }[name];
      const f = (1 - Math.min(1, cd / full)).toFixed(2);
      if (h._formP !== f) h.formRing.style.setProperty('--p', (h._formP = f));
      set(h.form, 'formCls', `h-form m${p.mode}${cd <= 0 ? ' ready' : ''}`);
    }
    // the SHIFT CHAIN, over the dash: the multiplier, the last link, and the window running down (held full while a
    // road keeps your lens, or a glide or a launch carries you). When it lets go, a long one takes a bow; a broken one
    // says so.
    {
      const c = p.chain;
      const n = c?.n || 0;
      let cls = 'h-chain';
      let x = '';
      let link = '';
      let w = '0%';
      if (n > 0) {
        const m = Math.min(n, CHAIN.max);
        const held = p.lensRoadT > 0 || p.gliding || !!p.launch;
        x = `×${m}`;
        link = c.label;
        w = `${(held ? 100 : Math.max(0, c.t / CHAIN.window) * 100).toFixed(1)}%`;
        cls += ` on t${m >= 5 ? 3 : m >= 3 ? 2 : m >= 2 ? 1 : 0}${held ? ' held' : ''}${m >= CHAIN.max ? ' max' : ''}`;
        h.chainOut = null;
      } else if (h.chainOut && race.t - h.chainOut.t < 1.4) {
        x = `×${Math.min(h.chainOut.n, CHAIN.max)}`;
        link = h.chainOut.broke ? 'BROKEN' : `${h.chainOut.n} LINKS`;
        cls += ` on out${h.chainOut.broke ? ' broke' : ''}`;
      }
      set(h.chainX, 'chainX', x);
      set(h.chainLink, 'chainLink', link);
      if (h._chainW !== w) h.chainBar.style.width = h._chainW = w;
      set(h.chain, 'chainCls', cls + (h.chain.classList.contains('bump') ? ' bump' : ''));
    }
    // the SEAM CHARGE slot: always there in a race with charges. Empty, it says where to get one; rolling, it spins
    // through the icons; held, a big icon, the name, what it does, and the button that fires it.
    if (race.items?.on) {
      let id = 'none';
      let cls = 'h-item on';
      if (p.rollT > 0) {
        id = ITEM_IDS[Math.floor(race.t * 14) % ITEM_IDS.length];
        cls += ' rolling';
      } else if (p.item) {
        id = p.item;
        cls += ' held';
        if (h._held !== id) h.gotT = race.t;
        if (race.t - (h.gotT ?? -9) < 0.7) cls += ' got';
        // (what it does, for a moment after you get it)
        if (race.t - (h.gotT ?? -9) < 2.6) cls += ' tell';
      } else cls += ' empty';
      h._held = p.rollT > 0 ? null : p.item;
      set(h.item, 'itemCls', cls);
      const it = ITEMS[id] || { name: 'NO CHARGE', tip: 'DRIVE THROUGH A PRISM', color: '#8a7aa8' };
      if (h._itemIcon !== id) h.itemIcon.innerHTML = ITEM_ICONS[(h._itemIcon = id)];
      set(h.itemName, 'itemName', p.rollT > 0 ? 'ROLLING' : it.name);
      set(h.itemTip, 'itemTip', p.rollT > 0 ? '' : it.tip);
      set(h.itemKey, 'itemKey', this.lensGlyph(race, k, 'fire'));
      if (h._itemColor !== it.color) h.item.style.setProperty('--ic', (h._itemColor = it.color));
    }
    // the hull: ten cells, white while it's sound, orange once it's hurt, red and blinking when one more hit ends it
    const hp = Math.ceil(((p.hp ?? 100) / 100) * 10 - 0.001);
    const hullCls = `h-hull${hp <= 3 ? ' crit' : hp <= 6 ? ' hurt' : ''}${h.hull.classList.contains('hit') ? ' hit' : ''}`;
    if (h._hp !== hp) {
      h._hp = hp;
      h.hullCells.forEach((c, i) => c.classList.toggle('off', i >= hp));
    }
    set(h.hull, 'hullCls', hullCls);
    h.wrong.classList.toggle('on', (p.wrongWay || 0) > 0.8 && race.state === 'race' && !p.finished);
    const mode = MODE_NAME[p.mode];
    if (h.root.dataset.mode !== mode) h.root.dataset.mode = mode;
    // the controls, on the device in hand, while the grid waits for GO
    const pre = race.state === 'intro' || race.state === 'countdown';
    h.controls.classList.toggle('on', pre);
    if (pre) {
      const g = (key) => `<kbd>${this.lensGlyph(race, k, key)}</kbd>`;
      // (on a phone the buttons say what they do, so the card says what isn't on a button)
      const touch = this.app.input.lastDevice === 'touch';
      const html = touch
        ? `<div>${race.items?.on ? '<span>CHARGE: TAP ITS SLOT</span>' : ''}<span>FORM MOVE: TAP THE BADGE</span></div>
        <p>${race.mono ? 'SWAP flips your lens.' : 'RED is fastest · BLUE grips and drifts · BOTH refills SHIFT'}</p>`
        : `<div><span>GAS ${g('gas')}</span><span>BRAKE ${g('brake')}</span><span>STEER ${g('steer')}</span><span>DRIFT ${g('drift')}</span>${race.items?.on ? `<span>CHARGE ${g('fire')}</span>` : ''}${!race.split && !race.solo && this.app.input.lastDevice !== 'touch' ? `<span>HORN ${g('horn')}</span>` : ''}</div>
        <div><span class="red">RED ${g('red')}</span><span class="both">${race.mono ? 'SWAP' : 'BOTH'} ${g('both')}</span><span class="blue">BLUE ${g('blue')}</span></div>
        <p>${race.mono ? 'SWAP flips your lens.' : 'RED is fastest · BLUE grips and drifts · BOTH refills SHIFT'}</p>`;
      if (h.controlsHtml !== html) h.controls.innerHTML = h.controlsHtml = html;
    }
    if (drawMap) h.map.draw(race.world, race.racers, p.mode, p);
  }
}

export { BOTH };
