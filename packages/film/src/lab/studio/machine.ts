// The studio's recorder, as one machine: one beat at a time, the owner arms
// (the film pauses and the microphone opens), hears a count-in, records,
// stops, reviews what was recorded, and submits it; the server makes it the
// beat's take, or refuses it in its own words. A take heard as something
// else (TakeMismatch) saved an attempt, which Accept anyway keeps; any
// earlier attempt can be kept too.
//
//   Idle | Review | Failed ─Arm→ CountIn(n) ─Tick (each second)→ CountIn(n−1)
//   CountIn(1) ─CountDone→ Recording ─Stop→ Review ─Submit→ Importing
//   Importing ─Imported→ Idle (kept) | ─Refused→ Failed ─Retry→ Review | Idle
//   Failed (TakeMismatch with its attempt) ─AcceptAnyway→ Importing
//   Idle | Failed ─KeepAttempt→ Importing
//
// The microphone is the capture's; the machine opens it on Arm, starts it
// when the count-in ends, and closes it on every way out of the count-in and
// the recording (Stop takes what was kept and closes it). Side work is the
// machine's: the count-in is a state timeout, the import a state task.
// Nothing here touches the DOM: the capture, the studio API and the stage
// are services, faked in tests.

import { Clock, Duration, Effect, Match, Option, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { StudioRefusal, type StudioTake } from '../../core/studio.ts';
import { Stage } from '../stage.ts';
import { StudioApi } from './api.ts';
import { Capture } from './capture.ts';
import { encodeWav } from './wav.ts';

/** The count-in: this many seconds, one shown each second, before the recording starts. */
export const COUNT_IN = 3;

/** A recording as it is posted: a 24-bit mono WAV. */
const Wav = Schema.Uint8Array;

/** A take kept: its file, what the server heard, its word error, and whether the track was remixed. */
export const Kept = Schema.Struct({
  file: Schema.String,
  heard: Schema.String,
  wer: Schema.Finite,
  mixed: Schema.Boolean,
});
export type Kept = typeof Kept.Type;

/** What an import sends: the recording made just now, or an attempt the server keeps. */
export const Work = Schema.Union([
  Schema.TaggedStruct('Upload', { wav: Wav }),
  Schema.TaggedStruct('Keep', {
    file: Schema.String,
    acceptMismatch: Schema.Boolean,
    /** The recording under review when the keep was asked, for a Retry to go back to. */
    wav: Schema.Option(Wav),
  }),
]);
export type Work = typeof Work.Type;

export const RecorderState = State({
  /** At rest on a beat: `kept` is the take the last import kept, if it kept one. */
  Idle: { beat: Schema.String, kept: Schema.Option(Kept) },
  /** The microphone is open; the recording starts `n` seconds from now. */
  CountIn: { beat: Schema.String, n: Schema.Int },
  /** Everything the microphone hears is kept, from `startedAt` (epoch ms). */
  Recording: { beat: Schema.String, startedAt: Schema.Finite },
  /** The recording, to hear before it is submitted. */
  Review: { beat: Schema.String, wav: Wav },
  /** The server is making a take. */
  Importing: { beat: Schema.String, work: Work },
  /** Refused: the server's words (or the browser's, for the microphone), and the recording to retry. */
  Failed: { beat: Schema.String, refusal: StudioRefusal, wav: Schema.Option(Wav) },
});
export type RecorderState = typeof RecorderState.Type;

/** A microphone: a device id, or the browser's default. */
const Device = Schema.Option(Schema.String);

export const RecorderEvent = Event({
  SelectBeat: { beat: Schema.String },
  Arm: { device: Device },
  Tick: {},
  CountDone: {},
  Cancel: {},
  Stop: {},
  Retake: { device: Device },
  Submit: {},
  Discard: {},
  Imported: { kept: Kept },
  Refused: { refusal: StudioRefusal },
  AcceptAnyway: {},
  KeepAttempt: { file: Schema.String },
  Retry: {},
});
export type RecorderEvent = typeof RecorderEvent.Type;

/** A failure of the page's own (the microphone, the capture) as the panel shows a refusal. */
const localRefusal = (e: { readonly _tag: string; readonly message: string }): StudioRefusal => ({
  _tag: e._tag,
  message: e.message,
});

/** The attempt a TakeMismatch saved, which Accept anyway keeps. */
export const mismatchAttempt = (refusal: StudioRefusal): Option.Option<string> =>
  Option.filter(Option.fromUndefinedOr(refusal.attempt), () => refusal._tag === 'TakeMismatch');

/** The recording a state holds for a later Retry: the one under review, or kept by a refusal. */
const heldWav = (state: RecorderState): Option.Option<typeof Wav.Type> =>
  Match.value(state).pipe(
    Match.tag('Review', (s) => Option.some(s.wav)),
    Match.tag('Failed', (s) => s.wav),
    Match.orElse(() => Option.none()),
  );

/** The recording an import was sent with, for the refusal to keep. */
const workWav = (work: Work): Option.Option<typeof Wav.Type> =>
  Match.value(work).pipe(
    Match.tagsExhaustive({ Upload: (w) => Option.some(w.wav), Keep: (w) => w.wav }),
  );

/** Pause the film and open the microphone: the count-in, or MicDenied. */
const arm = (beat: string, device: Option.Option<string>, wav: Option.Option<typeof Wav.Type>) =>
  Effect.gen(function* () {
    yield* (yield* Stage).pause;
    return yield* (yield* Capture).open(device).pipe(
      Effect.as(RecorderState.CountIn({ beat, n: COUNT_IN })),
      Effect.catchTags({
        MicDenied: (e) =>
          Effect.succeed(RecorderState.Failed({ beat, refusal: localRefusal(e), wav })),
        CaptureFailed: (e) =>
          Effect.succeed(RecorderState.Failed({ beat, refusal: localRefusal(e), wav })),
      }),
    );
  });

/** Close the microphone (if one is open) and rest on `beat`. */
const rest = (beat: string) =>
  Effect.gen(function* () {
    yield* (yield* Capture).close;
    return RecorderState.Idle({ beat, kept: Option.none() });
  });

/** The call an import makes. */
const send = (beat: string, work: Work) =>
  StudioApi.use((api) =>
    Match.value(work).pipe(
      Match.tagsExhaustive({
        Upload: (w) => api.take(beat, w.wav),
        Keep: (w) => api.keep(beat, w.file, w.acceptMismatch),
      }),
    ),
  );

const keptOf = (take: StudioTake): Kept => ({
  file: take.take.file,
  heard: take.heard,
  wer: take.wer,
  mixed: take.mixed,
});

/** The event the count-in's second sends: the next number, or the recording. */
const countStep = (state: { readonly n: number }): RecorderEvent =>
  Match.value(state.n > 1).pipe(
    Match.when(true, () => RecorderEvent.Tick),
    Match.orElse(() => RecorderEvent.CountDone),
  );

const NOT_IMPORTING = [
  RecorderState.Idle,
  RecorderState.CountIn,
  RecorderState.Recording,
  RecorderState.Review,
  RecorderState.Failed,
] as const;

/** The recorder on `beat`, at rest. */
export const recorderMachine = (beat: string) =>
  Machine.make({
    state: RecorderState,
    event: RecorderEvent,
    initial: RecorderState.Idle({ beat, kept: Option.none() }),
  })
    .on(NOT_IMPORTING, RecorderEvent.SelectBeat, ({ event }) => rest(event.beat))
    .on(
      [RecorderState.Idle, RecorderState.Review, RecorderState.Failed],
      RecorderEvent.Arm,
      ({ state, event }) => arm(state.beat, event.device, heldWav(state)),
    )
    .on(RecorderState.Review, RecorderEvent.Retake, ({ state, event }) =>
      arm(state.beat, event.device, Option.some(state.wav)),
    )
    .timeout(RecorderState.CountIn, { duration: Duration.seconds(1), event: countStep })
    .reenter(RecorderState.CountIn, RecorderEvent.Tick, ({ state }) =>
      RecorderState.CountIn({ beat: state.beat, n: state.n - 1 }),
    )
    .on(RecorderState.CountIn, RecorderEvent.CountDone, ({ state }) =>
      Effect.gen(function* () {
        const capture = yield* Capture;
        return yield* capture.start.pipe(
          Effect.andThen(Clock.currentTimeMillis),
          Effect.map((startedAt) => RecorderState.Recording({ beat: state.beat, startedAt })),
          Effect.catchTag('CaptureFailed', (e) =>
            capture.close.pipe(
              Effect.as(
                RecorderState.Failed({
                  beat: state.beat,
                  refusal: localRefusal(e),
                  wav: Option.none(),
                }),
              ),
            ),
          ),
        );
      }),
    )
    .on([RecorderState.CountIn, RecorderState.Recording], RecorderEvent.Cancel, ({ state }) =>
      rest(state.beat),
    )
    .on(RecorderState.Recording, RecorderEvent.Stop, ({ state }) =>
      Effect.gen(function* () {
        const capture = yield* Capture;
        return yield* capture.stop.pipe(
          Effect.map((pcm) => RecorderState.Review({ beat: state.beat, wav: encodeWav(pcm) })),
          Effect.catchTag('CaptureFailed', (e) =>
            capture.close.pipe(
              Effect.as(
                RecorderState.Failed({
                  beat: state.beat,
                  refusal: localRefusal(e),
                  wav: Option.none(),
                }),
              ),
            ),
          ),
        );
      }),
    )
    .on(RecorderState.Review, RecorderEvent.Submit, ({ state }) =>
      RecorderState.Importing({ beat: state.beat, work: { _tag: 'Upload', wav: state.wav } }),
    )
    .on(RecorderState.Review, RecorderEvent.Discard, ({ state }) =>
      RecorderState.Idle({ beat: state.beat, kept: Option.none() }),
    )
    .task(RecorderState.Importing, ({ state }) => send(state.beat, state.work), {
      onSuccess: (take) => RecorderEvent.Imported({ kept: keptOf(take) }),
      onFailure: (e) => RecorderEvent.Refused({ refusal: e.refusal }),
    })
    .on(RecorderState.Importing, RecorderEvent.Imported, ({ state, event }) =>
      RecorderState.Idle({ beat: state.beat, kept: Option.some(event.kept) }),
    )
    .on(RecorderState.Importing, RecorderEvent.Refused, ({ state, event }) =>
      RecorderState.Failed({ beat: state.beat, refusal: event.refusal, wav: workWav(state.work) }),
    )
    .when(
      RecorderState.Failed,
      RecorderEvent.AcceptAnyway,
      ({ state }) => Option.isSome(mismatchAttempt(state.refusal)),
      ({ state }) =>
        Option.match(mismatchAttempt(state.refusal), {
          onNone: () => state,
          onSome: (file) =>
            RecorderState.Importing({
              beat: state.beat,
              work: { _tag: 'Keep', file, acceptMismatch: true, wav: state.wav },
            }),
        }),
    )
    .on([RecorderState.Idle, RecorderState.Failed], RecorderEvent.KeepAttempt, ({ state, event }) =>
      RecorderState.Importing({
        beat: state.beat,
        work: { _tag: 'Keep', file: event.file, acceptMismatch: false, wav: heldWav(state) },
      }),
    )
    .on(RecorderState.Failed, RecorderEvent.Retry, ({ state }) =>
      Option.match(state.wav, {
        onNone: () => RecorderState.Idle({ beat: state.beat, kept: Option.none() }),
        onSome: (wav) => RecorderState.Review({ beat: state.beat, wav }),
      }),
    );

/** The recorder's actor on `beat`, started. */
export const spawnRecorder = (beat: string) =>
  Machine.spawn(recorderMachine(beat)).pipe(Effect.tap((actor) => actor.start));

export type RecorderActor = Effect.Success<ReturnType<typeof spawnRecorder>>;
