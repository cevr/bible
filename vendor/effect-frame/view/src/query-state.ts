import type { QueryState as ActorQueryState, Source } from "@effect-frame/actor";
import { Effect, Match, Schema, Stream, SubscriptionRef } from "effect";

/**
 * What a client can observe about a query at one moment (#16): loading,
 * ready with a value that may be stale, or failed with an error. Never two
 * of these at once. The type is the actor package's `QueryState`: the Query
 * primitive (#17) produces it and readiness consumes it, so there is one
 * union and no drift between them.
 *
 * The union is also a Schema so a server render can serialize a pending
 * query and the client can resume it, the way `resumeCodec` carries an actor
 * snapshot. The fake source at the end drives the readiness tests.
 */

export const Loading = Schema.TaggedStruct("Loading", {});
export type Loading = Schema.Schema.Type<typeof Loading>;

/**
 * The one shape the Refetch row needs: a value that is present while the
 * next one loads. `stale` is a flag on Ready, never a fourth state, so a
 * refetching query cannot be observed as loading.
 */
export const Ready = <Value extends Schema.Top>(value: Value) =>
  Schema.TaggedStruct("Ready", { value, stale: Schema.Boolean });

export const Failed = <Error extends Schema.Top>(error: Error) =>
  Schema.TaggedStruct("Failed", { error });

export const QueryState = <Value extends Schema.Top, Error extends Schema.Top>(
  value: Value,
  error: Error,
) => Schema.Union([Loading, Ready(value), Failed(error)]);

/** The type a view matches. One union, shared with the Query primitive. */
export type QueryState<Value, Error> = ActorQueryState<Value, Error>;

export const loading = <Value, Error>(): QueryState<Value, Error> => ({ _tag: "Loading" });

export const ready = <Value, Error>(value: Value, stale = false): QueryState<Value, Error> => ({
  _tag: "Ready",
  value,
  stale,
});

export const failed = <Value, Error>(error: Error): QueryState<Value, Error> => ({
  _tag: "Failed",
  error,
});

/** `true` once the query has a first value, whether or not it is stale. */
export const hasValue = <Value, Error>(state: QueryState<Value, Error>): boolean =>
  Match.value(state).pipe(
    Match.withReturnType<boolean>(),
    Match.tagsExhaustive({
      Loading: () => false,
      Ready: () => true,
      Failed: () => true,
    }),
  );

// ---------------------------------------------------------------------------
// A fake query, enough to drive the prototype
// ---------------------------------------------------------------------------

/**
 * A query source a test drives by hand. The real Query primitive (#17) owns
 * fetching, caching by argument, and staleness from actor commits; all this
 * has to be is a `Source<QueryState<…>>` whose transitions a test controls,
 * because that is the entire surface `ready` and the scopes consume.
 */
export interface FakeQuery<Value, Error> {
  readonly source: Source<QueryState<Value, Error>>;
  /** Deliver a first value, or replace one. */
  readonly resolve: (value: Value) => Effect.Effect<void>;
  /** Hold the current value and mark it stale: the Refetch row's shape. */
  readonly refetch: Effect.Effect<void>;
  readonly reject: (error: Error) => Effect.Effect<void>;
}

export const fakeQuery = Effect.fn("QueryState.fakeQuery")(function* <Value, Error>(
  initial: QueryState<Value, Error> = loading<Value, Error>(),
) {
  const ref = yield* SubscriptionRef.make(initial);
  const source: Source<QueryState<Value, Error>> = {
    get: SubscriptionRef.get(ref),
    changes: SubscriptionRef.changes(ref),
  };
  return {
    source,
    resolve: (value: Value) => SubscriptionRef.set(ref, ready<Value, Error>(value)),
    refetch: SubscriptionRef.update(ref, (state) =>
      Match.value(state).pipe(
        Match.withReturnType<QueryState<Value, Error>>(),
        Match.tagsExhaustive({
          Loading: (current) => current,
          Ready: (current) => ready<Value, Error>(current.value, true),
          Failed: () => loading<Value, Error>(),
        }),
      ),
    ),
    reject: (error: Error) => SubscriptionRef.set(ref, failed<Value, Error>(error)),
  } satisfies FakeQuery<Value, Error>;
});

/**
 * A source that starts from `initial` and then follows `changes`. The
 * readiness scopes build several of these, and each one must be readable
 * synchronously at mount: the tracker calls `get` with `runSync`.
 */
export const held = <A>(initial: A, changes: Stream.Stream<A>): Effect.Effect<Source<A>> =>
  Effect.sync(() => {
    let current = initial;
    return {
      get: Effect.sync(() => current),
      changes: Stream.tap(changes, (value) => Effect.sync(() => void (current = value))),
    };
  });
