// A film's choices and its project read, and its mixes and voice picks made,
// in a fresh process. The review runs for days; Bun keeps every module it
// imported as it was at the import, so a film's `sound.ts` (its score
// options, what `play` names), its palette's looks, its script and its
// scenes read in the review's own process stay as they were at start. Each
// read here runs the film CLI again (`film options …`, `choices-cli.ts`;
// `film project … --json`, `project-cli.ts`), which imports the film as it
// stands on disk. The child prints one line of JSON (`FreshLine`): its
// answer, or the refusal it failed with; its logs go to stderr.

import { Console, Context, Duration, Effect, Layer, Match, Option, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { Project } from '../core/catalogue.ts';
import { ChoicePoint } from '../core/choice.ts';
import { UnknownAct, UnknownScene } from '../core/errors.ts';
import {
  CatalogueInvalid,
  ChoiceUnknown,
  FreshProcessFailed,
  SceneNotRendered,
  TakeMismatch,
  TakeUnknown,
  VariantUnknown,
  VerbRefused,
} from '../core/refusals.ts';
import type { FilmName } from './film-repo.ts';
import { collectWithin } from './process.ts';

/** `film options list`'s answer: the film's choice points as its sources stand. */
export class OptionsListed extends Schema.TaggedClass<OptionsListed>()('OptionsListed', {
  points: Schema.Array(ChoicePoint),
}) {}

/** `film options mix`'s answer: the mix is written where it was asked. */
export class OptionsMixed extends Schema.TaggedClass<OptionsMixed>()('OptionsMixed', {}) {}

/** `film options keep-voice`'s answer: the attempt is the beat's take, and the track remixed. */
export class OptionsKept extends Schema.TaggedClass<OptionsKept>()('OptionsKept', {
  /** Whether `narration/full.wav` was rebuilt with the take (false: the log says why). */
  mixed: Schema.Boolean,
}) {}

/** `film project … --json`'s answer: the project as the run leaves it. */
export class ProjectRead extends Schema.TaggedClass<ProjectRead>()('ProjectRead', {
  project: Project,
}) {}

/** What a fresh run refuses with: the choice, variant, scene or act it could not find, or the take it would not keep. */
export const FreshRefusal = Schema.Union([
  ChoiceUnknown,
  VariantUnknown,
  VerbRefused,
  TakeUnknown,
  TakeMismatch,
  SceneNotRendered,
  UnknownScene,
  UnknownAct,
  CatalogueInvalid,
]);
export type FreshRefusal = typeof FreshRefusal.Type;

/** The one line a fresh run prints: its answer, or its refusal. */
export const FreshLine = Schema.Union([
  OptionsListed,
  OptionsMixed,
  OptionsKept,
  ProjectRead,
  FreshRefusal,
]);
export type FreshLine = typeof FreshLine.Type;

/** `FreshLine` as the JSON text the child prints and the review reads. */
export const FreshLineJson = Schema.fromJsonString(FreshLine);

/** Print `line` as the run's answer: one line of JSON on stdout. */
export const printLine = (line: FreshLine) =>
  Effect.flatMap(Schema.encodeEffect(FreshLineJson)(line), Console.log);

/** Print a refusal as the run's answer, then fail with it (exit 1). */
export const refuseWith = <E extends FreshRefusal>(error: E) =>
  Effect.andThen(printLine(error), Effect.fail(error));

/** Whether an error is one a fresh run answers with (its line), not a failure of the run. */
export const isRefusal = Schema.is(FreshRefusal);

/** `effect` with each refusal it fails with printed as the run's answer. */
export const answering = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.catchIf(effect, isRefusal, refuseWith);

/** How long a read may take (a cold start and the film's modules, a few seconds), a mix, a kept take. */
const READ_LIMIT = Duration.seconds(60);
const MIX_LIMIT = Duration.minutes(10);

export interface FreshFilmService {
  /** The film's choice points, its modules imported as they stand now. */
  readonly choices: (
    film: FilmName,
  ) => Effect.Effect<ReadonlyArray<ChoicePoint>, FreshProcessFailed | FreshRefusal>;
  /** The film's whole mix with `variant` of `point` in place, written to `to` as an m4a. */
  readonly mix: (
    film: FilmName,
    point: string,
    variant: string,
    to: string,
  ) => Effect.Effect<void, FreshProcessFailed | FreshRefusal>;
  /** Keep `beat`'s attempt `file` as its take, and remix the track. */
  readonly keepVoice: (
    film: FilmName,
    beat: string,
    file: string,
  ) => Effect.Effect<OptionsKept, FreshProcessFailed | FreshRefusal>;
  /** `film project <args>` (its `--json` among them): the project as the run leaves it. */
  readonly project: (
    args: ReadonlyArray<string>,
  ) => Effect.Effect<Project, FreshProcessFailed | FreshRefusal>;
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

        /** `film <args>` run to its end: the line it answered with, or the refusal it printed. */
        const run = Effect.fn('FreshFilm.run')(function* (
          args: ReadonlyArray<string>,
          limit: Duration.Duration,
        ) {
          const name = `film ${args.slice(0, 2).join(' ')}`;
          const done = yield* collectWithin(
            spawner,
            name,
            ChildProcess.make(program, [...prefix, ...args]),
            limit,
          ).pipe(
            Effect.mapError((error) =>
              FreshProcessFailed.make({ command: name, reason: error.message }),
            ),
          );
          const tail = done.stderr.trim().split('\n').slice(-3).join(' | ');
          const line = yield* Effect.fromOption(answerIn(done.stdout), () =>
            FreshProcessFailed.make({
              command: name,
              reason: `exit ${done.exitCode}, no answer: ${tail}`,
            }),
          );
          if (isRefusal(line)) return yield* line;
          return line;
        });

        /** What `command` answers, or that it answered something else. */
        const expect = <A>(
          command: string,
          line: FreshLine,
          pick: (line: FreshLine) => Option.Option<A>,
        ) =>
          Effect.fromOption(pick(line), () =>
            FreshProcessFailed.make({ command, reason: `answered ${line._tag}` }),
          );

        const choices = Effect.fn('FreshFilm.choices')(function* (film: FilmName) {
          const line = yield* run(['options', 'list', film], READ_LIMIT);
          return yield* expect('film options list', line, (l) =>
            Match.value(l).pipe(
              Match.tag('OptionsListed', (listed) => Option.some(listed.points)),
              Match.orElse(() => Option.none()),
            ),
          );
        });

        const mix = Effect.fn('FreshFilm.mix')(function* (
          film: FilmName,
          point: string,
          variant: string,
          to: string,
        ) {
          const line = yield* run(
            ['options', 'mix', film, '--point', point, '--variant', variant, '--to', to],
            MIX_LIMIT,
          );
          yield* expect('film options mix', line, (l) =>
            Option.liftPredicate(l, (x) => x._tag === 'OptionsMixed'),
          );
        });

        const keepVoice = Effect.fn('FreshFilm.keepVoice')(function* (
          film: FilmName,
          beat: string,
          file: string,
        ) {
          const line = yield* run(['options', 'keep-voice', film, beat, file], MIX_LIMIT);
          return yield* expect('film options keep-voice', line, (l) =>
            Match.value(l).pipe(
              Match.tag('OptionsKept', (kept) => Option.some(kept)),
              Match.orElse(() => Option.none()),
            ),
          );
        });

        const project = Effect.fn('FreshFilm.project')(function* (args: ReadonlyArray<string>) {
          const line = yield* run(['project', ...args], READ_LIMIT);
          return yield* expect('film project', line, (l) =>
            Match.value(l).pipe(
              Match.tag('ProjectRead', (read) => Option.some(read.project)),
              Match.orElse(() => Option.none()),
            ),
          );
        });

        return FreshFilm.of({ choices, mix, keepVoice, project });
      }),
    );
}
