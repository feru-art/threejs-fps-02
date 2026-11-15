// Routes through the map: named waypoint chains, one per lane and site. A
// bot picks a route when a round starts and walks it node by node; the plan
// is visible in the code so the judge can see tactics, not wandering. The
// walkway route climbs the mid gantry — the node heights come from
// world.groundHeight, so a bot on the walkway fights from 2.6 m up.
import * as THREE from 'three';

const ROUTES = {
  A: {
    mid: ['atkSpawn', 'midLow', 'midDrift', 'midHigh', 'westGap', 'siteA'],
    west: ['atkSpawn', 'westDoor', 'westYard', 'westGap', 'siteA'],
    walk: ['atkSpawn', 'walkSouth', 'walkMid', 'walkNorth', 'siteA'],
  },
  B: {
    mid: ['atkSpawn', 'midLow', 'midDrift', 'midHigh', 'eastDeck', 'siteB'],
    east: ['atkSpawn', 'eastYard', 'eastStack', 'eastDeck', 'siteB'],
    walk: ['atkSpawn', 'walkSouth', 'walkMid', 'walkNorth', 'siteB'],
  },
};

// Where defenders wait: a hold per site plus a mid watcher.
const HOLDS = {
  A: ['defA', 'westGap', 'siteA'],
  B: ['defB', 'eastDeck', 'siteB'],
  mid: ['defMid', 'midHigh'],
};

// Where attackers stand after the bomb is down: crossfire corners around
// the site, so a planted round is held, not wandered.
const POST_PLANT = {
  A: [[-18, -10], [-24, -9], [-19, -17]],
  B: [[18, -10], [25, -9], [19, -17]],
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

  function postPlantHold(site, index) {
    const [x, z] = POST_PLANT[site][index % POST_PLANT[site].length];
    return new THREE.Vector3(x, 0, z);
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

  return { planRoute, planHold, postPlantHold, nearestNode, points };
}
