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
import { EGWParagraphDatabase, type SyncStatus } from '../egw-db/index.js';
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
  /** Author name filter (default: 'Ellen Gould White') */
  authorName?: string;
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

    yield* Effect.log(`Starting sync (language: ${languageCode}, author: ${authorName})`);
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

    /**
     * Check if a book should be synced based on current mode
     */
    const shouldSyncBook = (book: EGWSchemas.Book) =>
      Effect.gen(function* () {
        if (force) return true;

        const status = yield* paragraphDb.getSyncStatus(book.book_id);
        if (Option.isNone(status)) return true; // Never synced

        if (failedOnly) {
          return status.value.status === 'failed';
        }

        // Incremental: skip successful books
        return status.value.status !== 'success';
      });

    /**
     * Process a single book: fetch all chapters, batch insert paragraphs
     */
    const processBook = (book: EGWSchemas.Book) =>
      Effect.gen(function* () {
        const bookNum = yield* Ref.get(totalBooksRef);

        // Check if we should sync this book
        const shouldSync = yield* shouldSyncBook(book);
        if (!shouldSync) {
          yield* Ref.update(booksSkippedRef, (n) => n + 1);
          return;
        }

        yield* Effect.log(`[${bookNum}] Processing: ${book.title} (${book.code})`);

        // Mark as pending
        yield* paragraphDb.setSyncStatus(book.book_id, book.code, 'pending', 0);

        // Get table of contents
        const toc = yield* egwClient.getBookToc(book.book_id).pipe(
          Effect.catch((error) =>
            Effect.gen(function* () {
              const errorMsg = `Failed to get TOC: ${String(error)}`;
              yield* Ref.update(errorCountRef, (n) => n + 1);
              yield* Effect.logError(`[${bookNum}] ${errorMsg}`);
              yield* paragraphDb.setSyncStatus(book.book_id, book.code, 'failed', 0, errorMsg);
              return [] as EGWSchemas.TocItem[];
            }),
          ),
        );

        if (toc.length === 0) {
          yield* Effect.log(`[${bookNum}] Skipping ${book.title}: No chapters`);
          return;
        }

        // Filter valid TOC items and extract chapter IDs
        // The chapter endpoint expects the para number (after the dot in para_id)
        // e.g., para_id "84.68" → chapter ID "68"
        const chapterIds = toc
          .filter(
            (item) =>
              (item.para_id !== undefined && item.para_id !== null) ||
              (item.puborder !== undefined && item.puborder !== null),
          )
          .map((tocItem) => {
            if (tocItem.para_id !== undefined && tocItem.para_id !== null) {
              // Extract the paragraph number after the dot (e.g., "84.68" → "68")
              const match = tocItem.para_id.match(/\.(\d+)$/);
              return match?.[1] ?? String(tocItem.puborder);
            }
            return String(tocItem.puborder);
          });

        // Track chapter errors for this book
        const chapterErrorsRef = yield* Ref.make<string[]>([]);

        // Fetch all chapters in parallel, collect all paragraphs
        const allParagraphs = yield* Stream.fromIterable(chapterIds).pipe(
          Stream.mapEffect(
            (chapterId) =>
              egwClient.getChapterContent(book.book_id, chapterId).pipe(
                Effect.catch((error) =>
                  Effect.gen(function* () {
                    yield* Ref.update(chapterErrorsRef, (errs) => [
                      ...errs,
                      `ch${chapterId}: ${String(error)}`,
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
        if (chapterErrors.length > 0) {
          yield* Ref.update(errorCountRef, (n) => n + chapterErrors.length);
        }

        if (allParagraphs.length === 0) {
          const errorMsg =
            chapterErrors.length > 0
              ? `All chapters failed: ${chapterErrors.slice(0, 3).join('; ')}`
              : 'No paragraphs found';
          yield* Effect.logError(`[${bookNum}] ${errorMsg}`);
          yield* paragraphDb.setSyncStatus(book.book_id, book.code, 'failed', 0, errorMsg);
          return;
        }

        // Batch insert all paragraphs in one transaction
        const insertResult = yield* paragraphDb.storeParagraphsBatch(allParagraphs, book).pipe(
          Effect.map((count) => ({ success: true as const, count })),
          Effect.catch((error) =>
            Effect.succeed({
              success: false as const,
              error: `Batch insert failed: ${error._tag ?? 'Unknown'} - ${String(error.cause ?? error)}`,
            }),
          ),
        );

        if (!insertResult.success) {
          yield* Ref.update(errorCountRef, (n) => n + 1);
          yield* Effect.logError(`[${bookNum}] ${insertResult.error}`);
          yield* paragraphDb.setSyncStatus(
            book.book_id,
            book.code,
            'failed',
            0,
            insertResult.error,
          );
          return;
        }

        yield* Ref.update(storedParagraphsRef, (n) => n + insertResult.count);

        // Extract and batch store Bible references for BC books
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
            const refsInserted = yield* paragraphDb
              .storeBibleRefsBatch(bibleRefs)
              .pipe(Effect.catch(() => Effect.succeed(0)));
            yield* Ref.update(storedBibleRefsRef, (n) => n + refsInserted);
          }
        }

        // Update book paragraph count
        yield* paragraphDb.updateBookCount(book.book_id);

        // Mark as success (with partial errors noted)
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

        yield* Ref.update(booksProcessedRef, (n) => n + 1);
        const completed = yield* Ref.get(booksProcessedRef);
        const skipped = yield* Ref.get(booksSkippedRef);
        const total = yield* Ref.get(totalBooksRef);

        yield* Effect.log(
          `[${bookNum}] Completed ${book.code}: ${allParagraphs.length} paragraphs (${completed} done, ${skipped} skipped / ${total} total)`,
        );
      });

    // Fetch and process all books
    yield* Effect.log('Fetching books from EGW API...');

    yield* egwClient.getBooks({ lang: languageCode }).pipe(
      Stream.filter((book) => book.author === authorName),
      Stream.tap(() => Ref.update(totalBooksRef, (n) => n + 1)),
      Stream.mapEffect(processBook, { concurrency: bookConcurrency }),
      Stream.runDrain,
    );

    // Rebuild FTS5 index
    yield* Effect.log('Rebuilding FTS5 search index...');
    yield* paragraphDb.rebuildFtsIndex();

    // Final statistics
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
