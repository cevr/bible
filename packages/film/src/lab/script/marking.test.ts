// A reader's write of marks, with no page: sent once through the reader's
// send; one asked while another is on its way is not sent; a refused one
// carries the lab's words, and the next write asked is sent.

import { Deferred, Effect, Exit } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { type MarkWrite, MarkingEvent, MarkingState, spawnMarking } from './marking.ts';

const stress = (beat: string, word: number): MarkWrite => ({
  post: {
    beat,
    marks: [{ _tag: 'Stress', word }],
    read: { spoken: 'Can a man be just with God?', marks: [] },
  },
  read: [],
});

describe("a reader's write of marks", () => {
  it.effect('sends a write once and says it landed on its beat', () => {
    const sent: Array<MarkWrite> = [];
    return Effect.gen(function* () {
      const actor = yield* spawnMarking((write) => Effect.sync(() => sent.push(write)));
      yield* actor.send(MarkingEvent.Mark({ write: stress('job', 2) }));
      const written = yield* actor.waitFor((s) => s._tag === 'Written');
      expect(written).toEqual(MarkingState.Written({ beat: 'job' }));
      expect(sent).toEqual([stress('job', 2)]);
    }).pipe(Effect.scoped);
  });

  it.effect('sends no write asked while another is on its way', () => {
    const sent: Array<MarkWrite> = [];
    return Effect.gen(function* () {
      const held = yield* Deferred.make<void>();
      const actor = yield* spawnMarking((write) =>
        Effect.suspend(() => {
          sent.push(write);
          return Deferred.await(held);
        }),
      );
      yield* actor.send(MarkingEvent.Mark({ write: stress('job', 2) }));
      const writing = yield* actor.waitFor((s) => s._tag === 'Writing');
      expect(writing._tag === 'Writing' && writing.beat).toBe('job');
      yield* actor.send(MarkingEvent.Mark({ write: stress('cold', 0) }));
      yield* Deferred.done(held, Exit.void);
      const written = yield* actor.waitFor((s) => s._tag === 'Written');
      expect(written).toEqual(MarkingState.Written({ beat: 'job' }));
      expect(sent.map((w) => w.post.beat)).toEqual(['job']);
    }).pipe(Effect.scoped);
  });

  it.effect("says a refused write in the lab's words, and sends the next one asked", () => {
    const sent: Array<MarkWrite> = [];
    return Effect.gen(function* () {
      const actor = yield* spawnMarking((write) =>
        Effect.suspend(() => {
          sent.push(write);
          return Effect.fail('the line says other words now: read it again');
        }),
      );
      yield* actor.send(MarkingEvent.Mark({ write: stress('job', 2) }));
      const failed = yield* actor.waitFor((s) => s._tag === 'Failed');
      expect(failed).toEqual(
        MarkingState.Failed({
          beat: 'job',
          reason: 'the line says other words now: read it again',
        }),
      );
      yield* actor.send(MarkingEvent.Mark({ write: stress('cold', 0) }));
      yield* actor.waitFor((s) => s._tag === 'Failed' && s.beat === 'cold');
      expect(sent.map((w) => w.post.beat)).toEqual(['job', 'cold']);
    }).pipe(Effect.scoped);
  });
});
