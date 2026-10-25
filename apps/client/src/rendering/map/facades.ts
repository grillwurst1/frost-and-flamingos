/**
 * Painted facade shells for the owner-painted buildings.
 *
 * The blueprint layout (walls, door gaps, floors, roof collider) stays the
 * source of truth: the procedural builder still draws floors, stairs, the
 * inner wall lining, door frames, balconies and interiors, while these
 * meshes put the painted panels on the OUTSIDE with planar per-face UVs:
 * gable elevations on the front/back walls, the eave-side wall band on the
 * side walls, the roof top view projected onto the pitched roof planes.
 * Door openings of the layout are cut out of the panels so every walkable
 * doorway stays open. Vertical mapping is fitted piecewise to the collider
 * shell (painted eave tips at the roof base, ridge at the ridge), the
 * horizontal mapping to the wall width.
 */
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { LIGHTHOUSE, PAVILION, SUMMIT_CLOCK_HOUSE, roofBase, type BuildingLayout, type MapProp } from '@frost-and-flamingos/shared';
import type {
  CropPanel,
  FacadeAtlas,
  FacadeSet,
  FortressFacadeSet,
  GableFacadeSet,
  LighthouseFacadeSet,
  PavilionFacadeSet,
  TowerPanel,
} from '../facade-atlas';
import { Affine } from './geometry';

type Side = 'front' | 'back' | 'left' | 'right';

interface Hole {
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

/** Collects positions/normals/uvs in building-local space, baked to world on output. */
class FacadeBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  constructor(private transform: Affine) {}

  /** Runs `draw` with `local` appended to the current transform. */
  within(local: Affine, draw: () => void): void {
    const previous = this.transform;
    this.transform = previous.multiply(local);
    draw();
    this.transform = previous;
  }

  private vertex(p: readonly [number, number, number], n: readonly [number, number, number], uv: readonly [number, number]): number {
    const m = this.transform.m;
    const x = (m[0] ?? 1) * p[0] + (m[1] ?? 0) * p[1] + (m[2] ?? 0) * p[2] + (m[3] ?? 0);
    const y = (m[4] ?? 0) * p[0] + (m[5] ?? 1) * p[1] + (m[6] ?? 0) * p[2] + (m[7] ?? 0);
    const z = (m[8] ?? 0) * p[0] + (m[9] ?? 0) * p[1] + (m[10] ?? 1) * p[2] + (m[11] ?? 0);
    const nx = (m[0] ?? 1) * n[0] + (m[1] ?? 0) * n[1] + (m[2] ?? 0) * n[2];
    const ny = (m[4] ?? 0) * n[0] + (m[5] ?? 1) * n[1] + (m[6] ?? 0) * n[2];
    const nz = (m[8] ?? 0) * n[0] + (m[9] ?? 0) * n[1] + (m[10] ?? 1) * n[2];
    const index = this.positions.length / 3;
    this.positions.push(x, y, z);
    const length = Math.hypot(nx, ny, nz) || 1;
    this.normals.push(nx / length, ny / length, nz / length);
    this.uvs.push(uv[0], uv[1]);
    return index;
  }

  /** Quad p0..p3 (counter-clockwise seen from the side the normal points to). */
  quad(
    p: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]],
    uv: readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]],
    normal: readonly [number, number, number],
    normals?: readonly (readonly [number, number, number])[],
  ): void {
    const a = this.vertex(p[0], normals?.[0] ?? normal, uv[0]);
    const b = this.vertex(p[1], normals?.[1] ?? normal, uv[1]);
    const c = this.vertex(p[2], normals?.[2] ?? normal, uv[2]);
    const d = this.vertex(p[3], normals?.[3] ?? normal, uv[3]);
    // Right-handed outward winding, swapped for Babylon's front face (see GeometryBatch).
    this.indices.push(a, c, b, a, d, c);
  }

  /** Triangle p0..p2 (counter-clockwise seen from the normal side). */
  triangle(
    p: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]],
    uv: readonly [readonly [number, number], readonly [number, number], readonly [number, number]],
    normal: readonly [number, number, number],
  ): void {
    const a = this.vertex(p[0], normal, uv[0]);
    const b = this.vertex(p[1], normal, uv[1]);
    const c = this.vertex(p[2], normal, uv[2]);
    this.indices.push(a, c, b);
  }

  toMesh(scene: Scene, name: string, material: ShaderMaterial): Mesh | null {
    if (this.indices.length === 0) return null;
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = new Float32Array(this.positions);
    data.normals = new Float32Array(this.normals);
    data.uvs = new Float32Array(this.uvs);
    data.indices = this.positions.length / 3 > 65535 ? new Uint32Array(this.indices) : new Uint16Array(this.indices);
    data.applyToMesh(mesh, false);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
    return mesh;
  }
}

type Footprint = Pick<BuildingLayout, 'width' | 'depth'>;

/** Wall-local (along, y) -> building-local 3D point on the outer face of `side`. */
function wallPoint(side: Side, layout: Footprint, along: number, y: number, out: number): [number, number, number] {
  const halfW = layout.width / 2;
  const halfD = layout.depth / 2;
  switch (side) {
    case 'front':
      return [along, y, halfD + out];
    case 'back':
      return [along, y, -halfD - out];
    case 'left':
      return [-halfW - out, y, along];
    default:
      return [halfW + out, y, along];
  }
}

const SIDE_NORMAL: Record<Side, [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
};

/** Door and counter gaps of the layout on one wall, in wall-local coordinates. */
function wallHoles(layout: BuildingLayout, side: Side): Hole[] {
  const holes: Hole[] = [];
  for (const floor of layout.floors) {
    for (const opening of floor.openings) {
      if (opening.wall !== side || (opening.kind !== 'door' && opening.kind !== 'counter')) continue;
      const bottom = floor.elevation + opening.sill;
      holes.push({ a0: opening.offset - opening.width / 2, a1: opening.offset + opening.width / 2, y0: bottom, y1: bottom + opening.height });
    }
  }
  return holes;
}

/**
 * Emits a wall-plane rectangle [a0, a1] x [y0, y1] whose UVs vary linearly
 * (uvAt), split around the holes so doorways stay open.
 */
function emitWallRect(
  builder: FacadeBuilder,
  layout: Footprint,
  side: Side,
  a0: number,
  a1: number,
  y0: number,
  y1: number,
  uvAt: (a: number, y: number) => [number, number],
  holes: readonly Hole[],
  out: number,
): void {
  const as = new Set([a0, a1]);
  const ys = new Set([y0, y1]);
  for (const hole of holes) {
    if (hole.a1 <= a0 || hole.a0 >= a1 || hole.y1 <= y0 || hole.y0 >= y1) continue;
    as.add(Math.max(a0, Math.min(a1, hole.a0)));
    as.add(Math.max(a0, Math.min(a1, hole.a1)));
    ys.add(Math.max(y0, Math.min(y1, hole.y0)));
    ys.add(Math.max(y0, Math.min(y1, hole.y1)));
  }
  const alongs = [...as].sort((p, q) => p - q);
  const heights = [...ys].sort((p, q) => p - q);
  // Outward winding (right-handed maths, see FacadeBuilder.quad): on the
  // front and left walls the second corner has the larger along coordinate.
  const flip = side === 'back' || side === 'right';
  const normal = SIDE_NORMAL[side];
  for (let i = 0; i + 1 < alongs.length; i += 1) {
    for (let j = 0; j + 1 < heights.length; j += 1) {
      const ca0 = alongs[i] ?? 0;
      const ca1 = alongs[i + 1] ?? 0;
      const cy0 = heights[j] ?? 0;
      const cy1 = heights[j + 1] ?? 0;
      if (ca1 - ca0 < 0.001 || cy1 - cy0 < 0.001) continue;
      const ma = (ca0 + ca1) / 2;
      const my = (cy0 + cy1) / 2;
      if (holes.some((hole) => ma > hole.a0 && ma < hole.a1 && my > hole.y0 && my < hole.y1)) continue;
      const left = flip ? ca1 : ca0;
      const right = flip ? ca0 : ca1;
      builder.quad(
        [
          wallPoint(side, layout, left, cy0, out),
          wallPoint(side, layout, right, cy0, out),
          wallPoint(side, layout, right, cy1, out),
          wallPoint(side, layout, left, cy1, out),
        ],
        [uvAt(left, cy0), uvAt(right, cy0), uvAt(right, cy1), uvAt(left, cy1)],
        normal,
      );
    }
  }
}

interface GableFit {
  sx: number;
  eaveH: number;
  apexH: number;
  halfSpan: number;
}

/** Fits a gable elevation to the layout: width to the wall, eave tips to the roof base, ridge to the collider ridge. */
function fitGable(panel: GableFacadeSet['front'], layout: BuildingLayout): GableFit {
  const sx = layout.width / Math.max(1, panel.wall[1] - panel.wall[0]);
  const top = roofBase(layout);
  const run = layout.width / 2 + layout.roof.overhang;
  const apexH = top + Math.tan(layout.roof.pitch) * run;
  const halfSpan = ((panel.eave[1] - panel.eave[0]) / 2) * sx;
  return { sx, eaveH: top, apexH, halfSpan };
}

/** Piecewise-linear row -> height map through ground, eave and apex rows. */
function gableHeight(panel: GableFacadeSet['front'], fit: GableFit, py: number): number {
  const eaveRow = panel.eave[2];
  if (py >= eaveRow) return ((panel.ground - py) / Math.max(1, panel.ground - eaveRow)) * fit.eaveH;
  return fit.eaveH + ((eaveRow - py) / Math.max(1, eaveRow - panel.apex[1])) * (fit.apexH - fit.eaveH);
}

function gableRow(panel: GableFacadeSet['front'], fit: GableFit, y: number): number {
  const eaveRow = panel.eave[2];
  if (y <= fit.eaveH) return panel.ground - (y / Math.max(0.001, fit.eaveH)) * (panel.ground - eaveRow);
  return eaveRow - ((y - fit.eaveH) / Math.max(0.001, fit.apexH - fit.eaveH)) * (eaveRow - panel.apex[1]);
}

const CARD_OUT = 0.015;

function buildGable(builder: FacadeBuilder, atlas: FacadeAtlas, set: GableFacadeSet, layout: BuildingLayout): void {
  const halfW = layout.width / 2;
  const halfD = layout.depth / 2;
  const front = fitGable(set.front, layout);

  // Gable elevations (front +Z, back -Z), cropped to the eave span above the
  // eave line and to the wall body below it (drops flat side props like signs).
  for (const side of ['front', 'back'] as const) {
    const panel = side === 'front' ? set.front : set.back;
    const fit = fitGable(panel, layout);
    // Both gables share the front's ridge and eave heights (one roof).
    fit.eaveH = front.eaveH;
    fit.apexH = front.apexH;
    const cx = (panel.wall[0] + panel.wall[1]) / 2;
    // Front: image left = +X (viewer's left); back: image left = -X.
    const pxOf = (along: number): number => (side === 'front' ? cx - along / fit.sx : cx + along / fit.sx);
    const uvAt = (along: number, y: number): [number, number] => atlas.uv(panel.file, pxOf(along), gableRow(panel, fit, y)) ?? [0, 0];
    const holes = wallHoles(layout, side);
    const split = Math.min(panel.ground - 2, panel.eave[2] + 22);
    const splitH = gableHeight(panel, fit, split);
    const topH = gableHeight(panel, fit, 0);
    const margin = 5 * fit.sx;
    const wallHalf = halfW + margin;
    const eaveHalf = ((panel.eave[1] - panel.eave[0]) / 2) * fit.sx + margin;
    emitWallRect(builder, layout, side, -wallHalf, wallHalf, 0, splitH, uvAt, holes, CARD_OUT);
    emitWallRect(builder, layout, side, -eaveHalf, eaveHalf, splitH, fit.eaveH, uvAt, holes, CARD_OUT);
    emitWallRect(builder, layout, side, -eaveHalf, eaveHalf, fit.eaveH, topH, uvAt, holes, CARD_OUT);
  }

  // Eave-side walls: the painted wall band up to the underside of the roof.
  const sideTop = front.apexH - (halfW / Math.max(0.001, front.halfSpan)) * (front.apexH - front.eaveH);
  const side = set.side;
  for (const wall of ['left', 'right'] as const) {
    // Image left (the painted front end) faces the building front on both walls.
    const pxOf = (along: number): number => side.wall[0] + ((halfD - along) / layout.depth) * (side.wall[1] - side.wall[0]);
    const rowOf = (y: number): number => side.ground - (y / Math.max(0.001, sideTop)) * (side.ground - side.top);
    const uvAt = (along: number, y: number): [number, number] => atlas.uv(side.file, pxOf(along), rowOf(y)) ?? [0, 0];
    emitWallRect(builder, layout, wall, -halfD, halfD, 0, sideTop, uvAt, wallHoles(layout, wall), CARD_OUT);
  }

  // Roof planes from the gable geometry, top view projected in XZ.
  const roof = set.roof;
  const halfLen = halfD + 0.06;
  const span = front.halfSpan;
  const [rx0, ry0, rx1, ry1] = roof.rect;
  const roofUv = (x: number, z: number): [number, number] => {
    const across = (span - x) / (2 * span);
    const along = (z + halfLen) / (2 * halfLen);
    const px = roof.front === 'bottom' ? rx0 + across * (rx1 - rx0) : rx0 + (1 - along) * (rx1 - rx0);
    const py = roof.front === 'bottom' ? ry0 + along * (ry1 - ry0) : ry0 + across * (ry1 - ry0);
    return atlas.uv(roof.file, px, py) ?? [0, 0];
  };
  const lift = 0.02;
  const rise = front.apexH - front.eaveH;
  for (const sign of [1, -1]) {
    const ridgeBack: [number, number, number] = [0, front.apexH + lift, -halfLen];
    const ridgeFront: [number, number, number] = [0, front.apexH + lift, halfLen];
    const eaveFront: [number, number, number] = [sign * span, front.eaveH + lift, halfLen];
    const eaveBack: [number, number, number] = [sign * span, front.eaveH + lift, -halfLen];
    const nl = Math.hypot(rise, span) || 1;
    const normal: [number, number, number] = [(sign * rise) / nl, span / nl, 0];
    const points = sign > 0 ? ([ridgeBack, ridgeFront, eaveFront, eaveBack] as const) : ([ridgeFront, ridgeBack, eaveBack, eaveFront] as const);
    builder.quad(points, [roofUv(points[0][0], points[0][2]), roofUv(points[1][0], points[1][2]), roofUv(points[2][0], points[2][2]), roofUv(points[3][0], points[3][2])], normal);
    // Dark underside (soffit) so the overhang reads from below.
    const dark = atlas.uv(side.file, (side.wall[0] + side.wall[1]) / 2, side.top + 4) ?? [0, 0];
    const under = [points[3], points[2], points[1], points[0]].map((p) => [p[0], p[1] - 0.06, p[2]] as [number, number, number]);
    builder.quad([under[0] as [number, number, number], under[1] as [number, number, number], under[2] as [number, number, number], under[3] as [number, number, number]], [dark, dark, dark, dark], [-normal[0], -normal[1], -normal[2]]);
  }
}

/** UV mapper of a crop rectangle onto a wall rectangle [a0, a1] x [y0, y1]. */
function cropUv(
  atlas: FacadeAtlas,
  panel: CropPanel,
  side: Side,
  a0: number,
  a1: number,
  y0: number,
  y1: number,
): (a: number, y: number) => [number, number] {
  const [x0, r0, x1, r1] = panel.crop;
  // Image left sits at the viewer's left: +X on the front, -X on the back,
  // +Z on the left wall. The right wall reuses the same side elevation
  // mirrored, so on both side walls the image left faces the front (+Z).
  const leftIsHigh = side === 'front' || side === 'left' || side === 'right';
  return (a, y) => {
    const t = (a - a0) / Math.max(0.0001, a1 - a0);
    const s = leftIsHigh ? 1 - t : t;
    const v = (y - y0) / Math.max(0.0001, y1 - y0);
    return atlas.uv(panel.file, x0 + s * (x1 - x0), r1 - v * (r1 - r0)) ?? [0, 0];
  };
}

function emitCrop(
  builder: FacadeBuilder,
  atlas: FacadeAtlas,
  footprint: Footprint,
  panel: CropPanel,
  side: Side,
  a0: number,
  a1: number,
  y0: number,
  y1: number,
  holes: readonly Hole[],
  out: number,
): void {
  emitWallRect(builder, footprint, side, a0, a1, y0, y1, cropUv(atlas, panel, side, a0, a1, y0, y1), holes, out);
}

/** Tower C: ground and upper storey bands, the clock house and the pine-cone weights. */
function buildFortress(builder: FacadeBuilder, atlas: FacadeAtlas, set: FortressFacadeSet, layout: BuildingLayout): void {
  const halfW = layout.width / 2;
  const halfD = layout.depth / 2;
  const upper = layout.floors[1];
  const split = upper ? upper.elevation : layout.floors[0] ? layout.floors[0].elevation + layout.floors[0].height : 5;
  const top = roofBase(layout);
  const bands: Array<[FortressFacadeSet['ground'], number, number]> = [
    [set.ground, 0, split],
    [set.upper, split, top],
  ];
  for (const [band, y0, y1] of bands) {
    for (const side of ['front', 'back', 'left', 'right'] as const) {
      const panel = side === 'front' ? band.front : side === 'back' ? band.back : band.side;
      const half = side === 'front' || side === 'back' ? halfW : halfD;
      emitCrop(builder, atlas, layout, panel, side, -half, half, y0, y1, wallHoles(layout, side), CARD_OUT);
    }
  }
  // Clock house on the roof deck (its own footprint, centred on SUMMIT_CLOCK_HOUSE).
  const H = SUMMIT_CLOCK_HOUSE;
  const house: Footprint = { width: H.width, depth: H.depth };
  const frontPanel = set.clock.front;
  const frontAspect = (frontPanel.crop[3] - frontPanel.crop[1]) / Math.max(1, frontPanel.crop[2] - frontPanel.crop[0]);
  const backPanel = set.clock.back;
  const backAspect = (backPanel.crop[3] - backPanel.crop[1]) / Math.max(1, backPanel.crop[2] - backPanel.crop[0]);
  builder.within(Affine.translation(H.center.x, 0, H.center.z), () => {
    emitCrop(builder, atlas, house, frontPanel, 'front', -H.width / 2, H.width / 2, H.base, H.base + H.width * frontAspect, [], 0.95);
    emitCrop(builder, atlas, house, backPanel, 'back', -H.width / 2, H.width / 2, H.base, H.base + H.width * backAspect, [], 0.95);
    for (const side of ['left', 'right'] as const) {
      emitCrop(builder, atlas, house, set.clock.side, side, -H.depth / 2, H.depth / 2, H.base, H.base + H.height, [], 0.06);
    }
  });
  // Pine-cone clock weights hanging from the front balcony rail.
  const balcony = layout.balcony?.depth ?? 0;
  for (const weight of set.weights ?? []) {
    const [xa, xb] = weight.x;
    const a0 = Math.min(xa, xb);
    const a1 = Math.max(xa, xb);
    emitCrop(builder, atlas, layout, weight, 'front', a0, a1, 0.9, split - 0.1, [], balcony + 0.1);
  }
}

/** Lighthouse: the painted elevations wrapped onto the tapered tower (front half / back half). */
function buildLighthouse(builder: FacadeBuilder, atlas: FacadeAtlas, set: LighthouseFacadeSet): void {
  const L = LIGHTHOUSE;
  const baseTop = 2.8;
  const bodyTop = L.galleryHeight - 0.3;
  // [height, radius, painted row mix] rings; the base ledge is a small step.
  const rings: Array<{ y: number; r: number; row: (panel: TowerPanel) => number; hw: (panel: TowerPanel) => number }> = [];
  const baseRing = (y: number, r: number): void => {
    const t = y / baseTop;
    rings.push({ y, r, row: (p) => p.rows[2] + (p.rows[1] - p.rows[2]) * t, hw: (p) => p.half[2] + (p.half[1] - p.half[2]) * t });
  };
  const bodyRing = (y: number, r: number): void => {
    const t = (y - baseTop) / (bodyTop - baseTop);
    rings.push({ y, r, row: (p) => p.rows[1] + (p.rows[0] - p.rows[1]) * t, hw: (p) => p.half[1] + (p.half[0] - p.half[1]) * t });
  };
  baseRing(0, L.baseRadius + 0.5);
  baseRing(baseTop * 0.5, L.baseRadius + 0.35);
  baseRing(baseTop, L.baseRadius + 0.15);
  for (let index = 0; index <= 4; index += 1) {
    const t = index / 4;
    bodyRing(baseTop + (bodyTop - baseTop) * t, L.baseRadius + (L.topRadius - L.baseRadius) * t);
  }
  const segments = 14;
  const reach = 0.94;
  for (const half of ['front', 'back'] as const) {
    const panel = half === 'front' ? set.front : set.side;
    const start = half === 'front' ? -Math.PI / 2 : Math.PI / 2;
    for (let ring = 0; ring + 1 < rings.length; ring += 1) {
      const lower = rings[ring];
      const upperRing = rings[ring + 1];
      if (!lower || !upperRing || upperRing.y - lower.y < 0.001) continue;
      for (let segment = 0; segment < segments; segment += 1) {
        const ta = start + (segment / segments) * Math.PI;
        const tb = start + ((segment + 1) / segments) * Math.PI;
        const point = (theta: number, entry: typeof lower): [number, number, number] => [Math.sin(theta) * entry.r, entry.y, Math.cos(theta) * entry.r];
        const uv = (theta: number, entry: typeof lower): [number, number] => {
          const offset = Math.sin(theta) * entry.hw(panel) * reach;
          // Front half: image left = +X; back half (seen from -Z): image left = -X.
          const px = half === 'front' ? panel.cx - offset : panel.cx + offset;
          return atlas.uv(panel.file, px, entry.row(panel)) ?? [0, 0];
        };
        const slope = (lower.r - upperRing.r) / (upperRing.y - lower.y);
        const normalAt = (theta: number): [number, number, number] => {
          const length = Math.hypot(1, slope);
          return [Math.sin(theta) / length, slope / length, Math.cos(theta) / length];
        };
        builder.quad(
          [point(ta, lower), point(tb, lower), point(tb, upperRing), point(ta, upperRing)],
          [uv(ta, lower), uv(tb, lower), uv(tb, upperRing), uv(ta, upperRing)],
          normalAt((ta + tb) / 2),
          [normalAt(ta), normalAt(tb), normalAt(tb), normalAt(ta)],
        );
      }
    }
  }
}

/** Tower B: the painted hip roof top view projected onto a smooth pyramid roof. */
function buildPavilionRoof(builder: FacadeBuilder, atlas: FacadeAtlas, set: PavilionFacadeSet): void {
  const C = PAVILION;
  const half = C.houseSize / 2 + 0.9;
  const base = C.houseBottom + C.houseHeight + 0.12;
  const apex = base + C.roofHeight;
  const [x0, y0, x1, y1] = set.roof.rect;
  const uv = (x: number, z: number): [number, number] =>
    atlas.uv(set.roof.file, x0 + ((half - x) / (2 * half)) * (x1 - x0), y0 + ((z + half) / (2 * half)) * (y1 - y0)) ?? [0, 0];
  const corners: Array<[number, number]> = [
    [half, half],
    [-half, half],
    [-half, -half],
    [half, -half],
  ];
  const top: [number, number, number] = [0, apex, 0];
  for (let index = 0; index < 4; index += 1) {
    const a = corners[index] ?? [0, 0];
    const b = corners[(index + 1) % 4] ?? [0, 0];
    const pa: [number, number, number] = [a[0], base, a[1]];
    const pb: [number, number, number] = [b[0], base, b[1]];
    // Face normal from the edge midpoint outward and up.
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    const ml = Math.hypot(mx, mz) || 1;
    const nl = Math.hypot(C.roofHeight, half) || 1;
    const normal: [number, number, number] = [((mx / ml) * C.roofHeight) / nl, half / nl, ((mz / ml) * C.roofHeight) / nl];
    // Outward winding: the edge runs clockwise seen from above.
    builder.triangle([pb, pa, top], [uv(b[0], b[1]), uv(a[0], a[1]), uv(0, 0)], normal);
  }
}

/** True when the facade builder handles this set kind for the prop. */
export function supportsFacade(set: FacadeSet, prop: MapProp): boolean {
  switch (set.kind) {
    case 'gable':
      return Boolean(prop.building && prop.building.roof.kind === 'gable');
    case 'fortress':
      return prop.kind === 'summit_dairy' && Boolean(prop.building);
    case 'lighthouse':
      return prop.kind === 'lighthouse';
    case 'pavilion':
      return prop.kind === 'clock_pavilion';
    default:
      return false;
  }
}

/** Builds the painted shell of one building prop (world space). */
export function buildFacadeMesh(scene: Scene, atlas: FacadeAtlas, material: ShaderMaterial, prop: MapProp, set: FacadeSet): Mesh | null {
  if (!supportsFacade(set, prop)) return null;
  const builder = new FacadeBuilder(Affine.translation(prop.position.x, prop.position.y, prop.position.z).rotateY(prop.rotationY));
  const layout = prop.building;
  switch (set.kind) {
    case 'gable':
      if (layout) buildGable(builder, atlas, set, layout);
      break;
    case 'fortress':
      if (layout) buildFortress(builder, atlas, set, layout);
      break;
    case 'lighthouse':
      buildLighthouse(builder, atlas, set);
      break;
    case 'pavilion':
      buildPavilionRoof(builder, atlas, set);
      break;
    default:
      break;
  }
  return builder.toMesh(scene, `facade-${prop.id}`, material);
}
