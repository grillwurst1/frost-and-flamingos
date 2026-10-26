import RAPIER from '@dimforge/rapier3d-compat';
import {
  FIXED_DT,
  GRAVITY,
  InputButton,
  NO_TOWERS_HELD,
  PHYSICS_TICK_RATE,
  VEHICLE_ABANDON_SECONDS,
  VEHICLE_BEACHED_SECONDS,
  VEHICLE_ENTER_HEIGHT,
  VEHICLE_ENTER_RANGE,
  VEHICLE_FLAG,
  VEHICLE_HORN_COOLDOWN,
  VEHICLE_KIND_TABLE,
  VEHICLE_SLOTS,
  VEHICLE_WRECK_BLAST,
  VEHICLES as VEHICLE_DEFINITIONS,
  WATER_LEVEL,
  WEAPON_STATS,
  WEAPON_TABLE,
  classMayUseVehicles,
  collidesWithVehicles,
  distanceToHull,
  distanceToVehicle,
  exitCandidates,
  mayEnterVehicle,
  rayVehicleHull,
  sampleMapHeight,
  vehicleLocalToWorld,
  vehicleSlotActive,
  vehicleTicks,
  vehicleWorldToLocal,
  type CharacterBody,
  type DrivableVehicleKind,
  type Faction,
  type GameEvent,
  type PhysicsWorld,
  type PlayerInput,
  type PlayerProfile,
  type TowerHeldQuery,
  type Vec3,
  type VehicleBody,
  type VehicleDefinition,
  type VehicleSlot,
  type VehicleSnapshot,
  type VehicleWeaponDefinition,
  type WeaponId,
} from '@frost-and-flamingos/shared';
import { normalizeDirection, raycastTargets, type CombatTarget } from './combat.js';

/** The part of a room player the vehicle code reads and writes. */
export interface VehicleOccupant {
  readonly id: number;
  readonly isBot: boolean;
  profile: PlayerProfile;
  character: CharacterBody;
  alive: boolean;
  spawnProtectionUntil: number;
}

/** Room services the vehicle manager uses (closures over MatchRoom internals). */
export interface VehicleRoomHooks<P extends VehicleOccupant> {
  physicsTick(): number;
  snapshotTick(): number;
  players(): Iterable<P>;
  player(id: number): P | undefined;
  damagePlayer(target: P, attacker: P | null, damage: number, weaponId: WeaponId | null, headshot: boolean): void;
  /** Room splash for players and critters (skips the owner's faction, broadcasts PROP_EXPLODE). */
  explode(owner: P, position: Vec3, damage: number, radius: number, weaponId: WeaponId | null): void;
  combatTargets(owner: P, clientTick: number): CombatTarget[];
  broadcastEvent(event: GameEvent): void;
  /** Ambient critters (hens): nearest hit along a ray, kills (CRITTER_KILLED with the weapon). */
  critterRaycast?(origin: Vec3, direction: Vec3, maxDistance: number): { critterId: number; distance: number } | null;
  killCritter?(critterId: number, killerId: number, weaponId: WeaponId | null): void;
  killCrittersInSphere?(center: Vec3, radius: number, killerId: number, weaponId: WeaponId | null): void;
  /**
   * True during a ceasefire (the conquest results intermission, package 4T):
   * hulls take no damage and ram nobody, run-overs spare the hens.
   */
  ceasefire?(): boolean;
}

export type SeatResult = 'none' | 'seated' | 'hands';

type Lifecycle = 'active' | 'wreck' | 'waiting';

interface VehicleRecord {
  readonly slot: VehicleSlot;
  readonly definition: VehicleDefinition;
  body: VehicleBody | null;
  lifecycle: Lifecycle;
  hp: number;
  /** Player id per seat (0 = free). */
  seats: number[];
  /** Character object each seat was placed with (class changes rebuild it). */
  seatBodies: Array<CharacterBody | null>;
  wreckUntilTick: number;
  respawnAtTick: number;
  emptySinceTick: number;
  beachedSinceTick: number;
  drownedSinceTick: number;
  hornReadyTick: number;
  ramCooldowns: Map<number, number>;
  /** Faction of the last crew (empty vehicles keep it for friendly fire). */
  lastCrewFaction: Faction | null;
  lastAttackerId: number;
  lastWeaponId: WeaponId | null;
  drowned: boolean;
  /** Last driver and the tick they left the wheel (a coasting hull still credits them). */
  lastDriverId: number;
  driverLeftTick: number;
}

interface SeatInput {
  input: PlayerInput;
  trackButtons: boolean;
}

interface VehicleProjectile {
  ownerId: number;
  vehicleId: number;
  weapon: VehicleWeaponDefinition;
  position: Vec3;
  velocity: Vec3;
  expiresAtTick: number;
}

export interface VehicleRamRecord {
  vehicleId: number;
  driverId: number;
  victimId: number;
  damage: number;
  speed: number;
  tick: number;
}

export interface VehicleStatus {
  active: number;
  occupied: number;
  wrecks: number;
  projectiles: number;
  shots: number;
  rams: number;
  destroyed: number;
  list: Array<{ id: number; kind: DrivableVehicleKind; lifecycle: Lifecycle; hp: number; position: Vec3 | null; seats: number[] }>;
  lastRam: VehicleRamRecord | null;
}

/** Enter and exit with F (game-decisions §13.8); E stays the class skill. */
const ENTER_BUTTONS = InputButton.Interact;
/** Horn key: the H key travels on the otherwise unused Heal bit. */
export const HORN_BUTTON = InputButton.Heal;
const SWITCH_BUTTON = InputButton.Crouch;
const RAM_VICTIM_COOLDOWN_TICKS = Math.round(PHYSICS_TICK_RATE * 0.8);
const RAM_LAUNCH_SECONDS = 0.9;
const SHOVE_SPEED = 3.2;
const EMPTY_DRIFT_DISTANCE = 25;
const PLAYER_RADIUS_PAD = 0.45;
const SPAWN_CLEAR_RETRY_TICKS = PHYSICS_TICK_RATE;
/** A hull still rams for its last driver this long after they bail out. */
const RAM_DRIVER_GRACE_TICKS = Math.round(PHYSICS_TICK_RATE * 2.5);
/** Feet this close below the roof (or higher) count as standing on the hull. */
const ROOF_TOLERANCE = 0.25;
/** A pushed-out player never lands on terrain more than this above their feet. */
const PUSH_OUT_MAX_RISE = 0.6;
/** Feet of a swimmer floating at the surface (the character motor's float depth). */
const EXIT_SWIM_FEET_Y = WATER_LEVEL - 1.1;

function horizontalLength(x: number, z: number): number {
  return Math.hypot(x, z);
}

function toDecimetres(value: number): number {
  return Math.max(-32767, Math.min(32767, Math.round(value * 10)));
}

function toMilli(value: number): number {
  return Math.max(-32767, Math.min(32767, Math.round(value * 1000)));
}

function pressed(buttons: number, previous: number, mask: number): boolean {
  return (buttons & mask) !== 0 && (previous & mask) === 0;
}

/**
 * Server-authoritative vehicles: spawning by slot trigger, seats, driving
 * (the shared VehicleBody motor), vehicle weapons and their projectiles,
 * run-overs, damage, destruction, crew ejection and respawn. MatchRoom calls
 * a handful of hooks; everything else lives here.
 */
export class VehicleManager<P extends VehicleOccupant> {
  private readonly physics: PhysicsWorld;
  private readonly hooks: VehicleRoomHooks<P>;
  private readonly records: VehicleRecord[];
  private readonly byId = new Map<number, VehicleRecord>();
  /** Seated player id → vehicle id. */
  private readonly seatOf = new Map<number, { vehicleId: number; seat: number }>();
  private readonly inputs = new Map<number, SeatInput>();
  private readonly projectiles: VehicleProjectile[] = [];
  private towerHeld: TowerHeldQuery = NO_TOWERS_HELD;
  /** Vehicle excluded from the next splash (it already took the direct hit). */
  private splashExclude = 0;
  private readonly stats = { shots: 0, rams: 0, destroyed: 0, lastRam: null as VehicleRamRecord | null };

  constructor(physics: PhysicsWorld, hooks: VehicleRoomHooks<P>) {
    this.physics = physics;
    this.hooks = hooks;
    this.records = VEHICLE_SLOTS.map((slot) => ({
      slot,
      definition: slotDefinition(slot),
      body: null,
      lifecycle: 'waiting' as Lifecycle,
      hp: 0,
      seats: slotDefinition(slot).seats.map(() => 0),
      seatBodies: slotDefinition(slot).seats.map(() => null),
      wreckUntilTick: 0,
      respawnAtTick: 0,
      emptySinceTick: 0,
      beachedSinceTick: 0,
      drownedSinceTick: 0,
      hornReadyTick: 0,
      ramCooldowns: new Map(),
      lastCrewFaction: null,
      lastAttackerId: 0,
      lastWeaponId: null,
      drowned: false,
      lastDriverId: 0,
      driverLeftTick: -1e9,
    }));
    for (const record of this.records) {
      this.byId.set(record.slot.id, record);
      if (vehicleSlotActive(record.slot, this.towerHeld)) this.spawn(record);
    }
  }

  /**
   * Tower ownership for `{ capture }` spawn triggers. Package 4T (conquest)
   * passes its real query (MatchRoom.isTowerHeldBy); without one no tower
   * counts as held. Slots the new query activates spawn at once, so the
   * forward vehicles of the round-start towers are there from the first tick.
   */
  setTowerQuery(query: TowerHeldQuery): void {
    this.towerHeld = query;
    for (const record of this.records) {
      if (record.lifecycle === 'waiting' && record.respawnAtTick === 0 && vehicleSlotActive(record.slot, query)) this.spawn(record);
    }
  }

  /** Round reset: every vehicle respawns polished at its start position. */
  resetAll(): void {
    for (const record of this.records) {
      this.ejectAll(record, false);
      this.removeBody(record);
      record.lifecycle = 'waiting';
      record.respawnAtTick = 0;
      if (vehicleSlotActive(record.slot, this.towerHeld)) this.spawn(record);
    }
    this.projectiles.length = 0;
  }

  // -------------------------------------------------------------------------
  // Room hooks
  // -------------------------------------------------------------------------

  /** True while the player sits in a protected seat (not hittable, no splash). */
  isShielded(playerId: number): boolean {
    const seat = this.seatOf.get(playerId);
    if (!seat) return false;
    const record = this.byId.get(seat.vehicleId);
    return !!record && record.definition.seats[seat.seat]?.exposed === false;
  }

  isSeated(playerId: number): boolean {
    return this.seatOf.has(playerId);
  }

  /** On foot, or in a seat that keeps the hands free (commander hatch, sidecar tub). */
  mayUseHandWeapons(playerId: number): boolean {
    const seat = this.seatOf.get(playerId);
    if (!seat) return true;
    return this.byId.get(seat.vehicleId)?.definition.seats[seat.seat]?.handWeapons === true;
  }

  /** Seat of a player as `{ vehicleId, seat }`, or null. */
  seatFor(playerId: number): { vehicleId: number; seat: number } | null {
    return this.seatOf.get(playerId) ?? null;
  }

  /**
   * Called from MatchRoom.applyInput for every input. Seated players hand
   * their input to the vehicle ('seated'; 'hands' = may still reload and
   * fire their own weapon). On foot, an F press next to a vehicle enters it.
   */
  handleInput(player: P, input: PlayerInput, previousButtons: number, trackButtons: boolean): SeatResult {
    if (!player.alive) return 'none';
    const seat = this.seatOf.get(player.id);
    if (!seat) {
      if (!trackButtons) return 'none';
      const wantsIn = pressed(input.buttons, previousButtons, ENTER_BUTTONS);
      // Mascots and drifters never board (same predicate as the client's enter prompt).
      if (!wantsIn || !classMayUseVehicles(player.profile.cosmetics.classId)) return 'none';
      const target = this.enterableNear(player);
      if (!target) return 'none';
      this.enter(player, target.record, target.seat);
      return 'seated';
    }
    const record = this.byId.get(seat.vehicleId);
    if (!record) return 'none';
    this.inputs.set(player.id, { input, trackButtons });
    if (trackButtons) {
      if (pressed(input.buttons, previousButtons, ENTER_BUTTONS)) {
        this.exit(player, record, seat.seat);
        return 'seated';
      }
      if (pressed(input.buttons, previousButtons, SWITCH_BUTTON)) this.switchSeat(player, record, seat.seat);
      if (pressed(input.buttons, previousButtons, HORN_BUTTON) && record.definition.seats[seat.seat]?.driver) {
        this.honk(player, record);
      }
    }
    const current = this.seatOf.get(player.id);
    const definition = current ? record.definition.seats[current.seat] : undefined;
    return definition?.handWeapons ? 'hands' : 'seated';
  }

  /**
   * Nearest analytic hit of an active vehicle along a ray (unit direction),
   * for hitscan weapons. `skipVehicle` ignores the shooter's own vehicle.
   */
  raycast(origin: Vec3, direction: Vec3, maxDistance: number, skipVehicle = 0): { id: number; distance: number } | null {
    let best: { id: number; distance: number } | null = null;
    for (const record of this.records) {
      if (record.lifecycle === 'waiting' || !record.body || record.slot.id === skipVehicle) continue;
      if (record.lifecycle === 'wreck' && record.definition.chassis === 'boat') continue;
      const distance = rayVehicleHull(record.definition, record.body.position, record.body.yaw, origin, direction, maxDistance);
      if (distance !== null && (!best || distance < best.distance)) best = { id: record.slot.id, distance };
    }
    return best;
  }

  /**
   * True when a hull (driven, parked or a smouldering wreck) covers a point on
   * the ground, within `margin` of its footprint: a spawn pad under a parked
   * vehicle counts as occupied. A deflating flamingo wreck has no collider.
   */
  hullCovers(point: Vec3, margin = 0.6): boolean {
    for (const record of this.records) {
      const body = record.body;
      if (!body || record.lifecycle === 'waiting') continue;
      if (record.lifecycle === 'wreck' && record.definition.chassis === 'boat') continue;
      const top = body.position.y + record.definition.halfExtents.y * 2;
      if (point.y > top + 1 || point.y < body.position.y - 2.5) continue;
      if (distanceToHull(record.definition, body.position, body.yaw, point) < margin) return true;
    }
    return false;
  }

  /** The vehicle a player sits in (their own shots skip it). */
  vehicleIdOf(playerId: number): number {
    return this.seatOf.get(playerId)?.vehicleId ?? 0;
  }

  /** Hitscan/beam/melee damage from a player's weapon. */
  damageFromWeapon(vehicleId: number, attacker: P, damage: number, weaponId: WeaponId): void {
    const record = this.byId.get(vehicleId);
    if (!record) return;
    const explosive = WEAPON_STATS[weaponId].fireMode === 'projectile' || WEAPON_STATS[weaponId].splashRadius > 0;
    this.damage(record, attacker, damage, weaponId, explosive ? 'explosive' : 'bullet');
  }

  /** Splash on vehicles (called from the room's explode). */
  explode(owner: P | null, position: Vec3, damage: number, radius: number, weaponId: WeaponId | null = null): void {
    if (radius <= 0) return;
    for (const record of this.records) {
      if (record.lifecycle !== 'active' || !record.body || record.slot.id === this.splashExclude) continue;
      const distance = distanceToVehicle(record.definition, record.body.position, record.body.yaw, position);
      if (distance > radius) continue;
      const falloff = Math.max(0.3, 1 - (distance / radius) * 0.7);
      this.damage(record, owner, damage * falloff, weaponId, 'explosive');
      // A little shove for the light vehicles.
      if (record.definition.chassis !== 'tracked') {
        const centre = record.body.position;
        const dx = centre.x - position.x;
        const dz = centre.z - position.z;
        const length = horizontalLength(dx, dz) || 1;
        const strength = 4 * falloff;
        record.body.push({ x: (dx / length) * strength, y: record.definition.chassis === 'boat' ? 0 : 2.5 * falloff, z: (dz / length) * strength });
      }
    }
  }

  /**
   * Bots: true when the world ray from a bot hit the hull of the vehicle its
   * target rides (inside the armour or on the roof), so the bot keeps firing
   * at it. A target merely using a hull as cover does not count.
   */
  isVehicleSurfaceNear(point: Vec3, target: Vec3, targetId: number, reach = 4): boolean {
    const riding = this.seatOf.get(targetId)?.vehicleId ?? 0;
    const character = this.hooks.player(targetId)?.character;
    for (const record of this.records) {
      if (record.lifecycle !== 'active' || !record.body) continue;
      const body = record.body;
      if (record.slot.id !== riding && !(character && this.onRoof(record, character.position, character.stats.radius))) continue;
      if (distanceToVehicle(record.definition, body.position, body.yaw, point) > 0.4) continue;
      if (distanceToVehicle(record.definition, body.position, body.yaw, target) <= reach) return true;
    }
    return false;
  }

  /**
   * Bots on foot sidestep enemy vehicles that are about to run them over:
   * a perpendicular sprint away from the predicted path, with a hop at the
   * last moment. Other inputs pass unchanged.
   */
  botAdjust(bot: P, input: PlayerInput): PlayerInput {
    // Hulls pass through a drifter: nothing to dodge.
    if (!bot.alive || this.seatOf.has(bot.id) || bot.character.form || !collidesWithVehicles(bot.character.collider)) return input;
    const feet = bot.character.position;
    for (const record of this.records) {
      const body = record.body;
      if (record.lifecycle !== 'active' || !body) continue;
      const driverId = record.seats[0] ?? 0;
      const driver = driverId ? this.hooks.player(driverId) : undefined;
      if (!driver || driver.profile.faction === bot.profile.faction) continue;
      const velocity = body.velocity;
      const speed = horizontalLength(velocity.x, velocity.z);
      if (speed < 3) continue;
      const position = body.position;
      const dx = feet.x - position.x;
      const dz = feet.z - position.z;
      const distance = horizontalLength(dx, dz);
      if (distance > 26 || Math.abs(feet.y - position.y) > 4) continue;
      const along = (dx * velocity.x + dz * velocity.z) / speed;
      if (along < 0) continue;
      const time = along / speed;
      if (time > 1.8) continue;
      const missX = dx - (velocity.x / speed) * along;
      const missZ = dz - (velocity.z / speed) * along;
      const miss = horizontalLength(missX, missZ);
      if (miss > record.definition.halfExtents.x + 1.8) continue;
      // Run sideways, away from the vehicle's path.
      const side = miss > 0.05 ? { x: missX / miss, z: missZ / miss } : { x: velocity.z / speed, z: -velocity.x / speed };
      let buttons = (input.buttons & ~(InputButton.Backward | InputButton.Left | InputButton.Right)) | InputButton.Forward | InputButton.Sprint;
      if (time < 0.55) buttons |= InputButton.Jump;
      return { ...input, buttons, yaw: Math.atan2(side.x, side.z) };
    }
    return input;
  }

  // -------------------------------------------------------------------------
  // Per tick
  // -------------------------------------------------------------------------

  /** Runs after the player loop and before the physics step. */
  step(): void {
    const tick = this.hooks.physicsTick();
    if (tick % 30 === 0) this.updateTriggers(tick);
    for (const record of this.records) {
      this.validateSeats(record);
      if (record.lifecycle === 'wreck') {
        if (record.body && record.definition.chassis === 'boat') {
          // The deflating flamingo zooms off; nothing to collide with.
          record.body.setColliderEnabled(false);
        }
        if (tick >= record.wreckUntilTick) {
          this.removeBody(record);
          record.lifecycle = 'waiting';
        }
        continue;
      }
      if (record.lifecycle === 'waiting') {
        if (record.respawnAtTick > 0 && tick >= record.respawnAtTick && vehicleSlotActive(record.slot, this.towerHeld)) {
          if (!this.spawn(record)) record.respawnAtTick = tick + SPAWN_CLEAR_RETRY_TICKS;
        }
        continue;
      }
      const body = record.body;
      if (!body) continue;
      const driverId = record.seats[0] ?? 0;
      const driverInput = driverId ? this.inputs.get(driverId) : undefined;
      const gunnerIndex = record.definition.seats.findIndex((seat) => seat.gunner);
      const gunnerId = gunnerIndex >= 0 ? record.seats[gunnerIndex] ?? 0 : 0;
      const gunnerInput = gunnerId ? this.inputs.get(gunnerId) : undefined;
      const occupied = record.seats.some((id) => id !== 0);
      if (!occupied && body.resting && !record.drowned) {
        this.updateEmptyTimers(record, tick);
        continue;
      }
      const trackButtons = driverInput?.trackButtons ?? gunnerInput?.trackButtons ?? true;
      body.simulate(driverInput?.input ?? null, gunnerInput?.input ?? null, trackButtons);
      for (const event of body.drainEvents()) {
        if (event.type === 'boost') {
          this.hooks.broadcastEvent({
            eventType: 'FLAMINGO_BOOST',
            actorId: driverId,
            targetId: record.slot.id,
            paramX: 0,
            paramZ: 0,
            paramValue: 0,
          });
        } else if (event.type === 'fire') {
          const gunner = gunnerId ? this.hooks.player(gunnerId) : undefined;
          if (gunner && gunner.alive) this.fire(record, gunner, event.origin, event.direction, event.yaw, event.pitch);
        }
      }
      this.updateEmptyTimers(record, tick);
      if (record.lifecycle !== 'active') continue;
      this.resolveRams(record, tick);
    }
    this.placeOccupants();
    this.updateProjectiles();
    this.inputs.clear();
  }

  snapshot(): VehicleSnapshot[] {
    const list: VehicleSnapshot[] = [];
    for (const record of this.records) {
      const body = record.body;
      if (record.lifecycle === 'waiting' || !body) continue;
      const state = body.state;
      let flags = 0;
      if (record.lifecycle === 'wreck') flags |= VEHICLE_FLAG.Wreck;
      if (state.grounded) flags |= VEHICLE_FLAG.Grounded;
      if (state.beached) flags |= VEHICLE_FLAG.Beached;
      if (state.afloat) flags |= VEHICLE_FLAG.Afloat;
      if (state.handbrake) flags |= VEHICLE_FLAG.Handbrake;
      if (record.drowned) flags |= VEHICLE_FLAG.Drowned;
      list.push({
        id: record.slot.id,
        type: VEHICLE_KIND_TABLE.code[record.slot.kind],
        position: state.position,
        yaw: state.yaw,
        health: Math.max(0, Math.ceil(record.hp)),
        velocity: state.velocity,
        yawRate: state.yawRate,
        steer: state.steer,
        turretYaw: state.turretYaw,
        turretPitch: state.turretPitch,
        flags,
        boostTicks: state.boostTicks,
        boostCooldownTicks: state.boostCooldownTicks,
        weaponCooldownTicks: state.weaponCooldownTicks,
        seats: [...record.seats],
      });
    }
    return list;
  }

  status(): VehicleStatus {
    return {
      active: this.records.filter((record) => record.lifecycle === 'active').length,
      occupied: this.records.filter((record) => record.seats.some((id) => id !== 0)).length,
      wrecks: this.records.filter((record) => record.lifecycle === 'wreck').length,
      projectiles: this.projectiles.length,
      shots: this.stats.shots,
      rams: this.stats.rams,
      destroyed: this.stats.destroyed,
      list: this.records.map((record) => ({
        id: record.slot.id,
        kind: record.slot.kind,
        lifecycle: record.lifecycle,
        hp: Math.ceil(record.hp),
        position: record.body ? record.body.position : null,
        seats: [...record.seats],
      })),
      lastRam: this.stats.lastRam,
    };
  }

  // -------------------------------------------------------------------------
  // DEV / tests
  // -------------------------------------------------------------------------

  /** Seats a player in a vehicle (DEV probe and tests). */
  devEnter(player: P, vehicleId: number, seat = 0): boolean {
    const record = this.byId.get(vehicleId);
    if (!record || record.lifecycle !== 'active' || !record.body) return false;
    if ((record.seats[seat] ?? 1) !== 0) return false;
    const current = this.seatOf.get(player.id);
    if (current) {
      const from = this.byId.get(current.vehicleId);
      if (from) this.freeSeat(from, current.seat);
    }
    this.enter(player, record, seat);
    return true;
  }

  /** Moves an active vehicle onto the ground (or the water) at x/z, facing `yaw` (DEV probe). */
  devPark(vehicleId: number, x: number, z: number, yaw: number): boolean {
    const record = this.byId.get(vehicleId);
    const body = record?.body;
    if (!record || !body || record.lifecycle !== 'active') return false;
    const hit = this.physics.raycast({ x, y: 160, z }, { x: 0, y: -1, z: 0 }, 220, body.colliderHandle);
    const y = record.definition.chassis === 'boat' ? 0 : (hit?.point.y ?? 0) + 0.04;
    body.teleport({ x, y, z }, yaw);
    this.placeOccupants();
    return true;
  }

  /** Applies damage to a vehicle (DEV probe and tests). */
  devDamage(vehicleId: number, attacker: P | null, amount: number): boolean {
    const record = this.byId.get(vehicleId);
    if (!record || record.lifecycle !== 'active') return false;
    this.damage(record, attacker, amount, 'bazooka', 'explosive');
    return true;
  }

  vehicleBody(vehicleId: number): VehicleBody | null {
    return this.byId.get(vehicleId)?.body ?? null;
  }

  vehicleHp(vehicleId: number): number {
    return this.byId.get(vehicleId)?.hp ?? 0;
  }

  lifecycleOf(vehicleId: number): Lifecycle | null {
    return this.byId.get(vehicleId)?.lifecycle ?? null;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private spawn(record: VehicleRecord): boolean {
    const spawn = record.slot.spawn;
    const position = this.spawnPosition(record);
    if (!this.spawnClear(record, position)) return false;
    if (record.body) this.physics.removeVehicle(record.body);
    record.body = this.physics.createVehicle(record.slot.kind, position, spawn.rotationY);
    record.lifecycle = 'active';
    record.hp = record.definition.maxHp;
    record.respawnAtTick = 0;
    record.emptySinceTick = this.hooks.physicsTick();
    record.beachedSinceTick = 0;
    record.drownedSinceTick = 0;
    record.drowned = false;
    record.lastCrewFaction = spawn.faction;
    record.lastAttackerId = 0;
    record.lastWeaponId = null;
    record.ramCooldowns.clear();
    record.seats = record.definition.seats.map(() => 0);
    record.seatBodies = record.definition.seats.map(() => null);
    return true;
  }

  /** Spawn base: boats on the waterline, land vehicles on the floor under the spawn. */
  private spawnPosition(record: VehicleRecord): Vec3 {
    const spawn = record.slot.spawn.position;
    if (record.definition.chassis === 'boat') return { x: spawn.x, y: 0, z: spawn.z };
    const hit = this.physics.raycast({ x: spawn.x, y: spawn.y + 3, z: spawn.z }, { x: 0, y: -1, z: 0 }, 8);
    return { x: spawn.x, y: (hit ? hit.point.y : spawn.y) + 0.04, z: spawn.z };
  }

  /** No other hull and no living player may stand on the spawn. */
  private spawnClear(record: VehicleRecord, position: Vec3): boolean {
    const definition = record.definition;
    for (const other of this.records) {
      if (other === record || !other.body || other.lifecycle === 'waiting') continue;
      const distance = horizontalLength(other.body.position.x - position.x, other.body.position.z - position.z);
      if (distance < Math.hypot(definition.halfExtents.x, definition.halfExtents.z) + Math.hypot(other.definition.halfExtents.x, other.definition.halfExtents.z)) {
        return false;
      }
    }
    for (const player of this.hooks.players()) {
      if (!player.alive || this.seatOf.has(player.id) || !collidesWithVehicles(player.character.collider)) continue;
      if (distanceToHull(definition, position, record.slot.spawn.rotationY, player.character.position) < 0.6 && Math.abs(player.character.position.y - position.y) < 3) {
        return false;
      }
    }
    return true;
  }

  private removeBody(record: VehicleRecord): void {
    if (record.body) this.physics.removeVehicle(record.body);
    record.body = null;
  }

  private updateTriggers(tick: number): void {
    for (const record of this.records) {
      const active = vehicleSlotActive(record.slot, this.towerHeld);
      if (active && record.lifecycle === 'waiting' && record.respawnAtTick === 0) {
        record.respawnAtTick = tick;
      }
      if (!active && record.lifecycle === 'active' && record.body) {
        // A capture vehicle whose tower fell: an untouched one at its pad leaves.
        const empty = record.seats.every((id) => id === 0);
        const spawn = record.slot.spawn.position;
        const away = horizontalLength(record.body.position.x - spawn.x, record.body.position.z - spawn.z);
        if (empty && away < 4) {
          this.removeBody(record);
          record.lifecycle = 'waiting';
          record.respawnAtTick = 0;
        }
      }
    }
  }

  private updateEmptyTimers(record: VehicleRecord, tick: number): void {
    const body = record.body;
    if (!body || record.lifecycle !== 'active') return;
    const occupied = record.seats.some((id) => id !== 0);
    if (occupied) record.emptySinceTick = tick;
    // Land vehicles that fell into deep water drown.
    if (body.drowned) {
      if (record.drownedSinceTick === 0) record.drownedSinceTick = tick;
      if (tick - record.drownedSinceTick > vehicleTicks(2)) {
        record.drowned = true;
        this.destroy(record, null, null);
        return;
      }
    } else {
      record.drownedSinceTick = 0;
    }
    if (record.definition.chassis === 'boat' && body.beached && !occupied) {
      if (record.beachedSinceTick === 0) record.beachedSinceTick = tick;
      if (tick - record.beachedSinceTick > vehicleTicks(VEHICLE_BEACHED_SECONDS)) {
        this.destroy(record, null, null);
        return;
      }
    } else {
      record.beachedSinceTick = 0;
    }
    if (!occupied && tick - record.emptySinceTick > vehicleTicks(VEHICLE_ABANDON_SECONDS)) {
      const spawn = record.slot.spawn.position;
      const away = horizontalLength(body.position.x - spawn.x, body.position.z - spawn.z);
      if (away > EMPTY_DRIFT_DISTANCE) {
        // Abandoned far from home: it is towed back to its spawn.
        this.removeBody(record);
        record.lifecycle = 'waiting';
        record.respawnAtTick = tick + 1;
      } else {
        record.emptySinceTick = tick;
      }
    }
  }

  /** Frees seats of players who died, left, or became a class that may not ride (mascot, drifter). */
  private validateSeats(record: VehicleRecord): void {
    record.seats.forEach((id, index) => {
      if (id === 0) return;
      const player = this.hooks.player(id);
      if (
        !player ||
        !player.alive ||
        !classMayUseVehicles(player.profile.cosmetics.classId) ||
        record.lifecycle !== 'active'
      ) {
        if (player) this.placeAtExit(player, record, index, true);
        this.freeSeat(record, index);
        return;
      }
      if (record.seatBodies[index] !== player.character) {
        // Class change rebuilt the capsule: seat the new one.
        player.character.setColliderEnabled(false);
        record.seatBodies[index] = player.character;
      }
    });
  }

  private freeSeat(record: VehicleRecord, index: number): void {
    const id = record.seats[index] ?? 0;
    if (id === 0) return;
    if (index === 0) {
      record.lastDriverId = id;
      record.driverLeftTick = this.hooks.physicsTick();
    }
    record.seats[index] = 0;
    record.seatBodies[index] = null;
    this.seatOf.delete(id);
    this.inputs.delete(id);
    if (record.seats.every((occupant) => occupant === 0)) record.emptySinceTick = this.hooks.physicsTick();
  }

  /** The nearest enterable seat within reach of a player on foot. */
  private enterableNear(player: P): { record: VehicleRecord; seat: number } | null {
    const feet = player.character.position;
    let best: { record: VehicleRecord; seat: number; distance: number } | null = null;
    for (const record of this.records) {
      const body = record.body;
      if (record.lifecycle !== 'active' || !body) continue;
      if (Math.abs(feet.y - body.position.y) > VEHICLE_ENTER_HEIGHT) continue;
      if (distanceToHull(record.definition, body.position, body.yaw, feet) > VEHICLE_ENTER_RANGE) continue;
      const crew = this.crewFaction(record);
      if (!mayEnterVehicle(record.slot.spawn.faction, crew, player.profile.faction)) continue;
      record.definition.seats.forEach((seat, index) => {
        if ((record.seats[index] ?? 1) !== 0) return;
        const anchor = vehicleLocalToWorld(body.position, body.yaw, seat.anchor);
        // Prefer the wheel a little: a tie goes to the driver seat.
        const distance = horizontalLength(anchor.x - feet.x, anchor.z - feet.z) + (seat.driver ? -0.4 : 0);
        if (!best || distance < best.distance) best = { record, seat: index, distance };
      });
    }
    const found = best as { record: VehicleRecord; seat: number; distance: number } | null;
    return found ? { record: found.record, seat: found.seat } : null;
  }

  private crewFaction(record: VehicleRecord): Faction | null {
    for (const id of record.seats) {
      if (id === 0) continue;
      const player = this.hooks.player(id);
      if (player) return player.profile.faction;
    }
    return null;
  }

  /** Team of a vehicle for friendly fire: its crew, else its last crew / owner. */
  private vehicleTeam(record: VehicleRecord): Faction | null {
    return this.crewFaction(record) ?? record.lastCrewFaction;
  }

  private enter(player: P, record: VehicleRecord, seat: number): void {
    record.seats[seat] = player.id;
    record.seatBodies[seat] = player.character;
    record.lastCrewFaction = player.profile.faction;
    record.emptySinceTick = this.hooks.physicsTick();
    this.seatOf.set(player.id, { vehicleId: record.slot.id, seat });
    player.character.setColliderEnabled(false);
    this.placeOccupant(record, seat, player);
    this.hooks.broadcastEvent({
      eventType: 'VEHICLE_SEAT',
      actorId: player.id,
      targetId: record.slot.id,
      paramX: 0,
      paramZ: 0,
      paramValue: seat + 1,
    });
  }

  private switchSeat(player: P, record: VehicleRecord, from: number): void {
    const count = record.seats.length;
    for (let step = 1; step < count; step += 1) {
      const index = (from + step) % count;
      if ((record.seats[index] ?? 1) !== 0) continue;
      if (from === 0) {
        record.lastDriverId = player.id;
        record.driverLeftTick = this.hooks.physicsTick();
      }
      record.seats[from] = 0;
      record.seatBodies[from] = null;
      record.seats[index] = player.id;
      record.seatBodies[index] = player.character;
      this.seatOf.set(player.id, { vehicleId: record.slot.id, seat: index });
      this.hooks.broadcastEvent({
        eventType: 'VEHICLE_SEAT',
        actorId: player.id,
        targetId: record.slot.id,
        paramX: 1,
        paramZ: 0,
        paramValue: index + 1,
      });
      return;
    }
  }

  private exit(player: P, record: VehicleRecord, seat: number): void {
    if (!this.placeAtExit(player, record, seat, false)) return;
    this.freeSeat(record, seat);
    this.hooks.broadcastEvent({
      eventType: 'VEHICLE_SEAT',
      actorId: player.id,
      targetId: record.slot.id,
      paramX: 0,
      paramZ: 0,
      paramValue: 0,
    });
  }

  /**
   * Moves a leaving occupant to the first free exit spot (feet on the
   * ground beside the hull; in the water next to a boat). With `force` the
   * hull top is used when every side is blocked. Returns false when no spot
   * is free (the player stays seated).
   */
  private placeAtExit(player: P, record: VehicleRecord, seat: number, force: boolean): boolean {
    const body = record.body;
    if (!body) {
      player.character.setColliderEnabled(true);
      return true;
    }
    const candidates = exitCandidates(record.definition, seat).map((local) => vehicleLocalToWorld(body.position, body.yaw, local));
    const height = player.character.standHeight;
    const radius = player.character.stats.radius;
    const shape = new RAPIER.Capsule(Math.max(0.05, height / 2 - radius), radius);
    const onHull = (point: Vec3): boolean =>
      this.records.some((other) => !!other.body && distanceToVehicle(other.definition, other.body.position, other.body.yaw, point) < 0.15);
    // Ground beside the hull first; the roof of a neighbouring hull (or the
    // own roof) only when every ground spot is blocked.
    for (const roofs of [false, true]) {
      for (const candidate of candidates) {
        const hit = this.physics.raycast({ x: candidate.x, y: candidate.y + 1.6, z: candidate.z }, { x: 0, y: -1, z: 0 }, 5);
        if (!roofs && hit && onHull(hit.point)) continue;
        // Over deep water the swimmer starts at floating depth, not on the seabed.
        const feetY = hit ? Math.max(hit.point.y + 0.05, Math.min(candidate.y, EXIT_SWIM_FEET_Y)) : candidate.y;
        const center = { x: candidate.x, y: feetY + height / 2 + 0.02, z: candidate.z };
        const blocked = this.physics.world.intersectionWithShape(
          center,
          { x: 0, y: 0, z: 0, w: 1 },
          shape,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          undefined,
          undefined,
          (collider) => !this.physics.isPlayerCollider(collider.handle),
        );
        if (blocked) continue;
        this.releaseCharacter(player, { x: candidate.x, y: feetY, z: candidate.z }, body.velocity);
        return true;
      }
    }
    if (!force) return false;
    const top = candidates[candidates.length - 1] ?? body.position;
    this.releaseCharacter(player, top, body.velocity);
    return true;
  }

  private releaseCharacter(player: P, feet: Vec3, carry: Vec3): void {
    player.character.setColliderEnabled(player.alive);
    player.character.teleport(feet);
    player.character.restore(feet, { x: carry.x * 0.5, y: Math.max(0, carry.y), z: carry.z * 0.5 }, false, 0);
  }

  private ejectAll(record: VehicleRecord, launch: boolean): P[] {
    const crew: P[] = [];
    record.seats.forEach((id, index) => {
      if (id === 0) return;
      const player = this.hooks.player(id);
      if (player) {
        this.placeAtExit(player, record, index, true);
        if (launch && player.alive) {
          const body = record.body;
          const centre = body ? body.position : player.character.position;
          const feet = player.character.position;
          const dx = feet.x - centre.x;
          const dz = feet.z - centre.z;
          const length = horizontalLength(dx, dz) || 1;
          const push = VEHICLE_WRECK_BLAST.crewLaunch * 0.6;
          player.character.launch({ x: (dx / length) * push, y: VEHICLE_WRECK_BLAST.crewLaunch, z: (dz / length) * push }, 1.1);
        }
        crew.push(player);
      }
      this.freeSeat(record, index);
    });
    return crew;
  }

  /** Every occupant follows its seat anchor (feet), collider off. */
  private placeOccupants(): void {
    for (const record of this.records) {
      if (record.lifecycle !== 'active') continue;
      record.seats.forEach((id, index) => {
        if (id === 0) return;
        const player = this.hooks.player(id);
        if (player) this.placeOccupant(record, index, player);
      });
    }
  }

  private placeOccupant(record: VehicleRecord, seat: number, player: P): void {
    const body = record.body;
    const definition = record.definition.seats[seat];
    if (!body || !definition) return;
    const anchor = vehicleLocalToWorld(body.position, body.yaw, definition.anchor);
    player.character.teleport(anchor);
    player.character.setColliderEnabled(false);
  }

  private honk(player: P, record: VehicleRecord): void {
    const tick = this.hooks.physicsTick();
    if (tick < record.hornReadyTick) return;
    record.hornReadyTick = tick + vehicleTicks(VEHICLE_HORN_COOLDOWN);
    this.hooks.broadcastEvent({
      eventType: 'VEHICLE_HORN',
      actorId: player.id,
      targetId: record.slot.id,
      paramX: 0,
      paramZ: 0,
      paramValue: 0,
    });
  }

  private fire(record: VehicleRecord, gunner: P, origin: Vec3, direction: Vec3, yaw: number, pitch: number): void {
    const weapon = record.definition.weapon;
    if (!weapon) return;
    this.stats.shots += 1;
    this.hooks.broadcastEvent({
      eventType: 'TANK_CANNON_FIRE',
      actorId: gunner.id,
      targetId: record.slot.id,
      paramX: toMilli(yaw > Math.PI ? yaw - Math.PI * 2 : yaw),
      paramZ: toMilli(pitch),
      paramValue: weaponCode(weapon.id),
    });
    const base = record.body?.velocity ?? { x: 0, y: 0, z: 0 };
    this.projectiles.push({
      ownerId: gunner.id,
      vehicleId: record.slot.id,
      weapon,
      position: { ...origin },
      velocity: {
        x: direction.x * weapon.projectileSpeed + base.x,
        y: direction.y * weapon.projectileSpeed,
        z: direction.z * weapon.projectileSpeed + base.z,
      },
      expiresAtTick: this.hooks.physicsTick() + vehicleTicks(weapon.lifetimeSeconds),
    });
  }

  private updateProjectiles(): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      if (!projectile) continue;
      const owner = this.hooks.player(projectile.ownerId);
      if (!owner || this.hooks.physicsTick() >= projectile.expiresAtTick) {
        this.projectiles.splice(index, 1);
        continue;
      }
      const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y, projectile.velocity.z);
      const step = speed * FIXED_DT;
      const direction = normalizeDirection(projectile.velocity);
      const from = projectile.position;
      const ownHull = this.byId.get(projectile.vehicleId)?.body?.colliderHandle;
      // Static world (vehicle hulls are tested analytically below).
      const ray = new RAPIER.Ray(from, direction);
      const worldHit = this.physics.world.castRay(
        ray,
        step + projectile.weapon.radius,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        (collider) =>
          !this.physics.isPlayerCollider(collider.handle) &&
          collider.handle !== ownHull &&
          this.physics.vehicleForCollider(collider.handle) === null,
      );
      const worldDistance = worldHit ? worldHit.timeOfImpact : Number.POSITIVE_INFINITY;
      const reach = Math.min(step + projectile.weapon.radius, worldDistance);
      const targets = this.hooks.combatTargets(owner, this.hooks.snapshotTick());
      const playerHit = raycastTargets(from, direction, reach, targets);
      const vehicleHit = this.raycast(from, direction, reach, projectile.vehicleId);
      const critterHit = this.hooks.critterRaycast?.(from, direction, reach) ?? null;
      const playerDistance = playerHit ? playerHit.distance : Number.POSITIVE_INFINITY;
      const vehicleDistance = vehicleHit ? vehicleHit.distance : Number.POSITIVE_INFINITY;
      const critterDistance = critterHit ? critterHit.distance : Number.POSITIVE_INFINITY;
      const nearest = Math.min(worldDistance, playerDistance, vehicleDistance, critterDistance);
      if (Number.isFinite(nearest) && nearest <= step + projectile.weapon.radius) {
        const point = {
          x: from.x + direction.x * nearest,
          y: from.y + direction.y * nearest,
          z: from.z + direction.z * nearest,
        };
        if (critterHit && nearest === critterDistance) this.hooks.killCritter?.(critterHit.critterId, owner.id, projectile.weapon.id);
        this.impact(projectile, owner, point, nearest === playerDistance ? playerHit?.id ?? 0 : 0, nearest === vehicleDistance ? vehicleHit?.id ?? 0 : 0);
        this.projectiles.splice(index, 1);
        continue;
      }
      projectile.position = {
        x: from.x + projectile.velocity.x * FIXED_DT,
        y: from.y + projectile.velocity.y * FIXED_DT,
        z: from.z + projectile.velocity.z * FIXED_DT,
      };
      projectile.velocity.y += GRAVITY * projectile.weapon.gravityScale * FIXED_DT;
      if (projectile.position.y < -12) this.projectiles.splice(index, 1);
    }
  }

  private impact(projectile: VehicleProjectile, owner: P, point: Vec3, playerId: number, vehicleId: number): void {
    const weapon = projectile.weapon;
    if (playerId) {
      const target = this.hooks.player(playerId);
      if (target) this.hooks.damagePlayer(target, owner, weapon.directDamage, weapon.id, false);
    }
    if (vehicleId) {
      const record = this.byId.get(vehicleId);
      // Shells and mortars are explosive; the harpoon bolts count as bullets.
      if (record) this.damage(record, owner, weapon.directDamage, weapon.id, weapon.splashRadius > 0 ? 'explosive' : 'bullet');
    }
    if (weapon.splashRadius > 0) {
      // Nested blasts (a wreck set off by this splash) restore the exclusion.
      const previous = this.splashExclude;
      this.splashExclude = vehicleId;
      // The room splash also reaches vehicles through its explode hook.
      this.hooks.explode(owner, point, weapon.splashDamage, weapon.splashRadius, weapon.id);
      this.splashExclude = previous;
    }
  }

  private damage(record: VehicleRecord, attacker: P | null, amount: number, weaponId: WeaponId | null, kind: 'bullet' | 'explosive'): void {
    if (record.lifecycle !== 'active' || amount <= 0) return;
    // Ceasefire: shells, splash, bullets and wreck blasts leave every hull as it is.
    if (this.hooks.ceasefire?.()) return;
    const team = this.vehicleTeam(record);
    if (attacker && team && attacker.profile.faction === team) return;
    const factor = kind === 'bullet' ? record.definition.armor.bullet : record.definition.armor.explosive;
    const damage = amount * factor;
    record.hp = Math.max(0, record.hp - damage);
    if (attacker) record.lastAttackerId = attacker.id;
    record.lastWeaponId = weaponId;
    this.hooks.broadcastEvent({
      eventType: 'VEHICLE_DAMAGED',
      actorId: attacker?.id ?? 0,
      targetId: record.slot.id,
      paramX: factor < 1 ? 1 : 0,
      paramZ: 0,
      paramValue: Math.max(1, Math.min(65535, Math.round(damage))),
    });
    if (record.hp <= 0) this.destroy(record, attacker, weaponId);
  }

  /**
   * Comic explosion: the crew is thrown out and hurt, enemies of the
   * destroyer near the wreck take a blast, the wreck smoulders for a few
   * seconds and the vehicle respawns at its spawn after its delay.
   */
  private destroy(record: VehicleRecord, destroyer: P | null, weaponId: WeaponId | null): void {
    if (record.lifecycle !== 'active') return;
    const tick = this.hooks.physicsTick();
    const body = record.body;
    const position = body ? body.position : record.slot.spawn.position;
    this.stats.destroyed += 1;
    this.hooks.broadcastEvent({
      eventType: 'VEHICLE_DESTROYED',
      actorId: destroyer?.id ?? 0,
      targetId: record.slot.id,
      paramX: toDecimetres(position.x),
      paramZ: toDecimetres(position.z),
      paramValue: VEHICLE_KIND_TABLE.code[record.slot.kind],
    });
    const crew = this.ejectAll(record, true);
    record.lifecycle = 'wreck';
    record.hp = 0;
    record.wreckUntilTick = tick + vehicleTicks(record.definition.wreckSeconds);
    record.respawnAtTick = tick + vehicleTicks(record.definition.respawnSeconds);
    const crewWeapon: WeaponId = weaponId ?? 'vehicle_blast';
    for (const member of crew) {
      if (!member.alive) continue;
      if (destroyer && destroyer.profile.faction === member.profile.faction && destroyer.id !== member.id) continue;
      this.hooks.damagePlayer(member, destroyer && destroyer.id !== member.id ? destroyer : null, VEHICLE_WRECK_BLAST.crewDamage, crewWeapon, false);
    }
    if (destroyer) {
      const previous = this.splashExclude;
      this.splashExclude = record.slot.id;
      this.hooks.explode(destroyer, { x: position.x, y: position.y + 1, z: position.z }, VEHICLE_WRECK_BLAST.damage, VEHICLE_WRECK_BLAST.radius, 'vehicle_blast');
      this.splashExclude = previous;
    }
  }

  /** Feet on (or just above) the roof: over the hull footprint, out to the capsule radius past its rim. */
  private onRoof(record: VehicleRecord, feet: Vec3, capsuleRadius: number): boolean {
    const body = record.body;
    if (!body) return false;
    const half = record.definition.halfExtents;
    if (feet.y < body.position.y + half.y * 2 - ROOF_TOLERANCE || feet.y > body.position.y + half.y * 2 + 1) return false;
    const local = vehicleWorldToLocal(body.position, body.yaw, feet);
    return Math.abs(local.x) <= half.x + capsuleRadius && Math.abs(local.z) <= half.z + capsuleRadius;
  }

  /**
   * Where a player caught inside a hull box goes: just outside the nearest
   * side whose spot is free of props, hulls and terrain (not under a bank),
   * else onto the roof.
   */
  private freeSpotOutside(record: VehicleRecord, player: P, local: Vec3, radius: number): Vec3 | null {
    const body = record.body;
    if (!body) return null;
    const half = record.definition.halfExtents;
    const sides = [
      { x: 1, z: 0, over: half.x + radius - local.x },
      { x: -1, z: 0, over: half.x + radius + local.x },
      { x: 0, z: 1, over: half.z + radius - local.z },
      { x: 0, z: -1, over: half.z + radius + local.z },
    ].sort((a, b) => a.over - b.over);
    const height = player.character.standHeight;
    const capsuleRadius = player.character.stats.radius;
    const shape = new RAPIER.Capsule(Math.max(0.05, height / 2 - capsuleRadius), capsuleRadius);
    const feetY = body.position.y + Math.max(0, local.y);
    for (const side of sides) {
      const target = {
        x: side.x !== 0 ? side.x * (half.x + radius + 0.05) : local.x,
        y: 0,
        z: side.z !== 0 ? side.z * (half.z + radius + 0.05) : local.z,
      };
      const spot = vehicleLocalToWorld(body.position, body.yaw, target);
      // Terrain: stand on it, but never inside a bank higher than a step.
      const ground = sampleMapHeight(spot.x, spot.z);
      if (ground > feetY + PUSH_OUT_MAX_RISE) continue;
      spot.y = Math.max(feetY, ground + 0.02);
      const blocked = this.physics.world.intersectionWithShape(
        { x: spot.x, y: spot.y + height / 2 + 0.05, z: spot.z },
        { x: 0, y: 0, z: 0, w: 1 },
        shape,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        undefined,
        (collider) => !this.physics.isPlayerCollider(collider.handle),
      );
      if (!blocked) return spot;
    }
    return vehicleLocalToWorld(body.position, body.yaw, {
      x: Math.max(-half.x, Math.min(half.x, local.x)),
      y: half.y * 2 + 0.05,
      z: Math.max(-half.z, Math.min(half.z, local.z)),
    });
  }

  /**
   * Run-overs after the hull moved: a hull overlapping a player at speed
   * rams them (enemies take the design damage and a BOING launch; friends
   * and slow contacts are shoved aside so nobody stays inside a hull).
   */
  private resolveRams(record: VehicleRecord, tick: number): void {
    const body = record.body;
    if (!body) return;
    const definition = record.definition;
    const ram = definition.ram;
    const position = body.position;
    const velocity = body.velocity;
    const moved = body.movedSpeed;
    // Rams are credited to the driver, or to the last one for a moment after
    // they bail out; a hull without either only shoves.
    const seatedDriver = record.seats[0] ?? 0;
    const graceDriver = !seatedDriver && tick - record.driverLeftTick <= RAM_DRIVER_GRACE_TICKS ? record.lastDriverId : 0;
    // Credit needs a driver who is still in the match (a disconnected one gives none).
    const driver = this.hooks.player(seatedDriver || graceDriver);
    const driverId = driver?.id ?? 0;
    // A grace credit rams for the bailed driver's side, whoever boarded since.
    const team = !seatedDriver && driver ? driver.profile.faction : this.vehicleTeam(record);
    const half = definition.halfExtents;
    // Ceasefire: contacts only shove (no ram damage, no run-overs).
    const truce = this.hooks.ceasefire?.() ?? false;
    // A driven hull runs over the hens in its path (credited like a ram).
    if (driver && moved > 1 && !truce && this.hooks.killCrittersInSphere) {
      const radius = half.x + 0.2;
      const steps = Math.max(1, Math.ceil((half.z * 2) / (radius * 1.5)));
      for (let step = 0; step <= steps; step += 1) {
        const along = -half.z + ((half.z * 2) * step) / steps;
        const center = vehicleLocalToWorld(position, body.yaw, { x: 0, y: half.y, z: along });
        this.hooks.killCrittersInSphere(center, radius, driver.id, ram.weaponId);
      }
    }
    for (const player of this.hooks.players()) {
      if (!player.alive || this.seatOf.has(player.id)) continue;
      // Untouchable characters (the drifter) pass straight through hulls.
      if (!collidesWithVehicles(player.character.collider)) continue;
      const feet = player.character.position;
      if (feet.y > position.y + half.y * 2 + 0.3 || feet.y + player.character.standHeight < position.y - 0.2) continue;
      // Roof riders stand on the hull (rim included): no ram, no shove.
      if (this.onRoof(record, feet, player.character.stats.radius)) continue;
      const local = vehicleWorldToLocal(position, body.yaw, feet);
      const radius = player.character.stats.radius + PLAYER_RADIUS_PAD * 0.3;
      if (Math.abs(local.x) > half.x + radius || Math.abs(local.z) > half.z + radius) continue;
      const cooldown = record.ramCooldowns.get(player.id) ?? 0;
      const insideBox = Math.abs(local.x) < half.x && Math.abs(local.z) < half.z;
      if (tick < cooldown && !insideBox) continue;
      // The contact side (nearest face) decides the ram: damage normal,
      // closing speed and impact.
      const overX = half.x + radius - Math.abs(local.x);
      const overZ = half.z + radius - Math.abs(local.z);
      const sideLocal = overX < overZ ? { x: Math.sign(local.x) || 1, z: 0 } : { x: 0, z: Math.sign(local.z) || 1 };
      const cos = Math.cos(body.yaw);
      const sin = Math.sin(body.yaw);
      const nx = sideLocal.x * cos + sideLocal.z * sin;
      const nz = -sideLocal.x * sin + sideLocal.z * cos;
      const closing = velocity.x * nx + velocity.z * nz;
      const impact = Math.min(moved, Math.max(0, closing));
      const enemy = !!team && player.profile.faction !== team;
      record.ramCooldowns.set(player.id, tick + RAM_VICTIM_COOLDOWN_TICKS);
      const rams = !truce && tick >= cooldown && enemy && !!driver && impact >= ram.minSpeed && tick >= player.spawnProtectionUntil;
      // Only a capsule caught inside the hull box is moved out (to a free
      // spot, at once); anyone merely touching it gets the plain shove below.
      if (!rams && insideBox) {
        const spot = this.freeSpotOutside(record, player, local, radius);
        if (spot) {
          player.character.teleport(spot);
          player.character.restore(spot, { x: 0, y: 0, z: 0 }, false, 0);
          continue;
        }
      }
      if (rams) {
        const strength = Math.min(1, Math.max(0, (impact - ram.minSpeed) / Math.max(0.1, ram.fullSpeed - ram.minSpeed)));
        const damage = ram.minDamage + (ram.maxDamage - ram.minDamage) * strength;
        const carry = 0.6;
        let launchX = nx + (velocity.x / Math.max(0.1, horizontalLength(velocity.x, velocity.z))) * carry;
        let launchZ = nz + (velocity.z / Math.max(0.1, horizontalLength(velocity.x, velocity.z))) * carry;
        const length = horizontalLength(launchX, launchZ) || 1;
        launchX /= length;
        launchZ /= length;
        player.character.launch(
          { x: launchX * ram.launchHorizontal, y: ram.launchVertical, z: launchZ * ram.launchHorizontal },
          RAM_LAUNCH_SECONDS,
        );
        this.stats.rams += 1;
        this.stats.lastRam = { vehicleId: record.slot.id, driverId, victimId: player.id, damage: Math.round(damage), speed: Math.round(impact * 100) / 100, tick };
        this.hooks.broadcastEvent({
          eventType: 'PINBALL_BOING_HIT',
          actorId: driverId,
          targetId: player.id,
          paramX: toDecimetres(feet.x),
          paramZ: toDecimetres(feet.z),
          paramValue: Math.max(1, Math.round(damage)),
        });
        this.hooks.damagePlayer(player, driver ?? null, damage, ram.weaponId, false);
      } else {
        const shove = Math.max(SHOVE_SPEED, impact * 0.8);
        player.character.launch({ x: nx * shove, y: 2.2, z: nz * shove }, 0.35);
        if (impact >= ram.minSpeed) {
          this.hooks.broadcastEvent({
            eventType: 'PINBALL_BOING_HIT',
            actorId: driverId,
            targetId: player.id,
            paramX: toDecimetres(feet.x),
            paramZ: toDecimetres(feet.z),
            paramValue: 0,
          });
        }
      }
    }
  }
}

function slotDefinition(slot: VehicleSlot): VehicleDefinition {
  return VEHICLE_DEFINITIONS[slot.kind];
}

function weaponCode(id: WeaponId): number {
  return WEAPON_TABLE.code[id];
}
