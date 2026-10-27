import { FJORD_MAP, MAP_HALF_SIZE, MAP_SIZE, GRID_POINTS, FjordLayout } from '@frost-and-flamingos/shared';

let cached: string | null = null;
export const mapX = (x: number): number => x + MAP_HALF_SIZE;
export const mapY = (z: number): number => MAP_HALF_SIZE - z;

/** Static SVG cartography, built once. The HUD never creates a second 3D render camera. */
export function minimapArtwork(): string {
  if (cached) return cached;
  const colours = ['#6f9fba', '#d9c89f', '#c0d1cf', '#bdcfd7', '#d9e7ec', '#e8f2f4'];
  const paths = colours.map(() => '');
  const side = GRID_POINTS - 1, step = MAP_SIZE / side;
  for (let row = 0; row < side; row++) {
    let previous = -1, start = 0;
    const flush = (end: number) => {
      if (previous >= 0) paths[previous] += `M${start*step},${row*step}h${(end-start)*step}v${step+0.1}H${start*step}Z`;
    };
    for (let col = 0; col <= side; col++) {
      const height = col < side ? FJORD_MAP.heights[col * GRID_POINTS + side - row] ?? 0 : -Infinity;
      const colour = col === side ? -1 : height < 0.2 ? 0 : height < 3 ? 1 : height < 17 ? 2 : height < 30 ? 3 : height < 48 ? 4 : 5;
      if (colour !== previous) { flush(col); previous = colour; start = col; }
    }
  }
  const line = (points: readonly { x: number; z: number }[], width: number, colour: string): string =>
    `<polyline points="${points.map(p=>`${mapX(p.x)},${mapY(p.z)}`).join(' ')}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linejoin="round"/>`;
  let shapes = colours.map((colour,i)=>`<path fill="${colour}" d="${paths[i]}"/>`).join('');
  shapes += line(FJORD_MAP.routes.tankRoad.points, 9, '#7c8e98') + line(FJORD_MAP.routes.tankRoad.points, 5, '#eff5f1');
  shapes += line([FjordLayout.BRIDGE_SOUTH, FjordLayout.BRIDGE_NORTH], 7, '#8d6952');
  shapes += line(FJORD_MAP.routes.coaster.track.points, 2.5, '#ba8073');
  for (const prop of FJORD_MAP.props) {
    if (!prop.building && prop.kind !== 'pier' && prop.kind !== 'cable_station') continue;
    const width = Math.max(4, prop.dimensions?.x ?? 8), depth = Math.max(4, prop.dimensions?.z ?? 8);
    shapes += `<rect x="${mapX(prop.position.x)-width/2}" y="${mapY(prop.position.z)-depth/2}" width="${width}" height="${depth}" fill="#8c7b66" stroke="#454c4d" stroke-width="1.2" transform="rotate(${-prop.rotationY*180/Math.PI} ${mapX(prop.position.x)} ${mapY(prop.position.z)})"/>`;
  }
  cached = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_SIZE}" height="${MAP_SIZE}" viewBox="0 0 ${MAP_SIZE} ${MAP_SIZE}"><rect width="${MAP_SIZE}" height="${MAP_SIZE}" fill="${colours[0]}"/>${shapes}</svg>`)}`;
  return cached;
}
