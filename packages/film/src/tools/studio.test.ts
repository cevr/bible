// The lab's studio routes as its panel calls them, over fakes: the beats with
// their sheet text and take state; a recording posted for a beat, imported
// through the same pipeline as `takes import` and remixed; a mismatch refused
// with the attempt it saved, then kept on "accept anyway"; the attempts
// listed and played back. No network, no ffmpeg.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, type FileSystem, Layer, Option, Path, Schema } from 'effect';
import { Base64 } from 'effect/encoding';
import { HttpPlatform } from 'effect/http';
import { labUrls } from '../core/api.ts';
import { hashText, voiceKey } from '../core/narration.ts';
import { type Timed, type Timings, TimingsJson } from '../core/schema.ts';
import { STUDIO_MAX_BODY, StudioAttempts, StudioBeats, StudioTake } from '../core/studio.ts';
import { ContentStore } from './content-store.ts';
import { TakeMismatch } from '../core/refusals.ts';
import { RenderCatalogue } from './catalogue.ts';
import { Choices } from './choices.ts';
import { FilmFolder, FilmName, FilmRepo } from './film-repo.ts';
import { pointIdOf } from '../core/point.ts';
import { labHandler } from './lab.ts';
import { readingOf } from './read-cli.ts';
import { NO_SCORES } from './media-store.ts';
import { NotesStore } from './notes-store.ts';
import { SourceWriter } from './source-writer.ts';
import { StudioReadings } from './studio.ts';
import { Takes } from './takes.ts';
import {
  emptyCalls,
  fakeElevenLabs,
  fakeMedia,
  formatAsIs,
  freshFilm,
  keepVoiceHere,
  memoryFileSystem,
  echoPages,
  noRenders,
  noScenes,
  storeLayer,
  testFilm,
  testVoice,
  text,
  voicesHere,
} from './testing.ts';

const scenes: ReadonlyArray<Timed> = [
  { id: 'a', say: 'Hello {wave} world.' },
  { id: 'quiet' },
  { id: 'b', say: 'He said “be still” to them.' },
];

const staged: Timings = {
  voice: voiceKey(testVoice),
  scenes: {
    a: {
      hash: hashText('Hello world.'),
      file: 'a.mp3',
      duration: 1,
      words: [],
      source: 'elevenlabs',
    },
  },
};

const film = testFilm(scenes, staged);
const FILM = Schema.decodeSync(FilmName)('test');

const setup = (
  recorded: ReadonlyMap<string, string>,
  /** What `film mix` does beside being counted: a test that times the mixes slows it. */
  remixing: Effect.Effect<void> = Effect.void,
  /** What stands around each fresh keep of `beat`: a test that times the keeps marks them. */
  keeping: <A, E>(beat: string, keep: Effect.Effect<A, E>) => Effect.Effect<A, E> = (_, keep) =>
    keep,
) => {
  const files = new Map<string, Uint8Array>([
    [film.paths.timings.file, text(Schema.encodeSync(TimingsJson)(staged))],
    ['/films/test/narration/a.mp3', text('Hello world.')],
    [
      '/films/test/quotes.jsonl',
      text('{"ref":"Ps 46:10","author":"KJV","text":"Be still, and know that I am God."}\n'),
    ],
  ]);
  const mixes: Array<string> = [];
  /** How many fresh reads of the script and voice the studio asked for. */
  const reads: Array<string> = [];
  /** The film's sources' stamp: a test moves it when it changes a source. */
  const stamp = { now: 1 };
  /** The film's lines as its files say them now: a test edits one while the lab runs. */
  const source = { scenes: film.scenes };
  const repo = Layer.effect(
    FilmRepo,
    Effect.gen(function* () {
      const store = yield* ContentStore;
      return FilmRepo.of({
        load: () =>
          Effect.map(store.read(film.paths.timings), (timings) => ({
            ...film,
            scenes: source.scenes,
            timings,
          })),
        script: () => Effect.succeedNone,
        scores: Effect.succeed(NO_SCORES),
      });
    }),
  );
  // The fresh process, over the film as it is stored now: `film read voice`, `film options
  // list` (its voices) and `keep-voice`, whose mix is counted, and `keeping` stands around.
  const fresh = Layer.unwrap(
    Effect.map(
      Effect.context<FilmRepo | Takes | ContentStore | FileSystem.FileSystem | Path.Path>(),
      (context) => {
        const keep = keepVoiceHere(
          context,
          Effect.andThen(
            Effect.sync(() => void mixes.push(film.paths.name)),
            Effect.as(remixing, true),
          ),
        );
        return freshFilm({
          reading: (name) =>
            Effect.gen(function* () {
              reads.push(name);
              const loaded = yield* (yield* FilmRepo).load(name);
              return yield* readingOf(loaded);
            }).pipe(Effect.provideContext(context), Effect.orDie),
          choices: voicesHere(context),
          keepVoice: (name, beat, file, options) => keeping(beat, keep(name, beat, file, options)),
          remix: () =>
            Effect.andThen(
              Effect.sync(() => void mixes.push(film.paths.name)),
              remixing,
            ),
          check: () => Effect.succeed([]),
        });
      },
    ),
  );
  const base = Layer.mergeAll(
    memoryFileSystem(files),
    Path.layer,
    fakeElevenLabs(files, emptyCalls(), { recorded }),
    fakeMedia(files),
    formatAsIs,
  );
  // The lab's handler serves the studio: its notes, source and review services only have to exist.
  const folder = Layer.succeed(
    FilmFolder,
    FilmFolder.of({
      paths: () => film.paths,
      names: Effect.succeed([film.paths.name]),
      sounds: Option.none(),
      stamp: () => Effect.sync(() => stamp.now),
    }),
  );
  // The lab's handler serves the studio: its notes, scenes and renders only have to exist; its
  // writes and the Choices view's are real.
  const layer = Layer.mergeAll(
    NotesStore.layer,
    noScenes,
    echoPages,
    StudioReadings.layer,
    Choices.layer,
  ).pipe(
    Layer.provideMerge(Layer.mergeAll(SourceWriter.layer, RenderCatalogue.layer, noRenders)),
    Layer.provideMerge(Layer.mergeAll(folder, fresh)),
    Layer.provideMerge(Takes.layer),
    Layer.provideMerge(repo),
    Layer.provideMerge(storeLayer(files)),
    Layer.provideMerge(Layer.mergeAll(base, HttpPlatform.layer.pipe(Layer.provide(base)))),
  );
  return { files, mixes, reads, stamp, source, layer };
};

const Json = Schema.fromJsonString(Schema.Unknown);

const bound = { hostname: '127.0.0.1', port: 4401 } as const;
const at = (path: string) => `http://127.0.0.1:4401${path}`;
const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  new Request(at(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(at(path), { method: 'GET', headers });

/** A recording as the page posts it: what it says is its bytes, as the fake media reads them. */
const recording = (said: string, extra = '') =>
  `{"audio":"${Base64.encode(said)}","type":"audio/wav"${extra}}`;

const said = new Map([
  ['a', 'Hello world.'],
  ['b', 'He said be still to them.'],
]);

const call = (request: Request) =>
  Effect.gen(function* () {
    const studio = yield* labHandler({ hosts: [] });
    const res = yield* Effect.promise(() => studio(request, bound));
    const type = res.headers.get('content-type');
    const raw = yield* Effect.promise(() => res.text());
    // Audio answers stay text; JSON answers are parsed to decode against their Schema.
    if (!String(type).includes('json')) return { status: res.status, type, body: raw as unknown };
    const body = yield* Schema.decodeEffect(Json)(raw);
    return { status: res.status, type, body };
  });

describe('studio routes', () => {
  it.effect(
    'lists every beat with a line: its sheet text, the file to save, and where its take stands',
    () => {
      const { layer } = setup(said);
      return Effect.gen(function* () {
        const { status, body } = yield* call(
          get(labUrls.studio.beats({ params: { film: 'test' } })),
        );
        expect(status).toBe(200);
        const listed = yield* Schema.decodeUnknownEffect(StudioBeats)(body);
        expect(listed.beats.map((b) => [b.id, b.file, b.state, b.recorded, b.attempts])).toEqual([
          ['a', 'a.wav', 'staging', false, 0],
          ['b', 'b.wav', 'stale', false, 0],
        ]);
        expect(listed.beats[1]?.staleReason).toBe('missing');
        expect(listed.beats[1]?.parts).toEqual([
          { kind: 'line', text: 'He said' },
          { kind: 'quotation', text: '“be still”', by: 'KJV, Ps 46:10' },
          { kind: 'line', text: 'to them.' },
        ]);
        expect(listed.beats[0]?.take).toEqual({ file: 'a.mp3', duration: 1, source: 'elevenlabs' });
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );

  it.effect(
    'a line fixed while the lab runs is on the sheet, and a take of it is current, at the next read',
    () => {
      const { reads, stamp, source, layer } = setup(new Map([...said, ['a', 'Hello there.']]));
      return Effect.gen(function* () {
        const beats = Effect.flatMap(
          call(get(labUrls.studio.beats({ params: { film: 'test' } }))),
          (res) => Schema.decodeUnknownEffect(StudioBeats)(res.body),
        );
        expect((yield* beats).beats[0]).toMatchObject({ state: 'staging' });
        // The agent fixes the line; the lab keeps running, its own imports as they were.
        source.scenes = [
          { id: 'a', say: 'Hello {wave} there.' },
          ...source.scenes.filter((scene) => scene.id !== 'a'),
        ];
        stamp.now += 1;
        const fixed = (yield* beats).beats[0];
        expect(fixed?.parts).toEqual([{ kind: 'line', text: 'Hello there.' }]);
        expect([fixed?.state, fixed?.staleReason]).toEqual(['stale', 'text changed']);
        // The owner reads the new line: it is kept as the take, current.
        const { status } = yield* call(
          post(
            labUrls.studio.take({ params: { film: 'test', beat: 'a' } }),
            recording('Hello there.'),
          ),
        );
        expect(status).toBe(200);
        stamp.now += 1;
        expect((yield* beats).beats[0]).toMatchObject({ state: 'recorded', recorded: true });
        // One fresh read per stamp: the first, the fix, and the take's.
        expect(reads).toEqual(['test', 'test', 'test']);
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );

  it.effect('a recording posted for a beat becomes its take, and the track is remixed', () => {
    const { mixes, layer } = setup(said);
    return Effect.gen(function* () {
      const { status, body } = yield* call(
        post(
          labUrls.studio.take({ params: { film: 'test', beat: 'a' } }),
          recording('Hello world.'),
        ),
      );
      expect(status).toBe(200);
      const kept = yield* Schema.decodeUnknownEffect(StudioTake)(body);
      expect(kept.beat).toBe('a');
      expect(kept.take.source).toBe('recorded');
      expect(kept.timings.scenes['a']?.file).toBe(kept.take.file);
      expect(kept.take.words.map((w) => w.text)).toEqual(['Hello', 'world.']);
      expect(kept.mixed).toBe(true);
      expect(mixes).toEqual(['test']);
      const listed = yield* Schema.decodeUnknownEffect(StudioBeats)(
        (yield* call(get(labUrls.studio.beats({ params: { film: 'test' } })))).body,
      );
      expect(listed.beats[0]).toMatchObject({
        id: 'a',
        state: 'recorded',
        recorded: true,
        attempts: 1,
      });
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect(
    'a take that says something else is refused with the attempt it saved; accept anyway keeps it',
    () => {
      const { mixes, layer } = setup(new Map([...said, ['b', 'He said nothing at all today.']]));
      return Effect.gen(function* () {
        const refused = yield* call(
          post(
            labUrls.studio.take({ params: { film: 'test', beat: 'b' } }),
            recording('He said be still to them.'),
          ),
        );
        expect(refused.status).toBe(422);
        const why = yield* Schema.decodeUnknownEffect(TakeMismatch)(refused.body);
        expect(why).toMatchObject({
          _tag: 'TakeMismatch',
          id: 'b',
          heard: 'He said nothing at all today.',
        });
        expect(why.wer).toBeGreaterThan(0.08);
        expect(mixes).toEqual([]);
        const attempt = Option.getOrThrow(Option.fromNullishOr(why.attempt));
        // Heard again and kept: the attempt is listed, then made the take.
        const listed = yield* Schema.decodeUnknownEffect(StudioAttempts)(
          (yield* call(get(labUrls.studio.attempts({ params: { film: 'test', beat: 'b' } })))).body,
        );
        expect(listed.attempts.map((a) => [a.file, a.kept, a.current])).toEqual([
          [attempt, false, true],
        ]);
        const audio = yield* call(
          get(labUrls.studio.attempt({ params: { film: 'test', beat: 'b', file: attempt } })),
        );
        expect([audio.status, audio.type]).toEqual([200, 'audio/flac']);
        // A phone's Safari plays and seeks it by byte ranges.
        const part = yield* call(
          get(labUrls.studio.attempt({ params: { film: 'test', beat: 'b', file: attempt } }), {
            range: 'bytes=0-1',
          }),
        );
        expect([part.status, part.type, String(part.body).length]).toEqual([206, 'audio/flac', 2]);
        const kept = yield* call(
          post(
            labUrls.studio.keep({ params: { film: 'test', beat: 'b' } }),
            `{"file":"${attempt}","acceptMismatch":true}`,
          ),
        );
        expect(kept.status).toBe(200);
        expect(
          (yield* Schema.decodeUnknownEffect(StudioTake)(kept.body)).timings.scenes['b'],
        ).toMatchObject({
          file: attempt,
          source: 'recorded',
        });
        expect(mixes).toEqual(['test']);
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );

  it.effect(
    'refuses a beat with no line, a body that is not a recording, and a file it never recorded',
    () => {
      const { layer } = setup(said);
      return Effect.gen(function* () {
        const quiet = yield* call(
          post(
            labUrls.studio.take({ params: { film: 'test', beat: 'quiet' } }),
            recording('Hello.'),
          ),
        );
        expect([quiet.status, (quiet.body as { _tag: string })._tag]).toEqual([
          422,
          'RecordingInvalid',
        ]);
        expect(
          (yield* call(
            post(
              labUrls.studio.take({ params: { film: 'test', beat: 'a' } }),
              '{"audio":"*","type":"audio/wav"}',
            ),
          )).status,
        ).toBe(400);
        expect(
          (yield* call(
            post(
              labUrls.studio.take({ params: { film: 'test', beat: 'a' } }),
              '{"type":"audio/wav"}',
            ),
          )).status,
        ).toBe(400);
        // The owner's take is the final voice: a lossy upload is refused, not made a master.
        for (const lossy of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/mpeg', 'audio/ogg']) {
          const refused = yield* call(
            post(
              labUrls.studio.take({ params: { film: 'test', beat: 'a' } }),
              `{"audio":"${Base64.encode('Hello world.')}","type":"${lossy}"}`,
            ),
          );
          expect([refused.status, (refused.body as { _tag: string })._tag]).toEqual([
            415,
            'RecordingLossy',
          ]);
        }
        expect(
          (yield* call(
            post(
              labUrls.studio.take({ params: { film: 'test', beat: 'a' } }),
              `{"audio":"${Base64.encode('Hello world.')}","type":"audio/flac"}`,
            ),
          )).status,
        ).toBe(200);
        expect(
          (yield* call(get('/api/films/test/studio/takes/a/attempts/..%2F..%2Ftimings.json')))
            .status,
        ).toBe(404);
        const keep = yield* call(
          post(
            labUrls.studio.keep({ params: { film: 'test', beat: 'a' } }),
            '{"file":"a.000000000000.mp3"}',
          ),
        );
        expect([keep.status, (keep.body as { _tag: string })._tag]).toEqual([
          422,
          'RecordingInvalid',
        ]);
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );

  it.effect('a beat the film does not have is refused before anything is written', () => {
    const { files, layer } = setup(said);
    const before = [...files.keys()];
    return Effect.gen(function* () {
      for (const beat of [
        'nope',
        'a%2F..%2F..%2Ftimings',
        '..%2Fa',
        'a%2F',
        '%2E%2E%2F%2E%2E%2Fx',
      ]) {
        const posted = yield* call(
          post(`/api/films/test/studio/takes/${beat}`, recording('Hello world.')),
        );
        expect([beat, posted.status, (posted.body as { _tag: string })._tag]).toEqual([
          beat,
          404,
          'UnknownScene',
        ]);
        const kept = yield* call(
          post(`/api/films/test/studio/takes/${beat}/keep`, '{"file":"a.000000000000.flac"}'),
        );
        expect([beat, kept.status]).toEqual([beat, 404]);
        expect([
          beat,
          (yield* call(get(`/api/films/test/studio/takes/${beat}/attempts`))).status,
        ]).toEqual([beat, 404]);
      }
      // Nothing was written: no temporary recording, no attempt.
      expect([...files.keys()]).toEqual(before);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect('a body over the limit is refused 413 before it is read whole', () => {
    const { files, layer } = setup(said);
    const before = [...files.keys()];
    return Effect.gen(function* () {
      const huge = 'x'.repeat(STUDIO_MAX_BODY + 1);
      const refused = yield* call(
        post(labUrls.studio.take({ params: { film: 'test', beat: 'a' } }), huge),
      );
      expect([refused.status, (refused.body as { _tag: string })._tag]).toEqual([
        413,
        'BodyTooLarge',
      ]);
      // Said to be small, sent large: the stream is counted, not the header believed.
      const lying = new Request(at(labUrls.studio.take({ params: { film: 'test', beat: 'a' } })), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '10' },
        body: huge,
      });
      expect((yield* call(lying)).status).toBe(413);
      expect([...files.keys()]).toEqual(before);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect('takes posted at once are kept and mixed one after the other', () => {
    const events: Array<string> = [];
    const { layer } = setup(
      said,
      Effect.gen(function* () {
        events.push('mix');
        for (let i = 0; i < 5; i++) yield* Effect.yieldNow;
        events.push('mixed');
      }),
    );
    return Effect.gen(function* () {
      // One studio, as the lab runs it, taking two posts at once.
      const studio = yield* labHandler({ hosts: [] });
      const answers = yield* Effect.forEach(
        [
          post(
            labUrls.studio.take({ params: { film: 'test', beat: 'a' } }),
            recording('Hello world.'),
          ),
          post(
            labUrls.studio.take({ params: { film: 'test', beat: 'b' } }),
            recording('He said be still to them.'),
          ),
        ],
        (request) => Effect.promise(() => studio(request, bound)),
        { concurrency: 2 },
      );
      expect(answers.map((a) => a.status)).toEqual([200, 200]);
      expect(events).toEqual(['mix', 'mixed', 'mix', 'mixed']);
      // Both takes are in the timings: neither write lost the other.
      const listed = yield* Schema.decodeUnknownEffect(StudioBeats)(
        (yield* call(get(labUrls.studio.beats({ params: { film: 'test' } })))).body,
      );
      expect(listed.beats.map((b) => b.recorded)).toEqual([true, true]);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect('a take refused at the gate, or for another film, leaves no attempt on disk', () => {
    const { files, layer } = setup(said);
    return Effect.gen(function* () {
      const foreign = post(
        labUrls.studio.take({ params: { film: 'test', beat: 'a' } }),
        recording('Hello world.'),
        {
          origin: 'http://evil.example',
        },
      );
      expect((yield* call(foreign)).status).toBe(403);
      expect(
        (yield* call(
          post(
            labUrls.studio.take({ params: { film: 'other', beat: 'a' } }),
            recording('Hello world.'),
          ),
        )).status,
      ).toBe(404);
      expect([...files.keys()].some((f) => f.includes('/attempts/'))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect(
    "Keep of an earlier attempt is undone by the lab's Undo, and redone by Redo, each take's file in narration and the track remixed with it",
    () => {
      const { files, mixes, layer } = setup(said);
      return Effect.gen(function* () {
        const first = yield* posted('a', 'Hello world.');
        const second = yield* posted('a', 'Hello world, again.');
        const before = files.get(film.paths.timings.file);
        const kept = yield* call(
          post(labUrls.studio.keep({ params: { film: 'test', beat: 'a' } }), `{"file":"${first}"}`),
        );
        expect(kept.status).toBe(200);
        expect(yield* takeOf('a')).toBe(first);
        mixes.length = 0;
        const undone = yield* call(post(labUrls.steps.undo({ params: { film: 'test' } }), '{}'));
        expect([undone.status, (undone.body as { target: string }).target]).toEqual([
          200,
          `undo voice a keep ${first}`,
        ]);
        expect(yield* takeOf('a')).toBe(second);
        expect(files.get(film.paths.timings.file)).toEqual(before);
        expect(narrationOf(files, 'a')).toEqual([second]);
        // The track plays what the timings name: remixed once the Undo landed.
        expect(mixes).toEqual(['test']);
        const redone = yield* call(post(labUrls.steps.redo({ params: { film: 'test' } }), '{}'));
        expect(redone.status).toBe(200);
        expect(yield* takeOf('a')).toBe(first);
        expect(narrationOf(files, 'a')).toEqual([first]);
        expect(mixes).toEqual(['test', 'test']);
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );

  it.effect(
    'a studio Keep and a Choices voice pick at once write the timings one after the other, and Undo walks them back in order',
    () => {
      const marks: Array<string> = [];
      const { files, layer } = setup(said, Effect.void, (beat, keep) =>
        Effect.gen(function* () {
          marks.push(`keep ${beat}`);
          const kept = yield* keep;
          for (let i = 0; i < 5; i++) yield* Effect.yieldNow;
          marks.push(`kept ${beat}`);
          return kept;
        }),
      );
      return Effect.gen(function* () {
        const a1 = yield* posted('a', 'Hello world.');
        const a2 = yield* posted('a', 'Hello world, again.');
        const b1 = yield* posted('b', 'He said be still to them.');
        const b2 = yield* posted('b', 'He said be still to them, again.');
        const start = files.get(film.paths.timings.file);
        marks.length = 0;
        // The owner keeps a1 in the Studio while a Choices tab picks b1.
        const studio = yield* labHandler({ hosts: [] });
        const point = pointIdOf({ _tag: 'Voice', beat: 'b' });
        yield* Effect.all(
          [
            Effect.promise(() =>
              studio(
                post(
                  labUrls.studio.keep({ params: { film: 'test', beat: 'a' } }),
                  `{"file":"${a1}"}`,
                ),
                bound,
              ),
            ).pipe(Effect.tap((res) => Effect.sync(() => expect(res.status).toBe(200)))),
            Choices.use((choices) => choices.pick(FILM, { point, variant: b1, verb: 'pick' })),
          ],
          { concurrency: 2 },
        );
        // Each keep landed whole before the next began.
        const [firstBeat, secondBeat] = [marks[0]?.slice(5), marks[2]?.slice(5)];
        expect(marks).toEqual([
          `keep ${firstBeat}`,
          `kept ${firstBeat}`,
          `keep ${secondBeat}`,
          `kept ${secondBeat}`,
        ]);
        expect([firstBeat, secondBeat].toSorted()).toEqual(['a', 'b']);
        expect([yield* takeOf('a'), yield* takeOf('b')]).toEqual([a1, b1]);
        // Undo walks back the later keep first, then the earlier, to the timings as they were.
        const writer = yield* SourceWriter;
        const before = new Map([
          ['a', a2],
          ['b', b2],
        ]);
        const kept = new Map([
          ['a', a1],
          ['b', b1],
        ]);
        yield* writer.undo(FILM);
        expect(yield* takeOf(secondBeat ?? '')).toBe(before.get(secondBeat ?? '') ?? '');
        expect(yield* takeOf(firstBeat ?? '')).toBe(kept.get(firstBeat ?? '') ?? '');
        yield* writer.undo(FILM);
        expect(files.get(film.paths.timings.file)).toEqual(start);
        expect([narrationOf(files, 'a'), narrationOf(files, 'b')]).toEqual([[a2], [b2]]);
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );
});

/** A recording posted for `beat` and kept as its take: the take's file. */
const posted = (beat: string, said: string) =>
  Effect.gen(function* () {
    const { status, body } = yield* call(
      post(labUrls.studio.take({ params: { film: 'test', beat } }), recording(said)),
    );
    expect(status).toBe(200);
    return (yield* Schema.decodeUnknownEffect(StudioTake)(body)).take.file;
  });

/** The file the timings name as `beat`'s take now. */
const takeOf = (beat: string) =>
  ContentStore.use((store) =>
    Effect.map(store.read(film.paths.timings), (t) => t.scenes[beat]?.file ?? ''),
  );

/** `beat`'s take files in `narration/` itself (not its attempts), by name. */
const narrationOf = (files: ReadonlyMap<string, Uint8Array>, beat: string) =>
  [...files.keys()]
    .filter((f) => f.startsWith(`${film.paths.narration}/${beat}.`))
    .map((f) => f.slice(film.paths.narration.length + 1));
