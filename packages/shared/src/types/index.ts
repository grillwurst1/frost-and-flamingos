export type Faction = 'alpine' | 'lagoon';
export type ClassId = 'allrounder' | 'heavy' | 'infiltrator';
export type Locale = 'en' | 'de';

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type WeaponSlot = 1 | 2 | 3;

export type GimmickWeaponId =
  | 'snow_cannon'
  | 'sand_flamer'
  | 'crossbow'
  | 'halberd'
  | 'umbrella'
  | 'horn';

export type MainWeaponId =
  | 'smg'
  | 'shotgun'
  | 'lmg'
  | 'bazooka'
  | 'sniper'
  | 'silenced_pistol'
  | 'knife';

export type WeaponId = MainWeaponId | GimmickWeaponId;

export interface Loadout {
  primary: MainWeaponId;
  secondary: MainWeaponId;
  gimmick: GimmickWeaponId;
}

export type HeadgearId =
  | 'head_none'
  | 'head_tirol'
  | 'head_fondue_pot'
  | 'head_marmot_fur'
  | 'head_captain_cap'
  | 'head_watermelon'
  | 'head_flamingo_hat'
  | 'head_diving_bell';

export type FaceId =
  | 'face_none'
  | 'face_full_beard'
  | 'face_mustache'
  | 'face_icicle_beard'
  | 'face_bubble_pipe'
  | 'face_snorkel_mask'
  | 'face_eyepatch_beard'
  | 'face_flamingo_shades'
  | 'face_sunscreen';

export type TorsoId =
  | 'torso_tracht_shirt'
  | 'torso_dirndl_vest'
  | 'torso_loden_coat'
  | 'torso_hawaii_shirt'
  | 'torso_flamingo_ring'
  | 'torso_bathrobe'
  | 'torso_bare_suspenders'
  | 'torso_barrel_armor';

export type BackId =
  | 'back_none'
  | 'back_cuckoo_clock'
  | 'back_leather_pack'
  | 'back_lifebuoy'
  | 'back_surfboard'
  | 'back_mini_bbq';

export type HandsId =
  | 'hands_bare'
  | 'hands_mittens'
  | 'hands_boxing'
  | 'hands_pirate_hook'
  | 'hands_gold_watch';

export type LegsId =
  | 'legs_lederhosen'
  | 'legs_striped_trousers'
  | 'legs_olive_pants'
  | 'legs_boardshorts'
  | 'legs_long_johns';

export type FeetId =
  | 'feet_mountain_boots'
  | 'feet_ski_boots'
  | 'feet_dive_flippers'
  | 'feet_sandals_socks'
  | 'feet_peg_leg';

/** Body presentation is a continuous morph: 0 = masculine, 1 = feminine. */
export type BodyType = number;

export interface Cosmetics {
  classId: ClassId;
  bodyType: BodyType;
  skinToneIndex: number;
  hairColorIndex: number;
  hairStyleIndex: number;
  headgear: HeadgearId;
  face: FaceId;
  torso: TorsoId;
  back: BackId;
  hands: HandsId;
  legs: LegsId;
  feet: FeetId;
  voicePitch: number;
}

export interface PlayerProfile {
  displayName: string;
  faction: Faction;
  cosmetics: Cosmetics;
  loadout: Loadout;
}

export type DeathType =
  | 'RAGDOLL_NORMAL'
  | 'HELMET_POP'
  | 'BLAST_LAUNCH'
  | 'ELEMENTAL_DEATH';

/**
 * Emergency parachute state. Every player owns one independently of the
 * Slot-3 umbrella gimmick. The wire format stores this as one byte.
 */
export const ParachuteState = {
  Closed: 0,
  Intact: 1,
  Tattered: 2,
  CollapsedFalling: 3,
} as const;

export type ParachuteState = (typeof ParachuteState)[keyof typeof ParachuteState];

export interface WindState {
  angle: number;
  strength: number;
}

export type DestructibleStage = 0 | 1 | 2 | 3;
export type BridgeStage = 'intact' | 'broken' | 'patched';

export interface DestructibleState {
  id: number;
  stage: DestructibleStage;
  hp: number;
  burning: boolean;
}

export interface BridgeState {
  id: number;
  stage: BridgeStage;
  hp: number;
}

export interface CraterState {
  x: number;
  z: number;
  radius: number;
  depth: number;
}

/**
 * Bit flags used by C2S_INPUT. The layout is the shared contract for every
 * milestone, so later combat and vehicle actions already have stable bits.
 */
export const InputButton = {
  Forward: 1 << 0,
  Backward: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Jump: 1 << 4,
  Crouch: 1 << 5,
  Sprint: 1 << 6,
  FirePrimary: 1 << 7,
  FireSecondary: 1 << 8,
  Reload: 1 << 9,
  Interact: 1 << 10,
  Heal: 1 << 11,
  Wrench: 1 << 12,
  Skill1: 1 << 13,
  Skill2: 1 << 14,
  Skill3OrTaunt: 1 << 15,
} as const;

export type InputButtonMask = number;

export interface PlayerInput {
  sequence: number;
  buttons: InputButtonMask;
  yaw: number;
  pitch: number;
  weaponSlot: WeaponSlot;
}

export interface PlayerState {
  id: number;
  faction: Faction;
  classId: ClassId;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  hp: number;
  maxHp: number;
  grounded: boolean;
  alive: boolean;
  crouched: boolean;
  swimming: boolean;
  sprinting: boolean;
  rolling: boolean;
  parachuteState: ParachuteState;
  weaponSlot: WeaponSlot;
  ammo: number;
  reserve: number;
  reloading: boolean;
  shield: number;
  kills: number;
  deaths: number;
  skillCooldown1: number;
  skillCooldown2: number;
  skillCooldown3: number;
  cloaked: boolean;
  lastProcessedInput: number;
}

export interface VehicleSnapshot {
  id: number;
  type: number;
  position: Vec3;
  yaw: number;
  health: number;
}

export interface WorldSnapshot {
  serverTick: number;
  weatherBalance: number;
  windAngle: number;
  windStrength: number;
  ticketsAlpine: number;
  ticketsLagoon: number;
  turretStates: number;
  players: PlayerState[];
  vehicles: VehicleSnapshot[];
}

export interface MapStateSync {
  destructibles: DestructibleState[];
  bridges: BridgeState[];
  craters: CraterState[];
}

export type GameEventType =
  | 'COMIC_HIT'
  | 'KILL_RAGDOLL'
  | 'KILL_HELMET_POP'
  | 'KILL_BLAST_LAUNCH'
  | 'KILL_ELEMENTAL'
  | 'PINBALL_BOING_HIT'
  | 'TURRET_CAPTURED'
  | 'PROP_EXPLODE'
  | 'ENV_STAGE_CHANGE'
  | 'ENV_EXTINGUISH'
  | 'ENV_BRIDGE_REPAIR'
  | 'TERRAIN_CRATER'
  | 'FLAMINGO_BOOST'
  | 'TANK_CANNON_FIRE'
  | 'CUCKOO_POP'
  | 'GONDOLA_BRAKE'
  | 'PARACHUTE_POPPED'
  | 'WEAPON_FIRED'
  | 'PLAYER_RESPAWNED'
  | 'SKILL_USED';

export interface GameEvent {
  eventType: GameEventType;
  actorId: number;
  targetId: number;
  paramX: number;
  paramZ: number;
  paramValue: number;
}

export interface WelcomeMessage {
  playerId: number;
  profile: PlayerProfile;
  serverTick: number;
  spawn: Vec3;
  protocolVersion: number;
}

export interface ServerHello {
  protocolVersion: number;
  profile: PlayerProfile;
}

/** Authoritative profile broadcast for one player (including the local one). */
export interface ProfileMessage {
  playerId: number;
  profile: PlayerProfile;
}

export interface PingPacket {
  clientTimeMs: number;
}

export interface PongPacket {
  clientTimeMs: number;
  serverTick: number;
}
export * from './map.js';
