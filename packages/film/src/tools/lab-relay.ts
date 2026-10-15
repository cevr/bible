// The channel's relay: the lab's change feed read past one cursor for as long
// as the bridge runs, each answer handed on. The cursor is the relay's, not a
// session's: a lab that stops answering (it restarted, the network dropped)
// is asked again, and the new session reads on from the last cursor seen, so
// what changed while it was away is told (or, when the lab no longer knows
// that cursor, its `reset` answer says some may be lost). Only the first
// session of the relay takes the cursor now, so nothing from before the
// bridge started is told. Each session lasts as long as its connection: one
// lost, or the relay stopped, ends it.

import { type Duration, Effect, Option, Ref, Schedule, type Scope } from 'effect';
import type { LabChanges } from './lab-events.ts';

/** The lab's feed as the relay reads it: a session (ended with its scope), then `changes` past a cursor (none: the cursor now). */
interface LabFeed<S, E> {
  readonly session: Effect.Effect<S, E, Scope.Scope>;
  readonly changes: (
    session: S,
    since: Option.Option<string>,
    wait: number,
  ) => Effect.Effect<LabChanges, E>;
}

/** How the relay reads: each wait in seconds, and how long it waits before asking a silent lab again. */
interface RelayPace {
  readonly wait: number;
  readonly retry: Duration.Input;
}

/**
 * The feed relayed to `deliver` until the relay is stopped: `lost` is told
 * each time the lab stops answering, and a new session reads on from the
 * cursor the last answer gave.
 */
export const relayFeed = <S, E>(
  feed: LabFeed<S, E>,
  deliver: (answer: LabChanges) => Effect.Effect<void>,
  lost: (error: E) => Effect.Effect<void>,
  pace: RelayPace,
) =>
  Effect.gen(function* () {
    const cursor = yield* Ref.make(Option.none<string>());
    const connected = Effect.gen(function* () {
      const session = yield* feed.session;
      if (Option.isNone(yield* Ref.get(cursor)))
        yield* Ref.set(
          cursor,
          Option.some((yield* feed.changes(session, Option.none(), 0)).cursor),
        );
      yield* Effect.log('lab.channel.connected');
      while (true) {
        const answer = yield* feed.changes(session, yield* Ref.get(cursor), pace.wait);
        yield* Ref.set(cursor, Option.some(answer.cursor));
        yield* deliver(answer);
      }
    });
    return yield* Effect.scoped(connected).pipe(
      Effect.tapError(lost),
      // oxlint-disable-next-line effect/noUnboundedRetry -- the bridge lives as long as its session: a lab restarted or stopped is asked again until it answers
      Effect.retry(Schedule.spaced(pace.retry)),
    );
  });
