/**
 * The vector index, read after the port opens.
 *
 * Reading and parsing the 265 MB artifact is most of this server's startup:
 * measured locally, ~13.6 s from process start to the first `/health` answer,
 * nearly all of it the index. While the index loaded inside the layer build, the
 * port stayed closed, so every deploy served nothing for that long. Search is
 * useful without the index — §9.6 makes lexical-only a typed degradation, not an
 * outage — so the server answers from the first moment and gains the vector leg
 * when the index is in memory.
 *
 * **One state, two services derived from it.** The state is which search
 * service answers now: a lexical-only one whose absence is `loading`, then the
 * one built over whatever the load produced. `SearchService` delegates to the
 * current one, and `/health` reports it. Neither keeps a flag of its own, so
 * the health answer and the search answer cannot disagree.
 *
 * Both services are `SearchService.Live` over the same corpus and the same
 * embedder, so the lexical leg, routing and fusion are the canonical §9
 * composition in both phases. Only the index differs.
 */

import { Context, Duration, Effect, Layer, Ref } from 'effect';

import {
  type LoadedVectorIndex,
  ResolvedVectorIndex,
  type SearchCorpusSources,
  SearchService,
  type VectorAbsenceReason,
  VectorIndexBytes,
  vectorUnavailable,
} from '@bible/core/search';

/** Which search service answers now. */
type IndexState =
  | { readonly _tag: 'loading'; readonly search: SearchService['Service'] }
  | {
      readonly _tag: 'loaded';
      readonly search: SearchService['Service'];
      readonly index: LoadedVectorIndex;
    };

/** What `/health` says about the vector leg: `ready` when it can run, else
 *  §9.6's reason it cannot — `loading` until the load ends. */
export type VectorReadiness = 'ready' | VectorAbsenceReason;

const readinessOf = (state: IndexState): VectorReadiness => {
  if (state._tag === 'loading') return 'loading';
  if (state.index._tag === 'index') return 'ready';
  return state.index.absence.reason;
};

/** The search service over one resolved index, built in the caller's scope.
 *
 *  `VectorIndexBytes.None` only satisfies the layer's requirement: with
 *  `ResolvedVectorIndex` provided, `SearchService.Live` never reads bytes. */
const searchOver = (index: LoadedVectorIndex) =>
  SearchService.Live.pipe(
    Layer.provide(ResolvedVectorIndex.layerOf(index)),
    Layer.provide(VectorIndexBytes.None),
    Layer.build,
    Effect.map((built) => Context.get(built, SearchService)),
  );

export class VectorIndexLoad extends Context.Service<
  VectorIndexLoad,
  { readonly readiness: Effect.Effect<VectorReadiness> }
>()('@bible/egw-search/VectorIndexLoad') {}

/**
 * Serve search at once, and read the index in the background.
 *
 * `load` is how this host reads its index, and what it needs to read it —
 * such as `VectorIndexBytes` — the caller provides to this layer. It runs in a fiber of the layer's
 * scope, so it ends with the server and never outlives it. It cannot fail —
 * `loadVectorIndex` maps every fault onto §9.6 — so the service it produces
 * always replaces the loading one, even when that is lexical-only for good.
 *
 * `QueryEmbedder` is not in the requirements for the reason it is not in
 * `SearchService.Live`'s: it is optional. When the caller provides one, both
 * services read the same instance, so the model loads once.
 */
export const lateVectorIndex = <R>(
  load: Effect.Effect<LoadedVectorIndex, never, R>,
): Layer.Layer<SearchService | VectorIndexLoad, never, SearchCorpusSources | R> =>
  Layer.effectContext(
    Effect.gen(function* () {
      const loading = yield* searchOver({
        _tag: 'unavailable',
        absence: vectorUnavailable('loading'),
      });
      const state = yield* Ref.make<IndexState>({ _tag: 'loading', search: loading });

      yield* Effect.logInfo('search.vectorIndex.loading');
      yield* load.pipe(
        Effect.timed,
        Effect.flatMap(([elapsed, index]) =>
          Effect.gen(function* () {
            const loaded: IndexState = { _tag: 'loaded', search: yield* searchOver(index), index };
            yield* Ref.set(state, loaded);
            yield* Effect.logInfo('search.vectorIndex.ready').pipe(
              Effect.annotateLogs({
                state: readinessOf(loaded),
                ms: Math.round(Duration.toMillis(elapsed)),
              }),
            );
          }),
        ),
        Effect.forkScoped,
      );

      return Context.make(
        SearchService,
        SearchService.of({
          // `Ref.get` is synchronous, so a host that runs a search with
          // `Effect.runSync` still can.
          query: (input) =>
            Effect.flatMap(Ref.get(state), (current) => current.search.query(input)),
        }),
      ).pipe(
        Context.add(VectorIndexLoad, {
          readiness: Effect.map(Ref.get(state), readinessOf),
        }),
      );
    }),
  );
