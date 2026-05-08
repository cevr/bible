/**
 * Promise Cache
 *
 * A simple caching layer for async functions that returns
 * promises with status tracking for synchronous reads.
 */

import { defer, resolvedPromise, type Deferred, type PromiseWithStatus } from './promise.js';

interface CacheEntry<T> {
  promise: PromiseWithStatus<T>;
  deferred: Deferred<T> | null;
  timestamp: number;
}

export interface CacheOptions {
  /** Custom key generation function */
  getKey?: (args: unknown[]) => string;
}

export type LoadFn<Args extends unknown[], T> = (...args: Args) => Promise<T>;

/**
 * Create a cache for an async function.
 *
 * @example
 * ```typescript
 * const userCache = createCache(async (userId: string) => {
 *   const response = await fetch(`/api/users/${userId}`);
 *   return response.json();
 * });
 *
 * // First call - fetches data
 * const user1 = userCache.get('123');
 *
 * // Second call - returns cached promise
 * const user2 = userCache.get('123');
 *
 * // Check if resolved without suspending
 * const cached = userCache.peek('123');
 * ```
 */
export function createCache<Args extends unknown[], T>(
  load: LoadFn<Args, T>,
  options: CacheOptions = {},
) {
  const cache = new Map<string, CacheEntry<T>>();
  const { getKey = defaultGetKey } = options;

  /**
   * Get a cached promise or create a new one.
   * Returns a PromiseWithStatus that can be read synchronously if resolved.
   */
  function get(...args: Args): PromiseWithStatus<T> {
    const key = getKey(args);
    const existing = cache.get(key);

    if (existing) {
      return existing.promise;
    }

    // Create new entry
    const deferred = defer<T>();
    const entry: CacheEntry<T> = {
      promise: deferred.promise,
      deferred,
      timestamp: Date.now(),
    };
    cache.set(key, entry);

    // Start loading
    load(...args)
      .then((value) => {
        deferred.resolve(value);
        entry.deferred = null;
      })
      .catch((error) => {
        deferred.reject(error);
        entry.deferred = null;
      });

    return deferred.promise;
  }

  /**
   * Set a cached value directly (bypasses load function).
   */
  function set(...argsAndValue: [...Args, T]): void {
    const value = argsAndValue.pop() as T;
    const args = argsAndValue as unknown as Args;
    const key = getKey(args);

    cache.set(key, {
      promise: resolvedPromise(value),
      deferred: null,
      timestamp: Date.now(),
    });
  }

  /**
   * Peek at a cached value without triggering a fetch.
   * Returns undefined if not cached or not yet resolved.
   */
  function peek(...args: Args): T | undefined {
    const key = getKey(args);
    const entry = cache.get(key);
    if (entry?.promise.status === 'fulfilled') {
      return entry.promise.value;
    }
    return undefined;
  }

  /**
   * Check if a key is in the cache (regardless of status).
   */
  function has(...args: Args): boolean {
    return cache.has(getKey(args));
  }

  /**
   * Invalidate a cached entry and trigger a fresh fetch.
   */
  function invalidate(...args: Args): PromiseWithStatus<T> {
    cache.delete(getKey(args));
    return get(...args);
  }

  /**
   * Remove a cached entry without triggering a fetch.
   */
  function remove(...args: Args): boolean {
    return cache.delete(getKey(args));
  }

  /**
   * Clear all cached entries.
   */
  function clear(): void {
    cache.clear();
  }

  return {
    get,
    set,
    peek,
    has,
    invalidate,
    delete: remove,
    clear,
  };
}

function defaultGetKey(args: unknown[]): string {
  if (args.length === 0) return '()';
  return `(${args.map((arg) => JSON.stringify(arg)).join(':')})`;
}
