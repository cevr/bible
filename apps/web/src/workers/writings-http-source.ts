import { EGWBookInfoSchema } from '@bible/api';
import {
  CorpusContributionRejectedError,
  CorpusSourceUnavailableError,
  layerWritingsAssetSource,
  provenanceForArchive,
  WritingsContribution,
} from '@bible/core/corpus-supply';
import {
  Publication,
  PublicationArchiveJson,
  type PublicationId,
  publicationCode,
  publicationId,
} from '@bible/core/writings';
import { Effect, Option, Schema } from 'effect';

const unavailable = (operation: string) => (cause: unknown) =>
  new CorpusSourceUnavailableError({ operation, cause });

export const layerHttpWritingsAssetSource = (fetchResponse: (url: string) => Promise<Response>) => {
  const catalog = Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetchResponse('/api/egw/books'),
      catch: unavailable('read-writings-catalog'),
    });
    if (!response.ok) {
      return yield* new CorpusSourceUnavailableError({
        operation: 'read-writings-catalog',
        cause: response.status,
      });
    }
    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: unavailable('decode-writings-catalog'),
    });
    const books = yield* Schema.decodeUnknownEffect(Schema.Array(EGWBookInfoSchema))(json).pipe(
      Effect.mapError(unavailable('decode-writings-catalog')),
    );
    return yield* Effect.forEach(books, (book) =>
      Effect.try({
        try: () =>
          new Publication({
            id: publicationId(book.bookId),
            code: publicationCode(book.bookCode),
            title: book.title,
            author: book.author,
            paragraphCount: Option.fromNullishOr(book.paragraphCount),
          }),
        catch: unavailable('coerce-writings-catalog'),
      }),
    );
  });

  const acquire = (publication: PublicationId) =>
    Effect.gen(function* () {
      const publications = yield* catalog;
      const requested = publications.find((candidate) => candidate.id === publication);
      if (requested === undefined) {
        return yield* new CorpusContributionRejectedError({
          publication,
          cause: 'Publication is absent from the source catalog',
        });
      }
      const response = yield* Effect.tryPromise({
        try: () => fetchResponse(`/api/egw/${encodeURIComponent(requested.code)}/dump`),
        catch: unavailable('read-writings-publication'),
      });
      if (!response.ok) {
        return yield* new CorpusSourceUnavailableError({
          operation: 'read-writings-publication',
          cause: response.status,
        });
      }
      const json = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: unavailable('decode-writings-publication'),
      });
      const archive = yield* Schema.decodeUnknownEffect(PublicationArchiveJson)(json).pipe(
        Effect.mapError(
          (cause) =>
            new CorpusContributionRejectedError({
              publication,
              cause,
            }),
        ),
      );
      if (archive.publication.id !== publication) {
        return yield* new CorpusContributionRejectedError({
          publication,
          cause: `Received publication ${String(archive.publication.id)}`,
        });
      }
      const provenance = yield* provenanceForArchive(
        'bible-tools-http',
        'publication-archive-v1',
        archive,
      );
      return new WritingsContribution({ provenance, archive });
    });

  return layerWritingsAssetSource({ kind: 'archive', catalog, acquire });
};
