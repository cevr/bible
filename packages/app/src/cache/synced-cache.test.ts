import { describe, expect, it } from 'effect-bun-test';

import { Cause, Effect, Exit, Fiber } from 'effect';
import { createRoot, flush, resolve } from 'solid-js';

import { createSyncedCache, defaultCacheRuntime, IpcCacheError } from './synced-cache.js';

const settle = Effect.gen(function* () {
  yield* Effect.yieldNow;
  flush();
});

const waitFor = (condition: () => boolean): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (condition()) return;
      yield* Effect.yieldNow;
    }
    return yield* Effect.die('condition did not settle');
  });

describe('createSyncedCache', () => {
  const test = it.scoped;

  test('uses structural keys and returns one stable accessor per input', () =>
    Effect.gen(function* () {
      let lookups = 0;
      const owned = createRoot((dispose) => ({
        dispose,
        cache: createSyncedCache({
          name: 'structural',
          runtime: defaultCacheRuntime,
          lookup: (input: { readonly id: number }) =>
            Effect.sync(() => {
              lookups += 1;
              return `value-${input.id}`;
            }),
          mutate: (_command: never) => Effect.void,
          affects: (_command: never): ReadonlyArray<never> => [],
          matches: (_input: { readonly id: number }, _scope: never) => false,
        }),
      }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      const first = owned.cache.get({ id: 1 });
      const same = owned.cache.get({ id: 1 });

      expect(same).toBe(first);
      expect(yield* Effect.tryPromise(() => resolve(first))).toBe('value-1');
      expect(lookups).toBe(1);
      yield* settle;
      expect(owned.cache.status({ id: 1 })()).toEqual({ state: 'ready' });
    }));

  test('treats omitted and explicit empty structural inputs as the same key', () =>
    Effect.gen(function* () {
      let lookups = 0;
      const owned = createRoot((dispose) => ({
        dispose,
        cache: createSyncedCache({
          name: 'empty-input',
          runtime: defaultCacheRuntime,
          emptyInput: {},
          lookup: (_input: {}) =>
            Effect.sync(() => {
              lookups += 1;
              return 'ready';
            }),
          mutate: (_command: never) => Effect.void,
          affects: (_command: never): ReadonlyArray<never> => [],
          matches: (_input: {}, _scope: never) => false,
        }),
      }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));

      const omitted = owned.cache.get();
      const explicit = owned.cache.get({});
      expect(explicit).toBe(omitted);
      expect(yield* Effect.tryPromise(() => resolve(omitted))).toBe('ready');
      yield* settle;
      expect(owned.cache.status()).toBe(owned.cache.status({}));
      expect(lookups).toBe(1);
    }));

  test('normalizes initial failures and retains the error in status', () =>
    Effect.gen(function* () {
      const owned = createRoot((dispose) => ({
        dispose,
        cache: createSyncedCache({
          name: 'failure',
          runtime: defaultCacheRuntime,
          lookup: (_input: { readonly id: number }) => Effect.fail('not found'),
          mutate: (_command: never) => Effect.void,
          affects: (_command: never): ReadonlyArray<never> => [],
          matches: (_input: { readonly id: number }, _scope: never) => false,
        }),
      }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));
      const value = owned.cache.get({ id: 1 });

      const result = yield* Effect.exit(Effect.tryPromise(() => resolve(value)));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.squash(result.cause);
        expect(Cause.isUnknownError(failure)).toBe(true);
        if (Cause.isUnknownError(failure)) {
          expect(failure.cause).toBeInstanceOf(IpcCacheError);
        }
      }
      yield* settle;

      const status = owned.cache.status({ id: 1 })();
      expect(status.state).toBe('failed');
      if (status.state === 'failed') expect(status.error).toBeInstanceOf(IpcCacheError);
    }));

  test('preserves the last value when an explicit refresh fails', () =>
    Effect.gen(function* () {
      let fail = false;
      let value = 1;
      const owned = createRoot((dispose) => ({
        dispose,
        cache: createSyncedCache({
          name: 'retained',
          runtime: defaultCacheRuntime,
          lookup: (_input: { readonly id: number }) => {
            if (fail) return Effect.fail('refresh failed');
            return Effect.succeed(value);
          },
          mutate: (_command: never) => Effect.void,
          affects: (_command: never): ReadonlyArray<never> => [],
          matches: (_input: { readonly id: number }, _scope: never) => false,
        }),
      }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));
      const read = owned.cache.get({ id: 1 });
      expect(yield* Effect.tryPromise(() => resolve(read))).toBe(1);
      yield* settle;

      fail = true;
      value = 2;
      const refreshed = yield* Effect.forkChild(
        Effect.exit(Effect.tryPromise(() => owned.cache.refresh({ id: 1 }))),
        { startImmediately: true },
      );
      yield* Effect.yieldNow;
      flush();
      expect(owned.cache.status({ id: 1 })()).toEqual({ state: 'refreshing' });
      const result = yield* Fiber.join(refreshed);
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.squash(result.cause);
        expect(Cause.isUnknownError(failure)).toBe(true);
        if (Cause.isUnknownError(failure)) {
          expect(failure.cause).toBeInstanceOf(IpcCacheError);
        }
      }
      yield* settle;

      expect(read()).toBe(1);
      expect(owned.cache.status({ id: 1 })().state).toBe('failed');
    }));

  test('allows one active and one shared trailing refresh per key', () =>
    Effect.gen(function* () {
      let lookups = 0;
      const resolvers: Array<(value: number) => void> = [];
      const owned = createRoot((dispose) => ({
        dispose,
        cache: createSyncedCache({
          name: 'trailing',
          runtime: defaultCacheRuntime,
          lookup: (_input: { readonly id: number }) =>
            Effect.callback<number>((resume) => {
              lookups += 1;
              resolvers.push((next) => resume(Effect.succeed(next)));
            }),
          mutate: (_command: never) => Effect.void,
          affects: (_command: never): ReadonlyArray<never> => [],
          matches: (_input: { readonly id: number }, _scope: never) => false,
        }),
      }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));
      const read = owned.cache.get({ id: 1 });
      yield* waitFor(() => resolvers.length === 1);
      resolvers[0]?.(1);
      expect(yield* Effect.tryPromise(() => resolve(read))).toBe(1);

      const active = yield* Effect.forkChild(
        Effect.tryPromise(() => owned.cache.refresh({ id: 1 })),
        { startImmediately: true },
      );
      yield* waitFor(() => resolvers.length === 2);
      const trailingRequest = owned.cache.refresh({ id: 1 });
      const sameTrailingRequest = owned.cache.refresh({ id: 1 });
      expect(sameTrailingRequest).toBe(trailingRequest);
      const trailing = yield* Effect.forkChild(
        Effect.all([
          Effect.tryPromise(() => trailingRequest),
          Effect.tryPromise(() => sameTrailingRequest),
        ]),
        { startImmediately: true },
      );
      yield* Effect.yieldNow;
      expect(lookups).toBe(2);

      resolvers[1]?.(2);
      expect(yield* Fiber.join(active)).toBe(2);
      yield* waitFor(() => resolvers.length === 3);
      resolvers[2]?.(3);
      expect(yield* Fiber.join(trailing)).toEqual([3, 3]);
      yield* settle;

      expect(read()).toBe(3);
      expect(lookups).toBe(3);
    }));

  test('mutations refresh only structurally affected active entries', () =>
    Effect.gen(function* () {
      const source = new Map([
        [1, 'one'],
        [2, 'two'],
      ]);
      const lookups = new Map<number, number>();
      const owned = createRoot((dispose) => ({
        dispose,
        cache: createSyncedCache({
          name: 'mutation',
          runtime: defaultCacheRuntime,
          lookup: (input: { readonly id: number }) =>
            Effect.sync(() => {
              lookups.set(input.id, (lookups.get(input.id) ?? 0) + 1);
              return source.get(input.id) ?? 'missing';
            }),
          mutate: (command: { readonly id: number; readonly value: string }) =>
            Effect.sync(() => source.set(command.id, command.value)).pipe(Effect.asVoid),
          affects: (command) => [{ id: command.id }],
          matches: (input, scope) => input.id === scope.id,
        }),
      }));
      yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));
      const one = owned.cache.get({ id: 1 });
      const two = owned.cache.get({ id: 2 });
      expect(
        yield* Effect.all([
          Effect.tryPromise(() => resolve(one)),
          Effect.tryPromise(() => resolve(two)),
        ]),
      ).toEqual(['one', 'two']);

      yield* Effect.tryPromise(() => owned.cache.mutate({ id: 1, value: 'updated' }));
      yield* settle;

      expect(one()).toBe('updated');
      expect(two()).toBe('two');
      expect(lookups).toEqual(
        new Map([
          [1, 2],
          [2, 1],
        ]),
      );
    }));

  test('interrupts every in-flight lookup when its Solid owner disposes', () =>
    Effect.gen(function* () {
      let interrupted = false;
      yield* Effect.scoped(
        Effect.gen(function* () {
          const owned = createRoot((dispose) => ({
            dispose,
            cache: createSyncedCache({
              name: 'disposal',
              runtime: defaultCacheRuntime,
              lookup: (_input: { readonly id: number }) =>
                Effect.callback<never>(() =>
                  Effect.sync(() => {
                    interrupted = true;
                  }),
                ),
              mutate: (_command: never) => Effect.void,
              affects: (_command: never): ReadonlyArray<never> => [],
              matches: (_input: { readonly id: number }, _scope: never) => false,
            }),
          }));
          yield* Effect.addFinalizer(() => Effect.sync(owned.dispose));
          owned.cache.get({ id: 1 });
          yield* settle;
        }),
      );
      yield* waitFor(() => interrupted);

      expect(interrupted).toBe(true);
    }));
});
