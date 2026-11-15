// Weapons: three guns with named numbers, one view model, one spread model,
// and aim-down-sights. Spread punishes firing on the move: still < crouched
// < walking < running < air. Aiming (right mouse) narrows the field of view,
// slows the walk, centres the gun and cuts spread to less than half —
// stopping to aim pays, and the crosshair shows it. A head shot multiplies
// damage (see combat.js). The rig owns the numbers; main.js owns the ray
// and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'P9 SIDEARM', price: 0, damage: 26, headMult: 3, mag: 12, reserveMax: 48, gap: 0.18, reload: 1.4, spreadStill: 0.0018, spreadMove: 0.02, kick: 0.006, auto: false },
  rifle: { id: 'rifle', name: 'NK-7 CARBINE', price: 2700, damage: 34, headMult: 3, mag: 30, reserveMax: 90, gap: 0.096, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009, auto: true },
  smg: { id: 'smg', name: 'VK-9 REPEATER', price: 1500, damage: 24, headMult: 3, mag: 32, reserveMax: 96, gap: 0.075, reload: 1.7, spreadStill: 0.003, spreadMove: 0.034, kick: 0.007, auto: true },
};
export const GRENADE_PRICE = 300;
export const SMOKE_PRICE = 250;
export const ARMOUR_PRICE = 800;
export const AMMO_PRICE = 200;
const MOVE_REFERENCE = 5.2;
const MUZZLE_TIME = 0.06;

export function createWeaponRig(camera) {
  // Slim gunmetal view model: dark body, amber sight post, two-tone grip.
  // It frames the view instead of filling it — V1's pale slab is gone.
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1a2027'), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color('#39424c'), roughness: 0.45, metalness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.36), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.34), grip);
  barrel.position.set(0, 0.02, -0.32);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.18), grip);
  stock.position.set(0, -0.015, 0.26);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), grip);
  mag.position.set(0, -0.09, -0.02);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.035, 0.01), accent);
  sight.position.set(0, 0.055, -0.24);
  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.01), accent);
  rearSight.position.set(0, 0.05, 0.08);
  model.add(receiver, barrel, stock, mag, sight, rearSight);
  // Low and to the right, angled slightly in toward the crosshair.
  model.position.set(0.24, -0.24, -0.45);
  model.rotation.y = -0.05;
  camera.add(model);

  // Muzzle flash: a plus of two thin bars with a pale core, so it reads as a
  // starburst from the front instead of a floating block. It sits at the
  // barrel tip. (Two squares crossed at 90 degrees would just be one square.)
  const flash = new THREE.Group();
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
  const flashH = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.035), flashMat);
  const flashV = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.12), flashMat);
  const flashCore = new THREE.Mesh(
    new THREE.PlaneGeometry(0.045, 0.045),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0'), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.add(flashH, flashV, flashCore);
  flash.position.set(0.24, -0.22, -0.9);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 2.5);
  flashLight.position.set(0.24, -0.2, -0.75);
  camera.add(flashLight);

  const state = {
    weapon: 'pistol', mag: 12, reserve: 48, cooldown: 0, reloadLeft: 0,
    flash: 0, kick: 0, owned: { pistol: true }, grenades: 0, smokes: 0, aiming: false, aimBlend: 0,
  };

  function def() {
    return WEAPONS[state.weapon];
  }

  function applyModel() {
    // One view model, reshaped per weapon: short pistol, long rifle, stubby SMG.
    const scale = state.weapon === 'pistol' ? 0.55 : state.weapon === 'smg' ? 0.65 : 0.7;
    model.scale.set(scale, scale, scale);
    stock.visible = state.weapon !== 'pistol';
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    // Aiming slides the gun to the centre of the view and steadies it.
    const target = state.aiming ? 1 : 0;
    state.aimBlend += (target - state.aimBlend) * Math.min(1, dt * 12);
    const b = state.aimBlend;
    model.position.x = 0.24 * (1 - b) + 0.0 * b;
    model.position.y = -0.24 * (1 - b) + -0.21 * b;
    model.position.z = -0.45 - 0.05 * b + state.kick;
    model.rotation.x = state.kick * 2.2;
    model.rotation.y = -0.05 * (1 - b);
    // The flash stays at the barrel tip as the gun slides to the centre.
    flash.position.set(model.position.x, model.position.y + 0.02, -0.9);
    flash.visible = state.flash > 0;
    flashLight.position.set(model.position.x, model.position.y + 0.04, -0.75);
    flashLight.intensity = state.flash > 0 ? 2 : 0;
    if (state.reloadLeft > 0) {
      const d = def();
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, ((d.reload - state.reloadLeft) * 2) / d.reload);
      if (state.reloadLeft === 0) {
        const need = d.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || state.mag === d.mag || state.reserve === 0) return false;
      state.reloadLeft = d.reload;
      return true;
    },
    spread(speed, crouching, airborne) {
      const d = def();
      let s = d.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * d.spreadMove;
      if (crouching) s *= 0.6;
      if (airborne) s *= 2.2;
      if (state.aiming) s *= 0.42;
      return s;
    },
    equip(id) {
      if (!state.owned[id] || state.weapon === id) return false;
      state.weapon = id;
      const d = def();
      state.mag = d.mag;
      state.reserve = d.reserveMax;
      state.reloadLeft = 0;
      state.cooldown = 0.25;
      applyModel();
      return true;
    },
    give(id) {
      state.owned[id] = true;
      this.equip(id);
    },
    refill() {
      const d = def();
      state.mag = d.mag;
      state.reserve = d.reserveMax;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    resetForRound(keepWeapons) {
      if (!keepWeapons) {
        state.owned = { pistol: true };
        state.weapon = 'pistol';
        state.grenades = 0;
        state.smokes = 0;
      }
      this.refill();
      applyModel();
    },
  };
}
