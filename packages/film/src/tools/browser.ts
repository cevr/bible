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
import { ExportInfo, FaceMark, Probed } from '../core/schema.ts';
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

export type FrameFormat = 'image/png' | 'image/jpeg';

/** One player page in export mode. */
export interface FramePage {
  readonly info: ExportInfo;
  /** Draw frame `i` and return it encoded. */
  readonly frame: (
    i: number,
    format: FrameFormat,
  ) => Effect.Effect<Uint8Array, PageError | PageCrashed | FrameFailed>;
  /** Draw frame `i` with the probe on and return every line of text and mark of ink it drew. */
  readonly probe: (i: number) => Effect.Effect<Probed, PageError | PageCrashed | FrameFailed>;
  /** Compose the film's look-book and return it as a JPEG. */
  readonly lookbook: Effect.Effect<Uint8Array, PageError | PageCrashed | LookbookFailed>;
  /** Fail unless the page can encode the film at `scale`. */
  readonly encoder: (
    scale: number,
  ) => Effect.Effect<void, PageError | PageCrashed | EncoderMissing>;
  /**
   * Draw frames `[from, to)` and return them as an H.264 MP4 at `scale`, its
   * first frame at 0, and with `share` a small copy encoded in the same pass.
   */
  readonly encode: (
    chunk: { readonly from: number; readonly to: number },
    scale: number,
    share: boolean,
  ) => Effect.Effect<EncodedChunk, PageError | PageCrashed | EncodeFailed>;
  /** Draw `frames` and return them tiled into the contact sheet, as a JPEG. */
  readonly contact: (
    frames: ReadonlyArray<number>,
  ) => Effect.Effect<Uint8Array, PageError | PageCrashed | ContactFailed>;
  /** Draw `frames` and return how many milliseconds each took, raster included. */
  readonly time: (
    frames: ReadonlyArray<number>,
  ) => Effect.Effect<ReadonlyArray<number>, PageError | PageCrashed | FrameFailed>;
  /** Draw `frames` and return a hash of each one's pixels. */
  readonly hash: (
    frames: ReadonlyArray<number>,
  ) => Effect.Effect<ReadonlyArray<string>, PageError | PageCrashed | FrameFailed>;
  /**
   * Draw `frames` without captions and return each as a `w` × `h` RGBA thumb
   * (end to end) with the faces it declared: the look pass.
   */
  readonly look: (
    frames: ReadonlyArray<number>,
    w: number,
    h: number,
  ) => Effect.Effect<LookedFrames, PageError | PageCrashed | FrameFailed>;
}

/** The look pass's frames: thumbs end to end, and each frame's faces. */
export const LookedFrames = Schema.Struct({
  thumbs: Schema.Uint8ArrayFromBase64,
  faces: Schema.Array(Schema.Array(FaceMark)),
});
export type LookedFrames = typeof LookedFrames.Type;

export type PageOpenError = PageLoadFailed | PageError | PageCrashed | BrowserFailed;

export interface BrowserService {
  /** Open the player at `url` and wait for its export handle; the page closes with the scope. */
  readonly open: (url: string) => Effect.Effect<FramePage, PageOpenError, Scope.Scope>;
}

/** How long the player may take to load its fonts and film. */
const LOAD_TIMEOUT_MS = 60_000;
/** A frame that takes longer than this has hung. */
const FRAME_TIMEOUT = Duration.minutes(2);
/** The look-book and the contact sheet draw many frames in one call. */
const SHEET_TIMEOUT = Duration.minutes(5);
/** A chunk draws and encodes a few hundred frames in one call. */
const ENCODE_TIMEOUT = Duration.minutes(5);
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
        args: [
          '--disable-gpu-vsync',
          '--disable-frame-rate-limit',
          // The GPU process holds the hardware H.264 encoder a render encodes
          // with; the 2D canvas stays in software, so frames draw as before.
          '--enable-gpu',
          '--use-angle=metal',
          '--disable-accelerated-2d-canvas',
        ],
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

/** A chunk from the page (`player/encode.ts`): the master, and the share copy if asked for. */
const EncodedChunk = Schema.Struct({
  master: Schema.Uint8ArrayFromBase64,
  share: Schema.OptionFromOptionalKey(Schema.Uint8ArrayFromBase64),
});
export type EncodedChunk = typeof EncodedChunk.Type;

/** What the page says of its encoder (`player/encode.ts`, `EncoderCheck`). */
const EncoderCheck = Schema.Union([
  Schema.TaggedStruct('Ready', {}),
  Schema.TaggedStruct('Missing', { reason: Schema.String }),
]).pipe(Schema.toTaggedUnion('_tag'));

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

    /**
     * A handle call, its answer decoded by `schema`; `fail` says what failed,
     * and it fails too if the call outlasts `timeout`, or the answer does not
     * decode (the handle is gone, or answered something else), saying why.
     */
    const handle = <A, E>(
      call: () => Promise<unknown>,
      schema: Schema.Decoder<A>,
      timeout: Duration.Duration,
      fail: (reason: string) => E,
    ) =>
      guarded(
        Effect.tryPromise({ try: call, catch: (cause) => fail(String(cause)) }).pipe(
          Effect.timeoutOrElse({
            duration: timeout,
            orElse: () => Effect.fail(fail('timed out')),
          }),
        ),
      ).pipe(
        Effect.flatMap((answer) =>
          Schema.decodeUnknownEffect(schema)(answer).pipe(
            Effect.mapError((error) => fail(`the export handle answered: ${error.message}`)),
          ),
        ),
      );

    /** A handle call that hands back bytes as base64. */
    const bytes = <E>(
      call: () => Promise<unknown>,
      timeout: Duration.Duration,
      fail: (reason: string) => E,
    ) => handle(call, Schema.Uint8ArrayFromBase64, timeout, fail);

    const frame = (i: number, format: FrameFormat) =>
      bytes(
        () =>
          page.evaluate(([n, type]) => window.__film?.frame(n, type), [i, format] satisfies [
            number,
            FrameFormat,
          ]),
        FRAME_TIMEOUT,
        (reason) => FrameFailed.make({ frame: i, reason }),
      );

    const probe = (i: number) =>
      handle(
        () => page.evaluate((n) => window.__film?.probe(n), i),
        Probed,
        FRAME_TIMEOUT,
        (reason) => FrameFailed.make({ frame: i, reason }),
      );

    const lookbook = bytes(
      () => page.evaluate(() => window.__film?.lookbook('image/jpeg')),
      SHEET_TIMEOUT,
      (reason) => LookbookFailed.make({ reason }),
    );

    const encoder = (scale: number) =>
      handle(
        () => page.evaluate((k) => window.__film?.encoder(k), scale),
        EncoderCheck,
        FRAME_TIMEOUT,
        (reason) => EncoderMissing.make({ reason }),
      ).pipe(
        Effect.flatMap((check) =>
          EncoderCheck.match(check, {
            Ready: () => Effect.void,
            Missing: ({ reason }) => Effect.fail(EncoderMissing.make({ reason })),
          }),
        ),
      );

    const encode = (
      chunk: { readonly from: number; readonly to: number },
      scale: number,
      share: boolean,
    ) =>
      handle(
        () =>
          page.evaluate(([from, to, k, copy]) => window.__film?.encode(from, to, k, copy), [
            chunk.from,
            chunk.to,
            scale,
            share,
          ] satisfies [number, number, number, boolean]),
        EncodedChunk,
        ENCODE_TIMEOUT,
        (reason) => EncodeFailed.make({ from: chunk.from, to: chunk.to, reason }),
      );

    const contact = (frames: ReadonlyArray<number>) =>
      bytes(
        () => page.evaluate((all) => window.__film?.contact(all), [...frames]),
        SHEET_TIMEOUT,
        (reason) => ContactFailed.make({ reason }),
      );

    /** A failed batch of frames names its first. */
    const batchFailed = (frames: ReadonlyArray<number>) => (reason: string) =>
      FrameFailed.make({ frame: frames[0] ?? 0, reason });

    const time = (frames: ReadonlyArray<number>) =>
      handle(
        () => page.evaluate((all) => window.__film?.time(all), [...frames]),
        Schema.Array(Schema.Finite),
        SHEET_TIMEOUT,
        batchFailed(frames),
      );

    const hash = (frames: ReadonlyArray<number>) =>
      handle(
        () => page.evaluate((all) => window.__film?.hash(all), [...frames]),
        Schema.Array(Schema.String),
        SHEET_TIMEOUT,
        batchFailed(frames),
      );

    const look = (frames: ReadonlyArray<number>, w: number, h: number) =>
      handle(
        () =>
          page.evaluate(([all, tw, th]) => window.__film?.look(all, tw, th), [
            [...frames],
            w,
            h,
          ] satisfies [number[], number, number]),
        LookedFrames,
        SHEET_TIMEOUT,
        batchFailed(frames),
      );

    return {
      info,
      frame,
      probe,
      lookbook,
      encoder,
      encode,
      contact,
      time,
      hash,
      look,
    } satisfies FramePage;
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
