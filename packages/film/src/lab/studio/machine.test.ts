// The recorder machine, with no DOM: Arm opens the microphone (a denied one
// fails with MicDenied) and counts in, on the TestClock, one a second; the
// count's end starts the capture; Stop makes the WAV to review; Submit posts
// it and a take kept rests with what was heard, a refusal fails with the
// server's words and the recording kept for Retry. Accept anyway keeps the
// attempt a TakeMismatch saved, and only that; a beat cannot be changed while
// a take is importing. Whatever path is taken, the microphone is closed once
// the machine leaves the count-in and the recording.

import {
  Deferred,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Stream,
  SubscriptionRef,
} from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'effect-bun-test';
import { Machine, assertNeverReaches, assertPath, simulate } from 'effect-machine';
import type { StudioRefusal, StudioTake } from '../../core/studio.ts';
import { Stage, type StageOps } from '../stage.ts';
import { StudioApi, type StudioCalls, StudioRefused } from './api.ts';
import { Capture, type CaptureOps, MicDenied } from './capture.ts';
import { COUNT_IN, RecorderEvent, RecorderState, limitAt, recorderMachine } from './machine.ts';
import { type Pcm, encodeWav } from './wav.ts';

const pcm: Pcm = { rate: 48000, samples: Float32Array.of(0, 0.25, -0.25, 0.5) };
const wav = encodeWav(pcm);

const mismatch: StudioRefusal = {
  _tag: 'TakeMismatch',
  message: 'TakeMismatch: a heard "hello word" (50.0% of words differ)',
  beat: 'a',
  script: 'hello world',
  heard: 'hello word',
  wer: 0.5,
  attempt: 'a.1234.flac',
};

const took: StudioTake = {
  beat: 'a',
  take: { hash: 'h', file: 'a.1234.flac', duration: 1.2, words: [], source: 'recorded' },
  heard: 'hello world',
  wer: 0,
  timings: { voice: 'v', scenes: {} },
  mixed: true,
};

/** What the fakes were asked, in order, and whether the microphone is open now. */
interface Log {
  readonly calls: Array<string>;
  open: boolean;
}

/**
 * A capture that opens any microphone but `denied`, a stage that says what
 * was asked of it, and a studio whose posts answer `answers` in turn (the
 * last one again once they run out; a take kept when none are given).
 */
const fakes = (...answers: ReadonlyArray<Effect.Effect<StudioTake, StudioRefused>>) => {
  const log: Log = { calls: [], open: false };
  const say = (call: string) => Effect.sync(() => void log.calls.push(call));
  /** Done, the open microphone's track ends (unplugged). */
  const lose = Deferred.makeUnsafe<void>();
  let posts = 0;
  const next = () =>
    Effect.suspend(() => {
      const answer = answers[Math.min(posts, answers.length - 1)] ?? Effect.succeed(took);
      posts += 1;
      return answer;
    });
  const capture: CaptureOps = {
    open: (device) =>
      Effect.suspend(() => {
        const id = Option.getOrElse(device, () => 'default');
        if (id === 'denied') return Effect.fail(MicDenied.make({ reason: 'NotAllowedError' }));
        log.open = true;
        return say(`open ${id}`);
      }),
    start: say('start').pipe(Effect.as(pcm.rate)),
    stop: Effect.sync(() => {
      log.open = false;
      log.calls.push('stop');
      return pcm;
    }),
    close: Effect.sync(() => {
      if (log.open) log.calls.push('close');
      log.open = false;
    }),
    levels: Stream.make(Option.none()),
    devices: Effect.succeed([]),
    lost: Deferred.await(lose),
  };
  const api: StudioCalls = {
    beats: Effect.die('not asked'),
    attempts: () => Effect.die('not asked'),
    take: (beat, bytes) => say(`take ${beat} ${bytes.length} bytes`).pipe(Effect.andThen(next())),
    keep: (beat, file, accept) =>
      say(`keep ${beat} ${file} ${accept}`).pipe(Effect.andThen(next())),
  };
  const stage: StageOps = {
    preview: () => Effect.die('not asked'),
    unpreview: () => Effect.die('not asked'),
    timelineOf: () => ({}),
    knobsOf: () => ({}),
    holdT: say('holdT'),
    reload: say('reload'),
    settle: say('settle'),
    pause: say('pause'),
    duration: 10,
    cueSpan: () => Option.none(),
    playFrom: () => Effect.void,
    still: () => Effect.die('not asked'),
  };
  const layer = Layer.mergeAll(
    Layer.succeed(Capture, capture),
    Layer.succeed(StudioApi, api),
    Layer.succeed(Stage, stage),
  );
  return { log, layer, lose };
};

const machine = recorderMachine('a');
const arm = RecorderEvent.Arm({ device: Option.none() });
const armed = [arm, ...Array.from({ length: COUNT_IN - 1 }, () => RecorderEvent.Tick)];
const recorded = [...armed, RecorderEvent.CountDone, RecorderEvent.Stop];

describe('arming', () => {
  it.effect('Arm pauses the film, opens the microphone chosen and counts in from COUNT_IN', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const chosen = RecorderEvent.Arm({ device: Option.some('usb') });
      const result = yield* simulate(machine, [chosen]);
      expect(result.finalState).toEqual(RecorderState.CountIn({ beat: 'a', n: COUNT_IN }));
      expect(log.calls).toEqual(['pause', 'open usb']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('a denied microphone fails with MicDenied, and Retry rests', () => {
    const { layer } = fakes();
    return Effect.gen(function* () {
      const denied = RecorderEvent.Arm({ device: Option.some('denied') });
      const result = yield* simulate(machine, [denied, RecorderEvent.Retry]);
      expect(result.states[1]).toEqual(
        RecorderState.Failed({
          beat: 'a',
          refusal: { _tag: 'MicDenied', message: 'no microphone: NotAllowedError' },
          wav: Option.none(),
        }),
      );
      expect(result.finalState).toEqual(RecorderState.Idle({ beat: 'a', kept: Option.none() }));
    }).pipe(Effect.provide(layer));
  });

  it.effect('each Tick counts one down, and CountDone starts the capture', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      yield* assertPath(
        machine,
        [...armed, RecorderEvent.CountDone],
        ['Idle', ...Array.from({ length: COUNT_IN }, () => 'CountIn'), 'Recording'],
      );
      expect(log.calls).toEqual(['pause', 'open default', 'start']);
      expect(log.open).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect('Cancel in the count-in rests and closes the microphone', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      yield* assertPath(machine, [arm, RecorderEvent.Cancel], ['Idle', 'CountIn', 'Idle']);
      expect(log.open).toBe(false);
      expect(log.calls.at(-1)).toBe('close');
    }).pipe(Effect.provide(layer));
  });

  it.effect('Cancel in the recording rests and closes the microphone, keeping nothing', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      yield* assertPath(
        machine,
        [...armed, RecorderEvent.CountDone, RecorderEvent.Cancel],
        ['Idle', ...Array.from({ length: COUNT_IN }, () => 'CountIn'), 'Recording', 'Idle'],
      );
      expect(log.open).toBe(false);
      expect(log.calls.at(-1)).toBe('close');
    }).pipe(Effect.provide(layer));
  });
});

describe('the count-in, through an actor', () => {
  it.effect('counts down one a second on the clock, then records from that moment', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const actor = yield* Machine.spawn(machine);
      yield* actor.start;
      yield* actor.sendAndWait(arm, RecorderState.CountIn);
      const seen: Array<RecorderState> = [];
      for (const _ of Array.from({ length: COUNT_IN + 1 })) {
        seen.push(yield* SubscriptionRef.get(actor.state));
        yield* TestClock.adjust('1 second');
      }
      expect(seen).toEqual([
        ...Array.from({ length: COUNT_IN }, (_, i) =>
          RecorderState.CountIn({ beat: 'a', n: COUNT_IN - i }),
        ),
        RecorderState.Recording({ beat: 'a', startedAt: COUNT_IN * 1000, limit: limitAt(48000) }),
      ]);
      expect(log.calls).toEqual(['pause', 'open default', 'start']);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect('a count-in cancelled never starts the capture', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const actor = yield* Machine.spawn(machine);
      yield* actor.start;
      yield* actor.sendAndWait(arm, RecorderState.CountIn);
      yield* TestClock.adjust('1 second');
      yield* actor.send(RecorderEvent.Cancel);
      yield* TestClock.adjust(`${COUNT_IN} seconds`);
      expect((yield* SubscriptionRef.get(actor.state))._tag).toBe('Idle');
      expect(log.calls).toEqual(['pause', 'open default', 'close']);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });
});

describe('the take limit', () => {
  it.effect('is a second under the longest take the studio reads at the capture rate', () =>
    Effect.sync(() => {
      expect(limitAt(48000)).toBeCloseTo(348.5, 1);
      expect(limitAt(44100)).toBeCloseTo(379.4, 1);
    }),
  );

  it.effect('a recording that reaches it stops itself, to review', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const actor = yield* Machine.spawn(machine);
      yield* actor.start;
      yield* actor.sendAndWait(arm, RecorderState.CountIn);
      yield* TestClock.adjust(`${COUNT_IN} seconds`);
      yield* TestClock.adjust(Duration.seconds(limitAt(48000) - 1));
      expect((yield* SubscriptionRef.get(actor.state))._tag).toBe('Recording');
      yield* TestClock.adjust('1 second');
      expect(yield* actor.waitFor(RecorderState.Review)).toEqual(
        RecorderState.Review({ beat: 'a', wav }),
      );
      expect(log.calls).toEqual(['pause', 'open default', 'start', 'stop']);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });
});

describe('a microphone lost mid-take', () => {
  it.effect(
    'fails the take as MicLost, keeping what was recorded before it to hear; Back reviews it',
    () => {
      const { log, layer, lose } = fakes();
      return Effect.gen(function* () {
        const actor = yield* Machine.spawn(machine);
        yield* actor.start;
        yield* actor.sendAndWait(arm, RecorderState.CountIn);
        yield* TestClock.adjust(`${COUNT_IN} seconds`);
        expect((yield* SubscriptionRef.get(actor.state))._tag).toBe('Recording');
        yield* Deferred.done(lose, Exit.void);
        const failed = yield* actor.waitFor(RecorderState.Failed);
        expect(failed).toEqual(
          RecorderState.Failed({
            beat: 'a',
            refusal: {
              _tag: 'MicLost',
              message:
                'the microphone went away (unplugged, or another app took it); the recording up to then is kept: Back (Esc) to hear it',
            },
            wav: Option.some(wav),
          }),
        );
        expect(log.calls).toEqual(['pause', 'open default', 'start', 'stop']);
        expect(log.open).toBe(false);
        yield* actor.send(RecorderEvent.Retry);
        expect(yield* actor.waitFor(RecorderState.Review)).toEqual(
          RecorderState.Review({ beat: 'a', wav }),
        );
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );
});

describe('review', () => {
  it.effect('Stop makes the 24-bit WAV of what was kept, and closes the microphone', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(machine, recorded);
      expect(result.finalState).toEqual(RecorderState.Review({ beat: 'a', wav }));
      expect(log.open).toBe(false);
    }).pipe(Effect.provide(layer));
  });

  it.effect('Retake counts in again; Discard rests', () => {
    const { layer } = fakes();
    return Effect.gen(function* () {
      yield* assertPath(
        machine,
        [...recorded, RecorderEvent.Retake({ device: Option.none() })],
        [
          'Idle',
          ...Array.from({ length: COUNT_IN }, () => 'CountIn'),
          'Recording',
          'Review',
          'CountIn',
        ],
      );
      const discarded = yield* simulate(machine, [...recorded, RecorderEvent.Discard]);
      expect(discarded.finalState).toEqual(RecorderState.Idle({ beat: 'a', kept: Option.none() }));
    }).pipe(Effect.provide(layer));
  });

  it.effect('Submit imports the recording as an upload', () => {
    const { layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(machine, [...recorded, RecorderEvent.Submit]);
      expect(result.finalState).toEqual(
        RecorderState.Importing({ beat: 'a', work: { _tag: 'Upload', wav } }),
      );
    }).pipe(Effect.provide(layer));
  });
});

describe('importing', () => {
  const kept = { file: took.take.file, heard: took.heard, wer: took.wer, mixed: took.mixed };

  it.effect('a take kept rests with what was heard', () => {
    const { layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(machine, [
        ...recorded,
        RecorderEvent.Submit,
        RecorderEvent.Imported({ kept }),
      ]);
      expect(result.finalState).toEqual(RecorderState.Idle({ beat: 'a', kept: Option.some(kept) }));
    }).pipe(Effect.provide(layer));
  });

  it.effect('a take kept and mixed reloads the film at the same T, to play the new take', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      yield* simulate(machine, [
        ...recorded,
        RecorderEvent.Submit,
        RecorderEvent.Imported({ kept: { ...kept, mixed: true } }),
      ]);
      expect(log.calls.at(-1)).toBe('reload');
    }).pipe(Effect.provide(layer));
  });

  it.effect('a take kept whose mix failed reloads nothing: the status says why', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const unmixed = { ...kept, mixed: false };
      const result = yield* simulate(machine, [
        ...recorded,
        RecorderEvent.Submit,
        RecorderEvent.Imported({ kept: unmixed }),
      ]);
      expect(log.calls).not.toContain('reload');
      expect(result.finalState).toEqual(
        RecorderState.Idle({ beat: 'a', kept: Option.some(unmixed) }),
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect('a refusal fails with it, keeping the recording; Retry goes back to review', () => {
    const { layer } = fakes();
    return Effect.gen(function* () {
      const tooBig: StudioRefusal = { _tag: 'BodyTooLarge', message: 'BodyTooLarge: over 64 MiB' };
      const result = yield* simulate(machine, [
        ...recorded,
        RecorderEvent.Submit,
        RecorderEvent.Refused({ refusal: tooBig }),
        RecorderEvent.Retry,
      ]);
      expect(result.states.at(-2)).toEqual(
        RecorderState.Failed({ beat: 'a', refusal: tooBig, wav: Option.some(wav) }),
      );
      expect(result.finalState).toEqual(RecorderState.Review({ beat: 'a', wav }));
    }).pipe(Effect.provide(layer));
  });

  it.effect('Accept anyway keeps the attempt a TakeMismatch saved', () => {
    const { layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(machine, [
        ...recorded,
        RecorderEvent.Submit,
        RecorderEvent.Refused({ refusal: mismatch }),
        RecorderEvent.AcceptAnyway,
      ]);
      expect(result.finalState).toEqual(
        RecorderState.Importing({
          beat: 'a',
          work: {
            _tag: 'Keep',
            file: 'a.1234.flac',
            acceptMismatch: true,
            wav: Option.some(wav),
          },
        }),
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    'Accept anyway is not taken for any other refusal, nor a mismatch with no attempt',
    () => {
      const { layer } = fakes();
      return Effect.gen(function* () {
        const { attempt: _, ...unsaved } = mismatch;
        const untimed: StudioRefusal = { _tag: 'SttUntimed', message: 'SttUntimed: no words' };
        for (const refusal of [unsaved, untimed]) {
          const result = yield* simulate(machine, [
            ...recorded,
            RecorderEvent.Submit,
            RecorderEvent.Refused({ refusal }),
            RecorderEvent.AcceptAnyway,
          ]);
          expect(result.finalState).toEqual(
            RecorderState.Failed({ beat: 'a', refusal, wav: Option.some(wav) }),
          );
        }
        yield* assertNeverReaches(
          machine,
          [RecorderEvent.AcceptAnyway, RecorderEvent.Submit, RecorderEvent.Stop],
          'Importing',
        );
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect('a beat cannot be changed while a take is importing', () => {
    const { layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(machine, [
        ...recorded,
        RecorderEvent.Submit,
        RecorderEvent.SelectBeat({ beat: 'b' }),
      ]);
      expect(result.finalState).toEqual(
        RecorderState.Importing({ beat: 'a', work: { _tag: 'Upload', wav } }),
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect('Keep attempt imports an earlier attempt, from rest or after a refusal', () => {
    const { layer } = fakes();
    return Effect.gen(function* () {
      const fromRest = yield* simulate(machine, [RecorderEvent.KeepAttempt({ file: 'a.9.flac' })]);
      expect(fromRest.finalState).toEqual(
        RecorderState.Importing({
          beat: 'a',
          work: { _tag: 'Keep', file: 'a.9.flac', acceptMismatch: false, wav: Option.none() },
        }),
      );
      const afterRefusal = yield* simulate(machine, [
        ...recorded,
        RecorderEvent.Submit,
        RecorderEvent.Refused({ refusal: mismatch }),
        RecorderEvent.KeepAttempt({ file: 'a.9.flac' }),
      ]);
      expect(afterRefusal.finalState).toEqual(
        RecorderState.Importing({
          beat: 'a',
          work: { _tag: 'Keep', file: 'a.9.flac', acceptMismatch: false, wav: Option.some(wav) },
        }),
      );
    }).pipe(Effect.provide(layer));
  });
});

describe('selecting a beat', () => {
  it.effect('rests on the new beat from anywhere but an import, closing the microphone', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(machine, [
        ...armed,
        RecorderEvent.CountDone,
        RecorderEvent.SelectBeat({ beat: 'b' }),
      ]);
      expect(result.finalState).toEqual(RecorderState.Idle({ beat: 'b', kept: Option.none() }));
      expect(log.open).toBe(false);
    }).pipe(Effect.provide(layer));
  });
});

/** An import settled: a take kept (rest, with what was heard) or refused. */
const settled = (state: RecorderState) =>
  Predicate.isTagged(state, 'Failed') ||
  (Predicate.isTagged(state, 'Idle') && Option.isSome(state.kept));

describe('the import task, through an actor', () => {
  /** The actor's state once `events` were sent and the import settled, and what the fakes saw. */
  const run = (
    answer: Effect.Effect<StudioTake, StudioRefused>,
    events: ReadonlyArray<RecorderEvent>,
  ) => {
    const { log, layer } = fakes(answer);
    return Effect.gen(function* () {
      const actor = yield* Machine.spawn(machine);
      yield* actor.start;
      for (const event of events) yield* actor.send(event);
      const state = yield* actor.waitFor(settled);
      return { state, log };
    }).pipe(Effect.provide(layer));
  };

  it.live('posts the WAV for the beat, and a take kept rests with it', () =>
    Effect.gen(function* () {
      const { state, log } = yield* run(Effect.succeed(took), [...recorded, RecorderEvent.Submit]);
      expect(state).toEqual(
        RecorderState.Idle({
          beat: 'a',
          kept: Option.some({ file: 'a.1234.flac', heard: 'hello world', wer: 0, mixed: true }),
        }),
      );
      expect(log.calls).toContain(`take a ${wav.length} bytes`);
      expect(log.open).toBe(false);
    }).pipe(Effect.scoped),
  );

  it.live("a refusal shows the server's words", () =>
    Effect.gen(function* () {
      const { state } = yield* run(Effect.fail(StudioRefused.make({ refusal: mismatch })), [
        ...recorded,
        RecorderEvent.Submit,
      ]);
      expect(state).toEqual(
        RecorderState.Failed({ beat: 'a', refusal: mismatch, wav: Option.some(wav) }),
      );
    }).pipe(Effect.scoped),
  );

  it.live('Keep attempt posts keep for that file', () =>
    Effect.gen(function* () {
      const { log } = yield* run(Effect.succeed(took), [
        RecorderEvent.KeepAttempt({ file: 'a.1234.flac' }),
      ]);
      expect(log.calls).toEqual(['keep a a.1234.flac false', 'reload']);
    }).pipe(Effect.scoped),
  );

  it.live('Accept anyway posts keep with acceptMismatch for the attempt the mismatch saved', () => {
    const { log, layer } = fakes(
      Effect.fail(StudioRefused.make({ refusal: mismatch })),
      Effect.succeed(took),
    );
    return Effect.gen(function* () {
      const actor = yield* Machine.spawn(machine);
      yield* actor.start;
      for (const event of recorded) yield* actor.send(event);
      yield* actor.send(RecorderEvent.Submit);
      yield* actor.waitFor(Predicate.isTagged('Failed'));
      yield* actor.send(RecorderEvent.AcceptAnyway);
      const state = yield* actor.waitFor(
        (s) => Predicate.isTagged(s, 'Idle') && Option.isSome(s.kept),
      );
      expect(state._tag).toBe('Idle');
      expect(log.calls.filter((c) => c.startsWith('take') || c.startsWith('keep'))).toEqual([
        `take a ${wav.length} bytes`,
        'keep a a.1234.flac true',
      ]);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });
});
