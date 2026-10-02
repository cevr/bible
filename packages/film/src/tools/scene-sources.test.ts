// Locating a scene's drawing by the identity of the objects it reads: a
// registry that renames a drawing still finds the file that declares it (and
// not a decoy file that exports the registry's name), a timeline the registry
// builds in code is not located, and a scene with nothing to edit is skipped.
// The lab locates in a fresh process, so a scene added while it runs is found.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Path } from 'effect';
import { ContentStore } from './content-store.ts';
import { FilmFolder, FilmRepo } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { scenesLocatedHere } from './read-cli.ts';
import { SceneSources } from './scene-sources.ts';
import { sceneFixture } from './testing.ts';

/** The fixture film's folder: a fresh one per test. */
class Films extends Context.Service<Films, string>()('test/Films') {}

/** A fresh fixture film on disk, and the locator over its films folder. */
const fixture = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const films = yield* sceneFixture(yield* fs.makeTempDirectoryScoped());
    return scenesLocatedHere.pipe(
      Layer.provide(FilmRepo.layer(films)),
      Layer.provide(ContentStore.layer),
      Layer.merge(Layer.succeed(Films, films)),
    );
  }),
).pipe(Layer.provideMerge(BunServices.layer));

/** The timeout of a test here that runs the read in a fresh process: a cold start's time is the machine's. */
const SPAWNS_MS = 30_000;

/**
 * A fresh fixture film on disk, and the lab's locator over its films folder:
 * each read runs `film read` in a fresh process (`fixtures/read-cli.ts`).
 */
const lab = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const films = yield* sceneFixture(yield* fs.makeTempDirectoryScoped());
    const cli = path.join(import.meta.dir, 'fixtures', 'read-cli.ts');
    return SceneSources.layer.pipe(
      Layer.provide(FreshFilm.layer(['bun', cli, films])),
      Layer.provide(FilmFolder.layer(films)),
      Layer.merge(Layer.succeed(Films, films)),
    );
  }),
).pipe(Layer.provideMerge(BunServices.layer));

/** A drawing of its own, for a scene added while the lab runs. */
const GAMMA = `import { drawing } from './drawing.ts';

export const gamma = drawing({ timeline: { go: { at: 'start', dur: 1 } }, draw: () => {} });
`;

/** Both fields writable: each scene reads its drawing's own literals, and no other scene does. */
const open = { timeline: { _tag: 'Writable' }, knobs: { _tag: 'Writable' } } as const;

describe('scene sources', () => {
  it.effect('finds each scene by the objects it reads', () =>
    Effect.gen(function* () {
      const films = yield* Films;
      const path = yield* Path.Path;
      const sources = yield* SceneSources;
      const scenes = path.join(films, 'f', 'scenes');
      const located = yield* sources.locate('f');
      expect([...located.sites.values()]).toEqual([
        {
          scene: 'hand',
          file: path.join(scenes, 'hand.ts'),
          shown: 'scenes/hand.ts',
          exportName: 'hand_',
          access: open,
        },
        // Registered as `beta`: declared as `alpha` in a.ts, never decoy.ts's `beta`.
        {
          scene: 'beta',
          file: path.join(scenes, 'a.ts'),
          shown: 'scenes/a.ts',
          exportName: 'alpha',
          access: open,
        },
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

  it.effect(
    "the lab's locate finds a scene added after its first, without a restart",
    () =>
      Effect.gen(function* () {
        const films = yield* Films;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const sources = yield* SceneSources;
        const scenes = path.join(films, 'f', 'scenes');
        expect([...(yield* sources.locate('f')).sites.keys()]).toEqual(['hand', 'beta']);
        // The owner adds a scene while the lab runs: its drawing, and its line in the registry.
        yield* fs.writeFileString(path.join(scenes, 'gamma.ts'), GAMMA);
        const registry = path.join(scenes, 'index.ts');
        const index = yield* fs.readFileString(registry);
        yield* fs.writeFileString(
          registry,
          index
            .replace('import { hand }', "import { gamma } from './gamma.ts';\nimport { hand }")
            .replace("  { id: 'plain' },", "  { id: 'plain' },\n  { id: 'gamma', ...gamma },"),
        );
        const site = yield* sources.site('f', 'gamma');
        expect([site.shown, site.exportName]).toEqual(['scenes/gamma.ts', 'gamma']);
      }).pipe(Effect.provide(lab)),
    SPAWNS_MS,
  );
});
