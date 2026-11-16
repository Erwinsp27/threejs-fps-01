// combat.js — shooting, grenades, damage and seeing.
// Pure geometry and game rules: no three.js, no DOM. A shot is a ray from
// the shooter's eye against agent bodies, world boxes and smoke clouds.

import { weaponDef, damageAt, GRENADES } from './weapons.js';
import { segmentBlocked, rayBox, pointInSite } from './world.js';
import { emit, playerOf } from './state.js';

export const EYE_HEIGHT = 1.62;
export const CROUCH_EYE = 1.15;
export const AGENT_RADIUS = 0.35;
export const AGENT_HEIGHT = 1.75;
export const HEAD_HEIGHT = 0.32; // top slice of the body box counts as head

function eyeOf(a) {
  return { x: a.pos.x, y: a.pos.y + (a.crouch ? CROUCH_EYE : EYE_HEIGHT), z: a.pos.z };
}

// Ray vs one agent's body box. Returns {dist, head} or null.
export function rayVsAgent(ox, oy, oz, dx, dy, dz, maxDist, a) {
  const hw = AGENT_RADIUS;
  const h = a.crouch ? 1.25 : AGENT_HEIGHT;
  // Body box.
  const body = { x0: a.pos.x - hw, x1: a.pos.x + hw, z0: a.pos.z - hw, z1: a.pos.z + hw, h };
  const t = rayBox(ox, oy, oz, dx, dy, dz, body);
  if (t === Infinity || t > maxDist) return null;
  const hitY = oy + dy * t;
  const headTop = a.pos.y + h;
  const head = hitY > headTop - HEAD_HEIGHT;
  return { dist: t, head };
}

// Nearest world-box hit along a ray, or Infinity.
export function rayVsWorld(ox, oy, oz, dx, dy, dz, maxDist, blockers) {
  let best = Infinity;
  for (const c of blockers) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, c);
    if (t < best) best = t;
  }
  return Math.min(best, maxDist);
}

// Does the segment pass through any smoke cloud?
export function segmentThroughSmoke(ax, ay, az, bx, by, bz, smokes) {
  for (const s of smokes) {
    // Closest point on the segment to the sphere centre.
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    let t = 0;
    if (len2 > 0) {
      t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    const cx = ax + dx * t - s.x;
    const cy = ay + dy * t - s.y;
    const cz = az + dz * t - s.z;
    if (cx * cx + cy * cy + cz * cz < s.r * s.r) return true;
  }
  return false;
}

// Can `seer` see `target`? Distance, 110-degree field of view, a clear
// line of sight, and no smoke in between.
export function canSee(S, seer, target, blockers) {
  const dx = target.pos.x - seer.pos.x;
  const dz = target.pos.z - seer.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 48) return false;
  // FOV check in the horizontal plane.
  const fx = -Math.sin(seer.yaw);
  const fz = -Math.cos(seer.yaw);
  const dot = (dx * fx + dz * fz) / (dist || 1);
  if (dot < Math.cos((110 * Math.PI) / 360)) return false;
  const eye = eyeOf(seer);
  const tEye = { x: target.pos.x, y: target.pos.y + 1.2, z: target.pos.z };
  if (segmentBlocked(eye.x, eye.y, eye.z, tEye.x, tEye.y, tEye.z, blockers)) return false;
  if (segmentThroughSmoke(eye.x, eye.y, eye.z, tEye.x, tEye.y, tEye.z, S.smokes)) return false;
  return true;
}

// Fire one trigger pull of the agent's current weapon.
export function shoot(S, shooter, blockers) {
  const def = weaponDef(shooter.weapon);
  if (shooter.reloading || shooter.fireCd > 0) return false;
  if (shooter.mag <= 0) {
    startReload(S, shooter);
    emit(S, 'dry', { agent: shooter.id });
    return false;
  }
  shooter.fireCd = 60 / def.rpm; // seconds between shots
  shooter.mag--;
  shooter.bloom = Math.min(0.09, shooter.bloom + def.bloomPerShot);
  shooter.recoil = Math.min(0.09, shooter.recoil + def.recoil);
  S.shotCount++;

  const eye = eyeOf(shooter);
  const speed = Math.hypot(shooter.vel.x, shooter.vel.z);
  const spreadBase = shooter.crouch && speed < 0.5 ? def.crouchSpread : def.spread;
  const spread = spreadBase + def.moveSpread * Math.min(1, speed / 5) + shooter.bloom;
  const pellets = def.pellets || 1;

  // Gunfire is noise: bots nearby hear it and come looking.
  emit(S, 'shot', {
    agent: shooter.id,
    x: eye.x, y: eye.y, z: eye.z,
    yaw: shooter.yaw, pitch: shooter.pitch,
    weapon: shooter.weapon,
    tracer: def.tracer,
  });
  emit(S, 'noise', { x: shooter.pos.x, z: shooter.pos.z, radius: 26 });

  for (let p = 0; p < pellets; p++) {
    // Random cone offset around the aim direction.
    const a = Math.random() * Math.PI * 2;
    const r = spread * Math.sqrt(Math.random());
    const yaw = shooter.yaw + Math.cos(a) * r;
    const pitch = shooter.pitch + Math.sin(a) * r;
    const dx = -Math.sin(yaw) * Math.cos(pitch);
    const dy = Math.sin(pitch);
    const dz = -Math.cos(yaw) * Math.cos(pitch);
    const maxDist = def.range * 2;
    const wallT = rayVsWorld(eye.x, eye.y, eye.z, dx, dy, dz, maxDist, blockers);
    let best = null;
    let bestAgent = null;
    for (const a of S.agents) {
      // No friendly fire: shots pass through teammates.
      if (!a.alive || a.id === shooter.id || a.team === shooter.team) continue;
      const hit = rayVsAgent(eye.x, eye.y, eye.z, dx, dy, dz, maxDist, a);
      if (hit && (!best || hit.dist < best.dist)) {
        best = hit;
        bestAgent = a;
      }
    }
    let endT = wallT;
    let endX = eye.x + dx * endT;
    let endY = eye.y + dy * endT;
    let endZ = eye.z + dz * endT;
    if (best && best.dist < wallT) {
      // Smoke eats the bullet: the shot stops at the cloud's edge.
      const hitX = eye.x + dx * best.dist;
      const hitY = eye.y + dy * best.dist;
      const hitZ = eye.z + dz * best.dist;
      if (segmentThroughSmoke(eye.x, eye.y, eye.z, hitX, hitY, hitZ, S.smokes)) {
        endT = best.dist * 0.6;
        endX = eye.x + dx * endT;
        endY = eye.y + dy * endT;
        endZ = eye.z + dz * endT;
        emit(S, 'impact', { x: endX, y: endY, z: endZ });
      } else {
        const dmg = damageAt(def, best.dist, best.head);
        endT = best.dist;
        endX = hitX;
        endY = hitY;
        endZ = hitZ;
        applyDamage(S, bestAgent, dmg, shooter, best.head);
        emit(S, 'hit', { agent: shooter.id, target: bestAgent.id, head: best.head, x: hitX, y: hitY, z: hitZ });
      }
    } else {
      emit(S, 'impact', { x: endX, y: endY, z: endZ });
    }
    emit(S, 'tracer', {
      x0: eye.x, y0: eye.y, z0: eye.z,
      x1: endX, y1: endY, z1: endZ,
      color: def.tracer,
    });
  }
  return true;
}

export function startReload(S, agent) {
  const def = weaponDef(agent.weapon);
  if (agent.reloading || agent.mag >= def.mag || agent.reserve <= 0) return;
  agent.reloading = true;
  agent.reloadT = def.reload;
  emit(S, 'reload', { agent: agent.id });
}

export function updateReloads(S, dt) {
  for (const a of S.agents) {
    if (!a.reloading) continue;
    a.reloadT -= dt;
    if (a.reloadT <= 0) {
      const def = weaponDef(a.weapon);
      const need = def.mag - a.mag;
      const take = Math.min(need, a.reserve);
      a.mag += take;
      a.reserve -= take;
      a.reloading = false;
    }
  }
}

export function applyDamage(S, target, dmg, attacker, head) {
  if (!target.alive) return;
  target.hp -= dmg;
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.deaths++;
    target.planting = false;
    target.defusing = false;
    if (attacker) {
      attacker.kills++;
      attacker.money += 300;
      emit(S, 'kill', {
        killer: attacker.id, victim: target.id, head: !!head,
        killerName: attacker.name, victimName: target.name,
      });
    }
    emit(S, 'death', { agent: target.id, x: target.pos.x, z: target.pos.z });
    // The bomb drops where its carrier falls.
    if (target.hasBomb) {
      target.hasBomb = false;
      S.bomb.state = 'dropped';
      S.bomb.carrier = -1;
      S.bomb.pos = { x: target.pos.x, z: target.pos.z };
      emit(S, 'bombDrop', { x: target.pos.x, z: target.pos.z });
    }
  }
}

// Throw the selected grenade from the agent's hand.
export function throwGrenade(S, agent, kind) {
  if (agent.grenades[kind] <= 0) return false;
  const g = GRENADES[kind];
  agent.grenades[kind]--;
  const eye = eyeOf(agent);
  const speed = 15;
  const dx = -Math.sin(agent.yaw) * Math.cos(agent.pitch);
  const dy = Math.sin(agent.pitch);
  const dz = -Math.cos(agent.yaw) * Math.cos(agent.pitch);
  S.projectiles.push({
    kind,
    x: eye.x, y: eye.y - 0.15, z: eye.z,
    vx: dx * speed, vy: dy * speed + 3.5, vz: dz * speed,
    fuse: g.fuse,
    bounced: false,
    owner: agent.id,
  });
  emit(S, 'throw', { agent: agent.id, kind });
  return true;
}

export function updateProjectiles(S, dt, blockers) {
  const g = 12; // grenade gravity, tuned for a satisfying arc
  for (let i = S.projectiles.length - 1; i >= 0; i--) {
    const p = S.projectiles[i];
    p.vy -= g * dt;
    let nx = p.x + p.vx * dt;
    let ny = p.y + p.vy * dt;
    let nz = p.z + p.vz * dt;
    // Bounce off the ground and walls, losing energy each time.
    if (ny < 0.1) {
      ny = 0.1;
      p.vy = Math.abs(p.vy) * 0.35;
      p.vx *= 0.6;
      p.vz *= 0.6;
      p.bounced = true;
    }
    for (const c of blockers) {
      if (nx > c.x0 - 0.1 && nx < c.x1 + 0.1 && nz > c.z0 - 0.1 && nz < c.z1 + 0.1 && ny < c.h) {
        // Step back and reflect the dominant axis.
        if (Math.abs(p.vx) > Math.abs(p.vz)) p.vx *= -0.4;
        else p.vz *= -0.4;
        nx = p.x;
        nz = p.z;
        p.bounced = true;
      }
    }
    p.x = nx;
    p.y = ny;
    p.z = nz;
    if (p.bounced) p.fuse -= dt;
    if (p.fuse <= 0) {
      S.projectiles.splice(i, 1);
      if (p.kind === 'smoke') {
        S.smokes.push({ x: p.x, y: 1.1, z: p.z, r: GRENADES.smoke.radius, ttl: GRENADES.smoke.ttl });
        emit(S, 'smoke', { x: p.x, z: p.z });
      } else {
        explodeFrag(S, p.x, p.y, p.z, blockers, p.owner);
      }
    }
  }
}

export function explodeFrag(S, x, y, z, blockers, ownerId) {
  const g = GRENADES.frag;
  const owner = ownerId !== undefined ? S.agents[ownerId] : null;
  emit(S, 'explode', { x, y, z });
  for (const a of S.agents) {
    if (!a.alive) continue;
    // No friendly fire from blasts either.
    if (owner && a.team === owner.team) continue;
    const dx = a.pos.x - x;
    const dy = a.pos.y + 0.9 - y;
    const dz = a.pos.z - z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > g.radius) continue;
    // Walls shield the blast.
    if (segmentBlocked(x, y, z, a.pos.x, a.pos.y + 0.9, a.pos.z, blockers)) continue;
    const t = dist / g.radius;
    const dmg = g.damage * (1 - t) + g.minDamage * t;
    applyDamage(S, a, dmg, owner, false);
  }
}

export function updateSmokes(S, dt) {
  for (let i = S.smokes.length - 1; i >= 0; i--) {
    S.smokes[i].ttl -= dt;
    if (S.smokes[i].ttl <= 0) S.smokes.splice(i, 1);
  }
}

// Bomb pickup: a Vanguard agent standing on a dropped bomb takes it.
export function updateBombPickup(S) {
  if (S.bomb.state !== 'dropped' || !S.bomb.pos) return;
  for (const a of S.agents) {
    if (a.team !== 'V' || !a.alive) continue;
    const dx = a.pos.x - S.bomb.pos.x;
    const dz = a.pos.z - S.bomb.pos.z;
    if (dx * dx + dz * dz < 1.5 * 1.5) {
      a.hasBomb = true;
      S.bomb.state = 'carried';
      S.bomb.carrier = a.id;
      S.bomb.pos = null;
      emit(S, 'bombPickup', { agent: a.id });
      return;
    }
  }
}

// Plant / defuse progress. Called with the agent that is holding the key.
export function updateObjective(S, agent, dt) {
  const b = S.bomb;
  if (agent.hasBomb && b.state === 'carried' && S.phase === 'live') {
    const site = pointInSite('A', agent.pos.x, agent.pos.z)
      ? 'A'
      : pointInSite('B', agent.pos.x, agent.pos.z)
        ? 'B'
        : null;
    if (site && agent.planting) {
      agent.plantT += dt;
      if (agent.plantT >= 3.5) {
        b.state = 'planted';
        b.site = site;
        b.pos = { x: agent.pos.x, z: agent.pos.z };
        b.timer = 35;
        b.beepT = 0;
        agent.hasBomb = false;
        agent.planting = false;
        agent.plantT = 0;
        emit(S, 'planted', { site, agent: agent.id });
      }
    } else {
      agent.plantT = 0;
    }
  }
  if (b.state === 'planted' && agent.team === 'J' && agent.defusing && S.phase === 'live') {
    const dx = agent.pos.x - b.pos.x;
    const dz = agent.pos.z - b.pos.z;
    if (dx * dx + dz * dz < 2.2 * 2.2) {
      agent.defuseT += dt;
      if (agent.defuseT >= 5) {
        b.state = 'defused';
        agent.defusing = false;
        agent.defuseT = 0;
        emit(S, 'defused', { agent: agent.id });
      }
    } else {
      agent.defuseT = 0;
    }
  }
}
