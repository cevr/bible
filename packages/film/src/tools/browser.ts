// Headless Chromium, as a service: the Playwright glue, and the one typed
// path every call on an export page takes (`framePage`). The browser is
// launched when the layer is built and closed when its scope closes; each
// page lives in the scope that opened it. A call names one of the handle's
// calls (`ExportCalls`, core/export-handle.ts), its answer is decoded by that
// call's schema, and its failure is that call's own error (`CALLS`). Playwright
// and the test fake (tools/testing.ts) are the two ways a call reaches a page
// (`Invoke`). Everything the film does wrong in a page arrives as a typed
// failure: an uncaught error (`pageerror`) is `PageError`, a dead renderer
// process is `PageCrashed`.

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
  Scope,
} from 'effect';
import { type Page, chromium } from 'playwright-core';
import {
  type CallAnswers,
  type CallArgs,
  type ExportCall,
  ExportAnswers,
  type LumaArea,
  type WireAnswers,
  ExportInfo,
} from '../core/export-handle.ts';
import {
  BrowserFailed,
  BrowserMissing,
  ContactFailed,
  EncodeFailed,
  EncoderMissing,
  FrameFailed,
  LookbookFailed,
  PageCrashed,
  PageError,
  PageLoadFailed,
} from './errors.ts';

/**
 * A call the page did not answer, and why: how an adapter reports it, before
 * `framePage` names it as the call's own error.
 */
export class CallRefused extends Schema.TaggedError<CallRefused>()('CallRefused', {
  reason: Schema.String,
}) {}

/** The error each call fails with, beside the page's own (`PageError`, `PageCrashed`). */
export interface CallErrors {
  readonly frame: FrameFailed;
  readonly probe: FrameFailed;
  readonly lookbook: LookbookFailed;
  readonly encoder: EncoderMissing;
  readonly encode: EncodeFailed;
  readonly contact: ContactFailed;
  readonly look: FrameFailed;
  readonly luma: FrameFailed;
  readonly drawTimes: FrameFailed;
}

/** How long a call may take, and the error its failure is, from its arguments and the reason. */
interface CallPolicy<K extends ExportCall> {
  readonly timeout: Duration.Duration;
  readonly fail: (args: CallArgs[K], reason: string) => CallErrors[K];
}

/** A frame that takes longer than this has hung. */
const FRAME_TIMEOUT = Duration.minutes(2);
/** The look-book, the contact sheet and a batch of frames draw many frames in one call. */
const SHEET_TIMEOUT = Duration.minutes(5);
/** A chunk draws and encodes a few hundred frames in one call. */
const ENCODE_TIMEOUT = Duration.minutes(5);

/** A failed batch of frames names its first. */
const batchFailed = (
  [frames]: readonly [ReadonlyArray<number>, ...ReadonlyArray<unknown>],
  reason: string,
) => FrameFailed.make({ frame: frames[0] ?? 0, reason });

/** Every call's policy, call by call. */
type CallPolicies = { readonly [K in ExportCall]: CallPolicy<K> };

const CALLS: CallPolicies = {
  frame: { timeout: FRAME_TIMEOUT, fail: ([frame], reason) => FrameFailed.make({ frame, reason }) },
  probe: { timeout: FRAME_TIMEOUT, fail: ([frame], reason) => FrameFailed.make({ frame, reason }) },
  lookbook: { timeout: SHEET_TIMEOUT, fail: (_, reason) => LookbookFailed.make({ reason }) },
  encoder: { timeout: FRAME_TIMEOUT, fail: (_, reason) => EncoderMissing.make({ reason }) },
  encode: {
    timeout: ENCODE_TIMEOUT,
    fail: ([from, to], reason) => EncodeFailed.make({ from, to, reason }),
  },
  contact: { timeout: SHEET_TIMEOUT, fail: (_, reason) => ContactFailed.make({ reason }) },
  look: { timeout: SHEET_TIMEOUT, fail: batchFailed },
  luma: { timeout: FRAME_TIMEOUT, fail: ([frame], reason) => FrameFailed.make({ frame, reason }) },
  drawTimes: { timeout: SHEET_TIMEOUT, fail: batchFailed },
};

/**
 * How an adapter reaches a page's handle: call `name` with `args` and hand
 * back its answer as it crossed (undecoded), within `timeout`; a call the
 * page did not answer is `CallRefused`.
 */
export type Invoke = <K extends ExportCall>(
  name: K,
  args: CallArgs[K],
  timeout: Duration.Duration,
) => Effect.Effect<unknown, PageError | PageCrashed | CallRefused>;

/** One player page in export mode. */
export interface FramePage {
  readonly info: ExportInfo;
  /** The page's title: the film's (or the short's) title, as the player sets it. */
  readonly title: string;
  /** Call the export handle's `name` with `args`: its answer decoded, or the call's own error. */
  readonly call: <K extends ExportCall>(
    name: K,
    ...args: CallArgs[K]
  ) => Effect.Effect<CallAnswers[K], PageError | PageCrashed | CallErrors[K]>;
}

/** `name`'s answer schema, typed as its call's (`CallAnswers[K]`). */
const answerOf = <K extends ExportCall>(
  answers: { readonly [P in K]: Schema.Codec<CallAnswers[P], WireAnswers[P]> },
  name: K,
): Schema.Codec<CallAnswers[K], WireAnswers[K]> => answers[name];

/**
 * A page reached through `invoke`: every answer decoded by its call's schema
 * (`ExportCalls`), every failure the call's own error (`CALLS`), saying why.
 * An answer that does not decode (the handle is gone, or answered something
 * else) fails the call too.
 */
export const framePage = (info: ExportInfo, title: string, invoke: Invoke): FramePage => ({
  info,
  title,
  call: <K extends ExportCall>(name: K, ...args: CallArgs[K]) => {
    const policy: CallPolicy<K> = CALLS[name];
    const answer = answerOf(ExportAnswers, name);
    const failed = (reason: string) => policy.fail(args, reason);
    return invoke(name, args, policy.timeout).pipe(
      Effect.catchTag('CallRefused', (refused) => Effect.fail(failed(refused.reason))),
      Effect.flatMap((wire) =>
        Schema.decodeUnknownEffect(answer)(wire).pipe(
          Effect.mapError((error) => failed(`the export handle answered: ${error.message}`)),
        ),
      ),
    );
  },
});

/**
 * A frame's luma as a page hands it back: one value per cell of `area`'s
 * grid. An empty read (the page had no canvas to sample on) or a short one is
 * refused, so a loop is never compared on nothing and called clean.
 */
export const lumaGrid = (area: LumaArea) =>
  Schema.Array(Schema.Finite).check(
    Schema.makeFilter(
      (cells) =>
        cells.length === area.cols * area.rows ||
        `${cells.length} luma cells for a ${area.cols}×${area.rows} grid`,
    ),
  );

/** Frame `i`'s luma over `area` on `page` (`luma`), one value per cell of its grid (`lumaGrid`). */
export const lumaOf = (page: FramePage, i: number, area: LumaArea) =>
  page
    .call('luma', i, area)
    .pipe(
      Effect.flatMap((cells) =>
        Schema.decodeEffect(lumaGrid(area))(cells).pipe(
          Effect.mapError((error) => FrameFailed.make({ frame: i, reason: error.message })),
        ),
      ),
    );

export type PageOpenError =
  | PageLoadFailed
  | PageError
  | PageCrashed
  | BrowserFailed
  | BrowserMissing;

export interface BrowserService {
  /** Open the player at `url` and wait for its export handle; the page closes with the scope. */
  readonly open: (url: string) => Effect.Effect<FramePage, PageOpenError, Scope.Scope>;
}

/** How long the player may take to load its fonts and film. */
const LOAD_TIMEOUT_MS = 60_000;
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

/**
 * Chromium's flags on `platform` (`process.platform`). On every platform the
 * 2D canvas draws in software, so a frame's pixels are the same wherever it
 * is drawn. On macOS the GPU process runs too, through Metal (a macOS-only
 * ANGLE backend): it holds the hardware H.264 encoder a render encodes with.
 * Elsewhere the page encodes in software when it finds no hardware encoder
 * (`chooseEncoder`, player/encode.ts).
 */
export const launchArgs = (platform: string): ReadonlyArray<string> => [
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
  ...Arr.filter(['--enable-gpu', '--use-angle=metal'], () => platform === 'darwin'),
  '--disable-accelerated-2d-canvas',
];

const launch = Effect.gen(function* () {
  const install = yield* installCommand;
  return yield* Effect.tryPromise({
    try: () =>
      chromium.launch({
        args: [...launchArgs(process.platform)],
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
    // The player names the page after the film it mounted.
    const title = yield* guarded(Effect.tryPromise({ try: () => page.title(), catch: loadFailed }));
    const reported = yield* guarded(
      Effect.tryPromise({ try: () => page.evaluate(() => window.__film?.info), catch: loadFailed }),
    );
    const info = yield* Schema.decodeUnknownEffect(ExportInfo)(reported).pipe(
      Effect.mapError((error) => PageLoadFailed.make({ url, reason: error.message })),
    );

    /** A call through Playwright: the arguments cross into the page, the answer back. */
    const invoke: Invoke = (name, args, timeout) =>
      guarded(
        Effect.tryPromise({
          try: () =>
            page.evaluate(
              ([n, a]) => {
                const handle = window.__film;
                return handle && Reflect.apply(handle[n], handle, a);
              },
              [name, args] satisfies [ExportCall, ReadonlyArray<unknown>],
            ),
          catch: (cause) => CallRefused.make({ reason: String(cause) }),
        }).pipe(
          Effect.timeoutOrElse({
            duration: timeout,
            orElse: () => Effect.fail(CallRefused.make({ reason: 'timed out' })),
          }),
        ),
      );

    return framePage(info, title, invoke);
  });

/** Preflight: headless Chromium launches (and closes again); `BrowserMissing` says how to install it. */
export const browserReady: Effect.Effect<void, BrowserMissing | BrowserFailed, Path.Path> =
  Effect.scoped(
    Effect.asVoid(
      Effect.acquireRelease(launch, (b) => Effect.ignore(Effect.tryPromise(() => b.close()))),
    ),
  ).pipe(Effect.withSpan('Browser.ready'));

export class Browser extends Context.Service<Browser, BrowserService>()(
  '@bible/film/tools/Browser',
) {
  /**
   * Headless Chromium through Playwright, launched when the first page opens
   * and closed when the layer's scope closes: a command that draws nothing
   * (a `project render` of current scenes, a refused flag) never starts it,
   * and never needs it installed.
   */
  static readonly layer = Layer.effect(
    Browser,
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const path = yield* Path.Path;
      const launched = yield* Effect.cached(
        Effect.suspend(() => makeBrowser).pipe(
          Effect.provideService(Path.Path, path),
          Scope.provide(scope),
        ),
      );
      return Browser.of({
        open: (url) => Effect.flatMap(launched, (browser) => browser.open(url)),
      });
    }),
  );
}

/** Headless Chromium launched in the current scope, and closed with it. */
export const makeBrowser: Effect.Effect<
  BrowserService,
  BrowserMissing | BrowserFailed,
  Scope.Scope | Path.Path
> = Effect.gen(function* () {
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
});
