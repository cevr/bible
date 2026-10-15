// The lab's MCP as a command calls it: one small client of the running lab
// at `FILM_LAB_URL` (the always-on lab, http://127.0.0.1:8229/, unless set),
// for each command that works through the lab's tools (`film channel`'s
// change feed, `film production ask`). A session is started (`initialize`,
// then `notifications/initialized`; the lab says the session's id in
// `Mcp-Session-Id`), then each `tools/call` is typed by the lab's own tool
// (`lab-mcp.ts`): its arguments encoded by the tool's parameters, its
// structured answer decoded by the tool's success. The lab answers loopback
// with no token. No lab answering, or one answering in a shape this
// checkout does not read, is `LabUnanswered`; a tool's refusal is
// `LabToolRefused`, in the lab's words.

import { Array as Arr, Boolean as Bool, Config, Effect, Option, Ref, Schema } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/http';
import { MCP_PATH } from './lab-mcp.ts';

/** The protocol version the client speaks. */
const PROTOCOL = '2025-06-18';

/** The lab a command asks: the always-on one unless `FILM_LAB_URL` names another (a spare lab's port). */
export const labUrl = Config.String('FILM_LAB_URL').pipe(
  Config.withDefault('http://127.0.0.1:8229/'),
);

/** No lab answered at `url`, or the one there answered in a shape this checkout does not read. */
class LabUnanswered extends Schema.TaggedError<LabUnanswered>()('LabUnanswered', {
  url: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `no lab answered at ${this.url} (${this.reason}): start one (from apps/animations: bun run lab, or LAB_PORT=<port> bun cli.ts lab) and point FILM_LAB_URL at it`;
  }
}

/** A tool of the lab's that refused a call, in the lab's words. */
class LabToolRefused extends Schema.TaggedError<LabToolRefused>()('LabToolRefused', {
  tool: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the lab refused ${this.tool}: ${this.reason}`;
  }
}

/** A tool of the lab's MCP as the client calls it (`Tool.make` in lab-mcp.ts): its name, what it takes, what it answers. */
interface LabTool<P, PE, S, SE> {
  readonly name: string;
  readonly parametersSchema: Schema.Codec<P, PE>;
  readonly successSchema: Schema.Codec<S, SE>;
}

/** A message the client sends that calls no tool: the handshake, its notification. */
const Sent = Schema.fromJsonString(
  Schema.Struct({
    jsonrpc: Schema.Literal('2.0'),
    id: Schema.optionalKey(Schema.Finite),
    method: Schema.String,
    params: Schema.optionalKey(Schema.Json),
  }),
);

/** A call of a tool as the lab reads it: its name, and its arguments as the tool encodes them. */
const callOf = <P, PE>(parameters: Schema.Codec<P, PE>) =>
  Schema.fromJsonString(
    Schema.Struct({
      jsonrpc: Schema.Literal('2.0'),
      id: Schema.Finite,
      method: Schema.Literal('tools/call'),
      params: Schema.Struct({ name: Schema.String, arguments: parameters }),
    }),
  );

/** The lab's answer to a request, by the request's id: a tool's result, or the call refused unread. */
const Answer = Schema.Struct({
  id: Schema.optionalKey(Schema.Union([Schema.String, Schema.Finite])),
  result: Schema.optionalKey(
    Schema.Struct({
      isError: Schema.optionalKey(Schema.Boolean),
      structuredContent: Schema.optionalKey(Schema.Json),
      content: Schema.optionalKey(
        Schema.Array(Schema.Struct({ text: Schema.optionalKey(Schema.String) })),
      ),
    }),
  ),
  error: Schema.optionalKey(Schema.Struct({ message: Schema.String })),
});
const readAnswer = Schema.decodeOption(Schema.fromJsonString(Answer));

/** A refusal the lab sent encoded (`LabRefused`): its words. */
const readRefusal = Schema.decodeOption(
  Schema.fromJsonString(Schema.Struct({ reason: Schema.String })),
);

/** A refusal's words: the lab's `reason` when it sent the refusal encoded, else its text as it is. */
const refusalWords = (text: string): string =>
  Option.getOrElse(
    Option.map(readRefusal(text), (r) => r.reason),
    () => text,
  );

/** An answer as the lab sends it: one JSON body, or server-sent events with the answer among them. */
const messagesOf = (contentType: Option.Option<string>, body: string): ReadonlyArray<string> =>
  Bool.match(
    Option.exists(contentType, (t) => t.startsWith('text/event-stream')),
    {
      onTrue: () =>
        body
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice('data:'.length)),
      onFalse: () => [body],
    },
  );

/**
 * A client of the lab's MCP at `url`: `start` begins a session and answers
 * its id; `call` calls one of the lab's tools in it, typed by the tool. A
 * session the lab no longer knows (it restarted) answers 404, so
 * `LabUnanswered`: the caller starts another.
 */
export const labClient = Effect.fn('LabClient.make')(function* (url: string) {
  const http = yield* HttpClient.HttpClient;
  const endpoint = new URL(MCP_PATH, url).href;
  const ids = yield* Ref.make(0);
  const unanswered = (reason: string) => LabUnanswered.make({ url, reason });

  const post = (body: string, session: Option.Option<string>) =>
    http
      .execute(
        HttpClientRequest.post(endpoint).pipe(
          HttpClientRequest.setHeaders({
            accept: 'application/json, text/event-stream',
            ...Option.match(session, {
              onNone: () => ({}),
              onSome: (id) => ({ 'mcp-session-id': id, 'mcp-protocol-version': PROTOCOL }),
            }),
          }),
          HttpClientRequest.bodyText(body, 'application/json'),
        ),
      )
      .pipe(Effect.mapError((error) => unanswered(error.message)));

  const send = (message: typeof Sent.Type, session: Option.Option<string>) =>
    Effect.flatMap(Effect.orDie(Schema.encodeEffect(Sent)(message)), (body) => post(body, session));

  const start = Effect.gen(function* () {
    const started = yield* send(
      {
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL,
          capabilities: {},
          clientInfo: { name: 'film', version: '0.1.0' },
        },
      },
      Option.none(),
    );
    const session = yield* Effect.fromOption(
      Option.filter(
        Option.fromUndefinedOr(started.headers['mcp-session-id']),
        (id) => id.length > 0,
      ),
      () => unanswered(`it answered ${started.status} and no session`),
    );
    yield* send({ jsonrpc: '2.0', method: 'notifications/initialized' }, Option.some(session));
    return session;
  });

  const call = <P, PE, S, SE>(session: string, tool: LabTool<P, PE, S, SE>, params: P) =>
    Effect.gen(function* () {
      const id = yield* Ref.updateAndGet(ids, (n) => n + 1);
      const refused = (reason: string) => LabToolRefused.make({ tool: tool.name, reason });
      const body = yield* Schema.encodeEffect(callOf(tool.parametersSchema))({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: tool.name, arguments: params },
      }).pipe(Effect.mapError((error) => refused(`its arguments do not fit: ${error.message}`)));
      const answered = yield* post(body, Option.some(session));
      if (answered.status !== 200) return yield* unanswered(`it answered ${answered.status}`);
      const text = yield* answered.text.pipe(Effect.mapError((error) => unanswered(error.message)));
      const answer = yield* Effect.fromOption(
        Arr.findFirst(
          Arr.getSomes(
            messagesOf(Option.fromUndefinedOr(answered.headers['content-type']), text).map((m) =>
              readAnswer(m),
            ),
          ),
          (m) => m.id === id,
        ),
        () => unanswered(`it sent no answer to ${tool.name}`),
      );
      const unread = Option.fromUndefinedOr(answer.error);
      if (Option.isSome(unread)) return yield* refused(unread.value.message);
      const result = yield* Effect.fromOption(Option.fromUndefinedOr(answer.result), () =>
        unanswered(`it sent ${tool.name} no result`),
      );
      if (result.isError === true)
        return yield* refused(
          refusalWords(
            Option.getOrElse(
              Option.flatMap(Arr.head(result.content ?? []), (c) => Option.fromUndefinedOr(c.text)),
              () => '(no words)',
            ),
          ),
        );
      return yield* Schema.decodeUnknownEffect(tool.successSchema)(result.structuredContent).pipe(
        Effect.mapError((error) =>
          unanswered(
            `its answer to ${tool.name} does not read (${error.message}); a lab older than this checkout needs a restart`,
          ),
        ),
      );
    });

  return { url, start, call };
});
