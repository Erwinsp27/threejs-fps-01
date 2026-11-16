// effects.js — pooled visual effects. Nothing is allocated per frame in
// the hot loop: tracers, impacts and muzzle flashes come from fixed pools,
// and smoke clouds are meshes reused from a pool synced to the sim.

const TRACER_POOL = 28;
const IMPACT_POOL = 24;
const TRACER_LIFE = 0.07;
const IMPACT_LIFE = 0.35;

export function createEffects(THREE, scene, C) {
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, mat, life: 0 });
  }
  let tracerIdx = 0;

  const impacts = [];
  const impactGeo = new THREE.SphereGeometry(0.09, 6, 5);
  for (let i = 0; i < IMPACT_POOL; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(impactGeo, mat);
    scene.add(mesh);
    impacts.push({ mesh, mat, life: 0, vy: 0 });
  }
  let impactIdx = 0;

  // Muzzle flash: one small additive sprite at the gun's barrel.
  const flashMat = new THREE.SpriteMaterial({
    color: C.muzzle, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(0.5, 0.5, 1);
  scene.add(flash);
  let flashLife = 0;

  // Explosion flash: an expanding additive sphere plus a point light.
  const boomGeo = new THREE.SphereGeometry(1, 12, 10);
  const boomMat = new THREE.MeshBasicMaterial({
    color: 0xff9a3c, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const boom = new THREE.Mesh(boomGeo, boomMat);
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff8a30, 0, 30);
  scene.add(boomLight);
  let boomLife = 0;
  let boomPos = { x: 0, y: 0, z: 0 };

  // Smoke clouds: one translucent sphere per live cloud, pooled.
  const smokePool = [];
  const smokeGeo = new THREE.SphereGeometry(1, 14, 10);
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: C.smoke, transparent: true, opacity: 0, depthWrite: false,
    });
    const mesh = new THREE.Mesh(smokeGeo, mat);
    scene.add(mesh);
    smokePool.push({ mesh, mat, used: false });
  }

  function spawnTracer(x0, y0, z0, x1, y1, z1, color) {
    const t = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % TRACER_POOL;
    const pos = t.line.geometry.attributes.position.array;
    pos[0] = x0;
    pos[1] = y0;
    pos[2] = z0;
    pos[3] = x1;
    pos[4] = y1;
    pos[5] = z1;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.mat.color.setHex(color);
    t.mat.opacity = 0.9;
    t.life = TRACER_LIFE;
  }

  function spawnImpact(x, y, z) {
    const p = impacts[impactIdx];
    impactIdx = (impactIdx + 1) % IMPACT_POOL;
    p.mesh.position.set(x, y, z);
    p.mat.opacity = 0.95;
    p.life = IMPACT_LIFE;
    p.vy = 0.8;
  }

  function spawnMuzzle(x, y, z) {
    flash.position.set(x, y, z);
    flashMat.opacity = 0.95;
    flashLife = 0.05;
  }

  function spawnExplosion(x, y, z) {
    boomPos = { x, y, z };
    boom.position.set(x, y, z);
    boomLight.position.set(x, y + 1, z);
    boomLife = 0.5;
  }

  function syncSmokes(smokes) {
    for (let i = 0; i < smokePool.length; i++) {
      const slot = smokePool[i];
      const s = smokes[i];
      if (s) {
        slot.used = true;
        slot.mesh.visible = true;
        slot.mesh.position.set(s.x, s.y, s.z);
        // The cloud breathes: it grows slightly as it ages.
        const grow = 1 + (1 - s.ttl / 16) * 0.25;
        slot.mesh.scale.set(s.r * grow, s.r * 0.75 * grow, s.r * grow);
        slot.mat.opacity = Math.min(0.62, s.ttl * 0.2 + 0.35);
      } else {
        slot.used = false;
        slot.mesh.visible = false;
        slot.mat.opacity = 0;
      }
    }
  }

  function update(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mat.opacity = Math.max(0, (t.life / TRACER_LIFE) * 0.9);
      }
    }
    for (const p of impacts) {
      if (p.life > 0) {
        p.life -= dt;
        p.mesh.position.y += p.vy * dt;
        p.vy -= 3 * dt;
        p.mat.opacity = Math.max(0, (p.life / IMPACT_LIFE) * 0.95);
      }
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flashMat.opacity = Math.max(0, flashLife / 0.05) * 0.95;
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const k = 1 - boomLife / 0.5;
      boom.scale.setScalar(1 + k * 6);
      boomMat.opacity = Math.max(0, (boomLife / 0.5) * 0.55);
      boomLight.intensity = Math.max(0, (boomLife / 0.5) * 60);
    } else {
      boomMat.opacity = 0;
      boomLight.intensity = 0;
    }
  }

  return { spawnTracer, spawnImpact, spawnMuzzle, spawnExplosion, syncSmokes, update };
}
