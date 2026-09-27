// FilmRepo reads films from the one root the app hands it; no environment
// variable can point the tools elsewhere.

import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Layer, Path } from 'effect';
import { FilmRepo } from './film-repo.ts';
import { memoryFileSystem, storeLayer } from './testing.ts';

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
      expect(paths.rive).toBe('/app/src/films/test/rive');
    }).pipe(Effect.provide(repo)),
  );
});
