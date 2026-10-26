import { expect, test } from 'bun:test';
import { QualityGovernor, renderRatio } from '../src/rendering/quality-governor';

test('render target budgets hold on Retina and 4K windows, including resizing', () => {
  for (const [tier, cap, pixels] of [['high', 1.5, 2560 * 1440], ['medium', 1.25, 1920 * 1080], ['low', 1, 1600 * 900]] as const) {
    for (const [width, height, dpr] of [[1920, 1080, 2], [3840, 2160, 1], [800, 600, 3]]) {
      const ratio = renderRatio(width!, height!, dpr!, cap, tier);
      expect(width! * height! * ratio * ratio).toBeLessThanOrEqual(pixels + 1);
      expect(ratio).toBeLessThanOrEqual(dpr!);
    }
  }
});

test('sustained gameplay load can lower both tiers across a long session', () => {
  const governor = new QualityGovernor();
  expect(governor.observe(0, 45, 'high', true)).toBe('high');
  expect(governor.observe(4000, 45, 'high', true)).toBe('high');
  expect(governor.observe(9000, 45, 'high', true)).toBe('medium');
  expect(governor.observe(10000, 45, 'medium', true)).toBe('medium');
  expect(governor.observe(14000, 45, 'medium', true)).toBe('medium');
  expect(governor.observe(19000, 45, 'medium', true)).toBe('low');
});

test('short spikes, hidden tabs and manual settings never cause a downgrade', () => {
  const governor = new QualityGovernor();
  governor.observe(0, 50, 'high', true);
  governor.observe(4000, 50, 'high', true);
  expect(governor.observe(8000, 16, 'high', true)).toBe('high');
  governor.observe(9000, 50, 'high', true);
  expect(governor.observe(13000, 50, 'high', false)).toBe('high');
  expect(governor.observe(90000, 50, 'high', true)).toBe('high');
  expect(governor.observe(100000, 50, 'low', true)).toBe('low');
});


test('intentional 30/45 FPS limits do not falsely count as overload', () => {
  for (const fps of [30, 45]) {
    const governor = new QualityGovernor();
    for (let time = 0; time < 60000; time += 1000) {
      expect(governor.observe(time, 1000 / fps + 1, 'medium', true, fps)).toBe('medium');
    }
    expect(governor.observe(60000, 60, 'medium', true, fps)).toBe('medium');
    expect(governor.observe(66000, 60, 'medium', true, fps)).toBe('low');
  }
});
