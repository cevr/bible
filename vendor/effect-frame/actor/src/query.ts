import { Schema } from "effect";
import type { Pure } from "./contract.js";
import type { Unauthorized, Unreachable } from "./vocabulary.js";

export { canonicalize } from "./canonical-json.js";

/**
 * The client-safe half of the Query primitive (#17): the
 * contract, the cache key, and the wire vocabulary a command reply needs.
 * This module must stay safe to ship to a browser. It never imports a host,
 * a store, or an implementation. `tests/boundary.test.ts` proves that.
 *
 * A query is a named server read over arguments. It has no identity and no
 * mailbox, so nothing here resembles an address. What it does have, and an
 * actor contract does not, is a declared dependency list: the actor
 * contracts whose commits make its cached values stale.
 */

/**
 * What a client may know about a query: its name, protocol version, the
 * shape of its arguments and its result, the authorization policy the host
 * must find, and the actor contract names a commit to which marks it stale.
 * Schemas only.
 */
export interface QueryContract<
  Name extends string,
  Args extends Pure,
  Result extends Pure,
  Policy extends string,
> {
  readonly name: Name;
  /** Bumped when `args` or `result` changes incompatibly. */
  readonly version: number;
  readonly args: Schema.fromJsonString<Args>;
  readonly result: Schema.fromJsonString<Result>;
  /**
   * The policy the host resolves before serving this query. A query without
   * one cannot be declared: the type requires the field, and the host
   * refuses a name it cannot resolve. There is no allow-all default.
   */
  readonly policy: Policy;
  /** Actor contract names. A commit to any of them marks this query stale. */
  readonly depends: ReadonlyArray<string>;
  /** The schemas as given, for embedding inside a larger document. */
  readonly raw: { readonly args: Args; readonly result: Result };
}

export interface QueryOptions<Args extends Pure, Result extends Pure, Policy extends string> {
  readonly version: number;
  /** Selects one cached value. Include the tenant so a policy can read it. */
  readonly args: Args;
  readonly result: Result;
  /** Named, never inline: the host owns the rule, the contract owns the name. */
  readonly policy: Policy;
  /**
   * The actor contracts this query reads from, as contracts rather than
   * strings, so a rename cannot silently break the dependency edge.
   */
  readonly depends: ReadonlyArray<{ readonly name: string }>;
}

export type AnyQuery = QueryContract<string, Pure, Pure, string>;

export type ArgsOf<Q extends AnyQuery> = Q["args"]["Type"];
export type ResultOf<Q extends AnyQuery> = Q["result"]["Type"];

export const query = <
  const Name extends string,
  Args extends Pure,
  Result extends Pure,
  const Policy extends string,
>(
  name: Name,
  options: QueryOptions<Args, Result, Policy>,
): QueryContract<Name, Args, Result, Policy> => ({
  name,
  version: options.version,
  args: Schema.fromJsonString(options.args),
  result: Schema.fromJsonString(options.result),
  policy: options.policy,
  depends: options.depends.map((dependency) => dependency.name),
  raw: { args: options.args, result: options.result },
});

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

/**
 * Where one cached query value lives. Every field is a string, like an
 * `Address`, but a key is a value and not a place: two clients that encode
 * the same arguments name the same cache entry.
 */
export interface QueryKey {
  readonly query: string;
  readonly version: number;
  readonly args: string;
}

/**
 * The cache key as one string. `args` is already canonical JSON, so the
 * identity of a key is the identity of its encoded arguments.
 */
export const keyOf = (key: QueryKey): string => `${key.query}@${key.version}/${key.args}`;

// ---------------------------------------------------------------------------
// Query state
// ---------------------------------------------------------------------------

/**
 * What a client can observe about a query at one moment. Never two of these
 * at once. Ticket #16 builds readiness over this same union; the tags and
 * the field names are the coordination point and must not drift.
 */
export type QueryState<A, E> =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Ready"; readonly value: A; readonly stale: boolean }
  | { readonly _tag: "Failed"; readonly error: E };

export const Loading = <A, E>(): QueryState<A, E> => ({ _tag: "Loading" });

export const Ready = <A, E>(value: A, stale: boolean): QueryState<A, E> => ({
  _tag: "Ready",
  value,
  stale,
});

export const Failed = <A, E>(error: E): QueryState<A, E> => ({ _tag: "Failed", error });

/** Marks a ready value stale. Loading and Failed have nothing to hold. */
export const markStale = <A, E>(state: QueryState<A, E>): QueryState<A, E> => {
  if (state._tag === "Ready") {
    return Ready(state.value, true);
  }
  return state;
};

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

/** No implementation is registered for this query name. */
export class UnknownQuery extends Schema.TaggedError<UnknownQuery>()("UnknownQuery", {
  query: Schema.String,
}) {}

/** The client and server query contracts differ in version. */
export class QueryVersionMismatch extends Schema.TaggedError<QueryVersionMismatch>()(
  "QueryVersionMismatch",
  { query: Schema.String, expected: Schema.Finite, actual: Schema.Finite },
) {}

/**
 * The query names a policy the host cannot resolve. The host refuses to
 * serve it. This is the removed allow-all default, made visible.
 */
export class PolicyMissing extends Schema.TaggedError<PolicyMissing>()("PolicyMissing", {
  query: Schema.String,
  policy: Schema.String,
}) {}

/** The query handler failed. The handler's own error, encoded by the host. */
export class QueryFailed extends Schema.TaggedError<QueryFailed>()("QueryFailed", {
  query: Schema.String,
  detail: Schema.String,
}) {}

/**
 * The arguments did not decode against the server's contract. A client
 * built from the same contract cannot send these; one built from a skewed
 * contract of the same name and version can, and the answer is a typed
 * refusal rather than a defect in the host.
 */
export class InvalidQueryArgs extends Schema.TaggedError<InvalidQueryArgs>()("InvalidQueryArgs", {
  query: Schema.String,
  detail: Schema.String,
}) {}

/**
 * Everything a query read can fail with, including the two failures a
 * transport raises. A query has no address, so `ContractMismatch` and
 * `UnknownContract` cannot apply: a query's own version mismatch is
 * `QueryVersionMismatch`.
 */
export type QueryFailure =
  | UnknownQuery
  | QueryVersionMismatch
  | PolicyMissing
  | InvalidQueryArgs
  | QueryFailed
  | Unauthorized
  | Unreachable;
