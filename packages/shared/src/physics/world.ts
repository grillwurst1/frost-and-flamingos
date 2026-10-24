import RAPIER from '@dimforge/rapier3d-compat';
import { FIXED_DT, GRAVITY, MAP_HALF_SIZE, MAP_SEGMENTS, MAP_SIZE } from '../constants.js';
import { FJORD_MAP } from '../config/map-fjord.js';
import type { MapProp } from '../config/map-fjord.js';
import type { Vec3 } from '../types/index.js';
import { CharacterBody, type CharacterBodyOptions } from './character.js';

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
  private nextCharacterHandle = 1;

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
    this.world.createCollider(description);
  }

  private createPropColliders(): void {
    for (const prop of FJORD_MAP.props) {
      this.createPropCollider(prop);
    }
  }

  private createPropCollider(prop: MapProp): void {
    const rotation = prop.rotationY;
    const quaternion = { x: 0, y: Math.sin(rotation / 2), z: 0, w: Math.cos(rotation / 2) };
    for (const collider of prop.colliders) {
      const worldOffset = rotateOffset(collider.offset, rotation);
      const translation = add(prop.position, worldOffset);
      let description: RAPIER.ColliderDesc;
      if (collider.type === 'box') {
        description = RAPIER.ColliderDesc.cuboid(
          collider.halfExtents.x,
          collider.halfExtents.y,
          collider.halfExtents.z,
        );
      } else if (collider.type === 'cylinder') {
        description = RAPIER.ColliderDesc.cylinder(collider.halfHeight, collider.radius);
      } else {
        description = RAPIER.ColliderDesc.ball(collider.radius);
      }
      description
        .setTranslation(translation.x, translation.y, translation.z)
        .setRotation(quaternion)
        .setFriction(0.85)
        .setRestitution(0.05)
        .setCollisionGroups(WORLD_COLLISION_GROUP);
      this.world.createCollider(description);
    }
  }

  private createBoundaryColliders(): void {
    const wallDistance = MAP_HALF_SIZE + 3;
    const wallHeight = 70;
    const walls: Array<{ position: Vec3; halfExtents: Vec3 }> = [
      {
        position: { x: wallDistance, y: wallHeight / 2, z: 0 },
        halfExtents: { x: 2, y: wallHeight / 2, z: MAP_HALF_SIZE + 8 },
      },
      {
        position: { x: -wallDistance, y: wallHeight / 2, z: 0 },
        halfExtents: { x: 2, y: wallHeight / 2, z: MAP_HALF_SIZE + 8 },
      },
      {
        position: { x: 0, y: wallHeight / 2, z: wallDistance },
        halfExtents: { x: MAP_HALF_SIZE + 8, y: wallHeight / 2, z: 2 },
      },
      {
        position: { x: 0, y: wallHeight / 2, z: -wallDistance },
        halfExtents: { x: MAP_HALF_SIZE + 8, y: wallHeight / 2, z: 2 },
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

  step(): void {
    this.world.step();
  }

  raycast(origin: Vec3, direction: Vec3, maxDistance: number): RayHit | null {
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
      (collider) => !this.playerColliderHandles.has(collider.handle),
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
    this.playerColliderHandles.clear();
    this.world.free();
  }
}
