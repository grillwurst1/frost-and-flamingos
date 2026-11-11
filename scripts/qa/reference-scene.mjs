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
const wardrobeOnly=process.env.FF_QA_REFERENCE_WARDROBE_ONLY==='1';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,
  args:['--no-proxy-server','--disable-dev-shm-usage','--disable-gpu-watchdog',...(process.env.FF_QA_SOFTWARE==='1'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
const result={status:'running',entry:process.env.FF_QA_REFERENCE_ROOT==='1'?'default':'reference-query',softwareRenderer:process.env.FF_QA_SOFTWARE==='1',mechanics,errors:[],failedResponses:[],checkpoints:[]};
try {
  const page=await browser.newPage({viewport:process.env.FF_QA_REFERENCE_PROBE==='1'?{width:400,height:300}:low?{width:800,height:500}:{width:1280,height:process.env.FF_QA_REFERENCE_VIDEO==='1'?720:800},locale:'en-US'});
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
        rigs:window.__ffGlb?.views().filter(v=>Math.abs(v.position[0]-feet.x)<.5&&Math.abs(v.position[2]-feet.z)<.5),controls:{locked:g.input?.isLocked,buttons:g.input?.buttons(),slot:g.input?.currentWeaponSlot(),shots:window.__qaHandShots,cannonShots:window.__qaCannonShots,serverCannonShots:window.__qaServerCannonShots,lastShot:window.__qaLastHandShot},camera:g.cameraRig.camera.position.asArray(),profile:g.localProfile,heroTriangles:g.localView.root.getChildMeshes().find(m=>m.name==='soldier-modular-detail')?.getTotalIndices()/3,contextLosses:window.__qaContextLosses,
        stats:window.__ffMap.stats(),meshes:g.scene.meshes.length,materials:g.scene.materials.length,textures:g.scene.textures.length,
        geometries:g.scene.geometries.length,gpuTextures:g.engine.getLoadedTexturesCache().length,heap:performance.memory?.usedJSHeapSize,
        pendingInputs:g.pendingInputs.length,vehicles:g.vehicles.debugInfo(),names:Array.from(document.querySelectorAll('.player-tag')).filter(e=>e.getClientRects().length>0).map(e=>e.textContent),
        crawlerTriangles:g.scene.meshes.filter(m=>m.name.startsWith('reference-crawler-')).reduce((n,m)=>n+m.getTotalIndices()/3*Math.max(1,m.thinInstanceCount||0),0),
        trackAttribute:g.scene.getMeshByName('reference-crawler-tracks')?.subMeshes[0]?.effect?.getAttributeLocationByName('world0'),
        fire:{burning:g.referenceFire?.burning,flames:g.scene.getMeshByName('reference-chalet-flames')?.thinInstanceCount,puffs:g.scene.getMeshByName('reference-chalet-fire-smoke')?.thinInstanceCount},
        firGeometry:g.scene.meshes.filter(m=>m.name.startsWith('nature-fir-')&&m.getClassName()==='Mesh').reduce((n,m)=>n+m.getTotalIndices()/3,0),
        firInstances:g.scene.meshes.filter(m=>m.name.startsWith('nature-fir-')&&m.getClassName()==='InstancedMesh').length,
        firInstanceAttribute:Math.max(-1,...g.scene.meshes.filter(m=>m.name.startsWith('nature-fir-')&&m.getClassName()==='Mesh').map(m=>m.subMeshes[0]?.effect?.getAttributeLocationByName('world0')??-1)),
        fireSmokeAttribute:g.scene.getMeshByName('reference-chalet-fire-smoke')?.subMeshes[0]?.effect?.getAttributeLocationByName('world0'),
        tracks:g.scene.getMeshByName('reference-crawler-tracks')?.thinInstanceCount,smoke:g.scene.getMeshByName('reference-chimney-smoke')?.thinInstanceCount};});
    assert.equal(value.connected,true);assert.equal(value.contextLosses,0);assert.ok(Object.values(value.feet).every(Number.isFinite));
    assert.ok(value.pendingInputs<=180);assert.equal(value.tracks,80);assert.equal(value.smoke,8);
    assert.equal(value.firInstances,17);assert.ok(value.firInstanceAttribute>=0,'shared fir transforms must be active in the actual GPU shader');
    if(value.fire.burning)assert.ok(value.fireSmokeAttribute>=0,'solid smoke transforms must be active in the actual GPU shader');
    result.checkpoints.push({label,...value});console.log(JSON.stringify({label,...value}));return value;
  };
  await page.goto(base+'/?'+(process.env.FF_QA_REFERENCE_ROOT==='1'?'':'scene=reference&')+'renderer=webgl2&quality='+(low?'low':'medium'),{waitUntil:'domcontentloaded'});
  await wait(()=>window.__frostDebug?.currentPhase==='menu'&&window.__frostDebug.network?.ready);console.log('connected reference menu');
  assert.match(await page.locator('.menu-ticket-chip').first().innerText(),/Gletscherpass/i);
  assert.equal(await page.locator('a.reference-entry').getAttribute('href'),'/?scene=field');
  console.log('buttons '+JSON.stringify(await page.locator('button').allTextContents()));
  await page.locator('button.cover-play').focus();await page.keyboard.press('Enter');console.log('play pressed '+await page.evaluate(()=>window.__frostDebug.currentPhase));
  await wait(()=>window.__frostDebug?.currentPhase==='playing');console.log('playing');
  await wait(()=>window.__frostDebug.localView.root.getChildMeshes().some(m=>m.name==='soldier-modular-detail'));
  console.log('detailed model loaded');if(process.env.FF_QA_REFERENCE_VIDEO==='1'){await page.keyboard.press('3');await frames(3)}await frames();const first=await sample('public-entry');assert.ok(Math.abs(first.feet.x)<.2&&Math.abs(first.feet.z+20)<.2);
  if(process.env.FF_QA_REFERENCE_CAST==='1')for(const name of ['RoofSniper77','Senn_Koloss','Skipper','Wuzzi','Angry_Cow_Beta','StumbleBoi'])
    assert.ok(first.names.includes(name),name+' must be labelled in the initial view');
  if(fireCheck)assert.equal(first.fire.burning,true,'late join must receive the active fire');
  await page.screenshot({path:resolve(output,'reference-scene.png'),timeout:180000});
  if(process.env.FF_QA_REFERENCE_SNOW==='1'){
    assert.ok(await page.evaluate(()=>window.__frostDebug.latestLocalState.hp>0),'snow-cannon capture needs a live player');
    await page.keyboard.press('3');await page.mouse.down();try{await frames(1);
    const cloud=await page.evaluate(()=>{const g=window.__frostDebug,m=g.scene.getMeshByName('snow-stream-cloud');return {instances:m?.thinInstanceCount,enabled:m?.isEnabled(),attribute:m?.subMeshes[0]?.effect?.getAttributeLocationByName('world0')}});
    assert.equal(cloud.instances,64);assert.equal(cloud.enabled,true,'a disabled pool is not a visible snow stream');assert.ok(cloud.attribute>=0);result.snowStream=cloud;
    await page.screenshot({path:resolve(output,'reference-snow-stream.png'),timeout:180000});
    assert.ok(await page.evaluate(()=>window.__frostDebug.latestLocalState.hp>0),'player died during snow-stream capture');
    }finally{await page.mouse.up()}
  }
  if(process.env.FF_QA_REFERENCE_POSE==='1'){
    await page.evaluate(()=>{const g=window.__frostDebug,p=g.localView.root.getAbsolutePosition(),position=p.clone().set(p.x+2.8,p.y+1.5,p.z+3.6),target=p.clone();target.y+=1.05;g.devCamera={position,target}});
    await frames(2);await page.screenshot({path:resolve(output,'reference-heavy-pose.png'),timeout:180000});
    // Ordinary slot selection exposes the face for this labelled asset inspection.
    await page.keyboard.press('1');await frames(3);
    await page.evaluate(()=>{const g=window.__frostDebug,p=g.localView.root.getAbsolutePosition(),position=p.clone().set(p.x+.9,p.y+1.65,p.z+1.25),target=p.clone();target.y+=1.65;g.devCamera={position,target}});
    await frames(2);await page.screenshot({path:resolve(output,'reference-heavy-face.png'),timeout:180000});
    await page.evaluate(()=>{window.__frostDebug.devCamera=null});await frames(2);
  }
  if(process.env.FF_QA_REFERENCE_VIEWS==='1') {
    for(const yaw of [-1.35,-1.5]) {
      await page.evaluate(yaw=>{const g=window.__frostDebug,p=g.localCharacter.position;g.cameraRig.resetAngles(yaw,-.30);g.cameraRig.snapToPlayer(g.localView.root.getAbsolutePosition().clone().set(p.x,p.y,p.z));},yaw);
      await frames(2);await page.screenshot({path:resolve(output,'reference-view-'+String(yaw)+'.png'),timeout:180000});
    }
    await page.evaluate(async module=>{const {REFERENCE_SCENE}=await import(module),g=window.__frostDebug,p=g.localCharacter.position;g.cameraRig.resetAngles(REFERENCE_SCENE.view.yaw,REFERENCE_SCENE.view.pitch);g.cameraRig.snapToPlayer(g.localView.root.getAbsolutePosition().clone().set(p.x,p.y,p.z));},'/@fs'+resolve(import.meta.dirname,'../../packages/shared/src/index.ts'));await frames(2);
  }
  if(!captureOnly||wardrobeOnly) {
  if(!wardrobeOnly) {
  if(!await page.evaluate(()=>window.__frostDebug.input.isLocked))await page.locator('canvas.game-canvas').click({position:{x:400,y:250}});
  await wait(()=>window.__frostDebug.input.isLocked);
  await page.setViewportSize({width:800,height:500});await page.evaluate(()=>window.__frostDebug.setVisualQuality('low'));await frames(2);
  await page.keyboard.down('w');try {await wait(p=>{const a=window.__frostDebug.localCharacter.position;return Math.hypot(a.x-p.x,a.z-p.z)>.15},first.feet)}finally{await page.keyboard.up('w')}
  const walked=await page.evaluate(()=>({...window.__frostDebug.localCharacter.position}));assert.ok(Math.hypot(walked.x-first.feet.x,walked.z-first.feet.z)>.15);
  await page.keyboard.down('Space');try {await wait(()=>!window.__frostDebug.localCharacter.grounded)}finally{await page.keyboard.up('Space')}
  await frames(2);
  await sample('walk-and-jump');
  const stage=async(params)=>{const id=await page.evaluate(()=>window.__frostDebug.localId);const response=await page.request.post(base+'/api/dev/teleport?scene=reference&player='+id+'&'+new URLSearchParams(params));assert.equal(response.status(),200);assert.equal((await response.json()).ok,true)};
  if(fireCheck) {
    const spot=await page.evaluate(async module=>{
      const {referenceCastSpawn}=await import(module),pose=referenceCastSpawn(0);
      const g=window.__frostDebug,matrices=g.scene.getMeshByName('reference-chalet-flames').thinInstanceGetWorldMatrices();
      const target=matrices[1].getTranslation();target.y-=.35;
      return {...pose.position,target:{x:target.x,y:target.y,z:target.z}};
    },'/@fs'+resolve(import.meta.dirname,'../../packages/shared/src/index.ts'));
    await stage({x:String(spot.x),z:String(spot.z),y:String(spot.y)});await frames(2);
    await page.keyboard.press('3');
    await page.evaluate(target=>{const g=window.__frostDebug,p=g.localCharacter.position;
      const dx=target.x-p.x,dz=target.z-p.z,dy=target.y-(p.y+1.95);
      g.cameraRig.resetAngles(Math.atan2(dx,dz),Math.atan2(dy,Math.hypot(dx,dz)));g.cameraRig.snapToPlayer(g.localView.root.getAbsolutePosition().clone().set(p.x,p.y,p.z));},spot.target);
    await frames(3);const before=await sample('chalet-burning');assert.equal(before.fire.burning,true);
    assert.equal(before.fire.flames,5);assert.equal(before.fire.puffs,40);
    await page.screenshot({path:resolve(output,'reference-fire-before.png'),timeout:180000});
    await page.evaluate(()=>{const g=window.__frostDebug,send=g.network.sendFire.bind(g.network);window.__qaHandShots=0;g.network.sendFire=(shot)=>{window.__qaHandShots++;window.__qaLastHandShot=shot;return send(shot)}});
    await page.mouse.down();try {await wait(()=>window.__qaHandShots>=2);await sample('snow-cannon-fired');await wait(()=>window.__frostDebug.referenceFire.burning===false)}catch(error){await sample('fire-check-failed');throw error}finally{await page.mouse.up()}
    await frames(2);const after=await sample('chalet-extinguished');assert.equal(after.fire.burning,false);
    await page.screenshot({path:resolve(output,'reference-fire-after.png'),timeout:180000});
  }
  if(mechanics) {

    await stage(await page.evaluate(async module=>{const {arenaHeightAt}=await import(module);return {x:'.7',z:'0',y:String(arenaHeightAt(.7,0)+.06)}},'/@fs'+resolve(import.meta.dirname,'../../packages/shared/src/index.ts')));await frames();
    await wait(()=>window.__frostDebug.snapshotHistory.at(-1).snapshot.conquest.towers[1].owner==='alpine');
    await sample('bridge-captured');await page.screenshot({path:resolve(output,'reference-bridge.png'),timeout:180000});
    const tankPad=await page.evaluate(async module=>{const {REFERENCE_VEHICLES}=await import(module),spawn=REFERENCE_VEHICLES.find(v=>v.id===201).spawn,p=spawn.position;return {x:String(p.x+Math.sin(spawn.rotationY)*3),z:String(p.z+Math.cos(spawn.rotationY)*3),y:String(p.y+.05)}},'/@fs'+resolve(import.meta.dirname,'../../packages/shared/src/index.ts'));
    await stage(tankPad);await frames();
    await page.keyboard.down('f');await wait(()=>window.__frostDebug.vehicles.localSeat?.vehicleId===201);await page.keyboard.up('f');
    if(!await page.evaluate(()=>window.__frostDebug.vehicles.localSeat?.driver)) {
      await page.keyboard.down('c');try{await wait(()=>window.__frostDebug.vehicles.localSeat?.driver===true)}finally{await page.keyboard.up('c')}
    }
    await page.evaluate(()=>{const g=window.__frostDebug;window.__qaCannonShots=0;window.__qaServerCannonShots=0;const handle=g.handleGameEvent.bind(g);g.handleGameEvent=e=>{if(e.eventType==='TANK_CANNON_FIRE'&&e.actorId===g.localId)window.__qaServerCannonShots++;return handle(e)};const fire=g.vehicles.localShot.bind(g.vehicles);g.vehicles.localShot=(...a)=>{window.__qaCannonShots++;return fire(...a)}});
    const before=await sample('tank-boarded');assert.equal(before.vehicles.seat.driver,true);assert.ok(before.trackAttribute>=0,'track matrices must be active in the actual GPU shader');await page.keyboard.down('w');
    const deadline=Date.now()+60000;
    while(Date.now()<deadline){await page.mouse.down();await frames(2);await page.mouse.up();await frames(2);await sample('drive-fire')}
    await page.mouse.up();await page.keyboard.up('w');await frames();
    const after=await sample('tank-driven');assert.ok(await page.evaluate(()=>window.__qaServerCannonShots)>=2,'real authoritative semi-automatic cannon shots must arrive');
    const a=before.vehicles.vehicles.find(v=>v.id===201),b=after.vehicles.vehicles.find(v=>v.id===201);
    assert.ok(Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)>.5);
    const warm=result.checkpoints.filter(p=>p.label==='drive-fire').at(-3);
    result.steadyResources={meshes:after.meshes-warm.meshes,materials:after.materials-warm.materials,textures:after.textures-warm.textures,geometries:after.geometries-warm.geometries};
    assert.ok(result.steadyResources.meshes<=16&&result.steadyResources.materials<=8&&result.steadyResources.textures<=4);
    await page.screenshot({path:resolve(output,'reference-crawler.png'),timeout:180000});
    await page.keyboard.down('f');await wait(()=>window.__frostDebug.vehicles.localSeat===null);await page.keyboard.up('f');await sample('tank-exited');
  }
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
        visible:g.previewView.root.isEnabled(),wardrobeOpen:g.wardrobeIsOpen,deathAt:g.deathAt,
        stage:(()=>{const r=document.querySelector('.wardrobe-stage').getBoundingClientRect();return r.width>0?{left:r.left,right:r.right}:{left:0,right:innerWidth/2}})()};});
    result.wardrobeProjection=projection;
    await page.screenshot({path:resolve(output,'reference-ranger.png'),timeout:180000});
    assert.ok(projection.visible&&projection.wardrobeOpen&&projection.w>0);
    assert.ok(projection.x>projection.stage.left&&projection.x<projection.stage.right,'preview actor must project inside the actual responsive wardrobe stage');
    if(process.env.FF_QA_REFERENCE_CLOSE==='1') {
      await page.setViewportSize({width:1280,height:process.env.FF_QA_REFERENCE_VIDEO==='1'?720:800});await page.evaluate(()=>window.__frostDebug.setVisualQuality('medium'));await frames(2);
      await page.evaluate(()=>{const g=window.__frostDebug,p=g.previewView.root.getAbsolutePosition(),a=g.cameraRig.previewAngle;
        g.setPreviewFacing(.18);const position=p.clone();position.set(p.x+Math.sin(a)*2.7,p.y+1.10,p.z+Math.cos(a)*2.7);
        const target=p.clone();target.y+=.95;g.devCamera={position,target};
        document.querySelector('.wardrobe-screen').style.visibility='hidden';});
      await frames(3);await page.screenshot({path:resolve(output,'reference-ranger-close.png'),timeout:180000});
      await page.evaluate(()=>{const g=window.__frostDebug,p=g.previewView.root.getAbsolutePosition(),a=g.cameraRig.previewAngle;const position=p.clone().set(p.x+Math.sin(a)*1.35,p.y+1.58,p.z+Math.cos(a)*1.35),target=p.clone();target.y+=1.51;g.devCamera={position,target};});
      await frames(3);await page.screenshot({path:resolve(output,'reference-ranger-face.png'),timeout:180000});
      if(process.env.FF_QA_REFERENCE_THREE_QUARTER==='1') {
        await page.evaluate(()=>{const g=window.__frostDebug,p=g.previewView.root.getAbsolutePosition(),a=g.cameraRig.previewAngle;
          g.setPreviewFacing(.85);const position=p.clone().set(p.x+Math.sin(a)*2.7,p.y+1.10,p.z+Math.cos(a)*2.7),target=p.clone();target.y+=.95;g.devCamera={position,target};});
        await frames(3);await page.screenshot({path:resolve(output,'reference-ranger-quarter.png'),timeout:180000});
        await page.evaluate(()=>window.__frostDebug.setPreviewFacing(.18));
      }
      if(process.env.FF_QA_REFERENCE_CANNON_POSE==='1') {
        const previous=await page.evaluate(()=>{const g=window.__frostDebug,p=g.previewView.root.getAbsolutePosition(),a=g.cameraRig.previewAngle,previous=g.previewWeapon;
          g.previewWeapon='snow_cannon';g.setPreviewFacing(2.25);
          const position=p.clone().set(p.x+Math.sin(a)*2.7,p.y+1.1,p.z+Math.cos(a)*2.7),target=p.clone();target.y+=.95;g.devCamera={position,target};return previous;});
        await frames(3);await page.screenshot({path:resolve(output,'reference-ranger-cannon.png'),timeout:180000});
        await page.evaluate(()=>{const g=window.__frostDebug;g.setPreviewFacing(1.45);g.devCamera.position.y=g.previewView.root.getAbsolutePosition().y+1.45});
        await frames(3);await page.screenshot({path:resolve(output,'reference-ranger-cannon-front.png'),timeout:180000});
        await page.evaluate(previous=>{window.__frostDebug.previewWeapon=previous;window.__frostDebug.setPreviewFacing(.18)},previous);
      }
      await page.evaluate(()=>{const g=window.__frostDebug,p=g.previewView.root.getAbsolutePosition(),a=g.cameraRig.previewAngle,position=p.clone().set(p.x+Math.sin(a)*1.1,p.y+.38,p.z+Math.cos(a)*1.1),target=p.clone();target.y+=.29;g.devCamera={position,target}});
      await frames(3);await page.screenshot({path:resolve(output,'reference-ranger-boots.png'),timeout:180000});
    }
  }
  }
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.failedResponses,[]);result.status='passed';
} catch(error) {result.status='failed';result.failure=String(error);throw error}
finally {await writeFile(resolve(output,'reference-scene.json'),JSON.stringify(result,null,2)+'\n');await browser.close()}
