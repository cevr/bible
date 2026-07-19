import { describe, expect, test } from 'bun:test';

import { Effect } from 'effect';
import { createRoot, flush, resolve } from 'solid-js';

import { createSyncedCache, defaultCacheRuntime, IpcCacheError } from './synced-cache.js';

const settle = async (): Promise<void> => {
  await Promise.resolve();
  flush();
};

const waitFor = async (condition: () => boolean, attempts = 20): Promise<void> => {
  if (condition()) return;
  if (attempts > 0) {
    await Promise.resolve();
    return waitFor(condition, attempts - 1);
  }
  throw new Error('condition did not settle');
};

const rejectionOf = <A>(promise: Promise<A>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (cause: unknown) => cause,
  );

describe('createSyncedCache', () => {
  test('uses structural keys and returns one stable accessor per input', async () => {
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

    const first = owned.cache.get({ id: 1 });
    const same = owned.cache.get({ id: 1 });

    expect(same).toBe(first);
    expect(await resolve(first)).toBe('value-1');
    expect(lookups).toBe(1);
    await settle();
    expect(owned.cache.status({ id: 1 })()).toEqual({ state: 'ready' });
    owned.dispose();
  });

  test('treats omitted and explicit empty structural inputs as the same key', async () => {
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

    const omitted = owned.cache.get();
    const explicit = owned.cache.get({});
    expect(explicit).toBe(omitted);
    expect(await resolve(omitted)).toBe('ready');
    await settle();
    expect(owned.cache.status()).toBe(owned.cache.status({}));
    expect(lookups).toBe(1);
    owned.dispose();
  });

  test('normalizes initial failures and retains the error in status', async () => {
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
    const value = owned.cache.get({ id: 1 });

    expect(await rejectionOf(resolve(value))).toBeInstanceOf(IpcCacheError);
    await settle();

    const status = owned.cache.status({ id: 1 })();
    expect(status.state).toBe('failed');
    if (status.state === 'failed') expect(status.error).toBeInstanceOf(IpcCacheError);
    owned.dispose();
  });

  test('preserves the last value when an explicit refresh fails', async () => {
    let fail = false;
    let value = 1;
    const owned = createRoot((dispose) => ({
      dispose,
      cache: createSyncedCache({
        name: 'retained',
        runtime: defaultCacheRuntime,
        lookup: (_input: { readonly id: number }) =>
          fail ? Effect.fail('refresh failed') : Effect.succeed(value),
        mutate: (_command: never) => Effect.void,
        affects: (_command: never): ReadonlyArray<never> => [],
        matches: (_input: { readonly id: number }, _scope: never) => false,
      }),
    }));
    const read = owned.cache.get({ id: 1 });
    expect(await resolve(read)).toBe(1);
    await settle();

    fail = true;
    value = 2;
    const refreshed = owned.cache.refresh({ id: 1 });
    flush();
    expect(owned.cache.status({ id: 1 })()).toEqual({ state: 'refreshing' });
    expect(await rejectionOf(refreshed)).toBeInstanceOf(IpcCacheError);
    await settle();

    expect(read()).toBe(1);
    expect(owned.cache.status({ id: 1 })().state).toBe('failed');
    owned.dispose();
  });

  test('allows one active and one shared trailing refresh per key', async () => {
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
    const read = owned.cache.get({ id: 1 });
    await waitFor(() => resolvers.length === 1);
    resolvers[0]?.(1);
    expect(await resolve(read)).toBe(1);

    const active = owned.cache.refresh({ id: 1 });
    await waitFor(() => resolvers.length === 2);
    const trailing = owned.cache.refresh({ id: 1 });
    const sameTrailing = owned.cache.refresh({ id: 1 });
    expect(sameTrailing).toBe(trailing);
    expect(lookups).toBe(2);

    resolvers[1]?.(2);
    expect(await active).toBe(2);
    await waitFor(() => resolvers.length === 3);
    resolvers[2]?.(3);
    expect(await trailing).toBe(3);
    await settle();

    expect(read()).toBe(3);
    expect(lookups).toBe(3);
    owned.dispose();
  });

  test('mutations refresh only structurally affected active entries', async () => {
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
    const one = owned.cache.get({ id: 1 });
    const two = owned.cache.get({ id: 2 });
    expect(await Promise.all([resolve(one), resolve(two)])).toEqual(['one', 'two']);

    await owned.cache.mutate({ id: 1, value: 'updated' });
    await settle();

    expect(one()).toBe('updated');
    expect(two()).toBe('two');
    expect(lookups).toEqual(
      new Map([
        [1, 2],
        [2, 1],
      ]),
    );
    owned.dispose();
  });

  test('interrupts every in-flight lookup when its Solid owner disposes', async () => {
    let interrupted = false;
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

    owned.cache.get({ id: 1 });
    owned.dispose();
    await waitFor(() => interrupted);

    expect(interrupted).toBe(true);
  });
});
