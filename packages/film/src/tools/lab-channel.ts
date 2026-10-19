// `film channel`: the lab's change feed pushed into a Claude Code session as
// channel events. Claude Code reads a server's push only from a stdio server
// it spawned, that declares `experimental['claude/channel']`, through the
// method `notifications/claude/channel`; the lab is an HTTP server many
// sessions share, and Effect's stdio server sends neither that capability nor
// that method. So the bridge is its own small JSON-RPC loop over stdin and
// stdout: it answers Claude Code's handshake, then asks the lab's MCP at
// `FILM_LAB_URL` (through `lab-client.ts`, the one client of it) for
// `changes`, waiting up to `WAIT_S` each time, and sends each change on as
// one channel event: its summary and links as the text, what it is about as
// attributes.
// The lab stays the one record and the one feed; the bridge reads the lab's
// event stream (`lab-stream.ts`, the one `film lab events --follow` prints),
// whose cursor outlives a session: a lab that stops answering is asked again
// with backoff and read on from it.
//
//   claude mcp add lab-events -s user -- bun <app>/cli.ts channel
//   claude --dangerously-load-development-channels server:lab-events

import {
  Array as Arr,
  Boolean as Bool,
  Match,
  Effect,
  Option,
  Queue,
  Schema,
  Stdio,
  Stream,
} from 'effect';
import { Command } from 'effect/cli';
import type { HeardChange } from '../core/lab-events.ts';
import { isLostLab, labClient, labUrl } from './lab-client.ts';
import { type Heard, STREAM_PACE, followLab, labFeed } from './lab-stream.ts';

/** The capability Claude Code reads a channel by. */
const CHANNEL = 'claude/channel';

/** The method a channel event is sent with. */
const CHANNEL_EVENT = 'notifications/claude/channel';

/** The most changes one reconnect sends on: the rest are said in one line. */
const CATCH_UP = 20;

/** The protocol versions the bridge speaks, newest first: the client's when it asks one of them. */
const VERSIONS: ReadonlyArray<string> = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = [
  'Events from the film lab arrive as <channel source="lab-events" kind="…" film="…">: the owner wrote a note, asked a tweak of a board panel, kept a try, approved or withdrew a beat or a render, commented on a render, or a set was published.',
  "Act on one with the lab's MCP tools (server `lab`): read it in full (`notes`, `board`, `catalogue`), do the work, then `reply` on its note saying what changed and where to look, and `resolve` it once made. The event's link opens the place in the lab.",
].join('\n\n');

/** A JSON-RPC message as the bridge reads one: a request (with an id) or a notification. */
const Incoming = Schema.Struct({
  id: Schema.optionalKey(Schema.Union([Schema.String, Schema.Finite])),
  method: Schema.optionalKey(Schema.String),
  params: Schema.optionalKey(Schema.Json),
});
type Incoming = typeof Incoming.Type;

const JsonText = Schema.fromJsonString(Schema.Json);
const readIncoming = Schema.decodeUnknownOption(Schema.fromJsonString(Incoming));
const writeJson = Schema.encodeSync(JsonText);

/** The protocol version a client asked for, when it is one the bridge speaks; else the bridge's own. */
const versionFor = (params: Option.Option<Schema.Json>): string =>
  Option.getOrElse(
    Option.filter(
      Option.flatMap(params, (p) =>
        Option.flatMap(
          Option.liftPredicate(p, Schema.is(Schema.Struct({ protocolVersion: Schema.String }))),
          (v) => Option.some(v.protocolVersion),
        ),
      ),
      (v) => VERSIONS.includes(v),
    ),
    () => '2025-06-18',
  );

/** A JSON-RPC answer to request `id`. */
const result = (id: string | number, value: Schema.Json): Schema.Json => ({
  jsonrpc: '2.0',
  id,
  result: value,
});

/**
 * What the bridge answers `message` with, if anything: the handshake (the
 * channel capability, no tools), a ping, and an empty tool list; any other
 * request is a method it lacks; a notification is answered by nothing.
 */
const answerTo = (message: Incoming): Option.Option<Schema.Json> =>
  Option.map(Option.fromUndefinedOr(message.id), (id) => {
    switch (message.method) {
      case 'initialize':
        return result(id, {
          protocolVersion: versionFor(Option.fromUndefinedOr(message.params)),
          capabilities: { experimental: { [CHANNEL]: {} }, tools: {} },
          serverInfo: { name: 'lab-events', version: '0.1.0' },
          instructions: INSTRUCTIONS,
        });
      case 'ping':
        return result(id, {});
      case 'tools/list':
        return result(id, { tools: [] });
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `lab-events has no method ${Option.getOrElse(Option.fromUndefinedOr(message.method), () => '(none)')}`,
          },
        };
    }
  });

/** The attributes of a change's event: what it is about, each a string, by an identifier key. */
const metaOf = (change: HeardChange): Record<string, string> => {
  const about: ReadonlyArray<readonly [string, Option.Option<string | number>]> = [
    ['film', Option.fromUndefinedOr(change.film)],
    ['set', Option.fromUndefinedOr(change.set)],
    ['note', Option.fromUndefinedOr(change.note)],
    ['panel', Option.fromUndefinedOr(change.panel)],
    ['beat', Option.fromUndefinedOr(change.beat)],
    ['try', Option.fromUndefinedOr(change.try)],
    ['variant', Option.fromUndefinedOr(change.variant)],
    ['by', Option.fromUndefinedOr(change.by)],
  ];
  return Object.fromEntries([
    ['kind', change.kind],
    ['seq', String(change.seq)],
    ...Arr.getSomes(
      about.map(([key, value]) => Option.map(value, (v) => [key, String(v)] as const)),
    ),
    ['link', change.links.local],
    ...Option.toArray(
      Option.map(Option.fromUndefinedOr(change.links.phone), (phone) => ['phone', phone] as const),
    ),
  ]);
};

/** One change as the channel event Claude Code reads: its summary, its words in full, its links (local, then the phone's). */
const channelEvent = (change: HeardChange): Schema.Json => ({
  jsonrpc: '2.0',
  method: CHANNEL_EVENT,
  params: {
    content: Arr.join(
      [
        change.summary,
        ...Option.toArray(
          Option.filter(Option.fromUndefinedOr(change.text), (t) => !change.summary.endsWith(t)),
        ),
        change.links.local,
        ...Option.toArray(Option.fromUndefinedOr(change.links.phone)),
      ],
      '\n',
    ),
    meta: metaOf(change),
  },
});

/** The changes a reconnect sends on: the newest `CATCH_UP`, and a line for the rest. */
const caughtUp = (changes: ReadonlyArray<HeardChange>): ReadonlyArray<Schema.Json> => {
  const dropped = changes.length - CATCH_UP;
  const told = changes.slice(-CATCH_UP).map(channelEvent);
  return Bool.match(dropped > 0, {
    onTrue: () => [
      {
        jsonrpc: '2.0',
        method: CHANNEL_EVENT,
        params: {
          content: `The lab restarted or the bridge was away: ${dropped} earlier changes are not sent; call the lab's \`overview\` to catch up.`,
          meta: { kind: 'catch_up', dropped: String(dropped) },
        },
      },
      ...told,
    ],
    onFalse: () => told,
  });
};

/**
 * The bridge: Claude Code's handshake answered from stdin, then the lab's
 * changes sent as channel events on stdout, one JSON message a line, until
 * stdin ends (Claude Code stopped it).
 */
const runChannel = (url: string) =>
  Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio;
    const outgoing = yield* Queue.unbounded<string>();
    const send = (message: Schema.Json) => Queue.offer(outgoing, `${writeJson(message)}\n`);
    const client = yield* labClient(url);
    /** The lab's feed: a session (ended with its connection), then `changes` past a cursor (none: the cursor now). */
    const feed = labFeed(client);

    /** The lab's changes, relayed for as long as the bridge runs: a lost session is started again. */
    const relay = followLab(
      feed,
      { since: Option.none(), pace: STREAM_PACE, isLost: isLostLab, goneAfter: Option.none() },
      (heard: Heard<string>) =>
        Match.value(heard).pipe(
          Match.tagsExhaustive({
            Connected: () => Effect.as(Effect.log('lab.channel.connected'), Option.none()),
            Answer: ({ answer }) =>
              Effect.gen(function* () {
                const told = Bool.match(answer.reset, {
                  onTrue: () => caughtUp(answer.changes),
                  onFalse: () => answer.changes.map(channelEvent),
                });
                yield* Effect.forEach(told, send, { discard: true });
                if (told.length > 0) yield* Effect.log(`lab.channel.sent count=${told.length}`);
                return Option.none();
              }),
            Lost: ({ reason }) =>
              Effect.as(
                Effect.logWarning(`lab.channel.unanswered url=${url} reason="${reason}"`),
                Option.none(),
              ),
          }),
        ),
    );

    const answering = stdio.stdin.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.filter((line) => line.trim().length > 0),
      Stream.runForEach((line) =>
        Option.match(readIncoming(line), {
          onNone: () => Effect.logWarning('lab.channel.unread message'),
          onSome: (message) =>
            Effect.gen(function* () {
              yield* Effect.forEach(Option.toArray(answerTo(message)), send, { discard: true });
              if (message.method === 'notifications/initialized') yield* Effect.forkScoped(relay);
            }),
        }),
      ),
    );
    yield* Effect.forkScoped(Stream.fromQueue(outgoing).pipe(Stream.run(stdio.stdout())));
    yield* answering;
  }).pipe(Effect.scoped);

/**
 * `film channel`: the bridge, for Claude Code to spawn (`claude mcp add
 * lab-events -- … channel`), over the HTTP client its root gives it.
 */
export const channel = Command.make('channel', {}, () =>
  Effect.gen(function* () {
    const url = yield* labUrl;
    yield* runChannel(url);
  }),
).pipe(
  Command.withDescription(
    "Relay the lab's change feed into a Claude Code session as channel events (a stdio server Claude Code spawns)",
  ),
);
