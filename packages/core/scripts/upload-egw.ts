/**
 * Upload All EGW Writings Script
 *
 * This script uploads all Ellen G. White writings to a Gemini File Search store.
 * It automatically skips books that are already uploaded (95%+ complete).
 *
 * IMPORTANT: Books must be synced to the local database first!
 * Run `bun run sync-egw-books.ts` before running this script.
 *
 * Usage:
 *   bun run upload-egw.ts
 *
 * Prerequisites:
 *   1. Sync books: bun run sync-egw-books.ts [languageCode]
 *
 * Environment Variables Required:
 *   - GOOGLE_AI_API_KEY: Your Google AI API key
 *   - EGW_CLIENT_ID: EGW API client ID
 *   - EGW_CLIENT_SECRET: EGW API client secret
 *   - EGW_AUTH_BASE_URL: (optional) Defaults to https://cpanel.egwwritings.org
 *   - EGW_API_BASE_URL: (optional) Defaults to https://a.egwwritings.org
 *   - EGW_SCOPE: (optional) Defaults to "writings search studycenter subscriptions user_info"
 *   - EGW_BOOK_DB: (optional) Path to book database file, defaults to "data/egw-books.db"
 */

import { FetchHttpClient } from 'effect/unstable/http';
import { BunServices, BunFileSystem, BunPath, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';

import * as EGWDbBun from '../src/egw-db/book-database-bun.js';
import { EGWGeminiService } from '../src/egw-gemini/index.js';
import { EGWUploadStatus } from '../src/egw-gemini/upload-status.js';
import { EGWAuth } from '../src/egw/auth.js';
import { EGWApiClient } from '../src/egw/client.js';
import { GeminiFileSearchClient } from '../src/gemini/index.js';

// Folder ID for "Books" folder (published writings)
// This is under "EGW Writings" (ID: 2) and contains 120 books
const BOOKS_FOLDER_ID = 4;

const program = Effect.gen(function* () {
  const service = yield* EGWGeminiService;

  yield* Effect.log('Starting upload of all EGW writings...');
  yield* Effect.log(`Filtering books by folder ID ${BOOKS_FOLDER_ID} (Books - published writings)`);

  const languageCode = 'en';

  const result = yield* service.uploadAllEGWWritings({
    storeDisplayName: 'egw-writings',
    languageCode,
    egwAuthorName: 'Ellen Gould White',
    folderId: BOOKS_FOLDER_ID, // Filter by Books folder (published writings)
  });

  yield* Effect.log(
    `Upload complete! Processed ${result.totalBooksFound} books, uploaded ${result.booksUploaded} new books.`,
  );

  return result;
});

// Compose layers with explicit dependencies
// EGWAuth needs: HttpClient, FileSystem, Path
const AuthLayer = EGWAuth.layerLiveFs().pipe(Layer.provide(FetchHttpClient.layer));

// EGWApiClient needs: EGWAuth, HttpClient
const ApiClientLayer = EGWApiClient.Live.pipe(
  Layer.provide(AuthLayer),
  Layer.provide(FetchHttpClient.layer),
);

// GeminiFileSearchClient needs: HttpClient
const GeminiClientLayer = GeminiFileSearchClient.Live.pipe(Layer.provide(FetchHttpClient.layer));

// EGWParagraphDatabase needs: FileSystem, Path
const ParagraphDbLayer = EGWDbBun.Live;

// EGWUploadStatus needs: FileSystem, Path
const UploadStatusLayer = EGWUploadStatus.Live;

// EGWGeminiService needs: EGWApiClient, GeminiFileSearchClient, EGWUploadStatus, EGWParagraphDatabase, FileSystem
const EGWGeminiLayer = EGWGeminiService.Live.pipe(
  Layer.provide(ApiClientLayer),
  Layer.provide(GeminiClientLayer),
  Layer.provide(UploadStatusLayer),
  Layer.provide(ParagraphDbLayer),
  Layer.provide(BunFileSystem.layer),
  Layer.provide(BunPath.layer),
);

// App layer with all services
const AppLayer = Layer.mergeAll(EGWGeminiLayer, BunServices.layer);

BunRuntime.runMain(program.pipe(Effect.provide(AppLayer)));
