// The counsel's sandbox as the counsel runs it (`Counsel.claudeAt`, a
// recording spawner in place of the process): headless Claude on Opus at max
// effort, from the packet's folder, under a Seatbelt profile that closes every
// home, the temp folders and other volumes to reading, opens the packet,
// Claude's install and keychains to read and a scratch folder of the run's
// own (its temp files and its state) to write, and nothing else. On macOS
// the profile is also run: a stand-in for Claude reads none of a home's
// Claude state and writes only its own, and a program in it reads the
// packet and nothing beside it.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, FileSystem, Layer, Path, Sink, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { CounselFailed } from '../core/judge.ts';
import { Counsel } from './counsel.ts';
import { collect } from './process.ts';
import { sandboxArgs } from './sandbox.ts';

const home = '/Users/someone';
const claude = `${home}/.local/share/claude/versions/2.1.300`;

/** A run of the counsel's process: its argv, folder and environment. */
interface Spawned {
  readonly argv: ReadonlyArray<string>;
  readonly cwd: string;
  readonly env: Readonly<Partial<Record<string, string>>>;
}

/** A spawner that keeps each command it is given and answers `answer` on stdout, exiting 0. */
const answering = (answer: string, spawned: Array<Spawned>) =>
  ChildProcessSpawner.make((command) => {
    if (command._tag === 'StandardCommand')
      spawned.push({
        argv: [command.command, ...command.args],
        cwd: command.options.cwd ?? '',
        env: command.options.env ?? {},
      });
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout: Stream.make(new TextEncoder().encode(answer)),
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    );
  });

/**
 * The counsel asked, through `Counsel.claudeAt`, with `home` as its home
 * and, where Claude is installed under it, a stand-in for Claude: a shell
 * script that reads the prompt and runs `body`. Its answer, and the folder
 * the run's files are kept in.
 */
const askingAt = (home: string, body: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fake = path.join(home, '.local/share/claude/versions/9.9.9');
    yield* fs.makeDirectory(path.dirname(fake), { recursive: true });
    yield* fs.writeFileString(fake, ['#!/bin/sh', 'cat >/dev/null', ...body].join('\n'));
    yield* fs.chmod(fake, 0o755);
    const packet = path.join(home, 'packet');
    yield* fs.makeDirectory(packet, { recursive: true });
    yield* fs.writeFileString(path.join(packet, 'packet.md'), 'rank A and B');
    const dir = path.join(yield* fs.realPath(yield* fs.makeTempDirectoryScoped()), 'counsel');
    const answer = yield* Effect.result(
      Effect.flatMap(Counsel, (counsel) => counsel.ask(path.join(packet, 'packet.md'), dir)).pipe(
        // oxlint-disable-next-line effect/noInlineProvide -- the counsel's HOME is the fixture home this test made
        Effect.provide(
          Counsel.claudeAt(Effect.succeed(fake)).pipe(
            Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ HOME: home }))),
            Layer.provideMerge(BunServices.layer),
          ),
        ),
      ),
    );
    return { answer, dir };
  });

describe("the counsel's sandbox", () => {
  it.effect(
    'runs headless Claude on Opus at max effort from the packet, every home closed but what it opens',
    () => {
      const spawned: Array<Spawned> = [];
      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const counsel = yield* Counsel;
        const packet = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
        const prompt = path.join(packet, 'packet.md');
        yield* fs.writeFileString(prompt, 'rank A and B');
        const run = path.join(yield* fs.makeTempDirectoryScoped(), 'counsel');
        const asked = yield* Effect.result(counsel.ask(prompt, run));
        if (process.platform !== 'darwin') {
          expect(asked._tag).toBe('Failure');
          return;
        }
        const answer = yield* Effect.fromResult(asked);
        expect([answer.file, answer.text]).toEqual([path.join(run, 'claude.md'), 'RANKING: B > A']);
        expect(yield* fs.readFileString(answer.file)).toBe('RANKING: B > A');
        expect(spawned).toHaveLength(1);
        const [one = { argv: [], cwd: '', env: {} }] = spawned;
        expect(one.argv.slice(0, 2)).toEqual(['sandbox-exec', '-p']);
        expect(one.argv.slice(3)).toEqual([
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
        ]);
        expect(one.cwd).toBe(packet);
        const { TMPDIR: scratch = '', ...env } = one.env;
        expect(env).toEqual({
          HOME: home,
          PATH: '/usr/bin:/bin',
          CLAUDE_CODE_TMPDIR: scratch,
          CLAUDE_CONFIG_DIR: `${scratch}/claude`,
          CLAUDE_SECURESTORAGE_CONFIG_DIR: '',
          DISABLE_AUTOUPDATER: '1',
          LANG: 'en_US.UTF-8',
          USER: 'someone',
        });
        const profile = one.argv[2] ?? '';
        const lines = profile.split('\n');
        expect(lines.slice(0, 5)).toEqual([
          '(version 1)',
          '(allow default)',
          '(deny file-write*)',
          '(allow file-write* (subpath "/dev"))',
          '(deny file-read-data (subpath "/Users") (subpath "/Volumes") (subpath "/private/tmp") (subpath "/private/var/folders") (subpath "/private/var/tmp"))',
        ]);
        // An allow-list: the packet, Claude's install, the keychains, and its own scratch folder.
        expect(lines[5]).toBe(
          `(allow file-read-data (subpath "${packet}") (subpath "${home}/.local/share/claude") (subpath "${home}/Library/Keychains") (subpath "${scratch}"))`,
        );
        expect(lines[6]).toBe(`(allow file-write* (subpath "${scratch}"))`);
        expect(lines).toHaveLength(7);
        // Opened whole: no home, no Claude state of the user's, no repo, no temp folder.
        for (const whole of [
          home,
          `${home}/.claude`,
          `${home}/Developer`,
          `${home}/Library`,
          '/private/var/folders',
        ])
          expect([whole, lines.slice(5, 7).join(' ').includes(`(subpath "${whole}")`)]).toEqual([
            whole,
            false,
          ]);
      }).pipe(
        Effect.scoped,
        Effect.provide(
          Counsel.claudeAt(Effect.succeed(claude)).pipe(
            Layer.provide(
              Layer.succeed(
                ChildProcessSpawner.ChildProcessSpawner,
                answering('RANKING: B > A', spawned),
              ),
            ),
            Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ HOME: home }))),
            Layer.provideMerge(BunServices.layer),
          ),
        ),
      );
    },
  );

  it.effect("routes through the host's Claude proxy (`ANTHROPIC_BASE_URL`) when it has one", () => {
    const spawned: Array<Spawned> = [];
    return Effect.gen(function* () {
      if (process.platform !== 'darwin') return;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const counsel = yield* Counsel;
      const packet = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
      yield* fs.writeFileString(path.join(packet, 'packet.md'), 'rank A and B');
      const run = path.join(yield* fs.makeTempDirectoryScoped(), 'counsel');
      yield* counsel.ask(path.join(packet, 'packet.md'), run);
      expect(spawned.map((one) => one.env['ANTHROPIC_BASE_URL'])).toEqual([
        'http://localhost:3456',
      ]);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Counsel.claudeAt(Effect.succeed(claude)).pipe(
          Layer.provide(
            Layer.succeed(
              ChildProcessSpawner.ChildProcessSpawner,
              answering('RANKING: B > A', spawned),
            ),
          ),
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                HOME: home,
                ANTHROPIC_BASE_URL: 'http://localhost:3456',
              }),
            ),
          ),
          Layer.provideMerge(BunServices.layer),
        ),
      ),
    );
  });

  it.effect(
    "on macOS Claude's run reads none of the home's Claude state, and writes only its own",
    () =>
      Effect.gen(function* () {
        if (process.platform !== 'darwin') return;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
        const marked = [
          '.claude/transcripts/marker',
          '.claude/projects/marker',
          '.claude/settings.json',
          '.claude.json',
          'Developer/repo/key.json',
        ];
        for (const file of marked) {
          yield* fs.makeDirectory(path.dirname(path.join(home, file)), { recursive: true });
          yield* fs.writeFileString(path.join(home, file), 'an earlier run');
        }
        // It says what it could read and write.
        const asked = yield* askingAt(home, [
          'echo "RANKING: no preference"',
          `for p in ${marked.map((file) => `"$HOME/${file}"`).join(' ')}; do`,
          '  if head -c 1 "$p" >/dev/null 2>&1; then echo "SEEN $p"; else echo "ABSENT $p"; fi',
          'done',
          'for d in "$HOME/.claude" "$CLAUDE_CONFIG_DIR" "$CLAUDE_CODE_TMPDIR"; do',
          '  if mkdir -p "$d" 2>/dev/null && touch "$d/wrote" 2>/dev/null; then echo "WROTE $d"; else echo "KEPT $d"; fi',
          'done',
        ]);
        const answer = yield* Effect.fromResult(asked.answer);
        const said = answer.text.trim().split('\n').slice(1);
        expect(said.slice(0, marked.length)).toEqual(
          marked.map((file) => `ABSENT ${path.join(home, file)}`),
        );
        expect(said[marked.length]).toBe(`KEPT ${home}/.claude`);
        expect(said.slice(marked.length + 1).map((line) => line.split(' ')[0])).toEqual([
          'WROTE',
          'WROTE',
        ]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    5_000,
  );

  it.effect(
    'on macOS a run that fails keeps what it printed, and its failure says why once',
    () =>
      Effect.gen(function* () {
        if (process.platform !== 'darwin') return;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
        const asked = yield* askingAt(home, [
          'echo "a first thought"',
          'echo "EPERM: operation not permitted, open \'/tmp/claude-501\'" >&2',
          'exit 3',
        ]);
        const failure = yield* Effect.flip(Effect.fromResult(asked.answer));
        expect(failure.dir).toBe(asked.dir);
        expect(failure.message).toBe(
          `the counsel run failed (the counsel exited 3: EPERM: operation not permitted, open '/tmp/claude-501'); what it printed is under ${asked.dir}`,
        );
        expect(yield* fs.readFileString(path.join(asked.dir, 'claude.err'))).toContain('EPERM');
        expect(yield* fs.readFileString(path.join(asked.dir, 'claude.md'))).toBe(
          'a first thought\n',
        );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    5_000,
  );

  it.effect('on macOS a run that never started names no folder, and says why once', () =>
    Effect.gen(function* () {
      if (process.platform !== 'darwin') return;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const counsel = yield* Counsel;
      const packet = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
      yield* fs.writeFileString(path.join(packet, 'packet.md'), 'rank A and B');
      const unfound = yield* Effect.flip(
        counsel.ask(path.join(packet, 'packet.md'), path.join(packet, 'counsel')),
      );
      expect(unfound.message).toBe('the counsel run failed (`claude` is not on PATH)');
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Counsel.claudeAt(
          Effect.fail(CounselFailed.make({ reason: '`claude` is not on PATH' })),
        ).pipe(Layer.provideMerge(BunServices.layer)),
      ),
    ),
  );

  it.effect(
    'on macOS a program in it reads the packet, and not a file beside it or in the home',
    () =>
      Effect.gen(function* () {
        if (process.platform !== 'darwin') return;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const root = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
        const packet = path.join(root, 'packet');
        const answer = path.join(root, 'answer');
        yield* fs.makeDirectory(packet);
        yield* fs.makeDirectory(answer);
        yield* fs.writeFileString(path.join(packet, 'packet.md'), 'the packet');
        yield* fs.writeFileString(path.join(root, 'key.json'), 'the key');
        const plan = {
          reads: [packet],
          writes: [answer],
        };
        const sandboxed = (command: ReadonlyArray<string>) =>
          Effect.flatMap(
            Effect.sync(() => sandboxArgs(plan, command)),
            ([program = '', ...args]) => collect(spawner, ChildProcess.make(program, args)),
          );
        const read = yield* sandboxed(['/bin/cat', path.join(packet, 'packet.md')]);
        expect([read.exitCode, read.stdout]).toEqual([0, 'the packet']);
        const key = yield* sandboxed(['/bin/cat', path.join(root, 'key.json')]);
        expect([key.exitCode, key.stderr]).toEqual([1, expect.stringContaining('not permitted')]);
        const repo = yield* sandboxed(['/bin/cat', path.join(import.meta.dir, 'sandbox.ts')]);
        expect(repo.exitCode).toBe(1);
        const written = yield* sandboxed([
          '/usr/bin/touch',
          path.join(root, 'beside'),
          path.join(answer, 'kept'),
        ]);
        expect(written.exitCode).toBe(1);
        expect(yield* fs.exists(path.join(answer, 'kept'))).toBe(true);
        expect(yield* fs.exists(path.join(root, 'beside'))).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    5_000,
  );
});
