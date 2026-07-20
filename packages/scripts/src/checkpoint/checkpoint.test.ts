import { describe, expect, it } from 'effect-bun-test';

import { Effect } from 'effect';

import { dynamicImportPattern } from './boundaries.js';
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
  it.effect('distinguishes dynamic imports from methods named import', () =>
    Effect.sync(() => {
      expect(dynamicImportPattern.test("const module = import('./feature.js')")).toBe(true);
      expect(dynamicImportPattern.test('data.dataPortability.import(document)')).toBe(false);
    }),
  );

  it.effect('excludes generated dependency and build trees from architecture inventories', () =>
    Effect.sync(() => {
      expect(isRepositorySourcePath('apps/web/src/App.tsx')).toBe(true);
      expect(isRepositorySourcePath('apps/web/node_modules/.vite/deps/react.js')).toBe(false);
      expect(isRepositorySourcePath('apps/web/dist/assets/index.js')).toBe(false);
    }),
  );

  it.effect('snapshots matching paths, source references, and dependencies structurally', () =>
    Effect.gen(function* () {
      const files = new Map([
        ['packages/cli/src/tui/app.tsx', 'export {}'],
        [
          'packages/cli/src/main.ts',
          "import { InteractiveReader } from './services/interactive-reader.js'",
        ],
      ]);
      const snapshot = yield* snapshotLegacy({
        globFiles: (pattern) =>
          Effect.sync(() => {
            if (pattern.includes('src/tui')) return ['packages/cli/src/tui/app.tsx'];
            if (pattern.includes('packages/cli/src')) return [...files.keys()];
            return [];
          }),
        readText: (path) => Effect.succeed(files.get(path) ?? ''),
        readDependencies: (path) => {
          if (path === 'packages/cli/package.json') {
            return Effect.succeed(new Set(['@opentui/core']));
          }
          return Effect.succeed(new Set<string>());
        },
      });
      const tui = snapshot.categories.find((category) => category.id === 'cli-tui');

      expect(tui?.matches).toContain('packages/cli/src/tui/app.tsx');
      expect(tui?.matches).toContain('packages/cli/src/main.ts');
      expect(tui?.matches).toContain('packages/cli/package.json#@opentui/core');
    }),
  );

  it.effect('blocks a legacy category at its removal checkpoint', () =>
    Effect.sync(() => {
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
    }),
  );

  it.effect('blocks growth beyond the initial baseline', () =>
    Effect.gen(function* () {
      const baseline = emptyBaseline();
      const category = baseline.categories[0];
      if (category === undefined) return yield* Effect.die('test baseline must contain a category');
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
    }),
  );

  it.effect('renders SHA-bound failure evidence', () =>
    Effect.sync(() => {
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
    }),
  );
});
