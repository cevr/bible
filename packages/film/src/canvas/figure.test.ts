import { describe, expect, test } from 'bun:test';
import { type CrowdSpec, crowd } from './figure.ts';

const listeners = {
  seed: 63,
  count: 18,
  area: [0, 500, 1500, 300],
  heights: [140, 280],
  focus: 760,
  robes: ['#557577', '#9c7162', '#7b698d'],
  cloths: ['#c5a77e', '#697a82'],
  skins: ['#b8785a', '#d69b72'],
  seated: 0.35,
  light: { from: -2.2, key: '#f2c58b', rim: '#ffde9c', shade: '#163d4b' },
} as const satisfies CrowdSpec;

describe('a painted crowd', () => {
  test('keeps the same cast when separately rendered chunks redraw it', () => {
    expect(crowd(listeners)).toEqual(crowd(listeners));
    expect(crowd({ ...listeners, seed: 64 })).not.toEqual(crowd(listeners));
  });

  test('has varied listeners scattered in depth and draws the nearer ones last', () => {
    const cast = crowd(listeners);
    expect(cast).toHaveLength(listeners.count);
    expect(new Set(cast.map((p) => p.head)).size).toBeGreaterThan(2);
    expect(new Set(cast.map((p) => p.robe)).size).toBe(3);
    expect(new Set(cast.map((p) => p.pose)).size).toBe(2);
    expect(new Set(cast.map((p) => p.y)).size).toBe(cast.length);
    expect(cast.every((p, i) => i === 0 || p.y >= (cast[i - 1]?.y ?? 0))).toBe(true);
    expect(cast.every((p) => p.dir === (p.x <= listeners.focus ? 1 : -1))).toBe(true);
  });
});
