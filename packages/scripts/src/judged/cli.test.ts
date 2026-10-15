// The judged lint through its own command line, as the pre-push hook runs it:
// a failure of any kind is one skip line and exit 0. The model is a fake
// TypeSafe on a local port (`TYPESAFE_API_URL`), so no test reaches the
// network.

import { BunHttpServer } from '@effect/platform-bun';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path, Schema, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { HttpServer, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

const CLI = new URL('../lint-judged.ts', import.meta.url).pathname;

/** Runs `command args` in `cwd` with `env` over the inherited one; answers its exit code, stdout and stderr. */
const run = (
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
  env: Record<string, string> = {},
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(command, args, { cwd, env, extendEnv: true }),
      );
      const [stdout, stderr, code] = yield* Effect.all(
        [
          Stream.decodeText(handle.stdout).pipe(Stream.mkString),
          Stream.decodeText(handle.stderr).pipe(Stream.mkString),
          handle.exitCode,
        ],
        { concurrency: 'unbounded' },
      );
      return { code: Number(code), stdout: stdout.trim(), stderr: stderr.trim() };
    }),
  );

const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  run(cwd, 'git', [
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    '-c',
    'commit.gpgsign=false',
    ...args,
  ]);

/** A repo whose `main` has `src/a.ts`, and a branch that adds a comment to it, committed. */
const repo = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'judged-cli-' });
  yield* fs.makeDirectory(path.join(dir, 'src'));
  yield* fs.writeFileString(path.join(dir, '.oxlintrc.json'), '{ "ignorePatterns": [] }\n');
  yield* fs.writeFileString(path.join(dir, 'src', 'a.ts'), 'const a = 1;\n');
  yield* git(dir, 'init', '-q', '-b', 'main');
  yield* git(dir, 'add', '-A');
  yield* git(dir, 'commit', '-qm', 'base');
  yield* git(dir, 'checkout', '-q', '-b', 'topic');
  yield* fs.writeFileString(
    path.join(dir, 'src', 'a.ts'),
    '// This used to retry; pass 6 removed that.\nconst a = 1;\n',
  );
  yield* git(dir, 'commit', '-qam', 'comment');
  return dir;
});

/** A request's question keys: all a fake TypeSafe reads of it. */
const Sent = Schema.Struct({ questions: Schema.Record(Schema.String, Schema.Json) });

/** A fake TypeSafe on a local port that answers every key history at 0.97; it counts its requests. */
const fakeTypesafe = Effect.gen(function* () {
  const seen = { requests: 0 };
  const http = yield* BunHttpServer.make({ hostname: '127.0.0.1', port: 0 });
  yield* http.serve(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      seen.requests++;
      const sent = yield* Schema.decodeUnknownEffect(Sent)(yield* request.json);
      return HttpServerResponse.jsonUnsafe({
        model: 'jev-latest',
        answers: Object.fromEntries(
          Object.keys(sent.questions).map((key) => [
            key,
            {
              type: 'choice',
              choice: 'history',
              probabilities: { today: 0.03, history: 0.97 },
              confidence: 0.97,
            },
          ]),
        ),
        usage: { input_tokens: 10, output_tokens: 3 },
      });
    }).pipe(Effect.orDie),
  );
  return { url: HttpServer.formatAddress(http.address), seen };
});

const lint = (dir: string, url: string, ...args: ReadonlyArray<string>) =>
  run(dir, 'bun', [CLI, ...args], {
    TYPESAFE_API_KEY: 'test-key',
    TYPESAFE_API_URL: url,
    JUDGED_MODEL: 'jev-latest',
  });

const withFs = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('the judged lint fails open', () => {
  it.live('skips reason=error, exit 0, when git cannot read the base', () =>
    withFs(
      Effect.gen(function* () {
        const typesafe = yield* fakeTypesafe;
        const dir = yield* repo;
        const out = yield* lint(dir, typesafe.url, '--base', 'no-such-ref');
        expect(out.code).toBe(0);
        expect(out.stdout).toBe(
          '[judged] skipped rule=historyComment reason=error items=0 detail=GitFailed',
        );
        expect(out.stderr).toContain('git merge-base exited 128');
        expect(typesafe.seen.requests).toBe(0);
      }),
    ),
  );

  it.live('prints its findings, exit 0, when the cache folder cannot be written', () =>
    withFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const typesafe = yield* fakeTypesafe;
        const dir = yield* repo;
        yield* fs.makeDirectory(path.join(dir, 'tmp'));
        yield* fs.writeFileString(path.join(dir, 'tmp', 'judged'), 'a file, not a folder\n');
        const out = yield* lint(dir, typesafe.url, '--base', 'main');
        expect(out.code).toBe(0);
        expect(out.stdout.split('\n')).toEqual([
          "src/a.ts:1 warning judged(historyComment): the comment tells the code's history: say what it does today and why; how it got here lives in git log p=0.97",
          '[judged] rule=historyComment items=1 cached=0 asked=1 findings=1',
        ]);
        expect(out.stderr).toContain('[judged] answers not kept rule=historyComment');
        expect(typesafe.seen.requests).toBe(1);
      }),
    ),
  );

  it.live('still fails on a finding under --strict', () =>
    withFs(
      Effect.gen(function* () {
        const typesafe = yield* fakeTypesafe;
        const dir = yield* repo;
        const out = yield* lint(dir, typesafe.url, '--base', 'main', '--strict');
        expect(out.code).toBe(1);
        expect(out.stdout).toEndWith(
          '[judged] rule=historyComment items=1 cached=0 asked=1 findings=1',
        );
      }),
    ),
  );
});
