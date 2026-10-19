import { describe, expect, test } from 'bun:test';

import { declarations, listedFiles, uncovered } from './coverage.js';

describe("the files a tsconfig's program leaves out", () => {
  test('names each TypeScript file outside the program, sorted', () => {
    const files = ['src/b.ts', 'src/a.test.ts', 'src/in.ts', 'src/deep/c.tsx'];
    expect(uncovered(files, ['src/in.ts'])).toEqual([
      'src/a.test.ts',
      'src/b.ts',
      'src/deep/c.tsx',
    ]);
  });

  test('a package the program holds whole leaves nothing out', () => {
    const files = ['src/a.ts', 'src/a.test.ts'];
    expect(uncovered(files, ['../../node_modules/lib.d.ts', ...files])).toEqual([]);
  });

  test('files that are not TypeScript, and installed packages, are not asked for', () => {
    const files = ['README.md', 'src/data.json', 'node_modules/effect/src/Effect.ts', 'src/x.ts'];
    expect(uncovered(files, [])).toEqual(['src/x.ts']);
  });

  test('every TypeScript extension counts, a declaration file included', () => {
    const typescript = ['a.cts', 'a.d.ts', 'a.mts', 'a.ts', 'a.tsx'];
    expect(uncovered([...typescript, 'a.js', 'a.json', 'a.ts.md', 'ts'], [])).toEqual(typescript);
  });

  test("tsc's listing is read a path a line, blank lines dropped", () => {
    expect(listedFiles('/r/a.ts\n\n  /r/b.ts \n')).toEqual(['/r/a.ts', '/r/b.ts']);
  });
});

/** Program files that tsc spells as the disk does. */
const asOnDisk = (files: ReadonlyArray<string>) =>
  files.map((file) => ({ spelled: `/r/${file}`, disk: file }));

describe('declaration files', () => {
  test("each form of TypeScript's rule outside installed packages is named, sorted", () => {
    const named = ['a.d.css.ts', 'a.d.cts', 'a.d.json.ts', 'a.d.mts', 'a.d.ts'];
    const not = [
      'a.D.ts',
      'a.d.TS',
      'a.d.Mts',
      'a.dd.ts',
      'a.data.ts',
      'dir.d.css/ordinary.ts',
      'node_modules/x/y.d.css.ts',
    ];
    expect(declarations(asOnDisk([...not, ...named]))).toEqual(named);
  });

  test("the rule reads tsc's spelling, and the disk's names the file and places it", () => {
    const program = [
      { spelled: '/r/src/foo.d.ts', disk: 'src/foo.d.TS' },
      { spelled: '/PKG/src/bar.d.ts', disk: 'src/bar.d.tſ' },
      { spelled: '/r/src/baz.ts', disk: 'src/baz.d.ts' },
      { spelled: '/r/node_modules/x/y.d.ts', disk: 'src/y.d.ts' },
      { spelled: '/r/src/z.d.ts', disk: '../other/src/z.d.ts' },
      { spelled: '/r/src/w.d.ts', disk: 'node_modules/w/index.d.ts' },
      { spelled: '/r/src/FOO.d.ts', disk: 'src/foo.d.TS' },
    ];
    expect(declarations(program)).toEqual(['src/bar.d.tſ', 'src/foo.d.TS', 'src/y.d.ts']);
  });
});
