/**
 * Splits the owner's static, fused Meshy vehicle GLBs into the moving parts
 * the game animates, in game space. Used by scripts/optimize-models.ts for
 * every `meshy-vehicle-<kind>.glb` before the usual texture/prune steps.
 *
 *   bun run scripts/vehicle-parts.ts --report art-src/meshy/meshy-vehicle-sidecar.glb
 *       prints the connected components and the resulting parts (no output file)
 *
 * What it does per vehicle (rules in VEHICLE_PART_SPECS):
 *   1. Re-orients and scales the mesh into game space: +Z forward, +X right,
 *      +Y up, metres, the ground contact at y = 0 and the hull centre at the
 *      origin. Meshy exports three of the four vehicles facing -X.
 *   2. Finds the connected components of the mesh (position-welded, Meshy
 *      splits vertices along UV seams) and assigns each one to a part with
 *      the vehicle's rules: hull, turret (yaws), barrel (pitches, child of
 *      the turret) and wheels (spin about their own axle).
 *   3. Writes one glTF node + mesh per part. A part's vertices are relative to
 *      its pivot (node translation), so the client only sets rotations.
 *
 * The glTF stays a normal right-handed file that faces +Z in any viewer;
 * Babylon's loader mirrors X on import (its __root__ node), so the game-space
 * coordinates are (-x, y, z) of the stored ones. The pivots and anchors
 * printed by --report are in game space and are what packages/shared
 * config/vehicles.ts uses for seats, muzzles and hit volumes.
 */
import { basename } from 'node:path';
import { readGlb, writeGlb, type GlbJson, type GlbParts } from '../apps/client/src/rendering/glb/glb-binary';

type V3 = [number, number, number];

interface Bounds {
  min: V3;
  max: V3;
}

interface Component {
  index: number;
  triangles: number[];
  bounds: Bounds;
  center: V3;
  size: V3;
}

export type PartRole = 'hull' | 'turret' | 'barrel' | 'wheel' | 'steer';

export interface PartRule {
  /** Part name written as the glTF node name (`ff-<name>`). */
  name: string;
  role: PartRole;
  /** Pivot in game space; wheels use their component centre when omitted. */
  pivot?: V3;
  /** Parent part (barrel → turret, front wheel → steer). */
  parent?: string;
  /** Component test in game space (first matching rule wins). */
  match: (component: Component) => boolean;
  /** One part per matching component (wheels). */
  perComponent?: boolean;
}

export interface VehiclePartSpec {
  /** Raw Meshy forward axis. */
  forward: '-x' | '+z';
  /** Metres per model unit. */
  scale: number;
  /** Game-space XZ point (after scaling) that becomes the origin. */
  center: [number, number];
  rules: PartRule[];
  /**
   * Tracked hulls: only the biggest N road wheels per side stay separate
   * spinning parts; the rest (barely visible inside the tracks) join the hull
   * to keep draw calls low.
   */
  spinningWheelsPerSide?: number;
}

const inBox = (c: Component, min: V3, max: V3): boolean =>
  c.center[0] >= min[0] && c.center[0] <= max[0] && c.center[1] >= min[1] && c.center[1] <= max[1] && c.center[2] >= min[2] && c.center[2] <= max[2];

/** A wheel-like component: round in the YZ plane, thin along X. */
const wheelLike = (c: Component, minDiameter: number, maxDiameter: number, maxWidth: number): boolean => {
  const diameter = (c.size[1] + c.size[2]) / 2;
  return (
    diameter >= minDiameter &&
    diameter <= maxDiameter &&
    Math.abs(c.size[1] - c.size[2]) < diameter * 0.1 &&
    c.size[0] <= maxWidth &&
    c.triangles.length >= 60
  );
};

const horizontal = (c: Component, x: number, z: number): number => Math.hypot(c.center[0] - x, c.center[2] - z);

/** Fondue pot axis (game space, metres). */
const CRAWLER_POT: V3 = [-0.014, 1.3, -0.288];
/** Coconut turret axis. */
const COCONUT_DOME: V3 = [-0.047, 1.22, -0.728];

/**
 * Part rules per vehicle (game space, after scaling and centring). The
 * numbers come from `--report` (component centres and sizes):
 *   crawler  4.6 m long: red pot turret on the deck, barrel forward over the
 *            cab, handle and spoon on the pot, 12 road wheels + 2 idlers.
 *   coconut  4.6 m long: coconut dome + bamboo barrel, big front wheels and
 *            small road wheels of the half-track.
 *   flamingo 3.5 m long: ring hull, the neck turns (turret), the harpoon gun
 *            clamped to it pitches (barrel). The ring well is the origin.
 *   sidecar  2.7 m long: bike on the right, tub on the left; four wheels spin,
 *            the fork + handlebar + front wheel steer.
 */
export const VEHICLE_PART_SPECS: Readonly<Record<string, VehiclePartSpec>> = {
  'vehicle-biplane': {
    forward: '-x', scale: 6.8, center: [0,0],
    rules: [{ name: 'propeller', role: 'steer', pivot: [-0.023,1.81,2.389],
      match: c => c.center[2]>2.25 && c.size[2]<0.3 && c.size[0]>1.5 && c.size[1]>0.8 }],
  },
  'vehicle-rowboat': {
    forward: '-x', scale: 3.6, center: [0, 0],
    rules: [
      { name: 'oar-left', role: 'steer', pivot: [-0.679, 0.628, 0.191], match: c => c.center[0] < -0.8 },
      { name: 'oar-right', role: 'steer', pivot: [0.727, 0.664, -0.047], match: c => c.center[0] > 0.8 },
    ],
  },
  'vehicle-fondue-crawler': {
    forward: '-x',
    scale: 4.9,
    center: [0, 0],
    spinningWheelsPerSide: 1,
    rules: [
      {
        name: 'barrel',
        role: 'barrel',
        parent: 'turret',
        pivot: [0.068, 1.822, 0.44],
        match: (c) => c.size[2] > 1.2 && c.center[1] > 1.6 && c.center[2] > 0.5,
      },
      {
        name: 'turret',
        role: 'turret',
        pivot: CRAWLER_POT,
        match: (c) =>
          (c.bounds.min[1] > 1.25 && horizontal(c, CRAWLER_POT[0], CRAWLER_POT[2]) < 1.0) ||
          (c.bounds.min[1] > 1.6 && horizontal(c, CRAWLER_POT[0], CRAWLER_POT[2]) < 1.9),
      },
      { name: 'wheel', role: 'wheel', perComponent: true, match: (c) => c.center[1] < 0.6 && wheelLike(c, 0.3, 0.7, 0.9) },
    ],
  },
  'vehicle-coconut-tank': {
    forward: '-x',
    scale: 4.8,
    center: [0, 0],
    spinningWheelsPerSide: 1,
    rules: [
      {
        name: 'barrel',
        role: 'barrel',
        parent: 'turret',
        pivot: [0, 2.43, -0.2],
        match: (c) => c.size[2] > 1.6 && c.size[0] < 0.5 && c.center[1] > 2.0,
      },
      {
        name: 'turret',
        role: 'turret',
        pivot: COCONUT_DOME,
        match: (c) => c.bounds.min[1] > 1.15 && horizontal(c, COCONUT_DOME[0], COCONUT_DOME[2]) < 0.75 && c.size[1] > 0.05,
      },
      { name: 'wheel', role: 'wheel', perComponent: true, match: (c) => c.center[1] < 0.55 && wheelLike(c, 0.3, 1.0, 0.5) },
    ],
  },
  'vehicle-flamingo-boat': {
    forward: '+z',
    scale: 3.7,
    center: [0, -0.262],
    rules: [
      {
        name: 'barrel',
        role: 'barrel',
        parent: 'turret',
        pivot: [0.3, 1.25, 1.0],
        match: (c) => c.center[0] > 0.2 && c.center[1] > 1.0 && c.center[2] > 0.9,
      },
      {
        name: 'turret',
        role: 'turret',
        pivot: [0.04, 0.5, 1.02],
        match: (c) => c.center[1] > 1.0 && c.center[2] > 0.8,
      },
    ],
  },
  'vehicle-sidecar': {
    forward: '-x',
    scale: 2.8,
    center: [0, 0],
    rules: [
      {
        name: 'front',
        role: 'wheel',
        parent: 'steer',
        perComponent: true,
        match: (c) => c.center[0] > 0.25 && c.center[2] > 0.8 && c.center[1] < 0.6 && wheelLike(c, 0.2, 0.9, 0.3),
      },
      {
        name: 'steer',
        role: 'steer',
        pivot: [0.5, 0.6, 0.62],
        match: (c) => c.center[0] > 0.25 && c.center[0] < 0.8 && c.center[2] > 0.3,
      },
      { name: 'wheel', role: 'wheel', perComponent: true, match: (c) => c.center[1] < 0.5 && wheelLike(c, 0.4, 0.9, 0.3) },
    ],
  },
};

function readFloats(json: GlbJson, bin: Uint8Array, accessorIndex: number): { values: Float32Array; components: number } {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.bufferView === undefined) throw new Error(`accessor ${accessorIndex} missing`);
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`bufferView ${accessor.bufferView} missing`);
  const components = accessor.type === 'VEC3' ? 3 : accessor.type === 'VEC2' ? 2 : accessor.type === 'VEC4' ? 4 : 1;
  const base = bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const data = new DataView(bin.buffer, base);
  const stride = view.byteStride ?? components * 4;
  if (accessor.componentType !== 5126) throw new Error(`accessor ${accessorIndex}: expected float data`);
  const values = new Float32Array(accessor.count * components);
  for (let element = 0; element < accessor.count; element += 1) {
    for (let component = 0; component < components; component += 1) {
      values[element * components + component] = data.getFloat32(element * stride + component * 4, true);
    }
  }
  return { values, components };
}

function readIndices(json: GlbJson, bin: Uint8Array, accessorIndex: number): Uint32Array {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.bufferView === undefined) throw new Error('index accessor missing');
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error('index bufferView missing');
  const base = bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const data = new DataView(bin.buffer, base);
  const out = new Uint32Array(accessor.count);
  for (let index = 0; index < accessor.count; index += 1) {
    out[index] =
      accessor.componentType === 5125
        ? data.getUint32(index * 4, true)
        : accessor.componentType === 5123
          ? data.getUint16(index * 2, true)
          : data.getUint8(index);
  }
  return out;
}

interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

function readMesh(parts: GlbParts): MeshData {
  const { json, bin } = parts;
  if (!bin) throw new Error('GLB has no binary chunk');
  const meshes = json.meshes as Array<{ primitives: Array<{ attributes: Record<string, number>; indices?: number }> }> | undefined;
  const primitive = meshes?.[0]?.primitives[0];
  if (!primitive || primitive.indices === undefined) throw new Error('expected one indexed primitive');
  const position = primitive.attributes.POSITION;
  const normal = primitive.attributes.NORMAL;
  const uv = primitive.attributes.TEXCOORD_0;
  if (position === undefined || normal === undefined || uv === undefined) throw new Error('expected POSITION, NORMAL, TEXCOORD_0');
  return {
    positions: readFloats(json, bin, position).values,
    normals: readFloats(json, bin, normal).values,
    uvs: readFloats(json, bin, uv).values,
    indices: readIndices(json, bin, primitive.indices),
  };
}

/** Raw Meshy axes → game space (+Z forward, +X right, +Y up), scaled. */
function toGame(spec: VehiclePartSpec, x: number, y: number, z: number): V3 {
  // Meshy -X-forward models: right-hand rule puts their right side at -Z.
  if (spec.forward === '-x') return [-z * spec.scale, y * spec.scale, -x * spec.scale];
  return [-x * spec.scale, y * spec.scale, z * spec.scale];
}

function transformMesh(spec: VehiclePartSpec, mesh: MeshData): MeshData {
  const count = mesh.positions.length / 3;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  let minY = Number.POSITIVE_INFINITY;
  for (let vertex = 0; vertex < count; vertex += 1) {
    const p = toGame(spec, mesh.positions[vertex * 3] ?? 0, mesh.positions[vertex * 3 + 1] ?? 0, mesh.positions[vertex * 3 + 2] ?? 0);
    positions.set(p, vertex * 3);
    minY = Math.min(minY, p[1]);
    const n = toGame({ ...spec, scale: 1 }, mesh.normals[vertex * 3] ?? 0, mesh.normals[vertex * 3 + 1] ?? 0, mesh.normals[vertex * 3 + 2] ?? 0);
    normals.set(n, vertex * 3);
  }
  for (let vertex = 0; vertex < count; vertex += 1) {
    positions[vertex * 3] = (positions[vertex * 3] ?? 0) - spec.center[0];
    positions[vertex * 3 + 1] = (positions[vertex * 3 + 1] ?? 0) - minY;
    positions[vertex * 3 + 2] = (positions[vertex * 3 + 2] ?? 0) - spec.center[1];
  }
  // toGame is a proper rotation for '-x' (no mirror) but a mirror for '+z';
  // a mirror flips the triangle winding, which is restored here.
  const indices = new Uint32Array(mesh.indices);
  if (spec.forward === '+z') {
    for (let index = 0; index + 2 < indices.length; index += 3) {
      const b = indices[index + 1] ?? 0;
      indices[index + 1] = indices[index + 2] ?? 0;
      indices[index + 2] = b;
    }
  }
  return { positions, normals, uvs: mesh.uvs, indices };
}

function findComponents(mesh: MeshData): Component[] {
  const count = mesh.positions.length / 3;
  const weld = new Map<string, number>();
  const welded = new Uint32Array(count);
  for (let vertex = 0; vertex < count; vertex += 1) {
    const key = `${Math.round((mesh.positions[vertex * 3] ?? 0) * 1e4)},${Math.round((mesh.positions[vertex * 3 + 1] ?? 0) * 1e4)},${Math.round((mesh.positions[vertex * 3 + 2] ?? 0) * 1e4)}`;
    let id = weld.get(key);
    if (id === undefined) {
      id = weld.size;
      weld.set(key, id);
    }
    welded[vertex] = id;
  }
  const parent = new Int32Array(weld.size).map((_, index) => index);
  const find = (value: number): number => {
    let root = value;
    while (parent[root] !== root) root = parent[root] ?? root;
    let cursor = value;
    while (parent[cursor] !== root) {
      const next = parent[cursor] ?? root;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const triangleCount = mesh.indices.length / 3;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = find(welded[mesh.indices[triangle * 3] ?? 0] ?? 0);
    const b = find(welded[mesh.indices[triangle * 3 + 1] ?? 0] ?? 0);
    const c = find(welded[mesh.indices[triangle * 3 + 2] ?? 0] ?? 0);
    if (a !== b) parent[b] = a;
    const rc = find(c);
    const ra = find(a);
    if (ra !== rc) parent[rc] = ra;
  }
  const byRoot = new Map<number, number[]>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const root = find(welded[mesh.indices[triangle * 3] ?? 0] ?? 0);
    const list = byRoot.get(root) ?? [];
    list.push(triangle);
    byRoot.set(root, list);
  }
  const components: Component[] = [];
  for (const triangles of byRoot.values()) {
    const min: V3 = [Infinity, Infinity, Infinity];
    const max: V3 = [-Infinity, -Infinity, -Infinity];
    for (const triangle of triangles) {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = mesh.indices[triangle * 3 + corner] ?? 0;
        for (let axis = 0; axis < 3; axis += 1) {
          const value = mesh.positions[vertex * 3 + axis] ?? 0;
          min[axis] = Math.min(min[axis] ?? value, value);
          max[axis] = Math.max(max[axis] ?? value, value);
        }
      }
    }
    components.push({
      index: components.length,
      triangles,
      bounds: { min, max },
      center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    });
  }
  components.sort((a, b) => b.triangles.length - a.triangles.length);
  components.forEach((component, index) => {
    component.index = index;
  });
  return components;
}

interface PartOut {
  name: string;
  role: PartRole;
  parent: string | null;
  pivot: V3;
  triangles: number[];
  bounds: Bounds;
}

function assignParts(spec: VehiclePartSpec, components: Component[]): PartOut[] {
  const parts = new Map<string, PartOut>();
  const hullRule: PartRule = { name: 'hull', role: 'hull', pivot: [0, 0, 0], match: () => true };
  const rules = [...spec.rules, hullRule];
  let wheelIndex = 0;
  for (const component of components) {
    const rule = rules.find((candidate) => candidate.match(component)) ?? hullRule;
    let name = rule.name;
    let pivot = rule.pivot ?? component.center;
    if (rule.perComponent) {
      // One part per axle end: tyre, rim, spokes and hub share a centre.
      const axle = [...parts.values()].find(
        (part) =>
          part.name.startsWith(rule.name) &&
          /\d+$/.test(part.name.slice(rule.name.length)) &&
          Math.hypot(part.pivot[1] - component.center[1], part.pivot[2] - component.center[2]) < 0.08 &&
          Math.abs(part.pivot[0] - component.center[0]) < 0.25,
      );
      if (axle) {
        name = axle.name;
        pivot = axle.pivot;
      } else {
        name = `${rule.name}${wheelIndex}`;
        wheelIndex += 1;
        pivot = component.center;
      }
    }
    let part = parts.get(name);
    if (!part) {
      part = {
        name,
        role: rule.role,
        parent: rule.parent ?? null,
        pivot: [...pivot],
        triangles: [],
        bounds: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
      };
      parts.set(name, part);
    }
    part.triangles.push(...component.triangles);
    for (let axis = 0; axis < 3; axis += 1) {
      part.bounds.min[axis] = Math.min(part.bounds.min[axis] ?? 0, component.bounds.min[axis] ?? 0);
      part.bounds.max[axis] = Math.max(part.bounds.max[axis] ?? 0, component.bounds.max[axis] ?? 0);
    }
  }
  const axleRadius = (wheel: PartOut, all: PartOut[]): number => {
    let radius = 0;
    for (const other of all) {
      if (Math.hypot(other.pivot[1] - wheel.pivot[1], other.pivot[2] - wheel.pivot[2]) > 0.08) continue;
      radius = Math.max(radius, ((other.bounds.max[1] - other.bounds.min[1]) + (other.bounds.max[2] - other.bounds.min[2])) / 4);
    }
    return radius;
  };
  const keep = spec.spinningWheelsPerSide;
  if (keep !== undefined) {
    const hull = parts.get('hull');
    const all = [...parts.values()].filter((part) => part.role === 'wheel');
    for (const side of [-1, 1]) {
      const sideWheels = all
        .filter((part) => !part.parent && Math.sign(part.pivot[0]) === side)
        .sort((a, b) => axleRadius(b, all) - axleRadius(a, all) || a.pivot[2] - b.pivot[2]);
      for (const extra of sideWheels.slice(keep)) {
        if (!hull) break;
        hull.triangles.push(...extra.triangles);
        for (let axis = 0; axis < 3; axis += 1) {
          hull.bounds.min[axis] = Math.min(hull.bounds.min[axis] ?? 0, extra.bounds.min[axis] ?? 0);
          hull.bounds.max[axis] = Math.max(hull.bounds.max[axis] ?? 0, extra.bounds.max[axis] ?? 0);
        }
        parts.delete(extra.name);
      }
    }
  }
  // Wheels spin by the radius of their axle: hubs and spokes are separate
  // components on the same axle as the tyre, so they share its radius. The
  // radius travels in the node name (`wheel3-r27` = 27 cm).
  const wheels = [...parts.values()].filter((part) => part.role === 'wheel');
  for (const wheel of wheels) {
    let radius = 0;
    for (const other of wheels) {
      if (Math.hypot(other.pivot[1] - wheel.pivot[1], other.pivot[2] - wheel.pivot[2]) > 0.08) continue;
      radius = Math.max(radius, ((other.bounds.max[1] - other.bounds.min[1]) + (other.bounds.max[2] - other.bounds.min[2])) / 4);
    }
    wheel.name = `${wheel.name}-r${Math.max(1, Math.round(radius * 100))}`;
  }
  // Parents first so node indices can reference them.
  const ordered = [...parts.values()].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0));
  return ordered;
}

function fmt(v: readonly number[]): string {
  return `(${v.map((value) => value.toFixed(3)).join(', ')})`;
}

/**
 * Rebuilds the GLB with one node + mesh per part. The material, textures,
 * samplers and images are kept as they are (later pipeline steps re-encode
 * them); the old mesh data is dropped.
 */
function writeParts(source: GlbParts, mesh: MeshData, partList: PartOut[]): GlbParts {
  const json = source.json as GlbJson & {
    meshes?: Array<{ primitives: Array<{ material?: number }> }>;
    images?: Array<{ bufferView?: number; mimeType?: string; name?: string }>;
    nodes?: unknown[];
    scenes?: unknown[];
    scene?: number;
  };
  const bin = source.bin;
  if (!bin) throw new Error('GLB has no binary chunk');
  const material = json.meshes?.[0]?.primitives[0]?.material ?? 0;
  const chunks: Uint8Array[] = [];
  let length = 0;
  const bufferViews: Array<{ buffer: 0; byteOffset: number; byteLength: number; target?: number }> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const pushView = (bytes: Uint8Array, target?: number): number => {
    const padding = (4 - (length % 4)) % 4;
    if (padding) {
      chunks.push(new Uint8Array(padding));
      length += padding;
    }
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    length += bytes.byteLength;
    return bufferViews.length - 1;
  };
  // Images first (copied verbatim).
  const images = (json.images ?? []).map((image) => {
    if (image.bufferView === undefined) return image;
    const view = json.bufferViews?.[image.bufferView];
    if (!view) return image;
    const offset = view.byteOffset ?? 0;
    const index = pushView(bin.slice(offset, offset + view.byteLength));
    return { ...image, bufferView: index };
  });

  const pivotOf = new Map(partList.map((part) => [part.name, part.pivot] as const));
  const nodes: Array<Record<string, unknown>> = [{ name: 'ff-vehicle', children: [] as number[] }];
  const nodeIndex = new Map<string, number>();
  const meshes: Array<Record<string, unknown>> = [];
  for (const part of partList) {
    const remap = new Map<number, number>();
    const local: number[] = [];
    for (const triangle of part.triangles) {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = mesh.indices[triangle * 3 + corner] ?? 0;
        let mapped = remap.get(vertex);
        if (mapped === undefined) {
          mapped = remap.size;
          remap.set(vertex, mapped);
        }
        local.push(mapped);
      }
    }
    const count = remap.size;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const min: V3 = [Infinity, Infinity, Infinity];
    const max: V3 = [-Infinity, -Infinity, -Infinity];
    for (const [vertex, mapped] of remap) {
      // Stored glTF coordinates are the game coordinates with X mirrored.
      const gx = (mesh.positions[vertex * 3] ?? 0) - part.pivot[0];
      const gy = (mesh.positions[vertex * 3 + 1] ?? 0) - part.pivot[1];
      const gz = (mesh.positions[vertex * 3 + 2] ?? 0) - part.pivot[2];
      const stored: V3 = [-gx, gy, gz];
      positions.set(stored, mapped * 3);
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis] ?? 0, stored[axis] ?? 0);
        max[axis] = Math.max(max[axis] ?? 0, stored[axis] ?? 0);
      }
      normals.set([-(mesh.normals[vertex * 3] ?? 0), mesh.normals[vertex * 3 + 1] ?? 0, mesh.normals[vertex * 3 + 2] ?? 0], mapped * 3);
      uvs.set([mesh.uvs[vertex * 2] ?? 0, mesh.uvs[vertex * 2 + 1] ?? 0], mapped * 2);
    }
    // Mirroring X flips the winding once more.
    const indices = new Uint32Array(local.length);
    for (let index = 0; index + 2 < local.length; index += 3) {
      indices[index] = local[index] ?? 0;
      indices[index + 1] = local[index + 2] ?? 0;
      indices[index + 2] = local[index + 1] ?? 0;
    }
    const positionView = pushView(new Uint8Array(positions.buffer), 34962);
    const normalView = pushView(new Uint8Array(normals.buffer), 34962);
    const uvView = pushView(new Uint8Array(uvs.buffer), 34962);
    const indexView = pushView(new Uint8Array(indices.buffer), 34963);
    const base = accessors.length;
    accessors.push({ bufferView: positionView, componentType: 5126, count, type: 'VEC3', min, max });
    accessors.push({ bufferView: normalView, componentType: 5126, count, type: 'VEC3' });
    accessors.push({ bufferView: uvView, componentType: 5126, count, type: 'VEC2' });
    accessors.push({ bufferView: indexView, componentType: 5125, count: indices.length, type: 'SCALAR' });
    meshes.push({
      name: `ff-${part.name}`,
      primitives: [{ attributes: { POSITION: base, NORMAL: base + 1, TEXCOORD_0: base + 2 }, indices: base + 3, material }],
    });
    const parentPivot: V3 = part.parent ? pivotOf.get(part.parent) ?? [0, 0, 0] : [0, 0, 0];
    const translation: V3 = [
      -(part.pivot[0] - parentPivot[0]),
      part.pivot[1] - parentPivot[1],
      part.pivot[2] - parentPivot[2],
    ];
    nodes.push({ name: `ff-${part.name}`, mesh: meshes.length - 1, translation });
    nodeIndex.set(part.name, nodes.length - 1);
  }
  for (const part of partList) {
    const index = nodeIndex.get(part.name);
    if (index === undefined) continue;
    const parentIndex = part.parent ? nodeIndex.get(part.parent) : 0;
    const parentNode = nodes[parentIndex ?? 0];
    if (!parentNode) continue;
    const children = (parentNode.children as number[] | undefined) ?? [];
    children.push(index);
    parentNode.children = children;
  }
  const packed = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    packed.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  const out = {
    ...json,
    images,
    bufferViews,
    accessors,
    meshes,
    nodes,
    scenes: [{ nodes: [0] }],
    scene: 0,
    buffers: [{ byteLength: length }],
  };
  return { json: out as GlbJson, bin: packed };
}

export interface VehicleSplitReport {
  key: string;
  parts: Array<{ name: string; role: PartRole; parent: string | null; pivot: V3; triangles: number; min: V3; max: V3 }>;
}

/** Splits a raw Meshy vehicle GLB (see the file header). */
export function splitVehicle(key: string, source: GlbParts): { parts: GlbParts; report: VehicleSplitReport } {
  const spec = VEHICLE_PART_SPECS[key];
  if (!spec) throw new Error(`${key}: no part spec`);
  const mesh = transformMesh(spec, readMesh(source));
  const components = findComponents(mesh);
  const partList = assignParts(spec, components);
  return {
    parts: writeParts(source, mesh, partList),
    report: {
      key,
      parts: partList.map((part) => ({
        name: part.name,
        role: part.role,
        parent: part.parent,
        pivot: part.pivot,
        triangles: part.triangles.length,
        min: part.bounds.min,
        max: part.bounds.max,
      })),
    },
  };
}

function printComponents(key: string, source: GlbParts, limit: number): void {
  const spec = VEHICLE_PART_SPECS[key];
  if (!spec) throw new Error(`${key}: no part spec`);
  const mesh = transformMesh(spec, readMesh(source));
  const components = findComponents(mesh);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const component of components) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis] ?? 0, component.bounds.min[axis] ?? 0);
      max[axis] = Math.max(max[axis] ?? 0, component.bounds.max[axis] ?? 0);
    }
  }
  console.log(`${key}: ${components.length} components, bounds ${fmt(min)} .. ${fmt(max)}`);
  const parts = assignParts(spec, components);
  for (const component of components.slice(0, limit)) {
    const rule = parts.find((part) => component.triangles.every((triangle) => part.triangles.includes(triangle)));
    console.log(
      `  #${component.index.toString().padStart(3)} tris ${component.triangles.length.toString().padStart(5)} centre ${fmt(component.center)} size ${fmt(component.size)} -> ${rule?.name ?? '?'}`,
    );
  }
  for (const part of parts) {
    console.log(`  part ${part.name.padEnd(10)} ${part.role.padEnd(6)} parent ${String(part.parent).padEnd(7)} pivot ${fmt(part.pivot)} tris ${part.triangles.length} bounds ${fmt(part.bounds.min)} .. ${fmt(part.bounds.max)}`);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const report = args.includes('--report');
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 60;
  const outArg = args.find((arg) => arg.startsWith('--out='));
  for (const file of args.filter((arg) => !arg.startsWith('--'))) {
    const match = /^meshy-(vehicle-[a-z0-9-]+)\.glb$/.exec(basename(file));
    if (!match?.[1]) throw new Error(`${file}: expected meshy-vehicle-<kind>.glb`);
    const source = readGlb(new Uint8Array(await Bun.file(file).arrayBuffer()));
    if (report) printComponents(match[1], source, limit);
    if (outArg) {
      const { parts } = splitVehicle(match[1], source);
      await Bun.write(outArg.slice('--out='.length), writeGlb(parts));
      console.log(`wrote ${outArg.slice('--out='.length)}`);
    }
  }
}
