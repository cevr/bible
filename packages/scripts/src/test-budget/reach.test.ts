import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { fileURLToPath } from 'node:url';
import { reachesIn, repoTests } from './reach.ts';

/** A test file's text: one that imports its runner. */
const RUNNER = "import { test } from 'bun:test';\n";

/**
 * How `scripts` (a workspace at `w`, `/repo/w`, its playwright configs
 * `configs`, its `.gitignore` texts by folder `gitignores`) reach each of
 * `files` (paths from `w`), as `<file>: <script>`, or `none`.
 */
const reaches = (
  scripts: Record<string, string>,
  files: ReadonlyArray<string>,
  configs: Record<string, string> = {},
  gitignores: Record<string, string> = {},
) =>
  reachesIn(
    [{ dir: 'w', absolute: '/repo/w', scripts, configs, gitignores }],
    files.map((file) => ({ file: `w/${file}`, text: RUNNER })),
  ).map(({ file, by }) => `${file.slice(2)}: ${Option.getOrElse(by, () => 'none')}`);

describe("a workspace's test files", () => {
  it.effect('are each a file named as a test that is not data, in the deepest workspace', () =>
    Effect.sync(() => {
      const test = { test: 'bun test' };
      const of = (file: string, text: string) => ({ file, text });
      expect(
        reachesIn(
          [
            { dir: 'w', absolute: '/repo/w', scripts: test, configs: {}, gitignores: {} },
            {
              dir: 'w/nested',
              absolute: '/repo/w/nested',
              scripts: {},
              configs: {},
              gitignores: {},
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
            of('w/i.test.ts', "import { scenario } from './harness';\nscenario('case', () => {});"),
            of('w/j.spec.js', 'export default { at: Date.now() };'),
            of('w/k.spec.js', 'export default { ...base };'),
            of('w/l.spec.js', 'export default { [key]: 1 };'),
            of('w/m.spec.js', 'export default { title: `${name}` };'),
            of('w/n.spec.js', "export default { title: 'a' };\nexport const more = 1;"),
            of('w/o.spec.js', 'export default {'),
            of('w/nested/f.test.ts', RUNNER),
            of('loose/g.test.ts', RUNNER),
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

  it.effect('are named by hand by a script of their own, by a path to them', () =>
    Effect.sync(() => {
      const scripts = {
        test: 'bun test src',
        'test:e2e': 'bun src/fixtures/run-suite.ts --timeout 20000 --preload ./e2e/preload.ts e2e',
        'test:browser': 'bun run build && playwright test --config=test/browser/pw.config.ts',
        'test:docs': 'bun test ./docs.test.ts',
      };
      const configs = { 'test/browser/pw.config.ts': "export default { testDir: '.' };" };
      expect(
        reaches(
          scripts,
          [
            'src/a.test.ts',
            'e2e/b.test.ts',
            'test/browser/c.spec.ts',
            'lib/d.test.ts',
            'docs.test.ts',
          ],
          configs,
        ),
      ).toEqual([
        'src/a.test.ts: test',
        'e2e/b.test.ts: test:e2e',
        'test/browser/c.spec.ts: test:browser',
        'lib/d.test.ts: none',
        'docs.test.ts: test:docs',
      ]);
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
            `// testIgnore: '**/b.test.ts'\nconst other = { testIgnore: '**/b.test.ts' };\nexport default defineConfig({ ${ignore} });`,
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
          config('export default { testDir: '),
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
