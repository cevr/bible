/** Bun runtime composition for the driver-agnostic BibleDatabase service. */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Config, Effect, FileSystem, Layer, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { SqlError } from 'effect/unstable/sql/SqlError';

import { BibleDatabase } from './bible-database.js';

const immutableFilename = (filename: string): string => {
  const uri = filename.startsWith('file:') ? filename : `file:${encodeURI(filename)}`;
  return `${uri}${uri.includes('?') ? '&' : '?'}immutable=1`;
};

export const layerBun = (filename: string): Layer.Layer<BibleDatabase, SqlError> =>
  BibleDatabase.layer.pipe(
    Layer.provide(
      SqliteBun.layer({
        filename: immutableFilename(filename),
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
        // Platform bootstrap resolves the default before constructing the driver layer.
        // eslint-disable-next-line node/no-process-env
        const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '.';
        const defaultDbPath = path.join(homeDir, '.bible', 'bible.db');
        const configured = yield* Config.string('BIBLE_DB_PATH').pipe(
          Config.withDefault(defaultDbPath),
        );
        const filename = path.resolve(configured);
        yield* fs.makeDirectory(path.dirname(filename), { recursive: true }).pipe(Effect.orDie);
        return SqliteBun.layer({
          filename: immutableFilename(filename),
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
