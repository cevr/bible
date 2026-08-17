import { Context, Effect, Layer, Option } from 'effect';

import { BibleDatabase } from '../bible-db/bible-database.js';
import type { BibleDatabaseError } from '../bible-db/bible-database.js';
import { BIBLE_BOOKS } from './canon.js';
import {
  BibleBookNotFoundError,
  BibleChapterNotFoundError,
  BibleDataIntegrityError,
  type BibleError,
  BibleUnavailableError,
} from './errors.js';
import {
  type Book,
  type BookNumber,
  type BookReference,
  Chapter,
  ChapterMarginAnchors,
  type ChapterReference,
  Reference,
  SearchHit,
  SearchWindow,
  type SearchWindowOptions,
  Verse,
  VerseMarginAnchor,
  bookNumber,
  verseNumber,
} from './model.js';

type Operation = BibleUnavailableError['operation'];

const unavailable =
  (operation: Operation) =>
  (cause: BibleDatabaseError): BibleUnavailableError =>
    BibleUnavailableError.make({ operation, cause });

const integrity = (operation: Operation, cause: unknown): BibleDataIntegrityError =>
  BibleDataIntegrityError.make({ operation, cause });

export interface BibleServiceApi {
  readonly books: Effect.Effect<readonly Book[]>;
  readonly book: (reference: BookReference) => Effect.Effect<Book, BibleBookNotFoundError>;
  readonly chapter: (reference: ChapterReference) => Effect.Effect<Chapter, BibleError>;
  /** Every margin anchor in one chapter, by verse (§10 M6's margin layer).
   *
   *  Per chapter and not per verse, because the reader draws anchors for the
   *  whole screenful and `StudyService` already owns the per-verse read for the
   *  pane. One query per chapter against `chapterMarginNotes`, which the
   *  database has always exposed and nothing has called. */
  readonly chapterMarginAnchors: (
    reference: ChapterReference,
  ) => Effect.Effect<ChapterMarginAnchors, BibleError>;
  readonly search: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly SearchHit[], BibleError>;
  readonly searchWindow: (
    query: string,
    options?: SearchWindowOptions,
  ) => Effect.Effect<SearchWindow, BibleError>;
}

export class BibleService extends Context.Service<BibleService, BibleServiceApi>()(
  '@bible/core/bible/BibleService',
) {
  static Live: Layer.Layer<BibleService, BibleError, BibleDatabase> = Layer.effect(
    BibleService,
    Effect.gen(function* () {
      const database = yield* BibleDatabase;
      const canon = BIBLE_BOOKS;
      const booksByNumber = new Map<BookNumber, Book>(canon.map((book) => [book.number, book]));

      const requireBook = (number: BookNumber): Effect.Effect<Book, BibleBookNotFoundError> =>
        Option.match(Option.fromNullishOr(booksByNumber.get(number)), {
          onNone: () => Effect.fail(BibleBookNotFoundError.make({ book: number })),
          onSome: Effect.succeed,
        });

      const book = (reference: BookReference): Effect.Effect<Book, BibleBookNotFoundError> =>
        requireBook(reference.book);

      const chapter = (reference: ChapterReference): Effect.Effect<Chapter, BibleError> =>
        Effect.gen(function* () {
          const currentBook = yield* requireBook(reference.book);
          if (reference.chapter > currentBook.chapters) {
            return yield* BibleChapterNotFoundError.make({ reference });
          }

          const rows = yield* database
            .getChapter(reference.book, reference.chapter)
            .pipe(Effect.mapError(unavailable('read-chapter')));
          const [firstRow, ...remainingRows] = rows;
          if (!firstRow) return yield* BibleChapterNotFoundError.make({ reference });

          const verses = yield* Effect.try({
            try: () => {
              const makeVerse = (row: (typeof rows)[number]) =>
                Verse.make({
                  reference: Reference.verse(row.book, row.chapter, row.verse),
                  text: row.text,
                });
              return [makeVerse(firstRow), ...remainingRows.map(makeVerse)] satisfies readonly [
                Verse,
                ...Verse[],
              ];
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

          return Chapter.make({
            book: currentBook,
            reference,
            verses,
            previous,
            next,
          });
        });

      const chapterMarginAnchors = (
        reference: ChapterReference,
      ): Effect.Effect<ChapterMarginAnchors, BibleError> =>
        database.chapterMarginNotes(reference.book, reference.chapter).pipe(
          Effect.mapError(unavailable('read-chapter')),
          Effect.map((byVerse) =>
            ChapterMarginAnchors.make({
              reference,
              verses: [...byVerse.entries()]
                .toSorted(([left], [right]) => left - right)
                .map(([verse, notes]) => ({
                  verse: verseNumber(verse),
                  anchors: notes.map((note) =>
                    VerseMarginAnchor.make({ noteIndex: note.index, phrase: note.phrase }),
                  ),
                })),
            }),
          ),
        );

      const searchWindow = (
        query: string,
        options: SearchWindowOptions = {},
      ): Effect.Effect<SearchWindow, BibleError> =>
        database
          .searchVerseWindow(query, {
            books: options.books,
            offset: options.offset,
            limit: options.limit,
          })
          .pipe(
            Effect.mapError(unavailable('search')),
            Effect.flatMap(({ results, total }) =>
              Effect.forEach(results, (row) =>
                Effect.gen(function* () {
                  const foundBook = yield* requireBook(bookNumber(row.book));
                  return yield* Effect.try({
                    try: () =>
                      SearchHit.make({
                        book: foundBook,
                        verse: Verse.make({
                          reference: Reference.verse(row.book, row.chapter, row.verse),
                          text: row.text,
                        }),
                      }),
                    catch: (cause) => integrity('search', cause),
                  });
                }),
              ).pipe(Effect.map((hits) => SearchWindow.make({ hits, total }))),
            ),
          );

      const search = (query: string, limit = 50): Effect.Effect<readonly SearchHit[], BibleError> =>
        searchWindow(query, { limit }).pipe(Effect.map((window) => window.hits));

      return BibleService.of({
        books: Effect.succeed(canon),
        book,
        chapter,
        chapterMarginAnchors,
        search,
        searchWindow,
      });
    }),
  );

  static Test = (config: {
    readonly books: readonly Book[];
    readonly chapters?: ReadonlyMap<string, Chapter>;
    readonly searchHits?: readonly SearchHit[];
    /** Margin anchors per chapter, keyed `"<book>:<chapter>"` as `chapters` is.
     *  Absent means the chapter has none, which is what most of the canon
     *  actually has. */
    readonly marginAnchors?: ReadonlyMap<string, ChapterMarginAnchors>;
  }): Layer.Layer<BibleService> => {
    const booksByNumber = new Map(config.books.map((book) => [book.number, book]));
    return Layer.succeed(
      BibleService,
      BibleService.of({
        books: Effect.succeed(config.books),
        book: (reference) =>
          Option.match(Option.fromNullishOr(booksByNumber.get(reference.book)), {
            onNone: () => Effect.fail(BibleBookNotFoundError.make({ book: reference.book })),
            onSome: Effect.succeed,
          }),
        chapter: (reference) =>
          Option.match(
            Option.fromNullishOr(config.chapters?.get(`${reference.book}:${reference.chapter}`)),
            {
              onNone: () => Effect.fail(BibleChapterNotFoundError.make({ reference })),
              onSome: Effect.succeed,
            },
          ),
        chapterMarginAnchors: (reference) =>
          Effect.succeed(
            config.marginAnchors?.get(`${reference.book}:${reference.chapter}`) ??
              ChapterMarginAnchors.make({ reference, verses: [] }),
          ),
        search: () => Effect.succeed(config.searchHits ?? []),
        searchWindow: (_query, options = {}) => {
          const hits = config.searchHits ?? [];
          const books = new Set(options.books ?? []);
          let filtered = hits;
          if (books.size !== 0) filtered = hits.filter((hit) => books.has(hit.book.number));
          const offset = Math.max(0, Math.trunc(options.offset ?? 0));
          const limit = Math.max(1, Math.trunc(options.limit ?? 50));
          return Effect.succeed(
            SearchWindow.make({
              hits: filtered.slice(offset, offset + limit),
              total: filtered.length,
            }),
          );
        },
      }),
    );
  };
}
