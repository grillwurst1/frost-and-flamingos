/**
 * Fjord Fiesta client visuals. Everything is derived from the immutable
 * shared blueprint (`FJORD_MAP`): terrain heightfield, props, routes and
 * gameplay anchors. Static geometry is batched into 100 m chunks (one mesh
 * each, frustum-culled), destructible elements and towers get their own
 * meshes so later packages can swap, hide or animate them, and the ground
 * clutter is per-chunk with a distance LOD cut-off.
 */
import { Color3 } from '@babylonjs/core/Maths/math';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import {
  FJORD_MAP,
  MAP_HALF_SIZE,
  SNOWLINE_Y,
  isClutterFree,
  sampleMapHeight,
  terrainBiomeAt,
  terrainSlopeAt,
  terrainSnowWeight,
  terrainSurfaceTagAt,
  type MapProp,
  type TowerId,
  type Vec3,
} from '@frost-and-flamingos/shared';
import { createSkyMaterial, createWaterMaterial } from './materials';
import { drawBuilding } from './map/buildings';
import { Affine, GeometryBatch, hash3 } from './map/geometry';
import {
  drawBillboardFrame,
  drawBoatDock,
  drawBridgeCables,
  drawBridgeDeck,
  drawBridgePylon,
  drawCablePylon,
  drawCableStation,
  drawClockPavilion,
  drawCoasterPlatform,
  drawCoasterTrack,
  drawHammock,
  drawHarborPlatform,
  drawLadder,
  drawLighthouse,
  drawPier,
  drawRouteCable,
  drawSnowCannon,
  drawStairs,
  drawStoneArch,
  drawSummitRoof,
  drawTBarPylon,
  drawTBarStation,
  drawWalkway,
  drawWaterfall,
} from './map/landmarks';
import {
  drawBush,
  drawDriftwood,
  drawFern,
  drawFir,
  drawFlowers,
  drawGrassTuft,
  drawPalm,
  drawPebbles,
  drawReeds,
  drawRock,
  drawShell,
  drawSnowMound,
} from './map/nature';
import { P } from './map/palette';
import { drawSmallProp, drawSpawnPad } from './map/props';
import { buildOuterRing, buildStreamMesh, buildTerrainMesh, buildWaterMesh } from './map/terrain-mesh';

export { MAP_SURFACE_IDS, MAP_SURFACE_KINDS, SURFACE_ATTRIBUTE } from './map/surfaces';
export { TERRAIN_BARE_COLOR_ATTRIBUTE, TERRAIN_SNOW_BIAS_ATTRIBUTE } from './map/terrain-mesh';

export interface PreviewStage {
  /** Feet position on top of the podium. */
  position: Vec3;
  radius: number;
}

export interface TowerVisual {
  id: TowerId;
  root: TransformNode;
  /** Neutral architecture (always visible). */
  mesh: Mesh | null;
  /** Team-held dressing, toggleable per faction (null when none is built yet). */
  dressing: { alpine: Mesh | null; lagoon: Mesh | null };
  /** Named attach points (`dome_top`, `gallery_ring`, `roof_ridge`, `fountain_basin`, ...). */
  attach: Map<string, TransformNode>;
}

export interface MapVisuals {
  waterMaterial: ShaderMaterial;
  skyMaterial: ShaderMaterial;
  waterMesh: Mesh;
  skyMesh: Mesh;
  terrainMesh: Mesh;
  previewStage: PreviewStage;
  /** Destructible element id (blueprint `destructibleId`) → its own mesh. */
  destructibleMeshes: Map<string, Mesh>;
  towers: Map<TowerId, TowerVisual>;
  /** Static meshes of the map (chunks, routes, clutter) for diagnostics. */
  staticMeshes: Mesh[];
  vertexCount: number;
}

const CHUNK = 100;
const CLUTTER_LOD_DISTANCE = 150;

class ChunkSet {
  readonly batches = new Map<string, GeometryBatch>();
  readonly clutter = new Map<string, GeometryBatch>();

  private key(x: number, z: number): string {
    return `${Math.floor(x / CHUNK)}_${Math.floor(z / CHUNK)}`;
  }

  at(x: number, z: number): GeometryBatch {
    const key = this.key(x, z);
    let batch = this.batches.get(key);
    if (!batch) {
      batch = new GeometryBatch();
      this.batches.set(key, batch);
    }
    return batch;
  }

  clutterAt(x: number, z: number): GeometryBatch {
    const key = this.key(x, z);
    let batch = this.clutter.get(key);
    if (!batch) {
      batch = new GeometryBatch();
      batch.jitter = 0.08;
      this.clutter.set(key, batch);
    }
    return batch;
  }
}

function snowAmount(x: number, z: number): number {
  const height = sampleMapHeight(x, z);
  const slope = terrainSlopeAt(x, z);
  const biome = terrainBiomeAt(x, z, height, slope);
  return terrainSnowWeight(height + 1.5, biome.snowBias, 0, SNOWLINE_Y);
}

const TOWER_PROP: Record<string, TowerId> = {
  tower_a_platform: 'tower_a',
  tower_a_lighthouse: 'tower_a',
  tower_b_pavilion: 'tower_b',
  tower_c_dairy: 'tower_c',
};

/** Lagoon-held dressing of Tower A (flamingo statues, bunting and its poles). */
function towerDressingOf(prop: MapProp): { tower: TowerId; faction: 'alpine' | 'lagoon' } | null {
  if (prop.kind === 'flamingo_statue' || prop.id.startsWith('harbor_bunting_') || prop.id.startsWith('harbor_pole_')) {
    return { tower: 'tower_a', faction: 'lagoon' };
  }
  return null;
}

/** Draws one blueprint prop into a batch in prop-local space. Returns false if nothing was drawn. */
function drawProp(batch: GeometryBatch, prop: MapProp): boolean {
  const seed = Math.floor(prop.position.x * 7.3 + prop.position.z * 3.1);
  switch (prop.kind) {
    case 'fir':
      drawFir(batch, prop.scale, prop.variant, snowAmount(prop.position.x, prop.position.z), seed);
      return true;
    case 'palm':
      drawPalm(batch, prop.scale, prop.variant, seed);
      return true;
    case 'rock': {
      const snow = snowAmount(prop.position.x, prop.position.z) > 0.4;
      const sandy = terrainSurfaceTagAt(prop.position.x, prop.position.z) === 'sand';
      drawRock(batch, prop.scale, prop.variant, snow ? 'snow' : sandy ? 'bare' : 'moss', seed);
      return true;
    }
    case 'chalet':
    case 'beach_bar':
    case 'fisher_hut':
    case 'side_hut':
    case 'hangar':
    case 'bamboo_garage':
      if (!prop.building) return false;
      drawBuilding(batch, prop.building, { variant: prop.variant, seed, snowy: snowAmount(prop.position.x, prop.position.z) > 0.3 });
      return true;
    case 'summit_dairy':
      if (!prop.building) return false;
      drawBuilding(batch, prop.building, { variant: prop.variant, seed, snowy: true });
      drawSummitRoof(batch, prop.building.width, prop.building.depth);
      return true;
    case 'harbor_platform':
      drawHarborPlatform(batch, prop);
      return true;
    case 'lighthouse':
      drawLighthouse(batch);
      return true;
    case 'pier':
      drawPier(batch, prop);
      return true;
    case 'stairs':
      drawStairs(batch, prop);
      return true;
    case 'clock_pavilion':
      drawClockPavilion(batch);
      return true;
    case 'bridge_deck':
      drawBridgeDeck(batch, prop);
      return true;
    case 'bridge_pylon':
      drawBridgePylon(batch, prop);
      return true;
    case 'walkway':
      drawWalkway(batch, prop);
      return true;
    case 'ladder':
      drawLadder(batch, prop.scale);
      return true;
    case 'waterfall':
      drawWaterfall(batch, prop);
      return true;
    case 'stone_arch':
      drawStoneArch(batch, prop);
      return true;
    case 'cable_station':
      drawCableStation(batch, prop);
      return true;
    case 'cable_pylon':
      drawCablePylon(batch, prop);
      return true;
    case 'tbar_pylon':
      drawTBarPylon(batch, prop);
      return true;
    case 'tbar_station':
      drawTBarStation(batch, prop.variant);
      return true;
    case 'coaster_platform':
      if (prop.variant === 1) return false;
      drawCoasterPlatform(batch, prop);
      return true;
    case 'hammock':
      drawHammock(batch, prop);
      return true;
    case 'billboard':
      drawBillboardFrame(batch, prop);
      return true;
    case 'boat_dock':
      drawBoatDock(batch, prop);
      return true;
    default:
      return drawSmallProp(batch, prop);
  }
}

/** World-space path props are drawn without the prop yaw. */
function usesPathFrame(prop: MapProp): boolean {
  return prop.kind === 'stone_wall' || prop.kind === 'fence' || prop.kind === 'bunting' || prop.kind === 'walkway';
}

function drawPropAt(batch: GeometryBatch, prop: MapProp): boolean {
  let drawn = false;
  const yaw = usesPathFrame(prop) ? 0 : prop.rotationY;
  batch.at(prop.position.x, prop.position.y, prop.position.z, yaw, () => {
    drawn = drawProp(batch, prop);
  });
  return drawn;
}

/** Dense, purely visual ground clutter: grass, flowers, pebbles, shells, driftwood, snow mounds, ferns. */
function scatterClutter(chunks: ChunkSet): void {
  const nav = FJORD_MAP.nav.nodes;
  const near = (x: number, z: number): boolean => nav.some((node) => Math.abs(node.position.x - x) < 45 && Math.abs(node.position.z - z) < 45);
  let seed = 1;
  const step = 3.4;
  for (let gx = -MAP_HALF_SIZE + 2; gx < MAP_HALF_SIZE - 2; gx += step) {
    for (let gz = -MAP_HALF_SIZE + 2; gz < MAP_HALF_SIZE - 2; gz += step) {
      seed += 1;
      const x = gx + (hash3(gx, gz, 1) - 0.5) * step;
      const z = gz + (hash3(gz, gx, 2) - 0.5) * step;
      const roll = hash3(x * 0.37, z * 0.41, 3);
      const busy = near(x, z);
      const density = busy ? 0.42 : 0.07;
      if (roll > density) continue;
      if (!isClutterFree(x, z)) continue;
      const tag = terrainSurfaceTagAt(x, z);
      const y = sampleMapHeight(x, z);
      if (y < 0.15) continue;
      const pick = hash3(x, z, 4);
      const batch = chunks.clutterAt(x, z);
      const yaw = hash3(x, z, 5) * Math.PI * 2;
      batch.at(x, y - 0.03, z, yaw, () => {
        switch (tag) {
          case 'grass_mud':
            if (pick < 0.62) drawGrassTuft(batch, 1 + hash3(x, 1, z) * 0.6, seed, false);
            else if (pick < 0.8) drawFlowers(batch, 1.2, seed);
            else if (pick < 0.9) drawBush(batch, 0.7 + hash3(z, 2, x) * 0.5, seed, pick > 0.86);
            else if (pick < 0.96) drawFern(batch, 1, seed);
            else drawPebbles(batch, 1, seed, P.rock);
            break;
          case 'sand':
            if (pick < 0.3) drawShell(batch, 1, seed);
            else if (pick < 0.55) drawPebbles(batch, 0.8, seed, P.sandShade);
            else if (pick < 0.78) drawGrassTuft(batch, 1.1, seed, true);
            else if (pick < 0.86 && y < 1.6) drawDriftwood(batch, 1, seed);
            else if (pick < 0.92) drawBush(batch, 0.6, seed, true);
            else drawShell(batch, 1.3, seed + 7);
            break;
          case 'snow':
            if (pick < 0.45) drawSnowMound(batch, 0.7 + hash3(x, 3, z) * 0.9, seed);
            else if (pick < 0.6) drawPebbles(batch, 1.4, seed, P.rockShade);
            else if (pick < 0.72) drawGrassTuft(batch, 0.9, seed, true);
            break;
          case 'rock_cliff':
            if (pick < 0.4) drawPebbles(batch, 1.6, seed, P.rock);
            break;
          case 'ice_patch':
            break;
          default:
            if (pick < 0.2) drawPebbles(batch, 0.7, seed, P.cobbleDark);
            break;
        }
      });
    }
  }
  // Reeds around the village pond and along the gorge stream.
  for (const point of FJORD_MAP.routes.gorgeStream.points) {
    if (hash3(point.x, point.z, 9) > 0.45) continue;
    const side = hash3(point.z, point.x, 3) > 0.5 ? 1 : -1;
    const x = point.x + side * 3.8;
    const z = point.z + side * 1.2;
    const batch = chunks.clutterAt(x, z);
    batch.at(x, sampleMapHeight(x, z), z, 0, () => drawReeds(batch, 1, Math.floor(point.x)));
  }
}

function buildPosters(scene: Scene, props: readonly MapProp[]): Mesh[] {
  const meshes: Mesh[] = [];
  for (const billboard of FJORD_MAP.destructibles.billboards) {
    const prop = props.find((candidate) => candidate.id === billboard.propId);
    if (!prop) continue;
    const posts = prop.dimensions?.z ?? 2.3;
    const material = new StandardMaterial(`poster-${billboard.id}`, scene);
    material.disableLighting = true;
    material.backFaceCulling = true;
    material.specularColor = Color3.Black();
    material.emissiveColor = new Color3(0.96, 0.94, 0.9);
    const plane = CreatePlane(`poster-${billboard.id}`, { width: billboard.width - 0.1, height: billboard.height - 0.1 }, scene);
    const texture = new Texture(
      `/art/billboards/poster-${billboard.posterId}.jpg`,
      scene,
      false,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
      () => {
        material.emissiveTexture = texture;
        material.diffuseColor = Color3.Black();
        plane.setEnabled(true);
      },
      () => {
        // Missing poster file: keep the vertex-colour fallback painted on the board.
        plane.setEnabled(false);
      },
    );
    plane.material = material;
    plane.setEnabled(false);
    // Babylon planes face −Z; the billboard front is +Z in prop space.
    plane.rotation.y = prop.rotationY + Math.PI;
    const forward = { x: Math.sin(prop.rotationY), z: Math.cos(prop.rotationY) };
    plane.position.set(
      prop.position.x + forward.x * 0.04,
      prop.position.y + posts + billboard.height / 2,
      prop.position.z + forward.z * 0.04,
    );
    plane.isPickable = false;
    plane.freezeWorldMatrix();
    meshes.push(plane);
  }
  return meshes;
}

function makeTowerVisual(scene: Scene, id: TowerId): TowerVisual {
  const tower = FJORD_MAP.towers.find((candidate) => candidate.id === id);
  const root = new TransformNode(`${id}-root`, scene);
  if (tower) root.position.set(tower.position.x, tower.position.y, tower.position.z);
  const attach = new Map<string, TransformNode>();
  for (const point of tower?.attachPoints ?? []) {
    const node = new TransformNode(`${id}:${point.id}`, scene);
    node.parent = root;
    node.position.set(point.position.x - root.position.x, point.position.y - root.position.y, point.position.z - root.position.z);
    node.rotation.y = point.rotationY;
    node.metadata = { radius: point.radius ?? 0 };
    attach.set(point.id, node);
  }
  return { id, root, mesh: null, dressing: { alpine: null, lagoon: null }, attach };
}

/**
 * Menu/wardrobe podium on the plateau's south apron, so the orbiting preview
 * camera sweeps from the alps and the bridge to the lagoon.
 */
function buildPreviewStage(batch: GeometryBatch): PreviewStage {
  const x = -18;
  const z = -53;
  const ground = sampleMapHeight(x, z);
  batch.at(x, ground, z, 0.35, () => {
    batch.cylinder(3.9, 3.7, 0.3, 28, P.logDark, 'wood', { y: 0 });
    batch.cylinder(3.15, 2.95, 0.26, 28, P.cream, 'wood', { y: 0.3 });
    batch.cylinder(2.45, 2.35, 0.2, 28, P.tealDark, 'cloth', { y: 0.56 });
    batch.cylinder(2.05, 2.05, 0.04, 28, P.teal, 'cloth', { y: 0.76 });
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      batch.with(Affine.translation(Math.sin(angle) * 3.4, 0.56, Math.cos(angle) * 3.4), () => {
        batch.cylinder(0.11, 0.08, 0.42, 8, P.gold, 'metal');
        batch.blob(0, 0.5, 0, 0.12, 0.12, 0.12, index % 2 === 0 ? P.flamingoLight : P.glass, 'plain', { segments: 6, rings: 4 });
      });
    }
    for (const side of [-1, 1]) batch.log([side * 3.2, 0, 2.4], [side * 3.2, 4.6, 2.4], 0.09, P.logDark, 'wood', { segments: 6 });
    batch.box(0, 4.1, 2.4, 6.8, 0.9, 0.08, P.cream, 'cloth', 0.02);
    batch.box(0, 4.1, 2.44, 6.8, 0.18, 0.1, P.coral, 'cloth', 0);
  });
  return { position: { x, y: ground + 0.8, z }, radius: 3.7 };
}

export function buildFjordFiesta(scene: Scene, material: ShaderMaterial): MapVisuals {
  const skyMaterial = createSkyMaterial(scene, 'sky-material');
  const waterMaterial = createWaterMaterial(scene, 'water-material');

  const terrain = buildTerrainMesh(scene, material);
  const water = buildWaterMesh(scene, waterMaterial);
  const staticMeshes: Mesh[] = [];
  const stream = buildStreamMesh(scene, waterMaterial);
  if (stream) staticMeshes.push(stream);
  const ring = buildOuterRing(scene, material);
  if (ring) staticMeshes.push(ring);

  const sky = CreateSphere('fjord-sky', { diameter: 3200, segments: 32, sideOrientation: Mesh.BACKSIDE }, scene);
  sky.material = skyMaterial;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.alwaysSelectAsActiveMesh = true;
  sky.renderingGroupId = 0;

  const chunks = new ChunkSet();
  const destructibleBatches = new Map<string, GeometryBatch>();
  const towerBatches = new Map<TowerId, GeometryBatch>();
  const dressingBatches = new Map<string, GeometryBatch>();
  const towers = new Map<TowerId, TowerVisual>();
  for (const id of ['tower_a', 'tower_b', 'tower_c'] as const) towers.set(id, makeTowerVisual(scene, id));

  for (const prop of FJORD_MAP.props) {
    const tower = TOWER_PROP[prop.id];
    const dressing = towerDressingOf(prop);
    let batch: GeometryBatch;
    if (prop.destructibleId) {
      batch = destructibleBatches.get(prop.destructibleId) ?? new GeometryBatch();
      destructibleBatches.set(prop.destructibleId, batch);
    } else if (tower) {
      batch = towerBatches.get(tower) ?? new GeometryBatch();
      towerBatches.set(tower, batch);
    } else if (dressing) {
      const key = `${dressing.tower}:${dressing.faction}`;
      batch = dressingBatches.get(key) ?? new GeometryBatch();
      dressingBatches.set(key, batch);
    } else {
      batch = chunks.at(prop.position.x, prop.position.z);
    }
    drawPropAt(batch, prop);
  }

  // Tower C team dressing: the brass roof snow cannon on the clock-house ridge.
  const ridge = FJORD_MAP.towers.find((tower) => tower.id === 'tower_c')?.attachPoints.find((point) => point.id === 'roof_ridge');
  if (ridge) {
    const cannon = new GeometryBatch();
    cannon.at(ridge.position.x, ridge.position.y - 0.6, ridge.position.z, ridge.rotationY, () => drawSnowCannon(cannon));
    dressingBatches.set('tower_c:alpine', cannon);
  }

  // Spawn pads (tower pads drawn once per position in the home colour, base pads in faction colour).
  const drawnPads = new Set<string>();
  for (const spawn of FJORD_MAP.spawns) {
    const key = `${spawn.position.x.toFixed(1)}_${spawn.position.z.toFixed(1)}`;
    if (drawnPads.has(key)) continue;
    drawnPads.add(key);
    const batch = chunks.at(spawn.position.x, spawn.position.z);
    const tower = FJORD_MAP.towers.find((candidate) => candidate.id === spawn.source);
    const faction = spawn.source === 'base' ? spawn.faction : (tower?.homeFaction ?? spawn.faction);
    batch.at(spawn.position.x, spawn.position.y - 0.05, spawn.position.z, 0, () => drawSpawnPad(batch, faction));
  }

  // Long route geometry: bridge cables, cable-car rope, T-bar rope, coaster trough.
  const routes = new GeometryBatch();
  drawBridgeCables(routes);
  drawRouteCable(routes, FJORD_MAP.routes.cableCar.cable, 0.09, P.ink);
  drawRouteCable(routes, FJORD_MAP.routes.cableCar.cable, 0.06, P.metalDark, -0.45);
  drawRouteCable(routes, FJORD_MAP.routes.tBar.cable, 0.05, P.metalDark);
  const coaster = new GeometryBatch();
  coaster.jitter = 0;
  drawCoasterTrack(coaster);

  const previewBatch = new GeometryBatch();
  const previewStage = buildPreviewStage(previewBatch);

  scatterClutter(chunks);

  let vertexCount = terrain.getTotalVertices() + water.getTotalVertices();
  const register = (mesh: Mesh | null, list: Mesh[]): Mesh | null => {
    if (!mesh) return null;
    vertexCount += mesh.getTotalVertices();
    list.push(mesh);
    return mesh;
  };
  for (const [key, batch] of chunks.batches) register(batch.toMesh(scene, `map-chunk-${key}`, material), staticMeshes);
  for (const [key, batch] of chunks.clutter) {
    const mesh = register(batch.toMesh(scene, `map-clutter-${key}`, material), staticMeshes);
    if (mesh) mesh.addLODLevel(CLUTTER_LOD_DISTANCE, null);
  }
  register(routes.toMesh(scene, 'map-routes', material), staticMeshes);
  register(coaster.toMesh(scene, 'map-coaster', material), staticMeshes);
  const preview = register(previewBatch.toMesh(scene, 'preview-stage', material), staticMeshes);
  if (preview) preview.alwaysSelectAsActiveMesh = true;

  const destructibleMeshes = new Map<string, Mesh>();
  const destructibleList: Mesh[] = [];
  for (const [id, batch] of destructibleBatches) {
    const mesh = register(batch.toMesh(scene, `destructible-${id}`, material), destructibleList);
    if (mesh) destructibleMeshes.set(id, mesh);
  }
  for (const [id, batch] of towerBatches) {
    const visual = towers.get(id);
    const mesh = register(batch.toMesh(scene, `${id}-architecture`, material), destructibleList);
    if (visual && mesh) visual.mesh = mesh;
  }
  for (const [key, batch] of dressingBatches) {
    const [towerId, faction] = key.split(':') as [TowerId, 'alpine' | 'lagoon'];
    const visual = towers.get(towerId);
    const mesh = register(batch.toMesh(scene, `${towerId}-dressing-${faction}`, material), destructibleList);
    if (visual && mesh) visual.dressing[faction] = mesh;
  }
  staticMeshes.push(...buildPosters(scene, FJORD_MAP.props));

  return {
    waterMaterial,
    skyMaterial,
    waterMesh: water,
    skyMesh: sky,
    terrainMesh: terrain,
    previewStage,
    destructibleMeshes,
    towers,
    staticMeshes,
    vertexCount,
  };
}
