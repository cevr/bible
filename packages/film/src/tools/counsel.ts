// The counsel: a fresh model's answer to a prompt file, for the judge
// (`tools/judge.ts`). One seam, two adapters. `Counsel.layer` runs headless
// Claude Code (`claude -p`, Opus at max effort, its customizations off, its
// one tool Read, no session kept) in the counsel's sandbox
// (`tools/sandbox.ts`, macOS's `sandbox-exec`): it reads the prompt's folder
// (the packet and its stills, its working folder) and what Claude needs to
// run (its program, its settings and sign-in), and writes its own state and
// a scratch folder of its own; the repo, the films' out folders with an
// earlier judge's key, the owner's sessions and history and every other
// file in a home are unreadable there. The prompt goes in on stdin and the
// answer comes back on stdout, written to `claude.md` in a folder of its
// own, copied into `dir` once it is done. `Counsel.layerTest` answers from a
// function of the prompt, written where the real one writes, so a test runs
// the judge through the same files. The run is bounded: one past
// `COUNSEL_LIMIT` is stopped and fails.

import { Config, Context, Duration, Effect, FileSystem, Layer, Option, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { CounselFailed } from '../core/judge.ts';
import { collectWithin } from './process.ts';
import { type SandboxPlan, sandboxArgs } from './sandbox.ts';

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

/** Where one run reads and writes: the packet's folder, its answer's, its scratch folder. */
interface RunFolders {
  readonly packet: string;
  readonly answer: string;
  readonly scratch: string;
}

/** What runs in the sandbox: what it may touch, its environment, its argv, run from the packet. */
export interface SandboxedRun {
  readonly plan: SandboxPlan;
  readonly env: Readonly<Record<string, string>>;
  readonly command: ReadonlyArray<string>;
}

/** The file the answer is written to, in the answer's folder. */
const ANSWER = 'claude.md';

/** How long a counsel may take: Opus at max effort over a packet of stills. */
const COUNSEL_LIMIT = Duration.minutes(30);

/** The last lines `text` printed, for a failure's reason. */
const tailOf = (text: string) => text.trim().split('\n').slice(-3).join(' | ');

/** `file` less its last `n` parts: `up('/a/b/c', 2)` is `/a`. */
const up = (file: string, n: number) => file.split('/').slice(0, -n).join('/');

/**
 * Claude Code's state under `home` it keeps of other sessions: transcripts,
 * history, plans, todos, snapshots. Hidden from the counsel, so no earlier
 * run's words (a verdict, a key) reach it.
 */
const SESSIONS = [
  'projects',
  'history.jsonl',
  'file-history',
  'todos',
  'plans',
  'tasks',
  'teams',
  'shell-snapshots',
  'session-env',
  'sessions',
  'paste-cache',
  'debug',
];

/**
 * Headless Claude in the sandbox, `claude` its program's real path (a
 * version under `…/share/claude/versions/`) and `home` the host's home: it
 * reads the packet and its install; it reads and writes `~/.claude` (its
 * settings, sign-in and caches; other sessions hidden) and `~/.claude.json`
 * (with the files it writes beside it), and reads the user's keychains, where
 * its sign-in is kept; its temp files go to `scratch`. Nothing else of the
 * home is readable.
 */
export const claudeRun = (claude: string, home: string, folders: RunFolders): SandboxedRun => ({
  plan: {
    reads: [
      { _tag: 'Tree', path: folders.packet },
      { _tag: 'Tree', path: up(claude, 2) },
      { _tag: 'Tree', path: `${home}/Library/Keychains` },
    ],
    writes: [
      { _tag: 'Tree', path: folders.answer },
      { _tag: 'Tree', path: folders.scratch },
      { _tag: 'Tree', path: `${home}/.claude` },
      { _tag: 'Prefix', path: `${home}/.claude.json` },
    ],
    hidden: SESSIONS.map((name) => ({ _tag: 'Tree', path: `${home}/.claude/${name}` })),
  },
  env: {
    HOME: home,
    PATH: '/usr/bin:/bin',
    TMPDIR: folders.scratch,
    LANG: 'en_US.UTF-8',
    USER: home.split('/').at(-1) ?? '',
  },
  command: [
    claude,
    '-p',
    '--model',
    'opus',
    '--effort',
    'max',
    '--safe-mode',
    '--tools',
    'Read',
    '--allowedTools',
    'Read',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--output-format',
    'text',
  ],
});

/** `failed`'s words, as the run in `dir` failing. */
const failedIn = (dir: string) => (error: { readonly message: string }) =>
  CounselFailed.make({ dir, reason: error.message });

/** Claude's program, found on this process's PATH, by its real path. */
const claudeProgram = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const found = yield* Effect.fromOption(Option.fromNullishOr(Bun.which('claude'))).pipe(
    Effect.mapError(() =>
      CounselFailed.make({
        dir: '',
        reason: "the counsel runs Claude Code's `claude`, and it is not on PATH",
      }),
    ),
  );
  return yield* fs.realPath(found).pipe(Effect.mapError(failedIn('')));
});

export class Counsel extends Context.Service<Counsel, CounselService>()(
  '@bible/film/tools/Counsel',
) {
  /**
   * The counsel `run` (its folders given) in the sandbox
   * (`tools/sandbox.ts`), from the prompt's folder, the prompt on its stdin:
   * its stdout is the answer, written to `claude.md` in a folder of its own
   * under the system's temp folder and copied into `dir` once it is done.
   * Only on macOS: the sandbox is its `sandbox-exec`.
   */
  static readonly sandboxed = <E extends { readonly message: string }, R>(
    run: (folders: RunFolders) => Effect.Effect<SandboxedRun, E, R>,
  ) =>
    Layer.effect(
      Counsel,
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const context = yield* Effect.context<R>();

        const ask = Effect.fn('Counsel.ask')(function* (prompt: string, dir: string) {
          if (process.platform !== 'darwin')
            return yield* CounselFailed.make({
              dir,
              reason: `the counsel's sandbox is macOS's sandbox-exec, and this is ${process.platform}`,
            });
          const failed = failedIn(dir);
          const packet = yield* fs.realPath(path.dirname(prompt)).pipe(Effect.mapError(failed));
          const words = yield* fs.readFileString(prompt).pipe(Effect.mapError(failed));
          yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(failed));
          const done = yield* Effect.scoped(
            Effect.gen(function* () {
              const answer = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
              const scratch = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
              const how = yield* run({ packet, answer, scratch }).pipe(
                Effect.provideContext(context),
              );
              const [program = 'claude', ...args] = sandboxArgs(how.plan, how.command);
              yield* Effect.log(`counsel.start prompt=${prompt} dir=${dir} sandbox=sandbox-exec`);
              const finished = yield* collectWithin(
                spawner,
                'claude',
                ChildProcess.make(program, args, {
                  cwd: packet,
                  env: { ...how.env },
                  stdin: Stream.make(new TextEncoder().encode(words)),
                }),
                COUNSEL_LIMIT,
              );
              yield* fs.writeFileString(path.join(answer, ANSWER), finished.stdout);
              yield* fs.copy(answer, dir);
              return finished;
            }),
          ).pipe(Effect.mapError(failed));
          if (done.exitCode !== 0)
            return yield* CounselFailed.make({
              dir,
              reason: `the counsel exited ${done.exitCode}: ${tailOf(done.stderr) || tailOf(done.stdout)}`,
            });
          const file = path.join(dir, ANSWER);
          // Paths as the sandbox resolved them (the temp folder's real one), said as the asker's.
          const text = done.stdout.replaceAll(packet, path.dirname(prompt));
          if (text.trim() === '')
            return yield* CounselFailed.make({ dir, reason: `it answered nothing in ${file}` });
          yield* Effect.log(`counsel.answered file=${file} chars=${text.length}`);
          return { file, text } satisfies CounselAnswer;
        });

        return Counsel.of({ ask });
      }),
    );

  /** Headless Claude, Opus at max effort, in the sandbox (`claudeRun`), its program found on PATH. */
  static readonly layer = Counsel.sandboxed((folders) =>
    Effect.gen(function* () {
      const claude = yield* claudeProgram;
      const home = yield* Config.String('HOME');
      return claudeRun(claude, home, folders);
    }),
  );

  /**
   * A counsel for tests: `answer` of the prompt's words, written as the real
   * run writes it (`<dir>/claude.md`); each prompt it was asked lands in
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
              const file = path.join(dir, ANSWER);
              yield* fs.makeDirectory(dir, { recursive: true });
              const text = answer(words);
              yield* fs.writeFileString(file, text);
              return { file, text } satisfies CounselAnswer;
            }).pipe(Effect.mapError((error) => CounselFailed.make({ dir, reason: error.message }))),
        });
      }),
    );
}
