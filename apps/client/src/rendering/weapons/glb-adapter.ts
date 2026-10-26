import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { WeaponId } from '@frost-and-flamingos/shared';
import { registerWeaponProp, type HoldSpec, type HoldStyle, type WeaponProp } from '../glb/props';
import { HERO_WEAPON_IDS, type WeaponPose } from './designs';
import { buildHeroWeapon } from './hero-weapon';

/**
 * Plugs the hero weapons into the painted soldiers' hand-attach API
 * (glb/props.ts registerWeaponProp): wrist-space props whose hold data maps
 * onto the animator's HoldSpec, refreshed every frame from the prop so the
 * state-dependent holds (game / wardrobe / umbrella gliding) follow.
 */
const GLB_STYLE: Readonly<Record<WeaponPose, HoldStyle>> = {
  rifle: 'rifle',
  hip: 'rifle',
  pistol: 'pistol',
  launcher: 'launcher',
  knife: 'melee',
  polearm: 'polearm',
  umbrella: 'umbrella',
  horn: 'launcher',
};

function heroWeaponProp(scene: Scene, id: WeaponId, material: ShaderMaterial): WeaponProp | null {
  const weapon = buildHeroWeapon(scene, id, material, { origin: 'wrist' });
  if (!weapon) return null;
  const pose = weapon.pose;
  const hold: HoldSpec = {
    style: GLB_STYLE[weapon.hold.pose],
    support: pose.support,
    tilt: pose.tilt,
    offset: pose.shoulder,
    yaw: pose.yaw,
    anchor: 'shoulders',
    rear: weapon.rear,
  };
  return {
    mesh: weapon.mesh,
    hold,
    muzzle: weapon.muzzle,
    fire: () => weapon.fire(),
    animate: (deltaSeconds, state) => {
      weapon.animate(deltaSeconds, state);
      hold.tilt = pose.tilt;
      hold.offset = pose.shoulder;
      hold.yaw = pose.yaw;
    },
    reset: () => {
      weapon.reset();
      hold.tilt = pose.tilt;
      hold.offset = pose.shoulder;
      hold.yaw = pose.yaw;
    },
  };
}

let registered = false;

/** Registers every hero weapon with the painted-character views (idempotent). */
export function registerHeroWeaponProps(): void {
  if (registered) return;
  registered = true;
  for (const id of HERO_WEAPON_IDS) registerWeaponProp(id, heroWeaponProp);
}
