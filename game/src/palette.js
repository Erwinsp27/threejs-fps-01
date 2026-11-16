// DUSTLINE — palette and shared visual constants.
// One palette, chosen once: dusk desert (sand, rust, teal) so the map reads at a
// glance and both teams stay readable against it. Every colour in the game
// comes from here, never from a literal buried in another module.
export const PALETTE = {
  skyTop: 0x51649c,      // dusk blue, top of the sky dome
  skyBottom: 0xe89a58,   // low amber sun band on the horizon
  fog: 0xc98a54,         // warm haze that eats the far walls
  sun: 0xffc27a,         // low sun, warm
  hemiSky: 0x8fa3c7,     // cool sky bounce
  hemiGround: 0x8a6a44,  // warm ground bounce
  ground: 0xb98a56,      // packed sand
  groundDark: 0x9c7448,  // worn sand patches
  wall: 0x7d5a3c,        // concrete, sun-baked
  wallDark: 0x5f4430,    // shaded concrete
  rust: 0x9a4a26,        // refinery rust
  metal: 0x4a5560,       // dark steel
  teal: 0x2fa8a0,         // Vanguard team colour
  tealDark: 0x1e6f6a,
  orange: 0xd96b2b,      // Jackals team colour
  orangeDark: 0x9a4413,
  accent: 0xffd23f,      // HUD accent, bomb light
  ink: 0xf2ead9,         // HUD text
  muted: 0xb8a88f,       // HUD secondary text
  crate: 0x8a6a34,       // wooden crates
  crateDark: 0x6b4f26,
  barrel: 0x3f6b4a,      // green drums
  barrelRust: 0x7a3b22,
  smoke: 0xcfc4b0,       // smoke grenade cloud
  tracer: 0xffe9a8,      // tracer core
};

// Team definitions: name, colour, spawn side (west -1, east +1).
export const TEAMS = {
  vanguard: { name: 'VANGUARD', color: PALETTE.teal, dark: PALETTE.tealDark, side: -1 },
  jackals: { name: 'JACKALS', color: PALETTE.orange, dark: PALETTE.orangeDark, side: 1 },
};
