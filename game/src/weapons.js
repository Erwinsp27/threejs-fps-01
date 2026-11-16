// DUSTLINE — weapons: fire, reload and grenades. Pure numbers in, one shot out.
// Spread punishes firing on the move and in the air, and rewards stopping to aim;
// crouching halves it. Recoil kicks the pitch up and recovers over a few frames.
import * as THREE from 'three';
import { WEAPONS, GRENADES } from './state.js';
import { groundSpeed } from './player.js';

// Current spread in radians for a shooter (player or bot) with this weapon.
export function currentSpread(shooter, weapon, moving) {
  let s = weapon.spread + shooter.bloom;
  if (moving) s += weapon.moveSpread * Math.min(1, groundSpeed(shooter) / 5.2);
  if (shooter.crouched) s *= 0.55;
  return s;
}

// Fire one bullet from `shooter` (player or bot). Returns a shot record or null
// when the weapon cannot fire (empty, cooling down, reloading). The caller owns
// raycasting the shot; this only spends the round and works out the spread.
export function tryFire(shooter, weapon, dt) {
  if (shooter.reloading > 0 || shooter.fireCooldown > 0) return null;
  if (shooter.mag <= 0) return { dry: true };
  shooter.mag -= 1;
  shooter.fireCooldown = 60 / weapon.rate;
  shooter.bloom = Math.min(0.03, shooter.bloom + weapon.bloom);
  shooter.recoilPitch = (shooter.recoilPitch || 0) + weapon.recoil * 0.12;
  return { dry: false };
}

export function startReload(shooter) {
  const w = WEAPONS[shooter.weaponId];
  if (shooter.reloading > 0 || shooter.mag >= w.mag || shooter.reserve <= 0) return false;
  shooter.reloading = w.reload;
  return true;
}

export function buyWeapon(state, weaponId) {
  const w = WEAPONS[weaponId];
  if (!w || state.money < w.price) return false;
  state.money -= w.price;
  const p = state.player;
  p.weaponId = weaponId;
  p.mag = w.mag; p.reserve = w.reserve;
  p.reloading = 0; p.fireCooldown = 0;
  return true;
}

export function buyGrenade(state, grenadeId) {
  const g = GRENADES[grenadeId];
  if (!g || state.money < g.price) return false;
  if (state.player.grenades[grenadeId] >= 2) return false;
  state.money -= g.price;
  state.player.grenades[grenadeId] += 1;
  return true;
}

// Damage at a distance, with falloff. Headshots multiply.
export function damageAt(weapon, dist, head) {
  let d = weapon.damage;
  if (dist > weapon.falloffStart) {
    const t = Math.min(1, (dist - weapon.falloffStart) / (weapon.range - weapon.falloffStart));
    d *= 1 - (1 - weapon.falloffMin) * t;
  }
  if (head) d *= weapon.headMult;
  return d;
}

// Throw a grenade from a position along a direction. The grenade entity flies
// with gravity, bounces once off the ground, then resolves (frag: radial damage;
// smoke: a cloud that blocks line of sight for its duration).
export function throwGrenade(state, from, dir, kind) {
  const v = new THREE.Vector3(dir.x, dir.y + 0.25, dir.z).normalize().multiplyScalar(16);
  state.entities.push({
    kind: 'grenade', grenade: kind, x: from.x, y: from.y, z: from.z,
    vx: v.x, vy: v.y, vz: v.z, t: 0, fuse: kind === 'popper' ? 1.6 : 1.1,
    resolved: false, mesh: null,
  });
}
