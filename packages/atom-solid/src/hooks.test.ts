import { describe, expect, it } from 'effect-bun-test';

import { Cause, Effect, Exit } from 'effect';
import * as AsyncResult from 'effect/unstable/reactivity/AsyncResult';
import * as Atom from 'effect/unstable/reactivity/Atom';
import * as AtomRegistry from 'effect/unstable/reactivity/AtomRegistry';
import * as AtomRef from 'effect/unstable/reactivity/AtomRef';
import {
  createRenderEffect,
  createRoot,
  createSignal,
  DEV,
  flush,
  onCleanup,
  resolve,
} from 'solid-js';

import {
  useAtom,
  useAtomInitialValues,
  useAtomMount,
  useAtomRef,
  useAtomRefProp,
  useAtomRefPropValue,
  useAtomRefresh,
  useAtomSet,
  useAtomSubscribe,
  useAtomSuspense,
  useAtomValue,
} from './hooks.js';
import { RegistryContext } from './registry-context.js';

const settle = Effect.gen(function* () {
  yield* Effect.yieldNow;
  flush();
});

interface Mounted<A> {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly result: A;
  /** Disposes the Solid owner, leaving the registry usable for assertions. */
  readonly disposeOwner: () => void;
  readonly dispose: () => void;
}

/**
 * Runs `body` inside a Solid root against a registry of its own.
 *
 * The hooks resolve their registry through `useContext(RegistryContext)`, which
 * returns the context default when no provider is mounted. Pointing that
 * default at a fresh registry per test exercises the real lookup path while
 * keeping tests isolated — mounting `RegistryProvider` instead would need a JSX
 * runtime, which the bun test environment does not compile.
 */
const mount = <A>(body: () => A): Mounted<A> => {
  const registry = AtomRegistry.make();
  RegistryContext.defaultValue = registry;
  return createRoot((dispose) => ({
    registry,
    disposeOwner: dispose,
    dispose: () => {
      dispose();
      registry.dispose();
    },
    result: body(),
  }));
};

describe('useAtomValue', () => {
  const test = it.scoped;

  test('seeds the accessor immediately and tracks later writes', () =>
    Effect.gen(function* () {
      const counter = Atom.make(0);
      const owned = mount(() => useAtomValue(() => counter));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(owned.result()).toBe(0);

      owned.registry.set(counter, 1);
      yield* settle;
      expect(owned.result()).toBe(1);
    }));

  test('maps the atom value through the selector', () =>
    Effect.gen(function* () {
      const counter = Atom.make(2);
      const owned = mount(() =>
        useAtomValue(
          () => counter,
          (n) => `count-${n}`,
        ),
      );
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(owned.result()).toBe('count-2');

      owned.registry.set(counter, 3);
      yield* settle;
      expect(owned.result()).toBe('count-3');
    }));

  test('unsubscribes from the registry when the owner is disposed', () =>
    Effect.gen(function* () {
      const counter = Atom.make(0).pipe(Atom.keepAlive);
      const owned = mount(() => useAtomValue(() => counter));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));
      yield* settle;

      const node = owned.registry.getNodes().get(counter);
      expect(node?.listeners.size).toBe(1);

      owned.disposeOwner();
      yield* settle;
      expect(node?.listeners.size).toBe(0);
    }));
});

describe('useAtom', () => {
  const test = it.scoped;

  test('writes through the setter and reflects the write in the accessor', () =>
    Effect.gen(function* () {
      const counter = Atom.make(0);
      const owned = mount(() => useAtom(() => counter));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));
      const [value, setValue] = owned.result;

      yield* settle;
      expect(value()).toBe(0);

      setValue(5);
      yield* settle;
      expect(value()).toBe(5);
    }));

  test('accepts an updater function that reads the current value', () =>
    Effect.gen(function* () {
      const counter = Atom.make(10);
      const owned = mount(() => useAtom(() => counter));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));
      const [value, setValue] = owned.result;

      yield* settle;
      setValue((current) => current + 5);
      yield* settle;

      expect(value()).toBe(15);
      expect(owned.registry.get(counter)).toBe(15);
    }));
});

describe('useAtomSet', () => {
  const test = it.scoped;

  test('writes without subscribing and keeps the atom mounted', () =>
    Effect.gen(function* () {
      const counter = Atom.make(0);
      const owned = mount(() => useAtomSet(() => counter));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(owned.registry.getNodes().get(counter)?.listeners.size).toBe(1);

      owned.result(7);
      expect(owned.registry.get(counter)).toBe(7);
    }));
});

describe('useAtomMount', () => {
  const test = it.scoped;

  test('mounts for the owner lifetime and releases on disposal', () =>
    Effect.gen(function* () {
      const counter = Atom.make(0).pipe(Atom.keepAlive);
      const owned = mount(() => useAtomMount(() => counter));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));
      yield* settle;

      const node = owned.registry.getNodes().get(counter);
      expect(node?.listeners.size).toBe(1);

      owned.disposeOwner();
      yield* settle;
      expect(node?.listeners.size).toBe(0);
    }));
});

describe('useAtomRefresh', () => {
  const test = it.scoped;

  test('re-evaluates the atom when the returned callback runs', () =>
    Effect.gen(function* () {
      let reads = 0;
      const counter = Atom.make(() => {
        reads += 1;
        return reads;
      });
      const owned = mount(() => ({
        value: useAtomValue(() => counter),
        refresh: useAtomRefresh(() => counter),
      }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(owned.result.value()).toBe(1);

      owned.result.refresh();
      yield* settle;
      expect(owned.result.value()).toBe(2);
    }));
});

describe('useAtomSubscribe', () => {
  const test = it.scoped;

  test('delivers writes to the callback and stops after disposal', () =>
    Effect.gen(function* () {
      const counter = Atom.make(0);
      const seen: Array<number> = [];
      const owned = mount(() => {
        useAtomSubscribe(
          () => counter,
          (n) => seen.push(n),
        );
      });

      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      owned.registry.set(counter, 1);
      yield* settle;
      expect(seen).toEqual([1]);

      owned.disposeOwner();
      yield* settle;
      owned.registry.set(counter, 2);
      yield* settle;
      expect(seen).toEqual([1]);
    }));

  test('emits the current value up front when immediate is set', () =>
    Effect.gen(function* () {
      const counter = Atom.make(3);
      const seen: Array<number> = [];
      const owned = mount(() => {
        useAtomSubscribe(
          () => counter,
          (n) => seen.push(n),
          { immediate: true },
        );
      });
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(seen).toEqual([3]);
    }));
});

describe('useAtomInitialValues', () => {
  const test = it.scoped;

  test('seeds the first value per atom and ignores later seeds', () =>
    Effect.gen(function* () {
      const counter = Atom.make(0).pipe(Atom.keepAlive);
      const owned = mount(() => {
        useAtomInitialValues([[counter, 42]]);
        useAtomInitialValues([[counter, 99]]);
        return useAtomValue(() => counter);
      });
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(owned.result()).toBe(42);
    }));
});

describe('RegistryContext', () => {
  const test = it.scoped;

  test('isolates atom state between two registries', () =>
    Effect.gen(function* () {
      const counter = Atom.make(0);
      const one = mount(() => useAtomValue(() => counter));
      const two = mount(() => useAtomValue(() => counter));
      yield* Effect.addFinalizer(() => Effect.sync(one.dispose));
      yield* Effect.addFinalizer(() => Effect.sync(two.dispose));

      yield* settle;
      one.registry.set(counter, 1);
      yield* settle;

      expect(one.result()).toBe(1);
      expect(two.result()).toBe(0);
    }));
});

describe('AsyncResult atoms', () => {
  const test = it.scoped;

  test('moves an Atom.fn from initial to success', () =>
    Effect.gen(function* () {
      const double = Atom.fn((n: number) => Effect.succeed(n * 2));
      const owned = mount(() => useAtom(() => double));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));
      const [result, run] = owned.result;

      yield* settle;
      expect(AsyncResult.isInitial(result())).toBe(true);

      run(21);
      yield* settle;

      const current = result();
      expect(AsyncResult.isSuccess(current)).toBe(true);
      if (AsyncResult.isSuccess(current)) expect(current.value).toBe(42);
    }));

  test('resolves the promise mode setter with the success value', () =>
    Effect.gen(function* () {
      const double = Atom.fn((n: number) => Effect.succeed(n * 2));
      const owned = mount(() => useAtomSet(() => double, { mode: 'promise' as const }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      expect(yield* Effect.promise(() => owned.result(4))).toBe(8);
    }));
});

describe('useAtomSuspense', () => {
  const test = it.scoped;

  test('resolves to the success value once the result settles', () =>
    Effect.gen(function* () {
      const answer = Atom.make(Effect.succeed(7));
      const owned = mount(() => useAtomSuspense(() => answer));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(yield* Effect.promise(() => resolve(owned.result))).toBe(7);
    }));

  test('rejects with the squashed cause when the result fails', () =>
    Effect.gen(function* () {
      const failing = Atom.make(Effect.fail('boom'));
      const owned = mount(() => useAtomSuspense(() => failing));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      const exit = yield* Effect.exit(Effect.promise(() => resolve(owned.result)));
      expect(Exit.isFailure(exit)).toBe(true);
    }));

  test('rejects with the exact squashed error, not a wrapper', () =>
    Effect.gen(function* () {
      const boom = { _tag: 'Exploded' as const, detail: 'exact identity' };
      const failing = Atom.make(Effect.fail(boom));
      const owned = mount(() => useAtomSuspense(() => failing));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      const exit = yield* Effect.exit(Effect.tryPromise(() => resolve(owned.result)));

      // `Cause.squash` unwraps a single-failure cause to its own error value, so
      // the accessor rejects with the original error identity, not a `Cause`
      // wrapper. `Effect.tryPromise` re-wraps that rejection once in an
      // `UnknownError`, whose `cause` carries it through unchanged.
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const squashed = Cause.squash(exit.cause);
        expect(squashed).toBeInstanceOf(Cause.UnknownError);
        if (squashed instanceof Cause.UnknownError) expect(squashed.cause).toBe(boom);
      }
    }));

  test('suspends again on every refresh cycle', () =>
    Effect.gen(function* () {
      let runs = 0;
      const slow = Atom.make(
        Effect.sleep('5 millis').pipe(
          Effect.map(() => {
            runs += 1;
            return runs;
          }),
        ),
      ).pipe(Atom.keepAlive);
      const owned = mount(() => ({
        value: useAtomSuspense(() => slow, { suspendOnWaiting: true }),
        raw: useAtomValue(() => slow),
        refresh: useAtomRefresh(() => slow),
      }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      // Cycle one starts from `Initial`.
      expect(AsyncResult.isInitial(owned.result.raw())).toBe(true);
      expect(yield* Effect.promise(() => resolve(owned.result.value))).toBe(1);

      // Cycle two re-enters the waiting state, which `suspendOnWaiting` treats
      // as suspending even though a previous success is still readable.
      owned.result.refresh();
      yield* settle;
      const refreshing = owned.result.raw();
      expect(AsyncResult.isSuccess(refreshing)).toBe(true);
      expect(refreshing.waiting).toBe(true);
      expect(yield* Effect.promise(() => resolve(owned.result.value))).toBe(2);

      // Cycle three proves the memo is not latched to the first resolution.
      owned.result.refresh();
      yield* settle;
      expect(yield* Effect.promise(() => resolve(owned.result.value))).toBe(3);
    }));
});

describe('atom thunk changes', () => {
  const test = it.scoped;

  test('useAtomValue moves its subscription to the newly selected atom', () =>
    Effect.gen(function* () {
      const first = Atom.make(1).pipe(Atom.keepAlive);
      const second = Atom.make(100).pipe(Atom.keepAlive);
      // The swap signal is written from outside every owned scope, so it needs
      // `ownedWrite` for the same reason the bridge signals do.
      const [selected, select] = createSignal<Atom.Atom<number>>(first, { ownedWrite: true });
      const owned = mount(() => useAtomValue(() => selected()));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(owned.result()).toBe(1);
      expect(owned.registry.getNodes().get(first)?.listeners.size).toBe(1);
      expect(owned.registry.getNodes().get(second)).toBeUndefined();

      select(() => second);
      yield* settle;
      expect(owned.result()).toBe(100);
      // Exactly one listener moves: the old atom is released, the new one holds
      // a single subscription rather than accumulating one per re-track.
      expect(owned.registry.getNodes().get(first)?.listeners.size).toBe(0);
      expect(owned.registry.getNodes().get(second)?.listeners.size).toBe(1);

      // A write to the abandoned atom no longer reaches the accessor.
      owned.registry.set(first, 2);
      yield* settle;
      expect(owned.result()).toBe(100);

      owned.disposeOwner();
      yield* settle;
      expect(owned.registry.getNodes().get(second)?.listeners.size).toBe(0);
    }));

  test('useAtomSubscribe moves its callback to the newly selected atom', () =>
    Effect.gen(function* () {
      const first = Atom.make(0).pipe(Atom.keepAlive);
      const second = Atom.make(0).pipe(Atom.keepAlive);
      const [selected, select] = createSignal<Atom.Atom<number>>(first, { ownedWrite: true });
      const seen: Array<number> = [];
      const owned = mount(() => {
        useAtomSubscribe(
          () => selected(),
          (n) => seen.push(n),
        );
      });
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      owned.registry.set(first, 1);
      yield* settle;
      expect(seen).toEqual([1]);

      select(() => second);
      yield* settle;
      expect(owned.registry.getNodes().get(first)?.listeners.size).toBe(0);
      expect(owned.registry.getNodes().get(second)?.listeners.size).toBe(1);

      // The old atom is silent; the new one is heard exactly once per write.
      owned.registry.set(first, 9);
      owned.registry.set(second, 5);
      yield* settle;
      expect(seen).toEqual([1, 5]);
    }));

  test('useAtomMount moves its mount to the newly selected atom', () =>
    Effect.gen(function* () {
      const first = Atom.make(0).pipe(Atom.keepAlive);
      const second = Atom.make(0).pipe(Atom.keepAlive);
      const [selected, select] = createSignal<Atom.Atom<number>>(first, { ownedWrite: true });
      const owned = mount(() => {
        useAtomMount(() => selected());
      });
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(owned.registry.getNodes().get(first)?.listeners.size).toBe(1);

      select(() => second);
      yield* settle;
      expect(owned.registry.getNodes().get(first)?.listeners.size).toBe(0);
      expect(owned.registry.getNodes().get(second)?.listeners.size).toBe(1);
    }));
});

describe('useAtomSubscribe phase', () => {
  const test = it.scoped;

  test('runs the immediate callback after render, not during it', () =>
    Effect.gen(function* () {
      const counter = Atom.make(3);
      const seen: Array<number> = [];
      const owned = mount(() => {
        useAtomSubscribe(
          () => counter,
          (n) => seen.push(n),
          { immediate: true },
        );
        // `useAtomSubscribe` is a user effect, so nothing has been delivered by
        // the time the surrounding component body finishes.
        return seen.slice();
      });
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      expect(owned.result).toEqual([]);
      yield* settle;
      expect(seen).toEqual([3]);
    }));

  test('runs after the render effects that seed accessors', () =>
    Effect.gen(function* () {
      const counter = Atom.make(11).pipe(Atom.keepAlive);
      const order: Array<string> = [];
      const owned = mount(() => {
        useAtomSubscribe(
          () => counter,
          (n) => order.push(`subscribe-${n}`),
          { immediate: true },
        );
        const value = useAtomValue(() => counter);
        // A sibling render effect stands in for a JSX binding: it observes the
        // accessor in the same phase a rendered view would.
        createRenderEffect(
          () => value(),
          (current) => {
            // Dev mode requires an effect callback to return a cleanup function
            // or nothing, so the push result must not leak out of the body.
            order.push(`render-${current}`);
          },
        );
      });
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      // `useAtomValue` is a render effect and `useAtomSubscribe` is a user
      // effect, so within one flush the accessor is seeded before the caller's
      // subscription callback fires. Making `useAtomSubscribe` a render effect
      // would reverse this order.
      expect(order).toEqual(['render-11', 'subscribe-11']);
    }));
});

describe('useAtomRef', () => {
  const test = it.scoped;

  test('seeds from the ref and tracks later writes', () =>
    Effect.gen(function* () {
      const ref = AtomRef.make({ n: 1 });
      const owned = mount(() => useAtomRef(() => ref));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(owned.result()).toEqual({ n: 1 });

      ref.set({ n: 2 });
      yield* settle;
      expect(owned.result()).toEqual({ n: 2 });
    }));

  test('stops following the ref once the owner is disposed', () =>
    Effect.gen(function* () {
      const ref = AtomRef.make({ n: 1 });
      const owned = mount(() => useAtomRef(() => ref));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      owned.disposeOwner();
      yield* settle;

      ref.set({ n: 3 });
      yield* settle;
      expect(owned.result()).toEqual({ n: 1 });
    }));

  test('re-subscribes when the selected ref changes', () =>
    Effect.gen(function* () {
      const first = AtomRef.make('a');
      const second = AtomRef.make('b');
      const [selected, select] = createSignal<AtomRef.AtomRef<string>>(first, {
        ownedWrite: true,
      });
      const owned = mount(() => useAtomRef(() => selected()));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(owned.result()).toBe('a');

      select(() => second);
      yield* settle;
      expect(owned.result()).toBe('b');

      // The abandoned ref no longer drives the accessor.
      first.set('a2');
      yield* settle;
      expect(owned.result()).toBe('b');

      second.set('b2');
      yield* settle;
      expect(owned.result()).toBe('b2');
    }));

  test('reads a property ref and its value', () =>
    Effect.gen(function* () {
      const ref = AtomRef.make({ count: 1, label: 'one' });
      const owned = mount(() => ({
        prop: useAtomRefProp(() => ref, 'count'),
        value: useAtomRefPropValue(() => ref, 'count'),
      }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(owned.result.prop().value).toBe(1);
      expect(owned.result.value()).toBe(1);

      owned.result.prop().set(7);
      yield* settle;
      expect(owned.result.value()).toBe(7);
      expect(ref.value.count).toBe(7);
    }));
});

describe('first synchronous read', () => {
  const test = it.scoped;

  /**
   * Every value-carrying accessor is typed `Accessor<A>`, with no `undefined`
   * in the union, so a read taken in the same synchronous pass that created the
   * hook must already yield the real value. A signal alone cannot honour that:
   * Solid 2 queues the seeding write until the next flush, so the accessor
   * would return `undefined` until then. These tests read the accessor inside
   * the `mount` body — before any `flush()` or `settle` — which is the earliest
   * point a component could observe it.
   */
  test('useAtomValue returns the seeded value before any flush', () =>
    Effect.gen(function* () {
      const counter = Atom.make(42);
      const owned = mount(() => useAtomValue(() => counter)());
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      expect(owned.result).toBe(42);
    }));

  test('useAtomValue returns the mapped value before any flush', () =>
    Effect.gen(function* () {
      const counter = Atom.make(2);
      const owned = mount(() =>
        useAtomValue(
          () => counter,
          (n) => `count-${n}`,
        )(),
      );
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      expect(owned.result).toBe('count-2');
    }));

  test('useAtom returns the seeded value before any flush', () =>
    Effect.gen(function* () {
      const counter = Atom.make(7);
      const owned = mount(() => useAtom(() => counter)[0]());
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      expect(owned.result).toBe(7);
    }));

  test('useAtomRef returns the seeded value before any flush', () =>
    Effect.gen(function* () {
      const ref = AtomRef.make({ n: 5 });
      const owned = mount(() => useAtomRef(() => ref)());
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      expect(owned.result).toEqual({ n: 5 });
    }));

  test('useAtomRefPropValue returns the seeded value before any flush', () =>
    Effect.gen(function* () {
      const ref = AtomRef.make({ count: 9, label: 'nine' });
      const owned = mount(() => useAtomRefPropValue(() => ref, 'count')());
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      expect(owned.result).toBe(9);
    }));

  /**
   * The value lives in a plain cell and the signal only notifies, so the two
   * could drift apart: an update that writes the cell without marking the
   * accessor dirty would still read correctly here but never re-run a tracking
   * computation. This asserts both halves at once — a synchronously fresh cell
   * *and* a live dependency edge — across a write that happens after mount.
   */
  test('a write is visible synchronously and still notifies trackers', () =>
    Effect.gen(function* () {
      const counter = Atom.make(0).pipe(Atom.keepAlive);
      const seen: Array<number> = [];
      const owned = mount(() => {
        const value = useAtomValue(() => counter);
        createRenderEffect(
          () => value(),
          (current) => {
            seen.push(current);
          },
        );
        return value;
      });
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(seen).toEqual([0]);

      // Read immediately after the registry write, with no flush in between.
      owned.registry.set(counter, 1);
      expect(owned.result()).toBe(1);

      // The tracking computation still re-runs on the next flush, proving the
      // notifier half of the bridge kept its dependency edge.
      yield* settle;
      expect(seen).toEqual([0, 1]);
    }));
});

describe('promise setter modes', () => {
  const test = it.scoped;

  test('keeps both result channels in the setter types', () =>
    Effect.gen(function* () {
      const atom = Atom.fn((n: number) => {
        if (n < 0) return Effect.fail(`negative:${n}`);
        return Effect.succeed(n * 2);
      });
      const owned = mount(() => ({
        promise: useAtomSet(() => atom, { mode: 'promise' as const }),
        promiseExit: useAtomSet(() => atom, { mode: 'promiseExit' as const }),
      }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      // `asAsyncResultAtom` preserves `AsyncResult.Success<R>` and
      // `AsyncResult.Failure<R>`, so both channels stay named rather than
      // widening to `unknown`. These annotated bindings are the assertion: a
      // widened channel fails `tsc`, which the package gate runs.
      const success: Promise<number> = owned.result.promise(3);
      const exit: Promise<Exit.Exit<number, string>> = owned.result.promiseExit(4);

      expect(yield* Effect.promise(() => success)).toBe(6);
      const settled = yield* Effect.promise(() => exit);
      expect(Exit.isSuccess(settled)).toBe(true);
      if (Exit.isSuccess(settled)) expect(settled.value).toBe(8);
    }));

  const doubleOrFail = () =>
    Atom.fn((n: number) => {
      if (n < 0) return Effect.fail(`negative:${n}`);
      return Effect.succeed(n * 2);
    });

  test('promiseExit mode resolves with a success Exit', () =>
    Effect.gen(function* () {
      const atom = doubleOrFail();
      const owned = mount(() => useAtomSet(() => atom, { mode: 'promiseExit' as const }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      const exit = yield* Effect.promise(() => owned.result(6));
      expect(Exit.isSuccess(exit)).toBe(true);
      if (Exit.isSuccess(exit)) expect(exit.value).toBe(12);
    }));

  test('promiseExit mode resolves with a failure Exit rather than rejecting', () =>
    Effect.gen(function* () {
      const atom = doubleOrFail();
      const owned = mount(() => useAtomSet(() => atom, { mode: 'promiseExit' as const }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      const exit = yield* Effect.promise(() => owned.result(-3));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBe('negative:-3');
    }));

  test('promise mode rejects with the squashed error when the effect fails', () =>
    Effect.gen(function* () {
      const atom = doubleOrFail();
      const owned = mount(() => useAtomSet(() => atom, { mode: 'promise' as const }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      const exit = yield* Effect.exit(Effect.tryPromise(() => owned.result(-5)));

      // `flattenExit` throws `Cause.squash(cause)`, so the rejection carries the
      // original failure value, not the `Exit` or the `Cause`. `tryPromise`
      // re-wraps it once in an `UnknownError`.
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const squashed = Cause.squash(exit.cause);
        expect(squashed).toBeInstanceOf(Cause.UnknownError);
        if (squashed instanceof Cause.UnknownError) expect(squashed.cause).toBe('negative:-5');
      }
    }));
});

describe('RegistryProvider cleanup order', () => {
  const test = it.scoped;

  /**
   * `RegistryProvider` registers `onCleanup(() => registry.dispose())` before
   * its children run, and Solid runs cleanups in registration order, so the
   * registry is disposed while hook unsubscribes are still pending. This test
   * reproduces that order without a JSX runtime and asserts the unsubscribes
   * neither throw nor leave listeners behind.
   */
  test('disposes the registry before hook unsubscribes without leaking or throwing', () =>
    Effect.gen(function* () {
      const counter = Atom.make(0).pipe(Atom.keepAlive);
      const registry = AtomRegistry.make({ defaultIdleTTL: 400 });
      RegistryContext.defaultValue = registry;
      const events: Array<string> = [];

      const owned = createRoot((dispose) => {
        onCleanup(() => {
          events.push('registry-dispose');
          registry.dispose();
        });
        const value = useAtomValue(() => counter);
        onCleanup(() => events.push('child-cleanup'));
        return { value, dispose };
      });
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      yield* settle;
      expect(owned.value()).toBe(0);
      const node = registry.getNodes().get(counter);
      expect(node?.listeners.size).toBe(1);

      owned.dispose();
      yield* settle;

      expect(events).toEqual(['registry-dispose', 'child-cleanup']);
      expect(node?.listeners.size).toBe(0);
      expect(registry.getNodes().size).toBe(0);
    }));
});

describe('Solid development mode', () => {
  const test = it.scoped;

  /**
   * The package tests run under `--conditions=browser --conditions=development`,
   * which resolves `solid-js` to `dist/dev.js`. Only that build exports a `DEV`
   * object — the production build exports `undefined` — so this assertion fails
   * the moment the test script loses either condition and the owned-scope write
   * guard stops running.
   *
   * Guarding by marker rather than by triggering the error is deliberate: an
   * uncaught owned-scope write halts Solid's scheduler process-wide
   * (`REACTIVITY_HALTED`), which would poison every test that followed it.
   */
  test('runs against the development build of solid-js', () => {
    expect(DEV).toBeDefined();
    return Effect.void;
  });

  test('accepts an owned-scope write when the signal declares ownedWrite', () =>
    Effect.gen(function* () {
      const owned = createRoot((dispose) => {
        // The same write on a signal without `ownedWrite` throws
        // `REACTIVE_WRITE_IN_OWNED_SCOPE` under this build — which is exactly
        // what the bridge signals in `hooks.ts` avoid.
        const [value, setValue] = createSignal(0, { ownedWrite: true });
        setValue(1);
        return { value, dispose };
      });
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      // The write is accepted but batched, so it lands on the next flush.
      yield* settle;
      expect(owned.value()).toBe(1);
    }));
});
