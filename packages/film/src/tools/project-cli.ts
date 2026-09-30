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
//       approve those scenes' renders as they are stamped, an act's current
//       scenes, or every current scene
//   film project withdraw <film> (--scene id,id | --act name | --all) [--variant v] [--json]
//       withdraw every approval of those scenes' renders, whatever version
//   film project comment <film> <text> [--scene id | --act name] [--variant v] [--json]
//       say something of one scene's render (of its sources while it has
//       none), an act or the whole film
//
// `--json` prints the project as it leaves it (`ProjectRead`, `fresh-film.ts`)
// as one line, or the refusal it failed with: what the review's project
// routes read, each in a fresh process.

import { Array as Arr, Clock, Console, Effect, type Layer, Match, Option, Path } from 'effect';
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
  approve,
  approveCurrent,
  comment,
  nextCommentId,
  partSubject,
  projectOf,
  renderIn,
  renderNeed,
  sceneSlot,
  subjectOf,
  withdraw,
} from '../core/catalogue.ts';
import { UnknownAct } from '../core/errors.ts';
import { EncoderName, encoderNamed } from '../core/encoder.ts';
import { type Placed, everyTakeRecorded } from '../core/layout.ts';
import { RenderCatalogue, renderRecord } from './catalogue.ts';
import { ProjectRead, answering, printLine } from './fresh-film.ts';
import { ApprovalUnnamed, SceneNotRendered } from './errors.ts';
import { FilmRepo, type LoadedFilm, placeFilm } from './film-repo.ts';
import { type RenderJob, type RenderOutput, flagConflicts, jobOf } from './render-plan.ts';
import { planKey } from './mixer.ts';
import { Renderer, remuxVideo } from './renderer.ts';
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

/**
 * Re-mux `render` (a scene video stale by its sound alone): its sound cut
 * again from the film's master now, and recorded as it now sounds. None when
 * it recorded no cut to take again (it is drawn instead).
 */
const remuxAndRecord = Effect.fn('film.remuxAndRecord')(function* (
  loaded: LoadedFilm,
  render: Render,
) {
  const path = yield* Path.Path;
  const inProject = (file: string) => path.join(loaded.paths.out, file);
  const cut = Option.all({ clip: render.files.clip, sound: render.sound });
  if (Option.isNone(cut)) return Option.none<string>();
  const { clip, sound } = cut.value;
  const now = yield* remuxVideo(loaded, {
    clip: inProject(clip),
    share: Option.map(render.files.share, inProject),
    pieces: sound.pieces,
  });
  const at = yield* Clock.currentTimeMillis;
  yield* (yield* RenderCatalogue).record(loaded.paths, { ...render, sound: Option.some(now), at });
  return Option.some(clip);
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
  sceneStamps(keys, placed).map(({ scene, stamp }) => ({ scene, key: stamp.key }));

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

/** `effect`, its refusals printed as the answer when the run answers in JSON (the review's read). */
const answeringIf = <A, E, R>(asJson: boolean, effect: Effect.Effect<A, E, R>) => {
  if (asJson) return answering(effect);
  return effect;
};

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
    const { loaded, tree } = yield* answeringIf(input.json, keyed(input.film));
    const catalogue = yield* answeringIf(input.json, (yield* RenderCatalogue).read(loaded.paths));
    yield* show(projectOf(catalogue, tree, input.variant), input.json);
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
        let rendered = 0;
        let remuxed = 0;
        for (const scope of scopes) {
          const id = scope.scenes[0]?.spec.id ?? '';
          const stamp = stampOf(keys, scope);
          const catalogue = yield* catalogues.read(loaded.paths);
          const slot = sceneSlot(id, input.variant);
          const need = Match.value(input.force).pipe(
            Match.when(true, () => 'draw' as const),
            Match.orElse(() =>
              renderNeed(catalogue, slot, { key: stamp.key, sound: tree.sound }, settings),
            ),
          );
          if (need === 'current') {
            yield* Console.log(`${id.padEnd(16)} current`);
            continue;
          }
          const recut = yield* Option.match(
            Option.filter(renderIn(catalogue, slot), () => need === 'remux'),
            {
              onNone: () => Effect.succeedNone,
              onSome: (render) => remuxAndRecord(loaded, render),
            },
          );
          if (Option.isSome(recut)) {
            remuxed += 1;
            yield* Console.log(`${id.padEnd(16)} remuxed ${recut.value}`);
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

/** `scene`'s render of `variant` in `catalogue`, or `SceneNotRendered`. */
const renderOf = (catalogue: Catalogue, film: string, scene: string, variant: string) =>
  Effect.fromOption(renderIn(catalogue, sceneSlot(scene, variant)), () =>
    SceneNotRendered.make({ film, scene, variant }),
  );

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
    const { loaded, placed, tree } = yield* answeringIf(input.json, keyed(input.film));
    const catalogues = yield* RenderCatalogue;
    const at = yield* Clock.currentTimeMillis;
    /** Every current scene of `scenes` approved, in one update. */
    const current = (scenes: ReadonlyArray<SceneKey>) =>
      catalogues.update(loaded.paths, (catalogue) => {
        const done = approveCurrent(catalogue, scenes, tree.sound, input.variant, at);
        return [done.approved, done.catalogue] as const;
      });
    const named = (ids: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        yield* scenesNamed(loaded, placed, Option.some(ids));
        const catalogue = yield* catalogues.read(loaded.paths);
        const renders = yield* Effect.forEach(ids, (id) =>
          renderOf(catalogue, input.film, id, input.variant),
        );
        return yield* catalogues.update(
          loaded.paths,
          (now) =>
            [
              ids,
              renders.reduce((cat, render) => approve(cat, subjectOf(render), at), now),
            ] as const,
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
    const approved = yield* answeringIf(input.json, which);
    yield* Effect.log(`project.approve film=${input.film} scenes=${approved.join(',')}`);
    const catalogue = yield* catalogues.read(loaded.paths);
    yield* show(projectOf(catalogue, tree, input.variant), input.json);
  }),
).pipe(
  Command.withDescription(
    "Approve scenes' renders as they are stamped (--scene id,id), an act's current scenes (--act name), or every scene whose render is current (--all); a new render of a scene makes its approval stale",
  ),
);

const withdrawApprovals = Command.make(
  'withdraw',
  { film, variant: variantFlag, ...partFlags('withdraw'), json },
  Effect.fn('film.project.withdraw')(function* (input) {
    yield* partsNamed(input);
    const { loaded, placed, tree } = yield* answeringIf(input.json, keyed(input.film));
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
    const ids = yield* answeringIf(input.json, which);
    const catalogue = yield* catalogues.update(loaded.paths, (now) => {
      const next = ids.reduce((cat, id) => withdraw(cat, topicOfScene(id, input.variant)), now);
      return [next, next] as const;
    });
    yield* Effect.log(`project.withdraw film=${input.film} scenes=${ids.join(',')}`);
    yield* show(projectOf(catalogue, tree, input.variant), input.json);
  }),
).pipe(
  Command.withDescription(
    "Withdraw the approval of scenes' renders (--scene id,id), an act's scenes (--act name) or every scene (--all), whatever version it was given on",
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
    const { loaded, placed, tree } = yield* answeringIf(input.json, keyed(input.film));
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
    const subject = yield* answeringIf(input.json, about);
    const said = yield* catalogues.update(
      loaded.paths,
      (catalogue) =>
        [nextCommentId(catalogue), comment(catalogue, subject, input.text, at)] as const,
    );
    yield* Effect.log(
      `project.comment film=${input.film} id=${said} at=${addressKey(subject.address)}`,
    );
    yield* show(projectOf(yield* catalogues.read(loaded.paths), tree, input.variant), input.json);
  }),
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
