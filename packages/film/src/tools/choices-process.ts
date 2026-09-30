// A film's options read, and its mixes made, in a fresh process. The review
// runs for days; Bun keeps every module it imported as it was at the import,
// so a film's `sound.ts` (its score options, what `play` names) and its scenes
// read in the review's own process stay as they were at start. Each read here
// runs the film CLI again (`film options list|mix`, `choices-cli.ts`), which
// imports the film as it stands on disk. The child prints one line of JSON
// (`OptionsLine`); its logs go to stderr.

import { Context, Duration, Effect, Layer, Option, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { FilmChoice } from '../core/schema.ts';
import { ChoiceUnknown, ChoicesProcessFailed, TakeUnknown } from './errors.ts';
import type { FilmName } from './film-repo.ts';
import type { TakeInPlace } from './mixer.ts';
import { collectWithin } from './process.ts';

/** `film options list`'s answer: the film's choices as its sources stand. */
export class OptionsListed extends Schema.TaggedClass<OptionsListed>()('OptionsListed', {
  choices: Schema.Array(FilmChoice),
}) {}

/** `film options mix`'s answer: the mix is written where it was asked. */
export class OptionsMixed extends Schema.TaggedClass<OptionsMixed>()('OptionsMixed', {}) {}

/** The one line `film options` prints: its answer, or the choice it could not find. */
export const OptionsLine = Schema.Union([OptionsListed, OptionsMixed, ChoiceUnknown, TakeUnknown]);
export type OptionsLine = typeof OptionsLine.Type;

/** `OptionsLine` as the JSON text the child prints and the review reads. */
export const OptionsLineJson = Schema.fromJsonString(OptionsLine);

/** How long listing may take (a cold start and the film's modules, under a second), and one mix. */
const LIST_LIMIT = Duration.seconds(60);
const MIX_LIMIT = Duration.minutes(10);

export interface FreshFilmService {
  /** The film's choices, its modules imported as they stand now. */
  readonly choices: (
    film: FilmName,
  ) => Effect.Effect<ReadonlyArray<FilmChoice>, ChoicesProcessFailed>;
  /** The film's whole mix with `score` or `take` in place, written to `to` as an m4a. */
  readonly mix: (
    film: FilmName,
    score: Option.Option<string>,
    take: Option.Option<TakeInPlace>,
    to: string,
  ) => Effect.Effect<void, ChoicesProcessFailed | ChoiceUnknown | TakeUnknown>;
}

const decodeLine = Schema.decodeUnknownOption(OptionsLineJson);

/** The last line of `stdout` that is an `OptionsLine`. */
const answerIn = (stdout: string): Option.Option<OptionsLine> =>
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
  /** Each read run as `command` (the film CLI, e.g. `['bun', '/app/cli.ts']`) with `options …`. */
  static readonly layer = (command: ReadonlyArray<string>) =>
    Layer.effect(
      FreshFilm,
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const [program = 'bun', ...prefix] = command;

        /** `film options <args>` run to its end, and the line it answered with. */
        const run = Effect.fn('FreshFilm.run')(function* (
          args: ReadonlyArray<string>,
          limit: Duration.Duration,
        ) {
          const name = `film options ${args[0] ?? ''}`;
          const done = yield* collectWithin(
            spawner,
            name,
            ChildProcess.make(program, [...prefix, 'options', ...args]),
            limit,
          ).pipe(
            Effect.mapError((error) =>
              ChoicesProcessFailed.make({ command: name, reason: error.message }),
            ),
          );
          const tail = done.stderr.trim().split('\n').slice(-3).join(' | ');
          return yield* Effect.fromOption(answerIn(done.stdout), () =>
            ChoicesProcessFailed.make({
              command: name,
              reason: `exit ${done.exitCode}, no answer: ${tail}`,
            }),
          );
        });

        const choices = Effect.fn('FreshFilm.choices')(function* (film: FilmName) {
          const line = yield* run(['list', film], LIST_LIMIT);
          if (line._tag === 'OptionsListed') return line.choices;
          return yield* ChoicesProcessFailed.make({
            command: 'film options list',
            reason: `answered ${line._tag}`,
          });
        });

        const mix = Effect.fn('FreshFilm.mix')(function* (
          film: FilmName,
          score: Option.Option<string>,
          take: Option.Option<TakeInPlace>,
          to: string,
        ) {
          const line = yield* run(
            [
              'mix',
              film,
              ...Option.match(score, { onNone: () => [], onSome: (s) => ['--score', s] }),
              ...Option.match(take, {
                onNone: () => [],
                onSome: (t) => ['--take', `${t.sound}:${t.take}`],
              }),
              '--to',
              to,
            ],
            MIX_LIMIT,
          );
          if (line._tag === 'OptionsMixed') return;
          if (line._tag === 'OptionsListed')
            return yield* ChoicesProcessFailed.make({
              command: 'film options mix',
              reason: 'answered OptionsListed',
            });
          return yield* line;
        });

        return FreshFilm.of({ choices, mix });
      }),
    );
}
