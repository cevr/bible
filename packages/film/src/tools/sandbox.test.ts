// The counsel's sandbox as the counsel runs it (`Counsel.claudeAt`, a
// recording spawner in place of the process): headless Claude on Opus at max
// effort, from the packet's folder, under a Seatbelt profile that closes every
// home, the temp folders and other volumes to reading, opens the packet,
// Claude's install and keychains to read and its answer, scratch and own
// state to write, and hides Claude's other sessions and history even inside
// its state. On macOS the profile is also run: a program in it reads the
// packet and nothing beside it.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, FileSystem, Layer, Path, Sink, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
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
        const json = '(regex "^\\\\/Users\\\\/someone\\\\/\\\\.claude\\\\.json")';
        // The answer's folder is a temp folder of the run's own, named by a draw.
        const answerFolder = lines[5]?.match(/\(subpath "[^"]+"\)/g)?.[3] ?? '';
        expect(lines[5]).toBe(
          `(allow file-read-data (subpath "${packet}") (subpath "${home}/.local/share/claude") (subpath "${home}/Library/Keychains") ${answerFolder} (subpath "${scratch}") (subpath "${home}/.claude") ${json})`,
        );
        expect(lines[6]).toBe(
          `(allow file-write* ${answerFolder} (subpath "${scratch}") (subpath "${home}/.claude") ${json})`,
        );
        // Last, so it wins: other sessions' transcripts and history, inside its own state.
        expect(lines[7]).toMatch(/^\(deny file-read-data file-write\* /);
        for (const hidden of ['projects', 'history.jsonl', 'file-history', 'todos', 'plans'])
          expect(lines[7]).toContain(`(subpath "${home}/.claude/${hidden}")`);
        expect(lines).toHaveLength(8);
        // Opened whole: no home, no repo, no temp folder.
        for (const whole of [home, `${home}/Developer`, `${home}/Library`, '/private/var/folders'])
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
          reads: [{ _tag: 'Tree' as const, path: packet }],
          writes: [{ _tag: 'Tree' as const, path: answer }],
          hidden: [],
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
