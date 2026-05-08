/**
 * EGW Upload Status Service using SQLite
 *
 * This service tracks the upload status of EGW paragraphs (by ref_code) to Gemini File Search stores
 * using a SQLite database for persistent, thread-safe status tracking.
 * Tracks individual paragraphs, assuming one paragraph is uploaded at a time.
 */

import type { PlatformError } from 'effect/PlatformError';
import { Database } from 'bun:sqlite';
import { Config, Context, Effect, FileSystem, Layer, Option, Path } from 'effect';

import {
  DatabaseConnectionError,
  DatabaseQueryError,
  RecordNotFoundError,
  SchemaInitializationError,
} from '../errors/index.js';

// Re-export errors for backwards compatibility
export {
  DatabaseConnectionError,
  DatabaseQueryError,
  SchemaInitializationError,
} from '../errors/index.js';

/**
 * Paragraph upload not found error (domain-specific alias)
 */
export const ParagraphUploadNotFoundError = RecordNotFoundError;
export type ParagraphUploadNotFoundError = RecordNotFoundError;

/**
 * Union type for all upload status errors
 */
export type UploadStatusError =
  | DatabaseConnectionError
  | DatabaseQueryError
  | RecordNotFoundError
  | SchemaInitializationError;

/**
 * Paragraph Upload Status
 */
export interface ParagraphUploadStatus {
  readonly status: 'in-progress' | 'complete' | 'failed';
  readonly refCode: string;
  readonly bookId: number;
  readonly uploadedAt?: string;
  readonly error?: string;
}

/**
 * Book Upload Status (aggregated from paragraph statuses)
 */
export interface BookUploadStatus {
  readonly status: 'in-progress' | 'complete' | 'failed';
  readonly documentsUploaded: number;
  readonly expectedDocuments: number;
  readonly uploadedAt?: string;
  readonly error?: string;
}

/**
 * Upload Status Map (for backward compatibility with JSON format)
 */
export interface UploadStatusMap {
  readonly [storeDisplayName: string]: {
    readonly [bookId: string]: BookUploadStatus;
  };
}

/**
 * Database row type
 */
interface ParagraphUploadRow {
  store_display_name: string;
  ref_code: string;
  book_id: number;
  status: string;
  uploaded_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * EGW Upload Status service interface.
 * Tracks upload status of EGW paragraphs to Gemini File Search stores.
 */
export interface EGWUploadStatusService {
  readonly markParagraphInProgress: (
    storeDisplayName: string,
    refCode: string,
    bookId: number,
  ) => Effect.Effect<void, UploadStatusError>;
  readonly markParagraphComplete: (
    storeDisplayName: string,
    refCode: string,
    bookId: number,
  ) => Effect.Effect<void, UploadStatusError>;
  readonly markParagraphFailed: (
    storeDisplayName: string,
    refCode: string,
    bookId: number,
    error: string,
  ) => Effect.Effect<void, UploadStatusError>;
  readonly getParagraphUploadStatus: (
    storeDisplayName: string,
    refCode: string,
  ) => Effect.Effect<Option.Option<ParagraphUploadStatus>, UploadStatusError>;
  readonly getBookUploadStatus: (
    storeDisplayName: string,
    bookId: number,
  ) => Effect.Effect<Option.Option<BookUploadStatus>, UploadStatusError>;
}

// ============================================================================
// Service Definition
// ============================================================================

/**
 * EGW Upload Status Service
 */
export class EGWUploadStatus extends Context.Service<EGWUploadStatus, EGWUploadStatusService>()(
  '@bible/core/egw-gemini/upload-status/EGWUploadStatus',
) {
  /**
   * Live implementation using SQLite database.
   */
  static Live: Layer.Layer<
    EGWUploadStatus,
    DatabaseConnectionError | SchemaInitializationError | Config.ConfigError | PlatformError,
    FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    EGWUploadStatus,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      // Get database file path from config or use default
      const dbFile = yield* Config.string('EGW_UPLOAD_STATUS_DB').pipe(
        Config.withDefault('data/egw-upload-status.db'),
      );

      const dbPath = path.resolve(dbFile);

      // Ensure directory exists
      yield* fs.makeDirectory(path.dirname(dbPath), { recursive: true }).pipe(Effect.orDie);

      // Open database connection
      const db = yield* Effect.try({
        try: () => new Database(dbPath),
        catch: (error) =>
          new DatabaseConnectionError({
            message: `Failed to open database at ${dbPath}`,
            cause: error,
          }),
      });

      // Initialize schema
      yield* Effect.try({
        try: () => {
          db.run(`
            CREATE TABLE IF NOT EXISTS paragraph_uploads (
              store_display_name TEXT NOT NULL,
              ref_code TEXT NOT NULL,
              book_id INTEGER NOT NULL,
              status TEXT NOT NULL,
              uploaded_at TEXT,
              error TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (store_display_name, ref_code)
            )
          `);
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_paragraph_uploads_store_ref_code
            ON paragraph_uploads(store_display_name, ref_code)
          `);
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_paragraph_uploads_store_book
            ON paragraph_uploads(store_display_name, book_id)
          `);
        },
        catch: (error) =>
          new SchemaInitializationError({
            message: 'Failed to initialize database schema',
            cause: error,
          }),
      });

      // Prepared statements for better performance
      const insertOrUpdateQuery = db.query(`
        INSERT INTO paragraph_uploads (
          store_display_name,
          ref_code,
          book_id,
          status,
          uploaded_at,
          error,
          created_at,
          updated_at
        ) VALUES ($storeDisplayName, $refCode, $bookId, $status, $uploadedAt, $error, $createdAt, $updatedAt)
        ON CONFLICT(store_display_name, ref_code) DO UPDATE SET
          status = excluded.status,
          book_id = excluded.book_id,
          uploaded_at = excluded.uploaded_at,
          error = excluded.error,
          updated_at = excluded.updated_at
      `);

      const getStatusByRefCodeQuery = db.query<
        ParagraphUploadRow,
        { $storeDisplayName: string; $refCode: string }
      >(`
        SELECT * FROM paragraph_uploads
        WHERE store_display_name = $storeDisplayName
          AND ref_code = $refCode
      `);

      const getStatusesByBookQuery = db.query<
        ParagraphUploadRow,
        { $storeDisplayName: string; $bookId: number }
      >(`
        SELECT * FROM paragraph_uploads
        WHERE store_display_name = $storeDisplayName
          AND book_id = $bookId
      `);

      /**
       * Mark a paragraph as in-progress (starting upload)
       */
      const markParagraphInProgress = (
        storeDisplayName: string,
        refCode: string,
        bookId: number,
      ): Effect.Effect<void, UploadStatusError> =>
        Effect.gen(function* () {
          const now = new Date().toISOString();
          yield* Effect.try({
            try: () => {
              insertOrUpdateQuery.run({
                $storeDisplayName: storeDisplayName,
                $refCode: refCode,
                $bookId: bookId,
                $status: 'in-progress',
                $uploadedAt: null,
                $error: null,
                $createdAt: now,
                $updatedAt: now,
              });
            },
            catch: (error) =>
              new DatabaseQueryError({
                operation: 'markParagraphInProgress',
                storeDisplayName,
                refCode,
                cause: error,
              }),
          });
        });

      /**
       * Mark a paragraph as complete (successfully uploaded)
       */
      const markParagraphComplete = (
        storeDisplayName: string,
        refCode: string,
        bookId: number,
      ): Effect.Effect<void, UploadStatusError> =>
        Effect.gen(function* () {
          const now = new Date().toISOString();

          // First check if record exists to preserve created_at
          const existing = yield* Effect.try({
            try: () =>
              getStatusByRefCodeQuery.get({
                $storeDisplayName: storeDisplayName,
                $refCode: refCode,
              }),
            catch: (error) =>
              new DatabaseQueryError({
                operation: 'getParagraphUploadStatus',
                storeDisplayName,
                refCode,
                cause: error,
              }),
          });

          const createdAt = existing?.created_at || now;

          yield* Effect.try({
            try: () => {
              insertOrUpdateQuery.run({
                $storeDisplayName: storeDisplayName,
                $refCode: refCode,
                $bookId: bookId,
                $status: 'complete',
                $uploadedAt: now,
                $error: null,
                $createdAt: createdAt,
                $updatedAt: now,
              });
            },
            catch: (error) =>
              new DatabaseQueryError({
                operation: 'markParagraphComplete',
                storeDisplayName,
                refCode,
                cause: error,
              }),
          });
        });

      /**
       * Mark a paragraph as failed
       */
      const markParagraphFailed = (
        storeDisplayName: string,
        refCode: string,
        bookId: number,
        error: string,
      ): Effect.Effect<void, UploadStatusError> =>
        Effect.gen(function* () {
          const now = new Date().toISOString();

          // First check if record exists to preserve created_at
          const existing = yield* Effect.try({
            try: () =>
              getStatusByRefCodeQuery.get({
                $storeDisplayName: storeDisplayName,
                $refCode: refCode,
              }),
            catch: (error) =>
              new DatabaseQueryError({
                operation: 'getParagraphUploadStatus',
                storeDisplayName,
                refCode,
                cause: error,
              }),
          });

          const createdAt = existing?.created_at || now;

          yield* Effect.try({
            try: () => {
              insertOrUpdateQuery.run({
                $storeDisplayName: storeDisplayName,
                $refCode: refCode,
                $bookId: bookId,
                $status: 'failed',
                $uploadedAt: null,
                $error: error,
                $createdAt: createdAt,
                $updatedAt: now,
              });
            },
            catch: (error) =>
              new DatabaseQueryError({
                operation: 'markParagraphFailed',
                storeDisplayName,
                refCode,
                cause: error,
              }),
          });
        });

      /**
       * Get paragraph upload status by ref_code
       */
      const getParagraphUploadStatus = (
        storeDisplayName: string,
        refCode: string,
      ): Effect.Effect<Option.Option<ParagraphUploadStatus>, UploadStatusError> =>
        Effect.gen(function* () {
          const row = yield* Effect.try({
            try: () =>
              getStatusByRefCodeQuery.get({
                $storeDisplayName: storeDisplayName,
                $refCode: refCode,
              }),
            catch: (error) =>
              new DatabaseQueryError({
                operation: 'getParagraphUploadStatus',
                storeDisplayName,
                refCode,
                cause: error,
              }),
          });

          if (!row) {
            return yield* Effect.succeed(Option.none());
          }

          const status: ParagraphUploadStatus = {
            status: row.status as 'in-progress' | 'complete' | 'failed',
            refCode: row.ref_code,
            bookId: row.book_id,
            ...(row.uploaded_at && { uploadedAt: row.uploaded_at }),
            ...(row.error && { error: row.error }),
          };

          return yield* Effect.succeed(Option.some(status));
        });

      /**
       * Get aggregated book upload status (from all paragraphs)
       */
      const getBookUploadStatus = (
        storeDisplayName: string,
        bookId: number,
      ): Effect.Effect<Option.Option<BookUploadStatus>, UploadStatusError> =>
        Effect.gen(function* () {
          const rows = yield* Effect.try({
            try: () =>
              getStatusesByBookQuery.all({
                $storeDisplayName: storeDisplayName,
                $bookId: bookId,
              }),
            catch: (error) =>
              new DatabaseQueryError({
                operation: 'getBookUploadStatus',
                storeDisplayName,
                refCode: `book:${bookId}`,
                cause: error,
              }),
          });

          if (rows.length === 0) {
            return yield* Effect.succeed(Option.none());
          }

          const completeCount = rows.filter((r) => r.status === 'complete').length;
          const failedCount = rows.filter((r) => r.status === 'failed').length;
          const inProgressCount = rows.filter((r) => r.status === 'in-progress').length;
          const totalCount = rows.length;

          // Determine overall status
          let overallStatus: 'in-progress' | 'complete' | 'failed';
          if (completeCount === totalCount) {
            overallStatus = 'complete';
          } else if (failedCount > 0 && inProgressCount === 0) {
            overallStatus = 'failed';
          } else {
            overallStatus = 'in-progress';
          }

          // Get latest uploaded_at timestamp
          const latestUploadedAt = rows
            .map((r) => r.uploaded_at)
            .filter((t): t is string => t !== null)
            .sort()
            .pop();

          // Get any error messages
          const errors = rows.map((r) => r.error).filter((e): e is string => e !== null);

          const status: BookUploadStatus = {
            status: overallStatus,
            documentsUploaded: completeCount,
            expectedDocuments: totalCount,
            ...(latestUploadedAt && { uploadedAt: latestUploadedAt }),
            ...(errors.length > 0 && { error: errors.join('; ') }),
          };

          return yield* Effect.succeed(Option.some(status));
        });

      // Cleanup: close database when scope ends
      yield* Effect.addFinalizer(() =>
        Effect.try({
          try: () => {
            db.close(false); // Allow pending queries to finish
          },
          catch: (error) =>
            new DatabaseConnectionError({
              message: 'Failed to close database connection',
              cause: error,
            }),
        }).pipe(Effect.ignore),
      );

      return {
        markParagraphInProgress,
        markParagraphComplete,
        markParagraphFailed,
        getParagraphUploadStatus,
        getBookUploadStatus,
      };
    }),
  );

  /**
   * Default layer - alias for Live (backwards compatibility).
   */
  static Default = EGWUploadStatus.Live;

  /**
   * Test implementation with in-memory storage.
   */
  static Test = (): Layer.Layer<EGWUploadStatus> => {
    const storage = new Map<string, ParagraphUploadStatus>();
    return Layer.succeed(EGWUploadStatus, {
      markParagraphInProgress: (storeDisplayName, refCode, bookId) =>
        Effect.sync(() => {
          storage.set(`${storeDisplayName}:${refCode}`, {
            status: 'in-progress',
            refCode,
            bookId,
          });
        }),
      markParagraphComplete: (storeDisplayName, refCode, bookId) =>
        Effect.sync(() => {
          storage.set(`${storeDisplayName}:${refCode}`, {
            status: 'complete',
            refCode,
            bookId,
            uploadedAt: new Date().toISOString(),
          });
        }),
      markParagraphFailed: (storeDisplayName, refCode, bookId, error) =>
        Effect.sync(() => {
          storage.set(`${storeDisplayName}:${refCode}`, {
            status: 'failed',
            refCode,
            bookId,
            error,
          });
        }),
      getParagraphUploadStatus: (storeDisplayName, refCode) =>
        Effect.succeed(Option.fromNullishOr(storage.get(`${storeDisplayName}:${refCode}`))),
      getBookUploadStatus: () => Effect.succeed(Option.none()),
    });
  };
}
