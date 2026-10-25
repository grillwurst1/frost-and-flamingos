import { Color3, Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { SurfaceTag, TranslationKey, Vec3 } from '@frost-and-flamingos/shared';
import { translateNow } from '../state/locale';
import { createStarMesh } from './mascot-geometry';

/**
 * World-space feedback for the mascot class: toon dust/sand/snow/milk puffs
 * (thin instances, one draw call per colour), comic onomatopoeia billboards,
 * coconut-milk puddles, shockwave rings and dizzy stars. Puffs grow and shrink
 * instead of fading, so they stay opaque and outline-friendly.
 */

export type PuffKind = 'dust' | 'snow' | 'sand' | 'milk' | 'splash' | 'dirt';

const PUFF_COLORS: Record<PuffKind, string> = {
  dust: '#d2b48a',
  snow: '#f4faff',
  sand: '#f2d9a0',
  milk: '#fffdf2',
  splash: '#cff6ff',
  dirt: '#9c7b4f',
};

const MAX_PUFFS = 96;

export function puffKindForSurface(surface: SurfaceTag): PuffKind {
  switch (surface) {
    case 'snow':
    case 'ice_patch':
      return 'snow';
    case 'sand':
      return 'sand';
    case 'water':
      return 'splash';
    case 'grass_mud':
      return 'dirt';
    default:
      return 'dust';
  }
}

interface Puff {
  position: Vector3;
  velocity: Vector3;
  age: number;
  life: number;
  size: number;
}

class PuffPool {
  readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly puffs: Puff[] = [];
  private readonly matrices = new Float32Array(MAX_PUFFS * 16);
  private readonly scratch = Matrix.Identity();
  private readonly scale = new Vector3();
  private readonly rotation = Quaternion.Identity();

  constructor(scene: Scene, kind: PuffKind) {
    this.mesh = CreateIcoSphere(`mascot-puff-${kind}`, { radius: 0.5, subdivisions: 2, flat: false }, scene);
    this.material = new StandardMaterial(`mascot-puff-${kind}-material`, scene);
    const color = Color3.FromHexString(PUFF_COLORS[kind]);
    this.material.diffuseColor = color;
    this.material.emissiveColor = color.scale(0.5);
    this.material.specularColor = Color3.Black();
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    this.mesh.thinInstanceCount = 0;
    this.mesh.alwaysSelectAsActiveMesh = true;
  }

  spawn(position: Vec3, velocity: Vec3, size: number, life: number): void {
    if (this.puffs.length >= MAX_PUFFS) this.puffs.shift();
    this.puffs.push({
      position: new Vector3(position.x, position.y, position.z),
      velocity: new Vector3(velocity.x, velocity.y, velocity.z),
      age: 0,
      life,
      size,
    });
  }

  update(delta: number): void {
    let count = 0;
    for (let index = this.puffs.length - 1; index >= 0; index -= 1) {
      const puff = this.puffs[index];
      if (!puff) continue;
      puff.age += delta;
      if (puff.age >= puff.life) {
        this.puffs.splice(index, 1);
        continue;
      }
      puff.position.addInPlace(puff.velocity.scale(delta));
      puff.velocity.scaleInPlace(Math.max(0, 1 - delta * 2.6));
      puff.velocity.y += delta * 0.6;
    }
    for (const puff of this.puffs) {
      const t = puff.age / puff.life;
      const size = puff.size * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.6;
      this.scale.set(size, size * 0.92, size);
      Matrix.ComposeToRef(this.scale, this.rotation, puff.position, this.scratch);
      this.scratch.copyToArray(this.matrices, count * 16);
      count += 1;
    }
    this.mesh.thinInstanceCount = count;
    this.mesh.thinInstanceBufferUpdated('matrix');
    this.mesh.setEnabled(count > 0);
  }

  dispose(): void {
    this.mesh.dispose();
    this.material.dispose();
  }
}

/** Comic word styles: fill gradient stops. */
export type PopupStyle = 'rainbow' | 'gold' | 'wood' | 'ice' | 'pink';

const POPUP_GRADIENTS: Record<PopupStyle, readonly string[]> = {
  rainbow: ['#ff3b3b', '#ff9f1c', '#ffe14d', '#3ddc84', '#2f9bff', '#b05cff'],
  gold: ['#fff27a', '#ffb52e', '#ff6a1a'],
  wood: ['#ffe2a8', '#d98c3a', '#8b4a1c'],
  ice: ['#ffffff', '#9fe3ff', '#3e8fe0'],
  pink: ['#ffd1e8', '#ff6fb5', '#d82f7a'],
};

interface Popup {
  mesh: Mesh;
  material: StandardMaterial;
  texture: DynamicTexture;
  age: number;
  life: number;
  base: Vector3;
  size: number;
}

interface Puddle {
  mesh: Mesh;
  age: number;
  life: number;
}

interface Ring {
  mesh: Mesh;
  material: StandardMaterial;
  age: number;
  life: number;
  radius: number;
}

interface Dizzy {
  mesh: Mesh;
  phase: number;
  seen: boolean;
}

/** Ground height lookup supplied by the client (terrain + props). */
export type GroundProbe = (x: number, z: number, fromY: number) => number;

export class MascotFx {
  private readonly scene: Scene;
  private readonly pools = new Map<PuffKind, PuffPool>();
  private readonly popups: Popup[] = [];
  private readonly puddles: Puddle[] = [];
  private readonly rings: Ring[] = [];
  private readonly dizzy = new Map<number, Dizzy>();
  private readonly puddleMaterial: StandardMaterial;
  private readonly starMaterial: StandardMaterial;
  private readonly groundProbe: GroundProbe;
  private disposed = false;

  constructor(scene: Scene, groundProbe: GroundProbe) {
    this.scene = scene;
    this.groundProbe = groundProbe;
    this.puddleMaterial = new StandardMaterial('mascot-milk-puddle', scene);
    this.puddleMaterial.diffuseColor = Color3.FromHexString('#fffaf0');
    this.puddleMaterial.emissiveColor = Color3.FromHexString('#cfd8e0');
    this.puddleMaterial.specularColor = new Color3(0.9, 0.9, 0.9);
    this.puddleMaterial.specularPower = 48;
    this.puddleMaterial.alpha = 0.94;
    this.starMaterial = new StandardMaterial('mascot-dizzy-star', scene);
    this.starMaterial.diffuseColor = Color3.FromHexString('#ffd23f');
    this.starMaterial.emissiveColor = Color3.FromHexString('#c99a10');
    this.starMaterial.specularColor = Color3.Black();
  }

  private pool(kind: PuffKind): PuffPool {
    let pool = this.pools.get(kind);
    if (!pool) {
      pool = new PuffPool(this.scene, kind);
      this.pools.set(kind, pool);
    }
    return pool;
  }

  puff(kind: PuffKind, position: Vec3, velocity: Vec3, size = 0.35, life = 0.6): void {
    if (this.disposed) return;
    this.pool(kind).spawn(position, velocity, size, life);
  }

  /** Radial burst of puffs, e.g. a hoof stomp or a hard landing. */
  burst(kind: PuffKind, position: Vec3, count: number, speed: number, size = 0.4): void {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.4;
      this.puff(
        kind,
        { x: position.x + Math.sin(angle) * 0.3, y: position.y + 0.15, z: position.z + Math.cos(angle) * 0.3 },
        { x: Math.sin(angle) * speed, y: 0.6 + Math.random() * 0.8, z: Math.cos(angle) * speed },
        size * (0.7 + Math.random() * 0.6),
        0.5 + Math.random() * 0.35,
      );
    }
  }

  /** A comic word in world space ("BOING!", "TOCK!" …), text from i18n. */
  popup(textKey: TranslationKey, position: Vec3, style: PopupStyle, size = 1.6): void {
    if (this.disposed) return;
    while (this.popups.length >= 6) {
      const oldest = this.popups.shift();
      oldest?.mesh.dispose();
      oldest?.material.dispose();
      oldest?.texture.dispose();
    }
    const text = translateNow(textKey);
    const texture = new DynamicTexture('mascot-popup-texture', { width: 512, height: 256 }, this.scene, true);
    texture.hasAlpha = true;
    const context = texture.getContext() as CanvasRenderingContext2D;
    context.clearRect(0, 0, 512, 256);
    const fontSize = Math.min(150, Math.floor(820 / Math.max(4, text.length)));
    context.font = `900 ${fontSize}px "Luckiest Guy", "Arial Black", Impact, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    // Sparkle stars behind the word.
    context.fillStyle = '#ffe14d';
    context.strokeStyle = '#1b1410';
    context.lineWidth = 6;
    for (const [x, y, r] of [
      [70, 60, 22],
      [450, 70, 18],
      [430, 205, 14],
      [90, 200, 12],
    ] as const) {
      context.beginPath();
      for (let point = 0; point < 10; point += 1) {
        const angle = (point / 10) * Math.PI * 2 - Math.PI / 2;
        const radius = point % 2 === 0 ? r : r * 0.45;
        context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
      }
      context.closePath();
      context.stroke();
      context.fill();
    }
    context.save();
    context.translate(256, 132);
    context.rotate(-0.08);
    context.lineWidth = Math.max(14, fontSize * 0.16);
    context.strokeStyle = '#1b1410';
    context.strokeText(text, 0, 0);
    const width = context.measureText(text).width;
    const gradient = context.createLinearGradient(-width / 2, 0, width / 2, 0);
    const stops = POPUP_GRADIENTS[style];
    stops.forEach((stop, index) => gradient.addColorStop(index / Math.max(1, stops.length - 1), stop));
    context.fillStyle = gradient;
    context.fillText(text, 0, 0);
    context.globalAlpha = 0.45;
    context.fillStyle = '#ffffff';
    context.fillText(text, -3, -5);
    context.restore();
    texture.update(true);

    const material = new StandardMaterial('mascot-popup-material', this.scene);
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.opacityTexture = texture;
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.specularColor = Color3.Black();
    material.disableDepthWrite = true;
    const mesh = CreatePlane('mascot-popup', { width: 2, height: 1 }, this.scene);
    mesh.material = material;
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.isPickable = false;
    mesh.renderingGroupId = 1;
    const base = new Vector3(position.x, position.y, position.z);
    mesh.position.copyFrom(base);
    mesh.scaling.setAll(0.01);
    this.popups.push({ mesh, material, texture, age: 0, life: 1.25, base, size });
  }

  /** Coconut-milk puddle conforming to the ground under it. */
  puddle(position: Vec3, radius: number, lifeSeconds: number): void {
    if (this.disposed) return;
    while (this.puddles.length >= 8) this.puddles.shift()?.mesh.dispose();
    const mesh = CreateDisc('mascot-milk', { radius, tessellation: 36, updatable: true }, this.scene);
    mesh.rotation.x = Math.PI / 2;
    mesh.bakeCurrentTransformIntoVertices();
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (positions) {
      for (let index = 0; index < positions.length / 3; index += 1) {
        const x = positions[index * 3] ?? 0;
        const z = positions[index * 3 + 2] ?? 0;
        const angle = Math.atan2(z, x);
        const edge = Math.hypot(x, z) / radius;
        // Wobbly splash outline.
        const wobble = 1 + (Math.sin(angle * 5 + 1.3) * 0.08 + Math.sin(angle * 11) * 0.05) * edge;
        const wx = x * wobble;
        const wz = z * wobble;
        positions[index * 3] = wx;
        positions[index * 3 + 2] = wz;
        positions[index * 3 + 1] =
          this.groundProbe(position.x + wx, position.z + wz, position.y + 1.5) - position.y + 0.05;
      }
      mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    }
    mesh.position.set(position.x, position.y, position.z);
    mesh.material = this.puddleMaterial;
    mesh.isPickable = false;
    mesh.scaling.setAll(0.2);
    this.puddles.push({ mesh, age: 0, life: lifeSeconds });
    this.burst('milk', position, 12, 3.2, 0.28);
  }

  /** Expanding shockwave ring (stomp / ground pound). */
  shockwave(position: Vec3, radius: number): void {
    if (this.disposed) return;
    const material = new StandardMaterial('mascot-shockwave', this.scene);
    material.diffuseColor = Color3.FromHexString('#fff6d6');
    material.emissiveColor = Color3.FromHexString('#ffe39a');
    material.specularColor = Color3.Black();
    material.alpha = 0.9;
    const mesh = CreateTorus('mascot-shockwave', { diameter: 2, thickness: 0.16, tessellation: 40 }, this.scene);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.position.set(position.x, position.y + 0.2, position.z);
    mesh.scaling.set(0.2, 1, 0.2);
    this.rings.push({ mesh, material, age: 0, life: 0.45, radius });
  }

  /** Keeps a ring of dizzy stars over a player id; call every frame while dazed. */
  setDizzy(id: number, position: Vec3 | null): void {
    if (this.disposed) return;
    const entry = this.dizzy.get(id);
    if (!position) {
      if (entry) {
        entry.mesh.dispose();
        this.dizzy.delete(id);
      }
      return;
    }
    let dizzy = entry;
    if (!dizzy) {
      const stars: Mesh[] = [];
      for (let index = 0; index < 3; index += 1) {
        const star = createStarMesh(this.scene, 'mascot-dizzy-star', 0.14, 0.065, 0.05);
        const angle = (index / 3) * Math.PI * 2;
        star.position.set(Math.cos(angle) * 0.42, Math.sin(index * 2.1) * 0.06, Math.sin(angle) * 0.42);
        star.rotation.y = -angle;
        star.bakeCurrentTransformIntoVertices();
        stars.push(star);
      }
      const merged = Mesh.MergeMeshes(stars, true, true);
      if (!merged) return;
      merged.material = this.starMaterial;
      merged.isPickable = false;
      dizzy = { mesh: merged, phase: Math.random() * 6, seen: true };
      this.dizzy.set(id, dizzy);
    }
    dizzy.seen = true;
    dizzy.mesh.position.set(position.x, position.y, position.z);
  }

  update(delta: number): void {
    if (this.disposed) return;
    for (const pool of this.pools.values()) pool.update(delta);

    for (let index = this.popups.length - 1; index >= 0; index -= 1) {
      const popup = this.popups[index];
      if (!popup) continue;
      popup.age += delta;
      const t = popup.age / popup.life;
      if (t >= 1) {
        popup.mesh.dispose();
        popup.material.dispose();
        popup.texture.dispose();
        this.popups.splice(index, 1);
        continue;
      }
      // Elastic pop-in, float up, fade out.
      const pop = t < 0.18 ? Math.sin((t / 0.18) * Math.PI * 0.5) * 1.25 : 1 + Math.sin(t * 12) * 0.04 * (1 - t);
      const scale = popup.size * (t < 0.18 ? pop : Math.min(1.25, pop) - (t > 0.75 ? (t - 0.75) * 0.6 : 0));
      popup.mesh.scaling.set(scale, scale, scale);
      popup.mesh.position.set(popup.base.x, popup.base.y + t * 1.1, popup.base.z);
      popup.material.alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    }

    for (let index = this.puddles.length - 1; index >= 0; index -= 1) {
      const puddle = this.puddles[index];
      if (!puddle) continue;
      puddle.age += delta;
      const remaining = puddle.life - puddle.age;
      if (remaining <= 0) {
        puddle.mesh.dispose();
        this.puddles.splice(index, 1);
        continue;
      }
      const grow = Math.min(1, puddle.age / 0.25);
      const shrink = Math.min(1, remaining / 0.6);
      const scale = (0.2 + 0.8 * grow) * (0.15 + 0.85 * shrink);
      puddle.mesh.scaling.set(scale, 1, scale);
    }

    for (let index = this.rings.length - 1; index >= 0; index -= 1) {
      const ring = this.rings[index];
      if (!ring) continue;
      ring.age += delta;
      const t = ring.age / ring.life;
      if (t >= 1) {
        ring.mesh.dispose();
        ring.material.dispose();
        this.rings.splice(index, 1);
        continue;
      }
      const radius = ring.radius * (0.15 + 0.85 * Math.sqrt(t));
      ring.mesh.scaling.set(radius, 1 - t * 0.6, radius);
      ring.material.alpha = 0.9 * (1 - t);
    }

    for (const [id, dizzy] of this.dizzy) {
      if (!dizzy.seen) {
        dizzy.mesh.dispose();
        this.dizzy.delete(id);
        continue;
      }
      dizzy.seen = false;
      dizzy.phase += delta * 4.2;
      dizzy.mesh.rotation.y = dizzy.phase;
      dizzy.mesh.rotation.z = Math.sin(dizzy.phase * 0.7) * 0.18;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pool of this.pools.values()) pool.dispose();
    this.pools.clear();
    for (const popup of this.popups) {
      popup.mesh.dispose();
      popup.material.dispose();
      popup.texture.dispose();
    }
    for (const puddle of this.puddles) puddle.mesh.dispose();
    for (const ring of this.rings) {
      ring.mesh.dispose();
      ring.material.dispose();
    }
    for (const dizzy of this.dizzy.values()) dizzy.mesh.dispose();
    this.dizzy.clear();
    this.puddleMaterial.dispose();
    this.starMaterial.dispose();
  }
}
