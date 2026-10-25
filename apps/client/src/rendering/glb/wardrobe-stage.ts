import { Material } from '@babylonjs/core/Materials/material';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { FjordLayout, FJORD_MAP, sampleMapHeight, type Faction, type Vec3 } from '@frost-and-flamingos/shared';
import { artUrl } from '../art-assets';
import { GeometryBatch } from '../map/geometry';
import { P } from '../map/palette';

/**
 * Faction stage of the menu / wardrobe preview, after the owner's podium
 * painting (art-src/gemini/gemini-podium.webp): a snowy wooden deck with
 * painted firs for Peak Guard, a sandy plank deck with flowers and painted
 * palms for Lagoon League. It replaces the map's preview podium while the
 * preview is shown, built with the map's geometry batch and toon material
 * so it gets the same painterly world look.
 *
 * Framing: {@link clearPreviewAngle} picks the camera direction around the
 * stage whose background is free of tall props and the cable-car line
 * (checked against the map blueprint), and the sprites stand behind the
 * figure as seen from there.
 */
const DECK_RADIUS = 1.65;
const PLANK_WIDTH = 0.27;

interface SpriteSpec {
  file: string;
  /** Height in metres. */
  height: number;
  /** Bearing from the viewing direction (radians, + = screen right) and distance. */
  bearing: number;
  distance: number;
}

const SPRITES: Readonly<Record<Faction, readonly SpriteSpec[]>> = {
  alpine: [
    { file: 'wardrobe/fir-snow.png', height: 2.9, bearing: -0.62, distance: 2.3 },
    { file: 'wardrobe/fir-snow.png', height: 1.9, bearing: 0.78, distance: 2.0 },
  ],
  lagoon: [
    { file: 'wardrobe/palm.png', height: 3.6, bearing: -0.7, distance: 2.5 },
    { file: 'wardrobe/palm-small.png', height: 1.9, bearing: 0.75, distance: 2.0 },
  ],
};

export class WardrobeStage {
  readonly root: TransformNode;
  /** Camera bearing around the stage (radians, same convention as the preview camera). */
  readonly viewAngle: number;
  private readonly decks: Record<Faction, TransformNode>;
  private readonly materials: StandardMaterial[] = [];
  private faction: Faction = 'alpine';

  constructor(
    private readonly scene: Scene,
    material: ShaderMaterial,
    /** Feet position of the previewed figure. */
    readonly position: Vec3,
  ) {
    this.viewAngle = clearPreviewAngle(position);
    this.root = new TransformNode('wardrobe-stage', scene);
    this.root.position.set(position.x, position.y, position.z);
    const drop = Math.max(0.2, position.y - Math.max(sampleMapHeight(position.x, position.z), 0));
    this.decks = {
      alpine: this.buildDeck('alpine', material, drop),
      lagoon: this.buildDeck('lagoon', material, drop),
    };
    this.setFaction('alpine');
    this.setEnabled(false);
  }

  setFaction(faction: Faction): void {
    this.faction = faction;
    this.decks.alpine.setEnabled(faction === 'alpine');
    this.decks.lagoon.setEnabled(faction === 'lagoon');
  }

  setEnabled(enabled: boolean): void {
    this.root.setEnabled(enabled);
    if (enabled) this.setFaction(this.faction);
  }

  dispose(): void {
    this.root.dispose(false, true);
    for (const material of this.materials) {
      material.diffuseTexture?.dispose();
      material.dispose();
    }
  }

  private buildDeck(faction: Faction, material: ShaderMaterial, drop: number): TransformNode {
    const node = new TransformNode(`wardrobe-stage-${faction}`, this.scene);
    node.parent = this.root;
    const batch = new GeometryBatch();
    const alpine = faction === 'alpine';
    // Planks across the view so their seams run towards the camera.
    batch.at(0, 0, 0, this.viewAngle, () => {
      const count = Math.round((DECK_RADIUS * 2) / PLANK_WIDTH);
      for (let index = 0; index < count; index += 1) {
        const x = -DECK_RADIUS + PLANK_WIDTH * (index + 0.5);
        const half = Math.sqrt(Math.max(0, DECK_RADIUS * DECK_RADIUS - x * x));
        if (half < 0.3) continue;
        const shade = index % 3;
        const color = alpine
          ? shade === 0 ? P.plank : shade === 1 ? P.plankLight : P.log
          : shade === 0 ? P.plankGrey : shade === 1 ? P.rockBeachLight : P.thatch;
        batch.box(x, -0.05, 0, PLANK_WIDTH - 0.025, 0.1, half * 2 - 0.04 * (index % 2), color, 'wood', 0);
      }
      // Rim beam and posts down to the ground.
      batch.cylinder(DECK_RADIUS + 0.05, DECK_RADIUS + 0.05, 0.12, 28, alpine ? P.logDark : P.palmTrunkDark, 'wood', { y: -0.22, capTop: false });
      for (let post = 0; post < 6; post += 1) {
        const angle = (post / 6) * Math.PI * 2 + 0.3;
        const px = Math.sin(angle) * (DECK_RADIUS - 0.2);
        const pz = Math.cos(angle) * (DECK_RADIUS - 0.2);
        batch.log([px, -drop - 0.1, pz], [px, -0.1, pz], 0.09, alpine ? P.logDark : P.palmTrunk, 'wood', { segments: 7 });
      }
      if (alpine) {
        // Snow piled along the back rim and in the far corner (as in the painting).
        for (let cap = 0; cap < 9; cap += 1) {
          const angle = Math.PI * (0.55 + (cap / 8) * 0.9);
          const r = DECK_RADIUS - 0.12 - (cap % 2) * 0.12;
          batch.blob(Math.sin(angle) * r, 0.02, Math.cos(angle) * r, 0.34 - (cap % 3) * 0.06, 0.12, 0.26, P.snow, 'snow', {
            segments: 9,
            rings: 4,
            wobble: 0.18,
            seed: cap * 7 + 3,
            flatBottom: true,
          });
        }
        batch.blob(-0.85, 0.02, -0.95, 0.55, 0.3, 0.42, P.snow, 'snow', { segments: 10, rings: 5, wobble: 0.22, seed: 41, flatBottom: true });
        batch.blob(0.95, 0.02, -0.8, 0.38, 0.22, 0.3, P.snowMid, 'snow', { segments: 9, rings: 4, wobble: 0.2, seed: 17, flatBottom: true });
        // Snow on the rim beam.
        batch.cylinder(DECK_RADIUS + 0.09, DECK_RADIUS + 0.02, 0.06, 28, P.snow, 'snow', { y: -0.12, capTop: false });
      } else {
        // Sand drifted onto the back of the deck, a fringe around its foot and a lei of flowers.
        batch.blob(-0.8, 0.0, -0.95, 0.62, 0.22, 0.45, P.sand, 'sand', { segments: 10, rings: 5, wobble: 0.18, seed: 23, flatBottom: true });
        batch.blob(0.9, 0.0, -0.85, 0.42, 0.16, 0.34, P.sandShade, 'sand', { segments: 9, rings: 4, wobble: 0.16, seed: 29, flatBottom: true });
        batch.cylinder(DECK_RADIUS + 0.45, DECK_RADIUS + 0.1, 0.3, 28, P.sand, 'sand', { y: -drop - 0.05, capTop: true });
        const flowers = [P.coral, P.flamingoLight, P.gold, P.flamingo];
        for (let bloom = 0; bloom < 12; bloom += 1) {
          const angle = Math.PI * (0.45 + (bloom / 11) * 1.1);
          const r = DECK_RADIUS - 0.08;
          const color = flowers[bloom % flowers.length] ?? P.coral;
          batch.blob(Math.sin(angle) * r, 0.03, Math.cos(angle) * r, 0.085, 0.05, 0.085, color, 'cloth', { segments: 6, rings: 3 });
          if (bloom % 2 === 0) {
            batch.blob(Math.sin(angle + 0.06) * (r + 0.07), 0.02, Math.cos(angle + 0.06) * (r + 0.07), 0.12, 0.03, 0.06, P.palmFrond, 'foliage', { segments: 5, rings: 2 });
          }
        }
      }
    });
    const mesh = batch.toMesh(this.scene, `wardrobe-deck-${faction}`, material);
    if (mesh) {
      mesh.parent = node;
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
    }
    for (const sprite of SPRITES[faction]) this.addSprite(node, sprite);
    return node;
  }

  /** Painted cut-out standing behind the figure, turning towards the camera. */
  private addSprite(parent: TransformNode, spec: SpriteSpec): void {
    const texture = new Texture(artUrl(spec.file), this.scene, {
      noMipmap: false,
      samplingMode: Texture.TRILINEAR_SAMPLINGMODE,
      onLoad: () => {
        const size = texture.getBaseSize();
        if (size.height > 0) mesh.scaling.x = size.width / size.height;
      },
    });
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    const material = new StandardMaterial(`wardrobe-sprite-${spec.file}`, this.scene);
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = Material.MATERIAL_ALPHATEST;
    material.alphaCutOff = 0.45;
    material.disableLighting = true;
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    this.materials.push(material);
    const mesh = CreatePlane('wardrobe-sprite', { width: spec.height, height: spec.height }, this.scene);
    mesh.material = material;
    mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
    mesh.isPickable = false;
    const node = new TransformNode('wardrobe-sprite-anchor', this.scene);
    node.parent = parent;
    // Behind the figure as seen from the preview camera.
    const bearing = this.viewAngle + Math.PI + spec.bearing;
    node.position.set(Math.sin(bearing) * spec.distance, 0, Math.cos(bearing) * spec.distance);
    mesh.parent = node;
    mesh.position.y = spec.height / 2 - 0.04;
  }
}

/** Tall things that must not stand behind the previewed figure. */
function backgroundObstacles(): Array<[number, number, number]> {
  const points: Array<[number, number, number]> = [];
  for (const prop of FJORD_MAP.props) {
    if (prop.kind === 'rock' || prop.kind === 'palm' || prop.kind === 'fir') continue;
    const height = (prop.dimensions?.y ?? 2) * prop.scale;
    points.push([prop.position.x, prop.position.z, prop.position.y + height]);
    for (const point of prop.path ?? []) points.push([point.x, point.z, point.y + 2]);
  }
  const stations = [FjordLayout.CABLE_CAR_STATIONS.valley, FjordLayout.CABLE_CAR_STATIONS.mid, FjordLayout.CABLE_CAR_STATIONS.mountain];
  for (let leg = 0; leg + 1 < stations.length; leg += 1) {
    const a = stations[leg];
    const b = stations[leg + 1];
    if (!a || !b) continue;
    for (let step = 0; step <= 60; step += 1) {
      const t = step / 60;
      points.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, a.y + 12 + (b.y - a.y) * t]);
    }
  }
  return points;
}

/**
 * Camera bearing around the stage (camera at stage + (sin a, cos a) · r,
 * looking back at it) with the clearest background: the centre of the
 * widest run of 10° steps where nothing in a ±30° cone up to 450 m rises
 * above the camera's eye line.
 */
export function clearPreviewAngle(stage: Vec3): number {
  const obstacles = backgroundObstacles();
  const steps = 36;
  const clear: boolean[] = [];
  for (let step = 0; step < steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    const cx = stage.x + Math.sin(angle) * 4.1;
    const cz = stage.z + Math.cos(angle) * 4.1;
    const eye = stage.y + 1.35;
    const fx = -Math.sin(angle);
    const fz = -Math.cos(angle);
    let worst = -Infinity;
    for (const [x, z, top] of obstacles) {
      const dx = x - cx;
      const dz = z - cz;
      const distance = Math.hypot(dx, dz);
      if (distance < 6 || distance > 450) continue;
      if ((dx * fx + dz * fz) / distance < Math.cos(Math.PI / 6)) continue;
      worst = Math.max(worst, Math.atan2(top - eye, distance));
    }
    clear.push(worst < 0);
  }
  let bestStart = 0;
  let bestLength = 0;
  for (let start = 0; start < steps; start += 1) {
    let length = 0;
    while (length < steps && clear[(start + length) % steps]) length += 1;
    if (length > bestLength) {
      bestLength = length;
      bestStart = start;
    }
  }
  if (bestLength === 0) return 0.6;
  return ((bestStart + (bestLength - 1) / 2) / steps) * Math.PI * 2;
}
