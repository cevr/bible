import { describe, expect, test } from 'bun:test';
import { clamp, ease, envelope, invLerp, keys, lerp, progress } from './time.ts';

describe('time', () => {
  test('eases are exactly 0 before their start and 1 after', () => {
    for (const e of Object.values(ease)) {
      expect(progress(0, 1, 1, e)).toBe(0);
      expect(progress(3, 1, 1, e)).toBe(1);
    }
  });

  // Golden values: every committed frame reads these curves, so a refactor
  // that moves one in the last bit fails here before it moves a pixel.
  test('each ease is pinned to the bit at a quarter, a half and three quarters', () => {
    const at = Object.fromEntries(
      Object.entries(ease).map(([name, e]) => [name, [0.25, 0.5, 0.75].map(e)]),
    );
    expect(at).toEqual({
      linear: [0.25, 0.5, 0.75],
      inQuad: [0.0625, 0.25, 0.5625],
      outQuad: [0.4375, 0.75, 0.9375],
      inOutQuad: [0.125, 0.5, 0.875],
      inCubic: [0.015625, 0.125, 0.421875],
      outCubic: [0.578125, 0.875, 0.984375],
      inOutCubic: [0.0625, 0.5, 0.9375],
      outQuart: [0.68359375, 0.9375, 0.99609375],
      inOutQuart: [0.03125, 0.5, 0.96875],
      outExpo: [0.8232233047033631, 0.96875, 0.99447572827198],
      inOutExpo: [0.015625, 0.5, 0.984375],
      inOutSine: [0.1464466094067262, 0.49999999999999994, 0.8535533905932737],
      outBack: [0.8174096875000002, 1.0876975, 1.0641365625],
      outSoft: [0.7260141046107038, 1.019554308130029, 1.0133225025680326],
    });
  });

  test('lerp, clamp, invLerp, progress, envelope and keys are pinned', () => {
    expect([lerp(0.1, 0.7, 0.3), lerp(1.3, -2.2, 0.35), clamp(1.2), invLerp(2, 4, 3)]).toEqual([
      0.28, 0.07500000000000018, 1, 0.5,
    ]);
    expect(progress(1.5, 1, 1)).toBe(0.5);
    expect([0.25, 1, 1.9].map((t) => envelope(t, 0, 2))).toEqual([0.5, 1, 0.03200000000000003]);
    expect(
      [0.1, 0.3, 0.5].map((t) =>
        keys(t, [
          [0, 1],
          [0.2, 2],
          [0.6, 0, ease.outCubic],
        ]),
      ),
    ).toEqual([1.5, 0.84375, 0.03125]);
  });
});
