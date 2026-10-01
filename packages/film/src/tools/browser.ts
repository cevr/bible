// Headless Chrome, as a service: a player page in a tab of the process's
// Chrome (`tools/chrome.ts`, Bun.WebView), and the one typed path every call
// on an export page takes (`framePage`). Each page lives in the scope that
// opened it; Chrome lives as long as the process. A call names one of the
// handle's calls (`ExportCalls`, core/export-handle.ts), its answer is
// decoded by that call's schema, and its failure is that call's own error
// (`CALLS`). The tab and the test fake (tools/testing.ts) are the two ways a
// call reaches a page (`Invoke`). Everything the film does wrong in a page
// arrives as a typed failure: an uncaught error (`Runtime.exceptionThrown`)
// is `PageError`, a dead renderer process is `PageCrashed`.

import {
  Array as Arr,
  Context,
  Deferred,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  type Scope,
  Semaphore,
} from 'effect';
import { openView, thrownBy } from './chrome.ts';
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
  type BrowserFailed,
  type BrowserMissing,
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

interface BrowserService {
  /** Open the player at `url` and wait for its export handle; the page closes with the scope. */
  readonly open: (url: string) => Effect.Effect<FramePage, PageOpenError, Scope.Scope>;
}

/** How long the player may take to load its fonts and film. */
const LOAD_TIMEOUT = Duration.minutes(1);
/** A failed call waits this long for the crash or page error that explains it. */
const SETTLE = Duration.seconds(1);

/**
 * Chrome's flags on `platform` (`process.platform`). On every platform the
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

/** A tab of this process's Chrome, with the renderer's flags, 1920 × 1080 CSS pixels at one device pixel each; closed with the scope. */
const frameView = openView(launchArgs(process.platform), { width: 1920, height: 1080 });

/** A script the page runs, `answer` once it is there: the export handle, waited for on the page's own timers. */
const HANDLE = `new Promise((done) => {
  const look = () => (window.__film ? done(true) : setTimeout(look, 50));
  look();
})`;

/** Any value as JSON text, to write into a script the page runs. */
const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const openPage = (view: Bun.WebView, url: string) =>
  Effect.gen(function* () {
    const broken = yield* Deferred.make<never, PageError | PageCrashed>();
    const loadFailed = (cause: unknown) => PageLoadFailed.make({ url, reason: String(cause) });
    // A view takes one script at a time.
    const one = yield* Semaphore.make(1);
    const evaluate = <A>(script: string) =>
      one.withPermits(1)(Effect.tryPromise(() => view.evaluate<A>(script)));

    // The protocol answers once the view has navigated.
    yield* Effect.tryPromise({ try: () => view.navigate('about:blank'), catch: loadFailed });
    view.addEventListener('Runtime.exceptionThrown', (event: Event) => {
      Option.map(thrownBy(event), (reason) =>
        Deferred.doneUnsafe(broken, Effect.fail(PageError.make({ reason }))),
      );
    });
    view.addEventListener('Inspector.targetCrashed', () => {
      Deferred.doneUnsafe(
        broken,
        Effect.fail(PageCrashed.make({ reason: 'the renderer process died' })),
      );
    });
    for (const domain of ['Runtime', 'Inspector'])
      yield* Effect.tryPromise({ try: () => view.cdp(`${domain}.enable`), catch: loadFailed });

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

    /** A step of the load: the page's own, within the load's time. */
    const loading = <A>(step: Effect.Effect<A, unknown>) =>
      guarded(
        step.pipe(
          Effect.mapError(loadFailed),
          Effect.timeoutOrElse({
            duration: LOAD_TIMEOUT,
            orElse: () => Effect.fail(loadFailed('the player did not load in time')),
          }),
        ),
      );

    yield* loading(Effect.tryPromise(() => view.navigate(url)));
    yield* loading(evaluate(HANDLE));
    // The player names the page after the film it mounted.
    const title = yield* loading(evaluate<string>('document.title'));
    const reported = yield* loading(evaluate('window.__film.info'));
    const info = yield* Schema.decodeUnknownEffect(ExportInfo)(reported).pipe(
      Effect.mapError((error) => PageLoadFailed.make({ url, reason: error.message })),
    );

    /** A call into the page: the arguments cross in as JSON, the answer back. */
    const invoke: Invoke = (name, args, timeout) =>
      guarded(
        evaluate(`window.__film[${jsonOf(name)}](...${jsonOf(args)})`).pipe(
          Effect.mapError((cause) => CallRefused.make({ reason: String(cause) })),
          Effect.timeoutOrElse({
            duration: timeout,
            orElse: () => Effect.fail(CallRefused.make({ reason: 'timed out' })),
          }),
        ),
      );

    return framePage(info, title, invoke);
  });

/** Preflight: Chrome opens a page (and closes it again); `BrowserMissing` says how to get one. */
export const browserReady: Effect.Effect<
  void,
  BrowserMissing | BrowserFailed,
  FileSystem.FileSystem | Path.Path
> = Effect.scoped(Effect.asVoid(frameView)).pipe(Effect.withSpan('Browser.ready'));

export class Browser extends Context.Service<Browser, BrowserService>()(
  '@bible/film/tools/Browser',
) {
  /**
   * Pages in this process's Chrome (`tools/chrome.ts`), spawned when the first
   * page opens: a command that draws nothing (a `project render` of current
   * scenes, a refused flag) never starts it, and never needs it there.
   */
  static readonly layer = Layer.effect(
    Browser,
    Effect.suspend(() => makeBrowser),
  );
}

/** Pages in this process's Chrome, each a tab closed with the scope that opened it. */
export const makeBrowser: Effect.Effect<BrowserService, never, FileSystem.FileSystem | Path.Path> =
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const open = Effect.fn('Browser.open')(function* (url: string) {
      const view = yield* frameView.pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );
      return yield* openPage(view, url);
    });
    return Browser.of({ open });
  });
