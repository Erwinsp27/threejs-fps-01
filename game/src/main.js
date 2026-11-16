// main.js — DUSTLINE bootstrap. Wires the sim (state, world, combat, bots)
// to the renderer (three.js), the HUD and the sound synth, and runs the
// fixed 60 Hz simulation apart from rendering. The sim never allocates in
// its hot loop; the render side reuses preallocated vectors and pooled
// effects.
//
// URL modes (for testing and screenshots, never for play):
//   ?auto=1   skip the click-to-play screen and start at once
//   ?test=1   short rounds (3 s buy, 25 s live) for automated playtests
//   ?shot=N   autopilot camera presets for the four screenshots

import * as THREE from 'three';
import { COLORS, TEAM } from './palette.js';
import {
  createGame, startRound, endRound, checkRoundEnd, playerOf, DT, ROUND_TIME,
} from './state.js';
import { SPAWNS, SITES, buildWorld } from './world.js';
import { createInput } from './input.js';
import { updatePlayer } from './player.js';
import { updateBots, assignRoles, hearNoise } from './bots.js';
import {
  updateReloads, updateProjectiles, updateSmokes, updateBombPickup,
} from './combat.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { ensureAudio, sfx } from './audio.js';

const params = new URLSearchParams(location.search);
const TEST_MODE = params.has('test');
const SHOT_MODE = params.get('shot');
const AUTO_MODE = params.has('auto') || TEST_MODE || SHOT_MODE !== null;
const SHOT_NUM = SHOT_MODE ? parseInt(SHOT_MODE, 10) : 0;

// ------------------------------------------------------------------ errors
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
scene.fog = new THREE.Fog(COLORS.fog, 45, 130);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xdfe8f0, 0x8a7a5c, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0b0, 1.7);
sun.position.set(24, 34, 12);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xbfd0e0, 0.4);
fill.position.set(-20, 18, -14);
scene.add(fill);

const world = buildWorld(THREE, COLORS);
scene.add(world.group);
const blockers = world.blockers;

// ------------------------------------------------------------------ game state
let S = createGame();
startRound(S, SPAWNS);
assignRoles(S);
if (TEST_MODE) S.phaseT = 3;

const input = createInput(renderer.domElement);
const hud = createHud(document);
const effects = createEffects(THREE, scene, COLORS);
const player = playerOf(S);

// ------------------------------------------------------------------ agents
const agentMeshes = new Map();
const tmpV = new THREE.Vector3();

function makeAgentMesh(a) {
  const g = new THREE.Group();
  const teamColor = TEAM[a.team].color;
  const cloth = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.9 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.34), dark);
  legs.position.y = 0.28;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.75, 0.4), cloth);
  torso.position.y = 0.93;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.4, 0.44), dark);
  vest.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.36), skin);
  head.position.y = 1.56;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.4), dark);
  helmet.position.y = 1.72;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.62), dark);
  gun.position.set(0.28, 1.05, -0.3);
  g.add(legs, torso, vest, head, helmet, gun);
  // The bomb rides on the carrier's back.
  const bombBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.22, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.6 }),
  );
  bombBox.position.set(0, 1.05, 0.26);
  bombBox.visible = false;
  bombBox.name = 'bombBox';
  g.add(bombBox);
  scene.add(g);
  return g;
}

for (const a of S.agents) agentMeshes.set(a.id, makeAgentMesh(a));

// The planted / dropped bomb on the ground, with a blinking light.
const bombMesh = new THREE.Group();
const bombBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.42, 0.26, 0.3),
  new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.55 }),
);
const bombLightMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
const bombLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bombLightMat);
bombLight.position.set(0.12, 0.16, 0);
bombMesh.add(bombBody, bombLight);
bombMesh.visible = false;
scene.add(bombMesh);

// ------------------------------------------------------------------ viewmodel
// The gun in the player's hands: a few boxes parented to the camera, with
// a bob while walking and a kick when firing. No model files, no network.
const viewmodel = new THREE.Group();
const vmGun = new THREE.Group();
const vmMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.55, metalness: 0.35 });
const vmAccent = new THREE.MeshStandardMaterial({ color: COLORS.rust, roughness: 0.6 });
const vmBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), vmMat);
const vmBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), vmMat);
vmBarrel.rotation.x = Math.PI / 2;
vmBarrel.position.set(0, 0.02, -0.38);
const vmSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), vmAccent);
vmSight.position.set(0, 0.09, -0.1);
const vmMag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), vmMat);
vmMag.position.set(0, -0.12, 0.02);
vmGun.add(vmBody, vmBarrel, vmSight, vmMag);
const vmNade = new THREE.Mesh(
  new THREE.SphereGeometry(0.09, 10, 8),
  new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.7 }),
);
vmNade.visible = false;
viewmodel.add(vmGun, vmNade);
viewmodel.position.set(0.26, -0.24, -0.42);
camera.add(viewmodel);

let vmKick = 0;
let bobT = 0;

// ------------------------------------------------------------------ start screen
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
let started = false;

function beginPlay() {
  if (started) return;
  started = true;
  ensureAudio();
  input.requestLock();
  hud.hideStart();
}
startBtn.addEventListener('click', beginPlay);
renderer.domElement.addEventListener('click', () => {
  if (started) input.requestLock();
});
restartBtn.addEventListener('click', () => {
  restartMatch();
});
if (AUTO_MODE) {
  started = true;
  hud.hideStart();
}

// The player reference must follow S when the match restarts.
let livePlayer = player;

function restartMatch() {
  S = createGame();
  startRound(S, SPAWNS);
  assignRoles(S);
  if (TEST_MODE) S.phaseT = 3;
  livePlayer = playerOf(S);
  shotSetupDone = false;
  deathCam = null;
  hud.hideMatch();
  hud.hideStart();
  started = true;
}

// ------------------------------------------------------------------ events
// The sim emits; this drains each tick into sound, effects and the HUD.
function drainEvents() {
  for (const e of S.events) {
    const p = livePlayer;
    const pEye = { x: p.pos.x, y: p.pos.y + 1.62, z: p.pos.z };
    const distTo = (x, y, z) => Math.hypot(x - pEye.x, y - pEye.y, z - pEye.z);
    switch (e.type) {
      case 'shot': {
        sfx.shot(e.weapon, distTo(e.x, e.y, e.z));
        if (e.agent === 0) {
          vmKick = 0.06;
          tmpV.set(0.26, -0.16, -0.85);
          camera.localToWorld(tmpV);
          effects.spawnMuzzle(tmpV.x, tmpV.y, tmpV.z);
        }
        break;
      }
      case 'tracer':
        effects.spawnTracer(e.x0, e.y0, e.z0, e.x1, e.y1, e.z1, e.color);
        break;
      case 'impact':
        effects.spawnImpact(e.x, e.y, e.z);
        break;
      case 'hit':
        if (e.agent === 0) {
          hud.hitmarker(e.head);
          sfx.hit(e.head);
        }
        if (e.target === 0) {
          hud.damageFlash();
          sfx.hurt();
        }
        break;
      case 'kill':
        hud.killfeed(e.killerName + ' ✕ ' + e.victimName + (e.head ? ' — headshot' : ''), e.killer === 0 ? 'good' : e.victim === 0 ? 'bad' : '');
        if (e.killer === 0) sfx.kill();
        break;
      case 'noise':
        hearNoise(S, e.x, e.z, e.radius);
        break;
      case 'reload':
        if (e.agent === 0) sfx.reload();
        break;
      case 'dry':
        if (e.agent === 0) sfx.dry();
        break;
      case 'throw':
        if (e.agent === 0) sfx.throw_();
        break;
      case 'explode':
        effects.spawnExplosion(e.x, e.y, e.z);
        sfx.explode(distTo(e.x, e.y, e.z));
        break;
      case 'planted':
        hud.banner('BOMB PLANTED — SITE ' + e.site, 'Jackals must defuse — Vanguard hold the site', 4);
        sfx.plant();
        break;
      case 'defused':
        hud.banner('BOMB DEFUSED', '', 3);
        sfx.defuse();
        break;
      case 'bombDrop':
        hud.killfeed('The bomb was dropped', '');
        break;
      case 'bombPickup': {
        const a = S.agents[e.agent];
        hud.killfeed((a ? a.name : 'Someone') + ' picked up the bomb', '');
        break;
      }
      case 'buy':
        if (e.agent === 0) sfx.buy();
        break;
      case 'roundStart':
        hud.banner('ROUND ' + e.round, 'Buy phase — press B, buy with 1–6, then push a site', 3.5);
        break;
      case 'roundEnd': {
        const name = e.winner === 'V' ? 'Vanguard' : 'Jackals';
        hud.banner(name + ' take Round ' + e.round, e.reason, 4);
        if (e.winner === 'V') sfx.roundWin();
        else sfx.roundLose();
        break;
      }
      case 'matchEnd':
        hud.showMatch(S.matchWinner, S.score.V, S.score.J);
        break;
      default:
        break;
    }
  }
  S.events.length = 0;
}

// ------------------------------------------------------------------ sim step
let shotSetupDone = false;
let lastBeepSecond = -1;

function applyShotPreset(n) {
  const p = livePlayer;
  // Shots 2–4 play live with a rifle in hand.
  if (n >= 2) {
    p.primary = 'rifle';
    p.weapon = 'rifle';
    p.mag = 30;
    p.reserve = 90;
    if (S.phase === 'buy') {
      S.phase = 'live';
      S.phaseT = ROUND_TIME;
    }
  }
  if (n === 2) {
    p.pos.x = -8;
    p.pos.z = 0;
    p.yaw = -Math.PI / 2; // face east, down mid lane
  } else if (n === 3) {
    p.pos.x = 17;
    p.pos.z = -11;
    p.yaw = Math.atan2(-(24 - 17), -(-14 + 11)); // face Site A
    // Teleport the real bomb carrier (whoever startRound picked) onto the
    // site so the plant goes through the real plant code.
    const carrier = S.agents.find((a) => a.hasBomb) || S.agents[1];
    carrier.pos.x = SITES.A.x;
    carrier.pos.z = SITES.A.z;
    carrier.path = [];
    carrier.role = 'plant';
    carrier.thinkT = 0;
    // Clear all defenders far west, out of the carrier's sight, so the
    // plant goes through the real plant code and the rotate-back fight
    // happens on camera.
    for (const a of S.agents) {
      if (a.team === 'J' && a.bot && a.alive) {
        a.pos.x = -16 + (a.id % 3) * 4;
        a.pos.z = a.id % 2 === 0 ? -8 : 8;
        a.path = [];
        a.role = 'hold';
        a.holdNode = 11;
      }
    }
  } else if (n === 4) {
    p.pos.x = 14;
    p.pos.z = 2;
    p.yaw = Math.atan2(-(24 - 14), -(14 - 2)); // face Site B over the crates
    S.smokes.push({ x: SITES.B.x, y: 1.1, z: SITES.B.z, r: 4.5, ttl: 16 });
  }
}

function autopilot() {
  const p = livePlayer;
  if (!p.alive) return;
  // Find the nearest enemy the player can see.
  let best = null;
  let bestD = Infinity;
  for (const a of S.agents) {
    if (!a.alive || a.team === p.team) continue;
    const d = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  let wantYaw;
  if (best && bestD < 45) {
    wantYaw = Math.atan2(-(best.pos.x - p.pos.x), -(best.pos.z - p.pos.z));
  } else {
    wantYaw = -Math.PI / 2; // watch east, down the map
  }
  let dyaw = wantYaw - p.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  input.mouseDX += Math.max(-500, Math.min(500, dyaw / 0.0022));
  // Hold the vantage: strafe side to side instead of walking into walls
  // and enemy fire, and crouch when an enemy is in sight.
  input.keys.delete('KeyW');
  const strafeRight = Math.floor(S.time / 1.2) % 2 === 0;
  input.keys.delete(strafeRight ? 'KeyA' : 'KeyD');
  input.keys.add(strafeRight ? 'KeyD' : 'KeyA');
  if (best && bestD < 45) input.keys.add('ControlLeft');
  else input.keys.delete('ControlLeft');
  input.firing = !!best && bestD < 45;
}

function stepSim(dt) {
  S.time += dt;
  if (SHOT_MODE && !shotSetupDone && S.time > 1.5) {
    shotSetupDone = true;
    applyShotPreset(SHOT_NUM);
  }

  if (S.phase === 'buy') {
    S.phaseT -= dt;
    // Buy phase is still movement time: walk out of spawn, shop, get set.
    updatePlayer(S, livePlayer, input, dt, blockers, hud);
    updateBots(S, dt, blockers);
    updateReloads(S, dt);
    if (S.phaseT <= 0) {
      S.phase = 'live';
      S.phaseT = TEST_MODE ? 25 : ROUND_TIME;
      hud.banner('GO — ROUND ' + S.round, 'Plant the bomb or eliminate the Jackals', 2.5);
    }
  } else if (S.phase === 'live') {
    S.phaseT -= dt;
    if (S.bomb.state === 'planted') {
      S.bomb.timer -= dt;
      const sec = Math.ceil(S.bomb.timer);
      if (sec !== lastBeepSecond) {
        lastBeepSecond = sec;
        sfx.beep();
      }
      if (S.bomb.timer <= 0) {
        // Detonation: the blast first, the verdict right after.
        S.events.push({ type: 'explode', x: S.bomb.pos.x, y: 1, z: S.bomb.pos.z });
        S.bomb.state = 'exploded';
        endRound(S, 'V', 'Bomb detonated at Site ' + S.bomb.site);
      }
    }
    if (SHOT_MODE) autopilot();
    updatePlayer(S, livePlayer, input, dt, blockers, hud);
    updateBots(S, dt, blockers);
    updateReloads(S, dt);
    updateProjectiles(S, dt, blockers);
    updateSmokes(S, dt);
    updateBombPickup(S);
    // The bomb's fate decides the round once it is planted or defused.
    if (S.bomb.state === 'defused') {
      endRound(S, 'J', 'Bomb defused at Site ' + S.bomb.site);
    } else {
      const over = checkRoundEnd(S);
      if (over) endRound(S, over.winner, over.reason);
    }
  } else if (S.phase === 'end') {
    S.phaseT -= dt;
    updateSmokes(S, dt);
    if (S.phaseT <= 0) {
      S.round++;
      startRound(S, SPAWNS);
      assignRoles(S);
      if (TEST_MODE) S.phaseT = 3;
    }
  }
  // 'match' phase: frozen until the player restarts.

  drainEvents();
  input.endTick();
}

// ------------------------------------------------------------------ render sync
let deathCam = null;

function syncRender(frameDt) {
  const p = livePlayer;
  for (const a of S.agents) {
    const m = agentMeshes.get(a.id);
    if (!m) continue;
    if (a.id === 0) {
      m.visible = false; // first person: your own body is the viewmodel
      continue;
    }
    m.visible = true;
    m.position.set(a.pos.x, a.pos.y, a.pos.z);
    m.rotation.y = a.yaw;
    if (a.alive) {
      m.rotation.z = 0;
      m.scale.y = a.crouch ? 0.72 : 1;
    } else {
      m.rotation.z = Math.PI / 2; // fallen
      m.position.y = 0.35;
      m.scale.y = 1;
    }
    const bb = m.getObjectByName('bombBox');
    if (bb) bb.visible = a.hasBomb;
  }

  // Bomb on the ground.
  if ((S.bomb.state === 'dropped' || S.bomb.state === 'planted') && S.bomb.pos) {
    bombMesh.visible = true;
    bombMesh.position.set(S.bomb.pos.x, 0.14, S.bomb.pos.z);
    bombLightMat.color.setHex(S.bomb.state === 'planted' && Math.sin(S.time * 8) > 0 ? 0xff2a1a : 0x551008);
  } else {
    bombMesh.visible = false;
  }

  // Camera: your eyes. When you die, the camera stays where you fell,
  // looking where you were looking — a death cam, not a wall-staring bot.
  if (p.alive) {
    deathCam = null;
    const eyeH = p.crouch ? 1.15 : 1.62;
    camera.position.set(p.pos.x, p.pos.y + eyeH, p.pos.z);
    camera.rotation.y = p.yaw;
    camera.rotation.x = p.pitch;
  } else {
    if (!deathCam) {
      // In shot 4 the subject is the smoke at Site B: keep the camera
      // on it even after the player falls.
      let yaw = p.yaw;
      let pitch = p.pitch;
      if (SHOT_NUM === 4) {
        yaw = Math.atan2(-(SITES.B.x - p.pos.x), -(SITES.B.z - p.pos.z));
        pitch = 0;
      }
      deathCam = { x: p.pos.x, y: p.pos.y + 1.62, z: p.pos.z, yaw, pitch };
    }
    camera.position.set(deathCam.x, deathCam.y, deathCam.z);
    camera.rotation.y = deathCam.yaw;
    camera.rotation.x = deathCam.pitch;
  }

  // Viewmodel: bob with the stride, kick with the shot.
  vmKick = Math.max(0, vmKick - frameDt * 0.4);
  const speed = Math.hypot(p.vel.x, p.vel.z);
  if (p.moving && p.alive) bobT += frameDt * speed * 1.6;
  viewmodel.position.set(
    0.26 + Math.sin(bobT * 2) * 0.006,
    -0.24 + Math.abs(Math.sin(bobT * 2)) * 0.012,
    -0.42 + vmKick,
  );
  vmGun.visible = p.weapon !== 'smoke' && p.weapon !== 'frag';
  vmNade.visible = p.weapon === 'smoke' || p.weapon === 'frag';

  effects.syncSmokes(S.smokes);
  effects.update(frameDt);
  hud.update(S, p, frameDt);
}

// ------------------------------------------------------------------ main loop
let lastT = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let frameDt = (now - lastT) / 1000;
  lastT = now;
  if (frameDt > 0.25) frameDt = 0.25;
  if (started && S.phase !== 'match') {
    acc += frameDt;
    let steps = 0;
    while (acc >= DT && steps < 5) {
      stepSim(DT);
      acc -= DT;
      steps++;
    }
    if (steps === 5) acc = 0; // spiral guard: never fall behind forever
  }
  syncRender(frameDt);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug hook for the automated playtest: state, errors, and the facts the
// test asserts (shots fired, rounds turning over).
window.__DUSTLINE = {
  get state() {
    return S;
  },
  get errors() {
    return errors;
  },
  get shots() {
    return S.shotCount;
  },
  get round() {
    return S.round;
  },
  get phase() {
    return S.phase;
  },
  get score() {
    return { V: S.score.V, J: S.score.J };
  },
};

requestAnimationFrame(frame);

