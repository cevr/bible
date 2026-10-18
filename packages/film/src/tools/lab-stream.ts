// The lab's events as one stream, followed past a cursor for as long as its
// reader wants them: what `film lab events --follow`, `film ask wait` and
// `film channel` each read. A session of the lab's MCP is opened, the cursor
// taken (or the one given kept), and the feed long-polled (`changes`, its
// `wait`) past it; each answer is heard in turn, and the reader's own reads
// run on the same session between two polls. The cursor is the stream's, not
// a session's: a lab that stops answering (restarted, the network dropped)
// is said once (`Lost`), asked again on `pace.retry`, and the new session
// reads on from the last cursor seen (`Connected`, `resumed`), so nothing
// that changed while it was away is skipped; a lab that no longer knows that
// cursor says so in its answer's `reset`. Only a lab silent past `goneAfter`
// ends it (`LabGone`), and a refusal that is no lost connection (`isLost`
// says which) ends it in its own words.

import { Clock, Duration, Effect, Option, Ref, Schedule, Schema, type Scope } from 'effect';
import type { LabChanges } from './lab-events.ts';

/** The lab's feed as the stream reads it: a session (ended with its scope), then `changes` past a cursor (none: the cursor now). */
export interface LabFeed<S, E> {
  readonly session: Effect.Effect<S, E, Scope.Scope>;
  readonly changes: (
    session: S,
    since: Option.Option<string>,
    wait: number,
  ) => Effect.Effect<LabChanges, E>;
}

/**
 * What the stream hears: a session opened (`resumed` after a loss), the
 * cursor it reads past; an answer of the feed's, on that session; the lab
 * lost, in its words.
 */
export type Heard<S> =
  | {
      readonly _tag: 'Connected';
      readonly session: S;
      readonly cursor: string;
      readonly resumed: boolean;
    }
  | { readonly _tag: 'Answer'; readonly session: S; readonly answer: LabChanges }
  | { readonly _tag: 'Lost'; readonly reason: string };

/** How the stream reads: each wait in seconds, and when it asks a silent lab again. */
export interface StreamPace {
  readonly wait: number;
  readonly retry: Schedule.Schedule<unknown, unknown>;
}

/** The pace a terminal reads at: 50 s waits (inside the lab's 120 s), asked again after 250 ms doubling to 10 s. */
export const STREAM_PACE: StreamPace = {
  wait: 50,
  retry: Schedule.exponential('250 millis').pipe(
    Schedule.modifyDelay(({ duration }) =>
      Effect.succeed(Duration.min(Duration.fromInputUnsafe(duration), Duration.seconds(10))),
    ),
  ),
};

/** The lab did not answer for `waited`: the stream's reader was told that is gone for good. */
class LabGone extends Schema.TaggedError<LabGone>()('LabGone', {
  waited: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the lab has not answered for ${this.waited} (${this.reason}): gone`;
  }
}

/** What the stream follows from, and when it gives up. */
interface Follow<E> {
  /** The cursor to read past; none: the cursor now, so nothing from before is told. */
  readonly since: Option.Option<string>;
  readonly pace: StreamPace;
  /** Whether `error` is the lab lost (asked again), not a refusal (which ends the stream). */
  readonly isLost: (error: E) => boolean;
  /** How long a lab may be silent before the stream ends with `LabGone`; none: never. */
  readonly goneAfter: Option.Option<Duration.Duration>;
}

/**
 * The feed followed: `hear` is told each `Heard` in order, the next poll
 * waiting on it, and the stream ends with what `hear` first answers
 * (`Option.some`). An error `hear` fails with is the stream's own: a lost
 * one opens a new session, as a lost poll does.
 */
export const followLab = <S, E extends { readonly message: string }, A, R>(
  feed: LabFeed<S, E>,
  follow: Follow<E>,
  hear: (heard: Heard<S>) => Effect.Effect<Option.Option<A>, E, R>,
): Effect.Effect<A, E | LabGone, R> =>
  Effect.gen(function* () {
    const cursor = yield* Ref.make(follow.since);
    /** When the lab was first heard lost since it last answered; none while it answers. */
    const down = yield* Ref.make(Option.none<number>());
    /** Whether a session was ever opened: a later one is resumed. */
    const opened = yield* Ref.make(false);

    const connected = Effect.gen(function* () {
      const session = yield* feed.session;
      const now = yield* Option.match(yield* Ref.get(cursor), {
        onSome: Effect.succeed,
        onNone: () => Effect.map(feed.changes(session, Option.none(), 0), (a) => a.cursor),
      });
      yield* Ref.set(cursor, Option.some(now));
      yield* Ref.set(down, Option.none());
      const resumed = yield* Ref.getAndSet(opened, true);
      const first = yield* hear({ _tag: 'Connected', session, cursor: now, resumed });
      if (Option.isSome(first)) return first.value;
      while (true) {
        const answer = yield* feed.changes(session, yield* Ref.get(cursor), follow.pace.wait);
        const heard = yield* hear({ _tag: 'Answer', session, answer });
        yield* Ref.set(cursor, Option.some(answer.cursor));
        if (Option.isSome(heard)) return heard.value;
      }
    });

    /** A lost lab said once, and gone once it has been silent past `goneAfter`. */
    const lost = (error: E) =>
      Effect.gen(function* () {
        const at = yield* Clock.currentTimeMillis;
        const since = yield* Ref.get(down);
        if (Option.isNone(since)) {
          yield* Ref.set(down, Option.some(at));
          yield* Effect.asVoid(hear({ _tag: 'Lost', reason: error.message }));
        }
        const waited = at - Option.getOrElse(since, () => at);
        if (Option.exists(follow.goneAfter, (after) => waited >= Duration.toMillis(after)))
          return yield* LabGone.make({
            waited: Duration.format(Duration.millis(waited)),
            reason: error.message,
          });
        return yield* Effect.fail(error);
      });

    return yield* Effect.scoped(connected).pipe(
      Effect.catchIf(follow.isLost, lost),
      Effect.retry({
        schedule: follow.pace.retry,
        while: (error) => !Schema.is(LabGone)(error) && follow.isLost(error),
      }),
    );
  });
