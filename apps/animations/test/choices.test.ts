// A film's choices on a synthetic film: a copy of the fixture film given a
// second score option and one generated library sound (a kept take and two
// waiting, their files made here, never sent anywhere), listed, heard and
// picked. The film is read, and its mixes made, in a fresh process (the
// copy's own `cli.ts`, as the review runs the app's), so an option added to
// `sound.ts` while the review runs is listed. A score pick changes the one
// `play` string in `sound.ts` and is undone byte for byte; a take kept
// through the library is undone the same way in the lock; a take's own file
// and its mix in place are served. No ElevenLabs call can happen: this
// process's service refuses every one, and the child only lists and mixes.

import { BunServices } from '@effect/platform-bun';
import {
  type FilmChoice,
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
  Review,
  SoundLibrary,
  SourceWriter,
  filmNamed,
} from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Option, Path, Redacted, Schema } from 'effect';
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
        { scene: 'turn', offset: 0.5 },
        { scene: 'close', offset: 0.2 },
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
    // The app's CLI over the copy: what the review runs for a fresh read.
    const cli = path.join(root, 'cli.ts');
    const [appAt, filmsAt, soundsAt] = yield* Effect.forEach(
      [path.join(app, 'cli.ts'), films, sounds],
      (at) => Schema.encodeEffect(Schema.fromJsonString(Schema.String))(at),
    );
    yield* fs.writeFileString(
      cli,
      [
        `import { appCli } from ${appAt};`,
        `appCli(${filmsAt}, ${soundsAt}, import.meta.path);`,
        '',
      ].join('\n'),
    );
    // A render of the film, for the picture its options are heard against.
    yield* fs.makeDirectory(path.join(out, 'tiny'), { recursive: true });
    yield* fs.writeFileString(path.join(out, 'tiny', 'tiny.mp4'), 'not really a video');
    const Platform = BunServices.layer;
    const Store = ContentStore.layer.pipe(Layer.provide(Platform));
    const Repo = FilmRepo.layer(films, Option.some(sounds)).pipe(Layer.provide([Store, Platform]));
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
    return Choices.layer.pipe(
      Layer.provideMerge(Layer.mergeAll(Repo, Library, Writer, Fresh, Reviewed, Tools, Store)),
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

describe("a film's choices", () => {
  it.live(
    'lists the score options and a sound’s takes, with where it plays and the film’s render',
    () =>
      Effect.gen(function* () {
        yield* seedLock;
        expect(yield* FilmRepo.use((repo) => repo.names)).toEqual(['tiny']);
        const tiny = yield* filmNamed('tiny');
        const listed = yield* (yield* Choices).list(tiny);
        expect(listed.pictures.map((p) => p.ref)).toEqual(['out/tiny/tiny.mp4']);
        const [score, effect] = listed.choices;
        expect(score).toMatchObject({ _tag: 'ScoreChoice', picked: 'piano' });
        expect(score?._tag === 'ScoreChoice' && score.variants.map((v) => [v.id, v.state])).toEqual(
          [
            ['strings', 'missing'],
            ['piano', 'current'],
          ],
        );
        expect(effect).toMatchObject({ _tag: 'EffectChoice', sound: 'paper.page' });
        if (effect?._tag !== 'EffectChoice') return;
        expect(effect.placements.map((p) => [p.effect, p.scene])).toEqual([
          ['hush', 'turn'],
          ['hush', 'close'],
        ]);
        expect(effect.takes.map((t) => [t.state, t.index, t.current])).toEqual([
          ['kept', 1, true],
          ['candidate', 1, true],
          ['candidate', 2, true],
        ]);
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
        const options = (listed: { readonly choices: ReadonlyArray<FilmChoice> }) =>
          listed.choices
            .filter((c) => c._tag === 'ScoreChoice')
            .flatMap((c) => c.variants.map((v) => v.id));
        expect(options(yield* choices.list(tiny))).toEqual(['strings', 'piano']);
        const file = path.join(films, 'tiny', 'sound.ts');
        const declared = yield* fs.readFileString(file);
        yield* fs.writeFileString(
          file,
          declared.replace('    options: {\n', `    options: {\n${ORGAN}`),
        );
        expect(options(yield* choices.list(tiny))).toEqual(['organ', 'strings', 'piano']);
        // And it can be picked: the pick checks the film as it stands, too.
        const picked = yield* choices.pickScore(tiny, 'organ');
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
        const picked = yield* choices.pickScore(tiny, 'strings');
        const after = yield* fs.readFileString(file);
        expect(after).toBe(before.replace("play: 'piano'", "play: 'strings'"));
        expect(Option.map(picked.change, (c) => c.target)).toEqual(
          Option.some('score play strings'),
        );
        const listed = yield* choices.list(tiny);
        expect(listed.choices[0]).toMatchObject({ picked: 'strings' });
        // Picking what already plays writes nothing, and leaves nothing to undo.
        const again = yield* choices.pickScore(tiny, 'strings');
        expect(Option.isNone(again.change)).toBe(true);
        expect((yield* writer.undo('tiny')).target).toBe('undo score play strings');
        expect(yield* fs.readFileString(file)).toBe(before);
        expect((yield* writer.redo('tiny')).target).toBe('redo score play strings');
        expect(yield* fs.readFileString(file)).toBe(after);
        const unknown = yield* Effect.flip(choices.pickScore(tiny, 'banjo'));
        expect(unknown._tag).toBe('ChoiceUnknown');
        expect(unknown.message).toContain('strings, piano');
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
        const kept = yield* choices.curate(tiny, 'paper.page', second, 'keep');
        expect(Option.map(kept.change, (c) => c.target)).toEqual(
          Option.some(`sound paper.page keep ${second.slice(0, 12)}`),
        );
        const listed = yield* choices.list(tiny);
        const effect = listed.choices.find((c) => c._tag === 'EffectChoice');
        expect(effect?._tag === 'EffectChoice' && effect.takes.map((t) => t.state)).toEqual([
          'kept',
          'kept',
          'candidate',
        ]);
        // A kept take is not rejected; it is unkept first.
        const refused = yield* Effect.flip(choices.curate(tiny, 'paper.page', second, 'reject'));
        expect(refused._tag).toBe('TakeActRefused');
        yield* writer.undo('tiny');
        expect(yield* fs.readFileString(lock)).toBe(before);
        const missing = yield* Effect.flip(choices.curate(tiny, 'paper.page', 'ff', 'keep'));
        expect(missing._tag).toBe('TakeUnknown');
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
        const alone = yield* choices.takeAudio(tiny, 'paper.page', take);
        expect(alone.endsWith('files/paper.page/bb22.wav')).toBe(true);
        const mix = yield* choices.takeMix(tiny, 'paper.page', take);
        expect(mix.endsWith('.m4a')).toBe(true);
        const made = yield* fs.stat(mix);
        expect(Number(made.size)).toBeGreaterThan(1000);
        // Asked again, it is the same file: not made twice.
        expect(yield* choices.takeMix(tiny, 'paper.page', take)).toBe(mix);
        const score = yield* choices.scoreMix(tiny, 'piano');
        expect(score).not.toBe(mix);
      }).pipe(Effect.scoped, Effect.provide(fixture)),
    120_000,
  );
});
