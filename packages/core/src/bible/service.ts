import { Context, Effect, Layer, Option } from 'effect';

import { BibleDatabase } from '../bible-db/bible-database.js';
import type { BibleDatabaseError } from '../bible-db/bible-database.js';
import {
  BibleBookNotFoundError,
  BibleChapterNotFoundError,
  BibleDataIntegrityError,
  type BibleError,
  BibleUnavailableError,
} from './errors.js';
import {
  Book,
  type BookNumber,
  type BookReference,
  Chapter,
  type ChapterReference,
  Reference,
  SearchHit,
  Verse,
  bookNumber,
  chapterNumber,
} from './model.js';

type Operation = BibleUnavailableError['operation'];

const unavailable =
  (operation: Operation) =>
  (cause: BibleDatabaseError): BibleUnavailableError =>
    new BibleUnavailableError({ operation, cause });

const integrity = (operation: Operation, cause: unknown): BibleDataIntegrityError =>
  new BibleDataIntegrityError({ operation, cause });

const makeBook = (row: {
  readonly number: number;
  readonly name: string;
  readonly chapters: number;
  readonly testament: 'old' | 'new';
}): Effect.Effect<Book, BibleDataIntegrityError> =>
  Effect.try({
    try: () =>
      new Book({
        number: bookNumber(row.number),
        name: row.name,
        chapters: chapterNumber(row.chapters),
        testament: row.testament,
      }),
    catch: (cause) => integrity('load-canon', cause),
  });

export interface BibleServiceShape {
  readonly books: Effect.Effect<readonly Book[], BibleError>;
  readonly book: (reference: BookReference) => Effect.Effect<Book, BibleError>;
  readonly chapter: (reference: ChapterReference) => Effect.Effect<Chapter, BibleError>;
  readonly search: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly SearchHit[], BibleError>;
}

export class BibleService extends Context.Service<BibleService, BibleServiceShape>()(
  '@bible/core/bible/BibleService',
) {
  static Live: Layer.Layer<BibleService, BibleError, BibleDatabase> = Layer.effect(
    BibleService,
    Effect.gen(function* () {
      const database = yield* BibleDatabase;
      const canon = yield* database.getBooks().pipe(
        Effect.mapError(unavailable('load-canon')),
        Effect.flatMap((rows) => Effect.all(rows.map(makeBook))),
      );
      const booksByNumber = new Map<BookNumber, Book>(canon.map((book) => [book.number, book]));

      const requireBook = (number: BookNumber): Effect.Effect<Book, BibleBookNotFoundError> =>
        Option.match(Option.fromNullishOr(booksByNumber.get(number)), {
          onNone: () => Effect.fail(new BibleBookNotFoundError({ book: number })),
          onSome: Effect.succeed,
        });

      const book = (reference: BookReference): Effect.Effect<Book, BibleError> =>
        requireBook(reference.book);

      const chapter = (reference: ChapterReference): Effect.Effect<Chapter, BibleError> =>
        Effect.gen(function* () {
          const currentBook = yield* requireBook(reference.book);
          if (reference.chapter > currentBook.chapters) {
            return yield* new BibleChapterNotFoundError({ reference });
          }

          const rows = yield* database
            .getChapter(reference.book, reference.chapter)
            .pipe(Effect.mapError(unavailable('read-chapter')));
          const [firstRow, ...remainingRows] = rows;
          if (!firstRow) return yield* new BibleChapterNotFoundError({ reference });

          const verses = yield* Effect.try({
            try: () => {
              const makeVerse = (row: (typeof rows)[number]) =>
                new Verse({
                  reference: Reference.verse(row.book, row.chapter, row.verse),
                  text: row.text,
                });
              return [makeVerse(firstRow), ...remainingRows.map(makeVerse)] as const;
            },
            catch: (cause) => integrity('read-chapter', cause),
          });

          const previous = (() => {
            if (reference.chapter > 1) {
              return Option.some(Reference.chapter(reference.book, reference.chapter - 1));
            }
            if (reference.book === 1) return Option.none<ChapterReference>();
            return Option.fromNullishOr(booksByNumber.get(bookNumber(reference.book - 1))).pipe(
              Option.map((previousBook) =>
                Reference.chapter(previousBook.number, previousBook.chapters),
              ),
            );
          })();
          const next = (() => {
            if (reference.chapter < currentBook.chapters) {
              return Option.some(Reference.chapter(reference.book, reference.chapter + 1));
            }
            if (reference.book === 66) return Option.none<ChapterReference>();
            return Option.fromNullishOr(booksByNumber.get(bookNumber(reference.book + 1))).pipe(
              Option.map((nextBook) => Reference.chapter(nextBook.number, 1)),
            );
          })();

          return new Chapter({
            book: currentBook,
            reference,
            verses,
            previous,
            next,
          });
        });

      const search = (query: string, limit = 50): Effect.Effect<readonly SearchHit[], BibleError> =>
        database.searchVerses(query, limit).pipe(
          Effect.mapError(unavailable('search')),
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) =>
              Effect.gen(function* () {
                const foundBook = yield* requireBook(bookNumber(row.book));
                return yield* Effect.try({
                  try: () =>
                    new SearchHit({
                      book: foundBook,
                      verse: new Verse({
                        reference: Reference.verse(row.book, row.chapter, row.verse),
                        text: row.text,
                      }),
                    }),
                  catch: (cause) => integrity('search', cause),
                });
              }),
            ),
          ),
        );

      return BibleService.of({ books: Effect.succeed(canon), book, chapter, search });
    }),
  );

  static Test = (config: {
    readonly books: readonly Book[];
    readonly chapters?: ReadonlyMap<string, Chapter>;
    readonly searchHits?: readonly SearchHit[];
  }): Layer.Layer<BibleService> => {
    const booksByNumber = new Map(config.books.map((book) => [book.number, book]));
    return Layer.succeed(
      BibleService,
      BibleService.of({
        books: Effect.succeed(config.books),
        book: (reference) =>
          Option.match(Option.fromNullishOr(booksByNumber.get(reference.book)), {
            onNone: () => Effect.fail(new BibleBookNotFoundError({ book: reference.book })),
            onSome: Effect.succeed,
          }),
        chapter: (reference) =>
          Option.match(
            Option.fromNullishOr(config.chapters?.get(`${reference.book}:${reference.chapter}`)),
            {
              onNone: () => Effect.fail(new BibleChapterNotFoundError({ reference })),
              onSome: Effect.succeed,
            },
          ),
        search: () => Effect.succeed(config.searchHits ?? []),
      }),
    );
  };
}
