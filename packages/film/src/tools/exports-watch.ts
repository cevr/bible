// The lab's watch on the workspace's package exports. The lab rebuilds its
// pages when a source changes, but the bundler resolves a package's
// subpaths (`@bible/film/style`) by the `exports` map the process read at
// start: one a merge adds while the lab runs would fail every page ("Could
// not resolve"). So the lab reads each workspace `package.json`'s `exports`
// map as it starts, and again every few seconds, and when one changes it ends
// (`ExportsChanged`): `relaunchOnExportsChange` closes what the lab holds
// (its servers, then its pages), then `Relaunch` (made in `relaunch-bun.ts`)
// ends their Chrome and starts `film lab` again in the same process, which
// reads the new maps.

import {
  Array as Arr,
  Context,
  Duration,
  Effect,
  FileSystem,
  type Layer,
  Option,
  Path,
  Schedule,
  Schema,
} from 'effect';

/** A workspace package's `exports` map changed while the lab ran: the lab starts again to resolve it. */
class ExportsChanged extends Schema.TaggedError<ExportsChanged>()('ExportsChanged', {
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

/** The `exports` map of a package.json's text, as text a change is seen in: none when it has none. */
const exportsOf = (pkg: { readonly exports?: Schema.Json }): Option.Option<string> =>
  Option.flatMap(Option.fromUndefinedOr(pkg.exports), writeJson);

/** What the watch holds each read to: each package.json's `exports`, by its file. */
type Exports = ReadonlyMap<string, Option.Option<string>>;

/** How long the watch waits to read a package.json again that did not read or parse. */
const AGAIN = Duration.millis(250);

/**
 * A package.json's `exports` as it reads now: none when the file does not
 * read or does not parse (a checkout may be between its unlink and its write),
 * some none when it names no exports.
 */
const readOne = (file: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.readFileString(file).pipe(
      Effect.map((text) => Option.map(readPackage(text), exportsOf)),
      Effect.orElseSucceed(() => Option.none<Option.Option<string>>()),
    ),
  );

/** `readOne`, read once more after `AGAIN` when it does not read. */
const readSettled = (file: string) =>
  Effect.flatMap(readOne(file), (read) =>
    Option.match(read, {
      onSome: () => Effect.succeed(read),
      onNone: () => Effect.andThen(Effect.sleep(AGAIN), readOne(file)),
    }),
  );

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

/** Each of `files`' exports as it reads now: none for a file that does not read, twice. */
const readExports = (files: ReadonlyArray<string>) =>
  Effect.map(
    Effect.forEach(files, (file) => Effect.map(readSettled(file), (read) => [file, read] as const)),
    (read) => new Map(read),
  );

/**
 * The files whose exports read now and differ from `was`. A file that does
 * not read keeps what it said: a checkout writing it changes nothing.
 */
const changedIn = (
  was: Exports,
  now: ReadonlyMap<string, Option.Option<Option.Option<string>>>,
): ReadonlyArray<string> =>
  Arr.filter([...now.keys()], (file) => {
    const said = (exports: Option.Option<string>) => Option.getOrElse(exports, () => '');
    const before = said(Option.flatten(Option.fromUndefinedOr(was.get(file))));
    return Option.exists(
      Option.flatten(Option.fromUndefinedOr(now.get(file))),
      (read) => said(read) !== before,
    );
  });

/** A workspace's exports as read once: its root, its package.json files, and each one's exports then. */
interface ExportsRead {
  readonly root: string;
  readonly files: ReadonlyArray<string>;
  readonly first: Exports;
}

/** Read the exports of the workspace under `root` now: what `watchExports` holds each later read to. */
export const exportsNow = Effect.fn('exports.now')(function* (root: string) {
  const files = yield* workspacePackages(root);
  // A file that does not read at start holds no exports: what the bundler resolved by.
  const read = yield* readExports(files);
  const first: Exports = new Map(Arr.map([...read], ([file, r]) => [file, Option.flatten(r)]));
  yield* Effect.log(`[lab] exports.watch files=${files.length}`);
  return { root, files, first } satisfies ExportsRead;
});

/**
 * Read the exports `read` names every `every`, and fail with
 * `ExportsChanged` once one differs from what `read` holds. Never succeeds:
 * run beside the lab, it ends it. `read` taken before the lab starts, a
 * merge that lands while it starts is seen.
 */
export const watchExports = Effect.fn('exports.watch')(function* (
  read: ExportsRead,
  every: Duration.Input = EXPORTS_EVERY,
) {
  const path = yield* Path.Path;
  const pass = Effect.gen(function* () {
    const changed = changedIn(read.first, yield* readExports(read.files));
    if (changed.length === 0) return;
    return yield* ExportsChanged.make({ files: changed.map((f) => path.relative(read.root, f)) });
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

/** Whether a failure is the exports watch ending the lab. */
const isExportsChanged = Schema.is(ExportsChanged);

/**
 * `lab` with `held` (what it holds for its run: its pages) built for it
 * alone. Once its exports watch ends it, the scope `lab` opened and `held`
 * are closed, and then `Relaunch` ends their Chrome and starts the command
 * again.
 */
export const relaunchOnExportsChange = <A, E, R, ROut, E2, RIn>(
  lab: Effect.Effect<A, E | ExportsChanged, R>,
  held: Layer.Layer<ROut, E2, RIn>,
) =>
  lab.pipe(
    Effect.scoped,
    Effect.provide(held),
    Effect.catchIf(isExportsChanged, (changed) =>
      Effect.flatMap(Relaunch, (r) => r.relaunch(changed.message)),
    ),
  );
