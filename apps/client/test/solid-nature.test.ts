import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { Scene } from '@babylonjs/core/scene';
import { FJORD_MAP } from '@frost-and-flamingos/shared';
import { buildSolidNature, FIR_DETAIL_DISTANCE, NATURE_LOD_DISTANCE } from '../src/rendering/map/solid-nature';

test('solid trees and rocks have bounded geometry and simpler solid distance models', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const layer = buildSolidNature(scene, new StandardMaterial('nature', scene), FJORD_MAP.props);
    const near = layer.meshes.filter(m => m.name.startsWith('nature-solid-'));
    const far = layer.meshes.filter(m => m.name.startsWith('nature-far-'));
    const firs = layer.meshes.filter(m => m.name.startsWith('nature-fir-detail-'));
    const triangles = (meshes: typeof near) => meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0);
    console.log('solid nature budget', { meshes: near.length, near: triangles(near), far: triangles(far), firPrototypes: firs.length,
      instances: layer.instances.length, storedTriangles: triangles(layer.meshes) });
    expect(near.length).toBeLessThan(125);
    expect(far.length).toBe(near.length);
    expect(triangles(near)).toBeLessThan(600000);
    expect(triangles(far)).toBeLessThan(triangles(near) * 0.55);
    // Count unique stored buffers including all three fir LODs. The old baked
    // layer stored 864,012 triangles before adding detail to ordinary firs.
    expect(triangles(layer.meshes)).toBeLessThan(390000);
    expect(layer.instances.length).toBe(FJORD_MAP.props.filter(p => p.kind === 'fir').length);
    expect(firs.length).toBeLessThanOrEqual(30);
    for (const source of firs) {
      expect(source.isVisible).toBe(false);
      expect(source.getLODLevels().map(l => l.distanceOrScreenCoverage).sort((a,b) => a-b))
        .toEqual([FIR_DETAIL_DISTANCE,NATURE_LOD_DISTANCE]);
      expect(source.getTotalIndices()/3).toBeGreaterThan(600);
    }
    const camera = new FreeCamera('tree-lod-test', Vector3.Zero(), scene);
    for (const tree of layer.instances) {
      const prop = FJORD_MAP.props.find(p => `nature-fir-${p.id}` === tree.name)!;
      expect(tree.sourceMesh.geometry).toBeDefined();
      expect(tree.isVisible).toBe(true);
      expect(tree.position.asArray()).toEqual([prop.position.x,prop.position.y,prop.position.z]);
      const centre = tree.getBoundingInfo().boundingSphere.centerWorld;
      expect(Math.abs(centre.x-prop.position.x)).toBeLessThan(1);
      expect(Math.abs(centre.z-prop.position.z)).toBeLessThan(1);
      // A shared source still selects detail independently for each location.
      camera.position.copyFrom(centre);camera.getViewMatrix(true);
      expect(tree.getLOD(camera)).toBe(tree.sourceMesh);
      camera.position.x+=100;camera.getViewMatrix(true);
      expect(tree.getLOD(camera).name.startsWith('nature-fir-middle-')).toBe(true);
      camera.position.x+=100;camera.getViewMatrix(true);
      expect(tree.getLOD(camera).name.startsWith('nature-fir-distance-')).toBe(true);
    }
    for (const mesh of near) {
      expect(mesh.getLODLevels()[0]!.distanceOrScreenCoverage).toBe(NATURE_LOD_DISTANCE);
      const p = mesh.getVerticesData('position')!;
      const xs = Array.from(p).filter((_, i) => i % 3 === 0);
      const zs = Array.from(p).filter((_, i) => i % 3 === 2);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.1);
      expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.1);
    }
    for (const tree of FJORD_MAP.destructibles.trees) expect(layer.destructible.has(tree.id)).toBe(true);
  } finally { scene.dispose(); engine.dispose(); }
});
