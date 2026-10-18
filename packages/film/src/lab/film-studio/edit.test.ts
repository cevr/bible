// The studio's edit machine, with no page: a clip carried and dropped on a
// gap that moves it asks the lab for that move, and dropped on itself (or
// just after itself) asks nothing; an edge pulled snaps and keeps inside its
// floors, and let go where it began asks nothing; one write at a time; a
// landed write names what it did, a refused one says why; and what an edit
// shows on the timeline before the lab reads the version again.

import { Deferred, Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { StudioEdit } from '../../core/api.ts';
import { ChangeId } from '../../core/schema.ts';
import { EditEvent, type StudioAsk, atRest, previewOf, spawnEdit } from './edit.ts';

const IDS = ['cold', 'title', 'look', 'woman'];

/** The lab's answer to `ask`: a change made, its words its tag. */
const answered = (ask: StudioAsk): StudioEdit => ({
  change: ChangeId.make('c1'),
  target: 'script.ts',
  said: ask._tag,
  steps: {},
});

/** A send that tells `asked` each ask and answers it; one of beat `refused` is refused. */
const lab =
  (asked: Array<StudioAsk>, refused = '') =>
  (ask: StudioAsk) =>
    Effect.suspend(() => {
      asked.push(ask);
      if ('beat' in ask && ask.beat === refused) return Effect.fail('the lab said no');
      return Effect.succeed(answered(ask));
    });

describe("the studio's edit machine", () => {
  it.effect('asks for a move only when the drop moves the beat', () => {
    const asked: Array<StudioAsk> = [];
    return Effect.gen(function* () {
      const actor = yield* spawnEdit(lab(asked));
      for (const gap of [2, 3]) {
        yield* actor.send(EditEvent.Lift({ beat: 'look', ids: IDS }));
        yield* actor.send(EditEvent.Over({ gap: Option.some(gap) }));
        yield* actor.send(EditEvent.Drop);
        yield* actor.waitFor((s) => s._tag === 'Idle');
      }
      yield* actor.send(EditEvent.Lift({ beat: 'look', ids: IDS }));
      yield* actor.send(EditEvent.Over({ gap: Option.some(1) }));
      const over = yield* actor.waitFor((s) => s._tag === 'Dragging' && Option.isSome(s.gap));
      expect(previewOf(over)).toEqual(Option.none());
      yield* actor.send(EditEvent.Drop);
      const done = yield* actor.waitFor((s) => s._tag === 'Done');
      expect(done._tag === 'Done' && done.answer.said).toBe('Move');
      expect(asked).toEqual([{ _tag: 'Move', beat: 'look', before: Option.some('title') }]);
    }).pipe(Effect.scoped);
  });

  it.effect('a drop off the beats, or a cancel, asks nothing', () => {
    const asked: Array<StudioAsk> = [];
    return Effect.gen(function* () {
      const actor = yield* spawnEdit(lab(asked));
      yield* actor.send(EditEvent.Lift({ beat: 'look', ids: IDS }));
      yield* actor.send(EditEvent.Over({ gap: Option.none() }));
      yield* actor.send(EditEvent.Drop);
      yield* actor.send(EditEvent.Lift({ beat: 'look', ids: IDS }));
      yield* actor.send(EditEvent.Over({ gap: Option.some(0) }));
      yield* actor.waitFor((s) => s._tag === 'Dragging' && Option.isSome(s.gap));
      yield* actor.send(EditEvent.Cancel);
      yield* actor.waitFor((s) => s._tag === 'Idle');
      expect(asked).toEqual([]);
    }).pipe(Effect.scoped);
  });

  it.effect('a trim snaps as it is pulled, shows its ripple, and asks for the hold let go', () => {
    const asked: Array<StudioAsk> = [];
    return Effect.gen(function* () {
      const actor = yield* spawnEdit(lab(asked));
      yield* actor.send(EditEvent.Grip({ beat: 'cold', edge: 'tail', from: 0.1 }));
      yield* actor.send(EditEvent.Pull({ to: -2 }));
      yield* actor.send(EditEvent.Let);
      yield* actor.waitFor((s) => s._tag === 'Idle');
      yield* actor.send(EditEvent.Grip({ beat: 'cold', edge: 'tail', from: 0.1 }));
      yield* actor.send(EditEvent.Pull({ to: 3.04 }));
      const pulled = yield* actor.waitFor((s) => s._tag === 'Trimming' && s.to !== s.from);
      expect(previewOf(pulled)).toEqual(
        Option.some({ _tag: 'Hold', beat: 'cold', edge: 'tail', from: 0.1, to: 3 }),
      );
      yield* actor.send(EditEvent.Let);
      yield* actor.waitFor((s) => s._tag === 'Done');
      expect(asked).toEqual([{ _tag: 'Hold', beat: 'cold', edge: 'tail', from: 0.1, seconds: 3 }]);
    }).pipe(Effect.scoped);
  });

  it.effect('takes one write at a time, and says why one was refused', () => {
    const asked: Array<StudioAsk> = [];
    return Effect.gen(function* () {
      const held = yield* Deferred.make<void>();
      const slow = (ask: StudioAsk) =>
        Effect.andThen(Deferred.await(held), lab(asked, 'woman')(ask));
      const actor = yield* spawnEdit(slow);
      const undo = { _tag: 'Step', verb: 'undo', change: Option.none() } as const;
      yield* actor.send(EditEvent.Ask({ ask: undo }));
      yield* actor.send(EditEvent.Ask({ ask: { ...undo, verb: 'redo' } }));
      yield* actor.send(EditEvent.Lift({ beat: 'look', ids: IDS }));
      yield* actor.waitFor((s) => s._tag === 'Sending');
      yield* Deferred.done(held, Exit.void);
      yield* actor.waitFor((s) => s._tag === 'Done');
      expect(asked).toEqual([undo]);
      yield* actor.send(
        EditEvent.Ask({ ask: { _tag: 'Move', beat: 'woman', before: Option.some('cold') } }),
      );
      const failed = yield* actor.waitFor((s) => s._tag === 'Failed');
      expect(failed._tag === 'Failed' && failed.reason).toBe('the lab said no');
      expect(atRest(failed)).toBe(true);
    }).pipe(Effect.scoped);
  });
});
