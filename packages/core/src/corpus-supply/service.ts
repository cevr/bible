import { Context, Effect, Layer } from 'effect';

import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type { PublicationId } from '../writings/model.js';
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
import { WritingsAssetSource, type WritingsAssetSourceShape } from './source.js';

export interface CorpusSupplyShape {
  readonly ensure: (
    input?: CorpusSupplyInput,
  ) => Effect.Effect<CorpusSupplyReceipt, CorpusSupplyError>;
}

const requestedPublications = (
  source: WritingsAssetSourceShape,
  target: WritingsTarget | undefined,
) => {
  if (target?.publications !== undefined) return Effect.succeed(target.publications);
  return source.catalog.pipe(Effect.map((publications) => publications.map((item) => item.id)));
};

const emptyReceipt = (): CorpusSupplyReceipt =>
  new CorpusSupplyReceipt({ activated: [], skipped: [] });

export class CorpusSupply extends Context.Service<CorpusSupply, CorpusSupplyShape>()(
  '@bible/core/corpus-supply/CorpusSupply',
) {
  static layer: Layer.Layer<CorpusSupply, never, WritingsAssetSource | EGWParagraphDatabase> =
    Layer.effect(
      CorpusSupply,
      Effect.gen(function* () {
        const source = yield* WritingsAssetSource;
        const database = yield* EGWParagraphDatabase;

        const ensureWritings = Effect.fn('CorpusSupply.ensureWritings')(function* (
          target: WritingsTarget | undefined,
          refresh: boolean,
        ) {
          const publications = yield* requestedPublications(source, target);
          const activated: CorpusActivation[] = [];
          const skipped: PublicationId[] = [];

          for (const publication of publications) {
            let needsInstall = refresh;
            if (!needsInstall) {
              needsInstall = yield* database.needsSync(publication).pipe(
                Effect.mapError(
                  (cause) =>
                    new CorpusInstallationError({
                      publication,
                      cause,
                    }),
                ),
              );
            }
            if (!needsInstall) {
              skipped.push(publication);
              continue;
            }

            const contribution = yield* source.acquire(publication);
            const installed = yield* database.installPublicationArchive(contribution.archive).pipe(
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

        const ensure: CorpusSupplyShape['ensure'] = (input = {}) => {
          const refresh = input.refresh ?? false;
          const target = input.target;
          if (target?._tag === 'bible') {
            return Effect.fail(new CorpusRecipeUnavailableError({ corpus: 'bible' }));
          }
          if (target === undefined || target._tag === 'bootstrap') {
            return Effect.succeed(emptyReceipt());
          }
          let writingsTarget: WritingsTarget | undefined;
          if (target?._tag === 'writings') writingsTarget = target;
          return ensureWritings(writingsTarget, refresh);
        };

        return CorpusSupply.of({ ensure });
      }),
    );
}
