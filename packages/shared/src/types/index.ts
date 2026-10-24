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
  | 'none'
  | 'felt_hat'
  | 'captains_cap'
  | 'fondue_helmet'
  | 'melon_helmet'
  | 'flamingo_hat'
  | 'marmot_hat'
  | 'diving_bell';

export type FaceId =
  | 'none'
  | 'full_beard'
  | 'handlebar'
  | 'icicle_beard'
  | 'bubble_pipe'
  | 'eyepatch'
  | 'snorkel'
  | 'flamingo_sunglasses'
  | 'sunscreen';

export type TorsoId =
  | 'edelweiss_shirt'
  | 'loden_coat'
  | 'dirndl'
  | 'hawaiian_shirt'
  | 'bathrobe'
  | 'bare_suspenders'
  | 'swim_ring'
  | 'barrel_armor';

export type BackId =
  | 'none'
  | 'rucksack'
  | 'cuckoo_clock'
  | 'surfboard'
  | 'bbq_grill'
  | 'lifebuoy';

export type HandsId = 'none' | 'mittens' | 'boxing_gloves' | 'hook_hand' | 'gold_watch';

export type LegsId =
  | 'lederhosen'
  | 'breeches'
  | 'boardshorts'
  | 'long_johns';

export type FeetId =
  | 'mountain_boots'
  | 'ski_boots'
  | 'dive_flippers'
  | 'flip_flops'
  | 'peg_leg';

export interface Cosmetics {
  classId: ClassId;
  bodyType: number;
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

/** Bit flags used by C2S_INPUT. */
export const InputButton = {
  Forward: 1 << 0,
  Backward: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Jump: 1 << 4,
  Sprint: 1 << 5,
  Fire: 1 << 6,
  AltFire: 1 << 7,
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
  | 'GONDOLA_BRAKE';

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
  faction: Faction;
  classId: ClassId;
  serverTick: number;
  spawn: Vec3;
  protocolVersion: number;
}

export interface ServerHello {
  protocolVersion: number;
  displayName: string;
}

export interface PingPacket {
  clientTimeMs: number;
}

export interface PongPacket {
  clientTimeMs: number;
  serverTick: number;
}
