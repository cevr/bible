import { Context, Effect, Layer, Option, Predicate } from 'effect';

import { Reference as BibleReference } from '../bible/model.js';
import type { ChapterReference, VerseReference } from '../bible/model.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import { ArchivedBibleReference, ArchivedParagraph, PublicationArchive } from './archive.js';
import {
  WritingsDataIntegrityError,
  type WritingsError,
  WritingsUnavailableError,
} from './errors.js';
import { type PublicationReference } from './model.js';
import { WritingsService } from './service.js';

export interface WritingsArchiveService {
  readonly exportPublication: (
    reference: PublicationReference,
  ) => Effect.Effect<PublicationArchive, WritingsError>;
}

export class WritingsArchive extends Context.Service<WritingsArchive, WritingsArchiveService>()(
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
              Effect.mapError((cause) =>
                WritingsUnavailableError.make({
                  operation: 'export-publication',
                  cause,
                }),
              ),
            );

            return yield* Effect.try({
              try: () =>
                PublicationArchive.make({
                  publication,
                  paragraphs: paragraphs.map((paragraph) => {
                    const refcode =
                      Option.getOrUndefined(paragraph.refcode) ?? paragraph.reference.paragraphId;
                    return ArchivedParagraph.make({
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
                  bibleReferences: bibleReferences.map((row) => {
                    let scripture: ChapterReference | VerseReference = BibleReference.chapter(
                      row.bible_book,
                      row.bible_chapter,
                    );
                    if (Predicate.isNotNull(row.bible_verse)) {
                      scripture = BibleReference.verse(
                        row.bible_book,
                        row.bible_chapter,
                        row.bible_verse,
                      );
                    }
                    return ArchivedBibleReference.make({
                      paragraphRefcode: row.para_ref_code,
                      scripture,
                    });
                  }),
                }),
              catch: (cause) =>
                WritingsDataIntegrityError.make({
                  operation: 'export-publication',
                  cause,
                }),
            });
          });

        return WritingsArchive.of({ exportPublication });
      }),
    );
}
