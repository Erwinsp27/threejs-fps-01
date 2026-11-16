// DUSTLINE — the one place the game's state lives.
// Everything mutable about a match sits in the object `createState()` returns;
// modules read and write it but never keep a second copy of it. Constants
// (weapons, economy, match rules) are frozen here so the game's rules can be
// read in one file.

export const MATCH = Object.freeze({
  roundsToWin: 5,
  maxRounds: 9,
  roundTime: 100,      // seconds of live play per round
  buyTime: 12,         // seconds to buy before the round starts
  plantTime: 3.5,      // seconds holding E to plant
  defuseTime: 5,       // seconds holding E to defuse
  bombTimer: 35,       // seconds from plant to detonation
  roundEndPause: 4,    // seconds the banner shows before the next round
  playerHp: 100,
  startMoney: 800,
});

export const ECONOMY = Object.freeze({
  kill: 300,
  roundWin: 3250,
  roundLoss: 1900,
  lossStreakBonus: 500,  // +500 per consecutive loss, capped by maxLossBonus
  maxLossBonus: 1500,
  plant: 300,
  defuse: 300,
});

// Weapon table. damage is body damage at close range; falloff starts at
// falloffStart metres and bottoms out at falloffMin. headMult multiplies damage
// on a head hit. spread is in radians at rest; bloom adds per shot, moving
// and crouching change it further.
export const WEAPONS = Object.freeze({
  p9: {
    id: 'p9', name: 'P9 Sidearm', price: 0, auto: false,
    damage: 30, headMult: 2.5, falloffStart: 18, falloffMin: 0.6,
    rate: 320, mag: 12, reserve: 36, reload: 1.5,
    spread: 0.011, bloom: 0.004, moveSpread: 0.02, recoil: 0.011, kick: 0.35,
    range: 60, tracer: 0xffd9a0, sound: 'pistol',
  },
  hornet: {
    id: 'hornet', name: 'VK-9 Hornet', price: 1500, auto: true,
    damage: 26, headMult: 2.5, falloffStart: 16, falloffMin: 0.55,
    rate: 780, mag: 30, reserve: 90, reload: 2.1,
    spread: 0.016, bloom: 0.003, moveSpread: 0.026, recoil: 0.009, kick: 0.3,
    range: 55, tracer: 0xffe9a8, sound: 'smg',
  },
  longshot: {
    id: 'longshot', name: 'AR-7 Longshot', price: 2700, auto: true,
    damage: 34, headMult: 2.5, falloffStart: 24, falloffMin: 0.7,
    rate: 600, mag: 30, reserve: 90, reload: 2.4,
    spread: 0.007, bloom: 0.0025, moveSpread: 0.03, recoil: 0.013, kick: 0.5,
    range: 90, tracer: 0xffe9a8, sound: 'rifle',
  },
  deadeye: {
    id: 'deadeye', name: 'LW-50 Deadeye', price: 4750, auto: false,
    damage: 110, headMult: 2.3, falloffStart: 40, falloffMin: 0.85,
    rate: 55, mag: 5, reserve: 15, reload: 3.2,
    spread: 0.001, bloom: 0.001, moveSpread: 0.05, recoil: 0.05, kick: 2.2,
    range: 120, tracer: 0xcfe8ff, sound: 'sniper',
  },
});

export const GRENADES = Object.freeze({
  popper: { id: 'popper', name: 'Popper Frag', price: 300, kind: 'frag', radius: 7, damage: 110 },
  veil: { id: 'veil', name: 'Veil Smoke', price: 300, kind: 'smoke', radius: 5, duration: 14 },
});

// Deterministic RNG (mulberry32). One instance per match, seeded from the URL
// (?seed=N) for screenshots or from the clock for live play, so a staged frame
// is reproducible and two runs of main.ts write the same bytes.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createState(seed) {
  return {
    rng: makeRng(seed),
    seed,
    phase: 'menu',        // menu | buy | live | roundEnd | matchEnd
    phaseT: 0,            // seconds in the current phase
    round: 1,
    score: { vanguard: 0, jackals: 0 },
    lossStreak: { vanguard: 0, jackals: 0 },
    roundTimeLeft: MATCH.roundTime,
    bomb: { state: 'idle', site: null, x: 0, z: 0, timer: 0, planter: null, defuser: null, progress: 0 },
    player: null,         // filled by player.js
    bots: [],             // filled by bots.js
    entities: [],         // live grenades
    tracers: [],          // pooled tracer pool (effects.js owns the pool)
    particles: [],        // pooled particle pool
    sounds: [],           // queued sound events, drained by audio.js each frame
    noiseEvents: [],      // {x, z, radius, t} — gunfire bots can hear
    killfeed: [],         // {text, killer, victim, t} — newest first
    banner: null,         // {title, sub, t} — round/match banner
    money: MATCH.startMoney,
    buyOpen: false,
    winner: null,         // 'vanguard' | 'jackals' | null
    matchWinner: null,
    time: 0,              // total sim seconds
    kills: 0, deaths: 0, plants: 0, defuses: 0,
    shot: null,           // screenshot staging mode, null in live play
  };
}
