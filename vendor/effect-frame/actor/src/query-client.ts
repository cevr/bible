import type { Layer as LayerType } from "effect";
import {
  Context,
  Deferred,
  Effect,
  Exit,
  Layer,
  Option,
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import type { AnyQuery, ArgsOf, QueryFailure, QueryKey, QueryState, ResultOf } from "./query.js";
import { Failed, Loading, Ready, canonicalize, keyOf, markStale } from "./query.js";
import type { Source } from "./source.js";
import type { Refreshed } from "./transport.js";
import { ActorTransport } from "./transport.js";

/**
 * The client half of the Query primitive (#17, lifetime per #28): a cache
 * keyed by encoded arguments, a `QueryState` source per entry, and the
 * declaration of which entries are active so a command reply can refresh
 * them. Client-safe: it holds the contract and a transport, never a handler.
 *
 * An entry exists exactly while something declares it. `open` acquires a
 * declaration in the caller's `Scope` and the Scope closing releases it;
 * the entry, and any read it has in flight, go when the last declaration
 * does. `active` is therefore the on-screen set by construction, which is
 * what lets a command's `active` list derive from the cache.
 */

/** One live cache entry. The `Source` is what a view binds to. */
export interface QueryEntry<A, E> {
  readonly key: QueryKey;
  readonly state: Source<QueryState<A, E>>;
  /**
   * Reads the current value from the server again. A read already in flight
   * is joined rather than repeated. Ready content stays on screen, marked
   * stale, until the new value lands; the fallback never returns.
   */
  readonly refresh: Effect.Effect<void>;
  /**
   * Shows a value the caller supplies, marked stale, until the next refresh
   * lands. The escape hatch for optimistic values the dependency graph
   * cannot derive: an actor commit refreshes automatically, and this is for
   * everything else.
   */
  readonly override: (value: A) => Effect.Effect<void>;
}

/**
 * One entry as the cache holds it: the value stays encoded, and each typed
 * `QueryEntry` decodes it through its own contract. Two declarations of one
 * key share this one state, so they can never diverge, and the cache needs
 * no cast to hand a typed view of an erased slot.
 */
interface CacheSlot {
  readonly key: QueryKey;
  /** The contract's `depends`, so `invalidate` needs no registry beside the slots. */
  readonly depends: ReadonlyArray<string>;
  /** Owns the read in flight. Closing it interrupts the read. */
  readonly scope: Scope.Closeable;
  readonly state: SubscriptionRef.SubscriptionRef<QueryState<string, QueryFailure>>;
  /** Live declarations. The slot is dropped when this reaches zero. */
  count: number;
  readonly refresh: Effect.Effect<void>;
  /** Marks the entry stale in place. Used when a dependency commits. */
  readonly markStale: Effect.Effect<void>;
  /** Replaces the entry from an encoded result a command reply delivered. */
  readonly accept: (encoded: string) => Effect.Effect<void>;
  /** Records a refresh that the server could not serve. */
  readonly reject: (error: QueryFailure) => Effect.Effect<void>;
}

/**
 * The client's query cache. One per client runtime, wired centrally: a view
 * never constructs one, and `ref` reads this same service to learn which
 * keys to declare active. There is exactly one place that knows what is on
 * screen, so `active` is derived from the cache and never synced beside it.
 */
export interface QueryCacheService {
  /**
   * Declare one query. The entry lives as long as the `Scope`; the release
   * is the Scope closing, so nothing can forget it. The first read is
   * started, not awaited: the entry comes back `Loading` and settles on its
   * own, which is what a readiness scope waits for.
   */
  readonly open: <Q extends AnyQuery>(
    contract: Q,
    args: ArgsOf<Q>,
  ) => Effect.Effect<QueryEntry<ResultOf<Q>, QueryFailure>, never, ActorTransport | Scope.Scope>;
  /** Every key with a live declaration. This is what a command declares active. */
  readonly active: Effect.Effect<ReadonlyArray<QueryKey>>;
  /** Applies the refreshes a command reply carried. */
  readonly apply: (refreshed: ReadonlyArray<Refreshed>) => Effect.Effect<void>;
  /**
   * Marks every cached entry whose query depends on this contract stale.
   * The client does this the moment a command is sent, so the view shows
   * stale content before the reply arrives rather than after it.
   */
  readonly invalidate: (contractName: string) => Effect.Effect<void>;
}

export class QueryCache extends Context.Service<QueryCache, QueryCacheService>()(
  "@effect-frame/actor/src/query-client/QueryCache",
) {}

const encodeKey = <Q extends AnyQuery>(contract: Q, args: ArgsOf<Q>): Effect.Effect<QueryKey> =>
  Effect.map(Effect.orDie(Schema.encodeEffect(contract.args)(args)), (encoded) => ({
    query: contract.name,
    version: contract.version,
    // Canonical from the start: two callers who spell the same arguments in
    // a different field order must land on one entry, not two.
    args: canonicalize(encoded),
  }));

const makeSlot = Effect.fn("QueryCache.makeSlot")(function* (
  contract: AnyQuery,
  key: QueryKey,
  transport: ActorTransport["Service"],
) {
  const scope = yield* Scope.make();
  const state = yield* SubscriptionRef.make<QueryState<string, QueryFailure>>(Loading());

  // A read in flight, so a second `refresh` joins it instead of repeating it.
  let inflight: Option.Option<Deferred.Deferred<void>> = Option.none();
  // Bumped by a value that arrived by another path. A read that started
  // before the bump is older than what the entry now holds, and is dropped.
  let generation = 0;

  const accept = (encoded: string) =>
    Effect.suspend(() => {
      generation += 1;
      return SubscriptionRef.set(state, Ready(encoded, false));
    });
  const reject = (error: QueryFailure) => SubscriptionRef.set(state, Failed(error));

  // The latch clears before the value is published, never after: a caller
  // that sees the new value and asks again must start a new read, not join
  // the one that just ended.
  const clear = Effect.sync(() => {
    inflight = Option.none();
  });

  const read = Effect.suspend(() => {
    const started = generation;
    const commit = (publish: Effect.Effect<void>) =>
      Effect.suspend(() => {
        if (started === generation) {
          return Effect.andThen(clear, publish);
        }
        return clear;
      });
    return transport.query(key).pipe(
      Effect.flatMap((encoded) => commit(accept(encoded))),
      Effect.catch((error) => reject(error).pipe(commit)),
    );
  });

  const refresh = Effect.gen(function* () {
    if (Option.isSome(inflight)) {
      return yield* Deferred.await(inflight.value);
    }
    const done = yield* Deferred.make<void>();
    inflight = Option.some(done);
    yield* SubscriptionRef.update(state, markStale);
    const settle = Effect.andThen(clear, Deferred.succeed(done, void 0));
    // The read belongs to the slot, not to the caller: the caller may be a
    // view that unmounts first, and the slot closing is what interrupts it.
    // The read gets a child scope, and the waiters are woken by that scope's
    // finalizer rather than by the fiber: a fiber forked into a scope that
    // has already closed never runs, so nothing it carries would run either,
    // while a finalizer added to a closed scope runs at once.
    const reading = yield* Scope.fork(scope);
    yield* Scope.addFinalizer(reading, settle);
    yield* Effect.forkIn(Effect.ensuring(read, Scope.close(reading, Exit.void)), reading);
    return yield* Deferred.await(done);
  });

  const slot: CacheSlot = {
    key,
    depends: contract.depends,
    scope,
    state,
    count: 0,
    refresh,
    markStale: SubscriptionRef.update(state, markStale),
    accept,
    reject,
  };
  return slot;
});

/** The typed face of a slot. Decodes through the contract the caller holds. */
const entryOf = <Q extends AnyQuery>(
  contract: Q,
  slot: CacheSlot,
): QueryEntry<ResultOf<Q>, QueryFailure> => {
  const decode = Schema.decodeEffect(contract.result);
  const encode = Schema.encodeEffect(contract.result);
  const decodeState = (
    state: QueryState<string, QueryFailure>,
  ): Effect.Effect<QueryState<ResultOf<Q>, QueryFailure>> => {
    if (state._tag === "Ready") {
      return Effect.map(Effect.orDie(decode(state.value)), (value) => Ready(value, state.stale));
    }
    return Effect.succeed(state);
  };
  return {
    key: slot.key,
    state: {
      get: Effect.flatMap(SubscriptionRef.get(slot.state), decodeState),
      changes: Stream.mapEffect(SubscriptionRef.changes(slot.state), decodeState),
    },
    refresh: slot.refresh,
    override: (value) =>
      Effect.flatMap(Effect.orDie(encode(value)), (encoded) =>
        SubscriptionRef.set(slot.state, Ready(encoded, true)),
      ),
  };
};

const make = (): Effect.Effect<QueryCacheService> =>
  Effect.sync(() => {
    const slots = new Map<string, CacheSlot>();

    const acquire = (contract: AnyQuery, key: QueryKey) =>
      Effect.gen(function* () {
        const id = keyOf(key);
        const existing = Option.fromNullishOr(slots.get(id));
        // An entry that already exists keeps its value; a second declaration
        // of the same key must not restart it as Loading.
        if (Option.isSome(existing)) {
          existing.value.count += 1;
          return existing.value;
        }
        const transport = yield* ActorTransport;
        const created = yield* makeSlot(contract, key, transport);
        created.count = 1;
        slots.set(id, created);
        yield* Effect.forkIn(created.refresh, created.scope);
        return created;
      });

    const release = (slot: CacheSlot) =>
      Effect.suspend(() => {
        slot.count -= 1;
        if (slot.count > 0) {
          return Effect.void;
        }
        slots.delete(keyOf(slot.key));
        return Scope.close(slot.scope, Exit.void);
      });

    const open = <Q extends AnyQuery>(contract: Q, args: ArgsOf<Q>) =>
      Effect.gen(function* () {
        const key = yield* encodeKey(contract, args);
        const slot = yield* Effect.acquireRelease(acquire(contract, key), release);
        return entryOf(contract, slot);
      });

    const active = Effect.sync(() => Array.from(slots.values(), (slot) => slot.key));

    const apply = (refreshed: ReadonlyArray<Refreshed>) =>
      Effect.forEach(
        refreshed,
        (one) =>
          Option.match(Option.fromNullishOr(slots.get(keyOf(one.key))), {
            onNone: () => Effect.void,
            onSome: (slot) => {
              if (one._tag === "Refreshed") {
                return slot.accept(one.result);
              }
              return slot.reject(one.error);
            },
          }),
        { discard: true },
      );

    const invalidate = (contractName: string) =>
      Effect.forEach(
        Array.from(slots.values()).filter((slot) => slot.depends.includes(contractName)),
        (slot) => slot.markStale,
        { discard: true },
      );

    const service: QueryCacheService = { open, active, apply, invalidate };
    return service;
  });

export const layer: LayerType.Layer<QueryCache> = Layer.effect(QueryCache, make());

/**
 * Declare one query and get its entry. The view-facing name; it is
 * `useQuery` in a React-shaped runtime and `ref`-shaped here, but it is the
 * same call: open the entry, get a `Source<QueryState<T>>`. The declaration
 * lasts as long as the enclosing `Scope`, which for a view is its setup.
 */
export const useQuery = Effect.fn("useQuery")(function* <Q extends AnyQuery>(
  contract: Q,
  args: ArgsOf<Q>,
) {
  const cache = yield* QueryCache;
  return yield* cache.open(contract, args);
});

// ---------------------------------------------------------------------------
// Following arguments that change
// ---------------------------------------------------------------------------

/** A query whose arguments move: one state source across every key. */
export interface FollowedQuery<A, E> {
  readonly state: Source<QueryState<A, E>>;
  /** Refreshes the entry the arguments currently name. */
  readonly refresh: Effect.Effect<void>;
}

interface Following {
  readonly key: QueryKey;
  readonly scope: Scope.Closeable;
  readonly refresh: Effect.Effect<void>;
}

/**
 * While the next key loads, the last value stays on screen marked stale.
 * A view that moved from one page of results to the next keeps the old page
 * dimmed instead of flashing its fallback; the fallback is for having
 * nothing, and it has something.
 */
const carry = <A, E>(shown: QueryState<A, E>, incoming: QueryState<A, E>): QueryState<A, E> => {
  if (incoming._tag === "Loading" && shown._tag === "Ready") {
    return Ready(shown.value, true);
  }
  return incoming;
};

/**
 * Declare a query whose arguments are a source. Each new argument value
 * opens that key's entry in a child scope and releases the previous one, so
 * a read the old key had in flight is interrupted and `active` names only
 * the key on screen. `None` declares nothing: there is no question to ask,
 * and the state is `Loading` until there is one.
 */
export const followQuery = Effect.fn("followQuery")(function* <Q extends AnyQuery>(
  contract: Q,
  args: Source<Option.Option<ArgsOf<Q>>>,
) {
  const cache = yield* QueryCache;
  const transport = yield* ActorTransport;
  const scope = yield* Effect.scope;
  const output = yield* SubscriptionRef.make<QueryState<ResultOf<Q>, QueryFailure>>(Loading());
  let current: Option.Option<Following> = Option.none();

  const leave = Effect.suspend(() => {
    const previous = current;
    current = Option.none();
    return Option.match(previous, {
      onNone: () => Effect.void,
      onSome: (following) => Scope.close(following.scope, Exit.void),
    });
  });

  const enter = (next: ArgsOf<Q>) =>
    Effect.gen(function* () {
      const key = yield* encodeKey(contract, next);
      if (Option.exists(current, (following) => keyOf(following.key) === keyOf(key))) {
        return;
      }
      yield* leave;
      const child = yield* Scope.fork(scope);
      const entry = yield* Scope.provide(cache.open(contract, next), child).pipe(
        Effect.provideService(ActorTransport, transport),
      );
      current = Option.some({ key, scope: child, refresh: entry.refresh });
      yield* Effect.forkIn(
        Stream.runForEach(entry.state.changes, (state) =>
          SubscriptionRef.update(output, (shown) => carry(shown, state)),
        ),
        child,
      );
    });

  const follow = (next: Option.Option<ArgsOf<Q>>) =>
    Option.match(next, {
      onNone: () => Effect.andThen(leave, SubscriptionRef.set(output, Loading())),
      onSome: enter,
    });

  yield* follow(yield* args.get);
  yield* Effect.forkScoped(Stream.runForEach(args.changes, follow));

  const followed: FollowedQuery<ResultOf<Q>, QueryFailure> = {
    state: { get: SubscriptionRef.get(output), changes: SubscriptionRef.changes(output) },
    refresh: Effect.suspend(() =>
      Option.match(current, {
        onNone: () => Effect.void,
        onSome: (following) => following.refresh,
      }),
    ),
  };
  return followed;
});
