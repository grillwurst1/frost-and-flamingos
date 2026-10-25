/** Binary opcodes used inside the authoritative match WebSocket. */
export const Opcode = {
  C2S_INPUT: 0x01,
  S2C_WORLD_SNAPSHOT: 0x02,
  C2S_FIRE_WEAPON: 0x03,
  S2C_GAME_EVENT: 0x04,
  S2C_MAP_STATE_SYNC: 0x05,
  C2S_HELLO: 0x06,
  S2C_WELCOME: 0x07,
  C2S_PING: 0x08,
  S2C_PONG: 0x09,
  S2C_PROFILE: 0x0a,
  C2S_PROFILE_UPDATE: 0x0b,
} as const;

export type OpcodeValue = (typeof Opcode)[keyof typeof Opcode];

export const FACTION_CODE = {
  alpine: 0,
  lagoon: 1,
} as const;

export const CLASS_CODE = {
  allrounder: 0,
  heavy: 1,
  infiltrator: 2,
  mascot: 3,
  drifter: 4,
} as const;

export const PLAYER_FLAG = {
  Alive: 1 << 0,
  Grounded: 1 << 1,
  Crouched: 1 << 2,
  Swimming: 1 << 3,
  Sprinting: 1 << 4,
  Rolling: 1 << 5,
  Reloading: 1 << 6,
  Cloaked: 1 << 7,
} as const;

/** Second per-player flag byte (protocol 5): authoritative status effects. */
export const PLAYER_STATUS_FLAG = {
  Dazed: 1 << 0,
  Slowed: 1 << 1,
  Boosted: 1 << 2,
  Slippery: 1 << 3,
  /** Protocol 7: a friendly drifter's aura heals this player. */
  AuraHealed: 1 << 4,
  /** Protocol 7: a friendly drifter's aura refills this player's reserve ammo. */
  AuraResupplied: 1 << 5,
  /** Protocol 7, drifters only: the aura is supplying at least one teammate. */
  AuraActive: 1 << 6,
} as const;

/** Mascot block flags; bits 4–5 carry the coconut's used jumps. */
export const MASCOT_FLAG = {
  Pounding: 1 << 0,
  Skidding: 1 << 1,
  Galloping: 1 << 2,
  Exhausted: 1 << 3,
} as const;
export const MASCOT_JUMPS_SHIFT = 4;

export const GameEventCode = {
  COMIC_HIT: 1,
  KILL_RAGDOLL: 2,
  KILL_HELMET_POP: 3,
  KILL_BLAST_LAUNCH: 4,
  KILL_ELEMENTAL: 5,
  PINBALL_BOING_HIT: 6,
  TURRET_CAPTURED: 7,
  PROP_EXPLODE: 8,
  ENV_STAGE_CHANGE: 9,
  ENV_EXTINGUISH: 10,
  ENV_BRIDGE_REPAIR: 11,
  TERRAIN_CRATER: 12,
  FLAMINGO_BOOST: 13,
  TANK_CANNON_FIRE: 14,
  CUCKOO_POP: 15,
  GONDOLA_BRAKE: 16,
  PARACHUTE_POPPED: 17,
  WEAPON_FIRED: 18,
  PLAYER_RESPAWNED: 19,
  SKILL_USED: 20,
  /** actor = mascot, target = victim, param = contact point (dm), value = damage (0 = friendly bump). */
  MASCOT_RAM: 21,
  /** Hoof Stomp / Ground Pound shockwave. param = centre (dm), value = 1 stomp / 2 pound. */
  MASCOT_IMPACT: 22,
  /** Coconut-milk puddle. param = centre (dm), value = lifetime in deciseconds. */
  MASCOT_PUDDLE: 23,
} as const;

export type GameEventCodeValue = (typeof GameEventCode)[keyof typeof GameEventCode];
