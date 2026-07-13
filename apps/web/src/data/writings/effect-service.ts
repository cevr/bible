import { EGWBookInfoSchema, EGWChapterSchema, type EGWBookInfo, type EGWChapter } from '@bible/api';
import { Node } from '@bible/core/egw';
import { Context, Effect, Layer, Option, Schema } from 'effect';

import { DbClientService, type DatabaseQueryError } from '../db-client-service';
import type { EgwBooksResult, EgwChapterContent } from './types';

export class WritingsDataError extends Schema.TaggedErrorClass<WritingsDataError>()(
  'WritingsDataError',
  {
    cause: Schema.Unknown,
    operation: Schema.String,
  },
) {}

export class WritingsRequestError extends Schema.TaggedErrorClass<WritingsRequestError>()(
  'WritingsRequestError',
  {
    operation: Schema.String,
    cause: Schema.Unknown,
  },
) {}

export class WritingsContentNotFound extends Schema.TaggedErrorClass<WritingsContentNotFound>()(
  'WritingsContentNotFound',
  {
    bookCode: Schema.String,
    chapterIndex: Schema.Number,
  },
) {}

const LocalEgwBookRow = Schema.Struct({
  book_id: Schema.Number,
  book_code: Schema.String,
  book_title: Schema.String,
  book_author: Schema.String,
  paragraph_count: Schema.Number,
});

const EgwChapterBoundaryRow = Schema.Struct({
  puborder: Schema.Number,
  content_text: Schema.String,
});

const EgwParagraphRow = Schema.Struct({
  para_id: Schema.NullOr(Schema.String),
  refcode_short: Schema.NullOr(Schema.String),
  nodes_json: Schema.String,
  puborder: Schema.Number,
  element_type: Schema.NullOr(Schema.String),
});

const LocalEgwBookIdRow = Schema.Struct({ book_id: Schema.Number });

const EgwChapterRow = Schema.Struct({
  content_text: Schema.NullOr(Schema.String),
  refcode_short: Schema.NullOr(Schema.String),
  puborder: Schema.Number,
  page_number: Schema.NullOr(Schema.Number),
});

const decodeNodes = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Node)));

const fetchJson = <A>(schema: Schema.Decoder<A>, url: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url);
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`EGW API ${response.status}: ${body || response.statusText}`);
      }
      return response.json() as Promise<unknown>;
    },
    catch: (cause) => new WritingsRequestError({ operation: `GET ${url}`, cause }),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError(
      (cause) =>
        new WritingsRequestError({
          operation: `decode GET ${url}`,
          cause,
        }),
    ),
  );

interface WritingsServiceShape {
  readonly fetchEgwBooks: () => Effect.Effect<EgwBooksResult>;
  readonly fetchEgwChapterContent: (
    bookCode: string,
    chapterIndex: number,
  ) => Effect.Effect<EgwChapterContent, WritingsDataError | WritingsContentNotFound>;
  readonly fetchEgwChapters: (
    bookCode: string,
  ) => Effect.Effect<readonly EGWChapter[], WritingsDataError>;
}

export class WritingsService extends Context.Service<WritingsService, WritingsServiceShape>()(
  '@bible/web/writings/WritingsService',
) {
  static layer = Layer.effect(
    WritingsService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const localBooks = db
        .query(LocalEgwBookRow, 'egw', 'SELECT * FROM books ORDER BY book_code')
        .pipe(Effect.catch(() => Effect.succeed([])));

      const remoteBooks = fetchJson(Schema.Array(EGWBookInfoSchema), '/api/egw/books').pipe(
        Effect.catch(() => Effect.succeed([])),
      );

      const fetchEgwBooks = Effect.fn('WritingsService.fetchEgwBooks')(function* () {
        const rows = yield* localBooks;
        if (rows.length > 0) {
          return {
            source: 'local',
            books: rows.map(
              (row): EGWBookInfo => ({
                bookId: row.book_id,
                bookCode: row.book_code,
                title: row.book_title,
                author: row.book_author,
                paragraphCount: row.paragraph_count,
              }),
            ),
          } satisfies EgwBooksResult;
        }

        const books = yield* remoteBooks;
        return books.length > 0
          ? ({ source: 'server', books } satisfies EgwBooksResult)
          : ({ source: 'empty', books: [] } satisfies EgwBooksResult);
      });

      const fetchEgwChapterContent = Effect.fn('WritingsService.fetchEgwChapterContent')(function* (
        bookCode: string,
        chapterIndex: number,
      ) {
        const [book] = yield* db.query(
          LocalEgwBookRow,
          'egw',
          'SELECT * FROM books WHERE book_code = ? LIMIT 1',
          [bookCode],
        );
        if (!book) {
          return yield* new WritingsContentNotFound({ bookCode, chapterIndex });
        }

        const headings = yield* db.query(
          EgwChapterBoundaryRow,
          'egw',
          'SELECT puborder, content_text FROM paragraphs WHERE book_id = ? AND is_chapter_heading = 1 ORDER BY puborder',
          [book.book_id],
        );
        const startHeading = headings[chapterIndex];
        if (!startHeading) {
          return yield* new WritingsContentNotFound({ bookCode, chapterIndex });
        }

        const nextHeading = headings[chapterIndex + 1];
        const whereClause = nextHeading
          ? 'book_id = ? AND puborder >= ? AND puborder < ?'
          : 'book_id = ? AND puborder >= ?';
        const params = nextHeading
          ? [book.book_id, startHeading.puborder, nextHeading.puborder]
          : [book.book_id, startHeading.puborder];

        const rows = yield* db.query(
          EgwParagraphRow,
          'egw',
          `SELECT para_id, refcode_short, nodes_json, puborder, element_type FROM paragraphs WHERE ${whereClause} ORDER BY puborder`,
          params,
        );

        return {
          book: {
            bookId: book.book_id,
            bookCode: book.book_code,
            title: book.book_title,
            author: book.book_author,
            paragraphCount: book.paragraph_count,
          },
          chapterIndex,
          totalChapters: headings.length,
          title: startHeading.content_text,
          paragraphs: rows.map((row) => ({
            paraId: row.para_id,
            refcodeShort: row.refcode_short,
            nodes: Option.getOrElse(decodeNodes(row.nodes_json), () => []),
            puborder: row.puborder,
            elementType: row.element_type,
          })),
        } satisfies EgwChapterContent;
      });

      const fetchEgwChapters = Effect.fn('WritingsService.fetchEgwChapters')(function* (
        bookCode: string,
      ) {
        const [book] = yield* db.query(
          LocalEgwBookIdRow,
          'egw',
          'SELECT book_id FROM books WHERE book_code = ? LIMIT 1',
          [bookCode],
        );
        if (book) {
          const rows = yield* db.query(
            EgwChapterRow,
            'egw',
            'SELECT content_text, refcode_short, puborder, page_number FROM paragraphs WHERE book_id = ? AND is_chapter_heading = 1 ORDER BY puborder',
            [book.book_id],
          );
          if (rows.length > 0) {
            return rows.map(
              (row): EGWChapter => ({
                title: row.content_text,
                refcodeShort: row.refcode_short,
                puborder: row.puborder,
                page: row.page_number,
              }),
            );
          }
        }

        return yield* fetchJson(
          Schema.Array(EGWChapterSchema),
          `/api/egw/${encodeURIComponent(bookCode)}/chapters`,
        ).pipe(Effect.catch(() => Effect.succeed([])));
      });

      const mapDataError = <A>(operation: string, effect: Effect.Effect<A, DatabaseQueryError>) =>
        effect.pipe(Effect.mapError((cause) => new WritingsDataError({ cause, operation })));

      return WritingsService.of({
        fetchEgwBooks,
        fetchEgwChapterContent: (bookCode, chapterIndex) =>
          fetchEgwChapterContent(bookCode, chapterIndex).pipe(
            Effect.mapError((cause) =>
              cause._tag === 'DatabaseQueryError'
                ? new WritingsDataError({ cause, operation: 'fetchEgwChapterContent' })
                : cause,
            ),
          ),
        fetchEgwChapters: (bookCode) =>
          mapDataError('fetchEgwChapters', fetchEgwChapters(bookCode)),
      });
    }),
  );
}
