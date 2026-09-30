import { describe, expect, test } from 'bun:test';
import {
  concat,
  levels,
  silence,
  slice,
  splice,
  toInt16,
  toStereo,
  windowPowers,
} from './audio.ts';

const pcm = (...channels: ReadonlyArray<ReadonlyArray<number>>) => ({
  rate: 44100,
  frames: channels[0]?.length ?? 0,
  channels: channels.map((c) => Float32Array.from(c)),
});

describe('toStereo', () => {
  test('mono goes to both sides at −3 dB', () => {
    const [left, right] = toStereo(pcm([1, -0.5])).channels;
    expect([...(left ?? [])]).toEqual([
      Math.fround(Math.SQRT1_2),
      Math.fround(-0.5 * Math.SQRT1_2),
    ]);
    expect(right).toEqual(left);
    expect(right).not.toBe(left);
  });

  test('stereo passes through; more channels keep their first two', () => {
    const three = pcm([1], [2], [3]);
    expect(toStereo(three).channels).toEqual(three.channels.slice(0, 2));
  });
});

describe('toInt16', () => {
  test('interleaves, rounds half to even, and clips', () => {
    const half = 0.5 / 32768;
    const out = toInt16(pcm([half, 1.5 / 32768, 1], [-half, -1.5 / 32768, -2]));
    expect([...out]).toEqual([0, 0, 2, -2, 32767, -32768]);
  });
});

describe('levels', () => {
  test('mean power and peak in dBFS', () => {
    const square = levels(pcm([1, -1, 1, -1]));
    expect(square).toEqual({ mean: 0, peak: 0 });
    const half = levels(pcm([0.5, -0.5]));
    expect(half.mean).toBeCloseTo(-6.0206, 4);
    expect(half.peak).toBeCloseTo(-6.0206, 4);
  });

  test('silence is −Infinity', () => {
    expect(levels(silence(44100, 10, 2))).toEqual({ mean: -Infinity, peak: -Infinity });
  });
});

describe('concat', () => {
  test('joins blocks end to end, channel by channel', () => {
    const joined = concat(44100, 2, [pcm([1, 2], [3, 4]), pcm([5], [6])]);
    expect(joined.frames).toBe(3);
    expect(joined.channels.map((c) => [...c])).toEqual([
      [1, 2, 5],
      [3, 4, 6],
    ]);
  });
});

describe('slice', () => {
  test('cuts frames from a point, with silence past the end', () => {
    const cut = slice(pcm([1, 2, 3], [4, 5, 6]), 1, 3);
    expect(cut.frames).toBe(3);
    expect(cut.channels.map((c) => [...c])).toEqual([
      [2, 3, 0],
      [5, 6, 0],
    ]);
  });
});

describe('splice', () => {
  test('joins pieces end to end, one piece as it was', () => {
    const src = pcm([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const one = splice(src, [{ from: 2, frames: 5 }], 2);
    expect([...(one.channels[0] ?? [])]).toEqual([2, 3, 4, 5, 6]);
    const two = splice(
      src,
      [
        { from: 6, frames: 3 },
        { from: 0, frames: 4 },
      ],
      0,
    );
    expect(two.frames).toBe(7);
    expect([...(two.channels[0] ?? [])]).toEqual([6, 7, 8, 0, 1, 2, 3]);
  });

  test('fades out and in across each join, never at the outer edges', () => {
    const ones = pcm(Array.from({ length: 20 }, () => 1));
    const out = [
      ...(splice(
        ones,
        [
          { from: 0, frames: 10 },
          { from: 10, frames: 10 },
        ],
        4,
      ).channels[0] ?? []),
    ];
    // Untouched away from the join, and at both ends.
    expect(out.slice(0, 6)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(out.slice(14)).toEqual([1, 1, 1, 1, 1, 1]);
    // Down to silence into the join, and up out of it.
    expect(out.slice(6, 10).every((x, i, all) => x < 1 && (i === 0 || x < (all[i - 1] ?? 1)))).toBe(
      true,
    );
    expect(
      out.slice(10, 14).every((x, i, all) => x < 1 && (i === 0 || x > (all[i - 1] ?? 0))),
    ).toBe(true);
    expect(out[9]).toBeLessThan(0.3);
    expect(out[10]).toBeLessThan(0.3);
  });
});

describe('windowPowers', () => {
  test('a mono take played at −3 dB a side reads as the take itself', () => {
    const take = pcm([0.5, 0.5, 0.5, 0.5]);
    const [alone] = windowPowers(take, 2);
    const [sides] = windowPowers(toStereo(take), 2);
    expect(sides).toBeCloseTo(alone ?? 0, 5);
    expect(alone).toBeCloseTo(20 * Math.log10(0.5), 5);
  });

  test('the last window is measured over its own length; a span reads only its frames', () => {
    const tone = pcm([0, 0, 0, 0, 1]);
    const all = windowPowers(tone, 2);
    expect(all.length).toBe(3);
    expect([all[0], all[1]]).toEqual([Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]);
    expect(all[2]).toBeCloseTo(0, 5);
    expect([...windowPowers(tone, 2, 3, 5)].map((db) => Math.round(db))).toEqual([-3]);
  });
});
