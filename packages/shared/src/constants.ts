/** Networking, simulation and world constants shared by client and server. */

export const PROTOCOL_VERSION = 3;

/** Authoritative snapshot frequency. */
export const SERVER_TICK_RATE = 30;
/** Fixed physics / input simulation frequency. */
export const PHYSICS_TICK_RATE = 60;
export const FIXED_DT = 1 / PHYSICS_TICK_RATE;
export const SNAPSHOT_INTERVAL = PHYSICS_TICK_RATE / SERVER_TICK_RATE;

export const MAX_PLAYERS = 16;
export const TEAM_SIZE = 8;
export const MATCH_TICKETS = 50;

export const MAP_ID = 'fjord_fiesta';
export const MAP_SIZE = 800;
export const MAP_HALF_SIZE = MAP_SIZE / 2;
export const MAP_SEGMENTS = 160;
export const WATER_LEVEL = 0;
export const WORLD_MIN_Y = -20;
export const WORLD_MAX_Y = 140;

export const GRAVITY = -24;
export const PLAYER_EYE_HEIGHT = 1.58;
export const PLAYER_STEP_HEIGHT = 0.45;
export const PLAYER_MAX_SLOPE = (52 * Math.PI) / 180;
export const PLAYER_SNAP_TO_GROUND = 0.45;

export const NETWORK_PORT = 3000;
export const CLIENT_PORT = 5173;
export const WS_PATH = '/ws';

/** Maximum number of player inputs the server will buffer per player. */
export const MAX_INPUT_BACKLOG = 6;
/** Maximum number of not-yet-acknowledged inputs replayed during reconciliation. */
export const MAX_PREDICTION_REPLAY = 24;

export const INTERACT_RANGE = 3.2;
export const WATER_RESPAWN_DEPTH = 1.65;
export const FALL_RESPAWN_Y = -12;

/** Universal emergency parachute, independent of the Slot-3 umbrella. */
export const PARACHUTE_DEPLOY_FALL_SPEED = -6.5;
export const PARACHUTE_MIN_CLEARANCE = 4.5;
export const PARACHUTE_AUTO_OPEN_DELAY = 1.2;
export const PARACHUTE_SINK_SPEED = -3.8;
export const PARACHUTE_HOVER_SINK_SPEED = -1.5;
export const PARACHUTE_DIVE_SINK_SPEED = -4.8;
export const PARACHUTE_FORWARD_SPEED = 8.5;
export const PARACHUTE_HOVER_SPEED = 1.5;
export const PARACHUTE_STRAFE_SPEED = 4.5;
export const PARACHUTE_SWAY_ANGLE = (20 * Math.PI) / 180;
export const PARACHUTE_REPAIR_TIME = 6;
