import type { Scope } from "effect";
import { Context, Effect, Option, Schema } from "effect";
import type { AnyQuery, ArgsOf, QueryFailure, QueryKey, ResultOf } from "./query.js";
import type { TransportService } from "./transport.js";
import { ActorTransport } from "./transport.js";
import type { Unauthorized } from "./vocabulary.js";
import {
  PolicyMissing,
  QueryFailed,
  QueryVersionMismatch,
  UnknownQuery,
  canonicalize,
} from "./query.js";

/**
 * The server half of the Query primitive (#17). This
 * module is server-only: it holds handlers and the policy table. It never
 * reaches the client entry.
 */

/** Marker for the import-boundary test: this string must never reach a client bundle. */
export const queryServerOnly = "@effect-frame/actor:query-server-only";

/**
 * The server half of a query contract: the handler that produces the result
 * for decoded arguments. The implementation owns every codec, exactly as an
 * actor implementation does.
 */
export interface QueryImplementation<Q extends AnyQuery, R> {
  readonly contract: Q;
  /** Decoded args in, encoded result out. Type-erased for the host. */
  readonly run: (
    args: string,
  ) => Effect.Effect<string, QueryFailed, R | ActorTransport | Scope.Scope>;
}

export interface AnyQueryImplementation<R> {
  readonly contract: AnyQuery;
  readonly run: (
    args: string,
  ) => Effect.Effect<string, QueryFailed, R | ActorTransport | Scope.Scope>;
}

/**
 * `ActorTransport` and `Scope` are supplied by the host, so they leave the
 * implementation's requirements: a handler may open an actor reference, and
 * the reference lives exactly as long as the one read. That is what lets
 * one host own both halves with no cycle and no second instance set.
 */
export const implementQuery = <Q extends AnyQuery, E, R>(
  contract: Q,
  handler: (args: ArgsOf<Q>) => Effect.Effect<ResultOf<Q>, E, R | ActorTransport | Scope.Scope>,
): QueryImplementation<Q, R> => {
  const decodeArgs = Schema.decodeEffect(contract.args);
  const encodeResult = Schema.encodeEffect(contract.result);
  return {
    contract,
    run: (args) =>
      decodeArgs(args).pipe(
        Effect.orDie,
        Effect.flatMap(handler),
        // The handler's own error is the author's; the host reports it as one
        // typed failure so a bad read never breaks the protocol.
        Effect.mapError((error) =>
          QueryFailed.make({ query: contract.name, detail: String(error) }),
        ),
        Effect.flatMap((result) => Effect.orDie(encodeResult(result))),
      ),
  };
};

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * Decides whether the caller may read one query with these arguments. The
 * arguments are the encoded string, so a tenant inside them is enough to
 * scope access, exactly as an actor key is.
 */
export interface QueryPolicy {
  readonly check: (key: QueryKey) => Effect.Effect<void, Unauthorized>;
}

/**
 * The policy table. There is no default: a host that provides no table
 * refuses every query, because a query names a policy the host must find.
 * This is the allow-all default removed, made structural.
 */
export interface PolicyTable {
  readonly [name: string]: QueryPolicy;
}

const noPolicies: PolicyTable = {};

export const QueryPolicies = Context.Reference<PolicyTable>(
  "@effect-frame/actor/src/query-host/QueryPolicies",
  { defaultValue: () => noPolicies },
);

// ---------------------------------------------------------------------------
// The query host
// ---------------------------------------------------------------------------

/**
 * Serves queries and answers which of a caller's active keys a commit to
 * one actor contract made stale. The actor host asks this service for the
 * single-flight refreshes it puts in a command reply.
 */
export interface QueryServing {
  /** Reads one query. Resolves the policy first. */
  readonly get: (key: QueryKey) => Effect.Effect<string, QueryFailure>;
  /**
   * Of the caller's active keys, the ones whose query declares a dependency
   * on this actor contract name. Pure: it reads the contracts, not a
   * registry of live subscriptions.
   */
  readonly dependents: (
    contractName: string,
    active: ReadonlyArray<QueryKey>,
  ) => ReadonlyArray<QueryKey>;
}

export interface QueryHostOptions<R> {
  readonly queries: ReadonlyArray<AnyQueryImplementation<R>>;
}

/**
 * Why the query host is built inside the actor host rather than beside it.
 *
 * A query handler reads actors, so it needs `ActorTransport`. The actor
 * host needs the query host to answer a command's single-flight refresh.
 * Two layers would be a cycle, and a second `ActorHost.layer` to break it
 * would open a second set of instances: the query would read state the
 * command never touched. So there is one host. `ActorHost.layer` takes the
 * query implementations, makes the transport, and hands that transport to
 * the query handlers it opens. One root wires both; a caller cannot get
 * this wrong, because there is no second thing to wire.
 */

const resolve = <R>(
  byName: Map<string, AnyQueryImplementation<R>>,
  key: QueryKey,
): Effect.Effect<AnyQueryImplementation<R>, UnknownQuery | QueryVersionMismatch> =>
  Option.match(Option.fromNullishOr(byName.get(key.query)), {
    onNone: () => Effect.fail(UnknownQuery.make({ query: key.query })),
    onSome: (implementation) => {
      if (implementation.contract.version !== key.version) {
        return Effect.fail(
          QueryVersionMismatch.make({
            query: key.query,
            expected: implementation.contract.version,
            actual: key.version,
          }),
        );
      }
      return Effect.succeed(implementation);
    },
  });

/**
 * Builds the serving half. `transport` is the actor transport the handlers
 * read actors through: the very one the enclosing host just made.
 */
export const make = <R>(
  options: QueryHostOptions<R>,
  transport: TransportService,
): Effect.Effect<QueryServing, never, R> =>
  Effect.gen(function* () {
    const context = yield* Effect.context<R>();
    const policies = yield* QueryPolicies;
    const byName = new Map(
      options.queries.map((implementation) => [implementation.contract.name, implementation]),
    );

    const authorize = (
      implementation: AnyQueryImplementation<R>,
      key: QueryKey,
    ): Effect.Effect<void, PolicyMissing | Unauthorized> => {
      const named = implementation.contract.policy;
      // A query names a policy. If the host cannot resolve that name, it
      // refuses: silence here would be the allow-all default returning.
      return Option.match(Option.fromNullishOr(policies[named]), {
        onNone: () => Effect.fail(PolicyMissing.make({ query: key.query, policy: named })),
        onSome: (policy) => policy.check(key),
      });
    };

    const get = (key: QueryKey): Effect.Effect<string, QueryFailure> =>
      Effect.gen(function* () {
        const implementation = yield* resolve(byName, key);
        yield* authorize(implementation, key);
        // The host is the boundary: each handler gets the host's context and
        // the host's own transport, so a handler reads the same instances a
        // command mutates. The read owns a scope of its own, so an actor
        // reference a handler opens is released when the read returns.
        // oxlint-disable-next-line effect/noInlineProvide
        const provided = Effect.provideService(
          // oxlint-disable-next-line effect/noInlineProvide
          Effect.provideContext(implementation.run(canonicalize(key.args)), context),
          ActorTransport,
          transport,
        );
        return yield* Effect.scoped(provided);
      });

    const dependents = (contractName: string, active: ReadonlyArray<QueryKey>) =>
      active.filter((key) =>
        Option.match(Option.fromNullishOr(byName.get(key.query)), {
          onNone: () => false,
          onSome: (implementation) => implementation.contract.depends.includes(contractName),
        }),
      );

    const serving: QueryServing = { get, dependents };
    return serving;
  });
