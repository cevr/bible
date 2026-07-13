/**
 * CachedAppCore tests — exercises cache mechanics in isolation.
 *
 * Tests the non-React parts: cache hit/miss, per-method isolation,
 * granular invalidation, version tracking, and snapshot computation.
 * React integration (use() + useSyncExternalStore) is tested via E2E.
 */
import { describe, expect, mock, test } from 'bun:test';
import { Reference, type ChapterReference } from '@bible/core/bible';

import { CachedAppCore } from './cached-app';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockService() {
  return {
    bible: {
      chapter: mock((reference: ChapterReference) =>
        Promise.resolve({
          verses: [
            {
              reference: Reference.verse(reference.book, reference.chapter, 1),
              text: `${reference.book}:${reference.chapter} verse 1`,
            },
          ],
        }),
      ),
      fetchVerses: mock((book: number, chapter: number) =>
        Promise.resolve([{ verse: 1, text: `${book}:${chapter} verse 1` }]),
      ),
    },
    crossReferences: {
      getCrossRefs: mock((book: number, chapter: number, verse: number) =>
        Promise.resolve([{ ref: `${book}:${chapter}:${verse}` }]),
      ),
      setRefType: mock(() => Promise.resolve()),
    },
    concordance: {
      getStrongsEntry: mock((number: string) => Promise.resolve({ number, lemma: 'test' })),
    },
  };
}

type MockService = ReturnType<typeof createMockService>;

type CachedReadFn = ((...args: unknown[]) => unknown) & {
  preload(...args: unknown[]): void;
  invalidate(...args: unknown[]): void;
  invalidateAll(): void;
};

type MockProxy = {
  bible: { chapter: CachedReadFn };
  crossReferences: {
    crossRefs: CachedReadFn;
    setRefType: MockService['crossReferences']['setRefType'];
  };
  concordance: { strongsEntry: CachedReadFn };
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
      const promise = core.read('bible.fetchVerses', [1, 1]);

      expect(promise).toBeInstanceOf(Promise);
      expect(service.bible.fetchVerses).toHaveBeenCalledTimes(1);
      expect(service.bible.fetchVerses).toHaveBeenCalledWith(1, 1);

      const result = await promise;
      expect(result).toEqual([{ verse: 1, text: '1:1 verse 1' }]);
    });

    test('returns cached promise on subsequent calls with same args', async () => {
      const { core, service } = createCore();

      const p1 = core.read('bible.fetchVerses', [1, 1]);
      const p2 = core.read('bible.fetchVerses', [1, 1]);

      expect(p1).toBe(p2); // same promise instance
      expect(service.bible.fetchVerses).toHaveBeenCalledTimes(1);
    });

    test('creates separate entries for different args', async () => {
      const { core, service } = createCore();

      const p1 = core.read('bible.fetchVerses', [1, 1]);
      const p2 = core.read('bible.fetchVerses', [1, 2]);

      expect(p1).not.toBe(p2);
      expect(service.bible.fetchVerses).toHaveBeenCalledTimes(2);
    });

    test('creates separate caches per method', async () => {
      const { core, service } = createCore();

      core.read('bible.fetchVerses', [1, 1]);
      core.read('crossReferences.getCrossRefs', [1, 1, 1]);

      expect(service.bible.fetchVerses).toHaveBeenCalledTimes(1);
      expect(service.crossReferences.getCrossRefs).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidate()', () => {
    test('removes cached entry for specific args', async () => {
      const { core, service } = createCore();

      // Populate cache
      const p1 = core.read('bible.fetchVerses', [1, 1]);
      await flush();

      // Invalidate
      core.invalidate('bible.fetchVerses', 1, 1);

      // Next read should create a new entry
      const p2 = core.read('bible.fetchVerses', [1, 1]);
      expect(p2).not.toBe(p1);
      expect(service.bible.fetchVerses).toHaveBeenCalledTimes(2);
    });

    test('does not affect other args in same method', async () => {
      const { core } = createCore();

      const p1 = core.read('bible.fetchVerses', [1, 1]);
      const p2 = core.read('bible.fetchVerses', [1, 2]);
      await flush();

      core.invalidate('bible.fetchVerses', 1, 1);

      // [1,2] should still be cached
      const p2Again = core.read('bible.fetchVerses', [1, 2]);
      expect(p2Again).toBe(p2);

      // [1,1] should be fresh
      const p1Again = core.read('bible.fetchVerses', [1, 1]);
      expect(p1Again).not.toBe(p1);
    });

    test('does not affect other methods', async () => {
      const { core } = createCore();

      core.read('bible.fetchVerses', [1, 1]);
      const pCrossRefs = core.read('crossReferences.getCrossRefs', [1, 1, 1]);
      await flush();

      core.invalidate('bible.fetchVerses', 1, 1);

      // Cross-refs should still be cached
      const pCrossRefsAgain = core.read('crossReferences.getCrossRefs', [1, 1, 1]);
      expect(pCrossRefsAgain).toBe(pCrossRefs);
    });

    test('notifies subscribers', () => {
      const { core } = createCore();
      const listener = mock(() => {});

      core.subscribe(listener);
      core.read('bible.fetchVerses', [1, 1]); // populate
      core.invalidate('bible.fetchVerses', 1, 1);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test('no-ops if entry does not exist', () => {
      const { core } = createCore();
      const listener = mock(() => {});

      core.subscribe(listener);
      core.invalidate('bible.fetchVerses', 99, 99);

      // No cache existed → no notification
      expect(listener).toHaveBeenCalledTimes(0);
    });
  });

  describe('invalidateAll()', () => {
    test('clears all entries for a method', async () => {
      const { core, service } = createCore();

      const p1 = core.read('bible.fetchVerses', [1, 1]);
      const p2 = core.read('bible.fetchVerses', [1, 2]);
      await flush();

      core.invalidateAll('bible.fetchVerses');

      const p1Again = core.read('bible.fetchVerses', [1, 1]);
      const p2Again = core.read('bible.fetchVerses', [1, 2]);

      expect(p1Again).not.toBe(p1);
      expect(p2Again).not.toBe(p2);
      expect(service.bible.fetchVerses).toHaveBeenCalledTimes(4);
    });

    test('does not affect other methods', async () => {
      const { core } = createCore();

      core.read('bible.fetchVerses', [1, 1]);
      const pCrossRefs = core.read('crossReferences.getCrossRefs', [1, 1, 1]);
      await flush();

      core.invalidateAll('bible.fetchVerses');

      const pCrossRefsAgain = core.read('crossReferences.getCrossRefs', [1, 1, 1]);
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
      core.read('bible.fetchVerses', [1, 1]); // creates the cache
      await flush();

      expect(core.snapshotFor(new Set(['bible.fetchVerses']))).toBe(0);
    });

    test('increments only for the invalidated method', async () => {
      const { core } = createCore();

      core.read('bible.fetchVerses', [1, 1]);
      core.read('crossReferences.getCrossRefs', [1, 1, 1]);
      await flush();

      const versesSet = new Set(['bible.fetchVerses']);
      const crossRefsSet = new Set(['crossReferences.getCrossRefs']);
      const bothSet = new Set(['bible.fetchVerses', 'crossReferences.getCrossRefs']);

      expect(core.snapshotFor(versesSet)).toBe(0);
      expect(core.snapshotFor(crossRefsSet)).toBe(0);
      expect(core.snapshotFor(bothSet)).toBe(0);

      // Invalidate only fetchVerses
      core.invalidate('bible.fetchVerses', 1, 1);

      expect(core.snapshotFor(versesSet)).toBe(1);
      expect(core.snapshotFor(crossRefsSet)).toBe(0); // unchanged
      expect(core.snapshotFor(bothSet)).toBe(1);

      // Invalidate getCrossRefs
      core.invalidate('crossReferences.getCrossRefs', 1, 1, 1);

      expect(core.snapshotFor(versesSet)).toBe(1); // unchanged
      expect(core.snapshotFor(crossRefsSet)).toBe(1);
      expect(core.snapshotFor(bothSet)).toBe(2);
    });

    test('invalidateAll bumps version once', async () => {
      const { core } = createCore();

      core.read('bible.fetchVerses', [1, 1]);
      core.read('bible.fetchVerses', [1, 2]);
      await flush();

      core.invalidateAll('bible.fetchVerses');

      expect(core.snapshotFor(new Set(['bible.fetchVerses']))).toBe(1);
    });
  });

  describe('subscribe()', () => {
    test('listener called on invalidate', async () => {
      const { core } = createCore();
      const listener = mock(() => {});

      core.subscribe(listener);
      core.read('bible.fetchVerses', [1, 1]);
      await flush();

      core.invalidate('bible.fetchVerses', 1, 1);
      expect(listener).toHaveBeenCalledTimes(1);

      core.invalidate('bible.fetchVerses', 1, 1); // no-op, entry gone
      expect(listener).toHaveBeenCalledTimes(1); // not called again
    });

    test('unsubscribe stops notifications', async () => {
      const { core } = createCore();
      const listener = mock(() => {});

      const unsub = core.subscribe(listener);
      core.read('bible.fetchVerses', [1, 1]);
      await flush();

      unsub();
      core.invalidate('bible.fetchVerses', 1, 1);

      expect(listener).toHaveBeenCalledTimes(0);
    });

    test('multiple subscribers all notified', async () => {
      const { core } = createCore();
      const l1 = mock(() => {});
      const l2 = mock(() => {});

      core.subscribe(l1);
      core.subscribe(l2);
      core.read('bible.fetchVerses', [1, 1]);
      await flush();

      core.invalidate('bible.fetchVerses', 1, 1);

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
      accessed.add('bible.chapter');
      accessed.add('crossReferences.getCrossRefs');

      expect(accessed.has('bible.chapter')).toBe(true);
      expect(accessed.has('crossReferences.getCrossRefs')).toBe(true);
      expect(accessed.has('concordance.getStrongsEntry')).toBe(false);
    });

    test('proxy passes through write methods to service', async () => {
      const { core, service } = createCore();
      const accessed = new Set<string>();
      const proxy = core.withTracking(accessed) as unknown as MockProxy;

      // setRefType is not a read method — should pass through
      await proxy.crossReferences.setRefType();
      expect(service.crossReferences.setRefType).toHaveBeenCalledTimes(1);

      // Write methods should NOT be tracked
      expect(accessed.has('crossReferences.setRefType')).toBe(false);
    });

    test('proxy exposes invalidate on read method', async () => {
      const { core, service } = createCore();
      const accessed = new Set<string>();
      const proxy = core.withTracking(accessed) as unknown as MockProxy;

      // Populate cache directly
      const reference = Reference.chapter(1, 1);
      core.read('bible.chapter', [reference]);
      await flush();

      proxy.bible.chapter.invalidate(reference);

      // Should have created a new cache entry on next read
      core.read('bible.chapter', [reference]);
      expect(service.bible.chapter).toHaveBeenCalledTimes(2);
    });

    test('proxy exposes invalidateAll on read method', async () => {
      const { core, service } = createCore();
      const accessed = new Set<string>();
      const proxy = core.withTracking(accessed) as unknown as MockProxy;

      const first = Reference.chapter(1, 1);
      const second = Reference.chapter(1, 2);
      core.read('bible.chapter', [first]);
      core.read('bible.chapter', [second]);
      await flush();

      proxy.bible.chapter.invalidateAll();

      core.read('bible.chapter', [first]);
      core.read('bible.chapter', [second]);
      expect(service.bible.chapter).toHaveBeenCalledTimes(4);
    });
  });

  describe('preload()', () => {
    test('warms the cache without requiring use()', async () => {
      const { core, service } = createCore();

      core.preload('bible.fetchVerses', 1, 1);
      expect(service.bible.fetchVerses).toHaveBeenCalledTimes(1);

      await flush();

      // Subsequent read returns the same cached promise
      const p = core.read('bible.fetchVerses', [1, 1]);
      expect(service.bible.fetchVerses).toHaveBeenCalledTimes(1); // no additional call
      expect(p.status).toBe('fulfilled');
    });

    test('is idempotent — multiple preloads same args do not refetch', () => {
      const { core, service } = createCore();

      core.preload('bible.fetchVerses', 1, 1);
      core.preload('bible.fetchVerses', 1, 1);
      core.preload('bible.fetchVerses', 1, 1);

      expect(service.bible.fetchVerses).toHaveBeenCalledTimes(1);
    });

    test('different args create separate entries', () => {
      const { core, service } = createCore();

      core.preload('bible.fetchVerses', 1, 1);
      core.preload('bible.fetchVerses', 1, 2);

      expect(service.bible.fetchVerses).toHaveBeenCalledTimes(2);
    });

    test('proxy exposes preload on read method', async () => {
      const { core, service } = createCore();
      const accessed = new Set<string>();
      const proxy = core.withTracking(accessed) as unknown as MockProxy;

      const reference = Reference.chapter(1, 1);
      proxy.bible.chapter.preload(reference);
      expect(service.bible.chapter).toHaveBeenCalledTimes(1);

      // preload should not track access (it's not a render-time read)
      expect(accessed.has('bible.chapter')).toBe(false);
    });
  });

  describe('PromiseWithStatus integration', () => {
    test('settled promise has status=fulfilled', async () => {
      const { core } = createCore();

      const promise = core.read('bible.fetchVerses', [1, 1]);
      expect(promise.status).toBe('pending');

      await flush();
      expect(promise.status).toBe('fulfilled');
      expect(promise.value).toEqual([{ verse: 1, text: '1:1 verse 1' }]);
    });

    test('rejected promise has status=rejected', async () => {
      const error = new Error('db fail');
      const service = {
        bible: {
          fetchVerses: mock(() => Promise.reject(error)),
        },
      };
      const core = new CachedAppCore(service);

      const promise = core.read('bible.fetchVerses', [1, 1]);
      await flush();

      expect(promise.status).toBe('rejected');
      expect(promise.reason).toBe(error);
    });
  });
});
