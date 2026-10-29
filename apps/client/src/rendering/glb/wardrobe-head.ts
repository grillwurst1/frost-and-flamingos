/** Closed clean head derived offline from the owner's sculpt, shared by all rigs. */
export interface WardrobeHeadGeometry {
  version: 1;
  sourceHash: string;
  frame: { y: number; z: number; radius: number };
  solidAnatomy?: true;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  /** 0 solid skin, 1 atlas paint, 2 selected hair, 3 shaded anatomical feature. */
  painted: number[];
  tints: number[];
  skinReference: [number, number, number];
  hairReference: [number, number, number];
  afro?: { sourceHash: string; positions: number[]; normals: number[]; indices: number[]; uvs: number[]; shades: number[] };
}

export function parseWardrobeHead(value: unknown): WardrobeHeadGeometry | null {
  if (!value || typeof value !== 'object') return null;
  const h = value as Partial<WardrobeHeadGeometry>;
  if (h.version !== 1 || typeof h.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(h.sourceHash)
    || !h.frame || !Number.isFinite(h.frame.y) || !Number.isFinite(h.frame.z) || !(h.frame.radius > .05 && h.frame.radius < .4)
    || !Array.isArray(h.positions) || h.positions.length < 300 || h.positions.length > 60000 || h.positions.length % 3) return null;
  const count = h.positions.length / 3;
  if (h.solidAnatomy !== undefined && h.solidAnatomy !== true) return null;
  for (const [array, length] of [[h.positions, count * 3], [h.normals, count * 3], [h.uvs, count * 2], [h.tints, count * 3]] as const)
    if (!Array.isArray(array) || array.length !== length || !array.every(Number.isFinite)) return null;
  if (!Array.isArray(h.painted) || h.painted.length !== count || !h.painted.every(n => n === 0 || n === 1 || n === 2 || n === 3)
    || !Array.isArray(h.indices) || !h.indices.length || h.indices.length > 120000 || h.indices.length % 3
    || !h.indices.every(n => Number.isInteger(n) && n >= 0 && n < count)) return null;
  for (const ref of [h.skinReference, h.hairReference]) if (!Array.isArray(ref) || ref.length !== 3 || !ref.every(n => Number.isFinite(n) && n > .01 && n <= 1)) return null;
  if (h.afro) {
    const a = h.afro, count = a.positions?.length / 3;
    if (typeof a.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(a.sourceHash) || !Number.isInteger(count) || count < 100 || count > 20000) return null;
    for (const [array, length] of [[a.positions, count * 3], [a.normals, count * 3], [a.shades, count], [a.uvs, count * 2]] as const)
      if (!Array.isArray(array) || array.length !== length || !array.every(Number.isFinite)) return null;
    if (!Array.isArray(a.indices) || !a.indices.length || a.indices.length > 120000 || a.indices.length % 3
      || !a.indices.every(n => Number.isInteger(n) && n >= 0 && n < count) || !a.shades.every(n => n >= .2 && n <= 2)) return null;
  }
  return h as WardrobeHeadGeometry;
}
