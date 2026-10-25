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
 *         clips; 1-2 MB) with its painted textures as sidecar files
 *         <faction>-<class>-basecolor.webp / -normal.webp referenced by URI,
 *         plus models/manifest.json listing every model and its textures.
 *         The client loads every GLB for its clips (models borrow clips from
 *         each other) but fetches the textures only for models on screen, and
 *         only requests listed files, so missing classes never cause a 404.
 *
 * Steps (all lossless for the skeleton and every animation clip):
 *   1. drop the metallicRoughness texture (the cel shader never reads it),
 *   2. keep the painted base colour at its full 2048² and re-encode it as
 *      WebP q92 (EXT_texture_webp; PSNR ≈ 42 dB vs the Meshy JPEG at a
 *      quarter of the bytes; JPEG q92 is 1.5× larger and noisier),
 *   3. normal map: 1024² (--normal-size), WebP q90 (the cel shader uses it
 *      at a quarter strength, so the full 2048² only costs memory),
 *   4. resample animations (removes redundant keyframes, lossless),
 *   5. dedup + prune unused accessors/images,
 *   6. move the images out of the GLB binary into sidecar files.
 * The heavy lifting runs through the pinned glTF Transform CLI via `bunx`,
 * so no native image toolchain has to live in the workspace dependencies.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const SOURCE_DIR = join(ROOT, 'art-src', 'meshy');
const OUTPUT_DIR = join(ROOT, 'apps', 'client', 'public', 'models');
const CLI = '@gltf-transform/cli@4.5.1';
const BASE_QUALITY = 92;
const NORMAL_QUALITY = 90;
/** meshy-<name>.glb → <name>.glb (soldiers are meshy-<faction>-<class>.glb). */
const NAME_PATTERN = /^meshy-([a-z0-9]+(?:-[a-z0-9]+)*)\.glb$/;

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

interface GlbParts {
  json: Record<string, unknown>;
  bin: Uint8Array | null;
}

function readGlb(bytes: Uint8Array): GlbParts {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file');
  let offset = 12;
  let json: Record<string, unknown> | null = null;
  let bin: Uint8Array | null = null;
  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)) as Record<string, unknown>;
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
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
  const binPadding = bin ? (4 - (bin.byteLength % 4)) % 4 : 0;
  const binLength = bin ? bin.byteLength + binPadding : 0;
  const total = 12 + 8 + jsonBytes.byteLength + (bin ? 8 + binLength : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  if (bin) {
    const binOffset = 20 + jsonBytes.byteLength;
    view.setUint32(binOffset, binLength, true);
    view.setUint32(binOffset + 4, 0x004e4942, true);
    out.set(bin, binOffset + 8);
  }
  return out;
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

async function optimize(file: string, options: Options, workDir: string): Promise<void> {
  const name = basename(file);
  const match = NAME_PATTERN.exec(name);
  if (!match?.[1]) throw new Error(`${name}: expected meshy-<name>.glb (e.g. meshy-alpine-heavy.glb)`);
  const key = match[1];
  const outName = `${key}.glb`;
  const outFile = join(OUTPUT_DIR, outName);
  const stem = join(workDir, outName.replace('.glb', ''));

  const parts = readGlb(new Uint8Array(await Bun.file(file).arrayBuffer()));
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
  for (const file of options.files) await optimize(file, options, workDir);
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
