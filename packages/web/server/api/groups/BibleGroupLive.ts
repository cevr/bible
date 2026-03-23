/**
 * BibleGroupLive - HTTP API handler implementations for Bible endpoints
 *
 * Delegates to core BibleService for all operations.
 */
import { HttpApiBuilder } from 'effect/unstable/httpapi';
import { Effect, Option } from 'effect';

import { BibleToolsApi, BookNotFoundError, ChapterNotFoundError, DatabaseError } from '@bible/api';
import { BibleService } from '@bible/core/bible-service';

/**
 * Map database errors to API DatabaseError
 */
const mapDbError = Effect.mapError(
  (e: unknown) =>
    new DatabaseError({
      message: e instanceof Error ? e.message : 'Database error',
    }),
);

export const BibleGroupLive = HttpApiBuilder.group(BibleToolsApi, 'Bible', (handlers) =>
  Effect.gen(function* () {
    const bible = yield* BibleService;

    return handlers
      .handle('books', () => bible.getBooks().pipe(mapDbError))
      .handle('chapter', ({ params: { book, chapter } }) =>
        Effect.gen(function* () {
          // Get book info
          const bookInfo = yield* bible.getBook(book).pipe(mapDbError);
          if (Option.isNone(bookInfo)) {
            return yield* Effect.fail(
              new BookNotFoundError({
                book,
                message: `Book ${book} not found`,
              }),
            );
          }

          // Get chapter with navigation
          const chapterData = yield* bible.getChapter(book, chapter).pipe(mapDbError);

          if (chapterData.verses.length === 0) {
            return yield* Effect.fail(
              new ChapterNotFoundError({
                book,
                chapter,
                message: `Chapter ${book}:${chapter} not found`,
              }),
            );
          }

          return {
            book: chapterData.book,
            chapter: chapterData.chapter,
            verses: chapterData.verses,
            prevChapter: chapterData.prevChapter,
            nextChapter: chapterData.nextChapter,
          };
        }),
      )
      .handle('search', ({ query: { q, limit } }) => bible.search(q, limit).pipe(mapDbError));
  }),
);
