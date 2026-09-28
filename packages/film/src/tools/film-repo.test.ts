// FilmRepo reads films from the one root the app hands it, the same folder its
// player page imports; no environment variable can point the tools elsewhere.

import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Layer, Path } from 'effect';
import { FilmRepo, placeFilm } from './film-repo.ts';
import { memoryFileSystem, storeLayer, testFilm } from './testing.ts';

const files = new Map<string, Uint8Array>();
const env = ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_DIR: '/elsewhere' }));
const repo = FilmRepo.layer('/app/src/films').pipe(
  Layer.provide([storeLayer(files), memoryFileSystem(files), Path.layer, env]),
);

describe('FilmRepo', () => {
  it.effect('reads films from the root it is given, whatever FILMS_DIR says', () =>
    Effect.gen(function* () {
      const paths = (yield* FilmRepo).paths('test');
      expect(paths.dir).toBe('/app/src/films/test');
    }).pipe(Effect.provide(repo)),
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
      expect(error).toMatchObject({ scene: 'gift', cue: 'lit', mark: 'gift', word: 'hope' });
    }),
  );

  it.effect('fails with LayoutInvalid for any other authoring error', () =>
    Effect.gen(function* () {
      const film = testFilm([{ id: 'a', timeline: { x: { after: 'nope' } } }], empty);
      expect((yield* Effect.flip(placeFilm(film)))._tag).toBe('LayoutInvalid');
    }),
  );
});
