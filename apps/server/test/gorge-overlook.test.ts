import { afterAll, beforeAll, expect, test } from 'bun:test';
import { FJORD_MAP, FjordLayout, InputButton, PhysicsWorld, sampleMapHeight } from '@frost-and-flamingos/shared';
let world:PhysicsWorld;
beforeAll(async()=>{world=await PhysicsWorld.create()});
afterAll(()=>world.dispose());

test('the snow overlook is reachable on foot from the village and its rail blocks the cliff edge',()=>{
  const x=FjordLayout.GORGE_OVERLOOK.center.x,z=48;
  const body=world.createCharacter({classId:'allrounder',faction:'alpine',position:{x,y:sampleMapHeight(x,z)+.06,z}});
  try{
    for(let tick=0;tick<260;tick++){
      body.simulate({sequence:tick,buttons:InputButton.Forward,yaw:0,pitch:0,weaponSlot:1});world.step();
    }
    expect(body.position.z).toBeGreaterThan(64);
    expect(body.position.z).toBeLessThan(67);
    expect(body.position.y).toBeGreaterThan(22.8);
    expect(body.position.y).toBeLessThan(23.2);
    expect(sampleMapHeight(x,75)).toBeLessThan(5);
  }finally{world.removeCharacter(body)}
});

test('the relocated chalet rests on its ledge and its upper floor/right balcony remain solid',()=>{
  const chalet=FJORD_MAP.props.find(p=>p.id==='chalet_north')!,layout=chalet.building!;
  expect(chalet.position.x).toBe(FjordLayout.GORGE_CHALET_PAD.center.x);
  expect(layout.balcony!.sides).toContain('right');
  const point=(x:number,z:number)=>({x:chalet.position.x+Math.cos(chalet.rotationY)*x+Math.sin(chalet.rotationY)*z,
    z:chalet.position.z-Math.sin(chalet.rotationY)*x+Math.cos(chalet.rotationY)*z});
  for(const x of [-layout.width/2,layout.width/2])for(const z of [-layout.depth/2,layout.depth/2]){
    const p=point(x,z);expect(sampleMapHeight(p.x,p.z)).toBeGreaterThan(chalet.position.y-.3);
  }
  const upper=chalet.position.y+layout.floors[1]!.elevation;
  for(const p of [point(2,0),point(layout.width/2+.8,0)]) {
    const hit=world.raycast({...p,y:upper+.5},{x:0,y:-1,z:0},1);
    expect(hit).not.toBeNull();expect(hit!.point.y).toBeCloseTo(upper,2);
  }
});

test('the bridge battle clearing stays free of giant firs and preserves the sixty fallable trees',()=>{
  expect(FJORD_MAP.props.filter(p=>p.kind==='fir'&&FjordLayout.inGorgeClearing(p.position.x,p.position.z))).toHaveLength(0);
  expect(FJORD_MAP.destructibles.trees).toHaveLength(60);
  expect(FJORD_MAP.towers).toHaveLength(3);
});

test('the sagging bridge remains walkable from the village to the opposite rim',()=>{
  const body=world.createCharacter({classId:'allrounder',faction:'alpine',position:{x:1,y:18.35,z:47}});
  try{
    for(let tick=0;tick<650;tick++){
      body.simulate({sequence:tick,buttons:InputButton.Forward,yaw:0,pitch:0,weaponSlot:1});world.step();
    }
    expect(body.position.z).toBeGreaterThan(96.5);
    expect(body.position.y).toBeGreaterThan(17.5);
  }finally{world.removeCharacter(body)}
});

test('the northwest waypoint route clears the relocated chalet and square walls on foot',()=>{
  const nodes=[[0,38],[-33,34],[-33,51],[-70,44]].map(([x,z])=>{
    const node=FJORD_MAP.nav.nodes.find(n=>n.position.x===x&&n.position.z===z);
    expect(node).toBeDefined();
    return node!;
  });
  const body=world.createCharacter({classId:'allrounder',faction:'alpine',position:{...nodes[0]!.position,y:nodes[0]!.position.y+.06}});
  try{
    let tick=0;
    for(const node of nodes.slice(1)){
      for(let step=0;step<900&&Math.hypot(node.position.x-body.position.x,node.position.z-body.position.z)>.6;step++){
        body.simulate({sequence:tick++,buttons:InputButton.Forward,
          yaw:Math.atan2(node.position.x-body.position.x,node.position.z-body.position.z),pitch:0,weaponSlot:1});world.step();
      }
      expect(Math.hypot(node.position.x-body.position.x,node.position.z-body.position.z)).toBeLessThan(.65);
      expect(body.position.y).toBeGreaterThan(17.5);
    }
  }finally{world.removeCharacter(body)}
});
