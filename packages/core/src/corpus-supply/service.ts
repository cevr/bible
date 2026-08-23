import { Context, Effect, Layer, Option } from 'effect';

import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type { PublicationId } from '../writings/model.js';
import { VectorsArtifact } from '../search/vector-artifact.js';
import {
  BibleArtifact,
  TopicsArtifact,
  type RegisteredFileCorpus,
  type RuntimeArtifactRelease,
  type WiredFileCorpus,
} from './file-artifact.js';
import {
  CorpusInstallationError,
  CorpusRecipeUnavailableError,
  type CorpusSupplyError,
} from './errors.js';
import {
  BootstrapTarget,
  CorpusActivation,
  CorpusFileName,
  CorpusSupplyReceipt,
  type CorpusGeneration,
  type CorpusProvenance,
  type CorpusSupplyInput,
  type WritingsTarget,
} from './model.js';
import { WritingsAssetRecipe, type WritingsAssetRecipeService } from './source.js';

export interface CorpusSupplyService {
  readonly ensure: (
    input?: CorpusSupplyInput,
  ) => Effect.Effect<CorpusSupplyReceipt, CorpusSupplyError>;
  /** The Provenance of the generation this host has already verified and
   *  activated for one File Corpus — **read-only**.
   *
   *  `ensure` cannot answer this question. It is the *install* operation, and
   *  asking it "what do you have?" installs from the first local source when
   *  the answer is "nothing" — which is right for startup and wrong for
   *  §3.6's `bible topics status`, whose whole contract is "no mutation".
   *  Reading the installer's own `current` is the same fact `ensure` consults
   *  before deciding, without the decision.
   *
   *  `None` when nothing is installed, when the corpus is not wired on this
   *  host, or when the active file cannot be read — three ways of saying "this
   *  host has no verified generation", which is one answer to every caller. */
  readonly installed: (corpus: CorpusFileName) => Effect.Effect<Option.Option<CorpusProvenance>>;
  /** The **file** a host must open to read the generation this pipeline
   *  activated for one File Corpus — read-only, and `None` exactly when
   *  `installed` is.
   *
   *  A host cannot assume the destination path it configured. A flat artifact's
   *  activation is one atomic pointer over versioned files (round-4 B2), so the
   *  address the pointer names is the address that holds the verified bytes;
   *  reading the configured path instead could read a retired generation, or a
   *  file that is not there. A SQLite artifact answers with the destination
   *  itself, which is what it always was. */
  readonly activeFile: (corpus: CorpusFileName) => Effect.Effect<Option.Option<string>>;
  /** Installs one File Corpus from a release this host was **handed** — §3.6's
   *  runtime path — through the very installer that verified what is running.
   *
   *  `ensure` cannot do this. It consults the *compiled* source list, so a
   *  client acting on a manifest entry would re-install whatever its pinned
   *  sources already offer and report the version it started with (round-3 F1).
   *  `installFrom` builds the Asset Source from the caller's release through the
   *  recipe's own `releaseSource`, so the bytes take the identical path — same
   *  digest check, same size check, same semantic verifier, same atomic swap —
   *  and the whole of §3.6's "a mismatch leaves the installed generation active"
   *  is inherited rather than restated.
   *
   *  The release's own `generation` is recorded in the installed Provenance,
   *  which is what stops a later startup from re-flooring a newer runtime
   *  artifact with the compiled pin (round-3 F2, round-4 F2). It rides on the
   *  release rather than beside it because it is a fact about *that release
   *  statement*, and a second parameter would be a second chance to omit it. */
  readonly installFrom: (input: {
    readonly corpus: CorpusFileName;
    readonly release: RuntimeArtifactRelease;
  }) => Effect.Effect<CorpusSupplyReceipt, CorpusSupplyError>;
}

const requestedPublications = (source: WritingsAssetRecipeService, target: WritingsTarget) => {
  const requested = Option.fromNullishOr(target.publications);
  if (Option.isSome(requested)) return Effect.succeed(requested.value);
  return source.catalog.pipe(Effect.map((publications) => publications.map((item) => item.id)));
};

/** Whether the generation this host already holds outranks a candidate's.
 *
 *  §3.6 numbers one release per content version, so "newer" is a comparison on
 *  that number and on nothing else. Two states make a candidate outranked:
 *
 *  - it states an ordinal at or below what is installed — the ordinary
 *    rollback and the compiled-pin-behind-runtime case; or
 *  - it states **no** ordinal while the installed generation does. A local
 *    source — a packaged copy, a workspace build — is not a published content
 *    version, so it cannot be newer than one however its tag reads.
 *
 *  `false` whenever the installed provenance has no ordinal: a host that never
 *  installed a published release has no floor to defend, and every candidate
 *  is fair game. That is the fresh machine, and it is also every host that has
 *  only ever installed local bytes. */
const isOutranked = (
  current: Option.Option<CorpusProvenance>,
  candidate: Option.Option<CorpusGeneration>,
): boolean =>
  Option.exists(
    Option.flatMap(current, (active) => active.generation),
    (installed) =>
      Option.match(candidate, {
        onNone: () => true,
        onSome: (offered) => offered <= installed,
      }),
  );

/** Every File Corpus the pipeline knows how to ensure. Total over
 *  `CorpusFileName`, and keyed: the entry filed under `K` must be the artifact
 *  whose own `corpus` is `K`, so a misfiled artifact cannot shadow another
 *  corpus. Adding a file corpus is a compile error here until its
 *  `FileCorpusArtifact` is registered under its own name. */
type FileCorpusRegistry = { readonly [K in CorpusFileName]: RegisteredFileCorpus<K> };

const fileCorpora = {
  bible: BibleArtifact,
  topics: TopicsArtifact,
  // §9.6's optional paragraph vector index. Best-effort like `topics` and one
  // step more so: with no index installed, search still answers — lexically,
  // carrying `VectorIndexUnavailable`.
  vectors: VectorsArtifact,
} satisfies FileCorpusRegistry;

/** Bootstrap is the corpus required before first use. Best-effort corpora are
 *  ensured through their own `file` Target, never here. */
const BOOTSTRAP_CORPUS: CorpusFileName = 'bible';

export class CorpusSupply extends Context.Service<CorpusSupply, CorpusSupplyService>()(
  '@bible/core/corpus-supply/CorpusSupply',
) {
  static layer: Layer.Layer<CorpusSupply> = Layer.effect(
    CorpusSupply,
    Effect.gen(function* () {
      const sourceOption = yield* Effect.serviceOption(WritingsAssetRecipe);
      const databaseOption = yield* Effect.serviceOption(EGWParagraphDatabase);
      const wired = new Map<CorpusFileName, WiredFileCorpus>();
      // Keyed by the vocabulary itself, not by the registry values: `corpus` is
      // the registry key, so a wired entry can only ever land under its own name.
      for (const corpus of CorpusFileName.literals) {
        const entry = yield* fileCorpora[corpus].wired;
        if (Option.isSome(entry)) wired.set(corpus, entry.value);
      }

      const ensureWritings = Effect.fn('CorpusSupply.ensureWritings')(function* (
        target: WritingsTarget,
        _refresh: boolean,
      ) {
        if (Option.isNone(sourceOption) || Option.isNone(databaseOption)) {
          return yield* CorpusRecipeUnavailableError.make({ corpus: 'writings' });
        }
        const source = sourceOption.value;
        const database = databaseOption.value;
        const publications = yield* requestedPublications(source, target);
        const activated: CorpusActivation[] = [];
        const skipped: PublicationId[] = [];

        for (const publication of publications) {
          const contribution = yield* source.acquire(publication);
          const needsInstall = yield* database.needsSync(publication, contribution.provenance).pipe(
            Effect.mapError((cause) =>
              CorpusInstallationError.make({
                publication,
                cause,
              }),
            ),
          );
          if (!needsInstall) {
            skipped.push(publication);
            continue;
          }

          const installed = yield* database
            .installPublicationArchive(contribution.archive, contribution.provenance)
            .pipe(
              Effect.mapError((cause) =>
                CorpusInstallationError.make({
                  publication,
                  cause,
                }),
              ),
            );
          activated.push(
            CorpusActivation.make({
              corpus: 'writings',
              identity: publication,
              source: contribution.provenance.source,
              revision: contribution.provenance.revision,
              installed,
            }),
          );
        }

        return CorpusSupplyReceipt.make({ activated, skipped });
      });

      const ensureFileCorpus = Effect.fn('CorpusSupply.ensureFileCorpus')(function* (
        corpus: CorpusFileName,
        refresh: boolean,
      ) {
        const entry = Option.fromUndefinedOr(wired.get(corpus));
        if (Option.isNone(entry)) {
          return yield* CorpusRecipeUnavailableError.make({ corpus });
        }
        const { recipe, installer } = entry.value;
        const current = yield* installer.current;
        let unavailable = Option.none<CorpusSupplyError>();

        for (const source of recipe.sources) {
          const acquired = yield* Effect.result(source.acquire);
          if (acquired._tag === 'Failure') {
            unavailable = Option.some(acquired.failure);
            continue;
          }
          const artifact = acquired.success;
          const isCurrent = Option.exists(
            current,
            (active) =>
              active.source === artifact.provenance.source &&
              active.revision === artifact.provenance.revision &&
              (Option.isNone(artifact.provenance.digest) ||
                Option.getOrUndefined(active.digest) ===
                  Option.getOrUndefined(artifact.provenance.digest)),
          );
          if (isCurrent && !refresh) {
            return CorpusSupplyReceipt.make({ activated: [], skipped: ['canonical'] });
          }
          // **A startup must never re-floor a newer runtime artifact**
          // (round-4 F2). `ensure` walks the *compiled* source list in priority
          // order, and a packaged copy outranks a release — which is right for
          // a fresh machine and wrong for a host that accepted §3.6's offer
          // last week. Without this, launch N+1 installed the pin over
          // generation 4 and the app silently went back a version.
          //
          // The comparison is on the ordinal, not the tag, for the reason
          // `CorpusGeneration` exists: only a number carries the order.
          // A candidate with **no** ordinal is every local source, so an
          // artifact that came from a published release is never replaced by
          // one that did not — the ordinal is what says "this is a content
          // version", and something that is not one cannot be newer than one.
          if (isOutranked(current, artifact.provenance.generation)) {
            return CorpusSupplyReceipt.make({ activated: [], skipped: ['canonical'] });
          }
          const installed = yield* installer.install(artifact);
          return CorpusSupplyReceipt.make({
            activated: [
              CorpusActivation.make({
                corpus,
                identity: 'canonical',
                source: installed.provenance.source,
                revision: installed.provenance.revision,
                installed: installed.installed,
              }),
            ],
            skipped: [],
          });
        }

        // No source could be acquired. When a verified artifact is already
        // active, that is the spec's stale-fallback state, not a failure: the
        // installed file was digest- and semantically verified before it was
        // ever activated, so an offline host keeps serving it. Reporting an
        // error here made hosts warn about a corpus that was working.
        //
        // Only reachable with an active artifact — with nothing installed there
        // is nothing to fall back to, so Bible's fail-closed startup still
        // fails exactly as before.
        if (Option.isSome(current)) {
          return CorpusSupplyReceipt.make({ activated: [], skipped: ['canonical'] });
        }
        if (Option.isSome(unavailable)) return yield* unavailable.value;
        return yield* CorpusRecipeUnavailableError.make({ corpus });
      });

      // Exhaustive over CorpusTarget: adding a corpus target is a compile
      // error here until the supply pipeline knows how to ensure it.
      const ensure: CorpusSupplyService['ensure'] = (input = {}) => {
        const refresh = input.refresh ?? false;
        const target = input.target ?? BootstrapTarget.make({});
        switch (target._tag) {
          case 'bootstrap':
            return ensureFileCorpus(BOOTSTRAP_CORPUS, refresh);
          case 'file':
            return ensureFileCorpus(target.corpus, refresh);
          case 'writings':
            return ensureWritings(target, refresh);
        }
      };

      /** Read-only: the installer's `current`, with every way of not having
       *  one collapsed to `None`. An installation error here means the active
       *  file could not be read back, which is the same observable state as no
       *  file — and turning it into a failure would make a status query fail
       *  over a corpus the caller was only asking about. */
      const installed: CorpusSupplyService['installed'] = (corpus) =>
        Option.match(Option.fromUndefinedOr(wired.get(corpus)), {
          onNone: () => Effect.succeedNone,
          onSome: (entry) => entry.installer.current.pipe(Effect.catch(() => Effect.succeedNone)),
        });

      /** The same read, one field over. Same collapse of every not-having-one
       *  into `None`, for the same reason: a host asking where its artifact is
       *  must not have to catch a failure to learn that it has none. */
      const activeFile: CorpusSupplyService['activeFile'] = (corpus) =>
        Option.match(Option.fromUndefinedOr(wired.get(corpus)), {
          onNone: () => Effect.succeedNone,
          onSome: (entry) =>
            entry.installer.activeFile.pipe(Effect.catch(() => Effect.succeedNone)),
        });

      /** §3.6's runtime install, over one release the caller names.
       *
       *  The recipe's `releaseSource` is what builds the Asset Source, so the
       *  candidate travels the same leg a pinned release travels — and a host
       *  that offers no runtime install path says so as `None` rather than by
       *  quietly installing from its compiled sources instead.
       *
       *  The generation is stamped onto the Provenance the installer records,
       *  which is the fact `decideUpdate` reads back on the next startup. */
      const installFrom: CorpusSupplyService['installFrom'] = (request) =>
        Effect.gen(function* () {
          const entry = Option.fromUndefinedOr(wired.get(request.corpus));
          if (Option.isNone(entry)) {
            return yield* CorpusRecipeUnavailableError.make({ corpus: request.corpus });
          }
          const { recipe, installer } = entry.value;
          if (Option.isNone(recipe.releaseSource)) {
            return yield* CorpusRecipeUnavailableError.make({ corpus: request.corpus });
          }
          // The ordinal travels *on the release*, so the candidate reaches the
          // installer already carrying it — the same way a pinned release does.
          // Re-stamping the provenance here instead meant the runtime leg and
          // the pinned leg recorded the generation by two different mechanisms,
          // and only one of them existed (round-4 F2).
          const source = recipe.releaseSource.value(request.release);
          const artifact = yield* source.acquire;
          const installed = yield* installer.install(artifact);
          return CorpusSupplyReceipt.make({
            activated: [
              CorpusActivation.make({
                corpus: request.corpus,
                identity: 'canonical',
                source: installed.provenance.source,
                revision: installed.provenance.revision,
                installed: installed.installed,
              }),
            ],
            skipped: [],
          });
        });

      return CorpusSupply.of({ ensure, installed, activeFile, installFrom });
    }),
  );
}
