import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Affine, GeometryBatch, type RGB } from './map/geometry';

/** Rounded enamel cabin, panoramic painted glazing, rivets and hanger in a single draw. */
export function buildCableCar(scene: Scene, material: Material): Mesh {
  const b = new GeometryBatch();
  const red: RGB = [0.72, 0.11, 0.15], dark: RGB = [0.19, 0.24, 0.27], white: RGB = [0.97, 0.94, 0.82];
  b.jitter = 0.015;
  b.box(0, 0.15, 0, 3, 0.3, 2.4, dark, 'metal', 0.12);
  b.box(0, 0.75, 0, 2.94, 1.25, 2.34, red, 'metal', 0.18);
  b.box(0, 2.83, 0, 3.1, 0.24, 2.5, red, 'metal', 0.12);
  b.box(0, 1.3, 0, 3, 0.12, 2.42, white, 'metal', 0.03);
  for (const side of [-1, 1]) {
    // Recessed windows and continuous steel frames: no alpha-sorting or extra glass pass.
    b.box(0, 2.04, side * 1.17, 2.77, 1.25, 0.06, [0.35, 0.62, 0.7], 'plain', 0.06);
    b.box(0, 2.38, side * 1.207, 2.6, 0.08, 0.012, [0.69, 0.86, 0.88], 'plain', 0.01);
    b.box(0, 2.02, side * 1.22, 0.07, 1.34, 0.06, dark, 'metal', 0.015);
    b.box(side * 1.47, 2.04, 0, 0.06, 1.25, 2.18, [0.4, 0.66, 0.73], 'plain', 0.04);
    for (const corner of [-1, 1]) b.box(side * 1.43, 2.02, corner * 1.13, 0.11, 1.5, 0.11, white, 'metal', 0.02);
    b.box(side * 1.49, 2.02, 0, 0.08, 1.4, 0.08, dark, 'metal', 0.01);
    b.box(side * 1.49, 0.7, 0.65, 0.035, 1.12, 0.025, dark, 'metal', 0.005);
    b.box(side * 1.515, 1.13, 0.44, 0.05, 0.04, 0.25, white, 'metal', 0.015);
    const star: Array<[number, number]> = Array.from({ length: 10 }, (_, index) => {
      const angle = Math.PI / 2 + index * Math.PI / 5, radius = index % 2 ? 0.17 : 0.36;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });
    b.with(Affine.translation(0, 0.7, side * 1.185).rotateY(side < 0 ? Math.PI : 0), () => {
      for (let i = 0; i < star.length; i++) b.extrude([[0, 0], star[i]!, star[(i + 1) % star.length]!], 0.018, white, 'plain');
    });
    for (let rivet = -3; rivet <= 3; rivet++) {
      b.blob(rivet * 0.4, 0.28, side * 1.19, 0.035, 0.035, 0.022, white, 'metal', { segments: 6, rings: 4 });
    }
  }
  for (const side of [-1, 1]) {
    b.log([side * 0.85, 2.9, 0], [side * 0.85, 4, 0], 0.065, dark, 'metal', { segments: 12 });
    b.box(side * 0.85, 3.95, 0, 0.13, 0.12, 0.7, dark, 'metal', 0.025);
    b.with(Affine.translation(0, 4.16, side * 0.24).rotateZ(Math.PI / 2), () =>
      b.lathe([[0.13, -0.05], [0.17, -0.03], [0.17, 0.03], [0.13, 0.05]], 12, dark, 'metal', { capTop: true, capBottom: true }));
  }
  b.box(0, 3.99, 0, 1.84, 0.1, 0.16, dark, 'metal', 0.025);
  for (const side of [-1, 1]) b.box(side * 0.7, 0.5, 0, 0.7, 0.16, 1.7, [0.46, 0.29, 0.16], 'wood', 0.06);
  const mesh = b.toMesh(scene, 'cable-car-enamel-cabin', material);
  if (!mesh) throw new Error('Cable car geometry is empty.');
  // GeometryBatch defaults to static map chunks; a cabin must follow its moving parent.
  mesh.unfreezeWorldMatrix();
  mesh.doNotSyncBoundingInfo = false;
  return mesh;
}
