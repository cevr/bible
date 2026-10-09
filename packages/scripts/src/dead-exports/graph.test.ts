import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { type Workspace, deadExports, recordOf } from './graph.js';

/** A workspace of `sources` (path → text): specifiers are relative, roots and test code as given. */
const workspaceOf = (
  sources: Readonly<Record<string, string>>,
  options: {
    readonly roots: ReadonlyArray<string>;
    readonly tests?: RegExp;
    /** The files whose exports are checked; default: every file that is no test. */
    readonly checked?: RegExp;
  },
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
    checked: (file) =>
      !(options.tests ?? /\.test\.ts$/).test(file) && (options.checked?.test(file) ?? true),
    roots: new Set(options.roots),
  };
};

describe('the dead-export check', () => {
  test('an export another module takes is alive; one nothing takes is dead (the red control)', () => {
    const found = deadExports(
      workspaceOf(
        {
          'a.ts': 'export const used = 1; export const unused = 2;',
          'b.ts': "import { used } from './a.ts'; export const top = used;",
          'c.ts': "import { top } from './b.ts'; console.log(top);",
        },
        { roots: ['c.ts'] },
      ),
    );
    expect(found).toEqual(['a.ts unused']);
  });

  test("a module's own use, and a test's, keep nothing alive", () => {
    const found = deadExports(
      workspaceOf(
        {
          'a.ts': 'export const helper = 1; export const twice = () => helper + helper;',
          'a.test.ts': "import { helper, twice } from './a.ts'; twice(); helper;",
        },
        { roots: ['a.test.ts'] },
      ),
    );
    expect(found).toEqual(['a.ts helper', 'a.ts twice']);
  });

  test("a public entry's exports are checked like any module's, and a name passed through `export *` is taken from the module", () => {
    const found = deadExports(
      workspaceOf(
        {
          'index.ts': "export * from './a.ts'; export const api = 1;",
          'a.ts': 'export const passed = 1; export const alone = 2;',
          'app.ts': "import { passed } from './index.ts'; console.log(passed);",
        },
        { roots: ['app.ts'] },
      ),
    );
    expect(found).toEqual(['a.ts alone', 'index.ts api']);
  });

  test('a re-export passes a take through only when its own name is taken', () => {
    const found = deadExports(
      workspaceOf(
        {
          'm.ts': 'export const x = 1; export const y = 2; export const z = 3;',
          'index.ts': "export { x, y } from './m.ts'; export { z as zed } from './m.ts';",
          'app.ts': "import { x, zed } from './index.ts'; console.log(x, zed);",
        },
        { roots: ['app.ts'] },
      ),
    );
    expect(found).toEqual(['index.ts y', 'm.ts y']);
  });

  test('a namespace re-export takes its module whole once its own name is taken', () => {
    const found = deadExports(
      workspaceOf(
        {
          'm.ts': 'export const x = 1;',
          'n.ts': 'export const y = 1;',
          'index.ts': "export * as m from './m.ts'; export * as n from './n.ts';",
          'app.ts': "import { m } from './index.ts'; console.log(m);",
        },
        { roots: ['app.ts'] },
      ),
    );
    expect(found).toEqual(['index.ts n', 'n.ts y']);
  });

  test('an import the module only exports again takes only what its export name passes on', () => {
    const found = deadExports(
      workspaceOf(
        {
          'm.ts':
            'export const used = 1; export const unused = 2; export const renamed = 3; export const whole = 4;',
          'n.ts': 'export const inside = 1;',
          'd.ts': 'export default 1;',
          'index.ts': [
            "import { used, unused, renamed as alias } from './m.ts';",
            "import * as ns from './n.ts';",
            "import d from './d.ts';",
            'export { unused, alias as again, ns };',
            'export default d;',
            'export const api = used;',
          ].join('\n'),
          'app.ts': "import { api, again } from './index.ts'; console.log(api, again);",
        },
        { roots: ['app.ts'] },
      ),
    );
    expect(found).toEqual([
      'd.ts default',
      'index.ts default',
      'index.ts ns',
      'index.ts unused',
      'm.ts unused',
      'm.ts whole',
      'n.ts inside',
    ]);
  });

  test('an import the module both uses and exports again is taken by the use', () => {
    const found = deadExports(
      workspaceOf(
        {
          'm.ts': 'export const shared = 1; export type Shape = { readonly n: number };',
          'index.ts': [
            "import { shared, type Shape } from './m.ts';",
            'export { shared, type Shape };',
            'export const api = (shape: Shape) => shared + shape.n;',
          ].join('\n'),
          'app.ts': "import { api } from './index.ts'; console.log(api);",
        },
        { roots: ['app.ts'] },
      ),
    );
    expect(found).toEqual(['index.ts Shape', 'index.ts shared']);
  });

  test('two modules that take each other, with no root reaching them, are dead', () => {
    const found = deadExports(
      workspaceOf(
        {
          'live.ts': 'export const shared = 1; export const used = 2;',
          'app.ts': "import { used } from './live.ts'; console.log(used);",
          'a.ts':
            "import { b } from './b.ts'; import { shared } from './live.ts'; export const a = () => b + shared;",
          'b.ts': "import { a } from './a.ts'; export const b = () => a;",
        },
        { roots: ['app.ts'] },
      ),
    );
    expect(found).toEqual(['a.ts a', 'b.ts b', 'live.ts shared']);
  });

  test("what a root outside the checked source re-exports is taken: the page loads the root's exports", () => {
    const found = deadExports(
      workspaceOf(
        {
          'src/m.ts': 'export const page = 1; export const other = 2;',
          'app/page.server.ts': "export { page as default } from '../src/m.ts';",
        },
        { roots: ['app/page.server.ts'], checked: /^src\// },
      ),
    );
    expect(found).toEqual(['src/m.ts other']);
  });

  test('a module reached from a root through a chain stays alive', () => {
    const found = deadExports(
      workspaceOf(
        {
          'app.ts': "import { one } from './one.ts'; console.log(one);",
          'one.ts': "import { two } from './two.ts'; export const one = two;",
          'two.ts': "import { three } from './three.ts'; export const two = three;",
          'three.ts': 'export const three = 3;',
        },
        { roots: ['app.ts'] },
      ),
    );
    expect(found).toEqual([]);
  });

  test('a default export is dead unless a default import takes it', () => {
    const found = deadExports(
      workspaceOf(
        {
          'a.ts': 'export default 1;',
          'b.ts': 'export default 2;',
          'c.ts': "import two from './b.ts'; console.log(two);",
          'd.ts': 'const three = 3; export { three as default };',
          'e.ts': "export { default } from './d.ts';",
          'f.ts': "import three from './e.ts'; console.log(three);",
        },
        { roots: ['c.ts', 'f.ts'] },
      ),
    );
    expect(found).toEqual(['a.ts default']);
  });

  test('a namespace import and an import() take a module whole', () => {
    const found = deadExports(
      workspaceOf(
        {
          'a.ts': 'export const one = 1; export default 2;',
          'b.ts': 'export const two = 2;',
          'main.ts':
            "import * as a from './a.ts'; const b = await import('./b.ts'); console.log(a, b);",
        },
        { roots: ['main.ts'] },
      ),
    );
    expect(found).toEqual([]);
  });

  test('a comment or a string that looks like an import takes nothing', () => {
    const found = deadExports(
      workspaceOf(
        {
          'a.ts': 'export const named = 1;',
          'b.ts':
            "// import { named } from './a.ts'\nconst s = \"import { named } from './a.ts'\"; console.log(s);",
        },
        { roots: ['b.ts'] },
      ),
    );
    expect(found).toEqual(['a.ts named']);
  });
});
