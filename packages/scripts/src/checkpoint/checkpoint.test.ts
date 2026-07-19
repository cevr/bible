import { describe, expect, test } from 'bun:test';

import { isRepositorySourcePath, snapshotLegacy, validateLegacySnapshot } from './legacy.js';
import type { RemovalBaseline } from './model.js';
import { renderCheckpointReport } from './report.js';

const emptyBaseline = (): RemovalBaseline => ({
  schemaVersion: 1,
  categories: [
    {
      id: 'cli-tui',
      title: 'CLI TUI and interactive reader',
      removalCheckpoint: 'foundation',
      matches: [],
    },
  ],
});

describe('architecture checkpoint', () => {
  test('excludes generated dependency and build trees from architecture inventories', () => {
    expect(isRepositorySourcePath('apps/web/src/App.tsx')).toBe(true);
    expect(isRepositorySourcePath('apps/web/node_modules/.vite/deps/react.js')).toBe(false);
    expect(isRepositorySourcePath('apps/web/dist/assets/index.js')).toBe(false);
  });

  test('snapshots matching paths, source references, and dependencies structurally', async () => {
    const files = new Map([
      ['packages/cli/src/tui/app.tsx', 'export {}'],
      [
        'packages/cli/src/main.ts',
        "import { InteractiveReader } from './services/interactive-reader.js'",
      ],
    ]);
    const snapshot = await snapshotLegacy({
      globFiles: async (pattern) => {
        if (pattern.includes('src/tui')) return ['packages/cli/src/tui/app.tsx'];
        if (pattern.includes('packages/cli/src')) return [...files.keys()];
        return [];
      },
      readText: async (path) => files.get(path) ?? '',
      readDependencies: async (path) =>
        path === 'packages/cli/package.json' ? new Set(['@opentui/core']) : new Set(),
    });
    const tui = snapshot.categories.find((category) => category.id === 'cli-tui');

    expect(tui?.matches).toContain('packages/cli/src/tui/app.tsx');
    expect(tui?.matches).toContain('packages/cli/src/main.ts');
    expect(tui?.matches).toContain('packages/cli/package.json#@opentui/core');
  });

  test('blocks a legacy category at its removal checkpoint', () => {
    const baseline: RemovalBaseline = {
      schemaVersion: 1,
      categories: [
        {
          id: 'cli-tui',
          title: 'CLI TUI and interactive reader',
          removalCheckpoint: 'foundation',
          matches: ['packages/cli/src/tui/app.tsx'],
        },
      ],
    };

    expect(validateLegacySnapshot('initial', baseline, baseline)).toEqual([]);
    expect(validateLegacySnapshot('foundation', baseline, baseline)).toEqual([
      'CLI TUI and interactive reader must be absent by foundation: packages/cli/src/tui/app.tsx',
    ]);
  });

  test('blocks growth beyond the initial baseline', () => {
    const baseline = emptyBaseline();
    const category = baseline.categories[0];
    if (category === undefined) throw new Error('test baseline must contain a category');
    const current: RemovalBaseline = {
      schemaVersion: 1,
      categories: [
        {
          ...category,
          matches: ['packages/cli/src/tui/new.tsx'],
        },
      ],
    };

    expect(validateLegacySnapshot('initial', baseline, current)).toContain(
      'CLI TUI and interactive reader grew from 0 to 1 targets',
    );
  });

  test('renders SHA-bound failure evidence', () => {
    const report = renderCheckpointReport({
      checkpoint: 'initial',
      reviewedCommit: 'abc123',
      generatedAt: '2026-07-19T00:00:00.000Z',
      checks: [{ name: 'imports', status: 'fail', details: ['bad import'] }],
      commands: [{ command: ['bun', 'run', 'gate'], exitCode: 1 }],
      currentLegacy: emptyBaseline(),
      status: 'FAIL',
      repositoryRoot: '/repo',
    });

    expect(report).toContain('Reviewed commit: `abc123`');
    expect(report).toContain('FAIL — imports');
    expect(report).toContain('bun run gate` — FAIL (1)');
  });
});
