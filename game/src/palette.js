// palette.js — the one place DUSTLINE's colours live.
// Refinery Yard is a dusty industrial yard at golden hour: sand, rust,
// weathered concrete and teal-painted steel. Every module imports from here
// so the palette stays consistent between the 3D scene and the HUD.

export const COLORS = {
  sky: 0xcfd8e6,
  fog: 0xc9b28a,
  ground: 0x9a8a68,
  groundDark: 0x7d6f52,
  concrete: 0x8d8578,
  concreteDark: 0x6b655a,
  rust: 0xa85c2e,
  rustDark: 0x7e421f,
  steel: 0x5d6b73,
  steelDark: 0x3d484e,
  teal: 0x2e7f7a,
  tealDark: 0x1f5a56,
  hazard: 0xd8a020,
  hazardDark: 0x8a6410,
  crate: 0x7a5c34,
  crateDark: 0x5d4526,
  pipe: 0x4a5560,
  tankA: 0xb0703a,
  tankB: 0x3a7a8c,
  vanguard: 0x3f7d4e,
  jackals: 0xb0503c,
  tracerV: 0xffd27a,
  tracerJ: 0xff7a5c,
  muzzle: 0xffe9a8,
  smoke: 0xb8b8b0,
  hudText: '#e8e2d4',
  hudDim: '#9a9484',
  hudGood: '#7fd08a',
  hudBad: '#ff7a6a',
  hudGold: '#e8b93e',
};

export const TEAM = {
  V: { name: 'Vanguard', color: COLORS.vanguard, css: '#5da86e' },
  J: { name: 'Jackals', color: COLORS.jackals, css: '#d06a55' },
};

// CSS hex strings for the HUD, derived from the same palette.
export function css(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}
