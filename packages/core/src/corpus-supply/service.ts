import { Context, Effect, Layer, Option } from 'effect';

import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type { PublicationId } from '../writings/model.js';
import { BibleArtifact, type RegisteredFileCorpus, type WiredFileCorpus } from './file-artifact.js';
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
  type CorpusSupplyInput,
  type WritingsTarget,
} from './model.js';
import { WritingsAssetRecipe, type WritingsAssetRecipeService } from './source.js';

export interface CorpusSupplyService {
  readonly ensure: (
    input?: CorpusSupplyInput,
  ) => Effect.Effect<CorpusSupplyReceipt, CorpusSupplyError>;
}

const requestedPublications = (source: WritingsAssetRecipeService, target: WritingsTarget) => {
  const requested = Option.fromNullishOr(target.publications);
  if (Option.isSome(requested)) return Effect.succeed(requested.value);
  return source.catalog.pipe(Effect.map((publications) => publications.map((item) => item.id)));
};

/** Every File Corpus the pipeline knows how to ensure. Total over
 *  `CorpusFileName`, and keyed: the entry filed under `K` must be the artifact
 *  whose own `corpus` is `K`, so a misfiled artifact cannot shadow another
 *  corpus. Adding a file corpus is a compile error here until its
 *  `FileCorpusArtifact` is registered under its own name. */
type FileCorpusRegistry = { readonly [K in CorpusFileName]: RegisteredFileCorpus<K> };

const fileCorpora = {
  bible: BibleArtifact,
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

      return CorpusSupply.of({ ensure });
    }),
  );
}
