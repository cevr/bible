/** The Bun composition of §9's hybrid search, and the seam a test substitutes.
 *
 *  Its own module rather than the bottom of `search.ts`, because the parity test
 *  in `packages/cli/test/commands/egw-search.test.ts` substitutes the seam and
 *  nothing else; importing `search.ts` to reach it would drag in the printer and
 *  every flag with it.
 *
 *  The pattern is `WikiLayer` / `LookupLayer` / `StudyLayer` (M5-M7): a
 *  `Context.Reference` whose default opens the installed corpora under
 *  `~/.bible`, so a test provides its own layer without the command knowing.
 */

import { EGWParagraphDatabase } from '@bible/core/egw-db';
import * as EGWDbBun from '@bible/core/egw-db/bun';
import {
  layerFileVectorIndexBytes,
  loadVectorIndex,
  ResolvedVectorIndex,
  SearchCorpusSources,
  SearchService,
  VectorIndexBytes,
} from '@bible/core/search';
import { layerBunEmbedder } from '@bible/core/search/bun';
import { WikiService } from '@bible/core/wiki';
import { layerBunWithCatalog } from '@bible/core/wiki/bun';
import { BunServices } from '@effect/platform-bun';
import { Config, Context, Effect, Layer, Path } from 'effect';

/** The installed index, parsed **once**, and only if the shipped parser accepts
 *  it.
 *
 *  §9.2's artifact is not self-describing enough for a digest to be the whole
 *  gate: a file can be intact and still be an index this build must not scan —
 *  built by another model, or tiled inconsistently. `loadVectorIndex` already
 *  maps every such fault onto §9.6's typed absence, so running it here and
 *  handing the *result* down is what makes "installed" mean "usable" for the
 *  rest of the process.
 *
 *  **The result, not the byte source** (round-2 F8). The earlier shape ran
 *  `loadVectorIndex` to decide, then provided `VectorIndexBytes` to
 *  `SearchService.Live`, which read and parsed the same file a second time —
 *  two full reads of a 246 MB artifact and two copies of its vector region at
 *  every CLI startup, for one decision. `ResolvedVectorIndex` carries the parsed
 *  index the gate already produced, so the file is read exactly once.
 *
 *  `VectorIndexBytes.None` is still provided beside it: the service's layer
 *  requires the byte source as the declaration of what a host ships, and this
 *  host has already turned its bytes into an index. Providing `None` says the
 *  bytes are not to be read again rather than leaving the requirement dangling.
 *
 *  The desktop host reaches the same guarantee through `CorpusSupply`, whose
 *  installer runs the same parser before the atomic swap. The CLI reads whatever
 *  is already on disk, so it applies the gate at read time instead. */
/** Read the gate's decision from the supplied byte source. The source layer is
 *  provided here, at this operation's own boundary. */
const resolveVectorIndex = (source: Layer.Layer<VectorIndexBytes>) =>
  loadVectorIndex.pipe(Effect.provide(source));

export const verifiedVectorIndex = (
  filename: string,
  /** The byte source to gate. Defaults to the real file reader over Bun's
   *  platform services; the F8 counting test substitutes one that records how
   *  many times the artifact is read, which is the only observable that tells a
   *  single startup read apart from two. */
  source: Layer.Layer<VectorIndexBytes> = layerFileVectorIndexBytes(filename).pipe(
    Layer.provide(BunServices.layer),
  ),
): Layer.Layer<ResolvedVectorIndex | VectorIndexBytes> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const loaded = yield* resolveVectorIndex(source);
      if (loaded._tag !== 'index') {
        // Refused, and said so once at startup rather than per query.
        yield* Effect.logInfo('search.vectorIndex.refused').pipe(
          Effect.annotateLogs({ filename, reason: loaded.absence.reason }),
        );
      }
      return Layer.merge(ResolvedVectorIndex.layerOf(loaded), VectorIndexBytes.None);
    }),
  );

/** The two corpora §9 reads, plus the optional index, resolved against `~/.bible`.
 *
 *  One `Layer.unwrap` for all three because they share the same two facts — the
 *  path service and `HOME` — and resolving them once is what keeps the three
 *  file locations spelled in a single place. */
const installedSearchLayer: Layer.Layer<SearchService> = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* Config.string('HOME');
    const at = (file: string): string => path.join(home, '.bible', file);

    // `paragraphs_fts` for the ranking; the wiki for the pinned topics group.
    const sources = Layer.effect(
      SearchCorpusSources,
      Effect.gen(function* () {
        return SearchCorpusSources.of({
          _tag: 'wired',
          sources: {
            paragraphs: yield* EGWParagraphDatabase,
            wiki: yield* WikiService,
          },
        });
      }),
    ).pipe(
      Layer.provide(EGWDbBun.layerBun(at('egw-paragraphs.db'))),
      Layer.provide(
        layerBunWithCatalog({
          topics: at('topics.db'),
          bible: at('bible.db'),
          writings: at('egw-paragraphs.db'),
        }),
      ),
      // The writings database failing to open is the one hard input here: with
      // no `paragraphs_fts` there is no lexical leg, and §9 has no degraded
      // shape for that. It reports as a defect rather than as a search that
      // silently finds nothing.
      Layer.orDie,
    );

    return SearchService.Live.pipe(
      Layer.provide(sources),
      // Absent on every machine that has not built or downloaded one, which is
      // the ordinary case — §9.6 makes that a typed value on the result rather
      // than anything this layer has to handle.
      //
      // Gated on the shipped parser accepting it, so only an index this build
      // can actually read reaches search. `loadVectorIndex` maps every fault
      // onto §9.6's typed absence, so a truncated or foreign-fingerprint file
      // degrades to lexical-only here rather than being scanned.
      Layer.provide(verifiedVectorIndex(at('vectors.bvi'))),
      // Provided rather than omitted so the CLI *can* run the vector leg. If
      // the model is not present locally the adapter declines and the result
      // carries §9.6's `embedder` absence — the no-WebGPU browser's state,
      // expressed on a different host.
      Layer.provide(layerBunEmbedder),
    );
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
).pipe(Layer.provide(BunServices.layer));

/** The substitution point (§10's host-parity seam).
 *
 *  A `Context.Reference` rather than a plain constant so `runCli` can hand the
 *  command a fixture corpus without the command taking a layer parameter it
 *  would otherwise never vary. */
export class SearchLayer extends Context.Reference<Layer.Layer<SearchService>>(
  '@bible/cli/egw/SearchLayer',
  { defaultValue: () => installedSearchLayer },
) {}

/** Runs an effect against whichever `SearchService` is in scope. */
export const searchService = <A, E>(use: Effect.Effect<A, E, SearchService>): Effect.Effect<A, E> =>
  Effect.flatMap(SearchLayer, (layer) => use.pipe(Effect.provide(layer)));
