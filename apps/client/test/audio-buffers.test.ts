import { expect, test } from 'bun:test';
import { createNoiseBuffer, makeSaturationCurve } from '../src/audio/library';

function context(): { ctx: AudioContext; allocations: () => number } {
  let count = 0;
  return { ctx: {sampleRate: 48000, createBuffer(_channels: number, length: number) {
    count++;
    const data = new Float32Array(length);
    return {getChannelData: () => data};
  }} as unknown as AudioContext, allocations: () => count };
}

test('repeated combat sounds reuse noise arrays and distortion curves', () => {
  const audio = context();
  const first = createNoiseBuffer(audio.ctx, 0.5, 'pink');
  for (let shot = 0; shot < 500; shot++) {
    expect(createNoiseBuffer(audio.ctx, 0.5, 'pink')).toBe(first);
    expect(makeSaturationCurve(45)).toBe(makeSaturationCurve(45));
  }
  expect(audio.allocations()).toBe(1);
  expect(createNoiseBuffer(audio.ctx, 0.5, 'white')).not.toBe(first);
  expect(createNoiseBuffer(context().ctx, 0.5, 'pink')).not.toBe(first);
});

test('noise cache is bounded for varying sound parameters', () => {
  const audio = context();
  for (let index = 0; index < 70; index++) createNoiseBuffer(audio.ctx, (index + 1) / 1000);
  createNoiseBuffer(audio.ctx, 0.07);
  expect(audio.allocations()).toBe(71);
});
