/** Real WebGL2 comparison against the last painted-surface implementation. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(process.env.FF_QA_OUTPUT || '/tmp/frost-materials');
const base = process.env.FF_QA_URL || 'http://127.0.0.1:5173';
const baselineRef = '022fb93349f301c21f92c797c3ee4738d8231418';
const source = execFileSync('git', ['show', `${baselineRef}:apps/client/src/shaders/detail.ts`], { encoding: 'utf8' });
const baseline = source.match(/export const DETAIL_FRAGMENT_GLSL = \/\* glsl \*\/ `([\s\S]*?)`;/)?.[1];
assert.ok(baseline, 'baseline painted shader must exist');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-proxy-server', '--disable-dev-shm-usage', '--disable-gpu-watchdog', ...(process.env.FF_QA_SOFTWARE === '1' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(base + '/material-equivalence', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><link rel="icon" href="/favicon.svg"><canvas id="c" width="320" height="240"></canvas>' }));
  await page.goto(base + '/material-equivalence');
  const cases = await page.evaluate(async baseline => {
    const { Engine } = await import('/node_modules/.vite/deps/@babylonjs_core_Engines_engine.js');
    const { Scene } = await import('/node_modules/.vite/deps/@babylonjs_core_scene.js');
    const { FreeCamera } = await import('/node_modules/.vite/deps/@babylonjs_core_Cameras_freeCamera.js');
    const { Vector3 } = await import('/node_modules/.vite/deps/@babylonjs_core_Maths_math.js');
    const { RawTexture } = await import('/node_modules/.vite/deps/@babylonjs_core_Materials_Textures_rawTexture.js');
    const { GeometryBatch } = await import('/src/rendering/map/geometry.ts');
    const { createToonMaterial, SUN_DIRECTION } = await import('/src/rendering/materials.ts');
    const { getLookContext, registerLookMaterial, applyLookToAll } = await import('/src/rendering/look-state.ts');
    const { DETAIL_FRAGMENT_GLSL } = await import('/src/shaders/detail.ts');
    const engine = new Engine(document.querySelector('#c'), false, { preserveDrawingBuffer: true });
    const scene = new Scene(engine), camera = new FreeCamera('comparison', new Vector3(7, 7, 10), scene);
    camera.setTarget(Vector3.Zero());
    const current = createToonMaterial(scene, 'current'), previous = current.clone('previous');
    const shader = current.shaderPath;
    if (!shader.fragmentSource.includes(DETAIL_FRAGMENT_GLSL)) throw new Error('detail shader was not replaced');
    previous.shaderPath = { ...shader, fragmentSource: shader.fragmentSource.replace(DETAIL_FRAGMENT_GLSL, baseline) };
    registerLookMaterial(scene, previous, 'toon', SUN_DIRECTION);
    const context = getLookContext(scene, SUN_DIRECTION);
    // Distinct deterministic packed channels expose wrong family/channel skips.
    for (const [i, name] of ['detailA', 'detailB', 'detailC', 'detailColor'].entries()) {
      const data = Uint8Array.from({ length: 16 * 16 * 4 }, (_, n) => 48 + (n * 37 + i * 71) % 160);
      context.textures[name] = RawTexture.CreateRGBATexture(data, 16, 16, scene, true, false);
    }
    const batch = new GeometryBatch(); batch.jitter = 0;
    const kinds = ['wood', 'shingle', 'stone', 'snow', 'sand', 'grass', 'rock', 'metal', 'cloth', 'foliage', 'plaster', 'ice', 'plain', 'water', 'water', 'water'];
    for (const [i, kind] of kinds.entries()) batch.box((i % 4 - 1.5) * 2, .1, (Math.floor(i / 4) - 1.5) * 2, 1.5, 1.5, 1.5,
      i % 3 === 0 ? [.84, .85, .87] : i % 3 === 1 ? [.42, .27, .13] : [.20, .45, .28], kind);
    const mesh = batch.toMesh(scene, 'surface-grid', current);
    await current.forceCompilationAsync(mesh); await previous.forceCompilationAsync(mesh);
    const cases = [];
    for (const mode of [1, 2]) for (const [name, distance, paint] of [['near', 0, .82], ['unpainted', 0, 0], ['fading', 95, .82], ['neutral-distance', 220, .82]]) {
      context.values.detailParams.set(.24, 45, 170, mode);
      context.values.colorParams.set(paint, .5, 0, 0);
      context.values.cameraPosition.copyFrom(camera.position).addInPlace(new Vector3(0, 0, distance));
      applyLookToAll(scene);
      mesh.material = previous; scene.render(); const a = await engine.readPixels(0, 0, 320, 240);
      mesh.material = current; scene.render(); const b = await engine.readPixels(0, 0, 320, 240);
      let maxError = 0, totalError = 0, changed = 0, paintedPixels = 0;
      const background = [a[0],a[1],a[2]];
      const colours = new Set();
      for (let i = 0; i < a.length; i++) {
        const delta = Math.abs(a[i] - b[i]); maxError = Math.max(maxError, delta); totalError += delta; if (delta) changed++;
        if (i % 4 === 0 && (a[i]!==background[0]||a[i+1]!==background[1]||a[i+2]!==background[2])) paintedPixels++;
        if(i%4===0)colours.add(a[i]*65536+a[i+1]*256+a[i+2]);
      }
      cases.push({ mode, name, maxError, meanError: totalError / a.length, changedChannels: changed, paintedPixels, colours:colours.size });
    }
    scene.dispose(); engine.dispose(); return cases;
  }, baseline);
  const result = { baselineRef, softwareRenderer: process.env.FF_QA_SOFTWARE === '1', cases, errors };
  await writeFile(resolve(output, 'material-equivalence.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  assert.equal(errors.length, 0);
  for (const test of cases) { assert.ok(test.paintedPixels > 5000&&test.colours>32); assert.ok(test.maxError <= 1); assert.ok(test.meanError < .05); }
} finally { await browser.close(); }
