// `film check --static` for the lab, after each write to a scene file. It runs
// the film CLI again in a fresh process: this process imported the film's
// modules once, at start, so only a new process reads the scene files as the
// write left them. The static leg reads files only: no mix and no browser
// (`staticLeg` needs FileSystem and Media, not Mixer). On righteousness-by-faith
// it takes about 2 s of CPU and at most 0.3 GB. It runs with `--json`, so each
// line it prints is one finding (with its address), encoded by `CheckLineJson`
// and decoded here by the same schema.

import { Context, Duration, Effect, Layer, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { CheckLine } from '../core/schema.ts';
import { StaticCheckFailed } from './errors.ts';
import { collectWithin } from './process.ts';

export interface StaticCheckService {
  /** Every finding of `film check <film> --static --allow-stale --json`, read fresh from disk. */
  readonly run: (film: string) => Effect.Effect<ReadonlyArray<CheckLine>, StaticCheckFailed>;
  /**
   * Every finding of `film check <film> --sound --allow-stale --json`: the
   * static leg and the mix the film makes now (dead air, balance against the
   * picked score). The options page runs it after a pick.
   */
  readonly sound: (film: string) => Effect.Effect<ReadonlyArray<CheckLine>, StaticCheckFailed>;
}

/**
 * The longest one check may take. It runs in a few seconds; a lab request
 * waits on it, so one that hangs is stopped and reported.
 */
export const CHECK_LIMIT = Duration.seconds(30);

/** The longest the sound check may take: it renders the film's whole mix (a minute or two). */
export const SOUND_CHECK_LIMIT = Duration.minutes(5);

/** One finding as `film check --json` prints it: a CheckLine as one line of JSON. */
export const CheckLineJson = Schema.fromJsonString(CheckLine);

const decodeLine = Schema.decodeUnknownEffect(CheckLineJson);

/**
 * The findings in `check --json`'s stdout, one per non-empty line. Logs go to
 * stderr, so a line that does not decode is the CLI and the lab disagreeing
 * about the format: the run fails, naming the line.
 */
export const checkLines = Effect.fn('StaticCheck.lines')(function* (stdout: string) {
  const lines = stdout.split('\n').filter((line) => line.trim() !== '');
  return yield* Effect.forEach(lines, (line) =>
    decodeLine(line).pipe(
      Effect.mapError(() => StaticCheckFailed.make({ reason: `not a finding: ${line}` })),
    ),
  );
});

export class StaticCheck extends Context.Service<StaticCheck, StaticCheckService>()(
  '@bible/film/tools/StaticCheck',
) {
  /**
   * The check, run as `command` (the film CLI, e.g. `['bun', '/app/cli.ts']`)
   * with `check <film> --static --allow-stale --json`. It exits non-zero when it
   * finds an error; its findings are the answer either way.
   */
  static readonly layer = (command: ReadonlyArray<string>) =>
    Layer.effect(
      StaticCheck,
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const [program = 'bun', ...args] = command;
        /** `film check <film> <leg> --allow-stale --json`, its findings the answer. */
        const checkWith = (leg: '--static' | '--sound', limit: Duration.Duration) =>
          Effect.fn('StaticCheck.run')(function* (film: string) {
            const done = yield* collectWithin(
              spawner,
              `film check ${leg}`,
              ChildProcess.make(program, [...args, 'check', film, leg, '--allow-stale', '--json']),
              limit,
            ).pipe(Effect.mapError((error) => StaticCheckFailed.make({ reason: error.message })));
            const lines = yield* checkLines(done.stdout);
            // Exit 1 is the check failing on its findings; anything else is the run failing.
            if (done.exitCode !== 0 && lines.every((l) => l.level !== 'error'))
              return yield* StaticCheckFailed.make({
                reason: `exit ${done.exitCode}: ${done.stderr.trim().split('\n').slice(-3).join(' | ')}`,
              });
            yield* Effect.log(`lab.check film=${film} leg=${leg} findings=${lines.length}`);
            return lines;
          });
        return StaticCheck.of({
          run: checkWith('--static', CHECK_LIMIT),
          sound: checkWith('--sound', SOUND_CHECK_LIMIT),
        });
      }),
    );
}
