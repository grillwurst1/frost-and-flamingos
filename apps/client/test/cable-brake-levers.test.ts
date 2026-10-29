import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { FJORD_MAP } from '@frost-and-flamingos/shared';
import { CableBrakeLevers } from '../src/rendering/cable-brake-levers';

test('a brake animates its station handle, holds it during the stop and restores the frozen mesh', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const meshes = new Map(FJORD_MAP.routes.cableCar.stations.map(s => {
      const mesh = new Mesh(s.id, scene); mesh.freezeWorldMatrix(); return [s.id, mesh] as const;
    }));
    const levers = new CableBrakeLevers(meshes), count = scene.meshes.length;
    levers.pullNearest(FJORD_MAP.routes.cableCar.stations[1]!.brakeBase, 1000);
    levers.update(1200); expect(meshes.get('mid')!.rotation.x).toBeGreaterThan(1);
    expect(meshes.get('valley')!.rotation.x).toBe(0); expect(meshes.get('mountain')!.rotation.x).toBe(0);
    levers.update(2200); expect(meshes.get('mid')!.rotation.x).toBeGreaterThan(1);
    levers.update(3100); expect(meshes.get('mid')!.rotation.x).toBe(0);
    expect(meshes.get('mid')!.isWorldMatrixFrozen).toBe(true); expect(scene.meshes.length).toBe(count);
    levers.pullNearest(FJORD_MAP.routes.cableCar.stations[0]!.brakeBase, 4000);
    levers.update(7500); expect(meshes.get('valley')!.rotation.x).toBeGreaterThan(1);
    levers.update(7600); expect(meshes.get('valley')!.rotation.x).toBe(0);
    expect(meshes.get('valley')!.isWorldMatrixFrozen).toBe(true);

  } finally { scene.dispose(); engine.dispose(); }
});
