import { describe, expect, test } from 'bun:test';
import { fbm, hash, hash2, noise1, noise2, rng, seedOf } from './random.ts';

// What a film relies on: the same input gives the same number on every run,
// numbers stay in their range, and another seed gives other numbers. The
// numbers themselves are not pinned: a change to random.ts shows in its diff.

/** Evenly spread sample points, negative and fractional included. */
const XS = Array.from({ length: 200 }, (_, i) => (i - 100) * 0.37);

describe('random', () => {
  test('hash and hash2 are functions of their input, in [0, 1)', () => {
    for (const x of XS) {
      expect(hash(x)).toBe(hash(x));
      expect(hash(x)).toBeGreaterThanOrEqual(0);
      expect(hash(x)).toBeLessThan(1);
      expect(hash2(x, -x)).toBe(hash2(x, -x));
      expect(hash2(x, -x)).toBeGreaterThanOrEqual(0);
      expect(hash2(x, -x)).toBeLessThan(1);
    }
    expect(new Set([0, 1, 2, 3, 4].map(hash)).size).toBe(5);
  });

  test('noise1, noise2 and fbm are functions of their input, in [-1, 1]', () => {
    for (const x of XS) {
      for (const v of [noise1(x, 4), noise2(x, x * 0.5, 9), fbm(x, -x, 9)]) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(noise1(x, 4)).toBe(noise1(x, 4));
      expect(noise2(x, x * 0.5, 9)).toBe(noise2(x, x * 0.5, 9));
      expect(fbm(x, -x, 9)).toBe(fbm(x, -x, 9));
    }
  });

  test('noise is smooth: a small step moves it a little', () => {
    for (const x of XS) {
      expect(Math.abs(noise1(x + 1e-4, 4) - noise1(x, 4))).toBeLessThan(1e-3);
      expect(Math.abs(noise2(x + 1e-4, x, 9) - noise2(x, x, 9))).toBeLessThan(1e-3);
    }
  });

  test('another seed gives other noise', () => {
    const differs = XS.filter((x) => noise2(x, x * 0.5, 9) !== noise2(x, x * 0.5, 10));
    expect(differs.length).toBeGreaterThan(XS.length / 2);
  });

  test('rng draws the same sequence from a seed, and another from another seed', () => {
    const draw = (seed: number) => {
      const r = rng(seed);
      return Array.from({ length: 50 }, () => r());
    };
    expect(draw(1889)).toEqual(draw(1889));
    expect(draw(1889)).not.toEqual(draw(1890));
    for (const v of draw(1889)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('seedOf is FNV-1a: the same name the same seed, names apart', () => {
    // FNV-1a's offset basis: the hash of nothing.
    expect(seedOf('')).toBe(2166136261);
    expect(seedOf('sheep')).toBe(seedOf('sheep'));
    const names = ['sheep', 'robe', 'cold:accused', 'cold:accuser'];
    expect(new Set(names.map(seedOf)).size).toBe(names.length);
    for (const name of names) {
      expect(Number.isInteger(seedOf(name))).toBe(true);
      expect(seedOf(name)).toBeGreaterThanOrEqual(0);
    }
  });
});
