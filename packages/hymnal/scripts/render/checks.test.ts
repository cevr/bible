import type { Pcm } from '@bible/film/measure';
import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import {
  checksOf,
  firstSound,
  LIMITS,
  longestQuiet,
  merged,
  passed,
  samplePeak,
} from './checks.js';
import type { Measured } from './checks.js';

const RATE = 44100;

/** Stereo silence of `seconds` with a 440 Hz tone at `amp` from `from` to `to` seconds. */
const tone = (seconds: number, from: number, to: number, amp: number): Pcm => {
  const frames = Math.round(seconds * RATE);
  const plane = new Float32Array(frames);
  for (let i = Math.round(from * RATE); i < Math.round(to * RATE); i++)
    plane[i] = amp * Math.sin((2 * Math.PI * 440 * i) / RATE);
  return { rate: RATE, frames, channels: [plane, plane.slice()] };
};

const GOOD: Measured = {
  seconds: 17.95,
  expectedSeconds: 17.945,
  truePeak: -2.1,
  lufs: -16.05,
  ebur128Lufs: -16.0,
  targetLufs: -16,
  peak: 0.79,
  longestQuiet: 0,
  lagMs: 4,
  stems: [{ lufs: -30, frames: 800_000, needed: 700_000 }],
  rss: { piano: 2.6e9, sampler: 0.2e9, render: 0.6e9 },
};

const FAILS: ReadonlyArray<readonly [keyof ReturnType<typeof checksOf>, Partial<Measured>]> = [
  ['length', { seconds: 18.1 }],
  ['truePeak', { truePeak: -0.5 }],
  ['loudness', { lufs: -17.5 }],
  ['loudness', { ebur128Lufs: -15.8 }],
  ['clipping', { peak: 0.9995 }],
  ['silence', { longestQuiet: 1.2 }],
  ['onsetLag', { lagMs: -31 }],
  ['stems', { stems: [{ lufs: Number.NEGATIVE_INFINITY, frames: 800_000, needed: 1 }] }],
  ['stems', { stems: [{ lufs: -30, frames: 10, needed: 11 }] }],
  ['memory', { rss: { piano: 3.1e9, sampler: 0, render: 0 } }],
  ['memory', { rss: { piano: 0, sampler: 0.6e9, render: 0 } }],
  ['memory', { rss: { piano: 0, sampler: 0, render: 1.1e9 } }],
];

describe('checksOf', () => {
  it.effect('passes a hymn inside every limit', () =>
    Effect.sync(() => {
      expect(passed(checksOf(GOOD))).toBe(true);
    }),
  );

  for (const [name, change] of FAILS)
    it.effect(`fails ${name} past its limit: ${JSON.stringify(change)}`, () =>
      Effect.sync(() => {
        const checks = checksOf({ ...GOOD, ...change });
        expect(passed(checks)).toBe(false);
        const failed = Object.entries(checks)
          .filter(([, c]) => !c.ok)
          .map(([n]) => n);
        expect(failed).toEqual([name]);
      }),
    );
});

describe('the measures', () => {
  it.effect('joins overlapping and touching spans', () =>
    Effect.sync(() => {
      expect(
        merged([
          { from: 3, to: 4 },
          { from: 0, to: 1 },
          { from: 1, to: 2 },
          { from: 3.5, to: 5 },
        ]),
      ).toEqual([
        { from: 0, to: 2 },
        { from: 3, to: 5 },
      ]);
    }),
  );

  it.effect('finds the first sound to its 10 ms window', () =>
    Effect.sync(() => {
      expect(firstSound(tone(1, 0.25, 1, 0.5), LIMITS.onsetDb)).toBeCloseTo(0.25, 2);
      expect(firstSound(tone(1, 0, 0, 0), LIMITS.onsetDb)).toBeUndefined();
    }),
  );

  it.effect('measures a quiet run only where a note sounds', () =>
    Effect.sync(() => {
      const pcm = tone(6, 0, 2, 0.5);
      expect(longestQuiet(pcm, [{ from: 0, to: 2 }], LIMITS.quiet)).toBe(0);
      const gap = longestQuiet(pcm, [{ from: 0, to: 5 }], LIMITS.quiet);
      expect(gap).toBeGreaterThan(2);
      expect(gap).toBeLessThanOrEqual(3.5);
    }),
  );

  it.effect('reads the sample peak of either channel', () =>
    Effect.sync(() => {
      expect(samplePeak(tone(0.1, 0, 0.1, 0.25))).toBeCloseTo(0.25, 3);
    }),
  );
});
