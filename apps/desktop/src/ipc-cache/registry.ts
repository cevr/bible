import type { Effect } from 'effect';
import { Cause, Exit, Schema } from 'effect';
import { createResource, onCleanup, type Resource } from 'solid-js';
import type { CacheKey } from './key.js';

export type Entry<T> = {
  readonly key: CacheKey;
  readonly path: string;
  readonly resource: Resource<T>;
  readonly refetch: () => void;
  readonly mutateValue: (value: T) => void;
  /**
   * Number of live Solid scopes currently reading this entry. The registry
   * uses this to decide when to schedule eviction — but with the default
   * "infinite TTL" policy, evictAt stays null and entries linger until
   * explicit invalidation.
   */
  refcount: number;
  /**
   * Wall-clock ms at which this entry becomes eligible for eviction.
   * `null` means never (infinite TTL). Set when refcount drops to 0.
   */
  evictAt: number | null;
  /**
   * Per-entry TTL in ms, captured from `query` options at first creation.
   * `null` means infinite. Subsequent calls with a different TTL don't
   * overwrite — first writer wins, to keep eviction policy stable.
   */
  ttlMs: number | null;
  evictTimer: ReturnType<typeof setTimeout> | null;
};

export type QueryOptions = {
  /**
   * Per-entry TTL in ms. Default `null` (infinite — entries stay until
   * explicit `.invalidate(...)`). Set to a number to override.
   */
  readonly ttlMs?: number | null;
};

const entries = new Map<CacheKey, Entry<unknown>>();

/**
 * Subscribe to an entry from a Solid reactive scope. Bumps the refcount,
 * registers an `onCleanup` to decrement on scope teardown. The returned
 * resource is the same instance shared across all subscribers — refetching
 * one component refetches them all.
 */
export const subscribe = <T>(
  key: CacheKey,
  path: string,
  fetcher: () => Promise<T>,
  options: QueryOptions = {},
): Entry<T> => {
  // Generic erasure: the entries map stores Entry<unknown> to share state across
  // call sites with different T's. The proxy preserves T at the boundary via
  // makeCacheKey/path; the runtime payload is structurally identical.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  let entry = entries.get(key) as Entry<T> | undefined;

  if (entry === undefined) {
    // First subscriber. createResource takes a fetcher; the returned tuple
    // exposes the accessor (suspends + throws integrated with <Suspense> /
    // <ErrorBoundary>) plus mutate/refetch handles.
    const [resource, { mutate, refetch }] = createResource<T>(fetcher);
    entry = {
      key,
      path,
      resource,
      refetch: () => {
        void refetch();
      },
      mutateValue: mutate,
      refcount: 0,
      evictAt: null,
      ttlMs: options.ttlMs ?? null,
      evictTimer: null,
    };
    // Mirror image of the get-side cast: the map's value type is Entry<unknown>
    // because it serves multiple T's. See note on the get above.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    entries.set(key, entry as Entry<unknown>);
  } else if (entry.evictTimer !== null) {
    // Resurrected before the TTL fired. Cancel the pending eviction.
    clearTimeout(entry.evictTimer);
    entry.evictTimer = null;
    entry.evictAt = null;
  }

  entry.refcount += 1;
  const captured = entry;
  onCleanup(() => {
    captured.refcount -= 1;
    if (captured.refcount === 0) {
      scheduleEviction(captured);
    }
  });

  return entry;
};

const scheduleEviction = <T>(entry: Entry<T>): void => {
  if (entry.ttlMs === null) {
    // Infinite TTL — keep the entry, but record that it's eviction-eligible
    // if the caller ever decides to flush stale-but-unused entries (e.g. on
    // memory pressure, or via a future `ipc.gc()` hook).
    entry.evictAt = null;
    return;
  }
  entry.evictAt = Date.now() + entry.ttlMs;
  entry.evictTimer = setTimeout(() => {
    // Recheck — refcount may have bumped during the timer (race-safe because
    // setTimeout fires on the same JS thread, so the refcount we read here is
    // the live value).
    if (entry.refcount === 0) {
      entries.delete(entry.key);
    }
    entry.evictTimer = null;
  }, entry.ttlMs);
};

/**
 * Drop the cache entry for `key`. If subscribers exist, they'll see a
 * refetch (createResource's refetch); if no subscribers, the entry is
 * removed from the map entirely.
 */
export const invalidate = (key: CacheKey): void => {
  const entry = entries.get(key);
  if (entry === undefined) return;
  if (entry.refcount > 0) {
    entry.refetch();
  } else {
    if (entry.evictTimer !== null) clearTimeout(entry.evictTimer);
    entries.delete(key);
  }
};

/**
 * Drop every entry whose path starts with `prefix`. Useful for "invalidate
 * all queries under egw.*" after a logout, settings change, etc.
 */
export const invalidatePrefix = (prefix: string): void => {
  for (const [key, entry] of entries) {
    if (!entry.path.startsWith(prefix)) continue;
    if (entry.refcount > 0) {
      entry.refetch();
    } else {
      if (entry.evictTimer !== null) clearTimeout(entry.evictTimer);
      entries.delete(key);
    }
  }
};

export const clearAll = (): void => {
  for (const entry of entries.values()) {
    if (entry.evictTimer !== null) clearTimeout(entry.evictTimer);
  }
  entries.clear();
};

/**
 * Tagged error wrapping an Effect `Cause` so `<ErrorBoundary>` and downstream
 * callers can pattern-match. Created with Schema so it's serializable and
 * yields a usable `_tag` for `catchTag` / `Schema.is`. The `path` field
 * disambiguates errors when one boundary catches failures from multiple
 * procedures.
 */
export class IpcCacheError extends Schema.TaggedErrorClass<IpcCacheError>(
  '@bible/desktop/ipc-cache/IpcCacheError',
)('IpcCacheError', {
  path: Schema.String,
  message: Schema.String,
}) {}

/**
 * Run an Effect-producing fetcher to a Promise via the renderer's shared
 * ManagedRuntime. Wraps a failed `Exit` in an `IpcCacheError` so the thrown
 * value is a proper tagged Effect error rather than a bare Cause.
 */
export const runFetcher = <T, E>(
  effect: Effect.Effect<T, E>,
  runtime: { runPromiseExit: <A, X>(effect: Effect.Effect<A, X>) => Promise<Exit.Exit<A, X>> },
  path: string,
): Promise<T> =>
  runtime.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit)) return exit.value;
    throw new IpcCacheError({ path, message: Cause.pretty(exit.cause) });
  });
