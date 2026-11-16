// world.js — Refinery Yard, the map. 64 x 44 metres, three lanes, two
// bomb sites: Site A Refinery in the north-east, Site B Silo in the
// south-east. Vanguard spawns west and attacks; Jackals spawn east.
// The map is data first (BOXES, WAYPOINTS, EDGES) and meshes second, so the
// simulation, the bots and the renderer all agree on one layout.

export const MAP_W = 64;
export const MAP_D = 44;
export const HALF_W = MAP_W / 2;
export const HALF_D = MAP_D / 2;

// Bomb sites: centre, radius the planter must stand inside.
export const SITES = {
  A: { name: 'Refinery', x: 24, z: -14, r: 5 },
  B: { name: 'Silo', x: 24, z: 14, r: 5 },
};

// Spawns: five slots a side, with the yaw the agent faces at round start.
export const SPAWNS = {
  V: [
    { x: -28, z: -6, yaw: -Math.PI / 2 },
    { x: -28, z: -2, yaw: -Math.PI / 2 },
    { x: -28, z: 2, yaw: -Math.PI / 2 },
    { x: -28, z: 6, yaw: -Math.PI / 2 },
    { x: -26, z: 0, yaw: -Math.PI / 2 },
  ],
  J: [
    { x: 28, z: -6, yaw: Math.PI / 2 },
    { x: 28, z: -2, yaw: Math.PI / 2 },
    { x: 28, z: 2, yaw: Math.PI / 2 },
    { x: 28, z: 6, yaw: Math.PI / 2 },
    { x: 26, z: 0, yaw: Math.PI / 2 },
  ],
};

// Interior cover. Each box is {x, z, w, d, h} in metres, centred. The
// perimeter wall is added separately in buildWorld; everything here blocks
// movement and line of sight up to its height h.
export const BOXES = [
  // Top-lane walls
  { x: -16, z: -10, w: 8, d: 1, h: 3.0 },
  { x: 0, z: -14, w: 4, d: 1, h: 3.0 },
  { x: 12, z: -12, w: 1, d: 6, h: 2.6 },
  // Bottom-lane walls (mirrored)
  { x: -16, z: 10, w: 8, d: 1, h: 3.0 },
  { x: 0, z: 14, w: 4, d: 1, h: 3.0 },
  { x: 12, z: 12, w: 1, d: 6, h: 2.6 },
  // Mid dividers with a gap to rotate through
  { x: 8, z: -7, w: 1, d: 5, h: 3.0 },
  { x: 8, z: 7, w: 1, d: 5, h: 3.0 },
  { x: -24, z: 0, w: 1, d: 6, h: 2.5 },
  // Crates: low cover you can shoot over while standing
  { x: -8, z: -16, w: 2, d: 2, h: 1.2 },
  { x: -8, z: 16, w: 2, d: 2, h: 1.2 },
  { x: -4, z: -4, w: 2.4, d: 1.4, h: 1.2 },
  { x: -4, z: 4, w: 2.4, d: 1.4, h: 1.2 },
  { x: 4, z: -2, w: 1.6, d: 1.6, h: 1.1 },
  { x: 4, z: 2, w: 1.6, d: 1.6, h: 1.1 },
  { x: 16, z: -18, w: 3, d: 1.6, h: 1.2 },
  { x: 16, z: 18, w: 3, d: 1.6, h: 1.2 },
  { x: 20, z: -8, w: 2, d: 2, h: 1.2 },
  { x: 20, z: 8, w: 2, d: 2, h: 1.2 },
  // Site cover
  { x: 24, z: -18, w: 4, d: 1, h: 2.8 },
  { x: 24, z: 18, w: 4, d: 1, h: 2.8 },
  { x: 28, z: -14, w: 1, d: 4, h: 2.8 },
  { x: 28, z: 14, w: 1, d: 4, h: 2.8 },
];

// Waypoints the bots navigate on. Lanes run west-east; cross links let bots
// rotate between lanes at mid.
export const WAYPOINTS = [
  { x: -28, z: 0 }, // 0  V spawn
  { x: -24, z: -8 }, // 1
  { x: -24, z: 8 }, // 2
  { x: -20, z: 0 }, // 3
  { x: -16, z: -16 }, // 4  top lane
  { x: -16, z: 16 }, // 5  bottom lane
  { x: -12, z: 0 }, // 6
  { x: -8, z: -8 }, // 7
  { x: -8, z: 8 }, // 8
  { x: -4, z: -16 }, // 9
  { x: -4, z: 16 }, // 10
  { x: 0, z: 0 }, // 11 mid
  { x: 4, z: -10 }, // 12
  { x: 4, z: 10 }, // 13
  { x: 8, z: -16 }, // 14
  { x: 8, z: 16 }, // 15
  { x: 12, z: 0 }, // 16
  { x: 16, z: -12 }, // 17
  { x: 16, z: 12 }, // 18
  { x: 20, z: -16 }, // 19 A approach
  { x: 20, z: 16 }, // 20 B approach
  { x: 24, z: -14 }, // 21 Site A
  { x: 24, z: 14 }, // 22 Site B
  { x: 28, z: 0 }, // 23 J spawn
  { x: 12, z: -16 }, // 24
  { x: 12, z: 16 }, // 25
  { x: -28, z: -14 }, // 26 V top
  { x: -28, z: 14 }, // 27 V bottom
  { x: 20, z: 0 }, // 28 mid-east
];

export const EDGES = [
  [0, 3], [0, 26], [0, 27], [26, 1], [27, 2], [1, 3], [2, 3],
  [1, 4], [2, 5], [26, 4], [27, 5], [4, 9], [5, 10], [4, 7], [5, 8],
  [3, 6], [6, 11], [7, 6], [8, 6], [7, 9], [8, 10], [9, 12], [10, 13],
  [9, 14], [10, 15], [12, 11], [13, 11], [12, 14], [13, 15], [14, 24],
  [15, 25], [24, 17], [25, 18], [11, 16], [16, 28], [17, 16], [18, 16],
  [17, 19], [18, 20], [19, 21], [20, 22], [24, 19], [25, 20],
  [28, 23], [19, 28], [20, 28], [21, 23], [22, 23], [14, 17], [15, 18],
];

// Adjacency list, built once from EDGES.
const ADJ = WAYPOINTS.map(() => []);
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}

export function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i].x - x;
    const dz = WAYPOINTS[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Breadth-first search over the waypoint graph. Returns a list of node
// indices from `from` to `to`, inclusive, or [] when unreachable.
export function findPath(from, to) {
  if (from === to) return [from];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of ADJ[cur]) {
      if (prev[nb] !== -1) continue;
      prev[nb] = cur;
      if (nb === to) {
        const path = [to];
        let n = to;
        while (n !== from) {
          n = prev[n];
          path.unshift(n);
        }
        return path;
      }
      queue.push(nb);
    }
  }
  return [];
}

// Colliders as min/max boxes, derived from BOXES plus the perimeter wall.
export function buildColliders() {
  const out = [];
  for (const b of BOXES) {
    out.push({
      x0: b.x - b.w / 2, x1: b.x + b.w / 2,
      z0: b.z - b.d / 2, z1: b.z + b.d / 2,
      h: b.h,
    });
  }
  const t = 1; // perimeter wall thickness
  out.push({ x0: -HALF_W - t, x1: -HALF_W, z0: -HALF_D - t, z1: HALF_D + t, h: 4 });
  out.push({ x0: HALF_W, x1: HALF_W + t, z0: -HALF_D - t, z1: HALF_D + t, h: 4 });
  out.push({ x0: -HALF_W, x1: HALF_W, z0: -HALF_D - t, z1: -HALF_D, h: 4 });
  out.push({ x0: -HALF_W, x1: HALF_W, z0: HALF_D, z1: HALF_D + t, h: 4 });
  return out;
}

// Move a circle (radius r, feet at pos.y) by (dx, dz), sliding along boxes.
// Mutates pos. Axis-separated so agents slide along walls instead of sticking.
export function collideMove(pos, r, dx, dz, colliders) {
  pos.x += dx;
  for (const c of colliders) {
    if (pos.y + 1.7 < 0 || pos.y > c.h) continue;
    if (pos.x + r > c.x0 && pos.x - r < c.x1 && pos.z + r > c.z0 && pos.z - r < c.z1) {
      if (dx > 0) pos.x = c.x0 - r;
      else if (dx < 0) pos.x = c.x1 + r;
    }
  }
  pos.z += dz;
  for (const c of colliders) {
    if (pos.y + 1.7 < 0 || pos.y > c.h) continue;
    if (pos.x + r > c.x0 && pos.x - r < c.x1 && pos.z + r > c.z0 && pos.z - r < c.z1) {
      if (dz > 0) pos.z = c.z0 - r;
      else if (dz < 0) pos.z = c.z1 + r;
    }
  }
  // Hard clamp inside the yard.
  pos.x = Math.max(-HALF_W + r, Math.min(HALF_W - r, pos.x));
  pos.z = Math.max(-HALF_D + r, Math.min(HALF_D - r, pos.z));
}

// 3D segment vs AABB slab test. True when the segment hits any blocker.
export function segmentBlocked(ax, ay, az, bx, by, bz, blockers) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  for (const c of blockers) {
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    const mins = [c.x0, 0, c.z0];
    const maxs = [c.x1, c.h, c.z1];
    const o = [ax, ay, az];
    const d = [dx, dy, dz];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < mins[i] || o[i] > maxs[i]) {
          ok = false;
          break;
        }
      } else {
        let ta = (mins[i] - o[i]) / d[i];
        let tb = (maxs[i] - o[i]) / d[i];
        if (ta > tb) {
          const tmp = ta;
          ta = tb;
          tb = tmp;
        }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) {
          ok = false;
          break;
        }
      }
    }
    if (ok && t1 >= 0 && t0 <= 1) return true;
  }
  return false;
}

// Ray vs AABB, returns the distance along the ray or Infinity.
export function rayBox(ox, oy, oz, dx, dy, dz, c) {
  let t0 = 0;
  let t1 = Infinity;
  const mins = [c.x0, 0, c.z0];
  const maxs = [c.x1, c.h, c.z1];
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mins[i] || o[i] > maxs[i]) return Infinity;
    } else {
      let ta = (mins[i] - o[i]) / d[i];
      let tb = (maxs[i] - o[i]) / d[i];
      if (ta > tb) {
        const tmp = ta;
        ta = tb;
        tb = tmp;
      }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return Infinity;
    }
  }
  return t0;
}

export function pointInSite(siteKey, x, z) {
  const s = SITES[siteKey];
  const dx = x - s.x;
  const dz = z - s.z;
  return dx * dx + dz * dz <= s.r * s.r;
}

// Build the visible yard. Returns { group, colliders, blockers }.
export function buildWorld(THREE, C) {
  const group = new THREE.Group();
  const colliders = buildColliders();

  const mat = (color, rough = 0.95) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
  const groundMat = mat(C.ground);
  const concreteMat = mat(C.concrete);
  const concreteDarkMat = mat(C.concreteDark);
  const rustMat = mat(C.rust, 0.8);
  const steelMat = mat(C.steel, 0.6);
  const tealMat = mat(C.teal, 0.7);
  const hazardMat = mat(C.hazard, 0.85);
  const crateMat = mat(C.crate, 0.9);

  // Ground: one big slab plus a darker mid strip and lane markings.
  const ground = new THREE.Mesh(new THREE.BoxGeometry(MAP_W + 2, 0.2, MAP_D + 2), groundMat);
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  group.add(ground);
  const midStrip = new THREE.Mesh(new THREE.BoxGeometry(MAP_W, 0.04, 6), mat(C.groundDark));
  midStrip.position.y = 0.02;
  group.add(midStrip);

  // Perimeter walls.
  const wallH = 4;
  const wallT = 1;
  const mkWall = (w, d, x, z, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), m || concreteMat);
    mesh.position.set(x, wallH / 2, z);
    group.add(mesh);
  };
  mkWall(MAP_W + 2 * wallT, wallT, 0, -HALF_D - wallT / 2);
  mkWall(MAP_W + 2 * wallT, wallT, 0, HALF_D + wallT / 2);
  mkWall(wallT, MAP_D, -HALF_W - wallT / 2, 0);
  mkWall(wallT, MAP_D, HALF_W + wallT / 2, 0);

  // Interior boxes: tall walls in concrete, low crates in wood tones.
  for (const b of BOXES) {
    const tall = b.h > 1.5;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.h, b.d),
      tall ? (b.x > 18 ? tealMat : concreteDarkMat) : crateMat,
    );
    mesh.position.set(b.x, b.h / 2, b.z);
    group.add(mesh);
    if (!tall) {
      // A hazard stripe on top of every crate so cover reads at a glance.
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.06, b.d * 0.3), hazardMat);
      stripe.position.set(b.x, b.h + 0.03, b.z);
      group.add(stripe);
    }
  }

  // Site A Refinery: rust tanks and a pipe gantry.
  const tankA = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 5, 18), mat(C.tankA, 0.75));
  tankA.position.set(27, 2.5, -18);
  group.add(tankA);
  const tankA2 = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 4, 18), mat(C.tankB, 0.75));
  tankA2.position.set(28.5, 2, -10);
  group.add(tankA2);
  const gantry = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 0.5), steelMat);
  gantry.position.set(25, 4.4, -16);
  group.add(gantry);

  // Site B Silo: tall teal silos.
  for (let i = 0; i < 3; i++) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 7, 16), tealMat);
    silo.position.set(27.5, 3.5, 10 + i * 3.4);
    group.add(silo);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.2, 16), rustMat);
    cap.position.set(27.5, 7.6, 10 + i * 3.4);
    group.add(cap);
  }

  // Pipes along the north wall and a few barrels for silhouette.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, MAP_W, 10), mat(C.pipe, 0.5));
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0, 3.6, -HALF_D + 0.8);
  group.add(pipe);
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12);
  const barrelSpots = [[-20, -18], [-19, -17], [10, -19], [22, 4], [-12, 19]];
  for (const [bx, bz] of barrelSpots) {
    const barrel = new THREE.Mesh(barrelGeo, Math.random() > 0.5 ? rustMat : steelMat);
    barrel.position.set(bx, 0.55, bz);
    group.add(barrel);
  }

  // Site markers: flat glowing rings on the ground so the objective reads.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.35, s.r, 40),
      new THREE.MeshBasicMaterial({ color: C.hazard, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.05, s.z);
    group.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color: C.hazard, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(s.x, 0.05, s.z);
    group.add(disc);
  }

  // Spawn pads.
  for (const team of ['V', 'J']) {
    for (const sp of SPAWNS[team]) {
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(0.8, 16),
        new THREE.MeshBasicMaterial({
          color: team === 'V' ? C.vanguard : C.jackals,
          transparent: true, opacity: 0.3, side: THREE.DoubleSide,
        }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(sp.x, 0.04, sp.z);
      group.add(pad);
    }
  }

  return { group, colliders, blockers: colliders };
}
