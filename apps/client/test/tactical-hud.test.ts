import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { Scene } from '@babylonjs/core/scene';
import { minimapArtwork } from '../src/rendering/minimap-map';
import { projectPlayerTags, type TagCandidate } from '../src/rendering/player-tags';

test('field map is cached static artwork with real roads, buildings and bridge, without external resources', () => {
  const artwork = minimapArtwork();
  expect(minimapArtwork()).toBe(artwork);
  const svg = decodeURIComponent(artwork.slice(artwork.indexOf(',') + 1));
  expect(svg).toContain('<polyline');
  expect(svg).toContain('<rect');
  expect(svg).not.toContain('http://localhost');
  expect(artwork.length).toBeLessThan(500000);
});

test('nameplates follow drawn heads, preserve real names and team colours, and hide behind walls and the camera', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const camera = new FreeCamera('tags',new Vector3(0,1.5,-5),scene);
  camera.setTarget(new Vector3(0,1.5,5)); scene.activeCamera=camera;
  scene.updateTransformMatrix(true);
  const candidate:TagCandidate = {id:7,name:'GipfelRanger',feet:{x:0,y:0,z:5},height:1.8,friendly:true,local:false};
  try {
    const empty = {raycast:()=>null};
    const visible=projectPlayerTags(scene,empty as never,[candidate]);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.name).toBe('GipfelRanger');
    expect(visible[0]?.friendly).toBe(true);
    expect(visible[0]!.x).toBeCloseTo(50,1);
    expect(projectPlayerTags(scene,{raycast:()=>({distance:3})} as never,[candidate])).toHaveLength(0);
    expect(projectPlayerTags(scene,empty as never,[{...candidate,feet:{x:0,y:0,z:-15}}])).toHaveLength(0);
    expect(projectPlayerTags(scene,empty as never,[{...candidate,feet:{x:0,y:0,z:200}}])).toHaveLength(0);
    expect(projectPlayerTags(scene,empty as never,[{...candidate,friendly:false,name:'Skipper'}])[0]?.friendly).toBe(false);
    expect(projectPlayerTags(scene,empty as never,[{...candidate,friendly:false,cloaked:true}])).toHaveLength(0);
    expect(projectPlayerTags(scene,empty as never,[{...candidate,cloaked:true}])).toHaveLength(1);
    camera.setTarget(new Vector3(3, 1.5, 5));
    expect(projectPlayerTags(scene,empty as never,[candidate])[0]!.x).toBeLessThan(50);
  } finally {scene.dispose();engine.dispose()}
});
