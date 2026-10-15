// The counsel: a fresh model's answer to a prompt file, for the judge
// (`tools/judge.ts`). One seam, two adapters. `Counsel.layer` runs headless
// Claude Code (`claude -p`, Opus at max effort, its customizations and the
// user's settings off, its one tool Read and that confined to the prompt's
// folder, no session kept) in the counsel's sandbox (`tools/sandbox.ts`,
// macOS's `sandbox-exec`). What it reads is an allow-list: the prompt's
// folder (the packet and its stills, its working folder), Claude's install,
// the user's keychains (its sign-in), and a scratch folder of the run's own
// that holds its temp files and its state (`CLAUDE_CONFIG_DIR`), the only
// place it writes. No home, no Claude state of the user's (other sessions,
// transcripts, history, settings), no repo and no films' out folders (an
// earlier judge's key) are readable there; the system's own files outside
// the homes and temp folders are. The prompt goes in on stdin and the answer
// comes back on stdout, which the host writes to `claude.md` in `dir`, beside
// its stderr (`claude.err`), as each arrives. `Counsel.layerTest` answers
// from a function of the prompt, written where the real one writes, so a
// test runs the judge through the same files. The run is bounded: one past
// `COUNSEL_LIMIT` is stopped and fails.

import { Config, Context, Duration, Effect, FileSystem, Layer, Option, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { CounselFailed } from '../core/judge.ts';
import { runInto } from './process.ts';
import { type SandboxPlan, sandboxArgs } from './sandbox.ts';

/** What a counsel answered: the file it wrote, and its words. */
interface CounselAnswer {
  readonly file: string;
  readonly text: string;
}

interface CounselService {
  /**
   * The answer to the prompt in `prompt`, what the run printed kept under
   * `dir`. The prompt's folder is all the counsel reads of the asker's: put
   * nothing there it must not see.
   */
  readonly ask: (prompt: string, dir: string) => Effect.Effect<CounselAnswer, CounselFailed>;
}

/** Where one run reads and writes: the packet's folder, and a scratch folder of its own. */
interface RunFolders {
  readonly packet: string;
  readonly scratch: string;
}

/** What runs in the sandbox: what it may touch, its environment, its argv, run from the packet. */
export interface SandboxedRun {
  readonly plan: SandboxPlan;
  readonly env: Readonly<Record<string, string>>;
  readonly command: ReadonlyArray<string>;
}

/** The file the answer (the run's stdout) is written to, in `dir`. */
const ANSWER = 'claude.md';

/** The file the run's stderr is written to, in `dir`. */
const ERRORS = 'claude.err';

/** How long a counsel may take: Opus at max effort over a packet of stills. */
const COUNSEL_LIMIT = Duration.minutes(30);

/** The last lines `text` printed, for a failure's reason. */
const tailOf = (text: string) => text.trim().split('\n').slice(-3).join(' | ');

/** `file` less its last `n` parts: `up('/a/b/c', 2)` is `/a`. */
const up = (file: string, n: number) => file.split('/').slice(0, -n).join('/');

/**
 * Headless Claude in the sandbox, `claude` its program's real path (a
 * version under `…/share/claude/versions/`) and `home` the host's home: it
 * reads the packet, its install and the user's keychains, where its sign-in
 * is kept; its temp files and its state go to `scratch`, the one folder it
 * writes. Nothing else of the home is readable: not `~/.claude`, not
 * `~/.claude.json`.
 */
const claudeRun = (claude: string, home: string, folders: RunFolders): SandboxedRun => ({
  plan: {
    reads: [folders.packet, up(claude, 2), `${home}/Library/Keychains`],
    writes: [folders.scratch],
  },
  env: {
    HOME: home,
    PATH: '/usr/bin:/bin',
    TMPDIR: folders.scratch,
    // Claude's own temp files (`<it>/claude-<uid>/`), else under the shared /tmp.
    CLAUDE_CODE_TMPDIR: folders.scratch,
    // Its state (settings, `.claude.json`, caches), a fresh one of the run's own.
    CLAUDE_CONFIG_DIR: `${folders.scratch}/claude`,
    // Its sign-in, the keychain item of the default state folder: a state
    // folder of its own would name another, suffixed with its hash.
    CLAUDE_SECURESTORAGE_CONFIG_DIR: '',
    DISABLE_AUTOUPDATER: '1',
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
    '--restricted',
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

/** Claude's program, found on this process's PATH, by its real path. */
const claudeProgram = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const found = yield* Effect.fromOption(Option.fromNullishOr(Bun.which('claude'))).pipe(
    Effect.mapError(() =>
      CounselFailed.make({
        reason: "the counsel runs Claude Code's `claude`, and it is not on PATH",
      }),
    ),
  );
  return yield* fs
    .realPath(found)
    .pipe(Effect.mapError((error) => CounselFailed.make({ reason: error.message })));
});

export class Counsel extends Context.Service<Counsel, CounselService>()(
  '@bible/film/tools/Counsel',
) {
  /**
   * The counsel `run` (its folders given) in the sandbox
   * (`tools/sandbox.ts`), from the prompt's folder, the prompt on its stdin:
   * its stdout is the answer, written to `claude.md` in `dir` and its stderr
   * to `claude.err` beside it, as each arrives. A failure names `dir` once
   * the run has printed there. Only on macOS: the sandbox is its
   * `sandbox-exec`.
   */
  static readonly sandboxed = <R>(
    run: (folders: RunFolders) => Effect.Effect<SandboxedRun, CounselFailed, R>,
  ) =>
    Layer.effect(
      Counsel,
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const context = yield* Effect.context<R>();

        const ask = Effect.fn('Counsel.ask')(function* (prompt: string, dir: string) {
          const outputs = { stdout: path.join(dir, ANSWER), stderr: path.join(dir, ERRORS) };
          /** Failed for `reason`, naming `dir` once the run printed there. */
          const failed = (reason: string) =>
            Effect.flatMap(
              fs.exists(outputs.stderr).pipe(Effect.orElseSucceed(() => false)),
              (kept) => Effect.fail(CounselFailed.make({ reason, ...(kept && { dir }) })),
            );
          if (process.platform !== 'darwin')
            return yield* failed(
              `the counsel's sandbox is macOS's sandbox-exec, and this is ${process.platform}`,
            );
          const asked = yield* Effect.all({
            packet: fs.realPath(path.dirname(prompt)),
            words: fs.readFileString(prompt),
            made: fs.makeDirectory(dir, { recursive: true }),
          }).pipe(Effect.catch((error) => failed(error.message)));
          const exitCode = yield* Effect.scoped(
            Effect.gen(function* () {
              const scratch = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
              const how = yield* run({ packet: asked.packet, scratch }).pipe(
                Effect.provideContext(context),
              );
              const [program = 'claude', ...args] = sandboxArgs(how.plan, how.command);
              yield* Effect.log(`counsel.start prompt=${prompt} dir=${dir} sandbox=sandbox-exec`);
              return yield* runInto(
                spawner,
                'claude',
                ChildProcess.make(program, args, {
                  cwd: asked.packet,
                  env: { ...how.env },
                  stdin: Stream.make(new TextEncoder().encode(asked.words)),
                }),
                COUNSEL_LIMIT,
                outputs,
              ).pipe(Effect.provideService(FileSystem.FileSystem, fs));
            }),
          ).pipe(
            Effect.catchTags({
              PlatformError: (error) => failed(error.message),
              ProcessTimedOut: (error) => failed(error.message),
            }),
          );
          const printed = yield* Effect.all([
            fs.readFileString(outputs.stdout),
            fs.readFileString(outputs.stderr),
          ]).pipe(Effect.catch((error) => failed(error.message)));
          const [stdout, stderr] = printed;
          if (exitCode !== 0)
            return yield* failed(
              `the counsel exited ${exitCode}: ${tailOf(stderr) || tailOf(stdout)}`,
            );
          // Paths as the sandbox resolved them (the temp folder's real one), said as the asker's.
          const text = stdout.replaceAll(asked.packet, path.dirname(prompt));
          if (text.trim() === '') return yield* failed(`it answered nothing in ${outputs.stdout}`);
          yield* Effect.log(`counsel.answered file=${outputs.stdout} chars=${text.length}`);
          return { file: outputs.stdout, text } satisfies CounselAnswer;
        });

        return Counsel.of({ ask });
      }),
    );

  /**
   * Headless Claude, Opus at max effort, in the sandbox (`claudeRun`), its
   * program the one `program` finds and its home `HOME`.
   */
  static readonly claudeAt = <R>(program: Effect.Effect<string, CounselFailed, R>) =>
    Counsel.sandboxed((folders) =>
      Effect.gen(function* () {
        const claude = yield* program;
        const home = yield* Config.String('HOME').pipe(
          Effect.mapError((error) => CounselFailed.make({ reason: error.message })),
        );
        return claudeRun(claude, home, folders);
      }),
    );

  /** Headless Claude in the sandbox (`claudeAt`), its program found on PATH. */
  static readonly layer = Counsel.claudeAt(claudeProgram);

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
