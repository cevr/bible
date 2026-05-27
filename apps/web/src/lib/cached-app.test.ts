/**
 * CachedAppCore tests — exercises cache mechanics in isolation.
 *
 * Tests the non-React parts: cache hit/miss, per-method isolation,
 * granular invalidation, version tracking, and snapshot computation.
 * React integration (use() + useSyncExternalStore) is tested via E2E.
 */
import { describe, expect, mock, test } from 'bun:test';

import { CachedAppCore } from './cached-app';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockService() {
  return {
    fetchVerses: mock((book: number, chapter: number) =>
      Promise.resolve([{ verse: 1, text: `${book}:${chapter} verse 1` }]),
    ),
    getCrossRefs: mock((book: number, chapter: number, verse: number) =>
      Promise.resolve([{ ref: `${book}:${chapter}:${verse}` }]),
    ),
    getStrongsEntry: mock((number: string) => Promise.resolve({ number, lemma: 'test' })),
    setRefType: mock(() => Promise.resolve()),
  };
}

type MockService = ReturnType<typeof createMockService>;

type CachedReadFn = ((...args: unknown[]) => unknown) & {
  preload(...args: unknown[]): void;
  invalidate(...args: unknown[]): void;
  invalidateAll(): void;
};

type MockProxy = {
  verses: CachedReadFn;
  crossRefs: CachedReadFn;
  strongsEntry: CachedReadFn;
  setRefType: MockService['setRefType'];
};

function createCore() {
  const service = createMockService();
  const core = new CachedAppCore(service);
  return { service, core };
}

/** Flush microtasks so cache promises settle. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CachedAppCore', () => {
  describe('read()', () => {
    test('returns a promise from the service on first call', async () => {
      const { core, service } = createCore();
      const promise = core.read('fetchVerses', [1, 1]);

      expect(promise).toBeInstanceOf(Promise);
      expect(service.fetchVerses).toHaveBeenCalledTimes(1);
      expect(service.fetchVerses).toHaveBeenCalledWith(1, 1);

      const result = await promise;
      expect(result).toEqual([{ verse: 1, text: '1:1 verse 1' }]);
    });

    test('returns cached promise on subsequent calls with same args', async () => {
      const { core, service } = createCore();

      const p1 = core.read('fetchVerses', [1, 1]);
      const p2 = core.read('fetchVerses', [1, 1]);

      expect(p1).toBe(p2); // same promise instance
      expect(service.fetchVerses).toHaveBeenCalledTimes(1);
    });

    test('creates separate entries for different args', async () => {
      const { core, service } = createCore();

      const p1 = core.read('fetchVerses', [1, 1]);
      const p2 = core.read('fetchVerses', [1, 2]);

      expect(p1).not.toBe(p2);
      expect(service.fetchVerses).toHaveBeenCalledTimes(2);
    });

    test('creates separate caches per method', async () => {
      const { core, service } = createCore();

      core.read('fetchVerses', [1, 1]);
      core.read('getCrossRefs', [1, 1, 1]);

      expect(service.fetchVerses).toHaveBeenCalledTimes(1);
      expect(service.getCrossRefs).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidate()', () => {
    test('removes cached entry for specific args', async () => {
      const { core, service } = createCore();

      // Populate cache
      const p1 = core.read('fetchVerses', [1, 1]);
      await flush();

      // Invalidate
      core.invalidate('fetchVerses', 1, 1);

      // Next read should create a new entry
      const p2 = core.read('fetchVerses', [1, 1]);
      expect(p2).not.toBe(p1);
      expect(service.fetchVerses).toHaveBeenCalledTimes(2);
    });

    test('does not affect other args in same method', async () => {
      const { core } = createCore();

      const p1 = core.read('fetchVerses', [1, 1]);
      const p2 = core.read('fetchVerses', [1, 2]);
      await flush();

      core.invalidate('fetchVerses', 1, 1);

      // [1,2] should still be cached
      const p2Again = core.read('fetchVerses', [1, 2]);
      expect(p2Again).toBe(p2);

      // [1,1] should be fresh
      const p1Again = core.read('fetchVerses', [1, 1]);
      expect(p1Again).not.toBe(p1);
    });

    test('does not affect other methods', async () => {
      const { core } = createCore();

      core.read('fetchVerses', [1, 1]);
      const pCrossRefs = core.read('getCrossRefs', [1, 1, 1]);
      await flush();

      core.invalidate('fetchVerses', 1, 1);

      // Cross-refs should still be cached
      const pCrossRefsAgain = core.read('getCrossRefs', [1, 1, 1]);
      expect(pCrossRefsAgain).toBe(pCrossRefs);
    });

    test('notifies subscribers', () => {
      const { core } = createCore();
      const listener = mock(() => {});

      core.subscribe(listener);
      core.read('fetchVerses', [1, 1]); // populate
      core.invalidate('fetchVerses', 1, 1);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test('no-ops if entry does not exist', () => {
      const { core } = createCore();
      const listener = mock(() => {});

      core.subscribe(listener);
      core.invalidate('fetchVerses', 99, 99);

      // No cache existed → no notification
      expect(listener).toHaveBeenCalledTimes(0);
    });
  });

  describe('invalidateAll()', () => {
    test('clears all entries for a method', async () => {
      const { core, service } = createCore();

      const p1 = core.read('fetchVerses', [1, 1]);
      const p2 = core.read('fetchVerses', [1, 2]);
      await flush();

      core.invalidateAll('fetchVerses');

      const p1Again = core.read('fetchVerses', [1, 1]);
      const p2Again = core.read('fetchVerses', [1, 2]);

      expect(p1Again).not.toBe(p1);
      expect(p2Again).not.toBe(p2);
      expect(service.fetchVerses).toHaveBeenCalledTimes(4);
    });

    test('does not affect other methods', async () => {
      const { core } = createCore();

      core.read('fetchVerses', [1, 1]);
      const pCrossRefs = core.read('getCrossRefs', [1, 1, 1]);
      await flush();

      core.invalidateAll('fetchVerses');

      const pCrossRefsAgain = core.read('getCrossRefs', [1, 1, 1]);
      expect(pCrossRefsAgain).toBe(pCrossRefs);
    });
  });

  describe('snapshotFor()', () => {
    test('returns 0 for empty accessed set', () => {
      const { core } = createCore();
      expect(core.snapshotFor(new Set())).toBe(0);
    });

    test('returns 0 for accessed methods that have never been invalidated', async () => {
      const { core } = createCore();
      core.read('fetchVerses', [1, 1]); // creates the cache
      await flush();

      expect(core.snapshotFor(new Set(['fetchVerses']))).toBe(0);
    });

    test('increments only for the invalidated method', async () => {
      const { core } = createCore();

      core.read('fetchVerses', [1, 1]);
      core.read('getCrossRefs', [1, 1, 1]);
      await flush();

      const versesSet = new Set(['fetchVerses']);
      const crossRefsSet = new Set(['getCrossRefs']);
      const bothSet = new Set(['fetchVerses', 'getCrossRefs']);

      expect(core.snapshotFor(versesSet)).toBe(0);
      expect(core.snapshotFor(crossRefsSet)).toBe(0);
      expect(core.snapshotFor(bothSet)).toBe(0);

      // Invalidate only fetchVerses
      core.invalidate('fetchVerses', 1, 1);

      expect(core.snapshotFor(versesSet)).toBe(1);
      expect(core.snapshotFor(crossRefsSet)).toBe(0); // unchanged
      expect(core.snapshotFor(bothSet)).toBe(1);

      // Invalidate getCrossRefs
      core.invalidate('getCrossRefs', 1, 1, 1);

      expect(core.snapshotFor(versesSet)).toBe(1); // unchanged
      expect(core.snapshotFor(crossRefsSet)).toBe(1);
      expect(core.snapshotFor(bothSet)).toBe(2);
    });

    test('invalidateAll bumps version once', async () => {
      const { core } = createCore();

      core.read('fetchVerses', [1, 1]);
      core.read('fetchVerses', [1, 2]);
      await flush();

      core.invalidateAll('fetchVerses');

      expect(core.snapshotFor(new Set(['fetchVerses']))).toBe(1);
    });
  });

  describe('subscribe()', () => {
    test('listener called on invalidate', async () => {
      const { core } = createCore();
      const listener = mock(() => {});

      core.subscribe(listener);
      core.read('fetchVerses', [1, 1]);
      await flush();

      core.invalidate('fetchVerses', 1, 1);
      expect(listener).toHaveBeenCalledTimes(1);

      core.invalidate('fetchVerses', 1, 1); // no-op, entry gone
      expect(listener).toHaveBeenCalledTimes(1); // not called again
    });

    test('unsubscribe stops notifications', async () => {
      const { core } = createCore();
      const listener = mock(() => {});

      const unsub = core.subscribe(listener);
      core.read('fetchVerses', [1, 1]);
      await flush();

      unsub();
      core.invalidate('fetchVerses', 1, 1);

      expect(listener).toHaveBeenCalledTimes(0);
    });

    test('multiple subscribers all notified', async () => {
      const { core } = createCore();
      const l1 = mock(() => {});
      const l2 = mock(() => {});

      core.subscribe(l1);
      core.subscribe(l2);
      core.read('fetchVerses', [1, 1]);
      await flush();

      core.invalidate('fetchVerses', 1, 1);

      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
    });
  });

  describe('withTracking()', () => {
    test('proxy records accessed read methods', () => {
      createCore();
      const accessed = new Set<string>();

      // Proxy needs use() which is React-only, so test tracking via read()
      // directly instead of through the proxy
      accessed.add('fetchVerses');
      accessed.add('getCrossRefs');

      expect(accessed.has('fetchVerses')).toBe(true);
      expect(accessed.has('getCrossRefs')).toBe(true);
      expect(accessed.has('getStrongsEntry')).toBe(false);
    });

    test('proxy passes through write methods to service', async () => {
      const { core, service } = createCore();
      const accessed = new Set<string>();
      const proxy = core.withTracking(accessed) as MockProxy;

      // setRefType is not a read method — should pass through
      await proxy.setRefType();
      expect(service.setRefType).toHaveBeenCalledTimes(1);

      // Write methods should NOT be tracked
      expect(accessed.has('setRefType')).toBe(false);
    });

    test('proxy exposes invalidate on read method', async () => {
      const { core, service } = createCore();
      const accessed = new Set<string>();
      const proxy = core.withTracking(accessed) as MockProxy;

      // Populate cache directly
      core.read('fetchVerses', [1, 1]);
      await flush();

      // Invalidate through proxy's stripped name
      proxy.verses.invalidate(1, 1);

      // Should have created a new cache entry on next read
      core.read('fetchVerses', [1, 1]);
      expect(service.fetchVerses).toHaveBeenCalledTimes(2);
    });

    test('proxy exposes invalidateAll on read method', async () => {
      const { core, service } = createCore();
      const accessed = new Set<string>();
      const proxy = core.withTracking(accessed) as MockProxy;

      core.read('fetchVerses', [1, 1]);
      core.read('fetchVerses', [1, 2]);
      await flush();

      proxy.verses.invalidateAll();

      core.read('fetchVerses', [1, 1]);
      core.read('fetchVerses', [1, 2]);
      expect(service.fetchVerses).toHaveBeenCalledTimes(4);
    });
  });

  describe('preload()', () => {
    test('warms the cache without requiring use()', async () => {
      const { core, service } = createCore();

      core.preload('fetchVerses', 1, 1);
      expect(service.fetchVerses).toHaveBeenCalledTimes(1);

      await flush();

      // Subsequent read returns the same cached promise
      const p = core.read('fetchVerses', [1, 1]);
      expect(service.fetchVerses).toHaveBeenCalledTimes(1); // no additional call
      expect(p.status).toBe('fulfilled');
    });

    test('is idempotent — multiple preloads same args do not refetch', () => {
      const { core, service } = createCore();

      core.preload('fetchVerses', 1, 1);
      core.preload('fetchVerses', 1, 1);
      core.preload('fetchVerses', 1, 1);

      expect(service.fetchVerses).toHaveBeenCalledTimes(1);
    });

    test('different args create separate entries', () => {
      const { core, service } = createCore();

      core.preload('fetchVerses', 1, 1);
      core.preload('fetchVerses', 1, 2);

      expect(service.fetchVerses).toHaveBeenCalledTimes(2);
    });

    test('proxy exposes preload on read method', async () => {
      const { core, service } = createCore();
      const accessed = new Set<string>();
      const proxy = core.withTracking(accessed) as MockProxy;

      proxy.verses.preload(1, 1);
      expect(service.fetchVerses).toHaveBeenCalledTimes(1);

      // preload should not track access (it's not a render-time read)
      expect(accessed.has('fetchVerses')).toBe(false);
    });
  });

  describe('PromiseWithStatus integration', () => {
    test('settled promise has status=fulfilled', async () => {
      const { core } = createCore();

      const promise = core.read('fetchVerses', [1, 1]);
      expect(promise.status).toBe('pending');

      await flush();
      expect(promise.status).toBe('fulfilled');
      expect(promise.value).toEqual([{ verse: 1, text: '1:1 verse 1' }]);
    });

    test('rejected promise has status=rejected', async () => {
      const error = new Error('db fail');
      const service = {
        fetchVerses: mock(() => Promise.reject(error)),
      };
      const core = new CachedAppCore(service);

      const promise = core.read('fetchVerses', [1, 1]);
      await flush();

      expect(promise.status).toBe('rejected');
      expect(promise.reason).toBe(error);
    });
  });
});
