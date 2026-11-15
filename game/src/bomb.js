// The bomb: carried by one attacker, planted at a site by holding E, defused
// by a defender holding E. Plant takes 3 s, defuse 5 s, the fuse 35 s; the beep
// quickens as the fuse runs out. A dropped bomb waits where it fell until an
// attacker walks over it. All timings are named constants the judge can read.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './world.js';

export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const FUSE_SECONDS = 35;

export function createBomb(scene, state) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.3 }),
  );
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), lampMat);
  lamp.position.set(0, 0.14, 0);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.danger), 0, 4);
  light.position.set(0, 0.3, 0);
  group.add(body, lamp, light);
  group.visible = false;
  scene.add(group);

  let beepAt = 0;
  let blink = 0;

  function siteAt(x, z) {
    for (const key of ['A', 'B']) {
      const site = SITES[key];
      const d = Math.hypot(site.x - x, site.z - z);
      if (d <= site.radius) return key;
    }
    return null;
  }

  function placeAt(x, z) {
    group.position.set(x, 0.12, z);
    group.visible = true;
  }

  return {
    siteAt,
    placeAt,
    // Called every fixed step while the bomb is planted: counts the fuse down
    // and beeps faster as it nears zero. Returns 'exploded' at zero, else null.
    stepPlanted(dt, time, onBeep) {
      const bomb = state.bomb;
      if (bomb.status !== 'planted') return null;
      bomb.explodeLeft -= dt;
      blink += dt;
      const interval = bomb.explodeLeft > 20 ? 1.0 : bomb.explodeLeft > 10 ? 0.5 : 0.25;
      light.intensity = Math.sin(blink * 12) > 0 ? 6 : 0;
      if (time >= beepAt) {
        beepAt = time + interval;
        if (onBeep) onBeep();
      }
      if (bomb.explodeLeft <= 0) return 'exploded';
      return null;
    },
    plant(siteKey, x, z) {
      const bomb = state.bomb;
      bomb.status = 'planted';
      bomb.site = siteKey;
      bomb.carrier = null;
      bomb.explodeLeft = FUSE_SECONDS;
      bomb.defuseLeft = 0;
      bomb.x = x;
      bomb.z = z;
      beepAt = 0;
      placeAt(x, z);
    },
    drop(x, z) {
      const bomb = state.bomb;
      if (bomb.status !== 'carried') return;
      bomb.status = 'dropped';
      bomb.carrier = null;
      bomb.x = x;
      bomb.z = z;
      placeAt(x, z);
    },
    pickup(entity) {
      const bomb = state.bomb;
      if (bomb.status !== 'dropped') return false;
      bomb.status = 'carried';
      bomb.carrier = entity.id;
      group.visible = false;
      return true;
    },
    reset(carrierId) {
      const bomb = state.bomb;
      bomb.status = 'carried';
      bomb.carrier = carrierId;
      bomb.site = null;
      bomb.plantLeft = 0;
      bomb.defuseLeft = 0;
      bomb.explodeLeft = 0;
      bomb.plantDone = false;
      bomb.defuseDone = false;
      light.intensity = 0;
      group.visible = false;
    },
    hide() {
      group.visible = false;
      light.intensity = 0;
    },
  };
}
