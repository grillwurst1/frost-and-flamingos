/**
 * Optimises the owner's Meshy mascot models for the game client.
 *
 *   bun run scripts/optimize-mascots.ts
 *
 * Input:  art-src/meshy/meshy-cow.glb      (Meshy "Quadruped Dog" rig, walk clip)
 *         art-src/meshy/meshy-coconut.glb  (static textured husk)
 * Output: apps/client/public/models/mascots/{cow,coconut}.glb + manifest.json.
 *         The client only requests files the manifest lists, so a missing
 *         model never causes a 404 (the procedural mascot is the fallback).
 *
 * Cow:     the bell and both ears are re-skinned onto three new joints
 *          (`bell`, `ear_L`, `ear_R`, children of `head`) so the gait layer can
 *          swing the bell as a pendulum and flick the ears. The bell is found
 *          as the small mesh islands hanging in front of the chest, the ears
 *          as head-skinned vertices beyond the skull in a frame turned with the
 *          head (Meshy left the head turned ~15° at rest; that yaw is measured
 *          from the muzzle and written to the manifest so the client can
 *          straighten it). Base colour stays 2048² (re-encoded JPEG q92).
 * Coconut: metallic-roughness and emissive maps are dropped; base colour and
 *          normal map stay 2048² JPEG q92.
 * Texture work runs through the pinned glTF Transform CLI via `bunx`.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const SOURCE_DIR = join(ROOT, 'art-src', 'meshy');
const OUTPUT_DIR = join(ROOT, 'apps', 'client', 'public', 'models', 'mascots');
const CLI = '@gltf-transform/cli@4.5.1';
const JPEG_QUALITY = 92;

type Json = Record<string, unknown>;
interface GlbParts {
  json: Json;
  bin: Uint8Array;
}

function readGlb(bytes: Uint8Array): GlbParts {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file');
  let offset = 12;
  let json: Json | null = null;
  let bin: Uint8Array | null = null;
  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)) as Json;
    if (type === 0x004e4942) bin = chunk.slice();
    offset += 8 + length;
  }
  if (!json || !bin) throw new Error('GLB needs a JSON and a BIN chunk');
  return { json, bin };
}

function writeGlb(parts: GlbParts): Uint8Array {
  const encoder = new TextEncoder();
  let jsonBytes = encoder.encode(JSON.stringify(parts.json));
  const jsonPadding = (4 - (jsonBytes.byteLength % 4)) % 4;
  if (jsonPadding) {
    const padded = new Uint8Array(jsonBytes.byteLength + jsonPadding).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }
  const bin = parts.bin;
  const binPadding = (4 - (bin.byteLength % 4)) % 4;
  const binLength = bin.byteLength + binPadding;
  const total = 12 + 8 + jsonBytes.byteLength + 8 + binLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const binOffset = 20 + jsonBytes.byteLength;
  view.setUint32(binOffset, binLength, true);
  view.setUint32(binOffset + 4, 0x004e4942, true);
  out.set(bin, binOffset + 8);
  return out;
}

// --- glTF accessors ------------------------------------------------------------

interface Accessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  normalized?: boolean;
}
interface BufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function list<T>(json: Json, key: string): T[] {
  const value = json[key];
  if (!Array.isArray(value)) throw new Error(`glTF has no ${key}`);
  return value as T[];
}

/** Typed view of an accessor (tightly packed views only, as Meshy/Blender write them). */
function accessorView(parts: GlbParts, index: number): Float32Array | Uint8Array | Uint16Array | Uint32Array {
  const accessor = list<Accessor>(parts.json, 'accessors')[index];
  if (!accessor) throw new Error(`accessor ${index} missing`);
  const view = list<BufferView>(parts.json, 'bufferViews')[accessor.bufferView];
  if (!view) throw new Error('bufferView missing');
  if (view.byteStride && view.byteStride !== 0) {
    const size = { 5126: 4, 5123: 2, 5121: 1, 5125: 4 }[accessor.componentType] ?? 4;
    if (view.byteStride !== size * (COMPONENTS[accessor.type] ?? 1)) throw new Error('interleaved accessors are not supported');
  }
  const offset = parts.bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const length = accessor.count * (COMPONENTS[accessor.type] ?? 1);
  switch (accessor.componentType) {
    case 5126:
      return new Float32Array(parts.bin.buffer, offset, length);
    case 5121:
      return new Uint8Array(parts.bin.buffer, offset, length);
    case 5123:
      return new Uint16Array(parts.bin.buffer, offset, length);
    case 5125:
      return new Uint32Array(parts.bin.buffer, offset, length);
    default:
      throw new Error(`component type ${accessor.componentType} not supported`);
  }
}

/** Appends raw bytes as a new bufferView + accessor; returns the accessor index. */
function appendAccessor(parts: GlbParts, data: Float32Array, type: string, count: number): number {
  const padding = (4 - (parts.bin.byteLength % 4)) % 4;
  const offset = parts.bin.byteLength + padding;
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const merged = new Uint8Array(offset + bytes.byteLength);
  merged.set(parts.bin);
  merged.set(bytes, offset);
  parts.bin = merged;
  const views = list<BufferView>(parts.json, 'bufferViews');
  views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
  const accessors = list<Accessor>(parts.json, 'accessors');
  accessors.push({ bufferView: views.length - 1, componentType: 5126, count, type });
  const buffers = list<{ byteLength: number }>(parts.json, 'buffers');
  if (buffers[0]) buffers[0].byteLength = parts.bin.byteLength;
  return accessors.length - 1;
}

// --- column-major 4x4 maths (glTF convention) -----------------------------------

type Mat4 = Float64Array;

function identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

function compose(t: number[], r: number[], s: number[]): Mat4 {
  const [x = 0, y = 0, z = 0, w = 1] = r;
  const [sx = 1, sy = 1, sz = 1] = s;
  const m = identity();
  m[0] = (1 - 2 * (y * y + z * z)) * sx;
  m[1] = 2 * (x * y + z * w) * sx;
  m[2] = 2 * (x * z - y * w) * sx;
  m[4] = 2 * (x * y - z * w) * sy;
  m[5] = (1 - 2 * (x * x + z * z)) * sy;
  m[6] = 2 * (y * z + x * w) * sy;
  m[8] = 2 * (x * z + y * w) * sz;
  m[9] = 2 * (y * z - x * w) * sz;
  m[10] = (1 - 2 * (x * x + y * y)) * sz;
  m[12] = t[0] ?? 0;
  m[13] = t[1] ?? 0;
  m[14] = t[2] ?? 0;
  return m;
}

function invert(m: Mat4): Mat4 {
  // Gauss-Jordan on a copy (4x4, small and rare).
  const a = Array.from({ length: 4 }, (_, row) => Array.from({ length: 8 }, (_, column) =>
    column < 4 ? (m[column * 4 + row] ?? 0) : column - 4 === row ? 1 : 0,
  ));
  for (let column = 0; column < 4; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 4; row += 1) {
      if (Math.abs(a[row]?.[column] ?? 0) > Math.abs(a[pivot]?.[column] ?? 0)) pivot = row;
    }
    const swap = a[column] as number[];
    a[column] = a[pivot] as number[];
    a[pivot] = swap;
    const lead = (a[column] as number[])[column] ?? 1;
    for (let k = 0; k < 8; k += 1) (a[column] as number[])[k] = ((a[column] as number[])[k] ?? 0) / lead;
    for (let row = 0; row < 4; row += 1) {
      if (row === column) continue;
      const factor = (a[row] as number[])[column] ?? 0;
      for (let k = 0; k < 8; k += 1) {
        (a[row] as number[])[k] = ((a[row] as number[])[k] ?? 0) - factor * ((a[column] as number[])[k] ?? 0);
      }
    }
  }
  const out = new Float64Array(16);
  for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) out[column * 4 + row] = (a[row] as number[])[column + 4] ?? 0;
  return out;
}

/** Translation, rotation quaternion and scale of an affine matrix without shear. */
function decompose(m: Mat4): { t: number[]; r: number[]; s: number[] } {
  const sx = Math.hypot(m[0] ?? 0, m[1] ?? 0, m[2] ?? 0);
  const sy = Math.hypot(m[4] ?? 0, m[5] ?? 0, m[6] ?? 0);
  let sz = Math.hypot(m[8] ?? 0, m[9] ?? 0, m[10] ?? 0);
  const det =
    (m[0] ?? 0) * ((m[5] ?? 0) * (m[10] ?? 0) - (m[9] ?? 0) * (m[6] ?? 0)) -
    (m[4] ?? 0) * ((m[1] ?? 0) * (m[10] ?? 0) - (m[9] ?? 0) * (m[2] ?? 0)) +
    (m[8] ?? 0) * ((m[1] ?? 0) * (m[6] ?? 0) - (m[5] ?? 0) * (m[2] ?? 0));
  if (det < 0) sz = -sz;
  const r00 = (m[0] ?? 0) / sx, r10 = (m[1] ?? 0) / sx, r20 = (m[2] ?? 0) / sx;
  const r01 = (m[4] ?? 0) / sy, r11 = (m[5] ?? 0) / sy, r21 = (m[6] ?? 0) / sy;
  const r02 = (m[8] ?? 0) / sz, r12 = (m[9] ?? 0) / sz, r22 = (m[10] ?? 0) / sz;
  const trace = r00 + r11 + r22;
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    x = (r21 - r12) / s;
    y = (r02 - r20) / s;
    z = (r10 - r01) / s;
  } else if (r00 > r11 && r00 > r22) {
    const s = Math.sqrt(1 + r00 - r11 - r22) * 2;
    w = (r21 - r12) / s;
    x = 0.25 * s;
    y = (r01 + r10) / s;
    z = (r02 + r20) / s;
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2;
    w = (r02 - r20) / s;
    x = (r01 + r10) / s;
    y = 0.25 * s;
    z = (r12 + r21) / s;
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
    w = (r10 - r01) / s;
    x = (r02 + r20) / s;
    y = (r12 + r21) / s;
    z = 0.25 * s;
  }
  return { t: [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0], r: [x, y, z, w], s: [sx, sy, sz] };
}

function transformPoint(m: Mat4, p: [number, number, number]): [number, number, number] {
  return [
    (m[0] ?? 0) * p[0] + (m[4] ?? 0) * p[1] + (m[8] ?? 0) * p[2] + (m[12] ?? 0),
    (m[1] ?? 0) * p[0] + (m[5] ?? 0) * p[1] + (m[9] ?? 0) * p[2] + (m[13] ?? 0),
    (m[2] ?? 0) * p[0] + (m[6] ?? 0) * p[1] + (m[10] ?? 0) * p[2] + (m[14] ?? 0),
  ];
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// --- cow rig surgery ------------------------------------------------------------

interface GltfNode {
  name?: string;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  mesh?: number;
  skin?: number;
}
interface Skin {
  joints: number[];
  inverseBindMatrices?: number;
}
interface Primitive {
  attributes: Record<string, number>;
  indices?: number;
}

export interface CowEye {
  /** Bind-pose centre of the painted eyeball disc (glTF mesh space). */
  centre: [number, number, number];
  radius: number;
  /** Direction the disc faces. */
  axis: [number, number, number];
  /** +1 when the inner (nose-side) corner lies towards +X, else -1. */
  inner: number;
}

export interface CowRigInfo {
  /** Rest yaw of the head (glTF space, rad, + = towards glTF +X = the cow's left). */
  headYaw: number;
  bellVertices: number;
  earVertices: [number, number];
  /** Painted eyes, for the shader eyelids (blink, angry/worried lids). */
  eyes: CowEye[];
  /** Fur colour around the eyes (0..1), used for the lids. */
  lidColor: [number, number, number];
}

/**
 * The Meshy cow's eyes are painted into its albedo. They were measured once by
 * sampling the textured head densely in bind pose (white eyeball clusters,
 * disc centre from their in-plane extents, facing from PCA, ring colour from
 * the fur around them). The surgery does not move vertices, so the values
 * stay valid for this source model.
 */
const MESHY_COW_EYES: CowEye[] = [
  { centre: [-0.00028, 0.009548, 0.006155], radius: 0.00034, axis: [-0.364, 0.074, 0.928], inner: 1 },
  { centre: [0.001418, 0.009596, 0.00551], radius: 0.000366, axis: [0.869, 0.114, 0.482], inner: -1 },
];
const MESHY_COW_LID: [number, number, number] = [0.16, 0.16, 0.165];

function cowSurgery(parts: GlbParts): CowRigInfo {
  const json = parts.json;
  const nodes = list<GltfNode>(json, 'nodes');
  const skin = list<Skin>(json, 'skins')[0];
  if (!skin || skin.inverseBindMatrices === undefined) throw new Error('cow: no skin');
  const meshes = list<{ primitives: Primitive[] }>(json, 'meshes');
  const primitive = meshes[0]?.primitives[0];
  if (!primitive) throw new Error('cow: no mesh');
  const position = accessorView(parts, primitive.attributes.POSITION ?? -1) as Float32Array;
  const joints = accessorView(parts, primitive.attributes.JOINTS_0 ?? -1);
  const weights = accessorView(parts, primitive.attributes.WEIGHTS_0 ?? -1);
  if (!(weights instanceof Float32Array)) throw new Error('cow: expected float weights');
  const indices = accessorView(parts, primitive.indices ?? -1);
  const vertexCount = position.length / 3;

  const jointIndex = (name: string): number => {
    const index = skin.joints.findIndex((node) => nodes[node]?.name === name);
    if (index < 0) throw new Error(`cow: joint ${name} missing`);
    return index;
  };
  const headSlot = jointIndex('head');
  const chestSlot = jointIndex('chest');
  const headNode = skin.joints[headSlot] ?? -1;

  // Rest world matrices from the node hierarchy.
  const parent = new Map<number, number>();
  nodes.forEach((node, index) => node.children?.forEach((child) => parent.set(child, index)));
  const worldCache = new Map<number, Mat4>();
  const world = (index: number): Mat4 => {
    const cached = worldCache.get(index);
    if (cached) return cached;
    const node = nodes[index] ?? {};
    const local = compose(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]);
    const up = parent.get(index);
    const result = up === undefined ? local : multiply(world(up), local);
    worldCache.set(index, result);
    return result;
  };
  const ibm = accessorView(parts, skin.inverseBindMatrices) as Float32Array;
  const bindPosition = (slot: number): [number, number, number] => {
    const m = invert(Float64Array.from(ibm.subarray(slot * 16, slot * 16 + 16)));
    return [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0];
  };
  const head = bindPosition(headSlot);
  const chest = bindPosition(chestSlot);
  let minY = Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let v = 0; v < vertexCount; v += 1) {
    minY = Math.min(minY, position[v * 3 + 1] ?? 0);
    maxY = Math.max(maxY, position[v * 3 + 1] ?? 0);
    maxZ = Math.max(maxZ, position[v * 3 + 2] ?? 0);
  }
  const height = maxY - minY;
  // The thresholds below were measured on the owner's cow in units of
  // height / 11.58 (its raw height is 11.58 such units), so they scale with it.
  const k = height / 11.58;

  // Mesh islands (welded by position) for the bell.
  const keyOf = (v: number): string =>
    `${Math.round((position[v * 3] ?? 0) / (k * 1e-4))}|${Math.round((position[v * 3 + 1] ?? 0) / (k * 1e-4))}|${Math.round((position[v * 3 + 2] ?? 0) / (k * 1e-4))}`;
  const weld = new Int32Array(vertexCount);
  const keys = new Map<string, number>();
  for (let v = 0; v < vertexCount; v += 1) {
    const key = keyOf(v);
    const existing = keys.get(key);
    if (existing === undefined) {
      keys.set(key, keys.size);
      weld[v] = keys.size - 1;
    } else weld[v] = existing;
  }
  const union = new Int32Array(keys.size).map((_, index) => index);
  const find = (a: number): number => {
    let x = a;
    while (union[x] !== x) {
      union[x] = union[union[x] ?? x] ?? x;
      x = union[x] ?? x;
    }
    return x;
  };
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = find(weld[indices[i] ?? 0] ?? 0);
    const b = find(weld[indices[i + 1] ?? 0] ?? 0);
    const c = find(weld[indices[i + 2] ?? 0] ?? 0);
    union[b] = a;
    union[find(c)] = a;
  }
  const islands = new Map<number, number[]>();
  for (let v = 0; v < vertexCount; v += 1) {
    const root = find(weld[v] ?? 0);
    const island = islands.get(root);
    if (island) island.push(v);
    else islands.set(root, [v]);
  }
  // Bell + clapper: small islands hanging below the head, in front of the chest.
  const bellVertices: number[] = [];
  for (const island of islands.values()) {
    if (island.length > 4000) continue;
    let top = -Infinity;
    let front = Infinity;
    for (const v of island) {
      top = Math.max(top, position[v * 3 + 1] ?? 0);
      front = Math.min(front, position[v * 3 + 2] ?? 0);
    }
    if (top < minY + height * 0.55 && front > chest[2] + 0.5 * k) bellVertices.push(...island);
  }
  if (bellVertices.length === 0) throw new Error('cow: bell not found');
  let bellTop = -Infinity;
  let bellBottom = Infinity;
  for (const v of bellVertices) {
    bellTop = Math.max(bellTop, position[v * 3 + 1] ?? 0);
    bellBottom = Math.min(bellBottom, position[v * 3 + 1] ?? 0);
  }
  const bellPivot: [number, number, number] = [0, 0, 0];
  let bellPivotCount = 0;
  for (const v of bellVertices) {
    if ((position[v * 3 + 1] ?? 0) > bellTop - (bellTop - bellBottom) * 0.06) {
      bellPivot[0] += position[v * 3] ?? 0;
      bellPivot[2] += position[v * 3 + 2] ?? 0;
      bellPivotCount += 1;
    }
  }
  bellPivot[0] /= Math.max(1, bellPivotCount);
  bellPivot[2] /= Math.max(1, bellPivotCount);
  bellPivot[1] = bellTop;

  // Head yaw from the muzzle (the front-most head-skinned vertices).
  const headWeight = (v: number): number => {
    let sum = 0;
    for (let k = 0; k < 4; k += 1) if ((joints[v * 4 + k] ?? -1) === headSlot) sum += weights[v * 4 + k] ?? 0;
    return sum;
  };
  const muzzle = [0, 0, 0];
  let muzzleCount = 0;
  for (let v = 0; v < vertexCount; v += 1) {
    if ((position[v * 3 + 2] ?? 0) > maxZ - 0.6 * k && headWeight(v) > 0.5) {
      muzzle[0] = (muzzle[0] ?? 0) + (position[v * 3] ?? 0);
      muzzle[2] = (muzzle[2] ?? 0) + (position[v * 3 + 2] ?? 0);
      muzzleCount += 1;
    }
  }
  // The muzzle reads ~18° but the face is also a little asymmetric; 80 % of
  // it is what makes the two ears (and eyes) symmetric about the face.
  const headYaw = muzzleCount > 0
    ? Math.atan2((muzzle[0] ?? 0) / muzzleCount - head[0], (muzzle[2] ?? 0) / muzzleCount - head[2]) * 0.8
    : 0;

  // Ears: head-skinned vertices beyond the skull, in the head-turned frame.
  const earWeight = new Float32Array(vertexCount);
  const earSide = new Int8Array(vertexCount);
  const earBase: Array<[number, number, number, number]> = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const cos = Math.cos(headYaw);
  const sin = Math.sin(headYaw);
  for (let v = 0; v < vertexCount; v += 1) {
    if (headWeight(v) < 0.5) continue;
    const dx = (position[v * 3] ?? 0) - head[0];
    const dy = (position[v * 3 + 1] ?? 0) - head[1];
    const dz = (position[v * 3 + 2] ?? 0) - head[2];
    const x = dx * cos - dz * sin;
    const z = dx * sin + dz * cos;
    if (dy < 1.4 * k || dy > 3.3 * k || z < -1.6 * k || z > 1.9 * k) continue;
    const weight = smoothstep(1.18 * k, 1.55 * k, Math.abs(x));
    if (weight <= 0) continue;
    earWeight[v] = weight;
    const side = x > 0 ? 0 : 1;
    earSide[v] = side;
    if (Math.abs(x) < 1.45 * k) {
      const base = earBase[side] as [number, number, number, number];
      base[0] += position[v * 3] ?? 0;
      base[1] += position[v * 3 + 1] ?? 0;
      base[2] += position[v * 3 + 2] ?? 0;
      base[3] += 1;
    }
  }
  const earPivots = earBase.map((base): [number, number, number] =>
    base[3] > 0 ? [base[0] / base[3], base[1] / base[3], base[2] / base[3]] : [head[0], head[1], head[2]],
  );

  // New joints: children of `head`, identity orientation in bind space.
  const headWorld = world(headNode);
  const headInverse = invert(headWorld);
  const addJoint = (name: string, pivot: [number, number, number]): number => {
    const local = multiply(headInverse, compose(pivot, [0, 0, 0, 1], [1, 1, 1]));
    const { t, r, s } = decompose(local);
    nodes.push({ name, translation: t, rotation: r, scale: s });
    const index = nodes.length - 1;
    const head = nodes[headNode];
    if (head) head.children = [...(head.children ?? []), index];
    skin.joints.push(index);
    return skin.joints.length - 1;
  };
  const bellSlot = addJoint('bell', bellPivot);
  // glTF +X is the cow's left (Babylon mirrors X on import).
  const earLeftSlot = addJoint('ear_L', earPivots[0] as [number, number, number]);
  const earRightSlot = addJoint('ear_R', earPivots[1] as [number, number, number]);

  // Inverse bind matrices for the new joints: pure translations to the pivot.
  const ibmCount = skin.joints.length;
  const newIbm = new Float32Array(ibmCount * 16);
  newIbm.set(ibm.subarray(0, (ibmCount - 3) * 16));
  [bellPivot, earPivots[0], earPivots[1]].forEach((pivot, index) => {
    const m = identity();
    m[12] = -(pivot?.[0] ?? 0);
    m[13] = -(pivot?.[1] ?? 0);
    m[14] = -(pivot?.[2] ?? 0);
    newIbm.set(Array.from(m), (ibmCount - 3 + index) * 16);
  });
  skin.inverseBindMatrices = appendAccessor(parts, newIbm, 'MAT4', ibmCount);
  // Re-read the attribute views: appendAccessor replaced the binary buffer.
  const jointsOut = accessorView(parts, primitive.attributes.JOINTS_0 ?? -1);
  const weightsOut = accessorView(parts, primitive.attributes.WEIGHTS_0 ?? -1) as Float32Array;
  if (jointsOut instanceof Float32Array) throw new Error('cow: float joints');
  for (const v of bellVertices) {
    jointsOut[v * 4] = bellSlot;
    weightsOut[v * 4] = 1;
    for (let slot = 1; slot < 4; slot += 1) {
      jointsOut[v * 4 + slot] = 0;
      weightsOut[v * 4 + slot] = 0;
    }
  }
  const earCounts: [number, number] = [0, 0];
  for (let v = 0; v < vertexCount; v += 1) {
    const weight = earWeight[v] ?? 0;
    if (weight <= 0) continue;
    const side = earSide[v] ?? 0;
    earCounts[side] += 1;
    const slotJoint = side === 0 ? earLeftSlot : earRightSlot;
    let smallest = 0;
    for (let slot = 0; slot < 4; slot += 1) {
      weightsOut[v * 4 + slot] = (weightsOut[v * 4 + slot] ?? 0) * (1 - weight);
      if ((weightsOut[v * 4 + slot] ?? 0) < (weightsOut[v * 4 + smallest] ?? 0)) smallest = slot;
    }
    // The ear takes the slot of the smallest influence; renormalise the rest.
    jointsOut[v * 4 + smallest] = slotJoint;
    weightsOut[v * 4 + smallest] = weight;
    let sum = 0;
    for (let slot = 0; slot < 4; slot += 1) sum += weightsOut[v * 4 + slot] ?? 0;
    for (let slot = 0; slot < 4; slot += 1) weightsOut[v * 4 + slot] = (weightsOut[v * 4 + slot] ?? 0) / (sum || 1);
  }
  return { headYaw, bellVertices: bellVertices.length, earVertices: earCounts, eyes: MESHY_COW_EYES, lidColor: MESHY_COW_LID };
}

/** Removes texture slots the cel shader never samples; prune drops the images. */
function stripTextures(parts: GlbParts, keepNormal: boolean): void {
  for (const material of list<Json>(parts.json, 'materials')) {
    const pbr = material.pbrMetallicRoughness as Json | undefined;
    if (pbr) {
      delete pbr.metallicRoughnessTexture;
      pbr.metallicFactor = 0;
      pbr.roughnessFactor = 1;
    }
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    material.emissiveFactor = [0, 0, 0];
    if (!keepNormal) delete material.normalTexture;
  }
}

async function run(args: string[]): Promise<void> {
  const proc = Bun.spawn(['bunx', CLI, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  if (code !== 0) throw new Error(`gltf-transform ${args[0]} failed (${code}):\n${stderr}`);
}

async function finish(stem: string, outFile: string): Promise<void> {
  await run(['prune', `${stem}-0.glb`, `${stem}-1.glb`]);
  await run(['jpeg', `${stem}-1.glb`, `${stem}-2.glb`, '--formats', '*', '--quality', `${JPEG_QUALITY}`]);
  await run(['dedup', `${stem}-2.glb`, `${stem}-3.glb`]);
  await run(['prune', `${stem}-3.glb`, outFile]);
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface ManifestEntry {
  file: string;
  bytes: number;
  rig?: CowRigInfo;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const workDir = mkdtempSync(join(tmpdir(), 'ff-mascots-'));
const models: Record<string, ManifestEntry> = {};
try {
  const cowSource = join(SOURCE_DIR, 'meshy-cow.glb');
  if (existsSync(cowSource)) {
    const parts = readGlb(new Uint8Array(await Bun.file(cowSource).arrayBuffer()));
    const rig = cowSurgery(parts);
    stripTextures(parts, false);
    const stem = join(workDir, 'cow');
    await Bun.write(`${stem}-0.glb`, writeGlb(parts));
    const outFile = join(OUTPUT_DIR, 'cow.glb');
    await finish(stem, outFile);
    models.cow = { file: 'cow.glb', bytes: statSync(outFile).size, rig };
    console.log(`meshy-cow.glb -> models/mascots/cow.glb  ${megabytes(statSync(cowSource).size)} -> ${megabytes(statSync(outFile).size)}`);
    console.log(`  bell ${rig.bellVertices} verts, ears ${rig.earVertices.join('/')} verts, head yaw ${(rig.headYaw * 180 / Math.PI).toFixed(1)}°`);
  }
  const coconutSource = join(SOURCE_DIR, 'meshy-coconut.glb');
  if (existsSync(coconutSource)) {
    const parts = readGlb(new Uint8Array(await Bun.file(coconutSource).arrayBuffer()));
    stripTextures(parts, true);
    const stem = join(workDir, 'coconut');
    await Bun.write(`${stem}-0.glb`, writeGlb(parts));
    const outFile = join(OUTPUT_DIR, 'coconut.glb');
    await finish(stem, outFile);
    models.coconut = { file: 'coconut.glb', bytes: statSync(outFile).size };
    console.log(`meshy-coconut.glb -> models/mascots/coconut.glb  ${megabytes(statSync(coconutSource).size)} -> ${megabytes(statSync(outFile).size)}`);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
await Bun.write(join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify({ version: 1, models }, null, 2)}\n`);
console.log(`models/mascots/manifest.json: ${Object.keys(models).join(', ') || '(empty)'}`);
