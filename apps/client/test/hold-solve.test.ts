/**
 * The painted characters' hold solvers (rendering/glb/hold.ts) must be
 * continuous: a weapon that follows the animated body may never jump between
 * two frames because a rule switched on or off.
 */
import { describe, expect, test } from 'bun:test';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { groundLift, keepOutZ, segmentReach } from '../src/rendering/glb/hold';

/** Largest change of `f` between neighbouring samples of [from, to]. */
function maxStep(f: (value: number) => number, from: number, to: number, samples = 4000): number {
  let worst = 0;
  let previous = f(from);
  for (let index = 1; index <= samples; index += 1) {
    const next = f(from + ((to - from) * index) / samples);
    worst = Math.max(worst, Math.abs(next - previous));
    previous = next;
  }
  return worst;
}

describe('keepOutZ', () => {
  test('pushes in front of the torso and fades out past the shoulder line', () => {
    expect(keepOutZ(0, 0, 0, 0.25, 0.2)).toBeCloseTo(0.2);
    expect(keepOutZ(0.4, 0, 0, 0.25, 0.2)).toBeCloseTo(0);
    expect(keepOutZ(0, 0.3, 0, 0.25, 0.2)).toBeCloseTo(0.3);
  });

  test('has no step at the shoulder-width edge', () => {
    // The old binary rule jumped by the full push (20 cm here) at |dx| = half.
    expect(maxStep((x) => keepOutZ(x, 0, 0, 0.25, 0.2), 0.1, 0.4)).toBeLessThan(0.001);
  });
});

describe('segmentReach', () => {
  const centre = new Vector3(0, 0, 0);

  test('is 0 inside, the entry point outside, the closest approach when missed', () => {
    expect(segmentReach(new Vector3(0.1, 0, 0), new Vector3(1, 0, 0), centre, 0.5)).toBe(0);
    expect(segmentReach(new Vector3(1, 0, 0), new Vector3(-1, 0, 0), centre, 0.5)).toBeCloseTo(0.25);
    expect(segmentReach(new Vector3(1, 1, 0), new Vector3(-1, 1, 0), centre, 0.5)).toBeCloseTo(0.5);
  });

  test('moves continuously as the sphere grows past tangency and the end', () => {
    const from = new Vector3(1, 0.6, 0);
    const to = new Vector3(-1, 0.6, 0);
    expect(maxStep((radius) => segmentReach(from, to, centre, radius), 0.3, 1.4)).toBeLessThan(0.01);
    const short = new Vector3(0.7, 0.2, 0);
    expect(maxStep((radius) => segmentReach(from, short, centre, radius), 0.3, 1.4)).toBeLessThan(0.01);
  });

  test('moves continuously as the start point slides', () => {
    const to = new Vector3(0, 0.1, 0);
    expect(maxStep((x) => segmentReach(new Vector3(x, 0.3, 0.2), to, centre, 0.35), -1, 1)).toBeLessThan(0.01);
  });
});

describe('groundLift', () => {
  test('lifts a point below the limit exactly onto it', () => {
    const point = new Vector3(0, -0.8, 0.6);
    const lift = groundLift([point], -0.5, 1.5);
    const y = point.y * Math.cos(lift) + point.z * Math.sin(lift);
    expect(y).toBeCloseTo(-0.5);
    expect(groundLift([new Vector3(0, -0.2, 0.6)], -0.5, 1.5)).toBe(0);
  });

  test('ignores points behind the pivot without a step', () => {
    expect(maxStep((z) => groundLift([new Vector3(0, -0.9, z)], -0.5, 1.5), -0.5, 0.5)).toBeLessThan(0.02);
  });
});
