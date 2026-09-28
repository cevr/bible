// The studio's microphone, as the recorder machine drives it. The capture
// owns the one microphone it opens (at most one at a time): `open` asks the
// browser for it and starts its level meter, `start` keeps what it hears from
// then on, `stop` hands back what was kept and closes it, `close` drops it.
// The machine never holds the device: it opens it on Arm, starts it when the
// count-in ends, and every state but the count-in and the recording closes
// it on entry, so no path leaves a microphone open. The real capture is an
// AudioWorklet (`capture-browser.ts`); the tests give a fake.

import { Context, type Effect, Option, Schema, type Stream } from 'effect';
import type { Pcm } from './wav.ts';

/** The browser gave no microphone: denied, none plugged in, or in use. */
export class MicDenied extends Schema.TaggedError<MicDenied>()('MicDenied', {
  reason: Schema.String,
}) {
  override get message() {
    return `no microphone: ${this.reason}`;
  }
}

/** The capture broke after the microphone was given (the worklet, the audio context). */
export class CaptureFailed extends Schema.TaggedError<CaptureFailed>()('CaptureFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `the recording stopped: ${this.reason}`;
  }
}

/** What the meter shows: the loudest sample and the RMS of the last block, linear 0–1, and the seconds kept. */
export const Level = Schema.Struct({
  peak: Schema.Finite,
  rms: Schema.Finite,
  /** Seconds kept since `start`; 0 before it. */
  kept: Schema.Finite,
});
export type Level = typeof Level.Type;

/** A microphone the browser lists. */
export const MicDevice = Schema.Struct({ id: Schema.String, label: Schema.String });
export type MicDevice = typeof MicDevice.Type;

export interface CaptureOps {
  /**
   * Open microphone `device` (the browser's default when none), unprocessed:
   * no echo cancelling, noise suppression or gain control. The meter runs;
   * nothing is kept yet. A microphone already open is closed first.
   */
  readonly open: (device: Option.Option<string>) => Effect.Effect<void, MicDenied | CaptureFailed>;
  /** Keep what the open microphone hears from now on. */
  readonly start: Effect.Effect<void, CaptureFailed>;
  /** What was kept since `start`, at the capture's own rate; the microphone is closed. */
  readonly stop: Effect.Effect<Pcm, CaptureFailed>;
  /** Close the microphone, keeping nothing; nothing happens when none is open. */
  readonly close: Effect.Effect<void>;
  /** The open microphone's level, as each block is measured; none while it is closed. */
  readonly levels: Stream.Stream<Option.Option<Level>>;
  /** The microphones the browser lists (their labels once one was allowed). */
  readonly devices: Effect.Effect<ReadonlyArray<MicDevice>>;
}

export class Capture extends Context.Service<Capture, CaptureOps>()('@bible/film/lab/Capture') {}

/** A level in dBFS; −∞ for silence. */
export const dbfs = (linear: number): number => 20 * Math.log10(linear);

/** A peak at or above −1 dBFS is a hair from clipping: the meter warns to turn the input down. */
export const CLIP_DBFS = -1;

/** Whether `level`'s peak is at or past the clip warning. */
export const clipping = (level: Option.Option<Level>): boolean =>
  Option.exists(level, (l) => dbfs(l.peak) >= CLIP_DBFS);
