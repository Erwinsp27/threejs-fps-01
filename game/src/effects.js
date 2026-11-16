// DUSTLINE — effects: tracers, impact sparks, muzzle flash and smoke.
// Everything here is pooled: a fixed set of lines, one Points cloud and a few
// smoke spheres, reused forever. Nothing is allocated in the hot loop, so a
// firefight never makes the garbage collector stutter the frame.
import * as THREE from 'three';

const TRACER_POOL = 24;
const PARTICLE_MAX = 320;

export function createEffects(scene) {
  // --- tracers: one THREE.Line each, opacity fades to zero -------------------
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  // --- impact sparks: one Points cloud, fixed buffer -------------------------
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PARTICLE_MAX * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: 0xffc27a, size: 0.09, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < PARTICLE_MAX; i++) parts.push({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
  let partIdx = 0;

  // --- muzzle flash: one light, moved to the latest shot ---------------------
  const flash = new THREE.PointLight(0xffc27a, 0, 9, 1.6);
  scene.add(flash);
  let flashLife = 0;

  // --- smoke clouds: spheres that grow, linger, then fade --------------------
  const smokes = [];
  const smokeGeo = new THREE.SphereGeometry(1, 12, 10);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({ color: 0xcfc4b0, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    scene.add(m);
    smokes.push({ mesh: m, x: 0, y: 0, z: 0, r: 0, life: 0, maxLife: 1 });
  }

  return {
    smokes,
    spawnTracer(from, to, color) {
      const t = tracers[tracerIdx];
      tracerIdx = (tracerIdx + 1) % TRACER_POOL;
      const attr = t.line.geometry.getAttribute('position');
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      t.line.material.color.setHex(color || 0xffe9a8);
      t.line.material.opacity = 0.9;
      t.line.visible = true;
      t.life = 0.09;
    },
    spawnImpact(p, n, count) {
      for (let k = 0; k < (count || 8); k++) {
        const pt = parts[partIdx];
        partIdx = (partIdx + 1) % PARTICLE_MAX;
        pt.x = p.x; pt.y = p.y; pt.z = p.z;
        pt.vx = n.x * 2 + (Math.random() - 0.5) * 4;
        pt.vy = Math.abs(n.y) * 2 + Math.random() * 3;
        pt.vz = n.z * 2 + (Math.random() - 0.5) * 4;
        pt.life = 0.35 + Math.random() * 0.25;
      }
    },
    spawnMuzzle(p) {
      flash.position.set(p.x, p.y, p.z);
      flash.intensity = 26;
      flashLife = 0.06;
    },
    spawnSmoke(x, z, radius, duration) {
      for (const s of smokes) {
        if (s.life <= 0) {
          s.x = x; s.z = z; s.y = 1.4; s.r = radius; s.life = duration; s.maxLife = duration;
          s.mesh.visible = true;
          s.mesh.position.set(x, 1.4, z);
          s.mesh.scale.setScalar(0.4);
          return s;
        }
      }
      return null;
    },
    // Does the segment a->b pass through any live smoke cloud? Bots and the
    // player's shots use this to decide whether they can see through it.
    smokeBlocks(ax, ay, az, bx, by, bz) {
      for (const s of smokes) {
        if (s.life <= 0) continue;
        // Closest point on the segment to the smoke centre, in 3D.
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const len2 = dx * dx + dy * dy + dz * dz || 1;
        let t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + dx * t - s.x, cy = ay + dy * t - s.y, cz = az + dz * t - s.z;
        if (cx * cx + cy * cy + cz * cz < s.r * s.r) return true;
      }
      return false;
    },
    update(dt) {
      for (const t of tracers) {
        if (t.life > 0) {
          t.life -= dt;
          t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
          if (t.life <= 0) t.line.visible = false;
        }
      }
      for (let i = 0; i < PARTICLE_MAX; i++) {
        const pt = parts[i];
        if (pt.life > 0) {
          pt.life -= dt;
          pt.vy -= 9 * dt;
          pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.z += pt.vz * dt;
          if (pt.y < 0.05) { pt.y = 0.05; pt.vy *= -0.3; }
        } else {
          pt.y = -99;
        }
        pPos[i * 3] = pt.x; pPos[i * 3 + 1] = pt.y; pPos[i * 3 + 2] = pt.z;
      }
      pGeo.getAttribute('position').needsUpdate = true;
      if (flashLife > 0) {
        flashLife -= dt;
        flash.intensity = Math.max(0, flashLife / 0.06) * 26;
      } else {
        flash.intensity = 0;
      }
      for (const s of smokes) {
        if (s.life > 0) {
          s.life -= dt;
          const age = 1 - s.life / s.maxLife;
          const scale = s.r * (0.4 + 0.6 * Math.min(1, age * 3));
          s.mesh.scale.setScalar(scale);
          s.mesh.material.opacity = s.life < 2 ? 0.32 * (s.life / 2) : 0.32;
          if (s.life <= 0) s.mesh.visible = false;
        }
      }
    },
  };
}
