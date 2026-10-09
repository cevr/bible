import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { type Workspace, deadExports, recordOf } from './graph.js';

/** A workspace of `sources` (path → text): specifiers are relative, entries and test code as given. */
const workspaceOf = (
  sources: Readonly<Record<string, string>>,
  options: { readonly entries?: ReadonlyArray<string>; readonly tests?: RegExp } = {},
): Workspace => {
  const records = new Map(
    Object.entries(sources).map(([file, text]) => [file, recordOf(file, text)]),
  );
  return {
    records,
    resolve: (user, from) => {
      const base = new URL(from, `file:///${user}`).pathname.slice(1);
      return Option.fromNullishOr(
        [base, `${base}.ts`, `${base}/index.ts`].find((candidate) => records.has(candidate)),
      );
    },
    consumes: (file) => !(options.tests ?? /\.test\.ts$/).test(file),
    checked: (file) => !(options.tests ?? /\.test\.ts$/).test(file),
    entries: new Map((options.entries ?? []).map((file) => [file, 'a public entry'])),
  };
};

describe('the dead-export check', () => {
  test('an export another module takes is alive; one nothing takes is dead (the red control)', () => {
    const found = deadExports(
      workspaceOf({
        'a.ts': 'export const used = 1; export const unused = 2;',
        'b.ts': "import { used } from './a.ts'; export const top = used;",
        'c.ts': "import { top } from './b.ts'; console.log(top);",
      }),
    );
    expect(found).toEqual(['a.ts unused']);
  });

  test("a module's own use, and a test's, keep nothing alive", () => {
    const found = deadExports(
      workspaceOf({
        'a.ts': 'export const helper = 1; export const twice = () => helper + helper;',
        'a.test.ts': "import { helper, twice } from './a.ts'; twice(); helper;",
      }),
    );
    expect(found).toEqual(['a.ts helper', 'a.ts twice']);
  });

  test("a public entry's exports stand, and a name passed through `export *` is taken from the module", () => {
    const found = deadExports(
      workspaceOf(
        {
          'index.ts': "export * from './a.ts'; export const api = 1;",
          'a.ts': 'export const passed = 1; export const alone = 2;',
          'app.ts': "import { passed } from './index.ts'; console.log(passed);",
        },
        { entries: ['index.ts'] },
      ),
    );
    expect(found).toEqual(['a.ts alone']);
  });

  test("a namespace import and an import() take a module whole; a default export is its loader's", () => {
    const found = deadExports(
      workspaceOf({
        'a.ts': 'export const one = 1; export default 2;',
        'b.ts': 'export const two = 2;',
        'main.ts':
          "import * as a from './a.ts'; const b = await import('./b.ts'); console.log(a, b);",
      }),
    );
    expect(found).toEqual([]);
  });

  test('a comment or a string that looks like an import takes nothing', () => {
    const found = deadExports(
      workspaceOf({
        'a.ts': 'export const named = 1;',
        'b.ts':
          "// import { named } from './a.ts'\nconst s = \"import { named } from './a.ts'\"; console.log(s);",
      }),
    );
    expect(found).toEqual(['a.ts named']);
  });
});
