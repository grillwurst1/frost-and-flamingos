/** Real-browser soak. Requires a running dev stack with FF_NO_BOTS=1 FF_DEV_TOOLS=1.
 * PLAYWRIGHT_MODULE may point to an installed playwright(-core) ESM entry.
 * FF_QA_SECONDS is the sustained driving phase (default 600 real seconds).
 * Software rendering checks stability/resources, not native GPU speed/thermals.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(process.env.FF_QA_OUTPUT || '/tmp/frost-playability');
const base = process.env.FF_QA_URL || 'http://127.0.0.1:5173';
const seconds = Number(process.env.FF_QA_SECONDS || 600);
assert.ok(Number.isFinite(seconds) && seconds >= 60, 'soak must last at least 60 seconds');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-proxy-server', '--disable-dev-shm-usage', '--enable-precise-memory-info',
    '--autoplay-policy=no-user-gesture-required', ...(process.env.FF_QA_SOFTWARE === '1'
      ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-watchdog'] : [])],
});
const result = { status: 'running', scope: 'Real WebGL2 inputs, audio and network; dev endpoints only arrange starting positions.',
  softwareRenderer: process.env.FF_QA_SOFTWARE === '1', requestedDrivingSeconds: seconds,
  errors: [], failedResponses: [], checkpoints: [] };
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 }, locale: 'en-US' });
  page.setDefaultTimeout(180000);
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('crash', () => result.errors.push('PAGE CRASH'));
  page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) result.failedResponses.push({ url: response.url(), status: response.status() }); });
  // Keep numeric IDs, never AudioNode references: the probe cannot retain a graph.
  await page.addInitScript(() => {
    localStorage.setItem('frost-and-flamingos.profile', JSON.stringify({ displayName: 'Stability QA', faction: 'alpine', cosmetics: { classId: 'mascot' } }));
    localStorage.setItem('frost-and-flamingos.locale', 'en');
    const ids = new WeakMap(), connected = new Set(); let serial = 0;
    const connect = AudioNode.prototype.connect, disconnect = AudioNode.prototype.disconnect;
    AudioNode.prototype.connect = function (...args) {
      const value = connect.apply(this, args);
      if (!ids.has(this)) ids.set(this, ++serial);
      connected.add(ids.get(this)); return value;
    };
    AudioNode.prototype.disconnect = function (...args) {
      const value = disconnect.apply(this, args);
      if (args.length === 0) connected.delete(ids.get(this)); return value;
    };
    window.__qaConnectedAudio = () => connected.size;
    window.__qaContextLosses = 0;
    document.addEventListener('webglcontextlost', () => window.__qaContextLosses++, true);
  });
  const wait = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 180000, polling: 200 });
  const activate = async locator => { await locator.focus(); await page.keyboard.press('Enter'); };
  const sample = async label => {
    const data = await page.evaluate(() => {
      const g = window.__frostDebug;
      return { time: performance.now(), phase: g.currentPhase, frame: g.scene.getFrameId(), tick: g.lastSnapshotTick,
        connected: g.network.ready, heap: performance.memory?.usedJSHeapSize,
        meshes: g.scene.meshes.length, materials: g.scene.materials.length, textures: g.scene.textures.length,
        geometries: g.scene.geometries.length, gpuTextures: g.engine.getLoadedTexturesCache().length,
        audioConnections: window.__qaConnectedAudio(), audioState: window.__qaAudio?.ctx?.state,
        shots: window.__qaShots || 0, skills: { ...window.__qaSkills }, contextLosses: window.__qaContextLosses,
        pendingInputs: g.pendingInputs.length, vehicleShots: g.vehicles.shots.length,
        feet: { ...g.localCharacter.position }, seat: g.vehicles.localSeat };
    });
    assert.ok(data.connected, `${label}: network disconnected`);
    assert.equal(data.contextLosses, 0, `${label}: WebGL context loss`);
    assert.ok(Object.values(data.feet).every(Number.isFinite), `${label}: invalid player position`);
    assert.ok(data.pendingInputs <= 180, `${label}: unbounded pending input queue`);
    result.checkpoints.push({ label, ...data });
    console.log(JSON.stringify({ label, ...data }));
    return data;
  };
  await page.goto(base + '/?renderer=webgl2&quality=low', { waitUntil: 'domcontentloaded' });
  await wait(() => window.__frostDebug?.currentPhase === 'menu' && window.__frostDebug.network?.ready);
  console.log('connected menu');
  await activate(page.getByRole('button', { name: /Play Now/i }));
  await wait(() => window.__frostDebug.currentPhase === 'playing');
  await page.evaluate(async () => {
    const g = window.__frostDebug;
    window.__qaAudio = (await import('/src/audio/synth.ts')).audio;
    window.__qaSkills = {}; window.__qaShots = 0;
    const moves = g.mascots.onLocalMotorEvents.bind(g.mascots);
    g.mascots.onLocalMotorEvents = (events, ...args) => {
      for (const event of events) if (event.type === 'move') window.__qaSkills[event.slot] = (window.__qaSkills[event.slot] || 0) + 1;
      return moves(events, ...args);
    };
    const shot = g.vehicles.localShot.bind(g.vehicles);
    g.vehicles.localShot = (...args) => { window.__qaShots++; return shot(...args); };
  });
  assert.equal(await page.evaluate(() => window.__frostDebug.localCharacter.form), 'cow');
  const baseline = await sample('cow-start');
  for (let round = 0; round < 2; round++) {
    for (const [slot, key] of [[1, 'q'], [2, 'e'], [3, 't']]) {
      const count = await page.evaluate(n => window.__qaSkills[n] || 0, slot);
      await page.keyboard.down(key);
      try { await wait(([n, previous]) => (window.__qaSkills[n] || 0) > previous, [slot, count]); }
      finally { await page.keyboard.up(key); }
      const frame = await page.evaluate(() => window.__frostDebug.scene.getFrameId());
      await wait(f => window.__frostDebug.scene.getFrameId() > f + 3, frame);
      await sample(`cow-${round + 1}-${key}`);
    }
  }
  await page.evaluate(async () => {
    const g = window.__frostDebug;
    window.__qaPendingKit = false;
    const event = g.handleGameEvent.bind(g);
    g.handleGameEvent = message => {
      if (message.eventType === 'PROFILE_NOTICE' && message.paramValue === 1) window.__qaPendingKit = true;
      return event(message);
    };
    window.__frostDebug.returnToMenu();
    (await import('/src/state/profile.ts')).setClass('allrounder');
  });
  // A cow that has already used abilities changes combat class at the next
  // respawn, even if its menu is open. Exercise that rule, not a profile bypass.
  await wait(() => window.__qaPendingKit);
  await page.evaluate(() => {
    const p = window.__frostDebug.localCharacter.position;
    window.__ffMap.teleport(p.x, p.z, -20);
  });
  await wait(() => window.__frostDebug.localClass === 'allrounder' && window.__frostDebug.localCharacter.form === null);
  await sample('queued-class-applied-at-respawn');
  await activate(page.getByRole('button', { name: /Play Now/i }));
  await wait(() => window.__frostDebug.currentPhase === 'playing');
  const tank = await page.evaluate(() => window.__frostDebug.vehicles.debugInfo().vehicles.find(v => v.kind === 'fondue_crawler')?.id);
  assert.ok(tank, 'crawler exists');
  await page.evaluate(async id => {
    const g = window.__frostDebug;
    const r = await fetch(`/api/dev/vehicle?player=${g.localId}&vehicle=${id}&action=enter&value=0`, { method: 'POST' });
    if (!(await r.json()).ok) throw new Error('crawler boarding failed');
  }, tank);
  await wait(() => window.__frostDebug.vehicles.localSeat?.driver);
  // The normal spawn road is used, including normal collisions. No invincibility,
  // forced cooldown reset or replacement simulation/render loop is installed.
  const drivingStart = await sample('tank-start');
  await page.locator('canvas').first().dispatchEvent('mousedown', { button: 0 });
  await page.keyboard.down('w');
  try {
    for (let elapsed = 0; elapsed < seconds; elapsed += 30) {
      await page.waitForTimeout(Math.min(30, seconds - elapsed) * 1000);
      const point = await sample(`tank-${Math.min(seconds, elapsed + 30)}s`);
      const previous = result.checkpoints.at(-2);
      assert.ok(point.frame > previous.frame, 'render loop stopped');
      assert.ok(point.tick > previous.tick, 'snapshot stream stopped');
      assert.ok(point.seat?.driver, 'driver left crawler during soak');
      assert.ok(point.audioConnections < 200, 'audio graph grows beyond transient cue budget');
      assert.ok(point.vehicleShots < 64, 'projectiles grow beyond expected local cannon lifetime');
    }
  } finally { await page.keyboard.up('w'); await page.mouse.up(); }
  const drivingEnd = await sample('tank-end');
  assert.ok(drivingEnd.shots - drivingStart.shots >= 6, 'combined driving and real cannon fire occurred');
  assert.ok(Math.hypot(drivingEnd.feet.x - drivingStart.feet.x, drivingEnd.feet.z - drivingStart.feet.z) > 2, 'crawler actually moved');
  result.actualDrivingSeconds = (drivingEnd.time - drivingStart.time) / 1000;
  const steady = result.checkpoints.filter(p => /^tank-\d+s$/.test(p.label) && p.time - drivingStart.time >= 120000);
  if (steady.length >= 4) {
    const start = steady[0], end = steady.at(-1);
    // Allow transient impacts/LOD and lazily warmed assets, but catch a graph,
    // geometry or texture allocated on every shot/frame rather than released.
    for (const key of ['meshes', 'materials', 'geometries', 'textures', 'gpuTextures']) {
      assert.ok(end[key] - start[key] <= 24, `${key} grows during a warmed cannon soak: ${start[key]} -> ${end[key]}`);
    }
    result.steadyResourceDelta = Object.fromEntries(['meshes', 'materials', 'geometries', 'textures', 'gpuTextures', 'audioConnections', 'heap']
      .map(key => [key, end[key] - start[key]]));
  }
  await page.keyboard.down('f');
  try { await wait(() => !window.__frostDebug.vehicles.localSeat); }
  finally { await page.keyboard.up('f'); }
  // Return/pause/deploy cycles must not allocate another world or lose input.
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.keyboard.press('Escape'); await wait(() => window.__frostDebug.currentPhase === 'paused');
    await activate(page.getByRole('button', { name: 'Return to the Fjord', exact: true }));
    await wait(() => window.__frostDebug.currentPhase === 'playing');
    await page.evaluate(() => window.__frostDebug.returnToMenu());
    await activate(page.getByRole('button', { name: /Play Now/i }));
    await wait(() => window.__frostDebug.currentPhase === 'playing');
    await sample(`menu-cycle-${cycle + 1}`);
  }
  // Exercise Chrome freezing/resuming a page without replacing the app clock.
  const cdp = await page.context().newCDPSession(page);
  const beforeFreeze = await sample('before-page-freeze');
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  try { await new Promise(resolve => setTimeout(resolve, 5000)); }
  finally { await cdp.send('Page.setWebLifecycleState', { state: 'active' }); }
  await wait(frame => window.__frostDebug.scene.getFrameId() > frame + 3, beforeFreeze.frame);
  await sample('resumed-page');
  await page.screenshot({ path: resolve(output, 'playability-final.png'), timeout: 180000 });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.failedResponses, []);
  result.totalBrowserSeconds = (result.checkpoints.at(-1).time - baseline.time) / 1000;
  result.status = 'passed';
} catch (error) {
  result.status = 'failed'; result.failure = error.stack || String(error); console.error(result.failure);
  process.exitCode = 1;
} finally {
  await writeFile(resolve(output, 'playability.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, checkpoints: result.checkpoints.length, failure: result.failure }));
  await browser.close();
}
