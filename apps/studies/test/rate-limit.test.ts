import { describe, expect, test } from 'bun:test';

import { makeRateLimiter } from '../src/lib/grading/rate-limit.ts';

describe('token-bucket rate limiter', () => {
  test('allows up to capacity, then blocks', () => {
    const limiter = makeRateLimiter({ capacity: 3, refillPerSecond: 0 });
    const now = 1_000_000;
    expect(limiter.take('ip', now)).toBe(true);
    expect(limiter.take('ip', now)).toBe(true);
    expect(limiter.take('ip', now)).toBe(true);
    expect(limiter.take('ip', now)).toBe(false);
  });

  test('refills over time', () => {
    const limiter = makeRateLimiter({ capacity: 2, refillPerSecond: 1 });
    const t0 = 1_000_000;
    expect(limiter.take('ip', t0)).toBe(true);
    expect(limiter.take('ip', t0)).toBe(true);
    expect(limiter.take('ip', t0)).toBe(false);
    // One second later, one token has refilled.
    expect(limiter.take('ip', t0 + 1000)).toBe(true);
    expect(limiter.take('ip', t0 + 1000)).toBe(false);
  });

  test('tracks separate buckets per key', () => {
    const limiter = makeRateLimiter({ capacity: 1, refillPerSecond: 0 });
    const now = 1_000_000;
    expect(limiter.take('a', now)).toBe(true);
    expect(limiter.take('a', now)).toBe(false);
    // A different IP has its own full bucket.
    expect(limiter.take('b', now)).toBe(true);
  });

  test('never exceeds capacity when refilling', () => {
    const limiter = makeRateLimiter({ capacity: 2, refillPerSecond: 100 });
    const t0 = 1_000_000;
    // Long idle: bucket should cap at capacity, not overflow.
    expect(limiter.take('ip', t0 + 1_000_000)).toBe(true);
    expect(limiter.take('ip', t0 + 1_000_000)).toBe(true);
    expect(limiter.take('ip', t0 + 1_000_000)).toBe(false);
  });
});
