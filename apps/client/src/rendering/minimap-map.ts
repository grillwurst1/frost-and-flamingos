import { referenceScene } from '../state/scene';
import { ARENA_GRID, ARENA_SOLID_PROPS, ARENA_CABLE, FJORD_MAP, MAP_SIZE, GRID_POINTS, FjordLayout } from '@frost-and-flamingos/shared';
import { contourPath, heightContours } from './map-contours';

let cached: string | null = null;
export const mapSize=referenceScene?ARENA_GRID.size:MAP_SIZE;
const half=mapSize/2;
export const mapX = (x: number): number => x + half;
export const mapY = (z: number): number => half - z;

/** Static SVG cartography, built once. The HUD never creates a second 3D render camera. */
export function minimapArtwork(): string {
  if (cached) return cached;
  const colours = ['#6f9fba', '#d9c89f', '#c0d1cf', '#bdcfd7', '#d9e7ec', '#e8f2f4'];
  const line = (points: readonly { x: number; z: number }[], width: number, colour: string): string =>
    `<polyline points="${points.map(p=>`${mapX(p.x)},${mapY(p.z)}`).join(' ')}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linejoin="round"/>`;
  const levels = referenceScene?[.2,3,17,24,30]:[.2, 3, 17, 30, 48];
  const grid=referenceScene?ARENA_GRID:{heights:FJORD_MAP.heights,segments:GRID_POINTS-1,size:MAP_SIZE};
  let shapes = levels.map((level, i) => `<path fill="${colours[i + 1]}" fill-rule="evenodd" stroke="${i < 2 ? '#91a7ac' : '#a6bbc6'}" stroke-width="${i < 2 ? 1 : .7}" d="${contourPath(heightContours(grid.heights, grid.segments+1, grid.size, level))}"/>`).join('');
  if(referenceScene){shapes+=line(ARENA_CABLE.gondolaPath.points,.5,'#48545b');}
  else {
  shapes += line(FJORD_MAP.routes.tankRoad.points, 9, '#7c8e98') + line(FJORD_MAP.routes.tankRoad.points, 5, '#eff5f1');
  shapes += line([FjordLayout.BRIDGE_SOUTH, FjordLayout.BRIDGE_NORTH], 7, '#8d6952');
  shapes += line(FJORD_MAP.routes.coaster.track.points, 2.5, '#ba8073');
  }
  for (const prop of referenceScene?ARENA_SOLID_PROPS:FJORD_MAP.props) {
    if (!prop.building && prop.kind !== 'pier' && prop.kind !== 'cable_station') continue;
    const width = Math.max(4, prop.building?.width ?? prop.dimensions?.x ?? 8), depth = Math.max(4, prop.building?.depth ?? prop.dimensions?.z ?? 8);
    shapes += `<rect x="${mapX(prop.position.x)-width/2}" y="${mapY(prop.position.z)-depth/2}" width="${width}" height="${depth}" fill="#8c7b66" stroke="#454c4d" stroke-width="1.2" transform="rotate(${-prop.rotationY*180/Math.PI} ${mapX(prop.position.x)} ${mapY(prop.position.z)})"/>`;
  }
  cached = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${mapSize}" height="${mapSize}" viewBox="0 0 ${mapSize} ${mapSize}"><rect width="${mapSize}" height="${mapSize}" fill="${colours[0]}"/>${shapes}</svg>`)}`;
  return cached;
}
