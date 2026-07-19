import { Context, Effect, Layer, Option } from 'effect';

import { Reference as BibleReference } from '../bible/model.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import { ArchivedBibleReference, ArchivedParagraph, PublicationArchive } from './archive.js';
import {
  WritingsDataIntegrityError,
  type WritingsError,
  WritingsUnavailableError,
} from './errors.js';
import { type PublicationReference } from './model.js';
import { WritingsService } from './service.js';

export interface WritingsArchiveShape {
  readonly exportPublication: (
    reference: PublicationReference,
  ) => Effect.Effect<PublicationArchive, WritingsError>;
}

export class WritingsArchive extends Context.Service<WritingsArchive, WritingsArchiveShape>()(
  '@bible/core/writings/WritingsArchive',
) {
  static Live: Layer.Layer<WritingsArchive, never, WritingsService | EGWParagraphDatabase> =
    Layer.effect(
      WritingsArchive,
      Effect.gen(function* () {
        const writings = yield* WritingsService;
        const database = yield* EGWParagraphDatabase;

        const exportPublication = (
          reference: PublicationReference,
        ): Effect.Effect<PublicationArchive, WritingsError> =>
          Effect.gen(function* () {
            const publication = yield* writings.publication(reference);
            const paragraphs = yield* writings.paragraphs(reference);
            const bibleReferences = yield* database.getBibleRefsByBook(publication.id).pipe(
              Effect.mapError(
                (cause) =>
                  new WritingsUnavailableError({
                    operation: 'export-publication',
                    cause,
                  }),
              ),
            );

            return yield* Effect.try({
              try: () =>
                new PublicationArchive({
                  publication,
                  paragraphs: paragraphs.map((paragraph) => {
                    const refcode =
                      Option.getOrUndefined(paragraph.refcode) ?? paragraph.reference.paragraphId;
                    return new ArchivedParagraph({
                      refcode,
                      paragraph,
                      isHeading: Option.exists(
                        paragraph.elementType,
                        (type) =>
                          ['chapter', 'title'].includes(type.toLowerCase()) ||
                          type.toLowerCase().startsWith('h'),
                      ),
                    });
                  }),
                  bibleReferences: bibleReferences.map(
                    (row) =>
                      new ArchivedBibleReference({
                        paragraphRefcode: row.para_ref_code,
                        scripture:
                          row.bible_verse === null
                            ? BibleReference.chapter(row.bible_book, row.bible_chapter)
                            : BibleReference.verse(
                                row.bible_book,
                                row.bible_chapter,
                                row.bible_verse,
                              ),
                      }),
                  ),
                }),
              catch: (cause) =>
                new WritingsDataIntegrityError({
                  operation: 'export-publication',
                  cause,
                }),
            });
          });

        return WritingsArchive.of({ exportPublication });
      }),
    );
}
