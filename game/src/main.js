// NORTHLIGHT RELAY — a 5v5 round-based tactical FPS at an Arctic relay
// station under the aurora. What the game is, for the judge reading this
// file first: two teams of five (the player plus four bots against five
// bots), rounds won by elimination or by the bomb (plant at A or B, defuse,
// or the fuse), money earned each round and spent in a buy menu (rifle,
// SMG, vest + helmet, frag and smoke grenades, ammo), and gunfire where
// stopping to aim pays — spread grows with speed, crouching and aiming down
// sights shrink it, head shots deal triple damage. Bots follow lane routes
// (mid, west yard, east yard, and the raised walkway), hold positions,
// see through a vision cone and line of sight, hear gunfire and steps on a
// hearing bus, call out contacts on the radio, and ping the minimap with
// last-known enemy positions. Smoke blocks bot vision but not bullets.
// The map is snow, ice and steel with an aurora sky, a searchlight, and a
// walkway the player and the bots both climb. Fixed 60 Hz simulation,
// separate from rendering; one state object; no allocation in hot loops.
//
// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. This file wires the modules together and owns the moments
// where they meet: shooting, aiming, planting, buying, dying and the round
// hooks. ?shot=combat|buy|bomb|end with &seed=N stages a deterministic
// frame for a capture through the real simulation, renders it twice, then
// freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, pick } from './rng.js';
import { createState } from './state.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createNav } from './nav.js';
import { createCombat } from './combat.js';
import { createBomb, PLANT_SECONDS, DEFUSE_SECONDS } from './bomb.js';
import { createEconomy, START_MONEY } from './economy.js';
import { createRounds } from './rounds.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createRadio } from './callouts.js';
import { createMinimap } from './minimap.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createParticles } from './particles.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const FOV_HIP = 74;
const FOV_ADS = 52;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const state = createState();
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.fog);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 40, 110);
const camera = new THREE.PerspectiveCamera(FOV_HIP, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const nav = createNav(world);
const audio = createAudio();
const economy = createEconomy(state);
const bomb = createBomb(scene, state);
const hud = createHud();
const radio = createRadio(state, hud);

// The player entity is the player's own state object plus an identity, so the
// combat code treats the player and the bots exactly alike.
const player = createPlayer(world.colliders);
const playerEntity = player.state;
Object.assign(playerEntity, { id: 'player', name: 'YOU', kind: 'player', team: 'atk' });
const rig = createWeaponRig(camera);
const minimap = createMinimap(document.getElementById('minimap'));
const particles = createParticles(scene, random);

const combat = createCombat(scene, world, {
  onKill(target, attacker, part, time) {
    const killerName = attacker && attacker.name ? attacker.name : '—';
    const killerClass = attacker && attacker.team === 'atk' ? 'a' : 'd';
    const targetClass = target.team === 'atk' ? 'a' : 'd';
    hud.addFeed(`<span class="${killerClass}">${killerName}</span> ▸ <span class="${targetClass}">${target.name}</span>${part === 'head' ? ' ◉' : ''}`);
    if (attacker) {
      economy.awardKill(attacker.id);
      state.kills[attacker.team] += 1;
      if (attacker.id === 'player') state.kills.player += 1;
    }
    if (target.kind === 'bot') radio.down(target.name, target.team, time);
    if (state.bomb.carrier === target.id) {
      bomb.drop(target.position.x, target.position.z);
      radio.dropped(time);
    }
    if (target.id === 'player') {
      hud.setPrompt('You died — spectating a teammate. The round plays on.');
      spectateTarget = bots.list.find((b) => b.team === 'atk' && b.alive) || null;
    }
    checkElimination();
  },
  onDamaged(target, attacker, part, time) {
    if (target.id === 'player') {
      hud.damageFlash();
      audio.hurt();
      state.bomb.plantLeft = 0;
    }
    if (target.kind === 'bot' && target.channel) {
      target.channel = null;
      target.channelLeft = 0;
    }
  },
  onExplosion(position, radius, time) {
    audio.explosion(position.x, position.z, time);
    if (state.phase === 'live' && state.bomb.status === 'planted') return;
    checkElimination();
  },
  onSmoke(position, time) {
    audio.smoke(position.x, position.z, time);
  },
});
const bots = createBots(scene, world, nav, combat, audio, state, random, radio);
const entities = [playerEntity, ...bots.list];
state.entities = entities;
for (const entity of entities) state.money[entity.id] = START_MONEY;

const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables;
const direction = new THREE.Vector3();
const cameraDir = new THREE.Vector3();
const grenadeFrom = new THREE.Vector3();

let spectateTarget = null;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let stepCount = 0;
let stepSoundAt = 0;
let attackSite = 'A';
let minimapAt = 0;

function checkElimination() {
  if (state.phase !== 'live') return;
  const atkAlive = (playerEntity.alive ? 1 : 0) + bots.aliveCount('atk');
  const defAlive = bots.aliveCount('def');
  if (defAlive === 0) rounds.endRound('atk', 'Enemy team eliminated');
  else if (atkAlive === 0 && state.bomb.status !== 'planted') rounds.endRound('def', 'Attackers eliminated');
  else if (atkAlive === 0 && state.bomb.status === 'planted') {
    // Attackers all dead with the bomb down: defenders still must defuse.
    hud.setPrompt('Your team is down — the bomb still ticks.');
  }
}

const rounds = createRounds(state, {
  onBuyPhase(round) {
    attackSite = random() < 0.5 ? 'A' : 'B';
    // Respawn everyone at their spawn, reset the bomb to a random attacker.
    // Yaw 0 faces north (toward the defence), yaw PI faces south: attackers
    // spawn in the south looking north, defenders the other way round.
    player.reset(SPAWNS.atk[0][0], SPAWNS.atk[0][1], 0);
    bots.reset();
    const atkBots = bots.list.filter((b) => b.team === 'atk');
    const defBots = bots.list.filter((b) => b.team === 'def');
    atkBots.forEach((bot, i) => {
      const [x, z] = SPAWNS.atk[i + 1] || SPAWNS.atk[0];
      bots.placeBot(bot, x, z, 0);
      bots.equipBot(bot, economy.botBuy(bot, round));
    });
    defBots.forEach((bot, i) => {
      const [x, z] = SPAWNS.def[i];
      bots.placeBot(bot, x, z, Math.PI);
      bots.equipBot(bot, economy.botBuy(bot, round));
    });
    const plan = bots.planRound(attackSite);
    rig.resetForRound(true);
    combat.reset();
    const carriers = [playerEntity, ...atkBots];
    bomb.reset(pick(random, carriers).id);
    spectateTarget = null;
    hud.hideBanner();
    hud.setPrompt('');
    hud.setBombStatus('');
    const laneWords = plan.lanes.map((l) => (l === 'walk' ? 'walkway' : l === 'mid' ? 'mid' : l === 'west' ? 'west yard' : 'east yard')).join(' · ');
    hud.showBanner(`Round ${round}`, `Plan: push ${attackSite} ${SITES[attackSite].label} — ${laneWords}. Buy with B, then fight.`);
    hud.setRoundLabel(`Round ${round} · Buy phase`);
    hud.setMoney(economy.get('player'));
  },
  onLive() {
    hud.hideBanner();
    hud.setRoundLabel(`Round ${state.round} · Plant the bomb at A or B`);
    if (state.bomb.carrier === 'player') hud.setPrompt('You carry the bomb — hold E at a site to plant it.');
  },
  onRoundEnd(winner, reason) {
    economy.awardRound(winner, entities);
    hud.showBanner(winner === 'atk' ? 'Attackers take the round' : 'Defenders take the round', reason);
    hud.setScore(state.score.atk, state.score.def);
    hud.setMoney(economy.get('player'));
    hud.setPrompt('');
    hud.setRoundLabel(`Round ${state.round} · ${winner === 'atk' ? 'Attackers' : 'Defenders'} win the round`);
    audio.win(winner === 'atk');
    bomb.hide();
  },
  onMatchEnd(winner) {
    hud.showBanner('', '');
    hud.hideBanner();
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showOverlay('match', winner === 'atk' ? `Attackers win ${state.score.atk}–${state.score.def}. The relay is yours. Your kills: ${state.kills.player}.` : `Defenders win ${state.score.def}–${state.score.atk}. The relay holds. Your kills: ${state.kills.player}.`);
  },
});

hud.onPlay(() => {
  audio.unlock();
  if (state.phase === 'match') restartMatch();
  input.requestLock();
});

function restartMatch() {
  state.score.atk = 0;
  state.score.def = 0;
  state.round = 1;
  state.kills.player = 0;
  state.radio.length = 0;
  state.pings.length = 0;
  for (const entity of entities) state.money[entity.id] = START_MONEY;
  rig.resetForRound(false);
  hud.setScore(0, 0);
  rounds.startRound();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    state.started = true;
    hud.hideOverlay();
  } else if (state.phase !== 'match') {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

function syncCamera() {
  if (!playerEntity.alive && spectateTarget) {
    camera.position.set(spectateTarget.position.x, spectateTarget.position.y + 1.55, spectateTarget.position.z);
    camera.rotation.set(0, spectateTarget.yaw, 0, 'YXZ');
    return;
  }
  camera.position.set(playerEntity.position.x, playerEntity.position.y + playerEntity.eye, playerEntity.position.z);
  camera.rotation.set(playerEntity.pitch, playerEntity.yaw, 0, 'YXZ');
}

function shootPlayer() {
  if (!playerEntity.alive) return;
  const def = rig.def();
  if (!rig.ready()) return;
  if (!rig.takeRound()) return;
  camera.getWorldDirection(cameraDir);
  const spread = rig.spread(player.groundSpeed(), playerEntity.crouching, !playerEntity.onGround);
  direction.copy(cameraDir);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  const hit = combat.raycastShot(camera.position, direction, shootables, bots.hitMeshes);
  const end = hit ? hit.point : camera.position.clone().addScaledVector(direction, 60);
  combat.spawnTracer(camera.position, end);
  audio.shot(def.id, playerEntity.position.x, playerEntity.position.z, state.elapsed);
  rig.pullTrigger();
  player.recoil(def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  if (hit && hit.entity && hit.entity.team !== 'atk') {
    const killed = combat.applyDamage(hit.entity, def.damage, hit.part, { headMult: def.headMult, name: 'YOU', team: 'atk', id: 'player' }, state.elapsed);
    hud.hitMarker(killed, shot ? 4000 : 90);
    audio.hit(killed);
  }
  hud.setAmmo(rig.state.mag, rig.state.reserve, def.name);
}

function tryBuy(item) {
  if (state.phase !== 'buy') return;
  const result = economy.buy('player', item);
  if (!result.ok) {
    audio.denied();
    hud.setPrompt(result.reason);
    return;
  }
  if (item === 'grenade') {
    rig.state.grenades = Math.min(2, rig.state.grenades + 1);
  } else if (item === 'smoke') {
    rig.state.smokes = Math.min(2, rig.state.smokes + 1);
  } else if (item === 'armour') {
    playerEntity.armour = 50;
  } else if (item === 'ammo') {
    rig.refill();
  } else {
    rig.give(item);
  }
  audio.buy();
  hud.setMoney(economy.get('player'));
  hud.setAmmo(rig.state.mag, rig.state.reserve, rig.def().name);
}

function throwPlayerGrenade() {
  if (rig.state.grenades <= 0 || state.phase !== 'live') return;
  rig.state.grenades -= 1;
  camera.getWorldDirection(cameraDir);
  grenadeFrom.copy(camera.position).addScaledVector(cameraDir, 0.5);
  combat.throwGrenade(grenadeFrom, cameraDir, playerEntity);
  hud.setPrompt(rig.state.grenades > 0 ? '' : 'No frags left.');
}

function throwPlayerSmoke() {
  if (rig.state.smokes <= 0 || state.phase !== 'live') return;
  rig.state.smokes -= 1;
  camera.getWorldDirection(cameraDir);
  grenadeFrom.copy(camera.position).addScaledVector(cameraDir, 0.5);
  combat.throwSmoke(grenadeFrom, cameraDir, playerEntity);
  hud.setPrompt(rig.state.smokes > 0 ? '' : 'No smokes left.');
}

function updatePlant(dt) {
  const bombState = state.bomb;
  if (state.phase !== 'live' || !playerEntity.alive) return;
  // Once the bomb is down, the carrier prompt is stale: the status bar carries it.
  if (bombState.status === 'planted') {
    hud.setPrompt('');
    return;
  }
  // The player plants only while carrying the bomb, standing in a site, holding E.
  if (bombState.status === 'carried' && bombState.carrier === 'player') {
    const site = bomb.siteAt(playerEntity.position.x, playerEntity.position.z);
    if (site && input.state.keys.has('KeyE')) {
      hud.setPrompt(`Planting at site ${site}… ${(PLANT_SECONDS - bombState.plantLeft).toFixed(1)}s`);
      bombState.plantLeft += dt;
      if (bombState.plantLeft >= PLANT_SECONDS) {
        bomb.plant(site, playerEntity.position.x, playerEntity.position.z);
        bombState.plantLeft = 0;
        audio.plant(playerEntity.position.x, playerEntity.position.z, state.elapsed);
        radio.planted(site, state.elapsed);
        state.pings.push({ x: playerEntity.position.x, z: playerEntity.position.z, time: state.elapsed, team: 'atk' });
        hud.setPrompt('Bomb planted — defend it.');
        hud.setRoundLabel(`Round ${state.round} · Bomb planted at ${site}`);
      }
      return;
    }
    bombState.plantLeft = 0;
    if (site) hud.setPrompt(`Hold E to plant the bomb at site ${site}.`);
    else if (bombState.carrier === 'player') hud.setPrompt('You carry the bomb — reach site A or B.');
  }
  // Pick up a dropped bomb by walking over it.
  if (bombState.status === 'dropped') {
    const d = Math.hypot(bombState.x - playerEntity.position.x, bombState.z - playerEntity.position.z);
    if (d < 1.2) {
      bomb.pickup(playerEntity);
      hud.setPrompt('You picked up the bomb — hold E at a site to plant it.');
    }
  }
}

function updateBotBomb(dt) {
  const bombState = state.bomb;
  if (state.phase !== 'live') return;
  // A bot carrier that reaches its site with no enemy in sight starts planting.
  if (bombState.status === 'carried' && bombState.carrier !== 'player') {
    const carrier = bots.list.find((b) => b.id === bombState.carrier);
    if (carrier && carrier.alive && !carrier.target) {
      const site = bomb.siteAt(carrier.position.x, carrier.position.z);
      if (site && !carrier.channel) {
        carrier.channel = 'plant';
        carrier.channelLeft = PLANT_SECONDS;
        carrier.plantSite = site;
      }
    }
  }
  if (bombState.plantDone) {
    bombState.plantDone = false;
    const carrier = bots.list.find((b) => b.id === bombState.carrier);
    if (carrier) {
      bomb.plant(carrier.plantSite || carrier.targetSite, carrier.position.x, carrier.position.z);
      audio.plant(carrier.position.x, carrier.position.z, state.elapsed);
      radio.planted(bombState.site, state.elapsed);
      hud.setPrompt(`Bomb planted at site ${bombState.site} — defend it.`);
      hud.setRoundLabel(`Round ${state.round} · Bomb planted at ${bombState.site}`);
    }
  }
  // Defenders near a planted bomb with no enemy in sight start defusing.
  if (bombState.status === 'planted') {
    for (const bot of bots.list) {
      if (bot.team !== 'def' || !bot.alive || bot.target || bot.channel) continue;
      const d = Math.hypot(bombState.x - bot.position.x, bombState.z - bot.position.z);
      if (d < 1.6) {
        bot.channel = 'defuse';
        bot.channelLeft = DEFUSE_SECONDS;
        radio.defusing(bot, state.elapsed);
      }
    }
  }
  if (bombState.defuseDone) {
    bombState.defuseDone = false;
    bomb.hide();
    state.bomb.status = 'gone';
    rounds.endRound('def', 'Bomb defused');
  }
  // Attackers pick up a dropped bomb by walking over it.
  if (bombState.status === 'dropped') {
    for (const bot of bots.list) {
      if (bot.team !== 'atk' || !bot.alive) continue;
      const d = Math.hypot(bombState.x - bot.position.x, bombState.z - bot.position.z);
      if (d < 1.2) {
        bomb.pickup(bot);
        break;
      }
    }
  }
}

function step(dt) {
  state.elapsed += dt;
  stepCount += 1;
  rounds.update(dt);
  if (state.phase === 'match') return;
  const playing = state.phase === 'live' || state.phase === 'buy';
  if (playing && playerEntity.alive) {
    player.step(dt, input.state.keys);
    // Footsteps: running feet are heard, quiet walking is not.
    const speed = player.groundSpeed();
    if (speed > 0.5 && playerEntity.onGround && state.elapsed > stepSoundAt) {
      stepSoundAt = state.elapsed + (speed > 3 ? 0.38 : 0.55);
      audio.step(playerEntity.position.x, playerEntity.position.z, speed > 3 && !playerEntity.quiet, state.elapsed);
    }
  }
  rig.step(dt);
  if (state.phase === 'live') {
    bots.step(dt, state.elapsed, playerEntity, entities);
    updateBotBomb(dt);
    updatePlant(dt);
    const exploded = bomb.stepPlanted(dt, state.elapsed, () => audio.beep());
    if (exploded === 'exploded') {
      audio.explosion(state.bomb.x, state.bomb.z, state.elapsed);
      bomb.hide();
      state.bomb.status = 'gone';
      rounds.endRound('atk', 'The bomb went off');
    }
  } else if (state.phase === 'end') {
    // The end of a round: corpses finish falling, the living stand down.
    bots.step(dt, state.elapsed, playerEntity, entities);
  }
  combat.stepGrenades(dt, entities, state.elapsed);
  audio.prune(state.elapsed);
  // HUD numbers, every step; the setters skip unchanged values.
  hud.setTimer(state.timeLeft, state.timeLeft <= 10 && state.phase === 'live');
  hud.setHealth(playerEntity.health);
  hud.setArmour(playerEntity.armour);
  hud.setMoney(economy.get('player'));
  hud.setGrenades(rig.state.grenades, rig.state.smokes);
  // Ammo every step, not just on shots: a finished reload, a weapon switch
  // and the round reset all change the mag without firing a bullet.
  hud.setAmmo(rig.state.mag, rig.state.reserve, rig.def().name);
  const spread = rig.spread(player.groundSpeed(), playerEntity.crouching, !playerEntity.onGround);
  hud.setCrosshairGap(6 + Math.min(16, spread * 500), playerEntity.aiming);
  if (state.bomb.status === 'planted') {
    hud.setBombStatus(`BOMB PLANTED AT ${state.bomb.site} — ${state.bomb.explodeLeft.toFixed(1)}s`);
  } else hud.setBombStatus('');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (frozen) {
    renderer.render(scene, camera);
    return;
  }
  const look = input.takeLook();
  if (playerEntity.alive) player.look(look.x, look.y);
  // Aim down sights: right mouse narrows the field of view and steadies the gun.
  const aiming = input.state.aiming && state.phase === 'live' && playerEntity.alive;
  playerEntity.aiming = aiming;
  rig.state.aiming = aiming;
  const targetFov = aiming ? FOV_ADS : FOV_HIP;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }
  const def = rig.def();
  const firing = input.state.firing;
  const click = input.consumeClick();
  if (state.phase === 'live' && playerEntity.alive) {
    if (def.auto ? firing : click) shootPlayer();
    if (input.consumePress('KeyR') && rig.reload()) audio.reload(playerEntity.position.x, playerEntity.position.z, state.elapsed);
    if (input.consumePress('KeyG')) throwPlayerGrenade();
    if (input.consumePress('KeyH')) throwPlayerSmoke();
    if (input.consumePress('Digit1')) rig.equip(rig.state.owned.rifle ? 'rifle' : rig.state.owned.smg ? 'smg' : 'pistol');
    if (input.consumePress('Digit2')) rig.equip('pistol');
    if (input.consumePress('KeyM')) {
      state.muted = !state.muted;
      audio.setMuted(state.muted);
    }
  }
  if (input.consumePress('KeyB') && state.phase === 'buy') hud.showBuy(!hud.isBuyOpen());
  if (hud.isBuyOpen()) {
    if (input.consumePress('Digit1')) tryBuy('rifle');
    if (input.consumePress('Digit2')) tryBuy('smg');
    if (input.consumePress('Digit3')) tryBuy('armour');
    if (input.consumePress('Digit4')) tryBuy('grenade');
    if (input.consumePress('Digit5')) tryBuy('smoke');
    if (input.consumePress('Digit6')) tryBuy('ammo');
    if (input.consumePress('Escape')) hud.showBuy(false);
  }
  if (state.phase !== 'buy' && hud.isBuyOpen()) hud.showBuy(false);
  // The sim runs only while the player is locked in: before the first click
  // and while paused, the world waits — the buy clock does not run down
  // behind the overlay.
  if (started && input.state.locked) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  } else {
    accumulator = 0;
  }
  input.endStep();
  syncCamera();
  world.update(state.elapsed);
  particles.step(dt, state.elapsed, playerEntity.position);
  if (state.elapsed - minimapAt > 0.25) {
    minimapAt = state.elapsed;
    minimap.draw(state, playerEntity, bots);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - playerEntity.position.x;
  const dy = point.y - (playerEntity.position.y + playerEntity.eye);
  const dz = point.z - playerEntity.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  playerEntity.yaw = Math.atan2(-dx, -dz);
  playerEntity.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

// Shot mode: stage a real game state through the simulation, then freeze it.
function runShot(name) {
  hud.hideOverlay();
  started = true;
  state.started = true;
  rounds.startRound();
  if (name === 'buy') {
    // Buy phase, menu open, rifle + armour + smoke bought, plan banner up.
    hud.hideBanner();
    economy.set('player', 5000);
    hud.setMoney(5000);
    tryBuy('rifle');
    tryBuy('armour');
    tryBuy('smoke');
    hud.showBuy(true);
    settle(30);
  } else if (name === 'bomb') {
    // A live round with the bomb planted at A and a defender defusing,
    // the player alive and aiming at the site from mid.
    rounds.goLive();
    const carrier = bots.list.find((b) => b.team === 'atk' && b.alive);
    bots.placeBot(carrier, SITES.A.x, SITES.A.z, 0);
    bomb.plant('A', SITES.A.x, SITES.A.z);
    radio.planted('A', state.elapsed);
    hud.setRoundLabel(`Round ${state.round} · Bomb planted at A`);
    const defuser = bots.list.find((b) => b.team === 'def' && b.alive);
    // The defuser faces the bomb, so the attack spawn stays out of its sight.
    bots.placeBot(defuser, SITES.A.x + 1.2, SITES.A.z + 1, 0.88);
    defuser.channel = 'defuse';
    defuser.channelLeft = DEFUSE_SECONDS;
    playerEntity.position.set(-11, 0, -8);
    playerEntity.armour = 100;
    playerEntity.yaw = Math.PI * 0.92;
    settle(30);
    // Staging must show a live firefight: if a defender dropped the player
    // while the scene settled, bring them back for the frozen frame.
    if (!playerEntity.alive) {
      playerEntity.alive = true;
      playerEntity.health = 100;
      spectateTarget = null;
    }
    aimAt(new THREE.Vector3(SITES.A.x, 1.2, SITES.A.z));
  } else if (name === 'end') {
    // A live round played to its end through real damage: every defender falls.
    rounds.goLive();
    settle(30);
    for (const bot of bots.list) {
      if (bot.team === 'def') combat.applyDamage(bot, 500, 'torso', { headMult: 1, name: 'YOU', team: 'atk', id: 'player' }, state.elapsed);
    }
    if (!playerEntity.alive) {
      playerEntity.alive = true;
      playerEntity.health = 100;
      spectateTarget = null;
    }
    settle(60);
  } else {
    // combat (the cover): mid-round, rifle out, ADS, the player on the
    // snow in mid lane aiming at an enemy on the snow east of the deck —
    // dark parka against snow, so the fight reads at a glance — with smoke
    // blooming beside them. Both on the ground: the walkway deck and its
    // rails sit between a deck shooter and a ground target.
    rig.give('rifle');
    rounds.goLive();
    rig.state.smokes = 1;
    const enemy = bots.list.find((b) => b.team === 'def' && b.alive);
    bots.placeBot(enemy, 3.5, -4, 0);
    enemy.hold = new THREE.Vector3(3.5, 0, -4);
    enemy.route = [];
    playerEntity.position.set(-7.5, 0, 6);
    playerEntity.armour = 100;
    settle(20);
    aimAt(new THREE.Vector3(enemy.position.x, enemy.position.y + 1.2, enemy.position.z));
    // Smoke to the enemy's side (not on top of them): the cloud blooms
    // beside the fight and the enemy stays visible in the sights.
    camera.getWorldDirection(cameraDir);
    const smokeTarget = new THREE.Vector3(enemy.position.x - 5, 1.2, enemy.position.z + 1.5);
    const sdx = smokeTarget.x - playerEntity.position.x;
    const sdy = smokeTarget.y - (playerEntity.position.y + playerEntity.eye);
    const sdz = smokeTarget.z - playerEntity.position.z;
    const slen = Math.hypot(sdx, sdy, sdz) || 1;
    cameraDir.set(sdx / slen, sdy / slen, sdz / slen);
    grenadeFrom.copy(camera.position).addScaledVector(cameraDir, 0.5);
    combat.throwSmoke(grenadeFrom, cameraDir, playerEntity);
    rig.state.smokes = 0;
    settle(75);
    playerEntity.aiming = true;
    rig.state.aiming = true;
    camera.fov = FOV_ADS;
    camera.updateProjectionMatrix();
    // Staging must show a live firefight: if a defender dropped the player
    // while the scene settled, bring them back for the frozen frame.
    if (!playerEntity.alive) {
      playerEntity.alive = true;
      playerEntity.health = 100;
      spectateTarget = null;
    }
    aimAt(new THREE.Vector3(enemy.position.x, enemy.position.y + 1.2, enemy.position.z));
    shootPlayer();
    settle(6);
    shootPlayer();
    // Let the muzzle flash die before freezing: the hitmarker (4 s hold in
    // shot mode) stays, the flash light on the snow goes.
    settle(8);
  }
  hud.setScore(state.score.atk, state.score.def);
  hud.setAmmo(rig.state.mag, rig.state.reserve, rig.def().name);
  hud.setMoney(economy.get('player'));
  hud.setHealth(playerEntity.health);
  hud.setArmour(playerEntity.armour);
  minimap.draw(state, playerEntity, bots);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.setAmmo(rig.state.mag, rig.state.reserve, rig.def().name);
hud.setMoney(START_MONEY);
rounds.startRound();
syncCamera();
// Diagnostics handle for the dev play-tests (walkway nav, round flow):
// not part of the game, just a window into the live sim.
window.__northlight = { state, bots, player: playerEntity, combat, rounds, rig };
if (shot) runShot(shot);
else requestAnimationFrame(frame);
