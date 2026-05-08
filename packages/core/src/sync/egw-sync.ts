/**
 * EGW Sync Service
 *
 * Syncs EGW paragraphs from the API to a local SQLite database.
 * Supports incremental sync, parallel processing, and detailed error tracking.
 *
 * Features:
 * - Incremental sync: skips books that already synced successfully
 * - Batch inserts in transactions (100x faster than individual inserts)
 * - Parallel chapter fetches (configurable concurrency)
 * - Parallel book processing (configurable concurrency)
 * - Detailed error tracking per book
 * - Bible reference extraction for BC books
 */

import { Effect, Option, Ref, Stream } from 'effect';

import { extractBibleReferences } from '../bible-reader/parse.js';
import {
  EGWParagraphDatabase,
  type ParagraphDatabaseError,
  type SyncStatus,
} from '../egw-db/index.js';
import { EGWApiClient } from '../egw/client.js';
import type * as EGWSchemas from '../egw/schemas.js';

/**
 * Sync options
 */
export interface SyncOptions {
  /** Force resync all books, even successful ones */
  force?: boolean;
  /** Only retry failed books */
  failedOnly?: boolean;
  /** Language code (default: 'en') */
  languageCode?: string;
  /** Author name filter (default: 'Ellen Gould White'). Pass null to ingest all authors. */
  authorName?: string | null;
  /** Number of books to process in parallel (default: 3) */
  bookConcurrency?: number;
  /** Number of chapters to fetch in parallel per book (default: 5) */
  chapterConcurrency?: number;
}

/**
 * Sync result statistics
 */
export interface SyncResult {
  totalBooks: number;
  booksProcessed: number;
  booksSkipped: number;
  storedParagraphs: number;
  storedBibleRefs: number;
  errorCount: number;
}

/**
 * Sync status summary
 */
export interface SyncStatusSummary {
  success: number;
  failed: number;
  pending: number;
  totalParagraphs: number;
  failedBooks: readonly { bookCode: string; error: string | null }[];
}

/**
 * Per-book download result. Returned by downloadBookToLocal.
 */
export type DownloadBookResult =
  | { _tag: 'success'; storedParagraphs: number; storedBibleRefs: number; chapterErrors: string[] }
  | { _tag: 'failed'; reason: string; chapterErrors: string[] }
  | { _tag: 'skipped'; reason: string };

// Check if a book code is a Bible Commentary volume
const isBCBook = (bookCode: string): boolean => /^[1-7]BC$/i.test(bookCode);

// Strip HTML tags from content
const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, '');

/**
 * Get sync status summary
 */
export const getSyncStatusSummary = Effect.gen(function* () {
  const db = yield* EGWParagraphDatabase;
  const statuses = yield* db.getAllSyncStatus();

  const success = statuses.filter((s) => s.status === 'success');
  const failed = statuses.filter((s) => s.status === 'failed');
  const pending = statuses.filter((s) => s.status === 'pending');

  return {
    success: success.length,
    failed: failed.length,
    pending: pending.length,
    totalParagraphs: success.reduce((sum, s) => sum + s.paragraph_count, 0),
    failedBooks: failed.map((s) => ({
      bookCode: s.book_code,
      error: s.error_message,
    })),
  } satisfies SyncStatusSummary;
});

/**
 * Download a single book from the EGW API into the local database.
 *
 * Fetches the TOC, all chapters in parallel, batch-inserts paragraphs,
 * extracts Bible refs for BC volumes, updates the book paragraph count,
 * and writes the per-book sync_status row.
 *
 * Caller is responsible for rebuilding the FTS index after one or more
 * downloads complete.
 */
export const downloadBookToLocal = (
  book: EGWSchemas.Book,
  options: { chapterConcurrency?: number } = {},
): Effect.Effect<DownloadBookResult, ParagraphDatabaseError, EGWApiClient | EGWParagraphDatabase> =>
  Effect.gen(function* () {
    const { chapterConcurrency = 5 } = options;
    const paragraphDb = yield* EGWParagraphDatabase;
    const egwClient = yield* EGWApiClient;

    yield* paragraphDb.setSyncStatus(book.book_id, book.code, 'pending', 0);

    // Fetch table of contents
    const tocResult = yield* egwClient.getBookToc(book.book_id).pipe(
      Effect.map((toc) => ({ ok: true as const, toc })),
      Effect.catch((error) =>
        Effect.succeed({ ok: false as const, error: error._tag ?? 'UnknownError' }),
      ),
    );

    if (!tocResult.ok) {
      const reason = `Failed to get TOC: ${tocResult.error}`;
      yield* paragraphDb.setSyncStatus(book.book_id, book.code, 'failed', 0, reason);
      return { _tag: 'failed', reason, chapterErrors: [] } satisfies DownloadBookResult;
    }

    if (tocResult.toc.length === 0) {
      return {
        _tag: 'skipped',
        reason: 'No chapters in TOC',
      } satisfies DownloadBookResult;
    }

    // Extract chapter IDs from TOC entries.
    // The chapter endpoint expects the para number after the dot in para_id
    // (e.g., "84.68" → "68"); falls back to puborder.
    const chapterIds = tocResult.toc
      .filter(
        (item) =>
          (item.para_id !== undefined && item.para_id !== null) ||
          (item.puborder !== undefined && item.puborder !== null),
      )
      .map((tocItem) => {
        if (tocItem.para_id !== undefined && tocItem.para_id !== null) {
          const match = tocItem.para_id.match(/\.(\d+)$/);
          return match?.[1] ?? String(tocItem.puborder);
        }
        return String(tocItem.puborder);
      });

    const chapterErrorsRef = yield* Ref.make<string[]>([]);

    const allParagraphs = yield* Stream.fromIterable(chapterIds).pipe(
      Stream.mapEffect(
        (chapterId) =>
          egwClient.getChapterContent(book.book_id, chapterId).pipe(
            Effect.catch((error) =>
              Effect.gen(function* () {
                yield* Ref.update(chapterErrorsRef, (errs) => [
                  ...errs,
                  `ch${chapterId}: ${error._tag ?? 'UnknownError'}`,
                ]);
                return [] as EGWSchemas.Paragraph[];
              }),
            ),
          ),
        { concurrency: chapterConcurrency },
      ),
      Stream.flatMap((paragraphs) => Stream.fromIterable(paragraphs)),
      Stream.runCollect,
    );

    const chapterErrors = yield* Ref.get(chapterErrorsRef);

    if (allParagraphs.length === 0) {
      const reason =
        chapterErrors.length > 0
          ? `All chapters failed: ${chapterErrors.slice(0, 3).join('; ')}`
          : 'No paragraphs found';
      yield* paragraphDb.setSyncStatus(book.book_id, book.code, 'failed', 0, reason);
      return { _tag: 'failed', reason, chapterErrors } satisfies DownloadBookResult;
    }

    const insertResult = yield* paragraphDb.storeParagraphsBatch(allParagraphs, book).pipe(
      Effect.map((count) => ({ success: true as const, count })),
      Effect.catch((error) =>
        Effect.succeed({
          success: false as const,
          error: `Batch insert failed: ${error._tag ?? 'Unknown'}`,
        }),
      ),
    );

    if (!insertResult.success) {
      yield* paragraphDb.setSyncStatus(book.book_id, book.code, 'failed', 0, insertResult.error);
      return {
        _tag: 'failed',
        reason: insertResult.error,
        chapterErrors,
      } satisfies DownloadBookResult;
    }

    // Extract and batch store Bible references for BC books
    let storedBibleRefs = 0;
    if (isBCBook(book.code)) {
      const bibleRefs: {
        bookId: number;
        refCode: string;
        bibleBook: number;
        bibleChapter: number;
        bibleVerse: number | null;
      }[] = [];

      for (const para of allParagraphs) {
        const refCode =
          para.refcode_short ??
          para.refcode_long ??
          para.para_id ??
          `book-${book.book_id}-para-${para.puborder}`;

        const content = stripHtml(para.content ?? '');
        const refs = extractBibleReferences(content);

        for (const ref of refs) {
          bibleRefs.push({
            bookId: book.book_id,
            refCode,
            bibleBook: ref.ref.book,
            bibleChapter: ref.ref.chapter,
            bibleVerse: ref.ref.verse ?? null,
          });
        }
      }

      if (bibleRefs.length > 0) {
        storedBibleRefs = yield* paragraphDb
          .storeBibleRefsBatch(bibleRefs)
          .pipe(Effect.catch(() => Effect.succeed(0)));
      }
    }

    yield* paragraphDb.updateBookCount(book.book_id);

    const status: SyncStatus = chapterErrors.length > 0 ? 'failed' : 'success';
    const errorMsg =
      chapterErrors.length > 0
        ? `${chapterErrors.length} chapters failed: ${chapterErrors.slice(0, 3).join('; ')}`
        : undefined;

    yield* paragraphDb.setSyncStatus(
      book.book_id,
      book.code,
      status,
      allParagraphs.length,
      errorMsg,
    );

    return {
      _tag: 'success',
      storedParagraphs: insertResult.count,
      storedBibleRefs,
      chapterErrors,
    } satisfies DownloadBookResult;
  });

/**
 * Main sync function
 */
export const syncEgwBooks = (options: SyncOptions = {}) =>
  Effect.gen(function* () {
    const {
      force = false,
      failedOnly = false,
      languageCode = 'en',
      authorName = 'Ellen Gould White',
      bookConcurrency = 3,
      chapterConcurrency = 5,
    } = options;

    const paragraphDb = yield* EGWParagraphDatabase;
    const egwClient = yield* EGWApiClient;

    const authorLabel = authorName === null ? 'all authors' : authorName;
    yield* Effect.log(`Starting sync (language: ${languageCode}, author: ${authorLabel})`);
    yield* Effect.log(
      `Mode: ${force ? 'FORCE (resync all)' : failedOnly ? 'FAILED ONLY' : 'INCREMENTAL'}`,
    );
    yield* Effect.log(`Concurrency: ${bookConcurrency} books, ${chapterConcurrency} chapters`);

    // Statistics
    const totalBooksRef = yield* Ref.make(0);
    const booksProcessedRef = yield* Ref.make(0);
    const booksSkippedRef = yield* Ref.make(0);
    const storedParagraphsRef = yield* Ref.make(0);
    const storedBibleRefsRef = yield* Ref.make(0);
    const errorCountRef = yield* Ref.make(0);

    const shouldSyncBook = (book: EGWSchemas.Book) =>
      Effect.gen(function* () {
        if (force) return true;

        const status = yield* paragraphDb.getSyncStatus(book.book_id);
        if (Option.isNone(status)) return true;

        if (failedOnly) {
          return status.value.status === 'failed';
        }

        return status.value.status !== 'success';
      });

    const processBook = (book: EGWSchemas.Book) =>
      Effect.gen(function* () {
        const bookNum = yield* Ref.get(totalBooksRef);

        const shouldSync = yield* shouldSyncBook(book);
        if (!shouldSync) {
          yield* Ref.update(booksSkippedRef, (n) => n + 1);
          return;
        }

        yield* Effect.log(`[${bookNum}] Processing: ${book.title} (${book.code})`);

        const result = yield* downloadBookToLocal(book, { chapterConcurrency });

        switch (result._tag) {
          case 'skipped':
            yield* Effect.log(`[${bookNum}] Skipping ${book.title}: ${result.reason}`);
            return;
          case 'failed':
            yield* Ref.update(errorCountRef, (n) => n + 1 + result.chapterErrors.length);
            yield* Effect.logError(`[${bookNum}] ${result.reason}`);
            return;
          case 'success': {
            if (result.chapterErrors.length > 0) {
              yield* Ref.update(errorCountRef, (n) => n + result.chapterErrors.length);
            }
            yield* Ref.update(storedParagraphsRef, (n) => n + result.storedParagraphs);
            yield* Ref.update(storedBibleRefsRef, (n) => n + result.storedBibleRefs);
            yield* Ref.update(booksProcessedRef, (n) => n + 1);

            const completed = yield* Ref.get(booksProcessedRef);
            const skipped = yield* Ref.get(booksSkippedRef);
            const total = yield* Ref.get(totalBooksRef);

            yield* Effect.log(
              `[${bookNum}] Completed ${book.code}: ${result.storedParagraphs} paragraphs (${completed} done, ${skipped} skipped / ${total} total)`,
            );
            return;
          }
        }
      });

    yield* Effect.log('Fetching books from EGW API...');

    yield* egwClient.getBooks({ lang: languageCode }).pipe(
      Stream.filter((book) => authorName === null || book.author === authorName),
      Stream.tap(() => Ref.update(totalBooksRef, (n) => n + 1)),
      Stream.mapEffect(processBook, { concurrency: bookConcurrency }),
      Stream.runDrain,
    );

    yield* Effect.log('Rebuilding FTS5 search index...');
    yield* paragraphDb.rebuildFtsIndex();

    const totalBooks = yield* Ref.get(totalBooksRef);
    const booksProcessed = yield* Ref.get(booksProcessedRef);
    const booksSkipped = yield* Ref.get(booksSkippedRef);
    const storedParagraphs = yield* Ref.get(storedParagraphsRef);
    const storedBibleRefs = yield* Ref.get(storedBibleRefsRef);
    const errorCount = yield* Ref.get(errorCountRef);

    yield* Effect.log('');
    yield* Effect.log('=== Sync Complete ===');
    yield* Effect.log(
      `Books: ${booksProcessed} synced, ${booksSkipped} skipped / ${totalBooks} total`,
    );
    yield* Effect.log(`Paragraphs: ${storedParagraphs}`);
    yield* Effect.log(`Bible refs: ${storedBibleRefs}`);
    yield* Effect.log(`Errors: ${errorCount}`);

    if (errorCount > 0) {
      yield* Effect.log('');
      yield* Effect.log('Run with --status to see failed books');
      yield* Effect.log('Run with --failed to retry only failed books');
    }

    return {
      totalBooks,
      booksProcessed,
      booksSkipped,
      storedParagraphs,
      storedBibleRefs,
      errorCount,
    } satisfies SyncResult;
  });
