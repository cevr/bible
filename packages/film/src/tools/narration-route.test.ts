// The narration route names only a film's own narration files, and reads the
// films per request: on a films folder made here.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path } from 'effect';
import { narrationFile } from './narration-route.ts';

/** A films folder with one film, `f`, its narration and an attempt; and `loose`, no film. */
const films = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'narration-' });
  yield* fs.makeDirectory(path.join(root, 'f/narration/attempts'), { recursive: true });
  yield* fs.makeDirectory(path.join(root, 'f/scenes'));
  yield* fs.writeFileString(path.join(root, 'f/scenes/index.ts'), 'export {};\n');
  for (const file of ['timings.json', 'attempts/a.wav', '.hidden'])
    yield* fs.writeFileString(path.join(root, 'f/narration', file), '{}');
  // A folder with no `scenes/index.ts` is no film, narration or not.
  yield* fs.makeDirectory(path.join(root, 'loose/narration'), { recursive: true });
  yield* fs.writeFileString(path.join(root, 'loose/narration/timings.json'), '{}');
  return root;
});

describe('the narration route', () => {
  it.effect(
    "names only a film's own narration files: no other film, no attempts, no path, no dotfile",
    () =>
      Effect.gen(function* () {
        const root = yield* films;
        const served = (url: string) =>
          Effect.map(narrationFile(root, url), (file) => [url, Option.isSome(file)]);
        expect(
          yield* Effect.all([
            served('/films/f/narration/timings.json'),
            served('/films/nope/narration/timings.json'),
            served('/films/loose/narration/timings.json'),
            served('/films/f/narration/attempts/a.wav'),
            served('/films/f/narration/attempts%2Fa.wav'),
            served('/films/f/narration/.hidden'),
            served('/films/../package.json'),
          ]),
        ).toEqual([
          ['/films/f/narration/timings.json', true],
          ['/films/nope/narration/timings.json', false],
          ['/films/loose/narration/timings.json', false],
          ['/films/f/narration/attempts/a.wav', false],
          ['/films/f/narration/attempts%2Fa.wav', false],
          ['/films/f/narration/.hidden', false],
          ['/films/../package.json', false],
        ]);
        expect(yield* narrationFile(root, '/films/f/narration/timings.json')).toEqual(
          Option.some(`${root}/f/narration/timings.json`),
        );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('names a film made after the server started: the films are read per request', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'narration-' });
      yield* fs.makeDirectory(path.join(root, 'late/scenes'), { recursive: true });
      yield* fs.makeDirectory(path.join(root, 'late/narration'));
      yield* fs.writeFileString(path.join(root, 'late/scenes/index.ts'), 'export {};\n');
      yield* fs.writeFileString(path.join(root, 'late/narration/timings.json'), '{}');
      expect(Option.isSome(yield* narrationFile(root, '/films/late/narration/timings.json'))).toBe(
        true,
      );
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
