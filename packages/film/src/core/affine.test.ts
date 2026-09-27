import { describe, expect, test as it } from 'bun:test';
import { Option } from 'effect';
import { IDENTITY, applyAffine, invertAffine, sameAffine } from './affine.ts';

describe('affine', () => {
  // The newspaper in 1888: translate(96, 57) · rotate(-0.015) · scale(0.9).
  const r = -0.015;
  const s = 0.9;
  const m = [s * Math.cos(r), s * Math.sin(r), -s * Math.sin(r), s * Math.cos(r), 96, 57] as const;

  it('maps a point the way the canvas does', () => {
    expect(applyAffine(IDENTITY, [960, 218])).toEqual([960, 218]);
    const [x, y] = applyAffine(m, [0, 0]);
    expect([x, y]).toEqual([96, 57]);
  });

  it('inverts: a point mapped and mapped back is where it was', () => {
    const back = Option.map(invertAffine(m), (inv) => applyAffine(inv, applyAffine(m, [960, 218])));
    const [x, y] = Option.getOrElse(back, () => [Number.NaN, Number.NaN] as const);
    expect(x).toBeCloseTo(960, 9);
    expect(y).toBeCloseTo(218, 9);
    expect(Option.isNone(invertAffine([0, 0, 0, 0, 5, 5]))).toBe(true);
  });

  it('compares within a tolerance', () => {
    expect(sameAffine(m, [...m])).toBe(true);
    expect(sameAffine(m, IDENTITY)).toBe(false);
  });
});
