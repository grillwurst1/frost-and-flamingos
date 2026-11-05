/**
 * Nature generators: layered snowy firs, curved ringed coconut palms with
 * drooping fronds, faceted boulders and the dense ground clutter (grass
 * tufts, flowers, pebbles, shells, driftwood, snow mounds, ferns, bushes).
 * All shapes are chunky, slightly irregular and toy-like.
 */
import { Affine, GeometryBatch, hash3, mix, shade, type RGB, type V3 } from './geometry';
import { P } from './palette';

function rand(seed: number, salt: number): number {
  return hash3(seed * 1.137, salt * 7.31, seed * 0.173 + salt);
}

/** Lobed, overlapping boughs with separate rounded snow shelves.
 * Every tree remains a solid 3D mesh. Broad shapes replace the stacked cones;
 * no alpha cards, per-needle geometry or additional material draws.
 */
export function drawFir(batch: GeometryBatch, scale: number, variant: number, snowy: number, seed: number, far = false, showcase = false): void {
  const young = variant === 3 && scale < 1.05;
  const tiers = young ? 3 : 4 + (variant % 3 === 0 ? 1 : 0);
  const height = (young ? 5.4 : 8.6 + variant * .5) * scale;
  const trunk = (young ? 1.1 : 1.9) * scale;
  const gap = (height - trunk) / (tiers + .6);
  batch.lathe([[.37*scale,-.15],[.24*scale,trunk+gap]], 8, P.logDark, 'wood');
  const segments = far ? 6 : showcase ? 24 : 8;
  const green = mix(P.firDark, P.firLight, .24 + variant*.035);
  const shelf = (radius: number, base: number, rise: number, phase: number, snow: boolean, tier: number) => {
    const profile: readonly (readonly [number, number])[] = far
      ? [[.72,0],[1,.14],[.025,1]]
      : snow
      ? [[.70,-.035],[.94,.13],[.66,.48],[.025,1]]
      : [[.69,-.14],[1,0],[.57,.48],[.018,1]];
    const grid: number[][] = [];
    for (let r=0;r<profile.length;r++) {
      const [rad,y] = profile[r]!, prev = profile[Math.max(0,r-1)]!, next = profile[Math.min(profile.length-1,r+1)]!;
      const dr=(next[0]-prev[0])*radius, dy=(next[1]-prev[1])*rise;
      const row:number[]=[];
      for (let j=0;j<=segments;j++) {
        const a=j/segments*Math.PI*2, wave=a*5+phase;
        const lobe=1+.15*Math.cos(wave)+.045*Math.cos(a*9-phase);
        const droop=(1-y)*(.12*Math.cos(wave)+.035*Math.sin(a*3+phase))*scale;
        const rr=radius*rad*lobe, yy=base+y*rise+droop;
        const nr=dy, ny=-dr, length=Math.hypot(nr,ny)||1;
        const color=snow ? mix(P.snowMid,P.snow,Math.min(1,.28+y*.95))
          : shade(green,.78+.18*y+.07*Math.sin(a*3+phase+tier));
        row.push(batch.vertex(Math.sin(a)*rr,yy,Math.cos(a)*rr,Math.sin(a)*nr/length,ny/length,Math.cos(a)*nr/length,color,snow?'snow':'foliage'));
      }
      grid.push(row);
    }
    for(let r=0;r+1<grid.length;r++)for(let j=0;j<segments;j++) {
      const a=grid[r]![j]!,b=grid[r]![j+1]!,c=grid[r+1]![j+1]!,d=grid[r+1]![j]!;
      batch.triangle(a,b,c);batch.triangle(a,c,d);
    }
    // Close the dark underside, including when viewed from below the bridge.
    const bottom=batch.vertex(0,base-.10*scale,0,0,-1,0,snow?P.snowShade:P.firDark,snow?'snow':'foliage');
    for(let j=0;j<segments;j++)batch.triangle(bottom,grid[0]![j+1]!,grid[0]![j]!);
  };
  for(let tier=0;tier<tiers;tier++) {
    const t=tier/tiers, radius=(young?2.1-t*1.3:2.7-t*1.9)*scale*(.91+rand(seed,tier)*.18);
    const base=trunk+tier*gap, phase=rand(seed,tier+10)*Math.PI*2;
    shelf(radius,base,gap*1.72,phase,false,tier);
    if(snowy>.05)shelf(radius*(.72+.26* Math.min(1,snowy)),base+.12*scale,gap*1.56,phase,true,tier);
  }
}

/**
 * Curved palm trunk made of bulging ring segments, drooping split fronds and
 * coconuts. Variant 3 is the short, bushy palm from the tree sheet.
 */
export function drawPalm(batch: GeometryBatch, scale: number, variant: number, seed: number, leanYaw?: number, far = false): void {
  const short = variant === 3;
  const height = (short ? 3.4 : 6.6 + variant * 0.9) * scale;
  const lean = short ? 0.1 + rand(seed, 1) * 0.12 : (0.22 + rand(seed, 1) * 0.28) * (variant === 2 ? 1.4 : 1);
  const leanDirection = leanYaw ?? rand(seed, 2) * Math.PI * 2;
  const rings = far ? 3 : short ? 5 : 7;
  const spine: V3[] = [];
  for (let index = 0; index <= rings; index += 1) {
    const t = index / rings;
    const bend = Math.sin(t * Math.PI * 0.5) * lean * height * 0.55 + t * t * lean * height * 0.25;
    spine.push([Math.sin(leanDirection) * bend, t * height, Math.cos(leanDirection) * bend]);
  }
  for (let index = 0; index < rings; index += 1) {
    const a = spine[index] as V3;
    const b = spine[index + 1] as V3;
    const t = index / rings;
    const radius = (short ? 0.42 - t * 0.1 : 0.36 - t * 0.12) * scale;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    batch.with(Affine.alongSegment(a, b), () => {
      batch.lathe(
        [
          [radius * 0.95, 0],
          [radius * 1.18, length * 0.3],
          [radius * 0.9, length * 1.01],
        ],
        6,
        index % 2 === 0 ? P.palmTrunk : P.palmTrunkDark,
        'wood',
        { phase: index * 0.4 },
      );
    });
  }
  const crown = spine[rings] as V3;
  batch.blob(crown[0], crown[1] - 0.1, crown[2], 0.5 * scale, 0.42 * scale, 0.5 * scale, P.palmTrunkDark, 'wood', { segments: 6, rings: 4 });
  const fronds = far ? 6 : short ? 9 : 7 + (variant % 2);
  for (let frond = 0; frond < fronds; frond += 1) {
    const yaw = (frond / fronds) * Math.PI * 2 + rand(seed, frond + 5) * 0.5;
    const length = (short ? 3.0 + rand(seed, frond + 20) * 0.9 : 3.8 + rand(seed, frond + 20) * 1.4) * scale;
    const rise = 0.55 + rand(seed, frond + 30) * 0.35;
    const segments = far ? 2 : 4;
    const left: V3[] = [];
    const right: V3[] = [];
    const center: V3[] = [];
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    const sx = Math.cos(yaw);
    const sz = -Math.sin(yaw);
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const along = t * length;
      // Arching spine: up and out first, then drooping down past the crown.
      const y = crown[1] + Math.sin(t * Math.PI * 0.8) * rise * scale * 1.2 - t * t * length * 0.55;
      const width = Math.sin(Math.min(1, t * 1.25) * Math.PI) * 0.85 * scale * (index % 2 === 0 ? 1 : 0.7) + 0.05;
      const droop = width * 0.45;
      const cx = crown[0] + dx * along;
      const cz = crown[2] + dz * along;
      center.push([cx, y, cz]);
      left.push([cx + sx * width, y - droop, cz + sz * width]);
      right.push([cx - sx * width, y - droop, cz - sz * width]);
    }
    const light = rand(seed, frond) > 0.5 ? P.palmFrond : P.palmFrondLight;
    const rows = center.map((point, index): V3[] => [left[index] as V3, point, right[index] as V3]);
    batch.sheet(rows, (t) => mix(P.palmFrondDark, light, 0.35 + t * 0.65), 'foliage');
  }
  if (far) return;
  const coconuts = 3 + (variant % 2);
  for (let index = 0; index < coconuts; index += 1) {
    const angle = (index / coconuts) * Math.PI * 2 + rand(seed, 50) * 2;
    batch.blob(
      crown[0] + Math.sin(angle) * 0.42 * scale,
      crown[1] - 0.45 * scale,
      crown[2] + Math.cos(angle) * 0.42 * scale,
      0.3 * scale,
      0.34 * scale,
      0.3 * scale,
      (ny) => (ny > 0.3 ? shade(P.coconut, 1.2) : P.coconut),
      'wood',
      { segments: 5, rings: 3 },
    );
  }
}

/** Broad chipped planes, with a separate snow cap and deterministic slab shapes. */
export function drawRock(batch: GeometryBatch, scale: number, variant: number, top: 'snow' | 'moss' | 'bare' | 'beach', seed: number, far = false): void {
  const base = top === 'beach' ? P.rockBeach : variant === 4 ? P.rockWarm : P.rock;
  const sides = far ? 6 : 8;
  const slab = variant % 4;
  // Keep the authored collision envelope: changing height by a factor of two
  // would leave an invisible wall above a visually flat slab.
  const height = (1.30 + slab * .025) * scale;
  const width = (.98 + rand(seed, 1) * .06) * scale;
  const depth = (.85 + rand(seed, 4) * .04) * scale;
  const slopeX = (rand(seed, 2) - .5) * .22, slopeZ = (rand(seed, 3) - .5) * .16;
  const profiles = [[.88, -.04], [1, .22], [.78, .84], [.50, 1]] as const;
  const loops = profiles.map(([radius, y], ring) => Array.from({ length: sides }, (_, col): V3 => {
    const a = col / sides * Math.PI * 2 + .17;
    const wobble = 1 + (rand(seed, col + 10) - .5) * .23;
    const x = Math.sin(a) * width * radius * wobble;
    const z = Math.cos(a) * depth * radius * wobble;
    return [x + ring * slopeX * .12 * scale, y * height + (ring > 1 ? x * slopeX + z * slopeZ : 0), z];
  }));
  for (let ring = 1; ring < loops.length; ring++) for (let col = 0; col < sides; col++) {
    const next = (col + 1) % sides;
    const a = loops[ring - 1]![col]!, b = loops[ring - 1]![next]!, c = loops[ring]![next]!, d = loops[ring]![col]!;
    batch.orientedPolygon([a, b, c, d], [(a[0] + b[0]) / 2, .1, (a[2] + b[2]) / 2],
      mix(P.rockShade, base, .65 + .09 * ring), 'rock');
  }
  const crown = loops[loops.length - 1]!;
  batch.orientedPolygon(crown, [0, 1, 0], top === 'moss' ? mix(P.grassShade, base, .45) : mix(base, P.rockLight, .38), 'rock');
  batch.orientedPolygon(loops[0]!, [0, -1, 0], P.rockShade, 'rock');
  if (top === 'snow') {
    const lip = loops[2]!.map((p): V3 => [p[0] * 1.04, p[1] + .025 * scale, p[2] * 1.04]);
    const cap = crown.map((p): V3 => [p[0] * 1.02, p[1] + .065 * scale, p[2] * 1.02]);
    for (let col = 0; col < sides; col++) {
      const next = (col + 1) % sides;
      batch.orientedPolygon([lip[col]!, lip[next]!, cap[next]!, cap[col]!], [lip[col]![0], 1, lip[col]![2]], P.snowMid, 'snow');
    }
    batch.orientedPolygon(cap, [0, 1, 0], P.snow, 'snow');
  }
}

export function drawGrassTuft(batch: GeometryBatch, scale: number, seed: number, dry: boolean): void {
  const blades = 4;
  const base = dry ? P.sandShade : P.grassLight;
  const tip = dry ? P.thatch : P.meadow;
  for (let blade = 0; blade < blades; blade += 1) {
    const angle = (blade / blades) * Math.PI + rand(seed, blade) * 0.6;
    const height = (0.45 + rand(seed, blade + 9) * 0.35) * scale;
    const width = 0.12 * scale;
    const lean = (rand(seed, blade + 3) - 0.5) * 0.5;
    const sx = Math.cos(angle) * width;
    const sz = -Math.sin(angle) * width;
    const tx = Math.sin(angle) * lean * height;
    const tz = Math.cos(angle) * lean * height;
    const points: V3[] = [
      [-sx, 0, -sz],
      [sx, 0, sz],
      [tx, height, tz],
    ];
    batch.polygon(points, mix(base, tip, 0.5), 'grass');
    batch.polygon(points, shade(base, 0.85), 'grass', true);
  }
}

export function drawFlowers(batch: GeometryBatch, scale: number, seed: number): void {
  const palette = [P.flowerRed, P.flowerPink, P.flowerYellow, P.flowerWhite, P.flowerBlue, P.flowerPurple];
  const count = 3 + Math.floor(rand(seed, 1) * 4);
  for (let index = 0; index < count; index += 1) {
    const x = (rand(seed, index + 2) - 0.5) * 0.9 * scale;
    const z = (rand(seed, index + 12) - 0.5) * 0.9 * scale;
    const y = (0.22 + rand(seed, index + 22) * 0.18) * scale;
    const color = palette[Math.floor(rand(seed, index + 32) * palette.length)] ?? P.flowerRed;
    const petals: V3[] = [];
    for (let petal = 0; petal < 8; petal += 1) {
      const angle = (petal / 8) * Math.PI * 2;
      const radius = (petal % 2 === 0 ? 0.16 : 0.07) * scale;
      petals.push([x + Math.sin(angle) * radius, y, z + Math.cos(angle) * radius]);
    }
    batch.polygon(petals.reverse(), color, 'foliage');
    const stem: V3[] = [
      [x - 0.03, 0, z],
      [x + 0.03, 0, z],
      [x, y, z],
    ];
    batch.polygon(stem, P.leaf, 'foliage');
    batch.polygon(stem, P.leaf, 'foliage', true);
  }
}

export function drawPebbles(batch: GeometryBatch, scale: number, seed: number, color: RGB): void {
  const count = 2 + Math.floor(rand(seed, 3) * 3);
  for (let index = 0; index < count; index += 1) {
    const x = (rand(seed, index) - 0.5) * 1.2 * scale;
    const z = (rand(seed, index + 7) - 0.5) * 1.2 * scale;
    const r = (0.1 + rand(seed, index + 14) * 0.16) * scale;
    batch.blob(x, 0.02, z, r * 1.3, r * 0.55, r, mix(color, P.rockLight, rand(seed, index + 21) * 0.5), 'rock', {
      segments: 4,
      rings: 2,
      flat: true,
      wobble: 0.3,
      seed: seed + index,
      flatBottom: true,
    });
  }
}

export function drawShell(batch: GeometryBatch, scale: number, seed: number): void {
  const color = rand(seed, 1) > 0.5 ? P.flowerPink : P.cream;
  const points: V3[] = [[0, 0.03, -0.12 * scale]];
  for (let index = 0; index <= 6; index += 1) {
    const angle = -Math.PI * 0.45 + (index / 6) * Math.PI * 0.9;
    points.push([Math.sin(angle) * 0.2 * scale, 0.07, Math.cos(angle) * 0.18 * scale]);
  }
  batch.polygon(points.reverse(), color, 'sand');
}

export function drawDriftwood(batch: GeometryBatch, scale: number, seed: number): void {
  const length = (1.6 + rand(seed, 1) * 1.6) * scale;
  const angle = rand(seed, 2) * Math.PI;
  const a: V3 = [-Math.sin(angle) * length * 0.5, 0.12 * scale, -Math.cos(angle) * length * 0.5];
  const b: V3 = [Math.sin(angle) * length * 0.5, 0.18 * scale, Math.cos(angle) * length * 0.5];
  batch.log(a, b, 0.14 * scale, P.plankGrey, 'wood', { segments: 6, taper: 0.7, endColor: P.cream });
  batch.log([b[0] * 0.3, 0.15 * scale, b[2] * 0.3], [b[0] * 0.3 + Math.cos(angle) * 0.6, 0.3 * scale, b[2] * 0.3 - Math.sin(angle) * 0.6], 0.06 * scale, P.plankGrey, 'wood', { segments: 5, taper: 0.5 });
}

export function drawSnowMound(batch: GeometryBatch, scale: number, seed: number): void {
  batch.blob(0, 0, 0, 1.3 * scale, 0.45 * scale, 0.95 * scale, (ny) => (ny > 0.4 ? P.snow : P.snowMid), 'snow', {
    segments: 8,
    rings: 4,
    wobble: 0.25,
    seed,
    flatBottom: true,
  });
}

export function drawFern(batch: GeometryBatch, scale: number, seed: number): void {
  const leaves = 5;
  for (let leaf = 0; leaf < leaves; leaf += 1) {
    const yaw = (leaf / leaves) * Math.PI * 2 + rand(seed, leaf) * 0.6;
    const length = (0.8 + rand(seed, leaf + 4) * 0.5) * scale;
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    const sx = Math.cos(yaw) * 0.16 * scale;
    const sz = -Math.sin(yaw) * 0.16 * scale;
    const rows: V3[][] = [];
    for (let index = 0; index <= 3; index += 1) {
      const t = index / 3;
      const y = Math.sin(t * Math.PI * 0.75) * 0.45 * scale;
      const w = Math.sin(t * Math.PI) + 0.1;
      rows.push([
        [dx * t * length + sx * w, y - 0.05, dz * t * length + sz * w],
        [dx * t * length, y, dz * t * length],
        [dx * t * length - sx * w, y - 0.05, dz * t * length - sz * w],
      ]);
    }
    batch.sheet(rows, (t) => mix(P.palmFrondDark, P.leaf, t), 'foliage');
  }
}

export function drawBush(batch: GeometryBatch, scale: number, seed: number, flowering: boolean): void {
  const lumps = 2;
  for (let lump = 0; lump < lumps; lump += 1) {
    const x = (rand(seed, lump) - 0.5) * 1.1 * scale;
    const z = (rand(seed, lump + 5) - 0.5) * 1.1 * scale;
    const r = (0.6 + rand(seed, lump + 9) * 0.35) * scale;
    batch.blob(x, r * 0.6, z, r, r * 0.8, r, (ny) => (ny > 0.3 ? P.grassLight : P.grassShade), 'foliage', {
      segments: 6,
      rings: 4,
      wobble: 0.3,
      seed: seed + lump,
      flatBottom: true,
    });
    if (flowering) {
      for (let flower = 0; flower < 3; flower += 1) {
        const angle = rand(seed, lump * 7 + flower) * Math.PI * 2;
        batch.blob(
          x + Math.sin(angle) * r * 0.7,
          r * 0.95,
          z + Math.cos(angle) * r * 0.7,
          0.13 * scale,
          0.1 * scale,
          0.13 * scale,
          rand(seed, flower + 40) > 0.5 ? P.flowerPink : P.flowerRed,
          'foliage',
          { segments: 4, rings: 2 },
        );
      }
    }
  }
}

export function drawReeds(batch: GeometryBatch, scale: number, seed: number): void {
  for (let index = 0; index < 6; index += 1) {
    const x = (rand(seed, index) - 0.5) * 0.8 * scale;
    const z = (rand(seed, index + 3) - 0.5) * 0.8 * scale;
    const h = (0.9 + rand(seed, index + 6) * 0.6) * scale;
    batch.box(x, h / 2, z, 0.05, h, 0.05, P.grassShade, 'foliage', 0);
    batch.blob(x, h + 0.12, z, 0.06, 0.18, 0.06, P.mud, 'foliage', { segments: 4, rings: 3 });
  }
}
