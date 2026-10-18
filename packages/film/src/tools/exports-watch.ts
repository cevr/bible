// The lab's watch on the workspace's package exports. The lab rebuilds its
// pages when a source changes, but the bundler resolves a package's
// subpaths (`@bible/film/style`) by the `exports` map the process read at
// start: one a merge adds while the lab runs would fail every page ("Could
// not resolve"). So the lab reads each workspace `package.json`'s `exports`
// map every few seconds, and when one changes it ends (`ExportsChanged`):
// its scope closes (the servers, the easel's Chrome), and `film lab` starts
// itself again in the same process (`Relaunch`, made in `relaunch-bun.ts`),
// reading the new maps.

import {
  Array as Arr,
  Context,
  Duration,
  Effect,
  FileSystem,
  Option,
  Path,
  Schedule,
  Schema,
} from 'effect';

/** A workspace package's `exports` map changed while the lab ran: the lab starts again to resolve it. */
export class ExportsChanged extends Schema.TaggedError<ExportsChanged>()('ExportsChanged', {
  /** The `package.json` files whose `exports` changed, relative to the workspace's root. */
  files: Schema.Array(Schema.String),
}) {
  override get message() {
    return `the exports of ${this.files.join(', ')} changed: the lab starts again to resolve them`;
  }
}

/** How often the lab reads the exports maps. */
const EXPORTS_EVERY = Duration.seconds(3);

/** A package.json as the watch reads it: its workspaces (the root's), its exports (any shape). */
const PackageJson = Schema.fromJsonString(
  Schema.Struct({
    workspaces: Schema.optionalKey(Schema.Array(Schema.String)),
    exports: Schema.optionalKey(Schema.Json),
  }),
);
const readPackage = Schema.decodeUnknownOption(PackageJson);
const writeJson = Schema.encodeUnknownOption(Schema.fromJsonString(Schema.Json));

/** The `exports` map of a package.json's text, as text a change is seen in: none when it has none or does not read. */
const exportsOf = (text: string): Option.Option<string> =>
  Option.flatMap(
    Option.flatMap(readPackage(text), (p) => Option.fromUndefinedOr(p.exports)),
    writeJson,
  );

/** What the watch reads: each package.json's `exports`, by its file. */
type Exports = ReadonlyMap<string, Option.Option<string>>;

/**
 * The workspace's package.json files under `root`: its own, and each one its
 * `workspaces` patterns (`packages/*`) name, in order.
 */
const workspacePackages = Effect.fn('exports.packages')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const own = path.join(root, 'package.json');
  const text = yield* fs.readFileString(own);
  const patterns = Option.getOrElse(
    Option.flatMap(readPackage(text), (p) => Option.fromUndefinedOr(p.workspaces)),
    () => [],
  );
  const named = yield* Effect.forEach(patterns, (pattern) => {
    // A folder of packages (`packages/*`), or one package by its folder.
    const dir = path.join(root, pattern.replace(/\/\*$/, ''));
    if (!pattern.endsWith('/*')) return Effect.succeed([path.join(dir, 'package.json')]);
    return fs.readDirectory(dir).pipe(
      Effect.map((names) => names.toSorted().map((n) => path.join(dir, n, 'package.json'))),
      Effect.orElseSucceed((): ReadonlyArray<string> => []),
    );
  });
  const files = yield* Effect.filter(named.flat(), (f) =>
    fs.exists(f).pipe(Effect.orElseSucceed(() => false)),
  );
  return [own, ...files];
});

/** Each of `files`' exports as it reads now: none for a file that does not read. */
const readExports = (files: ReadonlyArray<string>) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    Effect.map(
      Effect.forEach(files, (file) =>
        fs.readFileString(file).pipe(
          Effect.map((text) => [file, exportsOf(text)] as const),
          Effect.orElseSucceed(() => [file, Option.none<string>()] as const),
        ),
      ),
      (read): Exports => new Map(read),
    ),
  );

/** The files whose exports differ between `was` and `now`. */
const changedIn = (was: Exports, now: Exports): ReadonlyArray<string> =>
  Arr.filter([...now.keys()], (file) => {
    const said = (m: Exports) =>
      Option.getOrElse(Option.flatten(Option.fromUndefinedOr(m.get(file))), () => '');
    return said(was) !== said(now);
  });

/**
 * Read the exports of the workspace under `root` every `every`, and fail
 * with `ExportsChanged` once one differs from what it read first. Never
 * succeeds: run beside the lab, it ends it.
 */
export const watchExports = Effect.fn('exports.watch')(function* (
  root: string,
  every: Duration.Input = EXPORTS_EVERY,
) {
  const path = yield* Path.Path;
  const files = yield* workspacePackages(root);
  const first = yield* readExports(files);
  yield* Effect.log(`[lab] exports.watch files=${files.length}`);
  const pass = Effect.gen(function* () {
    const changed = changedIn(first, yield* readExports(files));
    if (changed.length === 0) return;
    return yield* ExportsChanged.make({ files: changed.map((f) => path.relative(root, f)) });
  });
  return yield* pass.pipe(Effect.repeat(Schedule.spaced(every)), Effect.andThen(Effect.never));
});

/**
 * The workspace's root above `from`: the nearest folder whose package.json
 * names `workspaces`; none when there is none.
 */
export const workspaceRoot = Effect.fn('exports.root')(function* (from: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let dir = path.resolve(from);
  for (;;) {
    const text = yield* fs
      .readFileString(path.join(dir, 'package.json'))
      .pipe(Effect.orElseSucceed(() => ''));
    if (
      Option.exists(readPackage(text), (p) => Option.isSome(Option.fromUndefinedOr(p.workspaces)))
    )
      return Option.some(dir);
    const up = path.dirname(dir);
    if (up === dir) return Option.none<string>();
    dir = up;
  }
});

interface RelaunchService {
  /** Start this command again in this process, as it was started (its arguments and environment). */
  readonly relaunch: (why: string) => Effect.Effect<never>;
}

/** The lab started again in its own process (`relaunch-bun.ts` makes it). */
export class Relaunch extends Context.Service<Relaunch, RelaunchService>()(
  '@bible/film/tools/Relaunch',
) {}
