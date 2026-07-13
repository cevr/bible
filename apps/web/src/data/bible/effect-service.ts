import { Effect, Layer, Context, Schema } from 'effect';
import { VerseSchema, type ChapterResponse, type SearchResult, type Verse } from '@bible/api';
import {
  getNextChapter as getNextChapterNav,
  getPrevChapter as getPrevChapterNav,
} from '@bible/core/bible';

import { getBook } from './types';
import { DbClientService, type DatabaseQueryError } from '../db-client-service';

export class BibleDataError extends Schema.TaggedErrorClass<BibleDataError>()('BibleDataError', {
  cause: Schema.Unknown,
  operation: Schema.String,
}) {}

export class BibleBookNotFoundError extends Schema.TaggedErrorClass<BibleBookNotFoundError>()(
  'BibleBookNotFoundError',
  { book: Schema.Number },
) {}

const VerseRow = VerseSchema;
type VerseRow = typeof VerseRow.Type;
const CountedVerseRow = Schema.Struct({ ...VerseSchema.fields, total: Schema.Number });

export interface SearchWithCountResult {
  results: readonly SearchResult[];
  total: number;
}

interface WebBibleServiceShape {
  readonly fetchChapter: (
    book: number,
    chapter: number,
  ) => Effect.Effect<ChapterResponse, BibleDataError | BibleBookNotFoundError>;

  readonly fetchVerses: (
    book: number,
    chapter: number,
  ) => Effect.Effect<readonly Verse[], BibleDataError>;

  readonly searchVerses: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly SearchResult[], BibleDataError>;

  readonly searchVersesWithCount: (
    query: string,
    opts?: { bookFilter?: number[]; offset?: number; limit?: number },
  ) => Effect.Effect<SearchWithCountResult, BibleDataError>;
}

export class WebBibleService extends Context.Service<WebBibleService, WebBibleServiceShape>()(
  '@bible-web/BibleService',
) {
  static Live = Layer.effect(
    WebBibleService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const fetchChapter = Effect.fn('WebBibleService.fetchChapter')(function* (
        book: number,
        chapter: number,
      ) {
        const verses = yield* db.query(
          VerseRow,
          'bible',
          'SELECT book, chapter, verse, text FROM verses WHERE book = ? AND chapter = ? ORDER BY verse',
          [book, chapter],
        );

        const bookInfo = getBook(book);
        if (!bookInfo) {
          return yield* new BibleBookNotFoundError({ book });
        }

        const prev = getPrevChapterNav(book, chapter);
        const next = getNextChapterNav(book, chapter);

        return {
          book: {
            number: bookInfo.number,
            name: bookInfo.name,
            chapters: bookInfo.chapters,
            testament: bookInfo.testament,
          },
          chapter,
          verses: verses.map((v) => ({
            book: v.book,
            chapter: v.chapter,
            verse: v.verse,
            text: v.text,
          })),
          prevChapter: prev ? { book: prev.book, chapter: prev.chapter } : null,
          nextChapter: next ? { book: next.book, chapter: next.chapter } : null,
        } satisfies ChapterResponse;
      });

      const fetchVerses = Effect.fn('WebBibleService.fetchVerses')(function* (
        book: number,
        chapter: number,
      ) {
        return yield* db.query(
          VerseSchema,
          'bible',
          'SELECT book, chapter, verse, text FROM verses WHERE book = ? AND chapter = ? ORDER BY verse',
          [book, chapter],
        );
      });

      const searchVerses = Effect.fn('WebBibleService.searchVerses')(function* (
        query: string,
        limit = 50,
      ) {
        if (!query.trim()) return [] as readonly SearchResult[];

        const rows = yield* db.query(
          VerseRow,
          'bible',
          `SELECT v.book, v.chapter, v.verse, v.text
           FROM verses_fts fts
           JOIN verses v ON v.rowid = fts.rowid
           WHERE verses_fts MATCH ?
           LIMIT ?`,
          [query, limit],
        );

        return rows.map((r) => {
          const bookInfo = getBook(r.book);
          return {
            book: r.book,
            bookName: bookInfo?.name ?? `Book ${r.book}`,
            chapter: r.chapter,
            verse: r.verse,
            text: r.text,
          } satisfies SearchResult;
        });
      });

      const searchVersesWithCount = Effect.fn('WebBibleService.searchVersesWithCount')(function* (
        query: string,
        opts?: { bookFilter?: number[]; offset?: number; limit?: number },
      ) {
        if (!query.trim()) return { results: [] as readonly SearchResult[], total: 0 };

        const limit = opts?.limit ?? 20;
        const offset = opts?.offset ?? 0;
        const bookFilter = opts?.bookFilter;

        let sql: string;
        const params: unknown[] = [query];

        if (bookFilter && bookFilter.length > 0) {
          const placeholders = bookFilter.map(() => '?').join(', ');
          sql = `SELECT COUNT(*) OVER() as total, v.book, v.chapter, v.verse, highlight(verses_fts, 3, '<mark>', '</mark>') as text
                 FROM verses_fts fts
                 JOIN verses v ON v.rowid = fts.rowid
                 WHERE verses_fts MATCH ? AND v.book IN (${placeholders})
                 ORDER BY rank
                 LIMIT ? OFFSET ?`;
          params.push(...bookFilter, limit, offset);
        } else {
          sql = `SELECT COUNT(*) OVER() as total, v.book, v.chapter, v.verse, highlight(verses_fts, 3, '<mark>', '</mark>') as text
                 FROM verses_fts fts
                 JOIN verses v ON v.rowid = fts.rowid
                 WHERE verses_fts MATCH ?
                 ORDER BY rank
                 LIMIT ? OFFSET ?`;
          params.push(limit, offset);
        }

        const rows = yield* db.query(CountedVerseRow, 'bible', sql, params);

        const total = rows[0]?.total ?? 0;
        const results: SearchResult[] = rows.map((r) => {
          const bookInfo = getBook(r.book);
          return {
            book: r.book,
            bookName: bookInfo?.name ?? `Book ${r.book}`,
            chapter: r.chapter,
            verse: r.verse,
            text: r.text,
          };
        });

        return { results, total };
      });

      return WebBibleService.of({
        fetchChapter: (book, chapter) =>
          fetchChapter(book, chapter).pipe(
            Effect.mapError((cause) =>
              cause._tag === 'DatabaseQueryError'
                ? new BibleDataError({ cause, operation: 'fetchChapter' })
                : cause,
            ),
          ),
        fetchVerses: (book, chapter) =>
          fetchVerses(book, chapter).pipe(
            Effect.mapError(
              (cause: DatabaseQueryError) =>
                new BibleDataError({ cause, operation: 'fetchVerses' }),
            ),
          ),
        searchVerses: (query, limit) =>
          searchVerses(query, limit).pipe(
            Effect.mapError(
              (cause: DatabaseQueryError) =>
                new BibleDataError({ cause, operation: 'searchVerses' }),
            ),
          ),
        searchVersesWithCount: (query, options) =>
          searchVersesWithCount(query, options).pipe(
            Effect.mapError(
              (cause: DatabaseQueryError) =>
                new BibleDataError({ cause, operation: 'searchVersesWithCount' }),
            ),
          ),
      });
    }),
  );
}
