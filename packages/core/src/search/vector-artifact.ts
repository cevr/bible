/** The paragraph vector index as an optional corpus-supply artifact (§9.6),
 *  riding the Milestone 1 `FileCorpusArtifact` lifecycle.
 *
 *  Three instances of that lifecycle now exist — `bible`, `topics`, and this —
 *  and this one is the case the Milestone 1 refactor was performed *for*: §3.5's
 *  audit flag said to generalize the machinery "before adding the third copy",
 *  and this is the third copy. It declares two service keys and one
 *  `makeFileCorpusArtifact` call, and inherits the pinned manifest, the digest
 *  gate, the streaming install, the semantic verifier and the atomic swap whole.
 *
 *  **Degradation posture: writings-style, and one step further.** Topics degrades
 *  to catalog pages; vectors degrade to lexical-only search, which is a *fully
 *  working search*. That makes this the most optional artifact in the pipeline,
 *  and the only thing a host owes it is that the absence reach the reader as
 *  §9.6's typed value rather than as a quiet drop in result quality.
 *
 *  The reader side is here too, and deliberately not in a `*-bun.ts` file: the
 *  format parses from an `ArrayBuffer`, so the only host-specific act is
 *  *getting the bytes*, which `VectorIndexBytes` makes a one-method service.
 */

import { Context, Effect, Layer, Option } from 'effect';

import {
  makeFileCorpusArtifact,
  type FileArtifactRecipeService,
  type FileArtifactInstallerService,
} from '../corpus-supply/file-artifact.js';
import { vectorUnavailable, type VectorIndexUnavailable } from './model.js';
import { parseVectorIndex, type VectorIndex } from './vector-index.js';

class VectorsArtifactRecipe extends Context.Service<
  VectorsArtifactRecipe,
  FileArtifactRecipeService
>()('@bible/core/corpus-supply/VectorsArtifactRecipe') {}

class VectorsArtifactInstaller extends Context.Service<
  VectorsArtifactInstaller,
  FileArtifactInstallerService
>()('@bible/core/corpus-supply/VectorsArtifactInstaller') {}

/** The Vectors Artifact: §9.2's flat index as a File Corpus.
 *
 *  Registered under the `vectors` name that `CorpusFileName` now admits, so it
 *  reaches receipts, activations and errors through the same vocabulary every
 *  other corpus does, and `CorpusSupply.ensure({ target: Target.vectors() })`
 *  installs it with no new branch in the pipeline. */
export const VectorsArtifact = makeFileCorpusArtifact({
  corpus: 'vectors',
  label: 'Vectors',
  Recipe: VectorsArtifactRecipe,
  Installer: VectorsArtifactInstaller,
});

// ---------------------------------------------------------------------------
// The read side
// ---------------------------------------------------------------------------

/** How this host gets the installed index's bytes.
 *
 *  One method, because that is the only host-specific part: the parse, the
 *  fingerprint check and the scan are all portable and all live in
 *  `vector-index.ts`.
 *
 *  **`None` is the ordinary answer.** No index installed is the default state of
 *  every client until someone downloads a 246 MB optional artifact, so absence
 *  is returned rather than failed — and a host whose read *fails* (a truncated
 *  file, an unreadable path) also answers `None`, because §9.6 gives the reader
 *  one degradation and a corrupt index is not a better search than no index.
 *  The distinction survives in the log, not in the result.
 */
interface VectorIndexBytesApi {
  readonly read: Effect.Effect<Option.Option<ArrayBuffer>>;
}

export class VectorIndexBytes extends Context.Service<VectorIndexBytes, VectorIndexBytesApi>()(
  '@bible/core/search/VectorIndexBytes',
) {
  /** The layer a host provides when it deliberately ships no index — the web
   *  client before the artifact exists, and every test that is not about the
   *  vector leg. A decision written down, in `WikiSectionSources.NotWired`'s
   *  sense, rather than an omitted dependency. */
  static readonly None: Layer.Layer<VectorIndexBytes> = Layer.succeed(
    VectorIndexBytes,
    VectorIndexBytes.of({
      read: Effect.succeedNone,
    }),
  );

  /** An in-memory index, for tests and for a host that already holds the bytes.
   *  Named `layerOf` rather than `of` because `Context.Service` reserves `of`
   *  for constructing the service value itself. */
  static layerOf = (bytes: ArrayBuffer): Layer.Layer<VectorIndexBytes> =>
    Layer.succeed(VectorIndexBytes, VectorIndexBytes.of({ read: Effect.succeedSome(bytes) }));
}

/** The installed index, or §9.6's reason there is none.
 *
 *  A `Result`-shaped value rather than an `Option`, because the two absences the
 *  search service must tell apart — nothing installed, and something installed
 *  that this build must not read — are the two §10 names separately, and an
 *  `Option.none` collapses them.
 */
export type LoadedVectorIndex =
  | { readonly _tag: 'index'; readonly index: VectorIndex }
  | { readonly _tag: 'unavailable'; readonly absence: VectorIndexUnavailable };

/** The *resolved* index, for a host that has already loaded it.
 *
 *  `VectorIndexBytes` answers "where do this host's index bytes come from";
 *  this answers "which index did this process end up with". They are two
 *  questions, and conflating them is what made the CLI read the artifact twice:
 *  `search-layer.ts` ran `loadVectorIndex` to decide whether the file was one
 *  this build could scan, then handed the *byte source* to `SearchService.Live`,
 *  which read and parsed the same 246 MB file again. A gate that has to re-do
 *  the work it gated is not a gate.
 *
 *  A host that has nothing to hand over provides nothing, and
 *  `SearchService.Live` falls back to reading `VectorIndexBytes` itself, once,
 *  inside the layer.
 */
export class ResolvedVectorIndex extends Context.Service<ResolvedVectorIndex, LoadedVectorIndex>()(
  '@bible/core/search/ResolvedVectorIndex',
) {
  static layerOf = (index: LoadedVectorIndex): Layer.Layer<ResolvedVectorIndex> =>
    Layer.succeed(ResolvedVectorIndex, index);
}

/** Reads and parses the installed index once, mapping every fault onto §9.6.
 *
 *  Never fails and never dies: an optional artifact that is absent, truncated,
 *  or built for another model is a degradation, and the milestone's contract is
 *  that all three arrive at the reader as a typed value. This is the one place
 *  the mapping from a parse fault to a `VectorAbsenceReason` is written, so a
 *  host cannot invent a fourth answer.
 */
export const loadVectorIndex: Effect.Effect<LoadedVectorIndex, never, VectorIndexBytes> =
  Effect.gen(function* () {
    const source = yield* VectorIndexBytes;
    const bytes = yield* source.read;
    if (Option.isNone(bytes)) {
      return { _tag: 'unavailable', absence: vectorUnavailable('absent') };
    }
    const parsed = parseVectorIndex(bytes.value);
    if (parsed._tag === 'ok') return { _tag: 'index', index: parsed.index };
    // §10: "a model-fingerprint mismatch invalidates the vector leg rather than
    // returning wrong neighbors". Its own reason, because the fix is an app
    // update or a rebuilt index rather than an install.
    if (parsed._tag === 'fingerprint') {
      return { _tag: 'unavailable', absence: vectorUnavailable('fingerprint') };
    }
    // A malformed index is `absent` to the reader: there is no usable index, and
    // no action distinguishes it from one that was never installed.
    return { _tag: 'unavailable', absence: vectorUnavailable('absent') };
  });
