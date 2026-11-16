// state.js — the single source of truth for a DUSTLINE match.
// The simulation owns this object; rendering only reads it. Nothing here
// imports three.js, so the rules of the game can be reasoned about (and
// tested) without a renderer.

export const DT = 1 / 60;
export const BUY_TIME = 12; // seconds of buy phase at the start of a round
export const ROUND_TIME = 100; // seconds of live play per round
export const PLANT_TIME = 3.5; // seconds to plant the bomb
export const DEFUSE_TIME = 5; // seconds to defuse the bomb
export const BOMB_TIME = 35; // seconds from plant to detonation
export const WIN_ROUNDS = 5; // first team to this many rounds wins
export const MAX_ROUNDS = 9; // the match never runs longer than this
export const END_TIME = 6; // seconds the round-end banner stays up
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STREAK_STEP = 500;
export const LOSS_STREAK_CAP = 3400;

export const TEAM_NAMES = { V: 'Vanguard', J: 'Jackals' };

// Roster: the player is agent 0 on Vanguard; everyone else is a bot.
const ROSTER = [
  { name: 'You', team: 'V', bot: false },
  { name: 'Rook', team: 'V', bot: true },
  { name: 'Havoc', team: 'V', bot: true },
  { name: 'Sable', team: 'V', bot: true },
  { name: 'Wren', team: 'V', bot: true },
  { name: 'Dagger', team: 'J', bot: true },
  { name: 'Onyx', team: 'J', bot: true },
  { name: 'Vex', team: 'J', bot: true },
  { name: 'Krait', team: 'J', bot: true },
  { name: 'Moss', team: 'J', bot: true },
];

export function makeAgent(def, id) {
  return {
    id,
    name: def.name,
    team: def.team,
    bot: def.bot,
    alive: true,
    hp: 100,
    // pos is the agent's feet. y is 0 on the ground everywhere in the yard.
    pos: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    vel: { x: 0, z: 0 },
    crouch: false,
    moving: false,
    // Loadout. Everyone starts with the free sidearm; primaries are bought.
    weapon: 'pistol',
    primary: null,
    mag: 12,
    reserve: 36,
    reloading: false,
    reloadT: 0,
    fireCd: 0,
    bloom: 0,
    recoil: 0,
    grenades: { smoke: 0, frag: 0 },
    money: START_MONEY,
    kills: 0,
    deaths: 0,
    hasBomb: false,
    planting: false,
    plantT: 0,
    defusing: false,
    defuseT: 0,
    // --- bot brain (unused by the player) ---
    role: 'push', // push | hold | rotate | plant | defuse | guard
    lane: 'mid', // a | mid | b — the lane this bot committed to
    site: null, // 'A' | 'B' — the site this bot is playing
    holdNode: -1, // waypoint index this bot is holding at
    path: [], // waypoint indices to follow
    pathIdx: 0,
    thinkT: 0, // countdown to the next decision tick
    reactionT: 0, // countdown before the bot may open fire
    burstLeft: 0, // shots left in the current burst
    burstPause: 0, // pause between bursts
    strafeDir: 1,
    strafeT: 0,
    targetId: -1, // agent id this bot is fighting, or -1
    lastSeen: null, // {x, z} where the bot last saw an enemy
    heard: null, // {x, z, t} of the last gunfire the bot heard
    skill: 0.8 + Math.random() * 0.5, // aim error multiplier, rolled per bot
  };
}

export function createGame() {
  const S = {
    phase: 'buy', // buy | live | end | match
    phaseT: BUY_TIME,
    round: 1,
    score: { V: 0, J: 0 },
    lossStreak: { V: 0, J: 0 },
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    bomb: {
      state: 'carried', // carried | dropped | planted | exploded | defused
      carrier: 1, // agent id carrying it (Rook, first round)
      site: null, // 'A' | 'B' once planted
      pos: null, // {x, z} when dropped or planted
      timer: BOMB_TIME,
      beepT: 0,
    },
    agents: ROSTER.map((d, i) => makeAgent(d, i)),
    projectiles: [], // live grenades in flight
    smokes: [], // active smoke clouds {x, y, z, r, ttl}
    events: [], // transient events, drained once per tick by audio/effects/hud
    time: 0, // total sim seconds since match start
    roundKills: 0,
    shotCount: 0,
  };
  return S;
}

export function playerOf(S) {
  return S.agents[0];
}

export function aliveOf(S, team) {
  let n = 0;
  for (const a of S.agents) if (a.team === team && a.alive) n++;
  return n;
}

export function teamAlive(S, team) {
  return S.agents.filter((a) => a.team === team && a.alive);
}

export function emit(S, type, data) {
  S.events.push({ type, ...data });
}

export function resetAgentForRound(S, a, spawn) {
  a.alive = true;
  a.hp = 100;
  a.pos.x = spawn.x;
  a.pos.y = 0;
  a.pos.z = spawn.z;
  a.yaw = spawn.yaw;
  a.pitch = 0;
  a.vel.x = 0;
  a.vel.z = 0;
  a.crouch = false;
  a.reloading = false;
  a.reloadT = 0;
  a.fireCd = 0;
  a.bloom = 0;
  a.recoil = 0;
  a.planting = false;
  a.plantT = 0;
  a.defusing = false;
  a.defuseT = 0;
  a.path = [];
  a.pathIdx = 0;
  a.targetId = -1;
  a.lastSeen = null;
  a.heard = null;
  a.burstLeft = 0;
  a.burstPause = 0;
  a.reactionT = 0;
  a.thinkT = Math.random() * 0.2;
  // Ammo is refilled for owned weapons every round; grenades stay spent.
  if (a.weapon === 'pistol') {
    a.mag = 12;
    a.reserve = 36;
  } else {
    a.mag = 30;
    a.reserve = 90;
  }
}

export function startRound(S, spawns) {
  // The bomb goes to a random living Vanguard bot each round, never the
  // player on round 1 (Rook carries first so the player learns the flow).
  const carriers = S.agents.filter((a) => a.team === 'V' && a.bot);
  const carrier = carriers[Math.floor(Math.random() * carriers.length)];
  for (const a of S.agents) {
    const sp = spawns[a.team][a.id % spawns[a.team].length];
    resetAgentForRound(S, a, sp);
    a.hasBomb = a === carrier;
  }
  S.bomb.state = 'carried';
  S.bomb.carrier = carrier.id;
  S.bomb.site = null;
  S.bomb.pos = null;
  S.bomb.timer = BOMB_TIME;
  S.bomb.beepT = 0;
  S.projectiles.length = 0;
  S.smokes.length = 0;
  S.roundKills = 0;
  S.phase = 'buy';
  S.phaseT = BUY_TIME;
  S.roundWinner = null;
  S.roundReason = '';
  emit(S, 'roundStart', { round: S.round });
}

export function endRound(S, winner, reason) {
  if (S.phase === 'end' || S.phase === 'match') return;
  S.roundWinner = winner;
  S.roundReason = reason;
  S.score[winner]++;
  const loser = winner === 'V' ? 'J' : 'V';
  S.lossStreak[loser]++;
  S.lossStreak[winner] = 0;
  // Economy: winners take the big purse, losers the consolation plus a
  // growing streak bonus so a team losing rounds in a row can still buy.
  for (const a of S.agents) {
    if (a.team === winner) a.money += WIN_REWARD;
    else {
      const bonus = Math.min(
        LOSS_REWARD + LOSS_STREAK_STEP * (S.lossStreak[loser] - 1),
        LOSS_STREAK_CAP,
      );
      a.money += bonus;
    }
    // Dying costs you your primary: you keep the sidearm and your grenades.
    if (!a.alive && a.primary) {
      a.primary = null;
      a.weapon = 'pistol';
      a.mag = 12;
      a.reserve = 36;
    }
  }
  S.phase = 'end';
  S.phaseT = END_TIME;
  emit(S, 'roundEnd', { winner, reason, round: S.round });
  if (S.score[winner] >= WIN_ROUNDS || S.round >= MAX_ROUNDS) {
    S.matchWinner = S.score.V > S.score.J ? 'V' : S.score.J > S.score.V ? 'J' : null;
    S.phase = 'match';
    emit(S, 'matchEnd', { winner: S.matchWinner });
  }
}

// Called every live tick: returns the round winner when the round is over.
export function checkRoundEnd(S) {
  if (S.phase !== 'live') return null;
  if (S.bomb.state === 'exploded') {
    return { winner: 'V', reason: 'Bomb detonated at Site ' + S.bomb.site };
  }
  const vAlive = aliveOf(S, 'V');
  const jAlive = aliveOf(S, 'J');
  const planted = S.bomb.state === 'planted';
  if (!planted) {
    if (vAlive === 0) return { winner: 'J', reason: 'Vanguard eliminated' };
    if (jAlive === 0) return { winner: 'V', reason: 'Jackals eliminated' };
    if (S.phaseT <= 0) return { winner: 'J', reason: 'Time expired — bomb never planted' };
  } else {
    // Bomb is down: attackers may all be dead, the round rides on the bomb.
    if (vAlive === 0 && S.bomb.state === 'planted') {
      // Defenders still have to stop it; the timer decides.
    }
    if (S.bomb.timer <= 0) return { winner: 'V', reason: 'Bomb detonated at Site ' + S.bomb.site };
  }
  return null;
}
