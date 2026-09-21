/** Bun runtime composition for the driver-agnostic BibleDatabase service. */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Config, Effect, FileSystem, Layer, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { SqlError } from 'effect/unstable/sql/SqlError';

import { immutableFileUri } from '../db/immutable-uri.js';
import { BibleDatabase } from './bible-database.js';

export const layerBun = (filename: string): Layer.Layer<BibleDatabase, SqlError> =>
  BibleDatabase.layer.pipe(
    Layer.provide(
      SqliteBun.layer({
        filename: immutableFileUri(filename),
        readonly: true,
        readwrite: false,
        create: false,
        disableWAL: true,
      }),
    ),
  );

export const layerBunConfig: Layer.Layer<
  BibleDatabase,
  SqlError | Config.ConfigError | PlatformError,
  FileSystem.FileSystem | Path.Path
> = BibleDatabase.layer.pipe(
  Layer.provide(
    Layer.unwrap(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const homeDir = yield* Config.String('HOME').pipe(
          Config.orElse(() => Config.String('USERPROFILE')),
          Config.withDefault('.'),
        );
        const defaultDbPath = path.join(homeDir, '.bible', 'bible.db');
        const configured = yield* Config.String('BIBLE_DB_PATH').pipe(
          Config.withDefault(defaultDbPath),
        );
        const filename = path.resolve(configured);
        yield* fs.makeDirectory(path.dirname(filename), { recursive: true }).pipe(Effect.orDie);
        return SqliteBun.layer({
          filename: immutableFileUri(filename),
          readonly: true,
          readwrite: false,
          create: false,
          disableWAL: true,
        });
      }),
    ),
  ),
);

export const Default = layerBunConfig;
