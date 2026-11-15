// Snowfall and muzzle-lit dust: a Points cloud that drifts down over the
// station and wraps around the player. Light on purpose — a few hundred
// points, one draw call, positions recycled in place, so the fixed-step sim
// never pays for the weather.
import * as THREE from 'three';

const COUNT = 500;
const AREA = 70;

export function createParticles(scene, random) {
  const positions = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i += 1) {
    positions[i * 3] = (random() - 0.5) * AREA;
    positions[i * 3 + 1] = random() * 18;
    positions[i * 3 + 2] = (random() - 0.5) * AREA;
    speeds[i] = 1.2 + random() * 1.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xeef4fa, size: 0.12, transparent: true, opacity: 0.75, sizeAttenuation: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  return {
    step(dt, time, center) {
      const attr = geo.attributes.position;
      const arr = attr.array;
      for (let i = 0; i < COUNT; i += 1) {
        arr[i * 3 + 1] -= speeds[i] * dt;
        arr[i * 3] += Math.sin(time * 0.6 + i) * dt * 0.4;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 16 + Math.random() * 2;
          arr[i * 3] = center.x + (Math.random() - 0.5) * AREA;
          arr[i * 3 + 2] = center.z + (Math.random() - 0.5) * AREA;
        }
      }
      attr.needsUpdate = true;
    },
  };
}
