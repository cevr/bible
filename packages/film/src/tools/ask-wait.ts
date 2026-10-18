// `film ask wait`'s latch: an agent's background command that ends when the
// owner has answered, so the agent hears it as the command's exit instead of
// the owner saying "answered" in chat (interim, until Claude channels). The
// asks are the record: each read of them says whether the latch holds; the
// change feed only says when to read them again (a change to the ask, or
// any ask answered, or a `reset`). The cursor is taken before the first
// read, so an answer between the two is never missed, and it is the latch's,
// not a session's: a lab that stops answering is asked again with backoff,
// and the new session reads the asks again (a lab restarted saw what it
// missed as its baseline, not as a change) and the feed on from the cursor.
// What it held on (the ask, or every ask on the page) is printed a line
// each (`askLines`).

import {
  Array as Arr,
  Clock,
  Data,
  Duration,
  Effect,
  Match,
  Option,
  Predicate,
  Record,
  Ref,
  Result,
  Schedule,
  Schema,
  type Scope,
} from 'effect';
import type { LabChange } from '../core/lab-events.ts';
import { AskUnknown } from '../core/refusals.ts';
import type { AskRead } from './asks-mcp.ts';
import type { LabChanges } from './lab-events.ts';

/** Words in one line, quoted: a newline in them would split the line. */
const quoted = Schema.encodeSync(Schema.fromJsonString(Schema.String));

/**
 * What the latch waits for: one ask (answered, closed, or one step of it
 * answered), every ask on a page (each answered or closed; `page` is any
 * ask's id, its page the one it is on), or any ask answered.
 */
export type AskLatch = Data.TaggedEnum<{
  One: { readonly ask: string; readonly step: Option.Option<string> };
  Page: { readonly page: string };
  Any: { readonly production: Option.Option<string> };
}>;
export const AskLatch = Data.taggedEnum<AskLatch>();

/** The wait ran past `--timeout`. */
class AskWaitTimeout extends Schema.TaggedError<AskWaitTimeout>()('AskWaitTimeout', {
  waited: Schema.String,
}) {
  override get message() {
    return `ask.wait.timeout: no answer after ${this.waited}`;
  }
}

/** The lab as the latch reads it: a session (ended with its scope), the feed past a cursor, every ask. */
export interface AskFeed<S, E> {
  readonly session: Effect.Effect<S, E, Scope.Scope>;
  readonly changes: (
    session: S,
    since: Option.Option<string>,
    wait: number,
  ) => Effect.Effect<LabChanges, E>;
  readonly asks: (session: S) => Effect.Effect<ReadonlyArray<AskRead>, E>;
}

/** How the latch reads: each wait in seconds, the backoff before asking a silent lab again, and how often it says so. */
interface LatchPace {
  readonly wait: number;
  readonly retry: Schedule.Schedule<unknown, unknown>;
  readonly sayEvery: Duration.Input;
}

/** The pace `film ask wait` reads at: 50 s waits (inside the lab's 120 s), 250 ms doubling to 10 s, said once a minute. */
export const ASK_WAIT_PACE: LatchPace = {
  wait: 50,
  retry: Schedule.exponential('250 millis').pipe(
    Schedule.modifyDelay(({ duration }) =>
      Effect.succeed(Duration.min(Duration.fromInputUnsafe(duration), Duration.seconds(10))),
    ),
  ),
  sayEvery: '1 minute',
};

/** Whether `change` may move the latch: a reason to read the asks again. */
const moves = (latch: AskLatch, change: LabChange): boolean =>
  AskLatch.$match(latch, {
    One: ({ ask }) => change.ask === ask,
    // An ask that joins the page moves it as much as one answered on it.
    Page: () => Predicate.isNotUndefined(change.ask),
    Any: () => change.kind === 'ask.answered',
  });

/**
 * The asks the latch holds on in `asks` (newest first, as the lab lists
 * them), if it holds: the one ask, or every ask on the page in the order
 * made; `AskUnknown` when it waits on one the lab does not have. `before`
 * is the asks already answered or closed at the first read: `Any` waits for
 * one answered after it.
 */
const holds = (
  latch: AskLatch,
  asks: ReadonlyArray<AskRead>,
  before: ReadonlySet<string>,
): Result.Result<Option.Option<ReadonlyArray<AskRead>>, AskUnknown> => {
  const named = (ask: string) =>
    Result.fromOption(
      Arr.findFirst(asks, (a) => a.ask === ask),
      () => AskUnknown.make({ id: ask }),
    );
  return AskLatch.$match(latch, {
    One: ({ ask, step }) =>
      Result.map(named(ask), (read) =>
        Option.liftPredicate(
          [read],
          () =>
            read.status !== 'asking' ||
            Option.exists(step, (s) => read.answered.some((a) => a.step === s)),
        ),
      ),
    Page: ({ page }) =>
      Result.map(named(page), (read) => {
        const on = Arr.reverse(asks.filter((a) => a.page.id === read.page.id));
        return Option.liftPredicate(on, (all) => all.every((a) => a.status !== 'asking'));
      }),
    Any: ({ production }) =>
      Result.succeed(
        Option.map(
          Arr.findFirst(
            asks,
            (a) =>
              a.status === 'answered' &&
              !before.has(a.ask) &&
              Option.match(production, { onNone: () => true, onSome: (p) => a.production === p }),
          ),
          Arr.of,
        ),
      ),
  });
};

/** The asks answered or closed in `asks`: what `Any` does not count. */
const settled = (asks: ReadonlyArray<AskRead>): ReadonlySet<string> =>
  new Set(asks.filter((a) => a.status !== 'asking').map((a) => a.ask));

/**
 * The asks once `latch` holds on them (the one ask, or every ask on the
 * page): at once when it already does, else when
 * a read the feed wakes says so. `AskUnknown` for an ask the lab does not
 * have; `AskWaitTimeout` once `timeout` passes. A lab that does not answer
 * is never a failure: it is asked again after `pace.retry`, and said once
 * each `pace.sayEvery`.
 */
export const waitForAsk = <S, E extends { readonly message: string }>(
  feed: AskFeed<S, E>,
  latch: AskLatch,
  pace: LatchPace,
  timeout: Option.Option<Duration.Duration>,
) =>
  Effect.gen(function* () {
    const cursor = yield* Ref.make(Option.none<string>());
    const before = yield* Ref.make(Option.none<ReadonlySet<string>>());
    const said = yield* Ref.make(Option.none<number>());

    const connected = Effect.gen(function* () {
      const session = yield* feed.session;
      if (Option.isNone(yield* Ref.get(cursor)))
        yield* Ref.set(
          cursor,
          Option.some((yield* feed.changes(session, Option.none(), 0)).cursor),
        );
      yield* Effect.logDebug('ask.wait.connected');
      while (true) {
        const asks = yield* feed.asks(session);
        if (Option.isNone(yield* Ref.get(before)))
          yield* Ref.set(before, Option.some(settled(asks)));
        const seen = Option.getOrElse(yield* Ref.get(before), () => new Set<string>());
        const held = holds(latch, asks, seen);
        if (Result.isFailure(held)) return Result.fail(held.failure);
        if (Option.isSome(held.success)) return Result.succeed(held.success.value);
        let woken = false;
        while (!woken) {
          const answer = yield* feed.changes(session, yield* Ref.get(cursor), pace.wait);
          yield* Ref.set(cursor, Option.some(answer.cursor));
          woken = answer.reset || answer.changes.some((change) => moves(latch, change));
        }
      }
    });

    const lost = (error: E) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const last = yield* Ref.get(said);
        if (Option.exists(last, (at) => now - at < Duration.toMillis(pace.sayEvery))) return;
        yield* Ref.set(said, Option.some(now));
        yield* Effect.logWarning(`[ask] wait lab=unreachable reason=${quoted(error.message)}`);
      });

    const held = yield* Effect.scoped(connected).pipe(
      Effect.tapError(lost),
      Effect.retry(pace.retry),
    );
    return yield* Effect.fromResult(held);
  }).pipe((waiting) =>
    Option.match(timeout, {
      onNone: () => waiting,
      onSome: (after) =>
        Effect.timeoutOrElse(waiting, {
          duration: after,
          orElse: () =>
            Effect.logWarning(`ask.wait.timeout after="${Duration.format(after)}"`).pipe(
              Effect.andThen(Effect.fail(AskWaitTimeout.make({ waited: Duration.format(after) }))),
            ),
        }),
    }),
  );

/** The ask as plain lines: its head (its page among it), each step answered, each answer typed, why it closed, its links. */
export const askLines = (read: AskRead): ReadonlyArray<string> => [
  `ask ${read.ask} status=${read.status}${Option.match(Option.fromUndefinedOr(read.step), {
    onNone: () => '',
    onSome: (step) => ` step=${step}`,
  })} page=${read.page.id} by=${read.by} title=${quoted(read.title)}`,
  ...read.answered.map((a) => `answered step=${a.step} at=${a.at}`),
  ...Record.toEntries(read.answers).map(
    ([id, answer]) =>
      `answer ${id} ${Match.value(answer).pipe(
        Match.discriminatorsExhaustive('kind')({
          choose: (c) => `choose value=${c.value} label=${quoted(c.label)}`,
          free_text: (t) => `free_text text=${quoted(t.text)}`,
          skipped: () => 'skipped',
        }),
      )}`,
  ),
  ...Option.toArray(
    Option.map(Option.fromUndefinedOr(read.closed), (why) => `closed why=${quoted(why)}`),
  ),
  `local ${read.links.local}`,
  ...Option.toArray(Option.map(Option.fromUndefinedOr(read.links.phone), (p) => `phone ${p}`)),
];
