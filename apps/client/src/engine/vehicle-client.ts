import { Vector3 } from '@babylonjs/core/Maths/math';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import {
  GRAVITY,
  InputButton,
  VEHICLE_ENTER_HEIGHT,
  VEHICLE_ENTER_RANGE,
  VEHICLE_FLAG,
  VEHICLE_KIND_TABLE,
  VEHICLE_SLOTS,
  VEHICLES,
  WEAPON_TABLE,
  distanceToHull,
  isDrivableKind,
  mayEnterVehicle,
  surfaceTagAt,
  vehicleLocalToWorld,
  vehicleTicks,
  type CharacterBody,
  type DrivableVehicleKind,
  type Faction,
  type GameEvent,
  type PhysicsWorld,
  type PlayerInput,
  type PlayerProfile,
  type TranslationKey,
  type Vec3,
  type VehicleBody,
  type VehicleDefinition,
  type VehicleMotorState,
  type VehicleSnapshot,
  type VehicleWeaponDefinition,
  type WeaponId,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';
import { audio, type VehicleSoundKind } from '../audio/synth';
import { createGlbMaterial, updateGlbMaterial } from '../rendering/glb/material';
import { PartList } from '../rendering/glb/props';
import { puffKindForSurface, type MascotFx } from '../rendering/mascot-fx';
import { VehicleView, type VehicleGroundProbe } from '../rendering/vehicle-view';
import { notify, setInteractionPrompt, showHitMarker } from '../state/game';
import { translateNow } from '../state/locale';
import { vehicleHud } from '../state/vehicle';
import { BOAT_CAMERA, SIDECAR_CAMERA, TANK_CAMERA, type CameraProfile, type CameraRig } from './camera-rig';
import type { InputController } from './input';

/**
 * Client glue for the drivable vehicles (package 4V): one VehicleView and one
 * client-physics hull per vehicle, driver prediction + reconciliation with the
 * shared motor, interpolation for everything else, the vehicle camera, the
 * enter prompt and HUD card, shot/impact/explosion FX and engine audio.
 * GameClient calls a handful of hooks (see the methods' comments).
 */

const INTERPOLATION_DELAY_MS = 110;
const RECONCILE_POSITION = 0.15;
const RECONCILE_YAW = 0.03;
const HARD_SNAP = 4;
const MAX_PENDING = 30;
const ENGINE_VOICES = 4;
const AIM_RANGE = 260;

interface SnapshotEntry {
  snapshot: WorldSnapshot;
  receivedAt: number;
}

interface PendingVehicleInput {
  input: PlayerInput;
  previousDriver: number;
  previousGunner: number;
  state: VehicleMotorState;
}

interface VisualShot {
  mesh: Mesh;
  weapon: VehicleWeaponDefinition;
  position: Vector3;
  velocity: Vector3;
  age: number;
  ignoreCollider: number | undefined;
  spin: number;
  /** Faction of the shooter: the visual shot passes friends, like the server shell. */
  faction: Faction | null;
}

interface VehicleEntry {
  id: number;
  kind: DrivableVehicleKind;
  definition: VehicleDefinition;
  view: VehicleView;
  /** Client physics hull: placed from snapshots, or predicted when driven locally. */
  body: VehicleBody;
  latest: VehicleSnapshot;
  lastSeenAt: number;
  /** Rendered pose (interpolated or predicted). */
  render: { position: Vec3; yaw: number; forwardSpeed: number; turretYaw: number; turretPitch: number; steer: number; speed: number };
  dustTimer: number;
  smokeTimer: number;
  wreck: boolean;
}

export interface LocalSeat {
  vehicleId: number;
  seat: number;
  kind: DrivableVehicleKind;
  driver: boolean;
  gunner: boolean;
  handWeapons: boolean;
  exposed: boolean;
}

export interface OccupantPose {
  position: Vec3;
  yaw: number;
  visible: boolean;
  /** Drivers hold the bars/wheel: no weapon in hand. */
  unarmed: boolean;
}

function sequenceAfter(a: number, b: number): boolean {
  const difference = (a - b + 0x10000) & 0xffff;
  return difference !== 0 && difference < 0x8000;
}

function shortestAngle(from: number, to: number): number {
  let difference = (to - from) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function soundKind(kind: DrivableVehicleKind): VehicleSoundKind {
  if (kind === 'coconut_tank') return 'coconut';
  if (kind === 'badi_flamingo') return 'flamingo';
  if (kind === 'sidecar') return 'sidecar';
  return 'tank';
}

/** What the prompt needs about the local character on foot. */
export interface OnFootState {
  position: Vec3;
  faction: Faction;
  alive: boolean;
  /** Mascot form: may not board (the server refuses it too). */
  mascot: boolean;
}

export function cameraProfileForVehicle(kind: DrivableVehicleKind): CameraProfile {
  if (kind === 'badi_flamingo') return BOAT_CAMERA;
  if (kind === 'sidecar') return SIDECAR_CAMERA;
  return TANK_CAMERA;
}

/** Motor state from the wire block. */
export function vehicleStateFromSnapshot(vehicle: VehicleSnapshot): VehicleMotorState {
  return {
    position: { ...vehicle.position },
    yaw: vehicle.yaw,
    velocity: { ...vehicle.velocity },
    yawRate: vehicle.yawRate,
    steer: vehicle.steer,
    turretYaw: vehicle.turretYaw,
    turretPitch: vehicle.turretPitch,
    grounded: (vehicle.flags & VEHICLE_FLAG.Grounded) !== 0,
    beached: (vehicle.flags & VEHICLE_FLAG.Beached) !== 0,
    afloat: (vehicle.flags & VEHICLE_FLAG.Afloat) !== 0,
    handbrake: (vehicle.flags & VEHICLE_FLAG.Handbrake) !== 0,
    boostTicks: vehicle.boostTicks,
    boostCooldownTicks: vehicle.boostCooldownTicks,
    weaponCooldownTicks: vehicle.weaponCooldownTicks,
  };
}

function seatKey(definition: VehicleDefinition, index: number): TranslationKey {
  const seat = definition.seats[index];
  if (!seat) return 'vehicles.seats.driver';
  if (seat.driver && seat.gunner) return 'vehicles.seats.driverGunner';
  if (seat.driver) return definition.chassis === 'boat' ? 'vehicles.seats.pilot' : 'vehicles.seats.driver';
  if (seat.gunner) return 'vehicles.seats.gunner';
  if (definition.kind === 'sidecar') return 'vehicles.seats.sidecar';
  if (definition.kind === 'coconut_tank') return 'vehicles.seats.dome';
  return 'vehicles.seats.commander';
}

export class VehicleClient {
  private readonly scene: Scene;
  private readonly physics: PhysicsWorld;
  private readonly fx: MascotFx | null;
  private readonly input: InputController | null;
  private readonly entries = new Map<number, VehicleEntry>();
  private readonly ground: VehicleGroundProbe;
  private seat: LocalSeat | null = null;
  private predictedId = 0;
  private pending: PendingVehicleInput[] = [];
  private lastAcknowledged: PendingVehicleInput | null = null;
  private localTurret = { yaw: 0, pitch: 0 };
  private readonly shots: VisualShot[] = [];
  private readonly shotTemplates = new Map<WeaponId, Mesh>();
  private shotMaterial: ShaderMaterial | null = null;
  private promptShown = false;
  private enginesOn = new Set<number>();
  private localId: number | null = null;
  /**
   * Hook: first avatar a shot segment passes (origin, unit direction, max
   * distance), as its hit point, or null. Set by GameClient.
   */
  avatarHit: ((origin: Vec3, direction: Vec3, maxDistance: number, shooterFaction: Faction | null) => Vec3 | null) | null = null;
  /** Set on boarding: the camera swings behind the hull on the next camera update. */
  private faceForward = false;
  private lastCameraYaw = 0;
  /** Prediction correction of the driven vehicle (metres), for the debug HUD. */
  predictionError = 0;

  constructor(scene: Scene, physics: PhysicsWorld, fx: MascotFx | null, input: InputController | null) {
    this.scene = scene;
    this.physics = physics;
    this.fx = fx;
    this.input = input;
    this.ground = (x, z, fromY) => {
      const hit = this.physics.raycast({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }, 4.5, this.groundIgnore);
      return hit ? hit.point.y : null;
    };
  }

  private groundIgnore: number | undefined = undefined;

  /** The seat the local player occupies (from the latest snapshot), or null. */
  get localSeat(): LocalSeat | null {
    return this.seat;
  }

  /** Hull collider of the local player's vehicle (camera occlusion ignores it). */
  localHullCollider(): number | null {
    const entry = this.seat ? this.entries.get(this.seat.vehicleId) : undefined;
    return entry ? entry.body.colliderHandle : null;
  }

  // -------------------------------------------------------------------------
  // Snapshots, prediction
  // -------------------------------------------------------------------------

  /** Hook: every snapshot (before the character reconcile). */
  onSnapshot(snapshot: WorldSnapshot, localId: number | null, now: number): void {
    this.localId = localId;
    const seen = new Set<number>();
    let seat: LocalSeat | null = null;
    for (const vehicle of snapshot.vehicles) {
      const kind = VEHICLE_KIND_TABLE.byCode[vehicle.type];
      if (!kind || !isDrivableKind(kind)) continue;
      seen.add(vehicle.id);
      let entry = this.entries.get(vehicle.id);
      if (!entry || entry.kind !== kind) {
        if (entry) this.removeEntry(entry);
        entry = this.createEntry(vehicle, kind);
      }
      entry.latest = vehicle;
      entry.lastSeenAt = now;
      const wreck = (vehicle.flags & VEHICLE_FLAG.Wreck) !== 0;
      entry.wreck = wreck;
      entry.body.setColliderEnabled(!(wreck && kind === 'badi_flamingo'));
      if (localId !== null) {
        const index = vehicle.seats.indexOf(localId);
        if (index >= 0 && !wreck) {
          const definition = entry.definition.seats[index];
          if (definition) {
            seat = {
              vehicleId: vehicle.id,
              seat: index,
              kind,
              driver: definition.driver,
              gunner: definition.gunner,
              handWeapons: definition.handWeapons,
              exposed: definition.exposed,
            };
          }
        }
      }
    }
    for (const entry of [...this.entries.values()]) {
      if (!seen.has(entry.id)) this.removeEntry(entry);
    }
    this.setSeat(seat);

    const local = localId !== null ? snapshot.players.find((player) => player.id === localId) : undefined;
    for (const entry of this.entries.values()) {
      if (entry.id === this.predictedId && local) {
        this.reconcile(entry, local.lastProcessedInput);
      } else {
        // Remote vehicles: the hull sits at the newest authoritative pose.
        entry.body.restore(vehicleStateFromSnapshot(entry.latest));
      }
    }
  }

  private setSeat(seat: LocalSeat | null): void {
    const previous = this.seat;
    const changed = previous?.vehicleId !== seat?.vehicleId || previous?.seat !== seat?.seat;
    this.seat = seat;
    this.input?.setVehicleMode(seat !== null);
    const predicted = seat && seat.driver ? seat.vehicleId : 0;
    if (predicted !== this.predictedId) {
      this.predictedId = predicted;
      this.pending = [];
      this.lastAcknowledged = null;
      const entry = this.entries.get(predicted);
      if (entry) entry.body.restore(vehicleStateFromSnapshot(entry.latest));
    }
    if (changed && seat) {
      const entry = this.entries.get(seat.vehicleId);
      this.localTurret = { yaw: entry?.latest.turretYaw ?? 0, pitch: entry?.latest.turretPitch ?? 0 };
      if (previous?.vehicleId !== seat.vehicleId) this.faceForward = true;
    }
    if (changed && !seat) vehicleHud.set(null);
  }

  private reconcile(entry: VehicleEntry, acknowledged: number): void {
    while (this.pending.length > 0 && !sequenceAfter(this.pending[0]?.input.sequence ?? 0, acknowledged)) {
      this.lastAcknowledged = this.pending.shift() ?? null;
    }
    const authoritative = vehicleStateFromSnapshot(entry.latest);
    const reference = this.lastAcknowledged && this.lastAcknowledged.input.sequence === acknowledged ? this.lastAcknowledged.state : entry.body.state;
    const error = Math.hypot(
      reference.position.x - authoritative.position.x,
      reference.position.y - authoritative.position.y,
      reference.position.z - authoritative.position.z,
    );
    const yawError = Math.abs(shortestAngle(reference.yaw, authoritative.yaw));
    this.predictionError = error;
    if (error <= RECONCILE_POSITION && yawError <= RECONCILE_YAW) return;
    if (error > HARD_SNAP) this.pending = [];
    const first = this.pending[0];
    entry.body.restore(authoritative, first?.previousDriver ?? entry.body.driverButtons, first?.previousGunner ?? entry.body.gunnerButtons);
    const gunner = this.seat?.gunner ?? false;
    for (const pending of this.pending) {
      entry.body.simulate(pending.input, gunner ? pending.input : null, true);
      this.physics.step();
      pending.state = entry.body.state;
    }
    // Shots and turbo of the replay were already shown.
    entry.body.drainEvents();
  }

  /**
   * Hook: one fixed step while seated (instead of the character motor).
   * Returns the input to send: gunners aim the turret at what the camera
   * looks at, drivers' inputs are predicted on the local hull. GameClient
   * steps the physics world right after.
   */
  stepLocal(input: PlayerInput, camera: CameraRig): PlayerInput {
    const seat = this.seat;
    if (!seat) return input;
    const entry = this.entries.get(seat.vehicleId);
    if (!entry) return input;
    let sent = input;
    if (seat.gunner) {
      const aim = this.turretAim(entry, camera);
      if (aim) sent = { ...input, yaw: aim.yaw, pitch: aim.pitch };
    }
    if (seat.driver && entry.id === this.predictedId) {
      const previousDriver = entry.body.driverButtons;
      const previousGunner = entry.body.gunnerButtons;
      entry.body.simulate(sent, seat.gunner ? sent : null, true);
      for (const event of entry.body.drainEvents()) {
        if (event.type === 'fire') this.localShot(entry, event.origin, event.yaw, event.pitch);
        if (event.type === 'boost') this.turboFx(entry, true);
      }
      this.pending.push({ input: sent, previousDriver, previousGunner, state: entry.body.state });
      if (this.pending.length > MAX_PENDING) this.pending.shift();
    } else if (seat.gunner) {
      // Gunner on someone else's hull: slew the visual turret locally.
      const weapon = entry.definition.weapon;
      if (weapon) {
        const target = shortestAngle(this.localTurret.yaw, sent.yaw - entry.render.yaw);
        const step = weapon.yawRate / 60;
        this.localTurret.yaw += Math.max(-step, Math.min(step, target));
        const pitch = Math.max(weapon.minPitch, Math.min(weapon.maxPitch, sent.pitch));
        this.localTurret.pitch += Math.max(-weapon.pitchRate / 60, Math.min(weapon.pitchRate / 60, pitch - this.localTurret.pitch));
      }
    }
    return sent;
  }

  /** Hook: after the step, keep the local character on its seat (fire origin, fallback camera). */
  placeLocalCharacter(character: CharacterBody): void {
    const seat = this.seat;
    if (!seat) return;
    const entry = this.entries.get(seat.vehicleId);
    const anchor = entry?.definition.seats[seat.seat]?.anchor;
    if (!entry || !anchor) return;
    const source = entry.id === this.predictedId ? entry.body : null;
    const position = source ? source.position : entry.render.position;
    const yaw = source ? source.yaw : entry.render.yaw;
    character.teleport(vehicleLocalToWorld(position, yaw, anchor));
    character.setColliderEnabled(false);
  }

  /** Turret yaw/pitch toward the point under the crosshair (camera ray). */
  private turretAim(entry: VehicleEntry, camera: CameraRig): { yaw: number; pitch: number } | null {
    const weapon = entry.definition.weapon;
    if (!weapon) return null;
    const origin = camera.camera.position;
    const yaw = camera.lookYaw;
    const pitch = camera.lookPitch;
    const direction = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
    const hit = this.physics.raycast({ x: origin.x, y: origin.y, z: origin.z }, direction, AIM_RANGE, entry.body.colliderHandle);
    const distance = hit ? Math.max(6, hit.distance) : AIM_RANGE;
    const target = { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance, z: origin.z + direction.z * distance };
    const body = entry.id === this.predictedId ? entry.body : null;
    const position = body ? body.position : entry.render.position;
    const hullYaw = body ? body.yaw : entry.render.yaw;
    const pivot = vehicleLocalToWorld(position, hullYaw, weapon.turretPivot);
    const dx = target.x - pivot.x;
    const dz = target.z - pivot.z;
    const aimYaw = Math.atan2(dx, dz);
    const barrel = vehicleLocalToWorld(pivot, aimYaw, weapon.barrelPivot);
    const horizontal = Math.hypot(target.x - barrel.x, target.z - barrel.z);
    return { yaw: aimYaw, pitch: Math.atan2(target.y - barrel.y, Math.max(0.5, horizontal)) };
  }

  // -------------------------------------------------------------------------
  // Per frame
  // -------------------------------------------------------------------------

  /** Hook: every frame (views, FX, audio, prompt). */
  update(delta: number, now: number, history: readonly SnapshotEntry[], cameraPosition: Vector3, onFoot: OnFootState | null, audible = true): void {
    const renderTime = now - INTERPOLATION_DELAY_MS;
    let older: SnapshotEntry | undefined;
    let newer: SnapshotEntry | undefined;
    for (const item of history) {
      if (item.receivedAt <= renderTime) older = item;
      if (item.receivedAt >= renderTime) {
        newer = item;
        break;
      }
    }
    older ??= history[0];
    newer ??= history[history.length - 1];
    const span = older && newer ? newer.receivedAt - older.receivedAt : 0;
    const t = span > 0 && older ? Math.min(1, Math.max(0, (renderTime - older.receivedAt) / span)) : 1;

    for (const entry of this.entries.values()) {
      const a = older?.snapshot.vehicles.find((vehicle) => vehicle.id === entry.id);
      const b = newer?.snapshot.vehicles.find((vehicle) => vehicle.id === entry.id) ?? entry.latest;
      const from = a ?? b;
      if (entry.id === this.predictedId) {
        const body = entry.body;
        // A pilot predicts the hull; the turret belongs to the (remote) gunner.
        const ownTurret = this.seat?.gunner === true;
        entry.render = {
          position: body.position,
          yaw: body.yaw,
          forwardSpeed: body.forwardSpeed,
          turretYaw: ownTurret ? body.turretYaw : from.turretYaw + shortestAngle(from.turretYaw, b.turretYaw) * t,
          turretPitch: ownTurret ? body.turretPitch : lerp(from.turretPitch, b.turretPitch, t),
          steer: body.state.steer,
          speed: body.speed,
        };
      } else {
        const forward = b.velocity.x * Math.sin(b.yaw) + b.velocity.z * Math.cos(b.yaw);
        entry.render = {
          position: {
            x: lerp(from.position.x, b.position.x, t),
            y: lerp(from.position.y, b.position.y, t),
            z: lerp(from.position.z, b.position.z, t),
          },
          yaw: from.yaw + shortestAngle(from.yaw, b.yaw) * t,
          forwardSpeed: forward,
          turretYaw: from.turretYaw + shortestAngle(from.turretYaw, b.turretYaw) * t,
          turretPitch: lerp(from.turretPitch, b.turretPitch, t),
          steer: lerp(from.steer, b.steer, t),
          speed: Math.hypot(b.velocity.x, b.velocity.z),
        };
        if (this.seat && this.seat.vehicleId === entry.id && this.seat.gunner) {
          entry.render.turretYaw = this.localTurret.yaw;
          entry.render.turretPitch = this.localTurret.pitch;
        }
      }
      this.groundIgnore = entry.body.colliderHandle;
      entry.view.update(
        delta,
        {
          position: entry.render.position,
          yaw: entry.render.yaw,
          forwardSpeed: entry.render.forwardSpeed,
          turretYaw: entry.render.turretYaw,
          turretPitch: entry.render.turretPitch,
          steer: entry.render.steer,
          wreck: entry.wreck,
          afloat: (entry.latest.flags & VEHICLE_FLAG.Afloat) !== 0,
          damage: 1 - Math.max(0, Math.min(1, entry.latest.health / entry.definition.maxHp)),
        },
        this.ground,
        cameraPosition,
      );
      this.groundIgnore = undefined;
      this.motionFx(entry, delta);
    }
    this.updateShots(delta, cameraPosition);
    if (audible) {
      this.updateEngines(cameraPosition);
    } else if (this.enginesOn.size > 0) {
      // Menu: no engine drones, even while the old seat is still in the snapshots.
      audio.stopVehicleEngines();
      this.enginesOn = new Set();
    }
    this.updatePrompt(onFoot);
  }

  /** Dust/snow/sand behind tracks and wheels, spray and wake for the boat, wreck smoke. */
  private motionFx(entry: VehicleEntry, delta: number): void {
    const fx = this.fx;
    if (!fx) return;
    const render = entry.render;
    if (entry.wreck) {
      entry.smokeTimer -= delta;
      if (entry.smokeTimer <= 0 && entry.kind !== 'badi_flamingo') {
        entry.smokeTimer = 0.22;
        const top = vehicleLocalToWorld(render.position, render.yaw, { x: (Math.random() - 0.5) * 1.4, y: entry.definition.halfExtents.y * 2, z: (Math.random() - 0.5) * 2 });
        fx.puff('dirt', top, { x: (Math.random() - 0.5) * 0.6, y: 2.4 + Math.random(), z: (Math.random() - 0.5) * 0.6 }, 0.7, 1.4);
      }
      return;
    }
    if (render.speed < 1.5) return;
    entry.dustTimer -= delta;
    if (entry.dustTimer > 0) return;
    entry.dustTimer = Math.max(0.05, 0.16 - render.speed * 0.006);
    const half = entry.definition.halfExtents;
    if (entry.definition.chassis === 'boat') {
      if ((entry.latest.flags & VEHICLE_FLAG.Afloat) === 0) return;
      for (const side of [-1, 1]) {
        const bow = vehicleLocalToWorld(render.position, render.yaw, { x: side * half.x * 0.9, y: 0.25, z: half.z * 0.7 });
        fx.puff('splash', bow, { x: side * Math.cos(render.yaw) * 2, y: 1.2 + render.speed * 0.08, z: -side * Math.sin(render.yaw) * 2 }, 0.32 + render.speed * 0.02, 0.5);
      }
      const stern = vehicleLocalToWorld(render.position, render.yaw, { x: 0, y: 0.2, z: -half.z });
      fx.puff('splash', stern, { x: 0, y: 0.6, z: 0 }, 0.45 + render.speed * 0.03, 0.7);
      return;
    }
    const surface = surfaceTagAt(render.position.x, render.position.z, render.position.y);
    const kind = puffKindForSurface(surface);
    const direction = render.forwardSpeed >= 0 ? -1 : 1;
    for (const side of [-1, 1]) {
      const at = vehicleLocalToWorld(render.position, render.yaw, { x: side * half.x * 0.75, y: 0.15, z: direction * half.z * 0.95 });
      fx.puff(kind, at, { x: (Math.random() - 0.5) * 0.8, y: 0.8 + Math.random() * 0.6, z: (Math.random() - 0.5) * 0.8 }, entry.definition.chassis === 'tracked' ? 0.5 : 0.32, 0.6);
    }
  }

  private updateEngines(cameraPosition: Vector3): void {
    const candidates: Array<{ entry: VehicleEntry; distance: number }> = [];
    for (const entry of this.entries.values()) {
      if (entry.wreck) continue;
      const crewed = entry.latest.seats[0] !== 0 || entry.id === this.predictedId;
      if (!crewed) continue;
      const position = entry.render.position;
      const distance = Math.hypot(position.x - cameraPosition.x, position.y - cameraPosition.y, position.z - cameraPosition.z);
      if (distance > 110) continue;
      candidates.push({ entry, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const active = new Set<number>();
    for (const { entry } of candidates.slice(0, ENGINE_VOICES)) {
      active.add(entry.id);
      const load = Math.min(1, Math.abs(entry.render.forwardSpeed) / entry.definition.maxForwardSpeed);
      audio.setVehicleEngine(entry.id, soundKind(entry.kind), entry.render.position, load);
    }
    for (const id of this.enginesOn) {
      if (!active.has(id)) audio.setVehicleEngine(id, 'tank', null, 0);
    }
    this.enginesOn = active;
  }

  /** "Board the …" prompt while on foot next to a free, allowed seat. */
  private updatePrompt(onFoot: OnFootState | null): void {
    let key: TranslationKey | null = null;
    // Same rule as the server seat gate: alive, on foot, not in mascot form.
    if (onFoot && onFoot.alive && !onFoot.mascot && !this.seat) {
      let best = Number.POSITIVE_INFINITY;
      for (const entry of this.entries.values()) {
        if (entry.wreck) continue;
        const position = entry.render.position;
        if (Math.abs(onFoot.position.y - position.y) > VEHICLE_ENTER_HEIGHT) continue;
        const distance = distanceToHull(entry.definition, position, entry.render.yaw, onFoot.position);
        if (distance > VEHICLE_ENTER_RANGE || distance >= best) continue;
        if (!entry.latest.seats.some((id) => id === 0)) continue;
        const slot = VEHICLE_SLOTS.find((candidate) => candidate.id === entry.id);
        const crew = this.crewFaction(entry);
        if (!mayEnterVehicle(slot?.spawn.faction ?? null, crew, onFoot.faction)) continue;
        best = distance;
        key = `vehicles.enter.${entry.kind}` as TranslationKey;
      }
    }
    if (key) {
      setInteractionPrompt({ key, keyLabel: 'vehicles.keys.enter' });
      this.promptShown = true;
    } else if (this.promptShown) {
      setInteractionPrompt(null);
      this.promptShown = false;
    }
  }

  private crewFaction(entry: VehicleEntry): Faction | null {
    return this.factionOf?.(entry.latest.seats.find((id) => id !== 0) ?? 0) ?? null;
  }

  /** Looks up a player's faction (GameClient's profiles). */
  factionOf: ((playerId: number) => Faction | null) | null = null;

  // -------------------------------------------------------------------------
  // Camera, occupants, HUD
  // -------------------------------------------------------------------------

  /** Hook: the vehicle camera while seated. Returns false when not seated. */
  updateCamera(delta: number, camera: CameraRig, physics: PhysicsWorld): boolean {
    const seat = this.seat;
    if (!seat) {
      camera.setIgnoredCollider(null);
      return false;
    }
    const entry = this.entries.get(seat.vehicleId);
    if (!entry) return false;
    camera.setProfile(cameraProfileForVehicle(seat.kind));
    camera.setIgnoredCollider(entry.body.colliderHandle);
    camera.setWobble(0);
    if (this.faceForward) {
      // Boarding looks along the hull (and swings the turret forward).
      camera.resetAngles(entry.render.yaw);
      this.faceForward = false;
    }
    // Drivers without a turret get the camera eased behind them while the mouse rests.
    if (seat.driver && !seat.gunner) camera.followHeading(delta, entry.render.yaw, entry.render.speed);
    const position = entry.render.position;
    camera.updatePlayer(delta, new Vector3(position.x, position.y, position.z), physics);
    this.lastCameraYaw = camera.lookYaw;
    return true;
  }

  /** Hook: where a seated player's avatar goes (null = not seated). */
  occupantPose(playerId: number | null): OccupantPose | null {
    if (playerId === null) return null;
    for (const entry of this.entries.values()) {
      const index = entry.latest.seats.indexOf(playerId);
      if (index < 0 || entry.wreck) continue;
      const seat = entry.definition.seats[index];
      const position = entry.view.seatWorld(index);
      if (!seat || !position) return null;
      return { position, yaw: entry.render.yaw, visible: seat.exposed, unarmed: !seat.handWeapons };
    }
    return null;
  }

  /** Hook: HUD card for the local seat (throttled by GameClient). */
  publishHud(): void {
    const seat = this.seat;
    const entry = seat ? this.entries.get(seat.vehicleId) : undefined;
    if (!seat || !entry) {
      vehicleHud.set(null);
      return;
    }
    const definition = entry.definition;
    const state = entry.id === this.predictedId ? entry.body.state : vehicleStateFromSnapshot(entry.latest);
    const weapon = definition.weapon;
    const cooldownTicks = weapon ? vehicleTicks(weapon.cooldownSeconds) : 1;
    const boost = definition.boost;
    vehicleHud.set({
      kind: entry.kind,
      nameKey: `vehicles.names.${entry.kind}` as TranslationKey,
      seatKey: seatKey(definition, seat.seat),
      seatIndex: seat.seat,
      seatCount: definition.seats.length,
      crew: entry.latest.seats.filter((id) => id !== 0).length,
      hp: entry.latest.health,
      maxHp: definition.maxHp,
      driver: seat.driver,
      gunner: seat.gunner,
      handWeapons: seat.handWeapons,
      weaponId: weapon && seat.gunner ? weapon.id : null,
      weaponReady: weapon ? 1 - Math.min(1, state.weaponCooldownTicks / cooldownTicks) : 1,
      boost: boost && seat.driver
        ? { active: state.boostTicks > 0, ready: 1 - Math.min(1, state.boostCooldownTicks / vehicleTicks(boost.cooldownSeconds)) }
        : null,
      beached: state.beached,
      speedKmh: Math.round(Math.hypot(state.velocity.x, state.velocity.z) * 3.6),
    });
  }

  // -------------------------------------------------------------------------
  // Events and FX
  // -------------------------------------------------------------------------

  /** Hook: vehicle game events. Returns true when consumed. */
  handleEvent(event: GameEvent, profiles: ReadonlyMap<number, PlayerProfile>): boolean {
    switch (event.eventType) {
      case 'TANK_CANNON_FIRE': {
        const entry = this.entries.get(event.targetId);
        // The local driver-gunner already showed its predicted shot.
        if (!entry || (event.actorId === this.localId && entry.id === this.predictedId)) return true;
        const weaponId = WEAPON_TABLE.byCode[event.paramValue];
        const muzzle = entry.view.muzzleWorld();
        if (weaponId && muzzle) this.shotFx(entry, muzzle, event.paramX / 1000, event.paramZ / 1000, event.actorId === this.localId, this.factionOf?.(event.actorId) ?? this.crewFaction(entry));
        return true;
      }
      case 'FLAMINGO_BOOST': {
        const entry = this.entries.get(event.targetId);
        if (entry && !(event.actorId === this.localId && entry.id === this.predictedId)) this.turboFx(entry, false);
        return true;
      }
      case 'PINBALL_BOING_HIT': {
        const at = { x: event.paramX / 10, y: 0, z: event.paramZ / 10 };
        const entry = this.entryNear(at);
        at.y = (entry?.render.position.y ?? 0) + 1.6;
        if (event.paramValue > 0) {
          this.fx?.popup('comic.boing.text', at, 'rainbow', 1.6);
          this.fx?.burst('dust', at, 8, 3, 0.45);
          audio.playBoing(at);
        } else {
          audio.playBoing(at);
        }
        return true;
      }
      case 'VEHICLE_DAMAGED': {
        if (event.actorId === this.localId && this.localId !== null) {
          showHitMarker(false, false);
          audio.playHitMarker(false, false);
        }
        const entry = this.entries.get(event.targetId);
        if (entry && this.fx) {
          const at = vehicleLocalToWorld(entry.render.position, entry.render.yaw, { x: (Math.random() - 0.5) * 2, y: entry.definition.halfExtents.y * 1.6, z: (Math.random() - 0.5) * 2 });
          this.fx.puff('dust', at, { x: 0, y: 1.4, z: 0 }, 0.3, 0.4);
        }
        return true;
      }
      case 'VEHICLE_DESTROYED': {
        const entry = this.entries.get(event.targetId);
        const kindName = VEHICLE_KIND_TABLE.byCode[event.paramValue];
        const kind = kindName && isDrivableKind(kindName) ? kindName : entry?.kind ?? 'fondue_crawler';
        const at = entry ? { ...entry.render.position } : { x: event.paramX / 10, y: 0, z: event.paramZ / 10 };
        at.y += 1.2;
        this.explosionFx(kind, at);
        const name = translateNow(`vehicles.names.${kind}` as TranslationKey);
        if (this.seat?.vehicleId === event.targetId) {
          notify('vehicles.notifications.yoursDestroyed', { vehicle: name });
        } else if (event.actorId !== 0 && event.actorId === this.localId) {
          notify('vehicles.notifications.destroyed', { vehicle: name });
        }
        if (entry) entry.wreck = true;
        void profiles;
        return true;
      }
      case 'VEHICLE_HORN': {
        const entry = this.entries.get(event.targetId);
        if (!entry) return true;
        const at = vehicleLocalToWorld(entry.render.position, entry.render.yaw, { x: 0, y: entry.definition.halfExtents.y * 2 + 1.2, z: entry.definition.halfExtents.z * 0.4 });
        this.fx?.popup('comic.honk_honk.text', at, 'gold', 1.7);
        audio.playVehicleHorn(soundKind(entry.kind), at);
        return true;
      }
      case 'VEHICLE_SEAT': {
        const entry = this.entries.get(event.targetId);
        if (entry) audio.playVehicleDoor(entry.render.position);
        return true;
      }
      default:
        return false;
    }
  }

  private entryNear(point: Vec3): VehicleEntry | undefined {
    let best: VehicleEntry | undefined;
    let distance = 12;
    for (const entry of this.entries.values()) {
      const d = Math.hypot(entry.render.position.x - point.x, entry.render.position.z - point.z);
      if (d < distance) {
        distance = d;
        best = entry;
      }
    }
    return best;
  }

  /** The local driver-gunner's predicted shot. */
  private localShot(entry: VehicleEntry, origin: Vec3, yaw: number, pitch: number): void {
    this.shotFx(entry, origin, yaw, pitch, true, this.factionOf?.(this.localId ?? 0) ?? this.crewFaction(entry));
  }

  private shotFx(entry: VehicleEntry, origin: Vec3, yaw: number, pitch: number, local: boolean, faction: Faction | null): void {
    const weapon = entry.definition.weapon;
    if (!weapon) return;
    const direction = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
    audio.playVehicleGun(soundKind(entry.kind), origin, local);
    const fx = this.fx;
    if (fx && weapon.splashRadius > 0) {
      fx.burst('dust', origin, 6, 2.5, 0.45);
      fx.popup('comic.boom.text', { x: origin.x + direction.x * 1.5, y: origin.y + 1.2, z: origin.z + direction.z * 1.5 }, 'gold', 1.8);
    } else if (fx) {
      fx.puff('dust', origin, { x: direction.x * 2, y: 0.4, z: direction.z * 2 }, 0.18, 0.25);
    }
    const mesh = this.shotMesh(weapon);
    if (!mesh) return;
    const base = entry.id === this.predictedId ? entry.body.velocity : entry.latest.velocity;
    this.shots.push({
      mesh,
      weapon,
      position: new Vector3(origin.x, origin.y, origin.z),
      velocity: new Vector3(direction.x * weapon.projectileSpeed + base.x, direction.y * weapon.projectileSpeed, direction.z * weapon.projectileSpeed + base.z),
      age: 0,
      ignoreCollider: entry.body.colliderHandle,
      spin: 0,
      faction,
    });
  }

  private turboFx(entry: VehicleEntry, local: boolean): void {
    const stern = vehicleLocalToWorld(entry.render.position, entry.render.yaw, { x: 0, y: 0.4, z: -entry.definition.halfExtents.z });
    this.fx?.burst('splash', stern, 10, 4, 0.55);
    this.fx?.popup('comic.splash.text', { x: stern.x, y: stern.y + 1.6, z: stern.z }, 'ice', 1.4);
    audio.playVehicleTurbo(local ? undefined : stern);
  }

  private explosionFx(kind: DrivableVehicleKind, at: Vec3): void {
    audio.playVehicleExplosion(soundKind(kind), at);
    const fx = this.fx;
    if (!fx) return;
    if (kind === 'badi_flamingo') {
      fx.popup('comic.boing.text', at, 'pink', 2.2);
      fx.burst('splash', at, 12, 5, 0.6);
      return;
    }
    fx.popup('comic.boom.text', { x: at.x, y: at.y + 1.5, z: at.z }, 'gold', 2.6);
    fx.burst('dirt', at, 16, 7, 0.8);
    fx.burst('dust', at, 10, 4, 1.1);
    fx.shockwave({ x: at.x, y: at.y - 1, z: at.z }, 7);
  }

  private shotMesh(weapon: VehicleWeaponDefinition): Mesh | null {
    let template = this.shotTemplates.get(weapon.id);
    if (!template) {
      this.shotMaterial ??= createGlbMaterial(this.scene, 'vehicle-shot', null);
      const parts = new PartList(this.scene);
      if (weapon.id === 'fondue_cannon') {
        parts.cylinder('#ffd23f', 0.32, 0.7, 0.7, 0, 0, 0, { rz: Math.PI / 2, segments: 14 });
        parts.cylinder('#e8b030', 0.34, 0.24, 0.24, 0, 0, 0, { rz: Math.PI / 2, segments: 8 });
      } else if (weapon.id === 'coconut_mortar') {
        parts.sphere('#6b4426', 0.72, 0, 0, 0, { segments: 10 });
        parts.sphere('#3a2414', 0.16, 0.1, 0.3, 0.18);
      } else {
        parts.cylinder('#8e8e96', 1.1, 0.06, 0.06, 0, 0, 0, { rx: Math.PI / 2, segments: 6 });
        parts.cylinder('#5e6070', 0.22, 0.0, 0.16, 0, 0, 0.6, { rx: Math.PI / 2, segments: 6 });
      }
      const merged = parts.merge(`vehicle-shot-${weapon.id}`, this.shotMaterial);
      if (!merged) return null;
      merged.setEnabled(false);
      merged.isPickable = false;
      template = merged;
      this.shotTemplates.set(weapon.id, merged);
    }
    const mesh = template.clone(`vehicle-shot-${weapon.id}-flying`);
    if (!mesh) return null;
    mesh.setEnabled(true);
    return mesh;
  }

  private updateShots(delta: number, cameraPosition: Vector3): void {
    if (this.shotMaterial) updateGlbMaterial(this.shotMaterial, cameraPosition, performance.now() / 1000, { battleDamage: 0, charred: 0, frozen: 0 });
    for (let index = this.shots.length - 1; index >= 0; index -= 1) {
      const shot = this.shots[index];
      if (!shot) continue;
      shot.age += delta;
      const step = shot.velocity.scale(delta);
      const length = step.length();
      const direction = length > 1e-6 ? step.scale(1 / length) : new Vector3(0, -1, 0);
      const world = this.physics.raycast(
        { x: shot.position.x, y: shot.position.y, z: shot.position.z },
        { x: direction.x, y: direction.y, z: direction.z },
        length + shot.weapon.radius,
        shot.ignoreCollider,
      );
      // Avatars are not in the physics queries: a direct hit ends the shot at them.
      const avatar = this.avatarHit?.(shot.position, direction, world ? world.distance : length + shot.weapon.radius, shot.faction) ?? null;
      const hit = avatar ?? (world ? world.point : null);
      if (hit || shot.age > shot.weapon.lifetimeSeconds || shot.position.y < -12) {
        const at = hit ?? { x: shot.position.x, y: shot.position.y, z: shot.position.z };
        this.impactFx(shot.weapon, at);
        shot.mesh.dispose();
        this.shots.splice(index, 1);
        continue;
      }
      shot.position.addInPlace(step);
      shot.velocity.y += GRAVITY * shot.weapon.gravityScale * delta;
      shot.spin += delta * 14;
      shot.mesh.position.copyFrom(shot.position);
      const yaw = Math.atan2(shot.velocity.x, shot.velocity.z);
      const pitch = -Math.atan2(shot.velocity.y, Math.hypot(shot.velocity.x, shot.velocity.z));
      shot.mesh.rotation.set(pitch + (shot.weapon.id === 'harpoon_gun' ? 0 : shot.spin), yaw, 0);
    }
  }

  private impactFx(weapon: VehicleWeaponDefinition, at: Vec3): void {
    const fx = this.fx;
    if (!fx) return;
    if (weapon.splashRadius <= 0) {
      fx.puff('dust', at, { x: 0, y: 0.8, z: 0 }, 0.25, 0.35);
      return;
    }
    const surface = surfaceTagAt(at.x, at.z, at.y);
    fx.burst(puffKindForSurface(surface), at, 12, 5.5, 0.7);
    if (weapon.id === 'fondue_cannon') fx.burst('milk', at, 6, 3, 0.5);
    fx.popup('comic.boom.text', { x: at.x, y: at.y + 1.6, z: at.z }, 'gold', 2);
    fx.shockwave(at, weapon.splashRadius);
  }

  // -------------------------------------------------------------------------
  // Lifetime
  // -------------------------------------------------------------------------

  private createEntry(vehicle: VehicleSnapshot, kind: DrivableVehicleKind): VehicleEntry {
    const body = this.physics.createVehicle(kind, vehicle.position, vehicle.yaw);
    body.restore(vehicleStateFromSnapshot(vehicle));
    const entry: VehicleEntry = {
      id: vehicle.id,
      kind,
      definition: VEHICLES[kind],
      view: new VehicleView(this.scene, kind),
      body,
      latest: vehicle,
      lastSeenAt: performance.now(),
      render: {
        position: { ...vehicle.position },
        yaw: vehicle.yaw,
        forwardSpeed: 0,
        turretYaw: vehicle.turretYaw,
        turretPitch: vehicle.turretPitch,
        steer: vehicle.steer,
        speed: 0,
      },
      dustTimer: 0,
      smokeTimer: 0,
      wreck: false,
    };
    this.entries.set(vehicle.id, entry);
    return entry;
  }

  private removeEntry(entry: VehicleEntry): void {
    entry.view.dispose();
    this.physics.removeVehicle(entry.body);
    this.entries.delete(entry.id);
    audio.setVehicleEngine(entry.id, 'tank', null, 0);
    this.enginesOn.delete(entry.id);
    if (entry.id === this.predictedId) {
      this.predictedId = 0;
      this.pending = [];
    }
  }

  /** Hook: back to the menu / reconnect. */
  clear(): void {
    for (const entry of [...this.entries.values()]) this.removeEntry(entry);
    for (const shot of this.shots) shot.mesh.dispose();
    this.shots.length = 0;
    this.setSeat(null);
    if (this.promptShown) setInteractionPrompt(null);
    this.promptShown = false;
    audio.stopVehicleEngines();
  }

  dispose(): void {
    this.clear();
    for (const template of this.shotTemplates.values()) template.dispose();
    this.shotTemplates.clear();
    this.shotMaterial?.dispose();
    this.shotMaterial = null;
  }

  /** DEV probe data. */
  debugInfo(): unknown {
    return {
      localId: this.localId,
      seat: this.seat,
      predicted: this.predictedId,
      pending: this.pending.length,
      correction: Math.round(this.predictionError * 1000) / 1000,
      lastCameraYaw: this.lastCameraYaw,
      vehicles: [...this.entries.values()].map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        loaded: entry.view.loaded,
        wreck: entry.wreck,
        hp: entry.latest.health,
        seats: entry.latest.seats,
        position: entry.render.position,
        yaw: entry.render.yaw,
      })),
    };
  }
}

export { InputButton };
