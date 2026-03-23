/**
 * Centralized Error Types
 *
 * All error types for @bible/core, organized by domain.
 * Uses Schema.TaggedErrorClass for serialization and pattern matching.
 * Each domain exports both individual errors and a Schema.Union.
 */

// Database errors
export {
  DatabaseConnectionError,
  SchemaInitializationError,
  DatabaseQueryError,
  RecordNotFoundError,
  DatabaseError,
  type DatabaseError as DatabaseErrorType,
} from './database.js';

// Sabbath School errors
export {
  DownloadError,
  ParseError,
  MissingPdfError,
  OutlineError,
  ReviewError,
  ReviseError,
  SabbathSchoolError,
  type SabbathSchoolError as SabbathSchoolErrorType,
} from '../sabbath-school/errors.js';

// EGW Reader errors
export {
  EGWReaderError,
  BookNotFoundError,
  DatabaseNotInitializedError,
  ReaderError,
  type ReaderError as ReaderErrorType,
} from '../egw-reader/service.js';

// EGW Commentary errors
export { CommentaryError, type CommentaryServiceError } from '../egw-commentary/service.js';

// EGW API errors
export { EGWApiError, EGWAuthError } from '../egw/index.js';

// EGW Gemini errors
export { EGWGeminiError } from '../egw-gemini/service.js';

// Gemini errors
export { GeminiFileSearchError } from '../gemini/client.js';

// AI errors
export { AiError } from '../ai/service.js';

// Adapter errors
export { StorageError } from '../adapters/storage.js';
export { ExportError } from '../adapters/export.js';

// Hymnal errors
export type { HymnalDatabaseError, HymnNotFoundError } from './hymnal.js';
