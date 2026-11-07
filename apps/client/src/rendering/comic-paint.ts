import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

/** One authored paint sheet shared by every outfit; never generated during play. */
const sheets = new WeakMap<Scene, Texture>();
export function comicPaintTexture(scene: Scene): Texture {
  let sheet = sheets.get(scene);
  if (!sheet) {
    sheet = new Texture('/art/tex/comic-surfaces.png', scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
    sheet.name = 'comic-clothing-paint'; sheet.anisotropicFilteringLevel = 4;
    sheet.wrapU = sheet.wrapV = Texture.CLAMP_ADDRESSMODE;
    sheets.set(scene, sheet);
    const owned = sheet;
    scene.onDisposeObservable.addOnce(() => owned.dispose());
  }
  return sheet;
}

/** Semantic labels are assigned before merging, so pigment never leaks onto skin. */
export function tagComicPaint(part: Mesh, head: boolean): void {
  const colors = part.getVerticesData('color');
  const name = part.name;
  const skin = (colors?.[3] ?? 0) > .5;
  let kind = 0;
  if (!skin) {
    if (/cuckoo|clock-pack|wooden/.test(name)) kind = 1;
    else if (/sock|longjohn/.test(name)) kind = 8;
    else if (/ski-(boot|shaft|tongue|cuff)/.test(name)) kind = (colors?.[0] ?? 0) > (colors?.[1] ?? 0) * 1.3 ? 6 : 5;
    else if (/boot|lederhosen|belt|suspender|harness|leather/.test(name)) kind = 5;
    else if (/waistcoat|vest|loden|felt-crown|curled-brim/.test(name)) kind = 4;
    else if (/shirt|sleeve|collar|placket|blouse/.test(name)) kind = 3;
    if (/dial|clock-face|clock-hand|clock-tick|buckle|clasp|button|boot-lace/.test(name)) kind = 0;
    if (head && !/felt-crown|curled-brim/.test(name)) kind = 0;
  }
  const data = new Float32Array(part.getTotalVertices() * 2);
  for (let v = 0; v < data.length; v += 2) data[v] = kind;
  part.setVerticesData('uv3', data, false, 2);
}
