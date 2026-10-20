// The judged lint at its command boundary, as `bun run lint` runs it: a
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
import { JudgedLint, judgedLintLayer } from './config.js';
import { judgedModel } from './model.js';
import { Findings, textHash } from './findings.js';
import { Store } from './store.js';
import { env, missing, typesafeHttp } from './testing.js';

const PACKAGES = new URL('../../../', import.meta.url).pathname;
const CLI = new URL('../lint-judged.ts', import.meta.url).pathname;
/** The timeout of a test here that spawns oxlint: a cold start's time is the machine's. */
const SPAWNS_MS = 30_000;

const PLUGIN = new URL('../../lint/judged.ts', import.meta.url).pathname;
const OXLINT = new URL('../../../../node_modules/.bin/oxlint', import.meta.url).pathname;
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
        ChildProcess.make(command, args, {
          cwd,
          forceKillAfter: '5 seconds',
          ...(env && { env, extendEnv: false }),
        }),
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

/** The repo's own rule `id` and judged settings (`withFs` provides them), with no ignore patterns. */
const lintConfig = (id: string) =>
  Effect.gen(function* () {
    const config = yield* JudgedLint;
    return yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
      categories: { correctness: 'off' },
      plugins: [],
      jsPlugins: [PLUGIN],
      ignorePatterns: [],
      settings: { judged: config.settings },
      rules: Object.fromEntries(
        config.rules
          .filter((rule) => rule.id === id)
          .map(({ id, severity, ...options }) => [`judged/${id}`, [severity, options]]),
      ),
    });
  });

/**
 * A repo linted by the repo's own rule `id` whose `main` has `file` as
 * `before`, and a branch that makes it `after`, committed; `src` is its
 * workspace, so a new file there is the repo's work.
 */
const repoOf = (id: string, file: string, before: string, after: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'judged-cli-' });
    yield* fs.makeDirectory(path.dirname(path.join(dir, file)), { recursive: true });
    yield* fs.writeFileString(path.join(dir, '.oxlintrc.json'), yield* lintConfig(id));
    yield* fs.writeFileString(path.join(dir, 'package.json'), '{ "workspaces": ["src"] }\n');
    yield* fs.writeFileString(path.join(dir, file), before);
    yield* git(dir, 'init', '-q', '-b', 'main');
    yield* git(dir, 'add', '-A');
    yield* git(dir, 'commit', '-qm', 'base');
    yield* git(dir, 'checkout', '-q', '-b', 'topic');
    yield* fs.writeFileString(path.join(dir, file), after);
    yield* git(dir, 'commit', '-qam', 'change');
    return dir;
  });

/** A repo whose branch adds a comment that tells history to `src/a.ts`. */
const repo = repoOf(
  'historyComment',
  'src/a.ts',
  'const a = 1;\n',
  '// This used to retry; pass 6 removed that.\nconst a = 1;\n',
);

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

/** The lint's own model over a fake TypeSafe that answers every key `choice` at 0.97, `other` at 0.03. */
const answering = (choice: string, other: string) => {
  const http = typesafeHttp(200, (keys) => ({
    model: 'jev-latest',
    answers: Object.fromEntries(
      keys.map((key) => [
        key,
        {
          type: 'choice',
          choice,
          probabilities: { [other]: 0.03, [choice]: 0.97 },
          confidence: 0.97,
        },
      ]),
    ),
    usage: { input_tokens: 10, output_tokens: 3 },
  }));
  return {
    layer: (model: string) =>
      judgedModel(model).pipe(
        Layer.provide(
          Layer.mergeAll(http.layer, missing().layer, env({ TYPESAFE_API_KEY: 'test-key' })),
        ),
      ),
    requests: http.requests,
  };
};

/** The model answering every key history. */
const historyModel = () => answering('history', 'today');

/** The lint's own model over a fake TypeSafe that answers every request 500. */
const refusingModel = (model: string) =>
  judgedModel(model).pipe(
    Layer.provide(
      Layer.mergeAll(
        typesafeHttp(500, () => ({})).layer,
        missing().layer,
        env({ TYPESAFE_API_KEY: 'test-key' }),
      ),
    ),
  );

/** A model whose every answer is a defect. */
const dyingModel = () =>
  Layer.effect(DecisionModel.DecisionModel)(
    DecisionModel.make({ decide: () => Effect.die('a defect in the model') }),
  );

/** The command run in-process in `dir` over `model`: its exit, stdout lines and stderr lines. */
const inProcess = <E extends { readonly _tag: string }, R>(
  dir: string,
  args: ReadonlyArray<string>,
  model: (name: string) => Layer.Layer<DecisionModel.DecisionModel, E, R>,
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

/** `effect` scoped, over Bun's services and the repo's own judged lint. */
const withFs = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.scoped,
    Effect.provide(Layer.provideMerge(judgedLintLayer(import.meta.dir), BunServices.layer)),
  );

describe('the judged lint fails open', () => {
  it.live('skips reason=error, exit 0, when git cannot read the repo', () =>
    withFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'judged-no-repo-' });
        const out = yield* run(dir, 'bun', ['--no-env-file', CLI], yield* keyless);
        expect(out.code).toBe(0);
        expect(out.stdout).toBe('[judged] skipped rule=* reason=error items=0 detail=GitFailed');
        expect(out.stderr).toContain('git rev-parse exited 128');
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
        // The repo's own `lint:judged` line, run by `bun run` as `bun run
        // lint` runs it, in a repo whose untracked `.env.development` names a key,
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
        const out = yield* run(dir, 'bun', ['run', 'lint:judged'], yield* keyless);
        expect(out.code).toBe(0);
        expect(out.stdout.split('\n').at(-1)).toBe(
          '[judged] skipped rule=historyComment reason=no-key items=1',
        );
        expect(host.seen.requests).toBe(0);
      }),
    ),
  );

  it.live('prints its findings and succeeds when the store folder cannot be written', () =>
    withFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* repo;
        yield* fs.writeFileString(path.join(dir, '.git', 'judged'), 'a file, not a folder\n');
        const model = historyModel();
        const lint = yield* inProcess(dir, [], model.layer);
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

  it.live(
    'leaves a kept finding in a file oxlint lints to oxlint: it prints the run line alone',
    () =>
      withFs(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* repo;
          const lint = yield* inProcess(dir, [], historyModel().layer);
          expect(Exit.isSuccess(lint.exit)).toBe(true);
          expect(lint.out).toEqual([
            '[judged] rule=historyComment items=1 cached=0 asked=1 findings=1',
          ]);
          const store = yield* fs.readFileString(path.join(dir, '.git', 'judged', 'store.json'));
          expect(Object.keys((yield* Schema.decodeEffect(Store)(store)).answers)).toHaveLength(1);
          expect(store).not.toContain('src/a.ts');
        }),
      ),
  );

  it.live('prints and fails on a finding oxlint cannot report, of a rule at error', () =>
    withFs(
      Effect.gen(function* () {
        const dir = yield* repoOf(
          'scriptSpeech',
          'apps/animations/series/s/scripts/01-a.md',
          '| # | Say | Picture |\n| - | - | - |\n| 1 | Rest. |  |\n',
          '| # | Say | Picture |\n| - | - | - |\n| 1 | Ellen White said, "Rest." |  |\n',
        );
        const lint = yield* inProcess(dir, [], answering('breach', 'clean').layer);
        expect(Exit.isFailure(lint.exit)).toBe(true);
        expect(lint.out).toEqual([
          'apps/animations/series/s/scripts/01-a.md:3 error judged(scriptSpeech): the beat names its sources or church history: teach it from Scripture, the idea unnamed p=0.97',
          '[judged] rule=scriptSpeech items=1 cached=0 asked=1 findings=1',
        ]);
      }),
    ),
  );

  it.live('prints every finding and fails on one under --strict', () =>
    withFs(
      Effect.gen(function* () {
        const dir = yield* repo;
        const lint = yield* inProcess(dir, ['--strict'], historyModel().layer);
        expect(Exit.isFailure(lint.exit)).toBe(true);
        expect(lint.out).toEqual([
          FINDING,
          '[judged] rule=historyComment items=1 cached=0 asked=1 findings=1',
        ]);
      }),
    ),
  );

  it.live('skips reason=error detail=defect, and succeeds, on a defect inside the program', () =>
    withFs(
      Effect.gen(function* () {
        const dir = yield* repo;
        const lint = yield* inProcess(dir, [], dyingModel);
        expect(Exit.isSuccess(lint.exit)).toBe(true);
        expect(lint.out).toEqual(['[judged] skipped rule=* reason=error items=1 detail=defect']);
      }),
    ),
  );
});

describe('the judged lint reads the whole repo, by content', () => {
  it.live(
    'a gating breach moved from films/x to films/y asks nothing again and fails oxlint at its new place',
    () =>
      withFs(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const script =
            "export const script = {\n  beats: [{ id: 'a', say: 'Ellen White said, rest.' }],\n};\n";
          const from = 'apps/animations/src/films/x/script.ts';
          const to = 'apps/animations/src/films/y/script.ts';
          const dir = yield* repoOf('scriptSpeech', from, script, script);
          const model = answering('breach', 'clean');
          const first = yield* inProcess(dir, [], model.layer);
          expect(Exit.isSuccess(first.exit)).toBe(true);
          expect(first.out).toEqual([
            '[judged] rule=scriptSpeech items=1 cached=0 asked=1 findings=1',
          ]);
          yield* fs.makeDirectory(path.dirname(path.join(dir, to)), { recursive: true });
          yield* git(dir, 'mv', from, to);
          const second = yield* inProcess(dir, [], model.layer);
          expect(second.out).toEqual([
            '[judged] rule=scriptSpeech items=1 cached=1 asked=0 findings=1',
          ]);
          expect(model.requests).toHaveLength(1);
          const lint = yield* run(dir, OXLINT, [
            '--format',
            'unix',
            '-c',
            '.oxlintrc.json',
            'apps',
          ]);
          expect(lint.code).not.toBe(0);
          expect(lint.stdout).toContain(`${to}:2:`);
          expect(lint.stdout).toContain('[Error/judged(scriptSpeech)]');
          expect(lint.stdout).not.toContain(from);
        }),
      ),
    SPAWNS_MS,
  );

  it.live(
    "writes each file it read by its hash, with each rule's kept findings, and no rule where an item went unjudged",
    () =>
      withFs(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* repo;
          const findingsOf = Effect.flatMap(
            fs.readFileString(path.join(dir, 'tmp/judged/findings.json')),
            Schema.decodeEffect(Findings),
          );
          yield* inProcess(dir, [], historyModel().layer);
          const a = yield* fs.readFileString(path.join(dir, 'src/a.ts'));
          expect((yield* findingsOf).files).toEqual({
            'src/a.ts': { hash: textHash(a), rules: { historyComment: [{ start: 0, p: 0.97 }] } },
          });
          const b = '// We switched to Rive in the spring.\nconst b = 2;\n';
          yield* fs.writeFileString(path.join(dir, 'src/b.ts'), b);
          const refused = yield* inProcess(dir, [], refusingModel);
          expect(refused.out.at(-1)).toBe(
            '[judged] skipped rule=historyComment reason=http items=1',
          );
          expect((yield* findingsOf).files).toEqual({
            'src/a.ts': { hash: textHash(a), rules: { historyComment: [{ start: 0, p: 0.97 }] } },
            'src/b.ts': { hash: textHash(b), rules: {} },
          });
        }),
      ),
  );

  it.live(
    'a worktree of the repo reads the answers another checkout kept, and asks none again',
    () =>
      withFs(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const dir = yield* repo;
          const model = historyModel();
          const first = yield* inProcess(dir, [], model.layer);
          expect(first.out).toEqual([
            '[judged] rule=historyComment items=1 cached=0 asked=1 findings=1',
          ]);
          const tree = yield* fs.makeTempDirectoryScoped({ prefix: 'judged-worktree-' });
          yield* git(dir, 'worktree', 'add', '-q', '--detach', tree, 'topic');
          const second = yield* inProcess(tree, [], model.layer);
          expect(second.out).toEqual([
            '[judged] rule=historyComment items=1 cached=1 asked=0 findings=1',
          ]);
          expect(model.requests).toHaveLength(1);
        }),
      ),
  );

  it.live('judges a new file never staged, as a committed one', () =>
    withFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* repoOf('historyComment', 'src/a.ts', 'const a = 1;\n', 'const a = 1;\n');
        yield* fs.writeFileString(
          path.join(dir, 'src', 'new.ts'),
          '// This used to retry; pass 6 removed that.\nconst b = 1;\n',
        );
        const lint = yield* inProcess(dir, ['--strict'], historyModel().layer);
        expect(lint.out).toEqual([
          FINDING.replace('src/a.ts', 'src/new.ts'),
          '[judged] rule=historyComment items=1 cached=0 asked=1 findings=1',
        ]);
      }),
    ),
  );

  it.live(
    "asks again for code whose literal's spacing an edit changed, and not for a re-indent",
    () =>
      withFs(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const code = (indent: string, literal: string) =>
            `${indent}// Joins with a spaced dash.\n${indent}export const join = () => '${literal}';\n`;
          const file = 'src/a.ts';
          const dir = yield* repoOf(
            'commentClaimsCode',
            file,
            code('', 'a - b'),
            code('', 'a - b'),
          );
          const model = answering('holds', 'overclaims');
          const first = yield* inProcess(dir, [], model.layer);
          expect(first.out).toEqual([
            '[judged] rule=commentClaimsCode items=1 cached=0 asked=1 findings=0',
          ]);
          yield* fs.writeFileString(path.join(dir, file), code('  ', 'a - b'));
          const reindented = yield* inProcess(dir, [], model.layer);
          expect(reindented.out).toEqual([
            '[judged] rule=commentClaimsCode items=1 cached=1 asked=0 findings=0',
          ]);
          yield* fs.writeFileString(path.join(dir, file), code('', 'a-b'));
          const respaced = yield* inProcess(dir, [], model.layer);
          expect(respaced.out).toEqual([
            '[judged] rule=commentClaimsCode items=1 cached=0 asked=1 findings=0',
          ]);
        }),
      ),
  );

  it.live('asks again for a test case whose only expect a change deleted, and for no other', () =>
    withFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cases = (body: string) =>
          [
            "import { expect, it } from 'bun:test';",
            "it('adds', () => {",
            `${body}});`,
            "it('subtracts', () => {",
            '  expect(2 - 1).toBe(1);',
            '});',
            '',
          ].join('\n');
        const file = 'src/a.test.ts';
        const dir = yield* repoOf(
          'testOracle',
          file,
          cases('  expect(1 + 1).toBe(2);\n'),
          cases('  expect(1 + 1).toBe(2);\n'),
        );
        const model = answering('independent', 'tautological');
        const first = yield* inProcess(dir, [], model.layer);
        expect(first.out).toEqual(['[judged] rule=testOracle items=2 cached=0 asked=2 findings=0']);
        yield* fs.writeFileString(path.join(dir, file), cases(''));
        const second = yield* inProcess(dir, [], model.layer);
        expect(second.out).toEqual([
          '[judged] rule=testOracle items=2 cached=1 asked=1 findings=0',
        ]);
      }),
    ),
  );
});
