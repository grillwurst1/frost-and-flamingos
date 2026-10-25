/**
 * Removes tiny disconnected mesh islands from a parsed GLB (JSON + binary
 * chunk), e.g. the stray floating hem fragments Meshy leaves around the Creepy
 * Mountain Girl's shins. Used by scripts/optimize-models.ts.
 *
 * Islands are found on a position-welded graph (Meshy splits vertices along
 * UV seams, so plain index connectivity would cut the body apart). An island
 * is dropped when it holds less than `maxTriangleShare` of the primitive's
 * triangles AND its bounding box is smaller than `maxExtent` metres on every
 * axis, so real details (hands, hair strands, buttons) of any size survive.
 * The index buffer is rewritten in place and the accessor shortened; the
 * unreferenced vertices are left for the later prune/dedup passes.
 */

export interface GlbJson {
  meshes?: Array<{ primitives: Array<{ attributes: Record<string, number>; indices?: number; mode?: number }> }>;
  accessors?: Array<{ bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }>;
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }>;
}

export interface IslandOptions {
  /** Islands below this share of the primitive's triangles may go (default 2 %). */
  maxTriangleShare?: number;
  /** …if they also fit in a box of this size in metres (default 0.15). */
  maxExtent?: number;
  /** Position weld tolerance in metres (default 0.1 mm). */
  weld?: number;
}

export interface IslandReport {
  islands: number;
  removedIslands: number;
  removedTriangles: number;
  keptTriangles: number;
}

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const UNSIGNED_BYTE = 5121;

function view(bin: Uint8Array): DataView {
  return new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
}

export function removeSmallIslands(json: GlbJson, bin: Uint8Array | null, options: IslandOptions = {}): IslandReport {
  const report: IslandReport = { islands: 0, removedIslands: 0, removedTriangles: 0, keptTriangles: 0 };
  if (!bin) return report;
  const maxShare = options.maxTriangleShare ?? 0.02;
  const maxExtent = options.maxExtent ?? 0.15;
  const weld = options.weld ?? 1e-4;
  const data = view(bin);
  const accessors = json.accessors ?? [];
  const bufferViews = json.bufferViews ?? [];

  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? 4) !== 4 || primitive.indices === undefined) continue;
      const positionAccessor = accessors[primitive.attributes.POSITION ?? -1];
      const indexAccessor = accessors[primitive.indices];
      if (!positionAccessor || !indexAccessor || positionAccessor.componentType !== FLOAT) continue;
      const positionView = bufferViews[positionAccessor.bufferView ?? -1];
      const indexView = bufferViews[indexAccessor.bufferView ?? -1];
      if (!positionView || !indexView) continue;

      // Positions (honouring a byte stride) and indices.
      const vertexCount = positionAccessor.count;
      const stride = positionView.byteStride ?? 12;
      const positionBase = (positionView.byteOffset ?? 0) + (positionAccessor.byteOffset ?? 0);
      const positions = new Float32Array(vertexCount * 3);
      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const offset = positionBase + vertex * stride;
        positions[vertex * 3] = data.getFloat32(offset, true);
        positions[vertex * 3 + 1] = data.getFloat32(offset + 4, true);
        positions[vertex * 3 + 2] = data.getFloat32(offset + 8, true);
      }
      const indexBase = (indexView.byteOffset ?? 0) + (indexAccessor.byteOffset ?? 0);
      const indexSize =
        indexAccessor.componentType === UNSIGNED_INT ? 4 : indexAccessor.componentType === UNSIGNED_SHORT ? 2 : 1;
      if (![UNSIGNED_INT, UNSIGNED_SHORT, UNSIGNED_BYTE].includes(indexAccessor.componentType)) continue;
      const readIndex = (at: number): number =>
        indexSize === 4
          ? data.getUint32(indexBase + at * 4, true)
          : indexSize === 2
            ? data.getUint16(indexBase + at * 2, true)
            : data.getUint8(indexBase + at);
      const indexCount = indexAccessor.count - (indexAccessor.count % 3);
      const indices = new Uint32Array(indexCount);
      for (let index = 0; index < indexCount; index += 1) indices[index] = readIndex(index);
      const triangles = indexCount / 3;
      if (triangles === 0) continue;

      // Weld coincident vertices, then union-find over the triangles.
      const welded = new Int32Array(vertexCount);
      const cells = new Map<string, number>();
      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const key = `${Math.round((positions[vertex * 3] ?? 0) / weld)},${Math.round((positions[vertex * 3 + 1] ?? 0) / weld)},${Math.round((positions[vertex * 3 + 2] ?? 0) / weld)}`;
        const existing = cells.get(key);
        if (existing === undefined) {
          cells.set(key, vertex);
          welded[vertex] = vertex;
        } else {
          welded[vertex] = existing;
        }
      }
      const parent = new Int32Array(vertexCount);
      for (let vertex = 0; vertex < vertexCount; vertex += 1) parent[vertex] = vertex;
      const find = (start: number): number => {
        let root = start;
        while (parent[root] !== root) root = parent[root] ?? root;
        let node = start;
        while (parent[node] !== root) {
          const next = parent[node] ?? root;
          parent[node] = root;
          node = next;
        }
        return root;
      };
      for (let triangle = 0; triangle < triangles; triangle += 1) {
        const a = find(welded[indices[triangle * 3] ?? 0] ?? 0);
        const b = find(welded[indices[triangle * 3 + 1] ?? 0] ?? 0);
        const c = find(welded[indices[triangle * 3 + 2] ?? 0] ?? 0);
        parent[b] = a;
        parent[find(c)] = a;
      }

      // Triangle count and bounds per island.
      // bounds = [min x, min y, min z, max x, max y, max z]
      const islands = new Map<number, { triangles: number; bounds: Float64Array }>();
      const islandOf = new Int32Array(triangles);
      for (let triangle = 0; triangle < triangles; triangle += 1) {
        const root = find(welded[indices[triangle * 3] ?? 0] ?? 0);
        islandOf[triangle] = root;
        let island = islands.get(root);
        if (!island) {
          island = { triangles: 0, bounds: Float64Array.of(Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity) };
          islands.set(root, island);
        }
        island.triangles += 1;
        const bounds = island.bounds;
        for (let corner = 0; corner < 3; corner += 1) {
          const vertex = indices[triangle * 3 + corner] ?? 0;
          for (let axis = 0; axis < 3; axis += 1) {
            const value = positions[vertex * 3 + axis] ?? 0;
            bounds[axis] = Math.min(bounds[axis] ?? value, value);
            bounds[axis + 3] = Math.max(bounds[axis + 3] ?? value, value);
          }
        }
      }
      const drop = new Set<number>();
      for (const [root, island] of islands) {
        const b = island.bounds;
        const extent = Math.max((b[3] ?? 0) - (b[0] ?? 0), (b[4] ?? 0) - (b[1] ?? 0), (b[5] ?? 0) - (b[2] ?? 0));
        if (island.triangles < triangles * maxShare && extent < maxExtent) drop.add(root);
      }
      report.islands += islands.size;
      if (drop.size === 0 || drop.size === islands.size) {
        report.keptTriangles += triangles;
        continue;
      }

      // Rewrite the kept triangles in place and shorten the accessor.
      let written = 0;
      const writeIndex = (at: number, value: number): void => {
        if (indexSize === 4) data.setUint32(indexBase + at * 4, value, true);
        else if (indexSize === 2) data.setUint16(indexBase + at * 2, value, true);
        else data.setUint8(indexBase + at, value);
      };
      for (let triangle = 0; triangle < triangles; triangle += 1) {
        if (drop.has(islandOf[triangle] ?? -1)) continue;
        for (let corner = 0; corner < 3; corner += 1) writeIndex(written * 3 + corner, indices[triangle * 3 + corner] ?? 0);
        written += 1;
      }
      indexAccessor.count = written * 3;
      report.removedIslands += drop.size;
      report.removedTriangles += triangles - written;
      report.keptTriangles += written;
    }
  }
  return report;
}
