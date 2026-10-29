import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { profileAppearanceKey, SKIN_TONES, HAIR_COLORS, type PlayerProfile } from '@frost-and-flamingos/shared';
import { CharacterView } from '../character';
import { bindWorldTransform, jointName, type PaintedModelAsset, type TorsoDepth } from './library';
import { bodySurfaceRecipe, bodySurfaceRetarget } from './body-surfaces';
import { wristHandSurface } from './hand-surface';
import { sculptedEyes } from './eye-surfaces';
import { nativeWardrobeRecipe, usesNativeRegion } from './native-wardrobe';
import { RIG_JOINTS, type RigJoint } from './rig';

export interface ModularRollBox { joint: RigJoint; corners: readonly Vector3[] }
const rollBoxes = new WeakMap<Mesh, readonly ModularRollBox[]>();
interface CachedBody { data: VertexData; boxes: readonly ModularRollBox[]; torso: TorsoDepth | null }
const torsoFrames = new WeakMap<Mesh, TorsoDepth>();
const bodyCache = new WeakMap<Scene, Map<string, CachedBody>>();
const MAX_CACHED_BODIES = 12;

export function modularHeadFrame(profile: PlayerProfile, asset: PaintedModelAsset, native = false, sharedHead = false): PaintedModelAsset['spec']['head'] {
  const head = asset.spec.head;
  if (native && nativeWardrobeRecipe(profile, asset).head) return head;
  if (native && sharedHead && asset.wardrobeHead) return { ...head, radius: profile.cosmetics.classId === 'heavy' ? .16 : profile.cosmetics.classId === 'infiltrator' ? .125 : .15 };
  return { ...head, radius: head.radius * (profile.cosmetics.classId === 'heavy' ? .80 : .90) };
}

export function modularRollBoxes(mesh: Mesh): readonly ModularRollBox[] { return rollBoxes.get(mesh) ?? []; }
export function modularTorsoFrame(mesh: Mesh): TorsoDepth | null { return torsoFrames.get(mesh) ?? null; }

/** A single skinned draw, with every wardrobe choice represented by geometry/colour. */
export function buildModularBody(scene: Scene, profile: PlayerProfile, asset: PaintedModelAsset,
  source: Mesh, material: ShaderMaterial, native = false, sharedHead = false, sharedBody = false): Mesh {
  const skeleton = source.skeleton;
  if (!skeleton) throw new Error('A modular soldier needs the shared animation skeleton.');
  let cache = bodyCache.get(scene);
  if (!cache) { cache = new Map(); bodyCache.set(scene, cache); }
  const recipe = nativeWardrobeRecipe(profile, native ? asset : { ...asset, wardrobe: undefined });
  const cleanHead = Boolean(native && sharedHead && asset.wardrobeHead && !recipe.head);
  const surfaces = native && sharedBody ? bodySurfaceRecipe(profile, asset) : { arms: false };
  const handSource = native && !recipe.hands ? asset.wardrobeBody?.hands : undefined;
  const key = `${asset.spec.key}:${profileAppearanceKey(profile)}:${native}:${cleanHead}:${surfaces.arms}:${Boolean(handSource)}`;
  const finish = (cached: CachedBody): Mesh => {
    const mesh = new Mesh('soldier-modular-detail', scene);
    cached.data.applyToMesh(mesh, false);
    mesh.parent = source.parent; mesh.skeleton = skeleton; mesh.numBoneInfluencers = 4;
    mesh.material = material; mesh.isPickable = false; mesh.receiveShadows = true;
    rollBoxes.set(mesh, cached.boxes);
    if (cached.torso) torsoFrames.set(mesh, cached.torso);
    return mesh;
  };
  const cached = cache.get(key);
  if (cached) { cache.delete(key); cache.set(key, cached); return finish(cached); }
  const bones = new Map(skeleton.bones.map((bone, index) => [jointName(bone.name), bone.getIndex() ?? index]));
  const bind = (name: string): Vector3 => asset.bindPositions.get(name) ?? Vector3.Zero();
  const weight = (names: readonly string[], amount: number): { indices: number[]; weights: number[] } => {
    const a = bones.get(names[0]!) ?? 0, b = bones.get(names[1] ?? names[0]!) ?? a;
    return { indices: [a, b, 0, 0], weights: [1 - amount, amount, 0, 0] };
  };
  const size = asset.height / 1.88;
  const chest = bind('Spine2');
  let torsoFront = -Infinity, torsoBack = Infinity;
  const measureTorso = (at: Vector3): void => {
    const x = Math.abs(at.x - chest.x), y = Math.abs(at.y - chest.y);
    if (x < .25 * size && y < .12 * size) torsoFront = Math.max(torsoFront, at.z);
    if (x < .08 * size && y < .06 * size) torsoBack = Math.min(torsoBack, at.z);
  };
  const shoulder = Math.abs(bind('LeftArm').x - bind('RightArm').x) / 2;
  const bodyScaleX = shoulder / 0.30;
  const headScale = modularHeadFrame(profile, asset, native, sharedHead).radius / 0.21;
  const anchors = [
    [0.75, bind('Hips').y - 0.12 * size], [0.88, bind('Hips').y],
    [1.03, bind('Spine').y], [1.15, bind('Spine1').y], [1.28, bind('Spine2').y],
    [1.48, bind('Neck').y], [1.66, asset.spec.head.y],
  ] as const;
  const bodyY = (y: number): number => {
    for (let i = 0; i + 1 < anchors.length; i++) {
      const a = anchors[i]!, b = anchors[i + 1]!;
      if (y <= b[0]) return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
    }
    return asset.spec.head.y + (y - 1.66) * headScale;
  };
  const body = (p: Vector3, tag: number, detail = 0) => {
    const y = p.y + 0.88;
    const head = tag === 1;
    const at = new Vector3(-p.x * (head ? headScale : bodyScaleX), head ? asset.spec.head.y + (y - 1.66) * headScale : bodyY(y),
      p.z * (head ? headScale : size) + (head ? asset.spec.head.z : bind('Spine2').z));
    if (head && cleanHead && detail === 3 && profile.cosmetics.hairStyleIndex === 1 && asset.wardrobeHead?.afro) {
      // A small inner cap closes any area hidden by the donor's goggles. The
      // visible silhouette and curls come from the actual artist geometry.
      at.x *= .82; at.y = asset.spec.head.y + (at.y - asset.spec.head.y) * .82;
      at.z = asset.spec.head.z + (at.z - asset.spec.head.z) * .82;
    }
    if (head && cleanHead && detail === 2) {
      // Map the old eye (+.035) and mouth (-.105) landmarks onto the
      // shared sculpt's eyes (+.017) and lips (-.073), in donor model units.
      // Compressing the whole face left beards and pipes above the real mouth.
      const faceScale = headScale * .21 / asset.wardrobeHead!.frame.radius;
      const eyeToMouth = (y - 1.66 + .105) / .14;
      at.y = asset.spec.head.y + (-.073 + .09 * eyeToMouth) * faceScale;
      if (profile.cosmetics.classId === 'heavy') at.x *= 1.10;
      at.z = asset.spec.head.z + p.z * headScale * .86;
    }
    if (head) return { at, ...weight(['Head'], 0) };
    if (tag === 2) {
      at.y = bind('Spine2').y + (y - 1.28) * size;
      return { at, ...weight(['Spine2'], 0) };
    }
    const chain = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck'];
    const levels = [0.88, 1.03, 1.15, 1.28, 1.48];
    for (let i = 0; i + 1 < levels.length; i++) if (y <= levels[i + 1]!) {
      const t = Math.max(0, Math.min(1, (y - levels[i]!) / (levels[i + 1]! - levels[i]!)));
      return { at, ...weight([chain[i]!, chain[i + 1]!], t) };
    }
    return { at, ...weight(['Neck'], 0) };
  };
  const limb = (p: Vector3, side: 'Left' | 'Right', arm: boolean, detail = 0) => {
    const names = arm ? [`${side}Arm`, `${side}ForeArm`, `${side}Hand`]
      : [`${side}UpLeg`, `${side}Leg`, `${side}Foot`];
    const levels = arm ? [0, 0.33, 0.60] : [0, 0.40, 0.75];
    const distance = -p.y;
    const segment = distance < levels[1]! ? 0 : 1;
    const t = (distance - levels[segment]!) / (levels[segment + 1]! - levels[segment]!);
    const a = bind(names[segment]!), b = bind(names[segment + 1]!);
    const direction = b.subtract(a).normalize();
    const right = new Vector3(-1, 0, 0);
    right.subtractInPlace(direction.scale(Vector3.Dot(right, direction)));
    if (right.lengthSquared() < 0.01) right.copyFrom(Vector3.Cross(direction, new Vector3(0, 0, 1)));
    right.normalize();
    const front = Vector3.Cross(right, direction).normalize();
    if (!arm) {
      // Meet the foot's horizontal cross-section continuously. Otherwise a toe/clasp
      // spanning the ankle loses its front.y offset abruptly and folds inside out.
      const u = Math.max(0, Math.min(1, (distance - 0.55) / 0.20));
      const flatten = u * u * (3 - 2 * u);
      const lateral = new Vector3(right.x, 0, right.z).normalize();
      const toe = Vector3.Cross(lateral, new Vector3(0, -1, 0)).normalize();
      right.copyFrom(Vector3.Lerp(right, lateral, flatten).normalize());
      front.copyFrom(Vector3.Lerp(front, toe, flatten).normalize());
    }
    if (arm && detail === 4) {
      const at = b.add(direction.scale((distance - .60) * size)).add(right.scale(p.x * size)).add(front.scale(p.z * size));
      return { at, ...weight([`${side}ForeArm`], 0) };
    }
    let at = Vector3.Lerp(a, b, t).add(right.scale(p.x * size)).add(front.scale(p.z * size));
    let skin;
    if (distance >= levels[2]!) {
      if (arm) {
        const middle = asset.bindPositions.get(`${side}HandMiddle1`);
        const handDirection = middle ? middle.subtract(b).normalize() : direction;
        at = b.add(handDirection.scale((distance - levels[2]!) * size))
          .add(right.scale(p.x * size)).add(front.scale(p.z * size));
      } else {
        // The same sole level across boots, sandals, ski boots and flippers.
        at.y = Math.max(0.001, b.y * (1 - (distance - 0.75) / 0.16));
      }
      skin = weight([names[2]!], 0);
    } else {
      const blend = Math.max(0, Math.min(1, (t - 0.78) / 0.22));
      skin = weight([names[segment]!, names[segment + 1]!], blend);
    }
    return { at, ...skin };
  };

  // Reuse the complete wardrobe's authored parts, then bind them to the
  // existing Mixamo joints. The temporary rigid preview is disposed at once.
  const digits = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const;
  const articulated = (['Left', 'Right'] as const).filter(side =>
    !['hands_mittens', 'hands_boxing'].includes(profile.cosmetics.hands)
    && !(side === 'Right' && profile.cosmetics.hands === 'hands_pirate_hook')
    && digits.every(digit => [1, 2, 3].every(n => bones.has(`${side}Hand${digit}${n}`)
      && asset.bindPositions.has(`${side}Hand${digit}${n}`))));
  const wristHands = new Map((['Left', 'Right'] as const).flatMap(side => {
    if (articulated.includes(side) || ['hands_mittens', 'hands_boxing'].includes(profile.cosmetics.hands)
      || (side === 'Right' && profile.cosmetics.hands === 'hands_pirate_hook')) return [];
    const hand = wristHandSurface(asset, side);
    return hand ? [[side, hand] as const] : [];
  }));
  const handSides = (['Left', 'Right'] as const).filter(side => articulated.includes(side) || wristHands.has(side));
  const sculptedHands = new Set(handSource ? articulated : []);
  const generatedHands = recipe.hands ? [] : handSides.filter(side => !sculptedHands.has(side));
  const template = new CharacterView(scene, new StandardMaterial('wardrobe-build-shadow', scene), profile,
    handSides.map(side => side === 'Left' ? 'left' : 'right'));
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const joints: number[] = [], weights: number[] = [], cavities: number[] = [];
  const headNormals: number[] = [];
  const nativeFlags: number[] = [];
  try {
    for (const mesh of template.root.getChildMeshes(false)) {
      const name = mesh.name;
      if (!(name === 'character-body-mesh' || /^(left|right)-(arm|leg)-mesh$/.test(name))) continue;
      const points = Array.from(mesh.getVerticesData('position')!), paint = Array.from(mesh.getVerticesData('color')!);
      const tags = Array.from(mesh.getVerticesData('uv2') ?? new Float32Array(points.length / 3 * 2));
      const authoredNormals = mesh.getVerticesData('normal')!;
      const tone = Array.from(mesh.getVerticesData('uv') ?? new Float32Array(points.length / 3 * 2));
      let faces = Array.from(mesh.getIndices()!);
      {
        // Bend surfaces, not just their endpoints. Long triangles crossing a knee,
        // elbow or ankle otherwise cut through neighbouring clothing when bound.
        // Shared midpoints retain smooth normals; this runs once per cached outfit.
        const middle = new Map<string, number>();
        const midpoint = (a: number, b: number): number => {
          const key = a < b ? `${a}:${b}` : `${b}:${a}`;
          const cached = middle.get(key);
          if (cached !== undefined) return cached;
          const index = points.length / 3;
          for (let c = 0; c < 3; c++) points.push((points[a * 3 + c]! + points[b * 3 + c]!) / 2);
          for (let c = 0; c < 4; c++) paint.push((paint[a * 4 + c]! + paint[b * 4 + c]!) / 2);
          tags.push(tags[a * 2] ?? 0, tags[a * 2 + 1] ?? 0);
          for (let c = 0; c < 2; c++) tone.push((tone[a * 2 + c]! + tone[b * 2 + c]!) / 2);
          middle.set(key, index);
          return index;
        };
        const refined: number[] = [];
        const split = (a: number, b: number, c: number): void => {
          const ab = Math.abs(points[a * 3 + 1]! - points[b * 3 + 1]!);
          const bc = Math.abs(points[b * 3 + 1]! - points[c * 3 + 1]!);
          const ca = Math.abs(points[c * 3 + 1]! - points[a * 3 + 1]!);
          if (Math.max(ab, bc, ca) <= 0.07) { refined.push(a, b, c); return; }
          if (ab >= bc && ab >= ca) { const m = midpoint(a, b); split(a, m, c); split(m, b, c); }
          else if (bc >= ca) { const m = midpoint(b, c); split(b, m, a); split(m, c, a); }
          else { const m = midpoint(c, a); split(c, m, b); split(m, a, b); }
        };
        for (let i = 0; i < faces.length; i += 3) {
          const a = faces[i]!, b = faces[i + 1]!, c = faces[i + 2]!;
          // Refine spine-bound garments too; heads and rigid packs keep their topology.
          if (name !== 'character-body-mesh' || (tags[a * 2] ?? 0) === 0) split(a, b, c);
          else refined.push(a, b, c);
        }
        faces = refined;
      }
      const visible: number[] = [];
      for (let f = 0; f < faces.length; f += 3) {
        const a = faces[f]!, detail = tags[a * 2 + 1] ?? 0, tag = tags[a * 2] ?? 0;
        let replaced = false;
        if (name === 'character-body-mesh') {
          if (tag === 1) replaced = detail === 4 ? recipe.hat : detail === 0 ? recipe.head || cleanHead : recipe.head;
          else if (tag === 0) replaced = detail === 6 ? recipe.head : detail === 7 ? recipe.legs : recipe.torso;
        } else if (name.includes('arm')) {
          replaced = detail === 3 || detail === 4 ? recipe.hands : recipe.arms || surfaces.arms;
        } else replaced = detail === 2 ? recipe.feet : recipe.legs;
        if (!replaced) visible.push(faces[f]!, faces[f + 1]!, faces[f + 2]!);
      }
      // Compact discarded wardrobe parts; keep neither hidden body vertices nor
      // duplicate full figures in GPU buffers when native surfaces replace them.
      const remap = new Map<number, number>();
      for (const vertex of new Set(visible)) {
        const i = vertex * 3, target = positions.length / 3; remap.set(vertex, target);
        const p = new Vector3(points[i]!, points[i + 1]!, points[i + 2]!);
        const mapped = name === 'character-body-mesh' ? body(p, tags[vertex * 2] ?? 0, tags[vertex * 2 + 1] ?? 0)
          : limb(p, name.startsWith('left') ? 'Left' : 'Right', name.includes('arm'), tags[vertex * 2 + 1] ?? 0);
        positions.push(mapped.at.x, mapped.at.y, mapped.at.z);
        if (name === 'character-body-mesh' && tags[vertex * 2] === 0 && tags[vertex * 2 + 1] === 0)
          measureTorso(mapped.at);
        if (name === 'character-body-mesh' && tags[vertex * 2] === 1)
          headNormals.push(target, -authoredNormals[i]!, authoredNormals[i + 1]!, authoredNormals[i + 2]!);
        joints.push(...mapped.indices); weights.push(...mapped.weights);
        cavities.push(tone[vertex * 2]!, tone[vertex * 2 + 1]!); nativeFlags.push(0, 0);
        const c = vertex * 4; colors.push(paint[c]!, paint[c + 1]!, paint[c + 2]!, paint[c + 3]!);
      }
      for (let i = 0; i < visible.length; i += 3) indices.push(remap.get(visible[i]!)!, remap.get(visible[i + 2]!)!, remap.get(visible[i + 1]!)!);
    }
  } finally { template.dispose(); }
  // Bind genuine phalanges to the rig's existing finger joints. Previously the
  // fist solver animated empty bones while the visible fingers stayed a paddle
  // rigidly attached to Hand. Shared rings bend with the real grip/reload pose.
  const skinHex = SKIN_TONES[profile.cosmetics.skinToneIndex] ?? SKIN_TONES[0];
  const skinRGB = [1, 3, 5].map(i => Number.parseInt(skinHex.slice(i, i + 2), 16) / 255);
  const knuckle = (side: 'Left' | 'Right', digit: string): Vector3 =>
    wristHands.get(side)?.points.get(digit)?.[0] ?? bind(`${side}Hand${digit}1`);
  for (const side of generatedHands) {
    const wrist = bind(`${side}Hand`), index = knuckle(side, 'Index'), pinky = knuckle(side, 'Pinky');
    const knuckles = ['Index', 'Middle', 'Ring', 'Pinky'].map(d => knuckle(side, d))
      .reduce((sum, p) => sum.add(p), Vector3.Zero()).scale(.25);
    const direction = knuckles.subtract(wrist).normalize();
    const across = pinky.subtract(index).normalize(), front = Vector3.Cross(across, direction).normalize();
    const halfWidth = Vector3.Distance(index, pinky) * .62;
    const first = positions.length / 3, sides = 16;
    // Overlap the anatomical forearm instead of meeting two open tubes at a
    // single plane. The rounded palm stays closed when the wrist bends.
    const heel = wrist.subtract(direction.scale(.018 * size));
    for (let ring = 0; ring <= 5; ring++) {
      const t = ring / 5, center = Vector3.Lerp(heel, knuckles, t);
      const width = halfWidth * (.62 + .38 * Math.sin(t * Math.PI / 2));
      for (let col = 0; col <= sides; col++) {
        const angle = col / sides * Math.PI * 2;
        const at = center.add(across.scale(Math.sin(angle) * width)).add(front.scale(Math.cos(angle) * .023 * size));
        positions.push(at.x, at.y, at.z); colors.push(...skinRGB, 1); cavities.push(.04, 0); nativeFlags.push(0, 0);
        const influence = weight([`${side}Hand`], 0); joints.push(...influence.indices); weights.push(...influence.weights);
        if (ring && col) {
          const a = first + (ring - 1) * (sides + 1) + col - 1, b = a + 1, c = first + ring * (sides + 1) + col, d = c - 1;
          indices.push(a, c, b, a, d, c);
        }
      }
    }
    for (const end of [0, 5]) {
      const center = end === 0 ? heel : knuckles, at = positions.length / 3;
      positions.push(center.x, center.y, center.z); colors.push(...skinRGB, 1);
      cavities.push(.04, 0); nativeFlags.push(0, 0);
      const influence = weight([`${side}Hand`], 0);
      joints.push(...influence.indices); weights.push(...influence.weights);
      for (let col = 0; col < sides; col++) {
        const a = first + end * (sides + 1) + col;
        if (end === 0) indices.push(at, a, a + 1);
        else indices.push(at, a + 1, a);
      }
    }
  }
  for (const side of generatedHands) for (const digit of digits) {
    const fixed = wristHands.get(side)?.points.get(digit);
    const names = [1, 2, 3].map(n => fixed ? `${side}Hand` : `${side}Hand${digit}${n}`);
    const centers = fixed ?? names.map(name => bind(name));
    if (!fixed) centers.push(centers[2]!.add(centers[2]!.subtract(centers[1]!).scale(.8)));
    const radius = Math.min(.014 * size, Math.max(.007 * size, Vector3.Distance(centers[0]!, centers[1]!) * .30));
    const first = positions.length / 3, sides = 10, rings = 9;
    for (let ring = 0; ring <= rings; ring++) {
      const along = ring / rings * 3, segment = Math.min(2, Math.floor(along)), t = along - segment;
      const a = centers[segment]!, b = centers[segment + 1]!;
      const direction = b.subtract(a).normalize();
      let across = Vector3.Cross(direction, new Vector3(0, 0, 1));
      if (across.lengthSquared() < .01) across = Vector3.Cross(direction, new Vector3(0, 1, 0));
      across.normalize(); const front = Vector3.Cross(across, direction).normalize();
      const tip = Math.max(0, (ring / rings - .75) / .25);
      const r = radius * (1 - ring / rings * .20) * Math.sqrt(Math.max(.0064, 1 - tip * tip));
      for (let col = 0; col <= sides; col++) {
        const angle = col / sides * Math.PI * 2;
        const at = Vector3.Lerp(a, b, t).add(across.scale(Math.sin(angle) * r)).add(front.scale(Math.cos(angle) * r));
        positions.push(at.x, at.y, at.z); colors.push(...skinRGB, 1);
        const influence = weight([names[segment]!, names[Math.min(2, segment + 1)]!], Math.min(1, t));
        joints.push(...influence.indices); weights.push(...influence.weights);
        cavities.push(.04 + .06 * Math.sin(along * Math.PI) ** 2, 0); nativeFlags.push(0, 0);
        if (ring && col) {
          const aa = first + (ring - 1) * (sides + 1) + col - 1, bb = aa + 1;
          const cc = first + ring * (sides + 1) + col, dd = cc - 1;
          // Armature reflection is already accounted for, unlike template parts.
          indices.push(aa, cc, bb, aa, dd, cc);
        }
      }
    }
    const last = first + rings * (sides + 1);
    for (let n = 1; n < sides - 1; n++) indices.push(last, last + n + 1, last + n);
  }
  if (handSource && sculptedHands.size) {
    const retarget = bodySurfaceRetarget(profile, asset, handSource, bones), remap = new Map<number, number>();
    const add = (old: number): number => {
      const found = remap.get(old); if (found !== undefined) return found;
      const index = positions.length / 3, vertex = retarget.vertex(old); remap.set(old, index);
      positions.push(vertex.position.x, vertex.position.y, vertex.position.z);
      headNormals.push(index, vertex.normal.x, vertex.normal.y, vertex.normal.z);
      colors.push(...skinRGB, 1); cavities.push(handSource.uvs[old * 2]!, 0); nativeFlags.push(0, 0);
      joints.push(...vertex.indices); weights.push(...vertex.weights);
      return index;
    };
    for (let f = 0; f < handSource.indices.length; f += 3) {
      const a = handSource.indices[f]!;
      if (sculptedHands.has(handSource.positions[a * 3]! > 0 ? 'Left' : 'Right'))
        indices.push(add(a), add(handSource.indices[f + 2]!), add(handSource.indices[f + 1]!));
    }
  }
  if (native && asset.wardrobe) {
    const srcP = source.getVerticesData('position')!, srcN = source.getVerticesData('normal')!, srcUV = source.getVerticesData('uv')!;
    const srcJ = source.getVerticesData('matricesIndices')!, srcW = source.getVerticesData('matricesWeights')!, srcI = source.getIndices()!;
    const hair = HAIR_COLORS[profile.cosmetics.hairColorIndex] ?? HAIR_COLORS[0];
    const hairRGB = [1, 3, 5].map(i => Number.parseInt(hair.slice(i, i + 2), 16) / 255);
    const remap = new Map<string, number>(), width = 1 + (.15 - profile.cosmetics.bodyType) * .18;
    const add = (old: number, region: number): number => {
      // Material-region identifiers are categorical: a vertex shared across
      // skin and clothing must split here instead of interpolating its label.
      const key = `${old}:${region}`;
      const found = remap.get(key); if (found !== undefined) return found;
      const index = positions.length / 3; remap.set(key, index);
      const scaleX = region === 3 || region === 6 ? width : 1;
      positions.push(srcP[old * 3]! * scaleX, srcP[old * 3 + 1]!, srcP[old * 3 + 2]!);
      if (region === 3) measureTorso(new Vector3(srcP[old * 3]! * scaleX, srcP[old * 3 + 1]!, srcP[old * 3 + 2]!));
      const n = new Vector3(srcN[old * 3]! / scaleX, srcN[old * 3 + 1]!, srcN[old * 3 + 2]!).normalize();
      headNormals.push(index, n.x, n.y, n.z);
      const pigment = asset.wardrobe!.pigment[old];
      colors.push(...(pigment === 1 ? skinRGB : pigment === 2 ? hairRGB : [1, 1, 1]), pigment === 1 ? 1 : 0);
      cavities.push(srcUV[old * 2]!, srcUV[old * 2 + 1]!); nativeFlags.push(1, region);
      for (let k = 0; k < 4; k++) { joints.push(srcJ[old * 4 + k]!); weights.push(srcW[old * 4 + k]!); }
      return index;
    };
    for (let f = 0; f < srcI.length; f += 3) {
      const region = asset.wardrobe.regions[f / 3]!;
      // Imported glTF meshes override Babylon's front-face convention. The new
      // mixed mesh uses the procedural convention, so native faces must flip.
      if (usesNativeRegion(recipe, region) && !(region === 4 && surfaces.arms)) indices.push(add(srcI[f]!, region), add(srcI[f + 2]!, region), add(srcI[f + 1]!, region));
    }
  }
  if (cleanHead && asset.wardrobeHead) {
    const h = asset.wardrobeHead, frame = modularHeadFrame(profile, asset, native, sharedHead);
    const scale = frame.radius / h.frame.radius;
    const broad = profile.cosmetics.classId === 'heavy' ? 1.10 : 1;
    const first = positions.length / 3;
    const hair = HAIR_COLORS[profile.cosmetics.hairColorIndex] ?? HAIR_COLORS[0];
    const hairRGB = [1, 3, 5].map(i => Number.parseInt(hair.slice(i, i + 2), 16) / 255);
    for (let v = 0; v < h.positions.length / 3; v++) {
      positions.push(h.positions[v * 3]! * scale * broad,
        frame.y + (h.positions[v * 3 + 1]! - h.frame.y) * scale,
        frame.z + (h.positions[v * 3 + 2]! - h.frame.z) * scale);
      const normal = new Vector3(h.normals[v * 3]! / broad, h.normals[v * 3 + 1]!, h.normals[v * 3 + 2]!).normalize();
      headNormals.push(first + v, normal.x, normal.y, normal.z);
      const pigment = h.painted[v] === 2 ? hairRGB : skinRGB;
      const socket = h.painted[v] === 1 && h.positions[v * 3 + 1]! > 1.420 && h.positions[v * 3 + 1]! < 1.453
        && Math.abs(h.positions[v * 3]!) > .018 && Math.abs(h.positions[v * 3]!) < .081 && h.positions[v * 3 + 2]! > .015;
      colors.push(pigment[0]! * h.tints[v * 3]!, pigment[1]! * h.tints[v * 3 + 1]!, pigment[2]! * h.tints[v * 3 + 2]!, socket ? 2 : h.painted[v] === 2 || h.painted[v] === 3 ? 0 : 1);
      // Replace rasterised eye whites/irises with the selected skin underneath
      // the new sculpt. This also removes the old mismatched/pixelated pupils.
      cavities.push(h.uvs[v * 2]!, h.uvs[v * 2 + 1]!);
      nativeFlags.push(h.painted[v] === 1 ? 2 : 0, h.painted[v] === 1 ? 2 : 0);
      const influence = weight(['Head'], 0); joints.push(...influence.indices); weights.push(...influence.weights);
    }
    for (let f = 0; f < h.indices.length; f += 3) indices.push(first + h.indices[f]!, first + h.indices[f + 2]!, first + h.indices[f + 1]!);
    const eyes = sculptedEyes(), eyeBase = positions.length / 3;
    for (let v = 0; v < eyes.positions.length / 3; v++) {
      positions.push(eyes.positions[v * 3]! * scale * broad,
        frame.y + (eyes.positions[v * 3 + 1]! - h.frame.y) * scale,
        frame.z + (eyes.positions[v * 3 + 2]! - h.frame.z) * scale);
      const normal = new Vector3(eyes.normals[v * 3]! / broad, eyes.normals[v * 3 + 1]!, eyes.normals[v * 3 + 2]!).normalize();
      headNormals.push(eyeBase + v, normal.x, normal.y, normal.z);
      colors.push(...eyes.colors.slice(v * 4, v * 4 + 4)); cavities.push(0, 0); nativeFlags.push(0, 0);
      const influence = weight(['Head'], 0); joints.push(...influence.indices); weights.push(...influence.weights);
    }
    for (let f = 0; f < eyes.indices.length; f += 3) indices.push(eyeBase + eyes.indices[f]!, eyeBase + eyes.indices[f + 2]!, eyeBase + eyes.indices[f + 1]!);
    if (profile.cosmetics.hairStyleIndex === 1 && h.afro) {
      const hair = h.afro, base = positions.length / 3;
      for (let v = 0; v < hair.positions.length / 3; v++) {
        positions.push(hair.positions[v * 3]! * scale, frame.y + (hair.positions[v * 3 + 1]! - h.frame.y) * scale,
          frame.z + (hair.positions[v * 3 + 2]! - h.frame.z) * scale);
        headNormals.push(base + v, hair.normals[v * 3]!, hair.normals[v * 3 + 1]!, hair.normals[v * 3 + 2]!);
        const shade = hair.shades[v]!; colors.push(hairRGB[0]! * shade, hairRGB[1]! * shade, hairRGB[2]! * shade, 0);
        cavities.push(hair.uvs[v * 2]!, hair.uvs[v * 2 + 1]!); nativeFlags.push(2, 8);
        const influence = weight(['Head'], 0); joints.push(...influence.indices); weights.push(...influence.weights);
      }
      for (let f = 0; f < hair.indices.length; f += 3) indices.push(base + hair.indices[f]!, base + hair.indices[f + 2]!, base + hair.indices[f + 1]!);
    }
  }
  if (sharedBody && asset.wardrobeBody && surfaces.arms) {
    const data = asset.wardrobeBody, retarget = bodySurfaceRetarget(profile, asset, data, bones);
    const remap = new Map<string, number>();
    const add = (old: number, region: number): number => {
      const key = `${old}:${region}`, cached = remap.get(key); if (cached !== undefined) return cached;
      const index = positions.length / 3, vertex = retarget.vertex(old); remap.set(key, index);
      positions.push(vertex.position.x, vertex.position.y, vertex.position.z);
      headNormals.push(index, vertex.normal.x, vertex.normal.y, vertex.normal.z);
      colors.push(...(region === 4 ? skinRGB : [1, 1, 1]), region === 4 ? 1 : 0);
      cavities.push(data.uvs[old * 2]!, data.uvs[old * 2 + 1]!);
      nativeFlags.push(data.solidAnatomy ? 0 : 2, data.solidAnatomy ? 0 : region);
      joints.push(...vertex.indices); weights.push(...vertex.weights);
      return index;
    };
    for (let f = 0; f < data.indices.length; f += 3) {
      const region = data.regions[f / 3]!;
      if (region === 4 && surfaces.arms)
        indices.push(add(data.indices[f]!, region), add(data.indices[f + 2]!, region), add(data.indices[f + 1]!, region));
    }
  }
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  for (let i = 0; i < headNormals.length; i += 4) {
    const at = headNormals[i]! * 3;
    normals[at] = headNormals[i + 1]!; normals[at + 1] = headNormals[i + 2]!; normals[at + 2] = headNormals[i + 3]!;
  }
  const data = new VertexData();
  data.positions = new Float32Array(positions); data.normals = normals;
  data.uvs = new Float32Array(cavities);
  data.uvs2 = new Float32Array(nativeFlags);
  data.colors = new Float32Array(colors); data.indices = new Uint32Array(indices);
  data.matricesIndices = new Float32Array(joints); data.matricesWeights = new Float32Array(weights);
  // Conservative per-joint envelopes protect the *selected* headgear, hands
  // and torso during rolls, without CPU-skinning thousands of vertices/frame.
  const bounds = new Map<string, { min: Vector3; max: Vector3 }>();
  const jointNames = new Map([...bones].map(([name, index]) => [index, name]));
  const inverseBinds = new Map<string, { position: Vector3; inverse: Quaternion }>();
  for (const [name] of bones) {
    const b = bindWorldTransform(asset, name);
    if (b) inverseBinds.set(name, { position: b.position, inverse: Quaternion.Inverse(b.rotation) });
  }
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    if (positions[vertex * 3 + 1]! < asset.height * 0.42) continue;
    const p = new Vector3(positions[vertex * 3]!, positions[vertex * 3 + 1]!, positions[vertex * 3 + 2]!);
    for (let influence = 0; influence < 4; influence++) {
      if (weights[vertex * 4 + influence]! < 0.001) continue;
      const influenced = jointNames.get(joints[vertex * 4 + influence]!)!;
      // Fine finger joints are outside the coarse roll solver. Their entire
      // rest envelope belongs to Hand, so articulated tips cannot be omitted.
      const name = influenced.match(/^(Left|Right)Hand(?:Thumb|Index|Middle|Ring|Pinky)/)?.[1];
      let envelopeJoint = name ? `${name}Hand` : influenced;
      // Meshy also carries small named/unnamed face joints. Bound them under
      // their nearest solver ancestor, not outside the roll-clearance model.
      while (!(RIG_JOINTS as readonly string[]).includes(envelopeJoint)) {
        const parent = asset.jointParents.get(envelopeJoint); if (!parent) break;
        envelopeJoint = parent;
      }
      const b = inverseBinds.get(envelopeJoint);
      if (!b) continue;
      const point = p.subtract(b.position).rotateByQuaternionToRef(b.inverse, new Vector3());
      let box = bounds.get(envelopeJoint);
      if (!box) { box = { min: point.clone(), max: point.clone() }; bounds.set(envelopeJoint, box); }
      box.min.minimizeInPlace(point); box.max.maximizeInPlace(point);
    }
  }
  const isJoint = (name: string): name is RigJoint => (RIG_JOINTS as readonly string[]).includes(name);
  const boxes: ModularRollBox[] = [...bounds].flatMap(([joint, b]) => isJoint(joint) ? [{ joint, corners:
    [b.min.x, b.max.x].flatMap(x => [b.min.y, b.max.y].flatMap(y => [b.min.z, b.max.z].map(z => new Vector3(x, y, z)))) }] : []);
  const torso = Number.isFinite(torsoFront) && Number.isFinite(torsoBack)
    ? Object.freeze({ chestZ: chest.z, front: torsoFront, back: torsoBack }) : null;
  const built = { data, boxes, torso };
  if (cache.size >= MAX_CACHED_BODIES) cache.delete(cache.keys().next().value!);
  cache.set(key, built);
  return finish(built);
}
