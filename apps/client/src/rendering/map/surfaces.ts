/**
 * Per-vertex surface kinds of the map geometry.
 *
 * Every map mesh built by `GeometryBatch` (terrain, chunks, destructibles)
 * carries a float vertex buffer named `surfaceId` with one value per vertex
 * from `MAP_SURFACE_IDS`. A detail/triplanar shader can declare
 * `attribute float surfaceId;` and select its painted texture per part; the
 * current toon shader simply ignores the extra buffer.
 */
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
