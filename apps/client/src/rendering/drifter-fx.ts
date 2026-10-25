import { Color3, Vector3 } from '@babylonjs/core/Maths/math';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { DRIFTER_AURA, TEAM_SIZE, WATER_LEVEL, type DrifterForm, type Vec3 } from '@frost-and-flamingos/shared';
import type { GroundProbe } from './mascot-fx';

/**
 * World-space feedback of the drifter supply aura:
 *
 *  - a faint ground ring of the aura radius around every drifter of the local
 *    player's own team (enemies never see it), hugging terrain and water;
 *  - Creepy Mountain Girl: soft blue music-box notes that drift from her to
 *    each teammate she heals;
 *  - Hot Beach Girl: warm coral sparkles rising over each healed teammate and
 *    a tiny coconut-cocktail icon bobbing above their head.
 *
 * Glyphs are pooled billboards (one material per glyph, a handful of quads),
 * self-lit so they read in any light. Purely cosmetic: the server decides who
 * is supplied, this layer only reads the snapshot flags.
 */

type GlyphKind = 'note' | 'notes' | 'sparkle' | 'cocktail';

const RING_SEGMENTS = 72;
const RING_HALF_WIDTH = 0.11;
const RING_LIFT = 0.07;
/** Ring vertex heights are re-probed after the drifter moved this far (or this often). */
const RING_REPROBE_DISTANCE = 0.35;
const RING_REPROBE_SECONDS = 0.25;
/** One cocktail badge per teammate at most (badges never age, so their pool is never stolen from). */
const MAX_GLYPHS: Record<GlyphKind, number> = { note: 14, notes: 10, sparkle: 18, cocktail: TEAM_SIZE };

const RING_COLOURS: Record<DrifterForm, string> = {
  mountain_girl: '#9fd8ff',
  beach_girl: '#ff9a7a',
};

function drawGlyph(context: CanvasRenderingContext2D, kind: GlyphKind): void {
  context.clearRect(0, 0, 128, 128);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  if (kind === 'note' || kind === 'notes') {
    // Eighth / beamed notes in pale ice blue with a warm ink outline.
    context.fillStyle = '#d9f1ff';
    context.strokeStyle = '#1b1410';
    context.lineWidth = 7;
    const heads = kind === 'note' ? [[52, 92]] : [[34, 98], [86, 84]];
    for (const [x, y] of heads) {
      context.beginPath();
      context.ellipse(x ?? 0, y ?? 0, 17, 12, -0.45, 0, Math.PI * 2);
      context.stroke();
      context.fill();
    }
    context.beginPath();
    if (kind === 'note') {
      context.moveTo(67, 88);
      context.lineTo(67, 22);
      context.quadraticCurveTo(92, 34, 96, 58);
    } else {
      context.moveTo(49, 94);
      context.lineTo(49, 30);
      context.lineTo(101, 16);
      context.lineTo(101, 80);
    }
    context.lineWidth = 15;
    context.stroke();
    context.strokeStyle = '#d9f1ff';
    context.lineWidth = 6;
    context.stroke();
    return;
  }
  if (kind === 'sparkle') {
    context.fillStyle = '#ffb08a';
    context.strokeStyle = '#1b1410';
    context.lineWidth = 6;
    context.beginPath();
    for (let point = 0; point < 8; point += 1) {
      const angle = (point / 8) * Math.PI * 2 - Math.PI / 2;
      const radius = point % 2 === 0 ? 54 : 16;
      context.lineTo(64 + Math.cos(angle) * radius, 64 + Math.sin(angle) * radius);
    }
    context.closePath();
    context.stroke();
    context.fill();
    context.fillStyle = '#fff6ec';
    context.beginPath();
    context.arc(58, 56, 7, 0, Math.PI * 2);
    context.fill();
    return;
  }
  // Coconut cocktail: half coconut shell, straw and a paper umbrella.
  context.strokeStyle = '#1b1410';
  context.lineWidth = 6;
  context.fillStyle = '#7a4a24';
  context.beginPath();
  context.moveTo(18, 70);
  context.quadraticCurveTo(64, 132, 110, 70);
  context.closePath();
  context.stroke();
  context.fill();
  context.fillStyle = '#fff4dc';
  context.beginPath();
  context.ellipse(64, 70, 46, 9, 0, 0, Math.PI * 2);
  context.stroke();
  context.fill();
  context.strokeStyle = '#1b1410';
  context.lineWidth = 9;
  context.beginPath();
  context.moveTo(76, 72);
  context.lineTo(92, 22);
  context.stroke();
  context.strokeStyle = '#3fe0d0';
  context.lineWidth = 4;
  context.stroke();
  context.fillStyle = '#f0508c';
  context.strokeStyle = '#1b1410';
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(24, 38);
  context.quadraticCurveTo(46, 6, 70, 30);
  context.lineTo(46, 34);
  context.closePath();
  context.stroke();
  context.fill();
  context.beginPath();
  context.moveTo(46, 34);
  context.lineTo(52, 66);
  context.stroke();
}

interface Glyph {
  mesh: Mesh;
  active: boolean;
  age: number;
  life: number;
  size: number;
  /** Notes fly from `from` to the live target; sparkles rise from `from`. */
  from: Vector3;
  targetId: number;
  drift: Vector3;
  phase: number;
}

class GlyphPool {
  private readonly material: StandardMaterial;
  private readonly texture: DynamicTexture;
  readonly glyphs: Glyph[] = [];

  constructor(scene: Scene, readonly kind: GlyphKind) {
    this.texture = new DynamicTexture(`drifter-glyph-${kind}`, { width: 128, height: 128 }, scene, true);
    this.texture.hasAlpha = true;
    drawGlyph(this.texture.getContext() as CanvasRenderingContext2D, kind);
    this.texture.update(true);
    const material = new StandardMaterial(`drifter-glyph-${kind}-material`, scene);
    material.diffuseTexture = this.texture;
    material.emissiveTexture = this.texture;
    material.opacityTexture = this.texture;
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.specularColor = Color3.Black();
    material.disableDepthWrite = true;
    this.material = material;
    for (let index = 0; index < MAX_GLYPHS[kind]; index += 1) {
      const mesh = CreatePlane(`drifter-glyph-${kind}-${index}`, { size: 1 }, scene);
      mesh.material = material;
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.glyphs.push({
        mesh,
        active: false,
        age: 0,
        life: 1,
        size: 0.3,
        from: new Vector3(),
        targetId: 0,
        drift: new Vector3(),
        phase: 0,
      });
    }
  }

  /** An idle glyph, or null when every glyph is in use. */
  takeFree(): Glyph | null {
    return this.glyphs.find((glyph) => !glyph.active) ?? null;
  }

  take(): Glyph | null {
    let oldest: Glyph | null = null;
    for (const glyph of this.glyphs) {
      if (!glyph.active) return glyph;
      if (!oldest || glyph.age / glyph.life > oldest.age / oldest.life) oldest = glyph;
    }
    return oldest;
  }

  dispose(): void {
    for (const glyph of this.glyphs) glyph.mesh.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

interface AuraRing {
  mesh: Mesh;
  material: StandardMaterial;
  positions: Float32Array;
  probedAt: Vector3;
  probeTimer: number;
  seen: boolean;
  pulse: number;
}

interface CocktailBadge {
  glyph: Glyph;
  seen: boolean;
  fade: number;
}

export class DrifterFx {
  private readonly scene: Scene;
  private readonly groundProbe: GroundProbe;
  private readonly pools = new Map<GlyphKind, GlyphPool>();
  private readonly rings = new Map<number, AuraRing>();
  private readonly cocktails = new Map<number, CocktailBadge>();
  private readonly ringIndices: number[] = [];
  private disposed = false;

  constructor(scene: Scene, groundProbe: GroundProbe) {
    this.scene = scene;
    this.groundProbe = groundProbe;
    for (let segment = 0; segment < RING_SEGMENTS; segment += 1) {
      const a = segment * 2;
      const b = ((segment + 1) % RING_SEGMENTS) * 2;
      this.ringIndices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  private pool(kind: GlyphKind): GlyphPool {
    let pool = this.pools.get(kind);
    if (!pool) {
      pool = new GlyphPool(this.scene, kind);
      this.pools.set(kind, pool);
    }
    return pool;
  }

  /**
   * Keeps the faint aura ring under a friendly drifter (call every frame
   * while she should show it; rings not refreshed in a frame are removed).
   */
  ring(id: number, form: DrifterForm, feet: Vec3, active: boolean, delta: number): void {
    if (this.disposed) return;
    let ring = this.rings.get(id);
    if (!ring) ring = this.createRing(id, form);
    ring.seen = true;
    ring.pulse += delta * (active ? 3.2 : 1.3);
    const moved = Math.hypot(feet.x - ring.probedAt.x, feet.z - ring.probedAt.z, (feet.y - ring.probedAt.y) * 0.5);
    ring.probeTimer -= delta;
    if (moved > RING_REPROBE_DISTANCE || ring.probeTimer <= 0) this.reprobe(ring, feet);
    ring.mesh.position.set(feet.x, feet.y, feet.z);
    const glow = active ? 0.5 + Math.sin(ring.pulse) * 0.12 : 0.3 + Math.sin(ring.pulse) * 0.05;
    ring.material.alpha = glow;
  }

  private createRing(id: number, form: DrifterForm): AuraRing {
    const mesh = new Mesh(`drifter-aura-ring-${id}`, this.scene);
    const positions = new Float32Array(RING_SEGMENTS * 2 * 3);
    const normals = new Float32Array(RING_SEGMENTS * 2 * 3);
    for (let index = 0; index < RING_SEGMENTS * 2; index += 1) normals[index * 3 + 1] = 1;
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.indices = this.ringIndices;
    data.applyToMesh(mesh, true);
    const material = new StandardMaterial(`drifter-aura-ring-${id}-material`, this.scene);
    const colour = Color3.FromHexString(RING_COLOURS[form]);
    material.diffuseColor = colour;
    material.emissiveColor = colour;
    material.disableLighting = true;
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.zOffset = -2;
    material.alpha = 0.3;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    const ring: AuraRing = {
      mesh,
      material,
      positions,
      probedAt: new Vector3(Number.NaN, 0, 0),
      probeTimer: 0,
      seen: true,
      pulse: Math.random() * 6,
    };
    this.rings.set(id, ring);
    return ring;
  }

  /** Re-lays the ring on the ground (or the water surface) around the drifter. */
  private reprobe(ring: AuraRing, feet: Vec3): void {
    const radius = DRIFTER_AURA.radius;
    const positions = ring.positions;
    for (let segment = 0; segment < RING_SEGMENTS; segment += 1) {
      const angle = (segment / RING_SEGMENTS) * Math.PI * 2;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      const x = feet.x + sin * radius;
      const z = feet.z + cos * radius;
      const ground = Math.max(WATER_LEVEL + 0.05, this.groundProbe(x, z, feet.y + 4));
      const y = ground - feet.y + RING_LIFT;
      for (let side = 0; side < 2; side += 1) {
        const r = radius + (side === 0 ? -RING_HALF_WIDTH : RING_HALF_WIDTH);
        const offset = (segment * 2 + side) * 3;
        positions[offset] = sin * r;
        positions[offset + 1] = y;
        positions[offset + 2] = cos * r;
      }
    }
    ring.mesh.updateVerticesData('position', positions, false, false);
    ring.mesh.refreshBoundingInfo();
    ring.probedAt.set(feet.x, feet.y, feet.z);
    ring.probeTimer = RING_REPROBE_SECONDS;
  }

  /** Mountain girl: one music-box note drifting from her (chest) to a healed teammate. */
  note(from: Vec3, targetId: number): void {
    if (this.disposed) return;
    const glyph = this.pool(Math.random() < 0.6 ? 'note' : 'notes').take();
    if (!glyph) return;
    glyph.active = true;
    glyph.age = 0;
    glyph.life = 1.3 + Math.random() * 0.5;
    glyph.size = 0.26 + Math.random() * 0.1;
    glyph.from.set(from.x, from.y + 1.35, from.z);
    glyph.targetId = targetId;
    glyph.phase = Math.random() * Math.PI * 2;
    glyph.drift.set((Math.random() - 0.5) * 0.8, 0.9 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8);
    glyph.mesh.setEnabled(true);
  }

  /** Beach girl: a coral sparkle rising around a healed teammate. */
  sparkle(around: Vec3): void {
    if (this.disposed) return;
    const glyph = this.pool('sparkle').take();
    if (!glyph) return;
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.3 + Math.random() * 0.35;
    glyph.active = true;
    glyph.age = 0;
    glyph.life = 0.8 + Math.random() * 0.5;
    glyph.size = 0.16 + Math.random() * 0.12;
    glyph.from.set(around.x + Math.sin(angle) * radius, around.y + 0.5 + Math.random() * 0.9, around.z + Math.cos(angle) * radius);
    glyph.targetId = 0;
    glyph.phase = Math.random() * Math.PI * 2;
    glyph.drift.set(Math.sin(angle) * 0.25, 0.9 + Math.random() * 0.4, Math.cos(angle) * 0.25);
    glyph.mesh.setEnabled(true);
  }

  /** Beach girl: keeps a tiny cocktail icon over a healed teammate (call every frame while healed). */
  cocktail(id: number): void {
    if (this.disposed) return;
    let badge = this.cocktails.get(id);
    if (!badge) {
      // Never steal a live badge: with every glyph in use this mate goes without one.
      const glyph = this.pool('cocktail').takeFree();
      if (!glyph) return;
      glyph.active = true;
      glyph.age = 0;
      glyph.life = Number.POSITIVE_INFINITY;
      glyph.size = 0.42;
      glyph.targetId = id;
      glyph.phase = Math.random() * Math.PI * 2;
      glyph.mesh.setEnabled(true);
      badge = { glyph, seen: true, fade: 0 };
      this.cocktails.set(id, badge);
    }
    badge.seen = true;
  }

  /**
   * Advances every glyph. `positionOf` returns a player's rendered feet (or
   * null when the player is gone) so notes follow their moving target.
   */
  update(delta: number, positionOf: (id: number) => Vec3 | null): void {
    if (this.disposed) return;
    for (const [id, ring] of this.rings) {
      if (ring.seen) {
        ring.seen = false;
        continue;
      }
      ring.mesh.dispose();
      ring.material.dispose();
      this.rings.delete(id);
    }

    for (const [id, badge] of this.cocktails) {
      const target = positionOf(id);
      badge.fade = Math.max(0, Math.min(1, badge.fade + (badge.seen && target ? delta * 4 : -delta * 2.5)));
      badge.seen = false;
      const glyph = badge.glyph;
      glyph.phase += delta * 2.4;
      if (badge.fade <= 0 || !target) {
        glyph.active = false;
        glyph.mesh.setEnabled(false);
        this.cocktails.delete(id);
        continue;
      }
      glyph.mesh.position.set(target.x, target.y + 2.25 + Math.sin(glyph.phase) * 0.06, target.z);
      const pop = 0.6 + 0.4 * badge.fade;
      glyph.mesh.scaling.setAll(glyph.size * pop);
      glyph.mesh.rotation.z = Math.sin(glyph.phase * 0.7) * 0.18;
      glyph.mesh.visibility = badge.fade;
    }

    for (const pool of this.pools.values()) {
      if (pool.kind === 'cocktail') continue;
      for (const glyph of pool.glyphs) {
        if (!glyph.active) continue;
        glyph.age += delta;
        const t = glyph.age / glyph.life;
        if (t >= 1) {
          glyph.active = false;
          glyph.mesh.setEnabled(false);
          continue;
        }
        glyph.phase += delta * 3;
        const mesh = glyph.mesh;
        if (pool.kind === 'sparkle') {
          mesh.position.set(
            glyph.from.x + glyph.drift.x * glyph.age,
            glyph.from.y + glyph.drift.y * glyph.age,
            glyph.from.z + glyph.drift.z * glyph.age,
          );
          const twinkle = Math.sin(Math.PI * t) * (0.8 + Math.sin(glyph.phase * 3) * 0.2);
          mesh.scaling.setAll(glyph.size * twinkle);
          mesh.rotation.z = glyph.phase * 0.6;
          mesh.visibility = 1;
          continue;
        }
        // Notes: a soft arc from her toward the (moving) teammate, swaying.
        const target = positionOf(glyph.targetId);
        const endX = target ? target.x : glyph.from.x;
        const endY = target ? target.y + 1.25 : glyph.from.y + 1;
        const endZ = target ? target.z : glyph.from.z;
        const ease = t * t * (3 - 2 * t);
        const lift = Math.sin(Math.PI * t) * glyph.drift.y;
        const sway = Math.sin(glyph.phase) * 0.18 * (1 - t);
        mesh.position.set(
          glyph.from.x + (endX - glyph.from.x) * ease + glyph.drift.x * Math.sin(Math.PI * t) + sway,
          glyph.from.y + (endY - glyph.from.y) * ease + lift,
          glyph.from.z + (endZ - glyph.from.z) * ease + glyph.drift.z * Math.sin(Math.PI * t),
        );
        const grow = Math.min(1, t * 5);
        mesh.scaling.setAll(glyph.size * grow * (t > 0.8 ? 1 - (t - 0.8) * 2.5 : 1));
        mesh.rotation.z = Math.sin(glyph.phase * 0.8) * 0.3;
        mesh.visibility = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const ring of this.rings.values()) {
      ring.mesh.dispose();
      ring.material.dispose();
    }
    this.rings.clear();
    this.cocktails.clear();
    for (const pool of this.pools.values()) pool.dispose();
    this.pools.clear();
  }
}
