// `film ask wait`: a command that ends when the owner has answered an ask on
// the running lab (`FILM_LAB_URL`, through `lab-client.ts`), for an agent
// to run in the background and act on when it exits, instead of asking the
// owner to say "answered" (interim, until Claude channels). The latch is
// `ask-wait.ts`: the lab's asks read, and read again whenever its change
// feed says something moved; a lab that does not answer is asked again with
// backoff and never ends the wait.
//
//   film ask wait <ask> [--step <id>] [--timeout <dur>] [--json]
//       until the ask is answered to its end or closed (with --step, until
//       that step is answered, or the ask can no longer reach it)
//   film ask wait --any [--production <p>] [--timeout <dur>] [--json]
//       until any ask (of that production) is answered after the wait began
//
// It prints the ask as the lab MCP's `ask_read` answers it, a line each
// (`askLines`, `ask-wait.ts`), or as one JSON line (`--json`), and exits 0. An ask the lab
// does not have is `AskUnknown`; `--timeout` elapsed is `AskWaitTimeout`
// (`ask.wait.timeout`), each a non-zero exit.

import { Argument, Command, Flag } from 'effect/cli';
import { Console, Effect, Option, Result, Schema } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { AskRead, AsksTool } from './asks-mcp.ts';
import { ASK_WAIT_PACE, type AskFeed, AskLatch, askLines, waitForAsk } from './ask-wait.ts';
import { labClient, labUrl } from './lab-client.ts';
import { Changes } from './lab-mcp.ts';

/** A wait asked two ways at once, or neither. */
class AskWaitInvalid extends Schema.TaggedError<AskWaitInvalid>()('AskWaitInvalid', {
  reason: Schema.String,
}) {
  override get message() {
    return `ask wait: ${this.reason}`;
  }
}

const readJson = Schema.encodeSync(Schema.fromJsonString(AskRead));

/** What a wait is asked to end on, from its argument and flags, or why they do not fit together. */
const latchOf = (input: {
  readonly ask: Option.Option<string>;
  readonly step: Option.Option<string>;
  readonly any: boolean;
  readonly production: Option.Option<string>;
}): Result.Result<AskLatch, AskWaitInvalid> => {
  const invalid = (reason: string) => Result.fail(AskWaitInvalid.make({ reason }));
  if (Option.isSome(input.ask)) {
    if (input.any) return invalid('an ask or --any, not both');
    if (Option.isSome(input.production)) return invalid('--production goes with --any');
    return Result.succeed(AskLatch.One({ ask: input.ask.value, step: input.step }));
  }
  if (!input.any) return invalid('name an ask, or wait on --any');
  if (Option.isSome(input.step)) return invalid('--step needs an ask');
  return Result.succeed(AskLatch.Any({ production: input.production }));
};

const wait = Command.make(
  'wait',
  {
    ask: Argument.String('ask').pipe(
      Argument.optional,
      Argument.withDescription('the ask, by its id (as `ask` answered it)'),
    ),
    step: Flag.String('step').pipe(
      Flag.optional,
      Flag.withDescription(
        'end once this step is answered (or the ask is answered or closed without it)',
      ),
    ),
    any: Flag.Boolean('any').pipe(
      Flag.withDefault(false),
      Flag.withDescription('end on the first ask answered after the wait began, whichever'),
    ),
    production: Flag.String('production').pipe(
      Flag.optional,
      Flag.withDescription("with --any: only that production's asks"),
    ),
    timeout: Flag.String('timeout').pipe(
      Flag.withSchema(Schema.DurationFromString),
      Flag.optional,
      Flag.withDescription(
        'give up after this long ("90 minutes"), as ask.wait.timeout; none: wait forever',
      ),
    ),
    json: Flag.Boolean('json').pipe(
      Flag.withDefault(false),
      Flag.withDescription("print the ask as one JSON line, as the lab MCP's ask_read answers it"),
    ),
  },
  Effect.fn('film.ask.wait')(function* (input) {
    const latch = yield* Effect.fromResult(latchOf(input));
    const client = yield* labClient(yield* labUrl);
    const feed: AskFeed<string, { readonly message: string }> = {
      session: client.session,
      changes: (session: string, since: Option.Option<string>, wait: number) =>
        client.call(session, Changes, {
          ...Option.match(since, { onNone: () => ({}), onSome: (cursor) => ({ since: cursor }) }),
          wait,
        }),
      asks: (session: string) =>
        Effect.map(client.call(session, AsksTool, {}), (listed) => listed.asks),
    };
    const read = yield* waitForAsk(feed, latch, ASK_WAIT_PACE, input.timeout);
    yield* Effect.log(`ask.wait.latched ask=${read.ask} status=${read.status}`);
    if (input.json) return yield* Console.log(readJson(read));
    for (const line of askLines(read)) yield* Console.log(line);
  }),
).pipe(
  Command.withDescription(
    'Wait until the owner answers an ask on the running lab (FILM_LAB_URL), then print it as ask_read answers it and exit 0: run it in the background and act when it exits',
  ),
);

export const ask = Command.make('ask').pipe(
  Command.withDescription("The lab's asks from the terminal: wait on the owner's answer"),
  Command.withSubcommands([wait]),
  Command.provide(FetchHttpClient.layer),
);
