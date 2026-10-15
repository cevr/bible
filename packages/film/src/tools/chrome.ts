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
//
// Every Chrome is silent (`chromeArgs`): no page a tool or test opens is
// listened to (a render mixes and encodes its sound offline), and a headless
// Chrome otherwise plays its pages' sound out of the host's speakers.
//
// Every Chrome keeps its profile in a folder of its own, removed when its
// process exits (`chrome-profile.ts`).

import { Config, Effect, FileSystem, Option, Order, Path, Schema, type Scope } from 'effect';
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

/** The process's first view: Chrome spawned from the first executable found. */
const firstView = (argv: ReadonlyArray<string>, options: ViewOptions) =>
  Effect.gen(function* () {
    const profile = yield* profileFolder(PROFILE_ROOT);
    const named = yield* Config.option(Config.String('BUN_CHROME_PATH')).pipe(Effect.orDie);
    if (Option.isSome(named))
      return yield* Effect.flatMap(spawnView(named, argv, profile, options), (view) =>
        Effect.fromOption(view, () => BrowserMissing.make({ executable: named.value })),
      );
    const found = yield* spawnView(Option.none(), argv, profile, options);
    if (Option.isSome(found)) return found.value;
    const cached = yield* playwrightChromium;
    const view = yield* Option.match(cached, {
      onNone: () => Effect.succeed(Option.none<Bun.WebView>()),
      onSome: (file) => spawnView(Option.some(file), argv, profile, options),
    });
    return yield* Effect.fromOption(view, () =>
      BrowserMissing.make({ executable: Option.getOrElse(cached, () => 'Chrome or Chromium') }),
    );
  });

/**
 * A view (a tab of this process's Chrome) as `options` say, closed with the scope.
 * The first view spawns Chrome with `requested` (`chromeArgs`: muted); a
 * later one asking for other flags fails, since the running Chrome cannot
 * take them.
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
