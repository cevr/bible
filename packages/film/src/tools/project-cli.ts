// `film project`: a film's project folder (`out/<film>`), scene by scene. Every
// scene renders on its own into the folder, a scene whose render is current
// (its stamp's key is its sources' key now, and it carries the mix the film
// makes now) is skipped, a scene stale by its sound alone is re-muxed (its
// sound cut again from the master, nothing drawn), and the owner's approvals
// and comments are kept in the folder's catalogue (`core/catalogue.ts`,
// `catalogue.ts`), each on the render as it was when given.
//
//   film project <film> [--variant v] [--json]
//       the film's comments, then each act (its comments) and its scenes: each
//       scene current, stale (by its sources, or stale:sound) or missing;
//       approved, stale or not; its comments
//   film project render <film> [--variant v] [--scene id,id] [--scale k] [--no-captions]
//                              [--no-share] [--workers n] [--encoder e] [--force]
//       render every scene (or those named) that is not current, each to
//       scenes/<id>/<variant>.mp4, all through one probe and one pool of pages
//       (`Renderer.session`); one stale by its sound alone is re-muxed
//   film project approve <film> (--scene id,id | --act name | --all) [--variant v] [--json]
//       approve those scenes' renders, each current (a stale or missing one
//       named is refused, and nothing approved), an act's current scenes, or
//       every current scene
//   film project withdraw <film> (--scene id,id | --act name | --all) [--variant v] [--json]
//       withdraw every approval of those scenes' renders, whatever version
//   film project comment <film> <text> [--scene id | --act name] [--variant v] [--json]
//       say something of one scene's render (of its sources while it has
//       none), an act or the whole film
//
// `--json` prints the project as it leaves it (`ProjectRead`, `fresh-film.ts`)
// as one line, or the refusal it failed with: what the review's project
// routes read, each in a fresh process.

import {
  Array as Arr,
  Clock,
  Console,
  Effect,
  type Layer,
  Match,
  Option,
  Path,
  Result,
} from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { type Scope, addressKey, resolveAddress, sceneAddress } from '../core/address.ts';
import {
  type ActKey,
  type Catalogue,
  type Keyed,
  MAIN_VARIANT,
  type Project,
  type ProjectScene,
  type Render,
  RenderVariantName,
  type SaidComment,
  type SceneKey,
  type Stamp,
  type Topic,
  approveCurrent,
  comment,
  gaveOf,
  nextCommentId,
  partSubject,
  projectOf,
  renderIn,
  renderNeed,
  renderState,
  sceneSlot,
  subjectOf,
  tookOf,
  withdrawScenes,
} from '../core/catalogue.ts';
import { approvalRefused } from '../core/choice.ts';
import { uniqueId } from '../core/unique.ts';
import { UnknownAct } from '../core/errors.ts';
import { pointIdOf } from '../core/point.ts';
import { SceneNotRendered, VerbRefused, renderCommand } from '../core/refusals.ts';
import { EncoderName, encoderNamed } from '../core/encoder.ts';
import { type Placed, everyTakeRecorded } from '../core/layout.ts';
import { RenderCatalogue, renderRecord } from './catalogue.ts';
import { ProjectRead, answering, printLine } from './fresh-film.ts';
import { ApprovalUnnamed } from './errors.ts';
import { FilmRepo, type LoadedFilm, placeFilm } from './film-repo.ts';
import { type RenderJob, type RenderOutput, flagConflicts, jobOf } from './render-plan.ts';
import { planKey } from './mixer.ts';
import { type Remux, type Remuxed, Renderer, remuxer } from './renderer.ts';
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
  return yield* recordOutput(loaded, scope, job, stamp, output);
});

/** What `job` wrote recorded in the film's catalogue, unless it went to `--out`. */
const recordOutput = Effect.fn('film.recordOutput')(function* (
  loaded: LoadedFilm,
  scope: Pick<Scope, 'span'>,
  job: RenderJob,
  stamp: Stamp,
  output: RenderOutput,
) {
  if (job._tag === 'Video' && Option.isSome(job.out)) {
    yield* Effect.log(`catalogue.skip reason=out file=${job.out.value}`);
    return output;
  }
  const path = yield* Path.Path;
  const at = yield* Clock.currentTimeMillis;
  // A range the command narrowed it to is its span, not the address's whole.
  const drawn = { span: Option.orElse(output.span, () => scope.span) };
  yield* (yield* RenderCatalogue).record(
    loaded.paths,
    renderRecord(loaded.paths, job, drawn, stamp, output, at, path),
  );
  return output;
});

/** A scene video stale by its sound alone, and the video a re-mux cuts its sound into again. */
interface Recut {
  readonly render: Render;
  readonly clip: string;
  readonly video: Remuxed;
}

/** `render` as a re-mux takes it: none when it recorded no cut to take again (it is drawn instead). */
const recutOf = (loaded: LoadedFilm, path: Path.Path, render: Render): Option.Option<Recut> =>
  Option.map(Option.all({ clip: render.files.clip, sound: render.sound }), ({ clip, sound }) => {
    const inProject = (file: string) => path.join(loaded.paths.out, file);
    return {
      render,
      clip,
      video: {
        clip: inProject(clip),
        share: Option.map(render.files.share, inProject),
        pieces: sound.pieces,
      },
    };
  });

/** Re-mux `recut` with the run's `remux`, and record it as it now sounds. */
const remuxAndRecord = Effect.fn('film.remuxAndRecord')(function* (
  loaded: LoadedFilm,
  remux: Remux,
  recut: Recut,
) {
  const now = yield* remux(recut.video);
  const at = yield* Clock.currentTimeMillis;
  yield* (yield* RenderCatalogue).record(loaded.paths, {
    ...recut.render,
    sound: Option.some(now),
    at,
  });
});

/** The mix a scene's video carries now: the plan the film mixes to, once every take is recorded. */
const soundNow = (loaded: LoadedFilm, placed: ReadonlyArray<Placed>) =>
  Effect.gen(function* () {
    if (!everyTakeRecorded(placed)) return Option.none<string>();
    return yield* planKey(loaded, placed);
  });

/** The film loaded and laid out, with its scenes' keys now and its address tree keyed. */
const keyed = Effect.fn('film.project.keyed')(function* (name: string) {
  const loaded = yield* (yield* FilmRepo).load(name);
  const placed = yield* placeFilm(loaded);
  const keys = yield* (yield* Stamps).scenes(loaded, placed);
  const addressable = { name: loaded.paths.name, placed, look: loaded.look, shorts: loaded.shorts };
  const whole = yield* Effect.fromResult(resolveAddress(addressable, { _tag: 'Film' }));
  const acts = yield* Effect.forEach(whole.acts, (act) =>
    Effect.map(
      Effect.fromResult(resolveAddress(addressable, { _tag: 'Act', act: act.part.name })),
      (scope): ActKey => ({
        act: act.part.name,
        scenes: scope.scenes.map((p) => p.spec.id),
        key: stampOf(keys, scope).key,
      }),
    ),
  );
  const tree: Keyed = {
    key: stampOf(keys, whole).key,
    sound: yield* soundNow(loaded, placed),
    acts,
    scenes: sceneKeys(keys, placed),
  };
  return { loaded, placed, keys, tree };
});

/** Each scene with its own stamp's key: what the project compares its renders with. */
const sceneKeys = (keys: SceneKeys, placed: ReadonlyArray<Placed>) =>
  Arr.zipWith(sceneStamps(keys, placed), placed, ({ scene, stamp }, p) => ({
    scene,
    key: stamp.key,
    span: { start: p.start, dur: p.dur },
  }));

/** What was said, a line each, marked when it was said of an earlier version. */
const saidLines = (comments: ReadonlyArray<SaidComment>, indent: string): string =>
  comments
    .map((c) => `\n${indent}${Arr.filter(['(earlier) '], () => !c.onThis).join('')}${c.text}`)
    .join('');

/** A scene's state as a word: `current`, `missing`, `stale` (its sources) or `stale:sound`. */
const stateWord = (scene: ProjectScene): string =>
  Option.match(
    Option.filter(scene.staleBy, (by) => by === 'sound'),
    {
      onNone: () => scene.state,
      onSome: (by) => `${scene.state}:${by}`,
    },
  );

/** One scene of the project as a line: its state, its approval, its comments, its clip. */
const sceneLine = (scene: ProjectScene): string => {
  const clip = Option.flatMap(scene.render, (r) => r.files.clip);
  return `  ${scene.scene.padEnd(16)} ${stateWord(scene).padEnd(11)} ${scene.approval.padEnd(9)}${Option.match(
    clip,
    { onNone: () => '', onSome: (file) => ` ${file}` },
  )}${saidLines(scene.comments, '      ')}`;
};

/** The project as lines: the film's comments, then each act with its comments and its scenes. */
const projectLines = (project: Project): ReadonlyArray<string> => {
  const inActs = new Set(project.acts.flatMap((a) => a.scenes));
  const scenesOf = (ids: ReadonlyArray<string>) =>
    project.scenes.filter((s) => ids.includes(s.scene)).map(sceneLine);
  const loose = project.scenes.filter((s) => !inActs.has(s.scene)).map((s) => s.scene);
  return [
    `${project.film} (${project.variant})${saidLines(project.comments, '    ')}`,
    ...project.acts.flatMap((act) => [
      `${act.name}${saidLines(act.comments, '    ')}`,
      ...scenesOf(act.scenes),
    ]),
    ...scenesOf(loose),
  ];
};

/** Print the project: one line of JSON (`ProjectRead`, what the review reads), or its lines. */
const show = (project: Project, asJson: boolean) =>
  Match.value(asJson).pipe(
    Match.when(true, () => printLine(ProjectRead.make({ project }))),
    Match.orElse(() =>
      Effect.forEach(projectLines(project), (line) => Console.log(line), { discard: true }),
    ),
  );

/** `effect`, the failure it names printed as the answer when the run answers in JSON (the review's read). */
const answeringIf = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  input: { readonly json: boolean },
) => {
  if (input.json) return answering(effect);
  return effect;
};

/** The film's scenes named by `ids` (every one when none), each checked against the layout and kept with its id. */
const scenesNamed = (
  loaded: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  ids: Option.Option<ReadonlyArray<string>>,
) =>
  Effect.forEach(
    Option.getOrElse(ids, () => placed.map((p) => p.spec.id)),
    (id) =>
      Effect.map(
        Effect.fromResult(
          resolveAddress(
            { name: loaded.paths.name, placed, look: loaded.look, shorts: loaded.shorts },
            sceneAddress(id),
          ),
        ),
        (scope) => ({ ...scope, id }),
      ),
  );

/** The act `name` of the keyed film, or `UnknownAct` naming the acts it has. */
const actNamed = (tree: Keyed, name: string) =>
  Effect.fromOption(
    Arr.findFirst(tree.acts, (a) => a.act === name),
    () => UnknownAct.make({ act: name, known: tree.acts.map((a) => a.act) }),
  );

const status = Command.make(
  'project',
  { film, variant: variantFlag, json },
  Effect.fn('film.project')(function* (input) {
    const { loaded, tree } = yield* keyed(input.film);
    const catalogue = yield* (yield* RenderCatalogue).read(loaded.paths);
    yield* show(projectOf(catalogue, tree, input.variant), input.json);
  }, answeringIf),
);

/** A scene of a `project render` run, as its `scenesNamed` scope. */
type SceneScope = Effect.Success<ReturnType<typeof scenesNamed>>[number];

/** One scene of a `project render` run: what it needs, and the video a re-mux cuts again. */
interface SceneRun {
  readonly scope: SceneScope;
  readonly id: string;
  readonly stamp: Stamp;
  readonly need: ReturnType<typeof renderNeed>;
  /** Some when the scene is stale by its sound alone and its video recorded the cut. */
  readonly recut: Option.Option<Recut>;
}

/**
 * What each of `scopes` needs against `catalogue`: current, a re-mux of its
 * video, or a draw (every one with `force`). The run reads it before it
 * draws or cuts anything; each scene's record touches its own slot only.
 */
const sceneRuns = (run: {
  readonly loaded: LoadedFilm;
  readonly path: Path.Path;
  readonly catalogue: Catalogue;
  readonly now: (stamp: Stamp) => Parameters<typeof renderNeed>[2];
  readonly settings: Parameters<typeof renderNeed>[3];
  readonly variant: string;
  readonly force: boolean;
  readonly keys: SceneKeys;
  readonly scopes: ReadonlyArray<SceneScope>;
}): ReadonlyArray<SceneRun> =>
  run.scopes.map((scope) => {
    const { id } = scope;
    const stamp = stampOf(run.keys, scope);
    const slot = sceneSlot(id, run.variant);
    const need = Match.value(run.force).pipe(
      Match.when(true, () => 'draw' as const),
      Match.orElse(() => renderNeed(run.catalogue, slot, run.now(stamp), run.settings)),
    );
    const recut = Option.flatMap(
      Option.filter(renderIn(run.catalogue, slot), () => need === 'remux'),
      (render) => recutOf(run.loaded, run.path, render),
    );
    return { scope, id, stamp, need, recut };
  });

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
    Effect.fn('film.project.render')(
      function* (input) {
        const { loaded, placed, keys, tree } = yield* keyed(input.film);
        const catalogues = yield* RenderCatalogue;
        const settings = { scale: input.scale, captions: input.captions };
        const scopes = yield* scenesNamed(loaded, placed, input.scene);
        // Every scene drawn in this run shares one probe and one pool of pages,
        // opened only once a scene draws (Chromium launches with the first
        // page): a run where each is current or re-muxed opens no browser.
        const drawn = yield* (yield* Renderer).session;
        // What each scene needs, decided from the catalogue before anything is drawn or cut.
        const runs = sceneRuns({
          loaded,
          path: yield* Path.Path,
          catalogue: yield* catalogues.read(loaded.paths),
          now: (stamp) => ({ key: stamp.key, sound: tree.sound }),
          settings,
          variant: input.variant,
          force: input.force,
          keys,
          scopes,
        });
        // A scene stale by its sound alone is re-muxed: when the run re-muxes any, the master
        // is checked and decoded once, for all of them.
        const remux = yield* Effect.when(
          remuxer(loaded),
          Effect.sync(() => runs.some((run) => Option.isSome(run.recut))),
        );
        let rendered = 0;
        let remuxed = 0;
        for (const { scope, id, stamp, need, recut } of runs) {
          if (need === 'current') {
            yield* Console.log(`${id.padEnd(16)} current`);
            continue;
          }
          const remuxing = Option.all({ recut, remux });
          if (Option.isSome(remuxing)) {
            yield* remuxAndRecord(loaded, remuxing.value.remux, remuxing.value.recut);
            remuxed += 1;
            yield* Console.log(`${id.padEnd(16)} remuxed ${remuxing.value.recut.clip}`);
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
          const output = yield* recordOutput(
            loaded,
            scope,
            job,
            stamp,
            yield* drawn.render(loaded, job),
          );
          rendered += 1;
          yield* Console.log(
            `${id.padEnd(16)} rendered ${Option.getOrElse(output.clip, () => '')}`,
          );
        }
        yield* Effect.log(
          `project.render film=${input.film} variant=${input.variant} rendered=${rendered} remuxed=${remuxed} current=${scopes.length - rendered - remuxed}`,
        );
      },
      Effect.scoped,
      Effect.provide(renderLayer),
    ),
  ).pipe(
    Command.withDescription(
      "Render each scene on its own into the film's project folder (out/<film>/scenes/<id>/<variant>.mp4), skipping a scene whose render is current and re-muxing one stale by its sound alone (its sound cut again from the master, nothing drawn)",
    ),
  );

/** What a say on `scene`'s render of `variant` is about, whichever version it is. */
const topicOfScene = (scene: string, variant: string): Topic => ({
  address: sceneAddress(scene),
  point: Option.none(),
  variant,
});

/** What `--act` and `--all` do, said for each verb that takes them. */
const PART_TEXT = {
  approve: {
    act: 'approve every scene of this act whose render is current',
    all: 'approve every scene whose render is current',
  },
  withdraw: {
    act: "withdraw the approvals of this act's scenes",
    all: 'withdraw the approval of every scene',
  },
} as const;

/** `--scene id,id`, `--act name` or `--all`: which parts an approval or a withdrawal is of. */
const partFlags = (verb: 'approve' | 'withdraw') => ({
  scene: sceneIds.pipe(Flag.withDescription(`${verb} these scenes' renders (id,id)`)),
  act: Flag.String('act').pipe(Flag.optional, Flag.withDescription(PART_TEXT[verb].act)),
  all: Flag.Boolean('all').pipe(Flag.withDefault(false), Flag.withDescription(PART_TEXT[verb].all)),
});

/** The parts named: at most one of `--scene`, `--act` and `--all`. */
const partsNamed = (input: {
  readonly scene: Option.Option<ReadonlyArray<string>>;
  readonly act: Option.Option<string>;
  readonly all: boolean;
}) =>
  Effect.fromResult(
    flagConflicts(
      new Set([
        ...Arr.filter(['all'], () => input.all),
        ...Option.toArray(Option.as(input.scene, 'scene')),
        ...Option.toArray(Option.as(input.act, 'act')),
      ]),
      [
        ['all', 'excludes', 'scene', 'name the scenes or every scene, not both'],
        ['all', 'excludes', 'act', 'name an act or every scene, not both'],
        ['act', 'excludes', 'scene', 'name the scenes or an act, not both'],
      ],
    ),
  );

const approveScenes = Command.make(
  'approve',
  { film, variant: variantFlag, ...partFlags('approve'), json },
  Effect.fn('film.project.approve')(function* (input) {
    yield* partsNamed(input);
    const { loaded, placed, tree } = yield* keyed(input.film);
    const catalogues = yield* RenderCatalogue;
    const at = yield* Clock.currentTimeMillis;
    // This run's identity, on every approval it adds: its undo takes those and no other,
    // another run's stamped at the very same moment too.
    const op = yield* uniqueId;
    /**
     * Every current scene of `scenes` approved, in one update: those it
     * approved, and those it made approved, read under the catalogue's lock.
     */
    const current = (scenes: ReadonlyArray<SceneKey>) =>
      catalogues.update(loaded.paths, (catalogue) => {
        const done = approveCurrent(catalogue, scenes, tree.sound, input.variant, at, op);
        return [{ approved: done.approved, made: done.made }, done.catalogue] as const;
      });
    /** Why `scene` cannot be approved in `catalogue`, naming how to make it so; none while its render is current. */
    const refusalOf = (
      catalogue: Catalogue,
      { scene, key }: SceneKey,
    ): Option.Option<SceneNotRendered | VerbRefused> =>
      Option.match(renderIn(catalogue, sceneSlot(scene, input.variant)), {
        onNone: () =>
          Option.some(SceneNotRendered.make({ film: input.film, scene, variant: input.variant })),
        onSome: (render) =>
          Option.map(
            approvalRefused('render', renderState(Option.some(render), { key, sound: tree.sound })),
            (why) =>
              VerbRefused.make({
                point: pointIdOf({ _tag: 'Render', address: sceneAddress(scene) }),
                variant: input.variant,
                verb: 'approve',
                reason: `${why} (${renderCommand(input.film, scene, input.variant)})`,
              }),
          ),
      });
    /**
     * The scenes `ids` approved, all of them or none: each is checked and
     * approved in the one write that holds the catalogue's lock, so a render
     * landing meanwhile is seen (and refused, naming its scene) rather than
     * skipped.
     */
    const named = (ids: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        yield* scenesNamed(loaded, placed, Option.some(ids));
        const scenes = tree.scenes.filter((s) => ids.includes(s.scene));
        return yield* catalogues.attempt(loaded.paths, (catalogue) =>
          Option.match(
            Arr.findFirst(scenes, (s) => refusalOf(catalogue, s)),
            {
              onSome: Result.fail,
              onNone: () => {
                const done = approveCurrent(catalogue, scenes, tree.sound, input.variant, at, op);
                return Result.succeed([
                  { approved: done.approved, made: done.made },
                  done.catalogue,
                ] as const);
              },
            },
          ),
        );
      });
    const inAct = (name: string) =>
      Effect.flatMap(actNamed(tree, name), (act) =>
        current(tree.scenes.filter((s) => act.scenes.includes(s.scene))),
      );
    const which = Effect.gen(function* () {
      if (Option.isSome(input.scene)) return yield* named(input.scene.value);
      if (Option.isSome(input.act)) return yield* inAct(input.act.value);
      if (input.all) return yield* current(tree.scenes);
      return yield* ApprovalUnnamed.make({ film: input.film, verb: 'approve' });
    });
    const { approved, made } = yield* which;
    yield* Effect.log(
      `project.approve film=${input.film} scenes=${approved.join(',')} made=${made.join(',')} op=${op}`,
    );
    const catalogue = yield* catalogues.read(loaded.paths);
    // The answer says what this approve gave, so its undo withdraws exactly that (`--given <op>`).
    yield* show(
      { ...projectOf(catalogue, tree, input.variant), gave: gaveOf(made, at, op) },
      input.json,
    );
  }, answeringIf),
).pipe(
  Command.withDescription(
    "Approve scenes' renders, each current (--scene id,id: a stale or missing one is refused, naming why), an act's current scenes (--act name), or every scene whose render is current (--all); a new render of a scene makes its approval stale. Its JSON answer's `gave` names this run's op, the moment and the scenes whose approval it added",
  ),
);

const withdrawApprovals = Command.make(
  'withdraw',
  {
    film,
    variant: variantFlag,
    ...partFlags('withdraw'),
    given: Flag.String('given').pipe(
      Flag.optional,
      Flag.withDescription(
        'withdraw only the approvals one approve gave (its op, `gave.op`): undo that approve, leaving every other approval alone',
      ),
    ),
    json,
  },
  Effect.fn('film.project.withdraw')(function* (input) {
    yield* partsNamed(input);
    const { loaded, placed, tree } = yield* keyed(input.film);
    const catalogues = yield* RenderCatalogue;
    const which = Effect.gen(function* () {
      if (Option.isSome(input.scene)) {
        yield* scenesNamed(loaded, placed, input.scene);
        return input.scene.value;
      }
      if (Option.isSome(input.act)) return (yield* actNamed(tree, input.act.value)).scenes;
      if (input.all) return tree.scenes.map((s) => s.scene);
      return yield* ApprovalUnnamed.make({ film: input.film, verb: 'withdraw' });
    });
    const ids = yield* which;
    const { catalogue, took } = yield* catalogues.update(loaded.paths, (now) => {
      const done = withdrawScenes(now, ids, input.variant, input.given);
      return [done, done.catalogue] as const;
    });
    yield* Effect.log(
      `project.withdraw film=${input.film} scenes=${ids.join(',')} took=${took.join(',')}${Option.match(input.given, { onNone: () => '', onSome: (g) => ` given=${g}` })}`,
    );
    // An undo's answer says what it took: none, when the approvals it names are gone already.
    yield* show(
      { ...projectOf(catalogue, tree, input.variant), took: tookOf(input.given, took) },
      input.json,
    );
  }, answeringIf),
).pipe(
  Command.withDescription(
    "Withdraw the approval of scenes' renders (--scene id,id), an act's scenes (--act name) or every scene (--all), whatever version it was given on; with --given <op>, only the approvals that approve run gave, its JSON answer's `took` naming the scenes it took one from",
  ),
);

const commentOn = Command.make(
  'comment',
  {
    film,
    text: Argument.String('text').pipe(Argument.withDescription('what to say')),
    scene: Flag.String('scene').pipe(
      Flag.optional,
      Flag.withDescription("say it of this scene's render (by id)"),
    ),
    act: Flag.String('act').pipe(
      Flag.optional,
      Flag.withDescription('say it of this act as it is now'),
    ),
    variant: variantFlag,
    json,
  },
  Effect.fn('film.project.comment')(function* (input) {
    yield* Effect.fromResult(
      flagConflicts(
        new Set([
          ...Option.toArray(Option.as(input.scene, 'scene')),
          ...Option.toArray(Option.as(input.act, 'act')),
        ]),
        [['act', 'excludes', 'scene', 'say it of a scene or of an act, not both']],
      ),
    );
    const { loaded, placed, tree } = yield* keyed(input.film);
    const at = yield* Clock.currentTimeMillis;
    const catalogues = yield* RenderCatalogue;
    // A scene's comment is on its render as stamped, or on its sources as they are now
    // while it has none; an act's or the film's on it as it is now.
    const about = Effect.gen(function* () {
      if (Option.isSome(input.scene)) {
        const scene = input.scene.value;
        yield* scenesNamed(loaded, placed, Option.some([scene]));
        const catalogue = yield* catalogues.read(loaded.paths);
        return Option.match(renderIn(catalogue, sceneSlot(scene, input.variant)), {
          onSome: subjectOf,
          onNone: () => ({
            ...topicOfScene(scene, input.variant),
            key: Option.getOrElse(
              Option.map(
                Arr.findFirst(tree.scenes, (s) => s.scene === scene),
                (s) => s.key,
              ),
              () => '',
            ),
          }),
        });
      }
      if (Option.isSome(input.act)) {
        const act = yield* actNamed(tree, input.act.value);
        return partSubject({ _tag: 'Act', act: act.act }, input.variant, act.key);
      }
      return partSubject({ _tag: 'Film' }, input.variant, tree.key);
    });
    const subject = yield* about;
    const said = yield* catalogues.update(
      loaded.paths,
      (catalogue) =>
        [nextCommentId(catalogue), comment(catalogue, subject, input.text, at)] as const,
    );
    yield* Effect.log(
      `project.comment film=${input.film} id=${said} at=${addressKey(subject.address)}`,
    );
    yield* show(projectOf(yield* catalogues.read(loaded.paths), tree, input.variant), input.json);
  }, answeringIf),
).pipe(
  Command.withDescription(
    "Say something of one scene's render (--scene; of its sources as they are now while it has none), an act (--act) or the whole film, kept with the version it was said on",
  ),
);

/** `film project`, its scenes rendered on `renderLayer`. */
export const project = <E, R>(renderLayer: Layer.Layer<Renderer, E, R>) =>
  status.pipe(
    Command.withDescription(
      "A film's project folder scene by scene: each scene's render (current, stale or missing), its approval and its comments",
    ),
    Command.withSubcommands([
      renderScenes(renderLayer),
      approveScenes,
      withdrawApprovals,
      commentOn,
    ]),
  );
