// The counsel: another model family's answer to a prompt file, for the judge
// (`tools/judge.ts`). One seam, two adapters: `Counsel.layer` runs
// `okra counsel --deep -f <prompt> -o <dir>` (the other local coding agent at
// its deeper profile, read-only) and reads the answer it writes under `dir`
// (`codex.md` or `claude.md`); `Counsel.layerTest` answers from a function of
// the prompt, written where the real one writes, so a test runs the judge
// through the same files. No time limit of its own: okra bounds the run and
// exits 124 when it times out.

import { Array as Arr, Context, Effect, FileSystem, Layer, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { CounselFailed } from '../core/judge.ts';
import { collect } from './process.ts';

/** What a counsel answered: the file it wrote, and its words. */
interface CounselAnswer {
  readonly file: string;
  readonly text: string;
}

interface CounselService {
  /** The answer to the prompt in `prompt`, its run's files kept under `dir`. */
  readonly ask: (prompt: string, dir: string) => Effect.Effect<CounselAnswer, CounselFailed>;
}

/** The files an okra counsel run answers in, by the agent that answered. */
const ANSWERS = ['codex.md', 'claude.md'];

/** The last lines `text` printed, for a failure's reason. */
const tailOf = (text: string) => text.trim().split('\n').slice(-3).join(' | ');

export class Counsel extends Context.Service<Counsel, CounselService>()(
  '@bible/film/tools/Counsel',
) {
  /** `okra counsel --deep`, run in `dir`, its answer read from the run folder it makes there. */
  static readonly layer = Layer.effect(
    Counsel,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const failed = (dir: string) => (error: { readonly message: string }) =>
        CounselFailed.make({ dir, reason: error.message });

      const ask = Effect.fn('Counsel.ask')(function* (prompt: string, dir: string) {
        yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(failed(dir)));
        yield* Effect.log(`counsel.start prompt=${prompt} dir=${dir}`);
        const done = yield* collect(
          spawner,
          ChildProcess.make('okra', ['counsel', '--deep', '-f', prompt, '-o', dir], { cwd: dir }),
        ).pipe(Effect.mapError(failed(dir)));
        if (done.exitCode !== 0)
          return yield* CounselFailed.make({
            dir,
            reason: `okra counsel exited ${done.exitCode}${Arr.filter([' (timed out)'], () => done.exitCode === 124).join('')}: ${tailOf(done.stderr) || tailOf(done.stdout)}`,
          });
        const found = (yield* fs
          .readDirectory(dir, { recursive: true })
          .pipe(Effect.mapError(failed(dir))))
          .filter((name) => ANSWERS.includes(path.basename(name)))
          .map((name) => path.join(dir, name));
        const file = yield* Effect.fromOption(Arr.head(found)).pipe(
          Effect.mapError(() =>
            CounselFailed.make({ dir, reason: `no ${ANSWERS.join(' or ')} under ${dir}` }),
          ),
        );
        const text = yield* fs.readFileString(file).pipe(Effect.mapError(failed(dir)));
        yield* Effect.log(`counsel.answered file=${file} chars=${text.length}`);
        return { file, text } satisfies CounselAnswer;
      });

      return Counsel.of({ ask });
    }),
  );

  /**
   * A counsel for tests: `answer` of the prompt's words, written as the real
   * run writes it (`<dir>/run/codex.md`); each prompt it was asked lands in
   * `asked`, so a test reads what the judge sent.
   */
  static readonly layerTest = (answer: (prompt: string) => string, asked: Array<string> = []) =>
    Layer.effect(
      Counsel,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        return Counsel.of({
          ask: (prompt, dir) =>
            Effect.gen(function* () {
              const words = yield* fs.readFileString(prompt);
              asked.push(words);
              const file = path.join(dir, 'run', 'codex.md');
              yield* fs.makeDirectory(path.dirname(file), { recursive: true });
              const text = answer(words);
              yield* fs.writeFileString(file, text);
              return { file, text } satisfies CounselAnswer;
            }).pipe(Effect.mapError((error) => CounselFailed.make({ dir, reason: error.message }))),
        });
      }),
    );
}
