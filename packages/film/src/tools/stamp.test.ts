// A scene's key follows what its frames are drawn from: its own module and
// what that imports, the film's frame, and the scene it enters from; an edit
// to another scene's module leaves it alone.

import { BunServices } from '@effect/platform-bun';
import { expect as expectPlain, test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Option, Path, Result } from 'effect';
import { layout } from '../core/layout.ts';
import { ContentStore } from './content-store.ts';
import { FilmRepo } from './film-repo.ts';
import { SceneSources } from './scene-sources.ts';
import { type Keyed, Stamps, importsOf, stampOf } from './stamp.ts';
import { sceneFixture } from './testing.ts';
import { resolveAddress } from '../core/address.ts';

/** The fixture film's folder: a fresh one per test. */
class Films extends Context.Service<Films, string>()('test/Films') {}

const fixture = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const films = yield* sceneFixture(yield* fs.makeTempDirectoryScoped());
    return Stamps.layer.pipe(
      Layer.provideMerge(SceneSources.layer),
      Layer.provide(FilmRepo.layer(films)),
      Layer.provide(ContentStore.layer),
      Layer.merge(Layer.succeed(Films, films)),
    );
  }),
).pipe(Layer.provideMerge(BunServices.layer));

// The registry's scenes in order; `plain` enters on a transition from `built`, `beta` on a cut.
const placed = Result.getOrThrow(
  layout(
    [
      { id: 'hand', min: 2 },
      { id: 'beta', min: 2 },
      { id: 'built', min: 2 },
      { id: 'plain', min: 2, enter: { kind: 'fade', dur: 0.5 } },
    ],
    { voice: '', scenes: {} },
  ),
);

const film = (films: string, path: Path.Path): Keyed => ({
  paths: { name: 'f', dir: path.join(films, 'f') },
  timings: { voice: '', scenes: {} },
});

/** Every scene's key now. */
const keysNow = Effect.gen(function* () {
  const films = yield* Films;
  const path = yield* Path.Path;
  const { keys } = yield* (yield* Stamps).scenes(film(films, path), placed);
  return Object.fromEntries(keys);
});

/** Append a line to a file of the fixture's scenes folder. */
const touch = (name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join(yield* Films, 'f', 'scenes', name);
    yield* fs.writeFileString(file, `${yield* fs.readFileString(file)}// edited\n`);
  });

/** The scenes whose key changed from `before` to `after`. */
const changed = (before: Record<string, string>, after: Record<string, string>) =>
  Object.keys(before).filter((id) => before[id] !== after[id]);

describe('scene keys', () => {
  it.effect("an edit to one scene's module changes its key alone", () =>
    Effect.gen(function* () {
      const before = yield* keysNow;
      expect(Object.keys(before)).toEqual(['hand', 'beta', 'built', 'plain']);
      yield* touch('hand.ts');
      expect(changed(before, yield* keysNow)).toEqual(['hand']);
      // Unchanged sources, the same keys.
      const again = yield* keysNow;
      expect(changed(again, yield* keysNow)).toEqual([]);
    }).pipe(Effect.provide(fixture)),
  );

  it.effect('an edit to a module the scenes import changes every scene that imports it', () =>
    Effect.gen(function* () {
      const before = yield* keysNow;
      yield* touch('drawing.ts');
      expect(changed(before, yield* keysNow)).toEqual(['hand', 'beta']);
    }).pipe(Effect.provide(fixture)),
  );

  it.effect("an edit to the registry (the film's frame) changes every scene", () =>
    Effect.gen(function* () {
      const before = yield* keysNow;
      yield* touch('index.ts');
      expect(changed(before, yield* keysNow)).toEqual(['hand', 'beta', 'built', 'plain']);
    }).pipe(Effect.provide(fixture)),
  );

  it.effect("a scene entering on a transition draws the previous scene's modules", () =>
    Effect.gen(function* () {
      // `built` has no module of its own; `beta` (declared in a.ts) enters on a cut from `hand`.
      const before = yield* keysNow;
      yield* touch('a.ts');
      expect(changed(before, yield* keysNow)).toEqual(['beta']);
      const films = yield* Films;
      const path = yield* Path.Path;
      const faded = Result.getOrThrow(
        layout(
          [
            { id: 'hand', min: 2 },
            { id: 'beta', min: 2, enter: { kind: 'fade', dur: 0.5 } },
          ],
          { voice: '', scenes: {} },
        ),
      );
      const stamps = yield* Stamps;
      const one = (yield* stamps.scenes(film(films, path), faded)).keys.get('beta');
      yield* touch('hand.ts');
      const two = (yield* stamps.scenes(film(films, path), faded)).keys.get('beta');
      expect(one).not.toEqual(two);
    }).pipe(Effect.provide(fixture)),
  );

  it.effect('outside a git checkout the stamp has no commit', () =>
    Effect.gen(function* () {
      const films = yield* Films;
      const path = yield* Path.Path;
      const keys = yield* (yield* Stamps).scenes(film(films, path), placed);
      expect(keys.commit).toEqual(Option.none());
      const scope = Result.getOrThrow(
        resolveAddress(
          { name: 'f', placed, look: Option.none(), shorts: [] },
          { _tag: 'Scenes', ids: ['hand'] },
        ),
      );
      const stamp = stampOf(keys, scope);
      expect(stamp.key).toMatch(/^[0-9a-f]{64}$/);
      // Another address over the same scene is another stamp.
      const whole = Result.getOrThrow(
        resolveAddress({ name: 'f', placed, look: Option.none(), shorts: [] }, { _tag: 'Film' }),
      );
      expect(stampOf(keys, whole).key).not.toEqual(stamp.key);
    }).pipe(Effect.provide(fixture)),
  );
});

/** How many times the stamp read each file. */
class Reads extends Context.Service<Reads, Map<string, number>>()('test/Reads') {}

/** The fixture's Stamps, over a file system that counts what it reads. */
const counting = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const films = yield* sceneFixture(yield* fs.makeTempDirectoryScoped());
    const counted = Layer.effect(
      FileSystem.FileSystem,
      Effect.gen(function* () {
        const real = yield* FileSystem.FileSystem;
        const reads = yield* Reads;
        return FileSystem.FileSystem.of({
          ...real,
          readFileString: (file, encoding) => {
            reads.set(file, (reads.get(file) ?? 0) + 1);
            return real.readFileString(file, encoding);
          },
        });
      }),
    );
    return Stamps.layer.pipe(
      Layer.provide(counted),
      Layer.provideMerge(SceneSources.layer),
      Layer.provide(FilmRepo.layer(films)),
      Layer.provide(ContentStore.layer),
      Layer.merge(Layer.succeed(Films, films)),
    );
  }),
).pipe(
  Layer.provideMerge(Layer.sync(Reads, () => new Map<string, number>())),
  Layer.provideMerge(BunServices.layer),
);

describe('the stamp’s reads', () => {
  it.effect('read, hash and parse each file once per call, however many scenes import it', () =>
    Effect.gen(function* () {
      yield* keysNow;
      const reads = yield* Reads;
      expect(reads.size).toBeGreaterThan(3);
      expect([...reads].filter(([, n]) => n > 1)).toEqual([]);
    }).pipe(Effect.provide(counting)),
  );
});

describe('importsOf', () => {
  test('lists imports and re-exports, each once', () => {
    const source = `import { a } from './a.ts';
import type { B } from '@bible/film/core';
export { c } from './c.ts';
export * from './a.ts';
const x = 1;
export { x };
`;
    expectPlain(importsOf('m.ts', source)).toEqual(['./a.ts', '@bible/film/core', './c.ts']);
  });
});
