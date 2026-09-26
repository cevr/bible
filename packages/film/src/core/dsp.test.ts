import { describe, expect, test } from 'bun:test';
import { addInto, duck, fade, limit, toFrames } from './dsp.ts';

const RATE = 44100;

/** `n` samples of `value`. */
const steady = (n: number, value: number) => new Float32Array(n).fill(value);

describe('toFrames', () => {
  test('rounds to the nearest frame', () => {
    expect(toFrames(1, RATE)).toBe(44100);
    expect(toFrames(0.5 / RATE, RATE)).toBe(1);
    expect(toFrames(343.96, RATE)).toBe(15168636);
  });
});

describe('addInto', () => {
  test('adds a sound, scaled, from its frame; what falls past the end is dropped', () => {
    const dst = [new Float32Array(4)];
    addInto(dst, [Float32Array.from([1, 2, 3])], 2, 0.5);
    expect([...(dst[0] ?? [])]).toEqual([0, 0, 0.5, 1]);
  });

  test('a sound starting before the bus loses its head', () => {
    const dst = [new Float32Array(2)];
    addInto(dst, [Float32Array.from([1, 2, 3])], -1, 1);
    expect([...(dst[0] ?? [])]).toEqual([2, 3]);
  });
});

describe('fade', () => {
  test('in: silent before its start, a straight ramp over its length, then whole', () => {
    const channel = steady(6, 1);
    fade([channel], { type: 'in', start: 1, frames: 4 });
    expect([...channel]).toEqual([0, 0, 0.25, 0.5, 0.75, 1]);
  });

  test('out: whole before its start, a straight ramp down, then silent', () => {
    const channel = steady(6, 1);
    fade([channel], { type: 'out', start: 1, frames: 4 });
    expect([...channel]).toEqual([1, 1, 0.75, 0.5, 0.25, 0]);
  });
});

describe('duck', () => {
  const spec = { threshold: 0.02, ratio: 3, attack: 80, release: 1000, knee: 4 };

  test('a silent key leaves the bed as it was', () => {
    const bed = steady(RATE, 0.3);
    duck([bed], [new Float32Array(RATE)], RATE, spec);
    expect(bed.every((x) => x === Math.fround(0.3))).toBe(true);
  });

  test('a steady key settles the bed on the ratio above the threshold', () => {
    const bed = steady(2 * RATE, 0.3);
    duck([bed], [steady(2 * RATE, 0.5)], RATE, spec);
    // 20 dB·log(0.5/0.02) over the threshold, 3:1, leaves a third: (0.02/0.5)^(2/3) of the level.
    expect(bed.at(-1)).toBeCloseTo(0.3 * (0.02 / 0.5) ** (2 / 3), 4);
  });

  test('the key is silent past its end', () => {
    const bed = steady(RATE, 0.3);
    duck([bed], [steady(10, 0.5)], RATE, { ...spec, release: 1 });
    expect(bed.at(-1)).toBeCloseTo(0.3, 4);
  });
});

describe('limit', () => {
  const spec = { limit: 0.95, attack: 5, release: 50 };
  /** The attack window, less a frame: how far the output runs behind. */
  const latency = Math.trunc((RATE * spec.attack) / 1000) - 1;

  test('a quiet sound passes unchanged, one attack window late', () => {
    const input = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 20) * 0.5);
    const [out] = limit([input, input], RATE, spec);
    expect(out?.slice(latency, 1000)).toEqual(input.slice(0, 1000 - latency));
    expect(out?.slice(0, latency).every((x) => x === 0)).toBe(true);
  });

  test('a loud sound never passes the ceiling', () => {
    const tone = (gain: number) =>
      Array.from({ length: RATE / 2 }, (_, i) => Math.sin(i / 20) * gain);
    const input = Float32Array.from([...tone(0.3), ...tone(2)]);
    const out = limit([input, input], RATE, spec);
    const peak = Math.max(...out.flatMap((channel) => [...channel].map(Math.abs)));
    expect(peak).toBeLessThanOrEqual(0.95);
    expect(peak).toBeGreaterThan(0.9);
  });
});
