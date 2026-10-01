// Chrome, through Bun.WebView: the one way the film tools and their browser
// tests open a page. Bun spawns one Chrome per process, over a DevTools pipe,
// with the flags of the first view it opens; every later view is a tab of
// that Chrome. So a process names its flags once: a view asked for with other
// flags than the running Chrome's fails (`BrowserFailed`) rather than run
// without them.
//
// The executable: `BUN_CHROME_PATH` when set, else the Chrome or Chromium
// Bun finds in the usual places, else the newest Chromium a Playwright
// install left in `~/.cache/ms-playwright`. None of them: `BrowserMissing`,
// which names `BUN_CHROME_PATH`.

import { Config, Effect, FileSystem, Option, Order, Path, type Scope } from 'effect';
import { BrowserFailed, BrowserMissing } from './errors.ts';

/** A view's viewport, and where the page's `console.*` calls go (dropped when not given). */
interface ViewOptions {
  readonly width: number;
  readonly height: number;
  readonly console?: (type: string, ...args: ReadonlyArray<unknown>) => void;
}

/** The flags this process's Chrome was spawned with, once its first view opened. */
let spawned: Option.Option<string> = Option.none();

/** Bun's code for a Chrome it could not spawn: no executable where it looked. */
const SPAWN_FAILED = 'ERR_DLOPEN_FAILED';

/** Chromium's executable inside one of Playwright's `chromium-<revision>` folders, per platform. */
const PLAYWRIGHT_BINARIES = [
  'chrome-linux64/chrome',
  'chrome-linux/chrome',
  'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
];

const byRevision = Order.mapInput(Order.Number, (name: string) => Number(name.slice(9)));

/** The newest Chromium under `~/.cache/ms-playwright`, when there is one. */
const playwrightChromium = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cache = path.join(yield* Config.String('HOME'), '.cache', 'ms-playwright');
  const revisions = (yield* fs.readDirectory(cache))
    .filter((name) => /^chromium-\d+$/.test(name))
    .toSorted(Order.flip(byRevision));
  return yield* Effect.findFirst(
    revisions.flatMap((revision) =>
      PLAYWRIGHT_BINARIES.map((binary) => path.join(cache, revision, binary)),
    ),
    (file) => fs.exists(file),
  );
}).pipe(Effect.orElseSucceed(() => Option.none<string>()));

/** A view with `argv` of Chrome at `path` (where Bun looks, when none); `None` when no Chrome was there. */
const spawnView = (
  path: Option.Option<string>,
  argv: ReadonlyArray<string>,
  options: ViewOptions,
) =>
  Effect.try({
    try: () =>
      Option.some(
        new Bun.WebView({
          ...options,
          backend: {
            type: 'chrome',
            // Never a Chrome someone left running with remote debugging: always one of ours.
            url: false,
            ...Option.match(path, { onNone: () => ({}), onSome: (p) => ({ path: p }) }),
            argv: [...argv],
          },
        }),
      ),
    catch: (cause) => ({
      missing: Reflect.get(Object(cause), 'code') === SPAWN_FAILED,
      failed: BrowserFailed.make({ reason: String(cause) }),
    }),
  }).pipe(
    Effect.catch((spawn) => {
      if (spawn.missing) return Effect.succeedNone;
      return Effect.fail(spawn.failed);
    }),
  );

/** The process's first view: Chrome spawned from the first executable found. */
const firstView = (argv: ReadonlyArray<string>, options: ViewOptions) =>
  Effect.gen(function* () {
    const named = yield* Config.option(Config.String('BUN_CHROME_PATH')).pipe(Effect.orDie);
    if (Option.isSome(named))
      return yield* Effect.flatMap(spawnView(named, argv, options), (view) =>
        Effect.fromOption(view, () => BrowserMissing.make({ executable: named.value })),
      );
    const found = yield* spawnView(Option.none(), argv, options);
    if (Option.isSome(found)) return found.value;
    const cached = yield* playwrightChromium;
    const view = yield* Option.match(cached, {
      onNone: () => Effect.succeed(Option.none<Bun.WebView>()),
      onSome: (file) => spawnView(Option.some(file), argv, options),
    });
    return yield* Effect.fromOption(view, () =>
      BrowserMissing.make({ executable: Option.getOrElse(cached, () => 'Chrome or Chromium') }),
    );
  });

/**
 * A view (a tab of this process's Chrome) as `options` say, closed with the scope.
 * The first view spawns Chrome with `argv`; a later one asking for other
 * flags fails, since the running Chrome cannot take them.
 */
export const openView = (
  argv: ReadonlyArray<string>,
  options: ViewOptions,
): Effect.Effect<
  Bun.WebView,
  BrowserMissing | BrowserFailed,
  Scope.Scope | FileSystem.FileSystem | Path.Path
> => {
  const flags = argv.join(' ');
  return Effect.acquireRelease(
    Effect.suspend(() =>
      Option.match(spawned, {
        onNone: () =>
          Effect.tap(firstView(argv, options), () =>
            Effect.sync(() => {
              spawned = Option.some(flags);
            }),
          ),
        onSome: (running) => {
          if (running !== flags)
            return Effect.fail(
              BrowserFailed.make({
                reason: `this process's Chrome runs with "${running}", not "${flags}": Bun spawns one Chrome per process`,
              }),
            );
          return Effect.sync(
            () =>
              new Bun.WebView({
                ...options,
                backend: { type: 'chrome', url: false, argv: [...argv] },
              }),
          );
        },
      }),
    ),
    (view) => Effect.sync(() => view.close()),
  );
};
