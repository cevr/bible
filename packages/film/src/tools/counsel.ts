// The counsel: another model family's answer to a prompt file, for the judge
// (`tools/judge.ts`). One seam, two adapters. `Counsel.layer` runs
// `okra counsel --deep --from claude` (Codex at its deeper profile,
// read-only) in the counsel's sandbox (`tools/sandbox.ts`): it can read the
// prompt's folder (the packet and its stills, nothing else) and what okra
// and Codex need to run (their programs, Node, Codex's sign-in and
// settings), and writes into a folder of its own, under the system's temp
// folder, copied into `dir` once it is done; okra's copy of the prompt and
// its run folder land there too (`-o` is the sandbox's answer folder), never
// in a project path. Every other file on the machine (the repo, the films'
// out folders with an earlier judge's key, the caches, the real `/tmp`) is
// absent there. `Counsel.layerTest` answers from a function of the prompt,
// written where the real one writes, so a test runs the judge through the
// same files. No time limit of its own: okra bounds the run and exits 124
// when it times out.

import { Array as Arr, Config, Context, Effect, FileSystem, Layer, Option, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { CounselFailed } from '../core/judge.ts';
import { collect } from './process.ts';
import { type Mount, SEEN, sandboxArgs } from './sandbox.ts';

/** What a counsel answered: the file it wrote, and its words. */
interface CounselAnswer {
  readonly file: string;
  readonly text: string;
}

interface CounselService {
  /**
   * The answer to the prompt in `prompt`, its run's files kept under `dir`.
   * The prompt's folder is all the counsel reads of the asker's: put nothing
   * there it must not see.
   */
  readonly ask: (prompt: string, dir: string) => Effect.Effect<CounselAnswer, CounselFailed>;
}

/** What runs in the sandbox: what it needs mounted, its environment, its argv for a prompt as seen there. */
export interface SandboxedRun {
  readonly mounts: ReadonlyArray<Mount>;
  readonly env: Readonly<Record<string, string>>;
  readonly command: (prompt: string) => ReadonlyArray<string>;
}

/** The programs okra's counsel runs, by their real paths on the host. */
interface CounselTools {
  /** okra's program (one file). */
  readonly okra: string;
  /** Codex's entry (`…/node_modules/@openai/codex/bin/codex.js`). */
  readonly codex: string;
  /** Node, which runs Codex's entry (`…/bin/node`). */
  readonly node: string;
}

/** The files an okra counsel run answers in, by the agent that answered. */
const ANSWERS = ['codex.md', 'claude.md'];

/** The last lines `text` printed, for a failure's reason. */
const tailOf = (text: string) => text.trim().split('\n').slice(-3).join(' | ');

/** `file` less its last `n` parts: `up('/a/b/c', 2)` is `/a`. */
const up = (file: string, n: number) => file.split('/').slice(0, -n).join('/');

/**
 * What okra's counsel needs in the sandbox, `home` the host's home: okra's
 * program; Codex's package beside its platform package (their `@openai`
 * folder) and Node, each under `SEEN.tools` and linked into `SEEN.bin`; a
 * home of its own holding only Codex's sign-in (written: a refreshed token
 * lands in place), its settings and model list, and okra's model list
 * (read). Codex's history, memories and sessions stay out.
 */
export const okraRun = (tools: CounselTools, home: string): SandboxedRun => {
  const scope = up(tools.codex, 3);
  const seenScope = `${SEEN.tools}/node_modules/${scope.split('/').at(-1) ?? '@openai'}`;
  const nodeRoot = up(tools.node, 2);
  const codexHome = `${SEEN.home}/.codex`;
  return {
    mounts: [
      { _tag: 'Read', from: tools.okra, to: `${SEEN.bin}/okra`, optional: false },
      { _tag: 'Read', from: scope, to: seenScope, optional: false },
      {
        _tag: 'Link',
        target: `${seenScope}/${tools.codex.slice(scope.length + 1)}`,
        to: `${SEEN.bin}/codex`,
      },
      { _tag: 'Read', from: nodeRoot, to: `${SEEN.tools}/node`, optional: false },
      {
        _tag: 'Link',
        target: `${SEEN.tools}/node/${tools.node.slice(nodeRoot.length + 1)}`,
        to: `${SEEN.bin}/node`,
      },
      { _tag: 'Empty', to: SEEN.home },
      { _tag: 'Write', from: `${home}/.codex/auth.json`, to: `${codexHome}/auth.json` },
      {
        _tag: 'Read',
        from: `${home}/.codex/config.toml`,
        to: `${codexHome}/config.toml`,
        optional: true,
      },
      {
        _tag: 'Read',
        from: `${home}/.codex/models_cache.json`,
        to: `${codexHome}/models_cache.json`,
        optional: true,
      },
      {
        _tag: 'Read',
        from: `${home}/.okra/models.json`,
        to: `${SEEN.home}/.okra/models.json`,
        optional: true,
      },
    ],
    env: { PATH: `${SEEN.bin}:/usr/bin:/bin`, HOME: SEEN.home, LANG: 'C.UTF-8' },
    // Codex always: the sandbox carries Codex's runtime, not Claude's.
    command: (prompt) => [
      'okra',
      'counsel',
      '--deep',
      '--from',
      'claude',
      '-f',
      prompt,
      '-o',
      SEEN.answer,
    ],
  };
};

/** The programs okra's counsel runs, found on this process's PATH, by their real paths. */
const counselTools = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const find = (name: string) =>
    Effect.gen(function* () {
      const found = yield* Effect.fromOption(Option.fromNullishOr(Bun.which(name))).pipe(
        Effect.mapError(() =>
          CounselFailed.make({
            dir: SEEN.answer,
            reason: `the counsel's sandbox runs ${name}, and it is not on PATH`,
          }),
        ),
      );
      return yield* fs
        .realPath(found)
        .pipe(
          Effect.mapError((error) =>
            CounselFailed.make({ dir: SEEN.answer, reason: error.message }),
          ),
        );
    });
  return {
    okra: yield* find('okra'),
    codex: yield* find('codex'),
    node: yield* find('node'),
  } satisfies CounselTools;
});

export class Counsel extends Context.Service<Counsel, CounselService>()(
  '@bible/film/tools/Counsel',
) {
  /**
   * The counsel `run` in the sandbox (`tools/sandbox.ts`), handed the
   * prompt's folder and a folder of its own under the system's temp folder,
   * copied into `dir` once it is done, answered or not; its answer is the
   * `codex.md` or `claude.md` it wrote, its paths as seen there said as the
   * host's.
   */
  static readonly sandboxed = <E extends { readonly message: string }, R>(
    run: Effect.Effect<SandboxedRun, E, R>,
  ) =>
    Layer.effect(
      Counsel,
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const context = yield* Effect.context<R>();
        const failed = (dir: string) => (error: { readonly message: string }) =>
          CounselFailed.make({ dir, reason: error.message });

        const ask = Effect.fn('Counsel.ask')(function* (prompt: string, dir: string) {
          const packet = path.dirname(prompt);
          const how = yield* run.pipe(Effect.provideContext(context), Effect.mapError(failed(dir)));
          yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(failed(dir)));
          const done = yield* Effect.scoped(
            Effect.gen(function* () {
              const answer = yield* fs.makeTempDirectoryScoped();
              const argv = sandboxArgs(
                { packet, answer, mounts: how.mounts, env: how.env },
                how.command(`${SEEN.packet}/${path.basename(prompt)}`),
              );
              yield* Effect.log(`counsel.start prompt=${prompt} dir=${dir} sandbox=bwrap`);
              const finished = yield* collect(spawner, ChildProcess.make('bwrap', [...argv]));
              yield* fs.copy(answer, dir);
              return finished;
            }),
          ).pipe(Effect.mapError(failed(dir)));
          if (done.exitCode !== 0)
            return yield* CounselFailed.make({
              dir,
              reason: `the counsel exited ${done.exitCode}${Arr.filter([' (timed out)'], () => done.exitCode === 124).join('')}: ${tailOf(done.stderr) || tailOf(done.stdout)}`,
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
          const said = yield* fs.readFileString(file).pipe(Effect.mapError(failed(dir)));
          // Paths as the sandbox showed them, said as the host's.
          const text = said.replaceAll(SEEN.packet, packet).replaceAll(SEEN.answer, dir);
          yield* Effect.log(`counsel.answered file=${file} chars=${text.length}`);
          return { file, text } satisfies CounselAnswer;
        });

        return Counsel.of({ ask });
      }),
    );

  /** `okra counsel --deep --from claude` in the sandbox (`okraRun`), its programs found on PATH. */
  static readonly layer = Counsel.sandboxed(
    Effect.gen(function* () {
      const tools = yield* counselTools;
      const home = yield* Config.String('HOME');
      return okraRun(tools, home);
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
