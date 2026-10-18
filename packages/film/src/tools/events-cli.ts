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
// after it), when the lab saw it, what it is about, its summary, the command
// that reads its whole record, and its lab link:
//
//   ask.answered cursor=k3x.12 at=… film=f ask=a1 summary="…" read="bun cli.ts lab ask_read --ask a1" link=http://…
//
// `--json` prints `{"cursor":…,"event":…}` a line instead, the event as the
// catalogue's payload schema encodes it. What is not an event goes to
// stderr: the stream following, the lab lost and asked again, the stream
// reconnected and reading on from its cursor (`lab-stream.ts`), a cursor
// the lab no longer knows. Only a lab silent past `--gone-after`, or a
// refusal of the lab's, ends it, with a non-zero exit.

import {
  Array as Arr,
  Boolean as Bool,
  Console,
  type Duration,
  Effect,
  Match,
  Option,
  Predicate,
  Schema,
} from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';
import { LabChange } from '../core/lab-events.ts';
import { labClient, labUrl } from './lab-client.ts';
import { Changes } from './lab-commands.ts';
import { type LabChanges, cursorAfter } from './lab-events.ts';
import { type Heard, type StreamPace, followLab } from './lab-stream.ts';

/** Words in one line, quoted: a newline in them would split the line. */
const quoted = Schema.encodeSync(Schema.fromJsonString(Schema.String));

const eventJson = Schema.encodeSync(
  Schema.fromJsonString(Schema.Struct({ cursor: Schema.String, event: LabChange })),
);
const cursorJson = Schema.encodeSync(
  Schema.fromJsonString(Schema.Struct({ cursor: Schema.String })),
);

/** The fields a line names when the event has them, in this order. */
const ABOUT = ['film', 'set', 'note', 'panel', 'address', 'ask', 'step', 'production'] as const;

/** One event as a line: its name, the cursor after it, what it is about, its summary, its read and its link. Pure. */
const eventLine = (cursor: string, change: LabChange): string =>
  [
    change.kind,
    `cursor=${cursor}`,
    `at=${change.at}`,
    ...ABOUT.flatMap((key) =>
      Option.toArray(Option.map(Option.fromUndefinedOr(change[key]), (value) => `${key}=${value}`)),
    ),
    `summary=${quoted(change.summary)}`,
    `read=${quoted(change.read.cli)}`,
    `link=${change.links.local}`,
  ].join(' ');

/** How events are printed: a line each, or JSON. */
interface Printing {
  readonly json: boolean;
}

/** Each event of `answer` printed, a line each, with the cursor after it. */
const printed = (answer: LabChanges, printing: Printing) =>
  Effect.forEach(
    answer.changes,
    (change) => {
      const cursor = cursorAfter(answer.cursor, change);
      return Console.log(
        Bool.match(printing.json, {
          onTrue: () => eventJson({ cursor, event: change }),
          onFalse: () => eventLine(cursor, change),
        }),
      );
    },
    { discard: true },
  );

/** A cursor the lab no longer knows, said: what follows is all it kept. */
const resetSaid = (answer: LabChanges) =>
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

/** No lab answered: what the stream asks again; any other failure is the lab's refusal, which ends it. */
const isLost = (error: { readonly message: string }) => Predicate.isTagged(error, 'LabUnanswered');

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
    Effect.fn('film.lab.events')(function* (input: EventsInput) {
      const url = yield* labUrl;
      const client = yield* labClient(url);
      const of = {
        ...Arr.match(input.name, { onEmpty: () => ({}), onNonEmpty: (name) => ({ name }) }),
        ...Option.match(input.film, { onNone: () => ({}), onSome: (film) => ({ film }) }),
      };
      const changes = (session: string, since: Option.Option<string>, wait: number) =>
        client.call(session, Changes, {
          ...of,
          ...Option.match(since, { onNone: () => ({}), onSome: (cursor) => ({ since: cursor }) }),
          wait,
        });
      if (!input.follow)
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const answer = yield* changes(yield* client.session, input.since, 0);
            yield* resetSaid(answer);
            yield* printed(answer, input);
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
        { session: client.session, changes },
        { since: input.since, pace, isLost, goneAfter: input.goneAfter },
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
                Effect.andThen(Effect.andThen(resetSaid(answer), printed(answer, input)), none),
              Lost: ({ reason }) =>
                Effect.as(
                  Console.error(`lab events: lost the lab (${reason}); asking again`),
                  Option.none<never>(),
                ),
            }),
          ),
      );
    }),
  ).pipe(
    Command.withDescription(
      "The lab's events (the catalogue `changes` reads) from the running lab (FILM_LAB_URL): with --follow, one line per event as it happens, for a Monitor to wake on",
    ),
    Command.provide(FetchHttpClient.layer),
  );
