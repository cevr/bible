// The lab as an MCP server, through the lab's own handler as a client calls
// it at `/mcp`: refused without the token, behind a proxy or on a foreign
// Host; a session started (its header kept, so the write gate's read body
// keeps what MCP answers with); every tool listed; the owner's note seen
// in the change feed with its link; an agent's reply and done landing in the
// note's thread; a tweak asked of a board panel; a set published into the
// lab's out/ and listed, and seen as published; an ask made (its machine
// checked first), answered by the owner a step at a time through the page's
// route and heard on `changes` with its answers typed, then closed and filed
// on its production's timeline.

import { describe, expect, it } from 'effect-bun-test';
import {
  Boolean as Bool,
  type Cause,
  ConfigProvider,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Queue,
  Schema,
  Sink,
  Stdio,
  Stream,
} from 'effect';
import { BunTerminal } from '@effect/platform-bun';
import { Command } from 'effect/cli';
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http';
import { Base64 } from 'effect/encoding';
import { labUrls } from '../core/api.ts';
import { type BoardFile, BoardFileJson } from '../core/board.ts';
import { RenderCatalogue } from './catalogue.ts';
import { ProductionStore } from './production-store.ts';
import { labHandler } from './lab.ts';
import { channel } from './lab-channel.ts';
import { LabEvents } from './lab-events.ts';
import { type LabMcpNeeds, MCP_PATH, labMcp } from './lab-mcp.ts';
import { Review } from './review.ts';
import { formatAsIs, labInMemory, noRenders, text } from './testing.ts';

const TOKEN = 'a'.repeat(64);
const TUNNEL = 'x.opentunnel.xyz';
const BASE = 'http://127.0.0.1:4401/';
const PHONE = 'http://100.64.0.9:8230/';
const bound = { hostname: '127.0.0.1', port: 4401 } as const;

const board: BoardFile = {
  film: 'f',
  panels: [
    {
      id: 'cold.judge',
      beat: 'cold',
      at: 'judge',
      tries: [
        {
          n: 1,
          file: 'cold.judge.1.png',
          sha256: 's1',
          made: 'import',
          refs: [],
          at: '2026-10-14T00:00:00.000Z',
        },
      ],
    },
  ],
  approvals: [],
};

/** Film `f` with a board panel and its try's image, and a still an agent made outside the lab. */
const files = () =>
  new Map<string, Uint8Array>([
    ['/films/f/scenes/index.ts', text('export {};\n')],
    ['/films/f/board.json', text(Schema.encodeSync(BoardFileJson)(board))],
    ['/films/f/board/cold.judge.1.png', text('the judge')],
    ['/work/judge-calmer.png', text('a calmer judge')],
  ]);

/** The review rooted at the lab's own out/ (`FILMS_OUT`, here its default under the working folder). */
const reviewAtOut = Layer.effect(
  Review,
  Effect.gen(function* () {
    const review = yield* Review;
    const path = yield* Path.Path;
    return Review.of({ ...review, roots: [{ label: 'spare', path: path.resolve('out') }] });
  }),
).pipe(Layer.provide([noRenders, Path.layer]));

/** The lab's handler with its MCP beside it, over a feed the test reads (`look`) when it says. */
const labWithMcp = Effect.gen(function* () {
  const events = yield* LabEvents.make({ base: BASE });
  yield* events.look;
  const services = yield* Effect.context<LabMcpNeeds>();
  const mcp = labMcp({ token: TOKEN }, { base: BASE, phone: PHONE }).pipe(
    Layer.provide(Layer.succeedContext(Context.add(services, LabEvents, events))),
  );
  // The tunnel's name is one the lab's gate admits (as `FILM_LAB_HOSTS` makes it): the MCP still refuses it.
  const lab = yield* labHandler({ hosts: [TUNNEL] }, mcp);
  return { lab, events };
});

const provided = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  self.pipe(
    Effect.scoped,
    Effect.provide(
      Layer.mergeAll(RenderCatalogue.layer, reviewAtOut).pipe(
        Layer.provideMerge(labInMemory(files())),
      ),
    ),
  );

type Lab = (request: Request, server: typeof bound) => Promise<Response>;

/** JSON as a request carries it and an answer is read. */
const JsonText = Schema.fromJsonString(Schema.Json);
const writeJson = Schema.encodeSync(JsonText);
const readJson = Schema.decodeUnknownEffect(JsonText);

const ask = (lab: Lab, body: Schema.Json, headers: Readonly<Record<string, string>> = {}) =>
  Effect.promise(() =>
    lab(
      new Request(`${BASE.slice(0, -1)}${MCP_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${TOKEN}`,
          ...headers,
        },
        body: writeJson(body),
      }),
      bound,
    ),
  );

/** A JSON-RPC client of the lab's MCP: a session started, then each call's result. */
const session = (lab: Lab) =>
  Effect.gen(function* () {
    const started = yield* ask(lab, {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 't', version: '0' },
      },
    });
    expect(started.status).toBe(200);
    const id = Option.fromNullishOr(started.headers.get('mcp-session-id'));
    expect(Option.isSome(id)).toBe(true);
    const headers = {
      'mcp-session-id': Option.getOrElse(id, () => ''),
      'mcp-protocol-version': '2025-06-18',
    };
    const initialized = yield* ask(
      lab,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      headers,
    );
    expect(initialized.status).toBe(202);
    let n = 0;
    const call = (method: string, params: Schema.Json) =>
      Effect.gen(function* () {
        n += 1;
        const r = yield* ask(lab, { jsonrpc: '2.0', id: n, method, params }, headers);
        const body = yield* Effect.promise(() => r.text());
        // A call is answered as JSON or, the client taking both, as server-sent
        // events: any notifications the server queued, then the answer.
        const streamed = Option.exists(
          Option.fromNullishOr(r.headers.get('content-type')),
          (type) => type.startsWith('text/event-stream'),
        );
        const texts = Bool.match(streamed, {
          onTrue: () =>
            body
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice('data:'.length)),
          onFalse: () => [body],
        });
        // Read as a client reads JSON: the test names the fields it checks.
        const messages: ReadonlyArray<any> = yield* Effect.orDie(
          Effect.forEach(texts, (t) => readJson(t)),
        );
        const answer = messages.find((m) => m.id === n);
        // A JSON-RPC error (the arguments did not decode) is said as a refusal.
        return Option.getOrElse(Option.fromNullishOr(answer?.result), () => ({
          isError: true,
          content: [{ text: writeJson(answer?.error) }],
        }));
      });
    /** A tool's structured answer, or its refusal's words. */
    const tool = (name: string, args: Schema.Json = {}) =>
      Effect.map(call('tools/call', { name, arguments: args }), (result) =>
        Bool.match(result.isError === true, {
          onTrue: () => ({ refused: String(result.content[0].text) }),
          onFalse: () => result.structuredContent,
        }),
      );
    return { call, tool };
  });

/** The owner's note on the film's frame, as the lab's page posts it. */
const ownerNote = (lab: Lab, words: string) =>
  Effect.promise(() =>
    lab(
      new Request(`${BASE.slice(0, -1)}${labUrls.notes.add({ params: { film: 'f' } })}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: writeJson({
          scene: 'cold',
          T: 1,
          frame: 30,
          text: words,
          still: Base64.encode(text('frame')),
        }),
      }),
      bound,
    ),
  );

describe('who may use the MCP', () => {
  it.effect(
    'the token, a loopback Host and nothing forwarded; the tunnel refused though the gate admits it',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const status = (headers: Readonly<Record<string, string>>) =>
            Effect.map(ask(lab, { jsonrpc: '2.0', id: 1, method: 'ping' }, headers), (r) => [
              r.status,
              Option.fromNullishOr(r.headers.get('www-authenticate')),
            ]);
          expect(yield* status({ authorization: '' })).toEqual([401, Option.some('Bearer')]);
          expect(yield* status({ authorization: 'Bearer nope' })).toEqual([
            401,
            Option.some('Bearer'),
          ]);
          expect(yield* status({ host: TUNNEL })).toEqual([403, Option.none()]);
          expect(yield* status({ 'x-forwarded-for': '203.0.113.9' })).toEqual([403, Option.none()]);
          // Every spelling the router takes for the MCP's path is behind the same check.
          const aliased = (at: string) =>
            Effect.promise(() =>
              lab(
                new Request(`${BASE.slice(0, -1)}${at}`, {
                  method: 'POST',
                  headers: {
                    host: TUNNEL,
                    'content-type': 'application/json',
                    accept: 'application/json, text/event-stream',
                  },
                  body: writeJson({
                    jsonrpc: '2.0',
                    id: 0,
                    method: 'initialize',
                    params: {
                      protocolVersion: '2025-06-18',
                      capabilities: {},
                      clientInfo: { name: 't', version: '0' },
                    },
                  }),
                }),
                bound,
              ),
            ).pipe(Effect.map((r) => [at, r.status < 300]));
          const spellings = ['/mcp', '/MCP', '/m%63p', '//mcp', '/mcp;', '/mcp/'];
          expect(yield* Effect.forEach(spellings, aliased)).toEqual(
            spellings.map((at) => [at, false]),
          );
          // The page through the tunnel stays as it was.
          const page = yield* Effect.promise(() =>
            lab(new Request(`${BASE}films/f/board`, { headers: { host: TUNNEL } }), bound),
          );
          expect(page.status).toBe(200);
          // A loopback name with the token starts a session (`session` checks its header).
          yield* session(lab);
        }),
      ),
  );
});

describe('the lab as an MCP server', () => {
  it.effect('lists its tools, hears the owner, and answers on the note', () =>
    provided(
      Effect.gen(function* () {
        const { lab, events } = yield* labWithMcp;
        const { call, tool } = yield* session(lab);
        const listed = yield* call('tools/list', {});
        expect(listed.tools.map((t: { name: string }) => t.name).toSorted()).toEqual(
          [
            'board',
            'catalogue',
            'changes',
            'notes',
            'overview',
            'publish_set',
            'record_render',
            'reply',
            'request_tweak',
            'resolve',
            'set',
            'sets',
            'ask',
            'ask_read',
            'asks',
            'close_ask',
          ].toSorted(),
        );
        const { cursor } = yield* tool('overview');
        // An agent waits; the owner writes a note on the page; the feed reads it.
        const waiting = yield* Effect.forkChild(tool('changes', { since: cursor, wait: 5 }));
        expect((yield* ownerNote(lab, 'the judge looks away too soon')).status).toBe(200);
        yield* events.look;
        const heard = yield* Fiber.join(waiting);
        expect(
          heard.changes.map(
            (c: { kind: string; film: string; note: string; by: string; text: string }) => [
              c.kind,
              c.film,
              c.note,
              c.by,
              c.text,
            ],
          ),
        ).toEqual([['note.added', 'f', 'n1', 'owner', 'the judge looks away too soon']]);
        expect(heard.changes[0].link).toBe(`${BASE}films/f/lab/cold?note=n1`);
        const replied = yield* tool('reply', {
          film: 'f',
          note: 'n1',
          text: 'held two beats longer',
        });
        expect(
          replied.note.thread.map((r: { by: string; text: string }) => [r.by, r.text]),
        ).toEqual([['agent', 'held two beats longer']]);
        const done = yield* tool('resolve', { film: 'f', note: 'n1' });
        expect(done.note.status).toBe('resolved');
        // The page reads the thread from the same store.
        const page = yield* Effect.promise(() =>
          lab(
            new Request(`${BASE.slice(0, -1)}${labUrls.notes.list({ params: { film: 'f' } })}`),
            bound,
          ),
        );
        const log = yield* Effect.promise(() => page.json());
        expect(log.notes[0]).toMatchObject({ id: 'n1', status: 'resolved' });
        yield* events.look;
        const after = yield* tool('changes', { since: heard.cursor });
        expect(after.changes.map((c: { kind: string }) => c.kind)).toEqual([
          'note.replied',
          'note.resolved',
        ]);
        expect(after.changes[0].by).toBe('agent');
        expect((yield* tool('notes', { film: 'f' })).notes).toEqual([]);
        expect((yield* tool('notes', { film: 'nope' })).refused).toContain('nope');
      }),
    ),
  );

  it.effect('asks a tweak of a panel and publishes a set the lab lists', () =>
    provided(
      Effect.gen(function* () {
        const { lab, events } = yield* labWithMcp;
        const { tool } = yield* session(lab);
        const { cursor } = yield* tool('overview');
        const tweak = yield* tool('request_tweak', {
          film: 'f',
          panel: 'cold.judge',
          text: 'softer eyes',
        });
        expect(tweak.note.panel).toEqual({ id: 'cold.judge', try: 1, ask: 'tweak' });
        expect(tweak.note.link).toBe(`${BASE}films/f/board/cold?panel=judge&note=n1`);
        expect(
          (yield* tool('request_tweak', { film: 'f', panel: 'cold.x', text: 'x' })).refused,
        ).toContain('no panel cold.x');
        const published = yield* tool('publish_set', {
          name: 'judge-faces',
          files: [{ from: '/work/judge-calmer.png', to: 'calmer.png' }],
          manifest: { title: 'Judge faces', images: ['calmer.png'] },
        });
        expect([published.set, published.link]).toEqual([
          'spare/judge-faces',
          `${BASE}sets/spare%2Fjudge-faces`,
        ]);
        expect(
          (yield* tool('publish_set', {
            name: 'judge-faces',
            files: [],
            manifest: { images: ['missing.png'] },
          })).refused,
        ).toContain('missing.png');
        const listed = yield* tool('sets');
        expect(
          listed.sets.map((s: { set: string; kind: string; title?: string }) => [
            s.set,
            s.kind,
            s.title,
          ]),
        ).toEqual([['spare/judge-faces', 'montage', 'Judge faces']]);
        yield* events.look;
        const seen = yield* tool('changes', { since: cursor });
        expect(seen.changes.map((c: { kind: string }) => c.kind)).toEqual([
          'tweak.requested',
          'set.published',
        ]);
      }),
    ),
  );
});

/** The owner's answers to a step of an ask, as its page posts them. */
const ownerAnswers = (lab: Lab, ask: string, step: string, values: Record<string, string>) =>
  Effect.flatMap(
    Effect.promise(() =>
      lab(
        new Request(`${BASE.slice(0, -1)}${labUrls.asks.answer({ params: { ask } })}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: writeJson({ step, values }),
        }),
        bound,
      ),
    ),
    (r) => Effect.promise(() => r.json().then((body) => ({ status: r.status, body }))),
  );

describe('asks through the MCP', () => {
  it.effect('refuses an ask that may not render, and makes a one-line one with its links', () =>
    provided(
      Effect.gen(function* () {
        const { lab } = yield* labWithMcp;
        const { tool } = yield* session(lab);
        const who = { title: 'A name', why: 'the set needs one', by: 'agent' };
        const looped = yield* tool('ask', {
          ...who,
          machine: {
            start: 'a',
            steps: {
              a: { blocks: [{ kind: 'prose', text: 'a' }], next: [{ to: 'a' }] },
            },
          },
        });
        expect(looped.refused).toContain('the ask may not render');
        expect(looped.refused).toContain('step a goes on to itself');
        expect((yield* tool('ask', who)).refused).toContain('give `blocks`');
        expect((yield* tool('ask', { ...who, blocks: [], set: 'spare/x' })).refused).toContain(
          'name it',
        );
        const one = yield* tool('ask', {
          ...who,
          blocks: [{ kind: 'free_text', id: 'name', label: 'What do we call it?' }],
        });
        expect(one).toMatchObject({ status: 'asking', step: 'ask', answers: {}, answered: [] });
        expect(one.links).toEqual({
          local: `${BASE}asks/${one.ask}`,
          phone: `${PHONE}asks/${one.ask}`,
        });
        expect(
          (yield* tool('asks', { status: 'asking' })).asks.map((a: { ask: string }) => a.ask),
        ).toEqual([one.ask]);
      }),
    ),
  );

  it.effect(
    'the owner answers a step at a time, heard typed; closed, it is filed on the timeline',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab, events } = yield* labWithMcp;
          const { tool } = yield* session(lab);
          const productions = yield* ProductionStore;
          yield* productions.start('f', {
            title: 'F',
            film: Option.some('f'),
            blurb: Option.none(),
            first: 'the board',
            at: 1,
          });
          yield* tool('publish_set', {
            name: 'judge-faces',
            files: [{ from: '/work/judge-calmer.png', to: 'calmer.png' }],
            manifest: { title: 'Judge faces', images: ['calmer.png'] },
          });
          yield* events.look;
          const { cursor } = yield* tool('overview');
          const made = yield* tool('ask', {
            title: 'Which judge?',
            why: 'the cold open keeps one',
            by: 'agent',
            film: 'f',
            production: 'f',
            set: 'spare/judge-faces',
            machine: {
              start: 'pick',
              steps: {
                pick: {
                  blocks: [
                    {
                      kind: 'choose',
                      id: 'try',
                      label: 'Which judge?',
                      options: [
                        {
                          value: '1',
                          label: 'Try 1',
                          image: { board: { film: 'f', panel: 'cold.judge', try: 1 } },
                        },
                        {
                          value: 'calm',
                          label: 'Calmer',
                          image: { src: '/api/review/files/spare/judge-faces/calmer.png' },
                        },
                      ],
                    },
                  ],
                  next: [{ to: 'why', when: { answer: 'try', is: ['calm'] } }, { to: 'done' }],
                },
                why: {
                  blocks: [{ kind: 'free_text', id: 'why', label: 'Why the calmer one?' }],
                  next: [{ to: 'done' }],
                },
                done: { end: true, text: 'Thank you.' },
              },
            },
          });
          expect(made).toMatchObject({ status: 'asking' });
          const waits = Option.getOrThrow(yield* productions.read('f')).said;
          expect(waits.map((w) => [w._tag, w.text, w.set])).toEqual([
            ['Asked', `Which judge? (ask ${made.ask})`, Option.some('judge-faces')],
          ]);
          const picked = yield* ownerAnswers(lab, made.ask, 'pick', { try: 'calm' });
          expect(picked.status).toBe(200);
          expect((yield* ownerAnswers(lab, made.ask, 'pick', { try: '1' })).status).toBe(409);
          yield* events.look;
          const heard = yield* tool('changes', { since: cursor });
          expect(
            heard.changes.map(
              (c: { kind: string; ask: string; step: string; answers: unknown; link: string }) => [
                c.kind,
                c.ask,
                c.step,
                c.answers,
                c.link,
              ],
            ),
          ).toEqual([
            [
              'ask.step',
              made.ask,
              'pick',
              { try: { kind: 'choose', value: 'calm', label: 'Calmer' } },
              `${BASE}asks/${made.ask}`,
            ],
          ]);
          yield* ownerAnswers(lab, made.ask, 'why', { why: 'he listens' });
          yield* events.look;
          const ended = yield* tool('changes', { since: heard.cursor });
          expect(ended.changes.map((c: { kind: string }) => c.kind)).toEqual([
            'ask.step',
            'ask.answered',
          ]);
          const answers = {
            try: { kind: 'choose', value: 'calm', label: 'Calmer' },
            why: { kind: 'free_text', text: 'he listens' },
          };
          expect(ended.changes[1].answers).toEqual(answers);
          expect(yield* tool('ask_read', { ask: made.ask })).toMatchObject({
            status: 'answered',
            step: 'done',
            answers,
          });
          const closed = yield* tool('close_ask', { ask: made.ask, why: 'kept the calmer judge' });
          expect(closed).toMatchObject({
            status: 'closed',
            closed: 'kept the calmer judge',
            answers,
          });
          // Closed again: as it is, and filed once.
          yield* tool('close_ask', { ask: made.ask, why: 'kept the calmer judge' });
          const said = Option.getOrThrow(yield* productions.read('f')).said;
          expect(said.map((w) => [w._tag, w.text, w.quote, w.set])).toEqual([
            ['Asked', `Which judge? (ask ${made.ask})`, Option.none(), Option.some('judge-faces')],
            [
              'Decided',
              `Which judge? (ask ${made.ask}): try: Calmer · why: he listens`,
              Option.some('he listens'),
              Option.some('judge-faces'),
            ],
          ]);
          yield* events.look;
          expect(
            (yield* tool('changes', { since: ended.cursor })).changes.map(
              (c: { kind: string; text: string }) => [c.kind, c.text],
            ),
          ).toEqual([['ask.closed', 'kept the calmer judge']]);
          // An ask withdrawn unanswered files a note naming it, which closes its question.
          const other = yield* tool('ask', {
            title: 'Name the judge?',
            why: 'the credits',
            by: 'agent',
            production: 'f',
            set: 'spare/judge-faces',
            blocks: [{ kind: 'free_text', id: 'name', label: 'His name?' }],
          });
          yield* tool('close_ask', { ask: other.ask, why: 'not needed now' });
          const after = Option.getOrThrow(yield* productions.read('f')).said;
          expect(after.slice(2).map((w) => [w._tag, w.text, w.ask])).toEqual([
            ['Asked', `Name the judge? (ask ${other.ask})`, Option.some(other.ask)],
            [
              'Noted',
              `Name the judge? (ask ${other.ask}) withdrawn: not needed now`,
              Option.some(other.ask),
            ],
          ]);
        }),
      ),
  );
});

/** The lab's handler as an HTTP client sees it; `polling` is told once a client waits on `changes`. */
const clientOf = (lab: Lab, polling: Deferred.Deferred<void>) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.gen(function* () {
        const web = yield* Effect.orDie(HttpClientRequest.toWeb(request));
        const body = yield* Effect.promise(() => web.clone().text());
        if (body.includes('"wait":50')) yield* Deferred.done(polling, Exit.void);
        const answer = yield* Effect.promise(() => lab(web, bound));
        return HttpClientResponse.fromWeb(request, answer);
      }),
    ),
  );

describe('film channel', () => {
  it.effect("answers the handshake, then sends the owner's note on as a channel event", () =>
    provided(
      Effect.gen(function* () {
        const { lab, events } = yield* labWithMcp;
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory('/home/.config/film-lab', { recursive: true });
        yield* fs.writeFileString('/home/.config/film-lab/mcp-token', `${TOKEN}\n`);
        const stdin = yield* Queue.unbounded<Uint8Array, Cause.Done>();
        const stdout = yield* Queue.unbounded<string>();
        const polling = yield* Deferred.make<void>();
        const say = (message: Schema.Json) =>
          Queue.offer(stdin, new TextEncoder().encode(`${writeJson(message)}\n`));
        const heard = Effect.flatMap(Queue.take(stdout), (line) => readJson(line));
        const running = yield* Effect.forkChild(
          Command.runWith(channel, { version: '0' })([]).pipe(
            // oxlint-disable-next-line effect/noInlineProvide -- the bridge's stdio and client are this test's queues and lab
            Effect.provide(
              Layer.mergeAll(
                Stdio.layerTest({
                  stdin: Stream.fromQueue(stdin),
                  stdout: () =>
                    Sink.forEach((chunk: string | Uint8Array) =>
                      Effect.forEach(
                        String(chunk)
                          .split('\n')
                          .filter((line) => line.length > 0),
                        (line) => Queue.offer(stdout, line),
                      ),
                    ),
                }),
                clientOf(lab, polling),
                // The CLI runs with these; the bridge spawns nothing and asks nothing of a terminal.
                formatAsIs,
                BunTerminal.layer,
                ConfigProvider.layer(
                  ConfigProvider.fromUnknown({ FILM_LAB_URL: BASE, HOME: '/home' }),
                ),
              ),
            ),
          ),
        );
        yield* say({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'c', version: '0' },
          },
        });
        expect(yield* heard).toMatchObject({
          id: 1,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { experimental: { 'claude/channel': {} } },
          },
        });
        yield* say({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        expect(yield* heard).toEqual({ jsonrpc: '2.0', id: 2, result: { tools: [] } });
        yield* say({ jsonrpc: '2.0', method: 'notifications/initialized' });
        yield* Deferred.await(polling);
        expect((yield* ownerNote(lab, 'the light comes up too fast')).status).toBe(200);
        yield* events.look;
        expect(yield* heard).toMatchObject({
          method: 'notifications/claude/channel',
          params: {
            content: `f n1: note on scene cold: the light comes up too fast\n${BASE}films/f/lab/cold?note=n1`,
            meta: { kind: 'note.added', film: 'f', note: 'n1', by: 'owner', seq: '1' },
          },
        });
        yield* Queue.end(stdin);
        yield* Fiber.interrupt(running);
      }),
    ),
  );
});
