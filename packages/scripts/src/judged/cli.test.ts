// The judged lint at its command boundary, as the pre-push hook runs it: a
// failure of any kind is one skip line and success. The cases that need a
// model's answer run the command in-process over a test model layer; the
// two that run the real program as a process have no key and no `security`
// on their PATH, so nothing they do can send a request.

import { BunHttpServer } from '@effect/platform-bun';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Console, Effect, Exit, FileSystem, Layer, Path, Schema, Stream } from 'effect';
import { DecisionModel } from 'effect/ai';
import { describe, expect, it } from 'effect-bun-test';
import { HttpServer, HttpServerResponse } from 'effect/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { lintJudged } from './cli.js';
import { judgedModel } from './model.js';
import { env, missing, typesafeHttp } from './testing.js';

const PACKAGES = new URL('../../../', import.meta.url).pathname;
const CLI = new URL('../lint-judged.ts', import.meta.url).pathname;
const ROOT_PACKAGE = new URL('../../../../package.json', import.meta.url).pathname;

/** A package.json, as far as its scripts. */
const Scripts = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.Record(Schema.String, Schema.String) }),
);

/** Runs `command args` in `cwd`; answers its exit code, stdout and stderr. */
const run = (
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
  env?: Record<string, string>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(command, args, { cwd, ...(env && { env, extendEnv: false }) }),
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

/**
 * An environment with no key and a PATH of only `git` and `bun`: no
 * `security`, so the keychain gives none either.
 */
const keyless = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const bin = yield* fs.makeTempDirectoryScoped({ prefix: 'judged-bin-' });
  for (const tool of ['git', 'bun']) {
    const found = yield* run('.', 'sh', ['-c', `command -v ${tool}`]);
    yield* fs.symlink(found.stdout, path.join(bin, tool));
  }
  return {
    PATH: bin,
    HOME: yield* Config.String('HOME'),
    TMPDIR: yield* Config.String('TMPDIR').pipe(Config.withDefault('/tmp')),
  };
});

/** A host on a local port that counts the requests it is sent and answers each 500. */
const counting = Effect.gen(function* () {
  const seen = { requests: 0 };
  const http = yield* BunHttpServer.make({ hostname: '127.0.0.1', port: 0 });
  yield* http.serve(
    Effect.sync(() => {
      seen.requests++;
      return HttpServerResponse.empty({ status: 500 });
    }),
  );
  return { url: HttpServer.formatAddress(http.address), seen };
});

/** The lint's own model over a fake TypeSafe that answers every key history at 0.97. */
const historyModel = () => {
  const http = typesafeHttp(200, (keys) => ({
    model: 'jev-latest',
    answers: Object.fromEntries(
      keys.map((key) => [
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
  }));
  return {
    layer: judgedModel.pipe(
      Layer.provide(
        Layer.mergeAll(http.layer, missing().layer, env({ TYPESAFE_API_KEY: 'test-key' })),
      ),
    ),
    requests: http.requests,
  };
};

/** A model whose every answer is a defect. */
const dyingModel = Layer.effect(DecisionModel.DecisionModel)(
  DecisionModel.make({ decide: () => Effect.die('a defect in the model') }),
);

/** The command run in-process in `dir` over `model`: its exit, stdout lines and stderr lines. */
const inProcess = <E extends { readonly _tag: string }, R>(
  dir: string,
  args: ReadonlyArray<string>,
  model: Layer.Layer<DecisionModel.DecisionModel, E, R>,
) =>
  Effect.gen(function* () {
    const out: Array<string> = [];
    const err: Array<string> = [];
    const recording: Console.Console = {
      ...Console.Console.defaultValue(),
      log: (...parts: ReadonlyArray<unknown>) => {
        out.push(parts.map(String).join(' '));
      },
      error: (...parts: ReadonlyArray<unknown>) => {
        err.push(parts.map(String).join(' '));
      },
    };
    const exit = yield* lintJudged(args, dir, model).pipe(
      Effect.provideService(Console.Console, recording),
      Effect.exit,
    );
    return { exit, out, err };
  });

const FINDING =
  "src/a.ts:1 warning judged(historyComment): the comment tells the code's history: say what it does today and why; how it got here lives in git log p=0.97";

const withFs = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('the judged lint fails open', () => {
  it.live('skips reason=error, exit 0, when git cannot read the base', () =>
    withFs(
      Effect.gen(function* () {
        const dir = yield* repo;
        const out = yield* run(
          dir,
          'bun',
          ['--no-env-file', CLI, '--base', 'no-such-ref'],
          yield* keyless,
        );
        expect(out.code).toBe(0);
        expect(out.stdout).toBe(
          '[judged] skipped rule=historyComment reason=error items=0 detail=GitFailed',
        );
        expect(out.stderr).toContain('git merge-base exited 128');
      }),
    ),
  );

  it.live('reads no .env file: one that names another host and a key changes nothing', () =>
    withFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const host = yield* counting;
        const dir = yield* repo;
        // The repo's own `lint:judged` line, run by `bun run` as the hook
        // runs it, in a repo whose untracked `.env.development` names a key,
        // a counting host as TypeSafe's, and a proxy that answers nothing.
        const root = yield* Schema.decodeEffect(Scripts)(yield* fs.readFileString(ROOT_PACKAGE));
        yield* fs.writeFileString(
          path.join(dir, 'package.json'),
          yield* Schema.encodeEffect(Scripts)({
            scripts: { 'lint:judged': root.scripts['lint:judged'] ?? '' },
          }),
        );
        yield* fs.symlink(PACKAGES, path.join(dir, 'packages'));
        yield* fs.writeFileString(
          path.join(dir, '.env.development'),
          [
            'TYPESAFE_API_KEY=dotenv-key',
            `TYPESAFE_API_URL=${host.url}`,
            'HTTPS_PROXY=http://127.0.0.1:9',
            'HTTP_PROXY=http://127.0.0.1:9',
          ].join('\n'),
        );
        const out = yield* run(
          dir,
          'bun',
          ['run', 'lint:judged', '--base', 'main'],
          yield* keyless,
        );
        expect(out.code).toBe(0);
        expect(out.stdout.split('\n').at(-1)).toBe(
          '[judged] skipped rule=historyComment reason=no-key items=1',
        );
        expect(host.seen.requests).toBe(0);
      }),
    ),
  );

  it.live('prints its findings and succeeds when the cache folder cannot be written', () =>
    withFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* repo;
        yield* fs.makeDirectory(path.join(dir, 'tmp'));
        yield* fs.writeFileString(path.join(dir, 'tmp', 'judged'), 'a file, not a folder\n');
        const model = historyModel();
        const lint = yield* inProcess(dir, ['--base', 'main'], model.layer);
        expect(Exit.isSuccess(lint.exit)).toBe(true);
        expect(lint.out).toEqual([
          FINDING,
          '[judged] rule=historyComment items=1 cached=0 asked=1 findings=1',
        ]);
        expect(lint.err.join('\n')).toContain('[judged] answers not kept rule=historyComment');
        expect(model.requests).toHaveLength(1);
      }),
    ),
  );

  it.live('still fails on a finding under --strict', () =>
    withFs(
      Effect.gen(function* () {
        const dir = yield* repo;
        const lint = yield* inProcess(dir, ['--base', 'main', '--strict'], historyModel().layer);
        expect(Exit.isFailure(lint.exit)).toBe(true);
        expect(lint.out.at(-1)).toBe(
          '[judged] rule=historyComment items=1 cached=0 asked=1 findings=1',
        );
      }),
    ),
  );

  it.live('skips reason=error detail=defect, and succeeds, on a defect inside the program', () =>
    withFs(
      Effect.gen(function* () {
        const dir = yield* repo;
        const lint = yield* inProcess(dir, ['--base', 'main'], dyingModel);
        expect(Exit.isSuccess(lint.exit)).toBe(true);
        expect(lint.out).toEqual([
          '[judged] skipped rule=historyComment reason=error items=1 detail=defect',
        ]);
      }),
    ),
  );
});
