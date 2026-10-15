// The checkouts of this repository on this machine, so the lab's review sees
// the renders of each (`checkoutRoots`, cli.ts). A checkout is a folder whose
// root `package.json` names the same package as this one's: the folders
// beside it (worktrees, or the Rifts beside a Rift), and, for the warm source
// (`<p>/<repo>`), its Rifts (`<p>/.rifts/<repo>/<rift>`). A Rift's lab leaves
// its warm source out, and a git worktree's lab the checkout it was made from
// (git's main worktree), in every layout: a source is only read, and a say
// on a set writes its catalogue. A folder's name says nothing.

import type { ReviewRoot } from '@bible/film/tools';
import { Effect, FileSystem, Match, Option, Path, Schema } from 'effect';

/** The one field of a root `package.json` a checkout is known by. */
const RootPackage = Schema.fromJsonString(Schema.Struct({ name: Schema.String }));

/** The package `dir`'s root `package.json` names; none without a readable one. */
const packageName = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const text = yield* fs.readFileString(path.join(dir, 'package.json'));
    return (yield* Schema.decodeEffect(RootPackage)(text)).name;
  }).pipe(Effect.option);

/** The folders in `dir`, as paths; none when it cannot be read. */
const foldersIn = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
    return names.map((name) => path.join(dir, name));
  });

/**
 * The checkout `dir` was made from when it is a git worktree of another
 * (`git worktree add`): git's main worktree, the folder holding the common
 * git folder its `.git` file's `gitdir` names (by that folder's
 * `commondir`), by its real path; none for a main worktree or a Rift,
 * whose `.git` is a folder.
 */
const sourceOf = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const link = yield* fs.readFileString(path.join(dir, '.git'));
    const admin = path.resolve(
      dir,
      yield* Effect.fromOption(Option.fromNullishOr(/^gitdir: (.+)$/m.exec(link)?.[1])),
    );
    const common = path.resolve(
      admin,
      (yield* fs.readFileString(path.join(admin, 'commondir'))).trim(),
    );
    return yield* fs.realPath(path.dirname(common));
  }).pipe(Effect.option);

/**
 * The renders (`apps/animations/out`) of every checkout of the repository at
 * `repo` that has some, this one's included, each labelled by its folder's
 * name, sorted by it. The checkout `repo` was made from (`sourceOf`) is left
 * out: a say on a set writes its catalogue, and the source is never written
 * from a worktree of it.
 */
export const checkoutRootsOf = (repo: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const name = yield* packageName(repo);
    if (Option.isNone(name)) return [];
    const parent = path.dirname(repo);
    const inRift = path.basename(path.dirname(parent)) === '.rifts';
    const elsewhere = yield* Match.value(inRift).pipe(
      // A Rift's warm source stays out: it is read, never written, and a say writes.
      Match.when(true, () => Effect.succeed([])),
      Match.orElse(() => foldersIn(path.join(parent, '.rifts', path.basename(repo)))),
    );
    const candidates = [...new Set([...(yield* foldersIn(parent)), ...elsewhere])];
    const source = yield* sourceOf(repo);
    const isSource = (dir: string) =>
      Effect.map(fs.realPath(dir).pipe(Effect.option), (real) =>
        Option.exists(source, (made) => Option.contains(real, made)),
      );
    const checkouts = yield* Effect.filter(candidates, (dir) =>
      Effect.zipWith(
        packageName(dir),
        isSource(dir),
        (named, left) => !left && Option.exists(named, (n) => n === name.value),
      ),
    );
    const roots = checkouts
      .map((dir): ReviewRoot => ({
        label: path.basename(dir),
        path: path.join(dir, 'apps', 'animations', 'out'),
      }))
      .toSorted((a, b) => a.label.localeCompare(b.label));
    return yield* Effect.filter(roots, (root) =>
      fs.exists(root.path).pipe(Effect.orElseSucceed(() => false)),
    );
  });
