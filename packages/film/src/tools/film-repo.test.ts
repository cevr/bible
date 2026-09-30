// FilmRepo reads films from the one root the app hands it, the same folder its
// player page imports; no environment variable can point the tools elsewhere.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, FileSystem, Layer, Option, Path } from 'effect';
import { ContentStore } from './content-store.ts';
import { FilmFolder, FilmRepo, placeFilm } from './film-repo.ts';
import { memoryFileSystem, storeLayer, testFilm } from './testing.ts';

const files = new Map<string, Uint8Array>();
const env = ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_DIR: '/elsewhere' }));
const repo = FilmRepo.layer('/app/src/films').pipe(
  Layer.provide([storeLayer(files), memoryFileSystem(files), Path.layer, env]),
);

describe('FilmRepo', () => {
  it.effect('reads films from the root it is given, whatever FILMS_DIR says', () =>
    Effect.gen(function* () {
      const paths = (yield* FilmFolder).paths('test');
      expect(paths.dir).toBe('/app/src/films/test');
    }).pipe(Effect.provide(repo)),
  );

  it.effect('a film with no script.ts has no script', () => {
    files.set('/app/src/films/bare/scenes/index.ts', new Uint8Array());
    return Effect.gen(function* () {
      expect(Option.isNone(yield* (yield* FilmRepo).script('bare'))).toBe(true);
    }).pipe(Effect.provide(repo));
  });

  // A synthetic film on disk (`fixtures/films/sample`): its modules are
  // imported as a real film's are, and no real film's script pins the test.
  it.effect.layer(
    FilmRepo.layer(`${import.meta.dir}/fixtures/films`).pipe(
      Layer.provide(ContentStore.layer),
      Layer.provideMerge(BunServices.layer),
    ),
  )("reads a film's script: each beat's line and its sources", () =>
    Effect.gen(function* () {
      const script = Option.getOrThrow(yield* (yield* FilmRepo).script('sample'));
      const open = script.find((beat) => beat.id === 'open');
      expect(open?.cite).toEqual(['Job 9:2', 'Romans 4:5']);
      expect(open?.say).toContain('and its answer');
      expect(script.find((beat) => beat.id === 'title')?.say).toBeUndefined();
      expect(script.find((beat) => beat.id === 'title')?.cite).toEqual([]);
      // It lists no heardAs names, so the take check has none.
      const loaded = yield* (yield* FilmRepo).load('sample');
      expect(loaded.heardAs).toEqual({});
      // Its film.ts declares the look: two acts, the first from the opening.
      const look = Option.getOrThrow(loaded.look);
      expect(look.acts.map((act) => act.from)).toEqual(['open', 'title']);
    }),
  );
});

describe('FilmFolder.stamp', () => {
  // A film and the app's sound library on disk, each file dated by hand, so
  // the stamp is read from the dates alone: the film's newest is 1000 s, the
  // lock's 2000 s, the library module's 3000 s.
  const dated = Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'film-stamp-' });
      const sounds = `${root}/sounds`;
      yield* fs.makeDirectory(`${root}/films/f/scenes`, { recursive: true });
      yield* fs.makeDirectory(sounds);
      const at = (file: string, seconds: number) =>
        fs.writeFileString(file, '').pipe(Effect.andThen(fs.utimes(file, seconds, seconds)));
      yield* at(`${root}/films/f/scenes/index.ts`, 1_000);
      yield* at(`${sounds}/library.lock.json`, 2_000);
      yield* at(`${sounds}/library.ts`, 3_000);
      yield* fs.utimes(`${root}/films/f/scenes`, 1_000, 1_000);
      return FilmFolder.layer(`${root}/films`, Option.some(sounds));
    }),
  ).pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
    Layer.provideMerge(BunServices.layer),
  );

  it.effect.layer(dated)("moves when the library's module changes, as when its lock does", () =>
    Effect.gen(function* () {
      expect(yield* (yield* FilmFolder).stamp('f')).toBe(3_000_000);
    }),
  );
});

describe('placeFilm', () => {
  const empty = { voice: '', scenes: {} };
  const pinned = (word: string) =>
    testFilm(
      [
        {
          id: 'gift',
          say: '{gift}And even that faith is a gift.',
          timeline: { lit: { mark: 'gift', word, dur: 0.6 } },
        },
      ],
      empty,
    );

  it.effect('lays out a word pin on a word the line says', () =>
    Effect.gen(function* () {
      const [p] = yield* placeFilm(pinned('faith'));
      const faith = p?.voice.words.find((w) => w.text === 'faith');
      expect(p?.cues.get('lit')?.start).toBe((p?.speechStart ?? NaN) + (faith?.start ?? NaN));
    }),
  );

  it.effect('fails with WordMissing, typed, when the line never says the word', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(placeFilm(pinned('hope')));
      expect(error._tag).toBe('WordMissing');
      expect(error).toMatchObject({ scene: 'gift', by: 'cue "lit"', mark: 'gift', word: 'hope' });
    }),
  );

  it.effect('fails with the authoring error itself, naming its scene and cue', () =>
    Effect.gen(function* () {
      const film = testFilm([{ id: 'a', timeline: { x: { after: 'nope' } } }], empty);
      expect(yield* Effect.flip(placeFilm(film))).toMatchObject({
        _tag: 'UnknownCue',
        scene: 'a',
        cue: 'nope',
        by: 'cue "x"',
      });
    }),
  );
});
