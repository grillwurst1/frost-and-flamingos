/** Real public reference entry + optional isolated mechanics. See scripts/qa/README.md. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output=resolve(process.env.FF_QA_OUTPUT || '/tmp/frost-reference');
const base=process.env.FF_QA_URL || 'http://127.0.0.1:5173';
const mechanics=process.env.FF_QA_REFERENCE_MECHANICS==='1';
const low=mechanics||process.env.FF_QA_REFERENCE_LOW==='1';
const fireCheck=process.env.FF_QA_REFERENCE_FIRE==='1';
const captureOnly=process.env.FF_QA_REFERENCE_CAPTURE_ONLY==='1';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,
  args:['--no-proxy-server','--disable-dev-shm-usage','--disable-gpu-watchdog',...(process.env.FF_QA_SOFTWARE==='1'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
const result={status:'running',softwareRenderer:process.env.FF_QA_SOFTWARE==='1',mechanics,errors:[],failedResponses:[],checkpoints:[]};
try {
  const page=await browser.newPage({viewport:low?{width:800,height:500}:{width:1280,height:800},locale:'en-US'});
  page.setDefaultTimeout(180000);
  page.on('pageerror',e=>{result.errors.push(e.message);console.log('PAGE ERROR '+e.message)});page.on('crash',()=>result.errors.push('PAGE CRASH'));
  page.on('console',m=>{if(m.type()==='error'){result.errors.push(m.text());console.log('CONSOLE ERROR '+m.text())}});
  page.on('response',r=>{if(r.status()>=400)result.failedResponses.push({url:r.url(),status:r.status()})});
  await page.addInitScript(()=>{localStorage.setItem('frost-and-flamingos.locale','en');window.__qaContextLosses=0;document.addEventListener('webglcontextlost',()=>window.__qaContextLosses++,true)});
  const wait=(fn,arg)=>page.waitForFunction(fn,arg,{polling:200,timeout:180000});
  const frames=async(count=3)=>{const f=await page.evaluate(()=>window.__frostDebug.scene.getFrameId());await wait(([f,n])=>window.__frostDebug.scene.getFrameId()>f+n,[f,count])};
  const sample=async label=>{
    const value=await page.evaluate(()=>{const g=window.__frostDebug;const feet=g.localCharacter.position;
      return {phase:g.currentPhase,frame:g.scene.getFrameId(),tick:g.lastSnapshotTick,connected:g.network.ready,feet:{...feet},
        camera:g.cameraRig.camera.position.asArray(),profile:g.localProfile,heroTriangles:g.localView.root.getChildMeshes().find(m=>m.name==='soldier-modular-detail')?.getTotalIndices()/3,contextLosses:window.__qaContextLosses,
        stats:window.__ffMap.stats(),meshes:g.scene.meshes.length,materials:g.scene.materials.length,textures:g.scene.textures.length,
        geometries:g.scene.geometries.length,gpuTextures:g.engine.getLoadedTexturesCache().length,heap:performance.memory?.usedJSHeapSize,
        pendingInputs:g.pendingInputs.length,vehicles:g.vehicles.debugInfo(),names:Array.from(document.querySelectorAll('.player-tag')).map(e=>e.textContent),
        crawlerTriangles:g.scene.meshes.filter(m=>m.name.startsWith('reference-crawler-')).reduce((n,m)=>n+m.getTotalIndices()/3*Math.max(1,m.thinInstanceCount||0),0),
        trackAttribute:g.scene.getMeshByName('reference-crawler-tracks')?.subMeshes[0]?.effect?.getAttributeLocationByName('world0'),
        fire:{burning:g.referenceFire?.burning,flames:g.scene.getMeshByName('reference-chalet-flames')?.thinInstanceCount,puffs:g.scene.getMeshByName('reference-chalet-fire-smoke')?.thinInstanceCount},
        tracks:g.scene.getMeshByName('reference-crawler-tracks')?.thinInstanceCount,smoke:g.scene.getMeshByName('reference-chimney-smoke')?.thinInstanceCount};});
    assert.equal(value.connected,true);assert.equal(value.contextLosses,0);assert.ok(Object.values(value.feet).every(Number.isFinite));
    assert.ok(value.pendingInputs<=180);assert.equal(value.tracks,80);assert.equal(value.smoke,8);
    result.checkpoints.push({label,...value});console.log(JSON.stringify({label,...value}));return value;
  };
  await page.goto(base+'/?scene=reference&renderer=webgl2&quality='+(low?'low':'medium'),{waitUntil:'domcontentloaded'});
  await wait(()=>window.__frostDebug?.currentPhase==='menu'&&window.__frostDebug.network?.ready);console.log('connected reference menu');
  assert.match(await page.locator('.menu-ticket-chip').first().innerText(),/Gletscherpass/i);
  console.log('buttons '+JSON.stringify(await page.locator('button').allTextContents()));
  await page.locator('button.cover-play').focus();await page.keyboard.press('Enter');console.log('play pressed '+await page.evaluate(()=>window.__frostDebug.currentPhase));
  await wait(()=>window.__frostDebug?.currentPhase==='playing');console.log('playing');
  await wait(()=>window.__frostDebug.localView.root.getChildMeshes().some(m=>m.name==='soldier-modular-detail'));
  console.log('detailed model loaded');await frames();const first=await sample('public-entry');assert.ok(Math.abs(first.feet.x-40)<.2&&Math.abs(first.feet.z-66)<.2);
  if(fireCheck)assert.equal(first.fire.burning,true,'late join must receive the active fire');
  await page.screenshot({path:resolve(output,'reference-scene.png'),timeout:180000});
  if(!captureOnly) {
  await page.setViewportSize({width:800,height:500});await page.evaluate(()=>window.__frostDebug.setVisualQuality('low'));await frames(2);
  await page.keyboard.down('w');try {await wait(p=>{const a=window.__frostDebug.localCharacter.position;return Math.hypot(a.x-p.x,a.z-p.z)>.15},first.feet)}finally{await page.keyboard.up('w')}
  const walked=await page.evaluate(()=>({...window.__frostDebug.localCharacter.position}));assert.ok(Math.hypot(walked.x-first.feet.x,walked.z-first.feet.z)>.15);
  await page.keyboard.down('Space');try {await wait(()=>!window.__frostDebug.localCharacter.grounded)}finally{await page.keyboard.up('Space')}
  await frames(2);
  await sample('walk-and-jump');
  const stage=async(params)=>{const id=await page.evaluate(()=>window.__frostDebug.localId);const response=await page.request.post(base+'/api/dev/teleport?scene=reference&player='+id+'&'+new URLSearchParams(params));assert.equal(response.status(),200);assert.equal((await response.json()).ok,true)};
  if(fireCheck) {
    const spot=await page.evaluate(()=>{const g=window.__frostDebug,matrices=g.scene.getMeshByName('reference-chalet-flames').thinInstanceGetWorldMatrices();
      const target=matrices[3].getTranslation(),other=matrices[4].getTranslation(),dx=other.x-target.x,dz=other.z-target.z,length=Math.hypot(dx,dz);
      const x=target.x-dz/length*3,z=target.z+dx/length*3;
      const ground=g.physics.raycast({x,y:150,z},{x:0,y:-1,z:0},200).point.y;
      return {x,z,y:ground+.06,target:{x:target.x,y:target.y,z:target.z}};});
    await stage({x:String(spot.x),z:String(spot.z),y:String(spot.y)});await frames(2);
    await page.keyboard.press('3');
    await page.evaluate(target=>{const g=window.__frostDebug,p=g.localCharacter.position;
      const dx=target.x-p.x,dz=target.z-p.z,dy=target.y-(p.y+g.localCharacter.eyeHeight);
      g.cameraRig.resetAngles(Math.atan2(dx,dz),Math.atan2(dy,Math.hypot(dx,dz)));g.cameraRig.snapToPlayer(g.localView.root.getAbsolutePosition().clone().set(p.x,p.y,p.z));},spot.target);
    await frames(3);const before=await sample('chalet-burning');assert.equal(before.fire.burning,true);
    assert.equal(before.fire.flames,5);assert.equal(before.fire.puffs,15);
    await page.screenshot({path:resolve(output,'reference-fire-before.png'),timeout:180000});
    await page.mouse.down();try {await wait(()=>window.__frostDebug.referenceFire.burning===false)}finally{await page.mouse.up()}
    await frames(2);const after=await sample('chalet-extinguished');assert.equal(after.fire.burning,false);
    await page.screenshot({path:resolve(output,'reference-fire-after.png'),timeout:180000});
  }
  if(mechanics) {

    await stage({x:'1',z:'71.5',y:'16.98'});await frames();
    await wait(()=>window.__frostDebug.snapshotHistory.at(-1).snapshot.conquest.towers[1].owner==='alpine');
    await sample('bridge-captured');await page.screenshot({path:resolve(output,'reference-bridge.png'),timeout:180000});
    await stage({x:'19',z:'103.2',y:'18.5'});await frames();
    await page.keyboard.down('f');await wait(()=>window.__frostDebug.vehicles.localSeat?.vehicleId===201);await page.keyboard.up('f');
    await page.evaluate(()=>{const g=window.__frostDebug;window.__qaCannonShots=0;const fire=g.vehicles.localShot.bind(g.vehicles);g.vehicles.localShot=(...a)=>{window.__qaCannonShots++;return fire(...a)}});
    const before=await sample('tank-boarded');assert.equal(before.vehicles.seat.driver,true);assert.ok(before.trackAttribute>=0,'track matrices must be active in the actual GPU shader');await page.keyboard.down('w');await page.mouse.down();
    const deadline=Date.now()+60000;
    while(Date.now()<deadline){await page.waitForTimeout(10000);await sample('drive-fire')}
    await page.mouse.up();await page.keyboard.up('w');await frames();
    const after=await sample('tank-driven');assert.ok(await page.evaluate(()=>window.__qaCannonShots)>=2);
    const a=before.vehicles.vehicles.find(v=>v.id===201),b=after.vehicles.vehicles.find(v=>v.id===201);
    assert.ok(Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)>.5);
    const warm=result.checkpoints.filter(p=>p.label==='drive-fire').at(-3);
    result.steadyResources={meshes:after.meshes-warm.meshes,materials:after.materials-warm.materials,textures:after.textures-warm.textures,geometries:after.geometries-warm.geometries};
    assert.ok(result.steadyResources.meshes<=16&&result.steadyResources.materials<=8&&result.steadyResources.textures<=4);
    await page.screenshot({path:resolve(output,'reference-crawler.png'),timeout:180000});
    await page.keyboard.down('f');await wait(()=>window.__frostDebug.vehicles.localSeat===null);await page.keyboard.up('f');await sample('tank-exited');
  }
  {
    await page.evaluate(()=>document.exitPointerLock());await wait(()=>window.__frostDebug.currentPhase==='paused');
    await page.getByRole('button',{name:/Wardrobe & Armory/i}).focus();await page.keyboard.press('Enter');
    await wait(()=>window.__frostDebug.previewView?.root.getChildMeshes().some(m=>m.name==='soldier-modular-detail'));
    await frames(5);
    const projection=await page.evaluate(()=>{const g=window.__frostDebug,p=g.previewView.root.getAbsolutePosition(),m=g.scene.getTransformMatrix().m;
      const x=p.x,y=p.y+1,z=p.z,w=m[3]*x+m[7]*y+m[11]*z+m[15];
      return {x:((m[0]*x+m[4]*y+m[8]*z+m[12])/w*.5+.5)*innerWidth,
        y:(.5-(m[1]*x+m[5]*y+m[9]*z+m[13])/w*.5)*innerHeight,w,
        visible:g.previewView.root.isEnabled(),wardrobeOpen:g.wardrobeIsOpen,deathAt:g.deathAt};});
    assert.ok(projection.visible&&projection.wardrobeOpen&&projection.w>0);assert.ok(projection.x>0&&projection.x<400);
    result.wardrobeProjection=projection;
    await page.screenshot({path:resolve(output,'reference-ranger.png'),timeout:180000});
    if(process.env.FF_QA_REFERENCE_CLOSE==='1') {
      await page.setViewportSize({width:1280,height:800});await page.evaluate(()=>window.__frostDebug.setVisualQuality('medium'));await frames(2);
      await page.evaluate(()=>{const g=window.__frostDebug,p=g.previewView.root.getAbsolutePosition(),a=g.cameraRig.previewAngle;
        g.setPreviewFacing(.18);const position=p.clone();position.set(p.x+Math.sin(a)*2.7,p.y+1.45,p.z+Math.cos(a)*2.7);
        const target=p.clone();target.y+=1.35;g.devCamera={position,target};
        document.querySelector('.wardrobe-panel').style.visibility='hidden';});
      await frames(3);await page.screenshot({path:resolve(output,'reference-ranger-close.png'),timeout:180000});
    }
  }
  }
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.failedResponses,[]);result.status='passed';
} catch(error) {result.status='failed';result.failure=String(error);throw error}
finally {await writeFile(resolve(output,'reference-scene.json'),JSON.stringify(result,null,2)+'\n');await browser.close()}
