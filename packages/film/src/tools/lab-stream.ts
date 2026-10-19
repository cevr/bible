// The lab's events as one stream, followed past a cursor for as long as its
// reader wants them: what `film lab events --follow`, `film ask wait` and
// `film channel` each read. A session of the lab's MCP is opened, the cursor
// taken (or the one given kept), and the feed long-polled (`changes`, its
// `wait`) past it; each answer is heard in turn, and the reader's own reads
// run on the same session between two polls. Each change is read on its
// own (`HeardChange`): one of a kind this checkout does not know (a newer
// lab's) is heard from the fields every change has, never as a lab lost.
//
// The cursor is the stream's, not a session's: a lab that stops answering
// (restarted, the network dropped) is said once (`Lost`), asked again on
// `pace.retry`, and the new session reads on from the last cursor seen
// (`Connected`, `resumed`), so nothing that changed while it was away is
// skipped; a lab that no longer knows that cursor says so in its answer's
// `reset`. Each loss after a session that answered starts `pace.retry`
// over. Only a lab silent past `goneAfter`, counted from the first loss
// since it last answered, ends it (`LabGone`), and a failure that is no
// lost connection (`isLost` says which: a refusal, an answer this checkout
// does not read) ends it in its own words.

import { Clock, Duration, Effect, Option, Ref, Schedule, Schema, type Scope } from 'effect';
import { HeardChange } from '../core/lab-events.ts';
import type { labClient } from './lab-client.ts';
import { Changes } from './lab-commands.ts';

/** What a reader of the feed is answered: the changes past its cursor, each as it reads, and the cursor to ask past next. */
const HeardChanges = Schema.Struct({
  cursor: Schema.String,
  changes: Schema.Array(HeardChange),
  reset: Schema.Boolean,
});
export type HeardChanges = typeof HeardChanges.Type;

/** The lab's feed as the stream reads it: a session (ended with its scope), then `changes` past a cursor (none: the cursor now). */
export interface LabFeed<S, E> {
  readonly session: Effect.Effect<S, E, Scope.Scope>;
  readonly changes: (
    session: S,
    since: Option.Option<string>,
    wait: number,
  ) => Effect.Effect<HeardChanges, E>;
}

/** Which changes a reader asks the feed for: their names (globs over the catalogue's) and their film. */
interface FeedOf {
  readonly name?: ReadonlyArray<string>;
  readonly film?: string;
}

type LabClient = Effect.Success<ReturnType<typeof labClient>>;

/** The feed of the lab `client` asks, its changes read one by one (`HeardChanges`): what each stream reads. */
export const labFeed = (client: LabClient, of: FeedOf = {}) => ({
  session: client.session,
  changes: (session: string, since: Option.Option<string>, wait: number) =>
    client.read(
      session,
      Changes,
      {
        ...of,
        ...Option.match(since, { onNone: () => ({}), onSome: (cursor) => ({ since: cursor }) }),
        wait,
      },
      HeardChanges,
    ),
});

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
  | { readonly _tag: 'Answer'; readonly session: S; readonly answer: HeardChanges }
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
  /** Whether `error` is the lab lost (asked again), not a refusal or an unread answer (which end the stream). */
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
    /** Whether the lab has answered the feed since the last loss: a loss then starts `pace.retry` over. */
    const answered = yield* Ref.make(false);
    /** Whether a session was ever opened: a later one is resumed. */
    const opened = yield* Ref.make(false);

    /** An answer of the feed's: the lab is up again. */
    const heardBack = Effect.andThen(Ref.set(down, Option.none()), Ref.set(answered, true));

    const connected = Effect.gen(function* () {
      const session = yield* feed.session;
      const now = yield* Option.match(yield* Ref.get(cursor), {
        onSome: Effect.succeed,
        onNone: () =>
          Effect.map(
            Effect.tap(feed.changes(session, Option.none(), 0), heardBack),
            (a) => a.cursor,
          ),
      });
      yield* Ref.set(cursor, Option.some(now));
      const resumed = yield* Ref.getAndSet(opened, true);
      const first = yield* hear({ _tag: 'Connected', session, cursor: now, resumed });
      if (Option.isSome(first)) return first.value;
      while (true) {
        const answer = yield* feed.changes(session, yield* Ref.get(cursor), follow.pace.wait);
        yield* heardBack;
        const heard = yield* hear({ _tag: 'Answer', session, answer });
        yield* Ref.set(cursor, Option.some(answer.cursor));
        if (Option.isSome(heard)) return heard.value;
      }
    });

    /**
     * A lost lab: said once, and gone once it has been silent past
     * `goneAfter`. After a session that answered, the loss ends this outage's
     * retries (`Option.none`), so the next opens at once on a fresh schedule.
     */
    const lost = (error: E) =>
      Effect.gen(function* () {
        const at = yield* Clock.currentTimeMillis;
        const since = yield* Ref.get(down);
        if (Option.isNone(since)) {
          yield* Ref.set(down, Option.some(at));
          yield* Effect.asVoid(hear({ _tag: 'Lost', reason: error.message }));
        }
        if (yield* Ref.getAndSet(answered, false)) return Option.none<A>();
        const waited = at - Option.getOrElse(since, () => at);
        if (Option.exists(follow.goneAfter, (after) => waited >= Duration.toMillis(after)))
          return yield* LabGone.make({
            waited: Duration.format(Duration.millis(waited)),
            reason: error.message,
          });
        return yield* Effect.fail(error);
      });

    /** One outage's sessions: opened again on `pace.retry` until one answers and ends, or is lost after answering. */
    const outage = Effect.scoped(connected).pipe(
      Effect.asSome,
      Effect.catchIf(follow.isLost, lost),
      Effect.retry({
        schedule: follow.pace.retry,
        while: (error) => !Schema.is(LabGone)(error) && follow.isLost(error),
      }),
    );

    while (true) {
      const ended = yield* outage;
      if (Option.isSome(ended)) return ended.value;
    }
  });
