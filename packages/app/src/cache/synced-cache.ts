import type { Accessor } from 'solid-js';
import { createMemo, createSignal, getOwner, onCleanup, runWithOwner } from 'solid-js';
import { Cache, Cause, Deferred, Effect, Exit, Fiber, HashMap, Option, Schema } from 'effect';

export class SyncedCacheError extends Schema.TaggedError<SyncedCacheError>()('SyncedCacheError', {
  cache: Schema.String,
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export type SyncedCacheStatus =
  | { readonly state: 'loading' }
  | { readonly state: 'ready' }
  | { readonly state: 'refreshing' }
  | { readonly state: 'failed'; readonly error: SyncedCacheError };

export interface CacheRuntime<R> {
  readonly runFork: <A, E>(effect: Effect.Effect<A, E, R>) => Fiber.Fiber<A, E>;
}

export interface CreateSyncedCacheOptions<Input, A, E, R, Command, MutationResult, Scope> {
  readonly name: string;
  readonly runtime: CacheRuntime<R>;
  readonly lookup: (input: Input) => Effect.Effect<A, E, R>;
  readonly mutate: (command: Command) => Effect.Effect<MutationResult, E, R>;
  readonly affects: (command: Command) => ReadonlyArray<Scope>;
  readonly matches: (input: Input, scope: Scope) => boolean;
  readonly emptyInput?: Input;
}

type RequiredKeys<Input> = {
  [Key in keyof Input]-?: {} extends Pick<Input, Key> ? never : Key;
}[keyof Input];

export type CacheInputArgs<Input> =
  RequiredKeys<Input> extends never ? readonly [input?: Input] : readonly [input: Input];

export interface SyncedCache<Input, A, Command, MutationResult> {
  readonly get: (...args: CacheInputArgs<Input>) => Accessor<A>;
  readonly status: (...args: CacheInputArgs<Input>) => Accessor<SyncedCacheStatus>;
  readonly refresh: (...args: CacheInputArgs<Input>) => Promise<A>;
  readonly mutate: (command: Command) => Promise<MutationResult>;
}

interface ActiveLookup<A> {
  readonly fiber: Fiber.Fiber<A, SyncedCacheError>;
  promise: Option.Option<Promise<A>>;
}

interface TrailingLookup<A> {
  readonly deferred: Deferred.Deferred<A, SyncedCacheError>;
  promise: Option.Option<Promise<A>>;
}

interface CacheEntry<Input, A> {
  readonly input: Input;
  readonly value: Accessor<Option.Option<A>>;
  readonly setValue: (value: Option.Option<A>) => void;
  readonly status: Accessor<SyncedCacheStatus>;
  readonly setStatus: (status: SyncedCacheStatus) => void;
  readonly accessor: Accessor<A>;
  active: Option.Option<ActiveLookup<A>>;
  trailing: Option.Option<TrailingLookup<A>>;
}

const isSyncedCacheError = Schema.is(SyncedCacheError);

const cacheError = (name: string, cause: unknown): SyncedCacheError => {
  if (isSyncedCacheError(cause)) return cause;
  let message = String(cause);
  if (Cause.isCause(cause)) message = Cause.pretty(cause);
  return SyncedCacheError.make({ cache: name, message, cause });
};

const effectFromExit = <A, E>(exit: Exit.Exit<A, E>): Effect.Effect<A, E> => {
  if (Exit.isSuccess(exit)) return Effect.succeed(exit.value);
  return Effect.failCause(exit.cause);
};

export const createSyncedCache = <Input, A, E, R, Command, MutationResult, Scope>(
  options: CreateSyncedCacheOptions<Input, A, E, R, Command, MutationResult, Scope>,
): SyncedCache<Input, A, Command, MutationResult> => {
  const owner = Option.getOrThrowWith(Option.fromNullishOr(getOwner()), () =>
    SyncedCacheError.make({
      cache: options.name,
      message: 'createSyncedCache requires a Solid owner',
    }),
  );

  const effectCache = Effect.runSync(
    Cache.make({
      capacity: Number.MAX_SAFE_INTEGER,
      lookup: options.lookup,
      requireServicesAt: 'lookup',
    }),
  );
  let entries = HashMap.empty<Input, CacheEntry<Input, A>>();
  const fibers = new Set<Fiber.Fiber<unknown, unknown>>();
  let disposed = false;

  const fork = <Value>(
    effect: Effect.Effect<Value, SyncedCacheError, R>,
  ): Fiber.Fiber<Value, SyncedCacheError> => {
    const fiber = options.runtime.runFork(effect);
    fibers.add(fiber);
    fiber.addObserver(() => {
      fibers.delete(fiber);
    });
    return fiber;
  };

  const launch = (entry: CacheEntry<Input, A>, refresh: boolean): ActiveLookup<A> => {
    const current = entry.value();
    // Initial lookup is launched by the async memo while Solid owns its
    // computation. The entry already starts in `loading`, so writing the same
    // state there would violate Solid 2's no-writes-in-owned-scopes rule.
    // Explicit refreshes enter through imperative callers and own the only
    // status transition needed before the Effect starts.
    if (refresh) {
      if (Option.isSome(current)) entry.setStatus({ state: 'refreshing' });
      else entry.setStatus({ state: 'loading' });
    }
    let operation = Cache.get(effectCache, entry.input);
    if (refresh) operation = Cache.refresh(effectCache, entry.input);
    const observed = Effect.flatMap(
      Effect.exit(Effect.andThen(Effect.yieldNow, operation)),
      (exit) => {
        if (Exit.isSuccess(exit)) {
          const value = exit.value;
          return Effect.sync(() => {
            entry.setValue(Option.some(value));
            entry.setStatus({ state: 'ready' });
            return value;
          });
        }
        const error = cacheError(options.name, exit.cause);
        return Effect.sync(() => {
          entry.setStatus({ state: 'failed', error });
        }).pipe(Effect.andThen(Effect.fail(error)));
      },
    );
    const fiber = fork(observed);
    const active: ActiveLookup<A> = { fiber, promise: Option.none() };
    entry.active = Option.some(active);
    fiber.addObserver(() => {
      entry.active = Option.none();
      const trailing = entry.trailing;
      entry.trailing = Option.none();
      if (Option.isSome(trailing)) {
        const next = launch(entry, true);
        next.fiber.addObserver((exit) => {
          Deferred.doneUnsafe(trailing.value.deferred, effectFromExit(exit));
        });
      }
    });
    return active;
  };

  const activePromise = (active: ActiveLookup<A>): Promise<A> =>
    Option.getOrElse(active.promise, () => {
      const promise = Effect.runPromise(Fiber.join(active.fiber));
      active.promise = Option.some(promise);
      return promise;
    });

  const makeEntry = (input: Input): CacheEntry<Input, A> => {
    const [value, setValue] = createSignal<Option.Option<A>>(Option.none());
    const [status, setStatus] = createSignal<SyncedCacheStatus>({
      state: 'loading',
    });
    let initial = Option.none<Accessor<A>>();
    const accessor: Accessor<A> = () => {
      const current = value();
      if (Option.isSome(current)) return current.value;
      return Option.getOrThrow(initial)();
    };
    const entry: CacheEntry<Input, A> = {
      input,
      value,
      setValue: (next) => setValue(() => next),
      status,
      setStatus: (next) => setStatus(() => next),
      accessor,
      active: Option.none(),
      trailing: Option.none(),
    };
    initial = Option.some(
      createMemo<A>(() => {
        const running = entry.active;
        if (Option.isSome(running)) return activePromise(running.value);
        return activePromise(launch(entry, false));
      }),
    );
    return entry;
  };

  const entryFor = (input: Input): CacheEntry<Input, A> => {
    const existing = HashMap.get(entries, input);
    if (Option.isSome(existing)) return existing.value;
    const entry = runWithOwner(owner, () => makeEntry(input));
    entries = HashMap.set(entries, input, entry);
    return entry;
  };

  const trailingFor = (entry: CacheEntry<Input, A>): TrailingLookup<A> =>
    Option.getOrElse(entry.trailing, () => {
      const trailing: TrailingLookup<A> = {
        deferred: Deferred.makeUnsafe<A, SyncedCacheError>(),
        promise: Option.none(),
      };
      entry.trailing = Option.some(trailing);
      return trailing;
    });

  const refreshEntryEffect = (entry: CacheEntry<Input, A>): Effect.Effect<A, SyncedCacheError> => {
    if (disposed) {
      return Effect.fail(
        SyncedCacheError.make({
          cache: options.name,
          message: 'cache owner has been disposed',
        }),
      );
    }
    if (Option.isNone(entry.active)) return Fiber.join(launch(entry, true).fiber);
    return Deferred.await(trailingFor(entry).deferred);
  };

  const refreshEntry = (entry: CacheEntry<Input, A>): Promise<A> => {
    if (Option.isNone(entry.active)) return activePromise(launch(entry, true));
    const trailing = trailingFor(entry);
    return Option.getOrElse(trailing.promise, () => {
      const promise = Effect.runPromise(Deferred.await(trailing.deferred));
      trailing.promise = Option.some(promise);
      return promise;
    });
  };

  const inputFrom = (args: CacheInputArgs<Input>): Input =>
    Option.getOrThrowWith(
      Option.orElse(Option.fromNullishOr(args[0]), () => Option.fromNullishOr(options.emptyInput)),
      () =>
        SyncedCacheError.make({
          cache: options.name,
          message: 'cache input is required',
        }),
    );

  const mutate = (command: Command): Promise<MutationResult> => {
    const operation = Effect.gen(function* () {
      if (disposed) {
        return yield* SyncedCacheError.make({
          cache: options.name,
          message: 'cache owner has been disposed',
        });
      }
      const result = yield* options
        .mutate(command)
        .pipe(Effect.catchCause((cause) => Effect.fail(cacheError(options.name, cause))));
      const scopes = options.affects(command);
      const refreshes: Array<Effect.Effect<A, SyncedCacheError>> = [];
      for (const entry of HashMap.values(entries)) {
        if (scopes.some((scope) => options.matches(entry.input, scope))) {
          refreshes.push(refreshEntryEffect(entry));
        }
      }
      yield* Effect.all(refreshes, { concurrency: 'unbounded' });
      return result;
    });
    return Effect.runPromise(Fiber.join(fork(operation)));
  };

  onCleanup(() => {
    disposed = true;
    for (const fiber of fibers) fiber.interruptUnsafe();
    fibers.clear();
    entries = HashMap.empty();
  });

  return {
    get: (...args) => entryFor(inputFrom(args)).accessor,
    status: (...args) => entryFor(inputFrom(args)).status,
    refresh: (...args) => refreshEntry(entryFor(inputFrom(args))),
    mutate,
  };
};

export const defaultCacheRuntime: CacheRuntime<never> = {
  runFork: Effect.runFork,
};
