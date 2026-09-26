import { describe, expect, test } from 'bun:test';
import { concat, levels, silence, slice, toInt16, toStereo } from './audio.ts';

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
