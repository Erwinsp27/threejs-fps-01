// DUSTLINE — combat: one ray per bullet, checked against bodies first, then the
// world. Headshots pay more. A kill feeds the kill feed, the economy and the score.
import * as THREE from 'three';
import { WEAPONS, ECONOMY, MATCH } from './state.js';
import { damageAt } from './weapons.js';

const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _hit = new THREE.Vector3();

// Resolve one shot fired by `shooter` (player or bot) with a spread direction.
// Returns the hit record {target, head, dist, point} or null.
export function resolveShot(ctx, shooter, origin, direction, weapon) {
  const { state, world } = ctx;
  _from.copy(origin);
  _dir.copy(direction).normalize();
  _ray.set(_from, _dir);
  _ray.far = weapon.range;

  // Targets: every living fighter on the other team, head box + body box.
  const targets = [];
  const fighters = [state.player, ...state.bots];
  for (const f of fighters) {
    if (!f || !f.alive || f === shooter || f.team === shooter.team) continue;
    if (f.hitHead) targets.push(f.hitHead);
    if (f.hitBody) targets.push(f.hitBody);
  }
  const bodyHits = targets.length ? _ray.intersectObjects(targets, false) : [];
  // World: the first occluder the ray meets.
  const worldHits = _ray.intersectObjects(world.occluders, false);
  const worldDist = worldHits.length ? worldHits[0].distance : Infinity;
  const bodyDist = bodyHits.length ? bodyHits[0].distance : Infinity;

  const end = _from.clone().addScaledVector(_dir, Math.min(weapon.range, Math.min(worldDist, bodyDist)));
  ctx.effects.spawnTracer(origin, end, weapon.tracer);

  if (bodyDist < worldDist) {
    const hit = bodyHits[0];
    const fighter = hit.object.userData.fighter;
    const head = hit.object.userData.part === 'head';
    const dist = hit.distance;
    const dmg = damageAt(weapon, dist, head);
    _hit.copy(hit.point);
    ctx.effects.spawnImpact(_hit, hit.face ? hit.face.normal : { x: 0, y: 1, z: 0 }, head ? 14 : 8);
    applyDamage(ctx, fighter, dmg, shooter, head);
    return { target: fighter, head, dist, point: _hit.clone() };
  }
  if (worldHits.length) {
    _hit.copy(worldHits[0].point);
    const n = worldHits[0].face ? worldHits[0].face.normal : { x: 0, y: 1, z: 0 };
    ctx.effects.spawnImpact(_hit, n, 6);
  }
  return null;
}

export function applyDamage(ctx, victim, dmg, attacker, head) {
  const { state } = ctx;
  if (!victim.alive) return;
  victim.hp -= dmg;
  victim.lastDamageFrom = attacker;
  victim.flashT = 0.12; // red flash on the victim's model
  if (attacker === state.player) {
    ctx.hud.hitmarker(head);
    ctx.audio.play('hit', head);
  }
  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.deathT = 0;
    const killerName = attacker === state.player ? 'YOU' : attacker.name;
    const victimName = victim === state.player ? 'YOU' : victim.name;
    state.killfeed.unshift({ text: `${killerName}  ✕  ${victimName}${head ? '  (HEADSHOT)' : ''}`, t: 0 });
    if (state.killfeed.length > 5) state.killfeed.pop();
    if (attacker === state.player) {
      state.money += ECONOMY.kill;
      state.kills += 1;
      ctx.audio.play('kill');
    }
    if (victim === state.player) {
      state.deaths += 1;
      ctx.hud.showDeath(attacker === state.player ? 'YOU' : attacker.name);
    }
    if (victim.carrier) {
      // The charge drops where the carrier fell; a teammate can pick it up.
      state.bomb.state = 'dropped';
      state.bomb.x = victim.x; state.bomb.z = victim.z;
      victim.carrier = false;
      ctx.hud.announce('CHARGE DROPPED', 'Pick it up to keep the push alive');
    }
    if (victim.mesh) victim.mesh.visible = false;
    if (victim.hitHead) victim.hitHead.visible = false;
    if (victim.hitBody) victim.hitBody.visible = false;
    checkRoundEnd(ctx);
  }
}

// A round ends when one team is wiped, the bomb detonates, it is defused, or the
// clock runs out (defenders win on time). Called after every death and every tick.
export function checkRoundEnd(ctx) {
  const { state } = ctx;
  if (state.phase !== 'live') return;
  const vAlive = state.bots.filter(b => b.team === 'vanguard' && b.alive).length + (state.player.alive ? 1 : 0);
  const jAlive = state.bots.filter(b => b.team === 'jackals' && b.alive).length;
  if (state.bomb.state === 'planted') return; // the bomb timer decides now
  if (vAlive === 0) return endRound(ctx, 'jackals', 'VANGUARD ELIMINATED');
  if (jAlive === 0) return endRound(ctx, 'vanguard', 'JACKALS ELIMINATED');
}

export function endRound(ctx, winner, reason) {
  const { state } = ctx;
  if (state.phase !== 'live') return;
  state.phase = 'roundEnd';
  state.phaseT = 0;
  state.winner = winner;
  state.score[winner] += 1;
  const loser = winner === 'vanguard' ? 'jackals' : 'vanguard';
  state.lossStreak[loser] = Math.min(3, state.lossStreak[loser] + 1);
  state.lossStreak[winner] = 0;
  // Economy: winners and losers both get paid; the player banks it.
  const winPay = ECONOMY.roundWin;
  const lossPay = ECONOMY.roundLoss + Math.min(ECONOMY.maxLossBonus, state.lossStreak[loser] * ECONOMY.lossStreakBonus);
  state.money += winner === 'vanguard' ? winPay : lossPay;
  state.banner = {
    title: winner === 'vanguard' ? 'ROUND WON' : 'ROUND LOST',
    sub: reason,
    t: 0,
  };
  ctx.hud.showBanner(state.banner.title, state.banner.sub);
  ctx.audio.play(winner === 'vanguard' ? 'roundWin' : 'roundLose');
  if (state.score[winner] >= MATCH.roundsToWin || state.round >= MATCH.maxRounds) {
    state.matchWinner = winner;
  }
}

// Grenade entities: fly, bounce once, then resolve.
export function stepGrenades(ctx, dt) {
  const { state } = ctx;
  for (const g of state.entities) {
    if (g.kind !== 'grenade' || g.resolved) continue;
    g.t += dt;
    g.vy -= 12 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    if (g.y < 0.15) { g.y = 0.15; g.vy *= -0.35; g.vx *= 0.6; g.vz *= 0.6; }
    if (g.mesh) g.mesh.position.set(g.x, g.y, g.z);
    if (g.t >= g.fuse) {
      g.resolved = true;
      if (g.mesh) g.mesh.visible = false;
      if (g.grenade === 'popper') {
        ctx.effects.spawnImpact({ x: g.x, y: g.y, z: g.z }, { x: 0, y: 1, z: 0 }, 26);
        ctx.audio.play('explode');
        const fighters = [state.player, ...state.bots];
        for (const f of fighters) {
          if (!f.alive) continue;
          const d = Math.hypot(f.x - g.x, f.z - g.z);
          if (d < 7) {
            const dmg = 110 * (1 - d / 7);
            applyDamage(ctx, f, dmg, state.player, false);
          }
        }
      } else {
        ctx.effects.spawnSmoke(g.x, g.z, 5, 14);
        ctx.audio.play('smoke');
      }
    }
  }
  state.entities = state.entities.filter(e => !e.resolved || e.kind !== 'grenade');
}
