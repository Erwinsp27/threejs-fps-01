// player.js — the human on Vanguard. Acceleration-based movement with
// crouching, mouse look with recoil, weapon slots, the buy menu and the
// plant/defuse key. Everything here runs inside the fixed 60 Hz tick.

import { weaponDef, WEAPONS, GRENADES, BUY_MENU } from './weapons.js';
import { shoot, startReload, throwGrenade, updateObjective } from './combat.js';
import { collideMove, pointInSite } from './world.js';
import { emit } from './state.js';

const WALK_SPEED = 5.0;
const CROUCH_SPEED = 2.6;
const WALK_SLOW_SPEED = 2.8; // Shift: slow, accurate, quiet
const ACCEL = 42;
const FRICTION = 11;
const MOUSE_SENS = 0.0022;

// Buying: returns true when the purchase went through.
export function tryBuy(S, p, itemId) {
  if (S.phase !== 'buy') return false;
  const gun = WEAPONS[itemId];
  if (gun) {
    if (p.money < gun.price) return false;
    if (p.primary === itemId) return false; // already own it
    p.money -= gun.price;
    p.primary = itemId;
    p.weapon = itemId;
    p.mag = gun.mag;
    p.reserve = gun.reserve;
    p.reloading = false;
    emit(S, 'buy', { agent: p.id, item: itemId });
    return true;
  }
  const nade = GRENADES[itemId];
  if (nade) {
    if (p.money < nade.price) return false;
    if (p.grenades[itemId] >= 2) return false; // two of each at most
    p.money -= nade.price;
    p.grenades[itemId]++;
    emit(S, 'buy', { agent: p.id, item: itemId });
    return true;
  }
  return false;
}

export function updatePlayer(S, p, input, dt, blockers, hud) {
  if (!p.alive) return;
  const mouse = input.consumeMouse();

  // --- look ---
  p.yaw -= mouse.dx * MOUSE_SENS;
  p.pitch -= mouse.dy * MOUSE_SENS;
  // Recoil pulls the view up and settles back down.
  p.pitch += p.recoil * 0.35;
  p.recoil = Math.max(0, p.recoil - dt * 0.25);
  const pitchMax = 1.45;
  p.pitch = Math.max(-pitchMax, Math.min(pitchMax, p.pitch));
  p.bloom = Math.max(0, p.bloom - dt * 0.05);

  // --- move ---
  const fwd = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
  const strafe = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
  p.crouch = input.isDown('crouch');
  const slow = input.isDown('walk');
  const maxSpeed = p.crouch ? CROUCH_SPEED : slow ? WALK_SLOW_SPEED : WALK_SPEED;
  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  // Forward is -Z rotated by yaw; right is +X rotated by yaw.
  let mx = -sin * fwd + cos * strafe;
  let mz = -cos * fwd - sin * strafe;
  const mLen = Math.hypot(mx, mz);
  if (mLen > 0) {
    mx /= mLen;
    mz /= mLen;
  }
  const frozen = false; // buy phase still lets you move around spawn
  if (!frozen && mLen > 0) {
    p.vel.x += mx * ACCEL * dt;
    p.vel.z += mz * ACCEL * dt;
    const vLen = Math.hypot(p.vel.x, p.vel.z);
    if (vLen > maxSpeed) {
      p.vel.x = (p.vel.x / vLen) * maxSpeed;
      p.vel.z = (p.vel.z / vLen) * maxSpeed;
    }
  } else {
    // Friction stops you; stopping to aim pays.
    const vLen = Math.hypot(p.vel.x, p.vel.z);
    if (vLen > 0) {
      const drop = Math.min(vLen, FRICTION * dt * (p.crouch ? 1.6 : 1));
      p.vel.x -= (p.vel.x / vLen) * drop;
      p.vel.z -= (p.vel.z / vLen) * drop;
    }
  }
  p.moving = Math.hypot(p.vel.x, p.vel.z) > 0.4;
  collideMove(p.pos, 0.35, p.vel.x * dt, p.vel.z * dt, blockers);

  // --- weapon slots ---
  if (input.wasPressed('slot1')) selectWeapon(S, p, 'pistol');
  if (input.wasPressed('slot2') && p.primary === 'rifle') selectWeapon(S, p, 'rifle');
  if (input.wasPressed('slot3') && p.primary === 'shotgun') selectWeapon(S, p, 'shotgun');
  if (input.wasPressed('slot4') && p.primary === 'dmr') selectWeapon(S, p, 'dmr');
  if (input.wasPressed('slot5') && p.grenades.smoke > 0) selectWeapon(S, p, 'smoke');
  if (input.wasPressed('slot6') && p.grenades.frag > 0) selectWeapon(S, p, 'frag');

  // --- buy menu keys (only during the buy phase) ---
  if (S.phase === 'buy') {
    for (const item of BUY_MENU) {
      if (input.wasPressed('slot' + item.key)) tryBuy(S, p, item.id);
    }
  }

  // --- fire / reload ---
  if (p.fireCd > 0) p.fireCd -= dt;
  const def = weaponDef(p.weapon);
  if (p.weapon === 'smoke' || p.weapon === 'frag') {
    if (input.firing) {
      if (throwGrenade(S, p, p.weapon)) {
        selectWeapon(S, p, p.primary || 'pistol');
      }
      input.firing = false; // one throw per click
    }
  } else if (input.firing && S.phase === 'live') {
    if (def.auto) {
      shoot(S, p, blockers);
    } else if (!p._firedThisClick) {
      shoot(S, p, blockers);
      p._firedThisClick = true;
    }
  }
  if (!input.firing) p._firedThisClick = false;
  if (input.wasPressed('reload')) startReload(S, p);

  // --- plant / defuse: hold E ---
  const useHeld = input.isDown('use');
  if (useHeld && S.phase === 'live') {
    if (p.hasBomb && (pointInSite('A', p.pos.x, p.pos.z) || pointInSite('B', p.pos.x, p.pos.z))) {
      p.planting = true;
    } else if (S.bomb.state === 'planted' && p.team === 'J') {
      p.defusing = true;
    }
  } else {
    p.planting = false;
    p.defusing = false;
  }
  updateObjective(S, p, dt);

  // --- bomb pickup is handled globally; show the hint through the HUD ---
  if (hud) {
    if (p.hasBomb && S.bomb.state === 'carried') {
      const inSite = pointInSite('A', p.pos.x, p.pos.z) || pointInSite('B', p.pos.x, p.pos.z);
      hud.setHint(inSite ? 'Hold E to plant the bomb' : 'You carry the bomb — take it to Site A or B');
    } else if (S.bomb.state === 'dropped') {
      hud.setHint('The bomb is down — walk over it to pick it up');
    } else if (S.bomb.state === 'planted' && p.team === 'V') {
      hud.setHint('Bomb planted — defend Site ' + S.bomb.site);
    } else if (S.bomb.state === 'planted' && p.team === 'J') {
      hud.setHint('Bomb planted at Site ' + S.bomb.site + ' — hold E near it to defuse');
    } else {
      hud.setHint('');
    }
  }
}

function selectWeapon(S, p, id) {
  if (id === 'smoke' || id === 'frag') {
    if (p.grenades[id] <= 0) return;
    p.weapon = id;
    return;
  }
  const def = weaponDef(id);
  if (id !== 'pistol' && p.primary !== id) return;
  // Stash the current gun's ammo before switching, so swapping guns never
  // refills them.
  if (p.weapon === 'pistol') {
    p._pistolMag = p.mag;
    p._pistolReserve = p.reserve;
  } else if (p.weapon !== 'smoke' && p.weapon !== 'frag') {
    p._primaryMag = p.mag;
    p._primaryReserve = p.reserve;
  }
  p.weapon = id;
  if (id === 'pistol') {
    p.mag = p._pistolMag !== undefined ? p._pistolMag : 12;
    p.reserve = p._pistolReserve !== undefined ? p._pistolReserve : 36;
  } else {
    p.mag = p._primaryMag !== undefined ? p._primaryMag : def.mag;
    p.reserve = p._primaryReserve !== undefined ? p._primaryReserve : def.reserve;
  }
  p.reloading = false;
  p.reloadT = 0;
}
