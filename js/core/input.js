// Keyboard, gamepad and touch input, merged into per-player control snapshots.
// Ported from Absurd Combat Racing. In Retro Shift, item = shift to RED, special = shift to BLUE, jump = back to BOTH.

const BIND_SOLO = {
  accel: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  drift: ['Space'],
  fire: ['KeyX'],
  // the Shift keys are the lenses: left for RED, right for BLUE, both together for BOTH
  item: ['ShiftLeft', 'KeyQ', 'KeyJ', 'Digit1'],
  special: ['ShiftRight', 'KeyE', 'KeyL', 'Digit3'],
  look: ['KeyC'],
  reset: ['KeyR'],
  jump: ['KeyF', 'KeyK', 'Digit2'],
  rear: ['KeyI'],
  horn: ['KeyH', 'KeyV'],
  // the form's own move: Skimmer LIFT, Blade LANCE, the pair's BRACE
  form: ['KeyZ', 'ControlLeft'],
};
// Two players on one keyboard. Lens keys run left to right like the HUD: RED, BOTH, BLUE.
const BIND_SPLIT = [
  {
    accel: ['KeyW'],
    brake: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    drift: ['ShiftLeft', 'Space'],
    fire: ['KeyX'],
    item: ['KeyQ'],
    special: ['KeyE'],
    look: ['KeyC'],
    reset: ['KeyR'],
    jump: ['KeyF'],
    rear: [],
    horn: ['KeyV'],
    form: ['KeyZ'],
  },
  {
    accel: ['ArrowUp'],
    brake: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    drift: ['ShiftRight', 'Numpad0'],
    fire: ['Quote'],
    item: ['Comma', 'Numpad1'],
    special: ['Slash', 'Numpad3'],
    look: ['Numpad5'],
    reset: ['Backspace', 'Numpad7'],
    jump: ['Period', 'Numpad2'],
    rear: ['Numpad6'],
    horn: ['Numpad9', 'Backslash'],
    form: ['Enter', 'NumpadEnter'],
  },
];
// Keyboard key names for each player in split-screen.
export const SPLIT_GLYPHS = [
  { red: 'Q', both: 'F', blue: 'E', gas: 'W', brake: 'S', steer: 'A D', drift: 'SPACE', fire: 'X', form: 'Z', horn: 'V' },
  { red: ',', both: '.', blue: '/', gas: '▲', brake: '▼', steer: '◀ ▶', drift: 'R-SHIFT', fire: "'", form: 'ENTER', horn: '\\' },
];
// Buttons that act once per press. The game latches them per rendered frame so a short tap is
// never lost between fixed sim steps, and online joiners send them as running counts.
export const PRESSES = ['item', 'special', 'jump', 'rear', 'horn', 'form'];

const MENU = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'NumpadEnter', 'Space'],
  back: ['Escape', 'Backspace'],
  pause: ['Escape', 'KeyP'],
};
const GAME_KEYS = new Set(
  [...Object.values(BIND_SOLO), ...BIND_SPLIT.flatMap((b) => Object.values(b)), ...Object.values(MENU)].flat(),
);

// Buttons in the W3C "standard" gamepad layout (Xbox names; PlayStation: A=Cross, B=Circle,
// X=Square, Y=Triangle, LB/RB=L1/R1, LT/RT=L2/R2, BACK=Share, START=Options).
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16 };

// Chrome, Edge and Safari report PS4 and Xbox One pads with mapping 'standard'. Firefox on
// Linux/macOS (and some Bluetooth stacks) report raw HID layouts instead; these tables map
// those raw indices onto the standard layout. Triggers there are axes running -1..1.
const RAW_LAYOUTS = {
  ps: {
    buttons: { 0: PAD.A, 1: PAD.B, 2: PAD.Y, 3: PAD.X, 4: PAD.LB, 5: PAD.RB, 6: PAD.LT, 7: PAD.RT, 8: PAD.BACK, 9: PAD.START, 10: PAD.HOME, 11: PAD.LS, 12: PAD.RS },
    triggers: { lt: 2, rt: 5 },
    dpad: [6, 7],
  },
  // Older DS4 drivers (and macOS Firefox) use the DirectInput order: Square, Cross, Circle, Triangle.
  psDinput: {
    buttons: { 0: PAD.X, 1: PAD.A, 2: PAD.B, 3: PAD.Y, 4: PAD.LB, 5: PAD.RB, 6: PAD.LT, 7: PAD.RT, 8: PAD.BACK, 9: PAD.START, 10: PAD.LS, 11: PAD.RS, 12: PAD.HOME },
    triggers: { lt: 3, rt: 4 },
    stickR: [2, 5],
    hat: 9,
  },
  xbox: {
    buttons: { 0: PAD.A, 1: PAD.B, 2: PAD.X, 3: PAD.Y, 4: PAD.LB, 5: PAD.RB, 6: PAD.BACK, 7: PAD.START, 8: PAD.HOME, 9: PAD.LS, 10: PAD.RS },
    triggers: { lt: 2, rt: 5 },
    dpad: [6, 7],
  },
};

export function padStyleOf(id = '') {
  const s = id.toLowerCase();
  // Xbox first: "Xbox Wireless Controller" would otherwise match Sony's generic "Wireless Controller".
  if (/045e|xbox|xinput|x-box/.test(s)) return 'xbox';
  if (/054c|playstation|dualshock|dualsense|wireless controller|ps4|ps5/.test(s)) return 'ps';
  return 'generic';
}

// Button prompts per device family.
const GLYPHS = {
  keyboard: { confirm: 'ENTER', back: 'ESC', pause: 'ESC', gas: 'W', brake: 'S', steer: 'A D', drift: 'SPACE', fire: 'X', form: 'Z', item: 'L⇧', special: 'R⇧', red: 'L⇧', blue: 'R⇧', both: 'L⇧+R⇧', look: 'C', reset: 'R', jump: 'U', rear: 'I', horn: 'H', paint: '▲ ▼', choose: '◀ ▶' },
  xbox: { confirm: 'A', back: 'B', pause: 'MENU', gas: 'RT', brake: 'LT', steer: 'L-STICK', drift: 'X', fire: 'B', form: 'Y', red: 'LB', blue: 'RB', both: 'LB+RB', item: 'LB', special: 'RB', look: 'RS', reset: 'VIEW', jump: 'D-PAD ▲', rear: 'D-PAD ▼', horn: 'LS', paint: '▲ ▼', choose: '◀ ▶' },
  ps: { confirm: '✕', back: '○', pause: 'OPTIONS', gas: 'R2', brake: 'L2', steer: 'L-STICK', drift: '□', fire: '○', form: '△', red: 'L1', blue: 'R1', both: 'L1+R1', item: 'L1', special: 'R1', look: 'R3', reset: 'SHARE', jump: 'D-PAD ▲', rear: 'D-PAD ▼', horn: 'L3', paint: '▲ ▼', choose: '◀ ▶' },
};
GLYPHS.generic = GLYPHS.xbox;
// (the lens buttons are already labelled RED, BOTH and BLUE, so their chips and tips carry no extra glyph)
GLYPHS.touch = { ...GLYPHS.keyboard, gas: 'GAS', brake: 'BRK', steer: '◀ ▶', drift: 'DRIFT', confirm: 'TAP', back: '✕', pause: '❚❚', reset: '↺', look: 'REAR', red: '', blue: '', both: '' };

function normalizePad(p) {
  const buttons = p.buttons.map((b) => (typeof b === 'number' ? b : b.value || (b.pressed ? 1 : 0)));
  const axes = Array.from(p.axes || []);
  if (p.mapping === 'standard') return { buttons, axes: [axes[0] || 0, axes[1] || 0, axes[2] || 0, axes[3] || 0] };
  const style = padStyleOf(p.id);
  let L = style === 'ps' ? RAW_LAYOUTS.ps : RAW_LAYOUTS.xbox;
  if (style === 'ps' && axes.length >= 10 && buttons.length <= 14) L = RAW_LAYOUTS.psDinput;
  const out = new Array(17).fill(0);
  for (const [raw, std] of Object.entries(L.buttons)) out[std] = Math.max(out[std], buttons[raw] || 0);
  // Analogue triggers reported as axes (-1 released .. 1 pressed). An untouched trigger axis
  // can read 0 until first use, which would look half-pressed, so only trust values that moved.
  const trig = (a) => {
    const v = axes[a];
    if (v === undefined || v === 0) return 0;
    return Math.max(0, Math.min(1, (v + 1) / 2));
  };
  if (L.triggers) {
    out[PAD.LT] = Math.max(out[PAD.LT], trig(L.triggers.lt));
    out[PAD.RT] = Math.max(out[PAD.RT], trig(L.triggers.rt));
  }
  if (L.dpad && axes.length > L.dpad[1]) {
    const hx = axes[L.dpad[0]];
    const hy = axes[L.dpad[1]];
    if (hx < -0.5) out[PAD.LEFT] = 1;
    if (hx > 0.5) out[PAD.RIGHT] = 1;
    if (hy < -0.5) out[PAD.UP] = 1;
    if (hy > 0.5) out[PAD.DOWN] = 1;
  }
  if (L.hat !== undefined && axes.length > L.hat) {
    // DirectInput hat switch: -1 up, then clockwise in steps of 2/7; > 1 means centred.
    const v = axes[L.hat];
    if (v >= -1.05 && v <= 1.05) {
      const dir = Math.round((v + 1) / (2 / 7));
      if (dir === 7 || dir === 0 || dir === 1) out[PAD.UP] = 1;
      if (dir >= 1 && dir <= 3) out[PAD.RIGHT] = 1;
      if (dir >= 3 && dir <= 5) out[PAD.DOWN] = 1;
      if (dir >= 5 && dir <= 7) out[PAD.LEFT] = 1;
    }
  }
  // Pads the browser left unmapped that we don't recognise: keep the first face buttons as-is.
  if (style === 'generic') for (let k = 0; k < Math.min(4, buttons.length); k++) out[k] = Math.max(out[k], buttons[k]);
  const rs = L.stickR || [3, 4];
  return { buttons: out, axes: [axes[0] || 0, axes[1] || 0, axes[rs[0]] || 0, axes[rs[1]] || 0] };
}

export class Input {
  constructor() {
    this.down = new Set();
    this.edges = new Set();
    this.twoPlayer = false;
    this.padPrev = [[], [], [], []];
    this.padNow = [[], [], [], []];
    this.padAxes = [[0, 0], [0, 0], [0, 0], [0, 0]];
    this.padStickPrev = [{}, {}, {}, {}];
    this.padStickEdges = [{}, {}, {}, {}];
    this.touch = { active: false, steer: 0, throttle: 0, brake: 0, drift: false, fire: false, reset: false, look: false };
    this.touchEdges = new Set();
    this.lastDevice = 'keyboard';
    this.padStyle = 'xbox';
    this.padInfo = [null, null, null, null];
    this.padRefs = [null, null, null, null];
    this.padEvents = [];
    this.rumbleEnabled = true;
    this.anyPressed = false;
    this.snap = [this.blank(), this.blank()];
    // Control snapshots for online players, by player slot, filled in from the network.
    this.remote = [];
    this.onRemoteRumble = null;

    // Hot-plugging. Browsers only expose a pad after its first button press on the page.
    window.addEventListener('gamepadconnected', (e) => {
      this.padEvents.push({ type: 'connected', index: e.gamepad.index, style: padStyleOf(e.gamepad.id) });
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      this.padEvents.push({ type: 'disconnected', index: e.gamepad.index, style: padStyleOf(e.gamepad.id) });
    });

    window.addEventListener('keydown', (e) => {
      // typing in a text box (online name, room code) belongs to the box, not the game
      if (e.target?.tagName === 'INPUT') return;
      if (GAME_KEYS.has(e.code) && !e.metaKey && !e.ctrlKey) e.preventDefault();
      if (!e.repeat) {
        this.edges.add(e.code);
        this.anyPressed = true;
      }
      this.down.add(e.code);
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  blank() {
    // jump, rear and horn are presses (edges) like item and special.
    // pitch: -1 dive .. 1 climb, only used when flying (wing form).
    return { throttle: 0, brake: 0, steer: 0, pitch: 0, drift: false, fire: false, item: false, special: false, look: false, reset: false, driftPressed: false, jump: false, rear: false, horn: false, form: false };
  }

  key(codes) {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }
  keyEdge(codes) {
    for (const c of codes) if (this.edges.has(c)) return true;
    return false;
  }

  pollPads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      this.padPrev[i] = this.padNow[i];
      const p = pads[i];
      if (!p || !p.connected) {
        this.padNow[i] = [];
        this.padAxes[i] = [0, 0];
        this.padStickEdges[i] = {};
        this.padInfo[i] = null;
        this.padRefs[i] = null;
        continue;
      }
      const n = normalizePad(p);
      this.padRefs[i] = p;
      if (!this.padInfo[i] || this.padInfo[i].id !== p.id) this.padInfo[i] = { id: p.id, style: padStyleOf(p.id), mapping: p.mapping };
      this.padNow[i] = n.buttons;
      this.padAxes[i] = n.axes;
      const [x, y] = this.padAxes[i];
      const now = { left: x < -0.6, right: x > 0.6, up: y < -0.6, down: y > 0.6 };
      const prev = this.padStickPrev[i];
      this.padStickEdges[i] = {
        left: now.left && !prev.left,
        right: now.right && !prev.right,
        up: now.up && !prev.up,
        down: now.down && !prev.down,
      };
      this.padStickPrev[i] = now;
      if (this.padNow[i].some((v, k) => v > 0.5 && !(this.padPrev[i][k] > 0.5)) || Math.abs(x) > 0.6 || Math.abs(y) > 0.6) {
        if (this.padNow[i].some((v, k) => v > 0.5 && !(this.padPrev[i][k] > 0.5))) this.anyPressed = true;
        this.lastDevice = 'gamepad';
        this.padStyle = this.padInfo[i].style === 'generic' ? 'xbox' : this.padInfo[i].style;
      }
    }
  }
  // Label for an action on the device the player last touched ('A', '✕', 'ENTER'...).
  glyph(action) {
    const set = this.lastDevice === 'gamepad' ? GLYPHS[this.padStyle] : this.lastDevice === 'touch' ? GLYPHS.touch : GLYPHS.keyboard;
    return set[action] ?? action.toUpperCase();
  }
  promptStyle() {
    return this.lastDevice === 'gamepad' ? this.padStyle : 'keyboard';
  }

  // Force feedback on the pads driving player p. strong/weak are 0..1 motor strengths.
  rumble(p, strong, weak = strong, ms = 120) {
    if (p >= 0 && this.remote[p]) {
      this.onRemoteRumble?.(p, strong, weak, ms);
      return;
    }
    if (!this.rumbleEnabled || p < 0) return;
    // Don't restart the motors every frame: only override an effect that is weaker or finished.
    const now = performance.now();
    const cur = (this.rumbleState ||= [{ until: 0, level: 0 }, { until: 0, level: 0 }])[p] || { until: 0, level: 0 };
    const level = Math.max(strong, weak);
    if (now < cur.until && level <= cur.level) return;
    this.rumbleState[p] = { until: now + ms, level };
    for (const i of this.padsFor(p)) {
      const pad = this.padRefs[i];
      if (!pad) continue;
      try {
        const act = pad.vibrationActuator;
        if (act && act.playEffect) {
          act.playEffect('dual-rumble', {
            startDelay: 0,
            duration: ms,
            strongMagnitude: Math.min(1, strong),
            weakMagnitude: Math.min(1, weak),
          }).catch(() => {});
        } else if (pad.hapticActuators && pad.hapticActuators[0]?.pulse) {
          pad.hapticActuators[0].pulse(Math.min(1, Math.max(strong, weak)), ms);
        }
      } catch {
        // Rumble is best-effort; some browsers throw for pads without motors.
      }
    }
  }

  padCount() {
    return this.padNow.filter((b) => b.length).length;
  }
  padBtn(i, b) {
    return (this.padNow[i][b] || 0) > 0.5;
  }
  padVal(i, b) {
    return this.padNow[i][b] || 0;
  }
  padEdge(i, b) {
    return (this.padNow[i][b] || 0) > 0.5 && !((this.padPrev[i][b] || 0) > 0.5);
  }
  padStickEdge(i, dir) {
    return !!this.padStickEdges[i][dir];
  }

  // Which gamepads drive player p.
  padsFor(p) {
    const connected = [0, 1, 2, 3].filter((i) => this.padNow[i].length);
    if (!this.twoPlayer) return p === 0 ? connected : [];
    if (connected.length >= 2) return [connected[p]];
    if (connected.length === 1) return p === 1 ? connected : [];
    return [];
  }

  // Called once per frame before game logic.
  update() {
    this.pollPads();
    for (let p = 0; p < 2; p++) this.buildSnapshot(p);
  }

  buildSnapshot(p) {
    const c = this.snap[p];
    const b = this.twoPlayer ? BIND_SPLIT[p] : p === 0 ? BIND_SOLO : null;
    let throttle = 0;
    let brake = 0;
    let steer = 0;
    let drift = false;
    let fire = false;
    let item = false;
    let special = false;
    let look = false;
    let reset = false;
    let driftPressed = false;
    let jump = false;
    let rear = false;
    let horn = false;
    let form = false;
    // Flying: forward dives, back climbs (keys double as gas and brake, the stick's Y axis on pads).
    let pitch = 0;
    if (b) {
      pitch = (this.key(b.brake) ? 1 : 0) - (this.key(b.accel) ? 1 : 0);
      if (this.key(b.accel)) throttle = 1;
      if (this.key(b.brake)) brake = 1;
      if (this.key(b.left)) steer -= 1;
      if (this.key(b.right)) steer += 1;
      drift = this.key(b.drift);
      driftPressed = this.keyEdge(b.drift);
      fire = this.key(b.fire);
      item = this.keyEdge(b.item);
      special = this.keyEdge(b.special);
      look = this.key(b.look);
      reset = this.key(b.reset);
      jump = this.keyEdge(b.jump);
      // both Shift keys down together: back to BOTH, not one lens then the other
      if (!this.twoPlayer && this.down.has('ShiftLeft') && this.down.has('ShiftRight') && (this.edges.has('ShiftLeft') || this.edges.has('ShiftRight'))) {
        item = special = false;
        jump = true;
      }
      rear = this.keyEdge(b.rear);
      horn = this.keyEdge(b.horn);
      form = this.keyEdge(b.form || []);
    }
    for (const i of this.padsFor(p)) {
      throttle = Math.max(throttle, this.padVal(i, PAD.RT), this.padBtn(i, PAD.A) ? 1 : 0);
      brake = Math.max(brake, this.padVal(i, PAD.LT));
      // B / ○ fires your SEAM CHARGE
      fire = fire || this.padBtn(i, PAD.B);
      let ax = this.padAxes[i][0];
      ax = Math.abs(ax) < 0.15 ? 0 : (ax - Math.sign(ax) * 0.15) / 0.85;
      if (this.padBtn(i, PAD.LEFT)) ax = -1;
      if (this.padBtn(i, PAD.RIGHT)) ax = 1;
      if (Math.abs(ax) > Math.abs(steer)) steer = ax;
      let ay = this.padAxes[i][1];
      ay = Math.abs(ay) < 0.2 ? 0 : (ay - Math.sign(ay) * 0.2) / 0.8;
      if (Math.abs(ay) > Math.abs(pitch)) pitch = ay;
      // Retro Shift: drift on X, LB shifts to RED, RB to BLUE, Y back to BOTH.
      drift = drift || this.padBtn(i, PAD.X);
      driftPressed = driftPressed || this.padEdge(i, PAD.X);
      const shoulders = this.padBtn(i, PAD.LB) && this.padBtn(i, PAD.RB) && (this.padEdge(i, PAD.LB) || this.padEdge(i, PAD.RB));
      if (!shoulders) {
        item = item || this.padEdge(i, PAD.LB);
        special = special || this.padEdge(i, PAD.RB);
      }
      look = look || this.padBtn(i, PAD.RS);
      // View (Xbox) / Share (PS4), held, puts a stuck truck back on track.
      reset = reset || this.padBtn(i, PAD.BACK);
      // Twisted Metal style energy moves on the d-pad (left/right still steer).
      // Y / △ is the form's own move; back to BOTH is D-pad up, both shoulders together, or the lens you're in again
      form = form || this.padEdge(i, PAD.Y);
      jump = jump || this.padEdge(i, PAD.UP) || shoulders;
      rear = rear || this.padEdge(i, PAD.DOWN);
      horn = horn || this.padEdge(i, PAD.LS);
    }
    if (p === 0 && this.touch.active) {
      const t = this.touch;
      throttle = Math.max(throttle, t.throttle);
      brake = Math.max(brake, t.brake);
      if (Math.abs(t.steer) > Math.abs(steer)) steer = t.steer;
      if (Math.abs(t.pitch || 0) > Math.abs(pitch)) pitch = t.pitch;
      drift = drift || t.drift;
      driftPressed = driftPressed || this.touchEdges.has('drift');
      fire = fire || t.fire;
      item = item || this.touchEdges.has('item');
      special = special || this.touchEdges.has('special');
      reset = reset || t.reset;
      look = look || t.look;
      jump = jump || this.touchEdges.has('jump');
      rear = rear || this.touchEdges.has('rear');
      horn = horn || this.touchEdges.has('horn');
    }
    c.throttle = throttle;
    c.brake = brake;
    c.steer = Math.max(-1, Math.min(1, steer));
    c.pitch = Math.max(-1, Math.min(1, pitch));
    c.drift = drift;
    c.driftPressed = driftPressed;
    c.fire = fire;
    c.item = item;
    c.special = special;
    c.look = look;
    c.reset = reset;
    c.jump = jump;
    c.rear = rear;
    c.horn = horn;
    c.form = form;
  }

  controls(p) {
    return this.remote[p] || this.snap[p];
  }

  // Menu-style edge actions from any device.
  menu(action) {
    if (action === 'confirm' && this.touchEdges.has('confirm')) return true;
    if (this.keyEdge(MENU[action])) return true;
    for (let i = 0; i < 4; i++) {
      if (!this.padNow[i].length) continue;
      switch (action) {
        case 'confirm':
          if (this.padEdge(i, PAD.A) || this.padEdge(i, PAD.START)) return true;
          break;
        case 'back':
          if (this.padEdge(i, PAD.B)) return true;
          break;
        case 'pause':
          if (this.padEdge(i, PAD.START)) return true;
          break;
        case 'up':
          if (this.padEdge(i, PAD.UP) || this.padStickEdge(i, 'up')) return true;
          break;
        case 'down':
          if (this.padEdge(i, PAD.DOWN) || this.padStickEdge(i, 'down')) return true;
          break;
        case 'left':
          if (this.padEdge(i, PAD.LEFT) || this.padStickEdge(i, 'left')) return true;
          break;
        case 'right':
          if (this.padEdge(i, PAD.RIGHT) || this.padStickEdge(i, 'right')) return true;
          break;
      }
    }
    return false;
  }

  // Is a menu action's key or button held down right now (not only pressed this frame)?
  menuHeld(action) {
    if (this.key(MENU[action] || [])) return true;
    const btns = { confirm: [PAD.A, PAD.START], back: [PAD.B], pause: [PAD.START] }[action] || [];
    for (let i = 0; i < 4; i++) for (const b of btns) if ((this.padNow[i][b] || 0) > 0.5) return true;
    return false;
  }

  // Second-player menu edges for split-screen truck select.
  menuP2(action) {
    const map = { left: ['ArrowLeft'], right: ['ArrowRight'], confirm: ['Enter', 'NumpadEnter'], back: ['Backspace'] };
    if (map[action] && this.keyEdge(map[action])) return true;
    const pads = this.padsFor(1);
    for (const i of pads) {
      if (action === 'left' && (this.padEdge(i, PAD.LEFT) || this.padStickEdge(i, 'left'))) return true;
      if (action === 'right' && (this.padEdge(i, PAD.RIGHT) || this.padStickEdge(i, 'right'))) return true;
      if (action === 'confirm' && this.padEdge(i, PAD.A)) return true;
      if (action === 'back' && this.padEdge(i, PAD.B)) return true;
    }
    return false;
  }

  touchEdge(name) {
    this.touchEdges.add(name);
  }

  // Called at the end of each frame.
  endFrame() {
    this.edges.clear();
    this.touchEdges.clear();
    this.anyPressed = false;
  }
}

// ------------------------------------------------------------------ remapped keys (Settings > Accessibility > Keys)
// One key per action for the solo keyboard. The chosen key replaces that action's keys and is taken off any other
// action that had it; the action's prompt glyph follows. (Split-screen keeps its fixed layout.)
export const REMAP_ACTIONS = [
  ['accel', 'GAS'], ['brake', 'BRAKE'], ['left', 'STEER LEFT'], ['right', 'STEER RIGHT'], ['drift', 'DRIFT'],
  ['item', 'RED'], ['special', 'BLUE'], ['jump', 'BOTH'], ['fire', 'CHARGE'], ['form', 'FORM MOVE'],
  ['horn', 'HORN'], ['look', 'LOOK BACK'], ['reset', 'RESET'],
];
const DEFAULT_SOLO = JSON.parse(JSON.stringify(BIND_SOLO));
const DEFAULT_GLYPHS = { ...GLYPHS.keyboard };
const NAMES = { Space: 'SPACE', ShiftLeft: 'L⇧', ShiftRight: 'R⇧', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', ArrowUp: '▲', ArrowDown: '▼', ArrowLeft: '◀', ArrowRight: '▶', Enter: 'ENTER', Tab: 'TAB', Backspace: '⌫', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=' };
export function keyLabel(code = '') {
  return NAMES[code] || code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'NUM ').toUpperCase();
}
export const soloKeys = (action) => BIND_SOLO[action] || [];
// map: { action: code }. An empty map puts the defaults back.
export function applyKeymap(map = {}) {
  for (const a of Object.keys(DEFAULT_SOLO)) BIND_SOLO[a] = [...DEFAULT_SOLO[a]];
  for (const [action, code] of Object.entries(map)) {
    if (!BIND_SOLO[action] || !code) continue;
    for (const a of Object.keys(BIND_SOLO)) BIND_SOLO[a] = BIND_SOLO[a].filter((c) => c !== code);
    BIND_SOLO[action] = [code];
    GAME_KEYS.add(code);
  }
  const K = GLYPHS.keyboard;
  Object.assign(K, DEFAULT_GLYPHS);
  const L = (a) => keyLabel(BIND_SOLO[a][0]);
  if (map.accel) K.gas = L('accel');
  if (map.brake) K.brake = L('brake');
  if (map.left || map.right) K.steer = `${L('left')} ${L('right')}`;
  for (const [a, g] of [['drift', 'drift'], ['fire', 'fire'], ['form', 'form'], ['horn', 'horn'], ['look', 'look'], ['reset', 'reset']]) if (map[a]) K[g] = L(a);
  if (map.item) K.red = K.item = L('item');
  if (map.special) K.blue = K.special = L('special');
  if (map.jump) K.both = K.jump = L('jump');
}
