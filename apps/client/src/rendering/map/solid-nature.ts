import type { Material } from '@babylonjs/core/Materials/material';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { terrainSnowWeight, terrainBiomeAt, terrainSlopeAt, SNOWLINE_Y, terrainSurfaceTagAt, type MapProp } from '@frost-and-flamingos/shared';
import { excludeFromInk, excludeFromShadows } from '../materials';
import { GeometryBatch, mix } from './geometry';
import { drawFir, drawPalm, drawRock } from './nature';
import { P } from './palette';
import { referenceFrost } from './reference-frost';

export const SOLID_NATURE_KINDS: ReadonlySet<string> = new Set(['fir', 'palm', 'rock']);
export const NATURE_LOD_DISTANCE = 145;
const CHUNK = 120;

function snowAt(prop: MapProp): number {
  const p = prop.position;
  const biome = terrainBiomeAt(p.x, p.z, p.y, terrainSlopeAt(p.x, p.z));
  return Math.max(terrainSnowWeight(p.y, biome.snowBias, biome.rock, SNOWLINE_Y), referenceFrost(p.x, p.z, p.y));
}

/** A solid silhouette at range, with no billboard rotation or tiny branch combs. */
function farTree(batch: GeometryBatch, prop: MapProp, snow: number): void {
  const s = prop.scale;
  if (prop.kind === 'fir') {
    const young = prop.variant === 3 && s < 1.05;
    const height = (young ? 5.4 : 8.6 + prop.variant * 0.5) * s;
    batch.cylinder(0.35 * s, 0.2 * s, 2.3 * s, 6, P.logDark, 'wood');
    for (let tier = 0; tier < 3; tier++) {
      const y = (young ? 0.9 : 1.5) * s + tier * height * 0.22;
      const radius = (young ? 1.8 : 2.6) * s * (1 - tier * 0.24);
      batch.lathe([[radius * 0.75, y], [radius, y + 0.22 * s], [0.03, Math.min(height, y + height * 0.52)]],
        7, snow > 0.3 ? mix(P.fir, P.snowMid, 0.82) : P.fir, snow > 0.3 ? 'snow' : 'foliage', { capBottom: true });
    }
  } else {
    // Keep the same leaning trunk/crown as the detailed palm, using fewer fronds.
    drawPalm(batch, s, prop.variant, Math.floor(prop.position.x * 7.3 + prop.position.z * 3.1), undefined, true);
  }
}

export function buildSolidNature(scene: Scene, material: Material, props: readonly MapProp[]): {
  meshes: Mesh[]; destructible: Map<string, Mesh>;
} {
  const groups = new Map<string, { near: GeometryBatch; far: GeometryBatch; owner?: string }>();
  for (const prop of props) {
    if (!SOLID_NATURE_KINDS.has(prop.kind)) continue;
    const p = prop.position;
    const key = prop.destructibleId ?? `${Math.floor(p.x / CHUNK)}:${Math.floor(p.z / CHUNK)}`;
    let group = groups.get(key);
    if (!group) {
      group = { near: new GeometryBatch(), far: new GeometryBatch(), owner: prop.destructibleId };
      group.near.jitter = group.far.jitter = 0;
      groups.set(key, group);
    }
    const snow = snowAt(prop);
    const seed = Math.floor(p.x * 7.3 + p.z * 3.1);
    const rockTop = snow > 0.4 ? 'snow' : terrainSurfaceTagAt(p.x, p.z) === 'sand' ? 'beach' : p.y > 30 ? 'bare' : 'moss';
    group.near.at(p.x, p.y, p.z, prop.rotationY, () => {
      if (prop.kind === 'fir') drawFir(group.near, prop.scale, prop.variant, snow, seed);
      else if (prop.kind === 'palm') drawPalm(group.near, prop.scale, prop.variant, seed);
      else drawRock(group.near, prop.scale, prop.variant, rockTop, seed);
    });
    group.far.at(p.x, p.y, p.z, prop.rotationY, () => {
      if (prop.kind === 'rock') drawRock(group.far, prop.scale, prop.variant, rockTop, seed, true);
      else farTree(group.far, prop, snow);
    });
  }
  const meshes: Mesh[] = [];
  const destructible = new Map<string, Mesh>();
  for (const [key, group] of groups) {
    const near = group.near.toMesh(scene, `nature-solid-${key}`, material);
    const far = group.far.toMesh(scene, `nature-far-${key}`, material);
    if (!near || !far) continue;
    near.addLODLevel(NATURE_LOD_DISTANCE, far);
    // Leaves already have smooth lighting. Extra normal-edge ink turns them into noise.
    excludeFromInk(near); excludeFromInk(far); excludeFromShadows(far);
    if (group.owner) { far.parent = near; destructible.set(group.owner, near); }
    meshes.push(near, far);
  }
  return { meshes, destructible };
}
