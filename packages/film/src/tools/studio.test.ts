// The lab's studio routes as its panel calls them, over fakes: the beats with
// their sheet text and take state; a recording posted for a beat, imported
// through the same pipeline as `takes import` and remixed; a mismatch refused
// with the attempt it saved, then kept on "accept anyway"; the attempts
// listed and played back. No network, no ffmpeg.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Encoding, Layer, Option, Path, Schema } from 'effect';
import { hashText, voiceKey } from '../core/narration.ts';
import { type Timed, type Timings, TimingsJson } from '../core/schema.ts';
import {
  STUDIO_IMPORT_IDLE_S,
  STUDIO_IMPORT_WAIT_S,
  StudioAttempts,
  StudioBeats,
  StudioRefusal,
  StudioTake,
} from '../core/studio.ts';
import { ContentStore } from './content-store.ts';
import { FilmRepo } from './film-repo.ts';
import { Mixer } from './mixer.ts';
import { NO_SCORES } from './sound-store.ts';
import { STUDIO_MAX_BODY, studioHandler } from './studio.ts';
import { Takes } from './takes.ts';
import {
  emptyCalls,
  fakeElevenLabs,
  fakeMedia,
  memoryFileSystem,
  storeLayer,
  testFilm,
  testVoice,
  text,
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

const setup = (recorded: ReadonlyMap<string, string>) => {
  const files = new Map<string, Uint8Array>([
    [film.paths.timings.file, text(Schema.encodeSync(TimingsJson)(staged))],
    ['/films/test/narration/a.mp3', text('Hello world.')],
    [
      '/films/test/quotes.jsonl',
      text('{"ref":"Ps 46:10","author":"KJV","text":"Be still, and know that I am God."}\n'),
    ],
  ]);
  const mixes: Array<string> = [];
  const repo = Layer.effect(
    FilmRepo,
    Effect.gen(function* () {
      const store = yield* ContentStore;
      return FilmRepo.of({
        paths: () => film.paths,
        // The film as it is stored now, as the lab reloads it for each request.
        load: () => Effect.map(store.read(film.paths.timings), (timings) => ({ ...film, timings })),
        script: () => Effect.succeedNone,
        scores: Effect.succeed(NO_SCORES),
        names: Effect.succeed([]),
      });
    }),
  );
  const mixer = Layer.succeed(
    Mixer,
    Mixer.of({
      mix: (name) => Effect.sync(() => void mixes.push(name)),
      render: () => Effect.die('the studio never renders a mix in memory'),
    }),
  );
  const base = Layer.mergeAll(
    memoryFileSystem(files),
    Path.layer,
    fakeElevenLabs(files, emptyCalls(), { recorded }),
    fakeMedia(files),
  );
  const layer = Layer.mergeAll(Takes.layer, repo).pipe(
    Layer.provideMerge(storeLayer(files)),
    Layer.provideMerge(Layer.mergeAll(base, mixer)),
  );
  return { files, mixes, layer };
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
const get = (path: string) => new Request(at(path), { method: 'GET' });

/** A recording as the page posts it: what it says is its bytes, as the fake media reads them. */
const recording = (said: string, extra = '') =>
  `{"audio":"${Encoding.encodeBase64(said)}","type":"audio/wav"${extra}}`;

const said = new Map([
  ['a', 'Hello world.'],
  ['b', 'He said be still to them.'],
]);

const call = (request: Request) =>
  Effect.gen(function* () {
    const studio = yield* studioHandler('test');
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
        const { status, body } = yield* call(get('/lab/test/studio/beats'));
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

  it.effect('a recording posted for a beat becomes its take, and the track is remixed', () => {
    const { mixes, layer } = setup(said);
    return Effect.gen(function* () {
      const { status, body } = yield* call(
        post('/lab/test/studio/takes/a', recording('Hello world.')),
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
        (yield* call(get('/lab/test/studio/beats'))).body,
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
          post('/lab/test/studio/takes/b', recording('He said be still to them.')),
        );
        expect(refused.status).toBe(422);
        const why = yield* Schema.decodeUnknownEffect(StudioRefusal)(refused.body);
        expect(why).toMatchObject({
          _tag: 'TakeMismatch',
          beat: 'b',
          heard: 'He said nothing at all today.',
        });
        expect(why.wer).toBeGreaterThan(0.08);
        expect(mixes).toEqual([]);
        const attempt = Option.getOrThrow(Option.fromNullishOr(why.attempt));
        // Heard again and kept: the attempt is listed, then made the take.
        const listed = yield* Schema.decodeUnknownEffect(StudioAttempts)(
          (yield* call(get('/lab/test/studio/takes/b/attempts'))).body,
        );
        expect(listed.attempts.map((a) => [a.file, a.kept, a.current])).toEqual([
          [attempt, false, true],
        ]);
        const audio = yield* call(get(`/lab/test/studio/takes/b/attempts/${attempt}`));
        expect([audio.status, audio.type]).toEqual([200, 'audio/flac']);
        const kept = yield* call(
          post('/lab/test/studio/takes/b/keep', `{"file":"${attempt}","acceptMismatch":true}`),
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
        const quiet = yield* call(post('/lab/test/studio/takes/quiet', recording('Hello.')));
        expect([quiet.status, (quiet.body as { _tag: string })._tag]).toEqual([
          422,
          'RecordingInvalid',
        ]);
        expect(
          (yield* call(post('/lab/test/studio/takes/a', '{"audio":"*","type":"audio/wav"}')))
            .status,
        ).toBe(400);
        expect((yield* call(post('/lab/test/studio/takes/a', '{"type":"audio/wav"}'))).status).toBe(
          400,
        );
        // The owner's take is the final voice: a lossy upload is refused, not made a master.
        for (const lossy of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/mpeg', 'audio/ogg']) {
          const refused = yield* call(
            post(
              '/lab/test/studio/takes/a',
              `{"audio":"${Encoding.encodeBase64('Hello world.')}","type":"${lossy}"}`,
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
              '/lab/test/studio/takes/a',
              `{"audio":"${Encoding.encodeBase64('Hello world.')}","type":"audio/flac"}`,
            ),
          )).status,
        ).toBe(200);
        expect(
          (yield* call(get('/lab/test/studio/takes/a/attempts/..%2F..%2Ftimings.json'))).status,
        ).toBe(404);
        const keep = yield* call(
          post('/lab/test/studio/takes/a/keep', '{"file":"a.000000000000.mp3"}'),
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
          post(`/lab/test/studio/takes/${beat}`, recording('Hello world.')),
        );
        expect([beat, posted.status, (posted.body as { _tag: string })._tag]).toEqual([
          beat,
          404,
          'UnknownScene',
        ]);
        const kept = yield* call(
          post(`/lab/test/studio/takes/${beat}/keep`, '{"file":"a.000000000000.flac"}'),
        );
        expect([beat, kept.status]).toEqual([beat, 404]);
        expect([
          beat,
          (yield* call(get(`/lab/test/studio/takes/${beat}/attempts`))).status,
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
      const refused = yield* call(post('/lab/test/studio/takes/a', huge));
      expect([refused.status, (refused.body as { _tag: string })._tag]).toEqual([
        413,
        'BodyTooLarge',
      ]);
      // Said to be small, sent large: the stream is counted, not the header believed.
      const lying = new Request(at('/lab/test/studio/takes/a'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '10' },
        body: huge,
      });
      expect((yield* call(lying)).status).toBe(413);
      expect([...files.keys()]).toEqual(before);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect(
    'a take posted holds its connection open past the page’s wait, not the server’s idle limit',
    () => {
      const { layer } = setup(said);
      return Effect.gen(function* () {
        const raised: Array<readonly [string, number]> = [];
        // As Bun's server does, `timeout` works on its own server: a call
        // detached from it ("Expected this to be instanceof …" in Bun) is
        // recorded as such.
        class Held {
          readonly hostname = bound.hostname;
          readonly port = bound.port;
          timeout(request: Request, seconds: number) {
            if (!(this instanceof Held)) return void raised.push(['detached', seconds]);
            raised.push([new URL(request.url).pathname, seconds]);
          }
        }
        const server = new Held();
        const studio = yield* studioHandler('test');
        yield* Effect.promise(() =>
          studio(post('/lab/test/studio/takes/a', recording('Hello world.')), server),
        );
        yield* Effect.promise(() => studio(get('/lab/test/studio/beats'), server));
        expect(raised).toEqual([['/lab/test/studio/takes/a', STUDIO_IMPORT_IDLE_S]]);
        // The page stops waiting first, so the socket never closes under it.
        expect(STUDIO_IMPORT_IDLE_S).toBeGreaterThan(STUDIO_IMPORT_WAIT_S);
        expect(STUDIO_IMPORT_IDLE_S).toBeLessThanOrEqual(255);
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );

  it.effect('takes posted at once are kept and mixed one after the other', () => {
    const { layer } = setup(said);
    const events: Array<string> = [];
    const slowMixer = Layer.succeed(
      Mixer,
      Mixer.of({
        mix: () =>
          Effect.gen(function* () {
            events.push('mix');
            for (let i = 0; i < 5; i++) yield* Effect.yieldNow;
            events.push('mixed');
          }),
        render: () => Effect.die('the studio never renders a mix in memory'),
      }),
    );
    return Effect.gen(function* () {
      // One studio, as the lab runs it, taking two posts at once.
      const studio = yield* studioHandler('test');
      const answers = yield* Effect.all(
        [
          post('/lab/test/studio/takes/a', recording('Hello world.')),
          post('/lab/test/studio/takes/b', recording('He said be still to them.')),
        ].map((request) => Effect.promise(() => studio(request, bound))),
        { concurrency: 2 },
      );
      expect(answers.map((a) => a.status)).toEqual([200, 200]);
      expect(events).toEqual(['mix', 'mixed', 'mix', 'mixed']);
      // Both takes are in the timings: neither write lost the other.
      const listed = yield* Schema.decodeUnknownEffect(StudioBeats)(
        (yield* call(get('/lab/test/studio/beats'))).body,
      );
      expect(listed.beats.map((b) => b.recorded)).toEqual([true, true]);
    }).pipe(Effect.scoped, Effect.provide(Layer.merge(layer, slowMixer)));
  });

  it.effect('answers only the lab page, for its film: another origin 403, another film 409', () => {
    const { files, layer } = setup(said);
    return Effect.gen(function* () {
      const foreign = post('/lab/test/studio/takes/a', recording('Hello world.'), {
        origin: 'http://evil.example',
      });
      expect((yield* call(foreign)).status).toBe(403);
      expect(
        (yield* call(post('/lab/other/studio/takes/a', recording('Hello world.')))).status,
      ).toBe(409);
      expect([...files.keys()].some((f) => f.includes('/attempts/'))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });
});
