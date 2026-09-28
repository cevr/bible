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

import { Effect, Option, Stream } from 'effect';
import { Capture, type Level } from '../studio/capture.ts';
import { audioConstraints, browserCaptureLayer } from '../studio/capture-browser.ts';

/** What the page stands in for, and how long it records. */
export interface ProbeSetup {
  readonly seconds: number;
  readonly outputRate?: number;
  readonly stuckRate?: number;
  readonly processed?: boolean;
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
}

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
    const capture = yield* Capture;
    const seen: Array<Level> = [];
    const closed: Array<boolean> = [];
    yield* capture.levels.pipe(
      Stream.runForEach((level) =>
        Effect.sync(() =>
          Option.match(level, {
            onNone: () => void closed.push(true),
            onSome: (l) => void seen.push(l),
          }),
        ),
      ),
      Effect.forkScoped,
    );
    yield* Effect.yieldNow;
    yield* capture.open(Option.none());
    yield* capture.start;
    yield* Effect.sleep(`${setup.seconds} seconds`);
    const pcm = yield* capture.stop;
    yield* Effect.sleep('50 millis');
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
      closedAfter: closed.length > 0,
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
