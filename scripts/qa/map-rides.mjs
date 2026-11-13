/** Actual full-field ride check. FF_NO_BOTS=1 FF_DEV_TOOLS=1 dev stack required.
 * Positions are staged; stationary toys use real F, the moving lift uses dev boarding.
 * Software WebGL2 proves function/visible geometry, not native GPU performance. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=resolve(process.env.FF_QA_OUTPUT||'/tmp/frost-map-rides'),base=process.env.FF_QA_URL||'http://127.0.0.1:5173';
const shared='/@fs'+resolve(import.meta.dirname,'../../packages/shared/src/index.ts');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-proxy-server','--disable-dev-shm-usage','--disable-gpu-watchdog',...(process.env.FF_QA_SOFTWARE==='1'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
const result={status:'running',softwareRenderer:process.env.FF_QA_SOFTWARE==='1',scope:'Actual field, staged starts, real F for stationary rides, real weapons and authoritative launches',errors:[],failedResponses:[],rides:[]};
try {
  const page=await browser.newPage({viewport:{width:400,height:250},locale:'en-US'});page.setDefaultTimeout(180000);
  page.on('pageerror',e=>result.errors.push(e.message));page.on('crash',()=>result.errors.push('PAGE CRASH'));
  page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text())});
  page.on('response',r=>{if(r.status()>=400)result.failedResponses.push({url:r.url(),status:r.status()})});
  await page.addInitScript(()=>{localStorage.setItem('frost-and-flamingos.locale','en');window.__toyEvents=[];window.__toySends=[];window.__toyContextLosses=0;document.addEventListener('webglcontextlost',()=>window.__toyContextLosses++,true)});
  const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:180000,polling:200});
  const frames=async(count=3)=>{const frame=await page.evaluate(()=>window.__frostDebug.scene.getFrameId());await wait(({frame,count})=>window.__frostDebug.scene.getFrameId()>frame+count,{frame,count})};
  await page.goto(base+'/?scene=field&renderer=webgl2&quality=low',{waitUntil:'domcontentloaded'});
  await wait(()=>window.__frostDebug?.currentPhase==='menu'&&window.__frostDebug.network.ready);
  console.log('connected field menu');await page.locator('button.cover-play').focus();await page.keyboard.press('Enter');
  await wait(()=>window.__frostDebug.currentPhase==='playing');
  await wait(()=>window.__frostDebug.localView.root.getChildMeshes().some(m=>m.name==='soldier-modular-detail'));
  await page.evaluate(()=>{const g=window.__frostDebug,original=g.vehicles.handleEvent.bind(g.vehicles);g.vehicles.handleEvent=(event,...args)=>{
    if(event.actorId===g.localId&&(event.eventType==='VEHICLE_SEAT'||event.eventType==='WEAPON_FIRED')){if(window.__toyEvents.length>=256)window.__toyEvents.shift();window.__toyEvents.push({...event,at:performance.now(),frame:g.scene.getFrameId()})}return original(event,...args)};
    const send=g.network.sendFire.bind(g.network);g.network.sendFire=data=>{if(window.__toySends.length>=64)window.__toySends.shift();window.__toySends.push({...data,at:performance.now(),frame:g.scene.getFrameId(),seat:g.vehicles.localSeat?.vehicleId,feet:{...g.localCharacter.position}});return send(data)};});
  for(const [seedId,kind] of [[110,'tbar'],[120,'coaster_bob'],[130,'hammock']]) {
    const id=seedId;
    assert.ok(id,'an ascending lift bar must exist');
    if(await page.evaluate(()=>!!window.__frostDebug.vehicles.localSeat)){await page.keyboard.press('f');await wait(()=>!window.__frostDebug.vehicles.localSeat)}
    const offset=await page.evaluate(()=>window.__toyEvents.length);
    if(kind==='tbar') {
      const start=await page.evaluate(async module=>{const {FJORD_MAP}=await import(module),r=FJORD_MAP.routes.tBar;return {...r.bottom,yaw:Math.atan2(r.top.x-r.bottom.x,r.top.z-r.bottom.z)}},shared);
      assert.equal(await page.evaluate(async p=>{const g=window.__frostDebug,r=await fetch(`/api/dev/teleport?player=${g.localId}&x=${p.x+1.8}&y=${p.y+.05}&z=${p.z}`,{method:'POST'});return(await r.json()).ok},start),true);
      await frames();
      assert.equal(await page.evaluate(async ({id,start})=>{const g=window.__frostDebug,park=await fetch(`/api/dev/vehicle?vehicle=${id}&action=park&x=${start.x}&z=${start.z}&yaw=${start.yaw}`,{method:'POST'});
        if(!(await park.json()).ok)return false;const r=await fetch(`/api/dev/vehicle?player=${g.localId}&vehicle=${id}&action=enter&value=0`,{method:'POST'});return(await r.json()).ok},{id,start}),true);
    } else {
      const target=await page.evaluate(id=>{const entry=window.__frostDebug.vehicles.debugInfo().vehicles.find(v=>v.id===id);return entry?.position},id);assert.ok(target);
      assert.equal(await page.evaluate(async p=>{const g=window.__frostDebug,r=await fetch(`/api/dev/teleport?player=${g.localId}&x=${p.x+.9}&y=${p.y+.05}&z=${p.z}`,{method:'POST'});return(await r.json()).ok},target),true);
      await wait(p=>{const q=window.__frostDebug.localCharacter.position;return Math.hypot(q.x-p.x-.9,q.z-p.z)<.4},target);
      await frames();
      await page.keyboard.press('f');
    }
    await wait(({id,offset})=>window.__toyEvents.slice(offset).some(e=>e.eventType==='VEHICLE_SEAT'&&e.targetId===id&&e.paramValue>0),{id,offset});
    if(kind!=='hammock'){
      await page.locator('canvas').first().dispatchEvent('mousedown',{button:0});
      await wait(offset=>window.__toyEvents.slice(offset).some(e=>e.eventType==='WEAPON_FIRED'),offset);
      await page.locator('canvas').first().dispatchEvent('mouseup',{button:0});
    }
    await page.screenshot({path:resolve(output,kind+'.png'),timeout:180000});
    if(kind==='tbar'){await page.keyboard.press('f');}
    await wait(({id,offset})=>window.__toyEvents.slice(offset).some(e=>e.eventType==='VEHICLE_SEAT'&&e.targetId===id&&e.paramValue===0),{id,offset});
    const sample=await page.evaluate(({id,kind,offset})=>{const g=window.__frostDebug,entry=g.vehicles.entries.get(id);return{
      id,kind,events:window.__toyEvents.slice(offset),feet:{...g.localCharacter.position},alive:g.latestLocalState?.alive,
      meshes:entry?.view.root.getChildMeshes().map(m=>({name:m.name,vertices:m.getTotalVertices(),triangles:m.getTotalIndices()/3})),
      loaded:entry?.view.loaded,connected:g.network.ready,contextLosses:window.__toyContextLosses,sends:window.__toySends.slice(-16)}}, {id,kind,offset});
    result.rides.push(sample);console.log(JSON.stringify(sample));
    assert.ok(sample.connected);assert.equal(sample.alive,true);assert.equal(sample.contextLosses,0);assert.ok(Object.values(sample.feet).every(Number.isFinite));
    if(kind!=='hammock') {
      const end=sample.events.findIndex(e=>e.eventType==='VEHICLE_SEAT'&&e.targetId===id&&e.paramValue===0);
      assert.ok(sample.events.slice(0,end).some(e=>e.eventType==='WEAPON_FIRED'),'personal weapons must fire before the rider gets out');
    }
  }
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.failedResponses,[]);result.status='passed';
}catch(error){result.status='failed';result.failure=String(error);throw error}
finally{await writeFile(resolve(output,'map-rides.json'),JSON.stringify(result,null,2));await browser.close()}
