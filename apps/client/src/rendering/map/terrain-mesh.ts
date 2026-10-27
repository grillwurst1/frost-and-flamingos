/**
 * Terrain, sea, gorge stream and the mountain ring beyond the map edge.
 *
 * The playable terrain mesh is vertex-identical to the shared 257 × 257
 * heightfield (same triangle diagonal), so what the player sees is exactly
 * what the Rapier collider walks on.
 */
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import {
  BASE_HEIGHTS,
  COAST_GRID,
  FJORD_MAP,
  FjordLayout,
  GRID_POINTS,
  MAP_HALF_SIZE,
  SNOWLINE_Y,
  WATER_LEVEL,
  gridCoordinate,
  isOnIcePatch,
  sampleMapHeight,
  terrainBiomeAt,
  terrainSnowWeight,
} from '@frost-and-flamingos/shared';
import { GeometryBatch, hash3, mix, shade, type RGB } from './geometry';
import { P } from './palette';
import { referenceFrost } from './reference-frost';
import { SURFACE_ATTRIBUTE, surfaceId, type SurfaceKind } from './surfaces';
import { TERRAIN_MIX_A_ATTRIBUTE, TERRAIN_MIX_B_ATTRIBUTE } from '../materials';

/** Vertex attributes a future weather shader can use to move the snowline. */
export const TERRAIN_BARE_COLOR_ATTRIBUTE = 'bareColor';
export const TERRAIN_SNOW_BIAS_ATTRIBUTE = 'snowBias';

function noise(x: number, z: number, scale: number): number {
  return hash3(Math.floor(x * scale) * 1.3, 0.7, Math.floor(z * scale) * 1.7);
}

/** Bilinear value noise (smooth patches, unlike the blocky `noise`). */
function softNoise(x: number, z: number, scale: number, seed: number): number {
  const fx = x * scale;
  const fz = z * scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = smooth(fx - ix);
  const tz = smooth(fz - iz);
  const a = hash3(ix, seed, iz);
  const b = hash3(ix + 1, seed, iz);
  const c = hash3(ix, seed, iz + 1);
  const d = hash3(ix + 1, seed, iz + 1);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

interface TerrainPaint {
  bare: RGB;
  final: RGB;
  snowBias: number;
  surface: SurfaceKind;
  /** Painted layer weights (shaders/detail.ts FF_TERRAIN): snow, sand, grass, rock. */
  mixA: [number, number, number, number];
  /** cobble, mud, ice, wet shore. */
  mixB: [number, number, number, number];
}

/** Layer stack painted "over" like brush washes: each layer covers what lies beneath. */
class TerrainLayers {
  snow = 0;
  sand = 0;
  grass = 1;
  rock = 0;
  cobble = 0;
  mud = 0;

  over(layer: 'snow' | 'sand' | 'grass' | 'rock' | 'cobble' | 'mud', amount: number): void {
    const t = Math.min(1, Math.max(0, amount));
    if (t <= 0) return;
    const keep = 1 - t;
    this.snow *= keep;
    this.sand *= keep;
    this.grass *= keep;
    this.rock *= keep;
    this.cobble *= keep;
    this.mud *= keep;
    this[layer] += t;
  }
}

const SQUARE_HALF = FjordLayout.SQUARE_HALF;

function paintTerrain(x: number, z: number, height: number, slope: number, coast: number): TerrainPaint {
  const biome = terrainBiomeAt(x, z, height, slope, coast);
  const patch = noise(x, z, 0.08);
  const fine = noise(x, z, 0.45);
  let bare: RGB;
  let surface: SurfaceKind = 'grass';
  const layers = new TerrainLayers();
  let wetShore = 0;

  // Meadow base with saturated patches.
  const grass = mix(mix(P.grassShade, P.grass, 0.55 + patch * 0.45), P.grassLight, fine > 0.82 ? 0.45 : 0);
  bare = grass;
  // Grass/mud transition band just below the snowline and on worn slopes.
  const band = smooth((height - (SNOWLINE_Y - 6)) / 4) * (1 - smooth((height - SNOWLINE_Y - 2) / 3));
  if (band > 0) {
    bare = mix(bare, mix(P.mud, P.dirt, patch), band * 0.55);
    layers.over('mud', band * 0.55);
  }
  if (biome.dirt > 0) {
    bare = mix(bare, mix(P.dirt, P.mud, fine * 0.6), biome.dirt);
    layers.over('mud', biome.dirt);
    if (biome.dirt > 0.5) surface = 'mud';
  }
  if (biome.sand > 0) {
    // Wet strip at the waterline (~0-2 m up the beach), then pale dry sand.
    const wet = 1 - smooth((height - 0.2) / 0.8);
    const sand = mix(mix(P.sandShade, P.sand, 0.5 + patch * 0.5), P.wetSand, wet);
    bare = mix(bare, sand, biome.sand);
    layers.over('sand', biome.sand);
    wetShore = wet * biome.sand;
    if (biome.sand > 0.5) surface = 'sand';
  }
  if (height < WATER_LEVEL) {
    // Lagoon floor: bright sand turning teal with depth (the water is translucent).
    const depth = smooth(-height / 4.5);
    bare = mix(mix(P.sand, P.wetSand, 0.4), mix(P.lagoonMid, P.lagoonDeep, 0.3), depth * 0.75);
    layers.over('sand', 1);
    wetShore = 0;
    surface = 'sand';
  }
  // Lanes crossing the beach read as trodden sand tracks, not cobbles (paintings).
  const square = Math.max(Math.abs(x), Math.abs(z)) < SQUARE_HALF + 1.5;
  const sandTrack = !square && biome.sand > 0.35 ? biome.cobble : 0;
  if (sandTrack > 0) {
    bare = mix(bare, mix(P.wetSand, P.sandShade, 0.35 + fine * 0.3), sandTrack * 0.75);
    layers.over('sand', sandTrack * 0.75);
  }
  if (biome.cobble > 0 && sandTrack === 0) {
    // Painted cobbles (colour tile) over a warm stone tone; the plaza disc is dark grout under the paving mesh.
    const stone = mix(P.cobble, P.cobbleWarm, patch);
    const grout = Math.hypot(x, z) < 24.8 ? 1 : 0;
    bare = mix(bare, mix(mix(stone, P.cobbleDark, fine * 0.25), shade(P.cobbleDark, 0.8), grout), biome.cobble);
    layers.over('cobble', biome.cobble);
    // Lanes outside the square are muddy cobble tracks: mud washes in patches and along the verges.
    if (!square) {
      const verge = smooth((0.85 - biome.cobble) / 0.5);
      const puddle = smooth((softNoise(x, z, 0.09, 23) - 0.52) / 0.22);
      const muddy = Math.min(0.75, verge * 0.6 + puddle * 0.5) * biome.cobble;
      bare = mix(bare, mix(P.mud, P.dirt, fine), muddy);
      layers.over('mud', muddy);
    }
    if (biome.cobble > 0.5) surface = 'cobble';
  }
  // Rock outcrops breaking through the snow on the high alps (relief for the NE massif).
  const ridge = Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.sin(z * 0.09 + Math.sin(x * 0.05) * 2);
  const outcrop = height > SNOWLINE_Y + 9 ? smooth((ridge - 0.3) / 0.25) * smooth((slope - 0.24) / 0.16) : 0;
  const rockWeight = Math.max(biome.rock, outcrop);
  if (rockWeight > 0) {
    // Broad colour strata support the actual cliff facets. Rapid height stripes
    // alias against the heightfield cells and make whole walls look cracked/noisy.
    const strata = Math.sin(height * .18 + softNoise(x, z, .025, 181) * 1.3) * .5 + .5;
    const rock = mix(mix(P.rockShade, P.rock, .35 + strata * .3), P.rockLight, softNoise(x, z, .06, 182) * .15);
    bare = mix(bare, rock, rockWeight);
    layers.over('rock', rockWeight);
    if (rockWeight > 0.5) surface = 'rock';
  }
  let final = bare;
  // High peaks read as snow-clad alps (paintings), not grey rock pyramids:
  // above the treeline the rock only shows as streaks through the snow.
  // Visual only; the server's surface tags keep the shared rock weights.
  const alpine = smooth((height - (SNOWLINE_Y + 10)) / 16);
  const streak = fine > 0.62 || patch > 0.8 ? 1 : 0;
  const rockForSnow = rockWeight * (1 - alpine * (streak ? 0.25 : 0.75));
  const snow = height >= WATER_LEVEL ? Math.max(terrainSnowWeight(height, biome.snowBias, rockForSnow, SNOWLINE_Y), referenceFrost(x,z,height)*(1-rockWeight*.8)) : 0;
  if (snow > 0) {
    // Steeper, wind-blown slopes read cooler and bluer than the sheltered flats.
    const windBlown = smooth((slope - 0.16) / 0.34) * 0.6;
    const snowColor = mix(mix(P.snowShade, P.snow, 0.55 + Math.min(1, snow) * 0.45 - rockWeight * 0.3), P.snowShade, windBlown);
    final = mix(bare, snowColor, Math.min(1, snow * 1.15));
    layers.over('snow', snow * 1.15);
    if (snow > 0.5 && surface !== 'cobble') surface = 'snow';
    // Packed snow trails: roads and trails above the snowline stay visible as
    // trodden, slightly warm-grey bands with darker ruts (paintings).
    const road = square ? 0 : Math.max(biome.cobble, biome.dirt);
    if (snow > 0.3 && road > 0.2) {
      const rut = Math.abs(Math.sin((x + z) * 1.9 + patch * 3)) > 0.82 ? 0.18 : 0;
      const packed = mix(mix(P.snowShade, P.cream, 0.28), P.rockShade, 0.08 + rut);
      final = mix(final, packed, Math.min(1, road * 1.1) * 0.7);
      surface = 'snow';
    }
  }
  let ice = 0;
  if (isOnIcePatch(x, z)) {
    final = mix(P.iceDeep, P.ice, 0.45 + patch * 0.4);
    surface = 'ice';
    ice = 1;
  }
  const keep = 1 - ice;
  return {
    bare,
    final,
    snowBias: biome.snowBias,
    surface,
    mixA: [layers.snow * keep, layers.sand * keep, layers.grass * keep, layers.rock * keep],
    mixB: [layers.cobble * keep, layers.mud * keep, ice, wetShore * keep],
  };
}

export function buildTerrainMesh(scene: Scene, material: Material): Mesh {
  const count = GRID_POINTS * GRID_POINTS;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const bareColors = new Float32Array(count * 4);
  const snowBias = new Float32Array(count);
  const surfaces = new Float32Array(count);
  const mixA = new Float32Array(count * 4);
  const mixB = new Float32Array(count * 4);
  const height = (column: number, row: number): number => {
    const c = Math.min(GRID_POINTS - 1, Math.max(0, column));
    const r = Math.min(GRID_POINTS - 1, Math.max(0, row));
    return BASE_HEIGHTS[c * GRID_POINTS + r] ?? 0;
  };
  const cell = gridCoordinate(1) - gridCoordinate(0);
  for (let row = 0; row < GRID_POINTS; row += 1) {
    for (let column = 0; column < GRID_POINTS; column += 1) {
      const index = row * GRID_POINTS + column;
      const x = gridCoordinate(column);
      const z = gridCoordinate(row);
      const y = height(column, row);
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
      const nx = height(column - 1, row) - height(column + 1, row);
      const nz = height(column, row - 1) - height(column, row + 1);
      const ny = cell * 2;
      const length = Math.hypot(nx, ny, nz) || 1;
      normals[index * 3] = nx / length;
      normals[index * 3 + 1] = ny / length;
      normals[index * 3 + 2] = nz / length;
      const slope = Math.acos(Math.min(1, ny / length));
      const paint = paintTerrain(x, z, y, slope, COAST_GRID[column * GRID_POINTS + row] ?? 0);
      colors.set([paint.final[0], paint.final[1], paint.final[2], 1], index * 4);
      bareColors.set([paint.bare[0], paint.bare[1], paint.bare[2], 1], index * 4);
      snowBias[index] = paint.snowBias;
      surfaces[index] = surfaceId(paint.surface);
      mixA.set(paint.mixA, index * 4);
      mixB.set(paint.mixB, index * 4);
    }
  }
  const segments = GRID_POINTS - 1;
  const indices = new Uint32Array(segments * segments * 6);
  let cursor = 0;
  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * GRID_POINTS + column; // (x0, z0)
      const b = a + 1; // (x1, z0)
      const c = a + GRID_POINTS + 1; // (x1, z1)
      const d = a + GRID_POINTS; // (x0, z1)
      // Match Rapier's (x1, z0)–(x0, z1) diagonal: feet must meet the visible ground.
      indices.set([a, b, d, b, c, d], cursor);
      cursor += 6;
    }
  }
  const mesh = new Mesh('fjord-terrain', scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(mesh, true);
  mesh.setVerticesData(TERRAIN_BARE_COLOR_ATTRIBUTE, bareColors, false, 4);
  mesh.setVerticesData(TERRAIN_SNOW_BIAS_ATTRIBUTE, snowBias, false, 1);
  mesh.setVerticesData(SURFACE_ATTRIBUTE, surfaces, false, 1);
  mesh.setVerticesData(TERRAIN_MIX_A_ATTRIBUTE, mixA, false, 4);
  mesh.setVerticesData(TERRAIN_MIX_B_ATTRIBUTE, mixB, false, 4);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.alwaysSelectAsActiveMesh = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Foothill ring beyond the boundary
// ---------------------------------------------------------------------------
//
// The painted horizon panorama (art/sky/horizon-panorama.jpg) already shows
// the high Alps from north round to south-east and the open sea with islands
// to the south-west. The ring therefore stays LOW: a forested, snowy foothill
// shoulder that continues the map edge (no visible terrain cut-off) and caps
// its skyline a few degrees above the horizon, so the painted summits rise
// behind it instead of grey procedural pyramids standing in front of them.

const SKIRT_EXTENT = 1500;
/** Reference eye for the skyline cap (village plaza height). */
const SKYLINE_EYE_Y = 18;
/** Maximum skyline elevation of the ring seen from the map centre (tan 5.2 deg). */
const SKYLINE_SLOPE = 0.091;

function ridgeNoise(a: number, b: number): number {
  const n = Math.sin(a * 1.7 + Math.sin(b * 0.9) * 2) * 0.5 + 0.5;
  const m = Math.sin(a * 4.3 + b * 1.3 + 1.2) * 0.5 + 0.5;
  const k = Math.sin(a * 9.1 - b * 2.1 + 0.4) * 0.5 + 0.5;
  return (1 - Math.abs(n * 2 - 1)) * 0.55 + (1 - Math.abs(m * 2 - 1)) * 0.3 + k * 0.15;
}

/** 0 on land, 1 on the open sea (south edge, south-east coast and west channel). */
function seaWeight(x: number, z: number): number {
  const angle = Math.atan2(x, z); // 0 = north, pi/2 = east
  // Sea azimuths ~115..290 deg (the map's own coast meets the edge there).
  const southness = Math.cos(angle - (202 * Math.PI) / 180);
  return smooth((southness - 0.36) / 0.22);
}

export function outerIsSea(x: number, z: number): boolean {
  return seaWeight(x, z) > 0.5;
}

/** Snow line of the foothill ring (metres). */
export function outerSnowLine(x: number, z: number): number {
  return 44 + hash3(Math.floor(x * 0.01), 0, Math.floor(z * 0.01)) * 14;
}

/** Height of the foothill ring / open sea beyond the playable square. */
export function outerHeight(x: number, z: number): number {
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const clampedX = Math.max(-MAP_HALF_SIZE, Math.min(MAP_HALF_SIZE, x));
  const clampedZ = Math.max(-MAP_HALF_SIZE, Math.min(MAP_HALF_SIZE, z));
  const edgeHeight = sampleMapHeight(clampedX, clampedZ);
  const angle = Math.atan2(x, z);
  const distance = Math.hypot(x, z);
  const sea = seaWeight(x, z);
  const ridge = ridgeNoise(angle * 5.1, distance * 0.006);
  const roll = Math.sin(angle * 11 + distance * 0.011) * 0.5 + 0.5;
  // Forested shoulder: continue the edge, settle onto a rolling plateau.
  const plateau = Math.max(8, edgeHeight * 0.8 + 10 + ridge * 26 + roll * 10);
  const shoulder = smooth((edge - MAP_HALF_SIZE) / 170);
  let land = edgeHeight + (plateau - edgeHeight) * shoulder;
  const cap = Math.max(edgeHeight + 4, SKYLINE_EYE_Y + SKYLINE_SLOPE * distance);
  land = Math.min(land, cap);
  // Islets only inside the fine 12 m skirt grid: on the coarse outer grid a
  // single-vertex peak reads as a floating pyramid.
  const islands = smooth((ridgeNoise(angle * 9, distance * 0.01) - 0.82) / 0.1) * 12 * (1 - smooth((edge - 700) / 60));
  const ring = land * (1 - sea) + (-7 + islands) * sea;
  const blend = smooth((edge - MAP_HALF_SIZE) / 120);
  return edgeHeight + (ring - edgeHeight) * blend;
}

export function buildOuterRing(scene: Scene, material: Material): Mesh | null {
  const batch = new GeometryBatch();
  batch.jitter = 0;
  const coordinates: number[] = [];
  for (let value = -SKIRT_EXTENT; value < -780; value += 60) coordinates.push(value);
  for (let value = -780; value < -MAP_HALF_SIZE - 40; value += 12) coordinates.push(value);
  for (let value = -MAP_HALF_SIZE - 40; value <= MAP_HALF_SIZE + 40; value += 10) coordinates.push(value);
  for (let value = MAP_HALF_SIZE + 52; value <= 780; value += 12) coordinates.push(value);
  for (let value = 840; value <= SKIRT_EXTENT; value += 60) coordinates.push(value);
  const size = coordinates.length;
  const heights: number[] = [];
  const vertexIndex: number[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const x = coordinates[column] ?? 0;
      const z = coordinates[row] ?? 0;
      const inside = Math.max(Math.abs(x), Math.abs(z)) < MAP_HALF_SIZE - 8;
      // Tuck the skirt under the playable terrain near the seam.
      const y = inside ? sampleMapHeight(x, z) - 3 : outerHeight(x, z) - (Math.max(Math.abs(x), Math.abs(z)) < MAP_HALF_SIZE + 2 ? 0.8 : 0);
      heights.push(y);
    }
  }
  const h = (column: number, row: number): number => heights[Math.min(size - 1, Math.max(0, row)) * size + Math.min(size - 1, Math.max(0, column))] ?? 0;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const x = coordinates[column] ?? 0;
      const z = coordinates[row] ?? 0;
      const y = h(column, row);
      const dx = (coordinates[Math.min(size - 1, column + 1)] ?? x) - (coordinates[Math.max(0, column - 1)] ?? x);
      const dz = (coordinates[Math.min(size - 1, row + 1)] ?? z) - (coordinates[Math.max(0, row - 1)] ?? z);
      const nx = -(h(column + 1, row) - h(column - 1, row)) / (dx || 1);
      const nz = -(h(column, row + 1) - h(column, row - 1)) / (dz || 1);
      const length = Math.hypot(nx, 1, nz);
      const steep = 1 - 1 / length;
      const snowLine = outerSnowLine(x, z);
      const patch = hash3(Math.floor(x * 0.04), 2, Math.floor(z * 0.04));
      let color: RGB;
      let surface: SurfaceKind = 'grass';
      if (y < 0.5) {
        color = mix(P.sand, P.wetSand, 0.5);
        surface = 'sand';
      } else if (y > snowLine) {
        color = mix(P.snowShade, P.snow, 0.55 + (1 - steep) * 0.45);
        surface = 'snow';
      } else if (steep > 0.5) {
        color = mix(P.rockShade, P.rock, hash3(x * 0.03, y * 0.05, z * 0.03));
        surface = 'rock';
      } else {
        // Forest floor under the painted ring forests, meadow clearings between.
        color = mix(mix(P.grassShade, P.firDark, 0.35), P.grass, patch * 0.55);
        if (y > snowLine - 8) color = mix(color, P.snowShade, smooth((y - snowLine + 8) / 8) * 0.8);
      }
      vertexIndex.push(batch.vertex(x, y, z, nx / length, 1 / length, nz / length, color, surface));
    }
  }
  for (let row = 0; row + 1 < size; row += 1) {
    for (let column = 0; column + 1 < size; column += 1) {
      const x0 = coordinates[column] ?? 0;
      const x1 = coordinates[column + 1] ?? 0;
      const z0 = coordinates[row] ?? 0;
      const z1 = coordinates[row + 1] ?? 0;
      const fullyInside = Math.max(Math.abs(x0), Math.abs(x1)) < MAP_HALF_SIZE - 20 && Math.max(Math.abs(z0), Math.abs(z1)) < MAP_HALF_SIZE - 20;
      if (fullyInside) continue;
      const a = vertexIndex[row * size + column] ?? 0;
      const b = vertexIndex[row * size + column + 1] ?? 0;
      const c = vertexIndex[(row + 1) * size + column + 1] ?? 0;
      const d = vertexIndex[(row + 1) * size + column] ?? 0;
      batch.indices.push(a, b, c, a, c, d);
    }
  }
  const mesh = batch.toMesh(scene, 'fjord-outer-ring', material);
  if (mesh) mesh.alwaysSelectAsActiveMesh = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

function waterCoordinates(): number[] {
  const values: number[] = [-SKIRT_EXTENT, -1100, -800, -620, -500];
  for (let value = -440; value <= 440; value += 5) values.push(value);
  values.push(500, 620, 800, 1100, SKIRT_EXTENT);
  return values;
}

function groundForWater(x: number, z: number): number {
  return Math.max(Math.abs(x), Math.abs(z)) <= MAP_HALF_SIZE ? sampleMapHeight(x, z) : outerHeight(x, z);
}

/** Sea plane with vertex data the water shader reads: r = foam, g = depth ratio, a = alpha. */
export function buildWaterMesh(scene: Scene, material: Material): Mesh {
  const coordinates = waterCoordinates();
  const size = coordinates.length;
  const positions: number[] = [];
  const colors: number[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const x = coordinates[column] ?? 0;
      const z = coordinates[row] ?? 0;
      const depth = WATER_LEVEL - groundForWater(x, z);
      const depthRatio = Math.min(1, Math.max(0, depth / 9));
      const foam = depth <= -0.6 ? 0 : 1 - Math.min(1, Math.max(0, (depth - 0.1) / 2.4));
      const alpha = depth <= -0.4 ? 0 : Math.min(0.92, 0.5 + depthRatio * 0.45);
      positions.push(x, 0, z);
      colors.push(foam, depthRatio, 0, alpha);
    }
  }
  const indices: number[] = [];
  for (let row = 0; row + 1 < size; row += 1) {
    for (let column = 0; column + 1 < size; column += 1) {
      const a = row * size + column;
      const b = a + 1;
      const c = a + size + 1;
      const d = a + size;
      indices.push(a, b, c, a, c, d);
    }
  }
  const mesh = new Mesh('fjord-water', scene);
  const data = new VertexData();
  data.positions = new Float32Array(positions);
  data.indices = new Uint32Array(indices);
  data.colors = new Float32Array(colors);
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < normals.length; index += 3) normals[index + 1] = 1;
  data.normals = normals;
  data.applyToMesh(mesh, false);
  mesh.setVerticesData(SURFACE_ATTRIBUTE, new Float32Array(positions.length / 3).fill(surfaceId('water')), false, 1);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.position.y = WATER_LEVEL + 0.04;
  mesh.alwaysSelectAsActiveMesh = true;
  return mesh;
}

/** The turquoise gorge stream, rendered with the shared water material. */
export function buildStreamMesh(scene: Scene, material: Material): Mesh | null {
  const route = FJORD_MAP.routes.gorgeStream;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const points = route.points;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[Math.min(points.length - 1, index + 1)];
    const previous = points[Math.max(0, index - 1)];
    if (!point || !next || !previous) continue;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const side = { x: -dz / length, z: dx / length };
    const width = 2.6 + Math.sin(index * 0.7) * 0.6 + Math.min(4, Math.max(0, -point.x - 60) * 0.08);
    for (const sign of [-1, 0, 1]) {
      const x = point.x + side.x * width * sign;
      const z = point.z + side.z * width * sign;
      positions.push(x, point.y + (sign === 0 ? -0.05 : 0.02), z);
      const foam = sign === 0 ? 0.35 + (Math.sin(index * 1.9) * 0.5 + 0.5) * 0.4 : 0.95;
      colors.push(foam, 0.18, 0, sign === 0 ? 0.88 : 0.55);
    }
  }
  const rows = positions.length / 9;
  for (let row = 0; row + 1 < rows; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      const a = row * 3 + column;
      const b = a + 1;
      const c = a + 4;
      const d = a + 3;
      indices.push(a, c, b, a, d, c);
    }
  }
  if (indices.length === 0) return null;
  const mesh = new Mesh('gorge-stream', scene);
  const data = new VertexData();
  data.positions = new Float32Array(positions);
  data.colors = new Float32Array(colors);
  data.indices = new Uint32Array(indices);
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < normals.length; index += 3) normals[index + 1] = 1;
  data.normals = normals;
  data.applyToMesh(mesh, false);
  mesh.setVerticesData(SURFACE_ATTRIBUTE, new Float32Array(positions.length / 3).fill(surfaceId('water')), false, 1);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}
