import { describe, expect, test } from 'bun:test';

import { typecheckedBy } from './workspaces.js';

const workspaces = [
  { dir: 'packages/core', name: '@bible/core' },
  { dir: 'packages/film', name: '@bible/film' },
  { dir: 'packages/filmstrip', name: '@bible/filmstrip' },
  { dir: 'apps/selah', name: '@bible/selah' },
];

describe("a commit's typecheck", () => {
  test('covers each workspace a staged script, declaration or JSON file lies in', () => {
    expect(
      typecheckedBy(
        ['packages/film/src/a.ts', 'packages/film/tsconfig.json', 'packages/core/src/b.tsx'],
        workspaces,
      ),
    ).toEqual(['@bible/core', '@bible/film']);
  });

  test('leaves out a workspace whose staged files no typecheck reads, and a folder named like another', () => {
    expect(typecheckedBy(['packages/film/README.md', 'packages/filmstrip.ts'], workspaces)).toEqual(
      [],
    );
    expect(typecheckedBy(['docs/lessons.md', '.oxlintrc.json'], workspaces)).toEqual([]);
  });

  test('covers every workspace but Selah when a root file every workspace reads is staged', () => {
    for (const root of ['tsconfig.json', 'package.json', 'bun.lock', 'bunfig.toml', 'turbo.json']) {
      expect(typecheckedBy([root], workspaces)).toEqual([
        '@bible/core',
        '@bible/film',
        '@bible/filmstrip',
      ]);
    }
  });

  test('never covers Selah, whose typecheck is a Swift compile', () => {
    expect(typecheckedBy(['apps/selah/Package.json', 'apps/selah/x.ts'], workspaces)).toEqual([]);
  });
});
