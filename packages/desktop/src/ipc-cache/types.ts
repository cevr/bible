import type { Accessor, Resource } from 'solid-js';
import type { Procedure, ProcedureNode } from './procedure.js';
import type { QueryOptions } from './registry.js';

/**
 * Either a static value or a Solid accessor (function returning the value).
 * Accessor inputs are tracked: when the underlying signal changes, the
 * query refetches with the new value. Static inputs produce a stable cache
 * key for the lifetime of the call.
 */
export type Arg<T> = T | Accessor<T>;

export interface QueryProc<I, O> {
  /**
   * Subscribe to this procedure with the given input. Returns a Solid
   * `Resource<O>` — reading it inside `<Suspense>` suspends until the value
   * resolves; failures propagate to the nearest `<ErrorBoundary>`.
   *
   * `input` may be a plain value or a Solid accessor. Accessor inputs are
   * tracked, so changing the underlying signal triggers a refetch keyed off
   * the new value.
   */
  readonly query: (input: Arg<I>, options?: QueryOptions) => Resource<O>;

  /**
   * Drop the cache entry for the given input. If subscribers exist they'll
   * see a refetch; if none, the entry is removed entirely. Always called
   * with a static input — invalidating from a reactive accessor would be
   * ambiguous (which value at which moment?).
   */
  readonly invalidate: (input: I) => void;
}

export interface MutationProc<I, O> {
  /**
   * Run this procedure once, imperatively. Inputs go through Schema
   * validation; outputs through Schema decoding. The returned promise
   * resolves with the decoded result or rejects with an `IpcCacheError`.
   * Mutations bypass the cache; callers are responsible for invalidating
   * affected queries via their `.invalidate(...)`.
   */
  readonly mutate: (input: I) => Promise<O>;
}

/**
 * Derive the proxy shape from a procedure tree. Each `Procedure` leaf maps
 * to either a `QueryProc` or `MutationProc` based on its `kind`; nested
 * objects recurse into namespaces.
 */
export type IpcProxy<T> = {
  readonly [K in keyof T]: T[K] extends Procedure<infer Kind, infer I, infer O, infer _R, infer _E>
    ? Kind extends 'query'
      ? QueryProc<I, O>
      : MutationProc<I, O>
    : T[K] extends ProcedureNode
      ? IpcProxy<T[K]>
      : never;
};
