// Keyboard + touch → two virtual gamepads.
// Solo mode: both key schemes drive pad 0 (and touch always does).
// Versus mode: WASD-cluster = P1, arrows-cluster = P2.

function blankPad() {
  return { left: false, right: false, up: false, down: false, block: false, launch: false, slap: false, punch: false, kick: false, special: false, super: false, bomb: false, dash: false, steal: false };
}

// DOWN is CROUCH (you can still attack from it, fighting-game style).
// Blocking moved to its own key — holding down used to enter block state and
// swallow every other input, which is why "not all the controls work".
const P1_KEYS = {
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyQ: 'block',
  KeyZ: 'launch', KeyX: 'slap', KeyC: 'punch', KeyV: 'kick', KeyB: 'special', KeyG: 'super',
  KeyF: 'bomb', KeyR: 'dash', KeyT: 'steal',
};
const P2_KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Slash: 'block',
  KeyN: 'launch', KeyH: 'slap', KeyJ: 'punch', KeyK: 'kick', KeyL: 'special', KeyU: 'super',
  KeyI: 'bomb', KeyO: 'dash', KeyM: 'steal',
};

export const KEY_LABELS = {
  solo: [
    ['Move', '← → / A D'], ['Jump', '↑ / W'], ['Crouch', '↓ / S'], ['NDA — block (hold) 📄', '/ or Q'],
    ['Slap 🖐', 'H / X'], ['Punch 👊', 'J / C'], ['Kick 👟', 'K / V'], ['Launch 🚀 (anti-air)', 'N / Z'],
    ['Cease & Desist ⚖️', 'I / F'], ['Acqui-Hire 💸', 'M / T'],
    ['Dash 💨', 'O / R'], ['Special ⚡', 'L / B'], ['Unicorn Mode 🦄', 'U / G'], ['Pause', 'Esc'],
  ],
};

class Input {
  constructor() {
    this.pads = [blankPad(), blankPad()];
    // presses latch until sampled, so taps during hitstop/frozen frames
    // (or shorter than one sim frame) are never lost — combos depend on it
    this.latch = [{}, {}];
    this.mode = 'solo';
    this.onPause = null;
    this.enabled = false;
  }

  press(padIdx, key, down) {
    this.pads[padIdx][key] = down;
    if (down) this.latch[padIdx][key] = true;
  }

  // One sim-frame's view of a pad: held keys + any presses since last sample.
  samplePad(i) {
    const pad = { ...this.pads[i] };
    const latch = this.latch[i];
    for (const k in latch) if (latch[k]) pad[k] = true;
    this.latch[i] = {};
    return pad;
  }

  init() {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.reset());
  }

  onKey(e, down) {
    if (!this.enabled) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // never swallow browser shortcuts (Cmd+R, Ctrl+F…)
    // A control with focus keeps its keys: the pause menu's volume slider
    // could not be moved with the arrows, which the fight took.
    // Only the press: a key let go there is let go in the fight too, or one
    // held into the pause menu stayed held after it.
    if (down && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '') && e.code !== 'Escape') return;
    if (down && (e.code === 'Escape' || e.code === 'KeyP')) {
      if (this.onPause) this.onPause();
      e.preventDefault();
      return;
    }
    const inP1 = P1_KEYS[e.code];
    const inP2 = P2_KEYS[e.code];
    if (!inP1 && !inP2) return;
    e.preventDefault();
    if (this.mode === 'solo') {
      if (inP1) this.press(0, inP1, down);
      if (inP2) this.press(0, inP2, down);
    } else {
      if (inP1) this.press(0, inP1, down);
      if (inP2) this.press(1, inP2, down);
    }
  }

  reset() {
    this.pads[0] = blankPad();
    this.pads[1] = blankPad();
    this.latch = [{}, {}];
  }

  // Wire the on-screen touch pads (always feed pad 0).
  attachTouch(container) {
    container.querySelectorAll('[data-k]').forEach(btn => {
      const key = btn.dataset.k;
      const press = (e) => {
        e.preventDefault();
        btn.classList.add('held');
        this.press(0, key, true);
      };
      const release = (e) => {
        if (e) e.preventDefault();
        btn.classList.remove('held');
        this.pads[0][key] = false;
      };
      btn.addEventListener('pointerdown', (e) => {
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* capture is best-effort */ }
        press(e);
      });
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', () => release());
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }
}

export const input = new Input();

export function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

// Controller interface: anything with update(fighter, game) that flips fighter.pad flags.
// HumanController reads a live input pad; AIController (ai.js) synthesizes one;
// a future OnlineController (net/online.js) will replay remote pads. Same contract.
export class HumanController {
  constructor(padIndex) { this.padIndex = padIndex; this.isHuman = true; }
  update(fighter) {
    fighter.pad = input.samplePad(this.padIndex);
  }
}
