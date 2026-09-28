// FilmRepo reads films from the one root the app hands it, the same folder its
// player page imports; no environment variable can point the tools elsewhere.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, Layer, Option, Path } from 'effect';
import { ContentStore } from './content-store.ts';
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
    }).pipe(Effect.provide(repo)),
  );

  it.effect('a film with no script.ts has no script', () => {
    files.set('/app/src/films/bare/scenes/index.ts', new Uint8Array());
    return Effect.gen(function* () {
      expect(Option.isNone(yield* (yield* FilmRepo).script('bare'))).toBe(true);
    }).pipe(Effect.provide(repo));
  });

  it.effect.layer(
    FilmRepo.layer(`${import.meta.dir}/../../../../apps/animations/src/films`).pipe(
      Layer.provide(ContentStore.layer),
      Layer.provideMerge(BunServices.layer),
    ),
  )("reads a film's script: each beat's line and its sources", () =>
    Effect.gen(function* () {
      const script = Option.getOrThrow(yield* (yield* FilmRepo).script('righteousness-by-faith'));
      const cold = script.find((beat) => beat.id === 'cold');
      expect(cold?.cite).toEqual(['Romans 4:5', 'Job 9:2']);
      expect(cold?.say).toContain('How should man be just with God?');
      expect(script.find((beat) => beat.id === 'title')?.say).toBeUndefined();
    }),
  );
});
