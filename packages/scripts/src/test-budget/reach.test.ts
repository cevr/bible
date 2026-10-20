import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { fileURLToPath } from 'node:url';
import { reachesIn, repoTests } from './reach.ts';

/** A test file's text: one that imports its runner. */
const RUNNER = "import { test } from 'bun:test';\n";

/**
 * How `scripts` (a workspace at `w`, `/repo/w`, its playwright configs
 * `configs`, its `.gitignore` texts by folder `gitignores`, its bunfig's
 * text `bunfig`, its wrappers of `bun test` `wrappers`) reach each of
 * `files` (paths from `w`), as `<file>: <script>`, or `none`.
 */
const reaches = (
  scripts: Record<string, string>,
  files: ReadonlyArray<string>,
  configs: Record<string, string> = {},
  gitignores: Record<string, string> = {},
  bunfig = '',
  wrappers: ReadonlyArray<string> = [],
) =>
  reachesIn(
    [{ dir: 'w', absolute: '/repo/w', scripts, configs, gitignores, bunfig, wrappers }],
    files.map((file) => ({ file: `w/${file}`, text: RUNNER, link: false })),
  ).map(({ file, by }) => `${file.slice(2)}: ${Option.getOrElse(by, () => 'none')}`);

describe("a workspace's test files", () => {
  it.effect(
    'are each a file named as a test that is not data, in the deepest workspace or in none, and not a link',
    () =>
      Effect.sync(() => {
        const test = { test: 'bun test' };
        const of = (file: string, text: string, link = false) => ({ file, text, link });
        expect(
          reachesIn(
            [
              {
                dir: 'w',
                absolute: '/repo/w',
                scripts: test,
                configs: {},
                gitignores: {},
                bunfig: '',
                wrappers: [],
              },
              {
                dir: 'w/nested',
                absolute: '/repo/w/nested',
                scripts: {},
                configs: {},
                gitignores: {},
                bunfig: '',
                wrappers: [],
              },
            ],
            [
              of('w/a.test.ts', RUNNER),
              of('w/a_test.tsx', "import { it } from 'effect-bun-test';"),
              of('w/b.spec.js', "import { test } from '@playwright/test';"),
              of('w/c_spec.mts', "test('runs on the global', () => {});"),
              of('w/d.test.ts', '  describe.each(rows)("a row", () => {});'),
              of('w/e.ts', RUNNER),
              of(
                'w/study.spec.js',
                '// a study: it (the spec) is read by the CLI\nexport default {};',
              ),
              of(
                'w/data.spec.js',
                "export default { title: 'a', tags: ['x', `y`], at: { n: 1, ok: true, none: null } };",
              ),
              of(
                'w/h.test.ts',
                "import { test as scenario } from /* runner */ 'bun:test';\nscenario('case', () => {});",
              ),
              of(
                'w/i.test.ts',
                "import { scenario } from './harness';\nscenario('case', () => {});",
              ),
              of('w/j.spec.js', 'export default { at: Date.now() };'),
              of('w/k.spec.js', 'export default { ...base };'),
              of('w/l.spec.js', 'export default { [key]: 1 };'),
              of('w/m.spec.js', 'export default { title: `${name}` };'),
              of('w/n.spec.js', "export default { title: 'a' };\nexport const more = 1;"),
              of('w/o.spec.js', 'export default {'),
              of('w/nested/f.test.ts', RUNNER),
              of('loose/g.test.ts', RUNNER),
              // A link: playwright's walk takes none, and the reader follows none.
              of('w/p.test.ts', RUNNER, true),
            ],
          ).map(({ file, by }) => `${file}: ${Option.getOrElse(by, () => 'none')}`),
        ).toEqual([
          'w/a.test.ts: test',
          'w/a_test.tsx: test',
          'w/b.spec.js: test',
          'w/c_spec.mts: test',
          'w/d.test.ts: test',
          'w/h.test.ts: test',
          'w/i.test.ts: test',
          'w/j.spec.js: test',
          'w/k.spec.js: test',
          'w/l.spec.js: test',
          'w/m.spec.js: test',
          'w/n.spec.js: test',
          'w/o.spec.js: test',
          'w/nested/f.test.ts: none',
          'loose/g.test.ts: none',
          'w/p.test.ts: none',
        ]);
        expect(
          reachesIn(
            [
              {
                dir: 'w',
                absolute: '/repo/w',
                scripts: { test: 'bun test src' },
                configs: {},
                gitignores: {},
                bunfig: '',
                wrappers: [],
              },
            ],
            [
              of(
                'w/other/a.test.ts',
                "import { test as scenario } from /* runner */ 'bun:test';\nscenario('case', () => {});",
              ),
            ],
          ).map(({ file, by }) => `${file}: ${Option.getOrElse(by, () => 'none')}`),
        ).toEqual(['w/other/a.test.ts: none']);
      }),
  );

  it.effect('are taken by a bun test that names no filter, a path, or a part of one', () =>
    Effect.sync(() => {
      const files = ['src/a.test.ts', 'lint/b.test.ts', 'other/c.test.ts'];
      expect(reaches({ test: 'bun test' }, files)).toEqual([
        'src/a.test.ts: test',
        'lint/b.test.ts: test',
        'other/c.test.ts: test',
      ]);
      expect(reaches({ test: 'bun test src lint' }, files.slice(0, 3))).toEqual([
        'src/a.test.ts: test',
        'lint/b.test.ts: test',
        'other/c.test.ts: none',
      ]);
      // A part of a path takes a test file anywhere it stands; a path, only under it.
      expect(reaches({ test: 'bun test ./src/' }, ['src/a.test.ts', 'x/src/e.test.ts'])).toEqual([
        'src/a.test.ts: test',
        'x/src/e.test.ts: none',
      ]);
      expect(reaches({ test: 'bun test src' }, ['x/src/e.test.ts'])).toEqual([
        'x/src/e.test.ts: test',
      ]);
      // `./` is the workspace: every file named as a test in it.
      expect(reaches({ test: 'bun test ./' }, ['a.test.ts', 'src/b.test.ts', 'src/c.ts'])).toEqual([
        'a.test.ts: test',
        'src/b.test.ts: test',
      ]);
      // A file named by its path from the workspace.
      expect(
        reaches({ test: 'bun test ./lessons.test.ts' }, ['lessons.test.ts', 'src/lessons.test.ts']),
      ).toEqual(['lessons.test.ts: test', 'src/lessons.test.ts: none']);
    }),
  );

  it.effect("leave out what a flag's value or an ignore pattern names", () =>
    Effect.sync(() => {
      expect(
        reaches({ test: 'bun test --timeout 5000 --preload ./setup.test.ts src' }, [
          'src/a.test.ts',
          'setup.test.ts',
          'lib/5000.test.ts',
        ]),
      ).toEqual(['src/a.test.ts: test', 'setup.test.ts: none', 'lib/5000.test.ts: none']);
      expect(
        reaches({ test: 'bun test --path-ignore-patterns=src/docs.test.ts src' }, [
          'src/docs.test.ts',
          'src/a.test.ts',
        ]),
      ).toEqual(['src/docs.test.ts: none', 'src/a.test.ts: test']);
      expect(
        reaches({ test: 'bun test --path-ignore-patterns "src/**/slow.*" src' }, [
          'src/x/slow.test.ts',
        ]),
      ).toEqual(['src/x/slow.test.ts: none']);
      expect(
        reaches({ test: 'bun --conditions=browser --conditions development test src' }, [
          'src/a.test.ts',
          'development/b.test.ts',
        ]),
      ).toEqual(['src/a.test.ts: test', 'development/b.test.ts: none']);
    }),
  );

  it.effect('follow bun run to the script it runs, and stop at a script already run', () =>
    Effect.sync(() => {
      const scripts = {
        test: 'bun run test:infra && bun run test',
        'test:infra': 'bun test infra',
      };
      expect(reaches(scripts, ['infra/a.test.ts', 'src/b.test.ts'])).toEqual([
        'infra/a.test.ts: test',
        'src/b.test.ts: none',
      ]);
    }),
  );

  it.effect('are reached by no script that runs in another folder than its workspace', () =>
    Effect.sync(() => {
      const files = ['src/a.test.ts', 'other/b.test.ts'];
      const scripts = [
        'cd src && bun test',
        '(cd src && bun test)',
        '{ cd src; bun test; }',
        'pushd src && bun test',
        'bun --cwd src test',
        'bun --cwd=src test',
        'bun test && cd src',
        'bun run inner',
        'env -C src bun test',
        'env --chdir=src bun test',
      ];
      for (const test of scripts)
        expect([test, ...reaches({ test, inner: 'cd src && bun test' }, files)]).toEqual([
          test,
          'src/a.test.ts: none',
          'other/b.test.ts: none',
        ]);
      expect(
        reaches({ test: 'bun test', 'test:e2e': 'cd e2e && bun test' }, ['e2e/c.test.ts']),
      ).toEqual(['e2e/c.test.ts: test']);
      expect(
        reaches({ test: 'bun test src', 'test:e2e': 'cd e2e && bun test' }, ['e2e/c.test.ts']),
      ).toEqual(['e2e/c.test.ts: none']);
    }),
  );

  it.effect(
    'are reached by no bun test run that a flag narrows by what the reader cannot see',
    () =>
      Effect.sync(() => {
        const files = ['src/a.test.ts'];
        for (const test of [
          'bun test --changed src',
          'bun test --changed=main src',
          'bun test --shard=1/2 src',
          'bun test -t fast src',
          'bun test --test-name-pattern=fast src',
          'bun test --only src',
          'bun test --config other.toml src',
          'bun -c=other.toml test src',
          'bun test -tfast src',
          'bun test --list src',
          'bun --silent test src',
        ])
          expect([test, ...reaches({ test }, files)]).toEqual([test, 'src/a.test.ts: none']);
      }),
  );

  it.effect('are reached by no bun test run that changes how bun reads a file', () =>
    Effect.sync(() => {
      const files = ['src/a.test.ts'];
      for (const test of [
        // A text loader reads a test file as a string: it registers no case.
        'bun test --loader=.ts:text --pass-with-no-tests src',
        'bun test -l .ts:text src',
        'bun --loader .ts:text test src',
        'bun test --define it=undefined src',
        'bun -d describe=undefined test src',
        'bun test --tsconfig-override other.json src',
        'bun --env-file .env.test test src',
      ])
        expect([test, ...reaches({ test }, files)]).toEqual([test, 'src/a.test.ts: none']);
      // Conditions and a preload change what a file imports or loads before it, not the file.
      for (const test of ['bun --conditions=browser test src', 'bun test --preload ./setup.ts src'])
        expect([test, ...reaches({ test }, files)]).toEqual([test, 'src/a.test.ts: test']);
    }),
  );

  it.effect(
    'are reached by no bun test run whose bunfig may narrow it or change how bun reads a file, and by one whose bunfig does neither',
    () =>
      Effect.sync(() => {
        const files = ['src/a.test.ts'];
        for (const bunfig of [
          '[test]\nroot = "lib"\n',
          '[test]\npathIgnorePatterns = ["src/**"]\n',
          '[test]\nsomethingNew = 1\n',
          'test = 1\n',
          '[test\n',
          // A text loader reads a test file as a string: it registers no case.
          '[loader]\n".ts" = "text"\n',
          'define = { "describe" = "undefined" }\n',
          '[test]\npreload = ["./setup.ts"]\n[somethingNew]\nx = 1\n',
        ])
          expect([bunfig, ...reaches({ test: 'bun test src' }, files, {}, {}, bunfig)]).toEqual([
            bunfig,
            'src/a.test.ts: none',
          ]);
        expect(
          reaches(
            { test: 'bun test src' },
            files,
            {},
            {},
            '[install]\nexact = true\n[test]\npreload = ["./setup.ts"]\nconcurrentTestGlob = ["**/*.dom.test.ts"]\n',
          ),
        ).toEqual(['src/a.test.ts: test']);
      }),
  );

  it.effect(
    'are reached by no playwright run that a flag or its config narrows by name, line, shard or history, or reads by another tsconfig',
    () =>
      Effect.sync(() => {
        const config = { 'playwright.config.ts': "export default { testDir: 'e2e' };" };
        for (const browser of [
          'playwright test --grep fast',
          'playwright test -g fast',
          'playwright test --grep-invert slow',
          'playwright test --shard=1/2',
          'playwright test --last-failed',
          'playwright test --only-changed',
          'playwright test -gfast',
          'playwright test -Gslow',
          'playwright test --list',
          'playwright test --ui',
          'playwright test --project=chromium',
          // A filter that ends in a line runs only the cases there.
          "playwright test --pass-with-no-tests '.*|:999999'",
          'playwright test b.spec.ts:2',
          'playwright test b.spec.ts:2:5',
          // Another tsconfig may map the config's imports to other modules.
          'playwright test --tsconfig other.json',
        ])
          expect([
            browser,
            ...reaches(
              { test: 'bun test src', 'test:browser': browser },
              ['e2e/b.spec.ts'],
              config,
            ),
          ]).toEqual([browser, 'e2e/b.spec.ts: none']);
        for (const setting of [
          'grep: /fast/',
          'grepInvert: /slow/',
          'shard: { total: 2, current: 1 }',
          "tsconfig: './other.json'",
          'somethingNew: 1',
        ])
          expect([
            setting,
            ...reaches(
              { test: 'bun test src', 'test:browser': 'playwright test' },
              ['e2e/b.spec.ts'],
              {
                'playwright.config.ts': `export default { testDir: 'e2e', ${setting} };`,
              },
            ),
          ]).toEqual([setting, 'e2e/b.spec.ts: none']);
        expect(
          reaches(
            { test: 'bun test src', 'test:browser': 'playwright test' },
            ['e2e/b.spec.ts'],
            config,
          ),
        ).toEqual(['e2e/b.spec.ts: test:browser']);
      }),
  );

  it.effect(
    'are taken by the config the last --config or -c names, and by none for one not read',
    () =>
      Effect.sync(() => {
        const configs = {
          'wide.config.ts': "export default { testDir: '.' };",
          'narrow.config.ts': "export default { testDir: 'narrow' };",
          'playwright.config.ts': "export default { testDir: '.' };",
        };
        const files = ['other/b.spec.ts'];
        for (const { browser, by } of [
          { browser: 'playwright test -c wide.config.ts --config narrow.config.ts', by: 'none' },
          { browser: 'playwright test --config=wide.config.ts -c narrow.config.ts', by: 'none' },
          {
            browser: 'playwright test -c narrow.config.ts --config wide.config.ts',
            by: 'test:browser',
          },
          { browser: 'playwright test --config /repo/w/wide.config.ts', by: 'none' },
          { browser: 'playwright test --config ../w/wide.config.ts', by: 'none' },
          { browser: 'playwright test --config', by: 'none' },
          { browser: 'playwright test', by: 'test:browser' },
        ])
          expect([browser, ...reaches({ 'test:browser': browser }, files, configs)]).toEqual([
            browser,
            `other/b.spec.ts: ${by}`,
          ]);
      }),
  );

  it.effect('are reached by no script whose words the shell expands or redirects', () =>
    Effect.sync(() => {
      const files = ['src/guard/a.test.ts', 'src/guard/b.test.ts', 'other/report.log.test.ts'];
      for (const test of [
        // The glob hands bun two files: the first is the condition's value, not a filter.
        'bun test --conditions ./src/guard/*.test.ts',
        'bun test ./src/guard/?.test.ts',
        'bun test ./src/guard/[ab].test.ts',
        'bun test ./src/{guard,other}',
        'bun test ~/src',
        // A redirection takes its words from the command: bun is handed `src` alone.
        'bun test src > report.log',
        'bun test src >> report.log',
        'bun test src 2>report.log',
        'bun test src < input',
      ])
        expect([test, ...reaches({ test }, files)]).toEqual([
          test,
          'src/guard/a.test.ts: none',
          'src/guard/b.test.ts: none',
          'other/report.log.test.ts: none',
        ]);
      // Quoted, the same characters are the word's.
      expect(reaches({ test: "bun test --path-ignore-patterns 'other/*' src" }, files)).toEqual([
        'src/guard/a.test.ts: test',
        'src/guard/b.test.ts: test',
        'other/report.log.test.ts: none',
      ]);
    }),
  );

  it.effect(
    'are reached by no script that holds a character the shell may read otherwise than the reader',
    () =>
      Effect.sync(() => {
        const files = ['src/a.test.ts', 'lint/b.test.ts'];
        for (const test of [
          // The shell joins the lines, then reads `#` as a comment's start: it runs `true` alone.
          'true \\\n# comment && bun test',
          // None of these splits words for the shell: bun is handed one filter, `src<char>lint`.
          'bun test --pass-with-no-tests src\u00a0lint',
          'bun test src\rlint',
          'bun test src\vlint',
          'bun test src\flint',
          'bun test src lint\u2028',
          "bun test 'src' lint # é",
        ])
          expect([test, ...reaches({ test }, files)]).toEqual([
            test,
            'src/a.test.ts: none',
            'lint/b.test.ts: none',
          ]);
        expect(reaches({ test: 'bun test src\tlint' }, files)).toEqual([
          'src/a.test.ts: test',
          'lint/b.test.ts: test',
        ]);
      }),
  );

  it.effect("are reached by no words of a script's comment", () =>
    Effect.sync(() => {
      expect(
        reaches({ test: 'bun test src # and all' }, ['src/a.test.ts', 'all/c.test.ts']),
      ).toEqual(['src/a.test.ts: test', 'all/c.test.ts: none']);
      expect(
        reaches({ test: 'bun test src # one; bun test all' }, ['src/a.test.ts', 'all/c.test.ts']),
      ).toEqual(['src/a.test.ts: test', 'all/c.test.ts: none']);
    }),
  );

  it.effect(
    'are reached by no script whose commands are joined by anything but && or set a variable',
    () =>
      Effect.sync(() => {
        for (const test of [
          'true || bun test',
          'bun test; true',
          'bun test | tee out.txt',
          'bun test &',
          'false\nbun test',
          'bun test src # all\nbun test',
          'BUN_OPTIONS=-tfast bun test',
          'env BUN_OPTIONS=-tfast bun test',
          'bun run build && CI=1 bun test',
          'exit 0 && bun test',
          'bun test src $EXTRA',
          'bun test `cat filters`',
          "bun test '$literal'",
          'return 0 && bun test',
          'export BUN_OPTIONS=-ttie && bun test',
          'source ./env.sh && bun test',
          'alias bun=true && bun test',
        ])
          expect([test, ...reaches({ test }, ['src/a.test.ts'])]).toEqual([
            test,
            'src/a.test.ts: none',
          ]);
        expect(reaches({ test: 'bun run build && bun test' }, ['src/a.test.ts'])).toEqual([
          'src/a.test.ts: test',
        ]);
      }),
  );

  it.effect('are reached by no script that hands a script it runs more words', () =>
    Effect.sync(() => {
      for (const test of [
        'bun run suite ./src',
        'bun run suite --shard=1/2',
        'bun run suite -- -t x',
      ])
        expect([
          test,
          ...reaches({ test, suite: 'bun test' }, ['src/a.test.ts', 'other/b.test.ts']),
        ]).toEqual([test, 'src/a.test.ts: none', 'other/b.test.ts: none']);
      expect(reaches({ test: 'bun run suite', suite: 'bun test' }, ['other/b.test.ts'])).toEqual([
        'other/b.test.ts: test',
      ]);
    }),
  );

  it.effect(
    'are run by hand by a script of their own: a bun test, a wrapper of it the repo names, or playwright',
    () =>
      Effect.sync(() => {
        const scripts = {
          test: 'bun test src',
          'test:e2e':
            'bun src/fixtures/run-suite.ts --timeout 20000 --preload ./e2e/preload.ts e2e',
          'test:browser': 'bun run build && playwright test --config=test/browser/pw.config.ts',
          'test:docs': 'bun test ./docs.test.ts',
          'test:paths': 'echo ./lib',
          'test:print': 'bun scripts/print.ts ./lib',
        };
        const configs = { 'test/browser/pw.config.ts': "export default { testDir: '.' };" };
        const files = [
          'src/a.test.ts',
          'e2e/b.test.ts',
          'test/browser/c.spec.ts',
          'lib/d.test.ts',
          'docs.test.ts',
        ];
        expect(reaches(scripts, files, configs, {}, '', ['src/fixtures/run-suite.ts'])).toEqual([
          'src/a.test.ts: test',
          'e2e/b.test.ts: test:e2e',
          'test/browser/c.spec.ts: test:browser',
          'lib/d.test.ts: none',
          'docs.test.ts: test:docs',
        ]);
        // A `bun <file>` the repo names no wrapper runs nothing this credits.
        expect(reaches(scripts, ['e2e/b.test.ts'], configs)).toEqual(['e2e/b.test.ts: none']);
      }),
  );

  it.effect.layer(BunServices.layer)(
    "are run by the repo's wrappers of bun test, each a file that spawns bun test with its words",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = path.join(import.meta.dir, '..', '..', '..', '..');
        const { workspaces } = yield* repoTests(root);
        const wrappers = workspaces.flatMap(({ dir, wrappers }) =>
          wrappers.map((file) => `${dir}/${file}`),
        );
        expect(wrappers).toEqual(['packages/film/src/lab/fixtures/run-suite.ts']);
        for (const wrapper of wrappers) {
          const text = yield* fs.readFileString(path.join(root, wrapper));
          expect([wrapper, /process\.execPath,\s*\[\s*'test',\s*\.\.\.args/.test(text)]).toEqual([
            wrapper,
            true,
          ]);
        }
      }),
  );

  it.effect(
    "are taken by playwright as its config's testDir, testMatch and testIgnore set them",
    () =>
      Effect.sync(() => {
        const scripts = { 'test:browser': 'playwright test --config=test/browser/pw.config.ts' };
        const files = ['test/browser/a.spec.ts', 'test/browser/b.test.ts', 'test/c.spec.ts'];
        const config = (text: string) => ({ 'test/browser/pw.config.ts': text });
        // `test` is playwright's command, not a folder: a file outside the config's folder is not taken.
        expect(
          reaches(
            scripts,
            files,
            config("export default { testDir: '.', testMatch: /\\.spec\\.ts$/ };"),
          ),
        ).toEqual([
          'test/browser/a.spec.ts: test:browser',
          'test/browser/b.test.ts: none',
          'test/c.spec.ts: none',
        ]);
        // No testMatch: playwright's own, a `.spec` or `.test` file.
        expect(reaches(scripts, files, config('export default {};'))).toEqual([
          'test/browser/a.spec.ts: test:browser',
          'test/browser/b.test.ts: test:browser',
          'test/c.spec.ts: none',
        ]);
        // A filter takes only the files whose path it matches.
        expect(
          reaches(
            { 'test:browser': 'bunx playwright test -c test/browser/pw.config.ts b\\.test' },
            files,
            config('export default {};'),
          ),
        ).toEqual([
          'test/browser/a.spec.ts: none',
          'test/browser/b.test.ts: test:browser',
          'test/c.spec.ts: none',
        ]);
        // A file its testIgnore names is not taken, by a glob (read as playwright reads one:
        // any folder before it, any case, minimatch's extglobs) or a regex, its key bare or quoted.
        // A regex is of the absolute path, as playwright tests it.
        for (const ignore of [
          "testIgnore: '**/a.spec.ts'",
          "testIgnore: 'A.spec.ts'",
          "testIgnore: '*.@(spec|xyz).ts'",
          '"testIgnore": /a\\.spec/',
          "'testIgnore': '**/a.spec.ts'",
          'testIgnore: /\\/test\\/browser\\/a\\.spec\\.ts$/',
          'testIgnore: /^\\/repo\\/w\\/test\\/browser\\/a/',
        ])
          for (const text of [
            `export default { ${ignore} };`,
            // A setting in a comment, or of another object, sets nothing.
            `import { defineConfig } from '@playwright/test';\n// testIgnore: '**/b.test.ts'\nconst other = { testIgnore: '**/b.test.ts' };\nexport default defineConfig({ ${ignore} });`,
            `import { devices, defineConfig } from 'playwright/test';\nexport default defineConfig({ ${ignore} });`,
            // A config that reads only what it binds, the language's plain values and process.env.
            `import { defineConfig, devices } from '@playwright/test';\nconst port = Number(process.env['P'] ?? 3187);\nexport default defineConfig({ ${ignore}, use: { ...devices['Desktop Chrome'], url: \`http://x:\${String(port)}\` } });`,
          ])
            expect(reaches(scripts, files, config(text))).toEqual([
              'test/browser/a.spec.ts: none',
              'test/browser/b.test.ts: test:browser',
              'test/c.spec.ts: none',
            ]);
        // A regex anchored at a path from the workspace matches no absolute path, in playwright too.
        expect(
          reaches(scripts, files, config('export default { testMatch: /^test\\/browser\\// };')),
        ).toEqual([
          'test/browser/a.spec.ts: none',
          'test/browser/b.test.ts: none',
          'test/c.spec.ts: none',
        ]);
        // A config it cannot read, or none, takes nothing.
        for (const configs of [
          config('export default { testDir: here };'),
          config("export default { testIgnore: ['**/a.spec.ts'] };"),
          config("const testIgnore = '**/a.spec.ts';\nexport default { testIgnore };"),
          config('export default { projects: [] };'),
          config("export default { 'projects': [] };"),
          config("export default { ...base, testDir: '.' };"),
          config("const key = 'testDir';\nexport default { [key]: 'elsewhere' };"),
          config("const config = { testDir: '.' };\nexport default config;"),
          config("export default defineConfig(base, { testDir: '.' });"),
          // A defineConfig that may not be playwright's may set anything.
          config("export default defineConfig({ testDir: '.' });"),
          config(
            "function defineConfig(c) { return { ...c, testIgnore: '**/b.test.ts' }; }\nexport default defineConfig({ testDir: '.' });",
          ),
          config(
            "import { defineConfig } from './helpers';\nexport default defineConfig({ testDir: '.' });",
          ),
          config(
            "import { devices as defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: '.' });",
          ),
          config(
            "import { defineConfig as define } from '@playwright/test';\nexport default define({ testDir: '.' });",
          ),
          config(
            "import { defineConfig } from '@playwright/test';\nconst { wrap: defineConfig2 } = helpers;\nexport default defineConfig({ testDir: '.' });",
          ),
          config('export default { testDir: '),
          // A config that can change what it exports, or run code the reader does not follow.
          config("export default { testDir: '.' };\nmodule.exports = { testDir: 'narrow' };"),
          config("const set = (module.exports = { testDir: 'narrow' });\nexport default {};"),
          config("const set = (exports.default = { testDir: 'narrow' });\nexport default {};"),
          config('const set = Object.assign(globalThis, {});\nexport default {};'),
          config("const set = require('./narrow');\nexport default {};"),
          config('const set = (() => 1)();\nexport default {};'),
          config('const set = process.exit(0);\nexport default {};'),
          config('const set = this;\nexport default {};'),
          config('const set = import.meta;\nexport default {};'),
          config("const set = import('./narrow');\nexport default {};"),
          config('let set = 1;\nexport default {};'),
          config("import { narrow } from './helpers';\nexport default {};"),
          config('if (true) {}\nexport default {};'),
          config("export default { testDir: '.', use: { get x() { return 1; } } };"),
          config("export default { testDir: '.', use: { x: delete process.env.A } };"),
          // A call it does not name may run anything: here, end the run before it starts.
          config("const stopped = Number.constructor('process.exit(0)')();\nexport default {};"),
          // A name of the language the config binds is any value: here, a call of it ends the run.
          config(
            "import { defineConfig } from '@playwright/test';\nconst Number = defineConfig.constructor;\nconst String = Number('process.exit(0)');\nconst stopped = String();\nexport default defineConfig({});",
          ),
          config("import { devices as Number } from '@playwright/test';\nexport default {};"),
          config('const undefined = 1;\nexport default {};'),
          config('const process = { env: {} };\nexport default {};'),
          // An absolute testDir is outside the workspace's paths.
          config("export default { testDir: '/elsewhere' };"),
          config("export default { testDir: '/repo/w/test/browser' };"),
          config('const convert = Number;\nexport default {};'),
          config('const set = new Number(1);\nexport default {};'),
          config('const set = String.raw`x`;\nexport default {};'),
          config(
            "import { devices } from '@playwright/test';\nconst set = devices['Desktop Chrome'].constructor('x');\nexport default {};",
          ),
          config(
            "import { defineConfig, devices } from './helpers';\nconst set = defineConfig({});\nexport default {};",
          ),
          {},
        ])
          expect(reaches(scripts, files, configs).map((line) => line.endsWith(': none'))).toEqual([
            true,
            true,
            true,
          ]);
        // Where playwright respects git's ignore rules (the config says so, or sets neither
        // respectGitIgnore nor testDir), it reads each .gitignore from its testDir down, by
        // minimatch: a file one ignores is not taken.
        const walk = (text: string, gitignores: Record<string, string>) =>
          reaches(scripts, files, config(text), gitignores);
        const spec = (a: string, b: string) => [
          `test/browser/a.spec.ts: ${a}`,
          `test/browser/b.test.ts: ${b}`,
          'test/c.spec.ts: none',
        ];
        const on = "export default { testDir: '.', respectGitIgnore: true };";
        expect(walk(on, { 'test/browser': 'a.spec.ts' })).toEqual(spec('none', 'test:browser'));
        expect(
          walk('export default { testMatch: /\\.ts$/ };', { 'test/browser': 'a.spec.ts' }),
        ).toEqual(spec('none', 'test:browser'));
        // An extglob git reads as a name, playwright as minimatch does.
        expect(walk(on, { 'test/browser': '*.@(spec|xyz).ts' })).toEqual(
          spec('none', 'test:browser'),
        );
        // An empty testDir is none: the config's folder, git's rules on by default.
        expect(walk("export default { testDir: '' };", { 'test/browser': 'a.spec.ts' })).toEqual(
          spec('none', 'test:browser'),
        );
        // A later negation takes a file back; a comment and a blank line set nothing.
        expect(walk(on, { 'test/browser': '# all\n\n*.ts\n!b.test.ts' })).toEqual(
          spec('none', 'test:browser'),
        );
        // A .gitignore above the testDir is not read; one in a folder above the file is.
        expect(walk(on, { '': 'a.spec.ts' })).toEqual(spec('test:browser', 'test:browser'));
        expect(
          walk("export default { testDir: '..', respectGitIgnore: true };", { test: 'browser/' }),
        ).toEqual(spec('none', 'none'));
        // With the rules off, nothing a .gitignore says counts.
        for (const text of [
          "export default { testDir: '.' };",
          'export default { respectGitIgnore: false };',
        ])
          expect(walk(text, { 'test/browser': 'a.spec.ts' })).toEqual(
            spec('test:browser', 'test:browser'),
          );
        expect(walk('export default { respectGitIgnore: flag };', {})).toEqual(
          spec('none', 'none'),
        );
        // Playwright enters no node_modules folder.
        expect(reaches(scripts, ['test/browser/node_modules/x/a.spec.ts'], config(on))).toEqual([
          'test/browser/node_modules/x/a.spec.ts: none',
        ]);
        // With no --config, playwright's own name in the workspace's folder.
        expect(
          reaches({ 'test:browser': 'playwright test' }, ['e2e/x.spec.ts'], {
            'playwright.config.ts': "export default { testDir: './e2e' };",
          }),
        ).toEqual(['e2e/x.spec.ts: test:browser']);
      }),
  );

  it.effect.layer(BunServices.layer)(
    'are read by a glob as playwright reads one, with the minimatch playwright bundles',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const fileOf = (name: string) => fileURLToPath(import.meta.resolve(name));
        const own = yield* Schema.decodeEffect(
          Schema.fromJsonString(Schema.Struct({ version: Schema.String })),
        )(yield* fs.readFileString(fileOf('minimatch/package.json')));
        const core = path.dirname(fileOf('playwright-core/package.json'));
        const notices = yield* fs.readFileString(path.join(core, 'lib', 'utilsBundle.js.LICENSE'));
        expect(/minimatch@[\d.]+/.exec(notices)?.[0]).toBe(`minimatch@${own.version}`);
      }),
  );

  it.effect.layer(BunServices.layer)(
    "are read from the repo on disk: each .gitignore playwright's walk reads, tracked or not, and each file that is a link",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped({ prefix: 'reach-' });
          const write = (file: string, text: string) =>
            Effect.flatMap(
              fs.makeDirectory(path.dirname(path.join(root, file)), { recursive: true }),
              () => fs.writeFileString(path.join(root, file), text),
            );
          yield* write('package.json', '{ "workspaces": ["w"] }');
          yield* write('w/package.json', '{ "scripts": { "test:e2e": "playwright test" } }');
          yield* write('w/playwright.config.ts', 'export default {};');
          yield* write('w/e2e/a.spec.ts', RUNNER);
          yield* write('w/e2e/b.spec.ts', RUNNER);
          yield* write('w/e2e/c.ts', RUNNER);
          yield* fs.symlink('c.ts', path.join(root, 'w/e2e/d.spec.ts'));
          // A .gitignore git ignores and does not track: playwright reads it all the same.
          yield* write('w/e2e/.gitignore', 'a.spec.ts\n');
          const git = (...args: ReadonlyArray<string>) =>
            Effect.flatMap(ChildProcessSpawner, (spawner) =>
              spawner.string(
                ChildProcess.make('git', args, { cwd: root, forceKillAfter: '5 seconds' }),
              ),
            );
          yield* git('init', '-q');
          yield* write('.git/info/exclude', 'w/e2e/.gitignore\n');
          yield* git('add', '-f', 'package.json', 'w');
          yield* git('rm', '-q', '--cached', 'w/e2e/.gitignore');
          const { workspaces, tests } = yield* repoTests(root);
          expect(
            reachesIn(workspaces, tests).map(
              ({ file, by }) => `${file}: ${Option.getOrElse(by, () => 'none')}`,
            ),
          ).toEqual([
            'w/e2e/a.spec.ts: none',
            'w/e2e/b.spec.ts: test:e2e',
            'w/e2e/d.spec.ts: none',
          ]);
        }),
      ),
  );

  it.effect.layer(BunServices.layer)(
    'of every workspace of the repo are each run by its test script or a script of its own',
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const root = path.join(import.meta.dir, '..', '..', '..', '..');
        const { workspaces, tests } = yield* repoTests(root);
        expect(workspaces.length).toBeGreaterThan(5);
        const reached = reachesIn(workspaces, tests);
        expect(reached.length).toBeGreaterThan(400);
        expect(reached.filter(({ by }) => Option.isNone(by)).map(({ file }) => file)).toEqual([]);
      }),
  );
});
