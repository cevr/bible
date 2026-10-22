import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';

import { LintConfig, keptAfter, nativeOnly, passedOf, unkept, withoutJudged } from './config.js';

const config = Schema.decodeSync(LintConfig)({
  $schema: 'schema.json',
  plugins: ['typescript', 'import'],
  jsPlugins: ['oxlint-plugin-effect/plugin', './packages/film/lint/plugin.ts', './judged.ts'],
  rules: {
    'no-await-in-loop': 'error',
    'typescript/no-explicit-any': 'error',
    'import/default': 'error',
    'unicorn/no-null': 'off',
    'effect/noTernary': 'error',
    'judged/historyComment': ['warn', { min: 0.9 }],
  },
  settings: { judged: { store: 'store.json' } },
  ignorePatterns: ['**/dist/**'],
  overrides: [
    {
      files: ['**/core/**'],
      rules: { 'no-restricted-imports': 'error', 'film/hostEvents': 'error' },
    },
    { files: ['**/judged/**'], jsPlugins: ['./judged.ts'], rules: { 'judged/x': 'error' } },
  ],
});

describe("the gate's lint configs", () => {
  test('the native one keeps every key and native rule, and drops each JS plugin and its rules', () => {
    expect(nativeOnly(config)).toEqual({
      $schema: 'schema.json',
      plugins: ['typescript', 'import'],
      jsPlugins: [],
      rules: {
        'no-await-in-loop': 'error',
        'typescript/no-explicit-any': 'error',
        'import/default': 'error',
        'unicorn/no-null': 'off',
      },
      settings: { judged: { store: 'store.json' } },
      ignorePatterns: ['**/dist/**'],
      overrides: [
        {
          files: ['**/core/**'],
          rules: { 'no-restricted-imports': 'error' },
          plugins: [],
          jsPlugins: [],
        },
        { files: ['**/judged/**'], rules: {}, plugins: [], jsPlugins: [] },
      ],
    });
  });

  test('the plugins one drops only the judged plugin and its rules, and makes a path plugin absolute', () => {
    const plugins = withoutJudged(config, './judged.ts', (plugin) => `/repo/${plugin.slice(2)}`);
    expect(plugins.jsPlugins).toEqual([
      'oxlint-plugin-effect/plugin',
      '/repo/packages/film/lint/plugin.ts',
    ]);
    expect(Object.keys(plugins.rules)).toEqual([
      'no-await-in-loop',
      'typescript/no-explicit-any',
      'import/default',
      'unicorn/no-null',
      'effect/noTernary',
    ]);
    expect(plugins.overrides.map((override) => [override.rules, override.jsPlugins])).toEqual([
      [{ 'no-restricted-imports': 'error', 'film/hostEvents': 'error' }, []],
      [{}, []],
    ]);
  });
});

describe('the kept files', () => {
  const hashes = new Map([
    ['a.ts', '1'],
    ['b.ts', '2'],
    ['c.ts', '3'],
  ]);

  test('a file is linted again when its hash or the key changed, or it was never kept', () => {
    const kept = { key: 'k', files: { 'a.ts': '1', 'b.ts': 'old' } };
    expect(unkept(kept, 'k', hashes)).toEqual(['b.ts', 'c.ts']);
    expect(unkept(kept, 'other', hashes)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  test('after a run, the files still kept and those that passed are kept, a gone file is not', () => {
    const kept = { key: 'k', files: { 'a.ts': '1', 'gone.ts': '9' } };
    expect(keptAfter(kept, 'k', hashes, ['c.ts'])).toEqual({
      key: 'k',
      files: { 'a.ts': '1', 'c.ts': '3' },
    });
    expect(keptAfter(kept, 'new', hashes, ['c.ts'])).toEqual({
      key: 'new',
      files: { 'c.ts': '3' },
    });
  });

  test("a part's files pass all on exit 0, all but those its report names on exit 1, none else", () => {
    const part = ['a.ts', 'b.ts', 'c.ts'];
    const report = 'b.ts:3:22: Avoid ternary expressions. [Error/effect(noTernary)]\n\n1 problem\n';
    expect(passedOf(part, 0, '')).toEqual(part);
    expect(passedOf(part, 1, report)).toEqual(['a.ts', 'c.ts']);
    expect(passedOf(part, 1, 'Failed to load plugin\n')).toEqual([]);
    expect(passedOf(part, 2, report)).toEqual([]);
  });
});
