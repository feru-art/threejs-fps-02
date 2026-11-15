// The map: Northlight Relay, an Arctic relay station under the aurora.
// 64 x 44 m, three lanes from the south (attack) spawn to the north
// (defence) spawn, two bomb sites, and cover everywhere a fight happens.
// The centrepiece is a raised walkway down mid with stairs at both ends:
// the player AND the bots can climb it (groundHeight, below), so holding
// the walkway is a real vertical play, not decoration. Every box is a
// collider and a surface bullets stop on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createTextures } from './textures.js';

// Bomb sites and spawns, in world metres. x east, z south (three.js -z is north).
export const SITES = {
  A: { name: 'A', label: 'Comms Array', x: -22, z: -13, radius: 4.5 },
  B: { name: 'B', label: 'Reactor Hall', x: 22, z: -13, radius: 4.5 },
};
export const SPAWNS = {
  atk: [[-4, 18], [0, 19], [4, 18], [-8, 16], [8, 16]],
  def: [[-20, -16], [-8, -17], [0, -18], [8, -17], [20, -16]],
};

// The walkway: deck 4 m wide, z -14..14, top at y 2.6, with a ramp at each
// end (z 14..19 south, -19..-14 north). The floor height under any (x, z):
// the player and the bots both stand on it, and both fall off its edges.
export const DECK_Y = 2.6;
export function groundHeight(x, z) {
  if (x < -2 || x > 2) return 0;
  if (z >= -14 && z <= 14) return DECK_Y;
  if (z > 14 && z < 19) return DECK_Y * (19 - z) / 5;
  if (z > -19 && z < -14) return DECK_Y * (z + 19) / 5;
  return 0;
}

export function createWorld(scene) {
  const textures = createTextures();
  const group = new THREE.Group();
  scene.add(group);

  const snowMat = new THREE.MeshStandardMaterial({ map: textures.snow, roughness: 0.95, metalness: 0 });
  const steelMat = new THREE.MeshStandardMaterial({ map: textures.steel, roughness: 0.55, metalness: 0.45 });
  const steelDarkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.7, metalness: 0.3 });
  const iceMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ice), roughness: 0.25, metalness: 0.1 });
  const rustMat = new THREE.MeshStandardMaterial({ map: textures.crate, roughness: 0.85, metalness: 0.05 });
  const amberMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), roughness: 0.6, metalness: 0.2 });
  const tealMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.6, metalness: 0.2 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: textures.hazard, roughness: 0.7, metalness: 0.1 });
  const driftMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e8eef4'), roughness: 1, metalness: 0 });

  // Aurora sky: a gradient dome (deep blue top, teal middle, warm horizon)
  // plus two translucent ribbons that hang over the station.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d');
  const gradient = skyCtx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, PALETTE.skyTop);
  gradient.addColorStop(0.45, '#173a4d');
  gradient.addColorStop(0.7, PALETTE.skyMid);
  gradient.addColorStop(0.88, '#7a6a55');
  gradient.addColorStop(1, '#e8a05c');
  skyCtx.fillStyle = gradient;
  skyCtx.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(120, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(skyDome);

  const auroraMats = [];
  function auroraRibbon(y, z, color, opacity, phase) {
    const geo = new THREE.PlaneGeometry(110, 10, 32, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      pos.setY(i, pos.getY(i) + Math.sin(x * 0.08 + phase) * 3.5 + Math.sin(x * 0.021 + phase * 2) * 2);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, y, z);
    mesh.rotation.x = -0.5;
    scene.add(mesh);
    auroraMats.push({ mat, base: opacity, phase });
    return mesh;
  }
  auroraRibbon(68, -85, PALETTE.aurora, 0.2, 0);
  auroraRibbon(74, -95, '#3fb8d8', 0.13, 2.1);

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material.isMaterial ? material : steelMat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(rTop, rBottom, h, x, y, z, material, segments = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material.isMaterial ? material : steelMat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter: 64 x 44 m of textured snow, 5 m ice walls.
  const ground = new THREE.Mesh(new THREE.BoxGeometry(64.4, 0.4, 44.4), snowMat);
  ground.position.set(0, -0.2, 0);
  ground.receiveShadow = true;
  group.add(ground);
  colliders.push(new THREE.Box3().setFromObject(ground));
  shootables.push(ground);
  box(0.4, 5, 44.4, -32.2, 2.5, 0, iceMat);
  box(0.4, 5, 44.4, 32.2, 2.5, 0, iceMat);
  box(64.4, 5, 0.4, 0, 2.5, -22.2, iceMat);
  box(64.4, 5, 0.4, 0, 2.5, 22.2, iceMat);

  // The walkway: deck, two ramps (visual only — the floor is groundHeight),
  // support pillars and side rails. Rails and pillars collide; the deck
  // itself is a bullet surface the player can land on — but it is NOT a
  // player collider: a ramp-climbing player stands 0.18 m below the deck
  // top at the junction, and the deck's side face would read as a wall and
  // trap them on the ramp. The floor under the player is groundHeight.
  const deck = box(4, 0.4, 28, 0, 2.4, 0, steelMat, false);
  shootables.push(deck);
  const rampAngle = Math.atan2(DECK_Y, 5);
  const rampGeo = new THREE.BoxGeometry(4, 0.3, Math.hypot(5, DECK_Y));
  for (const [z, angle] of [[16.5, rampAngle], [-16.5, -rampAngle]]) {
    const ramp = new THREE.Mesh(rampGeo, hazardMat);
    ramp.position.set(0, DECK_Y / 2, z);
    ramp.rotation.x = angle;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    group.add(ramp);
  }
  for (const z of [-7, 0, 7]) {
    box(0.5, 2.2, 0.5, -1.6, 1.1, z, steelDarkMat);
    box(0.5, 2.2, 0.5, 1.6, 1.1, z, steelDarkMat);
  }
  box(0.15, 1.0, 28, -2.05, 3.1, 0, amberMat);
  box(0.15, 1.0, 28, 2.05, 3.1, 0, amberMat);

  // Mid lane: snowdrifts and crates in the open field under the walkway.
  box(3, 0.5, 2, -6, 0.25, 8, driftMat);
  box(3, 0.5, 2, 6, 0.25, -4, driftMat);
  box(2.4, 0.5, 1.8, 7, 0.25, 9, driftMat);
  box(1.4, 1.1, 1.4, -5, 0.55, 0, rustMat);
  box(1.4, 1.1, 1.4, 5, 0.55, -10, rustMat);
  box(1.4, 1.1, 1.4, -8, 0.55, -6, tealMat);
  cylinder(0.45, 0.45, 1.1, -3.5, 0.55, 5, amberMat);
  cylinder(0.45, 0.45, 1.1, 4.5, 0.55, 3, tealMat);

  // West lane: the comms yard, a fenced yard with crates and a dish mast.
  box(14, 3.6, 0.4, -22, 1.8, -2, iceMat);
  box(14, 3.6, 0.4, -22, 1.8, 10, iceMat);
  box(0.4, 3.6, 12.4, -29, 1.8, 4, iceMat);
  box(0.4, 3.6, 4, -15, 1.8, 0, iceMat);
  box(0.4, 3.6, 4, -15, 1.8, 8, iceMat);
  box(1.6, 1.1, 1.6, -24, 0.55, 4, rustMat);
  box(1.6, 1.1, 1.6, -19, 0.55, 7, tealMat);
  box(3.2, 1.1, 1.2, -26, 0.55, -6, rustMat);
  cylinder(0.45, 0.45, 1.1, -19, 0.55, -2, amberMat);

  // East lane: container stacks and pipes.
  box(3.4, 1.4, 1.6, 18, 0.7, 8, rustMat);
  box(3.4, 1.4, 1.6, 18, 2.1, 8, tealMat);
  box(3.4, 1.4, 1.6, 24, 0.7, 2, amberMat);
  box(1.6, 1.1, 1.6, 27, 0.55, -6, rustMat);
  cylinder(0.35, 0.35, 8, 15, 0.35, -10, steelDarkMat).rotation.z = Math.PI / 2;
  cylinder(0.45, 0.45, 1.1, 20, 0.55, -4, tealMat);

  // Site A (Comms Array): a tall mast with a dish, crates and a lit pylon.
  cylinder(0.22, 0.3, 9, -26, 4.5, -16, steelMat);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, 0.6), steelMat);
  dish.position.set(-26, 8.6, -16);
  dish.rotation.x = -0.9;
  dish.castShadow = true;
  group.add(dish);
  shootables.push(dish);
  box(1.6, 1.1, 1.6, -19, 0.55, -15, rustMat);
  box(1.6, 1.1, 1.6, -23, 0.55, -9, tealMat);
  box(3.6, 0.9, 1.2, -17, 0.45, -11, rustMat);
  box(0.3, 3.2, 0.3, -24, 1.6, -17, amberMat);

  // Site B (Reactor Hall): a hall corner, a glowing reactor window, pipes.
  box(6, 3.6, 0.4, 26, 1.8, -17, steelMat);
  box(0.4, 3.6, 6, 29, 1.8, -14, steelMat);
  const coreGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fe8c8') }),
  );
  coreGlow.position.set(26, 1.9, -16.78);
  group.add(coreGlow);
  box(1.6, 1.1, 1.6, 19, 0.55, -15, tealMat);
  box(1.6, 1.1, 1.6, 24, 0.55, -9, rustMat);
  box(1.2, 3.8, 1.2, 20, 1.9, -18, amberMat);
  cylinder(0.3, 0.3, 6, 24, 2.2, -16.5, steelDarkMat).rotation.x = Math.PI / 2;

  // Site markers: a painted letter on the snow, so a site reads at a glance.
  const markers = {};
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const tex = key === 'A' ? textures.siteA : textures.siteB;
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(site.radius * 2, site.radius * 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    markers[key] = ring;
  }

  // Light: low amber sun from the west, cool sky fill, warm site lamps, and
  // one searchlight that sweeps the mid field.
  const sky = new THREE.HemisphereLight(new THREE.Color('#bcd3e8'), new THREE.Color('#5a6a78'), 1.15);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.2);
  sun.position.set(-24, 18, 12);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a86a8'), 0.5);
  fill.position.set(20, 12, -14);
  scene.add(fill);
  for (const [x, z] of [[-22, -13], [22, -13], [0, 12]]) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 18, 1.8);
    lamp.position.set(x, 4.5, z);
    scene.add(lamp);
  }
  const searchTower = cylinder(0.3, 0.4, 7, -28, 3.5, 0, steelDarkMat);
  searchTower.castShadow = false;
  const search = new THREE.SpotLight(new THREE.Color('#cfe8ff'), 220, 60, 0.22, 0.45, 1.2);
  search.position.set(-28, 7, 0);
  scene.add(search);
  scene.add(search.target);

  // Waypoints the bots walk: one node per lane junction, hold, site and
  // walkway step. Named so a route reads like a plan.
  const waypoints = {
    atkSpawn: [0, 17],
    midLow: [0, 10],
    midDrift: [0, 1],
    midHigh: [0, -8],
    walkSouth: [0, 16.5],
    walkMid: [0, 0],
    walkNorth: [0, -16.5],
    westDoor: [-15, 4],
    westYard: [-22, 4],
    westGap: [-18, -7],
    eastYard: [19, 6],
    eastStack: [23, -3],
    eastDeck: [24, -8],
    siteA: [-22, -13],
    siteB: [22, -13],
    defA: [-18, -16],
    defB: [18, -16],
    defMid: [0, -15],
  };

  return {
    colliders, shootables, group, markers, waypoints,
    // Per-frame ambience: the searchlight sweeps mid, the aurora breathes.
    update(time) {
      const a = time * 0.11;
      search.target.position.set(-6 + Math.cos(a) * 14, 0, -2 + Math.sin(a) * 12);
      for (const rib of auroraMats) {
        rib.mat.opacity = rib.base * (0.75 + 0.25 * Math.sin(time * 0.35 + rib.phase));
      }
    },
  };
}
