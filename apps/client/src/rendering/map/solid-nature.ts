import '@babylonjs/core/Meshes/instancedMesh';
import type { Material } from '@babylonjs/core/Materials/material';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { terrainSnowWeight, terrainBiomeAt, terrainSlopeAt, SNOWLINE_Y, terrainSurfaceTagAt, type MapProp } from '@frost-and-flamingos/shared';
import { excludeFromInk, excludeFromShadows } from '../materials';
import { GeometryBatch } from './geometry';
import { drawFir, drawPalm, drawRock } from './nature';
import { referenceFrost } from './reference-frost';

export const SOLID_NATURE_KINDS: ReadonlySet<string> = new Set(['fir', 'palm', 'rock']);
export const NATURE_LOD_DISTANCE = 145;
export const FIR_DETAIL_DISTANCE = 45;
const CHUNK = 120;

function snowAt(prop: MapProp): number {
  if (prop.surface) return prop.surface==='snow'?1:0;
  const p = prop.position;
  const biome = terrainBiomeAt(p.x, p.z, p.y, terrainSlopeAt(p.x, p.z));
  return Math.max(terrainSnowWeight(p.y, biome.snowBias, biome.rock, SNOWLINE_Y), referenceFrost(p.x, p.z, p.y));
}

export function buildSolidNature(scene: Scene, material: Material, props: readonly MapProp[]): {
  meshes: Mesh[]; instances: InstancedMesh[]; destructible: Map<string, AbstractMesh>;
} {
  const meshes: Mesh[] = [];
  const instances: InstancedMesh[] = [];
  const destructible = new Map<string, AbstractMesh>();
  const firs = new Map<string, Mesh>();
  const groups = new Map<string, { near: GeometryBatch; far: GeometryBatch; owner?: string }>();
  for (const prop of props) {
    if (!SOLID_NATURE_KINDS.has(prop.kind)) continue;
    const p = prop.position;
    const snow = snowAt(prop);
    const seed = Math.floor(p.x * 7.3 + p.z * 3.1);
    if (prop.kind === 'fir') {
      // A handful of shared solid sculptures replaces hundreds of duplicated
      // trees baked into 120 m chunks. Each tree is culled and selects its LOD
      // independently, then Babylon batches visible instances by prototype.
      const young = prop.variant === 3 && prop.scale < 1.05;
      const baseScale = prop.variant === 3 && !young ? 1.1 : 1;
      const snowStyle = snow > .7 ? 1 : snow > .05 ? .45 : 0;
      const shape = Math.abs(seed % 2);
      const key = `${prop.variant}:${young ? 'young' : 'adult'}:${snowStyle}:${shape}`;
      let source = firs.get(key);
      if (!source) {
        const near = new GeometryBatch(), middle = new GeometryBatch(), far = new GeometryBatch();
        near.jitter = middle.jitter = far.jitter = 0;
        const sculptSeed = prop.variant * 71 + shape * 193;
        drawFir(near, baseScale, prop.variant, snowStyle, sculptSeed, false, true);
        drawFir(middle, baseScale, prop.variant, snowStyle, sculptSeed);
        drawFir(far, baseScale, prop.variant, snowStyle, sculptSeed, true);
        source = near.toMesh(scene, `nature-fir-detail-${key}`, material)!;
        const mid = middle.toMesh(scene, `nature-fir-middle-${key}`, material)!;
        const distant = far.toMesh(scene, `nature-fir-distance-${key}`, material)!;
        source.addLODLevel(FIR_DETAIL_DISTANCE, mid);
        source.addLODLevel(NATURE_LOD_DISTANCE, distant);
        for (const mesh of [source, mid, distant]) {
          mesh.isVisible = false; // Prototypes never render at the map origin.
          excludeFromInk(mesh);
          meshes.push(mesh);
        }
        excludeFromShadows(distant);
        firs.set(key, source);
      }
      const tree = source.createInstance(`nature-fir-${prop.id}`);
      tree.position.set(p.x, p.y, p.z);
      tree.rotation.y = prop.rotationY;
      tree.scaling.setAll(prop.scale / baseScale);
      tree.isPickable = false;
      tree.freezeWorldMatrix();
      excludeFromInk(tree);
      instances.push(tree);
      if (prop.destructibleId) destructible.set(prop.destructibleId, tree);
      continue;
    }
    const key = prop.destructibleId ?? `${Math.floor(p.x / CHUNK)}:${Math.floor(p.z / CHUNK)}`;
    let group = groups.get(key);
    if (!group) {
      group = { near: new GeometryBatch(), far: new GeometryBatch(), owner: prop.destructibleId };
      group.near.jitter = group.far.jitter = 0;
      groups.set(key, group);
    }
    const rockTop = snow > 0.4 ? 'snow' : (prop.surface ?? terrainSurfaceTagAt(p.x, p.z)) === 'sand' ? 'beach' : p.y > 30 ? 'bare' : 'moss';
    group.near.at(p.x, p.y, p.z, prop.rotationY, () => {
      if (prop.kind === 'palm') drawPalm(group.near, prop.scale, prop.variant, seed);
      else drawRock(group.near, prop.scale, prop.variant, rockTop, seed);
    });
    group.far.at(p.x, p.y, p.z, prop.rotationY, () => {
      if (prop.kind === 'rock') drawRock(group.far, prop.scale, prop.variant, rockTop, seed, true);
      else drawPalm(group.far, prop.scale, prop.variant, seed, undefined, true);
    });
  }
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
  return { meshes, instances, destructible };
}
