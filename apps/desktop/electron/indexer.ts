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
 * Both the cache reads (book_lists, chapters) and the index writes (paragraphs)
 * run through the same `SqlClient` connection — see electron/cache-db.ts — so
 * indexing never contends with the cache for the WAL file.
 *
 * Best-effort: any failure (no book metadata cached yet, schema drift, etc.)
 * is logged and swallowed. The chapter cache write itself is not gated on
 * indexing success — search may lag, but reading never breaks.
 */

import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { extractScriptureRefs, Schemas } from '@bible/core/egw';
import { Effect, Option, Schema } from 'effect';

import { CacheDatabase } from './cache-db.js';
import type { MainRuntime } from './runtime.js';

const BookListJson = Schema.fromJsonString(Schema.Array(Schemas.Book));
const ChapterJson = Schema.fromJsonString(Schema.Array(Schemas.Paragraph));
const decodeBookList = Schema.decodeUnknownEffect(BookListJson);
const decodeChapter = Schema.decodeUnknownEffect(ChapterJson);

const findBookInLists = (bookListJson: readonly string[], bookId: number): Schemas.Book | null => {
  // Each `book_lists` row's JSON is the full list response for a language. Scan
  // all rows until we find the book — most users have one language cached so
  // this is O(N=1) of "JSON parse + array find".
  for (const json of bookListJson) {
    const books = Effect.runSync(decodeBookList(json).pipe(Effect.option));
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
  bookId: number,
  chapterJson: string,
  onBibleRefsIndexed?: (touched: readonly { book: number; chapter: number }[]) => void,
): Promise<void> => {
  const decoded = Effect.runSync(decodeChapter(chapterJson).pipe(Effect.option));
  if (Option.isNone(decoded)) {
    console.warn(`[indexer] chapter JSON for book ${String(bookId)} failed schema decode`);
    return;
  }

  const refs = extractScriptureRefs(decoded.value, bookId);

  await runtime
    .runPromise(
      Effect.gen(function* () {
        const cache = yield* CacheDatabase;
        const bookListJson = yield* cache.allBookListJson();
        const book = findBookInLists(bookListJson, bookId);
        if (book === null) {
          // No book metadata cached yet (e.g. chapter cache write arrived before
          // the library list response). Skip — the next reopen of the library
          // warms book_lists, and we re-index on the next chapter visit.
          return false;
        }
        const db = yield* EGWParagraphDatabase;
        yield* db.storeParagraphsBatch(decoded.value, book);
        // Bible-ref extraction must run in the same boot path as the paragraph
        // write so cache.sqlite stays consistent. Empty arrays short-circuit
        // inside `storeBibleRefsBatch` — no extra round-trip.
        if (refs.length > 0) yield* db.storeBibleRefsBatch(refs);
        return true;
      }),
    )
    .then((stored) => {
      if (!stored || onBibleRefsIndexed === undefined || refs.length === 0) return;
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

/**
 * Backfill paragraphs/FTS from chapter JSON blobs that were cached before the
 * indexer existed (or before its boot path ran). On every app start we scan
 * `chapters` and re-run `indexChapter` for any book that has cached chapters
 * but zero paragraph rows. Cheap: ~100ms per book worth of chapters; runs in
 * the background once at startup so search just starts working for old caches.
 */
export const backfillIndex = async (runtime: MainRuntime): Promise<void> => {
  const bookIds = await runtime.runPromise(
    CacheDatabase.pipe(Effect.flatMap((cache) => cache.booksNeedingIndex())),
  );
  if (bookIds.length === 0) return;
  console.error(`[indexer] backfill: ${String(bookIds.length)} book(s) need indexing`);
  for (const bookId of bookIds) {
    // eslint-disable-next-line no-await-in-loop
    const chapters = await runtime.runPromise(
      CacheDatabase.pipe(Effect.flatMap((cache) => cache.chapterJsonForBook(bookId))),
    );
    for (const json of chapters) {
      // Sequential on purpose: each indexChapter is a SQLite transaction; we
      // don't want N hundred in flight at once on app start. The backfill is
      // a one-time cold-cache pass, so wall-time isn't critical.
      // eslint-disable-next-line no-await-in-loop
      await indexChapter(runtime, bookId, json);
    }
  }
  console.error('[indexer] backfill complete');
};
