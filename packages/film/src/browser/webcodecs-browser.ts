// The compare's WebCodecs panes, live: renders opened with mediabunny
// (`Input` over a ranged `UrlSource`), each pane's frames from a
// `VideoSampleSink` drawn with `sample.draw` (not the full-size
// `CanvasSink`, which fell behind the clock in the spike), its key frames
// from an `EncodedPacketSink` for a scrub's preview, and the heard one's
// sound from an `AudioBufferSink` scheduled on the page's one sound context
// (`Media.sound`), kept at most a second ahead. Every pane reads one clock
// over the page's monotonic time (`media-clock.ts`), so the pair is never
// apart. Which engine a compare plays on is chosen here from what the
// browser and the files allow (`media-choice.ts`); `<video>` is the
// fallback, and a file that will not open falls back too; every input is
// owned from the moment it is made, so an opening that fails or is cut short
// lets them all go. Hidden, the panes stand and let their decoders go (the
// spike's memory was 2.5–4× `<video>`'s); shown, they draw afresh and play on.

import { Clock, type Context, Data, Duration, Effect, Exit, Option, Scope } from 'effect';
import {
  ALL_FORMATS,
  AudioBufferSink,
  EncodedPacketSink,
  Input,
  type InputAudioTrack,
  type InputVideoTrack,
  UrlSource,
  type VideoSample,
  VideoSampleSink,
} from 'mediabunny';
import { Frames } from './frames.ts';
import {
  type AudioOut,
  type Frame,
  type FrameSource,
  type Pane,
  lockstep,
  paneOver,
} from './frame-pane.ts';
import { type BrowserCodecs, type Engine, type TrackCodecs, engineFor } from './media-choice.ts';
import { makeClock, monotonicNow } from './media-clock.ts';
import { Media } from './media.ts';

/** What this browser can decode, and whether it is a phone (a coarse pointer). */
const browserCodecs = (): BrowserCodecs => ({
  videoDecoder: 'VideoDecoder' in globalThis,
  audioDecoder: 'AudioDecoder' in globalThis,
  phone: matchMedia('(pointer: coarse)').matches,
});

/** A render opened for a pane: its input, its tracks, and what they need. */
interface Opened {
  readonly input: Input;
  readonly video: InputVideoTrack;
  readonly audio: Option.Option<InputAudioTrack>;
  readonly codecs: TrackCodecs;
}

/** A render that would not open for the panes, and why. */
class NotOpened extends Data.TaggedError('NotOpened')<{ readonly why: string }> {}

/** A promise mediabunny made, as an Effect that fails with why. */
const ask = <A>(promise: () => Promise<A>) =>
  Effect.mapError(Effect.tryPromise(promise), (e) => new NotOpened({ why: String(e.cause) }));

/** The render at `url` as a mediabunny input, over ranged requests. */
const urlInput = (url: string) => new Input({ source: new UrlSource(url), formats: ALL_FORMATS });

/**
 * The render at `url`, opened: its picture's and its sound's codecs asked of
 * this browser. Its input is `scope`'s from the moment it is made: closing
 * the scope disposes it, and mediabunny aborts its requests in flight.
 */
const open = (url: string, inputOf: (url: string) => Input) =>
  Effect.gen(function* () {
    const input = yield* Effect.acquireRelease(
      Effect.sync(() => inputOf(url)),
      (made) => Effect.sync(() => made.dispose()),
    );
    const video = yield* Effect.flatMap(
      Effect.map(
        ask(() => input.getPrimaryVideoTrack()),
        Option.fromNullishOr,
      ),
      Option.match({
        onNone: () => Effect.fail(new NotOpened({ why: 'it has no picture' })),
        onSome: Effect.succeed,
      }),
    );
    const audio = Option.fromNullishOr(yield* ask(() => input.getPrimaryAudioTrack()));
    const kind = Option.match(audio, {
      onNone: (): TrackCodecs['audio'] => 'none',
      onSome: (a): TrackCodecs['audio'] => {
        if (String(a.codec).startsWith('pcm')) return 'pcm';
        return 'coded';
      },
    });
    const audioDecodable = yield* Option.match(audio, {
      onNone: () => Effect.succeed(false),
      onSome: (a) => ask(() => a.canDecode()),
    });
    const picture = yield* ask(() => video.canDecode());
    const opened: Opened = {
      input,
      video,
      audio,
      codecs: { video: picture, audio: kind, audioDecodable },
    };
    return opened;
  });

/** Renders opened for a compare, and the scope that owns their inputs: closing it disposes every one. */
interface Owned {
  readonly opened: ReadonlyArray<Opened>;
  readonly inputs: Scope.Closeable;
}

/**
 * The renders at `urls`, opened at once (a compare holds two), each input
 * owned from the moment it is made by a scope inside the caller's: a render
 * that will not open, or the opening cut short, disposes every input
 * (aborting its requests). Opened, nothing passes hands: the inputs are the
 * caller's scope's all along, so closing it lets them go however far the
 * opening got, and `inputs` lets them go sooner.
 */
export const openRenders = (
  urls: ReadonlyArray<string>,
  inputOf: (url: string) => Input = urlInput,
): Effect.Effect<Owned, NotOpened, Scope.Scope> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const inputs = yield* Scope.fork(yield* Effect.scope);
      const opened = yield* restore(
        Effect.forEach(urls, (url) => Scope.provide(open(url, inputOf), inputs), {
          concurrency: 2,
        }),
      ).pipe(Effect.onError((cause) => Scope.close(inputs, Exit.failCause(cause))));
      const owned: Owned = { opened, inputs };
      return owned;
    }),
  );

/** The engine a compare plays on, the renders opened for it (none on `<video>`), and the letting go of them. */
export interface Chosen {
  readonly engine: Engine;
  readonly opened: ReadonlyArray<Opened>;
  /** Dispose every input opened for it. */
  readonly release: Effect.Effect<void>;
}

/**
 * The engine a compare of the renders at `urls` plays on, and the renders
 * opened for it, their inputs the scope's from the moment each is made.
 */
export const chooseEngine = (
  urls: ReadonlyArray<string>,
): Effect.Effect<Chosen, never, Scope.Scope> => {
  const browser = browserCodecs();
  // A browser that cannot play the panes opens nothing.
  const early = engineFor(browser, { video: true, audio: 'none', audioDecodable: false });
  if (early.engine === 'video')
    return Effect.succeed({ engine: early, opened: [], release: Effect.void });
  return openRenders(urls).pipe(
    Effect.flatMap(({ opened, inputs }) => {
      const refused = Option.fromUndefinedOr(
        opened.map((o) => engineFor(browser, o.codecs)).find((e) => e.engine === 'video'),
      );
      const release = Scope.close(inputs, Exit.void);
      return Option.match(refused, {
        onNone: () => Effect.succeed<Chosen>({ engine: { engine: 'webcodecs' }, opened, release }),
        onSome: (engine) =>
          Effect.as(release, { engine, opened: [], release: Effect.void } satisfies Chosen),
      });
    }),
    Effect.catch((failure) =>
      Effect.succeed<Chosen>({
        engine: { engine: 'video', why: `a render did not open: ${failure.why}` },
        opened: [],
        release: Effect.void,
      }),
    ),
  );
};

/** A frame of `sample`, painted on `canvas` whole. */
const frameOf =
  (canvas: HTMLCanvasElement, paint: CanvasRenderingContext2D) =>
  (sample: VideoSample): Frame => ({
    timestamp: sample.timestamp,
    duration: sample.duration,
    draw: () => sample.draw(paint, 0, 0, canvas.width, canvas.height),
    close: () => sample.close(),
  });

/** A promise of the decoder's: its answer if any, a failure read as nothing more to show. */
const decode = <A>(promise: () => Promise<A>): Effect.Effect<Option.Option<NonNullable<A>>> =>
  Effect.map(Effect.option(Effect.tryPromise(promise)), (got) =>
    Option.flatMap(got, Option.fromNullishOr),
  );

/** The next of `items`; none once they run out or fail. */
const nextOf = <A>(items: AsyncGenerator<A, void>): Effect.Effect<Option.Option<A>> =>
  Effect.map(
    decode(() => items.next()),
    (got) =>
      Option.flatMap(got, (result) => {
        if (result.done === true) return Option.none();
        return Option.some(result.value);
      }),
  );

/** Let `items` go. */
const closeOf = <A>(items: AsyncGenerator<A, void>): Effect.Effect<void> =>
  Effect.asVoid(decode(() => items.return()));

/** `opened`'s frames, painted on `canvas`. */
const sourceOf = (opened: Opened, canvas: HTMLCanvasElement): Option.Option<FrameSource> =>
  Option.map(Option.fromNullishOr(canvas.getContext('2d')), (paint) => {
    const sink = new VideoSampleSink(opened.video);
    const packets = new EncodedPacketSink(opened.video);
    const toFrame = frameOf(canvas, paint);
    return {
      duration: Effect.map(
        decode(() => opened.input.computeDuration()),
        Option.getOrElse(() => Number.NaN),
      ),
      frames: (t) => {
        const samples = sink.samples(t);
        return {
          next: Effect.map(nextOf(samples), Option.map(toFrame)),
          close: closeOf(samples),
        };
      },
      keyFrame: (t) =>
        Effect.gen(function* () {
          const key = yield* decode(() => packets.getKeyPacket(t));
          if (Option.isNone(key)) return Option.none<Frame>();
          const sample = yield* decode(() => sink.getSample(key.value.timestamp));
          return Option.map(sample, toFrame);
        }),
    };
  });

/** How far ahead of the clock the sound is scheduled, in seconds. */
const AHEAD_S = 1;

/** `track`'s sound, scheduled on the page's sound context from a time. */
const soundOf = (track: InputAudioTrack, host: Context.Context<Media>): AudioOut => {
  const sink = new AudioBufferSink(track);
  let playing = Option.none<() => void>();
  const stop = () => {
    Option.map(playing, (end) => end());
    playing = Option.none();
  };
  return {
    start: (t) => {
      stop();
      // Asked in the press that plays: the context is made or woken there.
      Option.map(Effect.runSyncWith(host)(Media.use((media) => media.sound)), (ctx) => {
        const buffers = sink.buffers(t);
        const nodes = new Set<AudioBufferSourceNode>();
        const startedAt = ctx.currentTime;
        /** Schedule the next buffer, wait until it is at most a second ahead, and go on. */
        const schedule: Effect.Effect<void> = Effect.gen(function* () {
          const got = yield* nextOf(buffers);
          if (Option.isNone(got)) return;
          const node = ctx.createBufferSource();
          node.buffer = got.value.buffer;
          node.connect(ctx.destination);
          const when = startedAt + (got.value.timestamp - t);
          if (when >= ctx.currentTime) node.start(when);
          else node.start(ctx.currentTime, ctx.currentTime - when);
          nodes.add(node);
          node.addEventListener('ended', () => nodes.delete(node));
          const ahead = when - ctx.currentTime - AHEAD_S;
          if (ahead > 0) yield* Effect.sleep(Duration.seconds(ahead));
          yield* schedule;
        });
        const fiber = Effect.runForkWith(host)(schedule);
        playing = Option.some(() => {
          fiber.interruptUnsafe();
          for (const node of nodes) node.stop();
          nodes.clear();
          Effect.runFork(closeOf(buffers));
        });
      });
    },
    stop,
  };
};

/** The page as the panes see it: whether it is shown, and word when that changes. */
type Page = Pick<Document, 'visibilityState' | 'addEventListener'>;

/**
 * `panes` stand while `page` is hidden and play on once it is shown, until
 * `signal` aborts: hidden as they are made, if the page already is.
 */
export const standWhileHidden = (
  panes: ReadonlyArray<Pick<Pane, 'hide' | 'show'>>,
  page: Page,
  signal: AbortSignal,
) => {
  const hidden = () => page.visibilityState === 'hidden';
  const follow = () => {
    for (const pane of panes) {
      if (hidden()) pane.hide();
      else pane.show();
    }
  };
  // Opened while the page was hidden: they stand before they ever play.
  if (hidden()) follow();
  page.addEventListener('visibilitychange', follow, { signal });
};

/** The panes of a compare, and the letting go of them all. */
export interface ComparePanes {
  readonly panes: ReadonlyArray<Pane>;
  readonly dispose: () => void;
}

/**
 * Panes over the renders `chosen` opened, each painted on its canvas (sized
 * to its picture), on one clock, in lockstep, their frames run on the
 * host's `Frames`. The page hidden, every pane stands (silent, its decoder
 * let go); shown, each draws afresh and plays on as it was. `dispose` lets
 * everything go.
 */
export const panesOver = (
  host: Context.Context<Frames | Media>,
  chosen: Chosen,
  canvases: ReadonlyArray<HTMLCanvasElement>,
): ComparePanes => {
  // The page's monotonic time: never the wall clock (set on or back by a sync), nor the
  // sound context's (held suspended until a press).
  const clock = makeClock(monotonicNow(Effect.runSync(Clock.clockWith(Effect.succeed))));
  const together = lockstep((step: () => boolean) =>
    Effect.runCallbackWith(host)(Frames.use((frames) => frames.loop(() => step()))),
  );
  const panes = chosen.opened.flatMap((opened, i) =>
    Option.toArray(
      Option.flatMap(Option.fromUndefinedOr(canvases[i]), (canvas) => {
        canvas.width = opened.video.displayWidth;
        canvas.height = opened.video.displayHeight;
        return Option.map(sourceOf(opened, canvas), (source) =>
          paneOver({
            source,
            clock,
            together,
            audio: Option.map(opened.audio, (track) => soundOf(track, host)),
          }),
        );
      }),
    ),
  );
  const listening = new AbortController();
  standWhileHidden(panes, document, listening.signal);
  return {
    panes,
    dispose: () => {
      listening.abort();
      for (const pane of panes) pane.hide();
      Effect.runFork(chosen.release);
    },
  };
};
