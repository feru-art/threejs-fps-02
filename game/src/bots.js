// Bots: nine of them, four beside the player and five against. Each bot has
// a plan (a route to a site, or a hold), eyes (a vision cone plus a
// line-of-sight ray, checked on a stagger so nine bots never raycast on the
// same step), ears (the audio hearing bus) and a trigger finger (bursts with
// distance-scaled error, strafing while engaged). They plant and defuse by
// holding still, call out what they see on the radio, and ping the minimap
// when they spot an enemy. After the bomb is planted, attackers fall back
// to crossfire holds around the site. Bots climb the walkway: their height
// follows world.groundHeight, so a bot on the gantry fights from 2.6 m up.
import * as THREE from 'three';
import { PALETTE, TEAM_COLOR } from './palette.js';
import { pick, range } from './rng.js';
import { groundHeight } from './world.js';

const BOT_NAMES = {
  atk: ['HALO', 'JUNO', 'KODIAK', 'LYRA'],
  def: ['ORION', 'SABLE', 'TUNDRA', 'VEGA', 'WOLF'],
};
const WALK_SPEED = 4.2;
const VISION_RANGE = 42;
const VISION_HALF_ANGLE = 0.9;
const LOSE_TARGET_SECONDS = 3;
const BURST_MIN = 3;
const BURST_MAX = 5;

export function createBots(scene, world, nav, combat, audio, state, random, radio) {
  const torsoGeo = new THREE.BoxGeometry(0.5, 0.72, 0.28);
  const headGeo = new THREE.SphereGeometry(0.15, 12, 10);
  const helmetGeo = new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const legGeo = new THREE.BoxGeometry(0.18, 0.72, 0.2);
  const armGeo = new THREE.BoxGeometry(0.12, 0.6, 0.14);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const packGeo = new THREE.BoxGeometry(0.36, 0.44, 0.16);
  const bandGeo = new THREE.BoxGeometry(0.52, 0.12, 0.3);
  const visorGeo = new THREE.BoxGeometry(0.2, 0.06, 0.04);
  const materials = {
    atk: new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a3423'), roughness: 0.85 }),
    def: new THREE.MeshStandardMaterial({ color: new THREE.Color('#22333f'), roughness: 0.85 }),
    head: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.muted), roughness: 0.7 }),
    helmet: new THREE.MeshStandardMaterial({ color: new THREE.Color('#39424c'), roughness: 0.5, metalness: 0.4 }),
    gun: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.3 }),
    pack: new THREE.MeshStandardMaterial({ color: new THREE.Color('#2f3a2a'), roughness: 0.9 }),
    visor: new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fd8ff') }),
  };
  const bandMats = {
    atk: new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM_COLOR.atk) }),
    def: new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM_COLOR.def) }),
  };

  const list = [];
  const hitMeshes = [];
  const eye = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const moveDir = new THREE.Vector3();
  const chest = new THREE.Vector3();

  function buildBot(team, index, name) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, materials[team]);
    torso.position.y = 1.08;
    torso.castShadow = true;
    const head = new THREE.Mesh(headGeo, materials.head);
    head.position.y = 1.62;
    head.castShadow = true;
    const helmet = new THREE.Mesh(helmetGeo, materials.helmet);
    helmet.position.y = 1.66;
    const visor = new THREE.Mesh(visorGeo, materials.visor);
    visor.position.set(0, 1.62, -0.14);
    const legL = new THREE.Mesh(legGeo, materials[team]);
    legL.position.set(-0.13, 0.36, 0);
    const legR = new THREE.Mesh(legGeo, materials[team]);
    legR.position.set(0.13, 0.36, 0);
    const armL = new THREE.Mesh(armGeo, materials[team]);
    armL.position.set(-0.32, 1.1, -0.05);
    const armR = new THREE.Mesh(armGeo, materials[team]);
    armR.position.set(0.32, 1.1, -0.05);
    const gun = new THREE.Mesh(gunGeo, materials.gun);
    gun.position.set(0.18, 1.15, -0.3);
    const pack = new THREE.Mesh(packGeo, materials.pack);
    pack.position.set(0, 1.12, 0.22);
    const band = new THREE.Mesh(bandGeo, bandMats[team]);
    band.position.y = 1.32;
    group.add(torso, head, helmet, visor, legL, legR, armL, armR, gun, pack, band);
    scene.add(group);
    const bot = {
      id: `bot-${team}-${index}`,
      name,
      kind: 'bot',
      team,
      health: 100,
      armour: 0,
      alive: true,
      position: new THREE.Vector3(),
      yaw: 0,
      weapon: 'pistol',
      mag: 12,
      reserve: 48,
      cooldown: 0,
      reloadLeft: 0,
      group,
      torso,
      head,
      legL,
      legR,
      armL,
      armR,
      route: [],
      routeIndex: 0,
      hold: null,
      targetSite: 'A',
      mode: 'advance',
      target: null,
      lastSeen: null,
      lastSeenAt: -99,
      heardAt: null,
      strafeDir: 1,
      strafeUntil: 0,
      burstLeft: 0,
      burstPauseUntil: 0,
      channel: null,
      channelLeft: 0,
      losAt: random() * 0.15,
      walkPhase: random() * 6,
      stuckAt: 0,
      lastX: 0,
      lastZ: 0,
      fall: 0,
      calloutAt: -99,
      pingAt: -99,
    };
    torso.userData.entity = bot;
    torso.userData.part = 'torso';
    head.userData.entity = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    list.push(bot);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) buildBot('atk', i, BOT_NAMES.atk[i]);
  for (let i = 0; i < 5; i += 1) buildBot('def', i, BOT_NAMES.def[i]);

  function equipBot(bot, weaponId) {
    bot.weapon = weaponId;
    const mag = weaponId === 'rifle' ? 30 : weaponId === 'smg' ? 32 : 12;
    const reserve = weaponId === 'rifle' ? 90 : weaponId === 'smg' ? 96 : 48;
    bot.mag = mag;
    bot.reserve = reserve;
    bot.cooldown = 0;
    bot.reloadLeft = 0;
  }

  function placeBot(bot, x, z, yaw) {
    bot.position.set(x, groundHeight(x, z), z);
    bot.yaw = yaw;
    bot.group.position.copy(bot.position);
    bot.group.rotation.set(0, yaw, 0);
    bot.group.visible = true;
    bot.health = 100;
    bot.armour = 0;
    bot.alive = true;
    bot.fall = 0;
    bot.target = null;
    bot.lastSeen = null;
    bot.channel = null;
    bot.burstLeft = 0;
  }

  // The round plan: attackers split across the lanes to the chosen site,
  // one of them over the walkway; defenders hold. The plan is announced on
  // the radio and in the banner, so the player can play with the team.
  function planRound(attackSite) {
    const atkBots = list.filter((b) => b.team === 'atk');
    const lanes = attackSite === 'A' ? ['mid', 'west', 'walk', 'mid'] : ['mid', 'east', 'walk', 'mid'];
    atkBots.forEach((bot, i) => {
      bot.targetSite = attackSite;
      bot.route = nav.planRoute(random, attackSite, lanes[i % lanes.length]);
      bot.routeIndex = 1;
      bot.hold = null;
      bot.mode = 'advance';
    });
    const defBots = list.filter((b) => b.team === 'def');
    const sites = ['A', 'A', 'B', 'B', 'mid'];
    defBots.forEach((bot, i) => {
      bot.targetSite = sites[i];
      bot.hold = sites[i] === 'mid' ? nav.planHold(random, 'mid') : nav.planHold(random, sites[i]);
      bot.route = [nav.points.defMid, bot.hold];
      bot.routeIndex = 0;
      bot.mode = 'advance';
    });
    const plan = { site: attackSite, lanes };
    state.plan = plan;
    if (radio) radio.plan(attackSite, lanes, state.elapsed);
    return plan;
  }

  function canSee(bot, enemy) {
    chest.set(enemy.position.x, enemy.position.y + 1.2, enemy.position.z);
    eye.set(bot.position.x, bot.position.y + 1.55, bot.position.z);
    toTarget.copy(chest).sub(eye);
    const dist = toTarget.length();
    if (dist > VISION_RANGE || dist < 0.01) return false;
    toTarget.divideScalar(dist);
    const facingX = -Math.sin(bot.yaw);
    const facingZ = -Math.cos(bot.yaw);
    const dot = toTarget.x * facingX + toTarget.z * facingZ;
    if (dot < Math.cos(VISION_HALF_ANGLE)) return false;
    return combat.hasLineOfSight(eye, chest);
  }

  function lookAt(bot, x, z, dt) {
    const want = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-6 * dt, Math.min(6 * dt, diff));
  }

  function settleHeight(bot, dt) {
    const floorY = groundHeight(bot.position.x, bot.position.z);
    if (floorY > bot.position.y) bot.position.y = floorY;
    else if (floorY < bot.position.y) bot.position.y = Math.max(floorY, bot.position.y - 14 * dt);
  }

  function moveToward(bot, point, dt, speed) {
    moveDir.set(point.x - bot.position.x, 0, point.z - bot.position.z);
    const dist = moveDir.length();
    if (dist < 0.05) return true;
    moveDir.divideScalar(dist);
    const stepLen = Math.min(dist, speed * dt);
    bot.position.x += moveDir.x * stepLen;
    bot.position.z += moveDir.z * stepLen;
    lookAt(bot, point.x, point.z, dt);
    bot.walkPhase += dt * 9;
    bot.legL.rotation.x = Math.sin(bot.walkPhase) * 0.6;
    bot.legR.rotation.x = -Math.sin(bot.walkPhase) * 0.6;
    bot.armL.rotation.x = -Math.sin(bot.walkPhase) * 0.4;
    bot.armR.rotation.x = Math.sin(bot.walkPhase) * 0.4;
    // Cheap push-out from world colliders (XZ circle vs AABB).
    for (const box of world.colliders) {
      if (box.min.y > 1.2) continue;
      const cx = Math.max(box.min.x, Math.min(bot.position.x, box.max.x));
      const cz = Math.max(box.min.z, Math.min(bot.position.z, box.max.z));
      const dx = bot.position.x - cx;
      const dz = bot.position.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.34 * 0.34 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        bot.position.x = cx + (dx / d) * 0.34;
        bot.position.z = cz + (dz / d) * 0.34;
      }
    }
    bot.position.x = Math.max(-31.5, Math.min(31.5, bot.position.x));
    bot.position.z = Math.max(-21.5, Math.min(21.5, bot.position.z));
    settleHeight(bot, dt);
    return dist - stepLen < 0.05;
  }

  function botShoot(bot, time, playerEntity) {
    const enemy = bot.target;
    if (!enemy || !enemy.alive) return;
    if (bot.reloadLeft > 0) return;
    if (bot.mag <= 0) {
      if (bot.reserve > 0) bot.reloadLeft = bot.weapon === 'rifle' ? 1.9 : bot.weapon === 'smg' ? 1.7 : 1.4;
      return;
    }
    if (time < bot.burstPauseUntil) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
      bot.burstPauseUntil = time + range(random, 0.35, 0.8);
    }
    if (bot.cooldown > 0) return;
    const gap = bot.weapon === 'rifle' ? 0.11 : bot.weapon === 'smg' ? 0.085 : 0.22;
    bot.cooldown = gap;
    bot.burstLeft -= 1;
    bot.mag -= 1;
    // Aim error grows with range and with the target's speed; standing still
    // and close range make a bot dangerous, as they do for the player.
    eye.set(bot.position.x, bot.position.y + 1.55, bot.position.z);
    chest.set(enemy.position.x, enemy.position.y + 1.15, enemy.position.z);
    const dist = eye.distanceTo(chest);
    const speed = enemy.velocity ? Math.hypot(enemy.velocity.x, enemy.velocity.z) : 0;
    const error = 0.12 + dist * 0.012 + speed * 0.05;
    chest.x += range(random, -error, error);
    chest.y += range(random, -error * 0.7, error * 0.7);
    chest.z += range(random, -error, error);
    toTarget.copy(chest).sub(eye).normalize();
    const hit = combat.raycastShot(eye, toTarget, world.shootables, hitMeshes);
    combat.spawnTracer(eye, hit ? hit.point : chest);
    audio.shot(bot.weapon, bot.position.x, bot.position.z, time);
    const damage = bot.weapon === 'rifle' ? 34 : bot.weapon === 'smg' ? 24 : 26;
    const attacker = { headMult: 3, name: bot.name, team: bot.team, id: bot.id };
    // The player is not a mesh in hitMeshes, so test the aim ray against the
    // player capsule separately, inside the wall/body hit distance.
    const playerHit = enemy.kind === 'player' ? combat.rayHitsPlayer(eye, toTarget, playerEntity, hit ? hit.distance : 60) : null;
    if (playerHit && (!hit || playerHit.distance < hit.distance)) {
      combat.applyDamage(playerEntity, damage, random() < 0.1 ? 'head' : 'torso', attacker, time);
    } else if (hit && hit.entity && hit.entity !== bot && hit.entity.team !== bot.team) {
      combat.applyDamage(hit.entity, damage, random() < 0.1 ? 'head' : 'torso', attacker, time);
    }
  }

  function step(dt, time, playerEntity, entities) {
    for (const bot of list) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        continue;
      }
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      // A target that died is gone at once — no engaging a corpse for 3 seconds.
      if (bot.target && !bot.target.alive) {
        bot.target = null;
        bot.lastSeenAt = 0;
        bot.mode = 'advance';
      }
      if (bot.reloadLeft > 0) {
        bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
        if (bot.reloadLeft === 0) {
          const mag = bot.weapon === 'rifle' ? 30 : bot.weapon === 'smg' ? 32 : 12;
          const take = Math.min(mag - bot.mag, bot.reserve);
          bot.mag += take;
          bot.reserve -= take;
        }
      }
      // Vision, staggered: each bot re-checks on its own slice of time.
      if (time >= bot.losAt) {
        bot.losAt = time + 0.15 + random() * 0.05;
        let best = null;
        let bestDist = Infinity;
        for (const enemy of entities) {
          if (enemy === bot || enemy.team === bot.team || !enemy.alive) continue;
          const d = bot.position.distanceTo(enemy.position);
          if (d < bestDist && canSee(bot, enemy)) {
            best = enemy;
            bestDist = d;
          }
        }
        if (best) {
          const hadTarget = !!bot.target;
          bot.target = best;
          bot.lastSeen = { x: best.position.x, z: best.position.z };
          bot.lastSeenAt = time;
          bot.mode = 'engage';
          bot.channel = null;
          // Spotted: a radio callout and a minimap ping, throttled.
          if (!hadTarget && radio && time - bot.calloutAt > 6) {
            bot.calloutAt = time;
            radio.spotted(bot, best, time);
          }
          if (time - bot.pingAt > 3) {
            bot.pingAt = time;
            state.pings.push({ x: best.position.x, z: best.position.z, time, team: best.team });
            if (state.pings.length > 12) state.pings.shift();
          }
        } else if (bot.target && time - bot.lastSeenAt > LOSE_TARGET_SECONDS) {
          bot.target = null;
          bot.mode = 'advance';
        }
      }
      // Ears: a recent loud marker with no target pulls the bot to investigate.
      if (!bot.target && time - (bot.heardAt ? bot.heardAt.time : -99) > 2) {
        for (let i = audio.hearings.length - 1; i >= 0; i -= 1) {
          const h = audio.hearings[i];
          if (time - h.time > 4) continue;
          const d = Math.hypot(h.x - bot.position.x, h.z - bot.position.z);
          if (d < h.radius && d > 6) {
            bot.heardAt = { x: h.x, z: h.z, time };
            break;
          }
        }
      }

      // Channeling (plant/defuse) stands still; damage breaks it (see main.js).
      if (bot.channel) {
        bot.channelLeft -= dt;
        if (bot.channelLeft <= 0) {
          if (bot.channel === 'plant') state.bomb.plantDone = true;
          if (bot.channel === 'defuse') state.bomb.defuseDone = true;
          bot.channel = null;
        }
        bot.group.position.copy(bot.position);
        bot.group.rotation.y = bot.yaw;
        continue;
      }

      if (state.bomb.status === 'planted' && !bot.target) {
        if (bot.team === 'def') {
          // A planted bomb rewrites a defender's mission: rush the site to defuse.
          moveToward(bot, state.bomb, dt, WALK_SPEED);
        } else {
          // Attackers hold crossfire corners around the site, not the open snow.
          const atkBots = list.filter((b) => b.team === 'atk' && b.alive);
          const hold = nav.postPlantHold(state.bomb.site, atkBots.indexOf(bot));
          const d = Math.hypot(hold.x - bot.position.x, hold.z - bot.position.z);
          if (d > 0.6) moveToward(bot, hold, dt, WALK_SPEED);
          else {
            const site = state.bomb.site === 'A' ? { x: -15, z: -7 } : { x: 15, z: -7 };
            lookAt(bot, site.x, site.z, dt);
          }
        }
      } else if (bot.target && bot.target.alive) {
        // Engage: strafe sideways and shoot in bursts.
        if (time > bot.strafeUntil) {
          bot.strafeDir = random() < 0.5 ? -1 : 1;
          bot.strafeUntil = time + range(random, 0.5, 1.2);
        }
        const tx = bot.target.position.x - bot.position.x;
        const tz = bot.target.position.z - bot.position.z;
        const len = Math.hypot(tx, tz) || 1;
        const strafeX = (-tz / len) * bot.strafeDir;
        const strafeZ = (tx / len) * bot.strafeDir;
        const keep = bot.position.distanceTo(bot.target.position);
        const approach = keep > 18 ? 1 : keep < 6 ? -0.6 : 0;
        moveDir.set(strafeX * 0.7 + (tx / len) * approach, 0, strafeZ * 0.7 + (tz / len) * approach);
        if (moveDir.lengthSq() > 0.01) {
          moveDir.normalize();
          bot.position.x += moveDir.x * 2.6 * dt;
          bot.position.z += moveDir.z * 2.6 * dt;
          bot.walkPhase += dt * 9;
          bot.legL.rotation.x = Math.sin(bot.walkPhase) * 0.6;
          bot.legR.rotation.x = -Math.sin(bot.walkPhase) * 0.6;
          bot.armL.rotation.x = -Math.sin(bot.walkPhase) * 0.4;
          bot.armR.rotation.x = Math.sin(bot.walkPhase) * 0.4;
          settleHeight(bot, dt);
        }
        lookAt(bot, bot.target.position.x, bot.target.position.z, dt);
        botShoot(bot, time, playerEntity);
      } else if (bot.mode === 'advance' && bot.routeIndex < bot.route.length) {
        const node = bot.route[bot.routeIndex];
        const arrived = moveToward(bot, node, dt, WALK_SPEED);
        // Stuck? skip the node instead of grinding against a wall forever.
        if (Math.hypot(bot.position.x - bot.lastX, bot.position.z - bot.lastZ) < 0.01) {
          bot.stuckAt += dt;
          if (bot.stuckAt > 2) {
            bot.routeIndex += 1;
            bot.stuckAt = 0;
          }
        } else bot.stuckAt = 0;
        bot.lastX = bot.position.x;
        bot.lastZ = bot.position.z;
        if (arrived) bot.routeIndex += 1;
      } else if (bot.hold) {
        // Hold: walk to the hold point, then watch the approach.
        const d = Math.hypot(bot.hold.x - bot.position.x, bot.hold.z - bot.position.z);
        if (d > 0.5) moveToward(bot, bot.hold, dt, WALK_SPEED);
        else {
          const watch = bot.targetSite === 'A' ? { x: -15, z: -7 } : bot.targetSite === 'B' ? { x: 15, z: -7 } : { x: 0, z: 4 };
          lookAt(bot, watch.x, watch.z, dt);
          bot.legL.rotation.x = 0;
          bot.legR.rotation.x = 0;
        }
      } else if (bot.heardAt && time - bot.heardAt.time < 5) {
        moveToward(bot, { x: bot.heardAt.x, z: bot.heardAt.z }, dt, WALK_SPEED);
      } else if (bot.lastSeen && time - bot.lastSeenAt < 6) {
        moveToward(bot, { x: bot.lastSeen.x, z: bot.lastSeen.z }, dt, WALK_SPEED);
      }
      bot.group.position.copy(bot.position);
      bot.group.rotation.y = bot.yaw;
    }
  }

  function aliveCount(team) {
    return list.filter((b) => b.team === team && b.alive).length;
  }

  function reset() {
    for (const bot of list) {
      bot.group.rotation.set(0, 0, 0);
      bot.legL.rotation.x = 0;
      bot.legR.rotation.x = 0;
      bot.armL.rotation.x = 0;
      bot.armR.rotation.x = 0;
    }
  }

  return { list, hitMeshes, step, planRound, equipBot, placeBot, aliveCount, reset };
}
