// weapons.js — the armoury. Four guns and two grenades, each with one job.
// Damage falls off with distance; headshots always pay 2.5x. Prices are in
// the same dollars as the round economy in state.js.

export const HEADSHOT_MULT = 2.5;

export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'P9 Sidearm',
    price: 0,
    damage: 34,
    headMult: HEADSHOT_MULT,
    rpm: 320,
    auto: false,
    mag: 12,
    reserve: 36,
    reload: 1.4,
    spread: 0.014, // radians of base cone
    moveSpread: 0.055, // extra cone at full sprint
    crouchSpread: 0.006, // cone while crouched and still
    recoil: 0.012, // pitch kick per shot, radians
    bloomPerShot: 0.006,
    range: 55, // metres before falloff starts
    falloff: 0.45, // damage fraction at twice the range
    tracer: 0xffd27a,
    sound: 'pistol',
    length: 0.32,
  },
  rifle: {
    id: 'rifle',
    name: 'VK-7 Carbine',
    price: 2700,
    damage: 33,
    headMult: HEADSHOT_MULT,
    rpm: 600,
    auto: true,
    mag: 30,
    reserve: 90,
    reload: 2.2,
    spread: 0.02,
    moveSpread: 0.06,
    crouchSpread: 0.008,
    recoil: 0.011,
    bloomPerShot: 0.007,
    range: 70,
    falloff: 0.55,
    tracer: 0xffd27a,
    sound: 'rifle',
    length: 0.62,
  },
  shotgun: {
    id: 'shotgun',
    name: 'M590 Scattergun',
    price: 1500,
    damage: 9,
    pellets: 8,
    headMult: HEADSHOT_MULT,
    rpm: 75,
    auto: false,
    mag: 6,
    reserve: 24,
    reload: 2.6,
    spread: 0.085,
    moveSpread: 0.05,
    crouchSpread: 0.05,
    recoil: 0.045,
    bloomPerShot: 0.02,
    range: 14,
    falloff: 0.2,
    tracer: 0xffc27a,
    sound: 'shotgun',
    length: 0.58,
  },
  dmr: {
    id: 'dmr',
    name: 'Longbow DMR',
    price: 3100,
    damage: 82,
    headMult: HEADSHOT_MULT,
    rpm: 55,
    auto: false,
    mag: 10,
    reserve: 30,
    reload: 2.8,
    spread: 0.004,
    moveSpread: 0.05,
    crouchSpread: 0.002,
    recoil: 0.035,
    bloomPerShot: 0.014,
    range: 90,
    falloff: 0.7,
    tracer: 0xffe9a8,
    sound: 'dmr',
    length: 0.78,
  },
};

export const GRENADES = {
  smoke: {
    id: 'smoke',
    name: 'Smoke Grenade',
    price: 400,
    radius: 4.5, // metres of sight-blocking cloud
    ttl: 16, // seconds the cloud hangs
    fuse: 1.4, // seconds after the first bounce
  },
  frag: {
    id: 'frag',
    name: 'Frag Grenade',
    price: 300,
    radius: 7, // metres of lethal blast
    damage: 120, // at the centre
    minDamage: 12, // at the edge
    fuse: 1.6,
  },
};

export const BUY_MENU = [
  { key: '2', id: 'rifle', label: 'VK-7 Carbine' },
  { key: '3', id: 'shotgun', label: 'M590 Scattergun' },
  { key: '4', id: 'dmr', label: 'Longbow DMR' },
  { key: '5', id: 'smoke', label: 'Smoke Grenade', grenade: true },
  { key: '6', id: 'frag', label: 'Frag Grenade', grenade: true },
];

export function weaponDef(id) {
  return WEAPONS[id] || WEAPONS.pistol;
}

// Damage at a distance, before the headshot multiplier.
export function damageAt(def, dist, head) {
  let d = def.damage;
  if (dist > def.range) {
    const t = Math.min(1, (dist - def.range) / def.range);
    d = def.damage * (1 - (1 - def.falloff) * t);
  }
  if (head) d *= def.headMult;
  return d;
}
