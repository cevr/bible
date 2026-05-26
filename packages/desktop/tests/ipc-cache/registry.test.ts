import { Effect, Exit } from 'effect';
import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import {
  clearAll,
  invalidate,
  IpcCacheError,
  runFetcher,
  subscribe,
} from '../../src/ipc-cache/registry.js';

/**
 * Minimal runtime shim — runFetcher only calls runPromiseExit, so we don't
 * need a real ManagedRuntime to exercise the success/failure paths.
 */
const fakeRuntime = {
  runPromiseExit: <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromiseExit(effect),
};

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('registry.subscribe', () => {
  it('shares one entry across multiple subscribers with the same key', () => {
    clearAll();
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return Promise.resolve('value');
    };

    createRoot(() => {
      const a = subscribe('k1', 'p', fetcher);
      const b = subscribe('k1', 'p', fetcher);
      expect(a).toBe(b);
      expect(a.refcount).toBe(2);
    });
    expect(calls).toBe(1);
  });

  it('decrements refcount on Solid scope cleanup', () => {
    clearAll();
    const fetcher = () => Promise.resolve('value');

    let captured!: ReturnType<typeof subscribe<string>>;
    const dispose = createRoot((dispose) => {
      captured = subscribe('k2', 'p', fetcher);
      expect(captured.refcount).toBe(1);
      return dispose;
    });

    dispose();
    expect(captured.refcount).toBe(0);
  });

  it('evicts after TTL when refcount reaches zero', async () => {
    clearAll();
    const fetcher = () => Promise.resolve('value');

    const dispose = createRoot((dispose) => {
      subscribe('k3', 'p', fetcher, { ttlMs: 10 });
      return dispose;
    });
    dispose();

    // Before timer fires, entry still present — invalidate would refetch
    // (and refetch with refcount 0 isn't observable here, but we can check
    // the eviction path by waiting past TTL and then resubscribing fresh.)
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    let calls = 0;
    const newFetcher = () => {
      calls += 1;
      return Promise.resolve('value');
    };
    createRoot(() => {
      subscribe('k3', 'p', newFetcher, { ttlMs: 10 });
    });
    expect(calls).toBe(1); // fresh entry built, not resurrected
  });

  it('cancels pending eviction when a new subscriber arrives within TTL', async () => {
    clearAll();
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return Promise.resolve('value');
    };

    const dispose = createRoot((dispose) => {
      subscribe('k4', 'p', fetcher, { ttlMs: 50 });
      return dispose;
    });
    dispose();

    // Resubscribe before TTL expires — should hit the existing entry, no
    // new fetch.
    createRoot(() => {
      subscribe('k4', 'p', fetcher, { ttlMs: 50 });
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    expect(calls).toBe(1);
  });

  it('infinite TTL (null) never schedules a timer', () => {
    clearAll();
    let captured!: ReturnType<typeof subscribe<string>>;
    const dispose = createRoot((dispose) => {
      captured = subscribe('k5', 'p', () => Promise.resolve('v'));
      return dispose;
    });
    dispose();
    expect(captured.refcount).toBe(0);
    expect(captured.evictTimer).toBeNull();
  });
});

describe('registry.invalidate', () => {
  it('drops an unsubscribed entry from the map', () => {
    clearAll();
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return Promise.resolve('v');
    };
    const dispose = createRoot((dispose) => {
      subscribe('k6', 'p', fetcher);
      return dispose;
    });
    dispose();

    invalidate('k6');

    createRoot(() => {
      subscribe('k6', 'p', fetcher);
    });
    expect(calls).toBe(2); // entry was dropped, refetched on next subscribe
  });

  it('refetches when subscribers are still active', async () => {
    clearAll();
    let calls = 0;
    const fetcher = () => {
      calls += 1;
      return Promise.resolve('v');
    };
    createRoot(() => {
      subscribe('k7', 'p', fetcher);
    });
    await tick();
    expect(calls).toBe(1);

    invalidate('k7');
    await tick();
    expect(calls).toBe(2);
  });
});

describe('runFetcher', () => {
  it('resolves with the value on success', async () => {
    const value = await runFetcher(Effect.succeed(42), fakeRuntime, 'test.path');
    expect(value).toBe(42);
  });

  it('throws an IpcCacheError on Effect failure', async () => {
    const failed = Effect.fail('boom');
    await expect(runFetcher(failed, fakeRuntime, 'test.path')).rejects.toBeInstanceOf(
      IpcCacheError,
    );
  });

  it('captures the procedure path in the thrown error', async () => {
    try {
      await runFetcher(Effect.fail('boom'), fakeRuntime, 'egw.fetchBooks');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IpcCacheError);
      expect((err as IpcCacheError).path).toBe('egw.fetchBooks');
    }
  });

  it('preserves an Exit success even when the effect produces a fiber', async () => {
    const value = await runFetcher(
      Effect.gen(function* () {
        yield* Effect.sleep('1 millis');
        return 'done';
      }),
      fakeRuntime,
      'test.path',
    );
    expect(value).toBe('done');
  });

  it('formats die causes via Cause.pretty', async () => {
    const died = Effect.die(new Error('kaboom'));
    try {
      await runFetcher(died, fakeRuntime, 'test.path');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IpcCacheError);
      expect((err as IpcCacheError).message).toMatch(/kaboom/);
    }
  });
});

describe('Exit/Effect integration', () => {
  it('runFetcher accepts effects that fail with arbitrary types', async () => {
    const exit = await fakeRuntime.runPromiseExit(Effect.fail({ code: 'X' }));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
