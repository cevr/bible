import { Context, Effect, Layer, Option } from 'effect';

import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type { PublicationId } from '../writings/model.js';
import { BibleArtifactInstaller, BibleArtifactRecipe } from './bible-artifact.js';
import {
  CorpusInstallationError,
  CorpusRecipeUnavailableError,
  type CorpusSupplyError,
} from './errors.js';
import {
  CorpusActivation,
  CorpusSupplyReceipt,
  type CorpusSupplyInput,
  type WritingsTarget,
} from './model.js';
import { WritingsAssetRecipe, type WritingsAssetRecipeShape } from './source.js';

export interface CorpusSupplyShape {
  readonly ensure: (
    input?: CorpusSupplyInput,
  ) => Effect.Effect<CorpusSupplyReceipt, CorpusSupplyError>;
}

const requestedPublications = (
  source: WritingsAssetRecipeShape,
  target: WritingsTarget | undefined,
) => {
  if (target?.publications !== undefined) return Effect.succeed(target.publications);
  return source.catalog.pipe(Effect.map((publications) => publications.map((item) => item.id)));
};

export class CorpusSupply extends Context.Service<CorpusSupply, CorpusSupplyShape>()(
  '@bible/core/corpus-supply/CorpusSupply',
) {
  static layer: Layer.Layer<CorpusSupply> = Layer.effect(
    CorpusSupply,
    Effect.gen(function* () {
      const sourceOption = yield* Effect.serviceOption(WritingsAssetRecipe);
      const databaseOption = yield* Effect.serviceOption(EGWParagraphDatabase);
      const bibleRecipeOption = yield* Effect.serviceOption(BibleArtifactRecipe);
      const bibleInstallerOption = yield* Effect.serviceOption(BibleArtifactInstaller);

      const ensureWritings = Effect.fn('CorpusSupply.ensureWritings')(function* (
        target: WritingsTarget | undefined,
        _refresh: boolean,
      ) {
        if (Option.isNone(sourceOption) || Option.isNone(databaseOption)) {
          return yield* new CorpusRecipeUnavailableError({ corpus: 'writings' });
        }
        const source = sourceOption.value;
        const database = databaseOption.value;
        const publications = yield* requestedPublications(source, target);
        const activated: CorpusActivation[] = [];
        const skipped: PublicationId[] = [];

        for (const publication of publications) {
          const contribution = yield* source.acquire(publication);
          const needsInstall = yield* database.needsSync(publication, contribution.provenance).pipe(
            Effect.mapError(
              (cause) =>
                new CorpusInstallationError({
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
              Effect.mapError(
                (cause) =>
                  new CorpusInstallationError({
                    publication,
                    cause,
                  }),
              ),
            );
          activated.push(
            new CorpusActivation({
              corpus: 'writings',
              identity: publication,
              source: contribution.provenance.source,
              revision: contribution.provenance.revision,
              installed,
            }),
          );
        }

        return new CorpusSupplyReceipt({ activated, skipped });
      });

      const ensureBible = Effect.fn('CorpusSupply.ensureBible')(function* (refresh: boolean) {
        if (Option.isNone(bibleRecipeOption) || Option.isNone(bibleInstallerOption)) {
          return yield* new CorpusRecipeUnavailableError({ corpus: 'bible' });
        }
        const recipe = bibleRecipeOption.value;
        const installer = bibleInstallerOption.value;
        const current = yield* installer.current;
        let unavailable: CorpusSupplyError | undefined;

        for (const source of recipe.sources) {
          const acquired = yield* Effect.result(source.acquire);
          if (acquired._tag === 'Failure') {
            unavailable = acquired.failure;
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
            return new CorpusSupplyReceipt({ activated: [], skipped: ['canonical'] });
          }
          const installed = yield* installer.install(artifact);
          return new CorpusSupplyReceipt({
            activated: [
              new CorpusActivation({
                corpus: 'bible',
                identity: 'canonical',
                source: installed.provenance.source,
                revision: installed.provenance.revision,
                installed: installed.installed,
              }),
            ],
            skipped: [],
          });
        }

        if (unavailable !== undefined) return yield* unavailable;
        return yield* new CorpusRecipeUnavailableError({ corpus: 'bible' });
      });

      const ensure: CorpusSupplyShape['ensure'] = (input = {}) => {
        const refresh = input.refresh ?? false;
        const target = input.target;
        if (target === undefined || target._tag === 'bootstrap') {
          return ensureBible(refresh);
        }
        if (target._tag === 'bible') return ensureBible(refresh);
        let writingsTarget: WritingsTarget | undefined;
        if (target._tag === 'writings') writingsTarget = target;
        return ensureWritings(writingsTarget, refresh);
      };

      return CorpusSupply.of({ ensure });
    }),
  );
}
