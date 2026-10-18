// One log line per MCP tool call, the lab's and the easel's, as each ends:
// `[mcp] tool=<name> <ids> outcome=<ok|failed|interrupted> ms=<n>`. A call
// is told by the ids it names (a film, a note, a set, a cursor), never by
// its words: a note's text, a reply, an ask's question or a quote stay out.

import { Boolean as Bool, Cause, Clock, Effect, Exit, Option, Schema } from 'effect';

/** The arguments a call is logged by: names and ids, never words. */
const LOGGED_ARGS = [
  'film',
  'note',
  'panel',
  'beat',
  'scene',
  'set',
  'name',
  'ask',
  'production',
  'status',
  'since',
  'wait',
  'try',
  'version',
  'figure',
] as const;

/** A tool call's arguments as far as its line reads them: the logged ones, each a name, an id or a count. */
export type CallParams = { readonly [Arg in (typeof LOGGED_ARGS)[number]]?: string | number };

const isJsonObject = Schema.is(Schema.JsonObject);
const isLogged = Schema.is(Schema.Union([Schema.String, Schema.Finite]));

/** A call's raw arguments as its line reads them: each logged one that is a word or a number. Pure. */
export const callParamsOf = (raw: Schema.Json): CallParams =>
  Option.match(Option.liftPredicate(raw, isJsonObject), {
    onNone: () => ({}),
    onSome: (record) =>
      Object.fromEntries(
        LOGGED_ARGS.flatMap((key) =>
          Option.toArray(
            Option.map(
              Option.filter(Option.fromUndefinedOr(record[key]), isLogged),
              (value) => [key, value] as const,
            ),
          ),
        ),
      ),
  });

/** `params`' logged arguments, as ` key=value` each (`LOGGED_ARGS`). Pure. */
const callArgs = (params: CallParams): string =>
  LOGGED_ARGS.flatMap((key) =>
    Option.fromUndefinedOr(params[key]).pipe(
      Option.match({ onNone: () => [], onSome: (value) => [` ${key}=${String(value)}`] }),
    ),
  ).join('');

/** How a call ended, as its line says it. */
const outcomeOf = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.match(exit, {
    onSuccess: () => 'ok',
    onFailure: (cause) =>
      Bool.match(Cause.hasInterruptsOnly(cause), {
        onTrue: () => 'interrupted',
        onFalse: () => 'failed',
      }),
  });

/**
 * The tool `tool`'s handler `handle`, each call logged once as it ends
 * (`[mcp] tool=…`): its ids (`callArgs`), how it ended and how long it took.
 */
export const logged =
  <P extends CallParams, C, A, E, R>(
    tool: string,
    handle: (params: P, context: C) => Effect.Effect<A, E, R>,
  ) =>
  (params: P, context: C): Effect.Effect<A, E, R> =>
    Effect.flatMap(Clock.currentTimeMillis, (start) =>
      handle(params, context).pipe(
        Effect.onExit((exit) =>
          Effect.flatMap(Clock.currentTimeMillis, (end) =>
            Effect.logInfo(
              `[mcp] tool=${tool}${callArgs(params)} outcome=${outcomeOf(exit)} ms=${end - start}`,
            ),
          ),
        ),
      ),
    );
