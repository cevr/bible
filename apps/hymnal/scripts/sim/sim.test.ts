/**
 * `sim.ts` without a device: its commands run over a stand-in spawner that
 * answers each tool as the test scripts it, and a dev server that never
 * answers. Each prints one result the result schema reads back; a failure
 * prints its tagged error and fails the command; `serve` kills the server
 * it started when its scope closes; and the real script exits non-zero.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import {
  Console,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  Sink,
  Stream,
} from 'effect';
import { Command } from 'effect/cli';
import { HttpClient, HttpClientError } from 'effect/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { simCommand } from './command.ts';
import type { Place } from './drive.ts';
import { Result, type Session } from './result.ts';

/** How the stand-in answers one run: its exit code and stdout, or a run that never ends. */
type Answer =
  | { readonly _tag: 'Exits'; readonly exitCode: number; readonly stdout: string }
  | { readonly _tag: 'Hangs' };

interface Spawned {
  readonly line: string;
  killed: boolean;
}

/** A spawner that answers each run by `script(line)` and records every run and kill. */
const standIn = (
  script: (line: string) => Answer,
  started: Option.Option<Deferred.Deferred<void>> = Option.none(),
) => {
  const runs: Array<Spawned> = [];
  const layer = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.gen(function* () {
        const line = lineOf(command);
        const run: Spawned = { line, killed: false };
        runs.push(run);
        if (Option.isSome(started)) yield* Deferred.completeWith(started.value, Effect.void);
        const answer = script(line);
        const { exitCode, stdout } = outputOf(answer);
        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(4242),
          exitCode,
          isRunning: Effect.succeed(answer._tag === 'Hangs'),
          kill: () => Effect.sync(() => void (run.killed = true)),
          stdin: Sink.drain,
          stdout,
          stderr: Stream.empty,
          all: stdout,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        });
      }),
    ),
  );
  return { layer, runs };
};

/** A run's exit code and stdout as its answer gives them. */
const outputOf = (answer: Answer) => {
  if (answer._tag === 'Hangs') return { exitCode: Effect.never, stdout: Stream.never };
  return {
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(answer.exitCode)),
    stdout: Stream.encodeText(Stream.make(answer.stdout)),
  };
};

const lineOf = (command: ChildProcess.Command) => {
  if (command._tag !== 'StandardCommand') return command._tag;
  return [command.command, ...command.args].join(' ');
};

const ok = (stdout = ''): Answer => ({ _tag: 'Exits', exitCode: 0, stdout });
const failed = (stdout = ''): Answer => ({ _tag: 'Exits', exitCode: 1, stdout });
const hangs: Answer = { _tag: 'Hangs' };

/** A dev server that answers every request 503: never ready. */
const ServerDown = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({ request, description: 'refused' }),
      }),
    ),
  ),
);

const UDID = '9EB6603E-F956-4357-BB74-543644BC3E2C';

const session = (platform: Session['platform'], out: string): Session => ({
  platform,
  out,
  port: 8270,
  serverPid: 4242,
  udid: { ios: UDID, web: '' }[platform],
  bootedAt: '2026-10-21T00:00:00.000Z',
});

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.toType(Schema.Unknown)));
const decodeResult = Schema.decodeUnknownSync(Schema.fromJsonString(Result));

/**
 * Run `sim <args>` over the stand-in, in a state folder of its own (with
 * `drive` as its session when given; `{state}` in an argument names the
 * folder): the lines it printed and its exit.
 */
const sim = (
  args: ReadonlyArray<string>,
  answers: ReturnType<typeof standIn>,
  drive: Option.Option<Session['platform']> = Option.none(),
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const state = yield* fs.makeTempDirectoryScoped();
    const out = path.join(state, 'out');
    if (Option.isSome(drive))
      yield* fs.writeFileString(
        path.join(state, 'session.json'),
        encodeJson(session(drive.value, out)),
      );
    const place: Place = { app: '/app', state, script: '/app/scripts/sim.ts' };
    const printed: Array<string> = [];
    const console: Console.Console = {
      ...globalThis.console,
      log: (...line: ReadonlyArray<unknown>) => void printed.push(line.join(' ')),
    };
    const exit = yield* Effect.exit(
      Command.runWith(simCommand(place), { version: '1.0.0', renderErrors: false })([
        ...args.map((arg) => arg.replace('{state}', state)),
        '--state',
        state,
      ]).pipe(Effect.provideService(Console.Console, console)),
    );
    return { exit, printed: printed.map((line) => decodeResult(line)) };
  }).pipe(Effect.provide(Layer.mergeAll(answers.layer, ServerDown)));

const Host = BunServices.layer;

describe('sim commands', () => {
  it.scoped('a tap on the web prints one success and clicks the label', () =>
    Effect.gen(function* () {
      const answers = standIn(() => ok());
      const { exit, printed } = yield* sim(
        ['tap', 'label=Play hymn 100'],
        answers,
        Option.some('web'),
      );
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(printed).toHaveLength(1);
      expect(printed[0]).toMatchObject({ ok: true, command: 'tap', platform: 'web' });
      expect(answers.runs.map((run) => run.line)).toContain(
        'agent-browser --session verify-hymnal click [aria-label="Play hymn 100"]',
      );
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('a tap on a simulator that is not booted fails as SimulatorDown', () =>
    Effect.gen(function* () {
      const devices = encodeJson({
        devices: { ios: [{ name: 'verify-hymnal', udid: UDID, state: 'Shutdown' }] },
      });
      const answers = standIn((line) => {
        if (line.startsWith('xcrun simctl list devices')) return ok(devices);
        return ok();
      });
      const { exit, printed } = yield* sim(['tap', 'label=Hymns'], answers, Option.some('ios'));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(printed).toHaveLength(1);
      expect(printed[0]).toMatchObject({
        ok: false,
        command: 'tap',
        error: { _tag: 'SimulatorDown', name: 'verify-hymnal', state: 'Shutdown' },
      });
      expect(answers.runs.some((run) => run.line.startsWith('agent-device'))).toBe(false);
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('a tap on a target the page lacks fails as TargetMissing and clicks nothing', () =>
    Effect.gen(function* () {
      const answers = standIn((line) => {
        if (line.includes(' wait ')) return failed('timed out waiting for selector');
        return ok();
      });
      const { exit, printed } = yield* sim(['tap', 'label=Chords'], answers, Option.some('web'));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(printed[0]).toMatchObject({
        ok: false,
        error: { _tag: 'TargetMissing', target: 'label=Chords', platform: 'web' },
      });
      expect(answers.runs.some((run) => run.line.includes(' click '))).toBe(false);
    }).pipe(Effect.provide(Host)),
  );

  it.scoped('a command with no booted drive fails as NoSession', () =>
    Effect.gen(function* () {
      const answers = standIn(() => ok());
      const { exit, printed } = yield* sim(['shot'], answers);
      expect(Exit.isFailure(exit)).toBe(true);
      expect(printed[0]).toMatchObject({ ok: false, error: { _tag: 'NoSession' } });
      expect(answers.runs).toHaveLength(0);
    }).pipe(Effect.provide(Host)),
  );

  it.live('a boot whose dev server never answers fails as ReadinessTimedOut and stops it', () =>
    Effect.scoped(
      Effect.gen(function* () {
        let stopped = false;
        const answers = standIn((line) => {
          if (line.startsWith('/bin/sh')) return ok('4242\n');
          if (line === 'kill -TERM 4242') stopped = true;
          // `kill -0` fails once the server is gone.
          if (line === 'kill -0 4242' && stopped) return failed();
          return ok();
        });
        const { exit, printed } = yield* sim(
          ['boot', '--platform', 'web', '--timeout', '1'],
          answers,
        );
        expect(Exit.isFailure(exit)).toBe(true);
        expect(printed[0]).toMatchObject({
          ok: false,
          command: 'boot',
          error: { _tag: 'ReadinessTimedOut', seconds: 1 },
        });
        expect(answers.runs.map((run) => run.line)).toContain('kill -TERM 4242');
      }),
    ).pipe(Effect.provide(Host)),
  );

  it.scoped('serve kills the dev server it started when its scope closes', () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const answers = standIn(() => hangs, Option.some(started));
      const fiber = yield* Effect.forkChild(
        sim(['serve', '--port', '8270', '--out', '{state}/out'], answers),
      );
      yield* Deferred.await(started);
      expect(answers.runs[0]?.line).toStartWith('/bin/sh -c');
      expect(answers.runs[0]?.killed).toBe(false);
      yield* Fiber.interrupt(fiber);
      expect(answers.runs[0]?.killed).toBe(true);
    }).pipe(Effect.provide(Host)),
  );
});

describe('sim.ts', () => {
  it.scoped('exits non-zero and prints the tagged error as JSON', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const state = yield* fs.makeTempDirectoryScoped();
      const script = path.join(import.meta.dirname, '..', 'sim.ts');
      const handle = yield* spawner.spawn(
        ChildProcess.make('bun', [script, 'tap', 'x', '--state', state], {
          forceKillAfter: '5 seconds',
        }),
      );
      const [stdout, exitCode] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
        { concurrency: 2 },
      );
      expect(stdout.trim().split('\n')).toHaveLength(1);
      expect(exitCode).not.toBe(0);
      expect(decodeResult(stdout.trim())).toMatchObject({
        ok: false,
        command: 'tap',
        error: { _tag: 'NoSession' },
      });
    }).pipe(Effect.provide(Host)),
  );
});
