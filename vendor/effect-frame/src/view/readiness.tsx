import type { Source } from "effect-frame/actor";
import { select } from "effect-frame/actor/client";
import { Context as ServiceMap, Effect, Match, Option, Stream, SubscriptionRef } from "effect";
import { Show } from "./control.js";
import type { Node } from "./jsx-runtime.js";
import type { QueryState } from "./query-state.js";
import { held } from "./query-state.js";
import type { View } from "./view.js";
import { make as makeView } from "./view.js";

/**
 * Readiness through context (#16).
 *
 * A readiness scope is a region of a view that shows a fallback until every
 * query it was given has a first value, and afterwards keeps showing content
 * while values refresh. The scope is a service in the view's Effect context:
 * `ready` requires it, `Loading` provides it. A `ready` call with no `Loading`
 * above it is a missing service, which is a compile error, not a runtime one.
 *
 * Nothing is thrown and nothing is caught. Solid's `NotReadyError` and React's
 * Suspense both signal readiness by throwing; here the signal is a type.
 */

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * What one registered query contributes to its scope: whether it has
 * produced the kind of value this scope is waiting for, and the failure it
 * carries when it has failed. A loading registration never fails; its
 * `failure` is a constant `None`.
 */
interface Registration {
  readonly settled: Source<boolean>;
  readonly failure: Source<Option.Option<unknown>>;
}

/** One registration's current contribution, read when the scope recomputes. */
interface Contribution {
  readonly settled: boolean;
  readonly failure: Option.Option<unknown>;
}

const noFailure: Source<Option.Option<unknown>> = {
  get: Effect.succeed(Option.none()),
  changes: Stream.empty,
};

/**
 * The shared machinery behind both scopes. A scope holds the registrations
 * made under it and publishes a revision whenever the set changes, so the
 * derived pending source recomputes when a query registers after first paint.
 */
interface Registry {
  readonly register: (registration: Registration) => Effect.Effect<void>;
  /** Every registration made so far, republished whenever one is added. */
  readonly entries: Source<ReadonlyArray<Registration>>;
}

const makeRegistry: Effect.Effect<Registry> = Effect.gen(function* () {
  const ref = yield* SubscriptionRef.make<ReadonlyArray<Registration>>([]);
  return {
    register: (registration) => SubscriptionRef.update(ref, (all) => [...all, registration]),
    entries: { get: SubscriptionRef.get(ref), changes: SubscriptionRef.changes(ref) },
  };
});

/**
 * The scope a `ready` call registers with. `LoadingScope` waits for a first
 * Ready; `ErroredScope` waits for the absence of a Failed. Two services, not
 * one with a flag, so a view that only handles errors does not silently
 * become a loading boundary as well.
 */
export class LoadingScope extends ServiceMap.Service<LoadingScope, Registry>()(
  "effect-frame/src/view/readiness/LoadingScope",
) {}

export class ErroredScope extends ServiceMap.Service<ErroredScope, Registry>()(
  "effect-frame/src/view/readiness/ErroredScope",
) {}

// ---------------------------------------------------------------------------
// ready
// ---------------------------------------------------------------------------

/**
 * Turn a query's state source into a synchronous-looking source of its value,
 * and register it with the nearest `LoadingScope`.
 *
 * The returned source holds the last Ready value. Before the first one
 * arrives it reports `fallback`, and the surrounding `Loading` guarantees
 * nothing built from it is on screen yet. That is the whole trick: the value
 * source never has to represent absence, because the scope removes the
 * consumer from the tree until absence is over.
 *
 * `R` carries `LoadingScope`, so calling this outside a `Loading` does not
 * compile. Pair it with `orErrored` to route the failure as well.
 */
export const ready = Effect.fn("Readiness.ready")(function* <Value, Error>(
  state: Source<QueryState<Value, Error>>,
  fallback: Value,
) {
  const shared = yield* registerLoading(state);
  const first = yield* shared.get;
  return yield* holdSome(valueOr(first, fallback), Stream.map(shared.changes, valueOf));
});

/**
 * Also route this query's failure to the nearest `ErroredScope`.
 *
 * It is a separate call, not a second thing `ready` does, because the two
 * requirements are not the same promise. `ready` alone says "this view does
 * not draw until a value exists", which a `Loading` can keep by itself. Only
 * a query whose failure someone must show needs an `Errored` above it, and
 * making that the caller's word keeps `Loading` usable with no `Errored` in
 * the tree. The alternative — `ready` requiring both — made every `Loading`
 * leak `ErroredScope` to its own caller, which the compiler caught.
 */
export const orErrored = Effect.fn("Readiness.orErrored")(function* <Value, Error>(
  state: Source<QueryState<Value, Error>>,
) {
  const erroredScope = yield* ErroredScope;
  const initial = yield* state.get;
  yield* erroredScope.register({
    settled: yield* held(isNotFailed(initial), Stream.map(state.changes, isNotFailed)),
    failure: yield* held(errorOf(initial), Stream.map(state.changes, errorOf)),
  });
  return state;
});

/**
 * Register a query with the nearest `LoadingScope`.
 *
 * The loading scope settles on Ready *or* Failed, not on Ready alone. A
 * failed query is never going to produce a value, so a loading fallback that
 * waited for one would hang forever, and it would hang underneath the error
 * fallback that is already on screen: two fallbacks for one query, which is
 * the state this whole design exists to rule out. "Settled" means the query
 * has stopped being in flight; which of the two scopes then draws is the
 * scopes' business, not this registration's.
 */
const registerLoading = Effect.fn("Readiness.registerLoading")(function* <Value, Error>(
  state: Source<QueryState<Value, Error>>,
) {
  const loadingScope = yield* LoadingScope;
  yield* loadingScope.register({
    settled: yield* held(hasSettled(yield* state.get), Stream.map(state.changes, hasSettled)),
    failure: noFailure,
  });
  return state;
});

/**
 * `ready`, keeping the stale flag. The Refetch row says stale content stays
 * on screen and the flag is available; a view that wants to dim itself binds
 * this instead of losing the information.
 */
export const readyWithStale = Effect.fn("Readiness.readyWithStale")(function* <Value, Error>(
  state: Source<QueryState<Value, Error>>,
  fallback: Value,
) {
  const shared = yield* registerLoading(state);
  const initial = yield* shared.get;
  return yield* holdSome<ReadyValue<Value>>(
    { value: valueOr(initial, fallback), stale: false },
    Stream.map(shared.changes, readyValueOf),
  );
});

export interface ReadyValue<Value> {
  readonly value: Value;
  readonly stale: boolean;
}

/**
 * Hold the last present value, starting from `initial`. Absent updates are
 * dropped rather than represented: the consumer of this source is only in
 * the tree while a value exists, so it never has to read absence.
 */
const holdSome = <A,>(
  initial: A,
  changes: Stream.Stream<Option.Option<A>>,
): Effect.Effect<Source<A>> =>
  held(
    initial,
    Stream.map(Stream.filter(changes, Option.isSome), (some) => some.value),
  );

const isReady = <Value, Error>(state: QueryState<Value, Error>): boolean =>
  Match.value(state).pipe(
    Match.withReturnType<boolean>(),
    Match.tagsExhaustive({ Loading: () => false, Ready: () => true, Failed: () => false }),
  );

/** `true` once the query has stopped being in flight, either way. */
const hasSettled = <Value, Error>(state: QueryState<Value, Error>): boolean =>
  Match.value(state).pipe(
    Match.withReturnType<boolean>(),
    Match.tagsExhaustive({ Loading: () => false, Ready: () => true, Failed: () => true }),
  );

/**
 * `true` while the query has not failed. `ErroredScope` reads this to decide
 * whether to show its own fallback.
 */
const isNotFailed = <Value, Error>(state: QueryState<Value, Error>): boolean =>
  Match.value(state).pipe(
    Match.withReturnType<boolean>(),
    Match.tagsExhaustive({ Loading: () => true, Ready: () => true, Failed: () => false }),
  );

const valueOf = <Value, Error>(state: QueryState<Value, Error>): Option.Option<Value> =>
  Match.value(state).pipe(
    Match.withReturnType<Option.Option<Value>>(),
    Match.tagsExhaustive({
      Loading: () => Option.none(),
      Ready: (found) => Option.some(found.value),
      Failed: () => Option.none(),
    }),
  );

const readyValueOf = <Value, Error>(
  state: QueryState<Value, Error>,
): Option.Option<ReadyValue<Value>> =>
  Match.value(state).pipe(
    Match.withReturnType<Option.Option<ReadyValue<Value>>>(),
    Match.tagsExhaustive({
      Loading: () => Option.none(),
      Ready: (found) => Option.some({ value: found.value, stale: found.stale }),
      Failed: () => Option.none(),
    }),
  );

const valueOr = <Value, Error>(state: QueryState<Value, Error>, fallback: Value): Value =>
  Option.getOrElse(valueOf(state), () => fallback);

const errorOf = <Value, Error>(state: QueryState<Value, Error>): Option.Option<Error> =>
  Match.value(state).pipe(
    Match.withReturnType<Option.Option<Error>>(),
    Match.tagsExhaustive({
      Loading: () => Option.none(),
      Ready: () => Option.none(),
      Failed: (found) => Option.some(found.error),
    }),
  );

/** The first failure among the contributions, in registration order. */
const firstFailure = (contributions: ReadonlyArray<Contribution>): Option.Option<unknown> =>
  Option.flatMap(
    Option.fromNullishOr(contributions.find((one) => Option.isSome(one.failure))),
    (one) => one.failure,
  );

// ---------------------------------------------------------------------------
// Deriving pending
// ---------------------------------------------------------------------------

/**
 * `true` while any registration is unsettled, and `true` as well when there
 * is no registration yet.
 *
 * The empty case is what makes this work under setup-once semantics. A view's
 * setup runs once, and a child's `ready` registers during that run, so the
 * scope cannot know when registration is "complete". It never asks. It starts
 * pending, and it leaves pending only once it holds at least one settled
 * registration and no unsettled one. A query that registers later simply
 * flips it back.
 */
const pendingOf = (registry: Registry): Effect.Effect<Source<boolean>> =>
  derive(registry, (all) => all.length === 0 || all.some((one) => !one.settled));

/**
 * Derive one source from every registration under a scope.
 *
 * `fold` sees each registration's current contribution, in registration
 * order. The result recomputes on two triggers: a new registration, and any
 * registered query changing state. `switchMap` re-subscribes to the whole
 * set whenever the set itself changes, so a query that registers after
 * first paint is picked up without anyone writing a flag.
 */
const derive = <A,>(
  registry: Registry,
  fold: (contributions: ReadonlyArray<Contribution>) => A,
): Effect.Effect<Source<A>> =>
  Effect.gen(function* () {
    const contribution = (entry: Registration): Effect.Effect<Contribution> =>
      Effect.map(Effect.all([entry.settled.get, entry.failure.get]), ([settled, failure]) => ({
        settled,
        failure,
      }));
    const compute = (entries: ReadonlyArray<Registration>): Effect.Effect<A> =>
      Effect.map(Effect.forEach(entries, contribution, { concurrency: 1 }), fold);

    const entryChanges = Stream.switchMap(registry.entries.changes, (entries) =>
      Stream.merge(
        Stream.succeed(entries),
        Stream.map(
          Stream.mergeAll(
            entries.flatMap((entry): ReadonlyArray<Stream.Stream<void>> => [
              Stream.map(entry.settled.changes, () => void 0),
              Stream.map(entry.failure.changes, () => void 0),
            ]),
            { concurrency: "unbounded" },
          ),
          () => entries,
        ),
      ),
    );

    const initial = yield* Effect.flatMap(registry.entries.get, compute);
    return yield* held(initial, Stream.mapEffect(entryChanges, compute));
  });

// ---------------------------------------------------------------------------
// The scope views
// ---------------------------------------------------------------------------

/**
 * Provide a `LoadingScope` to the children and show `fallback` until every
 * query registered under it has a first value. Afterwards the content stays,
 * whatever the queries do next.
 *
 * `Show` is the whole mechanism: the fallback and the content are both built,
 * and the derived pending source picks which one is in the tree. Nothing is
 * thrown, so nothing has to be caught, and the content's host nodes are never
 * discarded once they exist.
 */
export const Loading = <E, R>(
  props: LoadingProps<E, R>,
): View<Record<string, never>, E, Exclude<R, LoadingScope>> =>
  makeView(() =>
    Effect.gen(function* () {
      const registry = yield* makeRegistry;
      const pending = yield* pendingOf(registry);
      const content = yield* Effect.provideService(props.children, LoadingScope, registry);
      return (
        <>
          <Show when={pending}>{props.fallback}</Show>
          <Show when={select(pending, (value) => !value)}>{content}</Show>
        </>
      );
    }),
  );

export interface LoadingProps<E, R> {
  readonly fallback: Node;
  readonly children: Effect.Effect<Node, E, R>;
}

export interface ErroredProps<E, R> {
  /**
   * The fallback reads the first failure among the queries routed here, in
   * registration order. It is `unknown` because one scope may hold queries
   * with different error types; the fallback narrows what it shows.
   */
  readonly fallback: (error: Source<Option.Option<unknown>>) => Node;
  readonly children: Effect.Effect<Node, E, R>;
}

/**
 * Provide an `ErroredScope`. Symmetric with `Loading`: it shows its fallback
 * once a registered query has failed, and unlike `Loading` it stays showing
 * it, because a failure does not resolve itself.
 */
export const Errored = <E, R>(
  props: ErroredProps<E, R>,
): View<Record<string, never>, E, Exclude<R, ErroredScope>> =>
  makeView(() =>
    Effect.gen(function* () {
      const registry = yield* makeRegistry;
      const failure = yield* derive(registry, firstFailure);
      const failed = select(failure, Option.isSome);
      const content = yield* Effect.provideService(props.children, ErroredScope, registry);
      return (
        <>
          <Show when={failed}>{props.fallback(failure)}</Show>
          <Show when={select(failed, (value) => !value)}>{content}</Show>
        </>
      );
    }),
  );

// ---------------------------------------------------------------------------
// Await
// ---------------------------------------------------------------------------

export interface AwaitProps<Value, Error> {
  readonly query: Source<QueryState<Value, Error>>;
  readonly loading: Node;
  readonly failed: (error: Source<Error>) => Node;
  readonly ready: (value: Source<ReadyValue<Value>>) => Node;
  /**
   * What the Ready and Failed branches read before their state has ever been
   * reached. Asking for it is the honest alternative to a cast: a `Source<A>`
   * must answer `get` synchronously, and `Show` has not yet put the branch in
   * the tree, so this value is never drawn. Making the caller name it keeps
   * `Await` free of both `any` and a fourth state.
   */
  readonly before: { readonly value: Value; readonly error: Error };
}

/**
 * The other half of the pair: match the union yourself, with no scope in
 * context and no registration. `Await` is a view rather than a control node
 * because it needs an Effect to build its three branches' sources.
 *
 * It requires nothing. That is the point of showing both: `ready` inside
 * `Loading` is the facade for the common case, and `Await` is the escape
 * hatch for a view that wants all three states in one place.
 */
export const Await = <Value, Error>(
  props: AwaitProps<Value, Error>,
): View<Record<string, never>, never, never> =>
  makeView(() =>
    Effect.gen(function* () {
      const shared = props.query;
      const initial = yield* shared.get;

      const readyValue = yield* holdSome<ReadyValue<Value>>(
        Option.getOrElse(readyValueOf(initial), () => ({
          value: props.before.value,
          stale: false,
        })),
        Stream.map(shared.changes, readyValueOf),
      );
      const errorValue = yield* holdSome<Error>(
        Option.getOrElse(errorOf(initial), () => props.before.error),
        Stream.map(shared.changes, errorOf),
      );

      const isLoadingNow = yield* held(
        !hasSettled(initial),
        Stream.map(shared.changes, (state) => !hasSettled(state)),
      );
      const isReadyNow = yield* held(isReady(initial), Stream.map(shared.changes, isReady));
      const isFailedNow = yield* held(
        !isNotFailed(initial),
        Stream.map(shared.changes, (state) => !isNotFailed(state)),
      );

      return (
        <>
          <Show when={isLoadingNow}>{props.loading}</Show>
          <Show when={isReadyNow}>{props.ready(readyValue)}</Show>
          <Show when={isFailedNow}>{props.failed(errorValue)}</Show>
        </>
      );
    }),
  );
