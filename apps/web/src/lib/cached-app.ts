/**
 * CachedApp — transparent caching proxy for AppService.
 *
 * Read methods return T (via React 19's `use()`) instead of Promise<T>.
 * Write methods pass through as-is.
 * Invalidation is granular — per method + args.
 *
 * The useApp() hook subscribes to cache changes via useSyncExternalStore.
 * Only caches accessed during the render are tracked, so invalidating
 * an unrelated cache won't trigger a re-render.
 */
import { use } from 'react';

import { createCache, type Cache } from './cache';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Service methods whose results are cached and read synchronously via Suspense. */
export type ReadMethod =
  | 'fetchChapter'
  | 'fetchVerses'
  | 'searchVerses'
  | 'searchVersesWithCount'
  | 'getPosition'
  | 'getBookmarks'
  | 'getHistory'
  | 'getPreferences'
  | 'getCrossRefs'
  | 'getStrongsEntry'
  | 'getVerseWords'
  | 'getMarginNotes'
  | 'getChapterMarginNotes'
  | 'searchByStrongs'
  | 'getVerseNotes'
  | 'getChapterMarkers'
  | 'getEgwCommentary'
  | 'getCollections'
  | 'getVerseCollections'
  | 'getCollectionVerses'
  | 'fetchEgwBooks'
  | 'fetchEgwChapterContent'
  | 'fetchEgwChapters'
  | 'getEgwNotes'
  | 'getEgwChapterMarkers'
  | 'getEgwParagraphCollections'
  | 'getPlans'
  | 'getPlanItems'
  | 'getPlanProgress'
  | 'getMemoryVerses'
  | 'getPracticeHistory'
  | 'searchTopics'
  | 'getTopic'
  | 'getTopicVerses'
  | 'getVerseTopics'
  | 'getTopicChildren'
  | 'getRootTopics'
  | 'getTopicsByLetter';

/** Strips get/fetch prefix — cache consumers don't need the verb. */
type StripPrefix<S extends string> = S extends `fetch${infer R}`
  ? Uncapitalize<R>
  : S extends `get${infer R}`
    ? Uncapitalize<R>
    : S;

/** Maps service method names to their cached (prefix-stripped) names. */
type CachedMethodName<K> = K extends ReadMethod ? StripPrefix<K & string> : K;

const READ_METHODS: ReadMethod[] = [
  'fetchChapter',
  'fetchVerses',
  'searchVerses',
  'searchVersesWithCount',
  'getPosition',
  'getBookmarks',
  'getHistory',
  'getPreferences',
  'getCrossRefs',
  'getStrongsEntry',
  'getVerseWords',
  'getMarginNotes',
  'getChapterMarginNotes',
  'searchByStrongs',
  'getVerseNotes',
  'getChapterMarkers',
  'getEgwCommentary',
  'getCollections',
  'getVerseCollections',
  'getCollectionVerses',
  'fetchEgwBooks',
  'fetchEgwChapterContent',
  'fetchEgwChapters',
  'getEgwNotes',
  'getEgwChapterMarkers',
  'getEgwParagraphCollections',
  'getPlans',
  'getPlanItems',
  'getPlanProgress',
  'getMemoryVerses',
  'getPracticeHistory',
  'searchTopics',
  'getTopic',
  'getTopicVerses',
  'getVerseTopics',
  'getTopicChildren',
  'getRootTopics',
  'getTopicsByLetter',
];

/** Maps cached (prefix-stripped) proxy names back to service method names. */
const PROXY_TO_SERVICE: Record<string, string> = {};
for (const method of READ_METHODS) {
  const stripped = method
    .replace(/^fetch/, '')
    .replace(/^get/, '')
    .replace(/^./, (c) => c.toLowerCase());
  PROXY_TO_SERVICE[stripped] = method;
}
// search* methods keep their names
for (const method of READ_METHODS) {
  if (method.startsWith('search')) {
    PROXY_TO_SERVICE[method] = method;
  }
}

/**
 * A read method that also exposes cache operations.
 * Callable to suspend + return T, with .preload/.invalidate/.invalidateAll.
 */
type CachedReadFn<A extends unknown[], R> = ((...args: A) => R) & {
  preload(...args: A): void;
  invalidate(...args: A): void;
  invalidateAll(): void;
};

/**
 * Maps a service type:
 * - Read methods → prefix-stripped CachedReadFn (callable + cache ops)
 * - Write methods → pass through unchanged
 */
export type CachedService<S> = {
  [K in keyof S as CachedMethodName<K>]: K extends ReadMethod
    ? S[K] extends (...args: infer A) => Promise<infer R>
      ? CachedReadFn<A, R>
      : S[K]
    : S[K];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read the internal version counter from a Cache (attached by createCache). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cacheSnapshot(cache: Cache<any[], any>): number {
  return (cache as unknown as { getSnapshot: () => number }).getSnapshot();
}

// ---------------------------------------------------------------------------
// CacheWithVersion — Cache + per-cache version counter
// ---------------------------------------------------------------------------

interface CacheWithVersion {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cache: Cache<any[], any>;
  version: number;
}

// ---------------------------------------------------------------------------
// CachedAppCore — owns all caches, exposes subscription for useSyncExternalStore
// ---------------------------------------------------------------------------

export class CachedAppCore {
  private caches = new Map<string, CacheWithVersion>();
  private listeners = new Set<() => void>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private service: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(service: any) {
    this.service = service;
  }

  /** Get or create the cache for a read method. */
  private getOrCreateCache(method: string): CacheWithVersion {
    let entry = this.caches.get(method);
    if (entry) return entry;

    const fn = this.service[method];
    if (typeof fn !== 'function') {
      throw new Error(`Method ${method} not found on service`);
    }

    entry = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cache: createCache((...args: any[]) => fn.apply(this.service, args)),
      version: 0,
    };
    this.caches.set(method, entry);
    return entry;
  }

  /** Read from cache — returns the PromiseWithStatus (caller must use() it). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  read(method: string, args: any[]): any {
    const entry = this.getOrCreateCache(method);
    return entry.cache.get(...args);
  }

  /** Invalidate a specific cache entry. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invalidate(method: string, ...args: any[]): void {
    const entry = this.caches.get(method);
    if (!entry) return;
    const before = cacheSnapshot(entry.cache);
    entry.cache.invalidate(...args);
    if (cacheSnapshot(entry.cache) !== before) {
      entry.version++;
      this.notify();
    }
  }

  /** Warm the cache for a read method without suspending. Fire-and-forget. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preload(method: string, ...args: any[]): void {
    this.read(method, args);
  }

  /** Invalidate all entries for a method. */
  invalidateAll(method: string): void {
    const entry = this.caches.get(method);
    if (!entry) return;
    const before = cacheSnapshot(entry.cache);
    entry.cache.invalidateAll();
    if (cacheSnapshot(entry.cache) !== before) {
      entry.version++;
      this.notify();
    }
  }

  /** Composite snapshot of only the accessed caches. */
  snapshotFor(accessed: Set<string>): number {
    let sum = 0;
    for (const method of accessed) {
      const entry = this.caches.get(method);
      if (entry) sum += entry.version;
    }
    return sum;
  }

  /** Subscribe to invalidation events (for useSyncExternalStore). */
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  /**
   * Create a proxy that:
   * - Intercepts read methods → cache.get() + use()
   * - Records accessed method names in the tracking set
   * - Passes write methods through to the service
   * - Exposes invalidate/invalidateAll
   */
  withTracking(accessed: Set<string>): unknown {
    const read = this.read.bind(this);
    const preload = this.preload.bind(this);
    const invalidate = this.invalidate.bind(this);
    const invalidateAll = this.invalidateAll.bind(this);

    return new Proxy(this.service, {
      get(target: Record<string, unknown>, prop: string | symbol, receiver: unknown) {
        if (typeof prop !== 'string') return Reflect.get(target, prop, receiver);

        const serviceMethod = PROXY_TO_SERVICE[prop];
        if (serviceMethod) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fn = (...args: any[]) => {
            accessed.add(serviceMethod);
            const promise = read(serviceMethod, args) as Promise<unknown>;
            return use(promise);
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fn.preload = (...args: any[]) => preload(serviceMethod, ...args);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fn.invalidate = (...args: any[]) => invalidate(serviceMethod, ...args);
          fn.invalidateAll = () => invalidateAll(serviceMethod);
          return fn;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createCachedApp(service: any): CachedAppCore {
  return new CachedAppCore(service);
}
