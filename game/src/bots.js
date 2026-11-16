// bots.js — the nine bots. Attackers push lanes on waypoints, plant the
// bomb and guard it; defenders hold sites, rotate on the plant and defuse.
// They see with a 110-degree field of view and a line-of-sight raycast,
// hear gunfire, and fight in bursts with a reaction delay — never with
// perfect aim, so a careful player wins duels.

import { WAYPOINTS, SITES, nearestNode, findPath, pointInSite, collideMove } from './world.js';
import { canSee, shoot, startReload, updateObjective } from './combat.js';

const BOT_SPEED = 4.2;
const BOT_STRAFE_SPEED = 2.2;
const THINK_INTERVAL = 0.25;

// Called once per round: lanes, sites and shopping.
export function assignRoles(S) {
  const lanes = ['a', 'mid', 'b', 'a', 'mid'];
  const attackers = S.agents.filter((a) => a.team === 'V' && a.bot);
  attackers.forEach((a, i) => {
    a.lane = lanes[i % lanes.length];
    a.site = a.lane === 'b' ? 'B' : 'A';
    a.role = 'push';
    a.holdNode = -1;
    a.path = [];
    a.pathIdx = 0;
  });
  const defenders = S.agents.filter((a) => a.team === 'J' && a.bot);
  // Two hold A, two hold B, one floats mid.
  const defSpots = [
    { site: 'A', node: 17 },
    { site: 'A', node: 19 },
    { site: 'B', node: 18 },
    { site: 'B', node: 20 },
    { site: null, node: 16 },
  ];
  defenders.forEach((a, i) => {
    const spot = defSpots[i % defSpots.length];
    a.site = spot.site;
    a.holdNode = spot.node;
    a.role = 'hold';
    a.lane = spot.site === 'B' ? 'b' : spot.site === 'A' ? 'a' : 'mid';
    a.path = [];
    a.pathIdx = 0;
  });
  // Bots spend their money: a rifle when they can afford it, sometimes a
  // smoke for the push.
  for (const a of S.agents) {
    if (!a.bot) continue;
    if (!a.primary && a.money >= 2700) {
      a.money -= 2700;
      a.primary = 'rifle';
      a.weapon = 'rifle';
      a.mag = 30;
      a.reserve = 90;
    }
    if (a.team === 'V' && a.money >= 400 && Math.random() < 0.4) {
      a.money -= 400;
      a.grenades.smoke = 1;
    }
  }
}

function siteNode(site) {
  return site === 'A' ? 21 : 22;
}

function setPathTo(S, bot, nodeIdx) {
  const from = nearestNode(bot.pos.x, bot.pos.z);
  const path = findPath(from, nodeIdx);
  if (path.length > 1) {
    bot.path = path.slice(1);
    bot.pathIdx = 0;
  } else {
    bot.path = [];
    bot.pathIdx = 0;
  }
}

function visibleEnemy(S, bot, blockers) {
  let best = null;
  let bestD = Infinity;
  for (const a of S.agents) {
    if (!a.alive || a.team === bot.team) continue;
    if (!canSee(S, bot, a, blockers)) continue;
    const d = Math.hypot(a.pos.x - bot.pos.x, a.pos.z - bot.pos.z);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best ? { enemy: best, dist: bestD } : null;
}

function decide(S, bot, blockers) {
  const seen = visibleEnemy(S, bot, blockers);
  if (seen) {
    if (bot.targetId !== seen.enemy.id) {
      bot.targetId = seen.enemy.id;
      // Reaction time: nearer enemies get answered faster, skilled bots
      // faster still. The player always gets a fair split-second.
      bot.reactionT = 0.3 + seen.dist * 0.004 - bot.skill * 0.12;
      bot.lastSeen = { x: seen.enemy.pos.x, z: seen.enemy.pos.z };
    }
    bot.planting = false;
    bot.defusing = false;
  } else {
    bot.targetId = -1;
  }

  if (!seen) {
    if (bot.team === 'V') {
      const b = S.bomb;
      if (b.state === 'planted') {
        // Bomb is down: guard it from a hold spot near the site.
        bot.role = 'guard';
        if (bot.holdNode !== siteNode(b.site) && bot.path.length === 0) {
          setPathTo(S, bot, siteNode(b.site));
        }
      } else if (bot.hasBomb) {
        bot.role = 'push';
        const node = siteNode(bot.site);
        const inSite = pointInSite(bot.site, bot.pos.x, bot.pos.z);
        if (inSite) {
          bot.role = 'plant';
          bot.path = [];
        } else if (bot.path.length === 0) {
          setPathTo(S, bot, node);
        }
      } else if (b.state === 'dropped' && b.pos) {
        // Go fetch the dropped bomb.
        bot.role = 'push';
        if (bot.path.length === 0) setPathTo(S, bot, nearestNode(b.pos.x, b.pos.z));
      } else {
        // Follow the carrier's lane to its site.
        bot.role = 'push';
        const carrier = S.agents[b.carrier];
        const targetSite = carrier && carrier.alive ? carrier.site || bot.site : bot.site;
        if (bot.path.length === 0) setPathTo(S, bot, siteNode(targetSite));
      }
    } else {
      const b = S.bomb;
      if (b.state === 'planted') {
        // Rotate to the planted site, then defuse when it is clear.
        bot.role = 'rotate';
        if (bot.path.length === 0) setPathTo(S, bot, siteNode(b.site));
        if (pointInSite(b.site, bot.pos.x, bot.pos.z) && !seen) {
          bot.role = 'defuse';
          bot.path = [];
        }
      } else if (bot.heard) {
        // Investigate the gunfire once, then go back to holding.
        bot.role = 'push';
        if (bot.path.length === 0) {
          setPathTo(S, bot, nearestNode(bot.heard.x, bot.heard.z));
        }
        const dx = bot.pos.x - bot.heard.x;
        const dz = bot.pos.z - bot.heard.z;
        if (dx * dx + dz * dz < 4 || bot.path.length === 0) {
          bot.heard = null;
          bot.role = 'hold';
          setPathTo(S, bot, bot.holdNode);
        }
      } else if (bot.role !== 'hold' || bot.path.length === 0) {
        if (bot.role !== 'hold') {
          bot.role = 'hold';
          setPathTo(S, bot, bot.holdNode);
        }
      }
    }
  }
}

// Aim the bot's yaw/pitch at a point, with an error that shrinks the
// longer the bot has had the target in its sights.
function aimAt(bot, tx, ty, tz, dist, dt) {
  const dx = tx - bot.pos.x;
  const dy = ty - (bot.pos.y + 1.5);
  const dz = tz - bot.pos.z;
  const wantYaw = Math.atan2(-dx, -dz);
  const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
  // Aim error: wide on first sight, tightening as the bot tracks.
  const err = (0.05 + dist * 0.0012) * (2 - bot.skill) * 0.5;
  const ey = (Math.random() - 0.5) * err * 2;
  const ep = (Math.random() - 0.5) * err;
  let dyaw = wantYaw + ey - bot.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  const turn = 6 * dt; // radians per second the bot can turn
  bot.yaw += Math.max(-turn, Math.min(turn, dyaw));
  bot.pitch += Math.max(-turn, Math.min(turn, wantPitch + ep - bot.pitch));
}

function moveAlongPath(S, bot, dt, blockers) {
  if (bot.path.length === 0 || bot.pathIdx >= bot.path.length) {
    bot.vel.x = 0;
    bot.vel.z = 0;
    return false;
  }
  const node = WAYPOINTS[bot.path[bot.pathIdx]];
  const dx = node.x - bot.pos.x;
  const dz = node.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.9) {
    bot.pathIdx++;
    return moveAlongPath(S, bot, dt, blockers);
  }
  const vx = (dx / dist) * BOT_SPEED;
  const vz = (dz / dist) * BOT_SPEED;
  bot.vel.x = vx;
  bot.vel.z = vz;
  bot.moving = true;
  // Face where you walk.
  const wantYaw = Math.atan2(-dx, -dz);
  let dyaw = wantYaw - bot.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  bot.yaw += Math.max(-5 * dt, Math.min(5 * dt, dyaw));
  collideMove(bot.pos, 0.35, vx * dt, vz * dt, blockers);
  return true;
}

export function updateBots(S, dt, blockers) {
  for (const bot of S.agents) {
    if (!bot.bot || !bot.alive) continue;
    if (bot.fireCd > 0) bot.fireCd -= dt;
    if (bot.burstPause > 0) bot.burstPause -= dt;
    if (bot.reactionT > 0) bot.reactionT -= dt;
    bot.thinkT -= dt;
    if (bot.thinkT <= 0) {
      bot.thinkT = THINK_INTERVAL + Math.random() * 0.1;
      decide(S, bot, blockers);
    }

    const target = bot.targetId >= 0 ? S.agents[bot.targetId] : null;
    const targetAlive = target && target.alive;
    if (!targetAlive) bot.targetId = -1;

    // --- fighting ---
    if (targetAlive) {
      const dist = Math.hypot(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z);
      aimAt(bot, target.pos.x, target.pos.y + 1.2, target.pos.z, dist, dt);
      // Strafe while fighting so duels move.
      bot.strafeT -= dt;
      if (bot.strafeT <= 0) {
        bot.strafeT = 0.5 + Math.random() * 0.7;
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      const sx = Math.cos(bot.yaw) * bot.strafeDir;
      const sz = -Math.sin(bot.yaw) * bot.strafeDir;
      collideMove(bot.pos, 0.35, sx * BOT_STRAFE_SPEED * dt, sz * BOT_STRAFE_SPEED * dt, blockers);
      // Fire in bursts once the reaction delay has passed — live rounds only.
      if (bot.reactionT <= 0 && bot.burstPause <= 0 && S.phase === 'live') {
        if (bot.burstLeft <= 0) bot.burstLeft = 3 + Math.floor(Math.random() * 3);
        if (bot.mag <= 0) {
          startReload(S, bot);
        } else if (!bot.reloading) {
          shoot(S, bot, blockers);
          bot.burstLeft--;
          if (bot.burstLeft <= 0) bot.burstPause = 0.4 + Math.random() * 0.5;
        }
      }
      bot.moving = true;
      continue;
    }

    // --- planting / defusing ---
    if (bot.role === 'plant' && bot.hasBomb) {
      const near = visibleEnemy(S, bot, blockers);
      if (!near) {
        bot.planting = true;
        updateObjective(S, bot, dt);
        continue;
      }
    }
    if (bot.role === 'defuse' && S.bomb.state === 'planted') {
      const near = visibleEnemy(S, bot, blockers);
      if (!near) {
        bot.defusing = true;
        updateObjective(S, bot, dt);
        continue;
      }
    }

    // --- moving / holding ---
    bot.planting = false;
    bot.defusing = false;
    const moved = moveAlongPath(S, bot, dt, blockers);
    if (!moved) {
      bot.moving = false;
      bot.vel.x = 0;
      bot.vel.z = 0;
      if (bot.role === 'hold' || bot.role === 'guard') {
        // Hold an angle: watch the yard's centre, sweeping slowly.
        const baseYaw = Math.atan2(bot.pos.x, bot.pos.z);
        const sweep = Math.sin(S.time * 0.4 + bot.id * 1.7) * 0.5;
        let dyaw = baseYaw + sweep - bot.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        bot.yaw += Math.max(-1.2 * dt, Math.min(1.2 * dt, dyaw));
      }
    }
    if (bot.mag === 0 && !bot.reloading) startReload(S, bot);
  }
}

// Feed a heard gunshot to every bot in earshot.
export function hearNoise(S, x, z, radius) {
  for (const bot of S.agents) {
    if (!bot.bot || !bot.alive) continue;
    const dx = bot.pos.x - x;
    const dz = bot.pos.z - z;
    if (dx * dx + dz * dz < radius * radius) {
      bot.heard = { x, z };
    }
  }
}
