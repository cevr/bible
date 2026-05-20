/**
 * Bun-runtime layer constructors for EGWParagraphDatabase.
 *
 * Kept separate from `book-database.ts` so that consumers running on Node
 * (e.g. Electron main) can import the driver-agnostic core without pulling
 * `@effect/sql-sqlite-bun` (and its `bun:sqlite` import) into the bundle.
 */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Config, Effect, FileSystem, Layer, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { SqlError } from 'effect/unstable/sql/SqlError';

import type { DatabaseConnectionError } from '../errors/database.js';
import { EGWParagraphDatabase } from './book-database.js';

/**
 * Convenience layer for Bun runtimes. Resolves the database file from the
 * `EGW_PARAGRAPH_DB` config (default: ~/.bible/egw-paragraphs.db), ensures the
 * containing directory exists, and provides a sqlite-bun SqlClient.
 */
export const layerBunConfig: Layer.Layer<
  EGWParagraphDatabase,
  SqlError | Config.ConfigError | PlatformError | DatabaseConnectionError,
  FileSystem.FileSystem | Path.Path
> = EGWParagraphDatabase.layerCore.pipe(
  Layer.provide(
    Layer.unwrap(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '.';
        const defaultDbPath = path.join(homeDir, '.bible', 'egw-paragraphs.db');
        const dbFile = yield* Config.string('EGW_PARAGRAPH_DB').pipe(
          Config.withDefault(defaultDbPath),
        );
        const dbPath = path.resolve(dbFile);
        yield* fs.makeDirectory(path.dirname(dbPath), { recursive: true }).pipe(Effect.orDie);
        return SqliteBun.layer({ filename: dbPath });
      }),
    ),
  ),
);

/**
 * Convenience layer for Bun runtimes that uses a fixed filename. Skips
 * directory creation — caller is responsible for ensuring the parent exists.
 */
export const layerBun = (filename: string): Layer.Layer<EGWParagraphDatabase, SqlError> =>
  EGWParagraphDatabase.layerCore.pipe(Layer.provide(SqliteBun.layer({ filename })));

/**
 * Backwards-compatible alias. Resolves the EGW_PARAGRAPH_DB config and
 * provides sqlite-bun. Same dependency surface as the old `Live` layer.
 */
export const Live: Layer.Layer<
  EGWParagraphDatabase,
  SqlError | Config.ConfigError | PlatformError | DatabaseConnectionError,
  FileSystem.FileSystem | Path.Path
> = layerBunConfig;

export const Default = Live;
