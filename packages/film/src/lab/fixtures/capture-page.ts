// The capture's browser test page: the real AudioWorklet capture, driven the
// way the recorder drives it (open, start, stop), exposed as
// `window.captureProbe(setup)` for the test to call. It answers what was
// recorded (the rate, the length, the loudest sample and the RMS), the rate
// the microphone's track reports, and what the meter saw, or the refusal the
// capture gave.
//
// A setup can stand in for the machine the page runs on: `outputRate` is an
// output device at another rate than the microphone's (a context made with
// no rate runs at it, as Chromium's does at the default output's); `stuckRate`
// a browser that runs every context at one rate, whatever was asked; and
// `processed` a browser that leaves echo cancelling on though asked not to.
// And it can break the take: `lose` ends the microphone's track after the
// recording has run (the interface unplugged), and `dropFlush` loses the
// worklet's flush on the way (the last part-block never comes).

import { Deferred, Effect, Option, Stream } from 'effect';
import { Capture, type Level } from '../studio/capture.ts';
import { audioConstraints, browserCaptureLayer } from '../studio/capture-browser.ts';

/** What the page stands in for, and how long it records. */
export interface ProbeSetup {
  /** The seconds of the microphone the capture keeps before the stop, counted in its frames. */
  readonly seconds: number;
  readonly outputRate?: number;
  readonly stuckRate?: number;
  readonly processed?: boolean;
  readonly lose?: boolean;
  readonly dropFlush?: boolean;
}

/** What one probe found. */
export interface Probed {
  readonly refused: string;
  readonly rate: number;
  /** The rate the microphone's track reports (`getSettings().sampleRate`). */
  readonly trackRate: number;
  readonly frames: number;
  readonly peak: number;
  readonly rms: number;
  readonly levels: number;
  readonly loudest: number;
  readonly closedAfter: boolean;
  /** The capture said the microphone went away. */
  readonly lost: boolean;
}

/** How long the page waits for what it waits on before it answers what it has. */
const WITHIN = 10;

const nothing: Probed = {
  refused: '',
  rate: 0,
  trackRate: 0,
  frames: 0,
  peak: 0,
  rms: 0,
  levels: 0,
  loudest: 0,
  closedAfter: false,
  lost: false,
};

const RealContext = window.AudioContext;

/** Every context made from now on runs at `rate`, or at it when made with none. */
const contextsAt = (rate: number, always: boolean) => {
  class At extends RealContext {
    constructor(options?: AudioContextOptions) {
      super(
        Option.match(
          Option.filter(Option.fromUndefinedOr(options?.sampleRate), () => !always),
          {
            onNone: () => ({ ...options, sampleRate: rate }),
            onSome: () => options,
          },
        ),
      );
    }
  }
  window.AudioContext = At;
};

/** Every track says echo cancelling is on. */
const echoLeftOn = () => {
  const real = MediaStreamTrack.prototype.getSettings;
  MediaStreamTrack.prototype.getSettings = function (this: MediaStreamTrack) {
    return { ...real.call(this), echoCancellation: true };
  };
};

/** A flush the page asks the worklet for never arrives. */
const flushesLost = () => {
  const real = MessagePort.prototype.postMessage;
  Reflect.set(
    MessagePort.prototype,
    'postMessage',
    function (this: MessagePort, ...args: ReadonlyArray<unknown>) {
      if (args[0] === 'flush') {
        Reflect.set(window, 'captureFlushLost', true);
        return;
      }
      Reflect.apply(real, this, args);
    },
  );
};

/** Every microphone stream the page was given, to end its tracks. */
const opened: Array<MediaStream> = [];
const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = (constraints) =>
  realGetUserMedia(constraints).then((stream) => {
    opened.push(stream);
    return stream;
  });

/**
 * The rate the default microphone's track reports, opened as the capture
 * opens it (a processed track runs at the processing's rate, not the device's).
 */
const trackRate = Effect.promise(() =>
  navigator.mediaDevices.getUserMedia({ audio: audioConstraints(Option.none()) }).then((stream) => {
    const rate = stream.getAudioTracks()[0]?.getSettings().sampleRate ?? 0;
    stream.getTracks().forEach((t) => t.stop());
    return rate;
  }),
).pipe(Effect.orElseSucceed(() => 0));

const probe = (setup: ProbeSetup) =>
  Effect.gen(function* () {
    Option.map(Option.fromUndefinedOr(setup.outputRate), (rate) => contextsAt(rate, false));
    Option.map(Option.fromUndefinedOr(setup.stuckRate), (rate) => contextsAt(rate, true));
    if (setup.processed === true) echoLeftOn();
    if (setup.dropFlush === true) flushesLost();
    const capture = yield* Capture;
    const seen: Array<Level> = [];
    // Done when the capture has kept `seconds` of the microphone, however slow the machine.
    const enough = yield* Deferred.make<boolean>();
    // Done when the meter says closed.
    const closed = yield* Deferred.make<boolean>();
    yield* capture.levels.pipe(
      Stream.runForEach((level) =>
        Option.match(level, {
          onNone: () => Effect.asVoid(Deferred.succeed(closed, true)),
          onSome: (l) =>
            Effect.sync(() => void seen.push(l)).pipe(
              Effect.andThen(
                Effect.when(
                  Deferred.succeed(enough, true),
                  Effect.succeed(l.kept >= setup.seconds),
                ),
              ),
            ),
        }),
      ),
      Effect.forkScoped,
    );
    yield* Effect.yieldNow;
    yield* capture.open(Option.none());
    yield* capture.start;
    yield* Deferred.await(enough).pipe(Effect.timeoutOption(`${WITHIN} seconds`));
    // Unplugged: the capture says the microphone went, within a second.
    const lost =
      setup.lose === true &&
      Option.isSome(
        yield* Effect.sync(() =>
          opened
            .flatMap((s) => s.getAudioTracks())
            .forEach((t) => t.dispatchEvent(new Event('ended'))),
        ).pipe(Effect.andThen(capture.lost), Effect.timeoutOption('1 second')),
      );
    const pcm = yield* capture.stop;
    const closedAfter = Option.isSome(
      yield* Deferred.await(closed).pipe(Effect.timeoutOption(`${WITHIN} seconds`)),
    );
    let peak = 0;
    let sum = 0;
    for (const x of pcm.samples) {
      peak = Math.max(peak, Math.abs(x));
      sum += x * x;
    }
    const probed: Probed = {
      ...nothing,
      rate: pcm.rate,
      trackRate: yield* trackRate,
      frames: pcm.samples.length,
      peak,
      rms: Math.sqrt(sum / Math.max(1, pcm.samples.length)),
      levels: seen.length,
      loudest: Math.max(0, ...seen.map((l) => l.peak)),
      closedAfter,
      lost,
    };
    return probed;
  }).pipe(
    Effect.scoped,
    Effect.provide(browserCaptureLayer),
    Effect.catchTags({
      MicDenied: (e) => Effect.succeed({ ...nothing, refused: e.message }),
      CaptureFailed: (e) => Effect.succeed({ ...nothing, refused: e.message }),
    }),
  );

Reflect.set(window, 'captureProbe', (setup: ProbeSetup) => Effect.runPromise(probe(setup)));
