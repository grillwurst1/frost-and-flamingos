import { BAKE_FPS, apexOf, jointName, type BakedClip } from './clips';

/**
 * Minimal GLB container access shared by the runtime loader and the offline
 * pipeline (`bun run models`), plus the baked-clip format both agree on.
 *
 * Baked clips are ordinary glTF animations named `ff:<role>` (or
 * `ff:<role>@<donor>` when retargeted from another model offline), holding
 * per-joint rotations (normalised int16, LINEAR) and the hips translation
 * (float). Any glTF viewer plays them; the game reads them straight into its
 * dense clip tables (see {@link readBakedClips}) without creating Babylon
 * animation objects at all.
 */
export interface GltfNode {
  name?: string;
}

export interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  normalized?: boolean;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
  sparse?: unknown;
}

export interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
}

export interface GltfAnimation {
  name?: string;
  channels: Array<{ sampler: number; target: { node?: number; path: string } }>;
  samplers: Array<{ input: number; output: number; interpolation?: string }>;
}

export interface GlbJson {
  [key: string]: unknown;
  nodes?: GltfNode[];
  skins?: Array<{ joints: number[] }>;
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: Array<{ byteLength: number; uri?: string }>;
  animations?: GltfAnimation[];
}

export interface GlbParts {
  json: GlbJson;
  bin: Uint8Array | null;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function readGlb(bytes: Uint8Array): GlbParts {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Not a GLB file');
  let offset = 12;
  let json: GlbJson | null = null;
  let bin: Uint8Array | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(chunk)) as GlbJson;
    if (type === CHUNK_BIN) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

export function writeGlb(parts: GlbParts): Uint8Array {
  const encoder = new TextEncoder();
  let jsonBytes = encoder.encode(JSON.stringify(parts.json));
  const jsonPadding = (4 - (jsonBytes.byteLength % 4)) % 4;
  if (jsonPadding) {
    const padded = new Uint8Array(jsonBytes.byteLength + jsonPadding).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }
  const bin = parts.bin;
  const binPadding = bin ? (4 - (bin.byteLength % 4)) % 4 : 0;
  const binLength = bin ? bin.byteLength + binPadding : 0;
  const total = 12 + 8 + jsonBytes.byteLength + (bin ? 8 + binLength : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  if (bin) {
    const binOffset = 20 + jsonBytes.byteLength;
    view.setUint32(binOffset, binLength, true);
    view.setUint32(binOffset + 4, CHUNK_BIN, true);
    out.set(bin, binOffset + 8);
  }
  return out;
}

// --- Baked clip names --------------------------------------------------------

const BAKED_NAME = /^ff:([A-Za-z]+)(?:@([a-z0-9]+(?:-[a-z0-9]+)*))?$/;

export function bakedClipName(role: string, donor: string | null): string {
  return donor ? `ff:${role}@${donor}` : `ff:${role}`;
}

export function parseBakedClipName(name: string): { role: string; donor: string | null } | null {
  const match = BAKED_NAME.exec(name);
  if (!match?.[1]) return null;
  return { role: match[1], donor: match[2] ?? null };
}

// --- Reading ------------------------------------------------------------------

const COMPONENTS: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Reads one (non-sparse) accessor as floats, de-normalising integer data. */
function readAccessor(json: GlbJson, bin: Uint8Array, index: number): { values: Float32Array; components: number } | null {
  const accessor = json.accessors?.[index];
  if (!accessor || accessor.sparse || accessor.bufferView === undefined) return null;
  const view = json.bufferViews?.[accessor.bufferView];
  const components = COMPONENTS[accessor.type];
  if (!view || !components) return null;
  const sizes: Readonly<Record<number, number>> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const size = sizes[accessor.componentType];
  if (!size) return null;
  const stride = view.byteStride ?? size * components;
  const base = bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const data = new DataView(bin.buffer, base, Math.max(0, Math.min(view.byteLength, bin.byteLength - (base - bin.byteOffset))));
  const normalized = accessor.normalized === true;
  const values = new Float32Array(accessor.count * components);
  for (let element = 0; element < accessor.count; element += 1) {
    for (let component = 0; component < components; component += 1) {
      const at = element * stride + component * size;
      let value: number;
      switch (accessor.componentType) {
        case 5120:
          value = data.getInt8(at);
          if (normalized) value = Math.max(value / 127, -1);
          break;
        case 5121:
          value = data.getUint8(at);
          if (normalized) value /= 255;
          break;
        case 5122:
          value = data.getInt16(at, true);
          if (normalized) value = Math.max(value / 32767, -1);
          break;
        case 5123:
          value = data.getUint16(at, true);
          if (normalized) value /= 65535;
          break;
        case 5125:
          value = data.getUint32(at, true);
          break;
        default:
          value = data.getFloat32(at, true);
      }
      values[element * components + component] = value;
    }
  }
  return { values, components };
}

interface Track {
  times: Float32Array;
  values: Float32Array;
  components: number;
  interpolation: string;
}

/** Samples a track at time `t` into `out[offset..]` (quaternions: nlerp). */
function sampleTrack(track: Track, t: number, out: Float32Array, offset: number, quaternion: boolean): void {
  const { times, values, components, interpolation } = track;
  const keys = times.length;
  // CUBICSPLINE stores (in-tangent, value, out-tangent) per key.
  const stride = interpolation === 'CUBICSPLINE' ? components * 3 : components;
  const shift = interpolation === 'CUBICSPLINE' ? components : 0;
  const read = (key: number, component: number): number => values[key * stride + shift + component] ?? 0;
  // First key after t (binary search; the bracket is [next - 1, next]).
  let low = 0;
  let high = keys;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((times[mid] ?? 0) <= t) low = mid + 1;
    else high = mid;
  }
  const next = low;
  const a = Math.max(0, next - 1);
  const b = Math.min(keys - 1, next);
  const ta = times[a] ?? 0;
  const tb = times[b] ?? 0;
  const k = interpolation === 'STEP' || b === a || tb <= ta ? 0 : Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
  if (quaternion) {
    const dot = read(a, 0) * read(b, 0) + read(a, 1) * read(b, 1) + read(a, 2) * read(b, 2) + read(a, 3) * read(b, 3);
    const sign = dot < 0 ? -1 : 1;
    let length = 0;
    for (let component = 0; component < 4; component += 1) {
      const value = read(a, component) * (1 - k) + read(b, component) * sign * k;
      out[offset + component] = value;
      length += value * value;
    }
    const scale = length > 0 ? 1 / Math.sqrt(length) : 1;
    for (let component = 0; component < 4; component += 1) out[offset + component] = (out[offset + component] ?? 0) * scale;
    return;
  }
  for (let component = 0; component < components; component += 1) {
    out[offset + component] = read(a, component) * (1 - k) + read(b, component) * k;
  }
}

/**
 * Reads every baked `ff:<role>` animation of a GLB into dense 30 Hz clip
 * tables, keyed by role. Other animations are ignored (empty map when the
 * GLB was not baked by the pipeline).
 */
export function readBakedClips(parts: GlbParts): Map<string, BakedClip> {
  const clips = new Map<string, BakedClip>();
  const { json, bin } = parts;
  if (!bin) return clips;
  for (const animation of json.animations ?? []) {
    const parsed = parseBakedClipName(animation.name ?? '');
    if (!parsed) continue;
    const rotationTracks: Array<{ bone: string; track: Track }> = [];
    let hipsTrack: Track | null = null;
    let start = Infinity;
    let end = -Infinity;
    for (const channel of animation.channels) {
      const sampler = animation.samplers[channel.sampler];
      const node = channel.target.node === undefined ? undefined : json.nodes?.[channel.target.node];
      if (!sampler || !node) continue;
      const bone = jointName(node.name ?? '');
      const path = channel.target.path;
      if (path !== 'rotation' && !(path === 'translation' && bone === 'Hips')) continue;
      const input = readAccessor(json, bin, sampler.input);
      const output = readAccessor(json, bin, sampler.output);
      if (!input || !output || input.values.length === 0) continue;
      const track: Track = {
        times: input.values,
        values: output.values,
        components: output.components,
        interpolation: sampler.interpolation ?? 'LINEAR',
      };
      start = Math.min(start, input.values[0] ?? 0);
      end = Math.max(end, input.values[input.values.length - 1] ?? 0);
      if (path === 'rotation') rotationTracks.push({ bone, track });
      else hipsTrack = track;
    }
    if (rotationTracks.length === 0 || !Number.isFinite(start)) continue;
    const duration = Math.max(1 / BAKE_FPS, end - start);
    const frames = Math.max(2, Math.round(duration * BAKE_FPS) + 1);
    const bones = rotationTracks.map((entry) => entry.bone);
    const rotations = new Float32Array(frames * bones.length * 4);
    const hips = hipsTrack ? new Float32Array(frames * 3) : null;
    for (let frame = 0; frame < frames; frame += 1) {
      const t = Math.min(end, start + frame / BAKE_FPS);
      rotationTracks.forEach((entry, bone) => sampleTrack(entry.track, t, rotations, (frame * bones.length + bone) * 4, true));
      if (hips && hipsTrack) sampleTrack(hipsTrack, t, hips, frame * 3, false);
    }
    const clip = { name: animation.name ?? parsed.role, duration, frames, bones, rotations, hips, retargetedFrom: parsed.donor };
    clips.set(parsed.role, { ...clip, apexTime: apexOf(clip) });
  }
  return clips;
}

// --- Writing (offline pipeline) ----------------------------------------------

/**
 * Replaces every animation of the GLB with the given baked clips (one glTF
 * animation per role). Old animation data stays in the binary until the
 * pipeline's prune step drops the unreferenced accessors.
 */
export function writeBakedAnimations(parts: GlbParts, clips: ReadonlyArray<{ role: string; clip: BakedClip }>): void {
  const json = parts.json;
  const nodeIndex = new Map<string, number>();
  for (const skin of json.skins ?? []) {
    for (const joint of skin.joints) {
      const name = jointName(json.nodes?.[joint]?.name ?? '');
      if (name && !nodeIndex.has(name)) nodeIndex.set(name, joint);
    }
  }
  const accessors = (json.accessors ??= []);
  const bufferViews = (json.bufferViews ??= []);
  const buffers = (json.buffers ??= []);
  if (buffers.length === 0) buffers.push({ byteLength: 0 });
  const chunks: Uint8Array[] = parts.bin ? [parts.bin] : [];
  let length = parts.bin?.byteLength ?? 0;
  const append = (bytes: Uint8Array, accessor: Omit<GltfAccessor, 'bufferView'>): number => {
    const padding = (4 - (length % 4)) % 4;
    if (padding) {
      chunks.push(new Uint8Array(padding));
      length += padding;
    }
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.byteLength });
    chunks.push(bytes);
    length += bytes.byteLength;
    accessors.push({ ...accessor, bufferView: bufferViews.length - 1 });
    return accessors.length - 1;
  };
  const animations: GltfAnimation[] = [];
  for (const { role, clip } of clips) {
    const times = new Float32Array(clip.frames);
    for (let frame = 0; frame < clip.frames; frame += 1) times[frame] = frame / BAKE_FPS;
    const input = append(new Uint8Array(times.buffer), {
      componentType: 5126,
      count: clip.frames,
      type: 'SCALAR',
      min: [0],
      max: [times[clip.frames - 1] ?? 0],
    });
    const animation: GltfAnimation = { name: bakedClipName(role, clip.retargetedFrom), channels: [], samplers: [] };
    clip.bones.forEach((bone, index) => {
      const node = nodeIndex.get(bone);
      if (node === undefined) return;
      const values = new Int16Array(clip.frames * 4);
      for (let frame = 0; frame < clip.frames; frame += 1) {
        for (let component = 0; component < 4; component += 1) {
          const value = clip.rotations[(frame * clip.bones.length + index) * 4 + component] ?? 0;
          values[frame * 4 + component] = Math.round(Math.max(-1, Math.min(1, value)) * 32767);
        }
      }
      const output = append(new Uint8Array(values.buffer), { componentType: 5122, normalized: true, count: clip.frames, type: 'VEC4' });
      animation.samplers.push({ input, output, interpolation: 'LINEAR' });
      animation.channels.push({ sampler: animation.samplers.length - 1, target: { node, path: 'rotation' } });
    });
    const hipsNode = nodeIndex.get('Hips');
    if (clip.hips && hipsNode !== undefined) {
      const output = append(new Uint8Array(clip.hips.buffer, clip.hips.byteOffset, clip.hips.byteLength), {
        componentType: 5126,
        count: clip.frames,
        type: 'VEC3',
      });
      animation.samplers.push({ input, output, interpolation: 'LINEAR' });
      animation.channels.push({ sampler: animation.samplers.length - 1, target: { node: hipsNode, path: 'translation' } });
    }
    if (animation.channels.length > 0) animations.push(animation);
  }
  json.animations = animations;
  const packed = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    packed.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  const first = buffers[0];
  if (first) first.byteLength = length;
  parts.bin = packed;
}
