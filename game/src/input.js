// input.js — keyboard, mouse and pointer lock, kept apart from the sim so
// the player controller can be driven by real input or by a test harness.

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    mouseDX: 0,
    mouseDY: 0,
    firing: false,
    locked: false,
    // One-shot actions queued by keydown, consumed once per tick.
    pressed: new Set(),
  };

  const CODE_ALIASES = {
    KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
    ShiftLeft: 'walk', ShiftRight: 'walk',
    ControlLeft: 'crouch', KeyC: 'crouch',
    KeyR: 'reload', KeyB: 'buy', KeyE: 'use', KeyG: 'grenade',
    Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'slot4',
    Digit5: 'slot5', Digit6: 'slot6',
  };

  function onKeyDown(e) {
    if (e.repeat) return;
    input.keys.add(e.code);
    const action = CODE_ALIASES[e.code];
    if (action) input.pressed.add(action);
    if (e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) {
    input.keys.delete(e.code);
  }
  function onMouseMove(e) {
    if (!input.locked) return;
    input.mouseDX += e.movementX;
    input.mouseDY += e.movementY;
  }
  function onMouseDown(e) {
    if (e.button === 0) input.firing = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) input.firing = false;
  }
  function onLockChange() {
    input.locked = document.pointerLockElement === canvas;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);

  input.requestLock = () => {
    if (!input.locked) {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (_) { /* pointer lock unavailable (headless): play on */ }
    }
  };

  // Consume the accumulated mouse delta for this tick.
  input.consumeMouse = () => {
    const out = { dx: input.mouseDX, dy: input.mouseDY };
    input.mouseDX = 0;
    input.mouseDY = 0;
    return out;
  };

  // True once when the action key was pressed since the last tick.
  input.wasPressed = (action) => {
    if (input.pressed.has(action)) {
      input.pressed.delete(action);
      return true;
    }
    return false;
  };

  input.endTick = () => {
    input.pressed.clear();
  };

  input.isDown = (action) => {
    // Map an action back to its physical keys.
    for (const [code, a] of Object.entries(CODE_ALIASES)) {
      if (a === action && input.keys.has(code)) return true;
    }
    return false;
  };

  return input;
}
