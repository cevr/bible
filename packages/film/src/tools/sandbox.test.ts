// The counsel's sandbox as a Seatbelt profile: it closes every home, the temp
// folders and other volumes to reading, opens the packet, Claude's install
// and keychains to read and its answer, scratch and own state to write, and
// hides Claude's other sessions and history even inside its state. On macOS
// the profile is run: a program in it reads the packet and nothing beside it.

import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { claudeRun } from './counsel.ts';
import { collect } from './process.ts';
import { CLOSED, profileOf, sandboxArgs } from './sandbox.ts';

const home = '/Users/someone';
const claude = `${home}/.local/share/claude/versions/2.1.300`;
const folders = {
  packet: '/private/var/folders/xy/T/judge-x1',
  answer: '/private/var/folders/xy/T/answer-y2',
  scratch: '/private/var/folders/xy/T/scratch-z3',
};
const run = claudeRun(claude, home, folders);
const profile = profileOf(run.plan);
const lines = profile.split('\n');

describe("the counsel's sandbox", () => {
  test('closes every home and temp folder, then opens the packet, the install and its own state', () => {
    expect(lines.slice(0, 4)).toEqual([
      '(version 1)',
      '(allow default)',
      '(deny file-write*)',
      '(allow file-write* (subpath "/dev"))',
    ]);
    expect(lines[4]).toBe(
      `(deny file-read-data ${CLOSED.map((place) => `(subpath "${place.path}")`).join(' ')})`,
    );
    expect(lines[5]).toBe(
      [
        '(allow file-read-data',
        `(subpath "${folders.packet}")`,
        `(subpath "${home}/.local/share/claude")`,
        `(subpath "${home}/Library/Keychains")`,
        `(subpath "${folders.answer}")`,
        `(subpath "${folders.scratch}")`,
        `(subpath "${home}/.claude")`,
        `(regex "^\\\\/Users\\\\/someone\\\\/\\\\.claude\\\\.json"))`,
      ].join(' '),
    );
    expect(lines[6]).toBe(
      [
        '(allow file-write*',
        `(subpath "${folders.answer}")`,
        `(subpath "${folders.scratch}")`,
        `(subpath "${home}/.claude")`,
        `(regex "^\\\\/Users\\\\/someone\\\\/\\\\.claude\\\\.json"))`,
      ].join(' '),
    );
    // Last, so it wins: other sessions' transcripts and history, inside its own state.
    expect(lines[7]).toContain('(deny file-read-data file-write*');
    for (const kept of ['projects', 'history.jsonl', 'file-history', 'todos', 'plans', 'sessions'])
      expect(lines[7]).toContain(`(subpath "${home}/.claude/${kept}")`);
    expect(lines).toHaveLength(8);
  });

  test('opens no home, repo or temp folder whole', () => {
    const opened = [...run.plan.reads, ...run.plan.writes].map((place) => place.path);
    for (const whole of [
      '/',
      '/Users',
      home,
      `${home}/Developer`,
      `${home}/Library`,
      '/private/tmp',
      '/private/var/folders',
    ])
      expect([whole, opened.includes(whole)]).toEqual([whole, false]);
  });

  test('runs headless Claude on Opus at max effort, Read its one tool, no session kept, in a plain environment', () => {
    const argv = sandboxArgs(run.plan, run.command);
    expect(argv.slice(0, 3)).toEqual(['sandbox-exec', '-p', profile]);
    expect(argv.slice(3)).toEqual([
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
    expect(run.env).toEqual({
      HOME: home,
      PATH: '/usr/bin:/bin',
      TMPDIR: folders.scratch,
      LANG: 'en_US.UTF-8',
      USER: 'someone',
    });
  });

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
        const cat = (file: string) =>
          Effect.flatMap(
            Effect.sync(() => sandboxArgs(plan, ['/bin/cat', file])),
            ([program = '', ...args]) => collect(spawner, ChildProcess.make(program, args)),
          );
        const read = yield* cat(path.join(packet, 'packet.md'));
        expect([read.exitCode, read.stdout]).toEqual([0, 'the packet']);
        const key = yield* cat(path.join(root, 'key.json'));
        expect([key.exitCode, key.stderr]).toEqual([1, expect.stringContaining('not permitted')]);
        const repo = yield* cat(path.join(import.meta.dir, 'sandbox.ts'));
        expect(repo.exitCode).toBe(1);
        const written = yield* collect(
          spawner,
          ChildProcess.make('sandbox-exec', [
            '-p',
            profileOf(plan),
            '/usr/bin/touch',
            path.join(root, 'beside'),
            path.join(answer, 'kept'),
          ]),
        );
        expect(written.exitCode).toBe(1);
        expect(yield* fs.exists(path.join(answer, 'kept'))).toBe(true);
        expect(yield* fs.exists(path.join(root, 'beside'))).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    5_000,
  );
});
