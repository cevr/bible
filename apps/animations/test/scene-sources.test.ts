// The lab's locator against the real films: every scene that declares a
// timeline or knobs resolves to exactly one `drawing({...})` literal in its
// scene file, found by the identity of the object the scene reads, and the
// scene files are exactly as oxfmt leaves them (so a lab write, which runs
// oxfmt on the file, changes nothing but the value it writes). The films are
// the registry's (`src/films/index.ts`): a film added there is covered here
// without a line of this file changing.

import { BunServices } from '@effect/platform-bun';
import {
  ContentStore,
  FilmRepo,
  SceneSources,
  type Slot,
  StaticCheck,
  drawingSites,
  importFilmModule,
  parseModule,
} from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path, Predicate, Result, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { FILMS } from '../server.ts';
import { films } from '../src/films/index.ts';
import { spawnBudget } from './cli-run.ts';

/** Every film the player and the renderer know: the registry's keys, never a list kept here. */
const FILM_NAMES = Object.keys(films);
/** The film the checks of one service (not of every film) run on. */
const FILM = 'righteousness-by-faith-v1';
const CLI = new URL('../cli.ts', import.meta.url).pathname;

/** A film's `scenes/index.ts`: each scene's id, and its timeline and knobs where it declares them. */
const ScenesModule = Schema.Struct({
  scenes: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      timeline: Schema.optionalKey(Schema.Unknown),
      knobs: Schema.optionalKey(Schema.Unknown),
    }),
  ),
});
type Scene = (typeof ScenesModule.Type)['scenes'][number];

/** The film's scenes, from its `scenes/index.ts` in the films folder the tools read. */
const scenesOf = Effect.fn('test.scenesOf')(function* (film: string) {
  const path = yield* Path.Path;
  const module = yield* Effect.promise(() =>
    importFilmModule(path.join(FILMS, film, 'scenes', 'index.ts')),
  );
  return (yield* Schema.decodeUnknownEffect(ScenesModule)(module)).scenes;
});

const Sources = SceneSources.layer.pipe(
  Layer.provide(FilmRepo.layer(FILMS)),
  Layer.provide(ContentStore.layer),
  Layer.provideMerge(BunServices.layer),
);

describe('scene sources', () => {
  it.effect('the registry names the films these tests cover', () =>
    Effect.sync(() => {
      expect(FILM_NAMES).toContain(FILM);
      expect(FILM_NAMES.length).toBeGreaterThan(1);
    }),
  );

  for (const film of FILM_NAMES)
    it.effect.layer(Sources)(
      `${film}: every scene with a timeline or knobs resolves to one literal`,
      () =>
        Effect.gen(function* () {
          const sources = yield* SceneSources;
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const scenes = yield* scenesOf(film);
          const located = yield* sources.locate(film);
          expect(located.unlocated.map((u) => u.message)).toEqual([]);
          const declares = (s: Scene, key: 'timeline' | 'knobs') => Predicate.hasProperty(s, key);
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

  for (const film of FILM_NAMES)
    it.effect.layer(Sources)(
      `${film}: oxfmt leaves every scene file as it is`,
      () =>
        Effect.gen(function* () {
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const path = yield* Path.Path;
          const exit = yield* spawner.exitCode(
            ChildProcess.make('bunx', ['oxfmt', '--check', path.join(FILMS, film, 'scenes')]),
          );
          expect(Number(exit)).toBe(0);
        }),
      spawnBudget(1),
    );

  it.effect.layer(Sources)('a scene with nothing to edit is refused by name', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip((yield* SceneSources).site(FILM, 'no-such-scene'));
      expect(error._tag).toBe('SceneNotLocated');
    }),
  );

  it.effect.layer(Sources)(
    "the lab's check runs this CLI fresh and reads its findings",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const check = yield* StaticCheck;
        const findings = yield* check.run(FILM);
        // The gate holds the film at no static errors; its unmade sounds are warnings.
        expect(findings.length).toBeGreaterThan(0);
        expect(findings.filter((f) => f.level === 'error')).toEqual([]);
        expect(path.basename(CLI)).toBe('cli.ts');
      }).pipe(Effect.provide(StaticCheck.layer(['bun', CLI]))),
    spawnBudget(1),
  );
});
