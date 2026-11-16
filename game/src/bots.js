// DUSTLINE — bots: nine AI fighters that route through the map, hold angles, react
// to what they see and hear, and play the objective (plant / defuse). Decisions run
// at 10 Hz; steering and firing run every fixed step. One bot per team carries the
// objective path; the rest fight the lanes.
import * as THREE from 'three';
import { WEAPONS, ECONOMY, MATCH } from './state.js';
import { findRoute, nearestWaypoint } from './world.js';
import { resolveShot, applyDamage, endRound } from './combat.js';
import { tryFire, currentSpread } from './weapons.js';

const RADIUS = 0.42;
const BOT_SPEED = 4.3;
const EYE = 1.55;
const PERCEIVE_EVERY = 0.1;

const NAMES = {
  vanguard: ['ROOK', 'HAVOC', 'SABLE', 'WREN'],
  jackals: ['DUNE', 'VEX', 'MIRAGE', 'FANG', 'GHOST'],
};

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _ray = new THREE.Raycaster();

function moveAgent(world, b, dx, dz) {
  const c = world.colliders;
  let nx = b.x + dx;
  for (let i = 0; i < c.length; i++) {
    const col = c[i];
    if (col.top < 0.2) continue;
    if (nx + RADIUS > col.minX && nx - RADIUS < col.maxX && b.z + RADIUS > col.minZ && b.z - RADIUS < col.maxZ) {
      nx = dx > 0 ? col.minX - RADIUS : col.maxX + RADIUS;
    }
  }
  b.x = Math.max(world.bounds.minX + RADIUS, Math.min(world.bounds.maxX - RADIUS, nx));
  let nz = b.z + dz;
  for (let i = 0; i < c.length; i++) {
    const col = c[i];
    if (col.top < 0.2) continue;
    if (b.x + RADIUS > col.minX && b.x - RADIUS < col.maxX && nz + RADIUS > col.minZ && nz - RADIUS < col.maxZ) {
      nz = dz > 0 ? col.minZ - RADIUS : col.maxZ + RADIUS;
    }
  }
  b.z = Math.max(world.bounds.minZ + RADIUS, Math.min(world.bounds.maxZ - RADIUS, nz));
}

function buildBotMesh(scene, team, color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const teamMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x22252a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), bodyMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.34), teamMat);
  vest.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), darkMat);
  head.position.y = 1.62;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.05), teamMat);
  visor.position.set(0, 1.64, 0.17);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.28), darkMat);
  legs.position.y = 0.31;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.7), darkMat);
  gun.position.set(0.24, 1.15, 0.3);
  group.add(torso, vest, head, visor, legs, gun);
  scene.add(group);
  return { group, torso, head };
}

export function createBots(ctx) {
  const { state, scene } = ctx;
  const bots = [];
  const mk = (team, i, weaponId) => {
    const color = team === 'vanguard' ? 0x2fa8a0 : 0xd96b2b;
    const { group, torso, head } = buildBotMesh(scene, team, color);
    const w = WEAPONS[weaponId];
    const b = {
      name: NAMES[team][i],
      team, x: 0, z: 0, yaw: 0, pitch: 0,
      vx: 0, vz: 0, hp: MATCH.playerHp, alive: true,
      weaponId, mag: w.mag, reserve: w.reserve,
      reloading: 0, fireCooldown: 0, bloom: 0, recoilPitch: 0,
      crouched: false, carrier: false,
      role: 'lane', route: [], routeIdx: 0, holdId: null,
      target: null, lastSeen: null, lastSeenT: 99, reactT: 0,
      perceiveT: Math.random() * 0.1,
      strafeDir: 1, strafeT: 0, burstLeft: 0, burstPause: 0,
      plantT: 0, defuseT: 0, investigate: null,
      flashT: 0, deathT: 0,
      mesh: group, hitBody: torso, hitHead: head,
    };
    torso.userData = { fighter: b, part: 'body' };
    head.userData = { fighter: b, part: 'head' };
    bots.push(b);
    return b;
  };
  for (let i = 0; i < 4; i++) mk('vanguard', i, i === 0 ? 'longshot' : i === 1 ? 'hornet' : 'longshot');
  for (let i = 0; i < 5; i++) mk('jackals', i, i === 0 ? 'deadeye' : i === 1 ? 'hornet' : 'longshot');
  state.bots = bots;
  return bots;
}

export function resetBots(ctx, siteChoice) {
  const { state, world } = ctx;
  state.bots.forEach((b, i) => {
    const spawns = world.spawns[b.team];
    const s = spawns[i % spawns.length];
    b.x = s[0] + (state.rng() - 0.5); b.z = s[1] + (state.rng() - 0.5);
    b.yaw = b.team === 'vanguard' ? -Math.PI / 2 : Math.PI / 2;
    b.hp = MATCH.playerHp; b.alive = true;
    const w = WEAPONS[b.weaponId];
    b.mag = w.mag; b.reserve = w.reserve;
    b.reloading = 0; b.fireCooldown = 0; b.bloom = 0;
    b.carrier = false; // the player carries the charge at round start
    b.route = []; b.routeIdx = 0; b.holdId = null;
    b.target = null; b.lastSeen = null; b.lastSeenT = 99;
    b.investigate = null; b.plantT = 0; b.defuseT = 0;
    b.mesh.visible = true; b.hitHead.visible = true; b.hitBody.visible = true;
    if (b.mesh) { b.mesh.position.set(b.x, 0, b.z); b.mesh.rotation.y = b.yaw; }
    // Roles for this round.
    if (b.team === 'vanguard') {
      const idx = state.bots.filter(x => x.team === 'vanguard').indexOf(b);
      b.role = idx === 1 ? 'lure' : idx === 2 ? 'mid' : 'follow';
      b.site = siteChoice;
    } else {
      const idx = state.bots.filter(x => x.team === 'jackals').indexOf(b);
      b.role = idx < 2 ? 'holdA' : idx < 4 ? 'holdB' : 'holdMid';
    }
  });
}

// Where this bot wants to go right now, as a waypoint id.
function goalFor(b, state) {
  if (b.team === 'vanguard') {
    if (state.bomb.state === 'planted') return b.site === 'A' ? 'aSite' : 'bSite'; // defend the plant
    if (b.role === 'follow') return b.site === 'A' ? 'aSite' : 'bSite';
    if (b.role === 'lure') return b.site === 'A' ? 'bSite' : 'aSite';
    // Mid player: takes mid control all the way to the east end of the lane
    // (mE2), where the mid duel with the defenders' jMid holder happens.
    // Late in the round, if the charge is still not planted, the mid player
    // executes on the called site instead of holding mid forever — otherwise
    // an idle endgame (both sides holding behind the dividers) just waits
    // out the timer.
    if (state.roundTimeLeft < 30) return b.site === 'A' ? 'aSite' : 'bSite';
    return 'mE2';
  }
  if (state.bomb.state === 'planted') return state.bomb.site === 'A' ? 'aSite' : 'bSite';
  if (b.role === 'holdA') return 'jA';
  if (b.role === 'holdB') return 'jB';
  return 'jMid';
}

function canSee(ctx, b, enemy) {
  const { state, world } = ctx;
  const dx = enemy.x - b.x, dz = enemy.z - b.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 46) return false;
  // Field of view: 110 degrees around the bot's facing.
  const ang = Math.atan2(dx, dz);
  let diff = ang - b.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > 1.0 && dist > 4) return false;
  // Smoke blocks sight.
  const eyeY = EYE, tgtY = enemy === state.player ? 1.5 : 1.4;
  if (ctx.effects.smokeBlocks(b.x, eyeY, b.z, enemy.x, tgtY, enemy.z)) return false;
  // Occluders block sight.
  _v.set(b.x, eyeY, b.z);
  _d.set(dx, tgtY - eyeY, dz).normalize();
  _ray.set(_v, _d);
  _ray.far = dist;
  return _ray.intersectObjects(world.occluders, false).length === 0;
}

function perceive(ctx, b, dt) {
  const { state } = ctx;
  b.perceiveT -= dt;
  if (b.perceiveT > 0) return;
  b.perceiveT = PERCEIVE_EVERY;
  // Hear the latest gunfire first: it pulls bots toward the noise.
  const noise = state.noiseEvents[state.noiseEvents.length - 1];
  if (noise && Math.hypot(noise.x - b.x, noise.z - b.z) < noise.radius) {
    b.investigate = { x: noise.x, z: noise.z, t: 0 };
  }
  let best = null, bestD = Infinity;
  const enemies = [state.player, ...state.bots].filter(e => e && e.alive && e.team !== b.team);
  for (const e of enemies) {
    const d = Math.hypot(e.x - b.x, e.z - b.z);
    if (d < bestD && canSee(ctx, b, e)) { best = e; bestD = d; }
  }
  if (best) {
    if (b.target !== best) {
      b.target = best;
      b.reactT = 0.25 + state.rng() * 0.25; // reaction time before firing
      b.lastSeen = { x: best.x, z: best.z };
    }
    b.lastSeen = { x: best.x, z: best.z };
    b.lastSeenT = 0;
  } else if (b.target) {
    b.lastSeenT += PERCEIVE_EVERY;
    if (b.lastSeenT > 2.5) {
      // Lost the enemy. Combat strafing may have carried the bot off its
      // route (even across the mid blocker); drop the stale route so the
      // next step re-plans from the nearest waypoint instead of walking
      // into a wall it cannot cross.
      b.target = null;
      b.route = [];
    }
  }
}

function aimAt(b, tx, tz, ty, err) {
  const dx = tx - b.x, dz = tz - b.z;
  b.yaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * err;
  const dist = Math.hypot(dx, dz);
  b.pitch = Math.atan2(ty - EYE, dist) + (Math.random() - 0.5) * err * 0.6;
}

function botFire(ctx, b, dt) {
  const { state } = ctx;
  const w = WEAPONS[b.weaponId];
  if (b.burstPause > 0) { b.burstPause -= dt; return; }
  if (b.burstLeft <= 0) {
    b.burstLeft = w.auto ? 3 + Math.floor(state.rng() * 3) : 1;
    b.burstPause = 0.12 + state.rng() * 0.25;
    return;
  }
  const target = b.target;
  if (!target || !target.alive) return;
  const dist = Math.hypot(target.x - b.x, target.z - b.z);
  // Aim error grows with distance and with the target's speed; crouching targets
  // are harder to hit. This is why stopping to aim beats spraying on the move.
  const tSpeed = target === state.player ? Math.hypot(target.vx, target.vz) : 3;
  const err = 0.012 + dist * 0.0011 + tSpeed * 0.002 + (target.crouched ? 0.008 : 0);
  const aimY = 1.35;
  aimAt(b, target.x, target.z, aimY, err);
  const shot = tryFire(b, w, dt);
  if (shot && !shot.dry) {
    _v.set(b.x, EYE, b.z);
    _d.set(Math.sin(b.yaw) * Math.cos(b.pitch), Math.sin(b.pitch), Math.cos(b.yaw) * Math.cos(b.pitch));
    // Spread: the shot wanders off the aim point.
    const sp = currentSpread(b, w, true);
    _d.x += (Math.random() - 0.5) * sp * 2;
    _d.y += (Math.random() - 0.5) * sp * 2;
    _d.z += (Math.random() - 0.5) * sp * 2;
    _d.normalize();
    resolveShot(ctx, b, _v, _d, w);
    ctx.audio.play(w.sound, false, b);
    ctx.effects.spawnMuzzle({ x: b.x + Math.sin(b.yaw) * 0.6, y: 1.4, z: b.z + Math.cos(b.yaw) * 0.6 });
    state.noiseEvents.push({ x: b.x, z: b.z, radius: 26, t: 0 });
    b.burstLeft -= 1;
  } else if (shot && shot.dry) {
    startReloadBot(b);
  }
}

function startReloadBot(b) {
  const w = WEAPONS[b.weaponId];
  if (b.reloading > 0 || b.mag >= w.mag || b.reserve <= 0) return;
  b.reloading = w.reload;
}

export function stepBots(ctx, dt) {
  const { state, world } = ctx;
  for (const b of state.bots) {
    if (!b.alive) { b.deathT += dt; continue; }
    if (b.reloading > 0) {
      b.reloading -= dt;
      if (b.reloading <= 0) {
        const w = WEAPONS[b.weaponId];
        const take = Math.min(w.mag - b.mag, b.reserve);
        b.mag += take; b.reserve -= take; b.reloading = 0;
      }
    }
    if (b.fireCooldown > 0) b.fireCooldown -= dt;
    b.bloom = Math.max(0, b.bloom - 0.02 * dt);
    b.recoilPitch *= Math.max(0, 1 - 6 * dt);
    if (b.flashT > 0) b.flashT -= dt;

    perceive(ctx, b, dt);

    // --- objective: pick up a dropped charge, plant, defuse ---------------------
    if (b.team === 'vanguard' && state.bomb.state === 'dropped') {
      if (Math.hypot(b.x - state.bomb.x, b.z - state.bomb.z) < 1.4) {
        b.carrier = true;
        state.bomb.state = 'carried';
        state.bomb.carrier = 'bot';
      }
    }
    if (b.carrier && state.bomb.state === 'carried') {
      const site = world.sites[b.site];
      if (Math.hypot(b.x - site.x, b.z - site.z) < site.r) {
        const near = [state.player, ...state.bots].some(e => e.alive && e.team === 'jackals' && Math.hypot(e.x - b.x, e.z - b.z) < 9);
        if (!near) {
          b.plantT += dt;
          if (b.plantT >= MATCH.plantTime) {
            state.bomb.state = 'planted';
            state.bomb.site = b.site;
            state.bomb.x = site.x; state.bomb.z = site.z;
            state.bomb.timer = MATCH.bombTimer;
            state.plants += 1;
            state.money += ECONOMY.plant;
            ctx.hud.announce('CHARGE PLANTED', `Site ${b.site} — ${b.site === 'A' ? 'REFINERY' : 'SILO'} — defend it`);
            ctx.audio.play('plant');
            b.carrier = false;
          }
          // Stand still and plant; no movement this step.
          syncMesh(b);
          continue;
        }
      }
      b.plantT = Math.max(0, b.plantT - dt);
    }
    if (b.team === 'jackals' && state.bomb.state === 'planted') {
      if (Math.hypot(b.x - state.bomb.x, b.z - state.bomb.z) < 1.6) {
        const near = [state.player, ...state.bots].some(e => e.alive && e.team === 'vanguard' && Math.hypot(e.x - b.x, e.z - b.z) < 9);
        if (!near) {
          b.defuseT += dt;
          if (b.defuseT >= MATCH.defuseTime) {
            state.bomb.state = 'defused';
            state.defuses += 1;
            endRound(ctx, 'jackals', 'CHARGE DEFUSED');
            syncMesh(b);
            continue;
          }
          syncMesh(b);
          continue;
        }
      }
      b.defuseT = Math.max(0, b.defuseT - dt);
    }

    // --- combat: face and fire at the target ----------------------------------
    if (b.target && b.target.alive && b.reactT <= 0) {
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafeDir *= -1; b.strafeT = 0.7 + state.rng() * 0.9; }
      const tx = b.target.x, tz = b.target.z;
      const dx = tx - b.x, dz = tz - b.z;
      const dist = Math.hypot(dx, dz);
      // Hold range: close in when far, strafe when in range.
      let mx = 0, mz = 0;
      if (dist > 14) { mx = dx / dist; mz = dz / dist; }
      else { mx = (-dz / dist) * b.strafeDir * 0.6; mz = (dx / dist) * b.strafeDir * 0.6; }
      moveAgent(world, b, mx * BOT_SPEED * dt, mz * BOT_SPEED * dt);
      botFire(ctx, b, dt);
      syncMesh(b);
      continue;
    }
    if (b.reactT > 0) b.reactT -= dt;

    // --- route: follow the waypoint path to the current goal ------------------
    const goal = goalFor(b, state);
    if (!b.route.length || b.route[b.route.length - 1] !== goal) {
      const from = nearestWaypoint(world.waypoints, b.x, b.z);
      b.route = findRoute(world.adj, from, goal);
      b.routeIdx = 0;
    }
    const wpId = b.route[Math.min(b.routeIdx, b.route.length - 1)];
    const wpPos = world.waypoints[wpId];
    const dx = wpPos[0] - b.x, dz = wpPos[1] - b.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.2) {
      if (b.routeIdx < b.route.length - 1) b.routeIdx += 1;
      else {
        // Holding: look toward the enemy side.
        b.yaw += (Math.atan2((b.team === 'vanguard' ? 20 : -20) - b.x, 0 - b.z) - b.yaw) * 0.05;
      }
    } else {
      const mx = dx / dist, mz = dz / dist;
      moveAgent(world, b, mx * BOT_SPEED * dt, mz * BOT_SPEED * dt);
      b.yaw = Math.atan2(dx, dz);
    }
    syncMesh(b);
  }
}

function syncMesh(b) {
  if (!b.mesh) return;
  b.mesh.position.set(b.x, 0, b.z);
  b.mesh.rotation.y = b.yaw;
  // Hit flash: the body material reddens briefly after taking damage.
  if (b.flashT > 0 && b.hitBody) {
    b.hitBody.material.color.setHex(0xff5a4a);
  } else if (b.hitBody) {
    b.hitBody.material.color.setHex(0x3a3f46);
  }
}
