/**
 * Chapter indexer — bridges the JSON-blob chapter cache to the structured
 * EGW paragraph index (paragraphs + paragraphs_fts).
 *
 * When `cache:putChapter` fires, this module decodes the chapter JSON, looks
 * up the Book metadata from the cached `book_lists`, and calls
 * `EGWParagraphDatabase.storeParagraphsBatch` via the main-process Effect
 * runtime. The index lets the renderer search local content (refcode
 * navigation + FTS5) without hitting the network.
 *
 * Best-effort: any failure (no book metadata cached yet, schema drift, etc.)
 * is logged and swallowed. The chapter cache write itself is not gated on
 * indexing success — search may lag, but reading never breaks.
 */

import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { extractScriptureRefs, Schemas } from '@bible/core/egw';
import type Database from 'better-sqlite3';
import { Effect, Option, Schema } from 'effect';

import type { MainRuntime } from './runtime.js';

const BookListJson = Schema.fromJsonString(Schema.Array(Schemas.Book));
const ChapterJson = Schema.fromJsonString(Schema.Array(Schemas.Paragraph));
const decodeBookList = Schema.decodeUnknownEffect(BookListJson);
const decodeChapter = Schema.decodeUnknownEffect(ChapterJson);

const findBookInCache = (cacheDb: Database.Database, bookId: number): Schemas.Book | null => {
  // `book_lists` stores one row per language; each row's `json` column is the
  // full list response. Scan all rows until we find the book — most users have
  // one language cached so this is O(N=1) of "JSON parse + array find".
  const rows = cacheDb.prepare<[], { json: string }>('SELECT json FROM book_lists').all();
  for (const row of rows) {
    const books = Effect.runSync(decodeBookList(row.json).pipe(Effect.option));
    if (Option.isNone(books)) continue;
    const found = books.value.find((b) => b.book_id === bookId);
    if (found !== undefined) return found;
  }
  return null;
};

/**
 * Decode a chapter JSON blob and write its paragraphs into the EGW index.
 * Returns a Promise that resolves on success or logs+resolves on any failure.
 *
 * `onBibleRefsIndexed`, when provided, is invoked after `storeBibleRefsBatch`
 * succeeds with the distinct `(book, chapter)` keys that just got at least one
 * new ref. The Bible reader uses it to invalidate its per-chapter "verses with
 * commentary" cache so footnote markers appear without a page reload.
 */
export const indexChapter = async (
  runtime: MainRuntime,
  cacheDb: Database.Database,
  bookId: number,
  chapterJson: string,
  onBibleRefsIndexed?: (touched: readonly { book: number; chapter: number }[]) => void,
): Promise<void> => {
  const book = findBookInCache(cacheDb, bookId);
  if (book === null) {
    // No book metadata cached yet (e.g. chapter cache write arrived before the
    // library list response). Skip — the next reopen of LibraryRail will warm
    // book_lists, and we can re-index on the next chapter visit.
    return;
  }

  const decoded = Effect.runSync(decodeChapter(chapterJson).pipe(Effect.option));
  if (Option.isNone(decoded)) {
    console.warn(`[indexer] chapter JSON for book ${String(bookId)} failed schema decode`);
    return;
  }

  const refs = extractScriptureRefs(decoded.value, bookId);

  await runtime
    .runPromise(
      EGWParagraphDatabase.pipe(
        Effect.flatMap((db) =>
          Effect.gen(function* () {
            yield* db.storeParagraphsBatch(decoded.value, book);
            // Bible-ref extraction must run in the same boot path as the
            // paragraph write so cache.sqlite stays consistent. Empty arrays
            // short-circuit inside `storeBibleRefsBatch` — no extra round-trip.
            if (refs.length > 0) yield* db.storeBibleRefsBatch(refs);
          }),
        ),
      ),
    )
    .then(() => {
      if (onBibleRefsIndexed === undefined || refs.length === 0) return;
      const seen = new Set<string>();
      const touched: { book: number; chapter: number }[] = [];
      for (const r of refs) {
        const key = `${String(r.bibleBook)}:${String(r.bibleChapter)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        touched.push({ book: r.bibleBook, chapter: r.bibleChapter });
      }
      onBibleRefsIndexed(touched);
    })
    .catch((err: unknown) => {
      console.warn(`[indexer] storeParagraphsBatch failed for book ${String(bookId)}:`, err);
    });
};
