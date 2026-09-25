// Locating a scene's drawing by the identity of the objects it reads: a
// registry that renames a drawing still finds the file that declares it (and
// not a decoy file that exports the registry's name), a timeline the registry
// builds in code is not located, and a scene with nothing to edit is skipped.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Path } from 'effect';
import { ContentStore } from './content-store.ts';
import { FilmRepo } from './film-repo.ts';
import { SceneSources } from './scene-sources.ts';
import { sceneFixture } from './testing.ts';

/** The fixture film's folder: a fresh one per test. */
class Films extends Context.Service<Films, string>()('test/Films') {}

/** A fresh fixture film on disk, and the locator over its films folder. */
const fixture = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const films = yield* sceneFixture(yield* fs.makeTempDirectoryScoped());
    return SceneSources.layer.pipe(
      Layer.provide(FilmRepo.layer(films)),
      Layer.provide(ContentStore.layer),
      Layer.merge(Layer.succeed(Films, films)),
    );
  }),
).pipe(Layer.provideMerge(BunServices.layer));

describe('scene sources', () => {
  it.effect('finds each scene by the objects it reads', () =>
    Effect.gen(function* () {
      const films = yield* Films;
      const path = yield* Path.Path;
      const sources = yield* SceneSources;
      const scenes = path.join(films, 'f', 'scenes');
      const located = yield* sources.locate('f');
      expect([...located.sites.values()]).toEqual([
        { scene: 'hand', file: path.join(scenes, 'hand.ts'), exportName: 'hand_' },
        // Registered as `beta`: declared as `alpha` in a.ts, never decoy.ts's `beta`.
        { scene: 'beta', file: path.join(scenes, 'a.ts'), exportName: 'alpha' },
      ]);
      expect(located.unlocated.map((u) => [u.scene, u.reason])).toEqual([
        [
          'built',
          'no exported drawing({...}) in the film folder declares the timeline or knobs it reads',
        ],
      ]);
      const error = yield* Effect.flip(sources.site('f', 'plain'));
      expect(error.message).toContain('scene "plain" has no editable drawing');
      const editable = yield* sources.editable('f', 'hand');
      expect(editable.cues.map((c) => [c.name, c.offset])).toEqual([
        ['topple', 'literal'],
        ['late', 'computed'],
      ]);
    }).pipe(Effect.provide(fixture)),
  );
});
