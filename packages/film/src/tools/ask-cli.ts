// `film ask wait`: a command that ends when the owner has answered an ask on
// the running lab (`FILM_LAB_URL`, through `lab-client.ts`), for an agent
// to run in the background and act on when it exits, instead of asking the
// owner to say "answered". The latch is `ask-wait.ts`: the lab's asks read,
// and read again whenever the lab's event stream (`lab-stream.ts`, the one
// `film lab events --follow` prints) says something moved; a lab that does
// not answer is asked again with backoff and never ends the wait.
//
//   film ask wait <ask> [--step <id>] [--timeout <dur>] [--json]
//       until the ask is answered to its end or closed (with --step, until
//       that step is answered, or the ask can no longer reach it)
//   film ask wait --page <id> [--timeout <dur>] [--json]
//       until every ask on the page (`<id>` any ask's, its page the one it
//       is on) is answered or closed, an ask that joins it meanwhile too
//   film ask wait --any [--production <p>] [--timeout <dur>] [--json]
//       until any ask (of that production) is answered after the wait began
//
// It prints each ask it held on (the page's in the order made) as the lab
// MCP's `ask_read` answers it, a line each (`askLines`, `ask-wait.ts`), or
// as one JSON line each (`--json`), and exits 0. An ask the lab
// does not have is `AskUnknown`; `--timeout` elapsed is `AskWaitTimeout`
// (`ask.wait.timeout`), each a non-zero exit.

import { Argument, Command, Flag } from 'effect/cli';
import { Console, Effect, Option, Result, Schema } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { AskRead, AsksTool } from './asks-mcp.ts';
import { ASK_WAIT_PACE, type AskFeed, AskLatch, askLines, waitForAsk } from './ask-wait.ts';
import { isLostLab, labClient, labUrl } from './lab-client.ts';
import { labFeed } from './lab-stream.ts';

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
  readonly page: Option.Option<string>;
  readonly any: boolean;
  readonly production: Option.Option<string>;
}): Result.Result<AskLatch, AskWaitInvalid> => {
  const invalid = (reason: string) => Result.fail(AskWaitInvalid.make({ reason }));
  const ways = [Option.isSome(input.ask), Option.isSome(input.page), input.any].filter(Boolean);
  if (ways.length > 1) return invalid('an ask, --page or --any: one of them');
  if (Option.isSome(input.production) && !input.any) return invalid('--production goes with --any');
  if (Option.isSome(input.ask))
    return Result.succeed(AskLatch.One({ ask: input.ask.value, step: input.step }));
  if (Option.isSome(input.step)) return invalid('--step needs an ask');
  if (Option.isSome(input.page)) return Result.succeed(AskLatch.Page({ page: input.page.value }));
  if (!input.any) return invalid('name an ask, or wait on --page or --any');
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
    page: Flag.String('page').pipe(
      Flag.optional,
      Flag.withDescription(
        'end once every ask on this page (any of its asks, by id) is answered or closed',
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
      Flag.withDescription("print each ask as one JSON line, as the lab MCP's ask_read answers it"),
    ),
  },
  Effect.fn('film.ask.wait')(function* (input) {
    const latch = yield* Effect.fromResult(latchOf(input));
    const client = yield* labClient(yield* labUrl);
    const feed: AskFeed<string, { readonly message: string }> = {
      ...labFeed(client),
      asks: (session: string) =>
        Effect.map(client.call(session, AsksTool, {}), (listed) => listed.asks),
    };
    const reads = yield* waitForAsk(feed, latch, ASK_WAIT_PACE, input.timeout, isLostLab);
    for (const read of reads) {
      yield* Effect.log(`ask.wait.latched ask=${read.ask} status=${read.status}`);
      if (input.json) yield* Console.log(readJson(read));
      else for (const line of askLines(read)) yield* Console.log(line);
    }
  }),
).pipe(
  Command.withDescription(
    'Wait until the owner answers an ask, or every ask on a page (--page), on the running lab (FILM_LAB_URL), then print each as ask_read answers it and exit 0: run it in the background and act when it exits',
  ),
);

export const ask = Command.make('ask').pipe(
  Command.withDescription("The lab's asks from the terminal: wait on the owner's answer"),
  Command.withSubcommands([wait]),
  Command.provide(FetchHttpClient.layer),
);
