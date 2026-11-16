// DUSTLINE — main: bootstrap, the fixed-step loop, the round flow and the player's
// shooting. The simulation runs at a fixed 60 Hz, apart from rendering; the render
// loop only reads state and draws it. Nothing here allocates in the hot loop.
import * as THREE from 'three';
import { createState, MATCH, WEAPONS, GRENADES, ECONOMY } from './state.js';
import { buildWorld } from './world.js';
import { createPlayer, resetPlayer, stepPlayer, updateCamera, groundSpeed } from './player.js';
import { tryFire, startReload, buyWeapon, buyGrenade, throwGrenade, currentSpread } from './weapons.js';
import { createBots, resetBots, stepBots } from './bots.js';
import { resolveShot, endRound, stepGrenades } from './combat.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { PALETTE } from './palette.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seed = Number(params.get('seed') || '1') || 1;

const state = createState(shotMode ? seed : (Date.now() % 2147483647));
state.shot = shotMode;

// --- renderer, scene, lights -------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PALETTE.fog, 45, 150);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 400);

// Sky dome: a dusk gradient, cheap and one draw call.
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: { top: { value: new THREE.Color(PALETTE.skyTop) }, bottom: { value: new THREE.Color(PALETTE.skyBottom) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottom, top, smoothstep(0.0, 0.6, h)), 1.0); }',
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(220, 16, 12), skyMat));

const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
sun.position.set(-30, 38, -18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0004;
scene.add(sun);

const world = buildWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud(document);
const input = createInput(document, renderer.domElement);
const player = createPlayer(scene, camera, world);
state.player = player;

const ctx = { state, world, scene, camera, renderer, effects, audio, hud, input };
createBots(ctx); // nine AI fighters: 4 Vanguard allies, 5 Jackals defenders

// Bomb charge visual: a small blinking box, shown while planted or dropped.
const chargeMat = new THREE.MeshBasicMaterial({ color: PALETTE.accent });
const charge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.3), chargeMat);
charge.visible = false;
scene.add(charge);
const chargeLight = new THREE.PointLight(PALETTE.accent, 0, 8, 1.5);
scene.add(chargeLight);

// Grenade meshes, one per live grenade entity.
const grenadeGeo = new THREE.SphereGeometry(0.12, 8, 6);
const grenadeMat = new THREE.MeshLambertMaterial({ color: 0x22252a });
function syncGrenadeMeshes() {
  for (const g of state.entities) {
    if (g.kind === 'grenade' && !g.mesh) {
      g.mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
      g.mesh.position.set(g.x, g.y, g.z);
      scene.add(g.mesh);
    }
  }
}

// --- match / round flow -------------------------------------------------------
function startMatch() {
  state.score = { vanguard: 0, jackals: 0 };
  state.lossStreak = { vanguard: 0, jackals: 0 };
  state.round = 1;
  state.money = MATCH.startMoney;
  state.matchWinner = null;
  startRound();
}

function startRound() {
  const siteChoice = state.rng() < 0.5 ? 'A' : 'B';
  state.bomb = { state: 'carried', site: null, x: 0, z: 0, timer: 0, planter: null, defuser: null, progress: 0, carrier: 'player' };
  state.roundTimeLeft = MATCH.roundTime;
  state.killfeed = [];
  state.phase = 'buy';
  state.phaseT = 0;
  const spawn = world.spawns.vanguard[4];
  resetPlayer(player, spawn, player.weaponId || 'longshot');
  player.carrier = true; // the player carries the charge at round start
  player.money = state.money;
  resetBots(ctx, siteChoice);
  charge.visible = false;
  hud.hideDeath();
  hud.hideMatch();
  hud.setScore(state.score.vanguard, state.score.jackals, state.round);
  hud.setMoney(state.money);
  hud.setBomb('PLANT THE CHARGE — SITE A OR B');
  hud.setPhase('BUY PHASE');
  hud.showBuy(true);
  hud.announce(`ROUND ${state.round}`, `Plant the charge at Site ${siteChoice} — ${siteChoice === 'A' ? 'REFINERY' : 'SILO'}`);
  audio.play('buy');
}

function endRoundFlow() {
  if (state.matchWinner) {
    state.phase = 'matchEnd';
    state.phaseT = 0;
    hud.showMatch(state.matchWinner, state.score);
    document.exitPointerLock?.();
    return;
  }
  state.round += 1;
  startRound();
}

// --- player shooting ----------------------------------------------------------
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
let prevFiring = false;

function playerShoot() {
  const w = WEAPONS[player.weaponId];
  const shot = tryFire(player, w);
  if (!shot) return;
  if (shot.dry) { audio.play('dry'); startReload(player); return; }
  updateCamera(player);
  _origin.copy(camera.position);
  camera.getWorldDirection(_dir);
  const sp = currentSpread(player, w, groundSpeed(player) > 0.5);
  _dir.x += (state.rng() - 0.5) * sp * 2;
  _dir.y += (state.rng() - 0.5) * sp * 2;
  _dir.z += (state.rng() - 0.5) * sp * 2;
  _dir.normalize();
  const hit = resolveShot(ctx, player, _origin, _dir, w);
  // Muzzle flash at the gun tip.
  const mx = camera.position.x + _dir.x * 0.7;
  const my = camera.position.y - 0.12 + _dir.y * 0.7;
  const mz = camera.position.z + _dir.z * 0.7;
  effects.spawnMuzzle({ x: mx, y: my, z: mz });
  audio.play(w.sound);
  state.noiseEvents.push({ x: player.x, z: player.z, radius: 30, t: 0 });
}

// --- one fixed simulation step -------------------------------------------------
function stepSim(dt) {
  state.time += dt;
  // Prune old noise.
  state.noiseEvents = state.noiseEvents.filter(n => { n.t += dt; return n.t < 1.2; });

  if (state.phase === 'menu') return;
  if (state.phase === 'matchEnd') return;

  if (state.phase === 'buy') {
    state.phaseT += dt;
    hud.setTimer(MATCH.buyTime - state.phaseT);
    hud.setPhase('BUY PHASE');
    if (state.phaseT >= MATCH.buyTime) {
      state.phase = 'live';
      state.phaseT = 0;
      hud.showBuy(false);
      hud.announce('GO GO GO', 'Plant the charge or eliminate the Jackals');
    }
    return;
  }

  if (state.phase === 'roundEnd') {
    state.phaseT += dt;
    stepBots(ctx, dt);
    effects.update(dt);
    if (state.phaseT >= MATCH.roundEndPause) endRoundFlow();
    return;
  }

  // Live round.
  state.phaseT += dt;
  state.roundTimeLeft -= dt;

  // Bomb timer.
  if (state.bomb.state === 'planted') {
    state.bomb.timer -= dt;
    hud.setBomb(`CHARGE PLANTED — ${Math.ceil(state.bomb.timer)}s`);
    const blink = Math.sin(state.time * 8) > 0;
    chargeMat.color.setHex(blink ? PALETTE.accent : 0xff3b30);
    chargeLight.intensity = blink ? 6 : 0.5;
    if (state.bomb.timer <= 0) {
      state.bomb.state = 'detonated';
      effects.spawnImpact({ x: state.bomb.x, y: 1, z: state.bomb.z }, { x: 0, y: 1, z: 0 }, 30);
      audio.play('explode');
      endRound(ctx, 'vanguard', 'CHARGE DETONATED');
    }
  }

  if (state.roundTimeLeft <= 0 && state.bomb.state !== 'planted') {
    endRound(ctx, 'jackals', 'TIME EXPIRED — JACKALS HOLD');
  }

  // Player look.
  const { dx, dy } = input.consumeMouse();
  player.yaw -= dx * 0.0021;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * 0.0021));

  // Player movement.
  stepPlayer(player, { f: input.state.f, r: input.state.r, crouch: input.state.crouch, sprint: input.state.sprint }, dt);

  // Player actions.
  if (input.state.reload) startReload(player);
  if (input.state.weaponKey) {
    const id = input.state.weaponKey;
    if (WEAPONS[id] && id !== player.weaponId) {
      // Switching weapons is free; buying is the buy menu's job.
      const w = WEAPONS[id];
      player.weaponId = id; player.mag = w.mag; player.reserve = w.reserve;
      player.reloading = 0; player.fireCooldown = 0;
    }
  }
  const firing = input.state.firing && input.state.locked;
  const w = WEAPONS[player.weaponId];
  if (firing && (w.auto || !prevFiring)) playerShoot();
  prevFiring = firing;
  if (input.state.grenade) {
    const kind = input.state.grenade;
    if (player.grenades[kind] > 0) {
      player.grenades[kind] -= 1;
      updateCamera(player);
      camera.getWorldDirection(_dir);
      throwGrenade(state, { x: player.x, y: 1.5, z: player.z }, { x: _dir.x, y: _dir.y, z: _dir.z }, kind);
      audio.play('click');
    }
  }
  // Pick up a dropped charge.
  if (state.bomb.state === 'dropped' && player.alive) {
    if (Math.hypot(player.x - state.bomb.x, player.z - state.bomb.z) < 1.4) {
      state.bomb.state = 'carried';
      state.bomb.carrier = 'player';
      player.carrier = true;
      hud.announce('CHARGE RECOVERED', 'Plant it at a site');
    }
  }
  // Plant: hold E at a site while carrying.
  if (state.bomb.state === 'carried' && state.bomb.carrier === 'player' && player.alive) {
    const siteKey = state.bomb.site;
    const site = world.sites[siteKey || (player.z < 0 ? 'A' : 'B')];
    const inSite = Math.hypot(player.x - site.x, player.z - site.z) < site.r;
    if (inSite && input.isInteracting()) {
      state.bomb.progress += dt;
      state.bomb.site = player.z < 0 ? 'A' : 'B';
      hud.setBomb(`PLANTING… ${Math.ceil((MATCH.plantTime - state.bomb.progress) * 10) / 10}s`);
      if (state.bomb.progress >= MATCH.plantTime) {
        state.bomb.state = 'planted';
        state.bomb.x = site.x; state.bomb.z = site.z;
        state.bomb.timer = MATCH.bombTimer;
        player.carrier = false;
        state.plants += 1;
        state.money += ECONOMY.plant;
        charge.position.set(site.x, 0.3, site.z);
        charge.visible = true;
        chargeLight.position.set(site.x, 1, site.z);
        hud.announce('CHARGE PLANTED', `Site ${state.bomb.site} — defend it for ${MATCH.bombTimer}s`);
        audio.play('plant');
      }
    } else {
      state.bomb.progress = Math.max(0, state.bomb.progress - dt);
    }
  }

  stepBots(ctx, dt);
  stepGrenades(ctx, dt);
  syncGrenadeMeshes();
  effects.update(dt);

  // Charge visual follows a dropped charge.
  if (state.bomb.state === 'dropped') {
    charge.position.set(state.bomb.x, 0.3, state.bomb.z);
    charge.visible = true;
    chargeLight.position.set(state.bomb.x, 1, state.bomb.z);
    chargeLight.intensity = 2;
  } else if (state.bomb.state !== 'planted') {
    charge.visible = false;
    chargeLight.intensity = 0;
  }

  if (input.state.buy && state.phase === 'live') {
    hud.showBuy(true);
    state.buyOpen = true;
  }
  input.clearOneShots();
}

// --- HUD sync (every render) ----------------------------------------------------
function syncHud() {
  const w = WEAPONS[player.weaponId];
  hud.setHealth(player.hp);
  hud.setAmmo(player.mag, player.reserve, player.reloading > 0);
  hud.setWeapon(w.name);
  hud.setMoney(state.money);
  hud.setScore(state.score.vanguard, state.score.jackals, state.round);
  if (state.phase === 'live') {
    hud.setTimer(state.roundTimeLeft);
    hud.setPhase(state.bomb.state === 'planted' ? 'CHARGE LIVE' : 'ROUND');
  } else if (state.phase === 'roundEnd') {
    hud.setTimer(state.roundTimeLeft);
    hud.setPhase('ROUND END');
  }
  const sp = currentSpread(player, w, groundSpeed(player) > 0.5);
  hud.setSpread(4 + sp * 900);
  hud.refreshKillfeed(state.killfeed);
  if (!player.alive) hud.setHealth(0);
}

// --- render loop ------------------------------------------------------------------
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!state.shot) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) { stepSim(STEP); acc -= STEP; n += 1; }
    if (n === 5) acc = 0;
  }
  updateCamera(player);
  syncHud();
  renderer.render(scene, camera);
}

// --- buy menu wiring ---------------------------------------------------------------
document.querySelectorAll('[data-buy]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [kind, id] = btn.dataset.buy.split(':');
    if (state.phase !== 'buy' && state.phase !== 'live') return;
    if (kind === 'weapon' && buyWeapon(state, id)) audio.play('buy');
    if (kind === 'grenade' && buyGrenade(state, id)) audio.play('buy');
    hud.setMoney(state.money);
    hud.setBuyMoney(state.money);
  });
});
document.getElementById('buy-close')?.addEventListener('click', () => hud.showBuy(false));
document.getElementById('start-btn')?.addEventListener('click', () => {
  audio.unlock();
  hud.showStart(false);
  renderer.domElement.requestPointerLock?.();
  startMatch();
});
document.getElementById('restart-btn')?.addEventListener('click', () => {
  hud.hideMatch();
  startMatch();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && state.phase === 'matchEnd') { hud.hideMatch(); startMatch(); }
  if (e.code === 'KeyM') audio.toggle();
});

// --- deterministic screenshot staging (?shot=start|fight|site|end) ------------------
function stageShot(mode) {
  // A match in progress, staged so the frame reads at a glance.
  startMatch();
  // Drop the stale round-start announce startMatch() raised; the 'start' and
  // 'site' shots set their own announce in their branches below.
  document.getElementById('announce')?.classList.remove('on');
  state.phase = 'live';
  state.phaseT = 10;
  hud.showBuy(false);
  const allies = state.bots.filter(b => b.team === 'vanguard');
  const enemies = state.bots.filter(b => b.team === 'jackals');

  if (mode === 'start') {
    state.roundTimeLeft = 98;
    state.score = { vanguard: 0, jackals: 0 };
    player.x = -27; player.z = 0; player.yaw = -Math.PI / 2; player.pitch = 0;
    allies[0].x = -24; allies[0].z = -2; allies[0].yaw = -Math.PI / 2;
    allies[1].x = -24; allies[1].z = 3; allies[1].yaw = -Math.PI / 2;
    enemies[0].x = 8; enemies[0].z = -1; enemies[0].yaw = Math.PI / 2;
    hud.announce('ROUND 1', 'Plant the charge at Site A — REFINERY');
  } else if (mode === 'fight') {
    state.roundTimeLeft = 61;
    state.score = { vanguard: 1, jackals: 1 };
    state.round = 3;
    state.money = 2650;
    player.x = -4; player.z = 2; player.yaw = -Math.PI / 2 + 0.12; player.pitch = 0.01;
    player.hp = 82; player.mag = 24; player.reserve = 90;
    const e = enemies[0];
    e.x = 9; e.z = 1.5; e.yaw = Math.PI / 2; e.alive = true;
    e.mesh.position.set(e.x, 0, e.z);
    allies[0].x = -8; allies[0].z = 5; allies[0].yaw = -Math.PI / 2;
    state.killfeed.unshift({ text: 'YOU  ✕  FANG', t: 0 });
    state.killfeed.unshift({ text: 'ROOK  ✕  VEX', t: 0 });
    hud.setBomb('PLANT THE CHARGE — SITE A');
  } else if (mode === 'site') {
    state.roundTimeLeft = 32;
    state.score = { vanguard: 2, jackals: 2 };
    state.round = 5;
    state.money = 4100;
    state.bomb.state = 'planted';
    state.bomb.site = 'B';
    state.bomb.x = 20; state.bomb.z = 15; state.bomb.timer = 32;
    charge.position.set(20, 0.3, 15);
    charge.visible = true;
    chargeLight.position.set(20, 1, 15);
    chargeLight.intensity = 6;
    player.x = 12; player.z = 12; player.yaw = -Math.PI / 2 - 0.5; player.pitch = 0;
    player.hp = 64; player.mag = 18; player.reserve = 60;
    // The defuser, crouched on the charge at the edge of the smoke — visible.
    const d = enemies[1];
    d.x = 21.5; d.z = 16.5; d.yaw = Math.PI / 2; d.alive = true;
    d.mesh.position.set(d.x, 0, d.z);
    effects.spawnSmoke(17, 12.5, 5, 14);
    hud.setBomb('CHARGE PLANTED — 32s');
    hud.announce('CHARGE PLANTED', 'Site B — SILO — hold the line');
  } else if (mode === 'end') {
    state.phase = 'roundEnd';
    state.phaseT = 1;
    state.score = { vanguard: 3, jackals: 2 };
    state.round = 6;
    state.winner = 'vanguard';
    player.x = -4; player.z = -3; player.yaw = -1.1; player.pitch = 0;
    player.hp = 45; player.mag = 7; player.reserve = 30;
    state.killfeed.unshift({ text: 'YOU  ✕  DUNE  (HEADSHOT)', t: 0 });
    state.killfeed.unshift({ text: 'YOU  ✕  MIRAGE', t: 0 });
    state.killfeed.unshift({ text: 'HAVOC  ✕  GHOST', t: 0 });
    hud.showBanner('ROUND WON', 'JACKALS ELIMINATED');
    hud.setBomb('ROUND WON');
  }
  // Settle a few fixed steps so bots stand where the frame expects them, then
  // dress the frame (tracer, muzzle flash, hitmarker) LAST — their lifetimes are
  // ~0.1 s, so anything spawned before the settle would already have faded.
  for (let i = 0; i < 6; i++) stepSim(STEP);
  if (mode === 'fight') {
    updateCamera(player);
    effects.spawnTracer({ x: player.x + 0.3, y: 1.5, z: player.z }, { x: 8.6, y: 1.4, z: 1.5 }, 0xffe9a8);
    effects.spawnMuzzle({ x: player.x + 0.4, y: 1.45, z: player.z - 0.5 });
    document.getElementById('hitmarker')?.classList.add('on');
  }
  updateCamera(player);
  syncHud();
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// Debug hook for play-testing (and the finalist review): the live state, read-only
// from the console, plus a manual stepper that advances the fixed-step simulation
// without waiting on requestAnimationFrame (headless renderers throttle it).
// Harmless in production play.
window.__dustline = {
  state, player,
  advance(seconds) {
    const n = Math.max(0, Math.round(seconds / STEP));
    for (let i = 0; i < n; i++) stepSim(STEP);
    updateCamera(player);
    syncHud();
    renderer.render(scene, camera);
    return { phase: state.phase, round: state.round, timeLeft: state.roundTimeLeft, score: { ...state.score }, bomb: state.bomb.state };
  },
};

if (shotMode) {
  hud.showStart(false);
  stageShot(shotMode);
} else {
  hud.showStart(true);
  hud.setPhase('MENU');
  requestAnimationFrame(frame);
}
