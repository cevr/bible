import type { Accessor } from 'solid-js';
import { createMemo, createSignal, getOwner, onCleanup, runWithOwner } from 'solid-js';
import { Cache, Cause, Deferred, Effect, Exit, Fiber, HashMap, Option, Schema } from 'effect';

export class IpcCacheError extends Schema.TaggedErrorClass<IpcCacheError>()('IpcCacheError', {
  cache: Schema.String,
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export type SyncedCacheStatus =
  | { readonly state: 'loading' }
  | { readonly state: 'ready' }
  | { readonly state: 'refreshing' }
  | { readonly state: 'failed'; readonly error: IpcCacheError };

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
  readonly fiber: Fiber.Fiber<A, IpcCacheError>;
  promise: Promise<A> | undefined;
}

interface TrailingLookup<A> {
  readonly deferred: Deferred.Deferred<A, IpcCacheError>;
  promise: Promise<A> | undefined;
}

interface CacheEntry<Input, A> {
  readonly input: Input;
  readonly value: Accessor<Option.Option<A>>;
  readonly setValue: (value: Option.Option<A>) => void;
  readonly status: Accessor<SyncedCacheStatus>;
  readonly setStatus: (status: SyncedCacheStatus) => void;
  readonly accessor: Accessor<A>;
  active: ActiveLookup<A> | undefined;
  trailing: TrailingLookup<A> | undefined;
}

const cacheError = (name: string, cause: unknown): IpcCacheError => {
  if (cause instanceof IpcCacheError) return cause;
  let message = String(cause);
  if (Cause.isCause(cause)) message = Cause.pretty(cause);
  return new IpcCacheError({ cache: name, message, cause });
};

const effectFromExit = <A, E>(exit: Exit.Exit<A, E>): Effect.Effect<A, E> => {
  if (Exit.isSuccess(exit)) return Effect.succeed(exit.value);
  return Effect.failCause(exit.cause);
};

export const createSyncedCache = <Input, A, E, R, Command, MutationResult, Scope>(
  options: CreateSyncedCacheOptions<Input, A, E, R, Command, MutationResult, Scope>,
): SyncedCache<Input, A, Command, MutationResult> => {
  const owner = Option.getOrThrowWith(
    Option.fromNullishOr(getOwner()),
    () =>
      new IpcCacheError({
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
    effect: Effect.Effect<Value, IpcCacheError, R>,
  ): Fiber.Fiber<Value, IpcCacheError> => {
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
    const active = { fiber, promise: undefined };
    entry.active = active;
    fiber.addObserver(() => {
      entry.active = undefined;
      const trailing = entry.trailing;
      entry.trailing = undefined;
      if (trailing !== undefined) {
        const next = launch(entry, true);
        next.fiber.addObserver((exit) => {
          Deferred.doneUnsafe(trailing.deferred, effectFromExit(exit));
        });
      }
    });
    return active;
  };

  const activePromise = (active: ActiveLookup<A>): Promise<A> => {
    if (active.promise === undefined) active.promise = Effect.runPromise(Fiber.join(active.fiber));
    return active.promise;
  };

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
      active: undefined,
      trailing: undefined,
    };
    initial = Option.some(
      createMemo<A>(() => {
        if (entry.active !== undefined) return activePromise(entry.active);
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

  const refreshEntryEffect = (entry: CacheEntry<Input, A>): Effect.Effect<A, IpcCacheError> => {
    if (disposed) {
      return Effect.fail(
        new IpcCacheError({
          cache: options.name,
          message: 'cache owner has been disposed',
        }),
      );
    }
    if (entry.active === undefined) return Fiber.join(launch(entry, true).fiber);
    if (entry.trailing === undefined) {
      const deferred = Deferred.makeUnsafe<A, IpcCacheError>();
      entry.trailing = { deferred, promise: undefined };
    }
    return Deferred.await(entry.trailing.deferred);
  };

  const refreshEntry = (entry: CacheEntry<Input, A>): Promise<A> => {
    if (entry.active === undefined) return activePromise(launch(entry, true));
    if (entry.trailing === undefined) {
      const deferred = Deferred.makeUnsafe<A, IpcCacheError>();
      entry.trailing = { deferred, promise: undefined };
    }
    if (entry.trailing.promise === undefined) {
      entry.trailing.promise = Effect.runPromise(Deferred.await(entry.trailing.deferred));
    }
    return entry.trailing.promise;
  };

  const inputFrom = (args: CacheInputArgs<Input>): Input => {
    const input = args[0] ?? options.emptyInput;
    if (input !== undefined) return input;
    return Option.getOrThrowWith(
      Option.none<Input>(),
      () =>
        new IpcCacheError({
          cache: options.name,
          message: 'cache input is required',
        }),
    );
  };

  const mutate = (command: Command): Promise<MutationResult> => {
    const operation = Effect.gen(function* () {
      if (disposed) {
        return yield* new IpcCacheError({
          cache: options.name,
          message: 'cache owner has been disposed',
        });
      }
      const result = yield* options
        .mutate(command)
        .pipe(Effect.catchCause((cause) => Effect.fail(cacheError(options.name, cause))));
      const scopes = options.affects(command);
      const refreshes: Array<Effect.Effect<A, IpcCacheError>> = [];
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
