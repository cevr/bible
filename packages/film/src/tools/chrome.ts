// Chrome, through Bun.WebView: the one way the film tools and their browser
// tests open a page. Bun spawns one Chrome per process, over a DevTools pipe,
// with the flags of the first view it opens; every later view is a tab of
// that Chrome. So a process names its flags once: a view asked for with other
// flags than the running Chrome's fails (`BrowserFailed`) rather than run
// without them.
//
// The executable: `BUN_CHROME_PATH` when set, else the Chrome or Chromium
// Bun finds where it looks, else the newest Chromium a Playwright install
// left in its cache. None of them: `BrowserMissing`, which names
// `BUN_CHROME_PATH`.
//
// On macOS a Chrome whose flags ask for the GPU (`GPU_FLAG`) is spawned
// through the GPU launcher (`chrome-gpu.ts`), written into its profile, which
// drops the `--disable-gpu` Bun spawns every Chrome with and execs the Chrome
// found as above: Bun's own search is run here for it (`bunSearch`), since
// Bun is told the launcher's path instead.
//
// Every view names the first view's executable and profile, so a Chrome Bun
// spawns again (the first one died) is spawned as the first one was.
//
// Every Chrome is silent (`chromeArgs`): no page a tool or test opens is
// listened to (a render mixes and encodes its sound offline), and a headless
// Chrome otherwise plays its pages' sound out of the host's speakers.
//
// Every Chrome keeps its profile in a folder of its own, removed when its
// process exits (`chrome-profile.ts`).

import {
  Config,
  Effect,
  FileSystem,
  Match,
  Option,
  Order,
  Path,
  Schema,
  type Scope,
  Semaphore,
} from 'effect';
import { gpuLauncher, throughGpuLauncher } from './chrome-gpu.ts';
import { PROFILE_ROOT, profileFolder } from './chrome-profile.ts';
import { BrowserFailed, BrowserMissing } from './errors.ts';

/**
 * The flags a Chrome is spawned with: the caller's, after the two that keep
 * it silent. `--mute-audio` mutes its pages; `--disable-audio-output` plays
 * what they would play to a fake device, so Chrome never opens the host's
 * output at all (muted alone, it still held it, playing silence). A page's
 * audio still runs: its `AudioContext` keeps time on the fake device's clock
 * as on a real one, decodes and processes, and a microphone is heard. A host
 * with no output device (a Linux server) ran on that fake device already.
 */
const chromeArgs = (argv: ReadonlyArray<string>): ReadonlyArray<string> => [
  '--mute-audio',
  '--disable-audio-output',
  ...argv,
];

/** The GPU launcher's file in a Chrome's profile folder. */
const LAUNCHER = 'film-gpu-launcher';

/** A view's viewport, and where the page's `console.*` calls go (dropped when not given). */
interface ViewOptions {
  readonly width: number;
  readonly height: number;
  readonly console?: (type: string, ...args: ReadonlyArray<unknown>) => void;
}

/**
 * How this process's Chrome was spawned: its flags, the executable Bun was
 * told (`None`: Bun's own search) and its profile folder.
 */
interface Spawned {
  readonly flags: string;
  readonly path: Option.Option<string>;
  readonly profile: string;
}

/** This process's Chrome, once its first view opened. */
let spawned: Option.Option<Spawned> = Option.none();

/** One view opens at a time, so views asked for at once wait for the one that spawns Chrome. */
const opening = Semaphore.makeUnsafe(1);

/** Bun's code for a Chrome it could not spawn: no executable where it looked. */
const SPAWN_FAILED = 'ERR_DLOPEN_FAILED';

/**
 * The names Bun 1.4.3 looks for on `$PATH`, in its order (its
 * `ChromeProcess.rs`, `find_chrome`).
 */
const PATH_BROWSERS = [
  'google-chrome-stable',
  'google-chrome',
  'chromium-browser',
  'chromium',
  'brave-browser',
  'microsoft-edge',
  'chrome',
];

/** The app bundles Bun 1.4.3 looks for on macOS, each in `/Applications`, then in `~/Applications`. */
const MAC_BROWSERS = [
  'Google Chrome.app/Contents/MacOS/Google Chrome',
  'Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  'Chromium.app/Contents/MacOS/Chromium',
  'Brave Browser.app/Contents/MacOS/Brave Browser',
  'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

/** The headless shell inside its Playwright revision for CPU `arch`, as Bun 1.4.3 names it on macOS (none for another CPU). */
const macShell = (arch: string): ReadonlyArray<string> =>
  Match.value(arch).pipe(
    Match.when(
      (cpu) => cpu === 'arm64' || cpu === 'x64',
      (cpu) => [`chrome-headless-shell-mac-${cpu}/chrome-headless-shell`],
    ),
    Match.orElse(() => []),
  );

/** Playwright's browser caches under the home folder: Linux's, then macOS's. */
const PLAYWRIGHT_CACHES = [
  ['.cache', 'ms-playwright'],
  ['Library', 'Caches', 'ms-playwright'],
];

/** Chromium's executable inside one of Playwright's `chromium-<revision>` folders, per platform. */
const PLAYWRIGHT_BINARIES = [
  'chrome-linux64/chrome',
  'chrome-linux/chrome',
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
];

/** The newest `<prefix><revision>` folder's binary in Playwright's cache `cache`, the first of `binaries` there. */
const newestIn = (cache: string, prefix: string, binaries: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const byRevision = Order.mapInput(Order.Number, (name: string) =>
      Number(name.slice(prefix.length)),
    );
    const revisions = (yield* fs.readDirectory(cache))
      .filter((name) => name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)))
      .toSorted(Order.flip(byRevision));
    return yield* Effect.findFirst(
      revisions.flatMap((revision) => binaries.map((binary) => path.join(cache, revision, binary))),
      (file) => fs.exists(file),
    );
  }).pipe(Effect.orElseSucceed(() => Option.none<string>()));

/** The first of `effects` to find a file. */
const firstFound = (
  effects: ReadonlyArray<
    Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path>
  >,
) =>
  Effect.reduce(
    effects,
    () => Option.none<string>(),
    (found, next) =>
      Option.match(found, { onSome: () => Effect.succeed(found), onNone: () => next }),
  );

/** The newest Chromium a Playwright install left in its cache, when there is one. */
const playwrightChromium = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = yield* Config.String('HOME');
  return yield* firstFound(
    PLAYWRIGHT_CACHES.map((cache) =>
      newestIn(path.join(home, ...cache), 'chromium-', PLAYWRIGHT_BINARIES),
    ),
  );
}).pipe(Effect.orElseSucceed(() => Option.none<string>()));

/** The first of `files` that exists, when one does. */
const existing = (files: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* Effect.findFirst(files, (file) => fs.exists(file));
  }).pipe(Effect.orElseSucceed(() => Option.none<string>()));

/**
 * The Chrome Bun 1.4.3 finds on macOS, searched as it searches
 * (`ChromeProcess.rs`, `find_chrome`): the first of `PATH_BROWSERS` on
 * `$PATH`, else the first of `MAC_BROWSERS` in `/Applications` or
 * `~/Applications`, else the newest headless shell in Playwright's cache.
 */
const bunSearch = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = yield* Config.String('HOME');
  const search = yield* Config.String('PATH').pipe(Config.withDefault(''));
  const folders = ['/Applications', path.join(home, 'Applications')];
  return yield* firstFound([
    Effect.sync(() =>
      Option.firstSomeOf(
        PATH_BROWSERS.map((name) => Option.fromNullishOr(Bun.which(name, { PATH: search }))),
      ),
    ),
    existing(
      MAC_BROWSERS.flatMap((browser) => folders.map((folder) => path.join(folder, browser))),
    ),
    newestIn(
      path.join(home, 'Library', 'Caches', 'ms-playwright'),
      'chromium_headless_shell-',
      macShell(process.arch),
    ),
  ]);
}).pipe(Effect.orElseSucceed(() => Option.none<string>()));

/** A view with `argv` of Chrome at `path` (where Bun looks, when none), its profile in `profile`; `None` when no Chrome was there. */
const spawnView = (
  path: Option.Option<string>,
  argv: ReadonlyArray<string>,
  profile: string,
  options: ViewOptions,
) =>
  Effect.try({
    try: () =>
      Option.some(
        new Bun.WebView({
          ...options,
          dataStore: { directory: profile },
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

/** A view, and the executable Bun was told to spawn its Chrome from (`None`: Bun's own search). */
interface FirstView {
  readonly view: Bun.WebView;
  readonly path: Option.Option<string>;
}

/**
 * The process's first view, of a Chrome that runs its GPU: the Chrome named,
 * else the one Bun would find (`bunSearch`), else Playwright's Chromium,
 * spawned through the GPU launcher, written into the profile whole and
 * renamed into place.
 */
const gpuView = (
  named: Option.Option<string>,
  argv: ReadonlyArray<string>,
  profile: string,
  options: ViewOptions,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const chrome = yield* Option.match(named, {
      onSome: (file) => existing([file]),
      onNone: () => firstFound([bunSearch, playwrightChromium]),
    });
    const file = yield* Effect.fromOption(chrome, () =>
      BrowserMissing.make({ executable: Option.getOrElse(named, () => 'Chrome or Chromium') }),
    );
    const launcher = path.join(profile, LAUNCHER);
    const written = `${launcher}.${process.pid}`;
    yield* fs.writeFileString(written, gpuLauncher(file), { mode: 0o755 }).pipe(
      Effect.andThen(fs.rename(written, launcher)),
      Effect.mapError((cause) => BrowserFailed.make({ reason: String(cause) })),
    );
    const view = yield* spawnView(Option.some(launcher), argv, profile, options);
    return yield* Effect.fromOption(view, () =>
      BrowserFailed.make({
        reason: `the GPU launcher ${launcher} (for ${file}) could not be spawned: is its folder on a noexec mount?`,
      }),
    ).pipe(Effect.map((opened): FirstView => ({ view: opened, path: Option.some(launcher) })));
  });

/** The first view's Chrome, spawned from the first executable found (`named`, when one is), in `profile`. */
const chosenView = (
  named: Option.Option<string>,
  argv: ReadonlyArray<string>,
  profile: string,
  options: ViewOptions,
) =>
  Effect.gen(function* () {
    const opened = (view: Bun.WebView, path: Option.Option<string>): FirstView => ({ view, path });
    if (throughGpuLauncher(process.platform, argv))
      return yield* gpuView(named, argv, profile, options);
    if (Option.isSome(named))
      return yield* Effect.flatMap(spawnView(named, argv, profile, options), (view) =>
        Effect.fromOption(
          Option.map(view, (v) => opened(v, named)),
          () => BrowserMissing.make({ executable: named.value }),
        ),
      );
    const found = yield* spawnView(Option.none(), argv, profile, options);
    if (Option.isSome(found)) return opened(found.value, Option.none());
    const cached = yield* playwrightChromium;
    const view = yield* Option.match(cached, {
      onNone: () => Effect.succeed(Option.none<Bun.WebView>()),
      onSome: (file) => spawnView(Option.some(file), argv, profile, options),
    });
    return yield* Effect.fromOption(
      Option.map(view, (v) => opened(v, cached)),
      () =>
        BrowserMissing.make({
          executable: Option.getOrElse(cached, () => 'Chrome or Chromium'),
        }),
    );
  });

/** The process's first view: Chrome spawned from the first executable found, in a new profile. */
const firstView = (argv: ReadonlyArray<string>, options: ViewOptions) =>
  Effect.gen(function* () {
    const root = yield* Config.String('FILM_CHROME_PROFILES').pipe(
      Config.withDefault(PROFILE_ROOT),
      Effect.orDie,
    );
    const profile = yield* profileFolder(root);
    const named = yield* Config.option(Config.String('BUN_CHROME_PATH')).pipe(Effect.orDie);
    const first = yield* chosenView(named, argv, profile, options);
    return { ...first, profile };
  });

/**
 * A view (a tab of this process's Chrome) as `options` say, closed with the scope.
 * The first view spawns Chrome with `requested` (`chromeArgs`: muted); a
 * later one asking for other flags fails, since the running Chrome cannot
 * take them. Every later view names the first one's executable and profile,
 * so when Bun spawns Chrome again (the first one died) it is the same Chrome,
 * through the same launcher, in the same profile.
 */
export const openView = (
  requested: ReadonlyArray<string>,
  options: ViewOptions,
): Effect.Effect<
  Bun.WebView,
  BrowserMissing | BrowserFailed,
  Scope.Scope | FileSystem.FileSystem | Path.Path
> => {
  const argv = chromeArgs(requested);
  const flags = argv.join(' ');
  return Effect.acquireRelease(
    opening.withPermits(1)(
      Effect.suspend(() =>
        Option.match(spawned, {
          onNone: () =>
            Effect.map(firstView(argv, options), (first) => {
              spawned = Option.some({ flags, path: first.path, profile: first.profile });
              return first.view;
            }),
          onSome: (running) => {
            if (running.flags !== flags)
              return Effect.fail(
                BrowserFailed.make({
                  reason: `this process's Chrome runs with "${running.flags}", not "${flags}": Bun spawns one Chrome per process`,
                }),
              );
            return Effect.flatMap(spawnView(running.path, argv, running.profile, options), (view) =>
              Effect.fromOption(view, () =>
                BrowserMissing.make({
                  executable: Option.getOrElse(running.path, () => 'Chrome or Chromium'),
                }),
              ),
            );
          },
        }),
      ),
    ),
    (view) => Effect.sync(() => view.close()),
  );
};

/** `Runtime.exceptionThrown`'s parameters, as far as a page's error is read. */
const Thrown = Schema.Struct({
  exceptionDetails: Schema.Struct({
    text: Schema.String,
    exception: Schema.optionalKey(
      Schema.Struct({ description: Schema.optionalKey(Schema.String) }),
    ),
  }),
});

/**
 * What a page threw, from a view's `Runtime.exceptionThrown` event (with
 * `Runtime` enabled): the error as the page's console says it (`Error: boom`
 * and its stack), else the protocol's text.
 */
export const thrownBy = (event: Event): Option.Option<string> =>
  Option.map(Schema.decodeUnknownOption(Thrown)(Reflect.get(event, 'data')), (thrown) =>
    Option.getOrElse(
      Option.flatMap(Option.fromUndefinedOr(thrown.exceptionDetails.exception), (e) =>
        Option.fromUndefinedOr(e.description),
      ),
      () => thrown.exceptionDetails.text,
    ),
  );
