/**
 * Simplifies the triangle meshes of a parsed GLB (JSON + binary chunk) to a
 * triangle budget with meshoptimizer, for small, numerous models such as the
 * wandering hens. Used by scripts/optimize-models.ts (MODEL_TUNING).
 *
 * Meshy splits vertices along every UV island seam, so a plain weld cannot
 * merge them and an ordinary simplifier stalls at ~55 % of the triangles. The
 * simplifier therefore runs attribute-aware (normals and UVs weighted, so
 * texture seams stay put where collapsing would smear the paint) and, only
 * if the budget is still out of reach, in meshoptimizer's permissive mode
 * (collapses across seams whose attributes barely differ). The error bound
 * grows step by step and the first result inside the budget wins, so the
 * silhouette keeps as much detail as the budget allows.
 *
 * Every primitive's vertex attributes (skin joints and weights included) are
 * compacted to the vertices still referenced and rewritten as tightly packed
 * buffer views appended to the binary chunk; the stale data goes in the later
 * prune pass.
 */
import { MeshoptSimplifier, type SimplifierFlags } from 'meshoptimizer';

export interface SimplifyJson {
  meshes?: Array<{ primitives: Array<{ attributes: Record<string, number>; indices?: number; mode?: number }> }>;
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    normalized?: boolean;
    count: number;
    type: string;
    min?: number[];
    max?: number[];
    sparse?: unknown;
  }>;
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number }>;
  buffers?: Array<{ byteLength: number; uri?: string }>;
}

export interface SimplifyReport {
  trianglesBefore: number;
  trianglesAfter: number;
  verticesBefore: number;
  verticesAfter: number;
  /** Relative error meshoptimizer reports for the accepted result. */
  error: number;
  /** Error bound and mode that met the budget. */
  bound: number;
  permissive: boolean;
}

/** Error bounds (fraction of the mesh extent) tried in turn. */
const ERROR_BOUNDS = [0.004, 0.008, 0.015, 0.03, 0.06] as const;
/** Attribute weights: normal x/y/z, then u/v. */
const ATTRIBUTE_WEIGHTS = [0.3, 0.3, 0.3, 1.2, 1.2];

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;

interface Attribute {
  accessor: number;
  size: number;
  componentType: number;
  values: Float64Array;
}

function readAccessor(json: SimplifyJson, bin: Uint8Array, index: number): Attribute {
  const accessor = json.accessors?.[index];
  if (!accessor || accessor.bufferView === undefined || accessor.sparse) throw new Error(`accessor ${index}: unsupported layout`);
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`accessor ${index}: missing buffer view`);
  const size = COMPONENTS[accessor.type] ?? 1;
  const bytes = BYTES[accessor.componentType] ?? 4;
  const stride = view.byteStride ?? size * bytes;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const values = new Float64Array(accessor.count * size);
  for (let vertex = 0; vertex < accessor.count; vertex += 1) {
    for (let component = 0; component < size; component += 1) {
      const at = base + vertex * stride + component * bytes;
      let value: number;
      switch (accessor.componentType) {
        case 5126:
          value = data.getFloat32(at, true);
          break;
        case 5125:
          value = data.getUint32(at, true);
          break;
        case 5123:
          value = data.getUint16(at, true);
          break;
        case 5122:
          value = data.getInt16(at, true);
          break;
        case 5121:
          value = data.getUint8(at);
          break;
        default:
          value = data.getInt8(at);
      }
      values[vertex * size + component] = value;
    }
  }
  return { accessor: index, size, componentType: accessor.componentType, values };
}

function encode(values: Float64Array, componentType: number): Uint8Array {
  const bytes = BYTES[componentType] ?? 4;
  const out = new Uint8Array(values.length * bytes);
  const data = new DataView(out.buffer);
  values.forEach((value, index) => {
    const at = index * bytes;
    switch (componentType) {
      case 5126:
        data.setFloat32(at, value, true);
        break;
      case 5125:
        data.setUint32(at, value, true);
        break;
      case 5123:
        data.setUint16(at, value, true);
        break;
      case 5122:
        data.setInt16(at, value, true);
        break;
      case 5121:
        data.setUint8(at, value);
        break;
      default:
        data.setInt8(at, value);
    }
  });
  return out;
}

function triangles(json: SimplifyJson): number {
  let count = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const accessor = primitive.indices ?? primitive.attributes.POSITION;
      count += (accessor === undefined ? 0 : (json.accessors?.[accessor]?.count ?? 0)) / 3;
    }
  }
  return Math.round(count);
}

function vertices(json: SimplifyJson): number {
  let count = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const position = primitive.attributes.POSITION;
      count += position === undefined ? 0 : (json.accessors?.[position]?.count ?? 0);
    }
  }
  return count;
}

/** Simplifies one primitive's index list; returns the new indices or null when the bound is too tight. */
function simplifyIndices(
  indices: Uint32Array,
  positions: Float32Array,
  attributes: Float32Array,
  targetTriangles: number,
  bound: number,
  permissive: boolean,
): { indices: Uint32Array; error: number } {
  const flags: SimplifierFlags[] = permissive ? ['Permissive'] : [];
  const [result, error] = MeshoptSimplifier.simplifyWithAttributes(
    indices,
    positions,
    3,
    attributes,
    ATTRIBUTE_WEIGHTS.length,
    ATTRIBUTE_WEIGHTS,
    null,
    Math.max(3, Math.floor(targetTriangles) * 3),
    bound,
    flags,
  );
  return { indices: result, error };
}

/**
 * Simplifies every triangle primitive in place so the model fits
 * `maxTriangles` (shared proportionally by triangle count). Returns null when
 * the model already fits.
 */
export async function simplifyGlb(json: SimplifyJson, bin: Uint8Array | null, maxTriangles: number): Promise<{ bin: Uint8Array; report: SimplifyReport } | null> {
  const before = triangles(json);
  if (before <= maxTriangles || !bin) return null;
  await MeshoptSimplifier.ready;
  const verticesBefore = vertices(json);
  const share = (maxTriangles * 0.98) / before;

  interface Work {
    primitive: { attributes: Record<string, number>; indices?: number };
    indices: Uint32Array;
    positions: Float32Array;
    attributes: Float32Array;
  }
  const work: Work[] = [];
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? 4) !== 4 || primitive.indices === undefined || primitive.attributes.POSITION === undefined) continue;
      const position = readAccessor(json, bin, primitive.attributes.POSITION);
      const count = position.values.length / 3;
      const normal = primitive.attributes.NORMAL === undefined ? null : readAccessor(json, bin, primitive.attributes.NORMAL);
      const uv = primitive.attributes.TEXCOORD_0 === undefined ? null : readAccessor(json, bin, primitive.attributes.TEXCOORD_0);
      const attributes = new Float32Array(count * ATTRIBUTE_WEIGHTS.length);
      for (let vertex = 0; vertex < count; vertex += 1) {
        const at = vertex * ATTRIBUTE_WEIGHTS.length;
        attributes[at] = normal?.values[vertex * 3] ?? 0;
        attributes[at + 1] = normal?.values[vertex * 3 + 1] ?? 0;
        attributes[at + 2] = normal?.values[vertex * 3 + 2] ?? 0;
        attributes[at + 3] = uv?.values[vertex * 2] ?? 0;
        attributes[at + 4] = uv?.values[vertex * 2 + 1] ?? 0;
      }
      work.push({
        primitive,
        indices: Uint32Array.from(readAccessor(json, bin, primitive.indices).values),
        positions: Float32Array.from(position.values),
        attributes,
      });
    }
  }

  // Tightest bound first; permissive only when attribute seams block the budget.
  let chosen: { results: Uint32Array[]; error: number; bound: number; permissive: boolean } | null = null;
  for (const permissive of [false, true]) {
    for (const bound of ERROR_BOUNDS) {
      const results = work.map((entry) => simplifyIndices(entry.indices, entry.positions, entry.attributes, (entry.indices.length / 3) * share, bound, permissive));
      const total = results.reduce((sum, result) => sum + result.indices.length / 3, 0);
      if (total <= maxTriangles) {
        chosen = { results: results.map((result) => result.indices), error: Math.max(...results.map((result) => result.error)), bound, permissive };
        break;
      }
    }
    if (chosen) break;
  }
  if (!chosen) throw new Error(`could not simplify ${before} triangles below ${maxTriangles}`);

  // Compact and rewrite: tightly packed views appended to the binary chunk.
  const chunks: Uint8Array[] = [bin];
  let length = bin.byteLength;
  const views = json.bufferViews ?? (json.bufferViews = []);
  const accessors = json.accessors ?? [];
  const append = (bytes: Uint8Array, target: number): number => {
    const padding = (4 - (length % 4)) % 4;
    if (padding) {
      chunks.push(new Uint8Array(padding));
      length += padding;
    }
    views.push({ buffer: 0, byteOffset: length, byteLength: bytes.byteLength, target });
    chunks.push(bytes);
    length += bytes.byteLength;
    return views.length - 1;
  };
  work.forEach((entry, index) => {
    const simplified = chosen?.results[index];
    if (!simplified) return;
    const remap = new Map<number, number>();
    const order: number[] = [];
    const indices = new Float64Array(simplified.length);
    simplified.forEach((vertex, at) => {
      let mapped = remap.get(vertex);
      if (mapped === undefined) {
        mapped = order.length;
        remap.set(vertex, mapped);
        order.push(vertex);
      }
      indices[at] = mapped;
    });
    for (const accessorIndex of Object.values(entry.primitive.attributes)) {
      const attribute = readAccessor(json, bin, accessorIndex);
      const values = new Float64Array(order.length * attribute.size);
      order.forEach((vertex, at) => {
        for (let component = 0; component < attribute.size; component += 1) {
          values[at * attribute.size + component] = attribute.values[vertex * attribute.size + component] ?? 0;
        }
      });
      const accessor = accessors[accessorIndex];
      if (!accessor) continue;
      accessor.bufferView = append(encode(values, attribute.componentType), 34962);
      accessor.byteOffset = 0;
      accessor.count = order.length;
      if (accessor.min && accessor.max) {
        const min = new Array<number>(attribute.size).fill(Number.POSITIVE_INFINITY);
        const max = new Array<number>(attribute.size).fill(Number.NEGATIVE_INFINITY);
        for (let at = 0; at < values.length; at += 1) {
          const component = at % attribute.size;
          const value = values[at] ?? 0;
          min[component] = Math.min(min[component] ?? value, value);
          max[component] = Math.max(max[component] ?? value, value);
        }
        accessor.min = min;
        accessor.max = max;
      }
    }
    const indexAccessor = entry.primitive.indices === undefined ? undefined : accessors[entry.primitive.indices];
    if (!indexAccessor) return;
    const componentType = order.length < 65535 ? UNSIGNED_SHORT : UNSIGNED_INT;
    indexAccessor.componentType = componentType;
    indexAccessor.bufferView = append(encode(indices, componentType), 34963);
    indexAccessor.byteOffset = 0;
    indexAccessor.count = indices.length;
    delete indexAccessor.min;
    delete indexAccessor.max;
  });
  const packed = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    packed.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  if (json.buffers?.[0]) json.buffers[0].byteLength = length;
  return {
    bin: packed,
    report: {
      trianglesBefore: before,
      trianglesAfter: triangles(json),
      verticesBefore,
      verticesAfter: vertices(json),
      error: chosen.error,
      bound: chosen.bound,
      permissive: chosen.permissive,
    },
  };
}
