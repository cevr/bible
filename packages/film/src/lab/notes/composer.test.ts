// The note composer, with no DOM: a press on the frame pauses the film and
// starts a mark (a point, a box once the pointer has moved far, or a pen
// stroke), a lift opens the composer at that frame, `n` opens it on the whole
// frame, a save captures the frame's still and posts the draft, and the
// server's refusal comes back to the open composer in its words. One save at
// a time: a press or a second save while one is out is not taken.

import { Effect, Layer, Option, SubscriptionRef } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { Machine, assertNeverReaches, assertPath, simulate } from 'effect-machine';
import { TestClock } from 'effect/testing';
import type { Note, NoteDraft } from '../../core/schema.ts';
import { LabRefused, NotesApi, type NotesCalls } from '../api.ts';
import { Stage, type StageOps } from '../stage.ts';
import { ComposerEvent, ComposerState, composerMachine, composerText } from './composer.ts';

const draft: NoteDraft = { scene: 'one', T: 1, frame: 30, text: 'too early' };

const made: Note = {
  ...draft,
  id: 'n1',
  film: 'probe',
  seq: 1,
  changed: 1,
  status: 'open',
  still: 'n1.png',
  thread: [],
  createdAt: '2026-09-28T00:00:00.000Z',
};

/** A stage that pauses and gives a four-byte still, and an API whose add answers `add`. */
const fakes = (add: Effect.Effect<Note, LabRefused> = Effect.succeed(made)) => {
  const log: Array<string> = [];
  const stage: StageOps = {
    preview: () => Effect.die('not asked'),
    unpreview: () => Effect.die('not asked'),
    timelineOf: () => ({}),
    knobsOf: () => ({}),
    holdT: Effect.die('not asked'),
    settle: Effect.die('not asked'),
    duration: 10,
    cueSpan: () => Option.none(),
    playFrom: () => Effect.die('not asked'),
    pause: Effect.sync(() => log.push('pause')),
    still: (T) =>
      Effect.sync(() => {
        log.push(`still ${T}`);
        return new Uint8Array([1, 2, 3, 4]);
      }),
  };
  const api: NotesCalls = {
    notes: Effect.die('not asked'),
    wait: () => Effect.die('not asked'),
    add: (post) =>
      Effect.suspend(() => {
        log.push(`add ${post.text} ${post.still.length}`);
        return add;
      }),
    reply: () => Effect.die('not asked'),
    resolve: () => Effect.die('not asked'),
  };
  return {
    log,
    layer: Layer.merge(Layer.succeed(Stage, stage), Layer.succeed(NotesApi, api)),
  };
};

const press = (x: number, y: number, pen = false) => ComposerEvent.Press({ T: 1, at: [x, y], pen });

describe('marking the frame', () => {
  it.effect('a click pins a point and opens the composer at that frame', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(composerMachine, [
        press(100, 80),
        ComposerEvent.Lift({ at: [102, 81], far: false }),
      ]);
      expect(result.finalState).toEqual(
        ComposerState.Open({
          T: 1,
          box: Option.some({ x: 100, y: 80, w: 0, h: 0 }),
          ink: [],
          status: '',
        }),
      );
      expect(log).toEqual(['pause']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('a drag draws a box from where it began', () =>
    Effect.gen(function* () {
      const result = yield* simulate(composerMachine, [
        press(300, 200),
        ComposerEvent.Drag({ at: [100, 120], far: true }),
        ComposerEvent.Lift({ at: [100, 120], far: true }),
      ]);
      expect(result.finalState).toEqual(
        ComposerState.Open({
          T: 1,
          box: Option.some({ x: 100, y: 120, w: 200, h: 80 }),
          ink: [],
          status: '',
        }),
      );
    }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect('the pen draws a stroke, and a second stroke adds to the draft', () =>
    Effect.gen(function* () {
      const result = yield* simulate(composerMachine, [
        press(10, 10, true),
        ComposerEvent.Drag({ at: [20, 15], far: true }),
        ComposerEvent.Lift({ at: [20, 15], far: true }),
        press(50, 50, true),
        ComposerEvent.Drag({ at: [60, 60], far: true }),
        ComposerEvent.Lift({ at: [60, 60], far: true }),
      ]);
      expect(result.finalState).toEqual(
        ComposerState.Open({
          T: 1,
          box: Option.none(),
          ink: [
            [
              [10, 10],
              [20, 15],
            ],
            [
              [50, 50],
              [60, 60],
            ],
          ],
          status: '',
        }),
      );
    }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect('n opens the composer on the whole frame; cancel closes it', () =>
    assertPath(
      composerMachine,
      [ComposerEvent.Note({ T: 2 }), ComposerEvent.Cancel],
      ['Closed', 'Open', 'Closed'],
    ).pipe(Effect.provide(fakes().layer)),
  );
});

describe('saving', () => {
  it.effect("posts the draft with the frame's still, and closes on the note it made", () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const actor = yield* Machine.spawn(composerMachine);
      yield* actor.start;
      yield* actor.send(ComposerEvent.Note({ T: 1 }));
      yield* actor.send(ComposerEvent.Save({ draft }));
      yield* TestClock.adjust('10 millis');
      expect(yield* SubscriptionRef.get(actor.state)).toEqual(
        ComposerState.Closed({ saved: Option.some('n1') }),
      );
      expect(log).toEqual(['pause', 'still 1', 'add too early 4']);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect("a refused save goes back to the draft with the server's words", () =>
    Effect.gen(function* () {
      const actor = yield* Machine.spawn(composerMachine);
      yield* actor.start;
      yield* actor.send(press(5, 6));
      yield* actor.send(ComposerEvent.Lift({ at: [5, 6], far: false }));
      yield* actor.send(ComposerEvent.Save({ draft }));
      yield* TestClock.adjust('10 millis');
      const state = yield* SubscriptionRef.get(actor.state);
      expect(state).toEqual(
        ComposerState.Open({
          T: 1,
          box: Option.some({ x: 5, y: 6, w: 0, h: 0 }),
          ink: [],
          status: 'the file is locked',
        }),
      );
      expect(composerText(state)).toBe('the file is locked');
    }).pipe(
      Effect.scoped,
      Effect.provide(
        fakes(
          Effect.fail(LabRefused.make({ status: 500, message: 'StoreFailed: the file is locked' })),
        ).layer,
      ),
    ),
  );

  it.effect('a press or a second save while one is out is not taken', () =>
    Effect.gen(function* () {
      yield* assertNeverReaches(
        composerMachine,
        [
          ComposerEvent.Note({ T: 1 }),
          ComposerEvent.Save({ draft }),
          press(1, 1),
          ComposerEvent.Save({ draft }),
          ComposerEvent.Cancel,
        ],
        'Marking',
      );
      const result = yield* simulate(composerMachine, [
        ComposerEvent.Note({ T: 1 }),
        ComposerEvent.Save({ draft }),
        ComposerEvent.Cancel,
      ]);
      expect(result.finalState._tag).toBe('Saving');
      expect(composerText(result.finalState)).toBe('saving…');
    }).pipe(Effect.provide(fakes(Effect.never).layer)),
  );

  test('starts closed', () => {
    expect(composerMachine.initial).toEqual(ComposerState.Closed({ saved: Option.none() }));
  });
});
