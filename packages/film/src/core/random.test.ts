import { describe, expect, test } from 'bun:test';
import { fbm, hash, hash2, noise1, noise2, rng, seedOf } from './random.ts';

// Golden values: every committed frame reads these numbers, so a refactor
// (or a swap to another library) that moves one in the last bit fails here
// before it moves a pixel.

describe('random', () => {
  test('hash and hash2 are pinned to the bit', () => {
    expect([0, 1, 1889, -7].map(hash)).toEqual([
      0.11478774505667388, 0.24678996880538762, 0.4656426429282874, 0.8045964385382831,
    ]);
    expect([hash2(0, 0), hash2(3, 5), hash2(-2, 11)]).toEqual([
      0.11478774505667388, 0.4627476795576513, 0.015133494045585394,
    ]);
  });

  test('noise1, noise2 and fbm are pinned to the bit', () => {
    expect([0.3, 1.7, 12.25].map((x) => noise1(x, 4))).toEqual([
      0.028490649804473023, -0.10103346028923998, -0.19344209581322502,
    ]);
    expect([noise2(0.3, 0.6, 9), noise2(5.5, -2.25, 9)]).toEqual([
      0.5249570262940229, 0.09995760740275728,
    ]);
    expect([fbm(0.3, 0.6, 9), fbm(5.5, -2.25, 9)]).toEqual([
      0.32269686818342974, -0.0774358537206398,
    ]);
  });

  test('rng draws the same sequence from a seed', () => {
    const r = rng(1889);
    expect(Array.from({ length: 5 }, () => r())).toEqual([
      0.8964917110279202, 0.5845464067533612, 0.41474086907692254, 0.8867184398695827,
      0.7882695102598518,
    ]);
  });

  test('seedOf names the same seed', () => {
    expect(['', 'sheep', 'robe', 'cold:accused'].map(seedOf)).toEqual([
      2166136261, 130819572, 202949555, 1732584381,
    ]);
  });
});
