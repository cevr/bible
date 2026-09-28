// The capture's browser test page: the real AudioWorklet capture, driven the
// way the recorder drives it (open, start, stop), exposed as
// `window.captureProbe(seconds)` for the test to call. It answers what was
// recorded (the rate, the length, the loudest sample and the RMS) and what
// the meter saw, or the refusal the microphone gave.

import { Effect, Option, Stream } from 'effect';
import { Capture, type Level } from '../studio/capture.ts';
import { browserCaptureLayer } from '../studio/capture-browser.ts';

/** What one probe found. */
export interface Probed {
  readonly refused: string;
  readonly rate: number;
  readonly contextRate: number;
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
  contextRate: 0,
  frames: 0,
  peak: 0,
  rms: 0,
  levels: 0,
  loudest: 0,
  closedAfter: false,
};

const probe = (seconds: number) =>
  Effect.gen(function* () {
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
    yield* Effect.sleep(`${seconds} seconds`);
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
      contextRate: new AudioContext().sampleRate,
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

Reflect.set(window, 'captureProbe', (seconds: number) => Effect.runPromise(probe(seconds)));
