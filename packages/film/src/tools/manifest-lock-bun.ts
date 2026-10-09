// A manifest's lock on Bun: SQLite's write lock (`BEGIN IMMEDIATE`, a
// RESERVED lock) on an empty database file of its own beside the manifest.
// SQLite takes it with the operating system's advisory file locks, which the
// kernel drops when the holding process ends, a crash or a `kill -9` too; and
// it keeps two connections of one process apart itself, which the
// operating system's locks would not. Nothing is ever written to it: the
// journal is kept in memory, so no journal file appears beside it, and the
// file stays empty with its mtime unchanged. It is tried once, never waited
// on (`busy_timeout` 0), so no wait blocks the process's event loop; the
// store waits between tries.
//
// The lock file is `.<name>.lock` beside the manifest `<name>` (`lockFile`),
// made the first time the manifest is changed and never removed: removing a
// lock file another process holds would let a third take a new one beside
// it. Beside the manifest, it is on the same disk as what it guards, under a
// name of its own (`.<name>.lock`, not `<name>.lock`), where no tmp cleaner reaches; git ignores
// it there (`src/films/**/*.lock`, `**/sounds/**/*.lock`, and the whole of
// `out/` and the lab's `lab/`); and the lab's watch hears only the files a
// build read and the mixes' tracks, so its making is heard as nothing. No
// code of this process may open it but through SQLite: closing any other
// handle on the file would let go of the process's locks on it.

import { Database } from 'bun:sqlite';
import { Effect, Option, Result, Schema } from 'effect';
import { type PlatformError, systemError } from 'effect/PlatformError';
// oxlint-disable-next-line effect/noNodeBuiltinImport -- ManifestLock's Bun adapter: names its file outside any Effect
import { basename, dirname, join } from 'node:path';
import type { ManifestLockService } from './manifest-lock.ts';

/** The lock file of the manifest at `file`: `.<name>.lock` beside it. */
export const lockFile = (file: string): string => join(dirname(file), `.${basename(file)}.lock`);

/** Whether SQLite refused because another connection holds the lock. */
const isBusy = Schema.is(Schema.Struct({ code: Schema.Literal('SQLITE_BUSY') }));

const refused = (lock: string, cause: unknown): PlatformError =>
  systemError({
    _tag: 'Unknown',
    module: 'ManifestLock',
    method: 'take',
    pathOrDescriptor: lock,
    description: String(cause),
    cause,
  });

export const bunManifestLock: ManifestLockService = {
  take: (file) =>
    Effect.gen(function* () {
      const lock = lockFile(file);
      const db = yield* Effect.try({
        try: () => new Database(lock, { create: true }),
        catch: (cause) => refused(lock, cause),
      });
      const taken = Result.try(() => {
        db.exec('PRAGMA busy_timeout = 0');
        db.exec('PRAGMA journal_mode = MEMORY');
        db.exec('BEGIN IMMEDIATE');
      });
      if (Result.isFailure(taken)) {
        db.close();
        if (isBusy(taken.failure)) return Option.none();
        return yield* refused(lock, taken.failure);
      }
      // Closing the connection ends its transaction, and lets the lock go.
      return Option.some(Effect.sync(() => db.close()));
    }),
};
