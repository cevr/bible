// Where the sound library's private files live off the repo. Generated sounds
// may not be published (ElevenLabs' terms forbid distributing them as files)
// and cannot be made again (the model has no seed), so `sfx push` copies them
// to a store and `sfx pull` brings them back. One small interface; a folder
// store now (the library's `store.folder`), a remote one (a private Git repo
// or an R2 bucket) once the owner chooses. A film's generated score is kept
// the same way, beside the library's files (`scores/<film>/<file>`).

import { Effect, type FileSystem, Option, type Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

export interface SoundStoreService {
  /** Where the store is, for the log. */
  readonly where: string;
  /** The sha256 of the bytes the store holds as `key` (`files/…` for a library file, `scores/…` for a score), if any. */
  readonly hashOf: (key: string) => Effect.Effect<Option.Option<string>, PlatformError>;
  /** Copy the store's `key` to `to`, whole: a reader never sees half of it. */
  readonly get: (key: string, to: string) => Effect.Effect<void, PlatformError>;
  /** Copy `from` into the store as `key`, whole. */
  readonly put: (key: string, from: string) => Effect.Effect<void, PlatformError>;
}

/** A private file the store keeps: its key in the store, where it lives here, and its bytes' hash. */
export interface PrivateFile {
  readonly key: string;
  readonly file: string;
  readonly sha256: string;
}

/**
 * The films' generated scores, kept beside the library's files in its store:
 * each composed option (keyed `scores/<film>/<file>`), and each film's
 * `sound/` folder, where no audio may be committed.
 */
export interface Scores {
  readonly files: ReadonlyArray<PrivateFile>;
  readonly dirs: ReadonlyArray<string>;
}

/** No films' scores: the library's own files alone. */
export const NO_SCORES: Scores = { files: [], dirs: [] };

/** A score option's key in the store. */
export const scoreKey = (film: string, file: string): string => `scores/${film}/${file}`;

/** `~/…` under `home`; any other path as it is. */
export const expandHome = (file: string, home: string): string => {
  if (file === '~') return home;
  if (file.startsWith('~/')) return `${home}${file.slice(1)}`;
  return file;
};

/** A store that is a folder: each key a file at that path under `root`, hashed by `sha256`. */
export const folderStore = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  sha256: (bytes: Uint8Array) => Effect.Effect<string, PlatformError>,
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
    hashOf: (key) =>
      Effect.gen(function* () {
        const at = path.join(root, key);
        if (!(yield* fs.exists(at))) return Option.none();
        return Option.some(yield* sha256(yield* fs.readFile(at)));
      }),
    get: (key, to) => copyWhole(path.join(root, key), to),
    put: (key, from) => copyWhole(from, path.join(root, key)),
  };
};
