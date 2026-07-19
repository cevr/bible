import type { Accessor } from 'solid-js';
import { createMemo, createSignal, getOwner, onCleanup, runWithOwner } from 'solid-js';
import { Cache, Cause, Effect, Exit, Fiber, HashMap, Option, Schema } from 'effect';

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

interface PromiseLatch<A> {
  readonly promise: Promise<A>;
  readonly resolve: (value: A) => void;
  readonly reject: (error: unknown) => void;
}

const makePromiseLatch = <A>(): PromiseLatch<A> => {
  let resolvePromise = (_value: A): void => undefined;
  let rejectPromise = (_error: unknown): void => undefined;
  const promise = new Promise<A>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
};

interface CacheEntry<Input, A> {
  readonly input: Input;
  readonly value: Accessor<Option.Option<A>>;
  readonly setValue: (value: Option.Option<A>) => void;
  readonly status: Accessor<SyncedCacheStatus>;
  readonly setStatus: (status: SyncedCacheStatus) => void;
  readonly accessor: Accessor<A>;
  active: Promise<A> | undefined;
  trailing: PromiseLatch<A> | undefined;
}

const cacheError = (name: string, cause: unknown): IpcCacheError =>
  cause instanceof IpcCacheError
    ? cause
    : new IpcCacheError({
        cache: name,
        message: Cause.isCause(cause) ? Cause.pretty(cause) : String(cause),
        cause,
      });

export const createSyncedCache = <Input, A, E, R, Command, MutationResult, Scope>(
  options: CreateSyncedCacheOptions<Input, A, E, R, Command, MutationResult, Scope>,
): SyncedCache<Input, A, Command, MutationResult> => {
  const owner = getOwner();
  if (!owner) {
    throw new IpcCacheError({
      cache: options.name,
      message: 'createSyncedCache requires a Solid owner',
    });
  }

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

  const run = <Value, Error>(effect: Effect.Effect<Value, Error, R>): Promise<Value> => {
    if (disposed) {
      return Promise.reject(
        new IpcCacheError({
          cache: options.name,
          message: 'cache owner has been disposed',
        }),
      );
    }
    const fiber = options.runtime.runFork(effect);
    fibers.add(fiber);
    return Effect.runPromise(Fiber.await(fiber)).then((exit) => {
      fibers.delete(fiber);
      if (Exit.isSuccess(exit)) return exit.value;
      throw cacheError(options.name, exit.cause);
    });
  };

  const launch = (entry: CacheEntry<Input, A>, refresh: boolean): Promise<A> => {
    const current = entry.value();
    // Initial lookup is launched by the async memo while Solid owns its
    // computation. The entry already starts in `loading`, so writing the same
    // state there would violate Solid 2's no-writes-in-owned-scopes rule.
    // Explicit refreshes enter through imperative callers and own the only
    // status transition needed before the Effect starts.
    if (refresh) {
      entry.setStatus(Option.isSome(current) ? { state: 'refreshing' } : { state: 'loading' });
    }
    const operation = refresh
      ? Cache.refresh(effectCache, entry.input)
      : Cache.get(effectCache, entry.input);
    const active = run(operation)
      .then((value) => {
        entry.setValue(Option.some(value));
        entry.setStatus({ state: 'ready' });
        return value;
      })
      .catch((cause: unknown) => {
        const error = cacheError(options.name, cause);
        entry.setStatus({ state: 'failed', error });
        throw error;
      })
      .finally(() => {
        entry.active = undefined;
        const trailing = entry.trailing;
        entry.trailing = undefined;
        if (trailing) {
          launch(entry, true).then(trailing.resolve, trailing.reject);
        }
      });
    entry.active = active;
    return active;
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
    initial = Option.some(createMemo<A>(() => entry.active ?? launch(entry, false)));
    return entry;
  };

  const entryFor = (input: Input): CacheEntry<Input, A> => {
    const existing = HashMap.get(entries, input);
    if (Option.isSome(existing)) return existing.value;
    const entry = runWithOwner(owner, () => makeEntry(input));
    entries = HashMap.set(entries, input, entry);
    return entry;
  };

  const refreshEntry = (entry: CacheEntry<Input, A>): Promise<A> => {
    if (!entry.active) return launch(entry, true);
    if (!entry.trailing) entry.trailing = makePromiseLatch<A>();
    return entry.trailing.promise;
  };

  const refresh = (input: Input): Promise<A> => refreshEntry(entryFor(input));

  const inputFrom = (args: CacheInputArgs<Input>): Input => {
    const input = args[0] ?? options.emptyInput;
    if (input !== undefined) return input;
    throw new IpcCacheError({
      cache: options.name,
      message: 'cache input is required',
    });
  };

  const mutate = (command: Command): Promise<MutationResult> =>
    run(options.mutate(command)).then(async (result) => {
      const scopes = options.affects(command);
      const refreshes: Array<Promise<A>> = [];
      for (const entry of HashMap.values(entries)) {
        if (scopes.some((scope) => options.matches(entry.input, scope))) {
          refreshes.push(refreshEntry(entry));
        }
      }
      await Promise.all(refreshes);
      return result;
    });

  onCleanup(() => {
    disposed = true;
    for (const fiber of fibers) Effect.runFork(Fiber.interrupt(fiber));
    fibers.clear();
    entries = HashMap.empty();
  });

  return {
    get: (...args) => entryFor(inputFrom(args)).accessor,
    status: (...args) => entryFor(inputFrom(args)).status,
    refresh: (...args) => refresh(inputFrom(args)),
    mutate,
  };
};

export const defaultCacheRuntime: CacheRuntime<never> = {
  runFork: Effect.runFork,
};
