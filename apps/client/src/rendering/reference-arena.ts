/** Compact, physical PHOTO arena. All terrain/solid routes come from shared data. */
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { ARENA_ANCHORS, ARENA_REAR_CHALET, ARENA_CABLE, ARENA_CHALET, ARENA_GRID, ARENA_NATURE, ARENA_FENCE, ARENA_HANDRAILS, ARENA_SOLID_PROPS, ARENA_STATION_PROPS, REFERENCE_MARKERS, REFERENCE_TOWERS, arenaHeightAt, } from '@frost-and-flamingos/shared';
import type { MapVisuals, TowerVisual } from './map';
import { createSkyMaterial, createToonMaterial, createWaterMaterial, TERRAIN_MIX_A_ATTRIBUTE, TERRAIN_MIX_B_ATTRIBUTE } from './materials';
import { Affine, GeometryBatch, mix, type RGB } from './map/geometry';
import { P } from './map/palette';
import { SURFACE_ATTRIBUTE, surfaceId } from './map/surfaces';
import { TERRAIN_BARE_COLOR_ATTRIBUTE, TERRAIN_SNOW_BIAS_ATTRIBUTE } from './map/terrain-mesh';
import { drawBuilding } from './map/buildings';
import { drawBuildingExtras, BRAKE_LEVER_HINGE, drawBrakeLeverBase, drawBrakeLeverHandle } from './map/extras';
import { drawRouteCable } from './map/landmarks';
import { drawClosedStairs } from './map/stairs';
import { buildSolidNature } from './map/solid-nature';
import { buildReferenceWorld } from './reference-world';
import { buildReferenceAlps } from './reference-alps';
export function buildReferenceTerrain(scene: Scene): Mesh {
  const { size, segments, heights } = ARENA_GRID, n = segments + 1, count = n * n, cell = size / segments;
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 4);
  const surfaces = new Float32Array(count), bias = new Float32Array(count), a = new Float32Array(count * 4), b = new Float32Array(count * 4);
  const h = (col: number, row: number) => heights[Math.max(0, Math.min(n - 1, col)) * n + Math.max(0, Math.min(n - 1, row))]!;
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++) {
      const i = row * n + col, x = col * cell - size / 2, z = row * cell - size / 2, y = h(col, row);
      positions.set([x, y, z], i * 3);
      const nx = h(col - 1, row) - h(col + 1, row), nz = h(col, row - 1) - h(col, row + 1), length = Math.hypot(nx, cell * 2, nz);
      normals.set([nx / length, cell * 2 / length, nz / length], i * 3);
      const slope = Math.acos(cell * 2 / length), cliff = Math.min(1, Math.max(0, (slope - .66) / .6));
      const beach = x > 33 && y < 5, grass = beach && z > 22;
      const snow = beach || y < 1 ? 0 : 1 - cliff;
      const rock = 1 - snow - (beach || y < 1 ? 1 : 0);
      const strata = Math.sin(y * .23 + Math.sin(x * .09 + z * .08)) * .5 + .5;
      let color: RGB = mix(mix(P.rockShade, P.rockLight, .3 + strata * .55), P.snow, snow);
      if(snow>.5) {
        const hollow=Math.max(0,Math.min(.55,(h(col-1,row)+h(col+1,row)+h(col,row-1)+h(col,row+1)-4*y)/(cell*cell)*.9));
        color=mix(color,P.snowShade,hollow*snow);
      }
      if (beach || y < 1)
        color = grass ? mix(P.grass, P.grassLight, .4) : mix(P.sand, P.wetSand, y < 0 ? .6 : .1);
      colors.set([...color, 1], i * 4);
      surfaces[i] = surfaceId(snow > .5 ? 'snow' : beach ? (grass ? 'grass' : 'sand') : 'rock');
      a.set([snow, beach || y < 1 ? (grass ? 0 : 1) : 0, grass ? 1 : 0, rock], i * 4);
      bias[i] = 0;
    }
  const indices = new Uint32Array(segments * segments * 6);
  let cursor = 0;
  for (let row = 0; row < segments; row++)
    for (let col = 0; col < segments; col++) {
      const i = row * n + col;
      indices.set([i, i + 1, i + n, i + 1, i + n + 1, i + n], cursor);
      cursor += 6;
    }
  const mesh = new Mesh('reference-terrain', scene), data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(mesh, false);
  mesh.setVerticesData(SURFACE_ATTRIBUTE, surfaces, false, 1);
  mesh.setVerticesData(TERRAIN_BARE_COLOR_ATTRIBUTE, colors, false, 4);
  mesh.setVerticesData(TERRAIN_SNOW_BIAS_ATTRIBUTE, bias, false, 1);
  mesh.setVerticesData(TERRAIN_MIX_A_ATTRIBUTE, a, false, 4);
  mesh.setVerticesData(TERRAIN_MIX_B_ATTRIBUTE, b, false, 4);
  mesh.material = createToonMaterial(scene, 'reference-terrain-material', { terrain: true });
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.freezeWorldMatrix();
  return mesh;
}
/** This reference world is solid Alpine terrain. Keep the shared look hook,
 * without the old 18,225-vertex sea or a water shader draw behind the snow. */
function buildSea(scene:Scene,material:ShaderMaterial):Mesh {
  const water=new Mesh('reference-no-water',scene);water.material=material;water.setEnabled(false);water.isPickable=false;
  return water;
}
export function buildReferenceArena(scene: Scene, material: ShaderMaterial): MapVisuals {
  const terrain = buildReferenceTerrain(scene), waterMaterial = createWaterMaterial(scene, 'water-material'), water = buildSea(scene, waterMaterial);
  const skyMaterial = createSkyMaterial(scene, 'sky-material'), sky = CreateSphere('reference-sky', { diameter: 3200, segments: 32, sideOrientation: Mesh.BACKSIDE }, scene);
  sky.material = skyMaterial;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.alwaysSelectAsActiveMesh = true;
  const staticMeshes: Mesh[] = [], destructibleMeshes: MapVisuals['destructibleMeshes'] = new Map(), brakeLevers = new Map<string, Mesh>();
  const add = (batch: GeometryBatch, name: string) => {
    const mesh = batch.toMesh(scene, name, material);
    if (mesh)
      staticMeshes.push(mesh);
    return mesh;
  };
  const house = new GeometryBatch();
  house.jitter = 0;
  house.at(ARENA_CHALET.position.x, ARENA_CHALET.position.y, ARENA_CHALET.position.z, ARENA_CHALET.rotationY, () => {
    drawBuilding(house, ARENA_CHALET.building!, { variant: ARENA_CHALET.variant, seed: 43, snowy: true, facade: false });
    drawBuildingExtras(house, ARENA_CHALET, false);
  });
  const houseMesh = house.toMesh(scene, 'reference-chalet', material);
  if (houseMesh)
    destructibleMeshes.set(ARENA_CHALET.destructibleId!, houseMesh);
  const routes = new GeometryBatch();
  routes.jitter = 0;
  for (const prop of ARENA_SOLID_PROPS.filter(p => p.kind === 'stairs')) {
    if (prop.path) {
      const a = prop.path[0]!, b = prop.path[1]!;
      drawClosedStairs(routes, a.y < b.y ? a : b, a.y < b.y ? b : a, 3);
    }
    else if (prop.dimensions) {
      const d = prop.dimensions;
      routes.box(prop.position.x, prop.position.y + d.y / 2, prop.position.z, d.x, d.y, d.z, P.cobble, 'stone', .025);
    }
  }
  for (const rail of ARENA_HANDRAILS) {
    const path = rail.path!, a = path[0]!, b = path[path.length - 1]!;
    routes.log([a.x, a.y + 1.05, a.z], [b.x, b.y + 1.05, b.z], .065, P.logDark, 'wood', { segments: 8 });
    for (const p of path)
      routes.log([p.x, p.y - .2, p.z], [p.x, p.y + 1.1, p.z], .085, P.log, 'wood', { segments: 8 });
  }
  drawRouteCable(routes, ARENA_CABLE.cable, .04, P.ink, 0, 2.2);
  drawRouteCable(routes, ARENA_CABLE.cable, .04, P.ink, 0, -2.2);
  // Station columns and overhead drive frames leave the complete cabin lanes open.
  for (const prop of ARENA_STATION_PROPS) {
    routes.at(prop.position.x, prop.position.y, prop.position.z, prop.rotationY, () => {
      routes.box(0, -.18, 0, 10, .36, 6, P.plank, 'wood', .03);
      for (const side of [-1, 1])
        for (const end of [-1, 1]) {
          routes.log([side * 4.6, 0, end * 2.5], [side * 4.6, 5.2, end * 2.5], .14, P.logDark, 'wood', { segments: 12 });
          routes.box(0, 5.25, end * 2.5, 9.5, .25, .3, P.logDark, 'wood', .04);
        }
      for (const side of [-1, 1])
        routes.box(side * 2.2, 4.12, 0, .16, .3, 5.8, P.metalDark, 'metal', .03);
      // Each roof half is convex: the batch triangulator uses a triangle fan.
      routes.extrude([[-5.25,5.45],[0,6.7],[0,6.45],[-5.15,5.2]],6.7,P.snow,'snow');
      routes.extrude([[0,6.7],[5.25,5.45],[5.15,5.2],[0,6.45]],6.7,P.snow,'snow');
      for(const end of [-1,1])for(const side of [-1,1]){
        routes.log([side*5.15,5.25,end*3.35],[0,6.5,end*3.35],.09,P.logDark,'wood',{segments:8});
        routes.log([side*4.6,3.9,end*2.5],[side*3.8,5.2,end*2.5],.09,P.log,'wood',{segments:8});
      }
    });
    const station = ARENA_CABLE.stations.find(s => `arena_station_${s.id}` === prop.id)!;
    routes.at(station.brakeBase.x, station.platform.y, station.brakeBase.z, prop.rotationY, () => drawBrakeLeverBase(routes));
    const handle = new GeometryBatch();
    handle.jitter = 0;
    drawBrakeLeverHandle(handle);
    const mesh = add(handle, `cable-brake-lever-${station.id}`);
    if (mesh) {
      mesh.unfreezeWorldMatrix();
      mesh.position.set(station.brakeBase.x, station.platform.y + BRAKE_LEVER_HINGE, station.brakeBase.z);
      mesh.rotation.y = prop.rotationY;
      mesh.freezeWorldMatrix();
      brakeLevers.set(station.id, mesh);
    }
  }
  const fence = ARENA_FENCE.path!;
  for (let i = 0; i < fence.length; i++) {
    const a = fence[i]!;
    routes.log([a.x, a.y - .12, a.z], [a.x, a.y + 1.22, a.z], .105, P.logDark, 'wood', { segments: 12 });
    if (i < fence.length - 1) {
      const b = fence[i + 1]!;
      for (const h of [.45, 1.08])
        routes.log([a.x, a.y + h, a.z], [b.x, b.y + h, b.z], .08, P.plank, 'wood', { segments: 8 });
    }
  }
  add(routes, 'reference-solid-routes');
  const village=new GeometryBatch();village.jitter=0;
  const rear=ARENA_REAR_CHALET;
  village.at(rear.position.x,rear.position.y,rear.position.z,rear.rotationY,()=>{drawBuilding(village,rear.building!,{variant:rear.variant,seed:64,snowy:true,facade:false});drawBuildingExtras(village,rear,false)});
  add(village,'reference-rear-chalet');
  const nature = buildSolidNature(scene, material, ARENA_NATURE);
  staticMeshes.push(...nature.meshes);
  staticMeshes.push(...buildReferenceWorld(scene, material));
  staticMeshes.push(buildReferenceAlps(scene, material));
  const towers = new Map<(typeof REFERENCE_TOWERS)[number]['id'], TowerVisual>();
  for (const tower of REFERENCE_TOWERS) {
    const at = REFERENCE_MARKERS.find(p => p.id === `reference_${tower.id}`)!.position;
    const root = new TransformNode(`${tower.id}-root`, scene);
    root.position.set(at.x, at.y, at.z);
    towers.set(tower.id, { id: tower.id, root, mesh: null, dressing: { alpine: null, lagoon: null }, pads: { alpine: null, lagoon: null, neutral: null }, attach: new Map() });
  }
  const x = ARENA_ANCHORS.preview.x, z = ARENA_ANCHORS.preview.z, y = arenaHeightAt(x, z);
  const stage = new GeometryBatch();
  stage.with(Affine.translation(x, y, z), () => {
    stage.cylinder(2.6, 2.5, .2, 32, P.logDark, 'wood');
    stage.cylinder(2.3, 2.3, .08, 32, P.teal, 'cloth', { y: .2 });
  });
  const previewStageMesh = add(stage, 'preview-stage');
  return { waterMaterial, skyMaterial, waterMesh: water, skyMesh: sky, terrainMesh: terrain, previewStage: { position: { x, y: y + .28, z }, radius: 2.5 }, previewStageMesh,
    destructibleMeshes, destructibleSprites: new Map(), towers, staticMeshes, brakeLevers,
    vertexCount: terrain.getTotalVertices() + water.getTotalVertices() + staticMeshes.reduce((sum, m) => sum + m.getTotalVertices(), 0) + (houseMesh?.getTotalVertices() ?? 0) };
}
