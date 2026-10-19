// The lab as an MCP server, through the lab's own handler as a client calls
// it at `/mcp`: answered with no token, refused by the lab's gate on a Host
// or Origin not its own; a session started (its header kept, so the write gate's read body
// keeps what MCP answers with); every tool listed; the owner's note seen
// in the change feed with its link; an agent's reply and done landing in the
// note's thread; a tweak asked of a board panel; a set published into the
// lab's out/ and listed, and seen as published; an ask made (its machine
// checked first), answered by the owner a step at a time through the page's
// route and heard on `changes` with its answers typed, then closed and filed
// on its production's timeline. `film lab ask` makes the lab's own
// ask from a terminal, through the same command. What the owner said in chat is filed by `decide`
// and `note` on his timeline, his own words required and who filed it kept,
// its set by ref or folder (one two roots hold refused, for an ask too): a
// note leaves a question waiting, a decision on its set answers it, and each
// lands in the version open when it is filed. The lab client's session ends
// with its scope, a handshake failed halfway too, and the lab forgets it.

import { describe, expect, it } from 'effect-bun-test';
import {
  Array as Arr,
  Cause,
  ConfigProvider,
  Console,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Queue,
  References,
  Schema,
  Sink,
  Stdio,
  Stream,
  SubscriptionRef,
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
import { type BoardFile, BoardFileJson, BoardName } from '../core/board.ts';
import { CatalogueJson, emptyCatalogue } from '../core/catalogue.ts';
import { Segment } from '../core/segment.ts';
import { currentOf, moveForward, productionsOf } from '../core/production.ts';
import type { ContentStore } from './content-store.ts';
import { RenderCatalogue } from './catalogue.ts';
import { production } from './production-cli.ts';
import { ProductionStore } from './production-store.ts';
import { labSubcommands } from './events-cli.ts';
import { channel } from './lab-channel.ts';
import { labClient } from './lab-client.ts';
import { Changes } from './lab-commands.ts';
import { Review } from './review.ts';
import {
  type LabFetch,
  MCP_BASE,
  MCP_PHONE,
  echoPages,
  formatAsIs,
  labInMemory,
  labWithMcp,
  mcpBound,
  mcpPost,
  mcpSession,
  noStudio,
  printingTo,
  reviewMedia,
  text,
} from './testing.ts';

const STRANGER = 'x.example.net';

const board: BoardFile = {
  film: 'f',
  panels: [
    {
      id: 'cold.judge',
      beat: BoardName.make('cold'),
      at: BoardName.make('judge'),
      tries: [
        {
          n: 1,
          file: Segment.make('cold.judge.1.png'),
          sha256: 's1',
          made: 'import',
          refs: [],
          at: '2026-10-14T00:00:00.000Z',
        },
        {
          n: 2,
          file: Segment.make('cold.judge.2.png'),
          sha256: 's2',
          made: 'import',
          refs: [],
          at: '2026-10-14T01:00:00.000Z',
        },
      ],
    },
  ],
  approvals: [],
};

/**
 * Film `f` with a board panel and its two tries' images (none kept: the
 * Board shows the first), and a still an agent made outside the lab.
 */
const files = () =>
  new Map<string, Uint8Array>([
    ['/films/f/scenes/index.ts', text('export {};\n')],
    ['/films/f/board.json', text(Schema.encodeSync(BoardFileJson)(board))],
    ['/films/f/board/cold.judge.1.png', text('the judge')],
    ['/films/f/board/cold.judge.2.png', text('the judge again')],
    ['/work/judge-calmer.png', text('a calmer judge')],
    // A set of the same folder's name in another root (`reviewAt` names it).
    [
      '/elsewhere/judge-faces/review.json',
      text('{"title":"Judge faces elsewhere","images":["calm.png"]}'),
    ],
    ['/elsewhere/judge-faces/calm.png', text('a calm judge')],
  ]);

/**
 * The review itself rooted at the lab's own out/ (`FILMS_OUT`, here its
 * default under the working folder), then `others`: its index read and kept,
 * as the page's is, until a write drops it.
 */
const reviewAt = (others: ReadonlyArray<{ readonly label: string; readonly path: string }>) =>
  Layer.unwrap(
    Effect.map(Path.Path, (path) =>
      Review.layer({
        roots: [{ label: 'spare', path: path.resolve('out') }, ...others],
        cache: '/cache',
        phoneOver: 1_000_000,
        maxVideo: 10_000_000,
        phoneCopies: false,
      }),
    ),
  ).pipe(Layer.provide([reviewMedia([]), RenderCatalogue.layer, Path.layer]));
const reviewAtOut = reviewAt([]);

const providedWith =
  <RR extends ContentStore | FileSystem.FileSystem | Path.Path>(
    review: Layer.Layer<Review, never, RR>,
  ) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(RenderCatalogue.layer, review).pipe(
          // The asks find a set's files through the same review the lab's routes serve them by.
          Layer.provideMerge(
            labInMemory(files(), echoPages, { asking: Layer.mergeAll(review, noStudio) }),
          ),
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

  it.effect(
    'a client ends its session as the MCP spec says: a DELETE with no body and no type, then the lab forgets it',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const { session } = yield* mcpSession(lab);
          // As the MCP SDK's `terminateSession` sends it: the session's headers, nothing else.
          const end = () =>
            Effect.promise(() =>
              lab(
                new Request(`${MCP_BASE.slice(0, -1)}/mcp`, {
                  method: 'DELETE',
                  headers: {
                    'mcp-session-id': session,
                    'mcp-protocol-version': '2025-06-18',
                  },
                }),
                mcpBound,
              ).then((r) => r.status),
            );
          expect(yield* end()).toBe(204);
          expect(yield* end()).toBe(404);
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
            'beat_hold',
            'beat_move',
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
            'keep_try',
            'approve_beat',
            'withdraw_beat',
            'set',
            'sets',
            'ask',
            'ask_read',
            'asks',
            'close_ask',
            'decide',
            'note',
            'forward',
            'check',
            'cues',
            'journal',
            'journal_note',
            'look',
            'match',
            'critique',
            'timeline',
            'undo',
            'working',
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
        expect(heard.changes[0].links).toEqual({
          local: `${MCP_BASE}films/f/studio?sel=beat%3Acold&note=n1`,
          phone: `${MCP_PHONE}films/f/studio?sel=beat%3Acold&note=n1`,
        });
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
        expect(tweak.note.links.local).toBe(
          `${MCP_BASE}films/f/studio?sel=panel%3Acold.judge&note=${tweak.note.id}`,
        );
        expect(
          (yield* tool('request_tweak', { film: 'f', panel: 'cold.x', text: 'x' })).refused,
        ).toContain('no panel cold.x');
        expect(
          (yield* tool('request_tweak', { film: 'f', panel: 'cold.judge', text: 'x', try: 9 }))
            .refused,
        ).toContain('panel cold.judge has no try 9; its tries are 1, 2');
        const asked = yield* tool('request_tweak', {
          film: 'f',
          panel: 'cold.judge',
          text: 'from the second',
          try: 2,
        });
        expect(asked.note.panel).toEqual({ id: 'cold.judge', try: 2, ask: 'tweak' });
        const published = yield* tool('publish_set', {
          name: 'judge-faces',
          files: [{ from: '/work/judge-calmer.png', to: 'calmer.png' }],
          manifest: { title: 'Judge faces', images: ['calmer.png'] },
        });
        expect([published.set, published.links]).toEqual([
          'spare/judge-faces',
          {
            local: `${MCP_BASE}sets/spare%2Fjudge-faces`,
            phone: `${MCP_PHONE}sets/spare%2Fjudge-faces`,
          },
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
          'tweak.requested',
          'set.published',
        ]);
      }),
    ),
  );
});

describe('a set published through the MCP', () => {
  it.effect(
    "is refused into a film's project folder, and when a variant or its notes is a file the folder lacks",
    () =>
      provided(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const out = path.resolve('out');
          yield* fs.makeDirectory(path.join(out, 'old-render'), { recursive: true });
          yield* fs.writeFileString(
            path.join(out, 'old-render', 'catalogue.json'),
            yield* Schema.encodeEffect(CatalogueJson)(emptyCatalogue('old-render')),
          );
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          const publish = (name: string, manifest: Schema.Json, files: Schema.Json = []) =>
            tool('publish_set', { name, files, manifest });
          // Film f's own folder, and a folder a catalogue keeps: the review shows them as projects.
          expect((yield* publish('f', { title: 'x' })).refused).toContain(
            "film f's project folder",
          );
          expect((yield* publish('old-render', { title: 'x' })).refused).toContain(
            'project folder',
          );
          const clip = (variants: Schema.Json) => ({ sets: { cold: { variants } } });
          const video = { from: '/work/judge-calmer.png', to: 'cold.b.mp4' };
          // A variant's own file, its notes, and one with neither copy beside it.
          expect((yield* publish('cuts', clip({ a: { file: 'a.mp4' } }))).refused).toContain(
            'a.mp4',
          );
          expect(
            (yield* publish('cuts', clip({ b: { notes: 'b.md' } }), [video])).refused,
          ).toContain('b.md');
          const implicit = (yield* publish('cuts', clip({ c: {} }))).refused;
          expect(implicit).toContain('cold.c.share.mp4');
          expect(implicit).toContain('cold.c.mp4');
          // A variant with no file is its share copy or its master: either is enough.
          const published = yield* publish('cuts', clip({ b: {} }), [video]);
          expect(published.set).toBe('spare/cuts');
        }),
      ),
  );
});

describe('a refused publish', () => {
  it.effect("writes nothing: the set's files and its review.json stay as they were", () =>
    provided(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString('/work/one.png', 'one');
        yield* fs.writeFileString('/work/two.png', 'two');
        const { lab } = yield* labWithMcp;
        const { tool } = yield* mcpSession(lab);
        const dir = path.join(path.resolve('out'), 'faces');
        const first = yield* tool('publish_set', {
          name: 'faces',
          files: [{ from: '/work/one.png', to: 'a.png' }],
          manifest: { title: 'Faces', images: ['a.png'] },
        });
        expect(first.set).toBe('spare/faces');
        const manifest = yield* fs.readFileString(path.join(dir, 'review.json'));
        // Each publish copies two.png over a.png and into a new b.png, and names a file the folder lacks.
        const over = [
          { from: '/work/two.png', to: 'a.png' },
          { from: '/work/two.png', to: 'b.png' },
        ];
        const clip = (variants: Schema.Json) => ({ sets: { cold: { variants } } });
        for (const [manifestPatch, lacking] of [
          [{ images: ['a.png', 'b.png', 'missing.png'] }, 'missing.png'],
          [{ docs: ['missing.md'] }, 'missing.md'],
          [clip({ a: { file: 'a.mp4' } }), 'a.mp4'],
          [clip({ b: { file: 'b.png', notes: 'b.md' } }), 'b.md'],
        ] as const) {
          expect(
            (yield* tool('publish_set', { name: 'faces', files: over, manifest: manifestPatch }))
              .refused,
          ).toContain(lacking);
          expect(yield* fs.readFileString(path.join(dir, 'a.png'))).toBe('one');
          expect(yield* fs.exists(path.join(dir, 'b.png'))).toBe(false);
          expect(yield* fs.readFileString(path.join(dir, 'review.json'))).toBe(manifest);
        }
        // A name a copy brings is there: the same publish with no missing name lands whole.
        const landed = yield* tool('publish_set', {
          name: 'faces',
          files: over,
          manifest: { images: ['a.png', 'b.png'] },
        });
        expect(landed.set).toBe('spare/faces');
        expect(yield* fs.readFileString(path.join(dir, 'a.png'))).toBe('two');
        expect(yield* fs.readFileString(path.join(dir, 'b.png'))).toBe('two');
      }),
    ),
  );
});

describe('the review after an MCP write', () => {
  it.effect('lists a set published and a render recorded at its next read', () =>
    provided(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { lab } = yield* labWithMcp;
        const { tool } = yield* mcpSession(lab);
        const review = yield* Review;
        // The read a page makes: kept for a while, so a write must drop it.
        const listed = Effect.map(review.index(false), (index) =>
          index.folders.map((f) => [f.ref, f.images.length]),
        );
        expect(yield* listed).toEqual([]);
        yield* tool('publish_set', {
          name: 'judge-faces',
          files: [{ from: '/work/judge-calmer.png', to: 'calmer.png' }],
          manifest: { title: 'Judge faces', images: ['calmer.png'] },
        });
        expect(yield* listed).toEqual([['spare/judge-faces', 1]]);
        yield* fs.makeDirectory(path.resolve('out', 'f'), { recursive: true });
        yield* fs.writeFileString(path.resolve('out', 'f', 'cold.png'), 'a still');
        const recorded = yield* tool('record_render', {
          film: 'f',
          render: {
            address: { _tag: 'Film' },
            variant: 'base',
            kind: 'stills',
            settings: { scale: 1, captions: false },
            stamp: { key: 'k1' },
            files: { images: ['cold.png'] },
          },
        });
        expect(recorded.set).toBe('spare/f');
        expect((yield* listed).map(([ref]) => ref).toSorted()).toEqual([
          'spare/f',
          'spare/judge-faces',
        ]);
      }),
    ),
  );
});

describe('the sets the MCP lists', () => {
  it.effect(
    'the folders the review lists, by the kind it reads them as: one nested below the first level, a project folder by its catalogue though a manifest sits beside it; none with nothing to review, and no record that does not decode; the feed hears a nested one published',
    () =>
      provided(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const out = path.resolve('out');
          const put = (rel: string, body: string) =>
            Effect.gen(function* () {
              const file = path.join(out, rel);
              yield* fs.makeDirectory(path.dirname(file), { recursive: true });
              yield* fs.writeFileString(file, body);
            });
          yield* put('f/review.json', '{"title":"Not a montage"}');
          yield* put('f/cold.png', 'a still');
          yield* put('broken/review.json', '{"title":');
          // Records with nothing to review: a project's empty catalogue, a manifest with a title alone.
          yield* put(
            'g/catalogue.json',
            yield* Schema.encodeEffect(CatalogueJson)(emptyCatalogue('g')),
          );
          yield* put('empty/review.json', '{"title":"Nothing yet"}');
          const { lab, events } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          yield* tool('record_render', {
            film: 'f',
            render: {
              address: { _tag: 'Film' },
              variant: 'base',
              kind: 'stills',
              settings: { scale: 1, captions: false },
              stamp: { key: 'k1' },
              files: { images: ['cold.png'] },
            },
          });
          // The feed's first look takes what is there as it stands.
          yield* events.look;
          const { cursor } = yield* tool('overview');
          yield* put('stories/rbf/deep.png', 'deep');
          yield* put('stories/rbf/review.json', '{"title":"Deep","images":["deep.png"]}');
          const listed = yield* tool('sets');
          const rows = listed.sets.map((s: { set: string; kind: string; title?: string }) => [
            s.set,
            s.kind,
          ]);
          expect(rows.toSorted()).toEqual(
            [
              ['spare/f', 'project'],
              ['spare/stories/rbf', 'montage'],
            ].toSorted(),
          );
          // The same sets as the review's own index.
          const index = yield* (yield* Review).index(true);
          expect(index.folders.map((f) => f.ref).toSorted()).toEqual(
            rows.map(([set]: ReadonlyArray<string>) => set).toSorted(),
          );
          expect((yield* tool('overview')).sets.length).toBe(2);
          yield* events.look;
          const seen = yield* tool('changes', { since: cursor });
          expect(seen.changes.map((c: { kind: string; set: string }) => [c.kind, c.set])).toEqual([
            ['set.published', 'spare/stories/rbf'],
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
  it.effect(
    "refuses an image the lab does not serve, naming it; a set's files are answered where it serves them",
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          const published = yield* tool('publish_set', {
            name: 'judge-faces',
            files: [{ from: '/work/judge-calmer.png', to: 'calmer.png' }],
            manifest: { title: 'Judge faces', images: ['calmer.png'] },
          });
          const served = {
            file: 'calmer.png',
            ref: 'spare/judge-faces/calmer.png',
            src: '/api/review/files/spare/judge-faces/calmer.png',
            links: {
              local: `${MCP_BASE}api/review/files/spare/judge-faces/calmer.png`,
              phone: `${MCP_PHONE}api/review/files/spare/judge-faces/calmer.png`,
            },
          };
          expect(published.files).toEqual([served]);
          expect((yield* tool('set', { set: 'spare/judge-faces' })).files).toEqual([served]);
          const showing = (src: string) =>
            tool('ask', {
              title: 'Which judge?',
              why: 'the cold open keeps one',
              by: 'agent',
              blocks: [
                { kind: 'image', image: { src: '/api/films/f/board/files/cold.judge.1.png' } },
                {
                  kind: 'choose',
                  id: 'pick',
                  label: 'Pick one',
                  options: [
                    { value: '1', label: 'Try 1', recommended: true, why: 'it reads' },
                    { value: '2', label: 'Calmer', image: { src } },
                  ],
                },
              ],
            });
          // A path the page would 404 on: the set's page, a file the set lacks, a board's missing try.
          for (const src of [
            '/api/sets/spare%2Fjudge-faces/images/calmer.png',
            '/api/review/files/spare/judge-faces/missing.png',
            '/api/films/f/board/files/cold.judge.9.png',
          ])
            expect((yield* showing(src)).refused).toContain(
              `image ${src}: the lab serves no image there`,
            );
          expect((yield* tool('asks', {})).asks).toEqual([]);
          // The set's own answer is served, and so is a try on the board.
          expect(yield* showing(published.files[0].src)).toMatchObject({ status: 'asking' });
        }),
      ),
  );

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
        const keyOnly = yield* tool('ask', {
          ...who,
          machine: {
            start: 'a',
            steps: {
              a: { blocks: [{ kind: 'prose', text: 'a' }], next: [{ to: 'done' }] },
              constructor: { end: true },
              done: { end: true },
            },
          },
        });
        const { message: keyRefused } = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Struct({ message: Schema.String })),
        )(keyOnly.refused);
        expect(keyRefused).toContain("Invalid parameters for tool 'ask'");
        expect(keyRefused).toContain('every object answers to "constructor"');
        expect(keyRefused).toContain('at ["machine"]["steps"]["constructor"]');
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
        // Its page: it opened one, and its page's links are the ones to hand the owner.
        expect(one.onPage).toBe(`opened page ${one.ask}`);
        expect(one.page).toEqual({
          id: one.ask,
          links: {
            local: `${MCP_BASE}asks/page/${one.ask}`,
            phone: `${MCP_PHONE}asks/page/${one.ask}`,
          },
        });
        // The next ask from the same asker, while the first still asks, joins its page.
        const name = [{ kind: 'free_text', id: 'name', label: 'And its sequel?' }];
        const two = yield* tool('ask', { ...who, blocks: name });
        expect(two.onPage).toBe(`joined page ${one.ask}, 2 asks`);
        expect(two.page).toEqual(one.page);
        expect(two.links.local).toBe(`${MCP_BASE}asks/${two.ask}`);
        // Another asker opens a page of its own; `page: "new"` does too; `page` names one to join.
        const other = yield* tool('ask', { ...who, by: 'painter', blocks: name });
        expect(other.onPage).toBe(`opened page ${other.ask}`);
        const fresh = yield* tool('ask', { ...who, blocks: name, page: 'new' });
        expect(fresh.onPage).toBe(`opened page ${fresh.ask}`);
        const named = yield* tool('ask', { ...who, by: 'painter', blocks: name, page: two.ask });
        expect(named.onPage).toBe(`joined page ${one.ask}, 3 asks`);
        expect((yield* tool('ask', { ...who, blocks: name, page: 'a0000000000' })).refused).toBe(
          'no ask a0000000000 whose page to join: `asks` lists them',
        );
        // The asks list names each ask's page (made at one clock time, so their order is not told).
        const pages = new Map(
          (yield* tool('asks', { status: 'asking' })).asks.map(
            (a: { ask: string; page: { id: string } }) => [a.ask, a.page.id],
          ),
        );
        expect(pages).toEqual(
          new Map([
            [one.ask, one.ask],
            [two.ask, one.ask],
            [other.ask, other.ask],
            [fresh.ask, fresh.ask],
            [named.ask, one.ask],
          ]),
        );
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
                          outcome: 'keep',
                          keeps: { film: 'f', scenes: [] },
                        },
                        {
                          value: 'calm',
                          label: 'Calmer',
                          image: { src: '/api/review/files/spare/judge-faces/calmer.png' },
                          outcome: 'keep',
                          keeps: { film: 'f', scenes: [] },
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
          // The ask's own events: its filing on the timeline is a `production.asked` beside them.
          const heard = yield* tool('changes', { since: cursor, name: ['ask.*'] });
          expect(
            heard.changes.map(
              (c: {
                kind: string;
                ask: string;
                step: string;
                answers: unknown;
                links: { local: string };
              }) => [c.kind, c.ask, c.step, c.answers, c.links.local],
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
          ).toEqual([
            ['ask.closed', 'kept the calmer judge'],
            // Its filing, heard on the timeline.
            ['production.decided', `Which judge? (ask ${made.ask}): try: Calmer · why: he listens`],
          ]);
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

/** `film production`, `film lab <command>` and `film lab events` as the CLI serves them, this checkout's films folder `/films`. */
const filmCommand = Command.make('film').pipe(
  Command.withSubcommands([
    production,
    Command.make('lab').pipe(Command.withSubcommands(labSubcommands('/films'))),
  ]),
);

/** The terminal `film …` runs in against the lab at `MCP_BASE`, its requests answered by `fetch`, and printing to `console`. */
const onTerminal =
  (fetch: (request: Request) => Promise<Response>, console: Console.Console) =>
  <A, E, R>(run: Effect.Effect<A, E, R>) =>
    run.pipe(
      Effect.provideService(Console.Console, console),
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
      Effect.provide(
        Layer.mergeAll(
          Stdio.layerTest({}),
          formatAsIs,
          BunTerminal.layer,
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({ FILM_LAB_URL: MCP_BASE, FILM_LAB_PHONE_URL: MCP_PHONE }),
          ),
        ),
      ),
    );

/**
 * `film …args` run to its end against the lab at `MCP_BASE`, its requests
 * answered by `fetch` (the lab's handler, or no lab at all): whether it
 * succeeded, its printed lines, and its failure's words.
 */
const filmCli = (fetch: (request: Request) => Promise<Response>, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const lines = yield* Queue.unbounded<string>();
    const exit = yield* Effect.exit(
      Command.runWith(filmCommand, { version: '0' })(args).pipe(
        onTerminal(fetch, printingTo(lines)),
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

/**
 * `film …args` running against the lab at `MCP_BASE`, its requests answered
 * by `fetch`: each line it prints offered to `out` as printed, each it says
 * on stderr to `err`, until its fiber is interrupted.
 */
const filmRunning = (fetch: (request: Request) => Promise<Response>, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const out = yield* Queue.unbounded<string>();
    const err = yield* Queue.unbounded<string>();
    const console: Console.Console = {
      ...printingTo(out),
      error: (...words: ReadonlyArray<unknown>) => {
        Queue.offerUnsafe(err, words.map(String).join(' '));
      },
    };
    const fiber = yield* Effect.forkChild(
      Command.runWith(filmCommand, { version: '0' })(args).pipe(onTerminal(fetch, console)),
    );
    return { out, err, fiber };
  });

/** A request on a line that is down. */
class LineDown extends Schema.TaggedError<LineDown>()('LineDown', {}) {}

/**
 * The lab's handler behind a line that can drop: `drop` fails every request
 * in flight and each one after it, as a lab restarted or a network gone
 * does, until `restore`.
 */
const droppable = (lab: LabFetch) =>
  Effect.map(SubscriptionRef.make(false), (down) => ({
    fetch: (request: Request) =>
      Effect.runPromise(
        Effect.raceFirst(
          Effect.promise(() => lab(request, mcpBound)),
          SubscriptionRef.changes(down).pipe(
            Stream.filter((isDown) => isDown),
            Stream.runHead,
            Effect.andThen(Effect.fail(LineDown.make())),
          ),
        ),
      ),
    drop: SubscriptionRef.set(down, true),
    restore: SubscriptionRef.set(down, false),
  }));

/**
 * The lab's handler behind a line that drops only its feed's polls: `drop`
 * fails each `changes` call in flight and each one after it, as a lab whose
 * feed hangs up does, while every other request is answered.
 */
const pollsDroppable = (lab: LabFetch) =>
  Effect.map(SubscriptionRef.make(false), (down) => ({
    fetch: (request: Request) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const asked = yield* Effect.promise(() => request.clone().text());
          const answer = Effect.promise(() => lab(request, mcpBound));
          if (!asked.includes('"name":"changes"')) return yield* answer;
          return yield* Effect.raceFirst(
            answer,
            SubscriptionRef.changes(down).pipe(
              Stream.filter((isDown) => isDown),
              Stream.runHead,
              Effect.andThen(Effect.fail(LineDown.make())),
            ),
          );
        }),
      ),
    drop: SubscriptionRef.set(down, true),
  }));

/** A change as the lab's feed answers it, edited by a test. */
type ChangeJson = { readonly [key: string]: Schema.Json };

/** A `changes` answer as JSON-RPC carries it: its result's structured content. */
const ChangesAnswer = Schema.fromJsonString(
  Schema.Struct({
    jsonrpc: Schema.String,
    id: Schema.Json,
    result: Schema.Struct({
      structuredContent: Schema.Struct({
        cursor: Schema.String,
        changes: Schema.Array(Schema.Record(Schema.String, Schema.Json)),
        reset: Schema.Boolean,
      }),
    }),
  }),
);
const changesAnswer = Schema.decodeUnknownOption(ChangesAnswer);

/**
 * The lab's handler with each `changes` answer's result passed through
 * `edit` (its structured content, and its text the same): the feed of a
 * lab that runs other code than this checkout.
 */
const changesEdited =
  (lab: LabFetch, edit: (result: { readonly changes: ReadonlyArray<ChangeJson> }) => Schema.Json) =>
  (request: Request) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const asked = yield* Effect.promise(() => request.clone().text());
        const answered = yield* Effect.promise(() => lab(request, mcpBound));
        if (!asked.includes('"name":"changes"')) return answered;
        const body = yield* Effect.promise(() => answered.text());
        // The answer's one message with a result, the whole body or an event stream's `data:` line.
        const { jsonrpc, id, result } = yield* Effect.fromOption(
          Arr.findFirst(
            [body, ...Array.from(body.matchAll(/^data: (.*)$/gm), (data) => data[1] ?? '')],
            (message) => changesAnswer(message),
          ),
        );
        const edited = edit(result.structuredContent);
        return new Response(
          writeJson({
            jsonrpc,
            id,
            result: {
              structuredContent: edited,
              content: [{ type: 'text', text: writeJson(edited) }],
            },
          }),
          { status: answered.status, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

/** A `changes` call's `name` and `film` arguments, wherever they sit in the call's JSON. */
const FILTER_ARGUMENT =
  /,"(?:name|film)":(?:\[[^\]]*\]|"[^"]*")|"(?:name|film)":(?:\[[^\]]*\]|"[^"]*"),?/g;

/**
 * The lab's handler as an older lab answers `changes`: it reads no `name` or
 * `film` (its tool took only `since` and `wait`), and its changes carry no
 * `id` or `read`.
 */
const olderLab = (lab: LabFetch) =>
  changesEdited(
    (request, server) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const asked = yield* Effect.promise(() => request.clone().text());
          if (!asked.includes('"name":"changes"'))
            return yield* Effect.promise(() => lab(request, server));
          const unfiltered = asked.replace(/"arguments":\{[^}]*\}/, (args) =>
            args.replace(FILTER_ARGUMENT, ''),
          );
          return yield* Effect.promise(() =>
            lab(
              new Request(request.url, {
                method: request.method,
                headers: request.headers,
                body: unfiltered,
              }),
              server,
            ),
          );
        }),
      ),
    (result) => ({
      ...result,
      changes: result.changes.map(({ id: _id, read: _read, ...rest }) => rest),
    }),
  );

/** A request on a line that is down, counted on `attempts` as it is made. */
const countedDroppable = (lab: LabFetch) =>
  Effect.gen(function* () {
    const line = yield* droppable(lab);
    const attempts = yield* Queue.unbounded<true>();
    const down = yield* SubscriptionRef.make(false);
    return {
      fetch: (request: Request) =>
        Effect.runPromise(
          Effect.andThen(
            Effect.when(Queue.offer(attempts, true), SubscriptionRef.get(down)),
            Effect.promise(() => line.fetch(request)),
          ),
        ),
      attempts,
      drop: Effect.andThen(SubscriptionRef.set(down, true), line.drop),
      restore: Effect.andThen(SubscriptionRef.set(down, false), line.restore),
    };
  });

/** A `film lab events` line's cursor (`cursor=<epoch>.<seq>`). */
const cursorIn = (line: string) =>
  Option.getOrThrow(Option.fromNullishOr(/ cursor=(\S+)/.exec(line)?.[1]));

describe('film lab events', () => {
  it.effect(
    'follows the lab: a line per event as the lab sees it, flushed as each is printed; without --follow, the events past a cursor',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab, events } = yield* labWithMcp;
          const fetch = (request: Request) => lab(request, mcpBound);
          const { out, err, fiber } = yield* filmRunning(fetch, [
            'lab',
            'events',
            '--follow',
            '--film',
            'f',
            '--name',
            'note.*',
          ]);
          expect(yield* Queue.take(err)).toMatch(
            /^lab events: following http:\/\/localhost:4401\/ from \w+\.\d+$/,
          );
          expect((yield* ownerNote(lab, 'the judge looks away too soon')).status).toBe(200);
          yield* events.look;
          const first = yield* Queue.take(out);
          expect(first).toMatch(
            /^note\.added cursor=\w+\.1 at=\S+ id=[0-9a-f]{16} film=f note=n1 summary="[^"]*the judge looks away too soon[^"]*" read="bun cli\.ts lab notes --film f --status all" link=http:\/\/localhost:4401\/films\/f\/studio\?sel=beat%3Acold&note=n1$/,
          );
          expect((yield* ownerNote(lab, 'and the hand is late')).status).toBe(200);
          yield* events.look;
          const second = yield* Queue.take(out);
          expect(second).toMatch(/^note\.added cursor=\w+\.2 .* note=n2 /);
          yield* Fiber.interrupt(fiber);
          // The events past the first line's cursor, as JSON, then the cursor to read on from.
          const past = yield* filmCli(fetch, [
            'lab',
            'events',
            '--since',
            cursorIn(first),
            '--json',
          ]);
          expect(past.failed).toBe('');
          const [event, end] = yield* Effect.forEach(past.lines, (line) => readJson(line));
          expect(event).toMatchObject({
            cursor: cursorIn(second),
            event: { kind: 'note.added', film: 'f', note: 'n2', text: 'and the hand is late' },
          });
          expect(end).toEqual({ cursor: cursorIn(second) });
          expect(past.lines).toHaveLength(2);
          // The full record each line's `read` names: every note a line, then the log's last change.
          const read = yield* filmCli(fetch, ['lab', 'notes', '--film', 'f', '--status', 'all']);
          expect(read.failed).toBe('');
          expect(read.lines).toHaveLength(3);
          expect(read.lines[0]).toMatch(
            /^note id=n1 seq=1 status=open scene=cold T=1\.00 frame=30 replies=0 still=\/\S+\/n1\.png text="the judge looks away too soon"$/,
          );
          expect(read.lines[2]).toBe('seq=2');
        }),
      ),
  );

  it.effect(
    'says on stderr when the lab is lost, reconnects, and reads on from its cursor: nothing missed while it was away',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab, events } = yield* labWithMcp;
          const line = yield* droppable(lab);
          const { out, err, fiber } = yield* filmRunning(line.fetch, ['lab', 'events', '--follow']);
          expect(yield* Queue.take(err)).toContain('lab events: following');
          yield* ownerNote(lab, 'one');
          yield* events.look;
          const first = yield* Queue.take(out);
          expect(first).toMatch(/^note\.added .* note=n1 /);
          yield* line.drop;
          expect(yield* Queue.take(err)).toMatch(
            /^lab events: lost the lab \(no lab answered at .*\); asking again$/,
          );
          // What the owner does while the line is down, the lab keeps.
          yield* ownerNote(lab, 'two');
          yield* events.look;
          yield* line.restore;
          yield* TestClock.adjust('1 second');
          expect(yield* Queue.take(err)).toBe(
            `lab events: reconnected to ${MCP_BASE}, reading on from ${cursorIn(first)}`,
          );
          expect(yield* Queue.take(out)).toMatch(/^note\.added .* note=n2 /);
          expect(yield* Queue.size(err)).toBe(0);
          yield* Fiber.interrupt(fiber);
        }),
      ),
  );
});

describe('film lab events, against a lab that runs other code', () => {
  it.effect(
    'prints an event of a kind this checkout does not know from the fields every event has, says so once, and reads on',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab, events } = yield* labWithMcp;
          // A newer lab's feed: a note whose words are `pinned` is told as a `note.pinned`, a field this checkout has not with it.
          const newer = changesEdited(lab, (result) => ({
            ...result,
            changes: result.changes.map((change) =>
              Option.match(
                Option.liftPredicate(change, (c) => c['text'] === 'pinned'),
                {
                  onNone: () => change,
                  onSome: (c) => ({ ...c, kind: 'note.pinned', pin: 'top' }),
                },
              ),
            ),
          }));
          const { out, err, fiber } = yield* filmRunning(newer, ['lab', 'events', '--follow']);
          expect(yield* Queue.take(err)).toContain('lab events: following');
          yield* ownerNote(lab, 'one');
          yield* events.look;
          expect(yield* Queue.take(out)).toMatch(/^note\.added cursor=\w+\.1 .* note=n1 /);
          yield* ownerNote(lab, 'pinned');
          yield* events.look;
          expect(yield* Queue.take(out)).toMatch(
            /^note\.pinned cursor=\w+\.2 at=\S+ id=[0-9a-f]{16} film=f note=n2 summary="f n2: note on scene cold: pinned" read="bun cli\.ts lab notes --film f --status all" link=http:\/\/localhost:4401\/\S+$/,
          );
          expect(yield* Queue.take(err)).toBe(
            'lab events: note.pinned is an event this checkout does not know (the lab runs other code): printed from the fields every event has',
          );
          yield* ownerNote(lab, 'pinned');
          yield* events.look;
          expect(yield* Queue.take(out)).toMatch(/^note\.pinned cursor=\w+\.3 .* note=n3 /);
          yield* ownerNote(lab, 'two');
          yield* events.look;
          expect(yield* Queue.take(out)).toMatch(/^note\.added cursor=\w+\.4 .* note=n4 /);
          // Said once for its kind, and no loss said.
          expect(yield* Queue.size(err)).toBe(0);
          yield* Fiber.interrupt(fiber);
        }),
      ),
  );

  it.effect(
    'keeps only the names and the film it asked for, against an older lab that reads no filter, and says the shape once',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab, events } = yield* labWithMcp;
          const { out, err, fiber } = yield* filmRunning(olderLab(lab), [
            'lab',
            'events',
            '--follow',
            '--film',
            'f',
            '--name',
            'note.resolved',
          ]);
          expect(yield* Queue.take(err)).toContain('lab events: following');
          yield* ownerNote(lab, 'one');
          yield* events.look;
          const fetch = (request: Request) => lab(request, mcpBound);
          expect(
            (yield* filmCli(fetch, ['lab', 'resolve', '--film', 'f', '--note', 'n1'])).failed,
          ).toBe('');
          yield* events.look;
          // The note made is not asked for, so the first line is the note done.
          expect(yield* Queue.take(out)).toMatch(
            /^note\.resolved cursor=\w+\.2 at=\S+ film=f note=n1 /,
          );
          expect(yield* Queue.take(err)).toBe(
            'lab events: note.resolved came in a shape this checkout does not read (the lab runs other code): printed from the fields every event has',
          );
          expect(yield* Queue.size(out)).toBe(0);
          yield* Fiber.interrupt(fiber);
        }),
      ),
  );

  it.effect(
    'ends, non-zero and in its own words, on an answer it cannot read: never told as a lab lost',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const garbled = changesEdited(lab, () => ({ changes: 'garbled' }));
          const plain = yield* filmCli(garbled, ['lab', 'events']);
          expect(plain.ok).toBe(false);
          expect(plain.failed).toContain('the two run different code, so update the older one');
          const json = yield* filmCli(garbled, ['lab', 'events', '--follow', '--json']);
          expect(json.ok).toBe(false);
          expect(yield* readJson(json.lines.at(-1))).toMatchObject({ _tag: 'LabAnswerUnread' });
        }),
      ),
  );

  it.effect(
    'refuses a --name no event matches and a --film the lab has not, naming what there is',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const fetch = (request: Request) => lab(request, mcpBound);
          const name = yield* filmCli(fetch, ['lab', 'events', '--name', 'nope.*']);
          expect(name.ok).toBe(false);
          expect(name.failed).toMatch(/no event matches nope\.\*: the lab's are .*note\.added/);
          const film = yield* filmCli(fetch, ['lab', 'events', '--follow', '--film', 'zz']);
          expect(film.ok).toBe(false);
          expect(film.failed).toContain('zz');
        }),
      ),
  );
});

describe("film lab events' outages", () => {
  it.effect(
    '--gone-after counts from the first loss, though each try opens a session: gone, said as JSON with --json',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const line = yield* pollsDroppable(lab);
          const { out, err, fiber } = yield* filmRunning(line.fetch, [
            'lab',
            'events',
            '--follow',
            '--json',
            '--gone-after',
            '5 seconds',
          ]);
          expect(yield* Queue.take(err)).toContain('lab events: following');
          yield* line.drop;
          expect(yield* Queue.take(err)).toMatch(/^lab events: lost the lab /);
          // Each try opens a session and its poll is lost again: the try past 5 s since the first loss
          // (250 ms, 500 ms, 1 s, 2 s, 4 s after one another) ends it.
          yield* TestClock.adjust('10 seconds');
          expect(Exit.isFailure(yield* Fiber.await(fiber))).toBe(true);
          expect(yield* Queue.take(err)).toMatch(/^lab events: reconnected to /);
          expect(yield* readJson(yield* Queue.take(out))).toMatchObject({
            _tag: 'LabGone',
            message: expect.stringMatching(
              /^the lab has not answered for 7s 750ms \(no lab answered at /,
            ),
          });
        }),
      ),
  );

  it.effect(
    'asks a lab lost after a session that worked again at once: the backoff starts over',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab, events } = yield* labWithMcp;
          const line = yield* countedDroppable(lab);
          const { out, err, fiber } = yield* filmRunning(line.fetch, ['lab', 'events', '--follow']);
          expect(yield* Queue.take(err)).toContain('lab events: following');
          // A long outage: the tries back off to their 10 s cap.
          yield* line.drop;
          expect(yield* Queue.take(err)).toMatch(/^lab events: lost the lab /);
          for (let n = 0; n < 7; n++) {
            yield* TestClock.adjust('10 seconds');
            yield* Queue.take(line.attempts);
          }
          yield* line.restore;
          yield* TestClock.adjust('10 seconds');
          expect(yield* Queue.take(err)).toMatch(/^lab events: reconnected to /);
          // A session that works.
          yield* ownerNote(lab, 'one');
          yield* events.look;
          expect(yield* Queue.take(out)).toMatch(/^note\.added .* note=n1 /);
          // Lost again: asked again within the schedule's first step, not its cap.
          yield* line.drop;
          expect(yield* Queue.take(err)).toMatch(/^lab events: lost the lab /);
          yield* line.restore;
          yield* TestClock.adjust('300 millis');
          expect(yield* Queue.take(err)).toMatch(/^lab events: reconnected to /);
          yield* Fiber.interrupt(fiber);
        }),
      ),
  );
});

describe('a set a terminal published', () => {
  /** `film …args` in a terminal of its own: its own review (a layer of its own, so built anew), as another process has, beside the lab's. */
  const elsewhere = (lab: LabFetch, args: ReadonlyArray<string>) =>
    filmCli((request) => lab(request, mcpBound), args).pipe(Effect.provide(reviewAt([])));

  const publishNotes = (lab: LabFetch) =>
    Effect.gen(function* () {
      yield* (yield* FileSystem.FileSystem).writeFileString('/work/notes.md', '# The judge\n');
      return yield* elsewhere(lab, [
        'lab',
        'publish_set',
        '--name',
        'judge-notes',
        '--files',
        writeJson([{ from: '/work/notes.md', to: 'notes.md' }]),
        '--manifest',
        writeJson({ title: 'Judge notes', docs: ['notes.md'] }),
      ]);
    });

  it.effect(
    'an ask about it right after, in another terminal, is taken: the lab reads its index again',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          // The lab has read its index, and keeps it.
          expect((yield* (yield* Review).index(false)).folders).toEqual([]);
          expect((yield* publishNotes(lab)).failed).toBe('');
          const blocks: Schema.Json = [
            { kind: 'document', ref: 'spare/judge-notes/notes.md' },
            {
              kind: 'choose',
              id: 'keep',
              label: 'Keep the notes?',
              options: [
                { value: 'yes', label: 'Yes', recommended: true, why: 'they read' },
                { value: 'no', label: 'No' },
              ],
            },
          ];
          const asked = yield* filmCli(
            (request) => lab(request, mcpBound),
            [
              'lab',
              'ask',
              '--title',
              'The notes?',
              '--why',
              'they go with the board',
              '--by',
              'agent',
              '--blocks',
              writeJson(blocks),
            ],
          );
          expect(asked.failed).toBe('');
          expect(asked.lines[0]).toMatch(/^asked a[0-9a-f]+/);
        }),
      ),
  );

  it.effect(
    'the lab drops its index once its feed sees the set, so the page lists it at its next read',
    () =>
      provided(
        Effect.gen(function* () {
          const { lab, events } = yield* labWithMcp;
          const review = yield* Review;
          const listed = Effect.map(review.index(false), (index) =>
            index.folders.map((f) => f.ref),
          );
          expect(yield* listed).toEqual([]);
          expect((yield* publishNotes(lab)).failed).toBe('');
          yield* events.look;
          expect((yield* events.since(Option.none())).cursor).toMatch(/\.1$/);
          expect(yield* listed).toEqual(['spare/judge-notes']);
        }),
      ),
  );
});

describe('film lab ask', () => {
  it.effect(
    'asks the running lab from its blocks, filed on the timeline with its choice, and prints its links',
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
          const published = yield* tool('publish_set', {
            name: 'judge-faces',
            files: [{ from: '/work/judge-calmer.png', to: 'calmer.png' }],
            manifest: { title: 'Judge faces', images: ['calmer.png'] },
          });
          const blocks: Schema.Json = [
            {
              kind: 'choose',
              id: 'pick',
              label: 'Pick one',
              options: [
                {
                  value: '1',
                  label: 'Try 1',
                  recommended: true,
                  why: 'the first reads',
                  outcome: 'other',
                },
                {
                  value: '2',
                  label: 'Calmer',
                  image: { src: published.files[0].src },
                  outcome: 'other',
                },
              ],
            },
            { kind: 'free_text', id: 'note', label: 'Anything else?' },
          ];
          const asked = yield* filmCli(
            (request) => lab(request, mcpBound),
            [
              'lab',
              'ask',
              '--title',
              'Which judge?',
              '--why',
              'the cold open keeps one',
              '--by',
              'agent',
              '--blocks',
              writeJson(blocks),
              '--production',
              'f',
              '--set',
              'spare/judge-faces',
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
            `asked ${made.ask} on f: waits on its timeline at spare/judge-faces, render:cold`,
            `opened page ${made.ask}`,
            `local ${MCP_BASE}asks/page/${made.ask}`,
            `phone ${MCP_PHONE}asks/page/${made.ask}`,
            `then: bun cli.ts ask wait ${made.ask} in the background (it exits once answered, with the answers; --page ${made.ask} for every ask on the page); close_ask it once acted on`,
          ]);
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
          // `--json` prints the answer the MCP answers, one line.
          const read = yield* filmCli(
            (request) => lab(request, mcpBound),
            ['lab', 'ask_read', '--ask', made.ask, '--json'],
          );
          expect(yield* readJson(read.lines.join('\n'))).toEqual(
            yield* tool('ask_read', { ask: made.ask }),
          );
        }),
      ),
  );

  it.effect(
    "refuses in the lab's words, reads its input as the MCP does, and says when no lab answers",
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          const atLab = (request: Request) => lab(request, mcpBound);
          const who = ['--title', 'Q?', '--why', 'w', '--by', 'agent'];
          const elsewhere = yield* filmCli(atLab, [
            'lab',
            'ask',
            ...who,
            '--blocks',
            '[]',
            '--production',
            'nope',
          ]);
          expect(elsewhere.failed).toBe(
            'LabToolRefused: the lab refused ask: no production nope: film production new nope --title "<title>"',
          );
          // Input the command's parameters do not read is refused here, in the words MCP says it.
          const unread = yield* filmCli(atLab, ['lab', 'ask', ...who, '--blocks', '{"kind":1}']);
          expect(unread.failed).toContain("LabInputInvalid: Invalid parameters for tool 'ask'");
          const noJson = yield* filmCli(atLab, ['lab', 'ask', ...who, '--blocks', '[oops']);
          expect(noJson.failed).toBe('LabCommandRefused: --blocks is not JSON: "[oops"');
          expect((yield* tool('asks', {})).asks).toEqual([]);
          const down = yield* filmCli(
            // oxlint-disable-next-line effect/noNewPromise, effect/noNewError -- fetch's own contract: a closed port rejects with a TypeError
            () => Promise.reject(new TypeError('Unable to connect')),
            ['lab', 'ask', ...who, '--blocks', '[]'],
          );
          expect(down.ok).toBe(false);
          expect(down.failed).toMatch(
            /^LabUnanswered: no lab answered at http:\/\/localhost:4401\/ \(.*\): start one \(from apps\/animations: bun run lab, or LAB_PORT=<port> bun cli\.ts lab\) and point FILM_LAB_URL at it$/,
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
            links: {
              local: `${MCP_BASE}productions/f?v=1`,
              phone: `${MCP_PHONE}productions/f?v=1`,
            },
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
            links: {
              local: `${MCP_BASE}productions/f?v=2`,
              phone: `${MCP_PHONE}productions/f?v=2`,
            },
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
          // `film lab note --by` files the same word; the ledger prints who filed each.
          const cli = (args: ReadonlyArray<string>) =>
            filmCli((request) => lab(request, mcpBound), args);
          yield* cli([
            'lab',
            'note',
            '--production',
            'f',
            '--text',
            'Warmer',
            '--quote',
            'warmer still',
            '--by',
            'coordinator',
          ]);
          expect((yield* cli(['production', 'show', 'f'])).lines).toEqual(
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
          // `film lab decide` files through the same store, so it refuses the same word.
          const cli = (args: ReadonlyArray<string>) =>
            filmCli((request) => lab(request, mcpBound), args);
          const said = ['--production', 'f', '--text', 'x', '--quote', 'x', '--by', 'painter'];
          expect((yield* cli(['lab', 'decide', ...said, '--point', 'render:cold'])).failed).toBe(
            'LabCommandRefused: `point` is a choice in a set: name the `set`',
          );
          expect(
            (yield* cli(['lab', 'note', ...said, '--set', 'judge-faces', '--variant', 'calm']))
              .failed,
          ).toBe("LabCommandRefused: `variant` is one of a choice's: name the `point`");
          expect(Option.getOrThrow(yield* (yield* ProductionStore).read('f')).said).toEqual([]);
        }),
      ),
  );

  it.effect('moves a production forward only on the decision of his it names', () =>
    provided(
      Effect.gen(function* () {
        const { lab } = yield* labWithMcp;
        const { tool } = yield* mcpSession(lab);
        yield* productionWithSet(tool);
        const productions = yield* ProductionStore;
        yield* productions.start('g', {
          title: 'G',
          film: Option.none(),
          blurb: Option.none(),
          first: 'v1',
          at: 0,
        });
        const word = { production: 'f', by: 'painter' };
        const undecided = (v: number) =>
          `f v${v} holds no decision of the owner's: file the word he gave with \`decide\` (his own words, verbatim), or ask him (\`ask\`), then move forward`;
        const unknown = (v: number, at: number, held: ReadonlyArray<readonly [number, string]>) =>
          `f v${v} holds no decision of the owner's at ${at}: name one it holds by its \`at\`: ${held.map(([a, t]) => `${a} "${t}"`).join(', ')}`;
        const filedAt = (answer: { readonly said: { readonly at: number } }) => answer.said.at;
        const move = (decision: number, after = 1) => ({
          production: 'f',
          after,
          title: 'The calm judge',
          decision,
        });
        expect((yield* tool('forward', move(0))).refused).toBe(undecided(1));
        // A note decides nothing.
        const noted = filedAt(
          yield* tool('note', { ...word, text: 'Warmer', quote: 'warm it up' }),
        );
        expect((yield* tool('forward', move(noted))).refused).toBe(undecided(1));
        yield* TestClock.adjust('1 minute');
        const cold = filedAt(
          yield* tool('decide', { ...word, text: 'The cold judge', quote: 'the cold one' }),
        );
        yield* TestClock.adjust('1 minute');
        const calmer = filedAt(
          yield* tool('decide', { ...word, text: 'Warmer title card', quote: 'and warm the card' }),
        );
        const held = [
          [calmer, 'Warmer title card'],
          [cold, 'The cold judge'],
        ] as const;
        // A time that is no decision of his (the note's), and another production's decision.
        expect((yield* tool('forward', move(noted))).refused).toBe(unknown(1, noted, held));
        yield* TestClock.adjust('1 minute');
        const elsewhere = filedAt(
          yield* tool('decide', { ...word, production: 'g', text: 'G moves', quote: 'move g' }),
        );
        expect((yield* tool('forward', move(elsewhere))).refused).toBe(unknown(1, elsewhere, held));
        yield* TestClock.adjust('1 minute');
        // The decision named, not the newest: the move is on the cold judge.
        expect(yield* tool('forward', move(cold))).toEqual({
          production: 'f',
          version: 2,
          title: 'The calm judge',
          because: 'The cold judge',
          links: {
            local: `${MCP_BASE}productions/f?v=2`,
            phone: `${MCP_PHONE}productions/f?v=2`,
          },
        });
        expect((yield* tool('forward', move(cold))).refused).toBe(
          'f is at v2 now, not v1: read it again before moving forward',
        );
        // The decision moved it into v2: v2 holds none of its own yet, and v1's is not v2's.
        expect((yield* tool('forward', move(cold, 2))).refused).toBe(undecided(2));
        yield* TestClock.adjust('1 minute');
        const next = filedAt(
          yield* tool('decide', { ...word, text: 'The animatic', quote: 'on to the animatic' }),
        );
        expect((yield* tool('forward', move(cold, 2))).refused).toBe(
          unknown(2, cold, [[next, 'The animatic']]),
        );
        expect((yield* tool('forward', { ...move(cold), production: 'nope' })).refused).toBe(
          'no production nope: film production new nope --title "<title>"',
        );
        const file = Option.getOrThrow(yield* productions.read('f'));
        expect(file.versions.map((v) => [v.title, v.because])).toEqual([
          ['the board', Option.none()],
          ['The calm judge', Option.some('The cold judge')],
        ]);
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
            content: `f n1: note on scene cold: the light comes up too fast\n${MCP_BASE}films/f/studio?sel=beat%3Acold&note=n1\n${MCP_PHONE}films/f/studio?sel=beat%3Acold&note=n1`,
            meta: { kind: 'note.added', film: 'f', note: 'n1', by: 'owner', seq: '1' },
          },
        });
        yield* Queue.end(stdin);
        yield* Fiber.interrupt(running);
      }),
    ),
  );
});
