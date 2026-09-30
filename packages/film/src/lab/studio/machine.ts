// The studio's recorder, as one machine: one beat at a time, the owner arms
// (the film pauses and the microphone opens), hears a count-in, records,
// stops, reviews what was recorded, and submits it; the server makes it the
// beat's take, or refuses it in its own words. A take heard as something
// else (TakeMismatch) saved an attempt, which Accept anyway keeps; any
// earlier attempt can be kept too.
//
//   Idle | Review | Failed ─Arm→ CountIn(n) ─Tick (each second)→ CountIn(n−1)
//   CountIn(1) ─CountDone→ Recording ─Stop (or the take limit)→ Review ─Submit→ Importing
//   Recording ─MicLost (the device went)→ Failed (what was kept, to review)
//   Importing ─Imported→ Idle (kept; the page reloads when the track was
//     remixed) | ─Refused→ Failed ─Retry→ Review | Idle
//   Importing ─ImportUnanswered (STUDIO_IMPORT_WAIT_S)→ Checking (the beat's
//     attempts read back) ─Imported→ Idle | ─Refused→ Failed (an upload's
//     recording is not kept to send again: the lab may have it)
//   Failed (TakeMismatch with its attempt) ─AcceptAnyway→ Importing
//   Idle | Failed ─KeepAttempt→ Importing
//
// The microphone is the capture's; the machine opens it on Arm, starts it
// when the count-in ends, and closes it on every way out of the count-in and
// the recording (Stop takes what was kept and closes it). Side work is the
// machine's: the count-in is a state timeout, the import a state task, and
// the recording watches for its microphone going away.
// Nothing here touches the DOM: the capture, the studio API and the stage
// are services, faked in tests.

import { Clock, Duration, Effect, Match, Option, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import {
  STUDIO_IMPORT_WAIT_S,
  type StudioAttempt,
  StudioRefusal,
  type StudioTake,
} from '../../core/studio.ts';
import { Stage } from '../stage.ts';
import { StudioApi, StudioRefused, minutes, takeLimit } from './api.ts';
import { Capture, MicLost } from './capture.ts';
import { encodeWav } from './wav.ts';

/** The count-in: this many seconds, one shown each second, before the recording starts. */
export const COUNT_IN = 3;

/**
 * How long a take may run at the capture's `rate`: a second under the
 * longest the studio reads, so the part-block the stop flushes and the one
 * before the start still fit.
 */
export const limitAt = (rate: number): number => takeLimit(rate).seconds - 1;

/** A recording as it is posted: a 24-bit mono WAV. */
const Wav = Schema.Uint8Array;

/**
 * A take kept: its file, what the server heard, its word error, and the mix:
 * the track remixed with it, the mix failed, or no answer came to say (the
 * page stopped waiting and read the take as kept from the attempts).
 */
export const Kept = Schema.Struct({
  file: Schema.String,
  heard: Schema.String,
  wer: Schema.Finite,
  mix: Schema.Literals(['mixed', 'failed', 'unanswered']),
});
export type Kept = typeof Kept.Type;

/** What an import sends: the recording made just now, or an attempt the server keeps. */
const Work = Schema.Union([
  Schema.TaggedStruct('Upload', { wav: Wav }),
  Schema.TaggedStruct('Keep', {
    file: Schema.String,
    acceptMismatch: Schema.Boolean,
    /** The recording under review when the keep was asked, for a Retry to go back to. */
    wav: Schema.Option(Wav),
  }),
]);
type Work = typeof Work.Type;

export const RecorderState = State({
  /** At rest on a beat: `kept` is the take the last import kept, if it kept one. */
  Idle: { beat: Schema.String, kept: Schema.Option(Kept) },
  /** The microphone is open; the recording starts `n` seconds from now. */
  CountIn: { beat: Schema.String, n: Schema.Int },
  /** Everything the microphone hears is kept, from `startedAt` (epoch ms). */
  Recording: {
    beat: Schema.String,
    startedAt: Schema.Finite,
    /** The seconds after which the take stops itself (`limitAt` the capture's rate). */
    limit: Schema.Finite,
  },
  /** The recording, to hear before it is submitted. */
  Review: { beat: Schema.String, wav: Wav },
  /** The server is making a take. */
  Importing: { beat: Schema.String, work: Work },
  /**
   * No answer came in STUDIO_IMPORT_WAIT_S: the beat's attempts are read to
   * learn what became of the work, sent at `since` (epoch ms) or after.
   */
  Checking: { beat: Schema.String, work: Work, since: Schema.Finite },
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
  /** The microphone went away mid-take. */
  MicLost: {},
  Retake: { device: Device },
  Submit: {},
  Discard: {},
  Imported: { kept: Kept },
  Refused: { refusal: StudioRefusal },
  /** STUDIO_IMPORT_WAIT_S passed with no answer. */
  ImportUnanswered: {},
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

/**
 * Stop the capture and go where `then` says with the WAV of what was kept; a
 * capture that fails (its last samples lost) closes and fails with no take.
 */
const stopped = (beat: string, then: (wav: typeof Wav.Type) => RecorderState) =>
  Effect.gen(function* () {
    const capture = yield* Capture;
    return yield* capture.stop.pipe(
      Effect.map((pcm) => then(encodeWav(pcm))),
      Effect.catchTag('CaptureFailed', (e) =>
        capture.close.pipe(
          Effect.as(RecorderState.Failed({ beat, refusal: localRefusal(e), wav: Option.none() })),
        ),
      ),
    );
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
  mix: Match.value(take.mixed).pipe(
    Match.when(true, () => 'mixed' as const),
    Match.orElse(() => 'failed' as const),
  ),
});

/** How the wait reads in the owner's words. */
const WAITED = minutes(STUDIO_IMPORT_WAIT_S);

/** Attempts listed within this long before the wait began may be the upload's (the clocks are one machine's). */
const SLACK_MS = 10_000;

/** An import that got no answer, in the owner's words. */
const unanswered = (message: string): StudioRefusal => ({ _tag: 'ImportUnanswered', message });

/**
 * What became of `work`, from the beat's `attempts` as the server lists them
 * now (newest first): kept (the mix unanswered), or refused in words. An
 * upload is the newest attempt made `since`; a keep, its file.
 */
export const settle = (
  work: Work,
  since: number,
  attempts: ReadonlyArray<StudioAttempt>,
): RecorderEvent => {
  const found = Match.value(work).pipe(
    Match.tagsExhaustive({
      Upload: () => Option.fromUndefinedOr(attempts.find((a) => a.at >= since)),
      Keep: (w) => Option.fromUndefinedOr(attempts.find((a) => a.file === w.file)),
    }),
  );
  return Option.match(found, {
    onNone: () =>
      RecorderEvent.Refused({
        refusal: unanswered(
          `the lab did not answer within ${WAITED}, and lists no attempt of this take yet: it may still be making it (the lab log says). Keep it from the attempts once it shows, or record again`,
        ),
      }),
    onSome: (a) => {
      if (a.kept)
        return RecorderEvent.Imported({
          kept: { file: a.file, heard: a.heard, wer: a.wer, mix: 'unanswered' },
        });
      return RecorderEvent.Refused({
        refusal: unanswered(
          `the lab did not answer within ${WAITED}; it heard the take as “${a.heard}” (${(a.wer * 100).toFixed(1)}% words differ) and did not keep it: keep it from the attempts below, or record again`,
        ),
      });
    },
  });
};

/**
 * The recording a Checking refusal keeps for Retry: never an upload's (the
 * lab may have it, and a Retry would post it again), a keep's review yes (it
 * was never posted).
 */
const uncheckedWav = (work: Work): Option.Option<typeof Wav.Type> =>
  Match.value(work).pipe(Match.tagsExhaustive({ Upload: () => Option.none(), Keep: (w) => w.wav }));

/** How long reading the attempts may take once the wait is over. */
const CHECK_WAIT = Duration.seconds(15);

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
          Effect.flatMap((rate) =>
            Effect.map(Clock.currentTimeMillis, (startedAt) =>
              RecorderState.Recording({ beat: state.beat, startedAt, limit: limitAt(rate) }),
            ),
          ),
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
    // A take stops itself at the limit, before the studio would refuse it.
    .timeout(RecorderState.Recording, {
      duration: (state) => Duration.seconds(state.limit),
      event: RecorderEvent.Stop,
    })
    .on(RecorderState.Recording, RecorderEvent.Stop, ({ state }) =>
      stopped(state.beat, (wav) => RecorderState.Review({ beat: state.beat, wav })),
    )
    .task(RecorderState.Recording, () => Capture.use((capture) => capture.lost), {
      onSuccess: () => RecorderEvent.MicLost,
    })
    // What was kept before the device went is the take's to hear: Back reviews it.
    .on(RecorderState.Recording, RecorderEvent.MicLost, ({ state }) =>
      stopped(state.beat, (wav) =>
        RecorderState.Failed({
          beat: state.beat,
          refusal: localRefusal(MicLost.make({})),
          wav: Option.some(wav),
        }),
      ),
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
    .on(
      [RecorderState.Importing, RecorderState.Checking],
      RecorderEvent.Imported,
      ({ state, event }) =>
        Effect.gen(function* () {
          // The player reads the timings and the track once, at load: a take
          // mixed into the track plays only after a reload, at this same T. A
          // mix that failed, or never answered, reloads nothing, so the status
          // can say why.
          if (event.kept.mix === 'mixed') yield* (yield* Stage).reload;
          return RecorderState.Idle({ beat: state.beat, kept: Option.some(event.kept) });
        }),
    )
    .on(RecorderState.Importing, RecorderEvent.Refused, ({ state, event }) =>
      RecorderState.Failed({ beat: state.beat, refusal: event.refusal, wav: workWav(state.work) }),
    )
    // An import with no answer is never sent again blind: the attempts say
    // whether the lab kept it (derived from its ledger, not guessed).
    .timeout(RecorderState.Importing, {
      duration: Duration.seconds(STUDIO_IMPORT_WAIT_S),
      event: RecorderEvent.ImportUnanswered,
    })
    .on(RecorderState.Importing, RecorderEvent.ImportUnanswered, ({ state }) =>
      Effect.map(Clock.currentTimeMillis, (now) =>
        RecorderState.Checking({
          beat: state.beat,
          work: state.work,
          since: now - STUDIO_IMPORT_WAIT_S * 1000 - SLACK_MS,
        }),
      ),
    )
    .task(
      RecorderState.Checking,
      ({ state }) =>
        StudioApi.use((api) => api.attempts(state.beat)).pipe(
          Effect.timeoutOrElse({
            duration: CHECK_WAIT,
            orElse: () =>
              Effect.fail(
                StudioRefused.make({
                  refusal: { _tag: 'LabUnreachable', message: 'no answer to that either' },
                }),
              ),
          }),
          Effect.map((listed) => settle(state.work, state.since, listed.attempts)),
        ),
      {
        onSuccess: (event) => event,
        onFailure: (e) =>
          RecorderEvent.Refused({
            refusal: unanswered(
              `the lab did not answer within ${WAITED}, nor list the attempts to say whether it kept the take (${e.message}): see the lab log, then record again or keep it from the attempts`,
            ),
          }),
      },
    )
    .on(RecorderState.Checking, RecorderEvent.Refused, ({ state, event }) =>
      RecorderState.Failed({
        beat: state.beat,
        refusal: event.refusal,
        wav: uncheckedWav(state.work),
      }),
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
