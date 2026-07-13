/**
 * BibleGroupLive - HTTP API handler implementations for Bible endpoints
 *
 * Delegates to core BibleService for all operations.
 */
import { HttpApiBuilder } from 'effect/unstable/httpapi';
import { Effect, Option } from 'effect';

import { BibleToolsApi, BookNotFoundError, ChapterNotFoundError, DatabaseError } from '@bible/api';
import { Reference, type BibleError, type ChapterReference } from '@bible/core/bible';
import { BibleService } from '@bible/core/bible/service';

/**
 * Map database errors to API DatabaseError
 */
const toDatabaseError = (error: BibleError): DatabaseError =>
  new DatabaseError({
    message:
      error._tag === 'BibleUnavailableError' || error._tag === 'BibleDataIntegrityError'
        ? `Bible ${error.operation} failed`
        : 'Bible data is inconsistent',
  });

const toChapterApiError = (error: BibleError) => {
  switch (error._tag) {
    case 'BibleBookNotFoundError':
      return new BookNotFoundError({
        book: error.book,
        message: `Book ${error.book} not found`,
      });
    case 'BibleChapterNotFoundError':
      return new ChapterNotFoundError({
        book: error.reference.book,
        chapter: error.reference.chapter,
        message: `Chapter ${error.reference.book}:${error.reference.chapter} not found`,
      });
    case 'BibleUnavailableError':
    case 'BibleDataIntegrityError':
      return new DatabaseError({ message: `Bible ${error.operation} failed` });
  }
};

const chapterReference = (book: number, chapter: number) =>
  Effect.try({
    try: () => Reference.chapter(book, chapter),
    catch: () =>
      new ChapterNotFoundError({ book, chapter, message: `Chapter ${book}:${chapter} not found` }),
  });

const wireReference = (reference: Option.Option<ChapterReference>) =>
  Option.match(reference, {
    onNone: () => null,
    onSome: ({ book, chapter }) => ({ book: Number(book), chapter: Number(chapter) }),
  });

export const BibleGroupLive = HttpApiBuilder.group(BibleToolsApi, 'Bible', (handlers) =>
  Effect.gen(function* () {
    const bible = yield* BibleService;

    return handlers
      .handle('books', () => bible.books.pipe(Effect.mapError(toDatabaseError)))
      .handle('chapter', ({ params: { book, chapter } }) =>
        Effect.gen(function* () {
          const reference = yield* chapterReference(book, chapter);
          const chapterData = yield* bible
            .chapter(reference)
            .pipe(Effect.mapError(toChapterApiError));

          return {
            book: chapterData.book,
            chapter: Number(chapterData.reference.chapter),
            verses: chapterData.verses.map((verse) => ({
              book: Number(verse.reference.book),
              chapter: Number(verse.reference.chapter),
              verse: Number(verse.reference.verse),
              text: verse.text,
            })),
            prevChapter: wireReference(chapterData.previous),
            nextChapter: wireReference(chapterData.next),
          };
        }),
      )
      .handle('search', ({ query: { q, limit } }) =>
        bible.search(q, limit).pipe(
          Effect.map((hits) =>
            hits.map(({ book, verse }) => ({
              book: Number(verse.reference.book),
              bookName: book.name,
              chapter: Number(verse.reference.chapter),
              verse: Number(verse.reference.verse),
              text: verse.text,
            })),
          ),
          Effect.mapError(toDatabaseError),
        ),
      );
  }),
);
