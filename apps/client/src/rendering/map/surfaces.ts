/**
 * Per-vertex surface kinds of the map geometry.
 *
 * Every map mesh built by `GeometryBatch` (terrain, chunks, destructibles)
 * carries a float vertex buffer named `surfaceId` with one value per vertex
 * from `MAP_SURFACE_IDS`. A detail/triplanar shader can declare
 * `attribute float surfaceId;` and select its painted texture per part. The
 * shared toon material reads its detail pattern from vertex-colour alpha
 * (see `surfaceAlpha` in `materials.ts`); `surfaceToonAlpha` maps each map
 * kind onto that contract so batched parts keep their painted detail.
 */
import {
  SURFACE_AUTO,
  SURFACE_FABRIC,
  SURFACE_FOLIAGE,
  SURFACE_GRASS,
  SURFACE_ICE,
  SURFACE_METAL,
  SURFACE_PLAIN,
  SURFACE_PLASTER,
  SURFACE_ROCK,
  SURFACE_SAND,
  SURFACE_SHINGLE,
  SURFACE_SNOW,
  SURFACE_STONE,
  SURFACE_WOOD,
  surfaceAlpha,
  type SurfaceId,
} from '../materials';

export const SURFACE_ATTRIBUTE = 'surfaceId';

export const MAP_SURFACE_IDS = {
  plain: 0,
  wood: 1,
  shingle: 2,
  stone: 3,
  snow: 4,
  sand: 5,
  grass: 6,
  rock: 7,
  metal: 8,
  cloth: 9,
  cobble: 10,
  foliage: 11,
  plaster: 12,
  thatch: 13,
  ice: 14,
  water: 15,
  mud: 16,
} as const;

export type SurfaceKind = keyof typeof MAP_SURFACE_IDS;

export const MAP_SURFACE_KINDS = Object.keys(MAP_SURFACE_IDS) as SurfaceKind[];

export function surfaceId(kind: SurfaceKind): number {
  return MAP_SURFACE_IDS[kind];
}

/** Map surface kind -> toon-material detail id (vertex-colour alpha contract). */
const TOON_SURFACE: Record<SurfaceKind, SurfaceId> = {
  plain: SURFACE_PLAIN,
  wood: SURFACE_WOOD,
  shingle: SURFACE_SHINGLE,
  stone: SURFACE_STONE,
  snow: SURFACE_SNOW,
  sand: SURFACE_SAND,
  grass: SURFACE_GRASS,
  rock: SURFACE_ROCK,
  metal: SURFACE_METAL,
  cloth: SURFACE_FABRIC,
  cobble: SURFACE_STONE,
  foliage: SURFACE_FOLIAGE,
  plaster: SURFACE_PLASTER,
  thatch: SURFACE_SHINGLE,
  ice: SURFACE_ICE,
  water: SURFACE_AUTO,
  mud: SURFACE_AUTO,
};

/** Vertex-colour alpha that selects the toon detail pattern for a map surface. */
export function surfaceToonAlpha(kind: SurfaceKind): number {
  return surfaceAlpha(TOON_SURFACE[kind]);
}
