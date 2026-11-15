// Combat: hitscan shots, body-part damage, grenades and tracers. One raycaster
// and a handful of preallocated vectors serve every shot; nothing is allocated
// in the hot loop. A head shot multiplies damage by the weapon's headMult; a
// torso shot deals base damage; limbs deal 70%.
import * as THREE from 'three';

const HEAD_MULT_FALLBACK = 3;
const LIMB_MULT = 0.7;
const GRENADE_FUSE = 1.2;
const GRENADE_RADIUS = 6;
const GRENADE_MAX_DAMAGE = 120;
const TRACER_LIFE = 0.05;

export function createCombat(scene, world, hooks) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const grenades = [];
  const tracers = [];
  const grenadeGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2c323a, roughness: 0.6, metalness: 0.4 });
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.7 });

  // A shot from `from` along `dir`: the nearest hit wins, wall or body.
  // Returns { entity, part, point, distance } or null.
  function raycastShot(from, dir, shootables, hitMeshes) {
    origin.copy(from);
    direction.copy(dir).normalize();
    raycaster.set(origin, direction);
    const wallHits = raycaster.intersectObjects(shootables, false);
    const wallDist = wallHits.length ? wallHits[0].distance : Infinity;
    const bodyHits = raycaster.intersectObjects(hitMeshes, false);
    if (!bodyHits.length || bodyHits[0].distance > wallDist) {
      return wallHits.length ? { entity: null, part: 'wall', point: wallHits[0].point.clone(), distance: wallDist } : null;
    }
    const hit = bodyHits[0];
    return { entity: hit.object.userData.entity, part: hit.object.userData.part || 'torso', point: hit.point.clone(), distance: hit.distance };
  }

  // Ray vs the player: two spheres (head, torso) against the ray, nearest wins.
  // Bots aim through this; the player's own shots use raycastShot on bot meshes.
  const headCenter = new THREE.Vector3();
  const torsoCenter = new THREE.Vector3();
  const toCenter = new THREE.Vector3();
  function raySphere(from, dir, center, radius, maxDist) {
    toCenter.copy(center).sub(from);
    const tca = toCenter.dot(dir);
    if (tca < 0) return null;
    const d2 = toCenter.lengthSq() - tca * tca;
    if (d2 > radius * radius) return null;
    const t = tca - Math.sqrt(radius * radius - d2);
    if (t < 0 || t > maxDist) return null;
    return t;
  }
  function rayHitsPlayer(from, dir, player, maxDist) {
    headCenter.set(player.position.x, player.position.y + 1.55, player.position.z);
    torsoCenter.set(player.position.x, player.position.y + 0.95, player.position.z);
    const headT = raySphere(from, dir, headCenter, 0.17, maxDist);
    const bodyT = raySphere(from, dir, torsoCenter, 0.42, maxDist);
    if (headT !== null && (bodyT === null || headT < bodyT)) return { part: 'head', distance: headT };
    if (bodyT !== null) return { part: 'torso', distance: bodyT };
    return null;
  }
  // Does a ray from `from` toward `to` reach the target without a wall in
  // between? Used for bot vision (line of sight).
  function hasLineOfSight(from, to) {
    direction.copy(to).sub(from);
    const dist = direction.length();
    if (dist < 0.01) return true;
    direction.divideScalar(dist);
    raycaster.set(from, direction);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    raycaster.far = 90;
    return !hit;
  }

  function applyDamage(target, amount, part, attacker, time) {
    if (!target || !target.alive) return false;
    const mult = part === 'head' ? (attacker && attacker.headMult ? attacker.headMult : HEAD_MULT_FALLBACK) : part === 'limb' ? LIMB_MULT : 1;
    target.health -= amount * mult;
    if (target.health > 0) {
      if (hooks.onDamaged) hooks.onDamaged(target, attacker, part, time);
      return false;
    }
    target.health = 0;
    target.alive = false;
    if (hooks.onKill) hooks.onKill(target, attacker, part, time);
    return true;
  }

  function spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, tracerMat);
    scene.add(line);
    tracers.push({ line, life: TRACER_LIFE });
    if (tracers.length > 24) {
      const old = tracers.shift();
      scene.remove(old.line);
      old.line.geometry.dispose();
    }
  }

  function throwGrenade(from, dir, thrower) {
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.position.copy(from);
    mesh.castShadow = true;
    scene.add(mesh);
    const velocity = dir.clone().multiplyScalar(11);
    velocity.y += 3.5;
    grenades.push({ mesh, velocity, fuse: GRENADE_FUSE, thrower, bounced: 0 });
  }

  function stepGrenades(dt, entities, time) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.velocity.y -= 14 * dt;
      const next = g.mesh.position.clone().addScaledVector(g.velocity, dt);
      if (next.y <= 0.09) {
        next.y = 0.09;
        g.velocity.y = Math.abs(g.velocity.y) * 0.35;
        g.velocity.x *= 0.6;
        g.velocity.z *= 0.6;
        g.bounced += 1;
      }
      // Walls: stop horizontal motion on the map bounds and big cover.
      if (Math.abs(next.x) > 31.5) { next.x = Math.sign(next.x) * 31.5; g.velocity.x *= -0.4; }
      if (Math.abs(next.z) > 21.5) { next.z = Math.sign(next.z) * 21.5; g.velocity.z *= -0.4; }
      g.mesh.position.copy(next);
      if (g.fuse <= 0) {
        scene.remove(g.mesh);
        grenades.splice(i, 1);
        if (hooks.onExplosion) hooks.onExplosion(g.mesh.position, GRENADE_RADIUS, time);
        for (const entity of entities) {
          if (!entity.alive) continue;
          const d = entity.position.distanceTo(g.mesh.position);
          if (d > GRENADE_RADIUS) continue;
          const falloff = 1 - d / (GRENADE_RADIUS * 1.4);
          applyDamage(entity, GRENADE_MAX_DAMAGE * Math.max(0.15, falloff), 'torso', { headMult: 1, name: g.thrower.name, team: g.thrower.team, id: g.thrower.id }, time);
        }
      }
    }
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers.splice(i, 1);
      }
    }
  }

  function reset() {
    for (const g of grenades) scene.remove(g.mesh);
    grenades.length = 0;
    for (const t of tracers) {
      scene.remove(t.line);
      t.line.geometry.dispose();
    }
    tracers.length = 0;
  }

  return { raycastShot, rayHitsPlayer, hasLineOfSight, applyDamage, spawnTracer, throwGrenade, stepGrenades, reset };
}
