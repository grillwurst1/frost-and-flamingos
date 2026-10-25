/**
 * Optimises the owner's Meshy image-to-3D characters for the game client.
 *
 *   bun run models                       # every art-src/meshy/meshy-<faction>-<class>.glb
 *   bun run models art-src/meshy/meshy-lagoon-heavy.glb
 *   bun run models --keep-normal=false   # also drop the normal map
 *
 * Input:  untouched Meshy downloads (rigged Mixamo skeleton, PBR material with
 *         2048² baseColor + metallicRoughness + normal JPEGs, a few clips).
 * Output: apps/client/public/models/<faction>-<class>.glb, typically ≈ 2 MB,
 *         plus models/manifest.json listing every optimised model. The client
 *         only requests listed files, so missing classes never cause a 404.
 *
 * Steps (all lossless for the skeleton and every animation clip):
 *   1. drop the metallicRoughness texture (the cel shader never reads it),
 *   2. resize the remaining textures to 1024² (base colour + normal map),
 *   3. re-encode them as JPEG q85,
 *   4. resample animations (removes redundant keyframes, lossless),
 *   5. dedup + prune unused accessors/images.
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
const TEXTURE_SIZE = 1024;
const JPEG_QUALITY = 85;
const NAME_PATTERN = /^meshy-(alpine|lagoon)-([a-z]+)\.glb$/;

interface Options {
  keepNormal: boolean;
  files: string[];
}

function parseArgs(argv: string[]): Options {
  const options: Options = { keepNormal: true, files: [] };
  for (const arg of argv) {
    if (arg.startsWith('--keep-normal=')) {
      options.keepNormal = arg.slice('--keep-normal='.length) !== 'false';
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}`);
    } else {
      options.files.push(resolve(process.cwd(), arg));
    }
  }
  if (options.files.length === 0 && existsSync(SOURCE_DIR)) {
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

/** Removes texture slots the cel shader never samples; prune drops the images. */
function stripUnusedTextures(parts: GlbParts, keepNormal: boolean): void {
  const materials = parts.json.materials;
  if (!Array.isArray(materials)) return;
  for (const material of materials as Record<string, unknown>[]) {
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
  if (!match) throw new Error(`${name}: expected meshy-<alpine|lagoon>-<class>.glb`);
  const outName = `${match[1]}-${match[2]}.glb`;
  const outFile = join(OUTPUT_DIR, outName);
  const stem = join(workDir, outName.replace('.glb', ''));

  const parts = readGlb(new Uint8Array(await Bun.file(file).arrayBuffer()));
  stripUnusedTextures(parts, options.keepNormal);
  await Bun.write(`${stem}-0.glb`, writeGlb(parts));

  await run(['prune', `${stem}-0.glb`, `${stem}-1.glb`]);
  await run(['resize', `${stem}-1.glb`, `${stem}-2.glb`, '--width', `${TEXTURE_SIZE}`, '--height', `${TEXTURE_SIZE}`]);
  await run(['jpeg', `${stem}-2.glb`, `${stem}-3.glb`, '--quality', `${JPEG_QUALITY}`]);
  await run(['resample', `${stem}-3.glb`, `${stem}-4.glb`]);
  await run(['dedup', `${stem}-4.glb`, `${stem}-5.glb`]);
  await run(['prune', `${stem}-5.glb`, outFile]);

  const before = statSync(file).size;
  const after = statSync(outFile).size;
  console.log(`${name} -> public/models/${outName}  ${megabytes(before)} -> ${megabytes(after)}`);
}

const options = parseArgs(process.argv.slice(2));
if (options.files.length === 0) console.log(`No meshy-<faction>-<class>.glb files in ${SOURCE_DIR}`);
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
  const models: Record<string, { file: string; bytes: number }> = {};
  for (const name of readdirSync(OUTPUT_DIR).sort()) {
    const match = /^((?:alpine|lagoon)-[a-z]+)\.glb$/.exec(name);
    if (!match?.[1]) continue;
    models[match[1]] = { file: name, bytes: statSync(join(OUTPUT_DIR, name)).size };
  }
  await Bun.write(join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify({ version: 1, models }, null, 2)}\n`);
  console.log(`models/manifest.json: ${Object.keys(models).join(', ') || '(empty)'}`);
}
