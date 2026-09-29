// Where the sound library's private files live off the repo. Generated sounds
// may not be published (ElevenLabs' terms forbid distributing them as files)
// and cannot be made again (the model has no seed), so `sfx push` copies them
// to a store and `sfx pull` brings them back. One small interface; a folder
// store now (`~/film-media/sounds`), a remote one (a private Git repo or an R2
// bucket) once the owner chooses.

import { Effect, type FileSystem, type Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

export interface SoundStoreService {
  /** Where the store is, for the log. */
  readonly where: string;
  /** Whether the store holds `key` (a path under the library's `files/`). */
  readonly has: (key: string) => Effect.Effect<boolean, PlatformError>;
  /** Copy the store's `key` to `to`, whole: a reader never sees half of it. */
  readonly get: (key: string, to: string) => Effect.Effect<void, PlatformError>;
  /** Copy `from` into the store as `key`, whole. */
  readonly put: (key: string, from: string) => Effect.Effect<void, PlatformError>;
}

/** `~/…` under `home`; any other path as it is. */
export const expandHome = (file: string, home: string): string => {
  if (file === '~') return home;
  if (file.startsWith('~/')) return `${home}${file.slice(1)}`;
  return file;
};

/** A store that is a folder: each key a file at that path under `root`. */
export const folderStore = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
): SoundStoreService => {
  /** `from` copied to `to` beside it first, then renamed over it. */
  const copyWhole = (from: string, to: string) =>
    Effect.gen(function* () {
      yield* fs.makeDirectory(path.dirname(to), { recursive: true });
      const partial = `${to}.partial`;
      yield* fs.copyFile(from, partial);
      yield* fs.rename(partial, to);
    });
  return {
    where: root,
    has: (key) => fs.exists(path.join(root, key)),
    get: (key, to) => copyWhole(path.join(root, key), to),
    put: (key, from) => copyWhole(from, path.join(root, key)),
  };
};
