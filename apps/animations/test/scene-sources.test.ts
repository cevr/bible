// The lab's locator against the real film: every scene that declares a
// timeline or knobs resolves to exactly one `drawing({...})` literal in its
// scene file, found by the identity of the object the scene reads, and the
// scene files are exactly as oxfmt leaves them (so a lab write, which runs
// oxfmt on the file, changes nothing but the value it writes).

import { BunServices } from '@effect/platform-bun';
import {
  ContentStore,
  FilmRepo,
  SceneSources,
  type Slot,
  StaticCheck,
  drawingSites,
  parseModule,
} from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path, Predicate, Result } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { FILMS } from '../server.ts';
import { scenes as v1Scenes } from '../src/films/righteousness-by-faith-v1/scenes/index.ts';
import { scenes as rbfScenes } from '../src/films/righteousness-by-faith/scenes/index.ts';

const FILM = 'righteousness-by-faith-v1';
/** Every film, so a scene the lab cannot locate fails here and not in a review. */
const ALL = [
  [FILM, v1Scenes],
  ['righteousness-by-faith', rbfScenes],
] as const;
const CLI = new URL('../cli.ts', import.meta.url).pathname;

const Sources = SceneSources.layer.pipe(
  Layer.provide(FilmRepo.layer(FILMS)),
  Layer.provide(ContentStore.layer),
  Layer.provideMerge(BunServices.layer),
);

describe('scene sources', () => {
  for (const [film, scenes] of ALL)
    it.effect.layer(Sources)(
      `${film}: every scene with a timeline or knobs resolves to one literal`,
      () =>
        Effect.gen(function* () {
          const sources = yield* SceneSources;
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const located = yield* sources.locate(film);
          expect(located.unlocated.map((u) => u.message)).toEqual([]);
          const declares = (s: (typeof scenes)[number], key: 'timeline' | 'knobs') =>
            Predicate.hasProperty(s, key);
          const editable = scenes.filter((s) => declares(s, 'timeline') || declares(s, 'knobs'));
          expect([...located.sites.keys()].sort()).toEqual(editable.map((s) => s.id).sort());
          for (const scene of editable) {
            const site = Option.getOrThrow(Option.fromUndefinedOr(located.sites.get(scene.id)));
            const source = yield* fs.readFileString(site.file);
            const program = Result.getOrThrow(parseModule(site.file, source));
            const calls = drawingSites(source, program).filter((d) =>
              d.exports.includes(site.exportName),
            );
            // Exactly one call, and its timeline and knobs are literals where the scene has them.
            expect(calls).toHaveLength(1);
            const [call] = calls;
            const slot = (key: 'timeline' | 'knobs'): Slot['_tag'] =>
              Option.match(Option.liftPredicate(scene, Predicate.hasProperty(key)), {
                onNone: () => 'Absent',
                onSome: () => 'Literal',
              });
            expect(call?.timeline._tag).toBe(slot('timeline'));
            expect(call?.knobs._tag).toBe(slot('knobs'));
            expect(path.dirname(site.file)).toBe(path.join(FILMS, film, 'scenes'));
          }
          // The v1 hand scene is exported as `hand_`, renamed `hand` by the registry chain.
          if (film === FILM)
            expect(located.sites.get('hand')).toMatchObject({
              file: path.join(FILMS, FILM, 'scenes', 'hand.ts'),
            });
        }),
    );

  it.effect.layer(Sources)('a scene with nothing to edit is refused by name', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip((yield* SceneSources).site(FILM, 'no-such-scene'));
      expect(error._tag).toBe('SceneNotLocated');
    }),
  );

  it.effect.layer(Sources)("the lab's check runs this CLI fresh and reads its findings", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const check = yield* StaticCheck;
      const findings = yield* check.run(FILM);
      // The gate holds the film at no static errors; its unmade sounds are warnings.
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.filter((f) => f.level === 'error')).toEqual([]);
      expect(path.basename(CLI)).toBe('cli.ts');
    }).pipe(Effect.provide(StaticCheck.layer(['bun', CLI]))),
  );

  it.effect.layer(Sources)('oxfmt leaves every scene file as it is', () =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const path = yield* Path.Path;
      const exit = yield* spawner.exitCode(
        ChildProcess.make('bunx', ['oxfmt', '--check', path.join(FILMS, FILM, 'scenes')]),
      );
      expect(Number(exit)).toBe(0);
    }),
  );
});
