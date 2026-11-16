// DUSTLINE — the map: "Refinery Yard", a decommissioned solar refinery in the dunes.
// Three lanes (Pipes north, Mid, Alley south) join two bomb sites: A Refinery
// (north-east) and B Silo (south-east). Vanguard attacks from the west, Jackals
// defend from the east. This module builds the geometry, the AABB colliders the
// movement code slides on, the occluder list line-of-sight raycasts test against,
// and the waypoint graph bots route on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// One unit box, scaled per prop: one geometry, one draw call per mesh, no new
// geometry in the hot loop. Materials are shared per colour.
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
const groundGeo = new THREE.PlaneGeometry(1, 1);

function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

export function buildWorld(scene) {
  const colliders = [];   // {minX,maxX,minZ,maxZ,top} — XZ movement resolves against these
  const occluders = [];   // meshes line-of-sight raycasts test against
  const mats = {
    ground: mat(PALETTE.ground),
    groundDark: mat(PALETTE.groundDark),
    wall: mat(PALETTE.wall),
    wallDark: mat(PALETTE.wallDark),
    rust: mat(PALETTE.rust),
    metal: mat(PALETTE.metal),
    crate: mat(PALETTE.crate),
    crateDark: mat(PALETTE.crateDark),
    barrel: mat(PALETTE.barrel),
    barrelRust: mat(PALETTE.barrelRust),
    teal: mat(PALETTE.teal),
    orange: mat(PALETTE.orange),
  };

  function box(x, z, w, d, h, material, opts = {}) {
    const m = new THREE.Mesh(boxGeo, material);
    m.position.set(x, h / 2 + (opts.y || 0), z);
    m.scale.set(w, h, d);
    m.castShadow = opts.shadow !== false;
    m.receiveShadow = true;
    scene.add(m);
    if (!opts.noCollide) {
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: h + (opts.y || 0) });
    }
    if (opts.occlude !== false) occluders.push(m);
    return m;
  }

  function cyl(x, z, r, h, material, opts = {}) {
    const m = new THREE.Mesh(cylGeo, material);
    m.position.set(x, h / 2, z);
    m.scale.set(r, h, r);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    if (!opts.noCollide) {
      colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, top: h });
    }
    if (opts.occlude !== false) occluders.push(m);
    return m;
  }

  // --- ground: packed sand with worn darker patches -------------------------
  const ground = new THREE.Mesh(groundGeo, mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.scale.set(66, 48, 1);
  ground.receiveShadow = true;
  scene.add(ground);
  for (let i = 0; i < 14; i++) {
    const p = new THREE.Mesh(groundGeo, mats.groundDark);
    p.rotation.x = -Math.PI / 2;
    p.position.set(-30 + (i * 4.7) % 60, 0.01, -20 + (i * 7.3) % 40);
    p.scale.set(6 + (i % 3) * 2, 4 + (i % 2) * 2, 1);
    p.receiveShadow = true;
    scene.add(p);
  }

  // --- perimeter walls (height 4.5) -----------------------------------------
  box(0, -22.5, 66, 1, 4.5, mats.wall);
  box(0, 22.5, 66, 1, 4.5, mats.wall);
  box(-32.5, 0, 1, 46, 4.5, mats.wall);
  box(32.5, 0, 1, 46, 4.5, mats.wall);

  // --- lane dividers: two long walls with gaps that make the three lanes ----
  // Gaps: west x -14..-8, mid x 2..7. The east end stops at x=25 so the
  // defenders' lane from jSpawn to the sites stays clear of the wall tips.
  box(-23, -8, 18, 1, 3.2, mats.wallDark);
  box(-3, -8, 10, 1, 3.2, mats.wallDark);
  box(16, -8, 18, 1, 3.2, mats.wallDark);
  // South divider (z=8): same gaps
  box(-23, 8, 18, 1, 3.2, mats.wallDark);
  box(-3, 8, 10, 1, 3.2, mats.wallDark);
  box(16, 8, 18, 1, 3.2, mats.wallDark);
  // Mid blocker east, offset north of the lane centre: it still gives cover,
  // but the z=0 sightline down mid stays open so the mid duel actually
  // happens instead of both sides holding behind it until the timer dies.
  box(12, 5, 1, 6, 3.2, mats.wallDark);

  // --- mid-lane cover --------------------------------------------------------
  box(-14, -3.5, 2.4, 2.4, 1.2, mats.crate);
  box(-14, -3.5, 1.2, 1.2, 1.2, mats.crateDark, { y: 1.2 });
  box(-2, -2, 2.4, 2.4, 1.2, mats.crate);
  box(6, 3, 1.6, 1.6, 1.2, mats.crateDark);
  cyl(-6, 4, 0.7, 1.1, mats.barrel);
  cyl(-5, 4.6, 0.7, 1.1, mats.barrelRust);

  // --- north lane (Pipes): pipe racks + crates -------------------------------
  box(-24, -16, 8, 1.2, 1.4, mats.rust);
  cyl(-10, -17, 0.5, 6, mats.metal, { noCollide: true });
  cyl(4, -17.5, 0.5, 6, mats.metal, { noCollide: true });
  box(12, -18, 2.4, 2.4, 1.2, mats.crate);
  box(20, -18, 1.6, 1.6, 1.2, mats.crateDark);

  // --- south lane (Alley): barrels + crates ----------------------------------
  cyl(-24, 16, 0.7, 1.1, mats.barrelRust);
  cyl(-22.6, 16.8, 0.7, 1.1, mats.barrel);
  box(-8, 18, 2.4, 2.4, 1.2, mats.crate);
  box(4, 17, 1.6, 1.6, 1.2, mats.crateDark);
  box(14, 18, 2.4, 2.4, 1.2, mats.crate);

  // --- site A: Refinery (north-east) — tanks, pipes, crates ------------------
  cyl(23, -17, 2.4, 4.2, mats.rust);
  cyl(27, -13, 2.0, 3.4, mats.metal);
  cyl(19, -19, 1.4, 2.6, mats.barrel);
  box(24, -10, 2.4, 2.4, 1.2, mats.crate);
  box(27, -18, 1.6, 1.6, 1.2, mats.crateDark);
  box(19, -11, 6, 0.3, 0.15, mats.teal, { noCollide: true, occlude: false, shadow: false, y: 0.02 });

  // --- site B: Silo (south-east) — one big silo, drums, crates ---------------
  cyl(27, 17, 3.0, 6.5, mats.metal);
  cyl(28, 11, 1.0, 1.1, mats.barrelRust);
  cyl(28, 18.5, 1.0, 1.1, mats.barrel);
  box(19, 10, 2.4, 2.4, 1.2, mats.crate);
  box(19, 18, 1.6, 1.6, 1.2, mats.crateDark);
  box(20, 15, 6, 0.3, 0.15, mats.orange, { noCollide: true, occlude: false, shadow: false, y: 0.02 });

  // --- spawn cover: kept clear of the exit lanes so nobody spawns stuck -------
  box(-30, -7, 1.6, 1.6, 1.2, mats.crateDark);
  box(-30, 7, 1.6, 1.6, 1.2, mats.crate);
  box(30.5, -6, 1.6, 1.6, 1.2, mats.crateDark);
  box(30.5, 6, 1.6, 1.6, 1.2, mats.crate);

  // --- distant skyline silhouettes outside the walls (no collision) ----------
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Mesh(boxGeo, mats.wallDark);
    const side = i % 2 === 0 ? -1 : 1;
    s.position.set(-40 + i * 9, 3 + (i % 3), side * 30);
    s.scale.set(6, 6 + (i % 4) * 2, 4);
    scene.add(s);
  }

  // --- waypoints: nodes the bots route on (BFS over these edges) ------------
  // x west(-) to east(+), z north(-) to south(+). Sites A north-east, B south-east.
  // Every edge's straight segment was checked against the colliders: the lane
  // dividers (z=+-8) are crossed ONLY at the gap waypoints gNW/gSW (west gap,
  // x -14..-8) and gNE/gSE (mid gap, x 2..7), and no edge passes through a
  // crate. Bots that strafe in combat can still brush a collider; the
  // axis-separated collision resolution lets them slide around it.
  const wp = {
    vSpawn: [-28, 0], vN: [-22, -14], vM: [-20, 0], vS: [-22, 14],
    nW: [-12, -14], nE: [8, -14], sW: [-12, 14], sE: [8, 14],
    mW: [-8, 0], mC: [0, 0], mE: [10, 0], mE2: [14, 0],
    gNW: [-11, -8], gSW: [-11, 8], gNE: [4.5, -8], gSE: [4.5, 8],
    aIn: [14, -12], aSite: [19, -11], aHold: [26, -9],
    bIn: [14, 12], bSite: [20, 15], bHold: [26, 9],
    jSpawn: [28, 0], jA: [27, -10], jB: [27, 10], jMid: [16, 0],
  };
  const edges = [
    ['vSpawn', 'vM'],
    ['vM', 'mW'],
    ['vN', 'nW'], ['nW', 'nE'], ['nE', 'aIn'], ['aIn', 'aSite'], ['aSite', 'aHold'],
    ['vS', 'sW'], ['sW', 'sE'], ['sE', 'bIn'], ['bIn', 'bSite'], ['bSite', 'bHold'],
    ['mW', 'mC'], ['mC', 'mE'], ['mE', 'mE2'],
    ['mE2', 'jMid'],
    ['mW', 'gNW'], ['gNW', 'nW'], ['mW', 'gSW'], ['gSW', 'sW'],
    ['mC', 'gNE'], ['gNE', 'nE'], ['mC', 'gSE'], ['gSE', 'sE'],
    ['jSpawn', 'jA'], ['jSpawn', 'jB'], ['jSpawn', 'jMid'],
    ['jA', 'aSite'], ['jB', 'bSite'],
    ['aHold', 'jSpawn'], ['bHold', 'jSpawn'],
  ];
  const adj = {};
  for (const id of Object.keys(wp)) adj[id] = [];
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }

  return {
    colliders, occluders,
    waypoints: wp, adj,
    bounds: { minX: -32, maxX: 32, minZ: -22, maxZ: 22 },
    spawns: {
      vanguard: [[-29, -4], [-29, -1.5], [-29, 1.5], [-29, 4], [-27, 0]],
      jackals: [[29, -4], [29, -1.5], [29, 1.5], [29, 4], [27, 0]],
    },
    sites: {
      A: { x: 19, z: -11, r: 4.5, name: 'REFINERY' },
      B: { x: 20, z: 15, r: 4.5, name: 'SILO' },
    },
  };
}

// Breadth-first route between waypoint ids. Static graph, so a route is cheap.
export function findRoute(adj, from, to) {
  if (from === to) return [to];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of adj[cur] || []) {
      if (!(next in prev)) {
        prev[next] = cur;
        if (next === to) {
          const path = [to];
          let p = cur;
          while (p !== null) { path.unshift(p); p = prev[p]; }
          return path;
        }
        queue.push(next);
      }
    }
  }
  return [to];
}

// Nearest waypoint id to an (x, z) position.
export function nearestWaypoint(wp, x, z) {
  let best = null, bestD = Infinity;
  for (const [id, p] of Object.entries(wp)) {
    const dx = p[0] - x, dz = p[1] - z, d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}
