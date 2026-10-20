// MCP Events on the lab's MCP, end to end against a local HTTP callback:
// `server/discover` says `events`, `events/list` lists the catalogue; a
// subscribe verifies its callback (a signed challenge it echoes) before it
// is kept, then each event is posted once, signed as Standard Webhooks
// signs (checked here by that algorithm, not the lab's code), tried again
// with the same event id when the callback fails; the same subscribe again
// is the same subscription, and with a cursor it replays what is past it;
// an unsubscribe stops it. A bad secret, an unknown event and a callback
// that does not echo are refused in the profile's codes. The subscriptions
// are kept in the lab's folder: a lab started again delivers on from the
// cursor it kept, and a subscription past its `refreshBefore` is dropped.

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'effect-bun-test';
import {
  Boolean as Bool,
  Effect,
  FileSystem,
  Layer,
  Logger,
  Option,
  Queue,
  Record as Rec,
  Ref,
  Result,
  Schema,
} from 'effect';
import { BunHttpServer } from '@effect/platform-bun';
import { Base64 } from 'effect/encoding';
import { HttpServer, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { TestClock } from 'effect/testing';
import { labUrls } from '../core/api.ts';
import { LAB_EVENTS } from '../core/lab-events.ts';
import { RenderCatalogue } from './catalogue.ts';
import {
  type LabFetch,
  MCP_BASE,
  NOTES_LAB,
  labInMemory,
  labWithMcp,
  mcpBound,
  mcpPost,
  text,
} from './testing.ts';

/** A secret of 32 bytes, as a subscriber makes one. */
const SECRET = `whsec_${Base64.encode(new Uint8Array(32).fill(7))}`;

const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Json));
/** JSON read as a client reads it: the test names the fields it checks. */
const readJson: (text: string) => any = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Json),
);

/** What the callback heard: the path it was posted to, its headers and its body as sent. */
interface Heard {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

const Challenge = Schema.fromJsonString(
  Schema.Struct({ type: Schema.Literal('verification'), challenge: Schema.String }),
);
const readChallenge = Schema.decodeUnknownOption(Challenge);

/**
 * A subscriber's callback on a local port: each POST offered to `heard` as
 * it comes; a verification echoed (unless `echo` is false); a delivery
 * answered with the next of `statuses`, 200 once they are spent.
 */
const callback = Effect.gen(function* () {
  const heard = yield* Queue.unbounded<Heard>();
  const statuses = yield* Ref.make<ReadonlyArray<number>>([]);
  const echo = yield* Ref.make(true);
  const http = yield* BunHttpServer.make({ hostname: '127.0.0.1', port: 0 });
  yield* http.serve(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const body = yield* request.text;
      yield* Queue.offer(heard, {
        path: new URL(request.url, 'http://callback').pathname,
        headers: request.headers,
        body,
      });
      const challenge = readChallenge(body);
      if (Option.isSome(challenge)) {
        const echoed = yield* Ref.get(echo);
        return HttpServerResponse.text(
          Bool.match(echoed, { onTrue: () => challenge.value.challenge, onFalse: () => 'no' }),
        );
      }
      const [next = 200, ...rest] = yield* Ref.get(statuses);
      yield* Ref.set(statuses, rest);
      return HttpServerResponse.empty({ status: next });
    }),
  );
  return { heard, statuses, echo, url: HttpServer.formatAddress(http.address) };
});

/** Whether `heard` is signed with `secret` as Standard Webhooks signs: `v1,` base64 HMAC-SHA256 of `<id>.<timestamp>.<body>`, keyed by the secret's base64 after `whsec_`. */
const signedWith = (secret: string, heard: Heard) => {
  const key = Result.getOrThrow(Base64.decode(secret.slice('whsec_'.length)));
  const expected = createHmac('sha256', key)
    .update(`${heard.headers['webhook-id']}.${heard.headers['webhook-timestamp']}.${heard.body}`)
    .digest('base64');
  return (heard.headers['webhook-signature'] ?? '').split(' ').includes(`v1,${expected}`);
};

/** The answer's one message: its JSON, or the last event of a stream of them. */
const lastMessage = (body: string) =>
  readJson(
    body
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length))
      .at(-1) ?? body,
  );

/** A 2026-07-28 request to the lab's MCP, its answer's JSON. */
const rpc = (lab: LabFetch, method: string, params: Schema.JsonObject = {}) =>
  Effect.flatMap(
    mcpPost(
      lab,
      {
        jsonrpc: '2.0',
        id: 1,
        method,
        params: {
          ...params,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
      { 'mcp-protocol-version': '2026-07-28', 'mcp-method': method },
    ),
    (answer) =>
      Effect.map(
        Effect.promise(() => answer.text()),
        lastMessage,
      ),
  );

/** The owner's note on film `f`, as the lab's page posts it. */
const ownerNote = (lab: LabFetch, words: string) =>
  Effect.promise(() =>
    lab(
      new Request(`${MCP_BASE.slice(0, -1)}${labUrls.notes.add({ params: { film: 'f' } })}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: jsonText({
          scene: 'cold',
          T: 1,
          frame: 30,
          text: words,
          still: Base64.encode(text('frame')),
        }),
      }),
      mcpBound,
    ),
  );

/** A subscription to `name` (of film `f` unless `args` says otherwise) at the callback's `path`, with `more` of subscribe's params (its `secret` the delivery's). */
const subscribeAt = (
  url: string,
  { secret = SECRET, ...more }: { readonly secret?: string } & Schema.JsonObject = {},
  name = 'note.added',
  args: Schema.JsonObject = { film: 'f' },
): Schema.JsonObject => ({
  name,
  arguments: args,
  delivery: { mode: 'webhook', url, secret },
  ...more,
});

const Delivered = Schema.fromJsonString(
  Schema.Struct({
    eventId: Schema.String,
    name: Schema.String,
    timestamp: Schema.String,
    cursor: Schema.String,
    data: Schema.Struct({ kind: Schema.String, note: Schema.String, text: Schema.String }),
  }),
);
const readDelivered = Schema.decodeUnknownSync(Delivered);

const provided = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  self.pipe(
    Effect.scoped,
    Effect.provide(
      RenderCatalogue.layer.pipe(
        Layer.provideMerge(
          labInMemory(new Map([['/films/f/scenes/index.ts', text('export {};\n')]])),
        ),
      ),
    ),
  );

const SUBSCRIPTIONS = `${NOTES_LAB}/events/subscriptions.json`;

describe('MCP Events on the lab', () => {
  it.effect(
    'lists the catalogue; verifies a callback, delivers each event signed, retries with the same id, replays from a cursor, and stops on unsubscribe',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab, events } = yield* labWithMcp;
          const hook = yield* callback;
          const discovered = yield* rpc(lab, 'server/discover');
          expect(discovered).toMatchObject({
            result: { capabilities: { events: {}, tools: { listChanged: true } } },
          });
          const listed = yield* rpc(lab, 'events/list');
          expect(listed).toMatchObject({
            result: {
              resultType: 'complete',
              _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'film-lab' } },
            },
          });
          const definitions: ReadonlyArray<{ name: string }> = listed.result.events;
          expect(definitions.map((d) => d.name).toSorted()).toEqual(
            Rec.keys(LAB_EVENTS).toSorted(),
          );
          expect(definitions[0]).toMatchObject({
            delivery: ['webhook'],
            // A subscribe takes no argument the schema does not name.
            inputSchema: {
              type: 'object',
              properties: { film: { type: 'string' } },
              additionalProperties: false,
            },
            payloadSchema: { type: 'object' },
          });

          // Subscribed once the callback echoes its challenge, signed.
          const made = yield* rpc(lab, 'events/subscribe', subscribeAt(`${hook.url}/a`));
          expect(made).toMatchObject({
            result: {
              refreshBefore: '1970-01-02T00:00:00.000Z',
              truncated: false,
              resultType: 'complete',
            },
          });
          const { id, cursor }: { id: string; cursor: string } = made.result;
          expect(id).toMatch(/^sub_[0-9a-f]{24}$/);
          const verification = yield* Queue.take(hook.heard);
          expect(verification.path).toBe('/a');
          expect(readChallenge(verification.body)._tag).toBe('Some');
          expect(verification.headers['x-mcp-subscription-id']).toBe(id);
          expect(signedWith(SECRET, verification)).toBe(true);

          // One POST per event, signed, its id the webhook's.
          yield* ownerNote(lab, 'the judge looks away too soon');
          yield* events.look;
          const first = yield* Queue.take(hook.heard);
          const one = readDelivered(first.body);
          expect(one).toMatchObject({
            name: 'note.added',
            data: { kind: 'note.added', note: 'n1', text: 'the judge looks away too soon' },
          });
          expect(one.cursor).toBe(`${cursor.split('.')[0]}.1`);
          expect(first.headers['webhook-id']).toBe(one.eventId);
          expect(first.headers['x-mcp-subscription-id']).toBe(id);
          expect(first.headers['content-type']).toBe('application/json');
          expect(signedWith(SECRET, first)).toBe(true);
          // A signature over other bytes does not check.
          expect(signedWith(SECRET, { ...first, body: `${first.body} ` })).toBe(false);

          // A callback that fails is tried again: the same event id, the same body.
          yield* Ref.set(hook.statuses, [500]);
          yield* ownerNote(lab, 'and the hand is late');
          yield* events.look;
          const failed = yield* Queue.take(hook.heard);
          const retried = yield* Queue.take(hook.heard);
          expect(retried.headers['webhook-id']).toBe(failed.headers['webhook-id']);
          expect(retried.body).toBe(failed.body);
          expect(signedWith(SECRET, retried)).toBe(true);
          expect(readDelivered(retried.body).data.note).toBe('n2');

          // The same subscribe again is the same subscription; from a cursor it replays what is past it.
          const again = yield* rpc(
            lab,
            'events/subscribe',
            subscribeAt(`${hook.url}/a`, { cursor: one.cursor }),
          );
          expect(again).toMatchObject({ result: { id, cursor: one.cursor, truncated: false } });
          const replayed = yield* Queue.take(hook.heard);
          expect(replayed.headers['webhook-id']).toBe(failed.headers['webhook-id']);
          expect(readDelivered(replayed.body).data.note).toBe('n2');

          // Unsubscribed, it hears nothing more; a second subscription hears the next note alone.
          expect(
            yield* rpc(lab, 'events/unsubscribe', {
              name: 'note.added',
              arguments: { film: 'f' },
              delivery: { mode: 'webhook', url: `${hook.url}/a` },
            }),
          ).toEqual({
            jsonrpc: '2.0',
            id: 1,
            result: {
              resultType: 'complete',
              _meta: {
                'io.modelcontextprotocol/serverInfo': { name: 'film-lab', version: '0.1.0' },
              },
            },
          });
          yield* rpc(lab, 'events/subscribe', subscribeAt(`${hook.url}/b`, {}, 'note.added', {}));
          expect((yield* Queue.take(hook.heard)).path).toBe('/b');
          yield* ownerNote(lab, 'the third');
          yield* events.look;
          const third = yield* Queue.take(hook.heard);
          expect([third.path, readDelivered(third.body).data.note]).toEqual(['/b', 'n3']);
          expect(yield* Queue.size(hook.heard)).toBe(0);

          // The lab keeps the subscriptions in its folder, each with the cursor
          // after the last event it was sent: written once the callback has
          // answered, so read until it is.
          const fs = yield* FileSystem.FileSystem;
          const delivered = readDelivered(third.body).cursor;
          const kept = yield* Effect.repeat(
            Effect.andThen(Effect.yieldNow, Effect.map(fs.readFileString(SUBSCRIPTIONS), readJson)),
            { until: (now) => now.subscriptions[0]?.cursor === delivered, times: 1000 },
          );
          expect(kept).toMatchObject({
            subscriptions: [
              {
                name: 'note.added',
                url: `${hook.url}/b`,
                cursor: delivered,
              },
            ],
          });
          expect(kept.subscriptions).toHaveLength(1);
        }),
      ),
  );

  it.effect(
    'refuses a bad secret, an event it does not have and a callback that does not echo, in the profile codes',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const hook = yield* callback;
          const short = yield* rpc(
            lab,
            'events/subscribe',
            subscribeAt(`${hook.url}/a`, { secret: `whsec_${Base64.encode(new Uint8Array(10))}` }),
          );
          expect(short).toMatchObject({
            error: { code: -32602, message: 'the secret is 10 bytes, not 24 to 64' },
          });
          expect(
            yield* rpc(
              lab,
              'events/subscribe',
              subscribeAt(`${hook.url}/a`, { secret: 'hunter2' }),
            ),
          ).toMatchObject({
            error: { code: -32602, message: 'the secret does not start with whsec_' },
          });
          expect(
            yield* rpc(lab, 'events/subscribe', subscribeAt(`${hook.url}/a`, {}, 'note.nope')),
          ).toMatchObject({ error: { code: -32602 } });
          // A ttlMs past the lab's longest is invalid params, not a failure of the lab's.
          expect(
            yield* rpc(lab, 'events/subscribe', subscribeAt(`${hook.url}/a`, { ttlMs: 1e20 })),
          ).toMatchObject({
            error: {
              code: -32602,
              message: expect.stringContaining('ttlMs 100000000000000000000'),
            },
          });
          // Nothing was posted for a refused subscribe.
          expect(yield* Queue.size(hook.heard)).toBe(0);
          yield* Ref.set(hook.echo, false);
          // Said by its category alone: nothing of what the callback answered.
          expect(yield* rpc(lab, 'events/subscribe', subscribeAt(`${hook.url}/a`))).toEqual({
            jsonrpc: '2.0',
            id: 1,
            error: {
              code: -32015,
              message: 'CallbackEndpointError: the callback did not verify (challenge_failed)',
              data: { reason: 'challenge_failed' },
            },
          });
          expect((yield* Queue.take(hook.heard)).path).toBe('/a');
          const fs = yield* FileSystem.FileSystem;
          expect(yield* fs.exists(SUBSCRIPTIONS)).toBe(false);
        }),
      ),
  );

  it.effect(
    'a lab started again delivers on from the cursor it kept; a subscription past its refreshBefore is dropped',
    () =>
      provided(
        Effect.gen(function* () {
          const hook = yield* callback;
          yield* Effect.scoped(
            Effect.gen(function* () {
              const { lab, events } = yield* labWithMcp;
              // A subscription that never expires is the profile's own null, asked and answered.
              // oxlint-disable-next-line effect/noNullish -- the profile's ttlMs null: no expiry
              const forever = subscribeAt(`${hook.url}/a`, { ttlMs: null });
              const made = yield* rpc(lab, 'events/subscribe', forever);
              expect(made.result.refreshBefore).toBeNull();
              yield* Queue.take(hook.heard);
              yield* ownerNote(lab, 'one');
              yield* events.look;
              expect(readDelivered((yield* Queue.take(hook.heard)).body).data.note).toBe('n1');
            }),
          );
          // The lab again, over the same folder: its subscription delivers on.
          const { lab, events } = yield* labWithMcp;
          yield* ownerNote(lab, 'two');
          yield* events.look;
          expect(readDelivered((yield* Queue.take(hook.heard)).body).data.note).toBe('n2');

          // A subscription asked for a second lasts the lab's least, a minute, and goes when it passes.
          const brief = yield* rpc(
            lab,
            'events/subscribe',
            subscribeAt(`${hook.url}/brief`, { ttlMs: 1000 }),
          );
          expect(brief).toMatchObject({ result: { refreshBefore: '1970-01-01T00:01:00.000Z' } });
          yield* Queue.take(hook.heard);
          yield* TestClock.adjust('2 minutes');
          const fs = yield* FileSystem.FileSystem;
          const kept: ReadonlyArray<{ url: string }> = readJson(
            yield* fs.readFileString(SUBSCRIPTIONS),
          ).subscriptions;
          const urls = kept.map((s) => s.url);
          expect(urls).toEqual([`${hook.url}/a`]);
        }),
      ),
  );
  it.effect(
    'answers a cursor it no longer knows with where its replay starts, truncated, and replays from there',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab, events } = yield* labWithMcp;
          const hook = yield* callback;
          yield* ownerNote(lab, 'one');
          yield* events.look;
          const now = (yield* events.since(Option.none())).cursor;
          const epoch = now.split('.')[0];
          const made = yield* rpc(
            lab,
            'events/subscribe',
            subscribeAt(`${hook.url}/a`, { cursor: 'zz0.5' }),
          );
          expect(made).toMatchObject({ result: { cursor: `${epoch}.0`, truncated: true } });
          yield* Queue.take(hook.heard);
          expect(readDelivered((yield* Queue.take(hook.heard)).body).data.note).toBe('n1');
        }),
      ),
  );

  it.effect(
    "two labs over one folder (a restart's overlap) deliver one event under one id, so a subscriber knows it twice told",
    () =>
      provided(
        Effect.gen(function* () {
          const hook = yield* callback;
          const first = yield* labWithMcp;
          // oxlint-disable-next-line effect/noNullish -- the profile's ttlMs null: no expiry
          yield* rpc(first.lab, 'events/subscribe', subscribeAt(`${hook.url}/a`, { ttlMs: null }));
          yield* Queue.take(hook.heard);
          // The lab started again before the first has stopped: both deliver from the folder's subscription.
          const second = yield* labWithMcp;
          yield* ownerNote(first.lab, 'one');
          yield* first.events.look;
          yield* second.events.look;
          const [a, b] = [
            readDelivered((yield* Queue.take(hook.heard)).body),
            readDelivered((yield* Queue.take(hook.heard)).body),
          ];
          expect([a.data.note, b.data.note]).toEqual(['n1', 'n1']);
          expect(a.cursor.split('.')[0]).not.toBe(b.cursor.split('.')[0]);
          expect(a.eventId).toBe(b.eventId);
          expect(a.eventId).toMatch(/^evt_[0-9a-f]{16}$/);
        }),
      ),
  );

  it.effect("logs a callback by its origin alone: a webhook's path can be its secret", () => {
    const lines: Array<string> = [];
    return provided(
      Effect.gen(function* () {
        const { lab } = yield* labWithMcp;
        const hook = yield* callback;
        yield* rpc(
          lab,
          'events/subscribe',
          subscribeAt(`${hook.url}/hooks/T0SECRET?token=Q3SECRET`),
        );
        yield* Queue.take(hook.heard);
        yield* Ref.set(hook.echo, false);
        yield* rpc(lab, 'events/subscribe', subscribeAt(`${hook.url}/other/T1SECRET`));
        yield* Queue.take(hook.heard);
        // A callback where nothing listens: the client's failure names the whole URL, the log its kind.
        const closed = 'http://127.0.0.1:1';
        yield* rpc(lab, 'events/subscribe', subscribeAt(`${closed}/hooks/T2SECRET?token=Q5SECRET`));
        const said = lines.filter((line) => line.startsWith('mcp.events.'));
        expect(said.map((line) => line.split(' ')[0])).toEqual([
          'mcp.events.subscribed',
          'mcp.events.unverified',
          'mcp.events.unverified',
        ]);
        expect(said.filter((line) => /SECRET|token|\/hooks|\/other/.test(line))).toEqual([]);
        expect(said.slice(0, 2).every((line) => line.includes(` at=${hook.url} `))).toBe(true);
        expect(said[2]).toContain(`at=${closed} reason="unreachable: TransportError"`);
      }).pipe(
        Effect.provide(
          Logger.layer([
            Logger.make(({ message }) => {
              lines.push([message].flat().join(' '));
            }),
          ]),
        ),
      ),
    );
  });

  it.effect('delivers on when its cursor cannot be kept', () =>
    provided(
      Effect.gen(function* () {
        const { lab, events } = yield* labWithMcp;
        const hook = yield* callback;
        yield* rpc(lab, 'events/subscribe', subscribeAt(`${hook.url}/a`));
        yield* Queue.take(hook.heard);
        // The subscriptions file made unwritable: a folder where it was.
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(SUBSCRIPTIONS);
        yield* fs.makeDirectory(SUBSCRIPTIONS);
        yield* ownerNote(lab, 'one');
        yield* events.look;
        expect(readDelivered((yield* Queue.take(hook.heard)).body).data.note).toBe('n1');
        yield* ownerNote(lab, 'two');
        yield* events.look;
        expect(readDelivered((yield* Queue.take(hook.heard)).body).data.note).toBe('n2');
      }),
    ),
  );
});
