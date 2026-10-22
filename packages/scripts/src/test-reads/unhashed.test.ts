import { describe, expect, test } from 'bun:test';

import { hashedBy, unhashed } from './unhashed.js';

const tasks: Parameters<typeof hashedBy>[0] = [
  {
    taskId: '@bible/app#test',
    directory: 'apps/app',
    inputs: { 'a.test.ts': 'h', '../../docs/page.md': 'h' },
    dependencies: ['@bible/lib#transit'],
  },
  {
    taskId: '@bible/lib#transit',
    directory: 'packages/lib',
    inputs: { 'src/lib.ts': 'h' },
    dependencies: ['@bible/base#transit'],
  },
  {
    taskId: '@bible/base#transit',
    directory: 'packages/base',
    inputs: { 'src/base.ts': 'h' },
    dependencies: [],
  },
  {
    taskId: '@bible/other#test',
    directory: 'packages/other',
    inputs: { 'x.ts': 'h' },
    dependencies: [],
  },
];

describe("the files a workspace's tests read that its test task does not hash", () => {
  test("a test task hashes its own inputs and its dependencies' transit inputs, transitively", () => {
    expect([...hashedBy(tasks, '@bible/app#test')].toSorted()).toEqual([
      'apps/app/a.test.ts',
      'docs/page.md',
      'packages/base/src/base.ts',
      'packages/lib/src/lib.ts',
    ]);
  });

  test('names each read under the root that no input holds, once, and leaves out node_modules, .git and other roots', () => {
    const hashed = hashedBy(tasks, '@bible/app#test');
    expect(
      unhashed(
        '/repo',
        [
          '/repo/packages/lib/src/lib.ts',
          '/repo/.claude/skills/film/CRAFT.md',
          '/repo/.claude/skills/film/CRAFT.md',
          '/repo/packages/other/x.ts',
          '/repo/node_modules/effect/index.js',
          '/repo/apps/app/node_modules/dep/index.js',
          '/repo/.git/HEAD',
          '/tmp/scratch.json',
          '/repository/file.ts',
        ],
        hashed,
      ),
    ).toEqual(['.claude/skills/film/CRAFT.md', 'packages/other/x.ts']);
  });
});
