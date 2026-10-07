// `film project approve --scene a,c`, run as the CLI runs it over a memory
// catalogue: the scenes named are approved all together or not at all. Each
// is checked under the catalogue's lock, so a render that lands between the
// run's start and its write cannot leave some of them approved and the
// answer saying all were.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Cause, Effect, Exit, Layer, Option, Path, Schema } from 'effect';
import { Command } from 'effect/cli';
import { sceneAddress } from '../core/address.ts';
import { type Render, approvalState, subjectOf } from '../core/catalogue.ts';
import { VerbRefused } from '../core/refusals.ts';
import { RenderCatalogue } from './catalogue.ts';
import { ContentStore } from './content-store.ts';
import { FilmRepo, placeFilm } from './film-repo.ts';
import { planKey } from './mixer.ts';
import { project } from './project-cli.ts';
import { Renderer } from './renderer.ts';
import { Stamps, sceneStamps } from './stamp.ts';
import { memoryFileSystem, memoryLocks, reviewMedia, testFilm } from './testing.ts';

const isVerbRefused = Schema.is(VerbRefused);

/** Film `test`: three silent scenes of a second each, with no acts. */
const FILM = testFilm(
  ['one', 'two', 'three'].map((id) => ({ id, timeline: { go: { at: 'start', dur: 1 } } })),
  { voice: '', scenes: {} },
);

/** Each scene's key now. */
const KEYS = new Map([
  ['one', 'k1'],
  ['two', 'k2'],
  ['three', 'k3'],
]);

/** A render of scene `id`, drawn from sources with `key`, carrying the film's mix `mix`. */
const sceneRender = (id: string, key: string, mix = Option.none<string>()): Render => ({
  address: sceneAddress(id),
  variant: 'main',
  kind: 'video',
  settings: { scale: 0.5, captions: true },
  stamp: { commit: Option.none(), key },
  span: Option.none(),
  files: {
    clip: Option.some(`scenes/${id}/main.mp4`),
    share: Option.none(),
    captions: Option.none(),
    chapters: Option.none(),
    images: [],
  },
  sound: Option.map(mix, (m) => ({ mix: Option.some(m), pieces: [] })),
  at: 1,
});

/**
 * The catalogue, over memory, where `lands` is recorded just before the
 * run's first write takes the lock: another run's render, finished between
 * this run's start and its write.
 */
const catalogueWhere = (lands: Render) =>
  Layer.effect(
    RenderCatalogue,
    Effect.gen(function* () {
      const real = yield* RenderCatalogue;
      let landed = false;
      const land = (project: Parameters<typeof real.record>[0]) =>
        Effect.suspend(() => {
          if (landed) return Effect.void;
          landed = true;
          return real.record(project, lands);
        });
      return RenderCatalogue.of({
        ...real,
        update: (project, change) => Effect.andThen(land(project), real.update(project, change)),
        attempt: (project, change) => Effect.andThen(land(project), real.attempt(project, change)),
      });
    }),
  ).pipe(Layer.provide(RenderCatalogue.layer));

/** The film's services over memory: its film, its keys, and `catalogue`. */
const servicesWith = (catalogue: Layer.Layer<RenderCatalogue, never, ContentStore | Path.Path>) =>
  Layer.mergeAll(
    Layer.succeed(
      FilmRepo,
      FilmRepo.of({
        load: () => Effect.succeed(FILM),
        script: () => Effect.die('approve reads no script'),
        scores: Effect.die('approve reads no scores'),
      }),
    ),
    Layer.succeed(
      Stamps,
      Stamps.of({ scenes: () => Effect.succeed({ commit: Option.none(), keys: KEYS }) }),
    ),
    catalogue,
  ).pipe(
    Layer.provideMerge(ContentStore.layer),
    Layer.provideMerge(Layer.mergeAll(memoryFileSystem(new Map()), Path.layer, memoryLocks)),
  );

/** `approve` renders nothing: its renderer is never built. */
const NO_RENDERER = Layer.effect(Renderer, Effect.die('approve renders nothing'));

const run = (args: ReadonlyArray<string>) =>
  Command.runWith(project(NO_RENDERER), { version: '0' })(args).pipe(Effect.exit);

/**
 * `approve test --scene one,three`, both current as the run starts, while
 * `lands` lands just before its write: how it ended, the approvals it left
 * on `one` and `three`, and how many approvals the catalogue holds.
 */
const approveAsLands = (lands: Render) =>
  Effect.gen(function* () {
    const catalogues = yield* RenderCatalogue;
    const placed = yield* placeFilm(FILM);
    const stamps = sceneStamps({ commit: Option.none(), keys: KEYS }, placed);
    const mix = yield* planKey(FILM, placed);
    // Current: its sources' key now, and the film's mix.
    const current = (id: string) =>
      sceneRender(id, stamps.find((s) => s.scene === id)?.stamp.key ?? '', mix);
    yield* catalogues.record(FILM.paths, current('one'));
    yield* catalogues.record(FILM.paths, current('three'));
    const exit = yield* run(['approve', 'test', '--scene', 'one,three', '--json']);
    const after = yield* catalogues.read(FILM.paths);
    return {
      refused: Exit.match(exit, {
        onSuccess: () => Option.none<string>(),
        onFailure: (cause) =>
          Option.map(Option.filter(Cause.findErrorOption(cause), isVerbRefused), (r) => r.point),
      }),
      approval: ['one', 'three'].map((id) => approvalState(after, subjectOf(current(id)))),
      approvals: after.approvals.length,
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        BunServices.layer,
        servicesWith(catalogueWhere(lands)),
        reviewMedia([]).pipe(Layer.provide(memoryFileSystem(new Map()))),
      ),
    ),
  );

describe('film project approve --scene', () => {
  it.effect(
    'a scene made stale by a render that lands as the run writes refuses the approve, naming it, and approves none of the scenes named',
    () =>
      Effect.gen(function* () {
        const { refused, approval, approvals } = yield* approveAsLands(
          sceneRender('three', 'k3-before-the-edit'),
        );
        expect(refused).toEqual(Option.some('render:scenes:three'));
        expect(approval[0]).toBe('none');
        expect(approvals).toBe(0);
      }),
  );

  it.effect('a render of another scene landing leaves the scenes named approved, every one', () =>
    Effect.gen(function* () {
      const { refused, approval, approvals } = yield* approveAsLands(sceneRender('two', 'k2'));
      expect(refused).toEqual(Option.none());
      expect(approval).toEqual(['approved', 'approved']);
      expect(approvals).toBe(2);
    }),
  );
});
