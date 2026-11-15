// The map: Cinderline Yard, a rail yard at dusk. 64 x 44 m, three lanes from the
// south (attack) spawn to the north (defence) spawn, two bomb sites, and cover
// everywhere a fight happens. Every box is a collider and a surface bullets stop on.
// Hand-placed waypoints (see nav.js) ride on the same geometry.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Bomb sites and spawns, in world metres. x east, z south (three.js -z is north).
export const SITES = {
  A: { name: 'A', label: 'Signal Tower', x: -22, z: -13, radius: 4.5 },
  B: { name: 'B', label: 'Freight Hall', x: 22, z: -13, radius: 4.5 },
};
export const SPAWNS = {
  atk: [[-4, 18], [0, 19], [4, 18], [-8, 16], [8, 16]],
  def: [[-20, -16], [-8, -17], [0, -18], [8, -17], [20, -16]],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of ['canvas', 'surface', 'hairline', 'ink', 'muted', 'accent', 'atk', 'def']) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'atk' || name === 'def' ? 0.5 : 0.92,
      metalness: 0.04,
    });
  }
  const groundMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a211a'), roughness: 1 });
  const railMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b6f75'), roughness: 0.35, metalness: 0.8 });

  // Dusk sky: a gradient dome (amber horizon, dark violet top) painted on a
  // canvas, so the sky reads as dusk instead of a black void above the walls.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d');
  const gradient = skyCtx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#241d33');
  gradient.addColorStop(0.5, '#4a2c3a');
  gradient.addColorStop(0.75, '#9a5630');
  gradient.addColorStop(1, '#d98a45');
  skyCtx.fillStyle = gradient;
  skyCtx.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(120, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(skyDome);

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material.isMaterial ? material : materials[material]);
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

  // Ground and perimeter: 64 x 44 m, 5 m walls, open dusk sky.
  box(64.4, 0.4, 44.4, 0, -0.2, 0, groundMat);
  box(0.4, 5, 44.4, -32.2, 2.5, 0, 'surface');
  box(0.4, 5, 44.4, 32.2, 2.5, 0, 'surface');
  box(64.4, 5, 0.4, 0, 2.5, -22.2, 'surface');
  box(64.4, 5, 0.4, 0, 2.5, 22.2, 'surface');

  // Mid lane: two rail lines down the middle, boxcars as the lane's cover.
  for (const z of [-6, 6]) {
    box(0.18, 0.12, 40, -1.2, 0.06, z * 0 + 0, railMat, false);
    box(0.18, 0.12, 40, 1.2, 0.06, 0, railMat, false);
  }
  box(2.6, 2.8, 7, -2.2, 1.4, -4, 'hairline'); // boxcar west
  box(2.6, 2.8, 7, 2.2, 1.4, 5, 'hairline'); // boxcar east
  box(1.4, 1.1, 1.4, 0, 0.55, 10, 'surface');
  box(1.4, 1.1, 1.4, -5, 0.55, 0, 'surface');
  box(1.4, 1.1, 1.4, 5, 0.55, -10, 'surface');

  // West lane: the warehouse, a long hall with two door gaps and crates inside.
  box(14, 4.2, 0.4, -22, 2.1, -2, 'surface');
  box(14, 4.2, 0.4, -22, 2.1, 10, 'surface');
  box(0.4, 4.2, 12.4, -29, 2.1, 4, 'surface');
  box(0.4, 4.2, 4, -15, 2.1, 0, 'surface');
  box(0.4, 4.2, 4, -15, 2.1, 8, 'surface');
  box(1.6, 1.1, 1.6, -24, 0.55, 4, 'hairline');
  box(1.6, 1.1, 1.6, -19, 0.55, 7, 'hairline');
  box(3.2, 1.1, 1.2, -26, 0.55, -6, 'hairline');

  // East lane: container stacks and the gantry platform above the tracks.
  box(3.4, 1.4, 1.6, 18, 0.7, 8, 'hairline');
  box(3.4, 1.4, 1.6, 18, 2.1, 8, 'surface');
  box(3.4, 1.4, 1.6, 24, 0.7, 2, 'hairline');
  box(1.6, 1.1, 1.6, 27, 0.55, -6, 'hairline');
  box(6, 0.4, 3, 24, 2.6, -8, 'surface'); // gantry deck
  box(0.4, 2.6, 0.4, 21.4, 1.3, -9.2, 'surface');
  box(0.4, 2.6, 0.4, 26.6, 1.3, -9.2, 'surface');
  box(0.4, 2.6, 0.4, 21.4, 1.3, -6.8, 'surface');
  box(0.4, 2.6, 0.4, 26.6, 1.3, -6.8, 'surface');

  // Site A (Signal Tower): a tower base, crates and a lit mast.
  box(2.2, 3.4, 2.2, -26, 1.7, -16, 'surface');
  box(0.3, 3.2, 0.3, -26, 5, -16, 'accent');
  box(1.6, 1.1, 1.6, -19, 0.55, -15, 'hairline');
  box(1.6, 1.1, 1.6, -23, 0.55, -9, 'hairline');
  box(3.6, 0.9, 1.2, -17, 0.45, -11, 'hairline');
  // Site B (Freight Hall): a hall corner, pallets and a crane leg.
  box(6, 3.6, 0.4, 26, 1.8, -17, 'surface');
  box(0.4, 3.6, 6, 29, 1.8, -14, 'surface');
  box(1.6, 1.1, 1.6, 19, 0.55, -15, 'hairline');
  box(1.6, 1.1, 1.6, 24, 0.55, -9, 'hairline');
  box(1.2, 3.8, 1.2, 20, 1.9, -18, 'hairline');

  // Site markers: glowing rings on the ground so a site reads at a glance.
  const markers = {};
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.25, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    markers[key] = ring;
  }

  // Light: low amber dusk sun from the west, cool sky fill, warm yard lamps.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a7a68'), new THREE.Color('#1a140f'), 1.3);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 2.4);
  sun.position.set(-24, 16, 10);
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
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 12, 16, 1.8);
    lamp.position.set(x, 4.5, z);
    scene.add(lamp);
  }

  // Waypoints the bots walk: one node per lane junction, hold and site.
  // Named so a route reads like a plan: spawn -> mid/west/east -> site.
  const waypoints = {
    atkSpawn: [0, 17],
    midLow: [0, 10],
    midBoxcar: [0, 1],
    midHigh: [0, -8],
    westDoor: [-15, 4],
    westHall: [-22, 4],
    westGap: [-18, -7],
    eastYard: [19, 6],
    eastStack: [23, -3],
    eastGantry: [24, -8],
    siteA: [-22, -13],
    siteB: [22, -13],
    defA: [-18, -16],
    defB: [18, -16],
    defMid: [0, -15],
  };

  return { colliders, shootables, group, markers, waypoints };
}
