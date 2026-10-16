// The studio's machines, with no page: the timeline machine reads the
// version the address names, reads again when the owner opens another, keeps
// what it shows when the same version is asked again, and says why a read
// failed until a retry or another version reads again. A read answers for
// its own version: one the owner left while it was in flight never shows,
// whether he picked another or went Back. The transport machine
// plays and pauses, and a scrub holds it, remembering whether it cut play off.

import { Deferred, Effect, Exit, Option, SubscriptionRef } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { probeTimeline } from '../fixtures/probe-timeline.ts';
import {
  TimelineEvent,
  TimelineState,
  TransportEvent,
  spawnTimeline,
  spawnTransport,
} from './machine.ts';

/** A read over the probe film's two versions (0: the open one, v2), each asked told to `asked`; any other fails. */
const probeRead = (asked: Array<number>) => (v: number) =>
  Effect.suspend(() => {
    asked.push(v);
    if (v === 0 || v === 2) return Effect.succeed(probeTimeline(2));
    if (v === 1) return Effect.succeed(probeTimeline(1));
    return Effect.fail({ message: `no version ${v}` });
  });

/**
 * A read like `probeRead` whose read of version 2 waits until `held` is
 * done, and answers v2's timeline then.
 */
const heldRead = (asked: Array<number>, held: Deferred.Deferred<void>) => (v: number) =>
  Effect.suspend(() => {
    asked.push(v);
    if (v === 2) return Effect.as(Deferred.await(held), probeTimeline(2));
    return probeRead([])(v);
  });

const shownAt = (v: number) => (s: TimelineState) => s._tag === 'Shown' && s.v === v;

describe("the studio's timeline machine", () => {
  it.effect('shows the version the address names, and reads again for another', () => {
    const asked: Array<number> = [];
    return Effect.gen(function* () {
      const actor = yield* spawnTimeline(probeRead(asked), 0);
      const open = yield* actor.waitFor(shownAt(0));
      expect(open).toEqual(TimelineState.Shown({ v: 0, timeline: probeTimeline(2) }));
      yield* actor.send(TimelineEvent.Version({ v: 1 }));
      const kept = yield* actor.waitFor(shownAt(1));
      expect(kept._tag === 'Shown' && kept.timeline.version.n).toBe(1);
      expect(asked).toEqual([0, 1]);
    }).pipe(Effect.scoped);
  });

  it.effect('keeps the timeline shown when the version shown is asked again', () => {
    const asked: Array<number> = [];
    return Effect.gen(function* () {
      const actor = yield* spawnTimeline(probeRead(asked), 1);
      yield* actor.waitFor(shownAt(1));
      yield* actor.send(TimelineEvent.Version({ v: 1 }));
      yield* actor.send(TimelineEvent.Version({ v: 2 }));
      yield* actor.waitFor(shownAt(2));
      expect(asked).toEqual([1, 2]);
    }).pipe(Effect.scoped);
  });

  // Each case starts a read of v2 and holds it, leaves v2 while it is in
  // flight, then lets it land: what shows is the version the address names.
  const LEFT = [
    ['picks another version', 0, 1],
    ['goes Back to the version he came from', 1, 1],
  ] as const;
  for (const [how, from, to] of LEFT)
    it.effect(
      `a read in flight when the owner ${how} never shows: the version he went to does`,
      () => {
        const asked: Array<number> = [];
        return Effect.gen(function* () {
          const held = yield* Deferred.make<void>();
          const actor = yield* spawnTimeline(heldRead(asked, held), from);
          yield* actor.waitFor(shownAt(from));
          yield* actor.send(TimelineEvent.Version({ v: 2 }));
          yield* actor.waitFor((s) => s._tag === 'Reading' && s.v === 2);
          yield* actor.send(TimelineEvent.Version({ v: to }));
          yield* actor.waitFor((s) => s._tag === 'Shown' && s.v === to && asked.length === 3);
          yield* Deferred.done(held, Exit.void);
          // The held read has landed and been heard; the state is still the version gone to.
          yield* actor.send(TimelineEvent.Version({ v: to }));
          const shown = yield* actor.waitFor(shownAt(to));
          expect(shown._tag === 'Shown' && shown.timeline.version.n).toBe(1);
          expect(asked).toEqual([from, 2, to]);
        }).pipe(Effect.scoped);
      },
    );

  it.effect('the version being read, asked again while in flight, is read once', () => {
    const asked: Array<number> = [];
    return Effect.gen(function* () {
      const held = yield* Deferred.make<void>();
      const actor = yield* spawnTimeline(heldRead(asked, held), 1);
      yield* actor.waitFor(shownAt(1));
      yield* actor.send(TimelineEvent.Version({ v: 2 }));
      yield* actor.send(TimelineEvent.Version({ v: 2 }));
      yield* actor.send(TimelineEvent.Version({ v: 2 }));
      yield* Deferred.done(held, Exit.void);
      const shown = yield* actor.waitFor(shownAt(2));
      expect(shown._tag === 'Shown' && shown.timeline.version.n).toBe(2);
      expect(asked).toEqual([1, 2]);
    }).pipe(Effect.scoped);
  });

  it.effect(
    'says why a version cannot be read, and reads again on a retry or another version',
    () => {
      const asked: Array<number> = [];
      return Effect.gen(function* () {
        const actor = yield* spawnTimeline(probeRead(asked), 9);
        const failed = yield* actor.waitFor(TimelineState.Unreadable);
        expect(failed).toEqual(TimelineState.Unreadable({ v: 9, why: 'no version 9' }));
        yield* actor.send(TimelineEvent.Retry);
        yield* actor.waitFor((s) => s._tag === 'Unreadable' && asked.length === 2);
        yield* actor.send(TimelineEvent.Version({ v: 2 }));
        yield* actor.waitFor(shownAt(2));
        expect(asked).toEqual([9, 9, 2]);
      }).pipe(Effect.scoped);
    },
  );
});

/** Whether a transport state is a scrub that cut play off: none for any other state. */
const resumeOf = (s: { readonly _tag: string }): Option.Option<boolean> =>
  Option.map(
    Option.filter(
      Option.some(s),
      (x): x is { readonly _tag: 'Scrubbing'; readonly resume: boolean } => x._tag === 'Scrubbing',
    ),
    (x) => x.resume,
  );

describe("the studio's transport machine", () => {
  it.effect('plays and pauses as the clock says', () =>
    Effect.gen(function* () {
      const actor = yield* spawnTransport;
      expect((yield* SubscriptionRef.get(actor.state))._tag).toBe('Paused');
      yield* actor.send(TransportEvent.Played);
      yield* actor.waitFor((s) => s._tag === 'Playing');
      yield* actor.send(TransportEvent.Paused);
      yield* actor.waitFor((s) => s._tag === 'Paused');
    }).pipe(Effect.scoped),
  );

  it.effect('holds the playhead through a scrub, and remembers that it cut play off', () =>
    Effect.gen(function* () {
      const actor = yield* spawnTransport;
      yield* actor.send(TransportEvent.Grab);
      expect(resumeOf(yield* actor.waitFor((s) => s._tag === 'Scrubbing'))).toEqual(
        Option.some(false),
      );
      yield* actor.send(TransportEvent.Release);
      yield* actor.waitFor((s) => s._tag === 'Paused');
      yield* actor.send(TransportEvent.Played);
      yield* actor.waitFor((s) => s._tag === 'Playing');
      yield* actor.send(TransportEvent.Grab);
      expect(resumeOf(yield* actor.waitFor((s) => s._tag === 'Scrubbing'))).toEqual(
        Option.some(true),
      );
      // The scrub holds the clock: a play or a pause heard during it changes nothing.
      yield* actor.send(TransportEvent.Paused);
      yield* actor.send(TransportEvent.Played);
      expect(resumeOf(yield* SubscriptionRef.get(actor.state))).toEqual(Option.some(true));
      yield* actor.send(TransportEvent.Release);
      yield* actor.waitFor((s) => s._tag === 'Paused');
    }).pipe(Effect.scoped),
  );
});
