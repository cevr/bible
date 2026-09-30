// Where the films' private media lives off the repo: the sound library's
// generated files, the films' scores and review renders. Generated audio may
// not be published (ElevenLabs' terms forbid distributing it as files) and
// cannot be made again (the model has no seed), so `sfx push`/`media push`
// copy it to a store and `sfx pull`/`media pull` bring it back.
//
// One small interface, two stores: a folder (`folderStore`, here) and a
// private R2 bucket over the S3 API (`r2Store`, `r2-store.ts`). Keys:
//
//   files/<sound>/<hash>.<ext>   the library's generated files (the lock's paths)
//   scores/<film>/<file>         each film's composed score options
//   renders/<path>               share renders, montages, contact sheets
//
// A key's bytes are whole: `put` and `get` never leave half a file where a
// reader could see it, and each key carries its bytes' sha256, so `hashOf`
// answers without reading them.

import { Effect, type FileSystem, Option, type Path, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { writeWhole } from './content-store.ts';
import { sha256OfFile } from './digest.ts';
import { StoreFailed } from './errors.ts';

/** What the store holds under a key: its size in bytes and when it was last written (ISO 8601). */
export interface StoredObject {
  readonly key: string;
  readonly size: number;
  readonly modified: string;
}

/** Bytes `start` to `end` of an object, both inclusive (as an HTTP `Range` counts them). */
export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/** A read of an object: its whole size, the range sent, and those bytes as a stream. */
export interface StoredRead {
  readonly size: number;
  readonly start: number;
  readonly end: number;
  readonly stream: Stream.Stream<Uint8Array, StoreFailed>;
}

export interface MediaStoreService {
  /** Where the store is, for the log (never a credential). */
  readonly where: string;
  /** The sha256 of the bytes the store holds as `key`, if it holds any. */
  readonly hashOf: (key: string) => Effect.Effect<Option.Option<string>, StoreFailed>;
  /** Copy the store's `key` to the file `to`, whole: a reader never sees half of it. */
  readonly get: (key: string, to: string) => Effect.Effect<void, StoreFailed>;
  /** Copy the file `from` into the store as `key`, whole, with its sha256. */
  readonly put: (key: string, from: string) => Effect.Effect<void, StoreFailed>;
  /** Every key under `prefix` (`renders/`, `scores/<film>/`, …), sorted. */
  readonly list: (prefix: string) => Effect.Effect<ReadonlyArray<StoredObject>, StoreFailed>;
  /**
   * The bytes of `key` (all of them, or a range), as a stream: what a page
   * that plays a render asks for. None when the store does not hold the key.
   */
  readonly read: (
    key: string,
    range: Option.Option<ByteRange>,
  ) => Effect.Effect<Option.Option<StoredRead>, StoreFailed>;
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

/** Where review renders are kept in the store. */
export const RENDERS = 'renders/';

/**
 * A render's key: `renders/<dir>/<name>` when a folder is given; else
 * `renders/` and its path under `outputs` (`FILMS_OUT`), so that `media
 * pull`'s `<outputs>/renders/<key>` mirrors where it was; a file outside
 * `outputs` by its name alone.
 */
export const renderKey = (
  path: Path.Path,
  outputs: string,
  file: string,
  under: Option.Option<string>,
): string =>
  Option.match(under, {
    onSome: (dir) => `${RENDERS}${dir.replace(/^\/+|\/+$/g, '')}/${path.basename(file)}`,
    onNone: () => {
      const rel = path.relative(outputs, file);
      if (rel.startsWith('..') || path.isAbsolute(rel)) return `${RENDERS}${path.basename(file)}`;
      return `${RENDERS}${rel.split(path.sep).join('/')}`;
    },
  });

/** `~/…` under `home`; any other path as it is. */
export const expandHome = (file: string, home: string): string => {
  if (file === '~') return home;
  if (file.startsWith('~/')) return `${home}${file.slice(1)}`;
  return file;
};

/** The bytes a read covers of an object `size` bytes long: all, or the range cut at the end; none when it starts past the end. */
export const clampRange = (
  range: Option.Option<ByteRange>,
  size: number,
): Option.Option<ByteRange> =>
  Option.match(range, {
    onNone: () => Option.some({ start: 0, end: Math.max(0, size - 1) }),
    onSome: ({ start, end }) =>
      Option.liftPredicate({ start, end: Math.min(end, size - 1) }, (r) => r.start < size),
  });

/** A store that is a folder: each key a file at that path under `root`, hashed as it streams. */
export const folderStore = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
): MediaStoreService => {
  const failed =
    (op: string, key: string) =>
    (error: PlatformError): StoreFailed =>
      StoreFailed.make({ store: root, op, key, reason: error.message });
  /** `from` copied to `to` whole (`writeWhole`). */
  const copyWhole = (from: string, to: string) =>
    Effect.gen(function* () {
      yield* fs.makeDirectory(path.dirname(to), { recursive: true });
      yield* writeWhole(fs, to, (partial) => fs.copyFile(from, partial));
    });
  const hashOf = (key: string) =>
    Effect.gen(function* () {
      const at = path.join(root, key);
      if (!(yield* fs.exists(at))) return Option.none<string>();
      return Option.some(yield* sha256OfFile(fs, at));
    }).pipe(Effect.mapError(failed('hash', key)));
  const list = (prefix: string) =>
    Effect.gen(function* () {
      if (!(yield* fs.exists(root))) return [];
      const found: Array<StoredObject> = [];
      for (const key of yield* fs.readDirectory(root, { recursive: true })) {
        if (!key.startsWith(prefix) || key.endsWith('.partial')) continue;
        const info = yield* fs.stat(path.join(root, key));
        if (info.type !== 'File') continue;
        found.push({
          key,
          size: Number(info.size),
          modified: Option.match(info.mtime, { onNone: () => '', onSome: (d) => d.toISOString() }),
        });
      }
      return found.toSorted((a, b) => a.key.localeCompare(b.key));
    }).pipe(Effect.mapError(failed('list', prefix)));
  const read = (key: string, range: Option.Option<ByteRange>) =>
    Effect.gen(function* () {
      const at = path.join(root, key);
      if (!(yield* fs.exists(at).pipe(Effect.mapError(failed('read', key)))))
        return Option.none<StoredRead>();
      const size = Number((yield* fs.stat(at).pipe(Effect.mapError(failed('read', key)))).size);
      const span = clampRange(range, size);
      if (Option.isNone(span))
        return yield* StoreFailed.make({
          store: root,
          op: 'read',
          key,
          reason: `the range starts past its ${size} bytes`,
        });
      const { start, end } = span.value;
      const stream = fs
        .stream(at, { offset: start, bytesToRead: end - start + 1 })
        .pipe(Stream.mapError(failed('read', key)));
      return Option.some<StoredRead>({ size, start, end, stream });
    });
  return {
    where: root,
    hashOf,
    get: (key, to) => copyWhole(path.join(root, key), to).pipe(Effect.mapError(failed('get', key))),
    put: (key, from) =>
      copyWhole(from, path.join(root, key)).pipe(Effect.mapError(failed('put', key))),
    list,
    read,
  };
};
