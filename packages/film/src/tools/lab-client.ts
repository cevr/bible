// The lab's MCP as a command calls it: one small client of the running lab
// at `FILM_LAB_URL` (the always-on lab, http://127.0.0.1:8229/, unless set),
// for each command that works through the lab's tools (`film lab`, `film channel`'s
// change feed, `film ask wait`). A session lasts as long as its scope:
// started (`initialize`, then `notifications/initialized`; the lab says the
// session's id in `Mcp-Session-Id`), and ended (`DELETE`) when the scope
// closes, so the lab keeps no session a command has left. Each `tools/call`
// is JSON in and out (`callJson`, what `film lab` sends a command's checked
// input by), or typed by the lab's own tool (`call`): its arguments encoded
// by the tool's parameters, its structured answer decoded by the tool's
// success (`read`: by another schema the caller reads it with). The lab
// answers loopback with no token. No lab answering is `LabUnanswered` (a
// stream asks it again: `isLostLab`); an answer in a shape this checkout
// does not read is `LabAnswerUnread` (the two run different code); a tool's
// refusal is `LabToolRefused`, in the lab's words.

import {
  Array as Arr,
  Boolean as Bool,
  Config,
  Effect,
  Option,
  Predicate,
  Ref,
  Schema,
} from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/http';
import { MCP_PATH } from './lab-mcp.ts';

/** The protocol version the client speaks. */
const PROTOCOL = '2025-06-18';

/** The lab a command asks: the always-on one unless `FILM_LAB_URL` names another (a spare lab's port). */
export const labUrl = Config.String('FILM_LAB_URL').pipe(
  Config.withDefault('http://127.0.0.1:8229/'),
);

/** No lab answered at `url`. */
class LabUnanswered extends Schema.TaggedError<LabUnanswered>()('LabUnanswered', {
  url: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `no lab answered at ${this.url} (${this.reason}): start one (from apps/animations: bun run lab, or LAB_PORT=<port> bun cli.ts lab) and point FILM_LAB_URL at it`;
  }
}

/** The lab at `url` answered `tool` in a shape this checkout does not read: the two run different code. */
class LabAnswerUnread extends Schema.TaggedError<LabAnswerUnread>()('LabAnswerUnread', {
  url: Schema.String,
  tool: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the lab at ${this.url} answered ${this.tool} in a shape this checkout does not read (${this.reason}): the two run different code, so update the older one (pull this checkout, or restart the lab on the newer code)`;
  }
}

/** Whether `error` is no lab answering (asked again by a stream), not a refusal or an answer this checkout does not read. Pure. */
export const isLostLab = (error: { readonly message: string }): boolean =>
  Predicate.isTagged(error, 'LabUnanswered');

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

/** A call of a tool as the lab reads it: its name, and its arguments as JSON. */
const Call = Schema.fromJsonString(
  Schema.Struct({
    jsonrpc: Schema.Literal('2.0'),
    id: Schema.Finite,
    method: Schema.Literal('tools/call'),
    params: Schema.Struct({ name: Schema.String, arguments: Schema.Json }),
  }),
);

const readJsonValue = Schema.decodeUnknownEffect(Schema.Json);

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
 * A client of the lab's MCP at `url`: `session` begins a session, answers
 * its id and ends it when its scope closes; `call` calls one of the lab's
 * tools in it, typed by the tool. A session the lab no longer knows (it
 * restarted) answers 404, so `LabUnanswered`: the caller starts another.
 */
export const labClient = Effect.fn('LabClient.make')(function* (url: string) {
  const http = yield* HttpClient.HttpClient;
  const endpoint = new URL(MCP_PATH, url).href;
  const ids = yield* Ref.make(0);
  const unanswered = (reason: string) => LabUnanswered.make({ url, reason });
  /** An answer this checkout does not read. */
  const unread = (tool: string, reason: string) => LabAnswerUnread.make({ url, tool, reason });

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

  /** The handshake's first half: `initialize`, answered with the session's id. */
  const initialize = Effect.gen(function* () {
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
    return yield* Effect.fromOption(
      Option.filter(
        Option.fromUndefinedOr(started.headers['mcp-session-id']),
        (id) => id.length > 0,
      ),
      () => unanswered(`it answered ${started.status} and no session`),
    );
  });

  /**
   * `session` ended in the lab, as the MCP spec ends one: a DELETE with no
   * body. A lab that already forgot it (it restarted) or has gone is left
   * as it is: the session went with it.
   */
  const end = (session: string) =>
    http
      .execute(
        HttpClientRequest.delete(endpoint).pipe(
          HttpClientRequest.setHeaders({
            'mcp-session-id': session,
            'mcp-protocol-version': PROTOCOL,
          }),
        ),
      )
      .pipe(
        Effect.tap((ended) =>
          Effect.logDebug(`lab.client.ended url=${url} status=${ended.status}`),
        ),
        Effect.ignore,
      );

  /**
   * A session for as long as its scope: started now, ended when the scope
   * closes. Its end is kept the moment the lab names it, so a handshake
   * that fails after that (`notifications/initialized` lost) ends it too.
   */
  const session = Effect.gen(function* () {
    const id = yield* Effect.acquireRelease(initialize, end);
    yield* send({ jsonrpc: '2.0', method: 'notifications/initialized' }, Option.some(id));
    return id;
  });

  /** One of the lab's tools called by `name` in `session` with `args`: its structured answer, as JSON. */
  const callJson = (session: string, name: string, args: Schema.Json) =>
    Effect.gen(function* () {
      const id = yield* Ref.updateAndGet(ids, (n) => n + 1);
      const refused = (reason: string) => LabToolRefused.make({ tool: name, reason });
      const body = yield* Effect.orDie(
        Schema.encodeEffect(Call)({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      );
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
        () => unanswered(`it sent no answer to ${name}`),
      );
      const unread = Option.fromUndefinedOr(answer.error);
      if (Option.isSome(unread)) return yield* refused(unread.value.message);
      const result = yield* Effect.fromOption(Option.fromUndefinedOr(answer.result), () =>
        unanswered(`it sent ${name} no result`),
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
      return yield* Effect.fromOption(Option.fromUndefinedOr(result.structuredContent), () =>
        unanswered(`it sent ${name} no structured answer`),
      );
    });

  /** One of the lab's tools called in `session`: its arguments encoded by its parameters, its answer decoded by `success`. */
  const read = <P, PE, S, SE, A, AE>(
    session: string,
    tool: LabTool<P, PE, S, SE>,
    params: P,
    success: Schema.Codec<A, AE>,
  ) =>
    Effect.gen(function* () {
      const args = yield* Schema.encodeEffect(tool.parametersSchema)(params).pipe(
        Effect.flatMap((encoded) => readJsonValue(encoded)),
        Effect.mapError((error) =>
          LabToolRefused.make({
            tool: tool.name,
            reason: `its arguments do not fit: ${error.message}`,
          }),
        ),
      );
      const json = yield* callJson(session, tool.name, args);
      return yield* Schema.decodeUnknownEffect(success)(json).pipe(
        Effect.mapError((error) => unread(tool.name, error.message)),
      );
    });

  /** One of the lab's tools called in `session`, typed by the tool: its arguments encoded by its parameters, its answer decoded by its success. */
  const call = <P, PE, S, SE>(session: string, tool: LabTool<P, PE, S, SE>, params: P) =>
    read(session, tool, params, tool.successSchema);

  return { url, session, call, read, callJson };
});
