// `film lab events`: the lab's events (the catalogue, `core/lab-events.ts`)
// on a terminal, read from the running lab at `FILM_LAB_URL` through its
// change feed (`changes`, `lab-client.ts`). With `--follow` it keeps
// running and prints one line per event as the lab sees it, so a Claude Code
// Monitor wakes on each without polling; without it, it prints the events
// past `--since` and the cursor to read on from.
//
//   film lab events [--follow] [--name <glob>…] [--film <f>] [--since <cursor>] [--json] [--gone-after <dur>]
//
// A line is the event's name first, then its cursor (the one to read on from
// after it), when the lab saw it, its id (made from its record: the same
// from every lab that tells it, so a reader told it twice knows it), what it
// is about, its summary, the command that reads its whole record, and its
// lab link:
//
//   ask.answered cursor=k3x.12 at=… id=3f0c… film=f ask=a1 summary="…" read="bun cli.ts lab ask_read --ask a1" link=http://…
//
// `--json` prints `{"cursor":…,"event":…}` a line instead, the event as the
// catalogue's payload schema encodes it. An event of a kind this checkout
// does not know (a newer lab's) is printed from the fields every event has,
// and said once on stderr. What is not an event goes to stderr: the stream
// following, the lab lost and asked again, the stream reconnected and
// reading on from its cursor (`lab-stream.ts`), a cursor the lab no longer
// knows. A lab silent past `--gone-after`, a refusal of the lab's (a
// `--name` no event matches, a film it does not have), or an answer this
// checkout cannot read ends it with a non-zero exit, said as `{"_tag",
// "message"}` on stdout too with `--json`.

import {
  Boolean as Bool,
  Console,
  type Duration,
  Effect,
  Match,
  Option,
  Ref,
  Schema,
} from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';
import { HeardChange, isKnownChange } from '../core/lab-events.ts';
import { failureLine } from './lab-cli.ts';
import { isLostLab, labClient, labUrl } from './lab-client.ts';
import { cursorAfter } from './lab-events.ts';
import {
  type HeardChanges,
  type Heard,
  type StreamPace,
  followLab,
  labFeed,
} from './lab-stream.ts';

/** Words in one line, quoted: a newline in them would split the line. */
const quoted = Schema.encodeSync(Schema.fromJsonString(Schema.String));

const eventJson = Schema.encodeSync(
  Schema.fromJsonString(Schema.Struct({ cursor: Schema.String, event: HeardChange })),
);
const cursorJson = Schema.encodeSync(
  Schema.fromJsonString(Schema.Struct({ cursor: Schema.String })),
);

/** The fields a line names when the event has them, in this order. */
const ABOUT = ['film', 'set', 'note', 'panel', 'address', 'ask', 'step', 'production'] as const;

/** One event as a line: its name, the cursor after it, what it is about, its summary, its read and its link. Pure. */
const eventLine = (cursor: string, change: HeardChange): string =>
  [
    change.kind,
    `cursor=${cursor}`,
    `at=${change.at}`,
    ...Option.toArray(Option.map(Option.fromUndefinedOr(change.id), (id) => `id=${id}`)),
    ...ABOUT.flatMap((key) =>
      Option.toArray(Option.map(Option.fromUndefinedOr(change[key]), (value) => `${key}=${value}`)),
    ),
    `summary=${quoted(change.summary)}`,
    ...Option.toArray(
      Option.map(Option.fromUndefinedOr(change.read), (read) => `read=${quoted(read.cli)}`),
    ),
    `link=${change.links.local}`,
  ].join(' ');

/** How events are printed: a line each, or JSON. */
interface Printing {
  readonly json: boolean;
}

/**
 * Each event of `answer` printed, a line each, with the cursor after it;
 * the first of each kind this checkout does not know (kept in `foreign`)
 * said on stderr.
 */
const printed = (answer: HeardChanges, printing: Printing, foreign: Ref.Ref<ReadonlySet<string>>) =>
  Effect.forEach(
    answer.changes,
    (change) =>
      Effect.gen(function* () {
        const told = yield* Ref.get(foreign);
        if (!isKnownChange(change) && !told.has(change.kind)) {
          yield* Ref.set(foreign, new Set([...told, change.kind]));
          yield* Console.error(
            `lab events: ${change.kind} is an event this checkout does not know (the lab runs newer code): printed from the fields every event has`,
          );
        }
        const cursor = cursorAfter(answer.cursor, change);
        yield* Console.log(
          Bool.match(printing.json, {
            onTrue: () => eventJson({ cursor, event: change }),
            onFalse: () => eventLine(cursor, change),
          }),
        );
      }),
    { discard: true },
  );

/** A cursor the lab no longer knows, said: what follows is all it kept. */
const resetSaid = (answer: HeardChanges) =>
  Effect.when(
    Console.error(
      `lab events: the lab no longer knows that cursor (it restarted, or the events aged out); these are every event it kept, read on from ${answer.cursor}`,
    ),
    Effect.succeed(answer.reset),
  );

/** What `film lab events` reads: its flags. */
interface EventsInput {
  readonly follow: boolean;
  readonly name: ReadonlyArray<string>;
  readonly film: Option.Option<string>;
  readonly since: Option.Option<string>;
  readonly json: boolean;
  readonly goneAfter: Option.Option<Duration.Duration>;
}

/** What `film lab events` does with its flags: the events past a cursor, or followed. */
const events = Effect.fn('film.lab.events')(function* (input: EventsInput, pace: StreamPace) {
  const url = yield* labUrl;
  const client = yield* labClient(url);
  const feed = labFeed(client, {
    ...Option.match(
      Option.liftPredicate(input.name, (n) => n.length > 0),
      {
        onNone: () => ({}),
        onSome: (name) => ({ name }),
      },
    ),
    ...Option.match(input.film, { onNone: () => ({}), onSome: (film) => ({ film }) }),
  });
  const foreign = yield* Ref.make<ReadonlySet<string>>(new Set());
  if (!input.follow)
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const answer = yield* feed.changes(yield* feed.session, input.since, 0);
        yield* resetSaid(answer);
        yield* printed(answer, input, foreign);
        yield* Console.log(
          Bool.match(input.json, {
            onTrue: () => cursorJson({ cursor: answer.cursor }),
            onFalse: () => `cursor=${answer.cursor}`,
          }),
        );
      }),
    );
  const none = Effect.succeed(Option.none<never>());
  return yield* followLab(
    feed,
    { since: input.since, pace, isLost: isLostLab, goneAfter: input.goneAfter },
    (heard: Heard<string>) =>
      Match.value(heard).pipe(
        Match.tagsExhaustive({
          Connected: ({ cursor, resumed }) =>
            Effect.as(
              Console.error(
                Bool.match(resumed, {
                  onTrue: () => `lab events: reconnected to ${url}, reading on from ${cursor}`,
                  onFalse: () => `lab events: following ${url} from ${cursor}`,
                }),
              ),
              Option.none<never>(),
            ),
          Answer: ({ answer }) =>
            Effect.andThen(
              Effect.andThen(resetSaid(answer), printed(answer, input, foreign)),
              none,
            ),
          Lost: ({ reason }) =>
            Effect.as(
              Console.error(`lab events: lost the lab (${reason}); asking again`),
              Option.none<never>(),
            ),
        }),
      ),
  );
});

/** `film lab events`, its stream read at `pace` (`STREAM_PACE` on a terminal). */
export const labEventsAt = (pace: StreamPace) =>
  Command.make(
    'events',
    {
      follow: Flag.Boolean('follow').pipe(
        Flag.withDefault(false),
        Flag.withDescription(
          'keep running and print each event as the lab sees it (a lost lab is asked again)',
        ),
      ),
      name: Flag.String('name').pipe(
        Flag.atLeast(0),
        Flag.withDescription(
          'only the events of this name, a glob over the catalogue (ask.*, *.approved); repeat for more',
        ),
      ),
      film: Flag.String('film').pipe(
        Flag.optional,
        Flag.withDescription('only the events about this film'),
      ),
      since: Flag.String('since').pipe(
        Flag.optional,
        Flag.withDescription(
          "read past this cursor (a line's cursor=, or `changes`'s); none: from now",
        ),
      ),
      json: Flag.Boolean('json').pipe(
        Flag.withDefault(false),
        Flag.withDescription('print each event as one JSON line: {"cursor":…,"event":…}'),
      ),
      goneAfter: Flag.String('gone-after').pipe(
        Flag.withSchema(Schema.DurationFromString),
        Flag.optional,
        Flag.withDescription(
          'with --follow: end, non-zero, once the lab has not answered for this long ("10 minutes"); none: never',
        ),
      ),
    },
    (input: EventsInput) =>
      events(input, pace).pipe(
        Effect.tapError((error) =>
          Effect.when(Console.log(failureLine(error)), Effect.succeed(input.json)),
        ),
      ),
  ).pipe(
    Command.withDescription(
      "The lab's events (the catalogue `changes` reads) from the running lab (FILM_LAB_URL): with --follow, one line per event as it happens, for a Monitor to wake on",
    ),
    Command.provide(FetchHttpClient.layer),
  );
