// `film check --static` for the lab, after each write to a scene file. It runs
// the film CLI again in a fresh process: this process imported the film's
// modules once, at start, so only a new process reads the scene files as the
// write left them. The static leg is cheap (no browser; about a quarter
// second), and its printed lines (`level tag message`) are the report.

import { Array as Arr, Context, Effect, Layer, Option } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import type { CheckLine } from '../core/schema.ts';
import { StaticCheckFailed } from './errors.ts';
import { collect } from './process.ts';

export interface StaticCheckService {
  /** Every finding of `film check <film> --static --allow-stale`, read fresh from disk. */
  readonly run: (film: string) => Effect.Effect<ReadonlyArray<CheckLine>, StaticCheckFailed>;
}

const LINE = /^(error|warning)\s+(\S+)\s+(.*)$/;

/** The findings in `check`'s output: one per line it prints, other lines ignored. */
export const checkLines = (stdout: string): ReadonlyArray<CheckLine> =>
  Arr.getSomes(
    stdout.split('\n').map((line) =>
      Option.flatMap(Option.fromNullishOr(LINE.exec(line)), (m) => {
        const [, level, tag, message] = m;
        if (level !== 'error' && level !== 'warning') return Option.none();
        return Option.zipWith(
          Option.fromUndefinedOr(tag),
          Option.fromUndefinedOr(message),
          (t, text): CheckLine => ({ level, tag: t, message: text }),
        );
      }),
    ),
  );

export class StaticCheck extends Context.Service<StaticCheck, StaticCheckService>()(
  '@bible/film/tools/StaticCheck',
) {
  /**
   * The check, run as `command` (the film CLI, e.g. `['bun', '/app/cli.ts']`)
   * with `check <film> --static --allow-stale`. It exits non-zero when it
   * finds an error; its findings are the answer either way.
   */
  static readonly layer = (command: ReadonlyArray<string>) =>
    Layer.effect(
      StaticCheck,
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const [program = 'bun', ...args] = command;
        const run = Effect.fn('StaticCheck.run')(function* (film: string) {
          const done = yield* collect(
            spawner,
            ChildProcess.make(program, [...args, 'check', film, '--static', '--allow-stale']),
          ).pipe(Effect.mapError((error) => StaticCheckFailed.make({ reason: error.message })));
          const lines = checkLines(done.stdout);
          // Exit 1 is the check failing on its findings; anything else is the run failing.
          if (done.exitCode !== 0 && lines.every((l) => l.level !== 'error'))
            return yield* StaticCheckFailed.make({
              reason: `exit ${done.exitCode}: ${done.stderr.trim().split('\n').slice(-3).join(' | ')}`,
            });
          yield* Effect.log(`lab.check film=${film} findings=${lines.length}`);
          return lines;
        });
        return StaticCheck.of({ run });
      }),
    );
}
