import RAPIER from '@dimforge/rapier3d-compat';
import { FIXED_DT, GRAVITY, MAP_HALF_SIZE, MAP_SEGMENTS, MAP_SIZE } from '../constants.js';
import { FJORD_MAP } from '../config/map-fjord.js';
import { quaternionFromYawPitchRoll } from '../config/map/math.js';
import type { Vec3 } from '../types/index.js';
import type { MapProp, PropCollider } from '../types/map.js';
import { CharacterBody, type CharacterBodyOptions } from './character.js';
import { VehicleBody } from './vehicle.js';
import type { DrivableVehicleKind } from '../config/vehicles.js';

/** Membership bit 1 = static world, filter accepts world and player bodies. */
export const WORLD_COLLISION_GROUP = 0x00010003;
/** Membership bit 2 = player bodies, filter accepts world and player bodies. */
export const PLAYER_COLLISION_GROUP = 0x00020003;

let rapierInitialization: Promise<void> | null = null;

export async function initializeRapier(): Promise<void> {
  if (!rapierInitialization) {
    rapierInitialization = RAPIER.init();
  }
  return rapierInitialization;
}

export interface RayHit {
  distance: number;
  point: Vec3;
}

function rotateOffset(offset: Vec3, rotationY: number): Vec3 {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return {
    x: offset.x * cos + offset.z * sin,
    y: offset.y,
    z: -offset.x * sin + offset.z * cos,
  };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * Deterministic Rapier world used by both the authoritative server and the
 * client prediction world. The immutable Fjord Fiesta blueprint is the single
 * source of truth for every static collider.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  private readonly characters = new Map<number, CharacterBody>();
  private readonly playerColliderHandles = new Set<number>();
  private readonly pieceColliders = new Map<string, number[]>();
  private readonly vehicles = new Map<number, VehicleBody>();
  private readonly vehicleColliderHandles = new Map<number, VehicleBody>();
  private terrainColliderHandle = -1;
  private nextCharacterHandle = 1;
  private nextVehicleHandle = 1;

  private constructor(world: RAPIER.World) {
    this.world = world;
  }

  static async create(): Promise<PhysicsWorld> {
    await initializeRapier();
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    world.timestep = FIXED_DT;
    const physics = new PhysicsWorld(world);
    physics.createTerrainCollider();
    physics.createPropColliders();
    physics.createBoundaryColliders();
    // Populate the broad phase before the first raycast or character query.
    world.step();
    return physics;
  }

  private createTerrainCollider(): void {
    const points = MAP_SEGMENTS + 1;
    const heights = new Float32Array(points * points);
    for (let column = 0; column < points; column += 1) {
      for (let row = 0; row < points; row += 1) {
        heights[column * points + row] = FJORD_MAP.heights[column * points + row] ?? 0;
      }
    }
    const description = RAPIER.ColliderDesc.heightfield(
      MAP_SEGMENTS,
      MAP_SEGMENTS,
      heights,
      { x: MAP_SIZE, y: 1, z: MAP_SIZE },
    )
      .setFriction(0.92)
      .setRestitution(0)
      .setCollisionGroups(WORLD_COLLISION_GROUP);
    this.terrainColliderHandle = this.world.createCollider(description).handle;
  }

  private createPropColliders(): void {
    for (const prop of FJORD_MAP.props) {
      this.createPropCollider(prop);
    }
  }

  private createPropCollider(prop: MapProp): void {
    for (const collider of prop.colliders) {
      const description = this.colliderDescription(collider);
      if (!description) continue;
      const worldOffset = rotateOffset(collider.offset, prop.rotationY);
      const translation = add(prop.position, worldOffset);
      const local = collider.type === 'box' ? collider.rotation : undefined;
      const quaternion = quaternionFromYawPitchRoll(
        prop.rotationY + (local?.y ?? 0),
        local?.x ?? 0,
        local?.z ?? 0,
      );
      description
        .setTranslation(translation.x, translation.y, translation.z)
        .setRotation(quaternion)
        .setFriction(0.85)
        .setRestitution(0.05)
        .setCollisionGroups(WORLD_COLLISION_GROUP);
      const created = this.world.createCollider(description);
      if (collider.pieceId) {
        const handles = this.pieceColliders.get(collider.pieceId) ?? [];
        handles.push(created.handle);
        this.pieceColliders.set(collider.pieceId, handles);
      }
    }
  }

  private colliderDescription(collider: PropCollider): RAPIER.ColliderDesc | null {
    switch (collider.type) {
      case 'box':
        return RAPIER.ColliderDesc.cuboid(collider.halfExtents.x, collider.halfExtents.y, collider.halfExtents.z);
      case 'cylinder':
        return RAPIER.ColliderDesc.cylinder(collider.halfHeight, collider.radius);
      case 'sphere':
        return RAPIER.ColliderDesc.ball(collider.radius);
      case 'prism': {
        // Regular polygon prism with flat sides facing (sin a, cos a) for a = k · 2π / sides.
        const points = new Float32Array(collider.sides * 2 * 3);
        for (let index = 0; index < collider.sides; index += 1) {
          const angle = ((index + 0.5) / collider.sides) * Math.PI * 2;
          const x = Math.sin(angle) * collider.radius;
          const z = Math.cos(angle) * collider.radius;
          points.set([x, -collider.halfHeight, z, x, collider.halfHeight, z], index * 6);
        }
        return RAPIER.ColliderDesc.convexHull(points);
      }
      default:
        return null;
    }
  }

  /**
   * Enables or disables every static collider tagged with a destructible
   * piece id (bridge/pier segments, buildings, trees, silos, billboards).
   */
  setStaticPieceEnabled(pieceId: string, enabled: boolean): boolean {
    const handles = this.pieceColliders.get(pieceId);
    if (!handles) return false;
    for (const handle of handles) {
      this.world.getCollider(handle)?.setEnabled(enabled);
    }
    return true;
  }

  get staticPieceIds(): string[] {
    return [...this.pieceColliders.keys()];
  }

  /**
   * Invisible walls around the map. Their inner faces overlap the last half
   * metre of the heightfield so no capsule can slip through a crack at the
   * terrain edge, and they reach well below the sea floor and far above the
   * highest rim.
   */
  private createBoundaryColliders(): void {
    const halfThickness = 2;
    const wallDistance = MAP_HALF_SIZE - 0.5 + halfThickness;
    const bottom = -40;
    const top = 200;
    const centerY = (bottom + top) / 2;
    const halfHeight = (top - bottom) / 2;
    const halfLength = MAP_HALF_SIZE + 8;
    const walls: Array<{ position: Vec3; halfExtents: Vec3 }> = [
      {
        position: { x: wallDistance, y: centerY, z: 0 },
        halfExtents: { x: halfThickness, y: halfHeight, z: halfLength },
      },
      {
        position: { x: -wallDistance, y: centerY, z: 0 },
        halfExtents: { x: halfThickness, y: halfHeight, z: halfLength },
      },
      {
        position: { x: 0, y: centerY, z: wallDistance },
        halfExtents: { x: halfLength, y: halfHeight, z: halfThickness },
      },
      {
        position: { x: 0, y: centerY, z: -wallDistance },
        halfExtents: { x: halfLength, y: halfHeight, z: halfThickness },
      },
    ];
    for (const wall of walls) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          wall.halfExtents.x,
          wall.halfExtents.y,
          wall.halfExtents.z,
        )
          .setTranslation(wall.position.x, wall.position.y, wall.position.z)
          .setCollisionGroups(WORLD_COLLISION_GROUP),
      );
    }
  }

  createCharacter(options: CharacterBodyOptions): CharacterBody {
    const handle = this.nextCharacterHandle;
    this.nextCharacterHandle += 1;
    const character = new CharacterBody(this, handle, options);
    this.characters.set(handle, character);
    this.playerColliderHandles.add(character.colliderHandle);
    return character;
  }

  removeCharacter(character: CharacterBody): void {
    this.playerColliderHandles.delete(character.colliderHandle);
    this.characters.delete(character.handle);
    character.dispose();
  }

  isPlayerCollider(handle: number): boolean {
    return this.playerColliderHandles.has(handle);
  }

  /** The terrain heightfield (boats follow it analytically instead of colliding). */
  isTerrainCollider(handle: number): boolean {
    return handle === this.terrainColliderHandle;
  }

  /** Adds a drivable vehicle hull (kinematic, see physics/vehicle.ts). */
  createVehicle(kind: DrivableVehicleKind, position: Vec3, yaw: number): VehicleBody {
    const handle = this.nextVehicleHandle;
    this.nextVehicleHandle += 1;
    const vehicle = new VehicleBody(this, handle, kind, position, yaw);
    this.vehicles.set(handle, vehicle);
    this.vehicleColliderHandles.set(vehicle.colliderHandle, vehicle);
    return vehicle;
  }

  removeVehicle(vehicle: VehicleBody): void {
    this.vehicleColliderHandles.delete(vehicle.colliderHandle);
    this.vehicles.delete(vehicle.handle);
    vehicle.dispose();
  }

  /** The vehicle a collider belongs to, if any. */
  vehicleForCollider(handle: number): VehicleBody | null {
    return this.vehicleColliderHandles.get(handle) ?? null;
  }

  step(): void {
    this.world.step();
  }

  /**
   * World raycast (players excluded). `ignoreCollider` skips one more
   * collider, e.g. the camera of a vehicle's own hull.
   */
  raycast(origin: Vec3, direction: Vec3, maxDistance: number, ignoreCollider?: number): RayHit | null {
    const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const ray = new RAPIER.Ray(origin, {
      x: direction.x / length,
      y: direction.y / length,
      z: direction.z / length,
    });
    const hit = this.world.castRay(
      ray,
      maxDistance,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => !this.playerColliderHandles.has(collider.handle) && collider.handle !== ignoreCollider,
    );
    if (!hit) return null;
    return {
      distance: hit.timeOfImpact,
      point: {
        x: origin.x + (direction.x / length) * hit.timeOfImpact,
        y: origin.y + (direction.y / length) * hit.timeOfImpact,
        z: origin.z + (direction.z / length) * hit.timeOfImpact,
      },
    };
  }

  dispose(): void {
    for (const character of this.characters.values()) {
      character.dispose();
    }
    this.characters.clear();
    for (const vehicle of this.vehicles.values()) vehicle.dispose();
    this.vehicles.clear();
    this.vehicleColliderHandles.clear();
    this.playerColliderHandles.clear();
    this.world.free();
  }
}
