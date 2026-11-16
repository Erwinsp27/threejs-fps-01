// DUSTLINE — input: keyboard state, mouse look with pointer lock, and the action
// keys (fire, reload, grenade, buy, plant). The sim reads `input.state` once per
// fixed step; mouse deltas accumulate between steps and are consumed by main.js.
export function createInput(doc, canvas) {
  const keys = new Set();
  const state = {
    f: 0, r: 0, crouch: false, sprint: false,
    firing: false, reload: false, grenade: null, interact: false,
    buy: false, locked: false,
  };
  let mouseDX = 0, mouseDY = 0;
  let interactHeld = false;

  function recompute() {
    state.f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    state.r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    state.crouch = keys.has('ControlLeft') || keys.has('KeyC');
    state.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  }

  doc.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyR') state.reload = true;
    if (e.code === 'KeyE') { state.interact = true; interactHeld = true; }
    if (e.code === 'KeyB') state.buy = true;
    if (e.code === 'Digit1') state.weaponKey = 'p9';
    if (e.code === 'Digit2') state.weaponKey = 'hornet';
    if (e.code === 'Digit3') state.weaponKey = 'longshot';
    if (e.code === 'Digit4') state.weaponKey = 'deadeye';
    if (e.code === 'KeyG') state.grenade = 'popper';
    if (e.code === 'KeyH') state.grenade = 'veil';
    recompute();
  });
  doc.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'KeyE') interactHeld = false;
    recompute();
  });
  doc.addEventListener('mousemove', (e) => {
    if (state.locked) { mouseDX += e.movementX; mouseDY += e.movementY; }
  });
  doc.addEventListener('mousedown', (e) => {
    if (e.button === 0 && state.locked) state.firing = true;
  });
  doc.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.firing = false;
  });
  doc.addEventListener('pointerlockchange', () => {
    state.locked = doc.pointerLockElement === canvas;
  });
  // Clicking the canvas (or the start overlay) requests pointer lock.
  canvas.addEventListener('click', () => {
    if (!state.locked && canvas.requestPointerLock) canvas.requestPointerLock();
  });

  return {
    state,
    consumeMouse() {
      const dx = mouseDX, dy = mouseDY;
      mouseDX = 0; mouseDY = 0;
      return { dx, dy };
    },
    isInteracting() { return interactHeld; },
    clearOneShots() {
      state.reload = false; state.buy = false; state.grenade = null;
      state.weaponKey = null;
    },
  };
}
