import { BIBLE_BOOK_ALIASES, getBibleBook } from '@bible/core/bible';
import { Context, Effect, Layer, Schema } from 'effect';

import { DbClientService, type DatabaseQueryError } from '../db-client-service';
import type { EGWCommentaryEntry, EGWContextParagraph } from './types';

export class CommentaryDataError extends Schema.TaggedErrorClass<CommentaryDataError>()(
  'CommentaryDataError',
  {
    cause: Schema.Unknown,
    operation: Schema.String,
  },
) {}

const EGWCommentaryRow = Schema.Struct({
  refcode_short: Schema.String,
  book_code: Schema.String,
  book_title: Schema.String,
  content_text: Schema.String,
  puborder: Schema.Number,
});

const EGWContextRow = Schema.Struct({
  refcode_short: Schema.String,
  book_code: Schema.String,
  content_text: Schema.String,
  puborder: Schema.Number,
});

const EGWChapterIndexRow = Schema.Struct({
  chapter_index: Schema.Number,
});

interface CommentaryServiceShape {
  readonly getEgwCommentary: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<EGWCommentaryEntry[], CommentaryDataError>;
  readonly getEgwChapterIndex: (
    bookCode: string,
    puborder: number,
  ) => Effect.Effect<number, CommentaryDataError>;
  readonly getEgwParagraphContext: (
    bookCode: string,
    puborder: number,
    radius: number,
  ) => Effect.Effect<EGWContextParagraph[], CommentaryDataError>;
}

export class CommentaryService extends Context.Service<CommentaryService, CommentaryServiceShape>()(
  '@bible/web/commentary/CommentaryService',
) {
  static layer = Layer.effect(
    CommentaryService,
    Effect.gen(function* () {
      const db = yield* DbClientService;

      const getEgwCommentary = Effect.fn('CommentaryService.getEgwCommentary')(function* (
        book: number,
        chapter: number,
        verse: number,
      ) {
        // Phase 1: Indexed results from paragraph_bible_refs
        const indexedRows = yield* db.query(
          EGWCommentaryRow,
          'egw',
          `SELECT p.refcode_short, p.content_text, p.puborder, b.book_code, b.book_title
           FROM paragraphs p
           JOIN paragraph_bible_refs pbr ON p.book_id = pbr.para_book_id AND p.ref_code = pbr.para_ref_code
           JOIN books b ON p.book_id = b.book_id
           WHERE pbr.bible_book = ? AND pbr.bible_chapter = ? AND pbr.bible_verse = ?
           ORDER BY b.book_code, p.puborder`,
          [book, chapter, verse],
        );

        const indexed: EGWCommentaryEntry[] = indexedRows.map((r) => ({
          refcode: r.refcode_short,
          bookCode: r.book_code,
          bookTitle: r.book_title,
          content: r.content_text,
          puborder: r.puborder,
          source: 'indexed' as const,
        }));

        // Phase 2: FTS5 search for verse mentions in paragraph text
        const bookInfo = getBibleBook(book);
        if (!bookInfo) return indexed;

        // Build FTS5 query from book aliases: "ephesians 4 15" OR "eph 4 15"
        const seen = new Set<string>();
        const ftsTerms: string[] = [];
        for (const [alias, num] of Object.entries(BIBLE_BOOK_ALIASES)) {
          if (num === book && !seen.has(alias)) {
            seen.add(alias);
            // FTS5 phrase: "bookname chapter verse"
            ftsTerms.push(`"${alias} ${chapter} ${verse}"`);
          }
        }
        // Always include canonical name
        const canonical = bookInfo.name.toLowerCase();
        if (!seen.has(canonical)) {
          ftsTerms.push(`"${canonical} ${chapter} ${verse}"`);
        }

        const ftsQuery = ftsTerms.join(' OR ');

        const searchRows = yield* db.query(
          EGWCommentaryRow,
          'egw',
          `SELECT p.refcode_short, p.content_text, p.puborder, b.book_code, b.book_title
           FROM paragraphs p
           JOIN paragraphs_fts fts ON p.rowid = fts.rowid
           JOIN books b ON p.book_id = b.book_id
           WHERE paragraphs_fts MATCH ?
           ORDER BY b.book_code, p.puborder
           LIMIT 50`,
          [ftsQuery],
        );

        // Deduplicate: exclude results already in indexed set
        const indexedKeys = new Set(indexed.map((r) => `${r.bookCode}:${r.puborder}`));
        const searchResults: EGWCommentaryEntry[] = [];
        for (const r of searchRows) {
          const key = `${r.book_code}:${r.puborder}`;
          if (!indexedKeys.has(key)) {
            searchResults.push({
              refcode: r.refcode_short,
              bookCode: r.book_code,
              bookTitle: r.book_title,
              content: r.content_text,
              puborder: r.puborder,
              source: 'search' as const,
            });
          }
        }

        return [...indexed, ...searchResults];
      });

      const getEgwChapterIndex = Effect.fn('CommentaryService.getEgwChapterIndex')(function* (
        bookCode: string,
        puborder: number,
      ) {
        const rows = yield* db.query(
          EGWChapterIndexRow,
          'egw',
          `SELECT COUNT(*) - 1 as chapter_index
           FROM paragraphs p
           JOIN books b ON p.book_id = b.book_id
           WHERE b.book_code = ? AND p.is_chapter_heading = 1 AND p.puborder <= ?`,
          [bookCode, puborder],
        );
        return rows[0]?.chapter_index ?? 0;
      });

      const getEgwParagraphContext = Effect.fn('CommentaryService.getEgwParagraphContext')(
        function* (bookCode: string, puborder: number, radius: number) {
          const rows = yield* db.query(
            EGWContextRow,
            'egw',
            `SELECT p.refcode_short, p.content_text, p.puborder, b.book_code
             FROM paragraphs p
             JOIN books b ON p.book_id = b.book_id
             WHERE b.book_code = ? AND p.puborder BETWEEN ? AND ?
             ORDER BY p.puborder`,
            [bookCode, puborder - radius, puborder + radius],
          );
          return rows.map(
            (r): EGWContextParagraph => ({
              refcode: r.refcode_short,
              bookCode: r.book_code,
              content: r.content_text,
              puborder: r.puborder,
            }),
          );
        },
      );

      const mapDataError = <A>(operation: string, effect: Effect.Effect<A, DatabaseQueryError>) =>
        effect.pipe(Effect.mapError((cause) => new CommentaryDataError({ cause, operation })));

      return CommentaryService.of({
        getEgwCommentary: (book, chapter, verse) =>
          mapDataError('getEgwCommentary', getEgwCommentary(book, chapter, verse)),
        getEgwChapterIndex: (bookCode, puborder) =>
          mapDataError('getEgwChapterIndex', getEgwChapterIndex(bookCode, puborder)),
        getEgwParagraphContext: (bookCode, puborder, radius) =>
          mapDataError(
            'getEgwParagraphContext',
            getEgwParagraphContext(bookCode, puborder, radius),
          ),
      });
    }),
  );
}
