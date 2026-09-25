// Headless Chromium, as a service: the Playwright glue, and nothing else.
// The browser is launched when the layer is built and closed when its scope
// closes; each page lives in the scope that opened it. Everything the film does
// wrong in a page arrives as a typed failure: an uncaught error (`pageerror`)
// is `PageError`, a dead renderer process is `PageCrashed`.

import {
  Array as Arr,
  Context,
  Deferred,
  Duration,
  Effect,
  Layer,
  Option,
  Path,
  Schema,
  type Scope,
} from 'effect';
import { type Page, chromium } from 'playwright-core';
import { ExportInfo } from '../core/schema.ts';
import {
  BrowserFailed,
  BrowserMissing,
  FrameFailed,
  PageCrashed,
  PageError,
  PageLoadFailed,
} from './errors.ts';

export type FrameFormat = 'image/png' | 'image/jpeg';

/** One player page in export mode. */
export interface FramePage {
  readonly info: ExportInfo;
  /** Draw frame `i` and return it encoded. */
  readonly frame: (
    i: number,
    format: FrameFormat,
  ) => Effect.Effect<Uint8Array, PageError | PageCrashed | FrameFailed>;
}

export type PageOpenError = PageLoadFailed | PageError | PageCrashed | BrowserFailed;

export interface BrowserService {
  /** Open the player at `url` and wait for its export handle; the page closes with the scope. */
  readonly open: (url: string) => Effect.Effect<FramePage, PageOpenError, Scope.Scope>;
}

/** How long the player may take to load its fonts and film. */
const LOAD_TIMEOUT_MS = 60_000;
/** A frame that takes longer than this has hung. */
const FRAME_TIMEOUT = Duration.minutes(2);
/** A failed call waits this long for the crash or page error that explains it. */
const SETTLE = Duration.seconds(1);

/** Playwright's own installer, run with Bun, for the error that says how to get a browser. */
const installCommand = Effect.gen(function* () {
  const path = yield* Path.Path;
  const pkg = yield* path.fromFileUrl(new URL(import.meta.resolve('playwright-core/package.json')));
  return `bun ${path.join(path.dirname(pkg), 'cli.js')} install chromium-headless-shell`;
}).pipe(Effect.orElseSucceed(() => 'bunx playwright-core install chromium-headless-shell'));

/** Playwright reports a missing browser only in its message; this is the one place it is read. */
const MISSING = /Executable doesn't exist at (\S+)/;

const launch = Effect.gen(function* () {
  const install = yield* installCommand;
  return yield* Effect.tryPromise({
    try: () =>
      chromium.launch({
        args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'],
        // The scope closes the browser; Playwright must not race it on a signal.
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
      }),
    catch: (cause) => {
      const reason = String(cause);
      return Option.match(
        Option.flatMap(Option.fromNullishOr(MISSING.exec(reason)), (m) => Arr.get(m, 1)),
        {
          onNone: () => BrowserFailed.make({ reason }),
          onSome: (executable) => BrowserMissing.make({ executable, install }),
        },
      );
    },
  });
});

const openPage = (page: Page, url: string) =>
  Effect.gen(function* () {
    const broken = yield* Deferred.make<never, PageError | PageCrashed>();
    page.on('pageerror', (error) => {
      Deferred.doneUnsafe(broken, Effect.fail(PageError.make({ reason: error.message })));
    });
    page.on('crash', () => {
      Deferred.doneUnsafe(
        broken,
        Effect.fail(PageCrashed.make({ reason: 'the renderer process died' })),
      );
    });

    /** Fail as soon as the page breaks; a failed call first waits briefly for the break that caused it. */
    const guarded = <A, E>(call: Effect.Effect<A, E>) =>
      Effect.raceFirst(
        call.pipe(
          Effect.catch((error) =>
            Effect.timeoutOrElse(Deferred.await(broken), {
              duration: SETTLE,
              orElse: () => Effect.fail(error),
            }),
          ),
        ),
        Deferred.await(broken),
      );

    const loadFailed = (cause: unknown) => PageLoadFailed.make({ url, reason: String(cause) });
    page.setDefaultTimeout(LOAD_TIMEOUT_MS);
    yield* guarded(Effect.tryPromise({ try: () => page.goto(url), catch: loadFailed }));
    yield* guarded(
      Effect.tryPromise({
        try: () => page.waitForFunction(() => window.__film),
        catch: loadFailed,
      }),
    );
    const reported = yield* guarded(
      Effect.tryPromise({
        try: () =>
          page.evaluate(() => {
            const film = window.__film;
            return (
              film && {
                width: film.width,
                height: film.height,
                fps: film.fps,
                duration: film.duration,
                frames: film.frames,
                audio: film.audio,
              }
            );
          }),
        catch: loadFailed,
      }),
    );
    const info = yield* Schema.decodeUnknownEffect(ExportInfo)(reported).pipe(
      Effect.mapError((error) => PageLoadFailed.make({ url, reason: error.message })),
    );

    const frame = (i: number, format: FrameFormat) =>
      guarded(
        Effect.tryPromise({
          try: () =>
            page.evaluate(([n, type]) => window.__film?.frame(n, type), [i, format] satisfies [
              number,
              FrameFormat,
            ]),
          catch: (cause) => FrameFailed.make({ frame: i, reason: String(cause) }),
        }).pipe(
          Effect.timeoutOrElse({
            duration: FRAME_TIMEOUT,
            orElse: () => Effect.fail(FrameFailed.make({ frame: i, reason: 'timed out' })),
          }),
        ),
      ).pipe(
        Effect.flatMap((encoded) =>
          Option.match(Option.fromNullishOr(encoded), {
            onNone: () =>
              Effect.fail(FrameFailed.make({ frame: i, reason: 'the export handle is gone' })),
            onSome: (base64) => Effect.succeed(Uint8Array.fromBase64(base64)),
          }),
        ),
      );

    return { info, frame } satisfies FramePage;
  });

export class Browser extends Context.Service<Browser, BrowserService>()(
  '@bible/film/tools/Browser',
) {
  /** Headless Chromium through Playwright, closed when the layer's scope closes. */
  static readonly layer = Layer.effect(
    Browser,
    Effect.gen(function* () {
      const browser = yield* Effect.acquireRelease(launch, (b) =>
        Effect.ignore(Effect.tryPromise(() => b.close())),
      );
      const open = Effect.fn('Browser.open')(function* (url: string) {
        const page = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () =>
              browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }),
            catch: (cause) => BrowserFailed.make({ reason: String(cause) }),
          }),
          (p) => Effect.ignore(Effect.tryPromise(() => p.close())),
        );
        return yield* openPage(page, url);
      });
      return Browser.of({ open });
    }),
  );
}
