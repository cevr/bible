/**
 * A mutation promise that stays pending until the queries it staled have
 * finished refreshing.
 *
 * The retired `synced-cache` resolved `mutate(command)` only after
 * `Effect.all(refreshes)` — one refresh per *active* cache entry the command's
 * scopes matched. Callers relied on that: a component that awaits a mutation
 * and then clears a busy flag, or navigates, is promised the reads it can see
 * are already the post-mutation reads.
 *
 * `Reactivity` alone does not restore that contract, and the platform offers no
 * wait mechanism to reuse. Its `invalidate` runs each registered handler and
 * returns; `Atom`'s `withReactivity` handler is `() => get.refresh(atom)`,
 * which *starts* a refresh. So a mutation atom read in `promise` mode settles
 * on the RPC's own result, with every dependent refresh still in flight. The
 * wait therefore has to be composed at the atom level, which the platform does
 * support: `AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true })`
 * resolves at an atom's next settled, non-waiting `AsyncResult`.
 *
 * Two pieces make that composable. Queries declare their reactivity keys
 * already, so {@link trackQuery} indexes each query atom under those keys as it
 * is created — the atoms are `Atom.family` members, memoised structurally on
 * their query key, so one atom object per (procedure, payload, options) triple.
 * And "active" is decided by the registry itself: an atom that holds a live
 * node is exactly the old layer's live cache entry, so an indexed atom whose
 * node has been evicted is skipped rather than resurrected. Waiting on it would
 * do worse than the retired layer did — it would fetch a query nobody reads.
 */

import * as AtomRegistry from 'effect/unstable/reactivity/AtomRegistry';
import type * as AsyncResult from 'effect/unstable/reactivity/AsyncResult';
import type * as Atom from 'effect/unstable/reactivity/Atom';
import { Effect, Option } from 'effect';

/** The `AsyncResult` atom shape every `AtomRpc` query family produces. */
export type QueryAtom = Atom.Atom<AsyncResult.AsyncResult<unknown, unknown>>;

/**
 * The query atoms known for each reactivity key, held weakly.
 *
 * The index is global rather than per-registry because its members are the
 * atom *definitions*, which `AtomRpc`'s families already share across
 * registries; whether any given registry holds one is a question answered from
 * that registry's own nodes at wait time.
 *
 * The values are `WeakRef`s because `Atom.family` itself caches its members
 * weakly: a family holds `WeakRef`s behind a `FinalizationRegistry`, so once no
 * live owner reads a given query input the atom is collectable. A strong index
 * here would out-live the family and pin every atom the app ever built — an
 * unbounded retention for a per-location key space such as annotations. Holding
 * the same weak grip keeps the index strictly weaker than the family it points
 * at, and {@link activeQueries} prunes the cleared refs it walks past.
 */
const queriesByKey = new Map<unknown, Set<WeakRef<QueryAtom>>>();

/**
 * The one `WeakRef` per atom that the key sets share.
 *
 * `WeakRef` has no identity semantics — two refs to one atom are two distinct
 * set members — so re-registering an atom would grow its key sets without bound
 * on every read. Reusing a single ref per atom restores set dedupe, and the map
 * is keyed weakly so it retains nothing the atom's own lifetime does not.
 */
const refsByQuery = new WeakMap<QueryAtom, WeakRef<QueryAtom>>();

/**
 * Indexes a query atom under the reactivity keys it covers, so a mutation
 * touching one of those keys can wait for this query's refresh.
 *
 * Safe to call on every read: the index is a set of per-atom-memoised weak
 * refs, and the atom is memoised by its family, so repeated calls for the same
 * query are no-ops.
 */
export const trackQuery = (atom: QueryAtom, keys: readonly unknown[]): QueryAtom => {
  const ref = Option.getOrElse(Option.fromNullishOr(refsByQuery.get(atom)), () => {
    const created = new WeakRef(atom);
    refsByQuery.set(atom, created);
    return created;
  });
  for (const key of keys) {
    const tracked = Option.getOrElse(Option.fromNullishOr(queriesByKey.get(key)), () => {
      const created = new Set<WeakRef<QueryAtom>>();
      queriesByKey.set(key, created);
      return created;
    });
    tracked.add(ref);
  }
  return atom;
};

/** Test seam: drops the index so one suite's atoms cannot leak into another. */
export const resetTrackedQueries = (): void => {
  queriesByKey.clear();
};

/**
 * The tracked query atoms that the given keys stale *and* that this registry
 * currently holds a node for.
 *
 * Node presence is the liveness test. `AtomRegistry` keeps a node while the
 * atom is mounted or within its idle TTL and drops it afterwards, which is the
 * same window in which the retired cache held an entry.
 *
 * The walk doubles as the index's only reclamation pass: a ref whose atom has
 * been collected can never match a node again, so it is dropped from the key
 * set here rather than by a second sweep.
 */
const activeQueries = (
  registry: AtomRegistry.AtomRegistry,
  keys: readonly unknown[],
): readonly QueryAtom[] => {
  const live = registry.getNodes();
  const affected = new Set<QueryAtom>();
  for (const key of keys) {
    const tracked = Option.fromNullishOr(queriesByKey.get(key));
    if (Option.isNone(tracked)) continue;
    for (const ref of tracked.value) {
      const atom = Option.fromNullishOr(ref.deref());
      if (Option.isNone(atom)) {
        tracked.value.delete(ref);
        continue;
      }
      if (live.has(atom.value)) affected.add(atom.value);
    }
    if (tracked.value.size === 0) queriesByKey.delete(key);
  }
  return [...affected];
};

/**
 * Runs a mutation and resolves only once every active query the keys stale has
 * settled on its post-invalidation result.
 *
 * Order matters and is subtle. The affected queries are collected *after*
 * `mutate` resolves, which is the moment the retired cache read its entry map
 * at too — it walked `entries` inside the same `Effect.gen`, after the
 * mutation effect had returned. Collecting before would fix the wait set at
 * mutation-start and so miss a query that mounts while the RPC is in flight:
 * `Reactivity` still stales that late reader, but nothing would await it, and
 * the caller would see a pre-mutation read after its own mutation resolved.
 *
 * Collecting afterwards loses nothing, because `Reactivity.mutation` runs its
 * invalidation handlers synchronously *before* the mutation's own result
 * resolves, and `Atom`'s handler is `() => get.refresh(atom)`, which starts the
 * refresh synchronously as well. So by the time this code runs, every affected
 * atom that the registry still holds a node for is already `waiting` on its
 * post-invalidation refresh, and `suspendOnWaiting` blocks on that *next*
 * result rather than returning the stale one. An atom whose node the
 * invalidation could not keep alive is one no reader is left to observe, which
 * is exactly the atom the retired layer's entry map had already dropped.
 */
export const withSettledQueries = <A>(
  registry: AtomRegistry.AtomRegistry,
  keys: readonly unknown[],
  mutate: () => Promise<A>,
): Promise<A> =>
  // The mutation's own promise is chained rather than lifted into an Effect.
  // The setter rejects with a value this module cannot type, and callers catch
  // that exact value, so routing it through an error channel would only
  // obscure it. Chaining also means a rejected mutation skips the waits, which
  // is what the retired layer did by sequencing its refreshes after the
  // mutation inside one `Effect.gen`: a mutation that failed staled nothing.
  mutate().then((value) => {
    const affected = activeQueries(registry, keys);
    if (affected.length === 0) return value;
    return Effect.runPromise(settleAll(registry, affected)).then(() => value);
  });

/**
 * Waits for every affected query to reach a settled, non-waiting result.
 *
 * `Effect.exit` per query is what keeps a failed refresh non-fatal to the
 * mutation: the mutation itself succeeded, and a dependent read that failed
 * surfaces through its own `<Errored>` boundary, exactly as the retired
 * layer's per-entry `failed` status did.
 */
const settleAll = (
  registry: AtomRegistry.AtomRegistry,
  affected: readonly QueryAtom[],
): Effect.Effect<unknown> =>
  Effect.all(
    affected.map((atom) =>
      Effect.exit(AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true })),
    ),
    { concurrency: 16 },
  );
