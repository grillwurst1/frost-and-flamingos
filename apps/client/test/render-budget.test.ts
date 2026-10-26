import { expect, test } from 'bun:test';
import { classifyGpu } from '../src/rendering/gpu-tier';
import { RENDER_PROFILES, renderFrameLimit, sceneSampleCount } from '../src/rendering/render-profile';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

test('Apple GPUs start with the balanced tier, software rasterizers remain low', () => {
  const engine = (renderer: string) => ({getInfo: () => ({vendor: 'Apple', renderer}), getRenderHeight: () => 1800}) as unknown as AbstractEngine;
  expect(classifyGpu(engine('Apple M4')).tier).toBe('medium');
  expect(classifyGpu(engine('ANGLE Metal Renderer: Apple M4 Pro')).tier).toBe('medium');
  expect(classifyGpu(engine('SwiftShader')).tier).toBe('low');
});

test('silhouette antialiasing uses supported sample counts and low stays single-sampled', () => {
  expect(sceneSampleCount('medium', false, 4)).toBe(2);
  expect(sceneSampleCount('medium', true, 4)).toBe(4);
  expect(sceneSampleCount('high', true, 1)).toBe(1);
  expect(sceneSampleCount('low', true, 4)).toBe(1);
  expect(sceneSampleCount('low', false, 0)).toBe(1);
});

test('quiet frame limits preserve menu and gameplay budgets', () => {
  expect(renderFrameLimit(45, true)).toBe(45);
  expect(renderFrameLimit(60, false)).toBe(30);
  expect(renderFrameLimit(30, true)).toBe(30);
  expect(RENDER_PROFILES.medium.shadowSize).toBe(1024);
  expect(RENDER_PROFILES.low.shadowSize).toBe(512);
});
