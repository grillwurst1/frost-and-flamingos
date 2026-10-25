/**
 * Optimises the owner's Meshy image-to-3D characters for the game client.
 *
 *   bun run models                       # every art-src/meshy/meshy-<name>.glb
 *   bun run models art-src/meshy/meshy-lagoon-heavy.glb
 *   bun run models --normal-size=2048    # larger normal map (default 1024)
 *   bun run models --keep-normal=false   # also drop the normal map
 *   bun run models --manifest-only       # just rewrite models/manifest.json
 *
 * Input:  untouched Meshy downloads (rigged Mixamo skeleton, PBR material with
 *         2048² baseColor + metallicRoughness + normal JPEGs, a few clips).
 * Output: apps/client/public/models/<faction>-<class>.glb (mesh, skeleton,
 *         baked clips; 1-2 MB) with its painted textures as sidecar files
 *         <faction>-<class>-basecolor.webp / -normal.webp referenced by URI,
 *         plus models/manifest.json listing every model and its textures.
 *         Every model is self-contained: the client loads only the models on
 *         screen, and only requests listed files, so missing classes never
 *         cause a 404.
 *
 * Steps (lossless for the skeleton; clips as described in step 1):
 *   0. CLEAN_ISLANDS models: drop tiny floating mesh fragments (glb-islands.ts),
 *   1. models of the bake set (the catalogue's soldiers plus EXTRA_BAKES) get
 *      their clips replaced by one `ff:<role>` animation per animation role:
 *      the model's own clip for the role (per-model clip table), else, for
 *      sharing models, the clip retargeted offline from another model
 *      (`ff:<role>@<donor>`; glb/offline-bake.ts runs the game's retarget
 *      maths). Hips travel is stripped, rotations are int16, unused Meshy
 *      clips are dropped. Other models keep their clips untouched,
 *   2. drop the metallicRoughness texture (the cel shader never reads it),
 *   3. keep the painted base colour at its full 2048² and re-encode it as
 *      WebP q92 (EXT_texture_webp; PSNR ≈ 42 dB vs the Meshy JPEG at a
 *      quarter of the bytes; JPEG q92 is 1.5× larger and noisier),
 *   4. normal map: 1024² (--normal-size), WebP q90 (the cel shader uses it
 *      at a quarter strength, so the full 2048² only costs memory),
 *   5. resample animations (removes redundant keyframes),
 *   6. dedup + prune unused accessors/images,
 *   7. move the images out of the GLB binary into sidecar files.
 * The heavy lifting runs through the pinned glTF Transform CLI via `bunx`,
 * so no native image toolchain has to live in the workspace dependencies.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { DEFAULT_CLIPS, PAINTED_MODELS, type ClipRole } from '../apps/client/src/rendering/glb/catalog';
import type { BakedClip } from '../apps/client/src/rendering/glb/clips';
import { readGlb, writeBakedAnimations, writeGlb, type GlbParts } from '../apps/client/src/rendering/glb/glb-binary';
import { bakeClipLibrary, type BakeSource } from '../apps/client/src/rendering/glb/offline-bake';
import { removeSmallIslands, type GlbJson } from './glb-islands';
import { splitVehicle, VEHICLE_PART_SPECS } from './vehicle-parts';

const ROOT = resolve(import.meta.dir, '..');
const SOURCE_DIR = join(ROOT, 'art-src', 'meshy');
const OUTPUT_DIR = join(ROOT, 'apps', 'client', 'public', 'models');
const CLI = '@gltf-transform/cli@4.5.1';
const BASE_QUALITY = 92;
const NORMAL_QUALITY = 90;
/** meshy-<name>.glb → <name>.glb (soldiers are meshy-<faction>-<class>.glb). */
const NAME_PATTERN = /^meshy-([a-z0-9]+(?:-[a-z0-9]+)*)\.glb$/;
/** Models whose Meshy mesh carries tiny floating fragments (see glb-islands.ts). */
const CLEAN_ISLANDS = new Set(['alpine-ghostgirl']);

interface BakeEntry {
  /** Role → candidate clip names, first match wins. */
  clips: Readonly<Record<string, readonly string[]>>;
  /** Lends clips to and borrows missing roles from the other sharing models. */
  share: boolean;
}

/**
 * Non-soldier characters whose clips are baked too. They keep their own
 * motion set only (no lending or borrowing); the tables mirror the clip
 * tables their runtime specs register (package 3G, glb/drifter-models.ts).
 */
const EXTRA_BAKES: Readonly<Record<string, BakeEntry>> = {
  'alpine-ghostgirl': {
    share: false,
    clips: { walk: ['Walking'], backpedal: ['Walk_Backward'], taunt: ['Call_Gesture'], emote: ['Skip_Forward'] },
  },
  'lagoon-beachgirl': {
    share: false,
    clips: { idle: ['Idle'], walk: ['Walking'], backpedal: ['Walk_Backward'], taunt: ['Cheer'] },
  },
};

/** The bake set: every catalogue soldier (shared clip library) plus {@link EXTRA_BAKES}. */
function bakeEntries(): Map<string, BakeEntry> {
  const entries = new Map<string, BakeEntry>();
  const roles = Object.keys(DEFAULT_CLIPS) as ClipRole[];
  for (const spec of Object.values(PAINTED_MODELS)) {
    const clips: Record<string, readonly string[]> = {};
    for (const role of roles) clips[role] = [...(spec.clips[role] ?? []), ...DEFAULT_CLIPS[role]];
    entries.set(spec.key, { clips, share: true });
  }
  for (const [key, entry] of Object.entries(EXTRA_BAKES)) entries.set(key, entry);
  return entries;
}

/**
 * Bakes the clips of every requested model in the bake set. Sharing models
 * need their donors, so all sharing sources in art-src/meshy are loaded
 * whenever one of them is requested.
 */
async function bakeRequested(files: readonly string[]): Promise<Map<string, Map<string, BakedClip>>> {
  const entries = bakeEntries();
  const requested = new Set(files.map((file) => NAME_PATTERN.exec(basename(file))?.[1]).filter((key): key is string => !!key && entries.has(key)));
  if (requested.size === 0) return new Map();
  const needsDonors = [...requested].some((key) => entries.get(key)?.share === true);
  const sources: BakeSource[] = [];
  for (const [key, entry] of entries) {
    if (!requested.has(key) && !(needsDonors && entry.share)) continue;
    const requestedFile = files.find((file) => NAME_PATTERN.exec(basename(file))?.[1] === key);
    const file = requestedFile ?? join(SOURCE_DIR, `meshy-${key}.glb`);
    if (!existsSync(file)) continue;
    sources.push({ key, bytes: new Uint8Array(await Bun.file(file).arrayBuffer()), clips: entry.clips, share: entry.share });
  }
  const baked = await bakeClipLibrary(sources);
  for (const key of requested) {
    const clips = baked.get(key);
    if (!clips) continue;
    const summary = [...clips].map(([role, clip]) => (clip.retargetedFrom ? `${role}<${clip.retargetedFrom}` : role)).join(' ');
    console.log(`${key}: baked ${clips.size} clips (${summary})`);
  }
  return baked;
}

/** Role order of the written animations: DEFAULT_CLIPS order, then extra roles. */
function orderedClips(clips: ReadonlyMap<string, BakedClip>): Array<{ role: string; clip: BakedClip }> {
  const order = Object.keys(DEFAULT_CLIPS);
  return [...clips]
    .sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map(([role, clip]) => ({ role, clip }));
}

interface Options {
  manifestOnly: boolean;
  keepNormal: boolean;
  normalSize: number;
  files: string[];
}

function parseArgs(argv: string[]): Options {
  const options: Options = { manifestOnly: false, keepNormal: true, normalSize: 1024, files: [] };
  for (const arg of argv) {
    if (arg === '--manifest-only') {
      options.manifestOnly = true;
    } else if (arg.startsWith('--normal-size=')) {
      options.normalSize = Math.max(256, Number(arg.slice('--normal-size='.length)) || 1024);
    } else if (arg.startsWith('--keep-normal=')) {
      options.keepNormal = arg.slice('--keep-normal='.length) !== 'false';
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}`);
    } else {
      options.files.push(resolve(process.cwd(), arg));
    }
  }
  if (options.files.length === 0 && !options.manifestOnly && existsSync(SOURCE_DIR)) {
    options.files = readdirSync(SOURCE_DIR)
      .filter((name) => NAME_PATTERN.test(name))
      .map((name) => join(SOURCE_DIR, name));
  }
  return options;
}

/**
 * Removes texture slots the cel shader never samples (prune then drops the
 * images) and names the remaining images by slot so later steps can target
 * them ("ff-basecolor", "ff-normal").
 */
function stripUnusedTextures(parts: GlbParts, keepNormal: boolean): void {
  const materials = parts.json.materials;
  if (!Array.isArray(materials)) return;
  const textures = (parts.json.textures ?? []) as Array<{ source?: number }>;
  const images = (parts.json.images ?? []) as Array<{ name?: string }>;
  const nameImage = (slot: unknown, name: string): void => {
    const index = (slot as { index?: number } | undefined)?.index;
    const source = index === undefined ? undefined : textures[index]?.source;
    const image = source === undefined ? undefined : images[source];
    if (image) image.name = name;
  };
  for (const material of materials as Record<string, unknown>[]) {
    nameImage((material.pbrMetallicRoughness as Record<string, unknown> | undefined)?.baseColorTexture, 'ff-basecolor');
    nameImage(material.normalTexture, 'ff-normal');
    const pbr = material.pbrMetallicRoughness as Record<string, unknown> | undefined;
    if (pbr) {
      delete pbr.metallicRoughnessTexture;
      pbr.metallicFactor = 0;
      pbr.roughnessFactor = 1;
    }
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    if (!keepNormal) delete material.normalTexture;
  }
}

const IMAGE_EXTENSIONS: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/**
 * Moves every embedded image into a sidecar file next to the GLB (image.uri)
 * and compacts the binary chunk, so a client can load the mesh, skeleton and
 * clips without the textures and fetch them only when the model is shown.
 */
function externalizeImages(parts: GlbParts, key: string): Array<[string, Uint8Array]> {
  const json = parts.json as {
    images?: Array<{ name?: string; uri?: string; bufferView?: number; mimeType?: string }>;
    bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number }>;
    accessors?: Array<{ bufferView?: number; sparse?: { indices: { bufferView: number }; values: { bufferView: number } } }>;
    buffers?: Array<{ byteLength: number }>;
  };
  const bin = parts.bin;
  const views = json.bufferViews ?? [];
  if (!bin || !json.images) return [];
  const files: Array<[string, Uint8Array]> = [];
  const removed = new Set<number>();
  json.images.forEach((image, index) => {
    if (image.bufferView === undefined) return;
    const view = views[image.bufferView];
    if (!view) return;
    const offset = view.byteOffset ?? 0;
    const slot = (image.name ?? `image-${index}`).replace(/^ff-/, '');
    const fileName = `${key}-${slot}.${IMAGE_EXTENSIONS[image.mimeType ?? ''] ?? 'bin'}`;
    files.push([fileName, bin.slice(offset, offset + view.byteLength)]);
    removed.add(image.bufferView);
    delete image.bufferView;
    image.uri = fileName;
  });
  const remap = new Map<number, number>();
  const kept: typeof views = [];
  const chunks: Uint8Array[] = [];
  let length = 0;
  views.forEach((view, index) => {
    if (removed.has(index)) return;
    const padding = (4 - (length % 4)) % 4;
    if (padding) {
      chunks.push(new Uint8Array(padding));
      length += padding;
    }
    const offset = view.byteOffset ?? 0;
    chunks.push(bin.subarray(offset, offset + view.byteLength));
    remap.set(index, kept.length);
    kept.push({ ...view, buffer: 0, byteOffset: length });
    length += view.byteLength;
  });
  for (const accessor of json.accessors ?? []) {
    if (accessor.bufferView !== undefined) accessor.bufferView = remap.get(accessor.bufferView) ?? accessor.bufferView;
    if (accessor.sparse) {
      accessor.sparse.indices.bufferView = remap.get(accessor.sparse.indices.bufferView) ?? accessor.sparse.indices.bufferView;
      accessor.sparse.values.bufferView = remap.get(accessor.sparse.values.bufferView) ?? accessor.sparse.values.bufferView;
    }
  }
  json.bufferViews = kept;
  const packed = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    packed.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  if (json.buffers?.[0]) json.buffers[0].byteLength = length;
  parts.bin = packed;
  return files;
}

async function run(args: string[]): Promise<void> {
  const proc = Bun.spawn(['bunx', CLI, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  if (code !== 0) throw new Error(`gltf-transform ${args[0]} failed (${code}):\n${stderr}`);
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function optimize(file: string, options: Options, workDir: string, baked: ReadonlyMap<string, ReadonlyMap<string, BakedClip>>): Promise<void> {
  const name = basename(file);
  const match = NAME_PATTERN.exec(name);
  if (!match?.[1]) throw new Error(`${name}: expected meshy-<name>.glb (e.g. meshy-alpine-heavy.glb)`);
  const key = match[1];
  const outName = `${key}.glb`;
  const outFile = join(OUTPUT_DIR, outName);
  const stem = join(workDir, outName.replace('.glb', ''));

  let parts = readGlb(new Uint8Array(await Bun.file(file).arrayBuffer()));
  if (VEHICLE_PART_SPECS[key]) {
    // Static vehicles: re-oriented to game space and split into moving parts
    // (hull, turret, barrel, wheels; see vehicle-parts.ts).
    const split = splitVehicle(key, parts);
    parts = split.parts;
    console.log(`${name}: ${split.report.parts.map((part) => part.name).join(' ')}`);
  }
  if (CLEAN_ISLANDS.has(key)) {
    const report = removeSmallIslands(parts.json as GlbJson, parts.bin);
    console.log(`${name}: removed ${report.removedIslands} stray islands (${report.removedTriangles} tris), kept ${report.keptTriangles}`);
  }
  const clips = baked.get(key);
  if (clips) writeBakedAnimations(parts, orderedClips(clips));
  stripUnusedTextures(parts, options.keepNormal);
  await Bun.write(`${stem}-0.glb`, writeGlb(parts));

  await run(['prune', `${stem}-0.glb`, `${stem}-1.glb`]);
  const size = `${options.normalSize}`;
  await run(['resize', `${stem}-1.glb`, `${stem}-2.glb`, '--pattern', 'ff-normal', '--width', size, '--height', size]);
  await run(['webp', `${stem}-2.glb`, `${stem}-2b.glb`, '--slots', 'baseColorTexture', '--quality', `${BASE_QUALITY}`, '--effort', '100']);
  await run(['webp', `${stem}-2b.glb`, `${stem}-3.glb`, '--slots', 'normalTexture', '--quality', `${NORMAL_QUALITY}`, '--effort', '100']);
  await run(['resample', `${stem}-3.glb`, `${stem}-4.glb`]);
  await run(['dedup', `${stem}-4.glb`, `${stem}-5.glb`]);
  await run(['prune', `${stem}-5.glb`, `${stem}-6.glb`]);
  const final = readGlb(new Uint8Array(await Bun.file(`${stem}-6.glb`).arrayBuffer()));
  const sidecars = externalizeImages(final, key);
  for (const [fileName, bytes] of sidecars) await Bun.write(join(OUTPUT_DIR, fileName), bytes);
  await Bun.write(outFile, writeGlb(final));

  const before = statSync(file).size;
  const after = statSync(outFile).size + sidecars.reduce((sum, [, bytes]) => sum + bytes.byteLength, 0);
  console.log(`${name} -> public/models/${outName} + ${sidecars.length} textures  ${megabytes(before)} -> ${megabytes(after)}`);
}

const options = parseArgs(process.argv.slice(2));
if (options.files.length === 0 && !options.manifestOnly) console.log(`No meshy-<name>.glb files in ${SOURCE_DIR}`);
mkdirSync(OUTPUT_DIR, { recursive: true });
const workDir = mkdtempSync(join(tmpdir(), 'ff-models-'));
try {
  const baked = await bakeRequested(options.files);
  for (const file of options.files) await optimize(file, options, workDir, baked);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
await writeManifest();

/** Lists every optimised model so the client never probes for missing files. */
async function writeManifest(): Promise<void> {
  const models: Record<string, { file: string; bytes: number; textures: Record<string, string> }> = {};
  const names = readdirSync(OUTPUT_DIR).sort();
  for (const name of names) {
    const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.glb$/.exec(name);
    if (!match?.[1]) continue;
    const key = match[1];
    const textures: Record<string, string> = {};
    for (const slot of ['basecolor', 'normal']) {
      const sidecar = names.find((file) => file.startsWith(`${key}-${slot}.`));
      if (sidecar) textures[slot] = sidecar;
    }
    const bytes = [name, ...Object.values(textures)].reduce((sum, file) => sum + statSync(join(OUTPUT_DIR, file)).size, 0);
    models[key] = { file: name, bytes, textures };
  }
  await Bun.write(join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify({ version: 1, models }, null, 2)}\n`);
  console.log(`models/manifest.json: ${Object.keys(models).join(', ') || '(empty)'}`);
}
