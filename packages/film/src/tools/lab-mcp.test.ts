// The lab as an MCP server, through the lab's own handler as a client calls
// it at `/mcp`: answered with no token, refused by the lab's gate on a Host
// or Origin not its own; a session started (its header kept, so the write gate's read body
// keeps what MCP answers with); every tool listed; the owner's note seen
// in the change feed with its link; an agent's reply and done landing in the
// note's thread; a tweak asked of a board panel; a set published into the
// lab's out/ and listed, and seen as published; an ask made (its machine
// checked first), answered by the owner a step at a time through the page's
// route and heard on `changes` with its answers typed, then closed and filed
// on its production's timeline. `film production ask` makes the lab's own
// ask, its set named by folder as the ledger names it (a ref refused, and a
// folder two roots hold). What the owner said in chat is filed by `decide`
// and `note` on his timeline, his own words required and who filed it kept,
// its set by ref or folder (one two roots hold refused, for an ask too): a
// note leaves a question waiting, a decision on its set answers it, and each
// lands in the version open when it is filed. The lab client's session ends
// with its scope, a handshake failed halfway too, and the lab forgets it.

import { describe, expect, it } from 'effect-bun-test';
import {
  Cause,
  ConfigProvider,
  Console,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Path,
  Queue,
  References,
  Schema,
  Sink,
  Stdio,
  Stream,
} from 'effect';
import { BunTerminal } from '@effect/platform-bun';
import { Command } from 'effect/cli';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/http';
import { Base64 } from 'effect/encoding';
import { TestClock } from 'effect/testing';
import { labUrls } from '../core/api.ts';
import { type BoardFile, BoardFileJson } from '../core/board.ts';
import { currentOf, moveForward, productionsOf } from '../core/production.ts';
import { AskStore } from './ask-store.ts';
import { RenderCatalogue } from './catalogue.ts';
import { production } from './production-cli.ts';
import { ProductionStore } from './production-store.ts';
import { channel } from './lab-channel.ts';
import { labClient } from './lab-client.ts';
import { Changes } from './lab-mcp.ts';
import { Review } from './review.ts';
import {
  type LabFetch,
  MCP_BASE,
  MCP_PHONE,
  formatAsIs,
  labInMemory,
  labWithMcp,
  mcpBound,
  mcpPost,
  mcpSession,
  noRenders,
  printingTo,
  text,
} from './testing.ts';

const STRANGER = 'x.example.net';

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
    // A set of the same folder's name in another root (`reviewAt` names it).
    [
      '/elsewhere/judge-faces/review.json',
      text('{"title":"Judge faces elsewhere","images":["calm.png"]}'),
    ],
    ['/elsewhere/judge-faces/calm.png', text('a calm judge')],
  ]);

/** The review rooted at the lab's own out/ (`FILMS_OUT`, here its default under the working folder), then `others`. */
const reviewAt = (others: ReadonlyArray<{ readonly label: string; readonly path: string }>) =>
  Layer.effect(
    Review,
    Effect.gen(function* () {
      const review = yield* Review;
      const path = yield* Path.Path;
      return Review.of({
        ...review,
        roots: [{ label: 'spare', path: path.resolve('out') }, ...others],
      });
    }),
  ).pipe(Layer.provide([noRenders, Path.layer]));
const reviewAtOut = reviewAt([]);

const providedWith =
  (review: typeof reviewAtOut) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(RenderCatalogue.layer, review).pipe(
          Layer.provideMerge(labInMemory(files())),
        ),
      ),
    );
const provided = providedWith(reviewAtOut);

/** JSON as a request carries it and an answer is read. */
const JsonText = Schema.fromJsonString(Schema.Json);
const writeJson = Schema.encodeSync(JsonText);
const readJson = Schema.decodeUnknownEffect(JsonText);

/** The owner's note on the film's frame, as the lab's page posts it. */
const ownerNote = (lab: LabFetch, words: string) =>
  Effect.promise(() =>
    lab(
      new Request(`${MCP_BASE.slice(0, -1)}${labUrls.notes.add({ params: { film: 'f' } })}`, {
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
      mcpBound,
    ),
  );

describe('who may use the MCP', () => {
  it.effect(
    'anyone the lab answers, with no token; the gate refuses a Host or Origin not its own',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const status = (headers: Readonly<Record<string, string>>) =>
            Effect.map(
              mcpPost(lab, { jsonrpc: '2.0', id: 1, method: 'ping' }, headers),
              (r) => r.status,
            );
          expect(yield* status({ host: STRANGER })).toBe(403);
          expect(yield* status({ origin: `http://${STRANGER}` })).toBe(403);
          // No Authorization header: a session starts (`mcpSession` checks its header).
          yield* mcpSession(lab);
        }),
      ),
  );
});

describe('the lab as an MCP server', () => {
  it.effect('lists its tools, hears the owner, and answers on the note', () =>
    provided(
      Effect.gen(function* () {
        const { lab, events } = yield* labWithMcp;
        const { call, tool } = yield* mcpSession(lab);
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
            'decide',
            'note',
            'check',
            'cues',
            'journal',
            'journal_note',
            'look',
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
        expect(heard.changes[0].link).toBe(`${MCP_BASE}films/f/lab/cold?note=n1`);
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
            new Request(`${MCP_BASE.slice(0, -1)}${labUrls.notes.list({ params: { film: 'f' } })}`),
            mcpBound,
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
        const { tool } = yield* mcpSession(lab);
        const { cursor } = yield* tool('overview');
        const tweak = yield* tool('request_tweak', {
          film: 'f',
          panel: 'cold.judge',
          text: 'softer eyes',
        });
        expect(tweak.note.panel).toEqual({ id: 'cold.judge', try: 1, ask: 'tweak' });
        expect(tweak.note.link).toBe(`${MCP_BASE}films/f/board/cold?panel=judge&note=n1`);
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
          `${MCP_BASE}sets/spare%2Fjudge-faces`,
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

/** `body` posted to an ask's answer route, as a page posts it: its status and what it answered. */
const answerPosted = (lab: LabFetch, ask: string, body: Schema.Json) =>
  Effect.flatMap(
    Effect.promise(() =>
      lab(
        new Request(`${MCP_BASE.slice(0, -1)}${labUrls.asks.answer({ params: { ask } })}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: writeJson(body),
        }),
        mcpBound,
      ),
    ),
    (r) => Effect.promise(() => r.json().then((answer) => ({ status: r.status, body: answer }))),
  );

/** The owner's answers to a step of an ask, as its page posts them: one section. */
const ownerAnswers = (lab: LabFetch, ask: string, step: string, values: Record<string, string>) =>
  answerPosted(lab, ask, { sections: [{ step, values }] });

describe('asks through the MCP', () => {
  it.effect('refuses an ask that may not render, and makes a one-line one with its links', () =>
    provided(
      Effect.gen(function* () {
        const { lab } = yield* labWithMcp;
        const { tool } = yield* mcpSession(lab);
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
        const wordsBesideChoice = yield* tool('ask', {
          ...who,
          blocks: [
            {
              kind: 'choose',
              id: 'keep',
              label: 'Keep it?',
              options: [
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ],
            },
            { kind: 'free_text', id: 'more', label: 'Why?', required: true },
          ],
        });
        expect(wordsBesideChoice.refused).toContain('more is required beside a choice');
        expect((yield* tool('ask', { ...who, blocks: [], set: 'spare/x' })).refused).toContain(
          'name it',
        );
        expect((yield* tool('ask', { ...who, blocks: [], point: 'render:cold' })).refused).toBe(
          '`point` is a choice in a set: name the `set`',
        );
        const one = yield* tool('ask', {
          ...who,
          blocks: [{ kind: 'free_text', id: 'name', label: 'What do we call it?' }],
        });
        expect(one).toMatchObject({ status: 'asking', step: 'ask', answers: {}, answered: [] });
        expect(one.links).toEqual({
          local: `${MCP_BASE}asks/${one.ask}`,
          phone: `${MCP_PHONE}asks/${one.ask}`,
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
          const { tool } = yield* mcpSession(lab);
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
                          recommended: true,
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
                  blocks: [
                    { kind: 'free_text', id: 'why', label: 'Why the calmer one?', required: true },
                    { kind: 'free_text', id: 'more', label: 'Anything else?' },
                  ],
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
              `${MCP_BASE}asks/${made.ask}`,
            ],
          ]);
          // A page with no sections is no answer; a tab opened before the one-page ask sends one
          // step as it did, and it is taken.
          expect((yield* answerPosted(lab, made.ask, { sections: [] })).status).toBe(400);
          // A body is one form or the other: sections beside a step are refused, whatever they are,
          // never read as the old form with the sections dropped.
          for (const sections of [[], 'bad'])
            expect(
              (yield* answerPosted(lab, made.ask, {
                sections,
                step: 'why',
                values: { why: 'he listens' },
              })).status,
            ).toBe(400);
          const old = yield* answerPosted(lab, made.ask, {
            step: 'why',
            values: { why: 'he listens' },
          });
          expect(old.status).toBe(200);
          yield* events.look;
          const ended = yield* tool('changes', { since: heard.cursor });
          expect(ended.changes.map((c: { kind: string }) => c.kind)).toEqual([
            'ask.step',
            'ask.answered',
          ]);
          // The optional field left empty is told, typed; the timeline's decision leaves it out.
          const answers = {
            try: { kind: 'choose', value: 'calm', label: 'Calmer' },
            why: { kind: 'free_text', text: 'he listens' },
            more: { kind: 'skipped' },
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

/**
 * `film production …args` run to its end against the lab at `MCP_BASE`, its
 * requests answered by `fetch` (the lab's handler, or no lab at all): whether
 * it succeeded, its printed lines, and its failure's words.
 */
const productionCli = (
  fetch: (request: Request) => Promise<Response>,
  args: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const lines = yield* Queue.unbounded<string>();
    const exit = yield* Effect.exit(
      Command.runWith(production, { version: '0' })(args).pipe(
        Effect.provideService(Console.Console, printingTo(lines)),
        Effect.provideService(References.MinimumLogLevel, 'None'),
        Effect.provideService(
          FetchHttpClient.Fetch,
          Object.assign(
            (input: RequestInfo | URL, init?: RequestInit) => fetch(new Request(input, init)),
            {
              preconnect: globalThis.fetch.preconnect,
            },
          ),
        ),
        // oxlint-disable-next-line effect/noInlineProvide -- the command's own terminal, and the lab it asks
        Effect.provide(
          Layer.mergeAll(
            Stdio.layerTest({}),
            formatAsIs,
            BunTerminal.layer,
            ConfigProvider.layer(ConfigProvider.fromUnknown({ FILM_LAB_URL: MCP_BASE })),
          ),
        ),
      ),
    );
    return {
      ok: Exit.isSuccess(exit),
      lines: yield* Queue.clear(lines),
      failed: Exit.match(exit, {
        onSuccess: () => '',
        onFailure: (cause) =>
          Option.match(Cause.findErrorOption(cause), {
            onNone: () => Cause.pretty(cause),
            onSome: (error) => String(error),
          }),
      }),
    };
  });

describe('film production ask', () => {
  it.effect(
    "makes the lab's own ask, filed on the timeline with its choice, and prints its links",
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
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
          const asked = yield* productionCli(
            (request) => lab(request, mcpBound),
            [
              'ask',
              'f',
              'Which judge?',
              '--why',
              'the cold open keeps one',
              '--option',
              'Try 1',
              '--option',
              'Calmer',
              '--set',
              'judge-faces',
              '--point',
              'render:cold',
              '--film',
              'f',
            ],
          );
          expect(asked.failed).toBe('');
          const [made] = (yield* tool('asks', {})).asks;
          expect(made).toMatchObject({
            title: 'Which judge?',
            by: 'agent',
            status: 'asking',
            production: 'f',
            set: 'spare/judge-faces',
            point: 'render:cold',
          });
          expect(asked.lines).toEqual([
            `asked ${made.ask} on f: waits on its timeline at judge-faces, render:cold`,
            `local ${MCP_BASE}asks/${made.ask}`,
            `phone ${MCP_PHONE}asks/${made.ask}`,
            `then: its answers with the lab's MCP (ask_read ${made.ask}); close_ask it once acted on`,
          ]);
          // The page: a choice, and words beside it the owner may leave out.
          const record = yield* (yield* AskStore).read(made.ask);
          expect(record.ask.steps['ask']).toEqual({
            blocks: [
              {
                kind: 'choose',
                id: 'pick',
                label: 'Pick one',
                options: [
                  { value: '1', label: 'Try 1', recommended: true },
                  { value: '2', label: 'Calmer' },
                ],
              },
              { kind: 'free_text', id: 'note', label: 'Anything else?' },
            ],
            next: [{ to: 'done' }],
          });
          // Filed the way the MCP files it: the lab's own ledger, its choice carried.
          const said = Option.getOrThrow(yield* productions.read('f')).said;
          expect(said.map((w) => [w._tag, w.text, w.set, w.point, w.ask])).toEqual([
            [
              'Asked',
              `Which judge? (ask ${made.ask})`,
              Option.some('judge-faces'),
              Option.some('render:cold'),
              Option.some(made.ask),
            ],
          ]);
          // The owner taps a choice and sends, the words left empty.
          expect((yield* ownerAnswers(lab, made.ask, 'ask', { pick: '2' })).status).toBe(200);
          expect(yield* tool('ask_read', { ask: made.ask })).toMatchObject({
            status: 'answered',
            answers: {
              pick: { kind: 'choose', value: '2', label: 'Calmer' },
              note: { kind: 'skipped' },
            },
          });
          // The set named by the lab's ref, or by a folder the lab lists not: refused, nothing asked.
          const again = (set: string) =>
            productionCli(
              (request) => lab(request, mcpBound),
              ['ask', 'f', 'Q?', '--why', 'w', '--option', 'A', '--option', 'B', '--set', set],
            );
          expect((yield* again('spare/judge-faces')).failed).toBe(
            "SetByRef: spare/judge-faces is the lab's ref for it: the production commands name a set by its folder under its root, --set judge-faces",
          );
          expect((yield* again('nowhere')).failed).toBe(
            `SetUnlisted: the lab at ${MCP_BASE} lists no set nowhere: name a set by its folder under its review root, as \`film production show\` prints it (set=…)`,
          );
          expect((yield* tool('asks', {})).asks.map((a: { ask: string }) => a.ask)).toEqual([
            made.ask,
          ]);
        }),
      ),
  );

  it.effect(
    'refuses a set two roots hold, by its folder or its ref: its timeline could not tell',
    () =>
      providedWith(reviewAt([{ label: 'other', path: '/elsewhere' }]))(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          yield* (yield* ProductionStore).start('f', {
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
          const asking = (set: string) =>
            productionCli(
              (request) => lab(request, mcpBound),
              [
                'ask',
                'f',
                'Which judge?',
                '--why',
                'w',
                '--option',
                'A',
                '--option',
                'B',
                '--set',
                set,
              ],
            );
          const inRoots =
            "SetInRoots: judge-faces is a folder in more than one root (spare/judge-faces, other/judge-faces), and a production's timeline names a set by its folder alone: rename one, or ask without --set";
          expect((yield* asking('judge-faces')).failed).toBe(inRoots);
          expect((yield* asking('other/judge-faces')).failed).toBe(inRoots);
          expect((yield* tool('asks', {})).asks).toEqual([]);
        }),
      ),
  );

  it.effect(
    'asks for words with no options; refuses one option, and says when no lab answers',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          const productions = yield* ProductionStore;
          yield* productions.start('f', {
            title: 'F',
            film: Option.some('f'),
            blurb: Option.none(),
            first: 'the board',
            at: 1,
          });
          const atLab = (request: Request) => lab(request, mcpBound);
          const words = yield* productionCli(atLab, [
            'ask',
            'f',
            'What do we call him?',
            '--why',
            'the credits',
          ]);
          expect(words.failed).toBe('');
          expect(words.lines[0]).toMatch(
            /^asked a[0-9a-f]{10} on f: filed on its timeline once closed$/,
          );
          const id = words.lines[0]?.split(' ')[1] ?? '';
          expect((yield* (yield* AskStore).read(id)).ask.steps['ask']).toMatchObject({
            blocks: [{ kind: 'free_text', id: 'answer', label: 'Your answer', required: true }],
          });
          // Nothing waits on the timeline for an ask that names no set, until it is closed.
          expect(Option.getOrThrow(yield* productions.read('f')).said).toEqual([]);
          const one = yield* productionCli(atLab, [
            'ask',
            'f',
            'Q?',
            '--why',
            'w',
            '--option',
            'Yes',
          ]);
          expect(one.failed).toContain('one --option ("Yes") is no choice');
          // Refused before the lab is asked: the one ask is the one for words.
          expect((yield* tool('asks', {})).asks.map((a: { ask: string }) => a.ask)).toEqual([id]);
          const elsewhere = yield* productionCli(atLab, ['ask', 'nope', 'Q?', '--why', 'w']);
          expect(elsewhere.failed).toBe(
            'LabToolRefused: the lab refused ask: no production nope: film production new nope --title "<title>"',
          );
          const down = yield* productionCli(
            // oxlint-disable-next-line effect/noNewPromise, effect/noNewError -- fetch's own contract: a closed port rejects with a TypeError
            () => Promise.reject(new TypeError('Unable to connect')),
            ['ask', 'f', 'Q?', '--why', 'w'],
          );
          expect(down.ok).toBe(false);
          expect(down.failed).toMatch(
            /^LabUnanswered: no lab answered at http:\/\/127\.0\.0\.1:4401\/ \(.*\): start one \(from apps\/animations: bun run lab, or LAB_PORT=<port> bun cli\.ts lab\) and point FILM_LAB_URL at it$/,
          );
        }),
      ),
  );
});

/** The questions waiting on production `f`'s current version, by their words. */
const waitingOnF = Effect.gen(function* () {
  const ledger = Option.getOrThrow(yield* (yield* ProductionStore).read('f'));
  return productionsOf([ledger], []).flatMap((h) => currentOf(h).waiting.map((w) => w.ask.text));
});

/** Production `f`, with the set `judge-faces` published into the lab's out/. */
const productionWithSet = Effect.fn('productionWithSet')(function* (
  tool: (name: string, args?: Schema.Json) => Effect.Effect<any>,
) {
  yield* (yield* ProductionStore).start('f', {
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
});

describe("the owner's word through the MCP", () => {
  it.effect(
    'files what he said in chat on his timeline, in his words: a note leaves the question, a decision answers it',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab, events } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          const productions = yield* ProductionStore;
          yield* productionWithSet(tool);
          yield* events.look;
          const asked = yield* tool('ask', {
            title: 'Which judge?',
            why: 'the cold open keeps one',
            by: 'agent',
            production: 'f',
            set: 'spare/judge-faces',
            blocks: [{ kind: 'free_text', id: 'which', label: 'Which judge?' }],
          });
          const question = `Which judge? (ask ${asked.ask})`;
          expect(yield* waitingOnF).toEqual([question]);
          // A note decides nothing: the question still waits. Its set named by its folder.
          const noted = yield* tool('note', {
            production: 'f',
            text: 'The paper reads cold',
            quote: 'the paper is too cold, warm it up',
            by: 'painter',
            set: 'judge-faces',
          });
          expect(noted).toEqual({
            production: 'f',
            version: 1,
            said: {
              _tag: 'Noted',
              at: 0,
              text: 'The paper reads cold',
              quote: 'the paper is too cold, warm it up',
              set: 'judge-faces',
              by: 'painter',
            },
            link: `${MCP_BASE}productions/f?v=1`,
          });
          expect(yield* waitingOnF).toEqual([question]);
          // A decision on the set, named by its ref as `sets` lists it, answers it.
          const decided = yield* tool('decide', {
            production: 'f',
            text: 'The calmer judge',
            quote: 'go with the calmer one',
            by: 'painter',
            set: 'spare/judge-faces',
            point: 'render:cold',
            variant: 'calm',
          });
          expect(decided.said).toEqual({
            _tag: 'Decided',
            at: 0,
            text: 'The calmer judge',
            quote: 'go with the calmer one',
            set: 'judge-faces',
            point: 'render:cold',
            variant: 'calm',
            by: 'painter',
          });
          // On a choice, it answers a question on that choice only: this one is on the set.
          expect(yield* waitingOnF).toEqual([question]);
          yield* tool('decide', {
            production: 'f',
            text: 'The calmer judge, all of it',
            quote: 'the calmer one everywhere',
            by: 'painter',
            set: 'judge-faces',
          });
          expect(yield* waitingOnF).toEqual([]);
          // Moved forward, the next word lands in the version open now.
          yield* productions.modify('f', (current) =>
            moveForward(current, { after: 1, title: 'v2', because: Option.none() }, 60_000),
          );
          yield* TestClock.adjust('2 minutes');
          const later = yield* tool('note', {
            production: 'f',
            text: 'Slower',
            quote: 'slow it all down',
            by: 'painter',
          });
          expect(later).toEqual({
            production: 'f',
            version: 2,
            said: {
              _tag: 'Noted',
              at: 120_000,
              text: 'Slower',
              quote: 'slow it all down',
              by: 'painter',
            },
            link: `${MCP_BASE}productions/f?v=2`,
          });
          const said = Option.getOrThrow(yield* productions.read('f')).said;
          expect(said.map((w) => [w._tag, w.quote, w.set, w.by])).toEqual([
            ['Asked', Option.none(), Option.some('judge-faces'), Option.some('agent')],
            [
              'Noted',
              Option.some('the paper is too cold, warm it up'),
              Option.some('judge-faces'),
              Option.some('painter'),
            ],
            [
              'Decided',
              Option.some('go with the calmer one'),
              Option.some('judge-faces'),
              Option.some('painter'),
            ],
            [
              'Decided',
              Option.some('the calmer one everywhere'),
              Option.some('judge-faces'),
              Option.some('painter'),
            ],
            ['Noted', Option.some('slow it all down'), Option.none(), Option.some('painter')],
          ]);
          // `film production note --by` files the same word; the ledger prints who filed each.
          const cli = (args: ReadonlyArray<string>) =>
            productionCli((request) => lab(request, mcpBound), args);
          yield* cli(['note', 'f', 'Warmer', '--quote', 'warmer still', '--by', 'coordinator']);
          expect((yield* cli(['show', 'f'])).lines).toEqual(
            expect.arrayContaining([
              '  noted 1970-01-01T00:02:00.000Z: Slower — "slow it all down"  by=painter',
              '  noted 1970-01-01T00:02:00.000Z: Warmer — "warmer still"  by=coordinator',
            ]),
          );
        }),
      ),
  );

  it.effect(
    'refuses a word without his own words, or on a production, set or choice it cannot name',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab, events } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          yield* productionWithSet(tool);
          yield* events.look;
          const word = { production: 'f', text: 'The calmer judge', by: 'painter' };
          const quoted = { ...word, quote: 'go with the calmer one' };
          expect((yield* tool('decide', word)).refused).toContain(
            "Invalid parameters for tool 'decide': Missing key",
          );
          expect((yield* tool('decide', { ...word, quote: '  \n ' })).refused).toContain(
            "the owner's own words, verbatim from the chat: a word filed without them is refused",
          );
          expect((yield* tool('note', { ...quoted, by: '' })).refused).toContain(
            "Invalid parameters for tool 'note': Expected a value with a length of at least 1",
          );
          expect((yield* tool('decide', { ...quoted, production: '../f' })).refused).toContain(
            "Invalid parameters for tool 'decide': Expected a string matching the RegExp",
          );
          expect((yield* tool('decide', { ...quoted, production: 'nope' })).refused).toBe(
            'no production nope: film production new nope --title "<title>"',
          );
          expect((yield* tool('decide', { ...quoted, set: 'nowhere' })).refused).toBe(
            'no set nowhere: `sets` lists them by ref (a folder under its root names one too)',
          );
          expect((yield* tool('decide', { ...quoted, point: 'render:cold' })).refused).toBe(
            '`point` is a choice in a set: name the `set`',
          );
          expect(
            (yield* tool('decide', { ...quoted, set: 'judge-faces', variant: 'calm' })).refused,
          ).toBe("`variant` is one of a choice's: name the `point`");
          expect(Option.getOrThrow(yield* (yield* ProductionStore).read('f')).said).toEqual([]);
        }),
      ),
  );

  it.effect('refuses a set two roots hold, by its folder or its ref, for an ask too', () =>
    providedWith(reviewAt([{ label: 'other', path: '/elsewhere' }]))(
      Effect.gen(function* () {
        const { lab, events } = yield* labWithMcp;
        const { tool } = yield* mcpSession(lab);
        yield* productionWithSet(tool);
        yield* events.look;
        const word = {
          production: 'f',
          text: 'The calmer judge',
          quote: 'go with the calmer one',
          by: 'painter',
        };
        const inRoots =
          "judge-faces is a folder in more than one root (spare/judge-faces, other/judge-faces), and a production's timeline names a set by its folder alone: rename one, or leave out `set`";
        expect((yield* tool('decide', { ...word, set: 'judge-faces' })).refused).toBe(inRoots);
        expect((yield* tool('note', { ...word, set: 'other/judge-faces' })).refused).toBe(inRoots);
        const asked = yield* tool('ask', {
          title: 'Which judge?',
          why: 'the cold open keeps one',
          by: 'agent',
          production: 'f',
          set: 'spare/judge-faces',
          blocks: [{ kind: 'free_text', id: 'which', label: 'Which judge?' }],
        });
        expect(asked.refused).toBe(inRoots);
        expect(Option.getOrThrow(yield* (yield* ProductionStore).read('f')).said).toEqual([]);
        expect((yield* tool('asks', {})).asks).toEqual([]);
      }),
    ),
  );
});

/** The lab's handler as an HTTP client sees it; `polling` is told once a client waits on `changes`. */
const httpOf = (lab: LabFetch, polling: Deferred.Deferred<void>) =>
  HttpClient.make((request) =>
    Effect.gen(function* () {
      const web = yield* Effect.orDie(HttpClientRequest.toWeb(request));
      const body = yield* Effect.promise(() => web.clone().text());
      if (body.includes('"wait":50')) yield* Deferred.done(polling, Exit.void);
      const answer = yield* Effect.promise(() => lab(web, mcpBound));
      return HttpClientResponse.fromWeb(request, answer);
    }),
  );

const clientOf = (lab: LabFetch, polling: Deferred.Deferred<void>) =>
  Layer.succeed(HttpClient.HttpClient, httpOf(lab, polling));

describe('the lab client', () => {
  it.effect('ends its session when its scope closes, and the lab forgets it', () =>
    provided(
      Effect.gen(function* () {
        const { lab } = yield* labWithMcp;
        const polling = yield* Deferred.make<void>();
        const client = yield* labClient(MCP_BASE).pipe(
          Effect.provideService(HttpClient.HttpClient, httpOf(lab, polling)),
        );
        const ended = yield* Effect.scoped(
          Effect.tap(client.session, (session) => client.call(session, Changes, { wait: 0 })),
        );
        const after = yield* Effect.flip(client.call(ended, Changes, { wait: 0 }));
        expect(after.message).toContain(`no lab answered at ${MCP_BASE} (it answered 404)`);
      }),
    ),
  );

  it.effect('ends a session whose handshake fails halfway', () =>
    provided(
      Effect.gen(function* () {
        const { lab } = yield* labWithMcp;
        const answered: Array<string> = [];
        // The lab answers each request but `notifications/initialized`, lost on its way.
        const losing = HttpClient.make((request) =>
          Effect.gen(function* () {
            const web = yield* Effect.orDie(HttpClientRequest.toWeb(request));
            const body = yield* Effect.promise(() => web.clone().text());
            if (body.includes('notifications/initialized'))
              return yield* new HttpClientError.HttpClientError({
                reason: new HttpClientError.TransportError({ request, description: 'lost' }),
              });
            const answer = yield* Effect.promise(() => lab(web, mcpBound));
            answered.push(`${web.method} ${answer.status}`);
            return HttpClientResponse.fromWeb(request, answer);
          }),
        );
        const client = yield* labClient(MCP_BASE).pipe(
          Effect.provideService(HttpClient.HttpClient, losing),
        );
        const failed = yield* Effect.flip(Effect.scoped(client.session));
        expect(failed.message).toContain(`no lab answered at ${MCP_BASE}`);
        // The session the lab named is ended all the same.
        expect(answered).toEqual(['POST 200', 'DELETE 204']);
      }),
    ),
  );
});

describe('film channel', () => {
  it.effect("answers the handshake, then sends the owner's note on as a channel event", () =>
    provided(
      Effect.gen(function* () {
        const { lab, events } = yield* labWithMcp;
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
                  ConfigProvider.fromUnknown({ FILM_LAB_URL: MCP_BASE, HOME: '/home' }),
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
            content: `f n1: note on scene cold: the light comes up too fast\n${MCP_BASE}films/f/lab/cold?note=n1`,
            meta: { kind: 'note.added', film: 'f', note: 'n1', by: 'owner', seq: '1' },
          },
        });
        yield* Queue.end(stdin);
        yield* Fiber.interrupt(running);
      }),
    ),
  );
});
