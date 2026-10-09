// The Bun manifest lock refuses, as a failure, what is not another writer
// holding it: a lock file that is no database, or a lock path that cannot be
// opened. Only a held lock is "not taken yet" (`Option.none`, tried again).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option } from 'effect';
import { bunManifestLock, lockFile } from './manifest-lock-bun.ts';

describe('the Bun manifest lock', () => {
  it.effect('takes a lock, and holds it from the next try until it is let go', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/manifest.json`;
      const first = yield* bunManifestLock.take(file);
      expect(Option.isSome(first)).toBe(true);
      expect(Option.isNone(yield* bunManifestLock.take(file))).toBe(true);
      for (const release of Option.toArray(first)) yield* release;
      expect(Option.isSome(yield* bunManifestLock.take(file))).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('fails, not "held", when its file is no database', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/manifest.json`;
      yield* fs.writeFileString(lockFile(file), 'this is not a database file at all, '.repeat(40));
      const refused = (yield* Effect.flip(bunManifestLock.take(file))).reason;
      expect([refused._tag, refused.module, refused.method]).toEqual([
        'Unknown',
        'ManifestLock',
        'take',
      ]);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('fails, not "held", when its path cannot be opened', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/manifest.json`;
      // A folder stands where the lock file would be.
      yield* fs.makeDirectory(lockFile(file));
      const refused = (yield* Effect.flip(bunManifestLock.take(file))).reason;
      expect([refused._tag, refused.module, refused.method]).toEqual([
        'Unknown',
        'ManifestLock',
        'take',
      ]);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
