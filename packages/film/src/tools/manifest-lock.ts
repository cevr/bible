// What keeps two processes from changing one manifest at once: a lock the
// operating system holds for its holder and drops the moment the holder's
// process ends, however it ends. Nothing judges whether a holder is gone: a
// crashed holder's lock is no longer held, and a running holder's lock is
// held however long it holds it. On Bun the lock is SQLite's write lock on a
// file of its own beside the manifest (`manifest-lock-bun.ts`); tests hold
// one in memory (`testing.ts`, `memoryManifestLock`).

import { Context, type Effect, type Option } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { bunManifestLock } from './manifest-lock-bun.ts';

/** The locks of manifests, one per manifest's path, across this host's processes. */
export interface ManifestLockService {
  /**
   * Try once, without waiting, to hold the lock of the manifest at `file`:
   * what lets it go when held, none while another holder (of this process or
   * any other) has it.
   */
  readonly take: (file: string) => Effect.Effect<Option.Option<Effect.Effect<void>>, PlatformError>;
}

/** This host's manifest locks: SQLite's, on Bun. Tests set it. */
export const ManifestLock = Context.Reference<ManifestLockService>(
  '@bible/film/tools/ManifestLock',
  { defaultValue: () => bunManifestLock },
);
