// Settings > Accessibility: reduced flashing, screen shake, world shapes, and the solo keyboard keys.

import { el, Menu } from './ui.js';
import { ACCESS, saveAccess } from '../core/access.js';
import { REMAP_ACTIONS, soloKeys, keyLabel } from '../core/input.js';

const SHAKES = [[1, 'FULL'], [0.35, 'LOW'], [0, 'OFF']];

export function accessScreen(ui) {
  ui.clear();
  const s = el('div', 'screen settings access');
  s.innerHTML = '<h2>ACCESSIBILITY</h2><div class="sub">WORLD SHAPES marks the red world ▲, the blue world ● and the overlap ◆, on walls, blocks, lens-only road and the lens chips.</div>';
  const list = el('div', 'list');
  s.appendChild(list);
  ui.root.appendChild(s);
  const items = [
    { label: '', cycle: () => ((ACCESS.calm = !ACCESS.calm), saveAccess(), refresh()), action: () => items[0].cycle(1) },
    { label: '', cycle: (d) => {
      const k = SHAKES.findIndex(([v]) => v === ACCESS.shake);
      ACCESS.shake = SHAKES[(Math.max(0, k) + (d || 1) + SHAKES.length) % SHAKES.length][0];
      saveAccess();
      refresh();
    }, action: () => items[1].cycle(1) },
    { label: '', cycle: () => ((ACCESS.shapes = !ACCESS.shapes), saveAccess(), refresh()), action: () => items[2].cycle(1) },
    { label: 'KEYBOARD KEYS', action: () => keysScreen(ui) },
    { label: 'BACK', action: () => ui.settingsScreen() },
  ];
  ui.menu = new Menu(ui.app, list, items, { onBack: () => ui.settingsScreen() });
  const refresh = () => {
    const sh = SHAKES.find(([v]) => v === ACCESS.shake)?.[1] || 'FULL';
    [`FLASHING ◀ ${ACCESS.calm ? 'REDUCED' : 'FULL'} ▶`, `SCREEN SHAKE ◀ ${sh} ▶`, `WORLD SHAPES ◀ ${ACCESS.shapes ? 'ON' : 'OFF'} ▶`].forEach((l, k) => (ui.menu.nodes[k].innerHTML = l));
  };
  refresh();
  ui.menu.nodes.forEach((n) => list.appendChild(n));
}

// One row per action with its key. Pick a row, press the new key (Esc cancels).
function keysScreen(ui, focus = 0) {
  ui.clear();
  const s = el('div', 'screen settings keys');
  s.innerHTML = '<h2>KEYBOARD KEYS</h2><div class="sub">Pick an action, then press its new key. Esc cancels. Gamepads and split-screen keep their layouts.</div>';
  const list = el('div', 'list keylist');
  s.appendChild(list);
  ui.root.appendChild(s);
  const row = (name, action) => `<span>${name}</span><kbd>${keyLabel(soloKeys(action)[0])}</kbd>`;
  const items = REMAP_ACTIONS.map(([action, name], k) => ({ label: row(name, action), action: () => listen(k, action, name) }));
  items.push({ label: 'RESET TO DEFAULTS', action: () => ((ACCESS.keys = {}), saveAccess(), keysScreen(ui, REMAP_ACTIONS.length)) });
  items.push({ label: 'BACK', action: () => accessScreen(ui) });
  ui.menu = new Menu(ui.app, list, items, { focus, onBack: () => accessScreen(ui) });
  ui.menu.nodes.forEach((n) => list.appendChild(n));
  let waiting = null;
  function listen(k, action, name) {
    if (waiting) return;
    const node = ui.menu.nodes[k];
    node.innerHTML = `<span>${name}</span><kbd class="wait">PRESS A KEY</kbd>`;
    const menu = ui.menu;
    ui.menu = null; // the menu doesn't read keys while we wait for one
    waiting = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('keydown', waiting, true);
      waiting = null;
      if (e.code !== 'Escape') {
        ACCESS.keys = { ...ACCESS.keys, [action]: e.code };
        saveAccess();
      }
      // (the same press must not also confirm the menu)
      setTimeout(() => keysScreen(ui, k), 120);
      void menu;
    };
    setTimeout(() => window.addEventListener('keydown', waiting, true), 150);
  }
}
