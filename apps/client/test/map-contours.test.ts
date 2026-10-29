import { expect, test } from 'bun:test';
import { contourPath, heightContours } from '../src/rendering/map-contours';

test('minimap contours retain a land ring and its enclosed lake as closed vector paths', () => {
  const heights = Array.from({ length: 49 }, (_, i) => {
    const x = Math.floor(i / 7), z = i % 7;
    return x === 0 || x === 6 || z === 0 || z === 6 || (x === 3 && z === 3) ? -2 : 6;
  });
  const rings = heightContours(heights, 7, 60, 0);
  expect(rings).toHaveLength(2);
  for (const ring of rings) {
    expect(ring.length).toBeGreaterThan(3);
    expect(ring.flat().every(Number.isFinite)).toBe(true);
  }
  const path = contourPath(rings);
  expect(path.match(/Z/g)).toHaveLength(2);
  expect(path).not.toContain('NaN');
  // Crossing positions must interpolate between 10 m samples, not snap to pixels.
  expect(rings.flat().some(p => p.some(n => Math.abs(n / 10 - Math.round(n / 10)) > .01))).toBe(true);
});

test('height contours close land at map borders and resolve saddle cells without open chains', () => {
  for (const heights of [[6, 6, 6, 6], [6, -2, -2, 6], [0, 0, 0, 0]]) {
    const rings = heightContours(heights, 2, 20, 0);
    expect(rings.length).toBeGreaterThan(0);
    expect(rings.every(r => r.length >= 3 && r.flat().every(Number.isFinite))).toBe(true);
    expect(contourPath(rings).match(/Z/g)).toHaveLength(rings.length);
  }
  expect(heightContours([-1, -1, -1, -1], 2, 20, 0)).toHaveLength(0);
});
