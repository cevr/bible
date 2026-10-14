// A film's storyboard on disk: the record, `src/films/<film>/board.json`
// (committed, a `ContentStore` manifest: written whole, one writer at a time
// across processes), and the images beside it in `src/films/<film>/board/`
// (git-ignored, like the sounds: big, and made again only at a cost), each
// recorded with its sha256 so a copy brought from another checkout is known
// to be the same. The CLI (`film board`) and the lab's board routes both go
// through this store, so either works without the other.

import {
  Array as Arr,
  Boolean as Bool,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
} from 'effect';
import type { Result } from 'effect';
import { type BoardFile, BoardFileJson, type BoardRefusal, emptyBoard } from '../core/board.ts';
import { BoardFileUnknown, BoardRefused } from '../core/refusals.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { sha256Hex } from './digest.ts';
import { FilmFolder, type FilmName } from './film-repo.ts';

/** Where one film's board lives. */
interface BoardPaths {
  readonly record: Manifest<BoardFile>;
  /** The images' folder. */
  readonly folder: string;
}

/** Every image file a board names: each try's, and its style's reference. */
const boardFiles = (board: BoardFile): ReadonlyArray<{ file: string; sha256: string }> => [
  ...Option.toArray(
    Option.map(Option.fromUndefinedOr(board.style), (s) => ({ file: s.ref, sha256: s.sha256 })),
  ),
  ...board.panels.flatMap((p) => p.tries.map((t) => ({ file: t.file, sha256: t.sha256 }))),
];

/** An image the record names that is missing from the folder, or whose bytes differ. */
interface BoardFileProblem {
  readonly file: string;
  readonly problem: 'missing' | 'changed';
}

interface BoardStoreService {
  readonly paths: (film: FilmName) => BoardPaths;
  /** The film's board; an empty one before its first panel. */
  readonly read: (film: FilmName) => Effect.Effect<BoardFile, StoreError>;
  /** One change to the board, decided on the board as read under its lock. */
  readonly transact: <A, E, R>(
    film: FilmName,
    change: (current: BoardFile) => Effect.Effect<readonly [A, BoardFile], E, R>,
  ) => Effect.Effect<A, E | StoreError, R>;
  /** The board changed by a pure step, or its refusal raised as `BoardRefused`. */
  readonly modify: (
    film: FilmName,
    change: (current: BoardFile) => Result.Result<BoardFile, BoardRefusal>,
  ) => Effect.Effect<BoardFile, StoreError | BoardRefused>;
  /** Write an image into the folder, whole; its sha256. */
  readonly put: (
    film: FilmName,
    file: string,
    bytes: Uint8Array,
  ) => Effect.Effect<string, StoreError>;
  /** The path of an image the board names, its bytes checked against the record. */
  readonly image: (
    film: FilmName,
    file: string,
  ) => Effect.Effect<string, BoardFileUnknown | StoreError>;
  /** The images the record names that are missing or changed. */
  readonly problems: (film: FilmName) => Effect.Effect<ReadonlyArray<BoardFileProblem>, StoreError>;
}

export class BoardStore extends Context.Service<BoardStore, BoardStoreService>()(
  '@bible/film/tools/BoardStore',
) {
  static readonly layer = Layer.effect(
    BoardStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const folder = yield* FilmFolder;

      const paths = (film: FilmName): BoardPaths => {
        const dir = folder.paths(film).dir;
        return {
          record: {
            file: path.join(dir, 'board.json'),
            codec: BoardFileJson,
            empty: emptyBoard(film),
          },
          folder: path.join(dir, 'board'),
        };
      };

      const read = (film: FilmName) => store.read(paths(film).record);

      const transact = <A, E, R>(
        film: FilmName,
        change: (current: BoardFile) => Effect.Effect<readonly [A, BoardFile], E, R>,
      ) => store.transact(paths(film).record, change);

      const modify = Effect.fn('BoardStore.modify')(function* (
        film: FilmName,
        change: (current: BoardFile) => Result.Result<BoardFile, BoardRefusal>,
      ) {
        return yield* transact(film, (current) =>
          Effect.map(
            Effect.mapError(Effect.fromResult(change(current)), (r) =>
              BoardRefused.make({ film, reason: r.reason }),
            ),
            (next) => [next, next] as const,
          ),
        );
      });

      const put = Effect.fn('BoardStore.put')(function* (
        film: FilmName,
        file: string,
        bytes: Uint8Array,
      ) {
        yield* store.writeFile(path.join(paths(film).folder, file), bytes);
        return sha256Hex(bytes);
      });

      const image = Effect.fn('BoardStore.image')(function* (film: FilmName, file: string) {
        const named = Arr.findFirst(boardFiles(yield* read(film)), (f) => f.file === file);
        if (Option.isNone(named))
          return yield* BoardFileUnknown.make({
            film,
            file,
            reason: 'the board names no such image',
          });
        const at = path.join(paths(film).folder, named.value.file);
        if (!(yield* fs.exists(at)))
          return yield* BoardFileUnknown.make({
            film,
            file,
            reason: 'not in this checkout (the images are git-ignored: copy the board folder here)',
          });
        return at;
      });

      const problems = Effect.fn('BoardStore.problems')(function* (film: FilmName) {
        const dir = paths(film).folder;
        return yield* Effect.forEach(
          boardFiles(yield* read(film)),
          (f) =>
            Effect.gen(function* () {
              const at = path.join(dir, f.file);
              if (!(yield* fs.exists(at)))
                return Option.some<BoardFileProblem>({ file: f.file, problem: 'missing' });
              const bytes = yield* fs.readFile(at);
              return Bool.match(sha256Hex(bytes) === f.sha256, {
                onTrue: () => Option.none<BoardFileProblem>(),
                onFalse: () => Option.some<BoardFileProblem>({ file: f.file, problem: 'changed' }),
              });
            }),
          { concurrency: 8 },
        ).pipe(Effect.map(Arr.getSomes));
      });

      return BoardStore.of({ paths, read, transact, modify, put, image, problems });
    }),
  );
}
