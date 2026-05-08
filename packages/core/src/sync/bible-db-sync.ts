/**
 * Bible DB Sync - Auto-download bible.db from GitHub if missing
 *
 * Downloads the pre-built SQLite database (~86MB) directly from the repo
 * rather than rebuilding from JSON sources.
 */

import { Effect, FileSystem, Path, Schema } from 'effect';

const BIBLE_DB_URL =
  'https://raw.githubusercontent.com/cevr/bible/main/packages/core/data/bible.db';

export class BibleDbSyncError extends Schema.TaggedErrorClass<BibleDbSyncError>()(
  'BibleDbSyncError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/**
 * Ensures ~/.bible/bible.db exists, downloading from GitHub if missing.
 * Returns true if a download was performed.
 */
export const ensureBibleDb = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;

  const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '.';
  const bibleDir = pathService.join(homeDir, '.bible');
  const dbPath = pathService.join(bibleDir, 'bible.db');

  const exists = yield* fs.exists(dbPath);
  if (exists) return false;

  yield* fs.makeDirectory(bibleDir, { recursive: true });

  const response = yield* Effect.tryPromise({
    try: () => fetch(BIBLE_DB_URL),
    catch: (cause) => new BibleDbSyncError({ message: 'Failed to fetch bible.db', cause }),
  });

  if (!response.ok) {
    return yield* new BibleDbSyncError({
      message: `Failed to download bible.db: HTTP ${response.status}`,
    });
  }

  const buffer = yield* Effect.tryPromise({
    try: () => response.arrayBuffer(),
    catch: (cause) => new BibleDbSyncError({ message: 'Failed to read bible.db response', cause }),
  });

  yield* fs.writeFile(dbPath, new Uint8Array(buffer));
  return true;
});
