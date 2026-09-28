// The capture in the browser: the microphone through getUserMedia with every
// processing stage off (no echo cancelling, noise suppression or gain
// control), one channel, into an AudioWorklet on an AudioContext at the
// device's native rate. The worklet hands each block of float PCM to the
// page untouched; the page keeps the blocks from `start` and, on `stop`,
// flushes the worklet's last part-block and joins them: nothing resampled,
// nothing compressed, never MediaRecorder. Each block's peak and RMS feed
// the meter while the microphone is open.
//
// The capture owns the one microphone it has open, in a scope of its own
// (the tracks, the context, the node's connection): `close` and `stop` close
// it, as does the layer's scope when the page goes. One call at a time.

import { Effect, Exit, Layer, Option, PubSub, Schema, Scope, Semaphore, Stream } from 'effect';
import { Capture, type CaptureOps, CaptureFailed, type Level, MicDenied } from './capture.ts';
import type { Pcm } from './wav.ts';
import { PROCESSOR, workletSource } from './worklet.ts';

/** A block as the worklet posts it, checked at the thread boundary. */
const Block = Schema.Struct({
  samples: Schema.instanceOf(Float32Array),
  peak: Schema.Finite,
  rms: Schema.Finite,
  last: Schema.Boolean,
});
const decodeBlock = Schema.decodeUnknownOption(Block);

/** How long a stop waits for the worklet's last part-block. */
const FLUSH_WAIT = '1 second';

/** How long the context may stay suspended once asked to run. */
const RESUME_WAIT = '3 seconds';

/** The constraints for `device` (the default when none): raw, mono. */
export const audioConstraints = (device: Option.Option<string>): MediaTrackConstraints => ({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
  ...Option.match(device, {
    onNone: () => ({}),
    onSome: (id) => ({ deviceId: { exact: id } }),
  }),
});

/** Why getUserMedia gave no microphone, by the DOMException's name, in the owner's words. */
const DENIED = new Map([
  ['NotAllowedError', 'the browser was not allowed to use it; allow the microphone for this page'],
  ['NotFoundError', 'none is plugged in'],
  ['NotReadableError', 'another app holds it'],
  ['OverconstrainedError', 'the microphone picked is gone; pick another'],
]);

const isDomException = Schema.is(Schema.instanceOf(DOMException));

/** What a rejection `name`d so means, else its own words. */
const deniedReason = (rejection: { readonly name: string; readonly message: string }): string =>
  Option.getOrElse(Option.fromUndefinedOr(DENIED.get(rejection.name)), () =>
    `${rejection.name}: ${rejection.message}`.trim(),
  );

/** One open microphone: what the worklet hands over, and what is kept of it. */
interface OpenMic {
  readonly scope: Scope.Closeable;
  readonly node: AudioWorkletNode;
  readonly rate: number;
  keeping: boolean;
  kept: Array<Float32Array>;
  frames: number;
  flushed: Option.Option<() => void>;
}

/** Every kept block, joined. */
const joined = (mic: OpenMic): Pcm => {
  const samples = new Float32Array(mic.frames);
  let at = 0;
  for (const block of mic.kept) {
    samples.set(block, at);
    at += block.length;
  }
  return { rate: mic.rate, samples };
};

const failed = (reason: string) => CaptureFailed.make({ reason });

export const makeBrowserCapture = Effect.gen(function* () {
  const levels = yield* PubSub.sliding<Option.Option<Level>>(8);
  const lock = yield* Semaphore.make(1);
  const moduleUrl = URL.createObjectURL(new Blob([workletSource], { type: 'text/javascript' }));
  let mic = Option.none<OpenMic>();

  /** A block from the worklet: the meter's reading, kept after `start`, and a flush's end. */
  const heard = (open: OpenMic, block: typeof Block.Type) => {
    if (open.keeping) {
      open.kept.push(block.samples);
      open.frames += block.samples.length;
    }
    PubSub.publishUnsafe(
      levels,
      Option.some({ peak: block.peak, rms: block.rms, kept: open.frames / open.rate }),
    );
    if (block.last) Option.map(open.flushed, (done) => done());
  };

  const closeMic = Effect.suspend(() =>
    Option.match(mic, {
      onNone: () => Effect.void,
      onSome: (open) => {
        mic = Option.none();
        return Scope.close(open.scope, Exit.void).pipe(
          Effect.andThen(PubSub.publish(levels, Option.none())),
          Effect.asVoid,
        );
      },
    }),
  );

  /** The microphone `device`, open in `scope`: the stream, the context, the worklet, connected. */
  const acquire = (device: Option.Option<string>, scope: Scope.Closeable) =>
    Effect.gen(function* () {
      const stream = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => navigator.mediaDevices.getUserMedia({ audio: audioConstraints(device) }),
          catch: (error) =>
            MicDenied.make({
              reason: Option.match(Option.filter(Option.some(error), isDomException), {
                onNone: () => String(error),
                onSome: deniedReason,
              }),
            }),
        }),
        (s) => Effect.sync(() => s.getTracks().forEach((t) => t.stop())),
      );
      const context = yield* Effect.acquireRelease(
        Effect.sync(() => new AudioContext()),
        (c) => Effect.promise(() => c.close()).pipe(Effect.ignore),
      );
      yield* Effect.tryPromise({
        try: () => context.audioWorklet.addModule(moduleUrl),
        catch: (error) => failed(`the capture worklet did not load: ${String(error)}`),
      });
      yield* Effect.tryPromise({
        try: () => context.resume(),
        catch: (error) => failed(`the audio did not start: ${String(error)}`),
      }).pipe(
        Effect.timeoutOrElse({
          duration: RESUME_WAIT,
          orElse: () =>
            Effect.fail(failed('the browser kept the audio suspended; click the page, then arm')),
        }),
      );
      const source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, PROCESSOR, {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      });
      const open: OpenMic = {
        scope,
        node,
        rate: context.sampleRate,
        keeping: false,
        kept: [],
        frames: 0,
        flushed: Option.none(),
      };
      // Each block is checked as it crosses from the audio thread.
      node.port.onmessage = (e: MessageEvent) =>
        void Option.map(decodeBlock(e.data), (block) => heard(open, block));
      source.connect(node);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          node.port.close();
          source.disconnect();
        }),
      );
      return open;
    }).pipe(Scope.provide(scope));

  const open: CaptureOps['open'] = (device) =>
    lock.withPermits(1)(
      Effect.gen(function* () {
        yield* closeMic;
        const scope = yield* Scope.make();
        const opened = yield* acquire(device, scope).pipe(
          Effect.onError(() => Scope.close(scope, Exit.void)),
        );
        mic = Option.some(opened);
        yield* Effect.logInfo(`studio.mic.open rate=${opened.rate}`);
      }),
    );

  const theMic = Effect.suspend(() =>
    Option.match(mic, {
      onNone: () => Effect.fail(failed('no microphone is open')),
      onSome: Effect.succeed,
    }),
  );

  const start: CaptureOps['start'] = lock.withPermits(1)(
    Effect.map(theMic, (m) => {
      m.kept = [];
      m.frames = 0;
      m.keeping = true;
    }),
  );

  /** The worklet's last part-block, or nothing more once FLUSH_WAIT has passed. */
  const flush = (m: OpenMic) =>
    Effect.callback<void>((resume) => {
      m.flushed = Option.some(() => resume(Effect.void));
      m.node.port.postMessage('flush');
    }).pipe(Effect.timeoutOption(FLUSH_WAIT), Effect.asVoid);

  const stop: CaptureOps['stop'] = lock.withPermits(1)(
    Effect.gen(function* () {
      const m = yield* theMic;
      yield* flush(m);
      m.keeping = false;
      const pcm = joined(m);
      yield* closeMic;
      yield* Effect.logInfo(
        `studio.mic.stop rate=${pcm.rate} secs=${(pcm.samples.length / pcm.rate).toFixed(2)}`,
      );
      return pcm;
    }),
  );

  const devices: CaptureOps['devices'] = Effect.tryPromise(() =>
    navigator.mediaDevices.enumerateDevices(),
  ).pipe(
    Effect.map((all) =>
      all.filter((d) => d.kind === 'audioinput').map((d) => ({ id: d.deviceId, label: d.label })),
    ),
    Effect.orElseSucceed(() => []),
  );

  yield* Effect.addFinalizer(() =>
    closeMic.pipe(Effect.andThen(Effect.sync(() => URL.revokeObjectURL(moduleUrl)))),
  );

  return Capture.of({
    open,
    start,
    stop,
    close: lock.withPermits(1)(closeMic),
    levels: Stream.fromPubSub(levels),
    devices,
  });
});

/** The capture over the page's microphone, closed with the layer's scope. */
export const browserCaptureLayer: Layer.Layer<Capture> = Layer.effect(Capture, makeBrowserCapture);
