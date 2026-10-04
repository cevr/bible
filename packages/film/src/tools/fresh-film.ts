// A film read, checked or changed by the film CLI in a fresh process: the one
// seam "run this CLI again and read what it prints". The review runs for
// days, and the lab for hours, and Bun keeps every module it imported as it
// was at the import, so a film's `sound.ts` (its score options, what `play`
// names), its palette's looks, its script, its voice, its scenes and the
// app's sound library, read in their own process, stay as they were at
// start. Each call here runs the film CLI again (`film options …`,
// `choices-cli.ts`; `film read …`, `read-cli.ts`; `film project … --json`,
// `project-cli.ts`; `film check … --json`), which imports the
// film as it stands on disk.
//
// Two answers come back. A command answers with one line of JSON
// (`FreshLine`): its answer, or the refusal it failed with, raised here again
// as itself; any other failure it names (a film that does not load) comes back
// as `ServerFailed`, its tag and its words. `film check --json` answers with one `CheckLine` per finding; a
// check that cannot run is itself one error finding. Logs go to stderr.

import {
  Array as Arr,
  Console,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Predicate,
  Schema,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { ServerFailed } from '../core/api.ts';
import { Project } from '../core/catalogue.ts';
import { ChoicePoint, type ChoiceVerb } from '../core/choice.ts';
import { UnknownAct, UnknownScene } from '../core/errors.ts';
import {
  CatalogueInvalid,
  ChoiceUnknown,
  FilmUnknown,
  FreshProcessFailed,
  RecordingInvalid,
  SceneNotLocated,
  SceneNotRendered,
  SourceShared,
  TakeMismatch,
  TakeUnknown,
  VariantUnknown,
  VerbRefused,
} from '../core/refusals.ts';
import { CheckLine, ResolvedCue, Timeline, VoiceTiming } from '../core/schema.ts';
import { StudioReading } from '../core/studio.ts';
import type { FilmName } from './film-repo.ts';
import { type Finished, collectWithin } from './process.ts';

/** `film options list`'s answer: the film's choice points as its sources stand. */
export class OptionsListed extends Schema.TaggedClass<OptionsListed>()('OptionsListed', {
  points: Schema.Array(ChoicePoint),
}) {}

/** `film options list --check`'s answer: the points, and the static check of the same sources. */
export class OptionsChecked extends Schema.TaggedClass<OptionsChecked>()('OptionsChecked', {
  points: Schema.Array(ChoicePoint),
  findings: Schema.Array(CheckLine),
}) {}

/** `film options mix`'s answer: the mix is written where it was asked. */
export class OptionsMixed extends Schema.TaggedClass<OptionsMixed>()('OptionsMixed', {}) {}

/** `film options keep-voice`'s answer: the attempt is the beat's take, and the track remixed. */
export class OptionsKept extends Schema.TaggedClass<OptionsKept>()('OptionsKept', {
  /** The take as the timings now name it. */
  take: VoiceTiming,
  /** What the transcriber heard of it. */
  heard: Schema.String,
  /** Its word error against the line as it reads now, 0 to 1. */
  wer: Schema.Finite,
  /** Whether `narration/full.wav` was rebuilt with the take (false: the log says why). */
  mixed: Schema.Boolean,
}) {}

/** `film options take`'s answer: the take is kept, unkept or rejected in the library's lock. */
export class OptionsTaken extends Schema.TaggedClass<OptionsTaken>()('OptionsTaken', {}) {}

/** `film project … --json`'s answer: the project as the run leaves it. */
export class ProjectRead extends Schema.TaggedClass<ProjectRead>()('ProjectRead', {
  project: Project,
}) {}

/** A scene's spans as `film read cue --spans` takes them. */
export const TimelineJson = Schema.fromJsonString(Timeline);
const encodeTimeline = Schema.encodeEffect(TimelineJson);

/** `film read voice`'s answer: what the studio reads of the film's script and voice. */
export class VoiceRead extends Schema.TaggedClass<VoiceRead>()('VoiceRead', {
  reading: StudioReading,
}) {}

/**
 * `film read cue`'s answer: the cue on its scene's clock, or why the scene's
 * timeline does not resolve; neither when the scene or the cue is not there.
 */
export class CueRead extends Schema.TaggedClass<CueRead>()('CueRead', {
  resolved: Schema.optionalKey(ResolvedCue),
  unresolved: Schema.optionalKey(Schema.String),
}) {}

/** Whether the lab may write a field of a scene's drawing: only the literal the scene reads, alone. */
const FieldAccess = Schema.Union([
  Schema.TaggedStruct('Writable', {}),
  Schema.TaggedStruct('Refused', { error: Schema.Union([SceneNotLocated, SourceShared]) }),
]);

/**
 * Where a scene's drawing is declared (the file, and a name the file exports
 * it under), and for each field whether that literal is the one the scene
 * reads and no other scene does.
 */
export const SceneSite = Schema.Struct({
  scene: Schema.String,
  file: Schema.String,
  /** The file as an answer or a refusal names it: relative to the film's folder, never a path on the box. */
  shown: Schema.String,
  exportName: Schema.String,
  access: Schema.Struct({ timeline: FieldAccess, knobs: FieldAccess }),
});
export type SceneSite = typeof SceneSite.Type;

/** `film read sites`'s answer: every scene with a timeline or knobs, located or why not. */
export class SitesRead extends Schema.TaggedClass<SitesRead>()('SitesRead', {
  sites: Schema.Array(SceneSite),
  unlocated: Schema.Array(SceneNotLocated),
}) {}

/**
 * What a fresh run refuses with: the film, choice, variant, scene or act it
 * could not find, or the take it would not keep (one that says something
 * else, or an attempt it has not, or one recorded for an earlier line).
 */
const FreshRefusal = Schema.Union([
  FilmUnknown,
  ChoiceUnknown,
  VariantUnknown,
  VerbRefused,
  TakeUnknown,
  TakeMismatch,
  RecordingInvalid,
  SceneNotRendered,
  UnknownScene,
  UnknownAct,
  CatalogueInvalid,
]);
type FreshRefusal = typeof FreshRefusal.Type;

/** The one line a fresh run prints: its answer, or its refusal. */
const FreshLine = Schema.Union([
  OptionsListed,
  OptionsChecked,
  OptionsMixed,
  OptionsKept,
  OptionsTaken,
  ProjectRead,
  VoiceRead,
  CueRead,
  SitesRead,
  FreshRefusal,
  ServerFailed,
]);
type FreshLine = typeof FreshLine.Type;

/** `FreshLine` as the JSON text the child prints and the review reads. */
const FreshLineJson = Schema.fromJsonString(FreshLine);

/** Print `line` as the run's answer: one line of JSON on stdout. */
export const printLine = (line: FreshLine) =>
  Effect.flatMap(Schema.encodeEffect(FreshLineJson)(line), (text) => Console.log(text));

/** Whether an error is one a fresh run answers with (its line), not a failure of the run. */
const isFreshRefusal = Schema.is(FreshRefusal);

/** A failure that names itself: a tag, and words a page can show. */
interface Named {
  readonly _tag: string;
  readonly message: string;
}

const isNamed = (u: unknown): u is Named =>
  Predicate.hasProperty(u, '_tag') &&
  Predicate.isString(u._tag) &&
  Predicate.hasProperty(u, 'message') &&
  Predicate.isString(u.message);

/** The line a failure answers with: a refusal as itself, any other as `ServerFailed`. */
const failureLine = (error: Named): FreshRefusal | ServerFailed => {
  if (isFreshRefusal(error)) return error;
  return ServerFailed.make({ tag: error._tag, reason: error.message });
};

/**
 * `effect` with the failure it names printed as the run's answer (a refusal
 * as itself, any other as `ServerFailed`), then failed with as before (exit 1).
 */
export const answering = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.tapError(effect, (error) => {
    if (isNamed(error)) return printLine(failureLine(error));
    return Effect.void;
  });

/** Whether a line is a failure the run answered with, raised here again as itself. */
const isFailureLine = Schema.is(Schema.Union([FreshRefusal, ServerFailed]));

/** One finding as `film check --json` prints it: a CheckLine as one line of JSON. */
export const CheckLineJson = Schema.fromJsonString(CheckLine);

const decodeCheckLine = Schema.decodeUnknownEffect(CheckLineJson);

/**
 * The findings in `check --json`'s stdout, one per non-empty line. Logs go to
 * stderr, so a line that does not decode is the CLI and its reader
 * disagreeing about the format: the run fails, naming the line.
 */
export const checkLines = Effect.fn('FreshFilm.checkLines')(function* (
  command: string,
  stdout: string,
) {
  const lines = stdout.split('\n').filter((line) => line.trim() !== '');
  return yield* Effect.forEach(lines, (line) =>
    decodeCheckLine(line).pipe(
      Effect.mapError(() => FreshProcessFailed.make({ command, reason: `not a finding: ${line}` })),
    ),
  );
});

/** A check that could not run, as the one error finding a page shows. */
export const failedCheck = (error: FreshProcessFailed): ReadonlyArray<CheckLine> => [
  { level: 'error', tag: error._tag, message: error.message },
];

/** A finding as one line of JSON, as `film check --json` prints it. */
export const encodeCheckLine = Schema.encodeSync(CheckLineJson);

/**
 * `film check`'s run, answering with `--json` a check that cannot run (the
 * film does not load, a flag it refuses) as its one error finding, in the
 * failure's own words, then failing with it as before. A check that ran has
 * printed its findings, and fails as CheckFailed.
 */
export const answeringCheck = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  input: { readonly json: boolean },
) => {
  if (!input.json) return effect;
  return Effect.tapError(effect, (error) => {
    if (!isNamed(error) || error._tag === 'CheckFailed') return Effect.void;
    return Console.log(
      encodeCheckLine({ level: 'error', tag: error._tag, message: error.message }),
    );
  });
};

/** How long a read may take (a cold start and the film's modules, a few seconds), a mix, a kept take. */
const READ_LIMIT = Duration.seconds(60);
const MIX_LIMIT = Duration.minutes(10);

/** A check leg a fresh run can take: `static` reads files only; `sound` also mixes the film. */
type CheckLeg = 'static' | 'sound';

/** The longest each leg may take: a lab request waits on `static`; `sound` renders the whole mix. */
const CHECK_LIMITS: Record<CheckLeg, Duration.Duration> = {
  static: Duration.seconds(30),
  sound: Duration.minutes(5),
};

export type FreshError = FreshProcessFailed | FreshRefusal | ServerFailed;

export interface FreshFilmService {
  /** The film's choice points, its modules imported as they stand now. */
  readonly choices: (film: FilmName) => Effect.Effect<ReadonlyArray<ChoicePoint>, FreshError>;
  /** The points and the static check of the same sources, in one run. */
  readonly checked: (film: FilmName) => Effect.Effect<OptionsChecked, FreshError>;
  /** The film's whole mix with `variant` of `point` in place, written to `to` as an m4a. */
  readonly mix: (
    film: FilmName,
    point: string,
    variant: string,
    to: string,
  ) => Effect.Effect<void, FreshError>;
  /** Keep `beat`'s attempt `file` as its take (a mismatch only when accepted), and remix the track. */
  readonly keepVoice: (
    film: FilmName,
    beat: string,
    file: string,
    options: { readonly acceptMismatch: boolean },
  ) => Effect.Effect<OptionsKept, FreshError>;
  /** `verb` on the take `take` (a sha256) of point `point`: kept, unkept or rejected in the lock. */
  readonly take: (
    film: FilmName,
    point: string,
    take: string,
    verb: ChoiceVerb,
  ) => Effect.Effect<void, FreshError>;
  /** What the studio reads of the film's script and voice (`film read voice`). */
  readonly reading: (film: FilmName) => Effect.Effect<StudioReading, FreshError>;
  /**
   * `cue` on `scene`'s clock as the film's files now declare it, `spans` in
   * place of the scene's own where given (`film read cue`), or why the
   * scene's timeline does not resolve.
   */
  readonly cue: (
    film: FilmName,
    scene: string,
    cue: string,
    spans: Option.Option<Timeline>,
  ) => Effect.Effect<CueRead, FreshError>;
  /** Where each scene's drawing is declared, as the film's files and modules now stand (`film read sites`). */
  readonly sites: (film: FilmName) => Effect.Effect<SitesRead, FreshError>;
  /** `film project <args>` (its `--json` among them): the project as the run leaves it. */
  readonly project: (args: ReadonlyArray<string>) => Effect.Effect<Project, FreshError>;
  /**
   * Every finding of `film check <film> --<leg> --allow-stale --json`. A
   * check that cannot run is one error finding (`failedCheck`), logged.
   */
  readonly check: (film: string, leg: CheckLeg) => Effect.Effect<ReadonlyArray<CheckLine>>;
}

const decodeLine = Schema.decodeUnknownOption(FreshLineJson);

/** The last line of `stdout` that is a `FreshLine`. */
const answerIn = (stdout: string): Option.Option<FreshLine> =>
  Option.firstSomeOf(
    stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
      .toReversed()
      .map((line) => decodeLine(line)),
  );

/** The last lines of what a run printed to stderr, for a failure's reason. */
const tailOf = (done: Finished) => done.stderr.trim().split('\n').slice(-3).join(' | ');

export class FreshFilm extends Context.Service<FreshFilm, FreshFilmService>()(
  '@bible/film/tools/FreshFilm',
) {
  /** Each read run as `command` (the film CLI, e.g. `['bun', '/app/cli.ts']`) with its arguments. */
  static readonly layer = (command: ReadonlyArray<string>) =>
    Layer.effect(
      FreshFilm,
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const [program = 'bun', ...prefix] = command;

        /** `film <args>` run to its end, called `name`: what it printed, and its exit code. */
        const run = Effect.fn('FreshFilm.run')(function* (
          name: string,
          args: ReadonlyArray<string>,
          limit: Duration.Duration,
        ) {
          return yield* collectWithin(
            spawner,
            name,
            ChildProcess.make(program, [...prefix, ...args]),
            limit,
          ).pipe(
            Effect.mapError((error) =>
              FreshProcessFailed.make({ command: name, reason: error.message }),
            ),
          );
        });

        /** `film <args>`'s one line: its answer, or the failure it printed, raised as itself. */
        const answer = Effect.fn('FreshFilm.answer')(function* (
          args: ReadonlyArray<string>,
          limit: Duration.Duration,
        ) {
          const name = `film ${args.slice(0, 2).join(' ')}`;
          const done = yield* run(name, args, limit);
          const line = yield* Effect.fromOption(answerIn(done.stdout), () =>
            FreshProcessFailed.make({
              command: name,
              reason: `exit ${done.exitCode}, no answer: ${tailOf(done)}`,
            }),
          );
          if (isFailureLine(line)) return yield* line;
          return line;
        });

        /** `film <args>`'s answer when it is `answered`, or that it answered something else. */
        const ask = <A extends FreshLine>(
          args: ReadonlyArray<string>,
          limit: Duration.Duration,
          answered: Schema.Schema<A>,
        ) =>
          Effect.filterOrFail(answer(args, limit), Schema.is(answered), (line) =>
            FreshProcessFailed.make({
              command: `film ${args.slice(0, 2).join(' ')}`,
              reason: `answered ${line._tag}`,
            }),
          );

        const choices = Effect.fn('FreshFilm.choices')(function* (film: FilmName) {
          return (yield* ask(['options', 'list', film], READ_LIMIT, OptionsListed)).points;
        });

        const checked = Effect.fn('FreshFilm.checked')(function* (film: FilmName) {
          return yield* ask(['options', 'list', film, '--check'], READ_LIMIT, OptionsChecked);
        });

        const mix = Effect.fn('FreshFilm.mix')(function* (
          film: FilmName,
          point: string,
          variant: string,
          to: string,
        ) {
          yield* ask(
            ['options', 'mix', film, '--point', point, '--variant', variant, '--to', to],
            MIX_LIMIT,
            OptionsMixed,
          );
        });

        const keepVoice = Effect.fn('FreshFilm.keepVoice')(function* (
          film: FilmName,
          beat: string,
          file: string,
          options: { readonly acceptMismatch: boolean },
        ) {
          const accept = Arr.filter(['--accept-mismatch'], () => options.acceptMismatch);
          return yield* ask(
            ['options', 'keep-voice', film, beat, file, ...accept],
            MIX_LIMIT,
            OptionsKept,
          );
        });

        const take = Effect.fn('FreshFilm.take')(function* (
          film: FilmName,
          point: string,
          sha: string,
          verb: ChoiceVerb,
        ) {
          yield* ask(
            ['options', 'take', film, '--point', point, '--variant', sha, '--verb', verb],
            READ_LIMIT,
            OptionsTaken,
          );
        });

        const reading = Effect.fn('FreshFilm.reading')(function* (film: FilmName) {
          return (yield* ask(['read', 'voice', film], READ_LIMIT, VoiceRead)).reading;
        });

        const cue = Effect.fn('FreshFilm.cue')(function* (
          film: FilmName,
          scene: string,
          name: string,
          spans: Option.Option<Timeline>,
        ) {
          // Spans are data the lab read from a scene's source: they encode as their schema says.
          const given = yield* Option.match(spans, {
            onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
            onSome: (s) => Effect.map(Effect.orDie(encodeTimeline(s)), (json) => ['--spans', json]),
          });
          return yield* ask(['read', 'cue', film, scene, name, ...given], READ_LIMIT, CueRead);
        });

        const sites = Effect.fn('FreshFilm.sites')(function* (film: FilmName) {
          return yield* ask(['read', 'sites', film], READ_LIMIT, SitesRead);
        });

        const project = Effect.fn('FreshFilm.project')(function* (args: ReadonlyArray<string>) {
          return (yield* ask(['project', ...args], READ_LIMIT, ProjectRead)).project;
        });

        /** `film check <film> --<leg>`: its findings; exit 1 is the check failing on them. */
        const findings = Effect.fn('FreshFilm.findings')(function* (film: string, leg: CheckLeg) {
          const name = `film check --${leg}`;
          const done = yield* run(
            name,
            ['check', film, `--${leg}`, '--allow-stale', '--json'],
            CHECK_LIMITS[leg],
          );
          const lines = yield* checkLines(name, done.stdout);
          if (done.exitCode !== 0 && lines.every((l) => l.level !== 'error'))
            return yield* FreshProcessFailed.make({
              command: name,
              reason: `exit ${done.exitCode}: ${tailOf(done)}`,
            });
          yield* Effect.log(`fresh.check film=${film} leg=${leg} findings=${lines.length}`);
          return lines;
        });

        const check = (film: string, leg: CheckLeg) =>
          findings(film, leg).pipe(
            Effect.catchTag('FreshProcessFailed', (error) =>
              Effect.logWarning(
                `fresh.check.failed film=${film} leg=${leg} reason="${error.reason}"`,
              ).pipe(Effect.as(failedCheck(error))),
            ),
          );

        return FreshFilm.of({
          choices,
          checked,
          mix,
          keepVoice,
          take,
          reading,
          cue,
          sites,
          project,
          check,
        });
      }),
    );
}
