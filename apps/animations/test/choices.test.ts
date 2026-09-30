// A film's choices on a synthetic film: a copy of the fixture film given a
// second score option and one generated library sound (a kept take and two
// waiting, their files made here, never sent anywhere), listed as choice
// points, heard, picked, set by a knob, approved and commented on. The film is
// read, and its mixes made, in a fresh process (the copy's own `cli.ts`, as
// the review runs the app's), so an option added to `sound.ts` while the
// review runs is listed. A score pick changes the one `play` string in
// `sound.ts` and is undone byte for byte; a take kept through the library is
// undone the same way in the lock; a level knob writes its one number; a
// take's own file and its mix in place are served. No ElevenLabs call can
// happen: this process's service refuses every one, and the child only lists
// and mixes.

import { BunServices } from '@effect/platform-bun';
import {
  CatalogueJson,
  type ChoicePoint,
  type FilmChoices,
  type LockEntry,
  LockJson,
  type Pcm,
  type Variant,
  requestKey,
} from '@bible/film/core';
import {
  Choices,
  ContentStore,
  ElevenLabs,
  ElevenLabsFailed,
  FilmRepo,
  FreshFilm,
  Media,
  PrivateStore,
  RenderCatalogue,
  Review,
  SoundLibrary,
  SourceWriter,
  Takes,
  filmNamed,
} from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import {
  ConfigProvider,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
  Schema,
} from 'effect';
import { FetchHttpClient } from 'effect/http';
import { spawnBudget } from './cli-run.ts';

/** Where one test's copy lives: its films, its library and its renders. */
class Copy extends Context.Service<
  Copy,
  { readonly films: string; readonly sounds: string; readonly out: string }
>()('test/Copy') {}

/** The second option, and a generated sound placed twice: as oxfmt leaves them. */
const STRINGS = `      strings: {
        model: 'music_v2_5',
        styles: ['instrumental', 'strings'],
        avoid: ['vocals'],
        movements: [{ from: 'open', name: 'The page', styles: ['quiet'] }],
      },
`;
/** A third option, added while the review runs. */
const ORGAN = `      organ: {
        model: 'music_v2_5',
        styles: ['instrumental', 'organ'],
        avoid: ['vocals'],
        movements: [{ from: 'open', name: 'The page', styles: ['slow'] }],
      },
`;
const HUSH = `    hush: {
      sound: 'paper.page',
      at: [
        { scene: 'turn', at: 'start', offset: 0.5 },
        { scene: 'close', at: 'start', offset: 0.2 },
      ],
    },
`;

/** A soft burst, `secs` long at 44.1 kHz: a take's file. */
const burst = (secs: number, seed: number): Pcm => {
  const frames = Math.round(44100 * secs);
  const plane = new Float32Array(frames);
  for (let i = 0; i < frames; i++)
    plane[i] = 0.2 * Math.sin((i * (seed + 3) * Math.PI) / 50) * Math.exp((-4 * i) / frames);
  return { rate: 44100, frames, channels: [plane] };
};

const variant = (file: string, sha256: string, request: string): Variant => ({
  request,
  file,
  sha256,
  made: '2026-09-30T00:00:00Z',
  model: 'eleven_text_to_sound_v2',
  format: 'pcm_44100',
  secs: 1,
  loudness: { integrated: -24, momentaryMax: -18, peak: -8 },
  licence: 'elevenlabs-paid-sfx',
  credits: 40,
});

/** ElevenLabs that refuses everything: nothing here may reach a paid API. */
const refusing = Layer.succeed(
  ElevenLabs,
  ElevenLabs.of({
    tts: () => Effect.fail(ElevenLabsFailed.make({ op: 'tts', exitCode: -1, reason: 'no' })),
    dialogue: () =>
      Effect.fail(ElevenLabsFailed.make({ op: 'dialogue', exitCode: -1, reason: 'no' })),
    stt: () => Effect.fail(ElevenLabsFailed.make({ op: 'stt', exitCode: -1, reason: 'no' })),
    composeMusic: () =>
      Effect.fail(ElevenLabsFailed.make({ op: 'music', exitCode: -1, reason: 'no' })),
    soundEffect: () =>
      Effect.fail(ElevenLabsFailed.make({ op: 'sfx', exitCode: -1, reason: 'no' })),
    ready: Effect.void,
    apiKey: Effect.succeed(Redacted.make('never used')),
  }),
);

/** The copy, made under the app's `out/` (so its modules import the framework), and the services over it. */
const fixture = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const app = path.join(import.meta.dir, '..');
    const parent = path.join(app, 'out', 'choices-test');
    yield* fs.makeDirectory(parent, { recursive: true });
    const root = yield* fs.makeTempDirectoryScoped({ directory: parent, prefix: 'copy-' });
    const films = path.join(root, 'films');
    const sounds = path.join(root, 'sounds');
    const out = path.join(root, 'out');
    yield* fs.copy(path.join(import.meta.dir, 'fixtures', 'films'), films);
    yield* fs.copy(path.join(import.meta.dir, 'fixtures', 'sounds'), sounds);
    const soundTs = path.join(films, 'tiny', 'sound.ts');
    const declared = yield* fs.readFileString(soundTs);
    yield* fs.writeFileString(
      soundTs,
      declared
        .replace('    options: {\n', `    options: {\n${STRINGS}`)
        .replace('  effects: {\n', `  effects: {\n${HUSH}`),
    );
    // A registry beside the films, as an app keeps one: a file, never a film.
    yield* fs.writeFileString(path.join(films, 'index.ts'), 'export const films = {};\n');
    // The app's CLI over the copy: what the review runs for a fresh read. Its
    // project folders are the copy's (`FILMS_OUT`), as this process's are.
    const cli = path.join(root, 'cli.ts');
    const [appAt, filmsAt, soundsAt, outAt] = yield* Effect.forEach(
      [path.join(app, 'cli.ts'), films, sounds, out],
      (at) => Schema.encodeEffect(Schema.fromJsonString(Schema.String))(at),
    );
    yield* fs.writeFileString(
      cli,
      [
        `import { appCli } from ${appAt};`,
        `process.env.FILMS_OUT = ${outAt};`,
        `appCli(${filmsAt}, ${soundsAt}, import.meta.path);`,
        '',
      ].join('\n'),
    );
    // A render of the film, for the picture its options are heard against:
    // its file in the project folder, and the catalogue's record of it.
    yield* fs.makeDirectory(path.join(out, 'tiny', 'film'), { recursive: true });
    yield* fs.writeFileString(path.join(out, 'tiny', 'film', 'main.mp4'), 'not really a video');
    yield* fs.writeFileString(
      path.join(out, 'tiny', 'catalogue.json'),
      yield* Schema.encodeEffect(CatalogueJson)({
        film: 'tiny',
        renders: [
          {
            address: { _tag: 'Film' },
            variant: 'main',
            kind: 'video',
            settings: { scale: 1, captions: true },
            stamp: { commit: Option.none(), key: 'k' },
            span: Option.none(),
            files: {
              clip: Option.some('film/main.mp4'),
              share: Option.none(),
              captions: Option.none(),
              chapters: Option.none(),
              images: [],
            },
            at: 1,
          },
        ],
        approvals: [],
        comments: [],
      }),
    );
    const Platform = BunServices.layer;
    const Store = ContentStore.layer.pipe(Layer.provide(Platform));
    const Outputs = ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: out }));
    const Repo = FilmRepo.layer(films, Option.some(sounds)).pipe(
      Layer.provide([Store, Platform, Outputs]),
    );
    const Tools = Layer.mergeAll(refusing, Media.layer).pipe(Layer.provide(Platform));
    // The fixture library declares a folder store, so no key and no network.
    const Private = PrivateStore.layer(sounds).pipe(
      Layer.provide([FetchHttpClient.layer, Platform]),
    );
    const Library = SoundLibrary.layer(sounds).pipe(
      Layer.provide([Store, Tools, Private, Platform]),
    );
    const Reviewed = Review.layer({
      roots: [{ label: 'out', path: out }],
      cache: path.join(root, 'cache'),
      phoneOver: 1e9,
      maxVideo: 1e9,
      phoneCopies: false,
    }).pipe(Layer.provide([Tools, Platform]));
    const Writer = SourceWriter.layer.pipe(Layer.provide([Repo, Store, Platform]));
    const Fresh = FreshFilm.layer(['bun', cli]).pipe(Layer.provide(Platform));
    const Catalogues = RenderCatalogue.layer.pipe(Layer.provide(Platform));
    const Taken = Takes.layer.pipe(Layer.provide([Store, Tools, Platform]));
    return Choices.layer.pipe(
      Layer.provideMerge(
        Layer.mergeAll(Repo, Library, Writer, Fresh, Reviewed, Tools, Store, Catalogues, Taken),
      ),
      Layer.merge(Layer.succeed(Copy, Copy.of({ films, sounds, out }))),
    );
  }),
).pipe(Layer.provideMerge(BunServices.layer));

/** The library's lock given `paper.page`: one kept take and two waiting, each a file made here. */
const seedLock = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const media = yield* Media;
  const { sounds } = yield* Copy;
  const library = yield* SoundLibrary;
  const loaded = yield* library.load;
  const entry = yield* Option.match(Option.fromUndefinedOr(loaded.library['paper.page']), {
    onNone: () => Effect.die('the fixture library has no paper.page'),
    onSome: Effect.succeed,
  });
  const request = requestKey(entry);
  yield* fs.makeDirectory(path.join(sounds, 'files', 'paper.page'), { recursive: true });
  const takes = ['aa11', 'bb22', 'cc33'].map((sha, i) => {
    const file = `files/paper.page/${sha}.wav`;
    return { sha, file, pcm: burst(1, i) };
  });
  yield* Effect.forEach(takes, (t) => media.writeWav(path.join(sounds, t.file), t.pcm));
  const made = takes.map((t) => variant(t.file, `${t.sha}${'0'.repeat(60)}`, request));
  const waiting = made.slice(1);
  const record: LockEntry = { variants: made.slice(0, 1), candidates: waiting, rejected: [] };
  const lock = path.join(sounds, 'library.lock.json');
  yield* fs.writeFileString(lock, yield* Schema.encodeEffect(LockJson)({ 'paper.page': record }));
  return { lock, kept: record.variants, waiting };
});

/** The point `id` among the listed ones. */
const pointOf = (listed: FilmChoices, id: string): Option.Option<ChoicePoint> =>
  Option.fromUndefinedOr(listed.points.find((p) => p.id === id));

/** Each variant of point `id` as `[id, state, picked]`. */
const variantsOf = (listed: FilmChoices, id: string) =>
  Option.match(pointOf(listed, id), {
    onNone: () => [],
    onSome: (p) => p.variants.map((v) => [v.id, v.state, v.picked] as const),
  });

const TAKE = 'take:paper.page';

describe("a film's choices", () => {
  it.live(
    'lists the score options and a sound’s takes as points, with where it plays and the film’s render',
    () =>
      Effect.gen(function* () {
        const { kept, waiting } = yield* seedLock;
        expect(yield* FilmRepo.use((repo) => repo.names)).toEqual(['tiny']);
        const tiny = yield* filmNamed('tiny');
        const listed = yield* (yield* Choices).list(tiny);
        expect(listed.pictures.map((p) => p.ref)).toEqual(['out/tiny/film/main.mp4']);
        expect(Option.map(pointOf(listed, 'score'), (p) => [p.kind, p.address])).toEqual(
          Option.some(['score', Option.some({ _tag: 'Film' })]),
        );
        expect(variantsOf(listed, 'score')).toEqual([
          ['strings', 'missing', false],
          ['piano', 'current', true],
        ]);
        const take = pointOf(listed, TAKE);
        // The take belongs to the scenes it plays in, each placement a mark.
        expect(Option.map(take, (p) => p.address)).toEqual(
          Option.some(Option.some({ _tag: 'Scenes', ids: ['turn', 'close'] })),
        );
        expect(Option.map(take, (p) => p.marks.map((m) => m.label))).toEqual(
          Option.some(['hush in turn', 'hush in close']),
        );
        expect(
          Option.map(take, (p) => p.variants.map((v) => [v.label, v.picked, v.verbs])),
        ).toEqual(
          Option.some([
            ['kept 1', true, ['unpick']],
            ['candidate 1', false, ['pick', 'reject']],
            ['candidate 2', false, ['pick', 'reject']],
          ]),
        );
        expect(variantsOf(listed, TAKE).map(([id]) => id)).toEqual(
          [...kept, ...waiting].map((v) => v.sha256),
        );
        // Each layer's level is a knob; a procedural sound has no takes.
        expect(
          Option.map(pointOf(listed, 'level:effect:page'), (p) =>
            Option.map(p.knob, (k) => k.value),
          ),
        ).toEqual(Option.some(Option.some(-20)));
        expect(Option.isNone(pointOf(listed, 'take:tone.chime'))).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(fixture)),
    60_000,
  );

  it.live(
    'lists an option added to sound.ts while it runs: each read imports the film as it stands',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { films } = yield* Copy;
        const choices = yield* Choices;
        const tiny = yield* filmNamed('tiny');
        const options = (listed: FilmChoices) => variantsOf(listed, 'score').map(([id]) => id);
        expect(options(yield* choices.list(tiny))).toEqual(['strings', 'piano']);
        const file = path.join(films, 'tiny', 'sound.ts');
        const declared = yield* fs.readFileString(file);
        yield* fs.writeFileString(
          file,
          declared.replace('    options: {\n', `    options: {\n${ORGAN}`),
        );
        expect(options(yield* choices.list(tiny))).toEqual(['organ', 'strings', 'piano']);
        // And it can be picked: the pick checks the film as it stands, too.
        const picked = yield* choices.pick(tiny, {
          point: 'score',
          variant: 'organ',
          verb: 'pick',
        });
        expect(Option.map(picked.change, (c) => c.target)).toEqual(Option.some('score play organ'));
      }).pipe(Effect.scoped, Effect.provide(fixture)),
    spawnBudget(4),
  );

  it.live(
    'a score pick changes only `play` in sound.ts, and undo puts the file back byte for byte',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { films } = yield* Copy;
        const choices = yield* Choices;
        const writer = yield* SourceWriter;
        const tiny = yield* filmNamed('tiny');
        const file = path.join(films, 'tiny', 'sound.ts');
        const before = yield* fs.readFileString(file);
        const picked = yield* choices.pick(tiny, {
          point: 'score',
          variant: 'strings',
          verb: 'pick',
        });
        const after = yield* fs.readFileString(file);
        expect(after).toBe(before.replace("play: 'piano'", "play: 'strings'"));
        expect(Option.map(picked.change, (c) => c.target)).toEqual(
          Option.some('score play strings'),
        );
        const listed = yield* choices.list(tiny);
        expect(variantsOf(listed, 'score')).toEqual([
          ['strings', 'missing', true],
          ['piano', 'current', false],
        ]);
        // What already plays is not picked again: it offers no pick.
        const again = yield* Effect.flip(
          choices.pick(tiny, { point: 'score', variant: 'strings', verb: 'pick' }),
        );
        expect(again._tag).toBe('VerbRefused');
        expect((yield* writer.undo('tiny')).target).toBe('undo score play strings');
        expect(yield* fs.readFileString(file)).toBe(before);
        expect((yield* writer.redo('tiny')).target).toBe('redo score play strings');
        expect(yield* fs.readFileString(file)).toBe(after);
        const unknown = yield* Effect.flip(
          choices.pick(tiny, { point: 'score', variant: 'banjo', verb: 'pick' }),
        );
        expect(unknown._tag).toBe('VariantUnknown');
        expect(unknown.message).toContain('strings, piano');
        const nowhere = yield* Effect.flip(
          choices.pick(tiny, { point: 'score:banjo', variant: 'piano', verb: 'pick' }),
        );
        expect(nowhere._tag).toBe('ChoiceUnknown');
      }).pipe(Effect.scoped, Effect.provide(fixture)),
    60_000,
  );

  it.live(
    'a take kept through the library lands in the lock, and undo puts the lock back byte for byte',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { lock, waiting } = yield* seedLock;
        const choices = yield* Choices;
        const writer = yield* SourceWriter;
        const tiny = yield* filmNamed('tiny');
        const before = yield* fs.readFileString(lock);
        const second = waiting[1]?.sha256 ?? '';
        const kept = yield* choices.pick(tiny, { point: TAKE, variant: second, verb: 'pick' });
        expect(Option.map(kept.change, (c) => c.target)).toEqual(
          Option.some(`sound paper.page keep ${second.slice(0, 12)}`),
        );
        const listed = yield* choices.list(tiny);
        expect(variantsOf(listed, TAKE).map(([, , picked]) => picked)).toEqual([true, true, false]);
        // A kept take is not rejected; it is unkept first.
        const refused = yield* Effect.flip(
          choices.pick(tiny, { point: TAKE, variant: second, verb: 'reject' }),
        );
        expect(refused._tag).toBe('VerbRefused');
        yield* writer.undo('tiny');
        expect(yield* fs.readFileString(lock)).toBe(before);
        const missing = yield* Effect.flip(
          choices.pick(tiny, { point: TAKE, variant: 'ff', verb: 'pick' }),
        );
        expect(missing._tag).toBe('VariantUnknown');
      }).pipe(Effect.scoped, Effect.provide(fixture)),
    60_000,
  );

  it.live(
    'a level knob writes its one number into sound.ts, clamped, and undo puts it back',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { films } = yield* Copy;
        const choices = yield* Choices;
        const writer = yield* SourceWriter;
        const tiny = yield* filmNamed('tiny');
        const file = path.join(films, 'tiny', 'sound.ts');
        const before = yield* fs.readFileString(file);
        const set = yield* choices.knob(tiny, { point: 'level:effect:page', value: -16 });
        expect(set.target).toBe('level:effect:page -16');
        expect(yield* fs.readFileString(file)).toBe(before.replace('level: -20', 'level: -16'));
        const knobOf = (listed: FilmChoices) =>
          Option.flatMap(pointOf(listed, 'level:effect:page'), (p) =>
            Option.map(p.knob, (k) => k.value),
          );
        expect(knobOf(yield* choices.list(tiny))).toEqual(Option.some(-16));
        yield* writer.undo('tiny');
        expect(yield* fs.readFileString(file)).toBe(before);
        // A pick is not a knob: the score has none.
        const refused = yield* Effect.flip(choices.knob(tiny, { point: 'score', value: -3 }));
        expect(refused._tag).toBe('VerbRefused');
      }).pipe(Effect.scoped, Effect.provide(fixture)),
    60_000,
  );

  it.live(
    'an approval and a comment land in the catalogue on the variant as it is now',
    () =>
      Effect.gen(function* () {
        const choices = yield* Choices;
        const tiny = yield* filmNamed('tiny');
        const approved = yield* choices.approve(tiny, { point: 'score', variant: 'piano' });
        const piano = (listed: FilmChoices) =>
          Option.flatMap(pointOf(listed, 'score'), (p) =>
            Option.fromUndefinedOr(p.variants.find((v) => v.id === 'piano')),
          );
        expect(Option.map(piano(approved), (v) => v.approval)).toEqual(Option.some('approved'));
        const said = yield* choices.comment(tiny, {
          point: 'score',
          variant: 'piano',
          text: 'lower in the turn',
        });
        expect(Option.map(piano(said), (v) => v.comments.map((c) => c.text))).toEqual(
          Option.some(['lower in the turn']),
        );
        // A fresh read sees both: they are the catalogue's, the copy's own.
        const listed = yield* choices.list(tiny);
        expect(Option.map(piano(listed), (v) => [v.approval, v.comments.length])).toEqual(
          Option.some(['approved', 1]),
        );
        const { out } = yield* Copy;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        expect(yield* fs.readFileString(path.join(out, 'tiny', 'catalogue.json'))).toContain(
          'lower in the turn',
        );
      }).pipe(Effect.scoped, Effect.provide(fixture)),
    60_000,
  );

  it.live(
    "serves a take alone and the film's mix with it in place, made once into the cache",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { waiting } = yield* seedLock;
        const choices = yield* Choices;
        const tiny = yield* filmNamed('tiny');
        const take = waiting[0]?.sha256 ?? '';
        const alone = yield* choices.alone(tiny, TAKE, take);
        expect(alone.endsWith('files/paper.page/bb22.wav')).toBe(true);
        const mix = yield* choices.inPlace(tiny, TAKE, take);
        expect(mix.endsWith('.m4a')).toBe(true);
        const made = yield* fs.stat(mix);
        expect(Number(made.size)).toBeGreaterThan(1000);
        // Asked again, it is the same file: not made twice.
        expect(yield* choices.inPlace(tiny, TAKE, take)).toBe(mix);
        const score = yield* choices.inPlace(tiny, 'score', 'piano');
        expect(score).not.toBe(mix);
        // The score is heard in place only: it has no file alone.
        const unheard = yield* Effect.flip(choices.alone(tiny, 'score', 'piano'));
        expect(unheard._tag).toBe('VerbRefused');
      }).pipe(Effect.scoped, Effect.provide(fixture)),
    120_000,
  );
});
