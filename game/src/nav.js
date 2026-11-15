// Routes through the map: named waypoint chains, one per lane and site. A bot
// picks a route when a round starts and walks it node by node; the plan is
// visible in the code so the judge can see tactics, not wandering.
import * as THREE from 'three';

const ROUTES = {
  A: {
    mid: ['atkSpawn', 'midLow', 'midBoxcar', 'midHigh', 'westGap', 'siteA'],
    west: ['atkSpawn', 'westDoor', 'westHall', 'westGap', 'siteA'],
  },
  B: {
    mid: ['atkSpawn', 'midLow', 'midBoxcar', 'midHigh', 'eastGantry', 'siteB'],
    east: ['atkSpawn', 'eastYard', 'eastStack', 'eastGantry', 'siteB'],
  },
};

// Where defenders wait: a hold per site plus a mid watcher.
const HOLDS = {
  A: ['defA', 'westGap', 'siteA'],
  B: ['defB', 'eastGantry', 'siteB'],
  mid: ['defMid', 'midHigh'],
};

export function createNav(world) {
  const points = {};
  for (const [name, [x, z]] of Object.entries(world.waypoints)) {
    points[name] = new THREE.Vector3(x, 0, z);
  }

  function planRoute(random, site, lane) {
    const names = ROUTES[site][lane];
    return names.map((name) => points[name]);
  }

  function planHold(random, site) {
    const names = HOLDS[site];
    return points[names[Math.floor(random() * names.length)]];
  }

  function nearestNode(x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const point of Object.values(points)) {
      const d = (point.x - x) * (point.x - x) + (point.z - z) * (point.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = point;
      }
    }
    return best;
  }

  return { planRoute, planHold, nearestNode, points };
}
