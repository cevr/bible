// `film project`: a film's project folder (`out/<film>`), scene by scene. Every
// scene renders on its own into the folder, a scene whose render is current
// (its stamp's key is its sources' key now) is skipped, and the owner's
// approvals and comments are kept in the folder's catalogue
// (`core/catalogue.ts`, `catalogue.ts`), each on the render it was given on.
//
//   film project <film> [--variant v] [--json]
//       each scene: current, stale or missing; approved, stale or not; its comments
//   film project render <film> [--variant v] [--scene id,id] [--scale k] [--no-captions]
//                              [--no-share] [--workers n] [--encoder e] [--force]
//       render every scene (or those named) that is not current, each to scenes/<id>/<variant>.mp4
//   film project approve <film> (--scene id,id | --all) [--variant v] [--json]
//       approve those scenes' renders as they are stamped, or every current scene
//   film project comment <film> <scene> <text> [--variant v]
//       say something of one scene's render
//
// `--json` prints the project (`Project`) as one line: what the review's page
// reads.

import {
  Array as Arr,
  Clock,
  Console,
  Effect,
  type Layer,
  Match,
  Option,
  Path,
  Schema,
} from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { type Scope, resolveAddress, sceneAddress } from '../core/address.ts';
import {
  type Catalogue,
  MAIN_VARIANT,
  type Project,
  ProjectJson,
  type ProjectScene,
  type Stamp,
  RenderVariantName,
  approve,
  approveCurrent,
  comment,
  needsRender,
  projectOf,
  renderIn,
  sceneSlot,
} from '../core/catalogue.ts';
import { EncoderName, encoderNamed } from '../core/encoder.ts';
import type { Placed } from '../core/layout.ts';
import { RenderCatalogue, renderRecord } from './catalogue.ts';
import { ApprovalUnnamed, SceneNotRendered } from './errors.ts';
import { FilmRepo, type LoadedFilm, placeFilm } from './film-repo.ts';
import { type RenderJob, flagConflicts, jobOf } from './render-plan.ts';
import { Renderer } from './renderer.ts';
import { type SceneKeys, Stamps, sceneStamps, stampOf } from './stamp.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);

/** `--variant name`: which render of each scene (`main` when none). */
export const variantFlag = Flag.String('variant').pipe(
  Flag.withSchema(RenderVariantName),
  Flag.withDefault(MAIN_VARIANT),
  Flag.withDescription(
    'which render: a look or score option, named in lower case (default main); its files are named for it',
  ),
);

const sceneIds = Flag.String('scene').pipe(
  Flag.optional,
  Flag.map(Option.map((ids: string) => ids.split(','))),
);

const json = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('print the project as one line of JSON'),
);

/**
 * Render `job` (drawing `scope` from sources stamped `stamp`) and record what
 * it wrote in the film's catalogue; a video sent to `--out` lies outside the
 * project folder and is not recorded.
 */
export const renderAndRecord = Effect.fn('film.renderAndRecord')(function* (
  loaded: LoadedFilm,
  scope: Pick<Scope, 'span'>,
  job: RenderJob,
  stamp: Stamp,
) {
  const output = yield* (yield* Renderer).render(loaded, job);
  if (job._tag === 'Video' && Option.isSome(job.out)) {
    yield* Effect.log(`catalogue.skip reason=out file=${job.out.value}`);
    return output;
  }
  const path = yield* Path.Path;
  const at = yield* Clock.currentTimeMillis;
  yield* (yield* RenderCatalogue).record(
    loaded.paths,
    renderRecord(loaded.paths, job, scope, stamp, output, at, path),
  );
  return output;
});

/** The film loaded and laid out, with its scenes' keys now. */
const keyed = Effect.fn('film.project.keyed')(function* (name: string) {
  const loaded = yield* (yield* FilmRepo).load(name);
  const placed = yield* placeFilm(loaded);
  const keys = yield* (yield* Stamps).scenes(loaded, placed);
  return { loaded, placed, keys };
});

/** Each scene with its own stamp's key: what the project compares its renders with. */
const sceneKeys = (keys: SceneKeys, placed: ReadonlyArray<Placed>) =>
  sceneStamps(keys, placed).map(({ scene, stamp }) => ({ scene, key: stamp.key }));

/** One scene of the project as a line: its state, its approval, its comments, its clip. */
const sceneLine = (scene: ProjectScene): string => {
  const clip = Option.flatMap(scene.render, (r) => r.files.clip);
  const said = scene.comments.map(
    (c) => `\n    ${Arr.filter(['(earlier) '], () => !c.onThisRender).join('')}${c.text}`,
  );
  return `${scene.scene.padEnd(16)} ${scene.state.padEnd(8)} ${scene.approval.padEnd(9)}${Option.match(
    clip,
    { onNone: () => '', onSome: (file) => ` ${file}` },
  )}${said.join('')}`;
};

/** Print the project: one line of JSON, or a line a scene. */
const show = (project: Project, asJson: boolean) =>
  Match.value(asJson).pipe(
    Match.when(true, () => Effect.flatMap(Schema.encodeEffect(ProjectJson)(project), Console.log)),
    Match.orElse(() =>
      Effect.forEach(project.scenes, (scene) => Console.log(sceneLine(scene)), { discard: true }),
    ),
  );

/** The film's scenes named by `ids` (every one when none), each checked against the layout. */
const scenesNamed = (
  loaded: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  ids: Option.Option<ReadonlyArray<string>>,
) =>
  Effect.forEach(
    Option.getOrElse(ids, () => placed.map((p) => p.spec.id)),
    (id) =>
      Effect.fromResult(
        resolveAddress(
          { name: loaded.paths.name, placed, look: loaded.look, shorts: loaded.shorts },
          sceneAddress(id),
        ),
      ),
  );

const status = Command.make(
  'project',
  { film, variant: variantFlag, json },
  Effect.fn('film.project')(function* (input) {
    const { loaded, placed, keys } = yield* keyed(input.film);
    const catalogue = yield* (yield* RenderCatalogue).read(loaded.paths);
    yield* show(projectOf(catalogue, sceneKeys(keys, placed), input.variant), input.json);
  }),
);

const renderScenes = <E, R>(renderLayer: Layer.Layer<Renderer, E, R>) =>
  Command.make(
    'render',
    {
      film,
      variant: variantFlag,
      scene: sceneIds.pipe(Flag.withDescription('only these scenes (id,id); default every scene')),
      scale: Flag.Finite('scale').pipe(
        Flag.withDefault(1),
        Flag.withDescription('scale the videos, e.g. 0.5 for a quick look (default 1)'),
      ),
      captions: Flag.Boolean('captions').pipe(
        Flag.withDefault(true),
        Flag.withDescription('burn the captions in (--no-captions to leave them out)'),
      ),
      share: Flag.Boolean('share').pipe(
        Flag.withDefault(true),
        Flag.withDescription('also write each scene a smaller copy to send (--no-share to skip)'),
      ),
      workers: Flag.Int('workers').pipe(
        Flag.optional,
        Flag.withDescription("pages rendering each scene at once (default: the encoder's)"),
      ),
      encoder: Flag.Literals('encoder', EncoderName.literals).pipe(
        Flag.optional,
        Flag.map(Option.map(encoderNamed)),
        Flag.withDescription('encode with this H.264 encoder only (as `film render --encoder`)'),
      ),
      force: Flag.Boolean('force').pipe(
        Flag.withDefault(false),
        Flag.withDescription('render every scene named, current or not'),
      ),
    },
    Effect.fn('film.project.render')(function* (input) {
      const { loaded, placed, keys } = yield* keyed(input.film);
      const catalogues = yield* RenderCatalogue;
      const settings = { scale: input.scale, captions: input.captions };
      const scopes = yield* scenesNamed(loaded, placed, input.scene);
      let rendered = 0;
      for (const scope of scopes) {
        const id = scope.scenes[0]?.spec.id ?? '';
        const stamp = stampOf(keys, scope);
        const catalogue = yield* catalogues.read(loaded.paths);
        if (
          !input.force &&
          !needsRender(catalogue, sceneSlot(id, input.variant), stamp.key, settings)
        ) {
          yield* Console.log(`${id.padEnd(16)} current`);
          continue;
        }
        const job = yield* Effect.fromResult(
          jobOf({
            variant: input.variant,
            captions: input.captions,
            workers: input.workers,
            stills: Option.none(),
            contact: Option.none(),
            scope,
            from: Option.none(),
            to: Option.none(),
            scale: Option.some(input.scale),
            out: Option.none(),
            share: Option.some(input.share),
            encoder: input.encoder,
          }),
        );
        const output = yield* renderAndRecord(loaded, scope, job, stamp);
        rendered += 1;
        yield* Console.log(`${id.padEnd(16)} rendered ${Option.getOrElse(output.clip, () => '')}`);
      }
      yield* Effect.log(
        `project.render film=${input.film} variant=${input.variant} rendered=${rendered} current=${scopes.length - rendered}`,
      );
    }, Effect.provide(renderLayer)),
  ).pipe(
    Command.withDescription(
      "Render each scene on its own into the film's project folder (out/<film>/scenes/<id>/<variant>.mp4), skipping a scene whose render is current",
    ),
  );

/** `scene`'s render of `variant` in `catalogue`, or `SceneNotRendered`. */
const renderOf = (catalogue: Catalogue, film: string, scene: string, variant: string) =>
  Effect.fromOption(renderIn(catalogue, sceneSlot(scene, variant)), () =>
    SceneNotRendered.make({ film, scene, variant }),
  );

const approveScenes = Command.make(
  'approve',
  {
    film,
    variant: variantFlag,
    scene: sceneIds.pipe(Flag.withDescription("approve these scenes' renders (id,id)")),
    all: Flag.Boolean('all').pipe(
      Flag.withDefault(false),
      Flag.withDescription('approve every scene whose render is current'),
    ),
    json,
  },
  Effect.fn('film.project.approve')(function* (input) {
    yield* Effect.fromResult(
      flagConflicts(
        new Set([
          ...Arr.filter(['all'], () => input.all),
          ...Option.toArray(Option.as(input.scene, 'scene')),
        ]),
        [['all', 'excludes', 'scene', 'approve the scenes named or every current one, not both']],
      ),
    );
    const { loaded, placed, keys } = yield* keyed(input.film);
    const catalogues = yield* RenderCatalogue;
    const at = yield* Clock.currentTimeMillis;
    const scenes = sceneKeys(keys, placed);
    const approved = yield* Option.match(input.scene, {
      onNone: () =>
        Match.value(input.all).pipe(
          Match.when(true, () =>
            catalogues.update(loaded.paths, (catalogue) => {
              const done = approveCurrent(catalogue, scenes, input.variant, at);
              return [done.approved, done.catalogue] as const;
            }),
          ),
          Match.orElse(() => Effect.fail(ApprovalUnnamed.make({ film: input.film }))),
        ),
      onSome: (ids) =>
        Effect.gen(function* () {
          yield* scenesNamed(loaded, placed, Option.some(ids));
          const catalogue = yield* catalogues.read(loaded.paths);
          const renders = yield* Effect.forEach(ids, (id) =>
            renderOf(catalogue, input.film, id, input.variant),
          );
          return yield* catalogues.update(
            loaded.paths,
            (now) => [ids, renders.reduce((cat, render) => approve(cat, render, at), now)] as const,
          );
        }),
    });
    yield* Effect.log(`project.approve film=${input.film} scenes=${approved.join(',')}`);
    const catalogue = yield* catalogues.read(loaded.paths);
    yield* show(projectOf(catalogue, scenes, input.variant), input.json);
  }),
).pipe(
  Command.withDescription(
    "Approve scenes' renders as they are stamped (--scene id,id), or every scene whose render is current (--all); a new render of a scene makes its approval stale",
  ),
);

const commentScene = Command.make(
  'comment',
  {
    film,
    scene: Argument.String('scene').pipe(Argument.withDescription('the scene, by id')),
    text: Argument.String('text').pipe(Argument.withDescription('what to say of its render')),
    variant: variantFlag,
  },
  Effect.fn('film.project.comment')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const at = yield* Clock.currentTimeMillis;
    const catalogues = yield* RenderCatalogue;
    const render = yield* renderOf(
      yield* catalogues.read(loaded.paths),
      input.film,
      input.scene,
      input.variant,
    );
    const said = yield* catalogues.update(loaded.paths, (catalogue) => {
      const id = `c${catalogue.comments.length + 1}`;
      return [id, comment(catalogue, render, input.text, id, at)] as const;
    });
    yield* Console.log(`${said} ${input.scene} ${input.text}`);
  }),
).pipe(
  Command.withDescription(
    "Say something of one scene's render, kept with the render it was said on",
  ),
);

/** `film project`, its scenes rendered on `renderLayer`. */
export const project = <E, R>(renderLayer: Layer.Layer<Renderer, E, R>) =>
  status.pipe(
    Command.withDescription(
      "A film's project folder scene by scene: each scene's render (current, stale or missing), its approval and its comments",
    ),
    Command.withSubcommands([renderScenes(renderLayer), approveScenes, commentScene]),
  );
