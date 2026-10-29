/** Small ground dressing with real depth. Batched once, never camera-facing. */
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { SpriteEntry } from '../sprite-atlas';
import { excludeFromInk, excludeFromShadows } from '../materials';
import { Affine, GeometryBatch, hash3, mix } from './geometry';
import { drawBush, drawDriftwood, drawFern, drawRock, drawSnowMound } from './nature';
import { P } from './palette';
import { MAP_SURFACE_KINDS } from './surfaces';

const CHUNK = 100;
const VERTICES_PER_CHUNK = 1400;
export const DRESSING_VERTEX_BUDGET = 65536;

export class SolidDressing {
  private readonly chunks = new Map<string, GeometryBatch>();
  private readonly templates = new Map<string, GeometryBatch>();
  private vertices = 0;

  /** True also when a budget drops decoration: never restore a large paper prop. */
  add(entry: SpriteEntry, x: number, y: number, z: number, height: number): boolean {
    const tags = entry.tags;
    const snow = tags.has('snow');
    const kind = tags.has('rock') ? 'rock' : entry.id === 'snowdrift' ? 'drift'
      : tags.has('bush') ? (entry.id.includes('fern') || entry.id === 'banana-plant' ? 'fern' : 'bush')
        : tags.has('log') ? 'log' : null;
    if (!kind) return false;
    const variant = Math.floor(hash3(x, 46, z) * 4);
    const templateKey = `${kind}:${snow}:${tags.has('beach')}:${tags.has('flowers')}:${variant}`;
    let template = this.templates.get(templateKey);
    if (!template) {
      template = new GeometryBatch(); template.jitter = 0;
      if (kind === 'rock') drawRock(template, 1, variant, snow ? 'snow' : tags.has('beach') ? 'beach' : 'bare', variant * 73, true);
      else if (kind === 'drift') drawSnowMound(template, 1, variant * 37);
      else if (kind === 'fern') drawFern(template, 1, variant * 17);
      else if (kind === 'log') drawDriftwood(template, 1, variant * 41);
      else {
        drawBush(template, 1, variant * 31, tags.has('flowers'));
        if (snow) template.blob(0, .62, 0, .65, .20, .5, ny => mix(P.snowMid, P.snow, Math.max(0, ny)), 'snow', { segments: 8, rings: 4, flatBottom: true });
      }
      this.templates.set(templateKey, template);
    }
    if (this.vertices + template.vertexCount > DRESSING_VERTEX_BUDGET) return true;
    const key = `${Math.floor(x / CHUNK)}:${Math.floor(z / CHUNK)}`;
    let batch = this.chunks.get(key);
    if (!batch) { batch = new GeometryBatch(); batch.jitter = 0; this.chunks.set(key, batch); }
    if (batch.vertexCount + template.vertexCount > VERTICES_PER_CHUNK) return true;
    // These are decorative fragments, not waist-high apparent collision cover.
    const h = Math.min(height, kind === 'bush' || kind === 'fern' ? .65 : kind === 'log' ? .28 : .42);
    const width = Math.min(1.8, Math.max(.35, height * entry.aspect));
    const scaleY = h / (kind === 'rock' ? 1.45 : kind === 'drift' ? .45 : kind === 'log' ? .38 : 1.2);
    const base = batch.vertexCount;
    batch.with(Affine.translation(x, y - .035, z).rotateY(hash3(z, 32, x) * Math.PI * 2).scale(width / 2.4, scaleY, width / 2.8), () => {
      for (let v = 0; v < template!.vertexCount; v++) {
        const p = v * 3, c = v * 4;
        batch!.vertex(template!.positions[p]!, template!.positions[p + 1]!, template!.positions[p + 2]!,
          template!.normals[p]!, template!.normals[p + 1]!, template!.normals[p + 2]!,
          [template!.colors[c]!, template!.colors[c + 1]!, template!.colors[c + 2]!], MAP_SURFACE_KINDS[template!.surfaces[v]!]!);
      }
    });
    for (const index of template.indices) batch.indices.push(base + index);
    this.vertices += template.vertexCount;
    return true;
  }

  build(scene: Scene, material: Material): { meshes: Mesh[]; vertices: number } {
    const meshes: Mesh[] = [];
    for (const [key, batch] of this.chunks) {
      const mesh = batch.toMesh(scene, `solid-dressing-${key}`, material);
      if (!mesh) continue;
      mesh.addLODLevel(110, null);
      excludeFromInk(mesh); excludeFromShadows(mesh);
      meshes.push(mesh);
    }
    return { meshes, vertices: this.vertices };
  }
}
