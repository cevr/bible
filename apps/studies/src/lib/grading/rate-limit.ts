/*
 * Tiny in-memory per-IP token bucket. The grading endpoint is stateless and runs
 * as a single process, so an in-memory limiter is enough to bound abuse/cost
 * without accounts or a datastore (see docs/adr/0002 — no server DB). If the
 * service is ever scaled to multiple processes this must move to a shared store.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimiter {
  /** Returns true if the request is allowed (and consumes a token). */
  readonly take: (key: string, now: number) => boolean;
}

export interface RateLimitOptions {
  /** Max requests in a full bucket. */
  readonly capacity: number;
  /** Tokens added per second (sustained rate). */
  readonly refillPerSecond: number;
}

/**
 * Create a token-bucket rate limiter. `now` is passed in (ms epoch) so the limiter
 * is deterministic and testable rather than reading the clock itself.
 */
export function makeRateLimiter(options: RateLimitOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    take: (key, now) => {
      const existing = buckets.get(key);
      const bucket: Bucket = existing ?? { tokens: options.capacity, lastRefill: now };

      // Refill based on elapsed time.
      const elapsedSeconds = Math.max(0, (now - bucket.lastRefill) / 1000);
      bucket.tokens = Math.min(
        options.capacity,
        bucket.tokens + elapsedSeconds * options.refillPerSecond,
      );
      bucket.lastRefill = now;

      let allowed = false;
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        allowed = true;
      }

      buckets.set(key, bucket);
      return allowed;
    },
  };
}
