/**
 * Readable weather-tower state in the world (game-decisions 10.3, the cheap
 * part): a capture ring on the ground at the zone edge that fills in the
 * capturing team's colour, an owner flag with a beacon lamp on each tower
 * (blinking while the tower is pushed, pulsing while contested), the
 * team-held dressing (Tower A flamingos and bunting, Tower C roof cannon) and
 * the tower's spawn plates following ownership, plus the soft glow on a pad
 * while a freshly spawned player is protected. The heavy transformations
 * (unfolding snow cannon, spraying flamingos, icicles) are later work.
 */
import { Color3 } from '@babylonjs/core/Maths/math';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import {
  CONQUEST_TOWERS,
  SPAWN_PROTECTION_SECONDS,
  sampleMapHeight,
  type Faction,
  type TowerControlState,
  type TowerDefinition,
  type Vec3,
} from '@frost-and-flamingos/shared';
import { excludeFromShadows } from './materials';
import { Affine, GeometryBatch } from './map/geometry';
import { P, hex } from './map/palette';
import type { MapVisuals, TowerVisual } from './map';

/** Ground probe: walkable height under (x, z) searched downward from `top`, or null. */
export type GroundProbe = (x: number, z: number, top: number, depth: number) => number | null;

type Rgb = readonly [number, number, number];

const SIDE_RGB: Readonly<Record<Faction, Rgb>> = {
  alpine: hex('#3f8fe8'),
  lagoon: hex('#f45f98'),
};
const PAPER_RGB: Rgb = hex('#e9dcbd');
const INK_RGB: Rgb = hex('#1b1410');
const BEACON_COLOR: Readonly<Record<Faction | 'neutral', Color3>> = {
  alpine: Color3.FromHexString('#4f9dff'),
  lagoon: Color3.FromHexString('#ff6fa8'),
  neutral: Color3.FromHexString('#fff1c8'),
};

const RING_SEGMENTS = 96;
/** Radial layout of the ring (offsets from the capture radius): ink, band, ink. */
const RING_EDGES = [-0.78, -0.62, -0.06, 0.1] as const;
const RING_LIFT = 0.07;
const FLAG_SCALE = 1.45;

/** Where each tower's flag stands (attach point id and a local offset clear of other dressing). */
const FLAG_MOUNTS: Readonly<Record<string, { attach: string; offset: Vec3 }>> = {
  tower_a: { attach: 'dome_top', offset: { x: 0, y: -0.15, z: 0 } },
  tower_b: { attach: 'roof_peak', offset: { x: 0, y: -0.1, z: 0 } },
  tower_c: { attach: 'roof_ridge', offset: { x: 3.6, y: -0.25, z: 0 } },
};

function setRgb(target: Float32Array, offset: number, rgb: Rgb): void {
  target[offset] = rgb[0];
  target[offset + 1] = rgb[1];
  target[offset + 2] = rgb[2];
  target[offset + 3] = 1;
}

/** Capture-zone ring hugging the deck / plaza / terrain at the zone edge. */
class CaptureRing {
  readonly mesh: Mesh;
  readonly material: StandardMaterial;
  private readonly colors: Float32Array;
  private paintedKey = '';

  constructor(scene: Scene, tower: TowerDefinition, probe: GroundProbe) {
    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const heightAt = (x: number, z: number): number => {
      // Start low (under most wall tops); a start inside a collider retries from above.
      const low = probe(x, z, tower.position.y + 1.2, 7);
      const high = low === null ? probe(x, z, tower.position.y + 8, 14) : low;
      const ground = high ?? sampleMapHeight(x, z);
      return Math.max(ground, tower.position.y - 4.5) + RING_LIFT;
    };
    for (let segment = 0; segment < RING_SEGMENTS; segment += 1) {
      for (let strip = 0; strip < RING_EDGES.length - 1; strip += 1) {
        const base = positions.length / 3;
        for (const [step, edge] of [
          [segment, strip],
          [segment + 1, strip],
          [segment + 1, strip + 1],
          [segment, strip + 1],
        ] as const) {
          const angle = (step / RING_SEGMENTS) * Math.PI * 2;
          const radius = tower.captureRadius + (RING_EDGES[edge] ?? 0);
          const x = tower.position.x + Math.sin(angle) * radius;
          const z = tower.position.z + Math.cos(angle) * radius;
          positions.push(x, heightAt(x, z), z);
          normals.push(0, 1, 0);
        }
        // Counter-clockwise seen from above (Babylon front face).
        indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
    this.colors = new Float32Array((positions.length / 3) * 4);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.colors = this.colors;
    this.mesh = new Mesh(`${tower.id}-capture-ring`, scene);
    data.applyToMesh(this.mesh, true);
    this.material = new StandardMaterial(`${tower.id}-capture-ring-material`, scene);
    this.material.disableLighting = true;
    this.material.diffuseColor = Color3.Black();
    this.material.specularColor = Color3.Black();
    this.material.emissiveColor = Color3.White();
    this.material.zOffset = -3;
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = false;
    excludeFromShadows(this.mesh);
    this.paint(null, 0);
  }

  /** Fills |control| of the ring (clockwise from north) in the side the control leans to. */
  paint(owner: Faction | null, control: number): void {
    const side: Faction | null = control < -0.001 ? 'alpine' : control > 0.001 ? 'lagoon' : owner;
    const filled = Math.round(Math.min(1, Math.abs(control)) * RING_SEGMENTS);
    const key = `${side ?? '-'}:${filled}`;
    if (key === this.paintedKey) return;
    this.paintedKey = key;
    const fill = side ? SIDE_RGB[side] : PAPER_RGB;
    for (let segment = 0; segment < RING_SEGMENTS; segment += 1) {
      const band = segment < filled ? fill : PAPER_RGB;
      for (let strip = 0; strip < 3; strip += 1) {
        const color = strip === 1 ? band : INK_RGB;
        const vertex = (segment * 3 + strip) * 4;
        for (let corner = 0; corner < 4; corner += 1) setRgb(this.colors, (vertex + corner) * 4, color);
      }
    }
    this.mesh.updateVerticesData(VertexBuffer.ColorKind, this.colors);
  }

  dispose(): void {
    this.mesh.dispose();
    this.material.dispose();
  }
}

function drawFlagCloth(batch: GeometryBatch, style: Faction | 'neutral'): void {
  const field = style === 'alpine' ? P.peakBlue : style === 'lagoon' ? P.coral : P.cream;
  batch.box(1.02, 3.72, 0, 1.9, 1.12, 0.05, field, 'cloth', 0);
  batch.box(1.02, 3.2, 0, 1.9, 0.08, 0.06, P.ink, 'cloth', 0);
  for (const face of [-1, 1]) {
    batch.with(Affine.translation(1.02, 3.74, face * 0.035), () => {
      if (style === 'alpine') {
        // Edelweiss-snowflake emblem.
        for (let arm = 0; arm < 3; arm += 1) {
          batch.with(Affine.rotationZ((arm * Math.PI) / 3), () => batch.box(0, 0, 0, 0.72, 0.1, 0.02, P.white, 'cloth', 0));
        }
        batch.box(0, 0, 0, 0.18, 0.18, 0.025, P.flowerYellow, 'cloth', 0);
      } else if (style === 'lagoon') {
        batch.blob(0, 0, 0, 0.26, 0.26, 0.012, P.yellow, 'cloth', { segments: 10, rings: 3 });
        for (let ray = 0; ray < 8; ray += 1) {
          batch.with(Affine.rotationZ((ray * Math.PI) / 4).translate(0.38, 0, 0), () => batch.box(0, 0, 0, 0.14, 0.06, 0.015, P.orange, 'cloth', 0));
        }
      } else {
        batch.box(0, 0, 0, 0.6, 0.12, 0.02, P.plankGrey, 'cloth', 0);
      }
    });
  }
}

/** Pole + three cloth variants (one shown) + the beacon lamp on top. */
class TowerFlag {
  readonly root: TransformNode;
  readonly pole: Mesh | null;
  readonly cloths: Record<Faction | 'neutral', Mesh | null>;
  readonly beacon: Mesh;
  readonly beaconMaterial: StandardMaterial;
  private readonly clothPivot: TransformNode;
  private readonly phase: number;

  constructor(scene: Scene, visual: TowerVisual, material: Material) {
    const mount = FLAG_MOUNTS[visual.id] ?? { attach: '', offset: { x: 0, y: 0, z: 0 } };
    const anchor = visual.attach.get(mount.attach) ?? visual.root;
    this.root = new TransformNode(`${visual.id}-flag`, scene);
    this.root.parent = anchor;
    this.root.position.set(mount.offset.x, mount.offset.y, mount.offset.z);
    this.root.scaling.setAll(FLAG_SCALE);
    this.phase = visual.id.length * 1.7 + (visual.id.endsWith('b') ? 1.1 : visual.id.endsWith('c') ? 2.3 : 0);

    const poleBatch = new GeometryBatch();
    poleBatch.cylinder(0.075, 0.06, 4.45, 8, P.logDark, 'wood');
    poleBatch.cylinder(0.16, 0.13, 0.12, 10, P.gold, 'metal', { y: 0 });
    this.pole = poleBatch.toMesh(scene, `${visual.id}-flag-pole`, material);
    if (this.pole) {
      this.pole.unfreezeWorldMatrix();
      this.pole.parent = this.root;
    }

    this.clothPivot = new TransformNode(`${visual.id}-flag-cloth`, scene);
    this.clothPivot.parent = this.root;
    this.cloths = { alpine: null, lagoon: null, neutral: null };
    for (const style of ['alpine', 'lagoon', 'neutral'] as const) {
      const batch = new GeometryBatch();
      batch.jitter = 0.03;
      drawFlagCloth(batch, style);
      const mesh = batch.toMesh(scene, `${visual.id}-flag-${style}`, material);
      if (!mesh) continue;
      mesh.unfreezeWorldMatrix();
      mesh.parent = this.clothPivot;
      mesh.setEnabled(false);
      this.cloths[style] = mesh;
    }

    this.beacon = CreateSphere(`${visual.id}-beacon`, { diameter: 0.5, segments: 8 }, scene);
    this.beacon.parent = this.root;
    this.beacon.position.set(0, 4.62, 0);
    this.beacon.isPickable = false;
    this.beaconMaterial = new StandardMaterial(`${visual.id}-beacon-material`, scene);
    this.beaconMaterial.disableLighting = true;
    this.beaconMaterial.diffuseColor = Color3.Black();
    this.beaconMaterial.specularColor = Color3.Black();
    this.beaconMaterial.emissiveColor = BEACON_COLOR.neutral.clone();
    this.beacon.material = this.beaconMaterial;
    excludeFromShadows(this.beacon);
  }

  show(owner: Faction | null): void {
    const style = owner ?? 'neutral';
    for (const key of ['alpine', 'lagoon', 'neutral'] as const) this.cloths[key]?.setEnabled(key === style);
  }

  animate(time: number, state: TowerControlState | undefined): void {
    // A gentle breeze swing of the cloth around the pole.
    this.clothPivot.rotation.y = Math.sin(time * 1.6 + this.phase) * 0.28 + Math.sin(time * 3.9 + this.phase) * 0.06;
    const owner = state?.owner ?? null;
    const base = BEACON_COLOR[owner ?? 'neutral'];
    let color = base;
    let scale = 1;
    if (state?.contested) {
      // Contested: fast pulse alternating both team lights.
      const beat = Math.sin(time * 9);
      color = beat > 0 ? BEACON_COLOR.alpine : BEACON_COLOR.lagoon;
      scale = 1.15 + Math.abs(beat) * 0.35;
    } else if (state?.pushing) {
      // Being captured: blink toward the pushing team's light.
      const blink = (Math.sin(time * 6) + 1) / 2;
      color = Color3.Lerp(base, BEACON_COLOR[state.pushing], blink);
      scale = 1 + blink * 0.2;
    }
    this.beaconMaterial.emissiveColor.copyFrom(color);
    this.beacon.scaling.setAll(scale);
  }

  dispose(): void {
    this.pole?.dispose();
    for (const mesh of Object.values(this.cloths)) mesh?.dispose();
    this.beacon.dispose();
    this.beaconMaterial.dispose();
    this.clothPivot.dispose();
    this.root.dispose();
  }
}

interface Halo {
  mesh: Mesh;
  age: number;
  active: boolean;
}

const MAX_HALOS = 6;

export class TowerStateView {
  private readonly rings: CaptureRing[];
  private readonly flags: TowerFlag[];
  private readonly visuals: TowerVisual[];
  private readonly haloMaterials: Record<Faction, StandardMaterial>;
  private readonly halos: Halo[] = [];
  private states: readonly TowerControlState[] = [];
  private shownOwners: (Faction | null | undefined)[] = [undefined, undefined, undefined];
  private time = 0;

  constructor(
    private readonly scene: Scene,
    visuals: MapVisuals,
    toonMaterial: Material,
    probe: GroundProbe,
  ) {
    this.rings = CONQUEST_TOWERS.map((tower) => new CaptureRing(scene, tower, probe));
    this.visuals = CONQUEST_TOWERS.flatMap((tower) => {
      const visual = visuals.towers.get(tower.id);
      return visual ? [visual] : [];
    });
    this.flags = this.visuals.map((visual) => new TowerFlag(scene, visual, toonMaterial));
    const haloMaterial = (faction: Faction): StandardMaterial => {
      const material = new StandardMaterial(`spawn-halo-${faction}`, scene);
      material.disableLighting = true;
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.emissiveColor = BEACON_COLOR[faction].clone();
      material.zOffset = -4;
      return material;
    };
    this.haloMaterials = { alpine: haloMaterial('alpine'), lagoon: haloMaterial('lagoon') };
    // Round-start look until the first snapshot arrives.
    this.setState(
      CONQUEST_TOWERS.map((tower) => ({
        owner: tower.homeFaction,
        control: tower.homeFaction === 'alpine' ? -1 : tower.homeFaction === 'lagoon' ? 1 : 0,
        pushing: null,
        contested: false,
        alpine: 0,
        lagoon: 0,
      })),
    );
  }

  setState(states: readonly TowerControlState[]): void {
    this.states = states;
    states.forEach((state, index) => {
      this.rings[index]?.paint(state.owner, state.control);
      if (this.shownOwners[index] === state.owner) return;
      this.shownOwners[index] = state.owner;
      this.flags[index]?.show(state.owner);
      const visual = this.visuals[index];
      if (!visual) return;
      visual.dressing.alpine?.setEnabled(state.owner === 'alpine');
      visual.dressing.lagoon?.setEnabled(state.owner === 'lagoon');
      visual.pads.alpine?.setEnabled(state.owner === 'alpine');
      visual.pads.lagoon?.setEnabled(state.owner === 'lagoon');
      visual.pads.neutral?.setEnabled(state.owner === null);
    });
  }

  /** Soft team glow on the pad a player just spawned on, fading over the spawn protection. */
  spawnHalo(position: Vec3, faction: Faction): void {
    let halo = this.halos.find((candidate) => !candidate.active);
    if (!halo && this.halos.length < MAX_HALOS) {
      const mesh = CreateDisc('spawn-halo', { radius: 1.42, tessellation: 28 }, this.scene);
      mesh.rotation.x = Math.PI / 2;
      mesh.isPickable = false;
      excludeFromShadows(mesh);
      halo = { mesh, age: 0, active: false };
      this.halos.push(halo);
    }
    if (!halo) halo = this.halos.reduce((oldest, candidate) => (candidate.age > oldest.age ? candidate : oldest));
    halo.mesh.material = this.haloMaterials[faction];
    halo.mesh.position.set(position.x, position.y + 0.12, position.z);
    halo.mesh.setEnabled(true);
    halo.age = 0;
    halo.active = true;
  }

  update(delta: number): void {
    this.time += delta;
    this.flags.forEach((flag, index) => flag.animate(this.time, this.states[index]));
    this.rings.forEach((ring, index) => {
      const state = this.states[index];
      // Contested zones pulse their ring; a pushed zone breathes gently.
      const pulse = state?.contested ? 0.72 + 0.28 * Math.abs(Math.sin(this.time * 7)) : state?.pushing ? 0.88 + 0.12 * Math.sin(this.time * 5) : 1;
      ring.material.emissiveColor.set(pulse, pulse, pulse);
    });
    for (const halo of this.halos) {
      if (!halo.active) continue;
      halo.age += delta;
      const t = halo.age / SPAWN_PROTECTION_SECONDS;
      if (t >= 1) {
        halo.active = false;
        halo.mesh.setEnabled(false);
        continue;
      }
      halo.mesh.visibility = 0.5 * (1 - t) ** 1.4;
      halo.mesh.scaling.setAll(1 + 0.06 * Math.sin(halo.age * 9));
    }
  }

  dispose(): void {
    for (const ring of this.rings) ring.dispose();
    for (const flag of this.flags) flag.dispose();
    for (const halo of this.halos) halo.mesh.dispose();
    this.haloMaterials.alpine.dispose();
    this.haloMaterials.lagoon.dispose();
  }
}
