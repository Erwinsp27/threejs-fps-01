// DUSTLINE — the player: first-person movement with acceleration, crouching and
// AABB collision, plus the view model (gun) the camera carries. One fixed-step
// update; the render loop only reads the camera it writes.
import * as THREE from 'three';
import { WEAPONS } from './state.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.12;
const RADIUS = 0.42;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.6;
const ACCEL = 42;
const FRICTION = 10;

export function createPlayer(scene, camera, world) {
  // View model: a simple rifle built from boxes, parented to the camera.
  const gunMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const gunWood = new THREE.MeshLambertMaterial({ color: 0x6b4f26 });
  const gun = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62), gunMat);
  body.position.set(0, -0.02, -0.1);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 8), gunMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.01, -0.55);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), gunWood);
  grip.position.set(0, -0.1, 0.08);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.12), gunMat);
  sight.position.set(0, 0.08, -0.18);
  gun.add(body, barrel, grip, sight);
  gun.position.set(0.26, -0.24, -0.42);
  camera.add(gun);
  scene.add(camera);

  return {
    team: 'vanguard',   // the player always fights for Vanguard (the attackers)
    x: -28, z: 0, y: 0,
    vx: 0, vz: 0,
    yaw: -Math.PI / 2,   // facing east, down mid
    pitch: 0,
    hp: 100,
    alive: true,
    crouched: false,
    onGround: true,
    carrier: false,       // true while carrying the charge
    weaponId: 'longshot',
    mag: 30, reserve: 90,
    reloading: 0,         // seconds left, 0 = not reloading
    fireCooldown: 0,
    bloom: 0,             // accumulated spread from firing
    recoilPitch: 0,       // unrecovered recoil, decays back to 0
    grenades: { popper: 0, veil: 0 },
    money: 800,
    kills: 0,
    lastDamageFrom: null,
    camera, gun, world,
  };
}

export function resetPlayer(p, spawn, weaponId) {
  p.x = spawn[0]; p.z = spawn[1];
  p.vx = 0; p.vz = 0;
  p.yaw = -Math.PI / 2; p.pitch = 0;
  p.hp = 100; p.alive = true; p.crouched = false;
  p.carrier = false;
  const w = WEAPONS[weaponId];
  p.weaponId = weaponId; p.mag = w.mag; p.reserve = w.reserve;
  p.reloading = 0; p.fireCooldown = 0; p.bloom = 0; p.recoilPitch = 0;
  p.lastDamageFrom = null;
}

// Resolve XZ movement against AABB colliders, axis by axis, so the player slides
// along walls instead of sticking. Only colliders taller than the player's feet
// block; low props (site markers) never do.
function moveAxis(p, world, dx, dz) {
  const c = world.colliders;
  // X axis
  let nx = p.x + dx;
  for (let i = 0; i < c.length; i++) {
    const b = c[i];
    if (b.top < 0.2) continue;
    if (nx + RADIUS > b.minX && nx - RADIUS < b.maxX && p.z + RADIUS > b.minZ && p.z - RADIUS < b.maxZ) {
      nx = dx > 0 ? b.minX - RADIUS : b.maxX + RADIUS;
    }
  }
  p.x = Math.max(world.bounds.minX + RADIUS, Math.min(world.bounds.maxX - RADIUS, nx));
  // Z axis
  let nz = p.z + dz;
  for (let i = 0; i < c.length; i++) {
    const b = c[i];
    if (b.top < 0.2) continue;
    if (p.x + RADIUS > b.minX && p.x - RADIUS < b.maxX && nz + RADIUS > b.minZ && nz - RADIUS < b.maxZ) {
      nz = dz > 0 ? b.minZ - RADIUS : b.maxZ + RADIUS;
    }
  }
  p.z = Math.max(world.bounds.minZ + RADIUS, Math.min(world.bounds.maxZ - RADIUS, nz));
}

// One fixed step (dt = 1/60). input: {f, r, crouch, sprint} in -1..1.
export function stepPlayer(p, input, dt) {
  if (!p.alive) return;
  const speed = p.crouched ? CROUCH_SPEED : WALK_SPEED;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  // Forward is -Z rotated by yaw; right is +X rotated by yaw.
  const fx = -sin, fz = -cos, rx = cos, rz = -sin;
  let mx = fx * input.f + rx * input.r;
  let mz = fz * input.f + rz * input.r;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  p.vx += mx * ACCEL * dt;
  p.vz += mz * ACCEL * dt;
  // Friction when no input; clamp to top speed.
  const fr = Math.max(0, 1 - FRICTION * dt);
  if (len < 0.05) { p.vx *= fr; p.vz *= fr; }
  const sp = Math.hypot(p.vx, p.vz);
  if (sp > speed) { p.vx *= speed / sp; p.vz *= speed / sp; }
  moveAxis(p, p.world, p.vx * dt, p.vz * dt);
  // Recoil recovers; bloom decays; reload and fire timers tick.
  p.recoilPitch *= Math.max(0, 1 - 6 * dt);
  p.bloom = Math.max(0, p.bloom - 0.02 * dt);
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      const w = WEAPONS[p.weaponId];
      const need = w.mag - p.mag;
      const take = Math.min(need, p.reserve);
      p.mag += take; p.reserve -= take;
      p.reloading = 0;
    }
  }
  if (p.fireCooldown > 0) p.fireCooldown -= dt;
}

export function groundSpeed(p) {
  return Math.hypot(p.vx, p.vz);
}

// Write the camera from the player state. Called every render, never in the sim.
export function updateCamera(p) {
  const eye = p.crouched ? EYE_CROUCH : EYE_STAND;
  p.camera.position.set(p.x, eye, p.z);
  p.camera.rotation.order = 'YXZ';
  p.camera.rotation.y = p.yaw;
  p.camera.rotation.x = p.pitch + p.recoilPitch;
  p.camera.rotation.z = 0;
  // Gun kick: the view model dips back with recoil and sways with movement.
  p.gun.position.z = -0.42 + p.recoilPitch * 0.25;
  p.gun.position.y = -0.24 + Math.sin(p.recoilPitch * 40) * 0.004;
}
